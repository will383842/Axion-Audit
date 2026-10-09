// =============================================================================
// LOT L6 / L6c-1 — LES ROUTES DE CHUNKS QUAND LE STOCKAGE MANQUE.
//
// Écrit AVANT la correction, sans lire le code (09 §3-2, §5.6). Source :
// DECISIONS 2026-10-09 [L6c] « Revue A17 » — MinIO injoignable → 503 ; et la
// doctrine de configuration du lot : stockage non configuré → 503
// `SERVICE_UNAVAILABLE`, l'API démarre quand même. Jamais 500.
//
// Deux applications sont construites l'une après l'autre (la configuration est lue
// à l'import) : `vi.resetModules()` entre les deux.
//
// HYPOTHÈSE TRACÉE : MinIO injoignable, `status` peut ne lire que PostgreSQL
// (200 admis) et `complete` sans morceau stocké peut rendre 409
// UPLOAD_CHUNKS_MISSING ; le dépôt d'un morceau, lui, DOIT rendre 503.
//
// Invariant 2 : aucune référence client. Secrets factices (11 §2).
// =============================================================================
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { ERROR_CODES } from '@axion/shared';
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

const SECRET_ACCES = '5a'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '2b'.repeat(32);
const T_SEMIS = '2026-09-30T08:00:00.000Z';
const CLES_MINIO = [
  'MINIO_ENDPOINT',
  'MINIO_PORT',
  'MINIO_USE_SSL',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET_ATTACHMENTS',
] as const;

let nomBase = '';
let urlBase = '';
let client: Client | undefined;
const sauvegarde: Partial<Record<(typeof CLES_MINIO)[number], string>> = {};

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

interface Appli {
  readonly app: FastifyInstance;
  fermer(): Promise<void>;
}

async function construire(): Promise<Appli> {
  vi.resetModules();
  process.env.DATABASE_URL = urlBase;
  const { construireApp } = await import('../src/app.js');
  const { fermerBase } = await import('../src/db.js');
  const app = await construireApp();
  await app.ready();
  return {
    app,
    async fermer(): Promise<void> {
      await app.close();
      await fermerBase();
    },
  };
}

/** Un port local FERMÉ : ouvert puis refermé aussitôt. */
async function portFerme(): Promise<number> {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer();
    serveur.once('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address();
      const port = typeof adresse === 'object' && adresse !== null ? adresse.port : 0;
      serveur.close(() => {
        resoudre(port);
      });
    });
  });
}

interface Monde {
  readonly proprietaireId: string;
  readonly photo: string;
}

let compteur = 0;
async function semerMonde(): Promise<Monde> {
  compteur += 1;
  const userId = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', 'consultant', 'guide_strict',
             now(), true, now(), now())`,
    [
      userId,
      `Compte L6c stockage ${String(compteur)}`,
      `stockage.${String(compteur)}@exemple.test`,
    ],
  );
  const entreprise = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    entreprise,
    `Entreprise fictive stockage ${String(compteur)}`,
  ]);
  const missionId = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', now(), now())`,
    [missionId, entreprise, `Mission fictive stockage ${String(compteur)}`],
  );
  await bd().query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, 'consultant'],
  );
  const unite = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status, created_at, updated_at)
     VALUES ($1, $2, NULL, 'service', 'Unite fictive', true, 'active', now(), now())`,
    [unite, missionId],
  );
  const entretien = uuidv7();
  await bd().query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id, schedule_status,
                             status, general_notes, client_created_at, client_updated_at,
                             created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, 'realise', 'en_cours', 'notes semées',
             $5, $5, now(), now())`,
    [entretien, missionId, userId, unite, T_SEMIS],
  );
  const photo = uuidv7();
  await bd().query(
    `INSERT INTO attachments (id, interview_id, answer_id, mission_id, kind, filename, mime,
                              created_by, client_created_at, client_updated_at, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, 'photo', 'photo-fictive.jpg', 'image/jpeg', $4, $5, $5, now(), now())`,
    [photo, entretien, missionId, userId, T_SEMIS],
  );
  return { proprietaireId: userId, photo };
}

interface Rep {
  readonly statut: number;
  readonly code: string | null;
  readonly corps: string;
}

async function appeler(
  app: FastifyInstance,
  jeton: string,
  route: 'chunk' | 'status' | 'complete',
  pieceId: string,
): Promise<Rep> {
  const octets = Buffer.from('octets fictifs');
  const base = `/v1/sync/attachments/${pieceId}`;
  const commun = {
    'x-forwarded-for': `10.68.0.${String(++compteur % 250)}`,
    authorization: `Bearer ${jeton}`,
  };
  const reponse =
    route === 'chunk'
      ? await app.inject({
          method: 'POST',
          url: `${base}/chunks/0`,
          headers: { ...commun, 'content-type': 'application/octet-stream' },
          payload: octets,
        })
      : route === 'status'
        ? await app.inject({ method: 'GET', url: `${base}/status`, headers: commun })
        : await app.inject({
            method: 'POST',
            url: `${base}/complete`,
            headers: { ...commun, 'content-type': 'application/json' },
            payload: JSON.stringify({
              sha256: createHash('sha256').update(octets).digest('hex'),
              chunks: 1,
            }),
          });
  let code: string | null = null;
  try {
    const json = JSON.parse(reponse.body) as { error?: { code?: string } };
    code = json.error?.code ?? null;
  } catch {
    // corps non JSON
  }
  return { statut: reponse.statusCode, code, corps: reponse.body };
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);
  for (const cle of CLES_MINIO) {
    const valeur = process.env[cle];
    if (valeur !== undefined) sauvegarde[cle] = valeur;
  }
  const base = await creerBaseEphemere('l6c_stockage');
  nomBase = base.nom;
  urlBase = base.url;
  await appliquerMontee(base.url);
  process.env.SEED_ADMIN_EMAIL ??= 'fondateur.l6c-stockage@exemple.test';
  process.env.SEED_ADMIN_PASSWORD ??= 'mot-de-passe-factice-de-seed';
  await executerSeed(base.url, base.nom);
  client = await connecter(base.url);
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;
}, 300_000);

afterAll(async () => {
  for (const cle of CLES_MINIO) {
    const valeur = sauvegarde[cle];
    if (valeur === undefined) Reflect.deleteProperty(process.env, cle);
    else process.env[cle] = valeur;
  }
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

describe('L6c · stockage indisponible (revue A17) — 503, jamais 500 @critique', () => {
  it('MinIO NON configuré : l’API démarre, les trois routes rendent 503 SERVICE_UNAVAILABLE @critique', async () => {
    for (const cle of CLES_MINIO) Reflect.deleteProperty(process.env, cle);
    const appli = await construire();
    try {
      const m = await semerMonde();
      const jeton = appli.app.jwt.sign({ sub: m.proprietaireId });
      for (const route of ['chunk', 'status', 'complete'] as const) {
        const r = await appeler(appli.app, jeton, route, m.photo);
        expect(r.statut, `${route} : ${r.corps}`).toBe(503);
        expect(r.code, route).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);
      }
      const cle = await bd().query<{ storage_key: string | null }>(
        'SELECT storage_key FROM attachments WHERE id = $1',
        [m.photo],
      );
      expect(cle.rows[0]?.storage_key ?? null).toBeNull();
    } finally {
      await appli.fermer();
    }
  });

  it('MinIO configuré mais INJOIGNABLE (port fermé) : le dépôt rend 503, aucune route ne rend 500 @critique', async () => {
    process.env.MINIO_ENDPOINT = '127.0.0.1';
    process.env.MINIO_PORT = String(await portFerme());
    process.env.MINIO_USE_SSL = 'false';
    process.env.MINIO_ACCESS_KEY = 'cle-factice-injoignable';
    process.env.MINIO_SECRET_KEY = 'secret-factice-injoignable';
    process.env.MINIO_BUCKET_ATTACHMENTS = 'axion-injoignable';
    const appli = await construire();
    try {
      const m = await semerMonde();
      const jeton = appli.app.jwt.sign({ sub: m.proprietaireId });

      const depot = await appeler(appli.app, jeton, 'chunk', m.photo);
      expect(depot.statut, depot.corps).toBe(503);
      expect(depot.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);

      const statut = await appeler(appli.app, jeton, 'status', m.photo);
      expect([200, 503], statut.corps).toContain(statut.statut);
      if (statut.statut === 503) expect(statut.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);

      const fin = await appeler(appli.app, jeton, 'complete', m.photo);
      expect([409, 503], fin.corps).toContain(fin.statut);
      expect(fin.code).toBe(
        fin.statut === 503 ? ERROR_CODES.SERVICE_UNAVAILABLE : ERROR_CODES.UPLOAD_CHUNKS_MISSING,
      );

      const cle = await bd().query<{ storage_key: string | null }>(
        'SELECT storage_key FROM attachments WHERE id = $1',
        [m.photo],
      );
      expect(cle.rows[0]?.storage_key ?? null).toBeNull();
    } finally {
      await appli.fermer();
    }
  });
});
