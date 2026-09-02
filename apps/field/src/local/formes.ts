// =============================================================================
// LES FORMES LOCALES — l'en-tête d'index EN CLAIR et la charge CHIFFRÉE
//
// ── LA LISTE FERMÉE, ET POURQUOI ELLE EST FERMÉE ─────────────────────────────
// `LOT_L5.md` §3.2 : le chiffrement se fait par ENREGISTREMENT ; restent en clair,
// et **la liste est fermée** : `id`, `missionId`, `interviewId`,
// `missionQuestionId`, `orgUnitId`, `kind`, `status`, `scheduleStatus`,
// `scheduledAt`, `flagReview`, `notApplicable`, `withheld`, `horsParcours`,
// `clientUpdatedAt`, `position`. Tout le reste — `personName`, `personEmail`,
// `value`, `note`, `generalNotes`, le `content` d'une note volante,
// `participants` — vit dans une `Enveloppe`.
//
// **Règle jumelle de la redaction pino (11 §2) : aucune donnée personnelle ni
// contenu de réponse dans un index local.** Un test de balayage écrit par A26
// (`LOT_L5.md` §4, « étanchéité de l'index ») cherche des sentinelles dans toutes
// les tables après un scénario complet ; la seule façon de le tenir est que la
// forme elle-même l'interdise, d'où les types ci-dessous.
//
// L'exception est nommée par la même section : le texte figé des questions
// (`*_snapshot`) N'EST PAS une donnée personnelle — c'est du contenu siège — et son
// indexation en clair est ce qui rend la recherche hors-parcours (03 §25.4)
// possible hors ligne.
//
// ── LE PIÈGE INDEXEDDB QUI COÛTE UNE JOURNÉE ─────────────────────────────────
// **IndexedDB n'indexe pas les booléens** : `true`/`false` ne sont pas des clés
// valides, et une ligne dont la propriété indexée est un booléen est stockée mais
// reste INTROUVABLE par cet index — sans la moindre erreur. Les quatre drapeaux
// de la liste fermée (`flagReview`, `notApplicable`, `withheld`, `horsParcours`)
// sont donc des `0 | 1`. C'est le compteur d'à-revoir du cockpit (03 §34.2) qui
// en dépend.
//
// Traçabilité : E33 (sécurité / RGPD), E13 (écran 3 zones, enregistrement continu).
// =============================================================================
import { z } from 'zod';
import type { CRITICITES, TYPES_DE_REPONSE } from '@axion/shared';
import { valeurReponseSchema } from './contrat-sync.js';
import { enveloppeSchema, type Enveloppe } from './enveloppe.js';

/** Un booléen indexable. Voir l'en-tête : IndexedDB refuse les vrais booléens. */
export type Drapeau = 0 | 1;
export const drapeauSchema = z.union([z.literal(0), z.literal(1)]);

/** Conversion explicite — pour qu'aucun `Number(bool)` ne traîne dans les écrans. */
export function drapeau(valeur: boolean): Drapeau {
  return valeur ? 1 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉNUMÉRATIONS TRANSCRITES DU 04 (CHECK fermés)
// ─────────────────────────────────────────────────────────────────────────────
/** `interviews.kind` (04, §27.1) — les six types de session de collecte. */
export const TYPES_DE_SESSION = [
  'entretien',
  'observation',
  'demonstration',
  'analyse_documentaire',
  'releve_donnees',
  'atelier',
] as const;
export type TypeDeSession = (typeof TYPES_DE_SESSION)[number];

/** `interviews.mode` (04, §32.6). `null` hors entretien. */
export const MODES_ENTRETIEN = ['sur_site', 'distanciel', 'complementaire'] as const;

/** `interviews.schedule_status` (04, §25.2 agenda). */
export const STATUTS_PLANIFICATION = [
  'a_planifier',
  'planifie',
  'confirme',
  'realise',
  'reporte',
  'annule',
] as const;

/**
 * `interviews.status` (04) — TROIS valeurs, et c'est un point à connaître.
 *
 * La machine à états du terrain en connaît QUATRE (`session/machine.ts`, §19.1 :
 * « terminer ≠ valider »). Le 04 n'a pas de colonne pour `valide` : la validation
 * d'étape vit dans `step_validations`. Localement, `valide` est donc `status =
 * 'termine'` PLUS un `valideeLe` dans la charge — voir `session/machine.ts`, qui
 * porte la conversion, et le rapport d'auto-revue A24, qui remonte le point.
 */
export const STATUTS_SESSION_PERSISTES = ['non_demarre', 'en_cours', 'termine'] as const;
export type StatutSessionPersiste = (typeof STATUTS_SESSION_PERSISTES)[number];

/** `attachments.kind` (04, P1-5 : `note` = la note volante du 03 §17.4). */
export const TYPES_DE_PIECE = ['photo', 'document', 'audio', 'note'] as const;
export type TypeDePiece = (typeof TYPES_DE_PIECE)[number];

/** `org_units.kind` (04, §26.3). */
export const TYPES_UNITE = [
  'groupe',
  'filiale',
  'etablissement',
  'direction',
  'service',
  'equipe',
  'poste',
] as const;

/** `org_units.status` (04, §25.3 : une proposition terrain naît `proposee`). */
export const STATUTS_UNITE = ['active', 'proposee', 'fusionnee'] as const;

/** `answers.source` (04, §27.1 : provenance du constat). */
export const SOURCES_REPONSE = [
  'entretien',
  'observation',
  'demonstration',
  'document',
  'releve',
] as const;

/** `answers.withheld_reason` (04, §27.4). */
export const MOTIFS_NON_COMMUNIQUE = [
  'confidentiel',
  'non_disponible',
  'hors_perimetre',
  'autre',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// LES INDEX EN CLAIR — un type par table
// ─────────────────────────────────────────────────────────────────────────────
/**
 * `supprimeLe` porte le `delete_soft` du 11 §4 : invariant 7, une ligne effacée au
 * terrain reste dans la base locale et remonte comme une modification. Elle n'est
 * PAS indexée (IndexedDB ignore les lignes dont la clé indexée est `null`, ce qui
 * rendrait l'index menteur) : les écrans filtrent en mémoire.
 */
export interface IndexMission {
  readonly id: string;
  readonly status: string;
  readonly clientUpdatedAt: string;
  readonly supprimeLe: string | null;
}

export interface IndexMissionQuestion {
  readonly id: string;
  readonly missionId: string;
  readonly position: number;
  /** Texte FIGÉ de la question (04 `text_snapshot`) — contenu siège, jamais personnel. */
  readonly texteSnapshot: string;
  /** Jetons de recherche du texte figé — 03 §25.4, hors ligne (index `multiEntry`). */
  readonly motsCles: readonly string[];
  readonly answerType: (typeof TYPES_DE_REPONSE)[number];
  readonly criticality: (typeof CRITICITES)[number];
  readonly clientUpdatedAt: string;
  readonly supprimeLe: string | null;
}

export interface IndexOrgUnit {
  readonly id: string;
  readonly missionId: string;
  readonly parentId: string | null;
  readonly kind: (typeof TYPES_UNITE)[number];
  readonly status: (typeof STATUTS_UNITE)[number];
  readonly position: number;
  readonly clientUpdatedAt: string;
  readonly supprimeLe: string | null;
}

export interface IndexInterview {
  readonly id: string;
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly kind: TypeDeSession;
  readonly status: StatutSessionPersiste;
  readonly scheduleStatus: (typeof STATUTS_PLANIFICATION)[number];
  /** ISO 8601 UTC, ou `null` si la session n'est pas encore posée à l'agenda. */
  readonly scheduledAt: string | null;
  readonly clientUpdatedAt: string;
  readonly supprimeLe: string | null;
}

export interface IndexAnswer {
  readonly id: string;
  readonly missionId: string;
  readonly interviewId: string;
  readonly missionQuestionId: string;
  readonly flagReview: Drapeau;
  readonly notApplicable: Drapeau;
  readonly withheld: Drapeau;
  readonly horsParcours: Drapeau;
  readonly clientUpdatedAt: string;
  readonly supprimeLe: string | null;
}

export interface IndexAttachment {
  readonly id: string;
  readonly missionId: string;
  /** `null` sur une note volante non encore rattachée (P1-5). */
  readonly interviewId: string | null;
  readonly answerId: string | null;
  readonly kind: TypeDePiece;
  readonly clientUpdatedAt: string;
  readonly supprimeLe: string | null;
}

export interface IndexWorkAssignment {
  readonly id: string;
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly clientUpdatedAt: string;
  readonly supprimeLe: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LES CHARGES CHIFFRÉES — schéma Zod obligatoire (le coffre valide au déchiffrement)
// ─────────────────────────────────────────────────────────────────────────────
const isoOuNull = z.string().nullable();

export const chargeMissionSchema = z.object({
  titre: z.string(),
  companyId: z.uuid(),
  /** 03 §22.2 : le fuseau de la mission, pour l'AFFICHAGE seulement. */
  timezone: z.string(),
  auditLevel: z.string(),
  geoScope: z.enum(['france', 'multi_pays']),
  countryCode: z.string().nullable(),
  startPlanned: isoOuNull,
  endPlanned: isoOuNull,
  /** `mission_users.role_on_mission` de l'auditeur de cet appareil (04). */
  roleSurMission: z.string(),
});
export type ChargeMission = z.infer<typeof chargeMissionSchema>;

export const chargeMissionQuestionSchema = z.object({
  questionId: z.uuid(),
  questionVersion: z.number().int(),
  /** Consigne + ANCRES de cotation (04 `guidance_snapshot`, 03 §33.3). */
  guidanceSnapshot: z.string().nullable(),
  optionsSnapshot: z.unknown(),
  scoringSnapshot: z.unknown(),
  weightSnapshot: z.number().nullable(),
  allowRangeSnapshot: z.boolean(),
  addedAdHoc: z.boolean(),
  blockCode: z.string().nullable(),
});
export type ChargeMissionQuestion = z.infer<typeof chargeMissionQuestionSchema>;

export const chargeOrgUnitSchema = z.object({
  name: z.string(),
  countryCode: z.string().nullable(),
  timezone: z.string().nullable(),
  headcount: z.number().int().nullable(),
  serviceRefId: z.uuid().nullable(),
  sectorId: z.uuid().nullable(),
  /** 03 §25.1 : hors périmètre = données CONSERVÉES, exclues du scoring. */
  inScope: z.boolean(),
  proposedBy: z.uuid().nullable(),
  mergedIntoId: z.uuid().nullable(),
  clientCreatedAt: z.string(),
});
export type ChargeOrgUnit = z.infer<typeof chargeOrgUnitSchema>;

export const chargeInterviewSchema = z.object({
  /** 05 §9.9 : le PROPRIÉTAIRE — seul habilité à écrire cette session via la sync. */
  conductedBy: z.uuid(),
  mode: z.enum(MODES_ENTRETIEN).nullable(),
  personName: z.string().nullable(),
  personRole: z.string().nullable(),
  personServiceId: z.uuid().nullable(),
  personEmail: z.string().nullable(),
  /** 03 §28.1 atelier : `[{nom, fonction}]`. */
  participants: z.array(z.object({ nom: z.string(), fonction: z.string() })).nullable(),
  generalNotes: z.string().nullable(),
  linkedReviewAnswerId: z.uuid().nullable(),
  documentRequestId: z.uuid().nullable(),
  consentGiven: z.boolean(),
  consentAudio: z.boolean(),
  consentedAt: isoOuNull,
  /** 06 §10.4 : la mention d'information est VERSIONNÉE, sa version est portée ici. */
  informationNoticeVersion: z.string().nullable(),
  noticeShownAt: isoOuNull,
  scheduledDurationMin: z.number().int().nullable(),
  startedAt: isoOuNull,
  endedAt: isoOuNull,
  /**
   * 03 §19.1 « terminer n'est pas valider » — le 04 n'a pas de colonne pour cela
   * (voir `STATUTS_SESSION_PERSISTES`). `null` = terminée mais non validée, donc
   * ROUVRABLE.
   */
  valideeLe: isoOuNull,
  clientCreatedAt: z.string(),
});
export type ChargeInterview = z.infer<typeof chargeInterviewSchema>;

export const chargeAnswerSchema = z.object({
  value: valeurReponseSchema.nullable(),
  note: z.string().nullable(),
  reviewReason: z.string().nullable(),
  naReason: z.string().nullable(),
  withheldReason: z.enum(MOTIFS_NON_COMMUNIQUE).nullable(),
  source: z.enum(SOURCES_REPONSE),
  /** Redondance volontaire (04, décision V1) : la question telle qu'elle a été posée. */
  questionTextSnapshot: z.string(),
  revision: z.number().int().min(1),
  clientCreatedAt: z.string(),
});
export type ChargeAnswer = z.infer<typeof chargeAnswerSchema>;

export const chargeAttachmentSchema = z.object({
  /** P1-5 : le corps de la note volante. Contenu libre = donnée personnelle potentielle. */
  content: z.string().nullable(),
  filename: z.string().nullable(),
  mime: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  purgeAfter: z.string().nullable(),
  /** Amendement S-3 du 04 : propriétaire d'une note volante non rattachée. */
  createdBy: z.uuid(),
  clientCreatedAt: z.string(),
});
export type ChargeAttachment = z.infer<typeof chargeAttachmentSchema>;

export const chargeWorkAssignmentSchema = z.object({
  userId: z.uuid(),
  plannedInterviews: z.number().int().nullable(),
  plannedDays: z.number().nullable(),
  dateFrom: isoOuNull,
  dateTo: isoOuNull,
});
export type ChargeWorkAssignment = z.infer<typeof chargeWorkAssignmentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// LA CORRESPONDANCE TABLE → (INDEX, CHARGE)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Les sept tables miroirs du 05 §9.1 (`outbox` et `meta` ne sont pas des miroirs).
 * Ces deux interfaces sont la SOURCE unique : `ClesIndex<E>` et `ChargeUtile<E>`
 * du port d'écriture en dérivent, ce qui rend le §3.2 vérifiable par le
 * compilateur plutôt que par la vigilance (`LOT_L5.md` §2, dernier paragraphe).
 */
export interface IndexParTable {
  missions: IndexMission;
  missionQuestions: IndexMissionQuestion;
  orgUnits: IndexOrgUnit;
  interviews: IndexInterview;
  answers: IndexAnswer;
  attachments: IndexAttachment;
  workAssignments: IndexWorkAssignment;
}

export interface ChargeParTable {
  missions: ChargeMission;
  missionQuestions: ChargeMissionQuestion;
  orgUnits: ChargeOrgUnit;
  interviews: ChargeInterview;
  answers: ChargeAnswer;
  attachments: ChargeAttachment;
  workAssignments: ChargeWorkAssignment;
}

export type TableMiroir = keyof IndexParTable;
export type IndexDeTable<T extends TableMiroir> = IndexParTable[T];
export type ChargeDeTable<T extends TableMiroir> = ChargeParTable[T];

/** La ligne réellement stockée : l'en-tête en clair + la charge chiffrée. */
export type LigneLocale<T extends TableMiroir> = IndexDeTable<T> & { readonly charge: Enveloppe };

/**
 * Le schéma Zod de la charge, par table. Le coffre EXIGE un schéma au
 * déchiffrement (`Coffre.dechiffrer`) : cette table est ce qui rend la garantie
 * automatique au lieu de dépendre de l'appelant.
 */
export const SCHEMA_CHARGE: {
  readonly [T in TableMiroir]: z.ZodType<ChargeDeTable<T>>;
} = {
  missions: chargeMissionSchema,
  missionQuestions: chargeMissionQuestionSchema,
  orgUnits: chargeOrgUnitSchema,
  interviews: chargeInterviewSchema,
  answers: chargeAnswerSchema,
  attachments: chargeAttachmentSchema,
  workAssignments: chargeWorkAssignmentSchema,
};

/** Schéma d'une ligne locale complète — utilisé à l'IMPORT d'une sauvegarde (11 §4). */
export const ligneStockeeSchema = z.looseObject({
  id: z.uuid(),
  charge: enveloppeSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// JETONS DE RECHERCHE (03 §25.4, hors ligne)
// ─────────────────────────────────────────────────────────────────────────────
/** Mots trop courts pour discriminer : indexer « de » sur 240 questions ne sert rien. */
const LONGUEUR_JETON_MIN = 3;

/**
 * Découpe un texte en jetons normalisés : minuscules, sans accents, sans
 * ponctuation. La normalisation est la MÊME à l'indexation et à la recherche —
 * c'est la seule façon que « périmètre » retrouve « perimetre » sur un clavier
 * de tablette, où les accents se perdent.
 */
export function jetonsDeRecherche(texte: string): string[] {
  const normalise = texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const jetons = new Set<string>();
  for (const mot of normalise.split(/[^a-z0-9]+/)) {
    if (mot.length >= LONGUEUR_JETON_MIN) jetons.add(mot);
  }
  return [...jetons];
}
