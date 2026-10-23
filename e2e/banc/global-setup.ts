// =============================================================================
// BANC E2E AVEC VRAIE API — `globalSetup` de Playwright (L6c-2)
//
// POURQUOI UN globalSetup ET PAS UN `webServer` POUR L'API : Playwright démarre les
// `webServer` AVANT le `globalSetup`, donc avant que la base existe. L'API, qui
// valide son environnement au démarrage (11 §3), ne peut pas être lancée par lui.
//
// ORDRE : (bases ‖ MinIO ‖ Redis) → migrations (`appliquerMontee`, le lanceur public
// d'A12) → semis des référentiels (`executerSeed`, idem) → API construite. Tout
// est détruit au teardown ; une exécution qui meurt brutalement laisse au pire
// des conteneurs éphémères que Ryuk (Testcontainers) ou `docker rm` retirent.
//
// Postgres : `base-l1.ts` choisit seul — Testcontainers en local, ou le Postgres de la
// CI quand `AXION_TESTS_SANS_CONTENEUR=1` + `DATABASE_URL_TEST` (même contrat que les
// tests d'intégration). MinIO : `minio-essai.ts` (variables `MINIO_*` de la CI, sinon
// conteneur). Redis : `REDIS_URL` de la CI, sinon conteneur. Aucune dépendance neuve.
//
// Les variables posées ici (`AXION_BANC_*`) sont héritées par les workers Playwright.
// =============================================================================
import {
  appliquerMontee,
  creerBaseEphemere,
  executerSeed,
  supprimerBaseEphemere,
} from '../../apps/api/tests/aide/base-l1.js';
import { demarrerMinio } from '../../apps/api/tests/aide/minio-essai.js';
import { lancerApi, SECRET_ACCES_BANC, URL_API } from './api.js';
import { demarrerRedis } from './redis.js';

const COURRIEL_FONDATEUR_FACTICE = 'fondateur.banc@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-du-banc';

/**
 * Le banc est lourd (Docker). Une exécution EXPLICITEMENT limitée au projet
 * `hors-ligne` n'en a pas besoin et ne doit pas exiger Docker ; toute autre
 * exécution (sans `--project`, ou avec `sync-critique` / `charge`) le démarre.
 */
function bancRequis(): boolean {
  const choisis = process.argv
    .map((argument, rang, tous) =>
      argument.startsWith('--project=')
        ? argument.slice('--project='.length)
        : argument === '--project'
          ? tous[rang + 1]
          : undefined,
    )
    .filter((nom): nom is string => nom !== undefined);
  return choisis.length === 0 || choisis.some((nom) => nom !== 'hors-ligne');
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!bancRequis()) return () => Promise.resolve();
  const debut = Date.now();
  // Le seed lit ces deux variables ; `??=` : on ne masque pas celles d'un poste qui les pose.
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;

  const [base, minio, redis] = await Promise.all([
    creerBaseEphemere('e2e_banc'),
    demarrerMinio(),
    demarrerRedis(),
  ]);
  minio.exporterEnvironnement();

  await appliquerMontee(base.url);
  await executerSeed(base.url, base.nom);

  const api = await lancerApi({
    urlBase: base.url,
    urlRedis: redis.url,
    environnement: process.env,
  });

  process.env.AXION_BANC_DATABASE_URL = base.url;
  process.env.AXION_BANC_API = URL_API;
  process.env.AXION_BANC_SECRET_ACCES = SECRET_ACCES_BANC;
  // Mesure demandée (rapport de l'étape 1) : le temps de démarrage du banc.
  process.stdout.write(`[banc] démarré en ${((Date.now() - debut) / 1000).toFixed(1)} s
`);

  return async (): Promise<void> => {
    await api.arreter();
    await redis.arreter();
    await minio.arreter();
    await supprimerBaseEphemere(base.nom).catch(() => undefined);
  };
}
