#!/usr/bin/env node
// =============================================================================
// GÉNÉRATION DE MIGRATION — garde-fou (lot L0)
//
// RAPPEL CAPITAL (11 §2) : « le fichier 04 se transcrit LITTÉRALEMENT en migrations
// SQL ; Drizzle ne sert QU'AUX REQUÊTES TYPÉES ». Le DDL vit EXCLUSIVEMENT dans
// docs/04_MODELE_DE_DONNEES.md. `drizzle-kit generate` produit des fichiers .sql
// qui sont ensuite RELUS ligne à ligne — il ne définit jamais le schéma.
//
// Ce fichier existe dès le L0 parce que le `package.json` racine déclare
// `db:generate` : une délégation vers un script inexistant est le défaut B-4.
// Traçabilité : E17, E36, E43.
// =============================================================================
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '\u001b[31m';
const JAUNE = '\u001b[33m';
const RAZ = '\u001b[0m';

const RACINE = resolve(import.meta.dirname, '..');

if (!existsSync(resolve(RACINE, 'drizzle'))) {
  console.log(
    `${JAUNE}\u26a0 db:generate : SANS OBJET \u2014 le lot L1 n'est pas livr\u00e9.${RAZ}\n` +
      '  Le sch\u00e9ma na\u00eet au lot L1, par TRANSCRIPTION du fichier 04 (11 \u00a72).\n' +
      '  Ce comportement dispara\u00eet d\u00e8s que apps/api/drizzle/ existe.',
  );
  process.exit(0);
}

console.error(
  `${ROUGE}\u2717 db:generate : non impl\u00e9ment\u00e9 alors que apps/api/drizzle/ existe.${RAZ}\n\n` +
    '  Attendu : drizzle-kit generate, dont la sortie .sql est RELUE avant commit.\n' +
    '  Interdit : laisser un ORM d\u00e9finir le sch\u00e9ma \u2014 ce serait une seconde source de\n' +
    '  v\u00e9rit\u00e9 face au fichier 04, et le diff sch\u00e9ma-vs-04 la r\u00e9v\u00e8lerait aussit\u00f4t.\n',
);
process.exit(1);
