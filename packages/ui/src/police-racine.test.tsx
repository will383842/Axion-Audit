// =============================================================================
// TESTS — LA POLICE EST POSÉE À LA RACINE DU DOCUMENT
//
// ── LE DÉFAUT QUE CE FICHIER REND IMPOSSIBLE À RÉINTRODUIRE ──────────────────
// Recette novice A54 du 2026-09-06, reprise au contrôle A02 de P-C, critère 8 :
// « `getComputedStyle(document.documentElement).fontFamily` = "Times New Roman" —
// seule `.axn-coquille` pose la police ; latent aujourd'hui (aucun `createPortal`),
// VISIBLE AU PREMIER DIALOGUE RENDU HORS COQUILLE. »
//
// La règle qui ferme le défaut a été posée dans `tokens.css` (`:where(html, body)`).
// Elle n'avait AUCUN test : rien, dans la suite, ne rougissait si on la retirait.
// Une correction sans contre-champ n'est pas une correction, c'est un souvenir —
// et c'est exactement la famille de défaut que ce dépôt traque (cf. `polices.css` :
// « un garde-fou qui sait dire "il n'y a PAS de CDN" ne saura jamais dire "la
// police EST là" »).
//
// ── CE QUE CE FICHIER MESURE, ET CE QU'IL NE MESURE PAS ──────────────────────
// Il mesure la CASCADE : la feuille du design system, posée seule dans un
// document nu, donne-t-elle sa famille à `document.documentElement` et à un nœud
// greffé directement sur `document.body` — c'est-à-dire là où atterrit un portail.
// Il ne mesure PAS le rendu peint : jsdom ne résout pas `var()` et ne dessine
// aucun glyphe. Cette moitié-là est dans `e2e/polices.e2e.ts`, dans un vrai
// navigateur. Les deux sont nécessaires et aucune ne remplace l'autre.
//
// Le fichier est un `.tsx` parce que le DOM lui est indispensable : le projet
// `unit` tourne en `node` (voir `vitest.config.ts`), le projet `interface` en
// `jsdom`. Il ne rend aucun composant, et c'est voulu — la police de la RACINE
// ne doit dépendre d'aucun composant monté.
//
// Traçabilité : E44 (UX/UI 2026-2027, police locale), E27 (WCAG AA), E6 (hors ligne).
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TOKENS_TYPOGRAPHIE } from './tokens.js';

/**
 * `tokens.css`, prêt à être injecté dans un document :
 *   · commentaires retirés EN PREMIER — l'un d'eux contient le mot `@import`,
 *     et le nettoyer après aurait tronqué la feuille au milieu d'une phrase ;
 *   · directives `@import` retirées ensuite — `polices.css` charge deux `.woff2`
 *     que jsdom n'a ni à résoudre ni à peindre ; c'est le sujet de l'E2E.
 */
const FEUILLE = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*@import\b[^;]*;\s*$/gm, '');

/** La règle exacte que la recette A54 a fait poser. Retirée dans la contre-épreuve. */
const REGLE_RACINE = /:where\(html,\s*body\)\s*\{[^}]*\}/;

/** Les déclarations du bloc `:root`, pour résoudre les `var()` que jsdom laisse tels quels. */
const JETONS = new Map<string, string>();
for (const m of FEUILLE.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  if (!JETONS.has(m[1] ?? '')) JETONS.set(m[1] ?? '', (m[2] ?? '').trim());
}

/** Remplace `var(--x)` par la valeur déclarée. jsdom ne le fait pas ; un navigateur, si. */
function resoudre(valeur: string): string {
  return valeur.replace(/var\(\s*--([a-z0-9-]+)\s*\)/g, (_t, nom: string) => JETONS.get(nom) ?? _t);
}

const poses: HTMLStyleElement[] = [];

/** Pose une feuille dans le document courant et rend l'élément, pour le retirer après. */
function poser(css: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  poses.push(style);
  return style;
}

/** La famille CALCULÉE d'un élément, `var()` résolus — ce qu'un navigateur peindrait. */
function familleDe(element: Element): string {
  return resoudre(getComputedStyle(element).fontFamily).trim();
}

afterEach(() => {
  for (const style of poses.splice(0)) style.remove();
  document.body.replaceChildren();
});

const PROMISE = TOKENS_TYPOGRAPHIE['police-corps'];

describe('la racine du document porte la police du design system', () => {
  it('AVANT toute feuille, la racine n’a PAS la police promise (l’étalon de la mesure)', () => {
    // Sans cet étalon, les assertions suivantes seraient indiscernables d'un
    // environnement qui donnerait Inter à tout le monde par défaut.
    expect(familleDe(document.documentElement)).not.toBe(PROMISE);
  });

  it('`tokens.css` seul suffit à donner sa famille à `document.documentElement`', () => {
    poser(FEUILLE);
    expect(
      familleDe(document.documentElement),
      'la racine ne porte pas la police : le premier nœud rendu hors de la coquille ' +
        'terrain s’afficherait dans la police par défaut du navigateur (serif)',
    ).toBe(PROMISE);
  });

  it('un nœud greffé sur `document.body` — là où atterrit un PORTAIL — en hérite', () => {
    poser(FEUILLE);
    // Reproduit ce que fait `createPortal` : un élément monté hors de l'arbre de
    // l'application, donc hors de `.axn-coquille`. C'est le cas exact que la
    // recette A54 décrit comme latent.
    const horsCoquille = document.createElement('div');
    horsCoquille.textContent = 'Dialogue rendu hors coquille';
    document.body.append(horsCoquille);
    expect(familleDe(horsCoquille)).toBe(PROMISE);
  });

  it('CONTRE-ÉPREUVE : la règle retirée, la racine RETOMBE sur la police du navigateur', () => {
    // C'est la moitié qui donne son sens aux trois assertions ci-dessus. Sans
    // elle, elles pourraient être vertes pour une raison qui n'a rien à voir avec
    // la règle — et le jour où quelqu'un la supprime, personne ne le saurait.
    expect(REGLE_RACINE.test(FEUILLE), 'la règle de racine a disparu de tokens.css').toBe(true);
    poser(FEUILLE.replace(REGLE_RACINE, ''));
    const horsCoquille = document.createElement('div');
    document.body.append(horsCoquille);
    expect(familleDe(document.documentElement)).not.toBe(PROMISE);
    expect(familleDe(horsCoquille)).not.toBe(PROMISE);
  });
});

describe('la règle de racine respecte l’invariant 4 et ne peut rien écraser', () => {
  it('pose un JETON, jamais un nom de police écrit en dur', () => {
    const regle = REGLE_RACINE.exec(FEUILLE)?.[0] ?? '';
    expect(regle).toMatch(/font-family:\s*var\(--typo-police-corps\)/);
    expect(regle).not.toMatch(/Inter|system-ui|sans-serif/);
  });

  it('a une spécificité NULLE : `.axn-coquille` et toute règle d’écran l’emportent', () => {
    // `:where()` neutralise la spécificité. La correction ne peut donc pas casser
    // une mise en page existante — c'est ce qui la rend posable sans arbitrage.
    poser(FEUILLE);
    poser('.epreuve-de-specificite { font-family: "Police d’écran"; }');
    const element = document.createElement('div');
    element.className = 'epreuve-de-specificite';
    document.body.append(element);
    expect(familleDe(element)).toBe('"Police d’écran"');
  });
});
