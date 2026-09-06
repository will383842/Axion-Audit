// =============================================================================
// LA VUE INITIALE, APPLIQUÉE PAR LA COQUILLE — lot L5, incrément L5c. Écrit par
// A27 (09 §5.6). A23 a testé la RÈGLE pure (`vue-initiale.test.ts`) ; ce fichier
// éprouve son APPLICATION dans `App.tsx` (fichier partagé, amendement
// `LOT_L5.md` du 2026-09-05) : c'est le crochet `useVueInitiale`, pas la
// fonction, qui décide de l'écran que l'auditeur voit en ouvrant sa tablette.
//
//   · mission embarquée + atterrissage par défaut ⇒ navigation RACINE vers
//     le cockpit « Aujourd'hui » (arbitrage A01, 2026-09-05) ;
//   · aucune mission ⇒ `accueil` reste, aucune navigation ;
//   · reprise instantanée (03 §17.4) : atterrissage sur `entretien` ⇒ AUCUNE
//     navigation, mission embarquée OU NON — la règle ne détourne jamais ;
//   · la règle joue UNE fois par ouverture du coffre, pas à chaque rendu.
//
// `useTerrain` est simulé (phase, pile, base) ; la base est réelle. Les écrans
// rendus derrière la coquille lisent la base et affichent leurs propres états,
// ce qui n'est pas l'objet ici : seul l'appel à `naviguer` est mesuré.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min) · E6 (hors ligne total).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.js';
import type { ValeurTerrain } from '../../app/contexte.js';
import type { CodeVue } from '../../app/vues.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';

const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f5e1';
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

// jsdom n'implémente pas `scrollIntoView`, que l'écran d'entretien (L5b) appelle.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(embarquee: boolean): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-vue-initiale-app-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  if (embarquee) await ecrireMeta(base, cleEmbarquement(MISSION_ID), '2026-09-05T07:00:00.000Z');
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
    stockage: {
      persistant: true,
      quotaOctets: 10 * 1024 ** 3,
      utiliseOctets: 1024 ** 3,
      ratio: 0.1,
      niveau: 'ok',
    },
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

/** Laisse au crochet le temps de lire `meta` et de décider. */
async function laisserDecider(): Promise<void> {
  await new Promise((resoudre) => setTimeout(resoudre, 150));
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(31), KDF_TEST);
}, 20_000);

afterEach(async () => {
  // Démonter AVANT de retirer le contexte : sinon la dernière `useLiveQuery` se
  // rejoue sur un coffre absent et journalise une erreur qui n'en est pas une.
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('App — la vue initiale est une règle (arbitrage A01, 2026-09-05)', () => {
  it('@critique CAS 1 — mission embarquée, atterrissage par défaut ⇒ navigation RACINE vers le cockpit', async () => {
    const base = await nouvelleBase(true);
    terrain = terrainSur(base, ['accueil']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await waitFor(() => {
        expect(terrain.naviguer).toHaveBeenCalledWith({ type: 'racine', vue: 'aujourdhui' });
      });
      expect(terrain.naviguer).toHaveBeenCalledTimes(1);
    } finally {
      silence.mockRestore();
    }
  });

  it('@critique CAS 2 — aucune mission embarquée ⇒ `accueil` reste, AUCUNE navigation', async () => {
    const base = await nouvelleBase(false);
    terrain = terrainSur(base, ['accueil']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await laisserDecider();
      expect(terrain.naviguer).not.toHaveBeenCalled();
    } finally {
      silence.mockRestore();
    }
  });

  it('@critique REPRISE INSTANTANÉE (03 §17.4) — atterrissage sur `entretien` ⇒ aucune navigation, mission embarquée', async () => {
    const base = await nouvelleBase(true);
    terrain = terrainSur(base, ['entretien']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await laisserDecider();
      expect(terrain.naviguer).not.toHaveBeenCalled();
    } finally {
      silence.mockRestore();
    }
  });

  it('@critique REPRISE INSTANTANÉE (03 §17.4) — atterrissage sur `entretien` ⇒ aucune navigation, mission NON embarquée', async () => {
    const base = await nouvelleBase(false);
    terrain = terrainSur(base, ['entretien']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await laisserDecider();
      expect(terrain.naviguer).not.toHaveBeenCalled();
    } finally {
      silence.mockRestore();
    }
  });

  it('une pile déjà profonde (l’auditeur naviguait) n’est pas un démarrage : aucune navigation', async () => {
    const base = await nouvelleBase(true);
    terrain = terrainSur(base, ['accueil', 'agenda']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await laisserDecider();
      expect(terrain.naviguer).not.toHaveBeenCalled();
    } finally {
      silence.mockRestore();
    }
  });

  it('la règle ne joue pas coffre FERMÉ : en phase `verrouille`, aucune lecture de la base, aucune navigation', async () => {
    const base = await nouvelleBase(true);
    terrain = { ...terrainSur(base, ['accueil']), phase: 'verrouille' };
    render(<App />);
    await laisserDecider();
    expect(terrain.naviguer).not.toHaveBeenCalled();
  });
});
