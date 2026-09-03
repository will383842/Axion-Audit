// =============================================================================
// AFFICHAGE DES HORODATAGES AU FUSEAU DE MISSION — 03 §22.2, invariant 5
//
// UTC en base et en API ; le fuseau de la mission (`missions.timezone`)
// n'intervient qu'ICI, à l'affichage. Aucun `new Date()` : on formate un nombre
// d'époque, ce qui laisse `horloge.ts` seul maître du « maintenant ».
// Traçabilité : E13 (écran 3 zones, enregistrement continu — l’indicateur
// « Enregistré à HH:mm » se lit au fuseau de la mission, 03 §22.2).
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
