// =============================================================================
// L'HORLOGE DES ÉCRITURES QUI DESCENDENT — revue A17, L6c-3 (V2)
// =============================================================================
// Le plafond du pull compare `updated_at` à l'heure de la BASE. Toute écriture
// d'une table qui descend vers le terrain (push, mais aussi écritures du siège :
// unités, missions, réaffectation de session) horodate donc avec `now()` de la
// base, dans une transaction bornée à la même durée max que le push : une seule
// horloge pour écrire et pour lire.
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type TransactionPg = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** La base, ou une transaction (ou un point de sauvegarde) en cours. */
export type ExecuteurHorloge = NodePgDatabase | TransactionPg;

/**
 * Durée max d'une transaction qui écrit une table descendante : celle du lot de
 * push (`DELAIS_SYNC_DEFAUT.dureeMaxPushMs`), sous la marge du pull (60 s).
 */
export const DUREE_MAX_ECRITURE_DESCENDANTE_MS = 30_000;

/**
 * L'heure de la BASE au début de la transaction (`now()`) : tous les `updated_at`
 * de la transaction la partagent. C'est elle, et non l'heure de l'application,
 * que le plafond du pull compare.
 */
export async function lireHorlogeDuLot(ex: ExecuteurHorloge): Promise<Date> {
  const resultat = await ex.execute<{ maintenant: Date | string }>(sql`SELECT now() AS maintenant`);
  const [ligne] = resultat.rows;
  if (ligne === undefined) throw new Error('horloge de la base illisible');
  return new Date(ligne.maintenant);
}

/**
 * Borne chaque instruction ET chaque attente de verrou de la transaction à
 * `dureeMs`, pour la seule transaction en cours (`set_config(…, true)` =
 * `SET LOCAL`, paramétré).
 */
export async function bornerLaTransaction(ex: ExecuteurHorloge, dureeMs: number): Promise<void> {
  const valeur = `${String(Math.max(1, Math.floor(dureeMs)))}ms`;
  await ex.execute(
    sql`SELECT set_config('statement_timeout', ${valeur}, true),
               set_config('lock_timeout', ${valeur}, true)`,
  );
}

/**
 * À appeler EN PREMIER dans la transaction d'une écriture du siège sur une table
 * qui descend : borne la transaction comme un lot de push, puis rend l'heure de
 * la base, qui sert de `updated_at` (jamais `new Date()` de l'application).
 */
export async function ouvrirEcritureDescendante(ex: ExecuteurHorloge): Promise<Date> {
  await bornerLaTransaction(ex, DUREE_MAX_ECRITURE_DESCENDANTE_MS);
  return lireHorlogeDuLot(ex);
}
