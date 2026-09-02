// =============================================================================
// LA VALEUR D'UNE RÉPONSE, TYPE PAR TYPE — les ONZE `TYPES_DE_REPONSE` + la
// fourchette (03 §27.4)
//
// `packages/shared/src/sync.ts` ne fixe que l'ENVELOPPE de `answers.value`
// (`{type, v}`, `{type:'money', v, currency}`, `{type:'range', low, high}`) et
// laisse `v` en `unknown`, en le disant : « le typage exhaustif des ONZE types
// est le périmètre de L5b ; L5b resserre, il ne redéfinit pas ». C'est ce
// resserrement. Chaque forme ci-dessous EST assignable à `ValeurReponse` — le
// compilateur le vérifie à l'écriture (`ecriture-reponses.ts`), aucune assertion.
//
// ── LES FORMES, ET POURQUOI ─────────────────────────────────────────────────
//   yes_no          v: 'oui' | 'non'    — la clé du barème 04 §7.3 (`VALEURS_OUI_NON`) ;
//                                         « Sans objet » n'est PAS une valeur : c'est
//                                         le drapeau `notApplicable` (03 M3.1).
//   scale_1_5       v: 1 … 5            — entier ; les ancres §32.4 sont dans la guidance.
//   single_choice   v: code d'option    — `options_snapshot[].code`, jamais le libellé.
//   multi_choice    v: codes d'option[] — ordre de sélection conservé.
//   free_text       v: string
//   number          v: number
//   percent         v: number           — en points de pourcentage (« 35 » = 35 %).
//   duration        v: number ≥ 0       — dans l'UNITÉ que la question nomme (le
//                                         barème §32.1 compare un nombre nu).
//   money           v: number + currency (ISO 4217, défaut `EUR`, 03 §22.2).
//   date            v: 'AAAA-MM-JJ'     — une date CIVILE ; pas d'heure, pas de fuseau.
//   table           v: lignes[]         — 03 §33.3 V2.10 : « LISTE de lignes » ;
//                                         une ligne = { code de colonne → texte }.
//   range           low/high            — §27.4, admis sur number/percent/duration/
//                                         money quand `allow_range_snapshot` (04).
//
// Les nombres arrivent de l'écran en CHAÎNES (« 1 200 », « 1,5 ») : la
// conversion vit ici, à un seul endroit, et ne jette jamais silencieusement —
// une saisie illisible rend `null`, et l'écran le dit.
//
// ── LA GARDE À L'ÉCRITURE (DECISIONS.md 2026-09-02, [L5b]) ──────────────────
// Le typage ci-dessus est un contrat de COMPILATION ; `validerValeurPourQuestion`
// est la garde d'EXÉCUTION que `ecrireReponse` appelle avant d'écrire quoi que
// ce soit : forme (schéma), type de la VALEUR = type de la QUESTION, fourchette
// admise par la question figée, bornes cohérentes, code d'option connu. Une
// saisie refusée lève en français et n'écrit rien — la valeur valide déjà en
// base reste intacte (invariant 7). La PWA est la seule à connaître la question
// au moment de la saisie : valider au push, c'est découvrir hors ligne, des
// heures plus tard, qu'une cotation n'existait pas.
//
// Traçabilité : E13 (écran 3 zones), E30 (informations non communiquées et
// fourchettes, §27.4).
// =============================================================================
import { z } from 'zod';
import {
  optionsQuestionSchema,
  TYPES_NUMERIQUES,
  VALEURS_OUI_NON,
  type OptionQuestion,
  type TypeDeReponse,
} from '@axion/shared';
import type { ValeurReponse } from '../local/contrat-sync.js';
import type { QuestionLocale } from '../local/depots/questions.js';

// ─────────────────────────────────────────────────────────────────────────────
// LES FORMES
// ─────────────────────────────────────────────────────────────────────────────
export const NOTE_MIN = 1;
export const NOTE_MAX = 5;

/** ISO 4217 : trois lettres majuscules. `EUR` par défaut (03 §22.2). */
export const DEVISE_PAR_DEFAUT = 'EUR';
const deviseSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Une devise s’écrit sur trois lettres majuscules (EUR, USD, CHF…).');

/** Une date civile, sans heure : ce que rend un `<input type="date">`. */
const dateCivileSchema = z.iso.date();

/** Une ligne d'un type `table` : code de colonne → texte saisi. */
export const ligneTableauSchema = z.record(z.string(), z.string());
export type LigneTableau = z.infer<typeof ligneTableauSchema>;

export const valeurTypeeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('yes_no'), v: z.enum(VALEURS_OUI_NON) }),
  z.object({ type: z.literal('scale_1_5'), v: z.number().int().min(NOTE_MIN).max(NOTE_MAX) }),
  z.object({ type: z.literal('single_choice'), v: z.string().min(1) }),
  z.object({ type: z.literal('multi_choice'), v: z.array(z.string().min(1)) }),
  z.object({ type: z.literal('free_text'), v: z.string() }),
  z.object({ type: z.literal('number'), v: z.number() }),
  z.object({ type: z.literal('percent'), v: z.number() }),
  z.object({ type: z.literal('duration'), v: z.number().nonnegative() }),
  z.object({ type: z.literal('money'), v: z.number(), currency: deviseSchema }),
  z.object({ type: z.literal('date'), v: dateCivileSchema }),
  z.object({ type: z.literal('table'), v: z.array(ligneTableauSchema) }),
  z.object({
    type: z.literal('range'),
    low: z.number().nullable(),
    high: z.number().nullable(),
    currency: deviseSchema.optional(),
  }),
]);
export type ValeurTypee = z.infer<typeof valeurTypeeSchema>;

/**
 * Preuve de compatibilité avec l'enveloppe partagée : si `ValeurTypee` cessait
 * d'être un `ValeurReponse`, cette ligne ne compilerait plus. Aucune assertion
 * ailleurs — c'est ici que la garantie vit.
 */
const _compatible: (v: ValeurTypee) => ValeurReponse = (v) => v;
void _compatible;

/**
 * Lit une valeur stockée. `null` si elle est absente OU si sa forme n'est pas
 * l'une des douze ci-dessus — une valeur descendue du siège dans une forme
 * inconnue ne s'affiche pas, mais elle n'est PAS réécrite tant que l'auditeur
 * ne répond pas (invariant 7 : rien n'est écrasé en silence).
 */
export function lireValeurTypee(value: ValeurReponse | null | undefined): ValeurTypee | null {
  if (value === null || value === undefined) return null;
  const lecture = valeurTypeeSchema.safeParse(value);
  return lecture.success ? lecture.data : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FOURCHETTE — où elle est admise (03 §27.4, 04 `allow_range_snapshot`)
// ─────────────────────────────────────────────────────────────────────────────
export function estTypeNumerique(type: TypeDeReponse): type is (typeof TYPES_NUMERIQUES)[number] {
  return (TYPES_NUMERIQUES as readonly string[]).includes(type);
}

/** La fourchette est proposée quand le type s'y prête ET que la question l'autorise. */
export function fourchetteAdmise(type: TypeDeReponse, allowRangeSnapshot: boolean): boolean {
  return allowRangeSnapshot && estTypeNumerique(type);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSIONS SAISIE ↔ NOMBRE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * « 1 200 », « 1,5 », « 1.5 », «  42  » → nombre ; vide ou illisible → `null`.
 * L'espace insécable (clavier iPad, copier-coller depuis un tableur) est retiré
 * comme l'espace ordinaire.
 */
export function nombreDepuisSaisie(texte: string): number | null {
  const nettoye = texte.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
  if (nettoye === '') return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(nettoye)) return null;
  const nombre = Number(nettoye);
  return Number.isFinite(nombre) ? nombre : null;
}

/** L'inverse, pour pré-remplir un champ : un nombre en chaîne « française » (virgule). */
export function saisieDepuisNombre(nombre: number | null | undefined): string {
  if (nombre === null || nombre === undefined) return '';
  return String(nombre).replace('.', ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONS ET COLONNES — lecture tolérante de `options_snapshot`
// ─────────────────────────────────────────────────────────────────────────────
/** Les options d'une question à choix. Vide si le snapshot n'en porte pas de lisibles. */
export function optionsDeQuestion(optionsSnapshot: unknown): readonly OptionQuestion[] {
  const lecture = optionsQuestionSchema.safeParse(optionsSnapshot);
  return lecture.success ? lecture.data : [];
}

/** La colonne unique d'un `table` sans colonnes déclarées. */
export const COLONNE_PAR_DEFAUT: OptionQuestion = { code: 'valeur', label: 'Valeur' };

/**
 * Les colonnes d'un type `table` : les options de la question, si elle en
 * déclare (c'est la seule structure que le snapshot offre), sinon une colonne
 * unique. Le relevé riche (colonnes typées) reste Phase 2 (03 §27.6).
 */
export function colonnesDeTableau(optionsSnapshot: unknown): readonly OptionQuestion[] {
  const options = optionsDeQuestion(optionsSnapshot);
  return options.length > 0 ? options : [COLONNE_PAR_DEFAUT];
}

// ─────────────────────────────────────────────────────────────────────────────
// LIBELLÉS — pour la question ad hoc, qui laisse l'auditeur choisir le type
// ─────────────────────────────────────────────────────────────────────────────
export const LIBELLE_TYPE_DE_REPONSE: Readonly<Record<TypeDeReponse, string>> = {
  yes_no: 'Oui / Non',
  scale_1_5: 'Échelle de 1 à 5',
  single_choice: 'Choix unique',
  multi_choice: 'Choix multiples',
  free_text: 'Texte libre',
  number: 'Nombre',
  percent: 'Pourcentage',
  duration: 'Durée',
  money: 'Montant',
  date: 'Date',
  table: 'Liste de lignes',
};

/** Décrit une valeur en une ligne — la synthèse d'une réponse en zone gauche. */
export function resumerValeur(
  valeur: ValeurTypee | null,
  options: readonly OptionQuestion[] = [],
): string {
  if (valeur === null) return '';
  const libelle = (code: string): string =>
    options.find((option) => option.code === code)?.label ?? code;
  switch (valeur.type) {
    case 'yes_no':
      return valeur.v === 'oui' ? 'Oui' : 'Non';
    case 'scale_1_5':
      return `${String(valeur.v)} / ${String(NOTE_MAX)}`;
    case 'single_choice':
      return libelle(valeur.v);
    case 'multi_choice':
      return valeur.v.map(libelle).join(', ');
    case 'free_text':
      return valeur.v;
    case 'number':
    case 'duration':
      return saisieDepuisNombre(valeur.v);
    case 'percent':
      return `${saisieDepuisNombre(valeur.v)} %`;
    case 'money':
      return `${saisieDepuisNombre(valeur.v)} ${valeur.currency}`;
    case 'date':
      return valeur.v;
    case 'table':
      return `${String(valeur.v.length)} ligne(s)`;
    case 'range': {
      const bas = valeur.low === null ? '?' : saisieDepuisNombre(valeur.low);
      const haut = valeur.high === null ? '?' : saisieDepuisNombre(valeur.high);
      return `entre ${bas} et ${haut}${valeur.currency === undefined ? '' : ` ${valeur.currency}`}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LA GARDE À L'ÉCRITURE — ce que `valeurTypeeSchema` seul ne sait pas
// ─────────────────────────────────────────────────────────────────────────────
/** Ce que la garde lit de la question figée. */
export type QuestionPourValidation = Pick<
  QuestionLocale,
  'answerType' | 'allowRangeSnapshot' | 'optionsSnapshot'
>;

/** Une saisie que la question figée n'admet pas. Le message est prêt à afficher. */
export class ValeurRefusee extends Error {
  override readonly name = 'ValeurRefusee';
}

/**
 * 03 §22.2, 04 : sur une question `money`, un montant ou une fourchette saisis
 * SANS devise reçoivent `EUR` — avant la lecture, pour que le schéma (qui exige
 * la devise sur un montant) voie la forme complète.
 */
function poserDeviseParDefaut(question: QuestionPourValidation, value: unknown): unknown {
  if (question.answerType !== 'money' || typeof value !== 'object' || value === null) return value;
  const brut: Record<string, unknown> = { ...value };
  if ((brut.type === 'money' || brut.type === 'range') && brut.currency === undefined) {
    return { ...brut, currency: DEVISE_PAR_DEFAUT };
  }
  return value;
}

function codesInconnus(
  codes: readonly string[],
  options: readonly OptionQuestion[],
): readonly string[] {
  const connus = new Set(options.map((option) => option.code));
  return codes.filter((code) => !connus.has(code));
}

/**
 * Valide une valeur CONTRE SA QUESTION et rend la forme à écrire (la devise
 * par défaut posée sur une fourchette `money` qui n'en porte pas). Lève
 * `ValeurRefusee` sinon — et alors rien ne doit être écrit.
 */
export function validerValeurPourQuestion(
  question: QuestionPourValidation,
  value: unknown,
): ValeurTypee {
  const lecture = valeurTypeeSchema.safeParse(poserDeviseParDefaut(question, value));
  if (!lecture.success) {
    throw new ValeurRefusee(
      `Cette saisie n’a pas la forme attendue pour une réponse « ${LIBELLE_TYPE_DE_REPONSE[question.answerType]} » ; elle n’a pas été enregistrée.`,
    );
  }
  const valeur = lecture.data;

  if (valeur.type === 'range') {
    if (!fourchetteAdmise(question.answerType, question.allowRangeSnapshot)) {
      throw new ValeurRefusee(
        'Cette question n’admet pas de réponse en fourchette : saisissez une valeur exacte, ou marquez-la non communiquée.',
      );
    }
    if (valeur.low === null && valeur.high === null) {
      throw new ValeurRefusee('Une fourchette sans aucune borne n’est pas une réponse.');
    }
    if (valeur.low !== null && valeur.high !== null && valeur.low > valeur.high) {
      throw new ValeurRefusee('La borne basse doit être inférieure à la borne haute.');
    }
    if (question.answerType !== 'money' && valeur.currency !== undefined) {
      throw new ValeurRefusee('Seul un montant porte une devise.');
    }
    return valeur;
  }

  if (valeur.type !== question.answerType) {
    throw new ValeurRefusee(
      `Cette question attend une réponse « ${LIBELLE_TYPE_DE_REPONSE[question.answerType]} », pas « ${LIBELLE_TYPE_DE_REPONSE[valeur.type]} ».`,
    );
  }

  if (valeur.type === 'single_choice' || valeur.type === 'multi_choice') {
    const codes = valeur.type === 'single_choice' ? [valeur.v] : valeur.v;
    const inconnus = codesInconnus(codes, optionsDeQuestion(question.optionsSnapshot));
    if (inconnus.length > 0) {
      throw new ValeurRefusee(
        `Le choix « ${inconnus.join(', ')} » ne fait pas partie des options de cette question.`,
      );
    }
  }

  return valeur;
}
