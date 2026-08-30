// =============================================================================
// ÉTAT HORS LIGNE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// §33.2 : « hors ligne : pastille discrète + RAPPEL DES CAPACITÉS LOCALES ».
// C'est le seul des quatre états qui n'annonce pas un problème. L'invariant 1
// dit « l'app terrain fonctionne à 100 % sans réseau » : hors ligne est le mode
// NOMINAL, pas une panne. Le composant est donc neutre — ni rouge, ni `role=alert` —
// et son contenu obligatoire est la LISTE DE CE QUI MARCHE QUAND MÊME.
//
// `capacites` est requis et non vide par contrat : un écran hors ligne qui
// n'énumère rien laisse l'auditeur croire qu'il doit attendre le réseau, et un
// auditeur qui attend le réseau dans un sous-sol d'usine ne collecte rien.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';
import { IconeNuageBarre } from './icones.js';

export interface ProprietesEtatHorsLigne extends ComponentPropsWithoutRef<'div'> {
  titre?: string;
  /** Ce qui reste possible SANS réseau, en français, une capacité par entrée. */
  capacites: readonly string[];
  /** Nombre d'éléments locaux en attente de remontée. Rassure sans inquiéter. */
  enAttente?: number;
  actions?: ReactNode;
}

export function EtatHorsLigne(proprietes: ProprietesEtatHorsLigne) {
  const {
    titre = 'Hors ligne — le travail continue',
    capacites,
    enAttente,
    actions,
    className,
    ...reste
  } = proprietes;

  return (
    <div role="status" className={classes('axn-etat', className)} {...reste}>
      <span className="axn-etat__icone">
        <IconeNuageBarre />
      </span>
      <p className="axn-etat__titre">{titre}</p>
      <p className="axn-etat__texte">
        {enAttente === undefined
          ? 'Tout est enregistré sur cet appareil et remontera au retour du réseau.'
          : `${String(enAttente)} élément${enAttente > 1 ? 's' : ''} en attente : tout est enregistré sur cet appareil et remontera au retour du réseau.`}
      </p>
      <ul className="axn-etat__capacites">
        {capacites.map((capacite) => (
          <li key={capacite}>{capacite}</li>
        ))}
      </ul>
      {actions !== undefined && <div className="axn-etat__actions">{actions}</div>}
    </div>
  );
}
