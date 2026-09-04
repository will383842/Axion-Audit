// =============================================================================
// SERVICE DU PLAN D'ENTRETIENS — trois lectures, une fonction pure, aucun écrit.
// Lot L3, incrément L3d, tâche T5.
//
// ── POURQUOI CE FICHIER EXISTE (il n'était pas au découpage du brief) ───────
// Le brief L3D confie à T5 un dépôt « lecture seule » et à T6 des routes qui « ne
// décident rien ». Or **deux décisions** doivent se prendre entre les deux : le
// `404` quand la mission n'existe pas ou n'est pas partagée avec le demandeur, et
// l'injection de l'horodatage `genereLe`. Les mettre dans la route ferait décider
// la route ; les mettre dans le dépôt ferait lever une `AppError` à une couche qui
// ne connaît que des lignes. Ce service tient les deux, et rien d'autre — c'est le
// même partage que `domaines/missions/service.ts`.
//
// ── L'HORODATAGE EST FOURNI, JAMAIS LU PAR LE GÉNÉRATEUR ────────────────────
// `genererPlan` est une fonction PURE : deux appels sur les mêmes données rendent
// le même plan, comparable par `toEqual` strict. C'est vrai parce que `genereLe`
// lui est PASSÉ. C'est ici, à la frontière du monde, que l'horloge est lue une
// seule fois — `maintenantUtc()` (11 §3 : ISO 8601 UTC).
//
// ── AUCUN JOURNAL, ET C'EST UNE RÈGLE, PAS UN OUBLI ─────────────────────────
// Le plan recopie des NOMS D'UNITÉS et des EFFECTIFS du client. Le journaliser
// déverserait des données du client dans `activity_log` (11 §2), qui garantit de
// n'en contenir aucune — même raison que « le rapport d'import ne se journalise
// jamais » (`DECISIONS.md` 2026-08-29), confirmée le 2026-09-02.
//
// Traçabilité : E25 (zéro oubli : plan d'entretiens, couverture) · E40 (règles
// d'échantillonnage §32.4) · E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import { AppError, maintenantUtc } from '@axion/shared';
import { db } from '../../db.js';
import { genererPlan, type PlanEntretiens } from './generateur.js';
import {
  lireMissionPourPlan,
  lireProfilsPourPlan,
  lireUnitesPourPlan,
  type DemandeurDuPlan,
} from './depot.js';

/**
 * Le même message que partout ailleurs, et il couvre AUSSI le non-membre.
 *
 * `DECISIONS.md` 2026-09-02 : « refusé sur le rôle (crochet) → 403 ; refusé sur
 * l'appartenance (dépôt) → 404, l'existence de la mission n'est pas divulguée ».
 * Un message différent pour « elle existe mais pas pour vous » rétablirait
 * exactement l'oracle que le 404 ferme.
 */
const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

/**
 * `GET /v1/missions/:id/interview-plan` — le plan §32.4, calculé à la demande.
 *
 * Trois lectures séquentielles (mission, unités, profils), puis la fonction pure.
 * Rien n'est mémorisé : le plan n'est pas persisté, et deux appels successifs ne
 * diffèrent que par `genereLe`.
 */
export async function etablirLePlanDEntretiens(
  missionId: string,
  demandeur: DemandeurDuPlan,
): Promise<PlanEntretiens> {
  const mission = await lireMissionPourPlan(db, missionId, demandeur);
  if (mission === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

  const unites = await lireUnitesPourPlan(db, missionId);
  const profils = await lireProfilsPourPlan(db);

  return genererPlan({ mission, unites, profils, genereLe: maintenantUtc() });
}
