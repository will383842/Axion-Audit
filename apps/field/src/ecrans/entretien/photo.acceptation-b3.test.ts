// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B3**, moitié « balayage des sources ».
// Révisé par A26 le 2026-10-09 (L6c-1) : voir le bloc « RÉVISION » en fin de fichier.
// (La moitié « ce que l'œil voit » vit dans `photo.acceptation-b3.test.tsx` : le
// projet `interface` sert un `import.meta.url` en HTTP, illisible pour `node:fs`.
// Le découpage suit l'outillage, pas le sujet.)
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit aucune ligne des écrans balayés ni
// du correctif (09 §5.6). `@critique` : le défaut ne coûte pas une fonction en
// moins, il envoie une pièce d'audit dans la pellicule personnelle d'un
// auditeur — hors coffre chiffré, hors invariant 8, hors RGPD.
//
// ── POURQUOI UN BALAYAGE, ET PAS TROIS `grep` CIBLÉS ────────────────────────
// La promesse a été réparée à un endroit sur deux (le cockpit oui, l'accueil
// non), et la TROISIÈME dormait dans le module le moins visible du lot :
// `local/stockage.ts`, un conseil de libération d'espace qui recommandait
// d'« éviter les photos non nécessaires ». Trois occurrences, trois fichiers
// qu'aucune relecture ne rapproche. Seul un balayage de TOUTES les sources
// attrape la quatrième, celle qui n'est pas encore écrite.
//
// ── CE QU'IL FAIT DE PLUS QUE CELUI D'A20 ───────────────────────────────────
// Celui d'A20 n'inspecte que le contenu des chaînes entre apostrophes ASCII. Une
// promesse écrite en TEXTE JSX — `<li>Prendre des photos</li>` — n'est dans
// aucune chaîne et lui échapperait ; c'est pourtant la forme la plus naturelle
// d'un libellé d'interface. Le balayage ci-dessous retire les COMMENTAIRES, puis
// lit tout le reste : code exécutable comme texte rendu.
//
// Traçabilité : E33 (sécurité / RGPD), E23 (hyper intuitif), E44 (§33.6).
// =============================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RACINE_SOURCES = fileURLToPath(new URL('../..', import.meta.url));

/** Toutes les sources de l'app terrain, tests exclus. */
function sources(dossier: string): readonly string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...sources(chemin));
    else if (/[.]tsx?$/.test(entree.name) && !entree.name.includes('.test.')) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Le fichier privé de ses COMMENTAIRES, et d'eux seuls.
 *
 * Celui qui explique ce bloquant contient nécessairement le mot
 * « photographier », et un garde-fou qui interdirait d'écrire pourquoi il existe
 * est un garde-fou qu'on contourne.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/**
 * La promesse d'un GESTE de capture — les formes que ce dépôt a produites : le
 * verbe seul (« Photographier une pièce »), l'énumération (« prendre … des
 * photos ») et le conseil de stockage (« éviter les photos »).
 */
const PROMESSE =
  /photographi[a-zé]+|(prendre|prise de|éviter les|évitez les|joindre une)[^.<>{}]{0,40}photos?/i;

/**
 * Ce qui DÉMENT la promesse dans la même ligne.
 *
 * Le correctif dit à l'auditeur de ne PAS photographier avec un appareil
 * personnel : cette phrase contient donc « photographier ». L'exemption est
 * nommée, étroite, et n'excuse qu'un texte qui dit explicitement que la capture
 * n'existe pas.
 */
const DEMENTI = /(n’est pas disponible|n'est pas disponible|plutôt que|bientôt)/i;

/** Les lignes d'une source qui promettent la capture, démentis retirés. */
export function promessesDePhoto(source: string): readonly string[] {
  const trouvees: string[] = [];
  for (const ligne of sansCommentaires(source).split(/\r?\n/)) {
    if (!PROMESSE.test(ligne)) continue;
    if (DEMENTI.test(ligne)) continue;
    trouvees.push(ligne.trim());
  }
  return trouvees;
}

describe('B3 — AUCUNE source de `apps/field/src` ne promet la capture photo', () => {
  it('@critique le balayage complet ne trouve aucune promesse, dans aucun fichier', () => {
    const fichiers = sources(RACINE_SOURCES);
    // Anti-vacuité du balayage lui-même : un chemin faux rendrait une liste vide,
    // donc un test vert qui n'aurait rien lu.
    expect(fichiers.length).toBeGreaterThan(30);

    const coupables = fichiers
      .map((fichier) => ({
        fichier: fichier.replace(RACINE_SOURCES, ''),
        lignes: promessesDePhoto(readFileSync(fichier, 'utf8')),
      }))
      .filter((resultat) => resultat.lignes.length > 0);
    expect(coupables).toEqual([]);
  });

  it('@critique il attrape les TROIS formulations réellement retirées du dépôt', () => {
    expect(
      promessesDePhoto("const x = 'Prendre des notes, des notes volantes et des photos';"),
    ).toHaveLength(1);
    expect(
      promessesDePhoto("const x = 'Photographier une pièce et la joindre à la réponse';"),
    ).toHaveLength(1);
    expect(
      promessesDePhoto("const x = 'Évitez les photos non nécessaires pour libérer de la place';"),
    ).toHaveLength(1);
  });

  it('@critique il attrape la promesse écrite en TEXTE JSX, hors de toute chaîne', () => {
    expect(promessesDePhoto('<li>Prendre des photos et les joindre</li>')).toHaveLength(1);
  });

  it('@critique le balayage des PROMESSES n’attrape pas le démenti (les démentis ont leur balayage, plus bas)', () => {
    expect(
      promessesDePhoto("const x = 'La capture photo n’est pas disponible dans cette version.';"),
    ).toEqual([]);
    expect(promessesDePhoto('<span>Photo (bientôt)</span>')).toEqual([]);
  });

  it('@critique les commentaires sont écartés, et EUX SEULS', () => {
    expect(promessesDePhoto('// on pourrait photographier une pièce ici')).toEqual([]);
    expect(promessesDePhoto('/* photographier une pièce */')).toEqual([]);
    expect(promessesDePhoto("const x = 'photographier une pièce'; // commentaire")).toHaveLength(1);
  });
});

// =============================================================================
// RÉVISION A26 du 2026-10-09 (lot L6c-1, `DECISIONS.md` [L6c] : « La capture
// photo devient réelle : les acceptations B3 sont révisées par le testeur »).
//
// L'interdit des promesses NON TENUES reste entier, et il gagne son symétrique :
// maintenant que la capture existe, la phrase qui la DÉMENT est à son tour une
// promesse non tenue (« n'est pas disponible », « bientôt »). Le balayage
// ci-dessus continue d'interdire les verbes de capture hors de l'unique geste
// réel ; celui-ci interdit les démentis devenus faux. Le libellé du geste réel,
// « Ajouter une photo », ne doit être attrapé par aucun des deux.
// =============================================================================
const DEMENTI_DEVENU_FAUX = /(n’est pas disponible|n'est pas disponible|bientôt)/i;

/** Les lignes (hors commentaires) qui démentent la capture photo, désormais réelle. */
export function dementisDePhoto(source: string): readonly string[] {
  return sansCommentaires(source)
    .split(/\r?\n/)
    .filter((ligne) => /photo/i.test(ligne) && DEMENTI_DEVENU_FAUX.test(ligne))
    .map((ligne) => ligne.trim());
}

describe('B3 révisé — la capture est réelle : aucun démenti, aucune promesse de trop', () => {
  it('@critique aucune source de `apps/field/src` ne dit plus que la photo est indisponible', () => {
    const fichiers = sources(RACINE_SOURCES);
    expect(fichiers.length).toBeGreaterThan(30);
    const coupables = fichiers
      .map((fichier) => ({
        fichier: fichier.replace(RACINE_SOURCES, ''),
        lignes: dementisDePhoto(readFileSync(fichier, 'utf8')),
      }))
      .filter((resultat) => resultat.lignes.length > 0);
    expect(coupables).toEqual([]);
  });

  it('@critique il attrape les deux démentis retirés (motif et « Photo (bientôt) »)', () => {
    expect(
      dementisDePhoto("const x = 'La capture photo n’est pas disponible dans cette version.';"),
    ).toHaveLength(1);
    expect(dementisDePhoto('<span>Photo (bientôt)</span>')).toHaveLength(1);
  });

  it('@critique le libellé du geste réel « Ajouter une photo » n’est attrapé par AUCUN balayage', () => {
    const libelle = '<label>Ajouter une photo</label>';
    expect(promessesDePhoto(libelle)).toEqual([]);
    expect(dementisDePhoto(libelle)).toEqual([]);
  });

  it('@critique l’interdit des verbes de capture tient toujours hors du geste réel', () => {
    expect(promessesDePhoto("const x = 'Prendre des photos de l’atelier';")).toHaveLength(1);
    expect(promessesDePhoto("const x = 'Photographiez chaque poste';")).toHaveLength(1);
  });
});
