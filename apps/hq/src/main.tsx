// =============================================================================
// Amorçage de la console siège — lot L0 (coquille).
// Traçabilité : E17.
// =============================================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@axion/ui/tokens.css';
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
