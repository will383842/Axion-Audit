// =============================================================================
// TESTS PURS DU GÉNÉRATEUR DE PLAN D'ENTRETIENS §32.4 — lot L3, L3d, R-L3-3.
//
// Écrits par A16, qui n'a écrit aucune ligne de `generateur.ts` (09 §5.6). Seules
// les signatures, les types exportés, `REGLES_ECHANTILLONNAGE` (une DONNÉE
// exportée) et la JSDoc ont été lus — jamais le corps de `genererPlan`.
// Ce que ces tests tiennent pour vrai vient du pack et des arbitrages :
//   · 03 §32.4 : « unité ≤ 10 pers. → 1-2 entretiens · 11-50 → 3 · 51-200 → 4-6
//     + 1 observation · > 200 → 6-10 + observation + démonstration + relevé » ;
//   · 03 §17.3 : « pour CHAQUE unité in_scope », une cible chiffrée par unité ;
//   · `DECISIONS.md` 2026-09-02 [L3d] : le n MINIMAL est matérialisé ; les unités
//     `proposee` / `fusionnee` sont exclues ; chaque unité compte sur son PROPRE
//     effectif, parents compris, sans agrégation ; effectif 0 → « ≤ 10 » ; effectif
//     NULL → tranche minimale + `effectifInconnu` + avertissement ; > 200 →
//     compléments comptés 1 chacun ; le profil est LISTÉ, jamais chiffré.
//
// ── LES BORNES SONT LE SEUL ENDROIT OÙ UN `<` ET UN `<=` SE DISTINGUENT ─────
// 10/11, 50/51, 200/201 : chaque paire est testée des deux côtés, et le nombre
// de lignes produites est vérifié — pas seulement le code de règle. Une règle
// bien choisie mais mal matérialisée (le max au lieu du min) sortirait rouge.
//
// ── CE QUE CE FICHIER NE PROUVE PAS ─────────────────────────────────────────
// La route `GET …/interview-plan`, le RBAC qui la garde, la lecture de l'arbre
// en base, FIL-GC (150 unités → plan de 60) : `apps/api/tests/*.integration.test.ts`.
//
// ── INVARIANT 2 ─────────────────────────────────────────────────────────────
// Noms d'unités neutres (« Unité 1 »), effectifs choisis pour les bornes, jamais
// pour ressembler à quelqu'un.
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E40 (ROI normé,
// échantillonnage, ancres — les quatre tranches du §32.4) · E4 (arbre
// organisationnel profondeur libre — chaque unité compte, parents compris).
// =============================================================================
import { describe, expect, it } from 'vitest';

import {
  CODES_AVERTISSEMENT_PLAN,
  CODES_REGLE_ECHANTILLONNAGE,
  REGLES_ECHANTILLONNAGE,
  genererPlan,
  type CodeRegleEchantillonnage,
  type EntreePlanEntretiens,
  type MissionPourPlan,
  type PlanEntretiens,
  type ProfilPourPlan,
  type UnitePourPlan,
} from './generateur.js';

// -----------------------------------------------------------------------------
// OUTILS
// -----------------------------------------------------------------------------

function id(suffixe: number): string {
  return `01900000-0000-7000-8000-${String(suffixe).padStart(12, '0')}`;
}

const MISSION: MissionPourPlan = { id: id(1), auditLevel: 'operationnel' };
const AUTRE_MISSION_ID = id(2);

const PROFILS: readonly ProfilPourPlan[] = [
  { code: 'salarie_terrain', labelFr: 'Salarié terrain', groupCode: 'terrain' },
  { code: 'dirigeant', labelFr: 'Dirigeant', groupCode: 'direction' },
  { code: 'manager', labelFr: 'Manager', groupCode: 'encadrement' },
  { code: 'daf', labelFr: 'Directeur financier', groupCode: 'direction' },
];

function unite(
  numero: number,
  headcount: number | null,
  surcharge: Partial<UnitePourPlan> = {},
): UnitePourPlan {
  return {
    id: id(100 + numero),
    missionId: MISSION.id,
    parentId: null,
    kind: 'service',
    name: `Unité ${String(numero)}`,
    headcount,
    inScope: true,
    status: 'active',
    position: numero,
    ...surcharge,
  };
}

function entree(
  unites: readonly UnitePourPlan[],
  surcharge: Partial<EntreePlanEntretiens> = {},
): EntreePlanEntretiens {
  return { mission: MISSION, unites, profils: PROFILS, genereLe: null, ...surcharge };
}

function cible(plan: PlanEntretiens, orgUnitId: string) {
  const c = plan.parUnite.find((u) => u.orgUnitId === orgUnitId);
  if (c === undefined) throw new Error(`aucune cible pour ${orgUnitId}`);
  return c;
}

function sessionsDe(plan: PlanEntretiens, orgUnitId: string) {
  return plan.sessions.filter((s) => s.orgUnitId === orgUnitId);
}

function gelerProfond<T>(valeur: T): T {
  if (valeur !== null && typeof valeur === 'object' && !Object.isFrozen(valeur)) {
    Object.freeze(valeur);
    for (const cle of Object.keys(valeur)) {
      gelerProfond((valeur as Record<string, unknown>)[cle]);
    }
  }
  return valeur;
}

function cloner<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

// -----------------------------------------------------------------------------
// LES QUATRE TRANCHES, TRANSCRITES — la donnée exportée est vérifiée contre le texte
// -----------------------------------------------------------------------------

describe('REGLES_ECHANTILLONNAGE — la donnée est la lettre du §32.4', () => {
  it('@critique quatre tranches contiguës, fermées, dans l’ordre du texte, avec leurs fourchettes', () => {
    // Attrape : une tranche « 10-50 » (recouvrement à 10), un trou « 51-199 », un
    // « 6-10 » devenu « 6-8 », une observation ajoutée à la tranche 11-50.
    expect(REGLES_ECHANTILLONNAGE.map((r) => r.code)).toEqual([...CODES_REGLE_ECHANTILLONNAGE]);
    expect(
      REGLES_ECHANTILLONNAGE.map((r) => [
        r.effectifMin,
        r.effectifMax,
        r.entretiens.min,
        r.entretiens.max,
      ]),
    ).toEqual([
      [0, 10, 1, 2],
      [11, 50, 3, 3],
      [51, 200, 4, 6],
      [201, null, 6, 10],
    ]);
    expect(REGLES_ECHANTILLONNAGE.map((r) => r.sessionsComplementaires)).toEqual([
      [],
      [],
      [{ kind: 'observation', nombre: 1 }],
      [
        { kind: 'observation', nombre: 1 },
        { kind: 'demonstration', nombre: 1 },
        { kind: 'releve_donnees', nombre: 1 },
      ],
    ]);
    // Contiguïté : la borne basse d'une tranche = borne haute de la précédente + 1.
    for (let i = 1; i < REGLES_ECHANTILLONNAGE.length; i += 1) {
      const precedente = REGLES_ECHANTILLONNAGE[i - 1];
      const courante = REGLES_ECHANTILLONNAGE[i];
      expect(courante?.effectifMin).toBe((precedente?.effectifMax ?? Number.NaN) + 1);
    }
  });

  it('chaque libellé est une phrase française non vide (invariant 5)', () => {
    for (const r of REGLES_ECHANTILLONNAGE) {
      expect(r.libelle.trim().length).toBeGreaterThan(10);
      expect(r.libelle).toMatch(/entretien/);
    }
  });
});

// -----------------------------------------------------------------------------
// LES BORNES 10/11, 50/51, 200/201, 0, NULL
// -----------------------------------------------------------------------------

describe('genererPlan — bornes du §32.4, des deux côtés', () => {
  interface Attendu {
    readonly regle: CodeRegleEchantillonnage;
    readonly entretiens: number;
    readonly complementaires: readonly [string, number][];
  }
  const cas: readonly [number, Attendu][] = [
    [1, { regle: 'unite_10_ou_moins', entretiens: 1, complementaires: [] }],
    [10, { regle: 'unite_10_ou_moins', entretiens: 1, complementaires: [] }],
    [11, { regle: 'unite_11_a_50', entretiens: 3, complementaires: [] }],
    [50, { regle: 'unite_11_a_50', entretiens: 3, complementaires: [] }],
    [51, { regle: 'unite_51_a_200', entretiens: 4, complementaires: [['observation', 1]] }],
    [200, { regle: 'unite_51_a_200', entretiens: 4, complementaires: [['observation', 1]] }],
    [
      201,
      {
        regle: 'unite_plus_de_200',
        entretiens: 6,
        complementaires: [
          ['observation', 1],
          ['demonstration', 1],
          ['releve_donnees', 1],
        ],
      },
    ],
    [
      100_000,
      {
        regle: 'unite_plus_de_200',
        entretiens: 6,
        complementaires: [
          ['observation', 1],
          ['demonstration', 1],
          ['releve_donnees', 1],
        ],
      },
    ],
  ];

  for (const [effectif, attendu] of cas) {
    it(`@critique effectif ${String(effectif)} ⇒ ${attendu.regle}, ${String(attendu.entretiens)} entretien(s) matérialisé(s) + ${String(attendu.complementaires.length)} complémentaire(s)`, () => {
      // Attrape : `< 10` pour `<= 10` (10 tomberait en 11-50), `<= 200` codé `< 200`,
      // et le MAXIMUM matérialisé en lignes (2, 6 ou 10 entretiens au lieu de 1, 4, 6).
      const u = unite(1, effectif);
      const plan = genererPlan(entree([u]));
      const c = cible(plan, u.id);
      expect(c.regle).toBe(attendu.regle);
      expect(c.effectif).toBe(effectif);
      expect(c.effectifInconnu).toBe(false);
      const sessions = sessionsDe(plan, u.id);
      expect(sessions.filter((s) => s.kind === 'entretien')).toHaveLength(attendu.entretiens);
      for (const [kind, nombre] of attendu.complementaires) {
        expect(sessions.filter((s) => s.kind === kind)).toHaveLength(nombre);
      }
      expect(sessions).toHaveLength(attendu.entretiens + attendu.complementaires.length);
      expect(c.sessionsProposees).toBe(sessions.length);
      expect(sessions.every((s) => s.regle === attendu.regle)).toBe(true);
    });
  }

  it('@critique effectif 0 ⇒ tranche « ≤ 10 », effectif CONNU (pas d’avertissement)', () => {
    // Attrape : `if (!headcount)` qui confond 0 et NULL — un 0 deviendrait « inconnu ».
    const u = unite(1, 0);
    const plan = genererPlan(entree([u]));
    const c = cible(plan, u.id);
    expect(c.regle).toBe('unite_10_ou_moins');
    expect(c.effectif).toBe(0);
    expect(c.effectifInconnu).toBe(false);
    expect(plan.avertissements.map((a) => a.code)).not.toContain('effectif_inconnu');
  });

  it('@critique effectif NULL ⇒ tranche minimale, `effectifInconnu = true`, avertissement `effectif_inconnu` portant l’identifiant', () => {
    // Attrape : un plan refusé (option 2 rejetée), ou un plan muet (le §17.3
    // interdit le silence) ; et un avertissement qui nommerait l'unité ou
    // l'effectif (11 §2) au lieu de porter l'identifiant dans `orgUnitIds`.
    const u = unite(1, null);
    const plan = genererPlan(entree([u]));
    const c = cible(plan, u.id);
    expect(c.regle).toBe('unite_10_ou_moins');
    expect(c.effectif).toBeNull();
    expect(c.effectifInconnu).toBe(true);
    expect(sessionsDe(plan, u.id)).toHaveLength(1);
    const avert = plan.avertissements.find((a) => a.code === 'effectif_inconnu');
    expect(avert?.orgUnitIds).toEqual([u.id]);
    expect(avert?.message).not.toContain('Unité 1');
  });

  it('un effectif négatif ou fractionnaire est traité comme INCONNU, jamais rangé dans « ≤ 10 » en silence', () => {
    for (const valeur of [-5, 2.5]) {
      const u = unite(1, valeur);
      const plan = genererPlan(entree([u]));
      expect(cible(plan, u.id).effectifInconnu).toBe(true);
      expect(plan.avertissements.find((a) => a.code === 'effectif_inconnu')?.orgUnitIds).toEqual([
        u.id,
      ]);
    }
  });

  it('la cible porte la FOURCHETTE du §32.4 telle quelle, le max en donnée et non en lignes', () => {
    const u = unite(1, 300);
    const plan = genererPlan(entree([u]));
    const c = cible(plan, u.id);
    expect(c.entretiens).toEqual({ min: 6, max: 10 });
    expect(c.sessionsComplementaires).toEqual([
      { kind: 'observation', nombre: 1 },
      { kind: 'demonstration', nombre: 1 },
      { kind: 'releve_donnees', nombre: 1 },
    ]);
    expect(sessionsDe(plan, u.id).filter((s) => s.kind === 'entretien')).toHaveLength(6);
  });
});

// -----------------------------------------------------------------------------
// LA FORME DES SESSIONS
// -----------------------------------------------------------------------------

describe('genererPlan — sessions proposées', () => {
  it('un entretien est proposé `sur_site`, une session complémentaire sans mode ; `rangDansUnite` repart à 1 par kind', () => {
    const u = unite(1, 51);
    const plan = genererPlan(entree([u]));
    const sessions = sessionsDe(plan, u.id);
    const entretiens = sessions.filter((s) => s.kind === 'entretien');
    expect(entretiens.map((s) => s.rangDansUnite)).toEqual([1, 2, 3, 4]);
    expect(entretiens.every((s) => s.mode === 'sur_site')).toBe(true);
    const observation = sessions.find((s) => s.kind === 'observation');
    expect(observation?.rangDansUnite).toBe(1);
    expect(observation?.mode).toBeNull();
    expect(observation?.orgUnitNom).toBe('Unité 1');
    expect(sessions.every((s) => s.justification.trim().length > 0)).toBe(true);
  });

  it('le `rang` global est 1..n, continu, dans l’ordre des unités', () => {
    const plan = genererPlan(entree([unite(1, 5), unite(2, 30), unite(3, 60)]));
    expect(plan.sessions.map((s) => s.rang)).toEqual(
      Array.from({ length: plan.sessions.length }, (_, i) => i + 1),
    );
    expect(plan.sessions).toHaveLength(1 + 3 + 5);
    expect(plan.sessions.map((s) => s.orgUnitId)).toEqual([
      ...Array<string>(1).fill(id(101)),
      ...Array<string>(3).fill(id(102)),
      ...Array<string>(5).fill(id(103)),
    ]);
  });

  it('le plan ne produit jamais un `kind` hors des quatre du §32.4 (ni atelier, ni analyse documentaire)', () => {
    const plan = genererPlan(entree([unite(1, 5), unite(2, 30), unite(3, 60), unite(4, 500)]));
    const kinds = new Set(plan.sessions.map((s) => s.kind));
    expect([...kinds].sort()).toEqual([
      'demonstration',
      'entretien',
      'observation',
      'releve_donnees',
    ]);
  });
});

// -----------------------------------------------------------------------------
// DÉTERMINISME ET PURETÉ
// -----------------------------------------------------------------------------

describe('genererPlan — déterminisme', () => {
  const UNITES: readonly UnitePourPlan[] = [
    unite(1, 5, { position: 2 }),
    unite(2, 30, { position: 1 }),
    unite(3, 60, { position: null }),
    unite(4, 500, { position: null }),
    unite(5, null, { position: 1 }),
  ];

  it('@critique deux appels et une entrée MÉLANGÉE rendent le même JSON', () => {
    // Attrape : un plan qui suit l'ordre d'arrivée du dépôt (aucun ORDER BY ne le
    // garantit) — deux lectures rendraient deux plans.
    const melangee = entree([...UNITES].reverse(), { profils: [...PROFILS].reverse() });
    const a = JSON.stringify(genererPlan(entree(UNITES)));
    const b = JSON.stringify(genererPlan(entree(UNITES)));
    const c = JSON.stringify(genererPlan(melangee));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('@critique ordre : `position` croissante, nulles en DERNIER, puis `id` — sur les unités de code', () => {
    // Attrape : `null` trié en tête (`null < 1` est vrai en JS), `localeCompare`
    // sur les identifiants, un tri instable à position égale.
    const plan = genererPlan(entree(UNITES));
    expect(plan.parUnite.map((u) => u.orgUnitId)).toEqual([
      id(102), // position 1, id le plus petit
      id(105), // position 1
      id(101), // position 2
      id(103), // position null, id le plus petit
      id(104), // position null
    ]);
  });

  it('`genereLe` est RECOPIÉ, jamais lu d’une horloge ; absent ⇒ `null`', () => {
    const horodatage = '2026-09-02T10:00:00.000Z';
    expect(genererPlan(entree(UNITES, { genereLe: horodatage })).genereLe).toBe(horodatage);
    expect(genererPlan(entree(UNITES)).genereLe).toBeNull();
    expect(genererPlan({ mission: MISSION, unites: UNITES, profils: PROFILS }).genereLe).toBeNull();
  });

  it('le niveau d’audit est recopié et ne dimensionne RIEN : trois niveaux, un même plan', () => {
    const plans = (['diagnostic_cadrage', 'operationnel', 'strategique_groupe'] as const).map(
      (auditLevel) => genererPlan(entree(UNITES, { mission: { id: MISSION.id, auditLevel } })),
    );
    expect(plans.map((p) => p.niveauAudit)).toEqual([
      'diagnostic_cadrage',
      'operationnel',
      'strategique_groupe',
    ]);
    const sessions = plans.map((p) => JSON.stringify(p.sessions));
    expect(sessions[0]).toBe(sessions[1]);
    expect(sessions[1]).toBe(sessions[2]);
    expect(plans[0]?.missionId).toBe(MISSION.id);
  });

  it('@critique l’entrée n’est jamais mutée', () => {
    // Attrape : un `unites.sort()` en place — l'appelant relirait son arbre trié.
    const temoin = cloner(entree(UNITES));
    const gelee = gelerProfond(cloner(entree(UNITES)));
    expect(() => genererPlan(gelee)).not.toThrow();
    const libre = cloner(entree(UNITES));
    genererPlan(libre);
    expect(JSON.stringify(libre)).toBe(JSON.stringify(temoin));
  });
});

// -----------------------------------------------------------------------------
// LISTE VIDE, UNITÉS ÉCARTÉES ET COMPTÉES
// -----------------------------------------------------------------------------

describe('genererPlan — liste vide et unités écartées', () => {
  it('@critique aucune unité ⇒ plan vide, quatre règles à zéro, avertissement nommé, AUCUNE exception', () => {
    // Attrape : un `throw` sur arbre vide (état légitime de la préparation), ou
    // `reglesAppliquees` réduit aux règles utilisées (le front perdrait ses lignes).
    let plan: PlanEntretiens | undefined;
    expect(() => {
      plan = genererPlan(entree([]));
    }).not.toThrow();
    expect(plan?.sessions).toEqual([]);
    expect(plan?.parUnite).toEqual([]);
    expect(plan?.reglesAppliquees.map((r) => r.regle)).toEqual([...CODES_REGLE_ECHANTILLONNAGE]);
    expect(
      plan?.reglesAppliquees.every((r) => r.unitesConcernees === 0 && r.entretiensProposes === 0),
    ).toBe(true);
    expect(plan?.totaux).toEqual({
      unitesRetenues: 0,
      unitesEcartees: 0,
      entretiens: { min: 0, max: 0 },
      sessionsProposees: 0,
      // Les quatre kinds du §32.4 figurent à zéro : un compte vide est une
      // information, pas un trou — même lecture que `reglesAppliquees`.
      parKind: [
        { kind: 'entretien', nombre: 0 },
        { kind: 'observation', nombre: 0 },
        { kind: 'demonstration', nombre: 0 },
        { kind: 'releve_donnees', nombre: 0 },
      ],
    });
    expect(plan?.avertissements.map((a) => a.code)).toContain('aucune_unite_dans_le_perimetre');
  });

  it('@critique `proposee`, `fusionnee`, hors périmètre, autre mission : écartées, COMPTÉES, nommées par identifiant', () => {
    // Attrape : une unité proposée qui compte (option 3 refusée : un plan sur une
    // structure que personne n'a validée), une unité hors mission qui passe (invariant 3),
    // et un filtrage silencieux (le défaut d'appelant se déguiserait en plan complet).
    const active = unite(1, 30);
    const proposee = unite(2, 30, { status: 'proposee' });
    const fusionnee = unite(3, 30, { status: 'fusionnee' });
    const horsPerimetre = unite(4, 30, { inScope: false });
    const autreMission = unite(5, 30, { missionId: AUTRE_MISSION_ID });
    const plan = genererPlan(entree([active, proposee, fusionnee, horsPerimetre, autreMission]));

    expect(plan.parUnite.map((u) => u.orgUnitId)).toEqual([active.id]);
    expect(plan.sessions.every((s) => s.orgUnitId === active.id)).toBe(true);
    expect(plan.totaux.unitesRetenues).toBe(1);
    expect(plan.totaux.unitesEcartees).toBe(4);

    const parCode = Object.fromEntries(plan.avertissements.map((a) => [a.code, a.orgUnitIds]));
    expect(parCode.unites_non_actives_ignorees).toEqual(
      expect.arrayContaining([proposee.id, fusionnee.id]),
    );
    expect(parCode.unites_hors_perimetre_ignorees).toEqual([horsPerimetre.id]);
    expect(parCode.unites_hors_mission_ignorees).toEqual([autreMission.id]);
    expect(plan.avertissements.map((a) => a.code)).not.toContain('aucune_unite_dans_le_perimetre');
  });

  it('une unité écartée pour DEUX raisons n’est comptée qu’une fois dans `unitesEcartees`', () => {
    const doublement = unite(2, 30, { status: 'proposee', inScope: false });
    const plan = genererPlan(entree([unite(1, 30), doublement]));
    expect(plan.totaux.unitesEcartees).toBe(1);
    expect(plan.totaux.unitesRetenues).toBe(1);
  });

  it('toutes écartées ⇒ plan vide ET `aucune_unite_dans_le_perimetre` ET les écartées comptées', () => {
    const plan = genererPlan(
      entree([unite(1, 30, { inScope: false }), unite(2, 30, { status: 'proposee' })]),
    );
    expect(plan.sessions).toEqual([]);
    expect(plan.totaux.unitesEcartees).toBe(2);
    expect(plan.avertissements.map((a) => a.code)).toContain('aucune_unite_dans_le_perimetre');
  });

  it('les codes d’avertissement rendus appartiennent tous à la liste fermée', () => {
    const plan = genererPlan(
      entree([
        unite(1, null),
        unite(2, 30, { inScope: false }),
        unite(3, 30, { missionId: AUTRE_MISSION_ID }),
      ]),
    );
    for (const a of plan.avertissements) {
      expect(CODES_AVERTISSEMENT_PLAN).toContain(a.code);
      expect(a.message.trim().length).toBeGreaterThan(0);
    }
  });
});

// -----------------------------------------------------------------------------
// CHAQUE UNITÉ COMPTE SUR SON PROPRE EFFECTIF — PARENTS COMPRIS, SANS AGRÉGATION
// -----------------------------------------------------------------------------

describe('genererPlan — parents compris, aucune agrégation (DECISIONS 2026-09-02 [L3d])', () => {
  it('@critique un parent de 8 personnes avec deux enfants de 60 reçoit SA tranche (≤ 10), pas celle de 128', () => {
    // Attrape : une agrégation inventée (option 3 refusée) et l'exclusion des
    // parents (option 2 refusée) — le §17.3 dit « pour CHAQUE unité in_scope ».
    const parent = unite(1, 8, { kind: 'etablissement' });
    const enfantA = unite(2, 60, { parentId: parent.id });
    const enfantB = unite(3, 60, { parentId: parent.id });
    const plan = genererPlan(entree([parent, enfantA, enfantB]));
    expect(cible(plan, parent.id).regle).toBe('unite_10_ou_moins');
    expect(cible(plan, parent.id).effectif).toBe(8);
    expect(cible(plan, parent.id).parentId).toBeNull();
    expect(cible(plan, enfantA.id).parentId).toBe(parent.id);
    expect(cible(plan, enfantA.id).regle).toBe('unite_51_a_200');
    expect(plan.totaux.unitesRetenues).toBe(3);
    expect(plan.sessions).toHaveLength(1 + 5 + 5);
  });
});

// -----------------------------------------------------------------------------
// TOTAUX ET BILAN PAR RÈGLE
// -----------------------------------------------------------------------------

describe('genererPlan — totaux et `reglesAppliquees`', () => {
  const UNITES: readonly UnitePourPlan[] = [
    unite(1, 5),
    unite(2, 10),
    unite(3, 30),
    unite(4, 100),
    unite(5, 250),
    unite(6, null),
  ];

  it('@critique le bilan par règle porte le n minimal EXIGÉ et le nombre PRODUIT, règle par règle, toujours les quatre', () => {
    // Attrape : `entretiensProposes` calculé sur le max, ou une règle absente
    // parce qu'aucune unité ne l'a déclenchée.
    const plan = genererPlan(entree(UNITES));
    expect(
      plan.reglesAppliquees.map((r) => [
        r.regle,
        r.unitesConcernees,
        r.entretiensProposes,
        r.sessionsComplementairesProposees,
      ]),
    ).toEqual([
      ['unite_10_ou_moins', 3, 3, 0], // 5, 10 et l'effectif inconnu
      ['unite_11_a_50', 1, 3, 0],
      ['unite_51_a_200', 1, 4, 1],
      ['unite_plus_de_200', 1, 6, 3],
    ]);
    for (const r of plan.reglesAppliquees) {
      expect(r.entretiensProposes).toBe(r.nMinimalEntretiens * r.unitesConcernees);
      expect(r.nMaximalEntretiens).toBeGreaterThanOrEqual(r.nMinimalEntretiens);
    }
  });

  it('les totaux sont la somme des cibles : min/max d’entretiens, sessions, par kind', () => {
    const plan = genererPlan(entree(UNITES));
    expect(plan.totaux.unitesRetenues).toBe(6);
    expect(plan.totaux.unitesEcartees).toBe(0);
    expect(plan.totaux.entretiens).toEqual({
      min: 1 + 1 + 3 + 4 + 6 + 1,
      max: 2 + 2 + 3 + 6 + 10 + 2,
    });
    expect(plan.totaux.sessionsProposees).toBe(16 + 1 + 3);
    expect(plan.totaux.sessionsProposees).toBe(plan.sessions.length);
    expect(plan.totaux.parKind).toEqual([
      { kind: 'entretien', nombre: 16 },
      { kind: 'observation', nombre: 2 },
      { kind: 'demonstration', nombre: 1 },
      { kind: 'releve_donnees', nombre: 1 },
    ]);
  });
});

// -----------------------------------------------------------------------------
// LES PROFILS : LISTÉS, ORDONNÉS, JAMAIS CHIFFRÉS
// -----------------------------------------------------------------------------

describe('genererPlan — profils à couvrir', () => {
  it('@critique les profils sont ORDONNÉS (direction → encadrement → terrain, puis code) et ne portent AUCUN nombre', () => {
    // Attrape : un chiffrage par profil (`interviews.interlocutor_profile_id`
    // n'existe pas au 04 : arbitrage 2026-09-01 [L3d]) et l'ordre d'arrivée.
    const plan = genererPlan(entree([unite(1, 30)]));
    const profils = cible(plan, id(101)).profilsACouvrir;
    expect(profils).toEqual([
      { code: 'daf', libelle: 'Directeur financier', groupe: 'direction' },
      { code: 'dirigeant', libelle: 'Dirigeant', groupe: 'direction' },
      { code: 'manager', libelle: 'Manager', groupe: 'encadrement' },
      { code: 'salarie_terrain', libelle: 'Salarié terrain', groupe: 'terrain' },
    ]);
    for (const p of profils) {
      expect(Object.keys(p).sort()).toEqual(['code', 'groupe', 'libelle']);
    }
  });

  it('le générateur ne FILTRE pas les profils : aucun profil ⇒ liste vide, sans exception', () => {
    const plan = genererPlan(entree([unite(1, 30)], { profils: [] }));
    expect(cible(plan, id(101)).profilsACouvrir).toEqual([]);
    expect(plan.sessions).toHaveLength(3);
  });
});
