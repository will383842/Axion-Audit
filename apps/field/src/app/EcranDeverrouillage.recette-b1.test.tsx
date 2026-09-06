// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B1** de la recette novice n°1 (A54,
// 2026-09-06) : « l'écran qui CRÉE le mot de passe dit “Mot de passe incorrect” ».
//
// ── STATUT DE CE FICHIER, ÉCRIT EN EN-TÊTE POUR QU'IL NE SE DÉGUISE PAS ─────
// Ce sont des tests de CONCEPTION, écrits par A20 en même temps que le
// correctif. Ils ne sont PAS les tests d'acceptation du bloquant : ceux-là
// reviennent à A27, qui n'a pas écrit ce code (09 §5.6). Aucun n'est marqué
// `@critique` — un correctif de pilote ne se décerne pas à lui-même le sceau
// qui rend un test non skippable.
//
// Ce qu'ils tiennent : le message doit dire CE QUI EST ATTENDU, et jamais
// diagnostiquer une erreur qui n'a pas eu lieu. La formulation exacte peut
// changer ; ce qui ne peut pas changer, c'est qu'au premier usage, champ vide,
// l'écran ne prononce ni « incorrect » ni « déverrouillage impossible », et
// que le coffre n'est même pas appelé.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E44 (UX/UI, 4 états).
// =============================================================================
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValeurTerrain } from './contexte.js';
import { EcranDeverrouillage } from './EcranDeverrouillage.js';

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

function champs(): readonly HTMLInputElement[] {
  return [...document.querySelectorAll('input[type="password"]')].filter(
    (noeud): noeud is HTMLInputElement => noeud instanceof HTMLInputElement,
  );
}

/** Le n-ième champ de mot de passe, ou un échec NOMMÉ — jamais une assertion. */
function champ(rang: number): HTMLInputElement {
  const trouve = champs()[rang];
  if (trouve === undefined) throw new Error(`aucun champ de mot de passe au rang ${String(rang)}`);
  return trouve;
}

function soumettre(): void {
  const bouton = document.querySelector('button[type="submit"]');
  if (!(bouton instanceof HTMLButtonElement)) throw new Error('aucun bouton de soumission');
  fireEvent.click(bouton);
}

beforeEach(() => {
  terrain = terrainDeBase();
});

describe('B1 — premier usage, champ vide', () => {
  it('l’écran dit ce qui est attendu, et ne prononce NI « incorrect » NI « déverrouillage impossible »', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);
    soumettre();

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/saisissez un mot de passe/i);
    expect(document.body.textContent).not.toMatch(/incorrect/i);
    expect(document.body.textContent).not.toMatch(/déverrouillage impossible/i);
  });

  it('le coffre n’est PAS appelé : rien n’est présenté à la crypto', () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);
    soumettre();
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it('le bouton reste ACTIF — un cadenas muet est interdit (03 §19.1)', () => {
    terrain = terrainDeBase({ premierUsage: true });
    render(<EcranDeverrouillage />);
    const bouton = document.querySelector('button[type="submit"]');
    expect(bouton instanceof HTMLButtonElement && bouton.disabled).toBe(false);
  });
});

describe('B1 — reprise (un coffre existe), champ vide', () => {
  it('l’écran demande le mot de passe au lieu de le déclarer faux', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: false, ouvrir });
    render(<EcranDeverrouillage />);
    soumettre();

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/saisissez votre mot de passe/i);
    expect(alerte.textContent).not.toMatch(/incorrect/i);
    expect(ouvrir).not.toHaveBeenCalled();
  });
});

describe('M5 — la confirmation au premier usage', () => {
  it('deux saisies différentes : l’écran le dit et n’appelle pas le coffre', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);
    expect(champs()).toHaveLength(2);
    fireEvent.change(champ(0), { target: { value: 'phrase-de-passe-1' } });
    fireEvent.change(champ(1), { target: { value: 'phrase-de-passe-2' } });
    soumettre();

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/différentes/i);
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it('deux saisies identiques : le coffre est appelé avec le mot de passe, exactement', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);
    fireEvent.change(champ(0), { target: { value: 'phrase-de-passe-identique' } });
    fireEvent.change(champ(1), { target: { value: 'phrase-de-passe-identique' } });
    soumettre();

    await waitFor(() => {
      expect(ouvrir).toHaveBeenCalledWith('phrase-de-passe-identique');
    });
  });

  it('à la REPRISE, aucun second champ n’est demandé : le coffre est le juge', () => {
    terrain = terrainDeBase({ premierUsage: false });
    render(<EcranDeverrouillage />);
    expect(champs()).toHaveLength(1);
  });
});
