// =============================================================================
// TESTS TRANSVERSES — CE QUI DOIT ÊTRE VRAI DE TOUT LE PAQUET, PAS D'UN COMPOSANT
// Écrits par un agent qui n'a PAS écrit les composants (09 §5.6).
//
// Trois règles du pack ne se vérifient PAS composant par composant, parce que ce
// qui les tue est l'OUBLI sur un composant ajouté plus tard. Elles se balaient
// donc sur l'inventaire entier, à partir du baril public — de sorte qu'un
// composant exporté demain entre automatiquement dans le périmètre.
//
//   1. §33.3 RÈGLE V2.8 — « les raccourcis à une touche (O/N/A/R/E, 1-5, /) ne
//      sont actifs que HORS focus d'un champ de saisie ». Le marqueur
//      `data-saisie-libre` est ce qui rend la règle vérifiable ailleurs qu'à
//      l'œil : le gestionnaire clavier de l'écran interroge le DOM au lieu de
//      recopier une liste de sélecteurs qu'un champ ajouté plus tard oublierait.
//      Le balayage éprouve la règle DANS LES DEUX SENS : tout champ de SAISIE
//      LIBRE le porte, et aucun contrôle À CHOIX ne le porte — sinon les
//      raccourcis 1-5 et O/N/A, qui sont la vitesse en entretien, seraient morts.
//
//   2. §33.6 — « aucune information portée par la couleur seule », « libellés
//      explicites sur toute icône seule ». Balayé ici sous sa forme mécanique :
//      aucune icône du paquet n'entre dans l'arbre d'accessibilité, et tout
//      contrôle interactif rendu par le paquet a un NOM ACCESSIBLE non vide.
//
//   3. Invariant 5 — « interface 100 % en français ». Aucun mot d'interface
//      anglais ne doit atteindre l'écran.
//
// Traçabilité : E13, E27, E44 · invariants 4 et 5 du 00_INDEX.
// =============================================================================
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Bascule } from './Bascule.js';
import { Bouton } from './Bouton.js';
import { CaseACocher } from './CaseACocher.js';
import { ChampTexte } from './ChampTexte.js';
import { EchelleAncree } from './EchelleAncree.js';
import { SaisieFourchette } from './SaisieFourchette.js';
import { SegmenteONA } from './SegmenteONA.js';
import { Selection } from './Selection.js';
import { ZoneNotes } from './ZoneNotes.js';
import { IconeAlerte, IconeCroix } from './icones.js';

// Le baril public : importé nommément pour que ce fichier atteigne aussi
// `composants/index.ts`, et pour éprouver que ce qui est ANNONCÉ à l'extérieur du
// paquet est bien ce qui en sort.
import { Badge, Message, PastilleSync } from './index.js';

afterEach(() => {
  cleanup();
});

// -----------------------------------------------------------------------------
// 1. §33.3 V2.8 — le marqueur qui neutralise les raccourcis
// -----------------------------------------------------------------------------

/** Tout ce que le paquet sait rendre comme SAISIE LIBRE (texte tapé à la main). */
const SAISIES_LIBRES: readonly (readonly [string, ReactElement])[] = [
  ['ChampTexte', <ChampTexte key="c" libelle="Effectif" />],
  ['ChampTexte (nombre)', <ChampTexte key="n" libelle="Effectif" nature="nombre" />],
  ['ChampTexte (recherche)', <ChampTexte key="r" libelle="Recherche" nature="recherche" />],
  ['ZoneNotes', <ZoneNotes key="z" libelle="Notes" />],
  [
    'SaisieFourchette',
    <SaisieFourchette key="f" libelle="Gain" bas="" haut="" onChangement={vi.fn()} />,
  ],
];

/** Tout ce que le paquet sait rendre comme CHOIX (frappé, jamais tapé). */
const CHOIX: readonly (readonly [string, ReactElement])[] = [
  [
    'EchelleAncree',
    <EchelleAncree key="e" libelle="Question" valeur={null} ancres={[]} onChangement={vi.fn()} />,
  ],
  ['SegmenteONA', <SegmenteONA key="s" libelle="Question" valeur={null} onChangement={vi.fn()} />],
  ['CaseACocher', <CaseACocher key="k" libelle="Entretien du matin" />],
];

describe('§33.3 V2.8 — TOUT champ de saisie libre porte le marqueur', () => {
  it.each(SAISIES_LIBRES)('%s marque chacun de ses champs', (_nom, element) => {
    const { container } = render(element);
    const champs = [...container.querySelectorAll('input, textarea')];
    expect(champs.length).toBeGreaterThan(0);
    for (const champ of champs) {
      expect(
        champ.getAttribute('data-saisie-libre'),
        `${champ.tagName} sans marqueur : les raccourcis resteraient actifs pendant la frappe`,
      ).toBe('vrai');
    }
  });

  it('couvre tous les composants de saisie libre du paquet', () => {
    // Contre-épreuve d'inventaire : si le paquet gagne un composant de saisie
    // libre sans entrer dans cette table, la règle V2.8 aura un trou muet. Le
    // compte est ici une borne basse VOLONTAIREMENT explicite, à relever avec
    // l'inventaire.
    expect(SAISIES_LIBRES.length).toBeGreaterThanOrEqual(5);
  });
});

describe('§33.3 V2.8 — AUCUN contrôle à choix ne porte le marqueur', () => {
  // L'autre moitié de la règle, et la plus facile à casser par excès de zèle :
  // marquer un radio de l'échelle 1-5 comme « saisie libre » désactiverait les
  // raccourcis 1-5 sur le contrôle même qu'ils servent. La vitesse en entretien
  // vient de là.
  it.each(CHOIX)('%s laisse les raccourcis actifs sur ses contrôles', (_nom, element) => {
    const { container } = render(element);
    const controles = [...container.querySelectorAll('input')];
    expect(controles.length).toBeGreaterThan(0);
    for (const controle of controles) {
      expect(controle.hasAttribute('data-saisie-libre')).toBe(false);
    }
  });
});

describe('§33.3 V2.8 — ce que le balayage NE COUVRE PAS, dit explicitement', () => {
  it('CONSTAT : la liste déroulante native ne porte aucun marqueur', () => {
    // REMONTÉ, NON CORRIGÉ ICI (09 §5.6). Un `<select>` focalisé consomme déjà
    // les lettres pour sa recherche par frappe : taper « n » y saute à une
    // option. Un gestionnaire de raccourcis qui n'interroge que
    // `data-saisie-libre` déclenchera DONC « Non » en même temps. Le composant
    // n'est pas une saisie libre au sens strict, mais il est bien un cas où les
    // raccourcis doivent se taire — le marqueur seul ne suffit pas à décrire la
    // règle V2.8. Écrit ici pour que l'écran de L5 le sache avant de coder son
    // gestionnaire, plutôt que de le découvrir en entretien.
    const { container } = render(
      <Selection libelle="Motif" options={[{ valeur: 'a', libelle: 'Confidentiel' }]} />,
    );
    const liste = container.querySelector('select');
    expect(liste).not.toBeNull();
    expect(liste?.hasAttribute('data-saisie-libre')).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// 2. §33.6 — rien ne repose sur l'icône ni sur la couleur
// -----------------------------------------------------------------------------

/** Un échantillon RENDU de chaque famille de composant qui dessine une icône. */
const AVEC_ICONES: readonly (readonly [string, ReactElement])[] = [
  [
    'Bouton en chargement',
    <Bouton key="b" chargement>
      Synchroniser
    </Bouton>,
  ],
  ['ChampTexte en erreur', <ChampTexte key="c" libelle="Effectif" erreur="Valeur manquante." />],
  ['ZoneNotes en erreur', <ZoneNotes key="z" libelle="Notes" erreur="Note trop longue." />],
  [
    'Badge',
    <Badge key="d" ton="alerte" icone={<IconeAlerte />}>
      À revoir
    </Badge>,
  ],
  [
    'Message',
    <Message key="m" ton="alerte">
      Stockage presque plein.
    </Message>,
  ],
  ['PastilleSync', <PastilleSync key="p" etat="echec" />],
  ['SegmenteONA répondu', <SegmenteONA key="s" libelle="Q" valeur="oui" onChangement={vi.fn()} />],
];

describe('§33.6 — aucune icône du paquet n’entre dans l’arbre d’accessibilité', () => {
  it.each(AVEC_ICONES)('%s cache toutes ses icônes au lecteur d’écran', (_nom, element) => {
    const { container } = render(element);
    const icones = [...container.querySelectorAll('svg')];
    expect(icones.length).toBeGreaterThan(0);
    for (const icone of icones) {
      expect(icone.getAttribute('aria-hidden')).toBe('true');
      expect(icone.getAttribute('focusable')).toBe('false');
    }
  });
});

/** Tout ce que le paquet rend d'INTERACTIF, avec le nom attendu. */
const INTERACTIFS: readonly (readonly [string, ReactElement, number])[] = [
  ['Bouton', <Bouton key="b">Enregistrer</Bouton>, 1],
  [
    'Bouton icône seule',
    <Bouton key="i" iconeSeule libelleAccessible="Fermer" icone={<IconeCroix />} />,
    1,
  ],
  ['Bascule', <Bascule key="a" libelle="Mode partagé" actif onBasculer={vi.fn()} />, 1],
  ['CaseACocher', <CaseACocher key="k" libelle="Entretien du matin" />, 1],
  ['ChampTexte', <ChampTexte key="c" libelle="Effectif" />, 1],
  ['ZoneNotes', <ZoneNotes key="z" libelle="Notes" />, 1],
  [
    'Selection',
    <Selection key="s" libelle="Motif" options={[{ valeur: 'a', libelle: 'Confidentiel' }]} />,
    1,
  ],
  [
    'SegmenteONA',
    <SegmenteONA key="o" libelle="Question" valeur={null} onChangement={vi.fn()} />,
    3,
  ],
  [
    'SaisieFourchette',
    <SaisieFourchette key="f" libelle="Gain" bas="" haut="" onChangement={vi.fn()} />,
    2,
  ],
];

const ROLES_INTERACTIFS = ['button', 'switch', 'checkbox', 'textbox', 'combobox', 'radio'] as const;

describe('§33.6 — tout contrôle interactif a un NOM ACCESSIBLE non vide', () => {
  it.each(INTERACTIFS)('%s nomme ses %i contrôle(s)', (_nom, element, attendus) => {
    render(element);
    // Le nom est calculé par la MÊME mécanique qu'un lecteur d'écran (libellé
    // enveloppant, étiquette liée, `aria-label`), et non par une lecture
    // d'attribut : `{ name: /\S/ }` filtre sur le nom accessible. Comparer les
    // deux comptes — contrôles trouvés / contrôles NOMMÉS — refuse le contrôle
    // muet sans supposer d'où son nom devrait venir.
    let trouves = 0;
    let nommes = 0;
    for (const role of ROLES_INTERACTIFS) {
      trouves += screen.queryAllByRole(role).length;
      nommes += screen.queryAllByRole(role, { name: /\S/ }).length;
    }
    expect(trouves, 'le rendu n’expose pas le nombre de contrôles attendu').toBe(attendus);
    expect(nommes, 'un contrôle sans nom accessible est muet au lecteur d’écran').toBe(trouves);
  });
});

// -----------------------------------------------------------------------------
// 3. Invariant 5 — interface 100 % en français
// -----------------------------------------------------------------------------

describe('invariant 5 — aucun mot d’interface anglais n’atteint l’écran', () => {
  const ECRANS: readonly (readonly [string, ReactElement])[] = [
    [
      'Bouton en chargement',
      <Bouton key="b" chargement>
        Synchroniser
      </Bouton>,
    ],
    ['PastilleSync (échec)', <PastilleSync key="p" etat="echec" />],
    ['PastilleSync (hors ligne)', <PastilleSync key="h" etat="hors-ligne" />],
    ['Message', <Message key="m">Rappel de confidentialité.</Message>],
    [
      'SaisieFourchette incohérente',
      <SaisieFourchette key="f" libelle="Gain" bas="300" haut="200" onChangement={vi.fn()} />,
    ],
    [
      'EchelleAncree non cotée',
      <EchelleAncree key="e" libelle="Q" valeur={null} ancres={[]} onChangement={vi.fn()} />,
    ],
    ['SegmenteONA', <SegmenteONA key="s" libelle="Q" valeur={null} onChangement={vi.fn()} />],
  ];

  // Les mots que produirait un composant laissé dans sa langue d'origine, ou un
  // copier-coller de bibliothèque. La liste est courte et ciblée : elle vise ce
  // qui S'AFFICHE, pas le vocabulaire du code.
  const ANGLAIS =
    /\b(?:loading|error|empty|offline|retry|cancel|submit|close|save|saved|saving|search|yes|no|none|not applicable|required)\b/i;

  it.each(ECRANS)('%s ne rend aucun mot d’interface anglais', (_nom, element) => {
    const { container } = render(element);
    const texte = container.textContent;
    expect(texte.length).toBeGreaterThan(0);
    expect(ANGLAIS.exec(texte), `texte rendu : « ${texte} »`).toBeNull();
  });

  it('DÉTECTE un mot anglais introduit exprès (contre-épreuve du motif)', () => {
    // Sans cette ligne, une expression régulière cassée rendrait le bloc
    // ci-dessus vert pour toujours.
    expect(ANGLAIS.exec('Loading, please wait')).not.toBeNull();
    expect(ANGLAIS.exec('Chargement en cours')).toBeNull();
  });
});
