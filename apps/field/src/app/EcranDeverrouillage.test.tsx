// =============================================================================
// TESTS DE L'ÉCRAN DE DÉVERROUILLAGE — lot L5, incrément L5a (revue A29, R-L5a-7).
//
// Écrits par A26 depuis 03 §33.2 (les 4 états de tout écran : vide, chargement,
// erreur avec cause + action, nominal), 03 §17.6 (« chaque erreur dit la cause
// ET l'action »), 05 §9.7 (ressaisie du mot de passe au déverrouillage, aucun
// mécanisme affaibli) et le contrat `ValeurTerrain` de `contexte.tsx` — sans
// lire le corps de l'écran (09 §5.6). Le contexte est SIMULÉ : ce que l'écran
// reçoit est décidé ici, ce qu'il affiche est vérifié par rôles ARIA et par
// texte français, jamais par classes CSS.
//
// Les quatre états, lus pour un formulaire de mot de passe :
//   · vide      = premier usage (aucun coffre) : l'écran dit que la saisie CRÉE ;
//   · chargement = dérivation en cours après validation (Argon2id < 1 s, mais
//                  pas instantané) : l'écran le montre et refuse une 2ᵉ soumission ;
//   · erreur     = mot de passe faux : cause + action, en français, sans jamais
//                  afficher le mot de passe saisi ;
//   · nominal    = le formulaire, prêt.
//
// Traçabilité : E44 (UX/UI — grille §33, 4 états) · E33 (sécurité / RGPD).
// =============================================================================
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from './contexte.js';
import { EcranDeverrouillage } from './EcranDeverrouillage.js';

const MDP_SENTINELLE = 'SENTINELLE_MDP_ECRAN_VN8K3Q';

/** Le contexte simulé — remplacé test par test. */
let terrain: ValeurTerrain;

vi.mock('./contexte.js', () => ({
  useTerrain: () => terrain,
}));

function terrainDeBase(surcharges: Partial<ValeurTerrain> = {}): ValeurTerrain {
  return {
    phase: 'verrouille',
    panne: null,
    premierUsage: false,
    base: null,
    verrou: {
      verrouille: true,
      delaiCourantMs: 15 * 60 * 1000,
      ecranMaintenuEveille: false,
      msAvantVerrouillage: () => 0,
      verrouillerMaintenant: () => undefined,
      signalerDeverrouillage: () => undefined,
    },
    navigation: { pile: ['deverrouillage'] },
    vue: 'deverrouillage',
    stockage: null,
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

function champMotDePasse(): HTMLInputElement {
  const champ = document.querySelector('input[type="password"]');
  if (!(champ instanceof HTMLInputElement)) throw new Error('aucun champ mot de passe');
  return champ;
}

function boutonDeSoumission(): HTMLButtonElement {
  const bouton =
    document.querySelector('button[type="submit"]') ?? screen.getAllByRole('button')[0];
  if (!(bouton instanceof HTMLButtonElement)) throw new Error('aucun bouton');
  return bouton;
}

beforeEach(() => {
  terrain = terrainDeBase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EcranDeverrouillage — état nominal', () => {
  it('affiche un champ mot de passe, étiqueté en français, et un bouton de soumission', () => {
    render(<EcranDeverrouillage />);
    const champ = champMotDePasse();
    expect(champ.labels?.length ?? 0).toBeGreaterThan(0);
    expect(champ.labels?.[0]?.textContent).toMatch(/mot de passe/i);
    expect(boutonDeSoumission().textContent).toMatch(/[a-zéèêàç]/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('soumettre appelle `ouvrir` avec le mot de passe saisi, exactement', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ ouvrir });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());
    await waitFor(() => {
      expect(ouvrir).toHaveBeenCalledWith(MDP_SENTINELLE);
    });
  });
});

describe('EcranDeverrouillage — état vide (premier usage)', () => {
  it('quand aucun coffre n’existe, l’écran dit que le mot de passe saisi CRÉE le coffre', () => {
    terrain = terrainDeBase({ premierUsage: true });
    render(<EcranDeverrouillage />);
    expect(document.body.textContent).toMatch(/cré|premi|nouveau/i);
    expect(champMotDePasse()).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('EcranDeverrouillage — état chargement', () => {
  it('pendant la dérivation, l’écran le montre (statut ou bouton occupé) et refuse une seconde soumission', async () => {
    let liberer: () => void = () => undefined;
    const ouvrir = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          liberer = resolve;
        }),
    );
    terrain = terrainDeBase({ ouvrir });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());

    await waitFor(() => {
      const occupe =
        boutonDeSoumission().disabled ||
        boutonDeSoumission().getAttribute('aria-busy') === 'true' ||
        document.querySelector('[role="status"][aria-busy="true"]') !== null;
      expect(occupe).toBe(true);
    });
    fireEvent.click(boutonDeSoumission());
    expect(ouvrir).toHaveBeenCalledTimes(1);

    liberer();
  });
});

describe('EcranDeverrouillage — état erreur', () => {
  it('@critique un mot de passe refusé affiche une erreur en français (cause + action), sans le mot de passe dedans', async () => {
    terrain = terrainDeBase({
      ouvrir: () => Promise.reject(new Error('Mot de passe incorrect.')),
    });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/[a-zéèêàç]/);
    expect(alerte.textContent.length).toBeGreaterThan(15);
    expect(document.body.textContent).not.toContain(MDP_SENTINELLE);
  });

  it('après une erreur, on peut ressaisir et resoumettre (le formulaire n’est pas mort)', async () => {
    const ouvrir = vi
      .fn<(mdp: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Mot de passe incorrect.'))
      .mockResolvedValueOnce(undefined);
    terrain = terrainDeBase({ ouvrir });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: 'faux' } });
    fireEvent.click(boutonDeSoumission());
    await screen.findByRole('alert');

    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());
    await waitFor(() => {
      expect(ouvrir).toHaveBeenCalledTimes(2);
    });
    expect(ouvrir).toHaveBeenLastCalledWith(MDP_SENTINELLE);
  });
});
