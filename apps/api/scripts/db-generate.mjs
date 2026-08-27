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
// POURQUOI CE SCRIPT NE LANCE PAS `drizzle-kit generate` (déviation assumée du
// libellé du garde-fou L0, à valider par A01) :
//   1. `drizzle-kit` n'est PAS dans la liste des dépendances épinglées du 11 §1 —
//      l'y ajouter est une décision humaine (11 §8.1), pas un geste d'autopilote ;
//   2. `drizzle-kit generate` DÉRIVE le SQL de `src/db/schema.ts`. Or ici le
//      schéma TypeScript REFLÈTE les migrations, il ne les précède pas : inverser
//      le sens ferait du fichier TS une seconde source de vérité face au 04 —
//      exactement ce que le 11 §2 interdit, et ce que le diff schéma-vs-04
//      révélerait au premier passage en CI.
// Ce script fait donc le seul geste utile et sûr : il pose le SQUELETTE numéroté
// et horodaté d'une nouvelle migration, avec ses sentinelles @UP / @DOWN, que le
// DBA remplit à la main depuis le fichier 04.
// Traçabilité : E17, E36, E43.
// =============================================================================
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
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
    `  ${GRIS}Remplis @UP et @DOWN depuis le fichier 04, puis mets à jour le manifeste\n` +
    `  et src/db/schema.ts. Le DDL ne se génère pas : il se transcrit.${RAZ}`,
);
