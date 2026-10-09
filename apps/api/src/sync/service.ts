// =============================================================================
// SERVICE DE LA MONTÉE — `POST /v1/sync/push`, contrat 05 §9.3 (V2.2/V2.9).
// Lot L6, incrément L6a (`docs/conception/LOT_L6.md` §3ter C.1).
//
// ── CE QUE CE FICHIER GARANTIT ──────────────────────────────────────────────
//   1. UNE transaction par lot (11 §4). Le cadrage (appartenance à la mission) est
//      lu DEDANS : un retrait de `mission_users` concurrent ne passe pas entre les
//      deux.
//   2. Chaque op vit dans un POINT DE SAUVEGARDE. Une op refusée (`forbidden`) ou
//      en échec (`error`) est ANNULÉE en entier — zéro écriture partielle, même si
//      un résolveur avait déjà commencé à écrire. Les ops voisines ne sont pas
//      emportées : le contrat §9.3 est une réponse PAR op.
//   3. Les deux ceintures d'idempotence du 11 §4 : `processed_ops` (op_id déjà vu →
//      `duplicate`, rien n'est relu ni réécrit) et l'upsert PAR `entityId`.
//   4. `processed_ops` ne consigne que les ops qui ont EU UN EFFET (`applied`,
//      `superseded`). `error` est rejouable (PD4) : le consigner ferait rendre
//      `duplicate` au rejeu, et la donnée sortirait de l'outbox sans avoir été
//      écrite. `forbidden` n'a rien écrit : le rejeu le réévalue, sans effet.
//   5. Dernier-écrit-gagne PAR LIGNE sur `client_updated_at` (§9.4) pour les trois
//      entités qui le portent ; la valeur PERDANTE est archivée (`sync_arbitrage`)
//      et la valeur ÉCRASÉE aussi (`terrain`) — invariant 7, S-4.
//   6. Le serveur ne croit pas le client : l'émetteur est l'identité du jeton, la
//      mission d'une ligne est celle de la base, jamais celle annoncée par le lot.
//
// ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
// Ni descente (L6b), ni octet de pièce jointe (L6c), ni journal d'activité. Aucune
// charge, aucun nom, aucune adresse n'est journalisé (11 §2) : seuls l'entité et
// le code d'erreur PostgreSQL d'une op en échec le sont.
//
// Traçabilité : E7, E9 · invariants 1, 3 et 7 · 05 §9.3, §9.4, §9.9 · 11 §4.
// =============================================================================
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import type { FastifyBaseLogger } from 'fastify';
import {
  AppError,
  isoUtcSchema,
  valeurReponseSchema,
  type LotPush,
  type Operation,
  type ReponsePush,
  type ResultatOp,
} from '@axion/shared';
import { db } from '../db.js';
import {
  CRITICITES,
  MODES_ENTRETIEN,
  MOTIFS_NON_COMMUNIQUE,
  SOURCES_DONNEE,
  STATUTS_PLANIFICATION,
  STATUTS_SESSION,
  TYPES_PIECE_JOINTE,
  TYPES_REPONSE,
  TYPES_SESSION,
  TYPES_UNITE,
  type RoleSurMission,
  type StatutSession,
} from '../db/schema.js';
import {
  archiver,
  consignerOp,
  insererPiece,
  insererQuestion,
  insererQuestionDeMission,
  insererReponse,
  insererSession,
  insererUnite,
  journaliserPush,
  lireBlocParCode,
  lireMissionDeDemande,
  lireMissionDeReponse,
  lirePiece,
  lireQuestion,
  lireQuestionDeMission,
  lireReponse,
  lireReponseParCle,
  lireRoleSurMission,
  lireSession,
  lireUnite,
  majPiece,
  majReponse,
  majSession,
  majUnite,
  opDejaTraitee,
  type ExecuteurSql,
  type InsertionPiece,
  type InsertionQuestion,
  type InsertionQuestionDeMission,
  type InsertionReponse,
  type InsertionSession,
  type InsertionUnite,
  type LigneReponse,
} from './depot.js';
import {
  auteurDeclareAdmis,
  combiner,
  proprieteDePiece,
  proprieteDeSession,
  type Emetteur,
  type Propriete,
} from './proprietaire.js';

// =============================================================================
// QUI ÉCRIT PAR LE PUSH
// =============================================================================
/**
 * Les rôles SUR LA MISSION qui collectent. `lecteur` lit ; `analyste` analyse au
 * siège (03 §34.1) — aucun texte ne lui ouvre le push, refus par défaut (doute
 * rapporté). Le lead collecte ses PROPRES sessions ; il corrige celles des autres
 * par l'API siège, jamais par ici (§9.9) — la propriété par ligne le garantit.
 */
const ROLES_COLLECTEURS: readonly RoleSurMission[] = ['lead', 'consultant'];

const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";
const MESSAGE_DROITS = "Vous n'avez pas les droits nécessaires pour cette action.";

const MESSAGES = {
  interdit:
    'Écriture refusée : cette donnée appartient à un autre auditeur ou à une autre mission.',
  usurpation: "Écriture refusée : l'auteur déclaré n'est pas le compte connecté.",
  siege: 'Écriture refusée : cette donnée est gérée par le siège.',
  arbitree: 'Une version plus récente existe déjà au siège : la vôtre a été archivée.',
  chargeInvalide: 'Opération illisible : son contenu ne respecte pas le format attendu.',
  sessionInconnue: "La session de rattachement n'est pas encore connue du siège.",
  referenceInconnue: "Un élément de rattachement n'est pas encore connu du siège.",
  recul: "Écriture refusée : le statut d'une session ne revient jamais en arrière.",
  retouche: 'Écriture refusée : une question ad hoc créée ne se modifie pas depuis le terrain.',
  suppression: "La suppression n'est pas prise en charge par la synchronisation.",
  cycle: "L'unité proposée ne peut pas être rattachée à elle-même.",
  echec: "L'opération n'a pas pu être enregistrée : elle sera retentée.",
} as const;

// =============================================================================
// FORMES DES CHARGES — validées par le schéma de LEUR table (04), camelCase
// =============================================================================
// Les colonnes serveur (`synced_at`, `created_at`, `updated_at`, `revision`) ne
// sont PAS lues dans la charge. Les auteurs (`conductedBy`, `createdBy`,
// `proposedBy`) sont lus POUR ÊTRE REFUSÉS s'ils désignent quelqu'un d'autre.
// CHARGE FERMÉE (arbitrage de la coordination, 2026-10-09, H1) : chaque entité
// n'accepte QUE les clés ci-dessous (`z.strictObject`). Une clé inconnue — y
// compris une colonne serveur comme `revision` — rend l'op illisible (`error`),
// rien n'est écrit. Ces schémas sont SERVEUR : le contrat partagé `sync.ts` est
// gelé et laisse `payload` en `unknown` délibérément.
const horodatage = isoUtcSchema.nullable().optional();
const texte = z.string().nullable().optional();
const uuidFacultatif = z.uuid().nullable().optional();
const auteurDeclare = z.string().nullable().optional();

const chargeSessionSchema = z.strictObject({
  missionId: z.uuid(),
  orgUnitId: z.uuid(),
  conductedBy: auteurDeclare,
  kind: z.enum(TYPES_SESSION).optional(),
  mode: z.enum(MODES_ENTRETIEN).nullable().optional(),
  linkedReviewAnswerId: uuidFacultatif,
  personName: texte,
  personRole: texte,
  personServiceId: uuidFacultatif,
  personEmail: texte,
  interlocutorProfileId: uuidFacultatif,
  participants: z.unknown().optional(),
  documentRequestId: uuidFacultatif,
  consentGiven: z.boolean().nullable().optional(),
  consentAudio: z.boolean().nullable().optional(),
  consentedAt: horodatage,
  informationNoticeVersion: texte,
  noticeShownAt: horodatage,
  scheduledAt: horodatage,
  scheduledDurationMin: z.number().int().min(0).nullable().optional(),
  scheduleStatus: z.enum(STATUTS_PLANIFICATION).optional(),
  status: z.enum(STATUTS_SESSION).optional(),
  startedAt: horodatage,
  endedAt: horodatage,
  generalNotes: texte,
  clientCreatedAt: horodatage,
});

const chargeReponseSchema = z.strictObject({
  interviewId: z.uuid(),
  missionQuestionId: z.uuid(),
  value: valeurReponseSchema.nullable().optional(),
  source: z.enum(SOURCES_DONNEE).optional(),
  withheld: z.boolean().optional(),
  withheldReason: z.enum(MOTIFS_NON_COMMUNIQUE).nullable().optional(),
  horsParcours: z.boolean().optional(),
  note: texte,
  flagReview: z.boolean().optional(),
  reviewReason: texte,
  notApplicable: z.boolean().optional(),
  naReason: texte,
  clientCreatedAt: horodatage,
});

const chargePieceSchema = z.strictObject({
  missionId: z.uuid(),
  interviewId: uuidFacultatif,
  answerId: uuidFacultatif,
  kind: z.enum(TYPES_PIECE_JOINTE),
  content: texte,
  filename: texte,
  mime: texte,
  sizeBytes: z.number().int().min(0).nullable().optional(),
  createdBy: auteurDeclare,
  clientCreatedAt: horodatage,
});

const chargePropositionSchema = z.strictObject({
  missionId: z.uuid(),
  parentId: z.uuid().nullable(),
  kind: z.enum(TYPES_UNITE),
  name: z.string().trim().min(1),
  headcount: z.number().int().min(0).nullable().optional(),
  countryCode: texte,
  timezone: texte,
  proposedBy: auteurDeclare,
});

/** 11 §4 (V2.9) : `{question: {…§36.4}, mission_question: {id, position}}`, en camelCase. */
const chargeQuestionAdhocSchema = z.strictObject({
  question: z.strictObject({
    textFr: z.string().trim().min(1),
    guidanceFr: texte,
    answerType: z.enum(TYPES_REPONSE),
    criticality: z.enum(CRITICITES).optional(),
    /** H2 (arbitrée 2026-10-09) : le terrain ne connaît que le CODE du bloc. */
    blockCode: z.string().min(1),
    options: z.unknown().optional(),
    allowRange: z.boolean().optional(),
    expectedSource: z.enum(SOURCES_DONNEE).nullable().optional(),
    createdBy: auteurDeclare,
  }),
  missionQuestion: z.strictObject({
    id: z.uuid(),
    position: z.number().int().nullable().optional(),
  }),
});

// =============================================================================
// OUTILS
// =============================================================================

/** L'issue d'une op, telle qu'elle part dans la réponse. */
interface Issue {
  readonly resultat: ResultatOp;
  readonly message?: string;
}

const APPLIQUEE: Issue = { resultat: 'applied' };
const interdite = (message: string = MESSAGES.interdit): Issue => ({
  resultat: 'forbidden',
  message,
});
const enEchec = (message: string): Issue => ({ resultat: 'error', message });
const ARBITREE: Issue = { resultat: 'superseded', message: MESSAGES.arbitree };

/** Une op refusée ou en échec : levée DANS le point de sauvegarde pour l'annuler. */
class Annulation extends Error {
  constructor(readonly issue: Issue) {
    super('annulation');
  }
}

/** Un verdict de propriété qui n'autorise pas → l'issue correspondante. */
function issueDeRefus(propriete: Exclude<Propriete, 'proprietaire'>, inconnu: string): Issue {
  return propriete === 'autrui' ? interdite() : enEchec(inconnu);
}

/** ISO → Date, en respectant les trois états : absent, nul, valeur. */
function date(valeur: string | null | undefined): Date | null | undefined {
  if (valeur === undefined) return undefined;
  return valeur === null ? null : new Date(valeur);
}

/** Retire les clés `undefined` (exactOptionalPropertyTypes : absent ≠ indéfini). */
function sansIndefinis<T extends object>(objet: { [K in keyof T]?: T[K] | undefined }): Partial<T> {
  const sortie: Partial<T> = {};
  for (const cle of Object.keys(objet) as (keyof T)[]) {
    const valeur = objet[cle];
    if (valeur !== undefined) sortie[cle] = valeur;
  }
  return sortie;
}

/**
 * Forme canonique d'une valeur pour la COMPARER : clés triées (jsonb réordonne les
 * clés), dates en ISO. Deux valeurs égales en sens rendent la même chaîne.
 */
export function canonique(valeur: unknown): string {
  if (valeur === undefined || valeur === null) return 'null';
  if (valeur instanceof Date) return JSON.stringify(valeur.toISOString());
  if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(',')}]`;
  if (typeof valeur === 'object') {
    const entrees = Object.entries(valeur)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entrees.map(([k, v]) => `${JSON.stringify(k)}:${canonique(v)}`).join(',')}}`;
  }
  return JSON.stringify(valeur);
}

/** Les champs de `nouveaux` dont la valeur diffère de la ligne existante. */
function champsModifies(existant: object, nouveaux: object): string[] {
  const ancien = new Map(Object.entries(existant));
  return Object.entries(nouveaux)
    .filter(([cle, valeur]) => canonique(ancien.get(cle)) !== canonique(valeur))
    .map(([cle]) => cle);
}

/** Les valeurs ANCIENNES des champs modifiés — ce que l'archive `terrain` conserve. */
function extraire(existant: object, champs: readonly string[]): Record<string, unknown> {
  const ancien = new Map(Object.entries(existant));
  return Object.fromEntries(champs.map((cle) => [cle, ancien.get(cle) ?? null]));
}

type Ordre = 'plus_recent' | 'egal' | 'plus_ancien';

/** §9.4 : dernier-écrit-gagne sur `client_updated_at`. Une ligne sans horodatage perd. */
function ordre(stocke: Date | null, entrant: Date): Ordre {
  if (stocke === null) return 'plus_recent';
  const ecart = entrant.getTime() - stocke.getTime();
  if (ecart > 0) return 'plus_recent';
  return ecart === 0 ? 'egal' : 'plus_ancien';
}

/** Le code SQLSTATE d'une erreur PostgreSQL (seule information journalisable). */
function codeSql(erreur: unknown): string {
  for (let e: unknown = erreur, i = 0; e instanceof Error && i < 3; e = e.cause, i += 1) {
    if ('code' in e && typeof e.code === 'string') return e.code;
  }
  return 'inconnu';
}

interface Contexte {
  readonly ex: ExecuteurSql;
  readonly op: Operation;
  readonly emetteur: Emetteur;
  readonly maintenant: Date;
  readonly entrant: Date;
}

// =============================================================================
// ENTITÉ `interview` — propriétaire : `conducted_by` de la ligne serveur
// =============================================================================
/** L'ordre du cycle de vie d'une session (04 : `interviews.status`). */
const RANG_STATUT: Readonly<Record<StatutSession, number>> = {
  non_demarre: 0,
  en_cours: 1,
  termine: 2,
};

/**
 * `linkedReviewAnswerId` (réponse → sa session → sa mission) et
 * `documentRequestId` (`document_requests.mission_id`) : autre mission →
 * `forbidden`, inconnue → `error` (PD4). Rend `null` quand tout est en règle.
 */
async function referencesDeSession(
  ex: ExecuteurSql,
  charge: z.infer<typeof chargeSessionSchema>,
  emetteur: Emetteur,
): Promise<Issue | null> {
  const missions: (string | null)[] = [];
  if (charge.linkedReviewAnswerId !== undefined && charge.linkedReviewAnswerId !== null) {
    missions.push(await lireMissionDeReponse(ex, charge.linkedReviewAnswerId));
  }
  if (charge.documentRequestId !== undefined && charge.documentRequestId !== null) {
    missions.push(await lireMissionDeDemande(ex, charge.documentRequestId));
  }
  if (missions.some((m) => m !== null && m !== emetteur.missionId)) return interdite();
  if (missions.includes(null)) return enEchec(MESSAGES.referenceInconnue);
  return null;
}

async function traiterSession(c: Contexte): Promise<Issue> {
  const lecture = chargeSessionSchema.safeParse(c.op.payload);
  if (!lecture.success) return enEchec(MESSAGES.chargeInvalide);
  const charge = lecture.data;
  if (!auteurDeclareAdmis(charge.conductedBy, c.emetteur)) return interdite(MESSAGES.usurpation);
  if (charge.missionId !== c.emetteur.missionId) return interdite();

  const unite = await lireUnite(c.ex, charge.orgUnitId);
  if (unite === null) return enEchec(MESSAGES.referenceInconnue);
  if (unite.missionId !== c.emetteur.missionId) return interdite();
  // Réserve 1 d'A17 (BLOQUANT) : toute référence portée par la session doit vivre
  // DANS la mission du lot — sinon une session relierait la donnée d'autrui.
  const references = await referencesDeSession(c.ex, charge, c.emetteur);
  if (references !== null) return references;

  const colonnes = sansIndefinis<InsertionSession>({
    orgUnitId: charge.orgUnitId,
    kind: charge.kind,
    mode: charge.mode,
    linkedReviewAnswerId: charge.linkedReviewAnswerId,
    personName: charge.personName,
    personRole: charge.personRole,
    personServiceId: charge.personServiceId,
    personEmail: charge.personEmail,
    interlocutorProfileId: charge.interlocutorProfileId,
    participants: charge.participants,
    documentRequestId: charge.documentRequestId,
    consentGiven: charge.consentGiven,
    consentAudio: charge.consentAudio,
    consentedAt: date(charge.consentedAt),
    informationNoticeVersion: charge.informationNoticeVersion,
    noticeShownAt: date(charge.noticeShownAt),
    scheduledAt: date(charge.scheduledAt),
    scheduledDurationMin: charge.scheduledDurationMin,
    scheduleStatus: charge.scheduleStatus,
    status: charge.status,
    startedAt: date(charge.startedAt),
    endedAt: date(charge.endedAt),
    generalNotes: charge.generalNotes,
  });

  const existante = await lireSession(c.ex, c.op.entityId, 'update');
  if (existante === null) {
    const kind = charge.kind ?? 'entretien';
    await insererSession(c.ex, {
      ...colonnes,
      id: c.op.entityId,
      missionId: c.emetteur.missionId,
      // §9.9 : à la création, le propriétaire est l'ÉMETTEUR AUTHENTIFIÉ.
      conductedBy: c.emetteur.utilisateurId,
      kind,
      // V2.8 — défaut APPLICATIF : 'sur_site' si kind='entretien', NULL sinon.
      mode: charge.mode !== undefined ? charge.mode : kind === 'entretien' ? 'sur_site' : null,
      orgUnitId: charge.orgUnitId,
      scheduleStatus: charge.scheduleStatus ?? 'a_planifier',
      status: charge.status ?? 'non_demarre',
      clientCreatedAt: date(charge.clientCreatedAt) ?? c.entrant,
      clientUpdatedAt: c.entrant,
      syncedAt: c.maintenant,
      createdAt: c.maintenant,
      updatedAt: c.maintenant,
    });
    return APPLIQUEE;
  }

  const propriete = await proprieteDeSession(c.ex, existante.id, c.emetteur);
  if (propriete !== 'proprietaire') return issueDeRefus(propriete, MESSAGES.sessionInconnue);

  const modifies = champsModifies(existante, colonnes);
  const sens = ordre(existante.clientUpdatedAt, c.entrant);
  if (sens === 'plus_ancien' || (sens === 'egal' && modifies.length > 0)) {
    await archiver(c.ex, {
      entite: 'interview',
      entiteId: existante.id,
      valeur: { ...colonnes, clientUpdatedAt: c.entrant },
      origine: 'sync_arbitrage',
      auteur: c.emetteur.utilisateurId,
      le: c.maintenant,
    });
    return ARBITREE;
  }
  if (sens === 'egal') return APPLIQUEE;
  // Arbitrage A01 (R1 de la re-revue A17, 2026-10-09) : le statut d'une session ne
  // RECULE jamais par le push (non_demarre → en_cours → termine). Une écriture plus
  // récente qui recule le statut garde le statut SERVEUR et applique le reste ;
  // elle n'est refusée que si ce recul est sa SEULE différence avec la ligne.
  const recul =
    charge.status !== undefined && RANG_STATUT[charge.status] < RANG_STATUT[existante.status];
  const appliquees: Partial<InsertionSession> = recul
    ? Object.fromEntries(Object.entries(colonnes).filter(([cle]) => cle !== 'status'))
    : colonnes;
  const modifiees = recul ? modifies.filter((cle) => cle !== 'status') : modifies;
  if (recul && modifiees.length === 0) return interdite(MESSAGES.recul);
  if (modifiees.length > 0) {
    await archiver(c.ex, {
      entite: 'interview',
      entiteId: existante.id,
      valeur: { ...extraire(existante, modifiees), clientUpdatedAt: existante.clientUpdatedAt },
      origine: 'terrain',
      auteur: c.emetteur.utilisateurId,
      le: c.maintenant,
    });
  }
  await majSession(c.ex, existante.id, {
    ...appliquees,
    clientUpdatedAt: c.entrant,
    syncedAt: c.maintenant,
    updatedAt: c.maintenant,
  });
  return APPLIQUEE;
}

// =============================================================================
// ENTITÉ `answer` — propriétaire : la session de la réponse
// =============================================================================
/**
 * H7 (réserve 2 d'A17) — la VERSION ENTIÈRE d'une réponse, telle qu'archivée dans
 * `answer_revisions.previous_value` : objet camelCase, `clientUpdatedAt` compris.
 */
function versionReponse(ligne: {
  readonly value: unknown;
  readonly note: string | null;
  readonly withheld: boolean;
  readonly withheldReason: string | null;
  readonly notApplicable: boolean;
  readonly naReason: string | null;
  readonly flagReview: boolean;
  readonly reviewReason: string | null;
  readonly source: string;
  readonly horsParcours: boolean;
  readonly clientUpdatedAt: Date | null;
}): Record<string, unknown> {
  return {
    value: ligne.value,
    note: ligne.note,
    withheld: ligne.withheld,
    withheldReason: ligne.withheldReason,
    notApplicable: ligne.notApplicable,
    naReason: ligne.naReason,
    flagReview: ligne.flagReview,
    reviewReason: ligne.reviewReason,
    source: ligne.source,
    horsParcours: ligne.horsParcours,
    clientUpdatedAt: ligne.clientUpdatedAt,
  };
}

async function traiterReponse(c: Contexte): Promise<Issue> {
  const lecture = chargeReponseSchema.safeParse(c.op.payload);
  if (!lecture.success) return enEchec(MESSAGES.chargeInvalide);
  const charge = lecture.data;

  const parId = await lireReponse(c.ex, c.op.entityId, 'update');
  if (parId !== null) {
    const propriete = await proprieteDeSession(c.ex, parId.interviewId, c.emetteur);
    if (propriete !== 'proprietaire') return issueDeRefus(propriete, MESSAGES.sessionInconnue);
    // Une réponse ne change ni de session ni de question par le push.
    if (
      charge.interviewId !== parId.interviewId ||
      charge.missionQuestionId !== parId.missionQuestionId
    ) {
      return interdite();
    }
    return arbitrerReponse(c, parId, charge, 'terrain');
  }

  // PD4 : session inconnue → `error` (rejouable), jamais `forbidden`.
  const propriete = await proprieteDeSession(c.ex, charge.interviewId, c.emetteur);
  if (propriete !== 'proprietaire') return issueDeRefus(propriete, MESSAGES.sessionInconnue);
  const question = await lireQuestionDeMission(c.ex, charge.missionQuestionId);
  if (question === null) return enEchec(MESSAGES.referenceInconnue);
  if (question.missionId !== c.emetteur.missionId) return interdite();

  // Arbitrage A01 (2026-10-09) — un SECOND id pour le même (session, question),
  // même auditeur sur deux appareils (scénario 5) : dernier-écrit-gagne SUR LA LIGNE
  // EXISTANTE, jamais de seconde ligne ; la version perdante est archivée en
  // `sync_arbitrage`, qu'elle soit l'ancienne ligne ou l'entrante.
  const parCle = await lireReponseParCle(c.ex, charge.interviewId, charge.missionQuestionId);
  if (parCle !== null) {
    const existante = await lireReponse(c.ex, parCle.id, 'update');
    if (existante === null) return enEchec(MESSAGES.echec);
    return arbitrerReponse(c, existante, charge, 'sync_arbitrage');
  }

  await insererReponse(c.ex, {
    source: 'entretien',
    withheld: false,
    horsParcours: false,
    flagReview: false,
    notApplicable: false,
    ...colonnesReponse(charge),
    id: c.op.entityId,
    interviewId: charge.interviewId,
    missionQuestionId: charge.missionQuestionId,
    value: charge.value ?? null,
    questionTextSnapshot: question.textSnapshot,
    revision: 1,
    clientCreatedAt: date(charge.clientCreatedAt) ?? c.entrant,
    clientUpdatedAt: c.entrant,
    syncedAt: c.maintenant,
    createdAt: c.maintenant,
    updatedAt: c.maintenant,
  });
  return APPLIQUEE;
}

type ChargeReponse = z.infer<typeof chargeReponseSchema>;

function colonnesReponse(charge: ChargeReponse): Partial<InsertionReponse> {
  return sansIndefinis<InsertionReponse>({
    source: charge.source,
    withheld: charge.withheld,
    withheldReason: charge.withheldReason,
    horsParcours: charge.horsParcours,
    note: charge.note,
    flagReview: charge.flagReview,
    reviewReason: charge.reviewReason,
    notApplicable: charge.notApplicable,
    naReason: charge.naReason,
  });
}

/**
 * Dernier-écrit-gagne sur une réponse EXISTANTE (§9.4), propriété déjà prouvée.
 * Invariant 7 (arbitrage A01, qui prime sur la lecture étroite de PD3) : toute
 * colonne écrasée est archivée, `value` ou non. Le compteur client n'est jamais le
 * déclencheur : c'est la comparaison des colonnes qui décide.
 * `origineEcrasement` : `terrain` quand la même identité se réécrit,
 * `sync_arbitrage` quand une seconde identité l'emporte sur la ligne existante.
 */
async function arbitrerReponse(
  c: Contexte,
  existante: LigneReponse,
  charge: ChargeReponse,
  origineEcrasement: 'terrain' | 'sync_arbitrage',
): Promise<Issue> {
  const colonnes = colonnesReponse(charge);
  const valeurEntrante = charge.value === undefined ? existante.value : charge.value;
  const valeurChange = canonique(valeurEntrante) !== canonique(existante.value);
  const change = valeurChange || champsModifies(existante, colonnes).length > 0;
  const sens = ordre(existante.clientUpdatedAt, c.entrant);

  if (sens === 'plus_ancien' || (sens === 'egal' && change)) {
    await archiver(c.ex, {
      entite: 'answer',
      entiteId: existante.id,
      // La version PERDANTE entière : la charge, complétée par la ligne pour les
      // champs qu'elle ne porte pas.
      valeur: versionReponse(
        Object.assign({}, existante, colonnes, {
          value: valeurEntrante,
          clientUpdatedAt: c.entrant,
        }),
      ),
      origine: 'sync_arbitrage',
      auteur: c.emetteur.utilisateurId,
      le: c.maintenant,
    });
    return ARBITREE;
  }
  if (sens === 'egal' || !change) {
    if (sens !== 'egal') {
      await majReponse(c.ex, existante.id, {
        clientUpdatedAt: c.entrant,
        syncedAt: c.maintenant,
        updatedAt: c.maintenant,
      });
    }
    return APPLIQUEE;
  }
  await archiver(c.ex, {
    entite: 'answer',
    entiteId: existante.id,
    valeur: versionReponse(existante),
    origine: origineEcrasement,
    auteur: c.emetteur.utilisateurId,
    le: c.maintenant,
  });
  await majReponse(c.ex, existante.id, {
    ...colonnes,
    value: valeurEntrante,
    revision: valeurChange ? existante.revision + 1 : existante.revision,
    clientUpdatedAt: c.entrant,
    syncedAt: c.maintenant,
    updatedAt: c.maintenant,
  });
  return APPLIQUEE;
}

// =============================================================================
// ENTITÉ `attachment_meta` — 04 S-3 : le rattachement, SINON `created_by`
// =============================================================================
async function traiterPiece(c: Contexte): Promise<Issue> {
  const lecture = chargePieceSchema.safeParse(c.op.payload);
  if (!lecture.success) return enEchec(MESSAGES.chargeInvalide);
  const charge = lecture.data;
  if (!auteurDeclareAdmis(charge.createdBy, c.emetteur)) return interdite(MESSAGES.usurpation);
  if (charge.missionId !== c.emetteur.missionId) return interdite();

  const colonnes = sansIndefinis<InsertionPiece>({
    interviewId: charge.interviewId,
    answerId: charge.answerId,
    kind: charge.kind,
    content: charge.content,
    filename: charge.filename,
    mime: charge.mime,
    sizeBytes: charge.sizeBytes,
  });

  const existante = await lirePiece(c.ex, c.op.entityId, 'update');
  if (existante === null) {
    const propriete = await proprieteDePiece(
      c.ex,
      { interviewId: charge.interviewId ?? null, answerId: charge.answerId ?? null },
      c.emetteur.utilisateurId,
      c.emetteur,
    );
    if (propriete !== 'proprietaire') return issueDeRefus(propriete, MESSAGES.referenceInconnue);
    await insererPiece(c.ex, {
      ...colonnes,
      id: c.op.entityId,
      missionId: c.emetteur.missionId,
      kind: charge.kind,
      // §9.9 / S-3 : l'auteur est l'émetteur authentifié, jamais la charge.
      createdBy: c.emetteur.utilisateurId,
      clientCreatedAt: date(charge.clientCreatedAt) ?? c.entrant,
      clientUpdatedAt: c.entrant,
      syncedAt: c.maintenant,
      createdAt: c.maintenant,
      updatedAt: c.maintenant,
    });
    return APPLIQUEE;
  }

  if (existante.missionId !== c.emetteur.missionId) return interdite();
  // Deux verdicts : la pièce TELLE QU'ELLE EST (à qui appartient-elle ?) et la
  // pièce TELLE QU'ELLE DEVIENDRAIT (le nouveau rattachement est-il à lui ?).
  const avant = await proprieteDePiece(
    c.ex,
    { interviewId: existante.interviewId, answerId: existante.answerId },
    existante.createdBy,
    c.emetteur,
  );
  const apres = await proprieteDePiece(
    c.ex,
    {
      interviewId: charge.interviewId === undefined ? existante.interviewId : charge.interviewId,
      answerId: charge.answerId === undefined ? existante.answerId : charge.answerId,
    },
    existante.createdBy,
    c.emetteur,
  );
  const propriete = combiner([avant, apres]);
  if (propriete !== 'proprietaire') return issueDeRefus(propriete, MESSAGES.referenceInconnue);

  const modifies = champsModifies(existante, colonnes);
  const sens = ordre(existante.clientUpdatedAt, c.entrant);
  if (sens === 'plus_ancien' || (sens === 'egal' && modifies.length > 0)) {
    await archiver(c.ex, {
      entite: 'attachment',
      entiteId: existante.id,
      valeur: { ...colonnes, clientUpdatedAt: c.entrant },
      origine: 'sync_arbitrage',
      auteur: c.emetteur.utilisateurId,
      le: c.maintenant,
    });
    return ARBITREE;
  }
  if (sens === 'egal') return APPLIQUEE;
  if (modifies.length > 0) {
    await archiver(c.ex, {
      entite: 'attachment',
      entiteId: existante.id,
      valeur: { ...extraire(existante, modifies), clientUpdatedAt: existante.clientUpdatedAt },
      origine: 'terrain',
      auteur: c.emetteur.utilisateurId,
      le: c.maintenant,
    });
  }
  await majPiece(c.ex, existante.id, {
    ...colonnes,
    clientUpdatedAt: c.entrant,
    syncedAt: c.maintenant,
    updatedAt: c.maintenant,
  });
  return APPLIQUEE;
}

// =============================================================================
// ENTITÉ `org_unit_proposal` — propriétaire : `proposed_by` (décision 2026-09-05)
// =============================================================================
/** Profondeur maximale remontée pour détecter un cycle d'unités. */
const PROFONDEUR_ARBRE_MAX = 64;

async function creeraitUnCycle(ex: ExecuteurSql, id: string, parentId: string): Promise<boolean> {
  let courant: string | null = parentId;
  for (let i = 0; courant !== null && i < PROFONDEUR_ARBRE_MAX; i += 1) {
    if (courant === id) return true;
    const unite = await lireUnite(ex, courant);
    courant = unite?.parentId ?? null;
  }
  return courant !== null;
}

async function traiterProposition(c: Contexte): Promise<Issue> {
  const lecture = chargePropositionSchema.safeParse(c.op.payload);
  if (!lecture.success) return enEchec(MESSAGES.chargeInvalide);
  const charge = lecture.data;
  if (!auteurDeclareAdmis(charge.proposedBy, c.emetteur)) return interdite(MESSAGES.usurpation);
  if (charge.missionId !== c.emetteur.missionId) return interdite();

  if (charge.parentId !== null) {
    const parent = await lireUnite(c.ex, charge.parentId);
    if (parent === null) return enEchec(MESSAGES.referenceInconnue);
    if (parent.missionId !== c.emetteur.missionId) return interdite();
    if (await creeraitUnCycle(c.ex, c.op.entityId, charge.parentId)) return enEchec(MESSAGES.cycle);
  }

  const colonnes = sansIndefinis<InsertionUnite>({
    parentId: charge.parentId,
    kind: charge.kind,
    name: charge.name,
    headcount: charge.headcount,
    countryCode: charge.countryCode,
    timezone: charge.timezone,
  });

  const existante = await lireUnite(c.ex, c.op.entityId, 'update');
  if (existante === null) {
    await insererUnite(c.ex, {
      ...colonnes,
      id: c.op.entityId,
      missionId: c.emetteur.missionId,
      kind: charge.kind,
      name: charge.name,
      inScope: true,
      // 03 §25.3 : une unité née sur le terrain est une PROPOSITION, que le siège
      // qualifie (valider / fusionner).
      status: 'proposee',
      proposedBy: c.emetteur.utilisateurId,
      createdAt: c.maintenant,
      updatedAt: c.maintenant,
    });
    return APPLIQUEE;
  }

  if (existante.missionId !== c.emetteur.missionId) return interdite();
  if (existante.proposedBy !== c.emetteur.utilisateurId) return interdite();
  // Une fois qualifiée par le siège, l'unité est une entité SIÈGE (§9.4).
  if (existante.status !== 'proposee') return interdite(MESSAGES.siege);
  if (champsModifies(existante, colonnes).length > 0) {
    await majUnite(c.ex, existante.id, { ...colonnes, updatedAt: c.maintenant });
  }
  return APPLIQUEE;
}

// =============================================================================
// ENTITÉ `question_adhoc` — `questions` + `mission_questions`, ATOMIQUEMENT (11 §4)
// =============================================================================
async function traiterQuestionAdhoc(c: Contexte): Promise<Issue> {
  const lecture = chargeQuestionAdhocSchema.safeParse(c.op.payload);
  if (!lecture.success) return enEchec(MESSAGES.chargeInvalide);
  const { question: q, missionQuestion: mq } = lecture.data;
  if (!auteurDeclareAdmis(q.createdBy, c.emetteur)) return interdite(MESSAGES.usurpation);
  // Code de bloc inconnu du siège → `error`, comme toute référence inconnue (PD4).
  const blockId = await lireBlocParCode(c.ex, q.blockCode);
  if (blockId === null) return enEchec(MESSAGES.referenceInconnue);

  const colonnesQuestion = sansIndefinis<InsertionQuestion>({
    textFr: q.textFr,
    guidanceFr: q.guidanceFr,
    answerType: q.answerType,
    criticality: q.criticality,
    blockId,
    options: q.options,
    allowRange: q.allowRange,
    expectedSource: q.expectedSource,
  });
  const instantane = sansIndefinis<InsertionQuestionDeMission>({
    textSnapshot: q.textFr,
    guidanceSnapshot: q.guidanceFr,
    answerTypeSnapshot: q.answerType,
    criticalitySnapshot: q.criticality,
    optionsSnapshot: q.options,
    allowRangeSnapshot: q.allowRange,
    position: mq.position,
  });

  const existante = await lireQuestion(c.ex, c.op.entityId, 'update');
  const ligneMq = await lireQuestionDeMission(c.ex, mq.id, 'update');
  if (ligneMq !== null) {
    // L'id client de la ligne de questionnaire doit désigner CETTE question, dans
    // CETTE mission : sinon il viserait le questionnaire d'autrui.
    if (ligneMq.questionId !== c.op.entityId || ligneMq.missionId !== c.emetteur.missionId) {
      return interdite();
    }
  }

  if (existante === null) {
    await insererQuestion(c.ex, {
      allowRange: false,
      weight: '1',
      criticality: 'important',
      sectors: [],
      targetServices: [],
      levels: [],
      profiles: [],
      geo: 'tous',
      ...colonnesQuestion,
      id: c.op.entityId,
      code: null,
      blockId,
      version: 1,
      status: 'active',
      textFr: q.textFr,
      answerType: q.answerType,
      origin: 'ad_hoc',
      originMissionId: c.emetteur.missionId,
      createdBy: c.emetteur.utilisateurId,
      createdAt: c.maintenant,
      updatedAt: c.maintenant,
    });
  } else {
    // Une question de BANQUE est une entité siège : jamais modifiée du terrain (§9.4).
    if (existante.origin !== 'ad_hoc') return interdite(MESSAGES.siege);
    if (existante.originMissionId !== c.emetteur.missionId) return interdite();
    if (existante.createdBy !== c.emetteur.utilisateurId) return interdite();
    // Arbitrage A01 (2026-10-09) : une question ad hoc créée ne se RETOUCHE pas par
    // le push — ni la question, ni sa ligne de questionnaire. Seule une recréation
    // strictement identique (rejeu sous un nouvel opId) passe, sans effet.
    if (
      ligneMq === null ||
      champsModifies(existante, { ...colonnesQuestion, blockId }).length > 0 ||
      champsModifies(ligneMq, instantane).length > 0
    ) {
      return interdite(MESSAGES.retouche);
    }
  }

  // La ligne de questionnaire n'est JAMAIS réécrite : ses colonnes `*_snapshot`
  // sont l'identité figée de la question dans la mission, et leur seul écrivain
  // légitime est le `resync` (garde statique de l3d-questionnaire). Une retouche
  // d'une question ad hoc modifie `questions`, pas sa capture — doute rapporté.
  if (ligneMq === null) {
    await insererQuestionDeMission(c.ex, {
      ...instantane,
      id: mq.id,
      missionId: c.emetteur.missionId,
      questionId: c.op.entityId,
      questionVersion: existante?.version ?? 1,
      textSnapshot: q.textFr,
      addedAdHoc: true,
    });
  }
  return APPLIQUEE;
}

// =============================================================================
// UNE OP
// =============================================================================
async function appliquer(c: Contexte): Promise<Issue> {
  // Invariant 7 : rien ne se supprime. Aucune table de la montée ne porte
  // `deleted_at` (04) : l'action n'a pas de cible. `error` et non `forbidden` :
  // l'op reste rejouable le jour où la suppression douce sera spécifiée.
  if (c.op.action === 'delete_soft') return enEchec(MESSAGES.suppression);
  switch (c.op.entity) {
    case 'interview':
      return traiterSession(c);
    case 'answer':
      return traiterReponse(c);
    case 'attachment_meta':
      return traiterPiece(c);
    case 'org_unit_proposal':
      return traiterProposition(c);
    case 'question_adhoc':
      return traiterQuestionAdhoc(c);
  }
}

async function traiterUneOp(
  tx: ExecuteurSql,
  op: Operation,
  emetteur: Emetteur,
  lotId: string,
  journal: FastifyBaseLogger,
): Promise<Issue> {
  if (await opDejaTraitee(tx, op.opId)) return { resultat: 'duplicate' };
  try {
    return await tx.transaction(async (pointDeSauvegarde) => {
      const maintenant = new Date();
      const issue = await appliquer({
        ex: pointDeSauvegarde,
        op,
        emetteur,
        maintenant,
        entrant: new Date(op.clientUpdatedAt),
      });
      if (issue.resultat === 'forbidden' || issue.resultat === 'error') {
        throw new Annulation(issue);
      }
      await consignerOp(pointDeSauvegarde, op.opId, lotId, issue.resultat, maintenant);
      return issue;
    });
  } catch (erreur) {
    if (erreur instanceof Annulation) return erreur.issue;
    // 11 §2 : ni la charge ni le message PostgreSQL (qui recopie des valeurs).
    journal.warn(
      { entite: op.entity, code: codeSql(erreur) },
      'Op de sync en échec, rejouable — annulée',
    );
    return enEchec(MESSAGES.echec);
  }
}

// =============================================================================
// LE LOT
// =============================================================================
/**
 * Applique un lot de montée pour l'utilisateur AUTHENTIFIÉ `utilisateurId`.
 *
 * Refus du lot ENTIER (rien n'est écrit, aucune ligne `sync_log`) :
 *   · `404 NOT_FOUND` — mission inconnue, supprimée, ou l'émetteur n'en est pas
 *     membre (les deux se confondent : on ne révèle pas l'existence d'une mission) ;
 *   · `403 FORBIDDEN` — membre, mais ni `lead` ni `consultant` sur la mission.
 * Sinon `200`, un résultat par op dans l'ordre de la file, et UNE ligne `sync_log`.
 */
export async function pousserLot(
  utilisateurId: string,
  lot: LotPush,
  journal: FastifyBaseLogger,
): Promise<ReponsePush> {
  const debut = new Date();
  const emetteur: Emetteur = { utilisateurId, missionId: lot.missionId };
  const lotId = uuidv7();

  return db.transaction(async (tx) => {
    const role = await lireRoleSurMission(tx, lot.missionId, utilisateurId);
    if (role === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);
    if (!ROLES_COLLECTEURS.includes(role)) throw new AppError('FORBIDDEN', MESSAGE_DROITS);

    const results: ReponsePush['results'] = [];
    let conflits = 0;
    for (const op of lot.operations) {
      const issue = await traiterUneOp(tx, op, emetteur, lotId, journal);
      if (issue.resultat !== 'applied' && issue.resultat !== 'duplicate') conflits += 1;
      results.push({
        opId: op.opId,
        result: issue.resultat,
        ...(issue.message === undefined ? {} : { message: issue.message }),
      });
    }

    const fin = new Date();
    await journaliserPush(tx, {
      utilisateurId,
      appareilId: lot.deviceId,
      nombreOps: lot.operations.length,
      nombreConflits: conflits,
      resteOutbox: lot.outboxRemaining,
      debut,
      fin,
    });
    return { serverTime: fin.toISOString(), results };
  });
}
