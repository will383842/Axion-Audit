// =============================================================================
// RACCOURCIS CLAVIER DE L'ENTRETIEN — 03 §33.3 (PC)
//
//   1-5  cote une échelle        O / N  oui-non        A  sans objet (N/A)
//   R    à revoir                E      écran partagé  /  recherche (hors-parcours)
//   ↵    question suivante       ↑ ↓    navigation     Échap  rend le focus
//
// ── LA RÈGLE V2.8, TENUE PAR CONSTRUCTION ───────────────────────────────────
// « Les raccourcis à une touche (O/N/A/R/E, 1-5, /) ne sont actifs que HORS
// focus d'un champ de saisie — taper "Rien à signaler" dans une note ne
// déclenche jamais rien ; Échap rend le focus. » Un champ de saisie est : un
// `textarea`, un `select`, un élément éditable, ou un `input` dont le type
// reçoit du texte. Les boutons radio d'une échelle ou d'un Oui/Non ne sont PAS
// des champs de saisie : « 3 » y cote, comme prévu. Le design system marque ses
// champs libres `data-saisie-libre="vrai"` ; le marqueur est honoré en premier.
//
// ↵ suit une nuance : dans un champ à UNE ligne (un nombre, une date), Entrée
// passe à la suite — c'est le geste attendu après avoir tapé « 42 ». Dans une
// zone de notes, Entrée fait un retour à la ligne, et rien d'autre.
//
// Les flèches ↑↓ ne changent de question que hors de tout contrôle : dans un
// groupe radio, elles appartiennent au navigateur (et c'est ce que §33.3 veut,
// « les flèches offertes par le navigateur »).
//
// Traçabilité : E13, E23, E44 (raccourcis complets — grille §33).
// =============================================================================
import { useEffect } from 'react';

export interface ActionsRaccourcis {
  readonly suivant: () => void;
  readonly precedent: () => void;
  readonly coter: (note: number) => void;
  readonly ouiNon: (valeur: 'oui' | 'non') => void;
  readonly sansObjet: () => void;
  readonly aRevoir: () => void;
  readonly recherche: () => void;
  readonly partage: () => void;
}

export interface OptionsRaccourcis {
  /** `false` pendant qu'une fenêtre (motif, ad hoc, recherche) a le focus. */
  readonly actif: boolean;
}

const TYPES_INPUT_TEXTE = new Set([
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
]);

/** Le focus est-il dans un endroit où l'on TAPE du texte ? */
export function estChampDeSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false;
  if (cible.dataset.saisieLibre === 'vrai') return true;
  if (cible.isContentEditable) return true;
  if (cible instanceof HTMLTextAreaElement || cible instanceof HTMLSelectElement) return true;
  if (cible instanceof HTMLInputElement) return TYPES_INPUT_TEXTE.has(cible.type);
  return false;
}

/** Le focus est-il sur un contrôle quelconque (bouton, radio, case…) ? */
function estControle(cible: EventTarget | null): boolean {
  return (
    cible instanceof HTMLInputElement ||
    cible instanceof HTMLButtonElement ||
    cible instanceof HTMLTextAreaElement ||
    cible instanceof HTMLSelectElement ||
    cible instanceof HTMLAnchorElement
  );
}

export function useRaccourcisEntretien(
  actions: ActionsRaccourcis,
  options: OptionsRaccourcis,
): void {
  const { actif } = options;

  useEffect(() => {
    if (!actif) return;

    const auClavier = (evenement: KeyboardEvent): void => {
      if (
        evenement.defaultPrevented ||
        evenement.metaKey ||
        evenement.ctrlKey ||
        evenement.altKey
      ) {
        return;
      }
      const cible = evenement.target;
      const dansSaisie = estChampDeSaisie(cible);

      if (evenement.key === 'Escape') {
        if (cible instanceof HTMLElement && dansSaisie) {
          cible.blur();
          evenement.preventDefault();
        }
        return;
      }

      if (evenement.key === 'Enter') {
        if (cible instanceof HTMLTextAreaElement || cible instanceof HTMLButtonElement) return;
        if (cible instanceof HTMLElement && cible.isContentEditable) return;
        evenement.preventDefault();
        actions.suivant();
        return;
      }

      if (dansSaisie) return;

      if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
        if (estControle(cible)) return;
        evenement.preventDefault();
        if (evenement.key === 'ArrowDown') actions.suivant();
        else actions.precedent();
        return;
      }

      const touche = evenement.key.length === 1 ? evenement.key.toLowerCase() : evenement.key;
      switch (touche) {
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          evenement.preventDefault();
          actions.coter(Number(touche));
          return;
        case 'o':
          evenement.preventDefault();
          actions.ouiNon('oui');
          return;
        case 'n':
          evenement.preventDefault();
          actions.ouiNon('non');
          return;
        case 'a':
          evenement.preventDefault();
          actions.sansObjet();
          return;
        case 'r':
          evenement.preventDefault();
          actions.aRevoir();
          return;
        case 'e':
          evenement.preventDefault();
          actions.partage();
          return;
        case '/':
          evenement.preventDefault();
          actions.recherche();
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', auClavier);
    return () => {
      window.removeEventListener('keydown', auClavier);
    };
  }, [actif, actions]);
}
