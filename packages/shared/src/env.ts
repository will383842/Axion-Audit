// =============================================================================
// VALIDATION DE L'ENVIRONNEMENT — contrat 11 §3 (« Validation : Zod sur 100 % des
// entrées ») et 06 §10.2. Une variable manquante doit tuer le processus AU DÉMARRAGE,
// pas provoquer un `undefined` silencieux trois heures plus tard en pleine sync.
// Le fichier .env.example documente chaque variable (02 §30.4-1) : ce schéma en est
// la contrepartie exécutable.
// Traçabilité : E33 (secrets hors code), E43.
// =============================================================================
import { z } from 'zod';

/** Environnement LOGIQUE (pas NODE_ENV, qui est un mode de build). */
export const appEnvSchema = z.enum(['dev', 'staging', 'prod']);
export type AppEnv = z.infer<typeof appEnvSchema>;

const secretHexSchema = (octets: number) =>
  z
    .string()
    .min(
      octets * 2,
      `doit faire au moins ${String(octets)} octets (openssl rand -hex ${String(octets)})`,
    )
    .refine((v) => v !== '__CHANGEME__', {
      message: 'valeur de remplacement __CHANGEME__ : le secret réel n’a pas été posé',
    });

/** Schéma commun à l'API et au worker. */
export const envServeurSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: appEnvSchema.default('dev'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TZ: z
    .literal('UTC')
    .default('UTC')
    .describe('Invariant 5 : le serveur vit en UTC. Le fuseau de mission est un affichage.'),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
});

export type EnvServeur = z.infer<typeof envServeurSchema>;

/** Schéma propre à l'API — ajoute l'écoute HTTP et les secrets de jetons. */
export const envApiSchema = envServeurSchema.extend({
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Contrat 11 §3 : DEUX secrets DISTINCTS de 64 octets. Les confondre annulerait la
  // détection de réutilisation de refresh token (06 §10.1).
  JWT_ACCESS_SECRET: secretHexSchema(32),
  JWT_REFRESH_SECRET: secretHexSchema(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
});

export type EnvApi = z.infer<typeof envApiSchema>;

/**
 * Analyse l'environnement et échoue BRUYAMMENT si quelque chose manque.
 * Volontairement sans dépendance au logger : cette erreur survient avant lui.
 */
export function chargerEnv<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const resultat = schema.safeParse(source);
  if (!resultat.success) {
    const lignes = resultat.error.issues.map((i) => `  · ${i.path.join('.')} : ${i.message}`);
    throw new Error(
      `Configuration d'environnement invalide — le processus ne peut pas démarrer :\n${lignes.join('\n')}\n\n` +
        'Chaque variable est documentée dans .env.example (02 §30.4-1).',
    );
  }
  return resultat.data;
}

/**
 * Garde-fou de production : refuse une opération réservée au développement.
 * Contrat 11 §5 : `pnpm seed:demo` est « jamais exécutable en prod (garde-fou env) ».
 */
export function refuserEnProd(appEnv: AppEnv, operation: string): void {
  if (appEnv === 'prod') {
    throw new Error(`Opération « ${operation} » REFUSÉE en production (garde-fou, contrat 11 §5).`);
  }
}
