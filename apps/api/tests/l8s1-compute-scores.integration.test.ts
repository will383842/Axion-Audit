// =============================================================================
// LOT S1 (L8 BRANCHÉ) — `POST /v1/missions/:id/compute-scores` : LE CALCUL, SA
// PERSISTANCE IDEMPOTENTE, SES SIGNAUX ET SON ÉTANCHÉITÉ. PostgreSQL réel.
//
// ⚠ TESTS ÉCRITS AVANT LE CODE (09 §5.6). ROUGES pour la bonne raison : la route
// n'existe pas (404 `Route POST … not found`). Les valeurs attendues sont CALCULÉES
// À LA MAIN dans l'en-tête de `aide/semis-scoring.ts` — jamais obtenues en appelant le
// moteur : un test qui recalculerait avec `calculerScoringMission` vérifierait que le
// branchement est cohérent avec lui-même, pas qu'il est juste.
//
// ── CE QU'ON FIGE, ET CE QUI RESTE AU PRODUCTEUR ─────────────────────────────
// Figé (le 04 et le 03 §32.1 le disent) :
//   · `block_scores` = le score d'entreprise par bloc (roll-up des racines) ;
//   · `unit_scores`  = une ligne par unité × bloc de la mission, lecture CONSOLIDÉE du
//     sous-arbre (§32.1-4) — une feuille a propre = consolidé ;
//   · NULL, jamais 0, quand rien n'est cotable ; `completeness` = ratio 0..1 ;
//   · les drapeaux rouges, divergences, anomalies du moteur sont conservés dans
//     `block_scores.details` (`unit_scores` n'a pas de colonne `details` au 04) ;
//   · le calcul remplace l'ancien : DELETE puis INSERT, UNE transaction ;
//   · le calcul est tracé dans `activity_log` (action `mission.compute_scores`).
// Libre : tout le reste du corps de réponse au-delà de `{ missionId, calculeLe, resultat }`.
//
// Invariant 2 : missions FICTIVES. Invariant 3 : voir la section étanchéité.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resultatScoringMissionSchema } from '@axion/shared';
import {
  BAREME_IDENTITE,
  BAREME_OUI_NON_DRAPEAU,
  calculer,
  corrigerReponse,
  creerCompte,
  demarrerContexte,
  lireBlockScores,
  lireUnitScores,
  nombreOuNull,
  rattacher,
  semerJeuPrincipal,
  semerMission,
  semerQuestionFigee,
  semerReponse,
  semerSession,
  semerUnite,
  type Contexte,
  type JeuPrincipal,
  type LigneBloc,
  type LigneUnite,
} from './aide/semis-scoring.js';
import {
  detecterSentinelles,
  NOMS_FINANCIERS_INTERDITS,
  semerVoletFinancierSentinelle,
  VALEURS_SENTINELLES,
} from './aide/sentinelle-financiere.js';
import { uuidv7 } from './aide/base-l1.js';

let ctx: Contexte | undefined;
function c(): Contexte {
  if (ctx === undefined) throw new Error('contexte non démarré');
  return ctx;
}

beforeAll(async () => {
  ctx = await demarrerContexte('l8s1_calcul');
}, 300_000);

afterAll(async () => {
  if (ctx !== undefined) await ctx.fermer();
});

// -----------------------------------------------------------------------------
// OUTILS DE LECTURE
// -----------------------------------------------------------------------------
interface LigneJournal {
  readonly user_id: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly meta: Record<string, unknown> | null;
}

interface CorpsCalcul {
  readonly missionId: string;
  readonly calculeLe: string;
  readonly resultat: unknown;
}

async function calculerEnAdmin(jeu: JeuPrincipal): Promise<{ statut: number; corps: CorpsCalcul }> {
  const r = await calculer(c(), jeu.mission.id, jeu.admin.jeton);
  expect(r.statut, r.texte).toBe(200);
  return { statut: r.statut, corps: r.json as unknown as CorpsCalcul };
}

function ligneBloc(lignes: readonly LigneBloc[], code: string): LigneBloc {
  const ligne = lignes.find((l) => l.code === code);
  if (ligne === undefined) throw new Error(`ligne block_scores absente : ${code}`);
  return ligne;
}

function ligneUnite(lignes: readonly LigneUnite[], unite: string, code: string): LigneUnite {
  const ligne = lignes.find((l) => l.org_unit_id === unite && l.code === code);
  if (ligne === undefined) throw new Error(`ligne unit_scores absente : ${unite} / ${code}`);
  return ligne;
}

function tableau(details: Record<string, unknown> | null, cle: string): Record<string, unknown>[] {
  const valeur = details?.[cle];
  if (!Array.isArray(valeur)) throw new Error(`details.${cle} n'est pas un tableau`);
  return valeur as Record<string, unknown>[];
}

/** Les `details` sans aucun horodatage de calcul — pour comparer deux calculs. */
function detailsSansHorodatage(d: Record<string, unknown> | null): unknown {
  if (d === null) return null;
  return Object.fromEntries(Object.entries(d).filter(([cle]) => !/calcul|computed/i.test(cle)));
}

// =============================================================================
// 1. LE CALCUL NOMINAL — le jeu principal, calculé à la main
// =============================================================================
describe('@critique le calcul nominal — scores attendus calculés à la main', () => {
  let jeu: JeuPrincipal;
  let corps: CorpsCalcul;

  beforeAll(async () => {
    jeu = await semerJeuPrincipal(c());
    corps = (await calculerEnAdmin(jeu)).corps;
  });

  it('@critique rend 200 avec `{ missionId, calculeLe (UTC), resultat }` et un résultat conforme au contrat partagé', () => {
    expect(corps.missionId).toBe(jeu.mission.id);
    // Horodatage UTC (invariant 5) : ISO 8601 terminé par Z.
    expect(corps.calculeLe).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const resultat = resultatScoringMissionSchema.parse(corps.resultat);
    expect(resultat.missionId).toBe(jeu.mission.id);
    // Les seuils viennent d'`estimation_params` (seed 0,6 et 1,5), pas d'une constante.
    expect(resultat.parametres).toEqual({
      seuilCompletudeBloc: 0.6,
      seuilDivergenceEcartType: 1.5,
    });
  });

  it('@critique écrit `block_scores` : un score d’entreprise par bloc actif — 2,32 et 1,67', async () => {
    const lignes = await lireBlockScores(c(), jeu.mission.id);
    expect(lignes.map((l) => l.code)).toEqual(['bloc_1', 'bloc_2']);

    const b1 = ligneBloc(lignes, 'bloc_1');
    // (20 × 2,5 + 30 × 2,2) / 50 = 2,32 ; complétude : 6 cotées sur 9 posées (P comprise, 3 non répondues, §27.1) = 2/3
    expect(nombreOuNull(b1.score)).toBe(2.32);
    expect(nombreOuNull(b1.completeness)).toBeCloseTo(2 / 3, 10);
    expect(b1.is_indicative).toBe(false);

    const b2 = ligneBloc(lignes, 'bloc_2');
    // B n'a aucune question cotée : seul A compte → 1,67, et 2 cotées sur 6 posées (P elle-même comprise, jamais interrogée : 2 non répondues) = 1/3 < 0,6.
    expect(nombreOuNull(b2.score)).toBe(1.67);
    expect(nombreOuNull(b2.completeness)).toBeCloseTo(1 / 3, 10);
    expect(b2.is_indicative).toBe(true);

    for (const ligne of lignes) {
      expect(ligne.computed_at).not.toBeNull();
    }
  });

  it('@critique écrit `unit_scores` : une ligne par unité × bloc, lecture consolidée', async () => {
    const lignes = await lireUnitScores(c(), jeu.mission.id);
    expect(lignes).toHaveLength(6); // 3 unités × 2 blocs

    const { p, a, b } = jeu.unites;
    // Feuille A : 2,5 (moyenne des deux réponses Q2) et 1,67 (fourchette → borne BASSE).
    expect(nombreOuNull(ligneUnite(lignes, a, 'bloc_1').score)).toBe(2.5);
    expect(nombreOuNull(ligneUnite(lignes, a, 'bloc_2').score)).toBe(1.67);
    // Feuille B : 2,2 ; et NULL — jamais 0 — quand rien n'est cotable.
    expect(nombreOuNull(ligneUnite(lignes, b, 'bloc_1').score)).toBe(2.2);
    // Racine P, sans réponse propre : son score ne peut venir que du roll-up (headcount).
    expect(nombreOuNull(ligneUnite(lignes, p, 'bloc_1').score)).toBe(2.32);
    expect(nombreOuNull(ligneUnite(lignes, p, 'bloc_2').score)).toBe(1.67);
  });

  it('@critique « non communiqué » : B/bloc_2 est NULL (pas 0), complétude 0, indicatif — la réponse n’est pas un zéro', async () => {
    const lignes = await lireUnitScores(c(), jeu.mission.id);
    const bB2 = ligneUnite(lignes, jeu.unites.b, 'bloc_2');
    expect(bB2.score).toBeNull();
    expect(nombreOuNull(bB2.completeness)).toBe(0);
    // `answers_count` compte les réponses COTÉES : la réponse non communiquée n'en est pas une.
    expect(bB2.answers_count).toBe(0);

    const bloc2 = ligneBloc(await lireBlockScores(c(), jeu.mission.id), 'bloc_2');
    const completude = bloc2.details?.completude as Record<string, unknown>;
    expect(completude).toMatchObject({
      posees: 6,
      cotees: 2,
      nonCommuniquees: 1,
      sansObjet: 0,
      nonRepondues: 3,
      ratio: 1 / 3,
      sousSeuil: true,
    });
  });

  it('@critique « fourchette » : la borne BASSE cote — 20 → 1 (la borne haute 30 aurait donné 3 et 2,33)', async () => {
    const lignes = await lireUnitScores(c(), jeu.mission.id);
    const a2 = ligneUnite(lignes, jeu.unites.a, 'bloc_2');
    expect(nombreOuNull(a2.score)).toBe(1.67);
    expect(nombreOuNull(a2.score)).not.toBe(2.33);
    expect(a2.answers_count).toBe(2);
  });

  it('@critique les `answers_count` et complétudes des feuilles sont ceux du jeu', async () => {
    const lignes = await lireUnitScores(c(), jeu.mission.id);
    const { a, b } = jeu.unites;
    expect(ligneUnite(lignes, a, 'bloc_1').answers_count).toBe(3);
    expect(nombreOuNull(ligneUnite(lignes, a, 'bloc_1').completeness)).toBe(1);
    expect(ligneUnite(lignes, b, 'bloc_1').answers_count).toBe(3);
    expect(nombreOuNull(ligneUnite(lignes, b, 'bloc_1').completeness)).toBe(1);
  });

  it('@critique ne lit AUCUNE ligne hors de la mission : une seconde mission ne change pas ces scores', async () => {
    const autre = await semerJeuPrincipal(c());
    await corrigerReponse(c(), autre.reponses.a1q2, { type: 'scale_1_5', v: 1 });
    await calculerEnAdmin(autre);
    const lignes = await lireBlockScores(c(), jeu.mission.id);
    expect(nombreOuNull(ligneBloc(lignes, 'bloc_1').score)).toBe(2.32);
  });
});

// =============================================================================
// 2. LES SIGNAUX — jamais masqués par la moyenne (§32.1-5, -6 ; 03 §27.4)
// =============================================================================
describe('@critique drapeaux rouges, divergences, anomalies — conservés dans `details`, jamais masqués', () => {
  let jeu: JeuPrincipal;
  let corps: CorpsCalcul;

  beforeAll(async () => {
    jeu = await semerJeuPrincipal(c());
    corps = (await calculerEnAdmin(jeu)).corps;
  });

  it('@critique le drapeau rouge de Q3 (bloquant, « non ») est dans la réponse ET dans `details` du bloc_1, malgré un score de 2,32', async () => {
    const resultat = resultatScoringMissionSchema.parse(corps.resultat);
    expect(resultat.drapeauxRouges).toHaveLength(1);
    const drapeau = resultat.drapeauxRouges[0];
    expect(drapeau).toMatchObject({
      reponseId: jeu.reponses.a1q3,
      missionQuestionId: jeu.questions.q3,
      orgUnitId: jeu.unites.a,
      blocCode: 'bloc_1',
      criticite: 'bloquant',
      statut: 'propose',
    });

    const b1 = ligneBloc(await lireBlockScores(c(), jeu.mission.id), 'bloc_1');
    const drapeaux = tableau(b1.details, 'drapeauxRouges');
    expect(drapeaux).toHaveLength(1);
    expect(drapeaux[0]).toMatchObject({
      reponseId: jeu.reponses.a1q3,
      blocCode: 'bloc_1',
      statut: 'propose',
    });
    // CONTRÔLE DE VACUITÉ : la moyenne est bien « correcte » — c'est ce qu'elle cache.
    expect(nombreOuNull(b1.score)).toBe(2.32);

    // Le bloc_2 n'a AUCUN drapeau : le tableau est présent et vide, pas absent.
    const b2 = ligneBloc(await lireBlockScores(c(), jeu.mission.id), 'bloc_2');
    expect(tableau(b2.details, 'drapeauxRouges')).toHaveLength(0);
  });

  it('@critique la divergence de Q2 en unité A (écart-type 1,5 ≥ seuil 1,5) est conservée avec sa lecture direction / terrain', async () => {
    const b1 = ligneBloc(await lireBlockScores(c(), jeu.mission.id), 'bloc_1');
    const divergences = tableau(b1.details, 'divergences');
    const q2 = divergences.filter((d) => d.missionQuestionId === jeu.questions.q2);
    expect(q2).toHaveLength(1);
    expect(q2[0]).toMatchObject({
      orgUnitId: jeu.unites.a,
      type: 'ecart_type',
      ecartType: 1.5,
      nbReponses: 2,
      moyennesParGroupe: { direction: 4, terrain: 1 },
    });
    // Unité B : une seule réponse par question → jamais de divergence (n = 1, pas de NaN).
    expect(divergences.filter((d) => d.orgUnitId === jeu.unites.b)).toHaveLength(0);
  });

  it('@critique `details` porte aussi la complétude du bloc et le poids total, pour refaire le calcul à la main', async () => {
    const b1 = ligneBloc(await lireBlockScores(c(), jeu.mission.id), 'bloc_1');
    expect(b1.details?.completude).toMatchObject({
      posees: 9,
      cotees: 6,
      ratio: 2 / 3,
      sousSeuil: false,
    });
    expect(b1.details?.poidsTotal).toBe(10); // (1 + 3 + 1) × 2 unités
  });
});

describe('@critique anomalies et « sans objet » — ce qui est écarté est dit, jamais tu', () => {
  it('@critique une bloquante non évaluée et une valeur inexploitable sont des ANOMALIES visibles ; un sans-objet sort des deux termes', async () => {
    const admin = await creerCompte(c(), 'admin', 'signaux');
    const mission = await semerMission(c());
    const unite = await semerUnite(c(), {
      missionId: mission.id,
      nom: 'Unité des signaux',
      effectif: 10,
    });
    const session = await semerSession(c(), {
      missionId: mission.id,
      orgUnitId: unite,
      conduitPar: admin.id,
      groupe: 'direction',
    });
    const base = { missionId: mission.id } as const;
    const qs1 = await semerQuestionFigee(c(), {
      ...base,
      blocCode: 'bloc_1',
      texte: 'Signal 1',
      position: 1,
      typeReponse: 'yes_no',
      poids: 1,
      criticite: 'bloquant',
      scoring: BAREME_OUI_NON_DRAPEAU,
    });
    const qs2 = await semerQuestionFigee(c(), {
      ...base,
      blocCode: 'bloc_1',
      texte: 'Signal 2',
      position: 2,
      typeReponse: 'scale_1_5',
      poids: 4,
      criticite: 'important',
      scoring: BAREME_IDENTITE,
    });
    const qs6 = await semerQuestionFigee(c(), {
      ...base,
      blocCode: 'bloc_1',
      texte: 'Signal 6',
      position: 3,
      typeReponse: 'scale_1_5',
      poids: 2,
      criticite: 'important',
      scoring: BAREME_IDENTITE,
    });
    const qs3 = await semerQuestionFigee(c(), {
      ...base,
      blocCode: 'bloc_2',
      texte: 'Signal 3',
      position: 4,
      typeReponse: 'yes_no',
      poids: 1,
      criticite: 'bloquant',
      scoring: BAREME_OUI_NON_DRAPEAU,
    });
    const qs4 = await semerQuestionFigee(c(), {
      ...base,
      blocCode: 'bloc_2',
      texte: 'Signal 4',
      position: 5,
      typeReponse: 'scale_1_5',
      poids: 1,
      criticite: 'important',
      scoring: BAREME_IDENTITE,
    });
    const r1 = await semerReponse(c(), {
      interviewId: session,
      missionQuestionId: qs1,
      valeur: { type: 'yes_no', v: 'non' },
    });
    await semerReponse(c(), {
      interviewId: session,
      missionQuestionId: qs2,
      valeur: { type: 'scale_1_5', v: 5 },
    });
    await semerReponse(c(), { interviewId: session, missionQuestionId: qs6, sansObjet: true });
    const r3 = await semerReponse(c(), {
      interviewId: session,
      missionQuestionId: qs3,
      nonCommunique: true,
    });
    const r4 = await semerReponse(c(), {
      interviewId: session,
      missionQuestionId: qs4,
      valeur: { type: 'scale_1_5', v: 9 },
    });

    const reponse = await calculer(c(), mission.id, admin.jeton);
    expect(reponse.statut, reponse.texte).toBe(200);
    const resultat = resultatScoringMissionSchema.parse(
      (reponse.json as unknown as CorpsCalcul).resultat,
    );

    const blocs = await lireBlockScores(c(), mission.id);
    const b1 = ligneBloc(blocs, 'bloc_1');
    // (1 × 0 + 4 × 5) / 5 = 4,0 — la question sans objet (poids 2) n'est NI au numérateur NI au dénominateur.
    expect(nombreOuNull(b1.score)).toBe(4);
    expect(b1.details?.completude).toMatchObject({ posees: 3, cotees: 2, sansObjet: 1, ratio: 1 });
    // La moyenne de 4/5 ne masque pas le drapeau rouge de QS1.
    expect(resultat.drapeauxRouges.map((d) => d.reponseId)).toEqual([r1]);
    expect(tableau(b1.details, 'drapeauxRouges').map((d) => d.reponseId)).toEqual([r1]);

    // bloc_2 : rien de cotable → NULL (jamais 0).
    const b2 = ligneBloc(blocs, 'bloc_2');
    expect(b2.score).toBeNull();

    // Les anomalies : dans la réponse...
    const codes = resultat.anomalies.map((a) => a.code);
    expect(codes).toContain('QUESTION_BLOQUANTE_NON_EVALUEE');
    expect(codes).toContain('VALEUR_INEXPLOITABLE');
    expect(
      resultat.anomalies.find((a) => a.code === 'QUESTION_BLOQUANTE_NON_EVALUEE')?.reponseId,
    ).toBe(r3);
    expect(resultat.anomalies.find((a) => a.code === 'VALEUR_INEXPLOITABLE')?.reponseId).toBe(r4);

    // ... ET conservées en base, sur au moins une ligne de bloc (le producteur choisit la ventilation).
    const enBase = blocs.flatMap((b) => tableau(b.details, 'anomalies'));
    const codesEnBase = enBase.map((a) => a.code);
    expect(codesEnBase).toContain('QUESTION_BLOQUANTE_NON_EVALUEE');
    expect(codesEnBase).toContain('VALEUR_INEXPLOITABLE');
  });
});

// =============================================================================
// 3. L'IDEMPOTENCE ET LE REMPLACEMENT
// =============================================================================
describe('@critique idempotence — deux calculs de suite donnent les mêmes lignes', () => {
  it('@critique 2 calculs : mêmes lignes, mêmes scores, mêmes `details`, aucun doublon', async () => {
    const jeu = await semerJeuPrincipal(c());
    await calculerEnAdmin(jeu);
    const blocs1 = await lireBlockScores(c(), jeu.mission.id);
    const unites1 = await lireUnitScores(c(), jeu.mission.id);

    await calculerEnAdmin(jeu);
    const blocs2 = await lireBlockScores(c(), jeu.mission.id);
    const unites2 = await lireUnitScores(c(), jeu.mission.id);

    expect(blocs1).toHaveLength(2);
    expect(unites1).toHaveLength(6);
    expect(blocs2).toHaveLength(2);
    expect(unites2).toHaveLength(6);

    for (const [i, avant] of blocs1.entries()) {
      const apres = blocs2[i];
      expect(apres?.code).toBe(avant.code);
      expect(apres?.score).toBe(avant.score);
      expect(apres?.completeness).toBe(avant.completeness);
      expect(apres?.is_indicative).toBe(avant.is_indicative);
      expect(detailsSansHorodatage(apres?.details ?? null)).toEqual(
        detailsSansHorodatage(avant.details),
      );
    }
    for (const [i, avant] of unites1.entries()) {
      const apres = unites2[i];
      expect(apres?.org_unit_id).toBe(avant.org_unit_id);
      expect(apres?.code).toBe(avant.code);
      expect(apres?.score).toBe(avant.score);
      expect(apres?.answers_count).toBe(avant.answers_count);
      expect(apres?.completeness).toBe(avant.completeness);
    }
    // L'ancien calcul est REMPLACÉ : l'horodatage avance.
    expect((blocs2[0]?.computed_at ?? new Date(0)).getTime()).toBeGreaterThan(
      (blocs1[0]?.computed_at ?? new Date(0)).getTime(),
    );
  });

  it('@critique une réponse CORRIGÉE change le score au 2e calcul (et la divergence disparaît)', async () => {
    const jeu = await semerJeuPrincipal(c());
    await calculerEnAdmin(jeu);
    expect(
      nombreOuNull(ligneBloc(await lireBlockScores(c(), jeu.mission.id), 'bloc_1').score),
    ).toBe(2.32);

    // A2 corrige Q2 : 1 → 4. Unité A : Q2 = 4 → (5 + 3×4 + 0)/5 = 3,4 ; mission : (20×3,4 + 30×2,2)/50 = 2,68.
    await corrigerReponse(c(), jeu.reponses.a2q2, { type: 'scale_1_5', v: 4 });
    const second = await calculerEnAdmin(jeu);

    const blocs = await lireBlockScores(c(), jeu.mission.id);
    expect(nombreOuNull(ligneBloc(blocs, 'bloc_1').score)).toBe(2.68);
    const unites = await lireUnitScores(c(), jeu.mission.id);
    expect(nombreOuNull(ligneUnite(unites, jeu.unites.a, 'bloc_1').score)).toBe(3.4);
    expect(tableau(ligneBloc(blocs, 'bloc_1').details, 'divergences')).toHaveLength(0);
    // Le drapeau, lui, reste : la correction de Q2 ne touche pas Q3.
    expect(tableau(ligneBloc(blocs, 'bloc_1').details, 'drapeauxRouges')).toHaveLength(1);

    const resultat = resultatScoringMissionSchema.parse(second.corps.resultat);
    expect(resultat.mission.blocs.find((b) => b.blocCode === 'bloc_1')?.score).toBe(2.68);
    // Pas de ligne fantôme : toujours 2 + 6.
    expect(blocs).toHaveLength(2);
    expect(unites).toHaveLength(6);
  });

  it('@critique un calcul est TOUT-OU-RIEN : si l’écriture échoue, l’ancien calcul reste intact', async () => {
    const jeu = await semerJeuPrincipal(c());
    await calculerEnAdmin(jeu);
    const avant = await lireBlockScores(c(), jeu.mission.id);
    const unitesAvant = await lireUnitScores(c(), jeu.mission.id);
    await corrigerReponse(c(), jeu.reponses.a2q2, { type: 'scale_1_5', v: 4 });

    // Un déclencheur de TEST fait échouer l'INSERT dans `unit_scores` de CETTE mission,
    // APRÈS que `block_scores` a été réécrite : sans transaction, l'ancien calcul est perdu.
    const nom = `s1_echec_${jeu.mission.id.replaceAll('-', '')}`;
    await c().bd.query(
      `CREATE FUNCTION ${nom}() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'echec de test S1'; END $$`,
    );
    await c().bd.query(
      `CREATE TRIGGER ${nom} BEFORE INSERT ON unit_scores
         FOR EACH ROW WHEN (NEW.mission_id = '${jeu.mission.id}') EXECUTE FUNCTION ${nom}()`,
    );
    try {
      const echec = await calculer(c(), jeu.mission.id, jeu.admin.jeton);
      expect(echec.statut, echec.texte).toBe(500);
    } finally {
      await c().bd.query(`DROP TRIGGER ${nom} ON unit_scores`);
      await c().bd.query(`DROP FUNCTION ${nom}()`);
    }

    const apres = await lireBlockScores(c(), jeu.mission.id);
    const unitesApres = await lireUnitScores(c(), jeu.mission.id);
    expect(apres).toHaveLength(2);
    expect(unitesApres).toHaveLength(6);
    for (const [i, ligne] of avant.entries()) {
      expect(apres[i]?.score).toBe(ligne.score);
      expect(apres[i]?.computed_at?.getTime()).toBe(ligne.computed_at?.getTime());
    }
    for (const [i, ligne] of unitesAvant.entries()) {
      expect(unitesApres[i]?.score).toBe(ligne.score);
    }
  });

  it('@critique deux calculs SIMULTANÉS ne se marchent pas dessus : aucun 500, état final complet et cohérent', async () => {
    const jeu = await semerJeuPrincipal(c());
    const [r1, r2] = await Promise.all([
      calculer(c(), jeu.mission.id, jeu.admin.jeton),
      calculer(c(), jeu.mission.id, jeu.lead.jeton),
    ]);
    expect(r1.statut, r1.texte).not.toBe(500);
    expect(r2.statut, r2.texte).not.toBe(500);
    expect([r1.statut, r2.statut]).toContain(200);

    const blocs = await lireBlockScores(c(), jeu.mission.id);
    const unites = await lireUnitScores(c(), jeu.mission.id);
    expect(blocs).toHaveLength(2);
    expect(unites).toHaveLength(6);
    expect(nombreOuNull(ligneBloc(blocs, 'bloc_1').score)).toBe(2.32);
  });
});

// =============================================================================
// 4. INVARIANT 7 — rien n'est écrasé en silence, le remplacement est tracé
// =============================================================================
describe('@critique invariant 7 — aucune réponse touchée, remplacement tracé dans `activity_log`', () => {
  it('@critique calculer ne MODIFIE aucune réponse et n’écrit aucune révision', async () => {
    const jeu = await semerJeuPrincipal(c());
    const instantane = async (): Promise<string> => {
      const r = await c().bd.query(
        `SELECT a.id, a.value, a.withheld, a.not_applicable, a.revision, a.updated_at
           FROM answers a JOIN interviews i ON i.id = a.interview_id
          WHERE i.mission_id = $1 ORDER BY a.id`,
        [jeu.mission.id],
      );
      return JSON.stringify(r.rows);
    };
    const revisions = async (): Promise<number> => {
      const r = await c().bd.query<{ n: string }>(
        `SELECT count(*) AS n FROM answer_revisions ar
           JOIN answers a ON a.id = ar.answer_id
           JOIN interviews i ON i.id = a.interview_id WHERE i.mission_id = $1`,
        [jeu.mission.id],
      );
      return Number(r.rows[0]?.n);
    };
    const avant = await instantane();
    const revisionsAvant = await revisions();
    expect(avant.length).toBeGreaterThan(100); // vacuité : on a bien comparé quelque chose

    await calculerEnAdmin(jeu);
    await calculerEnAdmin(jeu);

    expect(await instantane()).toBe(avant);
    expect(await revisions()).toBe(revisionsAvant);
  });

  it('@critique une réponse CORRIGÉE compte UNE fois (réponse courante, pas l’archive des révisions)', async () => {
    const jeu = await semerJeuPrincipal(c());
    // On archive l'ancienne valeur de Q2/A2 comme le ferait la sync, puis on corrige.
    await c().bd.query(
      `INSERT INTO answer_revisions (id, entity_type, entity_id, answer_id, previous_value, changed_by, change_origin)
       VALUES ($1, 'answer', $2, $2, $3::jsonb, $4, 'correction_siege')`,
      [uuidv7(), jeu.reponses.a2q2, JSON.stringify({ type: 'scale_1_5', v: 1 }), jeu.lead.id],
    );
    await corrigerReponse(c(), jeu.reponses.a2q2, { type: 'scale_1_5', v: 4 });
    await calculerEnAdmin(jeu);
    const unites = await lireUnitScores(c(), jeu.mission.id);
    // Si l'archive (valeur 1) était lue en plus : Q2/A = moyenne(4 ; 4 ; 1) = 3 → 3,2 et non 3,4.
    expect(nombreOuNull(ligneUnite(unites, jeu.unites.a, 'bloc_1').score)).toBe(3.4);
  });

  it('@critique chaque calcul laisse UNE ligne `mission.compute_scores` ; le 2e nomme le calcul qu’il remplace', async () => {
    const jeu = await semerJeuPrincipal(c());
    const lignes = async (): Promise<LigneJournal[]> =>
      (
        await c().bd.query<LigneJournal>(
          `SELECT user_id, entity_type, entity_id, meta FROM activity_log
            WHERE action = 'mission.compute_scores' AND entity_id = $1 ORDER BY created_at, id`,
          [jeu.mission.id],
        )
      ).rows;

    expect(await lignes()).toHaveLength(0);

    const premier = await calculer(c(), jeu.mission.id, jeu.lead.jeton);
    expect(premier.statut, premier.texte).toBe(200);
    const apres1 = await lignes();
    expect(apres1).toHaveLength(1);
    expect(apres1[0]).toMatchObject({
      user_id: jeu.lead.id,
      entity_type: 'mission',
      entity_id: jeu.mission.id,
    });
    // Premier calcul : rien à remplacer.
    expect(apres1[0]?.meta?.calcul_precedent_le).toBeNull();
    const calcul1 = (premier.json as unknown as CorpsCalcul).calculeLe;

    const second = await calculer(c(), jeu.mission.id, jeu.admin.jeton);
    expect(second.statut, second.texte).toBe(200);
    const apres2 = await lignes();
    expect(apres2).toHaveLength(2);
    expect(apres2[1]?.user_id).toBe(jeu.admin.id);
    // Le 2e calcul porte l'horodatage de celui qu'il remplace (ISO UTC, à la milliseconde).
    expect(new Date(String(apres2[1]?.meta?.calcul_precedent_le)).toISOString()).toBe(
      new Date(calcul1).toISOString(),
    );
  });

  it('@critique la trace ne contient ni nom d’unité, ni valeur de réponse, ni montant (11 §2)', async () => {
    const jeu = await semerJeuPrincipal(c());
    await calculerEnAdmin(jeu);
    const r = await c().bd.query<{ meta: unknown }>(
      `SELECT meta FROM activity_log WHERE action = 'mission.compute_scores' AND entity_id = $1`,
      [jeu.mission.id],
    );
    expect(r.rows).toHaveLength(1);
    const texte = JSON.stringify(r.rows[0]?.meta ?? null);
    for (const interdit of [
      'Unité A',
      'Unité B',
      'Unité racine',
      'Question fictive',
      '"oui"',
      '"non"',
    ]) {
      expect(texte).not.toContain(interdit);
    }
  });

  it('@critique un calcul REFUSÉ ne laisse aucune ligne `mission.compute_scores`', async () => {
    const jeu = await semerJeuPrincipal(c());
    const simple = await creerCompte(c(), 'consultant', 'trace-refus');
    await rattacher(c(), jeu.mission.id, simple.id, 'consultant');
    const refus = await calculer(c(), jeu.mission.id, simple.jeton);
    expect(refus.statut).toBe(403);
    const r = await c().bd.query<{ n: string }>(
      `SELECT count(*) AS n FROM activity_log WHERE action = 'mission.compute_scores' AND entity_id = $1`,
      [jeu.mission.id],
    );
    expect(Number(r.rows[0]?.n)).toBe(0);
  });
});

// =============================================================================
// 5. INVARIANT 3 — ÉTANCHÉITÉ FINANCIÈRE
// =============================================================================
describe('@critique invariant 3 — aucun montant de `scoping_financials` dans le calcul', () => {
  it('@critique ni la réponse, ni `details`, ni `unit_scores`, ni la trace ne portent une sentinelle financière', async () => {
    const jeu = await semerJeuPrincipal(c());
    const cadrage = uuidv7();
    await c().bd.query(
      `INSERT INTO scoping_estimates (id, company_id, mission_id, workload_days, team_size,
                                      calendar_days, status, created_by)
       VALUES ($1, $2, $3, 18, 3, 30, 'brouillon', $4)`,
      [cadrage, jeu.mission.companyId, jeu.mission.id, jeu.admin.id],
    );
    await semerVoletFinancierSentinelle(c().bd, cadrage, jeu.admin.id);

    // Les deux profils autorisés : l'admin (qui PEUT voir les montants ailleurs) et le lead.
    for (const jeton of [jeu.admin.jeton, jeu.lead.jeton]) {
      const reponse = await calculer(c(), jeu.mission.id, jeton);
      expect(reponse.statut, reponse.texte).toBe(200);
      // VACUITÉ : le corps est bien un vrai résultat, pas une enveloppe vide.
      expect(reponse.texte).toContain('drapeauxRouges');
      expect(detecterSentinelles(reponse.texte, VALEURS_SENTINELLES)).toEqual([]);
      for (const interdit of NOMS_FINANCIERS_INTERDITS) {
        expect(reponse.texte, `la réponse nomme « ${interdit} »`).not.toContain(interdit);
      }
    }

    const blocs = await lireBlockScores(c(), jeu.mission.id);
    const unites = await lireUnitScores(c(), jeu.mission.id);
    const trace = await c().bd.query(
      `SELECT meta FROM activity_log WHERE action = 'mission.compute_scores' AND entity_id = $1`,
      [jeu.mission.id],
    );
    const toutesLesEcritures = JSON.stringify({ blocs, unites, trace: trace.rows });
    expect(toutesLesEcritures.length).toBeGreaterThan(500); // vacuité
    expect(detecterSentinelles(toutesLesEcritures, VALEURS_SENTINELLES)).toEqual([]);
    for (const interdit of NOMS_FINANCIERS_INTERDITS) {
      expect(toutesLesEcritures, `une écriture nomme « ${interdit} »`).not.toContain(interdit);
    }
  });

  it('@critique une réponse de type `money` est LÉGITIME (parole d’un interviewé) : elle n’active aucune alarme financière', async () => {
    const admin = await creerCompte(c(), 'admin', 'money');
    const mission = await semerMission(c());
    const unite = await semerUnite(c(), { missionId: mission.id, nom: 'Unité money', effectif: 5 });
    const session = await semerSession(c(), {
      missionId: mission.id,
      orgUnitId: unite,
      conduitPar: admin.id,
    });
    const q = await semerQuestionFigee(c(), {
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Montant déclaré',
      position: 1,
      typeReponse: 'number',
      poids: 0,
      criticite: 'informatif',
      scoring: {},
    });
    await semerReponse(c(), {
      interviewId: session,
      missionQuestionId: q,
      valeur: { type: 'number', v: 4242 },
    });
    const reponse = await calculer(c(), mission.id, admin.jeton);
    expect(reponse.statut, reponse.texte).toBe(200);
    // Poids 0 : donnée factuelle hors scoring (§32.1) — pas de score, et pas d'erreur.
    const blocs = await lireBlockScores(c(), mission.id);
    expect(blocs).toHaveLength(2);
    expect(blocs.every((b) => b.score === null)).toBe(true);
  });
});
