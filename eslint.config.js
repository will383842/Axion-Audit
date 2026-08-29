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

// =============================================================================
// PAGINATION SANS DÉCALAGE — contrat 11 §3, lot L3a
// « Pagination : keyset partout (`?limit=50&after=<curseur>`), jamais d'offset. »
//
// Pourquoi une règle et pas une consigne : la méthode interdite est celle que
// tout le monde écrit par réflexe, elle compile, elle passe les tests unitaires,
// et elle ne se voit qu'en production sur une liste qui bouge — c'est-à-dire
// pendant une synchronisation terrain, au moment le plus coûteux.
//
// -----------------------------------------------------------------------------
// PORTÉE RÉELLE — CE QUE CETTE RÈGLE VOIT, ET CE QU'ELLE NE VOIT PAS
// -----------------------------------------------------------------------------
// ELLE VOIT (prouvé par des cas fautifs joués à l'écriture) :
//   · `qb.offset(20)` et toute lecture de `.offset`, y compris en bout de chaîne
//     `db.select().from(t).limit(10).offset(20)` ;
//   · l'accès calculé littéral `qb['offset'](20)` ;
//   · l'option `offset:` de l'API relationnelle de Drizzle
//     (`db.query.t.findMany({ limit, offset })`), qui n'est PAS un appel de
//     méthode et échapperait aux deux sélecteurs précédents ;
//   · le mot-clé SQL dans une chaîne (`'… LIMIT 50 OFFSET 100'`) ou dans un
//     gabarit `sql\`…\``, suivi d'un nombre, d'un paramètre ou de fin de fragment.
//
// ELLE NE VOIT PAS — liste tenue à jour, elle fait partie du garde-fou :
//   1. l'appel par nom calculé NON littéral : `qb[nomDeMethode](20)`, ou
//      `const m = 'off' + 'set'`. Aucune règle syntaxique ne le peut ;
//   2. le SQL CONSTRUIT : `sql.raw('… ' + clause)` où `clause` porte le mot-clé.
//      C'est la contrepartie de `sql.raw`, qui est déjà une porte ouverte assumée ;
//   3. les fichiers `.sql` — les migrations de `apps/api/drizzle/*.sql` ne sont
//      pas analysées par ESLint, qui ne parse pas le SQL. TROU CONNU, NON FERMÉ
//      ICI : il appartiendrait à `scripts/check-invariants.mjs`, qui lit le texte
//      de tous les fichiers versionnés (proposition remontée au chef de lot) ;
//   4. `eslint.config.js` lui-même, exclu ci-dessous. MESURÉ, et le résultat n'est
//      PAS celui qu'on attendait : en retirant l'exclusion, ce fichier reste VERT
//      aujourd'hui — les motifs qu'il cite sont écrits `\\bOFFSET\\s+…`, et le
//      `\s` littéral n'est pas un espace. L'exclusion est donc une PRÉCAUTION
//      pour le jour où un message citera « … OFFSET 100 » en clair, pas la
//      correction d'un défaut constaté. Écrit tel quel plutôt qu'affirmé plus
//      fort qu'il n'est vrai ;
//   5. tout ce qui n'est pas du code du dépôt : une vue SQL, une fonction stockée,
//      une requête écrite dans un outil d'administration ;
//   6. un `lint` non exécuté. La garantie vient de la CI (`pnpm lint`), pas du
//      poste de développement, où la règle se contourne d'un commentaire.
//
// FAUX POSITIF ASSUMÉ : toute propriété métier nommée `offset` (un décalage
// d'horaire, un décalage de page dans un PDF) sera refusée. L'échappatoire est
// `// eslint-disable-next-line no-restricted-syntax -- <raison>`, qui LAISSE UNE
// TRACE dans le diff — c'est le but. `{ offset: false }` de `z.string()
// .datetime()` est en revanche épargné : les sélecteurs d'option ne visent qu'une
// valeur numérique ou calculée, jamais un booléen.
// =============================================================================
const MESSAGE_SANS_DECALAGE =
  'Interdit (contrat 11 §3) : la pagination est keyset PARTOUT (`?limit=50&after=<curseur>`), jamais par décalage. Sur une liste qui bouge pendant la pagination — une sync terrain qui pousse des réponses — le décalage saute ou duplique des lignes. Utilisez `conditionApresCurseur` / `ordreDuCurseur` / `paginerParCurseur` (apps/api/src/http/pagination.ts).';

const PAGINATION_SANS_DECALAGE = [
  // `qb.offset(20)`, et toute lecture de la propriété.
  { selector: "MemberExpression[property.name='offset']", message: MESSAGE_SANS_DECALAGE },
  // `qb['offset'](20)` — le contournement d'une règle qui ne regarderait que les
  // accès en clair.
  {
    selector: "MemberExpression[computed=true][property.value='offset']",
    message: MESSAGE_SANS_DECALAGE,
  },
  // Option `offset:` de l'API relationnelle de Drizzle. Quatre formes de valeur,
  // toutes sauf le booléen — voir le faux positif assumé ci-dessus.
  {
    selector: "Property[key.name='offset'][value.type='Literal'][value.raw=/^[0-9]/]",
    message: MESSAGE_SANS_DECALAGE,
  },
  {
    selector: "Property[key.name='offset'][value.type='Identifier']",
    message: MESSAGE_SANS_DECALAGE,
  },
  {
    selector: "Property[key.name='offset'][value.type='MemberExpression']",
    message: MESSAGE_SANS_DECALAGE,
  },
  {
    selector: "Property[key.name='offset'][value.type='BinaryExpression']",
    message: MESSAGE_SANS_DECALAGE,
  },
  // Le mot-clé SQL en clair, dans une chaîne ou dans un gabarit `sql`…``.
  // Le motif exige un séparateur PUIS un nombre, un paramètre, un deux-points ou
  // la fin du fragment : « outline-offset: » et « d'offset » ne le déclenchent pas.
  {
    selector: 'Literal[value=/\\bOFFSET\\s+(?:\\d|\\$|:|$)/i]',
    message: MESSAGE_SANS_DECALAGE,
  },
  {
    selector: 'TemplateElement[value.raw=/\\bOFFSET\\s+(?:\\d|\\$|:|$)/i]',
    message: MESSAGE_SANS_DECALAGE,
  },
];

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
        ...PAGINATION_SANS_DECALAGE,
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

  // --- Pagination sans décalage : RÉTABLIE sur les fichiers d'outillage -------
  //
  // CE BLOC EXISTE PARCE QUE LES DEUX PRÉCÉDENTS ÉTEIGNENT `no-restricted-syntax`
  // sur tout `.js/.mjs/.cjs`. La règle anti-décalage y aurait donc été inopérante
  // — et pas sur des fichiers anodins : `apps/api/scripts/{seed,migrations,
  // import-banque-questions}.mjs` écrivent du SQL. Une règle qui protège le code
  // TypeScript et laisse le SQL des scripts est exactement le garde-fou qui
  // rassure sans agir.
  //
  // Il doit rester LE DERNIER : en configuration à plat, c'est le dernier bloc
  // correspondant qui fixe la règle. Le déplacer plus haut le désactiverait, en
  // silence et sans qu'aucun test ne rougisse — sauf celui écrit pour ce cas.
  //
  // Les selectors UUID des blocs précédents, eux, restent éteints ici : ils
  // citent leurs propres motifs et se dénonceraient (c'est le motif écrit en tête
  // du bloc « fichiers d'outillage »). Ce bloc ne rétablit QUE l'anti-décalage.
  // `eslint.config.js` en est exclu par PRÉCAUTION et non par nécessité : mesuré,
  // sans cette exclusion il reste vert aujourd'hui (voir le point 4 de la portée,
  // en tête de fichier).
  {
    files: ['**/*.{js,mjs,cjs}'],
    ignores: ['eslint.config.js'],
    rules: {
      'no-restricted-syntax': ['error', ...PAGINATION_SANS_DECALAGE],
    },
  },
);
