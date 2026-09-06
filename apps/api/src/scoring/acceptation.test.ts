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
