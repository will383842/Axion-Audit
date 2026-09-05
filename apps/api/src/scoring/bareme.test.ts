// =============================================================================
// TESTS DE CONCEPTION DU BARÈME — 03 §32.1, type de réponse par type de réponse.
// Lot L8.
//
// ── CE QUE CES TESTS SONT, ET CE QU'ILS NE SONT PAS ────────────────────────
// Ce sont des TESTS DE CONCEPTION, écrits par l'auteur du moteur AVANT le moteur
// (`CLAUDE.md` §4 étape 2 : « TDD sur les parties critiques … scoring : tests
// écrits AVANT »). Ils fixent le contrat que le code devra tenir.
//
// Ils ne portent PAS `@critique`, et c'est délibéré (décision du 2026-09-05, deux
// couches) : la couche d'ACCEPTATION revient à un testeur croisé, qui n'aura pas
// écrit le code. Un test de conception qui se déclarerait critique confondrait
// l'intention de l'auteur avec la vérification d'un tiers.
//
// ── CE QU'ILS VÉRIFIENT ────────────────────────────────────────────────────
// Un score par réponse, lu dans le `scoring` FIGÉ (`mission_questions.
// scoring_snapshot`), pour les onze `answer_type` du 04 — plus les quatre états
// qui ne produisent pas de score (§27.4) et le déclenchement du drapeau rouge.
// =============================================================================
import { describe, expect, it } from 'vitest';

import { coterReponse, poidsDeQuestion, questionEstScorable } from './bareme.js';
import type { QuestionFigee, ReponseACoter } from './entree.js';

const ID_QUESTION = '01900000-0000-7000-8000-0000000000a1';
const ID_REPONSE = '01900000-0000-7000-8000-0000000000b1';
const ID_ENTRETIEN = '01900000-0000-7000-8000-0000000000c1';
const ID_UNITE = '01900000-0000-7000-8000-0000000000d1';

const BANDES = [{ max: 20, score: 1 }, { max: 50, score: 3 }, { score: 5 }];
const OPTIONS = [
  { code: 'opt_a', label: 'A', score: 1 },
  { code: 'opt_b', label: 'B', score: 3 },
  { code: 'opt_c', label: 'C', score: 5 },
];

function question(partiel: Partial<QuestionFigee>): QuestionFigee {
  return {
    missionQuestionId: ID_QUESTION,
    blocCode: 'bloc_1',
    answerType: 'scale_1_5',
    weight: '1',
    scoring: { map: 'identity' },
    options: null,
    criticality: 'important',
    ...partiel,
  };
}

function reponse(value: unknown, partiel: Partial<ReponseACoter> = {}): ReponseACoter {
  return {
    id: ID_REPONSE,
    interviewId: ID_ENTRETIEN,
    missionQuestionId: ID_QUESTION,
    orgUnitId: ID_UNITE,
    value,
    withheld: false,
    notApplicable: false,
    ...partiel,
  };
}

// -----------------------------------------------------------------------------
describe('yes_no — `{"map": {"oui": 5, "non": 0}}`, INVERSABLE question par question', () => {
  const ouiNon = question({ answerType: 'yes_no', scoring: { map: { oui: 5, non: 0 } } });

  it('« oui » vaut 5 et « non » vaut 0 sur le barème usuel', () => {
    expect(coterReponse(ouiNon, reponse({ type: 'yes_no', v: 'oui' })).score).toBe(5);
    expect(coterReponse(ouiNon, reponse({ type: 'yes_no', v: 'non' })).score).toBe(0);
  });

  it("l'inversion vit dans la DONNÉE, pas dans le code — « Avez-vous des fichiers critiques non sauvegardés ? » (§32.1)", () => {
    const inverse = question({ answerType: 'yes_no', scoring: { map: { oui: 0, non: 5 } } });
    expect(coterReponse(inverse, reponse({ type: 'yes_no', v: 'oui' })).score).toBe(0);
    expect(coterReponse(inverse, reponse({ type: 'yes_no', v: 'non' })).score).toBe(5);
  });

  it('une valeur hors des deux clés n’est pas devinée : elle est INEXPLOITABLE', () => {
    const cote = coterReponse(ouiNon, reponse({ type: 'yes_no', v: 'peut-être' }));
    expect(cote.score).toBeNull();
    expect(cote.motifNonCotable).toBe('valeur_inexploitable');
  });
});

// -----------------------------------------------------------------------------
describe('scale_1_5 — `{"map": "identity"}` : la valeur EST le score', () => {
  const echelle = question({ answerType: 'scale_1_5', scoring: { map: 'identity' } });

  it('les cinq niveaux se cotent eux-mêmes', () => {
    for (const v of [1, 2, 3, 4, 5]) {
      expect(coterReponse(echelle, reponse({ type: 'scale_1_5', v })).score).toBe(v);
    }
  });

  it('une valeur hors de 1-5 est refusée — un score de 7 sur 5 ne se propage pas dans une moyenne', () => {
    expect(coterReponse(echelle, reponse({ type: 'scale_1_5', v: 7 })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
    expect(coterReponse(echelle, reponse({ type: 'scale_1_5', v: 0 })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });
});

// -----------------------------------------------------------------------------
describe('single_choice / multi_choice — les scores vivent dans `options[].score`', () => {
  const unique = question({
    answerType: 'single_choice',
    scoring: { source: 'options' },
    options: OPTIONS,
  });

  it('un choix unique prend le score de son option', () => {
    expect(coterReponse(unique, reponse({ type: 'single_choice', v: 'opt_b' })).score).toBe(3);
  });

  it('un code d’option inconnu est inexploitable, jamais 0 — l’absence de score n’est pas un mauvais score', () => {
    const cote = coterReponse(unique, reponse({ type: 'single_choice', v: 'opt_z' }));
    expect(cote.score).toBeNull();
    expect(cote.motifNonCotable).toBe('valeur_inexploitable');
  });

  it('une option dont le `score` est NULL ne cote pas (04 : `score NUMERIC NULL`)', () => {
    const sansScore = question({
      answerType: 'single_choice',
      scoring: { source: 'options' },
      options: [{ code: 'opt_a', label: 'A', score: null }],
    });
    expect(coterReponse(sansScore, reponse({ type: 'single_choice', v: 'opt_a' })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });

  it('multi + `aggregate: max` prend le MAXIMUM des options choisies', () => {
    const multi = question({
      answerType: 'multi_choice',
      scoring: { source: 'options', aggregate: 'max' },
      options: OPTIONS,
    });
    expect(coterReponse(multi, reponse({ type: 'multi_choice', v: ['opt_a', 'opt_b'] })).score).toBe(3);
  });

  it('multi + `aggregate: mean` prend la MOYENNE des options choisies', () => {
    const multi = question({
      answerType: 'multi_choice',
      scoring: { source: 'options', aggregate: 'mean' },
      options: OPTIONS,
    });
    expect(coterReponse(multi, reponse({ type: 'multi_choice', v: ['opt_a', 'opt_c'] })).score).toBe(3);
  });

  it('`aggregate` absent vaut `max` — « par défaut » du §32.1, pas une invention du moteur', () => {
    const multi = question({
      answerType: 'multi_choice',
      scoring: { source: 'options' },
      options: OPTIONS,
    });
    expect(coterReponse(multi, reponse({ type: 'multi_choice', v: ['opt_a', 'opt_c'] })).score).toBe(5);
  });

  it('une sélection VIDE est une absence de réponse, pas un zéro', () => {
    const multi = question({
      answerType: 'multi_choice',
      scoring: { source: 'options' },
      options: OPTIONS,
    });
    expect(coterReponse(multi, reponse({ type: 'multi_choice', v: [] })).motifNonCotable).toBe(
      'sans_reponse',
    );
  });
});

// -----------------------------------------------------------------------------
describe('number / percent / duration / money — les BANDES, et leur borne INCLUSIVE', () => {
  const nombre = question({ answerType: 'number', scoring: { bands: BANDES } });

  it('`max` est une borne INCLUSIVE : 20 tombe dans la bande « max: 20 »', () => {
    expect(coterReponse(nombre, reponse({ type: 'number', v: 20 })).score).toBe(1);
    expect(coterReponse(nombre, reponse({ type: 'number', v: 21 })).score).toBe(3);
  });

  it('les trois bandes du pack se lisent dans l’ordre, la dernière étant ouverte', () => {
    expect(coterReponse(nombre, reponse({ type: 'number', v: 10 })).score).toBe(1);
    expect(coterReponse(nombre, reponse({ type: 'number', v: 50 })).score).toBe(3);
    expect(coterReponse(nombre, reponse({ type: 'number', v: 51 })).score).toBe(5);
    expect(coterReponse(nombre, reponse({ type: 'number', v: 1_000_000 })).score).toBe(5);
  });

  it('les quatre types numériques partagent le même chemin — `money` porte sa devise sans effet sur le score', () => {
    for (const answerType of ['number', 'percent', 'duration', 'money']) {
      const qn = question({ answerType, scoring: { bands: BANDES } });
      expect(coterReponse(qn, reponse({ type: answerType, v: 30, currency: 'EUR' })).score).toBe(3);
    }
  });

  it('une valeur non numérique n’est pas convertie en silence', () => {
    expect(coterReponse(nombre, reponse({ type: 'number', v: 'beaucoup' })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });

  it('sans bande ouverte, une valeur au-delà du dernier `max` reste SANS SCORE — jamais de convention inventée', () => {
    const bornee = question({ answerType: 'number', scoring: { bands: [{ max: 20, score: 1 }] } });
    const cote = coterReponse(bornee, reponse({ type: 'number', v: 999 }));
    expect(cote.score).toBeNull();
    expect(cote.motifNonCotable).toBe('valeur_inexploitable');
  });
});

// -----------------------------------------------------------------------------
describe('fourchette (§27.4) — le score s’évalue sur la BORNE BASSE, par prudence', () => {
  const pourcent = question({ answerType: 'percent', scoring: { bands: BANDES } });

  it('[20 ; 80] vaut 1 (borne basse), et surtout PAS 5 (borne haute)', () => {
    expect(coterReponse(pourcent, reponse({ type: 'range', low: 20, high: 80 })).score).toBe(1);
  });

  it('une fourchette sans borne basse ne se cote pas — la prudence n’a rien sur quoi s’appuyer', () => {
    expect(
      coterReponse(pourcent, reponse({ type: 'range', low: null, high: 80 })).motifNonCotable,
    ).toBe('valeur_inexploitable');
  });
});

// -----------------------------------------------------------------------------
describe('free_text / date / table — `weight = 0` obligatoire, jamais de score (§32.1)', () => {
  it('les trois types alimentent les findings et le rapport, jamais le score', () => {
    for (const answerType of ['free_text', 'date', 'table']) {
      const qn = question({ answerType, weight: '0', scoring: null });
      const cote = coterReponse(qn, reponse({ type: answerType, v: 'quelque chose' }));
      expect(cote.score).toBeNull();
      expect(cote.motifNonCotable).toBe('hors_bareme');
      expect(questionEstScorable(qn)).toBe(false);
    }
  });
});

// -----------------------------------------------------------------------------
describe('les états qui ne produisent PAS de score — et qui ne se confondent jamais (§27.4)', () => {
  const echelle = question({ answerType: 'scale_1_5', scoring: { map: 'identity' } });

  it('NON COMMUNIQUÉ : demandé, non obtenu — sort du score, reste un fait d’audit', () => {
    const cote = coterReponse(echelle, reponse(null, { withheld: true }));
    expect(cote.score).toBeNull();
    expect(cote.motifNonCotable).toBe('non_communique');
  });

  it('un refus l’emporte même si une valeur traîne dans la ligne — le refus est le fait, pas la valeur', () => {
    const cote = coterReponse(echelle, reponse({ type: 'scale_1_5', v: 4 }, { withheld: true }));
    expect(cote.motifNonCotable).toBe('non_communique');
    expect(cote.score).toBeNull();
  });

  it('SANS OBJET : la question ne se pose pas ici', () => {
    expect(coterReponse(echelle, reponse(null, { notApplicable: true })).motifNonCotable).toBe(
      'sans_objet',
    );
  });

  it('le refus PRIME le sans-objet quand les deux drapeaux coexistent — « Limites et réserves » ne perd rien', () => {
    const cote = coterReponse(echelle, reponse(null, { withheld: true, notApplicable: true }));
    expect(cote.motifNonCotable).toBe('non_communique');
  });

  it('SANS RÉPONSE : la ligne existe (une note, un « à revoir »), la valeur non', () => {
    expect(coterReponse(echelle, reponse(null)).motifNonCotable).toBe('sans_reponse');
  });
});

// -----------------------------------------------------------------------------
describe('un barème que la forme normée (04 §7.3) ne reconnaît pas est SIGNALÉ, jamais deviné', () => {
  it('un `scoring` de forme inconnue rend `baremeInvalide` et aucun score', () => {
    const bancal = question({ answerType: 'scale_1_5', scoring: { bareme: 'maison' } });
    const cote = coterReponse(bancal, reponse({ type: 'scale_1_5', v: 3 }));
    expect(cote.baremeInvalide).toBe(true);
    expect(cote.score).toBeNull();
    expect(cote.motifNonCotable).toBe('hors_bareme');
  });

  it('une échelle dont le `map` n’est pas `identity` ne se cote pas au hasard', () => {
    const bancal = question({ answerType: 'scale_1_5', scoring: { map: { haut: 5 } } });
    expect(coterReponse(bancal, reponse({ type: 'scale_1_5', v: 3 })).score).toBeNull();
  });
});

// -----------------------------------------------------------------------------
describe('le POIDS gouverne la moyenne, le BARÈME gouverne le score — deux leviers séparés', () => {
  it('une question de poids 0 dotée d’un barème valide PRODUIT un score, mais n’est pas scorable', () => {
    const horsMoyenne = question({ answerType: 'number', weight: '0', scoring: { bands: BANDES } });
    const cote = coterReponse(horsMoyenne, reponse({ type: 'number', v: 10 }));
    expect(cote.score).toBe(1);
    expect(questionEstScorable(horsMoyenne)).toBe(false);
    expect(poidsDeQuestion(horsMoyenne)).toBe(0);
  });

  it('le poids est lu depuis la CHAÎNE du NUMERIC figé, décimales comprises', () => {
    expect(poidsDeQuestion(question({ weight: '2.5' }))).toBe(2.5);
    expect(poidsDeQuestion(question({ weight: '0.000' }))).toBe(0);
  });

  it('un poids illisible ne devient pas 1 par défaut : la question sort du scoring', () => {
    const illisible = question({ weight: 'beaucoup' });
    expect(questionEstScorable(illisible)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('LE DRAPEAU ROUGE — déclenché par la CRITICITÉ, et par rien d’autre (§32.1)', () => {
  it('`values` compare la valeur BRUTE : « non » déclenche', () => {
    const bloquante = question({
      answerType: 'yes_no',
      scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['non'] } },
      criticality: 'bloquant',
    });
    const cote = coterReponse(bloquante, reponse({ type: 'yes_no', v: 'non' }));
    expect(cote.declencheurDrapeau).toBe('valeurs');
    expect(cote.valeurDeclenchante).toBe('non');
    expect(coterReponse(bloquante, reponse({ type: 'yes_no', v: 'oui' })).declencheurDrapeau).toBeNull();
  });

  it('sur un choix multiple, `values` déclenche dès qu’UNE des options choisies y figure', () => {
    const bloquante = question({
      answerType: 'multi_choice',
      scoring: { source: 'options', red_flag: { values: ['opt_a'] } },
      options: OPTIONS,
      criticality: 'bloquant',
    });
    expect(
      coterReponse(bloquante, reponse({ type: 'multi_choice', v: ['opt_c', 'opt_a'] })).declencheurDrapeau,
    ).toBe('valeurs');
    expect(
      coterReponse(bloquante, reponse({ type: 'multi_choice', v: ['opt_c'] })).declencheurDrapeau,
    ).toBeNull();
  });

  it('`below` compare le SCORE (0-5), la seule grandeur commune à tous les types — STRICTEMENT en dessous', () => {
    const bloquante = question({
      answerType: 'number',
      scoring: { bands: BANDES, red_flag: { below: 2 } },
      criticality: 'bloquant',
    });
    // 10 → bande « max: 20 » → score 1 → 1 < 2 → drapeau.
    const rouge = coterReponse(bloquante, reponse({ type: 'number', v: 10 }));
    expect(rouge.declencheurDrapeau).toBe('seuil');
    expect(rouge.seuilDrapeau).toBe(2);
    // 30 → score 3 → pas de drapeau.
    expect(coterReponse(bloquante, reponse({ type: 'number', v: 30 })).declencheurDrapeau).toBeNull();
  });

  it('une borne atteinte n’est pas une borne franchie : score = seuil ne déclenche pas', () => {
    const bloquante = question({
      answerType: 'scale_1_5',
      scoring: { map: 'identity', red_flag: { below: 2 } },
      criticality: 'bloquant',
    });
    expect(coterReponse(bloquante, reponse({ type: 'scale_1_5', v: 2 })).declencheurDrapeau).toBeNull();
    expect(coterReponse(bloquante, reponse({ type: 'scale_1_5', v: 1 })).declencheurDrapeau).toBe('seuil');
  });

  it('un `red_flag` sur une question NON bloquante ne déclenche pas — « évalué UNIQUEMENT si criticality=bloquant »', () => {
    for (const criticality of ['important', 'informatif'] as const) {
      const qn = question({
        answerType: 'yes_no',
        scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['non'] } },
        criticality,
      });
      expect(coterReponse(qn, reponse({ type: 'yes_no', v: 'non' })).declencheurDrapeau).toBeNull();
    }
  });

  it('une réponse NON COMMUNIQUÉE ne déclenche aucun drapeau — il n’y a rien à évaluer', () => {
    const bloquante = question({
      answerType: 'yes_no',
      scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['non'] } },
      criticality: 'bloquant',
    });
    const cote = coterReponse(bloquante, reponse({ type: 'yes_no', v: 'non' }, { withheld: true }));
    expect(cote.declencheurDrapeau).toBeNull();
    expect(cote.motifNonCotable).toBe('non_communique');
    // …mais elle est SIGNALÉE comme bloquante non évaluée : voir `moteur.test.ts`.
  });
});
