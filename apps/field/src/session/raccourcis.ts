// =============================================================================
// RACCOURCIS CLAVIER DE L'ENTRETIEN — 03 §33.3 (PC)
//
// LA LISTE DES RACCOURCIS N'EST PAS DANS CE COMMENTAIRE : elle est plus bas,
// dans `RACCOURCIS_ENTRETIEN`, et c'est la MÊME table qui dispatche les touches
// et qui nourrit l'aide affichée par « ? » (`PanneauRaccourcis`). R7 (constat du
// 2026-09-09) : les raccourcis marchaient, rien ne les annonçait. Une liste
// d'aide recopiée à côté du gestionnaire aurait divergé du jour où une touche
// change — on ne recopie pas, on lit la table.
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
  /** R7 — ouvre l'aide clavier. Une fenêtre, jamais un `alert()`. */
  readonly aide: () => void;
}

/**
 * UN raccourci, tel qu'il est TRAITÉ et tel qu'il est AFFICHÉ.
 *
 * Les deux usages lisent le même objet : le gestionnaire de touches y trouve son
 * `executer`, l'aide y trouve ses `touches` et son `libelle`. C'est la condition
 * pour que l'aide ne mente jamais — une aide qui se recopie se périme.
 */
export interface Raccourci {
  /** Les touches TELLES QU'ELLES S'ÉCRIVENT à l'écran (« Entrée », « ↑ », « / »). */
  readonly touches: readonly string[];
  /** Ce que la touche fait, en français, à l'infinitif. */
  readonly libelle: string;
  /**
   * L'action, quand la touche est dispatchée par la table.
   *
   * `null` pour les trois touches qui ont leur propre branche juste au-dessus
   * (Entrée, ↑↓, Échap) : elles portent des NUANCES — Entrée n'a pas le même
   * effet dans une zone de notes, les flèches appartiennent au navigateur dans un
   * groupe radio — qu'une entrée de table ne saurait décrire. Elles restent
   * DÉCLARÉES ici pour que l'aide les liste, et le gestionnaire les ignore.
   */
  readonly executer: ((actions: ActionsRaccourcis, touche: string) => void) | null;
}

/**
 * LA table des raccourcis de l'entretien — 03 §33.3, mot pour mot :
 * « 1-5 échelles · O/N oui-non · A = N/A · R = à revoir · ↵ suivant · ↑↓
 * navigation · / = recherche de question ». Le « E » de l'écran partagé vient du
 * même §33.3 ; le « ? » de l'aide est ajouté par R7 et ne fait rien d'autre
 * qu'ouvrir la liste ci-dessous.
 *
 * L'ordre est celui de l'affichage : d'abord ce qui RÉPOND, puis ce qui
 * QUALIFIE, puis ce qui NAVIGUE.
 */
export const RACCOURCIS_ENTRETIEN: readonly Raccourci[] = [
  {
    touches: ['1', '2', '3', '4', '5'],
    libelle: 'Coter de 1 à 5 sur une échelle',
    executer: (actions, touche) => {
      actions.coter(Number(touche));
    },
  },
  {
    touches: ['O'],
    libelle: 'Répondre « oui »',
    executer: (actions) => {
      actions.ouiNon('oui');
    },
  },
  {
    touches: ['N'],
    libelle: 'Répondre « non »',
    executer: (actions) => {
      actions.ouiNon('non');
    },
  },
  {
    touches: ['A'],
    libelle: 'Marquer la question « sans objet » (N/A)',
    executer: (actions) => {
      actions.sansObjet();
    },
  },
  {
    touches: ['R'],
    libelle: 'Marquer la question « à revoir »',
    executer: (actions) => {
      actions.aRevoir();
    },
  },
  {
    touches: ['E'],
    libelle: 'Passer en écran partagé, et en revenir',
    executer: (actions) => {
      actions.partage();
    },
  },
  {
    touches: ['/'],
    libelle: 'Chercher une question, y compris hors parcours',
    executer: (actions) => {
      actions.recherche();
    },
  },
  {
    touches: ['?'],
    libelle: 'Afficher cette aide',
    executer: (actions) => {
      actions.aide();
    },
  },
  { touches: ['Entrée'], libelle: 'Question suivante', executer: null },
  { touches: ['↑', '↓'], libelle: 'Question précédente, question suivante', executer: null },
  {
    touches: ['Échap'],
    libelle: 'Sortir d’un champ de saisie, ou fermer une fenêtre',
    executer: null,
  },
];

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

      // Le dispatch LIT la table — il ne la répète pas. C'est ce qui garantit que
      // l'aide de « ? » (`PanneauRaccourcis`) et le comportement réel ne peuvent
      // pas diverger : ajouter une touche ici, c'est l'ajouter dans l'aide.
      const touche = evenement.key.length === 1 ? evenement.key.toLowerCase() : evenement.key;
      const executer = RACCOURCIS_ENTRETIEN.find(
        (raccourci) =>
          raccourci.executer !== null &&
          raccourci.touches.some((declaree) => declaree.toLowerCase() === touche),
      )?.executer;
      if (executer !== undefined && executer !== null) {
        evenement.preventDefault();
        executer(actions, touche);
      }
    };

    window.addEventListener('keydown', auClavier);
    return () => {
      window.removeEventListener('keydown', auClavier);
    };
  }, [actif, actions]);
}
