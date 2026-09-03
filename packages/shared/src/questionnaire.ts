// =============================================================================
// CONTRATS DU QUESTIONNAIRE DE MISSION — prévisualisation §33.4 et figeage M2.
// Lot L3, incrément L3d, tâche T1.
//
// ── CE QUE CE FICHIER EST ───────────────────────────────────────────────────
// Les schémas Zod d'ENTRÉE et de SORTIE des deux routes du questionnaire, plus
// les vocabulaires que l'assembleur M2 produit et que le front doit pouvoir
// interpréter sans lire une phrase française :
//   GET  /v1/missions/:id/questionnaire-preview   → `questionnairePreviewResponseSchema`
//   POST /v1/missions/:id/generate-questionnaire  → `questionnaireFreezeResponseSchema`
// Les chemins sont ceux de `DECISIONS.md` du 2026-08-29 (« GET …/questionnaire-preview »,
// renommée depuis `POST …/questionnaire/preview` que porte encore la note de
// conception L3 §2 — c'est la DÉCISION qui fait foi, pas la note).
//
// ── POURQUOI LES NOMS DE CHAMPS SONT CEUX DE L'ASSEMBLEUR ───────────────────
// `apps/api/src/domaines/questionnaire/assembleur.ts` est une fonction PURE dont
// la sortie (`QuestionAssemblee`, `RepartitionBloc`, `ParcoursProfil`) est le
// résultat métier. Les schémas ci-dessous en sont la transcription littérale :
// la route rend l'objet de l'assembleur sans le remodeler, et le compilateur
// vérifie cette correspondance à chaque build. Toute traduction intermédiaire
// serait un endroit de plus où se tromper — et un endroit que personne ne teste.
//
// ── CE QU'UN SNAPSHOT NE TRAVERSE JAMAIS ────────────────────────────────────
// `optionsSnapshot`, `scoringSnapshot` et `conditionAffichage` sont des JSONB que
// PostgreSQL ne contraint pas. Ils voyagent en `z.unknown()` et NON par un
// `strictObject` de forme : celui-ci REJETTERAIT une ligne de banque légitime
// portant une clé de plus, et une prévisualisation qui refuse d'afficher une
// question parce qu'un champ facultatif l'étonne est pire qu'inutile (brief L3D
// §9-1). `weightSnapshot` est un `NUMERIC` : il voyage en CHAÎNE, comme tout
// NUMERIC de ce dépôt (`montantDecimalSchema`, scoping.ts) — le convertir en
// `number` arrondirait un poids en silence.
//
// Traçabilité : E39 (machine à états mission : le figeage n'est ouvert qu'à l'état
// de préparation, et les transitions contrôlées lisent son résultat) · E30
// (3 niveaux d'audit : `niveaux` filtre les questions par niveau) · E43
// (exécutabilité autopilote : conventions d'API, schémas in ET out partagés) ·
// E24 (validation obligatoire de chaque étape : le figeage referme la préparation).
// =============================================================================
import { z } from 'zod';
import {
  CRITICITES,
  PERIMETRES_GEO,
  SOURCES_ATTENDUES,
  TYPES_DE_REPONSE,
} from './banque-questions.js';

// -----------------------------------------------------------------------------
// LES VOCABULAIRES DE L'ASSEMBLEUR — rapatriés ici, une seule source
// -----------------------------------------------------------------------------

/**
 * Les SEPT filtres de l'assemblage M2, dans l'ordre d'application (brief L3D §3).
 *
 * L'interlocuteur n'y figure pas : ce n'est pas un filtre mais une PROJECTION
 * (M2 §3), et l'ensemble figé est l'union des parcours.
 *
 * Ce vocabulaire sort de l'API dans le refus de figer une sélection vide : le
 * front doit pouvoir dire « c'est le palier qui a tout écarté » sans analyser une
 * phrase française.
 */
export const FILTRES_QUESTIONNAIRE = [
  'statut_origine',
  'bloc_actif',
  'palier',
  'secteur',
  'niveau_audit',
  'geo',
  'services_arbre',
] as const;

export type FiltreQuestionnaire = (typeof FILTRES_QUESTIONNAIRE)[number];

/**
 * Codes d'AVERTISSEMENT de l'assemblage.
 *
 * Un avertissement n'interrompt rien : « un bloc actif sans question n'est pas une
 * erreur » (brief L3D §3). Il est nommé pour que la console puisse regrouper, et
 * porte une phrase française pour que l'auditeur puisse lire.
 */
export const AVERTISSEMENTS_QUESTIONNAIRE = [
  'BLOC_ACTIF_INCONNU',
  'BLOC_ACTIF_SANS_QUESTION',
  'PALIER_ABSENT',
  'PERIMETRE_SANS_UNITE',
  'SERVICE_SANS_PAQUET',
  'PROFIL_INCONNU',
  'ETIQUETTE_ILLISIBLE',
] as const;

export type AvertissementQuestionnaireCode = (typeof AVERTISSEMENTS_QUESTIONNAIRE)[number];

export const avertissementQuestionnaireSchema = z.strictObject({
  code: z.enum(AVERTISSEMENTS_QUESTIONNAIRE),
  /** Phrase française affichable telle quelle (invariant 5). */
  message: z.string(),
});

export type AvertissementQuestionnaire = z.infer<typeof avertissementQuestionnaireSchema>;

// -----------------------------------------------------------------------------
// LA QUESTION PRÉVISUALISÉE — capture + routage, exactement comme l'assembleur
// -----------------------------------------------------------------------------

/**
 * Une valeur JSONB, telle que la base la rend. Voir l'en-tête : on ne referme
 * jamais un JSONB de banque dans un schéma de forme sur un chemin de LECTURE.
 */
const valeurJsonbSchema = z.unknown();

/**
 * LES 8 COLONNES DE CAPTURE de `mission_questions` (04), plus l'identité de la
 * ligne pointée. C'est, mot pour mot, ce que le figeage écrira.
 *
 * `id` et `missionId` n'y sont pas : ils appartiennent à l'écriture. `addedAdHoc`
 * vaut toujours `false` — une question assemblée par M2 ne vient jamais du terrain
 * (les ad hoc entrent par la sync, L6).
 */
export const captureQuestionSchema = z.strictObject({
  questionId: z.uuid(),
  questionVersion: z.number().int(),
  textSnapshot: z.string(),
  /** Consigne + ANCRES DE COTATION §32.4 — doivent être lisibles HORS LIGNE. */
  guidanceSnapshot: z.string().nullable(),
  answerTypeSnapshot: z.enum(TYPES_DE_REPONSE),
  optionsSnapshot: valeurJsonbSchema,
  /** `NUMERIC` PostgreSQL : une CHAÎNE, jamais un flottant. */
  weightSnapshot: z.string(),
  scoringSnapshot: valeurJsonbSchema,
  criticalitySnapshot: z.enum(CRITICITES),
  allowRangeSnapshot: z.boolean(),
  addedAdHoc: z.literal(false),
});

export type CaptureQuestionApi = z.infer<typeof captureQuestionSchema>;

/**
 * Le ROUTAGE : ce qui est lu à la volée sur la ligne `questions` pointée et n'est
 * JAMAIS capturé (note de conception L3 §3.a). Licite parce qu'une nouvelle
 * version est une NOUVELLE LIGNE : une référence vers une ligne immuable EST une
 * capture.
 */
export const routageQuestionSchema = z.strictObject({
  /** Identifiant stable de banque. `null` sur une question qui n'en porte pas. */
  questionCode: z.string().nullable(),
  blocId: z.uuid(),
  blocCode: z.string(),
  blocPosition: z.number().int().nullable(),
  /** Les profils d'interlocuteur ciblés. Liste vide = tous (M2 §3). */
  profils: z.array(z.string()),
  servicesCibles: z.array(z.string()),
  secteurs: z.array(z.string()),
  niveaux: z.array(z.string()),
  geo: z.enum(PERIMETRES_GEO),
  effectifMin: z.number().int().nullable(),
  effectifMax: z.number().int().nullable(),
  sourceAttendue: z.enum(SOURCES_ATTENDUES).nullable(),
  conditionAffichage: valeurJsonbSchema,
});

export type RoutageQuestionApi = z.infer<typeof routageQuestionSchema>;

/** Une question retenue, à son rang définitif dans l'ordre déterministe. */
export const questionAssembleeSchema = z.strictObject({
  /** Rang 1..n — devient `mission_questions.position` au figeage. */
  position: z.number().int().min(1),
  capture: captureQuestionSchema,
  routage: routageQuestionSchema,
});

export type QuestionAssembleeApi = z.infer<typeof questionAssembleeSchema>;

// -----------------------------------------------------------------------------
// LES RÉPARTITIONS — « total et répartition par bloc × interlocuteur » (§33.4)
// -----------------------------------------------------------------------------

export const repartitionBlocSchema = z.strictObject({
  blocId: z.uuid(),
  blocCode: z.string(),
  blocPosition: z.number().int().nullable(),
  total: z.number().int().min(0),
});

export type RepartitionBlocApi = z.infer<typeof repartitionBlocSchema>;

/**
 * Le PARCOURS d'un profil d'interlocuteur.
 *
 * Un profil sans question figure quand même, à zéro : un parcours vide est une
 * information (« personne ne posera rien à ce profil »), pas un trou.
 *
 * ⚠ Les identifiants des questions du parcours ne sont PAS rendus ici : sur une
 * mission de grand compte, neuf profils × ~240 questions produiraient une réponse
 * majoritairement faite de répétitions, alors que `questions[]` porte déjà chaque
 * question avec ses `routage.profils`. Le front recompose sans rien redemander.
 */
export const parcoursInterlocuteurSchema = z.strictObject({
  profilCode: z.string(),
  groupCode: z.string(),
  total: z.number().int().min(0),
});

export type ParcoursInterlocuteurApi = z.infer<typeof parcoursInterlocuteurSchema>;

// -----------------------------------------------------------------------------
// LES DEUX RÉPONSES
// -----------------------------------------------------------------------------

/**
 * `GET /v1/missions/:id/questionnaire-preview` — §33.4, « avant le snapshot M2,
 * un écran montre le questionnaire assemblé ».
 *
 * **N'ÉCRIT RIEN** (`DECISIONS.md` 2026-09-01) et **n'est pas paginée** : un
 * questionnaire est un tout, et une prévisualisation qui n'en montrerait qu'une
 * page ne répondrait pas à la question qu'elle pose (« combien, et lesquelles ? »).
 * Elle n'est pas non plus journalisée — elle recopierait des codes de blocs et des
 * services du client (11 §2).
 */
export const questionnairePreviewResponseSchema = z.strictObject({
  total: z.number().int().min(0),
  questions: z.array(questionAssembleeSchema),
  parBloc: z.array(repartitionBlocSchema),
  parInterlocuteur: z.array(parcoursInterlocuteurSchema),
  avertissements: z.array(avertissementQuestionnaireSchema),
});

export type QuestionnairePreviewResponse = z.infer<typeof questionnairePreviewResponseSchema>;

/**
 * `POST /v1/missions/:id/generate-questionnaire` — le FIGEAGE, **201**.
 *
 * La réponse est volontairement plus pauvre que la prévisualisation : après le
 * figeage, la vérité n'est plus le calcul mais les lignes `mission_questions`, et
 * c'est elles qu'il faudra lire (L5/L6). On rend donc de quoi confirmer l'acte —
 * combien de questions, réparties comment — et rien qui invite à traiter la
 * réponse d'une écriture comme une source de données.
 *
 * `total` est au minimum 1 : figer zéro ligne est REFUSÉ (409), parce que
 * l'existence des lignes EST la preuve du figeage — il n'y a pas de colonne
 * « figé » (note de conception L3 §3.a).
 */
export const questionnaireFreezeResponseSchema = z.strictObject({
  total: z.number().int().min(1),
  parBloc: z.array(repartitionBlocSchema),
});

export type QuestionnaireFreezeResponse = z.infer<typeof questionnaireFreezeResponseSchema>;

/**
 * Le corps du figeage : VIDE, et `strictObject` le fait respecter.
 *
 * Rien n'est paramétrable — la sélection vient de la mission (`active_blocks`,
 * `active_sectors`, palier, niveau, géo) et de son arbre. Accepter un champ ici
 * ouvrirait la porte à un figeage « sur mesure » dont aucune trace ne dirait en
 * quoi il différait de la règle.
 */
export const questionnaireFreezeRequestSchema = z.strictObject({});

export type QuestionnaireFreezeRequest = z.infer<typeof questionnaireFreezeRequestSchema>;
