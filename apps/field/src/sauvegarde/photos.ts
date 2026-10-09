// =============================================================================
// COMPRESSION DES PHOTOS CÔTÉ CLIENT — 03 §29, correctif R2
//
// ── LA RÈGLE, MOT POUR MOT ──────────────────────────────────────────────────
// 03 §29, R2 : « redimensionnement **max 2048 px**, **qualité 85**, avant
// stockage local ; **originaux non conservés** (règle d'exploitation, divise
// stockage et sync par ~4) ».
//
// Les deux nombres sont la SPÉCIFICATION, pas un réglage : ils sont écrits tels
// quels ci-dessous, et un test les compare au texte du pack. Les « améliorer »
// serait exactement le genre de dérive que 09 §5.7 interdit.
//
// ── POURQUOI CE MODULE VIT DANS `sauvegarde/` ───────────────────────────────
// Point à trancher, donc dit plutôt que caché : le mandat L5c nomme trois
// répertoires — `ecrans/journee/`, `agenda/`, `sauvegarde/`. La compression n'est
// ni un écran ni de l'agenda ; elle appartient à ce que l'appareil GARDE et à ce
// qu'il devra ENVOYER, ce que R2 dit lui-même (« divise stockage et sync par
// ~4 »). Elle est donc rangée ici plutôt que dans un quatrième répertoire créé
// sans arbitrage. Le point est remonté au rapport d'auto-revue ; si A20 préfère
// `medias/`, le déplacement est un `git mv`.
//
// ── LA FRONTIÈRE TERRAIN/SIÈGE, ET POURQUOI CETTE EXCEPTION EST LÉGITIME ────
// `LOT_L5.md` §3.5 : « Jamais sur l'appareil : le scoring, l'agrégation, le
// DOCX, le LLM » — mais « **la compression des photos** (R2 — exception
// délibérée : elle réduit ce qu'il faudra téléverser) ». L'invariant 6 (« le
// terrain collecte, le siège produit ») n'est donc pas contourné : il est
// appliqué. Compresser AVANT de stocker réduit le quota d'un iPad et le volume
// d'un partage de connexion — deux contraintes de terrain, pas de siège.
//
// ── AUCUNE DÉPENDANCE NOUVELLE ──────────────────────────────────────────────
// `LOT_L5.md` §3.5 : « Compression sans dépendance nouvelle : `createImageBitmap`
// + `OffscreenCanvas.convertToBlob` (repli `<canvas>` si indisponible) —
// `browser-image-compression` n'est pas dans 11 §1. » Les deux chemins sont
// écrits ci-dessous ; le repli n'est pas décoratif, Safari n'a `OffscreenCanvas`
// que depuis 16.4 et 03 §22.1 désigne l'iPad comme la cible dure.
//
// ── CE QUE CE MODULE NE FAIT PAS ────────────────────────────────────────────
// Il n'écrit rien. Il transforme un fichier en un autre fichier. L'écriture de la
// pièce jointe passe par le port (`ecrireLocal`), comme tout le reste — un module
// qui compresserait ET stockerait aurait deux raisons de changer, et la seconde
// est celle qui casse.
//
// Traçabilité : E6 (hors ligne total, quota d'appareil), E7 (remontée continue —
// ce qui est compressé est ce qui remontera).
// =============================================================================

/** 03 §29 R2 — « redimensionnement max 2048 px ». Le plus grand côté. */
export const COTE_MAXIMAL_PX = 2048;

/** 03 §29 R2 — « qualité 85 ». JPEG, sur l'échelle 0-1 de `convertToBlob`. */
export const QUALITE_JPEG = 0.85;

/** Le type produit. JPEG et non WebP : lisible par tout ce qui recevra la photo. */
export const TYPE_SORTIE = 'image/jpeg';

export interface PhotoCompressee {
  readonly donnees: Blob;
  readonly largeur: number;
  readonly hauteur: number;
  /** Taille d'origine, en octets — pour dire à l'auditeur ce qui a été gagné. */
  readonly octetsAvant: number;
  readonly octetsApres: number;
  /** `true` si l'image était déjà sous la borne et n'a pas été redimensionnée. */
  readonly dejaSousLaBorne: boolean;
}

/**
 * Les dimensions cibles : le plus grand côté ramené à `COTE_MAXIMAL_PX`, le
 * rapport d'aspect conservé.
 *
 * Une image DÉJÀ plus petite n'est jamais AGRANDIE. Ce serait absurde et coûteux :
 * on fabriquerait des octets pour transporter la même information, exactement
 * l'inverse de ce que R2 vise. Fonction pure, donc réellement testable.
 */
export function dimensionsCibles(
  largeur: number,
  hauteur: number,
  coteMaximal: number = COTE_MAXIMAL_PX,
): { largeur: number; hauteur: number; redimensionnee: boolean } {
  const plusGrand = Math.max(largeur, hauteur);
  if (plusGrand <= coteMaximal || plusGrand === 0) {
    return { largeur, hauteur, redimensionnee: false };
  }
  const facteur = coteMaximal / plusGrand;
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
    redimensionnee: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LE PORT DE RENDU (L6c-1)
//
// Décoder et encoder une image exigent `createImageBitmap` et un canvas, que ni
// node ni jsdom ne fournissent : derrière un PORT, la règle R2 (dimensions,
// type, qualité, fermeture de l'image) devient testable, et le navigateur
// garde son implémentation réelle (`renduNavigateur`).
// ─────────────────────────────────────────────────────────────────────────────

/** Une image décodée, prête à être redessinée. `fermer()` libère sa mémoire graphique. */
export interface ImageDecodee {
  readonly largeur: number;
  readonly hauteur: number;
  fermer(): void;
}

export interface RenduImage {
  decoder(fichier: Blob): Promise<ImageDecodee>;
  encoder(
    image: ImageDecodee,
    largeur: number,
    hauteur: number,
    type: string,
    qualite: number,
  ): Promise<Blob>;
}

/** Le bitmap réel derrière chaque image décodée par le navigateur. */
const bitmaps = new WeakMap<ImageDecodee, ImageBitmap>();

/**
 * Le rendu, sur `OffscreenCanvas` quand il existe, sur un `<canvas>` sinon.
 *
 * Le repli n'est pas une politesse : `OffscreenCanvas.convertToBlob` n'existe sur
 * Safari que depuis 16.4, et une photo d'atelier prise sur un iPad plus ancien ne
 * doit pas échouer en silence — 03 §22.1 fait de l'iPad une cible de PREMIER
 * rang, pas un cas dégradé.
 */
async function versBlob(
  source: ImageBitmap,
  largeur: number,
  hauteur: number,
  type: string,
  qualite: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const toile = new OffscreenCanvas(largeur, hauteur);
    const contexte = toile.getContext('2d');
    if (contexte === null) {
      throw new Error('Le rendu graphique de cet appareil est indisponible.');
    }
    contexte.drawImage(source, 0, 0, largeur, hauteur);
    return toile.convertToBlob({ type, quality: qualite });
  }

  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext('2d');
  if (contexte === null) {
    throw new Error('Le rendu graphique de cet appareil est indisponible.');
  }
  contexte.drawImage(source, 0, 0, largeur, hauteur);
  return new Promise<Blob>((resoudre, rejeter) => {
    toile.toBlob(
      (blob) => {
        if (blob === null) {
          rejeter(new Error('L’image n’a pas pu être encodée sur cet appareil.'));
          return;
        }
        resoudre(blob);
      },
      type,
      qualite,
    );
  });
}

/** Le rendu réel du navigateur : `createImageBitmap` + canvas. */
export const renduNavigateur: RenduImage = {
  async decoder(fichier: Blob): Promise<ImageDecodee> {
    // L'erreur du décodeur remonte telle quelle : l'appelant la traduit pour l'écran.
    const bitmap = await createImageBitmap(fichier);
    const image: ImageDecodee = {
      largeur: bitmap.width,
      hauteur: bitmap.height,
      fermer: () => {
        bitmap.close();
      },
    };
    bitmaps.set(image, bitmap);
    return image;
  },
  encoder(image, largeur, hauteur, type, qualite): Promise<Blob> {
    const bitmap = bitmaps.get(image);
    if (bitmap === undefined) {
      return Promise.reject(new Error('L’image n’a pas pu être encodée sur cet appareil.'));
    }
    return versBlob(bitmap, largeur, hauteur, type, qualite);
  },
};

/**
 * Compresse une photo AVANT stockage local (R2).
 *
 * L'original n'est jamais rendu ni conservé : « originaux non conservés » est
 * la règle, et la seule façon de la tenir est que cette fonction ne donne pas
 * l'occasion de garder les deux.
 */
export async function compresserPhoto(
  fichier: Blob,
  coteMaximal: number = COTE_MAXIMAL_PX,
  rendu: RenduImage = renduNavigateur,
): Promise<PhotoCompressee> {
  const image = await rendu.decoder(fichier);
  try {
    const cible = dimensionsCibles(image.largeur, image.hauteur, coteMaximal);
    const donnees = await rendu.encoder(
      image,
      cible.largeur,
      cible.hauteur,
      TYPE_SORTIE,
      QUALITE_JPEG,
    );
    return {
      donnees,
      largeur: cible.largeur,
      hauteur: cible.hauteur,
      octetsAvant: fichier.size,
      octetsApres: donnees.size,
      dejaSousLaBorne: !cible.redimensionnee,
    };
  } finally {
    // Une image non fermée retient sa mémoire graphique jusqu'au ramasse-
    // miettes. Sur une journée d'observation d'atelier — plusieurs dizaines de
    // photos — c'est la différence entre une tablette qui tient et une tablette
    // qui tue l'onglet en pleine collecte.
    image.fermer();
  }
}
