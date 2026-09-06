// =============================================================================
// DÉPÔT DES RÉPONSES — lecture seule, indexée (`LOT_L5.md` §2)
//
// Les compteurs de ce fichier sont ceux que `LOT_L5.md` §3.5 autorise
// explicitement sur l'appareil : « les compteurs de SES PROPRES lignes
// (complétude d'une session, à-revoir ouverts, alertes du cockpit) ». Ce qui
// AGRÈGE plusieurs auditeurs — triangulation §27.2, scoring §32.1 — reste au
// siège (invariant 6, « le terrain collecte, le siège produit »). La frontière
// passe ici, et pas plus loin.
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E12 (entretiens par
// interlocuteur, à-revoir).
// =============================================================================
import { contexteLocal } from '../contexte.js';
import type { Enveloppe } from '../enveloppe.js';
import { chargeAnswerSchema, type ChargeAnswer, type IndexAnswer } from '../formes.js';

/** Une réponse lisible : en-tête d'index + charge déchiffrée, à plat. */
export type ReponseLocale = IndexAnswer & ChargeAnswer;

/** L'avancement d'une session, calculé sur SES lignes (`LOT_L5.md` §3.5). */
export interface AvancementSession {
  readonly repondues: number;
  readonly aRevoir: number;
  readonly nonApplicables: number;
  readonly nonCommuniquees: number;
  readonly horsParcours: number;
}

async function dechiffrer(
  lignes: readonly (IndexAnswer & { charge: Enveloppe })[],
): Promise<ReponseLocale[]> {
  const { coffre } = contexteLocal();
  const reponses: ReponseLocale[] = [];
  for (const ligne of lignes) {
    const { charge, ...index } = ligne;
    reponses.push({ ...index, ...(await coffre.dechiffrer(charge, chargeAnswerSchema)) });
  }
  return reponses;
}

export const depotReponses = {
  /** Toutes les réponses d'une session, déchiffrées. */
  async parSession(interviewId: string): Promise<ReponseLocale[]> {
    const { base } = contexteLocal();
    const lignes = await base.answers
      .where('interviewId')
      .equals(interviewId)
      .filter((ligne) => ligne.supprimeLe === null)
      .toArray();
    return dechiffrer(lignes);
  },

  /**
   * LA réponse d'une question dans une session, ou `null`.
   *
   * S'appuie sur l'index composé `[interviewId+missionQuestionId]`, qui reflète la
   * contrainte UNIQUE du 04 (§32.6) : « UNE réponse par question et par session ;
   * toute re-réponse est une révision ». Le terrain n'émet JAMAIS d'op de
   * révision (05 §9.3, V2.9) — il ré-upserte, et c'est le serveur qui archive.
   *
   * **Une réponse SUPPRIMÉE (`supprimeLe` posé) n'est pas rendue**, exactement
   * comme `parSession` l'exclut déjà. L'incohérence inverse a existé ici, et le
   * testeur l'a attrapée : deux lectures du même dépôt qui ne voient pas le même
   * jeu de lignes, c'est un écran qui affiche une réponse que la liste d'à côté
   * ne montre plus. La ligne, elle, reste en base — invariant 7, `delete_soft`
   * n'efface rien, il marque. Le jour où un appelant devra voir les supprimées,
   * ce sera une option NOMMÉE, pas un oubli.
   */
  async parQuestion(interviewId: string, missionQuestionId: string): Promise<ReponseLocale | null> {
    const { base } = contexteLocal();
    const ligne = await base.answers
      .where('[interviewId+missionQuestionId]')
      .equals([interviewId, missionQuestionId])
      .filter((candidate) => candidate.supprimeLe === null)
      .first();
    if (ligne === undefined) return null;
    const [reponse] = await dechiffrer([ligne]);
    return reponse ?? null;
  },

  /**
   * L'avancement d'une session, SANS DÉCHIFFRER : tous les compteurs se lisent
   * sur l'en-tête en clair (§3.2). C'est ce qui rend le cockpit instantané sur
   * une mission à 5 000 réponses (05 §9.8) — et c'est aussi la meilleure preuve
   * que la liste fermée des champs en clair a été choisie pour de bonnes raisons.
   */
  async avancement(interviewId: string): Promise<AvancementSession> {
    const { base } = contexteLocal();
    let repondues = 0;
    let aRevoir = 0;
    let nonApplicables = 0;
    let nonCommuniquees = 0;
    let horsParcours = 0;
    await base.answers
      .where('interviewId')
      .equals(interviewId)
      .each((ligne) => {
        if (ligne.supprimeLe !== null) return;
        repondues += 1;
        if (ligne.flagReview === 1) aRevoir += 1;
        if (ligne.notApplicable === 1) nonApplicables += 1;
        if (ligne.withheld === 1) nonCommuniquees += 1;
        if (ligne.horsParcours === 1) horsParcours += 1;
      });
    return { repondues, aRevoir, nonApplicables, nonCommuniquees, horsParcours };
  },

  /** Les à-revoir encore ouverts d'une mission — l'alerte du cockpit (03 §34.2). */
  async aRevoirOuverts(missionId: string): Promise<number> {
    const { base } = contexteLocal();
    return base.answers
      .where('missionId')
      .equals(missionId)
      .filter((ligne) => ligne.supprimeLe === null && ligne.flagReview === 1)
      .count();
  },
};
