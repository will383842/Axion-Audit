#!/usr/bin/env node
// =============================================================================
// LANCEUR DE DÉVELOPPEMENT DES SERVICES NODE (api, worker)
//
// POURQUOI IL EXISTE. Le script `dev` utilisait
// `node --watch --experimental-strip-types src/server.ts`. Le décapage de types de
// Node **ne remappe pas** `./app.js` vers `./app.ts` : le processus mourait sur
// `ERR_MODULE_NOT_FOUND`, l'API restait `unhealthy`, et Caddy — qui dépend de sa
// santé — ne démarrait jamais. Le critère L0 « `docker compose up` = stack
// complète » était donc faux, et seule l'exécution réelle pouvait le montrer.
//
// LE CHOIX. Les imports en `.js` ne sont PAS une erreur : ils sont exacts pour la
// sortie compilée, qui est ce qui tourne en production. C'est au lanceur de
// développement de s'adapter au code de production, jamais l'inverse — sans quoi
// on développerait contre une résolution de modules que la production n'utilise pas.
//
// On compile donc en continu et on exécute la sortie : `dev` et `prod` exécutent
// exactement les mêmes fichiers. Deux processus, aucune dépendance nouvelle
// (contrat 11 §8.1), et un fonctionnement identique sur Windows, macOS et Linux.
//
// Traçabilité : E17 (stack imposée), E43 (exécutabilité).
// =============================================================================
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , entree] = process.argv;
if (!entree) {
  console.error('usage : node ../../scripts/dev-node.mjs <dist/server.js>');
  process.exit(1);
}

const RACINE_APP = process.cwd();
const enfants = [];

function lancer(nom, commande, args) {
  const enfant = spawn(commande, args, {
    cwd: RACINE_APP,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  enfant.on('exit', (code, signal) => {
    // Si l'un des deux meurt, l'autre n'a plus de raison de vivre : un compilateur
    // sans serveur ne sert à rien, et un serveur qui ne se recompile plus ment sur
    // ce qu'il exécute.
    if (signal === null && code !== 0) {
      console.error(`[dev] « ${nom} » s'est arrêté (code ${String(code)}) — arrêt du lanceur.`);
      arreter(code ?? 1);
    }
  });
  enfants.push(enfant);
  return enfant;
}

function arreter(code) {
  for (const e of enfants) {
    if (!e.killed) e.kill('SIGTERM');
  }
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    arreter(0);
  });
}

// 1. Compilation en continu. `--preserveWatchOutput` évite que tsc efface l'écran
//    à chaque cycle et emporte les journaux du serveur avec lui.
lancer('tsc', 'pnpm', [
  'exec',
  'tsc',
  '--project',
  'tsconfig.build.json',
  '--watch',
  '--preserveWatchOutput',
]);

// 2. Exécution de la sortie compilée, redémarrée à chaque écriture de `dist/`.
//    On attend la PREMIÈRE compilation : démarrer `node --watch` sur un `dist/`
//    inexistant produirait une erreur au premier cycle, puis un redémarrage — du
//    bruit qui ressemble à une panne.
const cible = resolve(RACINE_APP, entree);
const attendre = setInterval(() => {
  if (!existsSync(cible)) return;
  clearInterval(attendre);
  lancer('node', process.execPath, ['--watch', '--watch-preserve-output', entree]);
}, 300);
