// =============================================================================
// QUAND `storage.persist()` LÈVE — DEUX ÉCRANS QUI AVAIENT L'AIR D'ALLER BIEN
//
// ── LA CLASSE DE DÉFAUT ─────────────────────────────────────────────────────
// A27 a trouvé, sur `EcranRestauration`, un `await exigerPersistance()` hors de
// tout `try` : le rejet partait en promesse non gérée et l'écran restait
// éternellement sur son squelette de chargement (défaut A27-D1). A24 l'a fermé,
// et a relevé au passage DEUX FRÈRES, de forme identique et hors de son
// périmètre — `void …then().finally()` sans `.catch` :
//
//   · `EcranStockage.redemander` — l'écran DONT L'UNIQUE RAISON D'ÊTRE est de
//     réparer le stockage ; son bouton « Redemander » devenait mort.
//   · `EcranAccueil.embarquer` — l'auditeur croyait sa mission embarquée alors
//     qu'aucune donnée n'était descendue sur l'appareil.
//
// Aucun des deux ne FIGE. C'est pire à leur façon : `finally` éteint bien le
// chargement, donc l'écran a l'air d'aller bien. Le premier à l'apprendre serait
// l'auditeur, au premier entretien, hors réseau — c'est l'invariant 1 qui tombe
// en silence.
//
// ── POURQUOI CE N'EST PAS THÉORIQUE ────────────────────────────────────────
// `navigator.storage.persist()` et `.estimate()` LÈVENT (`SecurityError`) sous
// WebKit en navigation privée et en contexte non sécurisé — c'est-à-dire sur
// l'iPad que 03 §22.1 vise nommément. Le cas n'est pas un bord : c'est le
// navigateur cible dans un de ses deux modes.
//
// ── CE QUE CES TESTS EXIGENT ────────────────────────────────────────────────
// Pas un texte particulier : que l'écran DISE quelque chose. Un rejet doit
// produire un message rendu, avec sa cause et son geste (03 §17.6, §33.2), et
// non un retour silencieux à l'état de repos.
//
// Traçabilité : E6 (hors ligne total — sans persistance, pas de collecte
// fiable) · E44 (UX/UI 2026-2027, tokens et police locale — la grille §33).
// =============================================================================
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from './contexte.js';
import { EcranStockage } from './EcranStockage.js';
import type * as Stockage from '../local/stockage.js';
import type { EtatStockage } from '../local/stockage.js';

let terrain: ValeurTerrain;
let persistanceLeve = false;

vi.mock('./contexte.js', () => ({
  useTerrain: () => terrain,
}));

vi.mock('../local/stockage.js', async (importerReel) => {
  const reel = await importerReel<typeof Stockage>();
  return {
    ...reel,
    exigerPersistance: vi.fn(() =>
      persistanceLeve
        ? // Ce que WebKit rend en navigation privée : un rejet, pas un verdict.
          Promise.reject(new DOMException('The operation is insecure.', 'SecurityError'))
        : Promise.resolve({ accordee: true, etat: etatDeBase() }),
    ),
  };
});

const GIO = 1024 * 1024 * 1024;

function etatDeBase(surcharges: Partial<EtatStockage> = {}): EtatStockage {
  return {
    persistant: false,
    quotaOctets: 10 * GIO,
    utiliseOctets: 1 * GIO,
    ratio: 0.1,
    niveau: 'ok',
    ...surcharges,
  };
}

function terrainDeBase(): ValeurTerrain {
  return {
    phase: 'verrouille',
    panne: null,
    premierUsage: false,
    base: null,
    verrou: {
      verrouille: false,
      delaiCourantMs: 15 * 60 * 1000,
      ecranMaintenuEveille: false,
      msAvantVerrouillage: () => 0,
      verrouillerMaintenant: () => undefined,
      signalerDeverrouillage: () => undefined,
    },
    navigation: { pile: ['stockage'] },
    vue: 'stockage',
    stockage: etatDeBase(),
    jetonSiege: 'inconnu',
    naviguer: () => undefined,
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: () => undefined,
    rafraichirStockage: () => Promise.resolve(),
  };
}

function boutonDemande(): HTMLElement {
  const cible = screen
    .getAllByRole('button')
    .find((b) => /redemander|conserv/i.test(b.textContent));
  if (cible === undefined) throw new Error('aucun bouton de demande de conservation');
  return cible;
}

beforeEach(() => {
  terrain = terrainDeBase();
  persistanceLeve = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('EcranStockage — la demande de conservation qui LÈVE', () => {
  it('@critique un rejet de `persist()` produit un message, jamais un retour silencieux', async () => {
    persistanceLeve = true;
    render(<EcranStockage />);

    // ÉTALON : avant le geste, le texte de panne n'est évidemment pas là. Sans
    // cette ligne, un test qui cherche un mot très commun pourrait le trouver
    // dans le texte de guidage ordinaire et passer sans rien mesurer.
    expect(screen.queryByText(/refusé de répondre/i)).toBeNull();

    fireEvent.click(boutonDemande());

    await waitFor(() => {
      expect(
        screen.getByText(/refusé de répondre/i),
        'Le rejet de `persist()` doit produire un message rendu, avec sa cause et son geste.\n' +
          'Sans `.catch`, `finally` éteint le chargement et l’écran revient au repos :\n' +
          'le bouton de l’écran qui existe POUR réparer le stockage devient un bouton mort.',
      ).toBeTruthy();
    });
  });

  it('le bouton retrouve son état de repos — un écran qui parle n’est pas un écran bloqué', async () => {
    persistanceLeve = true;
    render(<EcranStockage />);
    fireEvent.click(boutonDemande());

    await waitFor(() => {
      expect(screen.getByText(/refusé de répondre/i)).toBeTruthy();
    });
    // Le défaut voisin (A27-D1) figeait l'écran ; celui-ci ne doit pas être
    // corrigé en le remplaçant par l'autre.
    expect(boutonDemande().hasAttribute('disabled')).toBe(false);
  });

  it('un verdict NORMAL n’affiche évidemment aucune panne — contre-épreuve', async () => {
    persistanceLeve = false;
    render(<EcranStockage />);
    fireEvent.click(boutonDemande());

    await waitFor(() => {
      expect(boutonDemande().hasAttribute('disabled')).toBe(false);
    });
    expect(screen.queryByText(/refusé de répondre/i)).toBeNull();
  });
});
