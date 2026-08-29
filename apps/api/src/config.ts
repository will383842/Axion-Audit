// =============================================================================
// Configuration de l'API — validée par Zod AU DÉMARRAGE (11 §3, 06 §10.2).
// Un `undefined` silencieux sur un secret est une faille : le processus refuse de
// démarrer plutôt que de tourner à moitié configuré.
// Traçabilité : E33 (sécurité : secrets hors code), E43.
// =============================================================================
import { z } from 'zod';
import { chargerEnv, envApiSchema, type EnvApi } from '@axion/shared';

export const config: EnvApi = chargerEnv(envApiSchema, process.env);

/** Vrai en développement local uniquement — jamais sur staging ni en production. */
export const estDev = config.APP_ENV === 'dev';

// -----------------------------------------------------------------------------
// COORDONNÉES MINIO — nécessaires à la sonde de préparation (dependances.ts).
//
// POURQUOI ICI ET PAS DANS `envApiSchema` : ce schéma vit dans `packages/shared`,
// hors du périmètre de cet incrément. Les variables MINIO_ENDPOINT / MINIO_PORT /
// MINIO_USE_SSL sont pourtant DÉJÀ fournies au conteneur api par le Compose et
// documentées au .env.example §5 : elles existent, elles ne sont simplement pas
// encore validées. On les valide donc ici, par Zod comme le reste — jamais par un
// accès brut à `process.env`, qui serait le `undefined` silencieux que le
// contrat 11 §3 proscrit.
//
// ⚠ À REMONTER dans `envApiSchema` quand le lot qui branche réellement MinIO
// (pièces jointes, L6c) ouvrira `packages/shared` : ce bloc disparaîtra alors.
//
// OPTIONNEL, et c'est délibéré : une configuration MinIO absente rend la
// dépendance « non configurée », pas « en panne ». Faire échouer le DÉMARRAGE de
// l'API sur une variable que le code métier n'utilise pas encore transformerait
// une sonde en panne de service — exactement l'inversion qu'on cherche à éviter.
// Les CLÉS applicatives (MINIO_ACCESS_KEY/SECRET_KEY) ne sont volontairement PAS
// lues ici : la sonde interroge un point de santé anonyme et n'a aucun besoin
// d'un secret (moindre accès, 02 §30.4-7).
// -----------------------------------------------------------------------------
const envMinioSchema = z.object({
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valeur) => valeur === 'true'),
});

export type ConfigMinio = z.infer<typeof envMinioSchema>;

const minioAnalyse = envMinioSchema.safeParse(process.env);

/** Coordonnées MinIO si elles sont configurées ET valides, `null` sinon. */
export const configMinio: ConfigMinio | null = minioAnalyse.success ? minioAnalyse.data : null;
