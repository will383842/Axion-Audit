#!/usr/bin/env node
// =============================================================================
// CONSTRUCTION DU SERVICE WORKER — Workbox 7 en `injectManifest`, sans greffon
//
// ── L'ARBITRAGE QUE CE SCRIPT EXÉCUTE ───────────────────────────────────────
// `LOT_L5.md` §5-1 posait la question : `vite-plugin-pwa` n'est pas dans la liste
// épinglée 11 §1, et Workbox 7 seul n'a pas d'intégration Vite. A01 a tranché :
// **aucune dépendance nouvelle** — `workbox-build` en `injectManifest` depuis ce
// script. Ajouter le greffon aurait été une escalade 11 §8-1 ; l'éviter coûte les
// quarante lignes ci-dessous, une fois.
//
// ── POURQUOI DEUX ÉTAPES ────────────────────────────────────────────────────
// `injectManifest` de `workbox-build` ne COMPILE rien : il remplace
// `self.__WB_MANIFEST` dans un fichier JS déjà empaqueté. Le source est en
// TypeScript et importe `workbox-precaching` — il faut donc l'empaqueter d'abord.
// C'est Vite (déjà présent) qui s'en charge, en format IIFE : les service workers
// de type `module` ne sont pleinement disponibles que sur les navigateurs
// récents, et 03 §22.1 désigne l'iPad comme la cible la plus dure. Un socle
// offline qui ne s'installe pas sur la cible la plus dure ne sert à rien.
//
// ── CE QUE LE PRÉCACHE CONTIENT, ET CE QU'IL EXCLUT ─────────────────────────
// Le shell, les polices AUTO-HÉBERGÉES (11 §1 : « jamais de CDN de police :
// offline oblige ») et les icônes. Aucune route `/api` (`LOT_L5.md` §3.1).
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E17 (stack imposée :
// Hetzner, Docker, PG, Fastify, Vite/React).
// =============================================================================
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { injectManifest } from 'workbox-build';

const RACINE_APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(RACINE_APP, 'dist');
const SW_SOURCE = resolve(RACINE_APP, 'sw/service-worker.ts');
const SW_BUNDLE = resolve(DIST, 'sw.js');

// --- Étape 1 : empaqueter le source TypeScript -------------------------------
await build({
  configFile: false,
  root: RACINE_APP,
  logLevel: 'warn',
  build: {
    outDir: 'dist',
    // Le `vite build` principal a déjà écrit dist/ : le vider ici effacerait
    // l'application pour ne garder que le service worker.
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: SW_SOURCE,
      output: {
        entryFileNames: 'sw.js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});

// --- Étape 2 : injecter le manifeste de précache -----------------------------
const { count, size, warnings } = await injectManifest({
  swSrc: SW_BUNDLE,
  swDest: SW_BUNDLE,
  globDirectory: DIST,
  globPatterns: [
    'index.html',
    'manifest.webmanifest',
    'assets/**/*.{js,css}',
    // Polices auto-hébergées (@fontsource-variable/inter) et icônes : sans elles
    // dans le précache, le mode avion rend en police système et l'application a
    // l'air cassée exactement là où elle doit inspirer confiance (03 §33.1).
    'assets/**/*.{woff2,woff,svg,png,webp,ico}',
  ],
  // Le service worker ne se précache jamais lui-même.
  globIgnores: ['sw.js', '**/*.map'],
  // Un shell d'application dépasse rarement 5 Mo ; au-delà, c'est un défaut de
  // construction (une image non compressée), pas un besoin.
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
});

for (const avertissement of warnings) console.warn(`[sw] ${avertissement}`);
console.log(
  `[sw] ${String(count)} fichier(s) précaché(s), ${String(Math.round(size / 1024))} Kio — dist/sw.js`,
);
