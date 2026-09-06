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
import { MOT_DE_PASSE_LONGUEUR_MIN } from '@axion/shared';
import { CoffreIllisibleError, CoffreInexploitableError } from '../local/coffre.js';
import { DonneesSansCoffreError } from '../local/coffre-appareil.js';
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

// =============================================================================
// ANOMALIE DE COFFRE ET POLITIQUE DE MOT DE PASSE
//
// Ajoutés le 2026-09-05 par A26, depuis le verdict A51 du 2026-09-04 (F-22 et
// F-23) et depuis le contrat public de `AnomalieCoffreError` (une CAUSE dans le
// message, une ACTION dans `action`). L'écran est le dernier endroit où l'on
// peut empêcher le geste destructeur : devant un appareil qui ne s'ouvre pas, le
// premier réflexe est de « repartir propre », et c'est précisément celui qui rend
// les données définitivement illisibles.
// =============================================================================

/** Cinq caractères : sous la politique, et assez distinctif pour être cherché dans le DOM. */
const MDP_COURT = 'Zk9Qx';

describe('EcranDeverrouillage — anomalie de coffre (A51, F-22)', () => {
  it('@critique une `AnomalieCoffreError` affiche la CAUSE ET l’ACTION, et l’action interdit de recréer une protection', async () => {
    const anomalie = new CoffreIllisibleError(
      'sa forme n’est pas celle attendue sur : parametres.memoireKio',
    );
    terrain = terrainDeBase({ ouvrir: () => Promise.reject(anomalie) });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());

    const alerte = await screen.findByRole('alert');
    // Les DEUX, intégralement : perdre l'action en route reviendrait à laisser
    // l'auditeur devant un écran qui dit que rien ne marche, sans lui dire ce qui
    // détruirait ses données.
    expect(alerte.textContent).toContain(anomalie.message);
    expect(alerte.textContent).toContain(anomalie.action);
    expect(alerte.textContent).toMatch(/ne créez pas/i);
    expect(document.body.textContent).not.toContain(MDP_SENTINELLE);
  });
});

describe('EcranDeverrouillage — politique de mot de passe (A51, F-23)', () => {
  it('@critique premier usage + 5 caractères : `ouvrir` n’est PAS appelée, une alerte s’affiche, et le mot de passe n’est nulle part ailleurs que dans son champ', async () => {
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_COURT } });
    fireEvent.click(boutonDeSoumission());

    const alerte = await screen.findByRole('alert');
    expect(ouvrir).not.toHaveBeenCalled();
    expect(alerte.textContent).toContain(String(MOT_DE_PASSE_LONGUEUR_MIN));
    expect(alerte.textContent).toMatch(/[a-zéèêàç]/);
    expect(alerte.textContent).not.toContain(MDP_COURT);

    // « Nulle part dans le DOM » se dit précisément : la SEULE occurrence légitime
    // est la valeur du champ de saisie — un champ de mot de passe contient le mot
    // de passe, c'est sa fonction. On la retire, et il ne doit plus rien rester.
    const champ = champMotDePasse();
    expect(champ.value).toBe(MDP_COURT); // anti-vacuité : la saisie a bien eu lieu
    champ.remove();
    expect(document.body.innerHTML).not.toContain(MDP_COURT);
  });

  it('@critique non-premier-usage + 5 caractères : `ouvrir` EST appelée — la politique ne ferme jamais un coffre existant', async () => {
    // Le pendant obligatoire du test précédent : une politique opposée au
    // déverrouillage n'ajouterait aucune sécurité et rendrait inaccessible une
    // base créée sous l'ancienne règle (invariant 7).
    const ouvrir = vi.fn(() => Promise.resolve());
    terrain = terrainDeBase({ premierUsage: false, ouvrir });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_COURT } });
    fireEvent.click(boutonDeSoumission());

    await waitFor(() => {
      expect(ouvrir).toHaveBeenCalledWith(MDP_COURT);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('premier usage : l’écran ANNONCE la longueur minimale avant de l’opposer', () => {
    // 03 §17.6 et l'en-tête de l'écran : un auditeur qui découvre une règle en la
    // violant a déjà perdu confiance dans l'outil.
    terrain = terrainDeBase({ premierUsage: true });
    render(<EcranDeverrouillage />);
    expect(document.body.textContent).toContain(String(MOT_DE_PASSE_LONGUEUR_MIN));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// =============================================================================
// R3 — UNE ANOMALIE DE COFFRE AU PREMIER USAGE : L'ÉCRAN NE PROPOSE PLUS CE
// QU'IL INTERDIT
//
// Ajouté le 2026-09-05 par A26, depuis la revue croisée A29 du même jour (R3,
// MAJEUR) et le correctif d'A24 qui la ferme. Je n'ai écrit aucune ligne de
// l'écran éprouvé ici (09 §5.6).
//
// ── CE QU'A29 A DÉCRIT, ET QUE LE TEST D'HIER NE POUVAIT PAS VOIR ───────────
// `EcranDeverrouillage.test.tsx` éprouvait déjà qu'une `AnomalieCoffreError`
// affiche cause ET action — mais avec `premierUsage` à sa valeur par défaut
// (`false`), c'est-à-dire sur le seul chemin où la contradiction n'apparaît pas.
// Au PREMIER usage, l'auditeur voyait dans cet ordre : « Préparer cet appareil »,
// « Première utilisation de cet appareil […] choisissez-en un d'au moins 12
// caractères », puis l'alerte « Ne créez PAS de protection sur cet appareil », et
// enfin le bouton, ACTIF, « Créer la protection de cet appareil ».
//
// Le message le plus cliquable était celui qui détruit la journée de collecte.
// 03 §33.2 demande un état d'erreur COHÉRENT, et la doctrine du bloquant B4 du
// 2026-09-02 (`DECISIONS.md`) interdit deux messages contraires ensemble.
//
// Traçabilité : E23, E33, E44 ; 03 §17.6, §33.2 ; invariant 7.
// =============================================================================
describe('EcranDeverrouillage — R3 : anomalie de coffre AU PREMIER USAGE', () => {
  /** Le cas exact d'A29 : des données locales, aucun coffre, au premier usage. */
  const anomaliePremierUsage = (): DonneesSansCoffreError => new DonneesSansCoffreError(37);

  it('@critique l’écran retire le FORMULAIRE, le BOUTON et le message « Première utilisation »', async () => {
    const ouvrir = vi.fn(() => Promise.reject(anomaliePremierUsage()));
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);

    // Anti-vacuité : AVANT la soumission, l'écran de premier usage est bien là,
    // avec son bouton et son message d'info. Sans ce contrôle, un écran qui
    // n'afficherait jamais rien passerait au vert.
    expect(champMotDePasse()).not.toBeNull();
    expect(boutonDeSoumission()).not.toBeNull();
    expect(document.body.textContent).toContain('Première utilisation');

    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());
    await screen.findByRole('alert');

    // Et après : plus rien à cliquer, plus rien à saisir, plus d'invitation.
    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(document.body.textContent).not.toContain('Première utilisation');
    expect(document.body.textContent).not.toContain('Créer la protection');
  });

  it('@critique le TITRE devient « Anomalie du coffre », et l’action dit « sans recharger ni réinstaller »', async () => {
    const anomalie = anomaliePremierUsage();
    terrain = terrainDeBase({ premierUsage: true, ouvrir: () => Promise.reject(anomalie) });
    render(<EcranDeverrouillage />);

    // Anti-vacuité : le titre de départ est bien celui du premier usage.
    expect(screen.getByRole('heading').textContent).toContain('Préparer cet appareil');

    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());
    const alerte = await screen.findByRole('alert');

    expect(screen.getByRole('heading').textContent).toContain('Anomalie du coffre');
    expect(alerte.textContent).toContain(anomalie.message);
    expect(alerte.textContent).toContain(anomalie.action);
    expect(alerte.textContent).toMatch(/ne créez pas/i);
    // La formule qui devance le geste destructeur. Elle manquait à cette
    // erreur-ci — la SEULE de la famille qui atteigne l'écran par ce chemin.
    expect(alerte.textContent).toContain('sans recharger ni réinstaller');
    expect(document.body.textContent).not.toContain(MDP_SENTINELLE);
  });

  it('@critique anti-vacuité de R3 : une erreur ORDINAIRE au premier usage laisse le formulaire VIVANT', async () => {
    // Le bord opposé, et il compte autant : un mot de passe mal tapé ne doit pas
    // fermer l'écran. Une correction qui retirerait le formulaire sur toute
    // erreur empêcherait de préparer un appareil après une seule faute de frappe.
    const ouvrir = vi
      .fn<(mdp: string) => Promise<void>>()
      .mockRejectedValueOnce(
        new Error('Mot de passe incorrect. Aucune donnée locale n’a été modifiée.'),
      );
    terrain = terrainDeBase({ premierUsage: true, ouvrir });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());
    await screen.findByRole('alert');

    expect(document.querySelector('form')).not.toBeNull();
    expect(boutonDeSoumission()).not.toBeNull();
    expect(screen.getByRole('heading').textContent).toContain('Préparer cet appareil');
  });
});

// =============================================================================
// R1, CÔTÉ ÉCRAN — `traduire()` NE LAISSE PASSER AUCUNE CHAÎNE TECHNIQUE
//
// Le défaut d'origine, mesuré par A29 : `deverrouiller(base, bonMotDePasse)` sur
// un coffre trafiqué rendait `DataError: Invalid key length`, et `traduire()`
// affichait `cause.message` tel quel — en anglais, sans action, et surtout sans
// « Ne créez PAS de nouvelle protection », la seule phrase qui, sur cette famille
// de pannes, empêche la destruction.
//
// Le correctif ne vit pas dans l'écran mais dans `local/coffre-appareil.ts`, qui
// enveloppe au plus près (`CoffreInexploitableError`). Ce test éprouve donc la
// JONCTION : l'erreur telle que le module la produit RÉELLEMENT, rendue par
// l'écran tel qu'il est livré. Invariant 5 (interface 100 % en français) et 03
// §17.6 (« aucune erreur technique brute n'atteint l'écran »).
// =============================================================================
describe('EcranDeverrouillage — R1 : aucune chaîne technique anglaise n’atteint l’écran', () => {
  it('@critique une panne WebCrypto enveloppée s’affiche en français, avec l’action, et sa cause reste invisible', async () => {
    // La cause d'origine, à l'identique de ce que WebCrypto lève.
    const causeTechnique = new DOMException('Invalid key length', 'DataError');
    const anomalie = new CoffreInexploitableError(causeTechnique);
    terrain = terrainDeBase({ ouvrir: () => Promise.reject(anomalie) });
    render(<EcranDeverrouillage />);
    fireEvent.change(champMotDePasse(), { target: { value: MDP_SENTINELLE } });
    fireEvent.click(boutonDeSoumission());
    const alerte = await screen.findByRole('alert');

    // Anti-vacuité : la cause d'origine EXISTE et porte bien le texte anglais —
    // sans quoi « il n'apparaît pas à l'écran » ne prouverait rien.
    expect(anomalie.cause).toBe(causeTechnique);
    expect(causeTechnique.message).toContain('Invalid key length');

    for (const fragment of ['DataError', 'Invalid key length', 'should be', 'at least']) {
      expect(document.body.textContent).not.toContain(fragment);
    }
    expect(alerte.textContent).toMatch(/[éèêàçù]/);
    expect(alerte.textContent).toMatch(/ne créez pas/i);
    expect(alerte.textContent).toContain('sans recharger ni réinstaller');
    // Et l'écran s'est fermé : sur cette famille, il n'y a rien à réessayer.
    expect(document.querySelector('form')).toBeNull();
  });
});
