// =============================================================================
// LOT L6 / L6c-3 — PURGE DES ENVOIS DE PIÈCES EXPIRÉS (DECISIONS 2026-10-09 D8)
// =============================================================================
// Un envoi incomplet expire 7 jours après son dernier morceau reçu (`expire_le`,
// posé par `chunks.ts`). La purge retire alors ses MORCEAUX du stockage ; elle ne
// supprime JAMAIS la ligne `attachment_uploads` (invariant 7) :
//   · `en_cours` / `echec` → `chunks_recus = []`, `statut = 'echec'`,
//     `expire_le = NULL` : le terrain lit « echec, rien de reçu » et renvoie tout ;
//   · `assemble` (morceaux restés après un retrait raté) → morceaux retirés,
//     statut et `chunks_recus` INCHANGÉS, `expire_le = NULL` ; l'objet définitif
//     `pieces/…` n'est jamais touché.
//
// ÉCHÉANCE : comparée à l'heure de la BASE (`now()`, celle qui pose `expire_le`),
// bornée par `maintenant` : `expire_le < LEAST(now(), maintenant)`. Une horloge
// applicative en avance ne peut donc jamais purger avant l'échéance de la base.
//
// VERROUS : la purge ne prend QUE la ligne d'envoi (FOR UPDATE SKIP LOCKED) —
// c'est le premier verrou des trois routes de `chunks.ts`, l'ordre est donc le
// même. Une ligne tenue par une route en cours est SAUTÉE (pas attendue), et
// l'échéance est REVÉRIFIÉE sous verrou. Les objets sont retirés pendant que le
// verrou est tenu : aucun morceau ne peut arriver entre la liste et la suppression.
//
// SUPPRESSION PAR PRÉFIXE `envois/<pieceId>/` : un morceau au-delà de ceux déclarés
// disparaît aussi. Un échec du stockage ne valide rien de faux : la ligne d'un
// envoi en cours est remise à « rien de reçu » AVANT la suppression (le terrain
// renverra tout), mais son échéance est gardée pour qu'une passe suivante réessaie.
//
// 11 §2 : le journal `purge_envoi` ne porte que des identifiants techniques et des
// compteurs — aucune donnée personnelle, aucun nom de fichier, aucune clé.
// =============================================================================
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { attachmentUploads } from '../db/schema.js';
import { bornerLaTransaction } from '../db/horloge.js';
import { logger } from '../logger.js';
import { listerMorceaux, type Stockage } from './chunks.js';

/** Durée max d'une instruction ou d'une attente de verrou dans un lot de purge. */
const DUREE_MAX_LOT_MS = 30_000;

export interface EntreePurge {
  readonly db: NodePgDatabase;
  readonly stockage: Stockage;
  readonly maintenant: Date;
  readonly tailleLot: number;
}

export interface ResultatPurge {
  readonly purges: number;
  readonly morceaux: number;
  readonly octets: number;
}

/**
 * Retire les morceaux d'une pièce ; rend ce qui a été retiré, ou `null` si le
 * stockage a échoué (rien n'est alors compté comme purgé).
 */
async function retirerParPrefixe(
  st: Stockage,
  pieceId: string,
): Promise<{ morceaux: number; octets: number } | null> {
  try {
    const objets = await listerMorceaux(st, pieceId);
    if (objets.length > 0) {
      await st.client.removeObjects(
        st.bucket,
        objets.map((o) => o.nom),
      );
    }
    return { morceaux: objets.length, octets: objets.reduce((s, o) => s + o.taille, 0) };
  } catch {
    return null;
  }
}

/** Un lot : rend ce qu'il a purgé et le nombre de candidats verrouillés. */
async function purgerUnLot(
  entree: EntreePurge,
): Promise<{ candidats: number; resultat: ResultatPurge }> {
  const echeance = sql`LEAST(now(), ${entree.maintenant.toISOString()}::timestamptz)`;
  return entree.db.transaction(async (tx) => {
    await bornerLaTransaction(tx, DUREE_MAX_LOT_MS);
    const verrouilles = await tx
      .select({ pieceId: attachmentUploads.attachmentId })
      .from(attachmentUploads)
      .where(
        and(
          inArray(attachmentUploads.statut, ['en_cours', 'echec', 'assemble']),
          lt(attachmentUploads.expireLe, echeance),
        ),
      )
      .orderBy(asc(attachmentUploads.expireLe), asc(attachmentUploads.attachmentId))
      .limit(entree.tailleLot)
      .for('update', { skipLocked: true });
    if (verrouilles.length === 0) {
      return { candidats: 0, resultat: { purges: 0, morceaux: 0, octets: 0 } };
    }

    // REVÉRIFICATION sous verrou : seule la version verrouillée fait foi.
    const confirmes = await tx
      .select({
        pieceId: attachmentUploads.attachmentId,
        missionId: attachmentUploads.missionId,
        statut: attachmentUploads.statut,
      })
      .from(attachmentUploads)
      .where(
        and(
          inArray(
            attachmentUploads.attachmentId,
            verrouilles.map((v) => v.pieceId),
          ),
          inArray(attachmentUploads.statut, ['en_cours', 'echec', 'assemble']),
          lt(attachmentUploads.expireLe, echeance),
        ),
      )
      .orderBy(asc(attachmentUploads.expireLe), asc(attachmentUploads.attachmentId));

    let purges = 0;
    let morceaux = 0;
    let octets = 0;
    for (const envoi of confirmes) {
      const enCours = envoi.statut !== 'assemble';
      if (enCours) {
        // D'abord l'état : « rien de reçu », échéance gardée (une passe suivante
        // réessaiera si le stockage échoue). Ne jamais laisser une ligne promettre
        // des morceaux que le stockage n'a plus.
        await tx
          .update(attachmentUploads)
          .set({ chunksRecus: [], statut: 'echec', updatedAt: sql`now()` })
          .where(eq(attachmentUploads.attachmentId, envoi.pieceId));
      }
      const retire = await retirerParPrefixe(entree.stockage, envoi.pieceId);
      if (retire === null) {
        logger.warn({ pieceId: envoi.pieceId }, 'purge_envoi_stockage_indisponible');
        continue;
      }
      await tx
        .update(attachmentUploads)
        .set({ expireLe: null, updatedAt: sql`now()` })
        .where(eq(attachmentUploads.attachmentId, envoi.pieceId));
      purges += 1;
      morceaux += retire.morceaux;
      octets += retire.octets;
      logger.info(
        {
          pieceId: envoi.pieceId,
          missionId: envoi.missionId,
          morceaux: retire.morceaux,
          octets: retire.octets,
        },
        'purge_envoi',
      );
    }
    return { candidats: verrouilles.length, resultat: { purges, morceaux, octets } };
  });
}

/**
 * Purge les envois expirés, lot par lot (`tailleLot`), jusqu'à épuisement.
 * Rend les totaux cumulés. Idempotente : une 2e passe ne trouve plus rien.
 */
export async function purgerEnvoisExpires(entree: EntreePurge): Promise<ResultatPurge> {
  const tailleLot = Math.max(1, Math.floor(entree.tailleLot));
  let purges = 0;
  let morceaux = 0;
  let octets = 0;
  for (;;) {
    const lot = await purgerUnLot({ ...entree, tailleLot });
    purges += lot.resultat.purges;
    morceaux += lot.resultat.morceaux;
    octets += lot.resultat.octets;
    // Lot incomplet = plus rien à prendre ; lot sans progrès = seuls restent des
    // envois que le stockage refuse : on s'arrête, la passe suivante réessaiera.
    if (lot.candidats < tailleLot || lot.resultat.purges === 0) break;
  }
  return { purges, morceaux, octets };
}

// -----------------------------------------------------------------------------
// LA MINUTERIE — au démarrage de l'API puis toutes les 6 h, une seule instance
// -----------------------------------------------------------------------------
/** Toutes les 6 heures. */
export const INTERVALLE_PURGE_MS = 6 * 3600 * 1000;

/** Clé du verrou consultatif : une seule instance de l'API purge à la fois. */
const CLE_VERROU_PURGE = 6_300_603;

export interface PurgePeriodique {
  /** Arrête la minuterie et attend la fin de la passe en cours. */
  arreter(): Promise<void>;
}

/**
 * Une passe protégée par `pg_try_advisory_lock` (connexion dédiée du pool) : si
 * une autre instance purge déjà, celle-ci ne fait rien. Ne lève jamais.
 */
export async function passeDePurge(entree: {
  readonly db: NodePgDatabase;
  readonly pool: pg.Pool;
  readonly stockage: Stockage;
  readonly tailleLot: number;
}): Promise<ResultatPurge | null> {
  let connexion: pg.PoolClient | undefined;
  let verrouPris = false;
  try {
    connexion = await entree.pool.connect();
    const r = await connexion.query<{ pris: boolean }>('SELECT pg_try_advisory_lock($1) AS pris', [
      CLE_VERROU_PURGE,
    ]);
    verrouPris = r.rows[0]?.pris === true;
    if (!verrouPris) return null;
    return await purgerEnvoisExpires({
      db: entree.db,
      stockage: entree.stockage,
      maintenant: new Date(),
      tailleLot: entree.tailleLot,
    });
  } catch (err) {
    logger.error({ err }, 'purge_envoi_echec');
    return null;
  } finally {
    if (connexion !== undefined) {
      if (verrouPris) {
        await connexion
          .query('SELECT pg_advisory_unlock($1)', [CLE_VERROU_PURGE])
          .catch(() => undefined);
      }
      connexion.release();
    }
  }
}

/** Lance une passe tout de suite, puis toutes les `intervalleMs`. */
export function demarrerPurgePeriodique(entree: {
  readonly db: NodePgDatabase;
  readonly pool: pg.Pool;
  readonly stockage: Stockage;
  readonly tailleLot?: number;
  readonly intervalleMs?: number;
}): PurgePeriodique {
  const parametres = { ...entree, tailleLot: entree.tailleLot ?? 100 };
  let enCours: Promise<unknown> = Promise.resolve();
  let arretee = false;
  const lancer = (): void => {
    if (arretee) return;
    enCours = enCours.then(() => (arretee ? null : passeDePurge(parametres)));
  };
  lancer();
  const minuterie = setInterval(lancer, entree.intervalleMs ?? INTERVALLE_PURGE_MS);
  minuterie.unref();
  return {
    async arreter(): Promise<void> {
      arretee = true;
      clearInterval(minuterie);
      await enCours;
    },
  };
}
