// =============================================================================
// LOT L6 / INCRÉMENT L6c-1 « LES OCTETS » — LE PROTOCOLE DE CHUNKS §9.6, CÔTÉ
// SERVEUR, ÉPROUVÉ SUR UN POSTGRESQL ET UN MINIO RÉELS.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER A ÉTÉ ÉCRIT AVANT LE CODE QU'IL ÉPROUVE, ET SANS L'AVOIR LU.
// ═══════════════════════════════════════════════════════════════════════════════
// 09 §3-2 (TDD sur la sync et la propriété) et 09 §5.6 (le testeur n'est jamais
// l'auteur). Au moment de la rédaction, `apps/api/src/sync/chunks.ts` n'existe pas.
// Les attentes viennent de :
//   · 05 §9.6 — trois routes, idempotence par couple (id, index), `status` → reçus,
//     `complete {sha256}` → assemblage + checksum, échec → 409 + liste à réémettre ;
//   · 05 §9.8 scénario 7 — reprise d'un envoi interrompu à 80 % ;
//   · 05 §9.9 étendue aux chunks (DECISIONS 2026-10-09 [L6c] « Routes de chunks ») :
//     propriétaire = `conducted_by` de la session de la pièce, sinon `created_by`
//     pour une note volante ; non-membre ou pièce inconnue → 404 ;
//   · DECISIONS 2026-10-09 [L6c] D8 — `expire_le` = dernier morceau + 7 jours ;
//   · LOT_L6 PD8 — MinIO jamais exposé : aucune URL présignée ;
//   · 04 — `attachment_uploads` (S-6), `attachments.storage_key` ;
//   · le CONTRAT DE ROUTES transmis par la coordination le 2026-10-09 (corps,
//     réponses, 401/403/404/413/400).
//
// ── HYPOTHÈSES (le contrat est muet — TRACÉES, pas devinées) ──────────────────
//   H1. Le 409 porte `details` = TABLEAU D'ENTIERS triés, les index à réémettre
//       (« details porte la liste des index ») — pas d'objet enveloppe.
//   H2. Codes d'erreur NOUVEAUX, proposés à `packages/shared` `ERROR_CODES` :
//       `UPLOAD_CHUNKS_MISSING` (409, morceaux manquants) et
//       `UPLOAD_CHECKSUM_MISMATCH` (409, sha256 faux). Le 413 réutilise
//       `PAYLOAD_TOO_LARGE`, le 400 `VALIDATION_FAILED`, déjà au contrat.
//   H3. Après un sha256 faux, un morceau RÉÉMIS remplace l'ancien : sans cela,
//       « sha faux = tous à réémettre » ne pourrait jamais aboutir si la corruption
//       était dans un morceau. L'idempotence « renvoyer ne change rien » vaut pour
//       un envoi EN COURS ; ce test ne fige pas le cas d'un contenu différent au
//       même index pendant l'envoi (doute rapporté).
//   H4. L'admin NON membre : 403 ou 404 tolérés (§9.9 : l'admin corrige par l'API
//       siège, jamais par la sync ; le contrat ne tranche pas sa visibilité).
//   H5. « Second appareil » : le serveur ne connaît aucun identifiant d'appareil
//       sur ces routes ; un second jeton du même utilisateur en tient lieu.
//
// Invariant 2 : aucune référence client. Secrets factices (11 §2).
// Traçabilité : E7, E9 · invariants 1, 3 et 8 · scénario §9.8-7.
// =============================================================================
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ERROR_CODES, HTTP_STATUS_BY_ERROR_CODE } from '@axion/shared';
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
import { demarrerMinio, type MinioEssai } from './aide/minio-essai.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '7d'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '4e'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l6c@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

const MIO = 1024 * 1024;
const TAILLE_MORCEAU_MAX = 5 * MIO;
const SEPT_JOURS_MS = 7 * 24 * 3600 * 1000;

// =============================================================================
// CODES D'ERREUR — lus dans `ERROR_CODES`, jamais en littéral (11 §3)
// =============================================================================
/**
 * Un code PROPOSÉ (H2) n'existe pas encore dans `packages/shared` : un accès
 * typé casserait la compilation de tout le dépôt. On le lit donc par son nom et
 * on ÉCHOUE BRUYAMMENT s'il est absent — jamais un `undefined` qui égalerait un
 * autre `undefined` (faux vert).
 */
function codePropose(nom: string): string {
  const table = ERROR_CODES as Readonly<Record<string, string>>;
  const code = table[nom];
  if (code === undefined) {
    throw new Error(`ERROR_CODES.${nom} est absent de packages/shared (proposé par A16, H2)`);
  }
  return code;
}

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
let minio: MinioEssai | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}
function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}
function stock(): MinioEssai {
  if (minio === undefined) throw new Error('MinIO absent');
  return minio;
}

// =============================================================================
// APPELS DES ROUTES
// =============================================================================
const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

interface ReponseHttp {
  readonly statut: number;
  readonly corps: string;
  readonly json: unknown;
  readonly code: string | null;
  readonly details: readonly unknown[] | undefined;
  readonly entetes: Readonly<Record<string, unknown>>;
}

/** Toutes les réponses de la suite — la preuve PD8 les relit à la fin. */
const journalReponses: ReponseHttp[] = [];

let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.67.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

async function appeler(
  methode: 'GET' | 'POST',
  url: string,
  jeton: string | undefined,
  charge?: { readonly type: string; readonly corps: Buffer | string },
): Promise<ReponseHttp> {
  const reponse = await api().inject({
    method: methode,
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(charge === undefined ? {} : { 'content-type': charge.type }),
      ...(jeton === undefined ? {} : { authorization: `Bearer ${jeton}` }),
    },
    ...(charge === undefined ? {} : { payload: charge.corps }),
  });
  let json: unknown = null;
  let code: string | null = null;
  let details: readonly unknown[] | undefined;
  if (reponse.body !== '') {
    try {
      json = JSON.parse(reponse.body);
      const analyse = erreurSchema.safeParse(json);
      if (analyse.success) {
        code = analyse.data.error.code;
        details = analyse.data.error.details;
      }
    } catch {
      // corps non JSON : laissé tel quel, le verdict le dira.
    }
  }
  const r: ReponseHttp = {
    statut: reponse.statusCode,
    corps: reponse.body,
    json,
    code,
    details,
    entetes: reponse.headers,
  };
  journalReponses.push(r);
  return r;
}

function envoyerMorceau(
  jeton: string | undefined,
  pieceId: string,
  index: number | string,
  octets: Buffer,
): Promise<ReponseHttp> {
  return appeler('POST', `/v1/sync/attachments/${pieceId}/chunks/${String(index)}`, jeton, {
    type: 'application/octet-stream',
    corps: octets,
  });
}

function lireStatut(jeton: string | undefined, pieceId: string): Promise<ReponseHttp> {
  return appeler('GET', `/v1/sync/attachments/${pieceId}/status`, jeton);
}

function terminer(
  jeton: string | undefined,
  pieceId: string,
  corps: unknown,
): Promise<ReponseHttp> {
  return appeler('POST', `/v1/sync/attachments/${pieceId}/complete`, jeton, {
    type: 'application/json',
    corps: JSON.stringify(corps),
  });
}

const reponseMorceauSchema = z.object({ chunksRecus: z.array(z.number().int()) }).strict();
const reponseStatutSchema = z
  .object({
    statut: z.enum(['en_cours', 'assemble', 'echec', 'aucun']),
    chunksRecus: z.array(z.number().int()),
  })
  .strict();

function recus(r: ReponseHttp): number[] {
  expect(r.statut, r.corps).toBe(200);
  return reponseMorceauSchema.parse(r.json).chunksRecus;
}

function statutDe(r: ReponseHttp): z.infer<typeof reponseStatutSchema> {
  expect(r.statut, r.corps).toBe(200);
  return reponseStatutSchema.parse(r.json);
}

// =============================================================================
// OCTETS
// =============================================================================
function sha256(octets: Buffer): string {
  return createHash('sha256').update(octets).digest('hex');
}

/** Un fichier fictif découpé en morceaux de `taille` octets (le dernier plus court). */
function fichier(tailleTotale: number, taille: number): { tout: Buffer; morceaux: Buffer[] } {
  const tout = randomBytes(tailleTotale);
  const morceaux: Buffer[] = [];
  for (let debut = 0; debut < tailleTotale; debut += taille) {
    morceaux.push(tout.subarray(debut, Math.min(debut + taille, tailleTotale)));
  }
  return { tout, morceaux };
}

function morceau(liste: readonly Buffer[], i: number): Buffer {
  const m = liste[i];
  if (m === undefined) throw new Error(`morceau ${String(i)} absent`);
  return m;
}

// =============================================================================
// FIXTURES — SQL DIRECT (fabrication d'ÉTAT, jamais de RÉSULTAT)
// =============================================================================
type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';
type RoleSurMission = 'lead' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;
async function creerCompte(role: RoleUtilisateur): Promise<Compte> {
  compteurCompte += 1;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [
      id,
      `Compte L6c ${String(compteurCompte)}`,
      `compte.l6c.${String(compteurCompte)}@exemple.test`,
      role,
    ],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

let compteurMission = 0;
async function semerMission(): Promise<string> {
  compteurMission += 1;
  const entreprise = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    entreprise,
    `Entreprise fictive L6c ${String(compteurMission)}`,
  ]);
  const id = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', now(), now())`,
    [id, entreprise, `Mission fictive L6c ${String(compteurMission)}`],
  );
  return id;
}

async function rattacher(missionId: string, userId: string, role: RoleSurMission): Promise<void> {
  await bd().query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, role],
  );
}

async function semerUnite(missionId: string): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status,
                            created_at, updated_at)
     VALUES ($1, $2, NULL, 'service', $3, true, 'active', now(), now())`,
    [id, missionId, `Unite fictive ${id.slice(-6)}`],
  );
  return id;
}

let blocId = '';
async function semerQuestionDeMission(missionId: string): Promise<string> {
  const questionId = uuidv7();
  await bd().query(
    `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                            created_at, updated_at)
     VALUES ($1, $2, 1, 'active', $3, 'yes_no', 'banque', now(), now())`,
    [questionId, blocId, `Question fictive ${questionId.slice(-6)}`],
  );
  const missionQuestionId = uuidv7();
  await bd().query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                    answer_type_snapshot, position, added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, 'yes_no', 1, false)`,
    [missionQuestionId, missionId, questionId, `Question fictive ${questionId.slice(-6)}`],
  );
  return missionQuestionId;
}

const T_SEMIS = '2026-09-30T08:00:00.000Z';

async function semerEntretien(
  missionId: string,
  orgUnitId: string,
  conduitPar: string,
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id, schedule_status,
                             status, general_notes, client_created_at, client_updated_at,
                             created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, 'realise', 'en_cours', 'notes semées',
             $5, $5, now(), now())`,
    [id, missionId, conduitPar, orgUnitId, T_SEMIS],
  );
  return id;
}

async function semerReponse(interviewId: string, missionQuestionId: string): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO answers (id, interview_id, mission_question_id, value, client_created_at,
                          client_updated_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $5, now(), now())`,
    [id, interviewId, missionQuestionId, JSON.stringify({ type: 'yes_no', v: true }), T_SEMIS],
  );
  return id;
}

/** Une PHOTO dont la ligne de métadonnées est déjà montée (push JSON), octets absents. */
async function semerPhoto(
  missionId: string,
  creePar: string,
  rattachement: { readonly interviewId: string | null; readonly answerId: string | null },
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO attachments (id, interview_id, answer_id, mission_id, kind, filename, mime,
                              size_bytes, storage_key, created_by, client_created_at,
                              client_updated_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'photo', 'photo-fictive.jpg', 'image/jpeg', NULL, NULL, $5, $6, $6,
             now(), now())`,
    [id, rattachement.interviewId, rattachement.answerId, missionId, creePar, T_SEMIS],
  );
  return id;
}

/**
 * LE MONDE D'UNE ÉPREUVE — frais à chaque test.
 *   A   : consultant, membre `consultant`, conduit `entretienA` ;
 *   B   : consultant, membre `consultant`, conduit `entretienB` ;
 *   LD  : consultant, membre `lead` (lit tout, n'écrit pas par la sync, §9.9) ;
 *   LE  : lecteur, membre `lecteur` ;
 *   AN  : analyste, membre `analyste` ;
 *   ADM : admin, membre `lead` ;
 *   AD  : admin, NON membre ;
 *   X   : consultant NON membre.
 * Pièces :
 *   photoA        — rattachée à `entretienA`, créée par A ;
 *   photoAParB    — rattachée à `entretienA`, `created_by` = B : la SESSION décide (A) ;
 *   photoReponseA — rattachée à une RÉPONSE de `entretienA` seulement, créée par B ;
 *   volanteA      — note volante (aucun rattachement), créée par A ;
 *   photoB        — rattachée à `entretienB`, créée par B.
 */
interface Monde {
  readonly missionId: string;
  readonly A: Compte;
  readonly B: Compte;
  readonly LD: Compte;
  readonly LE: Compte;
  readonly AN: Compte;
  readonly ADM: Compte;
  readonly AD: Compte;
  readonly X: Compte;
  readonly photoA: string;
  readonly photoAParB: string;
  readonly photoReponseA: string;
  readonly volanteA: string;
  readonly photoB: string;
}

async function semerMonde(): Promise<Monde> {
  const missionId = await semerMission();
  const A = await creerCompte('consultant');
  const B = await creerCompte('consultant');
  const LD = await creerCompte('consultant');
  const LE = await creerCompte('lecteur');
  const AN = await creerCompte('analyste');
  const ADM = await creerCompte('admin');
  const AD = await creerCompte('admin');
  const X = await creerCompte('consultant');
  await rattacher(missionId, A.id, 'consultant');
  await rattacher(missionId, B.id, 'consultant');
  await rattacher(missionId, LD.id, 'lead');
  await rattacher(missionId, LE.id, 'lecteur');
  await rattacher(missionId, AN.id, 'analyste');
  await rattacher(missionId, ADM.id, 'lead');
  const racine = await semerUnite(missionId);
  const mq = await semerQuestionDeMission(missionId);
  const entretienA = await semerEntretien(missionId, racine, A.id);
  const entretienB = await semerEntretien(missionId, racine, B.id);
  const reponseA = await semerReponse(entretienA, mq);
  return {
    missionId,
    A,
    B,
    LD,
    LE,
    AN,
    ADM,
    AD,
    X,
    photoA: await semerPhoto(missionId, A.id, { interviewId: entretienA, answerId: null }),
    photoAParB: await semerPhoto(missionId, B.id, { interviewId: entretienA, answerId: null }),
    photoReponseA: await semerPhoto(missionId, B.id, { interviewId: null, answerId: reponseA }),
    volanteA: await semerPhoto(missionId, A.id, { interviewId: null, answerId: null }),
    photoB: await semerPhoto(missionId, B.id, { interviewId: entretienB, answerId: null }),
  };
}

// -----------------------------------------------------------------------------
// PHOTOGRAPHIE DE L'ÉTAT
// -----------------------------------------------------------------------------
type Ligne = Record<string, unknown>;

async function envoi(pieceId: string): Promise<Ligne | undefined> {
  const r = await bd().query<Ligne>('SELECT * FROM attachment_uploads WHERE attachment_id = $1', [
    pieceId,
  ]);
  return r.rows[0];
}

async function cleDeStockage(pieceId: string): Promise<string | null> {
  const r = await bd().query<{ storage_key: string | null }>(
    'SELECT storage_key FROM attachments WHERE id = $1',
    [pieceId],
  );
  return r.rows[0]?.storage_key ?? null;
}

/** Ce qu'un refus ne doit JAMAIS toucher : la ligne d'envoi, la pièce, le bucket. */
async function empreinte(pieceId: string): Promise<string> {
  const piece = await bd().query('SELECT * FROM attachments WHERE id = $1', [pieceId]);
  return JSON.stringify({
    envoi: (await envoi(pieceId)) ?? null,
    piece: piece.rows,
    objets: await stock().objets(),
  });
}

/**
 * GARDE ANTI-FAUX-VERT. Un refus 403/404 serait VERT contre une route ABSENTE.
 * Chaque test de refus prouve d'abord que la route vit : le propriétaire y dépose
 * un morceau sur une pièce TÉMOIN (jamais celle qu'on éprouve).
 */
async function exigerRouteVivante(proprietaire: Compte, pieceTemoin: string): Promise<void> {
  const r = await envoyerMorceau(proprietaire.jeton, pieceTemoin, 0, Buffer.from('temoin'));
  expect(r.statut, `la route de chunks ne vit pas : ${r.corps}`).toBe(200);
}

/** Envoie tous les morceaux puis `complete` ; rend la réponse de `complete`. */
async function envoyerTout(
  jeton: string,
  pieceId: string,
  morceaux: readonly Buffer[],
): Promise<ReponseHttp> {
  for (let i = 0; i < morceaux.length; i += 1) {
    const r = await envoyerMorceau(jeton, pieceId, i, morceau(morceaux, i));
    expect(r.statut, r.corps).toBe(200);
  }
  return terminer(jeton, pieceId, {
    sha256: sha256(Buffer.concat([...morceaux])),
    chunks: morceaux.length,
  });
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);
  minio = await demarrerMinio();
  const base = await creerBaseEphemere('l6c_chunks');
  nomBase = base.nom;
  await appliquerMontee(base.url);
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);
  client = await connecter(base.url);

  const [bloc] = (await bd().query<{ id: string }>('SELECT id FROM blocks ORDER BY id LIMIT 1'))
    .rows;
  if (bloc === undefined) throw new Error('le seed L1 ne porte aucun bloc (`blocks`)');
  blocId = bloc.id;

  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;
  minio.exporterEnvironnement();

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
  if (minio !== undefined) await minio.arreter();
});

// =============================================================================
// 0. LES CODES D'ERREUR DU LOT EXISTENT ET ONT LEUR STATUT (11 §3)
// =============================================================================
describe('L6c · codes d’erreur des chunks (11 §3)', () => {
  it('UPLOAD_CHUNKS_MISSING et UPLOAD_CHECKSUM_MISMATCH sont déclarés, en 409', () => {
    for (const nom of ['UPLOAD_CHUNKS_MISSING', 'UPLOAD_CHECKSUM_MISMATCH']) {
      const code = codePropose(nom);
      expect(code).toBe(nom);
      expect((HTTP_STATUS_BY_ERROR_CODE as Readonly<Record<string, number>>)[code]).toBe(409);
    }
  });
});

// =============================================================================
// 1. AUTHENTIFICATION ET PROPRIÉTÉ — MATRICE EXHAUSTIVE (§9.9 étendue)
// =============================================================================
describe('L6c · chunks — authentification et propriété §9.9 @critique', () => {
  it('sans jeton → 401 UNAUTHENTICATED sur les trois routes, rien n’est écrit @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m.A, m.volanteA);
    const avant = await empreinte(m.photoA);
    const reponses = [
      await envoyerMorceau(undefined, m.photoA, 0, Buffer.from('octets')),
      await lireStatut(undefined, m.photoA),
      await terminer(undefined, m.photoA, { sha256: sha256(Buffer.from('octets')), chunks: 1 }),
    ];
    for (const r of reponses) {
      expect(r.statut, r.corps).toBe(401);
      expect(r.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    }
    expect(await empreinte(m.photoA)).toBe(avant);
  });

  /**
   * LA MATRICE : chaque acteur × chaque route, sur une pièce de la session de A.
   * Seul A passe. Un membre non propriétaire → 403 ; un non-membre → 404 ; l'admin
   * non membre → 403 ou 404 (H4). Aucun refus n'écrit quoi que ce soit.
   */
  it('matrice acteurs × routes : seul le propriétaire de la session passe @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m.A, m.volanteA);
    const octets = Buffer.from('octets de la matrice');
    const attendus: readonly { nom: string; compte: Compte; statuts: readonly number[] }[] = [
      { nom: 'B (consultant membre, autre session)', compte: m.B, statuts: [403] },
      { nom: 'LD (lead de mission)', compte: m.LD, statuts: [403] },
      { nom: 'LE (lecteur membre)', compte: m.LE, statuts: [403] },
      { nom: 'AN (analyste membre)', compte: m.AN, statuts: [403] },
      { nom: 'ADM (admin membre lead)', compte: m.ADM, statuts: [403] },
      { nom: 'AD (admin non membre)', compte: m.AD, statuts: [403, 404] },
      { nom: 'X (consultant non membre)', compte: m.X, statuts: [404] },
    ];
    const avant = await empreinte(m.photoA);
    for (const { nom, compte, statuts } of attendus) {
      const reponses = [
        ['chunk', await envoyerMorceau(compte.jeton, m.photoA, 0, octets)],
        ['status', await lireStatut(compte.jeton, m.photoA)],
        ['complete', await terminer(compte.jeton, m.photoA, { sha256: sha256(octets), chunks: 1 })],
      ] as const;
      for (const [route, r] of reponses) {
        expect(statuts, `${nom} sur ${route} : ${String(r.statut)} ${r.corps}`).toContain(r.statut);
        expect(r.code, `${nom} sur ${route}`).toBe(
          r.statut === 403 ? ERROR_CODES.FORBIDDEN : ERROR_CODES.NOT_FOUND,
        );
      }
    }
    expect(await empreinte(m.photoA), 'un refus a écrit quelque chose').toBe(avant);

    // Et le propriétaire, lui, passe sur les trois.
    const complet = await envoyerTout(m.A.jeton, m.photoA, [octets]);
    expect(complet.statut, complet.corps).toBe(200);
    expect(statutDe(await lireStatut(m.A.jeton, m.photoA)).statut).toBe('assemble');
  });

  it('la SESSION décide, pas `created_by` : pièce de la session de A créée par B → A passe, B 403 @critique', async () => {
    const m = await semerMonde();
    const avant = await empreinte(m.photoAParB);
    const refus = await envoyerMorceau(m.B.jeton, m.photoAParB, 0, Buffer.from('b'));
    expect(refus.statut, refus.corps).toBe(403);
    expect(refus.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(await empreinte(m.photoAParB)).toBe(avant);
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoAParB, 0, Buffer.from('a')))).toEqual([0]);
  });

  it('pièce rattachée à une RÉPONSE seule : la session de la réponse décide (A), pas son créateur (B) @critique', async () => {
    const m = await semerMonde();
    const refus = await envoyerMorceau(m.B.jeton, m.photoReponseA, 0, Buffer.from('b'));
    expect(refus.statut, refus.corps).toBe(403);
    expect(refus.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(await envoi(m.photoReponseA)).toBeUndefined();
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoReponseA, 0, Buffer.from('a')))).toEqual([
      0,
    ]);
  });

  it('note volante sans session : son créateur (A) passe, un autre membre (B) 403 @critique', async () => {
    const m = await semerMonde();
    const refus = await envoyerMorceau(m.B.jeton, m.volanteA, 0, Buffer.from('b'));
    expect(refus.statut, refus.corps).toBe(403);
    expect(refus.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(await envoi(m.volanteA)).toBeUndefined();
    const ok = await envoyerTout(m.A.jeton, m.volanteA, [Buffer.from('volante')]);
    expect(ok.statut, ok.corps).toBe(200);
  });

  it('symétrie : B propriétaire de SA pièce passe, A y est refusé 403 @critique', async () => {
    const m = await semerMonde();
    const refus = await lireStatut(m.A.jeton, m.photoB);
    expect(refus.statut, refus.corps).toBe(403);
    expect(refus.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(statutDe(await lireStatut(m.B.jeton, m.photoB)).statut).toBe('aucun');
  });

  it('pièce inconnue (jamais poussée) → 404 NOT_FOUND sur les trois routes, rien n’est créé @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m.A, m.volanteA);
    const inconnue = uuidv7();
    const objetsAvant = await stock().objets();
    const reponses = [
      await envoyerMorceau(m.A.jeton, inconnue, 0, Buffer.from('x')),
      await lireStatut(m.A.jeton, inconnue),
      await terminer(m.A.jeton, inconnue, { sha256: sha256(Buffer.from('x')), chunks: 1 }),
    ];
    for (const r of reponses) {
      expect(r.statut, r.corps).toBe(404);
      expect(r.code).toBe(ERROR_CODES.NOT_FOUND);
    }
    expect(await envoi(inconnue)).toBeUndefined();
    expect(await stock().objets()).toEqual(objetsAvant);
  });

  it('un second appareil du MÊME utilisateur reprend l’envoi commencé par le premier @critique', async () => {
    const m = await semerMonde();
    const { tout, morceaux } = fichier(3 * 1000 + 17, 1000);
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoA, 0, morceau(morceaux, 0)))).toEqual([0]);
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoA, 1, morceau(morceaux, 1)))).toEqual([
      0, 1,
    ]);

    // H5 : un second jeton, frappé une seconde plus tard (iat distinct).
    await new Promise((r) => setTimeout(r, 1_100));
    const second = api().jwt.sign({ sub: m.A.id });
    expect(second).not.toBe(m.A.jeton);

    const vu = statutDe(await lireStatut(second, m.photoA));
    expect(vu).toEqual({ statut: 'en_cours', chunksRecus: [0, 1] });
    expect(recus(await envoyerMorceau(second, m.photoA, 2, morceau(morceaux, 2)))).toEqual([
      0, 1, 2,
    ]);
    expect(recus(await envoyerMorceau(second, m.photoA, 3, morceau(morceaux, 3)))).toEqual([
      0, 1, 2, 3,
    ]);
    const fin = await terminer(second, m.photoA, { sha256: sha256(tout), chunks: 4 });
    expect(fin.statut, fin.corps).toBe(200);
    expect(fin.json).toEqual({ statut: 'assemble' });
  });
});

// =============================================================================
// 2. VALIDATION DES ENTRÉES — 400 / 413
// =============================================================================
describe('L6c · chunks — validation des entrées', () => {
  it('index négatif, décimal ou non numérique → 400 VALIDATION_FAILED, rien n’est écrit', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m.A, m.volanteA);
    const avant = await empreinte(m.photoA);
    for (const index of ['-1', '1.5', 'abc', '1e2']) {
      const r = await envoyerMorceau(m.A.jeton, m.photoA, index, Buffer.from('x'));
      expect(r.statut, `index « ${index} » : ${r.corps}`).toBe(400);
      expect(r.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }
    expect(await empreinte(m.photoA)).toBe(avant);
  });

  it('un morceau d’EXACTEMENT 5 Mio est accepté', async () => {
    const m = await semerMonde();
    const r = await envoyerMorceau(m.A.jeton, m.photoA, 0, randomBytes(TAILLE_MORCEAU_MAX));
    expect(recus(r)).toEqual([0]);
  });

  it('un morceau de 5 Mio + 1 octet → 413 PAYLOAD_TOO_LARGE, rien n’est écrit', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m.A, m.volanteA);
    const avant = await empreinte(m.photoA);
    const r = await envoyerMorceau(m.A.jeton, m.photoA, 0, randomBytes(TAILLE_MORCEAU_MAX + 1));
    expect(r.statut, r.corps).toBe(413);
    expect(r.code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
    expect(await empreinte(m.photoA)).toBe(avant);
  });

  it('`complete` mal formé (sha256 non hexadécimal 64, chunks < 1 ou non entier) → 400', async () => {
    const m = await semerMonde();
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoA, 0, Buffer.from('x')))).toEqual([0]);
    const bon = sha256(Buffer.from('x'));
    const corps: readonly unknown[] = [
      { sha256: 'abc', chunks: 1 },
      { sha256: 'z'.repeat(64), chunks: 1 },
      { sha256: bon, chunks: 0 },
      { sha256: bon, chunks: 1.5 },
      { sha256: bon },
      { chunks: 1 },
    ];
    for (const c of corps) {
      const r = await terminer(m.A.jeton, m.photoA, c);
      expect(r.statut, `${JSON.stringify(c)} : ${r.corps}`).toBe(400);
      expect(r.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }
    expect(await cleDeStockage(m.photoA)).toBeNull();
  });
});

// =============================================================================
// 3. IDEMPOTENCE, STATUT, ASSEMBLAGE
// =============================================================================
describe('L6c · chunks — idempotence, statut, assemblage @critique', () => {
  it('statut d’une pièce sans aucun morceau : `aucun`, liste vide', async () => {
    const m = await semerMonde();
    expect(statutDe(await lireStatut(m.A.jeton, m.photoA))).toEqual({
      statut: 'aucun',
      chunksRecus: [],
    });
  });

  it('renvoyer le même morceau ne change rien : (id, index) idempotent @critique', async () => {
    const m = await semerMonde();
    const octets = Buffer.from('morceau zéro');
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoA, 0, octets))).toEqual([0]);
    const apresPremier = await envoi(m.photoA);
    expect(apresPremier?.statut).toBe('en_cours');
    expect(apresPremier?.created_by).toBe(m.A.id);
    expect(apresPremier?.mission_id).toBe(m.missionId);
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoA, 0, octets))).toEqual([0]);
    expect(recus(await envoyerMorceau(m.A.jeton, m.photoA, 0, octets))).toEqual([0]);
    const apres = await envoi(m.photoA);
    expect(apres?.chunks_recus).toEqual([0]);
    expect(statutDe(await lireStatut(m.A.jeton, m.photoA))).toEqual({
      statut: 'en_cours',
      chunksRecus: [0],
    });
  });

  it('morceaux reçus dans le désordre : liste TRIÉE, assemblage dans l’ordre des index @critique', async () => {
    const m = await semerMonde();
    const { tout, morceaux } = fichier(5 * 700 + 3, 700);
    const ordre = [4, 0, 5, 2, 1, 3];
    let derniers: number[] = [];
    for (const i of ordre) {
      derniers = recus(await envoyerMorceau(m.A.jeton, m.photoA, i, morceau(morceaux, i)));
      expect([...derniers].sort((a, b) => a - b)).toEqual(derniers);
    }
    expect(derniers).toEqual([0, 1, 2, 3, 4, 5]);
    const fin = await terminer(m.A.jeton, m.photoA, { sha256: sha256(tout), chunks: 6 });
    expect(fin.statut, fin.corps).toBe(200);
    expect(fin.json).toEqual({ statut: 'assemble' });

    const cle = await cleDeStockage(m.photoA);
    expect(cle).not.toBeNull();
    const objet = await stock().lireObjet(cle ?? '');
    expect(sha256(objet)).toBe(sha256(tout));
    expect(objet.length).toBe(tout.length);

    const ligne = await envoi(m.photoA);
    expect(ligne?.statut).toBe('assemble');
    expect(ligne?.sha256_attendu).toBe(sha256(tout));
    expect(statutDe(await lireStatut(m.A.jeton, m.photoA))).toEqual({
      statut: 'assemble',
      chunksRecus: [0, 1, 2, 3, 4, 5],
    });
  });

  it('`complete` rejoué après succès → 200 idempotent, même objet, même clé @critique', async () => {
    const m = await semerMonde();
    const { tout, morceaux } = fichier(2500, 1000);
    const premier = await envoyerTout(m.A.jeton, m.photoA, morceaux);
    expect(premier.statut, premier.corps).toBe(200);
    const cle = await cleDeStockage(m.photoA);
    const objetsApres = await stock().objets();

    const rejeu = await terminer(m.A.jeton, m.photoA, { sha256: sha256(tout), chunks: 3 });
    expect(rejeu.statut, rejeu.corps).toBe(200);
    expect(rejeu.json).toEqual({ statut: 'assemble' });
    expect(await cleDeStockage(m.photoA)).toBe(cle);
    expect(await stock().objets()).toEqual(objetsApres);
    expect(sha256(await stock().lireObjet(cle ?? ''))).toBe(sha256(tout));
  });

  it('`complete` avec des morceaux manquants → 409 UPLOAD_CHUNKS_MISSING + la liste exacte @critique', async () => {
    const m = await semerMonde();
    const { tout, morceaux } = fichier(5 * 400, 400);
    for (const i of [0, 2, 4]) {
      recus(await envoyerMorceau(m.A.jeton, m.photoA, i, morceau(morceaux, i)));
    }
    const r = await terminer(m.A.jeton, m.photoA, { sha256: sha256(tout), chunks: 5 });
    expect(r.statut, r.corps).toBe(409);
    expect(r.code).toBe(codePropose('UPLOAD_CHUNKS_MISSING'));
    expect(r.details).toEqual([1, 3]);
    expect(await cleDeStockage(m.photoA)).toBeNull();
    expect((await envoi(m.photoA))?.statut).not.toBe('assemble');
  });

  it('`complete` sans aucun morceau → 409 + TOUS les index', async () => {
    const m = await semerMonde();
    const r = await terminer(m.A.jeton, m.photoA, { sha256: sha256(Buffer.from('x')), chunks: 3 });
    expect(r.statut, r.corps).toBe(409);
    expect(r.code).toBe(codePropose('UPLOAD_CHUNKS_MISSING'));
    expect(r.details).toEqual([0, 1, 2]);
    expect(await cleDeStockage(m.photoA)).toBeNull();
  });

  it('sha256 faux → 409 UPLOAD_CHECKSUM_MISMATCH + TOUS les index, statut `echec`, aucune clé posée @critique', async () => {
    const m = await semerMonde();
    const { morceaux } = fichier(3 * 500, 500);
    for (let i = 0; i < 3; i += 1) {
      recus(await envoyerMorceau(m.A.jeton, m.photoA, i, morceau(morceaux, i)));
    }
    const r = await terminer(m.A.jeton, m.photoA, { sha256: 'f'.repeat(64), chunks: 3 });
    expect(r.statut, r.corps).toBe(409);
    expect(r.code).toBe(codePropose('UPLOAD_CHECKSUM_MISMATCH'));
    expect(r.details).toEqual([0, 1, 2]);
    expect(await cleDeStockage(m.photoA)).toBeNull();
    expect((await envoi(m.photoA))?.statut).toBe('echec');
    expect(statutDe(await lireStatut(m.A.jeton, m.photoA)).statut).toBe('echec');
  });

  it('après un sha256 faux dû à un morceau corrompu, la réémission complète aboutit (H3) @critique', async () => {
    const m = await semerMonde();
    const { tout, morceaux } = fichier(3 * 500, 500);
    const corrompu = Buffer.from(morceau(morceaux, 1));
    corrompu[0] = (corrompu[0] ?? 0) ^ 0xff;
    recus(await envoyerMorceau(m.A.jeton, m.photoA, 0, morceau(morceaux, 0)));
    recus(await envoyerMorceau(m.A.jeton, m.photoA, 1, corrompu));
    recus(await envoyerMorceau(m.A.jeton, m.photoA, 2, morceau(morceaux, 2)));
    const echec = await terminer(m.A.jeton, m.photoA, { sha256: sha256(tout), chunks: 3 });
    expect(echec.statut, echec.corps).toBe(409);
    expect(echec.code).toBe(codePropose('UPLOAD_CHECKSUM_MISMATCH'));
    expect(echec.details).toEqual([0, 1, 2]);

    const fin = await envoyerTout(m.A.jeton, m.photoA, morceaux);
    expect(fin.statut, fin.corps).toBe(200);
    const cle = await cleDeStockage(m.photoA);
    expect(sha256(await stock().lireObjet(cle ?? ''))).toBe(sha256(tout));
  });

  it('`expire_le` = instant du dernier morceau reçu + 7 jours, et avance à chaque morceau', async () => {
    const m = await semerMonde();
    const t0 = Date.now();
    recus(await envoyerMorceau(m.A.jeton, m.photoA, 0, Buffer.from('a')));
    const t1 = Date.now();
    const premier = (await envoi(m.photoA))?.expire_le;
    expect(premier).toBeInstanceOf(Date);
    const e1 = (premier as Date).getTime();
    expect(e1).toBeGreaterThanOrEqual(t0 + SEPT_JOURS_MS - 2_000);
    expect(e1).toBeLessThanOrEqual(t1 + SEPT_JOURS_MS + 2_000);

    await new Promise((r) => setTimeout(r, 1_100));
    const t2 = Date.now();
    recus(await envoyerMorceau(m.A.jeton, m.photoA, 1, Buffer.from('b')));
    const t3 = Date.now();
    const e2 = ((await envoi(m.photoA))?.expire_le as Date).getTime();
    expect(e2).toBeGreaterThan(e1);
    expect(e2).toBeGreaterThanOrEqual(t2 + SEPT_JOURS_MS - 2_000);
    expect(e2).toBeLessThanOrEqual(t3 + SEPT_JOURS_MS + 2_000);
  });
});

// =============================================================================
// 4. SCÉNARIO 7 (05 §9.8) — REPRISE D'UN ENVOI INTERROMPU À 80 %
// =============================================================================
describe('L6c · scénario 7 §9.8 — reprise à 80 % @critique', () => {
  it('5 morceaux de 5 Mio (le dernier plus court), coupure après 4 : `status` rend les 4, le manquant suffit, `complete` valide @critique', async () => {
    const m = await semerMonde();
    const { tout, morceaux } = fichier(4 * TAILLE_MORCEAU_MAX + 123_457, TAILLE_MORCEAU_MAX);
    expect(morceaux).toHaveLength(5);

    for (let i = 0; i < 4; i += 1) {
      recus(await envoyerMorceau(m.A.jeton, m.photoA, i, morceau(morceaux, i)));
    }
    // — coupure réseau : l'appareil ne sait plus ce qui est passé —
    const reprise = statutDe(await lireStatut(m.A.jeton, m.photoA));
    expect(reprise).toEqual({ statut: 'en_cours', chunksRecus: [0, 1, 2, 3] });

    const manquants = [0, 1, 2, 3, 4].filter((i) => !reprise.chunksRecus.includes(i));
    expect(manquants).toEqual([4]);
    for (const i of manquants) {
      expect(recus(await envoyerMorceau(m.A.jeton, m.photoA, i, morceau(morceaux, i)))).toEqual([
        0, 1, 2, 3, 4,
      ]);
    }
    const fin = await terminer(m.A.jeton, m.photoA, { sha256: sha256(tout), chunks: 5 });
    expect(fin.statut, fin.corps).toBe(200);
    expect(fin.json).toEqual({ statut: 'assemble' });

    const cle = await cleDeStockage(m.photoA);
    expect(cle).not.toBeNull();
    const objet = await stock().lireObjet(cle ?? '');
    expect(objet.length).toBe(tout.length);
    expect(sha256(objet)).toBe(sha256(tout));
    expect((await envoi(m.photoA))?.statut).toBe('assemble');
  });
});

// =============================================================================
// 5. PD8 — MINIO N'EST JAMAIS EXPOSÉ (relit TOUTES les réponses de la suite)
// =============================================================================
describe('L6c · PD8 — aucune URL présignée, aucune clé de stockage rendue @critique', () => {
  it('aucune réponse ne porte de signature S3, l’adresse de MinIO ni une clé de stockage @critique', async () => {
    const m = await semerMonde();
    const fin = await envoyerTout(m.A.jeton, m.photoA, [Buffer.from('pd8')]);
    expect(fin.statut, fin.corps).toBe(200);
    const cle = await cleDeStockage(m.photoA);
    expect(cle).not.toBeNull();

    expect(journalReponses.length).toBeGreaterThan(0);
    const adresse = `${stock().endPoint}:${String(stock().port)}`;
    for (const r of journalReponses) {
      const tout = `${r.corps}\n${JSON.stringify(r.entetes)}`;
      expect(tout).not.toMatch(/X-Amz-|Signature=|AWSAccessKeyId/i);
      expect(tout).not.toContain(adresse);
      expect(tout).not.toContain(stock().bucket);
      expect(tout).not.toContain(cle ?? '§');
    }
  });
});
