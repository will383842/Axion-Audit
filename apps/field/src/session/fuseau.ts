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
//
// ── LE FUSEAU EST REQUIS, ET IL N'A QU'UN REPLI : L'UTC NOMMÉ ────────────────
// Arbitrage A01 du 2026-09-08 (`DECISIONS.md`, « le fuseau redevient-il
// obligatoire ? », option b) : `fuseau: string | null`, REQUIS. Le chemin
// `undefined → fuseau de l'appareil` n'existe plus, ni dans le type ni dans le
// code — c'était une CAPACITÉ offerte par la signature, et l'on ferme la
// capacité, pas ses usages. Un écran connaît le fuseau de la mission, ou il ne
// le connaît pas ; il ne l'emprunte jamais à la machine.
//
// Les deux cas, et aucun autre :
//   · fuseau connu  → l'heure locale du site, ce que 03 §34.2 demande, nue ;
//   · fuseau inconnu (`null`, chaîne vide, graphie que le moteur ignore — R3,
//     A29) → le même instant en UTC, NOMMÉ comme tel. L'instant est exact ; c'est
//     son cadre qui manque. Le taire ferait perdre ce qui distingue deux
//     sauvegardes d'une même clé USB (constat A27, 2026-09-06) ; le rendre sans
//     le nommer serait le mensonge qu'on corrige (invariants 5 et 7).
//
// POURQUOI LA MENTION VIT DANS LES DEUX AÎNÉES, ET PLUS SEULEMENT DANS
// `formaterDateHeureMission` : tant qu'une fonction EXPORTÉE rendait l'UTC nu
// sur un fuseau inconnu, un appelant pouvait l'atteindre et le compilateur
// l'approuvait — la même forme de faute que `undefined`, à un cran près. A01
// dit « l'UTC nommé pour UNIQUE repli » : c'est donc le repli de la SIGNATURE,
// pas d'une enveloppe qu'on peut contourner. La distinction « primitive nue /
// enveloppe nommée » n'a plus d'objet ; `formaterDateHeureMission` reste
// exportée sous son nom pour ses appelants et sa garde (`fuseau.test.ts`), et
// c'est la même fonction. Pour un fuseau CONNU — le cas de tous les écrans une
// fois la mission lue —, rien ne change : `'HH:mm'` et `'jj/mm/aaaa HH:mm'`.
// =============================================================================

import { fuseauIanaSchema } from '@axion/shared';

/** Ce qui suit un horodatage rendu faute de connaître le fuseau de la mission. */
const MENTION_UTC = '(heure UTC)';

/**
 * Le fuseau est-il connu du moteur ? Chaîne vide et graphies inventées : non.
 *
 * `Intl.DateTimeFormat` LÈVE une `RangeError` sur un `timeZone` qu’il ne connaît
 * pas (« Europe/Pariss », « UTC+2 »). Or `missions.timezone` n’est contraint
 * qu’en FORME dans la base locale (`local/formes.ts` : `z.string()`, comme le
 * `timezone TEXT` du 04) et arrive d’un `.axionbackup` produit par un AUTRE
 * appareil : la valeur n’est pas de confiance à l’affichage. Une `RangeError`
 * pendant un rendu React détruit l’écran — y compris l’écran de RESTAURATION,
 * c’est-à-dire le chemin de secours lui-même (invariant 8). Le validateur de
 * `packages/shared` MÉMOÏSE son verdict ; la console se protège de même
 * (`apps/hq/src/format/dates.ts`).
 */
function fuseauConnu(fuseau: string): boolean {
  return fuseauIanaSchema.safeParse(fuseau).success;
}

/**
 * Rend un instant au fuseau de la mission s'il est connu, sinon en UTC nommé.
 * Chaîne vide sur un instant illisible plutôt qu'« Invalid Date » — et sans
 * mention orpheline : « (heure UTC) » seul dirait qu'on sait quelque chose
 * qu'on ne sait pas.
 */
function rendre(
  iso: string,
  fuseau: string | null,
  forme: Readonly<Intl.DateTimeFormatOptions>,
): string {
  const epoque = Date.parse(iso);
  if (Number.isNaN(epoque)) return '';
  const connu = fuseau !== null && fuseauConnu(fuseau);
  const rendu = new Intl.DateTimeFormat('fr-FR', {
    timeZone: connu ? fuseau : 'UTC',
    ...forme,
  }).format(epoque);
  return connu ? rendu : `${rendu} ${MENTION_UTC}`;
}

const FORME_HEURE: Readonly<Intl.DateTimeFormatOptions> = { hour: '2-digit', minute: '2-digit' };
const FORME_DATE_HEURE: Readonly<Intl.DateTimeFormatOptions> = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/**
 * Rend `'HH:mm'` au fuseau de la MISSION.
 *
 * `null` signifie « cet appareil ne connaît pas le fuseau de cette mission » —
 * jamais « prends celui de la machine » : l'heure est alors rendue en UTC et
 * suivie de « (heure UTC) ».
 */
export function formaterHeure(iso: string, fuseau: string | null): string {
  return rendre(iso, fuseau, FORME_HEURE);
}

/** Rend `'jj/mm/aaaa HH:mm'` au fuseau de la MISSION ; même contrat que `formaterHeure`. */
export function formaterDateHeure(iso: string, fuseau: string | null): string {
  return rendre(iso, fuseau, FORME_DATE_HEURE);
}

/**
 * Le nom né en L5d, quand la mention n'était portée que par cette enveloppe.
 * Depuis l'arbitrage A01 du 2026-09-08, `formaterDateHeure` porte elle-même le
 * repli nommé : c'est la MÊME fonction, conservée sous ce nom pour ses deux
 * appelants et sa garde (`fuseau.test.ts`), qui en éprouve le choix par mutation.
 */
export function formaterDateHeureMission(iso: string, fuseauMission: string | null): string {
  return formaterDateHeure(iso, fuseauMission);
}
