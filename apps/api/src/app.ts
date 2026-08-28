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
    //
    // PAS D'`errorResponseBuilder` ICI — ET C'EST UN CORRECTIF, PAS UN OUBLI.
    //
    // Le plugin ne RETOURNE pas ce que construit `errorResponseBuilder` : il le
    // `throw`. L'objet part donc au gestionnaire d'erreurs (erreurs.ts), qui décide
    // du statut à partir de `erreur.statusCode`.
    //
    // Un `errorResponseBuilder` qui rendait l'enveloppe nue `{ error: { code,
    // message } }` — sans `statusCode` — faisait donc rendre **500 au lieu de 429** :
    // aucune branche de erreurs.ts ne reconnaissait cet objet, il tombait dans
    // « Erreur interne non gérée ». Mesuré en recette : rafale de 340 requêtes,
    // 44 réponses 500.
    //
    // Le constructeur PAR DÉFAUT du plugin lève une vraie `Error` portant
    // `statusCode = 429` ; la branche 3 de erreurs.ts la reconnaît et rend
    // l'enveloppe française `RATE_LIMITED`. Le builder personnalisé était donc
    // REDONDANT avec cette branche — et c'est lui qui la neutralisait.
    // Les en-têtes `retry-after` et `x-ratelimit-*` sont posés par le plugin AVANT
    // la levée : ils survivent au passage par le gestionnaire d'erreurs, et la PWA
    // terrain peut caler son réessai dessus au lieu de marteler.
    //
    // Contre-indication à connaître avant de « rétablir » un builder : tout objet
    // qu'il rendrait DOIT porter `statusCode`, sans quoi le défaut revient.
    //
    // Un dépassement de quota reste un ÉVÉNEMENT D'EXPLOITATION : sans cette ligne,
    // il ne laisserait aucune trace (le 429 ne passe par aucun `log.error`) et un
    // abus deviendrait invisible — la correction ci-dessus aurait alors remplacé un
    // faux 500 bruyant par un vrai 429 muet. On journalise en `warn`, sans clé ni
    // adresse IP (donnée personnelle — 11 §2, 06 §10.4).
    onExceeded: (requete) => {
      requete.log.warn({ url: requete.url }, 'Quota dépassé — requête refusée (429)');
    },
  });

  // --- Format d'erreur unique (11 §3) ---------------------------------------
  enregistrerGestionErreurs(app);

  // --- Routes ----------------------------------------------------------------
  await app.register(routesSante, { prefix: '/v1' });

  return app;
}
