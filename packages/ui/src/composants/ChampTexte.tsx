// =============================================================================
// CHAMP TEXTE — @axion/ui
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E27 (design moderne,
// charte, WCAG AA).
//
// §33.3 : « clavier virtuel adapté au type (numérique sur nombres/%, e-mail sur
// e-mails) ». C'est le rôle de `nature` : l'appelant décrit la DONNÉE, jamais le
// couple `type`/`inputMode` — deux attributs qu'on oublie d'accorder une fois
// sur deux, et dont l'oubli ne se voit que sur un vrai iPad.
//
// §33.3 (règle V2.8) : « les raccourcis à une touche (O/N/A/R/E, 1-5, /) ne sont
// actifs que HORS focus d'un champ de saisie ». Ce composant ne gère PAS les
// raccourcis — c'est l'affaire de l'écran — mais il POSE le marqueur
// `data-saisie-libre` que le gestionnaire clavier interroge. La règle devient
// alors une propriété du DOM plutôt qu'une liste de sélecteurs recopiée dans
// chaque écran, qu'un champ ajouté plus tard oublierait fatalement.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useId } from 'react';
import { classes, decritPar } from './utilitaires.js';
import { IconeAlerte } from './icones.js';

/** La DONNÉE attendue, d'où découlent `type` et `inputMode`. */
export type NatureChamp = 'texte' | 'nombre' | 'courriel' | 'telephone' | 'url' | 'recherche';

const CLAVIERS: Record<
  NatureChamp,
  { type: string; inputMode: ComponentPropsWithoutRef<'input'>['inputMode'] }
> = {
  texte: { type: 'text', inputMode: 'text' },
  // `type="text"` et non `type="number"` : le champ numérique HTML avale les
  // décimales à la virgule française, monte la valeur à la molette et refuse
  // « ~250 ». On garde le clavier numérique SANS le contrôle qui gêne.
  nombre: { type: 'text', inputMode: 'decimal' },
  courriel: { type: 'email', inputMode: 'email' },
  telephone: { type: 'tel', inputMode: 'tel' },
  url: { type: 'url', inputMode: 'url' },
  recherche: { type: 'search', inputMode: 'search' },
};

export interface ProprietesChampTexte extends Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'inputMode'
> {
  /** Libellé VISIBLE, en français. Jamais un `placeholder` en guise de libellé. */
  libelle: ReactNode;
  nature?: NatureChamp;
  /** Aide permanente sous le champ (ancres, unité attendue, exemple). */
  aide?: ReactNode;
  /** Message d'erreur en français clair. Sa présence marque le champ invalide. */
  erreur?: ReactNode;
  obligatoire?: boolean;
}

export function ChampTexte(proprietes: ProprietesChampTexte) {
  const {
    libelle,
    nature = 'texte',
    aide,
    erreur,
    obligatoire = false,
    id,
    className,
    ...reste
  } = proprietes;

  const genere = useId();
  const identifiant = id ?? `axn-champ-${genere}`;
  const idAide = `${identifiant}-aide`;
  const idErreur = `${identifiant}-erreur`;
  const clavier = CLAVIERS[nature];
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
      <input
        id={identifiant}
        className="axn-champ__saisie"
        type={clavier.type}
        inputMode={clavier.inputMode}
        required={obligatoire}
        aria-invalid={erreur !== undefined}
        // Voir l'en-tête : le marqueur que le gestionnaire de raccourcis interroge.
        data-saisie-libre="vrai"
        {...(descriptions === undefined ? {} : { 'aria-describedby': descriptions })}
        {...reste}
      />
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
