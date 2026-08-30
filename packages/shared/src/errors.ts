// =============================================================================
// FORMAT D'ERREUR UNIQUE DE L'API — contrat 11 §3
// « Erreurs : format unique { error: { code, message, details? } } + statut HTTP
//   cohérent. Les codes vivent dans packages/shared (ERROR_CODES const) — JAMAIS de
//   littéral libre. »
// Invariant 5 : les messages sont en FRANÇAIS.
// Traçabilité : E43 (exécutabilité autopilote — conventions API épinglées).
// =============================================================================
import { z } from 'zod';

// =============================================================================
// LOCALE DE VALIDATION — invariant 5 : « Interface 100 % en français ».
//
// `error.details[].message` est recopié depuis Zod et affiché TEL QUEL par la PWA
// terrain (voir `apiErrorSchema.message` ci-dessous). Avec la locale par défaut, un
// auditeur en clientèle lisait « Too small: expected number to be >=1 » et
// « Invalid ISO datetime ». Un message d'erreur d'API affiché tel quel EST de
// l'interface : l'invariant 5 s'y applique sans exception.
//
// Zod 4 EMBARQUE la locale française (`z.locales.fr`, présent dans le paquet épinglé
// 4.4.3 — vérifié avant d'écrire une ligne). AUCUNE dépendance ajoutée : l'escalade
// 11 §8-1 ne s'applique pas.
//
// `z.config()` est GLOBAL au module `zod` du processus. `apps/api`, `apps/worker`,
// `apps/field`, `apps/hq` et `packages/shared` résolvent tous zod@4.4.3 vers le MÊME
// répertoire pnpm : un seul appel suffit, et il est posé ICI parce que c'est le module
// que tout consommateur de `@axion/shared` charge (index.ts le réexporte en premier).
// Il est aussi APPELÉ explicitement par le gestionnaire d'erreurs de l'API : un effet
// de bord d'import est vrai tant que personne ne réorganise les imports, un appel
// nommé reste vrai après.
//
// CE QUI N'EST PAS TRADUIT, ET NE DOIT PAS L'ÊTRE : le CODE. `ERROR_CODES` est ce que
// le front teste (11 §3 : « jamais de littéral libre ») ; seul le MESSAGE est localisé.
// =============================================================================

let localeAppliquee = false;

/** Applique la locale française de Zod au processus. Idempotent. */
export function appliquerLocaleFrancaiseZod(): void {
  if (localeAppliquee) return;
  z.config(z.locales.fr());
  localeAppliquee = true;
}

appliquerLocaleFrancaiseZod();

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
  /**
   * `POST|PATCH /v1/companies` — le SIREN présenté est DÉJÀ porté par une autre
   * fiche. Arbitré par `DECISIONS.md` du 2026-08-29 (« Les quatre codes d'erreur du
   * lot »), option 3 : **retenu, périmètre RÉDUIT au SIREN**.
   *
   * Le générique `CONFLICT` suffirait AUJOURD'HUI — cette route n'a qu'un seul 409
   * possible. Le code dédié est une assurance, et A01 en écrit le prix : 05 §8.3 et
   * M8.1 annoncent un référentiel partagé avec `external_ref` ; le jour où un second
   * conflit arrivera sur ces routes, un branchement front bâti sur un conflit nu
   * deviendrait faux **en silence**.
   *
   * ⚠ IL NE COUVRE PAS LA COLLISION DE NOM. Le nom n'a aucune unicité en base (04 :
   * l'index unique est PARTIEL, sur `siren` seul) ; une collision de nom rend donc
   * un **201 avec avertissement**, jamais ce code. Voir `companies.ts`.
   */
  COMPANY_DUPLICATE: 'COMPANY_DUPLICATE',

  // --- 413 / 415 / 429 -------------------------------------------------------
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',

  // --- 500 / 503 -------------------------------------------------------------
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * FILET DE L'INVARIANT 5 — dernier recours, pas mécanisme principal.
 *
 * La locale ci-dessus couvre les messages produits par Zod. Elle ne couvre PAS un
 * `message:` littéral écrit en anglais par un auteur de schéma, ni un éventuel trou de
 * la locale. Ce garde-fou attrape ces cas-là et rend un message français générique
 * plutôt qu'un message anglais : mieux vaut un message pauvre en français qu'un message
 * riche dans la mauvaise langue, sur un écran d'auditeur en clientèle.
 *
 * Aucun message français de la locale `fr` de Zod ne commence par l'un de ces
 * préfixes (« Entrée invalide », « Trop petit », « Trop grand », « Chaîne invalide »,
 * « Nombre invalide », « Clé non reconnue », « Valeur invalide ») : le filet ne peut
 * pas dégrader un message déjà correct.
 */
const PREFIXES_ANGLAIS = [
  'Invalid',
  'Too small',
  'Too big',
  'Unrecognized',
  'Required',
  'Expected',
  'Must be',
  'Not a',
  'String must',
  'Number must',
  'Array must',
] as const;

/** Message rendu quand un message de validation est resté en anglais. */
export const MESSAGE_VALIDATION_GENERIQUE = 'Valeur invalide.';

/** Rend `message` s'il est en français, le message générique français sinon. */
export function messageValidationFrancais(message: string): string {
  return PREFIXES_ANGLAIS.some((prefixe) => message.startsWith(prefixe))
    ? MESSAGE_VALIDATION_GENERIQUE
    : message;
}

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
  COMPANY_DUPLICATE: 409,
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
