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
import { creerBackoff } from './backoff.js';

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

// =============================================================================
// LA MINUTERIE — 05 §9.3 « timer 30 s », avec backoff borné à 60 s (L6b)
//
// Un passage = chaque mission, une à la fois, par le port (montée puis descente).
// Le suivant n'est planifié qu'APRÈS la fin du précédent : jamais deux passages à
// la fois, si long soit l'un d'eux. Un passage dont UNE mission ne rend pas
// `succes` (échec, indisponible, rejet du port, liste illisible) est un échec :
// le suivant attend `delaiBackoffMs(n)`. Un succès rend la cadence de 30 s.
// Rien n'est journalisé ici (11 §2) : l'état est déjà visible par le port.
// =============================================================================
export const INTERVALLE_MINUTERIE_MS = 30_000;

export interface DependancesMinuterie {
  readonly port: Pick<PortSync, 'synchroniserMaintenant'>;
  /** Les missions à synchroniser, lues À CHAQUE passage. */
  readonly missions: () => Promise<readonly string[]>;
}

/** Démarre la minuterie ; rend la fonction qui l'ARRÊTE (idempotente). */
export function demarrerMinuterie(deps: DependancesMinuterie): () => void {
  const backoff = creerBackoff();
  let arretee = false;
  let minuteur: ReturnType<typeof setTimeout> | null = null;

  const planifier = (delaiMs: number): void => {
    if (arretee) return;
    minuteur = setTimeout(() => {
      minuteur = null;
      void passage();
    }, delaiMs);
  };

  const passage = async (): Promise<void> => {
    let reussi = true;
    let missions: readonly string[] = [];
    try {
      missions = await deps.missions();
    } catch {
      // Base fermée ou verrouillée : un échec, rythmé comme les autres.
      reussi = false;
    }
    for (const missionId of missions) {
      if (arretee) break;
      try {
        const resultat = await deps.port.synchroniserMaintenant(missionId);
        if (resultat.statut !== 'succes') reussi = false;
      } catch {
        // Déjà visible par le port ; la mission suivante part quand même.
        reussi = false;
      }
    }
    if (reussi) {
      backoff.succes();
      planifier(INTERVALLE_MINUTERIE_MS);
    } else {
      planifier(backoff.echec());
    }
  };

  planifier(INTERVALLE_MINUTERIE_MS);
  return () => {
    arretee = true;
    if (minuteur !== null) clearTimeout(minuteur);
    minuteur = null;
  };
}
