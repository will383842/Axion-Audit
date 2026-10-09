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
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
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
 * Le PLAFOND de la page : `now() - marge`, lu à l'horloge de la base (dans la
 * transaction du pull, `now()` est son début). Une ligne plus récente ne descend
 * pas encore : une transaction de push encore ouverte peut valider une ligne
 * horodatée SOUS elle, et le curseur l'aurait déjà dépassée (revue A17). La marge
 * excède la durée maximale d'un lot de push, d'où la garantie.
 */
export async function lirePlafond(ex: ExecuteurSql, margeMs: number): Promise<string> {
  const resultat = await ex.execute<{ plafond: string }>(
    sql`SELECT to_char((now() - ${margeMs} * interval '1 millisecond') AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS plafond`,
  );
  const [ligne] = resultat.rows;
  if (ligne === undefined) throw new Error('horloge de la base illisible');
  return ligne.plafond;
}

/**
 * Les `limite` plus petits curseurs de CHAQUE entité horodatée de la mission, dans
 * `]depuis, plafond]`. Leur fusion donne la borne haute de la page.
 */
export async function lireCurseursCandidats(
  ex: ExecuteurSql,
  missionId: string,
  depuis: string | null,
  plafond: string,
  limite: number,
): Promise<string[]> {
  const lots = [
    await ex
      .select({ c: curseurDe(missions.updatedAt) })
      .from(missions)
      .where(and(eq(missions.id, missionId), ...fenetre(missions.updatedAt, depuis, plafond)))
      .orderBy(asc(missions.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(orgUnits.updatedAt) })
      .from(orgUnits)
      .where(
        and(eq(orgUnits.missionId, missionId), ...fenetre(orgUnits.updatedAt, depuis, plafond)),
      )
      .orderBy(asc(orgUnits.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(interviews.updatedAt) })
      .from(interviews)
      .where(
        and(eq(interviews.missionId, missionId), ...fenetre(interviews.updatedAt, depuis, plafond)),
      )
      .orderBy(asc(interviews.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(answers.updatedAt) })
      .from(answers)
      .innerJoin(interviews, eq(interviews.id, answers.interviewId))
      .where(
        and(eq(interviews.missionId, missionId), ...fenetre(answers.updatedAt, depuis, plafond)),
      )
      .orderBy(asc(answers.updatedAt))
      .limit(limite),
    await ex
      .select({ c: curseurDe(attachments.updatedAt) })
      .from(attachments)
      .where(
        and(
          eq(attachments.missionId, missionId),
          ...fenetre(attachments.updatedAt, depuis, plafond),
        ),
      )
      .orderBy(asc(attachments.updatedAt))
      .limit(limite),
  ];
  return lots.flatMap((lot) => lot.map((l) => l.c));
}

// -----------------------------------------------------------------------------
// PROJECTIONS FERMÉES — revue A17. Chaque entité descend selon une liste
// EXPLICITE de colonnes : une colonne ajoutée demain au 04 ne descend pas sans
// décision. `storageKey` ne descend jamais (MinIO n'est jamais exposé, 11 §2) ;
// `personEmail` d'une session ne descend qu'à son propriétaire (minimisation, 06).
// -----------------------------------------------------------------------------

/** `missions` : ce que le terrain affiche et range, rien du commercial ni du siège. */
const COLONNES_MISSION = {
  id: missions.id,
  companyId: missions.companyId,
  title: missions.title,
  timezone: missions.timezone,
  auditLevel: missions.auditLevel,
  geoScope: missions.geoScope,
  countryCode: missions.countryCode,
  startPlanned: missions.startPlanned,
  endPlanned: missions.endPlanned,
  status: missions.status,
  updatedAt: missions.updatedAt,
  deletedAt: missions.deletedAt,
};

const COLONNES_UNITE = {
  id: orgUnits.id,
  missionId: orgUnits.missionId,
  parentId: orgUnits.parentId,
  kind: orgUnits.kind,
  name: orgUnits.name,
  countryCode: orgUnits.countryCode,
  timezone: orgUnits.timezone,
  headcount: orgUnits.headcount,
  serviceRefId: orgUnits.serviceRefId,
  sectorId: orgUnits.sectorId,
  inScope: orgUnits.inScope,
  status: orgUnits.status,
  proposedBy: orgUnits.proposedBy,
  mergedIntoId: orgUnits.mergedIntoId,
  position: orgUnits.position,
  createdAt: orgUnits.createdAt,
  updatedAt: orgUnits.updatedAt,
};

/** `personEmail` est calculé par ligne : NULL dès que l'émetteur n'est pas le propriétaire. */
function colonnesSession(emetteurId: string) {
  return {
    id: interviews.id,
    missionId: interviews.missionId,
    conductedBy: interviews.conductedBy,
    kind: interviews.kind,
    mode: interviews.mode,
    linkedReviewAnswerId: interviews.linkedReviewAnswerId,
    personName: interviews.personName,
    personRole: interviews.personRole,
    personServiceId: interviews.personServiceId,
    personEmail: sql<string | null>`CASE WHEN ${interviews.conductedBy} = ${emetteurId}::uuid
                                         THEN ${interviews.personEmail} ELSE NULL END`,
    interlocutorProfileId: interviews.interlocutorProfileId,
    participants: interviews.participants,
    orgUnitId: interviews.orgUnitId,
    documentRequestId: interviews.documentRequestId,
    consentGiven: interviews.consentGiven,
    consentAudio: interviews.consentAudio,
    consentedAt: interviews.consentedAt,
    informationNoticeVersion: interviews.informationNoticeVersion,
    noticeShownAt: interviews.noticeShownAt,
    scheduledAt: interviews.scheduledAt,
    scheduledDurationMin: interviews.scheduledDurationMin,
    scheduleStatus: interviews.scheduleStatus,
    status: interviews.status,
    startedAt: interviews.startedAt,
    endedAt: interviews.endedAt,
    generalNotes: interviews.generalNotes,
    clientCreatedAt: interviews.clientCreatedAt,
    clientUpdatedAt: interviews.clientUpdatedAt,
    syncedAt: interviews.syncedAt,
    createdAt: interviews.createdAt,
    updatedAt: interviews.updatedAt,
  };
}

const COLONNES_REPONSE = {
  id: answers.id,
  interviewId: answers.interviewId,
  missionQuestionId: answers.missionQuestionId,
  value: answers.value,
  source: answers.source,
  withheld: answers.withheld,
  withheldReason: answers.withheldReason,
  horsParcours: answers.horsParcours,
  note: answers.note,
  flagReview: answers.flagReview,
  reviewReason: answers.reviewReason,
  notApplicable: answers.notApplicable,
  naReason: answers.naReason,
  questionTextSnapshot: answers.questionTextSnapshot,
  revision: answers.revision,
  clientCreatedAt: answers.clientCreatedAt,
  clientUpdatedAt: answers.clientUpdatedAt,
  syncedAt: answers.syncedAt,
  createdAt: answers.createdAt,
  updatedAt: answers.updatedAt,
};

/** Les métadonnées d'une pièce, SANS `storageKey` : les octets passent par l'API (L6c). */
const COLONNES_PIECE = {
  id: attachments.id,
  interviewId: attachments.interviewId,
  answerId: attachments.answerId,
  missionId: attachments.missionId,
  kind: attachments.kind,
  content: attachments.content,
  filename: attachments.filename,
  mime: attachments.mime,
  sizeBytes: attachments.sizeBytes,
  transcription: attachments.transcription,
  purgeAfter: attachments.purgeAfter,
  clientCreatedAt: attachments.clientCreatedAt,
  clientUpdatedAt: attachments.clientUpdatedAt,
  createdBy: attachments.createdBy,
  syncedAt: attachments.syncedAt,
  createdAt: attachments.createdAt,
  updatedAt: attachments.updatedAt,
};

const COLONNES_QUESTION_DE_MISSION = {
  id: missionQuestions.id,
  missionId: missionQuestions.missionId,
  questionId: missionQuestions.questionId,
  questionVersion: missionQuestions.questionVersion,
  textSnapshot: missionQuestions.textSnapshot,
  optionsSnapshot: missionQuestions.optionsSnapshot,
  weightSnapshot: missionQuestions.weightSnapshot,
  scoringSnapshot: missionQuestions.scoringSnapshot,
  guidanceSnapshot: missionQuestions.guidanceSnapshot,
  answerTypeSnapshot: missionQuestions.answerTypeSnapshot,
  criticalitySnapshot: missionQuestions.criticalitySnapshot,
  allowRangeSnapshot: missionQuestions.allowRangeSnapshot,
  position: missionQuestions.position,
  addedAdHoc: missionQuestions.addedAdHoc,
};

const COLONNES_AFFECTATION = {
  id: workAssignments.id,
  missionId: workAssignments.missionId,
  userId: workAssignments.userId,
  orgUnitId: workAssignments.orgUnitId,
  plannedInterviews: workAssignments.plannedInterviews,
  plannedDays: workAssignments.plannedDays,
  dateFrom: workAssignments.dateFrom,
  dateTo: workAssignments.dateTo,
};

export interface LignesDescendantes {
  readonly mission: unknown[];
  readonly org_unit: unknown[];
  readonly interview: unknown[];
  readonly answer: unknown[];
  readonly attachment_meta: unknown[];
}

/**
 * Les lignes horodatées de la mission dans `]depuis, jusqua]`, triées par
 * `updated_at` puis `id`, chacune réduite à sa projection fermée. La borne haute
 * est INCLUSIVE : un groupe d'horodatage égal n'est jamais coupé entre deux pages.
 */
export async function lireLignesHorodatees(
  ex: ExecuteurSql,
  missionId: string,
  emetteurId: string,
  depuis: string | null,
  jusqua: string,
): Promise<LignesDescendantes> {
  const [mission, org_unit, interview, answer, attachment_meta] = [
    await ex
      .select(COLONNES_MISSION)
      .from(missions)
      .where(and(eq(missions.id, missionId), ...fenetre(missions.updatedAt, depuis, jusqua))),
    await ex
      .select(COLONNES_UNITE)
      .from(orgUnits)
      .where(and(eq(orgUnits.missionId, missionId), ...fenetre(orgUnits.updatedAt, depuis, jusqua)))
      .orderBy(asc(orgUnits.updatedAt), asc(orgUnits.id)),
    await ex
      .select(colonnesSession(emetteurId))
      .from(interviews)
      .where(
        and(eq(interviews.missionId, missionId), ...fenetre(interviews.updatedAt, depuis, jusqua)),
      )
      .orderBy(asc(interviews.updatedAt), asc(interviews.id)),
    await ex
      .select(COLONNES_REPONSE)
      .from(answers)
      .innerJoin(interviews, eq(interviews.id, answers.interviewId))
      .where(
        and(eq(interviews.missionId, missionId), ...fenetre(answers.updatedAt, depuis, jusqua)),
      )
      .orderBy(asc(answers.updatedAt), asc(answers.id)),
    await ex
      .select(COLONNES_PIECE)
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
  readonly mission_question: unknown[];
  readonly work_assignment: unknown[];
}> {
  const [mission_question, work_assignment] = [
    await ex
      .select(COLONNES_QUESTION_DE_MISSION)
      .from(missionQuestions)
      .where(eq(missionQuestions.missionId, missionId))
      .orderBy(asc(missionQuestions.position), asc(missionQuestions.id)),
    await ex
      .select(COLONNES_AFFECTATION)
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

// -----------------------------------------------------------------------------
// L'HORLOGE ET LES DÉLAIS DU LOT DE PUSH — revue A17
// -----------------------------------------------------------------------------

/**
 * L'heure de la BASE au début de la transaction du lot (`now()`) : tous les
 * `updated_at` du lot la partagent. C'est elle, et non l'heure de l'application,
 * que le plafond du pull compare — une seule horloge pour écrire et pour lire.
 */
export async function lireHorlogeDuLot(ex: ExecuteurSql): Promise<Date> {
  const resultat = await ex.execute<{ maintenant: Date | string }>(sql`SELECT now() AS maintenant`);
  const [ligne] = resultat.rows;
  if (ligne === undefined) throw new Error('horloge de la base illisible');
  return new Date(ligne.maintenant);
}

/**
 * Borne chaque instruction ET chaque attente de verrou du lot à `dureeMs`, pour la
 * seule transaction en cours (`set_config(…, true)` = `SET LOCAL`, paramétré).
 */
export async function bornerLaTransaction(ex: ExecuteurSql, dureeMs: number): Promise<void> {
  const valeur = `${String(Math.max(1, Math.floor(dureeMs)))}ms`;
  await ex.execute(
    sql`SELECT set_config('statement_timeout', ${valeur}, true),
               set_config('lock_timeout', ${valeur}, true)`,
  );
}
