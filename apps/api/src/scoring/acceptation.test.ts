// =============================================================================
// ACCEPTATION DU MOTEUR DE SCORING — LA COUCHE CROISÉE. Lot L8.
//
// ── QUI ÉCRIT CE FICHIER, ET POURQUOI CE N'EST PAS LE MÊME QUE LE MOTEUR ────
// 09 §5.6 : « le code de test n'est JAMAIS écrit par l'agent qui a écrit le code
// testé ». `bareme.test.ts`, `bareme-formes.test.ts`, `moteur.test.ts` et
// `moteur-arbre.test.ts` sont les tests de CONCEPTION du producteur : ils disent
// que le moteur fait ce que son auteur a voulu. Ce fichier-ci dit autre chose, et
// c'est la seule question qui décide du lot (07, ligne L8) —
//   « jeux de données de référence figés → scores identiques ;
//     un drapeau rouge n'est JAMAIS masqué par la moyenne. »
// Il porte donc `@critique`, et lui seul dans ce dossier (décision du 2026-09-05,
// deux couches : la marque est réservée à la couche croisée).
//
// ── CE QU'IL AJOUTE, PLUTÔT QUE CE QU'IL REPREND ───────────────────────────
//  ① LES ATTENDUS SONT RETRANSCRITS ICI, EN LITTÉRAUX, une seconde fois et
//     indépendamment. Les tests de conception comparent le moteur à `ATTENDU_*`
//     du fichier de jeux ; ce fichier compare LES DEUX à ses propres nombres. Un
//     attendu qu'on « met à jour » pour faire passer un moteur qui a bougé fait
//     alors rougir cette couche-ci, qui n'a pas été mise à jour. C'est la seule
//     façon de rendre un jeu de référence réellement FIGÉ : deux transcriptions
//     indépendantes de la même arithmétique §32.1, et personne pour les aligner.
//  ② LA SEPTIÈME FAÇON DE MASQUER. Le producteur prouve sa propriété de six
//     façons (score parfait, poids 0, profondeur 4, monotonie, comptage, question
//     bloquante non évaluée). Le travail de l'agent croisé n'est pas de les
//     recroire : c'est de chercher les façons qu'il n'a pas vues. Les six angles
//     ci-dessous sont ceux qui ont été trouvés et qui TIENNENT ; ceux qui ne
//     tiennent pas sont remontés au producteur, non corrigés ici (09 §5.6).
//  ③ LES ASSERTIONS DU BALAYAGE D'ÉTANCHÉITÉ. `apps/api/tests/aide/
//     etancheite-scoring.ts` est un moteur sans `expect`, livré exprès sans ses
//     assertions — elles reviennent au testeur croisé, exactement comme au L2.
//     Tant qu'elles n'existent pas, le garde-fou est un garde-fou DÉSARMÉ : vert
//     parce que personne ne l'exécute. Ce fichier l'arme.
//
// ── ANTI-VACUITÉ ────────────────────────────────────────────────────────────
// Un test qui passe parce que sa condition n'a jamais été atteinte ne prouve
// rien. Chaque garde textuel ci-dessous est donc doublé d'une épreuve de
// SENSIBILITÉ : on redemande la même mesure avec une sonde qui doit trouver, et
// on vérifie qu'elle trouve. Un balayage qui ne trouve jamais rien, même quand on
// lui demande de chercher quelque chose, ne cherche rien.
//
// Traçabilité : E37 (scoring intégralement spécifié : barème par type de réponse,
// agrégation, complétude, divergence, drapeaux rouges) · E14 (consolidation :
// réponses côte à côte, divergences direction/terrain, scoring maturité, radar) ·
// E36 (exécutable par lots avec critères — la ligne L8 du fichier 07 EST le
// critère que ce fichier éprouve).
// Sections : 03 §32.1, §27.4, §25.1 · 07 ligne L8 · 09 §5.6, §5.7.
// =============================================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resultatScoringMissionSchema,
  CHAMPS_FINANCIERS_SURVEILLES,
  CODES_ANOMALIE_SCORING,
  TABLE_FINANCIERE,
} from '@axion/shared';
import type { NoeudScore, ResultatScoringMission, ResultatUnite } from '@axion/shared';

import {
  balayerScoring,
  sondesScoring,
  ARCHIVE_REVISIONS,
  DOSSIER_SCORING,
} from '../../tests/aide/etancheite-scoring.js';
import { RACINE, retirerCommentaires } from '../../tests/aide/etancheite-sources.js';
import {
  ATTENDU_GC,
  ATTENDU_ROLLUP,
  ATTENDU_SCORE_PARFAIT,
  ATTENDU_TPE,
  GC,
  JEU_ROLLUP,
  JEU_SCORE_PARFAIT,
  JEU_TPE,
  PARAMETRES_SEED,
  TPE,
  jeuGc,
} from '../../tests/aide/scoring-jeux-de-reference.js';
import type { EntreeScoring, QuestionFigee, ReponseACoter } from './entree.js';
import { calculerScoringMission } from './moteur.js';

// -----------------------------------------------------------------------------
// LES ATTENDUS, RETRANSCRITS À LA MAIN — SECONDE SOURCE, INDÉPENDANTE
// -----------------------------------------------------------------------------

/**
 * Les nombres du §32.1, reposés depuis les formules et NON relus depuis le
 * fichier de jeux. Chaque ligne porte sa fraction : elle se refait au tableur,
 * comme le §35.3 l'exige du repli manuel.
 */
const ACCEPTATION = {
  /** FIL-TPE, unité : (5 + 8 + 3 + 0 + 3 + 3 + 5 + 1) / 9 = 28 / 9. */
  tpeUnite: 3.11,
  /** FIL-TPE, bloc_1 : (1×5 + 2×4 + 1×3 + 1×0) / 5 = 16 / 5. */
  tpeBloc1: 3.2,
  /** FIL-TPE, bloc_2 : (3 + 3 + 5 + 1) / 4 = 12 / 4. */
  tpeBloc2: 3,
  /** FIL-TPE, complétude : 8 cotées / (11 posées − 1 sans objet) = 8 / 10. */
  tpeRatio: 0.8,
  /** FIL-GC, mission : (2625 + 865 + 700) / 1200 = 4190 / 1200. */
  gcMission: 3.49,
  /** FIL-GC, bloc_3 au niveau groupe : 5960 / 1200. */
  gcBloc3: 4.97,
  /** FIL-GC, direction n° 15 (celle du service dégradé) : 16,5 / 5. */
  gcDirectionDegradee: 3.3,
  /** FIL-GC, filiale F4 : (3,3 + 3,5 × 4) / 5 = 17,3 / 5. */
  gcFilialeDegradee: 3.46,
  /** FIL-GC, complétude : 360 cotées / 450 posées. */
  gcRatio: 0.8,
  /** Roll-up : (20×5 + 30×2 + 1×4) / 51 = 164 / 51. */
  rollupParent: 3.22,
  /** Le score parfait qui porte quand même son point critique. */
  parfait: 5,
} as const;

/** Les fractions du §32.1, posées telles quelles — aucune fonction du moteur. */
const FRACTIONS: readonly (readonly [string, number, number])[] = [
  ['FIL-TPE unité 28 / 9', 28 / 9, ACCEPTATION.tpeUnite],
  ['FIL-TPE bloc_1 16 / 5', 16 / 5, ACCEPTATION.tpeBloc1],
  ['FIL-TPE bloc_2 12 / 4', 12 / 4, ACCEPTATION.tpeBloc2],
  ['FIL-GC mission 4190 / 1200', 4190 / 1200, ACCEPTATION.gcMission],
  ['FIL-GC bloc_3 5960 / 1200', 5960 / 1200, ACCEPTATION.gcBloc3],
  ['FIL-GC direction 16,5 / 5', 16.5 / 5, ACCEPTATION.gcDirectionDegradee],
  ['FIL-GC filiale 17,3 / 5', 17.3 / 5, ACCEPTATION.gcFilialeDegradee],
  ['roll-up 164 / 51', 164 / 51, ACCEPTATION.rollupParent],
];

function uniteDe(resultat: ResultatScoringMission, id: string): ResultatUnite {
  const trouvee = resultat.unites.find((candidate) => candidate.orgUnitId === id);
  if (trouvee === undefined) throw new Error(`Unité absente du résultat : ${id}`);
  return trouvee;
}

function scoreDeBloc(noeud: NoeudScore, code: string): number {
  const trouve = noeud.blocs.find((candidat) => candidat.blocCode === code);
  if (trouve === undefined) throw new Error(`Bloc absent : ${code}`);
  if (trouve.score === null) throw new Error(`Bloc sans score : ${code}`);
  return trouve.score;
}

// -----------------------------------------------------------------------------
// UN ATELIER DE MISSIONS MINUSCULES — pour attaquer un point à la fois
// -----------------------------------------------------------------------------

const ID = (n: number): string => `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const UNITE_A = ID(0xa01);
const UNITE_B = ID(0xa02);

/** Un oui/non BLOQUANT dont « non » lève un drapeau — le cas normé du §32.1-6. */
function questionBloquante(id: string, blocCode = 'bloc_1'): QuestionFigee {
  return {
    missionQuestionId: id,
    blocCode,
    answerType: 'yes_no',
    weight: '1',
    scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['non'] } },
    options: null,
    criticality: 'bloquant',
  };
}

function questionEchelle(id: string, blocCode = 'bloc_1'): QuestionFigee {
  return {
    missionQuestionId: id,
    blocCode,
    answerType: 'scale_1_5',
    weight: '1',
    scoring: { map: 'identity' },
    options: null,
    criticality: 'important',
  };
}

interface FabriqueReponse {
  readonly id: string;
  readonly question: string;
  readonly unite: string | null;
  readonly value?: unknown;
  readonly withheld?: boolean;
  readonly notApplicable?: boolean;
}

function reponse(fabrique: FabriqueReponse): ReponseACoter {
  return {
    id: fabrique.id,
    interviewId: ID(0xb00 + (Number.parseInt(fabrique.id.slice(-4), 16) % 0xff)),
    missionQuestionId: fabrique.question,
    orgUnitId: fabrique.unite,
    value: fabrique.value ?? null,
    withheld: fabrique.withheld ?? false,
    notApplicable: fabrique.notApplicable ?? false,
  };
}

function mission(
  n: number,
  unites: EntreeScoring['unites'],
  questions: readonly QuestionFigee[],
  reponses: readonly ReponseACoter[],
  blocs: readonly string[] = ['bloc_1'],
): EntreeScoring {
  return {
    missionId: ID(0xf00 + n),
    parametres: PARAMETRES_SEED,
    blocs,
    unites,
    questions,
    reponses,
  };
}

const RACINE_SEULE: EntreeScoring['unites'] = [
  { id: UNITE_A, parentId: null, headcount: 10, inScope: true },
];

// =============================================================================
// ① LES JEUX FIGÉS — LES SCORES SONT CEUX QUI SONT ÉCRITS, PAS CEUX QU'ON RECALCULE
// =============================================================================
describe('les jeux de référence figés — deux transcriptions indépendantes du §32.1', () => {
  const tpe = calculerScoringMission(JEU_TPE);
  const gc = calculerScoringMission(jeuGc());
  const rollup = calculerScoringMission(JEU_ROLLUP);
  const parfait = calculerScoringMission(JEU_SCORE_PARFAIT);

  it('@critique le moteur rend les nombres RETRANSCRITS ICI — 3,11 · 3,49 · 3,22 · 5,00', () => {
    expect(uniteDe(tpe, TPE.uniteId).propre.score).toBe(ACCEPTATION.tpeUnite);
    expect(tpe.mission.score).toBe(ACCEPTATION.tpeUnite);
    expect(scoreDeBloc(uniteDe(tpe, TPE.uniteId).propre, 'bloc_1')).toBe(ACCEPTATION.tpeBloc1);
    expect(scoreDeBloc(uniteDe(tpe, TPE.uniteId).propre, 'bloc_2')).toBe(ACCEPTATION.tpeBloc2);
    expect(tpe.mission.completude.ratio).toBe(ACCEPTATION.tpeRatio);

    expect(gc.mission.score).toBe(ACCEPTATION.gcMission);
    expect(scoreDeBloc(gc.mission, 'bloc_3')).toBe(ACCEPTATION.gcBloc3);
    expect(uniteDe(gc, GC.directionDegradee).consolide.score).toBe(ACCEPTATION.gcDirectionDegradee);
    expect(uniteDe(gc, GC.filialeDegradee).consolide.score).toBe(ACCEPTATION.gcFilialeDegradee);
    expect(gc.mission.completude.ratio).toBe(ACCEPTATION.gcRatio);

    expect(rollup.mission.score).toBe(ACCEPTATION.rollupParent);
    expect(parfait.mission.score).toBe(ACCEPTATION.parfait);
  });

  it('@critique les attendus du fichier de jeux sont LES MÊMES — un attendu ne se « met pas à jour »', () => {
    // Si quelqu'un aligne `ATTENDU_*` sur un moteur qui a bougé, les tests de
    // conception restent verts et CELUI-CI rougit. C'est tout l'objet de la
    // seconde transcription : personne n'a le droit de déplacer les deux.
    expect(ATTENDU_TPE.unite.score).toBe(ACCEPTATION.tpeUnite);
    expect(ATTENDU_TPE.bloc1.score).toBe(ACCEPTATION.tpeBloc1);
    expect(ATTENDU_TPE.bloc2.score).toBe(ACCEPTATION.tpeBloc2);
    expect(ATTENDU_GC.mission.score).toBe(ACCEPTATION.gcMission);
    expect(ATTENDU_GC.blocsMission.bloc_3).toBe(ACCEPTATION.gcBloc3);
    expect(ATTENDU_GC.directionDegradee.score).toBe(ACCEPTATION.gcDirectionDegradee);
    expect(ATTENDU_GC.filialeDegradee.score).toBe(ACCEPTATION.gcFilialeDegradee);
    expect(ATTENDU_ROLLUP.parentConsolide).toBe(ACCEPTATION.rollupParent);
    expect(ATTENDU_SCORE_PARFAIT.score).toBe(ACCEPTATION.parfait);
  });

  it('@critique chaque attendu EST l’arrondi de sa fraction — l’arithmétique posée à la main', () => {
    // Aucune fonction du moteur n'intervient ici : `Math.round` et rien d'autre.
    // Ce contrôle attrape la faute qu'aucun test de comportement n'attrape — un
    // attendu recopié de travers, que le moteur confirmerait s'il portait la
    // même faute.
    for (const [nom, fraction, attendu] of FRACTIONS) {
      expect(`${nom} → ${String(Math.round(fraction * 100) / 100)}`).toBe(
        `${nom} → ${String(attendu)}`,
      );
    }
  });

  it('@critique AUCUN attendu n’est un recalcul : le fichier de jeux ignore le calcul', () => {
    const chemin = join(RACINE, 'apps', 'api', 'tests', 'aide', 'scoring-jeux-de-reference.ts');
    const source = readFileSync(chemin, 'utf8');
    const specificateurs = [...source.matchAll(/from '([^']+)'/g)].map((trouve) => trouve[1]);

    // La seule dépendance autorisée est le fichier de TYPES. Importer `bareme`,
    // `agregation` ou `moteur` permettrait à un attendu d'être produit par ce
    // qu'il prétend vérifier — un test qui reste vert quand la formule change.
    expect(specificateurs).toStrictEqual(['../../src/scoring/entree.js']);
    expect(source).not.toContain("from 'vitest'");

    // Et les nombres sont bien des LITTÉRAUX dans le fichier, pas des appels.
    for (const litteral of ['score: 3.11', 'score: 3.49', 'parentConsolide: 3.22', 'score: 5,']) {
      expect(source).toContain(litteral);
    }
  });

  it('@critique la relecture de la même entrée rend le même résultat — et il respecte le contrat', () => {
    for (const resultat of [tpe, gc, rollup, parfait]) {
      expect(() => resultatScoringMissionSchema.parse(resultat)).not.toThrow();
    }
    expect(calculerScoringMission(JEU_TPE)).toStrictEqual(tpe);
    expect(calculerScoringMission(jeuGc())).toStrictEqual(gc);
  });
});

// =============================================================================
// ② LA SEPTIÈME FAÇON DE MASQUER — CE QUE LA COUCHE DE CONCEPTION N'A PAS VISÉ
// =============================================================================
describe('un drapeau rouge n’est jamais masqué — les angles que la conception ne vise pas', () => {
  it('@critique LA MOYENNE INTRA-QUESTION (§32.1-1) : « non » + « oui » font 2,5, le drapeau reste', () => {
    // LA SEPTIÈME FAÇON, et la seule moyenne qui touche DIRECTEMENT la réponse au
    // rouge. Les six preuves de conception attaquent les moyennes de bloc, d'unité
    // et de roll-up ; celle du §32.1-1 — la moyenne des réponses d'une même
    // question dans une même unité — est en AMONT de toutes les autres. Deux
    // entretiens dans le même service, l'un dit « non », l'autre dit « oui » : la
    // question vaut 2,5, aucun chiffre ne signale plus rien, et c'est là qu'un
    // drapeau se perdrait sans que personne ne le voie.
    const q = questionBloquante(ID(0xc01));
    const resultat = calculerScoringMission(
      mission(
        1,
        RACINE_SEULE,
        [q],
        [
          reponse({
            id: ID(0xc11),
            question: q.missionQuestionId,
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'non' },
          }),
          reponse({
            id: ID(0xc12),
            question: q.missionQuestionId,
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'oui' },
          }),
        ],
      ),
    );

    // La moyenne fait bien son travail — la condition est ATTEINTE, le test n'est
    // pas vide : sans le drapeau, ce 2,5 serait tout ce que la mission rendrait.
    expect(resultat.mission.score).toBe(2.5);
    expect(resultat.drapeauxRouges).toHaveLength(1);
    expect(resultat.drapeauxRouges[0]?.reponseId).toBe(ID(0xc11));
    expect(resultat.drapeauxRouges[0]?.score).toBe(0);
    // Et le désaccord lui-même est signalé (§32.1-5, contradiction oui/non).
    expect(resultat.divergences.map((d) => d.type)).toStrictEqual(['contradiction_oui_non']);
  });

  it('@critique DEUX drapeaux sur la MÊME question et la MÊME unité font DEUX propositions', () => {
    // Une déduplication « par question » serait la façon la plus présentable de
    // perdre un drapeau : elle ne ressemble pas à un filtre. §16.5 exige la chaîne
    // jusqu'à la réponse qui fonde le finding — deux réponses, deux chaînes.
    const q = questionBloquante(ID(0xc02));
    const resultat = calculerScoringMission(
      mission(
        2,
        RACINE_SEULE,
        [q],
        [
          reponse({
            id: ID(0xc21),
            question: q.missionQuestionId,
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'non' },
          }),
          reponse({
            id: ID(0xc22),
            question: q.missionQuestionId,
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'non' },
          }),
        ],
      ),
    );

    expect(resultat.drapeauxRouges).toHaveLength(2);
    expect(resultat.drapeauxRouges.map((d) => d.reponseId).sort()).toStrictEqual(
      [ID(0xc21), ID(0xc22)].sort(),
    );
    expect(uniteDe(resultat, UNITE_A).drapeauxRouges).toHaveLength(2);
  });

  it('@critique un drapeau porté par la RACINE elle-même remonte à la mission, et ne redescend pas', () => {
    // L'union remonte : c'est écrit. Reste à vérifier qu'elle ne descend pas —
    // un drapeau qui apparaîtrait chez les enfants ferait 120 alertes pour un
    // service, et 120 alertes valent zéro alerte.
    const q = questionBloquante(ID(0xc03));
    const resultat = calculerScoringMission(
      mission(
        3,
        [
          { id: UNITE_A, parentId: null, headcount: 100, inScope: true },
          { id: UNITE_B, parentId: UNITE_A, headcount: 1, inScope: true },
        ],
        [q],
        [
          reponse({
            id: ID(0xc31),
            question: q.missionQuestionId,
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'non' },
          }),
          reponse({
            id: ID(0xc32),
            question: q.missionQuestionId,
            unite: UNITE_B,
            value: { type: 'yes_no', v: 'oui' },
          }),
        ],
      ),
    );

    expect(resultat.drapeauxRouges).toHaveLength(1);
    expect(uniteDe(resultat, UNITE_A).drapeauxRouges).toHaveLength(1);
    expect(uniteDe(resultat, UNITE_B).drapeauxRouges).toHaveLength(0);
    // (100 × 0 + 1 × 5) / 101 = 5 / 101 = 0,0495… → 0,05 : le seul enfant, minuscule,
    // ne dilue pas le drapeau, et la pondération par `headcount` reste celle du §32.1-4.
    expect(resultat.mission.score).toBe(0.05);
  });

  it('@critique le porteur SEUL ENFANT — un roll-up à un terme unique ne perd rien', () => {
    // `moyennePonderee` court-circuite quand il ne reste qu'un terme. Ce chemin
    // court est celui d'un service porteur seul sous sa direction : le raccourci
    // ne doit pas court-circuiter le drapeau avec le score.
    const q = questionBloquante(ID(0xc04));
    const resultat = calculerScoringMission(
      mission(
        4,
        [
          { id: UNITE_A, parentId: null, headcount: 50, inScope: true },
          { id: UNITE_B, parentId: UNITE_A, headcount: 7, inScope: true },
        ],
        [q],
        // La direction n'a AUCUNE réponse propre : son consolidé est celui de son
        // unique enfant, à l'identique — et le drapeau vient avec.
        [
          reponse({
            id: ID(0xc41),
            question: q.missionQuestionId,
            unite: UNITE_B,
            value: { type: 'yes_no', v: 'non' },
          }),
        ],
      ),
    );

    expect(uniteDe(resultat, UNITE_A).propre.score).toBeNull();
    expect(uniteDe(resultat, UNITE_A).consolide.score).toBe(0);
    expect(uniteDe(resultat, UNITE_A).drapeauxRouges).toHaveLength(1);
    expect(resultat.mission.score).toBe(0);
    expect(resultat.drapeauxRouges).toHaveLength(1);
  });

  it('@critique une mission à UNE SEULE question, bloquante et REFUSÉE, ne rend pas 0 — elle rend rien, et le dit', () => {
    // Le cas extrême du §27.4 : il ne reste plus rien à moyenner. Trois pièges
    // s'ouvrent d'un coup — rendre 0 (une pénalité que le pack interdit), rendre
    // NaN (une division par zéro), ou ne rien dire (le refus disparaît du dossier).
    const q = questionBloquante(ID(0xc05));
    const resultat = calculerScoringMission(
      mission(
        5,
        RACINE_SEULE,
        [q],
        [reponse({ id: ID(0xc51), question: q.missionQuestionId, unite: UNITE_A, withheld: true })],
      ),
    );

    expect(resultat.mission.score).toBeNull();
    expect(resultat.mission.completude.ratio).toBe(0);
    expect(resultat.mission.completude.nonCommuniquees).toBe(1);
    expect(resultat.mission.indicatif).toBe(true);
    expect(resultat.drapeauxRouges).toHaveLength(0);
    // Ce qui reste du point critique : une anomalie qui le NOMME.
    expect(resultat.anomalies.map((a) => a.code)).toStrictEqual(['QUESTION_BLOQUANTE_NON_EVALUEE']);
    expect(resultat.anomalies[0]?.missionQuestionId).toBe(q.missionQuestionId);
  });

  it('@critique un drapeau sur une question SANS OBJET ne se lève pas — mais la question est comptée', () => {
    // Le pendant du refus, et il se traite autrement : le sans-objet sort du
    // dénominateur (§32.1), là où le refus y reste. Le point critique, lui, est
    // signalé dans les deux cas — sinon « N/A » deviendrait la façon polie de
    // faire disparaître la question qui fâche.
    const q = questionBloquante(ID(0xc06));
    const resultat = calculerScoringMission(
      mission(
        6,
        RACINE_SEULE,
        [q],
        [
          reponse({
            id: ID(0xc61),
            question: q.missionQuestionId,
            unite: UNITE_A,
            notApplicable: true,
          }),
        ],
      ),
    );

    expect(resultat.drapeauxRouges).toHaveLength(0);
    expect(resultat.mission.completude.sansObjet).toBe(1);
    expect(resultat.mission.completude.ratio).toBeNull();
    expect(resultat.mission.indicatif).toBe(false);
    expect(resultat.anomalies.map((a) => a.code)).toStrictEqual(['QUESTION_BLOQUANTE_NON_EVALUEE']);
  });

  it('@critique une réponse au rouge HORS PÉRIMÈTRE ou SANS UNITÉ n’est jamais silencieusement perdue', () => {
    // §25.1 : l'unité sortie du périmètre voit ses données CONSERVÉES et exclues
    // du scoring. Le drapeau ne remonte donc pas — mais la réponse doit rester
    // NOMMÉE, sans quoi le refus de périmètre deviendrait un effaceur de points
    // critiques. C'est la moitié que la spec tranche ; l'autre (un drapeau
    // d'unité hors périmètre a-t-il sa place au rapport ?) est remontée en doute
    // de spec, elle ne se devine pas ici.
    const q = questionBloquante(ID(0xc07));
    const horsPerimetre = calculerScoringMission(
      mission(
        7,
        [{ id: UNITE_A, parentId: null, headcount: 10, inScope: false }],
        [q],
        [
          reponse({
            id: ID(0xc71),
            question: q.missionQuestionId,
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'non' },
          }),
        ],
      ),
    );
    const sansUnite = calculerScoringMission(
      mission(
        8,
        RACINE_SEULE,
        [q],
        [
          reponse({
            id: ID(0xc81),
            question: q.missionQuestionId,
            unite: null,
            value: { type: 'yes_no', v: 'non' },
          }),
        ],
      ),
    );

    for (const [resultat, code, reponseId] of [
      [horsPerimetre, 'REPONSE_HORS_PERIMETRE', ID(0xc71)],
      [sansUnite, 'REPONSE_SANS_UNITE', ID(0xc81)],
    ] as const) {
      expect(resultat.anomalies).toHaveLength(1);
      expect(resultat.anomalies[0]?.code).toBe(code);
      expect(resultat.anomalies[0]?.reponseId).toBe(reponseId);
      expect(resultat.anomalies[0]?.missionQuestionId).toBe(q.missionQuestionId);
      expect(resultat.anomalies[0]?.message).not.toBe('');
      expect(resultat.drapeauxRouges).toHaveLength(0);
      expect(resultat.cotations).toHaveLength(0);
      expect(() => resultatScoringMissionSchema.parse(resultat)).not.toThrow();
    }
  });

  it('@critique une question bloquante JAMAIS RÉPONDUE laisse au moins sa trace au compteur', () => {
    // L'autre bout du §32.1-3, et le dernier endroit où un point critique peut
    // s'évanouir : personne n'a refusé, personne n'a répondu — la ligne `answers`
    // n'existe pas. Tout ce qui subsiste alors est ce compteur. Le rendre
    // load-bearing par un test, c'est empêcher qu'il disparaisse à son tour ;
    // ce qu'il ne dit PAS (ni la question, ni sa criticité) est remonté au
    // producteur, non corrigé ici.
    const q = questionBloquante(ID(0xc09));
    const resultat = calculerScoringMission(mission(9, RACINE_SEULE, [q], []));

    expect(resultat.mission.completude.posees).toBe(1);
    expect(resultat.mission.completude.nonRepondues).toBe(1);
    expect(resultat.mission.completude.cotees).toBe(0);
    expect(resultat.mission.score).toBeNull();
    expect(resultat.mission.indicatif).toBe(true);
  });
});

// =============================================================================
// ③ REFUS ≠ SANS OBJET ≠ ABSENCE — LES TROIS DANS LE MÊME JEU (§27.4)
// =============================================================================
describe('§27.4 — la frontière des trois états, éprouvée état par état', () => {
  const QUESTION_COTEE = ID(0xd01);
  const QUESTION_MOBILE = ID(0xd02);

  /** Le même mini-jeu, à un seul état près : deux questions, la seconde variable. */
  function jeuTroisEtats(etat: 'refus' | 'sans_objet' | 'absence'): ResultatScoringMission {
    const reponses: ReponseACoter[] = [
      reponse({
        id: ID(0xd11),
        question: QUESTION_COTEE,
        unite: UNITE_A,
        value: { type: 'scale_1_5', v: 4 },
      }),
    ];
    if (etat === 'refus') {
      reponses.push(
        reponse({ id: ID(0xd12), question: QUESTION_MOBILE, unite: UNITE_A, withheld: true }),
      );
    }
    if (etat === 'sans_objet') {
      reponses.push(
        reponse({ id: ID(0xd13), question: QUESTION_MOBILE, unite: UNITE_A, notApplicable: true }),
      );
    }
    // « absence » : AUCUNE ligne. C'est le troisième état, et il n'a pas de ligne
    // à porter — c'est précisément ce qui le distingue d'un refus.
    return calculerScoringMission(
      mission(
        10,
        RACINE_SEULE,
        [questionEchelle(QUESTION_COTEE), questionEchelle(QUESTION_MOBILE)],
        reponses,
      ),
    );
  }

  const refus = jeuTroisEtats('refus');
  const sansObjet = jeuTroisEtats('sans_objet');
  const absence = jeuTroisEtats('absence');

  it('@critique aucun des trois n’est coté 0 : le score reste 4, la question qui manque ne pèse pas', () => {
    // « jamais de pénalité pour un refus » (§27.4). Un 0 silencieux ferait de
    // chaque refus une sanction, et le client la paierait sans le savoir.
    expect(refus.mission.score).toBe(4);
    expect(sansObjet.mission.score).toBe(4);
    expect(absence.mission.score).toBe(4);
  });

  it('@critique les trois compteurs sont DISTINCTS — et la partition somme dans les trois cas', () => {
    expect([
      refus.mission.completude.nonCommuniquees,
      refus.mission.completude.sansObjet,
      refus.mission.completude.nonRepondues,
    ]).toStrictEqual([1, 0, 0]);
    expect([
      sansObjet.mission.completude.nonCommuniquees,
      sansObjet.mission.completude.sansObjet,
      sansObjet.mission.completude.nonRepondues,
    ]).toStrictEqual([0, 1, 0]);
    expect([
      absence.mission.completude.nonCommuniquees,
      absence.mission.completude.sansObjet,
      absence.mission.completude.nonRepondues,
    ]).toStrictEqual([0, 0, 1]);

    for (const resultat of [refus, sansObjet, absence]) {
      const c = resultat.mission.completude;
      expect(c.cotees + c.nonCommuniquees + c.sansObjet + c.nonRepondues).toBe(c.posees);
      expect(c.posees).toBe(2);
    }
  });

  it('@critique le REFUS reste au dénominateur, le SANS OBJET en sort — 0,50 contre 1,00', () => {
    // L'exemple du pack, au chiffre près : « établi sur 84 % des questions — 6 non
    // communiquées ». Un refus ABAISSE la complétude ; s'il en sortait comme le
    // sans-objet, la rubrique « Limites et réserves » n'aurait plus rien à dire.
    expect(refus.mission.completude.ratio).toBe(0.5);
    expect(sansObjet.mission.completude.ratio).toBe(1);
    expect(absence.mission.completude.ratio).toBe(0.5);

    // Et le seuil (0,60 au seed) en tire les conséquences, sans jamais masquer :
    expect(refus.mission.indicatif).toBe(true);
    expect(sansObjet.mission.indicatif).toBe(false);
    expect(absence.mission.indicatif).toBe(true);
    expect(refus.mission.score).not.toBeNull();
  });

  it('@critique le refus et le sans-objet ONT une cotation motivée, l’absence n’en a aucune', () => {
    // La différence structurelle que le rapport lit : une ligne existe, ou non.
    expect(refus.cotations).toHaveLength(2);
    expect(refus.cotations.find((c) => c.missionQuestionId === QUESTION_MOBILE)).toStrictEqual({
      reponseId: ID(0xd12),
      missionQuestionId: QUESTION_MOBILE,
      score: null,
      motifNonCotable: 'non_communique',
    });
    expect(
      sansObjet.cotations.find((c) => c.missionQuestionId === QUESTION_MOBILE)?.motifNonCotable,
    ).toBe('sans_objet');
    expect(absence.cotations).toHaveLength(1);
    expect(absence.cotations.find((c) => c.missionQuestionId === QUESTION_MOBILE)).toBeUndefined();
  });

  it('@critique les trois coexistent dans le jeu FIL-TPE, et s’y lisent séparément', () => {
    // Le même contrôle sur le jeu de référence, où les trois états sont portés par
    // trois questions différentes du même bloc — pour qu'aucun ne se lise
    // uniquement dans un jeu fabriqué pour lui.
    const resultat = calculerScoringMission(JEU_TPE);
    const parQuestion = new Map(resultat.cotations.map((c) => [c.missionQuestionId, c]));

    expect(parQuestion.get(TPE.q10)?.motifNonCotable).toBe('non_communique');
    expect(parQuestion.get(TPE.q12)?.motifNonCotable).toBe('sans_objet');
    expect(parQuestion.has(TPE.q11)).toBe(false);

    const c = uniteDe(resultat, TPE.uniteId).propre.completude;
    expect([c.nonCommuniquees, c.sansObjet, c.nonRepondues]).toStrictEqual([1, 1, 1]);
    expect(c.ratio).toBe(ACCEPTATION.tpeRatio);
  });
});

// =============================================================================
// ④ LES ASSERTIONS DU BALAYAGE — INVARIANTS 7 ET 3, ARMÉS
// =============================================================================
//
// ── POURQUOI CES ASSERTIONS NE NOMMENT AUCUN MOT INTERDIT ──────────────────
// Le balayage lit UN DOSSIER (`apps/api/src/scoring`), extensions comprises, donc
// AUSSI les fichiers de test qui y vivent — celui-ci le premier. Et il n'a pas de
// liste blanche, contrairement à son aîné du L2. Écrire `answer_revisions` en
// toutes lettres ici ferait donc rougir le garde-fou SUR SES PROPRES ASSERTIONS.
// La parade retenue n'est pas un contournement : les sondes sont éprouvées contre
// les CONSTANTES PARTAGÉES elles-mêmes (`ARCHIVE_REVISIONS`, `TABLE_FINANCIERE`,
// `CHAMPS_FINANCIERS_SURVEILLES`), ce qui vérifie TOUTES les graphies déclarées au
// lieu de deux recopiées à la main, et reste vrai le jour où la liste s'allonge.
// Le fait que la parade ait été NÉCESSAIRE est, lui, remonté au producteur.
// =============================================================================
describe('étanchéité des sources du moteur — le garde-fou reçoit enfin ses assertions', () => {
  it('@critique aucune source du scoring ne nomme l’archive des révisions ni la table financière', () => {
    const infractions = balayerScoring();
    const rapport = infractions
      .map((i) => `${i.fichier}:${String(i.ligne)} — ${i.motif}\n    ${i.extrait}`)
      .join('\n');
    expect(rapport).toBe('');
    expect(infractions).toHaveLength(0);
  });

  it('@critique le balayage VOIT réellement les fichiers du moteur — sensibilité prouvée', () => {
    // ANTI-VACUITÉ. Un balayage qui rend zéro parce qu'il ne lit rien rendrait le
    // même zéro que celui qui lit tout. On lui demande donc de chercher un mot
    // notoirement présent, et on vérifie QUELS fichiers il a ouverts.
    const temoin = balayerScoring([{ nom: 'témoin', motif: /import|export|interface/ }]);
    const fichiers = new Set(temoin.map((i) => i.fichier));

    for (const nom of ['bareme.ts', 'agregation.ts', 'moteur.ts', 'entree.ts']) {
      expect([...fichiers]).toContain(`${DOSSIER_SCORING}/${nom}`);
    }
    expect(temoin.length).toBeGreaterThan(20);

    // ET SON PÉRIMÈTRE INCLUT LES TESTS DU DOSSIER — fait à connaître avant d'y
    // écrire : le balayage ne distingue pas un source d'un test, et n'a aucune
    // liste blanche où inscrire une exception légitime.
    expect([...fichiers]).toContain(`${DOSSIER_SCORING}/acceptation.test.ts`);
  });

  it('@critique la sonde de l’invariant 7 est ARMÉE sur TOUTES les graphies déclarées', () => {
    const archive = sondesScoring().find((sonde) => sonde.nom.includes('archive'));
    expect(archive).toBeDefined();
    expect(ARCHIVE_REVISIONS.length).toBeGreaterThan(0);
    for (const graphie of ARCHIVE_REVISIONS) {
      expect(archive?.motif.test(`const anciennes = ${graphie};`)).toBe(true);
      expect(archive?.motif.test(`SELECT * FROM ${graphie} WHERE id = $1`)).toBe(true);
    }
    // `answers.revision` est LÉGITIME : c'est la ligne courante, pas l'archive.
    // Une sonde qui hurlerait dessus serait une sonde qu'on finit par désarmer.
    expect(archive?.motif.test('const r = reponse.revision;')).toBe(false);
  });

  it('@critique la sonde de l’invariant 3 reconnaît la table ET chacune de ses colonnes', () => {
    const sondes = sondesScoring();
    const table = sondes.find((sonde) => sonde.nom.includes('table financière'));
    const colonne = sondes.find((sonde) => sonde.nom.includes('colonne financière'));
    expect(table).toBeDefined();
    expect(colonne).toBeDefined();

    for (const graphie of TABLE_FINANCIERE) {
      expect(table?.motif.test(`.from(${graphie})`)).toBe(true);
    }
    for (const champ of CHAMPS_FINANCIERS_SURVEILLES) {
      expect(colonne?.motif.test(`const montant = ligne.${champ};`)).toBe(true);
    }
  });

  it('@critique `currency` reste HORS de la sentinelle — le piège déjà tranché au L2', () => {
    // Décision L2 : le mot est trop banal, et une réponse d'audit de type `money`
    // est parfaitement légitime (`answers.value`, la parole d'un interviewé). Ce
    // test existe pour empêcher qu'on l'ajoute « pour faire bonne mesure » : ce
    // serait un garde-fou bruyant, donc un garde-fou désarmé.
    for (const sonde of sondesScoring()) {
      expect(sonde.motif.test("const devise = ligne.currency ?? 'EUR';")).toBe(false);
      expect(sonde.motif.test("answerType === 'money'")).toBe(false);
    }
  });

  it('@critique l’entrée du moteur ne déclare AUCUN champ ouvrant sur l’archive ou sur les montants', () => {
    // La frontière prise à l'endroit où elle se franchirait : le TYPE d'entrée. Le
    // jour où quelqu'un ajoute un champ d'archive à `ReponseACoter`, la requête qui
    // le remplira suivra, et la moyenne du §32.1-1 comptera deux fois une réponse
    // corrigée — sans qu'aucun score ne cesse d'être plausible.
    const source = retirerCommentaires(
      readFileSync(join(RACINE, 'apps', 'api', 'src', 'scoring', 'entree.ts'), 'utf8'),
      false,
    );
    for (const interdit of [/\brevisions\b/i, /\barchive\b/i, /\bhistorique\b/i]) {
      expect(interdit.test(source)).toBe(false);
    }
    // Sensibilité : le fichier a bien été lu, et il n'est pas vide après nettoyage.
    expect(source).toContain('interface ReponseACoter');
    expect(source).toContain('interface QuestionFigee');
  });
});

// =============================================================================
// ⑤ LES QUATRE CORRECTIFS DE LA REVUE CROISÉE — ÉPROUVÉS, PAS SUPPOSÉS
// =============================================================================
//
// ── POURQUOI CE BLOC EXISTE, DIT PAR LE PRODUCTEUR LUI-MÊME ────────────────
// « La couche d'acceptation reste verte — cela prouve que je n'ai rien cassé, pas
// que les correctifs sont éprouvés. Elle a été écrite contre le moteur d'avant ;
// aucune de ses 24 assertions ne couvre les quatre comportements nouveaux. »
// C'est exact, et c'est la définition même du travail croisé : un correctif non
// éprouvé est une intention, et une intention ne tient pas une porte. Le producteur
// a vérifié par une sonde jetable, supprimée avant commit, et n'a écrit AUCUN test
// d'acceptation (09 §5.6) — c'est la conduite attendue, et voici la fermeture.
//
// ── UN CORRECTIF EST UN ENDROIT NEUF OÙ SE CACHER ──────────────────────────
// Chaque correctif est donc éprouvé sur SES DEUX BORDS : ce qu'il doit désormais
// attraper, ET ce qu'il ne doit toujours PAS attraper. Un garde qui s'élargit en se
// corrigeant échange un faux négatif contre un faux positif, et un drapeau rouge
// qui se lève à tort se paie aussi cher qu'un drapeau qui manque : il use la
// confiance de l'auditeur, qui finit par ne plus les lire.
// =============================================================================

// -----------------------------------------------------------------------------
// ⑤.A — `QUESTION_BLOQUANTE_JAMAIS_POSEE` : l'absence totale, et sa FRONTIÈRE
// -----------------------------------------------------------------------------
describe('la question bloquante que personne n’a posée — et la frontière du mot « posée »', () => {
  const BLOQUANTE = ID(0xe01);
  const ORDINAIRE = ID(0xe02);

  /** La bloquante, au poids que le cas exige — le poids ne doit rien gouverner ici. */
  function bloquanteDePoids(poids: string): QuestionFigee {
    return { ...questionBloquante(BLOQUANTE), weight: poids };
  }

  function anomaliesDe(resultat: ResultatScoringMission): readonly string[] {
    return resultat.anomalies.map((anomalie) => anomalie.code);
  }

  /** Une mission par ailleurs PARFAITE, à laquelle on ajoute le cas éprouvé. */
  function missionParfaiteSauf(
    poidsBloquante: string,
    reponsesBloquante: readonly ReponseACoter[] = [],
  ): ResultatScoringMission {
    return calculerScoringMission(
      mission(
        20,
        RACINE_SEULE,
        [bloquanteDePoids(poidsBloquante), questionEchelle(ORDINAIRE)],
        [
          reponse({
            id: ID(0xe11),
            question: ORDINAIRE,
            unite: UNITE_A,
            value: { type: 'scale_1_5', v: 5 },
          }),
          ...reponsesBloquante,
        ],
      ),
    );
  }

  it('@critique à POIDS 0 — le score reste 5,00 sur 5, et l’anomalie NOMME la question', () => {
    // Le trou d'origine : mission à 5,00, complétude 100 %, zéro drapeau, zéro
    // anomalie — et la seule question qui fâche n'avait jamais été posée. Le
    // correctif ne doit PAS changer le score (le poids gouverne toujours la
    // moyenne) ; il doit rendre le silence impossible.
    const resultat = missionParfaiteSauf('0');

    expect(resultat.mission.score).toBe(ACCEPTATION.parfait);
    expect(resultat.mission.completude.ratio).toBe(1);
    expect(resultat.mission.completude.posees).toBe(1);
    expect(resultat.drapeauxRouges).toHaveLength(0);

    expect(anomaliesDe(resultat)).toStrictEqual(['QUESTION_BLOQUANTE_JAMAIS_POSEE']);
    expect(resultat.anomalies[0]?.missionQuestionId).toBe(BLOQUANTE);
    expect(resultat.anomalies[0]?.criticite).toBe('bloquant');
    expect(resultat.anomalies[0]?.reponseId).toBeNull();
    expect(resultat.anomalies[0]?.message).toContain('bloquante');
    expect(() => resultatScoringMissionSchema.parse(resultat)).not.toThrow();
  });

  it('@critique à POIDS POSITIF aussi — le poids gouverne la moyenne, la criticité gouverne l’alerte', () => {
    // Le compteur `nonRepondues` existait déjà ; il ne suffit pas. Un COMPTE ne
    // nomme ni la question ni sa criticité : un analyste devant « 1 non répondue »
    // ne sait pas s'il doit décrocher son téléphone.
    const resultat = missionParfaiteSauf('3');

    expect(resultat.mission.completude.nonRepondues).toBe(1);
    expect(anomaliesDe(resultat)).toStrictEqual(['QUESTION_BLOQUANTE_JAMAIS_POSEE']);
    expect(resultat.anomalies[0]?.missionQuestionId).toBe(BLOQUANTE);
  });

  it('@critique la FRONTIÈRE, côté « posée » : une réponse ORPHELINE, INCONNUE ou REFUSÉE suffit', () => {
    // C'est ici que le jugement se joue : quelqu'un a été devant la question.
    // Empiler « jamais posée » sur « hors périmètre » dirait deux fois le même fait
    // sous deux noms, et deux anomalies pour un fait unique font douter des deux.
    const orpheline = missionParfaiteSauf('1', [
      reponse({
        id: ID(0xe21),
        question: BLOQUANTE,
        unite: null,
        value: { type: 'yes_no', v: 'non' },
      }),
    ]);
    expect(anomaliesDe(orpheline)).toStrictEqual(['REPONSE_SANS_UNITE']);

    const uniteInconnue = missionParfaiteSauf('1', [
      reponse({
        id: ID(0xe23),
        question: BLOQUANTE,
        unite: ID(0xdead),
        value: { type: 'yes_no', v: 'non' },
      }),
    ]);
    expect(anomaliesDe(uniteInconnue)).toStrictEqual(['REPONSE_UNITE_INCONNUE']);

    // Le REFUS a son propre code depuis le premier jour : lui non plus ne se
    // double pas — la question a bel et bien été posée, on a refusé d'y répondre.
    const refusee = missionParfaiteSauf('1', [
      reponse({ id: ID(0xe24), question: BLOQUANTE, unite: UNITE_A, withheld: true }),
    ]);
    expect(anomaliesDe(refusee)).toStrictEqual(['QUESTION_BLOQUANTE_NON_EVALUEE']);
  });

  it('@critique la FRONTIÈRE, côté HORS PÉRIMÈTRE — une seule anomalie, celle du périmètre', () => {
    // Le cas se monte à part : il exige une seconde racine, sortie du périmètre.
    const resultat = calculerScoringMission(
      mission(
        21,
        [
          { id: UNITE_A, parentId: null, headcount: 10, inScope: true },
          { id: UNITE_B, parentId: null, headcount: 4, inScope: false },
        ],
        [bloquanteDePoids('1')],
        [
          reponse({
            id: ID(0xe22),
            question: BLOQUANTE,
            unite: UNITE_B,
            value: { type: 'yes_no', v: 'non' },
          }),
        ],
      ),
    );

    expect(anomaliesDe(resultat)).toStrictEqual(['REPONSE_HORS_PERIMETRE']);
    expect(resultat.anomalies[0]?.criticite).toBe('bloquant');
  });

  it('@critique la FRONTIÈRE, côté criticité : une question NON bloquante jamais posée ne dit rien', () => {
    // « Évalué UNIQUEMENT si criticality = bloquant » (§32.1-6) vaut pour l'alerte
    // comme pour le drapeau. Signaler chaque question non posée transformerait le
    // rapport d'anomalies en inventaire de la collecte — et personne ne le lirait.
    const resultat = calculerScoringMission(
      mission(
        22,
        RACINE_SEULE,
        [questionEchelle(ORDINAIRE), questionEchelle(ID(0xe31))],
        [
          reponse({
            id: ID(0xe32),
            question: ORDINAIRE,
            unite: UNITE_A,
            value: { type: 'scale_1_5', v: 5 },
          }),
        ],
      ),
    );

    expect(resultat.mission.completude.nonRepondues).toBe(1);
    expect(resultat.anomalies).toHaveLength(0);
  });

  it('@critique la PORTÉE est la MISSION, pas l’unité — une unité muette ne fait pas une alerte', () => {
    // La borne qui protège du bruit : sur FIL-GC, trente unités ne sont jamais
    // interrogées. Compter l'absence par unité produirait trente lignes par question
    // bloquante. L'absence locale reste lisible là où elle se lit : le
    // `nonRepondues` de l'unité muette.
    const resultat = calculerScoringMission(
      mission(
        23,
        [
          { id: UNITE_A, parentId: null, headcount: 10, inScope: true },
          { id: UNITE_B, parentId: UNITE_A, headcount: 10, inScope: true },
        ],
        [bloquanteDePoids('1')],
        [
          reponse({
            id: ID(0xe41),
            question: BLOQUANTE,
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'oui' },
          }),
        ],
      ),
    );

    expect(resultat.anomalies).toHaveLength(0);
    expect(uniteDe(resultat, UNITE_B).propre.completude.nonRepondues).toBe(1);
    expect(uniteDe(resultat, UNITE_A).propre.completude.cotees).toBe(1);
  });

  it('@critique les quatre jeux de référence n’émettent AUCUNE alerte neuve — le correctif ne bruite pas', () => {
    // Non-régression du SILENCE, et elle vaut autant que celle des scores : un garde
    // qui s'allume sur les jeux normaux est désarmé en une semaine.
    for (const entree of [JEU_TPE, jeuGc(), JEU_ROLLUP, JEU_SCORE_PARFAIT]) {
      const codes = calculerScoringMission(entree).anomalies.map((a) => a.code);
      expect(codes.filter((code) => code === 'QUESTION_BLOQUANTE_JAMAIS_POSEE')).toStrictEqual([]);
      expect(codes.filter((code) => code === 'QUESTION_FIGEE_EN_DOUBLON')).toStrictEqual([]);
    }
  });
});

// -----------------------------------------------------------------------------
// ⑤.B — LE SEUIL SUR CHAQUE OPTION RETENUE, ET L'AGRÉGAT QUI RESTE LE SCORE
// -----------------------------------------------------------------------------
describe('le seuil regarde le DÉTAIL, la moyenne garde l’AGRÉGAT — les deux ne se croisent pas', () => {
  const CHOIX = ID(0xf01);

  /** Un choix multiple bloquant, options cotées 1 et 5, seuil « en dessous de 2 ». */
  function questionChoix(
    agregat: 'max' | 'mean',
    scores: readonly [number, number] = [1, 5],
  ): QuestionFigee {
    return {
      missionQuestionId: CHOIX,
      blocCode: 'bloc_1',
      answerType: 'multi_choice',
      weight: '1',
      scoring: { source: 'options', aggregate: agregat, red_flag: { below: 2 } },
      options: [
        { code: 'opt_a', label: 'Option A', score: scores[0] },
        { code: 'opt_c', label: 'Option C', score: scores[1] },
      ],
      criticality: 'bloquant',
    };
  }

  function jeuChoix(question: QuestionFigee, choisies: readonly string[]): ResultatScoringMission {
    return calculerScoringMission(
      mission(
        30,
        RACINE_SEULE,
        [question],
        [
          reponse({
            id: ID(0xf11),
            question: CHOIX,
            unite: UNITE_A,
            value: { type: 'multi_choice', v: choisies },
          }),
        ],
      ),
    );
  }

  it('@critique `max` — le score reste l’AGRÉGAT (5), et le drapeau vient du DÉTAIL (option à 1)', () => {
    // Le défaut fermé, et celui qui falsifiait la preuve n° 1 du producteur : en
    // mode `below`, le drapeau se décidait sur un score qui EST DÉJÀ un agrégat.
    // `max` prenait la MEILLEURE option et effaçait celle au rouge.
    const resultat = jeuChoix(questionChoix('max'), ['opt_a', 'opt_c']);

    // L'agrégat n'a pas bougé : la moyenne du §32.1-2 est intacte.
    expect(resultat.mission.score).toBe(5);
    expect(resultat.cotations[0]?.score).toBe(5);
    // …et l'alerte est là quand même.
    expect(resultat.drapeauxRouges).toHaveLength(1);
    expect(resultat.drapeauxRouges[0]?.declencheur).toBe('seuil');
    expect(resultat.drapeauxRouges[0]?.seuil).toBe(2);
  });

  it('@critique `mean` — le score reste 3, et le drapeau se lève sur l’option à 1', () => {
    const resultat = jeuChoix(questionChoix('mean'), ['opt_a', 'opt_c']);

    expect(resultat.mission.score).toBe(3);
    expect(resultat.drapeauxRouges).toHaveLength(1);
    expect(resultat.drapeauxRouges[0]?.seuil).toBe(2);
  });

  it('@critique le drapeau n’altère AUCUNE moyenne — bloc, unité et mission gardent l’agrégat', () => {
    // La séparation dans l'autre sens : le canal des drapeaux ne passe par aucune
    // moyenne, et il ne doit pas non plus en abaisser une. Un correctif d'alerte qui
    // déplacerait le score serait un changement de barème déguisé.
    const avec = jeuChoix(questionChoix('max'), ['opt_a', 'opt_c']);
    const sans = jeuChoix({ ...questionChoix('max'), criticality: 'important' }, [
      'opt_a',
      'opt_c',
    ]);

    expect(avec.mission.score).toBe(sans.mission.score);
    expect(uniteDe(avec, UNITE_A).propre.blocs[0]?.score).toBe(
      uniteDe(sans, UNITE_A).propre.blocs[0]?.score,
    );
    expect(sans.drapeauxRouges).toHaveLength(0);
  });

  it('@critique une option NON RETENUE ne déclenche rien — seul le détail CHOISI compte', () => {
    // LE FAUX POSITIF QUE CE CORRECTIF POUVAIT OUVRIR, et le premier endroit où
    // regarder : le seuil lit désormais les scores élémentaires. S'il lisait le
    // BARÈME au lieu de la RÉPONSE, toute question offrant une option à 1 lèverait
    // un drapeau pour tout le monde — l'alerte deviendrait une propriété de la
    // banque et non un constat d'audit.
    const resultat = jeuChoix(questionChoix('max'), ['opt_c']);

    expect(resultat.cotations[0]?.score).toBe(5);
    expect(resultat.drapeauxRouges).toHaveLength(0);
    expect(resultat.anomalies).toHaveLength(0);
  });

  it('@critique la borne ATTEINTE n’est pas FRANCHIE, au niveau élémentaire aussi', () => {
    // « Strictement en dessous » était vrai de l'agrégat ; il doit rester vrai de
    // chaque option. Options {2, 5} avec un seuil à 2 : rien ne se lève.
    for (const agregat of ['max', 'mean'] as const) {
      const resultat = jeuChoix(questionChoix(agregat, [2, 5]), ['opt_a', 'opt_c']);
      expect(resultat.drapeauxRouges).toHaveLength(0);
    }
    // Et à 1,99 — sous la borne — il se lève : la condition est bien ATTEINTE,
    // ce test n'est pas vide.
    const souscBorne = jeuChoix(questionChoix('max', [1.99, 5]), ['opt_a', 'opt_c']);
    expect(souscBorne.drapeauxRouges).toHaveLength(1);
  });

  it('@critique les types à score UNIQUE lisent toujours leur score — aucune régression', () => {
    // `elementaires` n'existe que pour le choix multiple. Une échelle et des bandes
    // doivent continuer à comparer le seuil au score, et lui seul.
    const echelle: QuestionFigee = {
      missionQuestionId: ID(0xf21),
      blocCode: 'bloc_1',
      answerType: 'scale_1_5',
      weight: '1',
      scoring: { map: 'identity', red_flag: { below: 2 } },
      options: null,
      criticality: 'bloquant',
    };
    const auRouge = calculerScoringMission(
      mission(
        31,
        RACINE_SEULE,
        [echelle],
        [
          reponse({
            id: ID(0xf22),
            question: ID(0xf21),
            unite: UNITE_A,
            value: { type: 'scale_1_5', v: 1 },
          }),
        ],
      ),
    );
    const auVert = calculerScoringMission(
      mission(
        32,
        RACINE_SEULE,
        [echelle],
        [
          reponse({
            id: ID(0xf23),
            question: ID(0xf21),
            unite: UNITE_A,
            value: { type: 'scale_1_5', v: 4 },
          }),
        ],
      ),
    );

    expect(auRouge.drapeauxRouges).toHaveLength(1);
    expect(auRouge.drapeauxRouges[0]?.score).toBe(1);
    expect(auVert.drapeauxRouges).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// ⑤.C — LA COERCITION ALIGNÉE : le drapeau compare comme le barème cote
// -----------------------------------------------------------------------------
describe('une seule règle de comparaison pour une même valeur — alignée, jamais élargie', () => {
  const QUESTION = ID(0xf31);

  function jeuValeurs(
    map: Record<string, number>,
    valeursDrapeau: readonly unknown[],
    valeur: unknown,
  ): ResultatScoringMission {
    const question: QuestionFigee = {
      missionQuestionId: QUESTION,
      blocCode: 'bloc_1',
      answerType: 'yes_no',
      weight: '1',
      scoring: { map, red_flag: { values: valeursDrapeau } },
      options: null,
      criticality: 'bloquant',
    };
    return calculerScoringMission(
      mission(
        33,
        RACINE_SEULE,
        [question],
        [reponse({ id: ID(0xf32), question: QUESTION, unite: UNITE_A, value: { v: valeur } })],
      ),
    );
  }

  it('@critique le NOMBRE répondu correspond au TEXTE attendu — le trou d’origine est fermé', () => {
    // Mesuré à la revue : le barème cotait 0 (il coerce `0` en clé `"0"`) et
    // l'alerte se taisait (`Object.is(0, "0")` est faux). La même valeur était
    // COMPRISE par le barème et IGNORÉE par le drapeau.
    const resultat = jeuValeurs({ '1': 5, '0': 0 }, ['0'], 0);

    expect(resultat.cotations[0]?.score).toBe(0);
    expect(resultat.drapeauxRouges).toHaveLength(1);
    expect(resultat.drapeauxRouges[0]?.declencheur).toBe('valeurs');
    expect(resultat.drapeauxRouges[0]?.valeurDeclenchante).toBe('0');
  });

  it('@critique et RÉCIPROQUEMENT — le texte répondu correspond au nombre attendu', () => {
    const resultat = jeuValeurs({ '1': 5, '0': 0 }, [0], '0');

    expect(resultat.cotations[0]?.score).toBe(0);
    expect(resultat.drapeauxRouges).toHaveLength(1);
  });

  it('@critique le cas nominal du pack est intact — « non » contre `["non"]`', () => {
    const resultat = jeuValeurs({ oui: 5, non: 0 }, ['non'], 'non');
    expect(resultat.drapeauxRouges).toHaveLength(1);
    expect(resultat.drapeauxRouges[0]?.valeurDeclenchante).toBe('non');

    const vert = jeuValeurs({ oui: 5, non: 0 }, ['non'], 'oui');
    expect(vert.drapeauxRouges).toHaveLength(0);
  });

  it('@critique UNE VALEUR NON COERCIBLE NE SE MET PAS À CORRESPONDRE — identité stricte préservée', () => {
    // LE FAUX POSITIF QUE CE CORRECTIF POUVAIT OUVRIR. Aligner n'est pas élargir :
    // un booléen n'est pas la chaîne « true », un tableau n'est pas sa concaténation.
    // Si la coercition mordait sur eux, `red_flag: {"values": ["true"]}` s'allumerait
    // sur toute réponse booléenne vraie — et le barème, lui, ne saurait toujours pas
    // la coter. L'alerte dirait alors quelque chose que le barème ne dit pas.
    const booleen = jeuValeurs({ true: 5, false: 0 }, ['true'], true);
    expect(booleen.drapeauxRouges).toHaveLength(0);
    expect(booleen.cotations[0]?.motifNonCotable).toBe('valeur_inexploitable');

    // …mais l'identité stricte, elle, fonctionne toujours : `true` contre `true`.
    const strict = jeuValeurs({ true: 5, false: 0 }, [true], true);
    expect(strict.drapeauxRouges).toHaveLength(1);
  });

  it('@critique deux valeurs qui ne désignent PAS la même chose ne correspondent pas', () => {
    // Les bords de la coercition, là où une implémentation trop généreuse se
    // trahirait : un zéro de tête, une notation exponentielle, une espace.
    // `cleDeValeur` rend `String(n)` — c'est une NORMALISATION, pas une
    // interprétation, et le barème refuse ces trois valeurs exactement comme
    // l'alerte les refuse.
    for (const [cle, valeur] of [
      ['01', 1],
      ['1e3', 1000],
      [' 1', 1],
    ] as const) {
      const resultat = jeuValeurs({ [cle]: 0 }, [cle], valeur);
      expect(resultat.drapeauxRouges).toHaveLength(0);
      expect(resultat.cotations[0]?.motifNonCotable).toBe('valeur_inexploitable');
    }
  });
});

// -----------------------------------------------------------------------------
// ⑤.D — LE DOUBLON DIT, ET LA CRITICITÉ PORTÉE PAR TOUTES LES ANOMALIES
// -----------------------------------------------------------------------------
describe('ce qui est écarté est dit — le doublon, et la criticité sur chaque anomalie', () => {
  it('@critique un DOUBLON de question figée est signalé, et la PREMIÈRE ligne fait toujours foi', () => {
    // La base l'interdit (clé primaire) : c'est de la défense en profondeur. Le cas
    // qui comptait est celui-ci — la seconde ligne est la BLOQUANTE, et son drapeau
    // disparaissait sans un mot. Il disparaît toujours (la première fait foi), mais
    // le fait est désormais DIT, ce qui est la seule chose qu'un moteur puisse faire
    // d'une donnée que rien ne permet d'arbitrer.
    const premiere: QuestionFigee = {
      ...questionBloquante(ID(0xf41)),
      scoring: { map: { oui: 5, non: 0 } },
      criticality: 'informatif',
    };
    const seconde = questionBloquante(ID(0xf41));
    const resultat = calculerScoringMission(
      mission(
        34,
        RACINE_SEULE,
        [premiere, seconde],
        [
          reponse({
            id: ID(0xf42),
            question: ID(0xf41),
            unite: UNITE_A,
            value: { type: 'yes_no', v: 'non' },
          }),
        ],
      ),
    );

    const doublons = resultat.anomalies.filter((a) => a.code === 'QUESTION_FIGEE_EN_DOUBLON');
    expect(doublons).toHaveLength(1);
    expect(doublons[0]?.missionQuestionId).toBe(ID(0xf41));
    expect(doublons[0]?.criticite).toBe('bloquant');
    // La première fait foi : elle n'est pas bloquante, donc aucun drapeau.
    expect(resultat.drapeauxRouges).toHaveLength(0);
    expect(resultat.cotations[0]?.score).toBe(0);
  });

  it('@critique LES NEUF CODES sont atteints par un même jeu, et chacun porte sa criticité', () => {
    // MATRICE EXHAUSTIVE, dans les deux sens. ① tout code déclaré au contrat est
    // ATTEINT par ce jeu — un code qu'aucun test ne provoque est une promesse que
    // rien ne tient, et le jour où un dixième code apparaîtra, cette assertion
    // rougira jusqu'à ce qu'on l'éprouve. ② `criticite` est renseignée partout SAUF
    // là où la question est réellement inconnue.
    const bloquanteRefusee = questionBloquante(ID(0x1101));
    const bloquanteJamais = questionBloquante(ID(0x1102));
    const bareme: QuestionFigee = {
      ...questionEchelle(ID(0x1103)),
      scoring: { map: 'ceci-n-est-pas-identity' },
      criticality: 'important',
    };
    const doublon = questionEchelle(ID(0x1104));
    const ordinaire = questionEchelle(ID(0x1105));
    const bloquanteOrpheline = questionBloquante(ID(0x1106));
    const bloquanteHorsPerimetre = questionBloquante(ID(0x1107));
    const bloquanteUniteInconnue = questionBloquante(ID(0x1108));

    const resultat = calculerScoringMission(
      mission(
        35,
        [
          { id: UNITE_A, parentId: null, headcount: 10, inScope: true },
          { id: UNITE_B, parentId: null, headcount: 4, inScope: false },
        ],
        [
          bloquanteRefusee,
          bloquanteJamais,
          bareme,
          doublon,
          doublon,
          ordinaire,
          bloquanteOrpheline,
          bloquanteHorsPerimetre,
          bloquanteUniteInconnue,
        ],
        [
          // QUESTION_BLOQUANTE_NON_EVALUEE
          reponse({ id: ID(0x1201), question: ID(0x1101), unite: UNITE_A, withheld: true }),
          // VALEUR_INEXPLOITABLE (sur une question non bloquante : un seul code)
          reponse({
            id: ID(0x1202),
            question: ID(0x1105),
            unite: UNITE_A,
            value: { type: 'scale_1_5', v: 42 },
          }),
          // REPONSE_SANS_QUESTION_FIGEE
          reponse({
            id: ID(0x1203),
            question: ID(0xbeef),
            unite: UNITE_A,
            value: { type: 'scale_1_5', v: 3 },
          }),
          // REPONSE_SANS_UNITE
          reponse({
            id: ID(0x1204),
            question: ID(0x1106),
            unite: null,
            value: { type: 'yes_no', v: 'non' },
          }),
          // REPONSE_HORS_PERIMETRE
          reponse({
            id: ID(0x1205),
            question: ID(0x1107),
            unite: UNITE_B,
            value: { type: 'yes_no', v: 'non' },
          }),
          // REPONSE_UNITE_INCONNUE
          reponse({
            id: ID(0x1206),
            question: ID(0x1108),
            unite: ID(0xdea0),
            value: { type: 'yes_no', v: 'non' },
          }),
        ],
      ),
    );

    const codesAtteints = new Set(resultat.anomalies.map((a) => a.code));
    expect([...codesAtteints].sort()).toStrictEqual(Object.values(CODES_ANOMALIE_SCORING).sort());

    for (const anomalie of resultat.anomalies) {
      if (anomalie.code === 'REPONSE_SANS_QUESTION_FIGEE') {
        // La question n'existe pas au questionnaire figé : personne ne peut dire ce
        // qu'elle valait. `null` est ici la seule réponse honnête.
        expect(anomalie.criticite).toBeNull();
        continue;
      }
      expect(anomalie.criticite).not.toBeNull();
    }
    expect(() => resultatScoringMissionSchema.parse(resultat)).not.toThrow();
  });

  it('@critique la criticité permet de TRIER — une bloquante tombée ne se lit plus comme un texte libre', () => {
    // L'asymétrie relevée à la revue, prise par son usage : deux réponses tombent
    // hors périmètre pour la même raison, mais l'une mérite un coup de téléphone et
    // l'autre une note de bas de page. Avant, la console rendait la même ligne.
    const bloquante = questionBloquante(ID(0x1301));
    const libre: QuestionFigee = {
      ...questionEchelle(ID(0x1302)),
      criticality: 'informatif',
    };
    const resultat = calculerScoringMission(
      mission(
        36,
        [
          { id: UNITE_A, parentId: null, headcount: 10, inScope: true },
          { id: UNITE_B, parentId: null, headcount: 4, inScope: false },
        ],
        [bloquante, libre],
        [
          reponse({
            id: ID(0x1311),
            question: ID(0x1301),
            unite: UNITE_B,
            value: { type: 'yes_no', v: 'non' },
          }),
          reponse({
            id: ID(0x1312),
            question: ID(0x1302),
            unite: UNITE_B,
            value: { type: 'scale_1_5', v: 3 },
          }),
        ],
      ),
    );

    const parReponse = new Map(resultat.anomalies.map((a) => [a.reponseId, a]));
    expect(parReponse.get(ID(0x1311))?.criticite).toBe('bloquant');
    expect(parReponse.get(ID(0x1312))?.criticite).toBe('informatif');
    // Le code, lui, est le même : c'est la criticité qui les sépare, et elle seule.
    expect(parReponse.get(ID(0x1311))?.code).toBe(parReponse.get(ID(0x1312))?.code);
  });
});
