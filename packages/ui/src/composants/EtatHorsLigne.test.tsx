// =============================================================================
// TESTS — ÉTAT HORS LIGNE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.2 : « hors ligne : pastille discrète + RAPPEL DES CAPACITÉS LOCALES ».
// C'est le seul des quatre états qui n'annonce PAS un problème : l'invariant 1
// dit que l'app terrain fonctionne à 100 % sans réseau. Hors ligne est le mode
// NOMINAL. Deux exigences en découlent, et les deux sont testées :
//   · le RAPPEL DES CAPACITÉS est rendu — chaque capacité fournie apparaît, et
//     l'utilisateur lit ce qui MARCHE, pas ce qui manque ;
//   · le ton n'est PAS celui d'une alerte — `role="alert"` ferait de la situation
//     normale une panne, couperait la parole au lecteur d'écran (§17.3) et
//     contredirait l'invariant 1.
//
// DÉFAUT REMONTÉ, NON CORRIGÉ ICI (09 §5.6) : l'en-tête du composant affirme que
// « `capacites` est requis ET NON VIDE par contrat ». Le type ne dit que
// « requis » : `readonly string[]` accepte `[]`, et le rendu produit alors une
// liste sans aucune capacité — exactement l'écran dont l'en-tête dit qu'il
// « laisse l'auditeur croire qu'il doit attendre le réseau ». Le dernier test
// ci-dessous CONSTATE ce comportement sans l'approuver.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EtatHorsLigne } from './EtatHorsLigne.js';

afterEach(() => {
  cleanup();
});

const CAPACITES = [
  'Mener un entretien et coter les questions',
  'Prendre des notes et des photos',
  'Consulter le plan d’entretiens',
] as const;

describe('EtatHorsLigne — §33.2 : le rappel des CAPACITÉS LOCALES', () => {
  it('énumère chaque capacité fournie, une par entrée de liste', () => {
    render(<EtatHorsLigne capacites={CAPACITES} />);
    const entrees = screen.getAllByRole('listitem').map((e) => e.textContent);
    expect(entrees).toEqual([...CAPACITES]);
  });

  it('affirme que le travail est conservé sur l’appareil', () => {
    render(<EtatHorsLigne capacites={CAPACITES} />);
    expect(screen.getByRole('status').textContent).toContain(
      'Tout est enregistré sur cet appareil',
    );
  });

  it('porte un titre qui dit que le travail CONTINUE, pas qu’il s’arrête', () => {
    render(<EtatHorsLigne capacites={CAPACITES} />);
    expect(screen.getByText('Hors ligne — le travail continue')).not.toBeNull();
  });
});

describe('EtatHorsLigne — invariant 1 : le mode NOMINAL ne s’annonce pas comme une panne', () => {
  it('n’expose JAMAIS `role="alert"`', () => {
    render(<EtatHorsLigne capacites={CAPACITES} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).not.toBeNull();
  });

  it('retire l’icône de nuage barré de l’arbre d’accessibilité (§33.6)', () => {
    const { container } = render(<EtatHorsLigne capacites={CAPACITES} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('EtatHorsLigne — le compte d’éléments en attente RASSURE sans inquiéter', () => {
  it('ne parle pas d’attente quand l’écran ne fournit aucun compte', () => {
    render(<EtatHorsLigne capacites={CAPACITES} />);
    expect(screen.getByRole('status').textContent).not.toContain('en attente');
  });

  it('accorde le pluriel au-delà d’un élément', () => {
    render(<EtatHorsLigne capacites={CAPACITES} enAttente={12} />);
    expect(screen.getByRole('status').textContent).toContain('12 éléments en attente');
  });

  it('garde le singulier pour un seul élément', () => {
    render(<EtatHorsLigne capacites={CAPACITES} enAttente={1} />);
    const texte = screen.getByRole('status').textContent;
    expect(texte).toContain('1 élément en attente');
    expect(texte).not.toContain('1 éléments');
  });

  it('affiche « 0 élément » sans faute d’accord quand la file est vide', () => {
    render(<EtatHorsLigne capacites={CAPACITES} enAttente={0} />);
    expect(screen.getByRole('status').textContent).toContain('0 élément en attente');
  });
});

describe('EtatHorsLigne — la liste vide, telle qu’elle se comporte RÉELLEMENT', () => {
  it('rend un état hors ligne SANS aucune capacité quand on lui en passe zéro', () => {
    // CONSTAT, pas approbation. L'en-tête du composant promet un contrat « non
    // vide » que le type ne porte pas et que le rendu ne défend pas : l'écran
    // obtenu n'énumère rien, alors que le RAPPEL DES CAPACITÉS est précisément
    // ce que §33.2 exige de cet état. Remonté au chef de lot, non corrigé ici
    // (09 §5.6 : le testeur ne modifie pas le code qu'il éprouve).
    render(<EtatHorsLigne capacites={[]} />);
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });
});
