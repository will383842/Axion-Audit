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
      '  Au lot L0, `pnpm test:integration` portait `--passWithNoTests`, et le drapeau\n' +
      "  était honnête : il n'y avait ni base, ni route métier, ni rien à intégrer.\n" +
      '  Le drapeau a été RETIRÉ à la livraison du lot L1. Ce contrôle lui survit et\n' +
      '  garde la même exigence : le schéma existe (apps/api/drizzle/), donc une suite\n' +
      "  d'intégration VIDE serait un vert qui ne prouve rien (09 §5.7).\n\n" +
      '  Le fichier 07 §13 énumère ce qui est attendu ici : RBAC exhaustif (chaque\n' +
      '  rôle × chaque route), propriété de session §9.9, idempotence du push,\n' +
      '  unicité `answers(interview_id, mission_question_id)`, anti-rejeu des webhooks,\n' +
      '  garde-fou de reset de mot de passe.\n\n' +
      "  Écris ces tests : ils sont la raison d'être du lot.\n",
  );
  process.exit(1);
}

// --- Contrôle 3 : le fil rouge existe-t-il dès qu'il est exigible ? ---------
//
// 09 §4bis : « Deux missions canoniques vivent en FIXTURES de test DÈS L1 et
// GRANDISSENT à chaque lot : FIL-TPE et FIL-GC. Un test Playwright unique marqué
// `@filrouge` rejoue à CHAQUE merge le parcours de bout en bout disponible à date…
// **Toute porte exige `@filrouge` vert sur LES DEUX missions.** »
//
// Le gardien A02 a relevé que `@filrouge` était le SEUL membre de la famille
// auto-péremptoire de ce dépôt sans garde-fou : le schéma, les tests d'intégration
// et la couverture deviennent tous exigibles mécaniquement au lot qui les concerne,
// pas le fil rouge — dont le mot n'apparaissait que dans des commentaires. Or c'est
// celui dont le pack dit qu'il conditionne TOUTES les portes.
// PIÈGE ÉVITÉ, et il s'est refermé sur ce contrôle lui-même à la première
// écriture : les COMMENTAIRES sont retirés avant l'analyse. L'en-tête de
// `e2e/socle.e2e.ts` annonce « L1 → fil rouge @filrouge sur FIL-TPE et FIL-GC »
// pour documenter ce qui viendra — et cette phrase suffisait à rendre le garde-fou
// vert. Un contrôle satisfait par de la prose est précisément ce que ce dépôt
// refuse partout ailleurs.
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

if (l1Livre) {
  const contenus = tests
    .map((f) => sansCommentaires(readFileSync(resolve(RACINE, f), 'utf8')))
    .join('\n');
  const aFilRouge = /@filrouge/.test(contenus);
  const missions = ['FIL-TPE', 'FIL-GC'].filter((m) => !contenus.includes(m));

  if (!aFilRouge || missions.length > 0) {
    console.error(
      `${ROUGE}✗ FIL ROUGE MANQUANT alors que le lot L1 est livré.${RAZ}\n\n` +
        (aFilRouge
          ? `  Le test \`@filrouge\` existe mais ne couvre pas : ${missions.join(', ')}.\n`
          : "  Aucun test marqué `@filrouge` n'existe.\n") +
        '\n  09 §4bis : les deux missions canoniques vivent en FIXTURES **dès L1** —\n' +
        '  FIL-TPE (micro fictive, 8 personnes, 1 entretien, ~30 questions) et FIL-GC\n' +
        '  (grand compte fictif : arbre de 150 unités sur 4 niveaux, 60 sessions,\n' +
        '  ~8 000 réponses générées par script — le générateur est un outillage de\n' +
        '  test livré au L1).\n\n' +
        '  Un test unique `@filrouge` rejoue à CHAQUE merge le parcours de bout en bout\n' +
        '  DISPONIBLE À DATE ; chaque lot ne fait que l’ALLONGER, jamais le réécrire.\n' +
        "  **Toute porte l'exige vert sur LES DEUX missions** — c'est aussi la preuve\n" +
        '  continue du « de la TPE au grand groupe » : la même app, le même parcours,\n' +
        '  aux deux échelles.\n',
    );
    process.exit(1);
  }
}

// --- Contrôle 4 : `@critique` existe-t-il dès qu'il est exigible ? ----------
//
// POURQUOI CE CONTRÔLE EST NÉ. `pnpm test:critique` enchaîne un segment Vitest et un
// segment Playwright. Le second sortait en CODE 1 au lot L1 : aucun test Playwright
// ne porte `@critique`, et Playwright échoue quand son filtre ne trouve rien. La
// commande d'urgence du pack était donc INUTILISABLE — relevé en revue croisée
// (réserve M-1).
//
// Le correctif est `--pass-with-no-tests` sur le segment Playwright, et il est
// légitime : `@critique` est réservé aux trois familles que le pack nomme (09 §2),
// dont une seule s'applique au L1 — le diff schéma-vs-04, qui vit en intégration.
// Les 8 scénarios offline et les tests RBAC arriveront à leurs lots.
//
// MAIS ce drapeau a un prix : `test:critique` ne peut plus échouer par ABSENCE. Si
// le test `@critique` disparaissait, la commande sortirait en 0 sans rien exécuter —
// un vert qui ne prouve rien, ce que le 09 §5.7 refuse et ce que le contrôle 2
// ci-dessus empêche déjà pour `--passWithNoTests`.
// Un drapeau permissif se paie d'un garde-fou. C'est celui-ci.
if (l1Livre) {
  const sources = tests
    .map((f) => sansCommentaires(readFileSync(resolve(RACINE, f), 'utf8')))
    .join('\n');
  if (!/@critique/.test(sources)) {
    console.error(
      `${ROUGE}✗ AUCUN TEST MARQUÉ \`@critique\` alors que le lot L1 est livré.${RAZ}\n\n` +
        '  Le 09 §2 et le 11 §7 désignent nommément le **diff schéma-vs-04** comme\n' +
        "  famille critique, et c'est la seule des trois applicable au lot L1.\n\n" +
        '  `pnpm test:critique` porte `--pass-with-no-tests` sur son segment Playwright :\n' +
        '  sans ce contrôle, la disparition du test sortirait en 0 sans rien exécuter.\n' +
        '  Marque `@critique` le test qui éprouve le diff schéma-vs-04.\n',
    );
    process.exit(1);
  }
}

const detail = projets
  .map((p) => `${p.nom}:${String(tests.filter((f) => couvertPar(f)?.nom === p.nom).length)}`)
  .join(' · ');
console.log(
  `${VERT}✓${RAZ} projets de test : ${String(tests.length)} fichier(s), tous captés (${detail}).` +
    (l1Livre ? '' : "\n  (`--passWithNoTests` encore légitime : le lot L1 n'est pas livré.)"),
);
