// =============================================================================
// TESTS DES OCTETS LOCAUX DES PIÈCES — lot L6c-1 « les octets ». ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) depuis 05 §9.6
// (« l'attachement porte son propre statut »), 05 §9.7 (IndexedDB chiffré au
// niveau applicatif), 05 §9.2 (toute écriture = ligne + op dans une transaction),
// 03 §29 R2 (originaux non conservés) et `LOT_L6.md` §C.3, ex-L5f absorbé.
//
// ── API ATTENDUE DE `apps/field/src/local/octets.ts` (pour l'auteur) ────────
//   export const TABLE_OCTETS = 'octetsPieces';              // table Dexie neuve, clé = id de la pièce
//   export const STATUTS_ENVOI = ['a_envoyer', 'envoyee', 'en_echec'] as const;
//   export type StatutEnvoi = (typeof STATUTS_ENVOI)[number];
//   export function ecrirePieceAvecOctets(
//     demande: DemandeEcriture<'attachment_meta'>, octets: Uint8Array): Promise<void>;
//       // contexte par `contexteLocal()`, comme `ecrireLocal` ; ligne `attachments`
//       // + octets chiffrés + op d'outbox dans UNE transaction ; statut 'a_envoyer'.
//   export function lireOctetsPiece(base, coffre, id): Promise<Uint8Array | null>;
//   export function lireStatutEnvoi(base, id): Promise<StatutEnvoi | null>;
//   export function marquerStatutEnvoi(base, id, statut: StatutEnvoi): Promise<void>;
// Et dans `base.ts` : une étape `SCHEMA_LOCAL` version 2 qui AJOUTE la table
// `octetsPieces` (index suggéré : 'id, missionId, statutEnvoi') sans toucher
// aux neuf tables de la v1.
//
// Rouge attendu tant que `octets.ts` n'existe pas — pour cette seule raison.
// Traçabilité : E6 (hors ligne total), E33 (sécurité locale), invariants 1, 7, 8.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BaseLocale, SCHEMA_LOCAL, VERSION_SCHEMA_LOCAL } from './base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from './coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './contexte.js';
import { ecrireLocal } from './ecriture.js';
import { estEnveloppe, versBase64, type Enveloppe } from './enveloppe.js';
import {
  STATUTS_ENVOI,
  TABLE_OCTETS,
  ecrirePieceAvecOctets,
  lireOctetsPiece,
  lireStatutEnvoi,
  marquerStatutEnvoi,
} from './octets.js';
import {
  MARQUEUR_EN_CLAIR,
  MISSION_PIECES,
  demandePhoto,
  octetsMarques,
  octetsVaries,
} from '../sync/fixtures/pieces.js';

let kek: CryptoKey;
let dekEnveloppee: Enveloppe;
let coffre: Coffre;
const nomsOuverts: string[] = [];
const basesOuvertes: Dexie[] = [];

function nomUnique(): string {
  const nom = `axion-test-octets-${uuidv7()}`;
  nomsOuverts.push(nom);
  return nom;
}

async function nouvelleBase(nom: string = nomUnique()): Promise<BaseLocale> {
  const base = new BaseLocale(nom);
  await base.open();
  basesOuvertes.push(base);
  coffre = await ouvrirCoffre(kek, dekEnveloppee);
  installerContexteLocal({ base, coffre });
  return base;
}

/** Même mécanique que `ecriture.test.ts` : panne de mutation par middleware DBCore. */
async function injecterPanne(base: Dexie, tableCible: string): Promise<void> {
  base.close();
  base.use({
    stack: 'dbcore',
    name: `panne-${tableCible}`,
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        if (nomTable !== tableCible) return table;
        return {
          ...table,
          mutate: () => Promise.reject(new Error(`panne injectée sur « ${nomTable} »`)),
        };
      },
    }),
  });
  await base.open();
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(61));
  dekEnveloppee = await creerDekEnveloppee(kek);
}, 20_000);

afterEach(async () => {
  retirerContexteLocal();
  for (const base of basesOuvertes.splice(0)) base.close();
  for (const nom of nomsOuverts.splice(0)) await Dexie.delete(nom);
});

// =============================================================================
// A. Le schéma : une version de plus, rien de perdu
// =============================================================================
describe('schéma local v2 — la table des octets (ex-L5f)', () => {
  it('@critique la version de schéma monte d’un cran et déclare la table des octets', () => {
    expect(VERSION_SCHEMA_LOCAL).toBe(2);
    const v2 = SCHEMA_LOCAL.find((etape) => etape.version === 2);
    expect(v2).toBeDefined();
    expect(Object.keys(v2?.tables ?? {})).toContain(TABLE_OCTETS);
  });

  it('la base ouverte expose la table des octets, à côté des neuf tables de la v1', async () => {
    const base = await nouvelleBase();
    const noms = base.tables.map((t) => t.name);
    expect(noms).toContain(TABLE_OCTETS);
    for (const nom of Object.keys(SCHEMA_LOCAL[0]?.tables ?? {})) expect(noms).toContain(nom);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une v2 qui redéclare `attachments` ou
  // `outbox` avec une clé différente (Dexie refuse, ou vide la table) ; une
  // v2 qui passe une table à `null`.
  it('@critique une base v1 PEUPLÉE rouvre en v2 sans perdre une ligne ni une op', async () => {
    const nom = nomUnique();
    const v1 = new Dexie(nom);
    v1.version(1).stores({ ...(SCHEMA_LOCAL[0]?.tables ?? {}) });
    await v1.open();
    // La base v1 est peuplée PAR LE PORT, avec un contexte branché sur une
    // BaseLocale v1 simulée : on passe par Dexie directement pour ne dépendre
    // d'aucune fonction de la v2.
    const enveloppe = await (await ouvrirCoffre(kek, dekEnveloppee)).chiffrer({ note: 'v1' });
    for (let i = 0; i < 25; i += 1) {
      await v1.table('attachments').put({
        id: `0191e2a0-0000-7000-8000-${String(i).padStart(12, '0')}`,
        missionId: MISSION_PIECES,
        interviewId: null,
        answerId: null,
        kind: 'note',
        clientUpdatedAt: '2026-10-09T08:00:00.000Z',
        supprimeLe: null,
        charge: enveloppe,
      });
      await v1.table('outbox').add({
        opId: uuidv7(),
        missionId: MISSION_PIECES,
        entite: 'attachment_meta',
        entiteId: `0191e2a0-0000-7000-8000-${String(i).padStart(12, '0')}`,
        action: 'upsert',
        clientUpdatedAt: '2026-10-09T08:00:00.000Z',
        queuedAt: '2026-10-09T08:00:00.000Z',
        statut: 'en_attente',
        tentatives: 0,
        derniereErreur: null,
        charge: enveloppe,
      });
    }
    const opsAvant = await v1.table('outbox').toArray();
    v1.close();

    const base = await nouvelleBase(nom);
    expect(base.verno).toBe(2);
    expect(await base.attachments.count()).toBe(25);
    expect(await base.outbox.toArray()).toEqual(opsAvant);
    expect(await base.table(TABLE_OCTETS).count()).toBe(0);
  });
});

// =============================================================================
// B. Chiffrement : jamais un octet en clair dans IndexedDB
// =============================================================================
describe('ecrirePieceAvecOctets — octets chiffrés par l’enveloppe du coffre', () => {
  it('@critique aller-retour : les octets relus sont EXACTEMENT ceux écrits', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    const octets = octetsVaries(300_000);
    await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
    const relus = await lireOctetsPiece(base, coffre, id);
    expect(relus).not.toBeNull();
    expect(Array.from(relus ?? [])).toEqual(Array.from(octets));
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `put({ id, octets })` (Uint8Array en clair),
  // ou un Blob rangé tel quel — IndexedDB l'accepte sans broncher.
  it('@critique la ligne stockée ne contient AUCUN octet en clair (ni binaire, ni base64)', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    const octets = octetsMarques(4096);
    await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);

    const ligne = (await base.table(TABLE_OCTETS).get(id)) as Record<string, unknown> | undefined;
    expect(ligne).toBeDefined();
    const valeurs = Object.values(ligne ?? {});
    for (const v of valeurs) {
      expect(v instanceof Uint8Array || v instanceof ArrayBuffer || v instanceof Blob).toBe(false);
    }
    expect(valeurs.some((v) => estEnveloppe(v))).toBe(true);
    const serialisee = JSON.stringify(ligne);
    expect(serialisee).not.toContain(MARQUEUR_EN_CLAIR);
    expect(serialisee).not.toContain(versBase64(octets).slice(0, 64));
  });

  it('la ligne `attachments` est de kind « photo » et sa charge est chiffrée', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    const octets = octetsVaries(1000);
    await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
    const ligne = await base.attachments.get(id);
    expect(ligne?.kind).toBe('photo');
    expect(estEnveloppe(ligne?.charge)).toBe(true);
  });

  it('l’op d’outbox est une création de `attachment_meta` sur l’id de la pièce', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    const octets = octetsVaries(1000);
    await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
    const ops = await base.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.entite).toBe('attachment_meta');
    expect(ops[0]?.entiteId).toBe(id);
    expect(ops[0]?.statut).toBe('en_attente');
  });

  it('une pièce inconnue se lit `null`, jamais une exception ni un tableau vide', async () => {
    const base = await nouvelleBase();
    expect(await lireOctetsPiece(base, coffre, uuidv7())).toBeNull();
    expect(await lireStatutEnvoi(base, uuidv7())).toBeNull();
  });
});

// =============================================================================
// C. Atomicité : ligne + octets + op, ou rien
// =============================================================================
describe('ecrirePieceAvecOctets — UNE transaction (05 §9.2, comme `ecrireLocal`)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `await ecrireLocal(...)` PUIS
  // `await octets.put(...)` — la pièce part au siège sans octets, et le siège
  // attend une photo qui n'existe nulle part (invariant 7).
  for (const tableEnPanne of ['outbox', 'attachments', 'octetsPieces']) {
    it(`@critique panne sur « ${tableEnPanne} » ⇒ ni ligne, ni octets, ni op`, async () => {
      const base = await nouvelleBase();
      await injecterPanne(base, tableEnPanne === 'octetsPieces' ? TABLE_OCTETS : tableEnPanne);
      const id = uuidv7();
      const octets = octetsVaries(2048);
      await expect(ecrirePieceAvecOctets(demandePhoto(id, octets), octets)).rejects.toThrow();
      expect(await base.attachments.count()).toBe(0);
      expect(await base.outbox.count()).toBe(0);
      expect(await base.table(TABLE_OCTETS).count()).toBe(0);
    });
  }

  it('n’écrit rien sans contexte local (application verrouillée)', async () => {
    const base = await nouvelleBase();
    retirerContexteLocal();
    const octets = octetsVaries(10);
    await expect(ecrirePieceAvecOctets(demandePhoto(uuidv7(), octets), octets)).rejects.toThrow(
      /verrouillée/,
    );
    expect(await base.attachments.count()).toBe(0);
  });

  it('cohabite avec le port ordinaire : une note volante n’a pas d’octets', async () => {
    const base = await nouvelleBase();
    await ecrireLocal({
      ...demandePhoto(uuidv7(), new Uint8Array()),
      index: { interviewId: null, answerId: null, kind: 'note' },
    });
    expect(await base.table(TABLE_OCTETS).count()).toBe(0);
  });
});

// =============================================================================
// D. Le statut d'envoi local : il survit à un redémarrage
// =============================================================================
describe('statut d’envoi de la pièce (05 §9.6 : « l’attachement porte son propre statut »)', () => {
  it('les trois statuts sont nommés en français, dans cet ordre', () => {
    expect(STATUTS_ENVOI).toEqual(['a_envoyer', 'envoyee', 'en_echec']);
  });

  it('une pièce neuve est « à envoyer »', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    const octets = octetsVaries(10);
    await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
    expect(await lireStatutEnvoi(base, id)).toBe('a_envoyer');
  });

  it('@critique le statut écrit survit à la fermeture et à la réouverture de la base', async () => {
    const nom = nomUnique();
    const base = await nouvelleBase(nom);
    const id = uuidv7();
    const octets = octetsVaries(10);
    await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
    await marquerStatutEnvoi(base, id, 'en_echec');
    base.close();

    const rouverte = await nouvelleBase(nom);
    expect(await lireStatutEnvoi(rouverte, id)).toBe('en_echec');
    await marquerStatutEnvoi(rouverte, id, 'envoyee');
    expect(await lireStatutEnvoi(rouverte, id)).toBe('envoyee');
  });

  // Invariant 7 : un envoi réussi ne vaut pas effacement. La purge locale est
  // « décharger la mission » (05 §9.7), jamais un effet de bord de l'envoi.
  it('@critique marquer « envoyée » ne supprime NI les octets NI la ligne', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    const octets = octetsVaries(512);
    await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
    await marquerStatutEnvoi(base, id, 'envoyee');
    expect(Array.from((await lireOctetsPiece(base, coffre, id)) ?? [])).toEqual(Array.from(octets));
    expect(await base.attachments.get(id)).toBeDefined();
  });
});
