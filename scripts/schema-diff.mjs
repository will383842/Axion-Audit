#!/usr/bin/env node
// =============================================================================
// DIFF SCHÉMA-VS-04 — critère d'acceptation du lot L1, contrôle permanent en CI
//
// Contrat 11 §7 : « diff schéma-vs-04 (V2.9 — base de comparaison DÉFINIE : le diff
// porte sur tables, colonnes, contraintes PK/FK/UNIQUE/CHECK et index du §7.1,
// comparés à un manifeste `schema-manifest.json` EXTRAIT du fichier 04, commité au
// lot L1 et relu ligne à ligne à la porte P-A ; types non précisés par le 04 = TEXT,
// conventions en tête du 04) ». DoD transverse : « diff schéma-vs-04 = zéro écart ».
//
// CE QUE CE SCRIPT COMPARE — et rien d'autre, exactement le périmètre du 11 §7 :
//   1. TABLES              présence, et AUCUNE table de trop ;
//   2. COLONNES            présence, type normalisé, et aucune colonne de trop ;
//   3. CONTRAINTES         PK / FK / UNIQUE / CHECK, par NOM, avec leur contenu
//                          (colonnes, cible de FK, ensemble de valeurs d'un enum) ;
//   4. INDEX du §7.1       nom, table, méthode, colonnes, unicité, prédicat partiel.
// Hors périmètre ASSUMÉ (le 11 §7 ne les cite pas) : nullabilité, valeurs par
// défaut, commentaires, ordre des colonnes, privilèges.
//
// DIRECTION DU CONTRÔLE : le manifeste est la RÉFÉRENCE (il est extrait du fichier
// 04) ; la base est le SUJET. Un écart dans un sens comme dans l'autre est un
// échec — une table en trop dans la base est aussi grave qu'une table manquante :
// c'est du schéma que le fichier 04 n'a jamais autorisé.
//
// ÉTAT AU LOT L0 : le manifeste était un livrable à venir ; le script sortait en 0
// avec un avertissement tant que `apps/api/drizzle/` n'existait pas. Ce garde-fou
// est CONSERVÉ tel quel ci-dessous — il protège toujours un dépôt fraîchement
// cloné dont on aurait retiré les migrations.
// Traçabilité : E17, E36, E43 · critère L1 du fichier 07.
// =============================================================================
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// `pg` est une dépendance de l'API (11 §1), pas de la racine du monorepo : on la
// résout depuis `apps/api` plutôt que d'ajouter une dépendance racine — le 11 §8.1
// interdit d'élargir la liste des dépendances sans arbitrage humain.
const requireApi = createRequire(resolve(import.meta.dirname, '..', 'apps/api/package.json'));

const ROUGE = '[31m';
const VERT = '[32m';
const JAUNE = '[33m';
const GRIS = '[90m';
const RAZ = '[0m';

const RACINE = resolve(import.meta.dirname, '..');
const MANIFESTE = resolve(RACINE, 'apps/api/schema-manifest.json');
const DOSSIER_MIGRATIONS = resolve(RACINE, 'apps/api/drizzle');

/** Table du journal de migrations : outillage, absente du fichier 04 par nature. */
const TABLES_HORS_PERIMETRE = new Set(['schema_migrations']);

const l1Livre = existsSync(DOSSIER_MIGRATIONS);

if (!existsSync(MANIFESTE)) {
  if (l1Livre) {
    console.error(
      `${ROUGE}✗ diff schéma-vs-04 : manifeste introuvable alors que L1 est livré.${RAZ}`,
    );
    console.error(`  Attendu : apps/api/schema-manifest.json`);
    console.error(
      '  Le manifeste est EXTRAIT du fichier 04 (docs/04_MODELE_DE_DONNEES.md), commité au\n' +
        '  lot L1 et relu LIGNE À LIGNE à la porte P-A (11 §7). Sans lui, le critère\n' +
        '  « diff schéma-vs-04 = zéro écart » ne peut pas être coché — et un critère\n' +
        '  non vérifiable n’est pas un critère coché.\n',
    );
    process.exit(1);
  }
  console.log(
    `${JAUNE}⚠ diff schéma-vs-04 : NON APPLICABLE — le lot L1 n’est pas livré.${RAZ}\n` +
      '  Le manifeste `apps/api/schema-manifest.json` est un livrable du lot L1 (11 §7).\n' +
      '  Ce contournement disparaît AUTOMATIQUEMENT dès que `apps/api/drizzle/` existe :\n' +
      '  à partir de là, un manifeste manquant est une erreur bloquante.\n' +
      '  Rien n’est ici déclaré conforme : le contrôle est simplement sans objet.\n',
  );
  process.exit(0);
}

const manifeste = JSON.parse(readFileSync(MANIFESTE, 'utf8'));

// Le `.env` de la racine reste la source unique en local (comme pour db:migrate).
if (!process.env.DATABASE_URL) {
  const fichierEnv = resolve(RACINE, '.env');
  if (existsSync(fichierEnv)) {
    try {
      process.loadEnvFile(fichierEnv);
    } catch {
      /* un .env illisible ne doit pas masquer le message utile ci-dessous */
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error(`${ROUGE}✗ diff schéma-vs-04 : DATABASE_URL absente.${RAZ}`);
  console.error('  Le diff compare le schéma RÉEL à celui du fichier 04 : il lui faut une base.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Normalisations
// ---------------------------------------------------------------------------

/**
 * Type PostgreSQL interne (`udt_name`) → vocabulaire du manifeste.
 * Le manifeste parle la langue du fichier 04 (« TEXT », « TIMESTAMPTZ »,
 * « JSONB »…), pas celle du catalogue système.
 */
const TYPES = new Map([
  ['uuid', 'uuid'],
  ['text', 'text'],
  // `varchar` n'est PAS un alias de `text` : le 04 ne prescrit jamais de longueur
  // bornée, et une colonne passée en varchar(n) est un écart, pas un synonyme.
  ['varchar', 'varchar'],
  ['int4', 'integer'],
  ['int8', 'bigint'],
  ['numeric', 'numeric'],
  ['bool', 'boolean'],
  ['jsonb', 'jsonb'],
  ['timestamptz', 'timestamptz'],
  ['timestamp', 'timestamp'],
  ['date', 'date'],
]);

function typeNormalise(udtName) {
  return TYPES.get(udtName) ?? udtName;
}

/** Comparaison d'expressions SQL : la mise en forme du catalogue n'est pas un écart. */
function expressionNormalisee(sql) {
  return String(sql ?? '')
    .toLowerCase()
    .replace(/::[a-z_ ]+(\[\])?/g, '') // casts explicites ajoutés par le catalogue
    .replace(/[\s()"]/g, '');
}

/** Extrait l'ensemble des littéraux d'une définition de CHECK enum. */
function litterauxDe(definition) {
  return new Set([...String(definition).matchAll(/'([^']*)'/g)].map((m) => m[1]));
}

/**
 * Découpe `CREATE [UNIQUE] INDEX nom ON schema.table USING methode (cols) [WHERE p]`.
 * On lit `indexdef`, la forme canonique produite par PostgreSQL lui-même : elle est
 * stable, contrairement au SQL que nous avons écrit à la main.
 */
function analyserIndexdef(indexdef) {
  const re =
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+(\S+)\s+ON\s+\S+\s+USING\s+(\w+)\s+\((.+?)\)(?:\s+WHERE\s+(.+))?$/i;
  const m = re.exec(indexdef);
  if (!m) return null;
  return {
    unique: Boolean(m[1]),
    nom: m[2],
    methode: m[3].toLowerCase(),
    colonnes: m[4].split(',').map((c) => c.trim().replace(/\s+.*$/, '')),
    predicat: m[5] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------
async function introspecter(client) {
  const tables = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `);

  const colonnes = await client.query(`
    SELECT table_name, column_name, udt_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, column_name
  `);

  const contraintes = await client.query(`
    SELECT c.conname                                   AS nom,
           c.contype                                   AS type,
           rel.relname                                 AS table_name,
           pg_get_constraintdef(c.oid)                 AS definition
      FROM pg_constraint c
      JOIN pg_class rel      ON rel.oid = c.conrelid
      JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = 'public'
       AND c.contype IN ('p', 'f', 'u', 'c')
     ORDER BY rel.relname, c.conname
  `);

  const index = await client.query(`
    SELECT tablename AS table_name, indexname AS nom, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname
  `);

  return {
    tables: tables.rows,
    colonnes: colonnes.rows,
    contraintes: contraintes.rows,
    index: index.rows,
  };
}

// ---------------------------------------------------------------------------
// Comparaison
// ---------------------------------------------------------------------------
/**
 * Les index que le manifeste DÉCLARE, toutes provenances confondues :
 * `indexCritiques` (04 §7.1) + `indexEtablisParConvention` (« FK indexées », §7).
 * Les deux sections sont séparées dans le fichier pour que la porte P-A voie
 * d'où vient chaque ligne ; elles sont vérifiées de la même façon.
 */
function indexDeclares(manifeste) {
  return [...(manifeste.indexCritiques ?? []), ...(manifeste.indexEtablisParConvention ?? [])];
}

function comparer(manifeste, base) {
  /** @type {{categorie: string, message: string}[]} */
  const ecarts = [];
  /** Index présents en base mais non déclarés : information de revue, jamais un échec. */
  const signalements = [];
  const ecart = (categorie, message) => ecarts.push({ categorie, message });

  const tablesBase = new Set(
    base.tables.map((t) => t.table_name).filter((n) => !TABLES_HORS_PERIMETRE.has(n)),
  );
  const tablesManifeste = new Set(Object.keys(manifeste.tables));

  // --- 1. TABLES -----------------------------------------------------------
  for (const t of tablesManifeste) {
    if (!tablesBase.has(t)) ecart('table', `table MANQUANTE en base : ${t}`);
  }
  for (const t of tablesBase) {
    if (!tablesManifeste.has(t)) {
      ecart('table', `table EN TROP en base (absente du fichier 04) : ${t}`);
    }
  }

  // --- 2. COLONNES ---------------------------------------------------------
  const colonnesParTable = new Map();
  for (const c of base.colonnes) {
    if (!colonnesParTable.has(c.table_name)) colonnesParTable.set(c.table_name, new Map());
    colonnesParTable.get(c.table_name).set(c.column_name, typeNormalise(c.udt_name));
  }

  for (const [table, def] of Object.entries(manifeste.tables)) {
    const reelles = colonnesParTable.get(table);
    if (!reelles) continue; // table manquante : déjà signalée
    for (const [col, typeAttendu] of Object.entries(def.columns)) {
      const typeReel = reelles.get(col);
      if (typeReel === undefined) {
        ecart('colonne', `${table}.${col} MANQUANTE en base`);
      } else if (typeReel !== typeAttendu) {
        ecart('colonne', `${table}.${col} : type ${typeReel} en base, ${typeAttendu} au 04`);
      }
    }
    for (const col of reelles.keys()) {
      if (!(col in def.columns)) ecart('colonne', `${table}.${col} EN TROP en base`);
    }
  }

  // --- 3. CONTRAINTES PK / FK / UNIQUE / CHECK ------------------------------
  const contraintesParNom = new Map(base.contraintes.map((c) => [c.nom, c]));
  const attendues = new Set();

  for (const [table, def] of Object.entries(manifeste.tables)) {
    // 3a. PK
    const pk = def.primaryKey;
    if (pk) {
      attendues.add(pk.name);
      const reelle = contraintesParNom.get(pk.name);
      if (!reelle || reelle.type !== 'p') {
        ecart('contrainte', `PK MANQUANTE : ${pk.name} sur ${table}`);
      } else if (
        expressionNormalisee(reelle.definition) !==
        expressionNormalisee(`PRIMARY KEY (${pk.columns.join(', ')})`)
      ) {
        ecart(
          'contrainte',
          `PK ${pk.name} : ${reelle.definition} ≠ colonnes ${pk.columns.join(', ')}`,
        );
      }
    }

    // 3b. UNIQUE
    for (const u of def.unique ?? []) {
      attendues.add(u.name);
      const reelle = contraintesParNom.get(u.name);
      if (!reelle || reelle.type !== 'u') {
        ecart('contrainte', `UNIQUE MANQUANTE : ${u.name} sur ${table}`);
      } else if (
        expressionNormalisee(reelle.definition) !==
        expressionNormalisee(`UNIQUE (${u.columns.join(', ')})`)
      ) {
        ecart(
          'contrainte',
          `UNIQUE ${u.name} : ${reelle.definition} ≠ colonnes ${u.columns.join(', ')}`,
        );
      }
    }

    // 3c. FK
    for (const f of def.foreignKeys ?? []) {
      attendues.add(f.name);
      const reelle = contraintesParNom.get(f.name);
      if (!reelle || reelle.type !== 'f') {
        ecart('contrainte', `FK MANQUANTE : ${f.name} sur ${table}`);
        continue;
      }
      const attendu = `FOREIGN KEY (${f.columns.join(', ')}) REFERENCES ${f.references.table}(${f.references.columns.join(', ')})`;
      if (expressionNormalisee(reelle.definition) !== expressionNormalisee(attendu)) {
        ecart('contrainte', `FK ${f.name} : « ${reelle.definition} » ≠ « ${attendu} »`);
      }
    }

    // 3d. CHECK
    for (const k of def.checks ?? []) {
      attendues.add(k.name);
      const reelle = contraintesParNom.get(k.name);
      if (!reelle || reelle.type !== 'c') {
        ecart('contrainte', `CHECK MANQUANTE : ${k.name} sur ${table}`);
        continue;
      }
      if (k.kind === 'enum') {
        const attendues2 = new Set(k.values);
        const reelles = litterauxDe(reelle.definition);
        const manquantes = [...attendues2].filter((v) => !reelles.has(v));
        const enTrop = [...reelles].filter((v) => !attendues2.has(v));
        if (!expressionNormalisee(reelle.definition).includes(k.column.toLowerCase())) {
          ecart('contrainte', `CHECK ${k.name} ne porte pas sur la colonne ${k.column}`);
        }
        if (manquantes.length > 0) {
          ecart('contrainte', `CHECK ${k.name} : valeurs manquantes ${manquantes.join(', ')}`);
        }
        if (enTrop.length > 0) {
          ecart('contrainte', `CHECK ${k.name} : valeurs en trop ${enTrop.join(', ')}`);
        }
      } else if (k.kind === 'expression') {
        // Cohérence composite (ex. step_validations step_code ↔ scope) : on compare
        // l'expression normalisée, littéral par littéral et opérateur par opérateur.
        if (
          expressionNormalisee(reelle.definition) !== expressionNormalisee(`CHECK ${k.expression}`)
        ) {
          ecart(
            'contrainte',
            `CHECK ${k.name} : expression divergente.\n      base : ${reelle.definition}\n      04   : CHECK ${k.expression}`,
          );
        }
      }
    }
  }

  // 3e. Contraintes de la base absentes du manifeste (schéma non autorisé).
  //     Les NOT NULL (contype 'c' implicite) n'existent pas dans pg_constraint :
  //     rien n'est donc signalé à tort ici, la nullabilité restant hors périmètre.
  for (const c of base.contraintes) {
    if (TABLES_HORS_PERIMETRE.has(c.table_name)) continue;
    if (!attendues.has(c.nom)) {
      ecart(
        'contrainte',
        `contrainte EN TROP en base : ${c.nom} sur ${c.table_name} (${c.definition})`,
      );
    }
  }

  // --- 4. INDEX DÉCLARÉS ---------------------------------------------------
  //
  // DEUX SECTIONS, DEUX PROVENANCES, MÊME EXIGENCE :
  //   · `indexCritiques`            → énumérés nommément au 04 §7.1 ;
  //   · `indexEtablisParConvention` → posés par la convention « FK indexées »
  //                                   des conventions en tête du 04 §7.
  // Les deux sont VÉRIFIÉES : ce qui est déclaré est tenu. Un index déclaré et
  // manquant, ou dont la forme a changé, reste un écart bloquant.
  //
  // EN REVANCHE, UN INDEX NON DÉCLARÉ N'EST PLUS UN ÉCART (correction A01,
  // retour d'étape 2). Le 11 §7 borne le diff aux « index du §7.1 », et le §7.1
  // s'intitule « Index CRITIQUES » : c'est un sous-ensemble DÉSIGNÉ, pas une
  // liste exhaustive. Le contrat ne dit nulle part qu'aucun autre index ne peut
  // exister — et refuser tout index supplémentaire interdirait à un lot
  // ultérieur d'optimiser une requête sans amender un manifeste censé être
  // l'extrait d'un fichier scellé. Ces index sont donc SIGNALÉS, pas condamnés :
  // le relecteur de la porte P-A les voit, la CI ne rougit pas.
  const indexParNom = new Map();
  for (const i of base.index) {
    if (TABLES_HORS_PERIMETRE.has(i.table_name)) continue;
    indexParNom.set(i.nom, {
      ...analyserIndexdef(i.indexdef),
      table: i.table_name,
      brut: i.indexdef,
    });
  }

  const indexAttendus = new Set();
  for (const idx of indexDeclares(manifeste)) {
    indexAttendus.add(idx.name);
    const reel = indexParNom.get(idx.name);
    if (!reel) {
      ecart('index', `index MANQUANT : ${idx.name} sur ${idx.table} (${idx.source})`);
      continue;
    }
    if (reel.table !== idx.table) {
      ecart('index', `index ${idx.name} : porté par ${reel.table}, attendu sur ${idx.table}`);
    }
    if (reel.unique !== Boolean(idx.unique)) {
      ecart(
        'index',
        `index ${idx.name} : unique=${String(reel.unique)}, attendu ${String(Boolean(idx.unique))}`,
      );
    }
    if (reel.methode !== (idx.method ?? 'btree')) {
      ecart(
        'index',
        `index ${idx.name} : méthode ${reel.methode}, attendue ${idx.method ?? 'btree'}`,
      );
    }
    if (reel.colonnes.join(',') !== idx.columns.join(',')) {
      ecart(
        'index',
        `index ${idx.name} : colonnes (${reel.colonnes.join(', ')}), attendues (${idx.columns.join(', ')})`,
      );
    }
    if (expressionNormalisee(reel.predicat) !== expressionNormalisee(idx.where)) {
      ecart(
        'index',
        `index ${idx.name} : prédicat partiel « ${reel.predicat ?? '—'} », attendu « ${idx.where ?? '—'} »`,
      );
    }
  }

  // 4b. Index NON DÉCLARÉS : information, pas écart (voir le motif ci-dessus).
  //     Ceux qui matérialisent une PK ou une UNIQUE sont déjà contrôlés au
  //     point 3 : les répéter ici ne serait que du bruit.
  for (const [nom, reel] of indexParNom) {
    if (indexAttendus.has(nom)) continue;
    if (attendues.has(nom)) continue; // index porté par une contrainte déclarée
    signalements.push(`${nom} sur ${reel.table} — ${reel.brut}`);
  }

  return { ecarts, signalements };
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
const pg = requireApi('pg');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
} catch (err) {
  console.error(`${ROUGE}✗ diff schéma-vs-04 : PostgreSQL injoignable — ${err.message}${RAZ}`);
  process.exit(1);
}

let ecarts;
let signalements;
try {
  ({ ecarts, signalements } = comparer(manifeste, await introspecter(client)));
} finally {
  await client.end();
}

const nbTables = Object.keys(manifeste.tables).length;
const nbColonnes = Object.values(manifeste.tables).reduce(
  (n, t) => n + Object.keys(t.columns).length,
  0,
);
const nbContraintes = Object.values(manifeste.tables).reduce(
  (n, t) =>
    n +
    (t.primaryKey ? 1 : 0) +
    (t.unique?.length ?? 0) +
    (t.foreignKeys?.length ?? 0) +
    (t.checks?.length ?? 0),
  0,
);

const nbCritiques = manifeste.indexCritiques?.length ?? 0;
const nbConvention = manifeste.indexEtablisParConvention?.length ?? 0;

/**
 * Les index non déclarés sont imprimés QUELLE QUE SOIT l'issue du diff : leur
 * intérêt est d'être vus en revue, pas de faire échouer un build.
 */
function imprimerSignalements(sortie) {
  if (signalements.length === 0) return;
  sortie(
    `  ${JAUNE}${String(signalements.length)} index présent(s) en base et non déclaré(s) au manifeste${RAZ}\n` +
      `  ${GRIS}Information, PAS un écart : le 11 §7 borne le diff aux « index du §7.1 »,\n` +
      `  qui est un sous-ensemble « critique », pas une liste exhaustive.${RAZ}`,
  );
  for (const s of signalements) sortie(`    ${GRIS}${s}${RAZ}`);
}

if (ecarts.length === 0) {
  console.log(
    `${VERT}✓${RAZ} diff schéma-vs-04 : ZÉRO ÉCART.\n` +
      `  ${GRIS}${String(nbTables)} tables · ${String(nbColonnes)} colonnes · ` +
      `${String(nbContraintes)} contraintes PK/FK/UNIQUE/CHECK · ` +
      `${String(nbCritiques)} index du §7.1 · ` +
      `${String(nbConvention)} index de convention (« FK indexées », §7)${RAZ}\n` +
      `  ${GRIS}manifeste : apps/api/schema-manifest.json (extrait de ${manifeste.source})${RAZ}`,
  );
  imprimerSignalements((l) => {
    console.log(l);
  });
  process.exit(0);
}

console.error(`${ROUGE}✗ diff schéma-vs-04 : ${String(ecarts.length)} ÉCART(S).${RAZ}\n`);
for (const categorie of ['table', 'colonne', 'contrainte', 'index']) {
  const lot = ecarts.filter((e) => e.categorie === categorie);
  if (lot.length === 0) continue;
  console.error(`  ${JAUNE}${categorie.toUpperCase()} (${String(lot.length)})${RAZ}`);
  for (const e of lot) console.error(`    ${e.message}`);
  console.error('');
}
imprimerSignalements((l) => {
  console.error(l);
});
console.error('');
console.error(
  '  La DoD transverse exige ZÉRO écart. Deux corrections possibles, jamais une troisième :\n' +
    '    · le schéma diverge du fichier 04  → corriger la MIGRATION ;\n' +
    '    · le manifeste diverge du fichier 04 → corriger le MANIFESTE.\n' +
    '  Modifier le fichier 04 pour faire taire ce contrôle est interdit (11 §8.2) :\n' +
    '  le schéma est scellé, son amendement passe par la revue de spec de la porte P-D.\n',
);
process.exit(1);
