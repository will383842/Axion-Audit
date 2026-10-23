// =============================================================================
// LOT L6 / L6c-3 — V4 : LA PURGE FACE AUX PANNES DU STOCKAGE ET DU VERROU.
//
// Réserves de la revue A17 de PR-A, écrites par le testeur :
//   R1  `removeObjects` de minio 8.0.7 NE LÈVE PAS : il rend la liste des objets en
//       erreur. Des erreurs par objet → la purge ne remet PAS `expire_le` à NULL, ne
//       compte pas l'envoi comme purgé, journalise juste (aucune ligne « purge_envoi »
//       de succès) ; `complete` réarme `expire_le` à now() comme pour l'échec complet.
//   R2  un MinIO qui se fige (connexion ouverte, jamais de réponse) ne tient pas
//       indéfiniment les verrous de lignes : un morceau concurrent reçoit une réponse,
//       la purge rend la main, `arreter()` aboutit. Borne de test : 50 s.
//   R3  si `pg_advisory_unlock` échoue, la connexion est DÉTRUITE (`release(true)`) :
//       le verrou de session meurt avec elle et la passe suivante peut le reprendre.
// Vrais PostgreSQL et MinIO ; seule la panne est simulée. Secrets factices (11 §2).
// =============================================================================
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
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
import { capturerJournal } from './aide/capture-journal.js';
import { connecter } from './aide/base-l1.js';

const CLE_VERROU_PURGE = 6_300_603;
const BORNE_GEL_MS = 50_000;

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
  socle = await monterSocle({ suffixe: 'l6c3_erreurs', avecMinio: true, niveauJournal: 'info' });
}, 300_000);
afterAll(async () => {
  if (socle !== undefined) await socle.fermer();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------
let ipN = 0;
function ip(): string {
  ipN += 1;
  return `10.75.${String(Math.floor(ipN / 250))}.${String(ipN % 250)}`;
}

interface Envoi {
  readonly missionId: string;
  readonly pieceId: string;
  readonly jeton: string;
}

async function deposer(e: Envoi, index: number, octets: Buffer): Promise<number> {
  const r = await s().app.inject({
    method: 'POST',
    url: `/v1/sync/attachments/${e.pieceId}/chunks/${String(index)}`,
    headers: {
      authorization: `Bearer ${e.jeton}`,
      'content-type': 'application/octet-stream',
      'x-forwarded-for': ip(),
    },
    payload: octets,
  });
  return r.statusCode;
}

async function creerEnvoi(nMorceaux: number): Promise<Envoi> {
  const compte = await creerCompte(bd(), 'consultant');
  const missionId = await semerMission(bd());
  await rattacher(bd(), missionId, compte.id, 'consultant');
  const pieceId = await semerPhotoVolante(bd(), missionId, compte.id);
  const e = { missionId, pieceId, jeton: s().app.jwt.sign({ sub: compte.id }) };
  for (let i = 0; i < nMorceaux; i += 1) {
    expect(await deposer(e, i, randomBytes(8))).toBe(200);
  }
  return e;
}

async function vieillir(pieceId: string): Promise<void> {
  await bd().query(
    `UPDATE attachment_uploads SET expire_le = now() - interval '1 hour' WHERE attachment_id = $1`,
    [pieceId],
  );
}

async function expireLe(pieceId: string): Promise<Date | null> {
  const r = await bd().query<{ expire_le: Date | null }>(
    'SELECT expire_le FROM attachment_uploads WHERE attachment_id = $1',
    [pieceId],
  );
  return r.rows[0]?.expire_le ?? null;
}

async function objetsDe(pieceId: string): Promise<string[]> {
  return (await minio().objets()).filter((o) => o.startsWith(`envois/${pieceId}/`));
}

interface ModulePurge {
  purgerEnvoisExpires: (
    e: unknown,
  ) => Promise<{ purges: number; morceaux: number; octets: number }>;
  passeDePurge: (e: unknown) => Promise<{ purges: number } | null>;
  demarrerPurgePeriodique: (e: unknown) => { arreter: () => Promise<void> };
}
async function purgeModule(): Promise<ModulePurge> {
  return (await import('../src/sync/purge-envois.js')) as unknown as ModulePurge;
}
async function base(): Promise<{ db: unknown; pool: unknown }> {
  const { db, pool } = await import('../src/db.js');
  return { db, pool };
}
function stockageReel(): { client: ClientMinio; bucket: string } {
  return { client: minio().client, bucket: minio().bucket };
}

/** Un MinIO qui se fige : il accepte les connexions et ne répond jamais. */
async function serveurGele(): Promise<{
  port: number;
  fermer: () => Promise<void>;
}> {
  const sockets = new Set<Socket>();
  const serveur: Server = createServer((sock) => {
    sockets.add(sock);
    sock.on('error', () => undefined);
  });
  await new Promise<void>((res) => {
    serveur.listen(0, '127.0.0.1', res);
  });
  const adresse = serveur.address();
  const port = typeof adresse === 'object' && adresse !== null ? adresse.port : 0;
  return {
    port,
    fermer: async (): Promise<void> => {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((res) => {
        serveur.close(() => {
          res();
        });
      });
    },
  };
}

function clientGele(port: number): ClientMinio {
  return new ClientMinio({
    endPoint: '127.0.0.1',
    port,
    useSSL: false,
    accessKey: 'essai-factice',
    secretKey: 'secret-factice-non-reel',
  });
}

async function avecBorne<T>(travail: Promise<T>, ms: number): Promise<T | 'pas_de_reponse'> {
  return Promise.race([
    travail,
    new Promise<'pas_de_reponse'>((res) => {
      setTimeout(() => {
        res('pas_de_reponse');
      }, ms);
    }),
  ]);
}

// =============================================================================
describe('L6c-3 · R1 removeObjects rend une liste d’erreurs, il ne lève pas @critique', () => {
  it('purge : erreurs par objet → expire_le gardé, envoi non compté, aucune ligne « purge_envoi », avertissement ; la passe suivante réussit @critique', async () => {
    const e = await creerEnvoi(2);
    await vieillir(e.pieceId);
    const noms = await objetsDe(e.pieceId);
    const espion = vi.spyOn(ClientMinio.prototype, 'removeObjects').mockResolvedValue(
      noms.map((name) => ({
        Code: 'InternalError',
        Message: 'panne simulée',
        Key: name,
        VersionId: '',
      })) as never,
    );
    const { purgerEnvoisExpires } = await purgeModule();
    const { db } = await base();
    const capture = await capturerJournal();
    let r;
    try {
      r = await purgerEnvoisExpires({
        db,
        stockage: stockageReel(),
        maintenant: new Date(),
        tailleLot: 10,
      });
    } finally {
      capture.arreter();
    }

    expect(espion).toHaveBeenCalled();
    expect(r.purges, 'un envoi dont la suppression a échoué n’est pas « purgé »').toBe(0);
    expect(r.morceaux).toBe(0);
    expect(await objetsDe(e.pieceId)).toEqual(noms);
    const echeance = await expireLe(e.pieceId);
    expect(
      echeance,
      'expire_le doit être GARDÉ pour qu’une passe suivante réessaie',
    ).not.toBeNull();
    expect((echeance ?? new Date(0)).getTime()).toBeLessThan(Date.now());
    const lignes = capture.lignes();
    expect(lignes.some((l) => l.msg === 'purge_envoi' && l.pieceId === e.pieceId)).toBe(false);
    expect(
      lignes.some((l) => (l.level === 'warn' || l.level === 'error') && l.pieceId === e.pieceId),
      'un avertissement doit nommer la pièce dont la suppression a échoué',
    ).toBe(true);

    espion.mockRestore();
    const apres = await purgerEnvoisExpires({
      db,
      stockage: stockageReel(),
      maintenant: new Date(),
      tailleLot: 10,
    });
    expect(apres.purges).toBe(1);
    expect(await objetsDe(e.pieceId)).toEqual([]);
    expect(await expireLe(e.pieceId)).toBeNull();
  });

  it('complete : erreurs par objet au retrait → 200, expire_le réarmé à now() comme pour l’échec complet @critique', async () => {
    const e = await creerEnvoi(0);
    const octets = randomBytes(12);
    expect(await deposer(e, 0, octets)).toBe(200);
    const { Client: ClientApp } = await import('minio');
    const espion = vi
      .spyOn(ClientApp.prototype, 'removeObjects')
      .mockResolvedValue([
        { Code: 'InternalError', Message: 'panne simulée', Key: 'x', VersionId: '' },
      ] as never);
    const fin = await s().app.inject({
      method: 'POST',
      url: `/v1/sync/attachments/${e.pieceId}/complete`,
      headers: {
        authorization: `Bearer ${e.jeton}`,
        'content-type': 'application/json',
        'x-forwarded-for': ip(),
      },
      payload: JSON.stringify({
        sha256: createHash('sha256').update(octets).digest('hex'),
        chunks: 1,
      }),
    });
    espion.mockRestore();

    expect(fin.statusCode, fin.body).toBe(200);
    expect(await objetsDe(e.pieceId)).toHaveLength(1);
    const echeance = await expireLe(e.pieceId);
    expect(echeance, 'expire_le doit être réarmé (pas NULL) : le morceau reste').not.toBeNull();
    expect(Math.abs((echeance ?? new Date(0)).getTime() - Date.now())).toBeLessThan(60_000);
  });
});

// =============================================================================
describe('L6c-3 · R2 un MinIO figé ne tient pas les verrous indéfiniment @critique', () => {
  it('la purge rend la main et un morceau concurrent reçoit une réponse @critique', async () => {
    const e = await creerEnvoi(1);
    await vieillir(e.pieceId);
    const gele = await serveurGele();
    try {
      const { purgerEnvoisExpires } = await purgeModule();
      const { db } = await base();
      const debut = Date.now();
      const purge = purgerEnvoisExpires({
        db,
        stockage: { client: clientGele(gele.port), bucket: 'absent' },
        maintenant: new Date(),
        tailleLot: 10,
      });
      purge.catch(() => undefined);
      await new Promise((res) => {
        setTimeout(res, 1500);
      }); // la purge tient la ligne et attend le stockage figé
      const concurrent = deposer(e, 1, randomBytes(8));
      const reponse = await avecBorne(concurrent, BORNE_GEL_MS);
      expect(
        reponse,
        'le morceau concurrent attend la purge sans fin : le verrou de ligne est tenu pendant un appel de stockage qui ne répond jamais',
      ).not.toBe('pas_de_reponse');
      expect([200, 503]).toContain(reponse);
      const fin = await avecBorne(purge, BORNE_GEL_MS);
      expect(fin, 'la purge ne rend jamais la main').not.toBe('pas_de_reponse');
      expect(Date.now() - debut).toBeLessThan(2 * BORNE_GEL_MS + 5000);
    } finally {
      await gele.fermer();
    }
  }, 150_000);

  it('arreter() aboutit même quand la passe en cours attend un stockage figé @critique', async () => {
    const e = await creerEnvoi(1);
    await vieillir(e.pieceId);
    const gele = await serveurGele();
    try {
      const { demarrerPurgePeriodique } = await purgeModule();
      const { db, pool } = await base();
      const periodique = demarrerPurgePeriodique({
        db,
        pool,
        stockage: { client: clientGele(gele.port), bucket: 'absent' },
        tailleLot: 10,
      });
      await new Promise((res) => {
        setTimeout(res, 1500);
      });
      const arret = await avecBorne(periodique.arreter(), BORNE_GEL_MS);
      expect(arret, 'arreter() ne doit pas rester suspendu à un stockage figé').not.toBe(
        'pas_de_reponse',
      );
    } finally {
      await gele.fermer();
    }
  }, 150_000);
});

// =============================================================================
describe('L6c-3 · R3 échec de pg_advisory_unlock : la connexion est détruite @critique', () => {
  it('release(true) et verrou repris : une autre connexion peut le prendre @critique', async () => {
    const { passeDePurge } = await purgeModule();
    const { db, pool } = await base();
    const vrai = pool as {
      connect: () => Promise<{
        query: (...a: unknown[]) => Promise<unknown>;
        release: (err?: Error | boolean) => void;
      }>;
    };
    const releases: unknown[] = [];
    const faux = {
      connect: async (): Promise<unknown> => {
        const c = await vrai.connect();
        return {
          query: (texte: unknown, ...reste: unknown[]): Promise<unknown> => {
            if (typeof texte === 'string' && texte.includes('pg_advisory_unlock')) {
              return Promise.reject(new Error('échec simulé du déverrouillage'));
            }
            return c.query(texte, ...reste);
          },
          release: (arg?: Error | boolean): void => {
            releases.push(arg);
            c.release(arg);
          },
        };
      },
    };

    await passeDePurge({ db, pool: faux, stockage: stockageReel(), tailleLot: 10 });

    expect(releases, 'la connexion doit être rendue exactement une fois').toHaveLength(1);
    expect(
      releases[0],
      'après un déverrouillage raté, la connexion doit être détruite : release(true)',
    ).toBeTruthy();

    const autre = await connecter(s().urlBase);
    try {
      const r = await autre.query<{ p: boolean }>('SELECT pg_try_advisory_lock($1) AS p', [
        CLE_VERROU_PURGE,
      ]);
      expect(r.rows[0]?.p, 'le verrou consultatif est resté tenu par une connexion vivante').toBe(
        true,
      );
      await autre.query('SELECT pg_advisory_unlock($1)', [CLE_VERROU_PURGE]);
    } finally {
      await autre.end();
    }
    // la passe suivante, sur le vrai pool, reprend le verrou et travaille
    expect(
      await passeDePurge({ db, pool, stockage: stockageReel(), tailleLot: 10 }),
    ).not.toBeNull();
  });
});
