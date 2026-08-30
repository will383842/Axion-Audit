// =============================================================================
// TESTS — SAISIE EN FOURCHETTE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// §27.4 : quand un chiffre exact est REFUSÉ, l'auditeur propose une fourchette.
// §32.4 en fait la forme normale des estimations (`gain_low` / `gain_high`).
//
// LA RÈGLE MÉTIER EST TESTÉE SÉPARÉMENT DU RENDU, et c'est le composant qui
// l'a voulu : `fourchetteIncoherente` est exportée « pour qu'un test puisse la
// viser sans monter le DOM ». On la prend au mot — mais on éprouve AUSSI qu'elle
// est réellement branchée sur l'affichage, faute de quoi une fonction juste
// pourrait cohabiter avec un composant qui ne l'appelle pas.
//
// LE POINT DÉLICAT EST LE SILENCE DE LA RÈGLE. Elle ne se prononce PAS sur une
// saisie incomplète ni sur un texte non numérique : « ~250 », « env. 1 M » et un
// champ vide sont des saisies d'entretien légitimes, pas des erreurs. Une règle
// qui crierait dessus apprendrait à l'auditeur à ignorer les messages du produit.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SaisieFourchette, fourchetteIncoherente } from './SaisieFourchette.js';

afterEach(() => {
  cleanup();
});

/** Une borne, TYPÉE : `disabled` est une propriété d'input. */
function borne(nom: string): HTMLInputElement {
  return screen.getByRole('textbox', { name: nom });
}

describe('fourchetteIncoherente — la seule règle métier du composant', () => {
  it('signale le désordre quand les deux bornes sont lisibles comme des nombres', () => {
    expect(fourchetteIncoherente('300', '200')).toBe(true);
  });

  it('accepte l’ordre correct et l’égalité', () => {
    expect(fourchetteIncoherente('200', '300')).toBe(false);
    expect(fourchetteIncoherente('250', '250')).toBe(false);
  });

  it('comprend la virgule décimale française et les espaces de milliers', () => {
    // L'auditeur tape « 1 200 » ou « 1,5 » selon son clavier et son réflexe.
    expect(fourchetteIncoherente('1,5', '1,2')).toBe(true);
    expect(fourchetteIncoherente('1 200', '900')).toBe(true);
    expect(fourchetteIncoherente('900', '1 200')).toBe(false);
  });

  it('se TAIT sur une saisie incomplète — une borne vide n’est pas une faute', () => {
    expect(fourchetteIncoherente('', '200')).toBe(false);
    expect(fourchetteIncoherente('300', '')).toBe(false);
    expect(fourchetteIncoherente('   ', '   ')).toBe(false);
  });

  it('se TAIT sur ce qu’elle ne sait pas lire — « ~250 » reste une donnée valable', () => {
    // La conversion appartient au schéma Zod de `packages/shared`. Ici, se taire
    // vaut mieux que refuser : refuser ferait PERDRE de la donnée d'entretien.
    expect(fourchetteIncoherente('~300', '200')).toBe(false);
    expect(fourchetteIncoherente('environ 300', 'moins de 200')).toBe(false);
  });

  it('accepte les nombres négatifs sans changer de règle', () => {
    expect(fourchetteIncoherente('-2', '-5')).toBe(true);
    expect(fourchetteIncoherente('-5', '-2')).toBe(false);
  });
});

describe('SaisieFourchette — DEUX champs, jamais un', () => {
  it('rend deux champs nommés « Borne basse » et « Borne haute »', () => {
    render(
      <SaisieFourchette
        libelle="Chiffre d’affaires estimé"
        bas=""
        haut=""
        onChangement={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Borne basse' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Borne haute' })).not.toBeNull();
  });

  it('regroupe les deux bornes sous l’intitulé de la question', () => {
    render(
      <SaisieFourchette
        libelle="Chiffre d’affaires estimé"
        bas=""
        haut=""
        onChangement={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Chiffre d’affaires estimé' })).not.toBeNull();
  });

  it('ouvre le clavier numérique sur les deux bornes (§33.3)', () => {
    render(<SaisieFourchette libelle="Gain estimé" bas="" haut="" onChangement={vi.fn()} />);
    for (const nom of ['Borne basse', 'Borne haute']) {
      const champ = screen.getByRole('textbox', { name: nom });
      expect(champ.getAttribute('inputmode')).toBe('decimal');
      // Jamais `type="number"` : il avalerait la virgule et refuserait « ~250 ».
      expect(champ.getAttribute('type')).toBe('text');
    }
  });

  it('porte `data-saisie-libre` sur les deux bornes (§33.3 V2.8)', () => {
    render(<SaisieFourchette libelle="Gain estimé" bas="" haut="" onChangement={vi.fn()} />);
    for (const nom of ['Borne basse', 'Borne haute']) {
      expect(screen.getByRole('textbox', { name: nom }).getAttribute('data-saisie-libre')).toBe(
        'vrai',
      );
    }
  });

  it('remonte les DEUX bornes à chaque frappe, sans perdre l’autre', () => {
    const onChangement = vi.fn();
    render(
      <SaisieFourchette libelle="Gain estimé" bas="200" haut="" onChangement={onChangement} />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Borne haute' }), {
      target: { value: '300' },
    });
    expect(onChangement).toHaveBeenCalledWith({ bas: '200', haut: '300' });
  });

  it('affiche l’unité fournie par l’écran, sans la connaître d’avance', () => {
    render(
      <SaisieFourchette libelle="Gain estimé" bas="" haut="" onChangement={vi.fn()} unite="k€" />,
    );
    expect(screen.getByText('k€')).not.toBeNull();
  });

  it('désactive les deux bornes ensemble', () => {
    render(
      <SaisieFourchette libelle="Gain estimé" bas="" haut="" onChangement={vi.fn()} desactive />,
    );
    for (const nom of ['Borne basse', 'Borne haute']) {
      expect(borne(nom).disabled).toBe(true);
    }
  });
});

describe('SaisieFourchette — la règle est BRANCHÉE sur ce que l’auditeur voit', () => {
  it('n’affiche aucune erreur sur une fourchette cohérente', () => {
    render(<SaisieFourchette libelle="Gain estimé" bas="200" haut="300" onChangement={vi.fn()} />);
    expect(screen.queryByText(/borne basse doit être inférieure/i)).toBeNull();
    for (const nom of ['Borne basse', 'Borne haute']) {
      expect(screen.getByRole('textbox', { name: nom }).getAttribute('aria-invalid')).toBe('false');
    }
  });

  it('affiche un message EN FRANÇAIS et marque les deux champs invalides', () => {
    render(<SaisieFourchette libelle="Gain estimé" bas="300" haut="200" onChangement={vi.fn()} />);
    expect(
      screen.getByText('La borne basse doit être inférieure à la borne haute.'),
    ).not.toBeNull();
    for (const nom of ['Borne basse', 'Borne haute']) {
      const champ = screen.getByRole('textbox', { name: nom });
      expect(champ.getAttribute('aria-invalid')).toBe('true');
      // §33.6 : le message est RELIÉ au champ, il ne flotte pas à côté en rouge.
      const identifiant = champ.getAttribute('aria-describedby');
      expect(document.getElementById(identifiant ?? '')?.textContent).toContain(
        'La borne basse doit être inférieure à la borne haute.',
      );
    }
  });

  it('laisse une erreur de validation extérieure PRIMER sur le contrôle local', () => {
    render(
      <SaisieFourchette
        libelle="Gain estimé"
        bas="300"
        haut="200"
        onChangement={vi.fn()}
        erreur="Le gain doit être exprimé en k€."
      />,
    );
    expect(screen.getByText('Le gain doit être exprimé en k€.')).not.toBeNull();
    expect(screen.queryByText('La borne basse doit être inférieure à la borne haute.')).toBeNull();
  });

  it('affiche l’aide fournie sans la confondre avec une erreur', () => {
    render(
      <SaisieFourchette
        libelle="Gain estimé"
        bas=""
        haut=""
        onChangement={vi.fn()}
        aide="Une fourchette est acceptée quand le chiffre exact est refusé."
      />,
    );
    expect(
      screen.getByText('Une fourchette est acceptée quand le chiffre exact est refusé.'),
    ).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Borne basse' }).getAttribute('aria-invalid')).toBe(
      'false',
    );
  });
});
