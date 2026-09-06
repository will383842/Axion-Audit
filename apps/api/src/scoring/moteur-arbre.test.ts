// =============================================================================
// L'ARBRE BANCAL, ET CE QUE LE MOTEUR EN FAIT — 03 §32.1-4, §25.1. Lot L8.
//
// ── ⚠ CES TESTS ONT ÉTÉ ÉCRITS APRÈS LE CODE, ET C'EST ÉCRIT ICI ───────────
// Même avertissement qu'en tête de `bareme-formes.test.ts`, et pour la même
// raison : `moteur.test.ts` a précédé le moteur (commit ba7a560) et porte le
// comportement NOMINAL. Le présent fichier est postérieur et couvre les entrées
// que l'arbre d'une mission réelle ne produit jamais — mais qu'un import CSV mal
// formé, une sync partielle ou un recalage de périmètre peuvent produire.
//
// ── POURQUOI ÇA N'EST PAS DU LUXE ──────────────────────────────────────────
// Une donnée d'arbre bancale a trois façons de nuire, et deux sont silencieuses :
//   · la BOUCLE INFINIE — le calcul ne rend jamais rien. Bruyante, au moins ;
//   · l'UNITÉ QUI DISPARAÎT — un cycle ou un parent fantôme la rend inatteignable
//     depuis les racines, elle sort du résultat sans un mot, et le score de la
//     mission est faux d'une façon que personne ne peut voir ;
//   · le SOUS-ARBRE ORPHELIN — une unité sortie du périmètre (§25.1) dont les
//     enfants remonteraient quand même, en se présentant comme des racines que
//     l'arbre réel n'a pas.
// Le moteur choisit, dans les trois cas, de RENDRE UN RÉSULTAT COMPLET plutôt que
// d'échouer ou d'oublier. Ces tests le fixent.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E7 (arbre d'unités à
// profondeur libre).
// =============================================================================
import { describe, expect, it } from 'vitest';

import { resultatScoringMissionSchema } from '@axion/shared';

import { PARAMETRES_SEED, uid } from '../../tests/aide/scoring-jeux-de-reference.js';
import { ecartTypePopulation, moyennePonderee } from './agregation.js';
import { coterReponse } from './bareme.js';
import type { EntreeScoring, QuestionFigee, ReponseACoter, UnitePourScoring } from './entree.js';
import { calculerScoringMission } from './moteur.js';

const ID_MISSION = uid(0xd000);
const ID_QUESTION = uid(0xd001);

const QUESTION: QuestionFigee = {
  missionQuestionId: ID_QUESTION,
  blocCode: 'bloc_1',
  answerType: 'scale_1_5',
  weight: '1',
  scoring: { map: 'identity' },
  options: null,
  criticality: 'important',
};

function entree(partiel: Partial<EntreeScoring>): EntreeScoring {
  return {
    missionId: ID_MISSION,
    parametres: PARAMETRES_SEED,
    blocs: ['bloc_1'],
    unites: [],
    questions: [QUESTION],
    reponses: [],
    ...partiel,
  };
}

function unite(
  id: string,
  parentId: string | null = null,
  headcount: number | null = 10,
): UnitePourScoring {
  return { id, parentId, headcount, inScope: true };
}

function reponse(n: number, orgUnitId: string, v: number): ReponseACoter {
  return {
    id: uid(0xd100 + n),
    interviewId: uid(0xd200 + n),
    missionQuestionId: ID_QUESTION,
    orgUnitId,
    value: { type: 'scale_1_5', v },
    withheld: false,
    notApplicable: false,
  };
}

// -----------------------------------------------------------------------------
describe('un arbre qui BOUCLE — le calcul rend un résultat, et n’oublie personne', () => {
  const a = uid(0xd010);
  const b = uid(0xd011);

  it('deux unités qui se déclarent parentes l’une de l’autre sont TOUTES DEUX parcourues', () => {
    const resultat = calculerScoringMission(
      entree({
        unites: [unite(a, b), unite(b, a)],
        reponses: [reponse(1, a, 4), reponse(2, b, 2)],
      }),
    );
    expect(resultat.unites).toHaveLength(2);
    expect(resultat.unites.map((u) => u.orgUnitId).sort()).toStrictEqual([a, b].sort());
    // Aucune des deux n'a de parent RETENU : le cycle en fait deux racines.
    expect(resultat.unites.every((u) => u.parentId === null)).toBe(true);
    // …et la mission les agrège quand même : (10×4 + 10×2) / 20 = 3.
    expect(resultat.mission.score).toBe(3);
    expect(() => resultatScoringMissionSchema.parse(resultat)).not.toThrow();
  });

  it('une unité qui se déclare son propre parent est une racine, pas une disparue', () => {
    const resultat = calculerScoringMission(
      entree({ unites: [unite(a, a)], reponses: [reponse(1, a, 5)] }),
    );
    expect(resultat.unites).toHaveLength(1);
    expect(resultat.mission.score).toBe(5);
  });

  it('une chaîne LONGUE qui reboucle sur elle-même ne fait pas tourner le calcul sans fin', () => {
    // Vingt unités en anneau : sans borne de parcours, la remontée des parents ne
    // s'arrêterait jamais. Le test échouerait par expiration, pas par assertion.
    const anneau: UnitePourScoring[] = [];
    for (let i = 0; i < 20; i += 1) {
      anneau.push(unite(uid(0xd020 + i), uid(0xd020 + ((i + 1) % 20))));
    }
    const resultat = calculerScoringMission(entree({ unites: anneau }));
    expect(resultat.unites).toHaveLength(20);
    expect(resultat.mission.completude.posees).toBe(20);
  });
});

// -----------------------------------------------------------------------------
describe('un PARENT FANTÔME — l’unité devient racine plutôt que de disparaître', () => {
  const orpheline = uid(0xd030);

  it('un `parentId` qui ne désigne aucune unité de l’arbre fourni', () => {
    const resultat = calculerScoringMission(
      entree({
        unites: [unite(orpheline, uid(0xdfff))],
        reponses: [reponse(1, orpheline, 3)],
      }),
    );
    expect(resultat.unites).toHaveLength(1);
    expect(resultat.unites[0]?.parentId).toBeNull();
    expect(resultat.unites[0]?.niveau).toBe(0);
    expect(resultat.mission.score).toBe(3);
  });
});

// -----------------------------------------------------------------------------
describe('§25.1 — une unité HORS PÉRIMÈTRE emmène son sous-arbre avec elle', () => {
  const racine = uid(0xd040);
  const brancheSortie = uid(0xd041);
  const enfantDeLaBranche = uid(0xd042);

  const arbre: UnitePourScoring[] = [
    unite(racine, null, 100),
    { id: brancheSortie, parentId: racine, headcount: 50, inScope: false },
    unite(enfantDeLaBranche, brancheSortie, 10),
  ];

  it('l’enfant d’une unité sortie du périmètre ne remonte PAS en racine', () => {
    const resultat = calculerScoringMission(
      entree({ unites: arbre, reponses: [reponse(1, racine, 4)] }),
    );
    const ids = resultat.unites.map((u) => u.orgUnitId);
    expect(ids).toStrictEqual([racine]);
    expect(ids).not.toContain(enfantDeLaBranche);
  });

  it('ses réponses sont SIGNALÉES hors périmètre — conservées, jamais silencieusement perdues', () => {
    const resultat = calculerScoringMission(
      entree({
        unites: arbre,
        reponses: [reponse(1, racine, 4), reponse(2, enfantDeLaBranche, 1)],
      }),
    );
    const horsPerimetre = resultat.anomalies.filter((a) => a.code === 'REPONSE_HORS_PERIMETRE');
    expect(horsPerimetre).toHaveLength(1);
    expect(horsPerimetre[0]?.orgUnitId).toBe(enfantDeLaBranche);
    // Le 1 de l'unité sortie ne tire pas le score : la mission reste à 4.
    expect(resultat.mission.score).toBe(4);
  });
});

// -----------------------------------------------------------------------------
describe('les blocs — un bloc non déclaré ne fait pas disparaître ses questions', () => {
  it('une question rattachée à un bloc absent de `blocs` apparaît EN FIN de liste', () => {
    const questionAilleurs: QuestionFigee = { ...QUESTION, blocCode: 'bloc_surprise' };
    const u = uid(0xd050);
    const resultat = calculerScoringMission(
      entree({
        blocs: ['bloc_1'],
        unites: [unite(u)],
        questions: [questionAilleurs],
        reponses: [reponse(1, u, 4)],
      }),
    );
    expect(resultat.mission.blocs.map((b) => b.blocCode)).toStrictEqual([
      'bloc_1',
      'bloc_surprise',
    ]);
    expect(resultat.mission.blocs[1]?.score).toBe(4);
    // Et le score de mission la compte : un score juste dans un bloc invisible
    // serait un score que personne ne lit.
    expect(resultat.mission.score).toBe(4);
  });
});

// -----------------------------------------------------------------------------
describe('les questions — un doublon d’identifiant ne compte pas deux fois', () => {
  it('deux lignes de même `missionQuestionId` : la PREMIÈRE fait foi, la seconde est ignorée', () => {
    const u = uid(0xd060);
    const resultat = calculerScoringMission(
      entree({
        unites: [unite(u)],
        questions: [QUESTION, { ...QUESTION, weight: '99' }],
        reponses: [reponse(1, u, 4)],
      }),
    );
    // Une seule question posée, et le poids retenu est celui de la première.
    expect(resultat.mission.completude.posees).toBe(1);
    expect(resultat.mission.blocs[0]?.poidsTotal).toBe(1);
  });
});

// -----------------------------------------------------------------------------
describe('les drapeaux — une valeur ABSENTE sur une question bloquante ne déclenche rien', () => {
  it('`red_flag.values` n’a rien à comparer quand la réponse est vide', () => {
    const bloquante: QuestionFigee = {
      ...QUESTION,
      answerType: 'yes_no',
      scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['non'] } },
      criticality: 'bloquant',
    };
    const cote = coterReponse(bloquante, {
      id: uid(0xd070),
      interviewId: uid(0xd071),
      missionQuestionId: ID_QUESTION,
      orgUnitId: uid(0xd072),
      value: null,
      withheld: false,
      notApplicable: false,
    });
    expect(cote.motifNonCotable).toBe('sans_reponse');
    expect(cote.declencheurDrapeau).toBeNull();
    expect(cote.valeurDeclenchante).toBe('');
  });
});

// -----------------------------------------------------------------------------
describe('les formules du §32.1, éprouvées seules', () => {
  it('la moyenne pondérée ignore les termes SANS VALEUR et les poids nuls', () => {
    expect(moyennePonderee([])).toBeNull();
    expect(moyennePonderee([{ poids: 10, valeur: null }])).toBeNull();
    expect(moyennePonderee([{ poids: 0, valeur: 5 }])).toBeNull();
    expect(
      moyennePonderee([
        { poids: 10, valeur: 4 },
        { poids: 0, valeur: 0 },
      ]),
    ).toBe(4);
  });

  it('l’écart-type n’existe pas à moins de deux réponses — jamais de NaN (§32.1-5, V2.9)', () => {
    expect(ecartTypePopulation([])).toBeNull();
    expect(ecartTypePopulation([3])).toBeNull();
    expect(ecartTypePopulation([1, 5])).toBe(2);
  });
});
