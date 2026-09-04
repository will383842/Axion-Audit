// =============================================================================
// COMPRESSION DES PHOTOS (R2) — lot L5, incrément L5c. Écrit par A23.
//
// ── CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PEUT PAS PROUVER ───────────────
// Il éprouve la RÈGLE DE DIMENSIONNEMENT (03 §29 R2 : « max 2048 px »), qui est
// une fonction pure, et il vérifie que les deux constantes du module sont bien
// celles du pack — 2048 et 85, pas « à peu près ».
//
// Il ne peut PAS éprouver l'encodage lui-même : `createImageBitmap`,
// `OffscreenCanvas` et `canvas.toBlob` n'existent pas dans `jsdom` (aucun moteur
// de rendu). Le dire ici plutôt que de fabriquer un faux qui rendrait le test
// vert sans rien mesurer : un test qui simule le composant qu'il teste répond à
// une autre question que celle posée. **L'encodage réel se vérifie en E2E**
// (Playwright, navigateur véritable) et à la recette d'appareils d'A27 — c'est
// aussi le seul endroit où le repli `<canvas>` de Safari < 16.4 a un sens.
//
// Traçabilité : E6 (hors ligne total, quota d'appareil).
// =============================================================================
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COTE_MAXIMAL_PX, dimensionsCibles, QUALITE_JPEG, TYPE_SORTIE } from './photos.js';

describe('les deux nombres de R2 sont ceux du pack, pas des réglages', () => {
  it('@critique 2048 px et qualité 85 sont écrits tels quels dans 03 §29', () => {
    const pack = readFileSync('docs/03_MODULES_FONCTIONNELS.md', 'utf8');
    const ligneR2 = pack.split('\n').find((ligne) => ligne.includes('R2 — Compression des photos'));

    expect(ligneR2).toBeDefined();
    expect(ligneR2).toContain('2048');
    expect(ligneR2).toContain('85');
    expect(COTE_MAXIMAL_PX).toBe(2048);
    // Le pack écrit « qualité 85 » sur l'échelle 0-100 ; `convertToBlob` prend
    // l'échelle 0-1. La conversion est ici, à UN endroit, et elle est vérifiée.
    expect(QUALITE_JPEG * 100).toBe(85);
  });

  it('le format produit est JPEG — lisible partout où la photo ira', () => {
    expect(TYPE_SORTIE).toBe('image/jpeg');
  });
});

describe('dimensionsCibles — le plus grand côté ramené à la borne, ratio conservé', () => {
  it('@critique une photo de tablette en paysage est ramenée à 2048 de large', () => {
    expect(dimensionsCibles(4032, 3024)).toEqual({
      largeur: 2048,
      hauteur: 1536,
      redimensionnee: true,
    });
  });

  it('@critique une photo en PORTRAIT est ramenée par sa HAUTEUR — le plus grand côté', () => {
    expect(dimensionsCibles(3024, 4032)).toEqual({
      largeur: 1536,
      hauteur: 2048,
      redimensionnee: true,
    });
  });

  it('@critique une image DÉJÀ sous la borne n’est jamais AGRANDIE', () => {
    expect(dimensionsCibles(800, 600)).toEqual({
      largeur: 800,
      hauteur: 600,
      redimensionnee: false,
    });
  });

  it('une image exactement à la borne n’est pas retouchée', () => {
    expect(dimensionsCibles(2048, 1000).redimensionnee).toBe(false);
  });

  it('une image très allongée garde au moins un pixel de côté court', () => {
    const cible = dimensionsCibles(20_000, 3);
    expect(cible.largeur).toBe(2048);
    expect(cible.hauteur).toBeGreaterThanOrEqual(1);
  });

  it('une image de taille nulle ne provoque ni division par zéro ni NaN', () => {
    const cible = dimensionsCibles(0, 0);
    expect(cible).toEqual({ largeur: 0, hauteur: 0, redimensionnee: false });
  });

  it('le rapport d’aspect est conservé à moins d’un pixel près', () => {
    const cible = dimensionsCibles(3000, 1997);
    expect(Math.abs(cible.largeur / cible.hauteur - 3000 / 1997)).toBeLessThan(0.01);
  });
});
