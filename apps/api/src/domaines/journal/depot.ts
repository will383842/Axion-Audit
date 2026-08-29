// =============================================================================
// DÉPÔT DU JOURNAL D'ACTIVITÉ — LE SEUL FICHIER QUI ÉCRIT DANS `activity_log`.
// Lot L2, tâche T4. Note de conception `docs/conception/LOT_L2.md` §2.4.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER EST LA PORTE. IL N'Y EN A PAS DEUX, ET C'EST TOUT SON OBJET.
// ═══════════════════════════════════════════════════════════════════════════════
// Si deux chemins peuvent écrire dans `activity_log`, la garantie que la table
// porte — « meta est fermé par action », « aucune donnée personnelle » — n'existe
// plus : elle vaut ce que vaut le chemin le plus laxiste. Et un troisième chemin
// s'ajoutera, parce qu'un deuxième aura montré que c'était permis.
//
// ── LES TROIS CEINTURES DE L'UNICITÉ, ET CE QUE CHACUNE VAUT ─────────────────
//  1. TYPE — ce module est le SEUL de `apps/api/src` à importer le symbole Drizzle
//     `activityLog`. Un appelant qui veut écrire à côté doit d'abord importer la
//     table : le diff le montre, et la ceinture 3 le refuse. Ceinture FAIBLE seule
//     (rien n'empêche cet import à la compilation), forte combinée à la 3.
//  2. SURFACE — la seule fonction exportée INSÈRE. Il n'existe ici NI `update`, NI
//     `delete`, NI `upsert`, et il ne doit jamais en exister : invariant 7, « rien
//     n'est jamais silencieusement écrasé ou supprimé ». Un journal qu'on peut
//     modifier n'est pas un journal, c'est un brouillon.
//  3. BALAYAGE — `scripts/check-porte-journal.mjs` refuse tout fichier du dépôt,
//     autre que celui-ci, qui écrit dans la table (`insert/update/delete` sur le
//     symbole Drizzle, ou `INSERT INTO / UPDATE / DELETE FROM activity_log` en SQL).
//     Il énumère les fichiers qui EXISTENT, pas ceux auxquels on a pensé.
//
// ── CE QUE CES TROIS CEINTURES NE COUVRENT PAS ───────────────────────────────
// Elles couvrent le CODE DE CE DÉPÔT. Elles ne couvrent NI un `psql` d'administrateur,
// NI un futur service partageant la base, NI une migration qui écrirait des lignes.
// La seule barrière qui couvrirait ces trois cas est un `REVOKE UPDATE, DELETE ON
// activity_log` sur le rôle applicatif — c'est-à-dire du DDL, donc le fichier 04,
// donc une escalade (`CLAUDE.md` §3-2). Elle est REMONTÉE, pas improvisée ici.
//
// ── POURQUOI L'`id` EST UN UUID v7 APPLICATIF, ALORS QUE LA COLONNE A UN DÉFAUT ──
// La migration `0007_transverse.sql` pose `DEFAULT gen_random_uuid()` (v4), toléré
// par 11 §2 sur les tables purement serveur. Ce défaut RESTE en place : c'est le
// filet de toute insertion qui ne passerait pas par ici (une migration, un
// correctif manuel) — un id est toujours produit, jamais un `NOT NULL` violé.
// Mais les lignes écrites PAR LA PORTE portent un v7 (`uuidv7`, 11 §2 : « côté
// applicatif, client ET serveur »), pour la raison que le fichier 04 énonce en tête
// de son §7 : « `id` = UUID (v7 pour l'ordonnancement temporel) ». Un journal se lit
// par ordre chronologique et se paginera en keyset (11 §3) ; un v4 rendrait cet
// ordre indisponible sans trier sur `created_at`, qui n'est pas unique. Les deux
// textes sont satisfaits : le défaut SQL reste v4, le chemin applicatif produit v7.
// Traçabilité : E33 (sécurité), E42 (RGPD renforcé : rétention activity_log).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import type { ContenuLigneJournal } from '@axion/shared';
import { db } from '../../db.js';
import { activityLog } from '../../db/schema.js';

/**
 * Une ligne prête à écrire : le contenu validé par le catalogue partagé, plus le
 * contexte de la requête.
 *
 * `ip` est le SEUL ajout, et il est ici plutôt que dans le catalogue partagé pour
 * une raison de régime : `packages/shared` part dans un navigateur, et une adresse
 * IP est une donnée personnelle qui n'a rien à y faire. Elle n'existe que côté
 * serveur, où 06 §10.4 l'autorise NOMMÉMENT dans cette table (rétention 12 mois,
 * anonymisation à 90 j) — et où la redaction de pino la masque partout ailleurs.
 */
export interface LigneJournalAEcrire extends ContenuLigneJournal {
  /** `request.ip`. Écrite TELLE QUELLE : c'est le régime de la table (§2.4). */
  readonly ip: string | null;
}

/**
 * Insère UNE ligne. Rend l'identifiant produit — l'appelant peut ainsi corréler la
 * ligne d'audit avec sa trace d'exploitation SANS journaliser la charge utile.
 *
 * `createdAt` est posé ici et non par le défaut SQL : le dépôt d'auth fait de même
 * pour `refresh_tokens`, et l'uniformité importe — un horodatage qui vient tantôt de
 * l'application tantôt de la base rend indécidable, à la relecture d'un incident,
 * de quelle horloge on parle. `new Date()` est en UTC dans le protocole PostgreSQL,
 * et la session est forcée en UTC (`db.ts`) : invariant 5 tenu.
 *
 * AUCUN `try/catch` ICI. La gestion d'un échec d'écriture est une décision de
 * POLITIQUE (faut-il refuser la requête de l'auditeur parce que la table d'audit
 * est pleine ?), pas une décision de dépôt. Elle est prise une seule fois, dans
 * `service.ts`, et elle y est écrite en toutes lettres.
 */
export async function insererLigneJournal(ligne: LigneJournalAEcrire): Promise<string> {
  const id = uuidv7();

  await db.insert(activityLog).values({
    id,
    userId: ligne.utilisateurId,
    action: ligne.action,
    entityType: ligne.entityType,
    entityId: ligne.entityId,
    meta: ligne.meta,
    ip: ligne.ip,
    createdAt: new Date(),
  });

  return id;
}
