// =============================================================================
// ÉTANCHÉITÉ DE L'INDEX LOCAL — lot L5, incrément L5a. ÉCRIT AVANT LE CODE, par
// A26, depuis `docs/conception/LOT_L5.md` §3.2 et §4 (09 §5.6).
//
// ── LA DÉCISION QUE CE FICHIER GARDE (note L5 §3.2, verbatim) ────────────────
// « chiffrement par ENREGISTREMENT avec un en-tête d'index en clair. Restent en
// clair, et la liste est fermée : id, missionId, interviewId, missionQuestionId,
// orgUnitId, kind, status, scheduleStatus, scheduledAt, flagReview,
// notApplicable, withheld, horsParcours, clientUpdatedAt, position. Tout le
// reste — personName, personEmail, value, note, generalNotes, content d'une note
// volante, participants — vit dans `charge: Enveloppe`. Règle jumelle de la
// redaction pino (11 §2) : aucune donnée personnelle ni contenu de réponse dans
// un index local. »
//
// ── MÉTHODE : DES SENTINELLES, ET UN BALAYAGE SANS LISTE ─────────────────────
// On joue un scénario complet (entretien, réponses, note volante, puis un lot
// DESCENDU du siège qui porte lui aussi des identités), chaque donnée personnelle
// portant une sentinelle impossible à produire par hasard. Puis on lit TOUTES les
// tables de la base — `base.tables`, pas une liste écrite ici qui oublierait la
// prochaine — et on cherche chaque sentinelle dans la sérialisation profonde de
// chaque ligne, tampons décodés compris. La sentinelle ne doit apparaître NULLE
// PART : ni dans une colonne d'index, ni dans le `payload` d'une op, ni dans
// `meta`. Un chiffrement correct rend cette absence certaine ; un champ oublié
// la rend impossible.
//
// Le contrôle POSITIF (§C) prouve que les sentinelles ont bien été écrites et
// se relisent par le coffre : sans lui, un port qui ignorerait `charge` serait
// vert par vacuité.
//
// ── HYPOTHÈSES D'INTERFACE — celles de `ecriture.test.ts`, plus : ────────────
//   · la colonne chiffrée d'une ligne s'appelle `charge` (note §3.2) ;
//   · une note volante est `entite: 'attachment_meta'`, `index.kind = 'note'`,
//     `charge.content` (note §1, L5b : « note volante (attachments.kind='note') »).
//
// Traçabilité : E33 (sécurité / RGPD — aucune donnée personnelle hors du
// chiffré, 06 §10.4-10.5) · E6 (hors ligne total — l'index en clair est ce qui
// rend la recherche et le cockpit possibles sans réseau).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaseLocale } from './base.js';
import {
  creerDekEnveloppee,
  deriverKek,
  ouvrirCoffre,
  type Coffre,
  type Enveloppe,
} from './coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './contexte.js';
import { appliquerDescente, ecrireLocal } from './ecriture.js';

// -----------------------------------------------------------------------------
// Sentinelles — fictives (invariant 2), uniques, absentes de tout dictionnaire
// -----------------------------------------------------------------------------
const SENTINELLES = {
  nom: 'SENTINELLE_NOM_ZQ7X4P',
  email: 'sentinelle.zq7x4p@exemple.invalid',
  notesGenerales: 'SENTINELLE_NOTES_GENERALES_HW2K9M',
  participant: 'SENTINELLE_PARTICIPANT_TR5V8N',
  valeurReponse: 'SENTINELLE_VALEUR_LP3C6D',
  noteReponse: 'SENTINELLE_NOTE_REPONSE_BX9F1S',
  noteVolante: 'SENTINELLE_NOTE_VOLANTE_GY4W7Q',
  nomDescendu: 'SENTINELLE_NOM_DESCENDU_KD8J2E',
  valeurDescendue: 'SENTINELLE_VALEUR_DESCENDUE_MN6T3R',
  titreMission: 'SENTINELLE_TITRE_MISSION_PW5R8C',
  consigneQuestion: 'SENTINELLE_CONSIGNE_QUESTION_JF2H6L',
  nomUniteDescendue: 'SENTINELLE_UNITE_DESCENDUE_CV9M3X',
  nomUniteProposee: 'SENTINELLE_UNITE_PROPOSEE_RB7Q1D',
} as const;

/**
 * La liste FERMÉE du §3.2, recopiée ici — seconde lecture indépendante de la note.
 * AMENDÉE le 2026-09-02 sur arbitrage A01 (`DECISIONS.md` 2026-09-02 « La liste
 * fermée §3.2 admet `supprimeLe` et `answerId` ») : `supprimeLe` permet de filtrer
 * les lignes supprimées SANS déchiffrer (budget A28), `answerId` est la clé
 * structurelle pièce jointe → réponse. Ni l'une ni l'autre n'est personnelle.
 * La liste RESTE fermée : toute autre colonne en clair fait rougir ce test.
 */
const COLONNES_EN_CLAIR = new Set([
  'id',
  'missionId',
  'interviewId',
  'missionQuestionId',
  'orgUnitId',
  'kind',
  'status',
  'scheduleStatus',
  'scheduledAt',
  'flagReview',
  'notApplicable',
  'withheld',
  'horsParcours',
  'clientUpdatedAt',
  'position',
  'supprimeLe', // DECISIONS.md 2026-09-02
  'answerId', // DECISIONS.md 2026-09-02
  // Revue A29 du 2026-09-02, amendement LOT_L5.md §3.2 : métadonnées de question
  // et structure de l'arbre — aucune personnelle.
  'answerType',
  'criticality',
  'parentId',
  // LOT_L5.md §3.2, phrase suivante : « Le texte figé des questions (*_snapshot)
  // n'est pas une donnée personnelle : il est indexé en clair » — `texteSnapshot`
  // et ses jetons `motsCles` (03 §25.4) en sont l'application. Ils ne figurent
  // pas dans l'énumération elle-même : à faire confirmer par A01.
  'texteSnapshot',
  'motsCles',
  'charge',
]);

const HORODATAGE = '2026-09-02T08:15:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-00000000c001';
const INTERVIEW_ID = uuidv7();
const INTERVIEW_DESCENDU_ID = '0191e2a0-0000-7000-8000-00000000a0d1';
const REPONSE_1_ID = uuidv7();
const REPONSE_2_ID = uuidv7();
const REPONSE_DESCENDUE_ID = '0191e2a0-0000-7000-8000-00000000d0d1';
const NOTE_VOLANTE_ID = uuidv7();
const UNITE_PROPOSEE_ID = uuidv7();
const QUESTION_1_ID = '0191e2a0-0000-7000-8000-00000000b001';
const QUESTION_2_ID = '0191e2a0-0000-7000-8000-00000000b002';

type Ligne = Record<string, unknown>;

function octetsEnHex(octets: Uint8Array): string {
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

/** Sérialisation profonde : objets, tableaux, tampons (hex ET utf-8 décodé). */
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

let base: BaseLocale;
let coffre: Coffre;
/** Toutes les tables, lues APRÈS le scénario : `{ nomTable: lignes }`. */
let vidage: Record<string, Ligne[]> = {};

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(11));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  base = new BaseLocale('axion-test-etancheite');
  await base.open();
  installerContexteLocal({ base, coffre });

  // ── Le scénario ────────────────────────────────────────────────────────────
  const CHARGE_INTERVIEW_VIDE = {
    conductedBy: '0191e2a0-0000-7000-8000-00000000e001',
    mode: 'sur_site' as const,
    personName: null,
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
  const CHARGE_REPONSE_VIDE = {
    value: null,
    note: null,
    reviewReason: null,
    naReason: null,
    withheldReason: null,
    source: 'entretien' as const,
    questionTextSnapshot: 'Question fictive',
    revision: 1,
    clientCreatedAt: HORODATAGE,
  };

  // 1. Un entretien : identité, e-mail, notes générales, participants.
  await ecrireLocal({
    entite: 'interview',
    id: INTERVIEW_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: ORG_UNIT_ID,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'realise',
      scheduledAt: null,
    },
    charge: {
      ...CHARGE_INTERVIEW_VIDE,
      personName: SENTINELLES.nom,
      personEmail: SENTINELLES.email,
      generalNotes: SENTINELLES.notesGenerales,
      participants: [{ nom: SENTINELLES.participant, fonction: 'fonction fictive' }],
    },
  });

  // 2. Deux réponses : une valeur texte, une note de question.
  await ecrireLocal({
    entite: 'answer',
    id: REPONSE_1_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: INTERVIEW_ID,
      missionQuestionId: QUESTION_1_ID,
      flagReview: 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: { ...CHARGE_REPONSE_VIDE, value: { type: 'free_text', v: SENTINELLES.valeurReponse } },
  });
  await ecrireLocal({
    entite: 'answer',
    id: REPONSE_2_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: INTERVIEW_ID,
      missionQuestionId: QUESTION_2_ID,
      flagReview: 0,
      notApplicable: 0,
      withheld: 1,
      horsParcours: 1,
    },
    charge: {
      ...CHARGE_REPONSE_VIDE,
      value: { type: 'number', v: 3 },
      note: SENTINELLES.noteReponse,
      withheldReason: 'confidentiel',
    },
  });

  // 3. Une note volante (`attachments.kind = 'note'`).
  await ecrireLocal({
    entite: 'attachment_meta',
    id: NOTE_VOLANTE_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: INTERVIEW_ID,
      answerId: null,
      kind: 'note',
    },
    charge: {
      content: SENTINELLES.noteVolante,
      filename: null,
      mime: null,
      sizeBytes: null,
      storageKey: null,
      purgeAfter: null,
      createdBy: '0191e2a0-0000-7000-8000-00000000e001',
      clientCreatedAt: HORODATAGE,
    },
  });

  // 4. Un lot DESCENDU du siège : les identités reçues doivent être chiffrées
  //    au repos exactement comme celles saisies sur l'appareil.
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: '2026-09-02T09:00:00.000Z',
    prochainSince: '2026-09-02T09:00:00.000Z',
    enregistrements: [
      {
        table: 'interviews',
        index: {
          id: INTERVIEW_DESCENDU_ID,
          missionId: MISSION_ID,
          orgUnitId: ORG_UNIT_ID,
          kind: 'entretien',
          status: 'termine',
          scheduleStatus: 'realise',
          scheduledAt: null,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: { ...CHARGE_INTERVIEW_VIDE, personName: SENTINELLES.nomDescendu },
      },
      {
        table: 'answers',
        index: {
          id: REPONSE_DESCENDUE_ID,
          missionId: MISSION_ID,
          interviewId: INTERVIEW_DESCENDU_ID,
          missionQuestionId: QUESTION_1_ID,
          flagReview: 0,
          notApplicable: 0,
          withheld: 0,
          horsParcours: 0,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          ...CHARGE_REPONSE_VIDE,
          value: { type: 'free_text', v: SENTINELLES.valeurDescendue },
        },
      },
      // 5. Les quatre tables SIÈGE (revue A29, R-L5a-1) : mission, question de
      //    mission, unité, affectation — chacune avec une sentinelle dans sa charge
      //    quand la forme le permet.
      {
        table: 'missions',
        index: {
          id: MISSION_ID,
          status: 'en_cours',
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          titre: SENTINELLES.titreMission,
          companyId: '0191e2a0-0000-7000-8000-00000000cc01',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'auditeur',
        },
      },
      {
        table: 'missionQuestions',
        index: {
          id: QUESTION_1_ID,
          missionId: MISSION_ID,
          position: 1,
          texteSnapshot: 'Quel est le niveau de maturité des données ?',
          motsCles: ['quel', 'niveau', 'maturite', 'donnees'],
          answerType: 'free_text',
          criticality: 'important',
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          questionId: '0191e2a0-0000-7000-8000-000000000001',
          questionVersion: 1,
          guidanceSnapshot: SENTINELLES.consigneQuestion,
          optionsSnapshot: null,
          scoringSnapshot: null,
          weightSnapshot: null,
          allowRangeSnapshot: false,
          addedAdHoc: false,
          blockCode: null,
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
          name: SENTINELLES.nomUniteDescendue,
          countryCode: 'FR',
          timezone: null,
          headcount: 12,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: HORODATAGE,
        },
      },
      {
        table: 'workAssignments',
        index: {
          id: '0191e2a0-0000-7000-8000-00000000aa01',
          missionId: MISSION_ID,
          orgUnitId: ORG_UNIT_ID,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          userId: '0191e2a0-0000-7000-8000-00000000e001',
          plannedInterviews: 4,
          plannedDays: 1.5,
          dateFrom: null,
          dateTo: null,
        },
      },
    ],
  });

  // 6. Une unité PROPOSÉE sur le terrain (03 §25.3) — la cinquième entité du
  //    contrat d'ops, écrite par le port comme les autres.
  await ecrireLocal({
    entite: 'org_unit_proposal',
    id: UNITE_PROPOSEE_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: { parentId: ORG_UNIT_ID, kind: 'equipe', status: 'proposee', position: 2 },
    charge: {
      name: SENTINELLES.nomUniteProposee,
      countryCode: null,
      timezone: null,
      headcount: null,
      serviceRefId: null,
      sectorId: null,
      inScope: true,
      proposedBy: '0191e2a0-0000-7000-8000-00000000e001',
      mergedIntoId: null,
      clientCreatedAt: HORODATAGE,
    },
  });

  // ── Le vidage : TOUTES les tables, sans liste ──────────────────────────────
  vidage = {};
  for (const table of base.tables) {
    vidage[table.name] = (await table.toArray()) as Ligne[];
  }
}, 20_000);

afterAll(async () => {
  retirerContexteLocal();
  base.close();
  await Dexie.delete('axion-test-etancheite');
});

// =============================================================================
// A. Aucune sentinelle nulle part — le test central
// =============================================================================
describe('étanchéité — aucune donnée personnelle hors du chiffré (note L5 §3.2, 06 §10.5)', () => {
  it('le scénario a produit des lignes dans plusieurs tables (le balayage ne porte pas sur le vide)', () => {
    expect(vidage.interviews).toHaveLength(2);
    expect(vidage.answers).toHaveLength(3);
    expect(vidage.attachments).toHaveLength(1);
    expect(vidage.missions).toHaveLength(1);
    expect(vidage.missionQuestions).toHaveLength(1);
    expect(vidage.orgUnits).toHaveLength(2);
    expect(vidage.workAssignments).toHaveLength(1);
    expect(vidage.outbox).toHaveLength(5);
    expect(Object.keys(vidage).length).toBeGreaterThanOrEqual(9);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un `personName` recopié en clair dans la
  // ligne « pour trier la liste des entretiens » ; une `value` mise en index
  // « pour la complétude » ; un `payload` d'op stocké en clair parce que « de
  // toute façon il part au serveur » ; une note volante dont `content` est
  // resté hors de `charge`. Chaque cas est une donnée d'un salarié du client
  // lisible sur une tablette volée. Le balayage les voit tous, sans les nommer.
  it.each(Object.entries(SENTINELLES))(
    '@critique la sentinelle « %s » n’apparaît dans AUCUNE table locale, sous aucune forme',
    (_libelle, sentinelle) => {
      for (const [nomTable, lignes] of Object.entries(vidage)) {
        for (const ligne of lignes) {
          const texte = serialiserProfond(ligne);
          expect(
            texte,
            `sentinelle en clair dans « ${nomTable} » : ${texte.slice(0, 200)}`,
          ).not.toContain(sentinelle);
        }
      }
    },
  );

  // Un index « de recherche » normalisé en minuscules ou en majuscules est le
  // contournement le plus naturel du balayage exact : on le cherche aussi.
  it('@critique aucune sentinelle n’apparaît non plus après normalisation de casse', () => {
    for (const lignes of Object.values(vidage)) {
      for (const ligne of lignes) {
        const texte = serialiserProfond(ligne).toUpperCase();
        for (const sentinelle of Object.values(SENTINELLES)) {
          expect(texte).not.toContain(sentinelle.toUpperCase());
        }
      }
    }
  });
});

// =============================================================================
// B. La liste FERMÉE — ce qui est en clair est exactement ce que la note nomme
// =============================================================================
describe('étanchéité — les colonnes en clair sont celles de la liste fermée du §3.2', () => {
  // Une sentinelle attrape un contenu ; ce test attrape une COLONNE. Un champ
  // `updatedAt` ou `syncStatus` ajouté « pour l'écran » n'est pas personnel,
  // mais il n'est pas dans la liste : le rouge ici signifie « amendez la note ou
  // le code », jamais « élargissez le test ».
  it.each([
    'missions',
    'missionQuestions',
    'orgUnits',
    'interviews',
    'answers',
    'attachments',
    'workAssignments',
  ])(
    '@critique dans « %s », toute colonne hors `charge` appartient à la liste fermée',
    (nomTable) => {
      const lignes = vidage[nomTable] ?? [];
      expect(lignes.length).toBeGreaterThan(0);
      for (const ligne of lignes) {
        const horsListe = Object.keys(ligne).filter((cle) => !COLONNES_EN_CLAIR.has(cle));
        expect(horsListe, `colonnes hors liste dans « ${nomTable} »`).toEqual([]);
      }
    },
  );

  it('l’en-tête d’index EST en clair et interrogeable (sinon ni cockpit ni recherche hors ligne)', async () => {
    const enCours = await base.table('interviews').where('status').equals('en_cours').toArray();
    expect(enCours.map((l: Ligne) => l.id)).toEqual([INTERVIEW_ID]);

    const aRevoir = await base.table('answers').where('interviewId').equals(INTERVIEW_ID).toArray();
    expect(aRevoir).toHaveLength(2);
    expect(aRevoir.filter((l: Ligne) => l.flagReview === 1).map((l: Ligne) => l.id)).toEqual([
      REPONSE_1_ID,
    ]);
  });
});

// =============================================================================
// C. Contrôle positif — les sentinelles SONT là, dans `charge`, et se relisent
// =============================================================================
describe('étanchéité — contrôle positif : la charge chiffrée contient bien les données', () => {
  function chargeDe(nomTable: string, id: string): Enveloppe {
    const ligne = (vidage[nomTable] ?? []).find((l) => l.id === id);
    if (!ligne) throw new Error(`ligne ${id} absente de « ${nomTable} »`);
    return ligne.charge as Enveloppe;
  }

  it('@critique l’entretien saisi se déchiffre avec son identité, son e-mail, ses notes et ses participants', async () => {
    const schema = z.looseObject({
      personName: z.string(),
      personEmail: z.string(),
      generalNotes: z.string(),
      participants: z.array(z.looseObject({ nom: z.string() })),
    });
    const clair = await coffre.dechiffrer(chargeDe('interviews', INTERVIEW_ID), schema);
    expect(clair.personName).toBe(SENTINELLES.nom);
    expect(clair.personEmail).toBe(SENTINELLES.email);
    expect(clair.generalNotes).toBe(SENTINELLES.notesGenerales);
    expect(clair.participants[0]?.nom).toBe(SENTINELLES.participant);
  });

  it('@critique les réponses se déchiffrent avec leur valeur et leur note', async () => {
    const schema = z.looseObject({
      value: z.looseObject({ v: z.unknown() }).nullable(),
      note: z.string().nullable(),
    });
    const r1 = await coffre.dechiffrer(chargeDe('answers', REPONSE_1_ID), schema);
    const r2 = await coffre.dechiffrer(chargeDe('answers', REPONSE_2_ID), schema);
    expect(r1.value?.v).toBe(SENTINELLES.valeurReponse);
    expect(r2.note).toBe(SENTINELLES.noteReponse);
    expect(r2.value?.v).toBe(3);
  });

  it('@critique la note volante se déchiffre avec son contenu', async () => {
    const schema = z.looseObject({ content: z.string() });
    const clair = await coffre.dechiffrer(chargeDe('attachments', NOTE_VOLANTE_ID), schema);
    expect(clair.content).toBe(SENTINELLES.noteVolante);
  });

  it('@critique les quatre tables siège et l’unité proposée se déchiffrent avec leurs sentinelles', async () => {
    const mission = await coffre.dechiffrer(
      chargeDe('missions', MISSION_ID),
      z.looseObject({ titre: z.string() }),
    );
    const question = await coffre.dechiffrer(
      chargeDe('missionQuestions', QUESTION_1_ID),
      z.looseObject({ guidanceSnapshot: z.string() }),
    );
    const unite = await coffre.dechiffrer(
      chargeDe('orgUnits', ORG_UNIT_ID),
      z.looseObject({ name: z.string() }),
    );
    const proposee = await coffre.dechiffrer(
      chargeDe('orgUnits', UNITE_PROPOSEE_ID),
      z.looseObject({ name: z.string() }),
    );
    const affectation = await coffre.dechiffrer(
      chargeDe('workAssignments', '0191e2a0-0000-7000-8000-00000000aa01'),
      z.looseObject({ plannedInterviews: z.number() }),
    );
    expect(mission.titre).toBe(SENTINELLES.titreMission);
    expect(question.guidanceSnapshot).toBe(SENTINELLES.consigneQuestion);
    expect(unite.name).toBe(SENTINELLES.nomUniteDescendue);
    expect(proposee.name).toBe(SENTINELLES.nomUniteProposee);
    expect(affectation.plannedInterviews).toBe(4);
  });

  it('@critique les lignes DESCENDUES du siège sont chiffrées au repos comme les lignes saisies', async () => {
    const entretien = await coffre.dechiffrer(
      chargeDe('interviews', INTERVIEW_DESCENDU_ID),
      z.looseObject({ personName: z.string() }),
    );
    const reponse = await coffre.dechiffrer(
      chargeDe('answers', REPONSE_DESCENDUE_ID),
      z.looseObject({ value: z.looseObject({ v: z.unknown() }) }),
    );
    expect(entretien.personName).toBe(SENTINELLES.nomDescendu);
    expect(reponse.value.v).toBe(SENTINELLES.valeurDescendue);
  });

  it('la charge de chaque op (`payload` 11 §4) est elle aussi une enveloppe que le coffre relit', async () => {
    const ops = vidage.outbox ?? [];
    expect(ops).toHaveLength(5);
    const contenus: string[] = [];
    for (const op of ops) {
      const clair = await coffre.dechiffrer(
        (op.charge ?? op.payload) as Enveloppe,
        z.looseObject({}),
      );
      contenus.push(JSON.stringify(clair));
    }
    const tout = contenus.join('\n');
    expect(tout).toContain(SENTINELLES.nom);
    expect(tout).toContain(SENTINELLES.valeurReponse);
    expect(tout).toContain(SENTINELLES.noteVolante);
  });
});
