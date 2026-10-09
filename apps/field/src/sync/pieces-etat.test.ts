// =============================================================================
// TESTS — UNE PIÈCE NON ENVOYÉE COMPTE COMME UNE OP EN FILE — L6c-1, revue A29.
// ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis `DECISIONS.md` [L6c] « Revue A29 » : « une pièce
// non envoyée (`a_envoyer` ou `en_echec`) empêche la clé de dernière sync réussie
// et compte dans l'alerte des 24 h et l'état de sync », et l'invariant 8 (« aucune
// donnée ne vit sur un seul appareil > 24 h ouvrées ; alerte automatique »).
//
// ── CE QUE CES TESTS FIGENT ─────────────────────────────────────────────────
//   · moteur : la clé `cleDerniereSyncReussie(missionId)` n'est écrite que si la
//     file est vide ET qu'aucune pièce de la mission n'est `a_envoyer`/`en_echec` ;
//   · port (`actualiser`) : une pièce `a_envoyer` compte comme une op
//     `en_attente` (`operationsEnAttente`), une pièce `en_echec` comme une op
//     bloquée (`operationsBloquees`, statut `echec`) ; l'alerte des 24 h est
//     calculée sur ces comptes, EXACTEMENT comme pour une op en file.
//
// Traçabilité : E7, E38 ; invariants 1 et 8.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { instantMs } from '../local/horloge.js';
import { ecrirePieceAvecOctets, marquerStatutEnvoi } from '../local/octets.js';
import { evaluerAlerteSauvegarde } from '../local/port-sync.js';
import { creerMoteurSync } from './moteur.js';
import { creerPortSync } from './port.js';
import type { ResultatTransport } from './transport.js';
import {
  HORODATAGE_PIECES,
  MISSION_PIECES,
  creerSiegePiecesFictif,
  demandePhoto,
  octetsVaries,
  type ReglagesSiegePieces,
} from './fixtures/pieces.js';

const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const HEURE = 60 * 60 * 1000;

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(83));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
}, 20_000);

beforeEach(async () => {
  nomBase = `axion-test-pieces-etat-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
});

afterEach(async () => {
  base.close();
  await Dexie.delete(nomBase);
});

async function ecrirePhoto(): Promise<string> {
  const id = uuidv7();
  const octets = octetsVaries(2000, 13);
  await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
  return id;
}

/** Siège : la montée JSON acquitte tout ; les pièces suivent `reglages`. */
function siege(reglages: ReglagesSiegePieces = {}, avecPieces = true) {
  const pieces = creerSiegePiecesFictif(reglages);
  const pousser = (lot: LotPush): Promise<ResultatTransport<ReponsePush>> =>
    Promise.resolve({
      type: 'ok',
      donnees: {
        serverTime: HORODATAGE_PIECES,
        results: lot.operations.map((op) => ({ opId: op.opId, result: 'applied' as const })),
      },
    });
  const tirer = () => Promise.resolve({ type: 'hors_ligne' as const });
  return avecPieces ? { pousser, tirer, ...pieces.transport } : { pousser, tirer };
}

async function derniereSync(): Promise<unknown> {
  return lireMeta(base, cleDerniereSyncReussie(MISSION_PIECES));
}

// =============================================================================
describe('moteur — une pièce non envoyée EMPÊCHE la clé de dernière sync réussie', () => {
  it('anti-vacuité : photo envoyée, file vide ⇒ la clé est écrite', async () => {
    await ecrirePhoto();
    await creerMoteurSync({ base, coffre, transport: siege() }).pousser(MISSION_PIECES);
    expect(typeof (await derniereSync())).toBe('string');
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : écrire la clé dès que `outbox` est vide —
  // la photo, seule copie, est déclarée « synchronisée » et l'alerte des 24 h se
  // tait alors que l'octet n'a jamais quitté l'appareil.
  it('@critique ligne acquittée mais photo « a_envoyer » (pièces hors ligne) ⇒ AUCUNE clé', async () => {
    await ecrirePhoto();
    await creerMoteurSync({ base, coffre, transport: siege({ horsLigne: true }) }).pousser(
      MISSION_PIECES,
    );
    expect(await base.outbox.count()).toBe(0);
    expect(await derniereSync()).toBeUndefined();
  });

  it('@critique photo « en_echec » (409 sans fin) ⇒ AUCUNE clé', async () => {
    await ecrirePhoto();
    await creerMoteurSync({
      base,
      coffre,
      transport: siege({ indexPerdusToujours: [0] }),
    }).pousser(MISSION_PIECES);
    expect(await derniereSync()).toBeUndefined();
  });

  it('@critique un transport SANS routes de pièces, photo en attente ⇒ AUCUNE clé', async () => {
    await ecrirePhoto();
    await creerMoteurSync({ base, coffre, transport: siege({}, false) }).pousser(MISSION_PIECES);
    expect(await derniereSync()).toBeUndefined();
  });

  it('une clé ANCIENNE n’est pas rafraîchie tant qu’une photo attend', async () => {
    const ancienne = '2026-10-01T08:00:00.000Z';
    await ecrireMeta(base, cleDerniereSyncReussie(MISSION_PIECES), ancienne);
    await ecrirePhoto();
    await creerMoteurSync({ base, coffre, transport: siege({ horsLigne: true }) }).pousser(
      MISSION_PIECES,
    );
    expect(await derniereSync()).toBe(ancienne);
  });
});

// =============================================================================
describe('état de sync (`actualiser`) — une pièce compte comme une op', () => {
  function port() {
    return creerPortSync({ base, coffre, transport: siege() });
  }

  it('@critique une photo « a_envoyer », file vide : 1 en attente, statut « en_attente »', async () => {
    await ecrireMeta(
      base,
      cleDerniereSyncReussie(MISSION_PIECES),
      new Date(instantMs()).toISOString(),
    );
    const id = await ecrirePhoto();
    await base.outbox.clear(); // sa ligne a été acquittée
    expect(id).toBeTruthy();
    const etat = await port().actualiser(MISSION_PIECES);
    expect(etat.operationsEnAttente).toBe(1);
    expect(etat.operationsBloquees).toBe(0);
    expect(etat.statut).toBe('en_attente');
  });

  it('@critique une photo « en_echec » : 1 bloquée, statut « echec »', async () => {
    await ecrireMeta(
      base,
      cleDerniereSyncReussie(MISSION_PIECES),
      new Date(instantMs()).toISOString(),
    );
    const id = await ecrirePhoto();
    await base.outbox.clear();
    await marquerStatutEnvoi(base, id, 'en_echec');
    const etat = await port().actualiser(MISSION_PIECES);
    expect(etat.operationsBloquees).toBe(1);
    expect(etat.operationsEnAttente).toBe(0);
    expect(etat.statut).toBe('echec');
  });

  it('une photo « envoyee » ne compte pas : statut « a_jour »', async () => {
    await ecrireMeta(
      base,
      cleDerniereSyncReussie(MISSION_PIECES),
      new Date(instantMs()).toISOString(),
    );
    const id = await ecrirePhoto();
    await base.outbox.clear();
    await marquerStatutEnvoi(base, id, 'envoyee');
    const etat = await port().actualiser(MISSION_PIECES);
    expect(etat.operationsEnAttente).toBe(0);
    expect(etat.operationsBloquees).toBe(0);
    expect(etat.statut).toBe('a_jour');
  });
});

describe('alerte des 24 h — une pièce compte EXACTEMENT comme une op en file (invariant 8)', () => {
  for (const statut of ['a_envoyer', 'en_echec'] as const) {
    it(`@critique dernière sync il y a 25 h, une photo « ${statut} » seule ⇒ alerte déclenchée`, async () => {
      const derniere = new Date(instantMs() - 25 * HEURE).toISOString();
      await ecrireMeta(base, cleDerniereSyncReussie(MISSION_PIECES), derniere);
      const id = await ecrirePhoto();
      await base.outbox.clear();
      await marquerStatutEnvoi(base, id, statut);
      const etat = await creerPortSync({ base, coffre, transport: siege() }).actualiser(
        MISSION_PIECES,
      );
      expect(etat.alerte.declenchee).toBe(true);
      expect(etat.alerte).toEqual(evaluerAlerteSauvegarde(derniere, 1, instantMs()));
    });
  }

  it('@critique jamais synchronisée, une photo en attente seule ⇒ alerte déclenchée', async () => {
    await ecrirePhoto();
    await base.outbox.clear();
    const etat = await creerPortSync({ base, coffre, transport: siege() }).actualiser(
      MISSION_PIECES,
    );
    expect(etat.alerte.declenchee).toBe(true);
  });

  it('anti-vacuité : 25 h sans sync mais rien en attente (photo envoyée) ⇒ pas d’alerte', async () => {
    await ecrireMeta(
      base,
      cleDerniereSyncReussie(MISSION_PIECES),
      new Date(instantMs() - 25 * HEURE).toISOString(),
    );
    const id = await ecrirePhoto();
    await base.outbox.clear();
    await marquerStatutEnvoi(base, id, 'envoyee');
    const etat = await creerPortSync({ base, coffre, transport: siege() }).actualiser(
      MISSION_PIECES,
    );
    expect(etat.alerte.declenchee).toBe(false);
  });
});
