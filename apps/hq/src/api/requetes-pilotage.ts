// =============================================================================
// REQUÊTES DE PILOTAGE — couverture et agrégation. Lot L7, incrément L7b.
//
// Séparé de `requetes.ts` (L7a) pour une raison de collision, pas de style :
// L7a, L7b et L7c travaillent en parallèle, et le seul fichier qu'ils partagent
// est `app/espaces.ts` (`LOT_L7.md` §1). Un second candidat commun se déclare ;
// ici, il s'évite.
//
// ── LES DEUX ENVELOPPES NE SONT PAS DES `{items, nextCursor}` ───────────────
// Les deux routes paginent en keyset (`?limit=&after=`, curseur OPAQUE, jamais
// d'offset — 11 §3), mais leur réponse porte AUSSI des chiffres qui ne se
// paginent pas : les MARGES de la couverture, les TOTAUX de l'agrégation. C'est
// pourquoi elles n'utilisent pas `pageSchema` : une marge glissée dans une
// enveloppe de page finirait par être recalculée sur la page, et ce serait un
// chiffre faux qui a l'air juste. Les hooks lisent donc ces chiffres sur la
// PREMIÈRE page — le serveur garantit qu'ils sont identiques sur toutes.
//
// ── AUCUN CALCUL ICI (invariant 6 : le siège produit, le navigateur affiche) ─
// Ces hooks concatènent des pages et ne recomptent rien. Sur FIL-GC — 150 unités,
// 60 sessions, ~8 000 réponses — recompter à chaque rendu ferait le travail du
// serveur à chaque frappe d'un filtre.
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E14
// (consolidation, divergences, radar) · E43 (exécutabilité autopilote :
// conventions d'API).
// =============================================================================
import { useInfiniteQuery } from '@tanstack/react-query';
import { useClientApi } from './requetes.js';
import {
  agregationMissionSchema,
  couvertureMissionSchema,
  PAGINATION_LIMIT_DEFAUT,
  type AgregationMission,
  type CouvertureMission,
} from './contrats.js';

/** Les clés de cache du pilotage — préfixées par `missions` comme celles de L7a. */
export const CLES_PILOTAGE = {
  couverture: (missionId: string) => ['missions', missionId, 'couverture'] as const,
  agregation: (missionId: string, filtre: FiltreAgregationUi, repondants: boolean) =>
    [
      'missions',
      missionId,
      'agregation',
      filtre.block ?? '',
      filtre.orgUnit ?? '',
      // Le paramètre des RÉPONDANTS fait partie de la clé, et ce n'est pas un
      // détail de cache : sans lui, la page déjà chargée SANS les noms serait
      // resservie après le clic sur « afficher les répondants », et l'écran
      // paraîtrait dire « aucun consentement » là où il n'a rien demandé.
      repondants ? 'avec-repondants' : 'sans-repondants',
    ] as const,
};

/** Le filtre tel que l'écran le tient — deux champs, jamais un objet libre. */
export interface FiltreAgregationUi {
  /** CODE de bloc, ou `null` pour « tous les blocs ». */
  readonly block: string | null;
  /** Identifiant d'unité auditée, ou `null` pour « toutes les unités ». */
  readonly orgUnit: string | null;
}

export const FILTRE_AGREGATION_VIDE: FiltreAgregationUi = { block: null, orgUnit: null };

/**
 * `GET /v1/missions/:id/coverage` — la couverture par unité ET par source.
 *
 * Curseur `(position, id)` sur les unités, IDENTIQUE à celui de l'arbre : les
 * deux listes se lisent côte à côte dans le même ordre. Le curseur est opaque et
 * la console ne le lit jamais — elle le rend tel qu'elle l'a reçu.
 */
export function useCouverture(missionId: string) {
  const client = useClientApi();
  return useInfiniteQuery({
    queryKey: CLES_PILOTAGE.couverture(missionId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      client.lire(`/missions/${missionId}/coverage`, couvertureMissionSchema, {
        query: { limit: PAGINATION_LIMIT_DEFAUT, after: pageParam },
      }),
    getNextPageParam: (derniere: CouvertureMission) => derniere.nextCursor ?? undefined,
  });
}

/**
 * `GET /v1/missions/:id/aggregation` — les réponses par question (M5.1).
 *
 * Le filtre fait PARTIE de la clé de cache : changer de bloc n'écrase pas la
 * page déjà chargée d'un autre bloc, et revenir dessus ne la recharge pas.
 *
 * ⚠ La limite est volontairement plus BASSE que le défaut : chaque question
 * transporte TOUTES ses réponses (une question à moitié répondue est un chiffre
 * faux), donc une page de 50 questions peut porter plusieurs centaines de lignes.
 * Vingt questions par page tiennent l'écran dense §33.4 sans faire voyager la
 * mission entière.
 */
export const QUESTIONS_PAR_PAGE = 20;

export function useAgregation(missionId: string, filtre: FiltreAgregationUi, repondants = false) {
  const client = useClientApi();
  return useInfiniteQuery({
    queryKey: CLES_PILOTAGE.agregation(missionId, filtre, repondants),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      client.lire(`/missions/${missionId}/aggregation`, agregationMissionSchema, {
        query: {
          limit: QUESTIONS_PAR_PAGE,
          after: pageParam,
          block: filtre.block ?? undefined,
          orgUnit: filtre.orgUnit ?? undefined,
          // `false` n'est PAS envoyé : l'absence du paramètre est déjà le défaut
          // côté serveur, et une porte de donnée personnelle se demande, elle ne
          // se refuse pas. Voir `DECISIONS.md` 2026-09-05.
          repondants: repondants ? 'true' : undefined,
        },
      }),
    getNextPageParam: (derniere: AgregationMission) => derniere.nextCursor ?? undefined,
  });
}
