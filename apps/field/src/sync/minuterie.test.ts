// =============================================================================
// TESTS DU DÉCLENCHEUR « MINUTERIE 30 s » — lot L6, incrément L6b. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis 05 §9.3 (« Déclencheurs : retour du réseau
// (`online` + ping API), timer 30 s, action “synchroniser maintenant” » ;
// « `error` : backoff exponentiel (max 1 min) »), `LOT_L6.md` §3ter C.2
// (« backoff borné à 60 s, prouvé sur horloge simulée ») et `DECISIONS.md` [L6a]
// (« minuterie et backoff en L6b »).
//
// ── API ATTENDUE DE `apps/field/src/sync/declencheurs.ts` (pour A25) ─────────
//   export const INTERVALLE_MINUTERIE_MS = 30_000;
//   export interface DependancesMinuterie {
//     readonly port: Pick<PortSync, 'synchroniserMaintenant'>;
//     /** Les missions à synchroniser, lues À CHAQUE passage. */
//     readonly missions: () => Promise<readonly string[]>;
//   }
//   /** Démarre la minuterie ; rend la fonction qui l'ARRÊTE. */
//   export function demarrerMinuterie(deps: DependancesMinuterie): () => void;
//
// Règles figées ici :
//   · premier passage INTERVALLE_MINUTERIE_MS après le démarrage, puis toutes les
//     30 s tant que tout réussit ;
//   · un passage dont UNE mission ne rend pas `succes` (`echec`, `indisponible`,
//     ou un rejet) : le suivant attend `delaiBackoffMs(n)` (backoff.ts), jamais
//     plus de 60 s ; un succès remet le backoff à zéro et rend la cadence de 30 s ;
//   · jamais deux passages à la fois : le suivant n'est planifié qu'APRÈS la fin
//     du précédent, si long soit-il ;
//   · arrêt propre : plus rien ne part après l'arrêt, même si un passage était en
//     vol au moment de l'arrêt ;
//   · un rejet du port ou de la liste des missions ne fuit jamais en rejet non géré.
//
// Horloge SIMULÉE (`vi.useFakeTimers`) : aucun vrai délai, aucune base.
// Rouge attendu tant que `demarrerMinuterie` n'existe pas — pour cette seule raison.
// Traçabilité : E7 (remontée continue dès qu'il y a du réseau) ; invariant 8.
// =============================================================================
/* eslint-disable @typescript-eslint/require-await -- faux transports et faux ports : signatures asynchrones du contrat, rien à attendre. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultatSync } from '../local/port-sync.js';
import { DELAI_BACKOFF_MAX_MS, delaiBackoffMs } from './backoff.js';
import { INTERVALLE_MINUTERIE_MS, demarrerMinuterie } from './declencheurs.js';

const MISSION_A = '0191e2a0-0000-7000-8000-00000000f1de';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000f2de';

const SUCCES: ResultatSync = {
  statut: 'succes',
  message: 'Synchronisation : 0 opération montée.',
  operationsMontees: 0,
  operationsRestantes: 0,
};
const ECHEC: ResultatSync = {
  statut: 'echec',
  message: 'Le siège est injoignable (fictif).',
  operationsMontees: 0,
  operationsRestantes: 3,
};

/** Un port dont on règle le résultat, et qui note l'instant (simulé) de chaque appel. */
function portEspion(initial: ResultatSync = SUCCES) {
  let resultat = initial;
  const instants: number[] = [];
  const resultats: ResultatSync['statut'][] = [];
  const missionsAppelees: string[] = [];
  const port = {
    synchroniserMaintenant: vi.fn(async (missionId: string): Promise<ResultatSync> => {
      instants.push(Date.now());
      resultats.push(resultat.statut);
      missionsAppelees.push(missionId);
      return resultat;
    }),
  };
  return {
    port,
    instants,
    resultats,
    missionsAppelees,
    regler(r: ResultatSync): void {
      resultat = r;
    },
  };
}

/** Écarts entre appels successifs. */
function ecarts(instants: readonly number[]): number[] {
  return instants.slice(1).map((t, i) => t - (instants[i] ?? t));
}

const arrets: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T08:00:00.000Z'));
});

afterEach(() => {
  for (const arreter of arrets.splice(0)) arreter();
  vi.useRealTimers();
});

function demarrer(...args: Parameters<typeof demarrerMinuterie>): () => void {
  const arreter = demarrerMinuterie(...args);
  arrets.push(arreter);
  return arreter;
}

describe('minuterie — cadence de 30 s (05 §9.3)', () => {
  it('l’intervalle est 30 s ; rien ne part avant, puis un passage toutes les 30 s tant que tout réussit', async () => {
    expect(INTERVALLE_MINUTERIE_MS).toBe(30_000);
    const espion = portEspion();
    demarrer({ port: espion.port, missions: async () => [MISSION_A] });

    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS - 1);
    expect(espion.port.synchroniserMaintenant).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(espion.port.synchroniserMaintenant).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * INTERVALLE_MINUTERIE_MS);
    expect(espion.port.synchroniserMaintenant).toHaveBeenCalledTimes(6);
    expect(new Set(ecarts(espion.instants))).toEqual(new Set([INTERVALLE_MINUTERIE_MS]));
  });

  it('chaque mission, relue À CHAQUE passage, est synchronisée', async () => {
    const espion = portEspion();
    let missions: readonly string[] = [MISSION_A];
    demarrer({ port: espion.port, missions: async () => missions });

    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS);
    expect(espion.missionsAppelees).toEqual([MISSION_A]);
    missions = [MISSION_A, MISSION_B];
    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS);
    expect(espion.missionsAppelees).toEqual([MISSION_A, MISSION_A, MISSION_B]);
  });
});

describe('minuterie — backoff exponentiel BORNÉ à 60 s, prouvé sur horloge simulée', () => {
  it('@critique échecs en série : les écarts suivent delaiBackoffMs, ne dépassent JAMAIS 60 s, et atteignent la borne', async () => {
    const espion = portEspion(ECHEC);
    demarrer({ port: espion.port, missions: async () => [MISSION_A] });

    // Vingt minutes simulées de siège injoignable.
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    const e = ecarts(espion.instants);
    expect(e.length).toBeGreaterThan(10);
    e.forEach((ecart, i) => {
      expect(ecart).toBe(delaiBackoffMs(i + 1));
      expect(ecart).toBeLessThanOrEqual(DELAI_BACKOFF_MAX_MS);
    });
    expect(e.at(-1)).toBe(DELAI_BACKOFF_MAX_MS);
  });

  it('@critique un succès remet à zéro : retour à 30 s, et l’échec suivant repart du premier délai', async () => {
    const espion = portEspion(ECHEC);
    demarrer({ port: espion.port, missions: async () => [MISSION_A] });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    espion.regler(SUCCES);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    espion.regler(ECHEC);
    await vi.advanceTimersByTimeAsync(3 * 60_000);

    // Le modèle : après un succès, 30 s ; après le k-ième échec CONSÉCUTIF,
    // delaiBackoffMs(k). Chaque écart observé doit être celui du modèle.
    const e = ecarts(espion.instants);
    let consecutifs = 0;
    let succesVus = 0;
    let echecApresSucces = false;
    e.forEach((ecart, i) => {
      if (espion.resultats[i] === 'succes') {
        succesVus += 1;
        consecutifs = 0;
        expect(ecart).toBe(INTERVALLE_MINUTERIE_MS);
      } else {
        if (consecutifs === 0 && succesVus > 0) echecApresSucces = true;
        consecutifs += 1;
        expect(ecart).toBe(delaiBackoffMs(consecutifs));
      }
    });
    // Anti-vacuité : les trois régimes ont bien été traversés.
    expect(succesVus).toBeGreaterThan(1);
    expect(echecApresSucces).toBe(true);
  });

  it('un passage où UNE seule mission échoue compte comme un échec (backoff)', async () => {
    const instants: number[] = [];
    const port = {
      synchroniserMaintenant: vi.fn(async (missionId: string): Promise<ResultatSync> => {
        if (missionId === MISSION_A) instants.push(Date.now());
        return missionId === MISSION_B ? ECHEC : SUCCES;
      }),
    };
    demarrer({ port, missions: async () => [MISSION_A, MISSION_B] });
    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS + delaiBackoffMs(1));
    expect(ecarts(instants)).toEqual([delaiBackoffMs(1)]);
  });

  it('« indisponible » (reconnexion requise) et un rejet du port sont des échecs, jamais un rejet non géré', async () => {
    const rejets: unknown[] = [];
    const surRejet = (raison: unknown): void => {
      rejets.push(raison);
    };
    process.on('unhandledRejection', surRejet);
    try {
      const instants: number[] = [];
      let appel = 0;
      const port = {
        synchroniserMaintenant: vi.fn(async (): Promise<ResultatSync> => {
          instants.push(Date.now());
          appel += 1;
          if (appel % 2 === 0) throw new Error('panne locale fictive');
          return { ...ECHEC, statut: 'indisponible' };
        }),
      };
      demarrer({ port, missions: async () => [MISSION_A] });
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      const e = ecarts(instants);
      e.forEach((ecart, i) => {
        expect(ecart).toBe(delaiBackoffMs(i + 1));
      });
      expect(rejets).toEqual([]);
    } finally {
      process.off('unhandledRejection', surRejet);
    }
  });

  it('une liste de missions qui rejette (base verrouillée) ne casse pas la minuterie', async () => {
    const espion = portEspion();
    let verrouillee = true;
    demarrer({
      port: espion.port,
      missions: async () => {
        if (verrouillee) throw new Error('base fermée (fictif)');
        return [MISSION_A];
      },
    });
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(espion.port.synchroniserMaintenant).not.toHaveBeenCalled();
    verrouillee = false;
    await vi.advanceTimersByTimeAsync(DELAI_BACKOFF_MAX_MS + INTERVALLE_MINUTERIE_MS);
    expect(espion.port.synchroniserMaintenant).toHaveBeenCalled();
  });
});

describe('minuterie — jamais deux passages à la fois, arrêt propre', () => {
  it('@critique un passage LONG n’est jamais doublé : rien ne part tant qu’il n’est pas fini', async () => {
    let finir: (r: ResultatSync) => void = () => undefined;
    let enVol = 0;
    let maxEnVol = 0;
    const port = {
      synchroniserMaintenant: vi.fn(
        () =>
          new Promise<ResultatSync>((resoudre) => {
            enVol += 1;
            maxEnVol = Math.max(maxEnVol, enVol);
            finir = (r) => {
              enVol -= 1;
              resoudre(r);
            };
          }),
      ),
    };
    demarrer({ port, missions: async () => [MISSION_A] });
    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS);
    expect(port.synchroniserMaintenant).toHaveBeenCalledTimes(1);

    // Dix minutes de passage bloqué : aucun autre ne démarre.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(port.synchroniserMaintenant).toHaveBeenCalledTimes(1);

    finir(SUCCES);
    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS);
    expect(port.synchroniserMaintenant).toHaveBeenCalledTimes(2);
    expect(maxEnVol).toBe(1);
  });

  it('@critique après l’arrêt, plus rien ne part', async () => {
    const espion = portEspion();
    const arreter = demarrer({ port: espion.port, missions: async () => [MISSION_A] });
    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS);
    expect(espion.port.synchroniserMaintenant).toHaveBeenCalledTimes(1);

    arreter();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(espion.port.synchroniserMaintenant).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('arrêt PENDANT un passage : le passage finit, mais aucun suivant n’est planifié', async () => {
    let finir: (r: ResultatSync) => void = () => undefined;
    const port = {
      synchroniserMaintenant: vi.fn(
        () =>
          new Promise<ResultatSync>((resoudre) => {
            finir = resoudre;
          }),
      ),
    };
    const arreter = demarrer({ port, missions: async () => [MISSION_A] });
    await vi.advanceTimersByTimeAsync(INTERVALLE_MINUTERIE_MS);
    arreter();
    finir(SUCCES);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(port.synchroniserMaintenant).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('arrêter deux fois est sans effet (idempotent)', () => {
    const espion = portEspion();
    const arreter = demarrer({ port: espion.port, missions: async () => [MISSION_A] });
    arreter();
    expect(() => {
      arreter();
    }).not.toThrow();
  });
});
