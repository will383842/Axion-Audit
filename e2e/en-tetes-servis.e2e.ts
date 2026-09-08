// =============================================================================
// E2E — LA CHAÎNE D'EN-TÊTES DE SÉCURITÉ RÉELLEMENT SERVIE À TRAVERS CADDY,
// SUR LES TROIS CIBLES (`/` terrain, `/hq/` console, `/api/v1/health` API),
// SUR LES DEUX PILES — ET LA PWA QUI DÉMARRE SOUS CES EN-TÊTES, EN NAVIGATEUR.
//
// Écrit par A26 (testeur E2E), qui n'a produit aucune ligne de infra/caddy/
// ni d'apps/api/src/ — le code de test n'est jamais écrit par l'agent qui a
// écrit le code testé (09 §5.6). Écrit AVANT l'incrément sécurité qui modifiera
// le Caddyfile (TDD, 09 §3 étape 2) : cette garde est ROUGE PAR CONSTRUCTION
// sur la valeur actuelle de la CSP et sur l'absence des en-têtes d'isolation.
//
// Traçabilité : 06 §10.2 (« en-têtes de sécurité (Caddy : HSTS, CSP stricte,
// X-Content-Type-Options) ») · E36 · E43 · 11 §2 (aucun CDN, pas de CORS) ·
// 11 §4 (WASM Argon2id, PWA) · DOSSIER_ZAP_2026-09-08 §1 (10055, 90004), §3,
// §4-A, §4-C · DECISIONS.md 2026-09-08 (A01, #104).
//
// ── LE FAIT QUI JUSTIFIE CE FICHIER (DOSSIER_ZAP §4-C) ─────────────────────
// « Aucun test du dépôt n'assert un seul en-tête de sécurité. Un `git revert`
// malheureux sur `Caddyfile:177-218` retirerait HSTS, CSP, `nosniff` et
// `X-Frame-Options` sans faire rougir un seul test. » Cette garde est ce filet.
//
// ── POURQUOI À TRAVERS CADDY, ET PAS `app.inject` ───────────────────────────
// `apps/api/src/app.ts` affirmait que la CSP de l'API était « verrouillée à
// 'none' ». Mesuré sur staging (§4-A) : le client reçoit la CSP des FRONTS,
// posée par le `header` du snippet `(securite)`, qui ÉCRASE celle de helmet.
// Un test `inject` aurait été vert huit jours sur une affirmation fausse. Ici,
// on lit ce que le navigateur reçoit — rien d'autre n'a valeur de preuve.
//
// ── UN FICHIER VOISIN DE `pwa-servie.e2e.ts`, PAS UNE EXTENSION ─────────────
// Le harnais de `pwa-servie` lance Caddy SANS amont : `/api/*` y rend 502, et
// les en-têtes d'une page d'erreur ne sont pas ceux d'une réponse relayée. Cette
// garde exige un amont `axion-api` (fixtures/amont-api-factice.caddy, jumeau
// déclaré des en-têtes de helmet) pour prouver l'écrasement §4-A. Et un rouge
// ici doit s'appeler « en-têtes », pas « PWA » : le sujet est distinct, la
// signature d'échec aussi. Le harnais vit dans fixtures/caddy-servi.ts.
//
// ── CE QUI EST ATTENDU EST LA CIBLE, PAS L'ÉTAT ─────────────────────────────
// `CSP_CIBLE` ci-dessous est la CSP SANS `style-src 'unsafe-inline'` (A51 §3 :
// zéro consommateur ; A01 : retrait dans le même incrément que cette garde).
// COOP et CORP `same-origin` sont attendus sur les trois cibles. COEP n'est
// attendu qu'en PRÉSENCE : sa valeur (`require-corp` ou `credentialless`) se
// choisit par la mesure (A01), et cette garde la RELÈVE en annotation sans la
// figer. Sur `6c3cf87`, ce fichier est rouge : c'est voulu, et c'est daté.
//
// ── COMMENT VOIR CETTE GARDE ROUGIR ET VERDIR, LOCALEMENT ───────────────────
//   AXION_CADDYFILE_EPROUVE=<copie mutée> pnpm exec playwright test en-tetes-servis
// Refusé en CI (voir la fixture). Une garde qu'on n'a jamais vue rouge n'en est pas une.
// =============================================================================
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { MOT_DE_PASSE_APPAREIL, preparerAppareilNeuf } from './fixtures/appareil-terrain.js';
import {
  demarrerCaddyServi,
  PILES_CADDY,
  type HarnaisCaddy,
  type PileCaddy,
} from './fixtures/caddy-servi.js';

// -----------------------------------------------------------------------------
// LES ATTENDUS — écrits ici, en clair, pour qu'un diff les montre.
// -----------------------------------------------------------------------------

/**
 * La CSP CIBLE des fronts. Identique à `Caddyfile:217` de `6c3cf87` À UNE
 * DIRECTIVE PRÈS : `style-src 'self'` sans `'unsafe-inline'`.
 *
 * Chaîne EXACTE, pas une liste de directives : deux CSP « équivalentes » à un
 * espace près ne le sont pas pour un relecteur, et une comparaison souple
 * laisserait passer une directive ajoutée. Quand A11 modifie la CSP, cette
 * constante change avec lui, dans le même commit, et le diff dit lequel.
 */
const CSP_CIBLE =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; " +
  "style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; " +
  "connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; " +
  "form-action 'self'; frame-ancestors 'none'";

/**
 * La CSP que l'AMONT émet (helmet, apps/api/src/app.ts — mesurée, voir
 * fixtures/amont-api-factice.caddy). Si le client la recevait, Caddy ne
 * l'écraserait plus. C'est la valeur que le test §4-A vérifie NE PAS voir.
 */
const CSP_AMONT_HELMET =
  "default-src 'none';base-uri 'self';font-src 'self' https: data:;form-action 'self';" +
  "frame-ancestors 'none';img-src 'self' data:;object-src 'none';script-src 'self';" +
  "script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests";

/** 06 §10.2 : HSTS — un an au moins, sous-domaines inclus. */
const HSTS_MAX_AGE_MINIMAL_S = 31_536_000;

const CIBLES = [
  { chemin: '/', nom: 'terrain', genre: 'front' },
  { chemin: '/hq/', nom: 'console', genre: 'front' },
  { chemin: '/api/v1/health', nom: 'API', genre: 'api' },
] as const;

type Cible = (typeof CIBLES)[number];

// -----------------------------------------------------------------------------
// LE HARNAIS — un Caddy par worker (`beforeAll`), les deux piles dans le même
// processus comme en production. PAS de mode `serial` : en série, le premier
// rouge arrête le fichier et les 50 verdicts suivants sortent en « did not run »
// — une garde dont on ne lit qu'un rouge sur cinquante (mesuré sur `6c3cf87` :
// « 1 failed, 55 did not run »). Ici chaque en-tête, chaque cible, chaque pile
// rend SON verdict, et un revert partiel se voit en entier.
// -----------------------------------------------------------------------------

let harnais: HarnaisCaddy;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  harnais = await demarrerCaddyServi('en-tetes');
});

test.afterAll(() => {
  harnais.arreter();
});

test.beforeEach(() => {
  // Un vert local doit dire SUR QUOI il porte — surtout quand ce n'est pas le
  // Caddyfile du dépôt (AXION_CADDYFILE_EPROUVE). En CI, c'est toujours lui.
  test
    .info()
    .annotations.push({ type: 'Caddyfile éprouvé', description: harnais.caddyfileEprouve });
});

type EnTetes = Record<string, string>;

async function enTetesDe(
  request: APIRequestContext,
  pile: PileCaddy,
  cible: Cible,
): Promise<EnTetes> {
  const reponse = await request.get(harnais.urlDe(pile, cible.chemin), { maxRedirects: 0 });
  expect(
    reponse.status(),
    `${cible.chemin} (pile ${pile.nom}) doit rendre 200 pour que ses en-têtes soient ceux ` +
      `d'une réponse normale, pas d'une page d'erreur. Journal Caddy :\n${harnais.journal()}`,
  ).toBe(200);
  return reponse.headers();
}

/** `max-age=31536000; includeSubDomains; preload` → 31536000 ; absent → -1. */
function maxAgeDe(hsts: string): number {
  const trouve = /max-age\s*=\s*(\d+)/i.exec(hsts)?.[1];
  return trouve === undefined ? -1 : Number.parseInt(trouve, 10);
}

for (const pile of PILES_CADDY) {
  test.describe(`pile ${pile.nom} (snippet ${pile.snippet})`, () => {
    for (const cible of CIBLES) {
      test.describe(`${cible.nom} — ${cible.chemin}`, () => {
        // ---------------------------------------------------------------------
        // HSTS — 06 §10.2. Sans lui, un premier accès en HTTP clair sur un
        // réseau hostile (hôtel, client) suffit à intercepter la session.
        // ---------------------------------------------------------------------
        test(`@critique Strict-Transport-Security : un an au moins, sous-domaines inclus`, async ({
          request,
        }) => {
          const en = await enTetesDe(request, pile, cible);
          const hsts = en['strict-transport-security'];
          expect(
            hsts,
            `${cible.chemin} ne porte AUCUN Strict-Transport-Security : le snippet (securite) ` +
              `du Caddyfile ne le pose plus (06 §10.2).`,
          ).toBeDefined();
          const valeur = hsts ?? '';
          expect(
            maxAgeDe(valeur),
            `HSTS « ${valeur} » : max-age < ${String(HSTS_MAX_AGE_MINIMAL_S)} s (un an)`,
          ).toBeGreaterThanOrEqual(HSTS_MAX_AGE_MINIMAL_S);
          expect(valeur, `HSTS « ${valeur} » : includeSubDomains manquant`).toMatch(
            /includeSubDomains/i,
          );
        });

        // ---------------------------------------------------------------------
        // nosniff — 06 §10.2 : « contrôle MIME réel ». Sans lui, un fichier
        // téléversé servi en octet-stream peut être « deviné » en script.
        // ---------------------------------------------------------------------
        test(`@critique X-Content-Type-Options: nosniff`, async ({ request }) => {
          const en = await enTetesDe(request, pile, cible);
          expect(
            en['x-content-type-options'],
            `${cible.chemin} : X-Content-Type-Options absent ou différent de nosniff (06 §10.2)`,
          ).toBe('nosniff');
        });

        // ---------------------------------------------------------------------
        // Mise en cadre — DENY sur les fronts (l'outil n'est jamais embarqué).
        // Sur l'API, aujourd'hui Caddy écrase le SAMEORIGIN de helmet par DENY :
        // on exige la PRÉSENCE, sans figer laquelle des deux — ce n'est pas
        // l'API qui décide de sa mise en cadre, et L6c tranchera (§4-A).
        // ---------------------------------------------------------------------
        test(`@critique X-Frame-Options ${cible.genre === 'front' ? ': DENY' : 'présent'}`, async ({
          request,
        }) => {
          const en = await enTetesDe(request, pile, cible);
          const xfo = en['x-frame-options'];
          expect(xfo, `${cible.chemin} : X-Frame-Options absent`).toBeDefined();
          if (cible.genre === 'front') {
            expect(
              xfo,
              `${cible.chemin} : X-Frame-Options « ${String(xfo)} » — l'outil n'est jamais ` +
                `embarqué dans un iframe tiers, la valeur attendue est DENY.`,
            ).toBe('DENY');
          }
        });

        // ---------------------------------------------------------------------
        // Referrer-Policy — les chemins sont des identifiants de mission ;
        // aucun ne doit fuir vers un tiers. Présence exigée, valeur relevée.
        // ---------------------------------------------------------------------
        test(`@critique Referrer-Policy présent`, async ({ request }) => {
          const en = await enTetesDe(request, pile, cible);
          const rp = en['referrer-policy'] ?? '';
          expect(rp, `${cible.chemin} : Referrer-Policy absent`).not.toBe('');
          expect(
            rp,
            `${cible.chemin} : Referrer-Policy « ${rp} » laisse fuir l'URL complète vers un tiers`,
          ).not.toMatch(/unsafe-url/i);
          test.info().annotations.push({ type: 'Referrer-Policy', description: rp });
        });

        // ---------------------------------------------------------------------
        // Permissions-Policy — capteurs cadrés (caméra, micro, géoloc à self).
        // Fait partie de la chaîne : un revert le retirerait avec le reste.
        // ---------------------------------------------------------------------
        test(`@critique Permissions-Policy présent, caméra/micro/géoloc bornés à self`, async ({
          request,
        }) => {
          const en = await enTetesDe(request, pile, cible);
          const pp = en['permissions-policy'] ?? '';
          expect(pp, `${cible.chemin} : Permissions-Policy absent`).not.toBe('');
          for (const capteur of ['camera', 'microphone', 'geolocation']) {
            expect(
              pp,
              `${cible.chemin} : Permissions-Policy « ${pp} » ne borne pas ${capteur} à (self)`,
            ).toMatch(new RegExp(`${capteur}=\\(self\\)`));
          }
        });

        // ---------------------------------------------------------------------
        // ISOLATION D'ORIGINE — ZAP 90004 (DOSSIER_ZAP §1, §2-a). Tout est
        // same-origin (11 §2 : un seul domaine, aucun CDN) : COOP et CORP
        // `same-origin` sur les trois cibles. Sur `6c3cf87`, absents des fronts.
        // ---------------------------------------------------------------------
        test(`@critique Cross-Origin-Opener-Policy: same-origin`, async ({ request }) => {
          const en = await enTetesDe(request, pile, cible);
          expect(
            en['cross-origin-opener-policy'],
            `${cible.chemin} : COOP absent ou différent de same-origin (ZAP 90004, 06 §10.2)`,
          ).toBe('same-origin');
        });

        test(`@critique Cross-Origin-Resource-Policy: same-origin`, async ({ request }) => {
          const en = await enTetesDe(request, pile, cible);
          expect(
            en['cross-origin-resource-policy'],
            `${cible.chemin} : CORP absent ou différent de same-origin (ZAP 90004, 11 §2)`,
          ).toBe('same-origin');
        });

        // COEP : PRÉSENCE seulement. `require-corp` ou `credentialless` se
        // choisit par la mesure (A01, 2026-09-08) — la valeur servie est
        // relevée en annotation, jamais figée ici. Le jour où A11 a choisi, la
        // valeur se fige DANS CE TEST, dans le même commit que le Caddyfile.
        test(`@critique Cross-Origin-Embedder-Policy présent (valeur relevée, non figée)`, async ({
          request,
        }) => {
          const en = await enTetesDe(request, pile, cible);
          const coep = en['cross-origin-embedder-policy'];
          test.info().annotations.push({
            type: 'COEP servi',
            description: `${cible.chemin} (${pile.nom}) : ${coep ?? '(absent)'}`,
          });
          expect(
            coep,
            `${cible.chemin} : Cross-Origin-Embedder-Policy absent (ZAP 90004). Sa valeur ` +
              `n'est pas exigée ici — sa présence, si.`,
          ).toBeDefined();
          expect(coep, `COEP « ${String(coep)} » n'est ni require-corp ni credentialless`).toMatch(
            /^(require-corp|credentialless)$/,
          );
        });

        // ---------------------------------------------------------------------
        // Le serveur ne se nomme pas (`-Server`). L'en-tête `Server: Caddy` est
        // la première ligne de tout scanner ; le snippet le retire.
        // ---------------------------------------------------------------------
        test(`@critique aucun en-tête Server`, async ({ request }) => {
          const en = await enTetesDe(request, pile, cible);
          expect(
            en.server,
            `${cible.chemin} : « Server: ${String(en.server)} » — le \`-Server\` du snippet a sauté`,
          ).toBeUndefined();
        });

        // ---------------------------------------------------------------------
        // LA CSP — la chaîne EXACTE. Fronts : la cible. API : le fait §4-A.
        // ---------------------------------------------------------------------
        if (cible.genre === 'front') {
          test(`@critique Content-Security-Policy : la chaîne exacte cible (sans 'unsafe-inline', ZAP 10055)`, async ({
            request,
          }) => {
            const en = await enTetesDe(request, pile, cible);
            const csp = en['content-security-policy'];
            expect(
              csp,
              `${cible.chemin} ne porte AUCUNE Content-Security-Policy (06 §10.2 : « CSP stricte »)`,
            ).toBeDefined();
            expect(
              csp,
              `${cible.chemin} : la CSP servie n'est pas la CSP cible.\n` +
                `Servie  : ${String(csp)}\n` +
                `Attendue: ${CSP_CIBLE}\n` +
                `Si le diff est \`style-src 'self' 'unsafe-inline'\` → \`style-src 'self'\` : c'est ` +
                `le retrait attendu (A51 §3 : zéro consommateur ; A01 #104). Si c'est autre chose : ` +
                `la constante CSP_CIBLE et le Caddyfile changent dans le MÊME commit, jamais l'un sans l'autre.`,
            ).toBe(CSP_CIBLE);
          });
        } else {
          // FAIT À CORRIGER À L6c — PAS UN ATTENDU DE SÉCURITÉ.
          // Ce test documente l'écrasement §4-A tel qu'il est servi aujourd'hui.
          // Quand L6c fera porter à l'API sa propre CSP (download en streaming §9.6
          // sous `default-src 'none'`), ce test ROUGIT : c'est le signal de le
          // réécrire en attendu (`csp` = la CSP de l'API), dans le même commit.
          test(`@critique FAIT À CORRIGER À L6c (§4-A) : l'API porte la CSP des fronts — Caddy écrase celle de helmet`, async ({
            request,
          }) => {
            const enApi = await enTetesDe(request, pile, cible);
            const enTerrain = await enTetesDe(request, pile, CIBLES[0]);
            const cspApi = enApi['content-security-policy'];
            const cspTerrain = enTerrain['content-security-policy'];

            test.info().annotations.push({
              type: 'fait à corriger — L6c',
              description:
                `${cible.chemin} (${pile.nom}) sert la CSP : ${String(cspApi)} — ` +
                `l'amont émettait : ${CSP_AMONT_HELMET}`,
            });

            expect(
              cspApi,
              `${cible.chemin} ne porte aucune CSP : ni celle de Caddy, ni celle de helmet`,
            ).toBeDefined();
            expect(
              cspApi,
              `${cible.chemin} porte la CSP de l'AMONT (helmet) : Caddy ne l'écrase plus. ` +
                `C'est la correction attendue à L6c — réécrire ce test en attendu, dans le même commit.`,
            ).not.toBe(CSP_AMONT_HELMET);
            expect(
              cspApi,
              `${cible.chemin} porte une CSP qui n'est ni celle des fronts ni celle de helmet : ` +
                `un troisième état, non documenté.\nAPI     : ${String(cspApi)}\nTerrain : ${String(cspTerrain)}`,
            ).toBe(cspTerrain);
          });
        }
      });
    }
  });
}

// -----------------------------------------------------------------------------
// PROUVÉ EN NAVIGATEUR (A01 #104) — la PWA terrain démarre sous les en-têtes
// servis : Argon2id (WASM, `'wasm-unsafe-eval'`), icônes `data:`, photos
// `blob:`, service worker, police auto-hébergée — sans UNE violation de CSP ni
// UNE ressource bloquée par COEP/CORP. C'est ce qui rend le retrait de
// `'unsafe-inline'` et le choix de COEP mesurables, pas seulement affirmés.
// -----------------------------------------------------------------------------

interface ViolationCsp {
  directive: string;
  bloque: string;
  source: string;
  ligne: number;
}

interface SondesNavigateur {
  imageData: string;
  imageBlob: string;
  wasm: string;
  serviceWorker: string;
  police: string;
  crossOriginIsolated: boolean;
}

declare global {
  interface Window {
    __violationsCsp?: ViolationCsp[];
  }
}

async function sonder(page: Page): Promise<SondesNavigateur> {
  return page.evaluate(async () => {
    const chargerImage = (src: string): Promise<string> =>
      new Promise((resoudre) => {
        const img = new Image();
        img.onload = () => {
          resoudre('ok');
        };
        img.onerror = () => {
          resoudre(`échec de chargement (${src.slice(0, 24)}…)`);
        };
        img.src = src;
      });

    // Un PNG 1×1 valide, en `data:` — la forme des icônes inline (`img-src data:`).
    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const imageData = await chargerImage(png1x1);

    // Une photo terrain avant téléversement : un Blob, une URL `blob:` (`img-src blob:`).
    const octets = Uint8Array.from(atob(png1x1.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    const urlBlob = URL.createObjectURL(new Blob([octets], { type: 'image/png' }));
    const imageBlob = await chargerImage(urlBlob);
    URL.revokeObjectURL(urlBlob);
    // PAS de `fetch(blob:)` ici : `connect-src 'self'` le refuse (mesuré), et
    // l'application ne le fait jamais (aucun `fetch` hors API dans apps/field/src).
    // Une sonde qui fabrique une violation que le produit ne produit pas ne
    // mesure pas le produit.

    // Le plus petit module WebAssembly valide, instancié depuis des octets —
    // le chemin de hash-wasm (Argon2id embarqué en base64, jamais fetché).
    let wasm = 'ok';
    try {
      await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    } catch (e) {
      wasm = e instanceof Error ? e.message : String(e);
    }

    let serviceWorker = 'ok';
    try {
      const inscription = await navigator.serviceWorker.ready;
      if (inscription.active === null) serviceWorker = 'inscrit mais inactif';
    } catch (e) {
      serviceWorker = e instanceof Error ? e.message : String(e);
    }

    await document.fonts.ready;
    const famille = getComputedStyle(document.body)
      .fontFamily.split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '');
    const police =
      famille !== undefined && document.fonts.check(`16px "${famille}"`)
        ? 'ok'
        : `police « ${String(famille)} » non chargée`;

    return {
      imageData,
      imageBlob,
      wasm,
      serviceWorker,
      police,
      crossOriginIsolated: window.crossOriginIsolated,
    };
  });
}

test.describe('prouvé en navigateur — la PWA terrain démarre sous les en-têtes servis', () => {
  test(`@critique aucune violation CSP, aucune ressource bloquée : Argon2id, data:, blob:, service worker, police`, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const pile = PILES_CADDY[0];
    const contexte = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await contexte.newPage();

    await page.addInitScript(() => {
      window.__violationsCsp = [];
      document.addEventListener('securitypolicyviolation', (evenement) => {
        window.__violationsCsp?.push({
          directive: evenement.effectiveDirective,
          bloque: evenement.blockedURI,
          source: evenement.sourceFile,
          ligne: evenement.lineNumber,
        });
      });
    });

    const bloquees: string[] = [];
    page.on('requestfailed', (requete) => {
      const motif = requete.failure()?.errorText ?? '';
      // ERR_BLOCKED_BY_RESPONSE = COEP/CORP ; ERR_BLOCKED_BY_CSP = CSP. Le reste
      // (un abandon, une coupure) n'est pas le sujet de cette garde.
      if (/BLOCKED_BY_RESPONSE|BLOCKED_BY_CSP/.test(motif)) {
        bloquees.push(`${requete.url()} — ${motif}`);
      }
    });
    const consoleSecurite: string[] = [];
    page.on('console', (message) => {
      const texte = message.text();
      if (
        /Content Security Policy|Cross-Origin-Embedder-Policy|Cross-Origin-Resource-Policy|ERR_BLOCKED_BY/i.test(
          texte,
        )
      ) {
        consoleSecurite.push(texte);
      }
    });

    const reponse = await page.goto(harnais.urlDe(pile, '/'));
    expect(reponse?.status(), 'la racine du terrain doit rendre 200 à travers Caddy').toBe(200);
    const enTetes = reponse?.headers() ?? {};
    test.info().annotations.push({
      type: 'en-têtes vus par le navigateur',
      description:
        `CSP: ${enTetes['content-security-policy'] ?? '(absent)'} · ` +
        `COEP: ${enTetes['cross-origin-embedder-policy'] ?? '(absent)'} · ` +
        `COOP: ${enTetes['cross-origin-opener-policy'] ?? '(absent)'} · ` +
        `CORP: ${enTetes['cross-origin-resource-policy'] ?? '(absent)'}`,
    });

    // Le chemin de production intégral : Argon2id dans le navigateur (hash-wasm,
    // `'wasm-unsafe-eval'`), enveloppe WebCrypto, écran suivant rendu.
    await preparerAppareilNeuf(page, MOT_DE_PASSE_APPAREIL);

    const sondes = await sonder(page);
    test.info().annotations.push({
      type: 'sondes navigateur',
      description: JSON.stringify(sondes),
    });

    const violations = await page.evaluate(() => window.__violationsCsp ?? []);
    // `expect.soft` sur les quatre verdicts : un seul rouge ne doit pas cacher les
    // trois autres. Le test échoue quand même — il dit seulement TOUT ce qu'il a vu.
    expect
      .soft(
        violations,
        `violations de CSP dans le navigateur sous la CSP servie : ${JSON.stringify(violations, null, 1)}`,
      )
      .toEqual([]);
    expect
      .soft(bloquees, `ressources bloquées par COEP/CORP/CSP :\n${bloquees.join('\n')}`)
      .toEqual([]);
    expect
      .soft(consoleSecurite, `messages de sécurité en console :\n${consoleSecurite.join('\n')}`)
      .toEqual([]);
    for (const [sonde, verdict] of Object.entries(sondes)) {
      if (sonde === 'crossOriginIsolated') continue;
      expect.soft(verdict, `sonde « ${sonde} » sous les en-têtes servis`).toBe('ok');
    }

    await contexte.close();
  });
});
