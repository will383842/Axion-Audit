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

import { fuseauIanaSchema } from '@axion/shared';

// ─────────────────────────────────────────────────────────────────────────────
// UN IDENTIFIANT DE FUSEAU INCONNU NE DOIT PAS FAIRE TOMBER L’ÉCRAN — R3 (A29)
//
// `Intl.DateTimeFormat` LÈVE une `RangeError` sur un `timeZone` qu’il ne connaît
// pas (« Europe/Pariss », « UTC+2 »). Or `missions.timezone` n’est contraint
// qu’en FORME dans la base locale (`local/formes.ts` : `z.string()`, comme le
// `timezone TEXT` du 04) et arrive d’un `.axionbackup` produit par un AUTRE
// appareil : la valeur n’est pas de confiance à l’affichage. Une `RangeError`
// pendant un rendu React détruit l’écran — y compris l’écran de RESTAURATION,
// c’est-à-dire le chemin de secours lui-même (invariant 8).
//
// La console se protège déjà exactement ainsi (`apps/hq/src/format/dates.ts` :
// `fuseauValide` + repli UTC). Le terrain — celui qui n’a ni réseau ni support —
// n’avait pas cette garde : on ferme l’asymétrie, avec le validateur qui existe
// déjà et qui MÉMOÏSE son verdict (`fuseauIanaSchema`, packages/shared).
// ─────────────────────────────────────────────────────────────────────────────

/** Le fuseau est-il connu du moteur ? Chaîne vide et graphies inventées : non. */
function fuseauConnu(fuseau: string): boolean {
  return fuseauIanaSchema.safeParse(fuseau).success;
}

/**
 * Le `timeZone` réellement passé à `Intl` par les deux fonctions ci-dessous.
 *
 * `undefined` reste `undefined` : c’est le sens DOCUMENTÉ de ces deux aînées
 * (« aperçu neutre au fuseau de l’appareil »), et c’est précisément ce que
 * l’incrément suivant retirera en routant leurs appelants vers
 * `formaterDateHeureMission`. Le corriger ici anticiperait un arbitrage déjà pris
 * ailleurs. Une graphie INCONNUE, elle, ne peut pas rester : entre lever et
 * rendre l’instant en UTC, seul le second laisse l’écran debout. Ces deux-là
 * n’ont pas de place pour la mention « (heure UTC) » — c’est `formaterDateHeureMission`
 * qui la porte, et c’est la raison de plus de l’adopter partout.
 */
function fuseauApplicable(fuseau: string | undefined): string | undefined {
  if (fuseau === undefined) return undefined;
  return fuseauConnu(fuseau) ? fuseau : 'UTC';
}

/** Rend `'HH:mm'` dans le fuseau donné (celui de l'appareil si `undefined`). */
export function formaterHeure(iso: string, fuseau: string | undefined): string {
  const epoque = Date.parse(iso);
  if (Number.isNaN(epoque)) return '';
  const applicable = fuseauApplicable(fuseau);
  return new Intl.DateTimeFormat('fr-FR', {
    ...(applicable === undefined ? {} : { timeZone: applicable }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(epoque);
}

/** Rend `'jj/mm/aaaa HH:mm'` dans le fuseau donné. */
export function formaterDateHeure(iso: string, fuseau: string | undefined): string {
  const epoque = Date.parse(iso);
  if (Number.isNaN(epoque)) return '';
  const applicable = fuseauApplicable(fuseau);
  return new Intl.DateTimeFormat('fr-FR', {
    ...(applicable === undefined ? {} : { timeZone: applicable }),
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
 *
 * UNE GRAPHIE QUE LE MOTEUR NE RECONNAÎT PAS VAUT `null` (R3, A29) : « UTC+2 » ou
 * « Europe/Pariss » arrivent d’un `.axionbackup` écrit par un autre appareil, sur
 * une colonne `timezone TEXT` (04) que rien ne contraint en IANA. Les traiter
 * comme un fuseau ferait LEVER `Intl` au milieu d’un rendu — donc tomber l’écran
 * de restauration. Les traiter comme un fuseau inconnu dit la vérité : l’instant
 * est exact, son cadre n’est pas exploitable, et la mention le nomme.
 */
export function formaterDateHeureMission(iso: string, fuseauMission: string | null): string {
  if (fuseauMission !== null && fuseauConnu(fuseauMission)) {
    return formaterDateHeure(iso, fuseauMission);
  }
  const enUtc = formaterDateHeure(iso, 'UTC');
  return enUtc === '' ? '' : `${enUtc} ${MENTION_UTC}`;
}
