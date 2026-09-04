// =============================================================================
// TESTS DE L'ÉCRAN DE STOCKAGE — lot L5, incrément L5a (revue A29, R-L5a-7).
//
// Écrits par A26 depuis 05 §31-2 (« si la persistance est refusée par le
// navigateur, la mission N'EST PAS embarquée et l'écran guide l'utilisateur
// (installation sur l'écran d'accueil / libération d'espace) »), 03 §22.1
// (alerte quota), 03 §33.2 (4 états) et 03 §17.6 (cause ET action) — contre le
// contrat `ValeurTerrain` et les signatures de `stockage.ts`, sans lire le corps
// de l'écran (09 §5.6).
//
// L'ÉCART NOMMÉ PAR A29 : tant que la persistance est INCONNUE (`stockage`
// encore `null`, mesure en cours), l'écran doit montrer « chargement » — pas
// « erreur ». Un refus n'est pas encore survenu ; l'annoncer, c'est la pastille
// qui rougit sans cause (LOT_L5.md §3.6, même famille de mensonge).
//
// Traçabilité : E44 (UX/UI — grille §33, 4 états) · E6 (hors ligne total —
// sans persistance accordée, pas de collecte hors ligne fiable).
// =============================================================================
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from './contexte.js';
import { EcranStockage } from './EcranStockage.js';
import type * as Stockage from '../local/stockage.js';
import { alerteEspace, type EtatStockage, type ResultatPersistance } from '../local/stockage.js';

const GUIDAGE_SENTINELLE = 'SENTINELLE_GUIDAGE_PERSISTANCE_TD6W2M';

let terrain: ValeurTerrain;
let verdictPersistance: ResultatPersistance;

vi.mock('./contexte.js', () => ({
  useTerrain: () => terrain,
}));

vi.mock('../local/stockage.js', async (importerReel) => {
  const reel = await importerReel<typeof Stockage>();
  return {
    ...reel,
    exigerPersistance: vi.fn(() => Promise.resolve(verdictPersistance)),
  };
});

const GIO = 1024 * 1024 * 1024;

function etat(surcharges: Partial<EtatStockage> = {}): EtatStockage {
  return {
    persistant: true,
    quotaOctets: 10 * GIO,
    utiliseOctets: 1 * GIO,
    ratio: 0.1,
    niveau: 'ok',
    ...surcharges,
  };
}

function terrainDeBase(surcharges: Partial<ValeurTerrain> = {}): ValeurTerrain {
  return {
    phase: 'verrouille',
    panne: null,
    premierUsage: false,
    base: null,
    verrou: {
      verrouille: false,
      delaiCourantMs: 15 * 60 * 1000,
      ecranMaintenuEveille: false,
      msAvantVerrouillage: () => 0,
      verrouillerMaintenant: () => undefined,
      signalerDeverrouillage: () => undefined,
    },
    navigation: { pile: ['stockage'] },
    vue: 'stockage',
    stockage: etat(),
    jetonSiege: 'inconnu',
    naviguer: () => undefined,
    memoriserJetonSiege: () => Promise.resolve(),
    oublierJetonSiege: () => Promise.resolve(),
    ouvrir: () => Promise.resolve(),
    fermer: () => undefined,
    rafraichirStockage: () => Promise.resolve(),
    ...surcharges,
  };
}

function boutonDemande(): HTMLElement {
  const boutons = screen.getAllByRole('button');
  const cible = boutons.find((b) =>
    /persist|autoris|activer|conserv|demander/i.test(b.textContent),
  );
  if (cible) return cible;
  const [premier] = boutons;
  if (premier === undefined) throw new Error('aucun bouton');
  return premier;
}

beforeEach(() => {
  terrain = terrainDeBase();
  verdictPersistance = { accordee: true, etat: etat() };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('EcranStockage — état chargement (l’écart nommé par A29)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `stockage === null` lu comme « refusé ».
  // L'auditeur verrait une erreur rouge à chaque ouverture, le temps que
  // `storage.estimate()` réponde — et apprendrait à l'ignorer, y compris le
  // jour où elle serait vraie.
  it('@critique persistance INCONNUE (`stockage` null) ⇒ un statut occupé, et AUCUNE alerte', () => {
    terrain = terrainDeBase({ stockage: null });
    render(<EcranStockage />);
    expect(screen.queryByRole('alert')).toBeNull();
    const statut = document.querySelector('[role="status"][aria-busy="true"]');
    expect(statut).not.toBeNull();
    expect(statut?.textContent).toMatch(/[a-zéèêàç]/);
  });
});

describe('EcranStockage — état nominal', () => {
  it('persistance accordée et espace ok ⇒ pas d’alerte, l’espace est décrit en français', () => {
    render(<EcranStockage />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.body.textContent).toMatch(/[a-zéèêàç]/);
    expect(document.body.textContent).toMatch(/espace|stockage/i);
  });

  it('espace TENDU ⇒ le message d’`alerteEspace` est affiché tel quel (une seule voix, 03 §22.1)', () => {
    const tendu = etat({ ratio: 0.85, utiliseOctets: 8.5 * GIO, niveau: 'tendu' });
    terrain = terrainDeBase({ stockage: tendu });
    render(<EcranStockage />);
    const message = alerteEspace(tendu);
    expect(message).not.toBeNull();
    expect(document.body.textContent).toContain(message ?? '');
  });
});

describe('EcranStockage — état vide (persistance accordée, rien à mesurer)', () => {
  // `estimate()` peut manquer là où `persist()` existe : la persistance est
  // acquise, l'espace est inconnu. Ce n'est ni une erreur ni un chargement.
  it('persistance accordée mais espace non mesurable ⇒ ni alerte ni occupation, une explication en français', () => {
    terrain = terrainDeBase({
      stockage: etat({ quotaOctets: null, utiliseOctets: null, ratio: null, niveau: 'inconnu' }),
    });
    render(<EcranStockage />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.body.textContent).toMatch(/[a-zéèêàç]/);
  });
});

describe('EcranStockage — état erreur (05 §31-2)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un refus du navigateur rendu comme un simple
  // texte gris, ou un « Continuer » qui embarque quand même.
  it('@critique persistance REFUSÉE ⇒ une alerte en français avec le guidage (cause + action)', () => {
    terrain = terrainDeBase({ stockage: etat({ persistant: false }) });
    render(<EcranStockage />);
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toMatch(/[a-zéèêàç]/);
    expect(alerte.textContent.length).toBeGreaterThan(20);
  });

  it('@critique demander la persistance et se la voir refuser ⇒ le guidage du verdict est affiché, tel quel', async () => {
    verdictPersistance = {
      accordee: false,
      motif: 'refusee_par_le_navigateur',
      guidage: GUIDAGE_SENTINELLE,
      etat: etat({ persistant: false }),
    };
    terrain = terrainDeBase({ stockage: etat({ persistant: false }) });
    render(<EcranStockage />);
    fireEvent.click(boutonDemande());
    await waitFor(() => {
      expect(document.body.textContent).toContain(GUIDAGE_SENTINELLE);
    });
    expect(screen.getByRole('alert').textContent).toContain(GUIDAGE_SENTINELLE);
  });

  it('demander la persistance et l’obtenir ⇒ aucune alerte, et l’état du terrain est rafraîchi', async () => {
    const rafraichirStockage = vi.fn(() => Promise.resolve());
    verdictPersistance = { accordee: true, etat: etat() };
    terrain = terrainDeBase({ stockage: etat({ persistant: false }), rafraichirStockage });
    const { rerender } = render(<EcranStockage />);
    expect(screen.queryByRole('alert')).not.toBeNull();
    fireEvent.click(boutonDemande());
    await waitFor(() => {
      expect(rafraichirStockage).toHaveBeenCalled();
    });
    // Ce que `rafraichirStockage` produira dans le vrai contexte : l'état accordé.
    terrain = terrainDeBase({ stockage: etat({ persistant: true }), rafraichirStockage });
    rerender(<EcranStockage />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
