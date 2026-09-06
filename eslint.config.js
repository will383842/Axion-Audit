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

// =============================================================================
// UUID V7 APPLICATIF — invariant 1, contrat 11 §2
//
// EXTRAIT EN CONSTANTE, et ce n'est pas de la cosmétique : en configuration à
// plat, un bloc ultérieur qui redéclare `no-restricted-syntax` REMPLACE la règle
// au lieu de sy ajouter. Les deux blocs « couche locale terrain » plus bas en
// déclarent une ; sans cette constante à ré-étaler, `apps/field/src/**` perdrait
// EN SILENCE les gardes UUID et anti-décalage. Le piège est déjà documenté en
// bas de ce fichier pour la pagination ; il se referme ici pour de bon.
// =============================================================================
const UUID_APPLICATIF = [
  {
    selector: 'Literal[value=/uuid_generate_v7|uuidv7\\s*\\(\\)\\s*(?:::|AS|as)/i]',
    message:
      'Interdit (invariant 1, contrat 11 §2) : PostgreSQL 16 n’a PAS de fonction uuidv7() native. Les UUID v7 sont générés côté APPLICATIF avec la lib `uuidv7`, client ET serveur.',
  },
  {
    selector: "CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
    message:
      'Interdit (invariant 1) : `crypto.randomUUID()` produit un UUID v4, non ordonnable. Toute entité créable hors ligne exige un UUID v7 (`uuidv7()` de la lib `uuidv7`).',
  },
];

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

const MESSAGE_ECRITURE_DEXIE =
  'Interdit (05 §9.2-2, docs/conception/LOT_L5.md §2) : toute écriture locale passe par `ecrireLocal` / `appliquerDescente` (`local/ecriture.ts`), qui écrivent la ligne ET son opération d’outbox dans UNE transaction. Un écran qui écrit directement produit une donnée que la synchronisation ne remontera jamais — perdue, et découverte au montage du rapport. Pour `meta`, utilisez `ecrireMeta` / `effacerMeta` de `local/base.ts`.';

// =============================================================================
// HORLOGE DE L’APPAREIL — 05 §9.2, et le scénario @critique 05 §9.8
// =============================================================================
const HORLOGE_DE_L_APPAREIL = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Interdit (05 §9.2) : `new Date()` lit l’horloge de l’APPAREIL. Utilisez `maintenant()` ou `instantMs()` de `local/horloge.ts`, qui appliquent le décalage serveur — sans lui, une tablette déréglée de +3 h gagne tous les arbitrages de conflit (05 §9.4). `new Date(valeur)` AVEC argument reste autorisé : c’est une conversion, pas une lecture d’horloge.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Interdit (05 §9.2) : `Date.now()` lit l’horloge de l’APPAREIL. Utilisez `instantMs()` (corrigé du décalage serveur) ou `instantLocalMs()` (durées mesurées sur l’appareil) de `local/horloge.ts`.',
  },
];

// =============================================================================
// ÉCRITURE DEXIE — 05 §9.2-2 : « CHAQUE écriture pousse une opération dans l’outbox »
// =============================================================================
/**
 * Les verbes d’écriture de Dexie 4 — et eux seuls.
 *
 * `modify` et `bulkUpdate` ont été AJOUTÉS le 2026-09-05 (revue A29, R2). Ils
 * manquaient alors même que le commentaire du sélecteur ② citait `.modify(…)`
 * comme un cas VU : mesuré par A29, il était muet. Ce sont des écritures de plein
 * droit — `Collection.modify()` et `Table.bulkUpdate()`, `dexie@4.4.5`
 * (`dist/dexie.d.ts:443,446,792`) —, et la descente par lots de L6a s’en servira.
 * Une écriture qui échappe à la règle est une écriture sans op d’outbox : « une
 * donnée que la synchronisation ne remontera jamais », dit le message ci-dessous.
 */
const VERBES_ECRITURE_DEXIE =
  'put|add|delete|update|modify|clear|bulkPut|bulkAdd|bulkDelete|bulkUpdate';

/**
 * Les NEUF tables de `SCHEMA_LOCAL` (05 §9.1, `local/base.ts`).
 *
 * La liste est recopiée ici parce qu’un sélecteur esquery ne sait pas lire un
 * module : c’est le prix de la précision, et le seul entretien que cette règle
 * demande. **Toute table ajoutée à `SCHEMA_LOCAL` s’ajoute ICI dans le même
 * geste**, sinon la garde cesse de mordre sur elle — en silence.
 */
const TABLES_LOCALES = [
  'missions',
  'missionQuestions',
  'orgUnits',
  'interviews',
  'answers',
  'attachments',
  'workAssignments',
  'outbox',
  'meta',
].join('|');

const ECRITURE_DEXIE = [
  {
    // ① L’écriture sur une TABLE NOMMÉE : `base.answers.put(…)`, `base.meta.delete(…)`.
    //
    // La première version visait n’importe quel objet `MemberExpression`, et
    // mordait donc sur toute collection en mémoire à deux niveaux — mesuré sur la
    // branche qui réunit L5a et L5b : `enAttente.current.clear()` et
    // `enAttente.current.delete(cle)` (une file `useRef<Map>`) faisaient rougir le
    // lint, alors que la glose promettait le contraire. Nommer les tables ferme le
    // faux positif SANS relâcher la garde : `current` n’est pas une table, et
    // aucune des neuf n’a échappé au sélecteur.
    selector: `CallExpression[callee.object.type='MemberExpression'][callee.object.property.name=/^(${TABLES_LOCALES})$/][callee.property.name=/^(${VERBES_ECRITURE_DEXIE})$/]`,
    message: MESSAGE_ECRITURE_DEXIE,
  },
  {
    // ② L’écriture au bout d’une CHAÎNE : `db.table('answers').delete(…)`,
    // `base.answers.where('missionId').equals(id).delete()`, `.toCollection().modify(…)`.
    // Le nom de la table n’est plus lisible dans l’AST à cet endroit ; c’est la
    // forme « appel PUIS verbe d’écriture » qui trahit Dexie.
    //
    // CE SÉLECTEUR A UN FAUX POSITIF, ET IL EST ÉCRIT ICI PLUTÔT QUE NIÉ. Toute
    // écriture sur le RÉSULTAT d’un appel est reprise, y compris quand ce résultat
    // est une collection en mémoire : `fichiers.get(id).clear()` sur un
    // `Map<string, Set<…>>` mord, et A29 l’a mesuré. La version précédente de ce
    // commentaire jurait le contraire (« une collection en mémoire ne s’écrit pas
    // ainsi ») — c’était faux, et c’était le défaut même que ce commentaire venait
    // corriger. Le contournement, quand le cas se présentera, tient en une ligne :
    // extraire le résultat dans une variable (`const dejaVus = fichiers.get(id);`),
    // qui est un angle mort DÉCLARÉ de la règle. Resserrer le sélecteur coûterait
    // la couverture de `db.table('x').delete()`, qui est une vraie écriture Dexie ;
    // le faux positif est donc ASSUMÉ, et il est exceptionnel.
    selector: `CallExpression[callee.object.type='CallExpression'][callee.property.name=/^(${VERBES_ECRITURE_DEXIE})$/]`,
    message: MESSAGE_ECRITURE_DEXIE,
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
      'no-restricted-syntax': ['error', ...UUID_APPLICATIF, ...PAGINATION_SANS_DECALAGE],
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

  // ===========================================================================
  // COUCHE LOCALE TERRAIN — les « interdits outillés » de docs/conception/LOT_L5.md §4
  // ===========================================================================
  // Deux interdits que la note de conception L5 réclamait nommément (§4, ligne
  // « Interdits outillés ») et que la revue croisée A29 a relevés comme absents
  // (réserve R-L5a-5) :
  //   ① l’horloge de l’appareil ne se lit que dans `local/horloge.ts` ;
  //   ② Dexie ne s’écrit que dans `local/ecriture.ts` et `local/base.ts`.
  // Ce ne sont pas des préférences de style : ce sont les deux invariants du socle
  // offline, et une consigne que rien ne vérifie ne survit pas à quarante fichiers
  // écrits par trois mains.
  //
  // TROIS BLOCS ET NON DEUX, ET C’EST LE PIÈGE QUI A ÉTÉ MESURÉ. En configuration
  // à plat, le DERNIER bloc qui déclare `no-restricted-syntax` REMPLACE la règle
  // pour les fichiers qu’il couvre. Une première version posait un bloc « horloge »
  // puis un bloc « écriture » sur le MÊME glob : le second effaçait le premier, et
  // `new Date()` repassait — vérifié sur un fichier sonde, qui ne remontait que
  // deux erreurs sur quatre. Les trois blocs ci-dessous portent donc des globs
  // DISJOINTS, chacun ré-étalant l’intégralité des sélecteurs qui le concernent.
  // C’est le même piège que celui documenté en bas de ce fichier pour la
  // pagination ; il coûte trois blocs et se paie une fois.
  //
  // CE QUE CES RÈGLES VOIENT, ET CE QU’ELLES NE VOIENT PAS — dit AVANT le code.
  // Réécrit le 2026-09-04 parce que la version d’avant décrivait ce qu’on
  // espérait ; RE-réécrit le 2026-09-05 (revue A29, R2) parce que la correction
  // avait reproduit la faute qu’elle corrigeait, dans les DEUX sens : elle
  // annonçait couvrir `.modify(…)` sans le voir, et jurait épargner des
  // collections en mémoire sur lesquelles elle mordait. Chaque ligne ci-dessous a
  // été MESURÉE sur la configuration livrée, pas déduite du sélecteur :
  //   · VU — `base.<table>.<verbe>(…)` sur les neuf tables de `SCHEMA_LOCAL`, où
  //     `<verbe>` est l’un des dix de `VERBES_ECRITURE_DEXIE` — `bulkUpdate` et
  //     `modify` COMPRIS depuis le 2026-09-05 ;
  //   · VU — toute écriture au bout d’une chaîne d’appels, quel que soit le nom de
  //     la table : `db.table('x').delete(…)`, `.where(…).equals(…).delete()`,
  //     `.toCollection().modify(…)`, `.where(…).equals(…).modify(…)` ;
  //   · PAS VU — l’écriture par alias : `const t = base.answers; t.put(…)`.
  //     L’objet devient un identifiant simple et échappe au sélecteur. Choix
  //     CONSERVATEUR et délibéré : viser aussi les identifiants ferait rougir
  //     `unSet.add(x)` partout, et une règle qui crie à tort finit désactivée ;
  //   · PAS VU — l’accès par clé CALCULÉE : `base['answers'].put(…)`. La propriété
  //     n’est plus un nom dans l’AST, et le sélecteur ① la manque. Angle mort réel,
  //     découvert par mesure et déclaré ici plutôt que corrigé : le fermer
  //     demanderait de viser `computed=true`, donc de reprendre `unMap['x'].set()` ;
  //   · PAS VU — une table AJOUTÉE à `SCHEMA_LOCAL` sans l’être à `TABLES_LOCALES`.
  //     C’est le coût assumé de la précision : la liste précédente, elle, visait
  //     tout objet à deux niveaux et mordait sur `refUneMap.current.clear()` —
  //     une règle qui accuse une file en mémoire d’être une écriture de sync
  //     apprend surtout à ceux qui la lisent qu’il faut s’en méfier ;
  //   · FAUX POSITIF ASSUMÉ, et c’est le pendant honnête du point précédent — le
  //     sélecteur ② mord sur une écriture faite au résultat d’un appel MÊME quand
  //     ce résultat est une collection en mémoire : `fichiers.get(id).clear()` sur
  //     un `Map<string, Set<…>>` est repris. Le contournement est une variable
  //     intermédiaire (l’alias, cf. ci-dessus) ; le détail est au sélecteur ② ;
  //   · l’horloge lue par une bibliothèque tierce ;
  //   · les fichiers de test, exclus : ils fabriquent des jeux de données et des
  //     horodatages déterministes, c’est leur métier.
  //
  // Ces neuf lignes sont éprouvées par `scripts/garde-fous-eslint-ecriture-dexie
  // .test.ts`, écrit par A26 : une glose qui n’est pas testée redevient un espoir
  // au premier changement de sélecteur.
  {
    // ① + ② — le cas général : ni horloge, ni écriture Dexie.
    files: ['apps/field/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/field/src/local/horloge.ts',
      'apps/field/src/local/ecriture.ts',
      'apps/field/src/local/base.ts',
      '**/*.{test,spec}.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...UUID_APPLICATIF,
        ...PAGINATION_SANS_DECALAGE,
        ...HORLOGE_DE_L_APPAREIL,
        ...ECRITURE_DEXIE,
      ],
    },
  },

  {
    // `horloge.ts` EST l’exception à ① : le seul endroit autorisé à lire l’heure
    // de l’appareil (05 §9.2). ② continue de s’appliquer à lui.
    files: ['apps/field/src/local/horloge.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...UUID_APPLICATIF,
        ...PAGINATION_SANS_DECALAGE,
        ...ECRITURE_DEXIE,
      ],
    },
  },

  {
    // Le port d’écriture et la base : les DEUX seuls modules autorisés à écrire
    // dans Dexie. `base.ts` porte `meta`, qui ne se synchronise pas et n’a donc pas
    // d’op ; `ecriture.ts` porte tout le reste, ligne + op dans UNE transaction.
    // ① continue de s’appliquer à eux.
    files: ['apps/field/src/local/ecriture.ts', 'apps/field/src/local/base.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...UUID_APPLICATIF,
        ...PAGINATION_SANS_DECALAGE,
        ...HORLOGE_DE_L_APPAREIL,
      ],
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
