// =============================================================================
// BANQUE DE QUESTIONS — schémas et contrôles d'admission (lot L4, agent A41)
//
// PORTÉE : ce module est le SEUL garde-fou de forme du champ `questions.scoring`.
// La colonne est un JSONB (04 §7.3) : PostgreSQL n'y vérifie RIEN — ni la présence
// d'une clé, ni le type d'une valeur, ni la cohérence avec `answer_type`. Un barème
// malformé passerait l'INSERT sans un mot, serait figé tel quel dans
// `mission_questions.scoring_snapshot` (04, « le barème est figé avec la question »),
// et ne se manifesterait qu'au calcul du score (L8) — sur une mission déjà collectée,
// c'est-à-dire au pire moment possible. D'où : tout ce que la base ne peut pas tenir
// est tenu ici, en amont de l'écriture.
//
// SOURCES (transcription, pas interprétation) :
//   · 03 M1.1        — les 11 types de réponse, étiquettes, pondération, statuts
//   · 03 §32.1       — le BARÈME par type de réponse + le drapeau rouge
//   · 03 §32.4       — les ANCRES DE COTATION, critère d'ADMISSION en banque
//   · 03 §36.4       — le format d'import (colonnes, contrôles bloquants)
//   · 04 §7 / §7.3   — la table `questions` et la forme normée de `scoring`
//
// CE MODULE N'ÉCRIT RIEN et ne connaît ni base ni fichier : il reçoit une ligne
// d'import déjà découpée (des chaînes) et rend un verdict. C'est ce qui permet à la
// PASSE 1 de l'import (03 §35.2 : « atomique, rapport d'erreurs ligne à ligne »)
// d'évaluer un fichier ENTIER sans ouvrir une transaction.
// Il est réutilisable tel quel par la question ad hoc de la sync (11 §4 :
// « payload = {question: {…champs §36.4…}} ») et par le back-office M1 (L9).
//
// Invariant 5 : tous les messages sont en français, destinés à être lus par un
// administrateur devant son fichier.
// Traçabilité : E4 (banque de questions), E43 (conventions).
// =============================================================================
import { z } from 'zod';

// ---------------------------------------------------------------------------
// ÉNUMÉRATIONS — recopiées des CHECK du fichier 04, dans le même ordre.
// ---------------------------------------------------------------------------

/**
 * Les ONZE types de réponse (03 M1.1, CHECK `questions_answer_type_check` du 04).
 * Le jeu de recette de l'import doit couvrir les onze : un type non couvert est un
 * barème dont personne n'a jamais vu le refus.
 */
export const TYPES_DE_REPONSE = [
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
export type TypeDeReponse = (typeof TYPES_DE_REPONSE)[number];

/** Types dont le barème vit dans `options[].score` (§32.1). */
export const TYPES_A_OPTIONS = ['single_choice', 'multi_choice'] as const;

/** Types cotés par bandes de valeurs (§32.1) — et seuls types « fourchette » (§27.4). */
export const TYPES_NUMERIQUES = ['number', 'percent', 'duration', 'money'] as const;

/** Types dont le §32.1 impose `weight = 0` : ils alimentent le rapport, jamais le score. */
export const TYPES_HORS_SCORING = ['free_text', 'date', 'table'] as const;

export const CRITICITES = ['bloquant', 'important', 'informatif'] as const;
export type Criticite = (typeof CRITICITES)[number];

export const SOURCES_ATTENDUES = [
  'entretien',
  'observation',
  'demonstration',
  'document',
  'releve',
] as const;

export const PERIMETRES_GEO = ['france', 'multi_pays', 'tous'] as const;

/** Niveaux d'audit applicables (01 §20.1, CHECK `missions.audit_level`). */
export const NIVEAUX_AUDIT = ['diagnostic_cadrage', 'operationnel', 'strategique_groupe'] as const;

/** Statuts de cycle de vie d'une question (03 M1.1, CHECK du 04). */
export const STATUTS_QUESTION = ['draft', 'active', 'archived'] as const;
export type StatutQuestion = (typeof STATUTS_QUESTION)[number];

// ---------------------------------------------------------------------------
// COLONNES DU FICHIER D'IMPORT — 03 §36.4, dans l'ordre du pack.
// ---------------------------------------------------------------------------

/**
 * Les en-têtes du §36.4. Le pack les déclare « obligatoires » : le contrôle porte
 * donc sur la PRÉSENCE de la colonne, pas sur celle de la valeur. Les colonnes
 * marquées `*` au §36.4 (`code`, `bloc_code`, `texte_fr`, `answer_type`) exigent en
 * plus une valeur non vide — c'est la seule lecture qui donne un sens aux deux
 * notations à la fois.
 */
export const COLONNES_IMPORT_BANQUE = [
  'code',
  'bloc_code',
  'texte_fr',
  'guidance_fr',
  'answer_type',
  'options',
  'allow_range',
  'poids',
  'scoring',
  'criticality',
  'expected_source',
  'secteurs',
  'services_cibles',
  'niveaux',
  'effectif_min',
  'effectif_max',
  'profils',
  'geo',
] as const;
export type ColonneImportBanque = (typeof COLONNES_IMPORT_BANQUE)[number];

/** Colonnes dont la VALEUR est obligatoire (marquées `*` au §36.4). */
export const COLONNES_VALEUR_OBLIGATOIRE = [
  'code',
  'bloc_code',
  'texte_fr',
  'answer_type',
] as const;

/** Séparateur des listes de codes en cellule (§36.4 : « codes séparés par `|` »). */
export const SEPARATEUR_LISTE = '|';

// ---------------------------------------------------------------------------
// CODES DE DÉFAUT DU RAPPORT D'IMPORT
//
// Ce ne sont PAS des `ERROR_CODES` HTTP (11 §3) : l'import du lot L4 est un SCRIPT,
// il ne répond à personne en HTTP. Le jour où L9 exposera l'import en route, un code
// d'enveloppe (`BANK_IMPORT_REJECTED`, sur le modèle du `CSV_IMPORT_REJECTED` de L3)
// devra être ajouté à `ERROR_CODES` par entrée DECISIONS.md — c'est une décision
// d'API (11 §8-6), pas un choix de script. Les codes ci-dessous voyageront alors
// dans `details[]`, inchangés.
// ---------------------------------------------------------------------------
export const CODES_DEFAUT_IMPORT = {
  // --- Structure du fichier -------------------------------------------------
  ENTETE_MANQUANT: 'ENTETE_MANQUANT',
  ENTETE_INCONNU: 'ENTETE_INCONNU',
  ENTETE_DUPLIQUE: 'ENTETE_DUPLIQUE',
  FICHIER_VIDE: 'FICHIER_VIDE',
  NOMBRE_DE_CHAMPS: 'NOMBRE_DE_CHAMPS',
  JSON_RACINE_INVALIDE: 'JSON_RACINE_INVALIDE',

  // --- Valeurs de ligne -----------------------------------------------------
  VALEUR_OBLIGATOIRE: 'VALEUR_OBLIGATOIRE',
  VALEUR_HORS_ENUM: 'VALEUR_HORS_ENUM',
  VALEUR_NON_NUMERIQUE: 'VALEUR_NON_NUMERIQUE',
  VALEUR_NON_BOOLEENNE: 'VALEUR_NON_BOOLEENNE',
  CODE_INVALIDE: 'CODE_INVALIDE',
  CODE_DUPLIQUE_DANS_FICHIER: 'CODE_DUPLIQUE_DANS_FICHIER',
  CODE_DEJA_EN_BANQUE: 'CODE_DEJA_EN_BANQUE',
  BLOC_INCONNU: 'BLOC_INCONNU',
  REFERENTIEL_INCONNU: 'REFERENTIEL_INCONNU',
  EFFECTIF_INCOHERENT: 'EFFECTIF_INCOHERENT',
  FOURCHETTE_INTERDITE: 'FOURCHETTE_INTERDITE',

  // --- Options --------------------------------------------------------------
  OPTIONS_JSON_INVALIDE: 'OPTIONS_JSON_INVALIDE',
  OPTIONS_MANQUANTES: 'OPTIONS_MANQUANTES',
  OPTIONS_INTERDITES: 'OPTIONS_INTERDITES',
  OPTION_CODE_DUPLIQUE: 'OPTION_CODE_DUPLIQUE',
  OPTION_SCORE_MANQUANT: 'OPTION_SCORE_MANQUANT',

  // --- Barème (§32.1) -------------------------------------------------------
  SCORING_JSON_INVALIDE: 'SCORING_JSON_INVALIDE',
  SCORING_MANQUANT: 'SCORING_MANQUANT',
  SCORING_INTERDIT: 'SCORING_INTERDIT',
  SCORING_INCOHERENT: 'SCORING_INCOHERENT',
  POIDS_INTERDIT: 'POIDS_INTERDIT',
  DRAPEAU_ROUGE_INCOHERENT: 'DRAPEAU_ROUGE_INCOHERENT',

  // --- Ancres de cotation (§32.4) -------------------------------------------
  ANCRES_ABSENTES: 'ANCRES_ABSENTES',
  ANCRES_INCOMPLETES: 'ANCRES_INCOMPLETES',
  ANCRE_VIDE: 'ANCRE_VIDE',
  ANCRE_DUPLIQUEE: 'ANCRE_DUPLIQUEE',

  // --- Avertissements (non bloquants) ---------------------------------------
  BAREME_SANS_POIDS: 'BAREME_SANS_POIDS',
  DRAPEAU_ROUGE_NON_EVALUE: 'DRAPEAU_ROUGE_NON_EVALUE',
  ANCRES_SUR_TYPE_NON_ECHELLE: 'ANCRES_SUR_TYPE_NON_ECHELLE',
} as const;

export type CodeDefautImport = (typeof CODES_DEFAUT_IMPORT)[keyof typeof CODES_DEFAUT_IMPORT];

/**
 * Un défaut relevé sur une ligne. `colonne` est nulle quand le défaut porte sur la
 * ligne entière (cohérence entre colonnes) ou sur le fichier.
 * Le numéro de ligne est ajouté par l'appelant, qui seul sait lire un fichier.
 */
export interface DefautImport {
  readonly colonne: ColonneImportBanque | null;
  readonly code: CodeDefautImport;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// OPTIONS — structure normée du 04 : [{code TEXT, label TEXT, score NUMERIC NULL}]
// ---------------------------------------------------------------------------

/**
 * `.strict()` est délibéré : une clé inconnue dans une option est presque toujours
 * une colonne de tableur oubliée dans le JSON. La laisser passer la ferait voyager
 * jusque dans `options_snapshot`, où plus personne ne saurait dire si elle compte.
 */
export const optionQuestionSchema = z
  .strictObject({
    code: z.string().min(1, 'Le code d’option ne peut pas être vide.'),
    label: z.string().min(1, 'Le libellé d’option ne peut pas être vide.'),
    score: z.number().min(0).max(5).nullable().optional(),
  })
  .describe('Option de réponse (04 : [{code, label, score}])');

export type OptionQuestion = z.infer<typeof optionQuestionSchema>;

export const optionsQuestionSchema = z.array(optionQuestionSchema);

// ---------------------------------------------------------------------------
// SCORING — forme normée du champ JSONB (03 §32.1, 04 §7.3)
// ---------------------------------------------------------------------------

/** Tous les scores du produit vivent sur 0-5 (« tous les scores sont sur 0-5 par construction », §32.1). */
export const SCORE_MIN = 0;
export const SCORE_MAX = 5;

const scoreSchema = z
  .number()
  .min(SCORE_MIN, `Un score vaut au minimum ${String(SCORE_MIN)}.`)
  .max(SCORE_MAX, `Un score vaut au maximum ${String(SCORE_MAX)}.`);

/** Bande de cotation d'une valeur numérique. `max` absent = bande ouverte (fourre-tout). */
export const bandeScoringSchema = z.strictObject({
  max: z.number().optional(),
  score: scoreSchema,
});

/**
 * Drapeau rouge (§32.1) : `values` pour les réponses à valeurs discrètes,
 * `below` pour les réponses cotées sur une grandeur. Jamais les deux — un drapeau
 * qui pourrait se déclencher de deux façons ne se relit pas.
 */
export const drapeauRougeSchema = z.union([
  z.strictObject({ values: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ below: z.number() }),
]);

/**
 * Le champ `scoring` dans sa GÉNÉRALITÉ. La cohérence avec `answer_type` n'est PAS
 * exprimable ici (elle dépend d'une autre colonne) : elle est vérifiée par
 * `verifierBaremeSelonType`, appelée juste après. Ce schéma ne fait que fermer la
 * forme — aucune clé hors des six du pack.
 */
export const scoringQuestionSchema = z
  .strictObject({
    map: z.union([z.literal('identity'), z.record(z.string().min(1), scoreSchema)]).optional(),
    source: z.literal('options').optional(),
    aggregate: z.enum(['max', 'mean']).optional(),
    bands: z.array(bandeScoringSchema).min(1).optional(),
    red_flag: drapeauRougeSchema.optional(),
  })
  .describe('Barème §32.1 figé dans mission_questions.scoring_snapshot');

export type ScoringQuestion = z.infer<typeof scoringQuestionSchema>;

/** Clés de barème (hors `red_flag`) : leur présence rend le `scoring` « scorant ». */
const CLES_DE_BAREME = ['map', 'source', 'aggregate', 'bands'] as const;

/** Vrai si le `scoring` porte un barème, et pas seulement un drapeau rouge. */
export function porteUnBareme(scoring: ScoringQuestion): boolean {
  return CLES_DE_BAREME.some((cle) => scoring[cle] !== undefined);
}

/** Valeurs acceptées par le barème `yes_no` (§32.1 : `{"map": {"oui": 5, "non": 0}}`). */
export const VALEURS_OUI_NON = ['oui', 'non'] as const;

// ---------------------------------------------------------------------------
// ANCRES DE COTATION — §32.4, critère d'ADMISSION en banque
//
// Le pack donne UN exemple normatif et un seul :
//   « 1 = aucun processus documenté · 3 = documenté mais non appliqué ·
//     5 = documenté, appliqué, mesuré »
// Il ne dit ni combien d'ancres, ni sur quelles bornes, ni si une échelle
// partiellement ancrée est acceptable (voir le rapport de lot : POINT OUVERT n° 1).
//
// RÈGLE APPLIQUÉE ICI, ET POURQUOI : les trois ancres de l'exemple — 1, 3 et 5 —
// sont exigées ; 2 et 4 restent facultatifs. C'est la seule règle que le pack
// SOUTIENT littéralement (son unique exemple), et c'est aussi la seule qui rende la
// cotation reproductible : deux auditeurs qui ne partagent que les bornes 1 et 5
// n'ont aucun repère pour distinguer un 2 d'un 4, et la divergence §32.1 (écart-type
// ≥ 1,5) mesurerait alors leur désaccord de vocabulaire, pas celui du terrain.
// Une échelle partiellement ancrée est donc REFUSÉE — c'est un contrôle bloquant,
// et un contrôle bloquant qui laisse passer la moitié des cas n'en est pas un.
// À arbitrer par Williams : la règle est stricte, elle est ici pour être discutée.
// ---------------------------------------------------------------------------

/** Les niveaux d'ancre EXIGÉS sur une échelle 1-5. */
export const ANCRES_REQUISES = [1, 3, 5] as const;

/** Séparateurs d'ancres tolérés dans `guidance_fr` (le pack emploie « · »). */
const SEPARATEURS_ANCRES = /[·•;\n|]+/;

/** Une ancre lue : le niveau coté et le libellé qui le définit. */
export interface AncreDeCotation {
  readonly niveau: number;
  readonly libelle: string;
}

/**
 * Extrait les ancres de `guidance_fr`. Tolérante à la forme (« 1 = … », « 1 : … »,
 * séparateurs `·`, `;`, `|`, retour à la ligne), stricte sur le fond : un niveau sans
 * libellé n'est pas une ancre, c'est une promesse d'ancre.
 */
export function lireAncresDeCotation(guidance: string | null | undefined): {
  ancres: AncreDeCotation[];
  niveauxHorsEchelle: number[];
  niveauxSansLibelle: number[];
} {
  const ancres: AncreDeCotation[] = [];
  const niveauxHorsEchelle: number[] = [];
  const niveauxSansLibelle: number[] = [];
  if (guidance === null || guidance === undefined) {
    return { ancres, niveauxHorsEchelle, niveauxSansLibelle };
  }

  for (const fragment of guidance.split(SEPARATEURS_ANCRES)) {
    // Le chiffre doit ouvrir le fragment ou suivre un séparateur de phrase : sans
    // cette borne, « article 50 = … » se ferait passer pour l'ancre 0.
    const trouve = /(?:^|[\s([«"'—–-])(\d)\s*[=:]\s*(.*)$/.exec(fragment);
    if (trouve === null) continue;
    const niveau = Number(trouve[1]);
    const libelle = (trouve[2] ?? '').trim();
    if (niveau < 1 || niveau > 5) {
      niveauxHorsEchelle.push(niveau);
      continue;
    }
    if (libelle === '') {
      niveauxSansLibelle.push(niveau);
      continue;
    }
    ancres.push({ niveau, libelle });
  }

  return { ancres, niveauxHorsEchelle, niveauxSansLibelle };
}

// ---------------------------------------------------------------------------
// LIGNE NORMALISÉE — ce qu'on écrira en base si, et seulement si, TOUT est vert.
// ---------------------------------------------------------------------------

/** Une ligne d'import validée, prête pour l'INSERT (noms de colonnes du 04). */
export interface QuestionImportee {
  readonly code: string;
  readonly blocCode: string;
  readonly textFr: string;
  readonly guidanceFr: string | null;
  readonly answerType: TypeDeReponse;
  readonly options: OptionQuestion[] | null;
  readonly allowRange: boolean;
  readonly weight: number;
  readonly scoring: ScoringQuestion | null;
  readonly criticality: Criticite;
  readonly expectedSource: string | null;
  readonly sectors: string[];
  readonly targetServices: string[];
  readonly levels: string[];
  readonly headcountMin: number | null;
  readonly headcountMax: number | null;
  readonly profiles: string[];
  readonly geo: string;
}

/** Verdict d'analyse d'une ligne : la question n'est rendue que si aucun défaut ne bloque. */
export interface VerdictLigne {
  readonly question: QuestionImportee | null;
  readonly erreurs: DefautImport[];
  readonly avertissements: DefautImport[];
}

/** Les référentiels contre lesquels une ligne se vérifie (lus en base, passe 1). */
export interface ReferentielsBanque {
  readonly blocs: ReadonlySet<string>;
  readonly secteurs: ReadonlySet<string>;
  readonly services: ReadonlySet<string>;
  readonly profils: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Petites aides de lecture de cellule.
// ---------------------------------------------------------------------------

function defaut(
  colonne: ColonneImportBanque | null,
  code: CodeDefautImport,
  message: string,
): DefautImport {
  return { colonne, code, message };
}

function cellule(brut: Readonly<Record<string, string>>, colonne: ColonneImportBanque): string {
  return (brut[colonne] ?? '').trim();
}

/** Découpe une cellule « a|b|c » en codes. Vide = liste vide (« [] = universelle », 04). */
function listeDeCodes(valeur: string): string[] {
  if (valeur === '') return [];
  return valeur
    .split(SEPARATEUR_LISTE)
    .map((c) => c.trim())
    .filter((c) => c !== '');
}

/** Booléen tolérant : le fichier est saisi à la main, pas généré. */
const VRAIS = new Set(['true', 'vrai', 'oui', '1', 'x']);
const FAUX = new Set(['false', 'faux', 'non', '0', '']);

function lireBooleen(valeur: string): boolean | null {
  const v = valeur.toLowerCase();
  if (VRAIS.has(v)) return true;
  if (FAUX.has(v)) return false;
  return null;
}

/**
 * Nombre tolérant à la virgule décimale : un tableur français écrit « 0,5 ».
 * Refuser cette forme ferait échouer l'import sur une convention typographique,
 * ce qui n'apprend rien à personne.
 */
function lireNombre(valeur: string): number | null {
  if (valeur === '') return null;
  const normalise = valeur.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalise)) return null;
  return Number(normalise);
}

function lireEntier(valeur: string): number | null {
  if (valeur === '') return null;
  if (!/^-?\d+$/.test(valeur)) return null;
  return Number(valeur);
}

/** Rend le premier message Zod, préfixé du chemin quand il y en a un. */
function messageZod(erreur: z.ZodError): string {
  const premier = erreur.issues[0];
  if (premier === undefined) return 'Structure invalide.';
  const chemin = premier.path.map((p) => String(p)).join('.');
  return chemin === '' ? premier.message : `${chemin} : ${premier.message}`;
}

/** Longueur maximale d'un `code` de banque — la colonne est TEXT, la lisibilité ne l'est pas. */
export const LONGUEUR_MAX_CODE = 64;

// ---------------------------------------------------------------------------
// COHÉRENCE BARÈME ↔ TYPE DE RÉPONSE (§32.1) — le cœur du contrôle bloquant.
// ---------------------------------------------------------------------------

function verifierBaremeSelonType(
  scoring: ScoringQuestion,
  answerType: TypeDeReponse,
  options: OptionQuestion[] | null,
): DefautImport[] {
  const erreurs: DefautImport[] = [];
  const ajouter = (message: string): void => {
    erreurs.push(defaut('scoring', CODES_DEFAUT_IMPORT.SCORING_INCOHERENT, message));
  };

  // Ce qui n'appartient PAS au type est refusé aussi sûrement que ce qui manque :
  // un `bands` sur un `yes_no` est du barème mort, et le mort ne se relit pas.
  const interdire = (cle: 'map' | 'source' | 'aggregate' | 'bands', raison: string): void => {
    if (scoring[cle] !== undefined) ajouter(`« ${cle} » n’a pas de sens ici : ${raison}`);
  };

  switch (answerType) {
    case 'yes_no': {
      interdire('source', 'les scores d’un oui/non vivent dans « map ».');
      interdire('bands', 'un oui/non n’a pas de valeur à borner.');
      interdire('aggregate', 'une seule réponse, rien à agréger.');
      const map = scoring.map;
      if (map === undefined) {
        ajouter('un oui/non se cote par « map » : {"map": {"oui": 5, "non": 0}} (§32.1).');
        break;
      }
      if (map === 'identity') {
        ajouter('« identity » ne vaut que pour une échelle 1-5 : un oui/non n’est pas un nombre.');
        break;
      }
      const cles = Object.keys(map).sort();
      const attendues = [...VALEURS_OUI_NON].sort();
      if (cles.length !== attendues.length || cles.some((c, i) => c !== attendues[i])) {
        ajouter(
          `« map » doit porter exactement les clés « oui » et « non » (§32.1) ; trouvé : ${
            cles.length === 0 ? 'aucune' : cles.map((c) => `« ${c} »`).join(', ')
          }.`,
        );
      }
      break;
    }

    case 'scale_1_5': {
      interdire('source', 'une échelle 1-5 se cote par elle-même.');
      interdire('bands', 'une échelle 1-5 se cote par elle-même.');
      interdire('aggregate', 'une seule réponse, rien à agréger.');
      if (scoring.map !== 'identity') {
        ajouter('une échelle 1-5 se cote {"map": "identity"} — la valeur EST le score (§32.1).');
      }
      break;
    }

    case 'single_choice':
    case 'multi_choice': {
      interdire('map', 'les scores d’un choix vivent dans options[].score.');
      interdire('bands', 'les scores d’un choix vivent dans options[].score.');
      if (scoring.source !== 'options') {
        ajouter(
          'un choix se cote {"source": "options"} — les scores vivent dans les options (04 §7.3).',
        );
      }
      if (answerType === 'single_choice' && scoring.aggregate !== undefined) {
        ajouter(
          '« aggregate » ne concerne que le choix multiple (§32.1) : un choix unique n’agrège rien.',
        );
      }
      if (options === null || options.length === 0) {
        ajouter('barème « source: options » sans option à coter.');
      }
      break;
    }

    case 'number':
    case 'percent':
    case 'duration':
    case 'money': {
      interdire('map', 'une valeur numérique se cote par bandes.');
      interdire('source', 'une valeur numérique se cote par bandes.');
      interdire('aggregate', 'une seule réponse, rien à agréger.');
      const bandes = scoring.bands;
      if (bandes === undefined) {
        ajouter(
          'une valeur numérique se cote par « bands » : [{"max": 20, "score": 1}, …, {"score": 5}] (§32.1).',
        );
        break;
      }
      // La DERNIÈRE bande doit être ouverte, les précédentes bornées et croissantes.
      // Sans bande ouverte, une valeur au-delà du dernier `max` n'a AUCUN score : le
      // calcul du L8 devrait alors inventer une convention, ce qu'il ne fera pas.
      const derniere = bandes.length - 1;
      let precedent: number | null = null;
      bandes.forEach((bande, i) => {
        if (i === derniere) {
          if (bande.max !== undefined) {
            ajouter(
              'la dernière bande doit être OUVERTE (sans « max ») : sinon une valeur au-delà de ' +
                `${String(bande.max)} n’a pas de score.`,
            );
          }
          return;
        }
        if (bande.max === undefined) {
          ajouter(
            `la bande n° ${String(i + 1)} n’a pas de « max » alors qu’elle n’est pas la dernière : ` +
              'les bandes suivantes seraient inatteignables.',
          );
          return;
        }
        if (precedent !== null && bande.max <= precedent) {
          ajouter(
            `les bornes « max » doivent croître strictement : ${String(bande.max)} suit ${String(precedent)}.`,
          );
        }
        precedent = bande.max;
      });
      break;
    }

    case 'free_text':
    case 'date':
    case 'table': {
      // Traité en amont (SCORING_INTERDIT) : ces types n'ont jamais de barème.
      break;
    }
  }

  return erreurs;
}

function verifierDrapeauRouge(
  scoring: ScoringQuestion,
  answerType: TypeDeReponse,
  options: OptionQuestion[] | null,
): DefautImport[] {
  const drapeau = scoring.red_flag;
  if (drapeau === undefined) return [];
  const erreurs: DefautImport[] = [];
  const ajouter = (message: string): void => {
    erreurs.push(defaut('scoring', CODES_DEFAUT_IMPORT.DRAPEAU_ROUGE_INCOHERENT, message));
  };

  if ('values' in drapeau) {
    if (answerType === 'yes_no') {
      const inconnues = drapeau.values.filter((v) => !VALEURS_OUI_NON.includes(v as 'oui' | 'non'));
      if (inconnues.length > 0) {
        ajouter(
          `drapeau rouge sur des valeurs qu’un oui/non ne peut pas prendre : ${inconnues
            .map((v) => `« ${v} »`)
            .join(', ')}.`,
        );
      }
    } else if (answerType === 'single_choice' || answerType === 'multi_choice') {
      const codes = new Set((options ?? []).map((o) => o.code));
      const inconnues = drapeau.values.filter((v) => !codes.has(v));
      if (inconnues.length > 0) {
        ajouter(
          `drapeau rouge sur des codes d’option inexistants : ${inconnues
            .map((v) => `« ${v} »`)
            .join(', ')}.`,
        );
      }
    } else {
      ajouter(
        '« values » ne s’applique qu’aux réponses à valeurs discrètes (oui/non, choix) ; ' +
          'pour une grandeur, le déclencheur est « below » (§32.1).',
      );
    }
  } else if (
    answerType === 'yes_no' ||
    answerType === 'single_choice' ||
    answerType === 'multi_choice'
  ) {
    ajouter(
      '« below » compare une grandeur : sur un oui/non ou un choix, le déclencheur est ' +
        '« values » (§32.1).',
    );
  }

  return erreurs;
}

// ---------------------------------------------------------------------------
// ANALYSE D'UNE LIGNE — TOUS les défauts, jamais le premier seulement.
// ---------------------------------------------------------------------------

/**
 * Analyse une ligne d'import déjà découpée en cellules (chaînes brutes).
 *
 * Ne s'arrête JAMAIS au premier défaut : l'administrateur qui corrige son fichier
 * doit voir tout ce qui cloche sur la ligne, sinon il fait dix allers-retours là où
 * un seul suffisait. C'est le sens de « rapport d'erreurs ligne à ligne » (§35.2).
 *
 * N'écrit rien, ne connaît ni base ni fichier : les référentiels lui sont FOURNIS.
 */
export function analyserLigneBanque(
  brut: Readonly<Record<string, string>>,
  referentiels: ReferentielsBanque,
): VerdictLigne {
  const erreurs: DefautImport[] = [];
  const avertissements: DefautImport[] = [];

  // --- code ----------------------------------------------------------------
  const code = cellule(brut, 'code');
  if (code === '') {
    erreurs.push(
      defaut(
        'code',
        CODES_DEFAUT_IMPORT.VALEUR_OBLIGATOIRE,
        'Le code est obligatoire : c’est la clé de ré-import et de versionnage de la banque (§36.4).',
      ),
    );
  } else if (code.length > LONGUEUR_MAX_CODE) {
    erreurs.push(
      defaut(
        'code',
        CODES_DEFAUT_IMPORT.CODE_INVALIDE,
        `Le code dépasse ${String(LONGUEUR_MAX_CODE)} caractères (${String(code.length)}).`,
      ),
    );
  }

  // --- bloc ----------------------------------------------------------------
  const blocCode = cellule(brut, 'bloc_code');
  if (blocCode === '') {
    erreurs.push(
      defaut(
        'bloc_code',
        CODES_DEFAUT_IMPORT.VALEUR_OBLIGATOIRE,
        'Le code de bloc est obligatoire.',
      ),
    );
  } else if (!referentiels.blocs.has(blocCode)) {
    erreurs.push(
      defaut(
        'bloc_code',
        CODES_DEFAUT_IMPORT.BLOC_INCONNU,
        `Bloc inconnu : « ${blocCode} ». Les blocs sont un référentiel administré, pas une valeur libre.`,
      ),
    );
  }

  // --- texte ---------------------------------------------------------------
  const textFr = cellule(brut, 'texte_fr');
  if (textFr === '') {
    erreurs.push(
      defaut(
        'texte_fr',
        CODES_DEFAUT_IMPORT.VALEUR_OBLIGATOIRE,
        'Le texte de la question est obligatoire : une question sans texte n’est pas posable.',
      ),
    );
  }

  const guidanceBrut = cellule(brut, 'guidance_fr');
  const guidanceFr = guidanceBrut === '' ? null : guidanceBrut;

  // --- type de réponse -----------------------------------------------------
  const answerTypeBrut = cellule(brut, 'answer_type');
  const answerType = TYPES_DE_REPONSE.find((t) => t === answerTypeBrut);
  if (answerTypeBrut === '') {
    erreurs.push(
      defaut(
        'answer_type',
        CODES_DEFAUT_IMPORT.VALEUR_OBLIGATOIRE,
        'Le type de réponse est obligatoire.',
      ),
    );
  } else if (answerType === undefined) {
    erreurs.push(
      defaut(
        'answer_type',
        CODES_DEFAUT_IMPORT.VALEUR_HORS_ENUM,
        `Type de réponse inconnu : « ${answerTypeBrut} ». Attendu : ${TYPES_DE_REPONSE.join(', ')}.`,
      ),
    );
  }

  // --- options -------------------------------------------------------------
  const optionsBrut = cellule(brut, 'options');
  let options: OptionQuestion[] | null = null;
  if (optionsBrut !== '') {
    let json: unknown;
    try {
      json = JSON.parse(optionsBrut);
    } catch (cause) {
      erreurs.push(
        defaut(
          'options',
          CODES_DEFAUT_IMPORT.OPTIONS_JSON_INVALIDE,
          `JSON illisible : ${cause instanceof Error ? cause.message : 'erreur de syntaxe'}.`,
        ),
      );
      json = undefined;
    }
    if (json !== undefined) {
      const lu = optionsQuestionSchema.safeParse(json);
      if (!lu.success) {
        erreurs.push(
          defaut(
            'options',
            CODES_DEFAUT_IMPORT.OPTIONS_JSON_INVALIDE,
            `Structure d’options invalide (attendu [{code, label, score}]) — ${messageZod(lu.error)}`,
          ),
        );
      } else {
        options = lu.data;
        const vus = new Set<string>();
        for (const option of options) {
          if (vus.has(option.code)) {
            erreurs.push(
              defaut(
                'options',
                CODES_DEFAUT_IMPORT.OPTION_CODE_DUPLIQUE,
                `Code d’option en double : « ${option.code} ». Une réponse cochée deviendrait ambiguë.`,
              ),
            );
          }
          vus.add(option.code);
        }
      }
    }
  }

  if (answerType !== undefined) {
    const attendDesOptions = TYPES_A_OPTIONS.some((t) => t === answerType);
    if (attendDesOptions && (options === null || options.length === 0)) {
      erreurs.push(
        defaut(
          'options',
          CODES_DEFAUT_IMPORT.OPTIONS_MANQUANTES,
          `Un type « ${answerType} » exige au moins une option (03 M1.1).`,
        ),
      );
    }
    if (!attendDesOptions && options !== null && options.length > 0) {
      erreurs.push(
        defaut(
          'options',
          CODES_DEFAUT_IMPORT.OPTIONS_INTERDITES,
          `Un type « ${answerType} » n’a pas d’options : elles seraient figées dans le snapshot de mission sans jamais être affichées.`,
        ),
      );
    }
  }

  // --- fourchette (§27.4) --------------------------------------------------
  const allowRangeBrut = cellule(brut, 'allow_range');
  const allowRangeLu = lireBooleen(allowRangeBrut);
  if (allowRangeLu === null) {
    erreurs.push(
      defaut(
        'allow_range',
        CODES_DEFAUT_IMPORT.VALEUR_NON_BOOLEENNE,
        `Valeur booléenne attendue (vrai/faux, true/false, 1/0) ; trouvé « ${allowRangeBrut} ».`,
      ),
    );
  }
  const allowRange = allowRangeLu ?? false;
  if (allowRange && answerType !== undefined && !TYPES_NUMERIQUES.some((t) => t === answerType)) {
    erreurs.push(
      defaut(
        'allow_range',
        CODES_DEFAUT_IMPORT.FOURCHETTE_INTERDITE,
        `La réponse en fourchette ne concerne que ${TYPES_NUMERIQUES.join(', ')} (§27.4) ; ` +
          `« ${answerType} » ne s’encadre pas.`,
      ),
    );
  }

  // --- poids ---------------------------------------------------------------
  const poidsBrut = cellule(brut, 'poids');
  const poidsLu = lireNombre(poidsBrut);
  if (poidsBrut !== '' && poidsLu === null) {
    erreurs.push(
      defaut(
        'poids',
        CODES_DEFAUT_IMPORT.VALEUR_NON_NUMERIQUE,
        `Poids non numérique : « ${poidsBrut} ».`,
      ),
    );
  } else if (poidsLu !== null && poidsLu < 0) {
    erreurs.push(
      defaut(
        'poids',
        CODES_DEFAUT_IMPORT.VALEUR_NON_NUMERIQUE,
        'Un poids négatif renverserait le sens du score du bloc (§32.1) : refusé.',
      ),
    );
  }
  // Défaut 1 (03 M1.1 : « défaut 1 ; 0 = hors scoring »), comme la colonne du 04.
  const weight = poidsLu ?? 1;

  const horsScoring = answerType !== undefined && TYPES_HORS_SCORING.some((t) => t === answerType);
  if (horsScoring && weight > 0) {
    erreurs.push(
      defaut(
        'poids',
        CODES_DEFAUT_IMPORT.POIDS_INTERDIT,
        `Le §32.1 impose « weight = 0 » sur ${TYPES_HORS_SCORING.join(', ')} : ces réponses alimentent ` +
          'les constats et le rapport, jamais le score.',
      ),
    );
  }

  // --- scoring (§32.1) -----------------------------------------------------
  const scoringBrut = cellule(brut, 'scoring');
  let scoring: ScoringQuestion | null = null;
  if (scoringBrut !== '') {
    let json: unknown;
    try {
      json = JSON.parse(scoringBrut);
    } catch (cause) {
      erreurs.push(
        defaut(
          'scoring',
          CODES_DEFAUT_IMPORT.SCORING_JSON_INVALIDE,
          `JSON illisible : ${cause instanceof Error ? cause.message : 'erreur de syntaxe'}.`,
        ),
      );
      json = undefined;
    }
    if (json !== undefined) {
      const lu = scoringQuestionSchema.safeParse(json);
      if (!lu.success) {
        erreurs.push(
          defaut(
            'scoring',
            CODES_DEFAUT_IMPORT.SCORING_JSON_INVALIDE,
            `Barème hors format §32.1 — ${messageZod(lu.error)}`,
          ),
        );
      } else {
        scoring = lu.data;
      }
    }
  }

  if (answerType !== undefined) {
    if (horsScoring && scoring !== null) {
      erreurs.push(
        defaut(
          'scoring',
          CODES_DEFAUT_IMPORT.SCORING_INTERDIT,
          `Un type « ${answerType} » ne porte pas de barème (§32.1 : weight = 0 obligatoire).`,
        ),
      );
    } else if (scoring !== null) {
      // La FORME est vérifiée quel que soit le poids : `red_flag` s'évalue sur la
      // criticité, PAS sur le poids (§32.1) — un barème d'une question à poids nul
      // n'est donc pas de la donnée morte, et il est figé dans le snapshot de mission.
      erreurs.push(...verifierBaremeSelonType(scoring, answerType, options));
      erreurs.push(...verifierDrapeauRouge(scoring, answerType, options));
    }

    // LE contrôle bloquant du §32.1 / §36.4 : « toute question weight > 0 sans
    // scoring valide est rejetée ». La PRÉSENCE du barème est ce que le poids
    // commande ; sa validité, elle, ne dépend d'aucune condition.
    if (weight > 0 && !horsScoring) {
      const baremeDansLesOptions = TYPES_A_OPTIONS.some((t) => t === answerType);
      if (scoring === null && scoringBrut === '') {
        // Le barème n'est signalé « manquant » que s'il est réellement ABSENT : un
        // barème présent mais illisible a déjà son erreur, et dire deux choses d'un
        // même défaut fait chercher deux corrections là où il n'y en a qu'une.
        erreurs.push(
          defaut(
            'scoring',
            CODES_DEFAUT_IMPORT.SCORING_MANQUANT,
            `Poids ${String(weight)} > 0 sans barème : la question compterait dans le score du bloc ` +
              'sans qu’on sache la coter (§32.1). Renseigner « scoring », ou poser poids = 0.',
          ),
        );
      } else if (scoring !== null && !porteUnBareme(scoring)) {
        erreurs.push(
          defaut(
            'scoring',
            CODES_DEFAUT_IMPORT.SCORING_MANQUANT,
            'Le barème ne contient qu’un drapeau rouge : il ne dit pas comment coter la réponse ' +
              `(poids ${String(weight)} > 0).`,
          ),
        );
      }
      if (baremeDansLesOptions && options !== null) {
        const sansScore = options.filter((o) => o.score === undefined || o.score === null);
        if (sansScore.length > 0) {
          erreurs.push(
            defaut(
              'options',
              CODES_DEFAUT_IMPORT.OPTION_SCORE_MANQUANT,
              `Poids > 0 et options sans score : ${sansScore
                .map((o) => `« ${o.code} »`)
                .join(', ')}. Le barème d’un choix vit dans options[].score (§32.1).`,
            ),
          );
        }
      }
    }

    // Avertissements — jamais bloquants : ils signalent une intention douteuse,
    // pas une donnée invalide.
    if (weight === 0 && scoring !== null && porteUnBareme(scoring)) {
      avertissements.push(
        defaut(
          'scoring',
          CODES_DEFAUT_IMPORT.BAREME_SANS_POIDS,
          'Barème renseigné sur une question à poids 0 : il ne servira jamais au score du bloc ' +
            '(seul un éventuel drapeau rouge sera évalué).',
        ),
      );
    }
  }

  // --- criticité -----------------------------------------------------------
  const criticaliteBrut = cellule(brut, 'criticality');
  const criticalite = CRITICITES.find((c) => c === criticaliteBrut);
  if (criticaliteBrut !== '' && criticalite === undefined) {
    erreurs.push(
      defaut(
        'criticality',
        CODES_DEFAUT_IMPORT.VALEUR_HORS_ENUM,
        `Criticité inconnue : « ${criticaliteBrut} ». Attendu : ${CRITICITES.join(', ')}.`,
      ),
    );
  }
  const criticality: Criticite = criticalite ?? 'important';

  if (scoring?.red_flag !== undefined && criticality !== 'bloquant') {
    avertissements.push(
      defaut(
        'scoring',
        CODES_DEFAUT_IMPORT.DRAPEAU_ROUGE_NON_EVALUE,
        `Drapeau rouge posé sur une question « ${criticality} » : il ne sera JAMAIS évalué ` +
          '(§32.1 — seules les questions « bloquant » déclenchent un drapeau).',
      ),
    );
  }

  // --- source attendue -----------------------------------------------------
  const sourceBrut = cellule(brut, 'expected_source');
  if (sourceBrut !== '' && !SOURCES_ATTENDUES.some((s) => s === sourceBrut)) {
    erreurs.push(
      defaut(
        'expected_source',
        CODES_DEFAUT_IMPORT.VALEUR_HORS_ENUM,
        `Source attendue inconnue : « ${sourceBrut} ». Attendu : ${SOURCES_ATTENDUES.join(', ')}.`,
      ),
    );
  }

  // --- étiquettes de ciblage ----------------------------------------------
  const verifierListe = (
    colonne: ColonneImportBanque,
    valeurs: string[],
    connus: ReadonlySet<string>,
    nomReferentiel: string,
  ): void => {
    for (const valeur of valeurs) {
      if (!connus.has(valeur)) {
        erreurs.push(
          defaut(
            colonne,
            CODES_DEFAUT_IMPORT.REFERENTIEL_INCONNU,
            `Code absent du référentiel ${nomReferentiel} : « ${valeur} ».`,
          ),
        );
      }
    }
  };

  const sectors = listeDeCodes(cellule(brut, 'secteurs'));
  verifierListe('secteurs', sectors, referentiels.secteurs, 'des secteurs');
  const targetServices = listeDeCodes(cellule(brut, 'services_cibles'));
  verifierListe('services_cibles', targetServices, referentiels.services, 'des 11 fonctions');
  const profiles = listeDeCodes(cellule(brut, 'profils'));
  verifierListe('profils', profiles, referentiels.profils, 'des profils d’interlocuteur');

  const levels = listeDeCodes(cellule(brut, 'niveaux'));
  for (const niveau of levels) {
    if (!NIVEAUX_AUDIT.some((n) => n === niveau)) {
      erreurs.push(
        defaut(
          'niveaux',
          CODES_DEFAUT_IMPORT.VALEUR_HORS_ENUM,
          `Niveau d’audit inconnu : « ${niveau} ». Attendu : ${NIVEAUX_AUDIT.join(', ')}.`,
        ),
      );
    }
  }

  // --- bornes d'effectif ---------------------------------------------------
  const minBrut = cellule(brut, 'effectif_min');
  const maxBrut = cellule(brut, 'effectif_max');
  const headcountMin = lireEntier(minBrut);
  const headcountMax = lireEntier(maxBrut);
  if (minBrut !== '' && headcountMin === null) {
    erreurs.push(
      defaut(
        'effectif_min',
        CODES_DEFAUT_IMPORT.VALEUR_NON_NUMERIQUE,
        `Effectif minimum non entier : « ${minBrut} ».`,
      ),
    );
  }
  if (maxBrut !== '' && headcountMax === null) {
    erreurs.push(
      defaut(
        'effectif_max',
        CODES_DEFAUT_IMPORT.VALEUR_NON_NUMERIQUE,
        `Effectif maximum non entier : « ${maxBrut} ».`,
      ),
    );
  }
  if (headcountMin !== null && headcountMax !== null && headcountMin > headcountMax) {
    erreurs.push(
      defaut(
        'effectif_max',
        CODES_DEFAUT_IMPORT.EFFECTIF_INCOHERENT,
        `Bornes d’effectif inversées : ${String(headcountMin)} > ${String(headcountMax)}. ` +
          'La question ne serait sélectionnée pour AUCUNE mission (M2, règle d’assemblage 1).',
      ),
    );
  }

  // --- périmètre géographique ---------------------------------------------
  const geoBrut = cellule(brut, 'geo');
  if (geoBrut !== '' && !PERIMETRES_GEO.some((g) => g === geoBrut)) {
    erreurs.push(
      defaut(
        'geo',
        CODES_DEFAUT_IMPORT.VALEUR_HORS_ENUM,
        `Périmètre inconnu : « ${geoBrut} ». Attendu : ${PERIMETRES_GEO.join(', ')}.`,
      ),
    );
  }
  const geo = geoBrut === '' ? 'tous' : geoBrut;

  // --- ANCRES DE COTATION (§32.4) — contrôle bloquant sur TOUTE échelle -----
  if (answerType === 'scale_1_5') {
    const { ancres, niveauxHorsEchelle, niveauxSansLibelle } = lireAncresDeCotation(guidanceFr);
    const niveauxVus = new Map<number, number>();
    for (const ancre of ancres) {
      niveauxVus.set(ancre.niveau, (niveauxVus.get(ancre.niveau) ?? 0) + 1);
    }

    if (ancres.length === 0) {
      erreurs.push(
        defaut(
          'guidance_fr',
          CODES_DEFAUT_IMPORT.ANCRES_ABSENTES,
          'Échelle 1-5 sans ancre de cotation. Le §32.4 en fait un critère d’ADMISSION en banque : ' +
            'sans ancres, deux auditeurs cotent deux choses différentes et la divergence mesurée ' +
            'devient du bruit. Attendu dans « guidance_fr » : ' +
            '« 1 = … · 3 = … · 5 = … ».',
        ),
      );
    } else {
      const manquants = ANCRES_REQUISES.filter((n) => !niveauxVus.has(n));
      if (manquants.length > 0) {
        erreurs.push(
          defaut(
            'guidance_fr',
            CODES_DEFAUT_IMPORT.ANCRES_INCOMPLETES,
            `Échelle partiellement ancrée : niveau(x) ${manquants.join(', ')} sans définition. ` +
              `Les ancres ${ANCRES_REQUISES.join(', ')} sont exigées (§32.4) ; 2 et 4 restent facultatifs.`,
          ),
        );
      }
      for (const [niveau, occurrences] of niveauxVus) {
        if (occurrences > 1) {
          erreurs.push(
            defaut(
              'guidance_fr',
              CODES_DEFAUT_IMPORT.ANCRE_DUPLIQUEE,
              `Le niveau ${String(niveau)} est ancré ${String(occurrences)} fois : deux définitions ` +
                'concurrentes pour la même note.',
            ),
          );
        }
      }
    }

    for (const niveau of niveauxSansLibelle) {
      erreurs.push(
        defaut(
          'guidance_fr',
          CODES_DEFAUT_IMPORT.ANCRE_VIDE,
          `Ancre du niveau ${String(niveau)} annoncée mais sans définition.`,
        ),
      );
    }
    for (const niveau of niveauxHorsEchelle) {
      avertissements.push(
        defaut(
          'guidance_fr',
          CODES_DEFAUT_IMPORT.ANCRES_INCOMPLETES,
          `Ancre lue sur le niveau ${String(niveau)}, hors de l’échelle 1-5 : elle sera ignorée.`,
        ),
      );
    }
  } else if (guidanceFr !== null) {
    const { ancres } = lireAncresDeCotation(guidanceFr);
    if (ancres.length >= ANCRES_REQUISES.length) {
      avertissements.push(
        defaut(
          'guidance_fr',
          CODES_DEFAUT_IMPORT.ANCRES_SUR_TYPE_NON_ECHELLE,
          `Des ancres de cotation sont écrites sur un type « ${answerType ?? '?'} » : ` +
            'vérifier que le type de réponse est bien celui voulu.',
        ),
      );
    }
  }

  if (erreurs.length > 0 || answerType === undefined) {
    return { question: null, erreurs, avertissements };
  }

  return {
    question: {
      code,
      blocCode,
      textFr,
      guidanceFr,
      answerType,
      options,
      allowRange,
      weight,
      scoring,
      criticality,
      expectedSource: sourceBrut === '' ? null : sourceBrut,
      sectors,
      targetServices,
      levels,
      headcountMin,
      headcountMax,
      profiles,
      geo,
    },
    erreurs,
    avertissements,
  };
}

/**
 * Empreinte canonique du CONTENU d'une question — sert à décider, au ré-import,
 * si une question a réellement changé (nouvelle version, 04 : « une NOUVELLE VERSION
 * = une NOUVELLE LIGNE ») ou si le fichier est simplement rejoué à l'identique.
 * L'ordre des clés est fixé ici, jamais laissé à `JSON.stringify` d'un objet
 * construit ailleurs : une empreinte qui dépend de l'ordre d'écriture n'en est pas une.
 */
export function empreinteQuestion(question: QuestionImportee): string {
  return JSON.stringify([
    question.blocCode,
    question.textFr,
    question.guidanceFr,
    question.answerType,
    question.options,
    question.allowRange,
    question.weight,
    question.scoring === null ? null : ordonnerProfond(question.scoring),
    question.criticality,
    question.expectedSource,
    [...question.sectors].sort(),
    [...question.targetServices].sort(),
    [...question.levels].sort(),
    question.headcountMin,
    question.headcountMax,
    [...question.profiles].sort(),
    question.geo,
  ]);
}

/** Trie récursivement les clés d'un objet JSON pour rendre son sérialisé stable. */
function ordonnerProfond(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(ordonnerProfond);
  if (valeur !== null && typeof valeur === 'object') {
    const entrees = Object.entries(valeur as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return Object.fromEntries(entrees.map(([cle, v]) => [cle, ordonnerProfond(v)]));
  }
  return valeur;
}
