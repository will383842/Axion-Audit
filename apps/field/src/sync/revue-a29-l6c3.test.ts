// =============================================================================
// TESTS DES RÉSERVES DE LA REVUE A29 — lot L6, incrément L6c-3 « le terrain ».
//
// Écrits par A25 (auteur) sur demande de la revue A29, dans un fichier NEUF :
// les tests du testeur (A26) ne sont pas modifiés.
//   R1 : une affectation renvoyée par le siège mais ILLISIBLE n'entre pas dans les
//        « vues » de la descente complète ; sa copie locale valide ne doit pas
//        recevoir `supprimeLe`. Le remplacement du miroir est suspendu dès qu'une
//        ligne est illisible (invariant 7).
//   R2 : la panne du rejeu du remappage en début de passage n'est pas avalée en
//        silence : `BilanPush.rejeuxEnPanne` la signale.
// Traçabilité : E7, E9 ; invariants 1, 7, 8.
// =============================================================================
/* eslint-disable @typescript-eslint/require-await -- faux transports : signatures asynchrones du contrat. */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LotPush, ReponsePull, ReponsePush } from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta, lireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { reinitialiserHorloge } from '../local/horloge.js';
import { cleLignesIllisibles, creerDescente } from './descente.js';
import { cleARemapper, creerMoteurSync } from './moteur.js';
import { creerPortSync } from './port.js';
import { remapperALaSortie } from './remappage.js';
import type { ResultatTransport } from './transport.js';

vi.mock('./remappage.js', async (importOriginal) => {
  const original = await importOriginal<{ remapperALaSortie: typeof remapperALaSortie }>();
  return { ...original, remapperALaSortie: vi.fn(original.remapperALaSortie) };
});

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const AFF1 = '0191e2a0-0000-7000-8000-0000000000b1';
const AFF2 = '0191e2a0-0000-7000-8000-0000000000b2';
const T1 = '2026-10-09T08:10:00.000Z';
const SERVEUR = '2026-10-09T09:00:00.000Z';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;
let vraiRemappage: typeof remapperALaSortie;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(131));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  vraiRemappage = (
    await vi.importActual<{ remapperALaSortie: typeof remapperALaSortie }>('./remappage.js')
  ).remapperALaSortie;
});

beforeEach(async () => {
  reinitialiserHorloge();
  nomBase = `axion-test-revue-a29-l6c3-${uuidv7()}`;
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

function affectation(id: string, orgUnitId: unknown = ORG_UNIT): Record<string, unknown> {
  return {
    id,
    orgUnitId,
    userId: AUDITEUR,
    plannedInterviews: 2,
    plannedDays: null,
    dateFrom: null,
    dateTo: null,
  };
}

function page(changes: ReponsePull['changes'], nextSince: string | null) {
  return {
    type: 'ok' as const,
    donnees: { serverTime: SERVEUR, changes, nextSince },
  };
}

function transport(pages: ResultatTransport<ReponsePull>[]) {
  const file = [...pages];
  return {
    pousser: vi.fn(async (lot: LotPush): Promise<ResultatTransport<ReponsePush>> => ({
      type: 'ok',
      donnees: {
        serverTime: SERVEUR,
        results: lot.operations.map((op) => ({ opId: op.opId, result: 'applied' as const })),
      },
    })),
    tirer: vi.fn(
      async (): Promise<ResultatTransport<ReponsePull>> => file.shift() ?? page({}, null),
    ),
  };
}

async function visibles(): Promise<string[]> {
  return (await base.workAssignments.toArray())
    .filter((a) => a.supprimeLe === null)
    .map((a) => a.id)
    .sort();
}

describe('R1 — une affectation illisible ne retire pas sa copie locale', () => {
  it('@critique AFF2 renvoyée illisible : le remplacement du miroir est suspendu, AFF2 reste visible', async () => {
    await creerDescente({
      base,
      coffre,
      transport: transport([page({ work_assignment: [affectation(AFF1), affectation(AFF2)] }, T1)]),
    }).tirer(MISSION);
    expect(await visibles()).toEqual([AFF1, AFF2].sort());

    const resultat = await creerPortSync({
      base,
      coffre,
      transport: transport([
        page({ work_assignment: [affectation(AFF1), affectation(AFF2, 42)] }, null),
      ]),
    }).resynchroniser(MISSION);

    expect(resultat.statut).toBe('succes');
    expect(await visibles(), 'AFF2 n’est jamais retirée sur une ligne illisible').toEqual(
      [AFF1, AFF2].sort(),
    );
    expect(await lireMeta(base, cleLignesIllisibles(MISSION))).toBe(1);
  });

  it('témoin : la même descente SANS illisible retire bien l’absente (miroir remplacé)', async () => {
    await creerDescente({
      base,
      coffre,
      transport: transport([page({ work_assignment: [affectation(AFF1), affectation(AFF2)] }, T1)]),
    }).tirer(MISSION);

    await creerPortSync({
      base,
      coffre,
      transport: transport([page({ work_assignment: [affectation(AFF1)] }, null)]),
    }).resynchroniser(MISSION);

    expect(await visibles()).toEqual([AFF1]);
    const aff2 = await base.workAssignments.get(AFF2);
    expect(aff2, 'jamais de suppression physique').toBeDefined();
    expect(aff2?.supprimeLe).not.toBeNull();
  });
});

describe('R2 — la panne du rejeu du remappage est signalée', () => {
  it('@critique le rejeu lève : `rejeuxEnPanne` = 1, la clé reste, le passage a abouti', async () => {
    const enAttente = uuidv7();
    await ecrireMeta(base, cleARemapper(MISSION), [enAttente]);
    vi.mocked(remapperALaSortie).mockRejectedValue(new Error('coffre verrouillé (fictif)'));

    const bilan = await creerMoteurSync({ base, coffre, transport: transport([]) }).pousser(
      MISSION,
    );

    expect(bilan.statut).toBe('succes');
    expect(bilan.rejeuxEnPanne).toBe(1);
    expect(await lireMeta(base, cleARemapper(MISSION))).toEqual([enAttente]);
  });

  it('rejeu réussi ou sans objet : `rejeuxEnPanne` = 0 et la clé est effacée', async () => {
    await ecrireMeta(base, cleARemapper(MISSION), [uuidv7()]);
    const moteur = creerMoteurSync({ base, coffre, transport: transport([]) });

    expect((await moteur.pousser(MISSION)).rejeuxEnPanne).toBe(0);
    expect((await lireMeta(base, cleARemapper(MISSION))) ?? null).toBeNull();
    expect((await moteur.pousser(MISSION)).rejeuxEnPanne).toBe(0);
  });
});
