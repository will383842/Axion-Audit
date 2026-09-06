// =============================================================================
// TESTS DE L'ASSEMBLAGE DE L'AGRÉGATION — écrits AVANT `agregation.ts`.
// Lot L7, incrément L7b.
//
// ⚠ Tests d'A32 (conception, TDD). L'acceptation par rôle, les quatre états et
// l'axe-core sont écrits par A36 (09 §5.6).
//
// Ce que ces tests verrouillent, et qui est le fond du §27.4 :
// « NON COMMUNIQUÉ », « SANS OBJET », « À REVOIR » et « personne ne l'a posée »
// sont QUATRE situations distinctes. Les confondre — ne serait-ce qu'en les
// comptant ensemble — ferait disparaître du rapport la rubrique « Limites et
// réserves », c'est-à-dire ce qui protège le cabinet de garantir ce qu'il n'a pas
// pu vérifier.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E12 (entretiens par
// interlocuteur, à-revoir).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { PROVENANCES_REPONSE } from '@axion/shared';
import { assemblerAgregation, type EntreeAgregation } from './agregation.js';
import type { LigneQuestionAgregee, LigneReponseAgregee } from './depot.js';

const MISSION = '01890000-0000-7000-8000-000000000001';
const CALCULE_LE = '2026-09-05T08:00:00.000Z';

function uuid(n: number): string {
  return `01890000-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

function question(n: number, surcharge: Partial<LigneQuestionAgregee> = {}): LigneQuestionAgregee {
  return {
    missionQuestionId: uuid(n),
    blocCode: 'bloc_1',
    blocLibelle: 'Stratégie',
    texte: `Question ${String(n)}`,
    criticite: 'important',
    typeReponse: 'scale_1_5',
    sourceAttendue: 'entretien',
    position: n,
    optionsSnapshot: null,
    ...surcharge,
  };
}

function reponse(
  n: number,
  missionQuestionId: string,
  surcharge: Partial<LigneReponseAgregee> = {},
): LigneReponseAgregee {
  return {
    answerId: uuid(1000 + n),
    missionQuestionId,
    interviewId: uuid(2000 + n),
    sessionKind: 'entretien',
    orgUnitId: uuid(3000 + n),
    orgUnitNom: `Unité ${String(n)}`,
    orgUnitInScope: true,
    fonctionRepondant: 'Responsable logistique',
    serviceRepondant: 'Logistique et opérations',
    provenance: 'entretien',
    valeur: { type: 'scale_1_5', v: 3 },
    nonCommunique: false,
    motifNonCommunique: null,
    sansObjet: false,
    motifSansObjet: null,
    aRevoir: false,
    motifARevoir: null,
    horsParcours: false,
    note: null,
    revision: 1,
    misAJourLe: new Date('2026-09-04T12:00:00.000Z'),
    ...surcharge,
  };
}

function entree(
  questions: readonly LigneQuestionAgregee[],
  reponses: readonly LigneReponseAgregee[],
  surcharge: Partial<EntreeAgregation> = {},
): EntreeAgregation {
  return {
    missionId: MISSION,
    timezone: 'Europe/Paris',
    calculeLe: CALCULE_LE,
    blocs: [{ code: 'bloc_1', libelle: 'Stratégie' }],
    filtre: { block: undefined, orgUnit: undefined },
    questions,
    reponses,
    nextCursor: null,
    totaux: {
      questions: questions.length,
      questionsAvecReponse: new Set(reponses.map((r) => r.missionQuestionId)).size,
      reponses: reponses.length,
      nonCommuniquees: reponses.filter((r) => r.nonCommunique).length,
      sansObjet: reponses.filter((r) => r.sansObjet).length,
      aRevoir: reponses.filter((r) => r.aRevoir).length,
      parProvenance: new Map(),
    },
    ...surcharge,
  };
}

describe('agrégation — les QUATRE situations du §27.4 ne se fondent jamais', () => {
  const q = question(1);
  const jeu = [
    reponse(1, q.missionQuestionId),
    reponse(2, q.missionQuestionId, {
      nonCommunique: true,
      motifNonCommunique: 'confidentiel',
      valeur: null,
    }),
    reponse(3, q.missionQuestionId, {
      sansObjet: true,
      motifSansObjet: 'Aucun système en place',
      valeur: null,
    }),
    reponse(4, q.missionQuestionId, { aRevoir: true, motifARevoir: 'Chiffre à confirmer' }),
  ];

  it('compte séparément renseignées, non communiquées, sans objet et à revoir', () => {
    const agregation = assemblerAgregation(entree([q], jeu));

    expect(agregation.questions[0]?.comptes).toEqual({
      posee: 4,
      renseignees: 2,
      nonCommuniquees: 1,
      sansObjet: 1,
      aRevoir: 1,
      horsParcours: 0,
      unitesTouchees: 4,
    });
  });

  it('un « non communiqué » porte SON MOTIF, et il n’est pas « sans objet »', () => {
    const agregation = assemblerAgregation(entree([q], jeu));
    const nonCommunique = agregation.questions[0]?.reponses[1];

    expect(nonCommunique?.nonCommunique).toBe(true);
    expect(nonCommunique?.motifNonCommunique).toBe('confidentiel');
    expect(nonCommunique?.sansObjet).toBe(false);
    expect(nonCommunique?.aRevoir).toBe(false);
  });

  it('un « à revoir » RESTE une réponse renseignée — c’est un doute, pas un vide', () => {
    const agregation = assemblerAgregation(entree([q], jeu));
    const aRevoir = agregation.questions[0]?.reponses[3];

    expect(aRevoir?.aRevoir).toBe(true);
    expect(aRevoir?.valeurLisible).toBe('3 / 5');
  });

  it('une question SANS AUCUNE LIGNE est un quatrième cas : personne ne l’a posée', () => {
    const agregation = assemblerAgregation(entree([question(9)], []));

    expect(agregation.questions[0]?.comptes.posee).toBe(0);
    expect(agregation.questions[0]?.reponses).toEqual([]);
    expect(agregation.totaux.questionsSansReponse).toBe(1);
  });
});

describe('agrégation — la PROVENANCE est visible, et c’est l’autre vocabulaire', () => {
  it('publie les CINQ provenances, toujours, même à zéro', () => {
    const q = question(1);
    const agregation = assemblerAgregation(entree([q], [reponse(1, q.missionQuestionId)]));

    expect(agregation.questions[0]?.parProvenance.map((p) => p.provenance)).toEqual([
      ...PROVENANCES_REPONSE,
    ]);
    expect(agregation.totaux.parProvenance.map((p) => p.provenance)).toEqual([
      ...PROVENANCES_REPONSE,
    ]);
  });

  it('compte chaque provenance séparément du TYPE de session', () => {
    const q = question(1);
    const agregation = assemblerAgregation(
      entree(
        [q],
        [
          reponse(1, q.missionQuestionId, {
            sessionKind: 'analyse_documentaire',
            provenance: 'document',
          }),
          reponse(2, q.missionQuestionId, { sessionKind: 'atelier', provenance: 'entretien' }),
        ],
      ),
    );

    const parProvenance = agregation.questions[0]?.parProvenance ?? [];
    expect(parProvenance.find((p) => p.provenance === 'document')?.nombre).toBe(1);
    expect(parProvenance.find((p) => p.provenance === 'entretien')?.nombre).toBe(1);
    // Le TYPE de session voyage à côté, sans jamais être confondu avec la provenance.
    expect(agregation.questions[0]?.reponses.map((r) => r.sessionKind)).toEqual([
      'analyse_documentaire',
      'atelier',
    ]);
  });

  it('publie la source ATTENDUE à côté des constatées — le §27.6 les COMPARE', () => {
    const agregation = assemblerAgregation(
      entree([question(1, { sourceAttendue: 'document' })], []),
    );
    expect(agregation.questions[0]?.sourceAttendue).toBe('document');
  });

  it('une provenance inconnue du contrat ne fait pas tomber l’écran', () => {
    const q = question(1);
    const agregation = assemblerAgregation(
      entree([q], [reponse(1, q.missionQuestionId, { provenance: 'inventee' })]),
    );

    expect(agregation.questions[0]?.reponses[0]?.provenance).toBe('entretien');
  });
});

describe('agrégation — aucun NOM DE PERSONNE ne sort, la fonction oui', () => {
  it('rend la fonction et le service du répondant, jamais son nom', () => {
    const q = question(1);
    const agregation = assemblerAgregation(entree([q], [reponse(1, q.missionQuestionId)]));
    const ligne = agregation.questions[0]?.reponses[0];

    expect(ligne?.fonctionRepondant).toBe('Responsable logistique');
    expect(ligne?.serviceRepondant).toBe('Logistique et opérations');
    expect(Object.keys(ligne ?? {})).not.toContain('personName');
    expect(JSON.stringify(agregation)).not.toContain('personName');
  });
});

describe('agrégation — les valeurs sont APLATIES côté serveur (invariant 6)', () => {
  it('rend une fourchette « 20 – 30 » plutôt qu’un objet', () => {
    const q = question(1, { typeReponse: 'number' });
    const agregation = assemblerAgregation(
      entree(
        [q],
        [reponse(1, q.missionQuestionId, { valeur: { type: 'range', low: 20, high: 30 } })],
      ),
    );

    expect(agregation.questions[0]?.reponses[0]?.valeurLisible).toBe('20 – 30');
  });

  it('rend un choix par son LIBELLÉ, depuis le snapshot de la mission', () => {
    const q = question(1, {
      typeReponse: 'single_choice',
      optionsSnapshot: [{ code: 'a', label: 'Tout à fait', score: 5 }],
    });
    const agregation = assemblerAgregation(
      entree([q], [reponse(1, q.missionQuestionId, { valeur: { type: 'single_choice', v: 'a' } })]),
    );

    expect(agregation.questions[0]?.reponses[0]?.valeurLisible).toBe('Tout à fait');
  });

  it('une réponse sans valeur rend `null`, jamais une chaîne vide', () => {
    const q = question(1);
    const agregation = assemblerAgregation(
      entree([q], [reponse(1, q.missionQuestionId, { valeur: null, nonCommunique: true })]),
    );

    expect(agregation.questions[0]?.reponses[0]?.valeurLisible).toBeNull();
  });
});

describe('agrégation — l’enveloppe, les totaux et le curseur', () => {
  it('recopie le fuseau de mission, l’horodatage et le filtre appliqué', () => {
    const agregation = assemblerAgregation(
      entree([], [], { filtre: { block: 'bloc_2', orgUnit: uuid(42) } }),
    );

    expect(agregation.timezone).toBe('Europe/Paris');
    expect(agregation.calculeLe).toBe(CALCULE_LE);
    expect(agregation.filtre).toEqual({ block: 'bloc_2', orgUnit: uuid(42) });
  });

  it('les totaux viennent de la MISSION, pas de la page', () => {
    const q = question(1);
    const agregation = assemblerAgregation(
      entree([q], [reponse(1, q.missionQuestionId)], {
        totaux: {
          questions: 240,
          questionsAvecReponse: 200,
          reponses: 8000,
          nonCommuniquees: 42,
          sansObjet: 17,
          aRevoir: 9,
          parProvenance: new Map([['observation', 300]]),
        },
      }),
    );

    expect(agregation.totaux.questions).toBe(240);
    expect(agregation.totaux.questionsSansReponse).toBe(40);
    expect(agregation.totaux.reponses).toBe(8000);
    expect(
      agregation.totaux.parProvenance.find((p) => p.provenance === 'observation')?.nombre,
    ).toBe(300);
  });

  it('rend le curseur opaque tel qu’il vient du dépôt', () => {
    const agregation = assemblerAgregation(entree([], [], { nextCursor: 'curseur-opaque' }));
    expect(agregation.nextCursor).toBe('curseur-opaque');
  });

  it('les réponses d’une question ne débordent jamais sur une autre', () => {
    const q1 = question(1);
    const q2 = question(2);
    const agregation = assemblerAgregation(
      entree([q1, q2], [reponse(1, q1.missionQuestionId), reponse(2, q2.missionQuestionId)]),
    );

    expect(agregation.questions[0]?.reponses).toHaveLength(1);
    expect(agregation.questions[1]?.reponses).toHaveLength(1);
    expect(agregation.questions[0]?.reponses[0]?.answerId).toBe(uuid(1001));
  });

  it('l’horodatage d’une réponse sort en ISO 8601 UTC (11 §3)', () => {
    const q = question(1);
    const agregation = assemblerAgregation(entree([q], [reponse(1, q.missionQuestionId)]));

    expect(agregation.questions[0]?.reponses[0]?.misAJourLe).toBe('2026-09-04T12:00:00.000Z');
  });

  it('une unité SORTIE DU PÉRIMÈTRE reste visible, marquée (§25.1)', () => {
    const q = question(1);
    const agregation = assemblerAgregation(
      entree([q], [reponse(1, q.missionQuestionId, { orgUnitInScope: false })]),
    );

    expect(agregation.questions[0]?.reponses[0]?.orgUnitInScope).toBe(false);
  });
});
