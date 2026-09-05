// =============================================================================
// TESTS DES DÉPÔTS DE LECTURE — lot L5, incrément L5a.
//
// Écrits par A26 depuis `LOT_L5.md` §2 (« `src/local/depots/*.ts` : lecture
// seule, indexée »), §3.5 (« les compteurs de SES propres lignes »), 03 §25.4
// (recherche hors-parcours hors ligne), 03 §22.2 / §34.2 (« aujourd'hui » au
// fuseau de la MISSION), 05 §9.3 (états `rejetee` / `a_examiner` toujours
// visibles) et les signatures/JSDoc exportées des quatre dépôts.
//
// Les données sont écrites par le PORT (`ecrireLocal`, `appliquerDescente`),
// jamais par Dexie directement — sauf pour forcer un statut d'op que seul le
// moteur L6 saura poser, ce qui est dit là où c'est fait.
//
// Traçabilité : E6 (hors ligne total — tout se lit dans IndexedDB) ·
// E7 (remontée continue — la file se lit dans l'ordre, par lots de 100).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaseLocale } from '../base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../contexte.js';
import { appliquerDescente, ecrireLocal } from '../ecriture.js';
import { jetonsDeRecherche } from '../formes.js';
import { depotOutbox } from './outbox.js';
import { RESULTATS_RECHERCHE_MAX, depotQuestions } from './questions.js';
import { depotReponses } from './reponses.js';
import { depotSessions } from './sessions.js';

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000f2de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const HORODATAGE = '2026-09-02T08:15:00.000Z';

const SESSION_1 = uuidv7(); // en_cours, planifiée 2026-09-03T01:00Z
const SESSION_2 = uuidv7(); // termine,  planifiée 2026-09-02T10:00Z
const SESSION_3 = uuidv7(); // non_demarre, planifiée 2026-09-03T17:00Z
const SESSION_B = uuidv7(); // mission B, en_cours

const QUESTION_IDS = Array.from({ length: 25 }, () => uuidv7());

let base: BaseLocale;

function chargeInterview(personName: string) {
  return {
    conductedBy: AUDITEUR,
    mode: 'sur_site' as const,
    personName,
    personRole: null,
    personServiceId: null,
    personEmail: null,
    participants: null,
    generalNotes: null,
    linkedReviewAnswerId: null,
    documentRequestId: null,
    consentGiven: true,
    consentAudio: false,
    consentedAt: null,
    informationNoticeVersion: null,
    noticeShownAt: null,
    scheduledDurationMin: null,
    startedAt: null,
    endedAt: null,
    valideeLe: null,
    clientCreatedAt: HORODATAGE,
  };
}

async function ecrireSession(
  id: string,
  missionId: string,
  status: 'non_demarre' | 'en_cours' | 'termine',
  scheduledAt: string | null,
  personName: string,
) {
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId,
    action: 'upsert',
    index: {
      orgUnitId: ORG_UNIT,
      kind: 'entretien',
      status,
      scheduleStatus: 'planifie',
      scheduledAt,
    },
    charge: chargeInterview(personName),
  });
}

async function ecrireReponse(
  interviewId: string,
  missionQuestionId: string,
  options: {
    value?: unknown;
    note?: string | null;
    flagReview?: 0 | 1;
    notApplicable?: 0 | 1;
    withheld?: 0 | 1;
    horsParcours?: 0 | 1;
    action?: 'upsert' | 'delete_soft';
    id?: string;
  } = {},
) {
  await ecrireLocal({
    entite: 'answer',
    id: options.id ?? uuidv7(),
    missionId: MISSION_A,
    action: options.action ?? 'upsert',
    index: {
      interviewId,
      missionQuestionId,
      flagReview: options.flagReview ?? 0,
      notApplicable: options.notApplicable ?? 0,
      withheld: options.withheld ?? 0,
      horsParcours: options.horsParcours ?? 0,
    },
    charge: {
      value: { type: 'free_text', v: options.value ?? 'réponse fictive' },
      note: options.note ?? null,
      reviewReason: options.flagReview === 1 ? 'à confirmer' : null,
      naReason: options.notApplicable === 1 ? 'sans objet' : null,
      withheldReason: options.withheld === 1 ? 'confidentiel' : null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: HORODATAGE,
    },
  });
}

const TEXTES_QUESTIONS = [
  'Quel est le niveau de maturité des données ?',
  'Les données sont-elles gouvernées ?',
  'Quelle est la stratégie IA de la direction ?',
];

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(13));
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  base = new BaseLocale('axion-test-depots');
  await base.open();
  installerContexteLocal({ base, coffre });

  // ── Questions de mission (descendues du siège) : 3 lisibles + 22 « test n » ─
  await appliquerDescente({
    missionId: MISSION_A,
    serverTime: HORODATAGE,
    prochainSince: HORODATAGE,
    enregistrements: QUESTION_IDS.map((id, i) => {
      const texte = TEXTES_QUESTIONS[i] ?? `Question de test numéro ${String(i)}`;
      return {
        table: 'missionQuestions' as const,
        index: {
          id,
          missionId: MISSION_A,
          position: 25 - i, // positions DÉCROISSANTES à l'insertion : l'ordre doit être recalculé
          texteSnapshot: texte,
          motsCles: jetonsDeRecherche(texte),
          answerType: 'free_text' as const,
          criticality: 'important' as const,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          questionId: uuidv7(),
          questionVersion: 1,
          guidanceSnapshot: i === 0 ? 'Consigne fictive' : null,
          optionsSnapshot: null,
          scoringSnapshot: null,
          weightSnapshot: null,
          allowRangeSnapshot: false,
          addedAdHoc: false,
          blockCode: null,
        },
      };
    }),
  });

  // ── Sessions ───────────────────────────────────────────────────────────────
  await ecrireSession(SESSION_1, MISSION_A, 'en_cours', '2026-09-03T01:00:00.000Z', 'Personne un');
  await ecrireSession(SESSION_2, MISSION_A, 'termine', '2026-09-02T10:00:00.000Z', 'Personne deux');
  await ecrireSession(
    SESSION_3,
    MISSION_A,
    'non_demarre',
    '2026-09-03T17:00:00.000Z',
    'Personne trois',
  );
  await ecrireSession(SESSION_B, MISSION_B, 'en_cours', null, 'Personne mission B');

  // ── Réponses de la session 1 : 5 vivantes + 1 supprimée ───────────────────
  const [q1, q2, q3, q4, q5, q6] = QUESTION_IDS as [string, string, string, string, string, string];
  await ecrireReponse(SESSION_1, q1, { flagReview: 1, note: 'note à revoir' });
  await ecrireReponse(SESSION_1, q2, { notApplicable: 1 });
  await ecrireReponse(SESSION_1, q3, { withheld: 1 });
  await ecrireReponse(SESSION_1, q4, { horsParcours: 1 });
  await ecrireReponse(SESSION_1, q5, { value: 'valeur cinq' });
  const supprimee = uuidv7();
  await ecrireReponse(SESSION_1, q6, { id: supprimee });
  await ecrireReponse(SESSION_1, q6, { id: supprimee, action: 'delete_soft' });
  // Session 2 : un à-revoir de plus, pour le compte par mission.
  await ecrireReponse(SESSION_2, q1, { flagReview: 1 });
}, 30_000);

afterAll(async () => {
  retirerContexteLocal();
  base.close();
  await Dexie.delete('axion-test-depots');
});

// =============================================================================
// A. depotOutbox
// =============================================================================
describe('depotOutbox — la file, lue sans la modifier (05 §9.3)', () => {
  // 4 sessions + 8 écritures de réponses (dont la suppression) = 12 ops.
  const TOTAL_OPS = 12;

  it('operationsEnAttente() compte toute la file ; par mission, seulement la sienne', async () => {
    expect(await depotOutbox.operationsEnAttente()).toBe(TOTAL_OPS);
    expect(await depotOutbox.operationsEnAttente(MISSION_B)).toBe(1);
    expect(await depotOutbox.operationsEnAttente(MISSION_A)).toBe(TOTAL_OPS - 1);
  });

  it('compterParStatut() rend les trois statuts, à zéro quand ils sont vides', async () => {
    const comptes = await depotOutbox.compterParStatut();
    expect(comptes).toEqual({ en_attente: TOTAL_OPS, rejetee: 0, a_examiner: 0 });
  });

  it('@critique prochainLot() rend les ops de la mission dans l’ordre de file, bornées par la taille', async () => {
    const lot = await depotOutbox.prochainLot(MISSION_A, 3);
    expect(lot).toHaveLength(3);
    const ids = lot.map((op) => op.opId);
    expect([...ids].sort()).toEqual(ids);
    expect(lot.every((op) => op.missionId === MISSION_A)).toBe(true);

    const complet = await depotOutbox.prochainLot(MISSION_A);
    expect(complet).toHaveLength(TOTAL_OPS - 1);
    expect(complet.slice(0, 3).map((op) => op.opId)).toEqual(ids);
  });

  it('@critique une op `rejetee` ou `a_examiner` sort du prochain lot mais reste VISIBLE pour un humain', async () => {
    // Ces statuts sont posés par le moteur L6 (05 §9.3, §9.9) ; on les force ici.
    const [premiere, seconde] = await depotOutbox.prochainLot(MISSION_A, 2);
    if (!premiere || !seconde) throw new Error('file trop courte');
    await base.outbox.update(premiere.opId, { statut: 'rejetee', derniereErreur: 'forbidden' });
    await base.outbox.update(seconde.opId, { statut: 'a_examiner', tentatives: 10 });

    try {
      const lot = await depotOutbox.prochainLot(MISSION_A);
      expect(lot.map((op) => op.opId)).not.toContain(premiere.opId);
      expect(lot.map((op) => op.opId)).not.toContain(seconde.opId);
      expect(await depotOutbox.operationsEnAttente(MISSION_A)).toBe(TOTAL_OPS - 3);

      const aTraiter = await depotOutbox.aTraiterParUnHumain(MISSION_A);
      expect(aTraiter.map((op) => op.opId).sort()).toEqual([premiere.opId, seconde.opId].sort());
      expect(await depotOutbox.aTraiterParUnHumain(MISSION_B)).toEqual([]);
      expect(await depotOutbox.compterParStatut(MISSION_A)).toEqual({
        en_attente: TOTAL_OPS - 3,
        rejetee: 1,
        a_examiner: 1,
      });
    } finally {
      await base.outbox.update(premiere.opId, { statut: 'en_attente', derniereErreur: null });
      await base.outbox.update(seconde.opId, { statut: 'en_attente', tentatives: 0 });
    }
  });
});

// =============================================================================
// B. depotReponses
// =============================================================================
describe('depotReponses — lecture déchiffrée et compteurs locaux (LOT_L5.md §3.5)', () => {
  it('parSession() rend les réponses VIVANTES de la session, déchiffrées et à plat', async () => {
    const reponses = await depotReponses.parSession(SESSION_1);
    expect(reponses).toHaveLength(5);
    expect(reponses.every((r) => r.interviewId === SESSION_1)).toBe(true);
    expect(reponses.every((r) => r.supprimeLe === null)).toBe(true);
    const cinq = reponses.find((r) => r.missionQuestionId === QUESTION_IDS[4]);
    expect(cinq?.value).toEqual({ type: 'free_text', v: 'valeur cinq' });
    expect(cinq?.source).toBe('entretien');
  });

  it('parSession() sur une session sans réponse rend []', async () => {
    expect(await depotReponses.parSession(SESSION_3)).toEqual([]);
  });

  it('parQuestion() rend la réponse d’une question, ou null', async () => {
    const q1 = QUESTION_IDS.at(0) ?? '';
    const reponse = await depotReponses.parQuestion(SESSION_1, q1);
    expect(reponse?.flagReview).toBe(1);
    expect(reponse?.note).toBe('note à revoir');
    expect(await depotReponses.parQuestion(SESSION_1, uuidv7())).toBeNull();
  });

  it('parQuestion() ne rend pas une réponse supprimée', async () => {
    const q6 = QUESTION_IDS.at(5) ?? '';
    expect(await depotReponses.parQuestion(SESSION_1, q6)).toBeNull();
  });

  it('@critique avancement() compte SES lignes : 5 répondues, 1 à-revoir, 1 N/A, 1 non communiquée, 1 hors-parcours', async () => {
    expect(await depotReponses.avancement(SESSION_1)).toEqual({
      repondues: 5,
      aRevoir: 1,
      nonApplicables: 1,
      nonCommuniquees: 1,
      horsParcours: 1,
    });
  });

  it('avancement() d’une session vide est à zéro partout', async () => {
    expect(await depotReponses.avancement(SESSION_3)).toEqual({
      repondues: 0,
      aRevoir: 0,
      nonApplicables: 0,
      nonCommuniquees: 0,
      horsParcours: 0,
    });
  });

  it('aRevoirOuverts() agrège par mission (2 sur A, 0 sur B)', async () => {
    expect(await depotReponses.aRevoirOuverts(MISSION_A)).toBe(2);
    expect(await depotReponses.aRevoirOuverts(MISSION_B)).toBe(0);
  });
});

// =============================================================================
// C. depotSessions
// =============================================================================
describe('depotSessions — « aujourd’hui » au fuseau de la MISSION (03 §22.2, §34.2)', () => {
  // 20:30 UTC : déjà le 3 à Singapour (04:30), encore le 2 à Paris (22:30, CEST).
  const INSTANT = '2026-09-02T20:30:00.000Z';

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : « aujourd'hui » calculé en UTC ou au fuseau
  // de l'appareil. À 20h30 UTC, c'est déjà le 3 à Singapour et encore le 2 à
  // Paris : les deux cockpits doivent montrer des sessions DIFFÉRENTES.
  it('@critique à Singapour (UTC+8), le 3 septembre a commencé : la session de 01:00Z est du jour, celle de 10:00Z de la veille', async () => {
    const sessions = await depotSessions.duJour({
      missionId: MISSION_A,
      fuseau: 'Asia/Singapore',
      instantIso: INSTANT,
    });
    expect(sessions.map((s) => s.id)).toEqual([SESSION_1]);
    expect(sessions[0]?.personName).toBe('Personne un');
  });

  // La session EN COURS reste sous les yeux quelle que soit sa date (03 §34.2 :
  // alerte « entretien commencé non terminé », « reprendre là où il s'est
  // arrêté ») — c'est pourquoi SESSION_1 apparaît aussi à Paris.
  it('@critique à Paris (UTC+2), on est encore le 2 : la session de 10:00Z est du jour, celle de 01:00Z (le 3) n’y est que parce qu’elle est EN COURS', async () => {
    const sessions = await depotSessions.duJour({
      missionId: MISSION_A,
      fuseau: 'Europe/Paris',
      instantIso: INSTANT,
    });
    expect(sessions.map((s) => s.id).sort()).toEqual([SESSION_1, SESSION_2].sort());
    expect(sessions.map((s) => s.id)).not.toContain(SESSION_3);
  });

  it('sans `missionId`, toutes les missions ; un jour sans session planifiée ne montre que celles EN COURS', async () => {
    const toutes = await depotSessions.duJour({ fuseau: 'Asia/Singapore', instantIso: INSTANT });
    expect(toutes.map((s) => s.id)).toContain(SESSION_1);
    expect(toutes.map((s) => s.id)).toContain(SESSION_B);
    const noel = await depotSessions.duJour({
      missionId: MISSION_A,
      fuseau: 'Europe/Paris',
      instantIso: '2026-12-25T12:00:00.000Z',
    });
    expect(noel.map((s) => s.id)).toEqual([SESSION_1]);
  });

  it('parId() rend la session déchiffrée à plat, ou null', async () => {
    const session = await depotSessions.parId(SESSION_2);
    expect(session?.status).toBe('termine');
    expect(session?.personName).toBe('Personne deux');
    expect(session?.conductedBy).toBe(AUDITEUR);
    expect(await depotSessions.parId(uuidv7())).toBeNull();
  });

  it('sessionEnCours() dit vrai tant qu’UNE session est `en_cours` sur l’appareil (verrou 60 min, 05 §9.7)', async () => {
    expect(await depotSessions.sessionEnCours()).toBe(true);
  });

  it('compterParStatut() par mission', async () => {
    expect(await depotSessions.compterParStatut(MISSION_A)).toEqual({
      non_demarre: 1,
      en_cours: 1,
      termine: 1,
    });
    expect(await depotSessions.compterParStatut(MISSION_B)).toEqual({
      non_demarre: 0,
      en_cours: 1,
      termine: 0,
    });
  });
});

// =============================================================================
// D. depotQuestions
// =============================================================================
describe('depotQuestions — questionnaire figé et recherche hors ligne (03 §25.4)', () => {
  it('parMission() rend les questions par `position` croissante, déchiffrées', async () => {
    const questions = await depotQuestions.parMission(MISSION_A);
    expect(questions).toHaveLength(25);
    const positions = questions.map((q) => q.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(questions.every((q) => q.questionVersion === 1)).toBe(true);
    expect(await depotQuestions.parMission(MISSION_B)).toEqual([]);
  });

  it('parId() rend la question avec sa consigne déchiffrée, ou null', async () => {
    const q1 = await depotQuestions.parId(QUESTION_IDS.at(0) ?? '');
    expect(q1?.texteSnapshot).toBe(TEXTES_QUESTIONS[0]);
    expect(q1?.guidanceSnapshot).toBe('Consigne fictive');
    expect(await depotQuestions.parId(uuidv7())).toBeNull();
  });

  it('@critique rechercher() trouve sur les jetons du texte figé, insensible à la casse et aux accents, la plus pertinente en tête', async () => {
    const resultats = await depotQuestions.rechercher('DONNÉES maturite', MISSION_A);
    expect(resultats.map((r) => r.question.id)).toEqual([QUESTION_IDS[0], QUESTION_IDS[1]]);
    expect(resultats[0]?.jetonsTrouves).toBe(2);
    expect(resultats[1]?.jetonsTrouves).toBe(1);
  });

  it('rechercher() sans correspondance, ou sur une requête vide, rend []', async () => {
    expect(await depotQuestions.rechercher('blockchain quantique', MISSION_A)).toEqual([]);
    expect(await depotQuestions.rechercher('   ', MISSION_A)).toEqual([]);
  });

  it('rechercher() est bornée à RESULTATS_RECHERCHE_MAX résultats', async () => {
    const resultats = await depotQuestions.rechercher('test', MISSION_A);
    expect(resultats.length).toBe(Math.min(22, RESULTATS_RECHERCHE_MAX));
    expect(RESULTATS_RECHERCHE_MAX).toBeLessThanOrEqual(22);
  });

  it('rechercher() sans `missionId` cherche dans toutes les missions embarquées', async () => {
    const resultats = await depotQuestions.rechercher('stratégie');
    expect(resultats.map((r) => r.question.id)).toEqual([QUESTION_IDS[2]]);
  });
});
