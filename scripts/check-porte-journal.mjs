#!/usr/bin/env node
// =============================================================================
// GARDE-FOU : `activity_log` N'A QU'UNE PORTE D'ÉCRITURE.
//
// Note de conception `docs/conception/LOT_L2.md` §2.4 : « Une seule fonction
// d'écriture, `journaliserActivite`. » Une phrase de conception n'est pas un
// garde-fou : elle vaut jusqu'au premier agent qui ne l'a pas lue. Ce script la
// transforme en refus.
//
// ── POURQUOI UN BALAYAGE, ET PAS UN TYPE ─────────────────────────────────────
// Le type ferme la porte de devant : `insererLigneJournal` est la seule fonction
// exportée qui insère, et son argument est validé par un catalogue fermé. Il ne
// ferme PAS la porte de derrière : rien, dans TypeScript, n'empêche un module
// d'importer `activityLog` et d'écrire sa propre variante. C'est exactement le
// raisonnement tenu pour l'étanchéité financière (note §2.2 : « une propriété du
// code, PROUVÉE PAR BALAYAGE, pas une règle de route ») — le type attrape ce qui
// compile, le balayage attrape le SQL brut et l'assertion que le type ne voit pas.
//
// ── LES DEUX CONTRÔLES ───────────────────────────────────────────────────────
//   C1 — ÉCRITURE : `insert/update/delete` sur le symbole Drizzle `activityLog`,
//        ou `INSERT INTO / UPDATE / DELETE FROM / TRUNCATE activity_log` en SQL.
//        Autorisé DANS UN SEUL FICHIER. Porté sur TOUS les fichiers du dépôt,
//        `.sql` et `.mjs` compris — c'est le trou nommé au point 3 de la portée de
//        `eslint.config.js` (« les fichiers .sql ne sont pas analysés par ESLint »).
//        Les `UPDATE`/`DELETE` n'ont AUCUN fichier autorisé : invariant 7, « rien
//        n'est jamais silencieusement écrasé ou supprimé ». La purge RGPD 12 mois
//        (06 §10.4) n'est pas livrée par L2 ; le jour où elle le sera, elle devra
//        s'inscrire ICI, explicitement, plutôt que d'exister sans que personne
//        l'ait décidé.
//   C2 — ATTEINTE : la table est NOMMÉE (symbole `activityLog`, ou littéral
//        `'activity_log'`) dans un fichier de `apps/api/src/` hors liste blanche.
//        Plus strict que C1 à dessein : une lecture est légitime (la console L7 en
//        aura besoin), mais elle devra alors passer par un dépôt du domaine
//        `journal`, et l'ajouter à la liste blanche est un geste VISIBLE en revue.
//
// ── CE QUE CE CONTRÔLE NE VOIT PAS ───────────────────────────────────────────
// La liste est en §ANGLES MORTS et s'imprime avec `--angles-morts`. Un garde-fou
// honnête sur sa portée vaut infiniment mieux qu'un garde-fou qui rassure : c'est
// la famille de défaut que ce dépôt traque depuis trois jours.
//
// Sortie : 0 = conforme, 1 = violation, 2 = erreur d'exécution du contrôle.
// Traçabilité : E33 (sécurité), E42 (RGPD renforcé : rétention activity_log) ·
// CLAUDE.md invariant 7 · note L2 §2.4.
// =============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');

// -----------------------------------------------------------------------------
// LES LISTES BLANCHES — courtes par construction, et c'est le but
// -----------------------------------------------------------------------------

/** LE fichier qui écrit. Un seul. En ajouter un second est le défaut qu'on traque. */
const PORTE_ECRITURE = 'apps/api/src/domaines/journal/depot.ts';

/**
 * Fichiers de `apps/api/src/` autorisés à NOMMER la table.
 *   · `db/schema.ts` la DÉFINIT (reflet des migrations, jamais leur source) ;
 *   · le dépôt du journal est la porte.
 */
const NOMMAGE_AUTORISE = new Set([PORTE_ECRITURE, 'apps/api/src/db/schema.ts']);

/**
 * Fichiers exemptés du contrôle C1 parce qu'ils PARLENT du motif au lieu de le
 * commettre — c'est la distinction que fait déjà `check-invariants.mjs` entre une
 * interdiction ÉNONCÉE et une infraction COMMISE. Ce script se citerait lui-même.
 */
const EXEMPTS_C1 = new Set(['scripts/check-porte-journal.mjs']);

/** Extensions balayées par C1. Le SQL en fait partie : c'est la moitié du sujet. */
const EXTENSIONS_C1 = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sql'];

// -----------------------------------------------------------------------------
// LES MOTIFS
// -----------------------------------------------------------------------------

/**
 * Écriture par Drizzle. Le préfixe de namespace optionnel couvre
 * `schema.activityLog` (`import * as schema`), qui échapperait à un motif nu.
 */
const ECRITURE_DRIZZLE = [
  {
    motif: /\b(insert|update|delete)\s*\(\s*(?:[A-Za-z_$][\w$]*\s*\.\s*)?activityLog\b/gi,
    nom: 'écriture Drizzle sur `activityLog`',
  },
];

/** Écriture en SQL. Insensible à la casse, tolérante aux espaces et aux retours. */
const ECRITURE_SQL = [
  {
    motif: /\binsert\s+into\s+(?:public\s*\.\s*)?activity_log\b/gi,
    nom: 'INSERT INTO activity_log',
  },
  {
    motif: /\bupdate\s+(?:only\s+)?(?:public\s*\.\s*)?activity_log\b/gi,
    nom: 'UPDATE activity_log',
  },
  {
    motif: /\bdelete\s+from\s+(?:only\s+)?(?:public\s*\.\s*)?activity_log\b/gi,
    nom: 'DELETE FROM activity_log',
  },
  {
    motif: /\btruncate\s+(?:table\s+)?(?:only\s+)?(?:public\s*\.\s*)?activity_log\b/gi,
    nom: 'TRUNCATE activity_log',
  },
];

/**
 * Nommage de la table dans le code de l'API. On ne cherche PAS `activity_log` en
 * texte libre : les fichiers d'auth citent la table dans leurs commentaires, et un
 * garde qui accuse un commentaire finit désactivé. On cherche donc le SYMBOLE et le
 * LITTÉRAL de chaîne — deux formes qui ne s'écrivent pas par hasard dans une phrase.
 */
const NOMMAGE = [
  { motif: /\bactivityLog\b/g, nom: 'symbole Drizzle `activityLog`' },
  { motif: /['"]activity_log['"]/g, nom: "littéral `'activity_log'`" },
];

const ANGLES_MORTS = `${JAUNE}CE QUE CE CONTRÔLE NE VOIT PAS${RAZ}
  1. TOUT CE QUI N'EST PAS LE CODE DE CE DÉPÔT. Un \`psql\` d'administrateur, un
     outil d'administration graphique, un futur service partageant la base : rien
     ici ne les atteint. La seule barrière qui les couvrirait est un
     \`REVOKE UPDATE, DELETE ON activity_log\` sur le rôle applicatif — du DDL, donc
     le fichier 04, donc une escalade. NON FERMÉ, REMONTÉ.
  2. LE SQL CONSTRUIT À L'EXÉCUTION : \`sql.raw('insert into ' + table)\`, un nom de
     table venu d'une variable ou d'une variable d'environnement. Le motif cherche
     un nom de table LITTÉRAL, et c'est la contrepartie assumée de \`sql.raw\`.
  3. L'APPEL OUBLIÉ. Ce contrôle prouve que personne n'écrit AILLEURS que par la
     porte. Il ne prouve PAS que tout ce qui devrait être journalisé l'EST — cette
     preuve-là n'existe qu'en test d'intégration, scénario par scénario.
  4. LE CONTENU. Il ne regarde pas ce qui entre dans \`meta\` : c'est le travail du
     catalogue fermé (packages/shared/src/journal.ts) et du balayage de pureté du
     plan de tests L2 §5, qui LIT la table après un scénario complet.
  5. UN CONTRÔLE NON EXÉCUTÉ. Il vit dans \`pnpm verify\`. Son ajout au fichier de CI
     (.github/workflows/ci.yml) N'A PAS ÉTÉ FAIT par l'agent qui l'a écrit — ce
     fichier appartenait à un autre incrément en cours. Tant qu'il n'y est pas, la
     garantie s'arrête au poste de développement.
  6. LE RENOMMAGE. Un \`import { activityLog as journalBrut }\` est vu (la ligne
     d'import contient le symbole), mais une ré-exportation sous un autre nom depuis
     un module tiers ne l'est pas.`;

if (process.argv.includes('--angles-morts')) {
  console.log(ANGLES_MORTS);
  process.exit(0);
}

// -----------------------------------------------------------------------------
// Le balayage
// -----------------------------------------------------------------------------

/**
 * Fichiers versionnés ET fichiers neufs non ignorés. Les deux, délibérément : un
 * module fautif pas encore indexé est exactement le cas du défaut `591ccbd`, où un
 * commit annonçait des correctifs restés non indexés.
 */
function fichiersDuDepot() {
  const sortie = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: RACINE,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return sortie.split('\n').filter((ligne) => ligne.length > 0);
}

function lire(chemin) {
  try {
    return readFileSync(resolve(RACINE, chemin), 'utf8');
  } catch {
    // Fichier supprimé entre l'énumération et la lecture, lien mort, binaire
    // illisible : ce n'est pas une violation, c'est un fichier absent.
    return null;
  }
}

function numeroDeLigne(texte, index) {
  let ligne = 1;
  for (let i = 0; i < index; i += 1) if (texte[i] === '\n') ligne += 1;
  return ligne;
}

function chercher(texte, motifs) {
  const trouvailles = [];
  for (const { motif, nom } of motifs) {
    motif.lastIndex = 0;
    let m;
    while ((m = motif.exec(texte)) !== null) {
      trouvailles.push({ nom, ligne: numeroDeLigne(texte, m.index), extrait: m[0].trim() });
      if (m[0].length === 0) motif.lastIndex += 1;
    }
  }
  return trouvailles;
}

let violations = [];
let fichiersLus = 0;

try {
  for (const chemin of fichiersDuDepot()) {
    const extension = chemin.slice(chemin.lastIndexOf('.'));

    const dansC1 = EXTENSIONS_C1.includes(extension) && !EXEMPTS_C1.has(chemin);
    const dansC2 =
      chemin.startsWith('apps/api/src/') && (extension === '.ts' || extension === '.tsx');
    if (!dansC1 && !dansC2) continue;

    const texte = lire(chemin);
    if (texte === null) continue;
    fichiersLus += 1;

    if (dansC1 && chemin !== PORTE_ECRITURE) {
      for (const t of chercher(texte, [...ECRITURE_DRIZZLE, ...ECRITURE_SQL])) {
        violations.push({
          controle: 'C1 ÉCRITURE',
          chemin,
          ...t,
          remede: `Seul \`${PORTE_ECRITURE}\` écrit dans \`activity_log\`. Appelez \`journaliserActivite\` (apps/api/src/domaines/journal/service.ts). Un UPDATE ou un DELETE n'a AUCUN fichier autorisé (invariant 7).`,
        });
      }
    }

    if (dansC2 && !NOMMAGE_AUTORISE.has(chemin)) {
      for (const t of chercher(texte, NOMMAGE)) {
        violations.push({
          controle: 'C2 ATTEINTE',
          chemin,
          ...t,
          remede: `Hors du domaine \`journal\`, on ne nomme pas la table. Pour écrire : \`journaliserActivite\`. Pour LIRE : ajoutez la lecture au dépôt du journal — pas l'accès à votre module.`,
        });
      }
    }
  }
} catch (erreur) {
  console.error(`${ROUGE}check:porte-journal — le contrôle lui-même a échoué${RAZ}`);
  console.error(erreur instanceof Error ? erreur.message : String(erreur));
  process.exit(2);
}

if (violations.length > 0) {
  console.error(
    `${ROUGE}✗ activity_log : la porte d'écriture unique est contournée (${violations.length} violation(s))${RAZ}\n`,
  );
  for (const v of violations) {
    console.error(`  ${ROUGE}${v.controle}${RAZ}  ${v.chemin}:${v.ligne}`);
    console.error(`    trouvé  : ${v.nom} — « ${v.extrait} »`);
    console.error(`    remède  : ${v.remede}\n`);
  }
  console.error(
    `Note de conception LOT_L2 §2.4 : « Une seule fonction d'écriture. » Si deux\n` +
      `chemins peuvent écrire dans cette table, la garantie qu'elle porte — meta fermé\n` +
      `par action, aucune donnée personnelle — vaut ce que vaut le plus laxiste des deux.\n`,
  );
  console.error(ANGLES_MORTS);
  process.exit(1);
}

console.log(
  `${VERT}✓ activity_log : porte d'écriture unique (${String(fichiersLus)} fichiers balayés)${RAZ}`,
);
console.log(`  écriture autorisée : ${PORTE_ECRITURE}`);
console.log(`  nommage autorisé   : ${[...NOMMAGE_AUTORISE].join(' · ')}`);
console.log(`  angles morts       : node scripts/check-porte-journal.mjs --angles-morts`);
