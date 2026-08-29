// =============================================================================
// ROUTES D'AUTHENTIFICATION — `POST /v1/auth/{login,refresh,logout}`. L2, T2.
// 05 §8.1 · 11 §3.
//
// ── CE QUE CHAQUE ROUTE DÉCLARE, SANS EXCEPTION ───────────────────────────────
//   · `config.acces`  — la politique d'autorisation. Son ABSENCE empêche l'API de
//     démarrer (auth/politique.ts) : ce n'est pas une convention, c'est un refus de
//     booter.
//   · `config.rateLimit` — le quota `/v1/auth/*` (voir `QUOTA_AUTH` ci-dessous).
//   · un schéma Zod d'ENTRÉE **et** un schéma Zod de SORTIE, tous deux importés de
//     `packages/shared` (11 §3). Les deux sondes de santé du lot L0 en sont
//     dispensées ; cette dispense est héritée et NON EXTENSIBLE — elle ne crée aucun
//     précédent, et la sortie est ici REPASSÉE par son schéma avant l'envoi, ce qui
//     transforme la promesse en contrôle : un champ ajouté par mégarde au service
//     (une empreinte, un rôle) ne peut pas atteindre le réseau.
//
// ── POURQUOI `logout` N'EST PAS UNE ROUTE PUBLIQUE ────────────────────────────
// La note de conception L2 §5 fige la liste des routes publiques à QUATRE entrées :
// `/v1/health`, `/v1/health/ready`, `/v1/auth/login`, `/v1/auth/refresh`. `logout`
// n'y figure pas, et ce n'est pas un oubli : l'exiger authentifiée est ce qui permet
// de vérifier que le jeton présenté APPARTIENT à l'appelant (voir
// `revoquerJetonDeLUtilisateur`). Publique, la route aurait accepté de révoquer le
// jeton de n'importe qui pour quiconque en aurait observé un — un déni de service
// sur la synchronisation d'un auditeur, gratuit et anonyme.
// LE PRIX, ÉCRIT ICI : un client dont le jeton d'ACCÈS a expiré ne peut plus se
// déconnecter côté serveur. Il efface ses jetons localement et le rafraîchissement
// s'éteint à sa date d'expiration. C'est un défaut mineur, et c'est un défaut.
// Traçabilité : E5, E43.
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  loginRequestSchema,
  loginResponseSchema,
  logoutRequestSchema,
  logoutResponseSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  type AuthSession,
} from '@axion/shared';
import { prechaufferVerificationMotDePasse } from './mots-de-passe.js';
import { connecter, deconnecter, rafraichir, type SessionEmise } from './service.js';

/**
 * QUOTA DES ROUTES D'AUTHENTIFICATION — 10 req/min, clé = `request.ip` (11 §3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ CE PLAFOND N'EST PAS, AUJOURD'HUI, UN PLAFOND « PAR IP ».
 *   C'EST UN SEAU UNIQUE ET GLOBAL, PARTAGÉ PAR LA PLANÈTE ENTIÈRE.
 *   Observé maillon par maillon sur staging le 2026-08-29. Ce paragraphe décrit
 *   ce que le code FAIT, pas ce que le contrat DEMANDE — s'il décrivait le second,
 *   ce serait un garde-fou qui annonce plus qu'il ne fait.
 * ═══════════════════════════════════════════════════════════════════════════════
 * La chaîne réelle est client → Traefik (Coolify) → notre Caddy → API.
 *   · Traefik ÉCRASE bien `X-Forwarded-For` par l'adresse réelle du client. Correct.
 *   · Notre Caddy, lui, ne l'AJOUTE PAS : il le REMPLACE. Depuis Caddy 2.7,
 *     `reverse_proxy` n'append à `X-Forwarded-For` que si le pair immédiat figure
 *     dans `trusted_proxies` — et `infra/caddy/Caddyfile` n'en déclare AUCUN.
 *   · L'API reçoit donc `X-Forwarded-For: <adresse de Traefik>`, la MÊME pour tous
 *     les clients. `request.ip` est une CONSTANTE — pas une valeur forgeable :
 *     une constante.
 *
 * DEUX CONSÉQUENCES, TOUTES DEUX MAUVAISES, SUR CETTE ROUTE PRÉCISE — qui est
 * exactement la cible d'un bourrage d'identifiants :
 *   1. l'attaquant partage son seau avec les auditeurs légitimes ;
 *   2. surtout, LE PREMIER ATTAQUANT VENU VERROUILLE L'AUTHENTIFICATION DE TOUT LE
 *      MONDE — dix requêtes suffisent à rendre 429 à tous les autres. Déni de
 *      service à coût nul, et c'est le risque dominant tant que le point ci-dessous
 *      n'est pas corrigé.
 *
 * ── OÙ EST LE CORRECTIF, ET POURQUOI PAS ICI ─────────────────────────────────
 * Dans le `Caddyfile` (`trusted_proxies`), arbitré et tracé hors de ce lot. AUCUNE
 * compensation n'est inventée dans cette route : pas de clé de repli maison, pas de
 * verrouillage par compte improvisé, rien qui prétende protéger ce que la chaîne ne
 * permet pas encore de protéger. Deux mécanismes approximatifs valent moins qu'un
 * mécanisme et une mesure — et un plafond qu'on croit par IP alors qu'il est global
 * est plus dangereux qu'un plafond dont on sait ce qu'il vaut.
 *
 * ── POURQUOI LA CLÉ RESTE `request.ip` MALGRÉ TOUT ───────────────────────────
 * Parce que c'est ce que le contrat demande, et parce que la ligne redeviendra juste
 * le jour où `trusted_proxies` sera déclaré — sans qu'on ait à y revenir. Le
 * `keyGenerator` global (`identite?.utilisateurId ?? ip`, app.ts) est explicitement
 * REMPLACÉ : sur `logout`, qui est authentifiée, il aurait basculé sur l'identifiant
 * de compte, et un plafond anti-bourrage indexé sur l'identité de qui n'en a pas
 * encore prouvé n'a aucun sens.
 *
 * ── COMMENT VÉRIFIER LA CLÉ, PUISQUE LE JOURNAL NE LA DIT PAS ────────────────
 * `request.ip` est EXPURGÉ des journaux par la politique RGPD (`remoteAddress` sort
 * en `[masqué:rgpd]`). Une vérification de la clé de quota passe donc par les
 * en-têtes `x-ratelimit-*` de la réponse, ou par un test d'intégration qui injecte
 * deux adresses distinctes — jamais par la lecture d'un journal.
 *
 * ── CE QUI N'EST PAS PARTAGÉ ENTRE LES TROIS ROUTES ──────────────────────────
 * `@fastify/rate-limit` donne à chaque route qui déclare `config.rateLimit` son
 * PROPRE compteur (`store.child(...)`). Le préfixe `/v1/auth/*` tolère donc jusqu'à
 * 3 × 10 requêtes par minute et par clé, réparties sur trois chemins distincts. Le
 * budget qui compte — les tentatives de mot de passe sur `login` — reste bien à 10.
 * Un compteur unique pour le préfixe exigerait de poser à la main le limiteur rendu
 * par `app.rateLimit()`, dont le type déclaré est celui d'un crochet `preHandler` :
 * l'installer en `onRequest` demanderait une assertion de type, que la conception du
 * lot proscrit (« aucun `any`, aucune assertion »).
 */
const QUOTA_AUTH = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (requete: { readonly ip: string }): string => requete.ip,
} as const;

/** Politique + quota de `login` et `refresh` : appelées SANS jeton, par construction. */
const CONFIG_PUBLIQUE = { acces: { type: 'public' }, rateLimit: QUOTA_AUTH } as const;

/** Politique + quota de `logout` : voir l'en-tête de fichier. */
const CONFIG_AUTHENTIFIEE = { acces: { type: 'authentifie' }, rateLimit: QUOTA_AUTH } as const;

/**
 * Traduit la session interne en contrat d'API : les `Date` deviennent des ISO 8601
 * **UTC** (11 §3 — `toISOString()` rend toujours un `Z`, jamais l'heure locale).
 */
function versReponse(session: SessionEmise): AuthSession {
  return {
    accessToken: session.jetonAcces,
    refreshToken: session.jetonRafraichissement,
    tokenType: 'Bearer',
    accessExpiresAt: session.accesExpireLe.toISOString(),
    refreshExpiresAt: session.rafraichissementExpireLe.toISOString(),
    userId: session.utilisateurId,
  };
}

export const routesAuth: FastifyPluginAsync = async (app) => {
  // Le leurre d'Argon2id est fabriqué ICI, au démarrage, et non à la première
  // tentative de connexion sur un compte inexistant — sans quoi cette
  // tentative-là paierait DEUX Argon2id au lieu d'un et se distinguerait au
  // chronomètre. Mesuré : 450 ms contre 203 ms. Voir
  // `prechaufferVerificationMotDePasse`, qui porte la mesure et son raisonnement.
  await prechaufferVerificationMotDePasse();

  /**
   * Connexion. `{email, password}` → couple de jetons (05 §8.1).
   *
   * Aucune journalisation de l'échec ici : la note L2 §2.4 l'interdit nommément —
   * « jamais l'e-mail tenté : un échec sur une adresse inconnue créerait une trace
   * sur une NON-PERSONNE ». Le refus est déjà tracé par le gestionnaire d'erreurs
   * (code + URL, sans identité), et la ligne `activity_log` `auth.login.echec`
   * appartient à la porte d'écriture unique du journal (tâche T4).
   */
  app.post('/auth/login', { config: CONFIG_PUBLIQUE }, async (requete) => {
    const entree = loginRequestSchema.parse(requete.body);

    const session = await connecter(requete.server, {
      email: entree.email,
      motDePasse: entree.password,
    });

    return loginResponseSchema.parse(versReponse(session));
  });

  /**
   * Rotation. Le jeton présenté est révoqué et remplacé DANS LA MÊME TRANSACTION ;
   * un jeton révoqué et rejoué hors fenêtre de grâce révoque toute la famille
   * (06 §10.1). Les six issues sont décrites dans `service.ts`.
   */
  app.post('/auth/refresh', { config: CONFIG_PUBLIQUE }, async (requete) => {
    const entree = refreshRequestSchema.parse(requete.body);

    const session = await rafraichir(requete.server, requete.log, entree.refreshToken);

    return refreshResponseSchema.parse(versReponse(session));
  });

  /**
   * Déconnexion — révoque LE SEUL jeton présenté, s'il appartient à l'appelant.
   * Idempotente : la réponse est constante (voir `logoutResponseSchema`).
   */
  app.post('/auth/logout', { config: CONFIG_AUTHENTIFIEE }, async (requete) => {
    const entree = logoutRequestSchema.parse(requete.body);

    // Ceinture : sur une route `authentifie`, le crochet ③ a posé `utilisateur` ou
    // a refusé la requête. S'il était nul malgré tout, on ne devine pas un
    // propriétaire — on échoue. Un `logout` sans propriétaire connu ne pourrait
    // révoquer que « le jeton de quelqu'un », ce qui est exactement l'attaque que
    // l'authentification de cette route ferme.
    const utilisateur = requete.utilisateur;
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }

    await deconnecter(utilisateur.id, entree.refreshToken);

    return logoutResponseSchema.parse({ loggedOut: true });
  });
};
