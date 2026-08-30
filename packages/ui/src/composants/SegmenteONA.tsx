// =============================================================================
// SEGMENTÉ OUI / NON / N-A — @axion/ui
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E27 (design moderne,
// charte, WCAG AA).
//
// §33.5 : « SegmenteONA (Oui/Non/N-A GROS BOUTONS TACTILES) ». Gros n'est pas un
// adjectif de style : c'est le contrôle le plus frappé de la journée, et il se
// frappe debout, à une main, parfois avec des gants (§33.1). D'où
// `--taille-controle-hauteur-large` (3,5 rem) et non le plancher de 44 px d'A27.
//
// TROIS VALEURS ET PAS QUATRE. « Non communiqué » (§27.4) n'est PAS un quatrième
// segment : c'est un STATUT distinct porté par `answers.withheld` + son motif, et
// il vaut pour TOUS les types de réponse — une échelle 1-5 peut être non
// communiquée. L'ajouter ici en ferait un cas particulier des questions
// oui/non, et §27.4 serait à moitié implémenté. Il vit à côté, dans l'écran.
//
// Les raccourcis O/N/A du §33.3 appartiennent à l'écran (règle V2.8 : ils ne sont
// actifs que HORS d'un champ de saisie, et seul l'écran sait où est le focus).
// Le composant sait en revanche les AFFICHER, parce qu'un raccourci qu'on ne voit
// pas est un raccourci que personne n'apprend.
// =============================================================================
import { useId } from 'react';
import { classes } from './utilitaires.js';
import { IconeCoche } from './icones.js';

export type ReponseONA = 'oui' | 'non' | 'na';

interface Segment {
  valeur: ReponseONA;
  libelle: string;
  /** La touche du §33.3, affichée telle qu'elle se tape. */
  raccourci: string;
}

const SEGMENTS: readonly Segment[] = [
  { valeur: 'oui', libelle: 'Oui', raccourci: 'O' },
  { valeur: 'non', libelle: 'Non', raccourci: 'N' },
  // « Sans objet » et non « Non applicable » : c'est le mot d'un auditeur, et il
  // se distingue à l'oreille de « non ». Le code, lui, reste `na` (§27.4).
  { valeur: 'na', libelle: 'Sans objet', raccourci: 'A' },
];

export interface ProprietesSegmenteONA {
  libelle: string;
  /** `null` = pas encore répondu, et cela se distingue de « Non ». */
  valeur: ReponseONA | null;
  onChangement: (valeur: ReponseONA) => void;
  nom?: string;
  afficherRaccourcis?: boolean;
  desactive?: boolean;
  className?: string;
}

export function SegmenteONA(proprietes: ProprietesSegmenteONA) {
  const {
    libelle,
    valeur,
    onChangement,
    nom,
    afficherRaccourcis = false,
    desactive = false,
    className,
  } = proprietes;

  const genere = useId();
  const nomGroupe = nom ?? `axn-ona-${genere}`;

  return (
    <fieldset className={classes('axn-choix', className)}>
      <legend className="axn-choix__intitule">{libelle}</legend>
      <div className="axn-choix__pistes">
        {SEGMENTS.map((segment) => (
          <label key={segment.valeur} className="axn-choix__option">
            <input
              className="axn-visuellement-masque"
              type="radio"
              name={nomGroupe}
              value={segment.valeur}
              checked={valeur === segment.valeur}
              disabled={desactive}
              onChange={() => {
                onChangement(segment.valeur);
              }}
            />
            <span>{segment.libelle}</span>
            {valeur === segment.valeur ? (
              <IconeCoche className="axn-choix__marque" />
            ) : (
              afficherRaccourcis && (
                <span className="axn-choix__raccourci">touche {segment.raccourci}</span>
              )
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
