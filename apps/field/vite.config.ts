// =============================================================================
// PWA TERRAIN — React 18 + Vite (11 §2 : « Pas de Next.js », décision ferme).
// L'app doit démarrer depuis le cache du service worker SANS serveur : c'est
// exactement ce que le SSR rendrait impossible.
//
// PÉRIMÈTRE L0 : coquille buildable. Le service worker Workbox, Dexie, la DEK/KEK
// et `storage.persist()` arrivent au lot L5a (11 §6) — les ajouter ici serait
// anticiper un lot, ce que le pipeline interdit.
// Traçabilité : E17, E6 (hors ligne total).
// =============================================================================
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { COULEURS_CHARTE } from '@axion/ui';

/**
 * Injecte la couleur de thème depuis les tokens (invariant 4 : une couleur n’a
 * qu’UNE source). Sans ce plugin, index.html porterait un second exemplaire de
 * la couleur d’action que personne ne penserait à mettre à jour le jour où la
 * charte bouge. scripts/check-invariants.mjs refuse d’ailleurs toute couleur
 * littérale hors de packages/ui : ce n’est pas un raffinement, c’est ce qui rend
 * la règle tenable SANS EXCEPTION.
 */
function injecterCouleurTheme(): Plugin {
  return {
    name: 'axion-couleur-theme',
    transformIndexHtml(html) {
      return html.replaceAll('%COULEUR_THEME%', COULEURS_CHARTE.terracotta);
    },
  };
}

export default defineConfig({
  plugins: [react(), injecterCouleurTheme()],
  // Servie à la racine du domaine par Caddy (`/` → field) — 11 §2, pas de CORS.
  base: '/',
  build: {
    outDir: 'dist',
    // Les sourcemaps ne partent pas en production : elles exposeraient la logique
    // de chiffrement local (06 §10.3) à quiconque ouvre l'inspecteur sur un iPad
    // laissé sans surveillance chez le client.
    sourcemap: false,
    target: 'es2022',
  },
  server: { port: 5173, host: true },
});
