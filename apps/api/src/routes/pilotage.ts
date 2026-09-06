// =============================================================================
// ROUTES DU PILOTAGE DE MISSION — la couverture et l'agrégation. Lot L7, L7b.
//
//   GET /v1/missions/:id/coverage      §16.6 + §27.1 — couverture unité × source
//   GET /v1/missions/:id/aggregation   §8.5 / M5.1   — réponses par question
//
// ── D'OÙ VIENNENT CES DEUX CHEMINS ──────────────────────────────────────────
// `GET /v1/missions/:id/aggregation?block=&service=` est LISTÉE au 05 §8.5 ; son
// paramètre `service` est remplacé par `orgUnit`, et cette substitution est
// documentée (`DECISIONS.md` 2026-09-05) : « service » désigne deux choses dans ce
// dépôt — la table `services` (les 11 fonctions du 11 §5) et le `kind` `service`
// de l'arbre — alors que l'unité auditée est TOUJOURS `org_unit_id` (04, note
// P2-1). Un paramètre ambigu se tranche, il ne se devine pas.
// `GET /v1/missions/:id/coverage` n'est listée NI au §8 NI au §24.2 : elle est
// documentée dans la même entrée `DECISIONS.md` (11 §8-6).
//
// ── CES ROUTES NE DÉCIDENT RIEN ─────────────────────────────────────────────
// Aucune règle de couverture, aucun seuil, aucun filtre métier n'apparaît ici :
// le dimensionnement vit dans le plan de L3, l'agrégation en SQL, l'assemblage
// dans deux fonctions pures, les refus dans le service. Ici : valider l'entrée,
// appeler, rendre. L'`AppError` remonte au gestionnaire global, qui lui donne son
// statut HTTP.
//
// ── CE QUE CHAQUE ROUTE DÉCLARE, SANS EXCEPTION ─────────────────────────────
//   · `config.acces` — son ABSENCE empêcherait l'API de DÉMARRER
//     (`auth/politique.ts`, crochet `onRoute`) ;
//   · un schéma Zod d'ENTRÉE **et** de SORTIE importé de `packages/shared` (11 §3),
//     en forme déclarative. **Aucun `.parse()` manuel, aucun `any`.**
//
// ── PAGINATION KEYSET, JAMAIS D'OFFSET ──────────────────────────────────────
// Les deux routes prennent `?limit=&after=<curseur>` ; le curseur est OPAQUE et
// n'est jamais lu par le front. Aucune ne connaît le mot `offset` : sur 150 unités
// et 8 000 réponses qu'une sync fait bouger, l'offset saute ou duplique des lignes.
//
// ── PAS DE MARQUE `financier`, ET C'EST VÉRIFIABLE ──────────────────────────
// Aucune de ces routes ne touche une table financière. Le pilotage dit COMBIEN de
// sessions et CE QU'ON A OBTENU ; jamais combien cela coûte (§18.3 — « l'auditeur
// ne voit jamais le TJM », invariant 3). Les deux schémas de réponse sont des
// `strictObject` : un champ ajouté par mégarde au service ne traverserait pas.
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E14
// (consolidation, divergences, radar) · E22 (console de pilotage 7 espaces) ·
// E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  agregationMissionSchema,
  agregationQuerySchema,
  AppError,
  couvertureMissionSchema,
  missionParamsSchema,
  paginationQuerySchema,
} from '@axion/shared';
import type { UtilisateurAuthentifie } from '../auth/depot.js';
import type { FournisseurZod } from '../http/zod.js';
import { etablirLaCouverture, etablirLAgregation } from '../domaines/pilotage/service.js';

/**
 * Politique : membre de la mission OU administrateur. Le crochet ③ vérifie
 * l'identité et le compte ; « membre de CETTE mission » se vérifie DANS LE DÉPÔT,
 * qui joint `mission_users` et rend 404 pour un non-membre.
 */
const CONFIG_MISSION = { acces: { type: 'mission', parametreMission: 'id' } } as const;

/** Le rôle qui voit toute mission, membre ou non (03 §34.1). */
const ROLE_ADMIN = 'admin';

export const routesPilotage: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /**
   * L'utilisateur qui demande.
   *
   * Ceinture d'exécution : sur une route `mission`, le crochet a posé
   * `requete.utilisateur` ou a refusé la requête. S'il était nul malgré tout, on
   * ÉCHOUE — on ne fabrique pas un demandeur, parce qu'un demandeur fabriqué
   * serait un contournement du cadrage par mission.
   */
  function demandeur(utilisateur: UtilisateurAuthentifie | null): {
    utilisateurId: string;
    estAdmin: boolean;
  } {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return { utilisateurId: utilisateur.id, estAdmin: utilisateur.role === ROLE_ADMIN };
  }

  /**
   * `GET /v1/missions/:id/coverage` — la couverture d'une mission.
   *
   * Curseur **`(position, id)` ascendant** sur les unités, identique à celui de
   * `GET /v1/missions/:id/org-units` : les deux listes rendent l'arbre dans le
   * MÊME ordre, sinon la couverture ne se lirait pas à côté de l'arbre.
   *
   * ⚠ **Les marges ne sont PAS dans l'enveloppe paginée** : elles portent sur la
   * mission entière et sont identiques d'une page à l'autre. C'est pour cela que
   * la réponse n'utilise pas `contratDeListe` — le `{items, nextCursor}` de la
   * pagination générique n'a pas de place pour un total qui ne se pagine pas.
   */
  instance.get(
    '/missions/:id/coverage',
    {
      config: CONFIG_MISSION,
      schema: {
        params: missionParamsSchema,
        querystring: paginationQuerySchema,
        response: { 200: couvertureMissionSchema },
      },
    },
    async (requete) =>
      etablirLaCouverture(requete.params.id, demandeur(requete.utilisateur), requete.query),
  );

  /**
   * `GET /v1/missions/:id/aggregation` — les réponses par question (M5.1).
   *
   * Curseur **`(position, id)` ascendant** sur `mission_questions` : l'ordre du
   * questionnaire figé. Les réponses d'une question voyagent AVEC elle et ne se
   * paginent pas — une question à moitié répondue est un chiffre faux.
   *
   * NON JOURNALISÉE : elle rend des réponses d'audit, c'est-à-dire la matière même
   * du client (11 §2, redaction pino).
   */
  instance.get(
    '/missions/:id/aggregation',
    {
      config: CONFIG_MISSION,
      schema: {
        params: missionParamsSchema,
        querystring: agregationQuerySchema,
        response: { 200: agregationMissionSchema },
      },
    },
    async (requete) =>
      etablirLAgregation(requete.params.id, demandeur(requete.utilisateur), requete.query),
  );

  await Promise.resolve();
};
