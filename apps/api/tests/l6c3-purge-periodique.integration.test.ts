// =============================================================================
// LOT L6 / L6c-3 — V4 : LA PASSE DE PURGE ET SA MINUTERIE (couverture de sync/).
// Verrou consultatif (une seule instance purge), minuterie au démarrage puis toutes
// les 6 h, arrêt propre, stockage injoignable sans plantage. Vrais PostgreSQL et MinIO.
// =============================================================================
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client as ClientMinio } from 'minio';
import type { Client } from 'pg';
import {
  creerCompte,
  monterSocle,
  rattacher,
  semerMission,
  semerPhotoVolante,
  type Socle,
} from './aide/socle-l6c3.js';
import { connecter } from './aide/base-l1.js';

const CLE_VERROU_PURGE = 6_300_603;
const SIX_HEURES_MS = 6 * 3600 * 1000;

let socle: Socle | undefined;
function s(): Socle {
  if (socle === undefined) throw new Error('socle absent');
  return socle;
}
function bd(): Client {
  return s().client;
}
function minio(): NonNullable<Socle['minio']> {
  const m = s().minio;
  if (m === undefined) throw new Error('MinIO absent');
  return m;
}

beforeAll(async () => {
  socle = await monterSocle({ suffixe: 'l6c3_periodique', avecMinio: true });
}, 300_000);
afterAll(async () => {
  vi.useRealTimers();
  if (socle !== undefined) await socle.fermer();
});
afterEach(() => {
  vi.useRealTimers();
});

let ipN = 0;
async function envoiExpire(): Promise<string> {
  const compte = await creerCompte(bd(), 'consultant');
  const missionId = await semerMission(bd());
  await rattacher(bd(), missionId, compte.id, 'consultant');
  const pieceId = await semerPhotoVolante(bd(), missionId, compte.id);
  ipN += 1;
  const r = await s().app.inject({
    method: 'POST',
    url: `/v1/sync/attachments/${pieceId}/chunks/0`,
    headers: {
      authorization: `Bearer ${s().app.jwt.sign({ sub: compte.id })}`,
      'content-type': 'application/octet-stream',
      'x-forwarded-for': `10.72.0.${String(ipN % 250)}`,
    },
    payload: randomBytes(9),
  });
  expect(r.statusCode, r.body).toBe(200);
  await bd().query(
    `UPDATE attachment_uploads SET expire_le = now() - interval '1 hour' WHERE attachment_id = $1`,
    [pieceId],
  );
  return pieceId;
}

async function purge(pieceId: string): Promise<boolean> {
  const r = await bd().query<{ statut: string; expire_le: Date | null }>(
    'SELECT statut, expire_le FROM attachment_uploads WHERE attachment_id = $1',
    [pieceId],
  );
  return r.rows.some((l) => l.expire_le === null && l.statut === 'echec');
}

async function attendrePurge(pieceId: string): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (await purge(pieceId)) return;
    await new Promise((res) => {
      setTimeout(res, 100);
    });
  }
  throw new Error(`l’envoi ${pieceId} n’a pas été purgé en 10 s`);
}

async function entree(): Promise<{
  db: unknown;
  pool: unknown;
  stockage: { client: ClientMinio; bucket: string };
}> {
  const { db, pool } = await import('../src/db.js');
  return { db, pool, stockage: { client: minio().client, bucket: minio().bucket } };
}

interface Module {
  passeDePurge: (e: unknown) => Promise<{ purges: number } | null>;
  demarrerPurgePeriodique: (e: unknown) => { arreter: () => Promise<void> };
}
async function sujet(): Promise<Module> {
  return (await import('../src/sync/purge-envois.js')) as unknown as Module;
}

describe('L6c-3 · V4 passe de purge et minuterie @critique', () => {
  it('verrou consultatif pris par une autre connexion : la passe saute, puis purge une fois libre @critique', async () => {
    const id = await envoiExpire();
    const autre = await connecter(s().urlBase);
    try {
      const pris = await autre.query<{ p: boolean }>('SELECT pg_try_advisory_lock($1) AS p', [
        CLE_VERROU_PURGE,
      ]);
      expect(pris.rows[0]?.p).toBe(true);
      const { passeDePurge } = await sujet();
      expect(await passeDePurge({ ...(await entree()), tailleLot: 10 })).toBeNull();
      expect(
        await purge(id),
        'rien ne doit être purgé quand une autre instance tient le verrou',
      ).toBe(false);
      await autre.query('SELECT pg_advisory_unlock($1)', [CLE_VERROU_PURGE]);
      const r = await passeDePurge({ ...(await entree()), tailleLot: 10 });
      expect(r?.purges).toBeGreaterThanOrEqual(1);
      expect(await purge(id)).toBe(true);
    } finally {
      await autre.end();
    }
  });

  it('la passe libère son verrou : une autre connexion peut le prendre ensuite', async () => {
    const { passeDePurge } = await sujet();
    await passeDePurge({ ...(await entree()), tailleLot: 10 });
    const autre = await connecter(s().urlBase);
    try {
      const r = await autre.query<{ p: boolean }>('SELECT pg_try_advisory_lock($1) AS p', [
        CLE_VERROU_PURGE,
      ]);
      expect(r.rows[0]?.p).toBe(true);
    } finally {
      await autre.end();
    }
  });

  it('stockage injoignable : la passe ne lève pas et libère le verrou', async () => {
    await envoiExpire();
    const mort = new ClientMinio({
      endPoint: '127.0.0.1',
      port: 1,
      useSSL: false,
      accessKey: 'essai-factice',
      secretKey: 'secret-factice-non-reel',
    });
    const { passeDePurge } = await sujet();
    const e = await entree();
    await expect(
      passeDePurge({ ...e, stockage: { client: mort, bucket: 'absent' }, tailleLot: 10 }),
    ).resolves.not.toThrow();
    const autre = await connecter(s().urlBase);
    try {
      const r = await autre.query<{ p: boolean }>('SELECT pg_try_advisory_lock($1) AS p', [
        CLE_VERROU_PURGE,
      ]);
      expect(r.rows[0]?.p, 'le verrou doit être libéré malgré la panne').toBe(true);
    } finally {
      await autre.end();
    }
  }, 60_000);

  it('minuterie : une passe au démarrage, une à +6 h, plus aucune après arreter() @critique', async () => {
    const premier = await envoiExpire();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { demarrerPurgePeriodique } = await sujet();
    const periodique = demarrerPurgePeriodique({ ...(await entree()), tailleLot: 10 });
    await attendrePurge(premier); // passe immédiate

    const second = await envoiExpire();
    expect(await purge(second)).toBe(false);
    vi.advanceTimersByTime(SIX_HEURES_MS);
    await attendrePurge(second); // passe de +6 h

    await periodique.arreter();
    const troisieme = await envoiExpire();
    vi.advanceTimersByTime(2 * SIX_HEURES_MS);
    await new Promise((res) => {
      setTimeout(res, 1500);
    });
    expect(await purge(troisieme), 'aucune passe après l’arrêt').toBe(false);
  }, 60_000);
});
