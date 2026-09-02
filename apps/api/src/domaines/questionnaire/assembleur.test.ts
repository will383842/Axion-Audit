// =============================================================================
// TESTS PURS DE L'ASSEMBLEUR M2 — lot L3, incrément L3d, R-L3-3 de la revue A17.
//
// Écrits par A16, qui n'a écrit aucune ligne de `assembleur.ts` (09 §5.6). Seules
// les SIGNATURES, les types exportés et la JSDoc ont été lus — jamais le corps.
// Ce que ces tests tiennent pour vrai vient du pack et des arbitrages, pas du code :
//   · 03 M2 (sélection, tri « ordre des blocs → ordre dans le bloc », projection
//     par profil, snapshot) et §16.3 (paquets par service commandés par l'arbre) ;
//   · 01 §21.1 — les QUATRE archétypes qui sont la matière des fixtures ;
//   · `DECISIONS.md` 2026-09-01 [L3d] : ordre = position du bloc, code (absents en
//     dernier), identifiant ; 2026-09-02 [L3d] : `active_blocks` vide = aucune
//     restriction ; palier = RECOUVREMENT d'intervalles ; `size_tier_id` NULL =
//     filtre non appliqué + avertissement ;
//   · `docs/conception/LOT_L3.md` §3.a : capture (8 colonnes) ≠ routage.
//
// ── LA BANQUE EST DISCRIMINANTE, ET C'EST TOUT L'INTÉRÊT ────────────────────
// Chaque question de la fixture ne diffère de la question universelle `S01` que
// par UN filtre. Une implémentation qui oublierait un filtre, ou l'appliquerait
// à l'envers, laisse passer ou retient EXACTEMENT une question identifiable — et
// l'`entonnoir[]` dit à quel cran. Un test « il en sort 6 » ne suffirait pas :
// on vérifie LESQUELLES, et pourquoi.
//
// ── CE QUE CE FICHIER NE PROUVE PAS ─────────────────────────────────────────
// Rien de ce qui touche la base : la jointure question ↔ bloc, la résolution du
// palier par `size_tier_id`, l'écriture dans `mission_questions`, le 409 sur une
// sélection vide, la non-dérive du figeage. Tout cela vit dans
// `apps/api/tests/l3d-questionnaire.integration.test.ts`.
//
// ── INVARIANT 2 ─────────────────────────────────────────────────────────────
// Aucun client : les archétypes sont décrits par leur FORME (palier, secteurs,
// services de l'arbre), jamais par un nom. Les codes de secteur et de service
// sont ceux de la taxonomie maison (11 §5), les libellés de question sont neutres.
//
// Traçabilité : E11 (questionnaire généré et figé par mission) · E10 (banque de
// questions unique versionnée) · E2 (toutes tailles, 4 paliers) · E3 (tous
// secteurs, paquets sectoriels) · E4 (arbre organisationnel profondeur libre) ·
// E30 (3 niveaux d'audit) · E12 (entretiens par interlocuteur, à-revoir).
// =============================================================================
import { describe, expect, it } from 'vitest';

import {
  AVERTISSEMENTS_ASSEMBLAGE,
  FILTRES_ASSEMBLAGE,
  LIBELLES_FILTRE_ASSEMBLAGE,
  assembler,
  type CaptureQuestion,
  type EntreeAssemblage,
  type FiltreAssemblage,
  type LigneBlocBanque,
  type LigneMissionAssemblage,
  type LignePalierAssemblage,
  type LigneProfilAssemblage,
  type LigneQuestionBanque,
  type LigneUniteAssemblage,
  type QuestionDeBanque,
  type SortieAssemblage,
} from './assembleur.js';

// -----------------------------------------------------------------------------
// OUTILS
// -----------------------------------------------------------------------------

/** Identifiants FIXES : le déterminisme se prouve sur des entrées reproductibles. */
function id(suffixe: number): string {
  return `01900000-0000-7000-8000-${String(suffixe).padStart(12, '0')}`;
}

/** Gel RÉCURSIF : toute écriture dans l'entrée lève en mode strict (ESM). */
function gelerProfond<T>(valeur: T): T {
  if (valeur !== null && typeof valeur === 'object' && !Object.isFrozen(valeur)) {
    Object.freeze(valeur);
    for (const cle of Object.keys(valeur)) {
      gelerProfond((valeur as Record<string, unknown>)[cle]);
    }
  }
  return valeur;
}

/** Copie sans partage : une entrée dont on veut mesurer la non-mutation. */
function cloner<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

function codesRetenus(sortie: SortieAssemblage): readonly (string | null)[] {
  return sortie.questions.map((q) => q.routage.questionCode);
}

function etape(sortie: SortieAssemblage, filtre: FiltreAssemblage) {
  const cran = sortie.entonnoir.find((e) => e.filtre === filtre);
  if (cran === undefined) throw new Error(`entonnoir sans le cran « ${filtre} »`);
  return cran;
}

function codesAvertissements(sortie: SortieAssemblage): readonly string[] {
  return sortie.avertissements.map((a) => a.code);
}

// -----------------------------------------------------------------------------
// LA BANQUE DISCRIMINANTE
// -----------------------------------------------------------------------------

const B_SOCLE: LigneBlocBanque = { id: id(1), code: 'socle', position: 1 };
const B_RH: LigneBlocBanque = { id: id(2), code: 'rh', position: 2 };
const B_LOGI: LigneBlocBanque = { id: id(3), code: 'logistique', position: 3 };
const B_HOTEL: LigneBlocBanque = { id: id(4), code: 'secteur_hotellerie', position: 4 };
const B_GROUPE: LigneBlocBanque = { id: id(5), code: 'groupe', position: 5 };

type Surcharge = Partial<LigneQuestionBanque>;

/** Une question UNIVERSELLE : tout à `[]`, `geo = 'tous'`, bornes ouvertes. */
function question(
  numero: number,
  code: string | null,
  surcharge: Surcharge = {},
): LigneQuestionBanque {
  return {
    id: id(100 + numero),
    code,
    blockId: B_SOCLE.id,
    version: 1,
    status: 'active',
    origin: 'banque',
    textFr: `Question ${String(numero)}`,
    guidanceFr: `Consigne ${String(numero)} — ancres : 1 = inexistant … 5 = maîtrisé`,
    answerType: 'scale_1_5',
    options: null,
    allowRange: false,
    weight: '1.50',
    scoring: { bareme: 'lineaire' },
    criticality: 'important',
    expectedSource: 'entretien',
    sectors: [],
    targetServices: [],
    levels: [],
    headcountMin: null,
    headcountMax: null,
    profiles: [],
    geo: 'tous',
    displayIf: null,
    ...surcharge,
  };
}

function dansBloc(bloc: LigneBlocBanque, q: LigneQuestionBanque): QuestionDeBanque {
  return { question: { ...q, blockId: bloc.id }, bloc };
}

/**
 * 24 questions. Chacune ne diffère de `S01` que par UN critère — sauf les quatre
 * hors-socle, qui portent en plus leur bloc.
 */
const BANQUE: readonly QuestionDeBanque[] = [
  dansBloc(B_SOCLE, question(1, 'S01')),
  dansBloc(B_SOCLE, question(2, 'S02_BROUILLON', { status: 'draft' })),
  dansBloc(B_SOCLE, question(3, 'S03_ARCHIVEE', { status: 'archived' })),
  dansBloc(B_SOCLE, question(4, null, { origin: 'ad_hoc' })),
  dansBloc(B_SOCLE, question(5, 'S05_TPE', { headcountMin: null, headcountMax: 10 })),
  dansBloc(B_SOCLE, question(6, 'S06_PME', { headcountMin: 11, headcountMax: 250 })),
  dansBloc(B_SOCLE, question(7, 'S07_ETI', { headcountMin: 251, headcountMax: 5000 })),
  dansBloc(B_SOCLE, question(8, 'S08_GC', { headcountMin: 5001, headcountMax: null })),
  dansBloc(B_SOCLE, question(9, 'S09_HOTEL', { sectors: ['hotellerie'] })),
  dansBloc(B_SOCLE, question(10, 'S10_INDUS', { sectors: ['industrie'] })),
  dansBloc(B_SOCLE, question(11, 'S11_DISTRIB_INDUS', { sectors: ['distribution', 'industrie'] })),
  dansBloc(B_SOCLE, question(12, 'S12_CADRAGE', { levels: ['diagnostic_cadrage'] })),
  dansBloc(B_SOCLE, question(13, 'S13_STRAT', { levels: ['strategique_groupe'] })),
  dansBloc(B_SOCLE, question(14, 'S14_FR', { geo: 'france' })),
  dansBloc(B_SOCLE, question(15, 'S15_MULTI', { geo: 'multi_pays' })),
  dansBloc(
    B_SOCLE,
    question(16, 'S16_LOGI_SERVICE', { targetServices: ['logistique_operations'] }),
  ),
  dansBloc(B_SOCLE, question(17, 'S17_DSI_SERVICE', { targetServices: ['dsi_data'] })),
  dansBloc(B_SOCLE, question(18, 'S18_DIRIGEANT', { profiles: ['dirigeant'] })),
  dansBloc(B_SOCLE, question(19, 'S19_TERRAIN', { profiles: ['salarie_terrain'] })),
  dansBloc(B_SOCLE, question(20, 'S20_JURIDIQUE', { targetServices: ['juridique_conformite'] })),
  dansBloc(B_RH, question(21, 'R01', { targetServices: ['rh'] })),
  dansBloc(B_LOGI, question(22, 'L01', { targetServices: ['logistique_operations'] })),
  dansBloc(B_HOTEL, question(23, 'H01', { sectors: ['hotellerie'] })),
  dansBloc(
    B_GROUPE,
    question(24, 'G01', { levels: ['strategique_groupe'], headcountMin: 5001, headcountMax: null }),
  ),
];

const PALIER_TPE: LignePalierAssemblage = { code: 'tpe', headcountMin: 1, headcountMax: 10 };
const PALIER_PME: LignePalierAssemblage = { code: 'pme', headcountMin: 11, headcountMax: 250 };
const PALIER_ETI: LignePalierAssemblage = { code: 'eti', headcountMin: 251, headcountMax: 5000 };
const PALIER_GC: LignePalierAssemblage = {
  code: 'grand_compte',
  headcountMin: 5001,
  headcountMax: null,
};

const PROFILS: readonly LigneProfilAssemblage[] = [
  { code: 'dirigeant', groupCode: 'direction' },
  { code: 'manager', groupCode: 'encadrement' },
  { code: 'salarie_terrain', groupCode: 'terrain' },
];

function unite(
  serviceCode: string | null,
  surcharge: Partial<LigneUniteAssemblage> = {},
): LigneUniteAssemblage {
  return { inScope: true, status: 'active', serviceCode, ...surcharge };
}

function mission(surcharge: Partial<LigneMissionAssemblage> = {}): LigneMissionAssemblage {
  return {
    activeBlocks: ['socle'],
    activeSectors: [],
    auditLevel: 'operationnel',
    geoScope: 'france',
    ...surcharge,
  };
}

function entree(surcharge: Partial<EntreeAssemblage> = {}): EntreeAssemblage {
  return {
    mission: mission(),
    palier: PALIER_PME,
    unites: [unite(null)],
    questions: BANQUE,
    profils: PROFILS,
    ...surcharge,
  };
}

// -----------------------------------------------------------------------------
// LES QUATRE ARCHÉTYPES DU 01 §21.1
// -----------------------------------------------------------------------------

/** (a) TPE artisanale 1-2 p. : racine unique, diagnostic de cadrage, 1 entretien. */
const ARCHETYPE_A: EntreeAssemblage = entree({
  mission: mission({
    activeBlocks: ['socle'],
    activeSectors: ['artisanat'],
    auditLevel: 'diagnostic_cadrage',
    geoScope: 'france',
  }),
  palier: PALIER_TPE,
  unites: [unite(null)],
});

/** (b) PME multi-établissements 100-150 p. : un arbre, palier PME, paquet sectoriel. */
const ARCHETYPE_B: EntreeAssemblage = entree({
  mission: mission({
    activeBlocks: ['socle', 'rh', 'secteur_hotellerie'],
    activeSectors: ['hotellerie'],
    auditLevel: 'operationnel',
    geoScope: 'france',
  }),
  palier: PALIER_PME,
  unites: [
    unite(null), // siège
    ...Array.from({ length: 8 }, () => unite(null)), // 8 établissements
    unite('rh'), // le service RH, in_scope
    unite('logistique_operations', { inScope: false }), // sorti du périmètre : ne commande rien
  ],
});

/** (c) ETI industrielle 3 000-6 000 p. multi-sites/multi-pays : usines + services. */
const ARCHETYPE_C: EntreeAssemblage = entree({
  mission: mission({
    activeBlocks: [], // aucune restriction (DECISIONS 2026-09-02)
    activeSectors: ['industrie'],
    auditLevel: 'operationnel',
    geoScope: 'multi_pays',
  }),
  palier: PALIER_ETI,
  unites: [
    unite(null),
    unite(null),
    unite(null), // trois usines
    unite('logistique_operations'), // présent, in_scope, actif
    unite('dsi_data', { inScope: false }), // hors périmètre
    unite('juridique_conformite', { status: 'proposee' }), // pas encore un fait de l'arbre
  ],
});

/**
 * (d) Grand groupe hyper-décentralisé 100 000+ p. : UNE mission fille par entité,
 * chacune avec son arbre — l'assembleur travaille mission par mission, la
 * consolidation au sommet est ailleurs (§32.3). Ici : une fille, palier > 5 000,
 * niveau stratégique, deux secteurs, arbre riche en services.
 */
const ARCHETYPE_D: EntreeAssemblage = entree({
  mission: mission({
    activeBlocks: ['socle', 'groupe'],
    activeSectors: ['luxe', 'distribution'],
    auditLevel: 'strategique_groupe',
    geoScope: 'multi_pays',
  }),
  palier: PALIER_GC,
  unites: [
    ...Array.from({ length: 6 }, () => unite(null)), // six entités autonomes
    unite('rh'),
    unite('dsi_data'),
    unite('logistique_operations'),
    unite('juridique_conformite'),
  ],
});

describe('assembleur M2 — les quatre archétypes du 01 §21.1', () => {
  it('@critique (a) TPE : socle, cadrage, France, palier TPE — 6 questions et pas une de plus', () => {
    // Attrape : un filtre de palier qui compare à un EFFECTIF absent (la TPE n'en
    // porte pas) au lieu du recouvrement d'intervalles, et laisserait passer S06/S07/S08.
    const sortie = assembler(ARCHETYPE_A);
    expect(codesRetenus(sortie)).toEqual([
      'S01',
      'S05_TPE',
      'S12_CADRAGE',
      'S14_FR',
      'S18_DIRIGEANT',
      'S19_TERRAIN',
    ]);
    expect(sortie.total).toBe(6);
    expect(sortie.premierFiltreVidant).toBeNull();
    expect(sortie.servicesDuPerimetre).toEqual([]);
  });

  it("(a) TPE : l'entonnoir dit à quel cran chaque question exclue est tombée", () => {
    const sortie = assembler(ARCHETYPE_A);
    expect(sortie.entonnoir.map((e) => e.filtre)).toEqual([...FILTRES_ASSEMBLAGE]);
    expect(etape(sortie, 'statut_origine')).toEqual({
      filtre: 'statut_origine',
      avant: 24,
      apres: 21,
    });
    expect(etape(sortie, 'bloc_actif')).toEqual({ filtre: 'bloc_actif', avant: 21, apres: 17 });
    expect(etape(sortie, 'palier')).toEqual({ filtre: 'palier', avant: 17, apres: 14 });
    expect(etape(sortie, 'secteur')).toEqual({ filtre: 'secteur', avant: 14, apres: 11 });
    expect(etape(sortie, 'niveau_audit')).toEqual({ filtre: 'niveau_audit', avant: 11, apres: 10 });
    expect(etape(sortie, 'geo')).toEqual({ filtre: 'geo', avant: 10, apres: 9 });
    expect(etape(sortie, 'services_arbre')).toEqual({
      filtre: 'services_arbre',
      avant: 9,
      apres: 6,
    });
  });

  it('(a) TPE : la projection par profil — `profiles = []` va à tous, un profil ciblé à lui seul', () => {
    const sortie = assembler(ARCHETYPE_A);
    const parProfil = Object.fromEntries(sortie.parProfil.map((p) => [p.profilCode, p]));
    expect(Object.keys(parProfil).sort()).toEqual(['dirigeant', 'manager', 'salarie_terrain']);
    expect(parProfil.dirigeant?.total).toBe(5); // S01 S05 S12 S14 S18
    expect(parProfil.manager?.total).toBe(4); // S01 S05 S12 S14
    expect(parProfil.salarie_terrain?.total).toBe(5); // S01 S05 S12 S14 S19
    expect(parProfil.dirigeant?.groupCode).toBe('direction');
    expect(parProfil.dirigeant?.questionIds).toContain(id(118));
    expect(parProfil.dirigeant?.questionIds).not.toContain(id(119));
    // L'union des parcours EST l'ensemble figé (M2 §3) : rien n'est projeté hors sélection.
    const union = new Set(sortie.parProfil.flatMap((p) => p.questionIds));
    expect([...union].sort()).toEqual(sortie.questions.map((q) => q.capture.questionId).sort());
  });

  it('@critique (b) PME hôtelière : paquet sectoriel + paquet RH commandé par l’arbre, logistique hors périmètre muette', () => {
    // Attrape : un filtre `services_arbre` qui lirait TOUTES les unités (l'unité
    // logistique sortie du périmètre ferait entrer S16 et L01).
    const sortie = assembler(ARCHETYPE_B);
    expect(codesRetenus(sortie)).toEqual([
      'S01',
      'S06_PME',
      'S09_HOTEL',
      'S14_FR',
      'S18_DIRIGEANT',
      'S19_TERRAIN',
      'R01',
      'H01',
    ]);
    expect(sortie.servicesDuPerimetre).toEqual(['rh']);
    expect(sortie.parBloc.map((b) => [b.blocCode, b.total])).toEqual([
      ['socle', 6],
      ['rh', 1],
      ['secteur_hotellerie', 1],
    ]);
    expect(etape(sortie, 'bloc_actif')).toEqual({ filtre: 'bloc_actif', avant: 21, apres: 19 });
    expect(etape(sortie, 'services_arbre')).toEqual({
      filtre: 'services_arbre',
      avant: 11,
      apres: 8,
    });
  });

  it('@critique (c) ETI multi-pays : `active_blocks = []` ne restreint rien, seule l’unité logistique ACTIVE et in_scope commande son paquet', () => {
    // Attrape : (1) `[]` lu comme « aucun bloc » (sélection vide) ; (2) une unité
    // `proposee` ou hors périmètre comptée comme présente (S17 / S20 entreraient).
    const sortie = assembler(ARCHETYPE_C);
    expect(codesRetenus(sortie)).toEqual([
      'S01',
      'S07_ETI',
      'S10_INDUS',
      'S11_DISTRIB_INDUS',
      'S15_MULTI',
      'S16_LOGI_SERVICE',
      'S18_DIRIGEANT',
      'S19_TERRAIN',
      'L01',
    ]);
    expect(etape(sortie, 'bloc_actif')).toEqual({ filtre: 'bloc_actif', avant: 21, apres: 21 });
    expect(sortie.servicesDuPerimetre).toEqual(['logistique_operations']);
    expect(codesRetenus(sortie)).not.toContain('S17_DSI_SERVICE');
    expect(codesRetenus(sortie)).not.toContain('S20_JURIDIQUE');
    expect(codesRetenus(sortie)).not.toContain('R01');
  });

  it('@critique (d) grand groupe : palier ouvert à droite, deux secteurs (intersection), niveau stratégique, bloc groupe', () => {
    // Attrape : un recouvrement d'intervalles qui traiterait `headcount_max = NULL`
    // comme 0 (S08 et G01 tomberaient) ; une intersection de secteurs réduite à
    // l'égalité du premier élément (S11 tomberait).
    const sortie = assembler(ARCHETYPE_D);
    expect(codesRetenus(sortie)).toEqual([
      'S01',
      'S08_GC',
      'S11_DISTRIB_INDUS',
      'S13_STRAT',
      'S15_MULTI',
      'S16_LOGI_SERVICE',
      'S17_DSI_SERVICE',
      'S18_DIRIGEANT',
      'S19_TERRAIN',
      'S20_JURIDIQUE',
      'G01',
    ]);
    expect(sortie.servicesDuPerimetre).toEqual([
      'dsi_data',
      'juridique_conformite',
      'logistique_operations',
      'rh',
    ]);
    expect(sortie.parBloc.map((b) => b.blocCode)).toEqual(['socle', 'groupe']);
    expect(etape(sortie, 'palier')).toEqual({ filtre: 'palier', avant: 18, apres: 15 });
    expect(etape(sortie, 'secteur')).toEqual({ filtre: 'secteur', avant: 15, apres: 13 });
  });

  it('les quatre archétypes sont servis sans exception ni avertissement de structure', () => {
    for (const archetype of [ARCHETYPE_A, ARCHETYPE_B, ARCHETYPE_C, ARCHETYPE_D]) {
      const sortie = assembler(archetype);
      expect(sortie.total).toBeGreaterThan(0);
      expect(sortie.premierFiltreVidant).toBeNull();
      expect(codesAvertissements(sortie)).not.toContain(AVERTISSEMENTS_ASSEMBLAGE.PALIER_ABSENT);
      expect(codesAvertissements(sortie)).not.toContain(
        AVERTISSEMENTS_ASSEMBLAGE.BLOC_ACTIF_INCONNU,
      );
      expect(codesAvertissements(sortie)).not.toContain(
        AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE,
      );
      expect(codesAvertissements(sortie)).not.toContain(
        AVERTISSEMENTS_ASSEMBLAGE.PERIMETRE_SANS_UNITE,
      );
    }
  });
});

// -----------------------------------------------------------------------------
// ORDRE DÉTERMINISTE
// -----------------------------------------------------------------------------

describe('assembleur M2 — ordre déterministe (DECISIONS 2026-09-01 [L3d])', () => {
  it('@critique deux appels et une entrée mélangée rendent le MÊME JSON', () => {
    // Attrape : un tri qui s'appuie sur l'ordre d'arrivée (stabilité de `sort`
    // sur des clés égales) — l'entrée inversée révèle toute dépendance à l'ordre.
    const melangee: EntreeAssemblage = {
      ...ARCHETYPE_D,
      questions: [...ARCHETYPE_D.questions].reverse(),
      unites: [...ARCHETYPE_D.unites].reverse(),
      profils: [...ARCHETYPE_D.profils].reverse(),
    };
    const a = JSON.stringify(assembler(ARCHETYPE_D));
    const b = JSON.stringify(assembler(ARCHETYPE_D));
    const c = JSON.stringify(assembler(melangee));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('@critique position du bloc, puis code (absents en DERNIER), puis identifiant — et `position` = 1..n', () => {
    // Attrape : `localeCompare` (dépend de l'ICU), un `null` trié AVANT les codes
    // (`null < 'A'` est faux en JS mais `String(null)` = 'null' trie au milieu),
    // un bloc à position NULL trié en tête.
    const B_ANNEXE: LigneBlocBanque = { id: id(9), code: 'annexe', position: null };
    const questions: readonly QuestionDeBanque[] = [
      dansBloc(B_ANNEXE, question(31, 'A01')),
      dansBloc(B_RH, { ...question(32, null), id: id(902) }),
      dansBloc(B_RH, { ...question(33, null), id: id(901) }),
      dansBloc(B_RH, question(34, 'R02')),
      dansBloc(B_RH, question(35, 'R01')),
      dansBloc(B_SOCLE, question(36, 'S10')),
      dansBloc(B_SOCLE, question(37, 'S09')),
      dansBloc(B_SOCLE, question(38, 'S1')),
    ];
    const sortie = assembler(
      entree({ mission: mission({ activeBlocks: [] }), palier: null, questions }),
    );
    expect(sortie.questions.map((q) => q.capture.questionId)).toEqual([
      id(137), // S09 ('0' < '1' en unités de code)
      id(138), // S1  (préfixe de S10 : le plus court d'abord)
      id(136), // S10
      id(135), // R01
      id(134), // R02
      id(901), // code null, id le plus petit
      id(902), // code null, id suivant
      id(131), // bloc sans position : en dernier
    ]);
    expect(sortie.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sortie.parBloc.map((b) => b.blocCode)).toEqual(['socle', 'rh', 'annexe']);
  });

  it('la comparaison des codes se fait sur les unités de code, pas sur une collation', () => {
    // 'a' (0x61) > 'B' (0x42) en unités de code ; une collation française met 'a' avant 'B'.
    const questions: readonly QuestionDeBanque[] = [
      dansBloc(B_SOCLE, question(41, 'a')),
      dansBloc(B_SOCLE, question(42, 'B')),
    ];
    const sortie = assembler(entree({ palier: null, questions }));
    expect(codesRetenus(sortie)).toEqual(['B', 'a']);
  });
});

// -----------------------------------------------------------------------------
// LES ARBITRAGES DU 2026-09-02 [L3d]
// -----------------------------------------------------------------------------

describe('assembleur M2 — `active_blocks` vide, palier absent, recouvrement aux bornes', () => {
  it('@critique `activeBlocks: []` ⇒ aucune restriction : les cinq blocs passent, sans avertissement', () => {
    // Attrape : `[].includes(bloc)` = faux pour tout bloc ⇒ sélection vide ;
    // ou l'inverse trop zélé : un avertissement BLOC_ACTIF_SANS_QUESTION sur « [] ».
    // Le niveau et l'arbre sont choisis pour que RIEN d'autre que le bloc ne
    // puisse écarter R01, L01, H01 et G01 : ce qui reste mesure le seul filtre visé.
    const sortie = assembler(
      entree({
        mission: mission({ activeBlocks: [], auditLevel: 'strategique_groupe' }),
        palier: null,
        unites: [unite('rh'), unite('logistique_operations')],
      }),
    );
    expect(etape(sortie, 'bloc_actif').avant).toBe(etape(sortie, 'bloc_actif').apres);
    expect(sortie.parBloc.map((b) => b.blocCode)).toEqual([
      'socle',
      'rh',
      'logistique',
      'secteur_hotellerie',
      'groupe',
    ]);
    expect(codesAvertissements(sortie)).not.toContain(AVERTISSEMENTS_ASSEMBLAGE.BLOC_ACTIF_INCONNU);
  });

  it('@critique palier `null` ⇒ filtre NON appliqué et avertissement PALIER_ABSENT', () => {
    // Attrape : « pas de palier ⇒ rien ne passe » (option 2 refusée) et « pas de
    // palier ⇒ silence » (l'avertissement est ce qui sépare l'option 1 du silence).
    const sortie = assembler(entree({ palier: null }));
    expect(etape(sortie, 'palier').avant).toBe(etape(sortie, 'palier').apres);
    expect(codesRetenus(sortie)).toEqual(
      expect.arrayContaining(['S05_TPE', 'S06_PME', 'S07_ETI', 'S08_GC']),
    );
    expect(codesAvertissements(sortie)).toContain(AVERTISSEMENTS_ASSEMBLAGE.PALIER_ABSENT);
    const avert = sortie.avertissements.find(
      (a) => a.code === AVERTISSEMENTS_ASSEMBLAGE.PALIER_ABSENT,
    );
    expect(avert?.message.length).toBeGreaterThan(0);
  });

  it('`activeSectors: []` ⇒ aucune restriction de secteur', () => {
    const sortie = assembler(entree({ mission: mission({ activeSectors: [] }) }));
    expect(etape(sortie, 'secteur').avant).toBe(etape(sortie, 'secteur').apres);
    expect(codesRetenus(sortie)).toEqual(expect.arrayContaining(['S09_HOTEL', 'S10_INDUS']));
  });

  describe('@critique recouvrement d’intervalles avec le palier PME [11, 250]', () => {
    // Attrape : une comparaison STRICTE aux bornes (`<` pour `<=`), une borne NULL
    // lue comme 0, ou une inclusion (question ⊂ palier) au lieu d'un recouvrement.
    const cas: readonly [string, number | null, number | null, boolean][] = [
      ['[null, null] — universelle', null, null, true],
      ['[null, 10] — juste sous la borne basse', null, 10, false],
      ['[null, 11] — touche la borne basse', null, 11, true],
      ['[250, null] — touche la borne haute', 250, null, true],
      ['[251, null] — juste au-dessus', 251, null, false],
      ['[1, 5000] — englobe le palier', 1, 5000, true],
      ['[50, 100] — inclus dans le palier', 50, 100, true],
      ['[200, 300] — chevauche par la droite', 200, 300, true],
      ['[5, 11] — chevauche par la gauche sur un point', 5, 11, true],
    ];
    for (const [libelle, min, max, attendu] of cas) {
      it(`${libelle} ⇒ ${attendu ? 'retenue' : 'exclue'}`, () => {
        const q = dansBloc(
          B_SOCLE,
          question(50, 'Q_BORNE', { headcountMin: min, headcountMax: max }),
        );
        const sortie = assembler(entree({ palier: PALIER_PME, questions: [q] }));
        expect(sortie.total).toBe(attendu ? 1 : 0);
        expect(sortie.premierFiltreVidant).toBe(attendu ? null : 'palier');
      });
    }
  });

  it('un palier ouvert à droite (grand compte) retient une question elle-même ouverte à droite', () => {
    const q = dansBloc(
      B_SOCLE,
      question(51, 'Q_OUVERTE', { headcountMin: 100_000, headcountMax: null }),
    );
    const sortie = assembler(entree({ palier: PALIER_GC, questions: [q] }));
    expect(sortie.total).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// SÉLECTION VIDE, ENTRÉE JAMAIS MUTÉE, ÉTIQUETTES ILLISIBLES
// -----------------------------------------------------------------------------

describe('assembleur M2 — sélection vide : une sortie, jamais une exception', () => {
  it('@critique un bloc actif inconnu vide la sélection : liste vide, `premierFiltreVidant = bloc_actif`, avertissement nommé', () => {
    // Attrape : un `throw` sur sélection vide (c'est le SERVICE qui décide du 409),
    // et un `premierFiltreVidant` posé sur le DERNIER filtre au lieu du premier.
    const e = entree({ mission: mission({ activeBlocks: ['bloc_inexistant'] }) });
    let sortie: SortieAssemblage | undefined;
    expect(() => {
      sortie = assembler(e);
    }).not.toThrow();
    expect(sortie?.total).toBe(0);
    expect(sortie?.questions).toEqual([]);
    expect(sortie?.parBloc).toEqual([]);
    expect(sortie?.premierFiltreVidant).toBe('bloc_actif');
    expect(sortie?.parProfil.map((p) => p.total)).toEqual([0, 0, 0]);
    const avert = sortie?.avertissements.find(
      (a) => a.code === AVERTISSEMENTS_ASSEMBLAGE.BLOC_ACTIF_INCONNU,
    );
    expect(avert?.message).toContain('bloc_inexistant');
    // Le libellé français du filtre vidant existe pour le message du 409.
    expect(LIBELLES_FILTRE_ASSEMBLAGE.bloc_actif.length).toBeGreaterThan(0);
  });

  it('seuls des brouillons ⇒ vidé dès `statut_origine`, les crans suivants restent à 0 → 0', () => {
    const questions = [dansBloc(B_SOCLE, question(60, 'Q_DRAFT', { status: 'draft' }))];
    const sortie = assembler(entree({ questions }));
    expect(sortie.premierFiltreVidant).toBe('statut_origine');
    expect(sortie.entonnoir.map((e) => [e.avant, e.apres])).toEqual([
      [1, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it('une banque VIDE ne vide rien : `premierFiltreVidant = null`, sortie vide, pas d’exception', () => {
    const sortie = assembler(entree({ questions: [] }));
    expect(sortie.total).toBe(0);
    expect(sortie.premierFiltreVidant).toBeNull();
    expect(sortie.entonnoir.every((e) => e.avant === 0 && e.apres === 0)).toBe(true);
  });

  it('aucune unité in_scope active ⇒ les paquets par service tombent, PERIMETRE_SANS_UNITE est posé', () => {
    const sortie = assembler(
      entree({ unites: [unite('rh', { inScope: false }), unite('rh', { status: 'fusionnee' })] }),
    );
    expect(sortie.servicesDuPerimetre).toEqual([]);
    expect(codesRetenus(sortie)).not.toContain('S16_LOGI_SERVICE');
    expect(codesRetenus(sortie)).toContain('S01'); // les transverses passent toujours
    expect(codesAvertissements(sortie)).toContain(AVERTISSEMENTS_ASSEMBLAGE.PERIMETRE_SANS_UNITE);
  });

  it('un service présent dans l’arbre sans aucun paquet est signalé (SERVICE_SANS_PAQUET), avec son code', () => {
    const sortie = assembler(entree({ unites: [unite('marketing_contenu')] }));
    const avert = sortie.avertissements.find(
      (a) => a.code === AVERTISSEMENTS_ASSEMBLAGE.SERVICE_SANS_PAQUET,
    );
    expect(avert?.message).toContain('marketing_contenu');
  });

  it('un profil cité par une question mais absent du référentiel est signalé (PROFIL_INCONNU)', () => {
    const questions = [dansBloc(B_SOCLE, question(61, 'Q_PROFIL', { profiles: ['stagiaire'] }))];
    const sortie = assembler(entree({ questions }));
    expect(sortie.total).toBe(1); // le profil n'est pas un filtre : la question reste
    expect(codesAvertissements(sortie)).toContain(AVERTISSEMENTS_ASSEMBLAGE.PROFIL_INCONNU);
    expect(sortie.parProfil.every((p) => p.total === 0)).toBe(true);
  });

  it('une étiquette JSONB illisible ne devient pas une restriction : signalée, la question passe', () => {
    const questions = [dansBloc(B_SOCLE, question(62, 'Q_ILLISIBLE', { sectors: 'hotellerie' }))];
    const sortie = assembler(
      entree({ mission: mission({ activeSectors: ['artisanat'] }), questions }),
    );
    expect(sortie.total).toBe(1);
    expect(codesAvertissements(sortie)).toContain(AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE);
  });
});

describe('assembleur M2 — pureté', () => {
  it('@critique l’entrée n’est jamais mutée : gelée en profondeur, l’appel ne lève pas ; comparée avant/après, elle est identique', () => {
    // Attrape : un `sort()` en place sur `entree.questions`, un `push` dans
    // `entree.unites`, une réécriture de `question.profiles` en tableau normalisé.
    const temoin = cloner(ARCHETYPE_C);
    const gelee = gelerProfond(cloner(ARCHETYPE_C));
    expect(() => assembler(gelee)).not.toThrow();
    const nonGelee = cloner(ARCHETYPE_C);
    assembler(nonGelee);
    expect(JSON.stringify(nonGelee)).toBe(JSON.stringify(temoin));
    expect(JSON.stringify(gelee)).toBe(JSON.stringify(temoin));
  });

  it('les questions rendues ne partagent pas de référence avec les lignes d’entrée', () => {
    const e = cloner(ARCHETYPE_A);
    const sortie = assembler(e);
    for (const q of sortie.questions) {
      for (const source of e.questions) {
        expect(q.capture).not.toBe(source.question);
        expect(q.routage).not.toBe(source.question);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// CAPTURE (8 COLONNES) VS ROUTAGE — note L3 §3.a
// -----------------------------------------------------------------------------

describe('assembleur M2 — capture vs routage, sans confusion', () => {
  const CLES_CAPTURE: readonly (keyof CaptureQuestion)[] = [
    'addedAdHoc',
    'allowRangeSnapshot',
    'answerTypeSnapshot',
    'criticalitySnapshot',
    'guidanceSnapshot',
    'optionsSnapshot',
    'questionId',
    'questionVersion',
    'scoringSnapshot',
    'textSnapshot',
    'weightSnapshot',
  ];

  it('@critique la capture porte EXACTEMENT les colonnes de `mission_questions`, ni `id`, ni `missionId`, ni routage', () => {
    // Attrape : un `...question` étalé dans la capture (les étiquettes de routage
    // y entreraient, et le figeage capturerait `profiles` — interdit par §3.a),
    // et un UUID frappé ici (deux appels différeraient).
    const sortie = assembler(ARCHETYPE_A);
    const s18 = sortie.questions.find((q) => q.routage.questionCode === 'S18_DIRIGEANT');
    expect(s18).toBeDefined();
    if (s18 === undefined) return;
    expect(Object.keys(s18.capture).sort()).toEqual([...CLES_CAPTURE].sort());
    const capture: Record<string, unknown> = { ...s18.capture };
    for (const interdit of [
      'id',
      'missionId',
      'profiles',
      'profils',
      'sectors',
      'targetServices',
      'blockId',
      'code',
    ]) {
      expect(capture).not.toHaveProperty(interdit);
    }
  });

  it('@critique la capture recopie les valeurs à l’identique — `weight` reste la CHAÎNE `numeric`', () => {
    // Attrape : `Number(weight)` (« 1.50 » → 1.5, et « 0.1 »+« 0.2 » un jour
    // n'égalent plus « 0.3 » au scoring).
    const sortie = assembler(ARCHETYPE_A);
    const s18 = sortie.questions.find((q) => q.routage.questionCode === 'S18_DIRIGEANT');
    expect(s18?.capture).toEqual({
      questionId: id(118),
      questionVersion: 1,
      textSnapshot: 'Question 18',
      guidanceSnapshot: 'Consigne 18 — ancres : 1 = inexistant … 5 = maîtrisé',
      answerTypeSnapshot: 'scale_1_5',
      optionsSnapshot: null,
      weightSnapshot: '1.50',
      scoringSnapshot: { bareme: 'lineaire' },
      criticalitySnapshot: 'important',
      allowRangeSnapshot: false,
      addedAdHoc: false,
    });
    expect(typeof s18?.capture.weightSnapshot).toBe('string');
  });

  it('le routage relit les étiquettes de la ligne pointée, bloc compris', () => {
    const sortie = assembler(ARCHETYPE_B);
    const r01 = sortie.questions.find((q) => q.routage.questionCode === 'R01');
    expect(r01?.routage).toEqual({
      questionCode: 'R01',
      blocId: B_RH.id,
      blocCode: 'rh',
      blocPosition: 2,
      profils: [],
      servicesCibles: ['rh'],
      secteurs: [],
      niveaux: [],
      geo: 'tous',
      effectifMin: null,
      effectifMax: null,
      sourceAttendue: 'entretien',
      conditionAffichage: null,
    });
    const s18 = sortie.questions.find((q) => q.routage.questionCode === 'S18_DIRIGEANT');
    expect(s18?.routage.profils).toEqual(['dirigeant']);
  });

  it('`version` capturée est celle de la ligne : une version 3 se fige en 3', () => {
    const questions = [dansBloc(B_SOCLE, question(70, 'Q_V3', { version: 3, textFr: 'Texte v3' }))];
    const sortie = assembler(entree({ questions }));
    expect(sortie.questions[0]?.capture.questionVersion).toBe(3);
    expect(sortie.questions[0]?.capture.textSnapshot).toBe('Texte v3');
  });
});

// -----------------------------------------------------------------------------
// LES BRANCHES QUE LA MESURE A DÉNONCÉES (2026-09-02) — étiquettes de MISSION
// illisibles, palier ouvert à GAUCHE, blocs SANS position, question SANS code
// -----------------------------------------------------------------------------
// `.github/coverage-critical-paths.json` place ce module sous le seuil de 90 % sur
// les quatre métriques ; mesuré avant cette section : 86,7 % de branches. Chaque
// cas exerce une branche que le rapport v8 donnait à zéro, et assère un
// comportement — jamais un simple passage.

describe('assembleur M2 — les étiquettes de la MISSION elle-même, quand elles sont illisibles', () => {
  it('`activeBlocks` qui n’est pas une liste ⇒ aucune restriction, et un avertissement qui NOMME « active_blocks »', () => {
    // Un JSONB corrompu (`"socle"` au lieu de `["socle"]`) ne doit ni restreindre en
    // silence (la mission perdrait ses blocs sans le voir), ni passer en silence
    // (l'administrateur croirait sa restriction appliquée). Il est ignoré ET signalé.
    const sortie = assembler(entree({ mission: mission({ activeBlocks: 'socle' }) }));
    expect(etape(sortie, 'bloc_actif').avant).toBe(etape(sortie, 'bloc_actif').apres);
    const avertissements = sortie.avertissements.filter(
      (a) => a.code === AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE,
    );
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]?.message).toContain('active_blocks');
  });

  it('`activeSectors` qui n’est pas une liste ⇒ aucune restriction de secteur, avertissement nommant « active_sectors »', () => {
    const sortie = assembler(
      entree({ mission: mission({ activeSectors: { code: 'hotellerie' } }) }),
    );
    expect(etape(sortie, 'secteur').avant).toBe(etape(sortie, 'secteur').apres);
    const messages = sortie.avertissements
      .filter((a) => a.code === AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE)
      .map((a) => a.message);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('active_sectors');
  });

  it('`activeBlocks` ABSENT (`undefined`) vaut « aucune restriction », sans avertissement', () => {
    // `null`, absent ou `[]` : les trois sont la convention du pack (`[]` =
    // universelle) — et aucun des trois n'est une corruption.
    const sortie = assembler(entree({ mission: mission({ activeBlocks: undefined }) }));
    expect(etape(sortie, 'bloc_actif').avant).toBe(etape(sortie, 'bloc_actif').apres);
    expect(codesAvertissements(sortie)).not.toContain(
      AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE,
    );
  });

  it('une liste MÊLÉE (nombre, code vide, code valide) : seul le code valide restreint, et l’avertissement est posé', () => {
    // `[42, '  ', 'socle']` : le nombre et la chaîne vide sont ILLISIBLES et ignorés ;
    // `socle` est un code lisible, donc la restriction s'applique à lui SEUL. Une
    // implémentation qui abandonnerait toute la liste au premier élément illisible
    // laisserait passer les cinq blocs — le compte du bloc actif la trahit.
    const sortie = assembler(entree({ mission: mission({ activeBlocks: [42, '  ', 'socle'] }) }));
    expect(codesAvertissements(sortie)).toContain(AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE);
    expect(sortie.parBloc.map((b) => b.blocCode)).toEqual(['socle']);
    expect(etape(sortie, 'bloc_actif').apres).toBeLessThan(etape(sortie, 'bloc_actif').avant);
  });

  it('une question SANS code dont une étiquette est illisible est nommée par son IDENTIFIANT', () => {
    // `code` est NULL au 04 pour une question non versée : le message doit quand
    // même désigner la ligne fautive, et l'identifiant est le seul nom qui reste.
    const q = dansBloc(B_SOCLE, { ...question(71, null, { levels: 'operationnel' }), id: id(971) });
    const sortie = assembler(entree({ questions: [q] }));
    expect(sortie.total, 'une étiquette illisible ne restreint pas').toBe(1);
    const message = sortie.avertissements.find(
      (a) => a.code === AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE,
    )?.message;
    expect(message).toContain(id(971));
  });
});

describe('assembleur M2 — palier ouvert à GAUCHE et blocs sans position', () => {
  it('un palier sans borne basse ([null, 5]) retient une question qui commence sous 5, et exclut celle qui commence à 6', () => {
    // La borne NULL est OUVERTE des deux côtés du recouvrement — pas seulement à
    // droite (grand compte). Un palier « jusqu'à 5 personnes » sans plancher
    // recouvre [3, 100] (3 ≤ 5) et ne recouvre pas [6, ∞[ (6 > 5).
    const PALIER_SANS_PLANCHER: LignePalierAssemblage = {
      code: 'micro',
      headcountMin: null,
      headcountMax: 5,
    };
    const retenue = dansBloc(
      B_SOCLE,
      question(72, 'Q_DES_TROIS', { headcountMin: 3, headcountMax: 100 }),
    );
    const exclue = dansBloc(
      B_SOCLE,
      question(73, 'Q_DES_SIX', { headcountMin: 6, headcountMax: null }),
    );
    const sortie = assembler(
      entree({ palier: PALIER_SANS_PLANCHER, questions: [retenue, exclue] }),
    );
    expect(codesRetenus(sortie)).toEqual(['Q_DES_TROIS']);
    expect(etape(sortie, 'palier')).toEqual({ filtre: 'palier', avant: 2, apres: 1 });
  });

  it('deux blocs SANS position sont départagés par leur code, et passent tous deux après un bloc positionné', () => {
    // Attrape : un tri qui traiterait `null` comme 0 (les deux blocs sans position
    // passeraient EN TÊTE), ou qui laisserait deux `null` à égalité (l'ordre
    // dépendrait alors de l'ordre d'arrivée, ce que le déterminisme interdit).
    const B_SANS_A: LigneBlocBanque = { id: id(81), code: 'zeta', position: null };
    const B_SANS_B: LigneBlocBanque = { id: id(82), code: 'alpha', position: null };
    const questions: readonly QuestionDeBanque[] = [
      dansBloc(B_SANS_A, question(81, 'Z01')),
      dansBloc(B_SANS_B, question(82, 'A01')),
      dansBloc(B_SOCLE, question(83, 'S01')),
      dansBloc(B_SANS_A, question(84, 'Z00')),
    ];
    const sortie = assembler(
      entree({ mission: mission({ activeBlocks: [] }), palier: null, questions }),
    );
    expect(sortie.parBloc.map((b) => b.blocCode)).toEqual(['socle', 'alpha', 'zeta']);
    expect(codesRetenus(sortie)).toEqual(['S01', 'A01', 'Z00', 'Z01']);

    // Et dans l'ordre INVERSE d'arrivée : le résultat ne change pas.
    const renversee = assembler(
      entree({
        mission: mission({ activeBlocks: [] }),
        palier: null,
        questions: [...questions].reverse(),
      }),
    );
    expect(codesRetenus(renversee)).toEqual(['S01', 'A01', 'Z00', 'Z01']);
  });
});
