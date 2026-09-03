// =============================================================================
// @axion/shared — schémas et types partagés API ↔ fronts (contrat 11 §3)
// « le front importe LES MÊMES schémas » : ce paquet est la source unique des
// contrats d'interface. Aucune logique métier n'y vit.
// =============================================================================
export * from './errors.js';
export * from './auth.js';
export * from './banque-questions.js';
export * from './pagination.js';
export * from './temps.js';
export * from './env.js';
export * from './redaction.js';
// Les deux vocabulaires de motifs viennent AVANT le journal : c'est une feuille du
// graphe (elle n'importe rien), et `journal.ts` la consomme (arbitrage Williams du
// 2026-09-02, « motif codé »).
export * from './motifs.js';
export * from './journal.js';
export * from './scoping.js';
export * from './users.js';
export * from './companies.js';
export * from './missions.js';
export * from './org-units.js';
export * from './questionnaire.js';
export * from './plan-entretiens.js';
export * from './assignments.js';
export * from './sync.js';
