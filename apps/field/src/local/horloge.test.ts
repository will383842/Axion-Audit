// =============================================================================
// TESTS DE L'HORLOGE CORRIGÉE — lot L5, incrément L5a.
//
// Écrits par A26 depuis 05 §9.2 (« client_updated_at = horloge locale + offset
// serveur estimé à la dernière sync »), 05 §9.8 (scénario « horloge locale
// déréglée (+3 h) ») et les signatures/JSDoc exportées de `horloge.ts`.
//
// L'horloge SYSTÈME est figée par `vi.useFakeTimers` : chaque test connaît
// exactement « maintenant », et aucun `new Date()` n'apparaît dans ce fichier.
//
// Traçabilité : E6 (hors ligne total — l'heure juste sans réseau, après une
// seule sync) · E7 (remontée continue — `client_updated_at` juge du LWW, 05 §9.4).
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decalageActuelMs,
  decalageEstimeLe,
  instantLocalMs,
  instantMs,
  maintenant,
  reglerDecalage,
  reinitialiserHorloge,
  restaurerDecalage,
} from './horloge.js';

/** L'heure de l'appareil pendant les tests : 08:00 UTC. */
const APPAREIL_ISO = '2026-09-02T08:00:00.000Z';
const APPAREIL_MS = Date.parse(APPAREIL_ISO);
const TROIS_HEURES_MS = 3 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(APPAREIL_MS);
  reinitialiserHorloge();
});

afterEach(() => {
  reinitialiserHorloge();
  vi.useRealTimers();
});

describe('horloge — état neuf', () => {
  it('sans sync connue, maintenant() est l’heure de l’appareil, en ISO 8601 UTC', () => {
    expect(maintenant()).toBe(APPAREIL_ISO);
    expect(decalageActuelMs()).toBe(0);
    expect(decalageEstimeLe()).toBeNull();
  });

  it('instantMs() et instantLocalMs() coïncident tant qu’aucun décalage n’est connu', () => {
    expect(instantMs()).toBe(APPAREIL_MS);
    expect(instantLocalMs()).toBe(APPAREIL_MS);
  });
});

describe('horloge — reglerDecalage (05 §9.2, scénario §9.8 « +3 h »)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une horloge qui ignore le serveur — sur un
  // appareil réglé 3 h en avance, chaque réponse porterait un `client_updated_at`
  // du futur et GAGNERAIT tout arbitrage LWW (05 §9.4) contre un second appareil
  // à l'heure juste.
  it('@critique appareil 3 h en avance : après reglerDecalage(serverTime), maintenant() = l’heure du serveur', () => {
    const serveurIso = new Date(APPAREIL_MS - TROIS_HEURES_MS).toISOString();
    reglerDecalage(serveurIso);
    expect(maintenant()).toBe(serveurIso);
    expect(decalageActuelMs()).toBe(-TROIS_HEURES_MS);
  });

  it('appareil 3 h en retard : le décalage est positif et maintenant() rattrape le serveur', () => {
    const serveurIso = new Date(APPAREIL_MS + TROIS_HEURES_MS).toISOString();
    reglerDecalage(serveurIso);
    expect(maintenant()).toBe(serveurIso);
    expect(decalageActuelMs()).toBe(TROIS_HEURES_MS);
  });

  it('le décalage suit l’écoulement du temps : 10 min plus tard, maintenant() a avancé de 10 min', () => {
    const serveurIso = new Date(APPAREIL_MS - TROIS_HEURES_MS).toISOString();
    reglerDecalage(serveurIso);
    vi.setSystemTime(APPAREIL_MS + 10 * 60 * 1000);
    expect(Date.parse(maintenant())).toBe(APPAREIL_MS - TROIS_HEURES_MS + 10 * 60 * 1000);
  });

  it('decalageEstimeLe() date l’estimation (ISO UTC) — `null` avant toute sync', () => {
    expect(decalageEstimeLe()).toBeNull();
    reglerDecalage(new Date(APPAREIL_MS - 1000).toISOString());
    const estime = decalageEstimeLe();
    expect(estime).not.toBeNull();
    expect(estime).toMatch(/Z$/);
  });

  it('@critique instantLocalMs() n’est JAMAIS corrigé : les durées vécues (verrou 15/60 min) restent locales', () => {
    reglerDecalage(new Date(APPAREIL_MS - TROIS_HEURES_MS).toISOString());
    expect(instantLocalMs()).toBe(APPAREIL_MS);
    expect(instantMs()).toBe(APPAREIL_MS - TROIS_HEURES_MS);
  });

  it('un serverTime illisible est refusé et ne dérègle pas l’horloge', () => {
    expect(() => {
      reglerDecalage('pas une date');
    }).toThrow();
    expect(decalageActuelMs()).toBe(0);
    expect(maintenant()).toBe(APPAREIL_ISO);
  });
});

describe('horloge — restaurerDecalage / reinitialiserHorloge', () => {
  it('restaurer un décalage connu (relecture de `meta`) l’applique sans nouvelle sync', () => {
    restaurerDecalage(-TROIS_HEURES_MS, '2026-09-01T20:00:00.000Z');
    expect(decalageActuelMs()).toBe(-TROIS_HEURES_MS);
    expect(decalageEstimeLe()).toBe('2026-09-01T20:00:00.000Z');
    expect(Date.parse(maintenant())).toBe(APPAREIL_MS - TROIS_HEURES_MS);
  });

  it('restaurer sans date d’estimation laisse `decalageEstimeLe()` à null', () => {
    restaurerDecalage(5000);
    expect(decalageActuelMs()).toBe(5000);
    expect(decalageEstimeLe()).toBeNull();
  });

  it('réinitialiser remet le décalage à zéro et oublie l’estimation', () => {
    reglerDecalage(new Date(APPAREIL_MS - TROIS_HEURES_MS).toISOString());
    reinitialiserHorloge();
    expect(decalageActuelMs()).toBe(0);
    expect(decalageEstimeLe()).toBeNull();
    expect(maintenant()).toBe(APPAREIL_ISO);
  });
});
