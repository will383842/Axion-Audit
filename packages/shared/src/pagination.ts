// =============================================================================
// PAGINATION KEYSET — contrat 11 §3
// « Pagination : keyset PARTOUT (?limit=50&after=<curseur>), JAMAIS d'offset.
//   Curseur = id ou timestamptz selon la ressource, documenté par route. »
// Pourquoi jamais d'offset : sur une liste qui bouge pendant la pagination (une sync
// terrain qui pousse des réponses), OFFSET saute ou duplique des lignes. Le curseur
// keyset est stable par construction.
// Traçabilité : E43.
// =============================================================================
import { z } from 'zod';

export const PAGINATION_LIMIT_DEFAUT = 50;
export const PAGINATION_LIMIT_MAX = 200;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGINATION_LIMIT_MAX).default(PAGINATION_LIMIT_DEFAUT),
  /** Curseur opaque renvoyé par la page précédente. Absent = première page. */
  after: z.string().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Enveloppe de page. `nextCursor: null` signifie « fin de la liste », sans ambiguïté. */
export function pageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
