#!/usr/bin/env node
// =============================================================================
// GÉNÉRATION DE MIGRATION — squelette de SQL BRUT (lot L1, A12 — DBA)
//
//   node scripts/db-generate.mjs <sujet>      (ou : pnpm db:generate <sujet>)
//
// RAPPEL CAPITAL (11 §2) : « le fichier 04 se transcrit LITTÉRALEMENT en migrations
// SQL ; Drizzle ne sert QU'AUX REQUÊTES TYPÉES ». Le DDL vit EXCLUSIVEMENT dans
// docs/04_MODELE_DE_DONNEES.md.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ L'ABSENCE DE `drizzle-kit` DANS CE DÉPÔT EST DÉLIBÉRÉE. CE N'EST PAS UN    │
// │ OUBLI. NE L'INSTALLE PAS.                                                 │
// └───────────────────────────────────────────────────────────────────────────┘
// Arbitrage A01, lot L1. Deux raisons, la seconde étant la vraie :
//
//   1. `drizzle-kit` n'est PAS dans la liste des dépendances épinglées du 11 §1.
//      L'y ajouter est une décision humaine (11 §8.1), pas un geste d'autopilote.
//
//   2. SURTOUT — `drizzle-kit generate` DÉRIVE le SQL depuis `src/db/schema.ts`.
//      Il fait donc couler le schéma du TypeScript vers la base. Or dans ce
//      dépôt le sens est l'INVERSE et il est contractuel : le fichier 04 est la
//      source, les migrations SQL en sont la transcription, et `schema.ts` n'en
//      est qu'un REFLET pour typer les requêtes. Le brancher ici ferait du
//      fichier TypeScript une SECONDE SOURCE DE VÉRITÉ face au fichier 04 —
//      littéralement l'interdit du 11 §2 (« pas d'ORM qui génère le schéma »).
//      Le diff schéma-vs-04 le révélerait au premier passage en CI, mais après
//      coup : le mal serait déjà dans une migration commitée.
//
// Si tu es arrivé ici parce que `pnpm db:generate` ne fait « pas ce qu'il devrait
// faire » : c'est qu'il fait exactement ce qu'il doit faire. Il pose le SQUELETTE
// numéroté d'une migration, sentinelles @UP / @DOWN comprises, que le DBA
// remplit À LA MAIN depuis `docs/04_MODELE_DE_DONNEES.md`. Le DDL ne se génère
// pas dans ce projet : il se transcrit.
// Traçabilité : E17, E36, E43.
// =============================================================================
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const GRIS = '[90m';
const RAZ = '[0m';

const RACINE_API = resolve(import.meta.dirname, '..');
const DOSSIER = resolve(RACINE_API, 'drizzle');

const sujetBrut = process.argv.slice(2).join('_');
// Les accents sont retirés par point de code (bloc Unicode « Combining Diacritical
// Marks », U+0300–U+036F) plutôt que par un littéral d'expression régulière : un nom
// de fichier de migration doit rester lisible dans n'importe quel éditeur.
const sujet = [...sujetBrut.normalize('NFD')]
  .filter((c) => {
    const point = c.codePointAt(0) ?? 0;
    return point < 0x300 || point > 0x36f;
  })
  .join('')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

if (!existsSync(DOSSIER)) {
  console.error(
    `${ROUGE}✗ db:generate : apps/api/drizzle/ est introuvable.${RAZ}\n` +
      '  Le schéma naît au lot L1, par TRANSCRIPTION du fichier 04 (11 §2).\n',
  );
  process.exit(1);
}

if (sujet === '') {
  console.error(
    `${ROUGE}✗ db:generate : sujet manquant.${RAZ}\n` +
      '  Usage : pnpm db:generate <sujet>     ex. pnpm db:generate ajout_index_findings\n' +
      '  Le sujet devient le nom du fichier : il doit dire CE QUE FAIT la migration.\n',
  );
  process.exit(1);
}

const existants = readdirSync(DOSSIER).filter((f) => /^\d{4}_.*\.sql$/.test(f));
const dernier = existants.map((f) => Number(f.slice(0, 4))).reduce((a, b) => Math.max(a, b), 0);
const version = String(dernier + 1).padStart(4, '0');
const fichier = resolve(DOSSIER, `${version}_${sujet}.sql`);

if (existsSync(fichier)) {
  console.error(`${ROUGE}✗ db:generate : ${version}_${sujet}.sql existe déjà.${RAZ}`);
  process.exit(1);
}

writeFileSync(
  fichier,
  `-- =============================================================================
-- ${version} — ${sujet.replace(/_/g, ' ').toUpperCase()}
--
-- SOURCE UNIQUE DU DDL : docs/04_MODELE_DE_DONNEES.md. Cette migration en est une
-- TRANSCRIPTION (11 §2). Conventions T1-T11 : voir 0001_referentiels.sql.
--
-- Avant de commiter :
--   · \`pnpm db:migrate:check\` (dry-run, vérifie la réversibilité)
--   · \`pnpm db:migrate\` puis \`node scripts/migrations.mjs --down\` puis à nouveau
--     \`pnpm db:migrate\` — la descente se PROUVE, elle ne se suppose pas
--   · mettre à jour apps/api/schema-manifest.json ET apps/api/src/db/schema.ts
--   · \`pnpm schema:diff\` doit rester à ZÉRO écart
-- =============================================================================

-- @UP

-- TODO(A12) : montée.

-- @DOWN

-- TODO(A12) : descente. Une migration sans descente n'est pas livrable
-- (critère L1 du fichier 07 : « migrations up/down propres »).
`,
  'utf8',
);

console.log(
  `${VERT}✓${RAZ} squelette créé : apps/api/drizzle/${version}_${sujet}.sql\n` +
    `\n` +
    `  ${JAUNE}Ce script ne lance PAS \`drizzle-kit generate\`, et c'est voulu.${RAZ}\n` +
    `  ${GRIS}\`drizzle-kit\` dérive le SQL depuis src/db/schema.ts : il ferait couler le\n` +
    `  schéma du TypeScript vers la base. Ici le sens est l'INVERSE et il est\n` +
    `  contractuel — docs/04_MODELE_DE_DONNEES.md est la source, les migrations en\n` +
    `  sont la transcription, schema.ts n'en est qu'un reflet pour typer les\n` +
    `  requêtes. Le brancher ferait du fichier TS une SECONDE SOURCE DE VÉRITÉ,\n` +
    `  ce qu'interdit le 11 §2. Son absence du dépôt n'est pas un oubli.${RAZ}\n` +
    `\n` +
    `  ${GRIS}Suite : remplis @UP et @DOWN depuis le fichier 04, mets à jour\n` +
    `  apps/api/schema-manifest.json ET src/db/schema.ts, puis prouve la descente\n` +
    `  (\`--down\` suivi d'un \`db:migrate\`) et vérifie \`pnpm schema:diff\`.${RAZ}`,
);
