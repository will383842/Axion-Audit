// =============================================================================
// DÉPÔT DE LA MONTÉE — lot L6, incrément L6a (`docs/conception/LOT_L6.md` §3ter C.1).
//
// Le SEUL endroit où le push touche la base. Drizzle uniquement, aucun SQL
// concaténé (11 §2). Chaque fonction exige l'exécuteur en premier argument : le
// service les appelle DANS la transaction du lot (une par lot) et dans le point de
// sauvegarde de l'op — il est impossible d'écrire une ligne métier hors de la
// transaction qui consigne `processed_ops`.
//
// Ce que ce fichier NE décide PAS : qui a le droit (proprietaire.ts), ni quel
// résultat rendre (service.ts). Il lit et il écrit, rien d'autre.
//
// Traçabilité : E7, E9 · invariants 1, 3 et 7 · 11 §4 · 04 (processed_ops,
// sync_log, answer_revisions S-4, attachments S-3).
// =============================================================================
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { uuidv7 } from 'uuidv7';
import type { ResultatOp } from '@axion/shared';
import {
  answerRevisions,
  answers,
  attachments,
  blocks,
  documentRequests,
  interviews,
  missionQuestions,
  missionUsers,
  missions,
  orgUnits,
  processedOps,
  questions,
  syncLog,
  type OrigineRevision,
  type RoleSurMission,
} from '../db/schema.js';

type TransactionPg = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** La base, ou une transaction (ou un point de sauvegarde) en cours. */
export type ExecuteurSql = NodePgDatabase | TransactionPg;

export type LigneSession = typeof interviews.$inferSelect;
export type LigneReponse = typeof answers.$inferSelect;
export type LignePiece = typeof attachments.$inferSelect;
export type LigneUnite = typeof orgUnits.$inferSelect;
export type LigneQuestion = typeof questions.$inferSelect;
export type LigneQuestionDeMission = typeof missionQuestions.$inferSelect;

export type InsertionSession = typeof interviews.$inferInsert;
export type InsertionReponse = typeof answers.$inferInsert;
export type InsertionPiece = typeof attachments.$inferInsert;
export type InsertionUnite = typeof orgUnits.$inferInsert;
export type InsertionQuestion = typeof questions.$inferInsert;
export type InsertionQuestionDeMission = typeof missionQuestions.$inferInsert;

// -----------------------------------------------------------------------------
// APPARTENANCE — le cadrage du lot entier
// -----------------------------------------------------------------------------

/**
 * Le rôle de l'utilisateur SUR la mission, ou `null` s'il n'en est pas membre ou
 * si la mission n'existe pas (ou est supprimée) : les deux cas rendent la même
 * réponse, pour ne pas révéler l'existence d'une mission à un non-membre.
 */
export async function lireRoleSurMission(
  ex: ExecuteurSql,
  missionId: string,
  utilisateurId: string,
): Promise<RoleSurMission | null> {
  const lignes = await ex
    .select({ role: missionUsers.roleOnMission })
    .from(missionUsers)
    .innerJoin(missions, eq(missions.id, missionUsers.missionId))
    .where(
      and(
        eq(missionUsers.missionId, missionId),
        eq(missionUsers.userId, utilisateurId),
        isNull(missions.deletedAt),
      ),
    )
    .limit(1)
    // L'appartenance fonde tout le lot : elle tient jusqu'à la fin de la
    // transaction (un retrait de `mission_users` concurrent attend).
    .for('share', { of: missionUsers });
  return lignes[0]?.role ?? null;
}

// -----------------------------------------------------------------------------
// processed_ops — la première ceinture (11 §4)
// -----------------------------------------------------------------------------

export async function opDejaTraitee(ex: ExecuteurSql, opId: string): Promise<boolean> {
  const lignes = await ex
    .select({ opId: processedOps.opId })
    .from(processedOps)
    .where(eq(processedOps.opId, opId))
    .limit(1);
  return lignes.length > 0;
}

export async function consignerOp(
  ex: ExecuteurSql,
  opId: string,
  lotId: string,
  resultat: ResultatOp,
  maintenant: Date,
): Promise<void> {
  await ex
    .insert(processedOps)
    .values({ opId, batchId: lotId, result: resultat, processedAt: maintenant });
}

// -----------------------------------------------------------------------------
// answer_revisions — l'archive de l'invariant 7 (S-4 : trois entités)
// -----------------------------------------------------------------------------

export interface Archive {
  readonly entite: 'answer' | 'interview' | 'attachment';
  readonly entiteId: string;
  readonly valeur: unknown;
  readonly origine: OrigineRevision;
  readonly auteur: string;
  readonly le: Date;
}

export async function archiver(ex: ExecuteurSql, archive: Archive): Promise<void> {
  await ex.insert(answerRevisions).values({
    id: uuidv7(),
    // CHECK de cohérence en base : `answer_id` non nul SI ET SEULEMENT SI answer.
    answerId: archive.entite === 'answer' ? archive.entiteId : null,
    previousValue: archive.valeur,
    changedBy: archive.auteur,
    changedAt: archive.le,
    changeOrigin: archive.origine,
    entityType: archive.entite,
    entityId: archive.entiteId,
  });
}

// -----------------------------------------------------------------------------
// LECTURES DE LIGNES — verrouillées quand le service va peut-être écrire
// -----------------------------------------------------------------------------
/**
 * `update` : la ligne va peut-être être écrite. `share` : elle fonde une DÉCISION
 * (propriété, appartenance) qui doit tenir jusqu'à la fin de la transaction — une
 * réaffectation ou un retrait concurrent attend.
 */
export type Verrou = 'update' | 'share';

// `FOR UPDATE` sérialise deux pushes concurrents sur la même ligne : sans lui, le
// dernier-écrit-gagne comparerait `client_updated_at` à une valeur déjà périmée.

export async function lireSession(
  ex: ExecuteurSql,
  id: string,
  verrou?: Verrou,
): Promise<LigneSession | null> {
  const requete = ex.select().from(interviews).where(eq(interviews.id, id)).limit(1);
  const lignes = verrou === undefined ? await requete : await requete.for(verrou);
  return lignes[0] ?? null;
}

export async function lireReponse(
  ex: ExecuteurSql,
  id: string,
  verrou?: Verrou,
): Promise<LigneReponse | null> {
  const requete = ex.select().from(answers).where(eq(answers.id, id)).limit(1);
  const lignes = verrou === undefined ? await requete : await requete.for(verrou);
  return lignes[0] ?? null;
}

/** La mission d'une réponse, par sa session — `null` si la réponse est inconnue. */
export async function lireMissionDeReponse(ex: ExecuteurSql, id: string): Promise<string | null> {
  const lignes = await ex
    .select({ missionId: interviews.missionId })
    .from(answers)
    .innerJoin(interviews, eq(interviews.id, answers.interviewId))
    .where(eq(answers.id, id))
    .limit(1);
  return lignes[0]?.missionId ?? null;
}

/** La mission d'une demande de document — `null` si elle est inconnue. */
export async function lireMissionDeDemande(ex: ExecuteurSql, id: string): Promise<string | null> {
  const lignes = await ex
    .select({ missionId: documentRequests.missionId })
    .from(documentRequests)
    .where(eq(documentRequests.id, id))
    .limit(1);
  return lignes[0]?.missionId ?? null;
}

/** La réponse déjà posée pour (session, question) — l'UNIQUE du 04. */
export async function lireReponseParCle(
  ex: ExecuteurSql,
  sessionId: string,
  questionDeMissionId: string,
): Promise<{ readonly id: string } | null> {
  const lignes = await ex
    .select({ id: answers.id })
    .from(answers)
    .where(
      and(eq(answers.interviewId, sessionId), eq(answers.missionQuestionId, questionDeMissionId)),
    )
    .limit(1);
  return lignes[0] ?? null;
}

export async function lirePiece(
  ex: ExecuteurSql,
  id: string,
  verrou?: Verrou,
): Promise<LignePiece | null> {
  const requete = ex.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  const lignes = verrou === undefined ? await requete : await requete.for(verrou);
  return lignes[0] ?? null;
}

export async function lireUnite(
  ex: ExecuteurSql,
  id: string,
  verrou?: Verrou,
): Promise<LigneUnite | null> {
  const requete = ex.select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1);
  const lignes = verrou === undefined ? await requete : await requete.for(verrou);
  return lignes[0] ?? null;
}

export async function lireQuestion(
  ex: ExecuteurSql,
  id: string,
  verrou?: Verrou,
): Promise<LigneQuestion | null> {
  const requete = ex.select().from(questions).where(eq(questions.id, id)).limit(1);
  const lignes = verrou === undefined ? await requete : await requete.for(verrou);
  return lignes[0] ?? null;
}

export async function lireQuestionDeMission(
  ex: ExecuteurSql,
  id: string,
  verrou?: Verrou,
): Promise<LigneQuestionDeMission | null> {
  const requete = ex.select().from(missionQuestions).where(eq(missionQuestions.id, id)).limit(1);
  const lignes = verrou === undefined ? await requete : await requete.for(verrou);
  return lignes[0] ?? null;
}

/** H2 : l'id du bloc désigné par son CODE stable, ou `null` s'il est inconnu. */
export async function lireBlocParCode(ex: ExecuteurSql, code: string): Promise<string | null> {
  const lignes = await ex
    .select({ id: blocks.id })
    .from(blocks)
    .where(eq(blocks.code, code))
    .limit(1);
  return lignes[0]?.id ?? null;
}

// -----------------------------------------------------------------------------
// ÉCRITURES — insertion ou mise à jour PAR ID CLIENT (la seconde ceinture)
// -----------------------------------------------------------------------------

export async function insererSession(ex: ExecuteurSql, valeurs: InsertionSession): Promise<void> {
  await ex.insert(interviews).values(valeurs);
}

export async function majSession(
  ex: ExecuteurSql,
  id: string,
  valeurs: Partial<InsertionSession>,
): Promise<void> {
  await ex.update(interviews).set(valeurs).where(eq(interviews.id, id));
}

export async function insererReponse(ex: ExecuteurSql, valeurs: InsertionReponse): Promise<void> {
  await ex.insert(answers).values(valeurs);
}

export async function majReponse(
  ex: ExecuteurSql,
  id: string,
  valeurs: Partial<InsertionReponse>,
): Promise<void> {
  await ex.update(answers).set(valeurs).where(eq(answers.id, id));
}

export async function insererPiece(ex: ExecuteurSql, valeurs: InsertionPiece): Promise<void> {
  await ex.insert(attachments).values(valeurs);
}

export async function majPiece(
  ex: ExecuteurSql,
  id: string,
  valeurs: Partial<InsertionPiece>,
): Promise<void> {
  await ex.update(attachments).set(valeurs).where(eq(attachments.id, id));
}

export async function insererUnite(ex: ExecuteurSql, valeurs: InsertionUnite): Promise<void> {
  await ex.insert(orgUnits).values(valeurs);
}

export async function majUnite(
  ex: ExecuteurSql,
  id: string,
  valeurs: Partial<InsertionUnite>,
): Promise<void> {
  await ex.update(orgUnits).set(valeurs).where(eq(orgUnits.id, id));
}

export async function insererQuestion(ex: ExecuteurSql, valeurs: InsertionQuestion): Promise<void> {
  await ex.insert(questions).values(valeurs);
}

export async function insererQuestionDeMission(
  ex: ExecuteurSql,
  valeurs: InsertionQuestionDeMission,
): Promise<void> {
  await ex.insert(missionQuestions).values(valeurs);
}

// -----------------------------------------------------------------------------
// sync_log — une ligne `push` par lot ABOUTI (amendement A-3)
// -----------------------------------------------------------------------------

export interface LigneJournalPush {
  readonly utilisateurId: string;
  readonly appareilId: string;
  readonly nombreOps: number;
  readonly nombreConflits: number;
  readonly resteOutbox: number;
  readonly debut: Date;
  readonly fin: Date;
}

/**
 * `outbox_remaining` est LA donnée du garde-fou de reset (05 §9.7) : elle est
 * consignée telle que le client la déclare, zéro compris.
 */
export async function journaliserPush(ex: ExecuteurSql, ligne: LigneJournalPush): Promise<void> {
  await ex.insert(syncLog).values({
    id: uuidv7(),
    userId: ligne.utilisateurId,
    deviceId: ligne.appareilId,
    direction: 'push',
    itemsCount: ligne.nombreOps,
    conflictsCount: ligne.nombreConflits,
    outboxRemaining: ligne.resteOutbox,
    startedAt: ligne.debut,
    endedAt: ligne.fin,
    status: 'abouti',
    error: null,
  });
}
