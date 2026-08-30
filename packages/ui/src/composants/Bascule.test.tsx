// =============================================================================
// TESTS — BASCULE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.6 : « aucune information portée par la couleur seule ». Une bascule est le
// contrôle le plus exposé à cette faute — la piste colorée SUFFIT visuellement,
// donc on s'en contente, et l'état devient invisible en photocopie, pour un
// daltonien et pour un lecteur d'écran. Ces tests exigent donc DEUX porteurs de
// l'état : `aria-checked` (la machine) et un MOT en français (l'œil).
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Bascule } from './Bascule.js';

afterEach(() => {
  cleanup();
});

describe('Bascule — un interrupteur, pas une case à cocher', () => {
  it('expose le rôle « switch » (« activé / désactivé », pas « coché »)', () => {
    render(<Bascule libelle="Mode écran partagé" actif={false} onBasculer={vi.fn()} />);
    expect(screen.getByRole('switch')).not.toBeNull();
  });

  it('annonce son état à la machine par `aria-checked`', () => {
    const { rerender } = render(
      <Bascule libelle="Mode écran partagé" actif={false} onBasculer={vi.fn()} />,
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    rerender(<Bascule libelle="Mode écran partagé" actif onBasculer={vi.fn()} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('n’envoie jamais de soumission de formulaire (le défaut HTML est `submit`)', () => {
    const soumission = vi.fn((evenement: { preventDefault: () => void }) => {
      evenement.preventDefault();
    });
    render(
      <form onSubmit={soumission}>
        <Bascule libelle="Mode écran partagé" actif={false} onBasculer={vi.fn()} />
      </form>,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(soumission).not.toHaveBeenCalled();
  });
});

describe('Bascule — §33.6 : l’état s’écrit EN TOUTES LETTRES, pas seulement en couleur', () => {
  it('inscrit le mot d’état dans le nom accessible, à l’état inactif', () => {
    render(<Bascule libelle="Mode écran partagé" actif={false} onBasculer={vi.fn()} />);
    // Le nom accessible contient le mot d'état : il est donc LU, et il est écrit
    // à l'écran (c'est le même nœud de texte). La piste colorée est `aria-hidden`.
    expect(screen.getByRole('switch', { name: /désactivé/ })).not.toBeNull();
    expect(screen.getByText(/Mode écran partagé — désactivé/)).not.toBeNull();
  });

  it('inscrit le mot d’état à l’état actif', () => {
    render(<Bascule libelle="Mode écran partagé" actif onBasculer={vi.fn()} />);
    expect(screen.getByRole('switch', { name: /activé/ })).not.toBeNull();
  });

  it('accepte des mots d’état choisis par l’appelant, en français', () => {
    render(
      <Bascule
        libelle="Notifications"
        actif
        onBasculer={vi.fn()}
        libelleActif="en marche"
        libelleInactif="à l’arrêt"
      />,
    );
    expect(screen.getByRole('switch', { name: /en marche/ })).not.toBeNull();
  });
});

describe('Bascule — le geste', () => {
  it('demande l’état INVERSE de l’état courant', () => {
    const onBasculer = vi.fn();
    const { rerender } = render(
      <Bascule libelle="Mode écran partagé" actif={false} onBasculer={onBasculer} />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onBasculer).toHaveBeenLastCalledWith(true);

    rerender(<Bascule libelle="Mode écran partagé" actif onBasculer={onBasculer} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onBasculer).toHaveBeenLastCalledWith(false);
  });

  it('ne bascule pas quand elle est désactivée', () => {
    const onBasculer = vi.fn();
    render(<Bascule libelle="Mode écran partagé" actif={false} disabled onBasculer={onBasculer} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onBasculer).not.toHaveBeenCalled();
  });
});
