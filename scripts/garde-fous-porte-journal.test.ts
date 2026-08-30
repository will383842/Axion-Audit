// =============================================================================
// TESTS DU GARDE-FOU DE L'INVARIANT 7
//   · scripts/check-porte-journal.mjs
//
// POURQUOI CE FICHIER EXISTE. Le garde a été branché en CI le 2026-08-29 sans
// qu'on l'ait jamais VU REFUSER quoi que ce soit. Un garde qu'on n'a jamais vu
// refuser n'est pas un garde mesuré : c'est une ligne de configuration qui rassure.
// Le dépôt en a déjà fait deux fois les frais — `check-invariants` laissait passer
// dix mutations, `check-isolation-reseau` trois. Dans les deux cas la cause était
// la même : personne n'avait fabriqué la faute pour voir si elle était vue.
//
// 09 §5.6 — ce fichier est écrit par un agent qui n'a pas écrit le garde, ne l'a
// pas modifié, et ne le modifiera pas. Les défauts trouvés ici sont RAPPORTÉS.
//
// COMMENT IL EST ÉPROUVÉ. Chaque cas fabrique un DÉPÔT GIT JETABLE dans un dossier
// temporaire — `<bac>/scripts/check-porte-journal.mjs` (le fichier LIVRÉ, copié
// tel quel) plus les fixtures. Le garde calcule sa racine par
// `resolve(import.meta.dirname, '..')` et lance `git` avec `cwd: RACINE` : copié
// dans `<bac>/scripts/`, il lit le bac et rien d'autre. Aucun point d'injection,
// aucune modification du garde, aucune écriture dans le dépôt réel.
//
// LES DEUX SENS, SANS QUOI CE FICHIER NE VAUDRAIT RIEN :
//   · un TÉMOIN SAIN doit rester VERT — un garde qui refuse tout serait « vert »
//     sur toutes les contre-épreuves et finirait désactivé au premier agacement ;
//   · chaque cas fautif doit rendre EXIT=1 **et NOMMER la faute** (le contrôle,
//     le chemin, la ligne, l'extrait). Un refus muet ne se corrige pas, il se
//     contourne.
//
// POURQUOI LES MOTIFS FAUTIFS SONT ASSEMBLÉS À L'EXÉCUTION. Le garde balaie TOUS
// les fichiers du dépôt, ce fichier-ci compris, et sa liste `EXEMPTS_C1` ne
// contient que lui-même. Écrire la faute en clair ici rendrait la CI rouge — un
// test qui casse le dépôt qu'il protège. Les fixtures sont donc concaténées à
// l'exécution, exactement comme `garde-fous-invariants.test.ts` le fait pour
// l'anti-skip. Ce n'est pas une ruse : c'est la seule forme qui teste le garde
// sans le contourner ni l'amender.
//
// Traçabilité : E33 (sécurité), E42 (RGPD renforcé : rétention du journal) ·
// CLAUDE.md invariant 7 · note de conception LOT_L2 §2.4 · 09 §5.6.
// =============================================================================
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');
const GARDE = 'check-porte-journal.mjs';

interface Verdict {
  readonly code: number;
  readonly sortie: string;
}

const bacs: string[] = [];

// Les couleurs ANSI n'ont rien à faire dans une assertion. Le motif se construit à
// partir du code du caractère d'échappement : écrit en littéral, il déclencherait
// `no-control-regex`, et le désactiver pour un test serait exactement le genre de
// contournement que ce dépôt refuse ailleurs.
const CODES_ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

// --- Les motifs fautifs, jamais écrits en clair (voir l'en-tête) --------------
const SYMBOLE = ['activity', 'Log'].join('');
const TABLE = ['activity', '_log'].join('');

/** Un dépôt git jetable portant le garde LIVRÉ et les fixtures données. */
function creerBac(fichiers: Readonly<Record<string, string>>, avecGit = true): string {
  const bac = mkdtempSync(join(tmpdir(), 'axion-porte-journal-'));
  bacs.push(bac);
  mkdirSync(join(bac, 'scripts'), { recursive: true });
  copyFileSync(join(RACINE_DEPOT, 'scripts', GARDE), join(bac, 'scripts', GARDE));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const cible = join(bac, relatif);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu, 'utf8');
  }
  if (avecGit) {
    const git = (...args: readonly string[]): void => {
      const r = spawnSync('git', [...args], { cwd: bac, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
    };
    // `git add` suffit : le garde lit l'index (`--cached`) et les fichiers neufs
    // (`--others`), jamais l'historique. Aucun commit, donc aucune identité git
    // exigée de la machine qui exécute les tests.
    git('-c', 'init.defaultBranch=main', 'init', '-q');
    git('add', '-A');
  }
  return bac;
}

function lancer(fichiers: Readonly<Record<string, string>>, options?: string[]): Verdict {
  const bac = creerBac(fichiers);
  return executer(bac, options ?? []);
}

function executer(bac: string, options: readonly string[]): Verdict {
  const r = spawnSync(process.execPath, [join(bac, 'scripts', GARDE), ...options], {
    cwd: bac,
    encoding: 'utf8',
  });
  return {
    code: r.status ?? -1,
    sortie: `${r.stdout}${r.stderr}`.replaceAll(CODES_ANSI, ''),
  };
}

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------
// LE DÉPÔT-TÉMOIN — conforme, et il vient EN PREMIER.
// Chaque cas fautif ci-dessous est ce témoin PLUS une faute, et une seule.
// -----------------------------------------------------------------------------
const PORTE = 'apps/api/src/domaines/journal/depot.ts';

const DEPOT_JOURNAL =
  '// LE fichier qui écrit.\n' +
  `import { ${SYMBOLE} } from '../../db/schema.js';\n` +
  `export async function insererLigneJournal(db, ligne) {\n` +
  `  await db.insert(${SYMBOLE}).values(ligne);\n` +
  '}\n';

const APPELANT_LEGITIME =
  '// Un module métier journalise en passant par le service, jamais par la table.\n' +
  "import { journaliserActivite } from '../journal/service.js';\n" +
  'export async function cloturerMission(ctx, id) {\n' +
  "  await journaliserActivite(ctx, { action: 'mission.cloture', missionId: id });\n" +
  '}\n';

const MIGRATION_CREATION =
  `CREATE TABLE ${TABLE} (\n` +
  '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n' +
  '  action text NOT NULL\n' +
  ');\n';

const TEMOIN: Readonly<Record<string, string>> = {
  [PORTE]: DEPOT_JOURNAL,
  'apps/api/src/domaines/missions/service.ts': APPELANT_LEGITIME,
  'apps/api/drizzle/0007_journal.sql': MIGRATION_CREATION,
};

describe('check-porte-journal.mjs — le témoin conforme reste vert', () => {
  it('accepte un dépôt où seule la porte écrit, et prouve qu’il a bien balayé', () => {
    // LE PIÈGE QUE CE CAS FERME : un garde peut sortir vert parce qu'il n'a RIEN vu.
    // On n'assère donc pas seulement EXIT=0 mais le NOMBRE de fichiers balayés :
    // si le périmètre se referme un jour sur zéro fichier, ce cas rougit au lieu de
    // décorer la CI d'une coche.
    const { code, sortie } = lancer(TEMOIN);
    expect(sortie).toContain('3 fichiers balayés');
    expect(sortie).toContain("porte d'écriture unique");
    expect(code).toBe(0);
  });

  it("n'accuse pas un CREATE TABLE : créer la table n'est pas y écrire", () => {
    const { code } = lancer({ 'apps/api/drizzle/0007_journal.sql': MIGRATION_CREATION });
    expect(code).toBe(0);
  });

  it("n'accuse pas une table VOISINE dont le nom commence pareil", () => {
    // Sans la limite de mot, `activityLogArchive` serait pris pour `activityLog` :
    // un garde qui accuse à tort finit désactivé, et c'est alors l'invariant 7 qui
    // tombe, pas le confort.
    const { code } = lancer({
      'apps/api/src/domaines/archives/depot.ts': `await db.insert(${SYMBOLE}Archive).values(x);\n`,
    });
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// C1 — ÉCRITURE : la porte de derrière. Le type ferme celle de devant.
// -----------------------------------------------------------------------------
describe('check-porte-journal.mjs — C1, toute écriture hors de la porte est refusée', () => {
  it('refuse un SECOND fichier qui insère par Drizzle, et nomme chemin, ligne et extrait', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/domaines/auth/depot.ts':
        '// Journalise « à la main », sans passer par le service.\n' +
        `await db.insert(${SYMBOLE}).values({ action: 'auth.login' });\n`,
    });
    expect(sortie).toContain('C1 ÉCRITURE');
    expect(sortie).toContain('apps/api/src/domaines/auth/depot.ts:2');
    expect(sortie).toContain('journaliserActivite');
    expect(code).toBe(1);
  });

  it('voit l’écriture derrière un préfixe de namespace — `schema.activityLog`', () => {
    // LE PIÈGE : `import * as schema` est l'idiome Drizzle le plus courant du dépôt.
    // Un motif qui exigerait le symbole NU, sans préfixe de namespace, passerait à
    // côté de la MOITIÉ des écritures possibles — le garde annoncerait plus qu'il
    // ne fait, ce qui est pire que ne rien annoncer.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/domaines/auth/depot.ts':
        "import * as schema from '../../db/schema.js';\n" +
        `await db.insert(schema.${SYMBOLE}).values(x);\n`,
    });
    expect(sortie).toContain('C1 ÉCRITURE');
    expect(code).toBe(1);
  });

  it('voit un INSERT en SQL BRUT — le trou nommé par eslint.config.js', () => {
    // ESLint n'analyse pas les `.sql`. Si ce garde ne les lisait pas non plus,
    // une migration pourrait écrire dans le journal sans qu'aucun outil du dépôt
    // ne l'aperçoive : c'est exactement la moitié du sujet.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/drizzle/0008_amorce.sql': `INSERT INTO ${TABLE} (action) VALUES ('amorce');\n`,
    });
    expect(sortie).toContain('C1 ÉCRITURE');
    expect(sortie).toContain('apps/api/drizzle/0008_amorce.sql:1');
    expect(code).toBe(1);
  });

  it('refuse un DELETE, y compris qualifié par le schéma `public`', () => {
    // Invariant 7 : « rien n'est jamais silencieusement écrasé ou supprimé ». Le
    // DELETE n'a AUCUN fichier autorisé — pas même une purge RGPD non arbitrée.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/drizzle/0009_purge.sql': `DELETE FROM public.${TABLE} WHERE created_at < now();\n`,
    });
    expect(sortie).toContain('C1 ÉCRITURE');
    expect(sortie).toContain('invariant 7');
    expect(code).toBe(1);
  });

  it('refuse un TRUNCATE — la forme la plus discrète de la suppression totale', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/drizzle/0010_raz.sql': `TRUNCATE TABLE ${TABLE};\n`,
    });
    expect(sortie).toContain('C1 ÉCRITURE');
    expect(code).toBe(1);
  });

  it('refuse un UPDATE écrit en minuscules et étalé sur plusieurs espaces', () => {
    // Un garde sensible à la casse ou aux espaces n'est pas un garde : c'est un
    // rappel poli. Le SQL du dépôt s'écrit dans les deux casses.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/drizzle/0011_retouche.sql': `update  only  ${TABLE}  set  action = 'x';\n`,
    });
    expect(sortie).toContain('C1 ÉCRITURE');
    expect(code).toBe(1);
  });

  it('voit un fichier JAMAIS INDEXÉ — le cas du commit 591ccbd', () => {
    // LE PIÈGE : un garde qui ne lirait que `git ls-files` arriverait toujours un
    // commit trop tard, et le module fautif du jour est justement celui qui n'est
    // pas encore indexé. Ici la fixture est écrite APRÈS le `git add`.
    const bac = creerBac(TEMOIN);
    const fautif = join(bac, 'apps/api/src/domaines/alertes/depot.ts');
    mkdirSync(dirname(fautif), { recursive: true });
    writeFileSync(fautif, `await db.insert(${SYMBOLE}).values(x);\n`, 'utf8');
    const { code, sortie } = executer(bac, []);
    expect(sortie).toContain('C1 ÉCRITURE');
    expect(sortie).toContain('apps/api/src/domaines/alertes/depot.ts');
    expect(code).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// C2 — ATTEINTE : nommer la table hors du domaine `journal`.
// Plus strict que C1 À DESSEIN : lire est légitime, mais par le dépôt du journal.
// -----------------------------------------------------------------------------
describe('check-porte-journal.mjs — C2, nommer la table hors de la liste blanche', () => {
  it('refuse le SYMBOLE Drizzle dans un module de l’API hors liste blanche', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/domaines/console/lecture.ts':
        `import { ${SYMBOLE} } from '../../db/schema.js';\n` +
        `export const derniers = (db) => db.select().from(${SYMBOLE}).limit(50);\n`,
    });
    expect(sortie).toContain('C2 ATTEINTE');
    expect(sortie).toContain('apps/api/src/domaines/console/lecture.ts');
    expect(sortie).toContain('dépôt du journal');
    expect(code).toBe(1);
  });

  it('refuse le LITTÉRAL de chaîne, forme qu’un `sql.raw` emprunterait', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/domaines/console/lecture.ts': `const t = '${TABLE}';\n`,
    });
    expect(sortie).toContain('C2 ATTEINTE');
    expect(code).toBe(1);
  });

  it('autorise `db/schema.ts` à nommer la table : il la DÉFINIT', () => {
    const { code } = lancer({
      ...TEMOIN,
      'apps/api/src/db/schema.ts': `export const ${SYMBOLE} = pgTable('${TABLE}', {});\n`,
    });
    expect(code).toBe(0);
  });

  it("n'accuse pas une PHRASE qui parle de la table dans un commentaire", () => {
    // LE PIÈGE, et c'est le plus insidieux : un garde qui accuse la documentation
    // punit ceux qui documentent. Il est alors désactivé, et l'invariant tombe avec
    // lui. Le garde cherche le SYMBOLE et le LITTÉRAL, deux formes qu'on n'écrit
    // pas par hasard dans une phrase française — pas le nom en texte libre.
    const { code } = lancer({
      ...TEMOIN,
      'apps/api/src/domaines/auth/service.ts':
        '// Toute connexion réussie est tracée dans activity_log par le service du\n' +
        '// journal — voir la note de conception LOT_L2 §2.4.\n' +
        'export const marqueur = 1;\n',
    });
    expect(code).toBe(0);
  });

  it('laisse la console `apps/hq` nommer la table — portée déclarée, pas oubli', () => {
    // C2 ne porte que sur `apps/api/src/`. Ce cas FIGE cette portée : si elle
    // s'élargissait un jour sans décision, ce test rougirait et forcerait à
    // relire l'en-tête du garde plutôt qu'à le découvrir en production.
    const { code } = lancer({
      ...TEMOIN,
      'apps/hq/src/pages/Journal.tsx': `const cle = '${TABLE}';\n`,
    });
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// ROBUSTESSE — un contrôle qui n'a rien vérifié ne doit JAMAIS sortir vert.
// -----------------------------------------------------------------------------
describe('check-porte-journal.mjs — il ne peut pas être vert par accident', () => {
  it('sort en 2 — ni 0 ni 1 — quand git lui-même échoue', () => {
    // LE PIÈGE : hors d'un dépôt git, `git ls-files` échoue et un garde naïf
    // conclurait « zéro fichier fautif ». Le code 2 dit « je n'ai pas pu
    // contrôler », ce qui n'est pas « tout va bien ».
    const bac = creerBac(TEMOIN, false);
    const { code, sortie } = executer(bac, []);
    expect(sortie).toContain('le contrôle lui-même a échoué');
    expect(code).toBe(2);
  });

  it('imprime ses angles morts sur demande, et sort en 0', () => {
    // Un garde qui ne sait pas dire ce qu'il ne voit pas rassure au lieu de garder.
    const { code, sortie } = lancer(TEMOIN, ['--angles-morts']);
    expect(sortie).toContain('CE QUE CE CONTRÔLE NE VOIT PAS');
    expect(sortie).toContain("SQL CONSTRUIT À L'EXÉCUTION");
    expect(code).toBe(0);
  });

  it('rappelle sa portée DANS le message de refus, pas seulement sur demande', () => {
    // Le lecteur d'un rouge de CI ne lance pas `--angles-morts`. S'il ne lit pas la
    // portée là, il ne la lira jamais, et il croira le garde plus fort qu'il n'est.
    const { sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/domaines/auth/depot.ts': `await db.insert(${SYMBOLE}).values(x);\n`,
    });
    expect(sortie).toContain('CE QUE CE CONTRÔLE NE VOIT PAS');
  });
});
