// =============================================================================
// TESTS DU MAPPING DE MONTÉE (PD2) — lot L6, incrément L6a « la montée ».
//
// Écrits par A26 (09 §5.6) depuis `LOT_L6.md` §5 PD2 (« mapper la forme locale
// — camelCase, index + charge, drapeaux 0|1 — vers la forme du 11 §4 »), 11 §4
// (op `question_adhoc` = `{question, mission_question:{id, position}}`), le DDL du
// 04 (`interviews`, `answers`, `attachments`, `org_units`, `questions`,
// `mission_questions`) et l'arbitrage de la coordination du 2026-10-09 :
//   · la charge = EXACTEMENT le camelCase des colonnes du 04 écrivables par le
//     terrain — aucun champ local (`supprimeLe`, `motsCles`, `valideeLe`,
//     `revision`…), ni `id` (porté par `entityId`) ni `clientUpdatedAt` (porté
//     par l'op) ; une colonne ABSENTE de la table au 04 ne part pas (`answers` et
//     `org_units` n'ont ni `mission_id` pour l'une ni `client_created_at` pour
//     l'autre) ;
//   · les drapeaux voyagent en booléens ;
//   · `question_adhoc` : `question.blockCode` = le CODE de bloc (le serveur le
//     résout dans `blocks`) + `missionQuestion: {id, position}`.
// Le testeur serveur (A27) fixe la même liste côté réception (relayée par la
// coordination le 2026-10-09) ; les tests ci-dessous l'appliquent par toEqual.
// Une clé de cette liste SANS source locale est OMISE (jamais mise à null) :
// `interview.interlocutorProfileId`, `question.expectedSource`, `question.createdBy`.
//
// ── API TESTÉE DE `apps/field/src/sync/montee.ts` ────────────────────────────
//   export function operationDeLigne(ligne: LigneOutbox, coffre: Coffre): Promise<Operation>;
//
// Traçabilité : E7 ; 11 §4 ; invariant 1 (ids client).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { operationSchema } from '../local/contrat-sync.js';
import { BaseLocale, type LigneOutbox } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import { operationDeLigne } from './montee.js';

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const SERVICE = '0191e2a0-0000-7000-8000-00000000b001';
const CREE_LE = '2026-10-09T07:00:00.000Z';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(43));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  nomBase = `axion-test-montee-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
});

afterEach(async () => {
  base.close();
  await Dexie.delete(nomBase);
});

async function seuleLigne(): Promise<LigneOutbox> {
  const lignes = await base.outbox.toArray();
  expect(lignes).toHaveLength(1);
  const [ligne] = lignes;
  if (ligne === undefined) throw new Error('banc : une ligne de file attendue');
  return ligne;
}

/** Les clés qui ne doivent JAMAIS figurer dans une charge montante. */
const CLES_LOCALES_INTERDITES = [
  'id',
  'clientUpdatedAt',
  'supprimeLe',
  'motsCles',
  'valideeLe',
  'revision',
  'charge',
] as const;

function sansCleLocale(payload: unknown): void {
  expect(payload).toBeTypeOf('object');
  for (const cle of CLES_LOCALES_INTERDITES) {
    expect(Object.keys(payload as Record<string, unknown>)).not.toContain(cle);
  }
}

// =============================================================================
describe('montée — la charge de chaque entité est la forme EXACTE du 04 (PD2)', () => {
  it('interview : colonnes `interviews` écrivables, sans `valideeLe` ni clé locale', async () => {
    const id = uuidv7();
    await ecrireLocal({
      entite: 'interview',
      id,
      missionId: MISSION,
      action: 'upsert',
      index: {
        orgUnitId: ORG_UNIT,
        kind: 'entretien',
        status: 'termine',
        scheduleStatus: 'realise',
        scheduledAt: '2026-10-09T06:30:00.000Z',
      },
      charge: {
        conductedBy: AUDITEUR,
        mode: 'sur_site',
        personName: 'Interlocuteur fictif',
        personRole: 'Fonction fictive',
        personServiceId: SERVICE,
        personEmail: null,
        participants: null,
        generalNotes: 'Notes fictives.',
        linkedReviewAnswerId: null,
        documentRequestId: null,
        consentGiven: true,
        consentAudio: false,
        consentedAt: CREE_LE,
        informationNoticeVersion: 'v1',
        noticeShownAt: CREE_LE,
        scheduledDurationMin: 60,
        startedAt: CREE_LE,
        endedAt: '2026-10-09T08:00:00.000Z',
        valideeLe: '2026-10-09T08:05:00.000Z',
        clientCreatedAt: CREE_LE,
      },
    });
    const ligne = await seuleLigne();

    const op = await operationDeLigne(ligne, coffre);

    expect(operationSchema.parse(op)).toEqual(op);
    expect(op.entityId).toBe(id);
    expect(op.payload).toEqual({
      missionId: MISSION,
      orgUnitId: ORG_UNIT,
      kind: 'entretien',
      status: 'termine',
      scheduleStatus: 'realise',
      scheduledAt: '2026-10-09T06:30:00.000Z',
      conductedBy: AUDITEUR,
      mode: 'sur_site',
      personName: 'Interlocuteur fictif',
      personRole: 'Fonction fictive',
      personServiceId: SERVICE,
      personEmail: null,
      participants: null,
      generalNotes: 'Notes fictives.',
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: CREE_LE,
      informationNoticeVersion: 'v1',
      noticeShownAt: CREE_LE,
      scheduledDurationMin: 60,
      startedAt: CREE_LE,
      endedAt: '2026-10-09T08:00:00.000Z',
      clientCreatedAt: CREE_LE,
    });
    sansCleLocale(op.payload);
  });

  it('answer : colonnes `answers`, drapeaux en BOOLÉENS, sans `revision` ni `missionId` (absente de la table)', async () => {
    const id = uuidv7();
    const interviewId = uuidv7();
    const missionQuestionId = uuidv7();
    await ecrireLocal({
      entite: 'answer',
      id,
      missionId: MISSION,
      action: 'upsert',
      index: {
        interviewId,
        missionQuestionId,
        flagReview: 1,
        notApplicable: 0,
        withheld: 1,
        horsParcours: 0,
      },
      charge: {
        value: { type: 'yes_no', v: true },
        note: 'Note fictive.',
        reviewReason: 'À confirmer (fictif).',
        naReason: null,
        withheldReason: 'confidentiel',
        source: 'entretien',
        questionTextSnapshot: 'Question fictive ?',
        revision: 3,
        clientCreatedAt: CREE_LE,
      },
    });
    const ligne = await seuleLigne();

    const op = await operationDeLigne(ligne, coffre);

    expect(op.entityId).toBe(id);
    expect(op.payload).toEqual({
      interviewId,
      missionQuestionId,
      flagReview: true,
      notApplicable: false,
      withheld: true,
      horsParcours: false,
      value: { type: 'yes_no', v: true },
      note: 'Note fictive.',
      reviewReason: 'À confirmer (fictif).',
      naReason: null,
      withheldReason: 'confidentiel',
      source: 'entretien',
      clientCreatedAt: CREE_LE,
    });
    sansCleLocale(op.payload);
  });

  it('attachment_meta : colonnes `attachments`, `createdBy` compris (S-3), note volante non rattachée', async () => {
    const id = uuidv7();
    await ecrireLocal({
      entite: 'attachment_meta',
      id,
      missionId: MISSION,
      action: 'upsert',
      index: { interviewId: null, answerId: null, kind: 'note' },
      charge: {
        content: 'Note de couloir fictive.',
        filename: null,
        mime: null,
        sizeBytes: null,
        storageKey: null,
        purgeAfter: null,
        createdBy: AUDITEUR,
        clientCreatedAt: CREE_LE,
      },
    });
    const ligne = await seuleLigne();

    const op = await operationDeLigne(ligne, coffre);

    expect(op.entity).toBe('attachment_meta');
    expect(op.entityId).toBe(id);
    expect(op.payload).toEqual({
      missionId: MISSION,
      interviewId: null,
      answerId: null,
      kind: 'note',
      content: 'Note de couloir fictive.',
      filename: null,
      mime: null,
      sizeBytes: null,
      createdBy: AUDITEUR,
      clientCreatedAt: CREE_LE,
    });
    sansCleLocale(op.payload);
  });

  it('org_unit_proposal : colonnes `org_units`, sans `clientCreatedAt` (absente de la table au 04)', async () => {
    const id = uuidv7();
    await ecrireLocal({
      entite: 'org_unit_proposal',
      id,
      missionId: MISSION,
      action: 'upsert',
      index: { parentId: ORG_UNIT, kind: 'service', status: 'proposee', position: 4 },
      charge: {
        name: 'Unité fictive proposée',
        countryCode: 'FR',
        timezone: null,
        headcount: 12,
        serviceRefId: SERVICE,
        sectorId: null,
        inScope: true,
        proposedBy: AUDITEUR,
        mergedIntoId: null,
        clientCreatedAt: CREE_LE,
      },
    });
    const ligne = await seuleLigne();

    const op = await operationDeLigne(ligne, coffre);

    expect(op.entityId).toBe(id);
    expect(op.payload).toEqual({
      missionId: MISSION,
      parentId: ORG_UNIT,
      kind: 'service',
      name: 'Unité fictive proposée',
      countryCode: 'FR',
      timezone: null,
      headcount: 12,
      proposedBy: AUDITEUR,
    });
    sansCleLocale(op.payload);
  });

  it('question_adhoc : `{question: {…, blockCode}, missionQuestion: {id, position}}`, les deux ids du client', async () => {
    const missionQuestionId = uuidv7();
    const questionId = uuidv7();
    await ecrireLocal({
      entite: 'question_adhoc',
      id: missionQuestionId,
      missionId: MISSION,
      action: 'upsert',
      index: {
        position: 8,
        texteSnapshot: 'Question ad hoc fictive ?',
        motsCles: ['question', 'fictive'],
        answerType: 'free_text',
        criticality: 'informatif',
      },
      charge: {
        questionId,
        questionVersion: 1,
        guidanceSnapshot: null,
        optionsSnapshot: null,
        scoringSnapshot: null,
        weightSnapshot: 0,
        allowRangeSnapshot: false,
        addedAdHoc: true,
        blockCode: 'BLOC-FICTIF',
      },
    });
    const ligne = await seuleLigne();

    const op = await operationDeLigne(ligne, coffre);

    expect(op.entity).toBe('question_adhoc');
    expect(op.entityId).toBe(questionId);
    const payload = op.payload as { question: Record<string, unknown>; missionQuestion: unknown };
    expect(Object.keys(payload).sort()).toEqual(['missionQuestion', 'question']);
    expect(payload.missionQuestion).toEqual({ id: missionQuestionId, position: 8 });
    // Liste serveur : textFr, guidanceFr, answerType, criticality, blockCode,
    // options, allowRange, expectedSource, createdBy — PAS `weight` (défaut serveur,
    // arbitrage 2026-10-09). `expectedSource` et `createdBy` n'ont AUCUNE source
    // locale (`chargeMissionQuestionSchema`) : elles sont OMISES, jamais inventées.
    expect(payload.question).toEqual({
      textFr: 'Question ad hoc fictive ?',
      guidanceFr: null,
      answerType: 'free_text',
      criticality: 'informatif',
      blockCode: 'BLOC-FICTIF',
      options: null,
      allowRange: false,
    });
    sansCleLocale(payload.question);
  });

  it('l’op reprend opId, action et clientUpdatedAt de la ligne ; delete_soft voyage en action', async () => {
    const id = uuidv7();
    await ecrireLocal({
      entite: 'attachment_meta',
      id,
      missionId: MISSION,
      action: 'delete_soft',
      index: { interviewId: null, answerId: null, kind: 'note' },
      charge: {
        content: 'Note fictive retirée.',
        filename: null,
        mime: null,
        sizeBytes: null,
        storageKey: null,
        purgeAfter: null,
        createdBy: AUDITEUR,
        clientCreatedAt: CREE_LE,
      },
    });
    const ligne = await seuleLigne();

    const op = await operationDeLigne(ligne, coffre);

    expect(op.opId).toBe(ligne.opId);
    expect(op.action).toBe('delete_soft');
    expect(op.clientUpdatedAt).toBe(ligne.clientUpdatedAt);
    sansCleLocale(op.payload);
  });
});
