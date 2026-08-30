// =============================================================================
// TESTS — BOUTON (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// CE QUE CES TESTS ÉPROUVENT, ET POURQUOI CE NE SONT PAS DES TESTS DE STYLE.
// L'interrogation se fait par RÔLE et par NOM ACCESSIBLE, jamais par classe CSS.
// Une classe prouve qu'un attribut a été écrit ; un rôle et un nom prouvent ce
// qu'un utilisateur — au doigt, au clavier ou au lecteur d'écran — perçoit. Les
// exigences visées ici sont §33.6 (« libellés explicites sur toute icône seule »),
// §33.2 (« jamais de spinner plein écran » — le rotor reste EN LIGNE, dans le
// bouton) et le défaut que l'en-tête du composant nomme lui-même : un bouton qui
// soumettrait le formulaire d'entretien par le défaut HTML `type="submit"`.
// Traçabilité : E27 (design moderne, WCAG AA), E44 (UX/UI 2026-2027).
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormEvent } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Bouton } from './Bouton.js';
import { IconeCroix } from './icones.js';

afterEach(() => {
  cleanup();
});

describe('Bouton — ce qu’un utilisateur perçoit', () => {
  it('expose son libellé français comme NOM ACCESSIBLE du rôle « button »', () => {
    render(<Bouton>Enregistrer la réponse</Bouton>);
    expect(screen.getByRole('button', { name: 'Enregistrer la réponse' })).not.toBeNull();
  });

  it('ne soumet JAMAIS le formulaire par défaut (le défaut HTML est `submit`)', () => {
    // Le défaut du composant est réputé `type="button"`. Ce test ne lit pas
    // l'attribut : il place le bouton dans un formulaire et vérifie qu'un clic
    // ne déclenche pas la soumission — c'est le défaut réel, celui qui ne se voit
    // qu'en entretien, et non la façon dont il est évité.
    const soumission = vi.fn((evenement: FormEvent) => {
      evenement.preventDefault();
    });
    render(
      <form onSubmit={soumission}>
        <Bouton>À revoir</Bouton>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'À revoir' }));
    expect(soumission).not.toHaveBeenCalled();
  });

  it('appelle son action au clic', () => {
    const action = vi.fn();
    render(<Bouton onClick={action}>Terminer l’entretien</Bouton>);
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’entretien' }));
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('Bouton — §33.6 : une icône seule porte TOUJOURS un libellé explicite', () => {
  it('donne un nom accessible en français à un bouton sans texte visible', () => {
    render(<Bouton iconeSeule libelleAccessible="Fermer" icone={<IconeCroix />} />);
    const bouton = screen.getByRole('button', { name: 'Fermer' });
    // Le nom ne peut venir QUE du libellé : l'icône est retirée de l'arbre
    // d'accessibilité. Sans cette vérification, un `<title>` dans le SVG pourrait
    // fournir le nom et le libellé obligatoire deviendrait décoratif.
    const icone = bouton.querySelector('svg');
    expect(icone).not.toBeNull();
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
  });

  it('n’expose PAS l’icône décorative d’un bouton qui a déjà un libellé visible', () => {
    render(<Bouton icone={<IconeCroix />}>Annuler</Bouton>);
    // Le nom accessible reste le mot, non « Annuler » précédé d'un bruit d'icône.
    expect(screen.getByRole('button', { name: 'Annuler' })).not.toBeNull();
  });
});

describe('Bouton — §33.2 : une action en cours se dit EN LIGNE, jamais en plein écran', () => {
  it('annonce `aria-busy`, se désactive et n’exécute plus son action', () => {
    const action = vi.fn();
    render(
      <Bouton chargement onClick={action}>
        Synchroniser
      </Bouton>,
    );
    const bouton = screen.getByRole('button', { name: 'Synchroniser' });
    expect(bouton.getAttribute('aria-busy')).toBe('true');
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(bouton);
    expect(action).not.toHaveBeenCalled();
  });

  it('garde son libellé lisible pendant l’attente (l’utilisateur sait ce qui charge)', () => {
    render(<Bouton chargement>Synchroniser</Bouton>);
    expect(screen.getByRole('button', { name: 'Synchroniser' })).not.toBeNull();
  });

  it('rend le rotor À L’INTÉRIEUR du bouton — aucun voile, aucun élément frère', () => {
    const { container } = render(<Bouton chargement>Synchroniser</Bouton>);
    const rotors = container.querySelectorAll('svg');
    expect(rotors.length).toBe(1);
    // « Jamais de spinner plein écran » se mesure ainsi : le seul élément animé
    // du rendu est un descendant du bouton, et rien d'autre n'a été monté.
    expect(rotors[0]?.closest('button')).toBe(screen.getByRole('button'));
    expect(container.childElementCount).toBe(1);
  });

  it('reste désactivé quand `disabled` est demandé sans chargement', () => {
    const action = vi.fn();
    render(
      <Bouton disabled onClick={action}>
        Valider l’entretien
      </Bouton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’entretien' }));
    expect(action).not.toHaveBeenCalled();
  });
});
