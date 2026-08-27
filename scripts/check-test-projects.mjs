#!/usr/bin/env node
// =============================================================================
// GARDE-FOU : AUCUN TEST NE DORT — et `--passWithNoTests` a une date de péremption.
//
// Deux trous que le garde-fou anti-skip (09 §5.7) ne peut pas voir, parce qu'ils ne
// passent pas par un `.skip()` :
//
//   1. UN FICHIER DE TEST QUE PERSONNE N'EXÉCUTE. `vitest.config.ts` capte
//      `{apps,packages}/*/src/**/*.test.ts` et `*/tests/**/*.integration.test.ts`.
//      Un fichier `apps/api/tests/sante.test.ts` n'est capté par AUCUN projet :
//      `check-no-skipped-tests.mjs` le valide (il ne contient aucun `.skip`) et
//      vitest ne l'exécute jamais. Le résultat est pire qu'un test skippé — un test
//      skippé se voit, un test orphelin donne l'illusion de la couverture.
//
//   2. `--passWithNoTests` QUI SURVIT À SA RAISON D'ÊTRE. Au lot L0 il n'existe
//      aucun test d'intégration, et c'est légitime : il n'y a ni base, ni route
//      métier, ni rien à intégrer. Le drapeau est donc honnête AUJOURD'HUI. Il
//      cesserait de l'être le jour où le schéma existe. Ce contrôle le rend
//      auto-péremptoire : dès que `apps/api/drizzle/` apparaît (le marqueur du lot
//      L1), l'absence de test d'intégration devient une ERREUR. Même mécanique
//      auto-durcissante que `scripts/schema-diff.mjs`.
//
// Traçabilité : E36, E43 · DoD transverse (« tous les tests verts, AUCUN test skippé »).
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');

/** Fichiers de test suivis par git, toutes natures confondues. */
function fichiersDeTest() {
  const sortie = execFileSync(
    'git',
    ['ls-files', '*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx', '*.e2e.ts'],
    { encoding: 'utf8', cwd: RACINE },
  );
  return sortie.split('\n').filter((f) => f.trim() !== '');
}

/**
 * Traduit un motif glob de `include` vitest en expression régulière.
 * Volontairement minimal : il ne couvre que les formes réellement employées
 * (`**`, `*`, `{a,b}`). Un moteur glob complet serait une dépendance de plus pour
 * un besoin de vingt lignes.
 */
function globVersRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` traverse zéro ou plusieurs répertoires.
        if (glob[i + 2] === '/') {
          re += '(?:[^/]+/)*';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '{') {
      const fin = glob.indexOf('}', i);
      re += `(?:${glob
        .slice(i + 1, fin)
        .split(',')
        .join('|')})`;
      i = fin;
    } else if ('.+^$()|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

// --- Motifs d'inclusion, lus dans la configuration réelle -------------------
// On les extrait du fichier plutôt que de les recopier : deux copies divergeraient,
// et c'est exactement le genre de divergence que ce script existe pour attraper.
const config = readFileSync(resolve(RACINE, 'vitest.config.ts'), 'utf8');
const inclusVitest = [...config.matchAll(/include:\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
  [...(m[1] ?? '').matchAll(/'([^']+)'/g)].map((g) => g[1] ?? ''),
);

const configPw = readFileSync(resolve(RACINE, 'playwright.config.ts'), 'utf8');
const dossierPw = /testDir:\s*'([^']+)'/.exec(configPw)?.[1]?.replace(/^\.\//, '') ?? 'e2e';
const motifPw = /testMatch:\s*'([^']+)'/.exec(configPw)?.[1] ?? '**/*.e2e.ts';
const inclusPlaywright = [`${dossierPw}/${motifPw}`];

const motifs = [...inclusVitest, ...inclusPlaywright].map(globVersRegex);

if (inclusVitest.length === 0) {
  console.error(`${ROUGE}✗ aucun motif d'inclusion trouvé dans vitest.config.ts.${RAZ}`);
  process.exit(1);
}

// --- Contrôle 1 : aucun fichier de test orphelin ----------------------------
const tests = fichiersDeTest();
const orphelins = tests.filter((f) => !motifs.some((re) => re.test(f)));

if (orphelins.length > 0) {
  console.error(`${ROUGE}✗ FICHIERS DE TEST QUE PERSONNE N'EXÉCUTE${RAZ}\n`);
  for (const f of orphelins) console.error(`  ${f}`);
  console.error(
    '\n  Ces fichiers ne correspondent à aucun `include` de vitest.config.ts ni au\n' +
      '  `testDir`/`testMatch` de playwright.config.ts. Ils sont donc verts en\n' +
      "  permanence sans jamais s'exécuter — une illusion de couverture, pire qu'un\n" +
      '  test visiblement désactivé.\n' +
      '  Corrige : déplace le fichier dans un emplacement capté, ou élargis le motif.\n',
  );
  process.exit(1);
}

// --- Contrôle 2 : `--passWithNoTests` a-t-il dépassé sa date ? --------------
const l1Livre = existsSync(resolve(RACINE, 'apps/api/drizzle'));
const testsIntegration = tests.filter((f) => f.includes('.integration.test.'));

if (l1Livre && testsIntegration.length === 0) {
  console.error(
    `${ROUGE}✗ AUCUN TEST D'INTÉGRATION alors que le lot L1 est livré.${RAZ}\n\n` +
      '  `pnpm test:integration` porte `--passWithNoTests`. Ce drapeau était honnête\n' +
      "  au lot L0 : il n'y avait ni base, ni route métier, ni rien à intégrer.\n" +
      '  Le schéma existe désormais (apps/api/drizzle/) : le drapeau ferait passer\n' +
      '  au vert une suite VIDE, ce que le 09 §5.7 interdit.\n\n' +
      '  Le fichier 07 §13 énumère ce qui est attendu ici : RBAC exhaustif (chaque\n' +
      '  rôle × chaque route), propriété de session §9.9, idempotence du push,\n' +
      '  unicité `answers(interview_id, mission_question_id)`, anti-rejeu des webhooks,\n' +
      '  garde-fou de reset de mot de passe.\n\n' +
      '  Écris ces tests, puis RETIRE `--passWithNoTests` du script.\n',
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} projets de test : ${String(tests.length)} fichier(s) de test, tous captés par un projet.` +
    (l1Livre ? '' : "\n  (`--passWithNoTests` encore légitime : le lot L1 n'est pas livré.)"),
);
