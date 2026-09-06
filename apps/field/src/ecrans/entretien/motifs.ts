// =============================================================================
// LES MOTIFS DE DÉSACTIVATION DE L'ÉCRAN D'ENTRETIEN — majeur **M1** de la
// recette novice A54 (2026-09-06), réserve de la porte P-C.
//
// ── LA RÈGLE QUE CE FICHIER SERT ────────────────────────────────────────────
// 03 §19.1 : « chaque étape verrouillée affiche PRÉCISÉMENT ce qui manque […],
// jamais un simple cadenas muet. » Elle vaut pour un GESTE comme pour un verrou.
// A54 a compté **trois boutons grisés muets** dans un parcours qui se veut
// « guidé strict » — et c'est un bouton grisé sans explication qui a arrêté le
// novice.
//
// ── ET LA LEÇON DE B3, QUI EST LA VRAIE RAISON DE CE FICHIER ────────────────
// Le motif du bouton « Photo » vivait dans son `aria-label` : un lecteur d'écran
// l'entendait, un auditeur voyant ne le lisait JAMAIS. Un motif doit donc être
// écrit DANS LE DOCUMENT, et le bouton grisé le DÉSIGNE (`aria-describedby`).
// D'où des identifiants, et non des phrases recopiées.
//
// ── POURQUOI UN MODULE À PART, ET PAS `ZoneQuestion` ────────────────────────
// `SaisieReponse` a besoin du même identifiant que `ZoneQuestion` — c'est la même
// zone et le même motif. Le prendre dans `ZoneQuestion` créerait un cycle
// d'imports entre deux composants dont l'un rend l'autre. Une feuille sans
// dépendance ferme la question, et garantit qu'une seule chaîne existe.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E44 (UX/UI 2026-2027 — tokens, police locale, grille §33).
// =============================================================================

/** Le motif « lecture seule » de la zone question — rendu par `ZoneQuestion`. */
export const ID_MOTIF_LECTURE_SEULE = 'axn-question-lecture-seule';

/** Le motif du « Précédent » inactif — rendu par `ZoneQuestion`. */
export const ID_MOTIF_PREMIERE_QUESTION = 'axn-question-premiere';

/** Ce que dit « Précédent » quand il n'a nulle part où remonter. */
export const MOTIF_PREMIERE_QUESTION =
  '« Précédent » est inactif : vous êtes à la première question du parcours.';

/**
 * Ce que dit la zone de notes quand l'écriture est refusée, à défaut d'un motif
 * plus précis fourni par l'écran (session validée, entretien non démarré…).
 */
export const MOTIF_NOTES_VERROUILLEES_DEFAUT =
  'Démarrez l’entretien pour prendre des notes : tant qu’il n’est pas démarré, rien ne s’écrit.';

/** Ce que dit « Garder cette note volante » tant que le champ est vide. */
export const MOTIF_NOTE_VOLANTE_VIDE =
  'Écrivez la note ci-dessus : le bouton s’active dès que le champ n’est plus vide.';

/** Ce que dit « Rattacher à cette question » quand la question n'a pas de réponse. */
export const MOTIF_RIEN_A_RATTACHER =
  'Répondez d’abord à la question courante pour pouvoir y rattacher une note volante.';
