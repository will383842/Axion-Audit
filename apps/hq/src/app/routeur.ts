// =============================================================================
// ROUTEUR DE LA CONSOLE — History API, sans dépendance. Lot L7a.
//
// ── POURQUOI PAS `react-router` ─────────────────────────────────────────────
// Il n'est pas dans la liste 11 §1, et l'ajouter est une escalade (11 §8-1) que
// rien ne justifie : la console a TROIS routes en L7a et une dizaine à terme. Ce
// que la console exige en revanche — et que le terrain n'exige pas — ce sont des
// URL RÉELLES : « drill-down partout, fil d'ariane constant » (03 §22.3), un lien
// de mission collable dans un message, le bouton « précédent » du navigateur
// qui remonte d'un écran. Trente lignes de `pushState`/`popstate` le font.
//
// Les trois routes de L7a :
//   `/`              → accueil, espace 1 « Tour de contrôle » (§22.3)
//   `/missions`      → portefeuille (liste dense keyset, §33.4)
//   `/missions/:id`  → avancement d'une mission, espace 2 « Pilotage mission »
//
// Les deux routes de L7b, en DRILL-DOWN sous une mission (§22.3 : « drill-down
// partout, fil d'ariane constant ») :
//   `/missions/:id/couverture`  → couverture par unité ET par source (§27.1)
//   `/missions/:id/agregation`  → réponses par question (M5.1, §27.4)
// Et celle de L7c :
//   `/missions/:id/export`      → export de mission au format §36.3
// Elles ne sont PAS des espaces de la barre latérale : les deux n'ont de sens
// qu'une fois une mission choisie. Les brancher sur un espace exigerait un
// sélecteur de mission, qui appartient à l'espace 6 et arrivera avec lui.
//
// La base vient de `base.ts`, partagée avec `vite.config.ts` : le routeur ne
// connaît pas `/hq` — un seul endroit le sait.
//
// Traçabilité : E22 (console de pilotage 7 espaces).
// =============================================================================
import { useSyncExternalStore, type MouseEvent } from 'react';
import { BASE_CONSOLE } from './base.js';

export type Route =
  | { readonly type: 'accueil' }
  | { readonly type: 'portefeuille' }
  | { readonly type: 'mission'; readonly id: string }
  | { readonly type: 'couverture'; readonly id: string }
  | { readonly type: 'agregation'; readonly id: string }
  | { readonly type: 'export'; readonly id: string }
  | { readonly type: 'inconnue'; readonly chemin: string };

export const ROUTE_ACCUEIL: Route = { type: 'accueil' };
export const ROUTE_PORTEFEUILLE: Route = { type: 'portefeuille' };

/** Un identifiant de mission est un UUID ; tout autre segment est une route inconnue. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pur : du chemin (déjà privé de la base) à la route. Testable sans DOM. */
export function analyserChemin(chemin: string): Route {
  const propre = chemin.replace(/\/+$/, '') || '/';
  if (propre === '/') return ROUTE_ACCUEIL;
  if (propre === '/missions') return ROUTE_PORTEFEUILLE;
  const mission = /^\/missions\/([^/]+)$/.exec(propre);
  if (mission?.[1] !== undefined && UUID.test(mission[1])) {
    return { type: 'mission', id: mission[1].toLowerCase() };
  }
  // Les sous-écrans d'une mission. Le segment de fin est FERMÉ (une alternance,
  // pas un joker) : un chemin inventé reste « inconnue » et rend l'écran qui le
  // dit, plutôt qu'un écran vide sur un identifiant qui n'existe pas.
  const sousEcran = /^\/missions\/([^/]+)\/(couverture|agregation|export)$/.exec(propre);
  const id = sousEcran?.[1];
  const vue = sousEcran?.[2];
  if (id !== undefined && UUID.test(id)) {
    if (vue === 'couverture') return { type: 'couverture', id: id.toLowerCase() };
    if (vue === 'agregation') return { type: 'agregation', id: id.toLowerCase() };
    if (vue === 'export') return { type: 'export', id: id.toLowerCase() };
  }
  return { type: 'inconnue', chemin: propre };
}

/** Pur : de la route au chemin, sans la base. L'inverse d'`analyserChemin`. */
export function cheminDeRoute(route: Route): string {
  switch (route.type) {
    case 'accueil':
      return '/';
    case 'portefeuille':
      return '/missions';
    case 'mission':
      return `/missions/${route.id}`;
    case 'couverture':
      return `/missions/${route.id}/couverture`;
    case 'agregation':
      return `/missions/${route.id}/agregation`;
    case 'export':
      return `/missions/${route.id}/export`;
    case 'inconnue':
      return route.chemin;
  }
}

function cheminCourant(): string {
  const { pathname } = window.location;
  return pathname.startsWith(BASE_CONSOLE) ? pathname.slice(BASE_CONSOLE.length) || '/' : pathname;
}

/** `href` complet d'une route — pour les `<a>`, qui restent de VRAIS liens. */
export function hrefDeRoute(route: Route): string {
  return `${BASE_CONSOLE}${cheminDeRoute(route)}`;
}

const abonnes = new Set<() => void>();
function notifier(): void {
  for (const abonne of abonnes) abonne();
}

function sAbonner(abonne: () => void): () => void {
  abonnes.add(abonne);
  window.addEventListener('popstate', abonne);
  return () => {
    abonnes.delete(abonne);
    window.removeEventListener('popstate', abonne);
  };
}

export function naviguer(route: Route): void {
  const href = hrefDeRoute(route);
  if (window.location.pathname !== href) {
    window.history.pushState(null, '', href);
    notifier();
  }
}

/** La route courante, resynchronisée à chaque `pushState` interne et `popstate`. */
export function useRoute(): Route {
  const chemin = useSyncExternalStore(sAbonner, cheminCourant, () => '/');
  return analyserChemin(chemin);
}

/**
 * Gestionnaire de clic pour un `<a href>` interne : navigation SPA, sans
 * rechargement. Fonction pure (pas un hook) : utilisable dans une boucle de
 * rendu — une ligne de tableau, un élément de barre.
 */
export function auClicLienInterne(
  route: Route,
): (evenement: MouseEvent<HTMLAnchorElement>) => void {
  return (evenement) => {
    // Laisser le navigateur faire pour un clic modifié (nouvel onglet, etc.).
    if (
      evenement.defaultPrevented ||
      evenement.button !== 0 ||
      evenement.metaKey ||
      evenement.ctrlKey ||
      evenement.shiftKey ||
      evenement.altKey
    ) {
      return;
    }
    evenement.preventDefault();
    naviguer(route);
  };
}
