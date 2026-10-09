// =============================================================================
// LE DIALOGUE « AJOUTER UNE QUESTION » NE CRÉE JAMAIS SANS BLOC — revue A29 de L6a,
// arbitrage B1 du 2026-10-09. TEST D'INTERFACE ÉCRIT AVANT LE CODE.
//
// Écrit par A26 (09 §5.6) depuis l'arbitrage B1 : « le dialogue prend le bloc de la
// question courante, sinon celui de la question de banque la plus proche, sinon il
// demande » ; 03 §19.1 (un bouton grisé dit ce qui manque) ; la convention des
// tests M1 (`boutonsGrises.recette-m1.test.tsx`).
//
// ── API ATTENDUE (pour A25) ──────────────────────────────────────────────────
//   ProprietesDialogueQuestionAdHoc += {
//     readonly blocPropose: string | null;   // `blocPourQuestionAdHoc(...)`, calculé par l'écran
//     readonly blocs: readonly { readonly code: string; readonly libelle: string }[];
//   }
//   SaisieQuestionAdHoc += { readonly blockCode: string };   // jamais null
//   EcranEntretien : passe `blocPropose` / `blocs`, et ne code plus
//   `blockCode: question?.blockCode ?? null`.
//
// Traçabilité : 03 §17.5, §19.1 ; 11 §4.
// =============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogueQuestionAdHoc, type SaisieQuestionAdHoc } from './DialogueQuestionAdHoc.js';

const BLOCS = [
  { code: 'bloc_a', libelle: 'Bloc fictif A' },
  { code: 'bloc_b', libelle: 'Bloc fictif B' },
];

function boutonCreer(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: /créer et y répondre/i });
}

/** Le motif VISIBLE d'un bouton désactivé (aria-describedby résolu vers un nœud rendu). */
function motif(bouton: HTMLButtonElement): string {
  return (bouton.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

function saisirTexte(): void {
  fireEvent.change(screen.getByLabelText(/^question/i), {
    target: { value: 'Question ad hoc fictive ?' },
  });
}

describe('DialogueQuestionAdHoc — bloc obligatoire (B1)', () => {
  it('bloc proposé (courante ou banque la plus proche) : la création le porte sans rien demander', async () => {
    const onCreer = vi.fn<(saisie: SaisieQuestionAdHoc) => Promise<void>>(() => Promise.resolve());
    render(
      <DialogueQuestionAdHoc
        ouvert
        blocPropose="bloc_b"
        blocs={BLOCS}
        onCreer={onCreer}
        onFermer={() => undefined}
      />,
    );

    saisirTexte();
    fireEvent.click(boutonCreer());

    await waitFor(() => {
      expect(onCreer).toHaveBeenCalledTimes(1);
    });
    expect(onCreer.mock.calls[0]?.[0].blockCode).toBe('bloc_b');
  });

  it('aucun bloc proposé : le dialogue DEMANDE, et « Créer » reste grisé en disant pourquoi', () => {
    const onCreer = vi.fn<(saisie: SaisieQuestionAdHoc) => Promise<void>>(() => Promise.resolve());
    render(
      <DialogueQuestionAdHoc
        ouvert
        blocPropose={null}
        blocs={BLOCS}
        onCreer={onCreer}
        onFermer={() => undefined}
      />,
    );

    saisirTexte();

    expect(screen.getByLabelText(/bloc/i)).toBeDefined();
    const creer = boutonCreer();
    expect(creer.disabled).toBe(true);
    expect(motif(creer)).toMatch(/bloc/i);
    fireEvent.click(creer);
    expect(onCreer).not.toHaveBeenCalled();
  });

  it('aucun bloc proposé : une fois le bloc choisi, la création part avec CE code', async () => {
    const onCreer = vi.fn<(saisie: SaisieQuestionAdHoc) => Promise<void>>(() => Promise.resolve());
    render(
      <DialogueQuestionAdHoc
        ouvert
        blocPropose={null}
        blocs={BLOCS}
        onCreer={onCreer}
        onFermer={() => undefined}
      />,
    );

    saisirTexte();
    fireEvent.change(screen.getByLabelText(/bloc/i), { target: { value: 'bloc_a' } });
    const creer = boutonCreer();
    expect(creer.disabled).toBe(false);
    fireEvent.click(creer);

    await waitFor(() => {
      expect(onCreer).toHaveBeenCalledTimes(1);
    });
    expect(onCreer.mock.calls[0]?.[0].blockCode).toBe('bloc_a');
  });
});

describe('EcranEntretien — ne fabrique plus de question ad hoc sans bloc (B1)', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'EcranEntretien.tsx'), 'utf8').replace(
    /\/\/.*$/gm,
    '',
  );

  it('plus de repli « ?? null » sur le bloc', () => {
    expect(source).not.toMatch(/blockCode:\s*[^,\n]*\?\?\s*null/);
  });

  it('le bloc proposé vient de blocPourQuestionAdHoc et est passé au dialogue', () => {
    expect(source).toMatch(/\bblocPourQuestionAdHoc\(/);
    expect(source).toMatch(/<DialogueQuestionAdHoc[^>]*\bblocPropose=/s);
  });
});
