// =============================================================================
// SCHÉMA DRIZZLE — POUR LES REQUÊTES TYPÉES UNIQUEMENT
//
// RAPPEL CAPITAL (11 §2) : « le fichier 04 se transcrit LITTÉRALEMENT en migrations
// SQL ; Drizzle ne sert QU'AUX REQUÊTES TYPÉES ». Ce fichier REFLÈTE les migrations
// `apps/api/drizzle/*.sql` — il ne les produit pas, et il n'est JAMAIS la source du
// DDL. Le DDL vit exclusivement dans docs/04_MODELE_DE_DONNEES.md.
//
// Conséquences pratiques, à ne pas contourner :
//   · on n'exécute pas `drizzle-kit generate` contre ce fichier pour fabriquer une
//     migration : ce serait une SECONDE source de vérité face au fichier 04, et le
//     diff schéma-vs-04 la révélerait aussitôt ;
//   · les CHECK, index et contraintes vivent dans le SQL. On ne les redéclare pas
//     ici : ce qui est décrit deux fois finit par diverger. Seuls figurent les
//     éléments dont le TYPAGE des requêtes a besoin — colonnes et clés primaires
//     (y compris composites, pour que `db.select().from(t).where(eq(t.pk, …))`
//     soit correct) ;
//   · toute correction se fait D'ABORD dans une migration SQL, puis ici.
//
// NOMMAGE (11 §3) : `snake_case` en base ↔ `camelCase` en TS, jamais de mélange.
// Le premier argument de chaque colonne est le nom RÉEL en base ; le nom de la
// propriété est sa forme camelCase.
//
// TYPAGE DES ÉNUMÉRATIONS : chaque CHECK enum du fichier 04 est exporté ici en
// `const … as const` + type dérivé, et appliqué à la colonne via `$type<…>()`.
// C'est ce qui rend les requêtes réellement typées — et ce qui fera échouer la
// compilation le jour où quelqu'un écrira `status: 'en-cours'`. Aucun `any`.
// Traçabilité : E17 (stack imposée), E43.
// =============================================================================
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ═══════════════════════════════════════════════════════════════════════════════
// ÉNUMÉRATIONS — reprises une à une des CHECK du fichier 04
// ═══════════════════════════════════════════════════════════════════════════════

export const ROLES_UTILISATEUR = ['admin', 'consultant', 'analyste', 'lecteur'] as const;
export type RoleUtilisateur = (typeof ROLES_UTILISATEUR)[number];

export const PROFILS_USAGE = ['guide_strict', 'expert'] as const;
export type ProfilUsage = (typeof PROFILS_USAGE)[number];

export const GROUPES_INTERLOCUTEUR = ['direction', 'encadrement', 'terrain'] as const;
export type GroupeInterlocuteur = (typeof GROUPES_INTERLOCUTEUR)[number];

export const PERIMETRES_GEO = ['france', 'multi_pays'] as const;
export type PerimetreGeo = (typeof PERIMETRES_GEO)[number];

export const NIVEAUX_AUDIT = ['diagnostic_cadrage', 'operationnel', 'strategique_groupe'] as const;
export type NiveauAudit = (typeof NIVEAUX_AUDIT)[number];

export const OFFRES_COMMERCIALES = [
  'audit_flash',
  'audit_cible',
  'mission_pme',
  'mission_eti',
  'grand_programme',
] as const;
export type OffreCommerciale = (typeof OFFRES_COMMERCIALES)[number];

/** Le pivot de la machine à états mission (03 §32.2). `cloturee` est TERMINAL. */
export const STATUTS_MISSION = [
  'preparation',
  'en_cours',
  'en_analyse',
  'livree',
  'cloturee',
] as const;
export type StatutMission = (typeof STATUTS_MISSION)[number];

export const FOURNISSEURS_LLM = ['anthropic', 'ue_hosted'] as const;
export type FournisseurLlm = (typeof FOURNISSEURS_LLM)[number];

export const ROLES_SUR_MISSION = ['lead', 'consultant', 'analyste', 'lecteur'] as const;
export type RoleSurMission = (typeof ROLES_SUR_MISSION)[number];

export const TYPES_UNITE = [
  'groupe',
  'filiale',
  'etablissement',
  'direction',
  'service',
  'equipe',
  'poste',
] as const;
export type TypeUnite = (typeof TYPES_UNITE)[number];

export const STATUTS_UNITE = ['active', 'proposee', 'fusionnee'] as const;
export type StatutUnite = (typeof STATUTS_UNITE)[number];

export const STATUTS_QUESTION = ['draft', 'active', 'archived'] as const;
export type StatutQuestion = (typeof STATUTS_QUESTION)[number];

export const TYPES_REPONSE = [
  'yes_no',
  'scale_1_5',
  'single_choice',
  'multi_choice',
  'free_text',
  'number',
  'percent',
  'duration',
  'money',
  'date',
  'table',
] as const;
export type TypeReponse = (typeof TYPES_REPONSE)[number];

export const CRITICITES = ['bloquant', 'important', 'informatif'] as const;
export type Criticite = (typeof CRITICITES)[number];

/** Provenance attendue / constatée d'une donnée (§27.1, §27.6). */
export const SOURCES_DONNEE = [
  'entretien',
  'observation',
  'demonstration',
  'document',
  'releve',
] as const;
export type SourceDonnee = (typeof SOURCES_DONNEE)[number];

export const PORTEES_GEO_QUESTION = ['france', 'multi_pays', 'tous'] as const;
export type PorteeGeoQuestion = (typeof PORTEES_GEO_QUESTION)[number];

export const ORIGINES_QUESTION = ['banque', 'ad_hoc'] as const;
export type OrigineQuestion = (typeof ORIGINES_QUESTION)[number];

/** TYPE de session — distinct du MODE d'entretien (décision V2.2 §32.6). */
export const TYPES_SESSION = [
  'entretien',
  'observation',
  'demonstration',
  'analyse_documentaire',
  'releve_donnees',
  'atelier',
] as const;
export type TypeSession = (typeof TYPES_SESSION)[number];

/** MODE d'entretien — 'complementaire' est un mode, jamais un type (§32.6). */
export const MODES_ENTRETIEN = ['sur_site', 'distanciel', 'complementaire'] as const;
export type ModeEntretien = (typeof MODES_ENTRETIEN)[number];

export const STATUTS_PLANIFICATION = [
  'a_planifier',
  'planifie',
  'confirme',
  'realise',
  'reporte',
  'annule',
] as const;
export type StatutPlanification = (typeof STATUTS_PLANIFICATION)[number];

export const STATUTS_SESSION = ['non_demarre', 'en_cours', 'termine'] as const;
export type StatutSession = (typeof STATUTS_SESSION)[number];

export const MOTIFS_NON_COMMUNIQUE = [
  'confidentiel',
  'non_disponible',
  'hors_perimetre',
  'autre',
] as const;
export type MotifNonCommunique = (typeof MOTIFS_NON_COMMUNIQUE)[number];

export const ORIGINES_REVISION = ['terrain', 'sync_arbitrage', 'correction_siege'] as const;
export type OrigineRevision = (typeof ORIGINES_REVISION)[number];

export const TYPES_PIECE_JOINTE = ['photo', 'document', 'audio', 'note'] as const;
export type TypePieceJointe = (typeof TYPES_PIECE_JOINTE)[number];

export const CATEGORIES_OUTIL = [
  'erp',
  'crm',
  'bureautique',
  'metier',
  'ia',
  'fichier_excel',
  'papier',
  'autre',
] as const;
export type CategorieOutil = (typeof CATEGORIES_OUTIL)[number];

export const CRITICITES_OUTIL = ['critique', 'importante', 'faible'] as const;
export type CriticiteOutil = (typeof CRITICITES_OUTIL)[number];

export const ROLES_ACTEUR_IA = ['deployeur', 'fournisseur', 'les_deux'] as const;
export type RoleActeurIa = (typeof ROLES_ACTEUR_IA)[number];

export const NIVEAUX_RISQUE_IA = [
  'inacceptable',
  'haut_risque',
  'risque_limite_art50',
  'minimal',
] as const;
export type NiveauRisqueIa = (typeof NIVEAUX_RISQUE_IA)[number];

export const STATUTS_CONFORMITE = ['conforme', 'partiel', 'non_conforme', 'a_qualifier'] as const;
export type StatutConformite = (typeof STATUTS_CONFORMITE)[number];

export const SOURCES_SYSTEME_IA = ['declare', 'detecte_entretien'] as const;
export type SourceSystemeIa = (typeof SOURCES_SYSTEME_IA)[number];

export const SEVERITES_CONSTAT = ['drapeau_rouge', 'majeur', 'mineur', 'point_fort'] as const;
export type SeveriteConstat = (typeof SEVERITES_CONSTAT)[number];

export const STATUTS_REMEDIATION = [
  'a_traiter',
  'planifie',
  'en_cours',
  'clos',
  'abandonne',
] as const;
export type StatutRemediation = (typeof STATUTS_REMEDIATION)[number];

export const VAGUES = ['quick_win', 'chantier', 'transformation'] as const;
export type Vague = (typeof VAGUES)[number];

export const STATUTS_CONSTAT = ['brouillon', 'valide'] as const;
export type StatutConstat = (typeof STATUTS_CONSTAT)[number];

export const STATUTS_CAS_USAGE = ['candidate', 'short_list', 'ecarte', 'retenu'] as const;
export type StatutCasUsage = (typeof STATUTS_CAS_USAGE)[number];

export const COMPLEXITES = ['faible', 'moyenne', 'elevee'] as const;
export type Complexite = (typeof COMPLEXITES)[number];

export const NIVEAUX_RISQUE = ['faible', 'moyen', 'eleve'] as const;
export type NiveauRisque = (typeof NIVEAUX_RISQUE)[number];

export const DISPONIBILITES_DONNEE = ['oui', 'partiel', 'non', 'a_verifier'] as const;
export type DisponibiliteDonnee = (typeof DISPONIBILITES_DONNEE)[number];

export const APPROCHES = ['acheter', 'integrer', 'developper'] as const;
export type Approche = (typeof APPROCHES)[number];

export const SCENARIOS = ['standard', 'prudent', 'ambitieux'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const STATUTS_SECTION = ['brut', 'genere', 'valide'] as const;
export type StatutSection = (typeof STATUTS_SECTION)[number];

export const TYPES_GABARIT = ['rapport', 'point_etape'] as const;
export type TypeGabarit = (typeof TYPES_GABARIT)[number];

export const FORMATS_FICHIER_RAPPORT = ['docx', 'pdf', 'pptx'] as const;
export type FormatFichierRapport = (typeof FORMATS_FICHIER_RAPPORT)[number];

export const STATUTS_CHIFFRAGE = ['brouillon', 'envoye_console', 'signe', 'abandonne'] as const;
export type StatutChiffrage = (typeof STATUTS_CHIFFRAGE)[number];

export const DECISIONS_RECALAGE = ['absorbe', 'avenant', 'descope'] as const;
export type DecisionRecalage = (typeof DECISIONS_RECALAGE)[number];

export const STATUTS_DEMANDE_DOCUMENT = ['demande', 'recu', 'partiel', 'non_disponible'] as const;
export type StatutDemandeDocument = (typeof STATUTS_DEMANDE_DOCUMENT)[number];

/** Énumération FERMÉE des codes d'étape (V2.2 §32.2, P1-1). */
export const CODES_ETAPE = [
  'cadrage',
  'preparation',
  'collecte',
  'analyse',
  'rapport',
  'livraison',
  'entretien',
  'unite',
] as const;
export type CodeEtape = (typeof CODES_ETAPE)[number];

export const PORTEES_VALIDATION = ['mission', 'interview', 'org_unit'] as const;
export type PorteeValidation = (typeof PORTEES_VALIDATION)[number];

export const STATUTS_ALERTE = ['active', 'acquittee', 'resolue'] as const;
export type StatutAlerte = (typeof STATUTS_ALERTE)[number];

export const DIRECTIONS_SYNC = ['push', 'pull'] as const;
export type DirectionSync = (typeof DIRECTIONS_SYNC)[number];

export const DIRECTIONS_INTEGRATION = ['in', 'out'] as const;
export type DirectionIntegration = (typeof DIRECTIONS_INTEGRATION)[number];

export const SYSTEMES_INTEGRES = ['console', 'crm_pro'] as const;
export type SystemeIntegre = (typeof SYSTEMES_INTEGRES)[number];

export const STATUTS_EVENEMENT = ['pending', 'ok', 'failed'] as const;
export type StatutEvenement = (typeof STATUTS_EVENEMENT)[number];

// ═══════════════════════════════════════════════════════════════════════════════
// Raccourcis de colonnes récurrentes
// ═══════════════════════════════════════════════════════════════════════════════

/** TIMESTAMPTZ — invariant 5 : la base vit en UTC, le fuseau de mission n'est qu'un affichage. */
const horodatage = (nom: string) => timestamp(nom, { withTimezone: true });

// ═══════════════════════════════════════════════════════════════════════════════
// RÉFÉRENTIELS
// ═══════════════════════════════════════════════════════════════════════════════

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<RoleUtilisateur>().notNull(),
  usageProfile: text('usage_profile').$type<ProfilUsage>().notNull(),
  /** §34.4 — l'affectation `mission_users` est REFUSÉE côté serveur si NULL. */
  habilitatedAt: horodatage('habilitated_at'),
  isActive: boolean('is_active').notNull(),
  lastLoginAt: horodatage('last_login_at'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: horodatage('expires_at').notNull(),
  revokedAt: horodatage('revoked_at'),
  deviceLabel: text('device_label'),
});

export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  labelFr: text('label_fr').notNull(),
  labelEn: text('label_en'),
  isActive: boolean('is_active').notNull(),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  labelFr: text('label_fr').notNull(),
});

export const interlocutorProfiles = pgTable('interlocutor_profiles', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  labelFr: text('label_fr').notNull(),
  /** §32.1 — base du calcul de divergence direction / terrain. */
  groupCode: text('group_code').$type<GroupeInterlocuteur>().notNull(),
});

export const sizeTiers = pgTable('size_tiers', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  headcountMin: integer('headcount_min'),
  headcountMax: integer('headcount_max'),
});

export const nafSectorMap = pgTable('naf_sector_map', {
  nafCode: text('naf_code').primaryKey(),
  sectorId: uuid('sector_id').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTS & MISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey(),
  externalRef: text('external_ref'),
  name: text('name').notNull(),
  /** NULL autorisé (filiales étrangères) ; unicité par index PARTIEL, clé de dédup R3. */
  siren: text('siren'),
  nafCode: text('naf_code'),
  sectorId: uuid('sector_id'),
  headcount: integer('headcount'),
  sitesCount: integer('sites_count'),
  countries: jsonb('countries').notNull(),
  notes: text('notes'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
  deletedAt: horodatage('deleted_at'),
});

export const missions = pgTable('missions', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  /** Consolidation groupe → missions filles (§32.3). */
  parentMissionId: uuid('parent_mission_id'),
  title: text('title').notNull(),
  geoScope: text('geo_scope').$type<PerimetreGeo>().notNull(),
  countryCode: text('country_code'),
  sizeTierId: uuid('size_tier_id'),
  activeSectors: jsonb('active_sectors').notNull(),
  activeBlocks: jsonb('active_blocks').notNull(),
  auditLevel: text('audit_level').$type<NiveauAudit>().notNull(),
  commercialOffer: text('commercial_offer').$type<OffreCommerciale>(),
  timezone: text('timezone').notNull(),
  ndaRef: text('nda_ref'),
  ndaSignedAt: date('nda_signed_at'),
  status: text('status').$type<StatutMission>().notNull(),
  llmProvider: text('llm_provider').$type<FournisseurLlm>().notNull(),
  startPlanned: date('start_planned'),
  endPlanned: date('end_planned'),
  deliveredAt: horodatage('delivered_at'),
  createdBy: uuid('created_by'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
  deletedAt: horodatage('deleted_at'),
});

export const missionUsers = pgTable(
  'mission_users',
  {
    missionId: uuid('mission_id').notNull(),
    userId: uuid('user_id').notNull(),
    roleOnMission: text('role_on_mission').$type<RoleSurMission>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.userId] })],
);

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANISATION
// ═══════════════════════════════════════════════════════════════════════════════

export const orgUnits = pgTable('org_units', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  parentId: uuid('parent_id'),
  kind: text('kind').$type<TypeUnite>().notNull(),
  name: text('name').notNull(),
  countryCode: text('country_code'),
  /** §22.2 — NULL = fuseau de la mission (héritage par l'arbre). */
  timezone: text('timezone'),
  headcount: integer('headcount'),
  serviceRefId: uuid('service_ref_id'),
  sectorId: uuid('sector_id'),
  /** §25.1 — sortie de périmètre : données conservées, exclues du scoring. */
  inScope: boolean('in_scope').notNull(),
  status: text('status').$type<StatutUnite>().notNull(),
  proposedBy: uuid('proposed_by'),
  mergedIntoId: uuid('merged_into_id'),
  position: integer('position'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE
// ═══════════════════════════════════════════════════════════════════════════════

export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  labelFr: text('label_fr').notNull(),
  position: integer('position'),
  isDefault: boolean('is_default').notNull(),
  description: text('description'),
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey(),
  /** Identifiant STABLE de banque (clé du ré-import §36.4) ; NULL pour les ad hoc. */
  code: text('code'),
  blockId: uuid('block_id').notNull(),
  version: integer('version').notNull(),
  status: text('status').$type<StatutQuestion>().notNull(),
  textFr: text('text_fr').notNull(),
  /** Consigne + ANCRES DE COTATION §32.4 (obligatoires sur les échelles). */
  guidanceFr: text('guidance_fr'),
  answerType: text('answer_type').$type<TypeReponse>().notNull(),
  options: jsonb('options'),
  allowRange: boolean('allow_range').notNull(),
  weight: numeric('weight').notNull(),
  scoring: jsonb('scoring'),
  criticality: text('criticality').$type<Criticite>().notNull(),
  expectedSource: text('expected_source').$type<SourceDonnee>(),
  sectors: jsonb('sectors').notNull(),
  targetServices: jsonb('target_services').notNull(),
  levels: jsonb('levels').notNull(),
  headcountMin: integer('headcount_min'),
  headcountMax: integer('headcount_max'),
  profiles: jsonb('profiles').notNull(),
  geo: text('geo').$type<PorteeGeoQuestion>().notNull(),
  displayIf: jsonb('display_if'),
  origin: text('origin').$type<OrigineQuestion>().notNull(),
  originMissionId: uuid('origin_mission_id'),
  createdBy: uuid('created_by'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

export const questionTranslations = pgTable(
  'question_translations',
  {
    questionId: uuid('question_id').notNull(),
    lang: text('lang').notNull(),
    text: text('text'),
    guidance: text('guidance'),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.lang] })],
);

export const missionQuestions = pgTable('mission_questions', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  questionId: uuid('question_id').notNull(),
  questionVersion: integer('question_version'),
  /** T13 (0012) — texte figé rendu HORS LIGNE : identité de la question dans la mission. */
  textSnapshot: text('text_snapshot').notNull(),
  optionsSnapshot: jsonb('options_snapshot'),
  weightSnapshot: numeric('weight_snapshot'),
  scoringSnapshot: jsonb('scoring_snapshot'),
  guidanceSnapshot: text('guidance_snapshot'),
  answerTypeSnapshot: text('answer_type_snapshot').$type<TypeReponse>(),
  criticalitySnapshot: text('criticality_snapshot').$type<Criticite>(),
  allowRangeSnapshot: boolean('allow_range_snapshot'),
  position: integer('position'),
  addedAdHoc: boolean('added_ad_hoc').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTE
// ═══════════════════════════════════════════════════════════════════════════════

export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  /** PROPRIÉTAIRE de la session : seul habilité à écrire via sync (§9.9). */
  conductedBy: uuid('conducted_by').notNull(),
  kind: text('kind').$type<TypeSession>().notNull(),
  /** Défaut APPLICATIF : 'sur_site' si kind='entretien', NULL sinon (V2.8). */
  mode: text('mode').$type<ModeEntretien>(),
  linkedReviewAnswerId: uuid('linked_review_answer_id'),
  personName: text('person_name'),
  personRole: text('person_role'),
  /** P2-1 — fonction de la PERSONNE ; l'unité d'audit est TOUJOURS orgUnitId. */
  personServiceId: uuid('person_service_id'),
  personEmail: text('person_email'),
  participants: jsonb('participants'),
  orgUnitId: uuid('org_unit_id').notNull(),
  documentRequestId: uuid('document_request_id'),
  consentGiven: boolean('consent_given'),
  consentAudio: boolean('consent_audio'),
  consentedAt: horodatage('consented_at'),
  informationNoticeVersion: text('information_notice_version'),
  noticeShownAt: horodatage('notice_shown_at'),
  scheduledAt: horodatage('scheduled_at'),
  scheduledDurationMin: integer('scheduled_duration_min'),
  scheduleStatus: text('schedule_status').$type<StatutPlanification>().notNull(),
  status: text('status').$type<StatutSession>().notNull(),
  startedAt: horodatage('started_at'),
  endedAt: horodatage('ended_at'),
  generalNotes: text('general_notes'),
  clientCreatedAt: horodatage('client_created_at'),
  clientUpdatedAt: horodatage('client_updated_at'),
  syncedAt: horodatage('synced_at'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey(),
  interviewId: uuid('interview_id').notNull(),
  missionQuestionId: uuid('mission_question_id').notNull(),
  value: jsonb('value'),
  source: text('source').$type<SourceDonnee>().notNull(),
  withheld: boolean('withheld').notNull(),
  withheldReason: text('withheld_reason').$type<MotifNonCommunique>(),
  horsParcours: boolean('hors_parcours').notNull(),
  note: text('note'),
  flagReview: boolean('flag_review').notNull(),
  reviewReason: text('review_reason'),
  notApplicable: boolean('not_applicable').notNull(),
  naReason: text('na_reason'),
  questionTextSnapshot: text('question_text_snapshot'),
  revision: integer('revision').notNull(),
  clientCreatedAt: horodatage('client_created_at'),
  clientUpdatedAt: horodatage('client_updated_at'),
  syncedAt: horodatage('synced_at'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

/**
 * L'ARCHIVE DES VALEURS ÉCRASÉES — et son nom est plus étroit que son contenu.
 *
 * Depuis l'amendement S-4 (2026-08-31), cette table archive les révisions des
 * TROIS entités synchronisées : `answers`, `interviews`, `attachments`. §9.4
 * étendait le dernier-écrit-gagne aux trois et ne nommait qu'une archive, dont la
 * clé étrangère vers `answers` était obligatoire : la valeur perdante d'un
 * entretien disparaissait sans trace, en violation de l'invariant 7.
 *
 * ELLE N'A PAS ÉTÉ RENOMMÉE, et ce n'est pas du confort : le pack la nomme trois
 * fois (05 §9.3, §9.4, §9.9). La renommer mettrait le code en contradiction avec
 * trois sections non amendées.
 */
export const answerRevisions = pgTable('answer_revisions', {
  id: uuid('id').primaryKey(),
  /** NULL dès que `entityType` n'est pas 'answer' — CHECK de cohérence en base. */
  answerId: uuid('answer_id'),
  previousValue: jsonb('previous_value'),
  /** NOT NULL (0010) — invariant 7 : une révision sans auteur n'est pas tracée. */
  changedBy: uuid('changed_by').notNull(),
  changedAt: horodatage('changed_at').notNull(),
  changeOrigin: text('change_origin').$type<OrigineRevision>().notNull(),
  /** S-4 — quelle entité a été écrasée. */
  entityType: text('entity_type').$type<'answer' | 'interview' | 'attachment'>().notNull(),
  /** S-4 — l'id de la ligne archivée, quelle que soit sa table. */
  entityId: uuid('entity_id').notNull(),
});

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey(),
  interviewId: uuid('interview_id'),
  answerId: uuid('answer_id'),
  missionId: uuid('mission_id').notNull(),
  kind: text('kind').$type<TypePieceJointe>().notNull(),
  /** P1-5 — corps de la note volante (rattachement complétable après coup). */
  content: text('content'),
  filename: text('filename'),
  mime: text('mime'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  storageKey: text('storage_key'),
  transcription: text('transcription'),
  purgeAfter: date('purge_after'),
  clientCreatedAt: horodatage('client_created_at'),
  clientUpdatedAt: horodatage('client_updated_at'),
  /**
   * S-3 — LE PROPRIÉTAIRE D'UNE NOTE VOLANTE.
   * §9.9 fonde la propriété sur `interviews.conducted_by`. Une note volante a
   * `interviewId` ET `answerId` à NULL : la chaîne est rompue. Le pack ne dit
   * NULLE PART de qui elle est — la règle « le rattachement s'il existe, sinon
   * l'auteur » est une DÉCISION tracée, pas une lecture.
   */
  createdBy: uuid('created_by').notNull(),
  syncedAt: horodatage('synced_at'),
  createdAt: horodatage('created_at').notNull(),
  /**
   * S-1 — LE CURSEUR DE PULL S'APPUIE DESSUS.
   * §9.5 : « Curseur par mission (`updated_at` SERVEUR max reçu) ». Sans cette
   * colonne, une pièce jointe modifiée ne redescendait jamais au terrain.
   */
  updatedAt: horodatage('updated_at').notNull(),
});

/**
 * S-6 — L'ÉTAT D'UN ENVOI PAR MORCEAUX (§9.6).
 * Le pack exige une reprise qui « n'envoie QUE les manquants » et un 409 nommant
 * « les chunks à réémettre », sans nommer aucune table. `chunksRecus` est un
 * TABLEAU d'index et non un compteur : « n reçus » ne dirait pas « lesquels
 * manquent », et aurait eu l'air de suffire.
 */
export const attachmentUploads = pgTable('attachment_uploads', {
  attachmentId: uuid('attachment_id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  chunkSizeBytes: integer('chunk_size_bytes').notNull(),
  chunksAttendus: integer('chunks_attendus'),
  chunksRecus: jsonb('chunks_recus').$type<number[]>().notNull(),
  sha256Attendu: text('sha256_attendu'),
  statut: text('statut').$type<'en_cours' | 'assemble' | 'echec'>().notNull(),
  expireLe: horodatage('expire_le'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTAIRES & AI ACT
// ═══════════════════════════════════════════════════════════════════════════════

export const toolsInventory = pgTable('tools_inventory', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  orgUnitId: uuid('org_unit_id'),
  name: text('name').notNull(),
  category: text('category').$type<CategorieOutil>().notNull(),
  vendor: text('vendor'),
  usageDescription: text('usage_description'),
  usersCount: integer('users_count'),
  criticality: text('criticality').$type<CriticiteOutil>(),
  dataQualityNote: text('data_quality_note'),
  sourceSessionId: uuid('source_session_id'),
  createdAt: horodatage('created_at').notNull(),
});

export const aiSystems = pgTable('ai_systems', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  orgUnitId: uuid('org_unit_id'),
  name: text('name').notNull(),
  vendor: text('vendor'),
  usageDescription: text('usage_description'),
  dataCategories: jsonb('data_categories').notNull(),
  serviceId: uuid('service_id'),
  businessOwner: text('business_owner'),
  actorRole: text('actor_role').$type<RoleActeurIa>(),
  riskLevel: text('risk_level').$type<NiveauRisqueIa>(),
  obligations: jsonb('obligations').notNull(),
  complianceStatus: text('compliance_status').$type<StatutConformite>(),
  source: text('source').$type<SourceSystemeIa>(),
  notes: text('notes'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSE, SCORING & CONSTATS
// ═══════════════════════════════════════════════════════════════════════════════

export const blockScores = pgTable(
  'block_scores',
  {
    missionId: uuid('mission_id').notNull(),
    blockId: uuid('block_id').notNull(),
    score: numeric('score'),
    computedAt: horodatage('computed_at'),
    details: jsonb('details'),
    /** % de questions scorables répondues (§32.1-3). */
    completeness: numeric('completeness'),
    /** Sous le seuil `seuil_completude_bloc` : le score est affiché « indicatif ». */
    isIndicative: boolean('is_indicative').notNull(),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.blockId] })],
);

export const unitScores = pgTable(
  'unit_scores',
  {
    missionId: uuid('mission_id').notNull(),
    orgUnitId: uuid('org_unit_id').notNull(),
    blockId: uuid('block_id').notNull(),
    score: numeric('score'),
    /** Seuil de fiabilité d'affichage : `seuil_fiabilite_answers` (défaut 3). */
    answersCount: integer('answers_count'),
    completeness: numeric('completeness'),
    computedAt: horodatage('computed_at'),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.orgUnitId, t.blockId] })],
);

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  orgUnitId: uuid('org_unit_id'),
  blockId: uuid('block_id'),
  severity: text('severity').$type<SeveriteConstat>().notNull(),
  /** T13 (0012) — identité lisible du constat : NOT NULL (§16.5). */
  title: text('title').notNull(),
  statement: text('statement'),
  /** §27.2 — {answer_ids[], session_ids[], attachment_ids[]} : ≥ 1 source obligatoire. */
  sources: jsonb('sources').notNull(),
  recommendation: text('recommendation'),
  ownerSuggested: text('owner_suggested'),
  remediationStatus: text('remediation_status').$type<StatutRemediation>().notNull(),
  wave: text('wave').$type<Vague>(),
  status: text('status').$type<StatutConstat>().notNull(),
  /** NOT NULL (0010) — §16.5 : un drapeau rouge exige une validation humaine identifiable. */
  createdBy: uuid('created_by').notNull(),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAS D'USAGE & FEUILLE DE ROUTE
// ═══════════════════════════════════════════════════════════════════════════════

export const useCases = pgTable('use_cases', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  orgUnitId: uuid('org_unit_id'),
  title: text('title').notNull(),
  description: text('description'),
  serviceId: uuid('service_id'),
  status: text('status').$type<StatutCasUsage>().notNull(),
  conditions: text('conditions'),
  estimatedGain: text('estimated_gain'),
  estimatedCost: text('estimated_cost'),
  complexity: text('complexity').$type<Complexite>(),
  delayMonths: integer('delay_months'),
  riskLevel: text('risk_level').$type<NiveauRisque>(),
  wave: text('wave').$type<Vague>(),
  baselineValue: numeric('baseline_value'),
  baselineUnit: text('baseline_unit'),
  baselineSourceSessionId: uuid('baseline_source_session_id'),
  targetValue: numeric('target_value'),
  dataRequired: text('data_required'),
  dataAvailable: text('data_available').$type<DisponibiliteDonnee>(),
  approach: text('approach').$type<Approche>(),
  successMetric: text('success_metric'),
  assumptions: text('assumptions'),
  gainLow: numeric('gain_low'),
  gainHigh: numeric('gain_high'),
  paybackMonths: integer('payback_months'),
  taxonomyRef: text('taxonomy_ref'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

export const roadmapItems = pgTable('roadmap_items', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  useCaseId: uuid('use_case_id'),
  palier: integer('palier'),
  monthStart: integer('month_start'),
  monthEnd: integer('month_end'),
  /** T13 (0012) — libellé de l'action de la feuille de route (§20.3). */
  description: text('description').notNull(),
  expectedGain: text('expected_gain'),
  kpi: text('kpi'),
  assimilationWeeks: integer('assimilation_weeks'),
  baselineValue: numeric('baseline_value'),
  baselineUnit: text('baseline_unit'),
  targetValue: numeric('target_value'),
  dependsOn: jsonb('depends_on'),
  scenario: text('scenario').$type<Scenario>().notNull(),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAPPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const reportSections = pgTable('report_sections', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  blockId: uuid('block_id'),
  /** T13 (0012) — identifie le chapitre du rapport porté par la ligne. */
  sectionCode: text('section_code').notNull(),
  position: integer('position'),
  rawData: jsonb('raw_data'),
  generatedText: text('generated_text'),
  generatedAt: horodatage('generated_at'),
  llmModel: text('llm_model'),
  llmTokens: integer('llm_tokens'),
  llmCostEur: numeric('llm_cost_eur'),
  validatedText: text('validated_text'),
  validatedBy: uuid('validated_by'),
  validatedAt: horodatage('validated_at'),
  status: text('status').$type<StatutSection>().notNull(),
});

export const reportTemplates = pgTable('report_templates', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  /** V2.2 §32.6 — la clé du gabarit est le NIVEAU D'AUDIT, pas le palier. */
  auditLevel: text('audit_level').$type<NiveauAudit>(),
  kind: text('kind').$type<TypeGabarit>().notNull(),
  storageKey: text('storage_key'),
  version: integer('version'),
  isActive: boolean('is_active').notNull(),
  createdAt: horodatage('created_at').notNull(),
});

export const reportFiles = pgTable('report_files', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  templateId: uuid('template_id'),
  kind: text('kind').$type<FormatFichierRapport>().notNull(),
  storageKey: text('storage_key'),
  generatedBy: uuid('generated_by'),
  generatedAt: horodatage('generated_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CADRAGE, CHIFFRAGE & PILOTAGE
// ═══════════════════════════════════════════════════════════════════════════════

export const scopingEstimates = pgTable('scoping_estimates', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  missionId: uuid('mission_id'),
  scopeTree: jsonb('scope_tree'),
  plannedInterviews: jsonb('planned_interviews'),
  workloadDays: numeric('workload_days'),
  teamSize: integer('team_size'),
  calendarDays: integer('calendar_days'),
  scenarioLabel: text('scenario_label'),
  status: text('status').$type<StatutChiffrage>().notNull(),
  createdBy: uuid('created_by'),
  createdAt: horodatage('created_at').notNull(),
  updatedAt: horodatage('updated_at').notNull(),
});

/**
 * DONNÉES FINANCIÈRES — invariant 3 : routes ADMIN EXCLUSIVEMENT (E21).
 * Table volontairement SÉPARÉE de `scopingEstimates` (P1-3). Aucune jointure
 * depuis un endpoint consultant : la séparation physique est ce qui rend la
 * règle vérifiable au lieu d'être une intention.
 */
export const scopingFinancials = pgTable('scoping_financials', {
  scopingEstimateId: uuid('scoping_estimate_id').primaryKey(),
  dailyRates: jsonb('daily_rates'),
  travelCosts: numeric('travel_costs'),
  totalAmount: numeric('total_amount'),
  currency: text('currency').notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: horodatage('updated_at').notNull(),
});

export const estimationParams = pgTable('estimation_params', {
  key: text('key').primaryKey(),
  value: numeric('value'),
  unit: text('unit'),
  description: text('description'),
  updatedBy: uuid('updated_by'),
  updatedAt: horodatage('updated_at').notNull(),
});

export const workAssignments = pgTable('work_assignments', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  userId: uuid('user_id').notNull(),
  orgUnitId: uuid('org_unit_id').notNull(),
  plannedInterviews: integer('planned_interviews'),
  plannedDays: numeric('planned_days'),
  dateFrom: date('date_from'),
  dateTo: date('date_to'),
});

export const missionRebaselines = pgTable('mission_rebaselines', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  deltaInterviews: integer('delta_interviews'),
  deltaDays: numeric('delta_days'),
  decision: text('decision').$type<DecisionRecalage>(),
  note: text('note'),
  decidedBy: uuid('decided_by'),
  decidedAt: horodatage('decided_at'),
});

export const documentRequests = pgTable('document_requests', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  orgUnitId: uuid('org_unit_id'),
  label: text('label').notNull(),
  description: text('description'),
  status: text('status').$type<StatutDemandeDocument>().notNull(),
  attachmentId: uuid('attachment_id'),
  requestedAt: horodatage('requested_at'),
  receivedAt: horodatage('received_at'),
});

/**
 * §32.2 — la COHÉRENCE `stepCode` ↔ `scope` est une CHECK composite en base
 * (`step_validations_scope_coherence_check`) : entretien → interview,
 * unite → org_unit, tout le reste → mission. Le typage ci-dessous n'en est
 * qu'un rappel : la garantie est en base, pas dans TypeScript.
 */
export const stepValidations = pgTable('step_validations', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  stepCode: text('step_code').$type<CodeEtape>().notNull(),
  scope: text('scope').$type<PorteeValidation>().notNull(),
  scopeId: uuid('scope_id'),
  /** NOT NULL (0010) — la validation d'étape conditionne les transitions §32.2. */
  validatedBy: uuid('validated_by').notNull(),
  validatedAt: horodatage('validated_at').notNull(),
  wasOverride: boolean('was_override').notNull(),
  overrideReason: text('override_reason'),
});

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id').notNull(),
  orgUnitId: uuid('org_unit_id'),
  userId: uuid('user_id'),
  type: text('type').notNull(),
  severity: text('severity'),
  message: text('message'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  status: text('status').$type<StatutAlerte>().notNull(),
  ackBy: uuid('ack_by'),
  ackReason: text('ack_reason'),
  ackAt: horodatage('ack_at'),
  createdAt: horodatage('created_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2/3 — ABSENTES DÉLIBÉRÉMENT
//
// `surveys`, `survey_responses` et `solutions_catalog` sont rangées par le
// fichier 04 sous « PHASE 2/3 (DDL de référence — créées par les migrations de
// leurs lots) ». Arbitrage A01 du 2026-08-27 (DECISIONS.md) : elles ne sont pas
// du lot L1. Elles seront déclarées ici en même temps que leur migration —
// jamais avant, sinon ce fichier décrirait un schéma qui n'existe pas.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSVERSE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Déduplication du push (§9.2). `opId` EST l'op_id de l'outbox du client
 * (11 §4) : aucun DEFAULT en base — un id fabriqué côté serveur anéantirait
 * l'idempotence que cette table assure. Rétention 30 j (job de purge).
 */
export const processedOps = pgTable('processed_ops', {
  opId: uuid('op_id').primaryKey(),
  batchId: uuid('batch_id'),
  result: text('result'),
  processedAt: horodatage('processed_at').notNull(),
});

export const syncLog = pgTable('sync_log', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id'),
  deviceId: text('device_id'),
  direction: text('direction').$type<DirectionSync>().notNull(),
  itemsCount: integer('items_count'),
  conflictsCount: integer('conflicts_count'),
  /** V2.9 — LA donnée du garde-fou de reset de mot de passe (§9.7). */
  outboxRemaining: integer('outbox_remaining'),
  startedAt: horodatage('started_at'),
  endedAt: horodatage('ended_at'),
  status: text('status'),
  error: text('error'),
});

export const integrationEvents = pgTable('integration_events', {
  id: uuid('id').primaryKey(),
  direction: text('direction').$type<DirectionIntegration>().notNull(),
  system: text('system').$type<SystemeIntegre>().notNull(),
  /** T13 (0012) — ce qu'on lit au journal pour savoir de quel échange il s'agit. */
  eventType: text('event_type').notNull(),
  payload: jsonb('payload'),
  /** V2.2 §8.6 — anti-rejeu (nonce + horodatage d'événement). */
  nonce: text('nonce'),
  eventTimestamp: horodatage('event_timestamp'),
  status: text('status').$type<StatutEvenement>().notNull(),
  attempts: integer('attempts').notNull(),
  lastAttemptAt: horodatage('last_attempt_at'),
  createdAt: horodatage('created_at').notNull(),
});

/**
 * RGPD (§10.4) : rétention 12 mois puis purge, IP anonymisée à 90 j.
 * Interdiction 11 §2 : aucune donnée personnelle dans `meta` (pas de
 * `person_name`, pas d'email, pas de contenu de réponse).
 */
export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  meta: jsonb('meta'),
  ip: text('ip'),
  createdAt: horodatage('created_at').notNull(),
});

export const llmCalls = pgTable('llm_calls', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id'),
  sectionId: uuid('section_id'),
  provider: text('provider'),
  model: text('model'),
  promptVersion: text('prompt_version'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costEur: numeric('cost_eur'),
  durationMs: integer('duration_ms'),
  status: text('status'),
  createdAt: horodatage('created_at').notNull(),
});

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
});
