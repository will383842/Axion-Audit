// =============================================================================
// TESTS DE LA CRÉATION D'UNE PHOTO LOCALE — lot L6c-1 (ex-L5f). ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis 03 §29 R2 (compression AVANT stockage local,
// originaux non conservés), 05 §9.6 et 05 §9.2. C'est le chaînon entre la
// capture (le champ fichier du panneau de notes) et le stockage chiffré :
// compresser → écrire ligne + octets + op dans une transaction.
//
// ── API ATTENDUE DE `apps/field/src/session/photos-locales.ts` ──────────────
//   export interface DemandePhotoLocale {
//     readonly missionId: string;
//     readonly interviewId: string | null;
//     readonly answerId: string | null;
//     readonly createdBy: string;
//     readonly fichier: Blob;            // le File du champ <input type="file">
//   }
//   export function creerPhotoLocale(demande: DemandePhotoLocale,
//                                    rendu?: RenduImage /* sauvegarde/photos.ts */)
//     : Promise<string>;                 // l'id (UUID v7) de la pièce créée
//   · un fichier qui n'est pas une image → erreur en français, RIEN d'écrit.
//
// Rouge attendu tant que le module n'existe pas — pour cette seule raison.
// Traçabilité : E6, E7 ; invariants 1 (UUID v7 client) et 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { chargeAttachmentSchema } from '../local/formes.js';
import { TABLE_OCTETS, lireOctetsPiece, lireStatutEnvoi } from '../local/octets.js';
import type { RenduImage } from '../sauvegarde/photos.js';
import { creerPhotoLocale } from './photos-locales.js';
import {
  AUDITEUR_PIECES,
  MISSION_PIECES,
  octetsMarques,
  octetsVaries,
} from '../sync/fixtures/pieces.js';

const SESSION = '0191e2a0-0000-7000-8000-00000000a001';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Ce que l'encodeur fictif rend : des octets reconnaissables, DIFFÉRENTS de l'original. */
const COMPRESSES = octetsVaries(2345, 11);

function renduFictif(largeur = 4032, hauteur = 3024): RenduImage {
  return {
    decoder: () => Promise.resolve({ largeur, hauteur, fermer: () => undefined }),
    encoder: (_image, _l, _h, type) => Promise.resolve(new Blob([COMPRESSES], { type })),
  };
}

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;
let kek: CryptoKey;
let dek: Awaited<ReturnType<typeof creerDekEnveloppee>>;

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(79));
  dek = await creerDekEnveloppee(kek);
}, 20_000);

beforeEach(async () => {
  nomBase = `axion-test-photos-locales-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  coffre = await ouvrirCoffre(kek, dek);
  installerContexteLocal({ base, coffre });
});

afterEach(async () => {
  retirerContexteLocal();
  base.close();
  await Dexie.delete(nomBase);
});

function demande(fichier: Blob) {
  return {
    missionId: MISSION_PIECES,
    interviewId: SESSION,
    answerId: null,
    createdBy: AUDITEUR_PIECES,
    fichier,
  };
}

describe('creerPhotoLocale — compresser, puis écrire ligne + octets + op', () => {
  it('@critique crée une pièce « photo » d’id UUID v7, rattachée à la session', async () => {
    const original = new File([octetsMarques(50_000)], 'IMG_0001.HEIC', { type: 'image/jpeg' });
    const id = await creerPhotoLocale(demande(original), renduFictif());
    expect(id).toMatch(UUID_V7);
    const ligne = await base.attachments.get(id);
    expect(ligne).toMatchObject({ kind: 'photo', interviewId: SESSION, missionId: MISSION_PIECES });
    const ops = await base.outbox.toArray();
    expect(ops.map((o) => [o.entite, o.entiteId])).toEqual([['attachment_meta', id]]);
    expect(await lireStatutEnvoi(base, id)).toBe('a_envoyer');
  });

  it('@critique les octets stockés sont ceux COMPRESSÉS ; l’original n’est pas conservé (R2)', async () => {
    const original = new File([octetsMarques(50_000)], 'photo.jpg', { type: 'image/jpeg' });
    const id = await creerPhotoLocale(demande(original), renduFictif());
    expect(Array.from((await lireOctetsPiece(base, coffre, id)) ?? [])).toEqual(
      Array.from(COMPRESSES),
    );
    expect(await base.table(TABLE_OCTETS).count()).toBe(1);
  });

  it('la charge chiffrée dit le type et la taille APRÈS compression, sans contenu texte', async () => {
    const original = new File([octetsMarques(50_000)], 'photo.jpg', { type: 'image/jpeg' });
    const id = await creerPhotoLocale(demande(original), renduFictif());
    const ligne = await base.attachments.get(id);
    if (ligne === undefined) throw new Error('ligne absente');
    const charge = await coffre.dechiffrer(ligne.charge, chargeAttachmentSchema);
    expect(charge.mime).toBe('image/jpeg');
    expect(charge.sizeBytes).toBe(COMPRESSES.byteLength);
    expect(charge.content).toBeNull();
    expect(charge.createdBy).toBe(AUDITEUR_PIECES);
  });

  it('@critique un fichier qui n’est pas une image : erreur en français, RIEN d’écrit', async () => {
    const texte = new File(['bonjour'], 'notes.txt', { type: 'text/plain' });
    await expect(creerPhotoLocale(demande(texte), renduFictif())).rejects.toThrow(/image|photo/i);
    expect(await base.attachments.count()).toBe(0);
    expect(await base.outbox.count()).toBe(0);
    expect(await base.table(TABLE_OCTETS).count()).toBe(0);
  });

  it('un décodage impossible (image corrompue) : rien d’écrit', async () => {
    const rendu: RenduImage = {
      decoder: () => Promise.reject(new Error('Cette image ne peut pas être lue.')),
      encoder: () => Promise.reject(new Error('non appelé')),
    };
    const fichier = new File([octetsVaries(10)], 'x.jpg', { type: 'image/jpeg' });
    await expect(creerPhotoLocale(demande(fichier), rendu)).rejects.toThrow();
    expect(await base.attachments.count()).toBe(0);
    expect(await base.outbox.count()).toBe(0);
  });
});

// `DECISIONS.md` [L6c] (2026-10-09) : « le champ photo d'une question sans
// réponse reste actif, la pièce est rattachée à la session seule ».
describe('creerPhotoLocale — question sans réponse : rattachée à la session seule', () => {
  it('@critique sans réponse : interviewId posé, answerId NUL, sur la ligne ET dans l’op', async () => {
    const fichier = new File([octetsVaries(4000, 9)], 'poste.jpg', { type: 'image/jpeg' });
    const id = await creerPhotoLocale({ ...demande(fichier), answerId: null }, renduFictif());
    const ligne = await base.attachments.get(id);
    expect(ligne?.interviewId).toBe(SESSION);
    expect(ligne?.answerId).toBeNull();
    const [op] = await base.outbox.toArray();
    if (op === undefined) throw new Error('op absente');
    const charge = await coffre.dechiffrer(op.charge, chargeAttachmentSchema.loose());
    expect((charge as Record<string, unknown>).interviewId).toBe(SESSION);
    expect((charge as Record<string, unknown>).answerId).toBeNull();
  });

  it('avec une réponse : la pièce porte son answerId (le rattachement n’est pas perdu)', async () => {
    const REPONSE = '0191e2a0-0000-7000-8000-00000000b0a1';
    const fichier = new File([octetsVaries(4000, 8)], 'poste.jpg', { type: 'image/jpeg' });
    const id = await creerPhotoLocale({ ...demande(fichier), answerId: REPONSE }, renduFictif());
    expect((await base.attachments.get(id))?.answerId).toBe(REPONSE);
  });
});
