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
  isoUtcSchema,
  lotPushSchema,
  reponsePullSchema,
  reponsePushSchema,
} from '@axion/shared';
import type { FournisseurZod } from '../http/zod.js';
import { LIMITE_PULL_MAX, pousserLot, tirerDelta } from './service.js';

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
  await Promise.resolve();
};
