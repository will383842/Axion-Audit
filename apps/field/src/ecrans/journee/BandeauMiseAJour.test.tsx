// =============================================================================
// LE BANDEAU DE MISE À JOUR — lot L5, incrément L5c. Écrit par A27 (09 §5.6),
// depuis 05 §31-1 : « le service worker télécharge les nouvelles versions en
// arrière-plan mais ne les active JAMAIS pendant un entretien en cours ; bandeau
// discret “Nouvelle version disponible — appliquer” actionné par l'auditeur
// entre deux entretiens » ; 03 §17.3 : « bandeau discret (jamais de popup en
// plein entretien) ».
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   · rien n'est rendu tant qu'aucune version n'attend ;
//   · quand une version attend : un `role="status"` (discret), jamais un
//     `dialog` ni une `alert` ; le geste est celui de l'auditeur ;
//   · pendant une session en cours : le bouton reste, mais le bandeau DIT que la
//     mise à jour attend la fin de la session — et un refus du garde est rendu
//     comme un refus, pas comme une panne ;
//   · aucun rechargement automatique : le bandeau ne décide de rien.
//
// La mécanique (`app/service-worker-client.ts`, L5a) est remplacée par une porte
// pilotable — le bandeau ne fait que RENDRE l'état qu'elle lui donne.
//
// Traçabilité : E6 (hors ligne total), E23 (hyper intuitif).
// =============================================================================
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EtatMiseAJour } from '../../app/service-worker-client.js';
import { BandeauMiseAJour } from './BandeauMiseAJour.js';

const porte = vi.hoisted(() => ({
  disponible: false,
  permise: true,
  appliquer: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
  abonnes: new Set<(etat: EtatMiseAJour) => void>(),
}));

vi.mock('../../app/service-worker-client.js', () => ({
  activationPermise: () => porte.permise,
  surMiseAJour: (abonne: (etat: EtatMiseAJour) => void) => {
    porte.abonnes.add(abonne);
    abonne({ disponible: porte.disponible, appliquer: porte.appliquer });
    return () => porte.abonnes.delete(abonne);
  },
}));

function diffuser(): void {
  for (const abonne of porte.abonnes) {
    abonne({ disponible: porte.disponible, appliquer: porte.appliquer });
  }
}

beforeEach(() => {
  porte.disponible = false;
  porte.permise = true;
  porte.appliquer = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
  porte.abonnes.clear();
});

describe('BandeauMiseAJour — 05 §31-1', () => {
  it('aucune version en attente ⇒ RIEN n’est rendu', () => {
    const { container } = render(<BandeauMiseAJour />);
    expect(container.innerHTML).toBe('');
  });

  it('@critique une version en attente ⇒ un bandeau DISCRET (`status`), jamais une boîte modale ni une alerte, avec le geste « Appliquer maintenant »', () => {
    porte.disponible = true;
    render(<BandeauMiseAJour />);
    const bandeau = screen.getByRole('status');
    expect(bandeau.textContent).toMatch(/nouvelle version/i);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /appliquer maintenant/i })).toBeTruthy();
    // Entre deux entretiens : aucun avertissement de session en cours.
    expect(document.body.textContent).not.toMatch(/attend la fin de votre session/i);
  });

  it('@critique le bandeau apparaît quand la version arrive APRÈS le montage — il écoute, il ne relit pas une fois', () => {
    render(<BandeauMiseAJour />);
    expect(screen.queryByRole('status')).toBeNull();
    porte.disponible = true;
    act(() => {
      diffuser();
    });
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('@critique SESSION EN COURS : le bandeau dit que la mise à jour attend la fin de la session, et rien n’est perdu', () => {
    porte.disponible = true;
    porte.permise = false;
    render(<BandeauMiseAJour />);
    expect(document.body.textContent).toMatch(/attend la fin de votre session en cours/i);
    expect(document.body.textContent).toMatch(/ne s’appliquera pas pendant un entretien/i);
    expect(document.body.textContent).toMatch(/rien n’est perdu/i);
  });

  it('@critique le geste est celui de l’AUDITEUR : `appliquer` n’est jamais appelé sans clic, et l’est UNE fois au clic', async () => {
    porte.disponible = true;
    render(<BandeauMiseAJour />);
    expect(porte.appliquer).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /appliquer maintenant/i }));
      await Promise.resolve();
    });
    expect(porte.appliquer).toHaveBeenCalledTimes(1);
  });

  it('@critique un REFUS du garde (rend `false`) est rendu comme un refus expliqué, pas comme une panne muette', async () => {
    porte.disponible = true;
    porte.appliquer = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
    render(<BandeauMiseAJour />);
    expect(document.body.textContent).not.toMatch(/attend la fin de votre session/i);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /appliquer maintenant/i }));
      await Promise.resolve();
    });
    expect(document.body.textContent).toMatch(/attend la fin de votre session en cours/i);
    expect(screen.queryByRole('alert')).toBeNull();
    // Le bouton reste : « Terminez la session, puis réessayez ».
    expect(screen.getByRole('button', { name: /appliquer maintenant/i })).toBeTruthy();
  });
});
