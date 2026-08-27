// =============================================================================
// @axion/shared — schémas et types partagés API ↔ fronts (contrat 11 §3)
// « le front importe LES MÊMES schémas » : ce paquet est la source unique des
// contrats d'interface. Aucune logique métier n'y vit.
// =============================================================================
export * from './errors.js';
export * from './pagination.js';
export * from './temps.js';
export * from './env.js';
