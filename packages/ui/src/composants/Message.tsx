// =============================================================================
// MESSAGE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// Le bandeau en ligne d'un écran : rappel du NDA sur une question sensible
// (§27.4), consigne de cotation, motif d'un verrou d'étape (§19.1 — « chaque
// étape verrouillée affiche PRÉCISÉMENT ce qui manque, jamais un cadenas muet »),
// avertissement de quota de stockage (§22.1).
//
// LE RÔLE ARIA SUIT LE TON, ET C'EST DÉLIBÉRÉ. `alerte` prend `role="alert"`,
// qui INTERROMPT le lecteur d'écran ; tous les autres prennent `role="status"`,
// qui attend la fin de la phrase en cours. Mettre `alert` partout revient à
// couper la parole à un auditeur malvoyant pour lui annoncer une consigne — et
// §17.3 interdit déjà toute notification intrusive en entretien.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';
import { IconeAlerte, IconeCoche, IconeInfo } from './icones.js';

export type TonMessage = 'info' | 'succes' | 'avertissement' | 'alerte';

const ICONES: Record<TonMessage, ReactNode> = {
  info: <IconeInfo />,
  succes: <IconeCoche />,
  avertissement: <IconeAlerte />,
  alerte: <IconeAlerte />,
};

export interface ProprietesMessage extends ComponentPropsWithoutRef<'div'> {
  ton?: TonMessage;
  /** Titre court, en français. Facultatif : un message d'une ligne s'en passe. */
  titre?: ReactNode;
  /** Boutons d'action — §17.6 : « chaque erreur dit la cause ET l'action ». */
  actions?: ReactNode;
  children: ReactNode;
}

export function Message(proprietes: ProprietesMessage) {
  const { ton = 'info', titre, actions, className, children, ...reste } = proprietes;

  return (
    <div
      role={ton === 'alerte' ? 'alert' : 'status'}
      className={classes('axn-message', `axn-message--${ton}`, className)}
      {...reste}
    >
      <span className="axn-message__icone">{ICONES[ton]}</span>
      <div className="axn-message__corps">
        {titre !== undefined && <p className="axn-message__titre">{titre}</p>}
        <div>{children}</div>
        {actions !== undefined && <div className="axn-message__actions">{actions}</div>}
      </div>
    </div>
  );
}
