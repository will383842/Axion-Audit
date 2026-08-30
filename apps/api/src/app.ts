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
import { enregistrerSocleAutorisation } from './auth/politique.js';
import { enregistrerCompilateursZod } from './http/zod.js';
import { routesAuth } from './domaines/auth/routes.js';
import { routesSante } from './routes/sante.js';
import { routesScoping } from './routes/scoping.js';
import { routesUsers } from './routes/users.js';

// =============================================================================
// PÉRIMÈTRE DE CONFIANCE DES EN-TÊTES DE PROXY — correctif de sécurité.
// =============================================================================
// CE QUI ÉTAIT FAUX : `trustProxy: true` fait confiance à TOUS les sauts. Fastify
// retient alors l'entrée LA PLUS À GAUCHE de `X-Forwarded-For` — une valeur
// intégralement fournie par le client. Mesuré : on envoie `X-Forwarded-For:
// 9.9.9.9`, `request.ip` vaut `9.9.9.9`.
//
// CE QUE ÇA COÛTAIT, ET POURQUOI C'ÉTAIT URGENT : le plafond de 10 req/min/IP sur
// `/v1/auth/*` (11 §3) aurait été INOPÉRANT contre le bourrage d'identifiants —
// c'est-à-dire contre exactement ce pour quoi il existe : il suffisait de changer
// un en-tête à chaque essai. C'est la symétrie du raisonnement tenu sur le jeton :
// on refuse un `sub` non vérifié parce qu'il laisserait forger un quota illimité ;
// l'adresse, elle, n'était vérifiée par personne.
//
// NOTRE FRONTAL POSE BIEN `X-Real-IP` (infra/caddy/Caddyfile) — MAIS FASTIFY NE LE
// LIT PAS. Il lit `X-Forwarded-For`, que les frontaux COMPLÈTENT au lieu de
// remplacer. L'en-tête propre existe et ne sert à rien ici.
//
// CE QU'ON RETIENT : ne faire confiance qu'aux adresses PRIVÉES. La chaîne réelle
// (client → Traefik de Coolify → notre Caddy → API, cf. infra/docker-compose
// .coolify.yml) n'est faite que de conteneurs Docker, donc d'adresses RFC1918 ;
// la remontée s'arrête à la première adresse PUBLIQUE, qui est le client. Une
// forgerie placée à gauche devient inatteignable.
//
// POURQUOI PAS UN NOMBRE DE SAUTS : `trustProxy: <number>` échoue fermé dans
// Fastify 5 (`lib/request.js` : « Hop-count-only trust cannot validate the
// immediate peer ») — il ne ferait plus confiance à personne.
//
// CE QUE ÇA NE CORRIGE PAS, ET QUI DOIT ÊTRE VÉRIFIÉ SUR STAGING : si le frontal
// le plus externe n'ajoute RIEN à `X-Forwarded-For` tout en laissant passer celui
// du client, la chaîne ne contient aucune adresse publique et la forgerie
// redevient atteignable. Mesuré : ce cas rend la même chose AVANT et APRÈS — le
// correctif n'y perd rien, il n'y gagne rien non plus.
// =============================================================================
const SOUS_RESEAUX_DE_CONFIANCE = ['loopback', 'linklocal', 'uniquelocal'];

export async function construireApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: loggerFastify,
    // Périmètre de confiance des en-têtes de proxy — voir le bloc ci-dessus, qui
    // explique pourquoi ce n'est PLUS `true` et ce que ça change sur le quota.
    trustProxy: SOUS_RESEAUX_DE_CONFIANCE,
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

  // --- Compilateurs Zod (11 §3) — AVANT toute route -------------------------
  // Fastify lit ses compilateurs au moment où la ROUTE est déclarée, pas à la
  // requête : posés plus bas, ils ne s'appliqueraient qu'aux routes suivantes.
  // Ils rendent `schema: { body, querystring, params, response }` utilisable avec
  // des schémas Zod nus. Ils ne RENDENT PAS la déclaration obligatoire — voir
  // l'en-tête de http/zod.ts, qui dit précisément ce qu'ils ne font pas.
  enregistrerCompilateursZod(app);

  // --- Socle d'authentification et d'autorisation (invariant 3) --------------
  //
  // TOUT L'ORDRE DES CROCHETS VIT DANS CET APPEL, ET C'EST VOULU :
  //   ① identification (ne refuse JAMAIS) → ② quota → ③ autorisation.
  // Le quota est passé en ARGUMENT parce que sa position dans la chaîne n'est pas
  // une convention qu'on pourrait déplacer par mégarde : elle est dans la signature
  // de `enregistrerSocleAutorisation` (voir l'en-tête de auth/politique.ts, qui
  // explique pourquoi trois `addHook` successifs ne donneraient PAS cet ordre).
  //
  // Conséquence à connaître : à partir d'ici, TOUTE route enregistrée doit déclarer
  // `config.acces`. Sans quoi l'API NE DÉMARRE PAS — c'est le garde-fou, pas un
  // effet de bord.
  await enregistrerSocleAutorisation(app, async (instance) => {
    // --- Quotas (11 §3) ------------------------------------------------------
    // Global : 300 req/min/token. Le quota spécifique `/v1/auth/*` (10 req/min/IP)
    // est posé au lot L2/T2, sur les routes d'authentification elles-mêmes.
    await instance.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      //
      // CLÉ DU QUOTA : LE SUJET DU JETON, L'IP SEULEMENT EN REPLI.
      //
      // Le contrat 11 §3 dit « global 300 req/min/**token** » ; le code disait `.ip`.
      // Ce n'est pas un détail de nommage : derrière le NAT d'un client, une équipe
      // entière partage UNE adresse. Une synchronisation de fin de journée aurait
      // consommé le quota de tout le monde, et un auditeur aurait étranglé son
      // collègue assis à côté de lui.
      //
      // L'IP RESTE la clé de repli, et ce n'est pas un compromis mou : sans elle,
      // les requêtes ANONYMES (login, jetons invalides, sondes non authentifiées)
      // n'auraient plus aucune clé — donc plus aucun plafond. Basculer « sur le
      // jeton » sans repli aurait rendu le flot non authentifié ILLIMITÉ, c'est-à-dire
      // aurait ouvert exactement ce que le quota existe pour fermer.
      //
      // Cette ligne IMPOSE l'ordre des crochets : `identite` est posée par ① et
      // n'est jamais qu'un sujet CRYPTOGRAPHIQUEMENT VÉRIFIÉ. Lire un `sub` non
      // vérifié laisserait forger un quota illimité en changeant de jeton bidon à
      // chaque requête.
      keyGenerator: (requete) => requete.identite?.utilisateurId ?? requete.ip,
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
  });

  // --- Format d'erreur unique (11 §3) ---------------------------------------
  enregistrerGestionErreurs(app);

  // --- Routes ----------------------------------------------------------------
  await app.register(routesSante, { prefix: '/v1' });

  // Authentification (05 §8.1) — lot L2/T2. Le quota `/v1/auth/*` (10 req/min/IP,
  // 11 §3) est déclaré PAR ROUTE dans ce greffon et non ici : le poser au niveau du
  // préfixe supposerait qu'aucune route non-auth ne viendra jamais s'y ajouter, ce
  // qu'aucun mécanisme ne garantit. Voir `QUOTA_AUTH` dans domaines/auth/routes.ts.
  await app.register(routesAuth, { prefix: '/v1' });

  // Cadrage financier (05 §8, « `/v1/scoping` (+ `/financials`, admin only) ») —
  // lot L2/T5. Invariant 3 : c'est la SEULE route du produit qui touche
  // `scoping_financials`, et le balayage sentinelle vérifie que ça reste vrai à
  // l'exécution, sur le registre `onRoute` plutôt que sur une liste écrite à la main.
  await app.register(routesScoping, { prefix: '/v1' });

  // Comptes (07, ligne L2 : « CRUD users ») — lot L2/T3. Les SEPT routes sont
  // `admin` (03 §34.1 « la console est ADMIN SEUL », §34.3 « JAMAIS […] les
  // comptes » pour le lead). `GET /v1/users` est le PREMIER appelant réel de la
  // pagination keyset de `http/pagination.ts` — curseur `(created_at, id)`.
  await app.register(routesUsers, { prefix: '/v1' });

  return app;
}
