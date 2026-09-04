// =============================================================================
// CONTRAT DU PLAN D'ENTRETIENS — 03 §32.4 (règles d'échantillonnage), §17.3.
// Lot L3, incrément L3d, tâche T1.
//
//   GET /v1/missions/:id/interview-plan → `planEntretiensSchema`
//
// ── CE QUE LE PLAN EST, ET CE QU'IL N'EST PAS ───────────────────────────────
// Une CIBLE calculée, jamais des lignes `interviews` : le plan ne nomme aucun
// auditeur et n'écrit rien (`DECISIONS.md` 2026-08-31 — `interviews.conducted_by`
// est NOT NULL au 04, escalade ouverte ; `POST …/interview-plan/apply` est
// REPORTÉE). La route est donc un `GET`, et son résultat n'existe que le temps de
// la réponse.
//
// ── LA FORME PUBLIÉE EST CELLE DU BRIEF, PAS CELLE DU GÉNÉRATEUR ────────────
// Arbitrage A01 du 2026-09-02 : le contrat de fil est la vue **par unité** du brief
// L3D §5 — `unites[]`, `effectifInconnu`, `entretiens: {min, max}` —, parce que
// c'est le texte que l'implémenteur et le testeur avaient tous deux sous les yeux.
// La forme interne de `genererPlan` est plus riche ; cette richesse **s'ajoute**
// (`sessions[]`, `reglesAppliquees[]`, `totaux`), elle ne remplace pas la vue du
// brief. Une première version de ce fichier publiait l'inverse : elle est corrigée,
// pas défendue.
//
// ── POURQUOI CE FICHIER RECOPIE TROIS ÉNUMÉRATIONS ──────────────────────────
// `TYPES_SESSION`, `MODES_ENTRETIEN` et `GROUPES_INTERLOCUTEUR` existent déjà dans
// `apps/api/src/db/schema.ts`. La recopie est ASSUMÉE, et pour la raison déjà
// écrite au-dessus de `ROLES_JOURNALISABLES` (journal.ts) : `packages/shared` part
// dans un navigateur et ne peut pas importer le schéma Drizzle de l'API, et l'API
// ne peut pas être la source d'un contrat que le front doit connaître. Les valeurs
// sont celles des CHECK du fichier 04, sans une de plus.
//
// ── CE QUI NE SORT PAS D'ICI ────────────────────────────────────────────────
// Le plan porte des EFFECTIFS et des noms d'unités du client. C'est légitime dans
// une réponse (c'est la donnée de l'auditeur), et c'est précisément pourquoi cette
// route N'EST PAS JOURNALISÉE (11 §2 ; `DECISIONS.md` 2026-09-02). Les
// avertissements, eux, ne portent que des COMPTES : ils voyagent plus loin que la
// réponse.
//
// Traçabilité : E25 (zéro oubli : le plan d'entretiens, les contrôles, la
// couverture) · E40 (règles d'échantillonnage et ancres de cotation du §32.4) ·
// E4 (arbre organisationnel à profondeur libre : le plan se dimensionne unité par
// unité) · E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import { z } from 'zod';
import { NIVEAUX_AUDIT } from './banque-questions.js';
import { isoUtcSchema } from './temps.js';

// -----------------------------------------------------------------------------
// LES VOCABULAIRES — recopiés des CHECK du 04 (voir l'en-tête)
// -----------------------------------------------------------------------------

/** TYPE de session (§32.6) — distinct du MODE d'entretien. */
export const TYPES_SESSION = [
  'entretien',
  'observation',
  'demonstration',
  'analyse_documentaire',
  'releve_donnees',
  'atelier',
] as const;

export type TypeSessionPlan = (typeof TYPES_SESSION)[number];

/** MODE d'entretien (§32.6) — « complementaire » est un mode, jamais un type. */
export const MODES_ENTRETIEN = ['sur_site', 'distanciel', 'complementaire'] as const;

export type ModeEntretienPlan = (typeof MODES_ENTRETIEN)[number];

/** Hiérarchie des profils d'interlocuteur (`interlocutor_profiles.group_code`). */
export const GROUPES_INTERLOCUTEUR = ['direction', 'encadrement', 'terrain'] as const;

export type GroupeInterlocuteurPlan = (typeof GROUPES_INTERLOCUTEUR)[number];

/**
 * Les QUATRE tranches du §32.4, dans l'ordre du texte. Un code par tranche : le
 * front regroupe et explique sans réinterpréter un effectif.
 */
export const REGLES_ECHANTILLONNAGE_PLAN = [
  'unite_10_ou_moins',
  'unite_11_a_50',
  'unite_51_a_200',
  'unite_plus_de_200',
] as const;

export type RegleEchantillonnagePlan = (typeof REGLES_ECHANTILLONNAGE_PLAN)[number];

/**
 * Les avertissements du plan. Aucun n'interrompt : une mission sans unité dans le
 * périmètre est un état LÉGITIME de la préparation, et la traiter en erreur
 * obligerait l'appelant à distinguer un vide d'une panne.
 */
export const AVERTISSEMENTS_PLAN = [
  'aucune_unite_dans_le_perimetre',
  'effectif_inconnu',
  'unites_hors_perimetre_ignorees',
  'unites_non_actives_ignorees',
  'unites_hors_mission_ignorees',
] as const;

export type AvertissementPlanCode = (typeof AVERTISSEMENTS_PLAN)[number];

// -----------------------------------------------------------------------------
// LES ÉLÉMENTS DU PLAN
// -----------------------------------------------------------------------------

/**
 * LA FOURCHETTE du §32.4, rendue comme une fourchette.
 *
 * Jamais un tirage dans l'intervalle : un intervalle est une donnée, pas un choix.
 * C'est l'un des trois mécanismes qui rendent le plan reproductible à l'octet.
 */
export const fourchetteEntretiensSchema = z.strictObject({
  /** Le **n minimal** — ce que le critère n° 4 du lot L3 (fichier 07) vérifie. */
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

export type FourchetteEntretiensApi = z.infer<typeof fourchetteEntretiensSchema>;

/**
 * Une session complémentaire EXIGÉE par une règle (§32.4), en fourchette.
 *
 * Le §32.4 chiffre « 51-200 → … + 1 observation » et ne chiffre PAS « > 200 → …
 * + observation + démonstration + relevé de données ». Une session non chiffrée
 * vaut **1**, jamais une fourchette inventée : `min` et `max` sont donc égaux
 * aujourd'hui. La forme reste celle des entretiens pour que le jour où le §32.4
 * chiffrerait une fourchette, aucun contrat ne change.
 */
export const exigenceComplementaireSchema = z.strictObject({
  kind: z.enum(TYPES_SESSION),
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

export type ExigenceComplementaireApi = z.infer<typeof exigenceComplementaireSchema>;

/**
 * Un DÉCOMPTE de sessions par type — et non une exigence.
 *
 * Les deux formes cohabitent parce qu'elles ne disent pas la même chose : « la
 * règle exige 1 observation » est une fourchette, « le plan propose 3 observations
 * en tout » est un nombre. Les confondre produirait un `{min: 3, max: 3}` laissant
 * croire à une règle là où il n'y a qu'une somme.
 */
export const compteParTypeSchema = z.strictObject({
  kind: z.enum(TYPES_SESSION),
  nombre: z.number().int().min(0),
});

export type CompteParTypeApi = z.infer<typeof compteParTypeSchema>;

/**
 * LA CIBLE D'UNE UNITÉ — le cœur du plan, et la forme exacte du brief L3D §5.
 *
 * Six clés, pas une de plus : l'identifiant, l'effectif et son drapeau, la
 * fourchette d'entretiens, les sessions complémentaires exigées, les profils à
 * couvrir. Le nom de l'unité, son parent et la règle appliquée restent lisibles
 * dans `sessions[]` et `reglesAppliquees[]` — les publier ici aussi ferait de la
 * cible d'une unité un fourre-tout dont personne ne saurait dire ce qui fait foi.
 *
 * `effectif` est le `headcount` BRUT, `null` s'il est absent ou inexploitable
 * (négatif, fractionnaire) ; `effectifInconnu` le dit alors explicitement et la
 * tranche minimale du §32.4 s'applique — jamais un silence (`DECISIONS.md`
 * 2026-09-02).
 *
 * ⚠ **`profils` est une LISTE DE CODES, SANS AUCUN CHIFFRE.** Le §32.4 ne chiffre
 * que par unité, et `interviews.interlocutor_profile_id` n'existe pas au fichier 04
 * (`DECISIONS.md` 2026-09-01) : chiffrer par profil inventerait du périmètre, et
 * une donnée qu'aucune table ne pourrait recevoir. Il n'existe donc, NULLE PART
 * dans ce contrat, de répartition par profil.
 */
export const uniteDuPlanSchema = z.strictObject({
  orgUnitId: z.uuid(),
  effectif: z.number().int().nullable(),
  effectifInconnu: z.boolean(),
  entretiens: fourchetteEntretiensSchema,
  sessionsComplementaires: z.array(exigenceComplementaireSchema),
  /** CODES des profils à couvrir, ordre direction → encadrement → terrain. */
  profils: z.array(z.string()),
});

export type UniteDuPlanApi = z.infer<typeof uniteDuPlanSchema>;

/** Une session PROPOSÉE — une ligne du plan, jamais une ligne `interviews`. */
export const sessionProposeeSchema = z.strictObject({
  /** Rang 1..n dans le plan entier, ordre stable. */
  rang: z.number().int().min(1),
  /** Rang 1..n parmi les sessions du MÊME type dans la MÊME unité. */
  rangDansUnite: z.number().int().min(1),
  orgUnitId: z.uuid(),
  orgUnitNom: z.string(),
  kind: z.enum(TYPES_SESSION),
  /** `sur_site` pour un entretien, `null` sinon — le défaut APPLICATIF du 04. */
  mode: z.enum(MODES_ENTRETIEN).nullable(),
  regle: z.enum(REGLES_ECHANTILLONNAGE_PLAN),
  /** La règle §32.4 en français, affichable telle quelle au plan (§17.3). */
  justification: z.string(),
});

export type SessionProposeeApi = z.infer<typeof sessionProposeeSchema>;

/**
 * Le bilan d'une règle : ce qu'elle EXIGE et ce qu'elle a produit.
 *
 * Les QUATRE règles sont toujours présentes, même à zéro unité concernée — une
 * règle absente laisserait croire qu'elle n'existe pas.
 */
export const applicationRegleSchema = z.strictObject({
  regle: z.enum(REGLES_ECHANTILLONNAGE_PLAN),
  libelle: z.string(),
  effectifMin: z.number().int().min(0),
  /** `null` = tranche ouverte (« > 200 »). */
  effectifMax: z.number().int().nullable(),
  nMinimalEntretiens: z.number().int().min(0),
  nMaximalEntretiens: z.number().int().min(0),
  sessionsComplementaires: z.array(exigenceComplementaireSchema),
  unitesConcernees: z.number().int().min(0),
  entretiensProposes: z.number().int().min(0),
  sessionsComplementairesProposees: z.number().int().min(0),
});

export type ApplicationRegleApi = z.infer<typeof applicationRegleSchema>;

/**
 * Un avertissement du plan : jamais une erreur, jamais un blocage.
 *
 * `{ code, message }`, et rien d'autre : `code` porte la cause MACHINE, `message`
 * la phrase française affichable (convention transverse du 2026-09-01). Le message
 * ne porte que des COMPTES — aucun nom d'unité, aucun effectif : un avertissement
 * voyage plus loin qu'une réponse (bandeau, export, journal d'un appelant
 * distrait). Les unités concernées se retrouvent dans `unites[]`.
 */
export const avertissementPlanSchema = z.strictObject({
  code: z.enum(AVERTISSEMENTS_PLAN),
  message: z.string(),
});

export type AvertissementPlanApi = z.infer<typeof avertissementPlanSchema>;

/** Les totaux détaillés — de quoi dimensionner sans reparcourir les unités. */
export const totauxPlanSchema = z.strictObject({
  unitesRetenues: z.number().int().min(0),
  /** Hors périmètre, non actives, ou d'une autre mission — le plan dit ce qu'il écarte. */
  unitesEcartees: z.number().int().min(0),
  entretiens: fourchetteEntretiensSchema,
  sessionsProposees: z.number().int().min(0),
  parKind: z.array(compteParTypeSchema),
});

export type TotauxPlanApi = z.infer<typeof totauxPlanSchema>;

// -----------------------------------------------------------------------------
// LA RÉPONSE
// -----------------------------------------------------------------------------

/**
 * `GET /v1/missions/:id/interview-plan` — le plan complet, NON PAGINÉ.
 *
 * Un plan est un TOUT : le paginer obligerait l'appelant à recomposer des totaux
 * qui ne veulent rien dire à moitié. Et il n'est pas persisté : deux appels sur les
 * mêmes données rendent le même plan, à ceci près que `genereLe` change — cet
 * horodatage est FOURNI par la route, jamais lu par le générateur (c'est ce qui
 * rend la fonction pure testable par `toEqual` strict).
 *
 * ── L'ORDRE DE LECTURE DU CONTRAT ───────────────────────────────────────────
 * `unites[]` est LA vue du brief L3D §5 : une ligne par unité retenue, avec son
 * `n` minimal. `totalEntretiens` en est **la somme**, jamais un chiffre
 * indépendant — il est recalculé depuis `unites[]` à la projection, précisément
 * pour qu'il ne puisse pas en diverger. Le reste (`sessions[]`,
 * `reglesAppliquees[]`, `totaux`) DÉTAILLE ; il ne contredit jamais.
 */
export const planEntretiensSchema = z.strictObject({
  missionId: z.uuid(),
  /** Recopié, jamais utilisé pour dimensionner : le §32.4 ne chiffre que par effectif. */
  niveauAudit: z.enum(NIVEAUX_AUDIT),
  genereLe: isoUtcSchema.nullable(),
  /** LA vue par unité du §32.4 — le contrat du brief L3D §5. */
  unites: z.array(uniteDuPlanSchema),
  /** La SOMME des fourchettes de `unites[]`. */
  totalEntretiens: fourchetteEntretiensSchema,
  sessions: z.array(sessionProposeeSchema),
  reglesAppliquees: z.array(applicationRegleSchema),
  totaux: totauxPlanSchema,
  avertissements: z.array(avertissementPlanSchema),
});

export type PlanEntretiensApi = z.infer<typeof planEntretiensSchema>;
