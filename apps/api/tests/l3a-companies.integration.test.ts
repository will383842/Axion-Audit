// =============================================================================
// LOT L3 / INCRÉMENT L3a — L'API `companies`, ÉPROUVÉE SUR UN POSTGRESQL RÉEL.
//
// `GET|POST /v1/companies` · `GET|PATCH /v1/companies/:id`.
//
// Écrit par A17, qui n'a produit AUCUNE des lignes testées (09 §5.6). Les
// attentes viennent de la SPÉCIFICATION — 03 §29 (R3 dédup SIREN, R4 NAF→secteur),
// 03 §16 (les filiales étrangères SANS SIREN), 04 §7 (l'index unique PARTIEL),
// 11 §3 (conventions d'API, keyset), `docs/conception/LOT_L3.md` §2 et §3d, et
// l'entrée `DECISIONS.md` du 2026-08-31 sur le rôle d'accès — jamais de la
// lecture du code pris pour énoncé. Un test qui décalque les branches de son
// sujet ne teste que lui-même.
//
// ── POURQUOI CE FICHIER EXISTE, ET CE QU'IL FERME EXACTEMENT ─────────────────
// L'incrément a été livré SANS UN SEUL TEST : la branche était « verte » parce
// que rien ne l'éprouvait. `docs/ETAT.md` nomme lui-même QUATRE propriétés « qui
// ne se prouvent que contre un PostgreSQL réel » et qu'aucun test ne couvrait.
// Elles sont ici, plus quatre que personne n'avait listées et qui sont dues :
//
//   1. deux `POST` CONCURRENTS sur le même SIREN → un 201, un 409. L'enjeu n'est
//      pas la sémantique, c'est la REMONTÉE DE LA CHAÎNE `cause` : Drizzle range
//      la `DatabaseError` de `pg` dans `cause` sans recopier `code` ni
//      `constraint` sur l'enveloppe. Si la remontée échoue, un SIREN en double
//      sort en **500**, pas en 409 — et cela ne se voit qu'à l'exécution ;
//   2. trois créations SANS SIREN → trois succès. L'index du 04 est
//      `companies(siren) WHERE siren IS NOT NULL` : plusieurs `NULL` sont
//      LÉGITIMES (§16, filiales étrangères). Un code qui traiterait `NULL` comme
//      une valeur refuserait des créations valides ;
//   3. R4, LES DEUX MOITIÉS DANS LE MÊME TEST. Le piège est mesuré :
//      `naf_sector_map` est semée avec des clés de DIVISION à deux chiffres
//      (`'01'`…`'99'`), alors que `companies.naf_code` porte un code APE COMPLET
//      (`'62.01Z'`). Une correspondance naïve n'aurait jamais rien trouvé, et R4
//      serait « sorti vert en ne faisant rien » — chaque création rendant
//      poliment « secteur à qualifier » sans que la table soit lue une fois. Le
//      cas « code CONNU » est donc le test qui compte : sans lui, le cas
//      « inconnu » passerait sur un mécanisme totalement inerte ;
//   4. le curseur `(name, id)` stable sous insertion concurrente, AVEC DEUX
//      HOMONYMES QUI ENJAMBENT UNE FRONTIÈRE DE PAGE. C'est la seule disposition
//      où un curseur non composite se trahit : la seconde fiche homonyme serait
//      SAUTÉE par un `WHERE name > $1`, et sautée en silence ;
//   5. l'étanchéité RBAC des quatre routes (`@critique`) ;
//   6. la normalisation de nom sur les DEUX graphies les plus courantes ;
//   7. SIREN malformé = 400, SIREN valide écrit autrement = même fiche ;
//   8. `deleted_at` non nul → 404 et absence de la liste.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, dit plutôt que sous-entendu ─────────────
//   · il ne prouve rien sur les journaux `activity_log` : la porte d'écriture du
//     journal appartient au lot L2 et a sa propre suite (`l2-journal`). Ce qui
//     est vérifié ici, c'est que l'écriture RÉUSSIT — une entrée de journal qui
//     lèverait ferait tomber les créations ;
//   · il ne prouve pas la PERFORMANCE du balayage de noms (`lireNomsEntreprises`
//     lit toutes les fiches vivantes à chaque écriture). C'est une dette écrite
//     et remontée, pas un défaut de correction ;
//   · il ne mesure aucune durée : un seuil de temps est intermittent en CI, et
//     une suite intermittente finit ignorée.
//
// Invariant 2 : toutes les fixtures portent des libellés neutres et des SIREN
// FACTICES, valides au sens de Luhn parce que le contrat les exige — calculés
// par `sirenFactice` ci-dessous, jamais recopiés d'un registre réel.
// Traçabilité : E19 (avant-vente : cadrage de l'étendue) · E18 (liaison clients
// axion-ia.com) · E3 (pré-remplissage sectoriel) · E33 (sécurité) · E43
// (conventions d'API épinglées).
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// 64 caractères hexadécimaux = les 32 octets qu'exige `envApiSchema`.
// -----------------------------------------------------------------------------
const SECRET_ACCES = '3e'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '9b'.repeat(32);

/**
 * Durées de vie POSÉES EXPLICITEMENT aux valeurs du contrat (11 §3). Les lire de
 * l'environnement ambiant ferait dépendre le verdict d'un `.env` non versionné.
 */
const TTL_ACCES = '15m';
const TTL_RAFRAICHISSEMENT = '30d';

/**
 * Identifiants du compte fondateur du seed. Posés en `??=` : si la machine ou la
 * CI en fournit déjà, les siens l'emportent. Ce compte n'est JAMAIS utilisé par
 * les tests — ils frappent leurs propres comptes — mais le seed refuse de tourner
 * sans lui, et c'est le seed qui peuple `naf_sector_map`.
 */
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l3a@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

// -----------------------------------------------------------------------------
// SIREN FACTICES — la clé de Luhn recalculée ICI, indépendamment du code testé
// -----------------------------------------------------------------------------

/**
 * Complète huit chiffres par leur clé de contrôle et rend un SIREN factice VALIDE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ÉCRIT DANS L'AUTRE SENS QUE LE CODE TESTÉ, ET C'EST VOLONTAIRE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `cleSirenValide` parcourt le numéro DE GAUCHE À DROITE et double les rangs
 * impairs (0-indexés) ; cette fonction-ci parcourt DE DROITE À GAUCHE et double
 * un rang sur deux à partir du second, qui est la formulation manuelle de Luhn.
 * Les deux doivent tomber d'accord : si l'une des deux inverse son indice — la
 * faute exacte que ce contrôle existe pour attraper — les créations de ce fichier
 * partiraient en `400` et la suite entière rougirait bruyamment, au lieu de
 * valider un numéro que la production refuserait.
 *
 * Importer `cleSirenValide` pour fabriquer les fixtures aurait produit le
 * contraire : un test incapable de distinguer une implémentation juste d'une
 * implémentation fausse, puisqu'il aurait posé sa question à son propre sujet.
 */
function sirenFactice(huitChiffres: string): string {
  if (!/^\d{8}$/.test(huitChiffres)) {
    throw new Error(`base de SIREN factice invalide : « ${huitChiffres} »`);
  }
  let somme = 0;
  for (let rangDroite = 1; rangDroite <= 8; rangDroite += 1) {
    const caractere = huitChiffres[8 - rangDroite];
    if (caractere === undefined) throw new Error('base de SIREN factice tronquée');
    const chiffre = Number(caractere);
    // Rang 0 = la clé elle-même (non doublée) ; on double donc les rangs impairs.
    const pondere = rangDroite % 2 === 1 ? chiffre * 2 : chiffre;
    somme += pondere > 9 ? pondere - 9 : pondere;
  }
  return `${huitChiffres}${String((10 - (somme % 10)) % 10)}`;
}

// -----------------------------------------------------------------------------
// CODES APE — une division RÉELLEMENT semée, et une qui ne l'est PAS
// -----------------------------------------------------------------------------

/**
 * Division `62` — semée par `apps/api/scripts/seed.mjs` (plage 58→66, secteur
 * `services`). LUE dans le script, jamais devinée : le test vérifie d'ailleurs sa
 * présence en base avant de s'en servir, faute de quoi le cas « code connu »
 * deviendrait un second cas « code inconnu » sans que personne ne le voie.
 */
const DIVISION_SEMEE = '62';
const APE_CONNU = '62.01Z';

/**
 * Division `04` — ABSENTE du semis. Les plages du script sont 01-03, 05-09,
 * 10-12, 13-33, 35-39, 41-42, 43, 45-47, 49-53, 55-56, 58-66, 68-75, 77-82,
 * 84-85, 86-88, 90-94, 95, 96-99 : `04` tombe dans le premier trou. Son absence
 * est ASSERTÉE en base plutôt que supposée.
 */
const DIVISION_NON_SEMEE = '04';
const APE_VALIDE_INCONNU = '04.01A';

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
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
// APPELS HTTP
// -----------------------------------------------------------------------------

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly details: readonly { readonly path: string; readonly message: string }[];
  readonly corps: string;
}

const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

/**
 * Une adresse par appel ANONYME.
 *
 * Le quota global (11 §3) est de 300 req/min et sa clé est le sujet du jeton, ou
 * `request.ip` en repli — donc pour un anonyme, l'adresse. Sans adresse distincte,
 * l'ORDRE des `it` déciderait des verdicts, et une suite dont le résultat dépend
 * de son ordre ne prouve rien.
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.31.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

async function appeler(
  methode: 'GET' | 'POST' | 'PATCH',
  url: string,
  options: { readonly jeton?: string; readonly charge?: Readonly<Record<string, unknown>> } = {},
): Promise<Reponse> {
  const reponse = await api().inject({
    method: methode,
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
    ...(options.charge === undefined ? {} : { payload: options.charge }),
  });

  let code: string | null = null;
  let details: readonly { path: string; message: string }[] = [];
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
    if (analyse.success) {
      code = analyse.data.error.code;
      details = analyse.data.error.details ?? [];
    }
  }
  return { statut: reponse.statusCode, code, details, corps: reponse.body };
}

// -----------------------------------------------------------------------------
// LES CONTRATS DE SORTIE — RÉÉCRITS depuis 11 §3, jamais importés du code testé
// -----------------------------------------------------------------------------
// Importer `companyResponseSchema` reviendrait à demander au sujet de valider sa
// propre réponse : une clé retirée du contrat disparaîtrait des deux côtés le même
// jour, et le test resterait vert en n'exigeant plus rien.

const entrepriseSchema = z.object({
  id: z.uuid(),
  externalRef: z.string().nullable(),
  name: z.string(),
  siren: z.string().nullable(),
  nafCode: z.string().nullable(),
  sectorId: z.uuid().nullable(),
  headcount: z.number().nullable(),
  sitesCount: z.number().nullable(),
  countries: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type Entreprise = z.infer<typeof entrepriseSchema>;

const ecritureSchema = z.object({
  company: entrepriseSchema,
  secteurAQualifier: z.boolean(),
  doublonsNomPossibles: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
type Ecriture = z.infer<typeof ecritureSchema>;

const pageEntreprisesSchema = z.object({
  items: z.array(entrepriseSchema),
  nextCursor: z.string().nullable(),
});
type PageEntreprises = z.infer<typeof pageEntreprisesSchema>;

function ecriture(reponse: Reponse): Ecriture {
  return ecritureSchema.parse(JSON.parse(reponse.corps));
}

function fiche(reponse: Reponse): Entreprise {
  return entrepriseSchema.parse(JSON.parse(reponse.corps));
}

function page(reponse: Reponse): PageEntreprises {
  return pageEntreprisesSchema.parse(JSON.parse(reponse.corps));
}

// -----------------------------------------------------------------------------
// COMPTES — un compte NEUF par test, jamais un compte partagé
// -----------------------------------------------------------------------------

type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;

/**
 * Sème un compte et frappe son jeton d'accès.
 *
 * ── DEUX RAISONS DE NE PAS PASSER PAR `POST /v1/auth/login` ─────────────────
 *  1. le quota de `/v1/auth/*` (10 req/min/IP) ferait dépendre cette suite d'un
 *     plafond qui ne la concerne pas ;
 *  2. chaque connexion coûte une dérivation Argon2id à ~19 Mio, pour éprouver un
 *     chemin qui a déjà sa propre suite (`l2-auth-routes`).
 * Le jeton est frappé par `app.jwt.sign`, c'est-à-dire par LA MÊME clé et le même
 * algorithme que la route de connexion : le crochet ③ relit ensuite le rôle EN
 * BASE (06 §10.1, révocation instantanée), donc rien de ce qui est éprouvé ici
 * n'est court-circuité — le jeton ne porte que `sub`.
 *
 * ── ET POURQUOI UN COMPTE NEUF PAR TEST ─────────────────────────────────────
 * La clé du quota global est le sujet du jeton. Un compte partagé ferait de la
 * 301ᵉ requête du fichier un `429` attribué au hasard à l'un des `it`.
 */
async function creerCompte(role: RoleUtilisateur, marqueur: string): Promise<Compte> {
  compteurCompte += 1;
  const suffixe = `${marqueur}-${String(compteurCompte)}`;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [id, `Compte ${suffixe}`, `compte.${suffixe}@exemple.test`, role],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

// -----------------------------------------------------------------------------
// RACCOURCIS D'ÉCRITURE
// -----------------------------------------------------------------------------

async function creer(
  jeton: string,
  charge: Readonly<Record<string, unknown>>,
): Promise<{ readonly reponse: Reponse; readonly ecriture: Ecriture }> {
  const reponse = await appeler('POST', '/v1/companies', { jeton, charge });
  expect(reponse.statut, `création refusée : ${reponse.corps}`).toBe(201);
  return { reponse, ecriture: ecriture(reponse) };
}

/** Parcourt TOUTES les pages et rend les identifiants, dans l'ordre de lecture. */
async function tousLesIdentifiants(jeton: string, limite: number): Promise<string[]> {
  const identifiants: string[] = [];
  let curseur: string | null = null;
  for (let garde = 0; garde < 100; garde += 1) {
    const url =
      curseur === null
        ? `/v1/companies?limit=${String(limite)}`
        : `/v1/companies?limit=${String(limite)}&after=${encodeURIComponent(curseur)}`;
    const reponse = await appeler('GET', url, { jeton });
    expect(reponse.statut, `lecture de page refusée : ${reponse.corps}`).toBe(200);
    const lue = page(reponse);
    identifiants.push(...lue.items.map((item) => item.id));
    curseur = lue.nextCursor;
    if (curseur === null) return identifiants;
  }
  throw new Error('la pagination ne s’est pas terminée en 100 pages');
}

// -----------------------------------------------------------------------------
// LECTURES DIRECTES — la seule vérité sur ce que la base contient
// -----------------------------------------------------------------------------

async function compterEntreprises(): Promise<number> {
  const resultat = await bd().query<{ total: string }>('SELECT count(*) AS total FROM companies');
  return Number(resultat.rows[0]?.total ?? '0');
}

/** Les fiches que la LISTE a le droit de montrer — celles que `deleted_at` n'a pas retirées. */
async function compterEntreprisesVivantes(): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM companies WHERE deleted_at IS NULL',
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function compterParSiren(siren: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM companies WHERE siren = $1',
    [siren],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

async function secteurDeLaDivision(division: string): Promise<string | null> {
  const resultat = await bd().query<{ sector_id: string }>(
    'SELECT sector_id FROM naf_sector_map WHERE naf_code = $1',
    [division],
  );
  return resultat.rows[0]?.sector_id ?? null;
}

async function idSecteur(code: string): Promise<string> {
  const resultat = await bd().query<{ id: string }>('SELECT id FROM sectors WHERE code = $1', [
    code,
  ]);
  const trouve = resultat.rows[0]?.id;
  if (trouve === undefined) throw new Error(`secteur « ${code} » absent du seed`);
  return trouve;
}

/**
 * Lit `sector_id` DIRECTEMENT en base. Sert au cas « division inconnue » du
 * `PATCH` : la réponse de l'API pourrait recopier l'ancienne valeur sans rien
 * prouver sur ce qui a été écrit — seule la ligne fait foi.
 */
async function secteurEnBase(id: string): Promise<string | null> {
  const resultat = await bd().query<{ sector_id: string | null }>(
    'SELECT sector_id FROM companies WHERE id = $1',
    [id],
  );
  if (resultat.rowCount !== 1) throw new Error(`fiche ${id} absente`);
  return resultat.rows[0]?.sector_id ?? null;
}

/**
 * Pose `deleted_at` par SQL DIRECT, et il n'y a pas d'autre voie : aucune route
 * de suppression n'existe (le « D » de CRUD n'est jamais instancié par le pack).
 * Le filtre `deleted_at IS NULL` n'en est pas moins écrit dans le dépôt, et rien
 * ne l'éprouve aujourd'hui — d'où ce raccourci, qui reste une fabrication d'état
 * et jamais une fabrication de résultat.
 */
async function marquerSupprimee(id: string): Promise<void> {
  const resultat = await bd().query('UPDATE companies SET deleted_at = now() WHERE id = $1', [id]);
  expect(resultat.rowCount, 'la fiche à supprimer doit exister').toBe(1);
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l3a_companies');
  nomBase = base.nom;
  await appliquerMontee(base.url);

  // Le seed est INDISPENSABLE : c'est lui qui peuple `sectors` et
  // `naf_sector_map`. Sans référentiel, R4 n'aurait rien à trouver et le test du
  // « code APE connu » — le seul qui prouve que la table est réellement
  // consultée — serait vert par vacuité, ce qui est exactement le défaut qu'il
  // existe pour rendre impossible.
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  client = await connecter(base.url);

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit
  // être posée avant le premier `import()` dynamique, jamais après.
  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = TTL_ACCES;
  process.env.JWT_REFRESH_TTL = TTL_RAFRAICHISSEMENT;
  // `fatal` : ce fichier n'éprouve RIEN sur les journaux (c'est le périmètre de
  // `l2-journal`), et `envApiSchema` n'admet pas de niveau « silencieux ».
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;
}, 300_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// 1. LE SIREN, ARBITRÉ PAR LA BASE — ET LA CHAÎNE `cause` QUI EN DÉPEND
// =============================================================================
describe('POST /v1/companies — conflit de SIREN (R3, moitié « clé de déduplication »)', () => {
  it('@critique deux créations CONCURRENTES sur le même SIREN : une passe, l’autre est un 409 — jamais un 500', async () => {
    // POURQUOI CE TEST EST LE PLUS IMPORTANT DU FICHIER.
    // Le refus n'est décidé ni par une lecture préalable ni par un `if` : il vient
    // de l'index unique PARTIEL du 04, sous la forme d'un SQLSTATE 23505. Or
    // Drizzle n'expose pas cette erreur telle quelle — il lève sa propre
    // enveloppe et RANGE l'erreur du pilote dans `cause`, SANS recopier `code` ni
    // `constraint`. Un `catch` qui lirait `erreur.code` rendrait donc toujours
    // faux, et le doublon sortirait en 500 INTERNAL_ERROR : l'utilisateur verrait
    // « une erreur interne est survenue » là où il doit voir la fiche à
    // rapprocher. Aucune relecture de code ne montre cela ; seule l'exécution
    // contre un PostgreSQL réel le montre.
    const admin = await creerCompte('admin', 'siren-course');
    const siren = sirenFactice('12345678');

    const [premiere, seconde] = await Promise.all([
      appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: 'Entreprise factice de course A', siren },
      }),
      appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: 'Entreprise factice de course B', siren },
      }),
    ]);

    const statuts = [premiere.statut, seconde.statut].sort((x, y) => x - y);
    expect(
      statuts,
      'Deux requêtes simultanées, un seul SIREN : exactement une création et un\n' +
        'conflit. Ni deux 201 (l’unicité aurait cédé), ni un 500 (la traduction de\n' +
        'l’erreur du pilote aurait cédé). L’ordre n’est PAS présumé : la course est\n' +
        'arbitrée par la base, et laquelle des deux gagne n’a aucune importance.',
    ).toStrictEqual([201, 409]);

    const gagnante = premiere.statut === 201 ? premiere : seconde;
    const perdante = premiere.statut === 409 ? premiere : seconde;

    expect(perdante.code).toBe('COMPANY_DUPLICATE');
    expect(
      perdante.statut,
      'Un doublon de SIREN est un conflit d’ÉTAT, pas une requête mal formée : 409.',
    ).toBe(409);

    const creee = ecriture(gagnante).company;
    expect(
      perdante.details.map((detail) => detail.path),
      'Le refus doit être ACTIONNABLE : sans l’identifiant de la fiche existante, la\n' +
        'console ne peut qu’annoncer un doublon, jamais y conduire.',
    ).toStrictEqual(['siren']);
    expect(perdante.details[0]?.message).toContain(creee.id);

    expect(
      await compterParSiren(siren),
      'Une seule ligne porte ce SIREN. Deux lignes signifieraient que l’index unique\n' +
        'partiel du 04 n’a pas été posé, et la déduplication R3 n’existerait plus.',
    ).toBe(1);
  });

  it('un SIREN déjà pris, présenté SÉQUENTIELLEMENT, rend le même 409 que la course', async () => {
    // La course prouve que le 23505 est bien traduit ; ce test-ci prouve que le
    // chemin nominal ne dépend PAS d'une course pour refuser. Les deux ensemble
    // écartent l'implémentation qui ne refuserait que par accident de timing.
    const admin = await creerCompte('admin', 'siren-sequentiel');
    const siren = sirenFactice('23456789');

    const premiere = await creer(admin.jeton, { name: 'Entreprise factice Bêta', siren });
    const seconde = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Bêta bis', siren },
    });

    expect(seconde.statut).toBe(409);
    expect(seconde.code).toBe('COMPANY_DUPLICATE');
    expect(seconde.details[0]?.message).toContain(premiere.ecriture.company.id);
    expect(await compterParSiren(siren)).toBe(1);
  });
});

// =============================================================================
// 2. PLUSIEURS FICHES SANS SIREN — L'INDEX EST PARTIEL, ET C'EST UNE RÈGLE MÉTIER
// =============================================================================
describe('POST /v1/companies — SIREN absent (03 §16 : les filiales étrangères)', () => {
  it('trois créations SANS SIREN réussissent toutes les trois', async () => {
    // CE QUE CE TEST EMPÊCHE DE RÉINTRODUIRE.
    // L'index du 04 est `companies(siren) WHERE siren IS NOT NULL` : le `WHERE`
    // n'est pas un détail d'implémentation, c'est la règle métier rendue
    // exécutable. Une déduplication qui traiterait `NULL` comme une valeur — un
    // `IS NOT DISTINCT FROM`, ou un refus sur le nom — REFUSERAIT DES CRÉATIONS
    // VALIDES, et le premier groupe européen audité rendrait l'outil inutilisable.
    // Les trois formes de « pas de SIREN » sont éprouvées, parce qu'un contrat qui
    // n'en accepterait qu'une obligerait le front à deviner laquelle.
    const admin = await creerCompte('admin', 'sans-siren');

    const premiere = await creer(admin.jeton, { name: 'Filiale factice Gamma A' });
    const deuxieme = await creer(admin.jeton, { name: 'Filiale factice Gamma B', siren: null });
    const troisieme = await creer(admin.jeton, {
      name: 'Filiale factice Gamma C',
      siren: null,
      countries: ['DE'],
    });

    const creees = [premiere.ecriture, deuxieme.ecriture, troisieme.ecriture];
    expect(
      creees.map((une) => une.company.siren),
      'Trois `null` en base, et c’est légal : ils ne se comparent jamais entre eux.',
    ).toStrictEqual([null, null, null]);

    const identifiants = new Set(creees.map((une) => une.company.id));
    expect(identifiants.size, 'trois fiches DISTINCTES, pas une fusion silencieuse').toBe(3);

    expect(
      creees.every((une) => une.doublonsNomPossibles.length === 0),
      'Trois noms différents : aucune alerte d’homonymie ne doit être levée. Une\n' +
        'alerte qui crie tout le temps n’est plus lue — et ce test est ce qui\n' +
        'empêche l’alerte R3 de devenir bruyante sans que personne ne le remarque.',
    ).toBe(true);
  });
});

// =============================================================================
// 3. R4 — LE SECTEUR PRÉ-REMPLI, ET LE PIÈGE DE LA MAILLE DE `naf_sector_map`
// =============================================================================
describe('POST /v1/companies — R4 : NAF → secteur (03 §29)', () => {
  it('@critique un code APE CONNU remplit le secteur, un code APE valide INCONNU rend 201 à qualifier, un code MALFORMÉ rend 400', async () => {
    // LES TROIS MOITIÉS SONT DANS LE MÊME `it`, ET C'EST LA RAISON D'ÊTRE DU TEST.
    //
    // Le piège est MESURÉ : `seed.mjs` peuple `naf_sector_map` avec 88 lignes dont
    // la clé est une DIVISION à deux chiffres (`'01'`…`'99'`), tandis que
    // `companies.naf_code` porte un code APE COMPLET (`'62.01Z'`). Une
    // correspondance écrite naïvement — `WHERE naf_code = '6201Z'` — ne trouverait
    // JAMAIS rien. R4 sortirait alors « vert en ne faisant rien » : chaque création
    // rendrait poliment `sectorId: null` et `secteurAQualifier: true`, la table
    // n'ayant pas été consultée une seule fois.
    //
    // Séparés en deux `it`, le cas « inconnu » passerait donc sur un mécanisme
    // TOTALEMENT INERTE, et le cas « connu » manquant, personne ne le saurait.
    // Le cas (a) est le test qui compte ; (b) et (c) bornent son sens.
    const admin = await creerCompte('admin', 'r4');

    // — Garde-fou du test lui-même : sans lui, ce fichier pourrait devenir vert
    //   par simple dérive du seed, en n'éprouvant plus rien.
    const secteurAttendu = await secteurDeLaDivision(DIVISION_SEMEE);
    expect(
      secteurAttendu,
      `La division « ${DIVISION_SEMEE} » doit être présente dans naf_sector_map, sinon\n` +
        'le cas (a) ci-dessous n’éprouve plus la correspondance mais son absence.',
    ).not.toBeNull();
    expect(
      await secteurDeLaDivision(APE_CONNU),
      'ET LA TABLE NE DOIT PAS ÊTRE INDEXÉE PAR LE CODE APE COMPLET. Le jour où elle\n' +
        'le serait, le passage par la division deviendrait faux — et ce test est le\n' +
        'seul endroit du dépôt qui verrait le changement de maille.',
    ).toBeNull();
    expect(
      await secteurDeLaDivision(DIVISION_NON_SEMEE),
      `La division « ${DIVISION_NON_SEMEE} » doit rester ABSENTE du semis, sinon le\n` +
        'cas (b) éprouverait un code connu en croyant éprouver un code inconnu.',
    ).toBeNull();

    // — (a) code APE CONNU du référentiel ------------------------------------
    const connue = await creer(admin.jeton, {
      name: 'Entreprise factice Delta',
      nafCode: APE_CONNU,
    });
    expect(
      connue.ecriture.company.sectorId,
      'R4 promet le PRÉ-REMPLISSAGE : un code APE connu doit rendre un secteur, et\n' +
        'précisément celui que `naf_sector_map` associe à sa DIVISION. Un `null` ici\n' +
        'signifie que la table n’a jamais été consultée, et que R4 est décoratif.',
    ).toBe(secteurAttendu);
    expect(
      connue.ecriture.secteurAQualifier,
      'Le secteur est rempli : il n’y a rien à qualifier à la main.',
    ).toBe(false);
    expect(
      connue.ecriture.company.nafCode,
      'Le code est stocké sous sa forme canonique `NN.NNL`, celle du 04.',
    ).toBe(APE_CONNU);

    // — (b) code APE VALIDE mais INCONNU du référentiel ----------------------
    const inconnue = await creer(admin.jeton, {
      name: 'Entreprise factice Epsilon',
      nafCode: APE_VALIDE_INCONNU,
    });
    expect(
      inconnue.ecriture.company.sectorId,
      'On n’INVENTE JAMAIS un secteur par défaut : un secteur faux traverserait\n' +
        'ensuite le moteur M2 (« palier × secteur × … », §16.3) et produirait un\n' +
        'questionnaire faux, sans que rien ne signale d’où vient l’erreur.',
    ).toBeNull();
    expect(
      inconnue.ecriture.secteurAQualifier,
      'Un trou du référentiel est un fait d’ADMINISTRATION (la table est éditable\n' +
        'depuis la console, espace Contenu), pas une faute de l’utilisateur : la fiche\n' +
        'est créée, et l’écran est invité à demander le secteur.',
    ).toBe(true);

    // — (c) code APE MALFORMÉ ------------------------------------------------
    const malformes = ['62.01', '620', 'AB.01Z', ''];
    const acceptes: string[] = [];
    for (const code of malformes) {
      const refus = await appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: `Entreprise factice APE ${code}`, nafCode: code },
      });
      if (refus.statut !== 400 || refus.code !== 'VALIDATION_FAILED') {
        acceptes.push(`« ${code} » → ${String(refus.statut)} ${String(refus.code)}`);
      }
    }
    expect(
      acceptes,
      'C’est la distinction du §3d de la note de conception : l’INCONNU est un succès,\n' +
        'le MALFORMÉ est un 400. Les confondre rendrait indécidable, en lisant la\n' +
        'réponse, si le référentiel est incomplet ou si la saisie est fausse.',
    ).toStrictEqual([]);
  });

  it('un secteur IMPOSÉ par l’appelant l’emporte sur le pré-remplissage', async () => {
    // « Pré-rempli » (03 §29) décrit une commodité de saisie, pas une contrainte :
    // un consultant qui choisit le secteur d’une holding multi-activités en sait
    // plus qu’une division NAF. Écraser ce choix serait la faute exacte que R6
    // corrige déjà pour les unités d’organisation.
    const admin = await creerCompte('admin', 'r4-impose');
    const impose = await idSecteur('industrie');
    const parLaDivision = await secteurDeLaDivision(DIVISION_SEMEE);
    expect(
      impose,
      'La fixture n’a de sens que si les deux secteurs DIFFÈRENT : sinon le test est\n' +
        'vert quelle que soit la priorité appliquée.',
    ).not.toBe(parLaDivision);

    const creee = await creer(admin.jeton, {
      name: 'Entreprise factice Zêta',
      nafCode: APE_CONNU,
      sectorId: impose,
    });

    expect(creee.ecriture.company.sectorId).toBe(impose);
    expect(creee.ecriture.secteurAQualifier).toBe(false);
  });

  it('un secteur INEXISTANT est un 400 nommant le champ, jamais un 500', async () => {
    // Deuxième emprunt à la chaîne `cause` du pilote — cette fois un 23503 sur
    // `companies_sector_id_fkey`. Le test existe parce que ce chemin partage TOUT
    // son mécanisme avec le 409 du SIREN : s’il se rompt, les deux se rompent, et
    // celui-ci se déclenche sans avoir à provoquer une course.
    const admin = await creerCompte('admin', 'secteur-inconnu');
    const refus = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Êta', sectorId: uuidv7() },
    });

    expect(refus.statut).toBe(400);
    expect(refus.code).toBe('VALIDATION_FAILED');
    expect(refus.details.map((detail) => detail.path)).toStrictEqual(['sectorId']);
  });
});

// =============================================================================
// 4. R3, MOITIÉ « NOM EN SECOND » — L'ALERTE, ET LES DEUX GRAPHIES QUI LA JUSTIFIENT
// =============================================================================
describe('POST /v1/companies — alerte d’homonymie (R3 : « alerte », pas blocage)', () => {
  it('@critique « Untel Alpha SAS » et « UNTEL ALPHA S.A.S. » se reconnaissent — et la seconde est CRÉÉE', async () => {
    // LE DÉFAUT QUE CE TEST GRAVE, ET QUI A RÉELLEMENT EXISTÉ.
    // La normalisation ramenait d’abord la ponctuation à l’espace : « Untel Alpha
    // SAS » donnait `untel alpha` tandis que « UNTEL ALPHA S.A.S. » donnait
    // `untel alpha s a s`. LES DEUX GRAPHIES LES PLUS COURANTES DE LA MÊME
    // ENTREPRISE ne se seraient jamais reconnues, et l’alerte R3 aurait été muette
    // précisément sur le cas qu’elle existe pour voir. Le point se supprime donc
    // AVANT que le reste de la ponctuation ne devienne espace, ce qui ramène
    // `S.A.S.` à `sas`, que la liste des formes juridiques écarte ensuite.
    //
    // Et l’alerte reste NON BLOQUANTE : c’est ce que R3 écrit (« alerte »), et ce
    // que `DECISIONS.md` du 2026-08-29 a explicitement substitué au 409 que la
    // note de conception proposait pour le nom. Deux entités homonymes dans deux
    // pays sont légitimes (§16) : l’outil signale, l’humain trie.
    const admin = await creerCompte('admin', 'homonymes');

    const premiere = await creer(admin.jeton, { name: 'Untel Alpha SAS' });
    expect(
      premiere.ecriture.doublonsNomPossibles,
      'La première fiche n’a aucun homonyme : une alerte ici prouverait que le\n' +
        'constat porte sur la fiche qu’on vient d’écrire, et non sur l’état d’avant.',
    ).toStrictEqual([]);

    const seconde = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'UNTEL ALPHA S.A.S.' },
    });
    expect(
      seconde.statut,
      'La création RÉUSSIT. Refuser sur le nom inventerait une contrainte que le 04\n' +
        'refuse d’écrire : son index unique porte sur `siren` seul.',
    ).toBe(201);

    const alerte = ecriture(seconde);
    expect(
      alerte.doublonsNomPossibles.map((homonyme) => homonyme.id),
      'L’alerte doit NOMMER la fiche existante. Une alerte sans identifiant laisse\n' +
        'l’auditeur chercher à la main ce que l’outil savait déjà.',
    ).toStrictEqual([premiere.ecriture.company.id]);
    expect(alerte.doublonsNomPossibles[0]?.name).toBe('Untel Alpha SAS');
  });

  it('deux raisons sociales réellement distinctes ne lèvent aucune alerte', async () => {
    // La contre-épreuve. Sans elle, une normalisation qui rendrait la chaîne vide
    // pour TOUT nom ferait passer le test précédent : chaque fiche serait
    // l’homonyme de toutes les autres, et l’alerte n’apprendrait plus rien.
    const admin = await creerCompte('admin', 'homonymes-distincts');
    const premiere = await creer(admin.jeton, { name: 'Thêta Industries factice' });
    const seconde = await creer(admin.jeton, { name: 'Iota Manufacture factice' });

    expect(premiere.ecriture.doublonsNomPossibles).toStrictEqual([]);
    expect(seconde.ecriture.doublonsNomPossibles).toStrictEqual([]);
  });
});

// =============================================================================
// 5. LE SIREN COMME ENTRÉE — MALFORMÉ CONTRE INCONNU, ET LA NORMALISATION
// =============================================================================
describe('POST /v1/companies — SIREN : normalisation et refus (note L3 §3d)', () => {
  it('un SIREN MALFORMÉ est un 400, jamais un 409', async () => {
    // La distinction du §3d : « distinguer l’inconnu du malformé ». Un 409 dirait
    // « quelqu’un d’autre a déjà ce numéro » alors que le numéro n’existe pas ; il
    // enverrait l’auditeur chercher une fiche à rapprocher qui n’a jamais existé.
    const admin = await creerCompte('admin', 'siren-malforme');

    const cas = [
      { quoi: 'clé de Luhn fausse (9 chiffres pourtant)', siren: '123456789' },
      { quoi: 'huit chiffres', siren: '12345678' },
      { quoi: 'dix chiffres', siren: '1234567890' },
      { quoi: 'lettres', siren: '12345678A' },
      { quoi: 'tirets — un SIREN ne s’écrit jamais ainsi', siren: '123-456-782' },
      { quoi: 'chaîne vide', siren: '' },
    ];

    const anomalies: string[] = [];
    for (const cas_ of cas) {
      const refus = await appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: `Entreprise factice SIREN ${cas_.siren}`, siren: cas_.siren },
      });
      if (refus.statut !== 400 || refus.code !== 'VALIDATION_FAILED') {
        anomalies.push(`${cas_.quoi} → ${String(refus.statut)} ${String(refus.code)}`);
      }
    }

    expect(
      anomalies,
      'La requête est mal formée : l’état de la base n’y est pour rien. Le cas de la\n' +
        'clé de Luhn est le plus important — c’est le seul qui distingue une faute de\n' +
        'frappe d’un identifiant réel, et le premier qu’une implémentation pressée\n' +
        'oublie.',
    ).toStrictEqual([]);
  });

  it('@critique un SIREN valide écrit AVEC des espaces ou des points désigne la MÊME entreprise', async () => {
    // SANS CE TEST, LA NORMALISATION POURRAIT NE PAS EXISTER. Les trois graphies
    // arrivent réellement — d’un extrait Kbis, d’un tableur, d’un copier-coller
    // qui insère des espaces insécables. Si elles n’étaient pas ramenées à la même
    // forme, la déduplication R3 laisserait entrer trois fiches pour une seule
    // entreprise, et l’outil aurait perdu sa clé de rapprochement avec la console
    // commerciale sans qu’aucune erreur ne soit levée.
    const admin = await creerCompte('admin', 'siren-graphies');
    const brut = sirenFactice('34567891');
    const avecEspaces = `${brut.slice(0, 3)} ${brut.slice(3, 6)} ${brut.slice(6)}`;
    const avecPoints = `${brut.slice(0, 3)}.${brut.slice(3, 6)}.${brut.slice(6)}`;

    const premiere = await creer(admin.jeton, {
      name: 'Entreprise factice Kappa',
      siren: avecEspaces,
    });
    expect(
      premiere.ecriture.company.siren,
      'Le SIREN est STOCKÉ normalisé : neuf chiffres, rien d’autre. Stocker la\n' +
        'graphie de saisie rendrait l’index unique inopérant sans le désactiver.',
    ).toBe(brut);

    const seconde = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Kappa bis', siren: avecPoints },
    });
    expect(seconde.statut, 'même entreprise, autre graphie : conflit').toBe(409);
    expect(seconde.code).toBe('COMPANY_DUPLICATE');
    expect(await compterParSiren(brut)).toBe(1);
  });
});

// =============================================================================
// 6. LA FICHE SUPPRIMÉE — LE FILTRE `deleted_at IS NULL`, ÉCRIT UNE FOIS
// =============================================================================
describe('fiche supprimée (companies.deleted_at)', () => {
  it('@critique une fiche `deleted_at` non nul rend 404 en lecture, 404 en modification, et disparaît de la liste', async () => {
    // POURQUOI CE TEST EXISTE ALORS QU’AUCUNE ROUTE NE SUPPRIME.
    // Le filtre `deleted_at IS NULL` est écrit UNE SEULE FOIS dans le dépôt, au
    // dépôt des entreprises, avec le motif explicite qu’« un filtre laissé à chaque
    // appelant est un filtre qu’un appelant oubliera ». Rien ne l’éprouve
    // aujourd’hui : il est donc, à la lettre, une règle documentée en commentaire.
    // Le jour où une route de suppression existera (elle exige un arbitrage
    // produit, `missions.company_id` étant NOT NULL), ce test sera déjà là — et
    // c’est le bon ordre, parce qu’une fiche supprimée qui resterait lisible ne se
    // remarquerait pas avant de figurer dans un rapport client.
    const admin = await creerCompte('admin', 'supprimee');
    const creee = await creer(admin.jeton, { name: 'Entreprise factice Lambda' });
    const id = creee.ecriture.company.id;

    const avant = await appeler('GET', `/v1/companies/${id}`, { jeton: admin.jeton });
    expect(avant.statut, 'la fiche est bien lisible AVANT la suppression').toBe(200);

    await marquerSupprimee(id);

    const apres = await appeler('GET', `/v1/companies/${id}`, { jeton: admin.jeton });
    expect(apres.statut).toBe(404);
    expect(
      apres.code,
      'Le refus est NOT_FOUND, pas FORBIDDEN : une fiche supprimée n’existe plus\n' +
        'pour l’API, et distinguer les deux apprendrait qu’elle a existé.',
    ).toBe('NOT_FOUND');

    const modification = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { notes: 'tentative de modification après suppression' },
    });
    expect(
      modification.statut,
      'La lecture SOUS VERROU du `PATCH` porte le même filtre que la lecture simple.\n' +
        'Deux filtres écrits à deux endroits finissent par diverger — et celui qui\n' +
        'diverge est toujours celui que personne n’a testé.',
    ).toBe(404);

    const identifiants = await tousLesIdentifiants(admin.jeton, 50);
    expect(
      identifiants.includes(id),
      'La fiche ne doit apparaître sur AUCUNE page de la liste. Toutes les pages\n' +
        'sont parcourues, pas seulement la première : un filtre appliqué à la requête\n' +
        'mais pas à la clause du curseur passerait autrement inaperçu.',
    ).toBe(false);
  });
});

// =============================================================================
// 7. ÉTANCHÉITÉ RBAC — UN DROIT QU'ON NE REPREND PLUS S'IL FUIT
// =============================================================================
describe('RBAC des quatre routes (`roles: [admin]`)', () => {
  it('@critique consultant, analyste, lecteur et anonyme sont refusés sur LES QUATRE routes, sans effet de bord', async () => {
    // POURQUOI CE TEST N’ÉTAIT PAS DANS LA LISTE, ET POURQUOI IL Y EST MAINTENANT.
    // Le pack ne nomme nulle part le rôle qui accède au référentiel client : ni le
    // §8, ni le §24.2, ni la matrice §34.1. Le silence a été comblé au plus
    // restrictif et TRACÉ (`DECISIONS.md` du 2026-08-31, « Quel rôle accède au
    // référentiel client ? »), avec l’argument décisif qu’« élargir plus tard est
    // un ajout à cette liste, tandis qu’avoir ouvert d’abord aurait été un droit
    // qu’on ne reprend plus ». Une décision de ce genre n’a de valeur que si
    // quelque chose la tient : c’est ce test.
    //
    // Une fiche client porte `external_ref`, la clé de liaison avec la console
    // commerciale axion-ia.com : l’ouvrir plus largement ouvrirait aussi la lecture
    // de cette liaison. L’enjeu dépasse donc la fiche elle-même.
    const admin = await creerCompte('admin', 'rbac-admin');
    const cible = await creer(admin.jeton, {
      name: 'Entreprise factice Mu',
      notes: 'note de référence, ne doit pas bouger',
    });
    const id = cible.ecriture.company.id;

    const chargeCreation = {
      name: 'Entreprise factice interdite',
      siren: sirenFactice('40000000'),
    };
    const chargeModification = { notes: 'écriture qui ne doit jamais avoir lieu' };

    const routes = [
      { methode: 'GET' as const, url: '/v1/companies' },
      { methode: 'POST' as const, url: '/v1/companies', charge: chargeCreation },
      { methode: 'GET' as const, url: `/v1/companies/${id}` },
      { methode: 'PATCH' as const, url: `/v1/companies/${id}`, charge: chargeModification },
    ];

    const sujets = [
      { nom: 'consultant', jeton: (await creerCompte('consultant', 'rbac')).jeton, attendu: 403 },
      { nom: 'analyste', jeton: (await creerCompte('analyste', 'rbac')).jeton, attendu: 403 },
      { nom: 'lecteur', jeton: (await creerCompte('lecteur', 'rbac')).jeton, attendu: 403 },
      { nom: 'anonyme', jeton: undefined, attendu: 401 },
    ];

    const nombreAvant = await compterEntreprises();
    const fuites: string[] = [];

    for (const sujet of sujets) {
      for (const route of routes) {
        const reponse = await appeler(route.methode, route.url, {
          ...(sujet.jeton === undefined ? {} : { jeton: sujet.jeton }),
          ...('charge' in route ? { charge: route.charge } : {}),
        });
        const codeAttendu = sujet.attendu === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN';
        if (reponse.statut !== sujet.attendu || reponse.code !== codeAttendu) {
          fuites.push(
            `${sujet.nom} → ${route.methode} ${route.url} : ` +
              `${String(reponse.statut)} ${String(reponse.code)} ` +
              `(attendu ${String(sujet.attendu)} ${codeAttendu})`,
          );
        }
      }
    }

    expect(
      fuites,
      'Les quatre routes sont `roles: [admin]`. Un 200 sur l’une d’elles ouvrirait le\n' +
        'référentiel client — et sa liaison `external_ref` avec la console\n' +
        'commerciale — à trois rôles qui n’y ont pas droit. Un 500 serait presque\n' +
        'aussi grave : il signifierait que le refus vient d’un plantage et non d’une\n' +
        'politique.',
    ).toStrictEqual([]);

    expect(
      await compterEntreprises(),
      'AUCUN effet de bord : le refus doit intervenir AVANT le gestionnaire. Une\n' +
        'route qui écrirait puis refuserait laisserait des fiches fantômes que\n' +
        'personne ne saurait rattacher à un acte.',
    ).toBe(nombreAvant);

    const relue = await appeler('GET', `/v1/companies/${id}`, { jeton: admin.jeton });
    expect(relue.statut).toBe(200);
    expect(fiche(relue).notes, 'la note de référence n’a pas bougé').toBe(
      'note de référence, ne doit pas bouger',
    );
  });

  it('@critique le refus de rôle PRÉCÈDE la validation du corps — un lecteur n’apprend rien du contrat', async () => {
    // CE QUE CE TEST AJOUTE AU PRÉCÉDENT.
    // Si la validation Zod s’exécutait avant le crochet d’autorisation, un rôle non
    // autorisé recevrait un `400 VALIDATION_FAILED` détaillant les champs attendus
    // — c’est-à-dire une DESCRIPTION DU CONTRAT D’UNE ROUTE À LAQUELLE IL N’A PAS
    // DROIT, et la confirmation que la route existe. L’ordre des crochets Fastify
    // le garantit aujourd’hui (`onRequest` avant l’analyse du corps) ; rien ne
    // l’écrit ailleurs que dans ce test.
    const admin = await creerCompte('admin', 'rbac-ordre-admin');
    const cible = await creer(admin.jeton, { name: 'Entreprise factice Nu' });
    const lecteur = await creerCompte('lecteur', 'rbac-ordre');

    const creation = await appeler('POST', '/v1/companies', {
      jeton: lecteur.jeton,
      charge: { champInexistant: 42 },
    });
    expect(creation.statut).toBe(403);
    expect(creation.code).toBe('FORBIDDEN');

    const modification = await appeler('PATCH', `/v1/companies/${cible.ecriture.company.id}`, {
      jeton: lecteur.jeton,
      charge: { headcount: 'pas-un-nombre' },
    });
    expect(modification.statut).toBe(403);
    expect(modification.code).toBe('FORBIDDEN');
    expect(
      modification.details,
      'Le refus ne porte AUCUN détail de validation : il ne dit pas quels champs la\n' +
        'route accepte, ni lesquels étaient mal formés.',
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 8. PAGINATION KEYSET — LE CURSEUR `(name, id)` SOUS INSERTION CONCURRENTE
// =============================================================================
describe('GET /v1/companies — curseur (name, id) (11 §3, conception L3 §2)', () => {
  it('@critique aucune fiche n’est sautée ni servie deux fois, deux homonymes enjambant une frontière de page', async () => {
    // LA DISPOSITION DES FIXTURES EST LE TEST — elle n'est pas décorative.
    //
    // Sept fiches, `limit=3`, donc au moins trois pages. DEUX D'ENTRE ELLES
    // PORTENT LE MÊME `name`, et elles sont placées en positions 3 et 4 : la
    // frontière de la première page tombe EXACTEMENT ENTRE LES DEUX. C'est la
    // seule disposition où un curseur non composite se trahit — un `WHERE name >
    // $1` reprendrait après le nom, donc SAUTERAIT la seconde homonyme, en
    // silence et sans jamais lever d'erreur. Et deux entreprises homonymes sont
    // LÉGITIMES (§16, filiales étrangères) : ce n'est pas un cas tordu, c'est le
    // cas que R3 existe pour faire voir.
    //
    // DEUX INSERTIONS SONT FAITES AU MILIEU DU PARCOURS. La première sort AVANT
    // le point de reprise : c'est celle qui ferait RÉPÉTER une ligne à une
    // pagination par décalage, et le test exige qu'elle ne réapparaisse pas. La
    // seconde sort APRÈS ; elle a le droit d'apparaître, et le test ne l'exige ni
    // ne l'interdit — affirmer l'un ou l'autre inventerait une garantie que le
    // keyset ne donne pas.
    const admin = await creerCompte('admin', 'curseur');

    // ── POURQUOI LE RÉFÉRENTIEL EST VIDÉ AVANT CE TEST, ET SEULEMENT AVANT LUI ─
    // La démonstration repose sur la POSITION des deux homonymes : ils doivent
    // enjamber une frontière de page. Cette position dépend du nombre de fiches
    // qui les précèdent — c'est-à-dire de tout ce que les `it` précédents ont
    // créé. Sans remise à zéro, la frontière se déplacerait au gré de l'ordre des
    // tests, et le jour où elle cesserait de tomber entre les deux homonymes, ce
    // test resterait VERT en n'éprouvant plus rien. On retire donc les fiches
    // existantes par `deleted_at` — la mise à l'écart que le produit connaît
    // déjà, jamais un `DELETE` — et l'on ASSERTE que la liste est bien vide avant
    // de poser les fixtures : si le filtre `deleted_at IS NULL` fléchissait, ce
    // test échouerait ici plutôt que de se vider de son sens.
    await bd().query('UPDATE companies SET deleted_at = now() WHERE deleted_at IS NULL');
    expect(
      await compterEntreprisesVivantes(),
      'La liste doit être vide au départ : c’est ce qui rend la position des deux\n' +
        'homonymes — et donc la frontière de page qu’ils enjambent — DÉTERMINISTE.',
    ).toBe(0);

    const prefixe = 'Zêta Pagination factice';
    const noms = [
      `${prefixe} 01`,
      `${prefixe} 02`,
      `${prefixe} 03`, // homonyme A ─┐ avec `limit = 3`, la frontière de la
      `${prefixe} 03`, // homonyme B ─┘ première page tombe entre ces deux lignes
      `${prefixe} 04`,
      `${prefixe} 05`,
      `${prefixe} 06`,
    ];

    const attendus: string[] = [];
    for (const nom of noms) {
      const creee = await creer(admin.jeton, { name: nom });
      attendus.push(creee.ecriture.company.id);
    }
    expect(new Set(attendus).size, 'sept fiches distinctes, dont deux homonymes').toBe(7);

    const limite = 3;
    const vus: string[] = [];
    const pagesNonFinales: { readonly rang: number; readonly taille: number }[] = [];
    let curseur: string | null = null;
    let idInsereeAvantLeCurseur: string | null = null;
    let rang = 0;

    for (;;) {
      rang += 1;
      if (rang > 100) throw new Error('la pagination ne s’est pas terminée en 100 pages');

      const url =
        curseur === null
          ? `/v1/companies?limit=${String(limite)}`
          : `/v1/companies?limit=${String(limite)}&after=${encodeURIComponent(curseur)}`;
      const reponse = await appeler('GET', url, { jeton: admin.jeton });
      expect(reponse.statut, `page ${String(rang)} : ${reponse.corps}`).toBe(200);
      const lue = page(reponse);
      vus.push(...lue.items.map((item) => item.id));

      if (rang === 1) {
        // LE GARDE-FOU DE LA MISE EN SCÈNE. Sans lui, une dérive de l'ordre ou de
        // la taille de page déplacerait la frontière hors du couple d'homonymes et
        // le test resterait vert sans plus rien démontrer.
        expect(
          lue.items.map((item) => item.id),
          'La première page doit être EXACTEMENT les trois premières fixtures, donc\n' +
            'se terminer sur la PREMIÈRE des deux homonymes. C’est la seule\n' +
            'disposition où un curseur réduit au seul `name` se trahirait.',
        ).toStrictEqual(attendus.slice(0, 3));
      }

      if (lue.nextCursor === null) {
        expect(
          lue.items.length,
          'La dernière page rend au plus `limit` éléments. En rendre davantage\n' +
            'signifierait que la ligne excédentaire lue pour détecter la suite a été\n' +
            'servie au client.',
        ).toBeLessThanOrEqual(limite);
        break;
      }

      pagesNonFinales.push({ rang, taille: lue.items.length });
      curseur = lue.nextCursor;

      // L'insertion concurrente, une seule fois, APRÈS la première page.
      if (idInsereeAvantLeCurseur === null) {
        // AVANT le point de reprise : c'est celle qui ferait répéter une ligne à
        // une pagination par décalage. Elle ne doit PAS réapparaître.
        const avant = await creer(admin.jeton, {
          name: `${prefixe} 00 insérée en cours de parcours`,
        });
        idInsereeAvantLeCurseur = avant.ecriture.company.id;
        // APRÈS le point de reprise : elle a le droit d'apparaître.
        await creer(admin.jeton, { name: `${prefixe} 07 insérée en cours de parcours` });
      }
    }

    const tailles = pagesNonFinales.filter((p) => p.taille !== limite);
    expect(
      tailles.map((p) => `page ${String(p.rang)} : ${String(p.taille)} élément(s)`),
      'Une page qui rend MOINS que `limit` tout en fournissant un curseur suivant\n' +
        'signale une suite qui n’existe pas : le client boucle sur une page vide, ou\n' +
        'croit la liste plus longue qu’elle ne l’est. `nextCursor` non nul ⇒ la page\n' +
        'est pleine.',
    ).toStrictEqual([]);

    expect(
      rang,
      'Sept fiches par pages de trois : au moins trois pages. Moins signifierait que\n' +
        '`limit` n’est pas appliqué, et le test ne franchirait jamais la frontière\n' +
        'entre les deux homonymes — celle qu’il existe pour éprouver.',
    ).toBeGreaterThanOrEqual(3);

    const doublons = vus.filter((id, index) => vus.indexOf(id) !== index);
    expect(
      [...new Set(doublons)],
      'Aucun identifiant deux fois. Une ligne servie deux fois est le symptôme d’une\n' +
        'reprise par décalage : l’insertion faite avant le point de reprise a décalé\n' +
        'toute la liste.',
    ).toStrictEqual([]);

    const manquants = attendus.filter((id) => !vus.includes(id));
    expect(
      manquants,
      'Toutes les fiches qui EXISTAIENT avant l’insertion sont vues. C’est ici que se\n' +
        'joue le curseur composite : avec un curseur réduit au seul `name`, la\n' +
        'seconde des deux homonymes de la position 4 aurait été sautée — la reprise\n' +
        '« après le nom 03 » l’aurait enjambée. Elle serait absente d’une liste que\n' +
        'personne ne recompte, et R3 n’aurait plus rien à faire voir.',
    ).toStrictEqual([]);

    expect(
      idInsereeAvantLeCurseur,
      'L’insertion concurrente a bien eu lieu — sinon le test n’aurait éprouvé aucune\n' +
        'concurrence, et son titre mentirait.',
    ).not.toBeNull();
    expect(
      idInsereeAvantLeCurseur === null || vus.includes(idInsereeAvantLeCurseur),
      'La fiche insérée AVANT le point de reprise ne réapparaît pas. C’est la moitié\n' +
        'que la pagination par décalage rate : elle aurait décalé toute la liste d’un\n' +
        'rang et re-servi une ligne déjà lue.',
    ).toBe(false);
  });

  it('un curseur illisible, ou celui d’une autre liste, rend 400 INVALID_CURSOR', async () => {
    // Le curseur est OPAQUE mais NON SIGNÉ : un client peut en fabriquer un. Ce
    // n'est pas une fuite — le cadrage d'accès vit dans `config.acces` et dans le
    // dépôt — mais un curseur bruité ne doit pas être décodé « en quelque chose ».
    const admin = await creerCompte('admin', 'curseur-invalide');
    const curseurEtranger = Buffer.from(
      JSON.stringify(['missions', '2026-01-01', uuidv7()]),
    ).toString('base64url');

    const cas = ['pas-du-base64!!', 'YWJj', curseurEtranger];
    const anomalies: string[] = [];
    for (const curseur of cas) {
      const reponse = await appeler(
        'GET',
        `/v1/companies?limit=3&after=${encodeURIComponent(curseur)}`,
        { jeton: admin.jeton },
      );
      if (reponse.statut !== 400 || reponse.code !== 'INVALID_CURSOR') {
        anomalies.push(`« ${curseur} » → ${String(reponse.statut)} ${String(reponse.code)}`);
      }
    }

    expect(
      anomalies,
      'Un curseur d’une AUTRE ressource doit être refusé, pas décodé en silence : il\n' +
        'produirait une page absurde, et l’absurdité d’une page ne se voit pas.',
    ).toStrictEqual([]);
  });
});

// =============================================================================
// 9. PATCH — CE QUI CHANGE, CE QUI NE CHANGE PAS, ET UNE DÉCISION TENUE (INVARIANT 7)
// =============================================================================
describe('PATCH /v1/companies/:id', () => {
  it('une modification qui ne change RIEN ne bouscule pas `updated_at`', async () => {
    // `updated_at` date la dernière modification RÉELLE. La faire bouger sur un
    // `PATCH` qui renvoie les valeurs déjà en base rendrait la colonne inutilisable
    // pour un delta de synchronisation, et produirait une ligne d'audit décrivant
    // un non-événement.
    const admin = await creerCompte('admin', 'patch-neutre');
    const creee = await creer(admin.jeton, { name: 'Entreprise factice Xi', headcount: 12 });
    const id = creee.ecriture.company.id;

    const inchangee = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Xi', headcount: 12 },
    });
    expect(inchangee.statut).toBe(200);
    expect(ecriture(inchangee).company.updatedAt).toBe(creee.ecriture.company.updatedAt);

    const changee = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { headcount: 13 },
    });
    expect(changee.statut).toBe(200);
    expect(
      ecriture(changee).company.updatedAt,
      'Une modification RÉELLE, elle, doit bousculer l’horodatage — sinon le test\n' +
        'précédent serait vert avec un `updated_at` figé pour toujours.',
    ).not.toBe(creee.ecriture.company.updatedAt);
  });

  it('`null` EFFACE, un champ absent NE TOUCHE À RIEN', async () => {
    // Toute la différence entre un `PATCH` et un `PUT`. La confondre rendrait
    // impossible de retirer un SIREN saisi par erreur autrement qu’en écrivant
    // directement en base — et l’invariant 7 (« toute correction est une révision
    // tracée ») suppose qu’une correction soit possible PAR L’API.
    const admin = await creerCompte('admin', 'patch-null');
    const creee = await creer(admin.jeton, {
      name: 'Entreprise factice Omicron',
      siren: sirenFactice('50000000'),
      notes: 'note initiale',
    });
    const id = creee.ecriture.company.id;

    const efface = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { siren: null },
    });
    expect(efface.statut).toBe(200);
    const apres = ecriture(efface).company;
    expect(apres.siren, '`null` EFFACE').toBeNull();
    expect(apres.notes, 'un champ ABSENT du corps n’est pas touché').toBe('note initiale');
    expect(apres.name).toBe('Entreprise factice Omicron');
  });

  it('un `PATCH` vide est refusé en 400 — « j’ai modifié quelque chose, je ne sais pas quoi » n’est pas une trace', async () => {
    const admin = await creerCompte('admin', 'patch-vide');
    const creee = await creer(admin.jeton, { name: 'Entreprise factice Pi' });

    const refus = await appeler('PATCH', `/v1/companies/${creee.ecriture.company.id}`, {
      jeton: admin.jeton,
      charge: {},
    });
    expect(refus.statut).toBe(400);
    expect(refus.code).toBe('VALIDATION_FAILED');
  });

  it('@critique changer le code APE pour une division INCONNUE CONSERVE un secteur choisi à la main, et le signale (DECISIONS.md 2026-08-31)', async () => {
    // TRANCHÉ — `DECISIONS.md` 2026-08-31, « [L3a] Un `PATCH` de code APE vers une
    // division inconnue EFFACE un secteur choisi à la main », option 2, ratifiée à
    // la revue croisée de L3b (2026-09-02).
    //
    // Ce cas figeait jusque-là un COMPORTEMENT CONSTATÉ : le rejeu de R4 sur un
    // code APE dont la division est absente de `naf_sector_map` rendait `null`, et
    // ce `null` remplaçait le secteur en place. La règle est désormais l'inverse,
    // et c'est l'invariant 7 (« rien n'est jamais silencieusement écrasé ou
    // supprimé ») qui la fonde : un trou du référentiel est un fait
    // d'administration, il ne détruit pas une donnée saisie par un humain.
    //
    // Ce que le test tient :
    //   · le code APE est bien écrit (le `PATCH` n'est PAS refusé — option 3 écartée,
    //     un référentiel incomplet ne bloque pas une écriture légitime) ;
    //   · `sector_id` est INCHANGÉ — asserté sur la réponse ET en base, car une
    //     réponse qui renverrait l'ancienne valeur en lisant « avant » ne prouverait
    //     rien sur ce qui a été écrit ;
    //   · `secteurAQualifier` vaut `true` : le contrat d'API ne change pas, le
    //     signal « le secteur reste à qualifier » est exactement vrai ;
    //   · l'effacement DÉLIBÉRÉ reste possible par le chemin qui l'exprime, un
    //     `sectorId: null` explicite — contre-épreuve, sans laquelle « conserver »
    //     pourrait aussi bien vouloir dire « ne plus jamais pouvoir retirer ».
    const admin = await creerCompte('admin', 'patch-r4');
    const impose = await idSecteur('sante');
    const creee = await creer(admin.jeton, {
      name: 'Entreprise factice Rhô',
      sectorId: impose,
    });
    const id = creee.ecriture.company.id;
    expect(creee.ecriture.company.sectorId).toBe(impose);
    expect(
      await secteurDeLaDivision(DIVISION_NON_SEMEE),
      'La division doit être RÉELLEMENT absente du référentiel, sinon le test\n' +
        'éprouve le cas « code connu » sous le nom du cas « code inconnu ».',
    ).toBeNull();

    const modifiee = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { nafCode: APE_VALIDE_INCONNU },
    });
    expect(modifiee.statut).toBe(200);
    const apres = ecriture(modifiee);
    expect(apres.company.nafCode, 'le code APE est écrit : l’écriture n’est pas refusée').toBe(
      APE_VALIDE_INCONNU,
    );
    expect(
      apres.company.sectorId,
      'Le secteur choisi à la main est CONSERVÉ dans la réponse (invariant 7).',
    ).toBe(impose);
    expect(
      await secteurEnBase(id),
      'Et CONSERVÉ EN BASE : c’est la valeur écrite qui compte, pas celle que la\n' +
        'réponse recopie.',
    ).toBe(impose);
    expect(
      apres.secteurAQualifier,
      'Le contrat ne change pas : la division est inconnue, le secteur reste à\n' +
        'qualifier, et l’écran doit le savoir.',
    ).toBe(true);

    const effacement = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { sectorId: null },
    });
    expect(effacement.statut).toBe(200);
    expect(
      ecriture(effacement).company.sectorId,
      'L’effacement DÉLIBÉRÉ passe par un `sectorId: null` explicite — et lui seul.',
    ).toBeNull();
    expect(await secteurEnBase(id), 'effacé en base aussi').toBeNull();
  });

  it('une fiche inexistante rend 404, un identifiant non-UUID rend 400', async () => {
    const admin = await creerCompte('admin', 'patch-absente');

    const absente = await appeler('PATCH', `/v1/companies/${uuidv7()}`, {
      jeton: admin.jeton,
      charge: { notes: 'sans objet' },
    });
    expect(absente.statut).toBe(404);
    expect(absente.code).toBe('NOT_FOUND');

    const malforme = await appeler('GET', '/v1/companies/pas-un-uuid', { jeton: admin.jeton });
    expect(
      malforme.statut,
      'Un identifiant qui n’a pas la forme d’un UUID est une requête mal formée, pas\n' +
        'une ressource absente : le distinguer évite d’aller chercher en base une clé\n' +
        'qui ne peut correspondre à rien.',
    ).toBe(400);
  });
});
