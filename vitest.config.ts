// =============================================================================
// CONFIGURATION VITEST — projets et couverture.
//
// La CI du 11 §7 exécute `unit` puis `integration` SÉPARÉMENT :
// « lint → typecheck → unit → integration (services : postgres, redis, minio) → e2e ».
// La séparation n'est pas cosmétique : un test unitaire doit tourner SANS service,
// donc rester rapide ; ceux qui ont besoin de Testcontainers vivent dans le projet
// `integration` et n'y entraînent personne d'autre.
//
// DoD transverse : « couverture ≥ 90 % sur les modules critiques (moteur de sync,
// crypto locale, scoring, RBAC/propriété) — MESURÉE, pas déclarée ».
// =============================================================================
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
          environment: 'node',
          // Un test unitaire lent est un test d'intégration qui s'ignore.
          testTimeout: 5_000,
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'apps/*/tests/**/*.integration.test.ts',
            'packages/*/tests/**/*.integration.test.ts',
          ],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
          // Testcontainers démarre Postgres/Redis/MinIO : la marge est nécessaire.
          testTimeout: 60_000,
          hookTimeout: 120_000,
          // Ces tests touchent une base réelle : jamais en parallèle sans isolation
          // explicite (unicité `answers`, idempotence du push — 07 §13).
          fileParallelism: false,
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**', '**/node_modules/**'],
      // Seuils PAR CHEMIN, renseignés au fil des lots :
      //   L2  → apps/api/src/auth/**, apps/api/src/rbac/**    (RBAC / propriété §9.9)
      //   L5a → apps/field/src/crypto/**                      (DEK/KEK, crypto locale)
      //   L6a → apps/field/src/sync/**, apps/api/src/sync/**  (moteur de sync)
      //   L8  → apps/api/src/scoring/**                       (barème §32.1)
      // Déclarer un chemin qui n'existe pas encore ferait échouer la CI pour une
      // mauvaise raison — et une CI qui échoue pour de mauvaises raisons finit par
      // être ignorée. Le job de couverture de la CI lit la même liste.
      thresholds: {},
    },
  },
});
