// =============================================================================
// LES DÉCLENCHEURS DE SYNC — « retour du réseau » (05 §9.3, arbitrage B3)
//
// 05 §9.3 nomme trois déclencheurs : manuel (le bouton, `synchroniserMaintenant`),
// RETOUR DU RÉSEAU, minuterie. Celui-ci écoute l'événement `online` et pousse
// chaque mission embarquée, une à la fois — le moteur sérialise déjà par mission,
// et l'ordre n'a pas d'importance entre missions.
//
// Il ne décide de rien : le sort des ops est celui du moteur, l'état celui du port.
// Un échec déclenché par le réseau ne fuit JAMAIS en rejet non géré : il est déjà
// rendu visible par le port (statut « echec ») — et n'est pas journalisé ici (11 §2).
//
// Traçabilité : E7 (remontée continue dès qu'il y a du réseau) ; invariant 8.
// =============================================================================
import type { PortSync } from '../local/port-sync.js';

export interface DependancesRetourReseau {
  /** `window` en production ; un `EventTarget` dans les tests. */
  readonly cible: EventTarget;
  readonly port: Pick<PortSync, 'synchroniserMaintenant'>;
  /** Les missions à pousser, lues AU MOMENT du retour du réseau. */
  readonly missions: () => Promise<readonly string[]>;
}

/** Branche le déclencheur ; rend la fonction qui le débranche. */
export function ecouterRetourReseau(deps: DependancesRetourReseau): () => void {
  const pousserTout = async (): Promise<void> => {
    let missions: readonly string[] = [];
    try {
      missions = await deps.missions();
    } catch {
      // Base fermée ou verrouillée : rien à pousser, le prochain retour réessaiera.
    }
    for (const missionId of missions) {
      try {
        await deps.port.synchroniserMaintenant(missionId);
      } catch {
        // Déjà visible par le port ; la mission suivante part quand même.
      }
    }
  };
  const surRetour = (): void => {
    void pousserTout();
  };
  deps.cible.addEventListener('online', surRetour);
  return () => {
    deps.cible.removeEventListener('online', surRetour);
  };
}
