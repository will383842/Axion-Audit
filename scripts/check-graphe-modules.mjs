#!/usr/bin/env node
// =============================================================================
// GARDE-FOU : LE GRAPHE DES MODULES, LU DANS LES DEUX SENS.
//
//   CONTRÔLE 1 — LE PENDU    : un fichier suivi par git qui IMPORTE un chemin que
//                              git NE CONNAÎT PAS. Casse la branche pour tout le
//                              monde. Refus sec, aucune soupape. (défaut `b24b98c`)
//   CONTRÔLE 2 — L'ORPHELIN  : un module de `src/` que PERSONNE n'importe. Refusé
//                              par `CLAUDE.md` §4 étape 6, avec une soupape bornée
//                              et datée. (défaut `591ccbd`)
//
// UN SEUL SCRIPT, parce que c'est le MÊME graphe et la MÊME résolution de modules.
// Les séparer en deux dupliquerait cette résolution, et deux détecteurs concurrents
// finissent toujours par diverger — l'argument est déjà écrit dans
// `.github/workflows/ci.yml` à propos de `check:no-skipped-tests`. Le contrôle 2 a
// son propre en-tête, à l'endroit où il s'exécute.
//
// POURQUOI CE FICHIER S'EST APPELÉ AUTREMENT PENDANT UNE HEURE. Il est né sous le
// nom `check-code-orphelin.mjs`, celui du brief qui l'a commandé, avant que le
// contrôle 1 ne le rejoigne. Le nom a donc fini par annoncer MOINS que le fichier ne
// faisait — et surtout, il taisait le plus grave des deux : « code orphelin » se lit
// comme une question d'HYGIÈNE, quand le pendu est une question de CONSTRUCTIBILITÉ
// (un clone frais échoue, le staging n'est plus déployable). Un lecteur de la CI
// aurait sous-estimé un rouge. Renommé avant tout commit, à la demande d'A01.
// C'est la même exigence que celle que ce fichier applique au reste du dépôt :
// **ce qui est annoncé doit être ce qui est fait**, un nom de garde-fou compris.
//
// -----------------------------------------------------------------------------
// CONTRÔLE 2 — LE CODE ORPHELIN EST REFUSÉ : la règle existait, rien ne la tenait.
//
// `CLAUDE.md` §4 étape 6 exige la traçabilité DANS LES DEUX SENS : exigences → code
// (rien d'oublié) ET **code → exigences** — « tout code livré se rattache à E1-E47
// ou à une fiche AMELIORATIONS ; **le code orphelin est REFUSÉ** ». Le premier sens
// est outillé (`check-jonction`, `check-schema-inventaire`, la matrice E1-E47). Le
// second reposait ENTIÈREMENT sur l'œil du gardien. Ce fichier lui donne une machine.
//
// LE DÉFAUT RÉEL QUI L'A FAIT NAÎTRE — commit `591ccbd`, 2026-08-29.
// Son message annonçait quatre correctifs de sécurité (« le socle échouait ouvert,
// et la clé de quota était forgeable par le client »). Il ne contenait QU'UN SEUL
// fichier : `apps/api/src/auth/erreurs-jeton.ts`, un module d'aide **que personne
// n'importait**. Les cinq fichiers portant réellement les correctifs étaient restés
// non indexés.
//
// CE QUI REND CE DÉFAUT REDOUTABLE, C'EST LA CORROBORATION. Aucun test de ce commit
// ne couvrait le cas corrigé — le test ATTENDAIT le correctif — donc **la CI était
// VERTE**. Un lecteur avait un message de commit et une CI verte qui se confirmaient
// mutuellement pour une correction qui n'existait pas. C'est la quinzième occurrence
// en trois jours de la famille de défaut que ce dépôt traque : **un garde-fou, un
// commit ou un test qui annonce plus qu'il ne fait**.
//
// Le signal mécanique de ce défaut est simple et il tient en une phrase :
// **du code neuf que RIEN n'atteint**. Rejoué sur `591ccbd`, ce contrôle sort en 1
// et nomme `erreurs-jeton.ts` (voir `--ref`, plus bas : c'est son test d'acceptation).
//
// PAS DE JAUNE ICI, et pour la raison écrite en tête de `check-test-projects.mjs` :
// « ce contrôle n'avertit plus, il refuse. Le seul avertissement qu'il portait
// masquait 51 tests, dont 35 `@critique`, absents de la CI. » Un garde qui avertit
// est un garde qu'on ignore ; le vert de `pnpm verify` recouvre son propre
// avertissement. Celui-ci refuse.
//
// LA SOUPAPE — bornée, datée, auto-péremptoire (`scripts/modules-en-attente.md`).
// Un module écrit à un incrément et consommé au suivant est LÉGITIME : c'est même
// le cas normal du TDD que le pipeline impose (09 §3-2, « tests écrits AVANT »). Un
// refus brutal bloquerait le travail réel, et un garde qui bloque à tort finit
// désactivé — ce qui est pire que pas de garde. La soupape suit donc l'idiome de la
// maison (`CLAUDE.md` §6 : « un registre, un plafond et un arbitre ») : chaque
// module en attente porte **l'incrément qui le consommera**, une date et une
// justification d'une ligne. Le registre est REFUSÉ s'il ment (module inexistant),
// s'il dort (entrée périmée par la date) ou s'il enfle (plafond). Une entrée dont le
// module est ENFIN consommé fait ÉCHOUER le contrôle : la soupape se referme d'elle-
// même au lieu de dormir. Pourquoi ni `DECISIONS.md` ni `AMELIORATIONS.md` : le
// premier est **append-only** (§7) et ne peut pas héberger une liste qui doit
// RÉTRÉCIR — une soupape qu'on ne peut pas retirer n'est pas une soupape ; le second
// est un registre de FICHES arbitrées (étage 1 / étage 2), et un module en attente
// de branchement n'est ni une amélioration ni une demande d'arbitrage.
//
// CE QUE CE CONTRÔLE NE VOIT PAS — la liste est en §ANGLES MORTS, plus bas, et elle
// est imprimée par `--angles-morts`. Un garde honnête sur sa portée vaut infiniment
// mieux qu'un garde qui rassure.
//
// Traçabilité : E36, E43, E47 · CLAUDE.md §4 étape 6 (code → exigences),
// DoD transverse (« aucun TODO/FIXME sans entrée DECISIONS.md ou AMELIORATIONS.md »).
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, extname } from 'node:path';

// Couleurs ANSI. L'octet ESC vient d'un APPEL DE FONCTION, jamais d'une séquence
// d'échappement écrite à la main : l'outillage d'édition de la chaîne d'agents la
// convertit en OCTET RÉEL à l'écriture, et un octet de contrôle dans une source la
// rend invisible aux `grep` des étapes 3, 4 et 6 du pipeline (mesuré le 2026-09-04 ;
// garde `scripts/check-octets-controle.mjs`).
const ESC = String.fromCharCode(27);
const ROUGE = `${ESC}[31m`;
const VERT = `${ESC}[32m`;
const RAZ = `${ESC}[0m`;

const RACINE = resolve(import.meta.dirname, '..');
const REGISTRE = 'scripts/modules-en-attente.md';

// Plafond et péremption de la soupape. Le budget de Phase 1 est de 26 j-h : une
// entrée qui survit deux semaines a dépassé la durée de plusieurs incréments, et
// six modules en attente simultanée ne sont plus une soupape mais une décharge.
const PLAFOND_ENTREES = 5;
const PEREMPTION_JOURS = 14;

// --- Arguments ---------------------------------------------------------------
const argv = process.argv.slice(2);
const iRef = argv.indexOf('--ref');
const REF = iRef >= 0 ? argv[iRef + 1] : null;
const ANGLES_MORTS_SEULS = argv.includes('--angles-morts');

const ANGLES_MORTS = `${ROUGE}CE QUE CE CONTRÔLE NE VOIT PAS${RAZ}
  1. Import dynamique NON LITTÉRAL : \`await import(chemin)\` où le spécificateur est
     une variable, une concaténation ou un gabarit. Seules les chaînes littérales
     sont résolues. Un module atteint uniquement ainsi sera déclaré ORPHELIN
     (faux positif) — la soupape est là pour ça, avec sa justification.
  2. Module atteint UNIQUEMENT PAR CONFIGURATION externe au dépôt : variable
     d'environnement, chemin construit à l'exécution, chargement par convention d'un
     cadre. Rien dans le code ne le désigne, donc rien ne le rattache.
  3. Réflexion et méta-programmation : \`createRequire\`, \`Function('import…')\`,
     registre de greffons construit à chaud.
  4. Import de NAMESPACE sur un baril : \`import * as s from '@axion/shared'\`
     crédite TOUS les modules du baril, sans distinguer lesquels servent vraiment.
     C'est un choix CONSERVATEUR (il génère des faux NÉGATIFS, jamais de faux
     positifs) : un garde qui accuse à tort finit désactivé.
  5. Symboles de TYPE uniquement structurels : un type consommé par inférence sans
     être nommé à l'import n'est pas vu comme une consommation.
  6. Granularité MODULE, pas SYMBOLE (hors barils) : un module importé pour une seule
     de ses dix fonctions est « atteint ». Les neuf autres sont du code mort que ce
     contrôle ne voit pas. \`noUnusedLocals\` couvre le local, pas l'exporté.
  7. Cycles : deux modules qui ne sont importés QUE l'un par l'autre s'atteignent
     mutuellement et échappent au contrôle. Aucun cas dans ce dépôt à ce jour ; le
     dire vaut mieux que le découvrir.
  8. Ce que le contrôle ne PRÉTEND PAS faire : il ne vérifie pas qu'un module se
     rattache à E1-E47. Il vérifie qu'il est ATTEINT. Le rattachement à une exigence
     reste un geste de gardien — ce contrôle en retire seulement le cas le plus
     grossier, celui du module que rien n'appelle.
  9. Périmètre : \`apps/*/src/**\` et \`packages/*/src/**\` seulement. \`scripts/\`,
     \`infra/\`, \`e2e/\`, \`apps/*/tests/\` et les \`.mjs\` d'outillage ne sont pas des
     candidats — ils ont leurs propres garde-fous (\`check-test-projects\` pour les
     tests) ou sont des points d'entrée par nature.
 10. Fichiers NON SUIVIS par git : ils ne sont pas EXAMINÉS (un module non suivi
     n'est jamais candidat), exactement comme dans \`check-test-projects\` (dont le
     contrôle 5 refuse déjà ce cas pour les tests). Ils sont en revanche
     parfaitement VISIBLES comme CIBLES : c'est tout l'objet du contrôle 1.
 11. Le contrôle 1 ne suit pas les alias \`paths\` d'un \`tsconfig\` — ce dépôt n'en
     déclare AUCUN (vérifié). Le jour où il en déclarerait, un import par alias
     serait pris pour une dépendance externe et ignoré (faux NÉGATIF, jamais un
     faux positif). À reprendre ici ce jour-là.
 12. Le contrôle 1 lit la carte \`exports\` d'un paquet de l'espace de travail, y
     compris les motifs \`./*\`, mais pas les conditions d'environnement
     (\`node\` vs \`browser\`) : il accepte la PREMIÈRE cible qui existe. C'est
     volontairement permissif — l'inverse accuserait à tort.

 ── CE QUE L'AUTOMATE LEXICAL NE DISTINGUE PAS ────────────────────────────────
 Ces quatre-là sont NÉS du défaut \`routes.ts\` (2026-08-29). L'analyse des
 commentaires est désormais un automate à états et non deux expressions
 régulières — mais un automate LEXICAL n'est pas un analyseur SYNTAXIQUE.

 13. EXPRESSION RÉGULIÈRE vs DIVISION : après \`)\`, \`]\` ou \`}\`, un \`/\` est tenu
     pour une division. \`if (x) /motif/.test(y)\` est donc lu comme du code, et si
     ce « code » contenait \`//\` ou \`/*\`, le blanchiment déraperait. C'est
     l'ambiguïté que même les vrais analyseurs tranchent par la grammaire, pas par
     le lexique. Aucune forme de ce genre dans ce dépôt à ce jour.
 14. TEXTE JSX hors accolades : \`<p>voir // ici</p>\`. Dans le corps d'un composant
     l'automate est en état CODE, donc ce \`//\` ouvre un commentaire de ligne et
     blanchit la fin de la ligne. Sans conséquence tant que les \`import\` vivent en
     TÊTE de fichier — ce qui est le cas ici, et n'est pas une loi.
 15. CHAÎNE NON TERMINÉE ou EXPRESSION RÉGULIÈRE MULTILIGNE : l'automate revient en
     état CODE au premier retour à la ligne, par robustesse. Sur un fichier
     syntaxiquement invalide son découpage n'a aucune garantie — mais un tel
     fichier ne compile pas, et \`typecheck\` le voit avant ce contrôle.
 16. L'automate ne s'applique QU'AUX fichiers de code (\`.ts .tsx .mts .cts .js
     .mjs .cjs .jsx\`). \`package.json\`, \`index.html\` et \`Dockerfile\` sont lus par
     des analyses étroites et dédiées, chacune avec sa propre naïveté : les
     commentaires \`#\` d'un Dockerfile sont retirés, ceux d'un YAML ne le sont pas
     — faute d'être ici une source de points d'entrée.
`;

if (ANGLES_MORTS_SEULS) {
  console.log(ANGLES_MORTS);
  process.exit(0);
}

// --- Lecture du dépôt : arbre de travail, ou n'importe quel commit (--ref) ----
//
// `--ref` existe pour une raison précise : ce garde-fou doit pouvoir être REJOUÉ sur
// le commit qui l'a fait naître, et un dépôt où cinq agents travaillent en parallèle
// interdit tout `git checkout`. `git ls-tree` + `git show` lisent un commit sans
// toucher à l'arbre de travail.
function fichiersSuivis() {
  const args = REF ? ['ls-tree', '-r', '--name-only', REF] : ['ls-files'];
  return execFileSync('git', args, { encoding: 'utf8', cwd: RACINE, maxBuffer: 32e6 })
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f !== '');
}

// En mode `--ref`, chaque lecture est un `git show` — donc un PROCESSUS. La
// résolution relit le `package.json` d'un paquet à chaque spécificateur `@axion/*`,
// ce qui faisait passer le contrôle de 2 s à plusieurs minutes sur Windows. Le cache
// ne change aucun verdict : un commit est immuable, et l'arbre de travail n'est pas
// modifié pendant l'exécution.
const cacheLecture = new Map();

function lire(chemin, silencieux = false) {
  const enCache = cacheLecture.get(chemin);
  if (enCache !== undefined) return enCache;
  const contenu = lireSansCache(chemin, silencieux);
  cacheLecture.set(chemin, contenu);
  return contenu;
}

function lireSansCache(chemin, silencieux) {
  if (REF) {
    return execFileSync('git', ['show', `${REF}:${chemin}`], {
      encoding: 'utf8',
      cwd: RACINE,
      maxBuffer: 32e6,
      // Un fichier absent du commit est une réponse VALIDE (le registre, par
      // exemple, n'existait pas avant ce contrôle) : pas de bruit sur stderr.
      stdio: silencieux ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe'],
    });
  }
  return readFileSync(resolve(RACINE, chemin), 'utf8');
}

// --- Outils de chemin (POSIX : `git ls-files` ne rend que des `/`) ------------
function normaliser(chemin) {
  const morceaux = [];
  for (const m of chemin.split('/')) {
    if (m === '' || m === '.') continue;
    if (m === '..') morceaux.pop();
    else morceaux.push(m);
  }
  return morceaux.join('/');
}

const joindre = (base, rel) => normaliser(`${base}/${rel}`);

// --- Élimination des commentaires --------------------------------------------
//
// PIÈGE DÉJÀ REFERMÉ SUR `check-test-projects` : un contrôle satisfait par de la
// prose est précisément ce que ce dépôt refuse partout ailleurs. Un `import`
// COMMENTÉ — ou cité dans un en-tête d'explication, ce que ce dépôt fait beaucoup —
// ne doit jamais compter comme une consommation. Ici l'enjeu est direct : sans cette
// passe, il suffirait d'écrire `// import './mon-module.js'` pour blanchir un
// orphelin.
// Les commentaires sont BLANCHIS caractère par caractère, jamais supprimés : les
// retours à la ligne ET les colonnes survivent, ce qui permet de nommer
// `fichier:ligne` dans les messages — un garde-fou dont on ne peut pas trouver la
// cause en un clic se fait contourner.
//
// ┌───────────────────────────────────────────────────────────────────────────────┐
// │ DÉFAUT CRITIQUE, TROUVÉ PAR L'AGENT DU LOT L2 LE 2026-08-29, AVEC CETTE        │
// │ FONCTION MÊME. La première version enchaînait deux expressions régulières :    │
// │     .replace(/\/\*[\s\S]*?\*\//g, …)   puis   .replace(/(^|[^:])\/\/.*$/gm, …) │
// │ Le bloc était donc traité AVANT la ligne. Or `apps/api/src/domaines/auth/      │
// │ routes.ts:9` contient `/v1/auth/*` DANS UN COMMENTAIRE `//`. La sous-chaîne    │
// │ `/*` y ouvrait un FAUX bloc, refermé sur le `*/` du premier JSDoc — trente     │
// │ lignes plus bas, PAR-DESSUS TOUT LE BLOC D'IMPORTS. Sur ce fichier, la         │
// │ fonction voyait **0 import sur 4**.                                            │
// │                                                                                │
// │ CE N'ÉTAIT PAS UN FAUX POSITIF, C'ÉTAIT UNE CÉCITÉ. Le contrôle 2 accusait à   │
// │ tort deux modules (bruit, visible). Mais le contrôle 1 — LE PENDU — devenait   │
// │ AVEUGLE sur le même chemin : n'importe quel import vers une cible inconnue de  │
// │ git, placé après un commentaire de ce genre, passait EN SILENCE ET AU VERT.    │
// │ C'est-à-dire exactement le défaut que ce fichier existe pour attraper, et      │
// │ exactement celui qui a rendu la branche non constructible cette nuit-là. Un    │
// │ garde-fou aveugle sur son propre cas d'usage est la forme la plus aboutie du   │
// │ défaut que ce dépôt traque.                                                    │
// │                                                                                │
// │ POURQUOI RÉORDONNER LES DEUX `replace` NE CORRIGE RIEN — vérifié, pas supposé :│
// │ traiter la ligne d'abord casse `/* voir //note */`, dont le `//` mangerait la  │
// │ fin du bloc. Aucun ORDRE ne marche, parce qu'aucun MOTIF ne peut décider si    │
// │ `/*` ouvre un bloc sans savoir s'il est déjà dans un commentaire de ligne, une │
// │ chaîne, un gabarit ou une expression régulière. **C'est un automate, pas un    │
// │ motif** — et c'est ce que fait la fonction ci-dessous.                         │
// └───────────────────────────────────────────────────────────────────────────────┘
//
// Les chaînes et gabarits sont CONSERVÉS tels quels : les spécificateurs d'import
// SONT des chaînes. On ne blanchit que ce qui est réellement un commentaire.
const CODE = 0;
const LIGNE = 1;
const BLOC = 2;
const SIMPLE = 3;
const DOUBLE = 4;
const GABARIT = 5;
const EXPREG = 6;

// Un `/` ouvre une expression régulière plutôt qu'une division si le dernier
// caractère utile ne peut pas terminer une expression. Heuristique standard : elle
// ne se trompe que sur des formes qu'aucun `import` n'emprunte (voir angle mort 15).
const MOTS_CLES_AVANT_REGEX = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'throw',
]);

function ouvreUneExpressionReguliere(source, i, dernierUtile) {
  if (dernierUtile === '') return true;
  if (')]}'.includes(dernierUtile)) return false;
  if (/[A-Za-z0-9_$]/.test(dernierUtile)) {
    const mot = /([A-Za-z_$][\w$]*)\s*$/.exec(source.slice(0, i))?.[1];
    return mot !== undefined && MOTS_CLES_AVANT_REGEX.has(mot);
  }
  return true;
}

/**
 * Rend `{ texte, enCode }` :
 *  · `texte`  — la source, commentaires blanchis, chaînes INTACTES (un
 *               spécificateur d'import EST une chaîne : la blanchir perdrait la
 *               seule information cherchée).
 *  · `enCode` — un drapeau par caractère : 1 si ce caractère est du CODE, 0 s'il
 *               est dans un commentaire, une chaîne, un gabarit ou une expression
 *               régulière.
 *
 * `enCode` ferme le dernier voisin du défaut `routes.ts`, mesuré au passage :
 * une CHAÎNE qui contient du texte ressemblant à un import. Les chaînes étant
 * conservées, `"corrige ainsi : import { x } from './fantome.js'"` était lue comme
 * un import réel — donc DEUX faux positifs de pendu sur un dépôt-témoin, et le
 * genre de phrase que ce garde-fou imprime lui-même dans ses propres messages
 * d'erreur. On exige désormais que le MOT-CLÉ (`import`/`export`/`require`) soit en
 * état CODE ; le spécificateur, lui, reste bien entendu dans sa chaîne.
 */
function analyser(source) {
  const sortie = source.split('');
  const enCode = new Uint8Array(source.length);
  const blanchir = (i) => {
    if (sortie[i] !== '\n') sortie[i] = ' ';
  };

  let etat = CODE;
  let dernierUtile = '';
  let echappe = false;
  let dansClasse = false; // `[…]` d'une expression régulière : un `/` n'y ferme rien
  let profondeur = 0; // accolades du fragment de code courant
  const pileGabarits = []; // profondeurs sauvegardées par chaque `${`

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const d = source[i + 1];
    if (etat === CODE) enCode[i] = 1;

    if (etat === LIGNE) {
      if (c === '\n') etat = CODE;
      else blanchir(i);
      continue;
    }
    if (etat === BLOC) {
      blanchir(i);
      if (c === '*' && d === '/') {
        blanchir(i + 1);
        i += 1;
        etat = CODE;
      }
      continue;
    }
    if (etat === SIMPLE || etat === DOUBLE) {
      if (echappe) echappe = false;
      else if (c === '\\') echappe = true;
      else if ((etat === SIMPLE && c === "'") || (etat === DOUBLE && c === '"')) etat = CODE;
      else if (c === '\n') etat = CODE; // chaîne non terminée : on ne s'entête pas
      continue;
    }
    if (etat === GABARIT) {
      if (echappe) echappe = false;
      else if (c === '\\') echappe = true;
      else if (c === '`') etat = CODE;
      else if (c === '$' && d === '{') {
        pileGabarits.push(profondeur);
        profondeur = 0;
        etat = CODE;
        i += 1;
      }
      continue;
    }
    if (etat === EXPREG) {
      if (echappe) echappe = false;
      else if (c === '\\') echappe = true;
      else if (c === '[') dansClasse = true;
      else if (c === ']') dansClasse = false;
      else if (c === '/' && !dansClasse) etat = CODE;
      else if (c === '\n') etat = CODE; // jamais multiligne : garde-fou de robustesse
      continue;
    }

    // --- état CODE ---
    if (c === '/' && d === '/') {
      blanchir(i);
      blanchir(i + 1);
      i += 1;
      etat = LIGNE;
      continue;
    }
    if (c === '/' && d === '*') {
      blanchir(i);
      blanchir(i + 1);
      i += 1;
      etat = BLOC;
      continue;
    }
    if (c === "'") etat = SIMPLE;
    else if (c === '"') etat = DOUBLE;
    else if (c === '`') etat = GABARIT;
    else if (c === '/' && ouvreUneExpressionReguliere(source, i, dernierUtile)) {
      etat = EXPREG;
      dansClasse = false;
    } else if (c === '{') profondeur += 1;
    else if (c === '}') {
      if (profondeur === 0 && pileGabarits.length > 0) {
        profondeur = pileGabarits.pop() ?? 0;
        etat = GABARIT;
      } else if (profondeur > 0) profondeur -= 1;
    }
    if (!/\s/.test(c)) dernierUtile = c;
  }

  return { texte: sortie.join(''), enCode };
}

/** Raccourci pour les usages qui n'ont besoin que du texte blanchi. */
const sansCommentaires = (source) => analyser(source).texte;

// --- Univers des fichiers -----------------------------------------------------
const suivis = fichiersSuivis();
const ensembleSuivis = new Set(suivis);

const EXT_MODULE = new Set(['.ts', '.tsx', '.mts', '.cts']);
const EXT_CODE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx']);

const estTest = (f) => /\.(test|spec|e2e)\.[cm]?[jt]sx?$/.test(f);
const estDeclaration = (f) => f.endsWith('.d.ts');
const estBaril = (f) => /(^|\/)index\.[cm]?tsx?$/.test(f);
const estSource = (f) => /^(apps|packages)\/[^/]+\/src\//.test(f);

/** Les modules soumis au contrôle. */
const candidats = suivis.filter(
  (f) => estSource(f) && EXT_MODULE.has(extname(f)) && !estTest(f) && !estDeclaration(f),
);

if (candidats.length === 0) {
  console.error(
    `${ROUGE}✗ aucun module candidat sous apps/*/src ou packages/*/src.${RAZ}\n` +
      "  Le contrôle serait sans objet : c'est soit une erreur de périmètre, soit un\n" +
      '  dépôt vide. Dans les deux cas il ne doit pas rendre un vert rassurant.\n',
  );
  process.exit(1);
}

// --- Résolution d'un spécificateur vers un fichier suivi ----------------------
//
// Le dépôt est en ESM strict (`verbatimModuleSyntax`, `moduleResolution: Bundler`) :
// les imports relatifs portent l'extension `.js` de la SORTIE, jamais `.ts`. La
// résolution refait donc le chemin inverse — et la même bascule `dist/ → src/` sert
// aux points d'entrée déclarés dans les `package.json` (`node dist/server.js`).
function variantes(base) {
  const formes = new Set();
  const ajouter = (p) => {
    if (p) formes.add(normaliser(p));
  };
  const cascade = (b) => {
    ajouter(b);
    ajouter(b.replace(/\.js$/, '.ts'));
    ajouter(b.replace(/\.js$/, '.tsx'));
    ajouter(b.replace(/\.jsx$/, '.tsx'));
    ajouter(b.replace(/\.mjs$/, '.mts'));
    ajouter(b.replace(/\.cjs$/, '.cts'));
    if (!extname(b)) {
      for (const e of ['.ts', '.tsx', '.mts', '.cts']) ajouter(`${b}${e}`);
      for (const e of ['.ts', '.tsx']) ajouter(`${b}/index${e}`);
    }
  };
  cascade(base);
  if (base.includes('/dist/')) cascade(base.replace('/dist/', '/src/'));
  return [...formes];
}

const resoudreChemin = (base) => variantes(base).find((v) => ensembleSuivis.has(v)) ?? null;

/** Les paquets de l'espace de travail : nom npm → répertoire. */
const paquets = new Map();
for (const f of suivis) {
  if (!/^(apps|packages)\/[^/]+\/package\.json$/.test(f)) continue;
  try {
    const json = JSON.parse(lire(f));
    if (typeof json.name === 'string') paquets.set(json.name, dirname(f));
  } catch {
    console.error(
      `${ROUGE}✗ ${f} est illisible en JSON — le contrôle ne peut pas le résoudre.${RAZ}`,
    );
    process.exit(1);
  }
}

/** Toutes les cibles d'un `exports`/`main`/`bin` (feuilles chaînes du JSON). */
function feuillesChaines(valeur, sortie = []) {
  if (typeof valeur === 'string') sortie.push(valeur);
  else if (Array.isArray(valeur)) for (const v of valeur) feuillesChaines(v, sortie);
  else if (valeur && typeof valeur === 'object')
    for (const v of Object.values(valeur)) feuillesChaines(v, sortie);
  return sortie;
}

/**
 * Résout un spécificateur d'import.
 * Rend `{ cible, interne }` : `interne` dit que le spécificateur DÉSIGNE ce dépôt
 * (chemin relatif ou paquet de l'espace de travail) — c'est lui qui distingue une
 * dépendance externe non résolue (normal, hors périmètre) d'un PENDU (grave).
 */
function resoudreSpecificateur(spec, depuis) {
  // Suffixes d'empaqueteur (`?worker`, `?url`, `?raw`) : Vite les ajoute au chemin.
  const nu = (spec.split('?')[0] ?? spec).trim();
  if (nu === '') return { cible: null, interne: false };
  if (nu.startsWith('.')) {
    return { cible: resoudreChemin(joindre(dirname(depuis), nu)), interne: true };
  }
  for (const [nom, rep] of paquets) {
    if (nu !== nom && !nu.startsWith(`${nom}/`)) continue;
    const sousChemin = nu.slice(nom.length).replace(/^\//, '');
    const json = JSON.parse(lire(`${rep}/package.json`));
    const cle = sousChemin === '' ? '.' : `./${sousChemin}`;
    const exports = json.exports;

    // LA CARTE `exports` D'ABORD, le chemin direct ensuite. Sauter cette étape a
    // produit le PREMIER faux positif mesuré de ce contrôle :
    // `import '@axion/ui/tokens.css'` était déclaré PENDU parce que la
    // concaténation naïve donne `packages/ui/tokens.css`, alors que
    // `packages/ui/package.json` publie `"./tokens.css": "./src/tokens.css"`.
    // Un garde qui accuse à tort finit désactivé : la carte fait foi.
    if (exports && typeof exports === 'object' && !Array.isArray(exports)) {
      const candidatsExports = [];
      if (Object.prototype.hasOwnProperty.call(exports, cle)) {
        candidatsExports.push(...feuillesChaines(exports[cle]));
      }
      for (const [motif, valeur] of Object.entries(exports)) {
        if (!motif.includes('*')) continue;
        const re = new RegExp(
          `^${motif
            .split('*')
            .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('(.*)')}$`,
        );
        const capture = re.exec(cle)?.[1];
        if (capture === undefined) continue;
        for (const c of feuillesChaines(valeur)) candidatsExports.push(c.replace('*', capture));
      }
      for (const cible of candidatsExports) {
        const trouve = resoudreChemin(joindre(rep, cible));
        if (trouve) return { cible: trouve, interne: true };
      }
    }
    if (sousChemin !== '') return { cible: resoudreChemin(`${rep}/${sousChemin}`), interne: true };
    // Entrée principale du paquet : lue dans son `package.json`, jamais devinée.
    for (const cible of feuillesChaines(json.main ?? './src/index.ts')) {
      const trouve = resoudreChemin(joindre(rep, cible));
      if (trouve) return { cible: trouve, interne: true };
    }
    return { cible: null, interne: true };
  }
  return { cible: null, interne: false }; // dépendance externe : hors périmètre
}

// --- Relevé des références ----------------------------------------------------
/** module → [{ de, transit, test }] */
const references = new Map(candidats.map((c) => [c, []]));
/** baril → { noms:Set<string>, namespace:boolean } effectivement importés ailleurs */
const consommationBaril = new Map();
const pointsDentree = new Map(); // module → raison

const ajouterReference = (cible, arete) => {
  const liste = references.get(cible);
  if (liste) liste.push(arete);
};

/** Noms cités dans la clause d'un import (`{ a, b as c }`, `* as ns`, défaut). */
function nomsDeClause(clause) {
  const noms = new Set();
  let namespace = false;
  if (/\*\s+as\s+/.test(clause)) namespace = true;
  const accolades = /\{([\s\S]*?)\}/.exec(clause);
  if (accolades?.[1]) {
    for (const brut of accolades[1].split(',')) {
      const morceau = brut.trim().replace(/^type\s+/, '');
      if (morceau === '') continue;
      noms.add((morceau.split(/\s+as\s+/)[0] ?? morceau).trim());
    }
  }
  return { noms, namespace };
}

// Un `import`/`export … from '…'`, un import d'effet de bord, un `import()` ou un
// `require()` littéral. Le corps de clause interdit `;` et les guillemets pour ne
// pas franchir la fin d'une instruction.
const DEPUIS = /\b(import|export)\b([^;'"]*?)\bfrom\s*['"]([^'"]+)['"]/g;
const EFFET_DE_BORD = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIQUE = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Imports internes que git ne connaît pas — voir le contrôle 1, plus bas. */
const pendus = [];

for (const fichier of suivis) {
  if (!EXT_CODE.has(extname(fichier))) continue;
  let texte;
  let enCode;
  try {
    ({ texte, enCode } = analyser(lire(fichier)));
  } catch {
    continue; // fichier binaire ou illisible : rien à en tirer
  }
  const test = estTest(fichier) || /(^|\/)tests?\//.test(fichier) || fichier.startsWith('e2e/');
  const ligneDe = (index) => texte.slice(0, index).split('\n').length;

  const noter = (spec, clause, motCle, index) => {
    // Le MOT-CLÉ doit être du code. Sans cette garde, une chaîne de documentation
    // — « corrige ainsi : import { x } from './fantome.js' » — est lue comme un
    // import réel, et le contrôle 1 accuse un pendu qui n'existe pas.
    if (enCode[index] !== 1) return;
    const { cible, interne } = resoudreSpecificateur(spec, fichier);
    if (!cible) {
      // PENDU : le spécificateur désigne CE dépôt, et git ne connaît pas la cible.
      if (interne) pendus.push({ de: fichier, spec, ligne: ligneDe(index) });
      return;
    }
    if (cible === fichier) return;
    // Un `export … from` dans un BARIL est un TRANSIT, pas une consommation : sans
    // cette distinction, `packages/shared/src/index.ts` (qui ré-exporte tout)
    // rendrait indétectable n'importe quel module inutilisé du paquet — et c'est
    // exactement le cas de `pagination.ts`, connu sans consommateur.
    const transit = motCle === 'export' && estBaril(fichier);
    ajouterReference(cible, { de: fichier, transit, test });
    if (transit) return;
    if (clause !== null) {
      const { noms, namespace } = nomsDeClause(clause);
      const etat = consommationBaril.get(cible) ?? { noms: new Set(), namespace: false };
      for (const n of noms) etat.noms.add(n);
      etat.namespace = etat.namespace || namespace;
      consommationBaril.set(cible, etat);
    }
  };

  for (const m of texte.matchAll(DEPUIS)) noter(m[3] ?? '', m[2] ?? '', m[1], m.index ?? 0);
  for (const m of texte.matchAll(EFFET_DE_BORD)) noter(m[1] ?? '', null, 'import', m.index ?? 0);
  for (const m of texte.matchAll(DYNAMIQUE)) noter(m[1] ?? '', null, 'import', m.index ?? 0);
}

// --- CONTRÔLE 1 : LE PENDU — un import que git ne connaît pas -----------------
//
// LE DÉFAUT RÉEL, mesuré le 2026-08-29 sur `lot/l0-infra`. Le commit `b24b98c` a
// emporté dans `apps/api/src/app.ts` la ligne
//     import { routesAuth } from './domaines/auth/routes.js';
// alors que `apps/api/src/domaines/` **n'était pas suivi par git** :
//     $ git cat-file -e origin/lot/l0-infra:apps/api/src/domaines/auth/routes.ts
//     fatal: path … exists on disk, but not in 'origin/lot/l0-infra'
// `origin` référençait donc un fichier absent du dépôt : un clone frais échoue en
// TS2307 et le staging n'est PAS déployable. C'est un agent d'infrastructure qui
// l'a découvert **en tentant un déploiement**.
//
// C'EST LE MÊME GRAPHE QUE L'ORPHELIN, LU DANS L'AUTRE SENS — orphelin : personne
// ne m'importe ; pendu : j'importe ce qui n'existe pas. D'où un seul script : deux
// détecteurs partageant la même résolution de modules ne peuvent pas diverger, et
// c'est par l'écart entre deux copies qu'un défaut passerait (l'argument est déjà
// écrit dans `.github/workflows/ci.yml` à propos de `check:no-skipped-tests`).
//
// LE PIÈGE DE CONCEPTION, ET TOUT L'INTÉRÊT DU CONTRÔLE. Ce défaut a franchi un
// hook de pré-commit qui lance `typecheck`, AU VERT : `tsc` examine l'ARBRE DE
// TRAVAIL, qui possède le fichier ; l'index, non. Un contrôle qui vérifierait que
// le fichier « existe » (`existsSync`) reproduirait EXACTEMENT cet angle mort.
// **La question posée ici est « ce chemin est-il connu de git ? », jamais « ce
// fichier existe-t-il ? »** — toute la résolution passe par `git ls-files` (ou
// `git ls-tree` avec `--ref`), et rien d'autre. Le disque n'est consulté que pour
// RÉDIGER le message (dire « fais `git add` » plutôt que « le fichier manque ») ;
// il n'entre JAMAIS dans la décision. Que personne ne « simplifie » ceci plus tard.
//
// AUCUNE SOUPAPE, et c'est délibéré. L'orphelin est du code inutile : gênant,
// refusé à l'étape 6, mais inoffensif — il peut légitimement attendre son
// consommateur, d'où le registre. Le pendu CASSE LA BRANCHE POUR TOUT LE MONDE et
// bloque tout déploiement. Il n'existe aucune raison valable de commiter un import
// vers un fichier absent du dépôt. Refus sec.
if (pendus.length > 0) {
  console.error(
    `${ROUGE}✗ ${String(pendus.length)} IMPORT(S) VERS UN FICHIER QUE GIT NE CONNAÎT PAS${RAZ}\n`,
  );
  for (const p of pendus) {
    // `existsSync` ne DÉCIDE de rien : il choisit seulement le remède à imprimer.
    const surLeDisque =
      !REF && p.spec.startsWith('.')
        ? variantes(joindre(dirname(p.de), p.spec.split('?')[0] ?? p.spec)).find((v) =>
            existsSync(resolve(RACINE, v)),
          )
        : null;
    console.error(`  ${p.de}:${String(p.ligne)}  →  ${p.spec}`);
    console.error(
      surLeDisque
        ? `      le fichier EXISTE sur ce disque (${surLeDisque}) mais n'est PAS suivi par git.\n` +
            '      → `git add` sur ce fichier SUFFIT. Aucun commit n’est requis : un agent soumis\n' +
            '        à la règle de croisement (09 §5.6) peut indexer sans commiter.'
        : "      aucune cible connue de git, et aucune sur le disque : l'import est faux.",
    );
  }
  console.error(
    '\n  Un `import` commité vers un chemin absent du dépôt rend la branche INSTALLABLE\n' +
      "  NULLE PART : un clone frais échoue en TS2307, la CI échoue à l'étape de\n" +
      '  construction, et le staging cesse d’être déployable. Le défaut réel (`b24b98c`,\n' +
      '  `apps/api/src/domaines/`) a été trouvé par un agent qui TENTAIT un déploiement,\n' +
      '  après être passé au VERT sous un `typecheck` de pré-commit — `tsc` lit le disque,\n' +
      "  pas l'index. Ce contrôle ne pose qu'une question : **git connaît-il ce chemin ?**\n\n" +
      '  Il n’y a pas de soupape pour ce cas, à la différence du code orphelin : un\n' +
      '  module qui attend son consommateur est un état transitoire légitime, un import\n' +
      '  vers rien ne l’est jamais.\n',
  );
}

// --- Points d'entrée déclarés -------------------------------------------------
//
// Un point d'entrée n'est atteint par AUCUN import : c'est le processus, le
// navigateur ou l'empaqueteur qui l'appelle. On ne les DEVINE pas par leur nom
// (`main.tsx`, `server.ts`) — on les lit là où ils sont DÉCLARÉS : `package.json`
// (`exports`, `main`, `bin`, et les commandes `scripts`) et les `index.html`.
for (const [, rep] of paquets) {
  const json = JSON.parse(lire(`${rep}/package.json`));
  for (const cible of feuillesChaines(json.exports ?? json.main ?? null)) {
    const r = resoudreChemin(joindre(rep, cible));
    if (r) pointsDentree.set(r, `${rep}/package.json (exports/main)`);
  }
  for (const cible of feuillesChaines(json.bin ?? null)) {
    const r = resoudreChemin(joindre(rep, cible));
    if (r) pointsDentree.set(r, `${rep}/package.json (bin)`);
  }
  for (const commande of feuillesChaines(json.scripts ?? null)) {
    for (const jeton of commande.match(/(?:\.{1,2}\/)*[\w./@-]+\.[cm]?js/g) ?? []) {
      const r = resoudreChemin(joindre(rep, jeton));
      if (r) pointsDentree.set(r, `${rep}/package.json (scripts)`);
    }
  }
}
// Les Dockerfiles déclarent des points d'entrée que RIEN n'importe : `CMD`,
// `ENTRYPOINT` et surtout `HEALTHCHECK`. C'est le cas réel de
// `apps/worker/src/sonde-sante.ts`, lancée toutes les 15 s par
// `HEALTHCHECK CMD ["node","dist/sonde-sante.js"]` — un module vivant, exécuté en
// production, et que la première version de ce contrôle accusait d'être orphelin.
// **Seules ces trois instructions sont lues, et les commentaires `#` sont retirés
// d'abord** : le même Dockerfile CITE `sonde-sante.ts` dans quatre commentaires
// explicatifs, et un contrôle que de la prose satisfait ne contrôle rien.
for (const dockerfile of suivis.filter((f) => /(^|\/)Dockerfile[^/]*$/.test(f))) {
  const texte = lire(dockerfile).replace(/^\s*#.*$/gm, '');
  for (const m of texte.matchAll(/^\s*(?:CMD|ENTRYPOINT|HEALTHCHECK)\b(.*)$/gim)) {
    for (const jeton of (m[1] ?? '').match(/(?:\.{1,2}\/)*[\w./@-]+\.[cm]?js/g) ?? []) {
      const r = resoudreChemin(joindre(dirname(dockerfile), jeton)) ?? resoudreChemin(jeton);
      if (r) pointsDentree.set(r, `${dockerfile} (CMD/ENTRYPOINT/HEALTHCHECK)`);
    }
  }
}
for (const html of suivis.filter((f) => f.endsWith('.html'))) {
  for (const m of lire(html).matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) {
    const src = m[1] ?? '';
    if (/^https?:/.test(src)) continue;
    // Vite sert la racine de l'app : `/src/main.tsx` comme `./src/main.tsx`
    // désignent le même fichier, relatif au répertoire de l'`index.html`.
    const r = resoudreChemin(joindre(dirname(html), src));
    if (r) pointsDentree.set(r, html);
  }
}

// --- Verdict par module -------------------------------------------------------
//
// Trois états, et le troisième est une INFORMATION, pas un verdict :
//   ORPHELIN               rien ne l'atteint (hors transit de baril) → REFUS
//   ATTEINT PAR TRANSIT    seul un baril le ré-exporte, et aucun de ses symboles
//                          n'est importé nulle part → REFUS (cas `pagination.ts`)
//   CONSOMMÉ PAR TEST SEUL  légitime sous TDD (09 §3-2) → compté, jamais refusé
function nomsExportes(module) {
  const texte = sansCommentaires(lire(module));
  const noms = new Set();
  const DECL =
    /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of texte.matchAll(DECL)) noms.add(m[1] ?? '');
  for (const m of texte.matchAll(/^\s*export\s*\{([^}]*)\}(?!\s*from)/gm)) {
    for (const brut of (m[1] ?? '').split(',')) {
      const morceau = brut.trim().replace(/^type\s+/, '');
      if (morceau === '') continue;
      const parts = morceau.split(/\s+as\s+/);
      noms.add((parts[parts.length - 1] ?? morceau).trim());
    }
  }
  return noms;
}

const orphelins = [];
const testSeul = [];

for (const module of candidats) {
  if (pointsDentree.has(module)) continue;
  const aretes = references.get(module) ?? [];
  const directes = aretes.filter((a) => !a.transit);
  if (directes.length > 0) {
    if (directes.every((a) => a.test)) testSeul.push(module);
    continue;
  }
  const transits = aretes.filter((a) => a.transit);
  if (transits.length === 0) {
    orphelins.push({ module, motif: "aucun fichier du dépôt ne l'importe" });
    continue;
  }
  // Ré-exporté par au moins un baril : un de ses symboles est-il vraiment importé ?
  const exportes = nomsExportes(module);
  const utilise = transits.some((a) => {
    const etat = consommationBaril.get(a.de);
    if (!etat) return false;
    if (etat.namespace) return true; // import de namespace : angle mort assumé n°4
    for (const n of etat.noms) if (exportes.has(n)) return true;
    return false;
  });
  if (!utilise) {
    orphelins.push({
      module,
      motif: `ré-exporté par ${transits.map((a) => a.de).join(', ')} mais aucun de ses symboles (${[...exportes].join(', ') || 'aucun export nommé'}) n'est importé`,
    });
  }
}

// --- `--details` : rendre les EXEMPTIONS visibles -----------------------------
//
// Un garde-fou dont les exemptions sont invisibles appartient à la famille de défaut
// que ce dépôt traque : il peut se taire pour de mauvaises raisons sans que personne
// le sache. `--details` imprime QUI est exempté et POURQUOI, et le nombre de
// références retenues par module. C'est la seule façon de relire ce contrôle
// autrement qu'en le croyant sur parole.
if (argv.includes('--details')) {
  console.log(`Points d'entrée exemptés (${String(pointsDentree.size)}) :`);
  for (const [module, raison] of [...pointsDentree].sort())
    console.log(`  ${module}\n      ← ${raison}`);
  console.log(`\nRéférences retenues par module (${String(candidats.length)} candidats) :`);
  for (const module of candidats) {
    const aretes = references.get(module) ?? [];
    const d = aretes.filter((a) => !a.transit);
    const t = aretes.filter((a) => a.transit);
    console.log(
      `  ${module} — ${String(d.length)} directe(s)` +
        `${d.length > 0 ? ` [${d.map((a) => (a.test ? `${a.de} (test)` : a.de)).join(', ')}]` : ''}` +
        `${t.length > 0 ? ` · transit: ${t.map((a) => a.de).join(', ')}` : ''}` +
        `${pointsDentree.has(module) ? ' · POINT D’ENTRÉE' : ''}`,
    );
  }
  console.log('');
}

// --- Le registre de la soupape ------------------------------------------------
const AUJOURDHUI = new Date();
const LIGNE_REGISTRE = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/;

function lireRegistre() {
  if (REF) {
    try {
      return lire(REGISTRE, true);
    } catch {
      return '';
    }
  }
  return existsSync(resolve(RACINE, REGISTRE))
    ? readFileSync(resolve(RACINE, REGISTRE), 'utf8')
    : '';
}

const entrees = [];
const registreMalForme = [];
for (const [i, ligne] of lireRegistre().split('\n').entries()) {
  if (!ligne.trim().startsWith('|')) continue;
  if (/^\|[\s:|-]+\|$/.test(ligne.trim())) continue; // séparateur de tableau
  const m = LIGNE_REGISTRE.exec(ligne);
  if (!m) {
    registreMalForme.push({ n: i + 1, ligne: ligne.trim(), raison: 'quatre colonnes attendues' });
    continue;
  }
  const [, module, increment, date, justification] = m;
  if (module === 'module' || /^-+$/.test(module ?? '')) continue; // en-tête
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    registreMalForme.push({
      n: i + 1,
      ligne: ligne.trim(),
      raison: 'date attendue au format AAAA-MM-JJ',
    });
    continue;
  }
  if ((increment ?? '').trim() === '' || (justification ?? '').trim().length < 15) {
    registreMalForme.push({
      n: i + 1,
      ligne: ligne.trim(),
      raison: 'incrément consommateur et justification (≥ 15 caractères) obligatoires',
    });
    continue;
  }
  entrees.push({
    module: (module ?? '').trim(),
    increment: (increment ?? '').trim(),
    date: date ?? '',
    justification: (justification ?? '').trim(),
    ligne: i + 1,
  });
}

const ensembleOrphelins = new Set(orphelins.map((o) => o.module));
const couverts = new Set();
const fautes = [];

for (const e of entrees) {
  if (!ensembleSuivis.has(e.module)) {
    fautes.push(
      `ligne ${String(e.ligne)} : \`${e.module}\` n'existe pas / n'est pas suivi par git — entrée périmée, retire-la.`,
    );
    continue;
  }
  if (!ensembleOrphelins.has(e.module)) {
    fautes.push(
      `ligne ${String(e.ligne)} : \`${e.module}\` EST désormais atteint — la soupape a fait son office, RETIRE la ligne. ` +
        `C'est le seul moyen qu'une entrée ne dorme pas.`,
    );
    continue;
  }
  const age = Math.floor((AUJOURDHUI - new Date(`${e.date}T00:00:00Z`)) / 86_400_000);
  if (!REF && age > PEREMPTION_JOURS) {
    fautes.push(
      `ligne ${String(e.ligne)} : \`${e.module}\` attend depuis ${String(age)} jours (plafond ${String(PEREMPTION_JOURS)}). ` +
        `L'incrément « ${e.increment} » ne l'a pas consommé : branche-le, supprime-le, ou fais arbitrer.`,
    );
    continue;
  }
  couverts.add(e.module);
}

if (entrees.length > PLAFOND_ENTREES) {
  fautes.push(
    `${String(entrees.length)} entrées dans ${REGISTRE} pour un plafond de ${String(PLAFOND_ENTREES)} : ` +
      `une soupape sans plafond est une décharge (CLAUDE.md §6 : « un registre, un plafond et un arbitre »).`,
  );
}

// --- Sortie -------------------------------------------------------------------
const nonCouverts = orphelins.filter((o) => !couverts.has(o.module));

if (registreMalForme.length > 0) {
  console.error(`${ROUGE}✗ ${REGISTRE} MAL FORMÉ${RAZ}\n`);
  for (const f of registreMalForme)
    console.error(`  ligne ${String(f.n)} — ${f.raison}\n    ${f.ligne}`);
  console.error(
    '\n  Format attendu, une ligne par module :\n' +
      '    | chemin/du/module.ts | incrément consommateur | AAAA-MM-JJ | pourquoi il attend |\n' +
      "  Une soupape qu'une machine ne sait pas lire n'est pas tracée : elle est décorative.\n",
  );
  process.exit(1);
}

if (nonCouverts.length > 0 || fautes.length > 0 || pendus.length > 0) {
  if (nonCouverts.length > 0) {
    console.error(`${ROUGE}✗ ${String(nonCouverts.length)} MODULE(S) QUE RIEN N'ATTEINT${RAZ}\n`);
    for (const o of nonCouverts) console.error(`  ${o.module}\n      ${o.motif}`);
    console.error(
      '\n  `CLAUDE.md` §4 étape 6 : « tout code livré se rattache à E1-E47 ou à une fiche\n' +
        "  AMELIORATIONS — **le code orphelin est REFUSÉ** ». Un module que rien n'appelle\n" +
        "  n'est prouvé par aucun test d'intégration, ne sert aucune exigence, et donne au\n" +
        "  lecteur d'un diff l'illusion qu'un travail a été fait (c'est le défaut du commit\n" +
        "  591ccbd : un module d'aide seul, un message qui annonçait quatre correctifs).\n\n" +
        '  TROIS ISSUES, dans cet ordre de préférence :\n' +
        "    1. BRANCHE-LE — c'est presque toujours la bonne : le consommateur a été oublié\n" +
        "       hors de l'index (`git status` avant de conclure).\n" +
        "    2. SUPPRIME-LE — du code que rien n'atteint ne se conserve pas « au cas où » ;\n" +
        '       git le garde.\n' +
        `    3. DÉCLARE-LE dans ${REGISTRE} s'il est légitimement en attente :\n` +
        '       | chemin/du/module.ts | incrément consommateur | AAAA-MM-JJ | pourquoi |\n' +
        `       Plafond : ${String(PLAFOND_ENTREES)} entrées, ${String(PEREMPTION_JOURS)} jours. L'entrée est REFUSÉE dès que le\n` +
        '       module est enfin consommé : la soupape se referme au lieu de dormir.\n\n' +
        '  Portée de ce contrôle : `node scripts/check-graphe-modules.mjs --angles-morts`.\n',
    );
  }
  if (fautes.length > 0) {
    console.error(`${ROUGE}✗ ${REGISTRE} — ${String(fautes.length)} entrée(s) en faute${RAZ}\n`);
    for (const f of fautes) console.error(`  ${f}`);
    console.error('');
  }
  process.exit(1);
}

const annexe =
  testSeul.length > 0
    ? `\n  Information (pas un verdict) : ${String(testSeul.length)} module(s) dont le seul consommateur` +
      ` est un test — ${testSeul.join(', ')}.\n  État normal sous TDD (09 §3-2) ; anormal s'il dure au-delà de l'incrément.`
    : '';

console.log(
  `${VERT}✓${RAZ} graphe des modules : ${String(candidats.length)} module(s) examiné(s), ` +
    `${String(pointsDentree.size)} point(s) d'entrée déclaré(s), ` +
    `${String(couverts.size)} en attente déclarée, aucun import pendu` +
    `${REF ? ` (ref ${REF})` : ''}.` +
    annexe,
);
