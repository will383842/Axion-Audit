// =============================================================================
// OUTILLAGE INTERNE DES COMPOSANTS — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// Ces trois fonctions remplacent les trois micro-dépendances qu'un `shadcn init`
// aurait installées (`clsx`, `class-variance-authority`, `tailwind-merge`).
// Les ajouter est une escalade §3-1 (CLAUDE.md §3-1 : « ajouter une dépendance
// hors de la liste §1 »), et elles pèsent ici quinze lignes qu'on peut relire.
// =============================================================================

/**
 * Assemble des noms de classe en ignorant `false`, `null` et `undefined`.
 * Volontairement plus pauvre que `clsx` : ni objets, ni tableaux imbriqués.
 * Un composant qui aurait besoin de plus a une condition de trop.
 */
export function classes(...valeurs: readonly (string | false | null | undefined)[]): string {
  return valeurs.filter((v): v is string => typeof v === 'string' && v.length > 0).join(' ');
}

/**
 * Compose les `aria-describedby` d'un champ : l'aide ET l'erreur, quand elles
 * existent. Rendre `undefined` plutôt qu'une chaîne vide est délibéré — React
 * OMET alors l'attribut, là où `aria-describedby=""` fait pointer le lecteur
 * d'écran vers rien et rend le champ « décrit par un élément introuvable ».
 */
export function decritPar(
  ...identifiants: readonly (string | false | null | undefined)[]
): string | undefined {
  const retenus = identifiants.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return retenus.length > 0 ? retenus.join(' ') : undefined;
}

/**
 * Borne une valeur dans un intervalle. Utilisé par l'anneau de progression :
 * une progression calculée à 104 % (arrondis de comptage) doit dessiner un
 * anneau plein, jamais un anneau qui repart en arrière.
 */
export function borner(valeur: number, minimum: number, maximum: number): number {
  if (Number.isNaN(valeur)) return minimum;
  return Math.min(Math.max(valeur, minimum), maximum);
}
