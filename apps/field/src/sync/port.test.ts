// =============================================================================
// TESTS DU PORT DE SYNC RÉEL — lot L6, incrément L6a « la montée ». ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis `LOT_L6.md` §3ter A (« L6a REMPLACE
// l'implémentation, ne redéfinit ni l'interface ni la fonction pure d'alerte »),
// §3bis (transport, §31-3), 05 §9.3 (« n réponse(s) arbitrée(s) »), 05 §9.8
// scénario 8, et l'interface DÉJÀ livrée `local/port-sync.ts` (`PortSync`,
// `EtatSyncMission`, `ResultatSync`, `StatutSync`, `evaluerAlerteSauvegarde`).
//
// ── API ATTENDUE DE `apps/field/src/sync/port.ts` (pour A25) ─────────────────
//   import type { PortSync, EtatSyncMission } from '../local/port-sync.js'; // jamais redéclarés
//   export interface DependancesPort {
//     readonly base: BaseLocale;
//     readonly coffre: Coffre;
//     readonly transport: Pick<TransportSync, 'pousser'>;  // ./transport.ts
//   }
//   export interface PortSyncReel extends PortSync {
//     /** Relit `meta` (dernier succès) et l'outbox, met à jour l'instantané de `etat()`. */
//     actualiser(missionId: string): Promise<EtatSyncMission>;
//   }
//   export function creerPortSync(deps: DependancesPort): PortSyncReel;
//   // Arbitrage A01 (2026-10-09) — `indisponible` reste UN statut ; le texte vient du port :
//   //   PortSyncReel.messageAffiche(missionId: string | null): string | null
//   //     · refresh refusé  → MESSAGE_RECONNEXION_REQUISE (transport.ts, texte exact)
//   //     · pas encore lu   → MESSAGE_VERIFICATION_SYNC
//   //     · `null` (appareil sans mission) → MESSAGE_AUCUNE_MISSION
//   //     · tout autre statut → null (l'écran n'a rien à ajouter)
//   export const MESSAGE_VERIFICATION_SYNC = 'Vérification de la synchronisation…';
//   export const MESSAGE_AUCUNE_MISSION = 'Aucune mission à synchroniser sur cet appareil.';
//
// Correspondance figée (StatutSync / ResultatSync.statut) :
//   push abouti, file vide      → 'a_jour'      / 'succes'
//   op en attente après succès  → 'en_attente'  (via actualiser)
//   jamais de succès connu       → 'jamais_synchronisee' (via actualiser)
//   réseau absent               → 'echec'       / 'echec'
//   refresh refusé (§31-3)      → 'indisponible' / 'indisponible' + MESSAGE_RECONNEXION_REQUISE
//
// Rouge attendu tant que `port.ts` / `transport.ts` n'existent pas — pour cette seule raison.
// Traçabilité : E7, E38 ; invariant 8 ; 05 §31-3.
// =============================================================================
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LotPush, ReponsePush, ResultatOp } from '../local/contrat-sync.js';
import { BaseLocale, CLES_META, ecrireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrireLocal } from '../local/ecriture.js';
import { chargeInterviewSchema } from '../local/formes.js';
import { enregistrerJetonRafraichissement, lireJetonRafraichissement } from '../local/jetons.js';
import { reinitialiserHorloge } from '../local/horloge.js';
import { evaluerAlerteSauvegarde, type PortSync } from '../local/port-sync.js';
import { MESSAGE_AUCUNE_MISSION, MESSAGE_VERIFICATION_SYNC, creerPortSync } from './port.js';
import {
  CHEMIN_PUSH,
  CHEMIN_REFRESH,
  MESSAGE_RECONNEXION_REQUISE,
  creerTransport,
  type ResultatTransport,
  type TransportSync,
} from './transport.js';

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const T0 = Date.parse('2026-10-09T08:15:00.000Z');
const T0_ISO = new Date(T0).toISOString();

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(41));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  reinitialiserHorloge();
  nomBase = `axion-test-port-${uuidv7()}`;
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

async function ecrireSession(): Promise<string> {
  const id = uuidv7();
  await ecrireLocal({
    entite: 'interview',
    id,
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
      startedAt: null,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: T0_ISO,
    },
  });
  return id;
}

function siege(
  regle: (rang: number) => ResultatOp = () => 'applied',
): Pick<TransportSync, 'pousser'> {
  let rang = 0;
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
    async pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>> {
      return {
        type: 'ok',
        donnees: {
          serverTime: T0_ISO,
          results: lot.operations.map((op) => {
            const result = regle(rang);
            rang += 1;
            return { opId: op.opId, result };
          }),
        },
      };
    },
  };
}

const injoignable: Pick<TransportSync, 'pousser'> = {
  // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
  async pousser() {
    return { type: 'hors_ligne' };
  },
};

// =============================================================================
// A. Il implémente PortSync, il ne le redéfinit pas
// =============================================================================
describe('port réel — implémente l’interface existante', () => {
  it('expose synchroniserMaintenant et etat (PortSync) et actualiser', () => {
    const port: PortSync = creerPortSync({ base, coffre, transport: siege() });
    expect(typeof port.synchroniserMaintenant).toBe('function');
    expect(typeof port.etat).toBe('function');
    expect(typeof creerPortSync({ base, coffre, transport: siege() }).actualiser).toBe('function');
  });

  it('port.ts importe PortSync de local/port-sync et ne redéclare ni l’interface ni l’alerte', () => {
    const source = readFileSync(new URL('./port.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/from '\.\.\/local\/port-sync\.js'/);
    expect(source).not.toMatch(/interface\s+(PortSync|EtatSyncMission|ResultatSync)\b/);
    expect(source).not.toMatch(/function\s+evaluerAlerteSauvegarde\b/);
  });
});

// =============================================================================
// B. synchroniserMaintenant → ResultatSync, etat → EtatSyncMission
// =============================================================================
describe('port réel — résultats et états', () => {
  it('jamais synchronisée : statut « jamais_synchronisee », compte RÉEL de la file', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siege() });

    const etat = await port.actualiser(MISSION);

    expect(etat.missionId).toBe(MISSION);
    expect(etat.statut).toBe('jamais_synchronisee');
    expect(etat.derniereSyncReussieLe).toBeNull();
    expect(etat.operationsEnAttente).toBe(1);
    expect(etat.operationsBloquees).toBe(0);
  });

  it('succès : « succes », opérations montées comptées, file vide, état « a_jour » sans actualiser', async () => {
    await ecrireSession();
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siege() });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('succes');
    expect(resultat.operationsMontees).toBe(2);
    expect(resultat.operationsRestantes).toBe(0);
    expect(resultat.message.length).toBeGreaterThan(0);
    const etat = port.etat(MISSION);
    expect(etat.statut).toBe('a_jour');
    expect(etat.derniereSyncReussieLe).not.toBeNull();
    expect(etat.operationsEnAttente).toBe(0);
    expect(etat.alerte.declenchee).toBe(false);
  });

  it('après un succès, une nouvelle saisie : « en_attente » une fois actualisé', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siege() });
    await port.synchroniserMaintenant(MISSION);
    await ecrireSession();

    const etat = await port.actualiser(MISSION);

    expect(etat.statut).toBe('en_attente');
    expect(etat.operationsEnAttente).toBe(1);
  });

  it('superseded : le message dit « n réponse(s) arbitrée(s) » (05 §9.3)', async () => {
    await ecrireSession();
    await ecrireSession();
    const port = creerPortSync({
      base,
      coffre,
      transport: siege((rang) => (rang === 0 ? 'superseded' : 'applied')),
    });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('succes');
    expect(resultat.message).toMatch(/1 réponse.{0,3} arbitrée/);
  });

  it('forbidden : l’op bloquée reste visible dans etat().operationsBloquees', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siege(() => 'forbidden') });

    await port.synchroniserMaintenant(MISSION);
    const etat = await port.actualiser(MISSION);

    expect(etat.operationsBloquees).toBe(1);
    expect(etat.operationsEnAttente).toBe(0);
  });

  it('réseau absent : « echec », rien de monté, la file réelle est comptée', async () => {
    await ecrireSession();
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: injoignable });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('echec');
    expect(resultat.operationsMontees).toBe(0);
    expect(resultat.operationsRestantes).toBe(2);
    expect(resultat.message.length).toBeGreaterThan(0);
    expect(port.etat(MISSION).statut).toBe('echec');
    expect(await base.outbox.count()).toBe(2);
  });
});

// =============================================================================
// C. Scénario §9.8 n°8 de bout en bout (port + transport réel, fetch factice)
// =============================================================================
describe('port réel — scénario §9.8 n°8 : refresh expiré en mission longue', () => {
  function fetchRefuse(refresh: 'refuse' | 'reseau') {
    return vi.fn((entree: RequestInfo | URL) => {
      const url =
        typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
      if (refresh === 'reseau' && url.endsWith(CHEMIN_REFRESH)) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      if (url.endsWith(CHEMIN_PUSH) || url.endsWith(CHEMIN_REFRESH)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'NON_AUTHENTIFIE', message: 'Session expirée.' } }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      return Promise.reject(new Error(`banc : appel inattendu ${url}`));
    }) as unknown as typeof fetch;
  }

  beforeEach(async () => {
    await enregistrerJetonRafraichissement(base, coffre, {
      valeur: 'refresh-factice-expire',
      expireLe: T0_ISO,
      enregistreLe: '2026-09-09T08:15:00.000Z',
    });
  });

  it('refresh refusé : « indisponible » + message §31-3, la file intacte, la collecte CONTINUE', async () => {
    const avant = await ecrireSession();
    const transport = creerTransport({ fetch: fetchRefuse('refuse'), base, coffre });
    transport.definirJetonAcces('acces-factice-expire');
    const port = creerPortSync({ base, coffre, transport });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('indisponible');
    expect(resultat.message).toBe(MESSAGE_RECONNEXION_REQUISE);
    expect(resultat.operationsMontees).toBe(0);
    expect(port.etat(MISSION).statut).toBe('indisponible');

    // La saisie ne dépend jamais du serveur : on écrit, on relit, rien n'est perdu.
    await ecrireSession();
    expect(await base.outbox.count()).toBe(2);
    expect(await base.interviews.get(avant)).toBeDefined();
    const ligne = await base.interviews.get(avant);
    if (ligne === undefined) throw new Error('banc : ligne attendue');
    await expect(coffre.dechiffrer(ligne.charge, chargeInterviewSchema)).resolves.toMatchObject({
      conductedBy: AUDITEUR,
    });
  });

  it('réseau absent au moment du refresh : « echec », le refresh est CONSERVÉ', async () => {
    await ecrireSession();
    const transport = creerTransport({ fetch: fetchRefuse('reseau'), base, coffre });
    transport.definirJetonAcces('acces-factice-expire');
    const port = creerPortSync({ base, coffre, transport });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('echec');
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe('refresh-factice-expire');
    expect(await base.outbox.count()).toBe(1);
  });
});

// =============================================================================
// D. Branches : état non lu, panne locale, messages de rejet et d'erreur
// =============================================================================
describe('port réel — avant toute lecture, panne locale, messages', () => {
  it('etat() avant toute lecture : rien de mesuré (null), jamais « a_jour », et pas de faux « rien à signaler »', () => {
    const port = creerPortSync({ base, coffre, transport: siege() });

    const etat = port.etat(MISSION);

    expect(etat.missionId).toBe(MISSION);
    expect(etat.statut).not.toBe('a_jour');
    expect(etat.derniereSyncReussieLe).toBeNull();
    expect(etat.operationsEnAttente).toBeNull();
    expect(etat.operationsBloquees).toBeNull();
    // « Je ne sais pas » n'est pas « tout va bien » : le verdict est celui de la
    // fonction pure sur ce qui est su (rien), pas une alerte éteinte en dur.
    expect(etat.alerte).toEqual(evaluerAlerteSauvegarde(null, null));
  });

  it('panne locale pendant la sync (appareil sans identifiant) : « echec » en français, file intacte, état « echec »', async () => {
    await ecrireSession();
    await base.meta.delete(CLES_META.appareil);
    const port = creerPortSync({ base, coffre, transport: siege() });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('echec');
    expect(resultat.operationsMontees).toBe(0);
    expect(resultat.message).toMatch(/[a-zé]{3,}/i);
    expect(resultat.message).not.toMatch(/Error|undefined|stack/);
    expect(await base.outbox.count()).toBe(1);
    expect(port.etat(MISSION).statut).toBe('echec');
    expect(port.etat(MISSION).operationsEnAttente).toBe(1);
  });

  it('une op rejetée : le message le dit (« 1 opération rejetée ») et la sync n’est pas un succès', async () => {
    await ecrireSession();
    await ecrireSession();
    const port = creerPortSync({
      base,
      coffre,
      transport: siege((rang) => (rang === 0 ? 'forbidden' : 'applied')),
    });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('echec');
    expect(resultat.message).toMatch(/1 opération rejetée/);
    expect(port.etat(MISSION).statut).toBe('echec');
  });

  it('des ops en erreur : le message le dit au pluriel (« 2 opérations en erreur »)', async () => {
    await ecrireSession();
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siege(() => 'error') });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('echec');
    expect(resultat.message).toMatch(/2 opérations en erreur/);
    expect(resultat.operationsRestantes).toBe(2);
  });

  it('refus du lot par le siège : « echec », le motif du siège est rendu à l’auditeur', async () => {
    await ecrireSession();
    const transport: Pick<TransportSync, 'pousser'> = {
      pousser: () =>
        Promise.resolve({ type: 'refus', statut: 400, message: 'Lot refusé (motif fictif).' }),
    };
    const port = creerPortSync({ base, coffre, transport });

    const resultat = await port.synchroniserMaintenant(MISSION);

    expect(resultat.statut).toBe('echec');
    expect(resultat.message).toBe('Lot refusé (motif fictif).');
  });
});

// =============================================================================
// E. Arbitrage A01 (2026-10-09) — les trois textes de `indisponible`
// =============================================================================
describe('port réel — un statut « indisponible », trois messages exacts', () => {
  it('les constantes portent le texte arbitré, mot pour mot', () => {
    expect(MESSAGE_VERIFICATION_SYNC).toBe('Vérification de la synchronisation…');
    expect(MESSAGE_AUCUNE_MISSION).toBe('Aucune mission à synchroniser sur cet appareil.');
    expect(MESSAGE_RECONNEXION_REQUISE).toBe(
      'Reconnexion requise pour synchroniser. Vos saisies restent en sécurité sur cet appareil.',
    );
  });

  it('état pas encore lu : statut « indisponible », message « Vérification de la synchronisation… »', () => {
    const port = creerPortSync({ base, coffre, transport: siege() });

    expect(port.etat(MISSION).statut).toBe('indisponible');
    expect(port.messageAffiche(MISSION)).toBe(MESSAGE_VERIFICATION_SYNC);
  });

  it('appareil sans mission : « Aucune mission à synchroniser sur cet appareil. »', () => {
    const port = creerPortSync({ base, coffre, transport: siege() });

    expect(port.messageAffiche(null)).toBe(MESSAGE_AUCUNE_MISSION);
  });

  it('refresh refusé : « indisponible » et le message de reconnexion, pas celui de la vérification', async () => {
    await ecrireSession();
    const port = creerPortSync({
      base,
      coffre,
      transport: {
        pousser: () =>
          Promise.resolve({ type: 'reconnexion_requise', message: MESSAGE_RECONNEXION_REQUISE }),
      },
    });

    await port.synchroniserMaintenant(MISSION);

    expect(port.etat(MISSION).statut).toBe('indisponible');
    expect(port.messageAffiche(MISSION)).toBe(MESSAGE_RECONNEXION_REQUISE);
  });

  it('une fois lu, sans reconnexion requise : aucun message d’indisponibilité', async () => {
    await ecrireSession();
    const port = creerPortSync({ base, coffre, transport: siege() });

    await port.actualiser(MISSION);

    expect(port.etat(MISSION).statut).not.toBe('indisponible');
    expect(port.messageAffiche(MISSION)).toBeNull();
  });
});
