// =============================================================================
// LA PASTILLE RACCORDÉE À L'ÉCRAN DE SYNCHRONISATION — lot L6, incrément L6b.
// ÉCRIT AVANT LE CODE.
//
// Écrit par A26 (09 §5.6) depuis `LOT_L6.md` §3ter C.2 (« M `app/EcranAccueil.tsx`
// et `ecrans/journee/EcranAujourdhui.tsx` (pastille — RACCORDEMENT, pas de
// calcul) ; 10e échec → “à examiner” VISIBLE »), 05 §9.3 (« notification discrète
// “n réponse(s) arbitrée(s)”, cliquable »).
//
// ── CE QUI EST ATTENDU (pour A22) ────────────────────────────────────────────
// Sur l'accueil ET sur « Aujourd'hui » : un bouton « Voir la file de
// synchronisation » qui fait `naviguer({ type: 'aller', vue: 'synchronisation' })`.
// Sur « Aujourd'hui » : quand le compte local d'arbitrages n'est pas nul, un
// bouton « n réponse(s) arbitrée(s) » qui mène au même écran ; et les ops « à
// examiner » sont dites (« 1 opération à examiner »). Aucun réseau pour le dire.
//
// Traçabilité : E7, E38, E44 ; invariant 8.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import type { ValeurTerrain } from '../../app/contexte.js';
import { EcranAccueil } from '../../app/EcranAccueil.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { cleReponsesArbitrees } from '../../sync/moteur.js';
import { EcranAujourdhui } from '../journee/EcranAujourdhui.js';

const INSTANT = '2026-10-09T09:00:00.000Z';
const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const UNITE = '0191e2a0-0000-7000-8000-00000000c001';

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

const bases: BaseLocale[] = [];
let compteur = 0;

async function baseSemee(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-raccord-sync-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  await appliquerDescente({
    missionId: MISSION,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: 'Mission fictive FIL-GC',
          companyId: '0191e2a0-0000-7000-8000-00000000cccc',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'auditeur',
        },
      },
      {
        table: 'orgUnits',
        index: {
          id: UNITE,
          missionId: MISSION,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: INSTANT,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif',
          countryCode: null,
          timezone: null,
          headcount: 4,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: INSTANT,
        },
      },
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION), INSTANT);

  // Une op « à examiner », et deux réponses arbitrées au compte local.
  const id = uuidv7();
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: MISSION,
    action: 'upsert',
    index: {
      interviewId: uuidv7(),
      missionQuestionId: uuidv7(),
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'number', v: 3 },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive ?',
      revision: 1,
      clientCreatedAt: INSTANT,
    },
  });
  const op = (await base.outbox.toArray())[0];
  if (op === undefined) throw new Error('banc : op absente');
  await base.outbox.update(op.opId, {
    statut: 'a_examiner',
    tentatives: 10,
    derniereErreur: 'Le siège n’a pas pu appliquer cette opération (fictif).',
  });
  await ecrireMeta(base, cleReponsesArbitrees(MISSION), 2);
  return base;
}

function terrainDeBase(base: BaseLocale, vue: 'accueil' | 'aujourdhui'): ValeurTerrain {
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
    navigation: { pile: [vue] },
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

let fetchEspion: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(97), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  vi.unstubAllGlobals();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

function espionnerReseau(): void {
  fetchEspion = vi.fn(() => Promise.reject(new Error('le statut ne lit JAMAIS le réseau')));
  vi.stubGlobal('fetch', fetchEspion);
}

const VERS_SYNC = { type: 'aller', vue: 'synchronisation' };

describe('raccordement — accueil', () => {
  it('@critique « Voir la file de synchronisation » mène à l’écran de synchronisation, sans réseau', async () => {
    const base = await baseSemee();
    terrain = terrainDeBase(base, 'accueil');
    espionnerReseau();
    render(<EcranAccueil />);
    const bouton = await screen.findByRole('button', { name: /voir la file de synchronisation/i });
    fireEvent.click(bouton);
    expect(terrain.naviguer).toHaveBeenCalledWith(VERS_SYNC);
    expect(fetchEspion).not.toHaveBeenCalled();
  });
});

describe('raccordement — Aujourd’hui', () => {
  it('@critique l’op « à examiner » est DITE, et la file est à un geste', async () => {
    const base = await baseSemee();
    terrain = terrainDeBase(base, 'aujourdhui');
    espionnerReseau();
    render(<EcranAujourdhui />);
    await waitFor(() => {
      expect(screen.getByText(/1 opération à examiner/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /voir la file de synchronisation/i }));
    expect(terrain.naviguer).toHaveBeenCalledWith(VERS_SYNC);
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('« 2 réponses arbitrées » est cliquable et mène au même écran (05 §9.3)', async () => {
    const base = await baseSemee();
    terrain = terrainDeBase(base, 'aujourdhui');
    render(<EcranAujourdhui />);
    const bouton = await screen.findByRole('button', { name: /2 réponses arbitrées/i });
    fireEvent.click(bouton);
    expect(terrain.naviguer).toHaveBeenCalledWith(VERS_SYNC);
  });

  it('au plus UNE alerte sur l’écran, même avec une op à examiner et l’alerte de l’invariant 8', async () => {
    const base = await baseSemee();
    terrain = terrainDeBase(base, 'aujourdhui');
    render(<EcranAujourdhui />);
    await screen.findByRole('button', { name: /voir la file de synchronisation/i });
    expect(screen.queryAllByRole('alert').length).toBeLessThanOrEqual(1);
  });
});
