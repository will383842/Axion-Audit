// =============================================================================
// CE QUE L5c APPORTE À LA COQUILLE — trois points de branchement, un seul module
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
// Revue croisée A29, majeur **M7** : `LOT_L5.md` §1 déclare `App.tsx` fichier
// partagé sous le régime « **un `case` par écran**, append-only ». L5c y avait
// mis davantage — un crochet de vue initiale, une pastille de synchronisation,
// une composition sous `accueil`. Le régime déclaré ne couvrait donc pas ce qui
// s'y trouvait, et un fichier partagé dont la règle est plus étroite que le
// contenu est un fichier qui se disputera.
//
// L'arbitrage a retenu la première option : **ce qui dépasse sort**. `App.tsx`
// ne garde que de l'aiguillage — des `case`, et trois APPELS à ce module. Un
// fichier partagé qui ne contient que de l'aiguillage ne se dispute pas.
//
// Rien n'est modifié ici : le code est celui qui vivait dans `App.tsx`,
// déplacé. Les trois points restent nommés pour que la coquille reste lisible.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total),
// E7 (remontée continue dès qu'il y a du réseau).
// =============================================================================
import { useEffect, useRef, type ReactNode } from 'react';
import { useTerrain } from '../../app/contexte.js';
import { reposerSurRacine, vueCourante } from '../../app/navigation.js';
import { VUE_INITIALE } from '../../app/vues.js';
import { AccesRestauration } from './EcranRestauration.js';
import { PastilleSyncCoquille } from './PastilleSyncCoquille.js';
import { aUneMissionEmbarquee, vueInitiale } from './vue-initiale.js';

/**
 * ① La vue initiale est une RÈGLE, pas une constante (arbitrage A01,
 * 2026-09-05) : cockpit « Aujourd'hui » quand une mission est embarquée,
 * `accueil` sinon.
 *
 * Appliquée UNE fois par chargement de page, à l'ouverture du coffre, et
 * seulement si l'application a atterri sur la vue par défaut avec une pile
 * vierge — la reprise instantanée (03 §17.4) n'est jamais détournée. La règle
 * elle-même vit dans `vue-initiale.ts`, testée sur ses deux cas ; ce crochet ne
 * fait que la lire et naviguer.
 *
 * Depuis R3, il en tire DEUX conclusions et non plus une : l'écran à afficher
 * quand rien n'a été repris, et — quand quelque chose l'a été — la racine sur
 * laquelle cette reprise se repose. Le second cas est celui qui manquait, et
 * c'est celui qui coûtait une sortie.
 */
export function useVueInitiale(): void {
  const { base, phase, navigation, naviguer } = useTerrain();
  const appliquee = useRef(false);
  useEffect(() => {
    if (appliquee.current || base === null || phase !== 'ouvert') return;
    appliquee.current = true;
    void aUneMissionEmbarquee(base).then((missionEmbarquee) => {
      const courante = vueCourante(navigation);
      const cible = vueInitiale({
        missionEmbarquee,
        vueAtterrissage: courante,
        profondeurPile: navigation.pile.length,
      });
      if (cible !== courante) {
        naviguer({ type: 'racine', vue: cible });
        return;
      }
      // ── R3 : LA RACINE DE REPOS AUSSI EST LA RÈGLE ───────────────────────
      // Ce qui précède ne joue que sur l'ATTERRISSAGE par défaut, pile vierge.
      // Quand une vue a été REPRISE (03 §17.4), la pile vaut
      // `[VUE_INITIALE, vue reprise]` : `restaurerNavigation` a posé la
      // constante, coffre fermé, sans pouvoir savoir si une mission était
      // embarquée sur l'appareil. On le sait ici — et si elle l'est, le dessous
      // de la pile doit être le cockpit.
      //
      // Sans ces lignes, « Revenir » depuis un entretien rouvert redescendait
      // sur `accueil`, dont les deux seules sorties sont `stockage` et
      // `restauration` : aucun chemin vers le cockpit, et un redémarrage de
      // l'application pour seule issue (réserve R3 de la recette novice A54 ;
      // le même mur a servi d'obstacle de mesure à A28, dont le harnais devait
      // effacer la base entre deux mesures).
      //
      // La racine de repos se LIT de la règle plutôt que de se réécrire ici :
      // un atterrissage par défaut sur une pile vierge, c'est mot pour mot la
      // question « quel écran quand rien n'est repris ? ». Une seule source.
      const racineDeRepos = vueInitiale({
        missionEmbarquee,
        vueAtterrissage: VUE_INITIALE,
        profondeurPile: 1,
      });
      const repose = reposerSurRacine(navigation, racineDeRepos);
      if (repose !== navigation) naviguer({ type: 'restaurer', etat: repose });
    });
  }, [base, phase, navigation, naviguer]);
}

/**
 * ② L'état de synchronisation, visible sur TOUS les écrans (décision A01,
 * 2026-09-05) · 03 §19.2 : « toujours visible mais discret (pastille, jamais de
 * bannière anxiogène) ». Posée une fois dans l'en-tête commun.
 */
export function IndicateursCoquille(): ReactNode {
  return <PastilleSyncCoquille />;
}

/**
 * ③ L'écran d'embarquement (L5a) et sa porte vers la restauration.
 *
 * `AccesRestauration` est COMPOSÉ ici plutôt qu'ajouté dans `EcranAccueil.tsx` :
 * ce fichier appartient à L5a et un correctif de sécurité y atterrit (A24). Un
 * appareil neuf a besoin de restaurer AVANT qu'une mission soit chargée — c'est
 * exactement l'état où cet écran est affiché.
 */
export function ComplementAccueil(): ReactNode {
  return <AccesRestauration />;
}
