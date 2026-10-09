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
import { and, asc, eq, getTableColumns, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
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
  workAssignments,
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

// =============================================================================
// LA DESCENTE — lot L6, incrément L6b (`GET /v1/sync/pull`, 05 §9.5, 11 §4)
// =============================================================================
//
// LE CURSEUR NE PASSE JAMAIS PAR UNE `Date` JS : `updated_at` porte la
// microseconde (`now()`), une `Date` la tronque à la milliseconde, et un curseur
// tronqué redescendrait à l'infini les lignes de sa dernière milliseconde. Il est
// donc lu en TEXTE, formé par PostgreSQL, et rendu tel quel au terrain ; il revient
// en paramètre lié et repasse en `timestamptz` côté base. Ce format fixe se trie
// comme l'instant qu'il représente.
//
// Toutes les lectures sont cadrées par la mission EN BASE (jamais par la charge) ;
// `scoping_financials` n'est lu nulle part ici (invariant 3). Les lectures sont
// SÉQUENTIELLES : le client d'une transaction n'admet qu'une requête à la fois.

/** Les entités horodatées : elles portent le curseur et se paginent. */
export type EntiteHorodatee = 'mission' | 'org_unit' | 'interview' | 'answer' | 'attachment_meta';

/** L'`updated_at` en ISO UTC à la microseconde, formé par PostgreSQL. */
function curseurDe(colonne: AnyPgColumn): SQL<string> {
  return sql<string>`to_char(${colonne} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

/** Le cadrage temporel d'une entité : `since < updated_at <= jusqua` (bornes omises si nulles). */
function fenetre(colonne: AnyPgColumn, depuis: string | null, jusqua: string | null): SQL[] {
  const bornes: SQL[] = [];
  if (depuis !== null) bornes.push(sql`${colonne} > ${depuis}::timestamptz`);
  if (jusqua !== null) bornes.push(sql`${colonne} <= ${jusqua}::timestamptz`);
  return bornes;
}

/**
 * Les `limite` plus petits curseurs de CHAQUE entité horodatée de la mission,
 * strictement après `depuis`. Leur fusion donne la borne haute de la page.
 */
export async function lireCurseursCandidats(
  ex: ExecuteurSql,
  missionId: string,
  depuis: string | null,
  limite: number,
): Promise<string[]> {
  const lots = [
    await ex
      .select({ c: curseurDe(missions.updatedAt) })
      .from(missions)
      .where(and(eq(missions.id, missionId), ...fenetre(missions.updatedAt, depuis, null)))
      .orderBy(asc(missions.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(orgUnits.updatedAt) })
      .from(orgUnits)
      .where(and(eq(orgUnits.missionId, missionId), ...fenetre(orgUnits.updatedAt, depuis, null)))
      .orderBy(asc(orgUnits.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(interviews.updatedAt) })
      .from(interviews)
      .where(
        and(eq(interviews.missionId, missionId), ...fenetre(interviews.updatedAt, depuis, null)),
      )
      .orderBy(asc(interviews.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(answers.updatedAt) })
      .from(answers)
      .innerJoin(interviews, eq(interviews.id, answers.interviewId))
      .where(and(eq(interviews.missionId, missionId), ...fenetre(answers.updatedAt, depuis, null)))
      .orderBy(asc(answers.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(attachments.updatedAt) })
      .from(attachments)
      .where(
        and(eq(attachments.missionId, missionId), ...fenetre(attachments.updatedAt, depuis, null)),
      )
      .orderBy(asc(attachments.updatedAt))
      .limit(limite),
  ];
  return lots.flatMap((lot) => lot.map((l) => l.c));
}

export interface LignesDescendantes {
  readonly mission: (typeof missions.$inferSelect)[];
  readonly org_unit: (typeof orgUnits.$inferSelect)[];
  readonly interview: (typeof interviews.$inferSelect)[];
  readonly answer: (typeof answers.$inferSelect)[];
  readonly attachment_meta: (typeof attachments.$inferSelect)[];
}

/**
 * Les lignes horodatées de la mission dans `]depuis, jusqua]`, triées par
 * `updated_at` puis `id`. La borne haute est INCLUSIVE : un groupe d'horodatage
 * égal n'est jamais coupé entre deux pages.
 */
export async function lireLignesHorodatees(
  ex: ExecuteurSql,
  missionId: string,
  depuis: string | null,
  jusqua: string,
): Promise<LignesDescendantes> {
  const [mission, org_unit, interview, answer, attachment_meta] = [
    await ex
      .select()
      .from(missions)
      .where(and(eq(missions.id, missionId), ...fenetre(missions.updatedAt, depuis, jusqua))),
    await ex
      .select()
      .from(orgUnits)
      .where(and(eq(orgUnits.missionId, missionId), ...fenetre(orgUnits.updatedAt, depuis, jusqua)))
      .orderBy(asc(orgUnits.updatedAt), asc(orgUnits.id)),
    await ex
      .select()
      .from(interviews)
      .where(
        and(eq(interviews.missionId, missionId), ...fenetre(interviews.updatedAt, depuis, jusqua)),
      )
      .orderBy(asc(interviews.updatedAt), asc(interviews.id)),
    await ex
      .select(getTableColumns(answers))
      .from(answers)
      .innerJoin(interviews, eq(interviews.id, answers.interviewId))
      .where(
        and(eq(interviews.missionId, missionId), ...fenetre(answers.updatedAt, depuis, jusqua)),
      )
      .orderBy(asc(answers.updatedAt), asc(answers.id)),
    await ex
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.missionId, missionId),
          ...fenetre(attachments.updatedAt, depuis, jusqua),
        ),
      )
      .orderBy(asc(attachments.updatedAt), asc(attachments.id)),
  ];
  return { mission, org_unit, interview, answer, attachment_meta };
}

/**
 * Le questionnaire figé et les affectations de la mission : sans `updated_at` au
 * 04, ils ne descendent qu'au PREMIER pull (05 §9.5, M2.4).
 */
export async function lireReferentielsDeMission(
  ex: ExecuteurSql,
  missionId: string,
): Promise<{
  readonly mission_question: LigneQuestionDeMission[];
  readonly work_assignment: (typeof workAssignments.$inferSelect)[];
}> {
  const [mission_question, work_assignment] = [
    await ex
      .select()
      .from(missionQuestions)
      .where(eq(missionQuestions.missionId, missionId))
      .orderBy(asc(missionQuestions.position), asc(missionQuestions.id)),
    await ex
      .select()
      .from(workAssignments)
      .where(eq(workAssignments.missionId, missionId))
      .orderBy(asc(workAssignments.id)),
  ];
  return { mission_question, work_assignment };
}

export interface LigneJournalPull {
  readonly utilisateurId: string;
  readonly nombreElements: number;
  readonly debut: Date;
  readonly fin: Date;
}

/**
 * Une ligne `pull` par appel ABOUTI. `outbox_remaining` reste NULL : un pull ne
 * connaît pas l'outbox, et un 0 posé ici éteindrait à tort le garde-fou de reset
 * (05 §9.7), qui lit la dernière valeur NON NULLE.
 */
export async function journaliserPull(ex: ExecuteurSql, ligne: LigneJournalPull): Promise<void> {
  await ex.insert(syncLog).values({
    id: uuidv7(),
    userId: ligne.utilisateurId,
    deviceId: null,
    direction: 'pull',
    itemsCount: ligne.nombreElements,
    conflictsCount: 0,
    outboxRemaining: null,
    startedAt: ligne.debut,
    endedAt: ligne.fin,
    status: 'abouti',
    error: null,
  });
}
