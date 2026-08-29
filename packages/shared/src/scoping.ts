// =============================================================================
// CONTRAT D'API DU CADRAGE FINANCIER — lot L2, tâche T5.
//
// Invariant 3 : « données financières (`scoping_financials`) : routes ADMIN
// EXCLUSIVEMENT ». 03 §18.3, verbatim : « l'auditeur voit son avance/retard, son
// plan, ses dates — il ne voit JAMAIS le TJM, les montants, ni le devis. »
//
// ── POURQUOI CE FICHIER EST DANS `packages/shared` ALORS QU'IL DÉCRIT UNE ─────
// ── DONNÉE QUE LA PWA TERRAIN NE DOIT JAMAIS VOIR ────────────────────────────
// Ce paquet part dans un NAVIGATEUR — celui de la console (`apps/hq`), admin seul
// en V1 (03 §34.1). Ce qui y vit est un CONTRAT DE FORME, jamais une valeur : il
// dit quelles clés porte la réponse, il ne porte aucun montant. Le publier ici est
// même ce qui rend la ceinture n° 5 possible (voir plus bas) : la réponse est
// REPASSÉE par ce schéma avant l'envoi (`apps/api/src/http/zod.ts`), donc les
// champs financiers ne peuvent atteindre le réseau QUE par une route qui déclare
// CE schéma-ci en sortie — et il n'y en a qu'une, admin.
//
// ── LES CINQ CEINTURES DE L'ÉTANCHÉITÉ, ET LAQUELLE EST ICI ──────────────────
//  1. ROUTE      — `acces: { type: 'roles', roles: ['admin'], financier: true }`.
//  2. TYPE       — le dépôt exige `ContexteAdmin` (marque `unique symbol`) :
//                  un appelant consultant ne COMPILE pas la lecture.
//  3. SOURCES    — balayage : `scopingFinancials` n'est nommé que par le dépôt.
//  4. EXÉCUTION  — balayage sentinelle sur le registre `onRoute` (toutes les
//                  routes QUI EXISTENT, pas celles auxquelles on a pensé).
//  5. SORTIE     — CE FICHIER. Le sérialiseur Zod retire tout champ non déclaré :
//                  un montant ajouté par mégarde à une réponse NON financière est
//                  supprimé avant l'envoi, sans que personne n'ait à y penser.
//     ⚠ La ceinture 5 ne protège QUE les routes qui déclarent `schema.response`.
//     Une route sans schéma de sortie n'est pas filtrée du tout — c'est la dette
//     datée du 2026-08-29 (« la déclaration `schema:` doit-elle être OBLIGATOIRE
//     au démarrage ? », option 3 : norme d'abord, crochet ensuite).
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E33 (sécurité), E43.
// =============================================================================
import { z } from 'zod';
import { isoUtcSchema } from './temps.js';

/**
 * Un montant, transporté en CHAÎNE et non en `number`.
 *
 * Les colonnes du fichier 04 sont des `NUMERIC` — une décimale EXACTE, sans limite
 * de précision. `node-postgres` les rend en chaîne pour cette raison même, et les
 * convertir en flottant IEEE-754 introduirait une erreur d'arrondi sur un devis
 * signé (`0.1 + 0.2`). On transporte donc la représentation décimale telle quelle ;
 * c'est la console qui formate, avec la devise portée par la même réponse.
 *
 * Le motif refuse tout ce qui n'est pas un décimal signé : il ferme la porte à une
 * expression, à un `NaN` sérialisé, ou à une chaîne libre qui remonterait d'un
 * pilote de base mal configuré.
 */
export const montantDecimalSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Montant décimal attendu')
  .describe('Montant décimal exact (NUMERIC), transporté en chaîne — jamais un flottant');

/**
 * Les taux journaliers, tels que les porte `scoping_financials.daily_rates`
 * (JSONB, forme libre au fichier 04).
 *
 * Fermé ici à `{ <profil>: <taux> }` — un JSONB dont la forme n'est pas déclarée
 * traverserait le sérialiseur intact, et la ceinture 5 ne filtrerait plus rien à
 * l'intérieur. Un enregistrement de nombres est la forme la plus étroite qui
 * couvre l'usage décrit au 03 §18.1 (un TJM par profil d'intervenant).
 */
export const tauxJournaliersSchema = z.record(z.string(), z.number());

/** Le paramètre d'URL de `GET /v1/scoping/:id/financials`. */
export const scopingFinancialsParamsSchema = z.strictObject({
  id: z.uuid(),
});

export type ScopingFinancialsParams = z.infer<typeof scopingFinancialsParamsSchema>;

/**
 * LA SEULE FORME SOUS LAQUELLE UN MONTANT A LE DROIT DE SORTIR DE L'API.
 *
 * `strictObject` : une clé non déclarée est REFUSÉE, pas ignorée. Sur une réponse,
 * la différence compte — un champ ajouté au dépôt sans l'être ici ferait échouer
 * la sérialisation (500 + trace `error`), au lieu de partir silencieusement.
 */
export const scopingFinancialsResponseSchema = z.strictObject({
  scopingEstimateId: z.uuid(),
  dailyRates: tauxJournaliersSchema.nullable(),
  travelCosts: montantDecimalSchema.nullable(),
  totalAmount: montantDecimalSchema.nullable(),
  /** `TEXT NOT NULL DEFAULT 'EUR'` au fichier 04 — code ISO 4217, 3 lettres. */
  currency: z.string().min(1).max(8),
  updatedBy: z.uuid().nullable(),
  updatedAt: isoUtcSchema,
});

export type ScopingFinancialsResponse = z.infer<typeof scopingFinancialsResponseSchema>;

/**
 * LES NOMS DES CHAMPS FINANCIERS — la liste que les garde-fous interrogent.
 *
 * Elle vit ICI, à côté du contrat, et non dans le code du balayage : un champ
 * financier ajouté demain à la réponse se déclare une fois, et les ceintures 3 et 4
 * le surveillent d'elles-mêmes. Une liste recopiée dans le garde-fou aurait dérivé
 * du schéma au premier ajout — et un garde-fou qui surveille l'ancienne liste est
 * un garde-fou vert qui ne protège plus rien.
 *
 * Les deux graphies, parce que les deux existent : `snake_case` en base et dans le
 * SQL brut, `camelCase` en TypeScript (11 §3).
 *
 * ⚠ JUMELLE CONNUE, ET NON RÉSOLUE ICI : `packages/shared/src/redaction.ts` porte
 * un `CHAMPS_FINANCIERS` privé (snake_case seul) qui sert à MASQUER ces champs dans
 * pino. Deux listes du même concept, donc deux occasions de diverger. La
 * consolidation (redaction important cette liste-ci) touche un fichier d'un autre
 * lot : elle est PROPOSÉE au rapport de T5, pas faite unilatéralement. En
 * attendant, la divergence est bornée — la liste ci-dessous est un SUR-ENSEMBLE de
 * celle de redaction.
 */
export const CHAMPS_FINANCIERS_SURVEILLES = [
  'daily_rates',
  'dailyRates',
  'travel_costs',
  'travelCosts',
  'total_amount',
  'totalAmount',
] as const;

/**
 * La table interdite, dans ses deux graphies.
 *
 * `currency` n'y est PAS, et c'est délibéré : le mot est trop banal (une devise
 * d'affichage, un libellé) pour qu'un garde-fou de forme le distingue, et il ne
 * porte AUCUN montant. Le protéger aurait produit des faux positifs, c'est-à-dire
 * un garde-fou qu'on finit par désarmer.
 */
export const TABLE_FINANCIERE = ['scoping_financials', 'scopingFinancials'] as const;
