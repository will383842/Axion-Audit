// =============================================================================
// L'ENTRÉE DU MOTEUR DE SCORING — ce que le calcul reçoit, et rien d'autre.
// Lot L8. 03 §32.1 · 04 (`answers`, `mission_questions`, `org_units`).
//
// ── UNE FRONTIÈRE, PAS UNE COMMODITÉ ────────────────────────────────────────
// Le moteur est une FONCTION PURE. Il ne connaît ni base, ni Drizzle, ni Fastify :
// on lui remet un instantané cohérent, il rend un résultat. Trois conséquences
// que ce fichier matérialise :
//
//   1. **`mission_questions`, JAMAIS `questions`.** Les champs sont les SNAPSHOTS
//      figés (§32.1 : « figé par mission dans `mission_questions.scoring_snapshot` »).
//      Lire la banque vivante ferait varier le score d'une mission close le jour
//      où quelqu'un corrige une question — exactement ce que le figeage interdit.
//
//   2. **`answers`, JAMAIS `answer_revisions`** (invariant 7). `answers` porte la
//      révision COURANTE ; l'archive porte les valeurs écrasées. Les lire toutes
//      les deux compterait DEUX FOIS une réponse corrigée, et la moyenne du §32.1-1
//      pencherait vers la valeur que l'auditeur a justement rectifiée. Le champ
//      `revision` est ici pour être RENDU, pas pour ouvrir l'archive.
//
//   3. **Aucun champ de `scoping_financials`** (invariant 3). Une réponse `money`
//      est légitime : c'est `answers.value`, la parole d'un interviewé. Le devis de
//      la mission, lui, n'a pas de chemin jusqu'ici — il n'y a pas de champ pour lui.
//
// ── CE QUI N'ENTRE PAS NON PLUS ─────────────────────────────────────────────
// Aucun nom, aucun e-mail, aucun libellé de client (invariant 2) : le moteur
// travaille sur des identifiants et des codes de référentiel. Un score n'a jamais
// besoin de savoir chez qui il est calculé — et c'est ce qui rend les quatre
// archétypes du 01 §2 interchangeables.
// =============================================================================
import type { Criticite, GroupeInterlocuteurPlan, ParametresScoring } from '@axion/shared';

/**
 * UNE UNITÉ DE L'ARBRE, réduite à ce que le roll-up §32.1-4 exige.
 *
 * `headcount` NULL → poids 1 dans la moyenne pondérée (« règle affichée dans
 * l'UI », §32.1-4). `inScope = false` → l'unité et ses réponses sortent du calcul
 * (§25.1 : « données conservées, exclues scoring/couverture ») ; le moteur le
 * SIGNALE, il ne l'efface pas.
 */
export interface UnitePourScoring {
  readonly id: string;
  readonly parentId: string | null;
  readonly headcount: number | null;
  readonly inScope: boolean;
}

/**
 * UNE QUESTION FIGÉE — la ligne `mission_questions` et ses snapshots (04 l. 101-110).
 *
 * `weight` voyage en CHAÎNE : `weight_snapshot` est un `NUMERIC`, et tout `NUMERIC`
 * de ce dépôt voyage en chaîne (cf. `questionnaire.ts`, `montantDecimalSchema`).
 * Le convertir plus tôt arrondirait un poids en silence.
 *
 * `scoring` et `options` sont des JSONB : `unknown` ici, validés par le barème
 * avec les schémas normés de `packages/shared` (04 §7.3). Les typer d'avance
 * ferait croire que PostgreSQL les a contraints — il ne l'a pas fait.
 */
export interface QuestionFigee {
  readonly missionQuestionId: string;
  readonly blocCode: string;
  readonly answerType: string;
  readonly weight: string;
  readonly scoring: unknown;
  readonly options: unknown;
  readonly criticality: Criticite;
}

/**
 * UNE RÉPONSE À COTER — la ligne `answers` COURANTE (04 l. 146-160).
 *
 * `orgUnitId` vient de la SESSION (`interviews.org_unit_id`) : une réponse
 * appartient à l'unité où l'entretien a eu lieu. `null` est possible (session sans
 * unité) et n'est pas une erreur de programmation — c'est une donnée que le moteur
 * signale plutôt que d'inventer un rattachement.
 *
 * `groupeInterlocuteur` (`interlocutor_profiles.group_code`, §32.6-4) est
 * FACULTATIF : sans lui, la divergence numérique se calcule quand même, seule la
 * lecture direction/terrain manque. Le moteur ne code aucune liste de profils.
 */
export interface ReponseACoter {
  readonly id: string;
  readonly interviewId: string;
  readonly missionQuestionId: string;
  readonly orgUnitId: string | null;
  readonly value: unknown;
  readonly withheld: boolean;
  readonly notApplicable: boolean;
  readonly groupeInterlocuteur?: GroupeInterlocuteurPlan | null;
}

/** L'instantané complet remis au moteur. */
export interface EntreeScoring {
  readonly missionId: string;
  readonly parametres: ParametresScoring;
  /** Les codes de bloc dans l'ORDRE d'affichage (`blocks.position`) — le radar en dépend. */
  readonly blocs: readonly string[];
  readonly unites: readonly UnitePourScoring[];
  readonly questions: readonly QuestionFigee[];
  readonly reponses: readonly ReponseACoter[];
}
