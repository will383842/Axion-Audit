// =============================================================================
// CONTRATS DES AFFECTATIONS DE TRAVAIL ET DE LA RÉAFFECTATION D'UNE SESSION.
// Lot L3, incrément L3d, tâche T1. Tables `work_assignments` et `interviews` (04).
//
//   GET   /v1/missions/:id/assignments      → `pageSchema(assignmentSchema)`
//   POST  /v1/missions/:id/assignments      → 201 `assignmentSchema`
//   PATCH /v1/interviews/:id/reassign       → 200 `interviewReassignResponseSchema`
//
// ── POURQUOI `reassign` VIT DANS CE FICHIER ─────────────────────────────────
// Elle ne touche pas `work_assignments` mais elle partage tout le reste avec elles :
// la garde d'habilitation du §34.4 (« un auditeur non habilité ne touche jamais un
// client »), la notion de périmètre d'un auditeur (§18.2) et le même lecteur. Lui
// donner un quatrième fichier de contrats aurait séparé deux moitiés d'une même
// règle.
//
// ── CE QUI NE PASSE PAS PAR CES ROUTES ──────────────────────────────────────
// Aucun montant, aucun taux journalier : `planned_days` est un VOLUME de travail,
// pas un coût — l'auditeur ne voit jamais le TJM (§18.3, invariant 3). Aucune
// donnée personnelle non plus dans la réponse de réaffectation : elle rend des
// IDENTIFIANTS, jamais le nom ni l'adresse de la personne rencontrée.
//
// Traçabilité : E25 (zéro oubli : plan d'entretiens et affectations, l'écran de
// couverture s'appuie dessus) · E33 (sécurité / RGPD : habilitation §34.4, aucune
// donnée personnelle rendue) · E43 (exécutabilité autopilote : conventions d'API,
// pagination keyset, schémas in ET out partagés).
// =============================================================================
import { z } from 'zod';
import { dateCivileSchema } from './missions.js';
import { isoUtcSchema } from './temps.js';

// -----------------------------------------------------------------------------
// VOCABULAIRES — recopiés des CHECK du 04 (même motif qu'en tête de
// `plan-entretiens.ts` : `packages/shared` ne peut pas importer le schéma Drizzle)
// -----------------------------------------------------------------------------

/** `interviews.status` — l'avancement RÉEL de la session. */
export const STATUTS_SESSION = ['non_demarre', 'en_cours', 'termine'] as const;

export type StatutSessionApi = (typeof STATUTS_SESSION)[number];

/** `interviews.schedule_status` — l'agenda (§25.2). La réaffectation n'y touche PAS. */
export const STATUTS_PLANIFICATION = [
  'a_planifier',
  'planifie',
  'confirme',
  'realise',
  'reporte',
  'annule',
] as const;

export type StatutPlanificationApi = (typeof STATUTS_PLANIFICATION)[number];

/**
 * Les deux statuts qui INTERDISENT la réaffectation (§34.4 : « autorisé UNIQUEMENT
 * si `status ≠ en_cours/termine` », « les sessions RÉALISÉES restent à leur
 * auteur »).
 *
 * C'est une DONNÉE, pas un `if` : le front peut griser le bouton avant l'appel, et
 * le service refuse avec le même vocabulaire.
 */
export const STATUTS_SESSION_NON_REAFFECTABLES = ['en_cours', 'termine'] as const;

export type StatutSessionNonReaffectable = (typeof STATUTS_SESSION_NON_REAFFECTABLES)[number];

/** Longueur maximale du motif de réaffectation — même ordre que le motif §32.2. */
export const MOTIF_REAFFECTATION_LONGUEUR_MAX = 2000;

// -----------------------------------------------------------------------------
// `work_assignments`
// -----------------------------------------------------------------------------

/**
 * Un volume de journées, transporté en CHAÎNE.
 *
 * `work_assignments.planned_days` est un `NUMERIC` (04) : `node-postgres` le rend
 * en chaîne, et le convertir en flottant IEEE-754 ferait de « 0,25 j » une valeur
 * approchée. Même règle que `montantDecimalSchema` (scoping.ts) et que
 * `weight_snapshot` — un NUMERIC ne devient jamais un `number` dans ce dépôt.
 */
export const joursPlanifiesSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Nombre de journées décimal attendu (ex. « 2.5 »)')
  .describe('Journées planifiées (NUMERIC), transportées en chaîne — jamais un flottant');

/**
 * En ENTRÉE, on accepte AUSSI un nombre JSON, normalisé en chaîne.
 *
 * L'asymétrie est délibérée et va dans le sens sûr : un client qui envoie `2.5` a
 * déjà, chez lui, un flottant — le refuser ne lui rendrait pas sa précision, cela
 * lui rendrait un 400 incompréhensible. Ce qui compte est que rien ne REDEVIENNE
 * un flottant après la base : la sortie, elle, est toujours la chaîne exacte que
 * PostgreSQL a stockée.
 */
export const joursPlanifiesEntreeSchema = z
  // `z.number()` de Zod 4 refuse déjà l'infini et le `NaN` : rien à ajouter.
  .union([joursPlanifiesSchema, z.number().nonnegative()])
  .transform((valeur) => (typeof valeur === 'number' ? String(valeur) : valeur));

/**
 * `POST /v1/missions/:id/assignments`.
 *
 * `missionId` n'est PAS dans le corps : il vient de l'URL. Le porter deux fois
 * créerait un désaccord possible entre les deux, et donc une question sans bonne
 * réponse (« lequel gagne ? »).
 *
 * Les quatre champs de dimensionnement sont facultatifs : le 04 les déclare tous
 * `NULL`, et une affectation qui dit seulement « cet auditeur, cette unité » est
 * une affectation valide — c'est même la première qu'on saisit.
 */
export const createAssignmentRequestSchema = z.strictObject({
  userId: z.uuid(),
  orgUnitId: z.uuid(),
  plannedInterviews: z.number().int().min(0).nullable().optional(),
  plannedDays: joursPlanifiesEntreeSchema.nullable().optional(),
  /** `DATE` du 04 : « AAAA-MM-JJ », jamais un instant — voir `dateCivileSchema`. */
  dateFrom: dateCivileSchema.nullable().optional(),
  dateTo: dateCivileSchema.nullable().optional(),
});

export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;

/** Une affectation, telle qu'elle sort de l'API. */
export const assignmentSchema = z.strictObject({
  id: z.uuid(),
  missionId: z.uuid(),
  userId: z.uuid(),
  orgUnitId: z.uuid(),
  plannedInterviews: z.number().int().nullable(),
  plannedDays: joursPlanifiesSchema.nullable(),
  dateFrom: dateCivileSchema.nullable(),
  dateTo: dateCivileSchema.nullable(),
});

export type Assignment = z.infer<typeof assignmentSchema>;

// -----------------------------------------------------------------------------
// `PATCH /v1/interviews/:id/reassign` (§34.4)
// -----------------------------------------------------------------------------

/** L'identifiant de la session dans l'URL. */
export const interviewParamsSchema = z.strictObject({
  id: z.uuid(),
});

export type InterviewParams = z.infer<typeof interviewParamsSchema>;

/**
 * Le corps de la réaffectation.
 *
 * **`motif` est OBLIGATOIRE**, et vide vaut absent : le §34.4 exige un motif, et
 * l'exiger « sauf si la chaîne est vide » reviendrait à ne pas l'exiger. Le champ
 * est nommé `newUserId` en camelCase (11 §3) ; le 05 §24.2 l'écrit `new_user_id`
 * parce qu'il décrit la charge utile en style base, pas le contrat TypeScript.
 *
 * ⚠ **Le TEXTE du motif n'est écrit nulle part** : `activity_log.meta` n'accepte
 * que du vocabulaire technique (`verifierValeursAtomiques`), et aucune colonne du
 * 04 ne l'accueille. Le journal enregistre QU'IL Y EN A EU UN. C'est la même
 * escalade que le motif de retour arrière (`DECISIONS.md` 2026-09-01 [L3b],
 * rattachée au §34.4 le 2026-09-02) — en attente de Williams.
 */
export const interviewReassignRequestSchema = z.strictObject({
  newUserId: z.uuid(),
  motif: z.string().trim().pipe(z.string().min(1).max(MOTIF_REAFFECTATION_LONGUEUR_MAX)),
});

export type InterviewReassignRequest = z.infer<typeof interviewReassignRequestSchema>;

/**
 * Ce que rend une réaffectation réussie : des IDENTIFIANTS et deux états.
 *
 * ── CE QUI N'Y EST PAS, ET C'EST LE POINT ───────────────────────────────────
 * Ni `personName`, ni `personEmail`, ni les notes : la réponse d'une réaffectation
 * n'a aucune raison de faire traverser au réseau la personne rencontrée. Le
 * `strictObject` du sérialiseur en fait une garantie mécanique, pas une intention.
 *
 * `conductedByAvant` est rendu parce que c'est ce que l'appelant ne peut plus lire
 * après coup — et c'est le cœur de la trace §34.4 (« l'historique d'un audit ne se
 * réécrit jamais » : la session change de mains, la mémoire du changement reste).
 */
export const interviewReassignResponseSchema = z.strictObject({
  id: z.uuid(),
  missionId: z.uuid(),
  orgUnitId: z.uuid(),
  conductedByAvant: z.uuid(),
  conductedByApres: z.uuid(),
  status: z.enum(STATUTS_SESSION),
  /** Inchangé par la réaffectation (§34.4) : rendu pour qu'on puisse le vérifier. */
  scheduleStatus: z.enum(STATUTS_PLANIFICATION),
  updatedAt: isoUtcSchema,
});

export type InterviewReassignResponse = z.infer<typeof interviewReassignResponseSchema>;
