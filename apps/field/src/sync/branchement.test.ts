// =============================================================================
// LE PORT RÉEL EST BRANCHÉ PARTOUT, ET LE RETOUR DU RÉSEAU DÉCLENCHE LA MONTÉE
// — lot L6, incrément L6a (revue A29, arbitrage B3 du 2026-10-09). ÉCRIT AVANT LE CODE.
//
// Écrit par A26 (09 §5.6) depuis `LOT_L6.md` §3ter B-2 (« L6a le clôt en remplaçant
// le port »), 05 §9.3 (déclencheurs : retour du réseau, timer 30 s, action manuelle)
// et l'arbitrage B3 : en L6a, le MANUEL (`synchroniserMaintenant`) et le RETOUR
// RÉSEAU (`online`) ; la minuterie et le backoff restent en L6b.
//
// ── API ATTENDUE DE `apps/field/src/sync/declencheurs.ts` (pour A25) ─────────
//   export interface DependancesRetourReseau {
//     readonly cible: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>; // `window`
//     readonly port: Pick<PortSync, 'synchroniserMaintenant'>;
//     readonly missions: () => Promise<readonly string[]>; // missions embarquées
//   }
//   /** Écoute `online` ; rend la fonction qui se désabonne. */
//   export function ecouterRetourReseau(deps: DependancesRetourReseau): () => void;
//
// Gardes par lecture des sources : plus AUCUN `portSyncInerte` dans le code de
// production (sa déclaration dans `local/port-sync.ts` exceptée), et
// `ecouterRetourReseau` est appelé par l'application (hors `src/sync/`).
// Traçabilité : E7 (remontée dès qu'il y a du réseau), invariant 8.
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ResultatSync } from '../local/port-sync.js';
import { ecouterRetourReseau } from './declencheurs.js';

const RACINE_SRC = fileURLToPath(new URL('..', import.meta.url));

function sourcesDeProduction(dossier: string = RACINE_SRC): string[] {
  const fichiers: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiers.push(...sourcesDeProduction(chemin));
    else if (/\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom)) fichiers.push(chemin);
  }
  return fichiers;
}

function relatif(chemin: string): string {
  return relative(RACINE_SRC, chemin).split('\\').join('/');
}

/** Le source sans ses commentaires de ligne : un renvoi historique n'est pas un usage. */
function codeDe(chemin: string): string {
  return readFileSync(chemin, 'utf8').replace(/\/\/.*$/gm, '');
}

const SUCCES: ResultatSync = {
  statut: 'succes',
  message: 'Synchronisation : 0 opération montée.',
  operationsMontees: 0,
  operationsRestantes: 0,
};

describe('B3 — plus aucun port inerte en production', () => {
  it('aucun fichier de production n’utilise portSyncInerte (hors sa déclaration)', () => {
    const fautifs = sourcesDeProduction()
      .filter((f) => relatif(f) !== 'local/port-sync.ts')
      .filter((f) => /\bportSyncInerte\b/.test(codeDe(f)))
      .map(relatif);
    expect(fautifs).toEqual([]);
  });

  it('les quatre surfaces nommées par la revue n’utilisent plus le port inerte', () => {
    for (const fichier of [
      'app/EcranAccueil.tsx',
      'ecrans/journee/EcranFinDeJournee.tsx',
      'ecrans/journee/EcranAujourdhui.tsx',
      'ecrans/journee/PastilleSyncCoquille.tsx',
    ]) {
      expect(codeDe(join(RACINE_SRC, fichier)), fichier).not.toMatch(/\bportSyncInerte\b/);
    }
  });

  it('le retour réseau est branché par l’application (ecouterRetourReseau appelé hors src/sync/)', () => {
    const branchements = sourcesDeProduction()
      .filter((f) => !relatif(f).startsWith('sync/'))
      .filter((f) => /\becouterRetourReseau\(/.test(codeDe(f)));
    expect(branchements.length).toBeGreaterThan(0);
  });
});

describe('B3 — déclencheur « retour du réseau » (05 §9.3)', () => {
  function banc(missions: readonly string[] = ['m-fictive-1', 'm-fictive-2']) {
    const cible = new EventTarget();
    const synchroniserMaintenant = vi.fn<(missionId: string) => Promise<ResultatSync>>(() =>
      Promise.resolve(SUCCES),
    );
    const arreter = ecouterRetourReseau({
      cible,
      port: { synchroniserMaintenant },
      missions: () => Promise.resolve(missions),
    });
    return { cible, synchroniserMaintenant, arreter };
  }

  it('« online » : chaque mission embarquée est synchronisée une fois', async () => {
    const { cible, synchroniserMaintenant } = banc();

    cible.dispatchEvent(new Event('online'));

    await vi.waitFor(() => {
      expect(synchroniserMaintenant).toHaveBeenCalledTimes(2);
    });
    expect(synchroniserMaintenant.mock.calls.map(([m]) => m).sort()).toEqual([
      'm-fictive-1',
      'm-fictive-2',
    ]);
  });

  it('rien ne part sans événement, ni sur « offline »', async () => {
    const { cible, synchroniserMaintenant } = banc();

    cible.dispatchEvent(new Event('offline'));
    await new Promise((r) => setTimeout(r, 20));

    expect(synchroniserMaintenant).not.toHaveBeenCalled();
  });

  it('après désabonnement, « online » ne déclenche plus rien', async () => {
    const { cible, synchroniserMaintenant, arreter } = banc();

    arreter();
    cible.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 20));

    expect(synchroniserMaintenant).not.toHaveBeenCalled();
  });

  it('un échec de synchronisation déclenché par le réseau ne fuit pas en rejet non géré', async () => {
    const cible = new EventTarget();
    const synchroniserMaintenant = vi.fn(() => Promise.reject(new Error('panne fictive')));
    ecouterRetourReseau({
      cible,
      port: { synchroniserMaintenant },
      missions: () => Promise.resolve(['m-fictive-1']),
    });

    cible.dispatchEvent(new Event('online'));

    await vi.waitFor(() => {
      expect(synchroniserMaintenant).toHaveBeenCalledTimes(1);
    });
    // Un rejet non géré ferait échouer la suite (vitest le signale) : on lui laisse le temps.
    await new Promise((r) => setTimeout(r, 20));
  });
});
