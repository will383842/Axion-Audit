// =============================================================================
// TESTS DU BACKOFF — lot L6, incrément L6b « la descente ». ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) depuis 05 §9.3
// (« `error` : backoff exponentiel (max 1 min) + compteur ; au 10e échec →
// statut “à examiner” visible »), `LOT_L6.md` §3ter C.2 (« backoff BORNÉ À 60 s,
// prouvé sur horloge simulée · 10e échec → “à examiner” VISIBLE ») et
// `DECISIONS.md` [L6a] (comptage vers ECHECS_AVANT_EXAMEN : refus du lot = +1 par
// op ; 401, 429, 502-504 et coupure réseau = 0).
//
// ── API ATTENDUE DE `apps/field/src/sync/backoff.ts` (pour A25) ──────────────
//   export const DELAI_BACKOFF_INITIAL_MS: number;   // > 0 et < DELAI_BACKOFF_MAX_MS
//   export const DELAI_BACKOFF_MAX_MS = 60_000;      // 05 §9.3 : « max 1 min »
//   /** Délai avant la prochaine tentative après `echecsConsecutifs` échecs (≥ 1). */
//   export function delaiBackoffMs(echecsConsecutifs: number): number;
//   export interface Backoff {
//     /** Enregistre un échec ; rend le délai à attendre avant la tentative suivante. */
//     echec(): number;
//     /** Un passage réussi : le compteur repart de zéro. */
//     succes(): void;
//     readonly echecsConsecutifs: number;
//   }
//   export function creerBackoff(): Backoff;
//
// Le backoff RYTHME les tentatives ; il ne compte PAS les échecs d'op. Le
// passage « à examiner » reste au moteur (une op, ECHECS_AVANT_EXAMEN réponses
// `error`) : le dernier bloc de ce fichier vérifie que les deux restent cohérents
// vus du port (ce que l'écran lira).
//
// Rouge attendu tant que `backoff.ts` n'existe pas — pour cette seule raison.
// Traçabilité : E7 (remontée continue) ; invariants 7 et 8.
// =============================================================================
/* eslint-disable @typescript-eslint/require-await -- faux transports et faux ports : signatures asynchrones du contrat, rien à attendre. */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ECHECS_AVANT_EXAMEN, type LotPush, type ReponsePush } from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import {
  DELAI_BACKOFF_INITIAL_MS,
  DELAI_BACKOFF_MAX_MS,
  creerBackoff,
  delaiBackoffMs,
} from './backoff.js';
import { creerPortSync } from './port.js';
import type { ResultatTransport } from './transport.js';

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const HORODATAGE = '2026-10-09T08:15:00.000Z';

describe('backoff — exponentiel, BORNÉ à 60 s (05 §9.3)', () => {
  it('la borne est exactement 60 s, et le premier délai est strictement positif et plus court', () => {
    expect(DELAI_BACKOFF_MAX_MS).toBe(60_000);
    expect(DELAI_BACKOFF_INITIAL_MS).toBeGreaterThan(0);
    expect(DELAI_BACKOFF_INITIAL_MS).toBeLessThan(DELAI_BACKOFF_MAX_MS);
    expect(delaiBackoffMs(1)).toBe(DELAI_BACKOFF_INITIAL_MS);
  });

  it('chaque échec DOUBLE le délai jusqu’à la borne, puis le délai reste à 60 s', () => {
    let precedent = delaiBackoffMs(1);
    let borneAtteinte = false;
    for (let n = 2; n <= 30; n += 1) {
      const delai = delaiBackoffMs(n);
      expect(delai).toBeLessThanOrEqual(DELAI_BACKOFF_MAX_MS);
      if (borneAtteinte) {
        expect(delai).toBe(DELAI_BACKOFF_MAX_MS);
      } else {
        expect(delai).toBe(Math.min(precedent * 2, DELAI_BACKOFF_MAX_MS));
        borneAtteinte = delai === DELAI_BACKOFF_MAX_MS;
      }
      precedent = delai;
    }
    // Contrôle d'anti-vacuité : la borne est bien ATTEINTE, pas seulement respectée.
    expect(borneAtteinte).toBe(true);
  });

  it('un très grand nombre d’échecs ne déborde jamais (ni Infinity, ni NaN) : 60 s', () => {
    for (const n of [64, 1_000, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      const delai = delaiBackoffMs(n);
      expect(Number.isFinite(delai)).toBe(true);
      expect(delai).toBe(DELAI_BACKOFF_MAX_MS);
    }
  });

  it('creerBackoff : les échecs s’enchaînent selon delaiBackoffMs ; un succès remet à zéro', () => {
    const backoff = creerBackoff();
    expect(backoff.echecsConsecutifs).toBe(0);
    const delais = Array.from({ length: 12 }, () => backoff.echec());
    expect(delais).toEqual(Array.from({ length: 12 }, (_, i) => delaiBackoffMs(i + 1)));
    expect(backoff.echecsConsecutifs).toBe(12);
    expect(Math.max(...delais)).toBe(DELAI_BACKOFF_MAX_MS);

    backoff.succes();
    expect(backoff.echecsConsecutifs).toBe(0);
    expect(backoff.echec()).toBe(DELAI_BACKOFF_INITIAL_MS);
  });

  it('deux backoffs sont indépendants (aucun état de module partagé)', () => {
    const a = creerBackoff();
    const b = creerBackoff();
    a.echec();
    a.echec();
    a.echec();
    expect(b.echec()).toBe(DELAI_BACKOFF_INITIAL_MS);
    expect(a.echecsConsecutifs).toBe(3);
  });
});

// =============================================================================
// Le 10e échec — cohérence du backoff et du compteur d'op, vue du PORT
// =============================================================================
let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(61));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  nomBase = `axion-test-backoff-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  installerContexteLocal({ base, coffre });
  await ecrireMeta(base, CLES_META.appareil, APPAREIL);
});

afterEach(async () => {
  base.close();
  await Dexie.delete(nomBase);
});

async function ecrireSession(): Promise<void> {
  await ecrireLocal({
    entite: 'interview',
    id: uuidv7(),
    missionId: MISSION,
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
      startedAt: HORODATAGE,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: HORODATAGE,
    },
  });
}

/** Le siège répond `error` à chaque op, avec un message français. */
function transportEnErreur() {
  return {
    async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
      return {
        type: 'ok',
        donnees: {
          serverTime: HORODATAGE,
          results: lot.operations.map((op) => ({
            opId: op.opId,
            result: 'error' as const,
            message: 'Le siège n’a pas pu appliquer cette opération (fictif).',
          })),
        },
      };
    },
    async tirer() {
      return { type: 'hors_ligne' as const };
    },
  };
}

describe('backoff — le 10e échec d’une op la rend « à examiner », VISIBLE au port', () => {
  it('@critique 9 échecs : encore en attente ; le 10e : « à examiner », compté dans les bloquées, rien de supprimé', async () => {
    expect(ECHECS_AVANT_EXAMEN).toBe(10);
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: transportEnErreur() });

    for (let i = 1; i < ECHECS_AVANT_EXAMEN; i += 1) await port.synchroniserMaintenant(MISSION);
    const [avant] = await base.outbox.toArray();
    expect(avant?.statut).toBe('en_attente');
    expect(avant?.tentatives).toBe(ECHECS_AVANT_EXAMEN - 1);

    await port.synchroniserMaintenant(MISSION);
    const lignes = await base.outbox.toArray();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.statut).toBe('a_examiner');
    expect(lignes[0]?.tentatives).toBe(ECHECS_AVANT_EXAMEN);
    expect(lignes[0]?.derniereErreur).toMatch(/[a-zéèàç]/);

    const etat = await port.actualiser(MISSION);
    expect(etat.operationsBloquees).toBe(1);
    expect(etat.statut).toBe('echec');
  });
});
