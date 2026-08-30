// =============================================================================
// DIALOGUE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// La confirmation d'un geste irréversible ou verrouillant. En terrain, il y en a
// exactement deux familles, et §19.1 V2.10 interdit de les confondre :
//   · « Terminer l'entretien » — geste à chaud, RÉVERSIBLE (l'entretien reste
//     rouvrable par son auteur) ;
//   · « Valider l'entretien » — geste QUALITÉ qui VERROUILLE : toute modification
//     ultérieure devient une révision tracée (invariant 7).
// Le second mérite un dialogue ; le premier souvent pas. Ce composant ne tranche
// pas — il fournit la fenêtre, et l'écran décide de la mériter.
//
// `titre` est requis et lié par `aria-labelledby` : une fenêtre modale sans nom
// est annoncée « boîte de dialogue » et rien d'autre.
// =============================================================================
import type { ReactNode } from 'react';
import { useId, useRef } from 'react';
import { Bouton } from './Bouton.js';
import { IconeCroix } from './icones.js';
import { classes, decritPar } from './utilitaires.js';
import { useSuperposition } from './superposition.js';

export interface ProprietesDialogue {
  ouvert: boolean;
  /** Nom de la fenêtre, en français. Lu à l'ouverture. */
  titre: string;
  /** Ce que le geste implique, quand ce n'est pas évident (« verrouillera… »). */
  description?: string;
  onFermer: () => void;
  /** Boutons de décision. L'action confirmante y est la seule `principal`. */
  actions?: ReactNode;
  /**
   * Un clic sur le voile ferme la fenêtre. À laisser à `false` pour une
   * confirmation destructive : un clic à côté, en entretien, ne doit pas
   * escamoter une décision qu'on est en train de prendre.
   */
  fermetureExterieure?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Dialogue(proprietes: ProprietesDialogue) {
  const {
    ouvert,
    titre,
    description,
    onFermer,
    actions,
    fermetureExterieure = false,
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
      className="axn-voile axn-voile--centre"
      onClick={(evenement) => {
        // `currentTarget` et non `target` : sans cette égalité, un clic RELÂCHÉ
        // sur le voile après un glissement commencé DANS la fenêtre la fermerait —
        // c'est le geste exact d'une sélection de texte qui déborde.
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
        className={classes('axn-superposition', 'axn-superposition--dialogue', className)}
      >
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
