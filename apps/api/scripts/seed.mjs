#!/usr/bin/env node
// =============================================================================
// SEED — AIGUILLAGE AUTO-DURCISSANT (lot L0)
//
// Le seed des référentiels est un livrable du **lot L1** (11 §5) : 9 blocs,
// 11 fonctions, profils d'interlocuteur avec `group_code`, paliers,
// `estimation_params` normées, `naf_sector_map`, et le **compte fondateur avec
// `habilitated_at` posé** — anti auto-verrouillage §34.4.
// `pnpm seed:demo` produit la mission fictive DÉTERMINISTE des E2E et de la
// recette P-E, et n'est **jamais exécutable en prod** (garde-fou d'environnement).
//
// Ce fichier existe dès le L0 parce que le `package.json` racine déclare
// `seed` et `seed:demo` : une délégation vers un script inexistant est le défaut
// B-4, relevé par la revue croisée. Il ne fait pas semblant pour autant — il
// devient une erreur bloquante dès que le lot L1 est livré.
// Traçabilité : E17, E36, E43.
// =============================================================================
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '\u001b[31m';
const JAUNE = '\u001b[33m';
const RAZ = '\u001b[0m';

const RACINE = resolve(import.meta.dirname, '..');
const mode = process.argv.includes('--demo') ? 'demo' : 'referentiels';
const l1Livre = existsSync(resolve(RACINE, 'drizzle'));

if (!l1Livre) {
  console.log(
    `${JAUNE}\u26a0 seed (${mode}) : SANS OBJET \u2014 le lot L1 n'est pas livr\u00e9.${RAZ}\n` +
      "  Aucun sch\u00e9ma en base : il n'y a rien \u00e0 peupler. Ce comportement dispara\u00eet\n" +
      '  automatiquement d\u00e8s que apps/api/drizzle/ existe.',
  );
  process.exit(0);
}

console.error(
  `${ROUGE}\u2717 seed (${mode}) : non impl\u00e9ment\u00e9 alors que apps/api/drizzle/ existe.${RAZ}\n\n` +
    (mode === 'demo'
      ? '  Attendu (11 \u00a75) : mission fictive D\u00c9TERMINISTE \u2014 2 unit\u00e9s, 12 questions\n' +
        '  couvrant TOUS les answer_types, 2 sessions, 1 pi\u00e8ce jointe. Utilis\u00e9e par les\n' +
        '  E2E et la recette P-E. GARDE-FOU OBLIGATOIRE : refus si APP_ENV=prod.\n'
      : "  Attendu (11 \u00a75) : 9 blocs, 11 fonctions, profils d'interlocuteur avec\n" +
        '  group_code, paliers, estimation_params normées, naf_sector_map, et le compte\n' +
        "  fondateur AVEC habilitated_at pos\u00e9 \u2014 la r\u00e8gle d'habilitation \u00a734.4 ne doit\n" +
        "  JAMAIS bloquer le premier utilisateur de l'outil.\n" +
        '  Crit\u00e8re du lot L1 : le seed doit \u00eatre REJOUABLE 2\u00d7 \u00e0 l\u2019identique.\n') +
    '\n  \u00c9chec D\u00c9LIB\u00c9R\u00c9 : un seed qui ne peuple rien en silence est pire que pas de seed.\n',
);
process.exit(1);
