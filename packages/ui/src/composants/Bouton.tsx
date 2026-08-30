// =============================================================================
// BOUTON — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027,
// tokens, police locale).
// §19.2 : « une seule action principale terracotta par écran ».
// §33.1/A27 : cible tactile ≥ 44 px — la PWA se pilote au doigt, debout.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';
import { IconeRotor } from './icones.js';

export type VarianteBouton = 'principal' | 'secondaire' | 'discret' | 'danger';
export type TailleBouton = 'normale' | 'large';

interface Communes extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  /** `principal` = terracotta. Un seul par écran (§19.2). `danger` porte l'alerte. */
  variante?: VarianteBouton;
  /** `large` pour un bouton frappé debout, à une main ou avec des gants (§33.3). */
  taille?: TailleBouton;
  /** Le bouton occupe toute la largeur disponible — usage terrain courant. */
  pleineLargeur?: boolean;
  /**
   * Une action est EN COURS. Le bouton se désactive, annonce `aria-busy` et
   * affiche un rotor EN LIGNE — jamais un voile plein écran (§33.2).
   */
  chargement?: boolean;
  /** Icône décorative posée avant le libellé. Elle n'informe jamais seule (§33.6). */
  icone?: ReactNode;
}

/**
 * Un bouton porte SOIT un libellé visible, SOIT une icône seule accompagnée d'un
 * `libelleAccessible` OBLIGATOIRE. Le type l'impose au lieu de le recommander :
 * §33.6 exige des « libellés explicites sur toute icône seule », et une règle
 * qu'un `axe-core` découvre en recette est une règle qui a déjà coûté un aller-retour.
 */
export type ProprietesBouton =
  | (Communes & { children: ReactNode; iconeSeule?: false; libelleAccessible?: string })
  | (Communes & { children?: undefined; iconeSeule: true; libelleAccessible: string });

export function Bouton(proprietes: ProprietesBouton) {
  const {
    variante = 'principal',
    taille = 'normale',
    pleineLargeur = false,
    chargement = false,
    icone,
    iconeSeule = false,
    libelleAccessible,
    className,
    disabled = false,
    children,
    ...reste
  } = proprietes;

  return (
    <button
      // `type` par défaut à `button` : le défaut HTML est `submit`, et un bouton
      // « À revoir » qui soumet le formulaire d'entretien est un défaut qu'on ne
      // voit qu'en entretien réel, c'est-à-dire au pire moment.
      type="button"
      className={classes(
        'axn-bouton',
        `axn-bouton--${variante}`,
        taille === 'large' && 'axn-bouton--large',
        pleineLargeur && 'axn-bouton--pleine-largeur',
        iconeSeule && 'axn-bouton--icone-seule',
        className,
      )}
      disabled={disabled || chargement}
      aria-busy={chargement}
      {...(libelleAccessible === undefined ? {} : { 'aria-label': libelleAccessible })}
      {...reste}
    >
      {chargement ? (
        <IconeRotor className="axn-rotor axn-bouton__icone" />
      ) : (
        icone !== undefined && <span className="axn-bouton__icone">{icone}</span>
      )}
      {children}
    </button>
  );
}
