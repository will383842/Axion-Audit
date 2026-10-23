// =============================================================================
// TESTS DE LA RESYNCHRONISATION VOLONTAIRE — lot L6, incrément L6c-3 « le
// terrain » (V1). ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) depuis 05 §9.5 (« les
// modifications siège du questionnaire n'atteignent le terrain QUE via
// “resynchroniser le questionnaire” (volontaire) ») et DECISIONS.md [L6b] :
// questions et affectations ne descendent qu'au premier pull ; le rôle sur la
// mission ne redescend qu'au premier pull ; compte d'illisibles à remettre à
// zéro. Invariants 1 (offline-first, rien ne se perd), 7 (rien d'effacé), 8.
//
// ── API ATTENDUE (pour A25) ─────────────────────────────────────────────────
// `sync/port.ts`, sur `PortSyncAffichable` :
//   resynchroniser(missionId: string): Promise<ResultatResynchronisation>;
//   export interface ResultatResynchronisation {
//     readonly statut: 'succes' | 'refusee' | 'mission_retiree' | 'echec';
//     readonly message: string;            // français, prêt à afficher
//   }
// `sync/descente.ts` :
//   export function cleMissionRetiree(missionId: string): string;
//     // clé `meta` ; valeur NON nulle (true ou ISO) = « mission retirée »
//
// Contrat figé ici :
//   1. d'abord un passage de montée COMPLET (push) ;
//   2. file de la mission non vide (en_attente, rejetee, a_examiner) OU pièces
//      non envoyées (a_envoyer, en_echec) → statut `refusee`, message « envoyez
//      d'abord… », AUCUNE descente, RIEN de modifié ;
//   3. descente depuis `since = null` : tous les `tirer` successifs partent de
//      null puis suivent `nextSince` ; le curseur final est persisté ;
//      · questions : mises à jour, JAMAIS effacées (des réponses s'y réfèrent) ;
//      · affectations : le miroir est REMPLACÉ (une absente du siège n'est plus
//        visible) ;
//      · compte d'illisibles REMPLACÉ par celui de cette descente SI elle va au
//        bout ; si elle échoue au milieu, l'ancien compte reste ;
//      · rôle sur la mission rafraîchi ;
//   4. 404 (accès retiré) : TOUTES les données locales restent, la clé
//      `cleMissionRetiree` est posée, statut `mission_retiree` ;
//   5. idempotente.
//
// Rouge attendu : `resynchroniser` n'existe pas — pour cette seule raison.
// Traçabilité : E7, E9 ; invariants 1, 7, 8.
// =============================================================================
/* eslint-disable @typescript-eslint/require-await -- faux transports : signatures asynchrones du contrat. */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LotPush, ReponsePull, ReponsePush } from '../local/contrat-sync.js';
import {
  BaseLocale,
  CLES_META,
  cleCurseurPull,
  ecrireMeta,
  lireMeta,
  type LigneOutbox,
} from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import { chargeMissionSchema } from '../local/formes.js';
import { reinitialiserHorloge } from '../local/horloge.js';
import { ecrirePieceAvecOctets } from '../local/octets.js';
import { cleLignesIllisibles, creerDescente } from './descente.js';
import { creerPortSync, type PortSyncAffichable } from './port.js';
import type { ResultatTransport } from './transport.js';

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const SESSION = '0191e2a0-0000-7000-8000-00000000a001';

const Q1 = '0191e2a0-0000-7000-8000-0000000000a1';
const Q2 = '0191e2a0-0000-7000-8000-0000000000a2';
const Q3 = '0191e2a0-0000-7000-8000-0000000000a3';
const AFF1 = '0191e2a0-0000-7000-8000-0000000000b1';
const AFF2 = '0191e2a0-0000-7000-8000-0000000000b2';
const AFF3 = '0191e2a0-0000-7000-8000-0000000000b3';

const T0 = '2026-10-09T08:00:00.000Z';
const T1 = '2026-10-09T08:10:00.000Z';
const T2 = '2026-10-09T08:20:00.000Z';
const T3 = '2026-10-09T08:30:00.000Z';
const SERVEUR = '2026-10-09T09:00:00.000Z';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(127));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  reinitialiserHorloge();
  nomBase = `axion-test-resynchro-l6c3-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
});

afterEach(async () => {
  reinitialiserHorloge();
  base.close();
  await Dexie.delete(nomBase);
});

// ─────────────────────────────────────────────────────────────────────────────
// Banc — lignes serveur
// ─────────────────────────────────────────────────────────────────────────────
function missionServeur(role: string | null, updatedAt: string = T1) {
  return {
    id: MISSION_A,
    companyId: '0191e2a0-0000-7000-8000-00000000cccc',
    title: 'Mission fictive FIL-TPE (siège)',
    timezone: 'Europe/Paris',
    auditLevel: 'standard',
    geoScope: 'france',
    countryCode: 'FR',
    startPlanned: null,
    endPlanned: null,
    status: 'en_cours',
    ...(role === null ? {} : { roleOnMission: role }),
    updatedAt,
    deletedAt: null,
  };
}

function questionServeur(id: string, texte: string, position: number) {
  return {
    id,
    questionId: uuidv7(),
    questionVersion: 1,
    textSnapshot: texte,
    optionsSnapshot: null,
    weightSnapshot: null,
    scoringSnapshot: null,
    guidanceSnapshot: null,
    answerTypeSnapshot: 'free_text',
    criticalitySnapshot: 'important',
    position,
    addedAdHoc: false,
    blockCode: null,
  };
}

function affectationServeur(id: string) {
  return {
    id,
    orgUnitId: ORG_UNIT,
    userId: AUDITEUR,
    plannedInterviews: 2,
    plannedDays: null,
    dateFrom: null,
    dateTo: null,
  };
}

function reponseServeur(id: string, question: string) {
  return {
    id,
    interviewId: SESSION,
    missionQuestionId: question,
    value: { type: 'free_text', v: 'Réponse du siège (fictive).' },
    source: 'entretien',
    withheld: false,
    withheldReason: null,
    horsParcours: false,
    note: null,
    flagReview: false,
    reviewReason: null,
    notApplicable: false,
    naReason: null,
    questionTextSnapshot: 'Question fictive ?',
    revision: 1,
    clientCreatedAt: T0,
    clientUpdatedAt: T1,
    updatedAt: T1,
  };
}

function page(
  changes: ReponsePull['changes'],
  nextSince: string | null,
): ResultatTransport<ReponsePull> {
  return {
    type: 'ok',
    donnees: { serverTime: SERVEUR, changes, nextSince },
  };
}

/**
 * `resynchroniser` n'existe pas encore : la méthode et la clé sont lues par leur nom, pour
 * que le test soit rouge pour la bonne raison (fonction absente), pas par erreur de types.
 */
interface ResultatResynchro {
  readonly statut: string;
  readonly message: string;
}
async function resynchroniser(
  transport: Parameters<typeof creerPortSync>[0]['transport'],
): Promise<ResultatResynchro> {
  const port: PortSyncAffichable = creerPortSync({ base, coffre, transport });
  return port.resynchroniser(MISSION_A);
}

async function cleRetiree(): Promise<(m: string) => string> {
  const module: Record<string, unknown> = await import('./descente.js');
  const f = module.cleMissionRetiree;
  if (typeof f !== 'function')
    throw new Error('cleMissionRetiree est absente (L6c-3 pas encore écrit)');
  return f as (m: string) => string;
}

/** Un siège scripté : le push répond `applied` à tout, le pull sert `pages` dans l'ordre. */
function siege(
  pages: ResultatTransport<ReponsePull>[],
  options: { push?: ResultatTransport<ReponsePush> } = {},
) {
  const ordre: string[] = [];
  const depuis: (string | null)[] = [];
  const file = [...pages];
  return {
    ordre,
    depuis,
    transport: {
      pousser: vi.fn(async (lot: LotPush): Promise<ResultatTransport<ReponsePush>> => {
        ordre.push('pousser');
        return (
          options.push ?? {
            type: 'ok',
            donnees: {
              serverTime: SERVEUR,
              results: lot.operations.map((op) => ({ opId: op.opId, result: 'applied' as const })),
            },
          }
        );
      }),
      tirer: vi.fn(
        async (_mission: string, since: string | null): Promise<ResultatTransport<ReponsePull>> => {
          ordre.push('tirer');
          depuis.push(since);
          return file.shift() ?? page({}, null);
        },
      ),
    },
  };
}

/** L'appareil tel qu'après son premier pull : mission, 2 questions, 2 affectations, 1 réponse. */
async function semerLocal(role = 'lecteur'): Promise<void> {
  await creerDescente({
    base,
    coffre,
    transport: siege([
      page(
        {
          mission: [missionServeur(role, T0)],
          mission_question: [
            questionServeur(Q1, 'Question un, ancien libellé ?', 1),
            questionServeur(Q2, 'Question deux ?', 2),
          ],
          work_assignment: [affectationServeur(AFF1), affectationServeur(AFF2)],
          answer: [reponseServeur(uuidv7(), Q2)],
        },
        T1,
      ),
    ]).transport,
  }).tirer(MISSION_A);
}

async function saisirEnAttente(): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: MISSION_A,
    action: 'upsert',
    index: {
      interviewId: SESSION,
      missionQuestionId: Q1,
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'free_text', v: 'Saisie locale (fictive).' },
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
  return id;
}

async function lignePiece(): Promise<void> {
  await ecrirePieceAvecOctets(
    {
      entite: 'attachment_meta',
      id: uuidv7(),
      missionId: MISSION_A,
      action: 'upsert',
      index: { interviewId: SESSION, answerId: null, kind: 'photo' },
      charge: {
        content: null,
        filename: 'photo-fictive.jpg',
        mime: 'image/jpeg',
        sizeBytes: 3,
        storageKey: 'local/fictif',
        purgeAfter: null,
        createdBy: AUDITEUR,
        clientCreatedAt: T0,
      },
    },
    new Uint8Array([1, 2, 3]),
  );
}

async function roleLocal(): Promise<string> {
  const ligne = await base.missions.get(MISSION_A);
  if (ligne === undefined) throw new Error('banc : mission locale absente');
  return (await coffre.dechiffrer(ligne.charge, chargeMissionSchema)).roleSurMission;
}

const visibles = <T extends { readonly supprimeLe: string | null }>(l: readonly T[]): T[] =>
  l.filter((r) => r.supprimeLe === null);

/** Tout ce qu'une resynchronisation refusée ou retirée ne doit pas toucher. */
async function instantane() {
  return {
    questions: (await base.missionQuestions.toArray())
      .map((q) => [q.id, q.texteSnapshot, q.supprimeLe])
      .sort(),
    affectations: (await base.workAssignments.toArray()).map((a) => [a.id, a.supprimeLe]).sort(),
    reponses: (await base.answers.toArray()).map((r) => [r.id, r.supprimeLe]).sort(),
    file: (await base.outbox.toArray()).map((o) => [o.opId, o.statut, o.tentatives]).sort(),
    curseur: await lireMeta(base, cleCurseurPull(MISSION_A)),
    illisibles: await lireMeta(base, cleLignesIllisibles(MISSION_A)),
    role: await roleLocal(),
  };
}

async function opsDeLaMission(): Promise<LigneOutbox[]> {
  return base.outbox.where('missionId').equals(MISSION_A).toArray();
}

// =============================================================================
// 1. LA MONTÉE D'ABORD
// =============================================================================
describe('resynchroniser — un passage de montée complet d’abord', () => {
  it('@critique la file part (push) AVANT la descente ; la descente repart de since = null malgré un curseur connu', async () => {
    await semerLocal();
    await saisirEnAttente();
    const s = siege([
      page({ mission_question: [questionServeur(Q3, 'Question trois ?', 3)] }, null),
    ]);

    const resultat = await resynchroniser(s.transport);

    expect(resultat.statut).toBe('succes');
    expect(s.ordre[0], 'le push précède tout pull').toBe('pousser');
    expect(s.ordre).toContain('tirer');
    expect(s.depuis[0], 'descente complète : premier pull sans curseur').toBeNull();
    expect(await opsDeLaMission(), 'la file est vidée par la montée').toHaveLength(0);
  });
});

// =============================================================================
// 2. LE REFUS « ENVOYEZ D'ABORD »
// =============================================================================
describe('resynchroniser — refus tant que la file ou les pièces ne sont pas vides', () => {
  it('@critique file non vide après la montée (siège injoignable) : refus, aucune descente, RIEN de modifié', async () => {
    await semerLocal();
    await saisirEnAttente();
    await ecrireMeta(base, cleLignesIllisibles(MISSION_A), 5);
    const avant = await instantane();
    const s = siege([page({ mission_question: [questionServeur(Q1, 'Libellé neuf ?', 1)] }, T3)], {
      push: { type: 'hors_ligne' },
    });

    const resultat = await resynchroniser(s.transport);

    expect(resultat.statut).toBe('refusee');
    expect(resultat.message).toMatch(/envoyez d.abord/i);
    expect(s.transport.tirer, 'aucune descente').not.toHaveBeenCalled();
    expect(await instantane()).toEqual(avant);
  });

  it('une op rejetée ou à examiner reste dans la file : refus aussi (rien ne vit que sur l’appareil)', async () => {
    await semerLocal();
    const id = await saisirEnAttente();
    const op = (await opsDeLaMission()).find((o) => o.entiteId === id);
    if (op === undefined) throw new Error('banc : op absente');
    await base.outbox.update(op.opId, { statut: 'a_examiner', tentatives: 10 });
    const avant = await instantane();
    const s = siege([page({}, T3)]);

    const resultat = await resynchroniser(s.transport);

    expect(resultat.statut).toBe('refusee');
    expect(s.transport.tirer).not.toHaveBeenCalled();
    expect(await instantane()).toEqual(avant);
  });

  it('@critique une pièce non envoyée (photo « à envoyer ») : refus, rien de modifié', async () => {
    await semerLocal();
    await lignePiece();
    const avant = await instantane();
    const s = siege([page({}, T3)]);

    const resultat = await resynchroniser(s.transport);

    expect(resultat.statut).toBe('refusee');
    expect(resultat.message).toMatch(/envoyez d.abord/i);
    expect(s.transport.tirer).not.toHaveBeenCalled();
    // La montée acquitte l'op de la fiche (siège `applied`) ; seule la photo reste à envoyer.
    expect(await instantane()).toEqual({ ...avant, file: [] });
    expect(await base.octetsPieces.count()).toBe(1);
  });
});

// =============================================================================
// 3. LA DESCENTE COMPLÈTE
// =============================================================================
describe('resynchroniser — la descente complète depuis since = null', () => {
  it('@critique suit les pages jusqu’au bout depuis null et persiste le curseur final', async () => {
    await semerLocal();
    const s = siege([
      page({ mission_question: [questionServeur(Q3, 'Question trois ?', 3)] }, T2),
      page({}, T3),
      page({}, null),
    ]);
    await resynchroniser(s.transport);
    expect(s.depuis).toEqual([null, T2, T3]);
    expect(await lireMeta(base, cleCurseurPull(MISSION_A))).toBe(T3);
  });

  it('@critique questions : mises à jour et ajoutées, JAMAIS effacées (une réponse s’y réfère encore)', async () => {
    await semerLocal();
    const s = siege([
      page(
        {
          mission_question: [
            questionServeur(Q1, 'Question un, libellé corrigé par le siège ?', 1),
            questionServeur(Q3, 'Question trois, ajoutée par le siège ?', 3),
          ],
        },
        null,
      ),
    ]);

    const resultat = await resynchroniser(s.transport);

    expect(resultat.statut).toBe('succes');
    const parId = new Map((await base.missionQuestions.toArray()).map((q) => [q.id, q]));
    expect(parId.get(Q1)?.texteSnapshot, 'Q1 mise à jour').toBe(
      'Question un, libellé corrigé par le siège ?',
    );
    expect(parId.get(Q3)?.texteSnapshot, 'Q3 ajoutée').toBe(
      'Question trois, ajoutée par le siège ?',
    );
    expect(parId.get(Q2), 'Q2 absente de la descente : conservée, jamais effacée').toBeDefined();
    expect(parId.get(Q2)?.supprimeLe).toBeNull();
    expect(
      (await base.answers.toArray()).some((r) => r.missionQuestionId === Q2),
      'la réponse qui référence Q2 est intacte',
    ).toBe(true);
  });

  it('@critique affectations : le miroir est REMPLACÉ (l’absente du siège n’est plus visible, la neuve l’est)', async () => {
    await semerLocal();
    const s = siege([
      page({ work_assignment: [affectationServeur(AFF1), affectationServeur(AFF3)] }, null),
    ]);
    await resynchroniser(s.transport);
    const ids = visibles(await base.workAssignments.toArray())
      .map((a) => a.id)
      .sort();
    expect(ids).toEqual([AFF1, AFF3].sort());
  });

  it('@critique rôle sur la mission rafraîchi (le siège prime, rétrogradation comprise)', async () => {
    await semerLocal('lecteur');
    expect(await roleLocal()).toBe('lecteur');
    const s = siege([page({ mission: [missionServeur('lead', T2)] }, null)]);
    await resynchroniser(s.transport);
    expect(await roleLocal()).toBe('lead');

    const s2 = siege([page({ mission: [missionServeur('analyste', T3)] }, null)]);
    await resynchroniser(s2.transport);
    expect(await roleLocal()).toBe('analyste');
  });

  it('idempotente : deux resynchronisations de suite laissent exactement le même état', async () => {
    await semerLocal();
    const lignes = {
      mission: [missionServeur('lead', T2)],
      mission_question: [
        questionServeur(Q1, 'Libellé neuf ?', 1),
        questionServeur(Q2, 'Deux ?', 2),
      ],
      work_assignment: [affectationServeur(AFF1)],
    };
    const transport = siege([page(lignes, T3), page(lignes, T3), page(lignes, T3)]).transport;
    expect((await resynchroniser(transport)).statut).toBe('succes');
    const apres = await instantane();
    expect((await resynchroniser(transport)).statut).toBe('succes');
    expect(await instantane()).toEqual(apres);
  });
});

// =============================================================================
// 4. LE COMPTE D'ILLISIBLES
// =============================================================================
describe('resynchroniser — le compte de lignes illisibles est REMPLACÉ', () => {
  const illisible = (): Record<string, unknown> => ({ id: uuidv7(), interviewId: 42 });

  it('@critique descente complète sans illisible : le compte retombe à zéro (il était 5)', async () => {
    await semerLocal();
    await ecrireMeta(base, cleLignesIllisibles(MISSION_A), 5);
    const s = siege([page({}, null)]);
    await resynchroniser(s.transport);
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_A))).toBe(0);
  });

  it('@critique remplacé (et non cumulé) par celui de cette descente : 5 devient 2', async () => {
    await semerLocal();
    await ecrireMeta(base, cleLignesIllisibles(MISSION_A), 5);
    const s = siege([page({ answer: [illisible()] }, T2), page({ answer: [illisible()] }, null)]);
    await resynchroniser(s.transport);
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_A))).toBe(2);
  });

  it('@critique descente qui échoue au milieu : l’ancien compte (5) reste', async () => {
    await semerLocal();
    await ecrireMeta(base, cleLignesIllisibles(MISSION_A), 5);
    const s = siege([page({ answer: [illisible(), illisible()] }, T2), { type: 'hors_ligne' }]);
    const resultat = await resynchroniser(s.transport);
    expect(resultat.statut).toBe('echec');
    expect(resultat.message).toMatch(/[a-zéèà]{4}/);
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_A))).toBe(5);
  });
});

// =============================================================================
// 5. L'ACCÈS RETIRÉ (404) ET LES AUTRES ÉCHECS
// =============================================================================
describe('resynchroniser — mission retirée (404) et échecs', () => {
  it('@critique 404 : TOUTES les données locales sont gardées, « mission retirée » est posé', async () => {
    const cleMissionRetiree = await cleRetiree();
    await semerLocal();
    await ecrireMeta(base, cleLignesIllisibles(MISSION_A), 3);
    const avant = await instantane();
    const s = siege([{ type: 'refus', statut: 404, message: 'Mission introuvable (fictif).' }]);

    const resultat = await resynchroniser(s.transport);

    expect(resultat.statut).toBe('mission_retiree');
    expect(resultat.message).toMatch(/retir/i);
    expect(await instantane(), 'rien n’est effacé, rien n’est modifié').toEqual(avant);
    const pose = await lireMeta(base, cleMissionRetiree(MISSION_A));
    expect(pose ?? null, 'l’état « mission retirée » est posé en base').not.toBeNull();
    expect(pose).not.toBe(false);
  });

  it('un autre refus (500) ou une coupure : échec, JAMAIS « mission retirée », compte et questions intacts', async () => {
    const cleMissionRetiree = await cleRetiree();
    await semerLocal();
    const avant = await instantane();
    for (const echec of [
      { type: 'refus' as const, statut: 500, message: 'Erreur du siège (fictif).' },
      { type: 'hors_ligne' as const },
    ]) {
      const s = siege([echec]);
      const resultat = await resynchroniser(s.transport);
      expect(resultat.statut).toBe('echec');
    }
    expect((await lireMeta(base, cleMissionRetiree(MISSION_A))) ?? null).toBeNull();
    expect(await instantane()).toEqual(avant);
  });
});
