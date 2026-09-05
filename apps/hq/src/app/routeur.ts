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
