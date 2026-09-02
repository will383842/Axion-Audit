// =============================================================================
// REGISTRE DES SEPT ESPACES DE LA CONSOLE (03 §22.3) — **APPEND-ONLY**.
//
// Les sept espaces existent dès L7a dans la barre latérale, mais SEULS ceux que
// le lot ouvert livre sont navigables. Les autres sont affichés GRISÉS avec leur
// échéance (« Phase 2 ») : un utilisateur voit la carte entière de l'outil, et ne
// tombe jamais sur une page blanche. Un lien vers un écran qui n'existe pas
// serait un mensonge d'interface ; un espace caché serait une carte incomplète.
//
// Matrice §34.1, décision V1 : **la console est ADMIN SEUL**. Aucun espace ne
// porte donc de rôle ici — le serveur refuse tout autre rôle, et c'est A36 qui
// vérifie « ce que voit un consultant » (rien) contre « ce que voit un admin ».
//
// RÈGLE DE COLLISION (`LOT_L7.md` §1) : ce fichier est le SEUL que L7a, L7b et
// L7c écrivent tous. On y change une valeur de `livraison` quand l'espace
// s'ouvre ; on n'y réordonne rien.
//
// Traçabilité : E22 (console de pilotage 7 espaces).
// =============================================================================

/** Quel incrément rend l'espace navigable. `phase_2` = hors noyau strict (05 §24.5). */
export type LivraisonEspace = 'L7a' | 'L7b' | 'L7c' | 'differable' | 'phase_2';

export interface DefinitionEspace {
  /** Numéro §22.3, affiché : l'ordre de la spécification est l'ordre de la barre. */
  readonly numero: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly titre: string;
  /** Chemin sous `/hq/`. */
  readonly chemin: string;
  readonly livraison: LivraisonEspace;
}

export const ESPACES = {
  tour_de_controle: { numero: 1, titre: 'Tour de contrôle', chemin: '/', livraison: 'L7a' },
  /** Son point d'entrée est le portefeuille (liste dense) ; le pilotage est par mission. */
  pilotage_mission: {
    numero: 2,
    titre: 'Pilotage mission — portefeuille',
    chemin: '/missions',
    livraison: 'L7a',
  },
  equipe: {
    numero: 3,
    titre: 'Équipe & plan de charge',
    chemin: '/equipe',
    livraison: 'phase_2',
  },
  /** §22.3 dit « Chiffrage & devis » ; le nom de M9 (§18.1) est retenu tant que
   *  l'espace est fermé : aucun mot du vocabulaire financier ne doit apparaître
   *  sur un écran de L7a, même dans une entrée grisée (A36, étanchéité). */
  chiffrage: {
    numero: 4,
    titre: 'Cadrage & chiffrage',
    chemin: '/chiffrage',
    livraison: 'phase_2',
  },
  contenu: { numero: 5, titre: 'Contenu', chemin: '/contenu', livraison: 'phase_2' },
  analyse: { numero: 6, titre: 'Analyse & rapports', chemin: '/analyse', livraison: 'L7c' },
  administration: {
    numero: 7,
    titre: 'Administration',
    chemin: '/administration',
    livraison: 'differable',
  },
} as const satisfies Record<string, DefinitionEspace>;

export type CodeEspace = keyof typeof ESPACES;

/** Les espaces dans l'ordre §22.3. */
export const CODES_ESPACES = (Object.keys(ESPACES) as CodeEspace[]).sort(
  (a, b) => ESPACES[a].numero - ESPACES[b].numero,
);

/** Un espace est navigable si son incrément est livré. */
const LIVRAISONS_OUVERTES: ReadonlySet<LivraisonEspace> = new Set<LivraisonEspace>(['L7a']);

export function espaceOuvert(code: CodeEspace): boolean {
  return LIVRAISONS_OUVERTES.has(ESPACES[code].livraison);
}

/** Mention affichée à côté d'un espace fermé — en français, jamais un code de lot seul. */
export function mentionLivraison(livraison: LivraisonEspace): string {
  switch (livraison) {
    case 'L7a':
      return '';
    case 'L7b':
    case 'L7c':
      return 'bientôt';
    case 'differable':
      return 'différé';
    case 'phase_2':
      return 'Phase 2';
  }
}
