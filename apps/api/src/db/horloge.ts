// =============================================================================
// L'HORLOGE DES ÉCRITURES QUI DESCENDENT — revue A17, L6c-3 (V2)
// =============================================================================
// Le plafond du pull compare `updated_at` à l'heure de la BASE. Toute écriture
// d'une table qui descend vers le terrain (push, mais aussi écritures du siège :
// unités, missions, réaffectation de session) horodate donc avec `now()` de la
// base (début de sa transaction), et sa transaction ne vit pas plus longtemps que
// la durée max du push : chaque instruction ET chaque attente de verrou y sont
// bornées, puis la durée TOTALE est mesurée juste avant le commit. La marge du
// pull (60 s) excédant cette durée (30 s), une ligne validée après un pull est
// forcément au-dessus du plafond qu'il a rendu : elle redescend.
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AppError } from '@axion/shared';

type TransactionPg = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** La base, ou une transaction (ou un point de sauvegarde) en cours. */
export type ExecuteurHorloge = NodePgDatabase | TransactionPg;

/** Durée max par défaut d'une écriture descendante : celle du lot de push. */
export const DUREE_MAX_ECRITURE_DESCENDANTE_MS = 30_000;

let dureeMaxEcriture = DUREE_MAX_ECRITURE_DESCENDANTE_MS;

/**
 * Réglage de la durée max (tests). `reglerDelaisSync({ dureeMaxPushMs })` le
 * fait suivre ici : push et siège partagent UNE seule durée.
 */
export function reglerDureeMaxEcriture(dureeMs: number): void {
  dureeMaxEcriture = dureeMs;
}

/** La durée max courante d'une écriture descendante (push compris). */
export function dureeMaxEcritureDescendante(): number {
  return dureeMaxEcriture;
}

/** Durée maximale de la transaction dépassée, mesurée juste avant le commit. */
export class DelaiDepasse extends Error {
  constructor() {
    super('delai');
  }
}

/** SQLSTATE `57014` (statement_timeout) et `55P03` (lock_timeout). */
export const CODES_DELAI_DEPASSE: ReadonlySet<string> = new Set(['57014', '55P03']);

/** Le code SQLSTATE d'une erreur PostgreSQL, même enveloppée (`cause`). */
export function codeSqlDe(erreur: unknown): string {
  for (let e: unknown = erreur, i = 0; e instanceof Error && i < 3; e = e.cause, i += 1) {
    if ('code' in e && typeof e.code === 'string') return e.code;
  }
  return 'inconnu';
}

const MESSAGE_DELAI_SIEGE =
  "L'enregistrement a pris trop de temps : rien n'a été modifié. Réessayez dans un instant.";

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
 * Une écriture du siège sur une table qui descend : transaction bornée comme un
 * lot de push, `maintenant` = heure de la base, et durée TOTALE contrôlée avant
 * le commit. Dépassement (total, instruction ou verrou) → transaction annulée,
 * rien d'écrit, `503 SERVICE_UNAVAILABLE` réessayable.
 */
export async function transactionDescendante<T>(
  base: NodePgDatabase,
  travail: (tx: TransactionPg, maintenant: Date) => Promise<T>,
): Promise<T> {
  const dureeMax = dureeMaxEcriture;
  const chrono = performance.now();
  try {
    return await base.transaction(async (tx) => {
      await bornerLaTransaction(tx, dureeMax);
      const maintenant = await lireHorlogeDuLot(tx);
      const resultat = await travail(tx, maintenant);
      // Mesuré AVANT le commit : une écriture trop longue ne valide rien.
      if (performance.now() - chrono > dureeMax) throw new DelaiDepasse();
      return resultat;
    });
  } catch (erreur) {
    if (erreur instanceof DelaiDepasse || CODES_DELAI_DEPASSE.has(codeSqlDe(erreur))) {
      throw new AppError('SERVICE_UNAVAILABLE', MESSAGE_DELAI_SIEGE);
    }
    throw erreur;
  }
}
