// =============================================================================
// Configuration de l'API — validée par Zod AU DÉMARRAGE (11 §3, 06 §10.2).
// Un `undefined` silencieux sur un secret est une faille : le processus refuse de
// démarrer plutôt que de tourner à moitié configuré.
// Traçabilité : E33 (secrets hors code), E43.
// =============================================================================
import { chargerEnv, envApiSchema, type EnvApi } from '@axion/shared';

export const config: EnvApi = chargerEnv(envApiSchema, process.env);

/** Vrai en développement local uniquement — jamais sur staging ni en production. */
export const estDev = config.APP_ENV === 'dev';
