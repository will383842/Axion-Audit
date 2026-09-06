// =============================================================================
// SERVICE DU PILOTAGE — deux lectures composées, aucune écriture, aucun journal.
// Lot L7, incrément L7b.
//
// ── CE QUE CE SERVICE DÉCIDE, ET C'EST TOUT ─────────────────────────────────
// Le `404` quand la mission n'existe pas ou n'est pas partagée avec le demandeur,
// et l'injection de l'horodatage `calculeLe`. Le reste vit ailleurs : le SQL dans
// le dépôt, les règles dans deux fonctions PURES (`couverture.ts`,
// `agregation.ts`). C'est le même partage que `plan-entretiens/service.ts`.
//
// ── LE PRÉVU VIENT DU PLAN DE L3, IL N'EST PAS RECALCULÉ ────────────────────
// `etablirLaCouverture` APPELLE `etablirLePlanDEntretiens` — le service du lot L3,
// tel quel. C'est la mise en œuvre littérale de la consigne : « la couverture se
// confronte au plan d'entretiens, elle ne se recalcule pas dans son coin ». Le
// prix est une lecture de mission de plus ; le bénéfice est qu'aucun amendement du
// §32.4 ne peut faire diverger l'écran de couverture du plan qu'il affiche.
//
// ── AUCUN JOURNAL, ET C'EST UNE RÈGLE ───────────────────────────────────────
// Le pilotage recopie des NOMS D'UNITÉS, des EFFECTIFS et des RÉPONSES D'AUDIT du
// client. Les journaliser déverserait des données du client dans `activity_log`,
// qui garantit de n'en contenir aucune (11 §2) — même raison que pour le plan
// (`DECISIONS.md` 2026-09-02) et que pour le rapport d'import.
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E14
// (consolidation, divergences, radar) · E22 (console de pilotage 7 espaces).
// =============================================================================
import {
  AppError,
  maintenantUtc,
  type AgregationMission,
  type AgregationQuery,
  type CouvertureMission,
  type PaginationQuery,
} from '@axion/shared';
import { db } from '../../db.js';
import { listerUnitesDeMission } from '../org-units/depot.js';
import { lireUnitesPourPlan } from '../plan-entretiens/depot.js';
import { etablirLePlanDEntretiens } from '../plan-entretiens/service.js';
import { calculerCouverture } from './couverture.js';
import { assemblerAgregation } from './agregation.js';
import {
  compterSessionsParUnite,
  compterTotauxAgregation,
  listerBlocs,
  listerBlocsTouches,
  listerQuestionsFigees,
  listerReponsesDesQuestions,
  lireMissionPourPilotage,
  type DemandeurDePilotage,
} from './depot.js';

/**
 * Le même message que partout ailleurs, et il couvre AUSSI le non-membre.
 *
 * `DECISIONS.md` 2026-09-02 : refusé sur le rôle (crochet) → 403 ; refusé sur
 * l'appartenance (dépôt) → 404, l'existence de la mission n'étant pas divulguée.
 * Un message différent pour « elle existe mais pas pour vous » rétablirait
 * exactement l'oracle que le 404 ferme.
 */
const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

/**
 * `GET /v1/missions/:id/coverage` — la couverture par unité ET par source (§27.1).
 *
 * Cinq lectures, puis une fonction pure. Rien n'est mémorisé : la couverture n'est
 * pas persistée, et deux appels successifs ne diffèrent que par `calculeLe`.
 *
 * ⚠ **`toutesLesUnites` exclut les unités FUSIONNÉES**, exactement comme la liste
 * paginée de l'arbre. Une unité fusionnée n'est plus un nœud : ses sessions ont été
 * re-rattachées à sa cible, et les compter des deux côtés ferait apparaître une
 * couverture deux fois meilleure qu'elle ne l'est. Rien n'est supprimé pour autant
 * (invariant 7) : la ligne survit en base avec son `merged_into_id`.
 */
export async function etablirLaCouverture(
  missionId: string,
  demandeur: DemandeurDePilotage,
  pagination: PaginationQuery,
): Promise<CouvertureMission> {
  const mission = await lireMissionPourPilotage(db, missionId, demandeur);
  if (mission === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

  const plan = await etablirLePlanDEntretiens(missionId, demandeur);
  const page = await listerUnitesDeMission(missionId, pagination);
  const toutes = await lireUnitesPourPlan(db, missionId);
  const comptes = await compterSessionsParUnite(db, missionId);
  const blocsTouches = await listerBlocsTouches(db, missionId);

  return calculerCouverture({
    plan,
    toutesLesUnites: toutes.filter((unite) => unite.status !== 'fusionnee'),
    unitesDeLaPage: page.items,
    comptes,
    blocsTouches,
    blocsActifs: mission.blocsActifs,
    timezone: mission.timezone,
    calculeLe: maintenantUtc(),
    nextCursor: page.nextCursor,
  });
}

/**
 * `GET /v1/missions/:id/aggregation` — les réponses par question (M5.1, §27.4).
 *
 * Les blocs proposés au filtre sont les blocs ACTIFS de la mission : offrir les
 * neuf du référentiel là où la mission n'en a activé que quatre proposerait des
 * filtres qui ne rendraient jamais rien. Si `active_blocks` est vide — une mission
 * dont le périmètre n'est pas encore posé — on rend le référentiel entier plutôt
 * qu'une liste vide, pour que le sélecteur ne soit pas muet.
 */
export async function etablirLAgregation(
  missionId: string,
  demandeur: DemandeurDePilotage,
  requete: AgregationQuery,
): Promise<AgregationMission> {
  const mission = await lireMissionPourPilotage(db, missionId, demandeur);
  if (mission === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

  const filtre = { block: requete.block, orgUnit: requete.orgUnit };
  const tousLesBlocs = await listerBlocs(db);
  const actifs = new Set(mission.blocsActifs);
  const blocs = actifs.size === 0 ? tousLesBlocs : tousLesBlocs.filter((b) => actifs.has(b.code));

  const page = await listerQuestionsFigees(db, missionId, filtre, {
    limit: requete.limit,
    ...(requete.after === undefined ? {} : { after: requete.after }),
  });
  const reponses = await listerReponsesDesQuestions(
    db,
    missionId,
    page.items.map((question) => question.missionQuestionId),
    filtre,
  );
  const totaux = await compterTotauxAgregation(db, missionId, filtre);

  return assemblerAgregation({
    missionId,
    timezone: mission.timezone,
    calculeLe: maintenantUtc(),
    blocs,
    filtre,
    questions: page.items,
    reponses,
    nextCursor: page.nextCursor,
    totaux,
  });
}
