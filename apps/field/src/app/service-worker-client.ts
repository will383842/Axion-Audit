// =============================================================================
// ENREGISTREMENT DU SERVICE WORKER, CÔTÉ PAGE — 05 §31-1
//
// ── LA RÈGLE QUI COMMANDE TOUT CE FICHIER ───────────────────────────────────
// 05 §31-1 : « le service worker télécharge les nouvelles versions en arrière-plan
// mais **ne les active JAMAIS pendant un entretien en cours** ; bandeau discret
// “Nouvelle version disponible — appliquer” actionné par l'auditeur ENTRE DEUX
// entretiens ».
//
// Autrement dit : aucun `skipWaiting()` automatique, jamais. Une version qui
// s'active pendant une saisie recharge la page sous les doigts de l'auditeur, en
// entretien, devant le client. `appliquerMiseAJour()` est donc explicitement un
// GESTE, et il REFUSE tant qu'une session est en cours sur l'appareil.
//
// Le bandeau lui-même est L5c (`LOT_L5.md` §1) ; ce module lui fournit l'état et
// l'action, pour que L5c n'ait pas à réécrire la mécanique du service worker.
//
// Traçabilité : E6 (hors ligne total, PC ET tablette), E17 (stack imposée :
// Hetzner, Docker, PG, Fastify, Vite/React).
// =============================================================================

/** Chemin servi par Caddy à la racine du domaine (11 §2, `/` → field). */
const CHEMIN_SW = '/sw.js';

export interface EtatMiseAJour {
  /** Une nouvelle version est téléchargée et attend d'être appliquée. */
  readonly disponible: boolean;
  /** Appliquer la mise à jour. Refuse — et rend `false` — si une session est en cours. */
  appliquer: () => Promise<boolean>;
}

type Abonne = (etat: EtatMiseAJour) => void;

let enAttente: ServiceWorker | null = null;
const abonnes = new Set<Abonne>();

/**
 * Une session est-elle en cours sur cet appareil ?
 *
 * Injecté par la coquille plutôt que lu ici : ce module ne doit connaître ni
 * Dexie, ni le coffre. Un service worker qui ouvrirait la base pour décider s'il
 * peut s'activer serait un second lecteur des données de mission, et l'invariant
 * de source unique tomberait.
 */
let sessionEnCours: () => boolean = () => false;

export function declarerSourceSessionEnCours(source: () => boolean): void {
  sessionEnCours = source;
}

function diffuser(): void {
  const etat = etatMiseAJour();
  for (const abonne of abonnes) abonne(etat);
}

export function etatMiseAJour(): EtatMiseAJour {
  return {
    disponible: enAttente !== null,
    appliquer: async (): Promise<boolean> => {
      if (enAttente === null) return false;
      // LE point du 05 §31-1. Jamais d'activation pendant un entretien.
      if (sessionEnCours()) return false;
      enAttente.postMessage({ type: 'AXION_APPLIQUER_MISE_A_JOUR' });
      // Le rechargement est déclenché par `controllerchange`, une fois que le
      // nouveau service worker a réellement pris la main — pas avant, sinon on
      // recharge sur l'ancienne version et le bandeau revient.
      await new Promise<void>((resoudre) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          resoudre();
        });
      });
      location.reload();
      return true;
    },
  };
}

export function surMiseAJour(abonne: Abonne): () => void {
  abonnes.add(abonne);
  abonne(etatMiseAJour());
  return () => abonnes.delete(abonne);
}

/**
 * Enregistre le service worker. Sans lui, l'application ne démarre pas depuis le
 * cache (invariant 1 : « l'app terrain fonctionne à 100 % sans réseau »).
 *
 * L'échec d'enregistrement n'est PAS fatal : en développement comme en contexte
 * non sécurisé, l'API n'existe pas. L'application reste utilisable en ligne — ce
 * qui doit être visible ailleurs, pas masqué ici.
 */
export function enregistrerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(CHEMIN_SW)
      .then((enregistrement) => {
        if (enregistrement.waiting !== null) {
          enAttente = enregistrement.waiting;
          diffuser();
        }
        enregistrement.addEventListener('updatefound', () => {
          const nouveau = enregistrement.installing;
          if (nouveau === null) return;
          nouveau.addEventListener('statechange', () => {
            // `installed` AVEC un contrôleur déjà en place = une nouvelle version
            // attend. Sans contrôleur, c'est la toute première installation :
            // rien à annoncer, l'auditeur n'a pas de version à remplacer.
            if (nouveau.state === 'installed' && navigator.serviceWorker.controller !== null) {
              enAttente = nouveau;
              diffuser();
            }
          });
        });
      })
      .catch(() => {
        // Silencieux DÉLIBÉRÉMENT : journaliser ici n'apprendrait rien à
        // l'auditeur et 11 §2 proscrit les journaux bavards côté client.
      });
  });
}
