// =============================================================================
// BADGE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// §19.2 : « badges de statut uniformes PARTOUT — même vocabulaire visuel du
// terrain à la console ». Le badge ne connaît aucun statut métier : `à revoir`,
// `non communiqué`, `hors parcours` (§25.4) sont des libellés que l'appelant
// écrit. Un composant qui connaîtrait la liste des statuts serait un composant
// à modifier chaque fois que le métier en ajoute un.
//
// `children` est REQUIS : un badge est un mot, éventuellement doublé d'une icône.
// Un badge qui ne serait qu'une pastille de couleur porterait son information par
// la couleur seule — interdit par §33.6 et par l'invariant 4.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';

export type TonBadge = 'neutre' | 'action' | 'info' | 'succes' | 'avertissement' | 'alerte';

export interface ProprietesBadge extends ComponentPropsWithoutRef<'span'> {
  ton?: TonBadge;
  /** Icône décorative. Elle DOUBLE le mot, elle ne le remplace jamais. */
  icone?: ReactNode;
  children: ReactNode;
}

export function Badge(proprietes: ProprietesBadge) {
  const { ton = 'neutre', icone, className, children, ...reste } = proprietes;

  return (
    <span className={classes('axn-badge', `axn-badge--${ton}`, className)} {...reste}>
      {icone}
      {children}
    </span>
  );
}
