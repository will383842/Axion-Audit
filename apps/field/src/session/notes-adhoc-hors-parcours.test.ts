// =============================================================================
// NOTES, QUESTION AD HOC, HORS-PARCOURS, ÉTANCHÉITÉ — lot L5, incrément L5b.
// ÉCRIT AVANT LE CODE, par A26, depuis `docs/conception/LOT_L5.md` (§1 L5b,
// §3.2, §4), 03 (M3.1, §17.4, §25.4) et 11 §4 — 09 §5.6.
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. Les TROIS notes de M3.1/§17.4 : note de question (`answers.note`),
//      bloc-notes de session (`interviews.general_notes`), NOTE VOLANTE
//      (`attachments.kind='note'`, rattachement différé) — contenu CHIFFRÉ.
//   B. Question AD HOC (11 §4, V2.9) : créée hors ligne avec un UUID v7 client,
//      entre dans l'outbox comme UNE op `question_adhoc`, et devient une question
//      comme les autres (répondable, cherchable).
//   C. HORS-PARCOURS (03 §25.4) : recherche locale plein texte, réponse sur
//      l'entretien courant avec `hors_parcours = 1`.
//   D. ÉTANCHÉITÉ après le scénario complet : aucune sentinelle personnelle en
//      clair, nulle part — même méthode que `local/etancheite.test.ts`.
//
// ── ÉCHAFAUDAGE (rencontre du 2026-09-02, DECISIONS.md [L5b]) ────────────────
//   Écrit sur des hypothèses d'interface (`./entretien.js`) ; A22 a livré
//   `ecriture-session.ts`, `ecriture-reponses.ts`, `notes-volantes.ts` et
//   `questions-adhoc.ts`. Par arbitrage A01, seul l'échafaudage s'adapte (les
//   adaptateurs ci-dessous) ; chaque assertion est gardée telle quelle.
//
// Traçabilité : E13 (écran 3 zones), E6 (hors ligne total), E33 (RGPD), E7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { TypeDeReponse, ValeurReponse } from '@axion/shared';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { depotQuestions, type QuestionLocale } from '../local/depots/questions.js';
import { depotReponses } from '../local/depots/reponses.js';
import { depotSessions } from '../local/depots/sessions.js';
import { appliquerDescente } from '../local/ecriture.js';
import { jetonsDeRecherche } from '../local/formes.js';
import { PROFIL_PAR_DEFAUT } from './auditeur.js';
import { ecrireReponse, type ModificationReponse } from './ecriture-reponses.js';
import {
  creerEntretien,
  demarrerEntretien as demarrerSession,
  ecrireNotesGenerales,
} from './ecriture-session.js';
import {
  creerNoteVolante as capturerNoteVolante,
  type DemandeNoteVolante,
} from './notes-volantes.js';
import { creerQuestionAdHoc } from './questions-adhoc.js';
import type { ValeurTypee } from './valeurs.js';

// -----------------------------------------------------------------------------
// Adaptateurs — la forme de saisie de ce fichier, traduite vers celle d'A22
// -----------------------------------------------------------------------------
interface SaisieReponse {
  readonly value?: ValeurReponse | null;
  readonly note?: string | null;
  readonly aRevoir?: { readonly motif: string | null } | null;
  readonly horsParcours?: boolean;
}

function traduire(saisie: SaisieReponse): ModificationReponse {
  const modification: {
    -readonly [K in keyof ModificationReponse]: ModificationReponse[K];
  } = {};
  if (saisie.value !== undefined) modification.value = saisie.value as ValeurTypee | null;
  if (saisie.note !== undefined) modification.note = saisie.note;
  if (saisie.aRevoir !== undefined) {
    modification.flagReview = saisie.aRevoir !== null;
    modification.reviewReason = saisie.aRevoir?.motif ?? null;
  }
  if (saisie.horsParcours !== undefined) modification.horsParcours = saisie.horsParcours;
  return modification;
}

/** « Nouvel entretien » puis démarrage avec accord : la session rendue est `en_cours`. */
async function demarrerEntretien(demande: {
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly conductedBy: string;
  readonly personName: string;
  readonly personRole: string;
}): Promise<string> {
  const id = await creerEntretien({ ...demande, personEmail: null });
  const session = await depotSessions.parId(id);
  if (session === null) throw new Error(`échafaudage : session ${id} introuvable après création`);
  await demarrerSession(session, PROFIL_PAR_DEFAUT, true);
  return id;
}

async function enregistrerReponse(demande: {
  readonly missionId: string;
  readonly interviewId: string;
  readonly question: QuestionLocale;
  readonly saisie: SaisieReponse;
}): Promise<{ id: string }> {
  const session = await depotSessions.parId(demande.interviewId);
  if (session === null) throw new Error(`échafaudage : session ${demande.interviewId} absente`);
  const ecrite = await ecrireReponse(
    { session, question: demande.question },
    traduire(demande.saisie),
  );
  return { id: ecrite.id };
}

async function ecrireBlocNotes(demande: {
  readonly missionId: string;
  readonly interviewId: string;
  readonly notes: string;
}): Promise<void> {
  const session = await depotSessions.parId(demande.interviewId);
  if (session === null) throw new Error(`échafaudage : session ${demande.interviewId} absente`);
  await ecrireNotesGenerales(session, demande.notes);
}

/**
 * `DemandeNoteVolante.interviewId` est typé `string` chez A22 alors que l'index
 * local (`IndexAttachment`) et le 04 (P1-5 : `interview_id FK NULL`, « note
 * volante non encore rattachée ») admettent `null`. L'échafaudage passe la
 * valeur telle quelle — c'est le comportement qui est jugé, pas le type.
 */
function creerNoteVolante(demande: {
  readonly missionId: string;
  readonly interviewId: string | null;
  readonly createdBy: string;
  readonly content: string;
}): Promise<string> {
  return capturerNoteVolante(demande as DemandeNoteVolante);
}

/** Position « juste après » : celle qu'annonce l'hypothèse `apresPosition`. */
async function ajouterQuestionAdHoc(demande: {
  readonly missionId: string;
  readonly texte: string;
  readonly guidance: string | null;
  readonly answerType: TypeDeReponse;
  readonly blockCode: string;
  readonly apresPosition: number;
}): Promise<QuestionLocale> {
  const id = await creerQuestionAdHoc({
    missionId: demande.missionId,
    texte: demande.texte,
    answerType: demande.answerType,
    guidance: demande.guidance,
    blockCode: demande.blockCode,
    position: demande.apresPosition + 1,
  });
  const question = await depotQuestions.parId(id);
  if (question === null) throw new Error(`échafaudage : question ad hoc ${id} introuvable`);
  return question;
}

// -----------------------------------------------------------------------------
// Sentinelles — fictives (invariant 2), impossibles à produire par hasard
// -----------------------------------------------------------------------------
const SENTINELLES = {
  nom: 'SENTINELLE_NOM_L5B_QK4T9W',
  fonction: 'SENTINELLE_FONCTION_L5B_RM2P7X',
  noteQuestion: 'SENTINELLE_NOTE_QUESTION_L5B_VD8N3C',
  blocNotes: 'SENTINELLE_BLOC_NOTES_L5B_HZ5J1F',
  noteVolante: 'SENTINELLE_NOTE_VOLANTE_L5B_TB6W4L',
  noteVolanteOrpheline: 'SENTINELLE_VOLANTE_ORPHELINE_L5B_GX3S8K',
  valeurTexte: 'SENTINELLE_VALEUR_TEXTE_L5B_PN7C2D',
  motifARevoir: 'SENTINELLE_MOTIF_AREVOIR_L5B_JW9F5M',
  valeurHorsParcours: 'SENTINELLE_VALEUR_HORS_PARCOURS_L5B_CY1R6Q',
  reponseAdHoc: 'SENTINELLE_REPONSE_ADHOC_L5B_LF4V8B',
} as const;

const HORODATAGE = '2026-09-02T08:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e001';
const Q_PARCOURS_1 = '0191e2a0-0000-7000-8000-000000000101';
const Q_PARCOURS_2 = '0191e2a0-0000-7000-8000-000000000102';
const Q_LOINTAINE = '0191e2a0-0000-7000-8000-000000000103';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Texte figé d'une question qu'on ira chercher HORS PARCOURS. */
const TEXTE_LOINTAIN = 'Le service dispose-t-il d’un registre des traitements de données ?';

function questionDescendue(id: string, position: number, texte: string) {
  return {
    table: 'missionQuestions' as const,
    index: {
      id,
      missionId: MISSION_ID,
      position,
      texteSnapshot: texte,
      motsCles: jetonsDeRecherche(texte),
      answerType: 'free_text' as const,
      criticality: 'important' as const,
      clientUpdatedAt: HORODATAGE,
      supprimeLe: null,
    },
    charge: {
      questionId: `0191e2a0-0000-7000-8000-0000000002${position.toString().padStart(2, '0')}`,
      questionVersion: 1,
      guidanceSnapshot: null,
      optionsSnapshot: null,
      scoringSnapshot: null,
      weightSnapshot: 0,
      allowRangeSnapshot: false,
      addedAdHoc: false,
      blockCode: 'bloc_fictif',
    },
  };
}

let base: BaseLocale;
let coffre: Coffre;
let interviewId: string;

/** Lève avec un message clair plutôt qu'un `!` : la fixture doit exister. */
function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`fixture : ${libelle} manquant`);
  return valeur;
}
let noteVolanteId: string;
let noteVolanteOrphelineId: string;
let questionAdHocId: string;
let vidage: Record<string, Record<string, unknown>[]> = {};

function octetsEnHex(octets: Uint8Array): string {
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

/** Sérialisation profonde — objets, tableaux, tampons (hex ET utf-8 décodé). */
function serialiserProfond(valeur: unknown): string {
  const decodeur = new TextDecoder();
  return JSON.stringify(valeur, (_cle, v: unknown) => {
    if (v instanceof ArrayBuffer) {
      const vue = new Uint8Array(v);
      return { hex: octetsEnHex(vue), utf8: decodeur.decode(vue) };
    }
    if (ArrayBuffer.isView(v)) {
      const vue = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      return { hex: octetsEnHex(vue), utf8: decodeur.decode(vue) };
    }
    return v;
  });
}

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(7), {
    algo: 'argon2id',
    memoireKio: 1024,
    iterations: 1,
    parallelisme: 1,
    longueurOctets: 32,
  });
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  base = new BaseLocale('axion-test-l5b-notes');
  await base.open();
  installerContexteLocal({ base, coffre });

  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: HORODATAGE,
    prochainSince: HORODATAGE,
    enregistrements: [
      {
        table: 'missions',
        index: {
          id: MISSION_ID,
          status: 'en_cours',
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          titre: 'Mission fictive FIL-GC',
          companyId: '0191e2a0-0000-7000-8000-00000000cccc',
          timezone: 'Europe/Paris',
          auditLevel: 'operationnel',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'auditeur',
        },
      },
      {
        table: 'orgUnits',
        index: {
          id: ORG_UNIT_ID,
          missionId: MISSION_ID,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif',
          countryCode: null,
          timezone: null,
          headcount: 8,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: HORODATAGE,
        },
      },
      questionDescendue(Q_PARCOURS_1, 1, 'Comment les demandes arrivent-elles au service ?'),
      questionDescendue(Q_PARCOURS_2, 2, 'Qui valide une demande avant traitement ?'),
      questionDescendue(Q_LOINTAINE, 40, TEXTE_LOINTAIN),
    ],
  });

  // ── Le scénario complet ────────────────────────────────────────────────────
  interviewId = await demarrerEntretien({
    missionId: MISSION_ID,
    orgUnitId: ORG_UNIT_ID,
    conductedBy: AUDITEUR_ID,
    personName: SENTINELLES.nom,
    personRole: SENTINELLES.fonction,
  });

  const q1 = await depotQuestions.parId(Q_PARCOURS_1);
  const q2 = await depotQuestions.parId(Q_PARCOURS_2);
  if (q1 === null || q2 === null) throw new Error('questionnaire fictif absent');

  // 1. Une réponse avec valeur + note de question + à-revoir motivé.
  await enregistrerReponse({
    missionId: MISSION_ID,
    interviewId,
    question: q1,
    saisie: {
      value: { type: 'free_text', v: SENTINELLES.valeurTexte },
      note: SENTINELLES.noteQuestion,
      aRevoir: { motif: SENTINELLES.motifARevoir },
    },
  });

  // 2. Le bloc-notes de session.
  await ecrireBlocNotes({ missionId: MISSION_ID, interviewId, notes: SENTINELLES.blocNotes });

  // 3. Deux notes volantes : une rattachée à la session, une ORPHELINE (§17.4 :
  //    « capture immédiate, rattachement différé »).
  noteVolanteId = await creerNoteVolante({
    missionId: MISSION_ID,
    interviewId,
    createdBy: AUDITEUR_ID,
    content: SENTINELLES.noteVolante,
  });
  noteVolanteOrphelineId = await creerNoteVolante({
    missionId: MISSION_ID,
    interviewId: null,
    createdBy: AUDITEUR_ID,
    content: SENTINELLES.noteVolanteOrpheline,
  });

  // 4. Une question AD HOC, insérée après la question courante, puis répondue.
  const adHoc = await ajouterQuestionAdHoc({
    missionId: MISSION_ID,
    texte: 'Quel outil sert à suivre les relances ?',
    guidance: null,
    answerType: 'free_text',
    blockCode: 'bloc_fictif',
    apresPosition: q1.position,
  });
  questionAdHocId = adHoc.id;
  await enregistrerReponse({
    missionId: MISSION_ID,
    interviewId,
    question: adHoc,
    saisie: { value: { type: 'free_text', v: SENTINELLES.reponseAdHoc } },
  });

  // 5. Une question HORS PARCOURS : trouvée par la recherche, répondue sur la
  //    session courante.
  const trouvees = await depotQuestions.rechercher('registre traitements', MISSION_ID);
  const lointaine = trouvees.find((r) => r.question.id === Q_LOINTAINE)?.question;
  if (lointaine === undefined)
    throw new Error('la recherche hors-parcours ne trouve pas la question');
  await enregistrerReponse({
    missionId: MISSION_ID,
    interviewId,
    question: lointaine,
    saisie: { value: { type: 'free_text', v: SENTINELLES.valeurHorsParcours }, horsParcours: true },
  });

  // ── Le vidage : TOUTES les tables, sans liste ──────────────────────────────
  vidage = {};
  for (const table of base.tables) {
    vidage[table.name] = (await table.toArray()) as Record<string, unknown>[];
  }
}, 30_000);

afterAll(async () => {
  retirerContexteLocal();
  base.close();
  await Dexie.delete('axion-test-l5b-notes');
});

// =============================================================================
// A. Les trois notes
// =============================================================================
describe('note de question (M3.1 zone droite, `answers.note`)', () => {
  it('@critique la note se relit par le coffre et N’EST PAS dans l’index', async () => {
    const relue = await depotReponses.parQuestion(interviewId, Q_PARCOURS_1);
    expect(relue?.note).toBe(SENTINELLES.noteQuestion);
    const brute = (await base.answers.get(requis(relue, 'réponse').id)) as unknown as Record<
      string,
      unknown
    >;
    expect(brute).not.toHaveProperty('note');
    expect(brute.flagReview).toBe(1);
  });

  it('une note seule (sans valeur) crée la réponse — noter n’attend pas de coter (§17.4)', async () => {
    const q2 = await depotQuestions.parId(Q_PARCOURS_2);
    const { id } = await enregistrerReponse({
      missionId: MISSION_ID,
      interviewId,
      question: requis(q2, 'question 2'),
      saisie: { note: 'Note prise avant toute cote.' },
    });
    const relue = await depotReponses.parQuestion(interviewId, Q_PARCOURS_2);
    expect(relue?.id).toBe(id);
    expect(relue?.value).toBeNull();
    expect(relue?.note).toBe('Note prise avant toute cote.');
  });
});

describe('bloc-notes de session (M3.1 : « bloc-notes général de l’entretien »)', () => {
  it('@critique le bloc-notes est écrit dans `generalNotes` SANS effacer l’identité de la session', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : ré-upserter la session avec une charge
    // reconstruite à partir du seul bloc-notes — `personName` devient null, et
    // l'entretien perd son interlocuteur au premier mot noté.
    const session = await depotSessions.parId(interviewId);
    expect(session?.generalNotes).toBe(SENTINELLES.blocNotes);
    expect(session?.personName).toBe(SENTINELLES.nom);
    expect(session?.personRole).toBe(SENTINELLES.fonction);
    expect(session?.status).toBe('en_cours');
    expect(session?.conductedBy).toBe(AUDITEUR_ID);
  });

  it('chaque écriture du bloc-notes est une op `interview` sur le même id (enregistrement continu)', async () => {
    const avant = await base.outbox.where('entiteId').equals(interviewId).count();
    await ecrireBlocNotes({
      missionId: MISSION_ID,
      interviewId,
      notes: `${SENTINELLES.blocNotes} — suite`,
    });
    const ops = await base.outbox.where('entiteId').equals(interviewId).toArray();
    expect(ops).toHaveLength(avant + 1);
    expect(ops.every((op) => op.entite === 'interview')).toBe(true);
    expect((await depotSessions.parId(interviewId))?.generalNotes).toContain('— suite');
  });
});

describe('note volante (§17.4, `attachments.kind = "note"`, P1-5)', () => {
  it('@critique la note volante est une pièce `kind = "note"` dont le contenu est CHIFFRÉ', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : stocker `content` dans l'index « parce
    // qu'une note volante n'a pas de réponse à laquelle se cacher ».
    expect(noteVolanteId).toMatch(UUID_V7);
    const brute = (await base.attachments.get(noteVolanteId)) as unknown as Record<string, unknown>;
    expect(brute.kind).toBe('note');
    expect(brute.interviewId).toBe(interviewId);
    expect(brute.answerId).toBeNull();
    expect(brute).not.toHaveProperty('content');
    const clair = await coffre.dechiffrer(
      brute.charge as Parameters<Coffre['dechiffrer']>[0],
      z.looseObject({ content: z.string(), createdBy: z.string() }),
    );
    expect(clair.content).toBe(SENTINELLES.noteVolante);
    expect(clair.createdBy).toBe(AUDITEUR_ID);
  });

  it('@critique une note volante ORPHELINE (sans session) est admise — « rattachement différé »', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : exiger un `interviewId` — c'est
    // précisément le cas « je ne sais pas où la mettre » que §17.4 protège.
    const brute = (await base.attachments.get(noteVolanteOrphelineId)) as unknown as Record<
      string,
      unknown
    >;
    expect(brute.kind).toBe('note');
    expect(brute.interviewId).toBeNull();
    expect(brute.answerId).toBeNull();
    expect(brute.missionId).toBe(MISSION_ID);
  });

  it('chaque note volante est UNE op `attachment_meta`', async () => {
    for (const id of [noteVolanteId, noteVolanteOrphelineId]) {
      const ops = await base.outbox.where('entiteId').equals(id).toArray();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.entite).toBe('attachment_meta');
    }
  });

  it('un contenu vide n’est pas une note — refusé, rien n’est écrit', async () => {
    const avant = await base.attachments.count();
    await expect(
      creerNoteVolante({
        missionId: MISSION_ID,
        interviewId,
        createdBy: AUDITEUR_ID,
        content: '   ',
      }),
    ).rejects.toThrow();
    expect(await base.attachments.count()).toBe(avant);
  });
});

// =============================================================================
// B. Question AD HOC — 11 §4, V2.9
// =============================================================================
describe('question ad hoc (11 §4, 03 M3.1) — créée hors ligne, UUID v7 client, UNE op', () => {
  it('@critique la question locale a un UUID v7 CLIENT et est marquée `addedAdHoc`', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : attendre le serveur pour obtenir l'id de
    // `mission_questions` — l'ad hoc deviendrait impossible hors ligne, c'est-à-
    // dire là où elle sert (11 §4 : « les deux ids viennent du client »).
    expect(questionAdHocId).toMatch(UUID_V7);
    const question = await depotQuestions.parId(questionAdHocId);
    expect(question?.addedAdHoc).toBe(true);
    expect(question?.answerType).toBe('free_text');
    expect(question?.texteSnapshot).toBe('Quel outil sert à suivre les relances ?');
    expect(question?.questionId).toMatch(UUID_V7);
    expect(question?.questionId).not.toBe(questionAdHocId);
  });

  it('@critique elle entre dans l’outbox comme UNE op `question_adhoc` — pas deux, pas zéro', async () => {
    const ops = await base.outbox.where('entiteId').equals(questionAdHocId).toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.entite).toBe('question_adhoc');
    expect(ops[0]?.action).toBe('upsert');
    const charge = await coffre.dechiffrer(
      requis(ops[0], 'op').charge,
      z.looseObject({ texteSnapshot: z.string(), answerType: z.string(), position: z.number() }),
    );
    expect(charge.texteSnapshot).toBe('Quel outil sert à suivre les relances ?');
    expect(charge.answerType).toBe('free_text');
  });

  it('elle apparaît dans le parcours, APRÈS la question courante — jamais avant', async () => {
    // Où exactement (juste après, ou en fin de bloc) dépend de la sémantique de
    // `position` (04 : entier ; le terrain ne renumérote pas les questions
    // siège, 05 §9.4). Doute tracé pour `DECISIONS.md` ; ce test ne garde que
    // ce que le pack garantit : elle est visible, et pas avant son point d'ajout.
    const parcours = await depotQuestions.parMission(MISSION_ID);
    const ids = parcours.map((q) => q.id);
    const rangCourante = ids.indexOf(Q_PARCOURS_1);
    const rangAdHoc = ids.indexOf(questionAdHocId);
    expect(rangAdHoc).toBeGreaterThan(rangCourante);
    expect(rangAdHoc).toBeGreaterThan(-1);
  });

  it('elle est cherchable hors ligne comme une question figée (index `motsCles`)', async () => {
    const resultats = await depotQuestions.rechercher('relances', MISSION_ID);
    expect(resultats.map((r) => r.question.id)).toContain(questionAdHocId);
  });

  it('elle se répond comme n’importe quelle question — même unicité, même chiffrement', async () => {
    const relue = await depotReponses.parQuestion(interviewId, questionAdHocId);
    expect(relue?.value).toEqual({ type: 'free_text', v: SENTINELLES.reponseAdHoc });
    expect(relue?.questionTextSnapshot).toBe('Quel outil sert à suivre les relances ?');
  });

  it('un texte vide n’est pas une question — refusé', async () => {
    await expect(
      ajouterQuestionAdHoc({
        missionId: MISSION_ID,
        texte: '',
        guidance: null,
        answerType: 'yes_no',
        blockCode: 'bloc_fictif',
        apresPosition: 1,
      }),
    ).rejects.toThrow();
  });
});

// =============================================================================
// C. HORS-PARCOURS — 03 §25.4
// =============================================================================
describe('question hors parcours (03 §25.4) — recherche locale, réponse sur la session courante', () => {
  it('@critique la réponse porte `horsParcours = 1` dans l’index et vit sur la session COURANTE', async () => {
    // IMPLÉMENTATION FAUSSE ATTRAPÉE : `horsParcours` laissé à 0 « parce que la
    // question existe dans le questionnaire » — le badge M5.1 disparaît et le
    // siège ne sait plus que cette réponse a été prise hors du fil.
    const relue = await depotReponses.parQuestion(interviewId, Q_LOINTAINE);
    expect(relue?.horsParcours).toBe(1);
    expect(relue?.interviewId).toBe(interviewId);
    expect(relue?.value).toEqual({ type: 'free_text', v: SENTINELLES.valeurHorsParcours });
    const brute = (await base.answers.get(requis(relue, 'réponse').id)) as unknown as Record<
      string,
      unknown
    >;
    expect(brute.horsParcours).toBe(1);
  });

  it('le hors-parcours se compte localement (note §3.5) et se retrouve par index', async () => {
    expect((await depotReponses.avancement(interviewId)).horsParcours).toBe(1);
    const parIndex = await base.answers.where('horsParcours').equals(1).toArray();
    expect(parIndex.map((l) => l.interviewId)).toContain(interviewId);
  });

  it('la recherche qui y mène est LOCALE et tolère les accents perdus au clavier', async () => {
    const sansAccents = await depotQuestions.rechercher('donnees', MISSION_ID);
    expect(sansAccents.map((r) => r.question.id)).toContain(Q_LOINTAINE);
  });

  it('le drapeau est indépendant des autres : à-revoir sur un hors-parcours ne l’efface pas', async () => {
    const lointaine = await depotQuestions.parId(Q_LOINTAINE);
    await enregistrerReponse({
      missionId: MISSION_ID,
      interviewId,
      question: requis(lointaine, 'question lointaine'),
      saisie: { aRevoir: { motif: null } },
    });
    const relue = await depotReponses.parQuestion(interviewId, Q_LOINTAINE);
    expect(relue?.horsParcours).toBe(1);
    expect(relue?.flagReview).toBe(1);
  });
});

// =============================================================================
// D. ÉTANCHÉITÉ — après le scénario complet, rien de personnel en clair
// =============================================================================
describe('étanchéité de l’index après un scénario L5b complet (note §3.2, 06 §10.5)', () => {
  it('le scénario a rempli les tables que le balayage inspecte', () => {
    expect(vidage.interviews?.length).toBeGreaterThanOrEqual(1);
    expect(vidage.answers?.length).toBeGreaterThanOrEqual(3);
    expect(vidage.attachments?.length).toBeGreaterThanOrEqual(2);
    expect(vidage.missionQuestions?.length).toBeGreaterThanOrEqual(4);
    expect(vidage.outbox?.length).toBeGreaterThanOrEqual(7);
  });

  it.each(Object.entries(SENTINELLES))(
    '@critique la sentinelle « %s » n’apparaît dans AUCUNE table locale, sous aucune forme',
    (_libelle, sentinelle) => {
      // IMPLÉMENTATION FAUSSE ATTRAPÉE : un `content` de note volante en index
      // « pour la liste des notes à rattacher » ; un `reviewReason` en clair ;
      // un `generalNotes` recopié dans la ligne « pour la synthèse ». Chacun
      // est une phrase sur un salarié du client, lisible sur une tablette volée.
      for (const [nomTable, lignes] of Object.entries(vidage)) {
        for (const ligne of lignes) {
          const texte = serialiserProfond(ligne).toUpperCase();
          expect(
            texte,
            `sentinelle en clair dans « ${nomTable} » : ${texte.slice(0, 200)}`,
          ).not.toContain(sentinelle.toUpperCase());
        }
      }
    },
  );

  it('le texte d’une question AD HOC, lui, EST en clair — contenu siège, cherchable hors ligne', () => {
    // L'exception nommée par la note §3.2 : `*_snapshot` n'est pas personnel.
    const ligne = vidage.missionQuestions?.find((l) => l.id === questionAdHocId);
    expect(ligne?.texteSnapshot).toBe('Quel outil sert à suivre les relances ?');
    expect(ligne?.motsCles).toContain('relances');
  });
});
