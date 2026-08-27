#!/usr/bin/env node
// =============================================================================
// INTÉGRITÉ DU PACK — le pack ne dérive pas en silence.
//
// Le 00_INDEX pose que le pack (`docs/`, 12 fichiers) est « LA source d'exécution
// unique ». Le 09 §5.2 ajoute : « Tout écart à la spec est soit refusé, soit
// documenté comme amendement horodaté — JAMAIS silencieux. » Et le pack ne prévoit
// qu'UNE révision légitime : la revue de spec de la porte P-D (09 §4), où « le pack
// est confronté au code réel ».
//
// Ce contrôle rend cette règle mécanique. Il a été écrit après un incident réel au
// lot L0 : un `pnpm format` a réécrit les 12 fichiers du pack (724 insertions,
// 468 suppressions) sans que personne ne le demande. Le contenu avait survécu ; le
// principe non — un pack reformaté n'est plus comparable à l'original, et c'est
// précisément cette comparaison qui fait la valeur de la porte P-D.
//
// Voir AMELIORATIONS.md (étage 1, lot L0) et DECISIONS.md 2026-08-27
// « Prettier ne touche pas au pack ».
// Traçabilité : E36, E43, E47 (conventions et traçabilité).
// =============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');
const MANIFESTE = resolve(RACINE, 'docs/.pack-integrity.json');

/**
 * Les 12 fichiers du pack. `docs/ETAT.md`, `DECISIONS.md`, `AMELIORATIONS.md`,
 * `docs/conception/`, `docs/portes/` et `docs/journal/` sont VIVANTS et donc
 * volontairement hors périmètre : ce sont nos fichiers, pas la spécification.
 */
const FICHIERS_DU_PACK = [
  '00_INDEX.md',
  '01_PRODUIT_ET_METHODOLOGIE.md',
  '02_ARCHITECTURE_ET_INFRA.md',
  '03_MODULES_FONCTIONNELS.md',
  '04_MODELE_DE_DONNEES.md',
  '05_API_ET_SYNC.md',
  '06_SECURITE_RGPD.md',
  '07_PLAN_TESTS_RISQUES.md',
  '08_TRACABILITE.md',
  '09_PLAN_EXECUTION_AUTOPILOTE.md',
  '10_CHANGELOG_V2.2.md',
  '11_CONTRAT_TECHNIQUE.md',
].map((n) => `docs/${n}`);

function empreinte(chemin) {
  return createHash('sha256')
    .update(readFileSync(resolve(RACINE, chemin)))
    .digest('hex');
}

const empreintes = Object.fromEntries(FICHIERS_DU_PACK.map((f) => [f, empreinte(f)]));

// `--sceller` régénère le manifeste. À n'utiliser QUE lors d'un amendement de spec
// décidé (porte P-D), en même temps que l'entrée DECISIONS.md qui le justifie.
if (process.argv.includes('--sceller')) {
  writeFileSync(
    MANIFESTE,
    `${JSON.stringify(
      {
        _lisez_moi:
          'Empreintes SHA-256 des 12 fichiers du pack. Régénéré par `node scripts/check-pack-integrity.mjs --sceller` UNIQUEMENT lors d’un amendement de spec décidé (revue de spec de la porte P-D, 09 §4), accompagné de son entrée DECISIONS.md.',
        empreintes,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${VERT}✓${RAZ} manifeste d’intégrité scellé (${FICHIERS_DU_PACK.length} fichiers).`);
  process.exit(0);
}

if (!existsSync(MANIFESTE)) {
  console.error(
    `${ROUGE}✗ intégrité du pack : manifeste absent.${RAZ}\n` +
      '  Attendu : docs/.pack-integrity.json\n' +
      '  Le sceller : node scripts/check-pack-integrity.mjs --sceller\n',
  );
  process.exit(1);
}

const attendu = JSON.parse(readFileSync(MANIFESTE, 'utf8')).empreintes;
const derives = FICHIERS_DU_PACK.filter((f) => attendu[f] !== empreintes[f]);
const inconnus = Object.keys(attendu).filter((f) => !FICHIERS_DU_PACK.includes(f));

if (derives.length > 0 || inconnus.length > 0) {
  console.error(`${ROUGE}✗ INTÉGRITÉ DU PACK : la spécification a changé.${RAZ}\n`);
  for (const f of derives) console.error(`  modifié : ${f}`);
  for (const f of inconnus) console.error(`  disparu du périmètre : ${f}`);
  console.error(
    '\n  Le pack est « LA source d’exécution unique » (00_INDEX) et ne connaît qu’UNE\n' +
      '  révision légitime : la revue de spec de la porte P-D (09 §4).\n\n' +
      '  Si ce changement n’était pas voulu — un formateur, un correcteur automatique,\n' +
      '  une fin de ligne — ANNULE-LE : `git checkout -- docs/`.\n' +
      '  S’il est voulu, il lui faut une entrée DECISIONS.md (amendement horodaté,\n' +
      '  09 §5.2) PUIS un nouveau sceau. Jamais le sceau seul : rescelller sans tracer,\n' +
      '  c’est exactement le changement silencieux que ce contrôle existe pour empêcher.\n',
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} intégrité du pack : les ${String(FICHIERS_DU_PACK.length)} fichiers sont conformes au sceau.`,
);
