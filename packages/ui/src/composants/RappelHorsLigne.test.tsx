// =============================================================================
// TESTS — RAPPEL HORS LIGNE (@axion/ui)
//
// ── DÉCLARATION DE CROISEMENT (09 §5.6), FAITE AVANT LES ASSERTIONS ──────────
// Ce fichier et le composant qu'il éprouve ont été écrits DANS LA MÊME PASSE, par
// A28, sur mandat de mesure de la porte P-C. La règle « le code de test n'est
// jamais écrit par l'agent qui a écrit le code testé » n'est donc PAS tenue ici,
// et le dire est plus utile que de le taire : ce fichier vaut comme preuve de
// non-régression, PAS comme revue croisée. La revue croisée reste due (A29).
//
// ── CE QUE CES TESTS TIENNENT, ET POURQUOI CHACUN EXISTE ─────────────────────
// §33.2 : l'état hors ligne est « pastille discrète + RAPPEL DES CAPACITÉS
// LOCALES ». Le contrôle A02 de P-C mesure que la seconde moitié manque sur la
// plupart des vues. Trois choses doivent donc être vraies pour de bon :
//   1. le composant SE TAIT quand le réseau est là — sinon la condition
//      `{!enLigne && …}` retourne dans les écrans, et elle y sera oubliée ;
//   2. il ÉNUMÈRE, hors ligne, tout ce que l'écran lui a passé ;
//   3. il n'annonce PAS une panne (invariant 1 : hors ligne est le mode nominal),
//      et il ne crée PAS une seconde région vivante autour de celle de la
//      pastille — deux régions imbriquées font répéter ou avaler le message.
// Traçabilité : E27, E44, E6.
// =============================================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RappelHorsLigne } from './RappelHorsLigne.js';

afterEach(() => {
  cleanup();
});

const CAPACITES = [
  'Ouvrir, mener et terminer une session de collecte',
  'Annoter, signaler un point à revoir, terminer une session',
  'Exporter une sauvegarde de secours chiffrée',
] as const;

describe('RappelHorsLigne — la condition est DANS le composant, pas dans l’écran', () => {
  it('ne rend RIEN quand le réseau est là', () => {
    const { container } = render(<RappelHorsLigne enLigne capacites={CAPACITES} />);
    expect(container.innerHTML).toBe('');
  });

  it('apparaît dès que le réseau disparaît, sans que l’écran ait à le savoir', () => {
    const { container, rerender } = render(<RappelHorsLigne enLigne capacites={CAPACITES} />);
    expect(container.innerHTML).toBe('');
    rerender(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(CAPACITES.length);
  });

  it('CONTRE-ÉPREUVE : sans la garde, le premier test serait vert pour rien', () => {
    // Si `enLigne` cessait d'être consulté, le composant rendrait toujours son
    // bloc — et le cas « en ligne » ci-dessus rougirait. Cette ligne éprouve
    // l'autre sens : le rendu hors ligne n'est pas vide.
    const { container } = render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(container.innerHTML).not.toBe('');
  });
});

describe('RappelHorsLigne — §33.2 : le rappel des CAPACITÉS LOCALES', () => {
  it('énumère chaque capacité fournie, une par entrée de liste, dans l’ordre', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.getAllByRole('listitem').map((e) => e.textContent)).toEqual([...CAPACITES]);
  });

  it('introduit la liste par une phrase française qui dit ce qui MARCHE', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.getByText('Sans réseau, cet appareil sait encore :')).not.toBeNull();
  });

  it('laisse l’écran remplacer l’introduction quand son contexte l’exige', () => {
    render(
      <RappelHorsLigne
        enLigne={false}
        capacites={CAPACITES}
        introduction="Sans réseau, cette restauration reste possible :"
      />,
    );
    expect(screen.getByText('Sans réseau, cette restauration reste possible :')).not.toBeNull();
  });

  it('porte la pastille « Hors ligne » de §19.2 — le mot, jamais la seule couleur', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.getByRole('status').textContent).toContain('Hors ligne');
  });

  it('compte les éléments en attente quand l’écran le lui donne', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} enAttente={7} />);
    expect(screen.getByRole('status').textContent).toContain('7 en attente');
  });

  it('ne parle pas d’attente quand l’écran ne fournit aucun compte', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.getByRole('status').textContent).not.toContain('en attente');
  });

  it('REFUSE une liste vide À LA COMPILATION (contre-épreuve de type)', () => {
    // `EtatHorsLigne` promet un contrat « non vide » dans son en-tête que son
    // type ne porte pas : `capacites={[]}` y compile et rend un état hors ligne
    // qui n'énumère RIEN. Ici, le compilateur le refuse. Si le type se relâchait,
    // la directive ci-dessous deviendrait inutile et `pnpm typecheck` rougirait —
    // c'est la contre-épreuve, et elle vaut mieux qu'un commentaire.
    // @ts-expect-error — `capacites` est une liste NON VIDE : `[]` ne compile pas.
    const interdit = <RappelHorsLigne enLigne={false} capacites={[]} />;
    expect(interdit).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `avecPastille` — ajouté par A21 le 2026-09-06 au branchement des onze vues.
// MÊME DÉCLARATION DE CROISEMENT : la propriété et ces quatre cas sont écrits
// dans la même passe, par A21. Non-régression, pas revue croisée (A29 due).
//
// Ce que ces cas tiennent : la PWA terrain pose UNE pastille dans l'en-tête de
// sa coquille (décision A01, 2026-09-05) pour les onze écrans. En rendre une
// seconde ici, nourrie par `navigator.onLine` alors que celle de l'en-tête l'est
// par le port de sync, rouvrirait le bloquant B6 du 2026-09-06 : deux pastilles,
// deux sources, un seul écran. Le défaut RESTE `true` — le silence doit être sûr.
// ─────────────────────────────────────────────────────────────────────────────
describe('RappelHorsLigne — `avecPastille` : la pastille peut vivre ailleurs', () => {
  it('la rend PAR DÉFAUT : un écran qui ne déclare rien obtient les deux moitiés de §33.2', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.getByRole('status').textContent).toContain('Hors ligne');
  });

  it('la retire quand l’écran déclare la porter ailleurs — et RIEN d’autre ne bouge', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} avecPastille={false} />);
    expect(screen.queryByRole('status')).toBeNull();
    // La moitié qui compte reste entière : c'est elle que §33.2 réclamait.
    expect(screen.getAllByRole('listitem').map((e) => e.textContent)).toEqual([...CAPACITES]);
    expect(screen.getByText('Sans réseau, cet appareil sait encore :')).not.toBeNull();
  });

  it('CONTRE-ÉPREUVE : sans pastille, plus AUCUNE région vivante n’est ouverte', () => {
    // Si le drapeau cessait d'être consulté, ce cas rougirait — c'est le seul
    // moyen de savoir que la seconde pastille a réellement disparu de l'écran.
    const { container } = render(
      <RappelHorsLigne enLigne={false} capacites={CAPACITES} avecPastille={false} />,
    );
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
  });

  it('se tait quand même en ligne, drapeau baissé ou levé', () => {
    const { container } = render(
      <RappelHorsLigne enLigne capacites={CAPACITES} avecPastille={false} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('RappelHorsLigne — invariant 1 : hors ligne n’est PAS une panne', () => {
  it('n’expose JAMAIS `role="alert"` (§17.3 : aucune notification intrusive)', () => {
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('n’ouvre qu’UNE SEULE région vivante — celle de la pastille', () => {
    // Deux `role="status"` imbriqués font répéter — ou avaler — l'annonce selon
    // le lecteur d'écran. L'enveloppe n'en porte donc pas.
    render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('retire l’icône de l’arbre d’accessibilité (§33.6)', () => {
    const { container } = render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    const icones = [...container.querySelectorAll('svg')];
    expect(icones.length).toBeGreaterThan(0);
    for (const icone of icones) {
      expect(icone.getAttribute('aria-hidden')).toBe('true');
      expect(icone.getAttribute('focusable')).toBe('false');
    }
  });

  it('n’écrit aucune couleur ni taille en ligne (invariant 4)', () => {
    const { container } = render(<RappelHorsLigne enLigne={false} capacites={CAPACITES} />);
    for (const element of container.querySelectorAll('*')) {
      expect(element.getAttribute('style'), element.outerHTML).toBeNull();
    }
  });

  it('rend un texte 100 % français (invariant 5)', () => {
    const { container } = render(
      <RappelHorsLigne enLigne={false} capacites={CAPACITES} enAttente={3} />,
    );
    const texte = container.textContent;
    expect(texte.length).toBeGreaterThan(0);
    expect(/\b(?:offline|pending|loading|retry|sync)\b/i.exec(texte)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LES BORDS DE LA LISTE — ajoutés par A21 le 2026-09-06 (revue A29, remarques).
// Toutes les assertions ci-dessus utilisent la MÊME constante à trois entrées
// distinctes : ni le minimum que le type autorise (un), ni le cas où l'appelant
// répète une ligne n'étaient éprouvés. Les deux sont arrivés par la revue, pas
// par la relecture — c'est le propre des bords.
// ─────────────────────────────────────────────────────────────────────────────
describe('RappelHorsLigne — les bords de `capacites`', () => {
  it('rend une liste d’UN SEUL élément — le minimum que le type autorise', () => {
    const seule = ['Restaurer une sauvegarde de secours, intégralement sans réseau'] as const;
    render(<RappelHorsLigne enLigne={false} capacites={seule} />);
    expect(screen.getAllByRole('listitem').map((e) => e.textContent)).toEqual([...seule]);
    // Et la phrase d'introduction n'est pas au pluriel : elle ne compte pas.
    expect(screen.getByText('Sans réseau, cet appareil sait encore :')).not.toBeNull();
  });

  it('rend DEUX entrées identiques sans en avaler une, et sans avertissement React', () => {
    // La clé était le TEXTE : un doublon faisait crier React et pouvait perdre
    // une ligne. Le composant ne doit rien exiger que son type ne dise —
    // `ListeNonVide` promet « au moins un », jamais « tous distincts ».
    const cri = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const doublon = ['Prendre des notes', 'Prendre des notes'] as const;
      render(<RappelHorsLigne enLigne={false} capacites={doublon} />);
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(cri, cri.mock.calls.map((a) => String(a[0])).join('\n')).not.toHaveBeenCalled();
    } finally {
      cri.mockRestore();
    }
  });
});
