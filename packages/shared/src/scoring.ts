// =============================================================================
// CONTRAT DU MOTEUR DE SCORING — 03 §32.1 (barème + agrégation + complétude +
// drapeaux rouges), §27.4 (non communiqué), §32.4 (doctrines de cotation).
// Lot L8. Butoir §35.3 : en production au plus tard le dernier jour de collecte.
//
// ── CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ────────────────────────────
// Les VOCABULAIRES et les FORMES du résultat de scoring. Aucune arithmétique n'y
// vit : le calcul est dans `apps/api/src/scoring/**`, côté SERVEUR, et c'est
// l'invariant 6 (« le terrain collecte, le siège produit »). Un composant React
// qui importerait ce fichier n'y trouverait que des types et des libellés — pas
// un seul moyen de calculer un score.
//
// ── ⚠ SCORING ≠ SCOPING — DEUX FICHIERS VOISINS, UNE LETTRE D'ÉCART ─────────
// `scoping.ts` porte la sentinelle des données FINANCIÈRES (`scoping_financials`,
// invariant 3 : routes admin exclusivement). Le présent fichier porte la COTATION
// d'audit. Aucune valeur de `scoping_financials` n'entre jamais dans un score, et
// un test de garde (`apps/api/src/scoring/etancheite.test.ts`) le vérifie sur les
// sources du moteur plutôt que sur la mémoire de qui les relit. Une réponse
// d'audit de type `money` est légitime — c'est `answers.value`, la parole d'un
// interviewé, jamais le devis de la mission.
//
// ── POURQUOI LE RÉSULTAT PORTE AUTANT DE COMPTES ────────────────────────────
// Le critère d'acceptation du lot (07, ligne L8) tient en deux phrases : « jeux de
// données de référence figés → scores identiques » et « un drapeau rouge n'est
// JAMAIS masqué par la moyenne ». Les deux exigent que rien ne se perde en route :
//   · un score seul est invérifiable — les COMPTES qui le fondent le rendent
//     reproductible à la main (c'est aussi le repli §35.3 : « calcul manuel sur
//     l'export selon les formules §32.1 ») ;
//   · un drapeau rouge est un CANAL SÉPARÉ, jamais un terme d'une moyenne. Il
//     remonte l'arbre par UNION, sans jamais être pondéré, moyenné, ni seuillé.
//     C'est structurel : aucune moyenne ne peut le masquer parce qu'aucune
//     moyenne ne le touche.
//
// ── LES TROIS ÉTATS QU'ON NE FOND JAMAIS (§27.4) ────────────────────────────
// RÉPONDU · NON RÉPONDU · NON COMMUNIQUÉ (demandé, refusé) — plus SANS OBJET.
// Confondre le refus avec l'absence fausserait à la fois le score et la rubrique
// « Limites et réserves » du rapport, qui protège le cabinet.
//
// Traçabilité : E14 (consolidation, scores, drapeaux) · E15 (rapport : complétude
// et réserves) · E43 (exécutabilité autopilote : contrats partagés).
// =============================================================================
import { z } from 'zod';

import { CRITICITES, SCORE_MAX, SCORE_MIN } from './banque-questions.js';
import { GROUPES_INTERLOCUTEUR } from './plan-entretiens.js';

// -----------------------------------------------------------------------------
// LES PARAMÈTRES — ILS VIENNENT DE LA DONNÉE, JAMAIS DU CODE
// -----------------------------------------------------------------------------

/**
 * Les clés d'`estimation_params` que le moteur consomme (11 §5).
 *
 * Elles sont NOMMÉES ici et VALUÉES nulle part : le seuil de complétude et le
 * seuil de divergence sont des données de mission administrables, pas des
 * constantes. Le moteur les EXIGE en entrée — il ne porte aucune valeur par
 * défaut, faute de quoi une base mal seedée produirait des scores silencieusement
 * calculés sur des seuils que personne n'a choisis.
 */
export const CLES_PARAMETRES_SCORING = [
  'seuil_completude_bloc',
  'seuil_divergence_ecart_type',
] as const;

/** Seuils du calcul, lus dans `estimation_params` et passés au moteur. */
export interface ParametresScoring {
  /** `seuil_completude_bloc` — sous ce ratio, le score est marqué « indicatif » (§32.1-3). */
  readonly seuilCompletudeBloc: number;
  /** `seuil_divergence_ecart_type` — écart-type à partir duquel on signale (§32.1-5). */
  readonly seuilDivergenceEcartType: number;
}

export const parametresScoringSchema = z.strictObject({
  seuilCompletudeBloc: z.number().min(0).max(1),
  seuilDivergenceEcartType: z.number().min(0),
});

// -----------------------------------------------------------------------------
// POURQUOI UNE RÉPONSE N'EST PAS COTÉE — le vocabulaire du non-score
// -----------------------------------------------------------------------------

/**
 * Les cinq raisons pour lesquelles une réponse ne produit PAS de score.
 *
 * Aucune n'est une erreur : ce sont des faits d'audit. Ils sont distincts parce
 * qu'ils ne se lisent pas pareil dans le rapport — un refus va aux « Limites et
 * réserves », une absence va à la couverture, un « sans objet » ne va nulle part.
 */
export const MOTIFS_NON_COTABLE = [
  /** La question n'a pas de barème (poids 0, ou type hors scoring) — §32.1. */
  'hors_bareme',
  /** `answers.withheld` — demandé, matériellement non obtenu (§27.4). */
  'non_communique',
  /** `answers.not_applicable` — la question ne se pose pas ici (§32.4 doctrine 4). */
  'sans_objet',
  /** Aucune valeur saisie : la ligne existe (note, drapeau à revoir), la valeur non. */
  'sans_reponse',
  /** Une valeur que le barème figé ne sait pas coter — jamais devinée, toujours signalée. */
  'valeur_inexploitable',
] as const;

export type MotifNonCotable = (typeof MOTIFS_NON_COTABLE)[number];

/** Libellés français (invariant 5) — ce que l'auditeur lit dans la console. */
export const LIBELLES_MOTIF_NON_COTABLE: Record<MotifNonCotable, string> = {
  hors_bareme: 'Hors barème',
  non_communique: 'Non communiqué',
  sans_objet: 'Sans objet',
  sans_reponse: 'Sans réponse',
  valeur_inexploitable: 'Valeur inexploitable',
};

// -----------------------------------------------------------------------------
// LA COTATION D'UNE RÉPONSE
// -----------------------------------------------------------------------------

const scoreSchema = z.number().min(SCORE_MIN).max(SCORE_MAX);

/**
 * Ce qu'une réponse vaut, et pourquoi elle ne vaut rien quand c'est le cas.
 *
 * `score` et `motifNonCotable` sont EXCLUSIFS : l'un des deux est toujours nul.
 * Un score `null` sans motif serait un trou — et un trou dans un dossier d'audit
 * est exactement ce que ce produit existe pour supprimer.
 */
export const cotationReponseSchema = z.strictObject({
  reponseId: z.uuid(),
  missionQuestionId: z.uuid(),
  score: scoreSchema.nullable(),
  motifNonCotable: z.enum(MOTIFS_NON_COTABLE).nullable(),
});

export type CotationReponse = z.infer<typeof cotationReponseSchema>;

// -----------------------------------------------------------------------------
// LE DRAPEAU ROUGE — LE CANAL QUI NE PASSE JAMAIS PAR UNE MOYENNE
// -----------------------------------------------------------------------------

/**
 * Ce qui a déclenché le drapeau : `valeurs` (`red_flag.values`, réponses à valeurs
 * discrètes) ou `seuil` (`red_flag.below`, score sous une borne) — §32.1.
 */
export const DECLENCHEURS_DRAPEAU_ROUGE = ['valeurs', 'seuil'] as const;
export type DeclencheurDrapeauRouge = (typeof DECLENCHEURS_DRAPEAU_ROUGE)[number];

/**
 * UNE PROPOSITION DE FINDING `drapeau_rouge`, EN BROUILLON — jamais un finding.
 *
 * §32.1 : « finding `drapeau_rouge` AUTO-PROPOSÉ en brouillon (validation humaine
 * obligatoire, §16.5) ». Le moteur n'écrit RIEN : il rend de quoi construire le
 * brouillon, et un humain décide. La chaîne jusqu'aux réponses qui le fondent
 * (`reponseId`, `entretienId`) est l'exigence d'auditabilité du §16.5.
 *
 * `valeurDeclenchante` est un RENDU TEXTE court de la valeur cotée (« non »,
 * « opt_c », « 12 »). Jamais un verbatim, jamais un nom : rien de personnel ne
 * transite par un drapeau (06 §10, redaction pino).
 */
export const propositionDrapeauRougeSchema = z.strictObject({
  reponseId: z.uuid(),
  entretienId: z.uuid(),
  missionQuestionId: z.uuid(),
  orgUnitId: z.uuid().nullable(),
  blocCode: z.string().min(1),
  criticite: z.enum(CRITICITES),
  declencheur: z.enum(DECLENCHEURS_DRAPEAU_ROUGE),
  /** La borne de `red_flag.below`, ou `null` pour un déclencheur `valeurs`. */
  seuil: z.number().nullable(),
  /** Le score de la réponse au moment du déclenchement — informatif, jamais filtrant. */
  score: scoreSchema.nullable(),
  valeurDeclenchante: z.string(),
  /** Toujours `propose` : la validation humaine est le seul chemin vers un finding. */
  statut: z.literal('propose'),
});

export type PropositionDrapeauRouge = z.infer<typeof propositionDrapeauRougeSchema>;

// -----------------------------------------------------------------------------
// LA COMPLÉTUDE — TROIS ÉTATS DISTINCTS, PLUS LE SANS-OBJET (§27.4, §32.1-3)
// -----------------------------------------------------------------------------

/**
 * De quoi le score est fait, et de quoi il n'est pas fait.
 *
 * `posees` = questions SCORABLES du périmètre (poids > 0 et barème figé).
 * Les quatre catégories suivantes PARTITIONNENT `posees` — la somme est vérifiée
 * par le moteur et par ses tests, parce qu'une partition qui ne somme pas est le
 * signe qu'une réponse s'est perdue.
 *
 * `ratio` = `cotees / (posees − sansObjet)` : le sans-objet sort du numérateur ET
 * du dénominateur (§32.1), le NON COMMUNIQUÉ reste au dénominateur (§27.4 :
 * « score 3,2/5, établi sur 84 % des questions — 6 non communiquées » — un refus
 * ABAISSE la complétude, il ne disparaît pas). `null` quand le dénominateur est
 * nul : jamais de NaN, jamais de division qui rend un score fantôme.
 */
export const completudeSchema = z.strictObject({
  posees: z.int().min(0),
  cotees: z.int().min(0),
  nonCommuniquees: z.int().min(0),
  sansObjet: z.int().min(0),
  nonRepondues: z.int().min(0),
  ratio: z.number().min(0).max(1).nullable(),
  /** `ratio < seuilCompletudeBloc` — le score reste calculé, il est marqué « indicatif ». */
  sousSeuil: z.boolean(),
});

export type Completude = z.infer<typeof completudeSchema>;

// -----------------------------------------------------------------------------
// LES NŒUDS DE SCORE
// -----------------------------------------------------------------------------

/** Le score d'un bloc, pour un périmètre donné (§32.1-2). */
export const scoreBlocSchema = z.strictObject({
  blocCode: z.string().min(1),
  score: scoreSchema.nullable(),
  /** Σ des poids des questions COTÉES — le dénominateur de la formule §32.1-2. */
  poidsTotal: z.number().min(0),
  completude: completudeSchema,
  /** `is_indicative` du §32.1-3 : score affiché sous réserve, jamais masqué. */
  indicatif: z.boolean(),
});

export type ScoreBloc = z.infer<typeof scoreBlocSchema>;

/** Un score d'ensemble : celui d'une unité, d'un sous-arbre, ou de la mission. */
export const noeudScoreSchema = z.strictObject({
  score: scoreSchema.nullable(),
  completude: completudeSchema,
  indicatif: z.boolean(),
  blocs: z.array(scoreBlocSchema),
});

export type NoeudScore = z.infer<typeof noeudScoreSchema>;

// -----------------------------------------------------------------------------
// LA DIVERGENCE — §32.1-5
// -----------------------------------------------------------------------------

export const TYPES_DIVERGENCE = ['ecart_type', 'contradiction_oui_non'] as const;
export type TypeDivergence = (typeof TYPES_DIVERGENCE)[number];

/**
 * Un désaccord entre répondants sur une même question et une même unité.
 *
 * « V2.9 : évaluée à partir de 2 réponses — n = 1 : pas de divergence, jamais de
 * NaN » (§32.1-5). `moyennesParGroupe` porte la lecture direction / encadrement /
 * terrain, qui repose sur `interlocutor_profiles.group_code` (§32.6-4) et jamais
 * sur une liste de profils codée en dur.
 */
export const divergenceSchema = z.strictObject({
  missionQuestionId: z.uuid(),
  orgUnitId: z.uuid().nullable(),
  type: z.enum(TYPES_DIVERGENCE),
  nbReponses: z.int().min(2),
  ecartType: z.number().min(0).nullable(),
  scores: z.array(scoreSchema),
  moyennesParGroupe: z.partialRecord(z.enum(GROUPES_INTERLOCUTEUR), z.number()),
});

export type Divergence = z.infer<typeof divergenceSchema>;

// -----------------------------------------------------------------------------
// LES ANOMALIES — CE QUI EST ÉCARTÉ EST DIT, JAMAIS TU
// -----------------------------------------------------------------------------

/**
 * Codes d'anomalie du calcul. Ce ne sont PAS des `ERROR_CODES` : le moteur ne lève
 * jamais et ne refuse jamais de rendre un résultat — il RAPPORTE ce qu'il a dû
 * écarter. Un moteur qui échoue sur une donnée bancale prive l'analyste de tout
 * le reste ; un moteur qui l'écarte en silence lui ment.
 */
export const CODES_ANOMALIE_SCORING = {
  /** Une réponse pointe une question qui n'est pas dans le questionnaire figé. */
  REPONSE_SANS_QUESTION_FIGEE: 'REPONSE_SANS_QUESTION_FIGEE',
  /** Une réponse pointe une unité absente de l'arbre fourni. */
  REPONSE_UNITE_INCONNUE: 'REPONSE_UNITE_INCONNUE',
  /** Unité `in_scope = false` : données conservées, exclues du scoring (§25.1). */
  REPONSE_HORS_PERIMETRE: 'REPONSE_HORS_PERIMETRE',
  /** Session sans unité : la réponse ne peut être rattachée à aucun périmètre. */
  REPONSE_SANS_UNITE: 'REPONSE_SANS_UNITE',
  /** `scoring_snapshot` que la forme normée (04 §7.3) ne reconnaît pas. */
  BAREME_INVALIDE: 'BAREME_INVALIDE',
  /** Une valeur que le barème figé ne sait pas coter. */
  VALEUR_INEXPLOITABLE: 'VALEUR_INEXPLOITABLE',
  /**
   * UNE QUESTION `bloquant` QUI N'A PAS PU ÊTRE ÉVALUÉE — l'autre façon de masquer
   * un drapeau rouge, et la plus discrète : un refus poli sur la question qui
   * fâche, et le drapeau ne se déclenche jamais. Elle est donc COMPTÉE.
   */
  QUESTION_BLOQUANTE_NON_EVALUEE: 'QUESTION_BLOQUANTE_NON_EVALUEE',
} as const;

export type CodeAnomalieScoring =
  (typeof CODES_ANOMALIE_SCORING)[keyof typeof CODES_ANOMALIE_SCORING];

const codesAnomalie = Object.values(CODES_ANOMALIE_SCORING) as [
  CodeAnomalieScoring,
  ...CodeAnomalieScoring[],
];

export const anomalieScoringSchema = z.strictObject({
  code: z.enum(codesAnomalie),
  message: z.string().min(1),
  reponseId: z.uuid().nullable(),
  missionQuestionId: z.uuid().nullable(),
  orgUnitId: z.uuid().nullable(),
});

export type AnomalieScoring = z.infer<typeof anomalieScoringSchema>;

// -----------------------------------------------------------------------------
// LE RÉSULTAT COMPLET
// -----------------------------------------------------------------------------

/**
 * Le score d'une unité, sous ses DEUX lectures — et elles ne se remplacent pas.
 *
 *   · `propre`    — les réponses de CETTE unité seulement (§32.1-1 et -2) ;
 *   · `consolide` — le roll-up du sous-arbre, pondéré par `headcount` (§32.1-4),
 *     `headcount` NULL → poids 1 (« règle affichée dans l'UI »).
 *
 * Une unité feuille a les deux identiques. Une unité qui a des enfants ET ses
 * propres réponses les a différents, et c'est pour cela que les deux existent :
 * n'en publier qu'un ferait disparaître une information que personne ne pourrait
 * reconstruire depuis l'autre.
 *
 * `drapeauxRouges` est le CUMUL DU SOUS-ARBRE — ce nœud et tous ses descendants.
 * Il ne dépend d'aucun score, d'aucun poids, d'aucun seuil.
 */
export const resultatUniteSchema = z.strictObject({
  orgUnitId: z.uuid(),
  parentId: z.uuid().nullable(),
  /** Profondeur dans l'arbre, racine = 0 (FIL-GC en compte 4 niveaux). */
  niveau: z.int().min(0),
  headcount: z.int().nullable(),
  propre: noeudScoreSchema,
  consolide: noeudScoreSchema,
  drapeauxRouges: z.array(propositionDrapeauRougeSchema),
  divergences: z.array(divergenceSchema),
});

export type ResultatUnite = z.infer<typeof resultatUniteSchema>;

export const resultatScoringMissionSchema = z.strictObject({
  missionId: z.uuid(),
  parametres: parametresScoringSchema,
  /** Le roll-up des unités RACINES — le score d'entreprise du §32.1-4. */
  mission: noeudScoreSchema,
  /** Toutes les unités du périmètre, parents avant enfants (ordre de parcours). */
  unites: z.array(resultatUniteSchema),
  /** TOUS les drapeaux rouges de la mission, à plat. Aucun filtre, aucun seuil. */
  drapeauxRouges: z.array(propositionDrapeauRougeSchema),
  divergences: z.array(divergenceSchema),
  cotations: z.array(cotationReponseSchema),
  anomalies: z.array(anomalieScoringSchema),
});

export type ResultatScoringMission = z.infer<typeof resultatScoringMissionSchema>;
