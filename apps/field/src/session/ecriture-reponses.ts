// =============================================================================
// ÉCRITURE D'UNE RÉPONSE — le geste central de l'écran 3 zones
//
// ── UNE RÉPONSE PAR QUESTION ET PAR SESSION, RÉVISÉE, JAMAIS REMPLACÉE ──────
// 04 §32.6 : UNIQUE(interview_id, mission_question_id) ; « toute re-réponse =
// révision ». Le terrain ré-upserte la MÊME ligne (même id) avec `revision + 1` ;
// c'est le serveur qui archive l'ancienne valeur (`answer_revisions`, 05 §9.3).
// Invariant 7 tenu par construction : l'id ne change jamais, le compteur monte.
//
// ── LES QUATRE DRAPEAUX SONT DES ÉTATS, PAS DES ABSENCES ────────────────────
// `flagReview` (à revoir, motif facultatif), `notApplicable` (motif attendu),
// `withheld` (non communiqué, motif dans une liste fermée §27.4) et
// `horsParcours` (§25.4). Tous en clair dans l'index (liste fermée §3.2), en
// `0 | 1` parce qu'IndexedDB n'indexe pas les booléens (`formes.ts`).
// « Non communiqué » et « sans objet » n'effacent PAS une valeur déjà saisie :
// l'auditeur peut avoir coté avant que l'interlocuteur se ravise, et cette
// valeur est une information. Ils la SIGNALENT.
//
// ── AUCUNE ÉCRITURE SANS SESSION OUVERTE ────────────────────────────────────
// `en_cours` ou `termine` (03 §33.7 V2.10 : un entretien terminé reçoit une note
// additionnelle) ; jamais `non_demarre` (l'accord n'a pas été recueilli), jamais
// `valide` (verrouillée — 03 §19.1). Le refus est une erreur en français, que
// l'écran affiche.
//
// Traçabilité : E13, E30 (§27.4), E14 (à revoir / N-A), E7 (chaque écriture
// pousse une op).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import { depotReponses, type ReponseLocale } from '../local/depots/reponses.js';
import type { QuestionLocale } from '../local/depots/questions.js';
import type { SessionLocale } from '../local/depots/sessions.js';
import { ecrireLocal } from '../local/ecriture.js';
import {
  drapeau,
  type MOTIFS_NON_COMMUNIQUE,
  type SOURCES_REPONSE,
  type TypeDeSession,
} from '../local/formes.js';
import { maintenant } from '../local/horloge.js';
import { estVerrouilleeEnModification, etatSession } from './machine.js';
import type { ValeurTypee } from './valeurs.js';

export type MotifNonCommunique = (typeof MOTIFS_NON_COMMUNIQUE)[number];
export type SourceReponse = (typeof SOURCES_REPONSE)[number];

/** Libellés français des motifs §27.4 — la liste fermée du 04, mot pour mot. */
export const LIBELLE_MOTIF_NON_COMMUNIQUE: Readonly<Record<MotifNonCommunique, string>> = {
  confidentiel: 'Confidentiel — l’entreprise refuse de communiquer',
  non_disponible: 'Non disponible — l’information n’existe pas ou n’est pas accessible',
  hors_perimetre: 'Hors périmètre — la question ne relève pas de cet audit',
  autre: 'Autre motif (précisé en note)',
};

/**
 * La provenance d'une réponse (04 `answers.source`, 03 §27.1) découle du TYPE de
 * session : un atelier est un entretien collectif, une analyse documentaire
 * produit des constats de source `document`.
 */
export function sourceDeSession(kind: TypeDeSession): SourceReponse {
  switch (kind) {
    case 'entretien':
    case 'atelier':
      return 'entretien';
    case 'observation':
      return 'observation';
    case 'demonstration':
      return 'demonstration';
    case 'analyse_documentaire':
      return 'document';
    case 'releve_donnees':
      return 'releve';
  }
}

/** Ce qui change. `undefined` = inchangé ; `null` = effacé (là où c'est permis). */
export interface ModificationReponse {
  readonly value?: ValeurTypee | null;
  readonly note?: string | null;
  readonly flagReview?: boolean;
  readonly reviewReason?: string | null;
  readonly notApplicable?: boolean;
  readonly naReason?: string | null;
  readonly withheld?: boolean;
  readonly withheldReason?: MotifNonCommunique | null;
  /** §25.4 : posé quand la réponse est saisie depuis la recherche. Jamais retiré ici. */
  readonly horsParcours?: boolean;
}

export interface ContexteReponse {
  readonly session: SessionLocale;
  readonly question: QuestionLocale;
}

/** Le refus d'écrire, en français, prêt à être affiché. */
export function motifRefusEcriture(session: SessionLocale): string | null {
  const etat = etatSession(session);
  if (etat === 'non_demarre') {
    return 'Cet entretien n’est pas encore démarré : recueillez l’accord de participation, puis démarrez-le.';
  }
  if (estVerrouilleeEnModification(etat)) {
    return 'Cet entretien est validé et verrouillé : toute correction passe par une révision tracée, demandée au siège.';
  }
  return null;
}

/**
 * Écrit (ou révise) LA réponse de cette question dans cette session, et rend la
 * ligne telle qu'elle est désormais stockée.
 */
export async function ecrireReponse(
  contexte: ContexteReponse,
  modification: ModificationReponse,
): Promise<ReponseLocale> {
  const { session, question } = contexte;
  const refus = motifRefusEcriture(session);
  if (refus !== null) throw new Error(refus);

  const existante = await depotReponses.parQuestion(session.id, question.id);
  const id = existante?.id ?? uuidv7();
  const instant = maintenant();

  const value = modification.value === undefined ? (existante?.value ?? null) : modification.value;
  const note = modification.note === undefined ? (existante?.note ?? null) : modification.note;
  const flagReview = modification.flagReview ?? existante?.flagReview === 1;
  const notApplicable = modification.notApplicable ?? existante?.notApplicable === 1;
  const withheld = modification.withheld ?? existante?.withheld === 1;
  const horsParcours = (modification.horsParcours ?? false) || existante?.horsParcours === 1;

  const reviewReason = flagReview
    ? modification.reviewReason === undefined
      ? (existante?.reviewReason ?? null)
      : modification.reviewReason
    : null;
  const naReason = notApplicable
    ? modification.naReason === undefined
      ? (existante?.naReason ?? null)
      : modification.naReason
    : null;
  const withheldReason = withheld
    ? modification.withheldReason === undefined
      ? (existante?.withheldReason ?? null)
      : modification.withheldReason
    : null;

  const index = {
    interviewId: session.id,
    missionQuestionId: question.id,
    flagReview: drapeau(flagReview),
    notApplicable: drapeau(notApplicable),
    withheld: drapeau(withheld),
    horsParcours: drapeau(horsParcours),
  };
  const charge = {
    value,
    note: note === '' ? null : note,
    reviewReason: reviewReason === '' ? null : reviewReason,
    naReason: naReason === '' ? null : naReason,
    withheldReason,
    source: existante?.source ?? sourceDeSession(session.kind),
    questionTextSnapshot: existante?.questionTextSnapshot ?? question.texteSnapshot,
    revision: existante === null ? 1 : existante.revision + 1,
    clientCreatedAt: existante?.clientCreatedAt ?? instant,
  };

  await ecrireLocal({
    entite: 'answer',
    id,
    missionId: session.missionId,
    action: 'upsert',
    index,
    charge,
  });

  return {
    ...index,
    ...charge,
    id,
    missionId: session.missionId,
    clientUpdatedAt: instant,
    supprimeLe: null,
  };
}
