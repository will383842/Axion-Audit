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
// ── AJOUT DU 2026-09-04 — LA SECONDE UNICITÉ, ET CE QU'ELLE A COÛTÉ ─────────
//   9. `companies.external_ref` a reçu son index unique partiel le 2026-09-03
//      (migration `0015`, amendement du 04 §7.1) SANS que les routes apprennent à
//      le nommer : une référence console en double sortait en 500 INTERNAL_ERROR
//      — « défaut ① », mesuré puis rendu aux producteurs. Les sections 10 à 13
//      ferment ce défaut et, surtout, le rendent irréversible : les deux 409 de
//      `companies` (SIREN et référence console) y sont éprouvés sur LES DEUX
//      chemins d'écriture, le cas de la fiche ARCHIVÉE qui retient sa référence y
//      est tenu, et le conflit DOUBLE y est exigé sans présumer lequel des deux
//      index mord le premier.
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
// RÉFÉRENCES CONSOLE FACTICES — invariant 2, jusque dans les fixtures
// -----------------------------------------------------------------------------

/**
 * Une référence console UNIQUE À L'EXÉCUTION.
 *
 * ── DEUX RAISONS DE NE PAS ÉCRIRE LA CHAÎNE À LA MAIN ───────────────────────
 *  1. `uq_companies_external_ref` est posé sur TOUTE la table, et les fichiers de
 *     ce projet partagent un conteneur : deux tests qui choisiraient la même
 *     constante se refuseraient l'un l'autre, et le second rougirait pour une
 *     raison qui n'est pas la sienne. Le compteur rend l'ordre des `it` sans effet.
 *  2. invariant 2 — aucune référence client réelle, même en fixture. `REF-FICTIVE`
 *     ne désigne rien ni personne, et se reconnaît d'un coup d'œil dans un dump.
 * La longueur reste très en deçà des 128 caractères du contrat.
 */
let compteurRef = 0;
function refFactice(marqueur: string): string {
  compteurRef += 1;
  return `REF-FICTIVE-${marqueur.toUpperCase()}-${String(compteurRef).padStart(3, '0')}`;
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

/**
 * Une ligne de `details[]`, TELLE QUE LA DÉCRIT 11 §3 — et non telle que la code le
 * dépôt. `code` y est OPTIONNEL et destiné à une MACHINE : c'est l'amendement de
 * convention du 2026-08-29 (`errorDetailSchema`), et c'est par lui que la console
 * distingue une fiche en conflit VIVANTE d'une fiche ARCHIVÉE sans avoir à lire le
 * français. Le champ était absent de cette enveloppe de test jusqu'au 2026-09-04 :
 * il n'était donc ni lu ni exigé, et un `code` absent serait passé inaperçu.
 */
const detailErreurSchema = z.object({
  path: z.string(),
  code: z.string().optional(),
  message: z.string(),
});
type DetailErreur = z.infer<typeof detailErreurSchema>;

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  /** Le message FRANÇAIS de l'enveloppe, ou `null` si la réponse n'est pas une erreur. */
  readonly message: string | null;
  readonly details: readonly DetailErreur[];
  readonly corps: string;
}

const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(detailErreurSchema).optional(),
  }),
});

/**
 * L'ENVELOPPE D'ERREUR, EXIGÉE AU MOT — clés comprises.
 *
 * Réécrite depuis 11 §3 (`{ error: { code, message, details? } }`) plutôt
 * qu'importée d'`@axion/shared` : importer `apiErrorSchema` reviendrait à demander
 * au sujet de valider sa propre réponse, exactement comme pour
 * `companyResponseSchema` plus haut. La différence avec `erreurSchema` ci-dessus est
 * la STRICTESSE : ici aucune clé supplémentaire n'est tolérée, à aucun niveau. Une
 * réponse d'erreur qui laisserait fuir un `stack`, un `statusCode` ou un fragment de
 * requête SQL passerait sans bruit à travers un schéma permissif.
 */
const enveloppeErreurStricteSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.strictObject({ path: z.string(), code: z.string().optional(), message: z.string() }))
      .optional(),
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
  let message: string | null = null;
  let details: readonly DetailErreur[] = [];
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
    if (analyse.success) {
      code = analyse.data.error.code;
      message = analyse.data.error.message;
      details = analyse.data.error.details ?? [];
    }
  }
  return { statut: reponse.statusCode, code, message, details, corps: reponse.body };
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

/**
 * Combien de LIGNES portent cette référence console — toutes lignes confondues,
 * archivées comprises.
 *
 * Le `WHERE` ne filtre PAS `deleted_at`, et c'est le cœur du sujet : l'index
 * `uq_companies_external_ref` ne l'exclut pas non plus (04 §7.1, migration `0015`).
 * Compter les seules fiches vivantes rendrait `0` sur le conflit le plus déroutant
 * des deux — celui dont la fiche coupable n'apparaît dans aucune liste — et le test
 * de la fiche archivée serait vert en ne mesurant rien.
 */
async function compterParRefExterne(externalRef: string): Promise<number> {
  const resultat = await bd().query<{ total: string }>(
    'SELECT count(*) AS total FROM companies WHERE external_ref = $1',
    [externalRef],
  );
  return Number(resultat.rows[0]?.total ?? '0');
}

/** La référence console RÉELLEMENT écrite en base — la réponse ne fait pas foi. */
async function refExterneEnBase(id: string): Promise<string | null> {
  const resultat = await bd().query<{ external_ref: string | null }>(
    'SELECT external_ref FROM companies WHERE id = $1',
    [id],
  );
  if (resultat.rowCount !== 1) throw new Error(`fiche ${id} absente`);
  return resultat.rows[0]?.external_ref ?? null;
}

/**
 * `true` si la fiche porte un `deleted_at` NON NUL.
 *
 * ── POURQUOI CE CONTRÔLE EXISTE ─────────────────────────────────────────────
 * Le cas « fiche archivée » se fabrique par un `UPDATE` direct (aucune route
 * n'écrit `deleted_at`). Si cette écriture ratait — mauvais identifiant, colonne
 * renommée, ligne déjà remplacée —, le test se poursuivrait contre une fiche
 * VIVANTE et attendrait `fiche_archivee` d'un code qui a raison de rendre
 * `fiche_active`. Il rougirait alors en accusant le mauvais coupable ; pire, s'il
 * n'exigeait que le statut 409, il serait VERT sans jamais avoir atteint sa
 * condition. On vérifie donc l'état AVANT d'en tirer une attente.
 */
async function estArchiveeEnBase(id: string): Promise<boolean> {
  const resultat = await bd().query<{ deleted_at: Date | null }>(
    'SELECT deleted_at FROM companies WHERE id = $1',
    [id],
  );
  const ligne = resultat.rows[0];
  if (ligne === undefined) throw new Error(`fiche ${id} absente`);
  return ligne.deleted_at !== null;
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

// =============================================================================
// 10. LA RÉFÉRENCE CONSOLE EN DOUBLE — FERMETURE DU DÉFAUT ① DU 2026-09-03
// =============================================================================
// AJOUTÉ LE 2026-09-04 par A16, qui n'a écrit AUCUNE ligne du correctif (09 §5.6).
//
// CE QUI S'EST PASSÉ, en une phrase : la migration `0015` a posé un SECOND index
// unique sur `companies` (`uq_companies_external_ref`, amendement du 04 §7.1) sans
// que les routes L3a apprennent à le nommer — une référence console en double ne
// tombait donc dans aucune branche de traduction et ressortait en **500
// INTERNAL_ERROR**. Ce n'est pas une inattention isolée : c'est la forme exacte que
// le commentaire de `depot.ts` annonçait au futur depuis le premier jour du lot.
//
// CE QUE CES TESTS TIENNENT, ET QU'AUCUNE RELECTURE NE TIENDRAIT :
//   · la traduction du SQLSTATE 23505 dépend de la remontée de la chaîne `cause` de
//     Drizzle, qui ne se voit qu'À L'EXÉCUTION contre un PostgreSQL réel. Le seul
//     verdict qui compte est donc « 409, jamais 500 » mesuré contre un conteneur ;
//   · le `PATCH` refait le chemin EN ENTIER, et ce n'est pas du zèle : il écrit sous
//     une transaction ouverte par un `SELECT … FOR UPDATE`, tandis que la lecture qui
//     enrichit le message part sur une connexion DISTINCTE de cette transaction. Deux
//     chemins, deux verdicts — un `POST` vert ne dit rien du `PATCH` ;
//   · la fiche ARCHIVÉE conserve sa référence console (l'index n'exclut pas
//     `deleted_at`, et c'est voulu, invariant 7). Le 409 doit alors NOMMER cette
//     fiche et orienter vers sa RESTAURATION — sans quoi le refus enverrait créer un
//     doublon sous une autre référence, exactement le désordre que la contrainte
//     existe pour empêcher.
//
// LES DEUX RÉÉCRITURES ASSUMÉES, par rapport à la liste des cas reçue :
//   1. « `apiErrorSchema` valide la réponse » devient « une enveloppe STRICTE
//      réécrite depuis 11 §3 valide la réponse ». Importer le schéma du sujet pour
//      juger le sujet est précisément ce que l'en-tête de ce fichier refuse : une
//      clé retirée du contrat disparaîtrait des deux côtés le même jour, et le test
//      resterait vert en n'exigeant plus rien. La version stricte exige PLUS que
//      l'originale — aucune clé surnuméraire, à aucun niveau ;
//   2. le cas « PATCH d'un SIREN déjà pris » n'appartient PAS au correctif de la
//      référence console. Il est écrit quand même, et à cet endroit, parce qu'il est
//      le trou de couverture que le correctif a rendu visible : le `PATCH` passe par
//      la même traduction que le `POST`, et personne ne l'avait jamais éprouvé sur
//      le SIREN. Un chemin non testé qui marche est un chemin qui marche par chance.
//
// Traçabilité : E18 (liaison clients axion-ia.com) · E43 (conventions d'API).
// =============================================================================
describe('POST /v1/companies — conflit de RÉFÉRENCE CONSOLE (E18, migration 0015)', () => {
  it('@critique une référence console déjà prise rend 409 COMPANY_EXTERNAL_REF_DUPLICATE — et plus jamais 500', async () => {
    // LA NON-RÉGRESSION LITTÉRALE DU DÉFAUT ①. Le statut est la première assertion du
    // test, et la seule dont l'échec se lit sans contexte : un 500 ici signifierait
    // que la contrainte a mordu et que personne ne l'a traduite — l'utilisateur
    // verrait « une erreur interne est survenue » là où il doit voir quoi corriger.
    const admin = await creerCompte('admin', 'ref-doublon');
    const ref = refFactice('doublon');

    const premiere = await creer(admin.jeton, {
      name: 'Entreprise factice Sigma A',
      externalRef: ref,
    });
    const idPremiere = premiere.ecriture.company.id;
    expect(
      await refExterneEnBase(idPremiere),
      'ANTI-VACUITÉ : la référence est RÉELLEMENT écrite en base. Si la création\n' +
        'l’avait silencieusement ignorée, le refus attendu ci-dessous n’aurait aucune\n' +
        'raison de se produire, et un 201 passerait pour un comportement correct.',
    ).toBe(ref);

    const seconde = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Sigma B', externalRef: ref },
    });

    expect(
      seconde.statut,
      'DÉFAUT ① — mesuré le 2026-09-03 : une référence console en double sortait en\n' +
        '500 INTERNAL_ERROR faute d’une branche de traduction pour\n' +
        '`uq_companies_external_ref`. Le statut d’un conflit d’ÉTAT est 409.',
    ).toBe(409);
    expect(
      seconde.code,
      'Un code À LUI, et non `COMPANY_DUPLICATE` étendu : les deux conflits ne se\n' +
        'réparent pas au même endroit, et un front qui devrait les distinguer en\n' +
        'analysant une phrase française est exactement ce que 11 §3 refuse.',
    ).toBe('COMPANY_EXTERNAL_REF_DUPLICATE');

    const enveloppe = enveloppeErreurStricteSchema.parse(JSON.parse(seconde.corps));
    expect(
      enveloppe.error.details?.length,
      'Le refus est ACTIONNABLE : une ligne de détail, et une seule. L’enveloppe est\n' +
        'validée STRICTEMENT — aucune clé surnuméraire, donc aucune fuite de trace\n' +
        'technique dans une réponse d’erreur.',
    ).toBe(1);
    expect(seconde.details.map((detail) => detail.path)).toStrictEqual(['externalRef']);
    expect(
      seconde.details[0]?.code,
      '`details[0].code` est pour une MACHINE : il dit que la fiche en conflit est\n' +
        'VIVANTE, donc que la suite est « rapprocher » et non « restaurer ».',
    ).toBe('fiche_active');
    expect(seconde.details[0]?.message).toContain(idPremiere);

    expect(
      await compterParRefExterne(ref),
      'Une seule ligne porte cette référence : la seconde création n’a rien laissé.',
    ).toBe(1);
  });

  it('@critique le message du conflit de référence console ne parle JAMAIS du SIREN', async () => {
    // CE N'EST PAS UN DÉTAIL DE RÉDACTION, C'EST LA DÉCISION ELLE-MÊME.
    // La solution paresseuse consistait à réutiliser `COMPANY_DUPLICATE` pour la
    // seconde contrainte. Elle a été écartée parce que son message parle du SIREN :
    // il aurait envoyé l'utilisateur vérifier un numéro correct pendant que la vraie
    // cause — la liaison M8.1 avec la console axion-ia.com — restait intacte. Le
    // dépôt écrit lui-même qu'« un message d'erreur faux envoie chercher au mauvais
    // endroit, ce qui coûte plus cher qu'un message absent ». Sans cette assertion
    // NÉGATIVE, rien n'empêche quiconque de refondre les deux 409 en un seul message
    // « générique » — et la décision serait perdue sans qu'un seul test rougisse.
    const admin = await creerCompte('admin', 'ref-message');
    const ref = refFactice('message');

    await creer(admin.jeton, { name: 'Entreprise factice Sigma Gamma', externalRef: ref });
    const refus = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Sigma Delta', externalRef: ref },
    });

    expect(refus.statut).toBe(409);
    expect(
      refus.message,
      'Le message nomme la RÉFÉRENCE CONSOLE — c’est le champ à corriger, et le seul.',
    ).toMatch(/référence console/i);
    expect(
      refus.message,
      'Et il ne prononce JAMAIS le mot SIREN : ce numéro n’est pour rien dans ce\n' +
        'conflit. Un message qui le nommerait ferait vérifier une donnée correcte.',
    ).not.toMatch(/siren/i);
    expect(
      refus.details.map((detail) => detail.path),
      'Le champ désigné est `externalRef`, pas `siren` : c’est ce chemin que la\n' +
        'console met en surbrillance dans le formulaire.',
    ).toStrictEqual(['externalRef']);
  });

  it('@critique deux créations CONCURRENTES sur la même référence console : exactement [201, 409]', async () => {
    // SYMÉTRIQUE EXACT DE LA COURSE DU SIREN, ET POUR LA MÊME RAISON.
    // Le refus n'est décidé ni par un `if` ni par une lecture préalable : il vient de
    // l'index unique partiel, sous la forme d'un SQLSTATE 23505 que Drizzle enveloppe
    // sans recopier `code` ni `constraint`. Deux requêtes simultanées sont la seule
    // disposition où une implémentation « je lis, puis j'écris » se trahit : elle
    // rendrait DEUX 201, et l'unicité de la liaison M8.1 n'existerait plus.
    //
    // CE QUE CE TEST NE PEUT PAS PROUVER, dit plutôt que sous-entendu : que les deux
    // requêtes se sont RÉELLEMENT chevauchées dans le temps. Rien, vu de l'extérieur,
    // ne l'observe. Ce qui est prouvé à la place, et qui suffit à écarter la vacuité :
    // le perdant NOMME le gagnant — donc les deux ont bien visé LA MÊME référence —
    // et la base n'en garde qu'une seule ligne.
    const admin = await creerCompte('admin', 'ref-course');
    const ref = refFactice('course');

    const [premiere, seconde] = await Promise.all([
      appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: 'Entreprise factice de course REF A', externalRef: ref },
      }),
      appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: 'Entreprise factice de course REF B', externalRef: ref },
      }),
    ]);

    const statuts = [premiere.statut, seconde.statut].sort((x, y) => x - y);
    expect(
      statuts,
      'Deux requêtes simultanées, une seule référence console : exactement une\n' +
        'création et un conflit. Ni deux 201 (l’unicité aurait cédé), ni un 500 (la\n' +
        'traduction aurait cédé). L’ordre n’est PAS présumé — la course est arbitrée\n' +
        'par la base, et laquelle des deux gagne n’a aucune importance.',
    ).toStrictEqual([201, 409]);

    const gagnante = premiere.statut === 201 ? premiere : seconde;
    const perdante = premiere.statut === 409 ? premiere : seconde;

    expect(perdante.code).toBe('COMPANY_EXTERNAL_REF_DUPLICATE');
    expect(perdante.details[0]?.code).toBe('fiche_active');
    expect(
      perdante.details[0]?.message,
      'ANTI-VACUITÉ : le perdant nomme le GAGNANT. Sans cette assertion, un conflit\n' +
        'survenu avec une TROISIÈME fiche — parce que la référence aurait fuité d’un\n' +
        'autre test — passerait pour le bon conflit.',
    ).toContain(ecriture(gagnante).company.id);

    expect(
      await compterParRefExterne(ref),
      'Une seule ligne porte cette référence console. Deux signifieraient que l’index\n' +
        'unique partiel de la migration `0015` n’arbitre plus rien.',
    ).toBe(1);
  });

  it('deux créations à `externalRef` NULL réussissent — l’index est PARTIEL, et c’est une règle métier', async () => {
    // LA NON-RÉGRESSION DE LA MOITIÉ QU'ON OUBLIE.
    // `uq_companies_external_ref` porte `WHERE external_ref IS NOT NULL` : le 04 §7
    // décrit la colonne comme « id client console axion-ia.com (NULL si local) », et
    // une fiche créée sur le terrain n'a légitimement aucun pendant dans la console.
    // Un correctif qui, en apprenant à refuser les doublons, se mettrait à traiter
    // `NULL` comme une valeur refuserait la MAJORITÉ des créations réelles — et il le
    // ferait le jour de la mise en production, pas ici.
    const admin = await creerCompte('admin', 'ref-nulle');

    const omise = await creer(admin.jeton, { name: 'Filiale factice sans liaison A' });
    const explicite = await creer(admin.jeton, {
      name: 'Filiale factice sans liaison B',
      externalRef: null,
    });

    expect(
      [omise.ecriture.company.externalRef, explicite.ecriture.company.externalRef],
      'Les DEUX formes de « pas de référence » sont éprouvées — champ absent et\n' +
        '`null` explicite —, parce qu’un contrat qui n’en accepterait qu’une\n' +
        'obligerait le front à deviner laquelle.',
    ).toStrictEqual([null, null]);
    expect(await refExterneEnBase(omise.ecriture.company.id)).toBeNull();
    expect(await refExterneEnBase(explicite.ecriture.company.id)).toBeNull();
    expect(
      omise.ecriture.company.id === explicite.ecriture.company.id,
      'deux fiches DISTINCTES, pas une fusion silencieuse',
    ).toBe(false);
  });

  it('une référence console LIBRE est acceptée et relue telle quelle', async () => {
    // Le chemin nominal, écrit APRÈS les refus et non avant : sans lui, tout ce qui
    // précède resterait vert avec une route qui refuserait TOUTES les références.
    const admin = await creerCompte('admin', 'ref-libre');
    const ref = refFactice('libre');

    const creee = await creer(admin.jeton, {
      name: 'Entreprise factice Sigma Libre',
      externalRef: ref,
    });
    expect(creee.reponse.statut).toBe(201);
    expect(creee.ecriture.company.externalRef).toBe(ref);

    const relue = await appeler('GET', `/v1/companies/${creee.ecriture.company.id}`, {
      jeton: admin.jeton,
    });
    expect(relue.statut).toBe(200);
    expect(
      fiche(relue).externalRef,
      'La référence traverse l’écriture ET la lecture sans être altérée : c’est une\n' +
        'clé de liaison, pas un libellé — un espace ajouté la casserait en silence.',
    ).toBe(ref);
  });
});

// =============================================================================
// 11. LE MÊME CONFLIT PAR `PATCH` — AUTRE CHEMIN, DONC AUTRE VERDICT
// =============================================================================
describe('PATCH /v1/companies/:id — les deux 409 d’unicité', () => {
  it('@critique poser une référence console DÉJÀ PRISE rend 409, et n’écrit rien', async () => {
    // POURQUOI REJOUER CE QUE LE `POST` A DÉJÀ PROUVÉ.
    // Le `PATCH` n'emprunte pas le même chemin : il travaille DANS une transaction
    // ouverte, après un `SELECT … FOR UPDATE` sur la fiche visée, et la lecture qui
    // enrichit le message part sur une connexion DISTINCTE de cette transaction. Un
    // `POST` vert ne dit donc rien de lui — et le défaut ① les touchait tous les deux
    // d'un seul manque, ce qui prouve surtout qu'aucun des deux n'était éprouvé.
    const admin = await creerCompte('admin', 'patch-ref-prise');
    const ref = refFactice('patch-prise');

    const detentrice = await creer(admin.jeton, {
      name: 'Entreprise factice Phi détentrice',
      externalRef: ref,
    });
    const candidate = await creer(admin.jeton, { name: 'Entreprise factice Phi candidate' });
    const idCandidate = candidate.ecriture.company.id;

    const refus = await appeler('PATCH', `/v1/companies/${idCandidate}`, {
      jeton: admin.jeton,
      charge: { externalRef: ref },
    });

    expect(refus.statut, 'Un 500 ici serait le défaut ① survivant dans le `PATCH`.').toBe(409);
    expect(refus.code).toBe('COMPANY_EXTERNAL_REF_DUPLICATE');
    expect(refus.details.map((detail) => detail.path)).toStrictEqual(['externalRef']);
    expect(refus.details[0]?.code).toBe('fiche_active');
    expect(refus.details[0]?.message).toContain(detentrice.ecriture.company.id);
    enveloppeErreurStricteSchema.parse(JSON.parse(refus.corps));

    expect(
      await refExterneEnBase(idCandidate),
      'LA TRANSACTION A ÉTÉ ANNULÉE EN ENTIER. Une fiche qui garderait une référence\n' +
        'à demi écrite après un 409 serait pire que le 500 d’origine : le refus\n' +
        'annoncerait un état que la base ne tiendrait pas.',
    ).toBeNull();

    const relue = await appeler('GET', `/v1/companies/${idCandidate}`, { jeton: admin.jeton });
    expect(relue.statut).toBe(200);
    expect(
      fiche(relue).updatedAt,
      'et `updated_at` n’a pas bougé : un refus n’est pas une modification, et une\n' +
        'ligne d’audit décrivant un non-événement rendrait le journal faux.',
    ).toBe(candidate.ecriture.company.updatedAt);
    expect(await compterParRefExterne(ref)).toBe(1);
  });

  it('un `PATCH` qui ne touche PAS à la référence console ne lève aucun conflit', async () => {
    // LE FAUX POSITIF QUE PERSONNE NE VERRAIT VENIR.
    // Une implémentation qui réécrirait systématiquement toutes les colonnes, ou qui
    // vérifierait l'unicité par une lecture préalable sans s'exclure elle-même,
    // rendrait 409 sur une fiche EN CONFLIT AVEC ELLE-MÊME. Le symptôme serait absurde
    // et rare : « impossible de corriger les notes d'une fiche liée à la console ».
    // Les deux formes sont éprouvées — champ absent, et champ répété à l'identique —,
    // parce qu'elles n'empruntent pas le même chemin dans le service.
    const admin = await creerCompte('admin', 'patch-ref-intacte');
    const ref = refFactice('intacte');

    const cible = await creer(admin.jeton, {
      name: 'Entreprise factice Chi',
      externalRef: ref,
      notes: 'note initiale',
    });
    const id = cible.ecriture.company.id;
    expect(
      await refExterneEnBase(id),
      'ANTI-VACUITÉ : la fiche porte VRAIMENT une référence console. Sur une fiche\n' +
        'sans référence, ce test serait vert sans avoir approché son sujet.',
    ).toBe(ref);

    const autreChamp = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { notes: 'note corrigée' },
    });
    expect(autreChamp.statut).toBe(200);
    expect(ecriture(autreChamp).company.externalRef).toBe(ref);
    expect(ecriture(autreChamp).company.notes).toBe('note corrigée');

    const memeReference = await appeler('PATCH', `/v1/companies/${id}`, {
      jeton: admin.jeton,
      charge: { externalRef: ref, notes: 'note corrigée deux fois' },
    });
    expect(
      memeReference.statut,
      'Répéter SA PROPRE référence n’est pas un conflit : une fiche ne se dédouble pas.',
    ).toBe(200);
    expect(await refExterneEnBase(id)).toBe(ref);
    expect(await compterParRefExterne(ref)).toBe(1);
  });

  it('mettre la référence console à `null` la LIBÈRE pour une autre fiche', async () => {
    // LA CONTRE-ÉPREUVE DE L'UNICITÉ : sans elle, « unique » pourrait aussi bien
    // vouloir dire « prise à jamais ». Or une liaison M8.1 se corrige — c'est
    // exactement le cas d'usage d'une `external_ref` mal saisie — et l'invariant 7
    // suppose que la correction passe PAR L'API, jamais par un `UPDATE` à la main.
    const admin = await creerCompte('admin', 'patch-ref-liberee');
    const ref = refFactice('liberee');

    const detentrice = await creer(admin.jeton, {
      name: 'Entreprise factice Psi détentrice',
      externalRef: ref,
    });
    const suivante = await creer(admin.jeton, { name: 'Entreprise factice Psi suivante' });

    const refusAvant = await appeler('PATCH', `/v1/companies/${suivante.ecriture.company.id}`, {
      jeton: admin.jeton,
      charge: { externalRef: ref },
    });
    expect(
      refusAvant.statut,
      'ANTI-VACUITÉ : la référence est bien PRISE avant d’être libérée. Sans ce refus\n' +
        'initial, le 200 final ne prouverait rien — il pourrait décrire une référence\n' +
        'qui n’a jamais été contestée.',
    ).toBe(409);

    const liberation = await appeler('PATCH', `/v1/companies/${detentrice.ecriture.company.id}`, {
      jeton: admin.jeton,
      charge: { externalRef: null },
    });
    expect(liberation.statut).toBe(200);
    expect(ecriture(liberation).company.externalRef).toBeNull();
    expect(await compterParRefExterne(ref), 'plus AUCUNE ligne ne retient la référence').toBe(0);

    const reprise = await appeler('PATCH', `/v1/companies/${suivante.ecriture.company.id}`, {
      jeton: admin.jeton,
      charge: { externalRef: ref },
    });
    expect(reprise.statut, 'la référence libérée est reprenable — sinon elle serait perdue').toBe(
      200,
    );
    expect(ecriture(reprise).company.externalRef).toBe(ref);
    expect(await compterParRefExterne(ref)).toBe(1);
  });

  it('@critique poser un SIREN DÉJÀ PRIS par `PATCH` rend 409 COMPANY_DUPLICATE', async () => {
    // LE TROU DE COUVERTURE, COMBLÉ ICI BIEN QU'IL N'APPARTIENNE PAS AU CORRECTIF.
    // Le conflit de SIREN n'était éprouvé qu'à la CRÉATION. Le `PATCH` écrit pourtant
    // la même colonne, sous la même contrainte, et passe par la même traduction —
    // mais dans une transaction, ce qui n'est pas le même chemin. Il marchait donc
    // sans que rien ne le tienne, et le défaut ① a montré ce que vaut une branche de
    // traduction que personne n'exécute : elle disparaît sans bruit.
    const admin = await creerCompte('admin', 'patch-siren-pris');
    const siren = sirenFactice('60000000');

    const detentrice = await creer(admin.jeton, {
      name: 'Entreprise factice Oméga détentrice',
      siren,
    });
    const candidate = await creer(admin.jeton, { name: 'Entreprise factice Oméga candidate' });
    const idCandidate = candidate.ecriture.company.id;

    const refus = await appeler('PATCH', `/v1/companies/${idCandidate}`, {
      jeton: admin.jeton,
      charge: { siren },
    });

    expect(refus.statut, 'Un doublon de SIREN est un conflit d’ÉTAT, par `PATCH` aussi.').toBe(409);
    expect(
      refus.code,
      'Et c’est bien le code du SIREN, pas celui de la référence console : les deux\n' +
        'contraintes vivent sur la même table et se confondraient sans peine.',
    ).toBe('COMPANY_DUPLICATE');
    expect(refus.details.map((detail) => detail.path)).toStrictEqual(['siren']);
    expect(refus.details[0]?.message).toContain(detentrice.ecriture.company.id);
    expect(
      await compterParSiren(siren),
      'Une seule ligne porte ce SIREN : la transaction refusée n’a rien écrit.',
    ).toBe(1);
  });
});

// =============================================================================
// 12. LA FICHE ARCHIVÉE — ELLE RETIENT SA RÉFÉRENCE, ET LE 409 LE DIT
// =============================================================================
// TRANCHÉ LE 2026-09-04. `uq_companies_external_ref` n'exclut pas `deleted_at` :
// une fiche archivée CONSERVE sa référence console, parce qu'une référence console
// désigne une ENTREPRISE et non une ligne vivante (invariant 7). La conséquence est
// inconfortable et assumée : le 409 nomme une fiche que toutes les lectures masquent.
// C'est le cas le plus déroutant des deux, donc le seul qui exige que le message
// dise ce qu'il faut FAIRE — restaurer, et non créer un doublon sous une autre
// référence, ce qui est précisément le désordre que la contrainte existe à empêcher.
//
// ⚠ AUCUNE ROUTE N'ÉCRIT `deleted_at` : l'archivage se fabrique par un `UPDATE`
// direct (`marquerSupprimee`). C'est une fabrication d'ÉTAT, jamais une fabrication
// de RÉSULTAT — et `estArchiveeEnBase` vérifie qu'elle a réellement eu lieu avant
// que le test n'en tire la moindre attente.
// =============================================================================
describe('conflit de référence console avec une fiche ARCHIVÉE (deleted_at IS NOT NULL)', () => {
  it('@critique un POST sur la référence d’une fiche archivée rend 409 `fiche_archivee` et oriente vers la RESTAURATION', async () => {
    const admin = await creerCompte('admin', 'ref-archivee-post');
    const ref = refFactice('archivee-post');

    const archivee = await creer(admin.jeton, {
      name: 'Entreprise factice Zêta archivée',
      externalRef: ref,
    });
    const idArchivee = archivee.ecriture.company.id;
    await marquerSupprimee(idArchivee);

    expect(
      await estArchiveeEnBase(idArchivee),
      'ANTI-VACUITÉ, et c’est le point le plus fragile de ce fichier : si l’archivage\n' +
        'n’avait pas eu lieu, le test attendrait `fiche_archivee` d’un code qui a\n' +
        'RAISON de rendre `fiche_active`. Il accuserait alors le mauvais coupable.',
    ).toBe(true);
    expect(
      await compterParRefExterne(ref),
      'Et la fiche archivée RETIENT sa référence — c’est la décision elle-même. Si\n' +
        'l’index excluait `deleted_at`, il n’y aurait aucun conflit à traduire, et\n' +
        'tout ce qui suit serait vert sans avoir rien éprouvé.',
    ).toBe(1);

    const refus = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Zêta nouvelle', externalRef: ref },
    });

    expect(refus.statut).toBe(409);
    expect(refus.code).toBe('COMPANY_EXTERNAL_REF_DUPLICATE');
    expect(
      refus.details[0]?.code,
      '`fiche_archivee`, et non `fiche_active` : la console doit pouvoir proposer\n' +
        '« restaurer » plutôt que « rapprocher » SANS analyser le français.',
    ).toBe('fiche_archivee');
    expect(
      refus.details[0]?.message,
      'La fiche coupable est NOMMÉE. C’est ce qui distingue un conflit constaté d’un\n' +
        'conflit actionnable — d’autant qu’aucune liste ne la montrera jamais.',
    ).toContain(idArchivee);
    expect(
      refus.message,
      'Le message DIT que la fiche est archivée. Un refus muet enverrait créer un\n' +
        'doublon sous une autre référence : exactement le désordre que la contrainte\n' +
        'existe pour empêcher.',
    ).toContain('ARCHIVÉE');
    expect(
      refus.message,
      'et il oriente vers la RESTAURATION, la seule suite juste dans ce cas',
    ).toMatch(/restaur/i);

    expect(
      await compterParRefExterne(ref),
      'Rien n’a été créé : la référence reste portée par la seule fiche archivée.',
    ).toBe(1);
  });

  it('@critique un PATCH vers la référence d’une fiche archivée rend le même 409 `fiche_archivee`', async () => {
    // Le `PATCH` refait le chemin par la transaction : la lecture d'état de la fiche
    // archivée s'y fait sur une connexion distincte du `tx`, et c'est la seule chose
    // qui distingue vraiment ce test du précédent. Elle suffit à l'exiger.
    const admin = await creerCompte('admin', 'ref-archivee-patch');
    const ref = refFactice('archivee-patch');

    const archivee = await creer(admin.jeton, {
      name: 'Entreprise factice Êta archivée',
      externalRef: ref,
    });
    const idArchivee = archivee.ecriture.company.id;
    await marquerSupprimee(idArchivee);
    expect(await estArchiveeEnBase(idArchivee), 'ANTI-VACUITÉ : l’archivage a eu lieu').toBe(true);
    expect(await compterParRefExterne(ref), 'et la référence est bien retenue').toBe(1);

    const vivante = await creer(admin.jeton, { name: 'Entreprise factice Êta vivante' });
    const idVivante = vivante.ecriture.company.id;

    const refus = await appeler('PATCH', `/v1/companies/${idVivante}`, {
      jeton: admin.jeton,
      charge: { externalRef: ref },
    });

    expect(refus.statut).toBe(409);
    expect(refus.code).toBe('COMPANY_EXTERNAL_REF_DUPLICATE');
    expect(refus.details[0]?.code).toBe('fiche_archivee');
    expect(refus.details[0]?.message).toContain(idArchivee);
    expect(refus.message).toContain('ARCHIVÉE');
    expect(refus.message).toMatch(/restaur/i);
    expect(
      await refExterneEnBase(idVivante),
      'La fiche vivante n’a rien reçu : le refus a annulé la transaction en entier.',
    ).toBeNull();
  });

  it('@critique le 409 NOMME une fiche que les lectures MASQUENT — et c’est voulu', async () => {
    // LA GARDE QUI EXISTE CONTRE UNE FUTURE « RÉPARATION ».
    // Un lecteur pressé constatera un jour l'incohérence apparente : l'API refuse une
    // référence au nom d'une fiche que `GET /v1/companies` ne montre pas et que
    // `GET /v1/companies/:id` déclare introuvable. La tentation sera de « corriger »
    // l'un des deux côtés — soit en excluant `deleted_at` de l'index (et une fiche
    // restaurée entrerait alors en conflit avec son propre doublon), soit en
    // remontrant les archives dans les listes. Les deux comportements sont ici
    // ENSEMBLE, dans un même test, pour qu'on ne puisse pas en changer un sans voir
    // l'autre. La cohérence n'est pas dans les lectures : elle est dans l'invariant 7.
    const admin = await creerCompte('admin', 'ref-archivee-masquee');
    const ref = refFactice('masquee');

    const archivee = await creer(admin.jeton, {
      name: 'Entreprise factice Thêta masquée',
      externalRef: ref,
    });
    const idArchivee = archivee.ecriture.company.id;
    await marquerSupprimee(idArchivee);
    expect(await estArchiveeEnBase(idArchivee), 'ANTI-VACUITÉ : l’archivage a eu lieu').toBe(true);

    const refus = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Thêta nouvelle', externalRef: ref },
    });
    expect(refus.statut).toBe(409);
    expect(refus.details[0]?.message, 'le 409 NOMME la fiche archivée').toContain(idArchivee);

    const lecture = await appeler('GET', `/v1/companies/${idArchivee}`, { jeton: admin.jeton });
    expect(
      lecture.statut,
      'La MÊME fiche, lue par son identifiant, reste introuvable. Le 409 ne rouvre\n' +
        'aucune porte de lecture : il rend un conflit actionnable, rien de plus.',
    ).toBe(404);
    expect(lecture.code).toBe('NOT_FOUND');

    const identifiants = await tousLesIdentifiants(admin.jeton, 50);
    expect(
      identifiants.includes(idArchivee),
      'Et elle n’apparaît sur AUCUNE page de la liste. Toutes les pages sont\n' +
        'parcourues : un filtre appliqué à la requête mais pas à la clause du curseur\n' +
        'passerait autrement inaperçu.',
    ).toBe(false);
  });
});

// =============================================================================
// 13. LE CONFLIT DOUBLE — UNE SEULE CONTRAINTE MORD À LA FOIS
// =============================================================================
describe('POST /v1/companies — SIREN pris ET référence console prise', () => {
  it('@critique un conflit double rend UN des deux 409 — sans présumer lequel — puis l’autre au rejeu', async () => {
    // POURQUOI CE TEST NE PRÉSUME RIEN.
    // PostgreSQL abandonne l'instruction à la PREMIÈRE violation rencontrée, et
    // l'ordre dans lequel il évalue les index N'EST PAS GARANTI : il dépend du plan,
    // de l'ordre de création des index, et peut changer d'une version à l'autre ou
    // après un `REINDEX`. Exiger `COMPANY_DUPLICATE` ici produirait un test qui passe
    // aujourd'hui et rougit demain — c'est-à-dire un test qui ment sur ce qu'il garde.
    //
    // CE QUI EST RÉELLEMENT EXIGÉ, et qui ne dépend d'aucun ordre :
    //   · le statut est 409 — jamais 500, la non-régression du défaut ① ;
    //   · le code est l'UN des deux, et le détail nomme le champ correspondant ;
    //   · après correction DU CHAMP NOMMÉ, le rejeu fait apparaître l'AUTRE 409.
    //     C'est cette troisième exigence qui a du prix : elle prouve que le second
    //     conflit n'a pas été perdu en route, et elle décrit le parcours réel de
    //     l'utilisateur — deux allers-retours, pas un.
    const admin = await creerCompte('admin', 'conflit-double');
    const siren = sirenFactice('61000000');
    const ref = refFactice('conflit-double');

    await creer(admin.jeton, { name: 'Entreprise factice Iota porteuse du SIREN', siren });
    await creer(admin.jeton, {
      name: 'Entreprise factice Iota porteuse de la référence',
      externalRef: ref,
    });
    expect(
      [await compterParSiren(siren), await compterParRefExterne(ref)],
      'ANTI-VACUITÉ : les DEUX conflits existent réellement avant la tentative. Si\n' +
        'l’un des deux manquait, ce test dégénérerait en simple conflit unique sans\n' +
        'que rien ne le signale.',
    ).toStrictEqual([1, 1]);

    const nomTente = 'Entreprise factice Iota doublement en conflit';
    const premierRefus = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: nomTente, siren, externalRef: ref },
    });

    expect(
      premierRefus.statut,
      'Le point qui compte : un conflit DOUBLE reste un 409. Un 500 signifierait que\n' +
        'la seconde violation a échappé à la traduction — la forme exacte du défaut ①.',
    ).toBe(409);
    const codesPossibles = ['COMPANY_DUPLICATE', 'COMPANY_EXTERNAL_REF_DUPLICATE'];
    expect(codesPossibles, 'l’un OU l’autre, jamais un troisième').toContain(premierRefus.code);
    const champNomme = premierRefus.code === 'COMPANY_DUPLICATE' ? 'siren' : 'externalRef';
    expect(
      premierRefus.details.map((detail) => detail.path),
      'Le détail nomme le champ COHÉRENT avec le code rendu : un code qui pointerait\n' +
        'l’autre colonne enverrait corriger une donnée correcte.',
    ).toStrictEqual([champNomme]);

    const sirenLibre = sirenFactice('61000001');
    const refLibre = refFactice('conflit-double-libre');
    const chargeCorrigee =
      premierRefus.code === 'COMPANY_DUPLICATE'
        ? { name: nomTente, siren: sirenLibre, externalRef: ref }
        : { name: nomTente, siren, externalRef: refLibre };

    const secondRefus = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: chargeCorrigee,
    });
    expect(secondRefus.statut).toBe(409);
    expect(
      secondRefus.code,
      'L’AUTRE conflit apparaît maintenant. S’il était resté silencieux, l’utilisateur\n' +
        'aurait corrigé un champ pour se voir refuser sans explication nouvelle — ou\n' +
        'pire, aurait cru le second conflit résolu.',
    ).not.toBe(premierRefus.code);
    expect(codesPossibles).toContain(secondRefus.code);

    expect(
      [await compterParSiren(siren), await compterParRefExterne(ref)],
      'Aucune ligne fantôme : les deux refus n’ont rien écrit.',
    ).toStrictEqual([1, 1]);

    const acceptee = await creer(admin.jeton, {
      name: nomTente,
      siren: sirenLibre,
      externalRef: refLibre,
    });
    expect(
      acceptee.reponse.statut,
      'Les DEUX champs corrigés, la création passe. Sans cette contre-épreuve, une\n' +
        'route qui refuserait tout ferait passer ce test en entier.',
    ).toBe(201);
    expect(acceptee.ecriture.company.externalRef).toBe(refLibre);
    expect(acceptee.ecriture.company.siren).toBe(sirenLibre);
  });
});

// =============================================================================
// 14. LA FICHE ARCHIVÉE, PAR SON SIREN — LA SYMÉTRIE, ET LE `code` SUR LES DEUX 409
// =============================================================================
// TRANCHÉ LE 2026-09-04 (« Le 409 de SIREN sur une fiche ARCHIVÉE, et le contrat de
// `details` »). La section 12 avait éprouvé la fiche archivée pour la RÉFÉRENCE
// CONSOLE seulement ; sur la même table, le SIREN — lui aussi retenu par
// `uq_companies_siren`, qui n'exclut pas `deleted_at` — rendait un 409 qui envoyait
// « Rapprochez les deux fiches » vers une fiche que `GET /:id` rend en 404, et sans
// `details[0].code`. Deux colonnes uniques, deux comportements : c'est ce défaut que
// cette section ferme, dans les deux sens —
//   · le SIREN d'une fiche ARCHIVÉE rend `fiche_archivee` et oriente vers la
//     RESTAURATION, par `POST` comme par `PATCH` (cas 1 et 2) ;
//   · le SIREN d'une fiche VIVANTE rend `fiche_active` (cas 3) — la moitié qui
//     manquait : aucune assertion des sections 1 et 11 ne LIT `code` sur ce 409, et
//     un `code` absent y passait donc inaperçu.
// Même fabrication d'état que la section 12 : `marquerSupprimee`, puis
// `estArchiveeEnBase` AVANT toute attente.
// =============================================================================
describe('conflit de SIREN avec une fiche ARCHIVÉE (deleted_at IS NOT NULL) — symétrie avec la référence console', () => {
  it('@critique un POST sur le SIREN d’une fiche archivée rend 409 `fiche_archivee` et oriente vers la RESTAURATION, jamais vers le rapprochement', async () => {
    const admin = await creerCompte('admin', 'siren-archivee-post');
    const siren = sirenFactice('62000000');

    const archivee = await creer(admin.jeton, {
      name: 'Entreprise factice Kappa archivée',
      siren,
    });
    const idArchivee = archivee.ecriture.company.id;
    await marquerSupprimee(idArchivee);

    expect(
      await estArchiveeEnBase(idArchivee),
      'ANTI-VACUITÉ : si l’archivage n’avait pas eu lieu, le test attendrait\n' +
        '`fiche_archivee` d’un code qui a RAISON de rendre `fiche_active`.',
    ).toBe(true);
    expect(
      await compterParSiren(siren),
      'La fiche archivée RETIENT son SIREN : `uq_companies_siren` n’exclut pas\n' +
        '`deleted_at`. Sans cette ligne, il n’y aurait aucun conflit à traduire.',
    ).toBe(1);

    const refus = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Kappa nouvelle', siren },
    });

    expect(refus.statut).toBe(409);
    expect(
      refus.code,
      'Le code du SIREN — pas celui de la référence console. La symétrie porte sur\n' +
        'le CONTENU du 409, jamais sur son code : les deux conflits ne se réparent\n' +
        'pas au même endroit.',
    ).toBe('COMPANY_DUPLICATE');
    expect(
      refus.details.map((detail) => detail.path),
      'Le détail nomme la colonne fautive, et elle seule.',
    ).toStrictEqual(['siren']);
    expect(
      refus.details[0]?.code,
      '`fiche_archivee` sur le 409 de SIREN, comme sur celui de la référence console :\n' +
        'un front qui branche sur `details[0].code` recevait `undefined` une fois sur\n' +
        'deux, pour la même table. C’est le défaut mesuré le 2026-09-04.',
    ).toBe('fiche_archivee');
    expect(
      refus.details[0]?.message,
      'La fiche coupable est NOMMÉE — d’autant plus nécessaire qu’aucune liste ne la\n' +
        'montrera jamais.',
    ).toContain(idArchivee);
    expect(
      refus.message,
      'Le message DIT que la fiche est archivée, sinon il envoie créer un doublon\n' +
        'sous un autre SIREN — le désordre exact que l’index existe pour empêcher.',
    ).toContain('ARCHIVÉE');
    expect(refus.message, 'et il oriente vers la RESTAURATION').toMatch(/restaur/i);
    expect(
      refus.message,
      'Et il ne dit PLUS « Rapprochez » : c’était le mot du défaut — rapprocher une\n' +
        'fiche que `GET /:id` rend en 404 n’est pas une suite possible.',
    ).not.toMatch(/rapproch/i);

    expect(
      await compterParSiren(siren),
      'Rien n’a été créé : le SIREN reste porté par la seule fiche archivée.',
    ).toBe(1);
  });

  it('@critique un PATCH vers le SIREN d’une fiche archivée rend le même 409 `fiche_archivee`', async () => {
    // Le `PATCH` refait le chemin par la transaction : la relecture de la fiche
    // archivée s'y fait HORS du `tx`, sur le pool — la seule différence avec le
    // `POST`, et elle suffit à l'exiger séparément (section 12, même raison).
    const admin = await creerCompte('admin', 'siren-archivee-patch');
    const siren = sirenFactice('63000000');

    const archivee = await creer(admin.jeton, {
      name: 'Entreprise factice Lambda archivée',
      siren,
    });
    const idArchivee = archivee.ecriture.company.id;
    await marquerSupprimee(idArchivee);
    expect(await estArchiveeEnBase(idArchivee), 'ANTI-VACUITÉ : l’archivage a eu lieu').toBe(true);
    expect(await compterParSiren(siren), 'et le SIREN est bien retenu').toBe(1);

    const vivante = await creer(admin.jeton, { name: 'Entreprise factice Lambda vivante' });
    const idVivante = vivante.ecriture.company.id;

    const refus = await appeler('PATCH', `/v1/companies/${idVivante}`, {
      jeton: admin.jeton,
      charge: { siren },
    });

    expect(refus.statut).toBe(409);
    expect(refus.code).toBe('COMPANY_DUPLICATE');
    expect(refus.details.map((detail) => detail.path)).toStrictEqual(['siren']);
    expect(refus.details[0]?.code).toBe('fiche_archivee');
    expect(refus.details[0]?.message).toContain(idArchivee);
    expect(refus.message).toContain('ARCHIVÉE');
    expect(refus.message).toMatch(/restaur/i);
    expect(refus.message).not.toMatch(/rapproch/i);

    const relue = await appeler('GET', `/v1/companies/${idVivante}`, { jeton: admin.jeton });
    expect(relue.statut).toBe(200);
    expect(
      fiche(relue).siren,
      'La fiche vivante n’a rien reçu : le refus a annulé la transaction en entier.',
    ).toBeNull();
    expect(await compterParSiren(siren), 'une seule ligne porte ce SIREN').toBe(1);
  });

  it('@critique le SIREN d’une fiche VIVANTE rend `fiche_active`, par POST comme par PATCH — le `code` est SYSTÉMATIQUE', async () => {
    // LA MOITIÉ QUI MANQUAIT. Les sections 1 et 11 exigent `path` et l'identifiant
    // dans `message` sur le 409 de SIREN — jamais `code`. Un `details` sans `code`
    // les traversait donc en vert, et c'est exactement ce que le dépôt rendait
    // jusqu'au 2026-09-04. Ce test lit `code`, et exige le mot du vocabulaire fermé
    // (`fiche_active`), pas seulement sa présence.
    const admin = await creerCompte('admin', 'siren-vivante-code');
    const siren = sirenFactice('64000000');

    const detentrice = await creer(admin.jeton, {
      name: 'Entreprise factice Mu détentrice',
      siren,
    });
    const idDetentrice = detentrice.ecriture.company.id;
    expect(
      await estArchiveeEnBase(idDetentrice),
      'ANTI-VACUITÉ, dans l’autre sens : la détentrice est VIVANTE. Une fiche\n' +
        'archivée par accident rendrait `fiche_archivee`, et ce test accuserait le\n' +
        'code d’un défaut qui n’existe pas.',
    ).toBe(false);

    const refusPost = await appeler('POST', '/v1/companies', {
      jeton: admin.jeton,
      charge: { name: 'Entreprise factice Mu nouvelle', siren },
    });
    expect(refusPost.statut).toBe(409);
    expect(refusPost.code).toBe('COMPANY_DUPLICATE');
    expect(refusPost.details.map((detail) => detail.path)).toStrictEqual(['siren']);
    expect(
      refusPost.details[0]?.code,
      '`fiche_active` — un mot du vocabulaire fermé, pour que la console propose\n' +
        '« rapprocher » sans lire le français. Ni `undefined`, ni un mot libre.',
    ).toBe('fiche_active');
    expect(refusPost.details[0]?.message).toContain(idDetentrice);
    expect(
      refusPost.message,
      'Sur une fiche vivante, la suite juste est le RAPPROCHEMENT — et surtout pas\n' +
        'la restauration d’une fiche qui n’a jamais été archivée.',
    ).toMatch(/rapproch/i);
    expect(refusPost.message).not.toContain('ARCHIVÉE');

    const candidate = await creer(admin.jeton, { name: 'Entreprise factice Mu candidate' });
    const refusPatch = await appeler('PATCH', `/v1/companies/${candidate.ecriture.company.id}`, {
      jeton: admin.jeton,
      charge: { siren },
    });
    expect(refusPatch.statut).toBe(409);
    expect(refusPatch.code).toBe('COMPANY_DUPLICATE');
    expect(refusPatch.details[0]?.code, 'même vocabulaire par `PATCH`').toBe('fiche_active');
    expect(refusPatch.details[0]?.message).toContain(idDetentrice);
    expect(refusPatch.message).toMatch(/rapproch/i);
    expect(refusPatch.message).not.toContain('ARCHIVÉE');

    expect(await compterParSiren(siren), 'aucun des deux refus n’a écrit').toBe(1);
  });
});

// =============================================================================
// 15. LE CHEMIN DÉGRADÉ — UN 409 SANS `details`, JAMAIS UN `details` PARTIEL
// =============================================================================
// LE CONTRAT (DECISIONS.md 2026-09-04, `ERROR_CODES.COMPANY_DUPLICATE`) : statut et
// `error.code` sont GARANTIS par la contrainte ; `details[0]` est relu APRÈS coup, et
// quand la fiche a disparu entre la violation et la relecture, le 409 sort SANS
// `details` — jamais avec un `details` sans `code`, jamais avec un état présumé.
//
// ── POURQUOI CE TEST EST DÉTERMINISTE, ET CE QU'IL NE FAIT PAS ──────────────
// Une course réelle ne se provoque pas de façon fiable : la relecture est un
// `SELECT`, et aucun verrou PostgreSQL ne bloque un `SELECT` sans bloquer aussi
// l'`INSERT` qui doit d'abord violer l'index (seul ACCESS EXCLUSIVE arrête une
// lecture, et il arrête tout). On ne peut donc pas, par la base seule, faire
// disparaître la fiche ENTRE la violation et la relecture — ni prouver que l'on y
// est arrivé. Un test qui lancerait un `DELETE` « au bon moment » serait vert par
// hasard, et rougirait par hasard.
//
// Ce test tient l'instant par une SONDE sur `pool.query` — la porte par laquelle
// Drizzle envoie TOUTE requête hors transaction, y compris la relecture. La sonde
// n'invente aucun résultat : quand elle reconnaît la relecture (le premier `SELECT`
// sur `companies` qui porte le SIREN en paramètre), elle SUPPRIME RÉELLEMENT la
// fiche, par la connexion du test, et attend que la suppression soit COMMISE ;
// puis elle laisse passer la requête d'origine, inchangée, vers le vrai PostgreSQL.
// La relecture s'exécute donc telle que le dépôt l'écrit, contre une base où la
// fiche n'existe plus. Ce n'est pas un double complaisant : c'est un double de
// CHRONOLOGIE, qui fixe l'ordre de deux événements réels.
//
// La chaîne de preuve, qui ne dépend d'aucun ordre non maîtrisé :
//   · le 409 prouve que l'`INSERT` a violé l'index AVANT la suppression (sinon il
//     aurait rendu 201) ;
//   · la sonde déclenchée UNE fois, et la ligne absente ensuite, prouvent que la
//     suppression a précédé la relecture ;
//   · `details` absent prouve le contrat — et sa forme est lue sur le CORPS BRUT,
//     par un schéma strict : ni `[]`, ni un objet sans `code`.
// =============================================================================
describe('409 d’unicité — chemin dégradé (la fiche en conflit disparaît entre la violation et la relecture)', () => {
  /**
   * Une requête telle que Drizzle la remet au pool : `{ text, ... }` puis les
   * paramètres. Réduite à ce que la sonde a besoin de voir ; le reste passe intact.
   */
  type RequeteDuPool = (
    config: { readonly text: string },
    valeurs?: readonly unknown[],
  ) => Promise<unknown>;

  /**
   * Installe la sonde : à la PREMIÈRE requête `SELECT` sur `companies` qui porte
   * `valeurRelue` en paramètre, supprime réellement `idASupprimer`, puis laisse la
   * requête passer. Rend le compteur de déclenchements et la fonction de retrait.
   */
  async function poserLaSonde(
    valeurRelue: string,
    idASupprimer: string,
  ): Promise<{ readonly declenchements: () => number; readonly retirer: () => void }> {
    const { pool } = await import('../src/db.js');
    const originale = pool.query.bind(pool) as RequeteDuPool;
    let compteur = 0;

    const remplacante: RequeteDuPool = async (config, valeurs) => {
      const estLaRelecture =
        compteur === 0 &&
        /^select\b/i.test(config.text) &&
        config.text.includes('"companies"') &&
        (valeurs ?? []).includes(valeurRelue);
      if (estLaRelecture) {
        compteur += 1;
        const suppression = await bd().query('DELETE FROM companies WHERE id = $1', [idASupprimer]);
        expect(suppression.rowCount, 'la fiche en conflit a RÉELLEMENT disparu').toBe(1);
      }
      return originale(config, valeurs);
    };

    // La sonde est posée comme propriété PROPRE de l'instance : `pool.query` est une
    // méthode du prototype, et Drizzle la résout à chaque appel. La retirer, c'est
    // effacer la propriété propre — le prototype reprend, sans rien recopier.
    expect(Object.hasOwn(pool, 'query'), 'aucune sonde antérieure ne traîne').toBe(false);
    pool.query = remplacante as typeof pool.query;
    return {
      declenchements: () => compteur,
      retirer: () => {
        Reflect.deleteProperty(pool, 'query');
        expect(Object.hasOwn(pool, 'query'), 'la sonde est retirée').toBe(false);
      },
    };
  }

  /** Le corps brut du 409, exigé au mot — c'est la FORME de `details` qui est jugée. */
  function enveloppeBrute(reponse: Reponse): z.infer<typeof enveloppeErreurStricteSchema> {
    return enveloppeErreurStricteSchema.parse(JSON.parse(reponse.corps));
  }

  it('@critique un POST dont la fiche en conflit disparaît avant la relecture rend 409 COMPANY_DUPLICATE SANS `details` — jamais un `details` sans `code`', async () => {
    const admin = await creerCompte('admin', 'siren-degrade-post');
    const siren = sirenFactice('65000000');

    const enConflit = await creer(admin.jeton, {
      name: 'Entreprise factice Nu qui va disparaître',
      siren,
    });
    const idEnConflit = enConflit.ecriture.company.id;
    expect(await compterParSiren(siren), 'ANTI-VACUITÉ : le conflit existe avant l’appel').toBe(1);

    const sonde = await poserLaSonde(siren, idEnConflit);
    let refus: Reponse;
    try {
      refus = await appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: 'Entreprise factice Nu nouvelle', siren },
      });
    } finally {
      sonde.retirer();
    }

    expect(
      sonde.declenchements(),
      'ANTI-VACUITÉ : la sonde a reconnu la relecture, une fois. Zéro signifierait\n' +
        'que le dépôt ne relit plus par ce chemin, et le test jugerait un autre\n' +
        'scénario que le sien.',
    ).toBe(1);
    expect(
      await compterParSiren(siren),
      'La fiche en conflit n’existe plus : la suppression a été commise AVANT la\n' +
        'relecture, c’est la sonde qui l’a attendue.',
    ).toBe(0);

    expect(
      refus.statut,
      'Le 409 est GARANTI par la contrainte, et il prouve l’ordre : l’INSERT a violé\n' +
        'l’index AVANT la suppression — sinon il aurait rendu 201.',
    ).toBe(409);
    expect(refus.code, '`error.code` est garanti aussi').toBe('COMPANY_DUPLICATE');
    expect(
      refus.message,
      'Aucun état présumé : sans fiche relue, le message est le GÉNÉRIQUE, pas\n' +
        'celui de l’archive.',
    ).not.toContain('ARCHIVÉE');

    const corps = enveloppeBrute(refus);
    expect(
      'details' in corps.error,
      'ABSENT — pas `[]`, pas `[{ path }]` sans `code`, pas `null`. Le contrat dit\n' +
        '« jamais partiel », et la clé elle-même ne doit pas figurer dans l’enveloppe.',
    ).toBe(false);
    expect(corps.error.details).toBeUndefined();
  });

  it('@critique un PATCH dont la fiche en conflit disparaît avant la relecture rend le même 409 sans `details`, et n’écrit rien', async () => {
    // Le `PATCH` échoue DANS une transaction encore ouverte quand la relecture part
    // sur le pool : la suppression par la connexion du test ne doit pas s'y heurter
    // (la transaction abandonnée ne verrouille pas la fiche en conflit — seulement
    // sa propre ligne), et le refus doit annuler la transaction en entier.
    const admin = await creerCompte('admin', 'siren-degrade-patch');
    const siren = sirenFactice('66000000');

    const enConflit = await creer(admin.jeton, {
      name: 'Entreprise factice Xi qui va disparaître',
      siren,
    });
    const idEnConflit = enConflit.ecriture.company.id;
    const candidate = await creer(admin.jeton, { name: 'Entreprise factice Xi candidate' });
    const idCandidate = candidate.ecriture.company.id;
    expect(await compterParSiren(siren), 'ANTI-VACUITÉ : le conflit existe avant l’appel').toBe(1);

    const sonde = await poserLaSonde(siren, idEnConflit);
    let refus: Reponse;
    try {
      refus = await appeler('PATCH', `/v1/companies/${idCandidate}`, {
        jeton: admin.jeton,
        charge: { siren },
      });
    } finally {
      sonde.retirer();
    }

    expect(sonde.declenchements(), 'ANTI-VACUITÉ : la relecture a été reconnue').toBe(1);
    expect(await compterParSiren(siren), 'la fiche en conflit n’existe plus').toBe(0);

    expect(refus.statut).toBe(409);
    expect(refus.code).toBe('COMPANY_DUPLICATE');
    expect(refus.message).not.toContain('ARCHIVÉE');
    const corps = enveloppeBrute(refus);
    expect('details' in corps.error, 'absent, jamais partiel').toBe(false);

    const relue = await appeler('GET', `/v1/companies/${idCandidate}`, { jeton: admin.jeton });
    expect(relue.statut).toBe(200);
    expect(
      fiche(relue).siren,
      'La candidate n’a PAS reçu le SIREN : le refus a annulé la transaction, même\n' +
        'si le SIREN est devenu libre entre-temps. Le 409 ne se rejoue pas tout seul.',
    ).toBeNull();
  });
});

// =============================================================================
// 16. LE CHEMIN DÉGRADÉ, L'AUTRE ÉTAT : LA RELECTURE **ÉCHOUE** (E18 · E43)
// =============================================================================
// LA DISTINCTION QUI FAIT TOUT LE TEST, et qui a manqué à la section 15.
//
// Il y a DEUX états dégradés, pas un, et ils ne passent pas par le même code :
//   · la relecture RÉUSSIT et ne trouve RIEN — la fiche a disparu (section 15).
//     `lignes[0] === undefined` → `return null` : chemin géré AVANT le correctif
//     B-2, et c'est celui que les deux tests de la section 15 construisent ;
//   · la relecture ÉCHOUE — elle ne rend aucun résultat, elle LÈVE. C'est le cas
//     que le correctif B-2 (`63c68bc`) traite par son `catch` (`depot.ts:303`), et
//     sa cause nommée est la SECONDE connexion du pool prise sous transaction
//     avortée : `max: 10`, `connectionTimeoutMillis: 5_000` (`db.ts`). Dix `PATCH`
//     conflictuels simultanés tiennent les dix connexions, la onzième expire.
//
// La revue A17 du 2026-09-05 (rejeu, B-2r) a MESURÉ que `depot.ts:303` n'était
// exécutée par AUCUN des 585 tests — `lcov.info` de la CI, run 33932745763, tête
// `e6af20a` — et en a tiré la conséquence exacte : « on peut supprimer le correctif
// B-2 et les 585 tests restent verts ». Un correctif de comportement que personne
// n'exécute disparaît sans bruit, et le contrat publié dans `packages/shared`
// redeviendrait faux en silence. Ces deux tests-ci sont ce qui l'en empêche.
//
// ── L'ASSERTION QUI DISTINGUE, ET SANS LAQUELLE CE SERAIT UN DOUBLON ─────────
// `compterParSiren === 1` APRÈS le refus : la fiche en conflit EST TOUJOURS LÀ.
// C'est la seule assertion qui sépare « la relecture a échoué » de « la relecture
// n'a rien trouvé » — les deux rendent le même 409 sans `details`, et sans ce
// compte, le test serait vert pour la mauvaise raison, exactement comme l'étaient
// les deux tests de la section 15 vis-à-vis de la ligne 303.
//
// ── PREUVE PAR BASCULE, rejouée le 2026-09-05 ───────────────────────────────
// `try/catch` de `lireFicheEnConflit` ôté (le `SELECT` rendu à `await` nu) : ces
// deux tests-ci, et EUX SEULS, rougissent en « expected 500 to be 409 » ; les 585
// autres restent verts. Le code de production a été restauré à l'identique
// (`git diff` vide sur `apps/api/src`). C'est la démonstration que la ligne 303
// est désormais COUVERTE, et non plus seulement présente.
// =============================================================================
describe('409 d’unicité — chemin dégradé (la relecture d’après coup ÉCHOUE : pool saturé)', () => {
  /** Une requête telle que Drizzle la remet au pool. Voir section 15. */
  type RequeteDuPool = (
    config: { readonly text: string },
    valeurs?: readonly unknown[],
  ) => Promise<unknown>;

  /**
   * La même sonde de chronologie qu'en section 15, à UN geste près : au lieu de
   * SUPPRIMER la fiche et de laisser passer la requête, elle REJETTE la promesse —
   * ce que fait le pool quand il ne peut plus servir de connexion. Le message imite
   * `node-postgres` au mot (`timeout exceeded when trying to connect`) pour que le
   * test échoue de la cause qu'il prétend reproduire, et non d'une erreur de
   * fantaisie qu'aucun pool ne produirait jamais.
   *
   * La reconnaissance est la même, donc discriminante de la même façon : premier
   * `SELECT` sur `"companies"` portant le SIREN du test en paramètre — un SIREN
   * factice unique par test, aucune reconnaissance croisée possible.
   */
  async function poserLaSondeQuiEchoue(
    valeurRelue: string,
  ): Promise<{ readonly declenchements: () => number; readonly retirer: () => void }> {
    const { pool } = await import('../src/db.js');
    const originale = pool.query.bind(pool) as RequeteDuPool;
    let compteur = 0;

    const remplacante: RequeteDuPool = (config, valeurs) => {
      const estLaRelecture =
        compteur === 0 &&
        /^select\b/i.test(config.text) &&
        config.text.includes('"companies"') &&
        (valeurs ?? []).includes(valeurRelue);
      if (estLaRelecture) {
        compteur += 1;
        return Promise.reject(new Error('timeout exceeded when trying to connect'));
      }
      return originale(config, valeurs);
    };

    // Garde décisif sous `singleFork` (`vitest.config.ts:93`) : `src/db.js` — et son
    // `pool` — est partagé par les 23 fichiers d'intégration du run. Une sonde qui
    // fuirait contaminerait tous les suivants ; celle-ci refuse de se poser sur une
    // autre, et se retire dans un `finally` avec assertion d'absence après.
    expect(Object.hasOwn(pool, 'query'), 'aucune sonde antérieure ne traîne').toBe(false);
    pool.query = remplacante as typeof pool.query;
    return {
      declenchements: () => compteur,
      retirer: () => {
        Reflect.deleteProperty(pool, 'query');
        expect(Object.hasOwn(pool, 'query'), 'la sonde est retirée').toBe(false);
      },
    };
  }

  /** Le corps brut du 409 : c'est la FORME de `details` qui est jugée, pas son contenu. */
  function corpsBrut(reponse: Reponse): z.infer<typeof enveloppeErreurStricteSchema> {
    return enveloppeErreurStricteSchema.parse(JSON.parse(reponse.corps));
  }

  it('@critique un POST dont la relecture ÉCHOUE rend 409 COMPANY_DUPLICATE sans `details` — et la fiche en conflit EXISTE TOUJOURS', async () => {
    const admin = await creerCompte('admin', 'siren-relecture-ko-post');
    const siren = sirenFactice('67000000');

    await creer(admin.jeton, { name: 'Entreprise factice Pi détentrice du SIREN', siren });
    expect(await compterParSiren(siren), 'ANTI-VACUITÉ : le conflit existe avant l’appel').toBe(1);

    const sonde = await poserLaSondeQuiEchoue(siren);
    let refus: Reponse;
    try {
      refus = await appeler('POST', '/v1/companies', {
        jeton: admin.jeton,
        charge: { name: 'Entreprise factice Pi seconde', siren },
      });
    } finally {
      sonde.retirer();
    }

    expect(
      sonde.declenchements(),
      'ANTI-VACUITÉ : la relecture a été reconnue, une fois. Zéro signifierait que le\n' +
        'dépôt ne relit plus par le pool, et le test jugerait un autre scénario.',
    ).toBe(1);

    expect(
      refus.statut,
      'SANS le `catch` de `lireFicheEnConflit` (`depot.ts:303`), l’échec de lecture\n' +
        'sortirait de `traduireEchecDeContrainte` et le gestionnaire rendrait 500 :\n' +
        'un conflit d’état déguisé en panne. C’est la bascule qui prouve ce test.',
    ).toBe(409);
    expect(refus.code, '`error.code` est GARANTI sans aucune lecture').toBe('COMPANY_DUPLICATE');
    expect(
      refus.message,
      'Aucun état présumé : sans fiche relue, le message est le GÉNÉRIQUE.',
    ).not.toContain('ARCHIVÉE');

    const corps = corpsBrut(refus);
    expect(
      'details' in corps.error,
      'ABSENT — pas `[]`, pas `[{ path }]` sans `code`, pas `null`. La clé elle-même\n' +
        'ne doit pas figurer dans l’enveloppe : le contrat dit « jamais partiel ».',
    ).toBe(false);
    expect(corps.error.details).toBeUndefined();

    expect(
      await compterParSiren(siren),
      'LE DISCRIMINANT (A17, B-2r) : la fiche en conflit est TOUJOURS LÀ. La relecture\n' +
        'a ÉCHOUÉ — elle n’a pas « rien trouvé ». Sans ce compte, ce test ne se\n' +
        'distinguerait pas de ceux de la section 15, et n’exécuterait pas la ligne 303.',
    ).toBe(1);
  });

  it('@critique un PATCH dont la relecture ÉCHOUE rend le même 409 sans `details`, n’écrit rien, et laisse la fiche en conflit en place', async () => {
    // Le cas NOMMÉ par le correctif : l'`UPDATE` est dans `db.transaction`, la
    // connexion de la transaction est avortée (`25P02`), la relecture part donc sur
    // une SECONDE connexion du pool — celle qui, pool saturé, n'arrive jamais.
    const admin = await creerCompte('admin', 'siren-relecture-ko-patch');
    const siren = sirenFactice('68000000');

    await creer(admin.jeton, { name: 'Entreprise factice Rhô détentrice du SIREN', siren });
    const candidate = await creer(admin.jeton, { name: 'Entreprise factice Rhô candidate' });
    const idCandidate = candidate.ecriture.company.id;
    expect(await compterParSiren(siren), 'ANTI-VACUITÉ : le conflit existe avant l’appel').toBe(1);

    const sonde = await poserLaSondeQuiEchoue(siren);
    let refus: Reponse;
    try {
      refus = await appeler('PATCH', `/v1/companies/${idCandidate}`, {
        jeton: admin.jeton,
        charge: { siren },
      });
    } finally {
      sonde.retirer();
    }

    expect(sonde.declenchements(), 'ANTI-VACUITÉ : la relecture a été reconnue').toBe(1);
    expect(refus.statut, 'sans le `catch`, ce serait 500').toBe(409);
    expect(refus.code).toBe('COMPANY_DUPLICATE');
    expect(refus.message).not.toContain('ARCHIVÉE');

    const corps = corpsBrut(refus);
    expect('details' in corps.error, 'absent, jamais partiel').toBe(false);
    expect(corps.error.details).toBeUndefined();

    expect(
      await compterParSiren(siren),
      'LE DISCRIMINANT : UNE seule fiche porte ce SIREN — la détentrice, toujours\n' +
        'vivante (la relecture a échoué, pas trouvé le vide) ET la candidate n’a rien\n' +
        'reçu (le refus a annulé la transaction en entier).',
    ).toBe(1);

    const relue = await appeler('GET', `/v1/companies/${idCandidate}`, { jeton: admin.jeton });
    expect(relue.statut).toBe(200);
    expect(fiche(relue).siren, 'la candidate n’a PAS reçu le SIREN').toBeNull();
  });
});
