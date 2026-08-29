// =============================================================================
// DÉPÔT FINANCIER — L'UNIQUE PORTE VERS `scoping_financials`. Lot L2, tâche T5.
//
// Invariant 3 : « données financières (`scoping_financials`) : routes ADMIN
// EXCLUSIVEMENT ». 03 §18.3 : « l'auditeur voit son avance/retard, son plan, ses
// dates — il ne voit JAMAIS le TJM, les montants, ni le devis. »
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER EST LE SEUL DU DÉPÔT À NOMMER `scopingFinancials`. C'EST UNE
// PROPRIÉTÉ VÉRIFIÉE, PAS UNE CONVENTION (ceinture 3, `tests/aide/
// etancheite-sources.ts`).
// ═══════════════════════════════════════════════════════════════════════════════
//
// ── LE PIÈGE QUE CE FICHIER EXISTE POUR FERMER, ET CE N'EST PAS LA TABLE ─────
// `scoping_financials.scoping_estimate_id` est clé primaire ET clé étrangère vers
// `scoping_estimates`. Le danger n'est donc pas la table interdite : c'est sa
// VOISINE. `scoping_estimates` porte `workload_days`, `team_size`,
// `calendar_days` — de la CHARGE, que l'auditeur a le droit de voir (§18.3) — et
// elle est à UNE JOINTURE des montants. Toute route de cadrage à venir (plan
// d'entretiens, avance/retard, simulateur) lira légitimement la voisine ; aucune
// n'a le droit de faire le pas de plus.
//
// C'est pourquoi la fonction ci-dessous exige un `ContexteAdmin` : la jointure ne
// se refuse pas à l'exécution, elle NE COMPILE PAS chez un appelant qui n'a pas
// reçu la marque du crochet d'autorisation (auth/contexte.ts). Un booléen se passe
// `true` de bonne foi ; une marque `unique symbol` ne se fabrique pas.
//
// ── CE QUE CE FICHIER NE FAIT PAS, ET QUI EST AILLEURS ───────────────────────
// Il ne journalise pas. `financier.consultation` (« qui a vu l'argent », 06 §10.5)
// est écrit par la ROUTE, après le succès : une lecture qui échoue n'est pas une
// consultation, et le dépôt n'a pas de contexte de requête (donc pas d'`ip`).
//
// Drizzle ne sert QU'AUX REQUÊTES TYPÉES (11 §2) : aucun DDL, aucun SQL concaténé.
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E19, E33.
// =============================================================================
import { eq } from 'drizzle-orm';
import { tauxJournaliersSchema } from '@axion/shared';
import type { ContexteAdmin } from '../../auth/contexte.js';
import { db } from '../../db.js';
import { scopingFinancials } from '../../db/schema.js';

/**
 * Une ligne financière, en `camelCase` (11 §3) et sans conversion de montant.
 *
 * `travelCosts` et `totalAmount` restent des CHAÎNES : ce sont des `NUMERIC` que
 * `node-postgres` rend en décimal exact. Les convertir en `number` ici perdrait de
 * la précision sur un devis signé, et le ferait silencieusement.
 */
export interface LigneFinanciere {
  readonly scopingEstimateId: string;
  readonly dailyRates: Readonly<Record<string, number>> | null;
  readonly travelCosts: string | null;
  readonly totalAmount: string | null;
  readonly currency: string;
  readonly updatedBy: string | null;
  readonly updatedAt: Date;
}

/**
 * Lit les données financières d'un cadrage. Rend `null` si le cadrage n'en a pas.
 *
 * ⚠ `contexte` n'est LU PAR AUCUNE LIGNE DE CETTE FONCTION, et ce n'est pas un
 * oubli : sa seule raison d'être est d'exister DANS LA SIGNATURE. Il rend l'appel
 * inexprimable pour qui n'a pas reçu la marque — c'est une garantie de
 * COMPILATION, pas une vérification d'exécution. Le lint le tolère parce qu'un
 * paramètre préfixé `_` est exempté de `noUnusedParameters` ; le nom complet est
 * conservé dans la documentation pour que la revue croisée le voie.
 *
 * Le `SELECT` est ÉNUMÉRÉ colonne par colonne plutôt qu'implicite : `select()` sans
 * projection ramènerait toute colonne AJOUTÉE DEMAIN au fichier 04 sans que
 * personne ne le décide. Sur cette table-ci, « ramener une colonne de plus » est
 * exactement le défaut qu'on cherche à rendre impossible.
 */
export async function lireFinanciersDuCadrage(
  _contexte: ContexteAdmin,
  cadrageId: string,
): Promise<LigneFinanciere | null> {
  const lignes = await db
    .select({
      scopingEstimateId: scopingFinancials.scopingEstimateId,
      dailyRates: scopingFinancials.dailyRates,
      travelCosts: scopingFinancials.travelCosts,
      totalAmount: scopingFinancials.totalAmount,
      currency: scopingFinancials.currency,
      updatedBy: scopingFinancials.updatedBy,
      updatedAt: scopingFinancials.updatedAt,
    })
    .from(scopingFinancials)
    .where(eq(scopingFinancials.scopingEstimateId, cadrageId))
    .limit(1);

  const ligne = lignes[0];
  if (ligne === undefined) return null;

  return {
    scopingEstimateId: ligne.scopingEstimateId,
    // `daily_rates` est du JSONB : Drizzle le rend en `unknown`, et un `as` serait
    // précisément le geste que la conception proscrit (« aucun `any`, aucune
    // assertion »). On le fait donc VALIDER par le même schéma que celui du
    // contrat d'API — une valeur informe en base devient `null` plutôt qu'une
    // forme surprise servie à la console.
    dailyRates: normaliserTaux(ligne.dailyRates),
    travelCosts: ligne.travelCosts,
    totalAmount: ligne.totalAmount,
    currency: ligne.currency,
    updatedBy: ligne.updatedBy,
    updatedAt: ligne.updatedAt,
  };
}

/** Un JSONB de forme inattendue devient `null` : jamais une forme non validée. */
function normaliserTaux(valeur: unknown): Readonly<Record<string, number>> | null {
  if (valeur === null || valeur === undefined) return null;
  const analyse = tauxJournaliersSchema.safeParse(valeur);
  return analyse.success ? analyse.data : null;
}
