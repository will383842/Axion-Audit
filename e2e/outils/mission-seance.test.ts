// =============================================================================
// GARDE DE FIXTURE — AUCUNE ÉCHELLE SANS ANCRE QUI NE SOIT PAS AD HOC
//
// ── LE DÉFAUT QUE CE FICHIER EMPÊCHE DE REVENIR (2026-09-10) ────────────────
// `mission-seance.ts` posait `addedAdHoc: false` EN DUR pour les douze questions
// du questionnaire figé, dont la douzième : une `scale_1_5` avec
// `guidanceSnapshot: null`, écrite pour que la séance P-C puisse lire le repli
// « Aucune ancre de cotation n'est fournie pour cette question. » (V-5.5).
//
// La qualification d'A30 du 2026-09-10 a établi que CET ÉTAT EST IMPOSSIBLE pour
// une question de BANQUE : `ANCRES_ABSENTES`
// (`packages/shared/src/banque-questions.ts`) est un contrôle BLOQUANT
// d'admission sur toute `scale_1_5` sans ancre (§32.4). Aucun appareil réel ne
// peut recevoir une telle question par le chemin banque — la séance aurait donc
// observé un écran vert sur une donnée que la production refuse, et le critère
// de porte n'aurait été éprouvé nulle part.
//
// Le repli n'est PAS du code mort pour autant : il s'atteint par la question AD
// HOC du terrain (`DialogueQuestionAdHoc.tsx` propose `scale_1_5`, la consigne y
// est facultative, `questions-adhoc.ts` écrit `guidanceSnapshot: null` avec
// `addedAdHoc: true`). C'est le CHEMIN qui était faux, pas l'état.
//
// ── POURQUOI UNE GARDE, ET PAS SEULEMENT UNE CORRECTION ─────────────────────
// `e2e/hors-ligne-l5.e2e.ts` avait corrigé le même angle mort le 2026-09-07 —
// dans une AUTRE fixture, et sans garde partagée. Le défaut s'est donc refait,
// ailleurs, trois jours plus tard. Corriger sans garder, c'est reporter.
// Ce fichier ferme l'invariant : toute question ajoutée à la fixture devra soit
// porter ses ancres, soit s'assumer ad hoc.
//
// ── OÙ IL TOURNE, ET POURQUOI LÀ ────────────────────────────────────────────
// Projet vitest `unit` (`vitest.config.ts`, motif `e2e/**/*.test.ts`), donc dans
// `pnpm test:unit`, donc dans `pnpm verify:rapide`, donc au hook `pre-push` et
// dans la CI — SANS réseau, SANS conteneur, SANS staging. L'OUTIL de fabrication
// vise un serveur distant ; sa garde, elle, ne doit rien viser du tout : elle lit
// le contenu en clair que `contenuSeance()` produit, en mémoire.
//
// Aucun seuil n'est recopié : les ancres sont lues par `lireAncresDeCotation` et
// jugées contre `ANCRES_REQUISES`, tous deux importés du pack. Le jour où le
// §32.4 changera d'exigence, cette garde suivra sans qu'on la touche.
//
// 09 §5.6 : A26 n'écrit ni ne corrige aucune ligne de production. Ce fichier ne
// juge qu'une fixture.
//
// Traçabilité : E40 (ancres de cotation obligatoires) · E44 (ancres visibles) ·
// E38 (export de secours chiffré, création et restauration testées) ·
// E36 (exécutable par lots avec critères d’acceptation) · 07 porte P-C, V-5.5.
// =============================================================================
import { describe, expect, test } from 'vitest';

import {
  ANCRES_REQUISES,
  lireAncresDeCotation,
} from '../../packages/shared/src/banque-questions.js';
import {
  SCHEMA_CHARGE,
  type ChargeMissionQuestion,
  type IndexMissionQuestion,
} from '../../apps/field/src/local/formes.js';
import { contenuSeance, REPERES_SEANCE } from './mission-seance.js';

/**
 * Une question du contenu, relue COMME L'APPAREIL LA RELIRA.
 *
 * La charge passe par `SCHEMA_CHARGE.missionQuestions`, c'est-à-dire par le
 * schéma Zod de PRODUCTION que `Coffre.dechiffrer` applique : si la fixture
 * s'écartait de la forme attendue, l'échec tomberait ici plutôt que sur l'iPad.
 * L'index, lui, n'a pas de schéma Zod (c'est une interface de `formes.ts`) —
 * l'assertion de type est donc bornée, et suivie de vérifications réelles.
 */
interface QuestionRelue {
  readonly index: IndexMissionQuestion;
  readonly charge: ChargeMissionQuestion;
}

function questionsDuContenu(): readonly QuestionRelue[] {
  // `z.record` sur l'énumération COMPLÈTE des sept tables : la clé est donc
  // toujours présente, et un `?? []` ici serait une branche morte que le lint
  // refuse à juste titre.
  const lignes = contenuSeance().lignes.missionQuestions;
  expect(lignes.length, 'la fixture porte un questionnaire non vide').toBeGreaterThan(0);
  return lignes.map((ligne) => {
    const index = ligne as unknown as IndexMissionQuestion;
    expect(typeof index.answerType, `${index.id} déclare un type de réponse`).toBe('string');
    expect(typeof index.texteSnapshot, `${index.id} porte son texte figé`).toBe('string');
    return { index, charge: SCHEMA_CHARGE.missionQuestions.parse(ligne.charge) };
  });
}

/**
 * La question serait-elle REFUSÉE à l'admission en banque ?
 *
 * Exactement les deux cas que le §32.4 refuse sur une `scale_1_5` : aucune ancre
 * (`ANCRES_ABSENTES`), ou une ancre requise sans définition
 * (`ANCRES_INCOMPLETES`). Le calcul se fait avec le parseur du pack, jamais avec
 * une seconde lecture du même texte.
 */
function refuseeParLaBanque(charge: ChargeMissionQuestion): string | null {
  const lu = lireAncresDeCotation(charge.guidanceSnapshot);
  if (lu.ancres.length === 0) return 'aucune ancre (ANCRES_ABSENTES)';
  const niveaux = new Set(lu.ancres.map((ancre) => ancre.niveau));
  const manquants = ANCRES_REQUISES.filter((niveau) => !niveaux.has(niveau));
  return manquants.length > 0 ? `ancres manquantes : ${manquants.join(', ')}` : null;
}

describe('fixture de séance — les questions à échelle', () => {
  test('@critique une échelle sans ancre de banque est FORCÉMENT une question ad hoc', () => {
    // ── L'ASSERTION QUI PORTE TOUT ──────────────────────────────────────────
    // Elle ne dit pas « la question 12 est ad hoc » : elle dit qu'AUCUNE
    // question du contenu ne peut être à la fois `scale_1_5`, sans ancre
    // admissible, et présentée comme venant de la banque. Nommer la douzième
    // aurait laissé la treizième réintroduire le défaut en silence.
    for (const { index, charge } of questionsDuContenu()) {
      if (index.answerType !== 'scale_1_5') continue;
      const refus = refuseeParLaBanque(charge);
      if (refus === null) continue;
      expect(
        charge.addedAdHoc,
        `« ${index.texteSnapshot} » est une échelle que la banque REFUSERAIT (${refus}) : ` +
          'un appareil réel ne peut la recevoir que si elle a été créée au terrain. ' +
          'Ajoute ses ancres, ou déclare-la `addedAdHoc: true`.',
      ).toBe(true);
    }
  });

  test('@critique une question ad hoc porte TOUTE la charge que le terrain écrit', () => {
    // Le drapeau seul ne suffit pas : `creerQuestionAdHoc` écrit trois marques
    // ensemble. Les dissocier déplacerait l'état impossible d'un champ à
    // l'autre au lieu de le supprimer.
    const questions = questionsDuContenu();
    const idsDeBanque = new Set(
      questions.filter((q) => !q.charge.addedAdHoc).map((q) => q.charge.questionId),
    );
    for (const { index, charge } of questions) {
      if (!charge.addedAdHoc) continue;
      expect(
        charge.weightSnapshot,
        `« ${index.texteSnapshot} » est ad hoc : elle ne pèse pas dans le score (03 §25.3)`,
      ).toBe(0);
      expect(
        index.criticality,
        `« ${index.texteSnapshot} » est ad hoc : le terrain n'offre pas la criticité et écrit « informatif »`,
      ).toBe('informatif');
      expect(
        idsDeBanque.has(charge.questionId),
        `« ${index.texteSnapshot} » est ad hoc : elle ne cite aucune entrée de banque`,
      ).toBe(false);
    }
  });

  test("@critique la séance garde de quoi lire les DEUX états d'ancrage", () => {
    // Une garde que satisferait un questionnaire sans aucune échelle ne
    // garderait rien. Ces deux repères sont ceux que la fiche de porte fait
    // chercher à l'écran (V-5.1/V-5.2 pour l'ancrée, V-5.5 pour l'autre).
    const echelles = questionsDuContenu().filter((q) => q.index.answerType === 'scale_1_5');
    const ancrees = echelles.filter((q) => refuseeParLaBanque(q.charge) === null);
    const sansAncre = echelles.filter((q) => refuseeParLaBanque(q.charge) !== null);

    expect(
      ancrees.length,
      'au moins une échelle ancrée, sinon V-5.1 est injouable',
    ).toBeGreaterThan(0);
    expect(sansAncre.length, 'exactement une échelle sans ancre, et elle est ad hoc').toBe(1);
    expect(sansAncre[0]?.index.texteSnapshot).toBe(REPERES_SEANCE.questionEchelleSansAncre);
    expect(
      ancrees.some((q) => q.index.texteSnapshot === REPERES_SEANCE.questionEchelleAncree),
    ).toBe(true);
  });
});
