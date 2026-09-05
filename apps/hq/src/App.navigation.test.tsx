// =============================================================================
// L7a — THÈME 1 : coquille et navigation de la console. Tests écrits AVANT le code
// par A36 (09 §3-2, §5.6). Hypothèses d'interface : `tests-aide/rendu-console.tsx`.
//
// Ce que ce fichier prouve : les trois vues existent et se joignent (accueil,
// portefeuille, mission) ; la navigation est intégralement praticable au clavier
// (§33.6 : « navigation clavier complète console ») ; le DOM rendu ne porte AUCUNE
// couleur ni taille en dur et ne consomme QUE des jetons de la charte (invariant 4).
// Traçabilité : E22 (console de pilotage 7 espaces — espaces 1 et 2 minimaux), E27 (design
// moderne, charte — jetons), E44 (UX/UI 2026-2027 — tokens), E43 (exécutabilité autopilote).
// =============================================================================
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import {
  balayerStylesEnDur,
  jetonsDefinis,
  jetonsInconnus,
  MOTIFS,
} from './tests-aide/balayage-dom.js';
import { ID, MISSION_TPE } from './tests-aide/fixtures-console.js';
import {
  elementsMission,
  LIBELLES,
  rendreConsole,
  ROUTES_CONSOLE,
  TITRES,
} from './tests-aide/rendu-console.js';
import { installerServeurFactice, type ServeurFactice } from './tests-aide/serveur-factice.js';

let serveur: ServeurFactice;

beforeEach(() => {
  serveur = installerServeurFactice();
});

afterEach(() => {
  serveur.restaurer();
});

describe('L7a — les vues attendues existent et se joignent', () => {
  it('rend l’accueil « Tour de contrôle » sous `/hq/` avec un <main> et un <h1>', async () => {
    rendreConsole(ROUTES_CONSOLE.accueil);
    const titre = await screen.findByRole('heading', { level: 1, name: TITRES.accueil });
    // Le titre vit DANS le <main>, pas dans la barre latérale.
    expect(screen.getByRole('main').contains(titre)).toBe(true);
  });

  it('rend le portefeuille sous `/hq/missions` avec ses missions', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByRole('heading', { level: 1, name: TITRES.portefeuille });
    await screen.findByText(MISSION_TPE.title);
    expect(elementsMission(await screen.findByRole('main')).length).toBeGreaterThanOrEqual(2);
  });

  it('rend l’écran d’une mission sous `/hq/missions/:id`, titré du nom de la mission', async () => {
    rendreConsole(ROUTES_CONSOLE.mission(ID.missionTpe));
    await screen.findByRole('heading', { level: 1, name: MISSION_TPE.title });
    // La mission a été demandée PAR SON IDENTIFIANT, pas relue depuis la liste :
    // un rechargement de l'onglet sur cet écran doit fonctionner.
    expect(
      serveur.appels.some((appel) => appel.url.pathname.endsWith(`/v1/missions/${ID.missionTpe}`)),
    ).toBe(true);
  });

  it('un chemin inconnu sous `/hq/` rend un message français, jamais une page blanche', async () => {
    rendreConsole('/hq/espace-qui-nexiste-pas');
    const messages = await screen.findAllByText(/introuvable|n[’']existe pas/i);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    const principal = screen.getByRole('main');
    expect(principal.textContent.trim()).not.toBe('');
  });
});

describe('L7a — la barre latérale relie les espaces et se pratique au clavier (§33.6)', () => {
  it('expose un <nav aria-label="Espaces"> dont les entrées sont de VRAIS liens', async () => {
    rendreConsole(ROUTES_CONSOLE.accueil);
    const navigation = await screen.findByRole('navigation', { name: LIBELLES.navigation });
    const liens = within(navigation).getAllByRole('link');
    expect(liens.length).toBeGreaterThanOrEqual(2);
    for (const lien of liens) {
      // Un `<div onClick>` n'est pas un lien : il ne se tabule pas, ne s'active pas
      // à Entrée, n'a pas de menu contextuel « ouvrir dans un nouvel onglet ».
      expect(lien.tagName).toBe('A');
      expect(lien.getAttribute('href')).toMatch(/^\/hq\//);
      expect(lien.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it('marque l’espace courant par `aria-current="page"` — et un seul', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    const navigation = await screen.findByRole('navigation', { name: LIBELLES.navigation });
    const courants = within(navigation)
      .getAllByRole('link')
      .filter((lien) => lien.getAttribute('aria-current') === 'page');
    expect(courants).toHaveLength(1);
    expect(courants[0]?.getAttribute('href')).toBe(ROUTES_CONSOLE.portefeuille);
  });

  it('un clic sur le lien « Portefeuille » change de vue SANS rechargement (pushState)', async () => {
    rendreConsole(ROUTES_CONSOLE.accueil);
    const navigation = await screen.findByRole('navigation', { name: LIBELLES.navigation });
    fireEvent.click(within(navigation).getByRole('link', { name: TITRES.portefeuille }));
    await screen.findByRole('heading', { level: 1, name: TITRES.portefeuille });
    expect(window.location.pathname).toBe(ROUTES_CONSOLE.portefeuille);
  });

  it('le bouton « précédent » du navigateur (popstate) ramène à la vue précédente', async () => {
    rendreConsole(ROUTES_CONSOLE.accueil);
    const navigation = await screen.findByRole('navigation', { name: LIBELLES.navigation });
    fireEvent.click(within(navigation).getByRole('link', { name: TITRES.portefeuille }));
    await screen.findByRole('heading', { level: 1, name: TITRES.portefeuille });

    window.history.replaceState(null, '', ROUTES_CONSOLE.accueil);
    fireEvent(window, new PopStateEvent('popstate'));
    await screen.findByRole('heading', { level: 1, name: TITRES.accueil });
  });

  it('chaque carte de mission du portefeuille est atteignable par un lien nommé', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSION_TPE.title);
    const principal = screen.getByRole('main');
    for (const element of elementsMission(principal)) {
      // Une carte cliquable qui n'est pas un lien est invisible au clavier.
      const liens = within(element).getAllByRole('link');
      expect(liens.length).toBeGreaterThanOrEqual(1);
      expect(
        liens.some((lien) => (lien.getAttribute('href') ?? '').startsWith('/hq/missions/')),
      ).toBe(true);
    }
  });

  it('suivre le lien d’une carte ouvre l’écran de la mission', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSION_TPE.title);
    const principal = screen.getByRole('main');
    const carte = elementsMission(principal).find((element) =>
      element.textContent.includes(MISSION_TPE.title),
    );
    expect(carte).toBeDefined();
    if (carte === undefined) return;
    const lien = within(carte)
      .getAllByRole('link')
      .find((candidat) => (candidat.getAttribute('href') ?? '').startsWith('/hq/missions/'));
    expect(lien).toBeDefined();
    if (lien === undefined) return;
    fireEvent.click(lien);
    await screen.findByRole('heading', { level: 1, name: MISSION_TPE.title });
    expect(window.location.pathname).toBe(ROUTES_CONSOLE.mission(ID.missionTpe));
  });

  it('aucun élément interactif n’est sorti de l’ordre de tabulation, aucun handler sur un <div>', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSION_TPE.title);
    const interactifs = document.body.querySelectorAll('a[href], button, input, select, textarea');
    expect(interactifs.length).toBeGreaterThan(0);
    for (const element of interactifs) {
      expect(element.getAttribute('tabindex')).not.toBe('-1');
    }
    // Un élément qui se veut bouton sans en être un : `role="button"` sur autre
    // chose qu'un <button> DOIT être focalisable, sinon le clavier ne l'atteint pas.
    for (const pseudoBouton of document.body.querySelectorAll('[role="button"]:not(button)')) {
      expect(Number(pseudoBouton.getAttribute('tabindex') ?? '-1')).toBeGreaterThanOrEqual(0);
    }
  });

  it('un « aller au contenu » ou un focus initial dans <main> est proposé (grand écran, §33.6)', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSION_TPE.title);
    const lienDEvitement = screen.queryByRole('link', { name: /aller au contenu/i });
    const principal = screen.getByRole('main');
    const principalFocalisable =
      principal.getAttribute('tabindex') !== null || principal.getAttribute('id') !== null;
    expect(lienDEvitement !== null || principalFocalisable).toBe(true);
  });
});

describe('L7a — invariant 4 : le DOM rendu ne porte ni couleur ni taille en dur', () => {
  const VUES: readonly (readonly [string, string])[] = [
    ['accueil', ROUTES_CONSOLE.accueil],
    ['portefeuille', ROUTES_CONSOLE.portefeuille],
    ['mission', ROUTES_CONSOLE.mission(ID.missionTpe)],
  ];

  it.each(VUES)(
    '%s — aucune couleur/taille littérale (style, SVG, classes arbitraires)',
    async (_nom, chemin) => {
      rendreConsole(chemin);
      await screen.findByRole('main');
      // On attend le nominal : c'est l'écran le plus riche, donc le plus exposé.
      await screen.findByText(MISSION_TPE.title, undefined, { timeout: 3_000 });
      expect(balayerStylesEnDur(document.body)).toEqual([]);
    },
  );

  it.each(VUES)('%s — chaque `var(--…)` consommée existe dans tokens.css', async (_nom, chemin) => {
    rendreConsole(chemin);
    await screen.findByRole('main');
    await screen.findByText(MISSION_TPE.title, undefined, { timeout: 3_000 });
    expect(jetonsInconnus(document.body)).toEqual([]);
  });

  it('la charte lue dans tokens.css n’est pas vide (sinon le test précédent serait creux)', () => {
    const definis = jetonsDefinis();
    expect(definis.size).toBeGreaterThan(50);
    expect(definis.has('--couleur-surface-fond')).toBe(true);
  });

  it('CONTRE-ÉPREUVE — le balayage voit une couleur, une taille, une classe arbitraire fabriquées', () => {
    // Chaque littéral est FABRIQUÉ ici pour être détecté : ce sont des fixtures de
    // contre-épreuve, marquées `invariant-ok:` ligne à ligne pour `check:invariants`.
    const FAUTE = {
      couleur: '#c24a1b', // invariant-ok: contre-épreuve — la charte, citée pour être vue
      taille: '12px', // invariant-ok: contre-épreuve — une taille absolue
      fonction: 'rgb(1,2,3)', // invariant-ok: contre-épreuve — notation fonctionnelle
      classeCouleur: '[#ffffff]', // invariant-ok: contre-épreuve — classe Tailwind arbitraire
      classeTaille: '[8px]', // invariant-ok: contre-épreuve — classe Tailwind arbitraire
      jeton: '--couleur-inventee',
    } as const;
    const cobaye = document.createElement('div');
    cobaye.innerHTML =
      `<span style="color: ${FAUTE.couleur}; width: ${FAUTE.taille}"></span>` +
      `<svg><rect fill="${FAUTE.fonction}"></rect></svg>` +
      `<p class="text-${FAUTE.classeCouleur} w-${FAUTE.classeTaille}"></p>` +
      `<i style="color: var(${FAUTE.jeton})"></i>`;
    const fautes = balayerStylesEnDur(cobaye);
    expect(fautes.map((f) => f.valeur)).toEqual(
      expect.arrayContaining([
        FAUTE.couleur,
        FAUTE.taille,
        FAUTE.fonction,
        FAUTE.classeCouleur,
        FAUTE.classeTaille,
      ]),
    );
    expect(jetonsInconnus(cobaye)).toEqual([FAUTE.jeton]);
    expect(FAUTE.couleur.match(MOTIFS.HEXADECIMAL)).toEqual([FAUTE.couleur]);
  });
});
