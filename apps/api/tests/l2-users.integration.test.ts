// =============================================================================
// LOT L2 / T3 — LE CRUD DES COMPTES, ÉPROUVÉ SUR UNE BASE RÉELLE.
//
// `GET /v1/users` · `POST /v1/users` · `PATCH /v1/users/:id` ·
// `PATCH /v1/users/:id/role` · `.../deactivate` · `.../habilitate` ·
// `.../password-reset`.
//
// Écrit par le testeur d'intégration, qui n'a produit AUCUNE des lignes testées
// (09 §5.6). Les attentes viennent de la SPÉCIFICATION et des arbitrages tracés —
// 05 §9.7, 03 §34.1/§34.4, 06 §10.1, 11 §3, invariants 3 et 7, et les deux entrées
// `DECISIONS.md` du 2026-08-30 (« Le CRUD users n'est pas spécifié ») et du
// 2026-08-31 (« Comment un mot de passe se réinitialise ») — jamais du décalque des
// branches de leur sujet.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE QUE CE FICHIER REFUSE D'ÊTRE : VERT PAR VACUITÉ.
// ═══════════════════════════════════════════════════════════════════════════════
// Chaque refus prouvé ici est accompagné de sa CONTRE-ÉPREUVE, parce qu'un test de
// refus seul est satisfait par une route cassée :
//   · « un consultant reçoit 403 » est vert sur une route qui refuse TOUT LE MONDE.
//     On prouve donc aussi qu'un admin passe, sur les SEPT routes ;
//   · « aucune ligne d'audit sur un acte idempotent » est vert si le service
//     n'écrit JAMAIS de ligne. On prouve donc d'abord que l'acte RÉEL en écrit une ;
//   · « le mot de passe n'est dans aucun journal » est vert si la capture de pino
//     est vide. On compte donc les lignes capturées avant de conclure.
//
// ── LES CINQ PROPRIÉTÉS QUI NE SE VOIENT PAS EN RELISANT LE CODE ─────────────
//   · LA PAGINATION NE BOUCLE PAS quand `limit` comptes partagent la même
//     MILLISECONDE. C'est le test le plus important de ce fichier : `created_at`
//     est un `TIMESTAMPTZ` (microsecondes) et `Date.toISOString()` s'arrête à la
//     milliseconde. Un curseur reconstruit depuis cette `Date` est strictement
//     INFÉRIEUR à la valeur réelle de la ligne frontière, qui se re-sert alors à
//     chaque page — boucle infinie, découverte au premier import réel, jamais en
//     relecture ;
//   · le garde-fou 05 §9.7 se décide PAR APPAREIL. Un compte à deux appareils dont
//     le plus RÉCEMMENT synchronisé est à jour doit quand même être refusé si
//     l'autre a un outbox non vide — une lecture « dernière ligne du compte »
//     rendrait un garde-fou qui rassure ;
//   · le mot de passe engendré ne franchit ni pino ni `activity_log`, alors que
//     l'ACTE, lui, doit y être ;
//   · une adresse en double sort en 409 et non en 500 : `drizzle` enveloppe
//     l'erreur du pilote `pg` dans `cause`, et une reconnaissance qui ne regarde
//     que l'erreur reçue rend toujours `false` — défaut invisible en lecture ;
//   · `password_hash` n'atteint le réseau dans AUCUNE réponse. Vérifié sur le
//     corps BRUT, jamais sur un objet déjà filtré par un schéma.
//
// ── UNE SONDE, ET POURQUOI ELLE EST LÉGITIME ─────────────────────────────────
// `pino` est intercepté (`vi.mock`) en gardant l'implémentation RÉELLE dessous —
// donc la redaction RGPD réelle : seule la DESTINATION est détournée vers un
// tableau. La sonde n'ajoute ni ne remplace aucun comportement, elle observe. C'est
// la seule façon d'éprouver « la valeur n'est nulle part » sur un canal qui n'a
// aucune trace dans la réponse HTTP.
//
// ── CE QUI N'EST PAS COUVERT ICI, DIT PLUTÔT QUE BÂCLÉ ───────────────────────
// La CONCURRENCE sur `FOR UPDATE` (deux changements de rôle simultanés). Le verrou
// existe et le motif est écrit dans le dépôt, mais un test qui l'éprouve vraiment
// demande deux transactions tenues ouvertes en parallèle sur le même pool : avec
// `singleFork` et un pool partagé par l'application, la mise en scène est fragile et
// produirait un test intermittent. Une suite intermittente finit ignorée, et c'est
// ainsi qu'un vrai échec passe pour du bruit. Remonté plutôt que simulé.
//
// Traçabilité : E33 (sécurité), E43 (conventions d'API : pagination keyset, format
// d'erreur), E45 (pilotage humain : habilitation §34.4) · invariants 3 et 7.
// =============================================================================
import { randomBytes } from 'node:crypto';
import type * as ModulePino from 'pino';
import { argon2id } from 'hash-wasm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';

// -----------------------------------------------------------------------------
// LA SONDE — déclarée avant tout import applicatif (`vi.hoisted`).
// -----------------------------------------------------------------------------
const sondes = vi.hoisted(() => ({
  /** Toutes les lignes écrites par pino pendant l'exécution. */
  lignesJournal: [] as string[],
}));

vi.mock('pino', async (importOriginal) => {
  const reel = await importOriginal<typeof ModulePino>();
  const destination = {
    write(ligne: string): void {
      sondes.lignesJournal.push(ligne);
    },
  };
  // La fabrique garde les OPTIONS de l'appelant — donc la redaction RGPD réelle —
  // et ne remplace que la destination. On teste la politique du dépôt, pas la nôtre.
  const fabrique = (options?: Parameters<typeof reel.pino>[0]): unknown =>
    reel.pino(options ?? {}, destination);
  const exporte = Object.assign(fabrique, reel.pino);
  return { ...reel, pino: exporte, default: exporte };
});

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// 64 caractères hexadécimaux = les 32 octets qu'exige `envApiSchema`.
// -----------------------------------------------------------------------------
const SECRET_ACCES = '6b'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '9d'.repeat(32);

/**
 * Paramètres Argon2id des empreintes SEMÉES, repris du seul producteur d'empreintes
 * antérieur à T3 (`apps/api/scripts/seed.mjs`). Les redéclarer ici plutôt que de les
 * importer du code sous test est délibéré : un test qui importe la constante de son
 * sujet ne vérifie plus que le sujet est d'accord avec lui-même.
 */
const PARAMETRES_SEMENCE = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19_456,
  hashLength: 32,
} as const;

/** Politique 06 §10.1, recopiée depuis la SPÉCIFICATION : « 12+ caractères ». */
const LONGUEUR_MIN_POLITIQUE = 12;

let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

// -----------------------------------------------------------------------------
// Une IP par appel d'authentification — le quota ne décide jamais d'un verdict
// -----------------------------------------------------------------------------
/**
 * Le plafond `/v1/auth/*` est de 10 req/min PAR IP. Sans adresse distincte, l'ORDRE
 * des `it` déciderait des verdicts, et une suite dont le résultat dépend de son
 * ordre ne prouve rien.
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  const b = Math.floor(compteurIp / 250) % 250;
  const c = compteurIp % 250;
  return `10.60.${String(b)}.${String(c)}`;
}

// -----------------------------------------------------------------------------
// Contrats de fil — RÉÉCRITS depuis la spécification, jamais importés du sujet
// -----------------------------------------------------------------------------
// Importer `userResponseSchema` de `@axion/shared` ferait dire au test « la réponse
// est conforme au schéma que la route utilise pour la produire » — une tautologie.
// Les schémas ci-dessous viennent du fichier 04 (colonnes de `users`) et de 11 §3
// (ISO 8601 UTC).

const utilisateurSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  email: z.string().min(1),
  role: z.enum(['admin', 'consultant', 'analyste', 'lecteur']),
  usageProfile: z.enum(['guide_strict', 'expert']),
  habilitatedAt: z.string().nullable(),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type Utilisateur = z.infer<typeof utilisateurSchema>;

const pageSchema = z.object({
  items: z.array(utilisateurSchema),
  nextCursor: z.string().nullable(),
});

const reinitialisationSchema = z.object({
  userId: z.uuid(),
  password: z.string(),
  forced: z.boolean(),
});

const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  userId: z.uuid(),
});

// -----------------------------------------------------------------------------
// Appel HTTP — le CORPS BRUT est toujours conservé
// -----------------------------------------------------------------------------
/**
 * `corps` est la chaîne telle qu'elle est partie sur le réseau. Toutes les
 * vérifications de non-divulgation portent sur ELLE : un objet déjà analysé par un
 * schéma a perdu, par construction, exactement ce qu'on cherche à voir.
 */
interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly corps: string;
}

type Methode = 'GET' | 'HEAD' | 'POST' | 'PATCH';

async function appeler(
  methode: Methode,
  url: string,
  // `| undefined` EXPLICITE : `exactOptionalPropertyTypes` distingue « clé absente »
  // de « clé présente valant `undefined` », et la matrice `ACTES` produit la seconde
  // forme (`corps: acte.corps(…)` rend `undefined` pour la route `GET`).
  options: {
    readonly jeton?: string | undefined;
    readonly corps?: Readonly<Record<string, unknown>> | undefined;
    readonly ip?: string | undefined;
  } = {},
): Promise<Reponse> {
  const reponse = await api().inject({
    method: methode,
    url,
    ...(options.corps === undefined ? {} : { payload: options.corps }),
    headers: {
      'x-forwarded-for': options.ip ?? '10.99.0.1',
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
  });

  let code: string | null = null;
  if (reponse.body !== '') {
    try {
      const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
      if (analyse.success) code = analyse.data.error.code;
    } catch {
      code = null;
    }
  }
  return { statut: reponse.statusCode, code, corps: reponse.body };
}

function utilisateur(reponse: Reponse): Utilisateur {
  return utilisateurSchema.parse(JSON.parse(reponse.corps));
}

// -----------------------------------------------------------------------------
// Comptes — un jeu FRAIS par test, jamais un compte partagé
// -----------------------------------------------------------------------------
type Role = 'admin' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly email: string;
  readonly nom: string;
  /** `null` quand le compte n'a pas d'empreinte utilisable (jeton signé directement). */
  readonly motDePasse: string | null;
  readonly jeton: string;
}

let compteurCompte = 0;

/**
 * Sème un compte DIRECTEMENT EN BASE et rend un jeton d'accès signé pour lui.
 *
 * ── POURQUOI LE JETON EST SIGNÉ PLUTÔT QU'OBTENU PAR `/v1/auth/login` ───────
 * Deux raisons, et aucune n'est le confort. D'abord le quota : `/v1/auth/*` plafonne
 * à 10 req/min/IP, et ce fichier crée plusieurs dizaines de comptes — la suite
 * deviendrait dépendante de son ordre. Ensuite la PORTÉE : ce fichier éprouve le
 * CRUD, pas la connexion (elle a son propre fichier). Ce qui compte ici, c'est que le
 * crochet ③ relise le rôle EN BASE ; il le fait quelle que soit l'origine du jeton.
 *
 * `motDePasse` n'est frappé en Argon2id que pour les comptes qui doivent VRAIMENT se
 * connecter — la dérivation coûte ~19 Mio et trois passes, on ne la paie pas pour rien.
 */
async function creerCompte(
  marqueur: string,
  options: {
    readonly role?: Role;
    readonly avecMotDePasse?: boolean;
    readonly habilite?: boolean;
    readonly actif?: boolean;
  } = {},
): Promise<Compte> {
  compteurCompte += 1;
  const suffixe = `${marqueur}-${String(compteurCompte)}`;
  const id = uuidv7();
  const email = `compte.${suffixe}@exemple.test`;
  const nom = `Compte ${suffixe}`;
  const motDePasse = options.avecMotDePasse === true ? `mot-de-passe-factice-${suffixe}` : null;

  const empreinte =
    motDePasse === null
      ? 'argon2-factice'
      : await argon2id({
          password: motDePasse,
          salt: randomBytes(16),
          ...PARAMETRES_SEMENCE,
          outputType: 'encoded',
        });

  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'guide_strict', $6, $7, now(), now())`,
    [
      id,
      nom,
      email,
      empreinte,
      options.role ?? 'consultant',
      options.habilite === true ? new Date() : null,
      options.actif ?? true,
    ],
  );

  return { id, email, nom, motDePasse, jeton: api().jwt.sign({ sub: id }) };
}

/** Un administrateur FRAIS. Chaque test qui agit a le sien : le quota global est par sujet. */
async function creerAdmin(marqueur: string): Promise<Compte> {
  return creerCompte(`admin-${marqueur}`, { role: 'admin', habilite: true });
}

/** Connexion réelle — réservée aux tests qui doivent prouver qu'un mot de passe ouvre. */
async function seConnecter(email: string, motDePasse: string): Promise<Reponse> {
  return appeler('POST', '/v1/auth/login', {
    corps: { email, password: motDePasse },
    ip: ipUnique(),
  });
}

// -----------------------------------------------------------------------------
// Lectures directes — la seule vérité sur ce qui a été écrit
// -----------------------------------------------------------------------------
interface LigneJournal {
  readonly id: string;
  readonly user_id: string | null;
  readonly action: string;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly meta: unknown;
}

/** Les lignes d'`activity_log` qui VISENT un compte, dans l'ordre chronologique. */
async function journalDe(cibleId: string): Promise<LigneJournal[]> {
  const resultat = await bd().query<LigneJournal>(
    `SELECT id, user_id, action, entity_type, entity_id, meta
       FROM activity_log WHERE entity_id = $1 ORDER BY created_at, id`,
    [cibleId],
  );
  return resultat.rows;
}

interface LigneCompte {
  readonly role: Role;
  readonly is_active: boolean;
  readonly habilitated_at: Date | null;
  readonly updated_at: Date;
  readonly password_hash: string;
  readonly created_at_texte: string;
}

async function ligneCompte(id: string): Promise<LigneCompte> {
  const resultat = await bd().query<LigneCompte>(
    `SELECT role, is_active, habilitated_at, updated_at, password_hash,
            created_at::text AS created_at_texte
       FROM users WHERE id = $1`,
    [id],
  );
  const ligne = resultat.rows[0];
  if (ligne === undefined) throw new Error(`compte ${id} absent de la base`);
  return ligne;
}

async function jetonsVivants(utilisateurId: string): Promise<number> {
  const resultat = await bd().query<{ nombre: string }>(
    `SELECT count(*)::text AS nombre FROM refresh_tokens
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [utilisateurId],
  );
  return Number(resultat.rows[0]?.nombre ?? '-1');
}

/**
 * Sème une ligne de `sync_log` — la donnée EXACTE du garde-fou 05 §9.7.
 *
 * `ended_at` ET `started_at` sont posés : la lecture du dépôt ordonne par
 * `coalesce(ended_at, started_at)`, et laisser l'un des deux nul ferait dépendre le
 * verdict du `NULLS LAST` plutôt que de la propriété qu'on veut éprouver.
 */
async function semerSync(
  utilisateurId: string,
  appareil: string,
  outboxRestant: number | null,
  ilYAMinutes: number,
): Promise<void> {
  await bd().query(
    `INSERT INTO sync_log (id, user_id, device_id, direction, outbox_remaining,
                           started_at, ended_at, status)
     VALUES (gen_random_uuid(), $1, $2, 'push', $3,
             now() - ($4 || ' minutes')::interval,
             now() - ($4 || ' minutes')::interval, 'ok')`,
    [utilisateurId, appareil, outboxRestant, String(ilYAMinutes)],
  );
}

// -----------------------------------------------------------------------------
// LES SEPT ROUTES, ÉNUMÉRÉES UNE FOIS
// -----------------------------------------------------------------------------
/**
 * Le tableau qui suit est la MATRICE des tests RBAC et de non-divulgation. Il est
 * écrit une fois : ajouter une route au produit sans l'ajouter ici la laisserait hors
 * de tout contrôle, et c'est précisément pourquoi le nombre d'entrées est ASSERTÉ
 * (voir le premier `it` de la section RBAC) contre le registre d'accès de
 * l'application — qui, lui, énumère les routes QUI EXISTENT.
 */
interface Acte {
  readonly nom: string;
  readonly methode: Methode;
  readonly url: (cibleId: string) => string;
  readonly corps: (marqueur: string) => Readonly<Record<string, unknown>> | undefined;
  /** Ce que l'admin doit obtenir — la contre-épreuve du refus. */
  readonly statutAdmin: number;
}

const ACTES: readonly Acte[] = [
  {
    nom: 'GET /v1/users',
    methode: 'GET',
    url: () => '/v1/users?limit=5',
    corps: () => undefined,
    statutAdmin: 200,
  },
  {
    nom: 'POST /v1/users',
    methode: 'POST',
    url: () => '/v1/users',
    corps: (marqueur) => ({
      name: `Compte cree ${marqueur}`,
      email: `compte.cree.${marqueur}@exemple.test`,
      password: 'mot-de-passe-factice-de-creation',
      role: 'lecteur',
    }),
    statutAdmin: 201,
  },
  {
    nom: 'PATCH /v1/users/:id',
    methode: 'PATCH',
    url: (cibleId) => `/v1/users/${cibleId}`,
    corps: (marqueur) => ({ name: `Compte renomme ${marqueur}` }),
    statutAdmin: 200,
  },
  {
    nom: 'PATCH /v1/users/:id/role',
    methode: 'PATCH',
    url: (cibleId) => `/v1/users/${cibleId}/role`,
    corps: () => ({ role: 'analyste' }),
    statutAdmin: 200,
  },
  {
    nom: 'PATCH /v1/users/:id/deactivate',
    methode: 'PATCH',
    url: (cibleId) => `/v1/users/${cibleId}/deactivate`,
    corps: () => ({}),
    statutAdmin: 200,
  },
  {
    nom: 'PATCH /v1/users/:id/habilitate',
    methode: 'PATCH',
    url: (cibleId) => `/v1/users/${cibleId}/habilitate`,
    corps: () => ({}),
    statutAdmin: 200,
  },
  {
    nom: 'PATCH /v1/users/:id/password-reset',
    methode: 'PATCH',
    url: (cibleId) => `/v1/users/${cibleId}/password-reset`,
    // `force: true` : sans lui, le garde-fou §9.7 refuse un compte neuf (aucune sync
    // connue) et la contre-épreuve « un admin passe » deviendrait un 409 — un refus
    // légitime que rien ne distinguerait d'un refus de droits.
    corps: () => ({ force: true }),
    statutAdmin: 200,
  },
];

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l2_users');
  nomBase = base.nom;
  await appliquerMontee(base.url);
  client = await connecter(base.url);

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit être
  // posée avant le premier `import()` dynamique, jamais après.
  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  // `trace` : on veut TOUT ce que le service écrit, sinon la preuve « le mot de passe
  // engendré n'est nulle part » ne vaudrait que pour les niveaux qu'on aurait bien
  // voulu regarder.
  process.env.LOG_LEVEL = 'trace';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;
}, 180_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// RBAC — LE REFUS EST UN 403, ET IL A UNE CONTRE-ÉPREUVE
// =============================================================================
describe('RBAC des sept routes de comptes (03 §34.1, invariant 3)', () => {
  it('la matrice de ce fichier couvre TOUTES les routes `/v1/users` enregistrées', async () => {
    // LE PIÈGE FERMÉ ICI : une huitième route ajoutée demain à `routesUsers` serait
    // hors de tout ce qui suit, et la section RBAC resterait verte en la laissant
    // sans contrôle. On confronte donc la matrice au REGISTRE D'ACCÈS de
    // l'application — qui énumère les routes QUI EXISTENT, pas celles auxquelles on a
    // pensé — au lieu de se fier à une liste écrite à la main.
    const enregistrees = api().registreAcces.filter((entree) => entree.url.startsWith('/v1/users'));

    // `HEAD /v1/users` n'est déclarée nulle part : Fastify l'ajoute d'office en
    // compagne de chaque `GET` (`exposeHeadRoutes`). Elle est nommée ICI plutôt
    // qu'écartée par un filtre, parce qu'une route qu'un filtre masque est une route
    // que plus personne ne contrôle — et celle-ci répond sur les MÊMES données.
    const attendues = [...ACTES.map((acte) => acte.nom), 'HEAD /v1/users'].sort((a, b) =>
      a.localeCompare(b),
    );
    const observees = enregistrees
      .map((entree) => `${entree.methodes.join(',')} ${entree.url}`)
      .sort((a, b) => a.localeCompare(b));

    expect(
      observees,
      'Les routes `/v1/users` enregistrées ne correspondent plus à la matrice de ce\n' +
        'fichier. Une route ajoutée sans entrer dans `ACTES` échapperait à TOUT ce qui\n' +
        'suit — RBAC comme non-divulgation de `password_hash`.',
    ).toStrictEqual(attendues);

    const nonAdmin = enregistrees.filter(
      (entree) =>
        entree.acces.type !== 'roles' ||
        entree.acces.roles.length !== 1 ||
        entree.acces.roles[0] !== 'admin',
    );
    expect(
      nonAdmin.map((entree) => `${entree.methodes.join(',')} ${entree.url}`),
      '03 §34.1 : « la console est ADMIN SEUL », et §34.3 exclut nommément « les\n' +
        'comptes » du périmètre du lead de mission. Une route de comptes ouverte à un\n' +
        'autre rôle est un écart de spécification, pas un réglage.',
    ).toStrictEqual([]);

    await Promise.resolve();
  });

  it('@critique consultant, analyste et lecteur reçoivent 403 sur les SEPT routes — jamais 401', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI « JAMAIS 401 » N'EST PAS UN DÉTAIL DE STATUT.
    // ═══════════════════════════════════════════════════════════════════════════
    // 401 dit « je ne sais pas qui tu es » — le client conclut que son jeton est
    // mauvais et déclenche un rafraîchissement, puis une reconnexion, puis une
    // demande de mot de passe à un auditeur en clientèle. Or on sait parfaitement
    // qui il est : son compte est actif, son jeton est valide, il n'a simplement pas
    // le droit. Rendre 401 ici, c'est envoyer l'utilisateur réparer ce qui n'est pas
    // cassé — et masquer, côté supervision, un refus de DROITS derrière un problème
    // d'identité.
    const cible = await creerCompte('rbac-cible');
    const intrus: readonly Role[] = ['consultant', 'analyste', 'lecteur'];

    const anomalies: string[] = [];
    for (const role of intrus) {
      const acteur = await creerCompte(`rbac-${role}`, { role });
      for (const acte of ACTES) {
        const reponse = await appeler(acte.methode, acte.url(cible.id), {
          jeton: acteur.jeton,
          corps: acte.corps(`${role}-${acte.methode}`),
        });
        if (reponse.statut !== 403 || reponse.code !== 'FORBIDDEN') {
          anomalies.push(
            `${role} → ${acte.nom} : ${String(reponse.statut)} ${reponse.code ?? '(sans code)'}`,
          );
        }
      }
    }

    expect(
      anomalies,
      'Chaque écart ci-dessus est soit un ACCÈS ACCORDÉ à qui n’y a pas droit\n' +
        '(2xx), soit un refus mal nommé (401) qui enverra la PWA terrain boucler sur\n' +
        'un rafraîchissement de jeton qui ne corrigera rien.',
    ).toStrictEqual([]);

    // Et la cible n'a bougé sur AUCUN champ : un 403 doit refuser AVANT le
    // gestionnaire, pas après une écriture déjà partie.
    const apres = await ligneCompte(cible.id);
    expect(apres.role, 'trois × `PATCH …/role` refusés : le rôle est intact').toBe('consultant');
    expect(apres.is_active).toBe(true);
    expect(apres.habilitated_at).toBeNull();
    expect(await journalDe(cible.id), 'un refus ne se journalise pas comme un acte').toHaveLength(
      0,
    );
  });

  it('@critique CONTRE-ÉPREUVE : un admin passe sur les sept routes', async () => {
    // SANS CE TEST, LE PRÉCÉDENT SERAIT VERT SUR UNE API TOTALEMENT CASSÉE : une
    // route qui rendrait 403 à tout le monde — un crochet mal branché, une politique
    // vide, une régression du registre — satisferait « consultant refusé » à la
    // perfection. Le refus ne prouve rien tant qu'on n'a pas montré ce qui passe.
    const admin = await creerAdmin('rbac-contre-epreuve');
    const cible = await creerCompte('rbac-passant');

    const anomalies: string[] = [];
    for (const acte of ACTES) {
      const reponse = await appeler(acte.methode, acte.url(cible.id), {
        jeton: admin.jeton,
        corps: acte.corps(`admin-${acte.methode}-${acte.nom.length.toString()}`),
      });
      if (reponse.statut !== acte.statutAdmin) {
        anomalies.push(
          `${acte.nom} : ${String(reponse.statut)} au lieu de ${String(acte.statutAdmin)} ` +
            `— ${reponse.corps.slice(0, 200)}`,
        );
      }
    }

    expect(anomalies).toStrictEqual([]);
  });

  it('un ANONYME reçoit 401 — c’est ce qui rend le 403 ci-dessus signifiant', async () => {
    // La distinction 401/403 n'est une garantie que si les deux existent VRAIMENT.
    // Une API qui rendrait 403 à tout le monde, anonymes compris, aurait passé les
    // deux tests précédents sans jamais distinguer « qui es-tu » de « tu n'as pas le
    // droit » — la propriété testée plus haut serait alors un accident.
    const cible = await creerCompte('rbac-anonyme');

    for (const acte of ACTES) {
      const reponse = await appeler(acte.methode, acte.url(cible.id), {
        corps: acte.corps('anonyme'),
      });
      expect(reponse.statut, `${acte.nom} sans jeton`).toBe(401);
      expect(reponse.code).toBe('UNAUTHENTICATED');
    }
  });

  it('@critique la route `HEAD /v1/users` ajoutée d’office par Fastify est protégée elle aussi', async () => {
    // LE PIÈGE : cette route n'est écrite dans AUCUN fichier du produit — Fastify la
    // fabrique en compagne de chaque `GET` — et elle ne rend aucun corps. C'est
    // exactement le genre de route qu'une revue ne voit pas et qu'une matrice écrite
    // à la main oublie. Elle interroge pourtant les MÊMES données, et son seul statut
    // suffirait à confirmer à un lecteur l'existence de l'annuaire des comptes.
    const intrus = await creerCompte('rbac-head', { role: 'lecteur' });
    const admin = await creerAdmin('rbac-head');

    expect((await appeler('HEAD', '/v1/users?limit=1', { jeton: intrus.jeton })).statut).toBe(403);
    expect(
      (await appeler('HEAD', '/v1/users?limit=1', { jeton: admin.jeton })).statut,
      'contre-épreuve : la route existe et répond, sinon le 403 ci-dessus serait un 404',
    ).toBe(200);
    expect((await appeler('HEAD', '/v1/users?limit=1')).statut).toBe(401);
  });

  it('un admin DÉSACTIVÉ est refusé en 401 — les droits viennent de la base, pas du jeton', async () => {
    // Le jeton d'accès vit 15 minutes et ne porte AUCUN droit. Si le crochet se
    // contentait de sa signature, une désactivation ne prendrait effet qu'au quart
    // d'heure suivant — quinze minutes pendant lesquelles un compte révoqué
    // continuerait d'administrer les comptes (06 §10.1 : « désactivable
    // INSTANTANÉMENT »).
    const admin = await creerAdmin('rbac-revoque');
    const cible = await creerCompte('rbac-revoque-cible');

    expect((await appeler('GET', '/v1/users?limit=1', { jeton: admin.jeton })).statut).toBe(200);

    await bd().query('UPDATE users SET is_active = false WHERE id = $1', [admin.id]);

    const apres = await appeler('PATCH', `/v1/users/${cible.id}/deactivate`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(apres.statut).toBe(401);
    expect(
      apres.code,
      'Compte inconnu et compte désactivé rendent la MÊME chose : dire lequel\n' +
        'transformerait la route en oracle d’existence de comptes (06 §10.2).',
    ).toBe('UNAUTHENTICATED');
    expect((await ligneCompte(cible.id)).is_active, 'et rien n’a été écrit').toBe(true);
  });
});

// =============================================================================
// `password_hash` — LE CORPS BRUT, JAMAIS L'OBJET TYPÉ
// =============================================================================
describe('non-divulgation de l’empreinte (DECISIONS.md 2026-08-30)', () => {
  it('@critique aucune des sept réponses ne porte `password_hash`, sous aucune forme', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI ON LIT LE CORPS BRUT ET NON L'OBJET ANALYSÉ.
    // ═══════════════════════════════════════════════════════════════════════════
    // Un `expect(objet.passwordHash).toBeUndefined()` est vert par construction : le
    // schéma qui a produit `objet` a déjà retiré ce qu'on cherche. Le seul endroit où
    // une fuite est visible est la CHAÎNE partie sur le réseau. C'est aussi le seul
    // contrôle qui attrape un champ ajouté par mégarde au dépôt ou au service — le
    // scénario réel, puisque `COLONNES_UTILISATEUR` et le schéma de sortie sont deux
    // listes qui peuvent diverger.
    //
    // On cherche TROIS choses, parce qu'une seule ne suffirait pas :
    //   · l'empreinte RÉELLE du compte, relue en base — la fuite exacte ;
    //   · les deux orthographes du nom de champ (`snake_case` en base ↔ `camelCase`
    //     en TS, 11 §3) — la fuite d'un champ vide ou nul, qui ne contient rien
    //     aujourd'hui mais qui a franchi le contrat ;
    //   · le préfixe PHC `$argon2id$` — la fuite d'une empreinte qui ne serait pas
    //     celle qu'on avait semée (celle d'un compte créé par la route elle-même).
    const admin = await creerAdmin('empreinte');
    const cible = await creerCompte('empreinte-cible', { avecMotDePasse: true });
    const empreinteEnBase = (await ligneCompte(cible.id)).password_hash;
    expect(
      empreinteEnBase.startsWith('$argon2id$'),
      'la semence doit être une VRAIE empreinte',
    ).toBe(true);

    const fuites: string[] = [];
    for (const acte of ACTES) {
      const reponse = await appeler(acte.methode, acte.url(cible.id), {
        jeton: admin.jeton,
        corps: acte.corps(`fuite-${acte.methode}-${String(acte.statutAdmin)}`),
      });
      expect(reponse.statut, `${acte.nom} doit réussir pour que ce contrôle ait un corps`).toBe(
        acte.statutAdmin,
      );

      for (const sentinelle of ['passwordHash', 'password_hash', '$argon2id$', empreinteEnBase]) {
        if (reponse.corps.includes(sentinelle)) {
          fuites.push(`${acte.nom} : « ${sentinelle.slice(0, 24)} »`);
        }
      }
    }

    expect(
      fuites,
      'Une empreinte Argon2id qui sort de l’API est attaquable HORS LIGNE, sans\n' +
        'plafond de tentatives et sans laisser de trace : le plafond de 10 req/min ne\n' +
        'protège plus rien une fois l’empreinte copiée. Elle n’a AUCUNE raison de\n' +
        'quitter la base — la console d’administration gère des comptes, pas des\n' +
        'secrets.',
    ).toStrictEqual([]);
  });

  it('la LISTE ne porte pas davantage l’empreinte, sur plusieurs comptes à la fois', async () => {
    // Le test précédent lit des réponses à UN compte. La liste, elle, projette N
    // lignes par un chemin différent (`COLONNES_UTILISATEUR` + `versReponse` sur
    // chaque item) : une divergence peut n'exister que là.
    const admin = await creerAdmin('empreinte-liste');
    await creerCompte('empreinte-liste-a', { avecMotDePasse: true });
    await creerCompte('empreinte-liste-b', { avecMotDePasse: true });

    const reponse = await appeler('GET', '/v1/users?limit=200', { jeton: admin.jeton });
    expect(reponse.statut).toBe(200);

    const page = pageSchema.parse(JSON.parse(reponse.corps));
    expect(page.items.length, 'la liste doit avoir de la matière à divulguer').toBeGreaterThan(2);

    for (const sentinelle of ['passwordHash', 'password_hash', '$argon2id$', 'argon2-factice']) {
      expect(reponse.corps.includes(sentinelle), `« ${sentinelle} » dans la liste`).toBe(false);
    }
  });
});

// =============================================================================
// LA PAGINATION KEYSET — LE TEST LE PLUS IMPORTANT DE CE FICHIER
// =============================================================================
describe('GET /v1/users — pagination keyset `(created_at, id)` (11 §3)', () => {
  /**
   * SIX COMPTES DANS LA MÊME MILLISECONDE — la mise en scène EST le test.
   *
   * Les trois premiers chiffres de la partie fractionnaire sont IDENTIQUES au sein
   * d'un lot (`.250` pour le premier) : les six lignes tombent donc dans la même
   * milliseconde, et `Date.toISOString()` les rend toutes les six comme `…:00.250Z`.
   * Les trois derniers chiffres — les MICROSECONDES — les distinguent en base, et
   * PostgreSQL les conserve.
   *
   * Deux lignes portent en outre le même horodatage à la microseconde près
   * (`…222`), et elles sont placées À CHEVAL SUR LA FRONTIÈRE de page (positions
   * 3 et 4 avec `limit = 3`) : c'est le seul agencement qui oblige la seconde
   * composante du curseur — l'`id` — à départager. Sans elle, la page suivante
   * reprendrait ou sauterait une ligne selon l'humeur du planificateur.
   *
   * L'année 2000 place ces six comptes AVANT tous les autres du fichier, dans l'ordre
   * ascendant : les premières pages sont donc déterministes quel que soit l'ordre
   * d'exécution des autres sections.
   */
  const MICROSECONDES = ['001', '111', '222', '222', '333', '444'] as const;

  /**
   * Chaque test sème son PROPRE lot dans sa PROPRE milliseconde (`.250`, `.260`,
   * `.270`). Deux lots qui partageraient la même milliseconde s'entrelaceraient, et
   * l'ordre attendu du premier test dépendrait alors de l'ordre d'exécution des
   * autres — une suite dont le verdict dépend de son ordre ne prouve rien.
   */
  const LOT_ORDRE = '250';
  const LOT_FORME = '260';
  const LOT_TRAVERSEE = '270';
  const LOT_MORSURE = '280';

  const LIMITE = 3;

  interface Fixture {
    readonly id: string;
    readonly horodatage: string;
  }

  function decoderCurseur(curseur: string): string[] {
    const brut: unknown = JSON.parse(Buffer.from(curseur, 'base64url').toString('utf8'));
    return z.array(z.string()).min(2).parse(brut);
  }

  async function semerLesSix(lot: string): Promise<Fixture[]> {
    const fixtures: Fixture[] = [];
    for (const [indice, microsecondes] of MICROSECONDES.entries()) {
      const id = uuidv7();
      const horodatage = `2000-01-01 00:00:00.${lot}${microsecondes}+00`;
      await bd().query(
        `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                            habilitated_at, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'argon2-factice', 'lecteur', 'guide_strict',
                 NULL, true, $4::timestamptz, $4::timestamptz)`,
        [
          id,
          `Compte page ${lot}-${String(indice)}`,
          `compte.page.${lot}.${String(indice)}@exemple.test`,
          horodatage,
        ],
      );
      fixtures.push({ id, horodatage });
    }
    // L'ordre ATTENDU est celui du contrat — `(created_at, id)` ascendant — calculé
    // ici depuis les valeurs semées, jamais lu dans la réponse qu'on s'apprête à
    // juger. `uuidv7` est monotone, donc l'ordre des `id` suit celui d'insertion.
    return [...fixtures].sort((a, b) =>
      a.horodatage === b.horodatage
        ? a.id.localeCompare(b.id)
        : a.horodatage.localeCompare(b.horodatage),
    );
  }

  async function page(jeton: string, curseur?: string): Promise<z.infer<typeof pageSchema>> {
    const suffixe = curseur === undefined ? '' : `&after=${curseur}`;
    const reponse = await appeler('GET', `/v1/users?limit=${String(LIMITE)}${suffixe}`, { jeton });
    expect(reponse.statut, `page refusée : ${reponse.corps.slice(0, 200)}`).toBe(200);
    return pageSchema.parse(JSON.parse(reponse.corps));
  }

  it('@critique la page suivante ne RE-SERT PAS la ligne frontière quand six comptes partagent la même milliseconde', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LE DÉFAUT QUE CE TEST EXISTE POUR ATTRAPER, ET POURQUOI IL EST INVISIBLE.
    // ═══════════════════════════════════════════════════════════════════════════
    // Le geste évident pour fabriquer le curseur est `ligne.createdAt.toISOString()`.
    // Il compile, il est typé, il passe toute revue — et il est FAUX. `created_at` est
    // un `TIMESTAMPTZ` : PostgreSQL y stocke des MICROSECONDES, la `Date` de
    // JavaScript s'arrête à la MILLISECONDE. Les trois derniers chiffres sont perdus
    // À LA LECTURE, sans la moindre erreur.
    //
    // Conséquence : le curseur reconstruit est STRICTEMENT INFÉRIEUR à la valeur
    // réelle de la ligne frontière, et `(created_at, id) > (curseur…)` la REPREND.
    // Un doublon par page — supportable, presque invisible — et une BOUCLE INFINIE
    // dès que `limit` lignes partagent la même milliseconde. Ce qui arrive au premier
    // import, au premier seed, à la première transaction qui crée plusieurs comptes.
    //
    // Un jeu d'essai créé par `now()` au fil de l'eau NE DÉCLENCHE PAS ce défaut :
    // les lignes tombent dans des millisecondes différentes et tout paraît correct.
    // C'est pourquoi la milliseconde partagée est FABRIQUÉE ici, et non espérée.
    const admin = await creerAdmin('keyset');
    const attendus = await semerLesSix(LOT_ORDRE);

    const premiere = await page(admin.jeton);
    expect(premiere.items).toHaveLength(LIMITE);
    expect(
      premiere.nextCursor,
      'Six lignes pour une page de trois : il DOIT y avoir une suite.',
    ).not.toBeNull();
    if (premiere.nextCursor === null) throw new Error('curseur absent');

    const seconde = await page(admin.jeton, premiere.nextCursor);
    expect(seconde.items).toHaveLength(LIMITE);

    const frontiere = premiere.items[LIMITE - 1];
    if (frontiere === undefined) throw new Error('ligne frontière absente');

    expect(
      seconde.items.map((item) => item.id),
      'LA LIGNE FRONTIÈRE EST RE-SERVIE. C’est la signature exacte d’un curseur\n' +
        'reconstruit depuis `Date.toISOString()` : la milliseconde tronquée est\n' +
        'strictement inférieure à la valeur réelle de la ligne, qui repasse donc le\n' +
        'test `>`. En production, cette page se répète indéfiniment.',
    ).not.toContain(frontiere.id);

    const idsAttendus = attendus.map((f) => f.id);
    expect(
      [...premiere.items, ...seconde.items].map((item) => item.id),
      'Les six comptes doivent sortir DANS L’ORDRE `(created_at, id)`, sans doublon\n' +
        'ni saut — y compris pour les deux lignes de même horodatage placées à cheval\n' +
        'sur la frontière de page, que seul l’`id` peut départager.',
    ).toStrictEqual(idsAttendus);
  });

  it('@critique le curseur porte la forme SQL de `created_at`, pas une date JavaScript', async () => {
    // La preuve DIRECTE de la propriété, en plus de sa conséquence observable.
    // Deux affirmations, et la seconde est celle qui compte :
    //   ① la composante du curseur est EXACTEMENT `created_at::text` de la ligne
    //      frontière — donc lue à la source, pas reconstituée ;
    //   ② la repasser par une `Date` JavaScript la CHANGE. C'est la mesure de
    //      l'information qui serait perdue, et elle rend le test impossible à
    //      satisfaire par une implémentation qui convertit.
    const admin = await creerAdmin('keyset-forme');
    await semerLesSix(LOT_FORME);

    const premiere = await page(admin.jeton);
    if (premiere.nextCursor === null) throw new Error('curseur absent');

    const composantes = decoderCurseur(premiere.nextCursor);
    const [ressource, horodatageCurseur, idCurseur] = composantes;
    const frontiere = premiere.items[LIMITE - 1];
    if (frontiere === undefined) throw new Error('ligne frontière absente');
    if (horodatageCurseur === undefined) throw new Error('composante temporelle absente');

    expect(ressource, 'un curseur d’une autre liste doit être refusable').toBe('users');
    expect(idCurseur).toBe(frontiere.id);

    const enBase = (await ligneCompte(frontiere.id)).created_at_texte;
    expect(
      horodatageCurseur,
      'La composante temporelle doit être la valeur TELLE QUE POSTGRESQL LA DÉTIENT\n' +
        '(`created_at::text`), parce que c’est sous cette forme qu’elle sera comparée.\n' +
        'Toute autre provenance — et `Date.toISOString()` en particulier — passe par\n' +
        'une conversion qui perd les microsecondes.',
    ).toBe(enBase);

    expect(
      new Date(horodatageCurseur).toISOString(),
      'CECI EST LA MESURE DE L’INFORMATION PERDUE : si la conversion en `Date` puis\n' +
        'en ISO rendait la même chaîne, ce curseur pourrait venir d’une `Date` sans\n' +
        'qu’on le sache, et ce test ne prouverait plus rien. Il doit DIFFÉRER.',
    ).not.toBe(horodatageCurseur);
  });

  it('@critique le curseur TRONQUÉ, lui, re-sert bien la ligne frontière — la preuve que le jeu d’essai mord', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // CE TEST NE VÉRIFIE PAS LE PRODUIT : IL VÉRIFIE LES TROIS TESTS CI-DESSUS.
    // ═══════════════════════════════════════════════════════════════════════════
    // « La page suivante ne re-sert pas la ligne frontière » est une affirmation
    // VIDE si le jeu d'essai ne pouvait de toute façon pas déclencher le défaut —
    // et c'est le cas dès que les comptes tombent dans des millisecondes
    // différentes, c'est-à-dire dès qu'on les crée par `now()` au fil de l'eau.
    // Quelqu'un qui remplacerait un jour les microsecondes de `MICROSECONDES` par
    // des valeurs distinctes à la milliseconde rendrait les trois tests précédents
    // verts POUR TOUJOURS, sans que rien ne signale la perte.
    //
    // On fabrique donc ICI le curseur exactement comme le ferait l'implémentation
    // fautive — depuis la `Date` que l'API rend, tronquée à la milliseconde par
    // `toISOString()` — et on exige que la base RE-SERVE la ligne frontière. Si cette
    // attente échoue, c'est que le jeu d'essai a perdu ses dents : les tests
    // ci-dessus ne prouvent plus rien, et c'est ce test-ci qui le dit.
    const admin = await creerAdmin('keyset-morsure');
    await semerLesSix(LOT_MORSURE);

    const premiere = await page(admin.jeton);
    const frontiere = premiere.items[LIMITE - 1];
    if (frontiere === undefined) throw new Error('ligne frontière absente');

    // La composante temporelle telle qu'une `Date` JavaScript la produit : c'est
    // littéralement ce que l'API rend dans `createdAt`, donc ce qu'un curseur
    // reconstruit « depuis la ligne déjà chargée » porterait.
    const tronquee = new Date(frontiere.createdAt).toISOString();
    const fraction = /\.(\d+)/.exec((await ligneCompte(frontiere.id)).created_at_texte)?.[1] ?? '';
    expect(
      fraction.length,
      'La ligne frontière doit porter une partie fractionnaire de plus de trois\n' +
        'chiffres, sans quoi il n’y a AUCUNE information à perdre et la troncature\n' +
        'devient inoffensive.',
    ).toBeGreaterThan(3);
    expect(
      fraction.slice(3),
      'Et les MICROSECONDES doivent être non nulles : c’est exactement ce que\n' +
        '`Date.toISOString()` jette.',
    ).not.toBe('000');

    const curseurFautif = Buffer.from(
      JSON.stringify(['users', tronquee, frontiere.id]),
      'utf8',
    ).toString('base64url');

    const repetee = await page(admin.jeton, curseurFautif);
    expect(
      repetee.items.map((item) => item.id),
      'LE JEU D’ESSAI NE MORD PLUS. Avec un curseur tronqué à la milliseconde, la\n' +
        'ligne frontière DOIT repasser le test `(created_at, id) > (…)` — c’est le\n' +
        'défaut lui-même. Qu’elle ne repasse pas signifie que les six comptes ne\n' +
        'partagent plus la même milliseconde, et que les trois tests précédents sont\n' +
        'devenus verts par vacuité.',
    ).toContain(frontiere.id);
  });

  it('@critique la traversée complète de la liste TERMINE, sans doublon ni ligne perdue', async () => {
    // LE SYMPTÔME DE PRODUCTION, ÉPROUVÉ COMME TEL. Les tests ci-dessus regardent
    // deux pages ; celui-ci parcourt la liste ENTIÈRE comme le ferait la console, et
    // il est le seul à pouvoir dire « ça ne boucle pas ». Le compteur de tours n'est
    // pas une précaution de style : sans lui, une régression du curseur ferait tourner
    // la suite jusqu'au délai d'expiration, et le message d'échec parlerait d'un
    // dépassement de temps au lieu de nommer la boucle.
    const admin = await creerAdmin('keyset-traversee');
    await semerLesSix(LOT_TRAVERSEE);

    const total = await bd().query<{ nombre: string }>(
      'SELECT count(*)::text AS nombre FROM users',
    );
    const attendu = Number(total.rows[0]?.nombre ?? '0');
    expect(attendu, 'la traversée doit avoir de la matière').toBeGreaterThan(LIMITE * 2);

    const TOURS_MAX = 200;
    const vus: string[] = [];
    let curseur: string | undefined;
    let tours = 0;

    do {
      const courante = await page(admin.jeton, curseur);
      tours += 1;
      for (const item of courante.items) vus.push(item.id);
      curseur = courante.nextCursor ?? undefined;
    } while (curseur !== undefined && tours < TOURS_MAX);

    expect(
      tours,
      `La traversée n’a pas terminé en ${String(TOURS_MAX)} pages : la pagination\n` +
        'BOUCLE. C’est le symptôme de production du curseur tronqué — la console\n' +
        'redemanderait éternellement la même page.',
    ).toBeLessThan(TOURS_MAX);

    expect(
      new Set(vus).size,
      'Un identifiant servi deux fois signifie qu’une ligne frontière repasse : même\n' +
        'cause, forme atténuée.',
    ).toBe(vus.length);

    expect(
      vus.length,
      'Aucune ligne ne doit être SAUTÉE non plus : un curseur trop AVANCÉ (par\n' +
        'exemple arrondi à la milliseconde supérieure) ferait disparaître des comptes\n' +
        'de la console sans qu’aucune erreur ne soit levée.',
    ).toBe(attendu);
  });

  it('un curseur forgé ou étranger est refusé en 400, jamais servi', async () => {
    // Le curseur est opaque mais NON SIGNÉ : n'importe qui peut en fabriquer un. Ce
    // qu'on exige n'est donc pas qu'il soit infalsifiable, c'est qu'un curseur
    // illisible ou d'une autre ressource ne produise pas une page absurde en silence.
    const admin = await creerAdmin('keyset-curseur');

    const forges = [
      'pas-du-base64url!!',
      Buffer.from(JSON.stringify(['companies', 'x', 'y']), 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify(['users', 'une-seule']), 'utf8').toString('base64url'),
      Buffer.from('pas-du-json', 'utf8').toString('base64url'),
    ];

    for (const curseur of forges) {
      const reponse = await appeler('GET', `/v1/users?limit=3&after=${curseur}`, {
        jeton: admin.jeton,
      });
      expect(reponse.statut, `curseur « ${curseur.slice(0, 20)} »`).toBe(400);
      expect(['INVALID_CURSOR', 'VALIDATION_FAILED']).toContain(reponse.code);
    }
  });
});

// =============================================================================
// LE GARDE-FOU 05 §9.7 — PAR APPAREIL, ET JAMAIS PAR OMISSION
// =============================================================================
describe('PATCH /v1/users/:id/password-reset — garde-fou 05 §9.7', () => {
  it('@critique refuse quand un SECOND appareil a un outbox non vide, même si le plus récent est à jour', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LE PIÈGE FERMÉ ICI : « LA DERNIÈRE SYNC DU COMPTE » N'EST PAS « LA DERNIÈRE
    // SYNC DE CHAQUE APPAREIL ».
    // ═══════════════════════════════════════════════════════════════════════════
    // Un auditeur travaille avec une tablette ET un portable. La KEK de CHAQUE
    // appareil dérive du mot de passe : changer le mot de passe rend illisible tout
    // ce que CHAQUE outbox n'a pas encore poussé. Une lecture « la ligne
    // `sync_log` la plus récente du compte » regarderait ici la tablette — à jour —
    // et autoriserait la réinitialisation, détruisant une journée d'entretiens qui
    // dort dans le portable.
    //
    // La mise en scène est construite pour que ces deux lectures DIVERGENT : la
    // tablette est à la fois la PLUS RÉCENTE et la SEULE à jour. Un garde-fou qui
    // rassure passerait ; le garde-fou du §9.7 doit refuser.
    const admin = await creerAdmin('gardefou');
    const cible = await creerCompte('gardefou-cible');

    // ── ① Contre-épreuve : un seul appareil, à jour → la route AUTORISE ────────
    // Sans elle, « refusé » serait vert sur une route qui refuse toujours, et le
    // forçage deviendrait l'unique chemin — c'est-à-dire un garde-fou qu'on
    // apprendrait à contourner par réflexe.
    await semerSync(cible.id, 'tablette-de-mission', 0, 1);
    const autorisee = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(
      autorisee.statut,
      'Un compte dont le SEUL appareil connu a un outbox vide n’a rien à perdre :\n' +
        'la réinitialisation doit passer SANS forçage.',
    ).toBe(200);
    expect(reinitialisationSchema.parse(JSON.parse(autorisee.corps)).forced).toBe(false);

    // ── ② Le second appareil entre en scène, plus ANCIEN et en retard ──────────
    await semerSync(cible.id, 'portable-de-bureau', 0, 240);
    await semerSync(cible.id, 'portable-de-bureau', 3, 120);

    const refusee = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: {},
    });

    expect(
      refusee.statut,
      'La tablette (à jour) est la sync la PLUS RÉCENTE du compte ; le portable, plus\n' +
        'ancien, garde 3 éléments en outbox. Un 200 ici prouve que le garde-fou lit la\n' +
        'dernière ligne du COMPTE au lieu de la dernière ligne de CHAQUE APPAREIL.',
    ).toBe(409);
    expect(
      refusee.code,
      'Le code doit être DÉDIÉ (DECISIONS.md 2026-08-31) : sous un `CONFLICT`\n' +
        'générique, le front ne peut pas savoir qu’un forçage explicite est possible,\n' +
        'et le garde-fou devient un mur muet.',
    ).toBe('UNSYNCED_DATA_AT_RISK');

    // ── ③ Et le refus n'a RIEN écrit : ni empreinte, ni jeton, ni journal ──────
    const empreinteAvant = (await ligneCompte(cible.id)).password_hash;
    await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: { force: false },
    });
    expect(
      (await ligneCompte(cible.id)).password_hash,
      'Un refus doit être TOTAL. Une empreinte remplacée malgré le refus rendrait le\n' +
        'garde-fou décoratif : les données seraient déjà perdues.',
    ).toBe(empreinteAvant);

    const journal = await journalDe(cible.id);
    expect(
      journal.filter((l) => l.action === 'user.password_reset'),
      'Une seule réinitialisation a eu lieu — celle de l’étape ①. Les deux refus ne\n' +
        'doivent PAS avoir produit de ligne : un journal qui décrit des actes qui\n' +
        'n’ont pas eu lieu accuse quelqu’un à tort.',
    ).toHaveLength(1);
  });

  it('@critique refuse aussi quand AUCUNE sync n’est connue', async () => {
    // Le §9.7 écrit « dernier `outbox_remaining` > 0 OU AUCUNE SYNC CONNUE de
    // l'appareil ». La seconde moitié est celle qu'on est tenté d'oublier, et son
    // motif est asymétrique : le serveur ne sait pas distinguer « cet appareil n'a
    // jamais rien collecté » de « cet appareil n'a JAMAIS RÉUSSI à se synchroniser ».
    // Le second cas est celui qui coûte cher, et c'est lui qui décide du défaut.
    const admin = await creerAdmin('gardefou-muet');
    const cible = await creerCompte('gardefou-muet-cible');

    const reponse = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(reponse.statut).toBe(409);
    expect(reponse.code).toBe('UNSYNCED_DATA_AT_RISK');
  });

  it('@critique le forçage passe, et il est JOURNALISÉ avec son marqueur', async () => {
    // Le forçage n'est acceptable que s'il laisse une trace qu'on peut retrouver
    // SANS savoir qu'on la cherche. La note L2 §2.4 exige deux choses distinctes, et
    // ce test les sépare :
    //   · la JOURNALISATION — la ligne `user.password_reset` porte `forcage: true` ;
    //   · l'ALERTE — un événement d'exploitation NOMMÉ, auquel une supervision peut
    //     s'accrocher. Une alerte sans nom stable est une alerte qu'on ne branchera
    //     jamais.
    const admin = await creerAdmin('forcage');
    const cible = await creerCompte('forcage-cible');

    sondes.lignesJournal.length = 0;

    const reponse = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: { force: true },
    });
    expect(reponse.statut).toBe(200);

    const resultat = reinitialisationSchema.parse(JSON.parse(reponse.corps));
    expect(
      resultat.forced,
      '`forced` dit la vérité sur ce qui vient de se passer : la console doit pouvoir\n' +
        'afficher « des données locales sont probablement perdues ». Un `false` ici\n' +
        'rendrait le forçage indiscernable d’une réinitialisation ordinaire.',
    ).toBe(true);
    expect(resultat.userId).toBe(cible.id);

    const lignes = (await journalDe(cible.id)).filter((l) => l.action === 'user.password_reset');
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.user_id, 'l’ADMIN qui agit, pas la cible').toBe(admin.id);
    expect(lignes[0]?.entity_type).toBe('user');
    expect(lignes[0]?.meta).toStrictEqual({ forcage: true });

    expect(
      sondes.lignesJournal.some((ligne) => ligne.includes('reinitialisation_mot_de_passe_forcee')),
      'L’alerte du §9.7 doit porter un NOM D’ÉVÉNEMENT STABLE. Une phrase libre dans\n' +
        'un message ne se supervise pas : elle change au premier reformulage, et\n' +
        'l’alerte disparaît sans que rien ne rougisse.',
    ).toBe(true);
  });

  it('une réinitialisation AUTORISÉE ne déclenche pas l’alerte de forçage', async () => {
    // Contre-épreuve de l'alerte : si elle était émise à chaque réinitialisation,
    // elle serait vite ignorée — et le jour où un forçage réel arrive, personne ne le
    // verrait dans le bruit.
    const admin = await creerAdmin('forcage-contre');
    const cible = await creerCompte('forcage-contre-cible');
    await semerSync(cible.id, 'tablette-sereine', 0, 5);

    sondes.lignesJournal.length = 0;

    const reponse = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(reponse.statut).toBe(200);
    expect(reinitialisationSchema.parse(JSON.parse(reponse.corps)).forced).toBe(false);

    expect(
      sondes.lignesJournal.length,
      'La sonde doit avoir capté QUELQUE CHOSE, sinon l’absence d’alerte ci-dessous\n' +
        'ne prouverait rien.',
    ).toBeGreaterThan(0);
    expect(
      sondes.lignesJournal.some((l) => l.includes('reinitialisation_mot_de_passe_forcee')),
    ).toBe(false);

    const lignes = (await journalDe(cible.id)).filter((l) => l.action === 'user.password_reset');
    expect(lignes[0]?.meta, 'et le journal dit `forcage: false`, pas « rien »').toStrictEqual({
      forcage: false,
    });
  });
});

// =============================================================================
// LE MOT DE PASSE ENGENDRÉ — L'ACTE EST TRACÉ, LA VALEUR NE L'EST NULLE PART
// =============================================================================
describe('PATCH /v1/users/:id/password-reset — le secret engendré', () => {
  it('@critique il n’apparaît dans AUCUN journal, alors que l’acte y est', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LA PARTIE DIFFICILE DE L'ARBITRAGE DU 2026-08-31, ET CE QUI LA REND FRAGILE.
    // ═══════════════════════════════════════════════════════════════════════════
    // L'invariant 7 exige que l'acte soit TRACÉ ; 11 §2 et 06 interdisent qu'un
    // secret entre dans un journal. Les deux exigences pointent le même objet, et le
    // geste qui les met en conflit est un bon réflexe : passer à `log.info()` l'objet
    // qu'on vient de construire « pour déboguer ».
    //
    // Ce test sépare donc explicitement L'ACTE de LA VALEUR, et il vérifie les DEUX
    // canaux — pino (qui SORT de la machine) et `activity_log` (qui reste, douze
    // mois, sous régime RGPD). Vérifier un seul des deux laisserait l'autre ouvert.
    //
    // La valeur cherchée est le mot de passe RÉELLEMENT ENGENDRÉ, relu dans la
    // réponse : chercher un motif générique laisserait passer la fuite réelle.
    const admin = await creerAdmin('secret');
    const cible = await creerCompte('secret-cible', { avecMotDePasse: true });
    await semerSync(cible.id, 'tablette-a-jour', 0, 2);

    sondes.lignesJournal.length = 0;

    const reponse = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(reponse.statut).toBe(200);
    const resultat = reinitialisationSchema.parse(JSON.parse(reponse.corps));

    // ── L'ACTE : il DOIT être là ──────────────────────────────────────────────
    const lignes = (await journalDe(cible.id)).filter((l) => l.action === 'user.password_reset');
    expect(
      lignes,
      'Sans cette ligne, « la valeur n’est nulle part » serait vrai pour la raison la\n' +
        'plus mauvaise : rien n’est journalisé du tout, et l’invariant 7 est violé.',
    ).toHaveLength(1);
    expect(lignes[0]?.entity_id).toBe(cible.id);

    // ── LA VALEUR : elle ne doit être NULLE PART ──────────────────────────────
    expect(
      sondes.lignesJournal.length,
      'Une capture VIDE rendrait ce test vert sans rien prouver : c’est le mode\n' +
        'd’échec le plus dangereux d’un contrôle de journalisation.',
    ).toBeGreaterThan(0);

    const journalPino = sondes.lignesJournal.join('\n');
    expect(
      journalPino.includes(resultat.password),
      'Les journaux pino SORTENT de la machine (11 §2, 06 §10.4) : ils sont exportés,\n' +
        'conservés, et lus par des gens qui n’ont aucun droit sur les comptes. Un mot\n' +
        'de passe qui y entre est un mot de passe publié.',
    ).toBe(false);

    const toutLeJournal = await bd().query<{ contenu: string }>(
      `SELECT coalesce(string_agg(action || ' ' || coalesce(meta::text, '') || ' ' ||
                                  coalesce(ip, ''), E'\\n'), '') AS contenu
         FROM activity_log`,
    );
    expect(
      (toutLeJournal.rows[0]?.contenu ?? '').includes(resultat.password),
      '`activity_log` est conservée douze mois sous régime RGPD (06 §10.4). Le\n' +
        'catalogue est fermé par action et aucune variante ne porte de texte libre :\n' +
        'y écrire le secret devrait être INEXPRIMABLE. Ce test vérifie que ça l’est\n' +
        'resté.',
    ).toBe(false);

    // Et l'empreinte stockée n'est pas le secret : le serveur ne saura plus le redire.
    const empreinte = (await ligneCompte(cible.id)).password_hash;
    expect(empreinte).not.toBe(resultat.password);
    expect(empreinte).not.toContain(resultat.password);
    expect(empreinte.startsWith('$argon2id$'), 'Argon2id, pas un stockage réversible').toBe(true);
  });

  it('@critique il fait au moins 12 caractères ET il ouvre réellement le compte', async () => {
    // DEUX PROPRIÉTÉS QUI DOIVENT ALLER ENSEMBLE, et l'une sans l'autre ne vaut rien :
    //   · 12 caractères est la politique 06 §10.1. Un secret plus court serait
    //     attaquable, et il serait surtout REFUSÉ par la création de compte — deux
    //     bornes du même secret qui divergent, c'est un compte qu'on ne peut plus
    //     administrer ;
    //   · « il ouvre » est la seule preuve que l'empreinte écrite correspond au texte
    //     rendu. Un service qui hacherait un AUTRE secret que celui qu'il affiche
    //     produirait un compte définitivement inaccessible, et AUCUN contrôle de
    //     forme ne le verrait — la réponse serait parfaite.
    const admin = await creerAdmin('secret-utile');
    const cible = await creerCompte('secret-utile-cible', { avecMotDePasse: true });
    await semerSync(cible.id, 'tablette-a-jour', 0, 2);

    if (cible.motDePasse === null) throw new Error('mot de passe de semence absent');
    const avant = await seConnecter(cible.email, cible.motDePasse);
    expect(avant.statut, 'la semence doit ouvrir AVANT, sinon la suite ne prouve rien').toBe(200);

    const reponse = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(reponse.statut).toBe(200);
    const resultat = reinitialisationSchema.parse(JSON.parse(reponse.corps));

    expect(
      resultat.password.length,
      'Politique 06 §10.1 : « 12+ caractères ». Le secret engendré y est tenu comme\n' +
        'tout autre — un minimum de politique que le producteur du secret ne\n' +
        'respecterait pas serait une politique de façade.',
    ).toBeGreaterThanOrEqual(LONGUEUR_MIN_POLITIQUE);

    const apres = await seConnecter(cible.email, resultat.password);
    expect(
      apres.statut,
      'LE MOT DE PASSE RENDU DOIT OUVRIR. Il est affiché UNE SEULE FOIS et le serveur\n' +
        'ne saura plus le redire : s’il n’ouvre pas, le compte est mort et la seule\n' +
        'issue est un `psql` sur le serveur.',
    ).toBe(200);

    const ancien = await seConnecter(cible.email, cible.motDePasse);
    expect(ancien.statut, 'et l’ancien n’ouvre plus').toBe(401);
  });

  it('@critique la réinitialisation RÉVOQUE les jetons : un `refresh` avec l’ancien échoue APRÈS', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // POURQUOI « APRÈS » EST LE MOT IMPORTANT DE CE TEST.
    // ═══════════════════════════════════════════════════════════════════════════
    // On prouve d'abord que le jeton FONCTIONNE, puis qu'il ne fonctionne plus. Sans
    // la première moitié, « le refresh échoue » serait vert pour n'importe quelle
    // raison — un jeton mal recopié, une session jamais ouverte, une route cassée.
    //
    // Ce que la révocation protège : un appareil dont le coffre local est devenu
    // inouvrable (la KEK dérive du mot de passe) garderait sinon une session vivante
    // 30 jours, que son porteur ne peut plus déverrouiller.
    const admin = await creerAdmin('revocation-reset');
    const cible = await creerCompte('revocation-reset-cible', { avecMotDePasse: true });
    await semerSync(cible.id, 'tablette-a-jour', 0, 2);
    if (cible.motDePasse === null) throw new Error('mot de passe de semence absent');

    const ouverte = await seConnecter(cible.email, cible.motDePasse);
    expect(ouverte.statut).toBe(200);
    const session = sessionSchema.parse(JSON.parse(ouverte.corps));

    const avant = await appeler('POST', '/v1/auth/refresh', {
      corps: { refreshToken: session.refreshToken },
      ip: ipUnique(),
    });
    expect(avant.statut, 'le jeton doit VIVRE avant la réinitialisation').toBe(200);
    const rafraichie = sessionSchema.parse(JSON.parse(avant.corps));

    const reset = await appeler('PATCH', `/v1/users/${cible.id}/password-reset`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(reset.statut).toBe(200);

    expect(
      await jetonsVivants(cible.id),
      'Aucun jeton de rafraîchissement ne doit survivre à la réinitialisation, et la\n' +
        'révocation vit dans la MÊME transaction que le changement d’empreinte :\n' +
        'sinon il existe un instant où le mot de passe a changé et les sessions sont\n' +
        'vivantes — précisément l’instant que la panne choisit.',
    ).toBe(0);

    const apres = await appeler('POST', '/v1/auth/refresh', {
      corps: { refreshToken: rafraichie.refreshToken },
      ip: ipUnique(),
    });
    expect(apres.statut, 'et la preuve d’usage, pas seulement la preuve en base').toBe(401);
  });

  it('@critique la DÉSACTIVATION révoque aussi les jetons (§34.4)', async () => {
    // §34.4 dit « révocation compte ET refresh tokens ». Le crochet ③ relit `users` à
    // chaque requête, donc l'ACCÈS s'éteint tout seul — c'est ce qui rend l'oubli de
    // la seconde moitié invisible. Mais un jeton de RAFRAÎCHISSEMENT survivant
    // rouvrirait une session le jour d'une réactivation, sans que personne ne l'ait
    // décidé.
    const admin = await creerAdmin('revocation-desact');
    const cible = await creerCompte('revocation-desact-cible', { avecMotDePasse: true });
    if (cible.motDePasse === null) throw new Error('mot de passe de semence absent');

    const ouverte = await seConnecter(cible.email, cible.motDePasse);
    expect(ouverte.statut).toBe(200);
    const session = sessionSchema.parse(JSON.parse(ouverte.corps));
    expect(await jetonsVivants(cible.id), 'un jeton vivant AVANT').toBe(1);

    const reponse = await appeler('PATCH', `/v1/users/${cible.id}/deactivate`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(reponse.statut).toBe(200);
    expect(utilisateur(reponse).isActive).toBe(false);

    expect(
      await jetonsVivants(cible.id),
      'La révocation est LUE EN BASE, et non déduite du refus de `refresh` : le\n' +
        'contrôle « compte actif » de la route de rafraîchissement rendrait 401 même\n' +
        'si aucune ligne n’avait été révoquée, et masquerait entièrement l’oubli.',
    ).toBe(0);

    const apres = await appeler('POST', '/v1/auth/refresh', {
      corps: { refreshToken: session.refreshToken },
      ip: ipUnique(),
    });
    expect(apres.statut).toBe(401);
  });
});

// =============================================================================
// IDEMPOTENCE — RÉUSSIR SANS MENTIR AU JOURNAL
// =============================================================================
describe('idempotence des quatre actes (invariant 7)', () => {
  it('@critique un rôle IDENTIQUE réussit sans écrire ni ligne d’audit ni `updated_at`', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // CE QU'ON PROUVE N'EST PAS LE CODE HTTP : C'EST L'ABSENCE D'ÉCRITURE.
    // ═══════════════════════════════════════════════════════════════════════════
    // Un 200 est facile à rendre. Ce qui compte est qu'`activity_log` ne gagne PAS
    // une ligne `user.role_change` décrivant une transition `consultant → consultant`
    // qui n'a jamais eu lieu. Le jour où quelqu'un conteste une action, c'est ce
    // journal qu'on lit : une ligne de trop y accuse à tort.
    //
    // `updated_at` est vérifié pour la même raison sous une autre forme : le bousculer
    // ferait remonter le compte en tête d'un tri « modifiés récemment » et le rendrait
    // inutilisable comme delta de synchronisation.
    const admin = await creerAdmin('idem-role');
    const cible = await creerCompte('idem-role-cible', { role: 'consultant' });

    // ── Contre-épreuve D'ABORD : le changement RÉEL écrit bien sa ligne ────────
    // Sans elle, « aucune ligne » serait vert sur un service qui ne journalise
    // jamais rien — le pire des deux mondes, puisque l'invariant 7 serait violé
    // dans l'autre sens.
    const reel = await appeler('PATCH', `/v1/users/${cible.id}/role`, {
      jeton: admin.jeton,
      corps: { role: 'analyste' },
    });
    expect(reel.statut).toBe(200);
    const apresReel = await journalDe(cible.id);
    expect(apresReel.filter((l) => l.action === 'user.role_change')).toHaveLength(1);
    expect(apresReel[apresReel.length - 1]?.meta).toStrictEqual({
      role_avant: 'consultant',
      role_apres: 'analyste',
    });

    const etatAvant = await ligneCompte(cible.id);
    const nombreAvant = apresReel.length;

    // ── L'acte idempotent : même rôle, deux fois ──────────────────────────────
    for (const tour of [1, 2]) {
      const reponse = await appeler('PATCH', `/v1/users/${cible.id}/role`, {
        jeton: admin.jeton,
        corps: { role: 'analyste' },
      });
      expect(reponse.statut, `tour ${String(tour)}`).toBe(200);
      expect(utilisateur(reponse).role).toBe('analyste');
    }

    expect(
      (await journalDe(cible.id)).length,
      'Deux appels sans changement doivent laisser le journal INTACT. Une ligne\n' +
        '`consultant → consultant` (ou `analyste → analyste`) décrit une transition\n' +
        'qui n’a pas eu lieu et salit la seule question à laquelle cette action répond.',
    ).toBe(nombreAvant);
    expect(
      (await ligneCompte(cible.id)).updated_at.getTime(),
      '`updated_at` date la dernière modification RÉELLE. Le bousculer pour un\n' +
        'non-événement rend la colonne inutilisable comme delta de synchronisation.',
    ).toBe(etatAvant.updated_at.getTime());
  });

  it('@critique une habilitation DÉJÀ PRONONCÉE n’est pas re-datée', async () => {
    // Réécrire `habilitated_at` changerait la DATE d'un fait établi — exactement ce
    // que l'invariant 7 interdit (« rien n'est jamais silencieusement écrasé »). Et
    // c'est une date qui compte : §34.4 en fait la borne d'entrée d'un auditeur, et
    // L3 refusera une affectation `mission_users` si elle est nulle.
    const admin = await creerAdmin('idem-habilite');
    const cible = await creerCompte('idem-habilite-cible');

    const premiere = await appeler('PATCH', `/v1/users/${cible.id}/habilitate`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(premiere.statut).toBe(200);
    const posee = utilisateur(premiere).habilitatedAt;
    expect(posee, 'l’habilitation doit être POSÉE — contre-épreuve').not.toBeNull();
    expect(
      (await journalDe(cible.id)).filter((l) => l.action === 'user.habilitate'),
      'le premier acte est réel : il se journalise',
    ).toHaveLength(1);

    const etatAvant = await ligneCompte(cible.id);

    const seconde = await appeler('PATCH', `/v1/users/${cible.id}/habilitate`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(
      seconde.statut,
      'L’appel reste un SUCCÈS : l’habilitation demandée est bien en place. Rendre\n' +
        '409 obligerait la console à traiter un état conforme comme une erreur.',
    ).toBe(200);
    expect(
      utilisateur(seconde).habilitatedAt,
      'La date d’habilitation ne doit pas avoir bougé d’une microseconde.',
    ).toBe(posee);

    expect(
      (await journalDe(cible.id)).filter((l) => l.action === 'user.habilitate'),
      'Une seconde ligne `user.habilitate` ferait croire à une seconde habilitation —\n' +
        'et le journal est la seule chose qui reste quand on conteste une décision.',
    ).toHaveLength(1);
    expect((await ligneCompte(cible.id)).updated_at.getTime()).toBe(etatAvant.updated_at.getTime());
  });

  it('@critique un compte DÉJÀ INACTIF se désactive sans nouvelle ligne d’audit', async () => {
    const admin = await creerAdmin('idem-desact');
    const cible = await creerCompte('idem-desact-cible');

    const premiere = await appeler('PATCH', `/v1/users/${cible.id}/deactivate`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(premiere.statut).toBe(200);
    expect(utilisateur(premiere).isActive, 'contre-épreuve : la désactivation AGIT').toBe(false);
    expect((await journalDe(cible.id)).filter((l) => l.action === 'user.deactivate')).toHaveLength(
      1,
    );

    const etatAvant = await ligneCompte(cible.id);

    const seconde = await appeler('PATCH', `/v1/users/${cible.id}/deactivate`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(seconde.statut).toBe(200);
    expect(utilisateur(seconde).isActive).toBe(false);

    expect(
      (await journalDe(cible.id)).filter((l) => l.action === 'user.deactivate'),
      'Deux lignes `user.deactivate` laisseraient croire à deux sorties du produit\n' +
        'pour une seule personne.',
    ).toHaveLength(1);
    expect((await ligneCompte(cible.id)).updated_at.getTime()).toBe(etatAvant.updated_at.getTime());
  });

  it('@critique un `PATCH` qui renvoie les valeurs DÉJÀ en base n’écrit rien', async () => {
    // La forme la plus banale du non-événement : une console qui renvoie tout le
    // formulaire à chaque enregistrement, y compris les champs que personne n'a
    // touchés. Sans comparaison avant/après, chaque ouverture d'écran produirait une
    // ligne `user.update` — et le journal d'audit deviendrait illisible par volume.
    const admin = await creerAdmin('idem-patch');
    const cible = await creerCompte('idem-patch-cible');

    const reel = await appeler('PATCH', `/v1/users/${cible.id}`, {
      jeton: admin.jeton,
      corps: { name: 'Nom modifie une fois' },
    });
    expect(reel.statut).toBe(200);
    const lignesApresReel = (await journalDe(cible.id)).filter((l) => l.action === 'user.update');
    expect(lignesApresReel, 'contre-épreuve : la modification réelle se journalise').toHaveLength(
      1,
    );
    expect(
      lignesApresReel[0]?.meta,
      'La trace porte le NOM du champ, jamais sa valeur : `user.update` ne doit pas\n' +
        'transformer `activity_log` en annuaire (11 §2).',
    ).toStrictEqual({ champs: ['name'] });

    const etatAvant = await ligneCompte(cible.id);

    const identique = await appeler('PATCH', `/v1/users/${cible.id}`, {
      jeton: admin.jeton,
      corps: { name: 'Nom modifie une fois', email: cible.email, usageProfile: 'guide_strict' },
    });
    expect(identique.statut).toBe(200);

    expect(
      (await journalDe(cible.id)).filter((l) => l.action === 'user.update'),
      'Trois champs renvoyés à l’identique : aucun n’a changé, donc aucune ligne.',
    ).toHaveLength(1);
    expect((await ligneCompte(cible.id)).updated_at.getTime()).toBe(etatAvant.updated_at.getTime());
  });

  it('un `PATCH` VIDE est refusé en 400 — une requête sans objet n’est pas une modification', async () => {
    const admin = await creerAdmin('idem-patch-vide');
    const cible = await creerCompte('idem-patch-vide-cible');

    const reponse = await appeler('PATCH', `/v1/users/${cible.id}`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(reponse.statut).toBe(400);
    expect(reponse.code).toBe('VALIDATION_FAILED');
    expect(await journalDe(cible.id)).toHaveLength(0);
  });
});

// =============================================================================
// LE GARDE ANTI-AUTO-VERROUILLAGE — LES DEUX CAS, JAMAIS UN SEUL
// =============================================================================
describe('un administrateur ne se retire pas ses propres droits', () => {
  it('@critique il ne peut ni se désactiver ni changer son propre rôle', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // CE QUE CE GARDE EMPÊCHE, MESURÉ SUR LE PRODUIT.
    // ═══════════════════════════════════════════════════════════════════════════
    // La console est admin seul, et les comptes ne se gèrent QUE par ces routes. Un
    // `PATCH …/role {role:'lecteur'}` sur son propre compte retirerait à son auteur
    // le droit de se rétablir — et sur une installation à UN SEUL administrateur (la
    // Phase 1, littéralement), fermerait l'administration du produit à tout le monde.
    // Le seul recours serait un `psql` sur le serveur de production.
    const admin = await creerAdmin('auto-verrou');

    const surSonRole = await appeler('PATCH', `/v1/users/${admin.id}/role`, {
      jeton: admin.jeton,
      corps: { role: 'lecteur' },
    });
    expect(surSonRole.statut).toBe(403);
    expect(
      surSonRole.code,
      '`FORBIDDEN` et non `CONFLICT` : ce n’est pas l’ÉTAT du compte qui s’y oppose,\n' +
        'c’est QUI le demande. Le même appel sur un autre compte est légitime.',
    ).toBe('FORBIDDEN');

    const surSaDesactivation = await appeler('PATCH', `/v1/users/${admin.id}/deactivate`, {
      jeton: admin.jeton,
      corps: {},
    });
    expect(surSaDesactivation.statut).toBe(403);
    expect(surSaDesactivation.code).toBe('FORBIDDEN');

    const etat = await ligneCompte(admin.id);
    expect(etat.role, 'et rien n’a été écrit au passage').toBe('admin');
    expect(etat.is_active).toBe(true);
    expect(await journalDe(admin.id), 'un refus n’est pas un acte').toHaveLength(0);
  });

  it('@critique CONTRE-ÉPREUVE : il peut le faire sur UN AUTRE administrateur', async () => {
    // SANS CE CAS, LE GARDE SERAIT SATISFAIT PAR « aucun admin ne se touche jamais » —
    // c'est-à-dire par une règle bien plus large que celle qu'on a voulue, et qui
    // rendrait impossible la sortie d'un administrateur (§34.4). Le garde est
    // délibérément étroit : il vise SON PROPRE compte, pas le rôle.
    //
    // ET IL FAUT DIRE CE QU'IL N'EMPÊCHE PAS : deux administrateurs peuvent encore se
    // rétrograder MUTUELLEMENT. Fermer ce cas demanderait une règle de cardinalité
    // (« il doit rester au moins un administrateur actif »), donc une décision de
    // produit et une course à sérialiser. C'est REMONTÉ, pas improvisé — et ce test
    // fige le comportement d'aujourd'hui pour qu'un changement soit VOULU.
    const auteur = await creerAdmin('auto-verrou-auteur');
    const collegue = await creerAdmin('auto-verrou-collegue');

    const changement = await appeler('PATCH', `/v1/users/${collegue.id}/role`, {
      jeton: auteur.jeton,
      corps: { role: 'lecteur' },
    });
    expect(changement.statut).toBe(200);
    expect(utilisateur(changement).role).toBe('lecteur');

    const desactivation = await appeler('PATCH', `/v1/users/${collegue.id}/deactivate`, {
      jeton: auteur.jeton,
      corps: {},
    });
    expect(desactivation.statut).toBe(200);
    expect(utilisateur(desactivation).isActive).toBe(false);

    const journal = await journalDe(collegue.id);
    expect(journal.map((l) => l.action)).toStrictEqual(['user.role_change', 'user.deactivate']);
    expect(
      journal.every((l) => l.user_id === auteur.id),
      'l’AUTEUR est tracé, pas la cible',
    ).toBe(true);
  });
});

// =============================================================================
// CRÉATION — L'ADRESSE EN DOUBLE SORT EN 409, PAS EN 500
// =============================================================================
describe('POST /v1/users — unicité de l’adresse', () => {
  it('@critique une adresse déjà prise rend 409 CONFLICT, jamais 500', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // LE DÉFAUT QUE CE TEST GARDE, ET POURQUOI IL NE SE VOIT PAS EN LISANT.
    // ═══════════════════════════════════════════════════════════════════════════
    // `drizzle` NE PROPAGE PAS l'erreur du pilote : il lève une `DrizzleQueryError`
    // et RANGE la `DatabaseError` de `pg` dans sa propriété `cause`. Ni `code`
    // (`23505`) ni `constraint` (`users_email_key`) ne sont recopiés sur l'enveloppe.
    // Une reconnaissance qui ne regarde que l'erreur REÇUE rend donc toujours
    // `false`, et l'adresse en double sort en 500 INTERNAL_ERROR.
    //
    // Ce que coûte le 500 : l'administrateur voit « une erreur interne est survenue »
    // là où il devait lire « cette adresse est déjà prise », l'incident part en
    // supervision comme une panne, et personne ne comprend qu'il s'agit d'une saisie.
    // Ce test est ce qui garde la correction — il n'y a aucun autre moyen de la
    // vérifier que d'exécuter la requête contre un PostgreSQL réel.
    const admin = await creerAdmin('doublon');
    const existant = await creerCompte('doublon-cible');

    const reponse = await appeler('POST', '/v1/users', {
      jeton: admin.jeton,
      corps: {
        name: 'Homonyme de saisie',
        email: existant.email,
        password: 'mot-de-passe-factice-du-doublon',
        role: 'consultant',
      },
    });

    expect(
      reponse.statut,
      'Un 500 ici signifie que l’enveloppe `DrizzleQueryError` n’est plus traversée :\n' +
        'la violation d’unicité n’est plus reconnue, et une faute de saisie banale est\n' +
        'rapportée comme une panne du produit.',
    ).toBe(409);
    expect(reponse.code).toBe('CONFLICT');
    expect(
      reponse.corps.includes('users_email_key'),
      'Le message est pour un humain, pas pour un développeur : le nom de la\n' +
        'contrainte SQL n’a rien à faire dans une réponse d’API.',
    ).toBe(false);
  });

  it('@critique la MODIFICATION vers une adresse déjà prise rend elle aussi 409', async () => {
    // Le second chemin d'écriture de l'adresse, et il est distinct : `PATCH` passe
    // par `mettreAJourUtilisateur`, DANS une transaction. Rien ne garantit que les
    // deux chemins traitent l'erreur de la même façon — sauf ce test.
    const admin = await creerAdmin('doublon-patch');
    const premier = await creerCompte('doublon-patch-a');
    const second = await creerCompte('doublon-patch-b');

    const reponse = await appeler('PATCH', `/v1/users/${second.id}`, {
      jeton: admin.jeton,
      corps: { email: premier.email },
    });
    expect(reponse.statut).toBe(409);
    expect(reponse.code).toBe('CONFLICT');
    expect(await journalDe(second.id), 'un conflit n’est pas une modification').toHaveLength(0);
  });

  it('contre-épreuve : une adresse LIBRE est acceptée, et le compte naît actif et non habilité', async () => {
    // Sans elle, les deux 409 ci-dessus seraient verts sur une route qui refuserait
    // TOUTE création. Ce test dit aussi ce qu'un compte neuf EST, ce que le pack
    // décrit au §34.4 : « compte créé → bac à sable → cotation croisée →
    // habilitation ». Les trois premières étapes exigent un compte UTILISABLE et NON
    // encore habilité.
    const admin = await creerAdmin('creation');
    const marqueur = uuidv7();

    const reponse = await appeler('POST', '/v1/users', {
      jeton: admin.jeton,
      corps: {
        name: 'Auditeur nouvellement recrute',
        email: `compte.neuf.${marqueur}@exemple.test`,
        password: 'mot-de-passe-factice-de-creation',
        role: 'consultant',
      },
    });
    expect(reponse.statut).toBe(201);

    const cree = utilisateur(reponse);
    expect(cree.isActive, '§34.4 : les trois premières étapes exigent un compte utilisable').toBe(
      true,
    );
    expect(
      cree.habilitatedAt,
      'L’habilitation est un ACTE POSTÉRIEUR au bac à sable et à la cotation croisée.\n' +
        'La poser à la création reviendrait à habiliter quelqu’un qui n’a rien passé —\n' +
        'et le journal l’écrirait « create », pas « habilitate ».',
    ).toBeNull();
    expect(
      cree.usageProfile,
      '03 §34.4 : « profil guidé strict par défaut §19.1 ». Le défaut est APPLICATIF\n' +
        '(la migration 0011 a retiré le défaut SQL) : il doit donc s’appliquer ici.',
    ).toBe('guide_strict');
    expect(cree.lastLoginAt).toBeNull();

    const journal = await journalDe(cree.id);
    expect(journal.map((l) => l.action)).toStrictEqual(['user.create']);
    expect(
      journal[0]?.meta,
      'Le RÔLE, jamais le nom ni l’adresse : c’est ce qui rend la ligne utile (« qui a\n' +
        'créé un admin ? ») sans faire de `activity_log` un annuaire.',
    ).toStrictEqual({ role: 'consultant' });
  });

  it('un compte INTROUVABLE rend 404 sur les cinq routes qui visent un compte', async () => {
    // Un `PATCH` sur un identifiant inexistant ne doit ni créer, ni rendre 200, ni
    // tomber en 500 sur une lecture nulle. `uuidv7()` fournit un identifiant BIEN
    // FORMÉ mais absent : c'est le cas qui distingue « 404 » de « 400 sur l’UUID ».
    const admin = await creerAdmin('absent');
    const fantome = uuidv7();

    for (const acte of ACTES.filter((a) => a.methode === 'PATCH')) {
      const reponse = await appeler(acte.methode, acte.url(fantome), {
        jeton: admin.jeton,
        corps: acte.corps('absent'),
      });
      expect(reponse.statut, acte.nom).toBe(404);
      expect(reponse.code).toBe('NOT_FOUND');
    }
  });
});
