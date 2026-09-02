// =============================================================================
// DÉPÔT DU PLAN D'ENTRETIENS — LECTURE SEULE, sans exception.
// Lot L3, incrément L3d, tâche T5.
//
// ── IL N'Y A AUCUNE ÉCRITURE DANS CE FICHIER, ET C'EN EST LE SUJET ──────────
// Le plan §32.4 est une CIBLE, pas des lignes `interviews` : `conducted_by` est
// NOT NULL au fichier 04 alors qu'un plan ne nomme AUCUN auditeur, et
// `POST …/interview-plan/apply` est REPORTÉE avec cette escalade (`DECISIONS.md`
// 2026-08-31). Tant que l'escalade est ouverte, ce dépôt ne sait pas écrire — et
// le fait qu'il ne contienne ni `insert`, ni `update`, ni `delete` est la forme la
// plus courte de cette garantie.
//
// ── LES DEUX FILTRAGES QU'IL NE FAIT PAS, ET POURQUOI ───────────────────────
//   · **`in_scope` et `status`** : le générateur COMPTE ce qu'il écarte
//     (`unitesEcartees`, avertissements `unites_hors_perimetre_ignorees` et
//     `unites_non_actives_ignorees`). Filtrer en SQL rendrait ces comptes nuls et
//     ferait disparaître du plan l'information « vous avez 12 unités proposées que
//     personne n'a validées » (§25.3) — un silence, exactement ce que le §17.3
//     interdit ;
//   · **rien n'est trié en SQL** : l'ordre du plan (`position` croissante, nulles
//     en dernier, puis `id`) appartient à la fonction pure, qui doit être stable
//     SANS dépendre d'un `ORDER BY` que personne ne lit dans le test.
//
// ── LE CADRAGE PAR MISSION VIT ICI ──────────────────────────────────────────
// La route est `type: 'mission'` : le crochet vérifie l'identité et le compte, « la
// restriction aux missions de l'utilisateur est faite PAR LE DÉPÔT »
// (`auth/politique.ts`). C'est donc `lireMissionPourPlan` qui joint `mission_users`
// — et qui rend `null`, jamais une erreur : un non-membre reçoit **404** et non
// 403, parce qu'un refus prononcé APRÈS avoir lu la ressource ne doit rien en
// divulguer (`DECISIONS.md` 2026-09-02).
//
// ── CE QU'IL NE LIT PAS ─────────────────────────────────────────────────────
// Ni `scoping_estimates`, ni la moindre colonne d'argent : le plan dit COMBIEN
// d'entretiens, jamais combien ils coûtent (§18.3 — « l'auditeur ne voit jamais le
// TJM », invariant 3).
//
// Traçabilité : E25 (zéro oubli : le plan d'entretiens et la couverture) · E40
// (règles d'échantillonnage du §32.4) · E4 (arbre organisationnel à profondeur
// libre : le plan se dimensionne unité par unité) · E43 (exécutabilité autopilote).
// =============================================================================
import { and, eq, isNull } from 'drizzle-orm';
import { interlocutorProfiles, missionUsers, missions, orgUnits } from '../../db/schema.js';
import type { ExecuteurSql } from '../auth/depot.js';
import type { MissionPourPlan, ProfilPourPlan, UnitePourPlan } from './generateur.js';

/**
 * Qui demande le plan.
 *
 * `estAdmin` n'est PAS un contournement : « l'admin voit le plan de toute mission,
 * membre ou non, parce que la console est la sienne » (03 §34.1, `DECISIONS.md`
 * 2026-09-02). Un administrateur qui devrait être membre d'une mission pour la
 * piloter ne serait pas un administrateur. Pour tous les autres, la jointure sur
 * `mission_users` est OBLIGATOIRE et il n'existe aucun chemin qui la saute.
 */
export interface DemandeurDuPlan {
  readonly utilisateurId: string;
  readonly estAdmin: boolean;
}

/**
 * La mission, SI le demandeur y a droit. `null` couvre les trois cas — mission
 * inexistante, supprimée, ou non partagée avec le demandeur — et c'est délibéré :
 * distinguer les trois dans la réponse ferait de la route un oracle d'existence de
 * missions.
 */
export async function lireMissionPourPlan(
  executeur: ExecuteurSql,
  missionId: string,
  demandeur: DemandeurDuPlan,
): Promise<MissionPourPlan | null> {
  const colonnes = { id: missions.id, auditLevel: missions.auditLevel };
  const filtreMission = and(eq(missions.id, missionId), isNull(missions.deletedAt));

  const lignes = demandeur.estAdmin
    ? await executeur.select(colonnes).from(missions).where(filtreMission).limit(1)
    : await executeur
        .select(colonnes)
        .from(missions)
        .innerJoin(
          missionUsers,
          and(
            eq(missionUsers.missionId, missions.id),
            eq(missionUsers.userId, demandeur.utilisateurId),
          ),
        )
        .where(filtreMission)
        .limit(1);

  return lignes[0] ?? null;
}

/**
 * TOUTES les unités de l'arbre de la mission, à plat.
 *
 * Le générateur écarte lui-même celles d'une autre mission (`missionId` fait partie
 * de ce qu'il lit) : la précondition est redite là où elle se vérifie, et cette
 * redite ne coûte qu'une comparaison de chaînes.
 */
export async function lireUnitesPourPlan(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly UnitePourPlan[]> {
  const lignes = await executeur
    .select({
      id: orgUnits.id,
      missionId: orgUnits.missionId,
      parentId: orgUnits.parentId,
      kind: orgUnits.kind,
      name: orgUnits.name,
      headcount: orgUnits.headcount,
      inScope: orgUnits.inScope,
      status: orgUnits.status,
      position: orgUnits.position,
    })
    .from(orgUnits)
    .where(eq(orgUnits.missionId, missionId));

  return lignes;
}

/**
 * Le référentiel des profils d'interlocuteur (seedé, 11 §5).
 *
 * Le générateur ne les FILTRE pas, il les ORDONNE (`direction`, `encadrement`,
 * `terrain`) : le plan LISTE les profils à couvrir par unité, sans jamais les
 * chiffrer — `interviews.interlocutor_profile_id` n'existe pas au 04, et chiffrer
 * par profil inventerait une donnée qu'aucune table ne pourrait recevoir
 * (`DECISIONS.md` 2026-09-01).
 */
export async function lireProfilsPourPlan(
  executeur: ExecuteurSql,
): Promise<readonly ProfilPourPlan[]> {
  const lignes = await executeur
    .select({
      code: interlocutorProfiles.code,
      labelFr: interlocutorProfiles.labelFr,
      groupCode: interlocutorProfiles.groupCode,
    })
    .from(interlocutorProfiles);

  return lignes;
}
