// =============================================================================
// TESTS DE L'ABSORPTION PERDUE — lot L6, incrément L6c-3 « le terrain » (V3).
// ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) depuis DECISIONS.md
// [L6b] « Re-revue A29 acceptée ; reportés en L6c : reprise d'une absorption
// perdue si le coffre lève à la sortie `superseded` » et `sync/moteur.ts`.
//
// Le trou : à la sortie `superseded`, les ids des réponses arbitrées
// (`compteurs.reponsesArbitrees`) n'existent qu'en mémoire alors que leurs ops
// sont DÉJÀ retirées de la file. Si `remapperALaSortie` lève (coffre verrouillé
// en plein passage), l'absorption est perdue : la pièce et la session liée
// désignent pour toujours un UUID que le siège ne connaît pas (invariants 1, 7).
//
// ── CONTRAT ATTENDU DE `sync/moteur.ts` (pour A25) ──────────────────────────
//   · clé `meta` `sortie:a-remapper:<missionId>` = TABLEAU d'ids de réponses
//     (sans doublon) ; fusionné avec ce qui y est déjà ;
//   · écrite dans la MÊME transaction Dexie que la suppression des ops
//     acquittées `superseded` (atomique : pas de clé sans suppression, pas de
//     suppression sans clé) ;
//   · AU DÉBUT de chaque passage de la mission, si la clé existe et n'est pas
//     vide : `remapperALaSortie({base, coffre}, missionId, ids)` est rejoué
//     AVANT tout envoi ; la clé est effacée (supprimée ou vide) APRÈS réussite
//     seulement ; si le rejeu lève, la clé reste ;
//   · rejouer est idempotent : un second rejeu ne duplique ni ne réécrit rien.
//
// Rouge attendu aujourd'hui : la clé n'est jamais écrite, rien n'est rejoué.
// Traçabilité : E9 ; invariants 1 et 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LotPush, ReponsePull, ReponsePush } from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta, lireMeta, type LigneOutbox } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import { reinitialiserHorloge } from '../local/horloge.js';
import { creerDescente } from './descente.js';
import { creerMoteurSync } from './moteur.js';
import { operationDeLigne } from './montee.js';
import { remapperALaSortie } from './remappage.js';
import type { ResultatTransport } from './transport.js';

vi.mock('./remappage.js', async (importOriginal) => {
  const original = await importOriginal<{ remapperALaSortie: typeof remapperALaSortie }>();
  return { ...original, remapperALaSortie: vi.fn(original.remapperALaSortie) };
});

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000f2de';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const SESSION = '0191e2a0-0000-7000-8000-00000000a001';
const QUESTION = '0191e2a0-0000-7000-8000-00000000b001';
const QUESTION_2 = '0191e2a0-0000-7000-8000-00000000b002';

const T0 = '2026-10-09T08:00:00.000Z';
const T1 = '2026-10-09T08:10:00.000Z';
const SERVEUR = '2026-10-09T09:00:00.000Z';

const CLE_A = `sortie:a-remapper:${MISSION_A}`;
const CLE_B = `sortie:a-remapper:${MISSION_B}`;

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;
let vraiRemappage: typeof remapperALaSortie;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(113));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  vraiRemappage = (
    await vi.importActual<{ remapperALaSortie: typeof remapperALaSortie }>('./remappage.js')
  ).remapperALaSortie;
});

beforeEach(async () => {
  reinitialiserHorloge();
  nomBase = `axion-test-absorption-l6c3-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
  vi.mocked(remapperALaSortie).mockReset();
  vi.mocked(remapperALaSortie).mockImplementation(vraiRemappage);
});

afterEach(async () => {
  reinitialiserHorloge();
  base.close();
  await Dexie.delete(nomBase);
});

// ─────────────────────────────────────────────────────────────────────────────
// Banc
// ─────────────────────────────────────────────────────────────────────────────
function reponseServeur(id: string) {
  return {
    id,
    interviewId: SESSION,
    missionQuestionId: QUESTION,
    value: { type: 'number', v: 4 },
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
    revision: 3,
    clientCreatedAt: T0,
    clientUpdatedAt: T1,
    updatedAt: T1,
  };
}

async function ecrireReponse(id: string, question: string = QUESTION): Promise<void> {
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: MISSION_A,
    action: 'upsert',
    index: {
      interviewId: SESSION,
      missionQuestionId: question,
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

async function opDe(entiteId: string): Promise<LigneOutbox | undefined> {
  return (await base.outbox.toArray()).find((op) => op.entiteId === entiteId);
}

async function opRequise(entiteId: string): Promise<LigneOutbox> {
  const op = await opDe(entiteId);
  if (op === undefined) throw new Error(`banc : aucune op pour ${entiteId}`);
  return op;
}

async function visiblesAuCouple(question: string = QUESTION): Promise<string[]> {
  return (await base.answers.toArray())
    .filter(
      (r) => r.interviewId === SESSION && r.missionQuestionId === question && r.supprimeLe === null,
    )
    .map((r) => r.id)
    .sort();
}

async function reponseVisee(piece: string): Promise<string> {
  const op = await opRequise(piece);
  return ((await operationDeLigne(op, coffre)).payload as { answerId: string }).answerId;
}

/** Les ids en attente de remappage, tels que la clé `meta` les porte. */
async function enAttenteDeRemappage(cle: string = CLE_A): Promise<string[]> {
  const valeur = await lireMeta(base, cle);
  if (valeur === undefined || valeur === null) return [];
  if (!Array.isArray(valeur)) throw new Error(`la clé ${cle} doit porter un tableau d'ids`);
  return valeur.map(String);
}

interface Scene {
  readonly x: string;
  readonly y: string;
  readonly piece: string;
  readonly opX: string;
}

/** X saisie ici, Y descendue du siège AVANT le verdict ; la pièce de X est « à examiner ». */
async function preparerAbsorption(): Promise<Scene> {
  const x = uuidv7();
  const y = uuidv7();
  const piece = uuidv7();
  await ecrireReponse(x);
  await ecrirePiece(piece, x);
  const file = [{ type: 'ok' as const, donnees: pageDe(reponseServeur(y)) }];
  await creerDescente({
    base,
    coffre,
    transport: {
      tirer: vi.fn((): Promise<ResultatTransport<ReponsePull>> => {
        const suivante = file.shift();
        return Promise.resolve(
          suivante ?? {
            type: 'ok',
            donnees: { serverTime: SERVEUR, changes: {}, nextSince: null },
          },
        );
      }),
    },
  }).tirer(MISSION_A);
  const opPiece = await opRequise(piece);
  await base.outbox.update(opPiece.opId, { statut: 'a_examiner', tentatives: 10 });
  return { x, y, piece, opX: (await opRequise(x)).opId };
}

function pageDe(reponse: Record<string, unknown>): ReponsePull {
  return {
    serverTime: SERVEUR,
    changes: { answer: [reponse] },
    nextSince: T1,
  };
}

/** Un siège qui répond `superseded` pour `opX` et `applied` pour le reste. */
function siege(opX: string, ordre: string[] = []) {
  return {
    pousser: vi.fn((lot: LotPush): Promise<ResultatTransport<ReponsePush>> => {
      ordre.push('pousser');
      return Promise.resolve({
        type: 'ok',
        donnees: {
          serverTime: SERVEUR,
          results: lot.operations.map((op) => ({
            opId: op.opId,
            result: op.opId === opX ? ('superseded' as const) : ('applied' as const),
          })),
        },
      });
    }),
  };
}

/** Enregistre l'ordre des appels au remappage, ids compris. */
function espionnerOrdre(ordre: string[]): void {
  vi.mocked(remapperALaSortie).mockImplementation((deps, mission, ids) => {
    ordre.push(`remapper:${[...ids].sort().join('+')}`);
    return vraiRemappage(deps, mission, ids);
  });
}

async function passageEnEchec(moteur: { pousser: (m: string) => Promise<unknown> }): Promise<void> {
  await moteur.pousser(MISSION_A).catch(() => undefined);
}

async function instantane() {
  return {
    reponses: (await base.answers.toArray()).map((r) => [r.id, r.supprimeLe]).sort(),
    pieces: (await base.attachments.toArray()).map((p) => [p.id, p.answerId]).sort(),
    file: (await base.outbox.toArray()).map((o) => [o.opId, o.statut, o.tentatives]).sort(),
  };
}

// =============================================================================
// 1. LES IDS SURVIVENT À LA PANNE
// =============================================================================
describe('V3 — les ids arbitrés sont persistés avec la suppression des ops', () => {
  it('@critique le remappage lève à la sortie `superseded` : l’op est sortie ET les ids sont dans `meta`, rien n’est perdu', async () => {
    const { x, y, piece, opX } = await preparerAbsorption();
    vi.mocked(remapperALaSortie).mockRejectedValueOnce(new Error('coffre verrouillé (fictif)'));

    await passageEnEchec(creerMoteurSync({ base, coffre, transport: siege(opX) }));

    expect(await opDe(x), 'l’op acquittée est sortie de la file').toBeUndefined();
    expect(await enAttenteDeRemappage(), 'la clé porte X, le fait survit au crash').toEqual([x]);
    // Rien n'a été remappé à moitié, rien n'a été effacé : tout est rejouable.
    expect(await visiblesAuCouple()).toEqual([x, y].sort());
    expect(await reponseVisee(piece)).toBe(x);
    expect((await opRequise(piece)).statut).toBe('a_examiner');
  });

  it('@critique atomicité : si l’écriture de la clé échoue, l’op acquittée n’est PAS retirée (même transaction)', async () => {
    const { x, opX } = await preparerAbsorption();
    const garde = (_cle: unknown, ligne: { cle: string }): void => {
      if (ligne.cle.startsWith('sortie:a-remapper:')) throw new Error('panne injectée (fictif)');
    };
    base.meta.hook('creating', garde);
    try {
      await passageEnEchec(creerMoteurSync({ base, coffre, transport: siege(opX) }));
    } finally {
      base.meta.hook('creating').unsubscribe(garde);
    }
    expect((await opDe(x))?.opId, 'l’op reste en file : jamais de suppression sans clé').toBe(opX);
    expect(await enAttenteDeRemappage()).toEqual([]);
  });

  it('les ids déjà en attente sont FUSIONNÉS avec les nouveaux, sans doublon', async () => {
    const { x, opX } = await preparerAbsorption();
    const ancien = uuidv7();
    await ecrireMeta(base, CLE_A, [ancien]);
    vi.mocked(remapperALaSortie).mockRejectedValueOnce(new Error('coffre verrouillé (fictif)'));

    await passageEnEchec(creerMoteurSync({ base, coffre, transport: siege(opX) }));

    expect((await enAttenteDeRemappage()).sort()).toEqual([ancien, x].sort());
  });
});

// =============================================================================
// 2. LE REJEU AU PASSAGE SUIVANT
// =============================================================================
describe('V3 — le remappage est rejoué au début du passage suivant', () => {
  it('@critique rejeu AVANT tout envoi, puis clé effacée : X absorbée par Y, pièce remappée, aucune perte', async () => {
    const { x, y, piece, opX } = await preparerAbsorption();
    vi.mocked(remapperALaSortie).mockRejectedValueOnce(new Error('coffre verrouillé (fictif)'));
    await passageEnEchec(creerMoteurSync({ base, coffre, transport: siege(opX) }));

    // Passage suivant : une nouvelle saisie attend, pour que le moteur ENVOIE quelque chose.
    const autre = uuidv7();
    await ecrireReponse(autre, QUESTION_2);
    const ordre: string[] = [];
    espionnerOrdre(ordre);
    await creerMoteurSync({ base, coffre, transport: siege(opX, ordre) }).pousser(MISSION_A);

    const rejeu = ordre.findIndex((e) => e === `remapper:${x}`);
    const envoi = ordre.indexOf('pousser');
    expect(
      rejeu,
      `le rejeu avec X doit avoir lieu : ${JSON.stringify(ordre)}`,
    ).toBeGreaterThanOrEqual(0);
    expect(envoi).toBeGreaterThanOrEqual(0);
    expect(rejeu, 'rejeu AVANT le premier envoi').toBeLessThan(envoi);

    expect(await enAttenteDeRemappage(), 'clé effacée après réussite').toEqual([]);
    expect(await visiblesAuCouple()).toEqual([y]);
    const ligneX = await base.answers.get(x);
    expect(ligneX, 'X n’est jamais supprimée (invariant 7)').toBeDefined();
    expect(ligneX?.supprimeLe).not.toBeNull();
    expect((await base.attachments.get(piece))?.answerId).toBe(y);
    expect(await reponseVisee(piece)).toBe(y);
    const opPiece = await opRequise(piece);
    expect(opPiece.statut).toBe('en_attente');
    expect(opPiece.tentatives).toBe(0);
    expect(await visiblesAuCouple(QUESTION_2), 'la saisie neuve est intacte').toEqual([autre]);
  });

  it('le rejeu lève encore : la clé RESTE ; elle ne s’efface qu’au passage qui réussit', async () => {
    const { x, y, piece, opX } = await preparerAbsorption();
    vi.mocked(remapperALaSortie).mockRejectedValue(new Error('coffre verrouillé (fictif)'));
    const moteur = creerMoteurSync({ base, coffre, transport: siege(opX) });
    await passageEnEchec(moteur);
    await passageEnEchec(moteur);
    expect(await enAttenteDeRemappage(), 'deux pannes de suite : toujours en attente').toEqual([x]);
    expect(await reponseVisee(piece)).toBe(x);

    vi.mocked(remapperALaSortie).mockImplementation(vraiRemappage);
    await moteur.pousser(MISSION_A);
    expect(await enAttenteDeRemappage()).toEqual([]);
    expect(await visiblesAuCouple()).toEqual([y]);
    expect(await reponseVisee(piece)).toBe(y);
  });

  it('@critique idempotence : relancer après réussite ne change RIEN (ni doublon, ni réécriture, ni nouveau rejeu)', async () => {
    const { x, opX } = await preparerAbsorption();
    vi.mocked(remapperALaSortie).mockRejectedValueOnce(new Error('coffre verrouillé (fictif)'));
    const moteur = creerMoteurSync({ base, coffre, transport: siege(opX) });
    await passageEnEchec(moteur);
    await moteur.pousser(MISSION_A);
    // L'op de la pièce relancée par le rejeu part au passage suivant : on le laisse se vider.
    await moteur.pousser(MISSION_A);
    const apres = await instantane();

    const ordre: string[] = [];
    espionnerOrdre(ordre);
    await moteur.pousser(MISSION_A);
    await moteur.pousser(MISSION_A);

    expect(await instantane()).toEqual(apres);
    expect(
      ordre.some((e) => e === `remapper:${x}`),
      'plus aucun rejeu avec X',
    ).toBe(false);
    expect(await enAttenteDeRemappage()).toEqual([]);
  });

  it('une panne locale pendant le rejeu ne touche pas la file : la pièce « à examiner » reste intacte', async () => {
    const { x, piece, opX } = await preparerAbsorption();
    vi.mocked(remapperALaSortie).mockRejectedValue(new Error('coffre verrouillé (fictif)'));
    const moteur = creerMoteurSync({ base, coffre, transport: siege(opX) });
    await passageEnEchec(moteur);
    const opPiece = await opRequise(piece);
    expect(opPiece.statut).toBe('a_examiner');
    expect(opPiece.tentatives).toBe(10);
    expect(await enAttenteDeRemappage()).toEqual([x]);
  });

  it('les clés sont PAR MISSION : le passage de A ne rejoue ni n’efface les ids de B', async () => {
    const idB = uuidv7();
    await ecrireMeta(base, CLE_B, [idB]);
    const ordre: string[] = [];
    espionnerOrdre(ordre);
    await ecrireReponse(uuidv7(), QUESTION_2);
    await creerMoteurSync({ base, coffre, transport: siege('aucune-op', ordre) }).pousser(
      MISSION_A,
    );

    expect(await enAttenteDeRemappage(CLE_B)).toEqual([idB]);
    expect(ordre.some((e) => e.includes(idB))).toBe(false);
  });
});
