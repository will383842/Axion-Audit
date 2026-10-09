// =============================================================================
// GARDE « L6a-0 » — LE DERNIER SUCCÈS DE SYNC : UN ÉCRIVAIN, UN LECTEUR, UNE CLÉ.
// ÉCRITE AVANT LE CODE.
//
// Écrite par A26 (09 §5.6) depuis `LOT_L6.md` §3bis amendement A-10 et §3ter B-1/B-2,
// `DECISIONS.md` 2026-09-09 (« le dernier succès compte le push seul »), et les
// artefacts déjà livrés : `cleDerniereSyncReussie` (`local/base.ts`), son lecteur
// `construireJournee` (`agenda/jour.ts`), `appliquerDescente` (`local/ecriture.ts`),
// `evaluerAlerteSauvegarde` (`local/port-sync.ts`).
//
// Ce que la garde croise, et qu'aucun test ne croisait (c'est ce qui a rendu la
// divergence de nom invisible trois jours, tout en vert) :
//   (1) après un push ABOUTI, le moteur écrit `cleDerniereSyncReussie(missionId)`
//       — et c'est bien la valeur que `construireJournee` rend ; un pull seul
//       (`appliquerDescente`) ne l'écrit JAMAIS, pas plus qu'un push hors ligne ;
//   (2) R2 d'A29 : l'accueil (le port) et le cockpit (`construireJournee`) rendent
//       le MÊME verdict d'alerte de l'invariant 8 après un push — le port réel lit
//       `meta`, il ne passe plus `null` en dur.
//
// ── API CONSOMMÉE (définie dans moteur.test.ts et port.test.ts, pour A25) ─────
//   creerMoteurSync({ base, coffre, transport }).pousser(missionId): Promise<BilanPush>
//   creerPortSync({ base, coffre, transport }): PortSync & {
//     actualiser(missionId: string): Promise<EtatSyncMission>; }
//
// Rouge attendu tant que `moteur.ts` et `port.ts` n'existent pas — pour cette seule raison.
// Traçabilité : E38 (sauvegarde terrain, invariant 8), B6 (une source pour un fait).
// =============================================================================
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { construireJournee } from '../agenda/jour.js';
import type { LotPush, ReponsePush } from '../local/contrat-sync.js';
import {
  BaseLocale,
  CLES_META,
  cleDerniereSyncReussie,
  ecrireMeta,
  lireMeta,
} from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../local/ecriture.js';
import { reinitialiserHorloge } from '../local/horloge.js';
import { portSyncInerte } from '../local/port-sync.js';
import { creerMoteurSync } from './moteur.js';
import { creerPortSync } from './port.js';
import type { ResultatTransport, TransportSync } from './transport.js';

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const T0 = Date.parse('2026-10-09T08:15:00.000Z');
const T0_ISO = new Date(T0).toISOString();
const UNE_HEURE_MS = 60 * 60 * 1000;

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(37));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  reinitialiserHorloge();
  nomBase = `axion-test-derniere-sync-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
  await embarquerMission();
});

afterEach(async () => {
  vi.useRealTimers();
  reinitialiserHorloge();
  base.close();
  await Dexie.delete(nomBase);
});

// ─────────────────────────────────────────────────────────────────────────────
// Banc
// ─────────────────────────────────────────────────────────────────────────────
async function embarquerMission(): Promise<void> {
  await appliquerDescente({
    missionId: MISSION,
    serverTime: T0_ISO,
    prochainSince: T0_ISO,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION, status: 'collecte', clientUpdatedAt: T0_ISO, supprimeLe: null },
        charge: {
          titre: 'Mission fictive FIL-TPE',
          companyId: '0191e2a0-0000-7000-8000-00000000aa01',
          timezone: 'Europe/Paris',
          auditLevel: 'diagnostic_cadrage',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'lead',
        },
      },
    ],
  });
}

async function ecrireSession(): Promise<void> {
  await ecrireLocal({
    entite: 'interview',
    id: uuidv7(),
    missionId: MISSION,
    action: 'upsert',
    index: {
      orgUnitId: ORG_UNIT,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'planifie',
      scheduledAt: null,
    },
    charge: {
      conductedBy: AUDITEUR,
      mode: 'sur_site',
      personName: 'Interlocuteur fictif',
      personRole: null,
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
      scheduledDurationMin: null,
      startedAt: null,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: T0_ISO,
    },
  });
}

/** Siège fictif : tout est `applied`, `serverTime` = l'instant courant (horloge figée). */
const siegeQuiApplique: Pick<TransportSync, 'pousser'> = {
  // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
  async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
    return {
      type: 'ok',
      donnees: {
        serverTime: new Date(Date.now()).toISOString(),
        results: lot.operations.map((op) => ({ opId: op.opId, result: 'applied' as const })),
      },
    };
  },
};

const siegeInjoignable: Pick<TransportSync, 'pousser'> = {
  // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
  async pousser(): Promise<ResultatTransport<ReponsePush>> {
    return { type: 'hors_ligne' };
  },
};

async function etatCockpit() {
  const journee = await construireJournee(portSyncInerte, T0_ISO);
  const mission = journee.missions.find((m) => m.mission.id === MISSION);
  if (mission === undefined) throw new Error('banc : mission absente du cockpit');
  return mission.sync;
}

// =============================================================================
// (1) Un écrivain, un lecteur, une clé (A-10)
// =============================================================================
describe('L6a-0 (1) — le moteur écrit la clé que construireJournee lit', () => {
  it('avant tout push : la clé est absente et le cockpit dit « jamais »', async () => {
    expect(await lireMeta(base, cleDerniereSyncReussie(MISSION))).toBeUndefined();
    expect((await etatCockpit()).derniereSyncReussieLe).toBeNull();
  });

  it('après un push ABOUTI : cleDerniereSyncReussie(missionId) porte l’instant, et le cockpit rend CETTE valeur', async () => {
    await ecrireSession();

    const bilan = await creerMoteurSync({ base, coffre, transport: siegeQuiApplique }).pousser(
      MISSION,
    );

    expect(bilan.statut).toBe('succes');
    const valeur = await lireMeta(base, cleDerniereSyncReussie(MISSION));
    expect(typeof valeur).toBe('string');
    expect(Date.parse(valeur as string)).toBe(T0);
    expect((await etatCockpit()).derniereSyncReussieLe).toBe(valeur);
  });

  it('un pull seul (appliquerDescente) n’écrit JAMAIS la clé — même s’il fait descendre des données', async () => {
    vi.setSystemTime(T0 + UNE_HEURE_MS);
    await embarquerMission();
    await appliquerDescente({
      missionId: MISSION,
      serverTime: new Date(Date.now()).toISOString(),
      prochainSince: null,
      enregistrements: [],
    });

    expect(await lireMeta(base, cleDerniereSyncReussie(MISSION))).toBeUndefined();
    expect((await etatCockpit()).derniereSyncReussieLe).toBeNull();
  });

  it('un push qui n’aboutit pas (hors ligne) n’écrit pas la clé', async () => {
    await ecrireSession();

    await creerMoteurSync({ base, coffre, transport: siegeInjoignable }).pousser(MISSION);

    expect(await lireMeta(base, cleDerniereSyncReussie(MISSION))).toBeUndefined();
  });

  it('la clé d’une AUTRE mission n’est pas touchée par le push de celle-ci', async () => {
    const autre = '0191e2a0-0000-7000-8000-00000000f2de';
    await ecrireSession();

    await creerMoteurSync({ base, coffre, transport: siegeQuiApplique }).pousser(MISSION);

    expect(await lireMeta(base, cleDerniereSyncReussie(autre))).toBeUndefined();
  });
});

// =============================================================================
// (2) R2 d'A29 — l'accueil et le cockpit : le MÊME verdict
// =============================================================================
describe('L6a-0 (2) — non-régression R2 : accueil (port) et cockpit rendent le même verdict', () => {
  it('push réussi puis nouvelle saisie : aucun des deux n’alerte (le port ne code plus « null »)', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siegeQuiApplique });
    await port.synchroniserMaintenant(MISSION);
    await ecrireSession(); // une op en attente : c'est là que « null » en dur divergeait

    const accueil = await port.actualiser(MISSION);
    const cockpit = await etatCockpit();

    expect(cockpit.operationsEnAttente).toBe(1);
    expect(accueil.operationsEnAttente).toBe(1);
    expect(accueil.derniereSyncReussieLe).toBe(cockpit.derniereSyncReussieLe);
    expect(accueil.alerte).toEqual(cockpit.alerte);
    expect(accueil.alerte.declenchee).toBe(false);
    expect(port.etat(MISSION).alerte).toEqual(cockpit.alerte);
  });

  it('25 h plus tard, toujours une op en attente : les deux alertent, avec le même message', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siegeQuiApplique });
    await port.synchroniserMaintenant(MISSION);
    await ecrireSession();
    vi.setSystemTime(T0 + 25 * UNE_HEURE_MS);

    const accueil = await port.actualiser(MISSION);
    const cockpit = await etatCockpit();

    expect(cockpit.alerte.declenchee).toBe(true);
    expect(accueil.alerte).toEqual(cockpit.alerte);
  });

  it('jamais synchronisée, une op en attente : les deux alertent « aucune synchronisation connue »', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siegeInjoignable });

    const accueil = await port.actualiser(MISSION);
    const cockpit = await etatCockpit();

    expect(cockpit.alerte.declenchee).toBe(true);
    expect(accueil.alerte).toEqual(cockpit.alerte);
  });

  it('l’accueil n’utilise plus le port inerte (R2 : « L6a le clôt en remplaçant le port »)', () => {
    const source = readFileSync(new URL('../app/EcranAccueil.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bportSyncInerte\b/);
  });

  it('le port réel ne passe jamais « null » en dur à evaluerAlerteSauvegarde', () => {
    const source = readFileSync(new URL('./port.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/evaluerAlerteSauvegarde\(\s*null/);
  });
});

// =============================================================================
// (3) B2 (arbitrage 2026-10-09) — l'alerte compte TOUT ce qui ne vit que sur l'appareil
// =============================================================================
/** Siège fictif qui refuse chaque op (`forbidden`) : elles restent « rejetee » sur l'appareil. */
const siegeQuiRejette: Pick<TransportSync, 'pousser'> = {
  // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
  async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
    return {
      type: 'ok',
      donnees: {
        serverTime: new Date(Date.now()).toISOString(),
        results: lot.operations.map((op) => ({
          opId: op.opId,
          result: 'forbidden' as const,
          message: 'Refus fictif.',
        })),
      },
    };
  },
};

describe('L6a-0 (3) — B2 : en_attente + rejetee + a_examiner, même verdict accueil et cockpit', () => {
  it('jamais synchronisée, une seule op REJETÉE (0 en attente) : les deux alertent, à l’identique', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siegeQuiRejette });
    await port.synchroniserMaintenant(MISSION);

    const accueil = await port.actualiser(MISSION);
    const cockpit = await etatCockpit();

    expect(accueil.operationsEnAttente).toBe(0);
    expect(accueil.operationsBloquees).toBe(1);
    expect(cockpit.alerte.declenchee).toBe(true);
    expect(accueil.alerte).toEqual(cockpit.alerte);
  });

  it('dernier succès il y a 25 h, une op « a_examiner » seulement : les deux alertent, à l’identique', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siegeQuiApplique });
    await port.synchroniserMaintenant(MISSION);
    await ecrireSession();
    const [op] = await base.outbox.toArray();
    if (op === undefined) throw new Error('banc : op attendue');
    await base.outbox.update(op.opId, { statut: 'a_examiner', tentatives: 10 });
    vi.setSystemTime(T0 + 25 * UNE_HEURE_MS);

    const accueil = await port.actualiser(MISSION);
    const cockpit = await etatCockpit();

    expect(cockpit.operationsEnAttente).toBe(0);
    expect(cockpit.alerte.declenchee).toBe(true);
    expect(accueil.alerte).toEqual(cockpit.alerte);
  });

  it('tout est monté (rien en file, aucune op bloquée) : aucun des deux n’alerte', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siegeQuiApplique });
    await port.synchroniserMaintenant(MISSION);
    vi.setSystemTime(T0 + 25 * UNE_HEURE_MS);

    const accueil = await port.actualiser(MISSION);
    const cockpit = await etatCockpit();

    expect(cockpit.alerte.declenchee).toBe(false);
    expect(accueil.alerte).toEqual(cockpit.alerte);
  });
});
