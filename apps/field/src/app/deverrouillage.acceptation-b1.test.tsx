// =============================================================================
// TESTS D'ACCEPTATION A27 — bloquant **B1** de la recette novice n°1 (A54,
// 2026-09-06), et le chemin **F-22** qui vit sur le même écran.
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// ACCEPTATION. Écrit par A27, qui n'a produit AUCUNE ligne de l'écran éprouvé
// ici ni de son correctif (09 §5.6). Ces tests portent `@critique` : ils tiennent
// le premier écran que voit un auditeur, et le seul message capable de lui faire
// détruire une journée de collecte.
//
// ── CE QUI EST ÉPROUVÉ, ET POURQUOI CHAQUE POINT EST LÀ ─────────────────────
// A54 a mesuré, chronomètre en main, qu'un novice est arrêté à t+1 min : bouton
// tapé champ vide, l'écran répondait « Déverrouillage impossible / Mot de passe
// incorrect » alors qu'il CRÉE le mot de passe. Le novice cherche un mot de passe
// qui n'existe pas, et appelle le siège.
//
// Le correctif se juge sur QUATRE points, et le quatrième est le plus fragile :
//   ① au premier usage, l'écran dit ce qu'il attend, sous le titre « Protection
//      non créée » — un titre qui ne diagnostique rien ;
//   ② à la reprise, il demande le mot de passe au lieu de le déclarer faux ;
//   ③ le bouton reste ACTIF (03 §19.1 : jamais un cadenas muet) ;
//   ④ **assertion négative** : le mot « incorrect » ne se prononce QUE lorsqu'un
//      mot de passe a réellement été présenté à un coffre EXISTANT. Un correctif
//      qui se contenterait de retirer le mot partout serait vert sur ① ② ③ et
//      aurait supprimé la seule phrase juste de l'écran. La matrice ci-dessous
//      parcourt donc les chemins d'erreur, et exige le mot sur le SEUL où il est
//      vrai.
//
// ── F-22 : LE CHEMIN QUI A MANQUÉ DE DISPARAÎTRE DEUX FOIS ──────────────────
// Une `AnomalieCoffreError` au déverrouillage doit RETIRER le formulaire et son
// bouton. Un comptage de symboles dit qu'un correctif est présent ; seul un test
// dit qu'il est ATTEINT. Il est éprouvé ici sur les DEUX chemins d'entrée
// (premier usage et reprise) et sur DEUX membres de la famille : la garde vaut
// pour `AnomalieCoffreError`, pas pour une classe nommée.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E33 (sécurité / RGPD),
// E44 (UX/UI, 4 états).
// =============================================================================
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoffreIllisibleError, MotDePasseInvalideError } from '../local/coffre.js';
import { DonneesSansCoffreError } from '../local/coffre-appareil.js';
import type { ValeurTerrain } from './contexte.js';
import { EcranDeverrouillage } from './EcranDeverrouillage.js';

/** Assez long pour passer la politique : ce test ne mesure pas la longueur. */
const MDP_A27 = 'SENTINELLE_A27_DEVERROUILLAGE_7Q4';

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

/** Les champs de mot de passe présents à l'écran, dans l'ordre du DOM. */
function champs(): readonly HTMLInputElement[] {
  return [...document.querySelectorAll('input[type="password"]')].filter(
    (noeud): noeud is HTMLInputElement => noeud instanceof HTMLInputElement,
  );
}

function bouton(): HTMLButtonElement {
  const trouve = document.querySelector('button[type="submit"]');
  if (!(trouve instanceof HTMLButtonElement)) throw new Error('aucun bouton de soumission');
  return trouve;
}

/** Saisit dans le n-ième champ, sans supposer qu'il y en ait un second. */
function saisir(index: number, valeur: string): void {
  const champ = champs()[index];
  if (champ === undefined) throw new Error(`aucun champ de mot de passe n° ${String(index)}`);
  fireEvent.change(champ, { target: { value: valeur } });
}

beforeEach(() => {
  terrain = terrainDeBase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B1 — champ vide AU PREMIER USAGE : l’écran dit ce qu’il attend', () => {
  it('@critique la phrase exacte du rapport A54, sous « Protection non créée », coffre NON appelé', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);

    // Anti-vacuité : avant le geste, aucune alerte — l'écran ne crie pas d'avance.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).toContain('Première utilisation');

    fireEvent.click(bouton());
    const encart = await screen.findByRole('alert');

    expect(encart.textContent).toContain('Saisissez un mot de passe pour protéger cet appareil');
    expect(encart.textContent).toContain('Protection non créée');
    expect(document.body.textContent).not.toContain('Déverrouillage impossible');
    // Le point de fond : rien n'a été présenté à la crypto. Le refus de
    // `deriverKek` devant une chaîne vide n'est pas une phrase d'accueil.
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it('@critique le bouton reste ACTIF après le refus — 03 §19.1 interdit le cadenas muet', async () => {
    terrain = terrainDeBase({ premierUsage: true });
    render(<EcranDeverrouillage />);
    fireEvent.click(bouton());
    await screen.findByRole('alert');
    expect(bouton().disabled).toBe(false);
    expect(bouton().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('@critique la saisie n’est pas effacée par un refus de validation : on complète, on ne retape pas', async () => {
    terrain = terrainDeBase({ premierUsage: true });
    render(<EcranDeverrouillage />);
    saisir(0, MDP_A27);
    fireEvent.click(bouton()); // la confirmation manque
    await screen.findByRole('alert');
    expect(champs()[0]?.value).toBe(MDP_A27);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B1 — champ vide À LA REPRISE : l’écran demande, il ne diagnostique pas', () => {
  it('@critique la phrase exacte du rapport A54, et le coffre n’est pas appelé', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: false, ouvrir });
    render(<EcranDeverrouillage />);

    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(bouton());
    const encart = await screen.findByRole('alert');

    expect(encart.textContent).toContain(
      'Saisissez votre mot de passe pour déverrouiller la collecte',
    );
    expect(ouvrir).not.toHaveBeenCalled();
    expect(bouton().disabled).toBe(false);
  });

  it('@critique à la reprise, AUCUN second champ : le coffre est le juge, une seconde saisie ne protège de rien', () => {
    terrain = terrainDeBase({ premierUsage: false });
    render(<EcranDeverrouillage />);
    expect(champs()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L'ASSERTION NÉGATIVE — le cœur de B1, et le seul garde qui empêche de
// « corriger » le défaut en supprimant la vérité avec le mensonge.
// ─────────────────────────────────────────────────────────────────────────────
describe('B1 — « incorrect » ne se prononce QUE sur un mot de passe réellement présenté', () => {
  /**
   * Les chemins où le mot serait un mensonge.
   *
   * `titreDiagnostic` : le titre « Déverrouillage impossible » n'est interdit
   * qu'au PREMIER USAGE — c'est là qu'il est faux, et c'est le constat B1 mot
   * pour mot. À la reprise, l'écran le porte encore sur un champ vide alors que
   * rien n'a été tenté ; A27 le remonte comme défaut MINEUR (rapport du
   * 2026-09-06) et ne le transforme pas en critère de porte que le pack n'écrit
   * nulle part. Un test d'acceptation éprouve la spec, pas le goût de son auteur.
   */
  const CHEMINS_MUETS = [
    {
      nom: 'premier usage, champ vide',
      premierUsage: true,
      titreDiagnosticInterdit: true,
      gestes: (): void => undefined,
    },
    {
      nom: 'reprise, champ vide',
      premierUsage: false,
      titreDiagnosticInterdit: false,
      gestes: (): void => undefined,
    },
    {
      nom: 'premier usage, mot de passe trop court',
      premierUsage: true,
      titreDiagnosticInterdit: true,
      gestes: (): void => {
        saisir(0, 'court');
      },
    },
    {
      nom: 'premier usage, deux saisies différentes',
      premierUsage: true,
      titreDiagnosticInterdit: true,
      gestes: (): void => {
        saisir(0, MDP_A27);
        saisir(1, `${MDP_A27}X`);
      },
    },
  ] as const;

  for (const chemin of CHEMINS_MUETS) {
    it(`@critique ${chemin.nom} : le mot « incorrect » ne se prononce pas, et le coffre reste intact`, async () => {
      const ouvrir = vi.fn(() => Promise.resolve());
      terrain = terrainDeBase({ premierUsage: chemin.premierUsage, ouvrir });
      render(<EcranDeverrouillage />);
      chemin.gestes();
      fireEvent.click(bouton());
      await screen.findByRole('alert');

      expect(document.body.textContent).not.toMatch(/incorrect/i);
      if (chemin.titreDiagnosticInterdit) {
        expect(document.body.textContent).not.toMatch(/déverrouillage impossible/i);
      }
      expect(ouvrir).not.toHaveBeenCalled();
    });
  }

  it('@critique le SEUL chemin où le mot est vrai : un mot de passe présenté à un coffre existant', async () => {
    const refus = new MotDePasseInvalideError();
    const ouvrir = vi.fn(() => Promise.reject(refus));
    terrain = terrainDeBase({ premierUsage: false, ouvrir });
    render(<EcranDeverrouillage />);
    saisir(0, MDP_A27);
    fireEvent.click(bouton());
    const encart = await screen.findByRole('alert');

    // Anti-vacuité de l'assertion négative : sans ce test, retirer le mot
    // « incorrect » de tout l'écran rendrait les quatre précédents verts.
    expect(encart.textContent).toMatch(/incorrect/i);
    expect(document.body.textContent).toContain('Déverrouillage impossible');
    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(ouvrir).toHaveBeenCalledWith(MDP_A27);
    // Le mot de passe saisi ne s'affiche jamais, ni en clair ni en écho.
    expect(document.body.textContent).not.toContain(MDP_A27);
  });

  it('@critique au premier usage, une erreur du COFFRE atteint bien l’écran : la validation ne l’avale pas', async () => {
    // Le garde structurel qui manquait au test d'anti-vacuité de R3 : sans lui,
    // une future garde de saisie produirait l'alerte À LA PLACE du coffre, et le
    // test resterait vert en n'éprouvant plus rien.
    const ouvrir = vi.fn(() => Promise.reject(new Error('Panne fictive du coffre.')));
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);
    saisir(0, MDP_A27);
    saisir(1, MDP_A27);
    fireEvent.click(bouton());
    const encart = await screen.findByRole('alert');

    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(ouvrir).toHaveBeenCalledWith(MDP_A27);
    expect(encart.textContent).toContain('Panne fictive du coffre.');
    // Une erreur ORDINAIRE laisse le formulaire vivant : on recommence.
    expect(document.querySelector('form')).not.toBeNull();
    expect(bouton()).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('F-22 — une anomalie de coffre RETIRE le formulaire, sur les deux chemins', () => {
  const FAMILLE = [
    {
      nom: 'DonneesSansCoffreError (premier usage)',
      premierUsage: true,
      faire: (): DonneesSansCoffreError => new DonneesSansCoffreError(37),
    },
    {
      nom: 'CoffreIllisibleError (premier usage)',
      premierUsage: true,
      faire: (): CoffreIllisibleError =>
        new CoffreIllisibleError('champ « sel » absent (détail fictif de recette)'),
    },
    {
      nom: 'CoffreIllisibleError (reprise)',
      premierUsage: false,
      faire: (): CoffreIllisibleError =>
        new CoffreIllisibleError('champ « sel » absent (détail fictif de recette)'),
    },
  ] as const;

  for (const cas of FAMILLE) {
    it(`@critique ${cas.nom} : plus de formulaire, plus de bouton, « Anomalie du coffre », « Ne créez PAS »`, async () => {
      const anomalie = cas.faire();
      terrain = terrainDeBase({
        premierUsage: cas.premierUsage,
        ouvrir: () => Promise.reject(anomalie),
      });
      render(<EcranDeverrouillage />);

      // Anti-vacuité : le formulaire EXISTE avant le geste. Un écran qui ne
      // rendrait jamais rien passerait sinon au vert.
      expect(document.querySelector('form')).not.toBeNull();
      expect(bouton()).not.toBeNull();

      saisir(0, MDP_A27);
      if (cas.premierUsage) saisir(1, MDP_A27);
      fireEvent.click(bouton());
      const encart = await screen.findByRole('alert');

      expect(screen.getByRole('heading').textContent).toContain('Anomalie du coffre');
      expect(encart.textContent).toContain(anomalie.message);
      expect(encart.textContent).toContain(anomalie.action);
      expect(encart.textContent).toMatch(/ne créez pas/i);
      expect(encart.textContent).toContain('sans recharger ni réinstaller');

      // Le geste destructeur n'est plus atteignable : c'est cela, F-22.
      expect(document.querySelector('form')).toBeNull();
      expect(document.querySelector('input[type="password"]')).toBeNull();
      expect(screen.queryAllByRole('button')).toEqual([]);
      expect(document.body.textContent).not.toContain('Créer la protection');
      expect(document.body.textContent).not.toContain(MDP_A27);
    });
  }
});
