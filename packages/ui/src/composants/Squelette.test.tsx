// =============================================================================
// TESTS — SQUELETTE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.2, état de CHARGEMENT : « skeletons aux dimensions finales — JAMAIS de
// spinner plein écran ». Les deux moitiés sont éprouvées, et séparément :
//   · JAMAIS DE SPINNER — le rendu ne contient aucun élément animé isolé, aucun
//     voile, rien qui couvre la page. Un test qui ne regarderait que la présence
//     de barres laisserait passer un squelette POSÉ SUR un voile plein écran ;
//   · AUX DIMENSIONS FINALES — la forme est un CHOIX NOMMÉ (titre, ligne,
//     pastille, carte) et le nombre de barres suit le contenu attendu. On ne peut
//     pas mesurer un pixel sans feuille de style dans jsdom ; ce qui se mesure,
//     c'est que la forme demandée et le nombre demandé arrivent bien au rendu,
//     donc que l'appelant a les moyens de viser la bonne taille.
//
// Le troisième point est le plus important pour l'accessibilité : un lecteur
// d'écran doit entendre « chargement », pas une liste d'éléments vides — sans
// quoi l'écran est annoncé VIDE alors qu'il est EN ATTENTE, ce qui est un
// contresens (§33.2 distingue les deux états).
// Traçabilité : E27, E44.
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Squelette, type FormeSquelette } from './Squelette.js';

afterEach(() => {
  cleanup();
});

describe('Squelette — l’attente s’ANNONCE, elle ne se devine pas', () => {
  it('expose `role="status"` et `aria-busy`, avec un texte lu en français', () => {
    render(<Squelette />);
    const groupe = screen.getByRole('status');
    expect(groupe.getAttribute('aria-busy')).toBe('true');
    expect(groupe.textContent).toContain('Chargement en cours');
  });

  it('laisse l’appelant DIRE ce qui charge', () => {
    render(<Squelette libelle="Chargement des entretiens du jour" />);
    expect(screen.getByRole('status').textContent).toContain('Chargement des entretiens du jour');
  });

  it('n’annonce jamais un écran VIDE alors qu’il est en attente', () => {
    // Les barres sont `aria-hidden` : sans cela, le lecteur d'écran énumère des
    // éléments sans contenu et laisse croire qu'il n'y a rien à voir.
    const { container } = render(<Squelette lignes={4} />);
    const barres = container.querySelectorAll('[aria-hidden="true"]');
    expect(barres.length).toBe(4);
    // Le seul texte du groupe est le libellé d'attente.
    expect(screen.getByRole('status').textContent).toBe('Chargement en cours');
  });
});

describe('Squelette — §33.2 : jamais de spinner plein écran', () => {
  it('ne rend AUCUN élément graphique animé (pas de rotor, pas de voile)', () => {
    const { container } = render(<Squelette />);
    expect(container.querySelectorAll('svg').length).toBe(0);
    // Un seul nœud racine : le groupe. Rien n'est monté à côté qui pourrait
    // recouvrir l'écran.
    expect(container.childElementCount).toBe(1);
  });
});

describe('Squelette — « aux dimensions finales » : chaque forme a une HAUTEUR, et elle vient d’un jeton', () => {
  // jsdom ne calcule aucune mise en page : une hauteur ne se MESURE pas ici. Ce
  // qui se vérifie — et qui est la vraie exigence — c'est que chaque forme
  // DÉCLARE une hauteur, et qu'elle la prend dans l'échelle typographique du
  // design system plutôt que dans un pixel écrit à la main. Une forme sans
  // hauteur déclarée est un squelette de zéro pixel : l'écran sauterait à
  // l'arrivée des données, ce que §33.2 cherche précisément à éviter.
  const FORMES: readonly FormeSquelette[] = ['titre', 'ligne', 'pastille', 'carte'];
  const css = readFileSync(resolve(import.meta.dirname, '..', 'composants.css'), 'utf8');

  it.each(FORMES)('la forme « %s » déclare une hauteur prise dans les jetons', (forme) => {
    const bloc = new RegExp(`\\.axn-squelette--${forme}\\s*\\{([^}]*)\\}`).exec(css);
    expect(bloc, `la règle .axn-squelette--${forme} est absente de composants.css`).not.toBeNull();
    const hauteur = /height:\s*([^;]+);/.exec(bloc?.[1] ?? '');
    expect(hauteur, `la forme ${forme} ne déclare aucune hauteur`).not.toBeNull();
    expect(hauteur?.[1]?.trim()).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });

  it('rend exactement le nombre de barres demandé', () => {
    const { container } = render(<Squelette lignes={7} />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(7);
  });

  it('rend au moins une barre même si l’appelant en demande zéro ou moins', () => {
    // Un squelette invisible est un écran vide : il annoncerait « rien à voir »
    // au lieu de « en attente ».
    const { container } = render(<Squelette lignes={0} />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(1);
  });
});
