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

/** Scripts déclarés à la racine et dans chaque espace de travail. */
function scriptsDisponibles() {
  const noms = new Set(Object.keys(JSON.parse(lire('package.json')).scripts ?? {}));
  for (const espace of ['apps', 'packages']) {
    const base = resolve(RACINE, espace);
    if (!existsSync(base)) continue;
    for (const entree of readdirSync(base, { withFileTypes: true })) {
      if (!entree.isDirectory()) continue;
      const pj = lire(`${espace}/${entree.name}/package.json`);
      if (pj) for (const nom of Object.keys(JSON.parse(pj).scripts ?? {})) noms.add(nom);
    }
  }
  return noms;
}

const disponibles = scriptsDisponibles();
const fichiersCI = sourcesCI();

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
  // `;`, `$(`…) : sinon `echo "pnpm activé"` serait lu comme un appel au script
  // « activ ». Et la valeur d'un drapeau ne se lit qu'en `--flag=valeur` : accepter
  // `--flag valeur` faisait avaler le `|` d'un tuyau, et `pnpm --version | cut`
  // devenait un appel au script « cut ». Deux faux positifs mesurés sur ce dépôt —
  // et un contrôle qui crie à tort est un contrôle qu'on finit par désactiver.
  // Le `:` couvre la forme YAML `run: pnpm …`, la plus fréquente dans un workflow.
  const APPEL_PNPM = /(?:^|[\n;&|(`:]|\$\()\s*pnpm\s+(?:--[\w-]+(?:=[^\s]+)?\s+)*([a-z][\w:-]*)/g;
  for (const m of contenu.matchAll(APPEL_PNPM)) {
    const nom = m[1] ?? '';
    if (SOUS_COMMANDES.has(nom) || disponibles.has(nom)) continue;
    // Un mot suivi immédiatement d'une lettre accentuée est du texte français,
    // pas un nom de script (les noms de scripts sont en ASCII).
    const apres = contenu[(m.index ?? 0) + m[0].length] ?? '';
    if (/[^\s\-'"`);|&]/.test(apres)) continue;
    const ligne = contenu.slice(0, m.index).split('\n').length;
    anomalies.push({
      jonction: 'CI → package.json',
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

const fichiersInfra = [
  'docker-compose.yml',
  'docker-compose.staging.yml',
  'docker-compose.prod.yml',
]
  .map((n) => `infra/${n}`)
  .concat(['infra/caddy/Caddyfile']);

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

for (const { chemin, contenu } of fichiersCI) {
  for (const m of contenu.matchAll(/(?:\.\/)?(infra\/scripts\/[\w-]+\.sh)/g)) {
    const cible = m[1] ?? '';
    if (existsSync(resolve(RACINE, cible))) continue;
    const ligne = contenu.slice(0, m.index).split('\n').length;
    anomalies.push({
      jonction: 'CI → infra/scripts',
      ou: `${chemin}:${ligne}`,
      quoi: `\`${cible}\` est invoqué mais n'existe pas`,
      effet: 'Le déploiement échoue sur « No such file or directory ».',
    });
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
