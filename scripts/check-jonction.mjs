#!/usr/bin/env node
// =============================================================================
// CONTRÔLE DE JONCTION — appelant → appelé
//
// POURQUOI CE SCRIPT EXISTE. La revue croisée du lot L0 a rendu NON CONFORME avec
// 7 défauts bloquants. Ils avaient tous la MÊME cause : trois agents (monorepo,
// infrastructure, CI) ont livré en parallèle trois moitiés d'interface qui ne se
// rejoignaient pas. Chacun avait écrit un contrat cohérent — dans ses propres
// commentaires. La CI appelait `deploy.sh` sans les arguments que le script exige,
// sondait `/api/health` là où la route est `/api/v1/health`, et invoquait des
// scripts `pnpm` qui n'existaient pas.
//
// Aucun de ces défauts n'était visible depuis un seul fichier. Tous étaient
// évidents en croisant deux fichiers. C'est exactement ce qu'une machine fait bien
// et qu'une relecture humaine rate — parce qu'elle lit un fichier à la fois.
//
// Ce contrôle vérifie donc les trois jonctions qui ont cassé :
//   1. tout `pnpm <script>` appelé par la CI existe réellement ;
//   2. toute variable interpolée par l'infrastructure est documentée au `.env.example` ;
//   3. tout script `infra/scripts/*.sh` invoqué par la CI existe et est exécutable.
//
// Il ne remplace pas la revue croisée : il lui rend le temps qu'elle passait à
// croiser des tableaux, pour qu'elle le passe à juger.
// Traçabilité : E36, E43 · AMELIORATIONS.md étage 1 (lot L0).
// =============================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');
const anomalies = [];

function lire(chemin) {
  return existsSync(resolve(RACINE, chemin)) ? readFileSync(resolve(RACINE, chemin), 'utf8') : '';
}

/** Contenu concaténé de tous les workflows et actions de `.github/`. */
function sourcesCI() {
  const base = resolve(RACINE, '.github');
  if (!existsSync(base)) return [];
  const fichiers = [];
  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = resolve(dossier, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (/\.(ya?ml|mjs|sh)$/.test(entree.name)) {
        fichiers.push({
          chemin: chemin.slice(RACINE.length + 1),
          contenu: readFileSync(chemin, 'utf8'),
        });
      }
    }
  };
  parcourir(base);
  return fichiers;
}

// --- Jonction 1 : les scripts pnpm appelés par la CI existent ---------------

/**
 * Scripts déclarés, INDEXÉS PAR PAQUET.
 *
 * L'index par paquet est ce qui permet de voir qu'un
 * `pnpm --filter @axion/api db:generate` délègue vers un script absent de CE
 * paquet — même si un script du même nom existe ailleurs. C'était le défaut B-4,
 * et sa forme résiduelle N-8 : tous deux invisibles pour un simple ensemble de noms.
 */
function scriptsParPaquet() {
  const carte = new Map();
  const racine = JSON.parse(lire('package.json'));
  carte.set(racine.name ?? 'racine', new Set(Object.keys(racine.scripts ?? {})));
  for (const espace of ['apps', 'packages']) {
    const base = resolve(RACINE, espace);
    if (!existsSync(base)) continue;
    for (const entree of readdirSync(base, { withFileTypes: true })) {
      if (!entree.isDirectory()) continue;
      const pj = lire(`${espace}/${entree.name}/package.json`);
      if (!pj) continue;
      const j = JSON.parse(pj);
      carte.set(j.name ?? entree.name, new Set(Object.keys(j.scripts ?? {})));
    }
  }
  return carte;
}

const parPaquet = scriptsParPaquet();
const disponibles = new Set([...parPaquet.values()].flatMap((s) => [...s]));

// On analyse la CI **et** le `package.json` racine : ses propres scripts délèguent
// vers les espaces de travail, et c'est exactement là que vivait le défaut B-4.
const fichiersCI = [...sourcesCI(), { chemin: 'package.json', contenu: lire('package.json') }];

for (const { chemin, contenu } of fichiersCI) {
  // `pnpm <nom>` — on exclut les sous-commandes de pnpm lui-même, qui ne sont pas
  // des scripts du dépôt.
  const SOUS_COMMANDES = new Set([
    'install',
    'add',
    'remove',
    'exec',
    'dlx',
    'run',
    'store',
    'config',
    'why',
    'list',
    'outdated',
    'audit',
    'licenses',
    'deploy',
    'prune',
    'rebuild',
  ]);
  // `pnpm` doit être en POSITION DE COMMANDE (début de ligne, après `|`, `&&`,
  // `;`, `$(`, ou `run:` en YAML) : sinon `echo "pnpm activé"` serait lu comme un
  // appel au script « activ ». Deux faux positifs de ce genre ont été mesurés sur
  // ce dépôt, et un contrôle qui crie à tort finit par être désactivé.
  //
  // La suite est TOKENISÉE plutôt que capturée par une regex. La revue croisée
  // (défaut N-7) a démontré que la version regex ratait trois formes, dont
  // `pnpm --filter @axion/api <script>` — c'est-à-dire la forme EXACTE du défaut
  // B-4 que ce contrôle est censé empêcher. Un analyseur par jetons gère les
  // drapeaux courts, les drapeaux à valeur séparée et `pnpm run <script>`.
  // Les guillemets font partie des positions de commande : dans un `package.json`,
  // un script s'écrit `"db:migrate": "pnpm --filter @axion/api db:migrate"`. Sans
  // eux, le contrôle ne verrait jamais les délégations du dépôt vers ses propres
  // espaces de travail — c'est-à-dire l'endroit exact du défaut B-4.
  const APPEL_PNPM = /(?:^|[\n;&|(`:'"]|\$\()\s*pnpm\s+([^\n|&;)`'"]*)/g;

  /** Drapeaux dont la valeur est un jeton SÉPARÉ, à consommer avec eux. */
  const DRAPEAUX_A_VALEUR = new Set(['--filter', '-F', '--dir', '-C', '--workspace-concurrency']);

  for (const m of contenu.matchAll(APPEL_PNPM)) {
    const jetons = (m[1] ?? '').trim().split(/\s+/).filter(Boolean);
    /** Paquet visé par `--filter`, s'il y en a un. */
    let cible = null;
    let i = 0;
    while (i < jetons.length) {
      const jeton = jetons[i] ?? '';
      if (DRAPEAUX_A_VALEUR.has(jeton)) {
        if (jeton === '--filter' || jeton === '-F') cible = jetons[i + 1] ?? null;
        i += 2; // le drapeau ET sa valeur
        continue;
      }
      if (jeton.startsWith('-')) {
        i += 1;
        continue;
      }
      break;
    }
    // `pnpm run <script>` : le nom réel est le jeton SUIVANT.
    if (jetons[i] === 'run') i += 1;
    const nom = jetons[i] ?? '';

    // Un nom de script est en ASCII. Un mot accentué est du texte français.
    if (!/^[a-z][\w:-]*$/.test(nom)) continue;
    if (SOUS_COMMANDES.has(nom)) continue;

    // Le suffixe `...` de pnpm (`--filter @axion/api...`) désigne le paquet ET ses
    // dépendances : le script doit exister dans le paquet nommé.
    const paquet = cible ? cible.replace(/\.\.\.$/, '') : null;
    const ligne = contenu.slice(0, m.index).split('\n').length;

    if (paquet && parPaquet.has(paquet)) {
      if (parPaquet.get(paquet)?.has(nom)) continue;
      anomalies.push({
        jonction: 'appelant → package.json',
        ou: `${chemin}:${ligne}`,
        quoi: `\`pnpm --filter ${paquet} ${nom}\` : ce paquet ne déclare pas ce script`,
        effet: 'ERR_PNPM_NO_SCRIPT au premier appel — la délégation pointe dans le vide.',
      });
      continue;
    }

    if (disponibles.has(nom)) continue;

    anomalies.push({
      jonction: 'appelant → package.json',
      ou: `${chemin}:${ligne}`,
      quoi: `\`pnpm ${nom}\` n'est déclaré dans AUCUN package.json`,
      effet: 'ERR_PNPM_NO_SCRIPT : le job échoue dès son premier appel.',
    });
  }
}

// --- Jonction 2 : les variables de l'infra sont documentées -----------------

const documentees = new Set(
  [...lire('.env.example').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? ''),
);
// Portées par les GitHub Environments, jamais par le `.env` serveur (02 §30.4-3).
const PORTEES_PAR_GITHUB = new Set([
  'DEPLOY_SSH_KEY',
  'DEPLOY_SSH_KNOWN_HOSTS',
  'DEPLOY_HOST',
  'DEPLOY_USER',
  'DEPLOY_PATH',
  'GHCR_TOKEN',
  'GITHUB_TOKEN',
]);

/**
 * Fichiers d'infrastructure DÉCOUVERTS, jamais listés en dur : la première version
 * en nommait quatre et ratait les deux `.caddy` créés le même jour (défaut N-7).
 * Une liste écrite à la main vieillit dès le commit suivant.
 */
const fichiersInfra = execFileSync('git', ['ls-files', 'infra/'], { encoding: 'utf8', cwd: RACINE })
  .split('\n')
  .filter((f) => /\.(ya?ml|caddy|conf)$|(?:^|\/)(?:Caddyfile|Dockerfile)$/.test(f));

for (const chemin of fichiersInfra) {
  const contenu = lire(chemin);
  if (!contenu) continue;
  // `${VAR}`, `${VAR:-defaut}` (Compose) et `{$VAR}` (Caddy).
  for (const m of contenu.matchAll(/\$\{([A-Z][A-Z0-9_]*)|\{\$([A-Z][A-Z0-9_]*)\}/g)) {
    const nom = m[1] ?? m[2] ?? '';
    if (documentees.has(nom) || PORTEES_PAR_GITHUB.has(nom)) continue;
    const ligne = contenu.slice(0, m.index).split('\n').length;
    anomalies.push({
      jonction: 'infra → .env.example',
      ou: `${chemin}:${ligne}`,
      quoi: `\`${nom}\` est interpolée mais absente du .env.example`,
      effet:
        '02 §30.4-1 impose que CHAQUE variable y soit documentée. Le provisionnement ' +
        'copie ce fichier : la variable manquerait sur le serveur.',
    });
  }
}

// --- Jonction 3 : les scripts d'infra invoqués par la CI existent -----------

/**
 * Drapeaux qu'un script déclare OBLIGATOIRES. On les lit dans le script lui-même,
 * sur ses messages d'arrêt (`axion_die "--env … est obligatoire"`) : le script est
 * le contrat, on ne recopie pas sa signature ailleurs.
 */
function drapeauxObligatoires(cheminScript) {
  const source = lire(cheminScript);
  const requis = new Set();
  for (const m of source.matchAll(/(--[a-z][\w-]*)[^\n]{0,80}est obligatoire/gi)) {
    requis.add(m[1] ?? '');
  }
  return requis;
}

for (const { chemin, contenu } of fichiersCI) {
  /** Toutes les occurrences d'un script dans ce fichier, groupées. */
  const occurrences = new Map();

  for (const m of contenu.matchAll(/(\.\/)?(infra\/scripts\/[\w-]+\.sh)([^\n|&;"]*)/g)) {
    const cible = m[2] ?? '';
    const ligne = contenu.slice(0, m.index).split('\n').length;

    if (!existsSync(resolve(RACINE, cible))) {
      anomalies.push({
        jonction: 'CI → infra/scripts',
        ou: `${chemin}:${ligne}`,
        quoi: `\`${cible}\` est invoqué mais n'existe pas`,
        effet: 'Le déploiement échoue sur « No such file or directory ».',
      });
      continue;
    }
    if (!m[1]) continue; // sans `./`, c'est une mention, pas un appel

    // Une ligne de COMMENTAIRE ne compte pas comme invocation. C'est essentiel
    // pour la règle « au moins une » ci-dessous : un commentaire d'exemple qui
    // cite les bons drapeaux masquerait sinon une invocation réelle qui les a
    // perdus — exactement le défaut B-1, rendu invisible par sa documentation.
    const texteLigne = contenu.split('\n')[ligne - 1] ?? '';
    if (/^\s*#/.test(texteLigne)) continue;

    if (!occurrences.has(cible)) occurrences.set(cible, []);
    occurrences.get(cible)?.push({ ligne, arguments: m[3] ?? '' });
  }

  // Vérifier l'EXISTENCE d'un script ne suffisait pas : le défaut B-1 était un
  // défaut d'ARGUMENTS — la CI appelait `deploy.sh` sans les `--env` et `--tag`
  // qu'il exige et sur lesquels il s'arrête. Le contrôle serait resté vert.
  //
  // On raisonne PAR FICHIER, pas par occurrence : un workflow contient
  // légitimement des occurrences qui ne sont pas des appels nominaux — un
  // `test -x` de garde-fou, un message de rollback, une ligne de journal. Exiger
  // les drapeaux sur CHACUNE produisait 21 faux positifs sur ce dépôt. Exiger
  // qu'AU MOINS UNE occurrence porte chaque drapeau requis attrape exactement
  // B-1 (où AUCUNE ne les portait) sans rien inventer.
  for (const [cible, appels] of occurrences) {
    for (const drapeau of drapeauxObligatoires(cible)) {
      if (appels.some((a) => a.arguments.includes(drapeau))) continue;
      anomalies.push({
        jonction: 'CI → infra/scripts (arguments)',
        ou: `${chemin}:${appels.map((a) => String(a.ligne)).join(', ')}`,
        quoi: `\`${cible}\` n'est JAMAIS appelé avec \`${drapeau}\`, qu'il déclare OBLIGATOIRE`,
        effet: "Le script s'arrête immédiatement : l'étape échoue avant d'avoir agi.",
      });
    }
  }
}

// --- Verdict ----------------------------------------------------------------

if (anomalies.length > 0) {
  console.error(`\n${ROUGE}✗ JONCTIONS ROMPUES — ${String(anomalies.length)} anomalie(s)${RAZ}\n`);
  for (const a of anomalies) {
    console.error(`  [${a.jonction}]  ${a.ou}`);
    console.error(`    ${a.quoi}`);
    console.error(`    → ${a.effet}\n`);
  }
  console.error(
    '  Chacune de ces anomalies est invisible depuis UN fichier et évidente en en\n' +
      '  croisant DEUX. Corrige du côté APPELÉ si son contrat est juste, du côté\n' +
      '  APPELANT sinon — mais dans un seul commit, avec la documentation.\n',
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} jonctions : ${String(disponibles.size)} script(s) pnpm, ` +
    `${String(documentees.size)} variable(s) documentée(s), ` +
    `${String(fichiersCI.length)} fichier(s) de CI — tout se rejoint.`,
);
