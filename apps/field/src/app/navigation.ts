// =============================================================================
// NAVIGATION TERRAIN — un réducteur, pas un routeur (`LOT_L5.md` §1)
//
// ── LA DÉCISION, ET SON COÛT ASSUMÉ ─────────────────────────────────────────
// Pas de `react-router` : il n'est pas dans 11 §1, et une PWA verrouillée n'a ni
// URL partageable ni référencement. La reprise instantanée exigée par 03 §17.4
// (« rouvrir l'app = revenir EXACTEMENT à la question en cours ») est servie par
// la PERSISTANCE de `meta.vueCourante`, ce qu'une URL ne ferait pas mieux.
//
// **Le coût est nommé par la note pour ne pas être découvert en recette** : « le
// geste “retour” système (Android, swipe iPad) doit être capté explicitement —
// c'est une tâche de L5a, pas un effet de bord ». Sans cela, le geste de retour
// ferme l'application au lieu de remonter d'un écran — en pleine collecte, chez
// le client. D'où `useGesteRetourSysteme`, plus bas.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total).
// =============================================================================
import { useEffect } from 'react';
import { estCodeVue, VUE_INITIALE, type CodeVue } from './vues.js';

export interface EtatNavigation {
  /** Pile d'écrans, du plus ancien au plus récent. Jamais vide. */
  readonly pile: readonly CodeVue[];
}

export type ActionNavigation =
  /** Empile une vue (le cas courant). */
  | { readonly type: 'aller'; readonly vue: CodeVue }
  /** Remplace la vue courante — pour ne pas empiler deux fois le même écran. */
  | { readonly type: 'remplacer'; readonly vue: CodeVue }
  /** Dépile. Sans effet sur la racine : le geste retour ne quitte JAMAIS l'app. */
  | { readonly type: 'retour' }
  /** Réinitialise la pile — déverrouillage, changement de mission. */
  | { readonly type: 'racine'; readonly vue: CodeVue }
  /** Repose la pile MÉMORISÉE au démarrage (voir `restaurerNavigation`). */
  | { readonly type: 'restaurer'; readonly etat: EtatNavigation };

export const ETAT_NAVIGATION_INITIAL: EtatNavigation = { pile: [VUE_INITIALE] };

/** L'écran actuellement affiché. La pile est garantie non vide par le réducteur. */
export function vueCourante(etat: EtatNavigation): CodeVue {
  return etat.pile[etat.pile.length - 1] ?? VUE_INITIALE;
}

/** Peut-on revenir en arrière ? (le bouton « retour » de l'en-tête s'y règle) */
export function peutRevenir(etat: EtatNavigation): boolean {
  return etat.pile.length > 1;
}

/**
 * Les vues RACINE : celles d'où « remonter » n'a aucun sens, parce qu'elles SONT
 * le point de départ. `accueil` est l'écran d'embarquement du socle,
 * `aujourdhui` le cockpit de la journée — la règle d'atterrissage
 * (`vue-initiale.ts`) choisit entre les deux, et les deux sont des arrivées.
 *
 * ── POURQUOI CETTE LISTE VIT ICI, ET PAS DANS `vues.ts` ─────────────────────
 * `vues.ts` est déclaré **strictement append-only, une ligne par écran**
 * (`LOT_L5.md` §1) : y ajouter un champ à `DefinitionVue` toucherait les onze
 * lignes existantes, c'est-à-dire exactement ce que ce régime interdit. La
 * navigation, elle, est un module de L5a, et « qu'est-ce qu'une racine » est une
 * question de navigation.
 *
 * Le défaut par défaut est le bon : une vue AJOUTÉE demain n'est pas une racine,
 * elle reçoit donc un retour. L'oubli produit un bouton en trop, jamais un
 * cul-de-sac — et c'est le cul-de-sac qui a fait échouer la recette novice.
 */
const VUES_RACINE: readonly CodeVue[] = ['accueil', 'aujourdhui'];

/** La vue est-elle une arrivée ? (voir `VUES_RACINE`) */
export function estVueRacine(vue: CodeVue): boolean {
  return VUES_RACINE.includes(vue);
}

/**
 * Le réducteur. Pur, donc testable sans DOM — ce qui compte, parce que c'est lui
 * qui garantit qu'on ne dépile jamais la racine.
 */
export function reducteurNavigation(
  etat: EtatNavigation,
  action: ActionNavigation,
): EtatNavigation {
  switch (action.type) {
    case 'aller':
      return vueCourante(etat) === action.vue ? etat : { pile: [...etat.pile, action.vue] };
    case 'remplacer':
      return { pile: [...etat.pile.slice(0, -1), action.vue] };
    case 'retour':
      return etat.pile.length > 1 ? { pile: etat.pile.slice(0, -1) } : etat;
    case 'racine':
      return { pile: [action.vue] };
    case 'restaurer':
      // La pile restaurée est déjà normalisée par `restaurerNavigation` ; la
      // garde « jamais vide » reste ici, parce que c'est le réducteur qui en
      // répond, et non ses appelants.
      return action.etat.pile.length === 0 ? ETAT_NAVIGATION_INITIAL : action.etat;
  }
}

/**
 * Restaure la pile depuis `meta.vueCourante` — reprise instantanée (03 §17.4).
 *
 * ── B2 (recette novice A54, 2026-09-06) : LA REPRISE POSAIT UN CUL-DE-SAC ────
 * Elle rendait une pile d'UN élément, quelle que soit la vue mémorisée. Un
 * auditeur qui verrouille sur « Où en est la mission » et rouvre l'application
 * atterrissait donc sur cet écran avec `peutRevenir() === false` : ni bouton de
 * retour, ni geste système utile. En PWA installée, sans barre d'adresse, il n'y
 * avait plus AUCUNE sortie — le blocage définitif constaté à t+3 min.
 *
 * La vue mémorisée est donc reposée SUR sa racine. Le sommet de la pile ne
 * change pas — l'auditeur revient exactement où il était, ce que 03 §17.4
 * exige — mais il y a désormais un dessous, et donc une sortie.
 */
export function restaurerNavigation(valeurMemorisee: unknown): EtatNavigation {
  if (!estCodeVue(valeurMemorisee)) return ETAT_NAVIGATION_INITIAL;
  return estVueRacine(valeurMemorisee)
    ? { pile: [valeurMemorisee] }
    : { pile: [VUE_INITIALE, valeurMemorisee] };
}

/**
 * Capte le geste « retour » du système (bouton Android, balayage iPadOS).
 *
 * Le mécanisme : on maintient en permanence UNE entrée d'historique factice. Le
 * geste système la consomme, `popstate` se déclenche, on remonte d'un écran et on
 * repose l'entrée. Tant que `retour()` rend `true`, l'application ne se ferme
 * jamais ; quand elle rend `false` (on est à la racine), le geste suivant quitte
 * normalement — c'est le comportement attendu par l'utilisateur, et le forcer
 * serait le piéger dans l'application.
 */
export function useGesteRetourSysteme(retour: () => boolean): void {
  useEffect(() => {
    history.pushState({ axionRetour: true }, '');
    const auPopstate = (): void => {
      if (retour()) history.pushState({ axionRetour: true }, '');
    };
    window.addEventListener('popstate', auPopstate);
    return () => {
      window.removeEventListener('popstate', auPopstate);
    };
  }, [retour]);
}
