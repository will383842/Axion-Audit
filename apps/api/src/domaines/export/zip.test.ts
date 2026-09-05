// =============================================================================
// TESTS DU CONTENEUR ZIP — écrits AVANT `zip.ts`. Lot L7, incrément L7c.
//
// ⚠ Tests d'A30 (CONCEPTION, TDD). Aucun `@critique` : l'acceptation du §36.3
// revient à A36 (09 §5.6, décision du 2026-09-05).
//
// ── POURQUOI CE FICHIER EXISTE PLUTÔT QU'UNE DÉPENDANCE ────────────────────
// La liste épinglée du 11 §1 ne porte aucune bibliothèque d'archive, et en
// ajouter une est une escalade (§8-1). Le conteneur est donc écrit avec
// `node:zlib` (`DECISIONS.md` 2026-09-05).
//
// ── LE TEST QUI COMPTE VRAIMENT ────────────────────────────────────────────
// Un ZIP « valide selon son propre écrivain » ne prouve RIEN. Le dernier bloc de
// ce fichier écrit l'archive sur le disque et la fait OUVRIR PAR UN OUTIL TIERS
// (le premier de `unzip`, `Expand-Archive` et `bsdtar` qui répond), puis compare les
// octets extraits. C'est la seule preuve qui vaille : le consultant ouvrira le
// ZIP avec l'Explorateur de Windows, pas avec notre code.
//
// Traçabilité : E36 (exécutable par lots avec critères).
// =============================================================================
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { construireZip, type EntreeZip } from './zip.js';

/** Signature d'un en-tête local (PK\3\4) et du répertoire central (PK\1\2). */
const SIGNATURE_LOCALE = 0x04034b50;
const SIGNATURE_CENTRALE = 0x02014b50;
const SIGNATURE_FIN = 0x06054b50;

function entree(nom: string, contenu: string): EntreeZip {
  return { nom, contenu: Buffer.from(contenu, 'utf8') };
}

describe('construireZip — la structure du format', () => {
  it('commence par la signature d’un en-tête local', () => {
    const zip = construireZip([entree('a.txt', 'bonjour')]);
    expect(zip.readUInt32LE(0)).toBe(SIGNATURE_LOCALE);
  });

  it('se termine par l’enregistrement de fin de répertoire central', () => {
    const zip = construireZip([entree('a.txt', 'bonjour')]);
    const finIndex = zip.length - 22;
    expect(zip.readUInt32LE(finIndex)).toBe(SIGNATURE_FIN);
    expect(zip.readUInt16LE(finIndex + 10)).toBe(1);
  });

  it('déclare autant d’entrées centrales que de fichiers', () => {
    const zip = construireZip([entree('a.txt', 'a'), entree('b.txt', 'b'), entree('c.txt', 'c')]);
    const finIndex = zip.length - 22;
    expect(zip.readUInt16LE(finIndex + 10)).toBe(3);
    let centrales = 0;
    for (let i = 0; i + 4 <= zip.length; i += 1) {
      if (zip.readUInt32LE(i) === SIGNATURE_CENTRALE) centrales += 1;
    }
    expect(centrales).toBe(3);
  });

  it('refuse une archive sans aucune entrée — un export vide est un défaut, pas un fichier', () => {
    expect(() => construireZip([])).toThrow();
  });

  it('refuse deux entrées de même nom : un ZIP à doublons se décompresse au hasard', () => {
    expect(() => construireZip([entree('a.txt', 'x'), entree('a.txt', 'y')])).toThrow();
  });
});

describe('construireZip — le contenu se relit', () => {
  it('restitue exactement les octets d’un fichier compressé', () => {
    const contenu = 'ligne 1\r\nligne 2\r\n'.repeat(50);
    const zip = construireZip([entree('gros.csv', contenu)]);
    const brut = extraireParLecture(zip, 'gros.csv');
    expect(brut.toString('utf8')).toBe(contenu);
  });

  it('restitue les caractères accentués — un audit français en est plein', () => {
    const contenu = 'unité;effectif\r\nDirection générale;12\r\n';
    const zip = construireZip([entree('arbre.csv', contenu)]);
    expect(extraireParLecture(zip, 'arbre.csv').toString('utf8')).toBe(contenu);
  });

  it('accepte un chemin avec dossier — `pieces_jointes/manifest.csv` du §36.3', () => {
    const zip = construireZip([entree('pieces_jointes/manifest.csv', 'id;fichier\r\n')]);
    expect(extraireParLecture(zip, 'pieces_jointes/manifest.csv').toString('utf8')).toBe(
      'id;fichier\r\n',
    );
  });

  it('stocke sans compresser quand la compression n’économise rien', () => {
    // Trois octets aléatoires : `deflate` les rend PLUS GROS. Le conteneur doit
    // alors basculer en « stocké » — sinon l'archive grossit à mesure qu'on la
    // compresse, ce qui est le contraire du but.
    const zip = construireZip([{ nom: 'x.bin', contenu: Buffer.from([1, 2, 3]) }]);
    expect(zip.readUInt16LE(8)).toBe(0);
    expect(extraireParLecture(zip, 'x.bin')).toEqual(Buffer.from([1, 2, 3]));
  });
});

/**
 * Relit une entrée en parcourant les en-têtes locaux — la lecture d'un décodeur
 * indépendant de l'écrivain, pour ne pas prouver une chose par elle-même.
 */
function extraireParLecture(zip: Buffer, nomCherche: string): Buffer {
  let position = 0;
  while (position + 30 <= zip.length && zip.readUInt32LE(position) === SIGNATURE_LOCALE) {
    const methode = zip.readUInt16LE(position + 8);
    const tailleCompressee = zip.readUInt32LE(position + 18);
    const longueurNom = zip.readUInt16LE(position + 26);
    const longueurExtra = zip.readUInt16LE(position + 28);
    const debutNom = position + 30;
    const nom = zip.subarray(debutNom, debutNom + longueurNom).toString('utf8');
    const debutDonnees = debutNom + longueurNom + longueurExtra;
    const donnees = zip.subarray(debutDonnees, debutDonnees + tailleCompressee);
    if (nom === nomCherche) return methode === 0 ? Buffer.from(donnees) : inflateRawSync(donnees);
    position = debutDonnees + tailleCompressee;
  }
  throw new Error(`entrée introuvable dans l’archive : ${nomCherche}`);
}

// -----------------------------------------------------------------------------
// LA PREUVE PAR UN OUTIL TIERS
// -----------------------------------------------------------------------------

const dossiers: string[] = [];
afterAll(() => {
  for (const dossier of dossiers) rmSync(dossier, { recursive: true, force: true });
});

/**
 * LE PREMIER DÉCOMPRESSEUR DU SYSTÈME QUI RÉPOND — et on les essaie tous.
 *
 * On ne choisit PAS l'outil d'après `process.platform` : mesuré sur la machine de
 * développement, `Expand-Archive` existe sous Windows mais son module refuse de se
 * charger, tandis qu'`unzip` (Info-ZIP, fourni avec Git) fonctionne. Un test qui
 * aurait présumé de l'outil aurait échoué en désignant l'archive, alors que
 * l'archive était bonne. On essaie donc la liste, et on ne conclut à l'échec que
 * si AUCUN n'a pu — auquel cas le test le DIT, il ne passe pas en silence.
 */
const DECOMPRESSEURS: readonly {
  readonly nom: string;
  readonly arguments: (chemin: string, destination: string) => readonly string[];
}[] = [
  { nom: 'unzip', arguments: (c, d) => ['-o', '-q', c, '-d', d] },
  {
    nom: 'powershell',
    arguments: (c, d) => [
      '-NoProfile',
      '-Command',
      `Import-Module Microsoft.PowerShell.Archive; Expand-Archive -LiteralPath '${c}' -DestinationPath '${d}' -Force`,
    ],
  },
  { nom: 'bsdtar', arguments: (c, d) => ['-xf', c, '-C', d] },
];

function extraireAvecUnOutilTiers(chemin: string, destination: string): string | null {
  for (const outil of DECOMPRESSEURS) {
    try {
      mkdirSync(destination, { recursive: true });
      execFileSync(outil.nom, [...outil.arguments(chemin, destination)], { stdio: 'pipe' });
      if (readdirSync(destination).length > 0) return outil.nom;
    } catch {
      // Outil absent ou en échec : on passe au suivant, sans rien conclure.
    }
  }
  return null;
}

describe('construireZip — un outil TIERS ouvre l’archive', () => {
  it('produit une archive que le système d’exploitation sait décompresser', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'axion-zip-'));
    dossiers.push(dossier);
    const chemin = join(dossier, 'export.zip');
    const contenuCsv = 'unité;effectif\r\nDirection générale;12\r\n';
    writeFileSync(
      chemin,
      construireZip([entree('mission.json', '{"a":1}'), entree('arbre.csv', contenuCsv)]),
    );

    const sortie = join(dossier, 'sortie');
    const outil = extraireAvecUnOutilTiers(chemin, sortie);
    // Aucun outil disponible : le test ne MENT pas en passant en silence, il dit
    // ce qu'il n'a pas pu faire. Sur la CI (ubuntu/windows), l'un des trois existe.
    if (outil === null) {
      throw new Error(
        `aucun décompresseur du système n’a ouvert l’archive (essayés : ${DECOMPRESSEURS.map((d) => d.nom).join(', ')})`,
      );
    }

    expect(readdirSync(sortie).sort()).toEqual(['arbre.csv', 'mission.json']);
    expect(readFileSync(join(sortie, 'arbre.csv'), 'utf8')).toBe(contenuCsv);
    expect(readFileSync(join(sortie, 'mission.json'), 'utf8')).toBe('{"a":1}');
  });
});
