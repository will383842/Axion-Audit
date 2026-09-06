// =============================================================================
// CE QUE L'ÉTAT DE SYNCHRONISATION DIT À L'ÉCRAN — une seule traduction
//
// ── POURQUOI CE MODULE EXISTE : LE BLOQUANT B6 ──────────────────────────────
// Recette novice n°1 (A54, 2026-09-06). Sur un seul et même écran, l'auditeur
// lisait DEUX pastilles qui se contredisaient :
//   · celle de l'en-tête disait « En attente de synchronisation », pilotée par
//     `navigator.onLine` SEUL — alors que le port de sync est inerte et qu'il
//     n'y avait, le plus souvent, rien à remonter ;
//   · celle de l'accueil disait « Hors ligne », déduite du NOMBRE d'opérations
//     en file — donc « hors ligne » dès que l'outbox est vide, quel que soit le
//     réseau.
// Les deux étaient fausses, et fausses en sens contraire. Or c'est la seule
// question que l'invariant 8 oblige l'auditeur à se poser chaque soir : « mes
// données sont-elles sorties de cet appareil ? » Elle recevait deux réponses
// opposées, et aucune n'était vraie.
//
// ── LA RÈGLE QUI EN SORT ────────────────────────────────────────────────────
// **Un fait, une source, une pastille.** L'état affiché ne se déduit ni du
// réseau ni du compte d'outbox : il vient du PORT DE SYNC, qui est le seul à
// savoir ce que l'application peut réellement faire. Le compte d'outbox reste
// affiché — c'est un nombre vrai, pas un état — et le réseau, avant L6a, ne
// change rien à la réponse : rien ne sort de l'appareil, en ligne ou non.
//
// La traduction ci-dessous vivait dans `EcranAujourdhui` (L5c). Elle est
// remontée ici pour que le cockpit et la coquille ne puissent plus diverger :
// deux traductions du même statut finissent toujours par dire deux choses, et
// c'est très exactement ce qui s'est produit.
//
// ── CE QUE CE MODULE NE TRANCHE PAS ─────────────────────────────────────────
// L'ÉNONCÉ que la pastille doit porter tant que L6a n'a pas livré est un doute
// de spec ouvert (rapport A54, §8-5 : la décision A01 du 2026-09-05 — « l'état
// de sync visible sur TOUS les écrans » — croise `LOT_L5.md` §3.6 — « jamais une
// pastille qui annonce plus qu'elle ne fait »). Il revient à Williams. Ce module
// tient la seule chose qui ne se discute pas : l'état affiché est celui du port,
// et il est le même partout. Changer le mot, le jour où il sera arbitré, est une
// ligne dans ce fichier — c'est aussi pour cela qu'il n'y en a qu'un.
//
// Traçabilité : E7 (remontée continue dès qu'il y a du réseau), E38 (sauvegarde
// terrain : sync + export), E6 (hors ligne total).
// =============================================================================
import type { EtatSync } from '@axion/ui';
import type { StatutSync } from '../local/port-sync.js';

/**
 * Le statut du port traduit vers celui de la pastille du design system.
 *
 * `indisponible` devient `hors-ligne` et NON `synchronise` : la pastille n'a pas
 * d'état « pas encore construit », et lui faire dire « synchronisé » serait le
 * mensonge que `LOT_L5.md` §3.6 interdit nommément. « Hors ligne » répond au
 * moins juste à la question qui compte — non, rien n'est sorti de l'appareil.
 */
export function versEtatPastille(statut: StatutSync): EtatSync {
  switch (statut) {
    case 'a_jour':
      return 'synchronise';
    case 'en_attente':
      return 'en-attente';
    case 'echec':
      return 'echec';
    case 'jamais_synchronisee':
    case 'indisponible':
      return 'hors-ligne';
  }
}

/**
 * Le statut de l'APPAREIL, à partir de celui de chacune de ses missions.
 *
 * La coquille n'a pas de mission courante : son en-tête est rendu sur les onze
 * écrans, dont ceux qui n'en désignent aucune. Elle affiche donc le statut le
 * plus DÉFAVORABLE, jamais une moyenne : une mission en échec parmi trois est un
 * échec pour l'auditeur, qui a des données quelque part et ne sait pas
 * lesquelles. Un appareil sans mission est `indisponible` et non `a_jour` —
 * « rien à dire » n'est pas « tout va bien ».
 */
const ORDRE_DEFAVORABLE: readonly StatutSync[] = [
  'echec',
  'en_attente',
  'jamais_synchronisee',
  'indisponible',
  'a_jour',
];

export function statutSyncAppareil(statuts: readonly StatutSync[]): StatutSync {
  for (const candidat of ORDRE_DEFAVORABLE) {
    if (statuts.includes(candidat)) return candidat;
  }
  return 'indisponible';
}

/**
 * La phrase que porte l'infobulle de la pastille quand la sync est indisponible.
 *
 * Elle dit ce que la pastille ne peut pas tenir en deux mots, et elle nomme le
 * geste qui protège réellement la journée. Elle reprend celle du port
 * (`port-sync.ts`) : c'est le même fait, et il ne doit pas s'énoncer de deux
 * façons — le défaut que B6 a coûté.
 */
export const MENTION_SYNC_INDISPONIBLE =
  'La synchronisation n’est pas encore disponible dans cette version. Vos données sont enregistrées sur cet appareil ; exportez une sauvegarde de secours en fin de journée.';
