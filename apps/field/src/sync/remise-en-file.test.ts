// =============================================================================
// TESTS DU GESTE « REMETTRE EN FILE » ET DU COMPTE D'ARBITRAGES — lot L6, L6b.
// ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis 05 §9.3 (« au 10e échec → statut “à examiner”
// visible dans l'UI (jamais de suppression silencieuse) » ; « notification
// discrète “n réponse(s) arbitrée(s)”, cliquable »), 05 §9.9 (`forbidden` :
// « jamais rejouée silencieusement »), l'invariant 7, et le cas concret qui rend
// le geste nécessaire : une restauration de sauvegarde avec une MAUVAISE DEK
// laisse des ops illisibles « à examiner » (moteur L6a, A2 du 2026-10-09) ; une
// fois la bonne clé rétablie, l'auditeur doit pouvoir les relancer.
//
// ── API ATTENDUE (pour A25) ─────────────────────────────────────────────────
// `apps/field/src/sync/port.ts` — sur `PortSyncReel` :
//   /**
//    * Remet « en attente » les ops `a_examiner` désignées de la mission ;
//    * `tentatives` → 0. Ne touche NI la charge, NI l'opId, NI clientUpdatedAt.
//    * Une op `rejetee` ou d'une autre mission est ignorée. Rend le nombre remis.
//    * Actualise ensuite l'état de la mission.
//    */
//   remettreEnFile(missionId: string, opIds: readonly string[]): Promise<number>;
// `apps/field/src/sync/moteur.ts` :
//   /** Clé `meta` du compte CUMULÉ des réponses arbitrées (`superseded`) d'une mission. */
//   export function cleReponsesArbitrees(missionId: string): string;
//   — le moteur y AJOUTE `bilan.arbitrees` à chaque passage (jamais remis à zéro
//     par un passage) : l'écran lit le local, pas un bilan éphémère.
//
// Rouge attendu tant que `remettreEnFile` et `cleReponsesArbitrees` n'existent pas.
// Traçabilité : E7, E38 ; invariants 7 et 8.
// =============================================================================
/* eslint-disable @typescript-eslint/require-await -- faux transports et faux ports : signatures asynchrones du contrat, rien à attendre. */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LotPush, ReponsePull, ReponsePush } from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta, lireMeta, type LigneOutbox } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import { cleReponsesArbitrees } from './moteur.js';
import { creerPortSync } from './port.js';
import type { ResultatTransport } from './transport.js';

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000f2de';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const SERVEUR = '2026-10-09T09:00:00.000Z';
const T0 = '2026-10-09T08:00:00.000Z';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(83));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  nomBase = `axion-test-remise-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
});

afterEach(async () => {
  base.close();
  await Dexie.delete(nomBase);
});

async function ecrireReponse(missionId: string = MISSION_A): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId,
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
      value: { type: 'number', v: 1 },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive ?',
      revision: 1,
      clientCreatedAt: T0,
    },
  });
  return id;
}

async function opDe(entiteId: string): Promise<LigneOutbox> {
  const op = (await base.outbox.toArray()).find((o) => o.entiteId === entiteId);
  if (op === undefined) throw new Error('banc : op absente');
  return op;
}

async function marquer(entiteId: string, statut: LigneOutbox['statut'], tentatives = 10) {
  const op = await opDe(entiteId);
  await base.outbox.update(op.opId, {
    statut,
    tentatives,
    derniereErreur: 'Cette opération ne se lit plus sur cet appareil (fictif).',
  });
  return op.opId;
}

function transportInerte() {
  return {
    async pousser(): Promise<ResultatTransport<ReponsePush>> {
      return { type: 'hors_ligne' };
    },
    async tirer(): Promise<ResultatTransport<ReponsePull>> {
      return { type: 'hors_ligne' };
    },
  };
}

describe('remettre en file — les ops « à examiner »', () => {
  it('@critique l’op repasse en attente, compteur à zéro ; charge, opId, entité et horodatage INTACTS', async () => {
    const id = await ecrireReponse();
    const opId = await marquer(id, 'a_examiner');
    const avant = await opDe(id);
    const port = creerPortSync({ base, coffre, transport: transportInerte() });

    const remises = await port.remettreEnFile(MISSION_A, [opId]);

    expect(remises).toBe(1);
    const apres = await opDe(id);
    expect(apres.statut).toBe('en_attente');
    expect(apres.tentatives).toBe(0);
    expect(apres.opId).toBe(avant.opId);
    expect(apres.entiteId).toBe(avant.entiteId);
    expect(apres.clientUpdatedAt).toBe(avant.clientUpdatedAt);
    expect(apres.queuedAt).toBe(avant.queuedAt);
    expect(apres.charge).toEqual(avant.charge);
    expect(await base.outbox.count()).toBe(1);
  });

  it('@critique une op REJETÉE (05 §9.9) n’est jamais remise en file', async () => {
    const id = await ecrireReponse();
    const opId = await marquer(id, 'rejetee', 0);
    const port = creerPortSync({ base, coffre, transport: transportInerte() });
    expect(await port.remettreEnFile(MISSION_A, [opId])).toBe(0);
    expect((await opDe(id)).statut).toBe('rejetee');
  });

  it('une op d’une AUTRE mission, ou inconnue, est ignorée ; rien n’est créé ni supprimé', async () => {
    const autre = await ecrireReponse(MISSION_B);
    const opAutre = await marquer(autre, 'a_examiner');
    const port = creerPortSync({ base, coffre, transport: transportInerte() });
    const avant = await base.outbox.count();
    expect(await port.remettreEnFile(MISSION_A, [opAutre, uuidv7()])).toBe(0);
    expect((await opDe(autre)).statut).toBe('a_examiner');
    expect(await base.outbox.count()).toBe(avant);
  });

  it('l’état de la mission est actualisé : les bloquées diminuent, les en-attente augmentent', async () => {
    const id = await ecrireReponse();
    const opId = await marquer(id, 'a_examiner');
    const port = creerPortSync({ base, coffre, transport: transportInerte() });
    expect((await port.actualiser(MISSION_A)).operationsBloquees).toBe(1);
    await port.remettreEnFile(MISSION_A, [opId]);
    const etat = port.etat(MISSION_A);
    expect(etat.operationsBloquees).toBe(0);
    expect(etat.operationsEnAttente).toBe(1);
  });

  it('remise en file après restauration : l’op redevient lisible et MONTE au passage suivant', async () => {
    const id = await ecrireReponse();
    const opId = await marquer(id, 'a_examiner');
    const envoyees: string[] = [];
    const transport = {
      async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
        envoyees.push(...lot.operations.map((o) => o.opId));
        return {
          type: 'ok',
          donnees: {
            serverTime: SERVEUR,
            results: lot.operations.map((o) => ({ opId: o.opId, result: 'applied' as const })),
          },
        };
      },
      async tirer(): Promise<ResultatTransport<ReponsePull>> {
        return { type: 'ok', donnees: { serverTime: SERVEUR, changes: {}, nextSince: null } };
      },
    };
    const port = creerPortSync({ base, coffre, transport });
    await port.synchroniserMaintenant(MISSION_A);
    expect(envoyees).toEqual([]); // « à examiner » : jamais envoyée d'elle-même

    await port.remettreEnFile(MISSION_A, [opId]);
    await port.synchroniserMaintenant(MISSION_A);
    expect(envoyees).toEqual([opId]);
    expect(await base.outbox.count()).toBe(0);
  });
});

describe('réponses arbitrées — le compte vit dans le local', () => {
  it('@critique chaque `superseded` est AJOUTÉ au compte de la mission, passage après passage', async () => {
    const transport = {
      async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
        return {
          type: 'ok',
          donnees: {
            serverTime: SERVEUR,
            results: lot.operations.map((o) => ({
              opId: o.opId,
              result: 'superseded' as const,
              message: 'Une version plus récente existait au siège (fictif).',
            })),
          },
        };
      },
      async tirer(): Promise<ResultatTransport<ReponsePull>> {
        return { type: 'ok', donnees: { serverTime: SERVEUR, changes: {}, nextSince: null } };
      },
    };
    const port = creerPortSync({ base, coffre, transport });
    await ecrireReponse();
    await ecrireReponse();
    await port.synchroniserMaintenant(MISSION_A);
    expect(await lireMeta(base, cleReponsesArbitrees(MISSION_A))).toBe(2);

    await ecrireReponse();
    await port.synchroniserMaintenant(MISSION_A);
    expect(await lireMeta(base, cleReponsesArbitrees(MISSION_A))).toBe(3);

    // Un passage sans arbitrage ne remet pas le compte à zéro.
    await port.synchroniserMaintenant(MISSION_A);
    expect(await lireMeta(base, cleReponsesArbitrees(MISSION_A))).toBe(3);
    expect(await lireMeta(base, cleReponsesArbitrees(MISSION_B))).toBeUndefined();
  });

  it('la clé est propre à la mission et distincte des clés déjà réservées', () => {
    expect(cleReponsesArbitrees(MISSION_A)).not.toBe(cleReponsesArbitrees(MISSION_B));
    expect(cleReponsesArbitrees(MISSION_A)).toContain(MISSION_A);
    for (const reservee of Object.values(CLES_META)) {
      expect(cleReponsesArbitrees(MISSION_A).startsWith(reservee) && reservee.endsWith(':')).toBe(
        false,
      );
    }
  });
});
