// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B4** de la recette novice n°1 (A54,
// 2026-09-06) : « le rituel s'éteint sans sauvegarde ».
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION écrits par A20 avec le correctif ; l'acceptation revient
// à A27, qui tient déjà le harnais complet de cet écran (09 §5.6). Aucun n'est
// marqué `@critique`.
//
// ── CE QU'ILS TIENNENT ──────────────────────────────────────────────────────
// `CLE_DERNIER_RITUEL` était écrite quoi qu'il arrive. Un mot de passe vide ou
// faux ne produisait donc AUCUNE sauvegarde et éteignait quand même le rappel du
// cockpit, qui ne regarde que cette date. L'invariant 8 se croyait tenu — c'est
// la forme la plus dangereuse du défaut que ce dépôt traque : un garde-fou qui
// annonce plus qu'il ne fait, et qui se tait précisément le soir où il aurait dû
// parler.
//
// Le harnais est réduit à ce que le bloquant exige : une base réelle, une
// mission, une session terminée, et la lecture de `meta` après le geste. Le port
// de sync reste l'inerte réel — c'est l'état de cette version, et c'est
// justement celui où l'export est le seul filet.
//
// Traçabilité : E38 (sauvegarde terrain, invariant 8) · E26 (alertes actives).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { CLE_DERNIER_RITUEL } from '../../agenda/jour.js';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, cleEmbarquement, ecrireMeta, lireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../../local/ecriture.js';
import { EcranFinDeJournee } from './EcranFinDeJournee.js';

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

const INSTANT = '2026-09-06T12:00:00.000Z';
const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f4d1';
const UNITE_ID = '0191e2a0-0000-7000-8000-00000000c4d1';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e401';

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
let blobCourant: Blob | null = null;
let fichiersDeposes = 0;

async function baseSemee(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-b4-rituel-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });

  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_ID, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: 'Mission fictive FIL-TPE',
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
          id: UNITE_ID,
          missionId: MISSION_ID,
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
          headcount: 5,
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
  await ecrireMeta(base, cleEmbarquement(MISSION_ID), INSTANT);

  await ecrireLocal({
    entite: 'interview',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: UNITE_ID,
      kind: 'entretien',
      status: 'termine',
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
      endedAt: INSTANT,
      valideeLe: null,
      clientCreatedAt: INSTANT,
    },
  });
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
      delaiCourantMs: 60 * 60 * 1000,
      ecranMaintenuEveille: true,
      msAvantVerrouillage: () => 60 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['aujourdhui', 'finDeJournee'] },
    vue: 'finDeJournee',
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
  render(<EcranFinDeJournee />);
  await waitFor(() => {
    expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
  });
}

async function terminerLaJournee(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /terminer la journée/i }));
    await Promise.resolve();
  });
  await screen.findByRole('heading', { name: /ce qui a été fait/i }, { timeout: 30_000 });
}

beforeAll(async () => {
  kek = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(41), KDF_TEST);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      blobCourant = blob;
      return 'blob:axion-test-b4';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  HTMLAnchorElement.prototype.click = function captureDepot(this: HTMLAnchorElement) {
    if (blobCourant !== null && this.download !== '') fichiersDeposes += 1;
    blobCourant = null;
  };
}, 20_000);

beforeEach(() => {
  fichiersDeposes = 0;
});

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('B4 — la date du rituel ne s’écrit que si la sauvegarde existe', () => {
  it('mot de passe VIDE : aucun fichier, et la date n’est PAS écrite — le rappel reste actif', async () => {
    const base = await baseSemee();
    await monter(base);
    await terminerLaJournee();

    expect(fichiersDeposes).toBe(0);
    expect(await lireMeta(base, CLE_DERNIER_RITUEL)).toBeUndefined();
  }, 40_000);

  it('mot de passe vide : l’écran le DIT, en alerte, au lieu de laisser croire la journée protégée', async () => {
    const base = await baseSemee();
    await monter(base);
    await terminerLaJournee();

    const alertes = screen.getAllByRole('alert');
    expect(alertes.map((noeud) => noeud.textContent).join(' ')).toMatch(
      /n’ont quitté cet appareil d’aucune façon/i,
    );
  }, 40_000);

  it('mot de passe donné : le fichier est produit ET la date est écrite', async () => {
    const base = await baseSemee();
    await monter(base);
    fireEvent.change(screen.getByLabelText(/votre mot de passe/i), {
      target: { value: MOT_DE_PASSE },
    });
    await terminerLaJournee();

    expect(fichiersDeposes).toBe(1);
    expect(typeof (await lireMeta(base, CLE_DERNIER_RITUEL))).toBe('string');
  }, 40_000);
});
