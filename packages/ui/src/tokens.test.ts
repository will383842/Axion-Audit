// =============================================================================
// TESTS DES TOKENS — rendent MESURABLES l'invariant 4 et l'exigence E27 (WCAG AA).
// La DoD transverse dit « couverture MESURÉE, pas déclarée » : le même esprit
// s'applique au contraste. axe-core (A28) vérifie le rendu ; ces tests vérifient la
// SOURCE — un token qui ne peut pas passer AA ne doit jamais atteindre un écran.
//
// Règle 09 §5.6 : le code de test n'est pas écrit par l'agent qui a écrit le code
// testé. Ces tests sont écrits par A01 au titre du cadrage L0 ; A28 (accessibilité)
// les reprend et les étend au lot L5, quand les composants existent.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COULEURS_CHARTE,
  TOKENS_COULEUR,
  TOKENS_ESPACEMENT,
  TOKENS_TAILLE,
  TOKENS_TYPOGRAPHIE,
  TOKENS_MOUVEMENT,
  TOKENS_OMBRE,
  type TokenCouleur,
} from './tokens.js';

// --- Outillage colorimétrique (WCAG 2.1) ------------------------------------

function luminanceRelative(hex: string): number {
  const c = hex.replace('#', '');
  const canaux = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = canaux.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

function contraste(a: string, b: string): number {
  const la = luminanceRelative(a);
  const lb = luminanceRelative(b);
  const [haut, bas] = la > lb ? [la, lb] : [lb, la];
  return (haut + 0.05) / (bas + 0.05);
}

function teinte(hex: string): number {
  const c = hex.replace('#', '');
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

/** Plus petit écart angulaire entre deux teintes (le cercle chromatique boucle). */
function ecartTeinte(a: string, b: string): number {
  const d = Math.abs(teinte(a) - teinte(b)) % 360;
  return d > 180 ? 360 - d : d;
}

// --- La charte, telle qu'énoncée par l'invariant 4 ---------------------------

describe('invariant 4 — la charte est celle du 00_INDEX', () => {
  it('porte EXACTEMENT les quatre couleurs imposées par le pack', () => {
    // Ces valeurs sont citées littéralement par l'invariant 4. Si ce test casse,
    // c'est que quelqu'un a modifié la charte : cela relève d'une décision de
    // Williams (11 §8), pas d'un ajustement d'implémentation.
    expect(COULEURS_CHARTE.terracotta).toBe('#c24a1b');
    expect(COULEURS_CHARTE.ivoire).toBe('#faf8f3');
    expect(COULEURS_CHARTE.bleu).toBe('#1a4dd9');
    expect(COULEURS_CHARTE.mocha).toBe('#2a2520');
  });

  it("l'alerte est un rouge DISTINCT du terracotta, sur la teinte ET sur la luminance", () => {
    // Le pack dit « l'alerte est un rouge distinct » sans fixer de valeur.
    // « Distinct » n'est pas une impression : on le mesure sur les deux axes qui
    // permettent à un daltonien protanope de faire la différence.
    expect(COULEURS_CHARTE.alerte).not.toBe(COULEURS_CHARTE.terracotta);
    expect(ecartTeinte(COULEURS_CHARTE.alerte, COULEURS_CHARTE.terracotta)).toBeGreaterThanOrEqual(
      30,
    );
    expect(contraste(COULEURS_CHARTE.alerte, COULEURS_CHARTE.terracotta)).toBeGreaterThanOrEqual(
      1.8,
    );
  });
});

// --- Contraste AA (exigence E27, grille §33) ---------------------------------

/**
 * Paires « premier plan sur arrière-plan » réellement utilisées par l'interface.
 * Seuils WCAG 2.1 : 4.5 pour du texte courant, 3.0 pour un composant d'interface
 * ou une bordure porteuse de sens.
 */
const PAIRES_TEXTE: readonly (readonly [TokenCouleur, TokenCouleur])[] = [
  ['texte-principal', 'surface-fond'],
  ['texte-principal', 'surface-carte'],
  ['texte-secondaire', 'surface-fond'],
  ['texte-tertiaire', 'surface-fond'],
  ['texte-sur-action', 'action-fond'],
  ['texte-sur-action', 'action-fond-survol'],
  ['texte-sur-action', 'action-fond-actif'],
  ['texte-sur-inverse', 'surface-inverse'],
  ['action-texte', 'surface-fond'],
  ['info-texte', 'info-fond'],
  ['alerte-texte', 'alerte-fond'],
  ['succes-texte', 'succes-fond'],
  ['avertissement-texte', 'avertissement-fond'],
];

const PAIRES_INTERFACE: readonly (readonly [TokenCouleur, TokenCouleur])[] = [
  ['info-bordure', 'surface-fond'],
  ['alerte-bordure', 'surface-fond'],
  ['succes-bordure', 'surface-fond'],
  ['avertissement-bordure', 'surface-fond'],
  ['focus-anneau', 'surface-fond'],
  ['focus-anneau', 'surface-carte'],
];

describe('E27 — contraste WCAG AA sur toutes les paires utilisées', () => {
  it.each(PAIRES_TEXTE)('texte « %s » sur « %s » ≥ 4.5:1', (premierPlan, fond) => {
    const ratio = contraste(TOKENS_COULEUR[premierPlan], TOKENS_COULEUR[fond]);
    expect(
      ratio,
      `${premierPlan} (${TOKENS_COULEUR[premierPlan]}) sur ${fond} (${TOKENS_COULEUR[fond]}) = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PAIRES_INTERFACE)('composant « %s » sur « %s » ≥ 3:1', (premierPlan, fond) => {
    const ratio = contraste(TOKENS_COULEUR[premierPlan], TOKENS_COULEUR[fond]);
    expect(
      ratio,
      `${premierPlan} (${TOKENS_COULEUR[premierPlan]}) sur ${fond} (${TOKENS_COULEUR[fond]}) = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });
});

// --- Parité TypeScript ↔ CSS -------------------------------------------------

describe('un design system à deux vérités n’en est pas un', () => {
  const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');

  /** Extrait toutes les déclarations `--nom: valeur;` du bloc `:root`. */
  const declarations = new Map<string, string>();
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    // Les surcharges de media query (reduced-motion) réécrivent des noms déjà vus :
    // on garde la PREMIÈRE déclaration, celle de `:root`.
    if (!declarations.has(m[1] ?? '')) declarations.set(m[1] ?? '', (m[2] ?? '').trim());
  }

  it.each(Object.entries(TOKENS_COULEUR))(
    'la couleur « %s » a la même valeur en CSS qu’en TypeScript',
    (nom, valeur) => {
      expect(declarations.get(`couleur-${nom}`)).toBe(valeur);
    },
  );

  it.each(Object.entries(TOKENS_ESPACEMENT))(
    'l’espacement « %s » a la même valeur en CSS qu’en TypeScript',
    (nom, valeur) => {
      expect(declarations.get(`espacement-${nom}`)).toBe(valeur);
    },
  );

  it.each(Object.entries(TOKENS_TAILLE))(
    'la taille « %s » a la même valeur en CSS qu’en TypeScript',
    (nom, valeur) => {
      expect(declarations.get(`taille-${nom}`)).toBe(valeur);
    },
  );

  it.each(Object.entries(TOKENS_TYPOGRAPHIE))(
    'la typographie « %s » a la même valeur en CSS qu’en TypeScript',
    (nom, valeur) => {
      expect(declarations.get(`typo-${nom}`)).toBe(valeur);
    },
  );

  it.each(Object.entries(TOKENS_MOUVEMENT))(
    'le mouvement « %s » a la même valeur en CSS qu’en TypeScript',
    (nom, valeur) => {
      expect(declarations.get(`mouvement-${nom}`)).toBe(valeur);
    },
  );

  it.each(Object.entries(TOKENS_OMBRE))(
    'l’ombre « %s » a la même valeur en CSS qu’en TypeScript',
    (nom, valeur) => {
      expect(declarations.get(`ombre-${nom}`)).toBe(valeur);
    },
  );

  it('tient le plafond de DEUX niveaux d’ombre imposé par §33.1', () => {
    // « Ombres : 2 niveaux max (sm, md) — élévation discrète. » Le plafond est la
    // règle elle-même : une bibliothèque qui offre cinq élévations en voit
    // apparaître cinq à l'écran, et l'interface calme promise devient un relief.
    expect(Object.keys(TOKENS_OMBRE)).toEqual(['sm', 'md']);
  });

  it('ne déclare aucune variable CSS orpheline (présente en CSS, absente en TS)', () => {
    const attendus = new Set([
      ...Object.keys(TOKENS_COULEUR).map((n) => `couleur-${n}`),
      ...Object.keys(TOKENS_ESPACEMENT).map((n) => `espacement-${n}`),
      ...Object.keys(TOKENS_TAILLE).map((n) => `taille-${n}`),
      ...Object.keys(TOKENS_TYPOGRAPHIE).map((n) => `typo-${n}`),
      ...Object.keys(TOKENS_MOUVEMENT).map((n) => `mouvement-${n}`),
      ...Object.keys(TOKENS_OMBRE).map((n) => `ombre-${n}`),
    ]);
    const orphelines = [...declarations.keys()].filter((n) => !attendus.has(n));
    expect(orphelines).toEqual([]);
  });
});

// --- Contraintes d'usage terrain ---------------------------------------------

describe('contraintes d’usage terrain', () => {
  it('impose une cible tactile ≥ 44 px (A27 — la PWA se pilote au doigt, debout)', () => {
    expect(TOKENS_TAILLE['cible-tactile-min']).toBe('44px');
  });

  it('n’utilise AUCUN CDN de police (11 §1 — la police doit se rendre en mode avion)', () => {
    const pilesDePolices = [
      TOKENS_TYPOGRAPHIE['police-corps'],
      TOKENS_TYPOGRAPHIE['police-mono'],
    ].join(' ');
    expect(pilesDePolices).not.toMatch(/https?:|fonts\.googleapis|fonts\.gstatic|cdn\./);
  });

  it('remet les durées d’animation à zéro sous prefers-reduced-motion (§33)', () => {
    const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');
    const bloc = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(bloc, 'le bloc prefers-reduced-motion est absent').not.toBeNull();
    expect(bloc?.[1]).toMatch(/--mouvement-duree-rapide:\s*0ms/);
    expect(bloc?.[1]).toMatch(/--mouvement-duree-normale:\s*0ms/);
  });

  it('garde un anneau de focus visible (jamais `outline: none` sans remplacement)', () => {
    const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');
    expect(css).toMatch(/:focus-visible/);
    // L'épaisseur et le décalage sont eux aussi des tokens : l'invariant 4 dit
    // « aucune couleur OU TAILLE en dur », et cette règle vaut aussi pour le CSS
    // du design system dès lors que la valeur est réutilisable ailleurs.
    expect(css).toMatch(
      /outline:\s*var\(--taille-focus-epaisseur\) solid var\(--couleur-focus-anneau\)/,
    );
    expect(css).toMatch(/outline-offset:\s*var\(--taille-focus-decalage\)/);
  });
});
