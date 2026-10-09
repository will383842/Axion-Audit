// =============================================================================
// PROPRIÉTÉ DES ÉCRITURES DE SYNC — 05 §9.9, `LOT_L6.md` §5 PD4 (amendement A-1).
//
// « Toute écriture de sync sur `interviews`, `answers`, `attachments` n'est
// acceptée que si l'émetteur du push est le PROPRIÉTAIRE de la session
// (`interviews.conducted_by`) — sinon `forbidden`, rien n'est appliqué. »
//
// TROIS ENTITÉS, TROIS RÉSOLVEURS (PD4) :
//   · interview       → `interviews.conducted_by` de la LIGNE SERVEUR ;
//   · answer          → `answers.interview_id` → `interviews.conducted_by` ;
//   · attachment_meta → 04 S-3 : le rattachement quand il existe (session, ou
//                       réponse → sa session), SINON `attachments.created_by`.
// Et, par la décision du 2026-09-05 (archive DECISIONS, option 1), l'AUTEUR pour
// `org_unit_proposal` (`proposed_by`) et `question_adhoc` (`created_by`) — ces
// deux-là sont tranchés dans service.ts, sur la ligne qu'il lit déjà.
//
// TROIS VERDICTS, et la distinction compte :
//   · `proprietaire` — l'émetteur possède la ligne, DANS la mission du lot ;
//   · `autrui`       — elle existe et ne lui appartient pas, ou appartient à une
//                      AUTRE mission que celle annoncée par le lot → `forbidden` ;
//   · `inconnu`      — la ligne de référence n'existe pas (encore) → `error`,
//                      REJOUABLE (PD4 : un lot partiel n'est pas une intrusion).
//
// Une session sans auditeur (`conducted_by` NULL, migration 0014) n'appartient à
// PERSONNE au sens du push : verdict `autrui`. Le pack ne dit pas qui peut la
// « prendre » par le push ; la seule porte qui pose un auditeur est la
// réaffectation §34.4. Refus par défaut — doute rapporté.
//
// Le serveur ne croit JAMAIS l'auteur déclaré dans la charge (`conductedBy`,
// `createdBy`, `proposedBy`) : l'émetteur est l'identité AUTHENTIFIÉE du jeton.
// =============================================================================
import type { ExecuteurSql } from './depot.js';
import { lireReponse, lireSession } from './depot.js';

export type Propriete = 'proprietaire' | 'autrui' | 'inconnu';

/** Qui pousse, et sous quelle mission — l'émetteur vient du jeton, jamais du lot. */
export interface Emetteur {
  readonly utilisateurId: string;
  readonly missionId: string;
}

/** Résolveur `interview` : la ligne serveur fait foi. */
export async function proprieteDeSession(
  ex: ExecuteurSql,
  sessionId: string,
  emetteur: Emetteur,
): Promise<Propriete> {
  const session = await lireSession(ex, sessionId);
  if (session === null) return 'inconnu';
  if (session.missionId !== emetteur.missionId) return 'autrui';
  return session.conductedBy === emetteur.utilisateurId ? 'proprietaire' : 'autrui';
}

/** Résolveur `answer` : via la session de la réponse. */
export async function proprieteDeReponse(
  ex: ExecuteurSql,
  reponseId: string,
  emetteur: Emetteur,
): Promise<Propriete> {
  const reponse = await lireReponse(ex, reponseId);
  if (reponse === null) return 'inconnu';
  return proprieteDeSession(ex, reponse.interviewId, emetteur);
}

/** Le rattachement d'une pièce : session, réponse, les deux, ou aucun. */
export interface Rattachement {
  readonly interviewId: string | null;
  readonly answerId: string | null;
}

/**
 * Résolveur `attachment_meta` — 04 S-3. Quand le rattachement existe, il décide
 * SEUL ; quand il manque (note volante), c'est `createdBy`. Les deux liens posés
 * à la fois sont vérifiés tous les deux : l'un ne peut pas couvrir l'autre.
 */
export async function proprieteDePiece(
  ex: ExecuteurSql,
  rattachement: Rattachement,
  createdBy: string,
  emetteur: Emetteur,
): Promise<Propriete> {
  const verdicts: Propriete[] = [];
  if (rattachement.interviewId !== null) {
    verdicts.push(await proprieteDeSession(ex, rattachement.interviewId, emetteur));
  }
  if (rattachement.answerId !== null) {
    verdicts.push(await proprieteDeReponse(ex, rattachement.answerId, emetteur));
  }
  if (verdicts.length === 0) {
    return createdBy === emetteur.utilisateurId ? 'proprietaire' : 'autrui';
  }
  return combiner(verdicts);
}

/**
 * Plusieurs verdicts → un seul. `autrui` l'emporte sur tout (une intrusion n'est
 * jamais excusée par un lien absent), puis `inconnu`, puis `proprietaire`.
 */
export function combiner(verdicts: readonly Propriete[]): Propriete {
  if (verdicts.includes('autrui')) return 'autrui';
  if (verdicts.includes('inconnu')) return 'inconnu';
  return 'proprietaire';
}

/**
 * Un auteur déclaré par la charge n'est admis que s'il est ABSENT ou s'il désigne
 * l'émetteur lui-même. Toute autre valeur est une usurpation → `forbidden`.
 */
export function auteurDeclareAdmis(
  declare: string | null | undefined,
  emetteur: Emetteur,
): boolean {
  return declare === undefined || declare === null || declare === emetteur.utilisateurId;
}
