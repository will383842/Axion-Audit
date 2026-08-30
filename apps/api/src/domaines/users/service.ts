// =============================================================================
// SERVICE DES COMPTES — les règles, les refus, et la trace. Lot L2, tâche T3.
//
// ── CE QUI VIT ICI, ET NULLE PART AILLEURS ──────────────────────────────────
//   · les REFUS métier (compte introuvable, garde anti-auto-verrouillage, garde-fou
//     05 §9.7) — le dépôt, lui, ne décide rien ;
//   · le fait qu'une modification qui NE CHANGE RIEN ne produit NI écriture NI
//     ligne de journal ;
//   · l'appel à la porte d'écriture unique du journal, TOUJOURS après le succès de
//     la transaction — jamais dedans.
//
// ── POURQUOI LE JOURNAL EST ÉCRIT HORS TRANSACTION ──────────────────────────
// `journaliserActivite` écrit par `db`, pas par la transaction en cours, et NE LÈVE
// JAMAIS (voir l'en-tête de `domaines/journal/service.ts` : une table d'audit
// saturée ne doit pas arrêter la collecte). L'appeler DANS la transaction n'aurait
// donc rien atomisé — la ligne serait partie de toute façon — et l'appeler AVANT
// aurait tracé des actes qui n'ont pas eu lieu si la transaction échoue. Après le
// succès, donc : le journal décrit ce qui EST arrivé.
//
// ── CE QUE LE JOURNAL NE PORTE JAMAIS ───────────────────────────────────────
// Ni le nom, ni l'adresse, ni l'ancienne ou la nouvelle valeur d'un champ, ni
// AUCUN mot de passe. `user.update` porte les NOMS des champs touchés ; c'est le
// catalogue partagé qui rend le reste inexprimable, pas la vigilance d'ici.
// Traçabilité : E33 (sécurité), E43, E45 (habilitation §34.4).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import {
  AppError,
  type CreateUserRequest,
  type PaginationQuery,
  type RoleUtilisateur,
  type UpdateUserRequest,
  type CHAMPS_UTILISATEUR_JOURNALISABLES,
} from '@axion/shared';
import { db } from '../../db.js';
import type { ProfilUsage } from '../../db/schema.js';
import type { PageCurseur } from '../../http/pagination.js';
import { revoquerFamille } from '../auth/depot.js';
import { journaliserActivite, type ContexteJournal } from '../journal/service.js';
import {
  changerRoleUtilisateur,
  desactiverUtilisateur,
  habiliterUtilisateur,
  insererUtilisateur,
  lireDerniersEtatsDeSync,
  lireUtilisateurPourEcriture,
  listerUtilisateurs,
  mettreAJourUtilisateur,
  remplacerEmpreinteMotDePasse,
  type LigneUtilisateur,
  type LigneUtilisateurPaginee,
} from './depot.js';
import { engendrerMotDePasse, hacherMotDePasse } from './mots-de-passe.js';

/** Un champ dont `user.update` sait dire le NOM (jamais la valeur). */
type ChampJournalisable = (typeof CHAMPS_UTILISATEUR_JOURNALISABLES)[number];

/** Message unique du compte introuvable. */
const MESSAGE_COMPTE_INTROUVABLE = "Ce compte n'existe pas.";

/**
 * Rendu quand un `UPDATE … RETURNING` ne rend rien alors que la ligne vient d'être
 * lue SOUS VERROU dans la même transaction : inatteignable, mais on échoue plutôt
 * qu'on asserte — une assertion mentirait au compilateur.
 */
function incoherenceInterne(): AppError {
  return new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE GARDE ANTI-AUTO-VERROUILLAGE — une DÉCISION, et elle n'est pas au pack.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Un administrateur ne peut ni se désactiver, ni changer SON PROPRE rôle.
 *
 * CE QU'IL EMPÊCHE, MESURÉ SUR LE CODE : la console est admin seul (03 §34.1), et
 * les comptes ne se gèrent QUE par ces routes-ci. Un `PATCH …/role {role:
 * 'lecteur'}` sur son propre compte, ou une désactivation par mégarde, retirerait
 * donc à l'auteur le droit de se rétablir — et, sur une installation à un seul
 * administrateur (la Phase 1, littéralement), fermerait l'administration du produit
 * à tout le monde. Le seul recours serait un `psql` sur le serveur.
 *
 * CE QU'IL N'EMPÊCHE PAS, ET IL FAUT LE DIRE : deux administrateurs peuvent encore
 * se rétrograder MUTUELLEMENT. Fermer ce cas-là demanderait une règle « il doit
 * rester au moins un administrateur actif » — un contrôle de cardinalité, donc une
 * règle de PRODUIT (que faire du dernier admin ? le refus est-il un 409 ?) et une
 * course à sérialiser. Ce n'est pas une convention qui se déduit : c'est REMONTÉ,
 * pas improvisé. Le garde ci-dessous, lui, est déterministe et sans course.
 *
 * `FORBIDDEN` et non `CONFLICT` : ce n'est pas l'état du compte qui s'y oppose,
 * c'est QUI le demande. Le même appel sur un autre compte est parfaitement légitime.
 */
function refuserSurSonPropreCompte(adminId: string, cibleId: string, acte: string): void {
  if (adminId === cibleId) {
    throw new AppError(
      'FORBIDDEN',
      `Vous ne pouvez pas ${acte} votre propre compte : un administrateur qui se retire ` +
        `ses droits ne peut plus se les rendre.`,
    );
  }
}

// -----------------------------------------------------------------------------
// LECTURE
// -----------------------------------------------------------------------------

/**
 * `GET /v1/users`. Aucune journalisation : le catalogue ne connaît pas d'action de
 * consultation de compte, et en inventer une noierait la table (une liste se
 * rafraîchit à chaque ouverture d'écran). La consultation FINANCIÈRE, elle, est
 * tracée — parce que 06 §10.5 l'exige nommément, et pour elle seule.
 */
export async function listerLesComptes(
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneUtilisateurPaginee>> {
  return listerUtilisateurs(pagination);
}

// -----------------------------------------------------------------------------
// CRÉATION
// -----------------------------------------------------------------------------

/**
 * `POST /v1/users`. L'`id` est un **UUID v7 frappé côté applicatif** (11 §2 : « côté
 * applicatif, client ET serveur » ; PostgreSQL 16 n'a pas d'`uuidv7()` native).
 *
 * L'empreinte est frappée AVANT l'insertion, hors de toute transaction : Argon2id
 * coûte ~19 Mio et trois passes, et il n'y a aucune raison de tenir un verrou de
 * ligne pendant ce temps-là.
 */
export async function creerUnCompte(
  adminId: string,
  entree: CreateUserRequest,
  contexte: ContexteJournal,
): Promise<LigneUtilisateur> {
  const empreinte = await hacherMotDePasse(entree.password);

  const ligne = await insererUtilisateur(
    {
      id: uuidv7(),
      name: entree.name,
      email: entree.email,
      empreinteMotDePasse: empreinte,
      role: entree.role,
      usageProfile: entree.usageProfile,
    },
    new Date(),
  );

  await journaliserActivite(
    {
      action: 'user.create',
      utilisateurId: adminId,
      cibleId: ligne.id,
      // Le RÔLE, jamais le nom ni l'adresse : c'est ce qui rend la ligne d'audit
      // utile (« qui a créé un admin ? ») sans en faire un annuaire.
      role: ligne.role,
    },
    contexte,
  );

  return ligne;
}

// -----------------------------------------------------------------------------
// MODIFICATION ORDINAIRE
// -----------------------------------------------------------------------------

/**
 * `PATCH /v1/users/:id`.
 *
 * ── LA COMPARAISON AVANT/APRÈS N'EST PAS UNE OPTIMISATION ───────────────────
 * On n'écrit QUE les champs qui changent VRAIMENT, et on ne journalise QUE
 * ceux-là. Un `PATCH` qui renvoie le nom déjà en base produirait autrement une
 * ligne `user.update` décrivant une modification qui n'a pas eu lieu, et un
 * `updated_at` bousculé qui ferait remonter le compte en tête des listes triées par
 * modification. Un journal d'audit qui décrit des non-événements se lit moins bien
 * qu'un journal court.
 */
export async function modifierUnCompte(
  adminId: string,
  cibleId: string,
  corps: UpdateUserRequest,
  contexte: ContexteJournal,
): Promise<LigneUtilisateur> {
  const resultat = await db.transaction(async (tx) => {
    const avant = await lireUtilisateurPourEcriture(tx, cibleId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_COMPTE_INTROUVABLE);

    // Objet MUTABLE ici, `ChampsModifiables` (en lecture seule) au passage : on
    // construit, puis on transmet une valeur que le dépôt ne peut plus altérer.
    const champs: { name?: string; email?: string; usageProfile?: ProfilUsage } = {};
    const touches: ChampJournalisable[] = [];

    if (corps.name !== undefined && corps.name !== avant.name) {
      champs.name = corps.name;
      touches.push('name');
    }
    if (corps.email !== undefined && corps.email !== avant.email) {
      champs.email = corps.email;
      touches.push('email');
    }
    if (corps.usageProfile !== undefined && corps.usageProfile !== avant.usageProfile) {
      champs.usageProfile = corps.usageProfile;
      touches.push('usage_profile');
    }

    if (touches.length === 0) return { ligne: avant, touches };

    const apres = await mettreAJourUtilisateur(tx, cibleId, champs, new Date());
    if (apres === null) throw incoherenceInterne();

    return { ligne: apres, touches };
  });

  const [premier, ...reste] = resultat.touches;
  if (premier !== undefined) {
    // Le tableau est reconstruit NON VIDE pour le schéma partagé (`min(1)`) : la
    // variante `user.update` refuse une liste de champs vide, et elle a raison —
    // « j'ai modifié quelque chose, je ne sais pas quoi » n'est pas une trace.
    await journaliserActivite(
      {
        action: 'user.update',
        utilisateurId: adminId,
        cibleId,
        champs: [premier, ...reste],
      },
      contexte,
    );
  }

  return resultat.ligne;
}

// -----------------------------------------------------------------------------
// LES QUATRE ACTES DISTINCTS
// -----------------------------------------------------------------------------

/**
 * `PATCH /v1/users/:id/role`. Route à part parce que `user.role_change` est une
 * action à part du catalogue, et qu'elle porte `role_avant` / `role_apres` — deux
 * valeurs qu'un `PATCH` générique n'aurait pas su produire.
 *
 * Rôle identique = AUCUNE écriture, AUCUNE ligne d'audit : une transition de
 * `consultant` vers `consultant` n'est pas un changement de rôle, et l'écrire
 * salirait la seule question à laquelle cette action répond.
 */
export async function changerLeRole(
  adminId: string,
  cibleId: string,
  role: RoleUtilisateur,
  contexte: ContexteJournal,
): Promise<LigneUtilisateur> {
  refuserSurSonPropreCompte(adminId, cibleId, 'changer le rôle de');

  const resultat = await db.transaction(async (tx) => {
    const avant = await lireUtilisateurPourEcriture(tx, cibleId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_COMPTE_INTROUVABLE);
    if (avant.role === role) return { ligne: avant, roleAvant: null };

    const apres = await changerRoleUtilisateur(tx, cibleId, role, new Date());
    if (apres === null) throw incoherenceInterne();

    return { ligne: apres, roleAvant: avant.role };
  });

  if (resultat.roleAvant !== null) {
    await journaliserActivite(
      {
        action: 'user.role_change',
        utilisateurId: adminId,
        cibleId,
        roleAvant: resultat.roleAvant,
        roleApres: role,
      },
      contexte,
    );
  }

  return resultat.ligne;
}

/**
 * `PATCH /v1/users/:id/deactivate` — l'étape 2 du cycle de sortie §34.4
 * (« révocation compte + refresh tokens »), moins le retrait des `mission_users`,
 * qui appartient au lot L3 (la table n'a aucune route avant lui).
 *
 * ── POURQUOI LES JETONS SONT RÉVOQUÉS DANS LA MÊME TRANSACTION ──────────────
 * Le crochet d'autorisation relit `users` à chaque requête (06 §10.1 :
 * « désactivable INSTANTANÉMENT »), donc l'accès s'éteint déjà tout seul. Mais un
 * jeton de RAFRAÎCHISSEMENT vivant survivrait à la désactivation et permettrait de
 * rouvrir une session le jour où le compte serait réactivé, sans que personne ne
 * l'ait décidé. §34.4 dit « révocation compte ET refresh tokens » : les deux, et
 * dans la même transaction — sinon il existe un instant où le compte est désactivé
 * et ses jetons vivants, et c'est justement l'instant que la panne choisit.
 *
 * ── CE QUI N'EXISTE PAS, ET QUI EST REMONTÉ ────────────────────────────────
 * Il n'y a PAS de route de RÉACTIVATION. Le catalogue du journal ne connaît que
 * `user.deactivate` ; le §34.4 ne décrit qu'une sortie, jamais un retour. Un
 * `is_active: true` glissé dans le `PATCH` générique rendrait le journal incapable
 * de nommer l'acte — exactement ce que la séparation en quatre routes évite.
 */
export async function desactiverUnCompte(
  adminId: string,
  cibleId: string,
  contexte: ContexteJournal,
): Promise<LigneUtilisateur> {
  refuserSurSonPropreCompte(adminId, cibleId, 'désactiver');

  const resultat = await db.transaction(async (tx) => {
    const avant = await lireUtilisateurPourEcriture(tx, cibleId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_COMPTE_INTROUVABLE);
    if (!avant.isActive) return { ligne: avant, desactive: false };

    const maintenant = new Date();
    const apres = await desactiverUtilisateur(tx, cibleId, maintenant);
    if (apres === null) throw incoherenceInterne();
    await revoquerFamille(tx, cibleId, maintenant);

    return { ligne: apres, desactive: true };
  });

  if (resultat.desactive) {
    await journaliserActivite(
      { action: 'user.deactivate', utilisateurId: adminId, cibleId },
      contexte,
    );
  }

  return resultat.ligne;
}

/**
 * `PATCH /v1/users/:id/habilitate` — l'étape 4 de l'entrée §34.4 : « l'admin pose
 * `users.habilitated_at` », après le bac à sable (§17.5) et l'exercice de cotation
 * croisée (§32.4).
 *
 * ── CE QUE CETTE ROUTE NE FAIT PAS ─────────────────────────────────────────
 * Elle ne vérifie NI le bac à sable NI la cotation croisée : ce sont des actes
 * humains, hors du produit en Phase 1 — l'admin atteste, le serveur enregistre. Et
 * elle n'applique PAS la règle « l'affectation `mission_users` est refusée si
 * `habilitated_at IS NULL` » : cette règle appartient à la route d'affectation,
 * donc au lot L3.
 *
 * ── UNE HABILITATION NE SE REPOSE PAS ──────────────────────────────────────
 * Si `habilitated_at` est déjà posé, on ne le réécrit pas : l'écraser changerait la
 * DATE d'un fait établi, ce qui est précisément ce que l'invariant 7 interdit
 * (« rien n'est jamais silencieusement écrasé »). L'appel reste un succès —
 * l'habilitation demandée est bien en place — mais il ne produit ni écriture ni
 * ligne d'audit.
 */
export async function habiliterUnCompte(
  adminId: string,
  cibleId: string,
  contexte: ContexteJournal,
): Promise<LigneUtilisateur> {
  const resultat = await db.transaction(async (tx) => {
    const avant = await lireUtilisateurPourEcriture(tx, cibleId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_COMPTE_INTROUVABLE);
    if (avant.habilitatedAt !== null) return { ligne: avant, habilite: false };

    const apres = await habiliterUtilisateur(tx, cibleId, new Date());
    if (apres === null) throw incoherenceInterne();

    return { ligne: apres, habilite: true };
  });

  if (resultat.habilite) {
    await journaliserActivite(
      { action: 'user.habilitate', utilisateurId: adminId, cibleId },
      contexte,
    );
  }

  return resultat.ligne;
}

// -----------------------------------------------------------------------------
// RÉINITIALISATION DU MOT DE PASSE — et le garde-fou 05 §9.7
// -----------------------------------------------------------------------------

/** Ce que la route rend. Le mot de passe n'existe en clair QUE dans cet objet. */
export interface ReinitialisationEffectuee {
  readonly utilisateurId: string;
  readonly motDePasse: string;
  /** `true` = le garde-fou §9.7 avait quelque chose à dire, et il a été outrepassé. */
  readonly forcee: boolean;
}

/**
 * Nom d'événement d'exploitation de l'alerte de forçage. **Une CONSTANTE, parce
 * qu'une supervision s'accroche à une chaîne stable** — le même dispositif que
 * `journal_activite_ecriture_echouee` (dépôt du journal).
 */
const EVENEMENT_ALERTE_FORCAGE = 'reinitialisation_mot_de_passe_forcee';

/**
 * `PATCH /v1/users/:id/password-reset`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE GARDE-FOU 05 §9.7 EST LE CŒUR DE CETTE ROUTE, PAS UNE VÉRIFICATION DE PLUS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * La KEK de l'appareil terrain DÉRIVE DU MOT DE PASSE (§9.7 : « une DEK par
 * appareil chiffre les données ; la DEK est enveloppée par une KEK dérivée du mot de
 * passe »). Changer le mot de passe HORS LIGNE, c'est-à-dire sans que l'appareil
 * puisse ré-envelopper sa DEK, rend DÉFINITIVEMENT ILLISIBLE tout ce que l'outbox
 * n'a pas encore poussé : des entretiens d'une journée de mission, chez un client.
 * Le refus est donc la valeur par défaut, et le forçage un acte explicite.
 *
 * La condition est celle du §9.7, mot pour mot : « dernier
 * `sync_log.outbox_remaining` > 0 **ou aucune sync connue de l'appareil** ».
 *
 * ⚠ CONSÉQUENCE À CONNAÎTRE, ET ELLE EST VOULUE : un compte NEUF n'a aucune ligne
 * de `sync_log`. Sa toute première réinitialisation exige donc TOUJOURS un forçage,
 * alors qu'il n'y a rien à perdre. C'est ce que le §9.7 écrit (« ou aucune sync
 * connue »), et le sens en est défendable : le serveur ne sait pas distinguer « cet
 * appareil n'a jamais rien collecté » de « cet appareil n'a jamais réussi à se
 * synchroniser », et c'est le second cas qui coûte cher. Le forçage tracé est
 * exactement la façon dont un humain tranche ce que la machine ne sait pas.
 *
 * ── L'ORDRE DES OPÉRATIONS, ET POURQUOI IL COMPTE ──────────────────────────
 * Le mot de passe est engendré et haché AVANT la transaction : Argon2id dure des
 * dizaines de millisecondes, et les tenir sous un verrou de ligne n'apporterait
 * rien. S'il y a refus, le secret engendré est simplement abandonné — il n'a été
 * ni écrit, ni journalisé, ni rendu.
 */
export async function reinitialiserLeMotDePasse(
  adminId: string,
  cibleId: string,
  force: boolean,
  contexte: ContexteJournal,
): Promise<ReinitialisationEffectuee> {
  const motDePasse = engendrerMotDePasse();
  const empreinte = await hacherMotDePasse(motDePasse);

  const forcee = await db.transaction(async (tx) => {
    const cible = await lireUtilisateurPourEcriture(tx, cibleId);
    if (cible === null) throw new AppError('NOT_FOUND', MESSAGE_COMPTE_INTROUVABLE);

    const etats = await lireDerniersEtatsDeSync(tx, cibleId);
    // Tableau vide = « aucune sync connue ». `?? 0` couvre un état sans valeur, que
    // la requête a déjà écarté : on ne suppose pas ce qu'on peut vérifier.
    const risque = etats.length === 0 || etats.some((etat) => (etat.outboxRemaining ?? 0) > 0);

    if (risque && !force) {
      throw new AppError(
        'UNSYNCED_DATA_AT_RISK',
        'Des données de collecte non synchronisées seraient définitivement perdues : ' +
          "la clé locale de l'appareil dérive du mot de passe. Confirmez explicitement " +
          'la réinitialisation pour passer outre.',
      );
    }

    const maintenant = new Date();
    const apres = await remplacerEmpreinteMotDePasse(tx, cibleId, empreinte, maintenant);
    if (apres === null) throw incoherenceInterne();

    // L'ancien mot de passe n'ouvre plus rien : laisser vivre les jetons de
    // rafraîchissement d'un appareil dont le coffre local est devenu inouvrable
    // n'aiderait personne et prolongerait une session que son porteur ne peut plus
    // déverrouiller. Même transaction, même raison que la désactivation.
    await revoquerFamille(tx, cibleId, maintenant);

    return risque;
  });

  if (forcee) {
    // ═════════════════════════════════════════════════════════════════════════
    // L'« ALERTE » DU §9.7 — ET CE QU'ELLE N'EST PAS.
    // ═════════════════════════════════════════════════════════════════════════
    // La note L2 §2.4 exige « journalisation ET alerte ». La journalisation est la
    // ligne `user.password_reset` ci-dessous. L'alerte, elle, est ICI, en trace
    // d'exploitation nommée — et **ce n'est pas l'alerte applicative de la cloche
    // §20.4** : la table `alerts` a un `mission_id NOT NULL` avec clé étrangère
    // vers `missions`, or une réinitialisation de compte n'appartient à AUCUNE
    // mission. Elle ne peut donc PAS y entrer sans amender le fichier 04, ce qui
    // est une escalade (`CLAUDE.md` §3-2). C'est écrit plutôt que contourné.
    //
    // Aucune donnée personnelle : l'identifiant du compte touché, comme le fait
    // déjà la porte du journal pour `entityId`. Jamais le mot de passe engendré —
    // il n'apparaît NULLE PART ailleurs que dans la réponse HTTP.
    contexte.journal.warn(
      { evenement: EVENEMENT_ALERTE_FORCAGE, entityType: 'user', entityId: cibleId },
      'Réinitialisation de mot de passe FORCÉE malgré le garde-fou 05 §9.7 — ' +
        'des données de collecte locales sont probablement perdues',
    );
  }

  await journaliserActivite(
    { action: 'user.password_reset', utilisateurId: adminId, cibleId, forcage: forcee },
    contexte,
  );

  return { utilisateurId: cibleId, motDePasse, forcee };
}
