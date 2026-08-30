// =============================================================================
// TESTS — DIALOGUE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// CE QUI SE JOUE ICI EST L'ACCESSIBILITÉ AU CLAVIER, ET LE PACK LA NOMME.
// §33.6 : « navigation clavier complète, focus visible ». Trois comportements ne
// sont visibles par aucune capture d'écran et ne se prouvent que par un test :
//   1. le focus ENTRE dans la fenêtre à l'ouverture — sinon l'utilisateur au
//      clavier reste DERRIÈRE le voile, sur un écran qu'il ne voit plus ;
//   2. le focus RESTE dedans (Tab boucle) ;
//   3. le focus RETOURNE d'où il venait à la fermeture — le plus oublié : un
//      auditeur qui ferme une confirmation et se retrouve en haut de page a perdu
//      sa question, en entretien, devant quelqu'un.
// Le composant est aussi ce qui confirme « Valider l'entretien », geste qui
// VERROUILLE (§19.1 V2.10) : sa fermeture accidentelle est un défaut coûteux,
// d'où le test sur le clic à côté.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialogue } from './Dialogue.js';
import { Bouton } from './Bouton.js';

afterEach(() => {
  cleanup();
});

describe('Dialogue — une fenêtre modale NOMMÉE', () => {
  it('ne rend rien tant qu’elle est fermée', () => {
    render(
      <Dialogue ouvert={false} titre="Valider l’entretien" onFermer={vi.fn()}>
        Contenu
      </Dialogue>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('porte son titre comme NOM ACCESSIBLE, et se déclare modale', () => {
    render(
      <Dialogue ouvert titre="Valider l’entretien" onFermer={vi.fn()}>
        Contenu
      </Dialogue>,
    );
    const fenetre = screen.getByRole('dialog', { name: 'Valider l’entretien' });
    expect(fenetre.getAttribute('aria-modal')).toBe('true');
  });

  it('relie sa description à la fenêtre quand elle en a une', () => {
    render(
      <Dialogue
        ouvert
        titre="Valider l’entretien"
        description="La validation verrouille l’entretien : toute modification deviendra une révision tracée."
        onFermer={vi.fn()}
      />,
    );
    const fenetre = screen.getByRole('dialog');
    const identifiant = fenetre.getAttribute('aria-describedby');
    expect(identifiant).not.toBeNull();
    expect(document.getElementById(identifiant ?? '')?.textContent).toContain(
      'toute modification deviendra une révision tracée',
    );
  });

  it('n’invente pas d’`aria-describedby` sans description', () => {
    render(<Dialogue ouvert titre="Valider l’entretien" onFermer={vi.fn()} />);
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(false);
  });

  it('offre une fermeture nommée en français (§33.6 — icône seule libellée)', () => {
    const onFermer = vi.fn();
    render(<Dialogue ouvert titre="Valider l’entretien" onFermer={onFermer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onFermer).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogue — le focus entre, reste, et revient', () => {
  it('donne le focus à un élément DE LA FENÊTRE à l’ouverture', () => {
    render(
      <Dialogue ouvert titre="Valider l’entretien" onFermer={vi.fn()}>
        Contenu
      </Dialogue>,
    );
    const fenetre = screen.getByRole('dialog');
    expect(document.activeElement).not.toBeNull();
    expect(fenetre.contains(document.activeElement)).toBe(true);
  });

  it('boucle la tabulation : Tab sur le DERNIER revient au PREMIER', () => {
    render(
      <Dialogue ouvert titre="Valider" onFermer={vi.fn()} actions={<Bouton>Confirmer</Bouton>} />,
    );
    const fermer = screen.getByRole('button', { name: 'Fermer' });
    const confirmer = screen.getByRole('button', { name: 'Confirmer' });
    confirmer.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(fermer);
  });

  it('boucle en arrière : Maj+Tab sur le PREMIER va au DERNIER', () => {
    render(
      <Dialogue ouvert titre="Valider" onFermer={vi.fn()} actions={<Bouton>Confirmer</Bouton>} />,
    );
    const fermer = screen.getByRole('button', { name: 'Fermer' });
    const confirmer = screen.getByRole('button', { name: 'Confirmer' });
    fermer.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmer);
  });

  it('REND le focus à l’élément qui l’avait avant l’ouverture', () => {
    const { rerender } = render(
      <>
        <button type="button">Ouvrir la validation</button>
        <Dialogue ouvert={false} titre="Valider" onFermer={vi.fn()} />
      </>,
    );
    const declencheur = screen.getByRole('button', { name: 'Ouvrir la validation' });
    declencheur.focus();
    expect(document.activeElement).toBe(declencheur);

    rerender(
      <>
        <button type="button">Ouvrir la validation</button>
        <Dialogue ouvert titre="Valider" onFermer={vi.fn()} />
      </>,
    );
    expect(document.activeElement).not.toBe(declencheur);

    rerender(
      <>
        <button type="button">Ouvrir la validation</button>
        <Dialogue ouvert={false} titre="Valider" onFermer={vi.fn()} />
      </>,
    );
    expect(document.activeElement).toBe(declencheur);
  });
});

describe('Dialogue — Échap ferme, un clic à côté ne verrouille rien par accident', () => {
  it('ferme sur la touche Échap', () => {
    const onFermer = vi.fn();
    render(<Dialogue ouvert titre="Valider" onFermer={onFermer} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it('IGNORE par défaut un clic sur le voile (confirmation destructive)', () => {
    // Le défaut est `fermetureExterieure = false` : un clic à côté, en entretien,
    // ne doit pas escamoter une décision qu'on est en train de prendre.
    const onFermer = vi.fn();
    render(<Dialogue ouvert titre="Valider" onFermer={onFermer} />);
    const voile = screen.getByRole('dialog').parentElement;
    expect(voile).not.toBeNull();
    if (voile !== null) fireEvent.click(voile);
    expect(onFermer).not.toHaveBeenCalled();
  });

  it('ferme sur le voile SEULEMENT quand l’appelant l’a demandé', () => {
    const onFermer = vi.fn();
    render(<Dialogue ouvert titre="Aide" onFermer={onFermer} fermetureExterieure />);
    const voile = screen.getByRole('dialog').parentElement;
    if (voile !== null) fireEvent.click(voile);
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it('ne se ferme pas quand le clic vient de l’INTÉRIEUR de la fenêtre', () => {
    // C'est le geste exact d'une sélection de texte qui déborde sur le voile.
    const onFermer = vi.fn();
    render(<Dialogue ouvert titre="Aide" onFermer={onFermer} fermetureExterieure />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onFermer).not.toHaveBeenCalled();
  });
});
