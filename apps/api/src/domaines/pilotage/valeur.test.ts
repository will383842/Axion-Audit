// =============================================================================
// TESTS DE L'APLATISSEMENT DES VALEURS DE RÉPONSE — écrits AVANT `valeur.ts`.
// Lot L7, incrément L7b.
//
// ⚠ Tests d'A32 (conception, TDD). L'acceptation par rôle et les quatre états
// sont écrits par A36 (09 §5.6).
//
// La forme de `answers.value` est FIXÉE par le fichier 04 (l. 149-150) :
// `{type, v}` ; `money` porte en plus `currency` (défaut `EUR`, §22.2) ;
// une fourchette est `{type:'range', low, high}` (§27.4). Rien n'est deviné ici :
// ces tests transcrivent ces trois lignes, et le comportement de repli sur toute
// forme que le 04 ne décrit pas.
//
// Traçabilité : E14 (consolidation, divergences, radar) · E36 (exécutable par
// lots avec critères).
// =============================================================================
import { describe, expect, it } from 'vitest';
import { aplatirValeur } from './valeur.js';

const OPTIONS = [
  { code: 'a', label: 'Tout à fait', score: 5 },
  { code: 'b', label: 'Partiellement', score: 3 },
];

describe('aplatirValeur — l’absence de valeur est une absence, pas une chaîne vide', () => {
  it('rend `null` pour une valeur nulle ou absente', () => {
    expect(aplatirValeur(null, null)).toBeNull();
    expect(aplatirValeur(undefined, null)).toBeNull();
  });

  it('rend `null` pour un objet sans `v` ni bornes — un refus n’a pas de valeur', () => {
    expect(aplatirValeur({ type: 'number' }, null)).toBeNull();
  });
});

describe('aplatirValeur — les formes que le fichier 04 décrit', () => {
  it('oui / non est rendu en FRANÇAIS, jamais en code', () => {
    expect(aplatirValeur({ type: 'yes_no', v: 'oui' }, null)).toBe('Oui');
    expect(aplatirValeur({ type: 'yes_no', v: 'non' }, null)).toBe('Non');
  });

  it('une échelle 1-5 rend sa borne haute avec elle — « 3 / 5 » se relit seul', () => {
    expect(aplatirValeur({ type: 'scale_1_5', v: 3 }, null)).toBe('3 / 5');
  });

  it('un choix rend son LIBELLÉ, jamais son code (§36.3)', () => {
    expect(aplatirValeur({ type: 'single_choice', v: 'b' }, OPTIONS)).toBe('Partiellement');
  });

  it('un choix multiple rend ses libellés, dans l’ordre des options', () => {
    expect(aplatirValeur({ type: 'multi_choice', v: ['b', 'a'] }, OPTIONS)).toBe(
      'Tout à fait, Partiellement',
    );
  });

  it('un code de choix inconnu des options est rendu TEL QUEL, jamais escamoté', () => {
    expect(aplatirValeur({ type: 'single_choice', v: 'z' }, OPTIONS)).toBe('z');
  });

  it('une fourchette (§27.4) est rendue « 20 – 30 »', () => {
    expect(aplatirValeur({ type: 'range', low: 20, high: 30 }, null)).toBe('20 – 30');
  });

  it('une fourchette de montants porte sa devise', () => {
    expect(aplatirValeur({ type: 'range', low: 20, high: 30, currency: 'EUR' }, null)).toBe(
      '20 – 30 EUR',
    );
  });

  it('un montant porte sa devise (§22.2)', () => {
    expect(aplatirValeur({ type: 'money', v: 1200, currency: 'CHF' }, null)).toBe('1200 CHF');
  });

  it('un pourcentage porte son signe', () => {
    expect(aplatirValeur({ type: 'percent', v: 42 }, null)).toBe('42 %');
  });

  it('un texte libre est rendu tel quel', () => {
    expect(aplatirValeur({ type: 'free_text', v: 'Rien à signaler' }, null)).toBe(
      'Rien à signaler',
    );
  });

  it('un tableau est rendu en JSON — lisible, et jamais tronqué (§36.3)', () => {
    expect(aplatirValeur({ type: 'table', v: [{ a: 1 }] }, null)).toBe('[{"a":1}]');
  });
});

describe('aplatirValeur — les formes que le 04 ne décrit PAS ne font pas tomber l’écran', () => {
  it('une valeur scalaire nue est rendue telle quelle', () => {
    expect(aplatirValeur(4, null)).toBe('4');
    expect(aplatirValeur('libre', null)).toBe('libre');
  });

  it('une forme inconnue est rendue en JSON plutôt que perdue', () => {
    expect(aplatirValeur({ inattendu: true }, null)).toBe('{"inattendu":true}');
  });

  it('des options malformées n’empêchent pas de rendre le code', () => {
    expect(aplatirValeur({ type: 'single_choice', v: 'a' }, 'pas un tableau')).toBe('a');
  });
});
