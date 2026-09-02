// =============================================================================
// LA BASE DE CHEMIN DE LA CONSOLE — une seule source, deux lecteurs.
//
// Caddy sert la console sous `/hq` (11 §2, infra/caddy). Cette valeur est lue par
// `vite.config.ts` (option `base`, pour les assets) ET par `routeur.ts` (pour
// les URL d'écran). Les deux ne peuvent pas diverger : ils lisent ici.
//
// Pourquoi pas `import.meta.env.BASE_URL` : Vitest le vaut `/`, et les tests
// d'A36 rendent la console sous `/hq/…` comme en production. Une base qui
// change selon l'outil qui exécute le code est une base qu'on ne peut pas tester.
//
// Traçabilité : E17 (stack imposée : Hetzner, Docker, PG, Fastify, Vite/React).
// =============================================================================

/** Sans barre finale. `vite.config.ts` en ajoute une (`/hq/`), le routeur non. */
export const BASE_CONSOLE = '/hq';
