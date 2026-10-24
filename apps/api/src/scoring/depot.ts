// =============================================================================
// DÉPÔT DU SCORING BRANCHÉ — lit l'instantané du moteur, écrit `block_scores` et
// `unit_scores`. Lot L8, incrément S1. 03 §32.1 · 04 (analyse & scoring).
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
//
// ── CE QUE CE DÉPÔT LIT, ET RIEN D'AUTRE ────────────────────────────────────
//   · `mission_questions` (les SNAPSHOTS figés) + `questions.block_id` pour le CODE
//     de bloc — jamais le texte, les poids ou les barèmes de la banque vivante ;
//   · `answers` — la révision COURANTE — jointe à `interviews` (unité de la session
//     et profil de l'interlocuteur → `group_code`). Aucune lecture de l'archive des
//     valeurs écrasées : une réponse corrigée compterait deux fois (invariant 7) ;
//   · `org_units`, `blocks`, et DEUX clés d'`estimation_params` (les seuils du moteur,
//     lues par leur clé — aucune autre ligne de cette table ne transite ici).
// Aucune table de chiffrage n'est touchée : un score ne dépend jamais d'un devis
// (invariant 3).
//
// ── CE QU'IL ÉCRIT ──────────────────────────────────────────────────────────
// `block_scores` (score d'entreprise par bloc, roll-up des racines) et `unit_scores`
// (lecture CONSOLIDÉE du sous-arbre, §32.1-4), en remplaçant l'ancien calcul. Il ne
// décide ni du droit de calculer ni de la transaction : le SERVICE le fait, et passe
// ici l'exécuteur transactionnel.
// Traçabilité : E14 (consolidation, divergences) · E43.
// =============================================================================
import { and, eq, inArray, isNull, max, ne } from 'drizzle-orm';
import { AppError, CLES_PARAMETRES_SCORING } from '@axion/shared';
import type { ParametresScoring } from '@axion/shared';
import {
  answers,
  blockScores,
  blocks,
  estimationParams,
  interlocutorProfiles,
  interviews,
  missionQuestions,
  missionUsers,
  missions,
  orgUnits,
  type RoleSurMission,
  questions,
  unitScores,
} from '../db/schema.js';
import type { ExecuteurSql } from '../domaines/auth/depot.js';
import type { QuestionFigee, ReponseACoter, UnitePourScoring } from './entree.js';

/** Qui demande le calcul (même forme que le pilotage et l'export). */
export interface DemandeurDeCalcul {
  readonly utilisateurId: string;
  readonly estAdmin: boolean;
}

/** La mission, telle que le demandeur a le droit de la voir. */
export interface MissionPourCalcul {
  readonly id: string;
  /** `missions.active_blocks` : les blocs dont la mission rend un score d'entreprise. */
  readonly blocsActifs: readonly string[];
  /** Le rôle du demandeur SUR la mission ; `null` pour un administrateur non rattaché. */
  readonly roleSurMission: RoleSurMission | null;
}

/**
 * La mission, SI le demandeur y a droit. `null` couvre inexistante, supprimée et
 * non partagée — les distinguer ferait de la route un oracle d'existence. L'admin
 * voit toute mission (03 §34.1) ; pour les autres la jointure sur `mission_users`
 * est obligatoire et rend aussi le rôle sur la mission.
 */
export async function lireMissionPourCalcul(
  executeur: ExecuteurSql,
  missionId: string,
  demandeur: DemandeurDeCalcul,
): Promise<MissionPourCalcul | null> {
  const mission = await executeur
    .select({ id: missions.id, activeBlocks: missions.activeBlocks })
    .from(missions)
    .where(and(eq(missions.id, missionId), isNull(missions.deletedAt)))
    .limit(1);
  const ligne = mission[0];
  if (ligne === undefined) return null;

  const rattachement = await executeur
    .select({ role: missionUsers.roleOnMission })
    .from(missionUsers)
    .where(
      and(eq(missionUsers.missionId, missionId), eq(missionUsers.userId, demandeur.utilisateurId)),
    )
    .limit(1);
  const role = rattachement[0]?.role ?? null;
  if (!demandeur.estAdmin && role === null) return null;

  return { id: ligne.id, blocsActifs: codesDeBlocs(ligne.activeBlocks), roleSurMission: role };
}

/** `active_blocks` est un JSONB : on rend ce qui est lisible, on ignore le reste. */
function codesDeBlocs(brut: unknown): readonly string[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter((valeur): valeur is string => typeof valeur === 'string');
}

/**
 * Verrouille la ligne de mission : deux calculs simultanés se SÉRIALISENT (le second
 * attend le commit du premier, puis relit tout). À appeler en premier dans la
 * transaction, avant toute lecture de l'instantané.
 */
export async function verrouillerMission(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<boolean> {
  const lignes = await executeur
    .select({ id: missions.id })
    .from(missions)
    .where(and(eq(missions.id, missionId), isNull(missions.deletedAt)))
    .limit(1)
    .for('update');
  return lignes[0] !== undefined;
}

/** Un bloc du référentiel, dans l'ordre d'affichage. */
export interface BlocReferentiel {
  readonly id: string;
  readonly code: string;
}

/** Tous les blocs, par `position` puis `code` (ordre déterministe). */
export async function listerBlocsReferentiel(
  executeur: ExecuteurSql,
): Promise<readonly BlocReferentiel[]> {
  const lignes = await executeur
    .select({ id: blocks.id, code: blocks.code, position: blocks.position })
    .from(blocks);
  return [...lignes]
    .sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        a.code.localeCompare(b.code),
    )
    .map((bloc) => ({ id: bloc.id, code: bloc.code }));
}

/**
 * Les deux seuils du moteur, lus dans `estimation_params` PAR LEUR CLÉ.
 *
 * Le moteur n'a aucune valeur par défaut (voir `CLES_PARAMETRES_SCORING`) : un seuil
 * absent ou illisible est une base mal amorcée, pas un cas à deviner — on échoue
 * (500) plutôt que de calculer sur un seuil que personne n'a choisi.
 */
export async function lireParametresScoring(executeur: ExecuteurSql): Promise<ParametresScoring> {
  const lignes = await executeur
    .select({ key: estimationParams.key, value: estimationParams.value })
    .from(estimationParams)
    .where(inArray(estimationParams.key, [...CLES_PARAMETRES_SCORING]));
  const parCle = new Map(lignes.map((ligne) => [ligne.key, ligne.value]));
  const lire = (cle: (typeof CLES_PARAMETRES_SCORING)[number]): number => {
    const brut = parCle.get(cle);
    const valeur = brut === null || brut === undefined ? Number.NaN : Number(brut);
    if (!Number.isFinite(valeur)) {
      throw new AppError(
        'INTERNAL_ERROR',
        'Le calcul des scores est impossible : un seuil de scoring est absent de la configuration.',
      );
    }
    return valeur;
  };
  return {
    seuilCompletudeBloc: lire('seuil_completude_bloc'),
    seuilDivergenceEcartType: lire('seuil_divergence_ecart_type'),
  };
}

/** Les unités de l'arbre, hors unités fusionnées (leurs données ont été re-rattachées). */
export async function lireUnitesPourScoring(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly UnitePourScoring[]> {
  const lignes = await executeur
    .select({
      id: orgUnits.id,
      parentId: orgUnits.parentId,
      headcount: orgUnits.headcount,
      inScope: orgUnits.inScope,
    })
    .from(orgUnits)
    .where(and(eq(orgUnits.missionId, missionId), ne(orgUnits.status, 'fusionnee')));
  return lignes;
}

/**
 * Le questionnaire FIGÉ : les snapshots de `mission_questions`, et le code du bloc
 * porté par la question d'origine (le bloc n'est pas un snapshot au 04).
 *
 * Un snapshot manquant n'est pas remplacé par la valeur de la banque : il devient
 * une valeur que le moteur écarte et SIGNALE (poids vide → hors calcul).
 */
export async function lireQuestionsFigees(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly QuestionFigee[]> {
  const lignes = await executeur
    .select({
      id: missionQuestions.id,
      blocCode: blocks.code,
      answerType: missionQuestions.answerTypeSnapshot,
      weight: missionQuestions.weightSnapshot,
      scoring: missionQuestions.scoringSnapshot,
      options: missionQuestions.optionsSnapshot,
      criticality: missionQuestions.criticalitySnapshot,
    })
    .from(missionQuestions)
    .innerJoin(questions, eq(questions.id, missionQuestions.questionId))
    .innerJoin(blocks, eq(blocks.id, questions.blockId))
    .where(eq(missionQuestions.missionId, missionId))
    .orderBy(missionQuestions.position, missionQuestions.id);
  return lignes.map((ligne) => ({
    missionQuestionId: ligne.id,
    blocCode: ligne.blocCode,
    answerType: ligne.answerType ?? '',
    weight: ligne.weight ?? '',
    scoring: ligne.scoring,
    options: ligne.options,
    criticality: ligne.criticality ?? 'important',
  }));
}

/**
 * Les réponses COURANTES de la mission, avec l'unité de leur session et le groupe
 * de l'interlocuteur (`interlocutor_profiles.group_code`, §32.6-4).
 *
 * Le groupe est facultatif : une session sans profil rend `null`, jamais « tous les
 * groupes » (le moteur calcule alors la divergence sans lecture direction/terrain).
 */
export async function lireReponsesPourScoring(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly ReponseACoter[]> {
  const lignes = await executeur
    .select({
      id: answers.id,
      interviewId: answers.interviewId,
      missionQuestionId: answers.missionQuestionId,
      orgUnitId: interviews.orgUnitId,
      value: answers.value,
      withheld: answers.withheld,
      notApplicable: answers.notApplicable,
      groupe: interlocutorProfiles.groupCode,
    })
    .from(answers)
    .innerJoin(interviews, eq(interviews.id, answers.interviewId))
    .leftJoin(interlocutorProfiles, eq(interlocutorProfiles.id, interviews.interlocutorProfileId))
    .where(eq(interviews.missionId, missionId))
    .orderBy(answers.id);
  return lignes.map((ligne) => ({
    id: ligne.id,
    interviewId: ligne.interviewId,
    missionQuestionId: ligne.missionQuestionId,
    orgUnitId: ligne.orgUnitId,
    value: ligne.value,
    withheld: ligne.withheld,
    notApplicable: ligne.notApplicable,
    groupeInterlocuteur: ligne.groupe,
  }));
}

/** Date du calcul actuellement persisté (le plus récent), ou `null` s'il n'y en a pas. */
export async function lireDernierCalcul(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<Date | null> {
  const lignes = await executeur
    .select({ dernier: max(blockScores.computedAt) })
    .from(blockScores)
    .where(eq(blockScores.missionId, missionId));
  return lignes[0]?.dernier ?? null;
}

/** Une ligne `block_scores` prête à écrire. */
export interface LigneBlocAEcrire {
  readonly blockId: string;
  readonly score: string | null;
  readonly completeness: string | null;
  readonly isIndicative: boolean;
  readonly details: Record<string, unknown>;
}

/** Une ligne `unit_scores` prête à écrire. */
export interface LigneUniteAEcrire {
  readonly orgUnitId: string;
  readonly blockId: string;
  readonly score: string | null;
  readonly answersCount: number;
  readonly completeness: string | null;
}

const TAILLE_LOT_INSERTION = 500;

/**
 * REMPLACE le calcul de la mission : DELETE puis INSERT, dans la transaction de
 * l'appelant (le service). Rien n'est mis à jour sur place — un calcul est un tout.
 */
export async function remplacerLesScores(
  executeur: ExecuteurSql,
  missionId: string,
  calculeLe: Date,
  lignesBlocs: readonly LigneBlocAEcrire[],
  lignesUnites: readonly LigneUniteAEcrire[],
): Promise<void> {
  await executeur.delete(unitScores).where(eq(unitScores.missionId, missionId));
  await executeur.delete(blockScores).where(eq(blockScores.missionId, missionId));

  for (let debut = 0; debut < lignesBlocs.length; debut += TAILLE_LOT_INSERTION) {
    await executeur.insert(blockScores).values(
      lignesBlocs.slice(debut, debut + TAILLE_LOT_INSERTION).map((ligne) => ({
        missionId,
        blockId: ligne.blockId,
        score: ligne.score,
        computedAt: calculeLe,
        details: ligne.details,
        completeness: ligne.completeness,
        isIndicative: ligne.isIndicative,
      })),
    );
  }
  for (let debut = 0; debut < lignesUnites.length; debut += TAILLE_LOT_INSERTION) {
    await executeur.insert(unitScores).values(
      lignesUnites.slice(debut, debut + TAILLE_LOT_INSERTION).map((ligne) => ({
        missionId,
        orgUnitId: ligne.orgUnitId,
        blockId: ligne.blockId,
        score: ligne.score,
        answersCount: ligne.answersCount,
        completeness: ligne.completeness,
        computedAt: calculeLe,
      })),
    );
  }
}
