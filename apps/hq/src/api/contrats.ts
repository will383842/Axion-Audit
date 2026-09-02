// =============================================================================
// CONTRATS D'API DE LA CONSOLE — la SEULE couture entre `apps/hq` et
// `packages/shared`. Lot L7, incrément L7a.
//
// Règle 11 §3 : « chaque route déclare son schéma Zod in/out depuis
// `packages/shared` ; le front importe LES MÊMES schémas ». Aucun écran de la
// console n'importe `@axion/shared` directement : tout passe par ce fichier, pour
// que le jour où un contrat bouge, il n'y ait qu'UN endroit à relire.
//
// ── SECTION A — ce qui est sur `main` aujourd'hui ────────────────────────────
// Ré-exports purs. Rien n'est redéfini.
//
// ── SECTION B — EXTRAIT TRANSITOIRE de `lot/l3-suite` (À SUPPRIMER) ──────────
// Les schémas `missions` de L3 ne sont PAS encore sur `main` ; ils vivent sur
// `lot/l3-suite` (`packages/shared/src/missions.ts` @ 3742eef). Cette branche
// (`lot/l7a`) est née de `main` : les importer casserait `pnpm typecheck` jusqu'à
// la fusion de L3. Cette section recopie donc, À L'IDENTIQUE et avec sa
// provenance, les SEULES formes que L7a consomme. Ce n'est pas une variante, ni
// un mock : c'est une citation, vérifiable par
//   git show lot/l3-suite:packages/shared/src/missions.ts
// **Dette datée** : à l'atterrissage de L3 sur `main`, la section B devient
//   export { STATUTS_MISSION, NIVEAUX_AUDIT_MISSION, PERIMETRES_GEO_MISSION,
//            OFFRES_COMMERCIALES_MISSION, FOURNISSEURS_LLM_MISSION,
//            LIBELLES_STATUT_MISSION, missionResponseSchema,
//            companyResponseSchema } from '@axion/shared';
// et c'est le PREMIER point de la revue croisée A37 qui suit cette fusion
// (`docs/conception/LOT_L7.md` §3.a). `packages/shared` n'est PAS modifié ici.
//
// ── CE QUI N'EST PAS ICI, ET POURQUOI ────────────────────────────────────────
// `GET /v1/missions/:id/dashboard` (05 §8.3 : « complétude, à-revoir, dernière
// sync ») n'a AUCUN schéma partagé. La console ne l'appelle donc pas en L7a : un
// contrat que `packages/shared` ne porte pas n'existe pas pour le front (11 §3),
// et un schéma inventé ici serait exactement le « mock qui invente » que le
// brief refuse. La forme proposée est dans `docs/conception/LOT_L7.md` §5 ; elle
// entre dans `packages/shared` avec l'API de L7b, puis ici par ré-export.
//
// Traçabilité : E22 (console de pilotage 7 espaces), E43 (exécutabilité
// autopilote — conventions d'API), E39 (machine à états mission).
// =============================================================================
import { z } from 'zod';
import { isoUtcSchema } from '@axion/shared';

// ── SECTION A ────────────────────────────────────────────────────────────────
export {
  apiErrorSchema,
  ERROR_CODES,
  HTTP_STATUS_BY_ERROR_CODE,
  pageSchema,
  paginationQuerySchema,
  PAGINATION_LIMIT_DEFAUT,
  PAGINATION_LIMIT_MAX,
  isoUtcSchema,
  loginRequestSchema,
  loginResponseSchema,
} from '@axion/shared';
export type {
  ApiError,
  ErrorCode,
  IsoUtc,
  LoginRequest,
  LoginResponse,
  PaginationQuery,
} from '@axion/shared';

// ── SECTION B — extrait transitoire de lot/l3-suite @ 3742eef ────────────────
// (missions.ts, lignes 33-41, 457-476, 526, 579, 628-658, 846-852 ;
//  companies.ts, lignes 223, 393-411 — À L'IDENTIQUE)

export const NOM_ENTREPRISE_LONGUEUR_MAX = 300;

/** L'entreprise, telle que la rend `GET /v1/companies/:id` (L3b). */
export const companyResponseSchema = z.strictObject({
  id: z.uuid(),
  /** Id client de la console axion-ia.com (04) — `null` si l'entreprise est locale. */
  externalRef: z.string().nullable(),
  name: z.string().min(1).max(NOM_ENTREPRISE_LONGUEUR_MAX),
  /** `null` LÉGITIME : filiale étrangère sans SIREN (04, V2.2 · 03 §16). */
  siren: z.string().nullable(),
  nafCode: z.string().nullable(),
  /** `null` quand aucun code APE n'a permis de le pré-remplir — voir R4. */
  sectorId: z.uuid().nullable(),
  headcount: z.number().int().nullable(),
  sitesCount: z.number().int().nullable(),
  countries: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: isoUtcSchema,
  updatedAt: isoUtcSchema,
});
export type CompanyResponse = z.infer<typeof companyResponseSchema>;

/** Les cinq valeurs de `missions.status` (04, CHECK fermé). Ordre = 03 §32.2. */
export const STATUTS_MISSION = [
  'preparation',
  'en_cours',
  'en_analyse',
  'livree',
  'cloturee',
] as const;
export type StatutMission = (typeof STATUTS_MISSION)[number];

/** `missions.geo_scope` — périmètre COMMERCIAL de la mission (04 · V2.9). */
export const PERIMETRES_GEO_MISSION = ['france', 'multi_pays'] as const;
export type PerimetreGeoMission = (typeof PERIMETRES_GEO_MISSION)[number];

/** `missions.audit_level` — 03 §20.1 ; clé du gabarit de rapport (§32.6-3). */
export const NIVEAUX_AUDIT_MISSION = [
  'diagnostic_cadrage',
  'operationnel',
  'strategique_groupe',
] as const;
export type NiveauAuditMission = (typeof NIVEAUX_AUDIT_MISSION)[number];

/** `missions.commercial_offer` — NULL légitime. */
export const OFFRES_COMMERCIALES_MISSION = [
  'audit_flash',
  'audit_cible',
  'mission_pme',
  'mission_eti',
  'grand_programme',
] as const;

/** `missions.llm_provider` — DEFAULT 'anthropic' EN BASE (04), jamais dans ce code. */
export const FOURNISSEURS_LLM_MISSION = ['anthropic', 'ue_hosted'] as const;

export const TITRE_MISSION_LONGUEUR_MAX = 300;

/** Une date CIVILE (`DATE` en base) : `AAAA-MM-JJ`, sans heure ni fuseau. */
export const dateCivileSchema = z.iso.date();

/**
 * La mission, telle qu'elle est rendue par `GET /v1/missions[/:id]`.
 * **Aucun champ financier** : `scoping_financials` est réservé à ses routes admin
 * dédiées (invariant 3), et rien de cette table ne transite ici.
 */
export const missionResponseSchema = z.strictObject({
  id: z.uuid(),
  companyId: z.uuid(),
  parentMissionId: z.uuid().nullable(),
  title: z.string().min(1).max(TITRE_MISSION_LONGUEUR_MAX),
  geoScope: z.enum(PERIMETRES_GEO_MISSION),
  countryCode: z.string().nullable(),
  sizeTierId: z.uuid().nullable(),
  activeSectors: z.array(z.string()),
  activeBlocks: z.array(z.string()),
  auditLevel: z.enum(NIVEAUX_AUDIT_MISSION),
  commercialOffer: z.enum(OFFRES_COMMERCIALES_MISSION).nullable(),
  timezone: z.string().min(1),
  ndaRef: z.string().nullable(),
  ndaSignedAt: dateCivileSchema.nullable(),
  status: z.enum(STATUTS_MISSION),
  llmProvider: z.enum(FOURNISSEURS_LLM_MISSION),
  startPlanned: dateCivileSchema.nullable(),
  endPlanned: dateCivileSchema.nullable(),
  deliveredAt: isoUtcSchema.nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: isoUtcSchema,
  updatedAt: isoUtcSchema,
});
export type MissionResponse = z.infer<typeof missionResponseSchema>;

/** Libellés français des statuts — `Record` EXHAUSTIF PAR LE TYPE. */
export const LIBELLES_STATUT_MISSION: Record<StatutMission, string> = {
  preparation: 'préparation',
  en_cours: 'collecte en cours',
  en_analyse: 'analyse',
  livree: 'livrée',
  cloturee: 'clôturée',
};

// ── Libellés propres à la console (pas dans L3 : la console est le premier
// écran qui les affiche). Exhaustifs par le type, comme ci-dessus. ───────────
export const LIBELLES_NIVEAU_AUDIT: Record<NiveauAuditMission, string> = {
  diagnostic_cadrage: 'diagnostic de cadrage',
  operationnel: 'opérationnel',
  strategique_groupe: 'stratégique groupe',
};

export const LIBELLES_PERIMETRE_GEO: Record<PerimetreGeoMission, string> = {
  france: 'France',
  multi_pays: 'multi-pays',
};
