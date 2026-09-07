// =============================================================================
// GALERIE — LES ICÔNES. Page `/design`.
//
// Dix SVG écrits dans le paquet, faute de `lucide-react` épinglé au 11 §1 : un
// INVENTAIRE FERMÉ, pas un jeu d'icônes. Elles figurent ici pour deux raisons :
//   · ce sont des composants exportés, donc le garde du catalogue les exige ;
//   · c'est la seule page où l'on vérifie d'un coup d'œil que le trait est
//     homogène — deux icônes dessinées à six jours d'écart divergent sinon.
//
// Chacune reçoit DEUX aperçus, et le second est celui qui compte : l'icône
// SEULE dans un bouton, avec son libellé accessible obligatoire (§33.6,
// « libellés explicites sur toute icône seule »). Le type de `Bouton` refuse
// l'oubli ; la vignette montre à quoi ressemble le respect de la règle.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA).
// =============================================================================
import type { ComponentType, ReactNode } from 'react';
import {
  Bouton,
  IconeAlerte,
  IconeCoche,
  IconeCorbeilleVide,
  IconeCroix,
  IconeInfo,
  IconeNuage,
  IconeNuageBarre,
  IconeOeil,
  IconeOeilBarre,
  IconeRotor,
  type NomIconeUI,
  type ProprietesIcone,
} from '@axion/ui';
import type { FicheComposant } from './types.js';

/**
 * Fabrique les deux vignettes d'une icône. Ce n'est PAS une boucle : l'objet
 * ci-dessous garde une clé littérale par icône, sans quoi le `satisfies` du
 * catalogue cesserait de mordre. Le facteur commun est la MISE EN PAGE, pas
 * l'inventaire.
 */
function fiche(
  Icone: ComponentType<ProprietesIcone>,
  usage: string,
  geste: string,
): FicheComposant {
  return {
    famille: 'icones',
    role: usage,
    origine: {
      source: 'hors-33.5',
      justification:
        '§19.2 nomme « iconographie Lucide » ; `lucide-react` n’est pas épinglé au ' +
        '11 §1 et l’installer serait une escalade. Ces dix SVG sont exactement ceux ' +
        'dont les composants du paquet ont besoin.',
      renvoi: '03 §19.2 (iconographie) · §33.6 (libellé sur icône seule)',
    },
    demonstrations: [
      {
        etat: 'nominal',
        intitule: 'Accompagnant un mot',
        propos:
          'Elle est `aria-hidden` : elle DOUBLE le mot et hérite de sa couleur par ' +
          '`currentColor`, donc d’un jeton, donc jamais d’une couleur en dur.',
        Apercu: () => (
          <p className="axn-design__icone-ligne">
            <Icone /> {usage}
          </p>
        ),
      },
      {
        etat: 'variantes',
        intitule: 'Seule dans un bouton',
        propos: `Sans « ${geste} » lu par le lecteur d’écran, ce bouton serait muet. Le type l’exige.`,
        Apercu: () => (
          <Bouton variante="secondaire" iconeSeule libelleAccessible={geste} icone={<Icone />} />
        ),
      },
    ],
  };
}

export const FICHES_ICONES = {
  IconeCoche: fiche(IconeCoche, 'Réponse retenue, entretien validé, « Enregistré ».', 'Valider'),
  IconeCroix: fiche(IconeCroix, 'Fermer une superposition, refuser.', 'Fermer'),
  IconeAlerte: fiche(
    IconeAlerte,
    'Incident : synchronisation en échec, sauvegarde en retard.',
    'Voir l’alerte',
  ),
  IconeInfo: fiche(IconeInfo, 'Précision utile, sans urgence.', 'En savoir plus'),
  IconeNuage: fiche(IconeNuage, 'Éléments locaux en attente de remontée.', 'Synchroniser'),
  IconeNuageBarre: fiche(
    IconeNuageBarre,
    'Réseau absent — le mode nominal du terrain.',
    'État du réseau',
  ),
  IconeOeil: fiche(
    IconeOeil,
    'Mode écran partagé actif : le contenu interne est masqué.',
    'Quitter l’écran partagé',
  ),
  IconeOeilBarre: fiche(
    IconeOeilBarre,
    'Mode écran partagé inactif : tout est visible.',
    'Passer en écran partagé',
  ),
  IconeCorbeilleVide: fiche(
    IconeCorbeilleVide,
    'Illustration d’un état vide.',
    'Vider la sélection',
  ),
  IconeRotor: fiche(
    IconeRotor,
    'Action en cours, en ligne, dans le bouton qui l’a lancée.',
    'Action en cours',
  ),
} as const satisfies Record<NomIconeUI, FicheComposant>;

/** Le rendu compact de l'inventaire fermé, pour l'en-tête de la famille. */
export function BandeIcones(): ReactNode {
  return (
    <p className="axn-design__bande-icones" aria-hidden="true">
      <IconeCoche />
      <IconeCroix />
      <IconeAlerte />
      <IconeInfo />
      <IconeNuage />
      <IconeNuageBarre />
      <IconeOeil />
      <IconeOeilBarre />
      <IconeCorbeilleVide />
      <IconeRotor />
    </p>
  );
}
