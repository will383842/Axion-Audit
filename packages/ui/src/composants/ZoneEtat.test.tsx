// =============================================================================
// TESTS — ZONE D'ÉTAT (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// C'est le composant qui transforme la CONSIGNE §33.2 (« chaque écran et chaque
// liste livre ses QUATRE états ») en TYPE. Il n'a donc aucun rendu propre : ce
// qui s'éprouve ici est un AIGUILLAGE, et l'aiguillage se teste exhaustivement —
// les cinq natures, chacune donnant l'état attendu ET AUCUN AUTRE. Une union
// discriminée qui rendrait deux états à la fois, ou le contenu nominal pendant
// un chargement, laisserait passer des données à moitié chargées pour des
// données réelles.
//
// La table `EXCLUSIONS` ci-dessous est l'assertion qui compte : pour chaque
// nature, on vérifie ce qui est rendu ET ce qui ne l'est pas. Sans elle, cinq
// tests « l'état X s'affiche » resteraient verts sur un composant qui afficherait
// tout, tout le temps.
// Traçabilité : E27, E44.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ZoneEtat, type EtatZone } from './ZoneEtat.js';

afterEach(() => {
  cleanup();
});

const CONTENU_REEL = 'Question 12 sur 40';

function rendre(etat: EtatZone) {
  return render(<ZoneEtat etat={etat}>{CONTENU_REEL}</ZoneEtat>);
}

describe('ZoneEtat — nominal : le contenu réel, et rien d’autre', () => {
  it('rend les enfants tels quels', () => {
    rendre({ nature: 'nominal' });
    expect(screen.getByText(CONTENU_REEL)).not.toBeNull();
  });

  it('n’ajoute aucun habillage autour du contenu', () => {
    const { container } = rendre({ nature: 'nominal' });
    expect(container.textContent).toBe(CONTENU_REEL);
  });
});

describe('ZoneEtat — les quatre états de §33.2, chacun À LA PLACE du contenu', () => {
  it('chargement : un squelette annoncé, et le contenu réel RETIRÉ', () => {
    rendre({ nature: 'chargement', libelle: 'Chargement des questions' });
    expect(screen.getByRole('status').textContent).toContain('Chargement des questions');
    // Le point décisif : pendant l'attente, aucune donnée partielle à l'écran.
    expect(screen.queryByText(CONTENU_REEL)).toBeNull();
  });

  it('chargement : transmet la forme et le nombre de barres au squelette', () => {
    const { container } = rendre({ nature: 'chargement', forme: 'carte', lignes: 2 });
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(2);
  });

  it('vide : le titre, la phrase d’action, et pas le contenu', () => {
    rendre({
      nature: 'vide',
      titre: 'Aucune question dans ce bloc',
      description: 'Ajoutez une question hors parcours ou passez au bloc suivant.',
    });
    expect(screen.getByText('Aucune question dans ce bloc')).not.toBeNull();
    expect(
      screen.getByText('Ajoutez une question hors parcours ou passez au bloc suivant.'),
    ).not.toBeNull();
    expect(screen.queryByText(CONTENU_REEL)).toBeNull();
  });

  it('erreur : cause, action, détail replié — et le rôle d’alerte', () => {
    const { container } = rendre({
      nature: 'erreur',
      cause: 'Les questions n’ont pas pu être lues localement.',
      action: 'Relancez l’application, puis réessayez.',
      details: 'ERR_DEXIE_OPEN',
    });
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(screen.getByText('Les questions n’ont pas pu être lues localement.')).not.toBeNull();
    expect(screen.getByText('Relancez l’application, puis réessayez.')).not.toBeNull();
    expect(container.querySelector<HTMLDetailsElement>('details')?.open).toBe(false);
    expect(screen.queryByText(CONTENU_REEL)).toBeNull();
  });

  it('hors ligne : les capacités locales, sans rôle d’alerte (mode nominal)', () => {
    rendre({
      nature: 'hors-ligne',
      capacites: ['Coter les questions', 'Prendre des notes'],
      enAttente: 3,
    });
    expect(screen.getAllByRole('listitem').map((e) => e.textContent)).toEqual([
      'Coter les questions',
      'Prendre des notes',
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('3 éléments en attente');
    expect(screen.queryByText(CONTENU_REEL)).toBeNull();
  });
});

describe('ZoneEtat — un état EXCLUT les autres', () => {
  // Cinq natures, cinq rendus disjoints. Ce tableau est la contre-épreuve des
  // tests ci-dessus : il refuse le composant qui afficherait tout à la fois.
  const CAS: readonly (readonly [string, EtatZone, string])[] = [
    ['chargement', { nature: 'chargement' }, 'Chargement en cours'],
    [
      'vide',
      { nature: 'vide', titre: 'Aucun élément', description: 'Ajoutez le premier.' },
      'Aucun élément',
    ],
    ['erreur', { nature: 'erreur', cause: 'Cause.', action: 'Action.' }, 'Une erreur est survenue'],
    [
      'hors-ligne',
      { nature: 'hors-ligne', capacites: ['Coter les questions'] },
      'Hors ligne — le travail continue',
    ],
  ];

  it.each(CAS)('la nature « %s » rend son marqueur et aucun autre', (_nom, etat, marqueur) => {
    rendre(etat);
    expect(screen.getByText(marqueur)).not.toBeNull();
    for (const [, , autre] of CAS) {
      if (autre === marqueur) continue;
      expect(screen.queryByText(autre)).toBeNull();
    }
  });
});
