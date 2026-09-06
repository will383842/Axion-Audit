// =============================================================================
// CAPTEURS, GESTES, RACCOURCIS, ENREGISTREMENT CONTINU — lot L5, incrément L5b.
// Écrit par A26 (09 §5.6 : A22 a écrit le code testé, il n'écrit pas ces tests).
//
// ── CE QUE CES QUATRE MODULES ONT EN COMMUN, ET POURQUOI ILS ÉTAIENT NUS ────
// `media.ts`, `gestes.ts`, `raccourcis.ts` et `enregistrement.ts` sont des HOOKS.
// Aucun test ne les atteignait : les tests unitaires du lot tournent en `node`
// (aucun DOM), et l'unique test d'interface de l'incrément monte l'écran complet,
// où ces hooks ne sont exercés que par les chemins que l'écran emprunte. Leurs
// branches d'abandon — le balayage trop court, le balayage vertical, la touche
// tapée dans une note, l'écriture qui échoue — n'étaient JAMAIS prises. C'est ce
// que mesurait le 70,49 % de fonctions du module critique.
//
// ── CE QU'UNE RÉGRESSION Y COÛTERAIT, ET CE N'EST PAS UN ÉCRAN CASSÉ ────────
//   · un raccourci qui mord DANS une note (règle V2.8) : taper « Rien à
//     signaler » coterait la question et effacerait une réponse — l'auditeur ne
//     le verrait qu'au dépouillement ;
//   · `enregistrement.ts` qui verdirait avant que la transaction locale ait rendu
//     la main : l'indicateur « Enregistré » deviendrait une promesse non tenue,
//     et l'invariant 8 repose dessus ;
//   · la purge sur `pagehide` : c'est elle, et pas le délai du débounce, qui
//     borne à ZÉRO la perte sur un onglet tué en pleine saisie (critère P-C).
//
// Traçabilité : E13 (enregistrement continu), E44 (raccourcis complets §33.3),
// E23 (hyper intuitif), E6 (hors ligne total : `useEnLigne` informe, ne commande pas).
// =============================================================================
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REQUETE_POINTEUR_FIN,
  REQUETE_TROIS_COLONNES,
  useEnLigne,
  useRequeteMedia,
} from './media.js';
import { SEUIL_BALAYAGE, useBalayageHorizontal } from './gestes.js';
import { estChampDeSaisie, useRaccourcisEntretien } from './raccourcis.js';
import { DELAI_DEBOUNCE_MS, useEnregistrementContinu } from './enregistrement.js';

// ═════════════════════════════════════════════════════════════════════════════
// 1. `media.ts` — deux capteurs d'environnement, jamais deux conditions
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Une `MediaQueryList` pilotable : la cale de `vitest.setup.interface.ts` rend
 * toujours `matches: false` et n'émet jamais. Ici on veut les DEUX branches et
 * le changement à chaud — c'est nommément ce que l'amorce invite à faire.
 */
function poserMatchMedia(reponses: Record<string, boolean>): {
  basculer: (requete: string, valeur: boolean) => void;
  ecouteursRetires: () => number;
} {
  const ecouteurs = new Map<string, Set<(e: MediaQueryListEvent) => void>>();
  let retires = 0;
  const etat = { ...reponses };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (requete: string): MediaQueryList =>
      ({
        get matches() {
          return etat[requete] ?? false;
        },
        media: requete,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: (_type: string, ecouteur: (e: MediaQueryListEvent) => void) => {
          const pour = ecouteurs.get(requete) ?? new Set();
          pour.add(ecouteur);
          ecouteurs.set(requete, pour);
        },
        removeEventListener: (_type: string, ecouteur: (e: MediaQueryListEvent) => void) => {
          ecouteurs.get(requete)?.delete(ecouteur);
          retires += 1;
        },
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });

  return {
    basculer: (requete, valeur) => {
      etat[requete] = valeur;
      for (const ecouteur of ecouteurs.get(requete) ?? []) {
        ecouteur({ matches: valeur, media: requete } as MediaQueryListEvent);
      }
    },
    ecouteursRetires: () => retires,
  };
}

describe('useRequeteMedia — le seuil des trois colonnes et le pointeur fin', () => {
  it('rend vrai quand la requête correspond dès le premier rendu', () => {
    poserMatchMedia({ [REQUETE_TROIS_COLONNES]: true });
    const { result } = renderHook(() => useRequeteMedia(REQUETE_TROIS_COLONNES));
    expect(result.current).toBe(true);
  });

  it('rend faux quand elle ne correspond pas', () => {
    poserMatchMedia({ [REQUETE_POINTEUR_FIN]: false });
    const { result } = renderHook(() => useRequeteMedia(REQUETE_POINTEUR_FIN));
    expect(result.current).toBe(false);
  });

  it('suit un changement à chaud — l’iPad qui pivote ne recharge pas la page', async () => {
    const media = poserMatchMedia({ [REQUETE_TROIS_COLONNES]: false });
    const { result } = renderHook(() => useRequeteMedia(REQUETE_TROIS_COLONNES));
    expect(result.current).toBe(false);

    act(() => {
      media.basculer(REQUETE_TROIS_COLONNES, true);
    });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('retire son écouteur au démontage — un hook qui fuit finit par tout ralentir', () => {
    const media = poserMatchMedia({ [REQUETE_TROIS_COLONNES]: false });
    const { unmount } = renderHook(() => useRequeteMedia(REQUETE_TROIS_COLONNES));
    unmount();
    expect(media.ecouteursRetires()).toBeGreaterThan(0);
  });
});

describe('useEnLigne — une INFORMATION, jamais une condition (invariant 1)', () => {
  it('suit les évènements `online` et `offline` du navigateur', async () => {
    const { result } = renderHook(() => useEnLigne());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. `gestes.ts` — le balayage de l'iPad, et tout ce qui n'en est pas un
// ═════════════════════════════════════════════════════════════════════════════
/** Fabrique un évènement tactile minimal — jsdom n'a pas de `TouchEvent` utile. */
function toucher(
  x: number,
  y: number,
  cible: EventTarget = document.createElement('div'),
  nombre = 1,
): never {
  const point = { clientX: x, clientY: y };
  const points = Array.from({ length: nombre }, () => point);
  return {
    touches: points,
    changedTouches: points,
    target: cible,
  } as never;
}

describe('useBalayageHorizontal (03 §33.3) — un doigt, net, horizontal', () => {
  it('appelle « suivant » sur un balayage vers la gauche', () => {
    const gauche = vi.fn();
    const droite = vi.fn();
    const { result } = renderHook(() => useBalayageHorizontal(gauche, droite));

    result.current.onTouchStart(toucher(300, 100));
    result.current.onTouchEnd(toucher(300 - SEUIL_BALAYAGE - 10, 105));
    expect(gauche).toHaveBeenCalledTimes(1);
    expect(droite).not.toHaveBeenCalled();
  });

  it('appelle « précédent » sur un balayage vers la droite', () => {
    const gauche = vi.fn();
    const droite = vi.fn();
    const { result } = renderHook(() => useBalayageHorizontal(gauche, droite));

    result.current.onTouchStart(toucher(100, 100));
    result.current.onTouchEnd(toucher(100 + SEUIL_BALAYAGE + 10, 95));
    expect(droite).toHaveBeenCalledTimes(1);
  });

  it('ignore un déplacement plus court que le seuil', () => {
    const gauche = vi.fn();
    const { result } = renderHook(() => useBalayageHorizontal(gauche, vi.fn()));
    result.current.onTouchStart(toucher(300, 100));
    result.current.onTouchEnd(toucher(300 - SEUIL_BALAYAGE + 1, 100));
    expect(gauche).not.toHaveBeenCalled();
  });

  it('ignore un geste plus vertical qu’horizontal — c’est un défilement', () => {
    const gauche = vi.fn();
    const { result } = renderHook(() => useBalayageHorizontal(gauche, vi.fn()));
    result.current.onTouchStart(toucher(300, 100));
    result.current.onTouchEnd(toucher(300 - SEUIL_BALAYAGE - 10, 100 + SEUIL_BALAYAGE + 200));
    expect(gauche).not.toHaveBeenCalled();
  });

  it('ignore un geste à DEUX doigts — c’est un zoom, pas une navigation', () => {
    const gauche = vi.fn();
    const { result } = renderHook(() => useBalayageHorizontal(gauche, vi.fn()));
    result.current.onTouchStart(toucher(300, 100, document.createElement('div'), 2));
    result.current.onTouchEnd(toucher(100, 100));
    expect(gauche).not.toHaveBeenCalled();
  });

  it('ignore un balayage COMMENCÉ dans un champ de saisie — on y sélectionne du texte', () => {
    const gauche = vi.fn();
    const zone = document.createElement('textarea');
    const { result } = renderHook(() => useBalayageHorizontal(gauche, vi.fn()));
    result.current.onTouchStart(toucher(300, 100, zone));
    result.current.onTouchEnd(toucher(100, 100));
    expect(gauche).not.toHaveBeenCalled();
  });

  it('ne fait rien quand le geste est désactivé (fenêtre ouverte par-dessus)', () => {
    const gauche = vi.fn();
    const { result } = renderHook(() => useBalayageHorizontal(gauche, vi.fn(), false));
    result.current.onTouchStart(toucher(300, 100));
    result.current.onTouchEnd(toucher(100, 100));
    expect(gauche).not.toHaveBeenCalled();
  });

  it('ne fait rien sur une fin de geste sans début — un doigt arrivé d’ailleurs', () => {
    const gauche = vi.fn();
    const { result } = renderHook(() => useBalayageHorizontal(gauche, vi.fn()));
    result.current.onTouchEnd(toucher(100, 100));
    expect(gauche).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. `raccourcis.ts` — la règle V2.8 : jamais dans un champ de saisie
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Les huit actions, en espions TYPÉS. Le typage n'est pas cosmétique : sans lui
 * `mock.calls` est un `any[]`, et l'assertion « la touche 3 cote bien 3 » ne
 * vérifierait plus le type de l'argument — un espion non typé accepterait
 * `coter('3')` sans broncher, c'est-à-dire l'erreur même qu'on veut attraper.
 */
function actionsFactices(): {
  suivant: ReturnType<typeof vi.fn<() => void>>;
  precedent: ReturnType<typeof vi.fn<() => void>>;
  coter: ReturnType<typeof vi.fn<(note: number) => void>>;
  ouiNon: ReturnType<typeof vi.fn<(valeur: 'oui' | 'non') => void>>;
  sansObjet: ReturnType<typeof vi.fn<() => void>>;
  aRevoir: ReturnType<typeof vi.fn<() => void>>;
  recherche: ReturnType<typeof vi.fn<() => void>>;
  partage: ReturnType<typeof vi.fn<() => void>>;
} {
  return {
    suivant: vi.fn<() => void>(),
    precedent: vi.fn<() => void>(),
    coter: vi.fn<(note: number) => void>(),
    ouiNon: vi.fn<(valeur: 'oui' | 'non') => void>(),
    sansObjet: vi.fn<() => void>(),
    aRevoir: vi.fn<() => void>(),
    recherche: vi.fn<() => void>(),
    partage: vi.fn<() => void>(),
  };
}

describe('estChampDeSaisie — ce qui reçoit du texte, et ce qui n’en reçoit pas', () => {
  it('reconnaît le marqueur du design system, la zone de texte et le select', () => {
    const marque = document.createElement('div');
    marque.dataset.saisieLibre = 'vrai';
    expect(estChampDeSaisie(marque)).toBe(true);
    expect(estChampDeSaisie(document.createElement('textarea'))).toBe(true);
    expect(estChampDeSaisie(document.createElement('select'))).toBe(true);
  });

  it('reconnaît un input TEXTE, et refuse un bouton radio — « 3 » doit coter', () => {
    const texte = document.createElement('input');
    texte.type = 'text';
    expect(estChampDeSaisie(texte)).toBe(true);

    const radio = document.createElement('input');
    radio.type = 'radio';
    expect(estChampDeSaisie(radio)).toBe(false);
  });

  it('refuse ce qui n’est pas un élément du tout', () => {
    expect(estChampDeSaisie(null)).toBe(false);
  });
});

describe('useRaccourcisEntretien (03 §33.3) — la grille complète', () => {
  it('cote de 1 à 5, répond oui/non, marque sans objet, à revoir, partage, recherche', () => {
    const actions = actionsFactices();
    renderHook(() => {
      useRaccourcisEntretien(actions, { actif: true });
    });

    for (const touche of ['1', '2', '3', '4', '5']) {
      fireEvent.keyDown(window, { key: touche });
    }
    expect(actions.coter.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5]);

    fireEvent.keyDown(window, { key: 'o' });
    fireEvent.keyDown(window, { key: 'N' });
    expect(actions.ouiNon.mock.calls.map((c) => c[0])).toEqual(['oui', 'non']);

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: '/' });
    expect(actions.sansObjet).toHaveBeenCalledTimes(1);
    expect(actions.aRevoir).toHaveBeenCalledTimes(1);
    expect(actions.partage).toHaveBeenCalledTimes(1);
    expect(actions.recherche).toHaveBeenCalledTimes(1);
  });

  it('NE MORD PAS dans une note — « Rien à signaler » ne cote rien (règle V2.8)', () => {
    const actions = actionsFactices();
    const zone = document.createElement('textarea');
    document.body.appendChild(zone);
    renderHook(() => {
      useRaccourcisEntretien(actions, { actif: true });
    });

    for (const touche of ['R', 'i', 'e', 'n', 'a', '5', '/']) {
      fireEvent.keyDown(zone, { key: touche });
    }
    expect(actions.coter).not.toHaveBeenCalled();
    expect(actions.aRevoir).not.toHaveBeenCalled();
    expect(actions.recherche).not.toHaveBeenCalled();
    expect(actions.partage).not.toHaveBeenCalled();
    zone.remove();
  });

  it('Échap rend le focus quand on est dans un champ, et ne fait rien sinon', () => {
    const actions = actionsFactices();
    const champ = document.createElement('input');
    champ.type = 'text';
    document.body.appendChild(champ);
    champ.focus();
    renderHook(() => {
      useRaccourcisEntretien(actions, { actif: true });
    });

    fireEvent.keyDown(champ, { key: 'Escape' });
    expect(document.activeElement).not.toBe(champ);

    // Hors champ, Échap ne déclenche aucune action.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.suivant).not.toHaveBeenCalled();
    champ.remove();
  });

  it('Entrée passe à la suite depuis un champ d’UNE ligne, jamais depuis une note', () => {
    const actions = actionsFactices();
    const nombre = document.createElement('input');
    nombre.type = 'number';
    const note = document.createElement('textarea');
    document.body.append(nombre, note);
    renderHook(() => {
      useRaccourcisEntretien(actions, { actif: true });
    });

    fireEvent.keyDown(nombre, { key: 'Enter' });
    expect(actions.suivant).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(note, { key: 'Enter' });
    expect(actions.suivant).toHaveBeenCalledTimes(1);
    nombre.remove();
    note.remove();
  });

  it('les flèches naviguent hors contrôle, et appartiennent au navigateur dedans', () => {
    const actions = actionsFactices();
    const radio = document.createElement('input');
    radio.type = 'radio';
    document.body.appendChild(radio);
    renderHook(() => {
      useRaccourcisEntretien(actions, { actif: true });
    });

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(actions.suivant).toHaveBeenCalledTimes(1);
    expect(actions.precedent).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(radio, { key: 'ArrowDown' });
    expect(actions.suivant).toHaveBeenCalledTimes(1);
    radio.remove();
  });

  it('se tait quand une fenêtre a le focus, et quand une touche porte un modificateur', () => {
    const actions = actionsFactices();
    const { rerender } = renderHook(
      ({ actif }: { actif: boolean }) => {
        useRaccourcisEntretien(actions, { actif });
      },
      { initialProps: { actif: false } },
    );

    fireEvent.keyDown(window, { key: '3' });
    expect(actions.coter).not.toHaveBeenCalled();

    rerender({ actif: true });
    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    fireEvent.keyDown(window, { key: '3', altKey: true });
    expect(actions.coter).not.toHaveBeenCalled();
  });

  it('ignore une touche qui n’est pas de la grille', () => {
    const actions = actionsFactices();
    renderHook(() => {
      useRaccourcisEntretien(actions, { actif: true });
    });
    fireEvent.keyDown(window, { key: 'z' });
    fireEvent.keyDown(window, { key: 'F5' });
    expect(actions.coter).not.toHaveBeenCalled();
    expect(actions.suivant).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. `enregistrement.ts` — l'indicateur ne verdit qu'APRÈS l'écriture
// ═════════════════════════════════════════════════════════════════════════════
describe('useEnregistrementContinu (03 §17.4, §33.3) — la confiance se voit, et elle est vraie', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('part de l’état inactif, sans horodatage ni erreur', () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    expect(result.current.etat).toBe('inactif');
    expect(result.current.horodatage).toBeUndefined();
    expect(result.current.erreur).toBeNull();
  });

  it('passe à « enregistré » APRÈS que le travail a rendu la main, et pas avant', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    const travail = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.enregistrer(travail);
    });

    expect(travail).toHaveBeenCalledTimes(1);
    expect(result.current.etat).toBe('enregistre');
    expect(result.current.horodatage).toMatch(/^\d{2}:\d{2}$/);
    expect(result.current.erreur).toBeNull();
  });

  it('ne dit PAS « enregistré » quand l’écriture échoue, et parle français', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));

    await act(async () => {
      await result.current.enregistrer(() => Promise.reject(new Error('disque plein (fictif)')));
    });

    expect(result.current.etat).toBe('inactif');
    expect(result.current.erreur).toBe('disque plein (fictif)');

    act(() => {
      result.current.effacerErreur();
    });
    expect(result.current.erreur).toBeNull();
  });

  it('replie sur un message d’aide quand l’échec n’a rien à dire', async () => {
    const { result } = renderHook(() => useEnregistrementContinu(undefined));
    await act(async () => {
      await result.current.enregistrer(() => Promise.reject(new Error('')));
    });
    expect(result.current.erreur).toContain('n’est pas perdu');
  });

  it('débounce le texte, et une frappe REMPLACE la précédente sous la même clé', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    const premier = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.differer('note', premier);
      result.current.differer('note', second);
    });
    expect(premier).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(DELAI_DEBOUNCE_MS + 1);
      await Promise.resolve();
    });

    expect(premier).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('PURGE ce qui attend — la perte est bornée à zéro, pas au délai du débounce', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    const travail = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.differer('note', travail);
    });
    await act(async () => {
      await result.current.purger();
    });

    expect(travail).toHaveBeenCalledTimes(1);
    // Le débounce ne doit PAS le rejouer une seconde fois après la purge.
    await act(async () => {
      vi.advanceTimersByTime(DELAI_DEBOUNCE_MS + 1);
      await Promise.resolve();
    });
    expect(travail).toHaveBeenCalledTimes(1);
  });

  it('purge sur `pagehide` — l’onglet tué en pleine saisie ne coûte rien', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    const travail = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.differer('note', travail);
    });
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });
    expect(travail).toHaveBeenCalledTimes(1);
  });

  it('purge quand la page se cache (iPad mis en arrière-plan), pas quand elle revient', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    const travail = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.differer('note', travail);
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(travail).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(travail).toHaveBeenCalledTimes(1);
  });

  it('SÉRIALISE les écritures — deux appels concurrents ne se chevauchent jamais', async () => {
    const { result } = renderHook(() => useEnregistrementContinu('Europe/Paris'));
    const ordre: string[] = [];
    const lent = async (): Promise<void> => {
      ordre.push('debut-1');
      await Promise.resolve();
      ordre.push('fin-1');
    };
    const rapide = (): Promise<void> => {
      ordre.push('debut-2');
      ordre.push('fin-2');
      return Promise.resolve();
    };

    await act(async () => {
      const a = result.current.enregistrer(lent);
      const b = result.current.enregistrer(rapide);
      await Promise.all([a, b]);
    });

    expect(ordre).toEqual(['debut-1', 'fin-1', 'debut-2', 'fin-2']);
  });
});
