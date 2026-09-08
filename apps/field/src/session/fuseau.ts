// =============================================================================
// AFFICHAGE DES HORODATAGES AU FUSEAU DE MISSION — 03 §22.2, invariant 5
//
// UTC en base et en API ; le fuseau de la mission (`missions.timezone`)
// n'intervient qu'ICI, à l'affichage. Aucun `new Date()` : on formate un nombre
// d'époque, ce qui laisse `horloge.ts` seul maître du « maintenant ».
// Traçabilité : E32 (fuseaux, devises, interface française) — ce module ne fait
// QUE cela : formater un instant UTC au fuseau de la MISSION (03 §22.2). Il citait
// E13 (écran 3 zones) au motif que l’indicateur « Enregistré à HH:mm » le
// consomme ; c’est le consommateur, pas l’exigence. Corrigé sur réserve R5 du
// rejeu A29 — même glose que son jumeau `local/horloge.ts`.
// =============================================================================

/** Rend `'HH:mm'` dans le fuseau donné (celui de l'appareil si `undefined`). */
export function formaterHeure(iso: string, fuseau: string | undefined): string {
  const epoque = Date.parse(iso);
  if (Number.isNaN(epoque)) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    ...(fuseau === undefined ? {} : { timeZone: fuseau }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(epoque);
}

/** Rend `'jj/mm/aaaa HH:mm'` dans le fuseau donné. */
export function formaterDateHeure(iso: string, fuseau: string | undefined): string {
  const epoque = Date.parse(iso);
  if (Number.isNaN(epoque)) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    ...(fuseau === undefined ? {} : { timeZone: fuseau }),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(epoque);
}

// -----------------------------------------------------------------------------
// L'HORODATAGE D'UNE MISSION DONT LE FUSEAU PEUT MANQUER — L5d
//
// Les deux fonctions ci-dessus acceptent un fuseau absent et retombent alors sur
// celui de l'APPAREIL. C'est utile pour un aperçu neutre ; c'est faux dès qu'un
// auditeur voyage — l'écran affiche alors l'heure de son portable en la
// présentant comme l'heure du site audité (03 §22.2, invariant 5). Un écran ne
// doit jamais emprunter ce chemin : il connaît le fuseau de la mission, ou il ne
// le connaît pas.
//
// Cette porte-ci rend donc les deux cas EXPLICITES et n'en invente aucun :
//   · fuseau connu  → l'heure locale du site, ce que 03 §34.2 demande ;
//   · fuseau inconnu → le même instant, en UTC, NOMMÉ comme tel. L'instant est
//     connu exactement ; c'est son cadre qui manque. Le taire ferait perdre la
//     seule information qui distingue deux sauvegardes d'une même clé USB
//     (constat A27, 2026-09-06) ; le rendre sans le nommer serait le mensonge
//     qu'on corrige ici. On le nomme.
// Le fuseau de l'appareil, lui, n'est utilisé dans AUCUN des deux cas.
// -----------------------------------------------------------------------------

/** Ce qui suit un horodatage rendu faute de connaître le fuseau de la mission. */
const MENTION_UTC = '(heure UTC)';

/**
 * Rend `'jj/mm/aaaa HH:mm'` au fuseau de la MISSION.
 *
 * `null` signifie « cet appareil ne connaît pas le fuseau de cette mission » —
 * jamais « prends celui de la machine ». Chaîne vide sur un instant illisible,
 * comme ses deux aînées, plutôt qu'« Invalid Date ».
 */
export function formaterDateHeureMission(iso: string, fuseauMission: string | null): string {
  if (fuseauMission !== null && fuseauMission !== '') {
    return formaterDateHeure(iso, fuseauMission);
  }
  const enUtc = formaterDateHeure(iso, 'UTC');
  return enUtc === '' ? '' : `${enUtc} ${MENTION_UTC}`;
}
