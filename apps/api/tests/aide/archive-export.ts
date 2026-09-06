// =============================================================================
// LECTEUR D'ARCHIVE D'EXPORT — un MOTEUR, pas un test. Lot L7, incrément L7c.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI CE FICHIER EXISTE : UN BALAYAGE SUR UN ZIP EST UN VERT AVEUGLE
// ═══════════════════════════════════════════════════════════════════════════════
// Le balayage sentinelle (`aide/sentinelle-financiere.ts`) cherche des montants
// improbables DANS LE CORPS des réponses, lu comme du texte. Le corps de
// `GET /v1/missions/:id/export` est un ZIP **compressé** : une sentinelle qui
// fuirait dans `reponses.csv` n'y apparaîtrait sous aucune forme lisible, et le
// balayage serait VERT — vert parce qu'il n'a rien pu lire, pas parce que rien ne
// fuit. C'est exactement la famille de garde-fou que ce dépôt traque.
//
// Ce module rend donc l'archive LISIBLE : `lireArchiveExport(octets)` rend un
// dictionnaire `nom de fichier → texte`, sur lequel les assertions d'A36
// s'écrivent comme sur n'importe quel corps de réponse.
//
// ── IL N'AFFIRME RIEN ──────────────────────────────────────────────────────
// Aucun `expect`, aucun `it` : les assertions vivent dans les fichiers de tests
// (09 §5.6). Ce fichier peut donc être écrit par l'agent du lot sans que
// quiconque teste son propre code — même partage que la sentinelle financière.
//
// ── IL NE PARTAGE AUCUN CODE AVEC L'ÉCRIVAIN ──────────────────────────────
// Il décode le format ZIP à partir de sa SPÉCIFICATION (en-têtes locaux,
// `inflateRaw`), sans importer une ligne de `domaines/export/zip.ts`. Une archive
// « valide selon son propre écrivain » ne prouverait rien ; ici, l'écrivain et le
// lecteur ne se connaissent pas.
//
// Traçabilité : E21 (auditeurs jamais d'accès aux montants) · E36.
// =============================================================================
import { inflateRawSync } from 'node:zlib';

const SIGNATURE_LOCALE = 0x04034b50;
const METHODE_STOCKEE = 0;

/** Une archive lue : le nom de chaque entrée, et ses octets. */
export type ArchiveLue = ReadonlyMap<string, Buffer>;

/**
 * Lit un ZIP en parcourant ses en-têtes locaux.
 *
 * Suffisant pour ce que produit l'export : pas de Zip64, pas de descripteur de
 * données différé, pas de chiffrement. Toute autre archive lèverait — ce qui est
 * la bonne réaction dans un test : une archive qu'on ne sait pas lire n'est pas
 * une archive qu'on peut déclarer conforme.
 */
export function lireArchiveExport(octets: Buffer): ArchiveLue {
  const entrees = new Map<string, Buffer>();
  let position = 0;

  while (position + 30 <= octets.length && octets.readUInt32LE(position) === SIGNATURE_LOCALE) {
    const methode = octets.readUInt16LE(position + 8);
    const tailleCompressee = octets.readUInt32LE(position + 18);
    const longueurNom = octets.readUInt16LE(position + 26);
    const longueurExtra = octets.readUInt16LE(position + 28);
    const debutNom = position + 30;
    const nom = octets.subarray(debutNom, debutNom + longueurNom).toString('utf8');
    const debutDonnees = debutNom + longueurNom + longueurExtra;
    const donnees = octets.subarray(debutDonnees, debutDonnees + tailleCompressee);

    if (methode !== METHODE_STOCKEE && methode !== 8) {
      throw new Error(
        `méthode de compression non gérée par le lecteur de test : ${String(methode)}`,
      );
    }
    entrees.set(nom, methode === METHODE_STOCKEE ? Buffer.from(donnees) : inflateRawSync(donnees));
    position = debutDonnees + tailleCompressee;
  }

  if (entrees.size === 0) throw new Error('l’archive ne contient aucune entrée lisible');
  return entrees;
}

/**
 * Le texte d'un fichier de l'archive, **BOM retiré**.
 *
 * Le BOM est imposé par le §36.3 (Excel FR) ; il est vérifié à part, sur les
 * octets, par le test qui s'y intéresse. Le retirer ici évite qu'il ne pollue
 * chaque comparaison de première cellule.
 */
export function texteDuFichier(archive: ArchiveLue, nom: string): string {
  const octets = archive.get(nom);
  if (octets === undefined) {
    throw new Error(
      `fichier absent de l’archive : ${nom} (présents : ${[...archive.keys()].join(', ')})`,
    );
  }
  return octets.toString('utf8').replace(/^\uFEFF/, '');
}

/** Les lignes non vides d'un CSV de l'archive, BOM retiré, CRLF découpé. */
export function lignesDuCsv(archive: ArchiveLue, nom: string): readonly string[] {
  return texteDuFichier(archive, nom)
    .split('\r\n')
    .filter((ligne) => ligne !== '');
}

/**
 * Les cellules d'une ligne CSV, en tenant compte des guillemets.
 *
 * Un découpage naïf sur `;` couperait au milieu d'une note de consultant qui en
 * contient un — et un test qui compare la mauvaise colonne échoue pour la mauvaise
 * raison, ou pire, passe pour la mauvaise raison.
 */
export function cellulesDeLigne(ligne: string): readonly string[] {
  const cellules: string[] = [];
  let courante = '';
  let entreGuillemets = false;

  for (let index = 0; index < ligne.length; index += 1) {
    const caractere = ligne[index];
    if (caractere === '"') {
      if (entreGuillemets && ligne[index + 1] === '"') {
        courante += '"';
        index += 1;
      } else {
        entreGuillemets = !entreGuillemets;
      }
      continue;
    }
    if (caractere === ';' && !entreGuillemets) {
      cellules.push(courante);
      courante = '';
      continue;
    }
    courante += caractere ?? '';
  }
  cellules.push(courante);
  return cellules;
}

/**
 * La valeur d'une colonne NOMMÉE, sur la ligne `index` d'un CSV de l'archive.
 *
 * Les tests interrogent ainsi le fichier par le NOM de sa colonne, jamais par sa
 * position : une colonne insérée demain ne doit pas faire échouer dix assertions
 * qui parlaient d'autre chose.
 */
export function valeurDeColonne(
  archive: ArchiveLue,
  nomDuFichier: string,
  indexDeLigne: number,
  nomDeColonne: string,
): string | undefined {
  const lignes = lignesDuCsv(archive, nomDuFichier);
  const entete = cellulesDeLigne(lignes[0] ?? '');
  const colonne = entete.indexOf(nomDeColonne);
  if (colonne < 0) return undefined;
  const ligne = lignes[indexDeLigne + 1];
  if (ligne === undefined) return undefined;
  return cellulesDeLigne(ligne)[colonne];
}
