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
// §4-A, §4-C · DECISIONS.md 2026-09-08 (A01, PR 104).
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
// COOP et CORP `same-origin` sont attendus sur les trois cibles. COEP est
// FIGÉ à `require-corp` depuis `c3745a8` : la mesure a eu lieu (A01 : « c'est
// la MESURE qui choisira »), et c'est WebKit qui a tranché — voir `COEP_CIBLE`.
// Sur `6c3cf87`, ce fichier est rouge : c'est voulu, et c'est daté.
//
// ── COMMENT VOIR CETTE GARDE ROUGIR ET VERDIR, LOCALEMENT ───────────────────
//   AXION_CADDYFILE_EPROUVE=<copie mutée> pnpm exec playwright test en-tetes-servis
// Refusé en CI (voir la fixture). Une garde qu'on n'a jamais vue rouge n'en est pas une.
// =============================================================================
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { cspAmontFactice } from './fixtures/amont-api-factice.js';
import {
  deverrouillerAppareil,
  MOT_DE_PASSE_APPAREIL,
  preparerAppareilNeuf,
} from './fixtures/appareil-terrain.js';
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
 * La CSP que l'AMONT émet (helmet, apps/api/src/app.ts). Si le client la
 * recevait, Caddy ne l'écraserait plus. C'est la valeur que le test §4-A
 * vérifie NE PAS voir.
 *
 * LUE dans fixtures/amont-api-factice.caddy, jamais recopiée ici : ce fichier
 * est le jumeau de helmet, et `apps/api/src/en-tetes-amont-jumeau.test.ts` le
 * garde égal à ce que helmet émet (revue A29, R5). Une troisième copie ici
 * aurait pu dériver des deux autres sans qu'aucune garde ne le voie — et le
 * test §4-A se serait comparé à une chaîne périmée, vert à vide.
 */
const CSP_AMONT_HELMET = cspAmontFactice();

/** 06 §10.2 : HSTS — un an au moins, sous-domaines inclus. */
const HSTS_MAX_AGE_MINIMAL_S = 31_536_000;

/**
 * COEP — `require-corp`, FIGÉ. Choisi par la mesure (A11, `Caddyfile` snippet
 * `(securite)`, `c3745a8`), pas par le catalogue : les deux valeurs tiennent sur
 * la PWA (`crossOriginIsolated: true`, zéro ressource bloquée — le test
 * navigateur ci-dessous), et trois motifs les départagent. Le décisif :
 *
 *   `credentialless` N'EST PAS PRIS EN CHARGE PAR WEBKIT. Sur Safari — donc sur
 *   l'iPad terrain, l'appareil de référence — il vaut `unsafe-none`, c'est-à-dire
 *   AUCUNE isolation d'origine là où elle compte le plus. `require-corp` est
 *   compris des trois moteurs.
 *
 * Les deux autres : la CSP (`CSP_CIBLE`, tout à `'self'`) fait DÉJÀ payer la
 * contrainte de `require-corp` ; et `credentialless` n'a d'objet que pour charger
 * des ressources tierces sans cookies — un besoin que ce dépôt refuse (11 §1, §2).
 *
 * Passer à `credentialless` « parce que c'est plus souple » n'est donc pas un
 * assouplissement : c'est retirer l'isolation à l'iPad. Ce n'est pas une valeur
 * qu'on change dans ce test — c'est une décision humaine (11 §8, point 4).
 */
const COEP_CIBLE = 'require-corp';

const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

async function enTetesDuChemin(
  request: APIRequestContext,
  pile: PileCaddy,
  chemin: string,
): Promise<EnTetes> {
  const reponse = await request.get(harnais.urlDe(pile, chemin), { maxRedirects: 0 });
  expect(
    reponse.status(),
    `${chemin} (pile ${pile.nom}) doit rendre 200 pour que ses en-têtes soient ceux ` +
      `d'une réponse normale, pas d'une page d'erreur. Journal Caddy :\n${harnais.journal()}`,
  ).toBe(200);
  return reponse.headers();
}

async function enTetesDe(
  request: APIRequestContext,
  pile: PileCaddy,
  cible: Cible,
): Promise<EnTetes> {
  return enTetesDuChemin(request, pile, cible.chemin);
}

/**
 * Les icônes de PWA — noms NON empreintés, contenu provisoire (régénérées
 * depuis les jetons). Mesuré par A29 (R6) : elles sortaient de Caddy SANS
 * AUCUN Cache-Control — exclues du `no-cache` de l'HTML sans rien recevoir à
 * la place. A01 (R1) : la garde asserte la PRÉSENCE de l'en-tête, et qu'il
 * n'est pas `immutable` — un nom stable dont le contenu change ne se croit pas
 * sur parole. La VALEUR exacte appartient à A11 : on ne la fige pas ici.
 */
const ICONES_PWA = ['/apple-touch-icon.png', '/icones/icone-192.png', '/icones/icone-512.png'];

/**
 * TOUT CE QUE CADDY SERT, famille par famille — et PAS UNE LISTE BLANCHE.
 *
 * A11 a rejoué ZAP après le correctif icônes : `10049` est un CLASSIFICATEUR —
 * une instance par réponse, quelle que soit sa politique, 308 compris. Une
 * réponse SANS `Cache-Control` y tombe dans la même colonne que les assets
 * `immutable` : le scan ne distingue pas l'absence de politique. Et il est non
 * authentifié : il ne verra jamais les routes JSON de L6c (§4-B, `person_name`,
 * `scoping_financials`). A01 : « la garde du dépôt est le seul détecteur de
 * §4-B — ce n'est pas un confort, c'est le contrôle ». C'est cette garde.
 *
 * Les assets sont LUS dans les builds réels (`dist/assets`), jamais nommés :
 * leurs noms sont empreintés et changent à chaque build. Une liste écrite à la
 * main serait verte par omission dès le build suivant.
 */
interface CheminServi {
  chemin: string;
  famille: string;
  /** Statuts admis — 200 partout, sauf la redirection `/hq` → `/hq/` (308). */
  statuts: readonly number[];
}

function assetsDe(app: 'field' | 'hq', prefixe: string): CheminServi[] {
  const dossier = join(RACINE_DEPOT, 'apps', app, 'dist', 'assets');
  const fichiers = readdirSync(dossier);
  if (fichiers.length === 0) {
    throw new Error(`${dossier} est vide : aucun asset à éprouver — le build a-t-il eu lieu ?`);
  }
  return fichiers.map((f) => ({
    chemin: `${prefixe}/assets/${f}`,
    famille: 'asset empreinté',
    statuts: [200],
  }));
}

const CHEMINS_SERVIS: readonly CheminServi[] = [
  { chemin: '/', famille: 'HTML', statuts: [200] },
  { chemin: '/index.html', famille: 'HTML', statuts: [200] },
  { chemin: '/session/fil-tpe', famille: 'HTML (repli SPA)', statuts: [200] },
  { chemin: '/hq/', famille: 'HTML', statuts: [200] },
  { chemin: '/hq/index.html', famille: 'HTML', statuts: [200] },
  { chemin: '/hq/missions', famille: 'HTML (repli SPA)', statuts: [200] },
  { chemin: '/hq', famille: 'redirection 308', statuts: [308] },
  { chemin: '/robots.txt', famille: 'fichier absent → repli SPA (HTML)', statuts: [200] },
  ...ICONES_PWA.map((chemin) => ({ chemin, famille: 'icône de PWA', statuts: [200] })),
  { chemin: '/sw.js', famille: 'service worker', statuts: [200] },
  { chemin: '/manifest.webmanifest', famille: 'manifeste', statuts: [200] },
  ...assetsDe('field', ''),
  ...assetsDe('hq', '/hq'),
];

/**
 * Les chemins d'API d'aujourd'hui. `/api/v1/health` rend 200 ; `/api/v1` n'a
 * pas de route et rend le 404 JSON de l'amont — RELAYÉ (ses en-têtes sont ceux
 * de helmet, pas d'une page d'erreur de Caddy : `Origin-Agent-Cluster` en est
 * la signature, Caddy ne le pose jamais).
 */
const CHEMINS_API = [
  { chemin: '/api/v1/health', statut: 200 },
  { chemin: '/api/v1', statut: 404 },
] as const;

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

        // COEP : la VALEUR, figée à `require-corp` (voir `COEP_CIBLE` : WebKit
        // ne connaît pas `credentialless`, l'iPad terrain y perdrait toute
        // isolation). Jusqu'à `645667e` ce test n'exigeait que la présence, la
        // mesure n'étant pas faite ; elle l'est (`c3745a8`), la valeur se fige.
        test(`@critique Cross-Origin-Embedder-Policy: require-corp (credentialless = unsafe-none sous WebKit)`, async ({
          request,
        }) => {
          const en = await enTetesDe(request, pile, cible);
          const coep = en['cross-origin-embedder-policy'];
          expect(
            coep,
            `${cible.chemin} : Cross-Origin-Embedder-Policy absent (ZAP 90004, 06 §10.2)`,
          ).toBeDefined();
          expect(
            coep,
            `${cible.chemin} : COEP « ${String(coep)} » au lieu de ${COEP_CIBLE}. ` +
              (coep === 'credentialless'
                ? `credentialless n'est pas pris en charge par WebKit : sur l'iPad terrain il vaut ` +
                  `unsafe-none, AUCUNE isolation. Ce n'est pas « plus souple », c'est absent. `
                : '') +
              `Voir COEP_CIBLE et le snippet (securite) du Caddyfile — les deux changent ensemble, ` +
              `sur décision humaine (11 §8).`,
          ).toBe(COEP_CIBLE);
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
                `le retrait attendu (A51 §3 : zéro consommateur ; A01 PR 104). Si c'est autre chose : ` +
                `la constante CSP_CIBLE et le Caddyfile changent dans le MÊME commit, jamais l'un sans l'autre.`,
            ).toBe(CSP_CIBLE);
          });
        } else {
          // FAIT À CORRIGER À L6c — PAS UN ATTENDU DE SÉCURITÉ.
          // Ce test documente l'écrasement §4-A tel qu'il est servi aujourd'hui.
          // L'arbitrage qui le date et l'assigne : DECISIONS.md, entrée
          // « 2026-09-08 — [P-C] Trois écarts hors critères : lesquels se
          // corrigent pendant une porte échouée ? », point (a) — le commentaire
          // d'`app.ts` se rectifie MAINTENANT, le comportement (la CSP propre de
          // l'API) ne devient réel qu'au download §9.6, donc L6c. Un test qui
          // asserte un défaut connu cite l'entrée qui l'a décidé, pas un titre nu
          // (A01, 2026-09-09).
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
                `Arbitrage : DECISIONS.md « 2026-09-08 — [P-C] Trois écarts hors critères : ` +
                `lesquels se corrigent pendant une porte échouée ? », point (a) (A01). ` +
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

    // -------------------------------------------------------------------------
    // ICÔNES DE PWA — une politique de cache EXPLICITE, jamais `immutable`.
    // Rouge tant que le Caddyfile ne pose rien sur ces chemins (A29 R6) ; vert
    // quand A11 livre le matcher qui les couvre. La valeur reste la sienne.
    // -------------------------------------------------------------------------
    test.describe('icônes de PWA — Cache-Control', () => {
      for (const chemin of ICONES_PWA) {
        test(`@critique ${chemin} : Cache-Control présent, jamais immutable`, async ({
          request,
        }) => {
          const en = await enTetesDuChemin(request, pile, chemin);
          const cc = en['cache-control'];
          expect(
            cc,
            `${chemin} (pile ${pile.nom}) sort de Caddy SANS Cache-Control : exclu du ` +
              `no-cache de l'HTML sans rien recevoir à la place (A29 R6). Toute réponse porte ` +
              `une politique explicite — un chemin qui sort d'un matcher sans entrer dans un ` +
              `autre est un trou, pas une famille.`,
          ).toBeDefined();
          expect(
            cc,
            `${chemin} (pile ${pile.nom}) : Cache-Control « ${String(cc)} » est immutable. ` +
              `Le nom n'est PAS empreinté et le contenu est provisoire (icônes régénérées ` +
              `depuis les jetons) : une icône rebâtie ne doit jamais attendre l'expiration ` +
              `d'un cache d'un an (A01, R1).`,
          ).not.toMatch(/immutable/i);
          test.info().annotations.push({ type: `Cache-Control ${chemin}`, description: cc ?? '' });
        });
      }
    });

    // -------------------------------------------------------------------------
    // `crossOriginIsolated` — ASSERTÉ, pas seulement relevé (A29 R7). C'est la
    // propriété que COOP + COEP existent pour produire ; l'encadré du Caddyfile
    // l'affirme comme un fait mesuré, et rien ne rougissait le jour où elle
    // retomberait à `false`. Sur les DEUX fronts, sur les DEUX piles.
    // -------------------------------------------------------------------------
    for (const front of CIBLES.filter((c) => c.genre === 'front')) {
      test(`@critique ${front.nom} — ${front.chemin} : window.crossOriginIsolated === true`, async ({
        browser,
      }) => {
        const contexte = await browser.newContext();
        const page = await contexte.newPage();
        const reponse = await page.goto(harnais.urlDe(pile, front.chemin));
        expect(reponse?.status(), `${front.chemin} doit rendre 200 à travers Caddy`).toBe(200);
        expect(
          await page.evaluate(() => window.crossOriginIsolated),
          `${front.chemin} (pile ${pile.nom}) : window.crossOriginIsolated vaut false — COOP ` +
            `« ${reponse?.headers()['cross-origin-opener-policy'] ?? '(absent)'} », COEP ` +
            `« ${reponse?.headers()['cross-origin-embedder-policy'] ?? '(absent)'} ». L'isolation ` +
            `d'origine que le snippet (securite) promet n'est pas celle que le navigateur ` +
            `applique (ZAP 90004, 06 §10.2).`,
        ).toBe(true);
        await contexte.close();
      });
    }

    // -------------------------------------------------------------------------
    // TOUTE RÉPONSE SERVIE PORTE UN Cache-Control — le détecteur de §4-B.
    // Sans liste blanche : chaque famille, chaque chemin, chaque pile rend son
    // verdict. « Interdit : une garde verte par omission » (A01).
    // -------------------------------------------------------------------------
    test.describe('toute réponse servie porte un Cache-Control (ZAP 10049 ne le voit pas)', () => {
      for (const { chemin, famille, statuts } of CHEMINS_SERVIS) {
        test(`@critique ${chemin} (${famille}) : Cache-Control présent`, async ({ request }) => {
          const reponse = await request.get(harnais.urlDe(pile, chemin), { maxRedirects: 0 });
          expect(
            statuts,
            `${chemin} (pile ${pile.nom}) rend ${String(reponse.status())} — attendu ` +
              `${statuts.join(' ou ')} ; on ne juge la politique de cache que d'une réponse ` +
              `du produit, pas d'une page d'erreur. Journal Caddy :\n${harnais.journal()}`,
          ).toContain(reponse.status());
          const cc = reponse.headers()['cache-control'];
          expect(
            cc,
            `${chemin} (${famille}, pile ${pile.nom}) sort de Caddy SANS Cache-Control. Le bloc ` +
              `« MISE EN CACHE » du Caddyfile pose une politique EXPLICITE par famille ; un chemin ` +
              `qui n'entre dans aucun matcher est un trou — et ZAP 10049, classificateur, le range ` +
              `dans la même colonne que les assets immutable : il ne le verra jamais.`,
          ).toBeDefined();
          test.info().annotations.push({ type: `Cache-Control ${chemin}`, description: cc ?? '' });
        });
      }

      // FAIT À CORRIGER À L6c — PAS UN ATTENDU DE SÉCURITÉ. Même motif que le
      // test §4-A ci-dessus : le titre dit « défaut », l'annotation cite
      // l'arbitrage, et le test ROUGIT le jour où L6c corrige — signal de
      // l'inverser (exiger `no-store`) dans le même commit.
      for (const { chemin, statut } of CHEMINS_API) {
        test(`@critique FAIT À CORRIGER À L6c (§4-B) : ${chemin} sort SANS Cache-Control — la réponse JSON de l'API est stockable`, async ({
          request,
        }) => {
          const reponse = await request.get(harnais.urlDe(pile, chemin), { maxRedirects: 0 });
          expect(
            reponse.status(),
            `${chemin} (pile ${pile.nom}) : statut ${String(reponse.status())}, attendu ${String(statut)}`,
          ).toBe(statut);
          const en = reponse.headers();
          expect(
            en['origin-agent-cluster'],
            `${chemin} (pile ${pile.nom}) ne porte pas Origin-Agent-Cluster : la réponse n'est pas ` +
              `celle de l'amont (helmet) relayée par Caddy — page d'erreur de Caddy ? Journal :\n` +
              harnais.journal(),
          ).toBe('?1');

          test.info().annotations.push({
            type: 'fait à corriger — L6c',
            description:
              `Arbitrage : DECISIONS.md « 2026-09-08 — [P-C] Trois écarts hors critères : ` +
              `lesquels se corrigent pendant une porte échouée ? », point (b) (A01) — ` +
              `Cache-Control: no-store sur les réponses authentifiées (ASVS L2 V8.2.1), assigné ` +
              `à A13, lot L6, porte P-D. Le scan ZAP, non authentifié, ne verra jamais ces routes : ` +
              `ce test est le seul détecteur. ${chemin} (${pile.nom}) sert Cache-Control : ` +
              (en['cache-control'] ?? '(absent)'),
          });

          expect(
            en['cache-control'],
            `${chemin} (pile ${pile.nom}) porte désormais « ${String(en['cache-control'])} » : ` +
              `c'est la correction attendue à L6c (§4-B). Réécrire ce test en attendu — exiger ` +
              `no-store sur les réponses de l'API — dans le MÊME commit.`,
          ).toBeUndefined();
        });
      }
    });
  });
}

// -----------------------------------------------------------------------------
// PROUVÉ EN NAVIGATEUR (A01 PR 104) — la PWA terrain démarre sous les en-têtes
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

/** Ce que le navigateur signale comme bloqué ou violé — vidé entre deux phases. */
interface Collecte {
  bloquees: string[];
  consoleSecurite: string[];
  vider(): void;
}

function ecouterBlocages(page: Page): Collecte {
  const collecte: Collecte = {
    bloquees: [],
    consoleSecurite: [],
    vider() {
      this.bloquees.length = 0;
      this.consoleSecurite.length = 0;
    },
  };
  page.on('requestfailed', (requete) => {
    const motif = requete.failure()?.errorText ?? '';
    // ERR_BLOCKED_BY_RESPONSE = COEP/CORP ; ERR_BLOCKED_BY_CSP = CSP. Le reste
    // (un abandon, une coupure — et HORS LIGNE, toute requête réseau) n'est pas
    // le sujet de cette garde.
    if (/BLOCKED_BY_RESPONSE|BLOCKED_BY_CSP/.test(motif)) {
      collecte.bloquees.push(`${requete.url()} — ${motif}`);
    }
  });
  page.on('console', (message) => {
    const texte = message.text();
    if (
      /Content Security Policy|Cross-Origin-Embedder-Policy|Cross-Origin-Resource-Policy|ERR_BLOCKED_BY/i.test(
        texte,
      )
    ) {
      collecte.consoleSecurite.push(texte);
    }
  });
  return collecte;
}

/**
 * Les verdicts d'une phase — en ligne ou hors ligne — sous `expect.soft` : un
 * seul rouge ne doit pas cacher les autres. Le test échoue quand même ; il dit
 * seulement TOUT ce qu'il a vu, et sous quel en-tête.
 */
async function verdicts(page: Page, phase: string, collecte: Collecte): Promise<void> {
  const sondes = await sonder(page);
  test.info().annotations.push({
    type: `sondes navigateur — ${phase}`,
    description: JSON.stringify(sondes),
  });
  const violations = await page.evaluate(() => window.__violationsCsp ?? []);
  expect
    .soft(
      violations,
      `[${phase}] violations de CSP dans le navigateur sous la CSP servie : ${JSON.stringify(violations, null, 1)}`,
    )
    .toEqual([]);
  expect
    .soft(
      collecte.bloquees,
      `[${phase}] ressources bloquées par COEP/CORP/CSP :\n${collecte.bloquees.join('\n')}`,
    )
    .toEqual([]);
  expect
    .soft(
      collecte.consoleSecurite,
      `[${phase}] messages de sécurité en console :\n${collecte.consoleSecurite.join('\n')}`,
    )
    .toEqual([]);
  const { crossOriginIsolated, ...verbales } = sondes;
  for (const [sonde, verdict] of Object.entries(verbales)) {
    expect.soft(verdict, `[${phase}] sonde « ${sonde} » sous les en-têtes servis`).toBe('ok');
  }
  // ASSERTÉ, pas relevé (A29 R7) : c'est la propriété que COOP + COEP servent à
  // produire. Hors ligne, c'est le document servi PAR LE SERVICE WORKER qui la
  // porte — ou non : le Cache Storage conserve les en-têtes de réponse, et un
  // précache qui les perdrait ferait retomber l'isolation à `false` sans réseau.
  expect
    .soft(
      crossOriginIsolated,
      `[${phase}] window.crossOriginIsolated vaut false : COOP/COEP ne produisent pas ` +
        `l'isolation d'origine annoncée (ZAP 90004, 06 §10.2).`,
    )
    .toBe(true);
}

/**
 * Le même passage en mode avion que hors-ligne-l5.e2e.ts (`passerEnModeAvion`),
 * avec ses deux pièges déjà mesurés : attendre l'ACTIVATION du worker par
 * `expect.poll` (jamais `serviceWorker.ready` sans limite, jamais un
 * `waitForFunction` asynchrone qui rend vrai d'emblée) ; et réappliquer la
 * coupure après le rechargement, parce que `navigator.onLine` repasse à `true`
 * dans le document neuf alors que le réseau reste coupé.
 */
async function couperLeReseau(contexte: BrowserContext, page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const inscriptions = await navigator.serviceWorker.getRegistrations();
          return inscriptions.some((i) => i.active?.state === 'activated');
        }),
      {
        message: 'le service worker doit être ACTIVÉ avant qu’on coupe le réseau',
        timeout: 60_000,
      },
    )
    .toBe(true);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 60_000,
  });
  await contexte.setOffline(true);
  await page.reload();
  await contexte.setOffline(false);
  await contexte.setOffline(true);
  expect(
    await page.evaluate(async () => {
      try {
        await fetch(`/sonde-hors-ligne-${String(Date.now())}`, { cache: 'no-store' });
        return 'le réseau répond encore';
      } catch {
        return 'coupé';
      }
    }),
    'une requête réelle doit échouer : le drapeau seul ne prouve rien',
  ).toBe('coupé');
}

test.describe('prouvé en navigateur — la PWA terrain démarre sous les en-têtes servis', () => {
  // ── EN LIGNE, PUIS HORS LIGNE — DANS LE MÊME TEST, ET POURQUOI (A29 R9) ───
  // `hors-ligne-l5.e2e.ts` prouve le mode avion contre `vite preview`, qui ne
  // sert AUCUN en-tête. Ce fichier prouvait les en-têtes derrière Caddy, sans
  // jamais passer hors ligne. Entre les deux, PERSONNE ne prouvait que la PWA
  // démarre HORS LIGNE sous la CSP/COEP réellement servies — la thèse même du
  // §4-C, appliquée au seul invariant que P-C prouve (invariant 1).
  // Hors ligne, le document vient du Cache Storage du service worker, AVEC les
  // en-têtes que Caddy avait posés : la CSP est rejouée, `crossOriginIsolated`
  // doit tenir, Argon2id (WASM) doit se dériver, la police doit se charger —
  // sans une requête réseau. C'est ce que la seconde phase mesure.
  test(`@critique aucune violation CSP, aucune ressource bloquée : Argon2id, data:, blob:, service worker, police — EN LIGNE puis HORS LIGNE`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
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
    const collecte = ecouterBlocages(page);

    const reponse = await page.goto(harnais.urlDe(pile, '/'));
    expect(reponse?.status(), 'la racine du terrain doit rendre 200 à travers Caddy').toBe(200);
    const enTetes = reponse?.headers() ?? {};
    test.info().annotations.push({
      type: 'en-têtes vus par le navigateur — en ligne',
      description:
        `CSP: ${enTetes['content-security-policy'] ?? '(absent)'} · ` +
        `COEP: ${enTetes['cross-origin-embedder-policy'] ?? '(absent)'} · ` +
        `COOP: ${enTetes['cross-origin-opener-policy'] ?? '(absent)'} · ` +
        `CORP: ${enTetes['cross-origin-resource-policy'] ?? '(absent)'}`,
    });

    // Le chemin de production intégral : Argon2id dans le navigateur (hash-wasm,
    // `'wasm-unsafe-eval'`), enveloppe WebCrypto, écran suivant rendu.
    await preparerAppareilNeuf(page, MOT_DE_PASSE_APPAREIL);
    await verdicts(page, 'en ligne', collecte);

    // ── HORS LIGNE : démarrage à froid, servi par le précache, sous les MÊMES
    // en-têtes — ceux que le service worker a mis en cache avec le document.
    await couperLeReseau(contexte, page);
    collecte.vider();
    const rechargee = await page.reload();
    expect(
      rechargee?.fromServiceWorker(),
      'hors ligne, le document doit venir du service worker — sinon rien ne prouve un démarrage sans réseau',
    ).toBe(true);
    const enTetesHorsLigne = rechargee?.headers() ?? {};
    test.info().annotations.push({
      type: 'en-têtes vus par le navigateur — hors ligne (service worker)',
      description:
        `CSP: ${enTetesHorsLigne['content-security-policy'] ?? '(absent)'} · ` +
        `COEP: ${enTetesHorsLigne['cross-origin-embedder-policy'] ?? '(absent)'} · ` +
        `COOP: ${enTetesHorsLigne['cross-origin-opener-policy'] ?? '(absent)'} · ` +
        `CORP: ${enTetesHorsLigne['cross-origin-resource-policy'] ?? '(absent)'}`,
    });
    for (const nom of [
      'content-security-policy',
      'cross-origin-embedder-policy',
      'cross-origin-opener-policy',
    ]) {
      expect
        .soft(
          enTetesHorsLigne[nom],
          `hors ligne, ${nom} n'est pas celui que Caddy avait servi : le précache ne rejoue ` +
            `pas les en-têtes de sécurité, et l'app démarre sans réseau sous une AUTRE politique.\n` +
            `Hors ligne : ${enTetesHorsLigne[nom] ?? '(absent)'}\nEn ligne  : ${enTetes[nom] ?? '(absent)'}`,
        )
        .toBe(enTetes[nom]);
    }

    // Le coffre existe : l'écran est « Déverrouiller » — et la dérivation
    // Argon2id se rejoue, hors ligne, sous la CSP rejouée par le worker.
    await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);
    await verdicts(page, 'hors ligne', collecte);

    await contexte.setOffline(false);
    await contexte.close();
  });
});
