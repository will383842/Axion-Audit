// =============================================================================
// TESTS — ÉTAT VIDE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §17.6, repris par §33.2 : « chaque état vide DIT QUOI FAIRE ». Le composant
// impose `titre` ET `description` par son type ; le type ne peut pas garantir que
// la description nomme un GESTE, mais le rendu peut garantir qu'elle arrive à
// l'écran, à côté du bouton qui l'exécute. C'est ce couple — la phrase et
// l'action atteignable — qui distingue un état vide utile d'un « Aucun résultat »
// devant lequel un auditeur reste planté, en entretien, avec quelqu'un qui attend.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EtatVide } from './EtatVide.js';
import { Bouton } from './Bouton.js';
import { IconeNuage } from './icones.js';

afterEach(() => {
  cleanup();
});

describe('EtatVide — §17.6 : il dit ce qu’il n’y a pas ET ce qu’il faut faire', () => {
  it('affiche le titre ET la description', () => {
    render(
      <EtatVide
        titre="Aucun entretien"
        description="Créez le premier entretien ou consultez le plan d’entretiens."
      />,
    );
    expect(screen.getByText('Aucun entretien')).not.toBeNull();
    expect(
      screen.getByText('Créez le premier entretien ou consultez le plan d’entretiens.'),
    ).not.toBeNull();
  });

  it('rend l’action ANNONCÉE réellement atteignable et cliquable', () => {
    const action = vi.fn();
    render(
      <EtatVide
        titre="Aucun entretien"
        description="Créez le premier entretien."
        actions={<Bouton onClick={action}>Créer un entretien</Bouton>}
      />,
    );
    const bouton = screen.getByRole('button', { name: 'Créer un entretien' });
    fireEvent.click(bouton);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('reste complet SANS action : la phrase suffit à ne pas laisser l’écran muet', () => {
    render(
      <EtatVide titre="Aucune pièce jointe" description="Ajoutez une photo depuis l’appareil." />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Ajoutez une photo depuis l’appareil.')).not.toBeNull();
  });
});

describe('EtatVide — §33.6 : l’illustration ne parle pas à la place du texte', () => {
  it('retire l’icône par défaut de l’arbre d’accessibilité', () => {
    const { container } = render(<EtatVide titre="Aucun entretien" description="Créez-en un." />);
    const icone = container.querySelector('svg');
    expect(icone).not.toBeNull();
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
  });

  it('accepte une icône fournie par l’écran sans perdre le texte', () => {
    render(
      <EtatVide
        titre="Aucune donnée locale"
        description="Lancez une synchronisation."
        icone={<IconeNuage />}
      />,
    );
    expect(screen.getByText('Lancez une synchronisation.')).not.toBeNull();
  });

  it('n’annonce PAS une erreur : un écran vide n’est pas une panne', () => {
    // §33.2 sépare « vide » de « erreur ». Un `role="alert"` ici ferait d'une
    // liste normale une anomalie, et couperait la parole au lecteur d'écran.
    render(<EtatVide titre="Aucun entretien" description="Créez le premier entretien." />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
