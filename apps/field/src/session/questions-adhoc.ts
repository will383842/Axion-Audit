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

/**
 * Les codes de TOUTES les options d'une question, garantis DISTINCTS.
 *
 * ── NON BLOQUANTE C4 (revue A29, 2026-09-03) ────────────────────────────────
 * `codeDOption` seule est une fonction du libellé : elle ne peut pas savoir ce
 * qu'ont produit les autres. Or elle écrase la ponctuation, donc « Oui ! » et
 * « Oui ? » rendaient tous deux `oui`. Deux options DISTINCTES à l'écran
 * devenaient indiscernables une fois écrites dans `answers.value` — et comme
 * `value` est la donnée d'audit, la confusion ne se voyait qu'au dépouillement,
 * quand plus personne ne peut dire laquelle l'interlocuteur avait choisie.
 * C'est l'invariant 7 : rien ne doit être silencieusement écrasé.
 *
 * ARBITRAGE (DECISIONS.md 2026-09-03) : on SUFFIXE, on ne refuse pas.
 * Refuser la saisie obligerait l'auditeur à reformuler une option en pleine
 * question, pour une raison technique qu'il ne peut pas comprendre — 03 §17.4
 * interdit ce genre d'obstacle. Dédupliquer en fusionnant les deux options
 * perdrait un choix que l'auditeur a délibérément écrit. Le suffixe `_2`, `_3`…
 * conserve les deux, reste lisible, et se relit sans documentation.
 */
export function codesDOptions(libelles: readonly string[]): string[] {
  const vus = new Map<string, number>();
  return libelles.map((libelle, rang) => {
    const base = codeDOption(libelle, rang);
    const dejaVu = vus.get(base);
    if (dejaVu === undefined) {
      vus.set(base, 1);
      return base;
    }
    // Le suffixe part de 2 : la première occurrence garde le code nu, ce qui
    // laisse intactes toutes les questions qui n'ont jamais eu de collision.
    const suivant = dejaVu + 1;
    vus.set(base, suivant);
    return `${base}_${String(suivant)}`;
  });
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
    ? codesDOptions(libelles).map((code, rang) => ({
        code,
        label: libelles[rang] ?? code,
        score: null,
      }))
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
