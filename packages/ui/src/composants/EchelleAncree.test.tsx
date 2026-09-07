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
import { useState } from 'react';
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

  it('rend TOUTES les ancres consultables sans quitter la question', () => {
    // ── CE QUE CE TEST A CESSÉ D'EXIGER, ET POURQUOI (2026-09-07) ─────────────
    // Il figeait la chaîne « Voir toutes les ancres de cotation ». Le correctif
    // R1 ouvre le dépliant PAR DÉFAUT (03 §33.5) : « Voir » invitait alors à un
    // geste devenu inutile, et A21 l'a retiré. L'arbitrage A01 est MUET sur ce
    // libellé — aucun des deux n'avait tort, et un test qui arbitre ce que la
    // spécification ne tranche pas transforme une question de rédaction en
    // échec de build.
    //
    // Ce qui est EXIGIBLE, en revanche, tient au pack et pas à une préférence :
    // la liste est commandée par un `<summary>` (donc un contrôle nommé,
    // atteignable au clavier), ce résumé DIT de quoi il s'agit — il porte le
    // mot « ancres » —, et les libellés sont là. Le jour où quelqu'un
    // remplacerait le résumé par un « … » ou par une icône seule, ce test
    // mordrait ; le jour où l'on préfère « Toutes les ancres », il se tait.
    const { container } = render(
      <EchelleAncree libelle={LIBELLE} valeur={null} ancres={ANCRES} onChangement={vi.fn()} />,
    );
    const pliant = container.querySelector('details');
    expect(pliant, 'la liste des ancres vit dans un dépliant natif').not.toBeNull();
    const commande = pliant?.querySelector('summary') ?? null;
    expect(
      commande,
      'le dépliant porte un `summary` — sans lui, rien ne le commande',
    ).not.toBeNull();
    expect(
      (commande?.textContent ?? '').toLocaleLowerCase('fr-FR'),
      'le résumé annonce ce qu’il ouvre',
    ).toContain('ancres');
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

// =============================================================================
// R1 — « LES ANCRES SE LISENT AVANT LA COTATION », ET NON APRÈS
//
// Ces tests sont écrits AVANT le correctif (09 §3-2), par un agent qui n'écrit
// aucune ligne du composant (09 §5.6). Ils décrivent l'arbitrage A01 du
// 2026-09-07 (DECISIONS.md, commit b5a11a4), point par point.
//
// ── CE QU'ILS ATTRAPENT, DANS L'ÉTAT D'AVANT ────────────────────────────────
// ① `const affichee = survolee ?? valeur` : au doigt il n'y a NI survol NI
//    focus, donc rien ne s'affiche tant que l'auditeur n'a pas coté. L'ancre
//    commente la décision au lieu de la soutenir (03 §33.3 : « la cotation
//    homogène ne dépend pas de la mémoire du consultant »).
// ② `{texteAncre ?? (affichee === null ? '…' : '')}` : sur les crans 2 et 4 —
//    non ancrés en banque puisque `ANCRES_REQUISES = [1, 3, 5]` — la ligne rend
//    la CHAÎNE VIDE dans un bloc à hauteur réservée. L'auditeur voit un blanc
//    et croit à une panne.
// ③ `<details>` sans `open` : 03 §33.5 dit « ancres DÉPLIÉES ».
//
// ── LA RÈGLE QUE CES TESTS S'IMPOSENT ───────────────────────────────────────
// Aucune assertion ne se calcule depuis le code de production : les textes
// attendus sont des LITTÉRAUX copiés de l'arbitrage, et l'anti-vacuité se
// mesure sur le TEXTE RENDU, jamais sur l'état interne du composant. Une garde
// qui fabrique sa propre condition passe le jour où le code se trompe
// (`docs/REPRISE_AUTOPILOTE.md` §6-2).
//
// Ni date ni heure n'entrent dans ces tests : ils diront la même chose dans six
// mois, à trois heures du matin.
// =============================================================================

/**
 * Les ancres d'une VRAIE question de banque : 1, 3 et 5, et rien d'autre.
 *
 * `ANCRES_REQUISES = [1, 3, 5]` (packages/shared) : 2 et 4 restent facultatifs
 * à l'import, donc l'écrasante majorité des échelles arrive ainsi. Le jeu à cinq
 * ancres du haut de ce fichier est le cas HEUREUX ; celui-ci est le cas NORMAL,
 * et c'est lui qui produisait deux lignes blanches.
 */
const ANCRES_DE_BANQUE: readonly AncreCotation[] = [
  { note: 1, texte: 'Aucune pratique identifiée' },
  { note: 3, texte: 'Documenté mais non appliqué' },
  { note: 5, texte: 'Piloté et amélioré en continu' },
];

/**
 * La copie EXACTE des crans dérivés (arbitrage A01 du 2026-09-07).
 *
 * Elle n'est pas inventée par le composant : c'est la phrase de l'amendement
 * §32.4 du 2026-09-02 (doctrine 3, Williams) — « la note 2 (resp. 4) exige au
 * moins un élément établi de l'ancre 3 (resp. 5) ». Un test qui n'exigerait
 * qu'un texte NON VIDE laisserait passer « entre l'ancre 1 et l'ancre 3 », qui
 * situe une position sans dire comment coter : c'est précisément la proposition
 * que l'arbitrage a écartée.
 */
const DERIVEE_CRAN_2 =
  '2 — palier intermédiaire : au moins un élément de l’ancre 3 est établi, ' +
  'sans qu’elle soit atteinte (doctrine §32.4).';
const DERIVEE_CRAN_4 =
  '4 — palier intermédiaire : au moins un élément de l’ancre 5 est établi, ' +
  'sans qu’elle soit atteinte (doctrine §32.4).';

/**
 * Compare des PHRASES, pas des glyphes.
 *
 * L'apostrophe typographique et l'espace insécable avant le deux-points sont des
 * choix de composition, pas des mots : les figer ferait échouer le test sur une
 * touche de clavier plutôt que sur une régression de sens. Tout le reste — chaque
 * mot, chaque ponctuation — est comparé à l'identique.
 */
function phrase(texte: string | null): string {
  return (texte ?? '').replace(/[’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}

/** La ligne d'ancre — celle dont le CSS réserve la hauteur, donc celle qui blanchit. */
function ligneAncre(racine: HTMLElement): HTMLElement {
  const ligne = racine.querySelector<HTMLElement>('.axn-choix__ancre');
  if (ligne === null) throw new Error('la ligne d’ancre `.axn-choix__ancre` a disparu du rendu');
  return ligne;
}

function dePliant(racine: HTMLElement): HTMLDetailsElement {
  const pliant = racine.querySelector('details');
  if (pliant === null) throw new Error('le dépliant des ancres a disparu du rendu');
  return pliant;
}

/**
 * L'échelle telle qu'un ÉCRAN la pilote : la note tapée redescend en `valeur`.
 *
 * Sans ce harnais, « taper sur 2 » ne changerait rien — le composant est
 * contrôlé. Et `fireEvent.click` ne déclenche ni `mouseenter` ni `focus` : c'est
 * exactement le doigt sur une dalle tactile, qui n'a ni survol ni focus.
 */
function EchelleAuDoigt({
  ancres,
  desactive = false,
  noteMin = 1,
  noteMax = 5,
}: {
  readonly ancres: readonly AncreCotation[];
  readonly desactive?: boolean;
  /** L'amplitude. Elle n'est plus décorative : la dérivation y est BORNÉE. */
  readonly noteMin?: number;
  readonly noteMax?: number;
}) {
  const [valeur, setValeur] = useState<number | null>(null);
  return (
    <EchelleAncree
      libelle={LIBELLE}
      valeur={valeur}
      ancres={ancres}
      onChangement={setValeur}
      desactive={desactive}
      noteMin={noteMin}
      noteMax={noteMax}
    />
  );
}

function taperSur(note: number): void {
  const cran = crans().find((c) => c.value === String(note));
  if (cran === undefined) throw new Error(`aucun cran ${String(note)} à taper`);
  fireEvent.click(cran);
}

describe('EchelleAncree — R1 (a) : les ancres sont LUES AVANT le premier geste', () => {
  it('rend les libellés 1, 3 et 5 SANS aucune interaction', () => {
    render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
      />,
    );
    for (const ancre of ANCRES_DE_BANQUE) {
      expect(
        screen.getAllByText(ancre.texte).length,
        `l’ancre ${String(ancre.note)} doit être lisible avant toute cotation`,
      ).toBeGreaterThan(0);
    }
  });

  it('déplie le dépliant PAR DÉFAUT — 03 §33.5 : « ancres DÉPLIÉES »', () => {
    const { container } = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
      />,
    );
    expect(dePliant(container).open, 'le dépliant des ancres est ouvert au rendu initial').toBe(
      true,
    );
  });

  it('rend les ancres visibles sans le moindre appel au parent', () => {
    // La contre-épreuve du défaut : aucun `mouseEnter`, aucun `focus`, aucun
    // clic — le rendu seul doit suffire, et rien ne doit avoir été coté.
    const onChangement = vi.fn();
    const { container } = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={onChangement}
      />,
    );
    expect(dePliant(container).open).toBe(true);
    expect(onChangement).not.toHaveBeenCalled();
    expect(crans().filter((c) => c.checked)).toEqual([]);
  });

  it('ne laisse AUCUNE définition vide dans la liste des ancres', () => {
    // Une paire `dt`/`dd` dont la définition est vide est une ligne blanche de
    // plus, et elle se lit « il manque quelque chose ». Les crans dérivés, s'ils
    // sont listés, portent la phrase de doctrine — jamais un tiret.
    const { container } = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
      />,
    );
    const paires = [...container.querySelectorAll('.axn-choix__paire')];
    expect(paires.length, 'la liste des ancres est rendue').toBeGreaterThan(0);
    for (const paire of paires) {
      const niveau = phrase(paire.querySelector('dt')?.textContent ?? null);
      const definition = phrase(paire.querySelector('dd')?.textContent ?? null);
      expect(definition, `le niveau ${niveau} est listé sans définition`).not.toBe('');
      if (niveau === '2') expect(definition).toContain(phrase(DERIVEE_CRAN_2));
      if (niveau === '4') expect(definition).toContain(phrase(DERIVEE_CRAN_4));
    }
  });
});

describe('EchelleAncree — R1 (b) : les crans 2 et 4 disent COMMENT coter, jamais rien', () => {
  // ── POURQUOI « CONTIENT » ET NON « ÉGALE » ─────────────────────────────────
  // La phrase de doctrine est exigée MOT POUR MOT ; la §33.6 exige en plus que
  // l'entrée dérivée se distingue d'une ancre de banque AUTREMENT QUE PAR LA
  // COULEUR — donc par un mot, que le composant est libre de poser. Exiger
  // l'égalité stricte de toute la ligne interdirait ce marqueur, c'est-à-dire
  // qu'un test ferait échouer une exigence du pack. On exige donc la phrase
  // ENTIÈRE, à la lettre, et on laisse la marque exister à côté.
  it('rend la phrase de doctrine du cran 2 après un tap sur 2 (ni survol ni focus)', () => {
    const { container } = render(<EchelleAuDoigt ancres={ANCRES_DE_BANQUE} />);
    taperSur(2);
    expect(phrase(ligneAncre(container).textContent)).toContain(phrase(DERIVEE_CRAN_2));
  });

  it('rend la phrase de doctrine du cran 4 après un tap sur 4', () => {
    const { container } = render(<EchelleAuDoigt ancres={ANCRES_DE_BANQUE} />);
    taperSur(4);
    expect(phrase(ligneAncre(container).textContent)).toContain(phrase(DERIVEE_CRAN_4));
  });

  it('enchaîne 2 puis 4 sans jamais blanchir entre les deux', () => {
    const { container } = render(<EchelleAuDoigt ancres={ANCRES_DE_BANQUE} />);
    taperSur(2);
    expect(phrase(ligneAncre(container).textContent)).toContain(phrase(DERIVEE_CRAN_2));
    taperSur(4);
    expect(phrase(ligneAncre(container).textContent)).toContain(phrase(DERIVEE_CRAN_4));
    taperSur(3);
    expect(phrase(ligneAncre(container).textContent)).toContain('Documenté mais non appliqué');
  });

  it('distingue le cran DÉRIVÉ du cran de banque EN NOIR ET BLANC (§33.6)', () => {
    // Une teinte ne se lit ni par un daltonien, ni par un lecteur d'écran, ni
    // sur une dalle en plein soleil d'atelier. La différence doit donc tenir
    // dans les MOTS eux-mêmes — ce test la mesure sur le texte seul, sans
    // regarder une classe ni une couleur.
    const { container } = render(<EchelleAuDoigt ancres={ANCRES_DE_BANQUE} />);
    taperSur(3);
    const surAncreDeBanque = phrase(ligneAncre(container).textContent);
    taperSur(2);
    const surCranDerive = phrase(ligneAncre(container).textContent);

    expect(surAncreDeBanque).not.toContain('palier intermédiaire');
    expect(surCranDerive).toContain('palier intermédiaire');
    expect(surCranDerive).not.toBe(surAncreDeBanque);
  });

  it('ne rend JAMAIS une ligne d’ancre vide, sur AUCUN des cinq crans', () => {
    // L'anti-vacuité se mesure sur le TEXTE RENDU. Elle ne consulte ni la liste
    // d'ancres passée en propriété, ni un état du composant : une garde qui
    // fabriquerait sa propre condition serait verte le jour de la panne.
    for (const note of [1, 2, 3, 4, 5]) {
      const { container, unmount } = render(<EchelleAuDoigt ancres={ANCRES_DE_BANQUE} />);
      taperSur(note);
      expect(
        phrase(ligneAncre(container).textContent),
        `la ligne d’ancre est blanche sur le cran ${String(note)}`,
      ).not.toBe('');
      unmount();
    }
  });

  it('dit quelque chose d’UTILE même quand l’ancre voisine manque aussi', () => {
    // Cran 2 sans ancre 3 : la dérivation est impossible, et un blanc reste un
    // blanc. Le texte neutre n'est pas figé ici — son libellé appartient au
    // composant — mais son EXISTENCE, oui.
    const { container } = render(
      <EchelleAuDoigt ancres={[{ note: 1, texte: 'Aucune pratique identifiée' }]} />,
    );
    taperSur(2);
    expect(phrase(ligneAncre(container).textContent)).not.toBe('');
  });

  it('ne prétend pas dériver du néant : la phrase de doctrine exige l’ancre voisine', () => {
    // Sans ancre 3, on ne peut pas écrire « au moins un élément de l'ancre 3 est
    // établi » : ce serait renvoyer l'auditeur à un texte qui n'existe pas.
    const { container } = render(
      <EchelleAuDoigt ancres={[{ note: 1, texte: 'Aucune pratique identifiée' }]} />,
    );
    taperSur(2);
    expect(phrase(ligneAncre(container).textContent)).not.toBe(phrase(DERIVEE_CRAN_2));
  });

  it('conserve `aria-live="polite"` sur la ligne d’ancre', () => {
    // Le lecteur d'écran annonce le changement d'ancre à mesure qu'on parcourt
    // les crans à la flèche. Sans cet attribut, l'auditeur non-voyant cote à
    // l'aveugle — au sens propre.
    const { container } = render(<EchelleAuDoigt ancres={ANCRES_DE_BANQUE} />);
    expect(ligneAncre(container).getAttribute('aria-live')).toBe('polite');
  });
});

describe('EchelleAncree — R1 (c) : l’invitation à coter reste intacte', () => {
  it('affiche l’invitation tant que rien n’est coté, ancres de banque comprises', () => {
    const { container } = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
      />,
    );
    expect(phrase(ligneAncre(container).textContent)).toBe(
      'Sélectionnez une note pour voir son ancre.',
    );
  });

  it('remplace l’invitation par l’ancre dès que la note est posée', () => {
    const { container } = render(<EchelleAuDoigt ancres={ANCRES_DE_BANQUE} />);
    taperSur(5);
    const ligne = phrase(ligneAncre(container).textContent);
    expect(ligne).toContain('Piloté et amélioré en continu');
    expect(ligne).not.toContain('Sélectionnez une note');
  });
});

describe('EchelleAncree — R1 : le dépliant se replie à la main, et ne s’en souvient pas', () => {
  it('accepte `ancresDepliees={false}` — le repli est un choix de l’écran', () => {
    // Les DEUX états sont mesurés dans le même test, et ce n'est pas du zèle :
    // un composant qui ignorerait purement la propriété rendrait un dépliant
    // fermé dans les deux cas et passerait une assertion isolée sur `false`.
    // C'est l'écart entre les deux rendus qui prouve que la propriété est lue.
    const parDefaut = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
      />,
    );
    expect(dePliant(parDefaut.container).open, 'défaut : déplié').toBe(true);
    parDefaut.unmount();

    const replie = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
        ancresDepliees={false}
      />,
    );
    expect(dePliant(replie.container).open, '`ancresDepliees={false}` : replié').toBe(false);
  });

  it('rouvre les ancres à la question suivante : le repli n’est PAS mémorisé', () => {
    // Le repli d'une question ne doit pas priver l'auditeur d'ancres sur les
    // cent questions suivantes. Un remontage rend l'état de départ ; toute
    // persistance (stockage local, module global) le contredirait.
    const premier = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
      />,
    );
    const pliant = dePliant(premier.container);
    pliant.open = false;
    fireEvent(pliant, new Event('toggle'));
    expect(pliant.open).toBe(false);
    premier.unmount();

    const second = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={null}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
      />,
    );
    expect(dePliant(second.container).open, 'la question suivante rouvre ses ancres').toBe(true);
  });
});

describe('EchelleAncree — R1 : une échelle GRISÉE garde ses ancres', () => {
  it('affiche les ancres et les déplie même quand l’écriture est refusée', () => {
    // Session terminée, relecture, partage : on ne cote plus, mais on doit
    // toujours pouvoir lire sur quoi la cotation reposait. Retirer les ancres
    // avec l'écriture rendrait la relecture incompréhensible.
    const { container } = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={3}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
        desactive
      />,
    );
    expect(crans().every((c) => c.disabled)).toBe(true);
    expect(dePliant(container).open).toBe(true);
    expect(phrase(ligneAncre(container).textContent)).toContain('Documenté mais non appliqué');
    for (const ancre of ANCRES_DE_BANQUE) {
      expect(screen.getAllByText(ancre.texte).length).toBeGreaterThan(0);
    }
  });

  it('garde la phrase de doctrine sur un cran dérivé, écriture refusée', () => {
    const { container } = render(
      <EchelleAncree
        libelle={LIBELLE}
        valeur={4}
        ancres={ANCRES_DE_BANQUE}
        onChangement={vi.fn()}
        desactive
      />,
    );
    expect(phrase(ligneAncre(container).textContent)).toContain(phrase(DERIVEE_CRAN_4));
  });
});
