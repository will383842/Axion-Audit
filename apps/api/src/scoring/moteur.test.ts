// =============================================================================
// TESTS DE CONCEPTION DU MOTEUR — agrégation §32.1, complétude §27.4, roll-up,
// drapeaux rouges, et LES JEUX DE DONNÉES DE RÉFÉRENCE. Lot L8.
//
// ── TESTS DE CONCEPTION, ÉCRITS AVANT LE MOTEUR ────────────────────────────
// `CLAUDE.md` §4 étape 2 : le scoring est nommé parmi les parties critiques, les
// tests s'écrivent AVANT. Ils ne portent PAS `@critique` (décision du 2026-09-05,
// deux couches) : la couche d'acceptation revient à un testeur croisé.
//
// ── LE CRITÈRE QUI DÉCIDE DU LOT ───────────────────────────────────────────
// 07, ligne L8 : « jeux de données de référence figés → scores identiques ; UN
// DRAPEAU ROUGE N'EST JAMAIS MASQUÉ PAR LA MOYENNE ».
//
// La seconde moitié n'est pas testable par un seul exemple : c'est une propriété
// STRUCTURELLE, et elle est éprouvée ici de cinq façons indépendantes —
//   1. un score PARFAIT (5,00 / 5) qui porte quand même son drapeau (jeu 4) ;
//   2. un drapeau sur une question de POIDS 0, donc absente de tous les
//      dénominateurs — le cas où masquer serait le plus facile (jeu 4) ;
//   3. un drapeau au NIVEAU 4 d'un arbre de 150 unités, qui remonte intact
//      jusqu'à la racine sans être pondéré par les 119 autres services (jeu 2) ;
//   4. la MONOTONIE : on ajoute des réponses parfaites, le drapeau reste — quel
//      que soit leur nombre ;
//   5. le COMPTAGE : le nombre de drapeaux rendus par la mission est exactement
//      le nombre de réponses qui déclenchent, une par une. Aucun filtre, aucune
//      déduplication, aucun seuil ne s'intercale.
// Et une sixième, à l'envers : une question BLOQUANTE qu'un refus a rendue
// inévaluable est COMPTÉE comme telle (`QUESTION_BLOQUANTE_NON_EVALUEE`), parce
// que l'autre façon de masquer un drapeau rouge est de ne jamais l'évaluer.
// =============================================================================
import { describe, expect, it } from 'vitest';

import { resultatScoringMissionSchema } from '@axion/shared';
import type { ResultatUnite } from '@axion/shared';

import {
  ATTENDU_GC,
  ATTENDU_ROLLUP,
  ATTENDU_SCORE_PARFAIT,
  ATTENDU_TPE,
  GC,
  GC_DIMENSIONS,
  JEU_ROLLUP,
  JEU_SCORE_PARFAIT,
  JEU_TPE,
  PARAMETRES_SEED,
  PARFAIT,
  ROLLUP,
  TPE,
  jeuGc,
  uid,
} from '../../tests/aide/scoring-jeux-de-reference.js';
import { coterReponse } from './bareme.js';
import type { EntreeScoring, QuestionFigee, ReponseACoter } from './entree.js';
import { calculerScoringMission } from './moteur.js';

function unite(resultat: { unites: readonly ResultatUnite[] }, id: string): ResultatUnite {
  const trouvee = resultat.unites.find((u) => u.orgUnitId === id);
  if (trouvee === undefined) throw new Error(`Unité absente du résultat : ${id}`);
  return trouvee;
}

function bloc(noeud: { blocs: readonly { blocCode: string }[] }, code: string): {
  blocCode: string;
  score: number | null;
  poidsTotal: number;
  indicatif: boolean;
  completude: {
    posees: number;
    cotees: number;
    nonCommuniquees: number;
    sansObjet: number;
    nonRepondues: number;
    ratio: number | null;
    sousSeuil: boolean;
  };
} {
  const trouve = noeud.blocs.find((b) => b.blocCode === code);
  if (trouve === undefined) throw new Error(`Bloc absent : ${code}`);
  return trouve as never;
}

// =============================================================================
// JEU 1 — FIL-TPE-S : LES VALEURS SONT ÉCRITES, PAS RECALCULÉES
// =============================================================================
describe('jeu de référence 1 (FIL-TPE-S) — les scores écrits à la main, au chiffre près', () => {
  const resultat = calculerScoringMission(JEU_TPE);
  const u = unite(resultat, TPE.uniteId);

  it('bloc_1 vaut 3,2 — (1×5 + 2×4 + 1×3 + 1×0) / 5', () => {
    const b = bloc(u.propre, 'bloc_1');
    expect(b.score).toBe(ATTENDU_TPE.bloc1.score);
    expect(b.poidsTotal).toBe(ATTENDU_TPE.bloc1.poidsTotal);
  });

  it('bloc_2 vaut 3,0 — (3 + 3 + 5 + 1) / 4, la fourchette cotée sur sa borne basse', () => {
    const b = bloc(u.propre, 'bloc_2');
    expect(b.score).toBe(ATTENDU_TPE.bloc2.score);
    expect(b.poidsTotal).toBe(ATTENDU_TPE.bloc2.poidsTotal);
  });

  it('la complétude du bloc_1 : 5 posées, 4 cotées, 1 non répondue → 0,80', () => {
    const c = bloc(u.propre, 'bloc_1').completude;
    expect(c.posees).toBe(ATTENDU_TPE.bloc1.posees);
    expect(c.cotees).toBe(ATTENDU_TPE.bloc1.cotees);
    expect(c.nonRepondues).toBe(ATTENDU_TPE.bloc1.nonRepondues);
    expect(c.ratio).toBe(ATTENDU_TPE.bloc1.ratio);
  });

  it('la complétude du bloc_2 distingue le REFUS de l’ABSENCE et du SANS-OBJET (§27.4)', () => {
    const c = bloc(u.propre, 'bloc_2').completude;
    expect(c.posees).toBe(ATTENDU_TPE.bloc2.posees);
    expect(c.cotees).toBe(ATTENDU_TPE.bloc2.cotees);
    expect(c.nonCommuniquees).toBe(ATTENDU_TPE.bloc2.nonCommuniquees);
    expect(c.sansObjet).toBe(ATTENDU_TPE.bloc2.sansObjet);
    expect(c.nonRepondues).toBe(0);
    // Le sans-objet sort du dénominateur, le non-communiqué y reste : 4 / (6 − 1).
    expect(c.ratio).toBe(ATTENDU_TPE.bloc2.ratio);
  });

  it('l’unité vaut 3,11 — 28 / 9, les POIDS pondèrent, pas les blocs', () => {
    expect(u.propre.score).toBe(ATTENDU_TPE.unite.score);
    expect(u.consolide.score).toBe(ATTENDU_TPE.unite.score);
  });

  it('les quatre catégories PARTITIONNENT les questions posées — la somme est vérifiable', () => {
    const c = u.propre.completude;
    expect(c.posees).toBe(ATTENDU_TPE.unite.posees);
    expect(c.cotees + c.nonCommuniquees + c.sansObjet + c.nonRepondues).toBe(c.posees);
    expect(c.ratio).toBe(ATTENDU_TPE.unite.ratio);
    expect(c.sousSeuil).toBe(false);
  });

  it('la mission, sur une racine unique, rend exactement le score de l’unité', () => {
    expect(resultat.mission.score).toBe(ATTENDU_TPE.mission.score);
    expect(resultat.mission.completude.ratio).toBe(ATTENDU_TPE.mission.ratio);
    expect(resultat.mission.indicatif).toBe(false);
  });

  it('chaque réponse porte sa cotation, motif compris — 11 réponses, 11 cotations', () => {
    expect(resultat.cotations).toHaveLength(JEU_TPE.reponses.length);
    const parQuestion = new Map(resultat.cotations.map((c) => [c.missionQuestionId, c]));
    expect(parQuestion.get(TPE.q08)?.motifNonCotable).toBe('hors_bareme');
    expect(parQuestion.get(TPE.q10)?.motifNonCotable).toBe('non_communique');
    expect(parQuestion.get(TPE.q12)?.motifNonCotable).toBe('sans_objet');
    expect(parQuestion.get(TPE.q07)?.score).toBe(1);
  });

  it('la question BLOQUANTE rendue inévaluable par un refus est COMPTÉE, pas oubliée', () => {
    const bloquantes = resultat.anomalies.filter(
      (a) => a.code === 'QUESTION_BLOQUANTE_NON_EVALUEE',
    );
    expect(bloquantes).toHaveLength(1);
    expect(bloquantes[0]?.missionQuestionId).toBe(TPE.q10);
  });

  it('le drapeau rouge est une PROPOSITION traçable jusqu’à la réponse qui la fonde (§16.5)', () => {
    expect(resultat.drapeauxRouges).toHaveLength(ATTENDU_TPE.drapeauxRouges);
    const drapeau = resultat.drapeauxRouges[0];
    expect(drapeau?.reponseId).toBe(TPE.reponseDrapeauRouge);
    expect(drapeau?.missionQuestionId).toBe(TPE.q09);
    expect(drapeau?.entretienId).toBe(TPE.entretienId);
    expect(drapeau?.orgUnitId).toBe(TPE.uniteId);
    expect(drapeau?.criticite).toBe('bloquant');
    expect(drapeau?.declencheur).toBe('valeurs');
    expect(drapeau?.valeurDeclenchante).toBe('non');
    // « AUTO-PROPOSÉ en brouillon (validation humaine obligatoire) » — le moteur
    // n'écrit aucun finding, il en propose un.
    expect(drapeau?.statut).toBe('propose');
  });

  it('le résultat respecte le contrat partagé — `resultatScoringMissionSchema` le valide entièrement', () => {
    expect(() => resultatScoringMissionSchema.parse(resultat)).not.toThrow();
  });

  it('deux exécutions sur le même jeu rendent le MÊME résultat, à l’octet près', () => {
    expect(calculerScoringMission(JEU_TPE)).toStrictEqual(calculerScoringMission(JEU_TPE));
  });
});

// =============================================================================
// JEU 2 — FIL-GC-S : 150 UNITÉS, 4 NIVEAUX
// =============================================================================
describe('jeu de référence 2 (FIL-GC-S) — l’arbre canonique, 150 unités sur 4 niveaux', () => {
  const entree = jeuGc();
  const resultat = calculerScoringMission(entree);

  it('l’arbre entier est parcouru : 150 unités, profondeur maximale 3 (soit 4 niveaux)', () => {
    expect(resultat.unites).toHaveLength(GC_DIMENSIONS.unites);
    expect(Math.max(...resultat.unites.map((u) => u.niveau))).toBe(GC_DIMENSIONS.niveaux - 1);
    expect(unite(resultat, GC.racineId).niveau).toBe(0);
    expect(unite(resultat, GC.serviceId(0)).niveau).toBe(3);
  });

  it('un service au rang 3 vaut 2,25 — (1×4 + 2×0 + 1×5) / 4', () => {
    expect(unite(resultat, GC.serviceId(3)).propre.score).toBe(ATTENDU_GC.serviceRang3.score);
  });

  it('une direction ordinaire vaut 3,5 — 17,5 / 5, cinq services de poids égal', () => {
    expect(unite(resultat, GC.directionId(0)).consolide.score).toBe(
      ATTENDU_GC.directionOrdinaire.score,
    );
  });

  it('la direction qui porte le service dégradé vaut 3,3 — 16,5 / 5', () => {
    expect(unite(resultat, GC.directionDegradee).consolide.score).toBe(
      ATTENDU_GC.directionDegradee.score,
    );
    expect(bloc(unite(resultat, GC.directionDegradee).consolide, 'bloc_3').score).toBe(
      ATTENDU_GC.directionDegradee.bloc_3,
    );
  });

  it('la filiale qui la contient vaut 3,46 — (3,3 + 3,5 × 4) / 5', () => {
    expect(unite(resultat, GC.filialeDegradee).consolide.score).toBe(
      ATTENDU_GC.filialeDegradee.score,
    );
    expect(bloc(unite(resultat, GC.filialeDegradee).consolide, 'bloc_3').score).toBe(
      ATTENDU_GC.filialeDegradee.bloc_3,
    );
    expect(unite(resultat, GC.filialeId(0)).consolide.score).toBe(ATTENDU_GC.filialeOrdinaire.score);
  });

  it('la mission vaut 3,49 — 4190 / 1200, pondérée par les effectifs de filiale', () => {
    expect(resultat.mission.score).toBe(ATTENDU_GC.mission.score);
    expect(unite(resultat, GC.racineId).consolide.score).toBe(ATTENDU_GC.mission.score);
  });

  it('les trois blocs de la mission : 3 · 3 · 4,97 — et leur recomposition redonne 3,49', () => {
    expect(bloc(resultat.mission, 'bloc_1').score).toBe(ATTENDU_GC.blocsMission.bloc_1);
    expect(bloc(resultat.mission, 'bloc_2').score).toBe(ATTENDU_GC.blocsMission.bloc_2);
    expect(bloc(resultat.mission, 'bloc_3').score).toBe(ATTENDU_GC.blocsMission.bloc_3);
  });

  it('la complétude dit que les 30 unités NON interrogées n’ont pas été interrogées : 360 / 450 = 0,80', () => {
    expect(resultat.mission.completude.posees).toBe(GC_DIMENSIONS.unites * 3);
    expect(resultat.mission.completude.cotees).toBe(GC_DIMENSIONS.services * 3);
    expect(resultat.mission.completude.ratio).toBe(ATTENDU_GC.mission.ratio);
    expect(resultat.mission.indicatif).toBe(ATTENDU_GC.mission.indicatif);
  });

  it('une direction consolide 15 cotées sur 18 posées — elle-même comprise, et sans entretien', () => {
    const d = unite(resultat, GC.directionId(0));
    expect(d.consolide.completude.posees).toBe(18);
    expect(d.consolide.completude.cotees).toBe(15);
    expect(d.propre.completude.cotees).toBe(0);
    expect(d.propre.score).toBeNull();
    expect(d.propre.indicatif).toBe(true);
  });

  it('LE DRAPEAU DU NIVEAU 4 REMONTE INTACT — un service sur 120 ne se dilue pas', () => {
    expect(resultat.drapeauxRouges).toHaveLength(ATTENDU_GC.drapeauxRouges);
    const drapeau = resultat.drapeauxRouges[0];
    expect(drapeau?.orgUnitId).toBe(GC.serviceId(GC_DIMENSIONS.serviceDuDrapeauRouge));
    expect(drapeau?.declencheur).toBe('seuil');
    expect(drapeau?.score).toBe(1);
    // …et la mission affiche pourtant 3,49 : le score est bon, le point critique est là.
    expect(resultat.mission.score).toBe(ATTENDU_GC.mission.score);
  });

  it('le drapeau est présent sur CHAQUE ancêtre du service, et sur aucun autre sous-arbre', () => {
    expect(unite(resultat, GC.racineId).drapeauxRouges).toHaveLength(1);
    expect(unite(resultat, GC.filialeDegradee).drapeauxRouges).toHaveLength(1);
    expect(unite(resultat, GC.directionDegradee).drapeauxRouges).toHaveLength(1);
    expect(
      unite(resultat, GC.serviceId(GC_DIMENSIONS.serviceDuDrapeauRouge)).drapeauxRouges,
    ).toHaveLength(1);
    // Une filiale intacte n'hérite de rien : le canal remonte, il ne se diffuse pas.
    expect(unite(resultat, GC.filialeId(0)).drapeauxRouges).toHaveLength(0);
    expect(unite(resultat, GC.directionId(0)).drapeauxRouges).toHaveLength(0);
  });

  it('le résultat de 150 unités respecte le contrat partagé', () => {
    expect(() => resultatScoringMissionSchema.parse(resultat)).not.toThrow();
  });
});

describe('jeu de référence 2 à l’ÉCHELLE — 20 répliques, 7 200 réponses, LES MÊMES SCORES', () => {
  const entree = jeuGc(20);
  const debut = performance.now();
  const resultat = calculerScoringMission(entree);
  const duree = performance.now() - debut;

  it('7 200 réponses sur 150 unités : la volumétrie est bien celle annoncée', () => {
    expect(entree.reponses).toHaveLength(GC_DIMENSIONS.services * 3 * 20);
    expect(entree.questions).toHaveLength(60);
    expect(resultat.cotations).toHaveLength(entree.reponses.length);
  });

  it('les scores écrits pour 360 réponses valent encore pour 7 200 — c’est la même mission', () => {
    expect(resultat.mission.score).toBe(ATTENDU_GC.mission.score);
    expect(unite(resultat, GC.directionDegradee).consolide.score).toBe(
      ATTENDU_GC.directionDegradee.score,
    );
    expect(unite(resultat, GC.filialeDegradee).consolide.score).toBe(
      ATTENDU_GC.filialeDegradee.score,
    );
    expect(resultat.mission.completude.ratio).toBe(ATTENDU_GC.mission.ratio);
  });

  it('le drapeau unique reste unique : les 19 répliques ne sont pas bloquantes', () => {
    expect(resultat.drapeauxRouges).toHaveLength(1);
  });

  it('le calcul tient largement sous la seconde — le siège produit, et il produit vite', () => {
    expect(duree).toBeLessThan(2_000);
  });
});

// =============================================================================
// JEU 3 — LE ROLL-UP §32.1-4
// =============================================================================
describe('jeu de référence 3 — roll-up pondéré par `headcount`, NULL valant 1', () => {
  const resultat = calculerScoringMission(JEU_ROLLUP);

  it('chaque unité garde son score PROPRE, intact', () => {
    expect(unite(resultat, ROLLUP.parent).propre.score).toBe(ATTENDU_ROLLUP.parentPropre);
    expect(unite(resultat, ROLLUP.enfantAvecEffectif).propre.score).toBe(
      ATTENDU_ROLLUP.enfantAvecEffectif,
    );
    expect(unite(resultat, ROLLUP.enfantSansEffectif).propre.score).toBe(
      ATTENDU_ROLLUP.enfantSansEffectif,
    );
  });

  it('une feuille a `propre` et `consolide` identiques — il n’y a rien à consolider', () => {
    const feuille = unite(resultat, ROLLUP.enfantAvecEffectif);
    expect(feuille.consolide).toStrictEqual(feuille.propre);
  });

  it('le parent consolide 164 / 51 = 3,22 — ses propres réponses comprises, le NULL pesant 1', () => {
    expect(unite(resultat, ROLLUP.parent).consolide.score).toBe(ATTENDU_ROLLUP.parentConsolide);
    expect(resultat.mission.score).toBe(ATTENDU_ROLLUP.mission);
  });

  it('sans réponse propre, le parent n’est plus qu’une moyenne de ses enfants : 64 / 31 = 2,06', () => {
    const sansReponsePropre: EntreeScoring = {
      ...JEU_ROLLUP,
      reponses: JEU_ROLLUP.reponses.filter((r) => r.orgUnitId !== ROLLUP.parent),
    };
    const r = calculerScoringMission(sansReponsePropre);
    expect(unite(r, ROLLUP.parent).consolide.score).toBe(2.06);
  });
});

// =============================================================================
// JEU 4 — LE CRITÈRE : UN DRAPEAU ROUGE N'EST JAMAIS MASQUÉ PAR LA MOYENNE
// =============================================================================
describe('jeu de référence 4 — le score PARFAIT qui porte quand même son point critique', () => {
  const resultat = calculerScoringMission(JEU_SCORE_PARFAIT);

  it('le score est 5,00 sur 5, la complétude 100 % — rien ne signale un problème dans les chiffres', () => {
    expect(resultat.mission.score).toBe(ATTENDU_SCORE_PARFAIT.score);
    expect(resultat.mission.completude.posees).toBe(ATTENDU_SCORE_PARFAIT.posees);
    expect(resultat.mission.completude.cotees).toBe(ATTENDU_SCORE_PARFAIT.cotees);
    expect(resultat.mission.completude.ratio).toBe(ATTENDU_SCORE_PARFAIT.ratio);
    expect(resultat.mission.indicatif).toBe(false);
  });

  it('…et le drapeau rouge est là, porté par une question de POIDS 0, absente de tous les dénominateurs', () => {
    expect(resultat.drapeauxRouges).toHaveLength(ATTENDU_SCORE_PARFAIT.drapeauxRouges);
    expect(resultat.drapeauxRouges[0]?.missionQuestionId).toBe(PARFAIT.questionBloquante);
    expect(resultat.drapeauxRouges[0]?.reponseId).toBe(PARFAIT.reponseBloquante);
    // La preuve que le poids 0 l'a bien tenue hors du calcul : 10 questions posées, pas 11.
    expect(resultat.mission.completude.posees).toBe(10);
    expect(bloc(resultat.mission, 'bloc_1').poidsTotal).toBe(10);
  });

  it('MONOTONIE — on noie la mission sous des réponses parfaites, le drapeau ne bouge pas', () => {
    for (const bruit of [1, 20, 200]) {
      const questions: QuestionFigee[] = [...JEU_SCORE_PARFAIT.questions];
      const reponses: ReponseACoter[] = [...JEU_SCORE_PARFAIT.reponses];
      for (let i = 0; i < bruit; i += 1) {
        const idQuestion = uid(0x70000 + i);
        questions.push({
          missionQuestionId: idQuestion,
          blocCode: 'bloc_1',
          answerType: 'scale_1_5',
          weight: '10',
          scoring: { map: 'identity' },
          options: null,
          criticality: 'important',
        });
        reponses.push({
          id: uid(0x80000 + i),
          interviewId: uid(0x6002),
          missionQuestionId: idQuestion,
          orgUnitId: PARFAIT.uniteId,
          value: { type: 'scale_1_5', v: 5 },
          withheld: false,
          notApplicable: false,
        });
      }
      const r = calculerScoringMission({ ...JEU_SCORE_PARFAIT, questions, reponses });
      expect(r.mission.score).toBe(5);
      expect(r.drapeauxRouges).toHaveLength(1);
    }
  });
});

describe('LE COMPTAGE — le canal des drapeaux ne filtre rien, sur AUCUN des quatre jeux', () => {
  const jeux: readonly [string, EntreeScoring][] = [
    ['FIL-TPE-S', JEU_TPE],
    ['FIL-GC-S', jeuGc()],
    ['roll-up', JEU_ROLLUP],
    ['score parfait', JEU_SCORE_PARFAIT],
  ];

  it.each(jeux)(
    'sur %s, la mission rend EXACTEMENT autant de drapeaux que de réponses qui déclenchent',
    (_nom, entree) => {
      const parQuestion = new Map(entree.questions.map((q) => [q.missionQuestionId, q]));
      const uniteHorsPerimetre = new Set(
        entree.unites.filter((u) => !u.inScope).map((u) => u.id),
      );
      // Recomptage INDÉPENDANT du moteur : réponse par réponse, sans agrégation.
      const attendus = entree.reponses.filter((r) => {
        const question = parQuestion.get(r.missionQuestionId);
        if (question === undefined) return false;
        if (r.orgUnitId === null || uniteHorsPerimetre.has(r.orgUnitId)) return false;
        return coterReponse(question, r).declencheurDrapeau !== null;
      }).length;

      const resultat = calculerScoringMission(entree);
      expect(resultat.drapeauxRouges).toHaveLength(attendus);
    },
  );
});

// =============================================================================
// L'AGRÉGATION PAR QUESTION (§32.1-1) ET LA DIVERGENCE (§32.1-5)
// =============================================================================
describe('§32.1-1 — le score d’une question pour une unité est la MOYENNE de ses réponses valides', () => {
  const idQuestion = uid(0x9001);
  const idUnite = uid(0x9002);
  const idMission = uid(0x9000);

  function jeu(valeurs: readonly (number | null)[], options: { withheld?: boolean } = {}): EntreeScoring {
    return {
      missionId: idMission,
      parametres: PARAMETRES_SEED,
      blocs: ['bloc_1'],
      unites: [{ id: idUnite, parentId: null, headcount: 10, inScope: true }],
      questions: [
        {
          missionQuestionId: idQuestion,
          blocCode: 'bloc_1',
          answerType: 'scale_1_5',
          weight: '1',
          scoring: { map: 'identity' },
          options: null,
          criticality: 'important',
        },
      ],
      reponses: valeurs.map((v, i) => ({
        id: uid(0x9100 + i),
        interviewId: uid(0x9200 + i),
        missionQuestionId: idQuestion,
        orgUnitId: idUnite,
        value: v === null ? null : { type: 'scale_1_5', v },
        withheld: v === null && (options.withheld ?? false),
        notApplicable: false,
        groupeInterlocuteur: i === 0 ? 'direction' : 'terrain',
      })),
    };
  }

  it('deux sessions qui répondent 2 et 4 donnent 3 à la question, donc 3 au bloc', () => {
    expect(calculerScoringMission(jeu([2, 4])).mission.score).toBe(3);
  });

  it('une réponse NON COMMUNIQUÉE ne tire pas la moyenne vers le bas : elle en sort', () => {
    const r = calculerScoringMission(jeu([4, null], { withheld: true }));
    expect(r.mission.score).toBe(4);
    // La question reste COTÉE (une réponse valide suffit) — et le refus est visible.
    expect(r.mission.completude.cotees).toBe(1);
    expect(r.mission.completude.nonCommuniquees).toBe(0);
  });

  it('une divergence marquée est signalée : {1, 5} → écart-type 2 ≥ 1,5', () => {
    const r = calculerScoringMission(jeu([1, 5]));
    expect(r.divergences).toHaveLength(1);
    expect(r.divergences[0]?.type).toBe('ecart_type');
    expect(r.divergences[0]?.ecartType).toBe(2);
    expect(r.divergences[0]?.nbReponses).toBe(2);
    expect(r.divergences[0]?.scores).toStrictEqual([1, 5]);
  });

  it('l’écart-type est celui de la POPULATION observée : {1, 2, 4} vaut 1,2472 et ne déclenche pas', () => {
    const r = calculerScoringMission(jeu([1, 2, 4]));
    expect(r.divergences).toHaveLength(0);
  });

  it('n = 1 : pas de divergence, et surtout jamais de NaN (§32.1-5, V2.9)', () => {
    const r = calculerScoringMission(jeu([3]));
    expect(r.divergences).toHaveLength(0);
    expect(r.mission.score).toBe(3);
  });

  it('la lecture direction / terrain compare les moyennes par `group_code`, jamais par une liste codée', () => {
    const r = calculerScoringMission(jeu([1, 5]));
    expect(r.divergences[0]?.moyennesParGroupe).toStrictEqual({ direction: 1, terrain: 5 });
  });

  it('un oui/non contradictoire est une divergence d’une autre nature', () => {
    const idQ = uid(0xa001);
    const idU = uid(0xa002);
    const entree: EntreeScoring = {
      missionId: uid(0xa000),
      parametres: PARAMETRES_SEED,
      blocs: ['bloc_1'],
      unites: [{ id: idU, parentId: null, headcount: 4, inScope: true }],
      questions: [
        {
          missionQuestionId: idQ,
          blocCode: 'bloc_1',
          answerType: 'yes_no',
          weight: '1',
          scoring: { map: { oui: 5, non: 0 } },
          options: null,
          criticality: 'important',
        },
      ],
      reponses: ['oui', 'non'].map((v, i) => ({
        id: uid(0xa100 + i),
        interviewId: uid(0xa200 + i),
        missionQuestionId: idQ,
        orgUnitId: idU,
        value: { type: 'yes_no', v },
        withheld: false,
        notApplicable: false,
      })),
    };
    const r = calculerScoringMission(entree);
    expect(r.divergences.map((d) => d.type)).toContain('contradiction_oui_non');
    // La moyenne reste calculée : 2,5. Signaler n'est pas refuser de compter.
    expect(r.mission.score).toBe(2.5);
  });
});

// =============================================================================
// CE QUI EST ÉCARTÉ EST DIT — jamais tu (les anomalies)
// =============================================================================
describe('les anomalies — le moteur ne lève jamais, il rapporte ce qu’il a écarté', () => {
  const idMission = uid(0xb000);
  const idUnite = uid(0xb001);
  const idQuestion = uid(0xb002);

  const base: EntreeScoring = {
    missionId: idMission,
    parametres: PARAMETRES_SEED,
    blocs: ['bloc_1'],
    unites: [{ id: idUnite, parentId: null, headcount: 5, inScope: true }],
    questions: [
      {
        missionQuestionId: idQuestion,
        blocCode: 'bloc_1',
        answerType: 'scale_1_5',
        weight: '1',
        scoring: { map: 'identity' },
        options: null,
        criticality: 'important',
      },
    ],
    reponses: [],
  };

  function reponse(partiel: Partial<ReponseACoter>): ReponseACoter {
    return {
      id: uid(0xb100),
      interviewId: uid(0xb200),
      missionQuestionId: idQuestion,
      orgUnitId: idUnite,
      value: { type: 'scale_1_5', v: 3 },
      withheld: false,
      notApplicable: false,
      ...partiel,
    };
  }

  it('une réponse à une question absente du questionnaire figé est signalée, pas ignorée', () => {
    const r = calculerScoringMission({
      ...base,
      reponses: [reponse({ missionQuestionId: uid(0xbfff) })],
    });
    expect(r.anomalies.map((a) => a.code)).toContain('REPONSE_SANS_QUESTION_FIGEE');
    expect(r.mission.score).toBeNull();
  });

  it('une session sans unité ne se rattache à rien — et le dit', () => {
    const r = calculerScoringMission({ ...base, reponses: [reponse({ orgUnitId: null })] });
    expect(r.anomalies.map((a) => a.code)).toContain('REPONSE_SANS_UNITE');
  });

  it('une unité inconnue de l’arbre fourni est signalée', () => {
    const r = calculerScoringMission({ ...base, reponses: [reponse({ orgUnitId: uid(0xbeef) })] });
    expect(r.anomalies.map((a) => a.code)).toContain('REPONSE_UNITE_INCONNUE');
  });

  it('une unité HORS PÉRIMÈTRE conserve ses données et sort du scoring (§25.1) — en le disant', () => {
    const horsPerimetre = uid(0xb00f);
    const r = calculerScoringMission({
      ...base,
      unites: [
        ...base.unites,
        { id: horsPerimetre, parentId: null, headcount: 5, inScope: false },
      ],
      reponses: [reponse({ orgUnitId: horsPerimetre })],
    });
    expect(r.anomalies.map((a) => a.code)).toContain('REPONSE_HORS_PERIMETRE');
    expect(r.unites.map((u) => u.orgUnitId)).not.toContain(horsPerimetre);
    expect(r.mission.score).toBeNull();
  });

  it('un barème de forme inconnue est signalé une fois par question, et la question sort du calcul', () => {
    const r = calculerScoringMission({
      ...base,
      questions: [{ ...base.questions[0]!, scoring: { bareme: 'maison' } }],
      reponses: [reponse({})],
    });
    expect(r.anomalies.map((a) => a.code)).toContain('BAREME_INVALIDE');
    expect(r.mission.completude.posees).toBe(0);
  });

  it('une valeur inexploitable est signalée et ne devient jamais un zéro', () => {
    const r = calculerScoringMission({
      ...base,
      reponses: [reponse({ value: { type: 'scale_1_5', v: 42 } })],
    });
    expect(r.anomalies.map((a) => a.code)).toContain('VALEUR_INEXPLOITABLE');
    expect(r.mission.score).toBeNull();
    expect(r.mission.completude.nonRepondues).toBe(1);
  });
});

// =============================================================================
// LES BORDS — aucun NaN, aucune division fantôme
// =============================================================================
describe('les bords — une mission vide rend un résultat vide, jamais un NaN', () => {
  it('aucune unité, aucune question, aucune réponse : tout est nul et rien n’est faux', () => {
    const r = calculerScoringMission({
      missionId: uid(0xc000),
      parametres: PARAMETRES_SEED,
      blocs: ['bloc_1'],
      unites: [],
      questions: [],
      reponses: [],
    });
    expect(r.mission.score).toBeNull();
    expect(r.mission.completude.ratio).toBeNull();
    expect(r.mission.completude.posees).toBe(0);
    expect(r.mission.indicatif).toBe(false);
    expect(bloc(r.mission, 'bloc_1').score).toBeNull();
    expect(() => resultatScoringMissionSchema.parse(r)).not.toThrow();
  });

  it('un bloc déclaré sans aucune question figure au résultat, à zéro — le radar a besoin de ses axes', () => {
    const r = calculerScoringMission({ ...JEU_TPE, blocs: ['bloc_1', 'bloc_2', 'bloc_9'] });
    const vide = bloc(r.mission, 'bloc_9');
    expect(vide.score).toBeNull();
    expect(vide.completude.posees).toBe(0);
    expect(vide.completude.ratio).toBeNull();
    expect(vide.indicatif).toBe(false);
  });

  it('sous le seuil de complétude, le score EST calculé et marqué « indicatif » — jamais masqué', () => {
    const r = calculerScoringMission({
      ...JEU_TPE,
      parametres: { ...PARAMETRES_SEED, seuilCompletudeBloc: 0.9 },
    });
    expect(r.mission.score).toBe(ATTENDU_TPE.mission.score);
    expect(r.mission.indicatif).toBe(true);
    expect(r.mission.completude.sousSeuil).toBe(true);
  });

  it('le seuil vient de la DONNÉE : le déplacer change le verdict, pas le score', () => {
    const strict = calculerScoringMission({
      ...JEU_TPE,
      parametres: { ...PARAMETRES_SEED, seuilCompletudeBloc: 0.9 },
    });
    const large = calculerScoringMission({
      ...JEU_TPE,
      parametres: { ...PARAMETRES_SEED, seuilCompletudeBloc: 0.5 },
    });
    expect(strict.mission.score).toBe(large.mission.score);
    expect(strict.mission.indicatif).toBe(true);
    expect(large.mission.indicatif).toBe(false);
  });
});
