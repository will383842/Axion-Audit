// =============================================================================
// SOCLE DES SUPERPOSITIONS (dialogue et panneau) — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// Trois comportements que TOUTE fenêtre modale doit avoir, et qu'aucun écran ne
// doit réimplémenter : Échap ferme · le focus ENTRE et RESTE dedans · le focus
// RETOURNE d'où il venait à la fermeture. Le troisième est le plus oublié et le
// plus coûteux : un auditeur au clavier qui ferme une confirmation et se retrouve
// projeté en haut de page a perdu sa question — en entretien, devant quelqu'un.
//
// POURQUOI PAS `<dialog>` NI UN PORTAIL. `showModal()` donne tout cela
// gratuitement, mais Safari iOS — « la CIBLE LA PLUS DURE » (§22.1) — l'a servi
// tard et avec des défauts de défilement dans une PWA installée. Un portail, lui,
// imposerait `react-dom` en dépendance de ce paquet pour un seul appel. Cette
// implémentation est à jetons de comportement, sans dépendance et sans surprise.
// La contrepartie ASSUMÉE : la superposition se rend LÀ OÙ ELLE EST ÉCRITE dans
// l'arbre — l'écran appelant doit donc la placer hors de tout conteneur qui
// rognerait (`overflow: hidden`) ou qui créerait un contexte d'empilement.
// =============================================================================
import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Ce qui peut recevoir le focus dans une superposition. */
const FOCALISABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface OptionsSuperposition {
  ouvert: boolean;
  onFermer: () => void;
  conteneur: RefObject<HTMLElement | null>;
}

export function useSuperposition({ ouvert, onFermer, conteneur }: OptionsSuperposition): void {
  useEffect(() => {
    if (!ouvert) return;

    const boite = conteneur.current;
    const precedent = document.activeElement;

    const focalisables = (): HTMLElement[] =>
      boite === null ? [] : Array.from(boite.querySelectorAll<HTMLElement>(FOCALISABLES));

    // Le focus entre dans la superposition. À défaut d'élément focalisable, c'est
    // la boîte elle-même (elle porte tabIndex={-1}) : sans cela, le focus resterait
    // DERRIÈRE le voile, sur un écran que l'utilisateur ne voit plus.
    const premier = focalisables()[0];
    if (premier !== undefined) premier.focus();
    else boite?.focus();

    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') {
        evenement.stopPropagation();
        onFermer();
        return;
      }
      if (evenement.key !== 'Tab' || boite === null) return;

      const cibles = focalisables();
      const debut = cibles[0];
      const fin = cibles[cibles.length - 1];
      if (debut === undefined || fin === undefined) {
        evenement.preventDefault();
        return;
      }
      // Le piège : Tab sur le dernier revient au premier, Maj+Tab sur le premier
      // va au dernier. Sans cela, la tabulation sort par le bas dans l'écran
      // masqué, et l'utilisateur au clavier ne sait plus où il est.
      if (evenement.shiftKey && document.activeElement === debut) {
        evenement.preventDefault();
        fin.focus();
      } else if (!evenement.shiftKey && document.activeElement === fin) {
        evenement.preventDefault();
        debut.focus();
      }
    };

    document.addEventListener('keydown', auClavier, true);

    return () => {
      document.removeEventListener('keydown', auClavier, true);
      // Rendre le focus D'OÙ IL VENAIT : le bouton qui a ouvert la superposition.
      if (precedent instanceof HTMLElement) precedent.focus();
    };
  }, [ouvert, onFermer, conteneur]);
}
