// =============================================================================
// ROUTE FINANCIÈRE — `GET /v1/scoping/:id/financials`. Lot L2, tâche T5.
// 05 §8 : « `/v1/scoping` (+ `/financials`, admin only) » — la route est au pack,
// aucune escalade `CLAUDE.md` §3-6.
//
// ── LA PHRASE QUI GOUVERNE TOUT CE FICHIER (03 §18.3, verbatim) ──────────────
// « L'auditeur voit son avance/retard, son plan, ses dates — il ne voit JAMAIS le
//   TJM, les montants, ni le devis. »
// Ce n'est pas une préférence d'affichage : un auditeur terrain qui découvrirait le
// tarif journalier vendu à son client changerait la relation commerciale, et une
// seule fuite suffit à la rompre.
//
// ── LES CINQ CEINTURES, ET CE QUE CETTE ROUTE PORTE ──────────────────────────
//  1. ROUTE (ici)     : `roles: ['admin'], financier: true`. NÉCESSAIRE, JAMAIS
//                       SUFFISANTE — une règle de route se contourne par une
//                       jointure faite ailleurs.
//  2. TYPE            : `lireFinanciersDuCadrage` exige `ContexteAdmin`.
//  3. SOURCES         : `scopingFinancials` n'est nommé que par le dépôt.
//  4. EXÉCUTION       : balayage sentinelle sur le registre `onRoute`.
//  5. SORTIE (ici)    : `schema.response[200]` — la réponse est REPASSÉE par le
//                       schéma partagé avant l'envoi (http/zod.ts). Un champ
//                       ajouté par mégarde au dépôt ne peut pas atteindre le
//                       réseau ; un champ retiré fait échouer la route en 500
//                       plutôt que de partir amputé en silence.
//
// ── POURQUOI `financier: true` ALORS QUE `roles: ['admin']` DIT DÉJÀ TOUT ────
// Parce que les deux ne disent pas la même chose. `roles` décide QUI ENTRE ;
// `financier` fait POSER LA MARQUE `ContexteAdmin`, sans laquelle le gestionnaire
// ne compile pas son appel au dépôt. Retirer `financier: true` ne « relâcherait »
// pas la route : elle NE COMPILERAIT PLUS. La marque est aussi ce qui permet au
// balayage d'énumérer les routes financières SANS liste écrite à la main.
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E19, E33, E43.
// =============================================================================
import type { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  scopingFinancialsParamsSchema,
  scopingFinancialsResponseSchema,
  type ScopingFinancialsResponse,
} from '@axion/shared';
import type { FournisseurZod } from '../http/zod.js';
import { contexteDepuisRequete, journaliserActivite } from '../domaines/journal/service.js';
import {
  lireFinanciersDuCadrage,
  type LigneFinanciere,
} from '../domaines/scoping/financiers.depot.js';

/**
 * Politique de la route. `admin` SEUL : le pack ne connaît pas de rôle
 * intermédiaire sur l'argent — 03 §34.1 (« Chiffrage & devis : ✔ admin SEUL ») et
 * §34.3 (« JAMAIS : le financier », y compris pour le lead de mission).
 */
const CONFIG_FINANCIERE = {
  acces: { type: 'roles', roles: ['admin'], financier: true },
} as const;

/** Traduit la ligne de base en contrat d'API : `Date` → ISO 8601 UTC (11 §3). */
function versReponse(ligne: LigneFinanciere): ScopingFinancialsResponse {
  return {
    scopingEstimateId: ligne.scopingEstimateId,
    dailyRates: ligne.dailyRates === null ? null : { ...ligne.dailyRates },
    travelCosts: ligne.travelCosts,
    totalAmount: ligne.totalAmount,
    currency: ligne.currency,
    updatedBy: ligne.updatedBy,
    updatedAt: ligne.updatedAt.toISOString(),
  };
}

export const routesScoping: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<FournisseurZod>().get(
    '/scoping/:id/financials',
    {
      config: CONFIG_FINANCIERE,
      schema: {
        params: scopingFinancialsParamsSchema,
        response: { 200: scopingFinancialsResponseSchema },
      },
    },
    async (requete) => {
      // Ceinture d'exécution : sur une route `financier: true`, le crochet ③ a posé
      // la marque ou a refusé la requête. Si elle manquait malgré tout, on ÉCHOUE —
      // on ne fabrique pas un contexte, et on ne « suppose » pas un administrateur.
      // Ce `if` n'est pas défensif au sens mou du terme : il est la contrepartie
      // d'exécution de la garantie de compilation, et le seul chemin par lequel un
      // remaniement du socle se signalerait ici plutôt que de s'ouvrir.
      const contexteAdmin = requete.contexteAdmin;
      if (contexteAdmin === null) {
        requete.log.error(
          { gabarit: '/v1/scoping/:id/financials' },
          "Route financière atteinte SANS marque d'administrateur : requête refusée",
        );
        throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
      }

      const ligne = await lireFinanciersDuCadrage(contexteAdmin, requete.params.id);

      if (ligne === null) {
        // Cadrage inconnu et cadrage sans volet financier rendent la MÊME chose. La
        // route étant déjà réservée aux administrateurs, ce n'est pas un secret
        // qu'on protège — c'est une distinction qui n'a aucune valeur pour
        // l'appelant et qui obligerait à une seconde lecture, sur la table voisine.
        throw new AppError('NOT_FOUND', 'Aucune donnée financière pour ce cadrage.');
      }

      // « Qui a vu l'argent » (06 §10.5, note L2 §2.4) — APRÈS le succès, et jamais
      // COMBIEN : la variante `financier.consultation` du catalogue partagé ne
      // comporte aucun champ de montant, et cette absence est ce qui rend
      // l'interdiction inexprimable plutôt que seulement écrite.
      await journaliserActivite(
        {
          action: 'financier.consultation',
          utilisateurId: contexteAdmin.utilisateurId,
          cadrageId: ligne.scopingEstimateId,
        },
        contexteDepuisRequete(requete),
      );

      return versReponse(ligne);
    },
  );

  await Promise.resolve();
};
