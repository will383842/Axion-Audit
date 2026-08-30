// =============================================================================
// TESTS — CHAMP TEXTE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// Trois exigences du pack sont éprouvées ici, et elles ne se recouvrent pas :
//   · §33.3 « clavier virtuel ADAPTÉ AU TYPE » — la nature de la DONNÉE décide du
//     couple `type`/`inputMode` ; c'est le seul moyen qu'un iPad ouvre le bon
//     clavier, et l'oubli ne se voit que sur un vrai appareil ;
//   · §33.3 règle V2.8 — « les raccourcis à une touche ne sont actifs que HORS
//     focus d'un champ de saisie » : le champ porte le marqueur qui rend la règle
//     VÉRIFIABLE (`data-saisie-libre`) au lieu d'une liste de sélecteurs recopiée ;
//   · §33.6 — aucune information portée par la couleur seule : une erreur est un
//     TEXTE lisible, relié au champ, pas un liseré rouge.
// Traçabilité : E13, E27.
// =============================================================================
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChampTexte, type NatureChamp } from './ChampTexte.js';

afterEach(() => {
  cleanup();
});

describe('ChampTexte — le libellé est VISIBLE et relié au champ', () => {
  it('se trouve par son libellé (jamais par un `placeholder` en guise de libellé)', () => {
    render(<ChampTexte libelle="Effectif du site" />);
    const champ = screen.getByLabelText('Effectif du site');
    expect(champ.tagName).toBe('INPUT');
  });

  it('marque le champ obligatoire sans polluer son NOM ACCESSIBLE', () => {
    render(<ChampTexte libelle="Raison sociale" obligatoire />);
    // L'astérisque est un signe VISUEL : il est `aria-hidden`, donc il n'entre pas
    // dans le nom calculé. Interroger par rôle + nom exact le prouve — un lecteur
    // d'écran annonce « Raison sociale », jamais « Raison sociale étoile ».
    const champ = screen.getByRole('textbox', { name: 'Raison sociale' });
    expect((champ as HTMLInputElement).required).toBe(true);
    // Le signe est bien à l'écran, lui : l'obligation reste visible.
    expect(screen.getByText('*')).not.toBeNull();
  });

  it('n’invente pas d’`aria-describedby` quand il n’y a ni aide ni erreur', () => {
    // `aria-describedby=""` ferait pointer le lecteur d'écran vers rien : le
    // composant doit OMETTRE l'attribut, pas le vider.
    render(<ChampTexte libelle="Commentaire" />);
    expect(screen.getByLabelText('Commentaire').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('ChampTexte — §33.3 : le clavier suit la NATURE de la donnée', () => {
  const attendus: readonly (readonly [NatureChamp, string, string])[] = [
    ['texte', 'text', 'text'],
    ['nombre', 'text', 'decimal'],
    ['courriel', 'email', 'email'],
    ['telephone', 'tel', 'tel'],
    ['url', 'url', 'url'],
    ['recherche', 'search', 'search'],
  ];

  it.each(attendus)('« %s » ouvre le clavier %s / mode %s', (nature, type, mode) => {
    render(<ChampTexte libelle="Valeur" nature={nature} />);
    const champ = screen.getByLabelText('Valeur');
    expect(champ.getAttribute('type')).toBe(type);
    expect(champ.getAttribute('inputmode')).toBe(mode);
  });

  it('n’utilise JAMAIS `type="number"` pour un nombre', () => {
    // Le champ numérique HTML avale la virgule décimale française, monte la
    // valeur à la molette et refuse « ~250 » : il PERD de la donnée d'entretien.
    render(<ChampTexte libelle="Chiffre d’affaires" nature="nombre" />);
    expect(screen.getByLabelText('Chiffre d’affaires').getAttribute('type')).not.toBe('number');
  });
});

describe('ChampTexte — §33.3 V2.8 : le marqueur qui neutralise les raccourcis', () => {
  it('porte `data-saisie-libre="vrai"` — taper « Rien à signaler » ne déclenche rien', () => {
    render(<ChampTexte libelle="Note" />);
    expect(screen.getByLabelText('Note').getAttribute('data-saisie-libre')).toBe('vrai');
  });
});

describe('ChampTexte — §33.6 : l’aide et l’erreur sont du TEXTE, pas une couleur', () => {
  it('relie l’aide au champ par `aria-describedby`', () => {
    render(
      <ChampTexte libelle="Effectif" aide="Effectif présent sur le site le jour de l’audit" />,
    );
    const champ = screen.getByLabelText('Effectif');
    const identifiants = (champ.getAttribute('aria-describedby') ?? '').split(' ');
    const textes = identifiants.map((id) => document.getElementById(id)?.textContent);
    expect(textes).toContain('Effectif présent sur le site le jour de l’audit');
  });

  it('déclare le champ invalide ET donne la raison en français, reliée au champ', () => {
    render(<ChampTexte libelle="Effectif" erreur="Saisissez un nombre entier." />);
    const champ = screen.getByLabelText('Effectif');
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    const identifiants = (champ.getAttribute('aria-describedby') ?? '').split(' ');
    const textes = identifiants.map((id) => document.getElementById(id)?.textContent);
    // Le message est lisible tel quel : l'icône d'alerte le DOUBLE, elle ne le
    // remplace pas — sans quoi l'information tiendrait au seul pictogramme rouge.
    expect(textes.some((t) => t?.includes('Saisissez un nombre entier.') === true)).toBe(true);
    expect(screen.getByText('Saisissez un nombre entier.')).not.toBeNull();
  });

  it('décrit le champ par l’aide ET par l’erreur quand les deux existent', () => {
    render(
      <ChampTexte libelle="Effectif" aide="Nombre de personnes." erreur="Valeur manquante." />,
    );
    const identifiants = (
      screen.getByLabelText('Effectif').getAttribute('aria-describedby') ?? ''
    ).split(' ');
    expect(identifiants.length).toBe(2);
    const textes = identifiants.map((id) => document.getElementById(id)?.textContent ?? '');
    expect(textes.some((t) => t.includes('Nombre de personnes.'))).toBe(true);
    expect(textes.some((t) => t.includes('Valeur manquante.'))).toBe(true);
  });

  it('n’est pas invalide tant qu’aucune erreur n’est donnée', () => {
    render(<ChampTexte libelle="Effectif" />);
    expect(screen.getByLabelText('Effectif').getAttribute('aria-invalid')).toBe('false');
  });
});
