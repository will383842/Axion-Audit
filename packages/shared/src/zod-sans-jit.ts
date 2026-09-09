// =============================================================================
// ZOD SANS COMPILATION À LA VOLÉE — pour les DEUX FRONTS, et pour eux seuls.
//
// Zod 4 sonde au démarrage si `eval` est permis (`allowsEval`, `v4/core/util.js`) :
// il exécute `new Function("")` dans un `try`. Sous la CSP servie par Caddy
// (`script-src` sans `'unsafe-eval'`, 06 §10.2), le navigateur AVALE l'exception
// mais RAPPORTE une `securitypolicyviolation` — à chaque chargement, sur les deux
// fronts. Un signal qui se déclenche toujours n'est plus un signal : quelqu'un
// finirait par ajouter `'unsafe-eval'` pour faire taire la console. Remède documenté
// par Zod et arbitré par A01 (`DECISIONS.md` du 2026-09-09, « Zod jitless »,
// étage 1) : `z.config({ jitless: true })`. Le drapeau ne pilote QUE la sonde et le
// chemin compilé — AUCUN résultat de validation ne change.
//
// ── POURQUOI CE FICHIER EST UNE FEUILLE, ET UN SOUS-CHEMIN D'EXPORT ─────────────
// `z.config()` est GLOBAL au processus. Posé dans `errors.ts` avec la locale, il
// priverait aussi de JIT `apps/api` et `apps/worker`, qui n'ont ni navigateur ni
// CSP : c'est donc une fonction NOMMÉE, que seuls les fronts appellent.
// Mais nommer ne suffit pas, et c'est la contrainte VÉRIFIÉE dans le paquet épinglé
// (4.4.3) : `allowsEval.value` est lu dans l'initialiseur de `$ZodObjectJIT`
// (`v4/core/schemas.js`), c'est-à-dire à la CONSTRUCTION du premier `z.object()`,
// pas au premier `parse` — et le résultat est mis en cache pour toujours. Or
// `errors.ts` construit `errorDetailSchema` à la portée du module : importer
// `@axion/shared` (l'index) tire la sonde AVANT qu'un appelant puisse agir. D'où :
//   · ce module n'importe QUE `zod` — il ne construit aucun schéma ;
//   · il est exposé par `@axion/shared/zod-sans-jit` (carte `exports` du paquet),
//     jamais par l'index, pour qu'on ne puisse pas l'atteindre par un chemin qui
//     évalue `errors.ts` en passant ;
//   · chaque front l'appelle depuis le PREMIER import de son `main.tsx`
//     (`apps/field/src/app/zod-sans-jit.ts`, `apps/hq/src/app/zod-sans-jit.ts`).
// Une règle, un endroit, deux appelants ; le test navigateur d'A26
// (`e2e/en-tetes-servis.e2e.ts`) rougit si un appelant manque ou recule.
//
// `config()` fait un `Object.assign` : la locale française posée par `errors.ts`
// (`appliquerLocaleFrancaiseZod`) n'est ni écrasée ni contournée — les deux se
// composent, quel que soit l'ordre.
//
// Coût : les fronts perdent la voie compilée des objets — SOUS LA CSP, ILS NE
// L'AVAIENT DÉJÀ PAS (la sonde échoue, `allowsEval` vaut `false`). A28 mesure le
// p95 < 100 ms avant signature (condition de l'arbitrage).
// Traçabilité : E33 (sécurité / RGPD).
// =============================================================================
import { z } from 'zod';

/**
 * Désactive la compilation à la volée (JIT) de Zod pour le processus courant :
 * plus de sonde `new Function`, donc plus de violation CSP au chargement.
 *
 * Idempotent, et sur l'ÉTAT GLOBAL plutôt que sur un drapeau de module : deux
 * copies de `zod` dans un même bundle partagent `globalThis.__zod_globalConfig`.
 *
 * ⚠ À appeler AVANT LA CONSTRUCTION DU PREMIER SCHÉMA `z.object()` — donc depuis
 * un module évalué avant tout import de `@axion/shared`. Voir l'en-tête.
 */
export function desactiverJitZod(): void {
  if (z.config().jitless === true) return;
  z.config({ jitless: true });
}
