// =============================================================================
// ESLint (flat config) — garde-fou automatisé des invariants du 00_INDEX.
// Applique : invariant 2 (aucune référence client), invariant 4 (aucune couleur en
// dur), invariant 5 (interface en français), contrat 11 §2 (pas de Next, pas de
// Prisma, UUID v7 applicatif) et 11 §3 (« Aucun any »).
// L'étape 3 du pipeline (auto-revue) s'appuie sur cette checklist automatisée : ce qui
// peut être vérifié par la machine ne doit pas dépendre de la vigilance d'un agent.
// =============================================================================
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // Le pack, les archives et les artefacts ne sont jamais analysés.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/dev-dist/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'docs/**',
      '.claude/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.es2023 },
    },

    rules: {
      // --- Contrat 11 §3 : « Aucun any » -----------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // Un `catch` qui avale une erreur masque une panne de sync : interdit.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Le contrat impose des types dérivés de Zod (`z.infer`), pas des assertions.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // --- Invariant 8 / RGPD 06 §10.4 : rien ne part en clair par accident ---
      // `console` est interdit côté serveur : le seul journal autorisé est pino,
      // qui porte la redaction des données personnelles (11 §2).
      'no-console': 'error',

      // --- Contrat 11 §2 : pièges connus, interdits par construction ---------
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next',
              message:
                'Interdit (contrat 11 §2) : les deux fronts sont des SPA/PWA Vite + React. Le SSR est inutile (outil interne authentifié) et NUISIBLE pour une PWA offline-first.',
            },
            {
              name: '@prisma/client',
              message:
                'Interdit (contrat 11 §2) : Prisma duplique le schéma du fichier 04. Le DDL vit exclusivement dans le fichier 04, transcrit en migrations SQL ; Drizzle ne sert qu’aux requêtes typées.',
            },
            {
              name: 'prisma',
              message: 'Interdit (contrat 11 §2) : voir @prisma/client.',
            },
          ],
          patterns: [
            {
              group: ['next/*'],
              message: 'Interdit (contrat 11 §2) : pas de Next.js dans ce dépôt.',
            },
            {
              group: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'],
              message:
                'Interdit (contrat 11 §1) : la police est AUTO-HÉBERGÉE (@fontsource-variable/inter). Un CDN de police casse le mode avion.',
            },
          ],
        },
      ],

      // --- Invariant 1 : UUID v7 généré CÔTÉ APPLICATIF ---------------------
      // PostgreSQL 16 n'a pas de uuidv7() native (PG18 seulement) : toute tentative
      // de génération en SQL est une bombe à retardement silencieuse.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/uuid_generate_v7|uuidv7\\s*\\(\\)\\s*(?:::|AS|as)/i]',
          message:
            'Interdit (invariant 1, contrat 11 §2) : PostgreSQL 16 n’a PAS de fonction uuidv7() native. Les UUID v7 sont générés côté APPLICATIF avec la lib `uuidv7`, client ET serveur.',
        },
        {
          selector:
            "CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
          message:
            'Interdit (invariant 1) : `crypto.randomUUID()` produit un UUID v4, non ordonnable. Toute entité créable hors ligne exige un UUID v7 (`uuidv7()` de la lib `uuidv7`).',
        },
      ],
    },
  },

  // --- Fronts : environnement navigateur ------------------------------------
  {
    files: ['apps/field/**/*.{ts,tsx}', 'apps/hq/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
    rules: {
      // Le navigateur a le droit de journaliser en développement, mais jamais un
      // contenu de réponse ni une identité (06 §10.4) — la revue croisée le vérifie.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // --- Tests : Vitest / Playwright ------------------------------------------
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/tests/**/*.{ts,tsx}', '**/e2e/**/*.{ts,tsx}'],
    rules: {
      // Règle 09 §5.7 et DoD : aucun test skippé. Doublé par le garde-fou de CI
      // (`pnpm check:no-skipped-tests`), parce qu'un lint peut être contourné en
      // local alors que la CI, elle, bloque le merge.
      'no-restricted-properties': [
        'error',
        {
          object: 'it',
          property: 'skip',
          message:
            'Interdit (09 §5.7, DoD transverse) : un test désactivé = build rouge. Les tests @critique et @filrouge ne sont JAMAIS skippables.',
        },
        {
          object: 'describe',
          property: 'skip',
          message: 'Interdit (09 §5.7, DoD transverse) : un test désactivé = build rouge.',
        },
        {
          object: 'test',
          property: 'skip',
          message: 'Interdit (09 §5.7, DoD transverse) : un test désactivé = build rouge.',
        },
        {
          object: 'it',
          property: 'only',
          message: '`.only` masque le reste de la suite : interdit hors débogage local.',
        },
        {
          object: 'describe',
          property: 'only',
          message: '`.only` masque le reste de la suite : interdit hors débogage local.',
        },
        {
          object: 'test',
          property: 'only',
          message: '`.only` masque le reste de la suite : interdit hors débogage local.',
        },
      ],
    },
  },

  // --- Fichiers d'outillage (scripts de dépôt, configs) ---------------------
  // Ces fichiers sont du JavaScript pur, hors de tout tsconfig : les règles
  // TYPÉES ne peuvent pas s'y appliquer (le service de projet ne les connaît pas).
  // On les désactive explicitement ici plutôt que d'élargir un tsconfig pour faire
  // taire l'outil — un tsconfig qui ratisse au-delà du code compilé finit par
  // typechecker des artefacts et ralentir la CI pour rien.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
    rules: {
      // Un script d'outillage parle à l'opérateur : sa sortie standard EST son interface.
      'no-console': 'off',
      // Les garde-fous « pièges connus » CITENT les motifs interdits dans leurs
      // propres sélecteurs et messages : appliqués à eux-mêmes, ils se dénoncent
      // eux-mêmes (le sélecteur `no-restricted-syntax` ci-dessous contient
      // littéralement « uuid_generate_v7 »). Ces fichiers restent couverts par
      // `scripts/check-invariants.mjs`, qui sait distinguer une interdiction
      // ÉNONCÉE d'une infraction COMMISE.
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },

  {
    files: ['scripts/**/*.{mjs,js}', '*.config.{ts,js,mjs}', 'infra/**/*.{mjs,js}'],
    languageOptions: { globals: globals.node },
    rules: {
      // Un script d'outillage parle à l'opérateur : sa sortie standard EST son interface.
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
