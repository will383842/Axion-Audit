// =============================================================================
// TESTS DE L'ÉCRAN D'ACCUEIL « AUJOURD'HUI » — lot L5, incrément L5a (revue A29,
// R-L5a-7).
//
// Écrits par A26 depuis 03 §34.2 (cockpit 100 % local : sessions du jour,
// état de sync par mission, alertes calculées localement), 03 §33.2 (4 états),
// 03 §17.6 (cause ET action), 05 §31-2 (embarquement) et `LOT_L5.md` §3.6 (le
// port inerte ne ment pas) — contre le contrat `ValeurTerrain`, sans lire le
// corps de l'écran (09 §5.6). La base est RÉELLE (Dexie sur `fake-indexeddb`) :
// c'est elle que l'écran lit par `useLiveQuery` ; le contexte est simulé.
//
// L'ÉCART NOMMÉ PAR A29 : si la lecture locale REJETTE, l'écran doit montrer un
// état d'erreur (cause + action) — aujourd'hui rien ne l'attrape, et l'écran
// tombe. Le test « erreur » ci-dessous fait échouer les lectures de `meta` par un
// middleware DBCore, sans toucher au code.
//
// Traçabilité : E44 (UX/UI — grille §33, 4 états) · E6 (hors ligne total) ·
// E38 (sauvegarde terrain — l'alerte « sync muette » se calcule localement).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { BaseLocale, cleEmbarquement, ecrireMeta } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../local/ecriture.js';
import type { ValeurTerrain } from './contexte.js';
import { EcranAccueil } from './EcranAccueil.js';

const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';

let terrain: ValeurTerrain;
let kek: CryptoKey;

vi.mock('./contexte.js', () => ({
  useTerrain: () => terrain,
}));

/** Une mission DESCENDUE (ligne `missions` chiffrée) + sa marque d'embarquement. */
async function embarquerMissionFictive(base: BaseLocale): Promise<Coffre> {
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: '2026-09-02T09:00:00.000Z',
    prochainSince: '2026-09-02T09:00:00.000Z',
    enregistrements: [
      {
        table: 'missions',
        index: {
          id: MISSION_ID,
          status: 'en_cours',
          clientUpdatedAt: '2026-09-02T08:00:00.000Z',
          supprimeLe: null,
        },
        charge: {
          titre: 'Mission fictive FIL-TPE',
          companyId: '0191e2a0-0000-7000-8000-00000000cc01',
          timezone: 'Europe/Paris',
          auditLevel: 'standard',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'auditeur',
        },
      },
    ],
  });
  await ecrireMeta(base, cleEmbarquement(MISSION_ID), '2026-09-02T08:00:00.000Z');
  return coffre;
}

/** Une réponse saisie et jamais poussée : ce qui rend l'alerte de l'invariant 8 due. */
async function saisirUneReponseNonSynchronisee(): Promise<void> {
  await ecrireLocal({
    entite: 'answer',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: '0191e2a0-0000-7000-8000-00000000a001',
      missionQuestionId: '0191e2a0-0000-7000-8000-00000000b001',
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'number', v: 3 },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: '2026-09-02T08:00:00.000Z',
    },
  });
}

const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-ecran-accueil-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

/** Fait échouer TOUTE lecture de `meta` : la panne locale que l'écran doit attraper. */
async function baseDontLesLecturesEchouent(): Promise<BaseLocale> {
  const base = await nouvelleBase();
  base.close();
  base.use({
    stack: 'dbcore',
    name: 'panne-lecture-meta',
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        if (nomTable !== 'meta') return table;
        const refus = () => Promise.reject(new Error('panne injectée en lecture'));
        return {
          ...table,
          get: refus,
          getMany: refus,
          query: refus,
          openCursor: refus,
          count: refus,
        };
      },
    }),
  });
  await base.open();
  return base;
}

function terrainDeBase(
  base: BaseLocale | null,
  surcharges: Partial<ValeurTerrain> = {},
): ValeurTerrain {
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
      verrouillerMaintenant: () => undefined,
      signalerDeverrouillage: () => undefined,
    },
    navigation: { pile: ['accueil'] },
    vue: 'accueil',
    stockage: {
      persistant: true,
      quotaOctets: 10 * 1024 ** 3,
      utiliseOctets: 1024 ** 3,
      ratio: 0.1,
      niveau: 'ok',
    },
    jetonSiege: 'absent',
    naviguer: () => undefined,
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: () => undefined,
    rafraichirStockage: () => Promise.resolve(),
    ...surcharges,
  };
}

function estOccupe(): boolean {
  return document.querySelector('[role="status"][aria-busy="true"]') !== null;
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(21));
}, 20_000);

afterEach(async () => {
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('EcranAccueil — état chargement', () => {
  it('avant que la lecture locale réponde, un statut occupé est affiché (jamais un écran blanc)', async () => {
    terrain = terrainDeBase(await nouvelleBase());
    render(<EcranAccueil />);
    expect(estOccupe()).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
  });
});

describe('EcranAccueil — état vide', () => {
  it('aucune mission embarquée ⇒ pas d’alerte, un titre « aucune mission » et une explication de ce qui manque (03 §17.6)', async () => {
    terrain = terrainDeBase(await nouvelleBase());
    render(<EcranAccueil />);
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).toMatch(/aucune mission/i);
    // 03 §17.6 : dire QUOI FAIRE, pas seulement qu'il n'y a rien.
    expect(document.body.textContent.length).toBeGreaterThan(80);
  });

  // LOT_L5.md §3.6 : tant que L6 n'a pas livré, aucun écran ne doit laisser
  // croire qu'une mission peut être téléchargée. Pas de bouton qui ne fait rien.
  it('@critique tant que le premier pull n’existe pas, l’écran le DIT et n’offre aucun bouton d’embarquement', async () => {
    terrain = terrainDeBase(await nouvelleBase());
    render(<EcranAccueil />);
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
    expect(document.body.textContent).toMatch(
      /pas encore|indisponible|arrive avec la synchronisation/i,
    );
    const boutonsEmbarquement = screen
      .queryAllByRole('button')
      .filter((b) => /embarqu|télécharg/i.test(b.textContent));
    expect(boutonsEmbarquement).toEqual([]);
  });
});

describe('EcranAccueil — état nominal', () => {
  it('une mission embarquée ⇒ elle est comptée, avec un état de sync qui ne verdit pas sans serveur (LOT_L5.md §3.6)', async () => {
    const base = await nouvelleBase();
    await embarquerMissionFictive(base);
    terrain = terrainDeBase(base);
    render(<EcranAccueil />);
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).toMatch(/1 mission/i);
    expect(document.body.textContent).not.toMatch(/aucune mission/i);
    // La pastille de sync (packages/ui) porte `role="status"` : elle ne doit
    // dire ni « synchronisé » ni « à jour » — le port est inerte.
    const statuts = screen.getAllByRole('status').map((s) => s.textContent);
    expect(statuts.join(' ')).not.toMatch(/synchronis[ée]e?\b|à jour/i);
  });

  // 03 §34.2 : « alertes CALCULÉES LOCALEMENT — sync muette > 24 h ». Une réponse
  // saisie et jamais poussée sur un appareil qui n'a jamais synchronisé : c'est
  // exactement la donnée qui « vit sur un seul appareil » (invariant 8).
  it('@critique une réponse non synchronisée sur un appareil jamais synchronisé ⇒ l’alerte de l’invariant 8 est visible', async () => {
    const base = await nouvelleBase();
    await embarquerMissionFictive(base);
    await saisirUneReponseNonSynchronisee();
    terrain = terrainDeBase(base);
    render(<EcranAccueil />);
    await waitFor(() => {
      expect(estOccupe()).toBe(false);
    });
    expect(document.body.textContent).toMatch(
      /24 ?h|jamais (été )?synchronis|aucune synchronisation|non synchronis|en attente/i,
    );
  });
});

describe('EcranAccueil — état erreur (l’écart nommé par A29)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un `useLiveQuery` dont le rejet n'est pas
  // attrapé — l'écran tombe, et l'auditeur voit une page blanche sans cause ni
  // action, au moment où ses données locales lui font le plus défaut.
  it('@critique si la lecture locale REJETTE, l’écran affiche une erreur en français (cause + action), sans tomber', async () => {
    terrain = terrainDeBase(await baseDontLesLecturesEchouent());
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<EcranAccueil />);
      const alerte = await screen.findByRole('alert');
      expect(alerte.textContent).toMatch(/[a-zéèêàç]/);
      expect(alerte.textContent.length).toBeGreaterThan(20);
    } finally {
      silence.mockRestore();
    }
  });
});
