#!/usr/bin/env node
// =============================================================================
// GARDE-FOU ANTI-SKIP — règle 09 §5.7 et DoD transverse (09 §3)
// « Tests désactivés/skippés = build rouge » (11 §2) · « @critique jamais skippable »
//
// Pourquoi un script dédié alors qu'ESLint porte déjà la règle : un lint peut être
// désactivé en local par un commentaire, et le contrat prévient (09 §5.7) qu'un agent
// pressé « simplifiera temporairement » pour faire passer un test. Ce contrôle-ci est
// exécuté par la CI, sans échappatoire par commentaire, et il bloque le merge.
// Traçabilité : E36 (exécutable par lots avec critères), E43 (exécutabilité autopilote).
//
// -----------------------------------------------------------------------------
// RÉVISION DU 2026-08-28 — CE CONTRÔLE ÉNUMÉRAIT DES ÉCRITURES, PAS UNE PROPRIÉTÉ
// -----------------------------------------------------------------------------
// Une revue adverse a fait sortir DEUX désactivations au vert :
//
//     test.concurrent.skip(…)    → la liste ne connaissait que `test.skip(`
//     it.runIf(false)(…)         → `runIf` n'était nulle part
//
// La cause est celle que tout ce lot poursuit : une liste de FORMES CONNUES face à
// une propriété UNIVERSELLE. Vitest chaîne librement ses modificateurs
// (`test.concurrent.skip`, `it.skip.each`, `describe.sequential.only`) et en ajoute
// à chaque version : énumérer les chaînes interdites est perdu d'avance.
//
// PROPRIÉTÉ GARDÉE, formulée par CE QUI EST AUTORISÉ :
//   1. sur un point d'entrée de test (`it`/`test`/`describe`/`suite`/`bench`), CHAQUE
//      modificateur de la chaîne appartient à une liste d'AUTORISÉS. Un modificateur
//      inconnu — celui de Vitest 4, celui d'un autre coureur — est REFUSÉ par défaut.
//      C'est le bon sens du refus : oublier un autorisé fait crier à tort et se
//      corrige ; oublier un interdit laisse passer une faute et ne se sait jamais.
//   2. aucun appel de désactivation sur QUELQUE receveur que ce soit
//      (`this.skip()`, `ctx.skip()`, `monTest.skip()` — `test.extend` rend un
//      point d'entrée qui ne s'appelle plus `test`).
//   3. aucune option de désactivation dans la forme objet
//      (`it('…', { skip: true }, …)`), que la liste précédente ignorait entièrement.
//
// CE QUE CE CONTRÔLE NE VERRA JAMAIS — limites assumées :
//   · un test vidé de son contenu, ou terminé par un `return` précoce sous
//     condition : il RESTE vert et ne teste plus rien. Aucune expression régulière
//     ne distingue cela d'un test légitimement court. C'est la revue croisée
//     (étape 4) et la couverture mesurée qui le tiennent.
//   · un fichier de test retiré du périmètre d'un projet Vitest — c'est
//     `pnpm check:test-projects` qui garde CE trou-là, pas celui-ci.
//   · un `describe` entier commenté : le fichier ne le déclare plus du tout.
// =============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Couleurs ANSI. L'octet ESC vient d'un APPEL DE FONCTION, jamais d'une séquence
// d'échappement écrite à la main : l'outillage d'édition de la chaîne d'agents la
// convertit en OCTET RÉEL à l'écriture, et un octet de contrôle dans une source la
// rend invisible aux `grep` des étapes 3, 4 et 6 du pipeline (mesuré le 2026-09-04 ;
// garde `scripts/check-octets-controle.mjs`).
const ESC = String.fromCharCode(27);
const ROUGE = `${ESC}[31m`;
const VERT = `${ESC}[32m`;
const RAZ = `${ESC}[0m`;

/**
 * Modificateurs AUTORISÉS sur un point d'entrée de test. Tout le reste est refusé.
 *
 * Ce sont ceux qui organisent l'exécution sans jamais la supprimer : paramétrage
 * (`each`, `for`), ordonnancement (`concurrent`, `sequential`, `shuffle`),
 * extension de contexte (`extend`), et les entrées Playwright de structure
 * (`describe`, `configure`, `beforeAll`… , `setTimeout`, `step`, `use`, `info`).
 *
 * ABSENTS DÉLIBÉRÉMENT, donc refusés : `skip`, `only`, `todo`, `fails`, `failing`,
 * `fixme`, `skipIf`, `runIf`, `slow`. `runIf`/`skipIf` sont des désactivations
 * CONDITIONNELLES : elles rendent le vert d'une CI dépendant d'une variable
 * d'environnement, ce qui est exactement l'inverse d'une preuve.
 */
const MODIFICATEURS_AUTORISES = new Set([
  'each',
  'for',
  'concurrent',
  'sequential',
  'shuffle',
  'extend',
  'describe',
  'configure',
  'setTimeout',
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
  'step',
  'use',
  'info',
]);

/** Appels qui désactivent, sur n'importe quel receveur. */
const RE_DESACTIVATION = /\.\s*(skip|only|todo|fails|failing|fixme|skipIf|runIf|slow)\s*[(`]/g;

/**
 * Chaîne de modificateurs collée à un point d'entrée de test.
 *
 * Deux précautions, chacune mesurée sur le dépôt réel :
 *   · le regard arrière exclut un NOM DE FICHIER (`l0-sauvegarde.integration.test.ts`
 *     cité dans un commentaire) : `test` y est précédé d'un point, jamais dans du
 *     code. Sans lui, ce contrôle criait sur trois commentaires du dépôt — et un
 *     contrôle qui crie à tort est un contrôle qu'on finit par désactiver.
 *   · le point d'entrée doit être SUIVI d'une ouverture d'appel. Le guillemet
 *     oblique en est volontairement absent : `` `…test.ts` `` s'en sert aussi, et
 *     les seules API de test à modèle balisé (`each`, `for`) sont de toute façon
 *     autorisées — l'exclure ne perd donc rien et supprime l'ambiguïté.
 * Les espaces autour des points sont interdits ici : du code n'écrit jamais
 * `test . skip(`. La règle RE_DESACTIVATION, elle, les tolère — elle attrape cette
 * écriture-là quel que soit le receveur.
 */
const RE_CHAINE = /(?<![\w.$-])(it|test|describe|suite|bench)((?:\.[A-Za-z_$][\w$]*)+)\s*[({[<]/g;

/** Forme objet : `it('…', { skip: true }, …)`. */
const RE_OPTION = /\b(skip|only|todo|fails|failing)\s*:\s*(?:true|!0)\b/g;

/** Préfixes historiques de Jasmine/Jest. */
const RE_PREFIXE = /\b(x|f)(it|test|describe|context)\s*\(/g;

/**
 * Chaque règle rend, pour une correspondance, le libellé de l'infraction — ou
 * `null` si cette correspondance est légitime. Une seule mécanique, trois lectures.
 */
const REGLES = [
  {
    re: RE_CHAINE,
    juger: (m) => {
      const refuses = m[2]
        .split('.')
        .filter((mot) => mot !== '' && !MODIFICATEURS_AUTORISES.has(mot));
      return refuses.length === 0
        ? null
        : `${m[1]}.${refuses.join('.')} — modificateur non autorisé`;
    },
  },
  { re: RE_DESACTIVATION, juger: (m) => `.${m[1]}( — appel de désactivation` },
  { re: RE_OPTION, juger: (m) => `{ ${m[1]}: true } — désactivation par option` },
  { re: RE_PREFIXE, juger: (m) => `${m[1]}${m[2]}( — préfixe de désactivation` },
];

/**
 * AUCUNE EXCEPTION. Cette liste est volontairement vide et doit le rester : une
 * exception ici est exactement le trou par lequel un test @critique disparaîtrait.
 * L'ajout d'une entrée exige une entrée DECISIONS.md signée par Williams (11 §8.5).
 */
const EXCEPTIONS = [];

/**
 * EXTENSIONS ANALYSÉES — l'UNIQUE endroit de ce script où elles s'écrivent.
 *
 * Elles vivaient à DEUX endroits : l'argument de `git ls-files` et la prose du
 * message d'erreur plus bas, qui n'en citait déjà que trois sur cinq. Une liste
 * recopiée dérive, et c'est la copie AFFICHÉE qui finit par mentir à celui qui la
 * lit pour savoir ce que le contrôle a couvert.
 *
 * `*.perf.ts` ajouté le 2026-09-09 (arbitrage A01 du même jour dans DECISIONS.md,
 * sur constat d'A28, qui a signalé l'effet de bord de son propre choix). Les bancs
 * de `tests/perf/` portent délibérément une extension hors des projets vitest,
 * pour ne pas allonger la CI d'un montage Docker : ils échappaient donc à CE
 * contrôle-ci, et un `.skip` posé dans un banc ne faisait rougir personne. Le
 * CLAUDE.md §2 énonce « tests désactivés/skippés = build rouge » SANS restreindre
 * aucune extension — la garde était incomplète au regard de la règle qu'elle
 * prétend tenir. Ce n'était pas un doute de spec, c'était un défaut de garde.
 *
 * CETTE LISTE N'EST DÉLIBÉRÉMENT PAS PARTAGÉE avec celle de
 * `check-test-projects.mjs`, qui tient la sienne. Les deux scripts posent des
 * questions différentes : « ce test est-il éteint ? » a un sens pour n'importe
 * quel coureur, alors que « ce fichier est-il capté par un projet vitest ? » n'en
 * a aucun pour un banc Playwright — l'y étendre exigerait de déclarer un projet
 * vitest pour des fichiers que vitest n'exécute pas : un déplacement du problème,
 * pas une garde. Or factoriser les deux listes dans un module commun étendrait
 * mécaniquement l'AUTRE contrôle à chaque ajout fait ici. La duplication entre les
 * deux scripts est le moindre mal, elle est assumée, et c'est ce commentaire qui
 * la tient.
 */
const EXTENSIONS_DE_TEST = [
  '*.test.ts',
  '*.test.tsx',
  '*.spec.ts',
  '*.spec.tsx',
  '*.e2e.ts',
  '*.perf.ts',
];

/** Fichiers de test suivis par git (on n'analyse jamais node_modules ni dist). */
function fichiersDeTest() {
  const sortie = execFileSync('git', ['ls-files', ...EXTENSIONS_DE_TEST], {
    encoding: 'utf8',
  });
  return sortie.split('\n').filter((f) => f.trim() !== '' && !EXCEPTIONS.includes(f));
}

const infractions = [];
const fichiers = fichiersDeTest();

// UN CONTRÔLE QUI N'A RIEN ANALYSÉ NE SORT JAMAIS VERT. Sans cette ligne, le script
// imprimait « aucun test désactivé (0 fichier(s) analysé(s)) » et rendait EXIT=0 :
// un `git ls-files` lancé hors dépôt, un renommage d'extension, et le garde-fou
// affirmait sa conclusion sans avoir rien regardé. C'est le défaut d'origine de ce
// lot, ici par une autre porte.
if (fichiers.length === 0) {
  console.error(`\n${ROUGE}✗ GARDE-FOU ANTI-SKIP : aucun fichier de test trouvé.${RAZ}`);
  console.error(
    '  `git ls-files` ne rend aucun ' +
      EXTENSIONS_DE_TEST.join(' / ') +
      '. Ce contrôle\n' +
      "  n'a donc RIEN vérifié — et un contrôle qui ne vérifie rien ne rend pas EXIT=0.\n",
  );
  process.exit(1);
}

for (const fichier of fichiers) {
  const contenu = readFileSync(fichier, 'utf8');
  const lignes = contenu.split('\n');

  for (const { re, juger } of REGLES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(contenu)) !== null) {
      const quoi = juger(m);
      if (quoi === null) continue;
      const numero = contenu.slice(0, m.index).split('\n').length;
      infractions.push({
        fichier,
        ligne: numero,
        quoi,
        extrait: (lignes[numero - 1] ?? '').trim(),
      });
    }
  }
}

if (infractions.length > 0) {
  console.error(`\n${ROUGE}✗ GARDE-FOU ANTI-SKIP : build rouge${RAZ}`);
  console.error('  Règle 09 §5.7 et DoD transverse : « tous les tests verts, AUCUN test skippé ».');
  console.error('  Les tests marqués @critique et @filrouge ne sont JAMAIS skippables (11 §2).\n');
  for (const i of infractions) {
    console.error(`  ${i.fichier}:${i.ligne}  ${i.quoi}`);
    console.error(`      ${i.extrait}`);
  }
  console.error(
    `\n  ${infractions.length} test(s) désactivé(s). Corrige le test ou supprime-le —\n` +
      '  « simplifier temporairement » pour faire passer la CI est explicitement\n' +
      '  interdit (09 §5.7). Un test qui gêne signale un problème, il ne le crée pas.\n',
  );
  process.exit(1);
}

const total = fichiers.length;
console.log(
  `${VERT}✓${RAZ} garde-fou anti-skip : aucun test désactivé (${total} fichier(s) de test analysé(s)).`,
);
