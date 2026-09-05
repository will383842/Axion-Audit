// =============================================================================
// CONTRAT DE L'AGRÉGATION PAR QUESTION — 03 M5.1, §27.1 (provenance), §27.4
// (non communiqué). Lot L7, incrément L7b.
//
//   GET /v1/missions/:id/aggregation?block=&orgUnit=&limit=&after=
//       → `agregationMissionSchema`
//
// ── CE QUE CET ÉCRAN RÉPOND, ET QUE LA COUVERTURE NE RÉPOND PAS ─────────────
// La couverture (`pilotage.ts`) dit « a-t-on collecté ? ». L'agrégation dit
// « qu'a-t-on obtenu, et d'où cela vient-il ? » : pour chaque question, TOUTES les
// réponses côte à côte, avec la fonction et l'unité de qui a répondu (M5.1).
//
// ── LA PROVENANCE EST `answers.source`, ET C'EST L'AUTRE VOCABULAIRE ────────
// Cinq valeurs — `entretien | observation | demonstration | document | releve` —
// et elles NE SONT PAS les cinq sources de collecte de la couverture
// (`analyse_documentaire` et `releve_donnees` y deviennent `document` et
// `releve`). Les fondre supprimerait la comparaison source ATTENDUE
// (`questions.expected_source`) × source CONSTATÉE (`answers.source`) qui fait
// tout l'intérêt du §27.6, au moment même où elle a de la valeur. Le §36.3 le
// confirme à l'autre bout de la chaîne : `reponses.csv` porte « session + type +
// provenance », TROIS colonnes.
//
// ── LES TROIS ÉTATS QU'ON NE FOND JAMAIS (§27.4) ────────────────────────────
//   · NON COMMUNIQUÉ (`withheld` + `withheld_reason`) — on a demandé, on n'a pas
//     obtenu. C'est un fait d'audit, pas une anomalie, et surtout PAS un silence :
//     un « non communiqué » confondu avec une absence de réponse ferait disparaître
//     du rapport la rubrique « Limites et réserves » qui protège le cabinet ;
//   · SANS OBJET (`not_applicable` + `na_reason`) — la question ne se pose pas ici ;
//   · À REVOIR (`flag_review` + `review_reason`) — à creuser, la réponse existe.
// Une question SANS AUCUNE LIGNE est un quatrième cas, et il est distinct des
// trois : personne ne l'a posée. Le contrat le rend explicite (`comptes.posee`).
//
// ── CE QUI N'ENTRE PAS DANS CETTE RÉPONSE ───────────────────────────────────
//   · aucun montant de `scoping_financials` ni de `scoping_estimates` (invariant 3) ;
//   · `person_email`, jamais, sous aucune condition ;
//   · le NOM du répondant SANS l'avoir demandé. AMENDEMENT DU 2026-09-05 (L7c) :
//     la question laissée ouverte par L7b est tranchée (arbitrage A01) — le nom
//     s'affiche si, et seulement si, `consent_given = true` STRICT (le nul vaut
//     non) ET si l'appelant a passé `?repondants=true`. Sans le paramètre,
//     `nomRepondant` vaut `null` pour TOUTES les lignes, et le serveur ne l'a même
//     pas lu. La porte est SERVEUR : masquer dans un composant un nom déjà arrivé
//     au navigateur ne serait pas le masquer (invariant 3).
//
// ── LA RÉVISION COURANTE, ET RIEN D'AUTRE (invariant 7) ─────────────────────
// `answers` porte la version COURANTE de chaque réponse ; les valeurs écrasées
// vivent dans `answer_revisions`. Cette lecture n'ouvre donc JAMAIS l'archive :
// elle rend la bonne version par construction, et `revision` dit combien de fois
// la réponse a été corrigée — l'historique n'est pas perdu, il n'est pas d'ici.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E12 (entretiens par
// interlocuteur, à-revoir) · E22 (console de pilotage 7 espaces) · E43
// (exécutabilité autopilote : conventions d'API).
// =============================================================================
import { z } from 'zod';
import { isoUtcSchema } from './temps.js';

// -----------------------------------------------------------------------------
// LES VOCABULAIRES — recopiés des CHECK du fichier 04
// -----------------------------------------------------------------------------

/**
 * LA PROVENANCE CONSTATÉE D'UNE RÉPONSE — `answers.source` (04 l. 151, §27.1).
 *
 * Le nom est délibérément différent de `SOURCES_ATTENDUES`
 * (`banque-questions.ts`), qui porte les mêmes cinq valeurs pour
 * `questions.expected_source` : ce sont deux colonnes, deux moments, et le §27.6
 * les COMPARE. Un symbole unique rendrait la comparaison inexprimable.
 */
export const PROVENANCES_REPONSE = [
  'entretien',
  'observation',
  'demonstration',
  'document',
  'releve',
] as const;

export type ProvenanceReponse = (typeof PROVENANCES_REPONSE)[number];

/** Libellés français des provenances (invariant 5). */
export const LIBELLES_PROVENANCE_REPONSE: Record<ProvenanceReponse, string> = {
  entretien: 'Entretien',
  observation: 'Observation',
  demonstration: 'Démonstration',
  document: 'Document',
  releve: 'Relevé',
};

/** `answers.withheld_reason` (§27.4) — les quatre motifs du CHECK du 04. */
export const MOTIFS_NON_COMMUNIQUE = [
  'confidentiel',
  'non_disponible',
  'hors_perimetre',
  'autre',
] as const;

export type MotifNonCommuniqueApi = (typeof MOTIFS_NON_COMMUNIQUE)[number];

/**
 * Les motifs en français, tels que l'auditeur les lira dans la rubrique
 * « Limites et réserves » du rapport (§27.4).
 */
export const LIBELLES_MOTIF_NON_COMMUNIQUE: Record<MotifNonCommuniqueApi, string> = {
  confidentiel: 'Confidentiel',
  non_disponible: 'Non disponible',
  hors_perimetre: 'Hors périmètre',
  autre: 'Autre motif',
};

// -----------------------------------------------------------------------------
// UNE RÉPONSE
// -----------------------------------------------------------------------------

/**
 * UNE RÉPONSE, telle que le siège la relit — révision COURANTE (invariant 7).
 *
 * `valeurLisible` est APLATIE CÔTÉ SERVEUR (invariant 6 : le siège produit) selon
 * le format du 04 l. 149-150 : `{type, v}`, fourchette `{type:'range', low, high}`,
 * `money` avec sa devise. Les choix sont rendus par leurs LIBELLÉS, jamais par
 * leurs codes : personne ne relit un audit avec des identifiants. `null` quand la
 * réponse n'a pas de valeur — un « non communiqué » ou un « sans objet » en sont
 * les deux cas normaux, et ils se lisent aux drapeaux, pas à un texte vide.
 */
export const reponseAgregeeSchema = z.strictObject({
  answerId: z.uuid(),
  interviewId: z.uuid(),
  /** Le TYPE de session d'origine — `interviews.kind`, distinct de la provenance. */
  sessionKind: z.string(),
  orgUnitId: z.uuid(),
  orgUnitNom: z.string(),
  /** L'unité est-elle encore dans le périmètre ? (§25.1 — jamais un second fichier.) */
  orgUnitInScope: z.boolean(),
  /** `interviews.person_role` — la FONCTION du répondant. */
  fonctionRepondant: z.string().nullable(),
  /**
   * `interviews.person_name`, SOUS CONDITION — `null` par défaut, et `null`
   * chaque fois que le consentement n'est pas explicitement acquis (§26,
   * arbitrage A01 du 2026-09-05). Le champ EXISTE toujours dans le contrat :
   * l'écran doit pouvoir dire « masqué » sans deviner si la version d'en face
   * le connaît.
   */
  nomRepondant: z.string().nullable(),
  /** `services.label_fr` via `interviews.person_service_id` (P2-1). */
  serviceRepondant: z.string().nullable(),
  /** LA PROVENANCE (§27.1) — visible, jamais déduite du type de session. */
  provenance: z.enum(PROVENANCES_REPONSE),
  valeurLisible: z.string().nullable(),
  /** §27.4 — distinct de `sansObjet` et d'`aRevoir`. */
  nonCommunique: z.boolean(),
  motifNonCommunique: z.enum(MOTIFS_NON_COMMUNIQUE).nullable(),
  sansObjet: z.boolean(),
  motifSansObjet: z.string().nullable(),
  aRevoir: z.boolean(),
  motifARevoir: z.string().nullable(),
  /** §25.4 — répondue hors du parcours prévu ; badgée à l'écran (M5.1). */
  horsParcours: z.boolean(),
  note: z.string().nullable(),
  /** Invariant 7 : combien de fois la réponse a été corrigée. 1 = jamais. */
  revision: z.number().int().min(1),
  misAJourLe: isoUtcSchema,
});

export type ReponseAgregee = z.infer<typeof reponseAgregeeSchema>;

/** Un décompte par provenance — les CINQ, toujours, même à zéro. */
export const compteProvenanceSchema = z.strictObject({
  provenance: z.enum(PROVENANCES_REPONSE),
  nombre: z.number().int().min(0),
});

export type CompteProvenance = z.infer<typeof compteProvenanceSchema>;

/**
 * LES COMPTES D'UNE QUESTION — quatre situations que rien ne fond.
 *
 * `posee` est le total de lignes ; `renseignees` est ce qui reste quand on retire
 * les non communiquées et les sans objet. `posee = 0` est l'état « personne ne
 * l'a posée », qui n'est ni un refus ni un sans objet.
 */
export const comptesQuestionSchema = z.strictObject({
  posee: z.number().int().min(0),
  renseignees: z.number().int().min(0),
  nonCommuniquees: z.number().int().min(0),
  sansObjet: z.number().int().min(0),
  aRevoir: z.number().int().min(0),
  horsParcours: z.number().int().min(0),
  unitesTouchees: z.number().int().min(0),
});

export type ComptesQuestion = z.infer<typeof comptesQuestionSchema>;

/**
 * UNE QUESTION AGRÉGÉE — le texte FIGÉ de la mission, jamais celui de la banque.
 *
 * `texte` vient de `mission_questions.text_snapshot` (NOT NULL) : c'est la question
 * telle qu'elle a été POSÉE, et une banque révisée depuis ne peut pas réécrire
 * l'histoire d'une mission.
 */
export const questionAgregeeSchema = z.strictObject({
  missionQuestionId: z.uuid(),
  blocCode: z.string(),
  blocLibelle: z.string(),
  texte: z.string(),
  criticite: z.string().nullable(),
  typeReponse: z.string().nullable(),
  /** La source ATTENDUE (§27.6) — à confronter aux provenances CONSTATÉES. */
  sourceAttendue: z.enum(PROVENANCES_REPONSE).nullable(),
  comptes: comptesQuestionSchema,
  parProvenance: z.array(compteProvenanceSchema),
  reponses: z.array(reponseAgregeeSchema),
});

export type QuestionAgregee = z.infer<typeof questionAgregeeSchema>;

// -----------------------------------------------------------------------------
// LES FILTRES ET LA RÉPONSE
// -----------------------------------------------------------------------------

/**
 * Les filtres de M5.1, et SEULEMENT ceux qui sont sans ambiguïté.
 *
 * Le 05 §8.5 écrit `?block=&service=`. `block` est un CODE de bloc, sans
 * ambiguïté. `service`, lui, en porte deux dans ce dépôt — la table `services`
 * (les 11 fonctions du 11 §5) et le `kind` `service` de l'arbre — alors que
 * l'unité auditée est TOUJOURS `org_unit_id` (04, note P2-1). Le paramètre est
 * donc nommé `orgUnit` et prend un identifiant d'unité : `DECISIONS.md`
 * 2026-09-05. Les filtres « site/pays » et « interlocuteur » de M5.1 ne sont pas
 * livrés en L7b — les inventer sans écran qui les porte serait du produit deviné.
 */
export const agregationQuerySchema = z.object({
  block: z.string().min(1).max(64).optional(),
  orgUnit: z.uuid().optional(),
  /**
   * L'ACTION EXPLICITE qui ouvre l'attribution des réponses (2026-09-05).
   * Une seule graphie acceptée : `z.coerce.boolean()` rendrait `true` pour la
   * chaîne `"false"`, ce qui, sur une donnée personnelle, est le contraire exact
   * de ce qui a été décidé. Voir `export-mission.ts`, même porte, même forme.
   */
  repondants: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valeur) => valeur === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  after: z.string().min(1).optional(),
});

export type AgregationQuery = z.infer<typeof agregationQuerySchema>;

/**
 * `GET /v1/missions/:id/aggregation` — les questions de la mission, une page.
 *
 * ── PAGINATION KEYSET (11 §3) ───────────────────────────────────────────────
 * Curseur **`(position, id)` ascendant** sur `mission_questions`, opaque, jamais
 * d'offset : l'ordre du questionnaire figé est celui de la mission, et une sync
 * qui pousse des réponses ne doit pas décaler la page suivante. Les réponses
 * d'une question voyagent AVEC elle et ne se paginent pas : une question à moitié
 * répondue est un chiffre faux.
 *
 * `blocs` et `totaux` sont calculés sur la mission ENTIÈRE (filtres appliqués),
 * jamais sur la page.
 *
 * `repondantsAffiches` dit à l'écran ce que le SERVEUR a décidé, plutôt que de le
 * lui laisser supposer d'après le paramètre qu'il croit avoir envoyé.
 */
export const agregationMissionSchema = z.strictObject({
  missionId: z.uuid(),
  timezone: z.string(),
  calculeLe: isoUtcSchema,
  /** Les blocs actifs, pour le sélecteur de filtre — code et libellé français. */
  blocs: z.array(z.strictObject({ code: z.string(), libelle: z.string() })),
  /** Le filtre effectivement appliqué, renvoyé pour que l'écran ne le suppose pas. */
  filtre: z.strictObject({
    block: z.string().nullable(),
    orgUnit: z.uuid().nullable(),
  }),
  /** Les noms des répondants ont-ils été demandés ET servis (2026-09-05) ? */
  repondantsAffiches: z.boolean(),
  questions: z.array(questionAgregeeSchema),
  nextCursor: z.string().nullable(),
  totaux: z.strictObject({
    questions: z.number().int().min(0),
    /** Questions dont AUCUNE ligne n'existe — « personne ne l'a posée ». */
    questionsSansReponse: z.number().int().min(0),
    reponses: z.number().int().min(0),
    nonCommuniquees: z.number().int().min(0),
    sansObjet: z.number().int().min(0),
    aRevoir: z.number().int().min(0),
    parProvenance: z.array(compteProvenanceSchema),
  }),
});

export type AgregationMission = z.infer<typeof agregationMissionSchema>;
