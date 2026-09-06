// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B4** de la recette novice n°1 (A54,
// 2026-09-06) : le rituel de fin de journée qui s'éteignait à vide.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit aucune ligne de
// `EcranFinDeJournee.tsx` ni du correctif (09 §5.6). `@critique` : c'est
// l'invariant 8 qui est en jeu, et sa forme la plus dangereuse — un garde-fou
// qui s'éteint tout seul en annonçant que tout va bien.
//
// ── LE DÉFAUT, ET CE QUE LE CORRECTIF DOIT TENIR ────────────────────────────
// `CLE_DERNIER_RITUEL` était écrite INCONDITIONNELLEMENT. Mot de passe vide ou
// faux : aucune sauvegarde produite, et le rappel du cockpit — qui ne regarde
// que cette date — s'éteignait quand même. L'auditeur se couchait rassuré, ses
// données n'avaient pas quitté l'appareil.
//
// ── LE CAS QUI COMPTE ICI, ET QU'AUCUN TEST NE COUVRAIT ─────────────────────
// **Deux missions dont une seule réussit.** L'invariant 8 se compte PAR MISSION
// (« aucune donnée ne vit sur un seul appareil plus de 24 h ouvrées ») : une
// mission sans fichier laisse des données sans filet, quel que soit le sort de
// l'autre. Un correctif écrit avec `some()` au lieu de `every()`, ou qui
// s'arrêterait à la première mission, passerait tous les tests à une mission et
// rallumerait le défaut le jour où un auditeur en embarque deux — c'est-à-dire
// le premier jour d'une vraie campagne.
//
// ── POURQUOI CE HARNAIS, ET CE QU'IL NE PROUVE PAS ──────────────────────────
// Les collaborateurs de l'écran sont simulés (journée, export, `meta`) : la
// règle éprouvée est celle de l'ÉCRAN — « quand la date s'écrit-elle » — et elle
// se lit sur l'appel à `ecrireMeta`, pas sur le contenu d'IndexedDB. Ce que ce
// fichier NE prouve PAS : qu'une sauvegarde réelle est restaurable sur un second
// appareil. Cela ne se prouve que sur deux machines, et c'est au §5 du rapport.
//
// Traçabilité : E38 (sauvegarde terrain : sync + export), invariant 8, E44.
// =============================================================================
import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from '../../app/contexte.js';
import type { EtatMissionDuJour, JourneeTerrain } from '../../agenda/jour.js';

/** La clé réelle (03 §34.2-2), recopiée ici pour que le double ne dérive pas. */
const CLE_RITUEL = 'journee:dernier-rituel';

const MISSION_A = '0191e2a0-0000-7000-8000-00000027b4a1';
const MISSION_B = '0191e2a0-0000-7000-8000-00000027b4b2';
const MDP_A27 = 'MOT_DE_PASSE_FICTIF_A27_B4';

let terrain: ValeurTerrain;
let journee: JourneeTerrain;
/** Les missions dont l'export ÉCHOUE — le levier de tout ce fichier. */
let missionsQuiEchouent: readonly string[] = [];
const ecrireMeta = vi.fn<(base: unknown, cle: string, valeur: unknown) => Promise<void>>(() =>
  Promise.resolve(),
);
interface SauvegardeProduite {
  readonly enTete: { readonly creeLe: string; readonly operationsIncluses: number };
}
const exporterSauvegarde =
  vi.fn<(arg: { missionId: string; motDePasse: string }) => Promise<SauvegardeProduite>>();

vi.mock('../../app/contexte.js', () => ({
  useTerrain: () => terrain,
}));

// `useLiveQuery` réduit à ce qu'il est ici : une lecture asynchrone rendue une
// fois. Aucune réactivité n'est nécessaire — l'assertion porte sur un appel.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: <T,>(requete: () => Promise<T>, _deps: unknown, defaut: T): T => {
    const [valeur, setValeur] = useState<T>(defaut);
    useEffect(() => {
      let vivant = true;
      void requete().then((resultat) => {
        if (vivant) setValeur(resultat);
      });
      return () => {
        vivant = false;
      };
      // Une seule exécution : le harnais ne rejoue pas la requête.
    }, []);
    return valeur;
  },
}));

vi.mock('../../agenda/jour.js', () => ({
  CLE_DERNIER_RITUEL: CLE_RITUEL,
  construireJournee: () => Promise.resolve(journee),
}));

vi.mock('../../local/base.js', () => ({
  ecrireMeta,
  lireMeta: () => Promise.resolve(undefined),
}));

vi.mock('../../sauvegarde/sauvegarde.js', () => ({
  exporterSauvegarde,
  MotDePasseExportInvalideError: class MotDePasseExportInvalideError extends Error {
    constructor() {
      super('Mot de passe de sauvegarde invalide.');
    }
  },
}));

const { EcranFinDeJournee } = await import('./EcranFinDeJournee.js');

function missionDuJour(id: string, titre: string): EtatMissionDuJour {
  return {
    mission: {
      id,
      status: 'en_cours',
      clientUpdatedAt: '2026-09-06T08:00:00.000Z',
      supprimeLe: null,
      titre,
      companyId: '0191e2a0-0000-7000-8000-00000027b4cc',
      timezone: 'Europe/Paris',
      auditLevel: 'standard',
      geoScope: 'france',
      countryCode: 'FR',
      startPlanned: null,
      endPlanned: null,
      roleSurMission: 'auditeur',
    },
    sessions: [],
    aRevoirOuverts: 0,
    sync: {
      missionId: id,
      statut: 'indisponible',
      derniereSyncReussieLe: null,
      operationsEnAttente: 0,
      operationsBloquees: 0,
      alerte: { declenchee: false, message: null },
    },
  };
}

function journeeAvec(missions: readonly EtatMissionDuJour[]): JourneeTerrain {
  return { missions, sessionsDuJour: [], alertes: [], aReprendre: null, aValider: [] };
}

function terrainDeBase(): ValeurTerrain {
  return {
    phase: 'ouvert',
    panne: null,
    premierUsage: false,
    // L'écran n'exige de `base` que « non nulle » : toute lecture passe par les
    // modules simulés ci-dessus.
    base: {} as ValeurTerrain['base'],
    verrou: {
      verrouille: false,
      delaiCourantMs: 60 * 60 * 1000,
      ecranMaintenuEveille: true,
      msAvantVerrouillage: () => 60 * 60 * 1000,
      verrouillerMaintenant: vi.fn(),
      signalerDeverrouillage: vi.fn(),
    },
    navigation: { pile: ['aujourdhui', 'finDeJournee'] },
    vue: 'finDeJournee',
    stockage: null,
    jetonSiege: 'absent',
    naviguer: vi.fn(),
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: vi.fn(),
    rafraichirStockage: () => Promise.resolve(),
  };
}

/** Les fichiers réellement déposés sur l'appareil, par nom. */
let fichiersDeposes: string[] = [];

beforeEach(() => {
  terrain = terrainDeBase();
  journee = journeeAvec([missionDuJour(MISSION_A, 'Mission fictive A')]);
  missionsQuiEchouent = [];
  fichiersDeposes = [];
  ecrireMeta.mockClear();
  exporterSauvegarde.mockReset();
  exporterSauvegarde.mockImplementation(({ missionId }: { missionId: string }) => {
    if (missionsQuiEchouent.includes(missionId)) {
      return Promise.reject(new Error('Panne fictive d’export sur cette mission.'));
    }
    return Promise.resolve({
      enTete: { creeLe: '2026-09-06T18:30:00.000Z', operationsIncluses: 3 },
    });
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:axion-a27-b4',
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  HTMLAnchorElement.prototype.click = function capturer(this: HTMLAnchorElement) {
    if (this.download !== '') fichiersDeposes.push(this.download);
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function monter(): Promise<void> {
  render(<EcranFinDeJournee />);
  await screen.findByRole('button', { name: /terminer la journée/i });
}

function saisirMotDePasse(valeur: string): void {
  const champ = document.querySelector('input[type="password"]');
  if (!(champ instanceof HTMLInputElement)) throw new Error('aucun champ de mot de passe');
  fireEvent.change(champ, { target: { value: valeur } });
}

async function terminerLaJournee(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /terminer la journée/i }));
    await Promise.resolve();
  });
  await screen.findByRole('heading', { name: /ce qui a été fait/i }, { timeout: 15_000 });
}

/** La date du rituel a-t-elle été écrite ? */
function dateDuRituelEcrite(): boolean {
  return ecrireMeta.mock.calls.some((appel) => appel[1] === CLE_RITUEL);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — mot de passe absent : rien n’est sauvegardé, et le rappel RESTE', () => {
  it('@critique aucun fichier déposé, et `CLE_DERNIER_RITUEL` n’est PAS écrite', async () => {
    await monter();
    await terminerLaJournee();

    expect(exporterSauvegarde).not.toHaveBeenCalled();
    expect(fichiersDeposes).toEqual([]);
    expect(dateDuRituelEcrite()).toBe(false);
  });

  it('@critique l’écran le DIT en alerte : le silence serait la même méprise que le rappel éteint', async () => {
    await monter();
    await terminerLaJournee();

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Aucune sauvegarde produite ce soir');
    expect(alerte.textContent).toMatch(/n’ont quitté cet appareil d’aucune façon/);
    expect(alerte.textContent).toMatch(/rappel de fin de journée reste donc actif/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — mot de passe FAUX : un export qui échoue n’éteint pas davantage le rappel', () => {
  it('@critique l’export lève, aucun fichier n’est déposé, la date n’est pas écrite', async () => {
    missionsQuiEchouent = [MISSION_A];
    await monter();
    saisirMotDePasse(MDP_A27);
    await terminerLaJournee();

    expect(exporterSauvegarde).toHaveBeenCalledTimes(1);
    expect(fichiersDeposes).toEqual([]);
    expect(dateDuRituelEcrite()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LE CAS QUE LA RECETTE NE POUVAIT PAS VOIR — l'invariant 8 se compte PAR MISSION.
// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — deux missions, une seule réussit : la date n’est PAS écrite', () => {
  beforeEach(() => {
    journee = journeeAvec([
      missionDuJour(MISSION_A, 'Mission fictive A'),
      missionDuJour(MISSION_B, 'Mission fictive B'),
    ]);
  });

  it('@critique la mission B échoue : un fichier sur deux ne tient pas l’invariant 8', async () => {
    missionsQuiEchouent = [MISSION_B];
    await monter();
    saisirMotDePasse(MDP_A27);
    await terminerLaJournee();

    // Anti-vacuité : les DEUX missions ont bien été tentées. Un rituel qui
    // s'arrêterait à la première laisserait la seconde sans filet en disant
    // « sauvegarde produite ».
    expect(exporterSauvegarde).toHaveBeenCalledTimes(2);
    expect(fichiersDeposes).toHaveLength(1);
    // Et la date ne s'écrit pas : il reste des données sans filet sur l'appareil.
    expect(dateDuRituelEcrite()).toBe(false);

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Aucune sauvegarde produite ce soir');
  });

  it('@critique les DEUX réussissent : la date est écrite, et une seule fois', async () => {
    // Le bord opposé, et il compte autant : un correctif qui n'écrirait plus
    // jamais la date rendrait le test précédent vert et le rappel permanent —
    // un garde-fou qui crie tous les soirs finit par ne plus être lu.
    await monter();
    saisirMotDePasse(MDP_A27);
    await terminerLaJournee();

    expect(exporterSauvegarde).toHaveBeenCalledTimes(2);
    expect(fichiersDeposes).toHaveLength(2);
    await waitFor(() => {
      expect(dateDuRituelEcrite()).toBe(true);
    });
    expect(ecrireMeta.mock.calls.filter((appel) => appel[1] === CLE_RITUEL)).toHaveLength(1);
    expect(screen.queryByText(/Aucune sauvegarde produite ce soir/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — aucune mission embarquée : la date ne s’écrit pas non plus', () => {
  it('@critique « rien à sauvegarder » n’est pas « journée protégée »', async () => {
    journee = journeeAvec([]);
    render(<EcranFinDeJournee />);
    // L'écran rend son état vide : il n'y a rien à clôturer.
    await screen.findByText(/Rien à clôturer/i);
    expect(dateDuRituelEcrite()).toBe(false);
  });
});
