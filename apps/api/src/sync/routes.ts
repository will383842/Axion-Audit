// =============================================================================
// ROUTES DE SYNCHRONISATION — lot L6, incrément L6a « la montée ».
//
//   POST /v1/sync/push   05 §8 / §9.3 — route LISTÉE, aucune entrée de création.
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
import { AppError, lotPushSchema, reponsePushSchema } from '@axion/shared';
import type { FournisseurZod } from '../http/zod.js';
import { pousserLot } from './service.js';

const CONFIG_PUSH = { acces: { type: 'roles', roles: ['admin', 'consultant'] } } as const;

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

  await Promise.resolve();
};
