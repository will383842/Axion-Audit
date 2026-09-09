// =============================================================================
// L'AIDE CLAVIER — la liste des raccourcis, ouverte par « ? » (R7)
//
// ── LE CONSTAT QUE CE FICHIER FERME ────────────────────────────────────────
// 2026-09-09 : les raccourcis du 03 §33.3 fonctionnaient tous — « 3 » cote,
// « e » bascule en écran partagé, une touche tapée dans une note ne déclenche
// rien —, et RIEN ne les annonçait. Le mot « raccourci » n'apparaissait nulle
// part dans l'application. Un accélérateur que personne ne découvre n'accélère
// personne : il ne sert qu'à ceux qui ont lu le code.
//
// ── LA LISTE EST LUE, JAMAIS RECOPIÉE ──────────────────────────────────────
// Elle vient de `RACCOURCIS_ENTRETIEN` (`session/raccourcis.ts`), la table que
// le gestionnaire de touches DISPATCHE. Une aide écrite à côté du gestionnaire
// serait vraie le jour de sa rédaction et fausse à la première touche qui
// change — et une aide fausse est pire que pas d'aide, parce qu'on la croit.
//
// ── CE QUE LE PANNEAU DOIT TENIR, ET QUI VIENT DU DESIGN SYSTEM ────────────
// `Panneau` (@axion/ui) apporte les trois comportements qu'aucune fenêtre ne
// doit réimplémenter (`composants/superposition.ts`) : Échap ferme, le focus
// ENTRE et RESTE dedans, le focus RETOURNE d'où il venait à la fermeture. Il
// apporte aussi la croix de fermeture — la sortie AU DOIGT, sur une tablette
// où « Échap » n'existe pas. Rien de tout cela n'est réécrit ici.
//
// Jamais d'`alert()` : une boîte native bloque le fil d'exécution, sort de la
// charte (invariant 4), n'est pas traduisible et n'est pas navigable au clavier
// comme le reste de l'écran.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E44 (UX/UI 2026-2027 —
// grille §33, raccourcis complets), E13 (écran 3 zones, enregistrement continu).
// =============================================================================
import type { ReactNode } from 'react';
import { Panneau } from '@axion/ui';
import { RACCOURCIS_ENTRETIEN } from '../../session/raccourcis.js';
import './entretien.css';

export interface ProprietesPanneauRaccourcis {
  readonly ouvert: boolean;
  readonly onFermer: () => void;
}

export function PanneauRaccourcis({ ouvert, onFermer }: ProprietesPanneauRaccourcis): ReactNode {
  return (
    <Panneau
      ouvert={ouvert}
      titre="Raccourcis clavier"
      description="Ces touches n’agissent que hors d’un champ de saisie : taper « Rien à signaler » dans une note ne déclenche jamais rien (03 §33.3). Échap rend le focus."
      position="cote"
      onFermer={onFermer}
    >
      {/* Une liste de définitions : chaque touche EST le terme, ce qu'elle fait
          en est la définition. C'est ce que la structure dit à un lecteur
          d'écran, et `<table>` promettrait deux dimensions qu'il n'y a pas. */}
      <dl className="axn-raccourcis">
        {RACCOURCIS_ENTRETIEN.map((raccourci) => (
          <div key={raccourci.libelle} className="axn-raccourcis__ligne">
            <dt className="axn-raccourcis__touches">
              {raccourci.touches.map((touche) => (
                <kbd key={touche} className="axn-raccourcis__touche">
                  {touche}
                </kbd>
              ))}
            </dt>
            <dd className="axn-raccourcis__libelle">{raccourci.libelle}</dd>
          </div>
        ))}
      </dl>
    </Panneau>
  );
}
