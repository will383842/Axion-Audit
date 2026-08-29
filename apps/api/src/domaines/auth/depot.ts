// =============================================================================
// DÉPÔT D'AUTHENTIFICATION — `users` (lecture de connexion) et `refresh_tokens`.
// Lot L2, tâche T2.
//
// ── POURQUOI CE DÉPÔT N'EST PAS `apps/api/src/auth/depot.ts` ──────────────────
// Le dépôt du SOCLE lit l'utilisateur du chemin chaud — à chaque requête
// authentifiée — et son commentaire dit pourquoi il ne charge NI email NI
// `password_hash` : « on ne charge pas ce qu'on n'autorise pas ». Élargir cette
// lecture-là pour y ajouter l'empreinte du mot de passe ferait circuler un secret
// dans tous les gestionnaires de routes de l'application, pour le seul bénéfice
// d'une route sur cent. Les deux lectures ont des formes différentes parce qu'elles
// ont des finalités différentes : c'est une séparation, pas un doublon.
// (La lecture par clé primaire, elle, N'EST PAS redite ici : le service de
// rafraîchissement importe `lireUtilisateurAuthentifie` du socle.)
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
// Traçabilité : E5, E33.
// =============================================================================
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { db } from '../../db.js';
import { refreshTokens, users } from '../../db/schema.js';

/**
 * Une transaction Drizzle, dérivée de la signature de `transaction` plutôt que
 * réécrite à la main : le type suit la version épinglée sans qu'on ait à le savoir,
 * et aucune assertion n'est nécessaire.
 */
type TransactionPg = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/**
 * Ce qui exécute une requête : la base, ou une transaction en cours. Les fonctions
 * de rotation l'EXIGENT en premier argument — c'est ce qui rend impossible d'écrire
 * une révocation hors de la transaction qui l'accompagne (note L2 §2.3 : révocation
 * et insertion du successeur sont UNE transaction, ou la détection ment).
 */
export type ExecuteurSql = NodePgDatabase | TransactionPg;

// -----------------------------------------------------------------------------
// `users` — la lecture de CONNEXION, et elle seule
// -----------------------------------------------------------------------------

/** Le strict nécessaire pour décider d'une connexion. */
export interface IdentifiantsUtilisateur {
  readonly id: string;
  /** Empreinte Argon2id au format PHC. Ne sort JAMAIS de la couche d'auth. */
  readonly empreinteMotDePasse: string;
  readonly estActif: boolean;
}

/**
 * Lit un compte par son adresse. Rend `null` s'il n'existe pas.
 *
 * COMPARAISON SENSIBLE À LA CASSE, et c'est le schéma qui le décide : le fichier 04
 * déclare `email TEXT` avec `UNIQUE (email)` — ni `CITEXT`, ni index fonctionnel sur
 * `lower(email)`. Rendre la recherche insensible ici sans que la contrainte d'unicité
 * le soit ouvrirait la porte à deux comptes « identiques » que la requête ne saurait
 * plus départager. Le confort de saisie se traite côté champ (`type="email"`, qui
 * désactive la capitalisation automatique) ; l'alignement du schéma est une fiche
 * AMELIORATIONS, pas une improvisation de dépôt.
 *
 * `limit(1)` malgré l'unicité : une contrainte protège l'écriture, elle ne dispense
 * pas la lecture d'être bornée.
 */
export async function lireIdentifiantsParEmail(
  email: string,
): Promise<IdentifiantsUtilisateur | null> {
  const lignes = await db
    .select({
      id: users.id,
      empreinteMotDePasse: users.passwordHash,
      estActif: users.isActive,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return lignes[0] ?? null;
}

/**
 * Horodate la connexion (`users.last_login_at`).
 *
 * POURQUOI ELLE EXISTE : la route de connexion est le SEUL écrivain possible de
 * cette colonne du fichier 04. La laisser éternellement `NULL` livrerait un schéma
 * dont une colonne n'est remplie par personne.
 *
 * POURQUOI `updated_at` N'EST PAS TOUCHÉ : se connecter ne MODIFIE pas le compte.
 * Bousculer `updated_at` à chaque connexion ferait remonter en tête de toute liste
 * triée par modification des comptes que personne n'a modifiés, et brouillerait la
 * seule question à laquelle cette colonne répond : « quand ce compte a-t-il changé ? ».
 */
export async function horodaterConnexion(
  executeur: ExecuteurSql,
  utilisateurId: string,
  maintenant: Date,
): Promise<void> {
  await executeur.update(users).set({ lastLoginAt: maintenant }).where(eq(users.id, utilisateurId));
}

// -----------------------------------------------------------------------------
// `refresh_tokens`
// -----------------------------------------------------------------------------

/** L'état d'un jeton stocké, tel que la rotation a besoin de le connaître. */
export interface JetonStocke {
  readonly id: string;
  readonly utilisateurId: string;
  readonly expireLe: Date;
  /** `null` tant que le jeton est vivant. Non nul = révoqué, et QUAND. */
  readonly revoqueLe: Date | null;
}

/** Enregistre un jeton neuf. L'`id` est un UUID v7 frappé par l'appelant (11 §2). */
export async function insererJeton(
  executeur: ExecuteurSql,
  jeton: {
    readonly id: string;
    readonly utilisateurId: string;
    readonly empreinte: string;
    readonly expireLe: Date;
  },
): Promise<void> {
  await executeur.insert(refreshTokens).values({
    id: jeton.id,
    userId: jeton.utilisateurId,
    tokenHash: jeton.empreinte,
    expiresAt: jeton.expireLe,
    // `device_label` reste NULL : aucune route de ce lot ne le lit, et il est masqué
    // par la redaction du journal (« le Pixel de Jean » identifie son porteur). On
    // n'accepte pas une donnée personnelle non authentifiée sans consommateur.
  });
}

/**
 * Lit un jeton par empreinte ET LE VERROUILLE jusqu'à la fin de la transaction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE `FOR UPDATE` EST LA MOITIÉ DE LA DÉTECTION DE RÉUTILISATION. À NE PAS ÔTER.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sans lui, deux rafraîchissements RIGOUREUSEMENT SIMULTANÉS avec le même jeton
 * lisent tous deux `revoked_at IS NULL`, et l'ordre du dénouement dépend de qui
 * gagne la course : selon les cas, deux successeurs valides sont émis (le vol
 * devient indétectable), ou l'un des deux passe pour un voleur. Avec lui, la seconde
 * transaction ATTEND la première, relit la ligne révoquée et prend une décision
 * déterministe — celle de la fenêtre de grâce.
 *
 * Une ligne absente ne verrouille rien : c'est sans conséquence, il n'y a alors rien
 * à protéger (voir la branche « jeton inconnu » du service).
 */
export async function lireJetonPourRotation(
  executeur: ExecuteurSql,
  empreinte: string,
): Promise<JetonStocke | null> {
  const lignes = await executeur
    .select({
      id: refreshTokens.id,
      utilisateurId: refreshTokens.userId,
      expireLe: refreshTokens.expiresAt,
      revoqueLe: refreshTokens.revokedAt,
    })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, empreinte))
    .limit(1)
    .for('update');

  return lignes[0] ?? null;
}

/**
 * Révoque UN jeton, à condition qu'il soit encore vivant.
 *
 * Rend le nombre de lignes réellement révoquées : 0 signifie « quelqu'un d'autre est
 * passé avant ». La clause `revoked_at IS NULL` n'est pas décorative — c'est elle qui
 * empêche d'écraser l'horodatage d'une révocation ANTÉRIEURE, or c'est cet horodatage
 * qui fait vivre la fenêtre de grâce.
 *
 * La ligne SURVIT, révoquée : la supprimer rendrait « jeton rejoué » et « jeton
 * inconnu » indiscernables (note L2 §2.3), et la détection de vol disparaîtrait avec.
 */
export async function revoquerJeton(
  executeur: ExecuteurSql,
  jetonId: string,
  maintenant: Date,
): Promise<number> {
  const lignes = await executeur
    .update(refreshTokens)
    .set({ revokedAt: maintenant })
    .where(and(eq(refreshTokens.id, jetonId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  return lignes.length;
}

/**
 * RÉVOCATION « FAMILLE » — c'est-à-dire TOUS les jetons vivants de l'utilisateur.
 *
 * ── L'ARBITRAGE, ET SON COÛT, ÉCRIT ICI PLUTÔT QUE DANS UNE MIGRATION ─────────
 * `refresh_tokens(id, user_id, token_hash, expires_at, revoked_at, device_label)` ne
 * porte AUCUNE lignée : ni `family_id`, ni `replaced_by`. `device_label` est
 * nullable, fourni par le client et non authentifié — y adosser une portée de
 * révocation serait pire que pas de portée du tout. Modifier le fichier 04 est une
 * escalade (CLAUDE.md §3-2). La note de conception L2 §2.3 tranche donc :
 * « famille » = tous les jetons vivants de l'utilisateur.
 *
 * CE QUE ÇA COÛTE, EN CLAIR : une réutilisation détectée sur UN appareil DÉCONNECTE
 * LA SYNCHRONISATION DE TOUS LES APPAREILS de cet auditeur. Le coût est borné et non
 * destructeur (05 §31.3 : la saisie hors ligne continue, le déverrouillage local
 * dérive du mot de passe et non du jeton) — il faut une reconnexion pour
 * resynchroniser. Ce n'est pas une perte de données ; c'est une interruption de sync
 * en pleine mission, ce qui est déjà beaucoup.
 *
 * Une fiche AMELIORATIONS d'étage 2 (`family_id` + `replaced_by_id`) est proposée
 * avec la note ; elle n'est PAS implémentée avant arbitrage (09 §5.9).
 */
export async function revoquerFamille(
  executeur: ExecuteurSql,
  utilisateurId: string,
  maintenant: Date,
): Promise<number> {
  const lignes = await executeur
    .update(refreshTokens)
    .set({ revokedAt: maintenant })
    .where(and(eq(refreshTokens.userId, utilisateurId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  return lignes.length;
}

/**
 * Révoque le jeton présenté à la déconnexion — À CONDITION QU'IL APPARTIENNE à
 * l'utilisateur authentifié.
 *
 * La condition de propriété est DANS LA CLAUSE `WHERE`, jamais dans un `if` qui
 * suivrait une lecture : ainsi il n'existe aucun chemin de code où l'on connaisse
 * l'existence d'un jeton d'autrui, donc aucun chemin où l'on puisse la divulguer par
 * un statut, un message ou un temps de réponse différent. La déconnexion rend la même
 * chose que le jeton ait existé ou non (05 §8.1 : « révoque le refresh », rien de plus).
 */
export async function revoquerJetonDeLUtilisateur(
  empreinte: string,
  utilisateurId: string,
  maintenant: Date,
): Promise<number> {
  const lignes = await db
    .update(refreshTokens)
    .set({ revokedAt: maintenant })
    .where(
      and(
        eq(refreshTokens.tokenHash, empreinte),
        eq(refreshTokens.userId, utilisateurId),
        isNull(refreshTokens.revokedAt),
      ),
    )
    .returning({ id: refreshTokens.id });

  return lignes.length;
}
