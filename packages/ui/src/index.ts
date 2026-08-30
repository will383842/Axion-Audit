// =============================================================================
// @axion/ui — design system Axion.
// Les TOKENS portent l'invariant 4 ; les COMPOSANTS portent la grille §33 (les
// quatre états, les ancres de cotation visibles, l'indicateur « Enregistré », le
// mode écran partagé, les cibles tactiles) pour les écrans du lot L5.
// Voir 09 §6 (« en parallèle A21 pose packages/ui + /design »).
//
// Deux feuilles de style à importer UNE FOIS dans le `main.tsx` de chaque front :
//   import '@axion/ui/tokens.css';      // jetons + police Inter auto-hébergée
//   import '@axion/ui/composants.css';  // styles des composants ci-dessous
// L'ordre compte : `composants.css` ne fait QUE consommer les variables posées
// par `tokens.css` — il n'en définit aucune.
// =============================================================================
export * from './tokens.js';
export * from './composants/index.js';
