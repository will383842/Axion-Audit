// =============================================================================
// E2E — LA PWA TERRAIN EST SERVIE : `/sw.js`, `/manifest.webmanifest` ET LES
// ICÔNES RENDENT 200 AVEC LES BONS EN-TÊTES, SUR LES DEUX PILES.
//
// CE FICHIER S'APPELAIT `pwa-404.e2e.ts` ET EXIGEAIT L'INVERSE. Le lot L0 avait
// fermé ces chemins (arbitrage A21, 2026-08-28) tant qu'aucune PWA n'était
// livrée : un service worker « pour voir » survit au déploiement suivant sur
// des iPads réels, et un demi-manifeste est pire qu'un 404 parce qu'il est
// vert. L5a livre la PWA (`apps/field/scripts/build-sw.mjs`, manifeste émis
// par `apps/field/vite.config.ts`) : la revue croisée A29 (B1) a mesuré que
// `register('/sw.js')` échouait derrière le 404, donc que l'application ne
// démarrait pas hors réseau — l'invariant 1 lui-même. Arbitrage A01 tracé dans
// DECISIONS.md (2026-09-02, « Revue croisée A29 ») : c'est L5a qui livre la
// PWA, à lui d'ouvrir la porte. Le fichier a donc CHANGÉ DE SENS, comme son
// en-tête d'origine l'annonçait, et de nom, parce que l'ancien mentait.
//
// CE QUE CE TEST GARDE DÉSORMAIS :
//   · `/sw.js` : 200, JavaScript, `Cache-Control` sans mise en cache (§31 : un
//     service worker mis en cache longtemps ne se met jamais à jour), et un corps
//     qui est bien le service worker Workbox — pas `index.html` déguisé.
//   · `/manifest.webmanifest` : 200, `application/manifest+json`, JSON valide,
//     portée `/`, `display: standalone` (03 §22.1 : sur iPad, la persistance
//     d'IndexedDB exige l'installation), AU MOINS UNE ICÔNE ≥ 192 px (A29 B2)
//     et chaque icône déclarée EXISTE réellement derrière Caddy (une icône
//     déclarée mais absente = capture d'écran en guise d'icône sur iPad).
//   · `/apple-touch-icon.png` : 200 image/png (iOS ignore les icônes du manifeste).
//   · Un fichier de PWA ABSENT rend 404, jamais `index.html` en 200 text/html :
//     la moitié de la garantie du lot L0 qui survit.
//   · Ce qui n'est PAS livré reste fermé : la console siège n'est pas une PWA
//     (`/hq/sw.js`, `/hq/manifest.webmanifest`) et `/service-worker.js` — l'autre
//     nom que Workbox produit par défaut — n'existe pas. 404 muet, sans text/html.
//
// POURQUOI CE TEST NE PEUT PAS ÊTRE UNE LECTURE DU FICHIER DE CONFIGURATION.
// Une règle Caddy PEUT s'analyser, se relire correctement et ne rien garder :
// l'ordre des directives place `try_files` avant `handle`, et une règle écrite
// « au bon endroit » à la lecture est évaluée après que le repli SPA a réécrit
// le chemin (mesuré le 2026-08-28 sur `caddy:2-alpine`). On lance donc le VRAI
// Caddy, avec le VRAI Caddyfile, sur le VRAI build, et on regarde ce qu'il répond.
//
// LE `Content-Type` FAIT PARTIE DE L'ASSERTION : un navigateur refuse un service
// worker servi en text/html, et un manifeste servi en `application/octet-stream`
// n'installe rien — dans les deux cas sans un mot dans l'interface.
// Traçabilité : E6 (hors ligne), E17, §31 (mise à jour applicative), 03 §22.1, 03 §29.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_CADDY = join(RACINE, 'infra', 'caddy');

/**
 * L'image vient du `FROM` d'infra/caddy/Dockerfile, jamais d'une constante
 * recopiée : éprouver une autre version de Caddy que celle qui part en
 * production reviendrait à tester un serveur que personne ne déploie.
 */
function imageCaddy(): string {
  const dockerfile = readFileSync(join(DOSSIER_CADDY, 'Dockerfile'), 'utf8');
  const trouve = /^FROM\s+(\S+)/m.exec(dockerfile)?.[1];
  if (trouve === undefined) {
    throw new Error(
      'infra/caddy/Dockerfile ne déclare aucun `FROM` : impossible de savoir quelle ' +
        'version de Caddy éprouver. Ce test refuse d’en choisir une à sa place.',
    );
  }
  return trouve;
}

const CONTENEUR = `axion-e2e-caddy-${String(process.pid)}`;

/** Les deux blocs de site du Caddyfile, et le snippet de fronts que chacun importe. */
const PILES = [
  { nom: 'principale', portInterne: '8080', racine: 'principal', snippet: 'fronts_principal' },
  { nom: 'staging', portInterne: '8081', racine: 'staging', snippet: 'fronts_staging' },
] as const;

/** Rempli par le hook de démarrage : port publié sur l'hôte, par pile. */
const portsPublies = new Map<string, number>();

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function portPublie(portInterne: string): number {
  // `docker port` rend une ligne par famille d'adresses (« 0.0.0.0:49155 », « [::]:49155 »).
  const premiere = docker('port', CONTENEUR, `${portInterne}/tcp`).split('\n')[0] ?? '';
  const port = Number.parseInt(premiere.slice(premiere.lastIndexOf(':') + 1), 10);
  if (Number.isNaN(port)) {
    throw new Error(`Port publié illisible pour ${portInterne}/tcp : « ${premiere} »`);
  }
  return port;
}

function urlDe(pile: (typeof PILES)[number], chemin: string): string {
  const port = portsPublies.get(pile.nom);
  if (port === undefined) throw new Error(`Pile ${pile.nom} non démarrée.`);
  return `http://127.0.0.1:${String(port)}${chemin}`;
}

async function attendreVivant(url: string, limiteMs: number): Promise<void> {
  const echeance = Date.now() + limiteMs;
  let derniere = 'aucune tentative';
  while (Date.now() < echeance) {
    try {
      const reponse = await fetch(url, { redirect: 'manual' });
      if (reponse.status === 200) return;
      derniere = `statut ${String(reponse.status)}`;
    } catch (erreur) {
      derniere = erreur instanceof Error ? erreur.message : String(erreur);
    }
    await new Promise((suite) => setTimeout(suite, 250));
  }
  let journal = '';
  try {
    journal = docker('logs', CONTENEUR);
  } catch {
    journal = '(journal du conteneur illisible)';
  }
  throw new Error(
    `Caddy n'a pas répondu 200 sur ${url} en ${String(limiteMs)} ms (${derniere}).\n` +
      `Journal du conteneur :\n${journal}`,
  );
}

// Un seul conteneur pour toute la suite : les deux blocs de site du Caddyfile
// écoutent dans le MÊME processus, exactement comme en production.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000);

  try {
    docker('version', '--format', '{{.Server.Version}}');
  } catch (erreur) {
    throw new Error(
      'Docker est indisponible, et ce test ne se contente pas de moins.\n\n' +
        'Les règles éprouvées ici vivent dans la configuration de Caddy : la seule façon ' +
        'de savoir ce qu’elles RÉPONDENT est de faire tourner Caddy. Un contrôle de repli ' +
        'qui lirait le fichier serait vert sur une règle qui ne garde rien — c’est le ' +
        'défaut qu’on traque, pas une option de secours.\n' +
        'Le dépôt exige déjà Docker pour la suite d’intégration (Testcontainers).\n\n' +
        `Détail : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
  }

  try {
    docker('rm', '-f', CONTENEUR);
  } catch {
    // Aucun conteneur résiduel : c'est le cas nominal.
  }

  const dist = {
    field: join(RACINE, 'apps', 'field', 'dist'),
    hq: join(RACINE, 'apps', 'hq', 'dist'),
  };

  const montages: string[] = [
    '-v',
    `${join(DOSSIER_CADDY, 'Caddyfile')}:/etc/caddy/Caddyfile:ro`,
    '-v',
    `${join(DOSSIER_CADDY, 'fronts.static.caddy')}:/etc/caddy/fronts.static.caddy:ro`,
  ];
  // Les MÊMES builds servis sous les DEUX racines : ce test porte sur le routage,
  // pas sur la séparation des volumes (que `fronts.static.caddy` documente et que
  // le compose garantit). Servir des fichiers différents ne prouverait rien de plus.
  for (const pile of PILES) {
    montages.push('-v', `${dist.field}:/srv/${pile.racine}/field:ro`);
    montages.push('-v', `${dist.hq}:/srv/${pile.racine}/hq:ro`);
  }

  docker(
    'run',
    '-d',
    '--name',
    CONTENEUR,
    '-p',
    '0:8080',
    '-p',
    '0:8081',
    // Les MÊMES valeurs que le `caddy validate` d'infra/caddy/Dockerfile : le mode
    // de service est imposé par la forme du déploiement, jamais lu dans un .env.
    '-e',
    'CADDY_SITE_ADDRESS=:8080',
    '-e',
    'CADDY_STAGING_SITE_ADDRESS=:8081',
    '-e',
    'API_PORT=3000',
    '-e',
    'CADDY_FRONT_CONFIG=/etc/caddy/fronts.static.caddy',
    ...montages,
    imageCaddy(),
  );

  for (const pile of PILES) {
    portsPublies.set(pile.nom, portPublie(pile.portInterne));
    await attendreVivant(urlDe(pile, '/'), 60_000);
  }
});

test.afterAll(() => {
  try {
    docker('rm', '-f', CONTENEUR);
  } catch {
    // Le nettoyage ne doit jamais masquer le verdict de la suite.
  }
});

/** Forme minimale d'une icône de manifeste W3C — le reste du manifeste n'est pas typé ici. */
interface IconeManifeste {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

/** Les seuls champs du manifeste que ce test lit — le reste n'est pas typé ici. */
interface ManifesteWeb {
  scope: string;
  display: string;
  icons: IconeManifeste[];
}

/** `"192x192"` → 192 ; `"any"` ou illisible → 0 (jamais une taille devinée). */
function plusPetitCote(sizes: string | undefined): number {
  const [largeur, hauteur] = (sizes ?? '').split('x').map((n) => Number.parseInt(n, 10));
  if (largeur === undefined || hauteur === undefined) return 0;
  if (Number.isNaN(largeur) || Number.isNaN(hauteur)) return 0;
  return Math.min(largeur, hauteur);
}

/** Un chemin d'icône du manifeste, résolu contre la racine du domaine comme le ferait le navigateur. */
function cheminIcone(src: string): string {
  return new URL(src, 'http://exemple.invalid/').pathname;
}

const SANS_CACHE = /no-cache|no-store|must-revalidate/i;
const TAILLE_MINIMALE_ICONE = 192;

/** Chemins qui ne sont PAS livrés : console siège (pas une PWA) et alias Workbox. */
const CHEMINS_FERMES = [
  '/hq/sw.js',
  '/hq/manifest.webmanifest',
  '/service-worker.js',
  '/hq/service-worker.js',
] as const;

for (const pile of PILES) {
  test.describe(`pile ${pile.nom} (snippet ${pile.snippet})`, () => {
    // -------------------------------------------------------------------------
    // LE SERVICE WORKER — sans lui, rien ne démarre hors ligne (invariant 1).
    // -------------------------------------------------------------------------
    test('@critique /sw.js est servi en JavaScript, jamais mis en cache', async ({ request }) => {
      const reponse = await request.get(urlDe(pile, '/sw.js'), { maxRedirects: 0 });

      expect(
        reponse.status(),
        `/sw.js doit rendre 200 : L5a livre le service worker. Un 404 ici, et ` +
          `register('/sw.js') échoue — l'application ne démarre plus hors réseau.`,
      ).toBe(200);

      const typeContenu = reponse.headers()['content-type'] ?? '';
      expect(
        typeContenu,
        `/sw.js annonce « ${typeContenu} » : un navigateur refuse un service worker ` +
          `qui n'est pas du JavaScript, et text/html est le symptôme du repli SPA.`,
      ).toMatch(/javascript/i);

      const cache = reponse.headers()['cache-control'] ?? '';
      expect(
        cache,
        `/sw.js porte « Cache-Control: ${cache} » : un service worker mis en cache ` +
          `longtemps ne se met jamais à jour (§31). Le matcher @sw du Caddyfile ne s'applique plus.`,
      ).toMatch(SANS_CACHE);

      const corps = await reponse.text();
      expect(corps, `/sw.js commence comme une page HTML : c'est index.html déguisé`).not.toMatch(
        /^\s*<!doctype html/i,
      );
      expect(
        corps,
        `/sw.js ne contient aucune trace de Workbox : ce n'est pas le service worker ` +
          `construit par apps/field/scripts/build-sw.mjs.`,
      ).toMatch(/workbox/i);
    });

    // -------------------------------------------------------------------------
    // LE MANIFESTE — installable, avec de VRAIES icônes (A29 B2).
    // -------------------------------------------------------------------------
    test('@critique /manifest.webmanifest est un manifeste installable avec icônes ≥ 192', async ({
      request,
    }) => {
      const reponse = await request.get(urlDe(pile, '/manifest.webmanifest'), { maxRedirects: 0 });

      expect(reponse.status(), `/manifest.webmanifest doit rendre 200 : L5a livre la PWA.`).toBe(
        200,
      );

      const typeContenu = reponse.headers()['content-type'] ?? '';
      expect(
        typeContenu,
        `/manifest.webmanifest annonce « ${typeContenu} » au lieu de ` +
          `application/manifest+json : le navigateur n'installe rien, sans un mot.`,
      ).toMatch(/application\/manifest\+json/i);

      const cache = reponse.headers()['cache-control'] ?? '';
      expect(cache, `le manifeste ne doit jamais être mis en cache (§31)`).toMatch(SANS_CACHE);

      const manifeste: unknown = JSON.parse(await reponse.text());
      expect(
        typeof manifeste === 'object' && manifeste !== null,
        `/manifest.webmanifest n'est pas un objet JSON`,
      ).toBe(true);
      const m = manifeste as Partial<ManifesteWeb>;

      expect(m.scope, `la portée du manifeste doit être la racine du domaine`).toBe('/');
      expect(
        m.display,
        `display doit être « standalone » : sur iPad, la persistance d'IndexedDB exige ` +
          `l'installation « Sur l'écran d'accueil » (03 §22.1).`,
      ).toBe('standalone');

      const icones = Array.isArray(m.icons) ? m.icons : [];
      expect(
        icones.length,
        `le manifeste ne déclare AUCUNE icône : l'ajout à l'écran d'accueil produirait ` +
          `une capture d'écran en guise d'icône. Un demi-manifeste est pire qu'un 404.`,
      ).toBeGreaterThan(0);

      const grandes = icones.filter((icone) => plusPetitCote(icone.sizes) >= TAILLE_MINIMALE_ICONE);
      expect(
        grandes.length,
        `aucune icône ≥ ${String(TAILLE_MINIMALE_ICONE)} px déclarée (A29 B2) : ` +
          `tailles présentes = ${icones.map((i) => i.sizes ?? '?').join(', ')}`,
      ).toBeGreaterThan(0);

      // Chaque icône déclarée existe DERRIÈRE CADDY, en PNG : une icône déclarée
      // mais absente est exactement le demi-manifeste que le lot L0 refusait.
      for (const icone of icones) {
        const chemin = cheminIcone(icone.src);
        const image = await request.get(urlDe(pile, chemin), { maxRedirects: 0 });
        expect(image.status(), `icône déclarée « ${icone.src} » introuvable (${chemin})`).toBe(200);
        expect(
          image.headers()['content-type'] ?? '',
          `icône « ${icone.src} » servie avec un mauvais type (repli SPA ?)`,
        ).toMatch(/^image\/png/i);
      }
    });

    test('@critique /apple-touch-icon.png est servi en PNG', async ({ request }) => {
      // iOS ignore les icônes du manifeste : sans ce fichier, l'ajout à l'écran
      // d'accueil sur iPad — la cible la plus dure (03 §22.1) — est une capture d'écran.
      const reponse = await request.get(urlDe(pile, '/apple-touch-icon.png'), { maxRedirects: 0 });
      expect(reponse.status(), `/apple-touch-icon.png doit exister (icône iOS)`).toBe(200);
      expect(reponse.headers()['content-type'] ?? '').toMatch(/^image\/png/i);
    });

    // -------------------------------------------------------------------------
    // UN FICHIER DE PWA ABSENT REND 404, JAMAIS index.html — la moitié de la
    // garantie du lot L0 qui survit à l'ouverture.
    // -------------------------------------------------------------------------
    test('@critique une icône absente rend 404, pas une page HTML déguisée', async ({
      request,
    }) => {
      const reponse = await request.get(urlDe(pile, '/icones/inexistante-e2e.png'), {
        maxRedirects: 0,
      });
      expect(
        reponse.status(),
        `un fichier de PWA absent doit rendre 404 : ici le repli SPA a servi index.html, ` +
          `et une icône manquante deviendrait une capture d'écran sur iPad.`,
      ).toBe(404);
      expect(reponse.headers()['content-type'] ?? '').not.toMatch(/text\/html/i);
    });

    // -------------------------------------------------------------------------
    // CE QUI N'EST PAS LIVRÉ RESTE FERMÉ — console siège et alias Workbox.
    // -------------------------------------------------------------------------
    for (const chemin of CHEMINS_FERMES) {
      test(`@critique ${chemin} rend 404, et pas une page HTML déguisée`, async ({ request }) => {
        const reponse = await request.get(urlDe(pile, chemin), { maxRedirects: 0 });

        expect(
          reponse.status(),
          `${chemin} doit rendre 404 : la console siège n'est pas une PWA et L5a ne ` +
            `livre que /sw.js. Un 200 ici signifie que le repli SPA a servi index.html.`,
        ).toBe(404);

        const typeContenu = reponse.headers()['content-type'] ?? '';
        expect(
          typeContenu,
          `${chemin} rend 404 mais annonce « ${typeContenu} » : un 404 servi en ` +
            `text/html est le symptôme exact du repli SPA. Le statut seul ne suffit pas.`,
        ).not.toMatch(/text\/html/i);
        expect(typeContenu, `${chemin} ne doit pas annoncer de manifeste`).not.toMatch(/manifest/i);
      });
    }

    // -------------------------------------------------------------------------
    // CONTRE-CHAMP : l'ouverture ne doit RIEN casser d'autre.
    // Un `handle` posé trop large éteindrait le repli SPA ou la console.
    // -------------------------------------------------------------------------
    for (const cas of [
      { chemin: '/', quoi: 'la racine du front terrain' },
      { chemin: '/hq/', quoi: 'la racine de la console siège' },
      { chemin: '/mission/route/profonde', quoi: 'une route profonde du terrain (repli SPA)' },
      {
        chemin: '/hq/mission/route/profonde',
        quoi: 'une route profonde de la console (repli SPA)',
      },
    ]) {
      test(`${cas.quoi} répond toujours 200 en HTML`, async ({ request }) => {
        const reponse = await request.get(urlDe(pile, cas.chemin), { maxRedirects: 0 });
        expect(
          reponse.status(),
          `${cas.chemin} : les règles de PWA ont débordé sur ${cas.quoi}`,
        ).toBe(200);
        expect(reponse.headers()['content-type'] ?? '').toMatch(/text\/html/i);
      });
    }
  });
}
