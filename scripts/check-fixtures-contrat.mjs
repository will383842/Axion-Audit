#!/usr/bin/env node
// =============================================================================
// GARDE — LES FIXTURES ÉCRITES À LA MAIN SUIVENT-ELLES LE CONTRAT PARTAGÉ ?
//
// ── LE DÉFAUT QUI A FAIT ÉCRIRE CE FICHIER (2026-09-06) ─────────────────────
// `e2e/accessibilite-l7b.e2e.ts` sert l'API à la place du réseau avec des corps
// littéraux, écrits à la main. Le contrat qui les juge — `agregationMissionSchema`
// dans `packages/shared` — est un `z.strictObject`, et ce paquet n'est PAS
// résolvable depuis la racine : aucun compilateur ne confronte les deux.
//
// Le jour où L7c a ajouté deux champs REQUIS au contrat (`nomRepondant`, puis
// `repondantsAffiches`), les corps ont été rejetés, l'écran a basculé en ÉTAT
// D'ERREUR — où il n'y a ni colonne, ni ligne, ni texte — et la CI a rapporté,
// deux fois de suite et vingt minutes plus tard :
//
//     ✘ « colonne Provenance introuvable » (balayage axe)
//
// Un échec qui accuse l'accessibilité d'un défaut de contrat. Le garde d'A36
// fonctionnait exactement comme il l'avait prévu — « un corps qui s'écarterait
// du contrat rendrait l'ÉTAT D'ERREUR » — mais il tombait LOIN de sa cause.
// C'est la quatrième fois en trois jours qu'un contrôle vert, ou rouge pour la
// mauvaise raison, coûte plus cher que l'erreur qu'il signale.
//
// ── CE QUE CE GARDE FAIT, ET CE QU'IL NE FAIT PAS ──────────────────────────
// Il extrait le TEXTE des déclarations dont dépend chaque fixture, le fait
// transpiler PAR TYPESCRIPT (une expression régulière s'y casse les dents : un
// type de retour peut contenir une accolade), l'évalue, et le soumet au schéma
// réel importé du `dist`. C'est donc la source du dépôt qui est jugée, jamais
// une copie — et le verdict nomme le champ fautif, en une seconde.
//
// Il ne remplace pas les tests : il dit seulement qu'un corps servi SERA ACCEPTÉ.
// Ce que l'écran en fait ensuite reste l'affaire du balayage et des assertions.
//
// ── POURQUOI PAS SIMPLEMENT TYPER LA FIXTURE ───────────────────────────────
// Parce qu'ajouter `@axion/shared` aux dépendances de la racine pour la
// commodité d'un test est une modification de dépendances — CLAUDE.md §3-1, une
// décision qui ne s'improvise pas. A36 avait déjà tranché en ce sens et son
// raisonnement tient. Ce garde obtient la même sécurité sans y toucher.
//
// AJOUTER UNE FIXTURE : une entrée dans `CONTROLES` ci-dessous. Rien d'autre.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// L'OCTET D'ÉCHAPPEMENT NE S'ÉCRIT PAS EN LITTÉRAL DANS CE DÉPÔT (garde
// `check:octets-controle`) : l’outillage d’édition de la chaîne d’agents le
// convertit en octet réel à l’écriture, si bien que le défaut se reproduit dans
// le geste même qui le corrige. Seul un APPEL DE FONCTION survit.
//
// Ce garde-là m’a attrapé pendant que j’écrivais celui-ci. C’est bon signe.
const ESC = String.fromCharCode(27);

const VERT = ESC + '[32m';
const ROUGE = ESC + '[31m';
const JAUNE = ESC + '[33m';
const FIN = ESC + '[0m';

/**
 * Chaque contrôle : un fichier, le schéma qui le juge, les déclarations à
 * extraire dans l'ordre où elles se lisent, et les fixtures à soumettre.
 *
 * `dependances` n'est pas une commodité : c'est ce qui rend l'extraction
 * HONNÊTE. Une fixture qui appelle un helper doit être évaluée avec ce helper
 * tel qu'il est écrit, sinon on juge autre chose que la source.
 */
const CONTROLES = [
  {
    fichier: 'e2e/accessibilite-l7b.e2e.ts',
    schema: 'agregationMissionSchema',
    dependances: [
      ['const', 'MISSION_ID'],
      ['const', 'UNITE_ID'],
      ['const', 'SESSION_ID'],
      ['const', 'SOURCES'],
      ['const', 'PROVENANCES'],
      ['function', 'parProvenance'],
    ],
    fixtures: ['AGREGATION', 'AGREGATION_VIDE'],
  },
];

/**
 * Découpe une déclaration de haut niveau à partir de son texte source.
 *
 * Une CONSTANTE se termine par `;` à profondeur nulle. Une FONCTION, non : son
 * accolade fermante est seule en colonne 0, et un compteur d'accolades qui
 * chercherait un `;` courrait jusqu'à la déclaration suivante et la happerait
 * au passage — le premier jet de ce script l'a fait, et a produit un « déjà
 * déclaré » incompréhensible.
 */
function extraire(source, mot, nom) {
  const debut = source.search(new RegExp(`^${mot} ${nom}\\b`, 'm'));
  if (debut < 0) return null;

  if (mot === 'function') {
    const fin = source.indexOf('\n}\n', debut);
    return fin < 0 ? null : source.slice(debut, fin + 3);
  }

  let profondeur = 0;
  let ouvert = false;
  for (let i = debut; i < source.length; i++) {
    const c = source[i];
    if (c === '{' || c === '[' || c === '(') {
      profondeur++;
      ouvert = true;
    } else if (c === '}' || c === ']' || c === ')') {
      profondeur--;
    }
    if (ouvert && profondeur === 0 && source[i + 1] === ';') return source.slice(debut, i + 2);
    if (!ouvert && c === ';') return source.slice(debut, i + 1);
  }
  return null;
}

const distPartage = resolve(RACINE, 'packages/shared/dist/index.js');
if (!existsSync(distPartage)) {
  console.error(
    `${ROUGE}✗${FIN} fixtures : \`packages/shared/dist\` est absent — ce garde lit le contrat\n` +
      '  RÉEL, pas sa source. Lance `pnpm build:packages` avant. (Ce message vaut mieux\n' +
      '  qu’un vert obtenu en ne mesurant rien.)',
  );
  process.exit(1);
}

const cheminTs = resolve(RACINE, 'node_modules/typescript/lib/typescript.js');
const ts = (await import(pathToFileURL(cheminTs).href)).default;
const partage = await import(pathToFileURL(distPartage).href);

let rejets = 0;
let controlees = 0;

for (const controle of CONTROLES) {
  const chemin = resolve(RACINE, controle.fichier);
  if (!existsSync(chemin)) {
    console.error(`${ROUGE}✗${FIN} fixtures : ${controle.fichier} est introuvable.`);
    console.error('  Un fichier déplacé ou renommé rend ce garde MUET : corrige `CONTROLES`.');
    process.exit(1);
  }

  const schema = partage[controle.schema];
  if (schema === undefined) {
    console.error(
      `${ROUGE}✗${FIN} fixtures : \`${controle.schema}\` n’est pas exporté par @axion/shared.`,
    );
    process.exit(1);
  }

  const source = readFileSync(chemin, 'utf8');
  const morceaux = [];

  for (const [mot, nom] of [
    ...controle.dependances,
    ...controle.fixtures.map((f) => ['const', f]),
  ]) {
    const bloc = extraire(source, mot, nom);
    if (bloc === null) {
      console.error(
        `${ROUGE}✗${FIN} fixtures : \`${mot} ${nom}\` est introuvable dans ${controle.fichier}.`,
      );
      console.error('  Un garde qui ne trouve pas ce qu’il cherche ne doit JAMAIS sortir vert.');
      process.exit(1);
    }
    morceaux.push(bloc);
  }

  const js = ts.transpileModule(morceaux.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  const valeurs = new Function(`${js}\nreturn { ${controle.fixtures.join(', ')} };`)();

  for (const nom of controle.fixtures) {
    controlees++;
    const verdict = schema.safeParse(valeurs[nom]);
    if (verdict.success) continue;
    rejets++;
    console.error(
      `${ROUGE}✗${FIN} ${controle.fichier} — \`${nom}\` est REJETÉ par \`${controle.schema}\` :`,
    );
    for (const souci of verdict.error.issues) {
      console.error(`    ${JAUNE}${souci.path.join('.') || '(racine)'}${FIN} — ${souci.message}`);
    }
  }
}

if (rejets > 0) {
  console.error('');
  console.error('  Ce corps sera rejeté à l’exécution, et l’écran basculera en ÉTAT D’ERREUR —');
  console.error('  où il n’y a ni colonne, ni ligne, ni texte. Les assertions du test tomberont');
  console.error('  alors sur ce qu’elles cherchaient, et non sur ce qui manque ici : c’est');
  console.error('  exactement le détour de vingt minutes que ce garde existe pour éviter.');
  console.error('');
  console.error('  Mets la fixture à jour — ne relâche PAS le schéma pour la faire passer.');
  process.exit(1);
}

console.log(
  `${VERT}✓${FIN} fixtures : ${controlees} corps littéral(aux) conforme(s) au contrat partagé.`,
);
