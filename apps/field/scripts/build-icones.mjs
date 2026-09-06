#!/usr/bin/env node
// =============================================================================
// ICÔNES DE LA PWA — PROVISOIRES, GÉNÉRÉES DEPUIS LES JETONS DE LA CHARTE
//
// ── POURQUOI CE SCRIPT EXISTE ───────────────────────────────────────────────
// Revue croisée A29, bloquant B2 : le manifeste ne déclarait AUCUNE icône. Un
// manifeste sans icône n'est pas installable ; sur iPad, l'installation « Sur
// l'écran d'accueil » est la condition de la persistance longue durée
// d'IndexedDB (03 §22.1), donc de `storage.persist()` (05 §31-2), donc de toute
// mission embarquable. L'absence d'icône n'était pas un défaut cosmétique :
// c'était l'invariant 1 qui tombait en bout de chaîne.
//
// ── PROVISOIRE, ET DIT COMME TEL ────────────────────────────────────────────
// `DECISIONS.md` 2026-09-02, « Le manifeste PWA sans icône de charte : une icône
// PROVISOIRE, tracée — ESCALADE SOUS DÉFAUT » : le DESSIN reste celui de
// Williams. Ce fichier ne fabrique qu'un aplat aux couleurs de la charte, marqué
// `"_provisoire": true` dans le manifeste. Le remplacement sera une substitution
// de fichiers, sans une ligne de code à toucher.
//
// ── AUCUNE DÉPENDANCE NOUVELLE, ET AUCUNE COULEUR EN DUR ────────────────────
// L'encodeur PNG ci-dessous tient en cinquante lignes sur `node:zlib` (module
// natif). Ajouter `sharp` ou `canvas` pour peindre deux disques serait une
// dépendance hors liste 11 §1, donc une escalade 11 §8-1 — pour un fichier
// destiné à être remplacé. Les couleurs viennent de `COULEURS_CHARTE`
// (`packages/ui`), jamais d'un littéral : invariant 4, une couleur n'a qu'UNE
// source, y compris quand elle finit en pixels.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E44 (UX/UI 2026-2027 :
// tokens, police locale).
// =============================================================================
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COULEURS_CHARTE } from '@axion/ui';

const RACINE_APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RACINE_PUBLIC = resolve(RACINE_APP, 'public');
const SORTIE = resolve(RACINE_PUBLIC, 'icones');

// --- Encodeur PNG minimal (couleur vraie + alpha, 8 bits) --------------------
const TABLE_CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const octet of octets) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function morceau(type, donnees) {
  const nom = Buffer.from(type, 'latin1');
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const controle = Buffer.alloc(4);
  controle.writeUInt32BE(crc32(Buffer.concat([nom, donnees])));
  return Buffer.concat([longueur, nom, donnees, controle]);
}

function encoderPng(largeur, hauteur, rgba) {
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // profondeur
  entete[9] = 6; // couleur vraie + alpha
  // Chaque ligne est précédée de son octet de FILTRE (0 = aucun) : c'est le
  // format qui l'exige, ce n'est pas un octet de remplissage.
  const brut = Buffer.alloc((largeur * 4 + 1) * hauteur);
  for (let y = 0; y < hauteur; y += 1) {
    brut[y * (largeur * 4 + 1)] = 0;
    rgba.copy(brut, y * (largeur * 4 + 1) + 1, y * largeur * 4, (y + 1) * largeur * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', entete),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

// --- Dessin ------------------------------------------------------------------
function versRvb(hex) {
  const c = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
}

const IVOIRE = versRvb(COULEURS_CHARTE.ivoire);
const TERRACOTTA = versRvb(COULEURS_CHARTE.terracotta);

/** Distance d'un point au segment [a, b] — sert à tracer les jambages de l'« A ». */
function distanceSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * `marge` est la part du côté laissée VIDE autour du disque.
 *
 * Pour une icône `maskable`, le système peut rogner jusqu'à 20 % de chaque bord :
 * le contenu doit tenir dans le cercle central de 80 % (« safe zone » de la
 * spécification). D'où deux tailles de marge, et non un seul fichier réutilisé.
 */
function dessiner(taille, marge) {
  const rgba = Buffer.alloc(taille * taille * 4);
  const centre = taille / 2;
  const rayon = centre * (1 - marge);
  const epaisseur = taille * 0.055;

  // L'« A » du produit, en coordonnées normalisées au disque.
  const h = rayon * 1.05;
  const sommet = [centre, centre - h * 0.5];
  const piedGauche = [centre - h * 0.42, centre + h * 0.5];
  const piedDroit = [centre + h * 0.42, centre + h * 0.5];
  const barreY = centre + h * 0.17;
  const barreX = h * 0.23;

  for (let y = 0; y < taille; y += 1) {
    for (let x = 0; x < taille; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dansDisque = Math.hypot(px - centre, py - centre) <= rayon;
      const surLettre =
        distanceSegment(px, py, sommet[0], sommet[1], piedGauche[0], piedGauche[1]) <= epaisseur ||
        distanceSegment(px, py, sommet[0], sommet[1], piedDroit[0], piedDroit[1]) <= epaisseur ||
        distanceSegment(px, py, centre - barreX, barreY, centre + barreX, barreY) <= epaisseur;

      const [r, v, b] = dansDisque && !surLettre ? TERRACOTTA : IVOIRE;
      const i = (y * taille + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = v;
      rgba[i + 2] = b;
      rgba[i + 3] = 255; // opaque : un fond transparent devient noir sur iOS.
    }
  }
  return encoderPng(taille, taille, rgba);
}

// --- Écriture ----------------------------------------------------------------
// `marge` 0,10 pour les icônes ordinaires ; 0,24 pour la `maskable`, qui doit
// survivre au rognage de 20 % décrit ci-dessus.
const FICHIERS = [
  { nom: 'icone-192.png', taille: 192, marge: 0.1 },
  { nom: 'icone-512.png', taille: 512, marge: 0.1 },
  { nom: 'icone-maskable-512.png', taille: 512, marge: 0.24 },
  // iOS ignore le manifeste pour l'icône d'accueil : il lit `apple-touch-icon`,
  // et il ne sait pas rogner — d'où une marge intermédiaire et un carré plein.
  // À LA RACINE, pas sous /icones : quand la page n'a pas encore été lue (signet,
  // partage, onglet fermé), Safari va chercher `/apple-touch-icon.png` sans
  // regarder aucune balise — c'est ce que l'E2E `pwa-servie` exige, et la CI du
  // 2026-09-02 (run 33632437526) a rougi sur un 404 à cet endroit précis.
  { nom: 'apple-touch-icon.png', taille: 180, marge: 0.12, racine: true },
];

mkdirSync(SORTIE, { recursive: true });
for (const fichier of FICHIERS) {
  const png = dessiner(fichier.taille, fichier.marge);
  writeFileSync(resolve(fichier.racine ? RACINE_PUBLIC : SORTIE, fichier.nom), png);
  console.log(
    `[icones] ${fichier.nom} — ${String(Math.round(png.length / 1024))} Kio (PROVISOIRE)`,
  );
}
