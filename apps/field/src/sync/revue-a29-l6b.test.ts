// =============================================================================
// TESTS DES RÉSERVES A29 SUR L6b TERRAIN — écrits AVANT les corrections.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) contre la tête
// 546f5dc, depuis la revue A29 relayée par la coordination le 2026-10-09,
// `DECISIONS.md` [L6a] (« second UUID absorbé par la ligne existante : les
// références locales à l'UUID absorbé sont remappées par le terrain »), 05 §9.3
// (`superseded` : « l'appareil se réaligne »), l'invariant 7 (rien n'est
// silencieusement écrasé ou supprimé) et le 04 (`mission_users.role_on_mission`,
// CHECK fermé : lead, consultant, analyste, lecteur).
//
//   1. COURSE dans le remappage : une op sur X arrive entre la vérification
//      « X n'a plus d'op en file » et l'écriture de `supprimeLe` → X n'est PAS
//      absorbée, reste visible, et rien n'est remappé à moitié.
//   2. ABSORPTION MANQUÉE : Y est descendue pendant que l'op de X était encore en
//      file ; le siège répond ensuite `superseded` pour X → l'absorption est
//      recherchée À LA SORTIE de l'op, sur le couple (session, question) de X.
//   3. LIGNES ILLISIBLES : compte PAR MISSION, cumulé dans `meta`.
//   6. `roleSurMission` descendant : validé contre l'énumération fermée ; le
//      siège prime (rétrogradation comprise) ; absent ou vide → valeur locale ;
//      hors énumération → ligne illisible, comptée, rien d'inventé.
// (Points 4 et 5 : `ecrans/sync/EcranSynchronisation.test.tsx` et les doubles de
// L6a, qui reçoivent `fixtures/descente-vide.ts`.)
//
// ── EXPORT ATTENDU (pour A25) ───────────────────────────────────────────────
//   `apps/field/src/sync/descente.ts` :
//     /** Clé `meta` du compte CUMULÉ des lignes descendues illisibles d'une mission. */
//     export function cleLignesIllisibles(missionId: string): string;
//
// Traçabilité : E7, E9 ; invariants 1 et 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LotPush, ReponsePull, ReponsePush } from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta, lireMeta, type LigneOutbox } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../local/ecriture.js';
import { chargeMissionSchema } from '../local/formes.js';
import { reinitialiserHorloge } from '../local/horloge.js';
import { cleLignesIllisibles, creerDescente } from './descente.js';
import { operationDeLigne } from './montee.js';
import { creerPortSync } from './port.js';
import type { ResultatTransport } from './transport.js';

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000f2de';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const SESSION = '0191e2a0-0000-7000-8000-00000000a001';
const QUESTION = '0191e2a0-0000-7000-8000-00000000b001';

const T0 = '2026-10-09T08:00:00.000Z';
const T1 = '2026-10-09T08:10:00.000Z';
const T2 = '2026-10-09T08:20:00.000Z';
const SERVEUR = '2026-10-09T09:00:00.000Z';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(101));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  reinitialiserHorloge();
  nomBase = `axion-test-revue-a29-l6b-${uuidv7()}`;
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
// Banc
// ─────────────────────────────────────────────────────────────────────────────
function reponseServeur(id: string, surcharges: Record<string, unknown> = {}) {
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
    ...surcharges,
  };
}

function missionServeur(surcharges: Record<string, unknown> = {}) {
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
    updatedAt: T2,
    deletedAt: null,
    ...surcharges,
  };
}

function page(changes: ReponsePull['changes'], nextSince: string | null = T1) {
  return { type: 'ok' as const, donnees: { serverTime: SERVEUR, changes, nextSince } };
}

function transportPull(reponses: ResultatTransport<ReponsePull>[]) {
  const file = [...reponses];
  return {
    tirer: vi.fn((): Promise<ResultatTransport<ReponsePull>> =>
      Promise.resolve(file.shift() ?? page({}, null)),
    ),
  };
}

async function ecrireReponse(id: string, valeur = 2): Promise<void> {
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: MISSION_A,
    action: 'upsert',
    index: {
      interviewId: SESSION,
      missionQuestionId: QUESTION,
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'number', v: valeur },
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

async function marquerAExaminer(entiteId: string): Promise<void> {
  await base.outbox.update((await opRequise(entiteId)).opId, {
    statut: 'a_examiner',
    tentatives: 10,
    derniereErreur: 'Le siège ne connaît pas la réponse référencée (fictif).',
  });
}

async function reponsesVisiblesAuCouple(): Promise<string[]> {
  return (await base.answers.toArray())
    .filter(
      (r) => r.interviewId === SESSION && r.missionQuestionId === QUESTION && r.supprimeLe === null,
    )
    .map((r) => r.id)
    .sort();
}

async function roleLocal(): Promise<string> {
  const ligne = await base.missions.get(MISSION_A);
  if (ligne === undefined) throw new Error('banc : mission locale absente');
  return (await coffre.dechiffrer(ligne.charge, chargeMissionSchema)).roleSurMission;
}

async function titreLocal(): Promise<string> {
  const ligne = await base.missions.get(MISSION_A);
  if (ligne === undefined) throw new Error('banc : mission locale absente');
  return (await coffre.dechiffrer(ligne.charge, chargeMissionSchema)).titre;
}

async function semerMissionLocale(role: string): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_A,
    serverTime: SERVEUR,
    prochainSince: T0,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION_A, status: 'en_cours', clientUpdatedAt: T0, supprimeLe: null },
        charge: {
          titre: 'Mission fictive FIL-TPE (locale)',
          companyId: '0191e2a0-0000-7000-8000-00000000cccc',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: role,
        },
      },
    ],
  });
}

// =============================================================================
// 1. COURSE DANS LE REMAPPAGE
// =============================================================================
describe('A29-1 — course : une op sur X arrive pendant le remappage', () => {
  it('@critique X modifiée entre la vérification et l’écriture : X n’est PAS absorbée, reste visible, rien n’est remappé à moitié', async () => {
    const x = uuidv7();
    const y = uuidv7();
    const piece = uuidv7();
    await ecrireReponse(x);
    await ecrirePiece(piece, x);
    await base.outbox.delete((await opRequise(x)).opId); // X acquittée (`superseded`)
    await marquerAExaminer(piece);

    // Le coffre de la descente : au PREMIER chiffrement (le remappage prépare ses
    // charges), l'auditeur re-saisit X — une op sur X entre en file.
    let saisieFaite = false;
    const coffreQuiLaisseSaisir: Coffre = {
      get ouvert() {
        return coffre.ouvert;
      },
      dechiffrer: (enveloppe, schema) => coffre.dechiffrer(enveloppe, schema),
      async chiffrer(valeur) {
        if (!saisieFaite) {
          saisieFaite = true;
          await ecrireReponse(x, 5);
        }
        return coffre.chiffrer(valeur);
      },
      verrouiller: () => {
        coffre.verrouiller();
      },
    };

    await creerDescente({
      base,
      coffre: coffreQuiLaisseSaisir,
      transport: transportPull([page({ answer: [reponseServeur(y)] })]),
    }).tirer(MISSION_A);

    // Anti-vacuité : la course a bien eu lieu.
    expect(saisieFaite).toBe(true);
    // X n'est pas absorbée : visible, sa nouvelle op en file.
    expect((await base.answers.get(x))?.supprimeLe).toBeNull();
    expect((await reponsesVisiblesAuCouple()).includes(x)).toBe(true);
    const opX = await opRequise(x);
    expect(opX.statut).toBe('en_attente');
    // Rien n'est remappé à moitié : la pièce désigne toujours X, partout.
    expect((await base.attachments.get(piece))?.answerId).toBe(x);
    const opPiece = await opRequise(piece);
    expect(
      ((await operationDeLigne(opPiece, coffre)).payload as { answerId: string }).answerId,
    ).toBe(x);
  });
});

// =============================================================================
// 2. ABSORPTION MANQUÉE — Y descendue AVANT le `superseded` de X
// =============================================================================
describe('A29-2 — Y déjà descendue, puis `superseded` pour X', () => {
  it('@critique à la sortie `superseded`, X est absorbée par Y : références remappées, aucun doublon visible, rien de supprimé', async () => {
    const x = uuidv7();
    const y = uuidv7();
    const piece = uuidv7();
    await ecrireReponse(x);
    await ecrirePiece(piece, x);
    await marquerAExaminer(piece);

    // Y descend pendant que l'op de X est ENCORE en file : pas d'absorption ici.
    await creerDescente({
      base,
      coffre,
      transport: transportPull([page({ answer: [reponseServeur(y)] })]),
    }).tirer(MISSION_A);
    expect(await reponsesVisiblesAuCouple()).toEqual([x, y].sort());

    // Puis le siège répond `superseded` pour X ; le pull suivant n'apporte rien.
    const opX = (await opRequise(x)).opId;
    const transport = {
      pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
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
      },
      tirer: transportPull([]).tirer,
    };
    await creerPortSync({ base, coffre, transport }).synchroniserMaintenant(MISSION_A);

    expect(await opDe(x)).toBeUndefined();
    expect(await reponsesVisiblesAuCouple()).toEqual([y]);
    const ligneX = await base.answers.get(x);
    expect(ligneX).toBeDefined();
    expect(ligneX?.supprimeLe).not.toBeNull();
    expect((await base.attachments.get(piece))?.answerId).toBe(y);
    const opPiece = await opRequise(piece);
    expect(opPiece.statut).toBe('en_attente');
    expect(opPiece.tentatives).toBe(0);
    expect(
      ((await operationDeLigne(opPiece, coffre)).payload as { answerId: string }).answerId,
    ).toBe(y);
  });

  it('`superseded` sans autre réponse au couple : rien n’est absorbé (X reste visible)', async () => {
    const x = uuidv7();
    await ecrireReponse(x);
    const opX = (await opRequise(x)).opId;
    const transport = {
      pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
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
      },
      tirer: transportPull([]).tirer,
    };
    await creerPortSync({ base, coffre, transport }).synchroniserMaintenant(MISSION_A);
    expect(await reponsesVisiblesAuCouple()).toEqual([x]);
  });
});

// =============================================================================
// 3. LIGNES ILLISIBLES — compte par mission, cumulé dans `meta`
// =============================================================================
describe('A29-3 — lignes illisibles comptées par mission, cumulées', () => {
  it('@critique chaque pull AJOUTE ses illisibles au compte de SA mission ; un pull propre ne le remet pas à zéro', async () => {
    const illisible = (): Record<string, unknown> => ({ id: uuidv7(), interviewId: 42 });
    await creerDescente({
      base,
      coffre,
      transport: transportPull([page({ answer: [illisible(), illisible()] })]),
    }).tirer(MISSION_A);
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_A))).toBe(2);

    await creerDescente({
      base,
      coffre,
      transport: transportPull([page({ answer: [illisible(), reponseServeur(uuidv7())] }, T2)]),
    }).tirer(MISSION_A);
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_A))).toBe(3);

    await creerDescente({ base, coffre, transport: transportPull([page({}, null)]) }).tirer(
      MISSION_A,
    );
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_A))).toBe(3);
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_B))).toBeUndefined();
  });

  it('la clé est propre à la mission', () => {
    expect(cleLignesIllisibles(MISSION_A)).not.toBe(cleLignesIllisibles(MISSION_B));
    expect(cleLignesIllisibles(MISSION_A)).toContain(MISSION_A);
  });
});

// =============================================================================
// 6. `roleSurMission` descendant (04 : lead, consultant, analyste, lecteur)
// =============================================================================
describe('A29-6 — le rôle sur la mission, tel que le siège le dit', () => {
  it('@critique le siège prime, rétrogradation comprise : lead → lecteur', async () => {
    await semerMissionLocale('lead');
    await creerDescente({
      base,
      coffre,
      transport: transportPull([page({ mission: [missionServeur({ roleOnMission: 'lecteur' })] })]),
    }).tirer(MISSION_A);
    expect(await roleLocal()).toBe('lecteur');
  });

  it('premier pull : la valeur du siège est prise', async () => {
    await creerDescente({
      base,
      coffre,
      transport: transportPull([
        page({ mission: [missionServeur({ roleOnMission: 'consultant' })] }),
      ]),
    }).tirer(MISSION_A);
    expect(await roleLocal()).toBe('consultant');
  });

  for (const [libelle, surcharge] of [
    ['absente', {}],
    ['vide', { roleOnMission: '' }],
    ['nulle', { roleOnMission: null }],
  ] as const) {
    it(`valeur ${libelle} : la valeur locale est gardée, le reste de la ligne est appliqué`, async () => {
      await semerMissionLocale('analyste');
      await creerDescente({
        base,
        coffre,
        transport: transportPull([page({ mission: [missionServeur(surcharge)] })]),
      }).tirer(MISSION_A);
      expect(await roleLocal()).toBe('analyste');
      expect(await titreLocal()).toBe('Mission fictive FIL-TPE (siège)');
    });
  }

  it('@critique valeur hors énumération : ligne illisible, comptée, rien d’inventé ni d’appliqué', async () => {
    await semerMissionLocale('lead');
    const bilan = await creerDescente({
      base,
      coffre,
      transport: transportPull([
        page({ mission: [missionServeur({ roleOnMission: 'directeur_fictif' })] }),
      ]),
    }).tirer(MISSION_A);
    expect(bilan.enregistrementsIllisibles).toBe(1);
    expect(await lireMeta(base, cleLignesIllisibles(MISSION_A))).toBe(1);
    expect(await roleLocal()).toBe('lead');
    expect(await titreLocal()).toBe('Mission fictive FIL-TPE (locale)');
  });
});
