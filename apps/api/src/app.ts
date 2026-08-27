// =============================================================================
// CONSTRUCTION DE L'INSTANCE FASTIFY — lot L0 (squelette).
//
// PÉRIMÈTRE VOLONTAIREMENT NU : ce fichier ne porte QUE l'infrastructure HTTP
// (sécurité, quotas, erreurs, sondes de santé). Aucune route métier, aucune table,
// aucune authentification — l'auth est le lot L2, les missions le lot L3.
// Voir DECISIONS.md 2026-08-27 « Squelette applicatif minimal des 5 espaces de
// travail dès L0 » : ce squelette existe pour rendre les critères L0 TESTABLES
// (images qui démarrent, healthcheck Compose, smoke test de déploiement).
// Traçabilité : E17, E33, E36, E43.
// =============================================================================
import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ERROR_CODES } from '@axion/shared';
import { loggerFastify } from './logger.js';
import { enregistrerGestionErreurs } from './erreurs.js';
import { routesSante } from './routes/sante.js';

export async function construireApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: loggerFastify,
    // Identifiant de requête présent dans chaque ligne de journal : c'est ce qui
    // permet de suivre une sync défaillante de bout en bout (02 §11.3).
    trustProxy: true,
    // Derrière Caddy, `trustProxy` fait porter le quota par IP sur la VRAIE IP
    // cliente et non sur celle du proxy (11 §3 : `/v1/auth/*` 10 req/min/IP).
    //
    // 06 §10.2 : taille maximale des entrées. Les pièces jointes ne passent PAS
    // par là (protocole de chunks §9.6, lot L6c) — cette limite vise le JSON.
    bodyLimit: 2 * 1024 * 1024,
  });

  // --- En-têtes de sécurité (06 §10.2) --------------------------------------
  // La CSP APPLICATIVE est portée par Caddy, qui sert les fronts
  // (infra/caddy/Caddyfile). Helmet durcit ici les réponses de l'API elle-même,
  // qui ne rend que du JSON : tout est donc verrouillé à `'none'`.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    // Pas de CORS (11 §2) : field, hq et l'API sont servis sous le MÊME domaine.
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  // --- Quotas (11 §3) --------------------------------------------------------
  // Global : 300 req/min/token. Le quota spécifique `/v1/auth/*` (10 req/min/IP)
  // est posé par A14 au lot L2, sur les routes d'authentification elles-mêmes.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Tant qu'il n'y a pas d'authentification (L0), la clé est l'IP. Au L2 elle
    // devient le sujet du jeton — sinon plusieurs consultants derrière le même NAT
    // client partageraient un quota, ce qui bloquerait une équipe en pleine mission.
    keyGenerator: (requete) => requete.ip,
    errorResponseBuilder: () => ({
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Trop de requêtes. Réessayez dans un instant.',
      },
    }),
  });

  // --- Format d'erreur unique (11 §3) ---------------------------------------
  enregistrerGestionErreurs(app);

  // --- Routes ----------------------------------------------------------------
  await app.register(routesSante, { prefix: '/v1' });

  return app;
}
