// =============================================================================
// TESTS DE CONCEPTION A20 — bloquant **B2** de la recette novice n°1 (A54,
// 2026-09-06) : « deux écrans n'ont AUCUNE sortie ».
//
// ── STATUT DE CE FICHIER ────────────────────────────────────────────────────
// Tests de CONCEPTION, écrits par A20 avec le correctif. Ce ne sont PAS les
// tests d'acceptation du bloquant : ceux-là reviennent à A27 (09 §5.6). Aucun
// n'est marqué `@critique`.
//
// Ce qu'ils tiennent, et c'est la moitié invisible de B2 : la sortie ne doit pas
// dépendre de l'écran, ni du chemin par lequel on y est arrivé. Un auditeur qui
// VERROUILLE sur un écran profond et rouvre l'application (reprise instantanée
// 03 §17.4) doit lui aussi avoir une sortie — c'est le cas que le bouton seul
// n'aurait pas couvert, parce que la pile restaurée n'avait qu'un élément.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total).
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  ETAT_NAVIGATION_INITIAL,
  estVueRacine,
  peutRevenir,
  reducteurNavigation,
  restaurerNavigation,
  vueCourante,
} from './navigation.js';
import { VUE_INITIALE } from './vues.js';

describe('B2 — la reprise ne pose jamais un écran sans dessous', () => {
  it('une vue PROFONDE mémorisée est reposée SUR sa racine : le sommet ne change pas, la sortie existe', () => {
    const etat = restaurerNavigation('pilote');
    expect(vueCourante(etat)).toBe('pilote');
    expect(peutRevenir(etat)).toBe(true);
    expect(etat.pile[0]).toBe(VUE_INITIALE);
  });

  it('« Nouvel entretien » — l’écran du blocage constaté — a lui aussi sa sortie', () => {
    expect(peutRevenir(restaurerNavigation('nouvelEntretien'))).toBe(true);
  });

  it('une vue RACINE reste seule : un retour qui ne mène nulle part serait un bouton qui ment', () => {
    expect(peutRevenir(restaurerNavigation('accueil'))).toBe(false);
    expect(peutRevenir(restaurerNavigation('aujourdhui'))).toBe(false);
    expect(estVueRacine('accueil')).toBe(true);
    expect(estVueRacine('aujourdhui')).toBe(true);
    expect(estVueRacine('pilote')).toBe(false);
  });

  it('une valeur mémorisée illisible rend l’état initial (aucun code inventé)', () => {
    expect(restaurerNavigation('vue-qui-n-existe-pas')).toEqual(ETAT_NAVIGATION_INITIAL);
    expect(restaurerNavigation(null)).toEqual(ETAT_NAVIGATION_INITIAL);
  });

  it('depuis la reprise profonde, UN retour ramène à la racine, et le suivant ne quitte pas l’app', () => {
    const repris = restaurerNavigation('pilote');
    const remonte = reducteurNavigation(repris, { type: 'retour' });
    expect(vueCourante(remonte)).toBe(VUE_INITIALE);
    expect(peutRevenir(remonte)).toBe(false);
    expect(reducteurNavigation(remonte, { type: 'retour' })).toEqual(remonte);
  });
});

describe('B2 — l’action « restaurer » repose la pile TELLE QUELLE', () => {
  it('la pile mémorisée n’est plus aplatie sur sa seule vue de sommet', () => {
    const etat = reducteurNavigation(ETAT_NAVIGATION_INITIAL, {
      type: 'restaurer',
      etat: restaurerNavigation('agenda'),
    });
    expect(etat.pile).toEqual([VUE_INITIALE, 'agenda']);
  });

  it('une pile vide ne peut pas entrer : le réducteur reste seul garant du « jamais vide »', () => {
    expect(
      reducteurNavigation(ETAT_NAVIGATION_INITIAL, { type: 'restaurer', etat: { pile: [] } }),
    ).toEqual(ETAT_NAVIGATION_INITIAL);
  });
});
