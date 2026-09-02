// =============================================================================
// Amorçage de la PWA terrain — lot L5a.
//
// Trois choses, dans cet ordre, et l'ordre compte :
//   1. les feuilles du design system — `tokens.css` pose les variables (dont la
//      police Inter AUTO-HÉBERGÉE, 11 §1 : « jamais de CDN de police ») et
//      `composants.css` ne fait que les consommer ;
//   2. l'enregistrement du service worker, sans lequel l'application ne démarre
//      pas hors réseau (invariant 1) ;
//   3. le rendu, sous le fournisseur qui ouvre la base et tient le verrou.
// Traçabilité : E17 (stack imposée : Hetzner, Docker, PG, Fastify, Vite/React),
// E6 (hors ligne total, PC ET tablette).
// =============================================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@axion/ui/tokens.css';
import '@axion/ui/composants.css';
import './app/coquille.css';
import { App } from './App.js';
import { FournisseurTerrain } from './app/contexte.js';
import { enregistrerServiceWorker } from './app/service-worker-client.js';

const racine = document.getElementById('racine');
if (!racine) {
  throw new Error("L'élément racine est introuvable : le document HTML est corrompu.");
}

enregistrerServiceWorker();

createRoot(racine).render(
  <StrictMode>
    <FournisseurTerrain>
      <App />
    </FournisseurTerrain>
  </StrictMode>,
);
