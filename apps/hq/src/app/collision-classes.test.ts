// =============================================================================
// UNE APPLICATION NE REDÉFINIT PAS UNE CLASSE DU DESIGN SYSTEM
//
// ── LE DÉFAUT RÉEL QUI A FAIT NAÎTRE CE GARDE, ET IL A DURÉ ────────────────
// Trouvé le 2026-09-07 en construisant la page `/design`, qui rend les 34
// composants côte à côte — c'est-à-dire le seul écran du dépôt où un composant
// du paquet est mis dans un conteneur ÉTROIT.
//
// `packages/ui/src/composants.css` définit `.axn-chiffres` : l'utilitaire de
// chiffres TABULAIRES, posé par `EchelleAncree` sur ses cinq crans, par
// `CarteSyntheseEntretien` sur ses compteurs, par `PastilleSync` sur son nombre
// d'éléments en attente. `apps/hq/src/app/coquille.css` redéfinissait LE MÊME
// NOM en grille de « chiffres clés » — et, chargé après, il gagnait. Dans toute
// la console, cet utilitaire était donc devenu une grille à colonne minimale de
// 10,67 rem : `EchelleAncree` exigeait 977 px de large (5 × 189) et débordait de
// tout conteneur plus étroit.
//
// Rien ne le voyait. `check:invariants` cherche des couleurs et des tailles, pas
// des noms ; les tests de la console rendaient l'écran d'accueil, où la grille
// EST l'effet voulu ; les tests du paquet rendent un composant SEUL, sans la
// feuille de la console. Le défaut ne pouvait apparaître qu'à l'intersection —
// et l'intersection, c'est `/design`.
//
// ── CE QUE CE GARDE REFUSE, ET CE QU'IL LAISSE PASSER ──────────────────────
// REFUSÉ : un sélecteur qui est EXACTEMENT `.<classe-du-paquet>`, seul, dans une
// feuille d'application. C'est une redéfinition GLOBALE et silencieuse.
// AUTORISÉ : une surcharge CONTEXTUELLE (`.axn-question__actions .axn-bouton`,
// `apps/field`) — elle est bornée à un endroit, elle se lit, et un écran a le
// droit d'ajuster un composant chez lui. Refuser les deux ferait crier le garde
// sur du code sain, et un garde qui crie à tort finit ignoré.
//
// ── POURQUOI CE FICHIER VIT DANS `apps/hq` ─────────────────────────────────
// Il balaie AUSSI `apps/field` : la règle est celle du dépôt, pas d'une
// application. Il est ici parce que c'est ici que la collision a eu lieu et que
// les tests de cette application lisent déjà `packages/ui` (`balayage-dom.ts`).
// Le sens de lecture app → paquet est celui qu'a déjà `multi-appareils.test.tsx`.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale).
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = resolve(import.meta.dirname, '../../../..');

/** Les feuilles d'APPLICATION — celles qui consomment le design system. */
const FEUILLES_APPLICATIVES = [
  'apps/hq/src/app/coquille.css',
  'apps/hq/src/ecrans/design/design.css',
  'apps/field/src/app/coquille.css',
  'apps/field/src/ecrans/entretien/entretien.css',
  'apps/field/src/ecrans/journee/journee.css',
] as const;

const FEUILLE_DU_PAQUET = 'packages/ui/src/composants.css';

function lire(chemin: string): string {
  return readFileSync(resolve(RACINE, chemin), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Les classes DÉFINIES par le design system — lues, jamais recopiées. */
function classesDuPaquet(): ReadonlySet<string> {
  const noms = new Set<string>();
  for (const m of lire(FEUILLE_DU_PAQUET).matchAll(/(?:^|[\s,>+~])\.([a-zA-Z0-9_-]+)/g)) {
    noms.add(m[1] ?? '');
  }
  return noms;
}

/**
 * Les sélecteurs d'une feuille, découpés sur les virgules et débarrassés de leur
 * bloc. Un sélecteur est jugé SEUL s'il ne contient qu'une classe et rien d'autre
 * — ni combinateur, ni second sélecteur, ni pseudo-classe, ni attribut.
 */
function selecteursSeuls(css: string): readonly string[] {
  const seuls: string[] = [];
  for (const m of css.matchAll(/(^|})([^{}]+)\{/g)) {
    for (const brut of (m[2] ?? '').split(',')) {
      const selecteur = brut.trim();
      if (/^\.[a-zA-Z0-9_-]+$/.test(selecteur)) seuls.push(selecteur.slice(1));
    }
  }
  return seuls;
}

describe('aucune application ne redéfinit globalement une classe de @axion/ui', () => {
  const duPaquet = classesDuPaquet();

  it('la lecture du paquet n’est pas creuse (sinon le test suivant serait vide)', () => {
    expect(duPaquet.size).toBeGreaterThan(50);
    expect(duPaquet.has('axn-chiffres')).toBe(true);
    expect(duPaquet.has('axn-bouton')).toBe(true);
  });

  it.each(FEUILLES_APPLICATIVES)(
    '%s ne pose aucune classe du paquet en sélecteur seul',
    (feuille) => {
      const collisions = selecteursSeuls(lire(feuille)).filter((classe) => duPaquet.has(classe));
      expect(
        [...new Set(collisions)],
        `${feuille} redéfinit une classe de @axion/ui pour TOUT le paquet. ` +
          'Renommez la règle applicative, ou bornez-la à son contexte.',
      ).toEqual([]);
    },
  );

  it('CONTRE-ÉPREUVE — le garde mord sur une redéfinition fabriquée, et épargne une surcharge bornée', () => {
    // Sans ces deux lignes, une expression régulière cassée rendrait le bloc
    // ci-dessus vert pour toujours — et c'est précisément ce qui s'est passé
    // pendant deux jours avec `.axn-chiffres` : personne ne mesurait.
    const faute = selecteursSeuls('.axn-chiffres { display: grid; }');
    expect(faute).toEqual(['axn-chiffres']);
    const bornee = selecteursSeuls('.axn-question__actions .axn-bouton { min-height: 0; }');
    expect(bornee).toEqual([]);
  });
});
