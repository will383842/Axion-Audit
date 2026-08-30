// =============================================================================
// TESTS DU GARDE-FOU DU GRAPHE DES MODULES
//   · scripts/check-graphe-modules.mjs — le PENDU et l'ORPHELIN
//
// POURQUOI CE FICHIER EXISTE. Ce garde est né de DEUX défauts réels (`b24b98c`,
// l'import vers un fichier absent de l'index, qui rendait la branche non
// déployable ; `591ccbd`, le module que rien n'appelait) et il a lui-même connu un
// TROISIÈME défaut, trouvé le 2026-08-29 : la sous-chaîne `/*` d'un `/v1/auth/*`
// écrit DANS un commentaire de ligne ouvrait un faux bloc qui blanchissait trente
// lignes, imports compris. Sur `routes.ts`, le garde voyait 0 import sur 4 — et le
// détecteur de pendu devenait AVEUGLE, en silence et au vert, sur exactement le
// cas qu'il existe pour attraper.
//
// Rien de tout cela n'était couvert par un test. La correction (un automate
// lexical à sept états) a été relue, jamais MESURÉE : personne n'avait rejoué le
// commentaire fautif pour voir si l'import suivant était de nouveau vu. C'est ce
// que fait ce fichier.
//
// 09 §5.6 — écrit par un agent qui n'a pas écrit le garde et ne le modifie pas.
//
// COMMENT IL EST ÉPROUVÉ. Chaque cas fabrique un DÉPÔT GIT JETABLE portant le
// garde LIVRÉ (copié dans `<bac>/scripts/`, d'où il résout sa racine et lance
// `git`) et un mini-monorepo de quatre modules. Le garde ne pose qu'une question
// — « git connaît-il ce chemin ? » — et c'est précisément ce que le bac permet de
// contrôler au fichier près, ce qu'aucun test sur le dépôt réel ne permettrait.
//
// LES DEUX SENS : le témoin conforme reste VERT (un garde qui accuse à tort finit
// désactivé, et c'est alors la constructibilité de la branche qui tombe avec lui)
// et chaque faute fabriquée rend EXIT=1 en NOMMANT le fichier, la ligne, le
// spécificateur et le remède exact.
//
// Traçabilité : E36 (exécutable par lots avec critères), E43 (exécutabilité
// autopilote) · CLAUDE.md §4 étape 6 (« le code orphelin est REFUSÉ ») · 09 §5.6.
// =============================================================================
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');
const GARDE = 'check-graphe-modules.mjs';
const REGISTRE = 'scripts/modules-en-attente.md';

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

function creerBac(fichiers: Readonly<Record<string, string>>): string {
  const bac = mkdtempSync(join(tmpdir(), 'axion-graphe-modules-'));
  bacs.push(bac);
  mkdirSync(join(bac, 'scripts'), { recursive: true });
  copyFileSync(join(RACINE_DEPOT, 'scripts', GARDE), join(bac, 'scripts', GARDE));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const cible = join(bac, relatif);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu, 'utf8');
  }
  const git = (...args: readonly string[]): void => {
    const r = spawnSync('git', [...args], { cwd: bac, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  };
  // `git add` sans commit : le garde interroge l'INDEX (`git ls-files`), jamais
  // l'historique. C'est aussi ce qui permet d'écrire un fichier APRÈS l'ajout pour
  // fabriquer le cas « présent sur le disque, inconnu de git ».
  git('-c', 'init.defaultBranch=main', 'init', '-q');
  git('add', '-A');
  return bac;
}

function executer(bac: string, options: readonly string[] = []): Verdict {
  const r = spawnSync(process.execPath, [join(bac, 'scripts', GARDE), ...options], {
    cwd: bac,
    encoding: 'utf8',
  });
  return {
    code: r.status ?? -1,
    sortie: `${r.stdout}${r.stderr}`.replaceAll(CODES_ANSI, ''),
  };
}

const lancer = (fichiers: Readonly<Record<string, string>>, options?: readonly string[]): Verdict =>
  executer(creerBac(fichiers), options ?? []);

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------
// LE MINI-MONOREPO TÉMOIN — quatre modules, deux points d'entrée DÉCLARÉS.
// Les points d'entrée ne sont pas DEVINÉS par leur nom : ils sont lus dans les
// `package.json`, `main` compris, avec la bascule `dist/ → src/`.
// -----------------------------------------------------------------------------
const TEMOIN: Readonly<Record<string, string>> = {
  'packages/noyau/package.json': '{ "name": "@axion/noyau", "main": "./src/index.ts" }\n',
  'packages/noyau/src/index.ts': "export { format } from './format.js';\n",
  'packages/noyau/src/format.ts': 'export function format(x) {\n  return x;\n}\n',
  'apps/api/package.json': '{ "name": "@axion/api", "main": "./dist/serveur.js" }\n',
  'apps/api/src/serveur.ts':
    "import { format } from '@axion/noyau';\n" +
    "import { aide } from './aide.js';\n" +
    'export const demarrer = () => format(aide);\n',
  'apps/api/src/aide.ts': 'export const aide = 1;\n',
};

const jourISO = (decalageJours: number): string => {
  const d = new Date(Date.now() + decalageJours * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const registre = (lignes: readonly string[]): string =>
  [
    '# Modules en attente',
    '',
    '| module | incrément consommateur | déclaré le | justification |',
    '| --- | --- | --- | --- |',
    ...lignes,
    '',
  ].join('\n');

describe('check-graphe-modules.mjs — le témoin conforme reste vert', () => {
  it('accepte un graphe complet et prouve qu’il a examiné de VRAIS modules', () => {
    // LE PIÈGE QUE CE CAS FERME : un garde de graphe peut sortir vert parce que son
    // périmètre s'est refermé sur rien. On assère le nombre de modules examinés et
    // de points d'entrée reconnus, pas seulement le code de sortie.
    const { code, sortie } = lancer(TEMOIN);
    expect(sortie).toContain('4 module(s) examiné(s)');
    expect(sortie).toContain("2 point(s) d'entrée déclaré(s)");
    expect(sortie).toContain('aucun import pendu');
    expect(code).toBe(0);
  });

  it('refuse de conclure quand AUCUN module n’est candidat', () => {
    // Un dépôt sans `apps/*/src` ni `packages/*/src` ne prouve rien. Le garde doit
    // dire « je n'ai rien pu contrôler » et non rendre un vert rassurant — c'est la
    // propriété qui manque le plus souvent aux garde-fous de ce dépôt.
    const { code, sortie } = lancer({ 'infra/note.md': 'rien à voir\n' });
    expect(sortie).toContain('aucun module candidat');
    expect(code).toBe(1);
  });

  it('ne prend pas une dépendance EXTERNE pour un import pendu', () => {
    // `fastify` n'est pas dans le dépôt et n'a pas à y être. Un garde qui
    // l'accuserait serait rouge en permanence, donc ignoré, donc inexistant.
    const { code } = lancer({
      ...TEMOIN,
      'apps/api/src/serveur.ts':
        "import Fastify from 'fastify';\n" +
        "import { format } from '@axion/noyau';\n" +
        "import { aide } from './aide.js';\n" +
        'export const demarrer = () => Fastify(format(aide));\n',
    });
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// CONTRÔLE 1 — LE PENDU. Il casse la branche pour tout le monde : refus sec,
// aucune soupape. La question posée est « git connaît-il ce chemin ? », jamais
// « ce fichier existe-t-il ? » — et c'est toute la différence avec `typecheck`.
// -----------------------------------------------------------------------------
describe('check-graphe-modules.mjs — contrôle 1, l’import vers rien', () => {
  it('refuse un import vers une cible qui n’existe nulle part, et nomme fichier, ligne et spécificateur', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/serveur.ts':
        "import { aide } from './aide.js';\n" +
        "import { routes } from './domaines/auth/routes.js';\n" +
        'export const demarrer = () => routes(aide);\n',
    });
    expect(sortie).toContain('IMPORT(S) VERS UN FICHIER QUE GIT NE CONNAÎT PAS');
    expect(sortie).toContain('apps/api/src/serveur.ts:2');
    expect(sortie).toContain('./domaines/auth/routes.js');
    expect(sortie).toContain('aucune cible connue de git, et aucune sur le disque');
    expect(code).toBe(1);
  });

  it('refuse un import dont la cible EXISTE SUR LE DISQUE mais n’est pas indexée', () => {
    // C'EST LE DÉFAUT `b24b98c` LUI-MÊME, ET LE PLUS DUR À VOIR. Le hook de
    // pré-commit lançait `typecheck` et sortait AU VERT : `tsc` lit l'arbre de
    // travail, qui possède le fichier ; l'index, non. Un garde bâti sur
    // `existsSync` reproduirait exactement cet angle mort. Ici la cible est écrite
    // APRÈS le `git add` : elle est sur le disque, invisible de git.
    const bac = creerBac({
      ...TEMOIN,
      'apps/api/src/serveur.ts':
        "import { aide } from './aide.js';\n" +
        "import { routes } from './domaines/auth/routes.js';\n" +
        'export const demarrer = () => routes(aide);\n',
    });
    const cible = join(bac, 'apps/api/src/domaines/auth/routes.ts');
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, 'export const routes = 1;\n', 'utf8');

    const { code, sortie } = executer(bac);
    expect(sortie).toContain('IMPORT(S) VERS UN FICHIER QUE GIT NE CONNAÎT PAS');
    expect(sortie).toContain('le fichier EXISTE sur ce disque');
    expect(sortie).toContain('apps/api/src/domaines/auth/routes.ts');
    expect(sortie).toContain('git add');
    expect(code).toBe(1);
  });

  it('reste voyant APRÈS un commentaire contenant `/v1/auth/*` — la régression du 2026-08-29', () => {
    // LE PIÈGE EXACT, REJOUÉ. Deux expressions régulières enchaînées lisaient le
    // `/*` de `/v1/auth/*` — pourtant DANS un commentaire de ligne — comme
    // l'ouverture d'un bloc, refermé sur le `*/` du premier JSDoc, par-dessus tout
    // le bloc d'imports. Le pendu ci-dessous est placé APRÈS ce commentaire et
    // AVANT ce JSDoc : il n'est vu que par un automate lexical. Si quelqu'un
    // « simplifie » un jour l'analyse en deux `replace`, ce cas rougit.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/serveur.ts':
        '// Plafond de 10 req/min/IP sur /v1/auth/* (CLAUDE.md §9).\n' +
        "import { routes } from './domaines/auth/routes.js';\n" +
        '/** Démarre le serveur. */\n' +
        'export const demarrer = () => routes();\n',
    });
    expect(sortie).toContain('IMPORT(S) VERS UN FICHIER QUE GIT NE CONNAÎT PAS');
    expect(sortie).toContain('apps/api/src/serveur.ts:2');
    expect(code).toBe(1);
  });

  it('ne lit PAS comme un import une phrase citée dans une chaîne', () => {
    // Le pendant du cas précédent, et il a coûté deux faux positifs sur un
    // dépôt-témoin : les messages d'erreur de ce garde CONTIENNENT eux-mêmes des
    // phrases de la forme « import { x } from './fantome.js' ». Le mot-clé doit
    // être en état CODE ; le spécificateur, lui, reste bien sûr dans sa chaîne.
    const { code } = lancer({
      ...TEMOIN,
      'apps/api/src/aide.ts':
        'export const aide = 1;\n' +
        'export const remede = "corrige ainsi : import { x } from \'./fantome.js\'";\n',
    });
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// CONTRÔLE 2 — L'ORPHELIN. Refusé par CLAUDE.md §4 étape 6, avec une soupape
// bornée et datée. Gênant, pas fatal — d'où le registre.
// -----------------------------------------------------------------------------
describe('check-graphe-modules.mjs — contrôle 2, le module que rien n’atteint', () => {
  it('refuse un module que personne n’importe, et dit POURQUOI et COMMENT en sortir', () => {
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/http/pagination.ts': 'export const keyset = () => undefined;\n',
    });
    expect(sortie).toContain("MODULE(S) QUE RIEN N'ATTEINT");
    expect(sortie).toContain('apps/api/src/http/pagination.ts');
    expect(sortie).toContain("aucun fichier du dépôt ne l'importe");
    expect(sortie).toContain('BRANCHE-LE');
    expect(code).toBe(1);
  });

  it('ne se laisse pas blanchir par un import COMMENTÉ', () => {
    // LE PIÈGE : sans le blanchiment des commentaires, il suffirait d'écrire
    // `// import './pagination.js'` pour faire taire le garde. Un contrôle qu'on
    // satisfait avec de la prose est exactement ce que ce dépôt refuse partout.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/http/pagination.ts': 'export const keyset = () => undefined;\n',
      'apps/api/src/aide.ts':
        "// import { keyset } from './http/pagination.js';\n" + 'export const aide = 1;\n',
    });
    expect(sortie).toContain("MODULE(S) QUE RIEN N'ATTEINT");
    expect(sortie).toContain('apps/api/src/http/pagination.ts');
    expect(code).toBe(1);
  });

  it('refuse un module SEULEMENT ré-exporté par un baril, dont aucun symbole n’est importé', () => {
    // LE PIÈGE LE PLUS FIN, et c'est le cas réel de `pagination.ts`. Un baril qui
    // ré-exporte tout rendrait indétectable n'importe quel module inutilisé du
    // paquet si le transit comptait comme une consommation. Il ne compte pas.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'packages/noyau/src/index.ts':
        "export { format } from './format.js';\nexport { inutile } from './inutile.js';\n",
      'packages/noyau/src/inutile.ts': 'export const inutile = 2;\n',
    });
    expect(sortie).toContain("MODULE(S) QUE RIEN N'ATTEINT");
    expect(sortie).toContain('packages/noyau/src/inutile.ts');
    expect(sortie).toContain('ré-exporté par packages/noyau/src/index.ts');
    expect(code).toBe(1);
  });

  it('ne refuse PAS un module dont le seul consommateur est un test — et le signale', () => {
    // État NORMAL sous TDD (09 §3-2, « tests écrits AVANT ») : le refuser
    // interdirait le pipeline que le dépôt impose. C'est une information, pas un
    // verdict — mais elle est imprimée, parce qu'elle devient anormale si elle dure.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/http/pagination.ts': 'export const keyset = () => undefined;\n',
      'apps/api/tests/pagination.test.ts':
        "import { keyset } from '../src/http/pagination.js';\nkeyset();\n",
    });
    expect(sortie).toContain('Information (pas un verdict)');
    expect(sortie).toContain('apps/api/src/http/pagination.ts');
    expect(code).toBe(0);
  });

  it('rend ses exemptions VISIBLES sur `--details`', () => {
    // Un garde dont les exemptions sont invisibles peut se taire pour de mauvaises
    // raisons sans que personne le sache. C'est la seule façon de le relire
    // autrement qu'en le croyant sur parole.
    const { code, sortie } = lancer(TEMOIN, ['--details']);
    expect(sortie).toContain("Points d'entrée exemptés");
    expect(sortie).toContain('apps/api/src/serveur.ts');
    expect(code).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// LA SOUPAPE — « un registre, un plafond et un arbitre » (CLAUDE.md §6).
// Un registre qu'on ne peut pas saturer n'est pas une soupape, c'est une dispense.
// -----------------------------------------------------------------------------
describe('check-graphe-modules.mjs — la soupape se referme', () => {
  const ORPHELIN = 'apps/api/src/http/pagination.ts';
  const AVEC_ORPHELIN = { ...TEMOIN, [ORPHELIN]: 'export const keyset = () => undefined;\n' };

  it('accepte un orphelin DÉCLARÉ, daté du jour et justifié', () => {
    const { code, sortie } = lancer({
      ...AVEC_ORPHELIN,
      [REGISTRE]: registre([
        `| ${ORPHELIN} | L3b | ${jourISO(0)} | moitié serveur du keyset, consommée par GET /v1/companies |`,
      ]),
    });
    expect(sortie).toContain('1 en attente déclarée');
    expect(code).toBe(0);
  });

  it('refuse une déclaration PÉRIMÉE — la soupape a une date, pas seulement un motif', () => {
    const { code, sortie } = lancer({
      ...AVEC_ORPHELIN,
      [REGISTRE]: registre([
        `| ${ORPHELIN} | L3b | ${jourISO(-30)} | moitié serveur du keyset, consommée par GET /v1/companies |`,
      ]),
    });
    expect(sortie).toContain('attend depuis 30 jours');
    expect(sortie).toContain('plafond 14');
    expect(code).toBe(1);
  });

  it('refuse une déclaration devenue INUTILE — c’est ce qui empêche une entrée de dormir', () => {
    // LE PIÈGE : sans cette règle, une ligne de registre posée une fois resterait
    // pour toujours, et le module qu'elle couvre échapperait au contrôle même après
    // avoir été branché. La soupape doit se REFERMER, pas s'oublier.
    const { code, sortie } = lancer({
      ...TEMOIN,
      [REGISTRE]: registre([
        `| apps/api/src/aide.ts | L3b | ${jourISO(0)} | module d'aide en attente de son consommateur réel |`,
      ]),
    });
    expect(sortie).toContain('EST désormais atteint');
    expect(sortie).toContain('RETIRE la ligne');
    expect(code).toBe(1);
  });

  it('refuse une entrée qui désigne un module inconnu de git', () => {
    const { code, sortie } = lancer({
      ...AVEC_ORPHELIN,
      [REGISTRE]: registre([
        `| apps/api/src/disparu.ts | L3b | ${jourISO(0)} | entrée laissée derrière une suppression |`,
      ]),
    });
    expect(sortie).toContain("n'existe pas / n'est pas suivi par git");
    expect(code).toBe(1);
  });

  it('refuse une justification trop courte — une soupape non motivée est décorative', () => {
    const { code, sortie } = lancer({
      ...AVEC_ORPHELIN,
      [REGISTRE]: registre([`| ${ORPHELIN} | L3b | ${jourISO(0)} | plus tard |`]),
    });
    expect(sortie).toContain('MAL FORMÉ');
    expect(sortie).toContain('justification');
    expect(code).toBe(1);
  });

  it('refuse une date hors format — une soupape qu’une machine ne sait pas lire n’est pas tracée', () => {
    const { code, sortie } = lancer({
      ...AVEC_ORPHELIN,
      [REGISTRE]: registre([
        `| ${ORPHELIN} | L3b | 30/08/2026 | moitié serveur du keyset, consommée par GET /v1/companies |`,
      ]),
    });
    expect(sortie).toContain('MAL FORMÉ');
    expect(sortie).toContain('AAAA-MM-JJ');
    expect(code).toBe(1);
  });

  it('REFUSE au-delà de cinq entrées, même toutes valides', () => {
    // LE PIÈGE QUE CE CAS FERME, et c'est le seul qui prouve que le plafond mord :
    // six entrées irréprochables restent un refus. Sans plafond, la soupape
    // deviendrait le chemin normal pour livrer du code que rien n'appelle.
    const modules = Array.from({ length: 6 }, (_, i) => `apps/api/src/attente${String(i)}.ts`);
    const fichiers: Record<string, string> = { ...TEMOIN };
    for (const m of modules) fichiers[m] = 'export const enAttente = 1;\n';
    fichiers[REGISTRE] = registre(
      modules.map(
        (m) =>
          `| ${m} | L3b | ${jourISO(0)} | module écrit à l'avance, consommateur nommé en L3b |`,
      ),
    );
    const { code, sortie } = lancer(fichiers);
    expect(sortie).toContain('pour un plafond de 5');
    expect(sortie).toContain('une soupape sans plafond est une décharge');
    expect(code).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// PORTÉE — imprimée sur demande, et c'est ce qui distingue un garde honnête d'un
// garde qui rassure.
// -----------------------------------------------------------------------------
describe('check-graphe-modules.mjs — il dit ce qu’il ne voit pas', () => {
  it('imprime ses angles morts et sort en 0', () => {
    const { code, sortie } = lancer(TEMOIN, ['--angles-morts']);
    expect(sortie).toContain('CE QUE CE CONTRÔLE NE VOIT PAS');
    expect(sortie).toContain('Import dynamique NON LITTÉRAL');
    expect(code).toBe(0);
  });

  it('ANGLE MORT 1 — un module atteint par un import dynamique NON littéral est déclaré orphelin', () => {
    // Ce cas ne célèbre pas le comportement : il l'ÉPINGLE. C'est un faux positif
    // ASSUMÉ, et c'est pour lui que la soupape existe. Le jour où la résolution
    // saurait suivre un spécificateur calculé, ce test rougirait et forcerait à
    // relire l'arbitrage plutôt qu'à le découvrir en porte.
    const { code, sortie } = lancer({
      ...TEMOIN,
      'apps/api/src/greffons/csv.ts': 'export const lire = () => undefined;\n',
      'apps/api/src/aide.ts':
        'export const aide = 1;\n' +
        'export const charger = async (nom) => import(`./greffons/${nom}.js`);\n',
    });
    expect(sortie).toContain('apps/api/src/greffons/csv.ts');
    expect(code).toBe(1);
  });
});
