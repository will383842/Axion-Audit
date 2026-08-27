// =============================================================================
// LE TROISIÈME SCHÉMA — `apps/api/src/db/schema.ts` FACE À LA BASE RÉELLE
//
// Le dépôt décrit son schéma TROIS fois : le fichier 04 (la spécification), les
// migrations SQL (ce qui est exécuté), et `apps/api/src/db/schema.ts` (ce que
// TypeScript croit). Les deux premières sont gardées — par `schema:diff` et par
// le méta-test qui le surveille. La troisième ne l'était par RIEN, alors que
// c'est elle qui typera toutes les requêtes des lots L2 à L13.
//
// LE PIÈGE, ET IL NE JOUE QUE DANS UN SENS. L'en-tête de `schema.ts` affirme que
// le diff schéma-vs-04 révélerait une divergence. C'est vrai si l'on FABRIQUAIT
// une migration DEPUIS ce fichier. Ce n'est pas vrai dans l'autre sens, qui est
// le sens réel du travail : une migration ajoute une colonne que `schema.ts`
// ignore, ou déclare `nullable` ce que la base impose `NOT NULL`, et alors
// `pnpm typecheck` est vert, `schema:diff` est vert, et TypeScript ment en
// silence à tout le code qui viendra. Les migrations 0010, 0011 et 0012 ont
// modifié nullabilité et défauts ; `schema.ts` a suivi à la main, sans filet.
//
// TROIS DIMENSIONS, ET PAS UNE DE PLUS :
//   1. les TABLES, dans les deux sens ;
//   2. les COLONNES, dans les deux sens ;
//   3. la NULLABILITÉ — la plus utile des trois, parce que c'est elle qui décide
//      si TypeScript rend `string` ou `string | null`, donc si le code appelant
//      doit gérer l'absence.
//
// LE TYPE SQL EXACT EST DÉLIBÉRÉMENT LAISSÉ DE CÔTÉ. La correspondance
// Drizzle↔PostgreSQL est indirecte (`text()` ↔ text, mais `numeric()` ↔ numeric
// avec ou sans précision, `jsonb()` ↔ jsonb, `timestamp({withTimezone:true})` ↔
// timestamptz…). Un contrôle approximatif sur ce point produirait un bruit
// permanent qu'on finirait par ignorer — et un contrôle qu'on ignore est pire
// qu'un contrôle absent. C'est `schema:diff`, face au manifeste extrait du
// fichier 04, qui garde les types ; ici on garde ce que `schema:diff` ne voit
// pas : la troisième description.
//
// LECTURE PAR LA MÉTADONNÉE, JAMAIS PAR UNE REGEX. Drizzle expose ses tables à
// l'exécution (`getTableConfig`). Écrire une expression régulière sur le source
// de `schema.ts` ajouterait un QUATRIÈME artefact décrivant le schéma — et il
// serait le premier à diverger.
// =============================================================================
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schemaDrizzle from '../src/db/schema.js';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  estJournalDeMigration,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
} from './aide/base-l1.js';

let nomBase = '';
let client: Client | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

/** Une colonne, vue de l'un ou l'autre côté. */
interface Colonne {
  nom: string;
  notNull: boolean;
}

/** Les tables déclarées par `schema.ts`, lues dans la métadonnée Drizzle. */
function tablesDeclarees(): Map<string, Map<string, Colonne>> {
  const tables = new Map<string, Map<string, Colonne>>();
  for (const valeur of Object.values(schemaDrizzle)) {
    if (!is(valeur, PgTable)) continue;
    const config = getTableConfig(valeur);
    if (estJournalDeMigration(config.name)) continue;
    const colonnes = new Map<string, Colonne>();
    for (const colonne of config.columns) {
      colonnes.set(colonne.name, { nom: colonne.name, notNull: colonne.notNull });
    }
    tables.set(config.name, colonnes);
  }
  return tables;
}

/** Les tables réellement présentes en base après migrations. */
async function tablesEnBase(connexion: Client): Promise<Map<string, Map<string, Colonne>>> {
  const resultat = await connexion.query<{
    table_name: string;
    column_name: string;
    is_nullable: string;
  }>(
    `SELECT c.table_name, c.column_name, c.is_nullable
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'`,
  );

  const tables = new Map<string, Map<string, Colonne>>();
  for (const ligne of resultat.rows) {
    if (estJournalDeMigration(ligne.table_name)) continue;
    let colonnes = tables.get(ligne.table_name);
    if (colonnes === undefined) {
      colonnes = new Map<string, Colonne>();
      tables.set(ligne.table_name, colonnes);
    }
    colonnes.set(ligne.column_name, {
      nom: ligne.column_name,
      notNull: ligne.is_nullable === 'NO',
    });
  }
  return tables;
}

interface Ecarts {
  tablesAbsentesDeSchemaTs: string[];
  tablesAbsentesDeLaBase: string[];
  colonnesAbsentesDeSchemaTs: string[];
  colonnesAbsentesDeLaBase: string[];
  nullabilite: string[];
}

/**
 * Compare les deux descriptions. La fonction rend des LISTES plutôt que de lever :
 * les tests de conformité les veulent vides, les preuves de détection les veulent
 * pleines — une seule logique sert aux deux.
 */
async function comparer(connexion: Client): Promise<Ecarts> {
  const declarees = tablesDeclarees();
  const reelles = await tablesEnBase(connexion);

  const ecarts: Ecarts = {
    tablesAbsentesDeSchemaTs: [],
    tablesAbsentesDeLaBase: [],
    colonnesAbsentesDeSchemaTs: [],
    colonnesAbsentesDeLaBase: [],
    nullabilite: [],
  };

  for (const table of reelles.keys()) {
    if (!declarees.has(table)) ecarts.tablesAbsentesDeSchemaTs.push(table);
  }
  for (const table of declarees.keys()) {
    if (!reelles.has(table)) ecarts.tablesAbsentesDeLaBase.push(table);
  }

  for (const [table, colonnesReelles] of reelles) {
    const colonnesDeclarees = declarees.get(table);
    if (colonnesDeclarees === undefined) continue;

    for (const [nom, reelle] of colonnesReelles) {
      const declaree = colonnesDeclarees.get(nom);
      if (declaree === undefined) {
        ecarts.colonnesAbsentesDeSchemaTs.push(`${table}.${nom}`);
        continue;
      }
      if (declaree.notNull !== reelle.notNull) {
        ecarts.nullabilite.push(
          `${table}.${nom} : base ${reelle.notNull ? 'NOT NULL' : 'nullable'} ` +
            `↔ schema.ts ${declaree.notNull ? 'notNull()' : 'nullable'}`,
        );
      }
    }

    for (const nom of colonnesDeclarees.keys()) {
      if (!colonnesReelles.has(nom)) ecarts.colonnesAbsentesDeLaBase.push(`${table}.${nom}`);
    }
  }

  return ecarts;
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);
  const base = await creerBaseEphemere('schemadrizzle');
  nomBase = base.nom;
  client = await connecter(base.url);
  await appliquerMontee(base.url);
}, 180_000);

afterAll(async () => {
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

describe('@critique schema.ts (Drizzle) face à la base réelle', () => {
  it("déclare TOUTES les tables de la base, et aucune qui n'existe pas", async () => {
    const ecarts = await comparer(bd());

    expect(
      ecarts.tablesAbsentesDeSchemaTs,
      `Tables présentes en base mais ABSENTES de schema.ts :\n  ` +
        `${ecarts.tablesAbsentesDeSchemaTs.join('\n  ')}\n\n` +
        `Ces tables sont invisibles pour toute requête typée : les lots L2 à L13 ne\n` +
        `pourront pas les interroger via Drizzle, et l'oubli ne se découvrira qu'au lot\n` +
        `qui en a besoin — c'est-à-dire trop tard pour que ce soit bon marché.`,
    ).toEqual([]);

    expect(
      ecarts.tablesAbsentesDeLaBase,
      `Tables déclarées dans schema.ts mais ABSENTES de la base :\n  ` +
        `${ecarts.tablesAbsentesDeLaBase.join('\n  ')}\n\n` +
        `Le cas le plus dangereux des deux : le code COMPILE, et il échoue à\n` +
        `l'exécution sur une relation qui n'existe pas. TypeScript ne peut rien dire —\n` +
        `il fait confiance à la déclaration.`,
    ).toEqual([]);
  }, 120_000);

  it('déclare exactement les mêmes COLONNES que la base, dans les deux sens', async () => {
    const ecarts = await comparer(bd());

    expect(
      ecarts.colonnesAbsentesDeSchemaTs,
      `Colonnes présentes en base mais ABSENTES de schema.ts :\n  ` +
        `${ecarts.colonnesAbsentesDeSchemaTs.join('\n  ')}\n\n` +
        `Une requête typée est AVEUGLE à une donnée qui existe pourtant. Le symptôme\n` +
        `n'est pas une erreur mais un manque : un champ qu'on croit vide alors qu'il est\n` +
        `rempli en base. Les migrations 0010 à 0012 ont touché plusieurs colonnes ;\n` +
        `c'est exactement le moment où ce genre d'oubli s'installe.`,
    ).toEqual([]);

    expect(
      ecarts.colonnesAbsentesDeLaBase,
      `Colonnes déclarées dans schema.ts mais ABSENTES de la base :\n  ` +
        `${ecarts.colonnesAbsentesDeLaBase.join('\n  ')}\n\n` +
        `Du code qui compile et qui échouera à l'exécution : Drizzle produira un SELECT\n` +
        `nommant une colonne inexistante. L'erreur tombe en production, pas au build.`,
    ).toEqual([]);
  }, 120_000);

  it('accorde sa NULLABILITÉ avec celle de la base — la dimension qui fait mentir un type', async () => {
    const ecarts = await comparer(bd());

    expect(
      ecarts.nullabilite,
      `Divergences de nullabilité entre la base et schema.ts :\n  ` +
        `${ecarts.nullabilite.join('\n  ')}\n\n` +
        `C'est la dimension la plus utile des trois, parce qu'elle change le TYPE rendu\n` +
        `à l'appelant : \`notNull()\` produit \`string\`, son absence \`string | null\`.\n` +
        `Les deux erreurs ne se valent pas :\n` +
        `  • un notNull() MANQUANT est bénin — le code gérera un NULL qui n'arrive jamais ;\n` +
        `  • un notNull() EN TROP est un piège — TypeScript promet une valeur là où la\n` +
        `    base autorise NULL, le code déréférence sans vérifier, et la panne tombe en\n` +
        `    production, sur la première ligne où la colonne est vide.\n` +
        `Aucun typecheck ne peut voir cet écart : il naît d'une affirmation, pas d'un calcul.`,
    ).toEqual([]);
  }, 120_000);
});

// =============================================================================
// PREUVES DE DÉTECTION — un contrôle qu'on n'a pas vu rougir ne prouve rien
//
// `schema.ts` est le périmètre d'A12 : on ne le mute pas. On mute LA BASE, qui
// est l'autre terme de la comparaison — une divergence est une divergence, quel
// que soit le côté qui bouge, et les quatre cas ci-dessous couvrent les trois
// dimensions dans les deux sens.
// =============================================================================
describe('@critique preuve que la comparaison schema.ts ↔ base DÉTECTE', () => {
  it('rougit sur une TABLE présente en base et absente de schema.ts', async () => {
    await bd().query(`CREATE TABLE mutation_a16_table_fantome (id uuid PRIMARY KEY)`);
    try {
      const ecarts = await comparer(bd());
      expect(
        ecarts.tablesAbsentesDeSchemaTs,
        `Une table a été créée en base et la comparaison ne l'a pas signalée :\n` +
          `le contrôle de la dimension « tables » ne fonctionne pas, et sa version verte\n` +
          `ci-dessus ne prouvait donc rien.`,
      ).toContain('mutation_a16_table_fantome');
    } finally {
      await bd().query(`DROP TABLE IF EXISTS mutation_a16_table_fantome`);
    }
  }, 120_000);

  it('rougit sur une COLONNE ajoutée en base et absente de schema.ts', async () => {
    await bd().query(`ALTER TABLE missions ADD COLUMN mutation_a16_colonne text`);
    try {
      const ecarts = await comparer(bd());
      expect(
        ecarts.colonnesAbsentesDeSchemaTs,
        `Une colonne a été ajoutée à missions et la comparaison ne l'a pas signalée :\n` +
          `le contrôle de la dimension « colonnes » (sens base → schema.ts) est inopérant.`,
      ).toContain('missions.mutation_a16_colonne');
    } finally {
      await bd().query(`ALTER TABLE missions DROP COLUMN IF EXISTS mutation_a16_colonne`);
    }
  }, 120_000);

  it('rougit sur une COLONNE déclarée dans schema.ts et absente de la base', async () => {
    // `missions.nda_ref` : colonne TEXT nullable et sans contrainte au fichier 04
    // §7 (« nda_ref TEXT NULL »). La retirer simule l'erreur symétrique — celle
    // qui compile et casse à l'exécution.
    await bd().query(`ALTER TABLE missions DROP COLUMN nda_ref`);
    try {
      const ecarts = await comparer(bd());
      expect(
        ecarts.colonnesAbsentesDeLaBase,
        `Une colonne déclarée par schema.ts a été retirée de la base et la comparaison\n` +
          `ne l'a pas signalée : le sens schema.ts → base est inopérant. C'est pourtant\n` +
          `le sens dangereux, celui qui laisse compiler du code voué à échouer.`,
      ).toContain('missions.nda_ref');
    } finally {
      await bd().query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS nda_ref text`);
    }
  }, 120_000);

  it('rougit sur une NULLABILITÉ divergente', async () => {
    // On choisit la cible dans la métadonnée plutôt que de la figer : le test
    // suit `schema.ts` là où il est, sans jamais transcrire son contenu.
    const declarees = tablesDeclarees();
    const colonnesAnswers = declarees.get('answers');
    const cible = [...(colonnesAnswers?.values() ?? [])].find(
      (colonne) => colonne.notNull && colonne.nom !== 'id',
    );
    expect(
      cible,
      `Aucune colonne notNull() hors clé primaire sur answers dans schema.ts : la\n` +
        `mutation de nullabilité ne peut pas être jouée. Si schema.ts n'affirme AUCUN\n` +
        `notNull() sur la table centrale de la collecte, c'est en soi un constat.`,
    ).toBeDefined();
    const nom = cible?.nom ?? '';

    await bd().query(`ALTER TABLE answers ALTER COLUMN ${nom} DROP NOT NULL`);
    try {
      const ecarts = await comparer(bd());
      expect(
        ecarts.nullabilite.join(' · '),
        `answers.${nom} est passée nullable en base alors que schema.ts la déclare\n` +
          `notNull(), et la comparaison n'a rien dit. C'est la dimension la plus utile\n` +
          `des trois qui serait inopérante : TypeScript continuerait de promettre une\n` +
          `valeur là où la base accepte désormais NULL.`,
      ).toContain(`answers.${nom}`);
    } finally {
      await bd().query(`ALTER TABLE answers ALTER COLUMN ${nom} SET NOT NULL`);
    }
  }, 120_000);

  it('revient à zéro écart après toutes les réparations', async () => {
    const ecarts = await comparer(bd());
    const total =
      ecarts.tablesAbsentesDeSchemaTs.length +
      ecarts.tablesAbsentesDeLaBase.length +
      ecarts.colonnesAbsentesDeSchemaTs.length +
      ecarts.colonnesAbsentesDeLaBase.length +
      ecarts.nullabilite.length;

    expect(
      total,
      `Les mutations de ce fichier n'ont pas toutes été défaites :\n` +
        `${JSON.stringify(ecarts, null, 2)}\n\n` +
        `Une réparation incomplète rendrait les exécutions suivantes ininterprétables.`,
    ).toBe(0);
  }, 120_000);
});
