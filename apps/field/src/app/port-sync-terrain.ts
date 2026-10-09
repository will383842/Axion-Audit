// =============================================================================
// LE PORT DE SYNC DE L'APPLICATION — un seul par base (B3, revue A29 de L6a)
//
// Le port réel remplace le port inerte PARTOUT en production : accueil, cockpit,
// fin de journée, pastille de la coquille. Ils partagent LA MÊME instance par
// base — donc le même instantané d'état, le même transport, le même verrou de
// passage : deux écrans ne peuvent pas rendre deux verdicts sur le même fait.
//
// Ce fichier ne fait que BRANCHER ; toute décision vit sous `src/sync/`.
//   · le coffre est lu À L'APPEL dans le contexte local : il n'existe que
//     déverrouillé, et lire l'état (`actualiser`) n'en a jamais besoin ;
//   · `fetch` est résolu à l'appel, comme `siege/connexion.ts`.
//
// Traçabilité : E7, E38 ; invariant 8.
// =============================================================================
import type { BaseLocale } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import { contexteLocal, contexteLocalInstalle } from '../local/contexte.js';
import { ecouterRetourReseau } from '../sync/declencheurs.js';
import { creerPortSync, type PortSyncReel } from '../sync/port.js';
import { creerTransport } from '../sync/transport.js';

const portsParBase = new WeakMap<BaseLocale, PortSyncReel>();

/** Le port réel de cette base — créé une fois, partagé par tous les écrans. */
export function portSyncDeLaBase(base: BaseLocale): PortSyncReel {
  const connu = portsParBase.get(base);
  if (connu !== undefined) return connu;
  const transport = creerTransport({
    base,
    get coffre(): Coffre {
      return contexteLocal().coffre;
    },
    fetch: (entree, init) => globalThis.fetch(entree, init),
  });
  const port = creerPortSync({
    base,
    get coffre(): Coffre {
      return contexteLocal().coffre;
    },
    transport,
  });
  portsParBase.set(base, port);
  return port;
}

/**
 * Branche le déclencheur « retour du réseau » (05 §9.3) pour cette base. Rien ne
 * part tant que l'application est verrouillée : sans coffre, aucune op ne se
 * déchiffre, et un essai voué à l'échec n'apprendrait rien à l'auditeur.
 */
export function brancherRetourReseau(base: BaseLocale, cible: EventTarget): () => void {
  return ecouterRetourReseau({
    cible,
    port: portSyncDeLaBase(base),
    missions: async () =>
      contexteLocalInstalle() ? (await base.missions.toArray()).map((mission) => mission.id) : [],
  });
}

/**
 * Le port, ACTUALISÉ pour chaque mission de la base : ce que lisent le cockpit,
 * la fin de journée et la pastille avant de rendre (`etat()` est synchrone et ne
 * sait que ce qui a été lu). Appelé dans une `useLiveQuery`, il en suit la base.
 */
export async function portSyncActualise(base: BaseLocale): Promise<PortSyncReel> {
  const port = portSyncDeLaBase(base);
  for (const mission of await base.missions.toArray()) await port.actualiser(mission.id);
  return port;
}
