// =============================================================================
// SÉLECTION — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// Un `<select>` NATIF, et c'est un choix. Sur iPad — « la CIBLE LA PLUS DURE »
// (§22.1) — le sélecteur natif ouvre la roue système, qui se manipule au pouce
// sans rien masquer du formulaire. Toute liste déroulante réimplémentée perd
// cela, et gagne en échange un piège à focus à tester.
//
// Usages terrain : motif de « non communiqué » (§27.4 — confidentiel, non
// disponible, hors périmètre, autre), type de session (§27.1), mode d'entretien.
// Le composant ne connaît AUCUNE de ces listes : elles sont des données de
// mission (invariant 2), elles arrivent par `options`.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useId } from 'react';
import { classes, decritPar } from './utilitaires.js';
import { IconeAlerte } from './icones.js';

export interface OptionSelection {
  valeur: string;
  libelle: string;
  desactivee?: boolean;
}

export interface ProprietesSelection extends Omit<ComponentPropsWithoutRef<'select'>, 'children'> {
  libelle: ReactNode;
  options: readonly OptionSelection[];
  /**
   * Texte de l'option vide initiale. L'omettre rend la liste SANS option vide :
   * le premier élément serait alors « déjà répondu » sans que personne n'ait
   * choisi, ce qui fabrique des réponses que l'auditeur n'a pas données.
   */
  optionVide?: string;
  aide?: ReactNode;
  erreur?: ReactNode;
  obligatoire?: boolean;
}

export function Selection(proprietes: ProprietesSelection) {
  const {
    libelle,
    options,
    optionVide,
    aide,
    erreur,
    obligatoire = false,
    id,
    className,
    ...reste
  } = proprietes;

  const genere = useId();
  const identifiant = id ?? `axn-selection-${genere}`;
  const idAide = `${identifiant}-aide`;
  const idErreur = `${identifiant}-erreur`;
  const descriptions = decritPar(aide !== undefined && idAide, erreur !== undefined && idErreur);

  return (
    <div className={classes('axn-champ', className)}>
      <label className="axn-champ__libelle" htmlFor={identifiant}>
        {libelle}
        {obligatoire && (
          <span className="axn-champ__obligatoire" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select
        id={identifiant}
        className="axn-champ__saisie"
        required={obligatoire}
        aria-invalid={erreur !== undefined}
        {...(descriptions === undefined ? {} : { 'aria-describedby': descriptions })}
        {...reste}
      >
        {optionVide !== undefined && <option value="">{optionVide}</option>}
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur} disabled={option.desactivee ?? false}>
            {option.libelle}
          </option>
        ))}
      </select>
      {aide !== undefined && (
        <p id={idAide} className="axn-champ__aide">
          {aide}
        </p>
      )}
      {erreur !== undefined && (
        <p id={idErreur} className="axn-champ__erreur">
          <IconeAlerte />
          <span>{erreur}</span>
        </p>
      )}
    </div>
  );
}
