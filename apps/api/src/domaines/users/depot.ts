// =============================================================================
// DÉPÔT DES COMPTES — `users`, plus la LECTURE de `sync_log` qu'exige le garde-fou
// 05 §9.7. Lot L2, tâche T3.
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
// Les deux fragments `sql` de ce fichier sont des GABARITS paramétrés (colonnes
// interpolées par Drizzle), jamais des chaînes assemblées.
//
// ── CE QUE CE DÉPÔT NE FAIT PAS, ET C'EST VOULU ─────────────────────────────
//   · il ne décide rien : les refus (compte introuvable, adresse déjà prise, outbox
//     non vide, garde anti-auto-verrouillage) sont des règles de SERVICE ;
//   · il ne journalise rien : la porte d'écriture unique est
//     `domaines/journal/service.ts`, et le service l'appelle APRÈS le succès ;
//   · il ne rend JAMAIS `password_hash`. La lecture de connexion, qui en a besoin,
//     vit dans `domaines/auth/depot.ts` et n'est pas rouverte ici — « on ne charge
//     pas ce qu'on n'autorise pas ». Les deux lectures ont des formes différentes
//     parce qu'elles ont des finalités différentes.
// Traçabilité : E33 (sécurité), E43 (conventions d'API épinglées : pagination keyset),
// E45 (habilitation §34.4).
// =============================================================================
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { AppError, type PaginationQuery } from '@axion/shared';
import { db } from '../../db.js';
import { syncLog, users, type ProfilUsage, type RoleUtilisateur } from '../../db/schema.js';
import {
  conditionApresCurseur,
  limiteAChercher,
  ordreDuCurseur,
  paginerParCurseur,
  type DefinitionCurseur,
  type PageCurseur,
} from '../../http/pagination.js';
import type { ExecuteurSql } from '../auth/depot.js';

// -----------------------------------------------------------------------------
// LA LIGNE
// -----------------------------------------------------------------------------

/**
 * Un compte tel que la console a le droit de le voir. `password_hash` en est
 * ABSENT, et cette absence est la première des trois ceintures qui l'empêchent de
 * sortir (les deux autres : `userResponseSchema` en `strictObject`, et le
 * sérialiseur Zod qui repasse la réponse par ce schéma avant l'envoi).
 */
export interface LigneUtilisateur {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: RoleUtilisateur;
  readonly usageProfile: ProfilUsage;
  /** §34.4 — `null` tant que l'admin n'a pas prononcé l'habilitation. */
  readonly habilitatedAt: Date | null;
  readonly isActive: boolean;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * La même ligne, plus la composante TEXTUELLE EXACTE du curseur.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI ON NE DÉRIVE **PAS** LE CURSEUR DE `createdAt.toISOString()`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * C'est le geste évident, et il est FAUX. **MESURÉ sur PostgreSQL 16** (un `INSERT`
 * avec le défaut `now()`, relu par `node-postgres`) :
 *
 *     valeur en base (`::text`) : 2026-08-30 19:03:52.845874+00
 *     `Date` JS `.toISOString()` : 2026-08-30T19:03:52.845Z
 *     `SELECT ts > '…845Z'::timestamptz`  →  **true**   ← la ligne se re-sert
 *     `SELECT ts > '…845874+00'`          →  false      ← elle est bien passée
 *
 * `created_at` est un `TIMESTAMPTZ` : PostgreSQL y stocke des MICROSECONDES, et la
 * `Date` de JavaScript n'a que la MILLISECONDE — les trois derniers chiffres sont
 * perdus À LA LECTURE, sans la moindre erreur. Un curseur reconstruit depuis cette
 * `Date` est donc STRICTEMENT INFÉRIEUR à la valeur réelle de la ligne, et la
 * clause `(created_at, id) > (curseur…)` REPREND la ligne frontière à chaque page :
 * un doublon par page, et une BOUCLE INFINIE dès que `limit` lignes partagent la
 * même milliseconde (une transaction d'import, un seed).
 *
 * `apps/api/src/http/pagination.ts` demande « la composante SOUS SA FORME
 * TEXTUELLE, TELLE QU'ELLE SERA COMPARÉE » : on la lit donc à la source, en SQL,
 * plutôt que de la reconstituer après une conversion qui perd de l'information.
 * Le champ ne sort jamais de l'API — la route projette explicitement sur
 * `userResponseSchema`, qui est `strictObject` et le refuserait.
 */
export interface LigneUtilisateurPaginee extends LigneUtilisateur {
  readonly curseurCreatedAt: string;
}

/** Les colonnes rendues, en un seul endroit — deux listes finiraient par diverger. */
const COLONNES_UTILISATEUR = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  usageProfile: users.usageProfile,
  habilitatedAt: users.habilitatedAt,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

// -----------------------------------------------------------------------------
// LISTE — le PREMIER consommateur réel de la pagination keyset
// -----------------------------------------------------------------------------

/**
 * Le curseur de `GET /v1/users` : `(created_at, id)`, **documenté par la note de
 * conception L2 §4.5** et par le contrat 11 §3 (« curseur documenté par route »).
 *
 * ── LES TROIS EXIGENCES DU MODULE DE PAGINATION, VÉRIFIÉES ICI ──────────────
 *  1. « les colonnes du curseur sont NOT NULL » : `created_at` et `id` le sont au
 *     fichier 04. Une composante nulle rendrait la comparaison de n-uplets NULL,
 *     donc AUCUNE ligne, donc une liste qui s'arrête à la première page ;
 *  2. « la DERNIÈRE clé est unique » : `id` est la clé primaire. Sans elle, deux
 *     comptes créés dans la même microseconde s'échangeraient librement et la
 *     pagination sauterait des lignes ;
 *  3. « l'index qui sert le tri couvre les mêmes colonnes » : **IL N'EXISTE PAS**.
 *     Le §7.1 du fichier 04 ne prévoit aucun index sur `users(created_at, id)` — le
 *     tri est donc servi par un tri en mémoire. Correct, et lent au-delà de
 *     quelques milliers de comptes ; **au volume de la Phase 1 (une poignée
 *     d'auditeurs), c'est sans effet mesurable**. Ajouter l'index toucherait le
 *     fichier 04, donc une escalade (`CLAUDE.md` §3-2) : il est REMONTÉ, pas ajouté.
 *
 * SENS ASCENDANT : la liste se lit dans l'ordre de création, du compte fondateur au
 * dernier arrivé. Un compte créé pendant qu'on pagine s'ajoute donc à la FIN et ne
 * déplace aucune page déjà servie — en descendant, il apparaîtrait avant la
 * première page, invisible à qui a commencé sa lecture.
 */
const CURSEUR_UTILISATEURS: DefinitionCurseur<LigneUtilisateurPaginee> = {
  ressource: 'users',
  sens: 'asc',
  cles: [
    { colonne: users.createdAt, valeur: (ligne) => ligne.curseurCreatedAt },
    { colonne: users.id, valeur: (ligne) => ligne.id },
  ],
};

/**
 * Une page de comptes. AUCUN FILTRE, et c'est un choix : le pack n'en nomme aucun
 * (ni par rôle, ni par activité, ni par recherche). En inventer serait inventer du
 * produit ; les ajouter plus tard n'est qu'une extension du schéma de requête
 * (`paginationQuerySchema.extend({ … })`), pas une reprise de cette fonction.
 */
export async function listerUtilisateurs(
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneUtilisateurPaginee>> {
  const lignes = await db
    .select({
      ...COLONNES_UTILISATEUR,
      // La valeur EXACTE, telle que PostgreSQL la détient — voir
      // `LigneUtilisateurPaginee` pour ce que la conversion en `Date` détruirait.
      curseurCreatedAt: sql<string>`${users.createdAt}::text`,
    })
    .from(users)
    .where(conditionApresCurseur(CURSEUR_UTILISATEURS, pagination.after))
    .orderBy(...ordreDuCurseur(CURSEUR_UTILISATEURS))
    .limit(limiteAChercher(pagination));

  return paginerParCurseur(CURSEUR_UTILISATEURS, pagination, lignes);
}

// -----------------------------------------------------------------------------
// LECTURES UNITAIRES
// -----------------------------------------------------------------------------

/** Lit un compte par clé primaire. Rend `null` s'il n'existe pas. */
export async function lireUtilisateur(id: string): Promise<LigneUtilisateur | null> {
  const lignes = await db.select(COLONNES_UTILISATEUR).from(users).where(eq(users.id, id)).limit(1);
  return lignes[0] ?? null;
}

/**
 * Lit un compte ET LE VERROUILLE jusqu'à la fin de la transaction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE `FOR UPDATE` EST CE QUI REND LE JOURNAL VRAI, PAS UNE PRÉCAUTION DE CONFORT.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Les quatre actes distincts (`role`, `deactivate`, `habilitate`, `password-reset`)
 * et la modification ordinaire sont tous des LIRE-PUIS-ÉCRIRE : on a besoin de
 * l'état AVANT pour décider s'il y a un changement, et pour écrire `role_avant` /
 * `role_apres` dans `activity_log`. Sans verrou, deux changements de rôle
 * simultanés lisent tous deux `consultant` et écrivent deux lignes d'audit
 * identiques — dont l'une décrit une transition qui n'a jamais eu lieu. Un journal
 * qui décrit une transition inexistante est pire qu'un journal muet.
 */
export async function lireUtilisateurPourEcriture(
  executeur: ExecuteurSql,
  id: string,
): Promise<LigneUtilisateur | null> {
  const lignes = await executeur
    .select(COLONNES_UTILISATEUR)
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .for('update');

  return lignes[0] ?? null;
}

// -----------------------------------------------------------------------------
// ÉCRITURES
// -----------------------------------------------------------------------------

/** Ce qu'une création de compte fournit. `id` est un UUID v7 frappé par le service. */
export interface NouvelUtilisateur {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly empreinteMotDePasse: string;
  readonly role: RoleUtilisateur;
  readonly usageProfile: ProfilUsage;
}

/**
 * Nom de la contrainte d'unicité de l'adresse, tel que le pose la migration
 * `0001_referentiels.sql`. On le NOMME plutôt que de traiter tout `23505` comme un
 * conflit d'adresse : le jour où une seconde contrainte unique apparaîtra sur
 * `users`, un message parlant d'adresse serait FAUX — et un message d'erreur faux
 * envoie chercher au mauvais endroit, ce qui coûte plus cher qu'un message absent.
 */
const CONTRAINTE_EMAIL_UNIQUE = 'users_email_key';

/** Code SQLSTATE d'une violation d'unicité (PostgreSQL). */
const VIOLATION_UNICITE = '23505';

/**
 * Profondeur de remontée de la chaîne `cause`. Deux suffisent aujourd'hui
 * (`DrizzleQueryError` → `DatabaseError`) ; trois laissent la marge d'un
 * enveloppement supplémentaire sans jamais risquer une boucle.
 */
const PROFONDEUR_MAX_CAUSE = 3;

/**
 * Reconnaît la violation de l'unicité d'adresse SANS `instanceof` ni assertion :
 * l'erreur vient du pilote `pg`, dont le type n'est pas exporté d'une façon sur
 * laquelle il serait sage de s'appuyer. On lit deux propriétés, prudemment.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ON REMONTE LA CHAÎNE `cause`, ET CE N'EST PAS DE LA PRUDENCE DÉCORATIVE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * MESURÉ sur `drizzle-orm@0.44.7` : une requête qui échoue ne propage PAS l'erreur
 * du pilote — elle lève une `DrizzleQueryError` qui porte la requête et ses
 * paramètres, et RANGE la `DatabaseError` de `pg` dans sa propriété `cause`. Ni
 * `code` ni `constraint` ne sont recopiés sur l'enveloppe.
 *
 * La première écriture de cette fonction ne regardait que l'erreur reçue : elle
 * rendait donc TOUJOURS `false`, et une adresse en double sortait en **500
 * INTERNAL_ERROR** au lieu de **409 CONFLICT** — un défaut qui ne se voit pas en
 * lisant le code, seulement en l'exécutant. Il a été trouvé en jouant le cas contre
 * un PostgreSQL réel, pas en relisant.
 */
function estAdresseDejaPrise(erreur: unknown): boolean {
  let courante: unknown = erreur;
  for (let profondeur = 0; profondeur <= PROFONDEUR_MAX_CAUSE; profondeur += 1) {
    if (typeof courante !== 'object' || courante === null) return false;

    const code = 'code' in courante ? courante.code : undefined;
    const contrainte = 'constraint' in courante ? courante.constraint : undefined;
    if (code === VIOLATION_UNICITE && contrainte === CONTRAINTE_EMAIL_UNIQUE) return true;

    courante = 'cause' in courante ? courante.cause : undefined;
  }
  return false;
}

/**
 * Insère un compte. Lève `CONFLICT` si l'adresse est déjà prise.
 *
 * ── POURQUOI ON N'A PAS LU AVANT D'ÉCRIRE ───────────────────────────────────
 * Un `SELECT … WHERE email = $1` préalable ne supprime PAS le besoin de ce
 * `catch` : entre la lecture et l'insertion, une autre requête peut prendre
 * l'adresse. Il n'ajouterait qu'un aller-retour et l'illusion d'une garantie. La
 * CONTRAINTE de base est la seule chose qui décide vraiment ; on l'écoute.
 *
 * `created_at` et `updated_at` sont posés PAR L'APPLICATION malgré leur défaut SQL,
 * pour la raison qu'énonce le dépôt du journal : un horodatage qui vient tantôt de
 * l'application tantôt de la base rend indécidable, à la relecture d'un incident,
 * de quelle horloge on parle. `new Date()` est en UTC dans le protocole PostgreSQL,
 * et la session est forcée en UTC (`db.ts`).
 */
export async function insererUtilisateur(
  nouveau: NouvelUtilisateur,
  maintenant: Date,
): Promise<LigneUtilisateur> {
  let lignes: LigneUtilisateur[];
  try {
    lignes = await db
      .insert(users)
      .values({
        id: nouveau.id,
        name: nouveau.name,
        email: nouveau.email,
        passwordHash: nouveau.empreinteMotDePasse,
        role: nouveau.role,
        usageProfile: nouveau.usageProfile,
        // §34.4 : l'habilitation est un ACTE POSTÉRIEUR (bac à sable + cotation
        // croisée). Un compte naît donc NON habilité, et sa route dédiée existe.
        habilitatedAt: null,
        // « Créé actif » : décision FONCTIONNELLE, d'où le retrait du défaut SQL par
        // la migration `0011`. Elle est écrite ici, une fois, en clair.
        isActive: true,
        lastLoginAt: null,
        createdAt: maintenant,
        updatedAt: maintenant,
      })
      .returning(COLONNES_UTILISATEUR);
  } catch (erreur: unknown) {
    if (estAdresseDejaPrise(erreur)) {
      throw new AppError('CONFLICT', 'Un compte utilise déjà cette adresse électronique.');
    }
    throw erreur;
  }

  const ligne = lignes[0];
  if (ligne === undefined) {
    // Inatteignable : un `INSERT … RETURNING` qui n'échoue pas rend une ligne. On
    // échoue quand même plutôt que d'asserter — une assertion mentirait au compilateur.
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }
  return ligne;
}

/** Les seuls champs que `PATCH /v1/users/:id` peut toucher (voir `users.ts` partagé). */
export interface ChampsModifiables {
  readonly name?: string;
  readonly email?: string;
  readonly usageProfile?: ProfilUsage;
}

/**
 * Applique une modification ordinaire. `updated_at` est TOUJOURS bousculé, parce
 * que le compte a effectivement changé — c'est la seule question à laquelle cette
 * colonne répond (le dépôt d'auth, symétriquement, ne la touche PAS à la connexion :
 * se connecter ne modifie pas le compte).
 */
export async function mettreAJourUtilisateur(
  executeur: ExecuteurSql,
  id: string,
  champs: ChampsModifiables,
  maintenant: Date,
): Promise<LigneUtilisateur | null> {
  let lignes: LigneUtilisateur[];
  try {
    lignes = await executeur
      .update(users)
      .set({ ...champs, updatedAt: maintenant })
      .where(eq(users.id, id))
      .returning(COLONNES_UTILISATEUR);
  } catch (erreur: unknown) {
    if (estAdresseDejaPrise(erreur)) {
      throw new AppError('CONFLICT', 'Un compte utilise déjà cette adresse électronique.');
    }
    throw erreur;
  }
  return lignes[0] ?? null;
}

/** Change le rôle global (`users.role`). L'ancien rôle est lu AVANT, sous verrou. */
export async function changerRoleUtilisateur(
  executeur: ExecuteurSql,
  id: string,
  role: RoleUtilisateur,
  maintenant: Date,
): Promise<LigneUtilisateur | null> {
  const lignes = await executeur
    .update(users)
    .set({ role, updatedAt: maintenant })
    .where(eq(users.id, id))
    .returning(COLONNES_UTILISATEUR);

  return lignes[0] ?? null;
}

/**
 * Désactive un compte. **Il n'existe AUCUNE suppression** : le fichier 04 ne donne
 * pas de `deleted_at` à `users`, et le cycle de sortie §34.4 dit « révocation +
 * retrait des `mission_users` », jamais suppression. Une ligne `users` est
 * référencée par une douzaine de clés étrangères (`interviews.conducted_by`,
 * `answer_revisions.changed_by`…) : l'effacer réécrirait l'historique d'un audit.
 */
export async function desactiverUtilisateur(
  executeur: ExecuteurSql,
  id: string,
  maintenant: Date,
): Promise<LigneUtilisateur | null> {
  const lignes = await executeur
    .update(users)
    .set({ isActive: false, updatedAt: maintenant })
    .where(eq(users.id, id))
    .returning(COLONNES_UTILISATEUR);

  return lignes[0] ?? null;
}

/** Pose `habilitated_at` (§34.4). Le service refuse de le REPOSER — invariant 7. */
export async function habiliterUtilisateur(
  executeur: ExecuteurSql,
  id: string,
  maintenant: Date,
): Promise<LigneUtilisateur | null> {
  const lignes = await executeur
    .update(users)
    .set({ habilitatedAt: maintenant, updatedAt: maintenant })
    .where(eq(users.id, id))
    .returning(COLONNES_UTILISATEUR);

  return lignes[0] ?? null;
}

/** Remplace l'empreinte du mot de passe. La VALEUR ne transite jamais par ici. */
export async function remplacerEmpreinteMotDePasse(
  executeur: ExecuteurSql,
  id: string,
  empreinte: string,
  maintenant: Date,
): Promise<LigneUtilisateur | null> {
  const lignes = await executeur
    .update(users)
    .set({ passwordHash: empreinte, updatedAt: maintenant })
    .where(eq(users.id, id))
    .returning(COLONNES_UTILISATEUR);

  return lignes[0] ?? null;
}

// -----------------------------------------------------------------------------
// LA DONNÉE DU GARDE-FOU 05 §9.7
// -----------------------------------------------------------------------------

/** Le dernier état de sync connu d'UN appareil. */
export interface DernierEtatDeSync {
  readonly deviceId: string | null;
  readonly outboxRemaining: number | null;
}

/**
 * LE DERNIER ÉTAT DE SYNC CONNU, PAR APPAREIL, POUR UN COMPTE.
 *
 * 05 §9.7 définit la donnée mot pour mot : « chaque push remonte
 * `outbox_remaining`, conservé dans `sync_log` ; “outbox non vide” = dernier
 * `sync_log.outbox_remaining` > 0 **ou aucune sync connue de l'appareil** ».
 *
 * ── TROIS CHOIX DE LECTURE, ET CE QUI LES FONDE ─────────────────────────────
 *  1. **PAR APPAREIL** (`DISTINCT ON (device_id)`), et non « la dernière ligne du
 *     compte ». Un auditeur peut avoir une tablette et un portable ; la dernière
 *     sync du portable ne dit RIEN de ce qui dort dans l'outbox de la tablette, et
 *     c'est cette tablette-là que la réinitialisation rendrait illisible. Prendre
 *     la seule ligne la plus récente aurait donné un garde-fou qui rassure ;
 *  2. **AUCUN FILTRE SUR `direction`.** Le §9.7 parle du « dernier état de sync
 *     CONNU », pas du dernier push. Le filtre qui compte est
 *     `outbox_remaining IS NOT NULL` : une ligne qui ne porte pas la donnée n'est
 *     pas un état connu, quelle que soit sa direction ;
 *  3. **L'ORDRE EST `coalesce(ended_at, started_at) DESC`.** `sync_log` n'a NI
 *     `created_at` NI id ordonnable (son défaut est `gen_random_uuid()`, un v4) :
 *     il n'existe aucune autre façon de dire « le dernier ». `NULLS LAST` fait
 *     perdre une ligne sans aucun horodatage face à une ligne datée — c'est le bon
 *     sens : une ligne qu'on ne sait pas dater ne peut pas être « la dernière ».
 *
 * Rendre un tableau VIDE signifie « aucune sync connue » — que le service traite
 * comme un refus, exactement comme le §9.7 l'écrit.
 */
export async function lireDerniersEtatsDeSync(
  executeur: ExecuteurSql,
  utilisateurId: string,
): Promise<readonly DernierEtatDeSync[]> {
  return executeur
    .selectDistinctOn([syncLog.deviceId], {
      deviceId: syncLog.deviceId,
      outboxRemaining: syncLog.outboxRemaining,
    })
    .from(syncLog)
    .where(and(eq(syncLog.userId, utilisateurId), isNotNull(syncLog.outboxRemaining)))
    .orderBy(
      syncLog.deviceId,
      sql`coalesce(${syncLog.endedAt}, ${syncLog.startedAt}) desc nulls last`,
    );
}
