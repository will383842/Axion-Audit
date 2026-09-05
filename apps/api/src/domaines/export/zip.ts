// =============================================================================
// LE CONTENEUR ZIP — écrit à la main, avec `node:zlib`. Lot L7, incrément L7c.
//
// ── POURQUOI PAS UNE BIBLIOTHÈQUE ──────────────────────────────────────────
// La liste épinglée du 11 §1 n'en contient aucune, et en ajouter une est une
// escalade (§8-1) que le besoin ne justifie pas : une dizaine de fichiers texte
// connus à l'avance, aucun flux, aucun chiffrement, aucune archive de plus de
// 4 Gio. Le sous-ensemble utile du format tient ici (`DECISIONS.md` 2026-09-05).
//
// ── CE QUE CE MODULE ÉCRIT, ET DANS QUEL ORDRE ─────────────────────────────
// Le format PKZIP (APPNOTE 6.3.x), version 2.0, sans Zip64 :
//   ① pour chaque entrée : en-tête local (30 o + nom) puis données ;
//   ② le RÉPERTOIRE CENTRAL : une entrée par fichier, avec son décalage ;
//   ③ l'enregistrement de fin (EOCD, 22 o).
// Les tailles sont écrites DANS l'en-tête local (pas de descripteur différé) :
// tout est en mémoire, donc tout est connu avant d'écrire — c'est ce qui rend la
// version « écrite à la main » honnête plutôt que fragile.
//
// ── DEUX CHOIX QUI ONT UNE RAISON ──────────────────────────────────────────
//   · UTF-8 déclaré par le bit 11 du drapeau général. Sans lui, un décompresseur
//     lit les noms de fichiers en CP437 ; nos noms sont ASCII aujourd'hui, mais
//     un `pieces_jointes/` accentué demain deviendrait illisible sans prévenir.
//   · Compression `deflateRaw`, SAUF si elle grossit la donnée : trois octets
//     compressés pèsent plus que trois octets bruts, et une archive qui grossit
//     en compressant est un défaut qu'on ne remarque que sur les petits fichiers.
//
// ── AUCUNE ÉCRITURE DISQUE, AUCUN CHEMIN ABSOLU ────────────────────────────
// Le module rend un `Buffer`. Les noms d'entrée sont des chemins RELATIFS,
// contrôlés : ni `..`, ni `/` de tête, ni antislash. Une archive n'est pas un
// endroit où faire confiance à un nom qui vient d'ailleurs.
//
// Traçabilité : E14 (consolidation) · E36 · E43 (aucune dépendance hors §1).
// =============================================================================
import { deflateRawSync } from 'node:zlib';

/** Un fichier de l'archive : son chemin relatif, ses octets. */
export interface EntreeZip {
  readonly nom: string;
  readonly contenu: Buffer;
}

const SIGNATURE_LOCALE = 0x04034b50;
const SIGNATURE_CENTRALE = 0x02014b50;
const SIGNATURE_FIN = 0x06054b50;

/** Version 2.0 : le minimum qui comprend `deflate`. */
const VERSION_MINIMALE = 20;

/** Bit 11 du drapeau général : les noms sont en UTF-8. */
const DRAPEAU_UTF8 = 0x0800;

const METHODE_STOCKEE = 0;
const METHODE_DEFLATE = 8;

/**
 * TABLE CRC-32 — construite une fois, au chargement du module.
 *
 * Le ZIP exige un CRC-32 par entrée (polynôme 0xEDB88320). Le calculer sans table
 * coûterait huit fois plus par octet ; la table fait 1 Kio et se construit en
 * quelques microsecondes. C'est la seule optimisation de ce fichier, et elle est
 * dans le format, pas dans notre code.
 */
const TABLE_CRC32 = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let valeur = index;
    for (let bit = 0; bit < 8; bit += 1) {
      valeur = (valeur & 1) === 1 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
    }
    table[index] = valeur >>> 0;
  }
  return table;
})();

export function crc32(octets: Buffer): number {
  let reste = 0xffffffff;
  for (const octet of octets) {
    reste = (TABLE_CRC32[(reste ^ octet) & 0xff] ?? 0) ^ (reste >>> 8);
  }
  return (reste ^ 0xffffffff) >>> 0;
}

/**
 * Un nom d'entrée acceptable : relatif, sans remontée, sans antislash.
 *
 * Le « zip slip » (une entrée nommée `../../etc/passwd`) est une attaque sur le
 * DÉCOMPRESSEUR, pas sur nous — mais produire une archive qui la contient serait
 * livrer l'attaque au client. Nos noms viennent tous de `FICHIERS_EXPORT` ; ce
 * contrôle existe pour que cela reste vrai le jour où un nom viendra d'ailleurs.
 */
function verifierLeNom(nom: string): void {
  const invalide =
    nom === '' ||
    nom.startsWith('/') ||
    nom.includes('\\') ||
    nom.split('/').some((segment) => segment === '..' || segment === '.');
  if (invalide) throw new Error(`nom d’entrée d’archive invalide : ${nom}`);
}

interface EntreePreparee {
  readonly nomOctets: Buffer;
  readonly donnees: Buffer;
  readonly methode: number;
  readonly crc: number;
  readonly tailleBrute: number;
  readonly decalage: number;
}

/**
 * Assemble le ZIP complet en mémoire.
 *
 * L'horodatage MS-DOS est figé à une valeur constante et non à « maintenant » :
 * deux exports de la MÊME mission au même état doivent produire le MÊME fichier
 * octet pour octet. Un ZIP qui change à chaque appel serait invérifiable par un
 * test, et incomparable par un auditeur qui relit deux exports successifs — la
 * date de génération, elle, est dans `mission.json`, à sa place.
 */
export function construireZip(entrees: readonly EntreeZip[]): Buffer {
  if (entrees.length === 0)
    throw new Error('une archive d’export sans aucun fichier est un défaut');

  const vus = new Set<string>();
  const morceaux: Buffer[] = [];
  const preparees: EntreePreparee[] = [];
  let decalage = 0;

  for (const { nom, contenu } of entrees) {
    verifierLeNom(nom);
    if (vus.has(nom)) throw new Error(`entrée en double dans l’archive : ${nom}`);
    vus.add(nom);

    const nomOctets = Buffer.from(nom, 'utf8');
    const compresse = contenu.length === 0 ? contenu : deflateRawSync(contenu, { level: 9 });
    const compresseUtile = compresse.length < contenu.length;
    const donnees = compresseUtile ? compresse : contenu;
    const methode = compresseUtile ? METHODE_DEFLATE : METHODE_STOCKEE;
    const crc = crc32(contenu);

    const enTete = Buffer.alloc(30);
    enTete.writeUInt32LE(SIGNATURE_LOCALE, 0);
    enTete.writeUInt16LE(VERSION_MINIMALE, 4);
    enTete.writeUInt16LE(DRAPEAU_UTF8, 6);
    enTete.writeUInt16LE(methode, 8);
    enTete.writeUInt16LE(HEURE_MSDOS, 10);
    enTete.writeUInt16LE(DATE_MSDOS, 12);
    enTete.writeUInt32LE(crc, 14);
    enTete.writeUInt32LE(donnees.length, 18);
    enTete.writeUInt32LE(contenu.length, 22);
    enTete.writeUInt16LE(nomOctets.length, 26);
    enTete.writeUInt16LE(0, 28);

    morceaux.push(enTete, nomOctets, donnees);
    preparees.push({
      nomOctets,
      donnees,
      methode,
      crc,
      tailleBrute: contenu.length,
      decalage,
    });
    decalage += enTete.length + nomOctets.length + donnees.length;
  }

  const debutCentral = decalage;
  let tailleCentrale = 0;
  for (const entree of preparees) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIGNATURE_CENTRALE, 0);
    // « Créé par » et « version minimale » sont posées à la MÊME valeur (2.0),
    // sans indicateur de système hôte : les permissions Unix ne sont pas écrites,
    // et le décompresseur applique alors ses propres droits — ce qui est ce que
    // l’on veut d’une archive de fichiers texte.
    central.writeUInt16LE(VERSION_MINIMALE, 4);
    central.writeUInt16LE(VERSION_MINIMALE, 6);
    central.writeUInt16LE(DRAPEAU_UTF8, 8);
    central.writeUInt16LE(entree.methode, 10);
    central.writeUInt16LE(HEURE_MSDOS, 12);
    central.writeUInt16LE(DATE_MSDOS, 14);
    central.writeUInt32LE(entree.crc, 16);
    central.writeUInt32LE(entree.donnees.length, 20);
    central.writeUInt32LE(entree.tailleBrute, 24);
    central.writeUInt16LE(entree.nomOctets.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(entree.decalage, 42);
    morceaux.push(central, entree.nomOctets);
    tailleCentrale += central.length + entree.nomOctets.length;
  }

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(SIGNATURE_FIN, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(preparees.length, 8);
  fin.writeUInt16LE(preparees.length, 10);
  fin.writeUInt32LE(tailleCentrale, 12);
  fin.writeUInt32LE(debutCentral, 16);
  fin.writeUInt16LE(0, 20);
  morceaux.push(fin);

  return Buffer.concat(morceaux);
}

/**
 * Horodatage MS-DOS FIGÉ — 2020-01-01, 00:00.
 *
 * Voir le commentaire de `construireZip` : la reproductibilité octet pour octet
 * vaut mieux qu'une date d'archive que personne ne lit et que `mission.json`
 * porte déjà correctement, dans le fuseau de la mission.
 */
const DATE_MSDOS = ((2020 - 1980) << 9) | (1 << 5) | 1;
const HEURE_MSDOS = 0;
