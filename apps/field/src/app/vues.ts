// =============================================================================
// REGISTRE DES VUES TERRAIN — **FICHIER PARTAGÉ, STRICTEMENT APPEND-ONLY**
//
// ── LA RÈGLE DE COLLISION, ÉNONCÉE PAR LA NOTE DE CONCEPTION ────────────────
// `LOT_L5.md` §1 : « Le seul fichier commun est `apps/field/src/app/vues.ts` —
// registre des vues, **strictement append-only, une ligne par écran**. Créé par
// L5a avec les vues du socle ; L5b puis L5c y ajoutent leurs lignes dans cet
// ordre de fusion. Aucun autre fichier n'est écrit par deux incréments. »
//
// **Ne réordonnez pas, ne renommez pas, ne supprimez pas.** Ajoutez à la fin.
// Un registre réordonné produit un conflit de fusion sur CHAQUE ligne, et une
// résolution manuelle de conflit sur un registre est exactement l'endroit où une
// vue disparaît sans que personne ne le voie.
//
// ── POURQUOI PAS DE ROUTEUR ─────────────────────────────────────────────────
// `react-router` n'est pas dans 11 §1, et une PWA verrouillée n'a ni URL
// partageable ni référencement. La règle « rouvrir l'app = revenir exactement à
// la question en cours » (03 §17.4) est servie par la PERSISTANCE
// (`meta.vueCourante`), jamais par une URL. Voir `navigation.ts`.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E13 (écran 3 zones,
// enregistrement continu).
// =============================================================================

/** Ce qu'une vue déclare d'elle-même. Aucune vue n'est déclarée ailleurs. */
export interface DefinitionVue {
  /** Titre affiché — français, vocabulaire métier, jamais de jargon (03 §17.4). */
  readonly titre: string;
  /**
   * La vue exige-t-elle un coffre OUVERT ?
   *
   * `false` pour le déverrouillage et le guidage de stockage : ce sont les deux
   * seules vues qui doivent s'afficher alors qu'aucune donnée n'est lisible.
   */
  readonly exigeCoffreOuvert: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ▼ AJOUTER À LA FIN — une ligne par écran, jamais au milieu. ▼
// ─────────────────────────────────────────────────────────────────────────────
export const VUES = {
  // ── L5a (socle) ────────────────────────────────────────────────────────────
  deverrouillage: { titre: 'Déverrouiller', exigeCoffreOuvert: false },
  stockage: { titre: 'Stockage de l’appareil', exigeCoffreOuvert: false },
  accueil: { titre: 'Aujourd’hui', exigeCoffreOuvert: true },
  // ── L5b (écran d'entretien) — A22 ─────────────────────────────────────────
  nouvelEntretien: { titre: 'Nouvel entretien', exigeCoffreOuvert: true },
  entretien: { titre: 'Entretien', exigeCoffreOuvert: true },
  // ── L5c (journée, agenda, sauvegarde) — A23 ──────────────────────────────
  // `aujourdhui` est le COCKPIT du 03 §34.2. Il ne remplace pas `accueil`, qui
  // est l'écran d'embarquement du socle L5a : les deux coexistent, et le choix
  // de celui qui porte `VUE_INITIALE` appartient à A20 à l'intégration — le
  // trancher ici reviendrait à retirer de la route l'écran d'un autre incrément
  // depuis un fichier déclaré append-only. Point remonté au rapport d'A23.
  aujourdhui: { titre: 'Aujourd’hui', exigeCoffreOuvert: true },
  agenda: { titre: 'Agenda', exigeCoffreOuvert: true },
  pilote: { titre: 'Où en est la mission', exigeCoffreOuvert: true },
  finDeJournee: { titre: 'Fin de journée', exigeCoffreOuvert: true },
  restauration: { titre: 'Restaurer une sauvegarde', exigeCoffreOuvert: true },
} as const satisfies Record<string, DefinitionVue>;

export type CodeVue = keyof typeof VUES;

/** La vue par laquelle l'application démarre quand rien n'est mémorisé. */
export const VUE_INITIALE: CodeVue = 'accueil';

/** Le code est-il celui d'une vue connue ? (relecture de `meta.vueCourante`) */
export function estCodeVue(valeur: unknown): valeur is CodeVue {
  return typeof valeur === 'string' && Object.hasOwn(VUES, valeur);
}
