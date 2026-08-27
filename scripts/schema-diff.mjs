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
//   2. COLONNES            présence, TYPE avec son modificateur (numeric(4,1) ne
//                          se confond pas avec numeric), NULLABILITÉ, valeur par
//                          DÉFAUT, et aucune colonne de trop ;
//   3. CONTRAINTES         PK / FK / UNIQUE / CHECK, par NOM, avec leur DÉFINITION
//                          ENTIÈRE normalisée (opérateur et parenthèses compris),
//                          et refus de toute contrainte posée NOT VALID ;
//   4. INDEX               ceux que le manifeste déclare — §7.1 et convention
//                          « FK indexées » — nom, table, méthode, colonnes,
//                          unicité, prédicat partiel. Un index de lecture non
//                          déclaré est signalé ; un index UNIQUE non déclaré est
//                          un ÉCART (l'unicité est une contrainte, 11 §7).
// CE QUI RESTE HORS PÉRIMÈTRE, et cette fois pour de bon : commentaires, ordre
// des colonnes, privilèges. Le fichier 04 ne les fixe pas — il n'y a rien à
// comparer.
//
// (Une version antérieure y rangeait aussi la NULLABILITÉ et les VALEURS PAR
// DÉFAUT, « puisque le 11 §7 ne les cite pas ». C'était une hypothèse, et elle
// était fausse : le 11 §7 borne le diff aux « tables, COLONNES, contraintes… »
// sans rien exclure nommément, et il restait à décider ce que « comparer une
// colonne » veut dire. Arbitrage A01 : ce qui la DÉFINIT, quand le fichier 04
// l'écrit — et le 04 écrit les trois. Il marque `NULL` là où le NULL est voulu
// (`siren TEXT NULL`), donc l'absence de marqueur est une information ; il écrit
// `DEFAULT 'Europe/Paris'`, `DEFAULT 'a_planifier'` ; il type `NUMERIC` sans
// précision, ce qui est un choix — un score que le stockage ne borne pas.
// A16 avait prouvé le coût de l'hypothèse : un `NOT NULL` retiré de
// `answers.interview_id` désarme l'UNIQUE du lot, un `DEFAULT 'UTC'` sur
// `missions.timezone` décale l'affichage de tous les créneaux d'entretien, et un
// `numeric(4,1)` arrondit les scores sans jamais lever d'erreur — les trois
// passaient à ZÉRO ÉCART. C'est aussi ce qui GARDE la migration 0010 : sans ce
// contrôle, les NOT NULL de traçabilité pourraient être relâchés plus tard sans
// que la CI bronche, et une révision sans auteur redeviendrait possible.)
//
// DIRECTION DU CONTRÔLE : le manifeste est la RÉFÉRENCE (il est extrait du fichier
// 04) ; la base est le SUJET. Un écart dans un sens comme dans l'autre est un
// échec — une table en trop dans la base est aussi grave qu'une table manquante :
// c'est du schéma que le fichier 04 n'a jamais autorisé.
//
// ÉCHAPPATOIRE DU LOT L0 : RETIRÉE. Tant que le manifeste et `apps/api/drizzle/`
// n'existaient pas, ce script sortait en 0 avec un avertissement. Les deux
// existent désormais, et un contrôle qui n'a RIEN COMPARÉ ne doit jamais sortir
// vert — c'est le « échec DÉLIBÉRÉ plutôt qu'un zéro écart non vérifié » que le
// lot L0 s'était lui-même fixé. Manifeste ou migrations manquants = exit 1.
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

// L'ÉCHAPPATOIRE DU LOT L0 A ÉTÉ RETIRÉE (mineur de la seconde passe de revue).
// Tant que ni le manifeste ni `apps/api/drizzle/` n'existaient, ce script sortait
// en 0 avec un avertissement. Le lot L1 est livré : les deux existent, et un
// contrôle qui n'a RIEN COMPARÉ ne doit jamais sortir vert — c'est précisément le
// « échec DÉLIBÉRÉ plutôt qu'un zéro écart non vérifié » que le L0 s'était fixé.
// La CI ne l'utilisait déjà plus ; en local elle survivait.
if (!existsSync(MANIFESTE)) {
  console.error(`${ROUGE}✗ diff schéma-vs-04 : manifeste introuvable.${RAZ}`);
  console.error(`  Attendu : apps/api/schema-manifest.json`);
  console.error(
    '  Le manifeste est EXTRAIT du fichier 04 (docs/04_MODELE_DE_DONNEES.md), commité au\n' +
      '  lot L1 et relu LIGNE À LIGNE à la porte P-A (11 §7). Sans lui, le critère\n' +
      '  « diff schéma-vs-04 = zéro écart » ne peut pas être coché — et un critère\n' +
      '  non vérifiable n’est pas un critère coché.\n',
  );
  process.exit(1);
}

if (!existsSync(DOSSIER_MIGRATIONS)) {
  console.error(`${ROUGE}✗ diff schéma-vs-04 : apps/api/drizzle/ introuvable.${RAZ}`);
  console.error(
    '  Le manifeste existe mais les migrations qui produisent le schéma ont disparu :\n' +
      '  comparer la base à ce manifeste ne prouverait plus rien sur le dépôt.\n',
  );
  process.exit(1);
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
 * Type rendu par `format_type()` → vocabulaire du manifeste.
 * Le manifeste parle la langue du fichier 04 (« TEXT », « TIMESTAMPTZ »,
 * « JSONB »…), pas celle du catalogue système. On ne traduit QUE les noms ;
 * le MODIFICATEUR est conservé tel quel : `numeric(4,1)` reste
 * `numeric(4,1)` et ne se confond donc jamais avec `numeric`, de même que
 * `varchar(50)` ne se confond pas avec `text`. Le 04 ne prescrit jamais de
 * précision ni de longueur bornée : toute apparition d'un modificateur est un
 * écart, pas un synonyme.
 */
const TYPES = new Map([
  ['timestamp with time zone', 'timestamptz'],
  ['timestamp without time zone', 'timestamp'],
  ['character varying', 'varchar'],
  ['character', 'char'],
  ['double precision', 'float8'],
]);

function typeNormalise(typeComplet) {
  const brut = String(typeComplet);
  // Le modificateur est la parenthèse FINALE : « (4,1) » de numeric(4,1),
  // « (50) » de character varying(50). Il est conservé tel quel — c'est lui qui
  // empêche numeric(4,1) de se confondre avec numeric.
  const modificateur = /\([^()]*\)$/.exec(brut)?.[0] ?? '';
  const nom = modificateur === '' ? brut : brut.slice(0, -modificateur.length);
  return (TYPES.get(nom) ?? nom) + modificateur;
}

/**
 * Déclaration de colonne du manifeste → { type, nonNul, defaut }.
 *
 * Le manifeste décrit chaque colonne par une CHAÎNE qui se lit comme du DDL :
 *     "uuid NOT NULL"
 *     "text"
 *     "timestamptz NOT NULL DEFAULT now()"
 *     "text NOT NULL DEFAULT 'Europe/Paris'"
 * C'est délibéré : le manifeste est relu LIGNE À LIGNE par un humain à la porte
 * P-A (11 §7). Une forme qui ressemble à la colonne du fichier 04 se vérifie à
 * l'œil ; un objet JSON à trois champs par colonne ferait 1 400 lignes illisibles.
 */
function analyserDeclarationColonne(declaration) {
  let reste = String(declaration).trim();
  let defaut = null;
  const iDefaut = reste.indexOf(' DEFAULT ');
  if (iDefaut >= 0) {
    defaut = reste.slice(iDefaut + ' DEFAULT '.length).trim();
    reste = reste.slice(0, iDefaut).trim();
  }
  const nonNul = reste.endsWith(' NOT NULL');
  if (nonNul) reste = reste.slice(0, -' NOT NULL'.length).trim();
  return { type: reste, nonNul, defaut };
}

/**
 * Comparaison des valeurs par défaut : PostgreSQL réécrit `'EUR'` en
 * `'EUR'::text` et `0` en `0`. On neutralise les casts et les espaces, rien
 * d'autre — un `now()` remplacé par un `'2026-01-01'` doit se voir.
 */
function defautNormalise(expression) {
  if (expression === null || expression === undefined) return '';
  // PAS de .toLowerCase() : voir expressionNormalisee ci-dessous. `'Entretien'` et
  // `'entretien'` sont DEUX VALEURS DIFFÉRENTES pour PostgreSQL, et seule la
  // seconde satisfait la CHECK de `answers.source`. Avec la minusculisation, un
  // `SET DEFAULT 'Entretien'` passait à ZÉRO ÉCART — et plus aucune réponse ne
  // pouvait être enregistrée sans que le client précise sa provenance (§27.1).
  return String(expression)
    .replace(/::[a-z_ ]+(\[\])?/g, '')
    .replace(/\s/g, '');
}

/**
 * Comparaison d'expressions SQL : la mise en forme du catalogue n'est pas un écart,
 * mais LA STRUCTURE EN EST UN.
 *
 * DÉFAUT B-2 CORRIGÉ (revue croisée A17) : cette fonction supprimait les
 * PARENTHÈSES. Or les parenthèses portent le sens. A17 a reparenthésé
 * `step_validations_scope_coherence_check` — la seule CHECK non-enum du schéma,
 * celle que ce lot met en avant — de sorte que `(cadrage, mission)` et
 * `(unite, org_unit)` devenaient REFUSÉS, à l'inverse de ce qu'exige le 04 §7 ;
 * le diff sortait à ZÉRO ÉCART. Un `A AND B OR C` et un `A AND (B OR C)` ne sont
 * pas la même règle, et un comparateur qui les confond ne compare rien.
 *
 * DÉFAUT B-1 DE LA SECONDE PASSE : cette fonction appelait aussi `.toLowerCase()`,
 * ce qui écrasait la casse DES LITTÉRAUX. PostgreSQL, lui, compare les chaînes
 * SENSIBLEMENT À LA CASSE. Une CHECK réécrite en
 * `status = ANY (ARRAY['NON_DEMARRE', 'en_cours', 'termine'])` sortait donc à
 * ZÉRO ÉCART — alors qu'en base PLUS AUCUNE SESSION DE COLLECTE ne pouvait être
 * créée (le DEFAULT 'non_demarre' du 04 violait sa propre CHECK) et qu'une
 * valeur absente du 04 était acceptée.
 *
 * La minusculisation ne rapportait rien qu'elle ne coûtait :
 * `pg_get_constraintdef` produit déjà une forme canonique stable, et le
 * manifeste est écrit dans cette même forme. Elle est retirée sans remplacement.
 *
 * On ne neutralise QUE ce que PostgreSQL ajoute de son propre chef et qui ne
 * change aucune sémantique : les espaces, les casts explicites et les guillemets
 * d'identifiant. NI LA CASSE, NI LES PARENTHÈSES.
 */
function expressionNormalisee(sql) {
  return String(sql ?? '')
    .replace(/::[a-z_ ]+(\[\])?/g, '') // casts explicites ajoutés par le catalogue
    .replace(/[\s"]/g, ''); // espaces et guillemets d'identifiant — PAS les parenthèses
}

/**
 * Définition CANONIQUE attendue pour une CHECK d'énumération, dans la forme
 * exacte que `pg_get_constraintdef` produit pour un `col IN (…)`.
 *
 * DÉFAUT B-1 CORRIGÉ (revue croisée A17) : le contrôle se réduisait à
 * « l'ensemble des chaînes entre quotes est-il le bon ? » plus « le nom de la
 * colonne apparaît-il ? ». Ni l'opérateur ni la structure booléenne n'étaient
 * comparés. Quatre mutations passaient à ZÉRO ÉCART, dont un `= ANY` retourné en
 * `<> ALL` — qui REFUSE 'admin' et ACCEPTE 'pirate' — et un `OR true` qui
 * neutralise la contrainte tout en conservant ses littéraux.
 *
 * On compare désormais la définition ENTIÈRE, comme le fait la branche
 * `kind: 'expression'` : l'outillage existait, il n'était pas appliqué ici.
 * L'ORDRE des valeurs devient significatif — c'est voulu : il y a une seule
 * forme canonique, celle du fichier 04, et toute réécriture doit se voir.
 */
function definitionEnumAttendue(check) {
  const valeurs = check.values.map((v) => `'${v}'`).join(', ');
  return `CHECK ((${check.column} = ANY (ARRAY[${valeurs}])))`;
}

/**
 * Découpe `CREATE [UNIQUE] INDEX nom ON schema.table USING methode (cols) [WHERE p]`.
 * On lit `indexdef`, la forme canonique produite par PostgreSQL lui-même : elle est
 * stable, contrairement au SQL que nous avons écrit à la main.
 */
function analyserIndexdef(indexdef) {
  // La liste de colonnes est délimitée par la PREMIÈRE parenthèse ouvrante après
  // `USING <methode>` et sa fermante appariée : les expressions indexées peuvent
  // contenir leurs propres parenthèses (`lower(name)`), qu'un `.+?` paresseux
  // couperait au mauvais endroit.
  const tete = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(\S+)\s+ON\s+\S+\s+USING\s+(\w+)\s*\(/i.exec(
    indexdef,
  );
  if (!tete) return { illisible: true };

  const debut = tete[0].length - 1;
  let profondeur = 0;
  let fin = -1;
  for (let i = debut; i < indexdef.length; i += 1) {
    if (indexdef[i] === '(') profondeur += 1;
    else if (indexdef[i] === ')') {
      profondeur -= 1;
      if (profondeur === 0) {
        fin = i;
        break;
      }
    }
  }
  if (fin < 0) return { illisible: true };

  const listeColonnes = indexdef.slice(debut + 1, fin);
  let queue = indexdef.slice(fin + 1).trim();

  // `NULLS NOT DISTINCT` (PG15+) CHANGE la sémantique d'un index unique : deux
  // lignes à NULL cessent d'être distinctes. Il est donc capté explicitement, et
  // jamais avalé en silence.
  const nullsNotDistinct = /^NULLS\s+NOT\s+DISTINCT\b/i.test(queue);
  if (nullsNotDistinct) queue = queue.replace(/^NULLS\s+NOT\s+DISTINCT\b/i, '').trim();

  let predicat = null;
  const où = /^WHERE\s+([\s\S]+)$/i.exec(queue);
  if (où) {
    predicat = où[1];
    queue = '';
  }

  // Tout ce qui reste est une clause que cet analyseur ne connaît pas
  // (`WITH (…)`, `TABLESPACE …`, `INCLUDE (…)`…). On ne devine pas : on le dit.
  if (queue !== '') return { illisible: true, queue };

  return {
    unique: Boolean(tete[1]),
    nom: tete[2],
    methode: tete[3].toLowerCase(),
    // M-1 : les qualificatifs de colonne sont CONSERVÉS. Un `.replace(/\s+.*$/,'')`
    // effaçait `DESC`, `NULLS LAST`, `COLLATE` et surtout la CLASSE D'OPÉRATEURS :
    // `idx_questions_sectors_gin` recréé en `jsonb_path_ops` passait inaperçu,
    // alors que cette classe RETIRE le support de l'opérateur `?` et désindexe le
    // filtrage des questions par secteur (§16.3).
    colonnes: listeColonnes.split(',').map((c) => c.trim().replace(/\s+/g, ' ')),
    predicat,
    nullsNotDistinct,
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

  // format_type() rend le type AVEC son modificateur — `numeric(4,1)`,
  // `character varying(50)` — là où information_schema.columns.udt_name les
  // aplatit tous les deux en `numeric` / `varchar`. A16 a prouvé qu'un
  // numeric(4,1) substitué à un numeric passait inaperçu : même famille de
  // défaut que le text→varchar trouvé plus tôt, même correctif.
  const colonnes = await client.query(`
    SELECT rel.relname                                        AS table_name,
           att.attname                                        AS column_name,
           format_type(att.atttypid, att.atttypmod)           AS type_complet,
           att.attnotnull                                     AS non_nul,
           pg_get_expr(def.adbin, def.adrelid)                AS defaut
      FROM pg_attribute att
      JOIN pg_class rel      ON rel.oid = att.attrelid
      JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
      LEFT JOIN pg_attrdef def ON def.adrelid = att.attrelid AND def.adnum = att.attnum
     WHERE nsp.nspname = 'public'
       AND rel.relkind = 'r'
       AND att.attnum > 0
       AND NOT att.attisdropped
     ORDER BY rel.relname, att.attname
  `);

  const contraintes = await client.query(`
    SELECT c.conname                                   AS nom,
           c.contype                                   AS type,
           c.convalidated                              AS validee,
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

  // --- 2. COLONNES : type, NULLABILITÉ et DÉFAUT ---------------------------
  //
  // ÉLARGISSEMENT après la seconde passe d'A16 (méta-tests du comparateur).
  // Le 11 §7 dit « colonnes » sans préciser ce qu'on en compare, et j'avais lu
  // « le type, et rien d'autre ». Trois mutations passaient : un NOT NULL retiré,
  // un DEFAULT changé, un numeric(4,1) substitué à un numeric.
  // Deux d'entre elles touchent des règles du pack, pas des détails de forme :
  //   · `answers.interview_id` rendu nullable désarme l'UNIQUE partiel — deux
  //     lignes à interview_id NULL ne s'opposent plus, et le critère
  //     d'acceptation du lot tombe sans qu'une seule contrainte ait disparu ;
  //   · `missions.timezone` par défaut à 'UTC' au lieu de 'Europe/Paris' change
  //     l'heure affichée de toutes les sessions d'une mission (§22.2).
  // La nullabilité EST une contrainte SQL ; le 11 §7 met les contraintes dans le
  // périmètre. Elle y entre donc, et le manifeste la déclare colonne par colonne.
  const colonnesParTable = new Map();
  for (const c of base.colonnes) {
    if (!colonnesParTable.has(c.table_name)) colonnesParTable.set(c.table_name, new Map());
    colonnesParTable.get(c.table_name).set(c.column_name, {
      type: typeNormalise(c.type_complet),
      nonNul: c.non_nul,
      defaut: c.defaut,
    });
  }

  for (const [table, def] of Object.entries(manifeste.tables)) {
    const reelles = colonnesParTable.get(table);
    if (!reelles) continue; // table manquante : déjà signalée
    for (const [col, declaration] of Object.entries(def.columns)) {
      const reelle = reelles.get(col);
      if (reelle === undefined) {
        ecart('colonne', `${table}.${col} MANQUANTE en base`);
        continue;
      }
      const attendue = analyserDeclarationColonne(declaration);
      if (reelle.type !== attendue.type) {
        ecart('colonne', `${table}.${col} : type ${reelle.type} en base, ${attendue.type} au 04`);
      }
      if (reelle.nonNul !== attendue.nonNul) {
        ecart(
          'colonne',
          `${table}.${col} : ${reelle.nonNul ? 'NOT NULL' : 'nullable'} en base, ` +
            `${attendue.nonNul ? 'NOT NULL' : 'nullable'} attendu`,
        );
      }
      if (defautNormalise(reelle.defaut) !== defautNormalise(attendue.defaut)) {
        ecart(
          'colonne',
          `${table}.${col} : DEFAULT ${reelle.defaut ?? '(aucun)'} en base, ` +
            `${attendue.defaut ?? '(aucun)'} attendu`,
        );
      }
    }
    for (const col of reelles.keys()) {
      if (!(col in def.columns)) ecart('colonne', `${table}.${col} EN TROP en base`);
    }
  }

  // --- 2b. PROVENANCE DES DÉFAUTS : la liste du manifeste doit être EXHAUSTIVE
  //
  // DÉFAUT M-2 DE LA SECONDE PASSE : le manifeste se disait exhaustif sur la
  // provenance des valeurs par défaut et ne l'était pas — trois `now()`
  // manquaient à ses listes, dont `answer_revisions.changed_at`, dans la table
  // même que la migration 0010 durcit au titre de l'invariant 7.
  // Le remède n'est pas de compléter la liste à la main une fois de plus : c'est
  // de la rendre VÉRIFIABLE. Toute colonne portant un DEFAULT en base doit être
  // couverte par une provenance déclarée, sans quoi le manifeste ment sur
  // lui-même — et c'est le document que la porte P-A relit ligne à ligne.
  const provenances = new Set([
    ...(manifeste.defauts?.prescritsParLeFichier04?.colonnes ?? []),
    ...(manifeste.defauts?.etablisParConvention?.colonnes ?? []),
  ]);
  for (const [table, colonnes] of colonnesParTable) {
    if (TABLES_HORS_PERIMETRE.has(table)) continue;
    for (const [col, reelle] of colonnes) {
      if (reelle.defaut === null || reelle.defaut === undefined) continue;
      if (!provenances.has(`${table}.${col}`)) {
        ecart(
          'colonne',
          `${table}.${col} porte un DEFAULT (${reelle.defaut}) qu'aucune provenance du ` +
            'manifeste ne couvre — ni « prescrit par le fichier 04 », ni « établi par ' +
            'convention T1-T13 ».',
        );
      }
    }
  }

  // --- 3. CONTRAINTES PK / FK / UNIQUE / CHECK ------------------------------
  // DÉFAUT B-2 DE LA SECONDE PASSE : la clé était le NOM SEUL, cherché dans TOUTE
  // la base. Une contrainte pouvait donc CHANGER DE TABLE sans écart — le réviseur
  // a déplacé `findings_wave_check` de `findings` vers `use_cases` et obtenu
  // ZÉRO ÉCART, pendant que `findings.wave = 'pirate'` devenait ACCEPTÉ. La clé
  // est désormais le COUPLE (table, nom), qui est ce qui identifie réellement une
  // contrainte : PostgreSQL autorise le même nom sur deux tables différentes.
  const cleContrainte = (table, nom) => `${table}.${nom}`;
  const contraintesParNom = new Map(
    base.contraintes.map((c) => [cleContrainte(c.table_name, c.nom), c]),
  );
  const attendues = new Set();

  for (const [table, def] of Object.entries(manifeste.tables)) {
    // 3a. PK
    const pk = def.primaryKey;
    if (pk) {
      attendues.add(cleContrainte(table, pk.name));
      const reelle = contraintesParNom.get(cleContrainte(table, pk.name));
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
      attendues.add(cleContrainte(table, u.name));
      const reelle = contraintesParNom.get(cleContrainte(table, u.name));
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
      attendues.add(cleContrainte(table, f.name));
      const reelle = contraintesParNom.get(cleContrainte(table, f.name));
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
      attendues.add(cleContrainte(table, k.name));
      const reelle = contraintesParNom.get(cleContrainte(table, k.name));
      if (!reelle || reelle.type !== 'c') {
        ecart('contrainte', `CHECK MANQUANTE : ${k.name} sur ${table}`);
        continue;
      }
      // Enum comme composite : on compare la DÉFINITION ENTIÈRE. Comparer un
      // ensemble de littéraux laissait passer l'opérateur et la structure (B-1).
      const attendue = k.kind === 'enum' ? definitionEnumAttendue(k) : `CHECK ${k.expression}`;
      if (expressionNormalisee(reelle.definition) !== expressionNormalisee(attendue)) {
        ecart(
          'contrainte',
          `CHECK ${k.name} : définition divergente.\n` +
            `      base : ${reelle.definition}\n` +
            `      04   : ${attendue}`,
        );
      }
    }
  }

  // 3d-bis. CONTRAINTES `NOT VALID` — défaut B-1 (A17), volet « NOT VALID ».
  //
  // Une CHECK ou une FK posée `NOT VALID` existe, porte le bon nom et la bonne
  // définition : elle passait donc tous les contrôles ci-dessus. Mais PostgreSQL
  // ne l'a JAMAIS vérifiée contre les lignes DÉJÀ PRÉSENTES. Le schéma déclare
  // une règle que les données existantes peuvent violer — c'est-à-dire tout ce
  // que ce diff est censé empêcher. `pg_get_constraintdef` suffixe bien
  // « NOT VALID », donc la comparaison de définition l'attrape aussi ; ce contrôle
  // explicite existe pour DIRE ce qui ne va pas plutôt que de faire deviner.
  for (const c of base.contraintes) {
    if (TABLES_HORS_PERIMETRE.has(c.table_name)) continue;
    if (!attendues.has(cleContrainte(c.table_name, c.nom))) continue;
    if (c.validee === false) {
      ecart(
        'contrainte',
        `contrainte NON VALIDÉE : ${c.nom} sur ${c.table_name} est posée NOT VALID — ` +
          'les lignes déjà présentes ne sont pas contrôlées.',
      );
    }
  }

  // 3e. Contraintes de la base absentes du manifeste (schéma non autorisé).
  //     Les NOT NULL (contype 'c' implicite) n'existent pas dans pg_constraint :
  //     rien n'est donc signalé à tort ici, la nullabilité restant hors périmètre.
  for (const c of base.contraintes) {
    if (TABLES_HORS_PERIMETRE.has(c.table_name)) continue;
    if (!attendues.has(cleContrainte(c.table_name, c.nom))) {
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
    if (reel.illisible) {
      ecart(
        'index',
        `index ILLISIBLE : ${idx.name} sur ${reel.table}\n      ${reel.brut}\n` +
          "      L'analyseur n'a pas su décomposer cette définition ; il ne peut donc rien\n" +
          '      en affirmer. Un index déclaré doit rester analysable.',
      );
      continue;
    }
    if (reel.nullsNotDistinct) {
      // Aucun index du manifeste ne le déclare. `NULLS NOT DISTINCT` rend deux
      // lignes à NULL mutuellement exclusives : c'est un durcissement silencieux
      // du modèle, jamais une optimisation.
      ecart(
        'index',
        `index ${idx.name} : porte NULLS NOT DISTINCT, que le manifeste ne déclare pas — ` +
          'deux lignes à NULL cesseraient d’être distinctes.',
      );
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

  // 4b. Index NON DÉCLARÉS — et la ligne de partage est l'UNICITÉ.
  //
  // Un index de LECTURE non déclaré reste une information : le 11 §7 borne le
  // diff aux « index du §7.1 », et refuser tout index supplémentaire interdirait
  // à un lot ultérieur d'optimiser une requête sans amender un manifeste extrait
  // d'un fichier scellé.
  //
  // DÉFAUT B-3 CORRIGÉ (revue croisée A17, arbitrage A01 révisé) : cette
  // tolérance ne peut PAS s'étendre aux index UNIQUES. Un index unique n'est pas
  // une optimisation, c'est une CONTRAINTE — et le 11 §7 met explicitement
  // « PK/FK/UNIQUE/CHECK » dans le périmètre du diff. A17 a posé
  // `CREATE UNIQUE INDEX zz_uq_answers_mq ON answers (mission_question_id)` et
  // obtenu code 0 : cet index interdit silencieusement qu'une même question soit
  // répondue dans DEUX SESSIONS différentes, l'exact inverse de la règle du
  // 04 §7 (V2.2 §32.6) que ce lot a pour critère d'acceptation.
  //
  // Ceux qui matérialisent une PK ou une UNIQUE déclarée sont déjà contrôlés au
  // point 3 : les répéter ici ne serait que du bruit.
  for (const [nom, reel] of indexParNom) {
    if (indexAttendus.has(nom)) continue;
    // Index porté par une contrainte déclarée — clé (table, nom), comme au point 3.
    if (attendues.has(cleContrainte(reel.table, nom))) continue;
    if (reel.illisible) {
      // DÉFAUT B-3 DE LA SECONDE PASSE : `analyserIndexdef` rendait `null` sur une
      // syntaxe qu'elle ne connaissait pas (`NULLS NOT DISTINCT`, PG15+), et
      // l'appelant étalait ce `null` en objet vide — `unique` devenait `undefined`,
      // donc faux, donc l'index UNIQUE repartait en simple signalement. Un
      // `CREATE UNIQUE INDEX … NULLS NOT DISTINCT` sur `answers(mission_question_id)`
      // sortait à ZÉRO ÉCART tout en interdisant qu'une même question soit répondue
      // dans deux sessions — l'inverse exact du 04 §7 (V2.2 §32.6).
      // Un analyseur qui ne comprend pas ce qu'il lit ne conclut PAS au conforme.
      ecart(
        'index',
        `index ILLISIBLE : ${nom} sur ${reel.table}\n` +
          `      ${reel.brut}\n` +
          "      L'analyseur n'a pas su décomposer cette définition. Il ne peut donc ni\n" +
          "      affirmer que cet index est inoffensif, ni qu'il est unique. Complète\n" +
          '      `analyserIndexdef`, ou déclare cet index au manifeste.',
      );
      continue;
    }
    if (reel.unique) {
      ecart(
        'index',
        `index UNIQUE non déclaré : ${nom} sur ${reel.table} (${reel.brut})\n` +
          "      L'unicité est une CONTRAINTE, pas une optimisation : elle entre dans le\n" +
          '      périmètre « PK/FK/UNIQUE/CHECK » du 11 §7. Un index unique de trop RESTREINT\n' +
          '      silencieusement le modèle. Déclare-le au manifeste, ou retire-le.',
      );
      continue;
    }
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
