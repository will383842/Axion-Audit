#!/usr/bin/env node
// =============================================================================
// MIGRATIONS — exécuteur de SQL BRUT VERSIONNÉ (lot L1, agent A12 — DBA)
//
// Contrat 11 §2 : « le fichier 04 se transcrit LITTÉRALEMENT en migrations SQL ;
// Drizzle ne sert QU'AUX REQUÊTES TYPÉES ». Ce script n'invente aucun DDL : il
// applique, dans l'ordre, les fichiers `apps/api/drizzle/NNNN_*.sql`, chacun
// portant sa MONTÉE et sa DESCENTE.
//
// FORMAT DE FICHIER (une seule source, montée et descente adjacentes) :
//     -- @UP        … instructions de montée …
//     -- @DOWN      … instructions de descente …
// Les deux sentinelles sont OBLIGATOIRES : le critère du lot exige des
// « migrations up/down propres », et une descente absente ne se voit qu'au moment
// où l'on en a besoin, c'est-à-dire trop tard.
//
// COMMANDES
//   node scripts/migrations.mjs              → applique les migrations en attente
//   node scripts/migrations.mjs --check      → DRY-RUN : rien n'est appliqué
//   node scripts/migrations.mjs --status     → état du journal
//   node scripts/migrations.mjs --down       → redescend LA dernière appliquée
//   node scripts/migrations.mjs --down-to 0  → redescend TOUT (bac à sable)
//
// Chaque migration s'exécute dans SA PROPRE TRANSACTION : une migration qui
// échoue ne laisse jamais un schéma à moitié posé (02 §30.6, garde-fou de
// déploiement « dry-run puis apply »).
// Traçabilité : E17, E36, E43 · critère L1 du fichier 07.
// =============================================================================
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

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

const RACINE_API = resolve(import.meta.dirname, '..');
const RACINE_DEPOT = resolve(RACINE_API, '../..');
const DOSSIER_MIGRATIONS = resolve(RACINE_API, 'drizzle');

/** Table du journal. Nom explicite : ce n'est PAS une table du fichier 04. */
const TABLE_JOURNAL = 'schema_migrations';

// ---------------------------------------------------------------------------
// Environnement — le `.env` de la racine est la source unique en local.
// ---------------------------------------------------------------------------
export function chargerEnvDepot() {
  if (process.env.DATABASE_URL) return;
  const fichier = resolve(RACINE_DEPOT, '.env');
  if (!existsSync(fichier)) return;
  try {
    process.loadEnvFile(fichier);
  } catch {
    // Un .env illisible ne doit pas masquer l'erreur utile (« DATABASE_URL absente »).
  }
}

/**
 * L'URL de base. Le `.env` porte le nom d'hôte Docker (`postgres`) ; hors
 * conteneur il faut viser l'hôte publié. `DATABASE_URL` fournie explicitement
 * l'emporte TOUJOURS : c'est ce qui permet aux tests d'intégration de pointer
 * leur propre base sans toucher au fichier d'environnement.
 */
export function urlBase() {
  chargerEnvDepot();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      `${ROUGE}✗ DATABASE_URL absente.${RAZ}\n` +
        '  Renseigne-la dans le .env de la racine, ou passe-la en variable :\n' +
        '    DATABASE_URL=postgresql://user:mdp@localhost:5432/axion_audit pnpm db:migrate\n',
    );
    process.exit(1);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Lecture des fichiers de migration
// ---------------------------------------------------------------------------
const SENTINELLE_UP = /^--\s*@UP\s*$/m;
const SENTINELLE_DOWN = /^--\s*@DOWN\s*$/m;

/** @returns {{version: string, nom: string, fichier: string, up: string, down: string, empreinte: string}[]} */
export function lireMigrations() {
  if (!existsSync(DOSSIER_MIGRATIONS)) return [];
  const fichiers = readdirSync(DOSSIER_MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return fichiers.map((fichier) => {
    const contenu = readFileSync(resolve(DOSSIER_MIGRATIONS, fichier), 'utf8');
    const debutUp = SENTINELLE_UP.exec(contenu);
    const debutDown = SENTINELLE_DOWN.exec(contenu);

    if (!debutUp || !debutDown) {
      console.error(
        `${ROUGE}✗ ${fichier} : sentinelles \`-- @UP\` / \`-- @DOWN\` manquantes.${RAZ}\n` +
          '  Le critère du lot L1 exige des migrations up/down PROPRES : une migration\n' +
          '  sans descente n’est pas réversible, et une migration irréversible ne peut\n' +
          '  pas passer le garde-fou de déploiement (02 §11.2, 02 §30.6).\n',
      );
      process.exit(1);
    }
    if (debutDown.index < debutUp.index) {
      console.error(`${ROUGE}✗ ${fichier} : \`-- @DOWN\` apparaît avant \`-- @UP\`.${RAZ}`);
      process.exit(1);
    }

    const up = contenu.slice(debutUp.index + debutUp[0].length, debutDown.index).trim();
    const down = contenu.slice(debutDown.index + debutDown[0].length).trim();

    if (up === '' || down === '') {
      console.error(`${ROUGE}✗ ${fichier} : section @UP ou @DOWN vide.${RAZ}`);
      process.exit(1);
    }

    const version = fichier.slice(0, 4);
    if (!/^\d{4}$/.test(version)) {
      console.error(`${ROUGE}✗ ${fichier} : le nom doit commencer par 4 chiffres (0001_…).${RAZ}`);
      process.exit(1);
    }

    return {
      version,
      nom: fichier.replace(/^\d{4}_/, '').replace(/\.sql$/, ''),
      fichier,
      up,
      down,
      // Empreinte du FICHIER ENTIER, pas de la seule section @UP (défaut mineur
      // relevé par la revue croisée A17). Ne hacher que la montée laissait
      // modifier après coup la DESCENTE d'une migration déjà appliquée sans que
      // rien ne le signale — et une descente altérée ne se découvre qu'au moment
      // où l'on en a besoin, c'est-à-dire pendant un incident.
      empreinte: createHash('sha256').update(contenu).digest('hex'),
    };
  });
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------
async function assurerJournal(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_JOURNAL} (
      version    TEXT        NOT NULL PRIMARY KEY,
      nom        TEXT        NOT NULL,
      empreinte  TEXT        NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function journal(client) {
  const { rows } = await client.query(
    `SELECT version, nom, empreinte, applied_at FROM ${TABLE_JOURNAL} ORDER BY version`,
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function appliquer(client, migrations, appliquees, dryRun) {
  const dejaLa = new Map(appliquees.map((m) => [m.version, m]));

  // 1. Aucune migration déjà appliquée n'a le droit d'avoir changé.
  const alterees = migrations.filter(
    (m) => dejaLa.has(m.version) && dejaLa.get(m.version).empreinte !== m.empreinte,
  );
  if (alterees.length > 0) {
    console.error(
      `${ROUGE}✗ MIGRATION DÉJÀ APPLIQUÉE MODIFIÉE APRÈS COUP${RAZ}\n` +
        alterees.map((m) => `  ${m.fichier}`).join('\n') +
        '\n\n  Une migration appliquée est immuable : la corriger en place ferait diverger\n' +
        '  silencieusement staging et production. Écris une NOUVELLE migration.\n',
    );
    process.exit(1);
  }

  // 2. Aucune migration ne doit apparaître AVANT la dernière appliquée.
  const derniereAppliquee = appliquees.at(-1)?.version;
  const intercalees = migrations.filter(
    (m) =>
      !dejaLa.has(m.version) && derniereAppliquee !== undefined && m.version < derniereAppliquee,
  );
  if (intercalees.length > 0) {
    console.error(
      `${ROUGE}✗ MIGRATION INTERCALÉE${RAZ}\n` +
        intercalees.map((m) => `  ${m.fichier}`).join('\n') +
        `\n\n  Ces fichiers se placent AVANT ${derniereAppliquee}, déjà appliquée. L'ordre\n` +
        '  ne serait pas le même selon les environnements. Renumérote à la suite.\n',
    );
    process.exit(1);
  }

  const enAttente = migrations.filter((m) => !dejaLa.has(m.version));

  if (enAttente.length === 0) {
    console.log(
      `${VERT}✓${RAZ} migrations : schéma à jour ` +
        `(${String(appliquees.length)} appliquée(s), 0 en attente).`,
    );
    return;
  }

  if (dryRun) {
    console.log(`${JAUNE}migrations en attente (${String(enAttente.length)}) — DRY-RUN :${RAZ}`);
    for (const m of enAttente) {
      console.log(
        `  ${m.fichier}  ${GRIS}(descente présente, ${String(m.down.split('\n').length)} ligne(s))${RAZ}`,
      );
    }
    console.log(`${VERT}✓${RAZ} dry-run : toutes réversibles, RIEN n'a été appliqué.`);
    return;
  }

  for (const m of enAttente) {
    process.stdout.write(`  ${m.fichier} … `);
    try {
      await client.query('BEGIN');
      await client.query(m.up);
      await client.query(
        `INSERT INTO ${TABLE_JOURNAL} (version, nom, empreinte) VALUES ($1, $2, $3)`,
        [m.version, m.nom, m.empreinte],
      );
      await client.query('COMMIT');
      console.log(`${VERT}appliquée${RAZ}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.log(`${ROUGE}ÉCHEC${RAZ}`);
      console.error(`\n${ROUGE}✗ ${m.fichier} : ${err.message}${RAZ}\n`);
      if (err.position) console.error(`  position : ${err.position}\n`);
      process.exit(1);
    }
  }
  console.log(
    `${VERT}✓${RAZ} migrations : ${String(enAttente.length)} appliquée(s), schéma à jour.`,
  );
}

async function redescendre(client, migrations, appliquees, cible) {
  const parVersion = new Map(migrations.map((m) => [m.version, m]));
  // On redescend de la plus récente vers la plus ancienne, jusqu'à la cible incluse.
  const aRedescendre = [...appliquees].reverse().filter((a) => a.version > cible);

  if (aRedescendre.length === 0) {
    console.log(`${VERT}✓${RAZ} descente : rien à redescendre au-dessus de « ${cible} ».`);
    return;
  }

  for (const a of aRedescendre) {
    const m = parVersion.get(a.version);
    if (!m) {
      console.error(
        `${ROUGE}✗ migration ${a.version} appliquée mais son fichier a disparu.${RAZ}\n` +
          '  Impossible de redescendre sans sa section @DOWN. Restaure le fichier.\n',
      );
      process.exit(1);
    }
    process.stdout.write(`  ${m.fichier} … `);
    try {
      await client.query('BEGIN');
      await client.query(m.down);
      await client.query(`DELETE FROM ${TABLE_JOURNAL} WHERE version = $1`, [m.version]);
      await client.query('COMMIT');
      console.log(`${VERT}redescendue${RAZ}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.log(`${ROUGE}ÉCHEC${RAZ}`);
      console.error(`\n${ROUGE}✗ descente de ${m.fichier} : ${err.message}${RAZ}\n`);
      process.exit(1);
    }
  }
  console.log(`${VERT}✓${RAZ} descente : ${String(aRedescendre.length)} migration(s) annulée(s).`);
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------
async function principal() {
  const args = process.argv.slice(2);
  const migrations = lireMigrations();

  if (migrations.length === 0) {
    console.error(
      `${ROUGE}✗ aucun fichier de migration dans apps/api/drizzle/.${RAZ}\n` +
        '  Le schéma naît du fichier 04, transcrit en SQL brut versionné (11 §2).\n',
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: urlBase() });
  try {
    await client.connect();
  } catch (err) {
    console.error(`${ROUGE}✗ PostgreSQL injoignable : ${err.message}${RAZ}`);
    if (err.code === 'ENOTFOUND' && /@postgres[:/]/.test(urlBase())) {
      // Piège de dev classique : le .env porte le nom d'hôte du réseau Docker.
      // Il ne résout QUE depuis un conteneur de la pile.
      console.error(
        "  Le .env vise l'hôte Docker `postgres`, qui ne résout pas depuis la machine.\n" +
          '  Depuis l’hôte, vise le port publié par la pile de dev :\n' +
          '    DATABASE_URL=postgresql://axion:<mdp>@localhost:5432/axion_audit pnpm db:migrate\n' +
          '  Ou exécute la commande DANS le conteneur api.\n',
      );
    }
    process.exit(1);
  }

  try {
    // Invariant 5 : la session vit en UTC comme le serveur.
    await client.query("SET TIME ZONE 'UTC'");
    await assurerJournal(client);
    const appliquees = await journal(client);

    if (args.includes('--status')) {
      console.log(`Journal ${TABLE_JOURNAL} — ${String(appliquees.length)} migration(s) :`);
      for (const a of appliquees) {
        console.log(`  ${a.version}  ${a.nom}  ${GRIS}${a.applied_at.toISOString()}${RAZ}`);
      }
      const enAttente = migrations.filter((m) => !appliquees.some((a) => a.version === m.version));
      console.log(`En attente : ${String(enAttente.length)}`);
      return;
    }

    if (args.includes('--down') || args.includes('--down-to')) {
      const iCible = args.indexOf('--down-to');
      const cible =
        iCible >= 0
          ? String(args[iCible + 1] ?? '0000').padStart(4, '0')
          : (appliquees.at(-2)?.version ?? '0000');
      await redescendre(client, migrations, appliquees, cible);
      return;
    }

    await appliquer(client, migrations, appliquees, args.includes('--check'));
  } finally {
    await client.end();
  }
}

await principal();
