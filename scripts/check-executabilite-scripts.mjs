#!/usr/bin/env node
// =============================================================================
// GARDE — un script fait pour être exécuté doit être exécutable DANS GIT.
// =============================================================================
// POURQUOI CE GARDE EXISTE, et il ne faut pas l'oublier : le 2026-08-30, le test
// de restauration nocturne a échoué sur
//
//     ./infra/scripts/restore-test.sh introuvable ou non executable
//
// alors que le fichier était bien là. MESURE : les SEIZE scripts du dépôt
// étaient enregistrés en mode 100644. Ce dépôt se développe sous Windows, où le
// bit d'exécution n'existe pas ; il n'avait donc jamais été posé, et aucun clone
// Linux ne pouvait exécuter un seul de ces scripts.
//
// CE QUI REND CE DÉFAUT INSTRUCTIF, plus que le défaut lui-même : il touchait
// AUSSI `infra/postgres/sauvegarde.sh` et `backup-postgres.sh` — les scripts qui
// portent les sauvegardes de l'invariant 8. Il est resté invisible trois jours
// parce que le seul mécanisme qui les invoque en `./script.sh` — le test de
// restauration — ne s'exécutait pas. UN DÉFAUT QUE SEUL UN GARDE EN PANNE
// CACHAIT. Réparer le garde a révélé ce qu'il aurait dû signaler dès L0.
//
// ET POURQUOI UN CONTRÔLE PLUTÔT QU'UN `chmod` : un `chmod` sur le serveur
// répare UNE machine, et le clone suivant réintroduit le défaut. Le mode doit
// vivre dans l'index git, et quelque chose doit refuser qu'il en reparte.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// LA SEULE EXCEPTION, et elle est motivée : `lib/common.sh` est une bibliothèque
// SOURCÉE (`. lib/common.sh`), jamais lancée comme une commande. Son shebang
// sert à l'éditeur et à shellcheck, pas au noyau. La rendre exécutable
// inviterait à la lancer, ce qui ne ferait rien d'utile.
//
// Cette liste doit rester COURTE et MOTIVÉE. Y ajouter un fichier pour faire
// taire ce garde serait exactement le geste qu'il existe pour empêcher.
const SOURCEES = new Set(['infra/scripts/lib/common.sh']);

const MODE_EXECUTABLE = '100755';

function lignesDeLIndex() {
  const sortie = execFileSync('git', ['ls-files', '-s', '*.sh'], { encoding: 'utf8' });
  return sortie
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((ligne) => {
      // Format : <mode> <objet> <étage>\t<chemin>
      const [meta, chemin] = ligne.split('\t');
      return { mode: meta.split(' ')[0], chemin };
    });
}

function aUnShebang(chemin) {
  try {
    const debut = readFileSync(chemin, 'utf8').slice(0, 200);
    return debut.startsWith('#!');
  } catch {
    // Fichier absent du disque (suppression en cours d'index) : rien à dire.
    return false;
  }
}

const fautifs = [];
const exceptionsInutiles = [];

for (const { mode, chemin } of lignesDeLIndex()) {
  const shebang = aUnShebang(chemin);
  if (SOURCEES.has(chemin)) {
    // Une exception qui ne sert plus doit disparaître, sinon la liste enfle et
    // finit par couvrir de vrais défauts.
    if (!shebang) exceptionsInutiles.push(chemin);
    continue;
  }
  if (shebang && mode !== MODE_EXECUTABLE) {
    fautifs.push({ chemin, mode });
  }
}

if (fautifs.length > 0) {
  console.error(
    `\n✗ ${fautifs.length} script(s) portent un shebang mais ne sont PAS exécutables dans git :\n`,
  );
  for (const { chemin, mode } of fautifs) {
    console.error(`   ${mode}  ${chemin}`);
  }
  console.error(
    [
      '',
      'Un clone Linux ne pourra pas les lancer en « ./script.sh » — le runbook et les clés',
      "restreintes les invoquent pourtant ainsi. Le mode doit vivre dans l'index, pas sur une",
      'machine : un chmod côté serveur répare un clone et laisse le suivant cassé.',
      '',
      'Correction :',
      ...fautifs.map(({ chemin }) => `   git update-index --chmod=+x ${chemin}`),
      '',
      'Si le fichier est une bibliothèque SOURCÉE et non une commande, ajoutez-le à SOURCEES',
      'dans ce fichier — avec le motif écrit à côté.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

if (exceptionsInutiles.length > 0) {
  console.error(
    `\n✗ Exception(s) devenue(s) inutile(s) dans SOURCEES (le fichier n'a plus de shebang) :\n`,
  );
  for (const chemin of exceptionsInutiles) console.error(`   ${chemin}`);
  console.error(
    "\nRetirez-la : une liste d'exceptions qui enfle finit par couvrir de vrais défauts.\n",
  );
  process.exit(1);
}

console.log(
  '[32m✓[0m Exécutabilité : tout script à shebang est en 100755 dans git ' +
    `(${SOURCEES.size} bibliothèque sourcée exceptée, motivée dans le fichier).`,
);
