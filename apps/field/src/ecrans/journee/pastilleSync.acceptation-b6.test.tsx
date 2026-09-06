// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B6** de la recette novice n°1 (A54,
// 2026-09-06) : deux pastilles, deux mensonges, en sens contraire.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit aucune ligne de
// `PastilleSyncCoquille.tsx`, de `etat-sync-affiche.ts` ni du correctif
// (09 §5.6). `@critique` : c'est la seule question que l'invariant 8 oblige
// l'auditeur à se poser chaque soir — « mes données sont-elles sorties de cet
// appareil ? » — et elle recevait deux réponses opposées, toutes deux fausses.
//
// ── LES TROIS EXIGENCES, ÉPROUVÉES SUR L'ÉCRAN RÉEL ─────────────────────────
//   ① UNE seule pastille sur l'écran où A54 en a vu deux ;
//   ② son état vient du PORT DE SYNC : aucune mission ⇒ `indisponible`, rendu
//      « Hors ligne » et JAMAIS « Synchronisé » — « rien à dire » n'est pas
//      « tout va bien » ;
//   ③ le compte d'outbox reste AFFICHÉ : c'est un nombre vrai, et c'est lui qui
//      dit ce qui ne vit encore que sur la tablette.
//
// ── LE POINT QUE CE FICHIER AJOUTE ──────────────────────────────────────────
// L'assertion ② est vérifiée sur la TABLE ENTIÈRE des statuts du port, jusqu'au
// mot peint dans le DOM : pour chaque statut possible, le mot « Synchronisé »
// n'apparaît que si le port dit `a_jour`. Une table exhaustive attrape le statut
// qui sera ajouté demain ; un test sur `indisponible` seul ne l'attraperait pas.
// Et le bord opposé est tenu : la pastille SAIT dire « Synchronisé ». Sans lui,
// un composant qui n'afficherait plus jamais ce mot passerait pour correct.
//
// Traçabilité : E7 (remontée continue), E38 (sauvegarde terrain), E6, E44.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { PastilleSync } from '@axion/ui';
import { App } from '../../App.js';
import type { ValeurTerrain } from '../../app/contexte.js';
import { MENTION_SYNC_INDISPONIBLE, versEtatPastille } from '../../app/etat-sync-affiche.js';
import { BaseLocale } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { ecrireLocal } from '../../local/ecriture.js';
import type { StatutSync } from '../../local/port-sync.js';

const INSTANT = '2026-09-06T09:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000027b601';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000027b602';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000027b603';

/** Les mots que la pastille peut peindre — la liste du design system. */
const MOTS_DE_PASTILLE =
  /^(Synchronisé|Synchronisation…|En attente de synchronisation|Hors ligne|Synchronisation en échec)$/;

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

let terrain: ValeurTerrain;
let kek: CryptoKey;
const bases: BaseLocale[] = [];
let compteur = 0;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-a27-b6-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

/** Une écriture locale = une opération dans l'outbox (05 §9.2). */
async function semerOperationsEnAttente(nombre: number): Promise<void> {
  for (let index = 0; index < nombre; index += 1) {
    await ecrireLocal({
      entite: 'interview',
      id: uuidv7(),
      missionId: MISSION_ID,
      action: 'upsert',
      index: {
        orgUnitId: UNITE_ID,
        kind: 'entretien',
        status: 'en_cours',
        scheduleStatus: 'realise',
        scheduledAt: INSTANT,
      },
      charge: {
        conductedBy: AUDITEUR_ID,
        mode: 'sur_site',
        personName: 'Interlocuteur Fictif',
        personRole: 'Fonction fictive',
        personServiceId: null,
        personEmail: null,
        participants: null,
        generalNotes: null,
        linkedReviewAnswerId: null,
        documentRequestId: null,
        consentGiven: true,
        consentAudio: false,
        consentedAt: null,
        informationNoticeVersion: null,
        noticeShownAt: null,
        scheduledDurationMin: 45,
        startedAt: INSTANT,
        endedAt: null,
        valideeLe: null,
        clientCreatedAt: INSTANT,
      },
    });
  }
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

function silence(): { restaurer: () => void } {
  const espion = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return {
    restaurer: () => {
      espion.mockRestore();
    },
  };
}

beforeAll(async () => {
  kek = await deriverKek('mot-de-passe-fictif-a27-b6', new Uint8Array(16).fill(31), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B6 — sur l’écran où A54 en a vu deux, il n’y a qu’UNE pastille', () => {
  it('@critique une seule pastille, et elle ne dit pas « Synchronisé » sur un appareil sans mission', async () => {
    const base = await nouvelleBase();
    await semerOperationsEnAttente(3);
    terrain = terrainSur(base);
    const bruit = silence();
    try {
      render(<App />);
      await waitFor(() => {
        expect(screen.getAllByText(MOTS_DE_PASTILLE).length).toBeGreaterThan(0);
      });

      const mots = screen.getAllByText(MOTS_DE_PASTILLE);
      expect(mots).toHaveLength(1);
      // Aucune mission embarquée ⇒ `indisponible` ⇒ « Hors ligne ».
      expect(mots[0]?.textContent).toBe('Hors ligne');
      expect(document.body.textContent).not.toContain('Synchronisé');
    } finally {
      bruit.restaurer();
    }
  }, 30_000);

  it('@critique le compte d’outbox reste AFFICHÉ : c’est un nombre vrai, pas un état', async () => {
    const base = await nouvelleBase();
    await semerOperationsEnAttente(3);
    terrain = terrainSur(base);
    const bruit = silence();
    try {
      render(<App />);
      await waitFor(() => {
        expect(screen.getAllByText(MOTS_DE_PASTILLE).length).toBe(1);
      });
      await waitFor(() => {
        expect(document.body.textContent).toContain('3 en attente');
      });
    } finally {
      bruit.restaurer();
    }
  }, 30_000);

  it('@critique la pastille porte son motif en toutes lettres, pas seulement dans sa couleur', async () => {
    const base = await nouvelleBase();
    terrain = terrainSur(base);
    const bruit = silence();
    try {
      render(<App />);
      const mot = await screen.findByText(MOTS_DE_PASTILLE);
      const pastille = mot.parentElement;
      expect(pastille?.getAttribute('title')).toBe(MENTION_SYNC_INDISPONIBLE);
      // La mention nomme l'indisponibilité ET le geste qui protège la journée.
      expect(MENTION_SYNC_INDISPONIBLE).toMatch(/n’est pas encore disponible/i);
      expect(MENTION_SYNC_INDISPONIBLE).toMatch(/sauvegarde de secours/i);
    } finally {
      bruit.restaurer();
    }
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B6 — « Synchronisé » ne se peint que sur `a_jour`, pour TOUS les statuts', () => {
  const STATUTS: readonly StatutSync[] = [
    'a_jour',
    'en_attente',
    'echec',
    'jamais_synchronisee',
    'indisponible',
  ];

  for (const statut of STATUTS) {
    it(`@critique statut « ${statut} » : le mot peint ${statut === 'a_jour' ? 'EST' : 'n’est PAS'} « Synchronisé »`, () => {
      const { unmount } = render(<PastilleSync etat={versEtatPastille(statut)} enAttente={7} />);
      const peint = screen.getByRole('status').textContent;
      if (statut === 'a_jour') {
        // Le bord opposé : sans lui, une pastille qui n'afficherait plus jamais
        // « Synchronisé » passerait pour correcte.
        expect(peint).toContain('Synchronisé');
      } else {
        expect(peint).not.toContain('Synchronisé');
      }
      // Le compte survit à tous les états : il ne dépend pas du statut.
      expect(peint).toContain('7 en attente');
      unmount();
    });
  }
});
