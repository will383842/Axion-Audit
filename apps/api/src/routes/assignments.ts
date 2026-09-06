// =============================================================================
// ROUTES DES AFFECTATIONS DE TRAVAIL — `/v1/missions/:id/assignments`.
// Lot L3, incrément L3d, tâche T6. Table `work_assignments` (04, §18.2).
//
//   GET  /v1/missions/:id/assignments   05 §24.2, « CRUD ajoutés, conventions
//   POST /v1/missions/:id/assignments   identiques » — les deux sont LISTÉES.
//
// **Aucune route `PATCH` ni `DELETE`**, et ce n'est pas un oubli : le §24.2 nomme
// la ressource sans nommer de verbe de modification, et le pack ne dit nulle part
// ce que défaire une affectation signifie pour les sessions déjà planifiées sur
// l'unité concernée. Créer ces routes exigerait de trancher cela — du produit, pas
// une convention. Même raisonnement, et mêmes mots, que `routes/missions.ts` sur le
// `DELETE`.
//
// ── CETTE ROUTE NE DÉCIDE RIEN ──────────────────────────────────────────────
// L'habilitation §34.4, l'appartenance de l'unité à la mission et le conflit de
// triplet vivent dans le service et le dépôt. Ici : valider l'I/O, appeler,
// projeter. L'`AppError` remonte au gestionnaire global qui lui donne son statut.
//
// Traçabilité : E25 (zéro oubli : plan d'entretiens et affectations) · E33
// (sécurité / RGPD : habilitation §34.4) · E43 (exécutabilité autopilote :
// pagination keyset, schémas in ET out).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  assignmentSchema,
  createAssignmentRequestSchema,
  missionParamsSchema,
  type Assignment,
} from '@axion/shared';
import type { FournisseurZod } from '../http/zod.js';
import { contratDeListe } from '../http/pagination.js';
import { creerUneAffectation, listerLesAffectations } from '../domaines/assignments/service.js';
import type { LigneAffectation } from '../domaines/assignments/depot.js';

/**
 * ADMIN SEUL — §34.1 (« la console est ADMIN SEUL », le lead y entre en Phase 2).
 *
 * §34.3 donne pourtant au lead le pouvoir « d'ajuster le plan d'entretiens et les
 * `work_assignments` de sa mission ». L'arbitrage du 2026-09-02 (identique à celui
 * de L3c) tranche pour la V1 : §34.1 borne la V1, §34.3 décrit un rôle qui n'a pas
 * encore d'écran, et ouvrir un droit sans l'interface qui le porte ouvre une
 * surface pour une fonctionnalité qui n'existe pas. Le jour où le lead entrera dans
 * la console, ce sera **une ligne ici** et un cadrage `mission_users` dans le DÉPÔT.
 */
const CONFIG_ADMIN = { acces: { type: 'roles', roles: ['admin'] } } as const;

/**
 * Traduit la ligne de base en contrat d'API — projection EXPLICITE, jamais un
 * `...ligne` : c'est ce qui ferait échouer la compilation le jour où le dépôt
 * exposerait un champ de plus sans qu'on l'ait voulu.
 *
 * `plannedDays` traverse en CHAÎNE (`NUMERIC` du 04) et `dateFrom`/`dateTo` en
 * « AAAA-MM-JJ » (`DATE` du 04). Leur faire traverser un `number` ou une `Date`
 * JavaScript leur donnerait respectivement un arrondi et une heure — donc un
 * fuseau, et une date de début qui bascule d'un jour à l'ouest de Greenwich.
 */
function versReponse(ligne: LigneAffectation): Assignment {
  return {
    id: ligne.id,
    missionId: ligne.missionId,
    userId: ligne.userId,
    orgUnitId: ligne.orgUnitId,
    plannedInterviews: ligne.plannedInterviews,
    plannedDays: ligne.plannedDays,
    dateFrom: ligne.dateFrom,
    dateTo: ligne.dateTo,
  };
}

export const routesAssignments: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * `GET /v1/missions/:id/assignments` — les affectations d'UNE mission.
   *
   * Curseur **`(id)` ascendant** : `work_assignments.id` est un UUID v7, dont
   * l'ordre lexicographique EST l'ordre de création — une seule composante suffit
   * donc à obtenir un ordre TOTAL, là où `missions` a besoin de `(created_at, id)`.
   * Opaque et NON signé : le cadrage d'accès vit dans `config.acces` et dans le
   * service, jamais dans le curseur.
   *
   * `contratDeListe` fournit la chaîne de requête keyset et l'enveloppe
   * `{ items, nextCursor }` ; `params` s'y ajoute parce que la liste est celle
   * d'une mission, pas du dépôt entier.
   */
  instance.get(
    '/missions/:id/assignments',
    {
      config: CONFIG_ADMIN,
      schema: { params: missionParamsSchema, ...contratDeListe(assignmentSchema) },
    },
    async (requete) => {
      const page = await listerLesAffectations(requete.params.id, requete.query);
      return { items: page.items.map(versReponse), nextCursor: page.nextCursor };
    },
  );

  /**
   * `POST /v1/missions/:id/assignments` — **201**.
   *
   * `missionId` vient de l'URL et n'est pas accepté dans le corps
   * (`strictObject`) : le porter deux fois créerait un désaccord possible entre les
   * deux, donc une question sans bonne réponse.
   *
   * Les refus, tous prononcés avant la moindre écriture : `404` mission inconnue ·
   * `400` unité hors mission ou compte inconnu · `403` compte désactivé ou **non
   * habilité** (§34.4) · `409` triplet déjà affecté (`UNIQUE` du 04).
   */
  instance.post(
    '/missions/:id/assignments',
    {
      config: CONFIG_ADMIN,
      schema: {
        params: missionParamsSchema,
        body: createAssignmentRequestSchema,
        response: { 201: assignmentSchema },
      },
    },
    async (requete, reponse) => {
      const ligne = await creerUneAffectation(requete.params.id, requete.body);

      reponse.code(201);
      return versReponse(ligne);
    },
  );

  await Promise.resolve();
};
