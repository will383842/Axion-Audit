// =============================================================================
// LOT L6 / L6c-3 « LE SIÈGE » — V4 : PURGE DES ENVOIS EXPIRÉS.
//
// Écrit AVANT le code (09 §3-2, §5.6). `apps/api/src/sync/purge-envois.ts` n'existe
// pas : le module est importé dynamiquement, le test échoue donc pour la bonne
// raison (module absent / comportement absent), jamais par erreur de compilation.
// Sources : DECISIONS 2026-10-09 [L6c] D8 (expiration à 7 jours du dernier morceau,
// purge journalisée sans donnée personnelle) · 04 `attachment_uploads(expire_le)` ·
// invariant 7 (la ligne n'est JAMAIS supprimée) · PD8 (MinIO interne).
//
// SIGNATURE EXIGÉE (à reprendre telle quelle par l'auteur) :
//   purgerEnvoisExpires({ db, stockage: { client, bucket }, maintenant: Date,
//                         tailleLot: number })
//     : Promise<{ purges: number; morceaux: number; octets: number }>
//   · `db` = l'instance Drizzle de `src/db.ts` ; `stockage` = { client: minio.Client,
//     bucket } ; boucle par lots de `tailleLot` jusqu'à épuisement, totaux cumulés ;
//   · sélection : statut IN ('en_cours','echec','assemble') ET expire_le < maintenant,
//     FOR UPDATE SKIP LOCKED, puis REVÉRIFICATION d'expire_le sous verrou ;
//   · suppression par PRÉFIXE `envois/<pieceId>/` ; jamais `pieces/…` ;
//   · en_cours/echec → chunks_recus = [], statut = 'echec', expire_le = NULL ;
//     assemble → statut inchangé, expire_le = NULL ;
//   · journal pino (instance racine) : info, msg « purge_envoi », champs pieceId,
//     missionId, morceaux, octets — rien d'autre qui identifie une personne.
//
// DOUTES DE SPEC (non devinés, à tracer en DECISIONS.md) : (1) `maintenant` est-il
// comparé à expire_le, ou l'heure de la base ? Les tests posent expire_le en SQL par
// rapport à now() et passent `new Date()` : les deux lectures les satisfont.
// (2) pour un envoi `assemble`, `chunks_recus` n'est pas figé ici.
// =============================================================================
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

interface Resultat {
  readonly purges: number;
  readonly morceaux: number;
  readonly octets: number;
}
type Purger = (entree: {
  db: unknown;
  stockage: unknown;
  maintenant: Date;
  tailleLot: number;
}) => Promise<Resultat>;

let socle: Socle | undefined;
function s(): Socle {
  if (socle === undefined) throw new Error('socle absent');
  return socle;
}
function bd(): Client {
  return s().client;
}
function stock(): NonNullable<Socle['minio']> {
  const m = s().minio;
  if (m === undefined) throw new Error('MinIO absent');
  return m;
}

beforeAll(async () => {
  socle = await monterSocle({ suffixe: 'l6c3_purge', avecMinio: true, niveauJournal: 'info' });
}, 300_000);
afterAll(async () => {
  if (socle !== undefined) await socle.fermer();
});

// -----------------------------------------------------------------------------
// Le sujet, chargé À LA DEMANDE : s'il n'existe pas, le test échoue ici, lisiblement.
// -----------------------------------------------------------------------------
async function purger(tailleLot = 50, maintenant: Date = new Date()): Promise<Resultat> {
  const chemin = '../src/sync/purge-envois.js';
  const module = (await import(/* @vite-ignore */ chemin)) as { purgerEnvoisExpires?: Purger };
  if (module.purgerEnvoisExpires === undefined) {
    throw new Error('purgerEnvoisExpires n’est pas exporté par src/sync/purge-envois.ts');
  }
  const { db } = await import('../src/db.js');
  return module.purgerEnvoisExpires({
    db,
    stockage: { client: stock().client, bucket: stock().bucket },
    maintenant,
    tailleLot,
  });
}

// -----------------------------------------------------------------------------
// Fixtures : un envoi réel déposé par la ROUTE, puis vieilli en SQL.
// -----------------------------------------------------------------------------
let ipN = 0;
function ip(): string {
  ipN += 1;
  return `10.68.${String(Math.floor(ipN / 250))}.${String(ipN % 250)}`;
}

async function deposer(
  jeton: string,
  pieceId: string,
  index: number,
  octets: Buffer,
): Promise<void> {
  const r = await s().app.inject({
    method: 'POST',
    url: `/v1/sync/attachments/${pieceId}/chunks/${String(index)}`,
    headers: {
      'x-forwarded-for': ip(),
      'content-type': 'application/octet-stream',
      authorization: `Bearer ${jeton}`,
    },
    payload: octets,
  });
  expect(r.statusCode, r.body).toBe(200);
}

interface Envoi {
  readonly missionId: string;
  readonly pieceId: string;
  readonly jeton: string;
  readonly tailles: readonly number[];
  readonly courriel: string;
  readonly nom: string;
}

async function creerEnvoi(tailles: readonly number[]): Promise<Envoi> {
  const compte = await creerCompte(bd(), 'consultant');
  const missionId = await semerMission(bd());
  await rattacher(bd(), missionId, compte.id, 'consultant');
  const pieceId = await semerPhotoVolante(bd(), missionId, compte.id);
  const jeton = s().app.jwt.sign({ sub: compte.id });
  for (let i = 0; i < tailles.length; i += 1) {
    await deposer(jeton, pieceId, i, randomBytes(tailles[i] ?? 1));
  }
  return { missionId, pieceId, jeton, tailles, courriel: compte.courriel, nom: compte.nom };
}

async function vieillir(pieceId: string, statut?: 'echec'): Promise<void> {
  await bd().query(
    `UPDATE attachment_uploads SET expire_le = now() - interval '1 hour',
            statut = COALESCE($2, statut) WHERE attachment_id = $1`,
    [pieceId, statut ?? null],
  );
}

type Ligne = Record<string, unknown>;
async function ligneEnvoi(pieceId: string): Promise<Ligne | undefined> {
  return (
    await bd().query<Ligne>('SELECT * FROM attachment_uploads WHERE attachment_id = $1', [pieceId])
  ).rows[0];
}
async function objetsDe(pieceId: string): Promise<string[]> {
  return (await stock().objets()).filter((o) => o.startsWith(`envois/${pieceId}/`));
}
async function nombreEnvois(): Promise<number> {
  const r = await bd().query<{ n: string }>('SELECT count(*) AS n FROM attachment_uploads');
  return Number(r.rows[0]?.n);
}
const somme = (t: readonly number[]): number => t.reduce((a, b) => a + b, 0);

// =============================================================================
describe('L6c-3 · V4 purge des envois expirés @critique', () => {
  it('purge un envoi en_cours expiré : objets retirés, ligne CONSERVÉE (invariant 7), état remis à echec @critique', async () => {
    const e = await creerEnvoi([40, 30, 20]);
    const autre = await creerEnvoi([10]); // témoin non expiré, même bucket
    expect(await objetsDe(e.pieceId)).toHaveLength(3);
    await vieillir(e.pieceId);
    const avant = await nombreEnvois();

    const r = await purger();

    expect(r).toEqual({ purges: 1, morceaux: 3, octets: somme(e.tailles) });
    expect(await objetsDe(e.pieceId)).toEqual([]);
    expect(await objetsDe(autre.pieceId)).toHaveLength(1);
    const ligne = await ligneEnvoi(e.pieceId);
    expect(ligne, 'la ligne d’envoi ne doit JAMAIS être supprimée').toBeDefined();
    expect(ligne?.chunks_recus).toEqual([]);
    expect(ligne?.statut).toBe('echec');
    expect(ligne?.expire_le).toBeNull();
    expect(await nombreEnvois()).toBe(avant);
  });

  it('supprime par PRÉFIXE : un morceau au-delà de ceux déclarés disparaît aussi ; l’objet définitif pieces/… est intact @critique', async () => {
    const e = await creerEnvoi([10, 10]);
    const cleOrpheline = `envois/${e.pieceId}/00009`;
    await stock().client.putObject(stock().bucket, cleOrpheline, Buffer.from('orphelin'));
    const cleDefinitive = `pieces/${e.missionId}/${e.pieceId}`;
    await stock().client.putObject(stock().bucket, cleDefinitive, Buffer.from('definitif'));
    await vieillir(e.pieceId);

    const r = await purger();

    expect(r.purges).toBe(1);
    expect(r.morceaux).toBe(3);
    expect(r.octets).toBe(20 + 'orphelin'.length);
    expect(await objetsDe(e.pieceId)).toEqual([]);
    expect(await stock().objets()).toContain(cleDefinitive);
    expect((await stock().lireObjet(cleDefinitive)).toString()).toBe('definitif');
  });

  it('un envoi echec expiré est purgé aussi, et la ligne reste echec', async () => {
    const e = await creerEnvoi([12]);
    await vieillir(e.pieceId, 'echec');
    expect((await purger()).purges).toBe(1);
    expect(await objetsDe(e.pieceId)).toEqual([]);
    const ligne = await ligneEnvoi(e.pieceId);
    expect(ligne?.statut).toBe('echec');
    expect(ligne?.chunks_recus).toEqual([]);
    expect(ligne?.expire_le).toBeNull();
  });

  it('un envoi NON expiré n’est pas touché (ni objets, ni ligne) @critique', async () => {
    const e = await creerEnvoi([15, 15]);
    const avant = JSON.stringify(await ligneEnvoi(e.pieceId));
    const objets = await objetsDe(e.pieceId);
    const r = await purger();
    expect(r).toEqual({ purges: 0, morceaux: 0, octets: 0 });
    expect(await objetsDe(e.pieceId)).toEqual(objets);
    expect(JSON.stringify(await ligneEnvoi(e.pieceId))).toBe(avant);
  });

  it('un morceau reçu entre-temps repousse expire_le : l’envoi N’EST PAS purgé @critique', async () => {
    const e = await creerEnvoi([10]);
    await vieillir(e.pieceId);
    await deposer(e.jeton, e.pieceId, 1, randomBytes(10)); // la route repousse expire_le (D8)
    const ligne = await ligneEnvoi(e.pieceId);
    expect(new Date(ligne?.expire_le as string).getTime()).toBeGreaterThan(Date.now());

    const r = await purger();

    expect(r.purges).toBe(0);
    expect(await objetsDe(e.pieceId)).toHaveLength(2);
    expect((await ligneEnvoi(e.pieceId))?.chunks_recus).toEqual([0, 1]);
  });

  it('SKIP LOCKED : une ligne verrouillée par une transaction concurrente est sautée, pas attendue @critique', async () => {
    const e = await creerEnvoi([10]);
    await vieillir(e.pieceId);
    const autre = await connecter(s().urlBase);
    try {
      await autre.query('BEGIN');
      await autre.query('SELECT 1 FROM attachment_uploads WHERE attachment_id = $1 FOR UPDATE', [
        e.pieceId,
      ]);
      // La transaction concurrente (un morceau en cours de réception) repousse l'échéance.
      await autre.query(
        `UPDATE attachment_uploads SET expire_le = now() + interval '7 days' WHERE attachment_id = $1`,
        [e.pieceId],
      );
      const pendant = await Promise.race([
        purger(),
        new Promise<'bloque'>((res) => {
          setTimeout(() => {
            res('bloque');
          }, 8000);
        }),
      ]);
      expect(pendant, 'la purge ne doit pas attendre un verrou (SKIP LOCKED)').not.toBe('bloque');
      expect((pendant as Resultat).purges).toBe(0);
      expect(await objetsDe(e.pieceId)).toHaveLength(1);
      await autre.query('COMMIT');
    } finally {
      await autre.query('ROLLBACK').catch(() => undefined);
      await autre.end();
    }
    // le morceau reçu a repoussé l'échéance : toujours rien à purger
    expect((await purger()).purges).toBe(0);
    expect(await objetsDe(e.pieceId)).toHaveLength(1);
  });

  it('lots : 3 envois expirés avec tailleLot = 1 → tous purgés, totaux cumulés', async () => {
    const a = await creerEnvoi([5, 5]);
    const b = await creerEnvoi([7]);
    const c = await creerEnvoi([9, 9, 9]);
    for (const x of [a, b, c]) await vieillir(x.pieceId);
    const r = await purger(1);
    expect(r).toEqual({ purges: 3, morceaux: 6, octets: 10 + 7 + 27 });
    for (const x of [a, b, c]) expect(await objetsDe(x.pieceId)).toEqual([]);
  });

  it('idempotent : une 2e passe ne trouve plus rien et ne change rien', async () => {
    const e = await creerEnvoi([8]);
    await vieillir(e.pieceId);
    expect((await purger()).purges).toBe(1);
    const figee = JSON.stringify(await ligneEnvoi(e.pieceId));
    expect(await purger()).toEqual({ purges: 0, morceaux: 0, octets: 0 });
    expect(JSON.stringify(await ligneEnvoi(e.pieceId))).toBe(figee);
  });

  it('après purge, le terrain reprend : status → echec sans reçu, puis tout renvoyer aboutit', async () => {
    const e = await creerEnvoi([6, 6]);
    await vieillir(e.pieceId);
    await purger();
    const st = await s().app.inject({
      method: 'GET',
      url: `/v1/sync/attachments/${e.pieceId}/status`,
      headers: { authorization: `Bearer ${e.jeton}`, 'x-forwarded-for': ip() },
    });
    expect(st.statusCode).toBe(200);
    expect(JSON.parse(st.body)).toMatchObject({ statut: 'echec', chunksRecus: [] });
    const tout = [randomBytes(6), randomBytes(6)];
    await deposer(e.jeton, e.pieceId, 0, tout[0] as Buffer);
    await deposer(e.jeton, e.pieceId, 1, tout[1] as Buffer);
    const fin = await s().app.inject({
      method: 'POST',
      url: `/v1/sync/attachments/${e.pieceId}/complete`,
      headers: {
        authorization: `Bearer ${e.jeton}`,
        'content-type': 'application/json',
        'x-forwarded-for': ip(),
      },
      payload: JSON.stringify({
        sha256: createHash('sha256').update(Buffer.concat(tout)).digest('hex'),
        chunks: 2,
      }),
    });
    expect(fin.statusCode, fin.body).toBe(200);
  });

  it('un envoi assemble dont expire_le est échu (reste d’un retrait raté) : morceaux purgés, définitif intact, statut gardé @critique', async () => {
    const e = await creerEnvoi([11, 11]);
    const cleDefinitive = `pieces/${e.missionId}/${e.pieceId}`;
    await stock().client.putObject(stock().bucket, cleDefinitive, Buffer.alloc(22, 1));
    await bd().query(
      `UPDATE attachment_uploads SET statut = 'assemble', sha256_attendu = $2,
              expire_le = now() - interval '2 hours' WHERE attachment_id = $1`,
      [e.pieceId, 'a'.repeat(64)],
    );
    await bd().query('UPDATE attachments SET storage_key = $2, size_bytes = 22 WHERE id = $1', [
      e.pieceId,
      cleDefinitive,
    ]);

    const r = await purger();

    expect(r).toEqual({ purges: 1, morceaux: 2, octets: 22 });
    expect(await objetsDe(e.pieceId)).toEqual([]);
    expect(await stock().objets()).toContain(cleDefinitive);
    const ligne = await ligneEnvoi(e.pieceId);
    expect(ligne?.statut).toBe('assemble');
    expect(ligne?.expire_le).toBeNull();
    const piece = await bd().query<Ligne>(
      'SELECT storage_key, size_bytes FROM attachments WHERE id = $1',
      [e.pieceId],
    );
    expect(piece.rows[0]?.storage_key).toBe(cleDefinitive);
    expect(Number(piece.rows[0]?.size_bytes)).toBe(22);
  });

  it('journal pino « purge_envoi » : pieceId, missionId, morceaux, octets — AUCUNE donnée personnelle @critique', async () => {
    const e = await creerEnvoi([13, 14]);
    await vieillir(e.pieceId);
    const capture = await capturerJournal();
    try {
      await purger();
    } finally {
      capture.arreter();
    }
    const lignes = capture.lignes().filter((l) => l.msg === 'purge_envoi');
    expect(lignes, 'une ligne « purge_envoi » par envoi purgé').toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      pieceId: e.pieceId,
      missionId: e.missionId,
      morceaux: 2,
      octets: 27,
    });
    const brut = capture.brut();
    for (const interdit of [e.courriel, e.nom, 'photo-fictive', e.jeton, 'image/jpeg']) {
      expect(brut.includes(interdit), `le journal contient « ${interdit} »`).toBe(false);
    }
  });
});
