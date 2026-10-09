// =============================================================================
// TESTS DU MOTEUR — LES PIÈCES APRÈS LES DONNÉES — lot L6c-1. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis 05 §9.6 (« Upload séparé du push JSON, APRÈS
// les données […] Une réponse peut être synchronisée avant sa photo ;
// l'attachement porte son propre statut »), 05 §9.8 scénario 6 (le mécanisme de
// l'envoi des photos en file) et `LOT_L6.md` §C.3 (« M `sync/moteur.ts` : les
// pièces jointes APRÈS les données »).
//
// ── CE QUE CES TESTS FIGENT DANS `moteur.ts` ────────────────────────────────
//   · `creerMoteurSync({ base, coffre, transport })` où `transport` porte AUSSI
//     les trois méthodes de `TransportPieces` (chunks.ts) ;
//   · `pousser(missionId)` draine d'abord TOUTE la montée JSON de la mission,
//     PUIS envoie les pièces « a_envoyer » de cette mission ;
//   · une pièce ne part que si l'op de création de sa ligne `attachments` a été
//     acquittée `applied`/`duplicate` — c'est-à-dire qu'AUCUNE op de cette pièce
//     ne reste dans `outbox` (en attente, rejetée, à examiner) ;
//   · montée hors ligne → aucune pièce ne part, rien n'est perdu ;
//   · un échec d'envoi de pièce ne compte JAMAIS comme un échec d'op JSON.
// Les noms côté pièces sont ceux de `chunks.test.ts` / `local/octets.test.ts`.
//
// Rouge attendu tant que `local/octets.ts` et `sync/chunks.ts` n'existent pas.
// Traçabilité : E7, E38 ; invariants 1 et 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LotPush, ReponsePush, ResultatOp } from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import { ecrirePieceAvecOctets, lireOctetsPiece, lireStatutEnvoi } from '../local/octets.js';
import { creerMoteurSync } from './moteur.js';
import type { ResultatTransport } from './transport.js';
import {
  AUDITEUR_PIECES,
  AUTRE_MISSION_PIECES,
  HORODATAGE_PIECES,
  MISSION_PIECES,
  creerSiegePiecesFictif,
  demandePhoto,
  octetsVaries,
} from './fixtures/pieces.js';

const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(73));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
}, 20_000);

beforeEach(async () => {
  nomBase = `axion-test-moteur-pieces-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
});

afterEach(async () => {
  base.close();
  await Dexie.delete(nomBase);
});

async function ecrireSession(missionId: string = MISSION_PIECES): Promise<string> {
  const id = uuidv7();
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
      conductedBy: AUDITEUR_PIECES,
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
      clientCreatedAt: HORODATAGE_PIECES,
    },
  });
  return id;
}

async function ecrirePhoto(
  taille: number,
  options: { missionId?: string; interviewId?: string | null } = {},
): Promise<string> {
  const id = uuidv7();
  const octets = octetsVaries(taille, taille);
  await ecrirePieceAvecOctets(demandePhoto(id, octets, options), octets);
  return id;
}

type Entree = { readonly quoi: 'push' } | { readonly quoi: 'piece'; readonly id: string };

/**
 * Un siège fictif complet : la montée JSON (règle par entité) ET les trois routes
 * de pièces, avec UN journal commun pour juger de l'ordre.
 */
function siegeComplet(
  options: {
    regle?: (entiteId: string) => ResultatOp;
    pushHorsLigne?: boolean;
    piecesHorsLigne?: boolean;
  } = {},
) {
  const journal: Entree[] = [];
  const pieces = creerSiegePiecesFictif({ horsLigne: options.piecesHorsLigne === true });
  const transport = {
    // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
    async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
      journal.push({ quoi: 'push' });
      if (options.pushHorsLigne === true) return { type: 'hors_ligne' };
      return {
        type: 'ok',
        donnees: {
          serverTime: HORODATAGE_PIECES,
          results: lot.operations.map((op) => {
            const result = options.regle?.(op.entityId) ?? 'applied';
            return {
              opId: op.opId,
              result,
              ...(result === 'forbidden' || result === 'error'
                ? { message: 'Refus fictif du siège.' }
                : {}),
            };
          }),
        },
      };
    },
    statutPiece(id: string) {
      journal.push({ quoi: 'piece', id });
      return pieces.transport.statutPiece(id);
    },
    envoyerMorceau(id: string, index: number, octets: Uint8Array) {
      journal.push({ quoi: 'piece', id });
      return pieces.transport.envoyerMorceau(id, index, octets);
    },
    terminerPiece(id: string, corps: { sha256: string; chunks: number }) {
      journal.push({ quoi: 'piece', id });
      return pieces.transport.terminerPiece(id, corps);
    },
  };
  return {
    transport,
    journal,
    pieces,
    touchees: (id: string) => journal.some((e) => e.quoi === 'piece' && e.id === id),
  };
}

function moteur(siege: ReturnType<typeof siegeComplet>) {
  return creerMoteurSync({ base, coffre, transport: siege.transport });
}

// =============================================================================
describe('moteur — les pièces partent APRÈS la montée JSON (05 §9.6)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : envoyer la photo dès que sa ligne est lue
  // dans le lot — le siège reçoit des octets pour une pièce qu'il ne connaît pas
  // encore (404 de propriété, §9.9 étendue) et la pièce passe « en_echec ».
  it('@critique tous les push de la mission précèdent le premier appel de pièce', async () => {
    for (let i = 0; i < 120; i += 1) await ecrireSession(); // > 1 lot de 100
    const photo = await ecrirePhoto(2048);
    const siege = siegeComplet();
    await moteur(siege).pousser(MISSION_PIECES);

    const dernierPush = siege.journal.map((e) => e.quoi).lastIndexOf('push');
    const premierePiece = siege.journal.findIndex((e) => e.quoi === 'piece');
    expect(dernierPush).toBeGreaterThanOrEqual(1);
    expect(premierePiece).toBeGreaterThan(dernierPush);
    expect(await lireStatutEnvoi(base, photo)).toBe('envoyee');
    expect(siege.pieces.assemble(photo)).toBeDefined();
  });

  it('@critique une pièce dont l’op de création est `duplicate` part aussi', async () => {
    const photo = await ecrirePhoto(512);
    const siege = siegeComplet({ regle: () => 'duplicate' });
    await moteur(siege).pousser(MISSION_PIECES);
    expect(await lireStatutEnvoi(base, photo)).toBe('envoyee');
  });

  it('une pièce dont la ligne a été acquittée à un passage PRÉCÉDENT part au suivant', async () => {
    const photo = await ecrirePhoto(512);
    const horsLignePieces = siegeComplet({ piecesHorsLigne: true });
    await moteur(horsLignePieces).pousser(MISSION_PIECES);
    expect(await base.outbox.count()).toBe(0);
    expect(await lireStatutEnvoi(base, photo)).toBe('a_envoyer');

    const siege = siegeComplet();
    await moteur(siege).pousser(MISSION_PIECES);
    expect(siege.journal.filter((e) => e.quoi === 'push')).toHaveLength(0);
    expect(await lireStatutEnvoi(base, photo)).toBe('envoyee');
  });
});

describe('moteur — une pièce ne part que si sa ligne est acquittée', () => {
  for (const refus of ['forbidden', 'error'] as const) {
    it(`@critique op de création « ${refus} » : aucun octet ne part, la pièce reste à envoyer`, async () => {
      const photo = await ecrirePhoto(1024);
      const siege = siegeComplet({ regle: (entiteId) => (entiteId === photo ? refus : 'applied') });
      await moteur(siege).pousser(MISSION_PIECES);
      expect(siege.touchees(photo)).toBe(false);
      expect(await lireStatutEnvoi(base, photo)).toBe('a_envoyer');
      expect(await lireOctetsPiece(base, coffre, photo)).not.toBeNull();
    });
  }

  it('deux photos : celle acquittée part, celle refusée attend', async () => {
    const acceptee = await ecrirePhoto(700);
    const refusee = await ecrirePhoto(800);
    const siege = siegeComplet({
      regle: (entiteId) => (entiteId === refusee ? 'error' : 'applied'),
    });
    await moteur(siege).pousser(MISSION_PIECES);
    expect(await lireStatutEnvoi(base, acceptee)).toBe('envoyee');
    expect(siege.touchees(refusee)).toBe(false);
  });
});

describe('moteur — une réponse avant sa photo ; hors ligne, rien ne part ni ne se perd', () => {
  it('@critique la session monte même si l’envoi de sa photo échoue (hors ligne pièces)', async () => {
    const session = await ecrireSession();
    const photo = await ecrirePhoto(1024, { interviewId: session });
    const siege = siegeComplet({ piecesHorsLigne: true });
    const bilan = await moteur(siege).pousser(MISSION_PIECES);
    expect(bilan.operationsAcquittees).toBe(2);
    expect(bilan.enErreur).toBe(0);
    expect(bilan.rejetees).toBe(0);
    expect(await base.outbox.count()).toBe(0);
    expect(await lireStatutEnvoi(base, photo)).toBe('a_envoyer');
  });

  it('@critique montée hors ligne : AUCUN appel de pièce, lignes, ops et octets intacts', async () => {
    await ecrireSession();
    const photo = await ecrirePhoto(2048);
    const opsAvant = await base.outbox.count();
    const siege = siegeComplet({ pushHorsLigne: true });
    const bilan = await moteur(siege).pousser(MISSION_PIECES);
    expect(bilan.statut).toBe('hors_ligne');
    expect(siege.journal.some((e) => e.quoi === 'piece')).toBe(false);
    expect(await base.outbox.count()).toBe(opsAvant);
    expect(await base.attachments.get(photo)).toBeDefined();
    expect(await lireOctetsPiece(base, coffre, photo)).not.toBeNull();
    expect(await lireStatutEnvoi(base, photo)).toBe('a_envoyer');
  });

  it('les pièces d’une autre mission ne partent pas avec celle-ci', async () => {
    const autre = await ecrirePhoto(512, { missionId: AUTRE_MISSION_PIECES });
    const siege = siegeComplet();
    await moteur(siege).pousser(MISSION_PIECES);
    expect(siege.touchees(autre)).toBe(false);
  });
});
