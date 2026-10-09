// =============================================================================
// TESTS DE `ChampPhoto` — LA CONFIRMATION APRÈS SUCCÈS — L6c-1, revue A29.
// ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6). Une photo enregistrée sans un mot laisse l'auditeur
// douter : il recommence, et la pièce est en double. La confirmation est dite en
// français dans une zone `role="status"` PRÉSENTE DÈS LE PREMIER RENDU : une zone
// vivante insérée au moment du message n'est pas annoncée par tous les lecteurs
// d'écran (VoiceOver sur iPad, la cible dure 03 §22.1) — le nœud doit exister
// AVANT que son texte change.
//
// Traçabilité : E23 (hyper intuitif), E44 (§33), invariant 5.
// =============================================================================
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChampPhoto } from './ChampPhoto.js';

function fichierImage(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'atelier.jpg', {
    type: 'image/jpeg',
  });
}

function champ(): HTMLInputElement {
  const trouve = screen.getByLabelText(/ajouter une photo/i);
  if (!(trouve instanceof HTMLInputElement)) throw new Error('champ photo absent');
  return trouve;
}

function rendre(onCapturer: (fichier: File) => Promise<boolean>): void {
  render(
    <ChampPhoto
      libelle="Ajouter une photo"
      desactive={false}
      idMotif={null}
      onCapturer={onCapturer}
    />,
  );
}

describe('ChampPhoto — confirmation en français après un ajout réussi', () => {
  it('@critique la zone `role="status"` existe DÈS LE PREMIER RENDU, vide de tout message', () => {
    rendre(() => Promise.resolve(true));
    const statut = screen.getByRole('status');
    expect(statut.textContent.trim()).toBe('');
  });

  it('@critique après succès, la MÊME zone dit en français que la photo est enregistrée', async () => {
    rendre(() => Promise.resolve(true));
    const zone = screen.getByRole('status');
    await act(async () => {
      fireEvent.change(champ(), { target: { files: [fichierImage()] } });
      await Promise.resolve();
    });
    const apres = screen.getByRole('status');
    expect(apres).toBe(zone);
    expect(apres.textContent).toMatch(/photo/i);
    expect(apres.textContent).toMatch(/enregistrée|ajoutée/i);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un échec ne dit PAS « enregistrée » dans la zone de statut', async () => {
    rendre(() => Promise.resolve(false));
    await act(async () => {
      fireEvent.change(champ(), { target: { files: [fichierImage()] } });
      await Promise.resolve();
    });
    expect(screen.getByRole('status').textContent).not.toMatch(/enregistrée|ajoutée/i);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
