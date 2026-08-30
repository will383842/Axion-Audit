// =============================================================================
// INDICATEUR « ENREGISTRÉ » — @axion/ui
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E27 (design moderne,
// charte, WCAG AA).
//
// §33.3 : « MICRO-INDICATEUR "Enregistré" — l'enregistrement continu (§17.4)
// devient VISIBLE : pastille furtive à chaque écriture locale ; LA CONFIANCE SE
// VOIT. » Et il est un critère de la porte P-C (§33.7).
//
// « Furtive » se traduit par deux décisions de construction :
//   1. l'indicateur occupe sa hauteur EN PERMANENCE (`min-height` en CSS) même
//      inactif — sinon la ligne saute à chaque frappe, et un écran qui tressaute
//      pendant qu'on écrit est plus inquiétant que rassurant ;
//   2. `aria-live="polite"` et non `assertive` : §17.3 interdit toute notification
//      intrusive en entretien. Annoncer « Enregistré » toutes les deux secondes
//      dans l'oreille d'un auditeur malvoyant serait insupportable.
//
// Ce composant N'ENREGISTRE RIEN et ne compte aucun délai : il AFFICHE un état
// que l'écran lui donne. La temporisation appartient au moteur d'enregistrement
// local (L5), qui seul sait ce qu'est une écriture réussie dans Dexie.
// =============================================================================
import type { ComponentPropsWithoutRef } from 'react';
import { classes } from './utilitaires.js';
import { IconeCoche, IconeRotor } from './icones.js';

export type EtatEnregistrement = 'inactif' | 'enregistrement' | 'enregistre';

export interface ProprietesIndicateurEnregistrement extends ComponentPropsWithoutRef<'span'> {
  etat: EtatEnregistrement;
  /** Heure de la dernière écriture, DÉJÀ formatée au fuseau de la mission (§22.2). */
  horodatage?: string;
}

export function IndicateurEnregistrement(proprietes: ProprietesIndicateurEnregistrement) {
  const { etat, horodatage, className, ...reste } = proprietes;

  return (
    <span
      role="status"
      aria-live="polite"
      className={classes('axn-enregistrement', `axn-enregistrement--${etat}`, className)}
      {...reste}
    >
      {etat === 'enregistrement' && (
        <>
          <IconeRotor />
          <span>Enregistrement…</span>
        </>
      )}
      {etat === 'enregistre' && (
        <>
          <IconeCoche />
          <span>Enregistré{horodatage === undefined ? '' : ` à ${horodatage}`}</span>
        </>
      )}
    </span>
  );
}
