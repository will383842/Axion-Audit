#!/usr/bin/env node
// =============================================================================
// INVENTAIRE FERMÉ DU SCHÉMA — le second verrou, indépendant du comparateur
//
// POURQUOI CE CONTRÔLE EXISTE. `pnpm schema:diff` compare la base à
// `schema-manifest.json`, extrait du fichier 04. C'est une LISTE BLANCHE : il
// vérifie les objets qu'il sait nommer — tables, colonnes, contraintes
// PK/FK/UNIQUE/CHECK, index du §7.1 — parce que c'est le périmètre que le 11 §7
// lui assigne. Une liste blanche a un mode d'échec par défaut : **le faux négatif
// silencieux**. Ce que la liste ne nomme pas, elle le déclare conforme.
//
// Trois passes de revue croisée indépendantes ont chacune trouvé du territoire
// neuf. La troisième a montré que le territoire restant n'était plus un oubli
// d'implémentation mais une LIMITE DU PÉRIMÈTRE lui-même. Six familles d'objets,
// toutes hors du 11 §7, toutes prouvées EN DONNÉES, toutes à « ZÉRO ÉCART » :
//
//   · RULE … ON INSERT DO INSTEAD NOTHING sur `answers` → l'insertion RÉUSSIT,
//     zéro ligne écrite. Une réponse d'auditeur disparaît, et la synchronisation
//     terrain rapporte un succès. C'est le pire cas de tout le lot.
//   · TRIGGER BEFORE INSERT réécrivant `answers.value` → l'auditeur répond
//     « non », la base contient « oui ». Falsification silencieuse.
//   · ROW LEVEL SECURITY sans politique → lecture vide, écriture refusée.
//   · GENERATED ALWAYS AS IDENTITY sur `questions.version` → le versionnement de
//     la banque de questions (§36.4) devient impossible.
//   · Collation ICU non déterministe sur `users.email` → le sens de `=` et de
//     l'UNIQUE change sans que le type `text` bouge.
//   · Table UNLOGGED → `activity_log` (rétention RGPD 12 mois, §10.4) est vidé
//     au premier redémarrage brutal. Touche l'invariant 8.
//
// CE QUE FAIT CE SCRIPT, ET POURQUOI IL EST L'INVERSE DE L'AUTRE. Il n'énumère
// pas ce qui doit exister : il exige que **rien d'autre** n'existe. C'est une
// LISTE NOIRE, dont le mode d'échec est le faux positif — bruyant, visible,
// corrigeable. Les deux contrôles se complètent : le diff dit « tout ce que le 04
// décrit est là et conforme » ; celui-ci dit « et rien d'autre ne s'y est glissé ».
//
// FONDEMENT. Ce n'est pas un élargissement du contrat, c'est l'application d'un
// principe que ce dépôt applique déjà : `schema-diff.mjs` refuse une table que le
// fichier 04 n'a jamais autorisée, au même titre qu'une table manquante. Un
// trigger que le 04 n'a jamais autorisé n'est pas d'une autre nature — il est
// seulement plus dangereux, parce qu'il change le comportement sans changer la
// structure.
//
// CE QU'IL NE FAIT PAS. Il ne remplace pas le diff et ne prétend pas à
// l'exhaustivité : sa liste noire doit être MAINTENUE. La solution qui supprime
// ce défaut — comparer un schéma doré produit par `pg_dump` plutôt qu'une liste —
// est proposée dans AMELIORATIONS.md (fiche A-003) et attend l'arbitrage de
// Williams, parce qu'elle remplace un mécanisme que le contrat 11 §7 nomme.
//
// Traçabilité : E17, E36, E43 · DECISIONS.md du 2026-08-27 (inventaire fermé).
// =============================================================================
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '..');
// `pg` est une dépendance de l'API, pas de la racine (11 §8.1) — même résolution
// que `schema-diff.mjs`, pour ne pas élargir les dépendances du monorepo.
const requireApi = createRequire(resolve(RACINE, 'apps/api/package.json'));

// Couleurs ANSI. L'octet ESC vient d'un APPEL DE FONCTION, jamais d'une séquence
// d'échappement écrite à la main : l'outillage d'édition de la chaîne d'agents la
// convertit en OCTET RÉEL à l'écriture, et un octet de contrôle dans une source la
// rend invisible aux `grep` des étapes 3, 4 et 6 du pipeline (mesuré le 2026-09-04 ;
// garde `scripts/check-octets-controle.mjs`).
const ESC = String.fromCharCode(27);
const ROUGE = `${ESC}[31m`;
const VERT = `${ESC}[32m`;
const GRIS = `${ESC}[90m`;
const RAZ = `${ESC}[0m`;

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
  console.error(`${ROUGE}✗ inventaire du schéma : DATABASE_URL absente.${RAZ}`);
  console.error('  Ce contrôle interroge le catalogue de PostgreSQL : il lui faut une base.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Les huit familles. Chaque entrée dit CE QU'ELLE CHERCHE et CE QUE ÇA COÛTE —
// un contrôle qui signale sans expliquer se fait contourner par la première
// personne pressée.
// ---------------------------------------------------------------------------
const FAMILLES = [
  {
    nom: 'TRIGGER',
    cout: "un trigger réécrit la donnée à l'insertion : l'auditeur répond « non », la base garde « oui »",
    sql: `SELECT c.relname || ' → ' || t.tgname AS objet
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  },
  {
    nom: 'RULE',
    cout: "une règle DO INSTEAD NOTHING fait RÉUSSIR l'insertion sans rien écrire — la réponse disparaît et la synchronisation rapporte un succès",
    sql: `SELECT c.relname || ' → ' || r.rulename AS objet
          FROM pg_rewrite r
          JOIN pg_class c ON c.oid = r.ev_class
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND r.rulename <> '_RETURN'`,
  },
  {
    nom: 'ROW LEVEL SECURITY',
    cout: 'RLS activée sans politique rend la table vide en lecture et refuse toute écriture',
    sql: `SELECT c.relname AS objet
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND (c.relrowsecurity OR c.relforcerowsecurity)`,
  },
  {
    nom: 'POLITIQUE RLS',
    cout: 'une politique filtre les lignes hors de tout contrôle applicatif',
    sql: `SELECT tablename || ' → ' || policyname AS objet
          FROM pg_policies WHERE schemaname = 'public'`,
  },
  {
    nom: 'CONTRAINTE DE TYPE INATTENDU',
    cout: "EXCLUDE … WITH = EST de l'unicité : il interdit des lignes que la spécification autorise",
    sql: `SELECT c.relname || ' → ' || con.conname || ' (contype=' || con.contype::text || ')' AS objet
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND con.contype NOT IN ('p', 'f', 'u', 'c')`,
  },
  {
    nom: 'COLONNE IDENTITY OU GENERATED',
    cout: 'GENERATED ALWAYS refuse toute valeur explicite — le versionnement des questions (§36.4) devient impossible',
    sql: `SELECT c.relname || '.' || a.attname AS objet
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
            AND (a.attidentity <> '' OR a.attgenerated <> '')`,
  },
  {
    nom: 'COLLATION NON STANDARD',
    cout: "une collation non déterministe change le sens de `=` et de l'UNIQUE sans que le type bouge",
    sql: `SELECT c.relname || '.' || a.attname || ' (' || col.collname || ')' AS objet
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_collation col ON col.oid = a.attcollation
          WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
            AND a.attcollation <> 0 AND col.collname <> 'default'`,
  },
  {
    nom: 'RELATION NON ORDINAIRE OU NON PERMANENTE',
    cout: "une table UNLOGGED est VIDÉE au premier redémarrage brutal (activity_log : rétention RGPD 12 mois) ; une table PARTITIONNÉE échappe à l'introspection des colonnes",
    sql: `SELECT c.relname || ' (relkind=' || c.relkind::text || ', persistance=' || c.relpersistence::text || ')' AS objet
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind NOT IN ('i', 'I')
            AND (c.relkind <> 'r' OR c.relpersistence <> 'p')`,
  },
];

const { Client } = requireApi('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
} catch (e) {
  console.error(`${ROUGE}✗ inventaire du schéma : PostgreSQL injoignable.${RAZ}`);
  console.error(`  ${String(e instanceof Error ? e.message : e)}`);
  // Piège récurrent, relevé en revue croisée (réserve M-3) : le `.env` de la racine
  // désigne l'hôte `postgres`, qui n'existe QUE dans le réseau Docker. Depuis la
  // machine, le même service répond sur 127.0.0.1. Le dire ici évite de conclure à
  // une base éteinte alors qu'elle tourne.
  console.error(
    "  Depuis la machine (hors conteneur), l'hôte est 127.0.0.1 et non `postgres` :\n" +
      '    DATABASE_URL=postgresql://<user>:<mdp>@127.0.0.1:5432/<base> pnpm check:schema-inventaire\n',
  );
  process.exit(1);
}

const trouvailles = [];
try {
  for (const famille of FAMILLES) {
    let rows;
    try {
      ({ rows } = await client.query(famille.sql));
    } catch (e) {
      // Un garde-fou qui PLANTE est pire qu'un garde-fou absent : il déverse une
      // pile d'appels que personne ne lit, et la CI rouge sans dire pourquoi.
      console.error(
        `${ROUGE}✗ inventaire du schéma : la requête « ${famille.nom} » a échoué.${RAZ}`,
      );
      console.error(`  ${String(e instanceof Error ? e.message : e)}
`);
      await client.end();
      process.exit(1);
    }
    for (const r of rows) trouvailles.push({ famille, objet: r.objet });
  }
} finally {
  await client.end();
}

if (trouvailles.length > 0) {
  console.error(
    `${ROUGE}✗ inventaire du schéma : ${String(trouvailles.length)} OBJET(S) que le fichier 04 n'autorise pas.${RAZ}\n`,
  );
  let familleCourante = null;
  for (const t of trouvailles) {
    if (t.famille.nom !== familleCourante) {
      familleCourante = t.famille.nom;
      console.error(`  ${ROUGE}${familleCourante}${RAZ}`);
      console.error(`  ${GRIS}${t.famille.cout}${RAZ}`);
    }
    console.error(`    · ${t.objet}`);
  }
  console.error(
    '\n  Ces objets sont HORS du périmètre de `pnpm schema:diff` (11 §7) : il les\n' +
      "  déclare conformes parce qu'il ne les regarde pas. Ils changent pourtant ce\n" +
      "  qui entre et sort de la base. Si l'un d'eux est VOULU, il ne se supprime pas\n" +
      '  en silence : il s’écrit dans le fichier 04 et se trace dans DECISIONS.md.\n',
  );
  process.exit(1);
}

console.log(
  `${VERT}✓${RAZ} inventaire du schéma : aucun objet hors des 8 familles surveillées.\n` +
    `  ${GRIS}ni trigger · ni règle · ni RLS ou politique · ni contrainte hors PK/FK/UNIQUE/CHECK ·\n` +
    `  ni colonne IDENTITY/GENERATED · ni collation non standard · ni table non ordinaire ou non permanente${RAZ}`,
);
