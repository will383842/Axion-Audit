// =============================================================================
// TESTS — PASTILLE DE SYNCHRONISATION (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §19.2 : « état réseau/sync TOUJOURS VISIBLE mais DISCRET (pastille, JAMAIS de
// bannière anxiogène) ». Les deux moitiés sont des exigences distinctes :
//   · TOUJOURS VISIBLE — chaque état rend un MOT en français. C'est §33.6 :
//     l'état de sync est exactement celui qu'on serait tenté de réduire à une
//     pastille verte ou rouge, et une pastille de couleur seule n'existe ni en
//     photocopie, ni pour un daltonien, ni pour un lecteur d'écran ;
//   · JAMAIS ANXIOGÈNE — aucun état ne prend `role="alert"`, pas même `echec`.
//     §17.3 interdit toute notification intrusive EN ENTRETIEN, et l'invariant 1
//     fait de « hors ligne » un mode NOMINAL, pas une panne.
// Traçabilité : E27, E44.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PastilleSync, type EtatSync } from './PastilleSync.js';

afterEach(() => {
  cleanup();
});

const ETATS: readonly (readonly [EtatSync, string])[] = [
  ['synchronise', 'Synchronisé'],
  ['en-cours', 'Synchronisation…'],
  ['en-attente', 'En attente de synchronisation'],
  ['hors-ligne', 'Hors ligne'],
  ['echec', 'Synchronisation en échec'],
];

describe('PastilleSync — §33.6 : chaque état porte un MOT, jamais la couleur seule', () => {
  it.each(ETATS)('l’état « %s » écrit « %s » en toutes lettres', (etat, mot) => {
    render(<PastilleSync etat={etat} />);
    expect(screen.getByRole('status').textContent).toContain(mot);
  });

  it.each(ETATS)('l’état « %s » retire son icône de l’arbre d’accessibilité', (etat) => {
    const { container } = render(<PastilleSync etat={etat} />);
    const icone = container.querySelector('svg');
    expect(icone).not.toBeNull();
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
  });

  it('donne cinq libellés DISTINCTS — deux états ne se lisent jamais pareil', () => {
    const lus = ETATS.map(([etat]) => {
      const { container, unmount } = render(<PastilleSync etat={etat} />);
      const texte = container.textContent;
      unmount();
      return texte;
    });
    expect(new Set(lus).size).toBe(ETATS.length);
  });
});

describe('PastilleSync — §17.3 : discrète, jamais anxiogène', () => {
  it.each(ETATS)('l’état « %s » n’interrompt PAS le lecteur d’écran', (etat) => {
    render(<PastilleSync etat={etat} />);
    // Même l'échec : il appelle un geste, pas une coupure de parole en entretien.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });
});

describe('PastilleSync — le compte en attente et la dernière synchronisation', () => {
  it('n’affiche aucun compte quand il n’y a rien en attente', () => {
    render(<PastilleSync etat="synchronise" enAttente={0} />);
    expect(screen.getByRole('status').textContent).not.toContain('en attente');
  });

  it('n’affiche aucun compte quand l’écran n’en fournit pas', () => {
    render(<PastilleSync etat="synchronise" />);
    expect(screen.getByRole('status').textContent).not.toContain('en attente');
  });

  it('affiche le compte dès qu’il dépasse zéro', () => {
    render(<PastilleSync etat="en-attente" enAttente={7} />);
    expect(screen.getByRole('status').textContent).toContain('7 en attente');
  });

  it('affiche l’horodatage TEL QU’IL ARRIVE, sans le reformater', () => {
    // Le fuseau d'affichage est celui de la MISSION (§22.2, invariant 5) : ce
    // composant n'a pas cette donnée et ne doit pas aller la chercher.
    render(<PastilleSync etat="synchronise" derniereSync="aujourd’hui à 14h32" />);
    expect(screen.getByRole('status').textContent).toContain('aujourd’hui à 14h32');
  });

  it('n’invente aucun horodatage quand l’écran n’en donne pas', () => {
    render(<PastilleSync etat="synchronise" />);
    expect(screen.getByRole('status').textContent).toBe('Synchronisé');
  });
});
