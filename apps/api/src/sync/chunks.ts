// =============================================================================
// PROTOCOLE DE CHUNKS DES PIÈCES JOINTES — lot L6, incrément L6c-1 « les octets ».
//
// 05 §9.6 : « découpage en chunks de 5 Mo — POST …/chunks/:index (idempotent par
// couple id+index) · GET …/status → liste des chunks reçus (la reprise n'envoie
// QUE les manquants) · POST …/complete {sha256} → le serveur assemble et vérifie
// le checksum (échec → 409 + liste des chunks à réémettre) ».
//
// ── CE QUE CE MODULE GARANTIT ────────────────────────────────────────────────
//   · PROPRIÉTÉ (05 §9.9 étendue, DECISIONS [L6c] « Routes de chunks ») : seul le
//     propriétaire de la SESSION de la pièce (ou, pour une note volante, son
//     créateur) écrit ou lit l'état d'un envoi. Pièce inconnue ou non-membre →
//     404 ; membre non propriétaire → 403. Le refus précède TOUTE écriture.
//   · IDEMPOTENCE : un morceau renvoyé au même index REMPLACE l'objet du même nom
//     (H3 : c'est ce qui permet de réparer un morceau corrompu) ; la liste des
//     reçus est un ensemble trié. Un `complete` rejoué après succès rend 200 sans
//     rien réécrire.
//   · ASSEMBLAGE : les morceaux sont relus un à un depuis MinIO et passés au
//     client d'objet sous forme de flux, le sha256 étant calculé au passage.
//     LIMITE CONNUE, dite telle quelle : le client `minio` découpe ce flux en
//     parts de 64 Mio qu'il tient en mémoire pour les signer — une photo (moins
//     de 64 Mio) est donc entièrement en mémoire pendant son assemblage, et un
//     morceau reçu (5 Mio au plus) l'est pendant son dépôt. Empreinte fausse →
//     l'objet final est retiré, aucune clé n'est posée sur la pièce, l'envoi
//     passe `echec` et sa liste est vidée : tous les index sont à réémettre.
//   · PIÈCE `note` : elle n'a pas d'octets → 400 `VALIDATION_FAILED` sur les
//     trois routes. Pièce assemblée qui reçoit une AUTRE empreinte → 409
//     `UPLOAD_ALREADY_ASSEMBLED`, terminal, rien n'est modifié (revue A17).
//   · STOCKAGE : non configuré ou injoignable → 503 réessayable, jamais 500.
//   · PD8 : MinIO n'est jamais exposé. Aucune URL présignée n'est fabriquée,
//     aucune clé de stockage ni aucun nom de bucket ne sort dans une réponse.
//   · 11 §2 : rien de ce que contient une pièce n'est journalisé — seulement des
//     identifiants techniques et des compteurs.
//   · D8 : `expire_le` = instant du dernier morceau reçu + 7 jours (la purge
//     arrive en L6c-3).
//
// ── VERROUS : UNE TRANSACTION PAR APPEL, UN ORDRE UNIQUE (revue A17) ────────
// Les trois routes prennent leurs verrous dans le MÊME ordre : d'abord la ligne
// d'envoi (`attachment_uploads`, FOR UPDATE), ensuite la pièce et sa session
// (FOR SHARE, via la propriété). Quand la ligne d'envoi EXISTE, deux appels sur
// la même pièce sont sérialisés dès leur première requête, avant d'avoir pris
// quoi que ce soit d'autre : un `complete` qui écrit `attachments` ne peut plus
// attendre un verrou partagé tenu par un appel qui l'attend lui-même. Quand elle
// n'existe pas encore (tout premier morceau), il n'y a rien à verrouiller : deux
// premiers morceaux simultanés se rangent sur l'insertion (clé primaire), puis
// relisent la ligne verrouillée. Ce raisonnement n'exclut pas tout interblocage
// avec d'autres écritures de la base (un push concurrent) : un `40P01` ou un
// `55P03` résiduel devient un 503 RÉESSAYABLE, jamais un 500.
//
// Traçabilité : E7, E9 · invariants 1, 3 et 8 · 05 §9.6, §9.8-7, §9.9.
// =============================================================================
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { Client as ClientMinio } from 'minio';
import {
  AppError,
  AppErrorIndex,
  TAILLE_MORCEAU_MAX_OCTETS,
  type CorpsTerminerPiece,
  type ReponseMorceau,
  type ReponseStatutPiece,
  type ReponseTerminerPiece,
} from '@axion/shared';
import { configStockage, type ConfigStockage } from '../config.js';
import { db } from '../db.js';
import { attachmentUploads, attachments } from '../db/schema.js';
import { lirePiece, lireRoleSurMission, type ExecuteurSql, type LignePiece } from './depot.js';
import { proprieteDePiece } from './proprietaire.js';

/** D8 — un envoi incomplet expire 7 jours après son dernier morceau reçu. */
const EXPIRATION_ENVOI = sql`now() + interval '7 days'`;

const MESSAGES = {
  introuvable: 'Pièce jointe introuvable.',
  interdite:
    'Cette pièce jointe appartient à une session dont vous n’êtes pas l’auditeur : seul son auditeur peut l’envoyer.',
  manquants: 'Des morceaux de la pièce jointe manquent : envoyez-les, puis terminez l’envoi.',
  empreinte:
    'L’empreinte de la pièce jointe assemblée ne correspond pas : tous ses morceaux sont à renvoyer.',
  indisponible:
    'Le stockage des pièces jointes est momentanément indisponible. Rien n’est perdu sur l’appareil ; l’envoi sera retenté.',
  occupe:
    'La pièce jointe est en cours de traitement par un autre envoi. Rien n’est perdu sur l’appareil ; réessayez dans un instant.',
  sansOctets: 'Cette pièce jointe est une note : elle n’a pas d’octets à envoyer.',
  dejaAssemblee:
    'Cette pièce jointe est déjà reconstituée au siège avec un autre contenu : elle n’est pas modifiée.',
  interne: 'Une erreur interne est survenue.',
} as const;

// -----------------------------------------------------------------------------
// LE STOCKAGE — un seul client, construit à la demande
// -----------------------------------------------------------------------------
interface Stockage {
  readonly client: ClientMinio;
  readonly bucket: string;
}

let stockageCourant: Stockage | null = null;

function stockage(): Stockage {
  if (stockageCourant !== null) return stockageCourant;
  const conf: ConfigStockage | null = configStockage;
  if (conf === null) throw new AppError('SERVICE_UNAVAILABLE', MESSAGES.indisponible);
  stockageCourant = {
    client: new ClientMinio({
      endPoint: conf.MINIO_ENDPOINT,
      port: conf.MINIO_PORT,
      useSSL: conf.MINIO_USE_SSL,
      accessKey: conf.MINIO_ACCESS_KEY,
      secretKey: conf.MINIO_SECRET_KEY,
    }),
    bucket: conf.MINIO_BUCKET_ATTACHMENTS,
  };
  return stockageCourant;
}

/**
 * Un appel au stockage : toute panne (connexion refusée, délai, objet absent)
 * devient un 503 réessayable. Une `AppError` déjà levée passe telle quelle.
 */
async function auStockage<T>(appel: () => Promise<T>): Promise<T> {
  try {
    return await appel();
  } catch (erreur) {
    if (erreur instanceof AppError) throw erreur;
    throw new AppError('SERVICE_UNAVAILABLE', MESSAGES.indisponible);
  }
}

/** Le code SQLSTATE d'une erreur PostgreSQL, même enveloppée par Drizzle (`cause`). */
function codeSql(erreur: unknown): string | null {
  let courante: unknown = erreur;
  for (let profondeur = 0; profondeur < 5; profondeur += 1) {
    if (typeof courante !== 'object' || courante === null) return null;
    const code = (courante as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    courante = (courante as { cause?: unknown }).cause;
  }
  return null;
}

/** Interblocage (40P01) ou verrou indisponible (55P03) : réessayable → 503. */
const CODES_SQL_REESSAYABLES: ReadonlySet<string> = new Set(['40P01', '55P03']);

type TransactionPg = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function enTransaction<T>(travail: (tx: TransactionPg) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(travail);
  } catch (erreur) {
    const code = codeSql(erreur);
    if (code !== null && CODES_SQL_REESSAYABLES.has(code)) {
      throw new AppError('SERVICE_UNAVAILABLE', MESSAGES.occupe);
    }
    throw erreur;
  }
}

/** Objet d'un morceau en attente d'assemblage. Jamais rendu au client (PD8). */
export function cleMorceau(pieceId: string, index: number): string {
  return `envois/${pieceId}/${String(index).padStart(5, '0')}`;
}

/** Objet final d'une pièce assemblée. Jamais rendu au client (PD8). */
export function cleDefinitive(missionId: string, pieceId: string): string {
  return `pieces/${missionId}/${pieceId}`;
}

// -----------------------------------------------------------------------------
// PROPRIÉTÉ — 05 §9.9 étendue aux routes de chunks
// -----------------------------------------------------------------------------
/**
 * La pièce, si l'appelant en est le propriétaire ; sinon une `AppError`.
 * Inconnue ou non-membre → 404 (on ne révèle pas l'existence d'une pièce à qui
 * n'est pas de la mission) ; membre non propriétaire → 403.
 */
async function pieceDuProprietaire(
  ex: ExecuteurSql,
  utilisateurId: string,
  pieceId: string,
): Promise<LignePiece> {
  const piece = await lirePiece(ex, pieceId, 'share');
  if (piece === null) throw new AppError('NOT_FOUND', MESSAGES.introuvable);
  const role = await lireRoleSurMission(ex, piece.missionId, utilisateurId);
  if (role === null) throw new AppError('NOT_FOUND', MESSAGES.introuvable);
  const propriete = await proprieteDePiece(
    ex,
    { interviewId: piece.interviewId, answerId: piece.answerId },
    piece.createdBy,
    { utilisateurId, missionId: piece.missionId },
  );
  if (propriete !== 'proprietaire') throw new AppError('FORBIDDEN', MESSAGES.interdite);
  if (piece.kind === 'note') throw new AppError('VALIDATION_FAILED', MESSAGES.sansOctets);
  return piece;
}

type LigneEnvoi = typeof attachmentUploads.$inferSelect;

async function lireEnvoi(ex: ExecuteurSql, pieceId: string): Promise<LigneEnvoi | null> {
  const lignes = await ex
    .select()
    .from(attachmentUploads)
    .where(eq(attachmentUploads.attachmentId, pieceId))
    .limit(1)
    .for('update');
  return lignes[0] ?? null;
}

/** Ensemble trié, sans doublon — la forme unique de `chunks_recus`. */
function trier(index: Iterable<number>): number[] {
  return [...new Set(index)].sort((a, b) => a - b);
}

function tous(chunks: number): number[] {
  return Array.from({ length: chunks }, (_, i) => i);
}

// -----------------------------------------------------------------------------
// POST /v1/sync/attachments/:id/chunks/:index
// -----------------------------------------------------------------------------
export async function recevoirMorceau(
  utilisateurId: string,
  pieceId: string,
  index: number,
  octets: Buffer,
): Promise<ReponseMorceau> {
  const { client, bucket } = stockage();
  return enTransaction(async (tx) => {
    // Ordre unique : l'envoi d'abord (s'il existe), la pièce ensuite.
    await lireEnvoi(tx, pieceId);
    const piece = await pieceDuProprietaire(tx, utilisateurId, pieceId);

    await tx
      .insert(attachmentUploads)
      .values({
        attachmentId: pieceId,
        missionId: piece.missionId,
        createdBy: utilisateurId,
        chunkSizeBytes: TAILLE_MORCEAU_MAX_OCTETS,
        chunksAttendus: null,
        chunksRecus: [],
        sha256Attendu: null,
        statut: 'en_cours',
        expireLe: EXPIRATION_ENVOI,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .onConflictDoNothing({ target: attachmentUploads.attachmentId });

    const envoi = await lireEnvoi(tx, pieceId);
    if (envoi === null) throw new AppError('INTERNAL_ERROR', MESSAGES.interne);
    // Déjà assemblée : rien à recevoir, la réponse dit ce qui est acquis.
    if (envoi.statut === 'assemble') return { chunksRecus: trier(envoi.chunksRecus) };

    await auStockage(() =>
      client.putObject(bucket, cleMorceau(pieceId, index), octets, octets.byteLength, {
        'Content-Type': 'application/octet-stream',
      }),
    );

    const chunksRecus = trier([...envoi.chunksRecus, index]);
    await tx
      .update(attachmentUploads)
      .set({
        chunksRecus,
        statut: 'en_cours',
        expireLe: EXPIRATION_ENVOI,
        updatedAt: sql`now()`,
      })
      .where(eq(attachmentUploads.attachmentId, pieceId));
    return { chunksRecus };
  });
}

// -----------------------------------------------------------------------------
// GET /v1/sync/attachments/:id/status
// -----------------------------------------------------------------------------
export async function lireStatutEnvoi(
  utilisateurId: string,
  pieceId: string,
): Promise<ReponseStatutPiece> {
  stockage();
  return enTransaction(async (tx) => {
    const envoi = await lireEnvoi(tx, pieceId);
    await pieceDuProprietaire(tx, utilisateurId, pieceId);
    if (envoi === null) return { statut: 'aucun', chunksRecus: [] };
    return { statut: envoi.statut, chunksRecus: trier(envoi.chunksRecus) };
  });
}

// -----------------------------------------------------------------------------
// POST /v1/sync/attachments/:id/complete
// -----------------------------------------------------------------------------
/** Les morceaux 0..n-1, lus un à un et passés au flux sortant ; l'empreinte se calcule au passage. */
async function* morceauxEnFlux(
  st: Stockage,
  pieceId: string,
  chunks: number,
  empreinte: ReturnType<typeof createHash>,
): AsyncGenerator<Buffer> {
  for (let i = 0; i < chunks; i += 1) {
    const flux = await st.client.getObject(st.bucket, cleMorceau(pieceId, i));
    for await (const morceau of flux as AsyncIterable<Buffer | Uint8Array>) {
      const tampon = Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau);
      empreinte.update(tampon);
      yield tampon;
    }
  }
}

type IssueAssemblage =
  | { readonly type: 'assemble' }
  | { readonly type: 'manquants'; readonly index: number[] }
  | { readonly type: 'empreinte'; readonly index: number[] }
  | { readonly type: 'deja_assemblee' };

export async function terminerEnvoi(
  utilisateurId: string,
  pieceId: string,
  corps: CorpsTerminerPiece,
  journal: FastifyBaseLogger,
): Promise<ReponseTerminerPiece> {
  const st = stockage();
  const issue = await enTransaction(async (tx): Promise<IssueAssemblage> => {
    const envoi = await lireEnvoi(tx, pieceId);
    const piece = await pieceDuProprietaire(tx, utilisateurId, pieceId);
    if (envoi === null) return { type: 'manquants', index: tous(corps.chunks) };

    if (envoi.statut === 'assemble') {
      // Rejeu d'un `complete` réussi (réponse perdue avant un kill) : idempotent.
      // Une AUTRE empreinte sur une pièce assemblée ne touche à rien.
      return envoi.sha256Attendu === corps.sha256
        ? { type: 'assemble' }
        : { type: 'deja_assemblee' };
    }

    const recus = new Set(envoi.chunksRecus);
    const manquants = tous(corps.chunks).filter((i) => !recus.has(i));
    if (manquants.length > 0) return { type: 'manquants', index: manquants };

    let taille = 0;
    for (let i = 0; i < corps.chunks; i += 1) {
      const info = await auStockage(() => st.client.statObject(st.bucket, cleMorceau(pieceId, i)));
      taille += info.size;
    }
    const cle = cleDefinitive(piece.missionId, pieceId);
    const empreinte = createHash('sha256');
    await auStockage(() =>
      st.client.putObject(
        st.bucket,
        cle,
        Readable.from(morceauxEnFlux(st, pieceId, corps.chunks, empreinte)),
        taille,
        { 'Content-Type': 'application/octet-stream' },
      ),
    );
    const calculee = empreinte.digest('hex');

    if (calculee !== corps.sha256) {
      await auStockage(() => st.client.removeObject(st.bucket, cle));
      await tx
        .update(attachmentUploads)
        .set({
          statut: 'echec',
          chunksRecus: [],
          chunksAttendus: corps.chunks,
          sha256Attendu: corps.sha256,
          updatedAt: sql`now()`,
        })
        .where(eq(attachmentUploads.attachmentId, pieceId));
      return { type: 'empreinte', index: tous(corps.chunks) };
    }

    await tx
      .update(attachments)
      .set({ storageKey: cle, sizeBytes: taille, updatedAt: sql`now()` })
      .where(and(eq(attachments.id, pieceId), eq(attachments.missionId, piece.missionId)));
    await tx
      .update(attachmentUploads)
      .set({
        statut: 'assemble',
        chunksAttendus: corps.chunks,
        sha256Attendu: corps.sha256,
        updatedAt: sql`now()`,
      })
      .where(eq(attachmentUploads.attachmentId, pieceId));
    return { type: 'assemble' };
  });

  if (issue.type === 'manquants') {
    throw new AppErrorIndex('UPLOAD_CHUNKS_MISSING', MESSAGES.manquants, issue.index);
  }
  if (issue.type === 'deja_assemblee') {
    throw new AppError('UPLOAD_ALREADY_ASSEMBLED', MESSAGES.dejaAssemblee);
  }
  if (issue.type === 'empreinte') {
    journal.warn({ pieceId, morceaux: corps.chunks }, 'Empreinte de pièce jointe refusée');
    throw new AppErrorIndex('UPLOAD_CHECKSUM_MISMATCH', MESSAGES.empreinte, issue.index);
  }
  await retirerMorceaux(pieceId, corps.chunks, journal);
  return { statut: 'assemble' };
}

/**
 * Les morceaux d'une pièce assemblée ne servent plus : ils sont retirés APRÈS le
 * commit. Un échec ici ne défait rien (l'objet final et la clé sont posés) ; il
 * laisse des objets que la purge de L6c-3 rattrapera, et il est journalisé.
 */
async function retirerMorceaux(
  pieceId: string,
  chunks: number,
  journal: FastifyBaseLogger,
): Promise<void> {
  try {
    const st = stockage();
    await st.client.removeObjects(
      st.bucket,
      tous(chunks).map((i) => cleMorceau(pieceId, i)),
    );
  } catch {
    journal.warn({ pieceId }, 'Morceaux d’une pièce assemblée non retirés');
  }
}
