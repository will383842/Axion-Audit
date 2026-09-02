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
  | { readonly type: 'racine'; readonly vue: CodeVue };

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
  }
}

/** Restaure la pile depuis `meta.vueCourante` — reprise instantanée (03 §17.4). */
export function restaurerNavigation(valeurMemorisee: unknown): EtatNavigation {
  return estCodeVue(valeurMemorisee) ? { pile: [valeurMemorisee] } : ETAT_NAVIGATION_INITIAL;
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
