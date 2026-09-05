// =============================================================================
// DÉPÔT DE L'EXPORT — LECTURE SEULE, ET C'EST TOUT LE SUJET. L7, incrément L7c.
//
// ── AUCUNE ÉCRITURE, AUCUN JOURNAL ─────────────────────────────────────────
// Exporter, c'est LIRE. Ni `insert`, ni `update`, ni `delete` dans ce fichier ;
// et aucune écriture dans `activity_log` non plus — l'export recopie des noms
// d'unités, des réponses d'audit et des notes de consultant, que le journal
// garantit de ne jamais contenir (11 §2). Même règle que le pilotage (L7b) et que
// le plan (`DECISIONS.md` 2026-09-02).
//
// ── PAS DE KEYSET ICI, ET C'EST DÉLIBÉRÉ ───────────────────────────────────
// Le 11 §3 impose la pagination keyset sur les LISTES d'une API. Un export n'est
// pas une liste : c'est UN fichier, et un fichier partiel serait un fichier faux —
// un rapport rédigé sur la moitié des réponses est pire qu'un rapport impossible.
// Le coût est borné et connu : FIL-GC porte 150 unités, ~60 sessions et ~8 000
// réponses, soit quelques mégaoctets de texte, produits par le SIÈGE
// (invariant 6). Les seules bornes qui comptent ici sont celles du `where`.
//
// ── CE QUE CE DÉPÔT NE LIT JAMAIS (invariant 3) ────────────────────────────
// Ni `scoping_financials`, ni `scoping_estimates`, ni `estimation_params`, ni
// `mission_rebaselines` (§25.1 : « visible ADMIN SEUL »). Aucun montant d'Axion
// n'entre dans un fichier qui part chez le consultant qui rédige.
//
// ── LA PORTE DU NOM DU RÉPONDANT VIT ICI, ET NULLE PART AILLEURS ───────────
// `person_name` n'est sélectionné QUE si l'appelant a passé `repondants=true`
// ET pour les seules lignes dont `consent_given IS TRUE` — le `NULL` et le
// `false` sont masqués de la même façon (arbitrage A01 du 2026-09-05). Le SQL
// rend `null` dans tous les autres cas, si bien qu'aucun module d'écriture de
// fichier ne peut ouvrir cette porte par mégarde. `person_email` n'est jamais lu.
//
// Traçabilité : E14 (consolidation) · E21 (auditeurs jamais d'accès aux montants)
// · E22 (console) · E36 (exécutable par lots avec critères).
// =============================================================================
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  aiSystems,
  answers,
  attachments,
  blocks,
  companies,
  findings,
  interviews,
  missionQuestions,
  missionUsers,
  missions,
  orgUnits,
  questions,
  services,
  toolsInventory,
  useCases,
  users,
} from '../../db/schema.js';
import type { ExecuteurSql } from '../auth/depot.js';
import type { DemandeurDePilotage } from '../pilotage/depot.js';
import type {
  LigneCasUsageExport,
  LigneConstatExport,
  LigneOutilExport,
  LignePieceJointeExport,
  LigneReponseExport,
  LigneSessionExport,
  LigneSystemeIaExport,
} from './fichiers.js';

/** Le demandeur d'un export est celui d'un pilotage : même politique, même 404. */
export type DemandeurDExport = DemandeurDePilotage;

// -----------------------------------------------------------------------------
// LA MISSION ET SON CLIENT
// -----------------------------------------------------------------------------

export interface MissionPourExport {
  readonly id: string;
  readonly titre: string;
  readonly statut: string;
  readonly niveauAudit: string;
  readonly offreCommerciale: string | null;
  readonly timezone: string;
  readonly perimetreGeo: string;
  readonly paysCode: string | null;
  readonly blocsActifs: readonly string[];
  readonly secteursActifs: readonly string[];
  readonly ndaRef: string | null;
  readonly ndaSigneeLe: string | null;
  readonly debutPrevu: string | null;
  readonly finPrevue: string | null;
  readonly livreeLe: Date | null;
  readonly creeeLe: Date;
  readonly client: {
    readonly id: string;
    readonly nom: string;
    readonly siren: string | null;
    readonly codeNaf: string | null;
    readonly effectif: number | null;
    readonly nombreDeSites: number | null;
    readonly pays: readonly string[];
  };
}

/** Un JSONB déclaré « tableau de chaînes » au contrat : on rend ce qui est lisible. */
function chaines(brut: unknown): readonly string[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter((v): v is string => typeof v === 'string');
}

/**
 * La mission et son client, SI le demandeur y a droit.
 *
 * `null` couvre les trois cas — inexistante, supprimée, non partagée — parce que
 * les distinguer ferait de la route un oracle d'existence de missions. Un
 * non-membre reçoit **404**, jamais 403 : la convention posée par L7b.
 */
export async function lireMissionPourExport(
  executeur: ExecuteurSql,
  missionId: string,
  demandeur: DemandeurDExport,
): Promise<MissionPourExport | null> {
  const colonnes = {
    id: missions.id,
    titre: missions.title,
    statut: missions.status,
    niveauAudit: missions.auditLevel,
    offreCommerciale: missions.commercialOffer,
    timezone: missions.timezone,
    perimetreGeo: missions.geoScope,
    paysCode: missions.countryCode,
    blocsActifs: missions.activeBlocks,
    secteursActifs: missions.activeSectors,
    ndaRef: missions.ndaRef,
    ndaSigneeLe: missions.ndaSignedAt,
    debutPrevu: missions.startPlanned,
    finPrevue: missions.endPlanned,
    livreeLe: missions.deliveredAt,
    creeeLe: missions.createdAt,
    clientId: companies.id,
    clientNom: companies.name,
    clientSiren: companies.siren,
    clientNaf: companies.nafCode,
    clientEffectif: companies.headcount,
    clientSites: companies.sitesCount,
    clientPays: companies.countries,
  };
  const filtre = and(eq(missions.id, missionId), isNull(missions.deletedAt));

  const base = executeur
    .select(colonnes)
    .from(missions)
    .innerJoin(companies, eq(companies.id, missions.companyId));
  const lignes = demandeur.estAdmin
    ? await base.where(filtre).limit(1)
    : await base
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
    titre: ligne.titre,
    statut: ligne.statut,
    niveauAudit: ligne.niveauAudit,
    offreCommerciale: ligne.offreCommerciale,
    timezone: ligne.timezone,
    perimetreGeo: ligne.perimetreGeo,
    paysCode: ligne.paysCode,
    blocsActifs: chaines(ligne.blocsActifs),
    secteursActifs: chaines(ligne.secteursActifs),
    ndaRef: ligne.ndaRef,
    ndaSigneeLe: ligne.ndaSigneeLe,
    debutPrevu: ligne.debutPrevu,
    finPrevue: ligne.finPrevue,
    livreeLe: ligne.livreeLe,
    creeeLe: ligne.creeeLe,
    client: {
      id: ligne.clientId,
      nom: ligne.clientNom,
      siren: ligne.clientSiren,
      codeNaf: ligne.clientNaf,
      effectif: ligne.clientEffectif,
      nombreDeSites: ligne.clientSites,
      pays: chaines(ligne.clientPays),
    },
  };
}

// -----------------------------------------------------------------------------
// L'ÉQUIPE
// -----------------------------------------------------------------------------

export interface AuditeurExport {
  readonly utilisateurId: string;
  readonly nom: string;
  readonly roleSurMission: string;
}

/**
 * Les auditeurs de la mission — nom et rôle, **jamais l'adresse électronique**.
 *
 * `mission.json` sert à écrire le chapitre méthodologie (« entretiens menés, par
 * qui »). Une adresse professionnelle dans un fichier qui circule n'y sert à rien.
 */
export async function listerAuditeurs(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly AuditeurExport[]> {
  return executeur
    .select({
      utilisateurId: users.id,
      nom: users.name,
      roleSurMission: missionUsers.roleOnMission,
    })
    .from(missionUsers)
    .innerJoin(users, eq(users.id, missionUsers.userId))
    .where(eq(missionUsers.missionId, missionId))
    .orderBy(sql`${users.name} asc`);
}

// -----------------------------------------------------------------------------
// L'ARBRE
// -----------------------------------------------------------------------------

export interface UnitePourExport {
  readonly id: string;
  readonly nom: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly effectif: number | null;
  readonly inScope: boolean;
  readonly statut: string;
}

/**
 * Toutes les unités de la mission, SAUF les fusionnées.
 *
 * Une unité fusionnée n'est plus un nœud : ses sessions ont été re-rattachées à sa
 * cible, et la compter des deux côtés doublerait la couverture. Rien n'est
 * supprimé pour autant (invariant 7) : la ligne survit avec son `merged_into_id`.
 * Même règle que l'écran de couverture de L7b.
 */
export async function listerUnitesPourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly UnitePourExport[]> {
  return executeur
    .select({
      id: orgUnits.id,
      nom: orgUnits.name,
      kind: orgUnits.kind,
      parentId: orgUnits.parentId,
      effectif: orgUnits.headcount,
      inScope: orgUnits.inScope,
      statut: orgUnits.status,
    })
    .from(orgUnits)
    .where(and(eq(orgUnits.missionId, missionId), ne(orgUnits.status, 'fusionnee')));
}

// -----------------------------------------------------------------------------
// LES SESSIONS
// -----------------------------------------------------------------------------

/**
 * LA PORTE DU NOM, EN SQL — `consent_given IS TRUE`, et rien d'autre.
 *
 * `IS TRUE` traite `NULL` comme faux, ce qui est la demande exacte de l'arbitrage
 * (« le nul vaut non »). Écrire `= true` donnerait `NULL` pour un consentement
 * inconnu, donc une cellule vide — le même résultat par hasard, pas par règle. La
 * différence compte le jour où quelqu'un déplace ce fragment.
 */
function nomSousConsentement(avecNoms: boolean) {
  return avecNoms
    ? sql<
        string | null
      >`case when ${interviews.consentGiven} is true then ${interviews.personName} else null end`
    : sql<string | null>`null::text`;
}

export async function listerSessionsPourExport(
  executeur: ExecuteurSql,
  missionId: string,
  avecNoms: boolean,
): Promise<readonly LigneSessionExport[]> {
  const auditeur = users;
  return executeur
    .select({
      id: interviews.id,
      kind: interviews.kind,
      mode: interviews.mode,
      orgUnitId: interviews.orgUnitId,
      orgUnitNom: orgUnits.name,
      fonctionPersonne: interviews.personRole,
      servicePersonne: services.labelFr,
      nomPersonne: nomSousConsentement(avecNoms),
      consentement: interviews.consentGiven,
      auditeurNom: auditeur.name,
      planifieeLe: interviews.scheduledAt,
      dureePrevueMin: interviews.scheduledDurationMin,
      statutPlanification: interviews.scheduleStatus,
      statut: interviews.status,
      debutLe: interviews.startedAt,
      finLe: interviews.endedAt,
      notesGenerales: interviews.generalNotes,
    })
    .from(interviews)
    .innerJoin(orgUnits, eq(orgUnits.id, interviews.orgUnitId))
    .leftJoin(services, eq(services.id, interviews.personServiceId))
    .leftJoin(auditeur, eq(auditeur.id, interviews.conductedBy))
    .where(eq(interviews.missionId, missionId))
    .orderBy(
      sql`${interviews.scheduledAt} asc nulls last`,
      sql`${orgUnits.name} asc`,
      sql`${interviews.id} asc`,
    );
}

// -----------------------------------------------------------------------------
// LES RÉPONSES — le fichier central du §36.3
// -----------------------------------------------------------------------------

/**
 * Toutes les réponses de la mission, jointes à leur question FIGÉE et à leur unité.
 *
 * Le texte vient de `mission_questions.text_snapshot` : la question telle qu'elle a
 * été POSÉE. Une banque révisée depuis ne peut pas réécrire l'histoire d'une
 * mission — et le rapport cite ce qui a été demandé, pas ce qu'on demanderait
 * aujourd'hui.
 *
 * `answers` porte la révision COURANTE (invariant 7) ; `answer_revisions` archive
 * les valeurs écrasées et n'est PAS lue ici — la lire ferait compter deux fois une
 * réponse corrigée.
 */
export async function listerReponsesPourExport(
  executeur: ExecuteurSql,
  missionId: string,
  avecNoms: boolean,
): Promise<readonly LigneReponseExport[]> {
  return executeur
    .select({
      answerId: answers.id,
      sessionId: answers.interviewId,
      blocCode: blocks.code,
      blocLibelle: blocks.labelFr,
      blocPosition: blocks.position,
      questionCode: questions.code,
      questionTexte: missionQuestions.textSnapshot,
      questionPosition: missionQuestions.position,
      criticite: missionQuestions.criticalitySnapshot,
      poids: missionQuestions.weightSnapshot,
      typeReponse: missionQuestions.answerTypeSnapshot,
      sourceAttendue: questions.expectedSource,
      orgUnitId: interviews.orgUnitId,
      orgUnitNom: orgUnits.name,
      orgUnitInScope: orgUnits.inScope,
      sessionKind: interviews.kind,
      sessionMode: interviews.mode,
      provenance: answers.source,
      fonctionRepondant: interviews.personRole,
      serviceRepondant: services.labelFr,
      nomRepondant: nomSousConsentement(avecNoms),
      valeur: answers.value,
      optionsSnapshot: missionQuestions.optionsSnapshot,
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
    .innerJoin(missionQuestions, eq(missionQuestions.id, answers.missionQuestionId))
    .innerJoin(questions, eq(questions.id, missionQuestions.questionId))
    .innerJoin(blocks, eq(blocks.id, questions.blockId))
    .leftJoin(services, eq(services.id, interviews.personServiceId))
    .where(eq(interviews.missionId, missionId));
}

// -----------------------------------------------------------------------------
// LES CONSTATS, LES CAS D'USAGE, LES INVENTAIRES
// -----------------------------------------------------------------------------

export async function listerConstatsPourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly LigneConstatExport[]> {
  return executeur
    .select({
      id: findings.id,
      orgUnitId: findings.orgUnitId,
      orgUnitNom: orgUnits.name,
      blocCode: blocks.code,
      severite: findings.severity,
      titre: findings.title,
      enonce: findings.statement,
      sources: findings.sources,
      recommandation: findings.recommendation,
      responsableSuggere: findings.ownerSuggested,
      statutRemediation: findings.remediationStatus,
      vague: findings.wave,
      statut: findings.status,
      creeLe: findings.createdAt,
      misAJourLe: findings.updatedAt,
    })
    .from(findings)
    .leftJoin(orgUnits, eq(orgUnits.id, findings.orgUnitId))
    .leftJoin(blocks, eq(blocks.id, findings.blockId))
    .where(eq(findings.missionId, missionId))
    .orderBy(sql`${findings.severity} asc`, sql`${findings.createdAt} asc`);
}

/**
 * Les cas d'usage, **tous statuts confondus** — y compris `ecarte`.
 *
 * §36.6-5 : « dire NON fait partie du rapport ». Un filtre sur le statut ferait
 * disparaître de l'export le livrable le plus fort de la promesse publique.
 */
export async function listerCasUsagePourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly LigneCasUsageExport[]> {
  return executeur
    .select({
      id: useCases.id,
      titre: useCases.title,
      description: useCases.description,
      orgUnitId: useCases.orgUnitId,
      orgUnitNom: orgUnits.name,
      serviceNom: services.labelFr,
      statut: useCases.status,
      conditions: useCases.conditions,
      gainEstime: useCases.estimatedGain,
      coutEstime: useCases.estimatedCost,
      complexite: useCases.complexity,
      delaiMois: useCases.delayMonths,
      niveauRisque: useCases.riskLevel,
      vague: useCases.wave,
      valeurInitiale: useCases.baselineValue,
      uniteInitiale: useCases.baselineUnit,
      sessionSourceInitiale: useCases.baselineSourceSessionId,
      valeurCible: useCases.targetValue,
      donneesRequises: useCases.dataRequired,
      donneesDisponibles: useCases.dataAvailable,
      approche: useCases.approach,
      indicateurSucces: useCases.successMetric,
      hypotheses: useCases.assumptions,
      gainBas: useCases.gainLow,
      gainHaut: useCases.gainHigh,
      retourMois: useCases.paybackMonths,
      refTaxonomie: useCases.taxonomyRef,
      creeLe: useCases.createdAt,
      misAJourLe: useCases.updatedAt,
    })
    .from(useCases)
    .leftJoin(orgUnits, eq(orgUnits.id, useCases.orgUnitId))
    .leftJoin(services, eq(services.id, useCases.serviceId))
    .where(eq(useCases.missionId, missionId))
    .orderBy(sql`${useCases.status} asc`, sql`${useCases.title} asc`);
}

export async function listerOutilsPourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly LigneOutilExport[]> {
  return executeur
    .select({
      id: toolsInventory.id,
      nom: toolsInventory.name,
      categorie: toolsInventory.category,
      editeur: toolsInventory.vendor,
      orgUnitId: toolsInventory.orgUnitId,
      orgUnitNom: orgUnits.name,
      descriptionUsage: toolsInventory.usageDescription,
      nombreUtilisateurs: toolsInventory.usersCount,
      criticite: toolsInventory.criticality,
      noteQualiteDonnees: toolsInventory.dataQualityNote,
      sessionSourceId: toolsInventory.sourceSessionId,
      creeLe: toolsInventory.createdAt,
    })
    .from(toolsInventory)
    .leftJoin(orgUnits, eq(orgUnits.id, toolsInventory.orgUnitId))
    .where(eq(toolsInventory.missionId, missionId))
    .orderBy(sql`${toolsInventory.name} asc`);
}

export async function listerSystemesIaPourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly LigneSystemeIaExport[]> {
  return executeur
    .select({
      id: aiSystems.id,
      nom: aiSystems.name,
      editeur: aiSystems.vendor,
      orgUnitId: aiSystems.orgUnitId,
      orgUnitNom: orgUnits.name,
      serviceNom: services.labelFr,
      descriptionUsage: aiSystems.usageDescription,
      categoriesDonnees: aiSystems.dataCategories,
      responsableMetier: aiSystems.businessOwner,
      roleActeur: aiSystems.actorRole,
      niveauRisque: aiSystems.riskLevel,
      obligations: aiSystems.obligations,
      statutConformite: aiSystems.complianceStatus,
      source: aiSystems.source,
      notes: aiSystems.notes,
      creeLe: aiSystems.createdAt,
      misAJourLe: aiSystems.updatedAt,
    })
    .from(aiSystems)
    .leftJoin(orgUnits, eq(orgUnits.id, aiSystems.orgUnitId))
    .leftJoin(services, eq(services.id, aiSystems.serviceId))
    .where(eq(aiSystems.missionId, missionId))
    .orderBy(sql`${aiSystems.name} asc`);
}

/**
 * Le manifeste des pièces jointes — les MÉTA, jamais les octets.
 *
 * `storage_key` n'est pas exporté : il ne sert à rien hors de l'API et désigne un
 * emplacement interne. Les fichiers eux-mêmes sont une option du §36.3 qui n'est
 * pas livrable en L7c (`DECISIONS.md` 2026-09-05).
 */
export async function listerPiecesJointesPourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly LignePieceJointeExport[]> {
  return executeur
    .select({
      id: attachments.id,
      sessionId: attachments.interviewId,
      answerId: attachments.answerId,
      questionTexte: missionQuestions.textSnapshot,
      kind: attachments.kind,
      nomFichier: attachments.filename,
      mime: attachments.mime,
      tailleOctets: attachments.sizeBytes,
      contenu: attachments.content,
      creeLe: attachments.createdAt,
    })
    .from(attachments)
    .leftJoin(answers, eq(answers.id, attachments.answerId))
    .leftJoin(missionQuestions, eq(missionQuestions.id, answers.missionQuestionId))
    .where(eq(attachments.missionId, missionId))
    .orderBy(sql`${attachments.createdAt} asc`, sql`${attachments.id} asc`);
}

// -----------------------------------------------------------------------------
// LA COMPLÉTUDE GLOBALE (§36.3, méta de `mission.json`)
// -----------------------------------------------------------------------------

export interface ComptesPourExport {
  readonly questionsFigees: number;
  readonly questionsAvecAuMoinsUneReponse: number;
  readonly reponsesCollectees: number;
  readonly nonCommuniquees: number;
  readonly sansObjet: number;
  readonly aRevoir: number;
  readonly horsParcours: number;
  readonly sessionsPlanifiees: number;
  readonly sessionsRealisees: number;
}

/**
 * Les comptes de la complétude — EN SQL, aucun transfert de ligne.
 *
 * Ce n'est PAS la complétude du scoring (§32.1-3), qui exclut les non
 * communiquées et appartient à L8 : c'est « quelle part du questionnaire a été
 * abordée ». `mission.json` porte la définition à côté du chiffre, pour que
 * personne ne cite l'une en croyant lire l'autre (`DECISIONS.md` 2026-09-05).
 *
 * Les définitions de `planifiees` et `realisees` sont CELLES DE L7b, mot pour
 * mot : `planifie ∪ confirme ∪ realise` d'un côté, `status = 'termine'` de
 * l'autre. Deux définitions voisines dans le même produit finiraient par diverger.
 */
export async function compterPourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<ComptesPourExport> {
  const questionsFigees = await executeur
    .select({ total: sql<string>`count(*)` })
    .from(missionQuestions)
    .where(eq(missionQuestions.missionId, missionId));

  const surLesReponses = await executeur
    .select({
      reponses: sql<string>`count(*)`,
      questionsAvecReponse: sql<string>`count(distinct ${answers.missionQuestionId})`,
      nonCommuniquees: sql<string>`count(*) filter (where ${answers.withheld})`,
      sansObjet: sql<string>`count(*) filter (where ${answers.notApplicable})`,
      aRevoir: sql<string>`count(*) filter (where ${answers.flagReview})`,
      horsParcours: sql<string>`count(*) filter (where ${answers.horsParcours})`,
    })
    .from(answers)
    .innerJoin(interviews, eq(interviews.id, answers.interviewId))
    .where(eq(interviews.missionId, missionId));

  const surLesSessions = await executeur
    .select({
      planifiees: sql<string>`count(*) filter (where ${interviews.scheduleStatus} in ('planifie','confirme','realise'))`,
      realisees: sql<string>`count(*) filter (where ${interviews.status} = 'termine')`,
    })
    .from(interviews)
    .where(eq(interviews.missionId, missionId));

  const reponses = surLesReponses[0];
  const sessions = surLesSessions[0];

  return {
    questionsFigees: Number(questionsFigees[0]?.total ?? 0),
    questionsAvecAuMoinsUneReponse: Number(reponses?.questionsAvecReponse ?? 0),
    reponsesCollectees: Number(reponses?.reponses ?? 0),
    nonCommuniquees: Number(reponses?.nonCommuniquees ?? 0),
    sansObjet: Number(reponses?.sansObjet ?? 0),
    aRevoir: Number(reponses?.aRevoir ?? 0),
    horsParcours: Number(reponses?.horsParcours ?? 0),
    sessionsPlanifiees: Number(sessions?.planifiees ?? 0),
    sessionsRealisees: Number(sessions?.realisees ?? 0),
  };
}

// -----------------------------------------------------------------------------
// LES SESSIONS PAR UNITÉ (colonnes « sessions prévues / réalisées » d'arbre.csv)
// -----------------------------------------------------------------------------

export interface ComptesSessionsUniteExport {
  readonly orgUnitId: string;
  readonly planifiees: number;
  readonly realisees: number;
}

/**
 * Le même comptage que la couverture de L7b, agrégé par UNITÉ (et non par unité ×
 * type) : `arbre.csv` du §36.3 ne demande que « sessions prévues / réalisées ».
 * La ventilation par type de source se relit dans `sessions.csv`, ligne à ligne.
 */
export async function compterSessionsParUnitePourExport(
  executeur: ExecuteurSql,
  missionId: string,
): Promise<readonly ComptesSessionsUniteExport[]> {
  const lignes = await executeur
    .select({
      orgUnitId: interviews.orgUnitId,
      planifiees: sql<string>`count(*) filter (where ${interviews.scheduleStatus} in ('planifie','confirme','realise'))`,
      realisees: sql<string>`count(*) filter (where ${interviews.status} = 'termine')`,
    })
    .from(interviews)
    .where(eq(interviews.missionId, missionId))
    .groupBy(interviews.orgUnitId);

  return lignes.map((ligne) => ({
    orgUnitId: ligne.orgUnitId,
    planifiees: Number(ligne.planifiees),
    realisees: Number(ligne.realisees),
  }));
}
