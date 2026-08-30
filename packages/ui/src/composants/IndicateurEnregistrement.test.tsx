// =============================================================================
// TESTS — INDICATEUR « ENREGISTRÉ » (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §33.3 : « MICRO-INDICATEUR "Enregistré" — l'enregistrement continu (§17.4)
// devient VISIBLE : pastille furtive à chaque écriture locale ; LA CONFIANCE SE
// VOIT. » C'est un critère de la porte P-C (§33.7).
//
// « FURTIVE » A UNE CONSÉQUENCE TESTABLE, et c'est elle qui compte ici :
// l'indicateur doit OCCUPER SA PLACE même inactif. Un indicateur qui n'existe
// pas quand il n'a rien à dire fait sauter la ligne à chaque frappe, et un écran
// qui tressaute pendant qu'on écrit inquiète plus qu'il ne rassure. Le test
// vérifie donc que l'élément est RENDU à l'état inactif — sans texte.
//
// §17.3 : `aria-live="polite"`. Annoncer « Enregistré » toutes les deux secondes
// dans l'oreille d'un auditeur malvoyant serait insupportable ; `assertive` le
// ferait. Le rôle et la politesse sont donc éprouvés dans les trois états.
// Traçabilité : E13, E27.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IndicateurEnregistrement, type EtatEnregistrement } from './IndicateurEnregistrement.js';

afterEach(() => {
  cleanup();
});

const ETATS: readonly EtatEnregistrement[] = ['inactif', 'enregistrement', 'enregistre'];

describe('IndicateurEnregistrement — la confiance SE VOIT', () => {
  it('annonce l’écriture en cours', () => {
    render(<IndicateurEnregistrement etat="enregistrement" />);
    expect(screen.getByRole('status').textContent).toBe('Enregistrement…');
  });

  it('annonce l’écriture faite', () => {
    render(<IndicateurEnregistrement etat="enregistre" />);
    expect(screen.getByRole('status').textContent).toBe('Enregistré');
  });

  it('ajoute l’heure TELLE QU’ELLE ARRIVE, déjà formatée (§22.2)', () => {
    render(<IndicateurEnregistrement etat="enregistre" horodatage="14h32" />);
    expect(screen.getByRole('status').textContent).toBe('Enregistré à 14h32');
  });

  it('n’invente aucune heure quand l’écran n’en fournit pas', () => {
    render(<IndicateurEnregistrement etat="enregistre" />);
    expect(screen.getByRole('status').textContent).not.toContain('à ');
  });
});

describe('IndicateurEnregistrement — « furtif » ne veut pas dire « absent »', () => {
  it('EXISTE à l’état inactif, et n’y écrit rien', () => {
    // Si l'élément disparaissait, la ligne se refermerait à chaque frappe : c'est
    // le tressautement que le composant dit vouloir éviter. Il doit donc être
    // rendu, vide.
    render(<IndicateurEnregistrement etat="inactif" />);
    const indicateur = screen.getByRole('status');
    expect(indicateur.textContent).toBe('');
    expect(indicateur.isConnected).toBe(true);
  });

  it('n’affiche aucune icône à l’état inactif', () => {
    const { container } = render(<IndicateurEnregistrement etat="inactif" />);
    expect(container.querySelectorAll('svg').length).toBe(0);
  });

  it('affiche exactement une icône dans les états parlants, hors arbre d’accessibilité', () => {
    for (const etat of ['enregistrement', 'enregistre'] as const) {
      const { container, unmount } = render(<IndicateurEnregistrement etat={etat} />);
      const icones = container.querySelectorAll('svg');
      expect(icones.length).toBe(1);
      expect(icones[0]?.getAttribute('aria-hidden')).toBe('true');
      unmount();
    }
  });
});

describe('IndicateurEnregistrement — §17.3 : jamais intrusif', () => {
  it.each(ETATS)('l’état « %s » reste `status` et `polite`', (etat) => {
    render(<IndicateurEnregistrement etat={etat} />);
    const indicateur = screen.getByRole('status');
    expect(indicateur.getAttribute('aria-live')).toBe('polite');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
