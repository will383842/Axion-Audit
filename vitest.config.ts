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
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      // ═══════════════════════════════════════════════════════════════════════
      // `interface` — LE PROJET QUI MANQUAIT, ET CE QUE SON ABSENCE COÛTAIT.
      // ═══════════════════════════════════════════════════════════════════════
      // Ajouté le 2026-08-31, sur décision de Williams (dépendances hors liste
      // épinglée = escalade §3-1). MESURÉ avant de le proposer : ce dépôt ne
      // pouvait tester AUCUN composant React. Trois raisons cumulées, et il
      // fallait les trois pour que ce soit invisible —
      //   · `include` ne captait que `*.test.ts`, jamais `.tsx` ;
      //   · `environment: 'node'`, donc aucun DOM ;
      //   · ni `jsdom` ni `@testing-library/react` installés.
      //
      // CE QUE CELA SIGNIFIAIT, dit sans l'arrondir : les 23 composants du design
      // system NE POUVAIENT PAS ÊTRE LIVRÉS. La règle de croisement (09 §5.6)
      // exige qu'un autre agent écrive leurs tests ; il aurait été bloqué au
      // premier fichier. Et le garde des modules orphelins les refusait — à juste
      // titre, puisque rien ne les atteignait, pas même un test.
      //
      // POURQUOI UN PROJET SÉPARÉ, et non `.tsx` ajouté à `unit` : `unit` tourne
      // en `node` et doit rester rapide (« un test unitaire lent est un test
      // d'intégration qui s'ignore »). Monter un DOM pour chaque test de logique
      // pure le ralentirait sans rien prouver. Le découpage suit le besoin réel,
      // pas la commodité.
      {
        plugins: [react()],
        test: {
          name: 'interface',
          include: ['packages/*/src/**/*.test.tsx', 'apps/*/src/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'jsdom',
          // Le nettoyage du DOM entre deux tests ne dépend plus de la mémoire de
          // celui qui écrit le fichier : voir l'en-tête de cette amorce, et le
          // piège qu'elle ferme (25 fichiers sur 26 l'appelaient à la main).
          setupFiles: ['./vitest.setup.interface.ts'],
          // Plus généreux que `unit` : monter un DOM coûte, rendre un arbre React
          // aussi. Reste très en deçà de l'intégration, qui démarre des conteneurs.
          testTimeout: 10_000,
        },
      },
      {
        test: {
          name: 'unit',
          // `scripts/` : les garde-fous de CI sont du code livré comme un autre, et
          // 09 §5.6 exige qu'ils soient testés par quelqu'un d'autre que leur auteur.
          // Sans ce motif, leurs tests seraient ORPHELINS — verts en permanence sans
          // jamais s'exécuter, ce que `check:test-projects` refuse à juste titre.
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/*/src/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
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
          // Ces tests touchent une base RÉELLE : jamais en parallèle sans isolation
          // explicite (unicité `answers(interview_id, mission_question_id)`,
          // idempotence du push — 07 §13). Deux suites qui écrivent dans la même base
          // produiraient des échecs intermittents, c'est-à-dire des tests qui mentent.
          // `singleFork` sérialise les fichiers DANS ce projet seulement : les tests
          // unitaires, eux, gardent tout leur parallélisme.
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // `.tsx` AJOUTÉ le 2026-08-31, et ce n'est pas un détail de configuration :
      // sans lui, les 23 composants du design system auraient été INVISIBLES à la
      // mesure de couverture. Le seuil de 90 % de la DoD se serait appliqué à un
      // périmètre dont ils étaient absents — donc vert, et sans rapport avec eux.
      // C'est la forme la plus discrète du défaut que ce dépôt traque : une mesure
      // vraie sur ce qu'elle observe, qui répond à une autre question que celle
      // posée.
      include: [
        'apps/*/src/**/*.ts',
        'packages/*/src/**/*.ts',
        'apps/*/src/**/*.tsx',
        'packages/*/src/**/*.tsx',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts', '**/dist/**', '**/node_modules/**'],
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
