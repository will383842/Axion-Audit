// =============================================================================
// R7 — L'AIDE CLAVIER, ET LA SOURCE UNIQUE QUI LA REND VRAIE.
// Écrit par A26 (09 §5.6 : A22 a livré `PanneauRaccourcis` et la table, il
// n'écrit pas ce qui les mesure — il l'a d'ailleurs écrit lui-même : « les cas de
// la fenêtre elle-même appartiennent à A26 »), depuis 03 §33.3 (raccourcis
// complets, règle V2.8 « actifs seulement HORS focus d'un champ de saisie »,
// mode écran partagé) et 03 §17.5 (aides contextuelles « ? » par écran).
//
// ── LE TEST QUI COMPTE, ET IL EST DANS LES DEUX SENS ────────────────────────
// A22 a supprimé une double source : la liste des raccourcis vivait dans un
// `switch` ET dans un commentaire. Elle est maintenant une TABLE
// (`RACCOURCIS_ENTRETIEN`) que le gestionnaire DISPATCHE et que l'aide LIT.
// Le seul test qui vaut cette suppression est celui qui ROUGIT SI LES DEUX
// DIVERGENT, et il faut donc le fermer des deux côtés :
//
//   ① l'AIDE rend exactement ce que la table déclare — toutes les entrées, dans
//      l'ordre, touches ET libellés, Y COMPRIS les trois à `executer: null`
//      (Entrée, ↑↓, Échap) qui n'ont pas de branche dans le dispatch ;
//   ② le DISPATCH honore exactement ce que la table déclare — chaque touche
//      d'une entrée exécutable appelle une action, et aucune autre touche n'en
//      appelle. Sans ce second sens, on pourrait ajouter une ligne à l'aide sans
//      que rien ne la traite, et le test ① serait vert.
//
// ── LA GARDE DE FOCUS EST RÉUTILISÉE, ET ÇA SE PROUVE PAR ÉQUIVALENCE ──────
// A22 affirme n'avoir pas réécrit `estChampDeSaisie`. On ne le vérifie pas en
// lisant le code : pour une batterie de cibles (textarea, `select`, éditable,
// `data-saisie-libre`, et TOUS les types d'`input`), on exige que le SILENCE du
// gestionnaire coïncide EXACTEMENT avec le verdict de `estChampDeSaisie`. Une
// garde réécrite en ligne, avec une liste de types un peu différente, divergerait
// sur au moins un cas — et c'est ce cas-là qui rougirait.
//
// ── CE QUI N'EST PAS ICI ────────────────────────────────────────────────────
// « ? » ouvre réellement le panneau sur l'écran d'entretien, et ne l'ouvre PAS en
// écran partagé : cela se joue sur l'écran monté, et vit dans
// `EcranEntretien.test.tsx`, avec le reste des raccourcis.
//
// Traçabilité : E13 · E23 (novice < 30 min) · E44 (grille §33, raccourcis
// complets) · E33 (sécurité / RGPD : rien d'interne devant l'interviewé, écran partagé).
// =============================================================================
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import {
  estChampDeSaisie,
  useRaccourcisEntretien,
  RACCOURCIS_ENTRETIEN,
  type ActionsRaccourcis,
} from '../../session/raccourcis.js';
import { PanneauRaccourcis } from './PanneauRaccourcis.js';

// -----------------------------------------------------------------------------
// Outillage
// -----------------------------------------------------------------------------
function requis<T>(valeur: T | null | undefined, libelle: string): T {
  if (valeur === null || valeur === undefined) throw new Error(`harnais : ${libelle} manquant`);
  return valeur;
}

/** Toutes les actions, sous espion — aucune n'est privilégiée. */
function actionsEspionnees(): { actions: ActionsRaccourcis; appels: () => string[] } {
  const journal: string[] = [];
  const actions: ActionsRaccourcis = {
    suivant: () => journal.push('suivant'),
    precedent: () => journal.push('precedent'),
    coter: (n) => journal.push(`coter:${String(n)}`),
    ouiNon: (v) => journal.push(`ouiNon:${v}`),
    sansObjet: () => journal.push('sansObjet'),
    aRevoir: () => journal.push('aRevoir'),
    recherche: () => journal.push('recherche'),
    partage: () => journal.push('partage'),
    aide: () => journal.push('aide'),
  };
  return { actions, appels: () => [...journal] };
}

let journalCourant: () => string[] = () => [];

/** Un écran minimal qui n'a QUE le gestionnaire de raccourcis, et des cibles. */
function Cobaye({ actif = true }: { readonly actif?: boolean }): ReactNode {
  const [{ actions, appels }] = useState(actionsEspionnees);
  journalCourant = appels;
  useRaccourcisEntretien(actions, { actif });
  return (
    <div>
      <p data-cible="neutre">Texte neutre de l’écran</p>
      <textarea aria-label="zone de notes" defaultValue="" />
      <select aria-label="une liste">
        <option value="a">a</option>
      </select>
      <div contentEditable aria-label="éditable" suppressContentEditableWarning />
      <input aria-label="marqué saisie libre" type="text" data-saisie-libre="vrai" />
      <input aria-label="radio" type="radio" />
      <input aria-label="case" type="checkbox" />
      <input aria-label="bouton natif" type="button" />
      <input aria-label="curseur" type="range" />
      <input aria-label="couleur" type="color" />
      <button type="button">un bouton</button>
      {TYPES_INPUT.map((type) => (
        <input key={type} aria-label={`input ${type}`} type={type} />
      ))}
    </div>
  );
}

/** Les types d'`input` que le contrat V2.8 doit trancher — texte ou pas texte. */
const TYPES_INPUT = [
  'text',
  'search',
  'email',
  'number',
  'tel',
  'url',
  'password',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
] as const;

/** Le `code` DOM d'une touche — au cas où le code lirait `event.code`. */
function codeDeTouche(key: string): string {
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (key === '/') return 'Slash';
  if (key === '?') return 'Slash';
  return key;
}

function touche(key: string, cible: Element): void {
  fireEvent.keyDown(cible, { key, code: codeDeTouche(key) });
}

function ecran(): Element {
  return requis(document.querySelector('[data-cible="neutre"]'), 'cible neutre');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// ① L'AIDE REND CE QUE LA TABLE DÉCLARE — et rougit si les deux divergent
// ═════════════════════════════════════════════════════════════════════════════
describe('R7 — le panneau d’aide LIT la table, il ne la recopie pas', () => {
  function ouvrirLAide(): void {
    render(<PanneauRaccourcis ouvert onFermer={() => undefined} />);
  }

  /** Les lignes rendues : couples (touches affichées, libellé). */
  function lignesRendues(): { touches: string[]; libelle: string }[] {
    return [...document.querySelectorAll('.axn-raccourcis__ligne')].map((ligne) => ({
      touches: [...ligne.querySelectorAll('kbd')].map((k) => k.textContent),
      libelle: ligne.querySelector('.axn-raccourcis__libelle')?.textContent ?? '',
    }));
  }

  it('@critique chaque entrée de RACCOURCIS_ENTRETIEN est rendue, dans l’ordre, touches ET libellé', () => {
    ouvrirLAide();
    const attendu = RACCOURCIS_ENTRETIEN.map((raccourci) => ({
      touches: [...raccourci.touches],
      libelle: raccourci.libelle,
    }));
    // Anti-vacuité : une table vide rendrait ce test vert sans rien mesurer.
    expect(attendu.length).toBeGreaterThanOrEqual(8);
    expect(lignesRendues()).toEqual(attendu);
  });

  it('@critique les TROIS touches à `executer: null` sont listées — l’aide dit ce que le dispatch ignore', () => {
    ouvrirLAide();
    const sansExecuteur = RACCOURCIS_ENTRETIEN.filter((r) => r.executer === null);
    // Elles existent : Entrée, ↑↓, Échap portent des nuances que la table ne
    // saurait décrire, et c'est précisément pourquoi on pourrait les oublier.
    // Le chiffre n'est PAS figé — trois au 2026-09-09 est un constat daté, pas
    // une cible : une quatrième nuance légitime n'a pas à faire rougir un test
    // d'accessibilité (même doctrine que le « 4 sur 12 » d'A28 sur le hors ligne).
    expect(sansExecuteur.length).toBeGreaterThanOrEqual(3);
    const rendues = lignesRendues();
    for (const raccourci of sansExecuteur) {
      expect(rendues).toContainEqual({
        touches: [...raccourci.touches],
        libelle: raccourci.libelle,
      });
    }
  });

  it('@critique aucune touche RENDUE n’est absente de la table, et réciproquement', () => {
    ouvrirLAide();
    const dansLaTable = RACCOURCIS_ENTRETIEN.flatMap((r) => [...r.touches]).sort();
    const alEcran = [...document.querySelectorAll('kbd')].map((k) => k.textContent).sort();
    expect(alEcran).toEqual(dansLaTable);
  });

  it('le panneau énonce la règle V2.8 — « hors d’un champ de saisie », et Échap rend le focus', () => {
    ouvrirLAide();
    const boite = screen.getByRole('dialog', { name: 'Raccourcis clavier' });
    const description = document.getElementById(boite.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent ?? '').toMatch(/hors d’un champ de saisie/i);
    expect(description?.textContent ?? '').toMatch(/Échap rend le focus/i);
  });

  it('fermé, il ne rend RIEN — pas un panneau masqué en CSS (leçon de l’écran partagé)', () => {
    render(<PanneauRaccourcis ouvert={false} onFermer={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('kbd')).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LE PANNEAU EST UNE FENÊTRE, PAS UNE BOÎTE NATIVE
// ═════════════════════════════════════════════════════════════════════════════
describe('R7 — la fenêtre : Échap, focus piégé, focus RENDU, aucun `alert()`', () => {
  it('@critique aucun `alert()` n’est appelé — ni à l’ouverture, ni à la fermeture', () => {
    const boite = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const fermer = vi.fn();
    const rendu = render(<PanneauRaccourcis ouvert onFermer={fermer} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    rendu.unmount();
    expect(boite).not.toHaveBeenCalled();
  });

  it('@critique Échap ferme — c’est le comportement du design system, pas une réimplémentation', () => {
    const fermer = vi.fn();
    render(<PanneauRaccourcis ouvert onFermer={fermer} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it('@critique le focus ENTRE dans la fenêtre, y reste (Tab boucle), et REVIENT d’où il venait', async () => {
    function Scene(): ReactNode {
      const [ouvert, setOuvert] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOuvert(true);
            }}
          >
            ouvrir l’aide
          </button>
          <PanneauRaccourcis
            ouvert={ouvert}
            onFermer={() => {
              setOuvert(false);
            }}
          />
        </>
      );
    }
    render(<Scene />);
    const ouvreur = screen.getByRole('button', { name: 'ouvrir l’aide' });
    ouvreur.focus();
    expect(document.activeElement).toBe(ouvreur);

    fireEvent.click(ouvreur);
    const boite = await screen.findByRole('dialog', { name: 'Raccourcis clavier' });

    // ① le focus est ENTRÉ : il est dans la fenêtre, pas resté derrière le voile.
    await waitFor(() => {
      expect(boite.contains(document.activeElement)).toBe(true);
    });

    // ② il y RESTE : Tab depuis le dernier focalisable revient au premier.
    const focalisables = [...boite.querySelectorAll<HTMLElement>('button:not([disabled])')];
    expect(focalisables.length).toBeGreaterThan(0);
    const dernier = requis(focalisables[focalisables.length - 1], 'dernier focalisable');
    dernier.focus();
    fireEvent.keyDown(dernier, { key: 'Tab' });
    expect(boite.contains(document.activeElement)).toBe(true);

    // ③ il REVIENT : à la fermeture, le bouton qui a ouvert récupère le focus.
    // C'est le comportement le plus souvent oublié, et le plus coûteux en
    // entretien — un auditeur au clavier qui perd sa question devant quelqu'un.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(ouvreur);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ② LE DISPATCH HONORE LA TABLE — le second sens, sans lequel ① est vide
// ═════════════════════════════════════════════════════════════════════════════
describe('R7 — le gestionnaire DISPATCHE la table (et rien d’autre)', () => {
  beforeEach(() => {
    render(<Cobaye />);
  });

  it('@critique chaque touche d’une entrée EXÉCUTABLE déclenche une action', () => {
    const executables = RACCOURCIS_ENTRETIEN.filter((r) => r.executer !== null);
    expect(executables.length).toBeGreaterThanOrEqual(7);
    const muettes: string[] = [];
    for (const raccourci of executables) {
      for (const declaree of raccourci.touches) {
        const avant = journalCourant().length;
        touche(declaree, ecran());
        if (journalCourant().length === avant) muettes.push(`${declaree} (${raccourci.libelle})`);
      }
    }
    expect(muettes, `touches déclarées et non traitées :\n${muettes.join('\n')}`).toEqual([]);
  });

  it('@critique les touches du §33.3 font ce que le pack dit, une par une', () => {
    const cible = ecran();
    touche('3', cible);
    touche('o', cible);
    touche('n', cible);
    touche('a', cible);
    touche('r', cible);
    touche('e', cible);
    touche('/', cible);
    touche('?', cible);
    expect(journalCourant()).toEqual([
      'coter:3',
      'ouiNon:oui',
      'ouiNon:non',
      'sansObjet',
      'aRevoir',
      'partage',
      'recherche',
      'aide',
    ]);
  });

  it('@critique une touche NON déclarée ne déclenche rien — la table est aussi une liste FERMÉE', () => {
    const declarees = new Set(
      RACCOURCIS_ENTRETIEN.flatMap((r) => r.touches).map((t) => t.toLowerCase()),
    );
    for (const key of ['z', 'k', '9', '0', 'x', '§', 'F1']) {
      expect(declarees.has(key.toLowerCase())).toBe(false);
      touche(key, ecran());
    }
    expect(journalCourant()).toEqual([]);
  });

  it('@critique un modificateur (Ctrl, Meta, Alt) neutralise le raccourci', () => {
    for (const modificateur of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      fireEvent.keyDown(ecran(), { key: '?', code: 'Slash', [modificateur]: true });
      fireEvent.keyDown(ecran(), { key: '3', code: 'Digit3', [modificateur]: true });
    }
    expect(journalCourant()).toEqual([]);
  });
});

describe('R7 — fenêtre ouverte : les raccourcis se taisent (`actif: false`)', () => {
  it('@critique tant qu’une fenêtre a le focus, aucune touche ne passe — « ? » compris', () => {
    render(<Cobaye actif={false} />);
    for (const key of ['?', '3', 'r', '/', 'e']) touche(key, ecran());
    expect(journalCourant()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LA RÈGLE V2.8 — « ? » DANS UNE NOTE N'OUVRE RIEN, ET LA GARDE EST RÉUTILISÉE
// ═════════════════════════════════════════════════════════════════════════════
describe('R7 — « ? » n’ouvre rien depuis un champ de saisie (03 §33.3, règle V2.8)', () => {
  beforeEach(() => {
    render(<Cobaye />);
  });

  it('@critique « ? » tapé dans la zone de notes n’ouvre pas l’aide, et n’enlève pas le focus', () => {
    const note = screen.getByLabelText('zone de notes');
    note.focus();
    for (const key of ['?', 'R', 'i', 'e', 'n', '3', '/']) touche(key, note);
    expect(journalCourant()).toEqual([]);
    expect(document.activeElement).toBe(note);
  });

  it('@critique le SILENCE du gestionnaire coïncide EXACTEMENT avec `estChampDeSaisie`', () => {
    // La preuve que la garde est réutilisée et non réécrite : sur une batterie de
    // cibles, deux verdicts indépendants — celui de la fonction exportée, et
    // celui du comportement observé — doivent s'accorder sur CHAQUE cas.
    const cibles: { nom: string; element: HTMLElement }[] = [
      { nom: 'texte neutre', element: ecran() as HTMLElement },
      { nom: 'zone de notes', element: screen.getByLabelText('zone de notes') },
      { nom: 'liste déroulante', element: screen.getByLabelText('une liste') },
      { nom: 'éditable', element: screen.getByLabelText('éditable') },
      { nom: 'marqué saisie libre', element: screen.getByLabelText('marqué saisie libre') },
      { nom: 'radio', element: screen.getByLabelText('radio') },
      { nom: 'case', element: screen.getByLabelText('case') },
      { nom: 'bouton natif', element: screen.getByLabelText('bouton natif') },
      { nom: 'curseur', element: screen.getByLabelText('curseur') },
      { nom: 'couleur', element: screen.getByLabelText('couleur') },
      { nom: 'bouton', element: screen.getByRole('button', { name: 'un bouton' }) },
      ...TYPES_INPUT.map((type) => ({
        nom: `input ${type}`,
        element: screen.getByLabelText(`input ${type}`),
      })),
    ];
    expect(cibles.length).toBeGreaterThan(15);

    const desaccords: string[] = [];
    for (const { nom, element } of cibles) {
      const avant = journalCourant().length;
      touche('?', element);
      const silencieux = journalCourant().length === avant;
      const verdict = estChampDeSaisie(element);
      if (silencieux !== verdict) {
        desaccords.push(
          `${nom} : estChampDeSaisie=${String(verdict)} mais le gestionnaire ` +
            (silencieux ? 's’est tu' : 'a agi'),
        );
      }
    }
    expect(desaccords, desaccords.join('\n')).toEqual([]);
    // Anti-vacuité : la batterie contient bien des cas des DEUX côtés — sans
    // quoi une garde toujours-vraie ou toujours-fausse passerait.
    const verdicts = cibles.map(({ element }) => estChampDeSaisie(element));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });

  it('@critique Échap rend le focus depuis un champ, et « ? » redevient alors ouvrant', () => {
    const note = screen.getByLabelText('zone de notes');
    note.focus();
    touche('Escape', note);
    expect(document.activeElement).not.toBe(note);
    touche('?', ecran());
    expect(journalCourant()).toEqual(['aide']);
  });
});
