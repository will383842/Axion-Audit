// =============================================================================
// Amorçage de la console siège — lot L7a.
//
// Dans cet ordre, et l'ordre compte :
//   0. `app/zod-sans-jit` — AVANT tout autre import, parce que c'est le seul
//      rang où il agit : Zod sonde `eval` à la construction de son premier
//      schéma, et `@axion/shared` en construit dès son chargement ; sous la CSP
//      servie, cette sonde est une violation à chaque démarrage (A01, 2026-09-09) ;
//   1. les feuilles du design system — `tokens.css` pose les variables ET la
//      police Inter AUTO-HÉBERGÉE (11 §1 : « jamais de CDN de police »),
//      `composants.css` ne fait que les consommer ; puis la mise en page de la
//      console, qui ne définit aucun jeton ;
//   2. le rendu de `App`, qui porte lui-même son client d'API (cookies
//      same-origin, `api/auth.ts`) et son cache TanStack Query (11 §1 :
//      « console uniquement ») — les tests rendent le même `<App />`.
//
// Traçabilité : E17 (stack imposée : Hetzner, Docker, PG, Fastify, Vite/React),
// E22 (console de pilotage 7 espaces).
// =============================================================================
import './app/zod-sans-jit.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@axion/ui/tokens.css';
import '@axion/ui/composants.css';
import './app/coquille.css';
import { App } from './App.js';

const racine = document.getElementById('racine');
if (!racine) {
  throw new Error("L'élément racine est introuvable : le document HTML est corrompu.");
}

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
