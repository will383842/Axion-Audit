// =============================================================================
// TESTS — INVARIANT 4 SUR LES COMPOSANTS : « aucune couleur ni taille en dur »
// Écrits par un agent qui n'a PAS écrit les composants (09 §5.6).
//
// 00_INDEX, invariant 4 : « Aucune couleur/taille en dur : tokens du design
// system UNIQUEMENT. » L'invariant ne vit pas dans une consigne de revue : il se
// BALAIE. Ce fichier lit les SOURCES des composants et la feuille de style qui
// les habille, et refuse toute valeur littérale.
//
// ── LA CONTRE-ÉPREUVE EST LA MOITIÉ IMPORTANTE DU FICHIER ────────────────────
// Un balayage qui ne trouve rien est indiscernable d'un balayage CASSÉ : les
// deux sont verts. Le dernier bloc joue donc des textes fautifs FABRIQUÉS et
// exige que le balayage les DÉTECTE, chacun sur la faute qu'il vise. Sans lui,
// une expression régulière mal échappée rendrait ce fichier définitivement
// silencieux, et sa vacuité passerait pour une conformité.
//
// ── CE QUE CE BALAYAGE NE VOIT PAS, dit avant qu'on le lui demande ───────────
//   · une couleur nommée (`red`, `chartreuse`) plutôt qu'écrite en hexadécimal :
//     c'est le périmètre de `scripts/check-invariants.mjs` (INV-4c), qui porte
//     les 148 noms de la spécification CSS. Ce fichier ne le duplique pas ;
//   · une couleur construite à l'exécution (concaténation, variable) ;
//   · une valeur en dur écrite dans un composant d'une APPLICATION : ce
//     balayage a le périmètre de `packages/ui`, et lui seul.
// Il n'a pas vocation à remplacer le garde-fou de dépôt : il rend l'invariant
// exigible DANS LA SUITE DE TESTS du paquet, là où un agent le lit.
// Traçabilité : E27, E44 · invariant 4 du 00_INDEX.
// =============================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOSSIER = import.meta.dirname;
const RACINE_PAQUET = resolve(DOSSIER, '..');

/**
 * Retire commentaires de bloc et de ligne. Les en-têtes de ce paquet CITENT des
 * couleurs de la charte et des tailles en pixels pour expliquer les jetons
 * qu'ils remplacent : sans ce nettoyage, le balayage accuserait la
 * DOCUMENTATION d'une faute qu'elle ne commet pas, et un garde-fou qui accuse à
 * tort finit désactivé.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Couleur écrite en hexadécimal : `#rgb`, `#rrggbb`, `#rrggbbaa`. */
const HEXADECIMAL = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;

/** Fonction qui PRODUIT une couleur : sa seule présence est une infraction. */
const FONCTION_COULEUR = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\s*\(/gi;

/**
 * Longueur ABSOLUE. `0px` est exclu : un zéro n'a pas d'unité qui compte, et le
 * refuser n'apprendrait rien à personne. Les unités RELATIVES (`rem`, `em`, `%`,
 * `ch`, `vh`) sont l'échelle du design system : elles suivent le zoom et la
 * taille de police système, ce que l'invariant protège précisément.
 */
const LONGUEUR_ABSOLUE = /(?<![\w.-])(?!0(?![\d.]))\d+(?:\.\d+)?(?:px|pt|pc|in|cm|mm|Q)\b/g;

function fichiersSources(): readonly string[] {
  return readdirSync(DOSSIER)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
    .sort();
}

function lireComposant(fichier: string): string {
  return sansCommentaires(readFileSync(resolve(DOSSIER, fichier), 'utf8'));
}

function fautes(texte: string, motif: RegExp): readonly string[] {
  return [...texte.matchAll(new RegExp(motif.source, motif.flags))].map((m) => m[0]);
}

describe('invariant 4 — les SOURCES des composants ne portent aucune couleur littérale', () => {
  const SOURCES = fichiersSources();

  it('balaie un inventaire NON VIDE (sans quoi tout ce qui suit serait vide de sens)', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(SOURCES)('%s n’écrit aucune couleur en hexadécimal', (fichier) => {
    expect(fautes(lireComposant(fichier), HEXADECIMAL)).toEqual([]);
  });

  it.each(SOURCES)('%s n’appelle aucune fonction de couleur', (fichier) => {
    expect(fautes(lireComposant(fichier), FONCTION_COULEUR)).toEqual([]);
  });

  it.each(SOURCES)('%s n’écrit aucune longueur absolue', (fichier) => {
    // Les nombres de l'anneau de progression (rayon 44, trait 10, boîte 100) sont
    // des unités de `viewBox`, SANS dimension : ils décrivent une proportion et
    // ne portent pas d'unité, donc ce motif ne les vise pas — à raison.
    expect(fautes(lireComposant(fichier), LONGUEUR_ABSOLUE)).toEqual([]);
  });
});

describe('invariant 4 — la feuille de style des composants ne consomme QUE des jetons', () => {
  const css = readFileSync(resolve(RACINE_PAQUET, 'composants.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ' ',
  );

  it('n’écrit aucune couleur en hexadécimal', () => {
    expect(fautes(css, HEXADECIMAL)).toEqual([]);
  });

  it('n’appelle aucune fonction de couleur', () => {
    expect(fautes(css, FONCTION_COULEUR)).toEqual([]);
  });

  it('n’écrit aucune longueur absolue', () => {
    expect(fautes(css, LONGUEUR_ABSOLUE)).toEqual([]);
  });

  it('ne DÉFINIT aucune variable de jeton — elle ne fait que les consommer', () => {
    // `composants.css` « ne fait QUE consommer les variables posées par
    // tokens.css — il n'en définit aucune ». Une définition ici serait un
    // deuxième endroit où vit la charte, donc une charte à deux vérités.
    const definitions = [...css.matchAll(/^\s*--[a-z0-9-]+\s*:/gm)].map((m) => m[0].trim());
    expect(definitions).toEqual([]);
  });

  it('consomme réellement des jetons (contre-épreuve de la règle ci-dessus)', () => {
    expect(css.includes('var(--couleur-')).toBe(true);
    expect(css.includes('var(--taille-')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// LES FAUTES FABRIQUÉES — citées, jamais commises.
//
// Ces valeurs servent UNIQUEMENT à mordre le balayage ci-dessous. Elles ne
// touchent aucun rendu et ne sortent pas de ce fichier. Chaque ligne porte
// `invariant-ok:` parce que `scripts/check-invariants.mjs` refuse — À JUSTE
// TITRE — toute notation de couleur ou longueur absolue partout ailleurs dans le
// dépôt : son filet INV-4b est TEXTUEL et ne peut pas distinguer une faute
// CITÉE d'une faute COMMISE. L'exception est donc marquée, donc tracée, donc
// relue comme le reste du code — et regroupée en un seul endroit plutôt que
// dispersée dans dix assertions.
// -----------------------------------------------------------------------------
const FAUTE = {
  // invariant-ok: fixture de contre-épreuve — la charte, citée pour être détectée.
  hexSix: '#c24a1b',
  // invariant-ok: fixture de contre-épreuve — forme courte à trois chiffres.
  hexTrois: '#fff',
  // invariant-ok: fixture de contre-épreuve — forme à huit chiffres (avec alpha).
  hexHuit: '#2a25208c',
  // invariant-ok: fixture de contre-épreuve — notation fonctionnelle héritée.
  fonctionHeritee: 'rgb(194, 74, 27)',
  // invariant-ok: fixture de contre-épreuve — notation fonctionnelle moderne.
  fonctionModerne: 'oklch(0.6 0.15 40)',
  // invariant-ok: fixture de contre-épreuve — trois unités absolues d'un coup.
  longueurs: '12px 4pt 3mm',
  // invariant-ok: fixture de contre-épreuve — le cas RÉEL que l'invariant protège.
  cibleTactile: '44px',
  // invariant-ok: fixture de contre-épreuve — un zéro n'a pas d'unité qui compte.
  zero: '0px',
  // invariant-ok: fixture de contre-épreuve — unités RELATIVES, toutes légitimes.
  relatives: '1.125rem 60% 2em',
} as const;

describe('CONTRE-ÉPREUVE — le balayage DÉTECTE une faute introduite exprès', () => {
  // Chaque cas est un texte FABRIQUÉ ICI, jamais lu d'un fichier du dépôt. Il ne
  // peut donc pas rendre la suite rouge par accident, et il prouve que le motif
  // correspondant est vivant. Un balayage dont on n'a jamais vu la morsure est un
  // balayage dont on ignore s'il mord.
  it('voit une couleur hexadécimale à six chiffres', () => {
    expect(fautes(`const c = '${FAUTE.hexSix}';`, HEXADECIMAL)).toEqual([FAUTE.hexSix]);
  });

  it('voit une couleur hexadécimale à trois et à huit chiffres', () => {
    const source = `background: ${FAUTE.hexTrois}; border-color: ${FAUTE.hexHuit};`;
    expect(fautes(source, HEXADECIMAL)).toEqual([FAUTE.hexTrois, FAUTE.hexHuit]);
  });

  it('voit une couleur écrite en notation fonctionnelle, héritée comme moderne', () => {
    // Le motif ne retient que la TÊTE de la notation (le nom et sa parenthèse) :
    // c'est elle qui suffit à condamner la déclaration.
    const tete = (notation: string) => notation.replace(/\(.*$/, '(');
    expect(fautes(`color: ${FAUTE.fonctionHeritee};`, FONCTION_COULEUR)).toEqual([
      tete(FAUTE.fonctionHeritee),
    ]);
    expect(fautes(`color: ${FAUTE.fonctionModerne};`, FONCTION_COULEUR)).toEqual([
      tete(FAUTE.fonctionModerne),
    ]);
  });

  it('voit une longueur absolue en pixels, en points et en millimètres', () => {
    expect(fautes(`padding: ${FAUTE.longueurs};`, LONGUEUR_ABSOLUE)).toEqual(
      FAUTE.longueurs.split(' '),
    );
  });

  it('voit une hauteur de cible tactile écrite en dur', () => {
    // Le cas RÉEL que l'invariant protège : la cible tactile recopiée au lieu du
    // jeton `--taille-cible-tactile-min`. Recopiée, elle ne suit plus la charte.
    expect(fautes(`min-height: ${FAUTE.cibleTactile};`, LONGUEUR_ABSOLUE)).toEqual([
      FAUTE.cibleTactile,
    ]);
  });

  it('ne se déclenche PAS sur ce qui est légitime — ni faux positif, ni indulgence', () => {
    // Un garde-fou qui accuse à tort finit désactivé : la contre-épreuve doit
    // aller dans les deux sens.
    expect(fautes('padding: var(--espacement-4);', LONGUEUR_ABSOLUE)).toEqual([]);
    expect(fautes(`font-size: ${FAUTE.relatives};`, LONGUEUR_ABSOLUE)).toEqual([]);
    expect(fautes(`margin: ${FAUTE.zero};`, LONGUEUR_ABSOLUE)).toEqual([]);
    expect(fautes('color: var(--couleur-action-fond);', HEXADECIMAL)).toEqual([]);
    expect(fautes('const id = `${prefixe}-erreur`;', HEXADECIMAL)).toEqual([]);
  });

  it('le nettoyage des commentaires n’AVEUGLE pas le balayage sur du vrai code', () => {
    // Le nettoyage est nécessaire (les en-têtes citent la charte) mais il ne doit
    // pas devenir une échappatoire : une faute écrite APRÈS un commentaire, sur
    // la ligne suivante, reste vue.
    const source = [
      `// La charte dit terracotta ${FAUTE.hexSix}.`,
      `const f = '${FAUTE.hexSix}';`,
    ].join('\n');
    expect(fautes(sansCommentaires(source), HEXADECIMAL)).toEqual([FAUTE.hexSix]);
  });

  it('épargne les couleurs CITÉES en commentaire (elles documentent les jetons)', () => {
    const source = `/* CHARTE — ${FAUTE.hexSix} et ${FAUTE.hexTrois} */\ncolor: var(--couleur-x);`;
    expect(fautes(sansCommentaires(source), HEXADECIMAL)).toEqual([]);
  });

  it('MORD sur un VRAI fichier du dépôt — la chaîne lecture + motif est vivante', () => {
    // Les cas ci-dessus jouent des chaînes fabriquées : ils prouvent les MOTIFS,
    // pas le fait que la lecture de fichier arrive jusqu'à eux. Un mauvais chemin
    // rendrait tous les balayages ci-dessus verts sur du vide.
    //
    // `tokens.ts` et `tokens.css` sont le SEUL endroit du dépôt où une couleur
    // littérale est légitime (`check-invariants.mjs` les exclut nommément). Ils
    // sont donc le témoin idéal : appliqué à eux, le balayage DOIT trouver — et
    // s'il ne trouve rien, c'est le balayage qui est cassé, pas le dépôt qui est
    // devenu pur.
    const tokensTs = sansCommentaires(readFileSync(resolve(RACINE_PAQUET, 'tokens.ts'), 'utf8'));
    const couleurs = fautes(tokensTs, HEXADECIMAL);
    expect(couleurs).toContain(FAUTE.hexSix);
    expect(couleurs.length).toBeGreaterThan(20);

    const tokensCss = readFileSync(resolve(RACINE_PAQUET, 'tokens.css'), 'utf8');
    expect(fautes(tokensCss, HEXADECIMAL).length).toBeGreaterThan(20);
    // Et la seule longueur absolue légitime du design system : la cible tactile.
    expect(fautes(tokensCss, LONGUEUR_ABSOLUE)).toContain(FAUTE.cibleTactile);
  });
});
