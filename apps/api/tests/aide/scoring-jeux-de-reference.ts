// =============================================================================
// LES JEUX DE DONNÉES DE RÉFÉRENCE DU SCORING — FIGÉS, ET LEURS SCORES ÉCRITS.
// Lot L8. Critère d'acceptation (07, ligne L8) : « jeux de données de référence
// figés → scores identiques ; un drapeau rouge n'est jamais masqué par la moyenne ».
//
// ── POURQUOI LES ATTENDUS SONT ÉCRITS À LA MAIN, PAS RECALCULÉS ─────────────
// Un test qui recalcule l'attendu avec la logique testée est un test qui ne teste
// rien : il reste vert quand la formule change. Chaque nombre de ce fichier a été
// posé À LA MAIN depuis les formules du §32.1, et le calcul est écrit en toutes
// lettres à côté. Si le moteur change de réponse, c'est le moteur qui a bougé —
// et il faudra un arbitrage, pas une mise à jour d'attendu.
//
// C'est aussi le repli du §35.3 : « à défaut, calcul manuel sur l'export selon les
// formules §32.1 (tableur) ». Les calculs ci-dessous SONT ce tableau-là.
//
// ── INVARIANT 2 — AUCUNE RÉFÉRENCE CLIENT ──────────────────────────────────
// Trois jeux, quatre identifiants lisibles, zéro nom d'entreprise. Les archétypes
// nommés (`FIL-TPE`, `FIL-GC`) sont ceux du pack lui-même (09 §4bis) : des
// MISSIONS FICTIVES canoniques, pas des clients. Tous les UUID sont synthétiques
// et déterministes (`uid()` ci-dessous) : aucun `uuidv7()` n'est appelé, sinon
// deux exécutions ne produiraient pas le même jeu — et « scores identiques »
// exige des ENTRÉES identiques avant d'exiger des sorties identiques.
//
// ── CE FICHIER VIT HORS DE `src/` ───────────────────────────────────────────
// `apps/api/tests/aide/` : c'est de l'outillage de test, pas du code livré. Le
// mettre dans `apps/api/src/scoring/**` l'aurait fait entrer dans le glob de
// couverture des modules critiques, où il aurait gonflé la mesure sans rien
// prouver — une couverture vraie sur ce qu'elle observe, qui répond à une autre
// question que celle posée.
// =============================================================================
import type { EntreeScoring, QuestionFigee, ReponseACoter, UnitePourScoring } from '../../src/scoring/entree.js';

// -----------------------------------------------------------------------------
// UUID SYNTHÉTIQUES — déterministes, valides, et reconnaissables à l'œil
// -----------------------------------------------------------------------------

/**
 * Fabrique un UUID v7 SYNTHÉTIQUE à partir d'un compteur.
 *
 * Forme : `01900000-0000-7000-8000-XXXXXXXXXXXX`. Le nibble de version (`7`) et
 * le variant (`8`) sont ceux d'un v7 réel — les schémas Zod `z.uuid()` du contrat
 * l'acceptent donc — mais la valeur ne sort d'aucune horloge : elle sort de
 * l'index. C'est ce qui rend un jeu de référence REJOUABLE.
 */
export function uid(n: number): string {
  return `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Les paramètres du seed 11 §5 — `seuil_completude_bloc` 0,60 · `seuil_divergence_ecart_type` 1,5. */
export const PARAMETRES_SEED = {
  seuilCompletudeBloc: 0.6,
  seuilDivergenceEcartType: 1.5,
} as const;

/** Le barème de bandes du §32.1, repris tel quel de l'exemple normatif du pack. */
const BANDES_DU_PACK = [{ max: 20, score: 1 }, { max: 50, score: 3 }, { score: 5 }];

/** Trois options cotées 1 / 3 / 5 — le cas normé du 04 §7.3. */
const OPTIONS_1_3_5 = [
  { code: 'opt_a', label: 'Option A', score: 1 },
  { code: 'opt_b', label: 'Option B', score: 3 },
  { code: 'opt_c', label: 'Option C', score: 5 },
];

// =============================================================================
// JEU 1 — « FIL-TPE-S » : UNE UNITÉ, LES ONZE TYPES DE RÉPONSE, TOUT À LA MAIN
// =============================================================================
//
// Une micro-entreprise fictive (archétype FIL-TPE : 8 personnes, un entretien).
// Une seule unité : le roll-up §32.1-4 est trivial, et c'est voulu — ce jeu teste
// le BARÈME et la COMPLÉTUDE, pas l'arbre. L'arbre est le jeu 2.
//
// ── LES DOUZE QUESTIONS, ET CE QUE CHACUNE PROUVE ──────────────────────────
//   Q01 yes_no       p1  map oui=5      → répondu « oui »            → 5
//   Q02 scale_1_5    p2  identity       → répondu 4                  → 4   (poids ≠ 1)
//   Q03 single_choice p1 options        → répondu « opt_b »          → 3
//   Q04 multi_choice p1  options + max  → répondu [a, b]             → 3   (max(1,3))
//   Q05 multi_choice p1  options + mean → répondu [a, c]             → 3   (moy(1,5))
//   Q06 number       p1  bandes         → répondu 60                 → 5   (bande ouverte)
//   Q07 percent      p1  bandes         → FOURCHETTE [20 ; 80]       → 1   (BORNE BASSE, §27.4)
//   Q08 free_text    p0  aucun barème   → répondu du texte           → hors_bareme
//   Q09 yes_no       p1  map + red_flag → répondu « non », BLOQUANT   → 0 + DRAPEAU ROUGE
//   Q10 scale_1_5    p1  identity+below → NON COMMUNIQUÉ, BLOQUANT    → §27.4 + anomalie
//   Q11 number       p1  bandes         → AUCUNE RÉPONSE              → non répondue
//   Q12 scale_1_5    p1  identity       → SANS OBJET (N/A)            → hors numérateur ET dénominateur
//
// ── LES CALCULS, POSÉS ─────────────────────────────────────────────────────
// bloc_1 — questions scorables : Q01, Q02, Q03, Q09, Q11 (Q08 pèse 0 : pas posée)
//   score  = (1×5 + 2×4 + 1×3 + 1×0) / (1 + 2 + 1 + 1) = 16 / 5 = 3,2
//   posées 5 · cotées 4 · non répondues 1 · ratio 4/5 = 0,80
// bloc_2 — questions scorables : Q04, Q05, Q06, Q07, Q10, Q12
//   score  = (1×3 + 1×3 + 1×5 + 1×1) / 4 = 12 / 4 = 3,0
//   posées 6 · cotées 4 · non communiquée 1 · sans objet 1 · ratio 4/(6−1) = 0,80
// unité (§32.1-2 appliqué à l'union des blocs — les POIDS pondèrent, pas les blocs)
//   score  = (5 + 8 + 3 + 0 + 3 + 3 + 5 + 1) / (1+2+1+1 + 1+1+1+1) = 28 / 9 = 3,111…
//   posées 11 · cotées 8 · NC 1 · SO 1 · NR 1  (8+1+1+1 = 11 : la partition somme)
//   ratio  = 8 / (11 − 1) = 0,80
// mission — une seule racine : le roll-up rend exactement le score de l'unité.
// =============================================================================

const TPE_MISSION = uid(0x1000);
const TPE_UNITE = uid(0x1001);
const TPE_ENTRETIEN = uid(0x1002);
const q = (n: number): string => uid(0x1100 + n);
const r = (n: number): string => uid(0x1200 + n);

/** Les identifiants du jeu 1, exposés pour que les tests désignent une question par son rôle. */
export const TPE = {
  missionId: TPE_MISSION,
  uniteId: TPE_UNITE,
  entretienId: TPE_ENTRETIEN,
  q01: q(1),
  q02: q(2),
  q03: q(3),
  q04: q(4),
  q05: q(5),
  q06: q(6),
  q07: q(7),
  q08: q(8),
  q09: q(9),
  q10: q(10),
  q11: q(11),
  q12: q(12),
  reponseDrapeauRouge: r(9),
} as const;

const TPE_QUESTIONS: readonly QuestionFigee[] = [
  {
    missionQuestionId: q(1),
    blocCode: 'bloc_1',
    answerType: 'yes_no',
    weight: '1',
    scoring: { map: { oui: 5, non: 0 } },
    options: null,
    criticality: 'important',
  },
  {
    missionQuestionId: q(2),
    blocCode: 'bloc_1',
    answerType: 'scale_1_5',
    weight: '2',
    scoring: { map: 'identity' },
    options: null,
    criticality: 'important',
  },
  {
    missionQuestionId: q(3),
    blocCode: 'bloc_1',
    answerType: 'single_choice',
    weight: '1',
    scoring: { source: 'options' },
    options: OPTIONS_1_3_5,
    criticality: 'important',
  },
  {
    missionQuestionId: q(4),
    blocCode: 'bloc_2',
    answerType: 'multi_choice',
    weight: '1',
    scoring: { source: 'options', aggregate: 'max' },
    options: OPTIONS_1_3_5,
    criticality: 'important',
  },
  {
    missionQuestionId: q(5),
    blocCode: 'bloc_2',
    answerType: 'multi_choice',
    weight: '1',
    scoring: { source: 'options', aggregate: 'mean' },
    options: OPTIONS_1_3_5,
    criticality: 'important',
  },
  {
    missionQuestionId: q(6),
    blocCode: 'bloc_2',
    answerType: 'number',
    weight: '1',
    scoring: { bands: BANDES_DU_PACK },
    options: null,
    criticality: 'important',
  },
  {
    missionQuestionId: q(7),
    blocCode: 'bloc_2',
    answerType: 'percent',
    weight: '1',
    scoring: { bands: BANDES_DU_PACK },
    options: null,
    criticality: 'important',
  },
  {
    missionQuestionId: q(8),
    blocCode: 'bloc_1',
    answerType: 'free_text',
    weight: '0',
    scoring: null,
    options: null,
    criticality: 'informatif',
  },
  {
    missionQuestionId: q(9),
    blocCode: 'bloc_1',
    answerType: 'yes_no',
    weight: '1',
    scoring: { map: { oui: 5, non: 0 }, red_flag: { values: ['non'] } },
    options: null,
    criticality: 'bloquant',
  },
  {
    missionQuestionId: q(10),
    blocCode: 'bloc_2',
    answerType: 'scale_1_5',
    weight: '1',
    scoring: { map: 'identity', red_flag: { below: 2 } },
    options: null,
    criticality: 'bloquant',
  },
  {
    missionQuestionId: q(11),
    blocCode: 'bloc_1',
    answerType: 'number',
    weight: '1',
    scoring: { bands: BANDES_DU_PACK },
    options: null,
    criticality: 'important',
  },
  {
    missionQuestionId: q(12),
    blocCode: 'bloc_2',
    answerType: 'scale_1_5',
    weight: '1',
    scoring: { map: 'identity' },
    options: null,
    criticality: 'important',
  },
];

function reponseTpe(
  n: number,
  value: unknown,
  extra: { withheld?: boolean; notApplicable?: boolean } = {},
): ReponseACoter {
  return {
    id: r(n),
    interviewId: TPE_ENTRETIEN,
    missionQuestionId: q(n),
    orgUnitId: TPE_UNITE,
    value,
    withheld: extra.withheld ?? false,
    notApplicable: extra.notApplicable ?? false,
    groupeInterlocuteur: 'direction',
  };
}

const TPE_REPONSES: readonly ReponseACoter[] = [
  reponseTpe(1, { type: 'yes_no', v: 'oui' }),
  reponseTpe(2, { type: 'scale_1_5', v: 4 }),
  reponseTpe(3, { type: 'single_choice', v: 'opt_b' }),
  reponseTpe(4, { type: 'multi_choice', v: ['opt_a', 'opt_b'] }),
  reponseTpe(5, { type: 'multi_choice', v: ['opt_a', 'opt_c'] }),
  reponseTpe(6, { type: 'number', v: 60 }),
  // La FOURCHETTE du §27.4 : le score s'évalue sur la BORNE BASSE (prudence).
  // 20 tombe dans la bande « max: 20 » → 1, et non 5 comme le ferait la borne haute.
  reponseTpe(7, { type: 'range', low: 20, high: 80 }),
  reponseTpe(8, { type: 'free_text', v: 'Deux tableurs et une boîte aux lettres partagée.' }),
  reponseTpe(9, { type: 'yes_no', v: 'non' }),
  reponseTpe(10, null, { withheld: true }),
  // Q11 : AUCUNE LIGNE. C'est le quatrième état — personne ne l'a posée.
  reponseTpe(12, null, { notApplicable: true }),
];

export const JEU_TPE: EntreeScoring = {
  missionId: TPE_MISSION,
  parametres: PARAMETRES_SEED,
  blocs: ['bloc_1', 'bloc_2'],
  unites: [{ id: TPE_UNITE, parentId: null, headcount: 8, inScope: true }],
  questions: TPE_QUESTIONS,
  reponses: TPE_REPONSES,
};

/** Les attendus du jeu 1, ÉCRITS. Aucun n'est recalculé par le test. */
export const ATTENDU_TPE = {
  bloc1: { score: 3.2, posees: 5, cotees: 4, nonRepondues: 1, ratio: 0.8, poidsTotal: 5 },
  bloc2: {
    score: 3,
    posees: 6,
    cotees: 4,
    nonCommuniquees: 1,
    sansObjet: 1,
    ratio: 0.8,
    poidsTotal: 4,
  },
  unite: { score: 3.11, posees: 11, cotees: 8, nonCommuniquees: 1, sansObjet: 1, nonRepondues: 1, ratio: 0.8 },
  mission: { score: 3.11, ratio: 0.8 },
  drapeauxRouges: 1,
} as const;

// =============================================================================
// JEU 2 — « FIL-GC-S » : 150 UNITÉS, 4 NIVEAUX, UN SEUL DRAPEAU ROUGE AU FOND
// =============================================================================
//
// L'arbre canonique du 09 §4bis : 1 groupe + 5 filiales + 24 directions +
// 120 services = 150 unités sur 4 niveaux. Les entretiens ont lieu dans les
// SERVICES uniquement (feuilles) : c'est le cas réel, et cela rend le roll-up
// §32.1-4 lisible de bout en bout.
//
// ── LA CONSTRUCTION, FAITE POUR QUE L'ARITHMÉTIQUE SOIT EXACTE ─────────────
// Chaque direction porte 5 services d'effectif 10 (donc de POIDS ÉGAL) ; chaque
// service j ∈ {0..4} répond de façon déterminée par j, jamais par son index global.
// Toutes les directions sont donc identiques — sauf une, celle du drapeau rouge.
//   · QA `scale_1_5` poids 1, bloc_1 → j+1               → 1, 2, 3, 4, 5
//   · QB `yes_no`    poids 2, bloc_2 → « oui » si j < 3   → 5, 5, 5, 0, 0
//   · QC `number`    poids 1, bloc_3, BLOQUANT, red_flag {below: 2}
//                    → 100 partout (bande ouverte → 5), SAUF le service n° 77
//                      qui répond 10 (bande « max: 20 » → 1) → DRAPEAU ROUGE.
//
// score d'un service = (1×QA + 2×QB + 1×QC) / 4
//   j=0 (1+10+5)/4 = 4      j=1 (2+10+5)/4 = 4,25    j=2 (3+10+5)/4 = 4,5
//   j=3 (4+ 0+5)/4 = 2,25   j=4 (5+ 0+5)/4 = 2,5     → somme 17,5 → direction 3,5
//
// Le service n° 77 : direction ⌊77/5⌋ = 15, rang j = 77 mod 5 = 2.
//   son score devient (3+10+1)/4 = 3,5 au lieu de 4,5 → direction 15 = 16,5/5 = 3,3
//
// Filiales (F1..F4 : 5 directions ; F5 : 4 directions ; direction = effectif 50)
//   F1 = F2 = F3 = F5 = 3,5   ·   F4 ∋ direction 15 → (3,3+3,5×4)/5 = 17,3/5 = 3,46
// Groupe (effectifs de filiale : 250, 250, 250, 250, 200)
//   (250×3,5 ×3 + 250×3,46 + 200×3,5) / 1200 = (2625 + 865 + 700) / 1200
//                                            = 4190 / 1200 = 3,49166… → 3,49
//
// Par bloc, au niveau groupe :
//   bloc_1 = 3 (moyenne de 1..5, partout)   ·   bloc_2 = 3 (moyenne de 5,5,5,0,0)
//   bloc_3 : 5 partout, sauf direction 15 = (5+5+1+5+5)/5 = 4,2 → F4 = 24,2/5 = 4,84
//            groupe = (250×5×3 + 250×4,84 + 200×5)/1200 = 5960/1200 = 4,9666… → 4,97
//   contrôle : (1×3 + 2×3 + 1×4,96666)/4 = 13,96666/4 = 3,49166 ✓ (même nombre par deux chemins)
//
// ── COMPLÉTUDE — LES PARENTS N'ONT PAS D'ENTRETIEN, ET ÇA SE VOIT ──────────
// 3 questions posées à chacune des 150 unités = 450 ; 120 services × 3 = 360 cotées.
//   mission → 360 / 450 = 0,80 exactement   (≥ 0,60 : le score n'est PAS indicatif)
//   direction → 6 unités × 3 = 18 posées, 15 cotées = 0,8333…
//   filiale F1 → 31 unités × 3 = 93 posées, 75 cotées = 0,80645…
//
// ── LE PARAMÈTRE `repliques` ───────────────────────────────────────────────
// À `repliques = k`, chaque question est dupliquée k fois à l'identique (mêmes
// poids, mêmes réponses), les copies portant `criticality: 'important'` et AUCUN
// `red_flag`. Toutes les moyennes pondérées sont inchangées — un multiensemble
// répété k fois a la même moyenne — donc **les scores attendus ci-dessus valent
// pour k = 1 comme pour k = 20**, à 360 réponses comme à 7 200. C'est ce qui rend
// l'épreuve d'échelle comparable aux valeurs écrites plutôt qu'à elle-même.
// =============================================================================

const GC_MISSION = uid(0x2000);

/** Dimensions de l'arbre FIL-GC (09 §4bis), reprises telles quelles. */
export const GC_DIMENSIONS = {
  groupes: 1,
  filiales: 5,
  directions: 24,
  services: 120,
  unites: 150,
  niveaux: 4,
  /** Les 5 directions de F1..F4, puis 4 pour F5 : 5×4 + 4 = 24. */
  directionsParFiliale: [5, 5, 5, 5, 4],
  servicesParDirection: 5,
  effectifService: 10,
  effectifDirection: 50,
  /** L'index GLOBAL du service qui porte le drapeau rouge. */
  serviceDuDrapeauRouge: 77,
} as const;

const gcRacine = uid(0x2001);
const gcFiliale = (f: number): string => uid(0x2100 + f);
const gcDirection = (d: number): string => uid(0x2200 + d);
const gcService = (s: number): string => uid(0x2400 + s);
const gcEntretien = (s: number): string => uid(0x3000 + s);
const gcQuestion = (rep: number, k: number): string => uid(0x4000 + rep * 8 + k);
const gcReponse = (s: number, rep: number, k: number): string => uid(0x10000 + s * 256 + rep * 8 + k);

export const GC = {
  missionId: GC_MISSION,
  racineId: gcRacine,
  filialeId: gcFiliale,
  directionId: gcDirection,
  serviceId: gcService,
  /** La direction qui contient le service n° 77 : ⌊77 / 5⌋ = 15. */
  directionDegradee: gcDirection(15),
  /** F4 (index 3) : ses directions sont 15 à 19. */
  filialeDegradee: gcFiliale(3),
} as const;

/** Construit l'arbre des 150 unités — parents avant enfants. */
function arbreGc(): UnitePourScoring[] {
  const unites: UnitePourScoring[] = [
    { id: gcRacine, parentId: null, headcount: 1200, inScope: true },
  ];
  const effectifFiliale = GC_DIMENSIONS.directionsParFiliale.map(
    (n) => n * GC_DIMENSIONS.effectifDirection,
  );
  for (let f = 0; f < GC_DIMENSIONS.filiales; f += 1) {
    unites.push({
      id: gcFiliale(f),
      parentId: gcRacine,
      headcount: effectifFiliale[f] ?? 0,
      inScope: true,
    });
  }
  let d = 0;
  for (let f = 0; f < GC_DIMENSIONS.filiales; f += 1) {
    for (let i = 0; i < (GC_DIMENSIONS.directionsParFiliale[f] ?? 0); i += 1) {
      unites.push({
        id: gcDirection(d),
        parentId: gcFiliale(f),
        headcount: GC_DIMENSIONS.effectifDirection,
        inScope: true,
      });
      d += 1;
    }
  }
  for (let s = 0; s < GC_DIMENSIONS.services; s += 1) {
    unites.push({
      id: gcService(s),
      parentId: gcDirection(Math.floor(s / GC_DIMENSIONS.servicesParDirection)),
      headcount: GC_DIMENSIONS.effectifService,
      inScope: true,
    });
  }
  return unites;
}

/**
 * Le jeu FIL-GC à `repliques` copies de chaque question.
 *
 * `repliques = 1` (défaut) : 3 questions, 360 réponses — le jeu de référence.
 * `repliques = 20` : 60 questions, 7 200 réponses — la même mission à l'échelle,
 * avec LES MÊMES SCORES ATTENDUS.
 */
export function jeuGc(repliques = 1): EntreeScoring {
  const questions: QuestionFigee[] = [];
  for (let rep = 0; rep < repliques; rep += 1) {
    const original = rep === 0;
    questions.push(
      {
        missionQuestionId: gcQuestion(rep, 0),
        blocCode: 'bloc_1',
        answerType: 'scale_1_5',
        weight: '1',
        scoring: { map: 'identity' },
        options: null,
        criticality: 'important',
      },
      {
        missionQuestionId: gcQuestion(rep, 1),
        blocCode: 'bloc_2',
        answerType: 'yes_no',
        weight: '2',
        scoring: { map: { oui: 5, non: 0 } },
        options: null,
        criticality: 'important',
      },
      {
        missionQuestionId: gcQuestion(rep, 2),
        blocCode: 'bloc_3',
        answerType: 'number',
        weight: '1',
        scoring: original
          ? { bands: BANDES_DU_PACK, red_flag: { below: 2 } }
          : { bands: BANDES_DU_PACK },
        options: null,
        criticality: original ? 'bloquant' : 'important',
      },
    );
  }

  const reponses: ReponseACoter[] = [];
  for (let s = 0; s < GC_DIMENSIONS.services; s += 1) {
    const j = s % GC_DIMENSIONS.servicesParDirection;
    const valeurQc = s === GC_DIMENSIONS.serviceDuDrapeauRouge ? 10 : 100;
    for (let rep = 0; rep < repliques; rep += 1) {
      reponses.push(
        {
          id: gcReponse(s, rep, 0),
          interviewId: gcEntretien(s),
          missionQuestionId: gcQuestion(rep, 0),
          orgUnitId: gcService(s),
          value: { type: 'scale_1_5', v: j + 1 },
          withheld: false,
          notApplicable: false,
          groupeInterlocuteur: j < 2 ? 'encadrement' : 'terrain',
        },
        {
          id: gcReponse(s, rep, 1),
          interviewId: gcEntretien(s),
          missionQuestionId: gcQuestion(rep, 1),
          orgUnitId: gcService(s),
          value: { type: 'yes_no', v: j < 3 ? 'oui' : 'non' },
          withheld: false,
          notApplicable: false,
          groupeInterlocuteur: j < 2 ? 'encadrement' : 'terrain',
        },
        {
          id: gcReponse(s, rep, 2),
          interviewId: gcEntretien(s),
          missionQuestionId: gcQuestion(rep, 2),
          orgUnitId: gcService(s),
          value: { type: 'number', v: valeurQc },
          withheld: false,
          notApplicable: false,
          groupeInterlocuteur: j < 2 ? 'encadrement' : 'terrain',
        },
      );
    }
  }

  return {
    missionId: GC_MISSION,
    parametres: PARAMETRES_SEED,
    blocs: ['bloc_1', 'bloc_2', 'bloc_3'],
    unites: arbreGc(),
    questions,
    reponses,
  };
}

/** Les attendus du jeu 2, ÉCRITS — et valables à toute valeur de `repliques`. */
export const ATTENDU_GC = {
  mission: { score: 3.49, ratio: 0.8, indicatif: false },
  blocsMission: { bloc_1: 3, bloc_2: 3, bloc_3: 4.97 },
  /** Une direction ordinaire : 5 services de poids égal, moyenne 17,5 / 5. */
  directionOrdinaire: { score: 3.5, ratio: 15 / 18 },
  /** La direction n° 15, dégradée par le service n° 77 : 16,5 / 5. */
  directionDegradee: { score: 3.3, bloc_3: 4.2 },
  /** F4 : (3,3 + 3,5 × 4) / 5. */
  filialeDegradee: { score: 3.46, bloc_3: 4.84 },
  filialeOrdinaire: { score: 3.5 },
  /** Un service au rang j = 3 : (4 + 0 + 5) / 4. */
  serviceRang3: { score: 2.25 },
  drapeauxRouges: 1,
} as const;

// =============================================================================
// JEU 3 — « ROLL-UP » : LE PARENT QUI A SES PROPRES RÉPONSES, ET LE `headcount`
//         NULL QUI PÈSE 1
// =============================================================================
//
// Trois unités, une question `scale_1_5` de poids 1 :
//   P  effectif 20   répond 5     ·   C1 effectif 30 répond 2   ·   C2 effectif NULL répond 4
//
// consolidé(P) = (20×5 + 30×2 + 1×4) / (20 + 30 + 1) = (100 + 60 + 4) / 51
//              = 164 / 51 = 3,21568… → 3,22
//
// Le terme « 1×4 » est la règle §32.1-4 : « headcount NULL → poids 1 ». Le terme
// « 20×5 » est le PARENT LUI-MÊME, compté comme un terme de sa propre
// consolidation — lecture documentée dans l'en-tête de `agregation.ts` et portée
// à `DECISIONS.md` (le §32.1-4 dit « moyenne pondérée par headcount des enfants »
// et ne dit pas ce que devient un parent interrogé pour lui-même ; l'ignorer
// ferait disparaître ses réponses du score, ce qu'aucune lecture ne peut vouloir).
// =============================================================================

const RU_MISSION = uid(0x5000);
export const ROLLUP = {
  missionId: RU_MISSION,
  parent: uid(0x5001),
  enfantAvecEffectif: uid(0x5002),
  enfantSansEffectif: uid(0x5003),
  question: uid(0x5010),
} as const;

const questionRollup: QuestionFigee = {
  missionQuestionId: ROLLUP.question,
  blocCode: 'bloc_1',
  answerType: 'scale_1_5',
  weight: '1',
  scoring: { map: 'identity' },
  options: null,
  criticality: 'important',
};

function reponseRollup(n: number, uniteId: string, v: number): ReponseACoter {
  return {
    id: uid(0x5020 + n),
    interviewId: uid(0x5030 + n),
    missionQuestionId: ROLLUP.question,
    orgUnitId: uniteId,
    value: { type: 'scale_1_5', v },
    withheld: false,
    notApplicable: false,
  };
}

export const JEU_ROLLUP: EntreeScoring = {
  missionId: RU_MISSION,
  parametres: PARAMETRES_SEED,
  blocs: ['bloc_1'],
  unites: [
    { id: ROLLUP.parent, parentId: null, headcount: 20, inScope: true },
    { id: ROLLUP.enfantAvecEffectif, parentId: ROLLUP.parent, headcount: 30, inScope: true },
    { id: ROLLUP.enfantSansEffectif, parentId: ROLLUP.parent, headcount: null, inScope: true },
  ],
  questions: [questionRollup],
  reponses: [
    reponseRollup(1, ROLLUP.parent, 5),
    reponseRollup(2, ROLLUP.enfantAvecEffectif, 2),
    reponseRollup(3, ROLLUP.enfantSansEffectif, 4),
  ],
};

export const ATTENDU_ROLLUP = {
  parentPropre: 5,
  enfantAvecEffectif: 2,
  enfantSansEffectif: 4,
  parentConsolide: 3.22,
  mission: 3.22,
} as const;

// =============================================================================
// JEU 4 — « LE SCORE PARFAIT QUI CACHE UN POINT CRITIQUE »
// =============================================================================
//
// Le jeu qui matérialise le critère d'acceptation du lot, et le seul dont l'énoncé
// tient en une phrase : dix questions parfaites, une question bloquante au rouge,
// et le score global reste 5,00 sur 5.
//
// La question bloquante porte un **poids 0**. Elle est donc, PAR CONSTRUCTION,
// absente de tous les dénominateurs : elle n'entre ni dans `posees`, ni dans la
// somme des poids, ni dans la complétude. C'est le cas où « masquer » serait le
// plus facile — et le drapeau sort quand même, parce que le §32.1 conditionne le
// drapeau rouge à la CRITICITÉ (`bloquant`) et à rien d'autre. Le poids gouverne
// la moyenne, le barème gouverne le score, la criticité gouverne le drapeau : trois
// leviers séparés, et c'est cette séparation qui rend le masquage impossible.
// =============================================================================

const PARFAIT_MISSION = uid(0x6000);
export const PARFAIT = {
  missionId: PARFAIT_MISSION,
  uniteId: uid(0x6001),
  questionBloquante: uid(0x60ff),
  reponseBloquante: uid(0x61ff),
} as const;

const PARFAIT_QUESTIONS: QuestionFigee[] = [];
const PARFAIT_REPONSES: ReponseACoter[] = [];
for (let i = 0; i < 10; i += 1) {
  PARFAIT_QUESTIONS.push({
    missionQuestionId: uid(0x6010 + i),
    blocCode: 'bloc_1',
    answerType: 'scale_1_5',
    weight: '1',
    scoring: { map: 'identity' },
    options: null,
    criticality: 'important',
  });
  PARFAIT_REPONSES.push({
    id: uid(0x6030 + i),
    interviewId: uid(0x6002),
    missionQuestionId: uid(0x6010 + i),
    orgUnitId: PARFAIT.uniteId,
    value: { type: 'scale_1_5', v: 5 },
    withheld: false,
    notApplicable: false,
  });
}
PARFAIT_QUESTIONS.push({
  missionQuestionId: PARFAIT.questionBloquante,
  blocCode: 'bloc_1',
  answerType: 'number',
  weight: '0',
  scoring: { bands: BANDES_DU_PACK, red_flag: { below: 2 } },
  options: null,
  criticality: 'bloquant',
});
PARFAIT_REPONSES.push({
  id: PARFAIT.reponseBloquante,
  interviewId: uid(0x6002),
  missionQuestionId: PARFAIT.questionBloquante,
  orgUnitId: PARFAIT.uniteId,
  value: { type: 'number', v: 10 },
  withheld: false,
  notApplicable: false,
});

export const JEU_SCORE_PARFAIT: EntreeScoring = {
  missionId: PARFAIT_MISSION,
  parametres: PARAMETRES_SEED,
  blocs: ['bloc_1'],
  unites: [{ id: PARFAIT.uniteId, parentId: null, headcount: 12, inScope: true }],
  questions: PARFAIT_QUESTIONS,
  reponses: PARFAIT_REPONSES,
};

export const ATTENDU_SCORE_PARFAIT = {
  score: 5,
  posees: 10,
  cotees: 10,
  ratio: 1,
  drapeauxRouges: 1,
} as const;
