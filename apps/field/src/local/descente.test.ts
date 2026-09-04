// =============================================================================
// TESTS DE LA DESCENTE — ce qu'elle CONSERVE (invariant 7) — lot L5, incrément L5a.
//
// Écrits par A26 depuis 05 §9.4 (« last-write-wins par LIGNE sur
// client_updated_at »), 11 §4 (« une op locale plus récente n'est jamais
// écrasée »), 05 §9.2 (le `serverTime` règle l'horloge) et le JSDoc public de
// `appliquerDescente` : « 1. une ligne qui a une op EN ATTENTE dans l'outbox
// n'est jamais écrasée ; 2. à défaut, `clientUpdatedAt` arbitre ; ce qui est
// conservé n'est pas passé sous silence : le compte est écrit dans `meta` ».
//
// Complète `ecriture.test.ts` (atomicité, aucune op fabriquée), qui reste tel
// qu'il a été écrit AVANT le code.
//
// Traçabilité : E7 (remontée continue — le travail non synchronisé de
// l'auditeur passe avant tout) · E9 (multi-consultants, sync sans conflit — LWW
// par ligne).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BaseLocale, CLES_META, cleCurseurPull, lireMeta } from './base.js';
import {
  creerDekEnveloppee,
  deriverKek,
  ouvrirCoffre,
  type Coffre,
  type Enveloppe,
} from './coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './contexte.js';
import { appliquerDescente, ecrireLocal, type LotDescendant } from './ecriture.js';
import { decalageActuelMs, maintenant, reinitialiserHorloge } from './horloge.js';

const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const INTERVIEW_ID = '0191e2a0-0000-7000-8000-00000000a001';
const QUESTION_ID = '0191e2a0-0000-7000-8000-00000000b001';
const APPAREIL_MS = Date.parse('2026-09-02T08:00:00.000Z');

let kek: CryptoKey;
let dekEnveloppee: Enveloppe;
let coffre: Coffre;
const bases: BaseLocale[] = [];
let compteur = 0;

function chargeReponse(v: string) {
  return {
    value: { type: 'free_text' as const, v },
    note: null,
    reviewReason: null,
    naReason: null,
    withheldReason: null,
    source: 'entretien' as const,
    questionTextSnapshot: 'Question fictive',
    revision: 1,
    clientCreatedAt: '2026-09-02T07:00:00.000Z',
  };
}

function lot(
  id: string,
  v: string,
  clientUpdatedAt: string,
  prochainSince = '2026-09-02T09:00:00.000Z',
): LotDescendant {
  return {
    missionId: MISSION_ID,
    serverTime: '2026-09-02T09:00:00.000Z',
    prochainSince,
    enregistrements: [
      {
        table: 'answers',
        index: {
          id,
          missionId: MISSION_ID,
          interviewId: INTERVIEW_ID,
          missionQuestionId: QUESTION_ID,
          flagReview: 0,
          notApplicable: 0,
          withheld: 0,
          horsParcours: 0,
          clientUpdatedAt,
          supprimeLe: null,
        },
        charge: chargeReponse(v),
      },
    ],
  };
}

async function valeurLocale(base: BaseLocale, id: string): Promise<string | undefined> {
  const ligne = await base.answers.get(id);
  if (!ligne) return undefined;
  const clair = await coffre.dechiffrer(
    ligne.charge,
    z.looseObject({ value: z.looseObject({ v: z.string() }) }),
  );
  return clair.value.v;
}

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-descente-${String(compteur)}`);
  await base.open();
  bases.push(base);
  coffre = await ouvrirCoffre(kek, dekEnveloppee);
  installerContexteLocal({ base, coffre });
  return base;
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(17));
  dekEnveloppee = await creerDekEnveloppee(kek);
}, 20_000);

afterEach(async () => {
  retirerContexteLocal();
  reinitialiserHorloge();
  vi.useRealTimers();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('appliquerDescente — conservation du travail local (invariant 7, 05 §9.4)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un pull qui « rafraîchit » toutes les
  // lignes reçues. La réponse saisie il y a une minute et pas encore poussée
  // serait remplacée par la version serveur d'hier — et son op partirait
  // ensuite… avec une ligne locale qui ne lui correspond plus.
  it('@critique une ligne qui a une op EN ATTENTE n’est jamais écrasée, même par une descente plus récente', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    await ecrireLocal({
      entite: 'answer',
      id,
      missionId: MISSION_ID,
      action: 'upsert',
      index: {
        interviewId: INTERVIEW_ID,
        missionQuestionId: QUESTION_ID,
        flagReview: 0,
        notApplicable: 0,
        withheld: 0,
        horsParcours: 0,
      },
      charge: chargeReponse('saisie locale'),
    });

    await appliquerDescente(lot(id, 'version serveur', '2099-01-01T00:00:00.000Z'));

    expect(await valeurLocale(base, id)).toBe('saisie locale');
    expect(await lireMeta(base, `${CLES_META.prefixeDescenteConservee}${MISSION_ID}`)).toBe(1);
  });

  it('@critique sans op en attente, une descente PLUS ANCIENNE que la ligne locale ne l’écrase pas (LWW par ligne)', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    await appliquerDescente(lot(id, 'récente', '2026-09-02T08:30:00.000Z'));
    await appliquerDescente(lot(id, 'ancienne', '2026-09-02T08:00:00.000Z'));
    expect(await valeurLocale(base, id)).toBe('récente');
    expect(await lireMeta(base, `${CLES_META.prefixeDescenteConservee}${MISSION_ID}`)).toBe(1);
  });

  it('sans op en attente, une descente PLUS RÉCENTE remplace la ligne locale', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    await appliquerDescente(lot(id, 'ancienne', '2026-09-02T08:00:00.000Z'));
    await appliquerDescente(lot(id, 'récente', '2026-09-02T08:30:00.000Z'));
    expect(await valeurLocale(base, id)).toBe('récente');
    expect((await lireMeta(base, `${CLES_META.prefixeDescenteConservee}${MISSION_ID}`)) ?? 0).toBe(
      0,
    );
  });

  it('une ligne locale dont l’op est SORTIE de la file (acceptée par le serveur) redevient écrasable par une descente plus récente', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    await ecrireLocal({
      entite: 'answer',
      id,
      missionId: MISSION_ID,
      action: 'upsert',
      index: {
        interviewId: INTERVIEW_ID,
        missionQuestionId: QUESTION_ID,
        flagReview: 0,
        notApplicable: 0,
        withheld: 0,
        horsParcours: 0,
      },
      charge: chargeReponse('saisie locale'),
    });
    // Le moteur L6 sortira l'op de la file ; on simule ce qu'il fera.
    await base.outbox.clear();

    await appliquerDescente(lot(id, 'version serveur', '2099-01-01T00:00:00.000Z'));
    expect(await valeurLocale(base, id)).toBe('version serveur');
  });

  it('@critique une ligne dont l’op est en ÉCHEC (rejetee, a_examiner) n’est JAMAIS écrasée par une descente — et elle est comptée', async () => {
    // Décision A01 du 2026-09-02 (« Une ligne dont l'op est en ÉCHEC n'est jamais
    // écrasée par une descente », invariant 7) : ces statuts existent pour que rien
    // ne sorte de la file sans réponse serveur. Ce cas attrape le
    // `.where('statut').equals('en_attente')` qu'une optimisation poserait un jour :
    // la suite resterait verte sans lui, et la saisie de l'auditeur serait perdue.
    // Écrit par A01 sur réserve N1 de la revue A29 (09 §5.6 : pas l'auteur d'ecriture.ts).
    const base = await nouvelleBase();
    for (const statut of ['rejetee', 'a_examiner'] as const) {
      const id = uuidv7();
      await ecrireLocal({
        entite: 'answer',
        id,
        missionId: MISSION_ID,
        action: 'upsert',
        index: {
          interviewId: INTERVIEW_ID,
          missionQuestionId: QUESTION_ID,
          flagReview: 0,
          notApplicable: 0,
          withheld: 0,
          horsParcours: 0,
        },
        charge: chargeReponse(`saisie ${statut}`),
      });
      // Ce que le moteur L6 fera d'une réponse serveur négative : l'op RESTE, son statut change.
      await base.outbox.where('entiteId').equals(id).modify({ statut });

      await appliquerDescente(lot(id, 'version serveur', '2099-01-01T00:00:00.000Z'));
      expect(await valeurLocale(base, id), `statut ${statut}`).toBe(`saisie ${statut}`);
      expect(
        (await lireMeta(base, `${CLES_META.prefixeDescenteConservee}${MISSION_ID}`)) ?? 0,
        `comptée (${statut})`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('le curseur `prochainSince` est écrit par mission, et `null` (fin du delta) se persiste tel quel', async () => {
    const base = await nouvelleBase();
    await appliquerDescente(
      lot(uuidv7(), 'x', '2026-09-02T08:00:00.000Z', '2026-09-02T09:42:17.000Z'),
    );
    expect(await lireMeta(base, cleCurseurPull(MISSION_ID))).toBe('2026-09-02T09:42:17.000Z');
    await appliquerDescente({
      ...lot(uuidv7(), 'y', '2026-09-02T08:00:00.000Z'),
      prochainSince: null,
    });
    expect(await lireMeta(base, cleCurseurPull(MISSION_ID))).toBeNull();
  });

  it('un lot sans enregistrement est accepté : il ne fait qu’avancer le curseur', async () => {
    const base = await nouvelleBase();
    await appliquerDescente({
      missionId: MISSION_ID,
      serverTime: '2026-09-02T09:00:00.000Z',
      prochainSince: '2026-09-02T09:00:00.000Z',
      enregistrements: [],
    });
    expect(await lireMeta(base, cleCurseurPull(MISSION_ID))).toBe('2026-09-02T09:00:00.000Z');
    expect(await base.outbox.count()).toBe(0);
  });
});

describe('appliquerDescente — le `serverTime` règle l’horloge (05 §9.2)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : ignorer `serverTime` — l'appareil déréglé
  // de +3 h (05 §9.8) continuerait d'horodater ses lignes dans le futur après
  // avoir pourtant parlé au serveur.
  it('@critique après une descente, maintenant() suit le serveur et le décalage est persisté dans `meta`', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(APPAREIL_MS);
    const base = await nouvelleBase();
    const serveur = new Date(APPAREIL_MS - 3 * 60 * 60 * 1000).toISOString();

    await appliquerDescente({ ...lot(uuidv7(), 'x', serveur), serverTime: serveur });

    expect(maintenant()).toBe(serveur);
    expect(decalageActuelMs()).toBe(-3 * 60 * 60 * 1000);
    expect(await lireMeta(base, CLES_META.decalageHorloge)).toBe(-3 * 60 * 60 * 1000);
  });
});
