// =============================================================================
// ACCÈS BASE — Drizzle ORM sur PostgreSQL 16 (11 §1).
//
// RAPPEL CAPITAL (11 §2) : « Le fichier 04 se transcrit LITTÉRALEMENT en migrations
// SQL ; Drizzle ne sert QU'AUX REQUÊTES TYPÉES. » Aucun schéma n'est déclaré ici et
// aucun ne le sera : le DDL vit exclusivement dans docs/04_MODELE_DE_DONNEES.md,
// transcrit en fichiers .sql versionnés au lot L1 par A12 (DBA).
// Traçabilité : E17 (stack imposée).
// =============================================================================
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Pool de connexions. Dimensionné pour le VPS V1 (02 §11.1 : 4 vCPU) ; le point de
 * tension attendu n'est pas la base mais les PICS DE SYNC (50 consultants qui
 * rentrent le vendredi soir) — absorbés par les lots de 100 ops et BullMQ, pas par
 * un pool démesuré.
 */
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Invariant 5 : la session Postgres vit en UTC, comme le serveur.
  options: '-c timezone=UTC',
});

pool.on('error', (err) => {
  // Une erreur sur une connexion inactive ne doit jamais tuer le processus.
  logger.error({ err }, 'Erreur du pool PostgreSQL sur une connexion inactive');
});

export const db: NodePgDatabase = drizzle(pool, { logger: false });

/**
 * Contrôle de disponibilité pour la sonde de préparation (`/v1/health/ready`).
 * Un `SELECT 1` suffit : on vérifie la connectivité, pas le schéma (le schéma est
 * contrôlé par le diff schéma-vs-04, qui est un job de CI, pas une sonde runtime).
 */
export async function baseDisponible(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (err) {
    logger.error({ err }, 'PostgreSQL injoignable');
    return false;
  }
}

/** Fermeture propre — appelée à l'arrêt du serveur (voir server.ts). */
export async function fermerBase(): Promise<void> {
  await pool.end();
}
