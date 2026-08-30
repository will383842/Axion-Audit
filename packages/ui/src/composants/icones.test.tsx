// =============================================================================
// TESTS — ICÔNES (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// L'en-tête du fichier pose une règle SANS EXCEPTION : « TOUTES sont
// `aria-hidden` et `focusable="false"` ». C'est ce qui rend tenable §33.6
// (« aucune information portée par la couleur seule », « libellés explicites sur
// toute icône seule ») : puisqu'aucune icône de ce paquet n'entre dans l'arbre
// d'accessibilité, aucune ne peut devenir, par accident, le seul porteur d'une
// information. Une règle « sans exception » se teste sur l'INVENTAIRE ENTIER —
// un test qui n'en vérifierait que trois laisserait la quatrième trahir la règle.
//
// `focusable="false"` n'est pas redondant avec `aria-hidden` : sans lui, un SVG
// reçoit le focus au Tab sous Internet Explorer et les moteurs qui en héritent,
// et l'utilisateur au clavier traverse une suite d'arrêts muets.
//
// La COULEUR est le troisième point : `stroke="currentColor"`. Une icône hérite
// de la couleur du texte qu'elle accompagne, donc d'un jeton — invariant 4. Une
// couleur écrite dans le SVG serait une couleur en dur au sens le plus strict.
// Traçabilité : E27.
// =============================================================================
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  IconeAlerte,
  IconeCoche,
  IconeCorbeilleVide,
  IconeCroix,
  IconeInfo,
  IconeNuage,
  IconeNuageBarre,
  IconeOeil,
  IconeOeilBarre,
  IconeRotor,
  type ProprietesIcone,
} from './icones.js';

afterEach(() => {
  cleanup();
});

/** L'inventaire FERMÉ, tel que `composants/index.ts` l'exporte. */
const INVENTAIRE: readonly (readonly [string, ComponentType<ProprietesIcone>])[] = [
  ['IconeAlerte', IconeAlerte],
  ['IconeCoche', IconeCoche],
  ['IconeCorbeilleVide', IconeCorbeilleVide],
  ['IconeCroix', IconeCroix],
  ['IconeInfo', IconeInfo],
  ['IconeNuage', IconeNuage],
  ['IconeNuageBarre', IconeNuageBarre],
  ['IconeOeil', IconeOeil],
  ['IconeOeilBarre', IconeOeilBarre],
  ['IconeRotor', IconeRotor],
];

describe('icônes — la règle « sans exception », vérifiée sur l’inventaire entier', () => {
  it.each(INVENTAIRE)('%s est retirée de l’arbre d’accessibilité', (_nom, Icone) => {
    const { container } = render(<Icone />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each(INVENTAIRE)('%s ne reçoit jamais le focus au clavier', (_nom, Icone) => {
    const { container } = render(<Icone />);
    expect(container.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });

  it.each(INVENTAIRE)('%s hérite de la couleur du texte (invariant 4)', (_nom, Icone) => {
    const { container } = render(<Icone />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    // `fill="none"` : aucun aplat, donc aucune surface à colorer en dur.
    expect(svg?.getAttribute('fill')).toBe('none');
  });

  it.each(INVENTAIRE)('%s se dimensionne sur la taille du texte, pas en pixels', (_nom, Icone) => {
    // `1em` : l'icône suit l'échelle typographique du design system et grandit
    // avec la police système. Une largeur en pixels serait une taille en dur.
    const { container } = render(<Icone />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('1em');
    expect(svg?.getAttribute('height')).toBe('1em');
  });

  it.each(INVENTAIRE)('%s dessine réellement quelque chose', (_nom, Icone) => {
    // Contre-épreuve des tests ci-dessus : ils passeraient tous sur un SVG vide.
    const { container } = render(<Icone />);
    const svg = container.querySelector('svg');
    expect((svg?.childElementCount ?? 0) > 0).toBe(true);
  });

  it('n’écrit AUCUNE couleur littérale dans le balisage rendu', () => {
    for (const [nom, Icone] of INVENTAIRE) {
      const { container, unmount } = render(<Icone />);
      const balisage = container.innerHTML;
      expect(balisage, `${nom} contient une couleur littérale`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(balisage, `${nom} contient une fonction de couleur`).not.toMatch(
        /\b(?:rgba?|hsla?|oklch|lab)\(/i,
      );
      unmount();
    }
  });
});

describe('icônes — l’appelant habille sans casser la règle', () => {
  it('laisse passer une classe sans perdre `aria-hidden`', () => {
    const { container } = render(<IconeCoche className="axn-choix__marque" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('axn-choix__marque');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('donne au rotor sa classe d’animation par défaut', () => {
    const { container } = render(<IconeRotor />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBe('axn-rotor');
  });
});
