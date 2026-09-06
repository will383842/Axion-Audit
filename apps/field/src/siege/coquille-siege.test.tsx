// =============================================================================
// TESTS DE CONCEPTION A23 — le rappel de rattachement, dans la COQUILLE.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// CONCEPTION, écrits par A23 avec le correctif. Les tests d'acceptation
// reviennent à un agent qui n'a écrit aucune de ces lignes (09 §5.6) ; aucun
// n'est marqué `@critique`.
//
// ── CE QU'ILS TIENNENT, ET POURQUOI DEPUIS LA COQUILLE ──────────────────────
// A54 s'est arrêté à `t+3 min` au FOND de « Nouvel entretien », devant un état
// d'erreur sans issue. Le geste manquant ne doit donc pas vivre sur un écran :
// il doit être atteignable de N'IMPORTE OÙ, comme le bouton Retour du correctif
// B2. C'est ce que ces tests vérifient — sur les mêmes écrans profonds que B2,
// et sur l'accueil.
//
// Le second test est le plus important : le rappel DISPARAÎT dès qu'une identité
// existe. Un bandeau permanent finirait par ne plus être lu, et ce dépôt
// n'ajoute pas un garde-fou qui crie quand tout va bien.
//
// Le harnais est celui de `App.recette-b2.test.tsx` : base réelle, `useTerrain`
// simulé, paramètres KDF réduits — c'est le seul moyen de rendre `App` sans
// monter tout le socle.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E33 (sécurité / RGPD).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import type { ValeurTerrain } from '../app/contexte.js';
import type { CodeVue } from '../app/vues.js';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../local/coffre.js';
import { contexteLocal, installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { memoriserIdentiteAuditeur } from '../session/auditeur.js';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

const AUDITEUR_ID = '01922f4e-0000-7000-8000-00000000a23a';

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-rappel-rattachement-${String(compteur)}`);
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
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(23), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

/** Les écrans où A54 s'est trouvé enfermé, plus la racine. */
const ECRANS: readonly CodeVue[] = ['accueil', 'nouvelEntretien', 'agenda'];

describe('le rappel de rattachement vit dans la coquille, jamais dans un écran', () => {
  for (const ecran of ECRANS) {
    it(`« ${ecran} » : sans identité, le geste de rattachement est offert`, async () => {
      const base = await nouvelleBase();
      terrain = terrainSur(base, ecran === 'accueil' ? ['accueil'] : ['accueil', ecran]);
      const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        render(<App />);
        const geste = await screen.findByRole(
          'button',
          { name: /rattacher cet appareil/i },
          // Sous charge (plusieurs chantiers en parallèle), la lecture Dexie de
          // l'identité dépasse la seconde par défaut de Testing Library. Un test
          // qui rougit par contention ne prouve rien et coûte une relance.
          { timeout: 10_000 },
        );
        geste.click();
        await waitFor(() => {
          expect(terrain.naviguer).toHaveBeenCalledWith({
            type: 'aller',
            vue: 'connexionSiege',
          });
        });
      } finally {
        silence.mockRestore();
      }
    });
  }

  it('appareil rattaché : le rappel DISPARAÎT — un garde-fou ne crie pas quand tout va bien', async () => {
    // ── Pourquoi ce test part de l'ABSENCE d'identité ────────────────────────
    // Une assertion « ce bouton n'est pas là » est vraie à l'instant 0, avant
    // même que la lecture Dexie ait rendu la main : elle passerait sur un
    // composant qui ne rend jamais rien, et ne prouverait donc rien. On établit
    // d'abord que le rappel EST là, puis on range l'identité et on regarde le
    // même DOM le perdre.
    const base = await nouvelleBase();
    terrain = terrainSur(base, ['accueil']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await screen.findByRole('button', { name: /rattacher cet appareil/i }, { timeout: 10_000 });

      await memoriserIdentiteAuditeur(base, contexteLocal().coffre, {
        id: AUDITEUR_ID,
        profil: 'guide_strict',
      });

      await waitFor(
        () => {
          expect(screen.queryByRole('button', { name: /rattacher cet appareil/i })).toBeNull();
        },
        { timeout: 10_000 },
      );
      expect(document.body.textContent).not.toMatch(/n’est rattaché à aucun auditeur/);
    } finally {
      silence.mockRestore();
    }
  });

  it('sur l’écran de rattachement lui-même, aucun rappel : ce serait du bruit', async () => {
    const base = await nouvelleBase();
    terrain = terrainSur(base, ['accueil', 'connexionSiege']);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<App />);
      await waitFor(
        () => {
          expect(document.body.textContent).toMatch(/Pourquoi cette étape/);
        },
        { timeout: 10_000 },
      );
      expect(document.body.textContent).not.toMatch(/n’est rattaché à aucun auditeur/);
    } finally {
      silence.mockRestore();
    }
  });
});
