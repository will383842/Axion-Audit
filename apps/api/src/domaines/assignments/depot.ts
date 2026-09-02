// =============================================================================
// DÉPÔT DES AFFECTATIONS ET DE LA RÉAFFECTATION — `work_assignments` (§18.2) et
// la seule colonne d'`interviews` que le §34.4 autorise à changer.
// Lot L3, incrément L3d, tâche T5.
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
//
// ── CE QUE CE DÉPÔT NE FAIT PAS ─────────────────────────────────────────────
//   · il ne décide d'aucun droit : ni l'habilitation §34.4, ni « lead sur CETTE
//     mission » ne se jugent ici. Il MESURE (l'utilisateur est-il membre ? est-il
//     habilité ?) et rend des faits ; le service tranche ;
//   · il n'écrit qu'UNE colonne d'`interviews` — `conducted_by`, plus
//     `updated_at`. `schedule_status` n'est pas touché (§34.4), et `status` encore
//     moins : réaffecter ne fait pas repartir une session ;
//   · il ne rend AUCUNE donnée personnelle de la session (`person_name`,
//     `person_email`, notes) : la réaffectation manipule des identifiants
//     d'auditeurs, jamais la personne rencontrée (11 §2) ;
//   · il ne touche aucune colonne financière — `planned_days` est un VOLUME, pas
//     un coût (§18.3, invariant 3).
//
// ── L'UNICITÉ EST ARBITRÉE PAR LA BASE, PAS PAR UNE LECTURE PRÉALABLE ───────
// `UNIQUE (mission_id, user_id, org_unit_id)` existe au fichier 04. Un `SELECT`
// préalable ne supprimerait pas le besoin de traduire l'échec : entre la lecture et
// l'insertion, une autre requête peut prendre la place. On laisse donc la
// contrainte trancher et on TRADUIT — même geste, même raison, que le SIREN de
// `companies` (voir `domaines/companies/depot.ts`).
//
// Traçabilité : E25 (zéro oubli : plan d'entretiens et affectations) · E33
// (sécurité / RGPD : habilitation §34.4, aucune donnée personnelle rendue) · E43
// (exécutabilité autopilote : pagination keyset, conventions de dépôt).
// =============================================================================
import { and, eq, isNull } from 'drizzle-orm';
import {
  AppError,
  type PaginationQuery,
  type StatutPlanificationApi,
  type StatutSessionApi,
} from '@axion/shared';
import {
  interviews,
  missionUsers,
  missions,
  orgUnits,
  users,
  workAssignments,
} from '../../db/schema.js';
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
// LES LIGNES
// -----------------------------------------------------------------------------

/** Une affectation de travail, telle que le dépôt la rend. */
export interface LigneAffectation {
  readonly id: string;
  readonly missionId: string;
  readonly userId: string;
  readonly orgUnitId: string;
  readonly plannedInterviews: number | null;
  /** `NUMERIC` du 04 : une CHAÎNE, jamais un flottant. */
  readonly plannedDays: string | null;
  /** `DATE` du 04 : « AAAA-MM-JJ », sans heure et donc sans fuseau. */
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
}

/** Les colonnes rendues, en un seul endroit — deux listes finiraient par diverger. */
const COLONNES_AFFECTATION = {
  id: workAssignments.id,
  missionId: workAssignments.missionId,
  userId: workAssignments.userId,
  orgUnitId: workAssignments.orgUnitId,
  plannedInterviews: workAssignments.plannedInterviews,
  plannedDays: workAssignments.plannedDays,
  dateFrom: workAssignments.dateFrom,
  dateTo: workAssignments.dateTo,
};

/** Ce que la réaffectation a besoin de savoir d'une session — et rien de plus. */
export interface LigneSession {
  readonly id: string;
  readonly missionId: string;
  readonly orgUnitId: string;
  /** PROPRIÉTAIRE de la session : seul habilité à écrire via sync (05 §9.9). */
  readonly conductedBy: string;
  readonly status: StatutSessionApi;
  readonly scheduleStatus: StatutPlanificationApi;
  readonly updatedAt: Date;
}

const COLONNES_SESSION = {
  id: interviews.id,
  missionId: interviews.missionId,
  orgUnitId: interviews.orgUnitId,
  conductedBy: interviews.conductedBy,
  status: interviews.status,
  scheduleStatus: interviews.scheduleStatus,
  updatedAt: interviews.updatedAt,
};

/** L'état d'un compte au regard du §34.4 — des FAITS, aucune décision. */
export interface EtatUtilisateurAffectable {
  readonly id: string;
  readonly estActif: boolean;
  /** `null` = auditeur NON habilité : « un auditeur non habilité ne touche jamais un client ». */
  readonly habilitatedAt: Date | null;
}

// -----------------------------------------------------------------------------
// LECTURES
// -----------------------------------------------------------------------------

/**
 * La mission existe-t-elle, et est-elle vivante ?
 *
 * Lue AVANT toute écriture pour qu'une mission inconnue rende un `404` portant un
 * message utile plutôt qu'un nom de contrainte de clé étrangère. La clé étrangère
 * reste la seconde ceinture — entre cette lecture et l'insertion, rien ne garantit
 * que la mission survit, et c'est elle qui arbitre alors.
 */
export async function missionVivante(executeur: ExecuteurSql, missionId: string): Promise<boolean> {
  const lignes = await executeur
    .select({ id: missions.id })
    .from(missions)
    .where(and(eq(missions.id, missionId), isNull(missions.deletedAt)))
    .limit(1);

  return lignes.length > 0;
}

/**
 * L'unité appartient-elle À CETTE mission ?
 *
 * ⚠ La clé étrangère de `work_assignments.org_unit_id` pointe `org_units` **sans
 * dire de quelle mission** : affecter un auditeur à l'unité d'une AUTRE mission
 * passerait donc toutes les contraintes du 04. Ce contrôle est le seul qui ferme
 * la porte, et il est fait dans la transaction de l'écriture.
 */
export async function uniteAppartientALaMission(
  executeur: ExecuteurSql,
  orgUnitId: string,
  missionId: string,
): Promise<boolean> {
  const lignes = await executeur
    .select({ id: orgUnits.id })
    .from(orgUnits)
    .where(and(eq(orgUnits.id, orgUnitId), eq(orgUnits.missionId, missionId)))
    .limit(1);

  return lignes.length > 0;
}

/** L'état du compte visé. `null` s'il n'existe pas. */
export async function lireUtilisateurAffectable(
  executeur: ExecuteurSql,
  userId: string,
): Promise<EtatUtilisateurAffectable | null> {
  const lignes = await executeur
    .select({ id: users.id, estActif: users.isActive, habilitatedAt: users.habilitatedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return lignes[0] ?? null;
}

/**
 * Le rôle de cet utilisateur SUR CETTE MISSION, ou `null` s'il n'y est pas.
 *
 * C'est la mesure dont le service a besoin pour deux règles distinctes : « lead de
 * la mission » (§34.3, qui n'est PAS un rôle global et ne peut donc pas s'exprimer
 * dans `config.acces`) et « destinataire membre de la mission » (§34.4).
 */
export async function lireRoleSurMission(
  executeur: ExecuteurSql,
  missionId: string,
  userId: string,
): Promise<string | null> {
  const lignes = await executeur
    .select({ role: missionUsers.roleOnMission })
    .from(missionUsers)
    .where(and(eq(missionUsers.missionId, missionId), eq(missionUsers.userId, userId)))
    .limit(1);

  return lignes[0]?.role ?? null;
}

/**
 * Le curseur de la liste : **`(id)` ascendant**.
 *
 * `work_assignments.id` est un **UUID v7** (invariant 1) : son ordre lexicographique
 * EST l'ordre de création, ce qui donne à la fois un tri utile et une clé unique —
 * la condition que `paginerParCurseur` exige de sa dernière composante. Une seule
 * clé suffit donc ici, là où `missions` en demande deux (`created_at` n'est pas
 * unique). L'index de clé primaire sert le tri sans travail supplémentaire.
 */
const CURSEUR_AFFECTATIONS: DefinitionCurseur<LigneAffectation> = {
  ressource: 'assignments',
  sens: 'asc',
  cles: [{ colonne: workAssignments.id, valeur: (ligne) => ligne.id }],
};

/** Une page d'affectations d'UNE mission — le filtre par mission n'est pas optionnel. */
export async function listerAffectations(
  executeur: ExecuteurSql,
  missionId: string,
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneAffectation>> {
  const lignes = await executeur
    .select(COLONNES_AFFECTATION)
    .from(workAssignments)
    .where(
      and(
        eq(workAssignments.missionId, missionId),
        conditionApresCurseur(CURSEUR_AFFECTATIONS, pagination.after),
      ),
    )
    .orderBy(...ordreDuCurseur(CURSEUR_AFFECTATIONS))
    .limit(limiteAChercher(pagination));

  return paginerParCurseur(CURSEUR_AFFECTATIONS, pagination, lignes);
}

/**
 * Lit une session ET LA VERROUILLE jusqu'à la fin de la transaction.
 *
 * Même raison que pour la machine à états : la réaffectation est un
 * lire-décider-écrire. Sans `FOR UPDATE`, deux demandes concurrentes liraient le
 * même `status = 'planifie'`, jugeraient toutes deux valides, et la seconde
 * écrirait sur un état déjà périmé — `activity_log` porterait alors un « avant »
 * qui n'a jamais été l'auteur de la session.
 */
export async function lireSessionPourReaffectation(
  executeur: ExecuteurSql,
  interviewId: string,
): Promise<LigneSession | null> {
  const lignes = await executeur
    .select(COLONNES_SESSION)
    .from(interviews)
    .where(eq(interviews.id, interviewId))
    .limit(1)
    .for('update');

  return lignes[0] ?? null;
}

// -----------------------------------------------------------------------------
// ÉCRITURES — et la traduction des erreurs du pilote PostgreSQL
// -----------------------------------------------------------------------------

/** Code SQLSTATE d'une violation d'unicité (PostgreSQL). */
const VIOLATION_UNICITE = '23505';

/** Code SQLSTATE d'une violation de clé étrangère (PostgreSQL). */
const VIOLATION_CLE_ETRANGERE = '23503';

/**
 * Le nom EXACT de la contrainte d'unicité, tel que la pose la migration
 * `0006_rapport_cadrage_pilotage.sql` :
 * `UNIQUE (mission_id, user_id, org_unit_id)`.
 *
 * On la NOMME plutôt que de traiter tout `23505` comme un doublon d'affectation :
 * le jour où une seconde contrainte unique apparaîtra sur cette table, un message
 * parlant du triplet serait FAUX — et un message d'erreur faux envoie chercher au
 * mauvais endroit, ce qui coûte plus cher qu'un message absent.
 */
const CONTRAINTE_AFFECTATION_UNIQUE = 'work_assignments_mission_id_user_id_org_unit_id_key';

const CONTRAINTE_UTILISATEUR = 'work_assignments_user_id_fkey';
const CONTRAINTE_UNITE = 'work_assignments_org_unit_id_fkey';
const CONTRAINTE_MISSION = 'work_assignments_mission_id_fkey';

/**
 * Profondeur de remontée de la chaîne `cause`. Deux suffisent aujourd'hui
 * (`DrizzleQueryError` → `DatabaseError`) ; trois laissent la marge d'un
 * enveloppement supplémentaire sans jamais risquer une boucle.
 */
const PROFONDEUR_MAX_CAUSE = 3;

/**
 * Reconnaît une violation de contrainte NOMMÉE, SANS `instanceof` ni assertion.
 *
 * MESURÉ au lot L3a sur `drizzle-orm@0.44.7` : une requête qui échoue ne propage
 * PAS l'erreur du pilote — elle lève une `DrizzleQueryError` qui RANGE la
 * `DatabaseError` de `pg` dans sa propriété `cause`, sans recopier `code` ni
 * `constraint`. Un `catch` qui lirait `erreur.code` rendrait donc toujours `false`,
 * et un doublon d'affectation sortirait en **500** au lieu de **409**.
 */
function violeLaContrainte(erreur: unknown, sqlstate: string, contrainte: string): boolean {
  let courante: unknown = erreur;
  for (let profondeur = 0; profondeur <= PROFONDEUR_MAX_CAUSE; profondeur += 1) {
    if (typeof courante !== 'object' || courante === null) return false;

    const code = 'code' in courante ? courante.code : undefined;
    const nom = 'constraint' in courante ? courante.constraint : undefined;
    if (code === sqlstate && nom === contrainte) return true;

    courante = 'cause' in courante ? courante.cause : undefined;
  }
  return false;
}

/** Traduit les échecs de contrainte que cette route peut provoquer, relance le reste. */
function traduireEchecDeContrainte(erreur: unknown): never {
  if (violeLaContrainte(erreur, VIOLATION_UNICITE, CONTRAINTE_AFFECTATION_UNIQUE)) {
    throw new AppError(
      'CONFLICT',
      'Cet auditeur est déjà affecté à cette unité pour cette mission. Modifiez ' +
        "l'affectation existante plutôt que d'en créer une seconde.",
      [
        {
          path: 'userId',
          code: 'affectation_deja_existante',
          message: 'Une affectation identique existe déjà pour cette mission et cette unité.',
        },
      ],
    );
  }
  if (violeLaContrainte(erreur, VIOLATION_CLE_ETRANGERE, CONTRAINTE_UTILISATEUR)) {
    throw new AppError('VALIDATION_FAILED', "Ce compte utilisateur n'existe pas.", [
      { path: 'userId', code: 'utilisateur_inconnu', message: "Ce compte n'existe pas." },
    ]);
  }
  if (violeLaContrainte(erreur, VIOLATION_CLE_ETRANGERE, CONTRAINTE_UNITE)) {
    throw new AppError('VALIDATION_FAILED', "Cette unité de l'arbre n'existe pas.", [
      { path: 'orgUnitId', code: 'unite_inconnue', message: "Cette unité n'existe pas." },
    ]);
  }
  if (violeLaContrainte(erreur, VIOLATION_CLE_ETRANGERE, CONTRAINTE_MISSION)) {
    throw new AppError('NOT_FOUND', "Cette mission n'existe pas.");
  }
  throw erreur;
}

/** Ce qu'une création fournit. `id` est un UUID v7 frappé par le service. */
export interface NouvelleAffectation {
  readonly id: string;
  readonly missionId: string;
  readonly userId: string;
  readonly orgUnitId: string;
  readonly plannedInterviews: number | null;
  readonly plannedDays: string | null;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
}

/**
 * Insère une affectation. **N'ouvre pas de transaction** : l'appelant en tient une,
 * parce que le contrôle « l'unité appartient à la mission » et l'écriture doivent
 * voir le même arbre.
 */
export async function insererAffectation(
  executeur: ExecuteurSql,
  nouvelle: NouvelleAffectation,
): Promise<LigneAffectation> {
  let lignes: LigneAffectation[];
  try {
    lignes = await executeur
      .insert(workAssignments)
      .values({
        id: nouvelle.id,
        missionId: nouvelle.missionId,
        userId: nouvelle.userId,
        orgUnitId: nouvelle.orgUnitId,
        plannedInterviews: nouvelle.plannedInterviews,
        plannedDays: nouvelle.plannedDays,
        dateFrom: nouvelle.dateFrom,
        dateTo: nouvelle.dateTo,
      })
      .returning(COLONNES_AFFECTATION);
  } catch (erreur: unknown) {
    return traduireEchecDeContrainte(erreur);
  }

  const ligne = lignes[0];
  if (ligne === undefined) {
    // Inatteignable : un INSERT sans conflit rend toujours sa ligne. On échoue
    // plutôt que d'assertir — une assertion mentirait au compilateur.
    throw new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
  }
  return ligne;
}

/**
 * Change le PROPRIÉTAIRE d'une session (§34.4), et rien d'autre.
 *
 * `updated_at` est bousculé — c'est bien la session qui change, et le curseur de
 * pull delta (§9.5) doit la redescendre au nouvel auditeur, « qui les récupère à
 * son prochain pull ». `schedule_status` et `status` ne sont pas touchés :
 * réaffecter ne replanifie pas et ne redémarre rien.
 *
 * ⚠ **Aucune ligne n'est écrasée au sens de l'invariant 7** : la valeur précédente
 * de `conducted_by` est rendue par cette fonction (`avant`) et le service en fait
 * une entrée `activity_log` — la trace exigée par le §34.4. C'est la seule mémoire
 * du changement, et c'est pourquoi elle n'est pas facultative.
 */
export async function reaffecterSession(
  executeur: ExecuteurSql,
  interviewId: string,
  nouveauProprietaireId: string,
  maintenant: Date,
): Promise<LigneSession | null> {
  const lignes = await executeur
    .update(interviews)
    .set({ conductedBy: nouveauProprietaireId, updatedAt: maintenant })
    .where(eq(interviews.id, interviewId))
    .returning(COLONNES_SESSION);

  return lignes[0] ?? null;
}
