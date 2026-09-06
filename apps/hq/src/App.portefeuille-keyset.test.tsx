// =============================================================================
// L7a — THÈME 3 : le portefeuille est paginé en KEYSET (11 §3 : « ?limit&after,
// jamais d'offset »). Tests écrits AVANT le code par A36 (09 §3-2, §5.6).
//
// Ce que chaque test attrape, dit franchement :
//   · `?offset=50` ou `?page=2` — la pagination par décalage, qui saute ou duplique
//     des lignes quand une sync terrain pousse pendant qu'on feuillette ;
//   · un « charger la suite » qui redemande la PREMIÈRE page (curseur non passé) ;
//   · un curseur fabriqué côté client (dernier id, `created_at`) au lieu du
//     `nextCursor` OPAQUE rendu par le serveur — il marche jusqu'au jour où l'API
//     change de tri ;
//   · une suite qui REMPLACE la page au lieu de l'ajouter ;
//   · un bouton « charger la suite » encore visible quand `nextCursor` est null ;
//   · une taille de page hors bornes (`limit` > PAGINATION_LIMIT_MAX) ou absente.
// Traçabilité : E22 (console de pilotage), E43 (exécutabilité autopilote — conventions d'API,
// pagination keyset).
// =============================================================================
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { PAGINATION_LIMIT_MAX } from '@axion/shared';
import { missionsSupplementaires } from './tests-aide/fixtures-console.js';
import {
  elementsMission,
  LIBELLES,
  rendreConsole,
  ROUTES_CONSOLE,
} from './tests-aide/rendu-console.js';
import {
  installerServeurFactice,
  type AppelReseau,
  type ServeurFactice,
} from './tests-aide/serveur-factice.js';

const MISSIONS = missionsSupplementaires(7);
const TAILLE_PAGE = 3;

let serveur: ServeurFactice;

beforeEach(() => {
  serveur = installerServeurFactice({ missions: MISSIONS, taillePage: TAILLE_PAGE });
});

afterEach(() => {
  serveur.restaurer();
});

function appelsListe(): readonly AppelReseau[] {
  return serveur.appels.filter(
    (appel) => appel.methode === 'GET' && appel.url.pathname.endsWith('/v1/missions'),
  );
}

/** Les paramètres que la convention 11 §3 INTERDIT — toute forme de décalage. */
const PARAMETRES_DE_DECALAGE = [
  'offset',
  'page',
  'skip',
  'start',
  'from',
  'pageNumber',
  'page_number',
];

describe('@critique 11 §3 — la première page est demandée en keyset, sans AUCUN décalage', () => {
  it('@critique envoie `limit` et rien qui ressemble à un offset', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSIONS[0]?.title ?? '');
    const [premier] = appelsListe();
    expect(premier).toBeDefined();
    if (premier === undefined) return;
    const parametres = premier.url.searchParams;
    expect(parametres.has('limit')).toBe(true);
    const limit = Number(parametres.get('limit'));
    expect(Number.isInteger(limit) && limit >= 1 && limit <= PAGINATION_LIMIT_MAX).toBe(true);
    for (const interdit of PARAMETRES_DE_DECALAGE) {
      expect(parametres.has(interdit), `paramètre de décalage émis : ${interdit}`).toBe(false);
    }
    // Première page : pas de curseur (`after` absent), et pas de curseur vide non plus.
    expect(parametres.has('after')).toBe(false);
  });

  it('n’émet AUCUN paramètre inconnu du contrat (`paginationQuerySchema` : limit, after)', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSIONS[0]?.title ?? '');
    for (const appel of appelsListe()) {
      const cles = [...appel.url.searchParams.keys()].sort((a, b) => a.localeCompare(b));
      for (const cle of cles) expect(['after', 'limit']).toContain(cle);
    }
  });
});

describe('@critique 11 §3 — « Charger la suite » passe le curseur RENDU par le serveur', () => {
  it('@critique la deuxième requête porte `after=<nextCursor de la page 1>` et toujours aucun offset', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSIONS[0]?.title ?? '');
    // Compté DEPUIS la première page rendue : une sonde de session ou un second
    // effet ne sont pas ce que ce test juge.
    const avant = appelsListe().length;
    const bouton = await screen.findByRole('button', { name: LIBELLES.chargerLaSuite });
    fireEvent.click(bouton);
    await screen.findByText(MISSIONS[TAILLE_PAGE]?.title ?? '');

    const appels = appelsListe();
    expect(appels).toHaveLength(avant + 1);
    const second = appels[appels.length - 1];
    expect(second).toBeDefined();
    if (second === undefined) return;
    // Le curseur factice est `curseur-factice-<n>` : un client qui fabrique le sien
    // (dernier id, horodatage) ne peut pas produire cette chaîne.
    expect(second.url.searchParams.get('after')).toBe(`curseur-factice-${String(TAILLE_PAGE)}`);
    for (const interdit of PARAMETRES_DE_DECALAGE) {
      expect(second.url.searchParams.has(interdit)).toBe(false);
    }
  });

  it('la suite S’AJOUTE à la liste — elle ne la remplace pas', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSIONS[0]?.title ?? '');
    const principal = screen.getByRole('main');
    expect(elementsMission(principal)).toHaveLength(TAILLE_PAGE);

    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.chargerLaSuite }));
    await screen.findByText(MISSIONS[TAILLE_PAGE]?.title ?? '');
    expect(elementsMission(principal)).toHaveLength(TAILLE_PAGE * 2);
    // La page 1 est toujours là, dans l'ordre.
    expect(within(principal).getByText(MISSIONS[0]?.title ?? '')).toBeTruthy();
  });

  it('les pages se suivent jusqu’à `nextCursor: null`, puis le bouton DISPARAÎT', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSIONS[0]?.title ?? '');
    const principal = screen.getByRole('main');
    const avant = appelsListe().length;

    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.chargerLaSuite }));
    await screen.findByText(MISSIONS[TAILLE_PAGE]?.title ?? '');
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.chargerLaSuite }));
    await screen.findByText(MISSIONS[MISSIONS.length - 1]?.title ?? '');

    expect(elementsMission(principal)).toHaveLength(MISSIONS.length);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: LIBELLES.chargerLaSuite })).toBeNull();
    });
    await new Promise((r) => setTimeout(r, 100));
    // Deux pages de plus exactement (3 + 3 + 1). Une troisième requête après le
    // `nextCursor: null` serait un client qui ignore la fin de liste.
    expect(appelsListe()).toHaveLength(avant + 2);
    const curseurs = appelsListe()
      .slice(avant)
      .map((appel) => appel.url.searchParams.get('after'));
    expect(curseurs).toEqual(['curseur-factice-3', 'curseur-factice-6']);
  });

  it('aucune mission n’est rendue deux fois (le keyset est stable par construction)', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSIONS[0]?.title ?? '');
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.chargerLaSuite }));
    await screen.findByText(MISSIONS[TAILLE_PAGE]?.title ?? '');
    const principal = screen.getByRole('main');
    const titres = elementsMission(principal).map((element) => element.textContent);
    const vus = new Set<string>();
    for (const mission of MISSIONS.slice(0, TAILLE_PAGE * 2)) {
      const occurrences = titres.filter((texte) => texte.includes(mission.title)).length;
      expect(occurrences, `« ${mission.title} » rendue ${String(occurrences)} fois`).toBe(1);
      vus.add(mission.title);
    }
    expect(vus.size).toBe(TAILLE_PAGE * 2);
  });
});

describe('11 §3 — quand tout tient en une page, pas de bouton, pas de seconde requête', () => {
  it('avec 2 missions et `nextCursor: null`, « Charger la suite » n’existe pas', async () => {
    serveur.restaurer();
    serveur = installerServeurFactice({ missions: MISSIONS.slice(0, 2) });
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByText(MISSIONS[1]?.title ?? '');
    expect(screen.queryByRole('button', { name: LIBELLES.chargerLaSuite })).toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    // Aucune requête de SUITE : pas un seul `after` dans la trace.
    expect(appelsListe().filter((appel) => appel.url.searchParams.has('after'))).toEqual([]);
  });
});
