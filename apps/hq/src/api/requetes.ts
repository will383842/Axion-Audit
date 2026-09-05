// =============================================================================
// REQUÊTES DE LA CONSOLE — TanStack Query 5 (11 §1 : « console UNIQUEMENT »).
//
// Pourquoi ici et pas dans le terrain : la console est TOUJOURS en ligne et lit
// des listes qui bougent pendant qu'on les regarde (une sync pousse des réponses).
// TanStack apporte le cache, la revalidation et la pagination keyset par
// `useInfiniteQuery` — exactement ce que 11 §3 impose (`?limit=&after=`, jamais
// d'offset : le curseur est OPAQUE, la console ne le lit pas, elle le rend).
//
// AUCUN hook ne consomme le `signal` d'annulation de TanStack — décision, pas
// oubli : la console n'a que des lectures courtes, une réponse dépassée est de
// toute façon écartée par le cache, et l'`AbortSignal` traverse mal les REALMS
// (sous jsdom, un `Request` undici refuse le signal du DOM simulé — le serveur
// factice d'A36 tomberait AVANT de router, et l'écran dirait « hors ligne » à
// tort). Le client, lui, garde l'option `signal` pour un appelant qui en a besoin.
//
// Chaque hook nomme sa route, son schéma et sa clé de cache. Les clés sont des
// tableaux structurés (`['missions', id]`) pour qu'une invalidation par préfixe
// (`['missions']`) atteigne tout ce qui dépend d'une mission.
//
// Traçabilité : E22 (console de pilotage 7 espaces), E43 (exécutabilité
// autopilote — conventions d'API).
// =============================================================================
import { createContext, useContext } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ClientApi } from './client.js';
import {
  companyResponseSchema,
  missionResponseSchema,
  pageSchema,
  PAGINATION_LIMIT_DEFAUT,
} from './contrats.js';

// ── Le client, fourni par la racine de l'application ─────────────────────────

const ContexteClientApi = createContext<ClientApi | null>(null);

export const FournisseurClientApi = ContexteClientApi.Provider;

export function useClientApi(): ClientApi {
  const client = useContext(ContexteClientApi);
  if (client === null) {
    throw new Error('Aucun client d’API fourni : enveloppez l’arbre dans <FournisseurClientApi>.');
  }
  return client;
}

// ── Clés de cache ────────────────────────────────────────────────────────────

export const CLES = {
  missions: () => ['missions'] as const,
  portefeuille: () => ['missions', 'portefeuille'] as const,
  mission: (id: string) => ['missions', id] as const,
  entreprise: (id: string) => ['entreprises', id] as const,
};

// ── Schémas de page ──────────────────────────────────────────────────────────

const pageMissionsSchema = pageSchema(missionResponseSchema);

/**
 * `GET /v1/missions?limit=&after=` — le portefeuille (03 §18.4, §22.3 espace 1).
 * Curseur `(created_at, id)` ascendant, figé par `LOT_L3.md` §2. `nextCursor:
 * null` = fin de liste, sans ambiguïté (`pagination.ts`).
 */
export function usePortefeuille() {
  const client = useClientApi();
  return useInfiniteQuery({
    queryKey: CLES.portefeuille(),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      client.lire('/missions', pageMissionsSchema, {
        query: { limit: PAGINATION_LIMIT_DEFAUT, after: pageParam },
      }),
    getNextPageParam: (derniere) => derniere.nextCursor ?? undefined,
  });
}

/** `GET /v1/missions/:id` — la fiche (L3b). */
export function useMission(id: string) {
  const client = useClientApi();
  return useQuery({
    queryKey: CLES.mission(id),
    queryFn: () => client.lire(`/missions/${id}`, missionResponseSchema),
  });
}

/** `GET /v1/companies/:id` — le client de la mission (L3b), pour l'afficher par son nom. */
export function useEntreprise(id: string) {
  const client = useClientApi();
  return useQuery({
    queryKey: CLES.entreprise(id),
    queryFn: () => client.lire(`/companies/${id}`, companyResponseSchema),
  });
}
