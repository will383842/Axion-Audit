// =============================================================================
// TESTS DE L'EXPORT DE SECOURS — LES OCTETS DES PHOTOS — lot L6c-1. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis l'invariant 8 (« aucune donnée ne vit sur un
// seul appareil > 24 h ouvrées » ; export de secours chiffré disponible et
// testé), 05 §9.7 (« fichier unique chiffré […] données de mission locales +
// l'outbox […] restauration intégrale, testée en recette ») et la décision
// `DECISIONS.md` [L6c] du 2026-10-09 : « les octets entrent dans l'export de
// secours ».
//
// ── CE QUE CES TESTS FIGENT ─────────────────────────────────────────────────
//   · l'export (par segments, `ecrireSauvegarde` — revue A29) emporte les octets ;
//   · dans le fichier `.axionbackup`, ils restent CHIFFRÉS : ni le binaire ni
//     son base64 n'apparaissent dans le fichier sérialisé ;
//   · `importerSauvegarde`, sur un AUTRE appareil (autre DEK), rend des octets
//     IDENTIQUES, lisibles par `lireOctetsPiece`, et la pièce reste à envoyer ;
//   · les pièces d'une autre mission ne voyagent pas.
// Aucune hypothèse sur la forme interne (`contenu.octets`, table supplémentaire,
// version de format) : seul l'aller-retour observable est exigé.
//
// Rouge attendu tant que `local/octets.ts` n'existe pas, puis tant que l'export
// n'emporte pas les octets.
// Traçabilité : E38 (sauvegarde terrain), E33 ; invariants 7 et 8.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { versBase64 } from '../local/enveloppe.js';
import { ecrirePieceAvecOctets, lireOctetsPiece, lireStatutEnvoi } from '../local/octets.js';
import {
  AUTRE_MISSION_PIECES,
  MARQUEUR_EN_CLAIR,
  MISSION_PIECES,
  demandePhoto,
  octetsMarques,
  octetsVaries,
} from '../sync/fixtures/pieces.js';
import { importerSauvegarde } from './sauvegarde.js';
import { exporterParSegments } from './fixtures/ecrivain.js';

const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';

/** Paramètres Argon2id allégés — la robustesse du KDF n'est pas l'objet ici. */
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

async function coffreNeuf(sel: number): Promise<Coffre> {
  const kek = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(sel), KDF_TEST);
  return ouvrirCoffre(kek, await creerDekEnveloppee(kek));
}

const bases: BaseLocale[] = [];

async function appareil(sel: number): Promise<{ base: BaseLocale; coffre: Coffre }> {
  const base = new BaseLocale(`axion-test-sauvegarde-octets-${uuidv7()}`);
  await base.open();
  bases.push(base);
  const coffre = await coffreNeuf(sel);
  installerContexteLocal({ base, coffre });
  return { base, coffre };
}

async function photo(octets: Uint8Array, missionId: string = MISSION_PIECES): Promise<string> {
  const id = uuidv7();
  await ecrirePieceAvecOctets(demandePhoto(id, octets, { missionId }), octets);
  return id;
}

beforeEach(() => {
  bases.length = 0;
});

afterEach(async () => {
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('export de secours — les octets des photos voyagent, chiffrés (invariant 8)', () => {
  it('@critique aller-retour sur un AUTRE appareil : octets IDENTIQUES, pièce toujours à envoyer', async () => {
    await appareil(21);
    const octets = octetsVaries(300_000, 5);
    const id = await photo(octets);
    const fichier = await exporterParSegments({
      missionId: MISSION_PIECES,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    retirerContexteLocal();

    // Le fichier traverse une clé USB : il est sérialisé puis relu.
    const relu: unknown = JSON.parse(JSON.stringify(fichier));
    const cible = await appareil(97);
    await importerSauvegarde(relu, MOT_DE_PASSE);

    const restaures = await lireOctetsPiece(cible.base, cible.coffre, id);
    expect(restaures).not.toBeNull();
    expect(restaures?.byteLength).toBe(octets.byteLength);
    expect(Array.from(restaures ?? [])).toEqual(Array.from(octets));
    expect((await cible.base.attachments.get(id))?.kind).toBe('photo');
    expect(await lireStatutEnvoi(cible.base, id)).toBe('a_envoyer');
  }, 30_000);

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : glisser les octets en base64 dans le JSON
  // EN DEHORS du contenu chiffré (« c'est déjà du binaire, pas une donnée
  // personnelle ») — une photo d'atelier, de tableau blanc ou de badge l'est.
  it('@critique dans le fichier `.axionbackup`, aucun octet de photo en clair (ni binaire, ni base64)', async () => {
    await appareil(23);
    const octets = octetsMarques(8192);
    await photo(octets);
    const fichier = await exporterParSegments({
      missionId: MISSION_PIECES,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    const serialise = JSON.stringify(fichier);
    expect(serialise).not.toContain(MARQUEUR_EN_CLAIR);
    expect(serialise).not.toContain(versBase64(octets).slice(0, 64));
  }, 30_000);

  it('@critique les octets de PLUSIEURS photos reviennent chacun à sa pièce', async () => {
    await appareil(25);
    const a = octetsVaries(5000, 1);
    const b = octetsVaries(7000, 2);
    const idA = await photo(a);
    const idB = await photo(b);
    const fichier = await exporterParSegments({
      missionId: MISSION_PIECES,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    retirerContexteLocal();
    const cible = await appareil(91);
    await importerSauvegarde(fichier, MOT_DE_PASSE);
    expect(Array.from((await lireOctetsPiece(cible.base, cible.coffre, idA)) ?? [])).toEqual(
      Array.from(a),
    );
    expect(Array.from((await lireOctetsPiece(cible.base, cible.coffre, idB)) ?? [])).toEqual(
      Array.from(b),
    );
  }, 30_000);

  it('les photos d’une AUTRE mission ne voyagent pas', async () => {
    await appareil(27);
    const autre = await photo(octetsVaries(1000, 3), AUTRE_MISSION_PIECES);
    await photo(octetsVaries(1000, 4));
    const fichier = await exporterParSegments({
      missionId: MISSION_PIECES,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    retirerContexteLocal();
    const cible = await appareil(93);
    await importerSauvegarde(fichier, MOT_DE_PASSE);
    expect(await lireOctetsPiece(cible.base, cible.coffre, autre)).toBeNull();
  }, 30_000);
});
