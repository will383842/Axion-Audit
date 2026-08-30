// =============================================================================
// PANNEAU — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// La surface qui glisse depuis un bord, pour un contenu qu'on CONSULTE ou qu'on
// PARCOURT plutôt qu'un choix binaire (c'est le Dialogue, à côté). Usages terrain :
//   · la recherche de question HORS PARCOURS (§25.4 — « recherche plein texte
//     dans TOUTES les questions figées de la mission, locale, hors ligne »), que
//     §33.3 appelle « palette de saut », ouverte par la touche « / » ;
//   · les notes volantes et les pièces jointes d'une question.
//
// `position="bas"` par défaut, et c'est une décision tactile : sur un téléphone
// tenu à une main, le bas de l'écran est la seule zone qu'un pouce atteint sans
// changer de prise. `position="cote"` sert au poste PC, où la hauteur d'écran est
// la ressource rare.
//
// Le clavier virtuel ne doit jamais masquer la zone de saisie (§22.1/§33.3) : le
// panneau est borné à 85 % de la hauteur en CSS et défile en interne, de sorte
// que le champ focalisé reste ramené dans la vue par le navigateur.
// =============================================================================
import type { ReactNode } from 'react';
import { useId, useRef } from 'react';
import { Bouton } from './Bouton.js';
import { IconeCroix } from './icones.js';
import { classes, decritPar } from './utilitaires.js';
import { useSuperposition } from './superposition.js';

export type PositionPanneau = 'bas' | 'cote';

export interface ProprietesPanneau {
  ouvert: boolean;
  titre: string;
  description?: string;
  onFermer: () => void;
  position?: PositionPanneau;
  actions?: ReactNode;
  /** Un panneau de consultation se ferme au clic à côté — c'est le geste attendu. */
  fermetureExterieure?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Panneau(proprietes: ProprietesPanneau) {
  const {
    ouvert,
    titre,
    description,
    onFermer,
    position = 'bas',
    actions,
    fermetureExterieure = true,
    children,
    className,
  } = proprietes;

  const boite = useRef<HTMLDivElement>(null);
  const genere = useId();
  const idTitre = `${genere}-titre`;
  const idDescription = `${genere}-description`;

  useSuperposition({ ouvert, onFermer, conteneur: boite });

  if (!ouvert) return null;

  const descriptions = decritPar(description !== undefined && idDescription);

  return (
    <div
      className={classes('axn-voile', `axn-voile--${position}`)}
      onClick={(evenement) => {
        if (fermetureExterieure && evenement.target === evenement.currentTarget) onFermer();
      }}
    >
      <div
        ref={boite}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        {...(descriptions === undefined ? {} : { 'aria-describedby': descriptions })}
        tabIndex={-1}
        className={classes('axn-superposition', `axn-superposition--${position}`, className)}
      >
        {position === 'bas' && <span className="axn-superposition__poignee" aria-hidden="true" />}

        <div className="axn-superposition__tete">
          <div>
            <h2 id={idTitre} className="axn-superposition__titre">
              {titre}
            </h2>
            {description !== undefined && (
              <p id={idDescription} className="axn-superposition__description">
                {description}
              </p>
            )}
          </div>
          <Bouton
            variante="discret"
            iconeSeule
            libelleAccessible="Fermer"
            icone={<IconeCroix />}
            onClick={onFermer}
          />
        </div>

        {children !== undefined && <div className="axn-superposition__corps">{children}</div>}
        {actions !== undefined && <div className="axn-superposition__actions">{actions}</div>}
      </div>
    </div>
  );
}
