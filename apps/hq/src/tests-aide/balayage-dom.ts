// =============================================================================
// BALAYAGES DU DOM RENDU — lot L7a, écrit par A36. Un MOTEUR : il rapporte, les
// `expect` vivent dans les tests.
//
// Quatre questions posées à un écran rendu sous jsdom :
//   1. porte-t-il une couleur ou une taille EN DUR (invariant 4) ? — attributs
//      `style`, attributs de présentation SVG, classes Tailwind à valeur arbitraire
//      (`text-[#c24a1b]`, `w-[12px]`), balises `<style>` injectées ;
//   2. chaque `var(--…)` qu'il consomme existe-t-elle dans `tokens.css` ? Un jeton
//      inventé (`--couleur-rouge-vif`) n'est pas « une couleur en dur » pour un
//      motif hexadécimal, mais c'est exactement la même faute : une valeur qui ne
//      vient pas de la charte ;
//   3. montre-t-il une SENTINELLE financière ou le NOM d'un champ financier ?
//      Cherché dans le HTML COMPLET (texte + attributs : un `data-montant`, un
//      `title`, un `aria-label` fuient aussi bien qu'un texte) ;
//   4. montre-t-il un CODE BRUT du contrat (`en_cours`, `diagnostic_cadrage`,
//      `INTERNAL_ERROR`) là où l'invariant 5 exige du français ?
//
// « Pixel par pixel » (09 §1) sous jsdom n'est pas une capture d'écran : c'est le
// DOM ET la trace réseau. Un élément masqué en CSS est PRÉSENT dans le DOM, donc
// vu par ces balayages ; c'est la propriété recherchée.
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E27 (design moderne, charte —
// couleurs par jetons), E44 (UX/UI 2026-2027 — tokens), E43 (exécutabilité autopilote).
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ERROR_CODES,
  NIVEAUX_AUDIT_MISSION,
  OFFRES_COMMERCIALES_MISSION,
  PERIMETRES_GEO_MISSION,
  STATUTS_MISSION,
} from '@axion/shared';

// Mêmes motifs que `packages/ui/src/composants/invariant-tokens.test.tsx` : un
// balayage de DOM et un balayage de sources qui divergeraient laisseraient passer
// entre eux ce que chacun croit couvert par l'autre.
const HEXADECIMAL = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
const FONCTION_COULEUR = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\s*\(/gi;
const LONGUEUR_ABSOLUE = /(?<![\w.-])(?!0(?![\d.]))\d+(?:\.\d+)?(?:px|pt|pc|in|cm|mm|Q)\b/g;
/** Classe Tailwind à valeur ARBITRAIRE : `text-[#c24a1b]`, `w-[12px]`, `h-[2rem]` est toléré. */
const CLASSE_ARBITRAIRE = /\[(?:#[0-9a-f]{3,8}|\d+(?:\.\d+)?(?:px|pt|pc|in|cm|mm|Q))\]/gi;
const JETON_CONSOMME = /var\(\s*(--[a-z0-9-]+)/gi;

const ATTRIBUTS_DE_PRESENTATION = [
  'fill',
  'stroke',
  'color',
  'bgcolor',
  'stroke-width',
  'font-size',
] as const;

export interface FauteDeStyle {
  readonly element: string;
  readonly attribut: string;
  readonly valeur: string;
}

function decrire(element: Element): string {
  const id = element.id === '' ? '' : `#${element.id}`;
  // `getAttribute` et non `className` : sur un élément SVG, `className` est un
  // `SVGAnimatedString`, pas une chaîne.
  const classe = element.getAttribute('class');
  const classes =
    classe === null || classe.trim() === '' ? '' : `.${classe.trim().split(/\s+/).join('.')}`;
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function fautes(texte: string, motif: RegExp): readonly string[] {
  return [...texte.matchAll(new RegExp(motif.source, motif.flags))].map((m) => m[0]);
}

/** Question 1 — couleurs et tailles en dur dans le DOM rendu. */
export function balayerStylesEnDur(racine: ParentNode): readonly FauteDeStyle[] {
  const resultat: FauteDeStyle[] = [];
  for (const element of racine.querySelectorAll('*')) {
    const style = element.getAttribute('style');
    if (style !== null) {
      for (const motif of [HEXADECIMAL, FONCTION_COULEUR, LONGUEUR_ABSOLUE]) {
        for (const valeur of fautes(style, motif)) {
          resultat.push({ element: decrire(element), attribut: 'style', valeur });
        }
      }
    }
    for (const attribut of ATTRIBUTS_DE_PRESENTATION) {
      const valeur = element.getAttribute(attribut);
      if (valeur === null) continue;
      // `currentColor`, `none`, `inherit` et un `var(--…)` sont les formes LÉGITIMES ;
      // tout le reste est une valeur posée à la main.
      if (/^(?:currentcolor|none|inherit|transparent|var\(--[a-z0-9-]+\))$/i.test(valeur.trim())) {
        continue;
      }
      if (/^\d+(?:\.\d+)?$/.test(valeur.trim())) continue; // unités de viewBox, sans dimension
      resultat.push({ element: decrire(element), attribut, valeur });
    }
    const classe = element.getAttribute('class');
    if (classe !== null) {
      for (const valeur of fautes(classe, CLASSE_ARBITRAIRE)) {
        resultat.push({ element: decrire(element), attribut: 'class', valeur });
      }
    }
    if (element.tagName.toLowerCase() === 'style') {
      const css = element.textContent;
      for (const motif of [HEXADECIMAL, FONCTION_COULEUR, LONGUEUR_ABSOLUE]) {
        for (const valeur of fautes(css, motif)) {
          resultat.push({ element: decrire(element), attribut: 'style-element', valeur });
        }
      }
    }
  }
  return resultat;
}

/** Les jetons DÉFINIS par la charte — lus dans `tokens.css`, jamais recopiés. */
export function jetonsDefinis(): ReadonlySet<string> {
  const chemin = resolve(import.meta.dirname, '../../../../packages/ui/src/tokens.css');
  const css = readFileSync(chemin, 'utf8');
  return new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1] ?? ''));
}

/** Question 2 — `var(--…)` consommées qui n'existent pas dans la charte. */
export function jetonsInconnus(
  racine: ParentNode,
  definis: ReadonlySet<string> = jetonsDefinis(),
): readonly string[] {
  const inconnus = new Set<string>();
  for (const element of racine.querySelectorAll('*')) {
    const style = element.getAttribute('style') ?? '';
    const css = element.tagName.toLowerCase() === 'style' ? element.textContent : '';
    for (const m of `${style}\n${css}`.matchAll(JETON_CONSOMME)) {
      const nom = (m[1] ?? '').toLowerCase();
      if (!definis.has(nom)) inconnus.add(nom);
    }
  }
  return [...inconnus].sort((a, b) => a.localeCompare(b));
}

/**
 * Question 3 — les sentinelles ou noms financiers présents dans le HTML COMPLET.
 * Les valeurs viennent de l'appelant (importées de la sentinelle L2, jamais
 * recopiées ici — la ceinture 3 balaie aussi ce fichier).
 */
export function chercherDansLeHtml(racine: Element, valeurs: readonly string[]): readonly string[] {
  const html = racine.outerHTML;
  const variantes = (valeur: string): readonly string[] => {
    const virgule = valeur.replace('.', ',');
    return virgule === valeur ? [valeur] : [valeur, virgule];
  };
  return valeurs.filter((valeur) => variantes(valeur).some((v) => html.includes(v)));
}

/**
 * Le texte VISIBLE D'EMBLÉE : tout, sauf le contenu d'un `<details>` fermé (le
 * « code technique replié » de §33.2 y a sa place, et SEULEMENT là) et sauf le
 * texte marqué `hidden` / `aria-hidden`.
 */
export function texteVisibleDEmblee(racine: Node): string {
  const morceaux: string[] = [];
  const parcourir = (noeud: Node): void => {
    if (noeud.nodeType === Node.TEXT_NODE) {
      morceaux.push(noeud.textContent ?? '');
      return;
    }
    if (!(noeud instanceof Element)) {
      for (const enfant of noeud.childNodes) parcourir(enfant);
      return;
    }
    const balise = noeud.tagName.toLowerCase();
    if (balise === 'script' || balise === 'style' || balise === 'template') return;
    if (noeud.hasAttribute('hidden') || noeud.getAttribute('aria-hidden') === 'true') return;
    if (balise === 'details' && !noeud.hasAttribute('open')) {
      const resume = noeud.querySelector(':scope > summary');
      if (resume !== null) parcourir(resume);
      return;
    }
    for (const enfant of noeud.childNodes) parcourir(enfant);
  };
  parcourir(racine);
  return morceaux.join(' ').replace(/\s+/g, ' ').trim();
}

/** Les codes bruts du contrat qu'un écran en français ne doit jamais AFFICHER. */
export const CODES_BRUTS_INTERDITS: readonly string[] = [
  ...STATUTS_MISSION,
  ...NIVEAUX_AUDIT_MISSION,
  ...OFFRES_COMMERCIALES_MISSION,
  ...PERIMETRES_GEO_MISSION,
  ...Object.values(ERROR_CODES),
];

/** Question 4 — codes bruts, `null`/`undefined`/`NaN`/`Invalid Date` visibles. */
export function codesBrutsVisibles(texte: string): readonly string[] {
  const trouves = CODES_BRUTS_INTERDITS.filter((code) =>
    new RegExp(`(?<![\\w-])${code}(?![\\w-])`).test(texte),
  );
  for (const scorie of ['null', 'undefined', 'NaN', 'Invalid Date', '[object Object]']) {
    if (new RegExp(`(?<![\\w-])${scorie.replace(/[[\]]/g, '\\$&')}(?![\\w-])`).test(texte)) {
      trouves.push(scorie);
    }
  }
  return trouves;
}

/**
 * La liste des motifs exportée pour les CONTRE-ÉPREUVES : chaque test qui s'appuie
 * sur un balayage doit d'abord prouver que le balayage mord sur une faute
 * fabriquée. Un garde-fou dont on n'a jamais vu la morsure ne prouve rien.
 */
export const MOTIFS = {
  HEXADECIMAL,
  FONCTION_COULEUR,
  LONGUEUR_ABSOLUE,
  CLASSE_ARBITRAIRE,
} as const;
