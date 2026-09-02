// =============================================================================
// QUESTION AD HOC — 03 M3.1, 11 §4 (V2.9)
//
// « UNE seule op `question_adhoc` ; les DEUX ids viennent du client ». Ici :
//   · `id`         = `mission_questions.id`  (UUID v7, généré ici)
//   · `questionId` = `questions.id`          (UUID v7, généré ici, dans la charge)
// Le serveur crée `questions` (origin `ad_hoc`) ET `mission_questions`
// ATOMIQUEMENT à partir de cette op — la dualité est la sienne, pas la nôtre
// (`ecriture.ts` : `question_adhoc` → table `missionQuestions`).
//
// Localement, la question ad hoc EST une ligne de questionnaire : elle a une
// position, des jetons de recherche (elle devient trouvable hors-parcours), un
// type de réponse — et `addedAdHoc: true`. Elle n'a ni barème ni poids : elle
// alimente le rapport, jamais le score (03 §32.1, `weight = 0`).
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu — questions ad hoc),
// E7 (remontée continue dès qu'il y a du réseau — contrat d'ops).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import type { TypeDeReponse } from '@axion/shared';
import { ecrireLocal } from '../local/ecriture.js';
import { jetonsDeRecherche } from '../local/formes.js';

export interface DemandeQuestionAdHoc {
  readonly missionId: string;
  readonly texte: string;
  readonly answerType: TypeDeReponse;
  /** Consigne facultative (et ancres, pour une échelle). */
  readonly guidance: string | null;
  /** Le bloc de la question courante — la question ad hoc s'y range. */
  readonly blockCode: string | null;
  /** La position à prendre : l'appelant connaît le questionnaire (fin de parcours). */
  readonly position: number;
  /** Libellés d'options, pour un choix unique ou multiple. Ignorés sinon. */
  readonly options?: readonly string[];
}

/** Un code d'option stable à partir de son libellé (« Oui, partiellement » → `oui_partiellement`). */
export function codeDOption(libelle: string, rang: number): string {
  const base = libelle
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base === '' ? `option_${String(rang + 1)}` : base;
}

/** Crée la question ad hoc et rend l'identifiant de la ligne de questionnaire. */
export async function creerQuestionAdHoc(demande: DemandeQuestionAdHoc): Promise<string> {
  const texte = demande.texte.trim();
  if (texte === '') throw new Error('Le texte de la question est nécessaire.');
  const guidance = demande.guidance?.trim() ?? '';

  const aDesOptions =
    demande.answerType === 'single_choice' || demande.answerType === 'multi_choice';
  const libelles = (demande.options ?? []).map((o) => o.trim()).filter((o) => o !== '');
  if (aDesOptions && libelles.length < 2) {
    throw new Error('Une question à choix a besoin d’au moins deux options.');
  }
  const optionsSnapshot = aDesOptions
    ? libelles.map((label, rang) => ({ code: codeDOption(label, rang), label, score: null }))
    : null;

  const id = uuidv7();
  const questionId = uuidv7();

  await ecrireLocal({
    entite: 'question_adhoc',
    id,
    missionId: demande.missionId,
    action: 'upsert',
    index: {
      position: demande.position,
      texteSnapshot: texte,
      motsCles: jetonsDeRecherche(texte),
      answerType: demande.answerType,
      criticality: 'informatif',
    },
    charge: {
      questionId,
      questionVersion: 1,
      guidanceSnapshot: guidance === '' ? null : guidance,
      optionsSnapshot,
      scoringSnapshot: null,
      weightSnapshot: 0,
      allowRangeSnapshot: false,
      addedAdHoc: true,
      blockCode: demande.blockCode,
    },
  });
  return id;
}
