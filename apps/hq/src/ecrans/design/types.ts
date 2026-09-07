// =============================================================================
// LA FORME D'UNE FICHE DE GALERIE — page `/design` (03 §33.5, réserve NB-2)
//
// ── CE QUE CES TYPES REFUSENT, ET POURQUOI ─────────────────────────────────
// Une galerie de design system qui montre chaque composant dans son seul état
// nominal ne vaut pas d'être écrite : l'intérêt de la page est précisément de
// montrer les états qu'on oublie — désactivé AVEC son motif, en erreur, vide, en
// chargement, hors ligne. `ListeDeDeux` l'impose au COMPILATEUR : une fiche à une
// seule démonstration ne compile pas. Le reste (deux états DISTINCTS, les quatre
// de §33.2 présents sur la page) est mesuré par `EcranDesign.test.tsx`, faute de
// pouvoir l'écrire dans un type sans le rendre illisible.
//
// ── `origine` — LE SECOND SENS DE LA TRAÇABILITÉ ───────────────────────────
// L'étape 6 du pipeline lit la matrice dans les DEUX sens : exigences → code, et
// code → exigences. `origine` est le second : un composant qui n'est pas nommé
// par §33.5 doit dire de quelle section il naît. Sans ce champ, la galerie
// listerait paisiblement sept composants que le pack ne demande nulle part.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale), E22 (console de pilotage 7 espaces).
// =============================================================================
import type { ComponentType } from 'react';

/**
 * Le vocabulaire FERMÉ des états montrés. Fermé volontairement : une galerie où
 * chacun invente son étiquette ne se lit plus en colonnes, et les quatre états de
 * §33.2 s'y noieraient parmi les nuances.
 *
 * Les quatre premiers après `nominal` SONT ceux de §33.2, mot pour mot.
 */
export const ETATS_DEMO = {
  nominal: 'Nominal',
  chargement: 'Chargement',
  vide: 'Vide',
  erreur: 'Erreur',
  'hors-ligne': 'Hors ligne',
  desactive: 'Désactivé',
  variantes: 'Déclinaisons',
} as const;

export type CleEtat = keyof typeof ETATS_DEMO;

/** Les quatre états que §33.2 exige de tout écran et de toute liste. */
export const QUATRE_ETATS_33_2 = ['chargement', 'vide', 'erreur', 'hors-ligne'] as const;

/** Les familles de la galerie, dans l'ordre de lecture de la page. */
export const FAMILLES = {
  socle: {
    titre: 'Socle',
    propos:
      'Les contrôles repris de shadcn/ui et traduits (invariant 5). Ils ne ' +
      'connaissent ni mission, ni réseau, ni date : ils affichent, et c’est tout.',
  },
  etats: {
    titre: 'Les quatre états (§33.2)',
    propos:
      'Vide, chargement, erreur, hors ligne. Un écran qui n’en livre pas quatre ' +
      'ne passe ni la revue croisée ni la recette — c’est ici qu’on les regarde.',
  },
  metier: {
    titre: 'Composants métier',
    propos:
      'Ce que §33.5 appelle « à construire » : la cotation ancrée, la fourchette, ' +
      'le mode écran partagé, la synthèse d’entretien.',
  },
  icones: {
    titre: 'Icônes',
    propos:
      'Inventaire FERMÉ, dessiné dans le paquet faute de `lucide-react` épinglé. ' +
      'Toutes sont `aria-hidden` : une icône ne porte jamais l’information seule.',
  },
} as const;

export type CleFamille = keyof typeof FAMILLES;

/** D'où vient un composant, quand §33.5 ne le nomme pas. */
export type Origine =
  /** §33.5 le nomme : le nom exact est retrouvé par `nomSpecDe()`, jamais recopié. */
  | { readonly source: '33.5' }
  /** §33.5 ne le nomme pas : il faut dire de quelle exigence il naît, et où. */
  | { readonly source: 'hors-33.5'; readonly justification: string; readonly renvoi: string };

/** Une vignette de la galerie : un état, ce qu'il montre, et pourquoi il compte. */
export interface Demonstration {
  readonly etat: CleEtat;
  /** Titre de la vignette, en français (« Désactivé, avec son motif »). */
  readonly intitule: string;
  /** L'oubli que cette vignette ferme. Une phrase, pas un paragraphe. */
  readonly propos: string;
  /** Le rendu. Un COMPOSANT, pas un élément : certaines vignettes ont un état. */
  readonly Apercu: ComponentType;
}

/** Au moins deux démonstrations. Le nominal seul ne vaut pas d'être publié. */
export type ListeDeDeux<T> = readonly [T, T, ...(readonly T[])];

export interface FicheComposant {
  readonly famille: CleFamille;
  /** Ce que le composant fait, en une phrase française. */
  readonly role: string;
  readonly origine: Origine;
  readonly demonstrations: ListeDeDeux<Demonstration>;
}
