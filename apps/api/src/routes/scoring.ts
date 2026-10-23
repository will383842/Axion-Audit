// =============================================================================
// ROUTE DE CALCUL DES SCORES — 05 §8.5. Lot L8, incrément S1.
//
//   POST /v1/missions/:id/compute-scores   (sans corps)   → 200 { missionId, calculeLe, resultat }
//
// ── POLITIQUE : `mission`, PUIS LE RÔLE DANS LE SERVICE ─────────────────────
// Le crochet vérifie l'identité et le compte ; l'appartenance et le rôle se
// prouvent DANS LE DÉPÔT (`scoring/depot.ts`) : non-membre → 404 (même message
// qu'une mission inexistante, aucun oracle d'existence), membre non lead → 403.
// L'administrateur calcule toute mission. Décision de spec consignée dans
// `DECISIONS.md` (lot S1).
//
// ── ÉTANCHÉITÉ ──────────────────────────────────────────────────────────────
// Aucune marque `financier` : le calcul ne lit aucune table de chiffrage et sa
// réponse n'en porte aucune donnée (invariant 3). La réponse contient des
// identifiants et des codes de référentiel, jamais un nom de client (invariant 2).
//
// Traçabilité : E14 (consolidation, divergences) · E43 (conventions d'API).
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import { AppError, calculScoresReponseSchema, missionParamsSchema } from '@axion/shared';
import type { UtilisateurAuthentifie } from '../auth/depot.js';
import { contexteDepuisRequete } from '../domaines/journal/service.js';
import type { FournisseurZod } from '../http/zod.js';
import { calculerScoresDeMission } from '../scoring/service.js';

/** Politique : membre de la mission OU administrateur — le rôle `lead` se vérifie au service. */
const CONFIG_MISSION = { acces: { type: 'mission', parametreMission: 'id' } } as const;

/** Le rôle qui voit toute mission, membre ou non (03 §34.1). */
const ROLE_ADMIN = 'admin';

export const routesScoring: FastifyPluginAsync = async (app) => {
  const instance = app.withTypeProvider<FournisseurZod>();

  /** Le demandeur — jamais fabriqué : voir `routes/pilotage.ts`, même règle. */
  function demandeur(utilisateur: UtilisateurAuthentifie | null): {
    utilisateurId: string;
    estAdmin: boolean;
  } {
    if (utilisateur === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }
    return { utilisateurId: utilisateur.id, estAdmin: utilisateur.role === ROLE_ADMIN };
  }

  instance.post(
    '/missions/:id/compute-scores',
    {
      config: CONFIG_MISSION,
      schema: {
        params: missionParamsSchema,
        response: { 200: calculScoresReponseSchema },
      },
    },
    async (requete) =>
      calculerScoresDeMission(
        requete.params.id,
        demandeur(requete.utilisateur),
        contexteDepuisRequete(requete),
      ),
  );

  await Promise.resolve();
};
