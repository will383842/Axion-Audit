// =============================================================================
// BASCULE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// `role="switch"` et non une case à cocher : une bascule s'applique IMMÉDIATEMENT
// (mode écran partagé, préférence d'affichage), là qu'une case attend une
// validation de formulaire. Les lecteurs d'écran annoncent « activé / désactivé »
// au lieu de « coché », ce qui est exactement la différence.
//
// L'état ne se lit PAS que sur la couleur de la piste (§33.6) : le libellé
// d'état (`libelleActif` / `libelleInactif`) est écrit à côté, en français.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';

export interface ProprietesBascule extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'onChange' | 'type' | 'children'
> {
  /** Ce que la bascule commande, en français (« Mode écran partagé »). */
  libelle: ReactNode;
  actif: boolean;
  onBasculer: (actif: boolean) => void;
  /** Mot d'état lu ET affiché quand la bascule est active. Défaut : « activé ». */
  libelleActif?: string;
  /** Mot d'état lu ET affiché quand elle ne l'est pas. Défaut : « désactivé ». */
  libelleInactif?: string;
}

export function Bascule(proprietes: ProprietesBascule) {
  const {
    libelle,
    actif,
    onBasculer,
    libelleActif = 'activé',
    libelleInactif = 'désactivé',
    className,
    disabled = false,
    ...reste
  } = proprietes;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      className={classes('axn-bascule', className)}
      disabled={disabled}
      onClick={() => {
        onBasculer(!actif);
      }}
      {...reste}
    >
      <span className="axn-bascule__piste" aria-hidden="true">
        <span className="axn-bascule__pion" />
      </span>
      <span>
        {libelle} — {actif ? libelleActif : libelleInactif}
      </span>
    </button>
  );
}
