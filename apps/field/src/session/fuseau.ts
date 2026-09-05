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
