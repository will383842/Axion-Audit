// =============================================================================
// SERVICE DU SCORING BRANCHÉ — `calculerScoresDeMission`. Lot L8, incrément S1.
// 03 §32.1 · 05 §8.5 (`POST /v1/missions/:id/compute-scores`).
//
// ── CE QUE CE SERVICE DÉCIDE ────────────────────────────────────────────────
//   1. QUI PEUT CALCULER : l'administrateur, et le LEAD de la mission (décision de
//      spec du lot, `DECISIONS.md`). Un membre non lead reçoit 403 ; un non-membre
//      reçoit le même 404 qu'une mission inexistante (aucun oracle d'existence) ;
//   2. LA TRANSACTION : verrou de la mission → lecture de l'instantané → moteur PUR →
//      DELETE puis INSERT. Tout ou rien : si l'écriture échoue, l'ancien calcul reste ;
//      deux calculs simultanés se sérialisent sur le verrou ;
//   3. LA TRACE : une ligne `mission.compute_scores` APRÈS le commit (la porte du
//      journal écrit par `db`, ne lève jamais, et dater un calcul qui pouvait encore
//      échouer serait mentir). Elle nomme le calcul REMPLACÉ (invariant 7).
//
// ── CE QUI EST PERSISTÉ, ET OÙ ──────────────────────────────────────────────
//   · `block_scores` : le score d'ENTREPRISE par bloc (roll-up des racines, §32.1-4).
//     Les signaux du moteur — drapeaux rouges, divergences, anomalies, complétude
//     détaillée, poids total — sont conservés dans `details` : `unit_scores` n'a pas
//     de colonne `details` au 04, qu'on ne modifie pas ;
//   · `unit_scores` : une ligne par unité × bloc, lecture CONSOLIDÉE du sous-arbre
//     (une feuille a propre = consolidé). `answers_count` = réponses COTÉES.
//   NULL — jamais 0 — quand rien n'est cotable.
//
// ── INVARIANTS ──────────────────────────────────────────────────────────────
// 3 : aucun montant — ni lu, ni écrit, ni journalisé. 5 : `calculeLe` en UTC.
// 6 : le calcul se fait au siège. 7 : la réponse courante seule est lue ; le
//     remplacement d'un calcul est tracé.
// Traçabilité : E14 · E43.
// =============================================================================
import {
  AppError,
  type CalculScoresReponse,
  type ResultatScoringMission,
  type ScoreBloc,
} from '@axion/shared';
import { db } from '../db.js';
import { journaliserActivite, type ContexteJournal } from '../domaines/journal/service.js';
import {
  lireDernierCalcul,
  lireMissionPourCalcul,
  lireParametresScoring,
  lireQuestionsFigees,
  lireReponsesPourScoring,
  lireUnitesPourScoring,
  listerBlocsReferentiel,
  remplacerLesScores,
  verrouillerMission,
  type BlocReferentiel,
  type DemandeurDeCalcul,
  type LigneBlocAEcrire,
  type LigneUniteAEcrire,
} from './depot.js';
import type { EntreeScoring } from './entree.js';
import { calculerScoringMission } from './moteur.js';

/** Le même message que partout : il couvre aussi le non-membre (DECISIONS 2026-09-02). */
const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

const MESSAGE_LEAD_REQUIS =
  'Seuls un administrateur ou le responsable (lead) de la mission peuvent calculer les scores.';

const ROLE_LEAD = 'lead';

/** Un nombre du moteur → la chaîne d'un `NUMERIC` (jamais d'arrondi supplémentaire). */
function versNumeric(valeur: number | null): string | null {
  return valeur === null ? null : String(valeur);
}

/**
 * Traduit le résultat du moteur en lignes `block_scores` et `unit_scores`. PURE.
 *
 * Un signal est rangé dans le bloc de SA question (la divergence et l'anomalie ne
 * portent pas de code de bloc : on le retrouve par `missionQuestionId`). Une anomalie
 * sans question connue (réponse orpheline, unité inconnue…) n'appartient à aucun
 * bloc : elle est recopiée dans `anomaliesTransverses` de CHAQUE bloc, pour qu'aucune
 * ligne de bloc ne la taise.
 */
export function versLignesDeScores(
  resultat: ResultatScoringMission,
  blocsReferentiel: readonly BlocReferentiel[],
  blocParQuestion: ReadonlyMap<string, string>,
): { blocs: LigneBlocAEcrire[]; unites: LigneUniteAEcrire[] } {
  const idDeBloc = new Map(blocsReferentiel.map((bloc) => [bloc.code, bloc.id]));
  const blocDe = (missionQuestionId: string | null): string | null =>
    missionQuestionId === null ? null : (blocParQuestion.get(missionQuestionId) ?? null);
  const transverses = resultat.anomalies.filter((a) => blocDe(a.missionQuestionId) === null);

  const blocs: LigneBlocAEcrire[] = [];
  for (const noeud of resultat.mission.blocs) {
    const blockId = idDeBloc.get(noeud.blocCode);
    if (blockId === undefined) continue;
    blocs.push({
      blockId,
      score: versNumeric(noeud.score),
      completeness: versNumeric(noeud.completude.ratio),
      isIndicative: noeud.indicatif,
      details: detailsDeBloc(noeud, resultat, blocDe, transverses),
    });
  }

  const unites: LigneUniteAEcrire[] = [];
  for (const unite of resultat.unites) {
    for (const noeud of unite.consolide.blocs) {
      const blockId = idDeBloc.get(noeud.blocCode);
      if (blockId === undefined) continue;
      unites.push({
        orgUnitId: unite.orgUnitId,
        blockId,
        score: versNumeric(noeud.score),
        answersCount: noeud.completude.cotees,
        completeness: versNumeric(noeud.completude.ratio),
      });
    }
  }
  return { blocs, unites };
}

function detailsDeBloc(
  noeud: ScoreBloc,
  resultat: ResultatScoringMission,
  blocDe: (missionQuestionId: string | null) => string | null,
  transverses: ResultatScoringMission['anomalies'],
): Record<string, unknown> {
  return {
    completude: noeud.completude,
    poidsTotal: noeud.poidsTotal,
    drapeauxRouges: resultat.drapeauxRouges.filter((d) => d.blocCode === noeud.blocCode),
    divergences: resultat.divergences.filter((d) => blocDe(d.missionQuestionId) === noeud.blocCode),
    anomalies: resultat.anomalies.filter((a) => blocDe(a.missionQuestionId) === noeud.blocCode),
    anomaliesTransverses: transverses,
  };
}

/**
 * `POST /v1/missions/:id/compute-scores` — calcule, persiste, trace, rend le résultat.
 */
export async function calculerScoresDeMission(
  missionId: string,
  demandeur: DemandeurDeCalcul,
  contexte: ContexteJournal,
): Promise<CalculScoresReponse> {
  // ① Le droit, AVANT tout verrou : un refus ne doit ni attendre ni écrire.
  const mission = await lireMissionPourCalcul(db, missionId, demandeur);
  if (mission === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);
  if (!demandeur.estAdmin && mission.roleSurMission !== ROLE_LEAD) {
    throw new AppError('FORBIDDEN', MESSAGE_LEAD_REQUIS);
  }

  const { resultat, calculeLe, precedent } = await db.transaction(async (tx) => {
    // ② Le verrou d'abord : tout ce qui suit se lit sur un état que personne ne change.
    if (!(await verrouillerMission(tx, missionId))) {
      throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);
    }

    // Séquentiel : une transaction n'a qu'UNE connexion, rien à gagner à paralléliser.
    const referentiel = await listerBlocsReferentiel(tx);
    const parametres = await lireParametresScoring(tx);
    const unites = await lireUnitesPourScoring(tx, missionId);
    const questions = await lireQuestionsFigees(tx, missionId);
    const reponses = await lireReponsesPourScoring(tx, missionId);
    const dernier = await lireDernierCalcul(tx, missionId);

    // Les blocs du score d'entreprise : les blocs ACTIFS de la mission (dans l'ordre
    // d'affichage), ou à défaut ceux que le questionnaire figé touche.
    const actifs = new Set(mission.blocsActifs);
    const codesQuestions = new Set(questions.map((q) => q.blocCode));
    const codesRetenus = actifs.size > 0 ? actifs : codesQuestions;
    const blocs = referentiel.filter((bloc) => codesRetenus.has(bloc.code)).map((b) => b.code);

    const entree: EntreeScoring = {
      missionId,
      parametres,
      blocs,
      unites,
      questions,
      reponses,
    };
    const calcule = calculerScoringMission(entree);

    const blocParQuestion = new Map(questions.map((q) => [q.missionQuestionId, q.blocCode]));
    const lignes = versLignesDeScores(calcule, referentiel, blocParQuestion);

    // ③ DELETE puis INSERT, dans CETTE transaction.
    const instant = new Date();
    await remplacerLesScores(tx, missionId, instant, lignes.blocs, lignes.unites);
    return { resultat: calcule, calculeLe: instant, precedent: dernier };
  });

  // ④ La trace APRÈS le commit (voir l'en-tête). Elle ne porte que la date du calcul remplacé.
  await journaliserActivite(
    {
      action: 'mission.compute_scores',
      utilisateurId: demandeur.utilisateurId,
      missionId,
      calculPrecedentLe: precedent === null ? null : precedent.toISOString(),
    },
    contexte,
  );

  return { missionId, calculeLe: calculeLe.toISOString(), resultat };
}
