// =============================================================================
// OUTILLAGE DES TESTS D'INTÉGRATION DU LOT L1 — SCHÉMA & SEED
//
// Ces tests sont écrits par A16 (testeur d'intégration) DEPUIS LA SPÉCIFICATION
// — `docs/04_MODELE_DE_DONNEES.md` et `docs/11_CONTRAT_TECHNIQUE.md` §5 — et
// JAMAIS depuis le code de migration d'A12 (règle de croisement 09 §5.6 : « le
// code de test n'est jamais écrit par l'agent qui a écrit le code testé »).
// Une divergence de lecture entre le DBA et le testeur DOIT faire rougir la
// suite : c'est le dispositif, pas un accident.
//
// -----------------------------------------------------------------------------
// TESTCONTAINERS — LA SUITE EST AUTOPORTANTE (11 §1), AVEC UN REPLI DOCUMENTÉ
// -----------------------------------------------------------------------------
// Le contrat 11 §1 épingle « Vitest 3 + **Testcontainers** » : la suite démarre
// SON PROPRE PostgreSQL 16 et ne dépend d'aucun état extérieur au dépôt. Sur un
// clone neuf, `pnpm test:integration` suffit — il n'y a rien à lancer avant.
// C'est le point qui compte : une suite qui exige une pile Compose déjà démarrée
// rougit sur la machine du suivant sans que personne comprenne pourquoi.
//
// Le conteneur est démarré UNE SEULE FOIS pour toute l'exécution du projet
// `integration` (mémoïsé ci-dessous) : `poolOptions.forks.singleFork` sérialise
// les fichiers dans un unique processus, on ne paie donc qu'un démarrage. Chaque
// FICHIER de test garde malgré tout sa PROPRE base `axion_l1_<suffixe>`, créée
// puis SUPPRIMÉE en `afterAll` : l'isolement ne dépend pas du conteneur, il est
// explicite. Le conteneur lui-même est retiré par le reaper de Testcontainers à
// la fin du processus.
//
// REPLI, si Testcontainers ne peut pas fonctionner sur un poste (Docker absent,
// socket non exposé, politique d'entreprise) : poser `AXION_TESTS_SANS_CONTENEUR=1`
// et démarrer la pile (`pnpm infra:up`). La suite se rabat alors sur le Postgres
// de `infra/docker-compose.yml` via `DATABASE_URL_TEST`, avec exactement la même
// discipline de bases éphémères. C'est un repli, pas un contournement : on ne
// désactive JAMAIS la suite (09 §5.7).
//
// CI (11 §7) : le job `integration` tourne sur `ubuntu-latest`, un runner qui
// expose le démon Docker de l'hôte — Testcontainers y fonctionne, et publie ses
// ports sur des ports libres tirés au hasard. Aucun conflit avec les `services:`
// postgres/redis/minio du workflow, qui gardent leurs ports fixes.
//
// Aucun secret n'est écrit ici : les identifiants du conteneur sont fabriqués à
// la volée, ceux du repli sont LUS à l'exécution depuis le `.env` racine (non
// versionné) ou l'environnement (11 §2, 30.4-5).
// =============================================================================
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { uuidv7 } from 'uuidv7';

const executerFichier = promisify(execFile);

const ICI = dirname(fileURLToPath(import.meta.url));
/** Racine du dépôt (apps/api/tests/aide → ../../../..). */
export const RACINE_DEPOT = resolve(ICI, '..', '..', '..', '..');
/** Racine de l'application API. */
export const RACINE_API = resolve(RACINE_DEPOT, 'apps', 'api');
/** Dossier des migrations SQL brutes, livrable d'A12 au lot L1. */
export const DOSSIER_MIGRATIONS = resolve(RACINE_API, 'drizzle');

// -----------------------------------------------------------------------------
// Environnement
// -----------------------------------------------------------------------------

/** Lit le `.env` racine sans dépendance (dotenv n'est pas au contrat 11 §1). */
function lireEnvRacine(): Record<string, string> {
  const chemin = resolve(RACINE_DEPOT, '.env');
  if (!existsSync(chemin)) return {};
  const valeurs: Record<string, string> = {};
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const nette = ligne.trim();
    if (nette === '' || nette.startsWith('#')) continue;
    const separateur = nette.indexOf('=');
    if (separateur <= 0) continue;
    const cle = nette.slice(0, separateur).trim();
    let valeur = nette.slice(separateur + 1).trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"')) ||
      (valeur.startsWith("'") && valeur.endsWith("'"))
    ) {
      valeur = valeur.slice(1, -1);
    }
    valeurs[cle] = valeur;
  }
  return valeurs;
}

const ENV_RACINE = lireEnvRacine();

/**
 * Image du conteneur de test. PostgreSQL **16** : la version épinglée au 11 §1.
 * Tester sur une autre version reviendrait à valider un schéma qui ne tournera
 * jamais en production — les index partiels et `NULLS NOT DISTINCT` ne se
 * comportent pas de la même façon d'une majeure à l'autre.
 */
const IMAGE_POSTGRES = 'postgres:16-alpine';

/** Le repli sur la pile Compose est explicite, jamais implicite. */
function repliDemande(): boolean {
  const drapeau = process.env.AXION_TESTS_SANS_CONTENEUR;
  return drapeau !== undefined && drapeau !== '' && drapeau !== '0';
}

/**
 * Conteneur PostgreSQL partagé par toute l'exécution du projet `integration`.
 * Mémoïsé sur la PROMESSE : deux fichiers qui l'appelleraient en parallèle
 * obtiennent le même conteneur au lieu d'en démarrer deux.
 */
let promesseConteneur: Promise<StartedPostgreSqlContainer> | undefined;

async function conteneurPostgres(): Promise<StartedPostgreSqlContainer> {
  promesseConteneur ??= new PostgreSqlContainer(IMAGE_POSTGRES).start();
  return promesseConteneur;
}

/** URL du Postgres de la pile Compose — utilisée UNIQUEMENT en mode repli. */
function urlDuRepli(): string {
  const url = process.env.DATABASE_URL_TEST ?? ENV_RACINE.DATABASE_URL_TEST;
  if (url === undefined || url === '') {
    throw new Error(
      'Repli demandé (AXION_TESTS_SANS_CONTENEUR) mais DATABASE_URL_TEST est introuvable,\n' +
        "ni dans l'environnement, ni dans le .env racine. Démarrer la pile avec\n" +
        '`pnpm infra:up` (11 §7), ou retirer le drapeau pour laisser Testcontainers\n' +
        'fournir lui-même un PostgreSQL 16 (11 §1).',
    );
  }
  return url;
}

/**
 * URL de référence vers le serveur PostgreSQL des tests : celui du conteneur
 * démarré par la suite, ou celui de la pile Compose en mode repli.
 */
async function urlDeReference(): Promise<string> {
  if (repliDemande()) return urlDuRepli();
  try {
    return (await conteneurPostgres()).getConnectionUri();
  } catch (erreur) {
    const details = erreur instanceof Error ? erreur.message : String(erreur);
    throw new Error(
      `Testcontainers n'a pas pu démarrer ${IMAGE_POSTGRES}.\n` +
        `Le contrat 11 §1 prévoit cette pile ; si Docker n'est pas disponible sur ce\n` +
        `poste, poser AXION_TESTS_SANS_CONTENEUR=1 et démarrer \`pnpm infra:up\` pour se\n` +
        `rabattre sur le Postgres de la pile Compose. On ne désactive JAMAIS la suite\n` +
        `(09 §5.7 : « tests désactivés = build rouge »).\n\nCause : ${details}`,
    );
  }
}

/** Remplace le nom de base d'une URL de connexion. */
function avecBase(url: string, nomBase: string): string {
  const analysee = new URL(url);
  analysee.pathname = `/${nomBase}`;
  return analysee.toString();
}

/** URL vers la base de maintenance `postgres` (CREATE/DROP DATABASE). */
async function urlMaintenance(): Promise<string> {
  return avecBase(await urlDeReference(), 'postgres');
}

// -----------------------------------------------------------------------------
// Bases éphémères — un fichier de test = une base, créée puis SUPPRIMÉE
// -----------------------------------------------------------------------------

/**
 * Crée une base vierge dédiée au fichier de test appelant et rend son URL.
 * Le nom est préfixé `axion_l1_` : aucun risque de collision avec la base de
 * développement `axion_audit`.
 */
export async function creerBaseEphemere(suffixe: string): Promise<{
  nom: string;
  url: string;
}> {
  const nom = `axion_l1_${suffixe}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const maintenance = new Client({ connectionString: await urlMaintenance() });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${nom}`);
  } finally {
    await maintenance.end();
  }
  return { nom, url: avecBase(await urlDeReference(), nom) };
}

/**
 * Supprime la base éphémère. Appelé systématiquement en `afterAll`, y compris
 * derrière le conteneur : l'isolement entre fichiers ne repose pas sur le fait
 * que le conteneur disparaîtra un jour.
 */
export async function supprimerBaseEphemere(nom: string): Promise<void> {
  const maintenance = new Client({ connectionString: await urlMaintenance() });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
  } finally {
    await maintenance.end();
  }
}

/** Ouvre une connexion sur une base éphémère. */
export async function connecter(url: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

// -----------------------------------------------------------------------------
// Migrations — découverte et exécution
// -----------------------------------------------------------------------------

/** `apps/api/drizzle/` existe-t-il ? C'est le marqueur de livraison du lot L1. */
export function migrationsLivrees(): boolean {
  return existsSync(DOSSIER_MIGRATIONS);
}

/**
 * Message unique employé par tous les fichiers quand le lot L1 n'est pas encore
 * livré. Un échec doit dire CE QUI EST ATTENDU et POURQUOI (consigne A16).
 */
export const MESSAGE_L1_ABSENT =
  `apps/api/drizzle/ est introuvable : aucune migration SQL n'est livrée.\n` +
  `Attendu (07 §12, ligne L1) : « Schéma SQL fichier 04 V2.2 INTÉGRAL + migrations\n` +
  `up/down + seed référentiels ». Le DDL se transcrit LITTÉRALEMENT depuis\n` +
  `docs/04_MODELE_DE_DONNEES.md (11 §2 : « pas d'ORM qui génère le schéma »).\n` +
  `Ces tests d'intégration sont écrits depuis la SPÉCIFICATION et rougissent\n` +
  `tant que le schéma n'existe pas — c'est leur rôle, pas une anomalie.`;

/** Fichiers de migration livrés, triés par nom (ordre d'application). */
export function fichiersMigration(): string[] {
  if (!migrationsLivrees()) return [];
  return readdirSync(DOSSIER_MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && !/\.down\.sql$/i.test(f))
    .sort()
    .map((f) => join(DOSSIER_MIGRATIONS, f));
}

/**
 * Un fichier de migration porte-t-il une DESCENTE ?
 * Le pack exige « migrations up/down propres » (07 §12 ligne L1) sans trancher la
 * convention d'écriture : les deux formes usuelles sont acceptées ici —
 *   • une section sentinelle `-- @DOWN` dans le fichier lui-même ;
 *   • un fichier frère `<nom>.down.sql`.
 * Ce que le test vérifie, c'est l'EXISTENCE d'une descente, pas sa mise en forme.
 */
export function porteUneDescente(chemin: string): boolean {
  if (/^--\s*@DOWN\s*$/m.test(readFileSync(chemin, 'utf8'))) return true;
  return existsSync(chemin.replace(/\.sql$/i, '.down.sql'));
}

/**
 * Exécute le lanceur de migrations d'A12 — c'est le point d'entrée PUBLIC
 * (`pnpm db:migrate`), celui qu'`infra/scripts/deploy.sh` appelle à chaque
 * déploiement (02 §30.6). Éprouver autre chose reviendrait à tester un chemin
 * que personne n'emprunte.
 */
export async function lancerMigrations(
  urlBase: string,
  arguments_: readonly string[] = [],
): Promise<string> {
  const script = resolve(RACINE_API, 'scripts', 'migrations.mjs');
  try {
    const { stdout, stderr } = await executerFichier(process.execPath, [script, ...arguments_], {
      cwd: RACINE_DEPOT,
      env: { ...process.env, DATABASE_URL: urlBase },
      maxBuffer: 16 * 1024 * 1024,
    });
    return `${stdout}${stderr}`;
  } catch (erreur) {
    const details = erreur instanceof Error ? erreur.message : String(erreur);
    throw new Error(
      `\`migrations.mjs ${arguments_.join(' ')}\` a échoué.\n` +
        `Critère 07 §12 ligne L1 : « migrations up/down propres ».\n\nSortie :\n${details}`,
    );
  }
}

/** Applique toutes les migrations en attente. */
export async function appliquerMontee(urlBase: string): Promise<string> {
  return lancerMigrations(urlBase, []);
}

/**
 * Redescend TOUTES les migrations. `--down-to 0` cible la version 0000, donc la
 * base vierge : c'est la descente complète que le critère d'acceptation exige.
 */
export async function appliquerDescente(urlBase: string): Promise<string> {
  return lancerMigrations(urlBase, ['--down-to', '0']);
}

// -----------------------------------------------------------------------------
// Seed — on exécute le script d'A12, on ne le lit pas
// -----------------------------------------------------------------------------

/**
 * Exécute `apps/api/scripts/seed.mjs` contre la base éphémère. On lui passe
 * l'environnement du dépôt avec `DATABASE_URL` et les `POSTGRES_*` réécrits
 * vers l'hôte : le script est le point d'entrée public du seed (`pnpm seed`),
 * c'est donc lui qui doit être éprouvé, pas une réimplémentation.
 */
export async function executerSeed(
  urlBase: string,
  nomBase: string,
  arguments_: readonly string[] = [],
): Promise<string> {
  // Tout est dérivé de `urlBase` : le conteneur tire un port et des identifiants
  // à la volée, et les `POSTGRES_*` du `.env` racine désignent, eux, la pile
  // Compose. Les laisser passer enverrait le seed peupler la mauvaise base.
  const analysee = new URL(urlBase);
  const environnement: NodeJS.ProcessEnv = {
    ...process.env,
    ...ENV_RACINE,
    DATABASE_URL: urlBase,
    DATABASE_URL_TEST: urlBase,
    POSTGRES_HOST: analysee.hostname,
    POSTGRES_PORT: analysee.port === '' ? '5432' : analysee.port,
    POSTGRES_DB: nomBase,
    POSTGRES_USER: decodeURIComponent(analysee.username),
    POSTGRES_PASSWORD: decodeURIComponent(analysee.password),
    APP_ENV: 'test',
    NODE_ENV: 'test',
  };
  try {
    const { stdout, stderr } = await executerFichier(
      process.execPath,
      [resolve(RACINE_API, 'scripts', 'seed.mjs'), ...arguments_],
      { cwd: RACINE_DEPOT, env: environnement, maxBuffer: 16 * 1024 * 1024 },
    );
    return `${stdout}${stderr}`;
  } catch (erreur) {
    const details = erreur instanceof Error ? erreur.message : String(erreur);
    throw new Error(
      `Le seed des référentiels a ÉCHOUÉ.\n` +
        `Attendu (11 §5 + 07 §12 ligne L1) : 9 blocs, 11 fonctions, 9 profils avec\n` +
        `group_code, 4 paliers, estimation_params normées, naf_sector_map et le compte\n` +
        `fondateur AVEC habilitated_at posé. Le seed doit être REJOUABLE 2× à l'identique.\n\n` +
        `Sortie du script :\n${details}`,
    );
  }
}

// -----------------------------------------------------------------------------
// Photographie du catalogue — sert à prouver l'absence de reliquat après DOWN
// -----------------------------------------------------------------------------

export interface Catalogue {
  tables: string[];
  vues: string[];
  colonnes: string[];
  index: string[];
  contraintes: string[];
  typesCrees: string[];
  sequences: string[];
  fonctions: string[];
}

/**
 * Ce qui a le droit de survivre à une descente complète : le journal de migration
 * et ses objets dérivés (index de clé primaire, contrainte, séquence). Aucune
 * table du fichier 04 ne comporte le mot « migration » : le motif ne peut pas
 * absorber un objet métier par accident.
 */
const MOTIF_JOURNAL_MIGRATION = /migrations/i;

export function estJournalDeMigration(nom: string): boolean {
  return MOTIF_JOURNAL_MIGRATION.test(nom);
}

/** Photographie du schéma `public`. Les objets fournis par une EXTENSION sont exclus. */
export async function photographierCatalogue(client: Client): Promise<Catalogue> {
  const lire = async (sql: string): Promise<string[]> => {
    const resultat = await client.query<{ nom: string }>(sql);
    return resultat.rows.map((l) => l.nom).sort();
  };

  return {
    tables: await lire(
      `SELECT table_name AS nom FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    ),
    vues: await lire(
      `SELECT table_name AS nom FROM information_schema.views WHERE table_schema = 'public'`,
    ),
    colonnes: await lire(
      `SELECT table_name || '.' || column_name || ':' || data_type AS nom
       FROM information_schema.columns WHERE table_schema = 'public'`,
    ),
    index: await lire(`SELECT indexname AS nom FROM pg_indexes WHERE schemaname = 'public'`),
    contraintes: await lire(
      `SELECT conname AS nom FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace`,
    ),
    typesCrees: await lire(
      `SELECT t.typname AS nom FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')`,
    ),
    sequences: await lire(
      `SELECT sequence_name AS nom FROM information_schema.sequences
       WHERE sequence_schema = 'public'`,
    ),
    fonctions: await lire(
      `SELECT p.proname AS nom FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`,
    ),
  };
}

/** Reliquats d'une descente : tout ce qui reste hors journal de migration. */
export function reliquats(apresDescente: Catalogue): string[] {
  const restes: string[] = [];
  const ajouter = (nature: string, noms: string[]): void => {
    for (const nom of noms) {
      if (estJournalDeMigration(nom)) continue;
      if (nom.split('.').some((partie) => estJournalDeMigration(partie))) continue;
      restes.push(`${nature} « ${nom} »`);
    }
  };
  ajouter('table', apresDescente.tables);
  ajouter('vue', apresDescente.vues);
  ajouter('index', apresDescente.index);
  ajouter('contrainte', apresDescente.contraintes);
  ajouter('type', apresDescente.typesCrees);
  ajouter('séquence', apresDescente.sequences);
  ajouter('fonction', apresDescente.fonctions);
  return restes;
}

// -----------------------------------------------------------------------------
// Attentes de refus / d'acceptation — le cœur des tests de contraintes
// -----------------------------------------------------------------------------

export interface ErreurPostgres {
  code: string;
  message: string;
  contrainte: string;
}

function decrireErreurPg(erreur: unknown): ErreurPostgres {
  const brute = erreur as { code?: unknown; message?: unknown; constraint?: unknown };
  return {
    code: typeof brute.code === 'string' ? brute.code : '',
    message: typeof brute.message === 'string' ? brute.message : String(erreur),
    contrainte: typeof brute.constraint === 'string' ? brute.constraint : '',
  };
}

/**
 * Exécute une requête qui DOIT être refusée par la base et rend l'erreur.
 * Si la base l'accepte, on lève une erreur qui explique la règle violée et
 * la section du pack qui la porte.
 */
export async function attendreRefus(
  client: Client,
  sql: string,
  parametres: unknown[],
  regle: string,
): Promise<ErreurPostgres> {
  try {
    await client.query(sql, parametres);
  } catch (erreur) {
    return decrireErreurPg(erreur);
  }
  throw new Error(
    `Insertion ACCEPTÉE alors qu'elle devait être REFUSÉE par la base.\n${regle}\n` +
      `Une règle « documentée en commentaire » n'est pas une règle : elle doit être\n` +
      `une contrainte SQL ACTIVE (UNIQUE, CHECK ou index partiel).`,
  );
}

/**
 * Exécute une requête qui DOIT être acceptée. Si la base la refuse, on lève une
 * erreur qui explique pourquoi cette acceptation est exigée par la spécification.
 */
export async function attendreAcceptation(
  client: Client,
  sql: string,
  parametres: unknown[],
  regle: string,
): Promise<void> {
  try {
    await client.query(sql, parametres);
  } catch (erreur) {
    const details = decrireErreurPg(erreur);
    throw new Error(
      `Insertion REFUSÉE alors qu'elle devait être ACCEPTÉE.\n${regle}\n` +
        `Erreur Postgres ${details.code} (contrainte « ${details.contrainte} ») : ${details.message}`,
    );
  }
}

// -----------------------------------------------------------------------------
// Fixtures minimales — construites depuis le fichier 04, jamais depuis le code
// -----------------------------------------------------------------------------
// Invariant 2 : aucune référence client ; les libellés sont neutres et fictifs.
// P1-4 (04 §7) : toute entité créable hors ligne porte un UUID v7 CÔTÉ CLIENT —
// ces fixtures respectent la règle, elles ne comptent JAMAIS sur un DEFAULT SQL.

export interface JeuDEssai {
  utilisateurId: string;
  entrepriseId: string;
  missionId: string;
  uniteId: string;
  blocId: string;
  questionId: string;
  missionQuestionId: string;
  entretienId: string;
}

/** Crée la chaîne minimale entreprise → mission → unité → session → question. */
export async function creerJeuDEssai(client: Client, marqueur: string): Promise<JeuDEssai> {
  const utilisateurId = uuidv7();
  await client.query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'admin', 'guide_strict', now(), true, now(), now())`,
    [utilisateurId, `Auditeur ${marqueur}`, `auditeur.${marqueur}@exemple.test`, 'argon2-factice'],
  );

  const entrepriseId = uuidv7();
  await client.query(
    `INSERT INTO companies (id, name, created_at, updated_at)
     VALUES ($1, $2, now(), now())`,
    [entrepriseId, `Entreprise fictive ${marqueur}`],
  );

  const missionId = uuidv7();
  await client.query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status,
                           created_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'diagnostic_cadrage', 'preparation', $4, now(), now())`,
    [missionId, entrepriseId, `Mission fictive ${marqueur}`, utilisateurId],
  );

  const uniteId = uuidv7();
  await client.query(
    `INSERT INTO org_units (id, mission_id, kind, name, status, created_at, updated_at)
     VALUES ($1, $2, 'service', $3, 'active', now(), now())`,
    [uniteId, missionId, `Unité fictive ${marqueur}`],
  );

  const blocId = uuidv7();
  // `is_default` est RENSEIGNÉ, jamais laissé à un défaut SQL : le 04 §7 écrit
  // `blocks(… is_default BOOL …)` sans marqueur NULL ni DEFAULT — la colonne est
  // donc obligatoire et sans valeur implicite.
  // La valeur est `false` À DESSEIN : `is_default` marque les blocs de la
  // méthodologie 8+1 qui s'appliquent par défaut à toute mission (E1, 01 §2).
  // Ce bloc-ci est un support technique de fixture, au code arbitraire
  // (`essai_<marqueur>`), qui n'appartient pas au référentiel des 9 blocs et ne
  // doit surtout pas se retrouver activé d'office sur une mission. Le poser à
  // `true` ferait mentir la fixture sur ce qu'elle représente.
  await client.query(
    `INSERT INTO blocks (id, code, label_fr, position, is_default) VALUES ($1, $2, $3, 1, false)`,
    [blocId, `essai_${marqueur}`, `Bloc d'essai ${marqueur}`],
  );

  const questionId = uuidv7();
  await client.query(
    `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                            created_at, updated_at)
     VALUES ($1, $2, 1, 'active', $3, 'yes_no', 'banque', now(), now())`,
    [questionId, blocId, `Question d'essai ${marqueur} ?`],
  );

  const missionQuestionId = uuidv7();
  await client.query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version,
                                    text_snapshot, position)
     VALUES ($1, $2, $3, 1, $4, 1)`,
    [missionQuestionId, missionId, questionId, `Question d'essai ${marqueur} ?`],
  );

  const entretienId = uuidv7();
  await client.query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, org_unit_id, status,
                             schedule_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', $4, 'non_demarre', 'a_planifier', now(), now())`,
    [entretienId, missionId, utilisateurId, uniteId],
  );

  return {
    utilisateurId,
    entrepriseId,
    missionId,
    uniteId,
    blocId,
    questionId,
    missionQuestionId,
    entretienId,
  };
}

/** Identifiant v7 côté client — réexporté pour que les tests n'importent qu'un module. */
export { uuidv7 };

// -----------------------------------------------------------------------------
// Comparateur schéma-vs-04 — exécuté, jamais réimplémenté
// -----------------------------------------------------------------------------

/**
 * Lance `scripts/schema-diff.mjs` contre une base et rend son CODE DE SORTIE.
 * Contrairement aux autres lanceurs de ce fichier, celui-ci ne lève PAS sur un
 * code non nul : pour le méta-test du comparateur, l'échec EST le résultat
 * attendu la moitié du temps.
 */
export async function lancerSchemaDiff(urlBase: string): Promise<{ code: number; sortie: string }> {
  const script = resolve(RACINE_DEPOT, 'scripts', 'schema-diff.mjs');
  try {
    const { stdout, stderr } = await executerFichier(process.execPath, [script], {
      cwd: RACINE_DEPOT,
      env: { ...process.env, DATABASE_URL: urlBase },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, sortie: `${stdout}${stderr}` };
  } catch (erreur) {
    const details = erreur as { code?: unknown; stdout?: unknown; stderr?: unknown };
    const stdout = typeof details.stdout === 'string' ? details.stdout : '';
    const stderr = typeof details.stderr === 'string' ? details.stderr : '';
    return {
      code: typeof details.code === 'number' ? details.code : 1,
      sortie: `${stdout}${stderr}`,
    };
  }
}

/**
 * Définition courante d'une contrainte, retrouvée PAR SA FORME et non par son
 * nom : le pack ne normalise pas les noms de contraintes, et un test qui les
 * codait en dur casserait au premier renommage sans rien prouver.
 */
export async function trouverContrainte(
  client: Client,
  table: string,
  motif: RegExp,
): Promise<{ nom: string; definition: string }> {
  const resultat = await client.query<{ nom: string; definition: string }>(
    `SELECT conname AS nom, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE conrelid = $1::regclass`,
    [table],
  );
  const trouvee = resultat.rows.find((l) => motif.test(l.definition));
  if (trouvee === undefined) {
    throw new Error(
      `Aucune contrainte de ${table} ne correspond à ${motif.source}.\n` +
        `Contraintes présentes :\n  ` +
        resultat.rows.map((l) => `${l.nom} → ${l.definition}`).join('\n  '),
    );
  }
  return trouvee;
}

/** Corps d'une contrainte CHECK, sans le mot-clé ni le suffixe NOT VALID. */
export function expressionCheck(definition: string): string {
  return definition
    .replace(/^CHECK\s*/i, '')
    .replace(/\s+NOT VALID$/i, '')
    .trim();
}

/** Remplace une contrainte par une définition mutée (puis par l'originale). */
export async function remplacerContrainte(
  client: Client,
  table: string,
  nom: string,
  definition: string,
): Promise<void> {
  await client.query(`ALTER TABLE ${table} DROP CONSTRAINT "${nom}"`);
  await client.query(`ALTER TABLE ${table} ADD CONSTRAINT "${nom}" ${definition}`);
}
