// =============================================================================
// ASSEMBLAGE DE L'AGRÉGATION PAR QUESTION — FONCTION PURE. 03 M5.1, §27.4.
// Lot L7, incrément L7b.
//
// ── CE QU'ELLE FAIT ─────────────────────────────────────────────────────────
// Elle RECOUD : une page de questions figées, les réponses de cette page, et des
// totaux déjà agrégés en SQL. Elle ne compte rien qui puisse l'être en base
// (invariant 6) et ne décide d'aucune règle métier — la seule qu'elle applique est
// écrite au §27.4, et elle consiste précisément à NE RIEN FONDRE.
//
// ── LES QUATRE SITUATIONS, ET POURQUOI ON LES SÉPARE JUSQU'AU BOUT ──────────
//   · RENSEIGNÉE — une valeur existe ;
//   · NON COMMUNIQUÉE (§27.4) — on a demandé, on n'a pas obtenu. **C'est un fait
//     d'audit**, pas une anomalie, et il alimente la rubrique « Limites et
//     réserves » du rapport ;
//   · SANS OBJET — la question ne se pose pas ici ;
//   · JAMAIS POSÉE — aucune ligne. Elle ne se voit qu'au compte `posee = 0`.
// Un « non communiqué » confondu avec une absence de réponse serait un défaut de
// FOND, pas d'affichage : l'auditeur ne pourrait plus distinguer ce qu'on a refusé
// de lui dire de ce qu'il n'a pas demandé. « À revoir » est transverse : une
// réponse à revoir reste renseignée.
//
// ── PURE, DONC REPRODUCTIBLE ────────────────────────────────────────────────
// Aucune E/S, aucune horloge : `calculeLe` est REÇU. L'ordre des questions est
// celui du dépôt (le `ORDER BY` du keyset) et n'est jamais retrié ici — un second
// tri pourrait contredire le curseur et faire sauter des lignes.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E12 (entretiens par
// interlocuteur, à-revoir) · E22 (console de pilotage 7 espaces).
// =============================================================================
import {
  MOTIFS_NON_COMMUNIQUE,
  PROVENANCES_REPONSE,
  type AgregationMission,
  type CompteProvenance,
  type MotifNonCommuniqueApi,
  type ProvenanceReponse,
  type QuestionAgregee,
  type ReponseAgregee,
} from '@axion/shared';
import type {
  FiltreAgregation,
  LigneBloc,
  LigneQuestionAgregee,
  LigneReponseAgregee,
  TotauxAgregation,
} from './depot.js';
import { aplatirValeur } from './valeur.js';

export interface EntreeAgregation {
  readonly missionId: string;
  readonly timezone: string;
  /** ISO 8601 UTC, FOURNI (11 §3) : une fonction qui lit l'heure n'est pas pure. */
  readonly calculeLe: string;
  readonly blocs: readonly LigneBloc[];
  readonly filtre: FiltreAgregation;
  /** LA PAGE de questions, dans l'ordre du keyset. */
  readonly questions: readonly LigneQuestionAgregee[];
  /** Les réponses des questions de la page, et d'elles seules. */
  readonly reponses: readonly LigneReponseAgregee[];
  readonly nextCursor: string | null;
  /** Agrégés en SQL sur la mission ENTIÈRE, filtres appliqués. */
  readonly totaux: TotauxAgregation;
  /**
   * Les noms des répondants ont-ils été DEMANDÉS ? (2026-09-05, L7c.)
   *
   * L'assembleur ne s'en sert pas pour filtrer — le dépôt a déjà rendu `null` là
   * où la porte est fermée. Il le RECOPIE dans la réponse pour que l'écran sache
   * distinguer « aucun consentement dans cette page » de « je n'ai pas demandé ».
   */
  readonly repondantsAffiches: boolean;
}

/**
 * Une provenance que le contrat connaît, ou `entretien` par défaut.
 *
 * Le 04 pose un CHECK sur `answers.source` : une autre valeur ne peut pas exister
 * en base. On se replie quand même plutôt que de lever, parce que le repli d'un
 * écran de pilotage doit être d'AFFICHER : une console qui refuserait une mission
 * entière à cause d'une ligne hors CHECK serait un défaut plus coûteux que la
 * ligne elle-même. Le défaut du 04 (`DEFAULT 'entretien'`) est le repli naturel.
 */
function provenanceConnue(brut: string): ProvenanceReponse {
  return (PROVENANCES_REPONSE as readonly string[]).includes(brut)
    ? (brut as ProvenanceReponse)
    : 'entretien';
}

/** Un motif de non-communication du CHECK du 04, ou `null` — jamais inventé. */
function motifConnu(brut: string | null): MotifNonCommuniqueApi | null {
  if (brut === null) return null;
  return (MOTIFS_NON_COMMUNIQUE as readonly string[]).includes(brut)
    ? (brut as MotifNonCommuniqueApi)
    : 'autre';
}

/** Les CINQ provenances, toujours présentes : une absente laisserait croire à zéro sujet. */
function comptesParProvenance(nombres: ReadonlyMap<string, number>): CompteProvenance[] {
  return PROVENANCES_REPONSE.map((provenance) => ({
    provenance,
    nombre: nombres.get(provenance) ?? 0,
  }));
}

function projeterReponse(ligne: LigneReponseAgregee, optionsSnapshot: unknown): ReponseAgregee {
  return {
    answerId: ligne.answerId,
    interviewId: ligne.interviewId,
    sessionKind: ligne.sessionKind,
    orgUnitId: ligne.orgUnitId,
    orgUnitNom: ligne.orgUnitNom,
    orgUnitInScope: ligne.orgUnitInScope,
    fonctionRepondant: ligne.fonctionRepondant,
    serviceRepondant: ligne.serviceRepondant,
    // Le dépôt a déjà tranché : ce qui arrive ici est publiable tel quel.
    nomRepondant: ligne.nomRepondant,
    provenance: provenanceConnue(ligne.provenance),
    valeurLisible: aplatirValeur(ligne.valeur, optionsSnapshot),
    nonCommunique: ligne.nonCommunique,
    motifNonCommunique: motifConnu(ligne.motifNonCommunique),
    sansObjet: ligne.sansObjet,
    motifSansObjet: ligne.motifSansObjet,
    aRevoir: ligne.aRevoir,
    motifARevoir: ligne.motifARevoir,
    horsParcours: ligne.horsParcours,
    note: ligne.note,
    revision: ligne.revision,
    // 11 §3 : ISO 8601 UTC en API. Le fuseau de mission est affaire d'AFFICHAGE.
    misAJourLe: ligne.misAJourLe.toISOString(),
  };
}

/** Regroupe les réponses par question — un seul passage sur la liste plate. */
function indexerReponses(
  reponses: readonly LigneReponseAgregee[],
): ReadonlyMap<string, LigneReponseAgregee[]> {
  const index = new Map<string, LigneReponseAgregee[]>();
  for (const reponse of reponses) {
    const existantes = index.get(reponse.missionQuestionId);
    if (existantes === undefined) index.set(reponse.missionQuestionId, [reponse]);
    else existantes.push(reponse);
  }
  return index;
}

function projeterQuestion(
  question: LigneQuestionAgregee,
  lignes: readonly LigneReponseAgregee[],
): QuestionAgregee {
  const reponses = lignes.map((ligne) => projeterReponse(ligne, question.optionsSnapshot));
  const nombresParProvenance = new Map<string, number>();
  for (const reponse of reponses) {
    nombresParProvenance.set(
      reponse.provenance,
      (nombresParProvenance.get(reponse.provenance) ?? 0) + 1,
    );
  }

  const nonCommuniquees = reponses.filter((r) => r.nonCommunique).length;
  const sansObjet = reponses.filter((r) => r.sansObjet).length;

  return {
    missionQuestionId: question.missionQuestionId,
    blocCode: question.blocCode,
    blocLibelle: question.blocLibelle,
    texte: question.texte,
    criticite: question.criticite,
    typeReponse: question.typeReponse,
    sourceAttendue:
      question.sourceAttendue === null ? null : provenanceConnue(question.sourceAttendue),
    comptes: {
      posee: reponses.length,
      // « Renseignée » = ni refusée, ni sans objet. Un « à revoir » EN EST une :
      // c'est un doute sur une réponse, pas une absence de réponse.
      renseignees: reponses.length - nonCommuniquees - sansObjet,
      nonCommuniquees,
      sansObjet,
      aRevoir: reponses.filter((r) => r.aRevoir).length,
      horsParcours: reponses.filter((r) => r.horsParcours).length,
      unitesTouchees: new Set(reponses.map((r) => r.orgUnitId)).size,
    },
    parProvenance: comptesParProvenance(nombresParProvenance),
    reponses,
  };
}

/** Assemble la page d'agrégation. Pure, reproductible, sans horloge. */
export function assemblerAgregation(entree: EntreeAgregation): AgregationMission {
  const reponsesParQuestion = indexerReponses(entree.reponses);

  return {
    missionId: entree.missionId,
    timezone: entree.timezone,
    calculeLe: entree.calculeLe,
    blocs: entree.blocs.map(({ code, libelle }) => ({ code, libelle })),
    filtre: {
      block: entree.filtre.block ?? null,
      orgUnit: entree.filtre.orgUnit ?? null,
    },
    questions: entree.questions.map((question) =>
      projeterQuestion(question, reponsesParQuestion.get(question.missionQuestionId) ?? []),
    ),
    nextCursor: entree.nextCursor,
    totaux: {
      questions: entree.totaux.questions,
      // Le quatrième cas du §27.4, rendu EXPLICITE : ce que personne n'a posé.
      // Borné à zéro : un filtre d'unité peut rendre plus de questions répondues
      // que de questions retenues si les deux comptes divergeaient, et un nombre
      // négatif dans un tableau de bord est pire qu'un nombre absent.
      questionsSansReponse: Math.max(
        0,
        entree.totaux.questions - entree.totaux.questionsAvecReponse,
      ),
      reponses: entree.totaux.reponses,
      nonCommuniquees: entree.totaux.nonCommuniquees,
      sansObjet: entree.totaux.sansObjet,
      aRevoir: entree.totaux.aRevoir,
      parProvenance: comptesParProvenance(entree.totaux.parProvenance),
    },
    repondantsAffiches: entree.repondantsAffiches,
  };
}
