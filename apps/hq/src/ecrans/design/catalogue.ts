// =============================================================================
// LE CATALOGUE — ET LE GARDE QUI EMPÊCHE LA PAGE `/design` D'OUBLIER UN COMPOSANT
//
// ── LE DÉFAUT QU'IL FERME, ET IL EST CONNU ─────────────────────────────────
// Une galerie écrite à la main se désynchronise du paquet en une semaine :
// quelqu'un ajoute un composant, personne ne l'ajoute à la page, et la page
// devient un mensonge poli. Ce dépôt a payé cette famille de défaut quatre fois
// en une semaine — trois listes de capacités hors ligne qui divergeaient, un
// balayage axe qui couvrait 3 vues sur 11, une matrice verte sur un quart de son
// objet.
//
// ── LE GARDE, ET IL EST DANS LE TYPE ───────────────────────────────────────
// `satisfies Record<NomComposantUI, FicheComposant>` : `NomComposantUI` est LU
// sur les exports réels de `@axion/ui` (voir `packages/ui/src/inventaire.ts`).
// Un composant exporté et absent d'ici NE COMPILE PAS — `pnpm typecheck` le dit
// avant qu'aucun test ne tourne, comme `capacites-hors-ligne.ts` l'a fait pour
// la douzième vue du terrain le jour de son écriture.
//
// Deux corollaires que le type tient aussi :
//   · `ListeDeDeux` refuse une fiche à une seule démonstration — la galerie
//     « tout en nominal » ne vaut pas d'être publiée ;
//   · `origine` oblige un composant hors §33.5 à dire de quelle section il naît.
//
// ── CE QUE LE TYPE NE TIENT PAS, ET QUI EST MESURÉ AILLEURS ────────────────
// Que les deux démonstrations montrent des états DISTINCTS, que les quatre
// états de §33.2 apparaissent sur la page, qu'aucun aperçu ne rende du vide,
// qu'aucune couleur ne soit posée en dur dans le DOM produit : tout cela vit
// dans `EcranDesign.test.tsx`. Un type qui prétendrait le faire serait
// illisible ; un commentaire qui le promettrait ne serait pas tenu.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale), E22 (console de pilotage 7 espaces).
// =============================================================================
import type { NomComposantUI } from '@axion/ui';
import { FICHES_ETATS } from './fiches-etats.js';
import { FICHES_ICONES } from './fiches-icones.js';
import { FICHES_METIER } from './fiches-metier.js';
import { FICHES_SOCLE } from './fiches-socle.js';
import { FAMILLES, type CleFamille, type FicheComposant } from './types.js';

/**
 * Toutes les fiches, une par composant exporté.
 *
 * L'assemblage par étalement conserve les clés littérales des quatre objets :
 * c'est ce qui permet au `satisfies` de compter. Le construire avec
 * `Object.fromEntries` rendrait un `Record<string, …>` et désarmerait le garde
 * sans qu'aucune ligne ne change de couleur — la façon la plus discrète de
 * perdre un contrôle.
 */
export const CATALOGUE = {
  ...FICHES_SOCLE,
  ...FICHES_ETATS,
  ...FICHES_METIER,
  ...FICHES_ICONES,
} as const satisfies Record<NomComposantUI, FicheComposant>;

/** Les noms de composants du catalogue — donc, par construction, ceux du paquet. */
export const NOMS_CATALOGUE = Object.keys(CATALOGUE) as readonly NomComposantUI[];

/** Les fiches d'une famille, dans l'ordre de déclaration. */
export function fichesDe(
  famille: CleFamille,
): readonly (readonly [NomComposantUI, FicheComposant])[] {
  return NOMS_CATALOGUE.filter((nom) => CATALOGUE[nom].famille === famille).map(
    (nom) => [nom, CATALOGUE[nom]] as const,
  );
}

/** Les familles dans l'ordre de lecture de la page. */
export const ORDRE_FAMILLES = Object.keys(FAMILLES) as readonly CleFamille[];
