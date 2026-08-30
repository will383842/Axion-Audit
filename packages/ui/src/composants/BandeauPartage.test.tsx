// =============================================================================
// TESTS — BANDEAU « ÉCRAN PARTAGÉ » (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.3, MODE ÉCRAN PARTAGÉ : « un toggle (icône œil, raccourci E) masque
// INSTANTANÉMENT tout ce qui est interne […] ÉTAT VISIBLE EN PERMANENCE
// (bandeau fin "écran partagé") ».
//
// ── CE QU'IL FAUT PROUVER, ET POURQUOI C'EST L'INVERSE D'UN TEST HABITUEL ─────
// L'auteur écrit que ce composant NE MASQUE RIEN, délibérément : un masquage par
// CSS laisserait le contenu interne DANS LE DOM — donc dans une capture d'écran,
// dans un « inspecter », dans un lecteur d'écran. Ce serait « une fuite déguisée
// en fonctionnalité, sur le seul composant dont la raison d'être est d'empêcher
// une fuite ». Les tests ci-dessous vérifient donc une ABSENCE d'effet : monté à
// côté d'un contenu interne, le bandeau ne le retire pas, ne le cache pas, ne le
// sort pas de l'arbre d'accessibilité. Le masquage appartient à l'écran, qui
// décide de NE PAS RENDRE les notes.
//
// ── ET POURQUOI LE BANDEAU RESTE VISIBLE QUAND LE MODE EST INACTIF ───────────
// « L'erreur dangereuse n'est pas d'oublier d'activer le mode : c'est de CROIRE
// qu'il est actif quand il ne l'est pas. » Un bandeau qui n'apparaîtrait qu'en
// mode partagé rendrait son absence ambiguë. Les deux états sont donc éprouvés.
//
// ── RÉSERVE REMONTÉE, NON CORRIGÉE ICI (09 §5.6) ─────────────────────────────
// À l'état actif, le bandeau AFFIRME « les éléments internes sont masqués ».
// C'est une affirmation sur l'écran, que ce composant ne peut pas garantir : si
// l'écran appelant oublie de retirer ses notes, le bandeau dit vrai sur l'état du
// mode et faux sur le fait. Constaté par le dernier test, non modifié.
// Traçabilité : E13, E27, E44.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BandeauPartage } from './BandeauPartage.js';

afterEach(() => {
  cleanup();
});

const NOTE_INTERNE = 'Note interne : l’interlocuteur élude la question des contrôles.';

describe('BandeauPartage — l’état est visible EN PERMANENCE, dans les deux sens', () => {
  it('affirme l’état PRIVÉ en toutes lettres quand le mode est inactif', () => {
    render(<BandeauPartage actif={false} onBasculer={vi.fn()} />);
    const bandeau = screen.getByRole('status');
    expect(bandeau.textContent).toContain('Écran privé — les éléments internes sont visibles');
  });

  it('affirme l’état PARTAGÉ en toutes lettres quand le mode est actif', () => {
    render(<BandeauPartage actif onBasculer={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Écran partagé');
  });

  it('est rendu dans LES DEUX états — son absence ne peut jamais être ambiguë', () => {
    const { unmount } = render(<BandeauPartage actif={false} onBasculer={vi.fn()} />);
    expect(screen.getByRole('status').isConnected).toBe(true);
    unmount();
    render(<BandeauPartage actif onBasculer={vi.fn()} />);
    expect(screen.getByRole('status').isConnected).toBe(true);
  });

  it('ne se contente pas de l’œil : l’icône est hors de l’arbre d’accessibilité (§33.6)', () => {
    const { container } = render(<BandeauPartage actif onBasculer={vi.fn()} />);
    const icone = container.querySelector('svg');
    expect(icone).not.toBeNull();
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
  });

  it('lit les deux états DIFFÉREMMENT (aucun sens porté par la seule couleur)', () => {
    const { container: prive, unmount } = render(
      <BandeauPartage actif={false} onBasculer={vi.fn()} />,
    );
    const textePrive = prive.textContent;
    unmount();
    const { container: partage } = render(<BandeauPartage actif onBasculer={vi.fn()} />);
    expect(partage.textContent).not.toBe(textePrive);
  });
});

describe('BandeauPartage — le geste, et le raccourci qui s’apprend', () => {
  it('expose un bouton dont le libellé dit ce qui va se passer', () => {
    const { rerender } = render(<BandeauPartage actif={false} onBasculer={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Passer en écran partagé/ })).not.toBeNull();
    rerender(<BandeauPartage actif onBasculer={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Revenir en écran privé/ })).not.toBeNull();
  });

  it('annonce l’état du mode par `aria-pressed`', () => {
    const { rerender } = render(<BandeauPartage actif={false} onBasculer={vi.fn()} />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
    rerender(<BandeauPartage actif onBasculer={vi.fn()} />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('demande l’état inverse, dans les deux sens', () => {
    const onBasculer = vi.fn();
    const { rerender } = render(<BandeauPartage actif={false} onBasculer={onBasculer} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onBasculer).toHaveBeenLastCalledWith(true);
    rerender(<BandeauPartage actif onBasculer={onBasculer} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onBasculer).toHaveBeenLastCalledWith(false);
  });

  it('n’affiche le rappel « touche E » que si l’écran le demande (§33.3, poste PC)', () => {
    const { rerender } = render(<BandeauPartage actif={false} onBasculer={vi.fn()} />);
    expect(screen.queryByText('(touche E)')).toBeNull();
    rerender(<BandeauPartage actif={false} onBasculer={vi.fn()} afficherRaccourci />);
    expect(screen.getByText('(touche E)')).not.toBeNull();
  });
});

describe('BandeauPartage — IL NE MASQUE RIEN, et c’est la garantie qu’on éprouve', () => {
  function ecranAvecNote(actif: boolean) {
    // L'écran RÉEL retirerait la note du rendu. Ici on la laisse exprès : c'est
    // le seul moyen de prouver que le bandeau, lui, n'y touche pas.
    return (
      <div>
        <BandeauPartage actif={actif} onBasculer={vi.fn()} />
        <p>{NOTE_INTERNE}</p>
      </div>
    );
  }

  it('ne retire pas du DOM le contenu interne quand le mode devient actif', () => {
    const { rerender } = render(ecranAvecNote(false));
    expect(screen.getByText(NOTE_INTERNE)).not.toBeNull();
    rerender(ecranAvecNote(true));
    expect(screen.getByText(NOTE_INTERNE)).not.toBeNull();
  });

  it('ne pose NI `hidden` NI `aria-hidden` sur le contenu voisin', () => {
    // Un masquage par attribut serait exactement la « fuite déguisée en
    // fonctionnalité » que l'en-tête refuse : le texte resterait capturable.
    render(ecranAvecNote(true));
    const note = screen.getByText(NOTE_INTERNE);
    expect(note.hasAttribute('hidden')).toBe(false);
    expect(note.closest('[aria-hidden="true"]')).toBeNull();
    expect(note.closest('[hidden]')).toBeNull();
  });

  it('ne rend RIEN d’autre que son propre bandeau — aucun voile, aucun filtre', () => {
    const { container } = render(<BandeauPartage actif onBasculer={vi.fn()} />);
    expect(container.childElementCount).toBe(1);
    expect(container.firstElementChild).toBe(screen.getByRole('status'));
  });

  it('n’accepte aucun contenu à masquer : sa surface n’est pas un conteneur', () => {
    // Le composant n'a pas de `children` : rien d'interne ne peut lui être confié,
    // donc rien ne peut être « caché à l'intérieur ». La garantie est structurelle.
    render(<BandeauPartage actif onBasculer={vi.fn()} />);
    const bandeau = screen.getByRole('status');
    expect(bandeau.textContent).not.toContain(NOTE_INTERNE);
  });

  it('CONSTAT : le bandeau AFFIRME un masquage qu’il n’opère pas lui-même', () => {
    // Réserve remontée au chef de lot, non corrigée ici (09 §5.6). Le mot
    // « masqués » est une affirmation sur l'écran ; si l'écran appelant oublie de
    // ne pas rendre ses notes, la phrase reste affichée et devient fausse devant
    // l'interlocuteur. Ce test rend la dépendance VISIBLE au lieu de la supposer.
    render(ecranAvecNote(true));
    expect(screen.getByRole('status').textContent).toContain('les éléments internes sont masqués');
    expect(screen.getByText(NOTE_INTERNE)).not.toBeNull();
  });
});
