// =============================================================================
// COMPRESSION DES PHOTOS — LE CHEMIN DE RENDU. Écrit par A27 (09 §5.6 : ni A23,
// qui a écrit `photos.ts`, ni son fichier de test de conception).
//
// ── LE TROU QUE CE FICHIER FERME, ET POURQUOI IL EXISTAIT ───────────────────
// `photos.test.ts` éprouve `dimensionsCibles`, fonction pure, et les deux
// nombres de 03 §29 R2. Il s'arrête là, et il le DIT franchement : « il ne peut
// PAS éprouver l'encodage lui-même : `createImageBitmap`, `OffscreenCanvas` et
// `canvas.toBlob` n'existent pas dans jsdom ». Résultat mesuré par A02 au
// contrôle de P-C : `sauvegarde/photos.ts` à **26,76 % de lignes, 33,33 % de
// fonctions** — c'est-à-dire que `versBlob` et `compresserPhoto`, les deux
// seules fonctions que l'application appelle réellement, ne sont atteintes par
// rien.
//
// ── CE QUI EST SIMULÉ ICI, ET CE QUI NE L'EST PAS ───────────────────────────
// **La PLATEFORME est simulée ; le module testé ne l'est jamais.** On pose
// `createImageBitmap`, `OffscreenCanvas` et les deux méthodes de `<canvas>` que
// jsdom déclare sans implémenter — exactement ce qu'un navigateur fournirait —
// puis on exécute `compresserPhoto` telle qu'elle est écrite. Un test qui aurait
// remplacé `versBlob` par un double répondrait à une autre question que celle
// posée ; ici, ce qui est mesuré, ce sont les DÉCISIONS du module :
//   · quelle voie de rendu il choisit (`OffscreenCanvas`, sinon `<canvas>`) —
//     et le repli n'est pas décoratif, Safari n'a `OffscreenCanvas` que depuis
//     16.4 alors que 03 §22.1 fait de l'iPad la cible de PREMIER rang ;
//   · quelles dimensions il donne au rendu (la borne de R2, réellement passée) ;
//   · quels type et qualité il demande à l'encodeur (2048 / 85, pas « à peu près ») ;
//   · comment il échoue quand l'appareil ne sait pas rendre — en français, avec
//     une cause, jamais en `null` silencieux ;
//   · qu'il FERME toujours l'`ImageBitmap`, y compris quand le rendu lève. Une
//     bitmap non fermée retient sa mémoire graphique : sur une journée
//     d'observation d'atelier, c'est la tablette qui tue l'onglet en pleine
//     collecte, et c'est un `finally` d'une ligne qui l'en empêche.
//
// ── CE QUI RESTE DÛ À UN APPAREIL RÉEL, ET QUE CE FICHIER N'AFFIRME PAS ─────
// L'encodage JPEG lui-même : qu'à qualité 85 le fichier soit effectivement plus
// petit (« divise stockage et sync par ~4 »), que l'image reste lisible, que
// l'orientation EXIF d'une photo d'iPad soit respectée, et que le repli
// `<canvas>` fonctionne sur un Safari < 16.4 véritable. Aucun octet n'est encodé
// ici — jsdom n'a pas de moteur de rendu. Ces quatre points partent à la
// checklist d'appareil (P-C, 07 §15) et à l'E2E, pas dans un chiffre de couverture.
//
// ── POURQUOI UN `.tsx` POUR UN MODULE SANS REACT ────────────────────────────
// Le découpage des projets vitest se fait par ENVIRONNEMENT, pas par framework :
// `unit` tourne en `node` (aucun `document`, donc aucun `<canvas>`), `interface`
// en `jsdom`. Le repli `<canvas>` a besoin d'un DOM ; ce fichier vit donc dans
// `interface`, et l'extension n'est que le laissez-passer de son `include`.
//
// Traçabilité : E6 (hors ligne total, quota d'appareil), E7 (remontée continue).
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compresserPhoto,
  COTE_MAXIMAL_PX,
  QUALITE_JPEG,
  TYPE_SORTIE,
  type PhotoCompressee,
} from './photos.js';

/** Le blob rendu par l'encodeur simulé — plus petit que l'entrée, comme R2 le vise. */
const OCTETS_RENDUS = new Uint8Array(64).fill(7);

/** Une photo d'entrée : sa TAILLE compte (`octetsAvant`), pas son contenu. */
function photoDEntree(octets = 4096): Blob {
  return new Blob([new Uint8Array(octets)], { type: 'image/heic' });
}

interface BitmapSimulee {
  readonly width: number;
  readonly height: number;
  readonly close: ReturnType<typeof vi.fn>;
}

/**
 * Pose `createImageBitmap` et rend la bitmap qu'il fabriquera — pour pouvoir
 * vérifier ensuite qu'elle a bien été FERMÉE.
 */
function poserDecodeur(largeur: number, hauteur: number): BitmapSimulee {
  const bitmap: BitmapSimulee = { width: largeur, height: hauteur, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve(bitmap as unknown as ImageBitmap)),
  );
  return bitmap;
}

interface RenduSimule {
  readonly dessins: { largeur: number; hauteur: number }[];
  readonly conversions: { type?: string; quality?: number }[];
  readonly toiles: { largeur: number; hauteur: number }[];
}

/**
 * Pose `OffscreenCanvas` — la voie moderne, celle d'un iPad à jour et d'un poste.
 * `contexteAbsent` simule un appareil dont le rendu graphique est indisponible
 * (mémoire vidéo épuisée, contexte perdu) : `getContext` rend `null`, et c'est un
 * cas RÉEL, pas une hypothèse d'école.
 */
function poserOffscreen(options: { contexteAbsent?: boolean } = {}): RenduSimule {
  const journal: RenduSimule = { dessins: [], conversions: [], toiles: [] };
  class OffscreenSimule {
    constructor(
      public largeur: number,
      public hauteur: number,
    ) {
      journal.toiles.push({ largeur, hauteur });
    }
    getContext(): unknown {
      if (options.contexteAbsent === true) return null;
      return {
        drawImage: (_source: unknown, _x: number, _y: number, l: number, h: number): void => {
          journal.dessins.push({ largeur: l, hauteur: h });
        },
      };
    }
    convertToBlob(reglages: { type?: string; quality?: number }): Promise<Blob> {
      journal.conversions.push(reglages);
      return Promise.resolve(new Blob([OCTETS_RENDUS], { type: reglages.type ?? '' }));
    }
  }
  vi.stubGlobal('OffscreenCanvas', OffscreenSimule);
  return journal;
}

/**
 * La voie de REPLI : `OffscreenCanvas` absent (Safari < 16.4), donc un vrai
 * `<canvas>` du DOM. jsdom DÉCLARE `getContext` et `toBlob` sans les implémenter
 * — on leur donne le comportement du navigateur, et rien de plus.
 */
function poserCanvasDeRepli(options: { contexteAbsent?: boolean; blobNul?: boolean }): RenduSimule {
  const journal: RenduSimule = { dessins: [], conversions: [], toiles: [] };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    if (options.contexteAbsent === true) return null;
    journal.toiles.push({ largeur: this.width, hauteur: this.height });
    return {
      drawImage: (_source: unknown, _x: number, _y: number, l: number, h: number): void => {
        journal.dessins.push({ largeur: l, hauteur: h });
      },
    } as unknown as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext);

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (rappel: BlobCallback, type?: string, qualite?: number): void => {
      journal.conversions.push({ type: type ?? '', quality: qualite ?? -1 });
      // Le rappel est asynchrone dans un navigateur ; il l'est ici aussi, sinon
      // on éprouverait un chemin que la production ne prend jamais.
      queueMicrotask(() => {
        rappel(options.blobNul === true ? null : new Blob([OCTETS_RENDUS], { type: type ?? '' }));
      });
    },
  );
  return journal;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LA VOIE MODERNE — `OffscreenCanvas`
// ─────────────────────────────────────────────────────────────────────────────
describe('compresserPhoto sur OffscreenCanvas — la voie d’un appareil à jour', () => {
  it('@critique une photo de tablette 4032×3024 est rendue à 2048×1536, en JPEG qualité 85', async () => {
    const bitmap = poserDecodeur(4032, 3024);
    const rendu = poserOffscreen();

    const resultat: PhotoCompressee = await compresserPhoto(photoDEntree(4_000_000));

    // La borne de R2 est réellement passée AU RENDU, pas seulement calculée.
    expect(rendu.toiles).toEqual([{ largeur: 2048, hauteur: 1536 }]);
    expect(rendu.dessins).toEqual([{ largeur: 2048, hauteur: 1536 }]);
    // Les deux nombres du pack arrivent tels quels à l'encodeur.
    expect(rendu.conversions).toEqual([{ type: TYPE_SORTIE, quality: QUALITE_JPEG }]);

    expect(resultat.largeur).toBe(COTE_MAXIMAL_PX);
    expect(resultat.hauteur).toBe(1536);
    expect(resultat.dejaSousLaBorne).toBe(false);
    expect(resultat.octetsAvant).toBe(4_000_000);
    expect(resultat.octetsApres).toBe(OCTETS_RENDUS.byteLength);
    expect(resultat.donnees.type).toBe(TYPE_SORTIE);

    // « Originaux non conservés » : la fonction ne rend QUE le compressé — il n'y
    // a pas d'occasion de garder les deux, et c'est la seule façon de tenir R2.
    expect(Object.keys(resultat)).not.toContain('original');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('@critique une image DÉJÀ sous la borne est rendue à sa taille, et se dit telle', async () => {
    poserDecodeur(800, 600);
    const rendu = poserOffscreen();

    const resultat = await compresserPhoto(photoDEntree());

    expect(rendu.toiles).toEqual([{ largeur: 800, hauteur: 600 }]);
    expect(resultat.dejaSousLaBorne).toBe(true);
    expect(resultat.largeur).toBe(800);
  });

  it('la borne est un PARAMÈTRE : un appelant peut serrer davantage, jamais élargir en douce', async () => {
    poserDecodeur(4032, 3024);
    const rendu = poserOffscreen();

    await compresserPhoto(photoDEntree(), 1024);

    expect(rendu.toiles).toEqual([{ largeur: 1024, hauteur: 768 }]);
  });

  it('@critique rendu graphique indisponible : refus EN FRANÇAIS, jamais un blob vide', async () => {
    const bitmap = poserDecodeur(4032, 3024);
    poserOffscreen({ contexteAbsent: true });

    await expect(compresserPhoto(photoDEntree())).rejects.toThrow(
      /le rendu graphique de cet appareil est indisponible/i,
    );
    // ET la bitmap est refermée quand même : c'est tout l'intérêt du `finally`.
    // Sans lui, chaque échec fuirait une image en mémoire graphique — et les
    // échecs arrivent en rafale quand la mémoire est déjà pleine.
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('@critique un décodage impossible (fichier qui n’est pas une image) remonte, sans fermer une bitmap inexistante', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('The source image could not be decoded'))),
    );
    poserOffscreen();

    await expect(compresserPhoto(photoDEntree())).rejects.toThrow(/could not be decoded/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LE REPLI `<canvas>` — Safari < 16.4, cible de PREMIER rang (03 §22.1)
// ─────────────────────────────────────────────────────────────────────────────
describe('compresserPhoto sur le repli <canvas> — l’iPad qui n’a pas OffscreenCanvas', () => {
  it('@critique sans OffscreenCanvas, le repli rend la MÊME chose : 2048 px, JPEG, qualité 85', async () => {
    expect(typeof OffscreenCanvas, 'le repli n’est éprouvé que si l’API moderne est absente').toBe(
      'undefined',
    );
    const bitmap = poserDecodeur(3024, 4032);
    const rendu = poserCanvasDeRepli({});

    const resultat = await compresserPhoto(photoDEntree(3_000_000));

    // Portrait : c'est la HAUTEUR, le plus grand côté, qui est ramenée à la borne.
    expect(rendu.toiles).toEqual([{ largeur: 1536, hauteur: 2048 }]);
    expect(rendu.dessins).toEqual([{ largeur: 1536, hauteur: 2048 }]);
    expect(rendu.conversions).toEqual([{ type: TYPE_SORTIE, quality: QUALITE_JPEG }]);
    expect(resultat.hauteur).toBe(COTE_MAXIMAL_PX);
    expect(resultat.octetsApres).toBe(OCTETS_RENDUS.byteLength);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('@critique repli sans contexte 2D : le même refus français que la voie moderne', async () => {
    const bitmap = poserDecodeur(2000, 1000);
    poserCanvasDeRepli({ contexteAbsent: true });

    await expect(compresserPhoto(photoDEntree())).rejects.toThrow(
      /le rendu graphique de cet appareil est indisponible/i,
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('@critique `toBlob` qui rend `null` est une ERREUR nommée, pas une photo vide stockée', async () => {
    // Le cas méchant : le navigateur répond, mais avec rien. Sans cette garde,
    // une pièce d'audit de zéro octet entrerait dans le coffre et dans l'export
    // de secours — une preuve manquante découverte au siège, trop tard.
    const bitmap = poserDecodeur(2000, 1000);
    poserCanvasDeRepli({ blobNul: true });

    await expect(compresserPhoto(photoDEntree())).rejects.toThrow(
      /l’image n’a pas pu être encodée sur cet appareil/i,
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
