// =============================================================================
// PWA TERRAIN — React 18 + Vite (11 §2 : « Pas de Next.js », décision ferme).
// L'app doit démarrer depuis le cache du service worker SANS serveur : c'est
// exactement ce que le SSR rendrait impossible.
//
// PÉRIMÈTRE L5a : coquille PWA installable + service worker Workbox. Le service
// worker lui-même n'est PAS construit ici mais par `scripts/build-sw.mjs`
// (`injectManifest`, arbitrage A01 sur `LOT_L5.md` §5-1 : aucune dépendance
// nouvelle, donc pas de `vite-plugin-pwa`). Le `build` de `package.json` enchaîne
// les deux : le manifeste de précache ne peut être calculé qu'APRÈS que `dist/`
// existe.
// Traçabilité : E17 (stack imposée : Hetzner, Docker, PG, Fastify, Vite/React),
// E6 (hors ligne total, PC ET tablette).
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

/**
 * Émet `manifest.webmanifest`.
 *
 * GÉNÉRÉ et non versionné, pour la même raison que la couleur de thème :
 * `theme_color` et `background_color` SONT des couleurs de la charte, et un
 * fichier JSON versionné en porterait une seconde copie que personne ne mettrait
 * à jour le jour où la charte bouge (invariant 4).
 *
 * `display: standalone` n'est pas cosmétique : sur iPad, la persistance longue
 * durée d'IndexedDB exige l'installation « Sur l'écran d'accueil » (03 §22.1), et
 * c'est ce manifeste qui la rend possible. Sans lui, `storage.persist()` échoue et
 * aucune mission n'est embarquable (05 §31-2).
 *
 * Invariant 2 : aucun nom de client nulle part — le nom est celui du PRODUIT.
 */
function manifestePwa(): Plugin {
  const manifeste = {
    name: 'Axion Audit — Terrain',
    short_name: 'Axion Terrain',
    description: 'Collecte d’audit hors ligne.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'fr',
    dir: 'ltr',
    theme_color: COULEURS_CHARTE.terracotta,
    background_color: COULEURS_CHARTE.ivoire,
    icons: [],
  };

  return {
    name: 'axion-manifeste-pwa',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(manifeste, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), injecterCouleurTheme(), manifestePwa()],
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
