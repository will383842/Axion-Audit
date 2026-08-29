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
import { contexteDepuisRequete } from '../journal/service.js';
import { prechaufferVerificationMotDePasse } from './mots-de-passe.js';
import { connecter, deconnecter, rafraichir, type SessionEmise } from './service.js';

/**
 * QUOTA DES ROUTES D'AUTHENTIFICATION — 10 req/min, clé = `request.ip` (11 §3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ CE PLAFOND N'EST « PAR IP » QUE PARCE QUE DEUX FICHIERS SE TIENNENT.
 *   TOUCHER À L'UN SANS L'AUTRE LE RAMÈNE À UN SEAU GLOBAL — OU L'OUVRE À LA
 *   FORGERIE. Les deux moitiés : `trusted_proxies` dans `infra/caddy/Caddyfile`
 *   et `trustProxy: ['loopback','linklocal','uniquelocal']` dans `app.ts`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * L'HISTOIRE, PARCE QU'ELLE EXPLIQUE POURQUOI CE BLOC EST SI INSISTANT — mesurée
 * maillon par maillon sur staging le 2026-08-29, pas déduite. La chaîne est
 * client → Traefik (Coolify) → notre Caddy → API. Traefik écrase bien
 * `X-Forwarded-For` par l'adresse réelle du client. Mais depuis Caddy 2.7,
 * `reverse_proxy` n'AJOUTE à cet en-tête que si son pair immédiat est un proxy
 * DÉCLARÉ DE CONFIANCE — sinon il l'ÉCRASE. Le `Caddyfile` n'en déclarait aucun :
 * l'API recevait `X-Forwarded-For: 10.0.1.6`, l'adresse de Traefik, POUR TOUS LES
 * CLIENTS DU MONDE. `request.ip` était une CONSTANTE — pas une valeur forgeable,
 * une constante — et ce plafond était un SEAU UNIQUE ET GLOBAL : dix requêtes
 * suffisaient à rendre 429 à toute la planète, déni de service à coût nul, sur la
 * route même que le plafond est censé protéger.
 *
 * `trusted_proxies` est désormais déclaré (commit `66a800a`), et `request.ip` est
 * de nouveau l'adresse du client. LA GARANTIE TIENT DONC AUJOURD'HUI — et elle
 * tient par un COUPLAGE, ce qui est précisément ce qu'on oublie : remettre
 * `trustProxy: true` côté API tout en gardant `trusted_proxies` côté Caddy
 * rouvrirait la forgerie (le client choisirait sa propre clé de quota) ; retirer
 * `trusted_proxies` en gardant le périmètre restreint ramènerait le seau global.
 * Chacun des deux fichiers porte l'avertissement vers l'autre.
 *
 * AUCUNE COMPENSATION N'EST INVENTÉE ICI — ni clé de repli maison, ni verrouillage
 * par compte improvisé. Un plafond dont on sait exactement ce qu'il vaut, plus une
 * mesure, valent mieux que deux mécanismes approximatifs.
 *
 * ── POURQUOI LA CLÉ EST `request.ip` ET NON LE SUJET DU JETON ────────────────
 * Le `keyGenerator` global (`identite?.utilisateurId ?? ip`, app.ts) est
 * explicitement REMPLACÉ : ce plafond existe contre le bourrage d'identifiants,
 * c'est-à-dire contre un appelant qui n'a précisément pas encore prouvé d'identité.
 * Sur `logout`, qui est authentifiée, la clé globale aurait basculé sur
 * l'identifiant de compte — un plafond anti-bourrage indexé sur l'identité de qui
 * n'en a pas encore prouvé n'a aucun sens.
 *
 * ── CE QU'IL COÛTE, ET QUI SE VERRA UN LUNDI MATIN ───────────────────────────
 * Le plafond est PAR IP, donc PAR SORTIE NAT. Une équipe d'audit entière derrière
 * l'adresse d'un client partage dix connexions par minute. Le contrat le veut ainsi
 * (11 §3 ; la bascule « par jeton » de la note L2 §3.2 ne concerne QUE le quota
 * global) — l'exploitation doit le savoir plutôt que le découvrir en clientèle.
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
   * Aucune journalisation de l'échec DANS CETTE ROUTE, et ce n'est pas un oubli :
   * la ligne `activity_log` `auth.login.echec` est écrite par le SERVICE, qui seul
   * connaît la cause du refus, et elle passe par la porte unique
   * (`domaines/journal/service.ts`, tâche T4). La note L2 §2.4 interdit nommément
   * d'y faire figurer l'adresse tentée — « un échec sur une adresse inconnue
   * créerait une trace sur une NON-PERSONNE » : le catalogue partagé rend cette
   * interdiction inexprimable (aucune variante n'a de champ d'adresse). Le refus
   * reste par ailleurs tracé par le gestionnaire d'erreurs (code + URL, sans
   * identité).
   *
   * `contexteDepuisRequete` ne transporte QUE `request.ip` et le journal de la
   * requête : l'adresse est légale dans la TABLE (06 §10.4) et interdite dans pino
   * (11 §2) — deux journaux, deux régimes, et c'est la porte qui tient la frontière.
   */
  app.post('/auth/login', { config: CONFIG_PUBLIQUE }, async (requete) => {
    const entree = loginRequestSchema.parse(requete.body);

    const session = await connecter(
      requete.server,
      { email: entree.email, motDePasse: entree.password },
      contexteDepuisRequete(requete),
    );

    return loginResponseSchema.parse(versReponse(session));
  });

  /**
   * Rotation. Le jeton présenté est révoqué et remplacé DANS LA MÊME TRANSACTION ;
   * un jeton révoqué et rejoué hors fenêtre de grâce révoque toute la famille
   * (06 §10.1). Les six issues sont décrites dans `service.ts`.
   */
  app.post('/auth/refresh', { config: CONFIG_PUBLIQUE }, async (requete) => {
    const entree = refreshRequestSchema.parse(requete.body);

    const session = await rafraichir(
      requete.server,
      requete.log,
      entree.refreshToken,
      contexteDepuisRequete(requete),
    );

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

    await deconnecter(utilisateur.id, entree.refreshToken, contexteDepuisRequete(requete));

    return logoutResponseSchema.parse({ loggedOut: true });
  });
};
