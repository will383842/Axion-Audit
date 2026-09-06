// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B5** de la recette novice n°1 (A54,
// 2026-09-06) : « une panne de lecture rendue en “Aucune session ouverte” ».
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION écrits par A20 avec le correctif ; l'acceptation revient
// à A27 (09 §5.6). Aucun n'est marqué `@critique`.
//
// ── CE QU'ILS TIENNENT, ET UN CONSTAT QUI VA AU RAPPORT ────────────────────
// `EcranFinDeSession` n'avait, au moment de ce correctif, AUCUN fichier de test :
// il n'est importé que par `App.tsx`. C'est précisément l'écran où A54 a trouvé
// l'erreur déguisée en vide. Ces trois tests sont donc aussi les premiers de cet
// écran, et ils ne dispensent pas A27 de sa passe : ils tiennent les trois
// situations que 03 §33.2 exige de ne jamais confondre —
//   · chargement    : la lecture n'a pas encore répondu ;
//   · vide          : la lecture a RÉUSSI, il n'y a aucune session ouverte ;
//   · erreur        : la lecture a ÉCHOUÉ, et l'entretien existe peut-être.
//
// Traçabilité : E44 (UX/UI — 4 états, §33.2) · E24 (validation de chaque étape).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { ecrireLocal } from '../../local/ecriture.js';
import type * as ModulePosition from '../../session/position.js';
import { EcranFinDeSession } from './EcranFinDeSession.js';

// La panne de lecture est injectée au plus près de ce que l'écran appelle : une
// porte pilotable sur `lireSessionCourante`. Par défaut elle délègue au vrai
// module — le test nominal lit donc la VRAIE position, pas une simulation.
const porte = vi.hoisted(() => ({ enPanne: false }));

vi.mock('../../session/position.js', async (importOriginal) => {
  const original = await importOriginal<typeof ModulePosition>();
  return {
    ...original,
    lireSessionCourante: async (base: Parameters<typeof original.lireSessionCourante>[0]) => {
      if (porte.enPanne) throw new Error('panne de lecture injectée sur le stockage local');
      return original.lireSessionCourante(base);
    },
  };
});

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

const INSTANT = '2026-09-06T12:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f3d1';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000000c3d1';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e301';

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

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-b5-fin-session-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return base;
}

async function semerSession(): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
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
  return id;
}

function terrainSur(base: BaseLocale): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: 60 * 60 * 1000,
      ecranMaintenuEveille: true,
      msAvantVerrouillage: () => 60 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['aujourdhui', 'finDeSession'] },
    vue: 'finDeSession',
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

async function monter(base: BaseLocale): Promise<void> {
  terrain = terrainSur(base);
  render(<EcranFinDeSession />);
  await waitFor(() => {
    expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
  });
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(23), KDF_TEST);
}, 20_000);

beforeEach(() => {
  porte.enPanne = false;
});

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('B5 — l’échec de lecture ne se déguise plus en état vide', () => {
  it('lecture EN PANNE : l’écran dit qu’il n’a pas pu LIRE, et jamais que la session n’existe pas', async () => {
    const base = await nouvelleBase();
    await semerSession();
    porte.enPanne = true;
    await monter(base);

    const texte = document.body.textContent;
    expect(texte).toMatch(/n’a pas pu être lue/i);
    expect(texte).not.toMatch(/Aucune session ouverte/i);
  }, 30_000);

  it('lecture EN PANNE : la cause dit que rien n’a été supprimé, et l’action dit quoi faire', async () => {
    const base = await nouvelleBase();
    porte.enPanne = true;
    await monter(base);

    const texte = document.body.textContent;
    expect(texte).toMatch(/rien n’a été supprimé/i);
    expect(texte).toMatch(/sauvegarde de secours/i);
  }, 30_000);

  it('lecture RÉUSSIE sans session : l’état vide reste l’état vide, avec sa sortie', async () => {
    const base = await nouvelleBase();
    await monter(base);

    const texte = document.body.textContent;
    expect(texte).toMatch(/Aucune session ouverte/i);
    expect(texte).not.toMatch(/n’a pas pu être lue/i);
    expect(screen.getByRole('button', { name: /revenir à ma journée/i })).toBeDefined();
  }, 30_000);
});
