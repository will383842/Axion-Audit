// =============================================================================
// TESTS — ZONE DE NOTES (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// C'est le champ dans lequel un auditeur tape pendant qu'un interlocuteur parle.
// §33.3 (V2.8) : « taper "Rien à signaler" dans une note ne déclenche jamais
// rien » — le `R` de « Rien » ne doit pas marquer la question « à revoir ». Le
// composant ne gère pas les raccourcis ; il porte le marqueur qui permet à
// l'écran de les neutraliser. Ce test éprouve la PRÉSENCE de ce marqueur, seule
// chose qui rende la règle vérifiable ailleurs qu'à l'œil.
// Traçabilité : E13, E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ZoneNotes } from './ZoneNotes.js';

afterEach(() => {
  cleanup();
});

/** La zone de notes, TYPÉE : `value` est une propriété de textarea. */
function notes(): HTMLTextAreaElement {
  return screen.getByLabelText('Notes');
}

describe('ZoneNotes — saisie libre en entretien', () => {
  it('est une zone de texte multiligne, trouvée par son libellé', () => {
    render(<ZoneNotes libelle="Notes d’entretien" />);
    expect(screen.getByLabelText('Notes d’entretien').tagName).toBe('TEXTAREA');
  });

  it('porte `data-saisie-libre="vrai"` (§33.3 V2.8)', () => {
    render(<ZoneNotes libelle="Notes d’entretien" />);
    expect(screen.getByLabelText('Notes d’entretien').getAttribute('data-saisie-libre')).toBe(
      'vrai',
    );
  });

  it('remonte la frappe à l’écran sans rien interpréter', () => {
    // « Rien à signaler » contient R, A, N et E : quatre raccourcis du §33.3.
    // Le composant doit se contenter de transmettre le texte.
    const onChange = vi.fn();
    render(<ZoneNotes libelle="Notes" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Rien à signaler' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(notes().value).toBe('Rien à signaler');
  });
});

describe('ZoneNotes — aide et erreur (§33.6 : jamais la couleur seule)', () => {
  it('n’ajoute aucun `aria-describedby` vide', () => {
    render(<ZoneNotes libelle="Notes" />);
    expect(screen.getByLabelText('Notes').hasAttribute('aria-describedby')).toBe(false);
  });

  it('relie l’aide et l’erreur, et déclare l’invalidité', () => {
    render(<ZoneNotes libelle="Notes" aide="Visible du siège." erreur="Note trop longue." />);
    const zone = screen.getByLabelText('Notes');
    expect(zone.getAttribute('aria-invalid')).toBe('true');
    const textes = (zone.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '');
    expect(textes.some((t) => t.includes('Visible du siège.'))).toBe(true);
    expect(textes.some((t) => t.includes('Note trop longue.'))).toBe(true);
  });

  it('marque l’obligation sans polluer le nom accessible', () => {
    render(<ZoneNotes libelle="Notes" obligatoire />);
    // L'astérisque est `aria-hidden` : il se voit, il ne se lit pas.
    const zone = screen.getByRole('textbox', { name: 'Notes' });
    expect((zone as HTMLTextAreaElement).required).toBe(true);
    expect(screen.getByText('*')).not.toBeNull();
  });
});
