// =============================================================================
// TESTS — PANNEAU (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// Le panneau porte la « palette de saut » du §33.3 — la recherche de question
// HORS PARCOURS (§25.4), ouverte par la touche « / ». Deux différences de
// CONTRAT avec le Dialogue, et ce sont elles qu'il faut éprouver :
//   · un panneau de CONSULTATION se ferme au clic à côté PAR DÉFAUT (le
//     Dialogue, lui, refuse : il confirme un geste verrouillant) ;
//   · il se rend en bas par défaut — la seule zone qu'un pouce atteint sans
//     changer de prise.
// Le reste (nom, modalité, piège à focus) est le socle commun `useSuperposition`,
// vérifié ici aussi : deux composants partagent le code, pas la garantie.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Panneau } from './Panneau.js';
import { Bouton } from './Bouton.js';
import { ChampTexte } from './ChampTexte.js';

afterEach(() => {
  cleanup();
});

describe('Panneau — surface nommée, rendue seulement à l’ouverture', () => {
  it('ne rend rien tant qu’il est fermé', () => {
    render(<Panneau ouvert={false} titre="Rechercher une question" onFermer={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('porte son titre comme nom accessible et se déclare modal', () => {
    render(<Panneau ouvert titre="Rechercher une question" onFermer={vi.fn()} />);
    const panneau = screen.getByRole('dialog', { name: 'Rechercher une question' });
    expect(panneau.getAttribute('aria-modal')).toBe('true');
  });

  it('relie sa description quand il en a une, et l’omet sinon', () => {
    const { rerender } = render(
      <Panneau
        ouvert
        titre="Rechercher une question"
        description="Recherche locale, disponible hors ligne."
        onFermer={vi.fn()}
      />,
    );
    const identifiant = screen.getByRole('dialog').getAttribute('aria-describedby');
    expect(document.getElementById(identifiant ?? '')?.textContent).toBe(
      'Recherche locale, disponible hors ligne.',
    );

    rerender(<Panneau ouvert titre="Rechercher une question" onFermer={vi.fn()} />);
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(false);
  });

  it('rend son contenu et ses actions', () => {
    render(
      <Panneau
        ouvert
        titre="Rechercher une question"
        onFermer={vi.fn()}
        actions={<Bouton>Ajouter au parcours</Bouton>}
      >
        <ChampTexte libelle="Recherche" nature="recherche" />
      </Panneau>,
    );
    expect(screen.getByLabelText('Recherche')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ajouter au parcours' })).not.toBeNull();
  });
});

describe('Panneau — clavier : le focus entre, boucle, revient', () => {
  it('donne le focus au premier élément focalisable du panneau', () => {
    render(
      <Panneau ouvert titre="Rechercher une question" onFermer={vi.fn()}>
        <ChampTexte libelle="Recherche" nature="recherche" />
      </Panneau>,
    );
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('boucle la tabulation à l’intérieur du panneau', () => {
    render(
      <Panneau ouvert titre="Rechercher" onFermer={vi.fn()}>
        <ChampTexte libelle="Recherche" nature="recherche" />
      </Panneau>,
    );
    const fermer = screen.getByRole('button', { name: 'Fermer' });
    const champ = screen.getByLabelText('Recherche');
    champ.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(fermer);
  });

  it('ferme sur Échap', () => {
    const onFermer = vi.fn();
    render(<Panneau ouvert titre="Rechercher" onFermer={onFermer} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it('rend le focus à l’élément déclencheur à la fermeture', () => {
    const { rerender } = render(
      <>
        <button type="button">Ouvrir la recherche</button>
        <Panneau ouvert={false} titre="Rechercher" onFermer={vi.fn()} />
      </>,
    );
    const declencheur = screen.getByRole('button', { name: 'Ouvrir la recherche' });
    declencheur.focus();

    rerender(
      <>
        <button type="button">Ouvrir la recherche</button>
        <Panneau ouvert titre="Rechercher" onFermer={vi.fn()} />
      </>,
    );
    rerender(
      <>
        <button type="button">Ouvrir la recherche</button>
        <Panneau ouvert={false} titre="Rechercher" onFermer={vi.fn()} />
      </>,
    );
    expect(document.activeElement).toBe(declencheur);
  });
});

describe('Panneau — un panneau de CONSULTATION se ferme au clic à côté', () => {
  it('se ferme sur le voile PAR DÉFAUT (contrairement au Dialogue)', () => {
    const onFermer = vi.fn();
    render(<Panneau ouvert titre="Rechercher" onFermer={onFermer} />);
    const voile = screen.getByRole('dialog').parentElement;
    expect(voile).not.toBeNull();
    if (voile !== null) fireEvent.click(voile);
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it('respecte le refus explicite de fermeture extérieure', () => {
    const onFermer = vi.fn();
    render(<Panneau ouvert titre="Rechercher" onFermer={onFermer} fermetureExterieure={false} />);
    const voile = screen.getByRole('dialog').parentElement;
    if (voile !== null) fireEvent.click(voile);
    expect(onFermer).not.toHaveBeenCalled();
  });

  it('ne se ferme pas sur un clic parti de l’intérieur', () => {
    const onFermer = vi.fn();
    render(<Panneau ouvert titre="Rechercher" onFermer={onFermer} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onFermer).not.toHaveBeenCalled();
  });
});
