// =============================================================================
// TESTS — SEGMENTÉ OUI / NON / SANS OBJET (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// C'est le contrôle le plus frappé de la journée. Trois exigences s'y éprouvent :
//   · TROIS VALEURS ET PAS QUATRE — « non communiqué » (§27.4) est un STATUT qui
//     vaut pour TOUS les types de réponse, pas un quatrième segment ; l'ajouter
//     ici ferait de §27.4 une fonctionnalité à moitié livrée, réservée aux
//     questions oui/non. Le test compte donc les segments ;
//   · « PAS ENCORE RÉPONDU » SE DISTINGUE DE « NON » — même exigence que sur
//     l'échelle ancrée, et même conséquence si elle tombe : une réponse négative
//     inscrite au dossier sans que personne l'ait donnée ;
//   · §33.6 — chaque segment porte un MOT, jamais une couleur seule.
// Traçabilité : E13, E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmenteONA, type ReponseONA } from './SegmenteONA.js';

afterEach(() => {
  cleanup();
});

const LIBELLE = 'Un plan de prévention est-il affiché ?';

function segments(): HTMLInputElement[] {
  return screen.getAllByRole('radio');
}

describe('SegmenteONA — trois valeurs, et pas quatre', () => {
  it('rend exactement trois segments', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} />);
    expect(segments().map((s) => s.value)).toEqual(['oui', 'non', 'na']);
  });

  it('écrit « Sans objet » — le mot d’un auditeur, distinct de « non » à l’oreille', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} />);
    expect(screen.getByText('Oui')).not.toBeNull();
    expect(screen.getByText('Non')).not.toBeNull();
    expect(screen.getByText('Sans objet')).not.toBeNull();
  });

  it('n’offre AUCUN segment « non communiqué » (§27.4 est un statut, pas un segment)', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} />);
    expect(screen.queryByText(/non communiqué/i)).toBeNull();
    expect(segments().length).toBe(3);
  });

  it('conserve `na` comme code technique, quel que soit le mot affiché', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur="na" onChangement={vi.fn()} />);
    const coche = segments().find((s) => s.checked);
    expect(coche?.value).toBe('na');
  });
});

describe('SegmenteONA — « pas encore répondu » se distingue de « Non »', () => {
  it('ne coche aucun segment quand la valeur est `null`', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} />);
    expect(segments().filter((s) => s.checked)).toEqual([]);
  });

  it('coche « Non » — et lui seul — quand la réponse est réellement « non »', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur="non" onChangement={vi.fn()} />);
    const coches = segments().filter((s) => s.checked);
    expect(coches.length).toBe(1);
    expect(coches[0]?.value).toBe('non');
  });

  it('n’émet aucune réponse au simple rendu', () => {
    const onChangement = vi.fn();
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={onChangement} />);
    expect(onChangement).not.toHaveBeenCalled();
  });
});

describe('SegmenteONA — le geste et le groupe', () => {
  it('remonte le code de la réponse frappée', () => {
    const cas: readonly ReponseONA[] = ['oui', 'non', 'na'];
    for (const attendu of cas) {
      const onChangement = vi.fn();
      const { unmount } = render(
        <SegmenteONA libelle={LIBELLE} valeur={null} onChangement={onChangement} />,
      );
      const segment = segments().find((s) => s.value === attendu);
      if (segment !== undefined) fireEvent.click(segment);
      expect(onChangement).toHaveBeenCalledWith(attendu);
      unmount();
    }
  });

  it('regroupe les segments sous l’intitulé de la question', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} />);
    expect(screen.getByRole('group', { name: LIBELLE })).not.toBeNull();
  });

  it('isole deux questions rendues côte à côte', () => {
    render(
      <>
        <SegmenteONA libelle="Question A" valeur="oui" onChangement={vi.fn()} />
        <SegmenteONA libelle="Question B" valeur="non" onChangement={vi.fn()} />
      </>,
    );
    const coches = segments().filter((s) => s.checked);
    expect(coches.map((s) => s.value).sort()).toEqual(['non', 'oui']);
  });

  it('désactive les trois segments quand l’écran l’exige', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} desactive />);
    expect(segments().every((s) => s.disabled)).toBe(true);
  });
});

describe('SegmenteONA — §33.3 : les raccourcis O / N / A s’affichent pour s’apprendre', () => {
  it('n’affiche aucun rappel de touche par défaut', () => {
    render(<SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} />);
    expect(screen.queryByText(/touche O/)).toBeNull();
  });

  it('affiche les touches O, N et A quand l’écran le demande', () => {
    render(
      <SegmenteONA libelle={LIBELLE} valeur={null} onChangement={vi.fn()} afficherRaccourcis />,
    );
    expect(screen.getByText('touche O')).not.toBeNull();
    expect(screen.getByText('touche N')).not.toBeNull();
    // « A » et non « S » : le code de la valeur est `na`, la touche du §33.3 est A.
    expect(screen.getByText('touche A')).not.toBeNull();
  });

  it('remplace le rappel de touche par la marque sur le segment retenu', () => {
    render(
      <SegmenteONA libelle={LIBELLE} valeur="oui" onChangement={vi.fn()} afficherRaccourcis />,
    );
    expect(screen.queryByText('touche O')).toBeNull();
    expect(screen.getByText('touche N')).not.toBeNull();
  });
});
