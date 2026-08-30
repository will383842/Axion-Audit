// =============================================================================
// TESTS — CASE À COCHER (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// L'usage qui compte est la VALIDATION GROUPÉE de fin de journée (§19.1 V2.10) :
// une liste qu'on coche debout, à une main. Deux choses s'éprouvent :
//   · toute la LIGNE est cliquable (le libellé fait partie de la cible) — sans
//     quoi la cible tactile se réduit au carré, sous le plancher d'A27 ;
//   · l'état INDÉTERMINÉ d'une case « tout cocher » existe RÉELLEMENT, c'est-à-
//     dire sur la propriété DOM et non seulement dans une classe CSS.
// Traçabilité : E27.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseACocher } from './CaseACocher.js';

afterEach(() => {
  cleanup();
});

/** La case, TYPÉE : `checked` et `indeterminate` sont des propriétés d'input. */
function caseA(nom?: string): HTMLInputElement {
  return nom === undefined
    ? screen.getByRole('checkbox')
    : screen.getByRole('checkbox', { name: nom });
}

describe('CaseACocher — nom accessible et geste', () => {
  it('expose le rôle « checkbox » nommé par son libellé français', () => {
    render(<CaseACocher libelle="Entretien du matin" />);
    expect(screen.getByRole('checkbox', { name: 'Entretien du matin' })).not.toBeNull();
  });

  it('se coche en cliquant sur le LIBELLÉ, pas seulement sur le carré', () => {
    const onChange = vi.fn();
    render(<CaseACocher libelle="Entretien du matin" onChange={onChange} />);
    // Le libellé est l'étiquette de la case : cliquer le texte doit basculer
    // l'état. C'est ce qui donne à la ligne entière sa cible tactile.
    fireEvent.click(screen.getByText('Entretien du matin'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(caseA().checked).toBe(true);
  });

  it('respecte l’état coché imposé par l’appelant', () => {
    render(<CaseACocher libelle="Entretien du matin" checked readOnly />);
    expect(caseA().checked).toBe(true);
  });

  it('transmet la désactivation au contrôle lui-même', () => {
    // MESURÉ, et écrit tel quel plutôt qu'affirmé plus fort : on ne peut PAS
    // prouver ici qu'un clic reste sans effet. `fireEvent.click` distribue
    // l'évènement par `dispatchEvent`, ce qui court-circuite la garde que le
    // navigateur applique aux contrôles désactivés — l'assertion « le rappel n'a
    // pas été appelé » éprouverait jsdom, pas le composant. Ce qui est vérifiable
    // et suffisant, c'est que l'état `disabled` atteint bien l'élément : c'est lui
    // que le navigateur, le clavier et le lecteur d'écran respectent.
    render(<CaseACocher libelle="Entretien du matin" disabled />);
    const boite = caseA('Entretien du matin');
    expect(boite.disabled).toBe(true);
  });
});

describe('CaseACocher — la sélection PARTIELLE d’une case « tout cocher »', () => {
  it('porte l’état indéterminé sur la propriété DOM, pas seulement en apparence', () => {
    render(<CaseACocher libelle="Tout sélectionner" indetermine />);
    const boite = caseA('Tout sélectionner');
    // `indeterminate` n'existe QUE comme propriété : un attribut HTML ne le porte
    // pas. Une implémentation qui se contenterait d'une classe CSS afficherait un
    // tiret sans que rien, ni l'API ni le lecteur d'écran, ne le sache.
    expect(boite.indeterminate).toBe(true);
  });

  it('revient à un état déterminé quand la sélection cesse d’être partielle', () => {
    const { rerender } = render(<CaseACocher libelle="Tout sélectionner" indetermine />);
    rerender(<CaseACocher libelle="Tout sélectionner" indetermine={false} />);
    const boite = caseA('Tout sélectionner');
    expect(boite.indeterminate).toBe(false);
  });

  it('n’est pas indéterminée par défaut', () => {
    render(<CaseACocher libelle="Entretien du matin" />);
    expect(caseA().indeterminate).toBe(false);
  });
});
