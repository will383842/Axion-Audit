// =============================================================================
// TESTS DE LA DESCENTE (pull delta) — lot L6, incrément L6b. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) depuis 11 §4 (« Pull
// delta : `GET /v1/sync/pull?mission_id=&since=&limit=` → `{server_time, changes:
// {entity: [...]}, next_since}` ; le client persiste `next_since` PAR mission ;
// premier pull = mission complète »), 05 §9.2 (horloge locale + offset serveur),
// 05 §9.5, 05 §9.8 scénario 4 (horloge +3 h), `LOT_L6.md` §3ter C.2 et §6bis,
// `DECISIONS.md` [L6a] (re-revue A17 : « second UUID absorbé par la ligne
// existante : les références locales à l'UUID absorbé (pièces, réponse liée) sont
// remappées par le terrain à la descente en L6b — d'ici là elles restent “à
// examiner”, sans perte »), et `local/ecriture.ts` (`appliquerDescente`, NON
// modifié par L6b — PD6).
//
// ── API ATTENDUE (pour A25) ─────────────────────────────────────────────────
// `apps/field/src/sync/transport.ts` :
//   export const CHEMIN_PULL = '/api/v1/sync/pull';
//   TransportSync.tirer(missionId: string, since: string | null)
//     : Promise<ResultatTransport<ReponsePull>>;   // testé dans transport-pull.test.ts
// `apps/field/src/sync/descente.ts` :
//   export interface DependancesDescente {
//     readonly base: BaseLocale;
//     readonly coffre: Coffre;
//     readonly transport: Pick<TransportSync, 'tirer'>;
//   }
//   export interface BilanPull {
//     readonly statut: 'succes' | 'hors_ligne' | 'reconnexion_requise' | 'refus';
//     readonly pages: number;               // réponses `ok` reçues pendant ce passage
//     readonly enregistrementsRecus: number;
//     readonly referencesRemappees: number; // ops/lignes réalignées sur un UUID absorbé
//     readonly message: string | null;
//   }
//   export interface Descente { tirer(missionId: string): Promise<BilanPull>; }
//   export function creerDescente(deps: DependancesDescente): Descente;
//   /** Lignes serveur (camelCase, colonnes du 04) → formes locales. Fonction PURE. */
//   export function traduireChangements(
//     missionId: string, changes: ReponsePull['changes'],
//   ): EnregistrementDescendant[];
// `apps/field/src/sync/port.ts` : `DependancesPort.transport` devient
//   `Pick<TransportSync, 'pousser' | 'tirer'>` ; `synchroniserMaintenant` = montée PUIS descente.
//
// ── HYPOTHÈSES DE FORME (pack muet, option prudente — remontées en décision) ─
//   · une ligne de `changes` est la ligne SERVEUR en camelCase (11 §3), colonnes
//     du 04, booléens en booléens ; la traduction pose `missionId` (connu du
//     pull) et les drapeaux 0|1, et NE recopie PAS les colonnes serveur
//     (`syncedAt`, `createdAt`, `updatedAt`) ;
//   · `nextSince: null` = fin du delta ; le curseur persisté est le DERNIER
//     `nextSince` non nul — un null n'efface JAMAIS un curseur connu (sinon le
//     pull suivant redescendrait la mission entière) ;
//   · un `nextSince` qui n'avance pas arrête la boucle (jamais de boucle infinie).
//
// Rouge attendu tant que `descente.ts` (et `tirer`) n'existent pas — pour cette
// seule raison.
// Traçabilité : E7, E9 (multi-consultants, sync sans conflit) ; invariants 1, 7, 8.
// =============================================================================
/* eslint-disable @typescript-eslint/require-await -- faux transports et faux ports : signatures asynchrones du contrat, rien à attendre. */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LotPush, ReponsePull, ReponsePush } from '../local/contrat-sync.js';
import {
  BaseLocale,
  CLES_META,
  cleCurseurPull,
  cleDerniereSyncReussie,
  ecrireMeta,
  lireMeta,
  type LigneOutbox,
} from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { chargeInterviewSchema } from '../local/formes.js';
import { ecrireLocal } from '../local/ecriture.js';
import { decalageActuelMs, instantMs, reinitialiserHorloge } from '../local/horloge.js';
import { creerDescente, traduireChangements } from './descente.js';
import { operationDeLigne } from './montee.js';
import { creerPortSync } from './port.js';
import type { ResultatTransport } from './transport.js';

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000f2de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const SESSION = '0191e2a0-0000-7000-8000-00000000a001';
const QUESTION = '0191e2a0-0000-7000-8000-00000000b001';
const QUESTION_2 = '0191e2a0-0000-7000-8000-00000000b002';

const T0 = '2026-10-09T08:00:00.000Z';
const T1 = '2026-10-09T08:10:00.000Z';
const T2 = '2026-10-09T08:20:00.000Z';
const SERVEUR = '2026-10-09T09:00:00.000Z';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(73));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  reinitialiserHorloge();
  nomBase = `axion-test-descente-l6b-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
});

afterEach(async () => {
  vi.useRealTimers();
  reinitialiserHorloge();
  base.close();
  await Dexie.delete(nomBase);
});

// ─────────────────────────────────────────────────────────────────────────────
// Banc
// ─────────────────────────────────────────────────────────────────────────────
/** Une ligne `answers` telle que le serveur la rend (camelCase, colonnes du 04). */
function reponseServeur(
  id: string,
  surcharges: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    interviewId: SESSION,
    missionQuestionId: QUESTION,
    value: { type: 'number', v: 4 },
    source: 'entretien',
    withheld: false,
    withheldReason: null,
    horsParcours: true,
    note: 'Note fictive du siège.',
    flagReview: true,
    reviewReason: 'À confirmer (fictif).',
    notApplicable: false,
    naReason: null,
    questionTextSnapshot: 'Question fictive ?',
    revision: 3,
    clientCreatedAt: T0,
    clientUpdatedAt: T1,
    syncedAt: T1,
    createdAt: T0,
    updatedAt: T1,
    ...surcharges,
  };
}

/** Une ligne `interviews` telle que le serveur la rend. */
function sessionServeur(id: string): Record<string, unknown> {
  return {
    id,
    missionId: MISSION_A,
    orgUnitId: ORG_UNIT,
    conductedBy: AUDITEUR,
    kind: 'entretien',
    mode: 'sur_site',
    linkedReviewAnswerId: null,
    personName: 'Interlocuteur fictif',
    personRole: null,
    personServiceId: null,
    personEmail: null,
    interlocutorProfileId: null,
    participants: null,
    documentRequestId: null,
    consentGiven: true,
    consentAudio: false,
    consentedAt: null,
    informationNoticeVersion: null,
    noticeShownAt: null,
    scheduledAt: null,
    scheduledDurationMin: null,
    scheduleStatus: 'planifie',
    status: 'en_cours',
    startedAt: T0,
    endedAt: null,
    generalNotes: null,
    clientCreatedAt: T0,
    clientUpdatedAt: T1,
    syncedAt: T1,
    createdAt: T0,
    updatedAt: T1,
  };
}

function page(
  changes: ReponsePull['changes'],
  nextSince: string | null,
  serverTime: string = SERVEUR,
): ResultatTransport<ReponsePull> {
  return { type: 'ok', donnees: { serverTime, changes, nextSince } };
}

/** Un transport dont les réponses de pull sont scriptées, et qui note chaque `since`. */
function transportScripte(reponses: ResultatTransport<ReponsePull>[]) {
  const appels: { missionId: string; since: string | null }[] = [];
  const file = [...reponses];
  return {
    appels,
    transport: {
      tirer: vi.fn(
        async (
          missionId: string,
          since: string | null,
        ): Promise<ResultatTransport<ReponsePull>> => {
          appels.push({ missionId, since });
          return file.shift() ?? page({}, null);
        },
      ),
    },
  };
}

async function ecrireReponse(id: string, surcharges: { answerQuestion?: string } = {}) {
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: MISSION_A,
    action: 'upsert',
    index: {
      interviewId: SESSION,
      missionQuestionId: surcharges.answerQuestion ?? QUESTION,
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'number', v: 2 },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive ?',
      revision: 1,
      clientCreatedAt: T0,
    },
  });
}

async function ecrirePiece(id: string, answerId: string): Promise<void> {
  await ecrireLocal({
    entite: 'attachment_meta',
    id,
    missionId: MISSION_A,
    action: 'upsert',
    index: { interviewId: SESSION, answerId, kind: 'photo' },
    charge: {
      content: null,
      filename: 'photo-fictive.jpg',
      mime: 'image/jpeg',
      sizeBytes: 2048,
      storageKey: 'local/fictif',
      purgeAfter: null,
      createdBy: AUDITEUR,
      clientCreatedAt: T0,
    },
  });
}

async function ecrireSessionLiee(id: string, linkedReviewAnswerId: string): Promise<void> {
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId: MISSION_A,
    action: 'upsert',
    index: {
      orgUnitId: ORG_UNIT,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'planifie',
      scheduledAt: null,
    },
    charge: {
      conductedBy: AUDITEUR,
      mode: 'complementaire',
      personName: 'Interlocuteur fictif',
      personRole: null,
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: null,
      startedAt: T0,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: T0,
    },
  });
}

async function opDe(entiteId: string): Promise<LigneOutbox> {
  const ligne = (await base.outbox.toArray()).find((op) => op.entiteId === entiteId);
  if (ligne === undefined) throw new Error(`banc : aucune op pour ${entiteId}`);
  return ligne;
}

/** Instantané comparable de la file : rien ne doit y changer sans raison. */
async function instantaneFile() {
  return (await base.outbox.toArray()).map((op) => ({
    opId: op.opId,
    statut: op.statut,
    tentatives: op.tentatives,
    derniereErreur: op.derniereErreur,
    clientUpdatedAt: op.clientUpdatedAt,
    charge: op.charge,
  }));
}

/** Compte TOUTE écriture (création, mise à jour, suppression) hors `meta`. */
function compterEcrituresHorsMeta(): { total: () => number } {
  let total = 0;
  const compter = (): void => {
    total += 1;
  };
  for (const table of base.tables) {
    if (table.name === 'meta') continue;
    table.hook('creating', compter);
    table.hook('updating', compter);
    table.hook('deleting', compter);
  }
  return { total: () => total };
}

// =============================================================================
// 1. TRADUCTION — ligne serveur → forme locale (fonction pure)
// =============================================================================
describe('descente — traduction des lignes serveur en formes locales', () => {
  it('answer : table `answers`, drapeaux 0|1, `missionId` posé par le pull, colonnes serveur écartées', () => {
    const id = uuidv7();
    const enregistrements = traduireChangements(MISSION_A, { answer: [reponseServeur(id)] });
    expect(enregistrements).toHaveLength(1);
    const [enr] = enregistrements;
    expect(enr?.table).toBe('answers');
    expect(enr?.index).toEqual({
      id,
      missionId: MISSION_A,
      interviewId: SESSION,
      missionQuestionId: QUESTION,
      flagReview: 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 1,
      clientUpdatedAt: T1,
      supprimeLe: null,
    });
    expect(enr?.charge).toEqual({
      value: { type: 'number', v: 4 },
      note: 'Note fictive du siège.',
      reviewReason: 'À confirmer (fictif).',
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive ?',
      revision: 3,
      clientCreatedAt: T0,
    });
  });

  it('interview : table `interviews`, index local, aucune colonne serveur dans la charge', () => {
    const id = uuidv7();
    const [enr] = traduireChangements(MISSION_A, { interview: [sessionServeur(id)] });
    expect(enr?.table).toBe('interviews');
    expect(enr?.index).toMatchObject({
      id,
      missionId: MISSION_A,
      orgUnitId: ORG_UNIT,
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'planifie',
      scheduledAt: null,
      clientUpdatedAt: T1,
      supprimeLe: null,
    });
    expect(enr?.charge).toMatchObject({
      conductedBy: AUDITEUR,
      personName: 'Interlocuteur fictif',
      linkedReviewAnswerId: null,
      clientCreatedAt: T0,
    });
    for (const cle of ['syncedAt', 'createdAt', 'updatedAt', 'id', 'clientUpdatedAt']) {
      expect(Object.keys(enr?.charge ?? {})).not.toContain(cle);
    }
  });

  it('aucun changement ⇒ aucun enregistrement', () => {
    expect(traduireChangements(MISSION_A, {})).toEqual([]);
    expect(traduireChangements(MISSION_A, { answer: [] })).toEqual([]);
  });
});

// =============================================================================
// 2. CURSEUR PAR MISSION, BOUCLE TANT QUE NON NUL
// =============================================================================
describe('descente — curseur `nextSince` persisté PAR MISSION', () => {
  it('@critique premier pull sans curseur (mission complète), boucle tant que `nextSince` n’est pas nul, dernier curseur persisté', async () => {
    const r1 = uuidv7();
    const r2 = uuidv7();
    const { appels, transport } = transportScripte([
      page({ answer: [reponseServeur(r1)] }, T1),
      page({ answer: [reponseServeur(r2, { missionQuestionId: QUESTION_2 })] }, T2),
      page({}, null),
    ]);
    const bilan = await creerDescente({ base, coffre, transport }).tirer(MISSION_A);

    expect(appels).toEqual([
      { missionId: MISSION_A, since: null },
      { missionId: MISSION_A, since: T1 },
      { missionId: MISSION_A, since: T2 },
    ]);
    expect(bilan.statut).toBe('succes');
    expect(bilan.pages).toBe(3);
    expect(bilan.enregistrementsRecus).toBe(2);
    expect((await base.answers.toArray()).map((r) => r.id).sort()).toEqual([r1, r2].sort());
    // Un `null` final n'efface pas le curseur connu.
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T2);
  });

  it('le pull suivant repart du curseur persisté de SA mission ; une autre mission repart de zéro', async () => {
    await ecrireMeta(base, cleCurseurPull(MISSION_A), T1);
    const { appels, transport } = transportScripte([page({}, null), page({}, null)]);
    const descente = creerDescente({ base, coffre, transport });
    await descente.tirer(MISSION_A);
    await descente.tirer(MISSION_B);
    expect(appels).toEqual([
      { missionId: MISSION_A, since: T1 },
      { missionId: MISSION_B, since: null },
    ]);
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T1);
  });

  it('un `nextSince` qui n’avance pas arrête la boucle (jamais de boucle infinie)', async () => {
    await ecrireMeta(base, cleCurseurPull(MISSION_A), T1);
    const reponses = Array.from({ length: 50 }, () => page({}, T1));
    const { appels, transport } = transportScripte(reponses);
    await creerDescente({ base, coffre, transport }).tirer(MISSION_A);
    expect(appels.length).toBeLessThanOrEqual(2);
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T1);
  });

  it('@critique deux pulls consécutifs SANS changement serveur = ZÉRO écriture locale, curseur stable', async () => {
    const r1 = uuidv7();
    const premier = transportScripte([page({ answer: [reponseServeur(r1)] }, T1), page({}, null)]);
    await creerDescente({ base, coffre, transport: premier.transport }).tirer(MISSION_A);
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T1);
    const fileAvant = await instantaneFile();
    const lignesAvant = await base.answers.toArray();

    const ecritures = compterEcrituresHorsMeta();
    const suivants = transportScripte([page({}, null), page({}, null)]);
    const descente = creerDescente({ base, coffre, transport: suivants.transport });
    await descente.tirer(MISSION_A);
    await descente.tirer(MISSION_A);

    expect(suivants.appels.map((a) => a.since)).toEqual([T1, T1]);
    expect(ecritures.total()).toBe(0);
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T1);
    expect(await instantaneFile()).toEqual(fileAvant);
    expect(await base.answers.toArray()).toEqual(lignesAvant);
  });

  it('une descente ne fabrique AUCUNE op (la file est intacte après un pull chargé)', async () => {
    await ecrireReponse(uuidv7(), { answerQuestion: QUESTION_2 });
    const avant = await instantaneFile();
    const { transport } = transportScripte([
      page({ answer: [reponseServeur(uuidv7())], interview: [sessionServeur(SESSION)] }, T1),
    ]);
    await creerDescente({ base, coffre, transport }).tirer(MISSION_A);
    expect(await instantaneFile()).toEqual(avant);
  });
});

// =============================================================================
// 3. UNE ERREUR DE PULL NE PERD NI LE CURSEUR NI LA FILE
// =============================================================================
describe('descente — une erreur de pull ne perd ni le curseur ni la file', () => {
  for (const echec of [
    { type: 'hors_ligne' } as const,
    { type: 'reconnexion_requise', message: 'Reconnexion requise (fictif).' } as const,
    { type: 'refus', statut: 500, message: 'Le siège a refusé (fictif).' } as const,
  ]) {
    it(`@critique ${echec.type} au premier appel : curseur inchangé, file inchangée, bilan non « succès »`, async () => {
      await ecrireMeta(base, cleCurseurPull(MISSION_A), T1);
      await ecrireReponse(uuidv7());
      const avant = await instantaneFile();
      const { transport } = transportScripte([echec]);

      const bilan = await creerDescente({ base, coffre, transport }).tirer(MISSION_A);

      expect(bilan.statut).toBe(echec.type);
      expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T1);
      expect(await instantaneFile()).toEqual(avant);
    });
  }

  it('@critique coupure à la 2e page : la 1re reste appliquée et son curseur gardé ; la file n’a rien perdu ni compté', async () => {
    await ecrireReponse(uuidv7(), { answerQuestion: QUESTION_2 });
    const avant = await instantaneFile();
    const r1 = uuidv7();
    const { transport } = transportScripte([
      page({ answer: [reponseServeur(r1)] }, T1),
      { type: 'hors_ligne' },
    ]);

    const bilan = await creerDescente({ base, coffre, transport }).tirer(MISSION_A);

    expect(bilan.statut).toBe('hors_ligne');
    expect(await base.answers.get(r1)).toBeDefined();
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T1);
    expect(await instantaneFile()).toEqual(avant);
  });

  it('un transport qui LÈVE ne fuit pas : la descente rend un bilan, le curseur est intact', async () => {
    await ecrireMeta(base, cleCurseurPull(MISSION_A), T1);
    const transport = {
      tirer: vi.fn(async (): Promise<ResultatTransport<ReponsePull>> => {
        throw new TypeError('Failed to fetch');
      }),
    };
    const bilan = await creerDescente({ base, coffre, transport }).tirer(MISSION_A);
    expect(bilan.statut).toBe('hors_ligne');
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T1);
  });
});

// =============================================================================
// 4. SCÉNARIO 05 §9.8 n° 4 — horloge locale +3 h
// =============================================================================
describe('descente — scénario 4 : horloge locale +3 h (05 §9.2, PD7)', () => {
  it('@critique `serverTime` règle le décalage ; la saisie suivante est horodatée à l’heure SERVEUR, au seul port d’écriture', async () => {
    const vraiMs = Date.parse(SERVEUR);
    const troisHeures = 3 * 60 * 60 * 1000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vraiMs + troisHeures));

    const r1 = uuidv7();
    const { transport } = transportScripte([page({ answer: [reponseServeur(r1)] }, T1, SERVEUR)]);
    await creerDescente({ base, coffre, transport }).tirer(MISSION_A);

    // Le décalage est connu et persisté (≈ -3 h).
    expect(Math.abs(decalageActuelMs() + troisHeures)).toBeLessThan(1_000);
    expect(Math.abs(instantMs() - vraiMs)).toBeLessThan(1_000);
    const persiste = await lireMeta(base, CLES_META.decalageHorloge);
    expect(typeof persiste).toBe('number');
    expect(Math.abs((persiste as number) + troisHeures)).toBeLessThan(1_000);

    // La ligne descendue garde l'horodatage SERVEUR : la descente ne restampe rien.
    expect((await base.answers.get(r1))?.clientUpdatedAt).toBe(T1);

    // La saisie suivante passe par le port d'écriture, à l'heure corrigée.
    const saisie = uuidv7();
    await ecrireReponse(saisie, { answerQuestion: QUESTION_2 });
    const op = await opDe(saisie);
    expect(Math.abs(Date.parse(op.clientUpdatedAt) - vraiMs)).toBeLessThan(1_000);
    expect(
      Math.abs(Date.parse((await base.answers.get(saisie))?.clientUpdatedAt ?? '') - vraiMs),
    ).toBeLessThan(1_000);
  });

  it('un pull en échec ne touche pas au décalage connu', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(SERVEUR) + 3 * 60 * 60 * 1000));
    const { transport } = transportScripte([page({}, T1, SERVEUR)]);
    const descente = creerDescente({ base, coffre, transport });
    await descente.tirer(MISSION_A);
    const regle = decalageActuelMs();
    const panne = transportScripte([{ type: 'hors_ligne' }]);
    await creerDescente({ base, coffre, transport: panne.transport }).tirer(MISSION_A);
    expect(decalageActuelMs()).toBe(regle);
  });
});

// =============================================================================
// 5. REMAPPAGE — second UUID absorbé par la ligne existante (DECISIONS [L6a])
// =============================================================================
describe('descente — remappage d’un UUID de réponse absorbé par le siège', () => {
  /**
   * Situation : l'appareil a créé la réponse X ; le siège avait DÉJÀ une réponse Y
   * au même couple (session, question) — X a été absorbée dans Y (`superseded`,
   * l'op de X a quitté la file). La pièce P et la session liée L référencent X ;
   * leurs ops sont restées « à examiner » (le siège ne connaît pas X).
   */
  async function semerAbsorption() {
    const x = uuidv7();
    const y = uuidv7();
    const piece = uuidv7();
    const liee = uuidv7();
    await ecrireReponse(x);
    await ecrirePiece(piece, x);
    await ecrireSessionLiee(liee, x);
    // L'op de X est acquittée (`superseded`) : elle a quitté la file (moteur L6a).
    await base.outbox.delete((await opDe(x)).opId);
    // Les deux ops qui référencent X ont échoué dix fois (moteur L6a).
    for (const id of [piece, liee]) {
      await base.outbox.update((await opDe(id)).opId, {
        statut: 'a_examiner',
        tentatives: 10,
        derniereErreur: 'Le siège ne connaît pas la réponse référencée (fictif).',
      });
    }
    return { x, y, piece, liee };
  }

  it('@critique les références locales à X passent à Y (pièce, réponse liée) ; les ops repartent ; rien n’est perdu', async () => {
    const { y, piece, liee } = await semerAbsorption();
    const opIdsAvant = (await base.outbox.toArray()).map((op) => op.opId).sort();
    const { transport } = transportScripte([page({ answer: [reponseServeur(y)] }, T1)]);

    const bilan = await creerDescente({ base, coffre, transport }).tirer(MISSION_A);
    expect(bilan.referencesRemappees).toBeGreaterThanOrEqual(2);

    // Miroir local : la pièce pointe sur Y ; la session liée aussi.
    expect((await base.attachments.get(piece))?.answerId).toBe(y);
    const ligneLiee = await base.interviews.get(liee);
    if (ligneLiee === undefined) throw new Error('session liée perdue');
    const chargeLiee = await coffre.dechiffrer(ligneLiee.charge, chargeInterviewSchema);
    expect(chargeLiee.linkedReviewAnswerId).toBe(y);

    // File : aucune op supprimée ni ajoutée ; les deux repartent, compteur à zéro,
    // et leur charge MONTANTE désigne Y.
    expect((await base.outbox.toArray()).map((op) => op.opId).sort()).toEqual(opIdsAvant);
    const opPiece = await opDe(piece);
    const opLiee = await opDe(liee);
    for (const op of [opPiece, opLiee]) {
      expect(op.statut).toBe('en_attente');
      expect(op.tentatives).toBe(0);
    }
    expect(
      ((await operationDeLigne(opPiece, coffre)).payload as { answerId: string }).answerId,
    ).toBe(y);
    expect(
      ((await operationDeLigne(opLiee, coffre)).payload as { linkedReviewAnswerId: string })
        .linkedReviewAnswerId,
    ).toBe(y);
  });

  it('@critique invariant 7 : la ligne X n’est pas supprimée, elle est retirée de la vue (supprimeLe) ; une seule réponse visible au couple', async () => {
    const { x, y } = await semerAbsorption();
    const { transport } = transportScripte([page({ answer: [reponseServeur(y)] }, T1)]);
    await creerDescente({ base, coffre, transport }).tirer(MISSION_A);

    const ligneX = await base.answers.get(x);
    expect(ligneX).toBeDefined();
    expect(ligneX?.supprimeLe).not.toBeNull();
    const visibles = (await base.answers.toArray()).filter(
      (r) => r.interviewId === SESSION && r.missionQuestionId === QUESTION && r.supprimeLe === null,
    );
    expect(visibles.map((r) => r.id)).toEqual([y]);
  });

  it('X dont l’op est ENCORE en file n’est pas absorbée : aucun remappage, rien ne bouge', async () => {
    const x = uuidv7();
    const y = uuidv7();
    const piece = uuidv7();
    await ecrireReponse(x);
    await ecrirePiece(piece, x);
    const avant = await instantaneFile();
    const { transport } = transportScripte([page({ answer: [reponseServeur(y)] }, T1)]);

    const bilan = await creerDescente({ base, coffre, transport }).tirer(MISSION_A);

    expect(bilan.referencesRemappees).toBe(0);
    expect((await base.attachments.get(piece))?.answerId).toBe(x);
    expect((await base.answers.get(x))?.supprimeLe).toBeNull();
    expect(await instantaneFile()).toEqual(avant);
  });

  it('une op REJETÉE (05 §9.9) qui référence X n’est jamais relancée par le remappage', async () => {
    const { y, piece } = await semerAbsorption();
    await base.outbox.update((await opDe(piece)).opId, { statut: 'rejetee' });
    const { transport } = transportScripte([page({ answer: [reponseServeur(y)] }, T1)]);
    await creerDescente({ base, coffre, transport }).tirer(MISSION_A);
    expect((await opDe(piece)).statut).toBe('rejetee');
  });
});

// =============================================================================
// 6. LE PORT : montée PUIS descente, au même geste
// =============================================================================
describe('port — « synchroniser maintenant » = montée puis descente', () => {
  it('@critique la montée part AVANT la descente, et la descente est appelée même file vide', async () => {
    const ordre: string[] = [];
    const transport = {
      async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
        ordre.push('pousser');
        return {
          type: 'ok',
          donnees: {
            serverTime: SERVEUR,
            results: lot.operations.map((op) => ({ opId: op.opId, result: 'applied' as const })),
          },
        };
      },
      async tirer(): Promise<ResultatTransport<ReponsePull>> {
        ordre.push('tirer');
        return page({}, null);
      },
    };
    await ecrireReponse(uuidv7());
    const port = creerPortSync({ base, coffre, transport });
    await port.synchroniserMaintenant(MISSION_A);
    expect(ordre).toEqual(['pousser', 'tirer']);

    ordre.length = 0;
    await port.synchroniserMaintenant(MISSION_A);
    expect(ordre).toEqual(['tirer']);
  });

  it('montée hors ligne : pas de descente tentée, la file est intacte', async () => {
    const tirer = vi.fn(async (): Promise<ResultatTransport<ReponsePull>> => page({}, null));
    const transport = {
      async pousser(): Promise<ResultatTransport<ReponsePush>> {
        return { type: 'hors_ligne' };
      },
      tirer,
    };
    await ecrireReponse(uuidv7());
    const avant = await instantaneFile();
    const resultat = await creerPortSync({ base, coffre, transport }).synchroniserMaintenant(
      MISSION_A,
    );
    expect(resultat.statut).toBe('echec');
    expect(tirer).not.toHaveBeenCalled();
    expect(await instantaneFile()).toEqual(avant);
  });

  it('descente en échec après une montée réussie : le passage est signalé en échec, mais la clé de dernier succès (données montées) avance', async () => {
    const transport = {
      async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
        return {
          type: 'ok',
          donnees: {
            serverTime: SERVEUR,
            results: lot.operations.map((op) => ({ opId: op.opId, result: 'applied' as const })),
          },
        };
      },
      async tirer(): Promise<ResultatTransport<ReponsePull>> {
        return { type: 'hors_ligne' };
      },
    };
    await ecrireReponse(uuidv7());
    const resultat = await creerPortSync({ base, coffre, transport }).synchroniserMaintenant(
      MISSION_A,
    );
    expect(resultat.statut).toBe('echec');
    // L'invariant 8 porte sur les données MONTÉES : elles le sont.
    expect(typeof (await lireMeta(base, cleDerniereSyncReussie(MISSION_A)))).toBe('string');
  });
});
