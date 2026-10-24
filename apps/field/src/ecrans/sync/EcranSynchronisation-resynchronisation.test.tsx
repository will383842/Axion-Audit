// =============================================================================
// L'ÉCRAN DE SYNCHRONISATION — le bouton « Resynchroniser » (lot L6, L6c-3 V1).
// ÉCRIT AVANT LE CODE.
//
// Écrit par A26 (09 §5.6 : A22 écrit l'écran, il ne corrige rien ici) depuis
// 05 §9.5 (resynchronisation VOLONTAIRE), 03 §33.2 (les QUATRE états),
// `LOT_L6.md` §3ter C.2 (au plus UN role="alert", le reste en role="status" ;
// tokens seulement) et l'invariant 5 (français).
//
// ── API ATTENDUE (pour A22) ─────────────────────────────────────────────────
//   `EcranSynchronisation` rend, pour CHAQUE mission présente sur l'appareil, un
//   bouton dont le nom accessible contient « Resynchroniser » — y compris quand
//   la file est VIDE (c'est le cas courant : on envoie d'abord, puis on
//   resynchronise). Le geste appelle `portSyncDeLaBase(base).resynchroniser(
//   missionId)` (`sync/port.ts`, voir `sync/resynchronisation.test.ts`) qui rend
//   `{statut: 'succes'|'refusee'|'mission_retiree'|'echec', message}`.
//   L'écran AFFICHE `message` tel quel, dans un role="status".
//
// Les quatre états du bouton :
//   REPOS      bouton actif, rien d'autre à dire ;
//   EN COURS   bouton désactivé OU aria-busy="true" — un second clic ne relance
//              rien ; l'écran n'est jamais bloqué ;
//   REFUS      statut `refusee` : le message « envoyez d'abord » en role="status"
//              (pas une alerte) ; le bouton reste offert ;
//   ÉCHEC / MISSION RETIRÉE : statut `echec` (ou le port qui LÈVE) → un
//              role="status" en français ; `mission_retiree` → le message du
//              port ; l'état « mission retirée » est PERSISTANT
//              (`cleMissionRetiree(missionId)` dans `meta`) : l'écran le dit
//              aussi à l'ouverture, sans cliquer.
// Au plus UN role="alert" en tout temps. Aucun style en dur : la garde de
// `EcranSynchronisation.test.tsx` lit déjà toutes les sources de `ecrans/sync/**`.
//
// Rouge attendu : le bouton n'existe pas — pour cette seule raison.
// Traçabilité : E7, E44 (grille §33) ; invariants 4, 5, 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../../local/contexte.js';
import { appliquerDescente } from '../../local/ecriture.js';
import { portSyncDeLaBase } from '../../app/port-sync-terrain.js';
import { EcranSynchronisation } from './EcranSynchronisation.js';

const INSTANT = '2026-10-09T09:00:00.000Z';
const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const MESSAGE_REFUS = 'Envoyez d’abord vos saisies : 2 opérations attendent encore d’être montées.';
const MESSAGE_RETRAIT = 'Cette mission vous a été retirée : vos données restent sur cet appareil.';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

interface ResultatResynchro {
  readonly statut: 'succes' | 'refusee' | 'mission_retiree' | 'echec';
  readonly message: string;
}
type Resynchroniser = (missionId: string) => Promise<ResultatResynchro>;

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-ecran-resynchro-${String(compteur)}`);
  await base.open();
  bases.push(base);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  await appliquerDescente({
    missionId: MISSION,
    serverTime: INSTANT,
    prochainSince: INSTANT,
    enregistrements: [
      {
        table: 'missions',
        index: { id: MISSION, status: 'en_cours', clientUpdatedAt: INSTANT, supprimeLe: null },
        charge: {
          titre: 'Mission fictive FIL-TPE',
          companyId: '0191e2a0-0000-7000-8000-00000000cccc',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'consultant',
        },
      },
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION), INSTANT);
  return base;
}

/** Remplace `resynchroniser` du port de la base (la méthode n'existe pas encore). */
function brancherPort(base: BaseLocale, faux: Resynchroniser): ReturnType<typeof vi.fn> {
  const espion = vi.fn(faux);
  Object.assign(portSyncDeLaBase(base), { resynchroniser: espion });
  return espion;
}

function terrainDeBase(base: BaseLocale): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    base,
    verrou: {
      verrouille: false,
      delaiCourantMs: 15 * 60 * 1000,
      ecranMaintenuEveille: false,
      msAvantVerrouillage: () => 15 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['accueil', 'synchronisation'] },
    vue: 'synchronisation',
    stockage: {
      persistant: true,
      quotaOctets: 10 * 1024 ** 3,
      utiliseOctets: 1024 ** 3,
      ratio: 0.1,
      niveau: 'ok',
    },
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

async function afficher(base: BaseLocale): Promise<void> {
  terrain = terrainDeBase(base);
  render(<EcranSynchronisation />);
  await waitFor(() => {
    expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
  });
}

const bouton = (): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>('button', { name: /resynchroniser/i });

function statutContenant(motif: RegExp): HTMLElement | undefined {
  return screen.queryAllByRole('status').find((el) => motif.test(el.textContent));
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(67), KDF_TEST);
}, 20_000);

afterEach(async () => {
  cleanup();
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// =============================================================================
// REPOS
// =============================================================================
describe('Resynchroniser — repos', () => {
  it('@critique file VIDE : le bouton « Resynchroniser » est offert, actif, en français, sans alerte', async () => {
    const base = await nouvelleBase();
    await afficher(base);
    expect(bouton().disabled).toBe(false);
    expect(bouton().getAttribute('aria-busy')).not.toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('le clic appelle le port avec la mission ; l’écran ne touche pas au réseau lui-même', async () => {
    const base = await nouvelleBase();
    const port = brancherPort(base, () =>
      Promise.resolve({ statut: 'succes', message: 'Questionnaire et affectations à jour.' }),
    );
    const reseau = vi.fn(() => Promise.reject(new Error('l’écran ne lit JAMAIS le réseau')));
    vi.stubGlobal('fetch', reseau);
    try {
      await afficher(base);
      fireEvent.click(bouton());
      await waitFor(() => {
        expect(port).toHaveBeenCalledWith(MISSION);
      });
      await waitFor(() => {
        expect(statutContenant(/à jour/)).toBeDefined();
      });
      expect(reseau).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// =============================================================================
// EN COURS
// =============================================================================
describe('Resynchroniser — en cours', () => {
  it('@critique pendant l’opération : bouton désactivé ou occupé, un second clic ne relance rien ; ensuite il redevient actif', async () => {
    const base = await nouvelleBase();
    let terminer: (r: ResultatResynchro) => void = () => undefined;
    const port = brancherPort(
      base,
      () =>
        new Promise<ResultatResynchro>((resoudre) => {
          terminer = resoudre;
        }),
    );
    await afficher(base);

    fireEvent.click(bouton());
    await waitFor(() => {
      expect(bouton().disabled || bouton().getAttribute('aria-busy') === 'true').toBe(true);
    });
    fireEvent.click(bouton());
    expect(port).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('alert').length).toBeLessThanOrEqual(1);

    terminer({ statut: 'succes', message: 'Questionnaire et affectations à jour.' });
    await waitFor(() => {
      expect(bouton().disabled).toBe(false);
      expect(bouton().getAttribute('aria-busy')).not.toBe('true');
    });
  });
});

// =============================================================================
// REFUS « ENVOYEZ D'ABORD »
// =============================================================================
describe('Resynchroniser — refus', () => {
  it('@critique « envoyez d’abord » : le message du port est dit en statut (pas en alerte), le bouton reste offert', async () => {
    const base = await nouvelleBase();
    brancherPort(base, () => Promise.resolve({ statut: 'refusee', message: MESSAGE_REFUS }));
    await afficher(base);

    fireEvent.click(bouton());

    await waitFor(() => {
      expect(statutContenant(/envoyez d.abord/i)).toBeDefined();
    });
    expect(statutContenant(/envoyez d.abord/i)?.hidden).toBe(false);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(bouton().disabled).toBe(false);
  });
});

// =============================================================================
// ÉCHEC
// =============================================================================
describe('Resynchroniser — échec', () => {
  it('statut `echec` : le message du port est dit, au plus une alerte, le geste reste offert pour réessayer', async () => {
    const base = await nouvelleBase();
    brancherPort(base, () =>
      Promise.resolve({
        statut: 'echec',
        message: 'Le siège est injoignable : la resynchronisation reprendra à votre demande.',
      }),
    );
    await afficher(base);
    fireEvent.click(bouton());
    await waitFor(() => {
      expect(statutContenant(/injoignable/i)).toBeDefined();
    });
    expect(screen.queryAllByRole('alert').length).toBeLessThanOrEqual(1);
    expect(bouton().disabled).toBe(false);
  });

  it('@critique le port qui LÈVE : un statut en français le dit, aucune trace technique, l’écran tient', async () => {
    const base = await nouvelleBase();
    brancherPort(base, () => Promise.reject(new Error('IDBTransaction abort (fictif)')));
    await afficher(base);
    fireEvent.click(bouton());
    await waitFor(() => {
      const statut = statutContenant(/n’a pas pu|n'a pas pu|impossible|échec|échoué/i);
      expect(statut).toBeDefined();
      expect(statut?.textContent).not.toMatch(/IDB|abort|Error/);
    });
    expect(screen.queryAllByRole('alert').length).toBeLessThanOrEqual(1);
    expect(bouton().disabled).toBe(false);
  });
});

// =============================================================================
// MISSION RETIRÉE
// =============================================================================
describe('Resynchroniser — mission retirée', () => {
  it('@critique statut `mission_retiree` : le message du port est dit en statut, au plus une alerte', async () => {
    const base = await nouvelleBase();
    brancherPort(base, () =>
      Promise.resolve({ statut: 'mission_retiree', message: MESSAGE_RETRAIT }),
    );
    await afficher(base);
    fireEvent.click(bouton());
    await waitFor(() => {
      expect(statutContenant(/retirée/i)).toBeDefined();
    });
    expect(screen.queryAllByRole('alert').length).toBeLessThanOrEqual(1);
  });

  it('@critique l’état est PERSISTANT : posé en base, l’écran le dit à l’ouverture sans aucun clic', async () => {
    const module: Record<string, unknown> = await import('../../sync/descente.js');
    const cle = module.cleMissionRetiree;
    if (typeof cle !== 'function') {
      throw new Error('cleMissionRetiree est absente (L6c-3 pas encore écrit)');
    }
    const base = await nouvelleBase();
    await ecrireMeta(base, (cle as (m: string) => string)(MISSION), INSTANT);
    await afficher(base);
    expect(statutContenant(/retirée/i)).toBeDefined();
    expect(screen.queryAllByRole('alert').length).toBeLessThanOrEqual(1);
  });

  it('une mission non retirée ne le dit pas', async () => {
    const base = await nouvelleBase();
    await afficher(base);
    expect(screen.queryByText(/retirée/i)).toBeNull();
  });
});
