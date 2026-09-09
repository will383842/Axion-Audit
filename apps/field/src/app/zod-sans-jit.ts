// =============================================================================
// PREMIER IMPORT DE `main.tsx` — et ce rang est tout son contrat.
//
// Zod sonde `eval` (`new Function("")`) à la CONSTRUCTION du premier `z.object()`,
// et met le résultat en cache pour toujours. Sous la CSP servie (06 §10.2,
// `script-src` sans `'unsafe-eval'`), cette sonde est une `securitypolicyviolation`
// à chaque chargement. `desactiverJitZod()` la supprime, mais SEULEMENT si elle
// s'exécute avant tout schéma — donc avant tout import de `@axion/shared`, dont
// l'index construit des schémas à la portée du module. Un module évalué en premier
// est le seul endroit qu'ESM offre pour cela : le corps de `main.tsx` vient APRÈS
// tous ses imports. Arbitrage A01, `DECISIONS.md` du 2026-09-09 (« Zod jitless »).
//
// Ce module n'importe QUE le sous-chemin feuille ; importer `@axion/shared` ici
// rendrait l'appel inopérant en silence. La garde d'A26 (`e2e/en-tetes-servis`,
// « aucune violation CSP ») rougit si ce module recule dans l'ordre des imports.
// Traçabilité : E33 (sécurité / RGPD).
// =============================================================================
import { desactiverJitZod } from '@axion/shared/zod-sans-jit';

desactiverJitZod();
