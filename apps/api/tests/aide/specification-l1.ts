// =============================================================================
// LA SPÉCIFICATION, TRANSCRITE À LA MAIN DEPUIS LE PACK — PAS DEPUIS LE CODE
//
// Ce fichier est la SECONDE lecture du fichier 04 et du contrat 11 §5, faite par
// A16 indépendamment de la transcription d'A12 (09 §5.6). C'est cette
// indépendance qui donne sa valeur à la suite : si les deux lectures divergent,
// les tests rougissent, et c'est le résultat attendu du dispositif.
//
// Sources, et RIEN d'autre :
//   • docs/04_MODELE_DE_DONNEES.md §7 (DDL), §7.1 (index critiques)
//   • docs/11_CONTRAT_TECHNIQUE.md §5 (valeurs littérales du seed), §2 (interdits)
//   • docs/07_PLAN_TESTS_RISQUES.md §12 ligne L1 (critères d'acceptation)
// =============================================================================

/**
 * Tables du fichier 04 §7 attendues DÈS LE LOT L1.
 * Les trois tables de la section « PHASE 2/3 » en sont exclues : le fichier 04
 * dit explicitement qu'elles sont « créées par les migrations de leurs lots ».
 */
export const TABLES_ATTENDUES_L1: readonly string[] = [
  // Référentiels
  'users',
  'refresh_tokens',
  'sectors',
  'services',
  'interlocutor_profiles',
  'size_tiers',
  'naf_sector_map',
  // Clients & missions
  'companies',
  'missions',
  'mission_users',
  // Organisation
  'org_units',
  // Questionnaire
  'blocks',
  'questions',
  'question_translations',
  'mission_questions',
  // Collecte
  'interviews',
  'answers',
  'answer_revisions',
  'attachments',
  // Inventaires & AI Act
  'tools_inventory',
  'ai_systems',
  // Analyse, scoring & constats
  'block_scores',
  'unit_scores',
  'findings',
  // Cas d'usage & feuille de route
  'use_cases',
  'roadmap_items',
  // Rapport
  'report_sections',
  'report_templates',
  'report_files',
  // Cadrage, chiffrage & pilotage
  'scoping_estimates',
  'scoping_financials',
  'estimation_params',
  'work_assignments',
  'mission_rebaselines',
  'document_requests',
  'step_validations',
  'alerts',
  // Transverse
  'processed_ops',
  'sync_log',
  'integration_events',
  'activity_log',
  'llm_calls',
  'app_settings',
];

/** Tables de la section « PHASE 2/3 » du fichier 04 : NON exigées au lot L1. */
export const TABLES_PHASE_2_3: readonly string[] = [
  'surveys',
  'survey_responses',
  'solutions_catalog',
];

// -----------------------------------------------------------------------------
// Seed — valeurs littérales du contrat 11 §5
// -----------------------------------------------------------------------------

/** 11 §5 : « 9 blocs (codes `bloc_1`…`bloc_9`) ». */
export const CODES_BLOCS: readonly string[] = [
  'bloc_1',
  'bloc_2',
  'bloc_3',
  'bloc_4',
  'bloc_5',
  'bloc_6',
  'bloc_7',
  'bloc_8',
  'bloc_9',
];

/** 11 §5 : les 11 fonctions métier de la taxonomie (`services`). */
export const CODES_SERVICES: readonly string[] = [
  'rh',
  'finance_compta',
  'commercial_ventes',
  'marketing_contenu',
  'service_client',
  'logistique_operations',
  'production',
  'juridique_conformite',
  'dsi_data',
  'direction_generale',
  'support_admin',
];

/**
 * 11 §5 : les 9 profils d'interlocuteur AVEC leur `group_code`.
 * Le `group_code` n'est pas décoratif : il est « la base du calcul de divergence
 * direction/terrain » (04 §7, V2.2 §32.1).
 */
export const PROFILS_INTERLOCUTEUR: readonly { code: string; groupe: string }[] = [
  { code: 'dirigeant', groupe: 'direction' },
  { code: 'dsi', groupe: 'direction' },
  { code: 'daf', groupe: 'direction' },
  { code: 'drh', groupe: 'direction' },
  { code: 'resp_metier', groupe: 'encadrement' },
  { code: 'chef_equipe', groupe: 'encadrement' },
  { code: 'salarie', groupe: 'terrain' },
  { code: 'technicien_operateur', groupe: 'terrain' },
  { code: 'autre', groupe: 'terrain' },
];

export const GROUPES_INTERLOCUTEUR: readonly string[] = ['direction', 'encadrement', 'terrain'];

/**
 * 11 §5 : « Paliers (`size_tiers`) : micro 1-10 · pme 11-249 · eti 250-4999 ·
 * grand_compte 5000+ ». Le contrat donne des bornes DISJOINTES ; le fichier 01
 * §2.3 donne des bornes de lecture (10-250, 250-5 000) qui se chevauchent — le
 * contrat 11 est la référence d'IMPLÉMENTATION du seed (voir DECISIONS.md).
 */
export const PALIERS: readonly { code: string; min: number; max: number | null }[] = [
  { code: 'micro', min: 1, max: 10 },
  { code: 'pme', min: 11, max: 249 },
  { code: 'eti', min: 250, max: 4999 },
  { code: 'grand_compte', min: 5000, max: null },
];

/**
 * 11 §5 + 04 §7 : les trois SEUILS normés. Ceux-là ont une valeur EXACTE, citée
 * deux fois dans le pack (contrat 11 §5 et commentaires du fichier 04 §7 sur
 * `block_scores.is_indicative` et `unit_scores.answers_count`).
 */
export const SEUILS_NORMES: readonly { cle: string; valeur: number }[] = [
  { cle: 'seuil_completude_bloc', valeur: 0.6 },
  { cle: 'seuil_fiabilite_answers', valeur: 3 },
  { cle: 'seuil_divergence_ecart_type', valeur: 1.5 },
];

/**
 * 11 §5 : paramètres seedés « avec des valeurs par défaut RAISONNABLES marquées
 * `description: 'défaut à valider'` », dont le contrat donne les exemples
 * chiffrés. Williams les valide ou les ajuste AVANT la porte P-A : un écart de
 * VALEUR est une décision à tracer, un écart de CLÉ est un défaut.
 */
export const PARAMETRES_PAR_DEFAUT: readonly { cle: string; valeur: number }[] = [
  { cle: 'duree_entretien_dirigeant', valeur: 90 },
  { cle: 'duree_entretien_salarie', valeur: 45 },
  { cle: 'analyse_par_bloc', valeur: 0.5 },
  { cle: 'taux_horaire_charge_cadre', valeur: 65 },
  { cle: 'taux_horaire_charge_technicien', valeur: 38 },
];

/** 11 §5 : marqueur imposé sur les valeurs par défaut à arbitrer. */
export const MARQUEUR_DEFAUT_A_VALIDER = 'défaut à valider';

// -----------------------------------------------------------------------------
// Énumérations CHECK du fichier 04 §7 — les plus porteuses de sens métier
// -----------------------------------------------------------------------------

export interface EnumerationAttendue {
  table: string;
  colonne: string;
  valides: readonly string[];
  invalide: string;
  section: string;
}

export const ENUMERATIONS_TESTEES: readonly EnumerationAttendue[] = [
  {
    table: 'missions',
    colonne: 'status',
    valides: ['preparation', 'en_cours', 'en_analyse', 'livree', 'cloturee'],
    invalide: 'terminee',
    section: '04 §7 (missions.status) — machine à états mission §32.2',
  },
  {
    table: 'interviews',
    colonne: 'kind',
    valides: [
      'entretien',
      'observation',
      'demonstration',
      'analyse_documentaire',
      'releve_donnees',
      'atelier',
    ],
    invalide: 'complementaire',
    section:
      "04 §7 (interviews.kind) — décision V2.2 §32.6 : 'complementaire' est un MODE, jamais un TYPE de session",
  },
  {
    table: 'interviews',
    colonne: 'schedule_status',
    valides: ['a_planifier', 'planifie', 'confirme', 'realise', 'reporte', 'annule'],
    invalide: 'termine',
    section: '04 §7 (interviews.schedule_status) — agenda §25.2',
  },
  {
    table: 'answers',
    colonne: 'source',
    valides: ['entretien', 'observation', 'demonstration', 'document', 'releve'],
    invalide: 'atelier',
    section: '04 §7 (answers.source) — provenance §27.1',
  },
  {
    table: 'findings',
    colonne: 'severity',
    valides: ['drapeau_rouge', 'majeur', 'mineur', 'point_fort'],
    invalide: 'critique',
    section: '04 §7 (findings.severity) — constats §16.4',
  },
  {
    table: 'users',
    colonne: 'role',
    valides: ['admin', 'consultant', 'analyste', 'lecteur'],
    invalide: 'superadmin',
    section: '04 §7 (users.role) — RBAC §34.1',
  },
];

// -----------------------------------------------------------------------------
// Interdits du contrat 11 §2 — vérifiés sur le schéma réel
// -----------------------------------------------------------------------------

/**
 * Tables dont TOUTE ligne peut naître hors ligne (règle P1-4, 04 §7) : leur id
 * est un UUID v7 fabriqué PAR LE CLIENT. Un `DEFAULT gen_random_uuid()` y serait
 * un piège — il masquerait un identifiant serveur là où l'idempotence du push
 * repose sur l'identifiant client.
 */
export const TABLES_UUID_CLIENT: readonly string[] = [
  'interviews',
  'answers',
  'attachments',
  'org_units',
  'questions',
  'mission_questions',
];

/**
 * Noms de colonnes financières qui ne doivent JAMAIS apparaître dans
 * `scoping_estimates` (04 §7, P1-3 / exigence E21 : « aucune jointure côté
 * endpoints consultants »). La séparation en deux tables est le mécanisme même
 * de la règle : une colonne financière égarée la vide de son sens.
 */
export const COLONNES_FINANCIERES_INTERDITES: readonly string[] = [
  'daily_rates',
  'travel_costs',
  'total_amount',
  'currency',
  'amount',
  'montant',
  'price',
  'prix',
  'tarif',
  'budget',
  'cost',
  'cout',
];

/** 04 §7.1 : index GIN exigés sur les colonnes JSONB d'étiquetage des questions. */
export const COLONNES_GIN_QUESTIONS: readonly string[] = ['sectors', 'profiles', 'target_services'];
