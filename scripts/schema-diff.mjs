#!/usr/bin/env node
// =============================================================================
// DIFF SCHÉMA-VS-04 — critère d'acceptation du lot L1, contrôle permanent en CI
//
// Contrat 11 §7 : « diff schéma-vs-04 (V2.9 — base de comparaison DÉFINIE : le diff
// porte sur tables, colonnes, contraintes PK/FK/UNIQUE/CHECK et index du §7.1,
// comparés à un manifeste `schema-manifest.json` EXTRAIT du fichier 04, commité au
// lot L1 et relu ligne à ligne à la porte P-A ; types non précisés par le 04 = TEXT,
// conventions en tête du 04) ». DoD transverse : « diff schéma-vs-04 = zéro écart ».
//
// ÉTAT AU LOT L0 : le manifeste est un LIVRABLE DU LOT L1 — il n'existe pas encore.
// Ce script existe dès L0 pour que la CI soit complète (critère L0), et il REFUSE de
// mentir : tant que le manifeste est absent, il sort en code 0 avec un avertissement
// explicite ; dès que L1 est marqué livré, son absence devient une erreur.
// Le marqueur de livraison est l'existence de `apps/api/drizzle/` (les migrations L1).
// Traçabilité : E17, E36, E43 · critère L1 du fichier 07.
// =============================================================================
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const JAUNE = '[33m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');
const MANIFESTE = resolve(RACINE, 'apps/api/schema-manifest.json');
const DOSSIER_MIGRATIONS = resolve(RACINE, 'apps/api/drizzle');

const l1Livre = existsSync(DOSSIER_MIGRATIONS);

if (!existsSync(MANIFESTE)) {
  if (l1Livre) {
    console.error(
      `${ROUGE}✗ diff schéma-vs-04 : manifeste introuvable alors que L1 est livré.${RAZ}`,
    );
    console.error(`  Attendu : apps/api/schema-manifest.json`);
    console.error(
      '  Le manifeste est EXTRAIT du fichier 04 (docs/04_MODELE_DE_DONNEES.md), commité au\n' +
        '  lot L1 et relu LIGNE À LIGNE à la porte P-A (11 §7). Sans lui, le critère\n' +
        '  « diff schéma-vs-04 = zéro écart » ne peut pas être coché — et un critère\n' +
        '  non vérifiable n’est pas un critère coché.\n',
    );
    process.exit(1);
  }
  console.log(
    `${JAUNE}⚠ diff schéma-vs-04 : NON APPLICABLE — le lot L1 n’est pas livré.${RAZ}\n` +
      '  Le manifeste `apps/api/schema-manifest.json` est un livrable du lot L1 (11 §7).\n' +
      '  Ce contournement disparaît AUTOMATIQUEMENT dès que `apps/api/drizzle/` existe :\n' +
      '  à partir de là, un manifeste manquant est une erreur bloquante.\n' +
      '  Rien n’est ici déclaré conforme : le contrôle est simplement sans objet.\n',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// À partir d'ici : le manifeste existe. Comparaison réelle contre la base vivante.
// L'implémentation complète (introspection information_schema + pg_indexes) est
// écrite au lot L1 par A12 (DBA), qui possède la transcription du fichier 04.
// ---------------------------------------------------------------------------
const manifeste = JSON.parse(readFileSync(MANIFESTE, 'utf8'));

if (!process.env.DATABASE_URL) {
  console.error(`${ROUGE}✗ diff schéma-vs-04 : DATABASE_URL absente.${RAZ}`);
  console.error('  Le diff compare le schéma RÉEL à celui du fichier 04 : il lui faut une base.');
  process.exit(1);
}

console.error(
  `${ROUGE}✗ diff schéma-vs-04 : comparateur non implémenté.${RAZ}\n` +
    `  Manifeste trouvé (${Object.keys(manifeste.tables ?? {}).length} table(s) déclarée(s))\n` +
    '  mais l’introspection est un livrable du lot L1 (agent A12 — DBA).\n' +
    '  Périmètre imposé par le 11 §7 : tables, colonnes, contraintes PK/FK/UNIQUE/CHECK\n' +
    '  et index du §7.1. Types non précisés par le 04 = TEXT.\n' +
    '  Échec DÉLIBÉRÉ : mieux vaut une CI rouge qu’un « zéro écart » non vérifié.\n',
);
process.exit(1);
