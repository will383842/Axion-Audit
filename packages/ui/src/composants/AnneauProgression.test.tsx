// =============================================================================
// TESTS — ANNEAU DE PROGRESSION (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.6 : « aucune information portée par la couleur seule ». Un arc de cercle
// n'est lisible ni par un lecteur d'écran, ni en photocopie, ni par un daltonien
// qui compare deux anneaux. Le chiffre doit donc exister DEUX FOIS : écrit au
// centre pour l'œil, et dans un nom accessible en français pour la machine.
//
// LE BORNAGE N'EST PAS UN DÉTAIL D'IMPLÉMENTATION. Une progression calculée à
// 104 % (arrondis de comptage) doit dessiner un anneau PLEIN, jamais un anneau
// qui repart en arrière ; et une valeur négative ne doit pas produire un arc
// inversé. Ces deux cas viennent de données réelles, pas de la théorie : ils
// naissent d'un dénominateur qui bouge pendant qu'on compte.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AnneauProgression } from './AnneauProgression.js';

afterEach(() => {
  cleanup();
});

describe('AnneauProgression — le chiffre existe pour l’œil ET pour la machine', () => {
  it('expose un rôle « img » nommé en français, avec le pourcentage', () => {
    render(<AnneauProgression valeur={42} libelle="Entretien" />);
    expect(screen.getByRole('img', { name: 'Entretien : 42 %' })).not.toBeNull();
  });

  it('écrit AUSSI le pourcentage au centre, en toutes lettres', () => {
    render(<AnneauProgression valeur={42} libelle="Entretien" />);
    expect(screen.getByText('42 %')).not.toBeNull();
  });

  it('écrit AUSSI ce que l’anneau mesure, à côté du chiffre', () => {
    render(<AnneauProgression valeur={42} libelle="Unité Logistique" />);
    expect(screen.getByText('Unité Logistique')).not.toBeNull();
  });

  it('laisse l’écran préciser un libellé plus parlant que le pourcentage', () => {
    render(
      <AnneauProgression
        valeur={30}
        libelle="Entretien"
        libelleAccessible="12 questions répondues sur 40"
      />,
    );
    expect(screen.getByRole('img', { name: '12 questions répondues sur 40' })).not.toBeNull();
    // Le chiffre reste écrit à l'écran : le libellé accessible ne l'efface pas.
    expect(screen.getByText('30 %')).not.toBeNull();
  });

  it('retire le dessin de l’arbre d’accessibilité (il n’est jamais le porteur)', () => {
    const { container } = render(<AnneauProgression valeur={42} libelle="Entretien" />);
    const dessin = container.querySelector('svg');
    expect(dessin).not.toBeNull();
    expect(dessin?.getAttribute('aria-hidden')).toBe('true');
    expect(dessin?.getAttribute('focusable')).toBe('false');
  });
});

describe('AnneauProgression — bornage : jamais d’anneau qui repart en arrière', () => {
  const CAS: readonly (readonly [number, string])[] = [
    [0, '0 %'],
    [50, '50 %'],
    [100, '100 %'],
    [104, '100 %'],
    [1000, '100 %'],
    [-12, '0 %'],
    [Number.NaN, '0 %'],
  ];

  it.each(CAS)('la valeur %s s’affiche « %s »', (valeur, attendu) => {
    render(<AnneauProgression valeur={valeur} libelle="Entretien" />);
    expect(screen.getByText(attendu)).not.toBeNull();
  });

  it('arrondit à l’entier plutôt que d’étaler des décimales', () => {
    render(<AnneauProgression valeur={42.6} libelle="Entretien" />);
    expect(screen.getByText('43 %')).not.toBeNull();
  });

  it('dit la MÊME chose à l’œil et au lecteur d’écran, même hors bornes', () => {
    // Le pire défaut possible ici serait un anneau plein annoncé « 104 % » :
    // deux vérités pour une seule donnée.
    render(<AnneauProgression valeur={104} libelle="Entretien" />);
    expect(screen.getByRole('img', { name: 'Entretien : 100 %' })).not.toBeNull();
    expect(screen.getByText('100 %')).not.toBeNull();
  });

  it('ferme l’arc à 100 % et le laisse ouvert à 0 %', () => {
    // La géométrie est en unités de `viewBox` : ce qui se vérifie sans mise en
    // page, c'est que le décalage du trait passe de la circonférence entière
    // (rien de tracé) à zéro (anneau complet).
    const { container: vide, unmount } = render(
      <AnneauProgression valeur={0} libelle="Entretien" />,
    );
    const decalageVide = Number(
      vide.querySelectorAll('circle')[1]?.getAttribute('stroke-dashoffset') ?? '-1',
    );
    unmount();
    const { container: plein } = render(<AnneauProgression valeur={100} libelle="Entretien" />);
    const decalagePlein = Number(
      plein.querySelectorAll('circle')[1]?.getAttribute('stroke-dashoffset') ?? '-1',
    );
    expect(decalageVide).toBeGreaterThan(0);
    expect(decalagePlein).toBe(0);
  });
});
