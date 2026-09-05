// =============================================================================
// L7a — THÈME 2 : la règle des quatre états (03 §33.2) sur CHAQUE écran. Tests
// écrits AVANT le code par A36 (09 §3-2, §5.6).
//
// §33.2 : « Chaque écran et chaque liste livre ses QUATRE états : vide (message
// qui dit quoi faire), chargement (skeletons aux dimensions finales — jamais de
// spinner plein écran), erreur (cause + action, français clair, code technique
// replié), hors ligne (pastille discrète + rappel des capacités locales). » Le
// nominal est vérifié en prime — c'est lui qui rend les autres comparables.
//
// Mécanisme : le serveur factice (`fetch` remplacé) sert des corps CONFORMES aux
// schémas partagés, et sait suspendre ses réponses, rendre 500, ou couper le câble.
// Traçabilité : E22 (console de pilotage), E27 (design moderne, charte, WCAG AA — grille
// UX §33), E44 (UX/UI 2026-2027), E43 (exécutabilité autopilote).
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { ERROR_CODES } from '@axion/shared';
import { codesBrutsVisibles, texteVisibleDEmblee } from './tests-aide/balayage-dom.js';
import { ID, MISSION_GC, MISSION_TPE } from './tests-aide/fixtures-console.js';
import {
  elementsMission,
  rendreConsole,
  ROUTES_CONSOLE,
  TITRES,
} from './tests-aide/rendu-console.js';
import { installerServeurFactice, type ServeurFactice } from './tests-aide/serveur-factice.js';

let serveur: ServeurFactice | undefined;

afterEach(() => {
  serveur?.restaurer();
  serveur = undefined;
});

/** Les écrans de L7a, et la façon de les charger. */
const ECRANS: readonly (readonly [string, string])[] = [
  ['accueil (tour de contrôle)', ROUTES_CONSOLE.accueil],
  ['portefeuille', ROUTES_CONSOLE.portefeuille],
  ['mission', ROUTES_CONSOLE.mission(ID.missionTpe)],
];

/** Un texte qui ressemble à une trace technique : pile, chemin de module, JSON brut. */
const TRACE_TECHNIQUE =
  /\bat\s+\w+\s*\(|node_modules|\.tsx?:\d+|TypeError|Failed to fetch|\{"error"/;

describe('§33.2 — état CHARGEMENT : squelettes, jamais un spinner plein écran', () => {
  it.each(ECRANS)(
    '%s — pendant l’attente, une zone role="status" aria-busy et AUCUN spinner',
    async (_nom, chemin) => {
      const serveurSuspendu = installerServeurFactice({ latence: 'suspendue' });
      serveur = serveurSuspendu;
      rendreConsole(chemin);

      // Un écran charge souvent en PLUSIEURS temps (session, puis mission, puis
      // entreprise). Chaque phase est photographiée : à chacune, un `role="status"`
      // occupé, jamais un spinner — puis on libère et on attend la phase suivante.
      // Sans cette boucle, le test ne verrait que la toute première attente, et un
      // spinner posé sur la deuxième passerait.
      let phases = 0;
      while (screen.queryByText(MISSION_TPE.title) === null && phases < 6) {
        const statut = await screen.findByRole('status');
        expect(statut.getAttribute('aria-busy')).toBe('true');
        // Un squelette dit CE QUI charge, en français, aux lecteurs d'écran.
        expect(statut.textContent).toMatch(/chargement/i);
        // Ni roue, ni « Loading… », ni animation plein écran.
        expect(document.body.querySelector('[class*="spinner"], [class*="loader"]')).toBeNull();
        expect(texteVisibleDEmblee(document.body)).not.toMatch(/loading/i);
        phases += 1;

        serveurSuspendu.liberer();
        // La phase suivante commence quand une NOUVELLE requête est en attente — ou
        // quand le contenu est là.
        await waitFor(() => {
          expect(
            serveurSuspendu.enAttente > 0 || screen.queryByText(MISSION_TPE.title) !== null,
          ).toBe(true);
        });
      }
      expect(phases).toBeGreaterThanOrEqual(1);
      await screen.findByText(MISSION_TPE.title);
      // Les compléments (nom du client…) se libèrent à leur tour ; une fois tout
      // servi, plus AUCUNE zone occupée ne doit subsister.
      for (let tour = 0; tour < 6 && serveurSuspendu.enAttente > 0; tour += 1) {
        serveurSuspendu.liberer();
        await new Promise((r) => setTimeout(r, 20));
      }
      await waitFor(() => {
        expect(screen.getByRole('main').querySelector('[aria-busy="true"]')).toBeNull();
      });
    },
  );
});

describe('§33.2 — état VIDE : un message qui dit quoi faire', () => {
  it('accueil — sans mission, la tour de contrôle dit qu’il n’y a rien à piloter ET quoi faire', async () => {
    serveur = installerServeurFactice({ missions: [] });
    rendreConsole(ROUTES_CONSOLE.accueil);
    await screen.findByText(/aucune mission/i);
    const principal = screen.getByRole('main');
    const texte = texteVisibleDEmblee(principal);
    // « Quoi faire » : une phrase à l'impératif ou à l'infinitif (créer, importer…).
    expect(texte).toMatch(/cré(?:er|ez)|import(?:er|ez)|ajout(?:er|ez)|commenc(?:er|ez)/i);
    expect(elementsMission(principal)).toHaveLength(0);
  });

  it('portefeuille — liste vide : message d’action, pas un tableau sans lignes', async () => {
    serveur = installerServeurFactice({ missions: [] });
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(/aucune mission/i);
    const principal = screen.getByRole('main');
    expect(texteVisibleDEmblee(principal)).toMatch(
      /cré(?:er|ez)|import(?:er|ez)|ajout(?:er|ez)|commenc(?:er|ez)/i,
    );
    expect(elementsMission(principal)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /charger la suite/i })).toBeNull();
  });

  it('mission — les champs non renseignés disent « non renseigné », jamais null/undefined/Invalid Date', async () => {
    // FIL-TPE n'a ni NDA, ni date de livraison : ce sont des `null` LÉGITIMES du
    // contrat. Un écran qui les rend tels quels affiche `null` ou une date invalide.
    serveur = installerServeurFactice();
    rendreConsole(ROUTES_CONSOLE.mission(ID.missionTpe));
    await screen.findByRole('heading', { level: 1, name: MISSION_TPE.title });
    const principal = screen.getByRole('main');
    const texte = texteVisibleDEmblee(principal);
    expect(codesBrutsVisibles(texte)).toEqual([]);
    expect(texte).toMatch(/non renseign|aucun|—/i);
  });
});

describe('§33.2 — état ERREUR : cause + action en français, code technique REPLIÉ', () => {
  it.each(ECRANS)(
    '%s — un 500 rend un role="alert" français, sans trace ni code brut visible',
    async (_nom, chemin) => {
      serveur = installerServeurFactice({ panne: 'serveur' });
      rendreConsole(chemin);
      const alerte = await screen.findByRole('alert');
      const visible = texteVisibleDEmblee(alerte);
      // La CAUSE et l'ACTION, en français.
      expect(visible.length).toBeGreaterThan(20);
      expect(visible).toMatch(/réessay|relanc|contact|vérifi/i);
      expect(visible).not.toMatch(TRACE_TECHNIQUE);
      // Le code du contrat (`INTERNAL_ERROR`) peut exister dans le DOM — replié dans
      // un <details> fermé — mais JAMAIS visible d'emblée.
      expect(visible).not.toContain(ERROR_CODES.INTERNAL_ERROR);
      expect(codesBrutsVisibles(visible)).toEqual([]);
      // Et une action concrète : un bouton pour réessayer.
      expect(within(alerte).queryByRole('button', { name: /réessayer|relancer/i })).not.toBeNull();
    },
  );

  it('erreur — le détail technique, s’il est offert, est REPLIÉ (details fermé) et non ouvert', async () => {
    serveur = installerServeurFactice({ panne: 'serveur' });
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    const alerte = await screen.findByRole('alert');
    const details = alerte.querySelector('details');
    if (details !== null) {
      expect(details.hasAttribute('open')).toBe(false);
      expect(details.querySelector('summary')?.textContent ?? '').toMatch(/détail technique/i);
    }
  });

  it('mission — un 404 dit que la mission est introuvable et propose de revenir au portefeuille', async () => {
    serveur = installerServeurFactice();
    rendreConsole(ROUTES_CONSOLE.mission(ID.missionInconnue));
    const alerte = await screen.findByRole('alert');
    const principal = screen.getByRole('main');
    const visible = texteVisibleDEmblee(alerte);
    expect(visible).toMatch(/introuvable|n[’']existe (?:pas|plus)/i);
    expect(visible).not.toContain(ERROR_CODES.NOT_FOUND);
    expect(within(principal).queryByRole('link', { name: TITRES.portefeuille })).not.toBeNull();
  });

  it('erreur — « Réessayer » relance RÉELLEMENT la requête (une seconde entrée dans la trace)', async () => {
    serveur = installerServeurFactice({ panne: 'serveur' });
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    const alerte = await screen.findByRole('alert');
    const avant = serveur.appels.filter((a) => a.url.pathname.endsWith('/v1/missions')).length;
    expect(avant).toBeGreaterThanOrEqual(1);
    const bouton = within(alerte).getByRole('button', { name: /réessayer|relancer/i });
    bouton.click();
    await screen.findByRole('main');
    await new Promise((r) => setTimeout(r, 50));
    const apres = serveur.appels.filter((a) => a.url.pathname.endsWith('/v1/missions')).length;
    expect(apres).toBeGreaterThan(avant);
  });
});

describe('§33.2 — état HORS LIGNE : pastille discrète, message français, pas une erreur générique', () => {
  it.each(ECRANS)(
    '%s — câble coupé (fetch rejette) : message « hors ligne » en français, aucune trace',
    async (_nom, chemin) => {
      serveur = installerServeurFactice({ panne: 'reseau' });
      rendreConsole(chemin);
      // `role="alert"` ou `role="status"` : le composant `EtatHorsLigne` du design
      // system en décide ; ce que l'on exige, c'est le MOT et l'absence de jargon.
      await screen.findByText(/hors ligne|connexion/i);
      const principal = screen.getByRole('main');
      const visible = texteVisibleDEmblee(principal);
      expect(visible).not.toMatch(TRACE_TECHNIQUE);
      expect(codesBrutsVisibles(visible)).toEqual([]);
    },
  );
});

describe('§33.2 — état NOMINAL : le contenu réel, et lui seul', () => {
  it('portefeuille — les deux missions canoniques sont rendues, sans état résiduel', async () => {
    serveur = installerServeurFactice();
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSION_TPE.title);
    const principal = screen.getByRole('main');
    await screen.findByText(MISSION_GC.title);
    expect(within(principal).queryByRole('status')).toBeNull();
    expect(within(principal).queryByRole('alert')).toBeNull();
    expect(within(principal).queryByText(/aucune mission/i)).toBeNull();
    expect(codesBrutsVisibles(texteVisibleDEmblee(principal))).toEqual([]);
  });

  it('interface 100 % française (invariant 5) — aucun mot-clé anglais d’interface visible', async () => {
    serveur = installerServeurFactice();
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSION_TPE.title);
    const texte = texteVisibleDEmblee(document.body);
    expect(texte).not.toMatch(
      /\b(?:loading|error|retry|submit|login|logout|dashboard|missions list|next page|load more)\b/i,
    );
  });
});
