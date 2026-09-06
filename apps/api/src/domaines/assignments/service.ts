// =============================================================================
// SERVICE DES AFFECTATIONS ET DE LA RÉAFFECTATION — les règles du §34.3 et du
// §34.4, appliquées là où elles se vérifient. Lot L3, incrément L3d, tâche T5.
//
// ── QUATRE RÈGLES VIVENT ICI, ET AUCUNE NE POUVAIT VIVRE AILLEURS ──────────
//  1. **« lead de CETTE mission »** (§34.3). « lead » n'est PAS un rôle global : il
//     est porté par `mission_users.role_on_mission` et ne peut donc pas s'exprimer
//     dans `config.acces`, dont `PolitiqueAcces` est une union exclusive
//     (`DECISIONS.md` 2026-08-29, A01 a refusé de l'élargir). La route déclare
//     `roles: ['admin','consultant']` — qui ENTRE — et c'est ici qu'on vérifie SUR
//     QUOI. La conséquence est écrite plutôt que découverte : cette garde n'est pas
//     couverte par la vérification de totalité du démarrage, elle se teste
//     explicitement.
//  2. **L'habilitation** (§34.4) : « un auditeur non habilité ne touche jamais un
//     client ». La règle serveur du pack porte sur `mission_users` ; l'omettre ici
//     la laisserait contourner par la porte de service — on affecterait du travail,
//     puis des sessions, à quelqu'un que la règle voulait tenir à l'écart
//     (brief L3D §8-11, arbitrage (a)).
//  3. **Les sessions RÉALISÉES restent à leur auteur** (§34.4) : `status ∈
//     (en_cours, termine)` refuse la réaffectation. « L'historique d'un audit ne se
//     réécrit jamais. »
//  4. **Une session CONDUITE a un auditeur** (04, amendement du 2026-09-02, tranché
//     par Williams) : `conducted_by` est devenu NULLABLE pour que le plan §32.4
//     puisse persister des sessions planifiées sans auditeur, et le 04 confie
//     EXPLICITEMENT au service la contrainte que la colonne ne porte plus —
//     `exigerAuditeurSiSessionConduite`, plus bas, exportée pour L6a.
//
// ── DEUX REFUS, DEUX CODES, UNE RÈGLE (`DECISIONS.md` 2026-09-02) ───────────
// Refusé sur le RÔLE (le crochet, avant toute lecture) → **403**. Refusé sur
// l'APPARTENANCE (ici, après avoir lu la ressource) → **404** : un refus prononcé
// après avoir lu ne doit rien divulguer de ce qu'il a lu. Un consultant qui n'est
// pas sur la mission reçoit donc le même 404 que si la session n'existait pas ; un
// consultant membre mais non lead reçoit 403, parce que là, l'existence n'est plus
// un secret pour lui.
//
// ── CE QUI N'EST PAS JOURNALISÉ, ET POURQUOI ────────────────────────────────
// La CRÉATION d'une affectation ne l'est pas : le catalogue `ACTIONS_JOURNAL` ne
// nomme que ce qui existe, aucune section du pack n'exige de tracer une affectation
// de travail, et une action de journal sans exigence ni appelant est du code mort.
// La RÉAFFECTATION l'est, parce que le §34.4 l'écrit noir sur blanc — et elle
// n'emporte **ni le motif, ni un nom, ni une adresse** : `activity_log` est un
// emplacement à code (voir `packages/shared/src/journal.ts`).
//
// Traçabilité : E25 (zéro oubli : plan d'entretiens et affectations) · E33
// (sécurité / RGPD : habilitation §34.4, aucune donnée personnelle journalisée) ·
// E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import {
  AppError,
  STATUTS_SESSION_NON_REAFFECTABLES,
  estSessionConduite,
  type CreateAssignmentRequest,
  type InterviewReassignRequest,
  type PaginationQuery,
  type StatutSessionApi,
} from '@axion/shared';
import { db } from '../../db.js';
import type { PageCurseur } from '../../http/pagination.js';
import type { ExecuteurSql } from '../auth/depot.js';
import { journaliserActivite, type ContexteJournal } from '../journal/service.js';
import {
  insererAffectation,
  lireRoleSurMission,
  lireSessionPourReaffectation,
  lireUtilisateurAffectable,
  listerAffectations,
  missionVivante,
  reaffecterSession,
  uniteAppartientALaMission,
  type EtatUtilisateurAffectable,
  type LigneAffectation,
  type LigneSession,
} from './depot.js';

const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

/** Même forme de message que la mission : un 404 ne se décline pas (voir l'en-tête). */
const MESSAGE_SESSION_INTROUVABLE = "Cette session n'existe pas.";

const MESSAGE_DROITS_INSUFFISANTS = "Vous n'avez pas les droits nécessaires pour cette action.";

/** Le rôle sur mission qui ouvre les pouvoirs du §34.3. */
const ROLE_LEAD = 'lead';

/** Libellés français des états de session (invariant 5), pour un refus lisible. */
const LIBELLES_STATUT_SESSION: Readonly<Record<string, string>> = {
  non_demarre: 'non démarrée',
  en_cours: 'en cours',
  termine: 'terminée',
};

/**
 * L'auteur d'une action, tel que la route le connaît.
 *
 * `role` est le rôle GLOBAL (`users.role`), relu en base par le crochet à chaque
 * requête (06 §10.1) — jamais une valeur portée par le jeton.
 */
export interface AuteurAction {
  readonly id: string;
  readonly role: string;
}

/**
 * La garde d'habilitation, écrite UNE fois pour ses deux appelants.
 *
 * `403 NOT_HABILITATED` et non 400 : le compte existe, la demande est bien formée,
 * c'est le DROIT qui manque — et le code dit lequel, pour que la console propose
 * « faire habiliter ce compte » plutôt que « corrigez votre saisie ».
 */
function exigerHabilitation(compte: EtatUtilisateurAffectable): void {
  if (!compte.estActif) {
    throw new AppError('FORBIDDEN', 'Ce compte est désactivé : il ne peut plus être affecté.', [
      { path: 'userId', code: 'compte_desactive', message: 'Ce compte est désactivé.' },
    ]);
  }
  if (compte.habilitatedAt === null) {
    throw new AppError(
      'NOT_HABILITATED',
      "Cet auditeur n'est pas encore habilité : il ne peut recevoir ni affectation ni " +
        'session sur une mission réelle (§34.4).',
      [
        {
          path: 'userId',
          code: 'auditeur_non_habilite',
          message: "Cet auditeur n'est pas habilité.",
        },
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// `work_assignments`
// -----------------------------------------------------------------------------

/**
 * `GET /v1/missions/:id/assignments`.
 *
 * La mission est lue AVANT la liste : sans cela, une mission inconnue rendrait une
 * page vide, et l'appelant ne saurait pas distinguer « aucune affectation » de
 * « cette mission n'existe pas ». La route est `admin` seul (§34.1) : aucun cadrage
 * par `mission_users` n'est appliqué ici — un administrateur voit toutes les
 * missions, et le jour où le lead entrera dans la console (Phase 2), le filtre se
 * posera dans le DÉPÔT, pas dans la politique de route.
 */
export async function listerLesAffectations(
  missionId: string,
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneAffectation>> {
  if (!(await missionVivante(db, missionId))) {
    throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);
  }

  return listerAffectations(db, missionId, pagination);
}

/**
 * `POST /v1/missions/:id/assignments` — **201**.
 *
 * ── L'ORDRE DES CONTRÔLES, ET LA GARANTIE « ZÉRO ÉCRITURE » ─────────────────
 * Les quatre refus possibles sont prononcés AVANT le moindre `INSERT`, dans la même
 * transaction que lui :
 *   1. mission inconnue ou supprimée → `404` ;
 *   2. unité d'une AUTRE mission (ou inexistante) → `400`, et **le même message
 *      pour les deux** : dire « cette unité existe mais appartient à une autre
 *      mission » renseignerait sur l'arbre d'un client qu'on n'a pas le droit de
 *      voir. La clé étrangère du 04 ne peut PAS attraper ce cas — elle vérifie que
 *      l'unité existe, pas qu'elle est ici chez elle ;
 *   3. compte inconnu → `400` · désactivé ou non habilité → `403` (§34.4) ;
 *   4. triplet déjà affecté → `409`, arbitré par la contrainte `UNIQUE` du 04 et
 *      traduit par le dépôt.
 *
 * L'identifiant est un **UUID v7 applicatif** (invariant 1, 11 §2) : il ouvre aussi
 * l'ordre de la pagination keyset de la liste.
 */
export async function creerUneAffectation(
  missionId: string,
  entree: CreateAssignmentRequest,
): Promise<LigneAffectation> {
  return db.transaction(async (tx) => {
    if (!(await missionVivante(tx, missionId))) {
      throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);
    }

    if (!(await uniteAppartientALaMission(tx, entree.orgUnitId, missionId))) {
      throw new AppError(
        'VALIDATION_FAILED',
        "Cette unité n'appartient pas à l'arbre de cette mission.",
        [
          {
            path: 'orgUnitId',
            code: 'unite_hors_mission',
            message: "Cette unité n'appartient pas à cette mission.",
          },
        ],
      );
    }

    const compte = await lireUtilisateurAffectable(tx, entree.userId);
    if (compte === null) {
      throw new AppError('VALIDATION_FAILED', "Ce compte utilisateur n'existe pas.", [
        { path: 'userId', code: 'utilisateur_inconnu', message: "Ce compte n'existe pas." },
      ]);
    }
    exigerHabilitation(compte);

    return insererAffectation(tx, {
      id: uuidv7(),
      missionId,
      userId: entree.userId,
      orgUnitId: entree.orgUnitId,
      plannedInterviews: entree.plannedInterviews ?? null,
      plannedDays: entree.plannedDays ?? null,
      dateFrom: entree.dateFrom ?? null,
      dateTo: entree.dateTo ?? null,
    });
  });
}

// -----------------------------------------------------------------------------
// `PATCH /v1/interviews/:id/reassign` (§34.4)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// LA RÈGLE MÉTIER DE `conducted_by` (amendement du 04, 2026-09-02)
// -----------------------------------------------------------------------------

/**
 * Le couple que la règle regarde : l'ÉTAT d'une session et son PROPRIÉTAIRE.
 *
 * Une interface structurelle minimale, et non `LigneSession` : L6a (sync) lira ces
 * deux colonnes dans SA propre forme de ligne, et devoir passer par le type du
 * dépôt des affectations pour appeler une règle d'`interviews` l'aurait poussée à
 * réécrire la règle plutôt qu'à l'appeler.
 */
export interface CoupleEtatProprieteSession {
  readonly status: StatutSessionApi;
  readonly conductedBy: string | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNE SESSION CONDUITE DOIT AVOIR UN AUDITEUR — la contrainte que le 04 a
 * DÉLIBÉRÉMENT confiée au code.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `DECISIONS.md` du 2026-09-02 (« `interviews.conducted_by` devient NULLABLE »,
 * tranché par Williams), point (d) : « **la règle métier explicite dans le service,
 * et testée** : une session **planifiée** peut n'avoir aucun auditeur ; une session
 * **conduite** (statut au-delà de planifiée) doit en avoir un — contrainte posée
 * dans le code, pas seulement relâchée dans la colonne. »
 *
 * Les statuts « conduits » ne sont pas devinés : le 04 les nomme dans le corps même
 * de l'amendement (« status en_cours/termine »), et ils vivent en donnée partagée
 * (`STATUTS_SESSION_CONDUITE`), pas en littéral recopié ici.
 *
 * ── POURQUOI 409 ET NON 400 ─────────────────────────────────────────────────
 * Même raisonnement que le motif manquant d'une transition de mission (`DECISIONS.md`
 * du 2026-09-01) : la requête peut être parfaitement formée. Ce qui s'y oppose est
 * l'ÉTAT de la ressource — « cette session n'a personne pour la conduire ». Le
 * `details[].code` porte l'identifiant machine (`auditeur_requis`) et
 * `details[].message` la phrase française affichable, convention transverse du
 * 2026-09-01.
 *
 * ── QUI DOIT L'APPELER, ET QUAND ────────────────────────────────────────────
 * **Toute écriture qui fait passer une session au-delà de `non_demarre`, ou qui
 * touche `conducted_by`.** Aujourd'hui, dans cette API, la seule écriture des deux
 * colonnes est `reaffecterSession` (ci-dessous) : **aucune route ne fait démarrer
 * ni terminer une session** — c'est L5/L6 qui l'écriront, par la sync (05 §9).
 * Cette fonction est donc exportée AVANT son appelant principal, et c'est
 * volontaire : la règle existe pour que L6a l'appelle, pas pour qu'il la retrouve.
 *
 * ⚠⚠ **L6a, LE PIÈGE À NE PAS TOMBER DEDANS** : `conducted_by IS NULL` ne se lit
 * **JAMAIS** « inscriptible par tout le monde ». Le 05 §9.9 réserve les écritures
 * de sync au PROPRIÉTAIRE de la session ; un propriétaire inconnu est un REFUS, pas
 * une permission ouverte. Le 04 l'écrit dans le même amendement, en toutes lettres.
 * Une session sans auditeur ne se pousse pas depuis le terrain : elle s'affecte
 * d'abord, par `PATCH /v1/interviews/:id/reassign`.
 */
export function exigerAuditeurSiSessionConduite(session: CoupleEtatProprieteSession): void {
  if (!estSessionConduite(session.status)) return;
  if (session.conductedBy !== null) return;

  throw new AppError(
    'ILLEGAL_STATE_TRANSITION',
    `Une session ${libelleStatutSession(session.status)} doit avoir un auditeur : ` +
      'affectez-la avant de la faire démarrer.',
    [
      {
        path: 'conductedBy',
        code: 'auditeur_requis',
        message: 'Cette session doit être affectée à un auditeur avant de démarrer.',
      },
    ],
  );
}

/** Ce que rend une réaffectation : la session après coup, et QUI elle a quittée. */
export interface ResultatReaffectation {
  readonly session: LigneSession;
  /**
   * `null` = la session n'avait AUCUN auditeur : c'est une PREMIÈRE AFFECTATION,
   * pas un changement de mains (arbitrage A01 du 2026-09-02 — `reassign` est
   * aujourd'hui la seule porte qui pose un auditeur sur une session planifiée par
   * le plan §32.4, `/interview-plan/apply` n'existant pas encore).
   */
  readonly conductedByAvant: string | null;
  /**
   * JAMAIS `null` : réaffecter POSE un auditeur, la requête en exige un
   * (`newUserId`). Le champ existe pour porter ce rétrécissement UNE fois, ici,
   * plutôt que de laisser la route ou le journal le refaire depuis
   * `session.conductedBy`, désormais nullable.
   */
  readonly conductedByApres: string;
}

/** Un état de session en français, ou le code brut s'il est inconnu du dictionnaire. */
function libelleStatutSession(statut: StatutSessionApi): string {
  return LIBELLES_STATUT_SESSION[statut] ?? statut;
}

/**
 * Le DEMANDEUR a-t-il le droit d'agir sur cette mission ?
 *
 * Admin : oui, sur toute mission (§34.1 — la console est la sienne). Sinon : il
 * doit être **lead de CETTE mission** (§34.3). Les deux refus ne sont pas
 * interchangeables — voir l'en-tête.
 */
async function exigerAdminOuLead(
  executeur: ExecuteurSql,
  auteur: AuteurAction,
  missionId: string,
): Promise<void> {
  if (auteur.role === 'admin') return;

  const roleSurMission = await lireRoleSurMission(executeur, missionId, auteur.id);
  if (roleSurMission === null) {
    // Hors mission : 404, l'existence de la session n'est pas divulguée.
    throw new AppError('NOT_FOUND', MESSAGE_SESSION_INTROUVABLE);
  }
  if (roleSurMission !== ROLE_LEAD) {
    throw new AppError('FORBIDDEN', MESSAGE_DROITS_INSUFFISANTS, [
      {
        path: 'missionId',
        code: 'lead_requis',
        message: 'Seul le responsable de la mission peut réaffecter une session.',
      },
    ]);
  }
}

/**
 * `PATCH /v1/interviews/:id/reassign` — §34.4, « réaffectation d'une session
 * PLANIFIÉE non commencée ».
 *
 * ── L'ORDRE DES CINQ TEMPS ──────────────────────────────────────────────────
 *  1. lecture de la session **sous `FOR UPDATE`** : tout le reste se décide sur un
 *     état que personne ne peut changer d'ici le commit ;
 *  2. le DEMANDEUR (admin, ou lead de cette mission) ;
 *  3. l'ÉTAT de la session : `en_cours` ou `termine` → `409` nommant l'état — « les
 *     sessions réalisées restent à leur auteur » ;
 *  4. le DESTINATAIRE : membre de la mission (sinon `403`) et **habilité** (sinon
 *     `403 NOT_HABILITATED`) ;
 *  5. l'écriture, puis la trace `activity_log` APRÈS le commit.
 *
 * ⚠ **Réaffecter à l'auditeur qui la conduit déjà est REFUSÉ** (`409`). Le pack ne
 * tranche pas ce cas ; l'accepter écrirait une ligne de journal disant qu'une
 * session est passée de X à X — une trace qui décrit un non-événement rend le
 * journal plus difficile à lire le jour où il sert. C'est un candidat
 * `DECISIONS.md` remonté au rapport de l'incrément, pas une décision d'agent.
 */
export async function reaffecterUneSession(
  auteur: AuteurAction,
  interviewId: string,
  corps: InterviewReassignRequest,
  contexte: ContexteJournal,
): Promise<ResultatReaffectation> {
  const resultat = await db.transaction(async (tx) => {
    // ①
    const avant = await lireSessionPourReaffectation(tx, interviewId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_SESSION_INTROUVABLE);

    // ②
    await exigerAdminOuLead(tx, auteur, avant.missionId);

    // ③
    if (STATUTS_SESSION_NON_REAFFECTABLES.some((statut) => statut === avant.status)) {
      throw new AppError(
        'CONFLICT',
        `Cette session est ${libelleStatutSession(avant.status)} : elle reste à son auteur. ` +
          'Seule une session non commencée peut être réaffectée (§34.4).',
        [
          {
            path: 'status',
            code: avant.status,
            message: `État de la session : ${libelleStatutSession(avant.status)}.`,
          },
        ],
      );
    }

    // ⚠ `null === corps.newUserId` est FAUX, et c'est exactement ce qu'il faut :
    // une session SANS auditeur qu'on affecte pour la première fois n'est pas un
    // « déjà propriétaire ». Le refus ci-dessous ne vise que le geste qui
    // n'apprend rien — réaffecter X à X (arbitrage A01 du 2026-09-02).
    if (avant.conductedBy === corps.newUserId) {
      throw new AppError('CONFLICT', 'Cette session est déjà conduite par cet auditeur.', [
        {
          path: 'newUserId',
          code: 'deja_proprietaire',
          message: 'Cet auditeur conduit déjà cette session.',
        },
      ]);
    }

    // ④ — membre d'abord (sinon on renseignerait sur l'habilitation d'un compte
    //     qui n'a rien à voir avec cette mission), habilitation ensuite.
    const roleDestinataire = await lireRoleSurMission(tx, avant.missionId, corps.newUserId);
    if (roleDestinataire === null) {
      throw new AppError(
        'FORBIDDEN',
        "Cet auditeur n'est pas affecté à cette mission : il ne peut pas en recevoir une session.",
        [
          {
            path: 'newUserId',
            code: 'destinataire_hors_mission',
            message: "Cet auditeur n'est pas membre de la mission.",
          },
        ],
      );
    }

    const compte = await lireUtilisateurAffectable(tx, corps.newUserId);
    if (compte === null) {
      // Inatteignable tant que la clé étrangère de `mission_users` tient : on
      // refuse plutôt que de supposer, et sans divulguer davantage.
      throw new AppError('FORBIDDEN', MESSAGE_DROITS_INSUFFISANTS);
    }
    exigerHabilitation(compte);

    // ⑤
    const apres = await reaffecterSession(tx, interviewId, corps.newUserId, new Date());
    if (apres === null) throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');

    // ⑥ — LA CEINTURE DU COUPLE (état, propriétaire), amendement du 04 du 2026-09-02.
    //
    // Cette écriture ne touche que la MOITIÉ `conducted_by` du couple, et elle ne
    // peut pas le rompre aujourd'hui : le temps ③ a déjà refusé les sessions
    // `en_cours` et `termine`, et `newUserId` est un UUID exigé par le schéma. On
    // vérifie quand même — c'est le seul endroit de l'API qui écrit une des deux
    // colonnes, et une ceinture posée là attrapera le jour où le temps ③ changera
    // (par exemple si le §34.4 s'assouplit) sans que personne ne se souvienne de la
    // règle du 04. Le contrôle est en base de transaction : s'il refuse, l'écriture
    // est annulée.
    exigerAuditeurSiSessionConduite(apres);

    // Rétrécissement, PAS une croyance : `reaffecterSession` vient d'écrire
    // `corps.newUserId`, non nul par le schéma. Si la colonne relue est nulle, la
    // base a dit autre chose que ce qu'on lui a demandé — c'est une incohérence
    // interne, pas un cas métier, et elle sort en 500 plutôt qu'en `null` silencieux.
    if (apres.conductedBy === null) {
      throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
    }

    return {
      session: apres,
      conductedByAvant: avant.conductedBy,
      conductedByApres: apres.conductedBy,
    };
  });

  await journaliserActivite(
    {
      action: 'interview.reassign',
      utilisateurId: auteur.id,
      interviewId,
      missionId: resultat.session.missionId,
      auditeurAvant: resultat.conductedByAvant,
      auditeurApres: resultat.conductedByApres,
      // LE MOTIF LUI-MÊME, en code — arbitrage Williams du 2026-09-02, « motif
      // codé ». `MOTIFS_REAFFECTATION` est du vocabulaire technique : il passe la
      // ceinture d'`activity_log.meta` par construction, là où la phrase française
      // qu'on exigeait hier était jetée. La valeur vient du schéma de requête, qui
      // l'a déjà validée contre le vocabulaire (400 sinon) : rien à revalider ici.
      motif: corps.motif,
    },
    contexte,
  );

  return resultat;
}
