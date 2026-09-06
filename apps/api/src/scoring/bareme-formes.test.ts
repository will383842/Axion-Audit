// =============================================================================
// L'ÉNUMÉRATION DES FORMES DE BARÈME — 04 §7.3 et 03 §32.1, forme par forme.
// Lot L8.
//
// ── ⚠ CES TESTS ONT ÉTÉ ÉCRITS APRÈS LE CODE, ET C'EST ÉCRIT ICI ───────────
// `bareme.test.ts` et `moteur.test.ts` ont été écrits AVANT le moteur (commit
// ba7a560, antérieur à toute ligne de `bareme.ts`) : c'est le TDD que CLAUDE.md §4
// exige sur les parties critiques, et il porte le COMPORTEMENT NOMINAL — les onze
// types de réponse, les quatre états du §27.4, l'agrégation, le roll-up, les
// drapeaux rouges.
//
// LE PRÉSENT FICHIER EST POSTÉRIEUR AU CODE, et le dire est la seule façon de
// garder honnête l'affirmation « les tests ont précédé le moteur ». Il couvre
// l'ÉNUMÉRATION DES FORMES MALFORMÉES, que le premier jet éprouvait par un seul
// exemple (`{"bareme": "maison"}`).
//
// CE QUI PROTÈGE DU DÉFAUT CLASSIQUE — un test écrit après le code qui se contente
// de constater ce que le code fait — c'est que chaque cas ci-dessous est DÉRIVÉ DU
// PACK, jamais de l'implémentation : le 04 §7.3 énumère les formes VALIDES, et
// chaque test prend une de ces formes et la casse d'UNE façon nommée. La règle
// éprouvée est celle du §32.1 lue à l'envers : « toute question `weight > 0` sans
// `scoring` valide est REJETÉE ». Ce qui n'est pas la forme normée n'est pas coté,
// et surtout n'est jamais DEVINÉ — un barème deviné produit des scores plausibles
// et faux, la seule catégorie d'erreur qu'un dossier d'audit ne peut pas absorber.
//
// Ils ne portent pas `@critique` : comme les deux autres, ce sont des tests de
// CONCEPTION (décision du 2026-09-05, deux couches). La couche d'acceptation
// revient à un testeur croisé.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E43 (exécutabilité
// autopilote : contrats partagés).
// =============================================================================
import { describe, expect, it } from 'vitest';

import { coterReponse, poidsDeQuestion, questionEstScorable } from './bareme.js';
import type { QuestionFigee, ReponseACoter } from './entree.js';

const ID_QUESTION = '01900000-0000-7000-8000-0000000000e1';
const ID_REPONSE = '01900000-0000-7000-8000-0000000000e2';
const ID_ENTRETIEN = '01900000-0000-7000-8000-0000000000e3';
const ID_UNITE = '01900000-0000-7000-8000-0000000000e4';

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

/** Un barème malformé : jamais de score, jamais scorable, et SIGNALÉ. */
function attendreInvalide(qn: QuestionFigee, valeur: unknown): void {
  const cote = coterReponse(qn, reponse(valeur));
  expect(cote.baremeInvalide).toBe(true);
  expect(cote.score).toBeNull();
  expect(cote.motifNonCotable).toBe('hors_bareme');
  expect(questionEstScorable(qn)).toBe(false);
}

// -----------------------------------------------------------------------------
describe('le `scoring` lui-même — ce n’est ni une chaîne, ni un nombre, ni un tableau', () => {
  it.each([
    ['une chaîne', 'identity'],
    ['un nombre', 5],
    ['un tableau', [{ max: 20, score: 1 }]],
  ])('%s en guise de `scoring` est une forme que le 04 §7.3 ne décrit pas', (_nom, scoring) => {
    attendreInvalide(question({ scoring }), { type: 'scale_1_5', v: 3 });
  });
});

// -----------------------------------------------------------------------------
describe('`yes_no` — la forme normée est `{"map": {"oui": 5, "non": 0}}`', () => {
  const ouiNon = (scoring: unknown): QuestionFigee => question({ answerType: 'yes_no', scoring });

  it.each([
    ['`map` absent', {}],
    ['`map` valant une chaîne', { map: 'identity' }],
    ['`map` valant un tableau', { map: ['oui', 'non'] }],
    ['`map` vide — aucune valeur ne pourrait être cotée', { map: {} }],
    ['un score non numérique', { map: { oui: 'haut', non: 0 } }],
    [
      'un score hors de 0-5 — « tous les scores sont sur 0-5 par construction »',
      { map: { oui: 9 } },
    ],
    ['un score négatif', { map: { oui: -1 } }],
  ])('%s rend le barème invalide', (_nom, scoring) => {
    attendreInvalide(ouiNon(scoring), { type: 'yes_no', v: 'oui' });
  });

  it('une clé NUMÉRIQUE se compare comme du texte — les JSONB ne portent que texte et nombre', () => {
    const qn = ouiNon({ map: { 1: 5, 0: 0 } });
    expect(coterReponse(qn, reponse({ type: 'yes_no', v: 1 })).score).toBe(5);
  });

  it('une valeur booléenne n’est pas une clé de table : elle n’est pas devinée', () => {
    const qn = ouiNon({ map: { oui: 5, non: 0 } });
    expect(coterReponse(qn, reponse({ type: 'yes_no', v: true })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });

  it('une FOURCHETTE sur un oui/non n’a pas de sens : elle ne se cote pas', () => {
    const qn = ouiNon({ map: { oui: 5, non: 0 } });
    expect(coterReponse(qn, reponse({ type: 'range', low: 1, high: 2 })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });
});

// -----------------------------------------------------------------------------
describe('`single_choice` / `multi_choice` — les scores vivent dans `options[].score`', () => {
  const choix = (scoring: unknown, options: unknown): QuestionFigee =>
    question({ answerType: 'single_choice', scoring, options });

  const OPTIONS = [{ code: 'opt_a', label: 'A', score: 1 }];

  it.each([
    ['une `source` autre qu’`options`', { source: 'bands' }, OPTIONS],
    ['des options absentes', { source: 'options' }, null],
    ['des options qui ne sont pas un tableau', { source: 'options' }, { opt_a: 1 }],
    ['une option sans `code`', { source: 'options' }, [{ label: 'A', score: 1 }]],
    ['un `code` non textuel', { source: 'options' }, [{ code: 3, label: 'A', score: 1 }]],
    ['un score d’option hors de 0-5', { source: 'options' }, [{ code: 'a', label: 'A', score: 9 }]],
    ['un `aggregate` que le pack ne nomme pas', { source: 'options', aggregate: 'somme' }, OPTIONS],
  ])('%s rend le barème invalide', (_nom, scoring, options) => {
    attendreInvalide(choix(scoring, options), { type: 'single_choice', v: 'opt_a' });
  });

  it('`source` ABSENT reste valide — la structure normée dit déjà où sont les scores', () => {
    const qn = choix({}, OPTIONS);
    expect(coterReponse(qn, reponse({ type: 'single_choice', v: 'opt_a' })).score).toBe(1);
  });

  it('une liste vide d’options est une forme VALIDE mais ne cote rien — aucun code n’y figure', () => {
    const qn = choix({ source: 'options' }, []);
    expect(questionEstScorable(qn)).toBe(true);
    expect(coterReponse(qn, reponse({ type: 'single_choice', v: 'opt_a' })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });

  it('dans un MULTI, un seul code inconnu suffit à rendre la réponse inexploitable', () => {
    const multi = question({
      answerType: 'multi_choice',
      scoring: { source: 'options' },
      options: [
        { code: 'opt_a', label: 'A', score: 1 },
        { code: 'opt_b', label: 'B', score: 3 },
      ],
    });
    expect(
      coterReponse(multi, reponse({ type: 'multi_choice', v: ['opt_a', 'opt_z'] })).motifNonCotable,
    ).toBe('valeur_inexploitable');
  });

  it('dans un MULTI, une option au score NULL rend la réponse inexploitable — jamais un zéro', () => {
    const multi = question({
      answerType: 'multi_choice',
      scoring: { source: 'options' },
      options: [
        { code: 'opt_a', label: 'A', score: 1 },
        { code: 'opt_b', label: 'B', score: null },
      ],
    });
    expect(
      coterReponse(multi, reponse({ type: 'multi_choice', v: ['opt_a', 'opt_b'] })).motifNonCotable,
    ).toBe('valeur_inexploitable');
  });

  it('un choix unique reçu sous forme de LISTE se cote comme un multi — une seule option', () => {
    const qn = choix({ source: 'options' }, OPTIONS);
    expect(coterReponse(qn, reponse({ type: 'single_choice', v: ['opt_a'] })).score).toBe(1);
  });
});

// -----------------------------------------------------------------------------
describe('`number` / `percent` / `duration` / `money` — la forme normée est `{"bands": […]}`', () => {
  const numerique = (scoring: unknown): QuestionFigee =>
    question({ answerType: 'number', scoring });

  it.each([
    ['`bands` absent', {}],
    ['`bands` qui n’est pas un tableau', { bands: { max: 20, score: 1 } }],
    ['`bands` VIDE — aucune valeur ne tomberait nulle part', { bands: [] }],
    ['une bande qui n’est pas un objet', { bands: ['20:1'] }],
    ['une bande sans `score`', { bands: [{ max: 20 }] }],
    ['un `score` de bande hors de 0-5', { bands: [{ max: 20, score: 9 }] }],
    ['un `max` non numérique', { bands: [{ max: 'vingt', score: 1 }] }],
    ['un `max` infini', { bands: [{ max: Number.POSITIVE_INFINITY, score: 1 }] }],
  ])('%s rend le barème invalide', (_nom, scoring) => {
    attendreInvalide(numerique(scoring), { type: 'number', v: 10 });
  });

  it('`max: null` est une bande OUVERTE, au même titre qu’un `max` absent', () => {
    const qn = numerique({
      bands: [
        { max: 20, score: 1 },
        { max: null, score: 5 },
      ],
    });
    expect(coterReponse(qn, reponse({ type: 'number', v: 999 })).score).toBe(5);
  });

  it('un score de 0 est un score LÉGITIME, pas une absence — la borne basse du §32.1', () => {
    const qn = numerique({ bands: [{ max: 20, score: 0 }, { score: 5 }] });
    expect(coterReponse(qn, reponse({ type: 'number', v: 10 })).score).toBe(0);
  });
});

// -----------------------------------------------------------------------------
describe('les types HORS BARÈME et les types inconnus ne se traitent pas pareil', () => {
  it.each(['free_text', 'date', 'table'])(
    '%s reste HORS BARÈME même si un `scoring` résiduel traîne — ce n’est pas une anomalie',
    (answerType) => {
      const qn = question({ answerType, weight: '0', scoring: { map: 'identity' } });
      const cote = coterReponse(qn, reponse({ type: answerType, v: 'du texte' }));
      expect(cote.motifNonCotable).toBe('hors_bareme');
      // La NUANCE qui compte : absence de barème ≠ barème malformé. Signaler une
      // anomalie ici ferait remonter un défaut sur une donnée parfaitement légitime.
      expect(cote.baremeInvalide).toBe(false);
    },
  );

  it('un `answer_type` hors des onze du 04 est INVALIDE — le barème ne peut rien en dire', () => {
    attendreInvalide(question({ answerType: 'signature_manuscrite' }), { type: 'x', v: 1 });
  });
});

// -----------------------------------------------------------------------------
describe('le `red_flag` malformé INVALIDE le barème — l’ignorer désarmerait la seule alerte', () => {
  it.each([
    ['un `red_flag` qui n’est pas un objet', 'oui'],
    ['un `red_flag` vide', {}],
    ['des `values` vides — rien ne pourrait déclencher', { values: [] }],
    ['un `below` non numérique', { below: 'deux' }],
    ['un `below` infini', { below: Number.POSITIVE_INFINITY }],
    ['une clé que le pack ne nomme pas', { above: 2 }],
  ])('%s', (_nom, redFlag) => {
    attendreInvalide(
      question({ scoring: { map: 'identity', red_flag: redFlag }, criticality: 'bloquant' }),
      { type: 'scale_1_5', v: 3 },
    );
  });

  it('`red_flag: null` est une ABSENCE de drapeau, pas un drapeau cassé', () => {
    const qn = question({ scoring: { map: 'identity', red_flag: null }, criticality: 'bloquant' });
    const cote = coterReponse(qn, reponse({ type: 'scale_1_5', v: 1 }));
    expect(cote.score).toBe(1);
    expect(cote.declencheurDrapeau).toBeNull();
  });

  it('`values` ET `below` ensemble : `values` est évalué en premier', () => {
    const qn = question({
      answerType: 'yes_no',
      scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['non'], below: 2 } },
      criticality: 'bloquant',
    });
    const cote = coterReponse(qn, reponse({ type: 'yes_no', v: 'non' }));
    expect(cote.declencheurDrapeau).toBe('valeurs');
    expect(cote.seuilDrapeau).toBeNull();
  });

  it('`below` ne déclenche PAS sans score — une valeur inexploitable n’est pas un mauvais score', () => {
    const qn = question({
      scoring: { map: 'identity', red_flag: { below: 2 } },
      criticality: 'bloquant',
    });
    const cote = coterReponse(qn, reponse({ type: 'scale_1_5', v: 42 }));
    expect(cote.motifNonCotable).toBe('valeur_inexploitable');
    expect(cote.declencheurDrapeau).toBeNull();
  });

  it('`values` compare la valeur BRUTE même quand le barème ne sait pas la coter', () => {
    // Le §32.1 dit « values », pas « valeurs cotables » : une réponse aberrante sur
    // une question bloquante doit pouvoir lever un drapeau, sinon il suffirait de
    // répondre n'importe quoi pour éteindre l'alerte.
    const qn = question({
      answerType: 'yes_no',
      scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['refus_de_repondre'] } },
      criticality: 'bloquant',
    });
    const cote = coterReponse(qn, reponse({ type: 'yes_no', v: 'refus_de_repondre' }));
    expect(cote.motifNonCotable).toBe('valeur_inexploitable');
    expect(cote.declencheurDrapeau).toBe('valeurs');
    expect(cote.valeurDeclenchante).toBe('refus_de_repondre');
  });

  it('la valeur déclenchante d’un `below` est RENDUE, et tronquée si elle est longue', () => {
    const bandes = { bands: [{ max: 20, score: 1 }, { score: 5 }], red_flag: { below: 2 } };
    const surFourchette = question({
      answerType: 'percent',
      scoring: bandes,
      criticality: 'bloquant',
    });
    expect(
      coterReponse(surFourchette, reponse({ type: 'range', low: 10, high: 90 })).valeurDeclenchante,
    ).toBe('10 – 90');

    const surMulti = question({
      answerType: 'multi_choice',
      scoring: { source: 'options', aggregate: 'mean', red_flag: { below: 2 } },
      options: [
        { code: 'a', label: 'A', score: 1 },
        { code: 'b', label: 'B', score: 1 },
      ],
      criticality: 'bloquant',
    });
    expect(
      coterReponse(surMulti, reponse({ type: 'multi_choice', v: ['a', 'b'] })).valeurDeclenchante,
    ).toBe('a, b');
  });

  it('une valeur déclenchante très longue est TRONQUÉE — rien de personnel ne transite (06 §10.4)', () => {
    const longue = 'x'.repeat(400);
    const qn = question({
      answerType: 'number',
      scoring: { bands: [{ max: 20, score: 1 }, { score: 5 }], red_flag: { below: 2 } },
      criticality: 'bloquant',
    });
    const cote = coterReponse(qn, reponse({ type: 'range', low: 10, high: longue }));
    expect(cote.declencheurDrapeau).toBe('seuil');
    expect(cote.valeurDeclenchante.length).toBeLessThanOrEqual(80);
    expect(cote.valeurDeclenchante.endsWith('…')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('les formes de VALEUR du 04 l. 150-151, et ce qui n’en est pas une', () => {
  const echelle = question({ scoring: { map: 'identity' } });

  it('un scalaire NU est toléré en lecture — il se rencontre dans un export', () => {
    expect(coterReponse(echelle, reponse(3)).score).toBe(3);
  });

  it('un objet SANS `v` ni `type: range` n’est pas une absence : c’est une valeur illisible', () => {
    const cote = coterReponse(echelle, reponse({ type: 'scale_1_5' }));
    expect(cote.motifNonCotable).toBe('valeur_inexploitable');
  });

  it('`{type, v: null}` est une ABSENCE de valeur, pas une valeur nulle', () => {
    expect(coterReponse(echelle, reponse({ type: 'scale_1_5', v: null })).motifNonCotable).toBe(
      'sans_reponse',
    );
  });

  it('une fourchette SANS AUCUNE borne est une absence de réponse', () => {
    expect(coterReponse(echelle, reponse({ type: 'range' })).motifNonCotable).toBe('sans_reponse');
  });

  it('une échelle reçue en FOURCHETTE se cote sur la borne basse, comme les bandes', () => {
    expect(coterReponse(echelle, reponse({ type: 'range', low: 2, high: 5 })).score).toBe(2);
  });

  it('une échelle NON ENTIÈRE n’est pas arrondie en silence', () => {
    expect(coterReponse(echelle, reponse({ type: 'scale_1_5', v: 3.5 })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });

  it('une échelle reçue en LISTE ne se cote pas', () => {
    expect(coterReponse(echelle, reponse({ type: 'scale_1_5', v: [3] })).motifNonCotable).toBe(
      'valeur_inexploitable',
    );
  });

  it('une valeur `NaN` ou infinie sur des bandes ne tombe dans aucune bande', () => {
    const qn = question({ answerType: 'number', scoring: { bands: [{ score: 5 }] } });
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(coterReponse(qn, reponse({ type: 'number', v })).motifNonCotable).toBe(
        'valeur_inexploitable',
      );
    }
  });
});

// -----------------------------------------------------------------------------
describe('le POIDS figé — lu depuis la chaîne du `NUMERIC`, jamais deviné', () => {
  it('une chaîne VIDE n’est pas un poids : elle sort la question du scoring', () => {
    expect(Number.isNaN(poidsDeQuestion(question({ weight: '' })))).toBe(true);
    expect(questionEstScorable(question({ weight: '   ' }))).toBe(false);
  });

  it('un poids NÉGATIF n’entre dans aucune moyenne', () => {
    expect(questionEstScorable(question({ weight: '-2' }))).toBe(false);
  });

  it('les espaces autour du nombre sont tolérés — un `NUMERIC` rendu par le pilote', () => {
    expect(poidsDeQuestion(question({ weight: ' 2.50 ' }))).toBe(2.5);
  });

  it('une question au barème valide et au poids positif EST scorable', () => {
    expect(questionEstScorable(question({ weight: '3' }))).toBe(true);
  });
});
