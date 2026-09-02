// =============================================================================
// DÉPÔT DU QUESTIONNAIRE — les lectures que l'assembleur M2 exige, et la SEULE
// écriture de `mission_questions` du dépôt. Lot L3, incrément L3d, tâche T3.
//
// Drizzle NE SERT QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
//
// ── CE QUE CE DÉPÔT NE FAIT PAS, ET C'EST VOULU ─────────────────────────────
//   · **il ne décide rien.** Il ne sait pas si un figeage est permis, ni si une
//     sélection vide est une erreur : il lit des lignes et en insère. L'assemblage
//     est une fonction PURE (`assembleur.ts`), la décision vit dans le service ;
//   · **il ne met JAMAIS à jour une colonne `*_snapshot`.** Il n'y a pas d'`update`
//     dans ce fichier, et c'est le deuxième des trois temps de la preuve de
//     non-dérive (note de conception L3 §3.a) : le seul écrivain légitime d'un
//     snapshot est `resync`, hors de ce lot ;
//   · il ne journalise rien : la porte d'écriture unique du journal est
//     `domaines/journal/service.ts`, appelée par le service APRÈS le commit ;
//   · il ne pré-filtre PAS la banque (voir `lireBanquePourAssemblage`) : l'entonnoir
//     de l'assembleur doit pouvoir compter ce qu'il écarte, sinon « le premier
//     filtre qui a vidé l'ensemble » désignerait toujours le même ;
//   · **il ne touche aucune colonne financière.** Aucune donnée financière
//     n'approche du questionnaire (invariant 3).
//
// ── LES TYPES DE RETOUR SONT CEUX DE L'ASSEMBLEUR ───────────────────────────
// `LigneMissionAssemblage`, `LigneUniteAssemblage`, `QuestionDeBanque`… viennent de
// `assembleur.ts`, qui les dérive lui-même des lignes Drizzle (`$inferSelect`). La
// chaîne est donc : colonne du 04 → ligne Drizzle → entrée de la fonction pure →
// retour de ce dépôt. Le jour où une colonne change de nom, la compilation casse
// ici et non en production.
//
// Traçabilité : E39 (machine à états mission : le figeage n'est ouvert qu'en
// préparation, et la condition « questionnaire figé » se mesure ici) · E30
// (3 niveaux d'audit : `missions.audit_level` entre dans la sélection) · E4 (arbre
// organisationnel : les unités in_scope commandent les paquets de service) · E43
// (exécutabilité autopilote : conventions de dépôt, aucun SQL concaténé).
// =============================================================================
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  activityLog,
  blocks,
  interlocutorProfiles,
  missionQuestions,
  missions,
  orgUnits,
  questions,
  services,
  sizeTiers,
} from '../../db/schema.js';
import type { ExecuteurSql } from '../auth/depot.js';
import type {
  LigneMissionAssemblage,
  LignePalierAssemblage,
  LigneProfilAssemblage,
  LigneUniteAssemblage,
  QuestionDeBanque,
} from './assembleur.js';

// -----------------------------------------------------------------------------
// LA MISSION — ce que l'assemblage lit, plus l'état qui autorise le figeage
// -----------------------------------------------------------------------------

/**
 * La mission telle que le questionnaire a besoin de la connaître.
 *
 * `status` et `sizeTierId` ne servent PAS à l'assemblage (ils n'appartiennent donc
 * pas à `LigneMissionAssemblage`) : le premier décide si le figeage est ouvert
 * (§32.2), le second désigne le palier à résoudre. Ils voyagent ensemble parce
 * qu'ils viennent de la même ligne et qu'une seconde lecture serait une seconde
 * vérité.
 */
export interface LigneMissionQuestionnaire extends LigneMissionAssemblage {
  readonly id: string;
  readonly status: string;
  readonly sizeTierId: string | null;
}

/** Les colonnes lues, en un seul endroit — deux listes finiraient par diverger. */
const COLONNES_MISSION_QUESTIONNAIRE = {
  id: missions.id,
  status: missions.status,
  sizeTierId: missions.sizeTierId,
  activeBlocks: missions.activeBlocks,
  activeSectors: missions.activeSectors,
  auditLevel: missions.auditLevel,
  geoScope: missions.geoScope,
};

/**
 * Lit la mission SANS la verrouiller — le chemin de la prévisualisation, qui
 * n'écrit rien.
 *
 * Filtre `deleted_at IS NULL` comme toutes les lectures de mission du dépôt : une
 * mission supprimée n'a pas de questionnaire à prévisualiser.
 */
export async function lireMissionPourQuestionnaire(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<LigneMissionQuestionnaire | null> {
  const lignes = await executeur
    .select(COLONNES_MISSION_QUESTIONNAIRE)
    .from(missions)
    .where(and(eq(missions.id, missionId), isNull(missions.deletedAt)))
    .limit(1);

  return lignes[0] ?? null;
}

/**
 * Lit la mission ET LA VERROUILLE jusqu'à la fin de la transaction — le chemin du
 * FIGEAGE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * C'EST CE VERROU QUI REND LE FIGEAGE UNIQUE, PAS LE COMPTAGE QUI LE SUIT.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Le figeage est un lire-décider-écrire : compter les lignes existantes, décider,
 * insérer. Sans `FOR UPDATE` sur la MISSION, deux appels concurrents comptent tous
 * deux zéro, jugent tous deux légitime, et insèrent DEUX jeux de lignes — une
 * mission avec deux questionnaires figés, dont aucun `UNIQUE` du 04 ne protège
 * (`mission_questions` n'a d'unicité que sur `id`). Le verrou sérialise : le second
 * appel attend, compte n non nul, et sort en 409. C'est exactement le mécanisme que
 * la note de conception L3 §3.a impose, et la raison pour laquelle il porte sur la
 * mission et non sur les lignes filles — on ne verrouille pas des lignes qui
 * n'existent pas encore.
 */
export async function lireMissionPourFigeage(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<LigneMissionQuestionnaire | null> {
  const lignes = await executeur
    .select(COLONNES_MISSION_QUESTIONNAIRE)
    .from(missions)
    .where(and(eq(missions.id, missionId), isNull(missions.deletedAt)))
    .limit(1)
    .for('update');

  return lignes[0] ?? null;
}

// -----------------------------------------------------------------------------
// LA PREUVE DU FIGEAGE — il n'y a pas de colonne « figé »
// -----------------------------------------------------------------------------

/**
 * COMBIEN de questions sont figées pour cette mission.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNE SEULE IMPLÉMENTATION, ICI, ET DEUX APPELANTS (brief L3D §9-8).
 * ═══════════════════════════════════════════════════════════════════════════════
 * `domaines/missions/depot.ts` (L3b) l'appelle pour mesurer la condition
 * `questionnaire_fige` du §32.2 ; le service de figeage l'appelle pour refuser un
 * second figeage en nommant le nombre de lignes déjà écrites. Deux comptages
 * auraient fini par répondre différemment à la même question — et c'est cette
 * question-là, « le questionnaire est-il figé ? », qui commande la transition
 * `preparation → en_cours`.
 *
 * On rend un NOMBRE et pas un booléen : le booléen se déduit (`> 0`), le nombre
 * ne se devine pas. Le message du 409 doit porter le compte (`DECISIONS.md`
 * 2026-08-29), et un appelant qui ne veut que le booléen ne paie qu'un `count(*)`
 * sur un index de clé étrangère.
 */
export async function compterQuestionsFigees(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<number> {
  const lignes = await executeur
    .select({ total: sql<string>`count(*)` })
    .from(missionQuestions)
    .where(eq(missionQuestions.missionId, missionId));

  return Number(lignes[0]?.total ?? 0);
}

/** L'action de journal qui date un figeage. Voir `lireDateDeFigeage`. */
const ACTION_FIGEAGE = 'mission.questionnaire_freeze';

/**
 * QUAND le questionnaire de cette mission a-t-il été figé ?
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LA DATE VIT DANS `activity_log`, PARCE QUE `mission_questions` N'EN A AUCUNE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `DECISIONS.md` du 2026-08-29 veut que le refus porte « le compte ET la date » ;
 * le 2026-09-02 constate que le catalogue du journal ne connaissait aucune action
 * de figeage et la pose. La table `mission_questions` (04) n'a ni `created_at` ni
 * `frozen_at` — en ajouter une serait modifier le fichier 04, donc la signature de
 * Williams.
 *
 * ⚠ **CETTE LECTURE PEUT LÉGITIMEMENT RENDRE `null`**, et l'appelant doit le
 * supporter : un questionnaire figé avant que l'action n'existe (les fixtures de
 * démonstration en portent), ou une ligne de journal perdue (la porte d'écriture ne
 * lève jamais, par décision), laissent des lignes sans date. Le refus reste alors
 * juste — il est seulement moins précis. Un refus qui échouerait faute de date
 * serait bien pire : il laisserait figer deux fois.
 *
 * Elle n'est faite QUE sur le chemin du refus : un `SELECT` de plus sur un appel
 * qui a déjà échoué ne coûte rien à personne.
 */
export async function lireDateDeFigeage(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<Date | null> {
  const lignes = await executeur
    .select({ createdAt: activityLog.createdAt })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.action, ACTION_FIGEAGE),
        eq(activityLog.entityType, 'mission'),
        eq(activityLog.entityId, missionId),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(1);

  return lignes[0]?.createdAt ?? null;
}

// -----------------------------------------------------------------------------
// LES ENTRÉES DE L'ASSEMBLAGE
// -----------------------------------------------------------------------------

/**
 * Le palier d'effectif de la mission (`size_tiers`), ou `null`.
 *
 * `missions.size_tier_id` est NULLABLE au 04 : une mission sans palier est
 * LÉGITIME, et l'assembleur n'applique alors pas le filtre correspondant, en le
 * DISANT par un avertissement (`DECISIONS.md` 2026-09-02). D'où le `null` en
 * entrée comme en sortie, plutôt qu'une erreur.
 */
export async function lirePalierDeMission(
  executeur: ExecuteurSql,
  sizeTierId: string | null,
): Promise<LignePalierAssemblage | null> {
  if (sizeTierId === null) return null;

  const lignes = await executeur
    .select({
      code: sizeTiers.code,
      headcountMin: sizeTiers.headcountMin,
      headcountMax: sizeTiers.headcountMax,
    })
    .from(sizeTiers)
    .where(eq(sizeTiers.id, sizeTierId))
    .limit(1);

  return lignes[0] ?? null;
}

/**
 * Les unités de l'arbre de la mission, jointes à `services.code`.
 *
 * ⚠ **AUCUN filtre `in_scope` / `status` ici**, alors que l'assemblage ne retient
 * que les unités `in_scope` ET `active` (§16.3, §25.1) : la fonction pure redit sa
 * propre précondition, et un filtre SQL en plus ferait exister deux endroits où la
 * règle peut changer. Le coût est nul (l'arbre d'une mission tient en quelques
 * centaines de lignes, index `org_units(mission_id)`).
 *
 * La jointure est un LEFT JOIN : `service_ref_id` est nullable, et une unité sans
 * service (un établissement, un groupe) ne doit pas disparaître de la lecture —
 * elle ne commande simplement aucun paquet de service.
 */
export async function lireUnitesPourAssemblage(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly LigneUniteAssemblage[]> {
  const lignes = await executeur
    .select({
      inScope: orgUnits.inScope,
      status: orgUnits.status,
      serviceCode: services.code,
    })
    .from(orgUnits)
    .leftJoin(services, eq(orgUnits.serviceRefId, services.id))
    .where(eq(orgUnits.missionId, missionId));

  return lignes;
}

/**
 * LA BANQUE ENTIÈRE, jointe à son bloc.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI RIEN N'EST FILTRÉ EN SQL, ALORS QUE LE BRIEF PARLE DE FILTRES SQL.
 * ═══════════════════════════════════════════════════════════════════════════════
 * L'assembleur livré applique les SEPT filtres lui-même et rend un ENTONNOIR
 * (combien entrent, combien sortent, filtre par filtre) dont le service se sert
 * pour nommer « le premier filtre qui a vidé l'ensemble » (brief L3D §3). Filtrer
 * ici en double rendrait le premier cran de cet entonnoir muet — il compterait
 * toujours autant en entrée qu'en sortie — et le message de refus désignerait
 * systématiquement le mauvais filtre. La sélection appartient donc à la fonction
 * PURE, qui est celle qu'on teste.
 *
 * Le coût est mesurable et borné : la banque est un référentiel de quelques
 * milliers de lignes au plus (9 blocs), lu une fois par prévisualisation ou par
 * figeage — deux actes rares, faits par un administrateur devant un écran. Le jour
 * où ce n'est plus vrai, la réponse n'est pas de filtrer ici mais de faire remonter
 * l'entonnoir dans SQL en entier, ce qui est un autre travail.
 *
 * `INNER JOIN` sur `blocks` : `questions.block_id` est NOT NULL avec une clé
 * étrangère (04). Une question sans bloc n'existe pas, et si elle existait, la
 * laisser entrer sans bloc casserait l'ordre (`blocks.position` ouvre le tri).
 */
export async function lireBanquePourAssemblage(
  executeur: ExecuteurSql,
): Promise<readonly QuestionDeBanque[]> {
  const lignes = await executeur
    .select({
      question: {
        id: questions.id,
        code: questions.code,
        blockId: questions.blockId,
        version: questions.version,
        status: questions.status,
        origin: questions.origin,
        textFr: questions.textFr,
        guidanceFr: questions.guidanceFr,
        answerType: questions.answerType,
        options: questions.options,
        allowRange: questions.allowRange,
        weight: questions.weight,
        scoring: questions.scoring,
        criticality: questions.criticality,
        expectedSource: questions.expectedSource,
        sectors: questions.sectors,
        targetServices: questions.targetServices,
        levels: questions.levels,
        headcountMin: questions.headcountMin,
        headcountMax: questions.headcountMax,
        profiles: questions.profiles,
        geo: questions.geo,
        displayIf: questions.displayIf,
      },
      bloc: {
        id: blocks.id,
        code: blocks.code,
        position: blocks.position,
      },
    })
    .from(questions)
    .innerJoin(blocks, eq(questions.blockId, blocks.id));

  return lignes;
}

/**
 * Le référentiel des profils d'interlocuteur (seedé, 11 §5 — jamais codé en dur).
 *
 * L'assembleur s'en sert pour la PROJECTION par parcours (M2 §3) et pour signaler
 * un profil cité par une question mais absent du référentiel : sans cette lecture,
 * ces questions n'apparaîtraient dans aucun parcours et personne ne le saurait.
 */
export async function lireProfilsPourAssemblage(
  executeur: ExecuteurSql,
): Promise<readonly LigneProfilAssemblage[]> {
  const lignes = await executeur
    .select({ code: interlocutorProfiles.code, groupCode: interlocutorProfiles.groupCode })
    .from(interlocutorProfiles);

  return lignes;
}

// -----------------------------------------------------------------------------
// L'ÉCRITURE — la seule, et elle n'est qu'un INSERT
// -----------------------------------------------------------------------------

/**
 * Une ligne `mission_questions` prête à être écrite. `id` est un **UUID v7
 * APPLICATIF** frappé par le service (invariant 1, 11 §2 — PostgreSQL 16 n'a pas
 * d'`uuidv7()` native, et `gen_random_uuid()` produirait un v4 non ordonnable sur
 * une table créable hors ligne, P1-4).
 */
export interface LigneQuestionFigee {
  readonly id: string;
  readonly missionId: string;
  readonly questionId: string;
  readonly questionVersion: number;
  readonly textSnapshot: string;
  readonly guidanceSnapshot: string | null;
  readonly answerTypeSnapshot: (typeof questions.$inferSelect)['answerType'];
  readonly optionsSnapshot: unknown;
  readonly weightSnapshot: string;
  readonly scoringSnapshot: unknown;
  readonly criticalitySnapshot: (typeof questions.$inferSelect)['criticality'];
  readonly allowRangeSnapshot: boolean;
  readonly position: number;
  readonly addedAdHoc: false;
}

/**
 * Insère les lignes figées. **N'ouvre pas de transaction** : l'appelant en tient
 * une, et c'est elle qui porte le `FOR UPDATE` de la mission.
 *
 * UN SEUL `INSERT` pour toutes les lignes : ~240 allers-retours pour une mission de
 * grand compte se paieraient en secondes, et un échec au milieu laisserait un
 * questionnaire à moitié figé — indistinguable, pour la condition §32.2, d'un
 * questionnaire complet.
 *
 * Rien n'est lu en retour : ce que l'appelant a écrit, il le connaît déjà, et une
 * clause `RETURNING` ferait croire que la base a pu changer les valeurs.
 */
export async function insererQuestionsFigees(
  executeur: ExecuteurSql,
  lignes: readonly LigneQuestionFigee[],
): Promise<void> {
  if (lignes.length === 0) return;

  await executeur.insert(missionQuestions).values(
    lignes.map((ligne) => ({
      id: ligne.id,
      missionId: ligne.missionId,
      questionId: ligne.questionId,
      questionVersion: ligne.questionVersion,
      textSnapshot: ligne.textSnapshot,
      guidanceSnapshot: ligne.guidanceSnapshot,
      answerTypeSnapshot: ligne.answerTypeSnapshot,
      optionsSnapshot: ligne.optionsSnapshot,
      weightSnapshot: ligne.weightSnapshot,
      scoringSnapshot: ligne.scoringSnapshot,
      criticalitySnapshot: ligne.criticalitySnapshot,
      allowRangeSnapshot: ligne.allowRangeSnapshot,
      position: ligne.position,
      addedAdHoc: ligne.addedAdHoc,
    })),
  );
}
