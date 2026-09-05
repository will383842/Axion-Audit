// =============================================================================
// CONSOLE SIÈGE — React 18 + Vite (11 §2 : « Pas de Next.js »).
// Desktop-first (§33.4) : la console se pilote sur grand écran, contrairement à
// la PWA terrain qui se pilote au doigt.
//
// PÉRIMÈTRE L0 : coquille buildable. Les 7 espaces arrivent aux lots L7-L8 et en
// Phase 2 ; TanStack Query est réservé à cette app (11 §1 : « console uniquement »).
// Traçabilité : E17, E22 (console de pilotage).
// =============================================================================
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { COULEURS_CHARTE } from '@axion/ui';
import { BASE_CONSOLE } from './src/app/base.js';

/**
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
  // Servie sous `/hq` par Caddy — le chemin de base DOIT le refléter, sinon les
  // assets sont demandés à la racine et c'est la PWA terrain qui répond.
  base: `${BASE_CONSOLE}/`,
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
  server: { port: 5174, host: true },
});
