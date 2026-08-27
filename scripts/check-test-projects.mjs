#!/usr/bin/env node
// =============================================================================
// GARDE-FOU : AUCUN TEST NE DORT — et `--passWithNoTests` a une date de péremption.
//
// Deux trous que le garde-fou anti-skip (09 §5.7) ne peut pas voir, parce qu'ils ne
// passent pas par un `.skip()` :
//
//   1. UN FICHIER DE TEST QUE PERSONNE N'EXÉCUTE. Un fichier hors des `include`
//      d'un projet vitest — ou inclus puis EXCLU — est vert en permanence sans
//      jamais s'exécuter. C'est pire qu'un test skippé : le skip se voit, l'orphelin
//      donne l'illusion de la couverture.
//
//   2. `--passWithNoTests` QUI SURVIT À SA RAISON D'ÊTRE. Au lot L0 il n'existe
//      aucun test d'intégration, et c'est légitime : rien à intégrer. Le drapeau est
//      honnête AUJOURD'HUI. Ce contrôle le rend auto-péremptoire : dès que
//      `apps/api/drizzle/` apparaît (marqueur du lot L1), l'absence de test
//      d'intégration devient une ERREUR.
//
// CORRECTION APRÈS REVUE (défaut N-1, seconde passe A17). La première version
// extrayait les `include:` par une regex lâche sur le TEXTE de `vitest.config.ts` :
// elle capturait aussi `coverage.include` (`apps/*/src/**/*.ts`), qui absorbe
// n'importe quel `.ts` sous `src/`. Trois formes d'orphelins passaient donc au vert,
// dont un test d'intégration mal placé sous `src/` — le cas réel du lot L1. Et les
// `exclude:` n'étaient jamais lus. Un garde-fou qui ment est le pire défaut possible
// dans ce dépôt : la lecture se fait désormais PAR PROJET, `include` ET `exclude`.
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
 * Traduit un motif glob en expression régulière.
 * Volontairement minimal : il ne couvre que les formes réellement employées
 * (`**`, `*`, `{a,b}`). Un moteur glob complet serait une dépendance de plus pour
 * un besoin de trente lignes.
 */
function globVersRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:[^/]+/)*'; // `**/` traverse zéro ou plusieurs répertoires
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

/** Extrait le texte d'un tableau `cle: [ … ]` en équilibrant les crochets. */
function tableauApres(texte, cle, depuis = 0) {
  const debut = texte.indexOf(`${cle}:`, depuis);
  if (debut < 0) return null;
  const ouvrant = texte.indexOf('[', debut);
  if (ouvrant < 0) return null;
  let profondeur = 0;
  for (let i = ouvrant; i < texte.length; i += 1) {
    if (texte[i] === '[') profondeur += 1;
    else if (texte[i] === ']') {
      profondeur -= 1;
      if (profondeur === 0) return { texte: texte.slice(ouvrant + 1, i), fin: i };
    }
  }
  return null;
}

function motifsDe(texte, cle) {
  const bloc = tableauApres(texte, cle);
  if (!bloc) return [];
  return [...bloc.texte.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

// --- Lecture des projets vitest : include ET exclude, PAR PROJET ------------
const configVitest = readFileSync(resolve(RACINE, 'vitest.config.ts'), 'utf8');
const blocProjets = tableauApres(configVitest, 'projects');

if (!blocProjets) {
  console.error(
    `${ROUGE}✗ aucun bloc \`projects\` trouvé dans vitest.config.ts.${RAZ}\n` +
      "  Ce contrôle lit la configuration RÉELLE plutôt que d'en recopier les motifs :\n" +
      "  deux copies divergeraient, et c'est le genre de divergence qu'il traque.\n",
  );
  process.exit(1);
}

/**
 * Un projet par occurrence de `name:`. On découpe sur ces bornes pour que les
 * `include`/`exclude` d'un projet ne soient jamais attribués à un autre — et
 * surtout pour ne PAS descendre dans `coverage`, qui vit hors de ce bloc.
 */
const projets = [];
const bornes = [...blocProjets.texte.matchAll(/name:\s*'([^']+)'/g)];
for (const [i, borne] of bornes.entries()) {
  const debut = borne.index ?? 0;
  const fin =
    i + 1 < bornes.length
      ? (bornes[i + 1]?.index ?? blocProjets.texte.length)
      : blocProjets.texte.length;
  const morceau = blocProjets.texte.slice(debut, fin);
  projets.push({
    nom: borne[1] ?? '',
    include: motifsDe(morceau, 'include').map(globVersRegex),
    exclude: motifsDe(morceau, 'exclude').map(globVersRegex),
  });
}

// --- Playwright -------------------------------------------------------------
const configPw = readFileSync(resolve(RACINE, 'playwright.config.ts'), 'utf8');
const dossierPw = /testDir:\s*'([^']+)'/.exec(configPw)?.[1]?.replace(/^\.\//, '') ?? 'e2e';
const motifPw = /testMatch:\s*'([^']+)'/.exec(configPw)?.[1] ?? '**/*.e2e.ts';
projets.push({
  nom: 'playwright',
  include: [globVersRegex(`${dossierPw}/${motifPw}`)],
  exclude: [],
});

if (projets.length < 2) {
  console.error(`${ROUGE}✗ aucun projet de test identifié — le contrôle serait sans objet.${RAZ}`);
  process.exit(1);
}

/** Un fichier est couvert s'il est inclus ET non exclu par AU MOINS un projet. */
function couvertPar(fichier) {
  return projets.find(
    (p) => p.include.some((re) => re.test(fichier)) && !p.exclude.some((re) => re.test(fichier)),
  );
}

// --- Contrôle 1 : aucun fichier de test orphelin ----------------------------
const tests = fichiersDeTest();
const orphelins = tests.filter((f) => !couvertPar(f));

if (orphelins.length > 0) {
  console.error(`${ROUGE}✗ FICHIERS DE TEST QUE PERSONNE N'EXÉCUTE${RAZ}\n`);
  for (const f of orphelins) console.error(`  ${f}`);
  console.error(
    '\n  Ces fichiers ne sont captés par aucun projet — soit hors de tout `include`,\n' +
      '  soit inclus PUIS exclus. Ils sont donc verts en permanence sans jamais\n' +
      "  s'exécuter : une illusion de couverture, pire qu'un test visiblement désactivé.\n" +
      `  Projets déclarés : ${projets.map((p) => p.nom).join(', ')}.\n` +
      '  Corrige : déplace le fichier dans un emplacement capté, ou élargis le motif.\n',
  );
  process.exit(1);
}

// --- Contrôle 2 : `--passWithNoTests` a-t-il dépassé sa date ? --------------
const l1Livre = existsSync(resolve(RACINE, 'apps/api/drizzle'));
const testsIntegration = tests.filter((f) => couvertPar(f)?.nom === 'integration');

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

const detail = projets
  .map((p) => `${p.nom}:${String(tests.filter((f) => couvertPar(f)?.nom === p.nom).length)}`)
  .join(' · ');
console.log(
  `${VERT}✓${RAZ} projets de test : ${String(tests.length)} fichier(s), tous captés (${detail}).` +
    (l1Livre ? '' : "\n  (`--passWithNoTests` encore légitime : le lot L1 n'est pas livré.)"),
);
