// =============================================================================
// TEST DE LA RÈGLE ESLINT « ÉCRITURE DEXIE » — eslint.config.js
//
// POURQUOI CE FICHIER EXISTE, ET POURQUOI MAINTENANT.
// La règle `no-restricted-syntax` qui interdit d'écrire dans Dexie ailleurs que
// par `local/ecriture.ts` et `local/base.ts` (05 §9.2-2, `docs/conception/
// LOT_L5.md` §2) a été RÉÉCRITE le 2026-09-04 : sa première version visait tout
// objet `MemberExpression` à deux niveaux et mordait donc sur des collections en
// mémoire — `enAttente.current.clear()`, `enAttente.current.delete(cle)` d'une
// file `useRef<Map>`. La glose promettait le contraire de ce que la règle faisait.
// Elle a été resserrée sur les NEUF tables nommées de `SCHEMA_LOCAL`.
//
// Une règle corrigée sans test est une règle qu'on croit correcte. Ce fichier
// éprouve les DEUX SENS, parce qu'une garde ne se casse pas seulement en cessant
// de mordre : elle se casse aussi en mordant à tort, et une règle qui crie à tort
// finit désactivée — c'est-à-dire au même endroit qu'une règle absente.
//
// 09 §5.6 : écrit par A26, qui n'est l'auteur ni de la règle ni du code qu'elle
// surveille. Le fichier LIVRÉ est celui qu'on charge (`overrideConfigFile`) ;
// aucun sélecteur n'est recopié ici, sans quoi le test éprouverait sa propre copie.
//
// COMMENT. `ESLint.lintText` avec un `filePath` VIRTUEL : c'est le chemin, et lui
// seul, qui décide des blocs de configuration appliqués — exactement comme en CI.
// Les règles TYPÉES de `strictTypeChecked` sont neutralisées pour la sonde
// (`disableTypeChecked`) : un fichier virtuel n'appartient à aucun programme
// TypeScript, et le service de projet refuserait de l'analyser. `no-restricted-
// syntax`, elle, est purement SYNTAXIQUE — c'est celle qu'on éprouve, et elle
// s'applique intégralement.
//
// Traçabilité : E6 (hors ligne total : une écriture locale hors du port de sync
// ne remonte jamais) · E33 (sécurité / RGPD) ; 05 §9.2-2 ; 11 §8.5.
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { SCHEMA_LOCAL } from '../apps/field/src/local/base.js';

const RACINE_DEPOT = resolve(import.meta.dirname, '..');

/** Un chemin de sonde où la règle « écriture Dexie » DOIT être active. */
const CHEMIN_SOUS_LA_REGLE = resolve(RACINE_DEPOT, 'apps/field/src/app/sonde-a26.ts');
/** Le port d'écriture : le seul module que la règle doit épargner, avec `base.ts`. */
const CHEMIN_PORT_ECRITURE = resolve(RACINE_DEPOT, 'apps/field/src/local/ecriture.ts');
/** Un test : les fixtures d'un test écrivent des jeux de données, c'est leur métier. */
const CHEMIN_DE_TEST = resolve(RACINE_DEPOT, 'apps/field/src/app/sonde-a26.test.ts');

/** Le témoin : l'écriture la plus banale, celle qui doit toujours être refusée. */
const TEMOIN_FAUTIF = [
  'declare const base: { answers: { put(valeur: unknown): Promise<string> } };',
  'void base.answers.put({});',
].join('\n');

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: RACINE_DEPOT,
    overrideConfigFile: resolve(RACINE_DEPOT, 'eslint.config.js'),
    overrideConfig: [
      tseslint.configs.disableTypeChecked,
      { languageOptions: { parserOptions: { projectService: false, project: null } } },
    ],
  });
});

interface Verdict {
  /** Les seuls messages qui nous intéressent : ceux de la règle éprouvée. */
  readonly ecrituresDexie: readonly string[];
  /** Une erreur de syntaxe rendrait TOUT vert : c'est le piège à vacuité n° 1. */
  readonly fatales: readonly string[];
}

async function analyser(code: string, cheminFichier: string): Promise<Verdict> {
  const [resultat] = await eslint.lintText(code, { filePath: cheminFichier });
  const messages = resultat?.messages ?? [];
  return {
    ecrituresDexie: messages
      .filter((m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('ecrireLocal'))
      .map((m) => m.message),
    fatales: messages.filter((m) => m.fatal === true).map((m) => m.message),
  };
}

/**
 * Anti-vacuité, systématique : avant d'affirmer qu'un extrait NE remonte rien, on
 * prouve qu'au même chemin la règle mord bel et bien. Sans cela, un `filePath`
 * mal choisi ou une configuration cassée rendrait tous les tests négatifs verts.
 */
async function verifierQueLaRegleMordIci(cheminFichier: string): Promise<void> {
  const temoin = await analyser(TEMOIN_FAUTIF, cheminFichier);
  expect(temoin.fatales).toEqual([]);
  expect(temoin.ecrituresDexie).toHaveLength(1);
}

// =============================================================================
// SENS 1 — CE QUI N'EST PAS UNE ÉCRITURE DEXIE NE DOIT RIEN REMONTER
// =============================================================================
describe('règle « écriture Dexie » — les collections en mémoire sont épargnées', () => {
  const INNOCENTS = [
    {
      nom: 'enAttente.current.clear() — une file `useRef<Map>`',
      code: [
        'const enAttente = { current: new Map<string, number>() };',
        "enAttente.current.set('a', 1);",
        'enAttente.current.clear();',
      ].join('\n'),
    },
    {
      nom: 'enAttente.current.delete(cle) — la même file, une entrée retirée',
      code: [
        'const enAttente = { current: new Map<string, number>() };',
        'const cle = "a";',
        'enAttente.current.delete(cle);',
      ].join('\n'),
    },
    {
      nom: 'unSet.add(x) — un `Set` local',
      code: ['const unSet = new Set<string>();', "unSet.add('x');"].join('\n'),
    },
  ];

  for (const { nom, code } of INNOCENTS) {
    it(`@critique ${nom} ne remonte AUCUNE erreur`, async () => {
      await verifierQueLaRegleMordIci(CHEMIN_SOUS_LA_REGLE);
      const verdict = await analyser(code, CHEMIN_SOUS_LA_REGLE);
      expect(verdict.fatales).toEqual([]);
      expect(verdict.ecrituresDexie).toEqual([]);
    });
  }

  it('@critique le port d’écriture (`local/ecriture.ts`) écrit dans Dexie sans être repris', async () => {
    // Il est LE seul, avec `base.ts`, à en avoir le droit : une règle qui le
    // reprendrait obligerait à un `eslint-disable` permanent, c'est-à-dire à
    // apprendre au dépôt qu'on désactive cette règle quand elle gêne.
    const verdict = await analyser(TEMOIN_FAUTIF, CHEMIN_PORT_ECRITURE);
    expect(verdict.fatales).toEqual([]);
    expect(verdict.ecrituresDexie).toEqual([]);
  });

  it('un fichier de test n’est pas repris : ses fixtures fabriquent des jeux de données', async () => {
    const verdict = await analyser(TEMOIN_FAUTIF, CHEMIN_DE_TEST);
    expect(verdict.fatales).toEqual([]);
    expect(verdict.ecrituresDexie).toEqual([]);
  });
});

// =============================================================================
// SENS 2 — CHAQUE FORME D'ÉCRITURE DEXIE DOIT ÊTRE REPRISE, UNE FOIS
// =============================================================================
describe('règle « écriture Dexie » — toute écriture locale hors du port est refusée', () => {
  const FAUTIFS = [
    {
      nom: 'base.answers.put(…) — la table nommée',
      code: TEMOIN_FAUTIF,
    },
    {
      nom: 'base.meta.delete(…) — `meta` est une table comme les autres',
      code: [
        'declare const base: { meta: { delete(cle: string): Promise<void> } };',
        "void base.meta.delete('coffre');",
      ].join('\n'),
    },
    {
      nom: "db.table('x').delete() — le nom de table calculé",
      code: [
        'declare const db: { table(nom: string): { delete(): Promise<void> } };',
        "void db.table('answers').delete();",
      ].join('\n'),
    },
    {
      nom: 'base.answers.where(…).equals(…).delete() — l’écriture au bout d’une chaîne',
      code: [
        'declare const base: {',
        '  answers: { where(c: string): { equals(v: string): { delete(): Promise<number> } } };',
        '};',
        "void base.answers.where('missionId').equals('m').delete();",
      ].join('\n'),
    },
  ];

  for (const { nom, code } of FAUTIFS) {
    it(`@critique ${nom} remonte une erreur`, async () => {
      const verdict = await analyser(code, CHEMIN_SOUS_LA_REGLE);
      expect(verdict.fatales).toEqual([]);
      expect(verdict.ecrituresDexie).toHaveLength(1);
      // Le message doit NOMMER la sortie : une interdiction sans issue se
      // contourne, elle ne s'applique pas.
      expect(verdict.ecrituresDexie[0]).toContain('ecrireLocal');
      expect(verdict.ecrituresDexie[0]).toContain('appliquerDescente');
    });
  }

  it('@critique la règle mord sur CHACUNE des tables de `SCHEMA_LOCAL` — aucune n’est sortie de la liste en silence', async () => {
    // Le trou que `eslint.config.js` déclare lui-même : « PAS VU — une table
    // AJOUTÉE à SCHEMA_LOCAL sans l'être à TABLES_LOCALES ». La liste des
    // sélecteurs est recopiée à la main dans la configuration (un sélecteur
    // esquery ne sait pas lire un module) ; ce test est le seul endroit d'où la
    // dérive se voit, et il la voit le jour même.
    const tables = new Set<string>();
    for (const etape of SCHEMA_LOCAL) {
      for (const [table, definition] of Object.entries(etape.tables)) {
        if (definition === null) tables.delete(table);
        else tables.add(table);
      }
    }
    expect(tables.size).toBeGreaterThan(0); // anti-vacuité : la boucle a bien tourné

    const oubliees: string[] = [];
    for (const table of tables) {
      const code = [
        `declare const base: { ${table}: { put(valeur: unknown): Promise<string> } };`,
        `void base.${table}.put({});`,
      ].join('\n');
      const verdict = await analyser(code, CHEMIN_SOUS_LA_REGLE);
      expect(verdict.fatales).toEqual([]);
      if (verdict.ecrituresDexie.length === 0) oubliees.push(table);
    }
    expect(oubliees).toEqual([]);
  }, 30_000);

  it('l’angle mort DÉCLARÉ est bien celui qui est décrit : l’écriture par ALIAS n’est pas vue', async () => {
    // `eslint.config.js` l'écrit noir sur blanc (« PAS VU — l'écriture par alias »)
    // et motive le choix : viser les identifiants simples ferait rougir
    // `unSet.add(x)` partout. Ce test ne réclame pas de fermer le trou — il
    // garantit que la GLOSE reste vraie. Le jour où la règle mordra sur l'alias,
    // ce test rougira, et c'est la glose qu'il faudra corriger, pas la règle.
    const code = [
      'declare const base: { answers: { put(valeur: unknown): Promise<string> } };',
      'const table = base.answers;',
      'void table.put({});',
    ].join('\n');
    const verdict = await analyser(code, CHEMIN_SOUS_LA_REGLE);
    expect(verdict.fatales).toEqual([]);
    expect(verdict.ecrituresDexie).toEqual([]);
  });
});

// =============================================================================
// R2 — LES QUATRE FORMES QUE LA GLOSE ANNONÇAIT SANS LES VOIR, ET LE FAUX
// POSITIF QU'ELLE NIAIT
//
// Ajouté le 2026-09-05 par A26, depuis la revue croisée A29 du même jour (R2,
// MAJEUR) et le correctif d'A24 qui la ferme.
//
// ── CE QUI S'EST PASSÉ, ET POURQUOI CE FICHIER EN EST RESPONSABLE ───────────
// La version d'hier de ce test éprouvait les deux sens et les deux angles morts
// déclarés. Elle n'éprouvait PAS `.modify()` — et c'est exactement pour cela que
// l'écart a survécu : le commentaire du sélecteur ② citait `.toCollection()
// .modify(…)` comme un cas VU, `VERBES_ECRITURE_DEXIE` ne contenait pas
// `modify`, et personne n'avait mesuré. `Collection.modify()` et
// `Table.bulkUpdate()` sont des écritures Dexie 4 de plein droit
// (`dexie@4.4.5`, `dist/dexie.d.ts:443,446,792`) ; une écriture qui échappe à la
// règle est une écriture sans op d'outbox — « une donnée que la synchronisation
// ne remontera jamais », dit le message de la règle elle-même (05 §9.2-2). Le
// trou s'ouvrait à L6a, où la descente écrit par lots.
//
// ── LE SENS DE LECTURE, ET IL COMPTE ───────────────────────────────────────
// La GLOSE est éprouvée CONTRE le comportement mesuré, jamais l'inverse. Une
// glose qui ment est pire qu'une règle absente : on la lit au lieu de mesurer.
// Le jour où le sélecteur changera, ces tests diront lequel des deux — de la
// règle ou de sa description — a cessé d'être vrai.
//
// Traçabilité : E6, E33 ; 05 §9.2-2 ; `docs/conception/LOT_L5.md` §4.
// =============================================================================

/** Le texte LIVRÉ de la configuration — la glose se lit là où elle est écrite. */
const GLOSE_LIVREE = readFileSync(resolve(RACINE_DEPOT, 'eslint.config.js'), 'utf8');

describe('règle « écriture Dexie » — R2 : `modify` et `bulkUpdate` sont des écritures', () => {
  const ECRITURES_PAR_LOT = [
    {
      nom: 'base.answers.modify(…) — le verbe sur la table nommée (sélecteur ①)',
      code: [
        'declare const base: { answers: { modify(m: unknown): Promise<number> } };',
        'void base.answers.modify({ flagReview: 1 });',
      ].join('\n'),
    },
    {
      nom: 'base.answers.toCollection().modify(…) — la forme que la glose citait sans la voir',
      code: [
        'declare const base: {',
        '  answers: { toCollection(): { modify(m: unknown): Promise<number> } };',
        '};',
        'void base.answers.toCollection().modify({ flagReview: 1 });',
      ].join('\n'),
    },
    {
      nom: 'base.answers.where(…).equals(…).modify(…) — l’écriture par lot de L6a',
      code: [
        'declare const base: {',
        '  answers: {',
        '    where(c: string): { equals(v: string): { modify(m: unknown): Promise<number> } };',
        '  };',
        '};',
        "void base.answers.where('missionId').equals('m').modify({ flagReview: 1 });",
      ].join('\n'),
    },
    {
      nom: 'base.answers.bulkUpdate([…]) — `Table.bulkUpdate` de Dexie 4',
      code: [
        'declare const base: { answers: { bulkUpdate(v: unknown[]): Promise<number> } };',
        'void base.answers.bulkUpdate([]);',
      ].join('\n'),
    },
  ];

  for (const { nom, code } of ECRITURES_PAR_LOT) {
    it(`@critique ${nom} remonte une erreur`, async () => {
      // Anti-vacuité : la règle est bien active à ce chemin AVANT qu'on mesure.
      await verifierQueLaRegleMordIci(CHEMIN_SOUS_LA_REGLE);
      const verdict = await analyser(code, CHEMIN_SOUS_LA_REGLE);
      expect(verdict.fatales).toEqual([]);
      expect(verdict.ecrituresDexie).toHaveLength(1);
      expect(verdict.ecrituresDexie[0]).toContain('ecrireLocal');
    });
  }

  it('@critique la GLOSE annonce `modify` et `bulkUpdate` — et la mesure le confirme', () => {
    // Le sens de lecture de R2 : ce n'est pas la glose qui dit la vérité, c'est la
    // mesure. Ici on vérifie seulement qu'elles disent la MÊME chose — les quatre
    // tests ci-dessus ont déjà établi le comportement.
    expect(GLOSE_LIVREE).toContain('bulkUpdate');
    expect(GLOSE_LIVREE).toContain('modify');
  });
});

describe('règle « écriture Dexie » — R2 : les deux angles morts DÉCLARÉS le restent', () => {
  // Deux trous assumés, écrits dans la configuration. Ces tests ne demandent pas
  // de les fermer : ils garantissent que la description reste exacte. Le jour où
  // la règle mordra sur l'un des deux, c'est la GLOSE qu'il faudra corriger — et
  // ce test le dira ce jour-là, pas six mois plus tard.
  const ANGLES_MORTS = [
    {
      nom: 'l’ALIAS : `const t = base.answers; t.put(…)`',
      declaration: 'PAS VU — l’écriture par alias',
      code: [
        'declare const base: { answers: { put(valeur: unknown): Promise<string> } };',
        'const table = base.answers;',
        'void table.put({});',
      ].join('\n'),
    },
    {
      nom: 'la CLÉ CALCULÉE : `base["answers"].put(…)`',
      declaration: 'PAS VU — l’accès par clé CALCULÉE',
      code: [
        'declare const base: { answers: { put(valeur: unknown): Promise<string> } };',
        'void base["answers"].put({});',
      ].join('\n'),
    },
  ];

  for (const { nom, declaration, code } of ANGLES_MORTS) {
    it(`@critique ${nom} : muette, et la configuration le DÉCLARE`, async () => {
      expect(GLOSE_LIVREE).toContain(declaration);
      await verifierQueLaRegleMordIci(CHEMIN_SOUS_LA_REGLE);
      const verdict = await analyser(code, CHEMIN_SOUS_LA_REGLE);
      expect(verdict.fatales).toEqual([]);
      expect(verdict.ecrituresDexie).toEqual([]);
    });
  }
});

describe('règle « écriture Dexie » — R2 : le faux positif est réel, et il est ÉCRIT', () => {
  it('@critique `fichiers.get(id).clear()` sur une `Map` est repris — et la glose l’assume au lieu de le nier', async () => {
    // C'est le cas exact qu'A29 a mesuré et que la glose d'hier niait (« une
    // collection en mémoire ne s'écrit pas ainsi »). Le comportement n'a pas
    // changé — le sélecteur ② doit garder `db.table('x').delete()`, qui est une
    // vraie écriture Dexie —, c'est la DESCRIPTION qui a été mise en accord avec
    // lui. On éprouve donc les deux ensemble : la mesure d'abord, la glose ensuite.
    const code = [
      'const fichiers = new Map<string, Set<string>>();',
      "const id = 'a';",
      'fichiers.get(id)?.clear();',
      'const dejaVus = fichiers.get(id);',
      'dejaVus?.clear();',
    ].join('\n');
    const verdict = await analyser(code, CHEMIN_SOUS_LA_REGLE);
    expect(verdict.fatales).toEqual([]);
    // UNE seule : celle au résultat de l'appel. Le contournement par variable
    // intermédiaire (l'alias) passe — c'est ce que la glose propose.
    expect(verdict.ecrituresDexie).toHaveLength(1);

    // Et la configuration le dit, dans ces termes : « faux positif assumé ».
    expect(GLOSE_LIVREE).toContain('FAUX POSITIF ASSUMÉ');
    expect(GLOSE_LIVREE).toContain('fichiers.get(id).clear()');
  });
});
