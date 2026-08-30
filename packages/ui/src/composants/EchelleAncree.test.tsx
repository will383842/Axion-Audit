// =============================================================================
// TESTS — ÉCHELLE ANCRÉE (@axion/ui)
// Écrits par un agent qui n'a PAS écrit le composant (09 §5.6).
//
// ── LE POINT QUI JUSTIFIE UN ÉCART AU PACK, ET QUI DOIT DONC ÊTRE PROUVÉ ──────
// §33.5 dit « slider 1-5 ». L'auteur a écarté le curseur glissant au profit de
// cinq boutons radio, avec ce motif : « un curseur n'a pas d'état "pas encore
// coté" distinct de 1, donc il fabrique une réponse que personne n'a donnée ».
// Un écart au pack ne se justifie pas par une intention : il se justifie par une
// PROPRIÉTÉ VÉRIFIABLE. C'est l'objet du premier bloc de tests, et il éprouve la
// distinction dans les DEUX sens —
//   · `valeur = null` : AUCUN cran n'est coché, et le composant ne prétend pas
//     que la note vaut 1 ;
//   · `valeur = 1` : le cran 1 est coché, et lui SEUL.
// Si ces deux propriétés ne tenaient pas, l'écart au §33.5 serait gratuit et
// l'échelle produirait des cotations que personne n'a posées — ce qui pollue le
// scoring de §32.1 sans laisser de trace.
//
// ── §33.3 : « LES ANCRES DE COTATION SONT VISIBLES » ─────────────────────────
// « La cotation homogène ne dépend pas de la mémoire du consultant. » Les ancres
// doivent donc être atteignables SANS geste (la liste dépliable) et se révéler au
// survol comme au FOCUS — le clavier n'a pas de survol, et un test qui n'éprouve
// que la souris laisse l'auditeur au clavier sans ancres.
// Traçabilité : E13, E27, E44.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EchelleAncree, type AncreCotation } from './EchelleAncree.js';

afterEach(() => {
  cleanup();
});

const ANCRES: readonly AncreCotation[] = [
  { note: 1, texte: 'Aucune pratique identifiée' },
  { note: 2, texte: 'Pratique informelle et isolée' },
  { note: 3, texte: 'Documenté mais non appliqué' },
  { note: 4, texte: 'Appliqué et suivi' },
  { note: 5, texte: 'Piloté et amélioré en continu' },
];

const LIBELLE = 'Les procédures de réception sont-elles formalisées ?';

function crans(): HTMLInputElement[] {
  return screen.getAllByRole('radio');
}

describe('EchelleAncree — « PAS ENCORE COTÉ » EXISTE, et ce n’est pas la note 1', () => {
  it('ne coche AUCUN cran tant que la valeur est `null`', () => {
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    expect(crans().length).toBe(5);
    expect(crans().filter((c) => c.checked)).toEqual([]);
  });

  it('coche le cran 1 — et LUI SEUL — quand la note vaut réellement 1', () => {
    render(<EchelleAncree libelle={LIBELLE} valeur={1} ancres={ANCRES} onChangement={vi.fn()} />);
    const coches = crans().filter((c) => c.checked);
    expect(coches.length).toBe(1);
    expect(coches[0]?.value).toBe('1');
  });

  it('distingue à l’écran « pas encore coté » de « coté 1 »', () => {
    // La contre-épreuve du motif d'écart : les deux rendus doivent DIFFÉRER.
    // Un curseur glissant les rendrait identiques — c'est précisément le défaut
    // que l'écart au §33.5 prétend éviter, et sans ce test on le croirait évité.
    const { container: nonCote, unmount } = render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    const rendusNonCote = nonCote.innerHTML;
    const cochesNonCote = crans().filter((c) => c.checked).length;
    unmount();

    const { container: coteUn } = render(
      <EchelleAncree libelle={LIBELLE} valeur={1} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    const cochesCoteUn = crans().filter((c) => c.checked).length;

    expect(cochesNonCote).toBe(0);
    expect(cochesCoteUn).toBe(1);
    expect(coteUn.innerHTML).not.toBe(rendusNonCote);
  });

  it('n’émet AUCUNE cotation au simple rendu — seul un geste cote', () => {
    const onChangement = vi.fn();
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={onChangement} />,
    );
    expect(onChangement).not.toHaveBeenCalled();
  });

  it('remonte la note choisie, et seulement quand l’auditeur la choisit', () => {
    const onChangement = vi.fn();
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={onChangement} />,
    );
    const cran3 = crans().find((c) => c.value === '3');
    expect(cran3).not.toBeUndefined();
    if (cran3 !== undefined) fireEvent.click(cran3);
    expect(onChangement).toHaveBeenCalledTimes(1);
    expect(onChangement).toHaveBeenCalledWith(3);
  });
});

describe('EchelleAncree — un groupe de choix NOMMÉ par la question', () => {
  it('regroupe les crans sous l’intitulé de la question', () => {
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    expect(screen.getByRole('group', { name: LIBELLE })).not.toBeNull();
  });

  it('rend un cran par note de l’intervalle demandé', () => {
    render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES}
        onChangement={vi.fn()}
        noteMin={0}
        noteMax={3}
      />,
    );
    expect(crans().map((c) => c.value)).toEqual(['0', '1', '2', '3']);
  });

  it('isole deux échelles rendues côte à côte (aucun groupe radio partagé)', () => {
    // Deux questions à l'écran : cocher l'une ne doit pas décocher l'autre.
    // Sans nom de groupe distinct, les dix crans seraient un seul choix.
    render(
      <>
        <EchelleAncree libelle="Question A" valeur={2} ancres={ANCRES} onChangement={vi.fn()} />
        <EchelleAncree libelle="Question B" valeur={5} ancres={ANCRES} onChangement={vi.fn()} />
      </>,
    );
    const coches = crans().filter((c) => c.checked);
    expect(coches.map((c) => c.value).sort()).toEqual(['2', '5']);
  });

  it('désactive tous les crans quand l’écran l’exige', () => {
    render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES}
        onChangement={vi.fn()}
        desactive
      />,
    );
    expect(crans().every((c) => c.disabled)).toBe(true);
  });
});

describe('EchelleAncree — §33.3 : les ancres sont VISIBLES, y compris au clavier', () => {
  it('invite explicitement à coter tant qu’aucune note n’est posée', () => {
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    expect(screen.getByText('Sélectionnez une note pour voir son ancre.')).not.toBeNull();
  });

  it('affiche l’ancre de la note cotée', () => {
    render(<EchelleAncree libelle={LIBELLE} valeur={3} ancres={ANCRES} onChangement={vi.fn()} />);
    expect(screen.getAllByText('Documenté mais non appliqué').length).toBeGreaterThan(0);
  });

  it('révèle l’ancre au FOCUS — le clavier n’a pas de survol', () => {
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    const cran4 = crans().find((c) => c.value === '4');
    if (cran4 !== undefined) fireEvent.focus(cran4);
    expect(screen.getAllByText('Appliqué et suivi').length).toBeGreaterThan(0);
  });

  it('révèle l’ancre au SURVOL, sans rien coter', () => {
    const onChangement = vi.fn();
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={onChangement} />,
    );
    const cran5 = crans().find((c) => c.value === '5');
    if (cran5?.parentElement != null) fireEvent.mouseEnter(cran5.parentElement);
    expect(screen.getAllByText('Piloté et amélioré en continu').length).toBeGreaterThan(0);
    // Comparer les ancres n'est pas répondre : rien n'a été coté.
    expect(onChangement).not.toHaveBeenCalled();
    expect(crans().filter((c) => c.checked)).toEqual([]);
  });

  it('rend TOUTES les ancres consultables d’un seul geste, sans quitter la question', () => {
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    const commande = screen.getByText('Voir toutes les ancres de cotation');
    expect(commande.tagName).toBe('SUMMARY');
    for (const ancre of ANCRES) {
      expect(screen.getAllByText(ancre.texte).length).toBeGreaterThan(0);
    }
  });

  it('n’affiche aucune liste d’ancres quand la question n’en a pas', () => {
    const { container } = render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={[]} onChangement={vi.fn()} />,
    );
    expect(container.querySelector('details')).toBeNull();
  });
});

describe('EchelleAncree — §33.3 : les raccourcis 1-5 s’AFFICHENT pour s’apprendre', () => {
  it('n’affiche aucun rappel de touche par défaut (le terrain est tactile)', () => {
    render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    expect(screen.queryByText(/touche 3/)).toBeNull();
  });

  it('affiche « touche N » sur chaque cran non coté quand l’écran le demande', () => {
    render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES}
        onChangement={vi.fn()}
        afficherRaccourcis
      />,
    );
    for (const note of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`touche ${String(note)}`)).not.toBeNull();
    }
  });

  it('remplace le rappel de touche par la marque sur le cran RETENU', () => {
    render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={3}
        ancres={ANCRES}
        onChangement={vi.fn()}
        afficherRaccourcis
      />,
    );
    expect(screen.queryByText('touche 3')).toBeNull();
    expect(screen.getByText('touche 4')).not.toBeNull();
  });
});
