// =============================================================================
// TÉLÉCHARGEMENT DE L'EXPORT DE MISSION — 03 §36.3. Lot L7, incrément L7c.
//
// ── POURQUOI PAS `useQuery` ────────────────────────────────────────────────
// TanStack Query met en cache un RÉSULTAT ; ici, le résultat est un fichier de
// plusieurs mégaoctets qu'on écrit sur un disque et qu'on ne relit jamais. Le
// garder en mémoire n'aurait aucun usage, et le re-déclencher au retour de
// fenêtre (`refetchOnWindowFocus`) téléchargerait un ZIP dans le dos de
// l'utilisateur. Un export est une ACTION, pas une lecture d'écran : c'est donc
// un état local explicite, déclenché par un clic, et rien d'autre.
//
// ── LE SIÈGE PRODUIT, LE NAVIGATEUR ENREGISTRE (invariant 6) ──────────────
// Aucun assemblage ici : le ZIP arrive fait. Ce module crée une URL d'objet, la
// clique, et la RÉVOQUE — une URL d'objet non révoquée retient tout le fichier en
// mémoire jusqu'au rechargement de la page.
//
// ── LE FICHIER SAUVEGARDÉ PORTE LE NOM DU SERVEUR ─────────────────────────
// `Content-Disposition` fait foi : `export_mission_<id>_<AAAAMMJJ>.zip` (§36.3),
// avec la date DANS LE FUSEAU DE MISSION. Le recomposer côté navigateur
// donnerait la date du poste, qui n'est pas celle de la mission.
//
// Traçabilité : E14 · E22 (console de pilotage) · E36 · E43.
// =============================================================================
import { useCallback, useState } from 'react';
import { ErreurApi, ErreurReseau } from './client.js';
import { useClientApi } from './requetes.js';

/** L'état d'un téléchargement, tel que l'écran l'affiche. */
export interface EtatTelechargement {
  readonly enCours: boolean;
  /** Message français prêt à afficher, ou `null`. */
  readonly erreur: string | null;
  /** Le nom du dernier fichier reçu, pour la confirmation. `null` avant tout appel. */
  readonly dernierFichier: string | null;
  readonly lancer: (avecRepondants: boolean) => Promise<void>;
}

/**
 * Déclenche l'enregistrement d'un blob sous un nom donné.
 *
 * `URL.createObjectURL` + un `<a download>` synthétique : c'est le seul chemin qui
 * fonctionne sans quitter la page ni ouvrir un onglet — et qui conserve les
 * cookies de session, puisque le fichier a déjà été récupéré par `fetch`.
 */
function enregistrer(blob: Blob, nomFichier: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.rel = 'noopener';
    document.body.append(lien);
    lien.click();
    lien.remove();
  } finally {
    // Toujours révoquée, même si le clic a échoué : sans cela, le ZIP entier
    // reste en mémoire jusqu'au rechargement de la page.
    URL.revokeObjectURL(url);
  }
}

/** Un message français pour l'écran — jamais un objet d'erreur brut. */
function messageDErreur(cause: unknown): string {
  if (cause instanceof ErreurApi) return cause.message;
  if (cause instanceof ErreurReseau) {
    return 'Le serveur n’a pas répondu. Vérifiez votre connexion, puis réessayez.';
  }
  return 'L’archive n’a pas pu être produite. Réessayez ; si le problème persiste, signalez-le au support.';
}

/**
 * `GET /v1/missions/:id/export` — l'archive du §36.3.
 *
 * `avecRepondants` ajoute `?repondants=true`. La valeur `false` n'est PAS envoyée :
 * l'absence du paramètre est déjà le défaut côté serveur, et une porte de donnée
 * personnelle se demande, elle ne se refuse pas.
 */
export function useTelechargementExport(missionId: string): EtatTelechargement {
  const client = useClientApi();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dernierFichier, setDernierFichier] = useState<string | null>(null);

  const lancer = useCallback(
    async (avecRepondants: boolean): Promise<void> => {
      setEnCours(true);
      setErreur(null);
      try {
        const fichier = await client.telecharger(`/missions/${missionId}/export`, {
          query: avecRepondants ? { repondants: 'true' } : {},
        });
        enregistrer(fichier.blob, fichier.nomFichier);
        setDernierFichier(fichier.nomFichier);
      } catch (cause) {
        setErreur(messageDErreur(cause));
      } finally {
        setEnCours(false);
      }
    },
    [client, missionId],
  );

  return { enCours, erreur, dernierFichier, lancer };
}
