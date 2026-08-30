// =============================================================================
// CASE À COCHER — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// Usages terrain : questions à choix multiples, et surtout la VALIDATION GROUPÉE
// de fin de journée (§19.1 V2.10 — « les entretiens terminés du jour cochés → une
// seule confirmation »). C'est une liste qu'on coche debout, dans une voiture,
// à une main : le libellé ENTIER est cliquable, pas seulement le carré, et toute
// la ligne fait au moins 44 px de haut (A27).
//
// L'état indéterminé n'est pas un troisième état d'entrée : c'est le rendu d'une
// case « tout sélectionner » quand la sélection est partielle. Il n'existe qu'en
// DOM (`input.indeterminate`), jamais en attribut — d'où la ref.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { classes } from './utilitaires.js';

export interface ProprietesCaseACocher extends Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'children'
> {
  libelle: ReactNode;
  /** Sélection partielle d'une case « tout cocher ». Purement visuel et ARIA. */
  indetermine?: boolean;
}

export function CaseACocher(proprietes: ProprietesCaseACocher) {
  const { libelle, indetermine = false, id, className, ...reste } = proprietes;

  const genere = useId();
  const identifiant = id ?? `axn-case-${genere}`;
  const boite = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (boite.current !== null) boite.current.indeterminate = indetermine;
  }, [indetermine]);

  return (
    <label className={classes('axn-case', className)} htmlFor={identifiant}>
      <input
        ref={boite}
        id={identifiant}
        className="axn-case__boite"
        type="checkbox"
        {...(indetermine ? { 'aria-checked': 'mixed' as const } : {})}
        {...reste}
      />
      <span className="axn-case__libelle">{libelle}</span>
    </label>
  );
}
