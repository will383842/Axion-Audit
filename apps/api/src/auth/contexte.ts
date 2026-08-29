// =============================================================================
// MARQUE `ContexteAdmin` — étanchéité financière, seconde ceinture (L2 §2.2-2).
//
// Invariant 3 : « données financières (`scoping_financials`) : routes admin
// EXCLUSIVEMENT ». Une règle de route seule ne suffit pas : `scoping_financials
// .scoping_estimate_id` est à la fois clé primaire ET clé étrangère, donc n'importe
// quel point d'entrée de cadrage est à UNE JOINTURE de la fuite.
//
// CE QUE CE FICHIER APPORTE, ET QUI NE DÉPEND D'AUCUNE VIGILANCE :
// le dépôt financier (lot L2/T5) exige de chacune de ses fonctions un argument
// `contexte: ContexteAdmin`. Ce type est MARQUÉ par un `unique symbol` : aucune
// valeur ordinaire ne l'habite, et le seul producteur est `creerContexteAdmin`,
// appelé exclusivement par le crochet d'autorisation, et seulement pour un rôle
// `admin`. Un appelant consultant ne peut donc pas COMPILER la jointure.
//
// LA RAISON DE LA MARQUE PLUTÔT QU'UN BOOLÉEN : un booléen se passe `true`. Il
// suffit d'un `estAdmin: true` écrit de bonne foi dans un service pour ouvrir la
// table. Une marque ne se fabrique pas ; elle se REÇOIT du seul endroit qui a lu le
// rôle en base.
// Traçabilité : E21 (auditeurs jamais d'accès aux montants — « RBAC routes +
// colonnes, testé »), E33 (sécurité).
// =============================================================================
import type { RoleUtilisateur } from '../db/schema.js';

/**
 * La marque. `Symbol` RÉEL (pas un `declare const`) et NON EXPORTÉ : c'est ce qui
 * permet de construire la valeur sans la moindre assertion de type — « aucun `any`,
 * aucune assertion » (note de conception L2 §2.1) — tout en la rendant impossible à
 * fabriquer hors de ce module, faute de pouvoir en nommer la clé.
 */
const marqueContexteAdmin: unique symbol = Symbol('axion.contexte_admin');

/**
 * Preuve, portée par le type, qu'un rôle `admin` a été vérifié EN BASE pour la
 * requête en cours. Se reçoit, ne se construit pas.
 */
export interface ContexteAdmin {
  readonly [marqueContexteAdmin]: true;
  /** L'administrateur qui consulte — `activity_log` doit tracer QUI a vu l'argent. */
  readonly utilisateurId: string;
}

/**
 * SEUL producteur de la marque. Appelé par le crochet d'autorisation (`politique.ts`)
 * et par personne d'autre : il exige le rôle relu en base, pas une intention.
 *
 * Rend `null` pour tout rôle non-`admin`. Un `null` se voit à la compilation chez
 * l'appelant (le dépôt exige un `ContexteAdmin`, pas un `ContexteAdmin | null`), là
 * où un `throw` aurait pu être avalé par un `try` malheureux.
 */
export function creerContexteAdmin(
  utilisateurId: string,
  role: RoleUtilisateur,
): ContexteAdmin | null {
  if (role !== 'admin') return null;
  return { [marqueContexteAdmin]: true, utilisateurId };
}
