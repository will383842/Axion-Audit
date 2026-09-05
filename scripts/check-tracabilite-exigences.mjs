#!/usr/bin/env node
// =============================================================================
// GARDE-FOU : UN `E<n>` CITÉ DANS LE CODE DOIT EXISTER, ET DIRE CE QU'ON LUI FAIT
// DIRE.
//
// ── LE DÉFAUT QUE CE SCRIPT FERME, ET QUI ÉTAIT RÉEL ──────────────────────────
// Le 2026-08-29, 25 fichiers du socle d'authentification portaient
// `// Traçabilité : E5 (RBAC serveur systématique)` et `E27 (étanchéité   [citation-exemple]
// financière)`. Les deux numéros EXISTENT. Ils désignent « Scoring par unité,
// heatmap » et « Design moderne, charte, WCAG AA ». La matrice de traçabilité —
// l'instrument qui valide la porte — aurait donc validé un socle d'autorisation
// contre une carte de chaleur. Deux fichiers d'import de la banque de questions
// citaient de même `E4` (« arbre organisationnel ») pour `E10`.
//
// Aucun contrôle du dépôt ne voyait cela : `check:pack` scelle les 12 fichiers,
// `check:graphe-modules` rattache les modules entre eux, mais RIEN ne confrontait
// une citation d'exigence à la table des exigences.
//
// ── LES DEUX CONTRÔLES ────────────────────────────────────────────────────────
//   C1 — EXISTENCE. Tout `E<n>` cité dans une source doit figurer dans
//        `docs/TRACABILITE_E1-E47.md`. Attrape le numéro INVENTÉ (E48, E0, E99). [citation-exemple]
//        C'est le contrôle minimal, et il est faible : E5 existait bel et bien.
//
//   C2 — SENS. Une citation qui porte une GLOSE entre parenthèses —
//        `E21 (auditeurs jamais d'accès aux montants)` — voit cette glose
//        confrontée au LIBELLÉ OFFICIEL de l'exigence, mot à mot. Aucun mot
//        significatif en commun ⇒ REFUS.
//        C'est C2 qui attrape la famille E5/E27/E4 : « RBAC serveur systématique »
//        ne partage aucun mot avec « scoring par unité, heatmap ».
//
// ── POURQUOI UNE GLOSE PLUTÔT QU'UN FICHIER DE CORRESPONDANCE ─────────────────
// La forme proposée en revue était un fichier déclarant, pour chaque exigence, les
// globs qui la servent. Elle a deux défauts qui se cumulent : (a) c'est une SECONDE
// SOURCE DE VÉRITÉ à côté de la table, qui dérivera d'elle comme tout doublon ;
// (b) elle ne vérifie RIEN du sens — elle déplace la revendication non vérifiée
// dans un autre fichier, où plus personne ne la relit.
// La glose fait l'inverse : elle oblige l'auteur à ÉCRIRE en français ce qu'il croit
// que l'exigence dit, et confronte cette phrase à la table. Elle transforme une
// citation INVÉRIFIABLE en citation FALSIFIABLE, sans créer aucune source nouvelle :
// les libellés sont lus dans `docs/TRACABILITE_E1-E47.md` et `docs/08_TRACABILITE.md`.
//
// ── CE QUE CE CONTRÔLE NE VOIT PAS ────────────────────────────────────────────
// Imprimé par `--angles-morts`, et volontairement placé AVANT le code : un garde
// honnête sur sa portée vaut infiniment mieux qu'un garde qui rassure.
// LA LIMITE FONDAMENTALE, à dire sans détour : ce script NE DISTINGUE PAS un
// rattachement JUSTE d'un rattachement FAUX. Il distingue une glose COHÉRENTE avec
// le libellé d'une glose INCOHÉRENTE. `E33 (sécurité)` sur un fichier qui ne fait
// rien de sécurisé passera. Seule la revue croisée voit cela.
//
// Traçabilité : E36 (exécutable par lots avec critères), E43 (exécutabilité
// autopilote), E47 (profondeur fonctionnelle : matrice de complétude) ·
// CLAUDE.md §4 étape 6 (« code → exigences ») · DECISIONS.md 2026-08-29.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Couleurs ANSI. L'octet ESC vient d'un APPEL DE FONCTION, jamais d'une séquence
// d'échappement écrite à la main : l'outillage d'édition de la chaîne d'agents la
// convertit en OCTET RÉEL à l'écriture, et un octet de contrôle dans une source la
// rend invisible aux `grep` des étapes 3, 4 et 6 du pipeline (mesuré le 2026-09-04 ;
// garde `scripts/check-octets-controle.mjs`).
const ESC = String.fromCharCode(27);
const ROUGE = `${ESC}[31m`;
const VERT = `${ESC}[32m`;
const JAUNE = `${ESC}[33m`;
const GRIS = `${ESC}[90m`;
const RAZ = `${ESC}[0m`;

const RACINE = resolve(import.meta.dirname, '..');
const TABLE_EXECUTION = 'docs/TRACABILITE_E1-E47.md';
const TABLE_CONCEPTION = 'docs/08_TRACABILITE.md';

const ANGLES_MORTS = `${ROUGE}CE QUE CE CONTRÔLE NE VOIT PAS${RAZ}
  1. ${JAUNE}LA LIMITE FONDAMENTALE${RAZ} — il ne distingue pas un rattachement JUSTE
     d'un rattachement FAUX. Il ne vérifie QUE la cohérence interne d'une citation :
     « le numéro existe » (C1) et « la glose ressemble au libellé » (C2). Qu'un
     fichier serve RÉELLEMENT l'exigence qu'il cite n'est pas mécanisable ici : cela
     se juge en lisant le code, à l'étape 4 (revue croisée) et à l'étape 6.
  2. LA CITATION SANS GLOSE échappe entièrement à C2. \`// Traçabilité : E5, E33.\`
     ne dit rien de ce que l'auteur croit ; le script ne peut que constater que 5 et
     33 existent. C'est le trou par lequel le défaut du 2026-08-29 serait revenu à
     moitié — d'où la recommandation, NON MÉCANISÉE ici : glosez au moins l'exigence
     PRINCIPALE de chaque en-tête.
  3. LA GLOSE VERBALEMENT PROCHE MAIS FONCTIONNELLEMENT FAUSSE. Le rapprochement est
     LEXICAL (racines de mots), pas sémantique. \`E35 (sauvegardes)\` sur un fichier
     qui ne sauvegarde rien passe : le mot est dans le libellé.
  4. LE PÉRIMÈTRE EXCLUT \`docs/\`. Les notes de conception, les fiches de porte et
     les journaux citent massivement des exigences ; les contrôler ici mêlerait la
     prose d'arbitrage au code. Le sens 2 de la matrice porte sur le CODE LIVRÉ.
  5. L'EXIGENCE OUBLIÉE. Ce script part des citations et remonte à la table. Il ne
     fait JAMAIS le chemin inverse : une exigence que PERSONNE ne cite ne déclenche
     rien. Le sens 1 de la matrice (exigences → code) reste un travail humain.
  6. LE CODE ORPHELIN. Un fichier livré SANS aucune ligne de traçabilité est
     invisible pour ce script — il n'a aucune citation à vérifier. Rendre l'en-tête
     obligatoire est une décision de gouvernance, pas un contrôle de cohérence ;
     elle appartient à A01 et à Williams.`;

const argv = process.argv.slice(2);
if (argv.includes('--angles-morts')) {
  console.log(ANGLES_MORTS);
  process.exit(0);
}
const VERBEUX = argv.includes('--verbeux');

// -----------------------------------------------------------------------------
// 1. LES LIBELLÉS OFFICIELS — lus dans les DEUX tables, jamais redéclarés ici.
//
// L'EXISTENCE (C1) est jugée sur `TRACABILITE_E1-E47.md` seul : c'est la table que
// la porte consulte. Le VOCABULAIRE (C2) est l'UNION des deux libellés, parce que
// le fichier 08 (scellé) est plus complet et qu'une glose fidèle au pack ne doit
// pas être refusée au motif que l'abrégé d'exécution l'a raccourcie.
// -----------------------------------------------------------------------------
function lireLibelles(cheminRelatif) {
  const chemin = resolve(RACINE, cheminRelatif);
  if (!existsSync(chemin)) {
    console.error(`${ROUGE}✖ Table introuvable : ${cheminRelatif}${RAZ}`);
    process.exit(2);
  }
  const libelles = new Map();
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    // Ligne de tableau Markdown dont la 1ʳᵉ cellule est exactement `E<n>`.
    const m = /^\|\s*E(\d{1,3})\s*\|([^|]*)\|/.exec(ligne);
    if (!m) continue;
    const numero = Number(m[1]);
    // La MÊME exigence peut apparaître plusieurs fois (amendements) : on cumule.
    const deja = libelles.get(numero) ?? '';
    libelles.set(numero, `${deja} ${m[2]}`);
  }
  return libelles;
}

const libellesExecution = lireLibelles(TABLE_EXECUTION);
const libellesConception = lireLibelles(TABLE_CONCEPTION);

if (libellesExecution.size < 40) {
  console.error(
    `${ROUGE}✖ ${TABLE_EXECUTION} n'a livré que ${libellesExecution.size} exigences.${RAZ}\n` +
      `  Le format du tableau a changé : ce script ne peut plus rien garantir, et un\n` +
      `  contrôle qui n'a rien vérifié ne doit JAMAIS sortir vert.`,
  );
  process.exit(2);
}

// -----------------------------------------------------------------------------
// 2. NORMALISATION LEXICALE
//
// Le rapprochement se fait sur des RACINES de mots, pas sur des chaînes exactes :
// « sauvegardes » doit rencontrer « sauvegarde », « épinglées » doit rencontrer
// « épinglée ». Les accents sont retirés (une glose ASCII reste recevable), la
// ponctuation et les barres obliques séparent (« Sécurité/RGPD » vaut deux mots).
// -----------------------------------------------------------------------------
const MOTS_VIDES = new Set([
  'avec',
  'sans',
  'dans',
  'pour',
  'tout',
  'tous',
  'toute',
  'toutes',
  'chaque',
  'jamais',
  'plus',
  'moins',
  'leur',
  'leurs',
  'cette',
  'quand',
  'donc',
  'mais',
  'elle',
  'elles',
  'aussi',
  'entre',
  'selon',
  'depuis',
  'puis',
  'etre',
  'est',
  'sont',
  'meme',
  'memes',
  'autre',
  'autres',
  'niveau',
  'niveaux',
  'partie',
]);

function racines(texte) {
  const sansAccent = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = sansAccent.split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));
  return new Set(mots);
}

/** Deux racines se rencontrent si l'une est préfixe de l'autre (≥ 4 caractères). */
function seRencontrent(a, b) {
  return a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));
}

const vocabulaire = new Map();
for (const numero of new Set([...libellesExecution.keys(), ...libellesConception.keys()])) {
  vocabulaire.set(
    numero,
    racines(`${libellesExecution.get(numero) ?? ''} ${libellesConception.get(numero) ?? ''}`),
  );
}

// -----------------------------------------------------------------------------
// 3. LE PÉRIMÈTRE — les fichiers SUIVIS **et** les nouveaux non ignorés.
//
// Pourquoi les deux : un fichier fraîchement écrit et pas encore indexé est
// exactement celui qui porte une citation neuve, donc non relue. Le contrôle qui
// ne verrait que `git ls-files` arriverait toujours un commit trop tard.
// -----------------------------------------------------------------------------
const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.sh',
  '.json',
  '.yml',
  '.yaml',
  '.css',
]);

function gitLignes(args) {
  try {
    return execFileSync('git', args, { cwd: RACINE, encoding: 'utf8' })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (e) {
    console.error(`${ROUGE}✖ git a échoué : ${e.message}${RAZ}`);
    process.exit(2);
  }
}

const fichiers = [
  ...new Set([...gitLignes(['ls-files']), ...gitLignes(['ls-files', '-o', '--exclude-standard'])]),
]
  .filter((f) => !f.startsWith('docs/'))
  .filter((f) => !f.startsWith('node_modules/'))
  .filter((f) => EXTENSIONS.has(f.slice(f.lastIndexOf('.'))))
  .sort();

// -----------------------------------------------------------------------------
// 4. EXTRACTION DES CITATIONS
//
// `(?<![\w-])E(\d{1,3})(?!\w)` : la limite de gauche exclut `AE5F`, `1E5`, `E2E`
// et `E5_TRUC` ; la limite de droite exclut `E27bis`. La glose est le groupe entre
// parenthèses qui suit IMMÉDIATEMENT la citation — donc, dans `E27/E44 (design)`, [citation-exemple]
// elle appartient à E44 et à lui seul. Une glose ne se partage pas.
// -----------------------------------------------------------------------------
const CITATION = /(?<![\w-])E(\d{1,3})(?!\w)(\s*\(([^()\n]{1,120})\))?/g;

// ── LA SEULE ÉCHAPPATOIRE, ET POURQUOI ELLE EST SÛRE ─────────────────────────
// Un garde-fou doit pouvoir NOMMER le défaut qu'il ferme. Sans échappatoire, ce
// fichier-ci se refuserait lui-même : sa propre documentation cite le numéro faux
// du 2026-08-29 et des numéros inexistants comme contre-exemples. Un test qui
// vérifie qu'un numéro inventé est bien refusé a exactement le même besoin.
//
// TROIS PROPRIÉTÉS EN FONT AUTRE CHOSE QU'UN TROU :
//   1. le marqueur est LONG et explicite — personne ne l'écrit par distraction ;
//   2. les lignes exemptées sont TOUJOURS COMPTÉES dans la sortie, même en vert :
//      une exemption invisible serait une exemption qui prolifère ;
//   3. leur nombre est PLAFONNÉ. Au-delà, le contrôle REFUSE : une échappatoire
//      qu'on ne peut pas saturer n'est plus une échappatoire, c'est une décharge.
const MARQUEUR_EXEMPLE = 'citation-exemple';
const PLAFOND_EXEMPTIONS = 12;

/** Une glose qui n'est qu'une liste de sections/numéros n'est pas une glose. */
function estGloseUtile(texte) {
  return /[a-zA-ZÀ-ÿ]{4}/.test(texte) && !/^\s*(§|\d)/.test(texte);
}

const violationsC1 = [];
const violationsC2 = [];
const exemptions = [];
let citations = 0;

for (const fichier of fichiers) {
  const chemin = resolve(RACINE, fichier);
  let contenu;
  try {
    contenu = readFileSync(chemin, 'utf8');
  } catch {
    continue; // fichier supprimé entre le `git ls-files` et la lecture
  }
  const lignes = contenu.split('\n');
  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    if (ligne.includes(MARQUEUR_EXEMPLE)) {
      exemptions.push(`${fichier}:${i + 1}`);
      continue;
    }
    CITATION.lastIndex = 0;
    let m;
    while ((m = CITATION.exec(ligne)) !== null) {
      const numero = Number(m[1]);
      const glose = m[3];
      citations += 1;
      const site = `${fichier}:${i + 1}`;

      // --- C1 : le numéro existe-t-il dans la table d'exécution ? -------------
      if (!libellesExecution.has(numero)) {
        violationsC1.push({ site, numero, extrait: ligne.trim().slice(0, 120) });
        continue;
      }

      // --- C2 : la glose dit-elle ce que dit le libellé ? ---------------------
      if (!glose || !estGloseUtile(glose)) continue;
      const motsGlose = [...racines(glose)];
      if (motsGlose.length === 0) continue;
      const motsLibelle = [...(vocabulaire.get(numero) ?? [])];
      const rencontre = motsGlose.some((g) => motsLibelle.some((l) => seRencontrent(g, l)));
      if (!rencontre) {
        violationsC2.push({
          site,
          numero,
          glose: glose.trim(),
          libelle: (libellesExecution.get(numero) ?? '').trim().replace(/\s+/g, ' ').slice(0, 110),
        });
      }
    }
  }
}

// -----------------------------------------------------------------------------
// 5. VERDICT
// -----------------------------------------------------------------------------
if (VERBEUX) {
  console.log(
    `${GRIS}${fichiers.length} fichiers balayés · ${citations} citations d'exigence · ` +
      `${libellesExecution.size} exigences dans ${TABLE_EXECUTION}${RAZ}`,
  );
}

// Le plafond d'exemptions est un REFUS, pas un avertissement (« un garde qui
// avertit est un garde qu'on ignore »).
const exemptionsSaturees = exemptions.length > PLAFOND_EXEMPTIONS;

if (exemptions.length > 0) {
  const couleur = exemptionsSaturees ? ROUGE : GRIS;
  console.log(
    `${couleur}  ${exemptions.length} ligne(s) exemptée(s) par « ${MARQUEUR_EXEMPLE} » ` +
      `(plafond ${PLAFOND_EXEMPTIONS})${RAZ}`,
  );
  if (VERBEUX || exemptionsSaturees)
    for (const e of exemptions) console.log(`${GRIS}    ${e}${RAZ}`);
}

if (violationsC1.length === 0 && violationsC2.length === 0 && !exemptionsSaturees) {
  console.log(
    `${VERT}✔ Traçabilité des exigences : ${citations} citations, ${fichiers.length} fichiers, ` +
      `aucune incohérence.${RAZ}`,
  );
  console.log(`${GRIS}  (portée limitée — \`--angles-morts\` pour ce qu'il ne voit pas)${RAZ}`);
  process.exit(0);
}

console.error(`${ROUGE}✖ TRAÇABILITÉ DES EXIGENCES — REFUS${RAZ}\n`);

if (exemptionsSaturees) {
  console.error(
    `${ROUGE}PLAFOND D'EXEMPTIONS DÉPASSÉ — ${exemptions.length} > ${PLAFOND_EXEMPTIONS}${RAZ}\n` +
      `${GRIS}  Le marqueur « ${MARQUEUR_EXEMPLE} » sert à DOCUMENTER un contre-exemple, jamais à\n` +
      `  faire taire une citation réelle. Retirez-en, ou faites relever le plafond par A01.${RAZ}\n`,
  );
}

if (violationsC1.length > 0) {
  console.error(
    `${ROUGE}C1 — ${violationsC1.length} citation(s) d'une exigence QUI N'EXISTE PAS${RAZ}`,
  );
  console.error(`${GRIS}  La table ${TABLE_EXECUTION} va de E1 à E47.${RAZ}`);
  for (const v of violationsC1) {
    console.error(
      `  ${v.site}\n    cite ${ROUGE}E${v.numero}${RAZ} — inconnue\n    ${GRIS}${v.extrait}${RAZ}`,
    );
  }
  console.error('');
}

if (violationsC2.length > 0) {
  console.error(
    `${ROUGE}C2 — ${violationsC2.length} glose(s) qui ne disent PAS ce que dit l'exigence${RAZ}`,
  );
  console.error(
    `${GRIS}  Une citation qui a l'air faisant autorité et qui pointe ailleurs transfère au\n` +
      `  lecteur une confiance qu'elle n'a pas gagnée (DECISIONS.md 2026-08-29).${RAZ}`,
  );
  for (const v of violationsC2) {
    console.error(`  ${v.site}`);
    console.error(`    écrit    : E${v.numero} (${ROUGE}${v.glose}${RAZ})`);
    console.error(`    or E${v.numero} = ${VERT}${v.libelle}${RAZ}`);
    console.error(
      `    ${GRIS}→ soit la glose est fausse, soit le NUMÉRO l'est. Ouvrez la table.${RAZ}`,
    );
  }
  console.error('');
}

console.error(ANGLES_MORTS);
process.exit(1);
