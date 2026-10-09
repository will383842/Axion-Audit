// =============================================================================
// LA MONTÉE D'UNE OP — de la ligne de file locale à l'opération du 11 §4 (PD2)
//
// `LOT_L6.md` §5 PD2 : « `ecrireLocal` chiffre l'op avec la DEK appareil ; le push
// doit la déchiffrer EN MÉMOIRE, puis mapper la forme locale (camelCase, index +
// charge, drapeaux `0|1`) vers la forme du 11 §4. C'est le seul endroit où le fil
// ≠ le local. » Ce fichier est cet endroit, et il n'y en a pas d'autre.
//
// LA CHARGE EST FERMÉE (arbitrage de la coordination, 2026-10-09) : pour chaque
// entité, une LISTE BLANCHE explicite — le camelCase des colonnes du 04 que le
// terrain écrit, la même liste que la réception serveur. Rien n'y entre par
// défaut : un champ local ajouté demain (`valideeLe`, `revision`, `motsCles`…) ne
// part pas tant qu'il n'est pas nommé ici. Une clé de la liste sans source locale
// est OMISE, jamais mise à `null` (`interlocutorProfileId`, `expectedSource`,
// `createdBy` de la question) : `null` serait une valeur, donc une écriture.
//
// Les quatre DRAPEAUX redeviennent des booléens : `0|1` n'existe que parce
// qu'IndexedDB n'indexe pas les booléens (`local/formes.ts`).
// `question_adhoc` devient `{question, missionQuestion}` (11 §4, V2.9) — UNE op,
// les DEUX ids venant du client ; `blockCode` est le CODE de bloc, résolu serveur.
//
// L'enveloppe chiffrée ne part JAMAIS : le siège n'a pas la DEK de l'appareil.
// Traçabilité : E7 ; 11 §4 ; invariant 1.
// =============================================================================
import { z } from 'zod';
import type { EntiteSync, Operation } from '../local/contrat-sync.js';
import type { LigneOutbox } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';

/** Une charge d'op déchiffrée : l'en-tête d'index et la charge, à plat (`ecrireLocal`). */
const chargeOpSchema = z.record(z.string(), z.unknown());

type ChargeOp = z.infer<typeof chargeOpSchema>;

/** Les colonnes écrivables par le terrain, par entité à charge plate (04, camelCase). */
const COLONNES: Readonly<Record<Exclude<EntiteSync, 'question_adhoc'>, readonly string[]>> = {
  interview: [
    'missionId',
    'orgUnitId',
    'kind',
    'status',
    'scheduleStatus',
    'scheduledAt',
    'conductedBy',
    'mode',
    'personName',
    'personRole',
    'personServiceId',
    'personEmail',
    'interlocutorProfileId',
    'participants',
    'generalNotes',
    'linkedReviewAnswerId',
    'documentRequestId',
    'consentGiven',
    'consentAudio',
    'consentedAt',
    'informationNoticeVersion',
    'noticeShownAt',
    'scheduledDurationMin',
    'startedAt',
    'endedAt',
    'clientCreatedAt',
  ],
  answer: [
    'interviewId',
    'missionQuestionId',
    'flagReview',
    'notApplicable',
    'withheld',
    'horsParcours',
    'value',
    'note',
    'reviewReason',
    'naReason',
    'withheldReason',
    'source',
    'clientCreatedAt',
  ],
  attachment_meta: [
    'missionId',
    'interviewId',
    'answerId',
    'kind',
    'content',
    'filename',
    'mime',
    'sizeBytes',
    'createdBy',
    'clientCreatedAt',
  ],
  org_unit_proposal: [
    'missionId',
    'parentId',
    'kind',
    'name',
    'countryCode',
    'timezone',
    'headcount',
    'proposedBy',
  ],
};

/** Les drapeaux indexables `0|1` de `local/formes.ts` — booléens sur le fil. */
const DRAPEAUX: ReadonlySet<string> = new Set([
  'flagReview',
  'notApplicable',
  'withheld',
  'horsParcours',
]);

/** Ne retient que les colonnes nommées ; une colonne sans source locale est omise. */
function selon(colonnes: readonly string[], charge: ChargeOp): Record<string, unknown> {
  return Object.fromEntries(
    colonnes
      .filter((cle) => Object.hasOwn(charge, cle))
      .map((cle) => {
        const valeur = charge[cle];
        return [cle, DRAPEAUX.has(cle) ? valeur === 1 || valeur === true : valeur];
      }),
  );
}

/**
 * La forme LOCALE d'une question ad hoc (`session/questions-adhoc.ts`) : la ligne
 * `missionQuestions` porte l'id de la ligne de mission, sa charge l'id de la question.
 */
const questionAdhocLocaleSchema = z.object({
  id: z.uuid(),
  questionId: z.uuid(),
  position: z.number().int(),
  texteSnapshot: z.string(),
  answerType: z.string(),
  criticality: z.string(),
  guidanceSnapshot: z.string().nullable(),
  optionsSnapshot: z.unknown(),
  allowRangeSnapshot: z.boolean(),
  blockCode: z.string().nullable(),
});

/**
 * 11 §4 : `payload = {question: {…§36.4…}, mission_question: {id, position}}`.
 * L'`entityId` de l'op est l'id de la QUESTION ; celui de la ligne de mission
 * voyage dans `missionQuestion.id`. Les deux sont des UUID v7 de l'appareil.
 */
function questionAdhocVersFil(charge: ChargeOp): {
  readonly entityId: string;
  readonly payload: Record<string, unknown>;
} {
  const locale = questionAdhocLocaleSchema.parse(charge);
  return {
    entityId: locale.questionId,
    payload: {
      question: {
        textFr: locale.texteSnapshot,
        guidanceFr: locale.guidanceSnapshot,
        answerType: locale.answerType,
        criticality: locale.criticality,
        blockCode: locale.blockCode,
        options: locale.optionsSnapshot,
        allowRange: locale.allowRangeSnapshot,
      },
      missionQuestion: { id: locale.id, position: locale.position },
    },
  };
}

/** Déchiffre la charge d'une ligne de file, en mémoire, et rend l'op du 11 §4. */
export async function operationDeLigne(ligne: LigneOutbox, coffre: Coffre): Promise<Operation> {
  const charge = await coffre.dechiffrer(ligne.charge, chargeOpSchema);
  const fil =
    ligne.entite === 'question_adhoc'
      ? questionAdhocVersFil(charge)
      : { entityId: ligne.entiteId, payload: selon(COLONNES[ligne.entite], charge) };
  return {
    opId: ligne.opId,
    entity: ligne.entite,
    entityId: fil.entityId,
    action: ligne.action,
    payload: fil.payload,
    clientUpdatedAt: ligne.clientUpdatedAt,
  };
}
