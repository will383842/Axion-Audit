#!/usr/bin/env node
// =============================================================================
// INSTALLATION DES HOOKS GIT — seulement là où des hooks git ont un sens
//
// POURQUOI CE SCRIPT EXISTE, ET IL EST NÉ D'UN ÉCHEC DE DÉPLOIEMENT RÉEL.
//
// `package.json` déclarait `"prepare": "husky"`. pnpm exécute `prepare` après
// chaque installation — y compris **à l'intérieur d'une image Docker**, où il n'y
// a ni dépôt git, ni développeur, ni commit à intercepter.
//
// Tant que les dépendances de développement étaient installées, l'anomalie
// restait invisible : husky s'exécutait pour rien, sans échouer. Elle est
// devenue bloquante au premier déploiement sur Coolify, qui injecte
// **`NODE_ENV=production`** dans l'environnement de construction. pnpm saute
// alors les `devDependencies`, `husky` n'est plus installé, et `prepare` meurt :
//
//     #32 2.792 . prepare: sh: husky: not found
//     #32 ERROR: process "/bin/sh -c pnpm install --frozen-lockfile"
//                did not complete successfully: exit code: 1
//
// Ce qui explique pourquoi la CI, elle, construisait ces mêmes images SANS
// erreur : elle ne pose pas `NODE_ENV=production` à la construction. Le défaut
// dormait dans le dépôt depuis le lot L0 et n'attendait qu'un environnement
// légèrement différent — c'est la définition d'une bombe à retardement.
//
// CE QUE FAIT CE SCRIPT. Il n'installe les hooks que si les deux conditions qui
// leur donnent un sens sont réunies : **un dépôt git existe** et **husky est
// installé**. Sinon il sort en 0 EN DISANT POURQUOI. Il ne masque rien : si
// husky est présent et échoue vraiment, l'échec remonte.
//
// CE QU'IL NE FAIT PAS. Il n'utilise pas `|| true`, qui aurait « réglé » le
// symptôme en rendant toute panne de husky invisible sur les postes de
// développement — là où les hooks sont précisément la dernière barrière avant un
// commit non vérifié.
//
// Traçabilité : E43 (exécutabilité) · lot L0-b, 3ᵉ déploiement du 2026-08-28.
// =============================================================================
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const RACINE = resolve(import.meta.dirname, '..');
const GRIS = '[90m';
const RAZ = '[0m';

// 1. Pas de dépôt git → pas de hooks. C'est le cas d'une image Docker : le
//    `.dockerignore` exclut `.git` (ligne 9), donc le contexte de construction
//    n'en contient jamais.
if (!existsSync(resolve(RACINE, '.git'))) {
  console.log(
    `${GRIS}hooks git : ignorés — aucun dépôt git ici (image Docker, archive, ou clone sans historique).${RAZ}`,
  );
  process.exit(0);
}

// 2. Dépôt git présent mais husky absent → installation sans dépendances de
//    développement. On le dit, on n'échoue pas : l'utilisateur n'a pas demandé
//    d'outillage de développement.
const husky = spawnSync('pnpm', ['exec', 'husky'], {
  cwd: RACINE,
  stdio: 'pipe',
  shell: process.platform === 'win32',
  encoding: 'utf8',
});

if (husky.error || /not found|introuvable|ERR_PNPM_RECURSIVE_EXEC/i.test(husky.stderr ?? '')) {
  console.log(
    `${GRIS}hooks git : ignorés — husky n'est pas installé (installation sans dépendances de développement).${RAZ}`,
  );
  process.exit(0);
}

// 3. Husky est là et a parlé : on relaie son verdict TEL QUEL. Un échec réel de
//    husky sur un poste de développement doit rester un échec — c'est là que les
//    hooks servent.
if (husky.stdout) process.stdout.write(husky.stdout);
if (husky.stderr) process.stderr.write(husky.stderr);
process.exit(husky.status ?? 0);
