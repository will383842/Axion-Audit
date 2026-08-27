// =============================================================================
// FORMAT D'ERREUR UNIQUE DE L'API — contrat 11 §3
// « Erreurs : format unique { error: { code, message, details? } } + statut HTTP
//   cohérent. Les codes vivent dans packages/shared (ERROR_CODES const) — JAMAIS de
//   littéral libre. »
// Invariant 5 : les messages sont en FRANÇAIS.
// Traçabilité : E43 (exécutabilité autopilote — conventions API épinglées).
// =============================================================================
import { z } from 'zod';

/**
 * Codes d'erreur du produit. Un code = une cause, jamais une reformulation.
 * Ajouter un code est une décision d'API : elle passe par une entrée DECISIONS.md
 * si elle n'est pas déjà nommée par le pack (11 §8.6).
 *
 * Les codes du contrat de sync (05 §9.3) — `applied`, `duplicate`, `superseded`,
 * `forbidden`, `error` — ne sont PAS des erreurs HTTP : ce sont des RÉSULTATS d'op,
 * livrés au lot L6a dans son propre type. Ne pas les confondre.
 */
export const ERROR_CODES = {
  // --- 400 : la requête est mal formée ou invalide ---------------------------
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CURSOR: 'INVALID_CURSOR',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',

  // --- 401 / 403 : identité et droits (invariant 3) --------------------------
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_HABILITATED: 'NOT_HABILITATED',

  // --- 404 / 409 : état de la ressource --------------------------------------
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ILLEGAL_STATE_TRANSITION: 'ILLEGAL_STATE_TRANSITION',

  // --- 413 / 415 / 429 -------------------------------------------------------
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',

  // --- 500 / 503 -------------------------------------------------------------
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Détail d'erreur : sert à pointer le champ fautif d'une validation Zod. */
export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/** L'enveloppe d'erreur, identique sur TOUTES les routes. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]),
    /** Message en français, destiné à être affiché tel quel (invariant 5). */
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Statut HTTP canonique de chaque code — « + statut HTTP cohérent » (11 §3). */
export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  INVALID_PAYLOAD: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REUSE_DETECTED: 401,
  FORBIDDEN: 403,
  NOT_HABILITATED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ILLEGAL_STATE_TRANSITION: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Erreur applicative portant son code. Le gestionnaire d'erreurs de Fastify la
 * traduit en réponse — aucune route ne construit d'enveloppe à la main.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: readonly z.infer<typeof errorDetailSchema>[] | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    details?: readonly z.infer<typeof errorDetailSchema>[],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS_BY_ERROR_CODE[code];
    this.details = details;
  }

  toResponse(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: [...this.details] } : {}),
      },
    };
  }
}
