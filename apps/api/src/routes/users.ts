// =============================================================================
// ROUTES DES COMPTES — `/v1/users`. Lot L2, tâche T3.
//
// ── LES HUIT ROUTES DÉCLARÉES (+ deux `HEAD` engendrées par Fastify), ET D'OÙ CHACUNE VIENT ──────────────────────────────────
//   GET    /v1/users                       ← la SEULE nommée par le pack (07, L2 ;
//                                            note L2 §4.5 : « premier consommateur
//                                            réel » de la pagination keyset)
//   POST   /v1/users                       ┐
//   PATCH  /v1/users/:id                   │ DECISIONS.md 2026-08-30
//   PATCH  /v1/users/:id/role              │ « [L2/T3] Le CRUD users n'est pas
//   PATCH  /v1/users/:id/deactivate        │   spécifié : onze silences »
//   PATCH  /v1/users/:id/habilitate        ┘
//   PATCH  /v1/users/:id/password-reset    ← DECISIONS.md 2026-08-31
//                                            « Comment un mot de passe se
//                                              réinitialise » (Williams)
//
// **Aucune route `DELETE`**, et ce n'est pas un oubli : le « D » de CRUD n'est
// jamais instancié par le pack, `users` n'a pas de `deleted_at` (04), et le cycle
// de sortie §34.4 dit « révocation + retrait des `mission_users` ». En créer une
// exigerait un amendement du fichier 04.
//
// ── POURQUOI QUATRE ACTES = QUATRE ROUTES, ET NON UN `PATCH` À TOUT FAIRE ───
// Le catalogue du journal distingue DÉJÀ `user.role_change`, `user.deactivate`,
// `user.habilitate` et `user.password_reset`. Les fondre rendrait `activity_log`
// incapable de NOMMER ce qui s'est passé — or l'invariant 7 exige que toute
// correction soit tracée. C'est le journal qui impose la forme de l'API.
//
// ── CE QUE CHAQUE ROUTE DÉCLARE, SANS EXCEPTION ─────────────────────────────
//   · `config.acces` — `roles: ['admin']` PARTOUT. 03 §34.1 : « la console est
//     ADMIN SEUL » ; §34.3 borne le lead de mission et exclut nommément « les
//     comptes ». Son ABSENCE empêcherait l'API de démarrer (auth/politique.ts) ;
//   · un schéma Zod d'ENTRÉE **et** de SORTIE, importés de `packages/shared`
//     (11 §3), en forme DÉCLARATIVE (`schema: { … }`). **Aucun `.parse()` manuel** :
//     la dette des routes d'auth a été soldée le 2026-08-30, on ne la recrée pas.
//
// ── PAS DE MARQUE `financier` ───────────────────────────────────────────────
// Aucune de ces routes ne touche `scoping_financials`. Elles n'ont donc pas
// `financier: true` — cette marque n'est pas un synonyme d'« admin », elle fait
// poser `request.contexteAdmin`, dont seul le dépôt financier a besoin.
// Traçabilité : E33 (sécurité), E43 (conventions d'API), E45 (habilitation §34.4).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  actionSansCorpsSchema,
  changeRoleRequestSchema,
  createUserRequestSchema,
  passwordResetRequestSchema,
  passwordResetResponseSchema,
  updateUserRequestSchema,
  userParamsSchema,
  userResponseSchema,
  type UserResponse,
} from '@axion/shared';
import type { FournisseurZod } from '../http/zod.js';
import { contratDeListe } from '../http/pagination.js';
import { contexteDepuisRequete } from '../domaines/journal/service.js';
import type { LigneUtilisateur } from '../domaines/users/depot.js';
import {
  changerLeRole,
  creerUnCompte,
  desactiverUnCompte,
  habiliterUnCompte,
  lireUnCompte,
  listerLesComptes,
  modifierUnCompte,
  reinitialiserLeMotDePasse,
} from '../domaines/users/service.js';

/**
 * La politique, la même pour les SEPT routes déclarées ici — et pour la HUITIÈME,
 * que Fastify ajoute seul : `HEAD /v1/users`, compagne du `GET`. Elle hérite de
 * cette politique sans être écrite nulle part, ce qui est le bon comportement et
 * mérite d'être su : une matrice rôle × route rédigée à la main l'oublierait.
 * `admin` SEUL — le pack ne connaît aucun rôle intermédiaire sur les comptes.
 */
const CONFIG_ADMIN = { acces: { type: 'roles', roles: ['admin'] } } as const;

/**
 * Traduit la ligne de base en contrat d'API : `Date` → ISO 8601 **UTC** (11 §3),
 * et **projection EXPLICITE** — jamais un `...ligne`.
 *
 * C'est ce qui garantit que `curseurCreatedAt` (la composante technique du curseur,
 * voir le dépôt) ne fuit pas dans la réponse, et ce qui ferait échouer la
 * compilation le jour où le dépôt exposerait un champ de plus sans qu'on l'ait
 * voulu. Le sérialiseur Zod est la ceinture suivante, pas la première.
 */
function versReponse(ligne: LigneUtilisateur): UserResponse {
  return {
    id: ligne.id,
    name: ligne.name,
    email: ligne.email,
    role: ligne.role,
    usageProfile: ligne.usageProfile,
    habilitatedAt: ligne.habilitatedAt === null ? null : ligne.habilitatedAt.toISOString(),
    isActive: ligne.isActive,
    lastLoginAt: ligne.lastLoginAt === null ? null : ligne.lastLoginAt.toISOString(),
    createdAt: ligne.createdAt.toISOString(),
    updatedAt: ligne.updatedAt.toISOString(),
  };
}

export const routesUsers: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * Identifiant de l'administrateur qui agit.
   *
   * Ceinture d'exécution : sur une route `roles`, le crochet ③ a posé
   * `requete.utilisateur` ou a refusé la requête. S'il était nul malgré tout, on
   * ÉCHOUE — on ne fabrique pas un auteur. Une ligne d'`activity_log` dont l'auteur
   * est deviné vaut moins que pas de ligne du tout : elle accuse quelqu'un.
   */
  function auteur(utilisateur: { readonly id: string } | null): string {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return utilisateur.id;
  }

  /**
   * `GET /v1/users` — LA route nommée par le pack, et le premier appelant réel de
   * la pagination keyset (`apps/api/src/http/pagination.ts`).
   *
   * Curseur `(created_at, id)`, ascendant, opaque et NON signé — le cadrage d'accès
   * vit dans `config.acces` et dans le dépôt, jamais dans le curseur.
   * `contratDeListe` fournit d'un bloc la chaîne de requête keyset
   * (`?limit=&after=`) et l'enveloppe `{ items, nextCursor }`.
   */
  instance.get(
    '/users',
    { config: CONFIG_ADMIN, schema: contratDeListe(userResponseSchema) },
    async (requete) => {
      const page = await listerLesComptes(requete.query);
      return { items: page.items.map(versReponse), nextCursor: page.nextCursor };
    },
  );

  /**
   * `GET /v1/users/:id` — lecture unitaire.
   *
   * CETTE ROUTE A ÉTÉ CÂBLÉE APRÈS COUP, ET LE MOTIF MÉRITE D'ÊTRE ÉCRIT ICI.
   * `lireUtilisateur` vivait dans le dépôt depuis la livraison de T3 SANS AUCUN
   * APPELANT — du code orphelin au sens du contrat §6, relevé par l'agent croisé
   * qui écrivait les tests, jamais par l'auteur ni par une relecture. Deux issues
   * seulement : supprimer la fonction, ou câbler la route. Le 05 §22 écrit « CRUD
   * /v1/users » sans détailler les verbes, et un CRUD sans lecture unitaire est un
   * manque, pas un choix — arbitrage de Williams, 2026-08-31.
   *
   * La fonction N'A PAS ÉTÉ SUPPRIMÉE PENDANT LE MONTAGE DU DOSSIER P-B, et c'est
   * délibéré : A01 était l'auteur de ce dossier, et ranger la pièce à conviction
   * avant l'inspection aurait ouvert la porte sur un dépôt propre parce que
   * l'audité avait fait le ménage.
   *
   * Même politique admin que le reste du CRUD : rien ici ne justifie une exception.
   * Fastify engendrera aussi `HEAD /v1/users/:id`, qui hérite de `config` — donc
   * de la politique et du crochet (éprouvé par `l2-crochets`).
   */
  instance.get(
    '/users/:id',
    {
      config: CONFIG_ADMIN,
      schema: { params: userParamsSchema, response: { 200: userResponseSchema } },
    },
    async (requete) => versReponse(await lireUnCompte(requete.params.id)),
  );

  /** `POST /v1/users` — création. `201`, et l'emplacement du compte créé dans le corps. */
  instance.post(
    '/users',
    {
      config: CONFIG_ADMIN,
      schema: { body: createUserRequestSchema, response: { 201: userResponseSchema } },
    },
    async (requete, reponse) => {
      const ligne = await creerUnCompte(
        auteur(requete.utilisateur),
        requete.body,
        contexteDepuisRequete(requete),
      );

      reponse.code(201);
      return versReponse(ligne);
    },
  );

  /**
   * `PATCH /v1/users/:id` — modification ordinaire : nom, adresse, profil d'usage.
   * Le rôle, l'activité, l'habilitation et le mot de passe ont chacun leur route.
   */
  instance.patch(
    '/users/:id',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: userParamsSchema,
        body: updateUserRequestSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (requete) => {
      const ligne = await modifierUnCompte(
        auteur(requete.utilisateur),
        requete.params.id,
        requete.body,
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  /** `PATCH /v1/users/:id/role` — l'acte que `user.role_change` sait décrire. */
  instance.patch(
    '/users/:id/role',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: userParamsSchema,
        body: changeRoleRequestSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (requete) => {
      const ligne = await changerLeRole(
        auteur(requete.utilisateur),
        requete.params.id,
        requete.body.role,
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  /**
   * `PATCH /v1/users/:id/deactivate` — étape 2 du cycle de sortie §34.4 : le compte
   * est révoqué ET ses jetons de rafraîchissement avec, dans la même transaction.
   * Idempotente : désactiver un compte déjà inactif réussit sans rien réécrire.
   */
  instance.patch(
    '/users/:id/deactivate',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: userParamsSchema,
        body: actionSansCorpsSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (requete) => {
      const ligne = await desactiverUnCompte(
        auteur(requete.utilisateur),
        requete.params.id,
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  /**
   * `PATCH /v1/users/:id/habilitate` — étape 4 de l'entrée §34.4 : l'admin pose
   * `habilitated_at` après le bac à sable et la cotation croisée. Idempotente, et
   * SANS réécriture d'une habilitation déjà prononcée (invariant 7).
   */
  instance.patch(
    '/users/:id/habilitate',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: userParamsSchema,
        body: actionSansCorpsSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (requete) => {
      const ligne = await habiliterUnCompte(
        auteur(requete.utilisateur),
        requete.params.id,
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  /**
   * `PATCH /v1/users/:id/password-reset` — mot de passe ENGENDRÉ par le serveur et
   * rendu **une seule fois**, dans cette réponse (DECISIONS.md 2026-08-31).
   *
   * ⚠ LA RÉPONSE DE CETTE ROUTE EST LE SEUL ENDROIT DU PRODUIT OÙ UN MOT DE PASSE
   * EN CLAIR CIRCULE. Elle ne doit être ni journalisée, ni mise en cache, ni
   * réémise : le serveur n'en garde que l'empreinte Argon2id et ne saura plus le
   * redire.
   *
   * Refus par défaut si le garde-fou §9.7 a quelque chose à dire — code dédié
   * `UNSYNCED_DATA_AT_RISK` (409), pour que le front sache qu'un forçage est
   * possible et le PROPOSE, au lieu de le deviner sous un `CONFLICT` muet.
   */
  instance.patch(
    '/users/:id/password-reset',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: userParamsSchema,
        body: passwordResetRequestSchema,
        response: { 200: passwordResetResponseSchema },
      },
    },
    async (requete) => {
      const resultat = await reinitialiserLeMotDePasse(
        auteur(requete.utilisateur),
        requete.params.id,
        requete.body.force,
        contexteDepuisRequete(requete),
      );

      return {
        userId: resultat.utilisateurId,
        password: resultat.motDePasse,
        forced: resultat.forcee,
      };
    },
  );

  await Promise.resolve();
};
