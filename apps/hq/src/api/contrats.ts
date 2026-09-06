// =============================================================================
// CONTRATS D'API DE LA CONSOLE — la SEULE couture entre `apps/hq` et
// `packages/shared`. Lot L7, incrément L7a.
//
// Règle 11 §3 : « chaque route déclare son schéma Zod in/out depuis
// `packages/shared` ; le front importe LES MÊMES schémas ». Aucun écran de la
// console n'importe `@axion/shared` directement : tout passe par ce fichier, pour
// que le jour où un contrat bouge, il n'y ait qu'UN endroit à relire.
//
// ── POURQUOI CE FICHIER EXISTE ENCORE (revue croisée A37, B2) ─────────────────
// Rien n'y est redéfini : chaque schéma, constante et type d'API est un
// RÉ-EXPORT pur de `@axion/shared` (missions, entreprises, pagination, erreurs,
// auth). Le fichier reste pour deux raisons : (1) il nomme, en un seul endroit,
// le sous-ensemble du contrat que la console consomme réellement — la façade
// locale, dont `ERROR_CODES` ; (2) il porte ce que la console AJOUTE au contrat
// sans le modifier : les libellés français que le siège est le premier à
// afficher (`LIBELLES_NIVEAU_AUDIT`, `LIBELLES_PERIMETRE_GEO`).
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
import type { NiveauAuditMission, PerimetreGeoMission } from '@axion/shared';

// ── Ré-exports purs de `@axion/shared` — rien n'est redéfini ─────────────────
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
  companyResponseSchema,
  STATUTS_MISSION,
  PERIMETRES_GEO_MISSION,
  NIVEAUX_AUDIT_MISSION,
  OFFRES_COMMERCIALES_MISSION,
  FOURNISSEURS_LLM_MISSION,
  missionResponseSchema,
  LIBELLES_STATUT_MISSION,
} from '@axion/shared';
export type {
  ApiError,
  ErrorCode,
  IsoUtc,
  LoginRequest,
  LoginResponse,
  PaginationQuery,
  CompanyResponse,
  StatutMission,
  PerimetreGeoMission,
  NiveauAuditMission,
  MissionResponse,
} from '@axion/shared';

// ── Libellés propres à la console (pas dans L3 : la console est le premier
// écran qui les affiche). Exhaustifs par le type, comme `LIBELLES_STATUT_MISSION`.
export const LIBELLES_NIVEAU_AUDIT: Record<NiveauAuditMission, string> = {
  diagnostic_cadrage: 'diagnostic de cadrage',
  operationnel: 'opérationnel',
  strategique_groupe: 'stratégique groupe',
};

export const LIBELLES_PERIMETRE_GEO: Record<PerimetreGeoMission, string> = {
  france: 'France',
  multi_pays: 'multi-pays',
};

// ── Pilotage : couverture (§27.1, §16.6) et agrégation (M5.1, §27.4) — L7b ───
// Ré-exports PURS de `@axion/shared`, comme la section précédente : rien n'est
// redéfini ici, et la console n'importe `@axion/shared` nulle part ailleurs.
export {
  SOURCES_COLLECTE,
  LIBELLES_SOURCE_COLLECTE,
  DESCRIPTIONS_SOURCE_COLLECTE,
  KIND_HORS_GRILLE,
  couvertureMissionSchema,
  PROVENANCES_REPONSE,
  LIBELLES_PROVENANCE_REPONSE,
  LIBELLES_MOTIF_NON_COMMUNIQUE,
  agregationMissionSchema,
} from '@axion/shared';
export type {
  SourceCollecte,
  CelluleCouverture,
  UniteCouverte,
  MargesCouverture,
  CouvertureMission,
  ProvenanceReponse,
  MotifNonCommuniqueApi,
  ReponseAgregee,
  QuestionAgregee,
  AgregationMission,
} from '@axion/shared';
