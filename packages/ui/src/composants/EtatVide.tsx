// =============================================================================
// ÉTAT VIDE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// §17.6 : « chaque état vide DIT QUOI FAIRE (“Aucun entretien — créez le premier
// ou consultez le plan d'entretiens”) ». Le type l'impose : `titre` ET
// `description` sont requis, et `description` n'a de sens que si elle nomme le
// geste suivant. Un état vide qui n'affiche que « Aucun résultat » laisse
// l'auditeur devant un écran mort, en entretien, avec un interlocuteur qui attend.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';
import { IconeCorbeilleVide } from './icones.js';

export interface ProprietesEtatVide extends ComponentPropsWithoutRef<'div'> {
  titre: string;
  /** Ce qu'il y a à FAIRE, en français, à l'impératif ou à l'infinitif. */
  description: string;
  /** Le ou les boutons qui exécutent ce que la description annonce. */
  actions?: ReactNode;
  icone?: ReactNode;
}

export function EtatVide(proprietes: ProprietesEtatVide) {
  const { titre, description, actions, icone, className, ...reste } = proprietes;

  return (
    <div className={classes('axn-etat', className)} {...reste}>
      <span className="axn-etat__icone">{icone ?? <IconeCorbeilleVide />}</span>
      <p className="axn-etat__titre">{titre}</p>
      <p className="axn-etat__texte">{description}</p>
      {actions !== undefined && <div className="axn-etat__actions">{actions}</div>}
    </div>
  );
}
