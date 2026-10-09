// =============================================================================
// TESTS DU MOTEUR DE MONTÉE — lot L6, incrément L6a « la montée ». ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) depuis 05 §9.3 (lots de
// 100, ordre de file, les cinq résultats), 11 §4 (format d'op, `outboxRemaining`),
// 05 §9.8 scénarios 1, 2 et 3, `LOT_L6.md` §3ter C.1 et §5 (PD2, PD5), et les
// fonctions DÉJÀ livrées que le moteur consomme : `depotOutbox.prochainLot`
// (`local/depots/outbox.ts`), `ecrireLocal` (`local/ecriture.ts`).
//
// ── API ATTENDUE DE `apps/field/src/sync/moteur.ts` (pour A25) ───────────────
//   export interface DependancesMoteur {
//     readonly base: BaseLocale;      // la base locale ouverte (celle du contexte)
//     readonly coffre: Coffre;        // pour déchiffrer `LigneOutbox.charge` (PD2)
//     readonly transport: Pick<TransportSync, 'pousser'>; // ./transport.ts
//     readonly maintenant?: () => string; // ISO UTC ; défaut : `maintenant()` de local/horloge
//   }
//   export interface BilanPush {
//     readonly statut: 'succes' | 'hors_ligne' | 'reconnexion_requise' | 'refus';
//     readonly operationsAcquittees: number; // applied + duplicate + superseded
//     readonly arbitrees: number;            // superseded (« n réponse(s) arbitrée(s) »)
//     readonly rejetees: number;             // forbidden
//     readonly enErreur: number;             // error
//     readonly operationsRestantes: number;  // ops `en_attente` de la mission après le passage
//   }
//   export interface MoteurSync { pousser(missionId: string): Promise<BilanPush>; }
//   export function creerMoteurSync(deps: DependancesMoteur): MoteurSync;
//
// Règles que ces tests figent :
//   · drainage par `prochainLot`, lots ≤ TAILLE_LOT_PUSH_MAX, ordre de file (opId v7) ;
//   · `deviceId` = meta `CLES_META.appareil` ; `outboxRemaining` = file réelle après retrait du lot ;
//   · acquittement PAR `opId` (jamais par entité) ;
//   · `error` : l'op reste `en_attente`, `tentatives` + 1, `derniereErreur` en français ;
//     au ECHECS_AVANT_EXAMEN-ième → `a_examiner` ; une op n'est envoyée qu'UNE fois par passage ;
//   · `forbidden` → `rejetee`, reste en file, jamais renvoyée ;
//   · coupure réseau : rien n'est perdu, rien n'est compté comme un échec d'op ;
//   · les mêmes `opId` sont renvoyés après un kill (idempotence serveur).
//
// Rouge attendu tant que `moteur.ts` n'existe pas — pour cette seule raison.
// Traçabilité : E7 (remontée continue), E38 (sauvegarde terrain), invariant 1 et 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ECHECS_AVANT_EXAMEN,
  TAILLE_LOT_PUSH_MAX,
  lotPushSchema,
  type LotPush,
  type Operation,
  type ReponsePush,
  type ResultatOp,
} from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta, type LigneOutbox } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import { estEnveloppe } from '../local/enveloppe.js';
import { creerMoteurSync } from './moteur.js';
import type { ResultatTransport, TransportSync } from './transport.js';

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000f2de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const HORODATAGE = '2026-10-09T08:15:00.000Z';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(29));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  nomBase = `axion-test-moteur-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
});

afterEach(async () => {
  base.close();
  await Dexie.delete(nomBase);
});

// ─────────────────────────────────────────────────────────────────────────────
// Outils du banc
// ─────────────────────────────────────────────────────────────────────────────
/** Une session d'entretien fictive écrite par le PORT d'écriture (jamais par Dexie). */
async function ecrireSession(
  missionId: string = MISSION_A,
  id: string = uuidv7(),
): Promise<string> {
  await ecrireLocal({
    entite: 'interview',
    id,
    missionId,
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
      mode: 'sur_site',
      personName: 'Interlocuteur fictif',
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
    },
  });
  return id;
}

async function ecrireSessions(n: number, missionId: string = MISSION_A): Promise<void> {
  for (let i = 0; i < n; i += 1) await ecrireSession(missionId);
}

async function file(): Promise<LigneOutbox[]> {
  return (await base.outbox.toArray()).sort((a, b) => a.opId.localeCompare(b.opId));
}

/**
 * Un siège FICTIF, idempotent comme le vrai (11 §4 : `processed_ops`) : un `opId`
 * déjà vu rend `duplicate`. `regle` décide du résultat d'une op neuve.
 */
function siegeFictif(regle: (op: Operation, rang: number) => ResultatOp = () => 'applied') {
  const vus = new Map<string, number>();
  const lots: LotPush[] = [];
  let rang = 0;
  const transport: Pick<TransportSync, 'pousser'> = {
    // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
    async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
      lots.push(lotPushSchema.parse(structuredClone(lot)));
      const results = lot.operations.map((op) => {
        const deja = vus.get(op.opId);
        if (deja !== undefined) {
          vus.set(op.opId, deja + 1);
          return { opId: op.opId, result: 'duplicate' as const };
        }
        const result = regle(op, rang);
        rang += 1;
        if (result !== 'error') vus.set(op.opId, 1);
        return {
          opId: op.opId,
          result,
          ...(result === 'forbidden' || result === 'error'
            ? { message: 'Écriture refusée par le siège (motif fictif).' }
            : {}),
        };
      });
      return { type: 'ok', donnees: { serverTime: HORODATAGE, results } };
    },
  };
  return {
    transport,
    lots,
    /** Le nombre de fois qu'une op a été APPLIQUÉE (1 = idempotent). */
    appliquees: (opId: string) => (vus.has(opId) ? 1 : 0),
    envoisDe: (opId: string) =>
      lots.flatMap((l) => l.operations).filter((o) => o.opId === opId).length,
  };
}

// =============================================================================
// A. Drainage, lots, ordre (05 §9.3, 11 §4)
// =============================================================================
describe('moteur — drainage de l’outbox par lots de 100, ordre de file préservé', () => {
  it('250 opérations partent en 3 lots (100, 100, 50), dans l’ordre des opId, sans doublon', async () => {
    await ecrireSessions(250);
    const attendu = (await file()).map((op) => op.opId);
    const siege = siegeFictif();

    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );

    expect(siege.lots.map((l) => l.operations.length)).toEqual([100, 100, 50]);
    for (const lot of siege.lots)
      expect(lot.operations.length).toBeLessThanOrEqual(TAILLE_LOT_PUSH_MAX);
    expect(siege.lots.flatMap((l) => l.operations.map((o) => o.opId))).toEqual(attendu);
    expect(bilan.statut).toBe('succes');
    expect(bilan.operationsAcquittees).toBe(250);
    expect(bilan.operationsRestantes).toBe(0);
    expect(await base.outbox.count()).toBe(0);
  }, 30_000);

  it('chaque lot porte la mission, l’appareil (meta) et un outboxRemaining compté sur la file réelle', async () => {
    await ecrireSessions(150);
    const siege = siegeFictif();

    await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A);

    expect(siege.lots).toHaveLength(2);
    expect(siege.lots.every((l) => l.missionId === MISSION_A)).toBe(true);
    expect(siege.lots.every((l) => l.deviceId === APPAREIL)).toBe(true);
    // « Il se compte sur la file réelle APRÈS RETRAIT DU LOT » (sync.ts, 05 §9.7).
    expect(siege.lots.map((l) => l.outboxRemaining)).toEqual([50, 0]);
  }, 20_000);

  it('l’op envoyée reprend la ligne de file champ pour champ, avec une charge DÉCHIFFRÉE (PD2)', async () => {
    const id = await ecrireSession();
    const [ligne] = await file();
    const siege = siegeFictif();

    await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A);

    const op = siege.lots[0]?.operations[0];
    expect(op).toMatchObject({
      opId: ligne?.opId,
      entity: 'interview',
      entityId: id,
      action: 'upsert',
      clientUpdatedAt: ligne?.clientUpdatedAt,
    });
    // L'enveloppe chiffrée locale ne part JAMAIS telle quelle : le siège n'a pas la DEK.
    expect(estEnveloppe(op?.payload)).toBe(false);
    expect(op?.payload).not.toBeNull();
    expect(typeof op?.payload).toBe('object');
  });

  it('ne pousse que la mission demandée : la file d’une autre mission reste intacte', async () => {
    await ecrireSessions(3, MISSION_A);
    await ecrireSessions(2, MISSION_B);
    const siege = siegeFictif();

    await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A);

    expect(siege.lots.flatMap((l) => l.operations)).toHaveLength(3);
    const restantes = await file();
    expect(restantes).toHaveLength(2);
    expect(restantes.every((op) => op.missionId === MISSION_B && op.statut === 'en_attente')).toBe(
      true,
    );
  });

  it('file vide : aucun lot n’est envoyé (lotPushSchema exige au moins une op)', async () => {
    const siege = siegeFictif();
    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );
    expect(siege.lots).toHaveLength(0);
    expect(bilan.operationsRestantes).toBe(0);
  });
});

// =============================================================================
// B. Les cinq résultats du 05 §9.3
// =============================================================================
describe('moteur — traduction des cinq résultats (05 §9.3, PD5)', () => {
  it('applied et duplicate : l’op sort de l’outbox', async () => {
    await ecrireSessions(2);
    const siege = siegeFictif();
    // Le second envoi d'un op déjà vu rend `duplicate` : on le provoque en pré-appliquant.
    const [, seconde] = await file();
    if (seconde === undefined) throw new Error('banc : deux ops attendues');
    await siege.transport.pousser({
      missionId: MISSION_A,
      deviceId: APPAREIL,
      operations: [
        {
          opId: seconde.opId,
          entity: 'interview',
          entityId: seconde.entiteId,
          action: 'upsert',
          payload: {},
          clientUpdatedAt: seconde.clientUpdatedAt,
        },
      ],
      outboxRemaining: 0,
    });

    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );

    expect(await base.outbox.count()).toBe(0);
    expect(bilan.operationsAcquittees).toBe(2);
    expect(bilan.enErreur).toBe(0);
  });

  it('superseded : l’op sort de l’outbox ET le bilan compte l’arbitrage (« n réponse(s) arbitrée(s) »)', async () => {
    await ecrireSessions(3);
    const siege = siegeFictif((_op, rang) => (rang === 1 ? 'superseded' : 'applied'));

    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );

    expect(await base.outbox.count()).toBe(0);
    expect(bilan.arbitrees).toBe(1);
    expect(bilan.operationsAcquittees).toBe(3);
  });

  it('forbidden : l’op RESTE en file, statut « rejetee » visible, message en français — jamais rejouée', async () => {
    await ecrireSessions(2);
    const siege = siegeFictif((_op, rang) => (rang === 0 ? 'forbidden' : 'applied'));
    const moteur = creerMoteurSync({ base, coffre, transport: siege.transport });
    const [premiere] = await file();

    const bilan = await moteur.pousser(MISSION_A);

    const restantes = await file();
    expect(restantes).toHaveLength(1);
    expect(restantes[0]?.opId).toBe(premiere?.opId);
    expect(restantes[0]?.statut).toBe('rejetee');
    expect(restantes[0]?.derniereErreur).toMatch(/[a-zé]/i);
    expect(bilan.rejetees).toBe(1);

    await moteur.pousser(MISSION_A);
    expect(siege.envoisDe(premiere?.opId ?? '')).toBe(1);
    expect((await file())[0]?.statut).toBe('rejetee');
  });

  it('error : l’op reste en_attente, tentatives + 1, derniereErreur renseignée', async () => {
    await ecrireSessions(1);
    const siege = siegeFictif(() => 'error');

    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );

    const [op] = await file();
    expect(op?.statut).toBe('en_attente');
    expect(op?.tentatives).toBe(1);
    expect(op?.derniereErreur).not.toBeNull();
    expect(bilan.enErreur).toBe(1);
    expect(bilan.operationsRestantes).toBe(1);
  });

  it('error : une op n’est envoyée qu’UNE fois par passage, même quand d’autres sortent autour d’elle', async () => {
    await ecrireSessions(3);
    const [, milieu] = await file();
    const siege = siegeFictif((op) => (op.opId === milieu?.opId ? 'error' : 'applied'));

    await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A);

    expect(siege.envoisDe(milieu?.opId ?? '')).toBe(1);
    expect(await base.outbox.count()).toBe(1);
  });

  it(`error : au ${String(ECHECS_AVANT_EXAMEN)}e échec l’op passe « a_examiner », pas avant, et n’est plus envoyée ensuite`, async () => {
    await ecrireSessions(1);
    const [op] = await file();
    const siege = siegeFictif(() => 'error');
    const moteur = creerMoteurSync({ base, coffre, transport: siege.transport });

    for (let i = 1; i < ECHECS_AVANT_EXAMEN; i += 1) await moteur.pousser(MISSION_A);
    expect((await file())[0]?.statut).toBe('en_attente');
    expect((await file())[0]?.tentatives).toBe(ECHECS_AVANT_EXAMEN - 1);

    await moteur.pousser(MISSION_A);
    const apres = (await file())[0];
    expect(apres?.statut).toBe('a_examiner');
    expect(apres?.tentatives).toBe(ECHECS_AVANT_EXAMEN);

    await moteur.pousser(MISSION_A);
    expect(siege.envoisDe(op?.opId ?? '')).toBe(ECHECS_AVANT_EXAMEN);
    // Jamais de suppression silencieuse (invariant 7).
    expect(await base.outbox.count()).toBe(1);
  });

  it('une op sans résultat dans la réponse reste en file (rien ne sort sans réponse serveur)', async () => {
    await ecrireSessions(2);
    const [premiere, seconde] = await file();
    const transport: Pick<TransportSync, 'pousser'> = {
      // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
      async pousser(): Promise<ResultatTransport<ReponsePush>> {
        return {
          type: 'ok',
          donnees: {
            serverTime: HORODATAGE,
            results: [{ opId: premiere?.opId ?? '', result: 'applied' }],
          },
        };
      },
    };

    await creerMoteurSync({ base, coffre, transport }).pousser(MISSION_A);

    const restantes = await file();
    expect(restantes.map((o) => o.opId)).toEqual([seconde?.opId]);
    expect(restantes[0]?.statut).toBe('en_attente');
  });

  it('l’acquittement se fait PAR opId : une ré-écriture de la même entité pendant le vol n’est pas acquittée', async () => {
    const id = await ecrireSession();
    let ecritPendantLeVol = false;
    const siege = siegeFictif();
    const transport: Pick<TransportSync, 'pousser'> = {
      async pousser(lot) {
        if (!ecritPendantLeVol) {
          ecritPendantLeVol = true;
          await ecrireSession(MISSION_A, id); // l'auditeur continue de saisir
        }
        return siege.transport.pousser(lot);
      },
    };

    await creerMoteurSync({ base, coffre, transport }).pousser(MISSION_A);

    // La ré-écriture a son propre opId : soit elle est partie dans un lot suivant
    // (et acquittée), soit elle attend encore — elle n'est JAMAIS perdue.
    const envoyees = siege.lots.flatMap((l) => l.operations).filter((o) => o.entityId === id);
    const enFile = (await file()).filter((o) => o.entiteId === id);
    expect(envoyees.length + enFile.length).toBe(2);
    expect(new Set([...envoyees.map((o) => o.opId), ...enFile.map((o) => o.opId)]).size).toBe(2);
  });
});

// =============================================================================
// C. Scénarios 05 §9.8 — mécanisme côté client (Playwright en L6c)
// =============================================================================
describe('moteur — scénario §9.8 n°1 : coupure réseau en plein lot', () => {
  it('le 2e lot tombe : le 1er est acquitté, le reste attend intact, sans compter d’échec d’op', async () => {
    await ecrireSessions(250);
    const siege = siegeFictif();
    let appels = 0;
    let reseau = false;
    const transport: Pick<TransportSync, 'pousser'> = {
      pousser(lot) {
        appels += 1;
        if (!reseau && appels === 2) return Promise.resolve({ type: 'hors_ligne' });
        return siege.transport.pousser(lot);
      },
    };
    const moteur = creerMoteurSync({ base, coffre, transport });

    const bilan = await moteur.pousser(MISSION_A);

    expect(bilan.statut).toBe('hors_ligne');
    const restantes = await file();
    expect(restantes).toHaveLength(150);
    expect(restantes.every((o) => o.statut === 'en_attente' && o.tentatives === 0)).toBe(true);
    expect(bilan.operationsRestantes).toBe(150);

    // Le réseau revient : la file se vide, chaque op appliquée UNE fois.
    reseau = true;
    const reprise = await moteur.pousser(MISSION_A);
    expect(reprise.statut).toBe('succes');
    expect(await base.outbox.count()).toBe(0);
    const ids = siege.lots.flatMap((l) => l.operations.map((o) => o.opId));
    expect(new Set(ids).size).toBe(250);
  }, 30_000);

  it('une saisie faite PENDANT la coupure s’ajoute à la file sans rien écraser', async () => {
    await ecrireSessions(2);
    const transport: Pick<TransportSync, 'pousser'> = {
      async pousser() {
        await ecrireSession();
        return { type: 'hors_ligne' };
      },
    };

    await creerMoteurSync({ base, coffre, transport }).pousser(MISSION_A);

    expect(await base.outbox.count()).toBe(3);
  });
});

describe('moteur — scénario §9.8 n°2 : kill de l’app pendant un push', () => {
  it('réponse jamais reçue → à la réouverture, les MÊMES opId repartent et le siège les dédoublonne', async () => {
    await ecrireSessions(5);
    const avant = (await file()).map((o) => o.opId);
    const siege = siegeFictif();

    // Le siège reçoit et applique, puis l'onglet meurt avant la réponse. On attend
    // l'ÉVÉNEMENT « le siège a appliqué le lot », jamais un délai fixe.
    let siegeAApplique: () => void = () => undefined;
    const lotApplique = new Promise<void>((resoudre) => {
      siegeAApplique = resoudre;
    });
    const transportTue: Pick<TransportSync, 'pousser'> = {
      async pousser(lot) {
        await siege.transport.pousser(lot);
        siegeAApplique();
        return new Promise<never>(() => undefined);
      },
    };
    void creerMoteurSync({ base, coffre, transport: transportTue }).pousser(MISSION_A);
    await lotApplique;
    expect(siege.lots).toHaveLength(1);
    expect(siege.lots[0]?.operations.map((o) => o.opId)).toEqual(avant);

    // « Redémarrage » : nouvelle connexion à la MÊME base persistée.
    base.close();
    base = new BaseLocale(nomBase);
    await base.open();
    installerContexteLocal({ base, coffre });

    const persistee = await file();
    expect(persistee.map((o) => o.opId)).toEqual(avant);
    expect(persistee.every((o) => o.statut === 'en_attente')).toBe(true);

    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );

    expect(bilan.statut).toBe('succes');
    expect(await base.outbox.count()).toBe(0);
    for (const opId of avant) {
      expect(siege.envoisDe(opId)).toBe(2);
      expect(siege.appliquees(opId)).toBe(1);
    }
  });
});

describe('moteur — scénario §9.8 n°3 : double envoi du même lot', () => {
  it('deux passages concurrents : chaque op est appliquée une seule fois, aucune ne finit en échec', async () => {
    await ecrireSessions(4);
    const attendus = (await file()).map((o) => o.opId);
    const siege = siegeFictif();
    const moteur = creerMoteurSync({ base, coffre, transport: siege.transport });

    const bilans = await Promise.all([moteur.pousser(MISSION_A), moteur.pousser(MISSION_A)]);

    expect(await base.outbox.count()).toBe(0);
    expect(bilans.reduce((n, b) => n + b.enErreur + b.rejetees, 0)).toBe(0);
    // A5 : compte BRUT de ce que le siège a reçu — aucun opId n'arrive deux fois.
    const recues = siege.lots.flatMap((l) => l.operations.map((o) => o.opId));
    expect(recues).toHaveLength(attendus.length);
    expect([...recues].sort()).toEqual(attendus);
    for (const opId of attendus) expect(siege.envoisDe(opId)).toBe(1);
  });

  it('un lot dont toutes les ops reviennent « duplicate » vide la file sans erreur', async () => {
    await ecrireSessions(3);
    const siege = siegeFictif();
    // Premier envoi dont la réponse est perdue : le siège a tout vu.
    const perdu: Pick<TransportSync, 'pousser'> = {
      async pousser(lot) {
        await siege.transport.pousser(lot);
        return { type: 'hors_ligne' };
      },
    };
    await creerMoteurSync({ base, coffre, transport: perdu }).pousser(MISSION_A);
    expect(await base.outbox.count()).toBe(3);

    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );

    expect(bilan.statut).toBe('succes');
    expect(bilan.operationsAcquittees).toBe(3);
    expect(bilan.enErreur + bilan.rejetees).toBe(0);
    expect(await base.outbox.count()).toBe(0);
  });
});

describe('moteur — refus d’authentification (scénario §9.8 n°8, côté moteur)', () => {
  it('reconnexion requise : la file reste intacte et le bilan le dit', async () => {
    await ecrireSessions(2);
    const transport: Pick<TransportSync, 'pousser'> = {
      // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
      async pousser() {
        return { type: 'reconnexion_requise', message: 'Reconnexion requise (banc).' };
      },
    };

    const bilan = await creerMoteurSync({ base, coffre, transport }).pousser(MISSION_A);

    expect(bilan.statut).toBe('reconnexion_requise');
    const restantes = await file();
    expect(restantes).toHaveLength(2);
    expect(restantes.every((o) => o.statut === 'en_attente' && o.tentatives === 0)).toBe(true);
  });
});

// =============================================================================
// D. Refus du LOT entier (arbitrage coordination 2026-10-09) et appareil sans identifiant
// =============================================================================
function siegeQuiRefuseLeLot(statut: number): Pick<TransportSync, 'pousser'> & { appels: number } {
  const banc = {
    appels: 0,
    // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
    async pousser(): Promise<ResultatTransport<ReponsePush>> {
      banc.appels += 1;
      return { type: 'refus', statut, message: 'Lot refusé par le siège (motif fictif).' };
    },
  };
  return banc;
}

describe('moteur — refus du lot entier : +1 tentative par op du lot (sinon jamais « à examiner »)', () => {
  for (const statut of [400, 403, 500]) {
    it(`refus ${String(statut)} : chaque op du lot prend +1 tentative et garde le motif, la file reste intacte`, async () => {
      await ecrireSessions(3);
      const siege = siegeQuiRefuseLeLot(statut);

      const bilan = await creerMoteurSync({ base, coffre, transport: siege }).pousser(MISSION_A);

      expect(bilan.statut).toBe('refus');
      expect(siege.appels).toBe(1);
      const restantes = await file();
      expect(restantes).toHaveLength(3);
      for (const op of restantes) {
        expect(op.statut).toBe('en_attente');
        expect(op.tentatives).toBe(1);
        expect(op.derniereErreur).toBe('Lot refusé par le siège (motif fictif).');
      }
    });
  }

  it(`un lot refusé en permanence finit « a_examiner » au ${String(ECHECS_AVANT_EXAMEN)}e passage, et n’est plus envoyé`, async () => {
    await ecrireSessions(2);
    const siege = siegeQuiRefuseLeLot(400);
    const moteur = creerMoteurSync({ base, coffre, transport: siege });

    for (let i = 1; i < ECHECS_AVANT_EXAMEN; i += 1) await moteur.pousser(MISSION_A);
    expect((await file()).every((o) => o.statut === 'en_attente')).toBe(true);

    await moteur.pousser(MISSION_A);
    const apres = await file();
    expect(apres).toHaveLength(2);
    expect(apres.every((o) => o.statut === 'a_examiner')).toBe(true);
    expect(apres.every((o) => o.tentatives === ECHECS_AVANT_EXAMEN)).toBe(true);

    await moteur.pousser(MISSION_A);
    expect(siege.appels).toBe(ECHECS_AVANT_EXAMEN);
  });

  it('seules les ops DU lot refusé comptent : celles du lot suivant (non envoyées) restent à 0', async () => {
    await ecrireSessions(150);
    const siege = siegeQuiRefuseLeLot(500);

    await creerMoteurSync({ base, coffre, transport: siege }).pousser(MISSION_A);

    const restantes = await file();
    expect(restantes.filter((o) => o.tentatives === 1)).toHaveLength(TAILLE_LOT_PUSH_MAX);
    expect(restantes.filter((o) => o.tentatives === 0)).toHaveLength(50);
    expect(siege.appels).toBe(1);
  }, 20_000);

  it('une coupure réseau, elle, ne compte toujours pas', async () => {
    await ecrireSessions(2);
    const transport: Pick<TransportSync, 'pousser'> = {
      pousser: () => Promise.resolve({ type: 'hors_ligne' }),
    };
    const moteur = creerMoteurSync({ base, coffre, transport });

    for (let i = 0; i < ECHECS_AVANT_EXAMEN + 1; i += 1) await moteur.pousser(MISSION_A);

    expect((await file()).every((o) => o.statut === 'en_attente' && o.tentatives === 0)).toBe(true);
  });
});

describe('moteur — appareil sans identifiant', () => {
  it('meta « appareil » absente : le passage échoue en le disant, rien n’est envoyé, rien n’est retiré', async () => {
    await ecrireSessions(2);
    await base.meta.delete(CLES_META.appareil);
    const siege = siegeFictif();

    await expect(
      creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A),
    ).rejects.toThrow(/identifiant/i);

    expect(siege.lots).toHaveLength(0);
    expect(await base.outbox.count()).toBe(2);
  });
});

describe('moteur — refus d’authentification : aucune tentative comptée (arbitrage 2026-10-09)', () => {
  it('second 401 (refus statut 401) : la file reste à 0 tentative, même après 11 passages', async () => {
    await ecrireSessions(2);
    const siege = siegeQuiRefuseLeLot(401);
    const moteur = creerMoteurSync({ base, coffre, transport: siege });

    for (let i = 0; i < ECHECS_AVANT_EXAMEN + 1; i += 1) await moteur.pousser(MISSION_A);

    const restantes = await file();
    expect(restantes).toHaveLength(2);
    expect(restantes.every((o) => o.statut === 'en_attente' && o.tentatives === 0)).toBe(true);
  });
});

// =============================================================================
// E. Arbitrages A2 et B1 (2026-10-09) : une op illisible ou incomplète est ISOLÉE
// =============================================================================
async function ecrireQuestionAdHoc(blockCode: string | null): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'question_adhoc',
    id,
    missionId: MISSION_A,
    action: 'upsert',
    index: {
      position: 3,
      texteSnapshot: 'Question ad hoc fictive ?',
      motsCles: ['question', 'fictive'],
      answerType: 'free_text',
      criticality: 'informatif',
    },
    charge: {
      questionId: uuidv7(),
      questionVersion: 1,
      guidanceSnapshot: null,
      optionsSnapshot: null,
      scoringSnapshot: null,
      weightSnapshot: 0,
      allowRangeSnapshot: false,
      addedAdHoc: true,
      blockCode,
    },
  });
  return id;
}

async function ligneDe(entiteId: string): Promise<LigneOutbox> {
  const ligne = (await file()).find((o) => o.entiteId === entiteId);
  if (ligne === undefined) throw new Error('banc : ligne attendue');
  return ligne;
}

describe('moteur — op illisible ou incomplète : isolée « à examiner », les autres partent', () => {
  it('B1 : une question ad hoc SANS bloc ne part jamais — « a_examiner » + motif français, le reste monte', async () => {
    const sansBloc = await ecrireQuestionAdHoc(null);
    await ecrireSessions(2);
    const siege = siegeFictif();

    const bilan = await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(
      MISSION_A,
    );

    const envoyees = siege.lots.flatMap((l) => l.operations);
    expect(envoyees.filter((o) => o.entity === 'question_adhoc')).toHaveLength(0);
    expect(envoyees).toHaveLength(2);
    const isolee = await ligneDe(sansBloc);
    expect(isolee.statut).toBe('a_examiner');
    expect(isolee.derniereErreur).toMatch(/bloc/i);
    expect(await base.outbox.count()).toBe(1);
    expect(bilan.operationsAcquittees).toBe(2);
  });

  it('B1 : une question ad hoc AVEC bloc part, et son blockCode est une chaîne non vide', async () => {
    await ecrireQuestionAdHoc('BLOC-FICTIF');
    const siege = siegeFictif();

    await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A);

    const [op] = siege.lots.flatMap((l) => l.operations);
    expect((op?.payload as { question: { blockCode: unknown } }).question.blockCode).toBe(
      'BLOC-FICTIF',
    );
  });

  it('A2 : une charge qui ne se DÉCHIFFRE pas est isolée « a_examiner » avec motif ; les autres partent', async () => {
    const kekEtrangere = await deriverKek(
      'autre-cheval-pile-agrafe-2026',
      new Uint8Array(16).fill(53),
    );
    const coffreEtranger = await ouvrirCoffre(kekEtrangere, await creerDekEnveloppee(kekEtrangere));
    const corrompue = await ecrireSession();
    await ecrireSessions(2);
    const ligne = await ligneDe(corrompue);
    await base.outbox.update(ligne.opId, { charge: await coffreEtranger.chiffrer({ x: 1 }) });
    const siege = siegeFictif();

    await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A);

    expect(siege.lots.flatMap((l) => l.operations)).toHaveLength(2);
    const isolee = await ligneDe(corrompue);
    expect(isolee.statut).toBe('a_examiner');
    expect(isolee.derniereErreur).toMatch(/[a-zé]{3,}/i);
    expect(isolee.derniereErreur).not.toMatch(/OperationError|stack|undefined/);
    expect(await base.outbox.count()).toBe(1);
  }, 15_000);

  it('A2 : une charge déchiffrée mais NON VALIDE localement est isolée de même', async () => {
    const invalide = await ecrireSession();
    await ecrireSessions(1);
    const ligne = await ligneDe(invalide);
    await base.outbox.update(ligne.opId, { charge: await coffre.chiffrer('pas un objet') });
    const siege = siegeFictif();

    await creerMoteurSync({ base, coffre, transport: siege.transport }).pousser(MISSION_A);

    expect(siege.lots.flatMap((l) => l.operations)).toHaveLength(1);
    expect((await ligneDe(invalide)).statut).toBe('a_examiner');
    expect((await ligneDe(invalide)).derniereErreur).not.toBeNull();
  });

  it('A1 : 429 / 502-504 arrivent au moteur en « hors_ligne » et ne comptent aucune tentative', async () => {
    await ecrireSessions(2);
    const transport: Pick<TransportSync, 'pousser'> = {
      pousser: () => Promise.resolve({ type: 'hors_ligne' }),
    };

    await creerMoteurSync({ base, coffre, transport }).pousser(MISSION_A);

    expect((await file()).every((o) => o.tentatives === 0)).toBe(true);
  });
});
