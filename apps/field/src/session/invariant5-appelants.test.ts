// =============================================================================
// GARDE STRUCTURELLE — ON NE DÉSARME PAS `session/fuseau.ts` DEPUIS SON APPELANT
//
// ── STATUT DE CE FICHIER ─────────────────────────────────────────────────────
// GARDE ÉCRITE AVANT SON CORRECTIF. Écrit par A26, qui n'a produit aucune ligne
// de `session/fuseau.ts` ni d'aucun de ses appelants (09 §5.6). **A26 ne corrige
// rien** : ce fichier est ROUGE à sa livraison et le reste jusqu'au correctif.
//
// ── POURQUOI UNE GARDE DE TEXTE EN PLUS DES TESTS D'ÉCRAN ────────────────────
// Les tests d'écran (`ecrans/journee/invariant5-fuseau.acceptation-l5d.test.tsx`)
// prouvent le COMPORTEMENT sur les trois emplacements connus. Ils ne peuvent rien
// dire du QUATRIÈME, celui que personne n'a encore écrit. Or le défaut trouvé par
// A20 le 2026-09-08 n'est pas une valeur fausse : c'est une FORME D'APPEL —
// `formaterDateHeure(x, undefined)` — que la signature `string | undefined`
// autorise, que le compilateur accepte, et qui rend l'invariant 5 optionnel au
// point d'appel. Une forme se reproduit ; c'est elle qu'on garde ici.
//
// ── LES TROIS CONTRÔLES, ET CE QU'ILS COÛTENT ────────────────────────────────
//   C1 — LE DÉSARMEMENT EXPLICITE. Aucun appel à `formaterHeure` /
//        `formaterDateHeure` ne passe `undefined` LITTÉRAL en second argument.
//        ROUGE aujourd'hui : `EcranRestauration.tsx` le fait une fois.
//   C2 — LA COUCHE DE PRÉSENTATION NE FORMATE PAS ELLE-MÊME. Aucun `.tsx` de
//        `apps/field/src` ne construit d'`Intl.DateTimeFormat` ni n'appelle
//        `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString`. VERT
//        aujourd'hui : c'est une garde de prévention, et elle a été vérifiée
//        contre les usages existants avant d'être écrite — un garde qui crie à
//        tort finit ignoré.
//   C3 — LA LISTE DES MODULES QUI ONT LE DROIT DE FORMATER EST CLOSE. Deux, et
//        deux seulement : `session/fuseau.ts` (l'affichage, 03 §22.2) et
//        `local/depots/sessions.ts` (le calcul du JOUR CIVIL d'un instant, qui
//        n'est pas de l'affichage et reçoit toujours le fuseau de la mission
//        depuis `agenda/jour.ts`). Un troisième module fait rougir : il devra
//        être justifié en revue croisée, pas glissé.
//
// ── LE TROU QU'ELLE AVAIT, ET QUI EST FERMÉ (réserve R4, A29, 2026-09-08) ────
// C1 s'appliquait LIGNE PAR LIGNE. A29 l'a mesuré : la même mutation, réécrite
// sur quatre lignes par Prettier — qui scinde dès 100 caractères —, passait VERTE
// alors que le désarmement était bien là. Or le code corrigé d'
// `EcranRestauration.tsx` EST multi-ligne : la garde était aveugle à la forme
// même qu'elle venait de faire écrire.
// L'aggravant tenait à la section ci-dessous : elle nommait honnêtement deux
// angles morts, et taisait celui-là. **Une garde qu'on croit plus large qu'elle
// n'est vaut moins qu'une garde qu'on sait étroite.**
// La recherche porte désormais sur le FICHIER ENTIER (voir `emplacements`) : le
// motif tolérait déjà les retours à la ligne — `[^();]*` les accepte —, c'est la
// boucle qui les lui retirait. Aucun faux positif ajouté : cette classe niée ne
// franchit ni parenthèse ni point-virgule, donc jamais une frontière
// d'instruction.
//
// ── CE QUE CETTE GARDE NE VOIT PAS, ET C'EST L'ESSENTIEL ─────────────────────
// Elle est TEXTUELLE. Elle ne voit pas :
//   · `formaterDateHeure(iso, mission?.timezone)` quand `mission` est `undefined`
//     à l'exécution — le désarmement par le chaînage optionnel, qui est la même
//     faute sous une autre forme et qu'aucun texte ne distingue ;
//   · `{dernierRituel}`, une chaîne ISO interpolée dans du JSX sans passer par
//     aucun formateur : rien dans le texte ne dit que cette variable est un
//     horodatage. C'est précisément le défaut d'`EcranFinDeJournee.tsx:333`, et
//     il explique pourquoi il a survécu à toutes les gardes du dépôt.
// Ces deux-là ne se prennent qu'à l'écran, avec un fuseau d'appareil divergent.
// Cette garde est un COMPLÉMENT des tests d'écran, jamais leur substitut.
//
// ── CE QU'ELLE ATTRAPE EN PLUS, ET QU'ON N'ENLÈVE PAS (remarque r4, A29) ─────
// `FORMATAGE_DIRECT` cite `.toLocaleString(`, qui attrapera aussi un futur
// `montant.toLocaleString('fr-FR')` — un NOMBRE, pas une date. Aucun usage
// aujourd'hui : le faux positif est LATENT, et il est conservé délibérément.
// Deux raisons. Aucun texte ne distingue un `Date` d'un `Number` au point
// d'appel — le resserrer demanderait de lire les types, donc un autre outil. Et
// un nombre rendu sans locale explicite casse le MÊME invariant 5 (« interface
// 100 % en français ») qu'une date rendue sans fuseau : le jour où un module en
// aura besoin, C3 rougira, et ce n'est pas un refus, c'est une justification à
// écrire dans `MODULES_AUTORISES`. Les messages de C2 et C3 le disent, pour que
// personne ne croie la garde cassée devant un rouge qu'elle a voulu.
//
// Traçabilité : E32 (fuseaux, devises, interface française) · E36 (exécutable par
// lots avec critères).
// =============================================================================
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = resolve(import.meta.dirname, '../../../..');
const SOURCE_TERRAIN = resolve(RACINE, 'apps/field/src');

/** Les modules autorisés à construire un formateur de date, et leur motif. */
const MODULES_AUTORISES: ReadonlyMap<string, string> = new Map([
  [
    'apps/field/src/session/fuseau.ts',
    'le module d’affichage lui-même — 03 §22.2, le fuseau de mission n’intervient qu’ici',
  ],
  [
    'apps/field/src/local/depots/sessions.ts',
    'calcul du JOUR CIVIL d’un instant (pas de l’affichage) ; le fuseau de mission lui est toujours passé par agenda/jour.ts',
  ],
]);

/** Ce qui, dans une source, formate une date au fuseau implicite de l’appareil. */
const FORMATAGE_DIRECT =
  /Intl\.DateTimeFormat|\.toLocaleDateString\s*\(|\.toLocaleTimeString\s*\(|\.toLocaleString\s*\(/;

/**
 * `formaterHeure(x, undefined)` / `formaterDateHeure(x, undefined)`.
 *
 * Volontairement littéral : c'est la seule forme qui se voit dans un texte, et
 * c'est celle qu'A20 a trouvée. Une expression qui VAUT `undefined` à
 * l'exécution lui échappe — voir « ce que cette garde ne voit pas ».
 *
 * DEUX causes CUMULÉES rendaient l'appel multi-ligne invisible, et il fallait les
 * deux (R4). A29 en a nommé une — la recherche ligne par ligne. La mesure en a
 * révélé une SECONDE, tue jusque-là : Prettier ne se contente pas de scinder,
 * **il ajoute une virgule finale**, et `,\s*undefined\s*\)` la refusait. La garde
 * corrigée de la première moitié restait donc verte sur la forme exacte du code
 * qu'elle prétend surveiller. D'où le `,?` — et d'où la règle : une garde ne se
 * déclare fermée qu'après avoir vu rougir la forme RÉELLE, pas une forme plausible.
 *
 * `[^();]*` accepte les retours à la ligne ; il ne franchit en revanche ni
 * parenthèse ni point-virgule, donc le motif reste borné à UN appel.
 */
const FUSEAU_DESARME = /formater(?:Heure|DateHeure)\s*\([^();]*,\s*undefined\s*,?\s*\)/g;

interface Source {
  readonly chemin: string;
  readonly texte: string;
}

function estUnTest(chemin: string): boolean {
  return /\.test\.tsx?$/.test(chemin);
}

/** Toutes les sources livrées de l'app terrain — les tests exclus. */
function sourcesTerrain(): readonly Source[] {
  const sources: Source[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(complet);
        continue;
      }
      if (!/\.tsx?$/.test(entree.name) || estUnTest(entree.name)) continue;
      sources.push({
        chemin: relative(RACINE, complet).split(sep).join('/'),
        texte: readFileSync(complet, 'utf8'),
      });
    }
  };
  parcourir(SOURCE_TERRAIN);
  return sources;
}

/**
 * `fichier:ligne — texte fautif`, pour que l'échec nomme l'endroit.
 *
 * LA RECHERCHE PORTE SUR LE FICHIER ENTIER, jamais ligne à ligne : voir « le trou
 * qu'elle avait » en tête de fichier. Le rang est celui où le fautif COMMENCE ;
 * quand il s'étale sur plusieurs lignes, c'est l'appel entier, aplati, qui est
 * rendu — pointer `formaterDateHeure(` tout seul ne se corrigerait pas.
 */
function emplacements(source: Source, motif: RegExp): readonly string[] {
  const balayage = new RegExp(
    motif.source,
    motif.flags.includes('g') ? motif.flags : `${motif.flags}g`,
  );
  const lignes = source.texte.split('\n');
  const trouves: string[] = [];
  for (const trouvaille of source.texte.matchAll(balayage)) {
    const rang = source.texte.slice(0, trouvaille.index).split('\n').length;
    const apercu = trouvaille[0].includes('\n')
      ? trouvaille[0].replace(/\s+/g, ' ').trim()
      : (lignes[rang - 1] ?? '').trim();
    trouves.push(`${source.chemin}:${String(rang)} — ${apercu}`);
  }
  return trouves;
}

const SOURCES = sourcesTerrain();

describe('invariant 5 — le fuseau de mission ne se rend pas facultatif au point d’appel', () => {
  it('@critique le harnais lit bien les sources de l’app terrain', () => {
    // Sans cela, une erreur de chemin rendrait les trois contrôles suivants
    // verts sur un ensemble vide — la forme la plus discrète du faux vert.
    expect(SOURCES.length).toBeGreaterThan(40);
    expect(SOURCES.map((s) => s.chemin)).toContain('apps/field/src/session/fuseau.ts');
  });

  it('@critique C1 — aucun appel ne passe `undefined` en fuseau', () => {
    const fautes = SOURCES.flatMap((source) => emplacements(source, FUSEAU_DESARME));
    expect(
      fautes,
      'Passer `undefined` fait retomber Intl sur le fuseau de l’APPAREIL : l’horodatage devient faux dès que l’auditeur voyage (CLAUDE.md §1-5, 03 §22.2).',
    ).toEqual([]);
  });

  it('@critique C2 — aucun écran ne formate une date lui-même', () => {
    const fautes = SOURCES.filter((s) => s.chemin.endsWith('.tsx')).flatMap((source) =>
      emplacements(source, FORMATAGE_DIRECT),
    );
    expect(
      fautes,
      'Un composant qui formate lui-même contourne `session/fuseau.ts` et donc l’invariant 5 : passer par `formaterHeure` / `formaterDateHeure` avec le fuseau de la mission. Si le fautif formate un NOMBRE et non une date, la garde ne sait pas les distinguer : le rouge est voulu, il demande une justification en revue croisée, pas un contournement.',
    ).toEqual([]);
  });

  it('@critique C3 — la liste des modules qui formatent une date est close', () => {
    const formateurs = SOURCES.filter((source) => FORMATAGE_DIRECT.test(source.texte)).map(
      (source) => source.chemin,
    );
    expect(
      [...formateurs].sort((a, b) => a.localeCompare(b)),
      'Un module de plus construit un formateur de date — ou de NOMBRE, que ce motif textuel ne sait pas en distinguer (voir l’en-tête). Ce n’est pas interdit, c’est à JUSTIFIER en revue croisée puis à inscrire dans MODULES_AUTORISES avec son motif.',
    ).toEqual([...MODULES_AUTORISES.keys()].sort((a, b) => a.localeCompare(b)));
  });
});
