// =============================================================================
// ROUTES DE SYNCHRONISATION — lot L6, incrément L6a « la montée ».
//
//   POST /v1/sync/push   05 §8 / §9.3 — route LISTÉE, aucune entrée de création.
//   GET  /v1/sync/pull   11 §4 / 05 §9.5 — incrément L6b « la descente ».
//
// ── LA POLITIQUE EST EN TROIS COUCHES, ET C'EST ASSUMÉ ──────────────────────
//   ① ROUTE : `roles: ['admin','consultant']` — qui ENTRE. `lecteur` et `analyste`
//      ne collectent pas (03 §34.1) : 403 avant toute lecture de la charge.
//      L'admin entre parce qu'en Phase 1 il est le seul auditeur (03 §34.1, « tu es
//      seul auditeur ») ; il n'écrit que SES sessions, comme tout le monde.
//   ② LOT (service) : membre de la mission annoncée, en `lead` ou `consultant` —
//      sinon 404 (non-membre, mission inconnue) ou 403 (membre sans droit
//      d'écriture). Rien n'est écrit, aucune ligne `sync_log`.
//   ③ OP (service + proprietaire.ts) : propriété §9.9 PAR LIGNE → `forbidden`.
//
// Pourquoi pas `type: 'proprietaire_session'` : cette politique exige un paramètre
// d'URL désignant LA session, or un lot en porte jusqu'à 100, de cinq entités. La
// propriété est donc prouvée op par op, dans le service — c'est ce que dit le
// commentaire de `AccesProprietaireSession` (auth/politique.ts).
//
// Traçabilité : E7, E9 · invariant 3 · 05 §9.3, §9.9 · 11 §3, §4.
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  TAILLE_MORCEAU_MAX_OCTETS,
  corpsTerminerPieceSchema,
  isoUtcSchema,
  lotPushSchema,
  parametresMorceauSchema,
  parametresPieceSchema,
  reponseMorceauSchema,
  reponsePullSchema,
  reponsePushSchema,
  reponseStatutPieceSchema,
  reponseTerminerPieceSchema,
} from '@axion/shared';
import type { FournisseurZod } from '../http/zod.js';
import { LIMITE_PULL_MAX, pousserLot, tirerDelta } from './service.js';
import { lireStatutEnvoi, recevoirMorceau, terminerEnvoi } from './chunks.js';

const CONFIG_PUSH = { acces: { type: 'roles', roles: ['admin', 'consultant'] } } as const;
/** Le pull lit : mêmes rôles globaux que le push, l'appartenance est vérifiée au service. */
const CONFIG_PULL = CONFIG_PUSH;

/**
 * Paramètres du pull, nommés comme au 11 §4 (`mission_id`, `since`, `limit`) ; le
 * service les reçoit en camelCase. `since` est EXCLUSIF et doit être en UTC (`Z`).
 */
const requetePullSchema = z.object({
  mission_id: z.uuid(),
  since: isoUtcSchema.optional(),
  limit: z.coerce.number().int().min(1).max(LIMITE_PULL_MAX).optional(),
});

export const routesSync: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * `POST /v1/sync/push {missionId, deviceId, operations[≤100], outboxRemaining}`.
   * Un lot mal formé ou de plus de 100 ops est refusé EN ENTIER par le schéma
   * partagé : 400 `VALIDATION_FAILED`, rien n'est écrit.
   */
  instance.post(
    '/sync/push',
    {
      config: CONFIG_PUSH,
      schema: { body: lotPushSchema, response: { 200: reponsePushSchema } },
    },
    async (requete) => {
      const utilisateur = requete.utilisateur;
      // Ceinture : le crochet ③ a posé l'utilisateur ou refusé la requête.
      if (utilisateur === null) {
        throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
      }
      return pousserLot(utilisateur.id, requete.body, requete.log);
    },
  );

  /**
   * `GET /v1/sync/pull?mission_id=&since=&limit=` (11 §4, 05 §9.5) — même porte
   * d'entrée que le push (① : `lecteur` et `analyste` globaux → 403), puis
   * l'appartenance à la mission, quel que soit le rôle sur elle (05 §9.9 : les
   * autres membres lisent). Paramètre illisible → 400 `VALIDATION_FAILED`.
   */
  instance.get(
    '/sync/pull',
    {
      config: CONFIG_PULL,
      schema: { querystring: requetePullSchema, response: { 200: reponsePullSchema } },
    },
    async (requete) => {
      const utilisateur = requete.utilisateur;
      if (utilisateur === null) {
        throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
      }
      const { mission_id: missionId, since, limit } = requete.query;
      return tirerDelta(utilisateur.id, { missionId, since, limit });
    },
  );

  await app.register(routesPieces);
};

// =============================================================================
// LES TROIS ROUTES DE CHUNKS — 05 §9.6, lot L6c-1 « les octets ».
//
// Un SOUS-PLUGIN encapsulé, pour deux réglages qui ne doivent valoir QUE pour
// ces routes et jamais pour le push JSON :
//   · l'analyseur `application/octet-stream` (le corps d'un morceau est le
//     binaire brut, jamais du JSON ni du base64) ;
//   · la limite de corps relevée à 5 Mio — la limite globale de 2 Mio (app.ts)
//     vise le JSON et reste intacte partout ailleurs. Un octet de plus → 413
//     `PAYLOAD_TOO_LARGE`, refusé avant toute lecture de la pièce.
// Même porte d'entrée que le push (① : `admin`/`consultant`) ; la propriété
// §9.9 étendue est vérifiée par pièce dans `chunks.ts`.
// =============================================================================
const CONFIG_PIECES = CONFIG_PUSH;

/** Le corps d'un morceau : les octets bruts, tels que l'analyseur les a lus. */
const corpsMorceauSchema = z.custom<Buffer>((valeur) => Buffer.isBuffer(valeur), {
  message: 'Le morceau doit être envoyé en octets bruts (application/octet-stream).',
});

const routesPieces: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: TAILLE_MORCEAU_MAX_OCTETS },
    (_requete, corps, terminer) => {
      terminer(null, corps);
    },
  );
  const instance = app.withTypeProvider<FournisseurZod>();

  instance.post(
    '/sync/attachments/:id/chunks/:index',
    {
      config: CONFIG_PIECES,
      bodyLimit: TAILLE_MORCEAU_MAX_OCTETS,
      schema: {
        params: parametresMorceauSchema,
        body: corpsMorceauSchema,
        response: { 200: reponseMorceauSchema },
      },
    },
    async (requete) => {
      const utilisateur = requete.utilisateur;
      if (utilisateur === null) {
        throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
      }
      const { id, index } = requete.params;
      return recevoirMorceau(utilisateur.id, id, index, requete.body);
    },
  );

  instance.get(
    '/sync/attachments/:id/status',
    {
      config: CONFIG_PIECES,
      schema: { params: parametresPieceSchema, response: { 200: reponseStatutPieceSchema } },
    },
    async (requete) => {
      const utilisateur = requete.utilisateur;
      if (utilisateur === null) {
        throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
      }
      return lireStatutEnvoi(utilisateur.id, requete.params.id);
    },
  );

  instance.post(
    '/sync/attachments/:id/complete',
    {
      config: CONFIG_PIECES,
      schema: {
        params: parametresPieceSchema,
        body: corpsTerminerPieceSchema,
        response: { 200: reponseTerminerPieceSchema },
      },
    },
    async (requete) => {
      const utilisateur = requete.utilisateur;
      if (utilisateur === null) {
        throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
      }
      return terminerEnvoi(utilisateur.id, requete.params.id, requete.body, requete.log);
    },
  );
  await Promise.resolve();
};
