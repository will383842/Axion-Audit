// =============================================================================
// FORMES DES CHARGES DE LA MONTÉE — lot L6 (L6a, extrait en L6b).
//
// Module PUR : zod, `@axion/shared` et les énumérations du schéma Drizzle (des
// constantes, aucune connexion). Ni base, ni Fastify : le test de raccord du
// terrain l'importe tel quel, pour comparer chaque charge produite à la liste que
// le SERVEUR applique — une copie dériverait en silence.
//
// Validées par le schéma de LEUR table (04), camelCase. Les colonnes serveur
// (`synced_at`, `created_at`, `updated_at`, `revision`) ne sont PAS lues dans la
// charge. Les auteurs (`conductedBy`, `createdBy`, `proposedBy`) sont lus POUR
// ÊTRE REFUSÉS s'ils désignent quelqu'un d'autre.
// CHARGE FERMÉE (arbitrage de la coordination, 2026-10-09, H1) : chaque entité
// n'accepte QUE les clés ci-dessous (`z.strictObject`). Une clé inconnue — y
// compris une colonne serveur comme `revision` — rend l'op illisible (`error`),
// rien n'est écrit. Ces schémas sont SERVEUR : le contrat partagé `sync.ts` est
// gelé et laisse `payload` en `unknown` délibérément.
//
// Traçabilité : E7, E9 · invariant 3 · 05 §9.3 · 11 §4.
// =============================================================================
import { z } from 'zod';
import { isoUtcSchema, valeurReponseSchema, type EntiteSync } from '@axion/shared';
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
} from '../db/schema.js';

const horodatage = isoUtcSchema.nullable().optional();
const texte = z.string().nullable().optional();
const uuidFacultatif = z.uuid().nullable().optional();
const auteurDeclare = z.string().nullable().optional();

export const chargeSessionSchema = z.strictObject({
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

export const chargeReponseSchema = z.strictObject({
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

export const chargePieceSchema = z.strictObject({
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

export const chargePropositionSchema = z.strictObject({
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
export const chargeQuestionAdhocSchema = z.strictObject({
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

/** La liste fermée par entité montante — exhaustive sur `ENTITES_SYNC`. */
export const SCHEMAS_CHARGE_SYNC: Readonly<Record<EntiteSync, z.ZodType>> = {
  interview: chargeSessionSchema,
  answer: chargeReponseSchema,
  attachment_meta: chargePieceSchema,
  org_unit_proposal: chargePropositionSchema,
  question_adhoc: chargeQuestionAdhocSchema,
};
