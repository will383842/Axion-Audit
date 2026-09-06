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
import { readFileSync, existsSync, globSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
// Plus de jaune ici depuis le 2026-08-28 : ce contrôle n’avertit plus, il refuse.
// Le seul avertissement qu’il portait — un fichier de test non suivi par git —
// masquait 51 tests, dont 35 `@critique`, absents de la CI (contrôle 5).
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
  // LA MOITIÉ « LES DEUX MISSIONS » ÉTAIT DÉCORATIVE, et c'est le gardien A02 qui
  // l'a prouvé : elle cherchait `FIL-TPE`/`FIL-GC` dans la CONCATÉNATION de tous
  // les fichiers de test. Il a effacé `FIL-GC` du test `@filrouge` — le contrôle
  // est resté VERT, parce que la chaîne figure dans un message d'assertion d'un
  // AUTRE fichier. Le contrôle avait fermé le trou des commentaires et laissé
  // celui de la prose : n'importe quelle phrase, n'importe où, le satisfaisait.
  //
  // Les deux missions doivent être couvertes PAR LE TEST QUI PORTE LE MARQUEUR,
  // pas quelque part dans le dépôt. C'est la seule lecture qui corresponde au
  // 09 §4bis : « toute porte exige `@filrouge` vert sur LES DEUX missions ».
  const fichiersFilRouge = tests.filter((f) =>
    /@filrouge/.test(sansCommentaires(readFileSync(resolve(RACINE, f), 'utf8'))),
  );
  const contenuFilRouge = fichiersFilRouge
    .map((f) => sansCommentaires(readFileSync(resolve(RACINE, f), 'utf8')))
    .join('\n');
  const aFilRouge = fichiersFilRouge.length > 0;
  const missions = ['FIL-TPE', 'FIL-GC'].filter((m) => !contenuFilRouge.includes(m));

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

// --- Contrôle 4 : `@critique` est-il exigible ET RÉELLEMENT EXÉCUTÉ ? -------
//
// POURQUOI CE CONTRÔLE EST NÉ. `pnpm test:critique` enchaîne un segment Vitest et
// un segment Playwright. Le second sortait en CODE 1 au lot L1 : aucun test
// Playwright ne porte `@critique`, et Playwright échoue quand son filtre ne trouve
// rien. La commande d'urgence du pack était INUTILISABLE (réserve M-1, 1ʳᵉ passe).
//
// POURQUOI IL A DÛ ÊTRE RÉÉCRIT. Sa première version disait que la permissivité
// venait du seul `--pass-with-no-tests` de Playwright, et se contentait de chercher
// la chaîne `@critique` **quelque part** dans les fichiers de test. La 2ᵉ passe de
// revue l'a mis en défaut PAR EXÉCUTION :
//
//     npx vitest run --project unit -t "@zzz_nexiste_pas"
//     Test Files  1 skipped (1) · Tests  95 skipped (95) · EXIT = 0
//
// Le segment **Vitest** est donc permissif LUI AUSSI, et depuis toujours. Déplacer
// le marqueur du méta-test vers un test Playwright rendait `pnpm test:critique`
// vert avec ZÉRO exécution du méta-test — et ce contrôle vert avec lui. Un
// garde-fou qui annonce plus qu'il ne fait est le défaut que ce dépôt traque
// partout ailleurs ; il n'avait pas à y échapper.
//
// CE QU'IL EXIGE DÉSORMAIS : le marqueur doit vivre dans un fichier couvert par un
// projet que le segment Vitest EXÉCUTE (`unit` ou `integration`). C'est la seule
// formulation qui garantisse qu'au moins un test critique tourne vraiment.
if (l1Livre) {
  const PROJETS_VITEST_CRITIQUE = ['unit', 'integration'];
  const porteurs = tests.filter((f) => {
    const projet = couvertPar(f)?.nom;
    if (!PROJETS_VITEST_CRITIQUE.includes(projet)) return false;
    return /@critique/.test(sansCommentaires(readFileSync(resolve(RACINE, f), 'utf8')));
  });

  if (porteurs.length === 0) {
    const ailleurs = tests.filter((f) =>
      /@critique/.test(sansCommentaires(readFileSync(resolve(RACINE, f), 'utf8'))),
    );
    console.error(
      `${ROUGE}✗ AUCUN TEST \`@critique\` EXÉCUTÉ par \`pnpm test:critique\`.${RAZ}\n\n` +
        (ailleurs.length > 0
          ? `  Le marqueur existe (${ailleurs.join(', ')}) mais dans aucun projet que le\n` +
            '  segment Vitest exécute. Les deux segments de la commande passent au vert\n' +
            '  quand leur filtre ne trouve rien : la commande ne prouverait RIEN.\n\n'
          : '  Aucun test ne porte le marqueur.\n\n') +
        '  Le 09 §2 et le 11 §7 désignent nommément le **diff schéma-vs-04** comme\n' +
        "  famille critique, et c'est la seule des trois applicable au lot L1.\n" +
        `  Marque \`@critique\` un test d'un projet ${PROJETS_VITEST_CRITIQUE.join(' ou ')}.\n`,
    );
    process.exit(1);
  }
}

// --- Contrôle 5 : un test présent sur le disque mais INVISIBLE à git ---------
//
// POURQUOI. Ce script, comme `check-no-skipped-tests`, énumère les fichiers via
// `git ls-files`. C'est le bon choix — il ignore `node_modules`, les artefacts de
// construction et les brouillons — mais il a une conséquence que personne n'avait
// vue : **un fichier de test NON SUIVI est exécuté par Vitest et ignoré par les
// garde-fous**. Pendant tout le temps où il reste non indexé, il peut contenir un
// `it.skip`, ne relever d'aucun projet, ou disparaître à un `git clean` — et les
// deux contrôles annoncent « tout va bien » sur un périmètre amputé.
//
// Le cas s'est produit au lot L1, sur le test qui garde `apps/api/src/db/schema.ts` :
// l'agent qui l'a écrit n'avait pas le droit d'indexer (règle de croisement), le
// contrôle comptait « integration:6 » au lieu de 7, et le fichier serait passé sous
// le radar **au moment même où il devenait utile**. C'est l'agent qui l'a signalé,
// pas le garde-fou. Un contrôle qui dépend de la vigilance humaine pour connaître
// son propre périmètre n'est pas un contrôle.
//
// Ce n'était PAS traité comme une erreur, au motif qu'un test en cours d'écriture
// est légitimement non suivi. **Ce raisonnement a été renversé par la mesure le
// 2026-08-28, et le renversement mérite d'être écrit plutôt que corrigé en
// silence.**
//
// Le gardien A70 a mesuré la conséquence réelle de l'avertissement sans échec :
//
//     tests d'intégration exécutés en local ......... 141   (12 fichiers)
//     tests d'intégration exécutés en CI ............  90   (10 fichiers)
//     dont NON exécutés : 51 tests, **35 marqués @critique**
//
// Ces 35 tests gardent la chaîne de sauvegarde — chiffrement effectif, `pipefail`,
// rotation, disque plein, horloge qui recule, permissions 0600. Ils ne tournaient
// nulle part sauf sur un poste, et n'étaient dans **aucune sauvegarde**. Le dépôt
// qui grave « aucune donnée ne vit sur un seul appareil plus de 24 h » laissait
// vivre 51 tests critiques sur un seul disque dur.
//
// Et le job d'intégration durait **1 min 15 s** en CI là où un seul de ces fichiers
// met 70 s en local. L'arithmétique était impossible ; personne ne l'a relevé.
//
// **Le pire n'est pas le trou, c'est que ce contrôle l'avait DIAGNOSTIQUÉ.** Il
// imprimait le bon diagnostic, dans le bon vocabulaire, en nommant les deux
// fichiers — et sortait en 0. Un garde-fou qui décrit exactement la panne sans la
// bloquer est pire qu'un garde-fou muet : **il consomme la vigilance qu'il ne
// rembourse pas**, et le vert de `pnpm verify` recouvre son propre avertissement.
//
// ÉCHEC DÉSORMAIS — et le cas légitime reste ouvert : indexer suffit, aucun commit
// n'est requis. Un agent qui n'a pas le droit de commiter (règle de croisement
// 09 §5.6) peut indexer son fichier ; c'est même la seule façon de le faire entrer
// dans le périmètre des garde-fous au moment où il devient utile.
const suivis = new Set(tests);
const surDisque = globSync('**/*.{test,spec}.{ts,tsx,mts,cts}', {
  cwd: RACINE,
  ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
})
  .map((f) => f.replaceAll(String.fromCharCode(92), '/'))
  .filter((f) => !suivis.has(f));

if (surDisque.length > 0) {
  console.error(
    `${ROUGE}✗ ${String(surDisque.length)} fichier(s) de test NON SUIVI(S) par git :${RAZ}\n` +
      surDisque.map((f) => `    ${f}`).join('\n') +
      '\n  Vitest les exécute ICI ; ce contrôle et `check-no-skipped-tests` ne les voient PAS,\n' +
      '  et la CI NE LES EXÉCUTE PAS DU TOUT (elle part de git). Un test qui ne tourne que\n' +
      "  sur un poste ne protège personne, et n'est dans aucune sauvegarde.\n" +
      '  → `git add` sur ces fichiers SUFFIT. Aucun commit n’est requis : un agent soumis\n' +
      '    à la règle de croisement (09 §5.6) peut indexer sans commiter.\n',
  );
  process.exit(1);
}

// --- Contrôle 6 : un projet vitest DÉCLARÉ mais lancé par AUCUN script -------
//
// LE TROU QUE CE CONTRÔLE FERME, et il était béant. Les contrôles 1 à 5 partent
// tous du FICHIER : « ce test est-il capté par un projet ? ». Aucun ne partait du
// PROJET : « ce projet est-il seulement lancé ? ». Les deux questions paraissent
// jumelles ; elles ne le sont pas, et l'écart entre elles a coûté 26 fichiers.
//
// MESURÉ le 2026-09-02 sur ce dépôt, AVANT correctif :
//     vitest.config.ts déclare TROIS projets .... interface, unit, integration
//     `pnpm verify` en lançait ................... DEUX (unit, integration)
//     fichiers du projet `interface` ............. 26, exécutés par AUCUN script
//                                                  de `pnpm test`, ni par
//                                                  `verify`, ni par le pre-push
//     ce qu'ils donnent quand on les lance ....... 447 tests, 447 VERTS
//
// Les 447 verts sont la partie la plus instructive : le trou n'avait rien cassé,
// il avait seulement rendu 26 fichiers INVÉRIFIABLES. Un garde-fou ne protège pas
// contre le rouge, il protège contre l'ignorance — et pendant tout ce temps
// personne ne pouvait dire, preuve en main, si ces 447 cas passaient encore.
//
// Le contrôle 1 était VERT tout du long, et il avait raison de l'être : les 26
// fichiers SONT captés par un projet. Simplement, ce projet n'était démarré nulle
// part. C'est la forme la plus discrète du défaut que ce script traque depuis sa
// première ligne — « un fichier hors des `include` est vert en permanence sans
// jamais s'exécuter » — déplacée d'un cran, du fichier vers le projet. Le garde
// décrivait exactement sa propre panne dans son en-tête sans la voir.
//
// CE QU'IL EXIGE : chaque projet déclaré dans `vitest.config.ts` doit être lancé
// par `pnpm verify`, le garde obligatoire avant toute PR. On suit le GRAPHE des
// scripts (`verify` appelle `pnpm test:unit`, qui appelle `vitest run --project
// unit`) plutôt que de chercher un nom dans une chaîne : c'est l'indirection qui
// avait rendu le trou invisible à la lecture.
//
// `verify:rapide` n'est délibérément PAS soumis à la même exigence : le hook
// pre-push doit rester léger, et l'intégration y est légitimement absente. Ce qui
// n'est pas négociable, c'est `verify`.
const scripts = JSON.parse(readFileSync(resolve(RACINE, 'package.json'), 'utf8')).scripts ?? {};

/** Texte de toutes les commandes atteignables depuis un script, indirections suivies. */
function commandesAtteignables(nom, vus = new Set()) {
  if (vus.has(nom) || !(nom in scripts)) return '';
  vus.add(nom);
  const brut = scripts[nom];
  const references = [...brut.matchAll(/pnpm(?:\s+run)?\s+([\w:-]+)/g)].map((m) => m[1] ?? '');
  return [brut, ...references.map((r) => commandesAtteignables(r, vus))].join('\n');
}

const commandesVerify = commandesAtteignables('verify');
const projetsVitest = projets.filter((p) => p.nom !== 'playwright');
const jamaisLances = projetsVitest.filter(
  (p) => !new RegExp('--project[= ]' + p.nom + '(?![A-Za-z0-9_-])').test(commandesVerify),
);

if (jamaisLances.length > 0) {
  console.error(
    `${ROUGE}✗ PROJET(S) VITEST DÉCLARÉ(S) MAIS LANCÉ(S) PAR AUCUN SCRIPT DE « verify »${RAZ}\n`,
  );
  for (const projet of jamaisLances) {
    const captes = tests.filter((f) => couvertPar(f)?.nom === projet.nom).length;
    console.error(`  ${projet.nom} — ${String(captes)} fichier(s) de test concerné(s)`);
  }
  console.error(
    '\n  Ces projets existent dans `vitest.config.ts`, leurs fichiers sont bien captés\n' +
      '  (le contrôle 1 est vert), mais RIEN ne les démarre : `pnpm verify` — le garde\n' +
      "  obligatoire avant toute PR — n'en lance pas un seul. Les tests concernés sont\n" +
      '  donc verts en permanence sans jamais tourner, et le vert de `verify` recouvre\n' +
      "  leur absence. Un garde muet est pire qu'un garde absent : il rassure.\n" +
      '  → Ajoute un script `test:<projet>` = `vitest run --project <projet>` et\n' +
      '    enchaîne-le dans `verify` à côté de `pnpm test:unit`.\n',
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
