// =============================================================================
// L7a — THÈME 6 : l'authentification de la console, CÔTÉ CLIENT SEULEMENT.
// Tests écrits AVANT le code par A36 (09 §3-2, §5.6).
//
// CLAUDE.md §9 / 11 §3 : « console (`apps/hq`) = cookies httpOnly SameSite=Lax +
// en-tête anti-CSRF custom ». Le branchement serveur (émission du cookie, lecture
// dans le crochet d'identité) est la fiche A-006, hors L7a. Ce que L7a doit
// livrer, et que ces tests jugent :
//   · le client HTTP envoie un en-tête anti-CSRF CUSTOM sur TOUTE requête non-GET ;
//   · il envoie les cookies (`credentials` same-origin ou include), et n'envoie
//     JAMAIS d'en-tête `Authorization: Bearer` — le Bearer est le mode du TERRAIN ;
//   · AUCUN jeton n'est écrit en `localStorage`/`sessionStorage`, même quand la
//     réponse de `login` en contient (c'est le cas du contrat actuel :
//     `loginResponseSchema` rend `accessToken`/`refreshToken` pour la PWA).
//
// ⚠ DOUTE DE SPEC (pour DECISIONS.md) : le NOM de l'en-tête anti-CSRF n'est fixé
// nulle part dans le pack (ni 11 §3, ni 06 §8.1, ni A-006). Ces tests exigent un
// en-tête custom `X-…` — n'importe lequel — et NON son nom. Le jour où le nom est
// tranché, `MOTIF_EN_TETE_ANTI_CSRF` se resserre en une ligne.
//
// Ce que chaque `@critique` attrape : un client qui pose le jeton d'accès dans
// `localStorage` (XSS = vol de session) ; un client qui envoie `Authorization:
// Bearer` depuis la console (deux modes d'auth, donc deux surfaces) ; un `POST`
// sans en-tête custom (CSRF par formulaire cross-site, le cookie partant seul).
// Traçabilité : E33 (sécurité / RGPD — transport de l'identité de la console), E43
// (exécutabilité autopilote — conventions d'API 11 §3).
// =============================================================================
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { loginRequestSchema } from '@axion/shared';
import { MISSION_TPE } from './tests-aide/fixtures-console.js';
import { LIBELLES, rendreConsole, ROUTES_CONSOLE } from './tests-aide/rendu-console.js';
import {
  IDENTITES_FACTICES,
  installerServeurFactice,
  type AppelReseau,
  type ServeurFactice,
} from './tests-aide/serveur-factice.js';

/** Un en-tête custom, au sens du CSRF : préfixé `X-`, hors de la liste des en-têtes simples. */
const MOTIF_EN_TETE_ANTI_CSRF = /^x-[a-z0-9-]+$/i;
const EN_TETES_STANDARD = new Set(['accept', 'content-type', 'content-length', 'user-agent']);

let serveur: ServeurFactice;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  serveur = installerServeurFactice({ role: 'anonyme' });
});

afterEach(() => {
  serveur.restaurer();
});

function enTetesCustom(appel: AppelReseau): readonly string[] {
  return [...appel.enTetes.keys()].filter(
    (nom) => !EN_TETES_STANDARD.has(nom.toLowerCase()) && MOTIF_EN_TETE_ANTI_CSRF.test(nom),
  );
}

function stockageContient(fragment: string): boolean {
  for (const stockage of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < stockage.length; i += 1) {
      const cle = stockage.key(i) ?? '';
      const valeur = stockage.getItem(cle) ?? '';
      if (cle.includes(fragment) || valeur.includes(fragment)) return true;
    }
  }
  return false;
}

/** Remplit et soumet le formulaire de connexion (H4) avec l'identité factice admin. */
async function seConnecter(): Promise<void> {
  const email = await screen.findByLabelText(LIBELLES.adresseEmail);
  const motDePasse = screen.getByLabelText(LIBELLES.motDePasse);
  fireEvent.change(email, { target: { value: IDENTITES_FACTICES.admin.email } });
  fireEvent.change(motDePasse, { target: { value: IDENTITES_FACTICES.admin.password } });
  fireEvent.click(screen.getByRole('button', { name: LIBELLES.seConnecter }));
}

describe('11 §3 — le formulaire de connexion et ce qu’il envoie', () => {
  it('sans session, la console montre le formulaire (401 → connexion), sans donnée de mission', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await screen.findByRole('button', { name: LIBELLES.seConnecter });
    expect(document.body.outerHTML).not.toContain(MISSION_TPE.title);
    // Le champ mot de passe est un VRAI champ mot de passe, et l'e-mail un champ e-mail.
    expect(screen.getByLabelText(LIBELLES.motDePasse).getAttribute('type')).toBe('password');
    expect(screen.getByLabelText(LIBELLES.adresseEmail).getAttribute('type')).toBe('email');
  });

  it('le corps du POST /v1/auth/login est exactement `loginRequestSchema` (email, password)', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await seConnecter();
    await waitFor(() => {
      expect(serveur.appels.some((a) => a.url.pathname.endsWith('/v1/auth/login'))).toBe(true);
    });
    const login = serveur.appels.find((a) => a.url.pathname.endsWith('/v1/auth/login'));
    expect(login?.methode).toBe('POST');
    expect(login?.enTetes.get('content-type') ?? '').toMatch(/application\/json/);
    const corps = loginRequestSchema.parse(JSON.parse(login?.corps ?? '{}'));
    expect(corps).toEqual(IDENTITES_FACTICES.admin);
  });

  it('@critique TOUTE requête non-GET porte un en-tête anti-CSRF custom `X-…`', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await seConnecter();
    await screen.findByText(MISSION_TPE.title);
    const nonGet = serveur.appels.filter((a) => a.methode !== 'GET' && a.methode !== 'HEAD');
    expect(nonGet.length).toBeGreaterThanOrEqual(1);
    for (const appel of nonGet) {
      expect(
        enTetesCustom(appel),
        `${appel.methode} ${appel.url.pathname} part sans en-tête custom : le cookie partirait seul`,
      ).not.toEqual([]);
    }
  });

  it('@critique les requêtes partent AVEC les cookies (`credentials`) et SANS `Authorization: Bearer`', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await seConnecter();
    await screen.findByText(MISSION_TPE.title);
    expect(serveur.appels.length).toBeGreaterThanOrEqual(2);
    for (const appel of serveur.appels) {
      expect(['same-origin', 'include']).toContain(appel.credentials);
      expect(appel.enTetes.get('authorization')).toBeNull();
    }
  });

  it('@critique après connexion, AUCUN jeton n’est écrit en localStorage ni sessionStorage', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await seConnecter();
    await screen.findByText(MISSION_TPE.title);
    // Les valeurs FACTICES rendues par le serveur, et les noms usuels de clé.
    for (const fragment of [
      'jeton-acces-factice',
      'jeton-rafraichissement-factice',
      'accessToken',
      'refreshToken',
      'access_token',
      'refresh_token',
      'jwt',
      'token',
    ]) {
      expect(stockageContient(fragment), `« ${fragment} » trouvé dans un stockage web`).toBe(false);
    }
    expect(window.localStorage.length).toBe(0);
  });

  it('une connexion refusée (401 INVALID_CREDENTIALS) affiche un message français, sans code brut', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    const email = await screen.findByLabelText(LIBELLES.adresseEmail);
    fireEvent.change(email, { target: { value: 'inconnu.fictif@exemple.test' } });
    fireEvent.change(screen.getByLabelText(LIBELLES.motDePasse), {
      target: { value: 'mauvais-mot-de-passe-factice' },
    });
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.seConnecter }));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/incorrect|invalide|refus/i);
    expect(alerte.textContent).not.toContain('INVALID_CREDENTIALS');
    // Toujours pas de donnée, et toujours le formulaire.
    expect(document.body.outerHTML).not.toContain(MISSION_TPE.title);
    expect(screen.getByRole('button', { name: LIBELLES.seConnecter })).toBeTruthy();
  });

  it('après connexion, la vue demandée (portefeuille) s’ouvre sans nouvelle saisie', async () => {
    rendreConsole(ROUTES_CONSOLE.portefeuille);
    await seConnecter();
    await screen.findByText(MISSION_TPE.title);
    expect(screen.queryByRole('button', { name: LIBELLES.seConnecter })).toBeNull();
    expect(window.location.pathname).toBe(ROUTES_CONSOLE.portefeuille);
  });
});

describe('CONTRE-ÉPREUVE — le détecteur d’en-tête custom distingue bien custom et standard', () => {
  it('reconnaît `X-Axion-Console` comme `X-Requested-With`, refuse les en-têtes standard', () => {
    const custom = new Headers({ 'x-axion-console': '1', 'content-type': 'application/json' });
    const standard = new Headers({ 'content-type': 'application/json', accept: '*/*' });
    const usuel = new Headers({ 'x-requested-with': 'XMLHttpRequest' });
    const fabriquer = (enTetes: Headers): AppelReseau => ({
      methode: 'POST',
      url: new URL('http://localhost/api/v1/auth/login'),
      enTetes,
      credentials: 'same-origin',
      corps: '',
    });
    expect(enTetesCustom(fabriquer(custom))).toEqual(['x-axion-console']);
    expect(enTetesCustom(fabriquer(standard))).toEqual([]);
    // Un en-tête custom, c'est un en-tête qu'un formulaire HTML cross-site ne peut
    // PAS poser : `X-Requested-With` en est un, au même titre qu'un nom choisi.
    expect(enTetesCustom(fabriquer(usuel))).toEqual(['x-requested-with']);
  });
});
