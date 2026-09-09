// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B2**, moitié « coquille » : la SORTIE.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION écrits par A20 avec le correctif ; les tests d'acceptation
// reviennent à A27 (09 §5.6). Aucun n'est marqué `@critique`.
//
// Ce qu'ils tiennent : sur un écran profond, l'en-tête de la coquille offre un
// retour — pour TOUS les écrans, pas pour ceux auxquels on aura pensé. Le
// harnais est celui de `vue-initiale-app.test.tsx` (base réelle, `useTerrain`
// simulé) : c'est le seul moyen de rendre `App` sans monter tout le socle.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E44 (UX/UI, 4 états).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import type { ValeurTerrain } from './app/contexte.js';
import type { CodeVue } from './app/vues.js';
import { BaseLocale } from './local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from './local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './local/contexte.js';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('./app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-sortie-coquille-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

function terrainSur(base: BaseLocale, pile: readonly CodeVue[]): ValeurTerrain {
  const vue = pile[pile.length - 1] ?? 'accueil';
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
    navigation: { pile },
    vue,
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
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(17), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

/** Les écrans que A54 a trouvés sans issue, plus ceux du même régime. */
const ECRANS_PROFONDS: readonly CodeVue[] = [
  'nouvelEntretien',
  'pilote',
  'agenda',
  'finDeJournee',
  'finDeSession',
  'restauration',
];

describe('B2 — l’en-tête de la coquille porte la sortie', () => {
  for (const ecran of ECRANS_PROFONDS) {
    it(`« ${ecran} » atteint par navigation offre autre chose que « Verrouiller »`, async () => {
      const base = await nouvelleBase();
      terrain = terrainSur(base, ['accueil', ecran]);
      const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        render(<App />);
        const retour = await screen.findByRole('button', { name: 'Revenir' });
        retour.click();
        await waitFor(() => {
          expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'retour' });
        });
      } finally {
        silence.mockRestore();
      }
    });
  }

  it('sur une racine, aucun « Revenir » : un bouton qui ne mène nulle part serait un mensonge', async () => {
    const base = await nouvelleBase();
    terrain = terrainSur(base, ['accueil']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await screen.findByRole('button', { name: 'Verrouiller' });
      expect(screen.queryByRole('button', { name: 'Revenir' })).toBeNull();
    } finally {
      silence.mockRestore();
    }
  });
});
