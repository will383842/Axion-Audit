// =============================================================================
// TESTS — BADGE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// L'exigence testée est §33.6 / invariant 4 : « aucune information portée par la
// couleur seule ». Un badge de statut est LE composant où cette faute se commet —
// une pastille terracotta « se comprend », jusqu'à ce qu'on la photocopie, qu'on
// la regarde avec une deutéranopie, ou qu'on l'écoute. Le composant impose donc
// `children` par son type ; ces tests vérifient que le MOT arrive bien à l'écran
// pour chacun des tons, et que le ton seul n'ajoute jamais de texte caché.
//
// Aucun statut métier n'est écrit ici (invariant 2) : « à revoir » ou « non
// communiqué » sont des libellés d'appelant, pas une liste du design system.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge, type TonBadge } from './Badge.js';
import { IconeAlerte } from './icones.js';

afterEach(() => {
  cleanup();
});

const TONS: readonly TonBadge[] = ['neutre', 'action', 'info', 'succes', 'avertissement', 'alerte'];

describe('Badge — §33.6 : le mot porte l’information, jamais la seule couleur', () => {
  it.each(TONS)('le ton « %s » affiche toujours le libellé fourni', (ton) => {
    render(<Badge ton={ton}>Statut lisible</Badge>);
    expect(screen.getByText('Statut lisible')).not.toBeNull();
  });

  it('rend le MÊME texte quel que soit le ton (la couleur n’ajoute aucun sens)', () => {
    // Si un ton ajoutait un mot invisible ou en changeait un, deux badges de tons
    // différents ne se liraient pas pareil — et le sens tiendrait à la couleur.
    const { container: neutre } = render(<Badge>Statut lisible</Badge>);
    const { container: alerte } = render(<Badge ton="alerte">Statut lisible</Badge>);
    expect(alerte.textContent).toBe(neutre.textContent);
  });
});

describe('Badge — l’icône DOUBLE le mot, elle ne le remplace pas', () => {
  it('laisse le texte lisible quand une icône l’accompagne', () => {
    const { container } = render(
      <Badge ton="alerte" icone={<IconeAlerte />}>
        À revoir
      </Badge>,
    );
    expect(screen.getByText('À revoir')).not.toBeNull();
    const icone = container.querySelector('svg');
    expect(icone).not.toBeNull();
    // L'icône est hors de l'arbre d'accessibilité : le badge se lit « À revoir »,
    // pas « image À revoir ».
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reste lisible SANS icône (l’icône n’est jamais le porteur)', () => {
    const { container } = render(<Badge ton="alerte">À revoir</Badge>);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText('À revoir')).not.toBeNull();
  });
});
