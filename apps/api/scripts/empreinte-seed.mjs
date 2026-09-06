#!/usr/bin/env node
// =============================================================================
// EMPREINTE DU JEU DE RÉFÉRENCE — instrument de MESURE, en LECTURE SEULE
//
//   pnpm seed:empreinte              → tableau par table + UNE empreinte globale
//   pnpm seed:empreinte -- --json    → même chose, en JSON (CI, dossiers de porte)
//   pnpm seed:empreinte -- --attendue <hex>
//                                    → compare à une empreinte publiée ; sort en
//                                      code 1 si le jeu de référence a dérivé
//
// -----------------------------------------------------------------------------
// POURQUOI CET OUTIL EXISTE À CÔTÉ DE `seed.mjs --empreinte`
// -----------------------------------------------------------------------------
// `seed.mjs --empreinte` répond à UNE question, et la répond bien : « rejouer le
// seed sur CETTE base change-t-il quelque chose ? » (critère L1 du fichier 07).
// Il ne peut pas répondre à l'autre : « le jeu de référence est-il bien CELUI
// qu'on croit ? » — pour deux raisons de construction.
//
//   1. Il SEEDE avant de mesurer. Un instrument qui écrit n'est pas un
//      instrument : on ne peut pas s'en servir pour constater l'état d'une base
//      de production, ni le mettre dans une CI en lecture seule.
//   2. Il hache la ligne ENTIÈRE (`t::text`), donc l'`id` UUID v7 tiré à
//      l'exécution et l'`updated_at` posé par `now()`. Mesuré le 2026-08-28 :
//      la MÊME graine, sur deux bases fraîches, donne HUIT empreintes
//      DIFFÉRENTES sur huit. Ces chiffres ne caractérisent donc pas le jeu de
//      référence — ils caractérisent une base particulière, un jour donné.
//      Publier l'un d'eux dans un dossier de porte ne prouve rien à personne.
//
// Cet outil-ci mesure le CONTENU MÉTIER : les codes, les libellés, les valeurs,
// et les correspondances — FK résolues en codes. Ni identifiants alloués, ni
// horodatages d'allocation. Conséquence recherchée : la même graine sur
// n'importe quelle base fraîche donne la MÊME empreinte, aujourd'hui et dans
// six mois. C'est cela qu'une porte peut citer et qu'un tiers peut rejouer.
//
// Les deux outils restent utiles et ne se remplacent pas : `--empreinte` prouve
// l'IDEMPOTENCE (rien n'a bougé au 2e passage, horodatages compris), celui-ci
// prouve la CONFORMITÉ du contenu (c'est bien le jeu attendu).
//
// -----------------------------------------------------------------------------
// PÉRIMÈTRE : 7 RÉFÉRENTIELS + 1 TABLE APPLICATIVE, ET LES DEUX SONT NOMMÉS
// -----------------------------------------------------------------------------
// `seed.mjs --empreinte` imprime HUIT lignes, et le dossier de porte parlait de
// « 7 référentiels » : ni l'un ni l'autre n'a tort, ils ne nomment pas le même
// ensemble. Le seed L1 (11 §5) peuple SEPT référentiels — `blocks`, `sectors`,
// `services`, `interlocutor_profiles`, `size_tiers`, `naf_sector_map`,
// `estimation_params` — PLUS le compte fondateur dans `users`, qui est une table
// applicative et non un référentiel (04 §7 la classe avec `refresh_tokens`).
//
// `users` est donc mesurée SÉPARÉMENT et n'entre PAS dans l'empreinte globale.
// Ce n'est pas un détail de présentation, c'est une nécessité :
//   · son contenu dépend de l'environnement (`SEED_ADMIN_EMAIL`) — une empreinte
//     qui l'inclurait ne pourrait JAMAIS être comparable d'une machine à l'autre ;
//   · `password_hash` porte un sel aléatoire — elle changerait à chaque création ;
//   · e-mail et nom sont des données personnelles, et une empreinte finit copiée
//     dans un dossier de porte (invariant : aucune donnée personnelle dans les
//     journaux, 11 §2).
// Ce qui est mesuré de `users` est donc sa FORME — rôle, profil d'usage, actif,
// habilitation posée ou non — jamais son identité.
//
// -----------------------------------------------------------------------------
// DÉTERMINISME : CE QUI EST IMPOSÉ, ET POURQUOI
// -----------------------------------------------------------------------------
// · ORDRE DES TABLES : la liste `REFERENTIELS` ci-dessous, dans cet ordre, qui
//   est celui du 11 §5. Jamais un ordre alphabétique — il dépend de la locale.
// · ORDRE DES LIGNES : les lignes sont canonisées PUIS triées OCTET PAR OCTET en
//   JavaScript (`Buffer.compare`). C'est le point qui manquait le plus :
//   `ORDER BY t::text` côté SQL trie selon la COLLATION de la base, et une base
//   créée en `en_US.UTF-8` ne trie pas comme une base en `C`. Deux bases au même
//   contenu rendaient alors deux empreintes différentes — un piège pire que pas
//   d'empreinte, parce qu'il se déclenche à l'endroit où l'on cherche à prouver.
// · REPRÉSENTATION : rien n'est laissé au rendu de PostgreSQL. Chaque valeur est
//   remontée en `::text`, puis ré-encodée ici en un jeton PRÉFIXÉ PAR SA LONGUEUR,
//   ce qui rend le codage injectif — aucune séquence d'échappement, aucune
//   ambiguïté possible entre un séparateur et un caractère de donnée :
//       NULL     → `~`                    (distinct de la chaîne vide, `s0:`)
//       texte    → `s<octets>:<valeur>`   (UTF-8, normalisé NFC)
//       nombre   → `n<décimal canonique>;`
//       booléen  → `b1` / `b0`
//   Canonisation d'un nombre : signe `+` retiré, zéros de tête retirés, zéros de
//   queue de la partie décimale retirés, `-0` ramené à `0`. Sans cela, `0.60` et
//   `0.6` — la même valeur NUMERIC, deux rendus selon l'échelle stockée —
//   donneraient deux empreintes.
//   Aucun horodatage n'entre dans l'empreinte : par construction, aucune colonne
//   temporelle n'est projetée (voir les commentaires de chaque table).
// · ALGORITHME : md5. Ce n'est PAS une primitive de sécurité ici et cet outil ne
//   défend contre aucun adversaire — il détecte une DÉRIVE ACCIDENTELLE du jeu
//   de référence. Les 12 caractères de `seed.mjs --empreinte` (48 bits) sont
//   largement suffisants pour cet usage : la probabilité qu'une modification
//   accidentelle retombe sur la même valeur est de l'ordre de 4·10⁻¹⁵. Ils sont
//   donc CONSERVÉS pour les lignes par table, qu'un relecteur balaie à l'œil, et
//   pour rester comparables à l'outil existant. L'empreinte GLOBALE, elle, est
//   imprimée en ENTIER (32 caractères) : elle part dans un dossier de porte, où
//   l'on cite un chiffre plutôt qu'on ne le compare du regard, et les 20
//   caractères supplémentaires ne coûtent rien. Changer d'algorithme serait un
//   choix sans bénéfice pour cet usage, et le contrat 11 §8-4 range la crypto
//   parmi ce qui ne se décide pas seul : md5 reste, argumenté plutôt que subi.
//
// Traçabilité : E17, E36, E43 · critère L1 du fichier 07 · point 24 du gardien A02.
// =============================================================================
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
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
const GRIS = `${ESC}[90m`;
const RAZ = `${ESC}[0m`;

const RACINE_API = resolve(import.meta.dirname, '..');
const RACINE_DEPOT = resolve(RACINE_API, '../..');

if (!process.env.DATABASE_URL) {
  const fichier = resolve(RACINE_DEPOT, '.env');
  if (existsSync(fichier)) {
    try {
      process.loadEnvFile(fichier);
    } catch {
      /* un .env illisible ne doit pas masquer le message ci-dessous */
    }
  }
}

function abandon(titre, detail) {
  console.error(`${ROUGE}✗ empreinte : ${titre}${RAZ}\n${detail}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  abandon(
    'DATABASE_URL absente.',
    '  Renseigne-la dans le .env de la racine ou en variable d’environnement.\n',
  );
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const arguments_ = process.argv.slice(2);
const sortieJson = arguments_.includes('--json');
const positionAttendue = arguments_.indexOf('--attendue');
const attendue = positionAttendue === -1 ? undefined : arguments_[positionAttendue + 1];

if (positionAttendue !== -1 && (attendue === undefined || attendue.startsWith('--'))) {
  abandon(
    '--attendue exige une empreinte.',
    '  Exemple : pnpm seed:empreinte -- --attendue 0123456789abcdef0123456789abcdef\n',
  );
}

// ---------------------------------------------------------------------------
// LES 7 RÉFÉRENTIELS — projection MÉTIER, colonnes déclarées une à une
//
// Rien n'est projeté par `SELECT *` : une colonne ajoutée demain au fichier 04
// entrerait alors dans l'empreinte sans que personne l'ait décidé, et ferait
// rougir une comparaison pour une raison qui n'est pas une dérive de données.
// Ce que chaque table EXCLUT, et pourquoi, est écrit à côté d'elle.
// ---------------------------------------------------------------------------
const TEXTE = 'texte';
const NOMBRE = 'nombre';
const BOOLEEN = 'booleen';

const REFERENTIELS = [
  {
    nom: 'blocks',
    // Exclu : `id` (UUID v7 tiré à l'exécution du seed — allocation, pas contenu).
    colonnes: [
      ['b.code', TEXTE],
      ['b.label_fr', TEXTE],
      ['b.position', NOMBRE],
      ['b.is_default', BOOLEEN],
      ['b.description', TEXTE],
    ],
    depuis: 'blocks b',
  },
  {
    nom: 'sectors',
    // Exclu : `id`.
    colonnes: [
      ['s.code', TEXTE],
      ['s.label_fr', TEXTE],
      ['s.label_en', TEXTE],
      ['s.is_active', BOOLEEN],
    ],
    depuis: 'sectors s',
  },
  {
    nom: 'services',
    // Exclu : `id`.
    colonnes: [
      ['s.code', TEXTE],
      ['s.label_fr', TEXTE],
    ],
    depuis: 'services s',
  },
  {
    nom: 'interlocutor_profiles',
    // Exclu : `id`. `group_code` est bien du CONTENU — c'est la base du calcul de
    // divergence direction/terrain (04 §7, §32.1), sa dérive doit se voir.
    colonnes: [
      ['p.code', TEXTE],
      ['p.label_fr', TEXTE],
      ['p.group_code', TEXTE],
    ],
    depuis: 'interlocutor_profiles p',
  },
  {
    nom: 'size_tiers',
    // Exclu : `id`. Les bornes d'effectif sont du contenu : un palier déplacé
    // reclasse des entreprises entières.
    colonnes: [
      ['t.code', TEXTE],
      ['t.label', TEXTE],
      ['t.headcount_min', NOMBRE],
      ['t.headcount_max', NOMBRE],
    ],
    depuis: 'size_tiers t',
  },
  {
    nom: 'naf_sector_map',
    // `sector_id` est une FK vers un `sectors.id` alloué au seed : la projeter
    // rendrait l'empreinte propre à une base. On projette le CODE du secteur —
    // c'est d'ailleurs la donnée qui a un sens : « division 43 → artisanat ».
    // LEFT JOIN volontaire : une correspondance orpheline (FK cassée) doit
    // apparaître comme un NULL dans l'empreinte, pas disparaître de la mesure.
    colonnes: [
      ['n.naf_code', TEXTE],
      ['s.code', TEXTE],
    ],
    depuis: 'naf_sector_map n LEFT JOIN sectors s ON s.id = n.sector_id',
  },
  {
    nom: 'estimation_params',
    // Exclus : `updated_at` (NOT NULL DEFAULT now() — pur horodatage d'écriture,
    // c'est LUI qui faisait déjà diverger cette table d'une base à l'autre) et
    // `updated_by` (FK vers un `users.id` alloué au seed).
    // `description` est projetée : elle porte le marqueur « défaut à valider »
    // exigé au 11 §5, dont la disparition est exactement une dérive à détecter.
    colonnes: [
      ['e.key', TEXTE],
      ['e.value', NOMBRE],
      ['e.unit', TEXTE],
      ['e.description', TEXTE],
    ],
    depuis: 'estimation_params e',
  },
];

// ---------------------------------------------------------------------------
// Canonisation
// ---------------------------------------------------------------------------

/** Nombre décimal canonique : une valeur, une écriture. */
function canoniserNombre(brut) {
  let valeur = brut.trim();
  if (valeur.startsWith('+')) valeur = valeur.slice(1);
  const negatif = valeur.startsWith('-');
  if (negatif) valeur = valeur.slice(1);
  // NUMERIC ne rend pas d'exposant dans les plages du seed, mais un paramètre
  // saisi en console pourrait en porter un : on ramène à une écriture décimale.
  if (valeur.includes('e') || valeur.includes('E')) valeur = Number(valeur).toFixed(20);
  if (valeur.includes('.')) valeur = valeur.replace(/0+$/, '').replace(/\.$/, '');
  valeur = valeur.replace(/^0+(?=\d)/, '');
  if (valeur === '') valeur = '0';
  return negatif && valeur !== '0' ? `-${valeur}` : valeur;
}

/**
 * Jeton canonique d'une valeur. Le préfixe de LONGUEUR rend le codage injectif :
 * aucune valeur ne peut se faire passer pour la frontière entre deux colonnes.
 */
function jeton(brut, genre) {
  if (brut === null) return '~';
  switch (genre) {
    case NOMBRE:
      return `n${canoniserNombre(brut)};`;
    case BOOLEEN:
      return brut === 't' || brut === 'true' ? 'b1' : 'b0';
    default: {
      const texte = brut.normalize('NFC');
      return `s${String(Buffer.byteLength(texte, 'utf8'))}:${texte}`;
    }
  }
}

/** md5 hexadécimal d'une chaîne, en UTF-8. */
function md5(chaine) {
  return createHash('md5').update(chaine, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Mesure
// ---------------------------------------------------------------------------

/** Empreinte de contenu d'un référentiel : { nom, lignes, md5 }. */
async function mesurerReferentiel(client, table) {
  const projection = table.colonnes
    .map(([expression], index) => `(${expression})::text AS c${String(index)}`)
    .join(', ');
  // Aucun ORDER BY SQL : le tri se fait ci-dessous, en octets, hors collation.
  const { rows } = await client.query(`SELECT ${projection} FROM ${table.depuis}`);

  const lignesCanoniques = rows.map((ligne) =>
    table.colonnes
      .map(([, genre], index) => jeton(ligne[`c${String(index)}`] ?? null, genre))
      .join(''),
  );

  lignesCanoniques.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));

  return {
    nom: table.nom,
    lignes: lignesCanoniques.length,
    md5: md5(`${table.nom}\n${lignesCanoniques.join('\n')}\n`),
  };
}

/**
 * Contrôle de FORME du compte fondateur — jamais son identité.
 * Ni e-mail, ni nom, ni empreinte de mot de passe : cette sortie est destinée à
 * être copiée dans un dossier de porte versionné (11 §2, 06 §10.4).
 */
async function mesurerComptes(client) {
  const { rows } = await client.query(
    `SELECT role::text                                AS role,
            usage_profile::text                       AS profil,
            is_active::text                           AS actif,
            (habilitated_at IS NOT NULL)::text        AS habilite
       FROM users`,
  );

  const lignesCanoniques = rows.map(
    (l) =>
      jeton(l.role, TEXTE) +
      jeton(l.profil, TEXTE) +
      jeton(l.actif, BOOLEEN) +
      jeton(l.habilite, BOOLEEN),
  );
  lignesCanoniques.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));

  return {
    comptes: rows.length,
    admins: rows.filter((l) => l.role === 'admin').length,
    adminsHabilites: rows.filter((l) => l.role === 'admin' && l.habilite === 'true').length,
    md5: md5(`users/forme\n${lignesCanoniques.join('\n')}\n`),
  };
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
} catch (err) {
  abandon('PostgreSQL injoignable.', `  ${err.message}\n`);
}

let code = 0;
try {
  // LECTURE SEULE, et pas seulement par convention : la transaction est déclarée
  // en lecture seule, donc PostgreSQL REFUSERAIT toute écriture qui s'y glisserait.
  // Un instrument de mesure ne doit pas pouvoir modifier ce qu'il mesure.
  await client.query('BEGIN TRANSACTION READ ONLY');
  // Ces réglages ne sont pas ce sur quoi repose le déterminisme (tout est
  // ré-encodé côté Node) ; ils écartent une classe d'accidents en amont.
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query("SET LOCAL DateStyle = 'ISO, YMD'");
  await client.query('SET LOCAL extra_float_digits = 0');

  const { rows: presence } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'blocks'`,
  );
  if (presence[0].n === 0) {
    abandon(
      'schéma absent.',
      '  Joue d’abord `pnpm db:migrate`, puis `pnpm seed` : cet outil MESURE un jeu de\n' +
        '  référence, il ne le crée pas et n’écrit rien.\n',
    );
  }

  const tables = [];
  for (const table of REFERENTIELS) tables.push(await mesurerReferentiel(client, table));
  const comptes = await mesurerComptes(client);

  // Empreinte globale = md5 des empreintes par table, dans l'ORDRE FIXE ci-dessus.
  // Composer ainsi plutôt que tout concaténer a une vertu de diagnostic : quand la
  // globale bouge, la ligne fautive est déjà imprimée juste au-dessus.
  const globale = md5(tables.map((t) => `${t.nom}|${String(t.lignes)}|${t.md5}\n`).join(''));

  if (sortieJson) {
    console.log(
      JSON.stringify(
        {
          empreinteGlobale: globale,
          referentiels: tables.map((t) => ({ table: t.nom, lignes: t.lignes, md5: t.md5 })),
          comptes,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `\nEmpreinte du jeu de référence — ${String(REFERENTIELS.length)} référentiels (11 §5)\n`,
    );
    console.log(`${GRIS}  table                    lignes  empreinte${RAZ}`);
    for (const t of tables) {
      console.log(`  ${t.nom.padEnd(24)} ${String(t.lignes).padStart(6)}  ${t.md5.slice(0, 12)}`);
    }
    console.log(`${GRIS}  ${'─'.repeat(46)}${RAZ}`);
    console.log(`  EMPREINTE GLOBALE (md5, 32 car.) : ${globale}\n`);
    console.log(
      `${GRIS}  Table applicative mesurée À PART — users (compte fondateur) :${RAZ}\n` +
        `    ${String(comptes.comptes)} compte(s) · ${String(comptes.admins)} admin(s) · ` +
        `${String(comptes.adminsHabilites)} habilité(s) · forme ${comptes.md5.slice(0, 12)}\n` +
        `${GRIS}    (e-mail, nom et empreinte de mot de passe EXCLUS : dépendants de\n` +
        `     l'environnement et personnels — hors empreinte globale.)${RAZ}\n`,
    );
  }

  if (attendue !== undefined) {
    const normalisee = attendue.trim().toLowerCase();
    const conforme = globale === normalisee || globale.startsWith(normalisee);
    if (conforme) {
      console.log(`${VERT}✓${RAZ} empreinte conforme à l’attendue (${normalisee}).`);
    } else {
      console.error(
        `${ROUGE}✗ LE JEU DE RÉFÉRENCE A DÉRIVÉ.${RAZ}\n` +
          `  attendue : ${normalisee}\n` +
          `  obtenue  : ${globale}\n\n` +
          `  Les référentiels sont administrables : un écart peut être légitime (une\n` +
          `  modification en console) ou accidentel (un seed divergent, une migration\n` +
          `  qui a réécrit une valeur). Le tableau ci-dessus nomme la table qui a bougé.\n`,
      );
      code = 1;
    }
  }

  await client.query('ROLLBACK');
} finally {
  await client.end();
}

process.exit(code);
