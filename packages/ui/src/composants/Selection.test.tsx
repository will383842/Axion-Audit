// =============================================================================
// TESTS — SÉLECTION (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// LE POINT DUR N'EST PAS LE RENDU, C'EST L'OPTION VIDE. L'en-tête du composant
// l'énonce : « l'omettre rend la liste SANS option vide : le premier élément
// serait alors "déjà répondu" sans que personne n'ait choisi, ce qui fabrique des
// réponses que l'auditeur n'a pas données ». C'est la MÊME famille de défaut que
// celle qui a fait écarter le curseur glissant de l'échelle ancrée. Les deux
// tests ci-dessous éprouvent la promesse ET son revers, faute de quoi le premier
// serait vrai pour une mauvaise raison.
//
// Aucun libellé métier n'est écrit ici : les listes (motifs de « non communiqué »
// §27.4, types de session §27.1) sont des données de mission (invariant 2).
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Selection, type OptionSelection } from './Selection.js';

afterEach(() => {
  cleanup();
});

/** La liste déroulante, TYPÉE : `value` et `required` sont des propriétés de select. */
function liste(nom: string): HTMLSelectElement {
  return screen.getByRole('combobox', { name: nom });
}

const OPTIONS: readonly OptionSelection[] = [
  { valeur: 'a', libelle: 'Première option' },
  { valeur: 'b', libelle: 'Deuxième option' },
  { valeur: 'c', libelle: 'Option indisponible', desactivee: true },
];

describe('Selection — une liste déroulante native, nommée par son libellé', () => {
  it('expose le rôle « combobox » et son libellé français', () => {
    render(<Selection libelle="Motif" options={OPTIONS} optionVide="Choisir un motif" />);
    expect(screen.getByRole('combobox', { name: 'Motif' }).tagName).toBe('SELECT');
  });

  it('rend une option par entrée fournie, et rien de plus', () => {
    render(<Selection libelle="Motif" options={OPTIONS} />);
    const libelles = screen.getAllByRole('option').map((o) => o.textContent);
    expect(libelles).toEqual(['Première option', 'Deuxième option', 'Option indisponible']);
  });

  it('désactive l’option marquée indisponible', () => {
    render(<Selection libelle="Motif" options={OPTIONS} />);
    const option = screen.getByRole('option', { name: 'Option indisponible' });
    expect((option as HTMLOptionElement).disabled).toBe(true);
  });

  it('remonte la valeur choisie, jamais le libellé', () => {
    const onChange = vi.fn();
    render(
      <Selection libelle="Motif" options={OPTIONS} optionVide="Choisir" onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Motif' }), { target: { value: 'b' } });
    expect(liste('Motif').value).toBe('b');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Selection — ne fabrique aucune réponse que personne n’a donnée', () => {
  it('avec `optionVide`, aucune option métier n’est sélectionnée au départ', () => {
    render(<Selection libelle="Motif" options={OPTIONS} optionVide="Choisir un motif" />);
    const choix = liste('Motif');
    expect(choix.value).toBe('');
    expect(screen.getByRole('option', { name: 'Choisir un motif' })).not.toBeNull();
  });

  it('SANS `optionVide`, la première option est « déjà répondue » — le revers assumé', () => {
    // Ce test n'approuve pas le comportement : il le REND VISIBLE. Le navigateur
    // sélectionne la première option d'un `<select>` sans option vide, donc un
    // appelant qui omet `optionVide` sur une question inscrit une réponse que
    // l'auditeur n'a pas donnée. C'est la raison d'être de la propriété, et sans
    // ce test la promesse ci-dessus serait vraie sans qu'on sache de quoi elle
    // protège.
    render(<Selection libelle="Motif" options={OPTIONS} />);
    const choix = liste('Motif');
    expect(choix.value).toBe('a');
  });
});

describe('Selection — aide, erreur et obligation (§33.6)', () => {
  it('n’ajoute aucun `aria-describedby` vide', () => {
    render(<Selection libelle="Motif" options={OPTIONS} />);
    expect(screen.getByRole('combobox', { name: 'Motif' }).hasAttribute('aria-describedby')).toBe(
      false,
    );
  });

  it('relie l’aide et l’erreur au champ, et déclare l’invalidité', () => {
    render(
      <Selection
        libelle="Motif"
        options={OPTIONS}
        aide="Le motif est transmis au siège."
        erreur="Sélectionnez un motif."
      />,
    );
    const choix = liste('Motif');
    expect(choix.getAttribute('aria-invalid')).toBe('true');
    const textes = (choix.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '');
    expect(textes.some((t) => t.includes('Le motif est transmis au siège.'))).toBe(true);
    expect(textes.some((t) => t.includes('Sélectionnez un motif.'))).toBe(true);
  });

  it('marque l’obligation sur le champ lui-même', () => {
    render(<Selection libelle="Motif" options={OPTIONS} optionVide="Choisir" obligatoire />);
    expect(liste('Motif').required).toBe(true);
  });
});
