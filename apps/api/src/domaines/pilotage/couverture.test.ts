// =============================================================================
// TESTS DU CALCUL DE COUVERTURE — écrits AVANT `couverture.ts` (09 §3, étape 2 :
// « TDD sur les parties critiques »). Lot L7, incrément L7b.
//
// ⚠ **CES TESTS SONT CEUX D'A32, L'AGENT QUI ÉCRIT LE CALCUL.** La règle de
// croisement (09 §5.6) reste entière et n'est pas contournée : les tests qui
// PRONONCENT L'ACCEPTATION du lot — étanchéité par rôle, quatre états, keyset de
// bout en bout, axe-core, p95 FIL-GC — sont écrits par **A36**, qui n'a rien
// produit ici. Ceux-ci sont l'outil de conception du calcul, pas sa recette : ils
// verrouillent les DEUX AXES du §27.1 l'un contre l'autre, et c'est le seul
// endroit où on peut le faire sans monter une base.
//
// ── LES DEUX FIXTURES SYMÉTRIQUES (`LOT_L7.md` §6.5) ────────────────────────
// Un écran qui ne livre que l'axe A passe tous les tests « couverture » naïfs.
// Deux jeux les séparent :
//   1. « tout en entretiens » — chaque unité a une session, toutes de `kind`
//      entretien. Attendu : axe A complet, axe B EN DÉFAUT sur les autres sources.
//      Une implémentation qui n'aurait que l'axe A dirait « couverture complète ».
//   2. « tout sur une unité » — les six `kind` présents, concentrés sur une unité.
//      Attendu : axe B complet en marge, axe A en défaut ailleurs, alerte §16.6.
//      Une implémentation qui n'aurait que l'axe B dirait « couverture complète ».
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E36 (exécutable
// par lots avec critères).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { SOURCES_COLLECTE } from '@axion/shared';
import { genererPlan, type UnitePourPlan } from '../plan-entretiens/generateur.js';
import {
  calculerCouverture,
  type CompteSessionsUnite,
  type EntreeCouverture,
} from './couverture.js';

const MISSION = '01890000-0000-7000-8000-000000000001';
const CALCULE_LE = '2026-09-05T08:00:00.000Z';

function uuid(n: number): string {
  return `01890000-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

/** Une unité d'arbre minimale. `headcount: 5` ⇒ tranche « ≤ 10 » : 1-2 entretiens. */
function unite(n: number, surcharge: Partial<UnitePourPlan> = {}): UnitePourPlan {
  return {
    id: uuid(n),
    missionId: MISSION,
    parentId: null,
    kind: 'service',
    name: `Unité ${String(n)}`,
    headcount: 5,
    inScope: true,
    status: 'active',
    position: n,
    ...surcharge,
  };
}

function compte(
  orgUnitId: string,
  kind: CompteSessionsUnite['kind'],
  valeurs: Partial<Omit<CompteSessionsUnite, 'orgUnitId' | 'kind'>> = {},
): CompteSessionsUnite {
  return {
    orgUnitId,
    kind,
    planifie: valeurs.planifie ?? 0,
    realise: valeurs.realise ?? 0,
    nonAnnulees: valeurs.nonAnnulees ?? Math.max(valeurs.planifie ?? 0, valeurs.realise ?? 0),
  };
}

function entree(
  unites: readonly UnitePourPlan[],
  comptes: readonly CompteSessionsUnite[],
  surcharge: Partial<EntreeCouverture> = {},
): EntreeCouverture {
  const plan = genererPlan({
    mission: { id: MISSION, auditLevel: 'operationnel' },
    unites,
    profils: [],
    genereLe: CALCULE_LE,
  });
  return {
    plan,
    toutesLesUnites: unites,
    unitesDeLaPage: unites,
    comptes,
    blocsTouches: [],
    blocsActifs: [],
    timezone: 'Europe/Paris',
    calculeLe: CALCULE_LE,
    nextCursor: null,
    ...surcharge,
  };
}

function cellule(couverture: ReturnType<typeof calculerCouverture>, index: number, kind: string) {
  const ligne = couverture.unites[index];
  if (ligne === undefined) throw new Error(`Aucune ligne à l'index ${String(index)}.`);
  const trouvee = ligne.parSource.find((c) => c.kind === kind);
  if (trouvee === undefined) throw new Error(`Aucune colonne « ${kind} ».`);
  return trouvee;
}

describe('couverture — l’axe B publie TOUJOURS les cinq sources du §27.1', () => {
  it('rend cinq colonnes, dans l’ordre du §27.1, même sur une mission vide', () => {
    const couverture = calculerCouverture(entree([unite(1)], []));

    expect(couverture.unites[0]?.parSource.map((c) => c.kind)).toEqual([...SOURCES_COLLECTE]);
    expect(couverture.marges.parSource.map((c) => c.kind)).toEqual([...SOURCES_COLLECTE]);
  });

  it('n’ouvre AUCUNE sixième colonne pour l’atelier — il vit hors de la grille', () => {
    const u = unite(1);
    const couverture = calculerCouverture(
      entree([u], [compte(u.id, 'atelier', { realise: 3, planifie: 3 })]),
    );

    // Le type le dit déjà (`SourceCollecte` n'a pas de valeur `atelier`) ; ce test
    // le dit à l'exécution, parce que c'est la RÉPONSE JSON qui part au navigateur.
    const colonnes: readonly string[] = couverture.unites[0]?.parSource.map((c) => c.kind) ?? [];
    expect(colonnes).toHaveLength(5);
    expect(colonnes).not.toContain('atelier');
    expect(couverture.unites[0]?.atelierRealise).toBe(3);
  });

  it('un atelier réalisé ne comble JAMAIS l’absence d’une observation', () => {
    const u = unite(1, { headcount: 120 }); // tranche 51-200 : 1 observation exigée
    const couverture = calculerCouverture(entree([u], [compte(u.id, 'atelier', { realise: 9 })]));

    expect(cellule(couverture, 0, 'observation').couvert).toBe(false);
    expect(couverture.unites[0]?.sourcesCouvertes).toBe(0);
  });

  it('la marge porte le décompte des ateliers MÊME À ZÉRO — elle ne se tait pas', () => {
    const couverture = calculerCouverture(entree([unite(1)], []));
    expect(couverture.marges.atelierRealise).toBe(0);
  });

  it('un entretien COMPLÉMENTAIRE (§32.6) reste un entretien : aucune colonne de plus', () => {
    // Le mode ne voyage pas jusqu'ici : le dépôt agrège par `kind`. Ce test fige
    // la conséquence — cinq colonnes, et l'entretien complémentaire y est compté.
    const u = unite(1);
    const couverture = calculerCouverture(
      entree([u], [compte(u.id, 'entretien', { realise: 2, planifie: 2 })]),
    );

    expect(couverture.unites[0]?.parSource).toHaveLength(5);
    expect(cellule(couverture, 0, 'entretien').realise).toBe(2);
  });
});

describe('couverture — le PRÉVU vient du plan §32.4 et n’est jamais recalculé', () => {
  it('reprend la fourchette d’entretiens du plan, telle quelle', () => {
    const couverture = calculerCouverture(entree([unite(1, { headcount: 5 })], []));
    expect(cellule(couverture, 0, 'entretien').prevu).toEqual({ min: 1, max: 2 });
  });

  it('reprend les sessions complémentaires exigées — 51-200 ⇒ 1 observation', () => {
    const couverture = calculerCouverture(entree([unite(1, { headcount: 120 })], []));

    expect(cellule(couverture, 0, 'observation').prevu).toEqual({ min: 1, max: 1 });
    expect(cellule(couverture, 0, 'demonstration').prevu).toEqual({ min: 0, max: 0 });
  });

  it('> 200 ⇒ observation, démonstration ET relevé de données sont exigés', () => {
    const couverture = calculerCouverture(entree([unite(1, { headcount: 900 })], []));

    expect(cellule(couverture, 0, 'observation').prevu.min).toBe(1);
    expect(cellule(couverture, 0, 'demonstration').prevu.min).toBe(1);
    expect(cellule(couverture, 0, 'releve_donnees').prevu.min).toBe(1);
    expect(couverture.unites[0]?.sourcesAttendues).toBe(4);
  });

  it('une unité HORS PÉRIMÈTRE est rendue, marquée, et n’attend rien', () => {
    const couverture = calculerCouverture(entree([unite(1, { inScope: false })], []));
    const ligne = couverture.unites[0];

    expect(ligne?.inScope).toBe(false);
    expect(ligne?.sourcesAttendues).toBe(0);
    expect(ligne?.parSource.every((c) => c.prevu.max === 0)).toBe(true);
    expect(ligne?.aucuneSession).toBe(false);
    expect(couverture.marges.unitesHorsPerimetre).toBe(1);
    expect(couverture.marges.unitesInScope).toBe(0);
  });
});

describe('couverture — PLANIFIÉ et RÉALISÉ ne disent pas la même chose', () => {
  it('sépare les trois colonnes : prévu, planifié, réalisé', () => {
    const u = unite(1, { headcount: 30 }); // tranche 11-50 : 3 entretiens
    const couverture = calculerCouverture(
      entree([u], [compte(u.id, 'entretien', { planifie: 3, realise: 1 })]),
    );

    expect(cellule(couverture, 0, 'entretien')).toEqual({
      kind: 'entretien',
      prevu: { min: 3, max: 3 },
      planifie: 3,
      realise: 1,
      couvert: false,
    });
  });

  it('« couvert » se lit sur le n MINIMAL du plan, jamais sur un seuil inventé', () => {
    const u = unite(1, { headcount: 5 }); // 1-2 entretiens : le minimum est 1
    const couverture = calculerCouverture(
      entree([u], [compte(u.id, 'entretien', { planifie: 1, realise: 1 })]),
    );

    expect(cellule(couverture, 0, 'entretien').couvert).toBe(true);
    expect(couverture.unites[0]?.sourcesCouvertes).toBe(1);
    expect(couverture.unites[0]?.sourcesAttendues).toBe(1);
  });

  it('une source non exigée par le plan est « couverte » par construction', () => {
    // `prevu.min = 0` : le plan n'exige rien, donc rien ne manque. Ce n'est pas une
    // indulgence — c'est ce que « la couverture reflète le plan » signifie.
    const couverture = calculerCouverture(entree([unite(1, { headcount: 5 })], []));
    expect(cellule(couverture, 0, 'observation').couvert).toBe(true);
    expect(couverture.unites[0]?.sourcesAttendues).toBe(1);
  });
});

describe('couverture — L’ALERTE §16.6 : une unité in_scope sans aucune session', () => {
  it('lève l’alerte sur une unité in_scope qui n’a reçu aucune session', () => {
    const couverture = calculerCouverture(entree([unite(1)], []));

    expect(couverture.unites[0]?.aucuneSession).toBe(true);
    expect(couverture.marges.unitesSansAucuneSession).toBe(1);
  });

  it('une session ANNULÉE ne lève pas l’alerte : elle ne compte pour rien', () => {
    const u = unite(1);
    const couverture = calculerCouverture(
      entree([u], [compte(u.id, 'entretien', { planifie: 0, realise: 0, nonAnnulees: 0 })]),
    );

    expect(couverture.unites[0]?.aucuneSession).toBe(true);
  });

  it('une session seulement PLANIFIÉE suffit à retirer l’alerte', () => {
    const u = unite(1);
    const couverture = calculerCouverture(
      entree([u], [compte(u.id, 'entretien', { planifie: 1, nonAnnulees: 1 })]),
    );

    expect(couverture.unites[0]?.aucuneSession).toBe(false);
    expect(couverture.marges.unitesSansAucuneSession).toBe(0);
  });

  it('un ATELIER seul retire l’alerte — une session tenue est un travail fait', () => {
    const u = unite(1);
    const couverture = calculerCouverture(
      entree([u], [compte(u.id, 'atelier', { realise: 1, nonAnnulees: 1 })]),
    );

    expect(couverture.unites[0]?.aucuneSession).toBe(false);
  });
});

describe('couverture — FIXTURE 1 « tout en entretiens » : l’axe B rattrape l’axe A', () => {
  const unites = Array.from({ length: 10 }, (_, i) => unite(i + 1, { headcount: 120 }));
  const comptes = unites.map((u) =>
    compte(u.id, 'entretien', { planifie: 6, realise: 6, nonAnnulees: 6 }),
  );

  it('axe A : aucune unité n’est en alerte — la lecture par unité est complète', () => {
    const couverture = calculerCouverture(entree(unites, comptes));

    expect(couverture.marges.unitesSansAucuneSession).toBe(0);
    expect(couverture.unites.some((u) => u.aucuneSession)).toBe(false);
  });

  it('axe B : l’OBSERVATION exigée par le §32.4 manque sur les DIX unités', () => {
    const couverture = calculerCouverture(entree(unites, comptes));

    expect(couverture.unites.every((u) => u.sourcesCouvertes === 1)).toBe(true);
    expect(couverture.unites.every((u) => u.sourcesAttendues === 2)).toBe(true);
    expect(couverture.marges.parSource.find((c) => c.kind === 'observation')).toEqual({
      kind: 'observation',
      prevu: { min: 10, max: 10 },
      planifie: 0,
      realise: 0,
      couvert: false,
    });
  });
});

describe('couverture — FIXTURE 2 « tout sur une unité » : l’axe A rattrape l’axe B', () => {
  const unites = Array.from({ length: 10 }, (_, i) => unite(i + 1, { headcount: 120 }));
  const porteuse = unites[0];
  if (porteuse === undefined) throw new Error('fixture');
  const comptes = [
    ...SOURCES_COLLECTE.map((kind) =>
      compte(porteuse.id, kind, { planifie: 6, realise: 6, nonAnnulees: 6 }),
    ),
    compte(porteuse.id, 'atelier', { realise: 1, nonAnnulees: 1 }),
  ];

  it('axe B : les cinq sources sont présentes en marge de mission', () => {
    const couverture = calculerCouverture(entree(unites, comptes));

    expect(couverture.marges.parSource.every((c) => c.realise > 0)).toBe(true);
    expect(couverture.marges.atelierRealise).toBe(1);
  });

  it('axe A : NEUF unités sur dix restent en alerte §16.6', () => {
    const couverture = calculerCouverture(entree(unites, comptes));

    expect(couverture.marges.unitesSansAucuneSession).toBe(9);
    expect(couverture.unites.filter((u) => u.aucuneSession).length).toBe(9);
  });
});

describe('couverture — les MARGES portent sur la mission, jamais sur la page', () => {
  const unites = Array.from({ length: 10 }, (_, i) => unite(i + 1));
  const comptes = [compte(uuid(1), 'entretien', { realise: 1, planifie: 1, nonAnnulees: 1 })];

  it('des marges identiques que la page porte 10 unités ou 3', () => {
    const complete = calculerCouverture(entree(unites, comptes));
    const page = calculerCouverture(
      entree(unites, comptes, { unitesDeLaPage: unites.slice(3, 6), nextCursor: 'curseur-opaque' }),
    );

    expect(page.unites).toHaveLength(3);
    expect(page.marges).toEqual(complete.marges);
    expect(page.nextCursor).toBe('curseur-opaque');
  });
});

describe('couverture — l’arbre reste lisible : profondeur et blocs non couverts', () => {
  it('calcule la profondeur de chaque unité, racine à 0 (FIL-GC : 4 niveaux)', () => {
    const racine = unite(1, { parentId: null });
    const filiale = unite(2, { parentId: racine.id });
    const site = unite(3, { parentId: filiale.id });
    const equipe = unite(4, { parentId: site.id });
    const couverture = calculerCouverture(entree([racine, filiale, site, equipe], []));

    expect(couverture.unites.map((u) => u.profondeur)).toEqual([0, 1, 2, 3]);
  });

  it('une profondeur reste finie même si un parent boucle sur lui-même', () => {
    const a = unite(1);
    const b = unite(2, { parentId: a.id });
    const bouclee: UnitePourPlan = { ...a, parentId: b.id };
    const couverture = calculerCouverture(entree([bouclee, b], []));

    expect(couverture.unites.every((u) => Number.isFinite(u.profondeur))).toBe(true);
  });

  it('les blocs non couverts sont les blocs ACTIFS qu’aucune réponse de l’unité ne touche', () => {
    const u = unite(1);
    const couverture = calculerCouverture(
      entree([u], [], {
        blocsActifs: ['bloc_1', 'bloc_2', 'bloc_3'],
        blocsTouches: [{ orgUnitId: u.id, blocCode: 'bloc_2' }],
      }),
    );

    expect(couverture.unites[0]?.blocsNonCouverts).toEqual(['bloc_1', 'bloc_3']);
    expect(couverture.blocsActifs).toEqual(['bloc_1', 'bloc_2', 'bloc_3']);
  });

  it('un bloc touché par une AUTRE unité ne compte pas pour celle-ci', () => {
    const u1 = unite(1);
    const u2 = unite(2);
    const couverture = calculerCouverture(
      entree([u1, u2], [], {
        blocsActifs: ['bloc_1'],
        blocsTouches: [{ orgUnitId: u2.id, blocCode: 'bloc_1' }],
      }),
    );

    expect(couverture.unites[0]?.blocsNonCouverts).toEqual(['bloc_1']);
    expect(couverture.unites[1]?.blocsNonCouverts).toEqual([]);
  });
});

describe('couverture — l’enveloppe reprend ce que la mission dit d’elle-même', () => {
  it('recopie le fuseau, l’horodatage et les avertissements du plan', () => {
    const couverture = calculerCouverture(entree([], []));

    expect(couverture.missionId).toBe(MISSION);
    expect(couverture.timezone).toBe('Europe/Paris');
    expect(couverture.calculeLe).toBe(CALCULE_LE);
    expect(couverture.avertissements.map((a) => a.code)).toContain(
      'aucune_unite_dans_le_perimetre',
    );
  });

  it('ne laisse échapper AUCUN identifiant d’unité dans un avertissement', () => {
    // Un avertissement voyage plus loin qu'une réponse (bandeau, journal d'un
    // appelant distrait) : il ne porte que des comptes (`plan-entretiens.ts`).
    const couverture = calculerCouverture(entree([unite(1, { inScope: false })], []));

    for (const avertissement of couverture.avertissements) {
      expect(Object.keys(avertissement).sort()).toEqual(['code', 'message']);
    }
  });
});
