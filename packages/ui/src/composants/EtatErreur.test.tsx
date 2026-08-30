// =============================================================================
// TESTS — ÉTAT ERREUR (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.2 : « erreur : CAUSE + ACTION, français clair, CODE TECHNIQUE REPLIÉ ».
// §17.6 : « aucune erreur technique brute n'atteint l'écran ».
//
// « REPLIÉ » est la partie qu'on croit tenue et qui ne l'est presque jamais. Elle
// se teste précisément : le code technique doit être ATTEIGNABLE (un auditeur au
// téléphone avec le siège doit pouvoir le lire) et FERMÉ par défaut. Les deux
// assertions comptent : sans la première, le détail serait supprimé au lieu
// d'être replié ; sans la seconde, un identifiant de trace s'afficherait en gras
// devant l'interlocuteur d'un entretien.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EtatErreur } from './EtatErreur.js';
import { Bouton } from './Bouton.js';

afterEach(() => {
  cleanup();
});

describe('EtatErreur — §33.2 : la CAUSE et l’ACTION, toutes les deux', () => {
  it('affiche la cause ET l’action, en français', () => {
    render(
      <EtatErreur
        cause="La mission n’a pas pu être chargée."
        action="Vérifiez votre connexion, puis relancez la synchronisation."
      />,
    );
    expect(screen.getByText('La mission n’a pas pu être chargée.')).not.toBeNull();
    expect(
      screen.getByText('Vérifiez votre connexion, puis relancez la synchronisation.'),
    ).not.toBeNull();
  });

  it('porte un titre par défaut en français, remplaçable par l’écran', () => {
    const { rerender } = render(<EtatErreur cause="Cause." action="Action." />);
    expect(screen.getByText('Une erreur est survenue')).not.toBeNull();
    rerender(<EtatErreur titre="Synchronisation impossible" cause="Cause." action="Action." />);
    expect(screen.getByText('Synchronisation impossible')).not.toBeNull();
  });

  it('s’annonce comme une alerte — c’est le seul des quatre états qui le mérite', () => {
    render(<EtatErreur cause="Cause." action="Action." />);
    expect(screen.getByRole('alert').textContent).toContain('Cause.');
  });

  it('rend l’action de résolution atteignable par son rôle', () => {
    const relancer = vi.fn();
    render(
      <EtatErreur
        cause="Le serveur n’a pas répondu."
        action="Réessayez dans un instant."
        actions={<Bouton onClick={relancer}>Réessayer</Bouton>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(relancer).toHaveBeenCalledTimes(1);
  });
});

describe('EtatErreur — le code technique est ATTEIGNABLE mais REPLIÉ', () => {
  it('ne montre AUCUN détail technique quand l’écran n’en fournit pas', () => {
    const { container } = render(<EtatErreur cause="Cause." action="Action." />);
    expect(container.querySelector('details')).toBeNull();
  });

  it('replie le détail : le bloc existe et il est FERMÉ par défaut', () => {
    const { container } = render(
      <EtatErreur cause="Cause." action="Action." details="ERR_SYNC_409 · session 4f2a" />,
    );
    const repli = container.querySelector<HTMLDetailsElement>('details');
    expect(repli).not.toBeNull();
    // `open` absent = replié. C'est la moitié de l'exigence qu'on oublie : un
    // identifiant de trace affiché d'emblée, c'est « une erreur technique brute
    // qui atteint l'écran » (§17.6), en entretien, devant l'interlocuteur.
    expect(repli?.open).toBe(false);
  });

  it('donne une commande NOMMÉE pour déplier, et le contenu devient lisible', () => {
    const { container } = render(
      <EtatErreur cause="Cause." action="Action." details="ERR_SYNC_409 · session 4f2a" />,
    );
    const resume = screen.getByText('Détail technique');
    expect(resume.tagName).toBe('SUMMARY');
    fireEvent.click(resume);
    const repli = container.querySelector<HTMLDetailsElement>('details');
    expect(repli?.open).toBe(true);
    expect(screen.getByText('ERR_SYNC_409 · session 4f2a')).not.toBeNull();
  });

  it('n’affiche jamais le code technique à la place de la cause en français', () => {
    render(
      <EtatErreur
        cause="La réponse n’a pas pu être enregistrée."
        action="Relancez la synchronisation."
        details="ERR_SYNC_409"
      />,
    );
    // Le titre lu et la cause restent des phrases : le code vit sous le repli.
    const alerte = screen.getByRole('alert');
    const avantRepli = alerte.textContent.indexOf('La réponse n’a pas pu être enregistrée.');
    const codeTechnique = alerte.textContent.indexOf('ERR_SYNC_409');
    expect(avantRepli).toBeGreaterThanOrEqual(0);
    expect(codeTechnique).toBeGreaterThan(avantRepli);
  });
});
