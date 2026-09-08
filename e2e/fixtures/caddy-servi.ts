// =============================================================================
// FIXTURE — LE VRAI CADDY, LE VRAI CADDYFILE, LES VRAIS BUILDS, ET UN AMONT
// `axion-api` DERRIÈRE LUI : ce que le navigateur de l'auditeur reçoit.
//
// Écrit par A26 (testeur E2E), qui n'a produit aucune ligne de infra/caddy/ ni
// d'apps/api/src/ (09 §5.6). Traçabilité : E36, E43 · 06 §10.2 · 11 §7.
//
// ── POURQUOI UN CONTENEUR ET PAS UNE LECTURE DU FICHIER ────────────────────
// Un en-tête de sécurité n'existe que s'il est SERVI. `app.inject` sur l'API
// voit ce que helmet pose ; le client, lui, voit ce que Caddy laisse passer —
// et pendant huit jours ces deux réalités ont divergé sans qu'un test le dise
// (DOSSIER_ZAP_2026-09-08 §4-A). Le harnais fait donc tourner l'image de
// infra/caddy/Dockerfile, avec le Caddyfile du dépôt, sur les builds réels, et
// place derrière `/api/*` un amont qui pose les en-têtes de helmet
// (`amont-api-factice.caddy`). Il ne pose aucune assertion : il SERT.
//
// ── DEUX PILES, COMME EN PRODUCTION ────────────────────────────────────────
// Les deux blocs de site du Caddyfile (`:8080` principale, `:8081` staging)
// écoutent dans le MÊME processus. Chacun importe le snippet `(securite)` ;
// interroger les deux garantit qu'aucun ne dérive de l'autre.
//
// ── `AXION_CADDYFILE_EPROUVE` — ÉPROUVER UNE COPIE, JAMAIS EN CI ───────────
// Une garde qui n'a jamais été vue rouge n'est pas une garde. Cette variable
// désigne un AUTRE Caddyfile (une copie hors dépôt, mutée : HSTS retiré, COEP
// posé, CSP cible) pour vérifier que la garde rougit et verdit là où elle doit.
// Elle est REFUSÉE quand `CI` est posé : en CI, seul le Caddyfile du dépôt est
// éprouvé, et personne ne peut pointer la garde ailleurs. Le chemin éprouvé est
// porté en annotation du rapport, pour qu'un vert local dise sur quoi il porte.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOSSIER_CADDY = join(RACINE, 'infra', 'caddy');
const DOSSIER_FIXTURES = dirname(fileURLToPath(import.meta.url));

/** Les deux blocs de site du Caddyfile, et le snippet de fronts que chacun importe. */
export const PILES_CADDY = [
  { nom: 'principale', portInterne: '8080', racine: 'principal', snippet: 'fronts_principal' },
  { nom: 'staging', portInterne: '8081', racine: 'staging', snippet: 'fronts_staging' },
] as const;

export type PileCaddy = (typeof PILES_CADDY)[number];

export interface HarnaisCaddy {
  /** URL publiée sur l'hôte pour un chemin d'une pile. */
  urlDe(pile: PileCaddy, chemin: string): string;
  /** Le Caddyfile réellement monté — celui du dépôt, sauf `AXION_CADDYFILE_EPROUVE`. */
  caddyfileEprouve: string;
  /** Journal du conteneur Caddy, pour un message d'échec qui dit pourquoi. */
  journal(): string;
  arreter(): void;
}

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
        'version de Caddy éprouver. Ce harnais refuse d’en choisir une à sa place.',
    );
  }
  return trouve;
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function exigerDocker(): void {
  try {
    docker('version', '--format', '{{.Server.Version}}');
  } catch (erreur) {
    throw new Error(
      'Docker est indisponible, et ce harnais ne se contente pas de moins.\n\n' +
        'Les en-têtes éprouvés ici vivent dans la configuration de Caddy : la seule façon ' +
        'de savoir ce qu’il RÉPOND est de le faire tourner. Un contrôle de repli qui lirait ' +
        'le fichier serait vert sur une règle qui ne sert rien — c’est le défaut qu’on ' +
        'traque (DOSSIER_ZAP §4-C), pas une option de secours. Aucun `skip` ici : un ' +
        'Docker absent est un ÉCHEC, pas une exemption (09 §5.7).\n' +
        'Le dépôt exige déjà Docker pour la suite d’intégration (Testcontainers).\n\n' +
        `Détail : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
  }
}

/** Le Caddyfile à monter : celui du dépôt, ou la copie désignée — jamais en CI. */
function caddyfileAMonter(): string {
  const surcharge = process.env.AXION_CADDYFILE_EPROUVE;
  if (surcharge === undefined || surcharge === '') return join(DOSSIER_CADDY, 'Caddyfile');
  if (process.env.CI !== undefined && process.env.CI !== '') {
    throw new Error(
      'AXION_CADDYFILE_EPROUVE est posée en CI. En CI, seul le Caddyfile du dépôt est ' +
        'éprouvé : cette variable sert à voir la garde rougir et verdir sur une copie, ' +
        'en local. La refuser ici empêche un vert de CI de porter sur un autre fichier.',
    );
  }
  if (!isAbsolute(surcharge)) {
    throw new Error(`AXION_CADDYFILE_EPROUVE doit être un chemin absolu : « ${surcharge} »`);
  }
  return surcharge;
}

function portPublie(conteneur: string, portInterne: string): number {
  // `docker port` rend une ligne par famille d'adresses (« 0.0.0.0:49155 », « [::]:49155 »).
  const premiere = docker('port', conteneur, `${portInterne}/tcp`).split('\n')[0] ?? '';
  const port = Number.parseInt(premiere.slice(premiere.lastIndexOf(':') + 1), 10);
  if (Number.isNaN(port)) {
    throw new Error(`Port publié illisible pour ${portInterne}/tcp : « ${premiere} »`);
  }
  return port;
}

async function attendreVivant(url: string, limiteMs: number, journal: () => string): Promise<void> {
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
  throw new Error(
    `Caddy n'a pas répondu 200 sur ${url} en ${String(limiteMs)} ms (${derniere}).\n` +
      `Journal du conteneur :\n${journal()}`,
  );
}

/**
 * Démarre le réseau, l'amont factice `axion-api` et le Caddy du dépôt.
 *
 * `suffixe` distingue les harnais de deux fichiers de test qui tourneraient en
 * même temps (Playwright lance les fichiers en parallèle) : deux conteneurs du
 * même nom, et le second `docker run` échoue.
 */
export async function demarrerCaddyServi(suffixe: string): Promise<HarnaisCaddy> {
  exigerDocker();

  const marque = `${suffixe}-${String(process.pid)}`;
  const reseau = `axion-e2e-reseau-${marque}`;
  const amont = `axion-e2e-amont-${marque}`;
  const caddy = `axion-e2e-caddy-${marque}`;
  const image = imageCaddy();
  const caddyfile = caddyfileAMonter();

  const arreter = (): void => {
    for (const conteneur of [caddy, amont]) {
      try {
        docker('rm', '-f', conteneur);
      } catch {
        // Aucun conteneur résiduel : c'est le cas nominal.
      }
    }
    try {
      docker('network', 'rm', reseau);
    } catch {
      // Le réseau tombe avec ses conteneurs ; sinon, rien à masquer.
    }
  };
  arreter();

  const journal = (): string => {
    try {
      return docker('logs', caddy);
    } catch {
      return '(journal du conteneur illisible)';
    }
  };

  docker('network', 'create', reseau);

  // L'amont porte l'ALIAS `axion-api`, le nom que le bloc 1 du Caddyfile joint
  // (`reverse_proxy axion-api:{$API_PORT}`). L'amont du bloc 2 (`staging-api`)
  // est le même conteneur : ce harnais éprouve le snippet `(securite)`, pas la
  // séparation des piles, que le compose garantit et documente.
  docker(
    'run',
    '-d',
    '--name',
    amont,
    '--network',
    reseau,
    '--network-alias',
    'axion-api',
    '--network-alias',
    'staging-api',
    '-v',
    `${join(DOSSIER_FIXTURES, 'amont-api-factice.caddy')}:/etc/caddy/Caddyfile:ro`,
    image,
  );

  const dist = {
    field: join(RACINE, 'apps', 'field', 'dist'),
    hq: join(RACINE, 'apps', 'hq', 'dist'),
  };
  const montages: string[] = [
    '-v',
    `${caddyfile}:/etc/caddy/Caddyfile:ro`,
    '-v',
    `${join(DOSSIER_CADDY, 'fronts.static.caddy')}:/etc/caddy/fronts.static.caddy:ro`,
  ];
  // Les MÊMES builds sous les DEUX racines : le harnais porte sur les en-têtes,
  // pas sur la séparation des volumes. Servir des fichiers différents ne
  // prouverait rien de plus.
  for (const pile of PILES_CADDY) {
    montages.push('-v', `${dist.field}:/srv/${pile.racine}/field:ro`);
    montages.push('-v', `${dist.hq}:/srv/${pile.racine}/hq:ro`);
  }

  docker(
    'run',
    '-d',
    '--name',
    caddy,
    '--network',
    reseau,
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
    image,
  );

  const portsPublies = new Map<string, number>();
  const urlDe = (pile: PileCaddy, chemin: string): string => {
    const port = portsPublies.get(pile.nom);
    if (port === undefined) throw new Error(`Pile ${pile.nom} non démarrée.`);
    return `http://127.0.0.1:${String(port)}${chemin}`;
  };

  for (const pile of PILES_CADDY) {
    portsPublies.set(pile.nom, portPublie(caddy, pile.portInterne));
    await attendreVivant(urlDe(pile, '/'), 60_000, journal);
  }
  // L'amont aussi doit répondre À TRAVERS Caddy : un 502 porterait les en-têtes
  // de la page d'erreur, pas ceux d'une réponse relayée, et la garde de l'API
  // mesurerait autre chose que ce qu'elle annonce.
  await attendreVivant(urlDe(PILES_CADDY[0], '/api/v1/health'), 60_000, journal);

  return { urlDe, caddyfileEprouve: caddyfile, journal, arreter };
}
