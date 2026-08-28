// =============================================================================
// LECTURE DE L'UTILISATEUR AUTHENTIFIÉ — lot L2, tâche T1.
//
// POURQUOI CETTE LECTURE EXISTE (note de conception L2 §2.1)
// 06 §10.1 exige des comptes « désactivables INSTANTANÉMENT ». Un jeton d'accès de
// 15 minutes ne le permet pas : entre la désactivation d'un consultant et
// l'expiration de son dernier jeton, il continuerait de lire des missions.
// Le crochet d'autorisation relit donc `users` À CHAQUE REQUÊTE AUTHENTIFIÉE — une
// lecture par clé primaire, indexée. Le jeton porte l'identité ; la base porte les
// droits.
//
// COÛT ASSUMÉ, NON MESURÉ (note §6.4) : une lecture par PK par requête. Aucune charge
// k6 n'existe avant L6c ; c'est une conviction, pas une mesure. Si elle coûte, le
// remède est un cache Redis COURT — jamais un jeton qui se suffirait à lui-même,
// ce qui reviendrait à réintroduire le quart d'heure de retard qu'on vient de payer
// pour supprimer.
//
// Drizzle ne sert QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL ici, aucun SQL concaténé.
// Traçabilité : E5 (RBAC serveur systématique).
// =============================================================================
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { users, type RoleUtilisateur } from '../db/schema.js';

/**
 * L'utilisateur tel que le crochet d'autorisation en a besoin — et rien de plus.
 *
 * Ni `email`, ni `name`, ni `password_hash` : ce sont des données personnelles
 * (11 §2) qui traverseraient ensuite tous les gestionnaires de routes et finiraient
 * dans un `log.info` de débogage. On ne charge pas ce qu'on n'autorise pas.
 */
export interface UtilisateurAuthentifie {
  readonly id: string;
  readonly role: RoleUtilisateur;
  readonly estActif: boolean;
  /** §34.4 — `NULL` tant que l'habilitation n'est pas prononcée. */
  readonly habiliteLe: Date | null;
}

/**
 * Lit l'utilisateur par clé primaire. Rend `null` s'il n'existe pas.
 *
 * Un jeton authentique dont le `sub` ne correspond à aucune ligne est traité comme
 * une absence, pas comme une anomalie : c'est le cas normal d'un compte supprimé.
 */
export async function lireUtilisateurAuthentifie(
  utilisateurId: string,
): Promise<UtilisateurAuthentifie | null> {
  const lignes = await db
    .select({
      id: users.id,
      role: users.role,
      estActif: users.isActive,
      habiliteLe: users.habilitatedAt,
    })
    .from(users)
    .where(eq(users.id, utilisateurId))
    .limit(1);

  return lignes[0] ?? null;
}
