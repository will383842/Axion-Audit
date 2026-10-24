// =============================================================================
// LE FORMAT DE `scores.csv` — 03 §36.3, lot S1. LA SOURCE DE VÉRITÉ DES TESTS.
//
// §36.3 dit : « `scores.csv` (bloc × unité + complétude + indicatif — si L8, sinon
// absent et signalé) ». Il ne dit PAS les colonnes : la grille `grille-rapport-20-3.ts`
// déclarait ces éléments `BRANCHEMENT_ABSENT` avec `porteur: null`, donc aucune colonne.
// Ce module les DÉCLARE (spécification de test, écrite avant le code). Quand le producteur
// livre, la grille bascule ses deux éléments (rubriques 2 et 5, table `unit_scores`) à
// `PORTE` avec `porteur: { fichier: 'scores.csv', colonnes: COLONNES_SCORES_CSV }`.
//
// Règles de forme (celles de tous les CSV de l'export, 11 §3 / §36.3) : UTF-8 avec BOM,
// séparateur `;`, fin de ligne CRLF, booléens `oui` / `non`, décimaux au POINT, cellule
// VIDE pour une valeur inconnue (un score non cotable est vide — jamais `0`).
//
// Lignes : d'abord la portée `mission` (un score d'entreprise par bloc actif, depuis
// `block_scores`), puis la portée `unite` (une ligne par unité × bloc, depuis
// `unit_scores`), les unités dans l'ORDRE d'`arbre.csv`, les blocs par `blocks.position`.
// `indicatif` d'une ligne `unite` = complétude < `seuil_completude_bloc` (`unit_scores`
// n'a pas de colonne `is_indicative` au 04, qu'on ne modifie pas).
// `calcule_le` : ISO 8601 UTC avec `Z` — c'est un fait du siège, pas d'un site audité.
// =============================================================================
export const COLONNES_SCORES_CSV = [
  'portee',
  'unite_id',
  'unite_nom',
  'bloc_code',
  'bloc_libelle',
  'score',
  'completude',
  'indicatif',
  'calcule_le',
] as const;

export const ENTETE_SCORES_CSV = COLONNES_SCORES_CSV.join(';');
