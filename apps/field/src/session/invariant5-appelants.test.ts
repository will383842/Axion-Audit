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
 */
const FUSEAU_DESARME = /formater(?:Heure|DateHeure)\s*\([^();]*,\s*undefined\s*\)/g;

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

/** `fichier:ligne — texte de la ligne`, pour que l'échec nomme l'endroit. */
function emplacements(source: Source, motif: RegExp): readonly string[] {
  const trouves: string[] = [];
  source.texte.split('\n').forEach((ligne, index) => {
    const recherche = new RegExp(motif.source, motif.flags.replace('g', ''));
    if (recherche.test(ligne))
      trouves.push(`${source.chemin}:${String(index + 1)} — ${ligne.trim()}`);
  });
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
      'Un composant qui formate lui-même contourne `session/fuseau.ts` et donc l’invariant 5 : passer par `formaterHeure` / `formaterDateHeure` avec le fuseau de la mission.',
    ).toEqual([]);
  });

  it('@critique C3 — la liste des modules qui formatent une date est close', () => {
    const formateurs = SOURCES.filter((source) => FORMATAGE_DIRECT.test(source.texte)).map(
      (source) => source.chemin,
    );
    expect(
      [...formateurs].sort((a, b) => a.localeCompare(b)),
      'Un module de plus construit un formateur de date. Ce n’est pas interdit, c’est à JUSTIFIER en revue croisée puis à inscrire dans MODULES_AUTORISES avec son motif.',
    ).toEqual([...MODULES_AUTORISES.keys()].sort((a, b) => a.localeCompare(b)));
  });
});
