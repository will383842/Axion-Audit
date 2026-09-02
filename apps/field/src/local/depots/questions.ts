// =============================================================================
// DÉPÔT DU QUESTIONNAIRE FIGÉ — et la recherche HORS-PARCOURS (03 §25.4)
//
// ── POURQUOI CETTE RECHERCHE EST DANS LE SOCLE ──────────────────────────────
// 03 §25.4 : l'auditeur doit pouvoir sauter à n'importe quelle question du
// questionnaire de mission quand l'interlocuteur parle d'autre chose. Hors ligne,
// donc sans serveur, sur 240 questions, à la frappe. C'est le seul cas de tout le
// terrain qui justifie un index de TEXTE, et `LOT_L5.md` §3.2 l'autorise
// explicitement : « le texte figé des questions (`*_snapshot`) n'est pas une
// donnée personnelle : il est indexé en clair, c'est ce qui rend la recherche
// §25.4 possible hors ligne ».
//
// ── COMMENT, SANS DÉPENDANCE NOUVELLE ────────────────────────────────────────
// Index `multiEntry` sur `motsCles` (`base.ts`), alimenté par `jetonsDeRecherche`
// à l'écriture. La recherche découpe la saisie avec LA MÊME fonction — c'est ce
// qui fait que « périmètre » retrouve « perimetre » tapé sans accent sur une
// tablette. Le classement est le nombre de jetons trouvés, puis la position dans
// le questionnaire : simple, prévisible, et surtout explicable à l'auditeur.
//
// Traçabilité : E11 (questionnaire généré et figé par mission), E6 (hors ligne total).
// =============================================================================
import { contexteLocal } from '../contexte.js';
import type { Enveloppe } from '../enveloppe.js';
import {
  chargeMissionQuestionSchema,
  jetonsDeRecherche,
  type ChargeMissionQuestion,
  type IndexMissionQuestion,
} from '../formes.js';

/** Une question de mission lisible : en-tête d'index + charge déchiffrée. */
export type QuestionLocale = IndexMissionQuestion & ChargeMissionQuestion;

/** Un résultat de recherche : la question, et sur quoi elle a été trouvée. */
export interface ResultatRecherche {
  readonly question: QuestionLocale;
  readonly jetonsTrouves: number;
}

/** Au-delà, l'auditeur ne lit plus : il reformule. */
export const RESULTATS_RECHERCHE_MAX = 20;

async function dechiffrer(
  lignes: readonly (IndexMissionQuestion & { charge: Enveloppe })[],
): Promise<QuestionLocale[]> {
  const { coffre } = contexteLocal();
  const questions: QuestionLocale[] = [];
  for (const ligne of lignes) {
    const { charge, ...index } = ligne;
    questions.push({ ...index, ...(await coffre.dechiffrer(charge, chargeMissionQuestionSchema)) });
  }
  return questions;
}

export const depotQuestions = {
  /** Le questionnaire d'une mission, dans l'ordre de parcours (04 `position`). */
  async parMission(missionId: string): Promise<QuestionLocale[]> {
    const { base } = contexteLocal();
    const lignes = await base.missionQuestions
      .where('missionId')
      .equals(missionId)
      .filter((ligne) => ligne.supprimeLe === null)
      .sortBy('position');
    return dechiffrer(lignes);
  },

  async parId(id: string): Promise<QuestionLocale | null> {
    const { base } = contexteLocal();
    const ligne = await base.missionQuestions.get(id);
    if (ligne === undefined) return null;
    const [question] = await dechiffrer([ligne]);
    return question ?? null;
  },

  /**
   * Recherche plein texte dans le questionnaire FIGÉ (03 §25.4).
   *
   * Une saisie vide rend une liste vide, et non le questionnaire entier : la
   * palette de saut s'ouvre avant qu'on ait tapé, et déverser 240 lignes sous les
   * doigts de l'auditeur en pleine conversation serait pire que rien.
   */
  async rechercher(texte: string, missionId?: string): Promise<ResultatRecherche[]> {
    const { base } = contexteLocal();
    const jetons = jetonsDeRecherche(texte);
    if (jetons.length === 0) return [];

    const trouvailles = await base.missionQuestions
      .where('motsCles')
      .startsWithAnyOf(jetons)
      .distinct()
      .filter(
        (ligne) =>
          ligne.supprimeLe === null && (missionId === undefined || ligne.missionId === missionId),
      )
      .toArray();

    const compte = (ligne: IndexMissionQuestion): number =>
      jetons.filter((jeton) => ligne.motsCles.some((mot) => mot.startsWith(jeton))).length;

    const classees = [...trouvailles]
      .sort((a, b) => compte(b) - compte(a) || a.position - b.position)
      .slice(0, RESULTATS_RECHERCHE_MAX);

    const questions = await dechiffrer(classees);
    return questions.map((question, rang) => ({
      question,
      jetonsTrouves: compte(classees[rang] ?? question),
    }));
  },
};
