// =============================================================================
// LA COUVERTURE À L'ÉCHELLE FIL-GC — 150 unités, 4 niveaux, 60 sessions.
// Lot L7, incrément L7b. Tests d'A32 (TDD de conception, voir `couverture.test.ts`).
//
// ── CE QUE CE FICHIER MESURE, ET CE QU'IL NE MESURE PAS ─────────────────────
// Il mesure le COÛT DE L'ASSEMBLAGE : ce que coûte `calculerCouverture` sur le
// jeu FIL-GC (09 §4), c'est-à-dire la seule part du chemin qui soit du calcul.
// Il ne mesure PAS le p95 HTTP de bout en bout : celui-là inclut PostgreSQL, le
// réseau et la sérialisation, il se mesure sous k6 avec une base réelle, et
// c'est **A28** qui le tient. Confondre les deux donnerait un chiffre rassurant
// qui ne répond pas à la question de la porte P-E.
//
// ── POURQUOI LA BORNE EST LARGE, ET POURQUOI C'EST LE BON CHOIX ─────────────
// Le budget de la porte est 100 ms pour la REQUÊTE ENTIÈRE. Si l'assemblage
// consommait déjà une fraction notable de ce budget, le reste du chemin ne
// tiendrait pas. La borne posée ici (25 ms) est donc un GARDE-FOU DE
// NON-RÉGRESSION, très au-dessus de la mesure réelle : elle ne se déclenche que
// si quelqu'un introduit un parcours quadratique — le défaut qui ne se voit sur
// aucune petite mission et qui casse exactement à l'échelle du grand compte.
// Une borne serrée, elle, rougirait sur une machine de CI chargée, et un test
// qui rougit au hasard finit par être ignoré.
//
// ── LE DÉFAUT QUE CE FICHIER SURVEILLE, NOMMÉ ──────────────────────────────
// `calculerCouverture` reçoit 150 unités, ~300 lignes de décompte et ~900 blocs
// touchés. Écrit naïvement — un `find` dans une liste pour chaque cellule — il
// serait en O(unités × sources × comptes), soit ~225 000 comparaisons par page.
// Les trois index (`indexerComptes`, `profondeurs`, `touchesParUnite`) le
// ramènent à un parcours linéaire. Ce test est ce qui empêche de les retirer.
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E35
// (scalabilité) · E36 (exécutable par lots avec critères).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { genererPlan, type UnitePourPlan } from '../plan-entretiens/generateur.js';
import { calculerCouverture, type CompteSessionsUnite } from './couverture.js';

/** Le jeu FIL-GC du 09 §4 : grand compte, 150 unités sur 4 niveaux. */
const UNITES_FIL_GC = 150;
const ENFANTS_PAR_NIVEAU = 5;
const BLOCS_ACTIFS = [
  'bloc_1',
  'bloc_2',
  'bloc_3',
  'bloc_4',
  'bloc_5',
  'bloc_6',
  'bloc_7',
  'bloc_8',
  'bloc_9',
];

/** Garde-fou de non-régression, très au-dessus de la mesure — voir l'en-tête. */
const BUDGET_ASSEMBLAGE_MS = 25;

function identifiant(n: number): string {
  return `01890000-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

/** Un arbre à 4 niveaux : une racine, puis 5 enfants par nœud. */
function arbreFilGc(): UnitePourPlan[] {
  return Array.from({ length: UNITES_FIL_GC }, (_, index) => ({
    id: identifiant(index),
    missionId: identifiant(9999),
    parentId: index === 0 ? null : identifiant(Math.floor((index - 1) / ENFANTS_PAR_NIVEAU)),
    kind: 'service' as const,
    name: `Unité ${String(index)}`,
    // 51-200 : la tranche §32.4 qui exige des entretiens ET une observation —
    // c'est celle qui fait travailler les DEUX axes du §27.1.
    headcount: 120,
    inScope: true,
    status: 'active' as const,
    position: index,
  }));
}

describe('couverture — échelle FIL-GC : 150 unités, 4 niveaux, deux axes', () => {
  const unites = arbreFilGc();
  const comptes: CompteSessionsUnite[] = unites.flatMap((unite) => [
    { orgUnitId: unite.id, kind: 'entretien' as const, planifie: 4, realise: 3, nonAnnulees: 4 },
    { orgUnitId: unite.id, kind: 'observation' as const, planifie: 1, realise: 1, nonAnnulees: 1 },
  ]);
  const blocsTouches = unites.flatMap((unite) =>
    BLOCS_ACTIFS.slice(0, 6).map((blocCode) => ({ orgUnitId: unite.id, blocCode })),
  );
  const plan = genererPlan({
    mission: { id: identifiant(9999), auditLevel: 'strategique_groupe' },
    unites,
    profils: [],
    genereLe: null,
  });

  function calculer(page: readonly UnitePourPlan[]) {
    return calculerCouverture({
      plan,
      toutesLesUnites: unites,
      unitesDeLaPage: page,
      comptes,
      blocsTouches,
      blocsActifs: BLOCS_ACTIFS,
      timezone: 'Europe/Paris',
      calculeLe: '2026-09-05T08:00:00.000Z',
      nextCursor: 'curseur-opaque',
    });
  }

  it('rend une page de 50 lignes et des marges sur les 150 unités', () => {
    const couverture = calculer(unites.slice(0, 50));

    expect(couverture.unites).toHaveLength(50);
    expect(couverture.marges.unitesInScope).toBe(UNITES_FIL_GC);
    expect(couverture.marges.parSource).toHaveLength(5);
  });

  it('les MARGES sont identiques page 1, page 2 et page 3 (jamais la page)', () => {
    const page1 = calculer(unites.slice(0, 50));
    const page2 = calculer(unites.slice(50, 100));
    const page3 = calculer(unites.slice(100, 150));

    expect(page2.marges).toEqual(page1.marges);
    expect(page3.marges).toEqual(page1.marges);
  });

  it('l’arbre garde ses 4 niveaux — l’indentation reste lisible', () => {
    const couverture = calculer(unites);
    const profondeurs = new Set(couverture.unites.map((u) => u.profondeur));

    expect([...profondeurs].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('l’axe B reste en défaut là où le plan exige plus que ce qui est fait', () => {
    // 150 unités × 4-6 entretiens exigés : 3 réalisés par unité ne suffisent pas.
    const couverture = calculer(unites.slice(0, 50));
    const entretien = couverture.marges.parSource.find((c) => c.kind === 'entretien');
    const observation = couverture.marges.parSource.find((c) => c.kind === 'observation');

    expect(entretien?.couvert).toBe(false);
    expect(observation?.couvert).toBe(true);
    expect(couverture.unites.every((u) => u.sourcesCouvertes === 1)).toBe(true);
    expect(couverture.unites.every((u) => u.sourcesAttendues === 2)).toBe(true);
  });

  it('l’assemblage reste LINÉAIRE : un parcours quadratique ferait rougir ce test', () => {
    const debut = performance.now();
    const passages = 200;
    for (let n = 0; n < passages; n += 1) calculer(unites.slice(0, 50));
    const parCalcul = (performance.now() - debut) / passages;

    // La mesure est IMPRIMÉE, pas seulement assérée : une borne verte ne dit pas
    // de combien on est en dessous, et c'est ce chiffre-là qu'A28 confronte au
    // p95 de bout en bout. Relevé du 2026-09-05 : 1,465 ms par calcul.
    // eslint-disable-next-line no-console -- la mesure doit être lisible en CI
    console.log(
      `FIL-GC — assemblage : ${parCalcul.toFixed(3)} ms par calcul (budget ${String(BUDGET_ASSEMBLAGE_MS)} ms)`,
    );
    expect(parCalcul).toBeLessThan(BUDGET_ASSEMBLAGE_MS);
  });
});
