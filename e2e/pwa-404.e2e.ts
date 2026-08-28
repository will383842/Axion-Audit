// =============================================================================
// E2E — `/sw.js` ET `/manifest.webmanifest` RENDENT 404, SUR LES DEUX PILES.
//
// LA DÉCISION QUE CE TEST GARDE (arbitrage A21, tracé dans DECISIONS.md) :
// aucune PWA n'est livrée avant le lot L5c, donc ces chemins doivent rendre 404
// — surtout pas un demi-manifeste.
//
//   · UN SERVICE WORKER enregistré depuis `/` prend la portée de tout le domaine
//     et SURVIT au déploiement suivant. Le révoquer demanderait d'atteindre des
//     iPads réels, en clientèle, hors ligne.
//   · UN DEMI-MANIFESTE — sans icônes 192/512, sans `maskable`, sans
//     `apple-touch-icon` PNG, sans l'écran d'installation guidé qu'exige 03 §29,
//     sans le garde-fou `storage.persist()` — rendrait quand même 200
//     `application/manifest+json`. Tout le monde cocherait « PWA installable », et
//     l'ajout à l'écran d'accueil sur iPad continuerait de produire une CAPTURE
//     D'ÉCRAN en guise d'icône. Un demi-manifeste est pire qu'un 404 parce qu'il
//     est VERT.
//
// POURQUOI CE TEST NE PEUT PAS ÊTRE UNE LECTURE DU FICHIER DE CONFIGURATION.
// Le défaut corrigé ici est précisément qu'une règle PEUT s'analyser, se relire
// correctement et ne rien garder : écrite à côté du repli SPA — l'endroit où l'on
// pense spontanément la mettre — elle est évaluée APRÈS que `try_files` a réécrit
// `/sw.js` en `/index.html`, et le front répond 200 text/html. Mesuré le
// 2026-08-28 sur `caddy:2-alpine`, les deux placements côte à côte. Un test qui
// grep le Caddyfile aurait été VERT sur cette version-là. On lance donc le VRAI
// Caddy, avec le VRAI Caddyfile, sur le VRAI build, et on regarde ce qu'il répond.
//
// LE `Content-Type` FAIT PARTIE DE L'ASSERTION, il n'est pas un détail : un repli
// SPA qui rend `index.html` en 404 ferait croire au navigateur qu'il tient un
// manifeste. « 404 » et « 404 sans text/html » ne sont pas la même garantie.
//
// LE JOUR OÙ L5c LIVRE LA PWA : ce fichier s'inverse (200 + icônes + `maskable` +
// portée) au lieu de disparaître. Il ne se supprime pas, il change de sens.
// Traçabilité : E6 (hors ligne), E17, §31 (mise à jour applicative), 03 §29.
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
        'La règle éprouvée ici vit dans la configuration de Caddy : la seule façon de ' +
        'savoir ce qu’elle RÉPOND est de faire tourner Caddy. Un contrôle de repli qui ' +
        'lirait le fichier serait vert sur la version cassée de cette même règle — ' +
        'c’est le défaut qu’on corrige, pas une option de secours.\n' +
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

/** Les quatre chemins de PWA que le lot L0 ne sert pas — et leurs alias. */
const CHEMINS_PWA = [
  '/sw.js',
  '/manifest.webmanifest',
  '/hq/sw.js',
  '/hq/manifest.webmanifest',
  // `/service-worker.js` : l'autre nom que Workbox produit par défaut. Le laisser
  // ouvert reviendrait à fermer la porte et à laisser la fenêtre.
  '/service-worker.js',
  '/hq/service-worker.js',
] as const;

for (const pile of PILES) {
  test.describe(`pile ${pile.nom} (snippet ${pile.snippet})`, () => {
    for (const chemin of CHEMINS_PWA) {
      test(`@critique ${chemin} rend 404, et pas une page HTML déguisée`, async ({ request }) => {
        const reponse = await request.get(urlDe(pile, chemin), { maxRedirects: 0 });

        expect(
          reponse.status(),
          `${chemin} doit rendre 404 tant qu'aucune PWA n'est livrée. Un 200 ici ` +
            `signifie que le repli SPA a servi index.html : le navigateur croirait ` +
            `tenir un service worker ou un manifeste.`,
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
    // CONTRE-CHAMP : la règle ne doit RIEN casser d'autre.
    // Un 404 posé trop large (ou trop tôt dans la chaîne) éteindrait le repli SPA
    // ou les assets fingerprintés — une correction qui casse ailleurs sans le dire.
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
          `${cas.chemin} : le 404 des chemins de PWA a débordé sur ${cas.quoi}`,
        ).toBe(200);
        expect(reponse.headers()['content-type'] ?? '').toMatch(/text\/html/i);
      });
    }
  });
}
