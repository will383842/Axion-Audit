// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B6**, moitié « écran » : UNE pastille.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION écrits par A20 avec le correctif ; l'acceptation revient
// à A27 (09 §5.6). Aucun n'est marqué `@critique`.
//
// ── CE QU'ILS TIENNENT ──────────────────────────────────────────────────────
// A54 a relevé DEUX pastilles sur l'écran d'accueil, se contredisant. Ce test
// compte : sur l'écran où le défaut a été vu, il ne doit rester qu'un seul
// énoncé de synchronisation. Le comptage porte sur le MOT rendu par la pastille
// du design system, pas sur une classe CSS — un test qui interroge le style
// passerait au vert le jour où l'on ajoute une seconde pastille autrement
// stylée, c'est-à-dire le jour où le défaut revient.
//
// Le libellé n'est pas figé : l'énoncé d'avant L6a est un doute de spec ouvert
// (rapport A54 §8-5). Le test accepte donc N'IMPORTE LEQUEL des cinq mots du
// design system, et vérifie qu'il n'y en a qu'UN.
//
// Traçabilité : E7 (remontée continue), E6 (hors ligne total), E44 (UX/UI).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.js';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

/** Les cinq mots que `PastilleSync` sait dire (§33.6 : jamais la couleur seule). */
const MOTS_DE_PASTILLE =
  /^(Synchronisé|Synchronisation…|En attente de synchronisation|Hors ligne|Synchronisation en échec)$/;

let terrain: ValeurTerrain;
let kek: CryptoKey;
const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-b6-pastille-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

function terrainSur(base: BaseLocale): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: 15 * 60 * 1000,
      ecranMaintenuEveille: false,
      msAvantVerrouillage: () => 15 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['accueil'] },
    vue: 'accueil',
    stockage: null,
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(11), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('B6 — un fait, une pastille', () => {
  it('l’écran d’accueil, où A54 en a vu deux, n’en porte plus qu’UNE', async () => {
    const base = await nouvelleBase();
    terrain = terrainSur(base);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await waitFor(() => {
        expect(screen.getAllByText(MOTS_DE_PASTILLE).length).toBeGreaterThan(0);
      });
      expect(screen.getAllByText(MOTS_DE_PASTILLE)).toHaveLength(1);
    } finally {
      silence.mockRestore();
    }
  }, 30_000);

  it('elle porte son explication : le motif ne vit pas que dans la couleur', async () => {
    const base = await nouvelleBase();
    terrain = terrainSur(base);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      const mot = await screen.findByText(MOTS_DE_PASTILLE);
      const pastille = mot.parentElement;
      expect(pastille?.getAttribute('title') ?? '').toMatch(/n’est pas encore disponible/i);
    } finally {
      silence.mockRestore();
    }
  }, 30_000);
});
