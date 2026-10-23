// =============================================================================
// LOT L6 / L6c-3 — `complete` et l'échéance de purge. Réécrit par le testeur (A16)
// à la demande de la coordination (CLAUDE.md §4 : en sync, le test n'est jamais écrit
// par l'auteur du code). Vrais PostgreSQL et MinIO.
//   (a) après un `complete` réussi : statut assemble, expire_le NULL ;
//   (b) retrait des morceaux raté APRÈS le commit : l'objet final et la clé restent,
//       expire_le repasse à now(), et la passe de purge suivante ramasse les objets ;
//   (c) un morceau d'indice SUPÉRIEUR au nombre `chunks` déclaré est retiré aussi
//       (retrait par préfixe `envois/<id>/`), sans toucher à `pieces/…`.
// =============================================================================
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  creerCompte,
  monterSocle,
  rattacher,
  semerMission,
  semerPhotoVolante,
  type Socle,
} from './aide/socle-l6c3.js';

let socle: Socle | undefined;
function s(): Socle {
  if (socle === undefined) throw new Error('socle absent');
  return socle;
}
function minio(): NonNullable<Socle['minio']> {
  const m = s().minio;
  if (m === undefined) throw new Error('MinIO absent');
  return m;
}

beforeAll(async () => {
  socle = await monterSocle({ suffixe: 'l6c3_complete', avecMinio: true });
}, 300_000);
afterAll(async () => {
  if (socle !== undefined) await socle.fermer();
});
afterEach(() => {
  vi.restoreAllMocks();
});

let ipN = 0;
function ip(): string {
  ipN += 1;
  return `10.73.${String(Math.floor(ipN / 250))}.${String(ipN % 250)}`;
}

interface Piece {
  readonly missionId: string;
  readonly pieceId: string;
  readonly jeton: string;
}

async function nouvellePiece(): Promise<Piece> {
  const compte = await creerCompte(s().client, 'consultant');
  const missionId = await semerMission(s().client);
  await rattacher(s().client, missionId, compte.id, 'consultant');
  const pieceId = await semerPhotoVolante(s().client, missionId, compte.id);
  return { missionId, pieceId, jeton: s().app.jwt.sign({ sub: compte.id }) };
}

async function deposer(p: Piece, index: number, octets: Buffer): Promise<void> {
  const r = await s().app.inject({
    method: 'POST',
    url: `/v1/sync/attachments/${p.pieceId}/chunks/${String(index)}`,
    headers: {
      authorization: `Bearer ${p.jeton}`,
      'content-type': 'application/octet-stream',
      'x-forwarded-for': ip(),
    },
    payload: octets,
  });
  expect(r.statusCode, r.body).toBe(200);
}

async function terminer(
  p: Piece,
  tout: Buffer,
  chunks: number,
): Promise<{ statusCode: number; body: string }> {
  return s().app.inject({
    method: 'POST',
    url: `/v1/sync/attachments/${p.pieceId}/complete`,
    headers: {
      authorization: `Bearer ${p.jeton}`,
      'content-type': 'application/json',
      'x-forwarded-for': ip(),
    },
    payload: JSON.stringify({ sha256: createHash('sha256').update(tout).digest('hex'), chunks }),
  });
}

async function ligneEnvoi(
  pieceId: string,
): Promise<{ statut: string; expire_le: Date | null } | undefined> {
  const r = await s().client.query<{ statut: string; expire_le: Date | null }>(
    'SELECT statut, expire_le FROM attachment_uploads WHERE attachment_id = $1',
    [pieceId],
  );
  return r.rows[0];
}

async function morceauxRestants(pieceId: string): Promise<string[]> {
  return (await minio().objets()).filter((o) => o.startsWith(`envois/${pieceId}/`));
}

describe('L6c-3 · complete et échéance de purge @critique', () => {
  it('(a) après complete réussi, expire_le est NULL, le statut est assemble, les morceaux sont retirés @critique', async () => {
    const p = await nouvellePiece();
    const octets = randomBytes(16);
    await deposer(p, 0, octets);
    const fin = await terminer(p, octets, 1);
    expect(fin.statusCode, fin.body).toBe(200);
    expect(await ligneEnvoi(p.pieceId)).toEqual({ statut: 'assemble', expire_le: null });
    expect(await morceauxRestants(p.pieceId)).toEqual([]);
    expect(await minio().objets()).toContain(`pieces/${p.missionId}/${p.pieceId}`);
  });

  it('(b) retrait raté après commit : pièce assemblée, expire_le repassé à now(), la passe de purge suivante ramasse les objets @critique', async () => {
    const p = await nouvellePiece();
    const octets = randomBytes(24);
    await deposer(p, 0, octets);
    // Le stockage échoue au retrait des morceaux (après le commit de l'assemblage).
    const { Client: ClientMinio } = await import('minio');
    const espion = vi
      .spyOn(ClientMinio.prototype, 'removeObjects')
      .mockRejectedValue(new Error('panne de retrait simulée'));
    const fin = await terminer(p, octets, 1);
    espion.mockRestore();

    expect(fin.statusCode, 'l’assemblage est acquis : complete reste 200').toBe(200);
    expect(await morceauxRestants(p.pieceId)).toHaveLength(1);
    const ligne = await ligneEnvoi(p.pieceId);
    expect(ligne?.statut).toBe('assemble');
    expect(ligne?.expire_le, 'expire_le doit être réarmé').not.toBeNull();
    expect(Math.abs(new Date(ligne?.expire_le ?? 0).getTime() - Date.now())).toBeLessThan(60_000);
    const cle = `pieces/${p.missionId}/${p.pieceId}`;
    expect((await minio().lireObjet(cle)).equals(octets)).toBe(true);

    await new Promise((res) => {
      setTimeout(res, 50);
    }); // l'échéance est strictement passée
    const { purgerEnvoisExpires } = await import('../src/sync/purge-envois.js');
    const { db } = await import('../src/db.js');
    const r = await purgerEnvoisExpires({
      db,
      stockage: { client: minio().client, bucket: minio().bucket },
      maintenant: new Date(Date.now() + 1000),
      tailleLot: 10,
    });

    expect(r.purges).toBeGreaterThanOrEqual(1);
    expect(await morceauxRestants(p.pieceId)).toEqual([]);
    expect((await minio().lireObjet(cle)).equals(octets)).toBe(true);
    expect((await ligneEnvoi(p.pieceId))?.statut).toBe('assemble');
  });

  it('(c) un morceau d’indice supérieur à `chunks` déclaré est retiré aussi, pieces/… intact @critique', async () => {
    const p = await nouvellePiece();
    const octets = randomBytes(20);
    await deposer(p, 0, octets);
    await deposer(p, 3, randomBytes(5)); // au-delà des chunks déclarés à complete
    expect(await morceauxRestants(p.pieceId)).toHaveLength(2);

    const fin = await terminer(p, octets, 1);

    expect(fin.statusCode, fin.body).toBe(200);
    expect(await morceauxRestants(p.pieceId), 'le morceau 3 doit disparaître aussi').toEqual([]);
    const cle = `pieces/${p.missionId}/${p.pieceId}`;
    expect((await minio().lireObjet(cle)).equals(octets)).toBe(true);
  });
});
