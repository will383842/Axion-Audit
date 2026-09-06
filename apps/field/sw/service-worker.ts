// =============================================================================
// SERVICE WORKER DE LA PWA TERRAIN — Workbox 7, mode `injectManifest`
//
// ── POURQUOI CE FICHIER N'EST PAS SOUS `src/` ───────────────────────────────
// Ce n'est pas un module de l'application : c'est un SECOND point d'entrée,
// empaqueté séparément par `scripts/build-sw.mjs`, exécuté dans un contexte qui
// n'a ni DOM ni React. Le ranger sous `src/` en ferait un module que rien
// n'importe — un orphelin, au sens exact où `check:graphe-modules` l'entend.
//
// ── AUCUNE DÉPENDANCE NOUVELLE ──────────────────────────────────────────────
// Arbitrage A01 sur le point ouvert `LOT_L5.md` §5-1 : pas de `vite-plugin-pwa`
// (hors liste 11 §1). `workbox-build` en `injectManifest` depuis un script, et
// `workbox-precaching` à l'exécution. Workbox 7 est épinglé au 11 §1 ; le greffon
// Vite ne l'est pas.
//
// ── LA RÈGLE DE CACHE, ET CE QU'ELLE INTERDIT ───────────────────────────────
// `LOT_L5.md` §3.1 : « précache du shell, des polices auto-hébergées et des icônes
// — et **AUCUNE mise en cache d'exécution de `/api`**. Un `StaleWhileRevalidate`
// sur l'API fabriquerait une seconde source de vérité et l'écart ne se verrait
// qu'en mission. » L'interface lit TOUJOURS IndexedDB (05 §9.2-3) ; un cache HTTP
// de l'API n'aurait aucun lecteur légitime et beaucoup de lecteurs accidentels.
//
// ── L'ACTIVATION NE S'IMPOSE JAMAIS ─────────────────────────────────────────
// 05 §31-1 : pas d'activation pendant un entretien. Ce fichier ne contient donc
// AUCUN `self.skipWaiting()` à l'installation : il attend un message explicite,
// que la page n'envoie que si aucune session n'est en cours
// (`src/app/service-worker-client.ts`).
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E17 (stack imposée :
// Hetzner, Docker, PG, Fastify, Vite/React).
// =============================================================================
/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

// Le manifeste est INJECTÉ à la construction par `scripts/build-sw.mjs`.
precacheAndRoute(self.__WB_MANIFEST);

// Retire les caches des versions précédentes de Workbox. Ne touche JAMAIS à
// IndexedDB : les données de collecte ne sont pas un cache (invariant 7).
cleanupOutdatedCaches();

// Toute navigation est servie par le shell précaché : c'est ce qui fait démarrer
// l'application « depuis le cache du service worker SANS serveur » (11 §2).
// `/api` est explicitement exclu — une requête d'API ne doit jamais recevoir du
// HTML, et surtout jamais une réponse mise en cache (§3.1).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
);

self.addEventListener('message', (evenement: ExtendableMessageEvent) => {
  const donnees: unknown = evenement.data;
  if (
    typeof donnees === 'object' &&
    donnees !== null &&
    'type' in donnees &&
    (donnees as { type?: unknown }).type === 'AXION_APPLIQUER_MISE_A_JOUR'
  ) {
    // Le SEUL chemin d'activation. Déclenché par un geste de l'auditeur, entre
    // deux entretiens, jamais par le service worker lui-même.
    void self.skipWaiting();
  }
});
