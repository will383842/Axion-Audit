// =============================================================================
// TESTS DE LA PERSISTANCE ET DU QUOTA — lot L5, incrément L5a.
//
// Écrits par A26 depuis 05 §31-2 (« si la persistance est refusée par le
// navigateur, la mission N'EST PAS embarquée et l'écran guide l'utilisateur » ;
// « vérification du quota (`storage.estimate()`) ») et 03 §22.1 (alerte quota),
// contre les signatures/JSDoc exportées de `stockage.ts` et `embarquement.ts`.
//
// `navigator.storage` est SIMULÉ : le test décide ce que le navigateur répond,
// y compris « l'API n'existe pas » — le cas Safari privé / WebView que le pack
// ne nomme pas et que l'implémentation ne doit pas arrondir en oui ou en non.
//
// Traçabilité : E6 (hors ligne total — sans persistance accordée, pas de
// collecte hors ligne fiable) · E38 (sauvegarde terrain).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseLocale } from './base.js';
import {
  embarquerMission,
  marquerMissionEmbarquee,
  missionEmbarquee,
  persistanceAccordee,
  preparerStockagePourMission,
} from './embarquement.js';
import {
  SEUIL_ESPACE_CRITIQUE,
  SEUIL_ESPACE_TENDU,
  alerteEspace,
  demanderPersistance,
  evaluerStockage,
  exigerPersistance,
  type EtatStockage,
} from './stockage.js';

const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const GIO = 1024 * 1024 * 1024;

/** Simule `navigator.storage`. `undefined` pour une méthode = API absente. */
function simulerNavigateur(storage: Partial<StorageManager> | undefined): void {
  vi.stubGlobal('navigator', storage === undefined ? {} : { storage });
}

function estimation(ratio: number, quota = 10 * GIO) {
  return { quota, usage: Math.round(quota * ratio) };
}

const bases: BaseLocale[] = [];
let compteur = 0;
async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-stockage-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// =============================================================================
// A. demanderPersistance / evaluerStockage — ce que le navigateur dit
// =============================================================================
describe('stockage — lecture du navigateur', () => {
  it('API absente ⇒ demanderPersistance() rend null (ni oui ni non)', async () => {
    simulerNavigateur(undefined);
    expect(await demanderPersistance()).toBeNull();
  });

  it('persist() accordée ⇒ true ; refusée ⇒ false', async () => {
    simulerNavigateur({ persist: () => Promise.resolve(true) });
    expect(await demanderPersistance()).toBe(true);
    simulerNavigateur({ persist: () => Promise.resolve(false) });
    expect(await demanderPersistance()).toBe(false);
  });

  it('evaluerStockage sans API ⇒ niveau `inconnu`, tout à null', async () => {
    simulerNavigateur(undefined);
    const etat = await evaluerStockage();
    expect(etat.niveau).toBe('inconnu');
    expect(etat.ratio).toBeNull();
    expect(etat.quotaOctets).toBeNull();
    expect(etat.utiliseOctets).toBeNull();
    expect(etat.persistant).toBeNull();
  });

  it.each([
    [0.1, 'ok'],
    [SEUIL_ESPACE_TENDU - 0.01, 'ok'],
    [SEUIL_ESPACE_TENDU, 'tendu'],
    [SEUIL_ESPACE_CRITIQUE - 0.01, 'tendu'],
    [SEUIL_ESPACE_CRITIQUE, 'critique'],
    [0.99, 'critique'],
  ] as const)('ratio %s ⇒ niveau « %s »', async (ratio, niveau) => {
    simulerNavigateur({
      estimate: () => Promise.resolve(estimation(ratio)),
      persisted: () => Promise.resolve(true),
    });
    const etat = await evaluerStockage();
    expect(etat.niveau).toBe(niveau);
    expect(etat.ratio).toBeCloseTo(ratio, 2);
    expect(etat.quotaOctets).toBe(10 * GIO);
    expect(etat.persistant).toBe(true);
  });

  it('estimate() sans quota exploitable ⇒ ratio null et niveau `inconnu`', async () => {
    simulerNavigateur({ estimate: () => Promise.resolve({}) });
    const etat = await evaluerStockage();
    expect(etat.ratio).toBeNull();
    expect(etat.niveau).toBe('inconnu');
  });
});

// =============================================================================
// B. exigerPersistance — la porte d'entrée du 05 §31-2
// =============================================================================
describe('stockage — exigerPersistance (05 §31-2)', () => {
  it('@critique persistance accordée ⇒ verdict `accordee: true` avec l’état mesuré', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve(estimation(0.2)),
    });
    const verdict = await exigerPersistance();
    expect(verdict.accordee).toBe(true);
    if (verdict.accordee) expect(verdict.etat.niveau).toBe('ok');
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un refus du navigateur transformé en simple
  // avertissement — la mission serait embarquée sur un stockage que le
  // navigateur peut purger à tout moment, avec des réponses non synchronisées.
  it('@critique refus du navigateur ⇒ `accordee: false`, motif nommé, guidage en français avec une ACTION', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(false),
      estimate: () => Promise.resolve(estimation(0.2)),
    });
    const verdict = await exigerPersistance();
    expect(verdict.accordee).toBe(false);
    if (!verdict.accordee) {
      expect(verdict.motif).toBe('refusee_par_le_navigateur');
      expect(verdict.guidage).toMatch(/[a-zéèêàç]/);
      expect(verdict.guidage.length).toBeGreaterThan(20);
    }
  });

  it('API absente ⇒ refus motivé `api_indisponible` (jamais arrondi en « accordée »)', async () => {
    simulerNavigateur(undefined);
    const verdict = await exigerPersistance();
    expect(verdict.accordee).toBe(false);
    if (!verdict.accordee) expect(verdict.motif).toBe('api_indisponible');
  });
});

// =============================================================================
// C. alerteEspace — une seule voix pour le cockpit et l'embarquement
// =============================================================================
describe('stockage — alerteEspace (03 §22.1)', () => {
  function etat(niveau: EtatStockage['niveau'], ratio: number | null): EtatStockage {
    return { persistant: true, quotaOctets: 10 * GIO, utiliseOctets: null, ratio, niveau };
  }

  it('niveau ok ou inconnu ⇒ rien à dire', () => {
    expect(alerteEspace(etat('ok', 0.3))).toBeNull();
    expect(alerteEspace(etat('inconnu', null))).toBeNull();
  });

  it('niveau tendu ⇒ message en français ; niveau critique ⇒ message DIFFÉRENT et plus pressant', () => {
    const tendu = alerteEspace(etat('tendu', 0.85));
    const critique = alerteEspace(etat('critique', 0.97));
    expect(tendu).toMatch(/[a-zéèêàç]/);
    expect(critique).toMatch(/[a-zéèêàç]/);
    expect(tendu).not.toEqual(critique);
  });
});

// =============================================================================
// D. embarquement — refus de persist() ⇒ mission NON embarquée
// =============================================================================
describe('embarquement — preparerStockagePourMission / missionEmbarquee (05 §31-2)', () => {
  it('@critique refus de persist() ⇒ statut `refuse`, motif `persistance_refusee`, et la mission N’EST PAS marquée embarquée', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(false),
      estimate: () => Promise.resolve(estimation(0.2)),
    });
    const base = await nouvelleBase();
    const resultat = await preparerStockagePourMission(base, MISSION_ID);
    expect(resultat.statut).toBe('refuse');
    if (resultat.statut === 'refuse') {
      expect(resultat.motif).toBe('persistance_refusee');
      expect(resultat.guidage).toMatch(/[a-zéèêàç]/);
    }
    expect(resultat.persistance).toBe('refusee');
    expect(await missionEmbarquee(base, MISSION_ID)).toBe(false);
    expect(await persistanceAccordee(base, MISSION_ID)).toBe(false);
  });

  it('espace critique ⇒ refus `espace_insuffisant`, même si la persistance est accordée', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve(estimation(0.97)),
    });
    const base = await nouvelleBase();
    const resultat = await preparerStockagePourMission(base, MISSION_ID);
    expect(resultat.statut).toBe('refuse');
    if (resultat.statut === 'refuse') expect(resultat.motif).toBe('espace_insuffisant');
    expect(await missionEmbarquee(base, MISSION_ID)).toBe(false);
  });

  // Contrat amendé sur revue A29 (B4) : « embarquée » = DONNÉES présentes. Sans
  // pull, l'étape 1 ne pose que la marque de PERSISTANCE, et le dit.
  it('@critique persistance accordée et espace ok ⇒ persistance `accordee` marquée, mais la mission N’EST PAS « embarquée » tant qu’aucun pull n’a écrit ses données', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve(estimation(0.5)),
    });
    const base = await nouvelleBase();
    const resultat = await preparerStockagePourMission(base, MISSION_ID);
    expect(resultat.persistance).toBe('accordee');
    expect(resultat.statut).toBe('refuse');
    if (resultat.statut === 'refuse') expect(resultat.motif).toBe('premier_pull_indisponible');
    expect(await persistanceAccordee(base, MISSION_ID)).toBe(true);
    expect(await persistanceAccordee(base, '0191e2a0-0000-7000-8000-00000000f2de')).toBe(false);
    expect(await missionEmbarquee(base, MISSION_ID)).toBe(false);
  });

  it('@critique marquerMissionEmbarquee (réservée au pull L6a) pose la marque « données présentes » — et REFUSE sans persistance accordée', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve(estimation(0.5)),
    });
    const base = await nouvelleBase();
    // Sans persistance : refus de mentir.
    expect(await marquerMissionEmbarquee(base, MISSION_ID)).toBe(false);
    expect(await missionEmbarquee(base, MISSION_ID)).toBe(false);
    // Avec persistance : la marque se pose.
    await preparerStockagePourMission(base, MISSION_ID);
    expect(await marquerMissionEmbarquee(base, MISSION_ID)).toBe(true);
    expect(await missionEmbarquee(base, MISSION_ID)).toBe(true);
    expect(await missionEmbarquee(base, '0191e2a0-0000-7000-8000-00000000f2de')).toBe(false);
  });

  it('espace tendu (non critique) n’empêche pas la persistance d’être accordée', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve(estimation(0.85)),
    });
    const base = await nouvelleBase();
    const resultat = await preparerStockagePourMission(base, MISSION_ID);
    expect(resultat.persistance).toBe('accordee');
    expect(resultat.etatStockage.niveau).toBe('tendu');
    expect(await persistanceAccordee(base, MISSION_ID)).toBe(true);
  });

  // Le port inerte ne ment pas (LOT_L5.md §3.6) ; l'embarquement non plus : tant
  // que le premier pull n'existe pas, `embarquerMission` REFUSE, explicitement.
  it('@critique embarquerMission refuse `premier_pull_indisponible` tant que L6 n’a pas livré — jamais un faux succès', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve(estimation(0.5)),
    });
    const base = await nouvelleBase();
    const resultat = await embarquerMission(base, MISSION_ID);
    expect(resultat.statut).toBe('refuse');
    if (resultat.statut === 'refuse') {
      expect(resultat.motif).toBe('premier_pull_indisponible');
      expect(resultat.guidage).toMatch(/[a-zéèêàç]/);
    }
  });

  it('embarquerMission relaie le refus de stockage tel quel (persistance refusée d’abord)', async () => {
    simulerNavigateur({
      persist: () => Promise.resolve(false),
      estimate: () => Promise.resolve(estimation(0.5)),
    });
    const base = await nouvelleBase();
    const resultat = await embarquerMission(base, MISSION_ID);
    expect(resultat.statut).toBe('refuse');
    if (resultat.statut === 'refuse') expect(resultat.motif).toBe('persistance_refusee');
  });
});
