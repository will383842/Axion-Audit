// =============================================================================
// TESTS DE LA COMPRESSION DERRIÈRE UN PORT DE RENDU — lot L6c-1. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6). `photos.ts` (L5c) livre déjà la partie pure
// (`dimensionsCibles`, testée par `photos.test.ts`) et la partie canvas
// (`compresserPhoto`), mais cette dernière appelle `createImageBitmap` et
// `OffscreenCanvas` en dur : elle n'est exécutable ni sous node ni sous jsdom,
// donc jamais testée. Ce fichier exige un PORT injectable.
//
// ── VALEURS — source : 03 §29, correctif R2, mot pour mot ───────────────────
// « redimensionnement max 2048 px, qualité 85, avant stockage local ; originaux
// non conservés ». Donc 2048 px de grand côté, JPEG qualité 0,85 (et non 0,8 :
// la valeur de repli du brief est écartée, le pack tranche).
//
// ── API ATTENDUE (ajout à `apps/field/src/sauvegarde/photos.ts`) ────────────
//   export interface ImageDecodee { readonly largeur: number; readonly hauteur: number; fermer(): void }
//   export interface RenduImage {
//     decoder(fichier: Blob): Promise<ImageDecodee>;
//     encoder(image: ImageDecodee, largeur: number, hauteur: number,
//             type: string, qualite: number): Promise<Blob>;
//   }
//   export const renduNavigateur: RenduImage;  // createImageBitmap + OffscreenCanvas / <canvas>
//   export function compresserPhoto(fichier: Blob, coteMaximal?: number,
//                                   rendu?: RenduImage /* défaut : renduNavigateur */)
//     : Promise<PhotoCompressee>;              // signature existante, 3e paramètre ajouté
//
// Rouge attendu tant que le port n'existe pas — pour cette seule raison.
// Traçabilité : E6 (quota d'appareil), E7.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  COTE_MAXIMAL_PX,
  QUALITE_JPEG,
  TYPE_SORTIE,
  compresserPhoto,
  renduNavigateur,
  type ImageDecodee,
  type RenduImage,
} from './photos.js';

function renduFictif(largeur: number, hauteur: number, options: { echecEncodage?: boolean } = {}) {
  const encodages: { largeur: number; hauteur: number; type: string; qualite: number }[] = [];
  let fermetures = 0;
  const rendu: RenduImage = {
    decoder: (): Promise<ImageDecodee> =>
      Promise.resolve({
        largeur,
        hauteur,
        fermer: () => {
          fermetures += 1;
        },
      }),
    encoder: (_image, l, h, type, qualite) => {
      encodages.push({ largeur: l, hauteur: h, type, qualite });
      if (options.echecEncodage === true) {
        return Promise.reject(new Error('L’image n’a pas pu être encodée sur cet appareil.'));
      }
      return Promise.resolve(new Blob([new Uint8Array(1234)], { type }));
    },
  };
  return { rendu, encodages, fermetures: () => fermetures };
}

const ORIGINAL = new Blob([new Uint8Array(4_000_000)], { type: 'image/jpeg' });

describe('compresserPhoto — à travers le port de rendu', () => {
  it('@critique 4032 × 3024 → 2048 × 1536, JPEG qualité 0,85', async () => {
    const { rendu, encodages } = renduFictif(4032, 3024);
    const photo = await compresserPhoto(ORIGINAL, COTE_MAXIMAL_PX, rendu);
    expect(encodages).toEqual([
      { largeur: 2048, hauteur: 1536, type: 'image/jpeg', qualite: 0.85 },
    ]);
    expect(photo.largeur).toBe(2048);
    expect(photo.hauteur).toBe(1536);
    expect(photo.dejaSousLaBorne).toBe(false);
    expect(photo.octetsAvant).toBe(4_000_000);
    expect(photo.octetsApres).toBe(1234);
    expect(photo.donnees.type).toBe(TYPE_SORTIE);
  });

  it('@critique une petite image (800 × 600) n’est PAS agrandie', async () => {
    const { rendu, encodages } = renduFictif(800, 600);
    const photo = await compresserPhoto(ORIGINAL, COTE_MAXIMAL_PX, rendu);
    expect(encodages[0]?.largeur).toBe(800);
    expect(encodages[0]?.hauteur).toBe(600);
    expect(photo.dejaSousLaBorne).toBe(true);
  });

  it('une photo en portrait est ramenée par sa hauteur', async () => {
    const { rendu, encodages } = renduFictif(3024, 4032);
    await compresserPhoto(ORIGINAL, COTE_MAXIMAL_PX, rendu);
    expect(encodages[0]).toMatchObject({ largeur: 1536, hauteur: 2048 });
  });

  it('les constantes sont celles du pack (03 §29 R2)', () => {
    expect(COTE_MAXIMAL_PX).toBe(2048);
    expect(QUALITE_JPEG).toBe(0.85);
  });

  it('@critique l’image décodée est fermée, même quand l’encodage échoue', async () => {
    const reussi = renduFictif(4000, 3000);
    await compresserPhoto(ORIGINAL, COTE_MAXIMAL_PX, reussi.rendu);
    expect(reussi.fermetures()).toBe(1);

    const rate = renduFictif(4000, 3000, { echecEncodage: true });
    await expect(compresserPhoto(ORIGINAL, COTE_MAXIMAL_PX, rate.rendu)).rejects.toThrow(/encodée/);
    expect(rate.fermetures()).toBe(1);
  });

  it('le rendu par défaut existe et porte les deux opérations', () => {
    expect(typeof renduNavigateur.decoder).toBe('function');
    expect(typeof renduNavigateur.encoder).toBe('function');
  });
});
