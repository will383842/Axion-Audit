// =============================================================================
// ÉCRITURE CSV DE L'EXPORT — FONCTION PURE. Lot L7, incrément L7c.
//
// ── CE QUE LE §36.3 IMPOSE, ET QUI TIENT EN DEUX LIGNES ────────────────────
// « UTF-8 avec BOM (Excel FR), séparateur `;` ». Les deux constantes viennent de
// `packages/shared` : la console annonce le même format qu'elle produit, et les
// tests d'A36 lisent la même source que le code — trois copies dériveraient.
//
// ── CE QUE LE §36.3 N'IMPOSE PAS, ET QUI N'EST PAS NÉGOCIABLE POUR AUTANT ──
// Un export d'audit transporte du TEXTE SAISI PAR DES TIERS : des notes de
// consultant, des verbatims, des noms d'outils. Trois conséquences mécaniques :
//   · guillemets et retours à la ligne (RFC 4180 — doubler, entourer) ;
//   · le point-virgule DANS une cellule, très fréquent en français ;
//   · l'INJECTION DE FORMULE : `=`, `+`, `-`, `@` en tête de cellule sont
//     interprétés par Excel et LibreOffice. Une cellule d'audit qui commence par
//     `=` doit s'AFFICHER, pas s'exécuter. Le préfixe apostrophe la neutralise
//     sans la déformer à la lecture (le tableur ne montre pas l'apostrophe).
// Ce n'est pas de la sécurité inventée : c'est la même famille que l'invariant
// « aucune donnée personnelle dans les logs » — la donnée du client ne doit jamais
// devenir du code chez celui qui la relit.
//
// ── LES BOOLÉENS SONT « oui » / « non » (invariant 5) ──────────────────────
// L'interface est 100 % française ; le fichier avec lequel on rédige le rapport
// l'est aussi. `true` dans une colonne « dans le périmètre » se lit mal en
// français, et se recopie encore plus mal dans un livrable client.
//
// Traçabilité : E14 (consolidation) · E32 (interface française) · E36.
// =============================================================================
import { BOM_UTF8, SEPARATEUR_CSV } from '@axion/shared';

/** Ce qu'une cellule accepte de recevoir. Tout le reste passe par `JSON.stringify`. */
export type ValeurCellule = string | number | boolean | null | undefined;

/** Les caractères qui font d'une cellule une FORMULE aux yeux d'un tableur. */
const AMORCES_DE_FORMULE = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Les caractères qui obligent à entourer la cellule de guillemets (RFC 4180). */
function exigeDesGuillemets(texte: string): boolean {
  return (
    texte.includes(SEPARATEUR_CSV) ||
    texte.includes('"') ||
    texte.includes('\n') ||
    texte.includes('\r')
  );
}

/**
 * Une valeur rendue en cellule CSV — échappée, française, et inerte.
 *
 * `null` et `undefined` donnent une cellule VIDE, jamais la chaîne « null » : une
 * cellule vide se lit « on n'a pas cette information », ce qui est exactement ce
 * qu'un `NULL` de base signifie.
 */
export function celluleCsv(valeur: ValeurCellule): string {
  if (valeur === null || valeur === undefined) return '';

  let texte: string;
  if (typeof valeur === 'boolean') texte = valeur ? 'oui' : 'non';
  else if (typeof valeur === 'number') texte = Number.isFinite(valeur) ? String(valeur) : '';
  else texte = valeur;

  // ① Neutraliser AVANT d'échapper : l'apostrophe fait partie de la cellule, et
  //    doit donc se retrouver DANS les guillemets si guillemets il y a.
  const premier = texte.charAt(0);
  if (texte !== '' && AMORCES_DE_FORMULE.has(premier)) texte = `'${texte}`;

  // ② Normaliser les fins de ligne internes : un CSV est un fichier CRLF, y
  //    compris à l'intérieur d'une cellule entre guillemets.
  texte = texte.replace(/\r\n|\r|\n/g, '\r\n');

  if (!exigeDesGuillemets(texte)) return texte;
  return `"${texte.replace(/"/g, '""')}"`;
}

/**
 * Une table complète, prête à écrire dans le ZIP : BOM, `;`, CRLF.
 *
 * Une table VIDE rend le BOM seul — un fichier présent et vide. Le §36.3 liste
 * ces fichiers sans les conditionner : un fichier absent ferait douter de
 * l'export entier, là où un fichier vide dit « rien à exporter sur ce sujet ».
 */
export function ecrireCsv(lignes: readonly (readonly ValeurCellule[])[]): string {
  let texte = BOM_UTF8;
  for (const ligne of lignes) {
    texte += `${ligne.map(celluleCsv).join(SEPARATEUR_CSV)}\r\n`;
  }
  return texte;
}
