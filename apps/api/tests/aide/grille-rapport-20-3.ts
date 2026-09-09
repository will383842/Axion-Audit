// =============================================================================
// LA GRILLE §20.3 × §36.3 — LES DOUZE RUBRIQUES DU RAPPORT, ET CE QUI LES NOURRIT
//
// Outillage de recette d'A36 (L7e). C'est une DÉCLARATION, pas un test : aucun
// `expect`, aucun `it`. Les assertions vivent dans
// `l7e-recette-rapport.integration.test.ts`, et ce fichier est ce qu'elles
// confrontent à une archive RÉELLE produite par la route.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CETTE GRILLE EXISTE
// ═══════════════════════════════════════════════════════════════════════════════
// Le §36.3 se termine par un critère d'acceptation qui n'est pas un
// téléchargement : « le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP,
// sans retourner dans l'outil ». Jusqu'ici ce critère n'était éprouvé PAR RIEN —
// l'en-tête de `l7c-export.integration.test.ts` le dit lui-même, et A30 l'a joué
// À LA MAIN une fois, le 2026-09-09. Un geste manuel joué une fois n'est pas une
// recette ; il ne rejouera pas au prochain commit. Cette grille le rend rejouable.
//
// ═══════════════════════════════════════════════════════════════════════════════
// TROIS NATURES DE MANQUE, TROIS RESPONSABLES — ET POURQUOI ON LES SÉPARE
// ═══════════════════════════════════════════════════════════════════════════════
// Une recette qui rougirait de la même façon sur les trois serait rouge pour
// toujours, donc désactivée au troisième sprint. Or elles n'ont ni le même
// responsable ni le même remède :
//
//   · TROU DE FORMAT — la donnée existe ou existera, AUCUN fichier de l'archive
//     ne la porte. C'est une dette de l'EXPORT, donc de L7 (ou d'un amendement du
//     §36.3). Remède : une colonne, ou un fichier de plus.
//
//   · TROU D'ALIMENTATION — le fichier existe, correct colonne par colonne, mais
//     AUCUN code de production n'écrit dans la table qu'il lit. C'est une dette de
//     L6 (sync : `interviews`, `answers`, `attachments`) ou de la Phase 2
//     (`findings`, `use_cases`, `tools_inventory`, `ai_systems`, `roadmap_items`).
//     Remède : un lot, pas une ligne.
//
//   · TROU DE BRANCHEMENT — le producteur EXISTE et il est testé, mais aucune
//     route ne l'appelle et rien ne persiste son résultat. C'est le cas unique du
//     moteur de scoring (`apps/api/src/scoring/`), et le code de production le dit
//     lui-même à l'écran livré au client (`EcranExport.tsx`, liste `ABSENTS`).
//     Remède : une route et une table, en L8.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LA FORME RETENUE : UN CLIQUET BIDIRECTIONNEL, PAS UN VOYANT ROUGE
// ═══════════════════════════════════════════════════════════════════════════════
// Chaque manque est DÉCLARÉ ici, daté, avec sa source d'arbitrage. La recette
// vérifie que l'état du dépôt est EXACTEMENT celui que la déclaration annonce —
// dans les DEUX SENS :
//
//   ① ce qui est déclaré PORTÉ doit être porté : si `reponses.csv` perd
//      `bloc_code`, la rubrique 4 rougit, NOMMÉE ;
//   ② ce qui est déclaré ABSENT doit être absent : le jour où quelqu'un écrit un
//      `insert(findings)` en production, ou ajoute `feuille_de_route.csv`, la
//      rubrique concernée rougit AUSSI — non parce que quelque chose casse, mais
//      parce que le verdict est PÉRIMÉ et doit être re-noté.
//
// Un trou n'est donc jamais invisible (il est écrit, compté, et le verdict global
// en découle) et la recette n'est jamais rouge sans raison (elle est verte tant
// que la déclaration dit vrai). Ce que le cliquet interdit, c'est précisément ce
// qu'on redoutait : refermer un trou en silence, ou en creuser un sans le dire.
//
// Invariant 2 : aucune référence client. Traçabilité : E14 · E22 · E36 · E43.
// =============================================================================

/** Les trois natures de manque, séparées parce que leurs remèdes le sont. */
export type NatureDuManque =
  /** Le fichier existe et la colonne est là. Rien ne manque au FORMAT. */
  | 'PORTE'
  /** Aucun fichier de l'archive ne porte la notion — dette de l'export (L7). */
  | 'FORMAT_ABSENT'
  /** Le fichier est correct ; aucun code de production n'écrit sa table. */
  | 'ALIMENTATION_ABSENTE'
  /** Le producteur existe, testé, mais aucune route ne l'appelle (L8). */
  | 'BRANCHEMENT_ABSENT';

/**
 * Les tables que la recette surveille — celles dont un fichier de l'export
 * dépend. `null` : l'élément ne vient d'aucune table (il est calculé).
 */
export type TableSurveillee =
  | 'companies'
  | 'missions'
  | 'org_units'
  | 'mission_questions'
  | 'mission_users'
  | 'interviews'
  | 'answers'
  | 'attachments'
  | 'findings'
  | 'use_cases'
  | 'tools_inventory'
  | 'ai_systems'
  | 'roadmap_items'
  | 'unit_scores';

/**
 * Un ÉLÉMENT d'une rubrique — une chose que la phrase du §20.3 nomme et qu'il
 * faut pouvoir écrire. Une rubrique en compte plusieurs, et elles ne sont pas
 * toutes dans le même état : c'est tout l'intérêt de descendre à ce grain.
 */
export interface ElementDeRubrique {
  /** Ce que le §20.3 nomme, dans ses mots. */
  readonly nom: string;
  readonly nature: NatureDuManque;
  /**
   * Le fichier de l'archive qui le porte, et les colonnes exactes. `null` si
   * `nature === 'FORMAT_ABSENT'` : rien ne le porte, et c'est le constat.
   */
  readonly porteur: {
    readonly fichier: string;
    readonly colonnes: readonly string[];
  } | null;
  /**
   * La table dont le fichier tire cet élément. La recette mesure elle-même si
   * un code de production y écrit — c'est ce qui distingue un trou
   * d'alimentation d'un trou de format.
   */
  readonly table: TableSurveillee | null;
  /**
   * Pour un `FORMAT_ABSENT` : les graphies sous lesquelles la notion manquante
   * s'écrirait si elle arrivait. La recette balaie TOUS les en-têtes de l'archive
   * et rougit si l'une apparaît — le cliquet ② du sens « le trou s'est refermé ».
   */
  readonly graphiesAttendues?: readonly string[];
  /** Où le manque est arbitré. Un trou non tracé n'est pas un trou déclaré. */
  readonly source?: string;
}

export interface RubriqueRapport {
  readonly numero: number;
  readonly titre: string;
  readonly elements: readonly ElementDeRubrique[];
}

// -----------------------------------------------------------------------------
// LES TABLES QU'AUCUN CODE DE PRODUCTION N'ÉCRIT — mesuré, pas recopié
// -----------------------------------------------------------------------------
/**
 * La liste DÉCLARÉE des tables sans écrivain de production, au 2026-09-09.
 *
 * La recette ne la croit pas : elle inventorie elle-même les `insert(...)` de
 * `apps/api/src` et compare. Cette constante est donc l'ATTENDU d'une mesure, et
 * non une mesure. Si un lot livre le premier écrivain d'une de ces tables, la
 * comparaison rougit et le verdict de la rubrique se re-note.
 */
export const TABLES_SANS_ECRIVAIN_DE_PRODUCTION: readonly TableSurveillee[] = [
  'interviews',
  'answers',
  'attachments',
  'findings',
  'use_cases',
  'tools_inventory',
  'ai_systems',
  'roadmap_items',
  'unit_scores',
];

/** Les fichiers de l'archive, par leur nom du §36.3 — jamais réécrits ici. */
const MISSION = 'mission.json';
const ARBRE = 'arbre.csv';
const SESSIONS = 'sessions.csv';
const REPONSES = 'reponses.csv';
const CONSTATS = 'constats.csv';
const CAS_USAGE = 'cas_usage.csv';
const OUTILS = 'inventaire_outils.csv';
const REGISTRE_IA = 'registre_ia.csv';
const HORS_PERIMETRE = 'unites_hors_perimetre.csv';
const MANIFESTE = 'pieces_jointes/manifest.csv';

/**
 * Le renvoi commun aux deux rubriques que la MÊME colonne absente ferme.
 *
 * A30 n'avait nommé que la rubrique 4. La rubrique 11 (« plan de formation par
 * POPULATION : dirigeants, managers, équipes ») exige le même axe : le §20.6
 * relie explicitement l'export formation aux populations identifiées à l'audit,
 * et le §32.6-4 ferme les approximations (« portée par
 * `interlocutor_profiles.group_code` — pas de liste de profils codée en dur »).
 * L'amendement approuvé par Williams le 2026-09-09 en referme donc DEUX.
 */
const RENVOI_GROUPE =
  'Amendement 04 `interviews.interlocutor_profile_id` APPROUVÉ par Williams le 2026-09-09 ' +
  '(docs/portes/P-D_AMENDEMENT_04_interlocutor_profile.md §9) : la colonne ' +
  '`groupe_interlocuteur` de reponses.csv suit d’office. Non livrée à ce jour.';

const RENVOI_ROADMAP =
  'DECISIONS.md 2026-09-05 [L7c] « Les rubriques 9 et 10 du §20.3 n’ont AUCUN fichier dans la ' +
  'liste du §36.3 » — arbitrage MAINTENU le 2026-09-09 (fiche P-D §9, « ce que ce verdict ne ' +
  'couvre pas », point 2) : l’ajout se tranche au brief de L10.';

const RENVOI_SCORES =
  'DECISIONS.md 2026-09-05 [L7c] « `scores.csv` et “score unitaire (si L8)” : absents, et ' +
  'signalés dans mission.json » — §36.3 : « si L8, sinon absent et signalé ».';

// -----------------------------------------------------------------------------
// LA GRILLE — les douze rubriques du §20.3, dans leur ordre
// -----------------------------------------------------------------------------

export const GRILLE_20_3: readonly RubriqueRapport[] = [
  {
    numero: 1,
    titre: 'Page de garde',
    elements: [
      {
        nom: 'nom du client, effectif, SIREN, pays',
        nature: 'PORTE',
        porteur: { fichier: MISSION, colonnes: ['client.nom', 'client.effectif', 'client.pays'] },
        table: 'companies',
      },
      {
        nom: 'titre de la mission, niveau d’audit, dates',
        nature: 'PORTE',
        porteur: {
          fichier: MISSION,
          colonnes: ['mission.titre', 'mission.niveauAudit', 'mission.debutPrevu'],
        },
        table: 'missions',
      },
    ],
  },
  {
    numero: 2,
    titre: 'Synthèse dirigeant (où vous en êtes, où sont les gains, par quoi commencer)',
    elements: [
      {
        nom: '« où vous en êtes » — la maturité mesurée',
        nature: 'BRANCHEMENT_ABSENT',
        porteur: null,
        table: 'unit_scores',
        graphiesAttendues: ['score_bloc', 'score_unite', 'maturite'],
        source: RENVOI_SCORES,
      },
      {
        nom: '« où sont les gains » — les cas d’usage chiffrés',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: { fichier: CAS_USAGE, colonnes: ['gain_estime', 'gain_bas', 'gain_haut'] },
        table: 'use_cases',
      },
      {
        nom: '« par quoi commencer » — les constats saillants',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: { fichier: CONSTATS, colonnes: ['severite', 'titre', 'vague'] },
        table: 'findings',
      },
    ],
  },
  {
    numero: 3,
    titre: 'Contexte, périmètre et méthodologie (8 étapes, entretiens menés, NDA)',
    elements: [
      {
        nom: 'périmètre : unités dans et hors du périmètre',
        nature: 'PORTE',
        porteur: {
          fichier: MISSION,
          colonnes: [
            'perimetre.unites',
            'perimetre.unitesDansLePerimetre',
            'perimetre.unitesHorsPerimetre',
          ],
        },
        table: 'org_units',
      },
      {
        nom: 'NDA : référence et date de signature',
        nature: 'PORTE',
        porteur: { fichier: MISSION, colonnes: ['mission.ndaRef', 'mission.ndaSigneeLe'] },
        table: 'missions',
      },
      {
        nom: 'auditeurs de la mission et leur rôle',
        nature: 'PORTE',
        porteur: { fichier: MISSION, colonnes: ['auditeurs'] },
        table: 'mission_users',
      },
      {
        nom: '« entretiens menés » — type, mode, unité, auditeur, durée, statut',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: SESSIONS,
          colonnes: [
            'session_id',
            'type',
            'mode',
            'unite_nom',
            'auditeur',
            'duree_reelle_min',
            'statut',
          ],
        },
        table: 'interviews',
      },
    ],
  },
  {
    numero: 4,
    titre: 'Cartographie des usages & frictions (heatmap unités × blocs, divergences dir./terrain)',
    elements: [
      {
        nom: 'l’axe « unités » de la heatmap',
        nature: 'PORTE',
        porteur: { fichier: ARBRE, colonnes: ['unite_id', 'nom', 'chemin', 'effectif'] },
        table: 'org_units',
      },
      {
        nom: 'le croisement unité × bloc, réponse par réponse',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: REPONSES,
          colonnes: ['bloc_code', 'bloc_libelle', 'unite_id', 'unite_nom', 'valeur'],
        },
        table: 'answers',
      },
      {
        nom: 'l’axe « divergences direction / terrain » — le groupe d’interlocuteur',
        nature: 'FORMAT_ABSENT',
        porteur: null,
        table: 'interviews',
        graphiesAttendues: [
          'groupe_interlocuteur',
          'group_code',
          'profil_interlocuteur',
          'interlocutor_profile',
        ],
        source: RENVOI_GROUPE,
      },
    ],
  },
  {
    numero: 5,
    titre: 'Maturité (radar + benchmarks + drapeaux rouges)',
    elements: [
      {
        nom: 'le radar — scores par bloc × unité',
        nature: 'BRANCHEMENT_ABSENT',
        porteur: null,
        table: 'unit_scores',
        graphiesAttendues: ['score_bloc', 'score_unite', 'completude_bloc'],
        source: RENVOI_SCORES,
      },
      {
        nom: 'les benchmarks — repères secteur × palier (§6.2)',
        nature: 'FORMAT_ABSENT',
        porteur: null,
        table: null,
        graphiesAttendues: ['benchmark', 'repere_secteur', 'palier_reference'],
        source:
          '03 §36.1 classe les benchmarks en Phase 2/3 ; le §36.3 n’énumère aucun fichier de ' +
          'repères. Constat de format, non arbitré à ce jour.',
      },
      {
        nom: 'les drapeaux rouges — constats de sévérité haute',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: { fichier: CONSTATS, colonnes: ['severite', 'enonce', 'sources_reponses'] },
        table: 'findings',
      },
    ],
  },
  {
    numero: 6,
    titre: 'Registre des usages IA & conformité (RGPD, AI Act)',
    elements: [
      {
        nom: 'rôle d’acteur, niveau de risque, obligations, statut de conformité',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: REGISTRE_IA,
          colonnes: ['role_acteur', 'niveau_risque', 'obligations', 'statut_conformite'],
        },
        table: 'ai_systems',
      },
      {
        nom: 'catégories de données traitées (RGPD)',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: { fichier: REGISTRE_IA, colonnes: ['categories_donnees', 'responsable_metier'] },
        table: 'ai_systems',
      },
    ],
  },
  {
    numero: 7,
    titre: 'Cartographie des opportunités IA service par service (outils et technos conseillés)',
    elements: [
      {
        nom: 'les opportunités, rattachées à leur service',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: CAS_USAGE,
          colonnes: ['titre', 'description', 'service', 'unite_nom', 'approche'],
        },
        table: 'use_cases',
      },
      {
        nom: 'les outils en place, service par service',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: OUTILS,
          colonnes: ['nom', 'categorie', 'editeur', 'unite_nom', 'description_usage'],
        },
        table: 'tools_inventory',
      },
    ],
  },
  {
    numero: 8,
    titre: 'Recommandations chiffrées — une fiche par action',
    elements: [
      {
        nom: 'gain attendu (fourchette basse / haute), coût',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: CAS_USAGE,
          colonnes: ['gain_estime', 'gain_bas', 'gain_haut', 'cout_estime', 'hypotheses'],
        },
        table: 'use_cases',
      },
      {
        nom: 'délai, complexité, risques',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: CAS_USAGE,
          colonnes: ['delai_mois', 'complexite', 'niveau_risque', 'vague'],
        },
        table: 'use_cases',
      },
      {
        nom: 'conditions de réussite et prérequis, faisabilité données (§36.6-3)',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: CAS_USAGE,
          colonnes: ['conditions', 'donnees_requises', 'donnees_disponibles'],
        },
        table: 'use_cases',
      },
      {
        nom: 'les cas ÉCARTÉS avec leur motif (§36.6-5 : dire non est un livrable)',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: { fichier: CAS_USAGE, colonnes: ['statut', 'conditions'] },
        table: 'use_cases',
      },
    ],
  },
  {
    numero: 9,
    titre: 'Plan d’action 12 mois, mois par mois, en paliers avec temps d’assimilation',
    elements: [
      {
        nom: 'les paliers, leurs bornes de mois et le temps d’assimilation',
        nature: 'FORMAT_ABSENT',
        porteur: null,
        table: 'roadmap_items',
        graphiesAttendues: [
          'palier',
          'month_start',
          'mois_debut',
          'mois_fin',
          'assimilation',
          'feuille_de_route',
        ],
        source: RENVOI_ROADMAP,
      },
      {
        nom: 'le gain identifié action par action, rattaché au palier',
        nature: 'FORMAT_ABSENT',
        porteur: null,
        table: 'roadmap_items',
        graphiesAttendues: ['gain_attendu', 'expected_gain'],
        source: RENVOI_ROADMAP,
      },
    ],
  },
  {
    numero: 10,
    titre: 'Trajectoire à 3 ans (vision, gouvernance, KPIs de valeur, points d’ajustement)',
    elements: [
      {
        nom: 'les KPIs de valeur et les points d’ajustement annuels',
        nature: 'FORMAT_ABSENT',
        porteur: null,
        table: 'roadmap_items',
        graphiesAttendues: ['kpi', 'trajectoire', 'ajustement'],
        source: RENVOI_ROADMAP,
      },
      {
        nom: 'la gouvernance : rôles, principes, comité',
        nature: 'FORMAT_ABSENT',
        porteur: null,
        table: null,
        graphiesAttendues: ['gouvernance', 'comite', 'principes_ia'],
        source:
          'Le §20.3 ne rattache la gouvernance à AUCUNE table ; `roadmap_items` ne la porte pas. ' +
          'Aucun fichier de l’archive ne peut donc la nourrir. Constat, non arbitré à ce jour.',
      },
    ],
  },
  {
    numero: 11,
    titre: 'Plan de formation recommandé, par population (dirigeants, managers, équipes)',
    elements: [
      {
        nom: 'la matière : niveau IA, tâches, outils (blocs 2 à 5) — §20.6',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: REPONSES,
          colonnes: ['bloc_code', 'question_texte', 'valeur', 'unite_nom'],
        },
        table: 'answers',
      },
      {
        nom: 'l’axe « par POPULATION » — dirigeants / managers / équipes',
        nature: 'FORMAT_ABSENT',
        porteur: null,
        table: 'interviews',
        graphiesAttendues: ['groupe_interlocuteur', 'population', 'group_code'],
        source: RENVOI_GROUPE,
      },
    ],
  },
  {
    numero: 12,
    titre: 'Annexes',
    elements: [
      {
        nom: 'annexe périmètre réduit : unités sorties et leur motif (§25.1)',
        nature: 'PORTE',
        porteur: {
          fichier: HORS_PERIMETRE,
          colonnes: ['unite_id', 'nom', 'chemin', 'statut', 'effectif'],
        },
        table: 'org_units',
      },
      {
        nom: 'annexe « Limites et réserves » (§27.4) : refus et sans-objet motivés',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: REPONSES,
          colonnes: [
            'non_communique',
            'motif_non_communique',
            'sans_objet',
            'motif_sans_objet',
            'a_revoir',
          ],
        },
        table: 'answers',
      },
      {
        nom: 'annexe pièces jointes : le manifeste de ce qui a été collecté',
        nature: 'ALIMENTATION_ABSENTE',
        porteur: {
          fichier: MANIFESTE,
          colonnes: ['attachment_id', 'session_id', 'type', 'fichier'],
        },
        table: 'attachments',
      },
    ],
  },
];

/** Tous les éléments de la grille, à plat — l'unité de compte de la recette. */
export function elementsDeLaGrille(): readonly (ElementDeRubrique & {
  readonly rubrique: number;
})[] {
  return GRILLE_20_3.flatMap((rubrique) =>
    rubrique.elements.map((element) => ({ ...element, rubrique: rubrique.numero })),
  );
}

/**
 * Le verdict d'UNE rubrique : elle n'est rédigeable que si TOUS ses éléments le
 * sont. Un rapport ne se rédige pas « aux trois quarts » — une heatmap sans son
 * axe de divergence n'est pas une heatmap incomplète, c'est une autre figure.
 */
export function verdictDeRubrique(rubrique: RubriqueRapport): NatureDuManque {
  const manques = rubrique.elements.filter((element) => element.nature !== 'PORTE');
  if (manques.length === 0) return 'PORTE';
  // Le manque le plus STRUCTUREL commande : un trou de format ne se comble pas
  // en livrant un lot, il se comble en amendant un format.
  if (manques.some((m) => m.nature === 'FORMAT_ABSENT')) return 'FORMAT_ABSENT';
  if (manques.some((m) => m.nature === 'BRANCHEMENT_ABSENT')) return 'BRANCHEMENT_ABSENT';
  return 'ALIMENTATION_ABSENTE';
}

/**
 * LE VERDICT DÉCLARÉ du critère d'acceptation L7-min, au 2026-09-09.
 *
 * Il est ÉCRIT ici pour être mis en défaut : la recette le recalcule depuis la
 * grille et depuis l'archive réelle, et rougit si les deux divergent. Le jour où
 * une rubrique change d'état, ce chiffre doit changer avec elle — sinon la suite
 * est rouge, et c'est ce qu'on veut.
 */
export const VERDICT_DECLARE = {
  date: '2026-09-09',
  rubriquesRedigeables: [1] as readonly number[],
  critereL7Min: 'NON TENU' as const,
  /** Rubriques bloquées par un trou de FORMAT — dette de l'export (L7 / L10). */
  bloqueesParLeFormat: [4, 5, 9, 10, 11] as readonly number[],
  /** Rubriques bloquées par un trou de BRANCHEMENT — dette de L8. */
  bloqueesParLeBranchement: [2] as readonly number[],
  /** Rubriques bloquées par un trou d'ALIMENTATION seul — dette de L6 / Phase 2. */
  bloqueesParLAlimentation: [3, 6, 7, 8, 12] as readonly number[],
} as const;
