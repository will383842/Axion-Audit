// =============================================================================
// LE BARÈME — 03 §32.1, type de réponse par type de réponse. Lot L8.
//
// ── CE QUE CE FICHIER DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ─────────────────────
// Il cote UNE réponse : il rend un score sur 0-5, ou bien la RAISON pour laquelle
// il n'y en a pas. Il ne connaît ni les autres réponses, ni les unités, ni les
// poids : la moyenne pondérée est le travail d'`agregation.ts`, la remontée de
// l'arbre celui de `moteur.ts`. Trois leviers séparés, et c'est cette séparation
// qui rend un drapeau rouge impossible à masquer par une moyenne — le drapeau se
// décide ICI, sur la criticité de la question, sans qu'aucune moyenne existe
// encore.
//
// ── LE BARÈME EST UNE DONNÉE FIGÉE, JAMAIS UNE RÈGLE DE CODE ───────────────
// Tout ce qui varie vit dans `mission_questions.scoring_snapshot` (§32.1 :
// « figé par mission ») : la table oui/non est INVERSABLE question par question,
// les bandes numériques sont écrites par le rédacteur de la banque, les scores des
// choix vivent dans `options[].score`. Le code ne porte AUCUNE valeur de barème.
// C'est l'invariant 2 lu à l'endroit où on l'oublie le plus facilement : coder
// « oui = 5 » marcherait sur 99 questions et fausserait la centième (« Avez-vous
// des fichiers critiques non sauvegardés ? »).
//
// ── UNE FORME INCONNUE EST SIGNALÉE, JAMAIS DEVINÉE ────────────────────────
// PostgreSQL ne contraint pas un JSONB. Un `scoring` que la forme normée (04 §7.3)
// ne reconnaît pas ne se rattrape pas au jugé : il rend `baremeInvalide`, la
// question sort du calcul, et le moteur le RAPPORTE. Un barème deviné produirait
// des scores plausibles et faux — la seule catégorie d'erreur qu'un dossier
// d'audit ne peut pas absorber.
//
// Traçabilité : E14 (consolidation, divergences, radar — les scores de base dont
// tous trois sont faits) · E43 (exécutabilité autopilote : contrats partagés).
// =============================================================================
import {
  SCORE_MAX,
  SCORE_MIN,
  type DeclencheurDrapeauRouge,
  type MotifNonCotable,
} from '@axion/shared';

import type { QuestionFigee, ReponseACoter } from './entree.js';

// -----------------------------------------------------------------------------
// LE RÉSULTAT DE LA COTATION D'UNE RÉPONSE
// -----------------------------------------------------------------------------

/**
 * Ce qu'une réponse vaut, et tout ce que le moteur devra en savoir.
 *
 * Plus riche que `CotationReponse` de `packages/shared`, et délibérément : le
 * contrat publié ne porte que `score` et `motifNonCotable`, parce que c'est ce
 * qu'une console affiche. `baremeInvalide` et les trois champs de drapeau sont
 * des faits INTERNES au calcul, que `moteur.ts` transforme en anomalies et en
 * propositions de finding. Les publier tels quels ferait entrer dans l'API des
 * détails d'implémentation que personne ne s'est engagé à tenir.
 */
export interface CotationDetaillee {
  readonly reponseId: string;
  readonly missionQuestionId: string;
  readonly score: number | null;
  readonly motifNonCotable: MotifNonCotable | null;
  /** `true` quand le `scoring` figé n'a pas une forme que le 04 §7.3 décrit. */
  readonly baremeInvalide: boolean;
  readonly declencheurDrapeau: DeclencheurDrapeauRouge | null;
  /** La borne de `red_flag.below`, ou `null` (déclencheur `valeurs`, ou aucun). */
  readonly seuilDrapeau: number | null;
  /**
   * Rendu texte COURT de la valeur qui a déclenché — jamais un verbatim.
   *
   * VIDE quand aucun drapeau ne s’est levé, plutôt que `null` : le champ ne se lit
   * QUE lorsque `declencheurDrapeau` est renseigné, et un `null` de plus obligerait
   * chaque appelant à écrire un repli pour un cas qui n’arrive pas.
   */
  readonly valeurDeclenchante: string;
}

// -----------------------------------------------------------------------------
// LES ONZE TYPES DE RÉPONSE, RÉPARTIS EN QUATRE FAMILLES DE BARÈME
// -----------------------------------------------------------------------------

/** `yes_no` — table de correspondance, inversable question par question. */
const TYPES_TABLE = ['yes_no'] as const;
/** `scale_1_5` — `{"map": "identity"}` : la valeur EST le score. */
const TYPES_ECHELLE = ['scale_1_5'] as const;
/** Les scores vivent dans `options[].score` (structure normée 04 §7.3). */
const TYPES_CHOIX = ['single_choice', 'multi_choice'] as const;
/** Bandes `{"bands": […]}` — ou `weight = 0` (donnée factuelle hors scoring). */
const TYPES_NUMERIQUES = ['number', 'percent', 'duration', 'money'] as const;
/** `weight = 0` OBLIGATOIRE : ils alimentent findings et rapport, jamais le score. */
const TYPES_HORS_BAREME = ['free_text', 'date', 'table'] as const;

function appartient(liste: readonly string[], valeur: string): boolean {
  return liste.includes(valeur);
}

// -----------------------------------------------------------------------------
// LE DRAPEAU ROUGE, LU DANS LE BARÈME FIGÉ
// -----------------------------------------------------------------------------

interface DrapeauParValeurs {
  readonly mode: 'valeurs';
  readonly valeurs: readonly unknown[];
}

interface DrapeauParSeuil {
  readonly mode: 'seuil';
  readonly borne: number;
}

type DrapeauLu = DrapeauParValeurs | DrapeauParSeuil;

// -----------------------------------------------------------------------------
// LE BARÈME LU — quatre formes exploitables, plus l'absence et l'invalidité
// -----------------------------------------------------------------------------

interface Bande {
  /** `null` = bande OUVERTE (la dernière du §32.1, sans `max`). */
  readonly max: number | null;
  readonly score: number;
}

interface BaremeCommun {
  readonly drapeau: DrapeauLu | null;
}

export type BaremeLu =
  | ({ readonly forme: 'table'; readonly table: ReadonlyMap<string, number> } & BaremeCommun)
  | ({ readonly forme: 'identite' } & BaremeCommun)
  | ({
      readonly forme: 'options';
      readonly scores: ReadonlyMap<string, number | null>;
      readonly agregat: 'max' | 'mean';
    } & BaremeCommun)
  | ({ readonly forme: 'bandes'; readonly bandes: readonly Bande[] } & BaremeCommun)
  /** Le type de réponse n'a pas de barème, ou la question n'en porte aucun. */
  | { readonly forme: 'aucun' }
  /** `scoring` d'une forme que le 04 §7.3 ne décrit pas — signalé, jamais deviné. */
  | { readonly forme: 'invalide' };

const INVALIDE = { forme: 'invalide' } as const;
const AUCUN = { forme: 'aucun' } as const;

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Un score de barème est un nombre fini de l'intervalle 0-5 (§32.1). */
function estScoreDeBareme(valeur: unknown): valeur is number {
  return (
    typeof valeur === 'number' &&
    Number.isFinite(valeur) &&
    valeur >= SCORE_MIN &&
    valeur <= SCORE_MAX
  );
}

/**
 * Lit `scoring.red_flag`. Rend `undefined` quand il n'y en a pas, `null` quand il
 * y en a un que la forme normée ne reconnaît pas.
 *
 * Un `red_flag` malformé ne s'IGNORE pas : ignorer désarmerait silencieusement le
 * seul mécanisme qui remonte un point critique. Il invalide le barème, ce qui le
 * fait remonter en anomalie — bruyant plutôt que muet.
 */
function lireDrapeau(scoring: Record<string, unknown>): DrapeauLu | null | undefined {
  const brut = scoring.red_flag;
  if (brut === undefined || brut === null) return undefined;
  if (!estObjet(brut)) return null;

  if (Array.isArray(brut.values)) {
    return brut.values.length > 0 ? { mode: 'valeurs', valeurs: brut.values } : null;
  }
  if (typeof brut.below === 'number' && Number.isFinite(brut.below)) {
    return { mode: 'seuil', borne: brut.below };
  }
  return null;
}

/** Lit la table `{"oui": 5, "non": 0}` d'un `yes_no`. */
function lireTable(brut: unknown): ReadonlyMap<string, number> | null {
  if (!estObjet(brut)) return null;
  const table = new Map<string, number>();
  for (const [cle, valeur] of Object.entries(brut)) {
    if (!estScoreDeBareme(valeur)) return null;
    table.set(cle, valeur);
  }
  return table.size > 0 ? table : null;
}

/** Lit `options[]` — forme normée `[{code, label, score}]`, `score` pouvant être NULL. */
function lireOptions(brut: unknown): ReadonlyMap<string, number | null> | null {
  if (!Array.isArray(brut)) return null;
  const scores = new Map<string, number | null>();
  for (const option of brut) {
    if (!estObjet(option) || typeof option.code !== 'string') return null;
    const score = option.score;
    if (score === undefined || score === null) {
      scores.set(option.code, null);
      continue;
    }
    if (!estScoreDeBareme(score)) return null;
    scores.set(option.code, score);
  }
  return scores;
}

/** Lit `bands: [{max, score}, …, {score}]` — la dernière peut être ouverte. */
function lireBandes(brut: unknown): readonly Bande[] | null {
  if (!Array.isArray(brut) || brut.length === 0) return null;
  const bandes: Bande[] = [];
  for (const bande of brut) {
    if (!estObjet(bande) || !estScoreDeBareme(bande.score)) return null;
    const max = bande.max;
    if (max === undefined || max === null) {
      bandes.push({ max: null, score: bande.score });
      continue;
    }
    if (typeof max !== 'number' || !Number.isFinite(max)) return null;
    bandes.push({ max, score: bande.score });
  }
  return bandes;
}

/**
 * LE BARÈME D'UNE QUESTION FIGÉE — la seule lecture du `scoring_snapshot`.
 *
 * `aucun` et `invalide` ne se confondent jamais : l'ABSENCE de barème est le cas
 * NORMAL d'une question de poids 0 (§32.1 : « donnée factuelle hors scoring, cas
 * par défaut recommandé »), alors qu'un barème PRÉSENT et malformé est un défaut
 * de donnée qui doit remonter.
 */
export function lireBareme(question: QuestionFigee): BaremeLu {
  const type = question.answerType;

  // Les trois types du §32.1 qui n'alimentent jamais le score : quoi que porte
  // leur `scoring`, ils ne cotent pas. Les déclarer invalides pour un `scoring`
  // résiduel ferait remonter une anomalie sur une donnée parfaitement légitime.
  if (appartient(TYPES_HORS_BAREME, type)) return AUCUN;

  const scoring = question.scoring;
  if (scoring === undefined || scoring === null) return AUCUN;
  if (!estObjet(scoring)) return INVALIDE;

  const drapeau = lireDrapeau(scoring);
  if (drapeau === null) return INVALIDE;
  const commun = { drapeau: drapeau ?? null };

  if (appartient(TYPES_TABLE, type)) {
    const table = lireTable(scoring.map);
    return table === null ? INVALIDE : { forme: 'table', table, ...commun };
  }

  if (appartient(TYPES_ECHELLE, type)) {
    return scoring.map === 'identity' ? { forme: 'identite', ...commun } : INVALIDE;
  }

  if (appartient(TYPES_CHOIX, type)) {
    // `source` peut être absent : la structure normée dit déjà où sont les scores.
    // Toute AUTRE source serait une convention que le pack ne décrit pas.
    const source = scoring.source;
    if (source !== undefined && source !== 'options') return INVALIDE;
    const scores = lireOptions(question.options);
    if (scores === null) return INVALIDE;
    const agregatBrut = scoring.aggregate;
    // « multi : `{"aggregate": "max"}` PAR DÉFAUT » (§32.1) — le défaut est écrit
    // dans le pack, il n'est pas inventé ici.
    if (agregatBrut !== undefined && agregatBrut !== 'max' && agregatBrut !== 'mean') {
      return INVALIDE;
    }
    const agregat = agregatBrut === 'mean' ? 'mean' : 'max';
    return { forme: 'options', scores, agregat, ...commun };
  }

  if (appartient(TYPES_NUMERIQUES, type)) {
    const bandes = lireBandes(scoring.bands);
    return bandes === null ? INVALIDE : { forme: 'bandes', bandes, ...commun };
  }

  // Un `answer_type` hors des onze du 04 : le barème ne peut rien en dire.
  return INVALIDE;
}

// -----------------------------------------------------------------------------
// LE POIDS — il gouverne la moyenne, jamais le score
// -----------------------------------------------------------------------------

/**
 * Le poids figé, lu depuis la CHAÎNE du `NUMERIC` (`weight_snapshot`).
 *
 * Rend `NaN` quand la chaîne n'est pas un nombre — et surtout PAS 1, ni 0. Un
 * défaut par défaut ferait entrer dans une moyenne pondérée un poids que personne
 * n'a choisi ; `NaN` se propage et fait sortir la question du calcul par
 * `questionEstScorable`, ce qui est le comportement voulu et visible.
 */
export function poidsDeQuestion(question: QuestionFigee): number {
  const brut = question.weight.trim();
  if (brut === '') return Number.NaN;
  const poids = Number(brut);
  return Number.isFinite(poids) ? poids : Number.NaN;
}

/**
 * Une question entre-t-elle dans les moyennes du §32.1-2 ?
 *
 * Deux conditions, et elles sont indépendantes : un POIDS strictement positif et
 * un BARÈME exploitable. Une question de poids 0 dotée d'un barème valide produit
 * un score (le §32.1 le prévoit : donnée factuelle) mais ne pèse sur rien — et
 * elle peut porter un drapeau rouge, ce qui est exactement le cas où « masquer par
 * la moyenne » serait le plus facile, puisqu'elle n'est dans aucune moyenne.
 */
export function questionEstScorable(question: QuestionFigee): boolean {
  const poids = poidsDeQuestion(question);
  if (!Number.isFinite(poids) || poids <= 0) return false;
  const forme = lireBareme(question).forme;
  return forme !== 'aucun' && forme !== 'invalide';
}

// -----------------------------------------------------------------------------
// LA VALEUR DE RÉPONSE — 04 l. 150-151, transcrit
// -----------------------------------------------------------------------------

type ValeurLue =
  | { readonly forme: 'absente' }
  | { readonly forme: 'scalaire'; readonly v: unknown }
  | { readonly forme: 'liste'; readonly v: readonly unknown[] }
  | { readonly forme: 'fourchette'; readonly basse: unknown; readonly haute: unknown }
  | { readonly forme: 'illisible' };

/**
 * Lit `answers.value` : `{type, v}`, `{type:'range', low, high}`, ou rien.
 *
 * Un scalaire nu est toléré en lecture (il se rencontre dans des exports et des
 * jeux d'essai) ; il n'est jamais PRODUIT par le terrain, dont le 04 fixe la forme.
 */
function lireValeur(brut: unknown): ValeurLue {
  if (brut === undefined || brut === null) return { forme: 'absente' };
  if (!estObjet(brut)) return { forme: 'scalaire', v: brut };

  if (brut.type === 'range') {
    const { low, high } = brut;
    if (low === undefined && high === undefined) return { forme: 'absente' };
    return { forme: 'fourchette', basse: low, haute: high };
  }

  if (!('v' in brut)) return { forme: 'illisible' };
  const v = brut.v;
  if (v === undefined || v === null) return { forme: 'absente' };
  if (Array.isArray(v)) return { forme: 'liste', v };
  return { forme: 'scalaire', v };
}

/**
 * La grandeur NUMÉRIQUE d'une valeur — et, pour une fourchette, sa BORNE BASSE.
 *
 * « Réponse en fourchette (§27.4) : le score s'évalue sur la borne BASSE
 * (prudence) » (§32.1). Un audit qui coterait [20 ; 80] à 80 promettrait au client
 * le meilleur des cas sur une information qu'il a refusé de préciser.
 */
function grandeurNumerique(valeur: ValeurLue): number | null {
  if (valeur.forme === 'scalaire') {
    return typeof valeur.v === 'number' && Number.isFinite(valeur.v) ? valeur.v : null;
  }
  if (valeur.forme === 'fourchette') {
    return typeof valeur.basse === 'number' && Number.isFinite(valeur.basse) ? valeur.basse : null;
  }
  return null;
}

/** Une clé de table ou un code d'option : les JSONB ne portent que texte et nombre. */
function cleDeValeur(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** Rendu COURT et non personnel d'une valeur — jamais un verbatim (06 §10.4). */
function rendreCourt(valeur: ValeurLue): string {
  const texte = ((): string => {
    switch (valeur.forme) {
      case 'scalaire':
        return String(valeur.v);
      case 'liste':
        return valeur.v.map((element) => String(element)).join(', ');
      case 'fourchette':
        return `${String(valeur.basse)} – ${String(valeur.haute)}`;
      case 'absente':
      case 'illisible':
        return '';
    }
  })();
  return texte.length > 80 ? `${texte.slice(0, 79)}…` : texte;
}

// -----------------------------------------------------------------------------
// LA COTATION D'UNE VALEUR SELON SON BARÈME
// -----------------------------------------------------------------------------

/**
 * Le résultat d'une cotation, et — quand ils diffèrent — les scores ÉLÉMENTAIRES
 * dont le score final est fait.
 *
 * `elementaires` n'existe que pour le CHOIX MULTIPLE, seul cas du §32.1 où une
 * réponse porte plusieurs scores avant d'en faire un seul (`aggregate: max|mean`).
 * Il est là pour le DRAPEAU ROUGE, et pour rien d'autre : voir `evaluerDrapeau`.
 */
type Verdict =
  | { readonly score: number; readonly elementaires?: readonly number[] }
  | { readonly motif: MotifNonCotable };

const INEXPLOITABLE: Verdict = { motif: 'valeur_inexploitable' };
const SANS_REPONSE: Verdict = { motif: 'sans_reponse' };

function coterParTable(bareme: BaremeLu & { forme: 'table' }, valeur: ValeurLue): Verdict {
  if (valeur.forme === 'absente') return SANS_REPONSE;
  if (valeur.forme !== 'scalaire') return INEXPLOITABLE;
  const cle = cleDeValeur(valeur.v);
  if (cle === null) return INEXPLOITABLE;
  const score = bareme.table.get(cle);
  // Une valeur hors des clés du barème n'est PAS un zéro : l'absence de score
  // n'est pas un mauvais score, et un zéro inventé traverserait la moyenne.
  return score === undefined ? INEXPLOITABLE : { score };
}

function coterParIdentite(valeur: ValeurLue): Verdict {
  if (valeur.forme === 'absente') return SANS_REPONSE;
  const n = grandeurNumerique(valeur);
  if (n === null || !Number.isInteger(n) || n < 1 || n > SCORE_MAX) return INEXPLOITABLE;
  return { score: n };
}

function coterParOptions(bareme: BaremeLu & { forme: 'options' }, valeur: ValeurLue): Verdict {
  if (valeur.forme === 'absente') return SANS_REPONSE;

  if (valeur.forme === 'scalaire') {
    const cle = cleDeValeur(valeur.v);
    if (cle === null || !bareme.scores.has(cle)) return INEXPLOITABLE;
    const score = bareme.scores.get(cle) ?? null;
    return score === null ? INEXPLOITABLE : { score };
  }

  if (valeur.forme !== 'liste') return INEXPLOITABLE;
  // Une sélection VIDE est une absence de réponse, pas un zéro : personne n'a
  // répondu « aucune de ces propositions », le champ est resté vide.
  if (valeur.v.length === 0) return SANS_REPONSE;

  const scores: number[] = [];
  for (const element of valeur.v) {
    const cle = cleDeValeur(element);
    if (cle === null || !bareme.scores.has(cle)) return INEXPLOITABLE;
    const score = bareme.scores.get(cle) ?? null;
    if (score === null) return INEXPLOITABLE;
    scores.push(score);
  }
  // Les scores ÉLÉMENTAIRES voyagent à côté de l'agrégat : l'agrégation est la
  // bonne règle pour la MOYENNE (§32.1-2) et la mauvaise pour l'ALERTE. Voir
  // `evaluerDrapeau`.
  if (bareme.agregat === 'mean') {
    return {
      score: scores.reduce((somme, s) => somme + s, 0) / scores.length,
      elementaires: scores,
    };
  }
  return { score: Math.max(...scores), elementaires: scores };
}

function coterParBandes(bareme: BaremeLu & { forme: 'bandes' }, valeur: ValeurLue): Verdict {
  if (valeur.forme === 'absente') return SANS_REPONSE;
  const n = grandeurNumerique(valeur);
  if (n === null) return INEXPLOITABLE;
  for (const bande of bareme.bandes) {
    // `max` est une borne INCLUSIVE : 20 tombe dans la bande « max: 20 ».
    if (bande.max === null || n <= bande.max) return { score: bande.score };
  }
  // Aucune bande ouverte et une valeur au-delà du dernier `max` : le barème figé
  // ne dit rien de ce cas. Inventer « le score de la dernière bande » serait une
  // convention que personne n'a écrite.
  return INEXPLOITABLE;
}

/**
 * Un barème dont on peut TIRER un score — `aucun` et `invalide` en sont exclus PAR
 * LE TYPE, et non par un test à l'exécution.
 *
 * `coterReponse` les a déjà écartés avant d'arriver ici. Les retester donnerait un
 * chemin qu'aucun appel ne peut atteindre, donc qu'aucun test ne peut couvrir :
 * du code mort qui a l'air vivant.
 */
type BaremeExploitable = Extract<
  BaremeLu,
  { forme: 'table' } | { forme: 'identite' } | { forme: 'options' } | { forme: 'bandes' }
>;

function coterValeur(bareme: BaremeExploitable, valeur: ValeurLue): Verdict {
  switch (bareme.forme) {
    case 'table':
      return coterParTable(bareme, valeur);
    case 'identite':
      return coterParIdentite(valeur);
    case 'options':
      return coterParOptions(bareme, valeur);
    case 'bandes':
      return coterParBandes(bareme, valeur);
  }
}

// -----------------------------------------------------------------------------
// LE DRAPEAU ROUGE — évalué UNIQUEMENT si `criticality = 'bloquant'` (§32.1-6)
// -----------------------------------------------------------------------------

interface Drapeau {
  readonly declencheur: DeclencheurDrapeauRouge;
  readonly seuil: number | null;
  readonly valeur: string;
}

/**
 * Les valeurs BRUTES d'une réponse, telles que `red_flag.values` les compare.
 *
 * Un choix multiple en porte plusieurs : « déclenche dès qu'UNE des options
 * choisies y figure » — l'union, jamais une agrégation. Une seule option au rouge
 * suffit, et c'est le même principe que le canal des drapeaux tout entier.
 */
function valeursBrutes(valeur: ValeurLue): readonly unknown[] {
  if (valeur.forme === 'scalaire') return [valeur.v];
  if (valeur.forme === 'liste') return valeur.v;
  return [];
}

/**
 * Deux valeurs désignent-elles la même chose, AU SENS OÙ LE BARÈME LES COMPARE ?
 *
 * LA MÊME COERCITION QUE LA COTATION, ET C'EST TOUT L'ENJEU. `cleDeValeur` rend
 * `"1"` pour le nombre `1` comme pour la chaîne `"1"` — c'est ainsi qu'une table
 * `{"1": 5}` sait coter une réponse numérique. Comparer les drapeaux par
 * `Object.is` faisait diverger les deux lectures : la même valeur était COMPRISE
 * par le barème et IGNORÉE par l'alerte. Deux règles de comparaison pour une même
 * valeur, dans le même fichier, est un piège qui se paie un jour où personne ne
 * regarde (relevé par la revue croisée, arbitré par A01 le 2026-09-06).
 *
 * Quand l'une des deux n'est PAS coercible (un booléen, un objet), on retombe sur
 * l'identité stricte : `true` ne devient pas `"true"`, faute de quoi on élargirait
 * la détection au lieu de l'aligner.
 */
function memeValeur(brute: unknown, attendue: unknown): boolean {
  const cleBrute = cleDeValeur(brute);
  const cleAttendue = cleDeValeur(attendue);
  if (cleBrute !== null && cleAttendue !== null) return cleBrute === cleAttendue;
  return Object.is(brute, attendue);
}

function evaluerDrapeau(
  question: QuestionFigee,
  bareme: BaremeExploitable,
  valeur: ValeurLue,
  verdict: Verdict,
): Drapeau | null {
  // « évalué UNIQUEMENT si criticality='bloquant' » — la criticité gouverne le
  // drapeau, le poids gouverne la moyenne, le barème gouverne le score.
  if (question.criticality !== 'bloquant') return null;
  const drapeau = bareme.drapeau;
  if (drapeau === null) return null;

  if (drapeau.mode === 'valeurs') {
    // `values` compare la valeur BRUTE, pas le score : c'est ce qui permet de
    // marquer « non » sur une question dont le barème cote « non » à 3.
    for (const brute of valeursBrutes(valeur)) {
      for (const attendue of drapeau.valeurs) {
        if (memeValeur(brute, attendue)) {
          return { declencheur: 'valeurs', seuil: null, valeur: String(brute) };
        }
      }
    }
    return null;
  }

  // `below` compare le SCORE (0-5), la seule grandeur commune à tous les types.
  //
  // ── SUR CHAQUE OPTION RETENUE, ET NON SUR L'AGRÉGAT ────────────────────────
  // Le défaut que ceci ferme : un choix multiple d'options {1, 5} avec
  // `red_flag {below: 2}` rendait 5 en `max` et 3 en `mean`, donc AUCUN drapeau —
  // l'option au rouge était effacée par l'agrégation AVANT que le seuil ne la
  // voie. C'était un drapeau masqué par une moyenne, un étage sous tous ceux que
  // les preuves de conception visaient : elles attaquaient le bloc, l'unité et le
  // roll-up, tous en aval de ce point.
  //
  // L'arbitrage (A01, 2026-09-06) suit les doctrines de cotation du 2026-09-02 :
  // « le système le plus défavorable fait la note » (2) et « l'unité la plus
  // défavorable fait la note » (5). Un `max` qui efface l'option au rouge dit
  // exactement l'inverse de la doctrine que le pack vient d'arbitrer.
  //
  // L'agrégat reste le SCORE (la moyenne du §32.1-2 ne bouge pas) ; seule
  // l'ALERTE regarde le détail. C'est la même séparation que partout ailleurs
  // dans ce lot : le canal des drapeaux ne passe par aucune moyenne.
  if (!('score' in verdict)) return null;
  const aEvaluer = verdict.elementaires ?? [verdict.score];
  // Une borne ATTEINTE n'est pas une borne FRANCHIE : strictement en dessous.
  if (!aEvaluer.some((valeurCotee) => valeurCotee < drapeau.borne)) return null;
  return { declencheur: 'seuil', seuil: drapeau.borne, valeur: rendreCourt(valeur) };
}

// -----------------------------------------------------------------------------
// LA COTATION D'UNE RÉPONSE — le point d'entrée
// -----------------------------------------------------------------------------

function sansScore(
  reponse: ReponseACoter,
  motif: MotifNonCotable,
  baremeInvalide = false,
): CotationDetaillee {
  return {
    reponseId: reponse.id,
    missionQuestionId: reponse.missionQuestionId,
    score: null,
    motifNonCotable: motif,
    baremeInvalide,
    declencheurDrapeau: null,
    seuilDrapeau: null,
    valeurDeclenchante: '',
  };
}

/**
 * COTE UNE RÉPONSE — score, motif de non-cotation, et drapeau rouge éventuel.
 *
 * L'ordre des tests n'est pas un détail d'implémentation, c'est le §27.4 :
 *   1. le REFUS d'abord — il l'emporte même si une valeur traîne dans la ligne,
 *      et même s'il coexiste avec un « sans objet ». Un refus est un FAIT d'audit
 *      qui va aux « Limites et réserves » ; le perdre au profit d'une valeur
 *      résiduelle ferait disparaître du rapport ce que le client a refusé de dire ;
 *   2. le SANS OBJET ensuite — la question ne se pose pas ici ;
 *   3. le BARÈME enfin.
 * Un refus ne déclenche AUCUN drapeau : il n'y a rien à évaluer. Le moteur, lui,
 * compte cette non-évaluation quand la question est bloquante — c'est l'autre
 * façon de masquer un point critique, et la plus discrète.
 */
export function coterReponse(question: QuestionFigee, reponse: ReponseACoter): CotationDetaillee {
  if (reponse.withheld) return sansScore(reponse, 'non_communique');
  if (reponse.notApplicable) return sansScore(reponse, 'sans_objet');

  const bareme = lireBareme(question);
  if (bareme.forme === 'invalide') return sansScore(reponse, 'hors_bareme', true);
  if (bareme.forme === 'aucun') return sansScore(reponse, 'hors_bareme');

  const valeur = lireValeur(reponse.value);
  const verdict = coterValeur(bareme, valeur);
  const score = 'score' in verdict ? verdict.score : null;
  const drapeau = evaluerDrapeau(question, bareme, valeur, verdict);

  return {
    reponseId: reponse.id,
    missionQuestionId: reponse.missionQuestionId,
    score,
    motifNonCotable: 'motif' in verdict ? verdict.motif : null,
    baremeInvalide: false,
    declencheurDrapeau: drapeau?.declencheur ?? null,
    seuilDrapeau: drapeau?.seuil ?? null,
    valeurDeclenchante: drapeau?.valeur ?? '',
  };
}
