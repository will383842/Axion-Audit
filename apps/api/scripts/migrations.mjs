#!/usr/bin/env node
// =============================================================================
// MIGRATIONS — AIGUILLAGE AUTO-DURCISSANT (lot L0)
//
// `infra/scripts/deploy.sh` appelle `pnpm db:migrate:check` (dry-run) puis
// `pnpm db:migrate` à CHAQUE déploiement, conformément au garde-fou du 02 §30.6
// (« migration avec garde-fou : dry-run puis apply »). Ces deux commandes doivent
// donc exister DÈS MAINTENANT, alors que les migrations elles-mêmes sont un
// livrable du lot L1 (A12 — DBA, transcription littérale du fichier 04).
//
// Le piège évité ici : câbler `pnpm db:migrate` vers un script inexistant. Le
// déploiement mourrait sur `ERR_PNPM_NO_SCRIPT`, à l'étape « migration », avant
// même les smoke tests — et la revue croisée du lot L0 l'a effectivement relevé.
//
// Le piège évité DANS L'AUTRE SENS : sortir en 0 sans rien faire, pour toujours.
// Le jour où `drizzle/` existerait, un déploiement appliquerait « avec succès »
// zéro migration sur une base vide. Ce script REFUSE ce scénario : dès que le
// dossier apparaît, l'absence d'implémentation devient une erreur bloquante.
// Même mécanique que `scripts/schema-diff.mjs` et `scripts/check-test-projects.mjs`.
// Traçabilité : E17, E36, E43.
// =============================================================================
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const JAUNE = '[33m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');
const DOSSIER_MIGRATIONS = resolve(RACINE, 'drizzle');

const mode = process.argv[2] === '--check' ? 'check' : 'apply';
const l1Livre = existsSync(DOSSIER_MIGRATIONS);

if (!l1Livre) {
  console.log(
    `${JAUNE}⚠ migrations (${mode}) : SANS OBJET — le lot L1 n'est pas livré.${RAZ}\n` +
      "  Aucun dossier apps/api/drizzle/ : il n'existe encore aucune migration à\n" +
      "  appliquer, et une base sans schéma est l'état ATTENDU à ce stade.\n" +
      '  Ce comportement disparaît automatiquement dès que le dossier existe.',
  );
  process.exit(0);
}

console.error(
  `${ROUGE}✗ migrations (${mode}) : non implémentées alors que apps/api/drizzle/ existe.${RAZ}\n\n` +
    '  Le lot L1 est livré : ce script doit désormais exécuter les migrations réelles.\n' +
    '  Contrat (11 §2) : « le fichier 04 se transcrit LITTÉRALEMENT en migrations SQL ;\n' +
    "  Drizzle ne sert QU'aux requêtes typées ». Les migrations sont du SQL BRUT\n" +
    '  versionné, relu ligne à ligne — jamais un schéma généré par un ORM.\n\n' +
    `  Attendu pour « ${mode} » :\n` +
    (mode === 'check'
      ? '    dry-run — lister les migrations en attente, vérifier leur réversibilité,\n' +
        '    et NE RIEN APPLIQUER. Sortie non nulle si une migration est irréversible\n' +
        '    ou non rétrocompatible N-1 (02 §11.2 : déploiement sans coupure).\n'
      : '    appliquer les migrations en attente, dans l’ordre, en transaction.\n') +
    '\n  Échec DÉLIBÉRÉ : un déploiement qui « migre » sans rien faire est pire\n' +
    "  qu'un déploiement qui s'arrête.\n",
);
process.exit(1);
