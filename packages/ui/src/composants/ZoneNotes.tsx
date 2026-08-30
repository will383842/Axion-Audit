// =============================================================================
// ZONE DE NOTES — @axion/ui
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E27 (design moderne,
// charte, WCAG AA).
//
// C'est le champ dans lequel un auditeur tape « Rien à signaler » pendant qu'un
// interlocuteur parle. §33.3 (V2.8) en fait une règle : « taper "Rien à signaler"
// dans une note ne déclenche jamais rien » — le `R` de « Rien » ne doit pas
// marquer la question « à revoir ». D'où `data-saisie-libre`, comme sur ChampTexte.
//
// L'indicateur « Enregistré » (§33.3) n'est PAS ici : il vit à côté du champ,
// dans `IndicateurEnregistrement`, parce qu'un écran d'entretien en porte UN pour
// toute la zone de saisie et non un par champ.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useId } from 'react';
import { classes, decritPar } from './utilitaires.js';
import { IconeAlerte } from './icones.js';

export interface ProprietesZoneNotes extends ComponentPropsWithoutRef<'textarea'> {
  libelle: ReactNode;
  aide?: ReactNode;
  erreur?: ReactNode;
  obligatoire?: boolean;
}

export function ZoneNotes(proprietes: ProprietesZoneNotes) {
  const { libelle, aide, erreur, obligatoire = false, id, className, ...reste } = proprietes;

  const genere = useId();
  const identifiant = id ?? `axn-notes-${genere}`;
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
      <textarea
        id={identifiant}
        className="axn-champ__saisie axn-champ__notes"
        required={obligatoire}
        aria-invalid={erreur !== undefined}
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
