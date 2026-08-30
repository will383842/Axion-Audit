// =============================================================================
// ÉTAT ERREUR — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// §33.2 : « erreur : CAUSE + ACTION, français clair, CODE TECHNIQUE REPLIÉ ».
// §17.6 : « aucune erreur technique brute n'atteint l'écran ».
//
// Les deux propriétés `cause` et `action` sont REQUISES et séparées. Un unique
// champ « message » se serait rempli, dans la moitié des écrans, de la chaîne
// renvoyée par le serveur — c'est-à-dire exactement ce que §17.6 interdit. En
// les séparant, l'appelant ne peut pas oublier de dire quoi faire : le
// compilateur le lui demande.
//
// `details` existe parce que le code technique doit rester ATTEIGNABLE — un
// auditeur au téléphone avec le siège doit pouvoir le lire — mais REPLIÉ : il
// s'ouvre dans un `<details>`, jamais à l'écran par défaut.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';
import { IconeAlerte } from './icones.js';

export interface ProprietesEtatErreur extends ComponentPropsWithoutRef<'div'> {
  /** Titre court. Défaut : « Une erreur est survenue ». */
  titre?: string;
  /** POURQUOI, en français, sans jargon (« La mission n'a pas pu être chargée »). */
  cause: string;
  /** QUOI FAIRE (« Vérifiez votre connexion, puis relancez la synchronisation »). */
  action: string;
  /** Code ou message technique. Replié, jamais visible d'emblée. */
  details?: string;
  /** Boutons de résolution — « Réessayer » y a naturellement sa place. */
  actions?: ReactNode;
}

export function EtatErreur(proprietes: ProprietesEtatErreur) {
  const {
    titre = 'Une erreur est survenue',
    cause,
    action,
    details,
    actions,
    className,
    ...reste
  } = proprietes;

  return (
    <div role="alert" className={classes('axn-etat', className)} {...reste}>
      <span className="axn-etat__icone">
        <IconeAlerte />
      </span>
      <p className="axn-etat__titre">{titre}</p>
      <p className="axn-etat__texte">{cause}</p>
      <p className="axn-etat__texte">{action}</p>
      {actions !== undefined && <div className="axn-etat__actions">{actions}</div>}
      {details !== undefined && (
        <details className="axn-etat__details">
          <summary>Détail technique</summary>
          <pre className="axn-etat__code">{details}</pre>
        </details>
      )}
    </div>
  );
}
