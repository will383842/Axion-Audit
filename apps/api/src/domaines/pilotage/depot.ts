// =============================================================================
// DÉPÔT DU PILOTAGE — LECTURE SEULE, ET L'AGRÉGATION SE FAIT EN SQL.
// Lot L7, incrément L7b.
//
// ── IL N'Y A AUCUNE ÉCRITURE ICI, ET C'EN EST LE SUJET ──────────────────────
// Piloter, c'est REGARDER. Ce fichier ne contient ni `insert`, ni `update`, ni
// `delete` — la forme la plus courte de cette garantie. Un écran de couverture qui
// écrirait quoi que ce soit (ne serait-ce qu'un cache de scores) fabriquerait une
// vérité concurrente de la collecte.
//
// ── POURQUOI L'AGRÉGATION EST EN SQL (invariant 6 : le siège produit) ───────
// FIL-GC : 150 unités, 6 types de session, ~8 000 réponses. Descendre les lignes
// pour les recompter dans le service — ou pire, dans le navigateur — ferait
// voyager 8 000 objets pour produire 900 nombres. Les deux agrégats de ce fichier
// rendent au plus 900 et 1 350 lignes, quelle que soit la taille de la mission.
//
// ── LES TROIS COMPTES DE SESSION, ET POURQUOI ILS SONT TROIS ────────────────
// `planifie`, `realise` et `nonAnnulees` répondent à trois questions distinctes ;
// les fondre en un ratio perdrait l'information qui rend l'écran actionnable (voir
// `couverture.ts`). Le `filter (where …)` de PostgreSQL les produit en UN passage
// sur l'index de `mission_id`, là où trois requêtes en feraient trois.
//
// ── CE QU'IL NE LIT PAS ─────────────────────────────────────────────────────
// Ni `scoping_estimates`, ni `scoping_financials`, ni `interviews.person_name`,
// ni `person_email`. La couverture COMPTE des sessions ; elle ne dit ni ce
// qu'elles coûtent (invariant 3, §18.3) ni qui y était (11 §2).
//
// ── LE CADRAGE PAR MISSION VIT ICI ──────────────────────────────────────────
// La route est `type: 'mission'` : « la restriction aux missions de l'utilisateur
// est faite PAR LE DÉPÔT » (`auth/politique.ts`). `lireMissionPourPilotage` joint
// donc `mission_users` et rend `null` — jamais une erreur : un non-membre reçoit
// **404**, parce qu'un refus prononcé après avoir lu la ressource en divulguerait
// l'existence (`DECISIONS.md` 2026-09-02).
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E14
// (consolidation, divergences, radar) · E21 (auditeurs jamais d'accès aux
// montants) · E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { AppError, ENTIER_POSTGRES_MAX, type PaginationQuery } from '@axion/shared';
import {
  answers,
  blocks,
  interviews,
  missionQuestions,
  missionUsers,
  missions,
  orgUnits,
  questions,
  services,
} from '../../db/schema.js';
import {
  decoderCurseur,
  limiteAChercher,
  paginerParCurseur,
  type DefinitionCurseur,
  type PageCurseur,
} from '../../http/pagination.js';
import type { ExecuteurSql } from '../auth/depot.js';
import type { BlocTouche, CompteSessionsUnite } from './couverture.js';

/**
 * Qui demande le pilotage.
 *
 * `estAdmin` n'est pas un contournement : « l'admin voit le plan de toute mission,
 * membre ou non, parce que la console est la sienne » (03 §34.1, `DECISIONS.md`
 * 2026-09-02). Pour tous les autres, la jointure sur `mission_users` est
 * OBLIGATOIRE, et il n'existe aucun chemin qui la saute.
 */
export interface DemandeurDePilotage {
  readonly utilisateurId: string;
  readonly estAdmin: boolean;
}

/** Ce que le pilotage a besoin de savoir de la mission — et rien de plus. */
export interface MissionPourPilotage {
  readonly id: string;
  /** §22.2 — le fuseau de MISSION, celui auquel l'écran rendra ses heures. */
  readonly timezone: string;
  /** `missions.active_blocks` : le dénominateur des « blocs non couverts » (§16.6). */
  readonly blocsActifs: readonly string[];
}

/**
 * La mission, SI le demandeur y a droit. `null` couvre les trois cas — inexistante,
 * supprimée, non partagée — et c'est délibéré : les distinguer ferait de la route
 * un oracle d'existence de missions.
 */
export async function lireMissionPourPilotage(
  executeur: ExecuteurSql,
  missionId: string,
  demandeur: DemandeurDePilotage,
): Promise<MissionPourPilotage | null> {
  const colonnes = {
    id: missions.id,
    timezone: missions.timezone,
    activeBlocks: missions.activeBlocks,
  };
  const filtre = and(eq(missions.id, missionId), isNull(missions.deletedAt));

  const lignes = demandeur.estAdmin
    ? await executeur.select(colonnes).from(missions).where(filtre).limit(1)
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
        .where(filtre)
        .limit(1);

  const ligne = lignes[0];
  if (ligne === undefined) return null;
  return {
    id: ligne.id,
    timezone: ligne.timezone,
    blocsActifs: codesDeBlocs(ligne.activeBlocks),
  };
}

/**
 * `missions.active_blocks` est un JSONB : le contrat le déclare tableau de codes,
 * la base ne peut pas le garantir. On rend ce qui est LISIBLE et on ignore le
 * reste, plutôt que de faire tomber un écran de pilotage sur une donnée malformée.
 */
function codesDeBlocs(brut: unknown): readonly string[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter((valeur): valeur is string => typeof valeur === 'string');
}

/**
 * LES DÉCOMPTES DE SESSIONS PAR UNITÉ ET PAR TYPE — un passage, une agrégation.
 *
 * Les trois `filter (where …)` transcrivent les définitions écrites au contrat
 * partagé (`pilotage.ts`, `celluleCouvertureSchema`) :
 *   · `planifie` — la session a une place dans l'agenda. `realise` y est inclus
 *     parce qu'une session TENUE a évidemment été planifiée : sans lui, confirmer
 *     puis tenir une session FERAIT BAISSER le planifié, ce qui est absurde ;
 *   · `realise` — `status = 'termine'`, et rien d'autre : une session commencée
 *     n'est pas une session tenue ;
 *   · `nonAnnulees` — tout ce qui n'est ni annulé ni reporté. C'est le seul compte
 *     qui décide de l'alerte §16.6 : une unité dont la session reste à planifier
 *     n'est pas une unité oubliée.
 *
 * ⚠ La couverture compte des `kind`, JAMAIS des `mode` : un entretien
 * complémentaire (§32.6) est un entretien, et il n'ouvre aucune colonne.
 */
export async function compterSessionsParUnite(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly CompteSessionsUnite[]> {
  const lignes = await executeur
    .select({
      orgUnitId: interviews.orgUnitId,
      kind: interviews.kind,
      planifie: sql<string>`count(*) filter (where ${interviews.scheduleStatus} in ('planifie','confirme','realise'))`,
      realise: sql<string>`count(*) filter (where ${interviews.status} = 'termine')`,
      nonAnnulees: sql<string>`count(*) filter (where ${interviews.scheduleStatus} not in ('annule','reporte'))`,
    })
    .from(interviews)
    .where(eq(interviews.missionId, missionId))
    .groupBy(interviews.orgUnitId, interviews.kind);

  return lignes.map((ligne) => ({
    orgUnitId: ligne.orgUnitId,
    kind: ligne.kind,
    planifie: Number(ligne.planifie),
    realise: Number(ligne.realise),
    nonAnnulees: Number(ligne.nonAnnulees),
  }));
}

/**
 * LES BLOCS RÉELLEMENT ABORDÉS, unité par unité (§16.6, « blocs non couverts »).
 *
 * ── CE QUI COMPTE COMME « ABORDÉ », ET POURQUOI ─────────────────────────────
 * TOUTE ligne d'`answers` — y compris « non communiqué » et « sans objet ». Le
 * bloc a été POSÉ : c'est ce que cette colonne mesure. La COMPLÉTUDE, elle, exclut
 * les non communiquées (§27.4, §32.1-3) et n'est pas d'ici : confondre les deux
 * ferait disparaître de l'écran le travail réellement fait sur un bloc que le
 * client a refusé de documenter.
 *
 * ── LA RÉVISION COURANTE, ET RIEN D'AUTRE (invariant 7) ─────────────────────
 * `answers` porte la version courante ; `answer_revisions` archive les valeurs
 * écrasées. Cette requête n'ouvre donc JAMAIS l'archive — non par oubli, mais
 * parce que la lire ferait compter deux fois une réponse corrigée.
 */
export async function listerBlocsTouches(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly BlocTouche[]> {
  const lignes = await executeur
    .selectDistinct({ orgUnitId: interviews.orgUnitId, blocCode: blocks.code })
    .from(answers)
    .innerJoin(interviews, eq(interviews.id, answers.interviewId))
    .innerJoin(missionQuestions, eq(missionQuestions.id, answers.missionQuestionId))
    .innerJoin(questions, eq(questions.id, missionQuestions.questionId))
    .innerJoin(blocks, eq(blocks.id, questions.blockId))
    .where(eq(interviews.missionId, missionId));

  return lignes;
}

// -----------------------------------------------------------------------------
// AGRÉGATION PAR QUESTION (M5.1) — TROIS REQUÊTES, ET AUCUNE N'EST DE TROP
// -----------------------------------------------------------------------------
// ① les TOTAUX, agrégés en SQL sur la mission entière (filtres appliqués) : ils
//    ne se calculent JAMAIS sur la page — un total qui change en tournant la page
//    est un chiffre faux qui a l'air juste ;
// ② la PAGE de questions, en keyset `(position, id)` ;
// ③ les RÉPONSES des questions de la page, et d'elles seules — c'est ce qui borne
//    le coût : une mission FIL-GC porte ~8 000 réponses, une page en porte
//    quelques centaines. Sans cette borne, le p95 dépendrait de la taille de la
//    mission, ce que la pagination existe précisément pour éviter.

/** Les filtres de M5.1 réellement livrés (voir `agregationQuerySchema`). */
export interface FiltreAgregation {
  /** CODE de bloc (`blocks.code`), pas son identifiant : c'est ce que l'URL porte. */
  readonly block?: string | undefined;
  /** L'unité AUDITÉE (`interviews.org_unit_id`) — jamais la fonction du répondant. */
  readonly orgUnit?: string | undefined;
}

/** Une question du questionnaire FIGÉ de la mission — le texte qui a été posé. */
export interface LigneQuestionAgregee {
  readonly missionQuestionId: string;
  readonly blocCode: string;
  readonly blocLibelle: string;
  readonly texte: string;
  readonly criticite: string | null;
  readonly typeReponse: string | null;
  readonly sourceAttendue: string | null;
  readonly position: number | null;
  readonly optionsSnapshot: unknown;
}

/**
 * UNE RÉPONSE, telle qu'elle sort de la base — révision COURANTE (invariant 7).
 *
 * ⚠ **`person_name` ET `person_email` NE SONT PAS SÉLECTIONNÉS**, et ce n'est pas
 * un oubli : ce type ne les porte pas, donc aucune projection ne peut les rendre.
 * M5.1 demande « nom/fonction/service du répondant » ; le pack ne dit nulle part
 * sous quelle condition de consentement (§26) un nom s'affiche au siège. La
 * FONCTION et le SERVICE suffisent à lire une divergence direction ↔ terrain, et
 * la question du nom est portée en `DECISIONS.md` (2026-09-05) plutôt que devinée.
 */
export interface LigneReponseAgregee {
  readonly answerId: string;
  readonly missionQuestionId: string;
  readonly interviewId: string;
  readonly sessionKind: string;
  readonly orgUnitId: string;
  readonly orgUnitNom: string;
  readonly orgUnitInScope: boolean;
  readonly fonctionRepondant: string | null;
  readonly serviceRepondant: string | null;
  readonly provenance: string;
  readonly valeur: unknown;
  readonly nonCommunique: boolean;
  readonly motifNonCommunique: string | null;
  readonly sansObjet: boolean;
  readonly motifSansObjet: string | null;
  readonly aRevoir: boolean;
  readonly motifARevoir: string | null;
  readonly horsParcours: boolean;
  readonly note: string | null;
  readonly revision: number;
  readonly misAJourLe: Date;
}

/** Un bloc du référentiel, avec son libellé français (sélecteur de filtre). */
export interface LigneBloc {
  readonly code: string;
  readonly libelle: string;
}

/** Les blocs du référentiel, dans l'ordre du §2.1. Le service ne garde que les actifs. */
export async function listerBlocs(executeur: ExecuteurSql): Promise<readonly LigneBloc[]> {
  const lignes = await executeur
    .select({ code: blocks.code, libelle: blocks.labelFr, position: blocks.position })
    .from(blocks)
    .orderBy(
      sql`coalesce(${blocks.position}, ${ENTIER_POSTGRES_MAX}) asc`,
      sql`${blocks.code} asc`,
    );

  return lignes.map(({ code, libelle }) => ({ code, libelle }));
}

/**
 * LE RANG DE TRI DU QUESTIONNAIRE — `coalesce(position, MAX_INT)`.
 *
 * Même réconciliation que pour l'arbre (`org-units/depot.ts`), et pour la même
 * raison : `mission_questions.position` est NULLABLE au 04, or une composante
 * nulle rend toute comparaison de n-uplets indécidable — la page suivante
 * sauterait des lignes sans jamais lever d'erreur. Ce qui est trié, comparé ET
 * encodé dans le curseur est donc le RANG, jamais la colonne nue.
 */
const RANG_QUESTION = sql`coalesce(${missionQuestions.position}, ${ENTIER_POSTGRES_MAX})`;

/**
 * Le curseur de `GET /v1/missions/:id/aggregation` : **`(position, id)` ascendant**.
 *
 * `mission_questions.id` est la clé primaire, donc unique : l'ordre est TOTAL, et
 * deux questions de même position ne peuvent ni se doubler ni s'escamoter.
 */
const CURSEUR_QUESTIONS: DefinitionCurseur<LigneQuestionAgregee> = {
  ressource: 'mission_questions',
  sens: 'asc',
  cles: [
    {
      colonne: missionQuestions.position,
      valeur: (ligne) => String(ligne.position ?? ENTIER_POSTGRES_MAX),
    },
    { colonne: missionQuestions.id, valeur: (ligne) => ligne.missionQuestionId },
  ],
};

/** La clause « après le curseur », sur le RANG DE TRI plutôt que sur la colonne nue. */
function apresLaQuestion(curseur: string | undefined): SQL | undefined {
  if (curseur === undefined) return undefined;
  const [rang, id] = decoderCurseur(CURSEUR_QUESTIONS, curseur);
  if (rang === undefined || id === undefined) {
    // Inatteignable : `decoderCurseur` a déjà vérifié l'arité. On échoue quand
    // même plutôt que d'asserter — c'est le curseur qui vient du réseau.
    throw new AppError(
      'INVALID_CURSOR',
      'Le curseur de pagination est invalide. Reprenez la liste depuis le début.',
    );
  }
  return sql`(${RANG_QUESTION}, ${missionQuestions.id}) > (${rang}::integer, ${id}::uuid)`;
}

/**
 * UNE PAGE du questionnaire figé, keyset, filtre de bloc appliqué.
 *
 * ⚠ `mission_id` EST DANS LE `WHERE`, TOUJOURS (invariant 3) : la politique de
 * route dit qui entre, ce filtre dit ce que le SQL ramène.
 *
 * Le filtre d'UNITÉ n'est PAS appliqué ici, et c'est voulu : il porte sur les
 * RÉPONSES. Une question qu'aucune session de l'unité n'a abordée doit rester
 * visible et vide — c'est précisément l'information « on ne l'a pas posée là-bas ».
 */
export async function listerQuestionsFigees(
  executeur: ExecuteurSql,
  missionId: string,
  filtre: FiltreAgregation,
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneQuestionAgregee>> {
  const lignes = await executeur
    .select({
      missionQuestionId: missionQuestions.id,
      blocCode: blocks.code,
      blocLibelle: blocks.labelFr,
      texte: missionQuestions.textSnapshot,
      criticite: missionQuestions.criticalitySnapshot,
      typeReponse: missionQuestions.answerTypeSnapshot,
      sourceAttendue: questions.expectedSource,
      position: missionQuestions.position,
      optionsSnapshot: missionQuestions.optionsSnapshot,
    })
    .from(missionQuestions)
    .innerJoin(questions, eq(questions.id, missionQuestions.questionId))
    .innerJoin(blocks, eq(blocks.id, questions.blockId))
    .where(
      and(
        eq(missionQuestions.missionId, missionId),
        filtre.block === undefined ? undefined : eq(blocks.code, filtre.block),
        apresLaQuestion(pagination.after),
      ),
    )
    .orderBy(sql`${RANG_QUESTION} asc`, sql`${missionQuestions.id} asc`)
    .limit(limiteAChercher(pagination));

  return paginerParCurseur(CURSEUR_QUESTIONS, pagination, lignes);
}

/**
 * LES RÉPONSES DES QUESTIONS DE LA PAGE — et d'elles seules.
 *
 * Une liste d'identifiants VIDE rend une liste vide sans toucher la base : un
 * `in ()` sur une liste vide est un piège SQL classique, et l'éviter ici évite
 * surtout un aller-retour inutile sur une page sans question.
 */
export async function listerReponsesDesQuestions(
  executeur: ExecuteurSql,
  missionId: string,
  missionQuestionIds: readonly string[],
  filtre: FiltreAgregation,
): Promise<readonly LigneReponseAgregee[]> {
  if (missionQuestionIds.length === 0) return [];

  const lignes = await executeur
    .select({
      answerId: answers.id,
      missionQuestionId: answers.missionQuestionId,
      interviewId: answers.interviewId,
      sessionKind: interviews.kind,
      orgUnitId: interviews.orgUnitId,
      orgUnitNom: orgUnits.name,
      orgUnitInScope: orgUnits.inScope,
      fonctionRepondant: interviews.personRole,
      serviceRepondant: services.labelFr,
      provenance: answers.source,
      valeur: answers.value,
      nonCommunique: answers.withheld,
      motifNonCommunique: answers.withheldReason,
      sansObjet: answers.notApplicable,
      motifSansObjet: answers.naReason,
      aRevoir: answers.flagReview,
      motifARevoir: answers.reviewReason,
      horsParcours: answers.horsParcours,
      note: answers.note,
      revision: answers.revision,
      misAJourLe: answers.updatedAt,
    })
    .from(answers)
    .innerJoin(interviews, eq(interviews.id, answers.interviewId))
    .innerJoin(orgUnits, eq(orgUnits.id, interviews.orgUnitId))
    .leftJoin(services, eq(services.id, interviews.personServiceId))
    .where(
      and(
        eq(interviews.missionId, missionId),
        inArray(answers.missionQuestionId, [...missionQuestionIds]),
        filtre.orgUnit === undefined ? undefined : eq(interviews.orgUnitId, filtre.orgUnit),
      ),
    )
    // Ordre STABLE : deux lectures de la même page rendent les réponses dans le
    // même ordre, sinon l'écran « bouge » sans qu'aucune donnée n'ait changé.
    .orderBy(sql`${orgUnits.name} asc`, sql`${answers.id} asc`);

  return lignes;
}

/** Les totaux de M5.1 — calculés sur la mission ENTIÈRE, filtres appliqués. */
export interface TotauxAgregation {
  readonly questions: number;
  readonly questionsAvecReponse: number;
  readonly reponses: number;
  readonly nonCommuniquees: number;
  readonly sansObjet: number;
  readonly aRevoir: number;
  readonly parProvenance: ReadonlyMap<string, number>;
}

/**
 * LES TOTAUX, EN SQL — aucun transfert de ligne.
 *
 * Aucune de ces requêtes ne descend une seule réponse : elles rendent des
 * NOMBRES. Sur FIL-GC (8 000 réponses), c'est la différence entre une réponse en
 * quelques millisecondes et un écran qui rame en proportion de la mission.
 */
export async function compterTotauxAgregation(
  executeur: ExecuteurSql,
  missionId: string,
  filtre: FiltreAgregation,
): Promise<TotauxAgregation> {
  const filtreDeBloc = filtre.block === undefined ? undefined : eq(blocks.code, filtre.block);
  const filtreDUnite =
    filtre.orgUnit === undefined ? undefined : eq(interviews.orgUnitId, filtre.orgUnit);

  const lignesQuestions = await executeur
    .select({ total: sql<string>`count(*)` })
    .from(missionQuestions)
    .innerJoin(questions, eq(questions.id, missionQuestions.questionId))
    .innerJoin(blocks, eq(blocks.id, questions.blockId))
    .where(and(eq(missionQuestions.missionId, missionId), filtreDeBloc));

  const lignesReponses = await executeur
    .select({
      reponses: sql<string>`count(*)`,
      questionsAvecReponse: sql<string>`count(distinct ${answers.missionQuestionId})`,
      nonCommuniquees: sql<string>`count(*) filter (where ${answers.withheld})`,
      sansObjet: sql<string>`count(*) filter (where ${answers.notApplicable})`,
      aRevoir: sql<string>`count(*) filter (where ${answers.flagReview})`,
    })
    .from(answers)
    .innerJoin(interviews, eq(interviews.id, answers.interviewId))
    .innerJoin(missionQuestions, eq(missionQuestions.id, answers.missionQuestionId))
    .innerJoin(questions, eq(questions.id, missionQuestions.questionId))
    .innerJoin(blocks, eq(blocks.id, questions.blockId))
    .where(and(eq(interviews.missionId, missionId), filtreDeBloc, filtreDUnite));

  const lignesProvenance = await executeur
    .select({ provenance: answers.source, nombre: sql<string>`count(*)` })
    .from(answers)
    .innerJoin(interviews, eq(interviews.id, answers.interviewId))
    .innerJoin(missionQuestions, eq(missionQuestions.id, answers.missionQuestionId))
    .innerJoin(questions, eq(questions.id, missionQuestions.questionId))
    .innerJoin(blocks, eq(blocks.id, questions.blockId))
    .where(and(eq(interviews.missionId, missionId), filtreDeBloc, filtreDUnite))
    .groupBy(answers.source);

  const surLesReponses = lignesReponses[0];

  return {
    questions: Number(lignesQuestions[0]?.total ?? 0),
    questionsAvecReponse: Number(surLesReponses?.questionsAvecReponse ?? 0),
    reponses: Number(surLesReponses?.reponses ?? 0),
    nonCommuniquees: Number(surLesReponses?.nonCommuniquees ?? 0),
    sansObjet: Number(surLesReponses?.sansObjet ?? 0),
    aRevoir: Number(surLesReponses?.aRevoir ?? 0),
    parProvenance: new Map(lignesProvenance.map((l) => [l.provenance, Number(l.nombre)])),
  };
}
