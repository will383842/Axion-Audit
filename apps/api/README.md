# @axion/api — API REST `/v1`

Fastify 5 sur Node 22, PostgreSQL 16 via Drizzle. **Seul point d'entrée aux données** (02 §4.3-2) :
la PWA terrain et la console consomment la même API.

## État au lot L2

Le **schéma** est livré : 43 tables, transcrites LITTÉRALEMENT de `docs/04_MODELE_DE_DONNEES.md` en
SQL brut versionné (`drizzle/*.sql`, numérotées séquentiellement), plus le seed des référentiels et le compte fondateur.
Le lot **L2** ajoute les premières routes métier : authentification, cadrage financier, comptes.

## Routes exposées

| Route                  | Rôle                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`       | **Vivacité** — ne touche aucune dépendance. Docker redémarre le conteneur si elle échoue.                                                |
| `GET /v1/health/ready` | **Préparation** — PostgreSQL (**critique**, `503` si absent), Redis et MinIO (**dégradants**, `200 degraded`). Exemptée du quota global. |

Ces deux routes ne figurent pas aux §8/§24.2 du pack (qui décrivent les routes métier) : elles sont
documentées ici au titre du 11 §8.6. Elles n'exposent ni version, ni nom d'hôte, ni détail d'erreur.

**Pourquoi deux sondes** : les confondre ferait redémarrer en boucle une API dont seule la base est
momentanément indisponible. Le remède deviendrait la panne.

### Comptes — `/v1/users` (lot L2/T3, **`admin` exclusivement**)

Le pack écrit « CRUD users » sur une ligne et ne nomme qu'**une** de ces routes : `GET /v1/users`.
Les six autres sont documentées ici au titre du 11 §8.6, et leur forme est tranchée par deux entrées
`DECISIONS.md` — 2026-08-30 « Le CRUD users n'est pas spécifié : onze silences » et 2026-08-31
« Comment un mot de passe se réinitialise ».

| Route                                | Rôle                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/users`                      | Liste **paginée en keyset**, curseur `(created_at, id)` ascendant. Aucun filtre (le pack n'en nomme aucun).                 |
| `POST /v1/users`                     | Création (`201`). Le compte naît **actif** et **non habilité** (§34.4) ; `usageProfile` vaut `guide_strict` par défaut.     |
| `PATCH /v1/users/:id`                | Modification ordinaire : `name`, `email`, `usageProfile`. Rien d'autre.                                                     |
| `PATCH /v1/users/:id/role`           | Change `users.role`. Refusée **sur son propre compte**.                                                                     |
| `PATCH /v1/users/:id/deactivate`     | §34.4 — désactive le compte **et révoque ses jetons de rafraîchissement**, même transaction. Refusée sur son propre compte. |
| `PATCH /v1/users/:id/habilitate`     | §34.4 — pose `habilitated_at`. Ne réécrit **jamais** une habilitation déjà prononcée (invariant 7).                         |
| `PATCH /v1/users/:id/password-reset` | Mot de passe **engendré par le serveur et rendu une seule fois**. Garde-fou 05 §9.7 — voir ci-dessous.                      |

**Il n'y a pas de `DELETE`**, et c'est délibéré : le « D » de CRUD n'est jamais instancié par le pack,
`users` n'a pas de `deleted_at` (04), et le cycle de sortie §34.4 dit « révocation + retrait des
`mission_users` ». Il n'y a pas non plus de **réactivation** : le catalogue du journal ne connaît que
`user.deactivate` — la question est remontée, pas devinée.

**Quatre actes, quatre routes.** `role`, `deactivate`, `habilitate` et `password-reset` ne sont pas
des champs d'un `PATCH` générique parce que `activity_log` distingue déjà `user.role_change`,
`user.deactivate`, `user.habilitate` et `user.password_reset`. Les fondre rendrait le journal
incapable de **nommer** ce qui s'est passé, contre l'invariant 7.

**Le garde-fou 05 §9.7, sur `password-reset`.** La clé locale de l'appareil terrain (KEK) dérive du
mot de passe : le réinitialiser rend **définitivement illisible** tout ce que l'outbox n'a pas encore
poussé. Le serveur **refuse** donc tant que le dernier `sync_log.outbox_remaining` d'un appareil du
compte est `> 0`, **ou qu'aucune sync n'est connue** — code d'erreur dédié
**`UNSYNCED_DATA_AT_RISK` (409)**, et non `CONFLICT`, pour que la console sache qu'un forçage est
possible et le propose. `PATCH … {"force": true}` passe outre ; l'acte est alors journalisé
`user.password_reset` avec `forcage: true`, et une trace d'exploitation
`reinitialisation_mot_de_passe_forcee` est émise en `warn`.
⚠ Un compte **neuf** n'a aucune ligne de `sync_log` : sa première réinitialisation exige donc
toujours un forçage. C'est ce que le §9.7 écrit (« ou aucune sync connue »).

**Ce que ce README ne couvre pas encore.** Les routes d'authentification
(`POST /v1/auth/login`, `/refresh`, `/logout`, lot L2/T2) et `GET /v1/scoping/:id/financials`
(lot L2/T5) sont livrées et **absentes de ce document**. L'omission est antérieure à T3 et n'est pas
corrigée ici — elle est remontée au rapport du lot plutôt que comblée par un agent qui n'a écrit
aucune de ces routes.

## Conventions (contrat 11 §3, appliquées à toutes les routes)

- **Erreurs** : `{ "error": { "code": "SNAKE_CASE", "message": "…en français", "details"?: [] } }`.
  Les codes vivent dans `@axion/shared` (`ERROR_CODES`) — jamais de littéral libre. Aucune route ne
  construit son enveloppe : le gestionnaire unique de `src/erreurs.ts` s'en charge.
- **Pagination keyset** partout (`?limit=50&after=<curseur>`), jamais d'offset.
- **Dates** ISO 8601 UTC ; `TIMESTAMPTZ` en base ; fuseau de mission à l'affichage seulement.
- **Validation Zod** sur 100 % des entrées, schémas importés de `@axion/shared`. Aucun `any`.
- **Quotas** : global 300 req/min ; `/v1/auth/*` 10 req/min/IP posé au lot L2.

## Journalisation

pino 9 avec **redaction obligatoire** posée sur l'instance racine (`src/logger.ts`) : `person_name`,
emails, contenus de réponse, notes, verbatims et jetons sont masqués. C'est un choix structurel —
compter sur la discipline de chaque appel à `log.info()` ne tiendrait pas (11 §2, 06 §10.4).

## Schéma et données (lot L1)

**Le DDL vit EXCLUSIVEMENT dans `docs/04_MODELE_DE_DONNEES.md`** (11 §2). Les fichiers de
`drizzle/` en sont une transcription ; `src/db/schema.ts` en est un REFLET pour le typage des
requêtes. Ni l'un ni l'autre n'est une source de vérité, et rien n'est jamais « généré » par un ORM.

| Commande                                              | Effet                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm db:migrate:check`                               | dry-run : liste les migrations en attente, vérifie leur réversibilité, n'applique rien |
| `pnpm db:migrate`                                     | applique les migrations en attente, **une transaction par migration**                  |
| `node apps/api/scripts/migrations.mjs --status`       | état du journal `schema_migrations`                                                    |
| `node apps/api/scripts/migrations.mjs --down`         | redescend la dernière migration appliquée                                              |
| `node apps/api/scripts/migrations.mjs --down-to 0000` | redescend TOUT (bac à sable local uniquement)                                          |
| `pnpm db:generate <sujet>`                            | crée le squelette numéroté d'une nouvelle migration (@UP / @DOWN à remplir)            |
| `pnpm seed`                                           | référentiels + compte fondateur — **rejouable à l'identique**                          |
| `pnpm seed:demo`                                      | fixtures de démo déterministes — **refusé si `APP_ENV=prod`**                          |
| `pnpm seed:empreinte`                                 | **lecture seule** : empreinte reproductible du jeu de référence                        |
| `pnpm schema:diff`                                    | compare la base RÉELLE au manifeste extrait du 04 — **zéro écart exigé**               |

### Prouver le jeu de référence — deux instruments, deux questions

`seed.mjs --empreinte` répond à « **rejouer le seed sur CETTE base change-t-il quelque chose ?** »
(critère L1 du fichier 07). Il seede, puis imprime par table le nombre de lignes et un md5 de la
ligne entière — `id` et `updated_at` compris. C'est ce qu'il faut pour l'idempotence, et c'est
précisément ce qui l'empêche de répondre à l'autre question : sur deux bases fraîches, la même
graine donne huit empreintes différentes.

`pnpm seed:empreinte` répond à « **le jeu de référence est-il bien celui qu'on croit ?** ». Il
n'écrit rien (transaction `READ ONLY`), ne mesure que le contenu métier — FK résolues en codes, ni
identifiants alloués ni horodatages — et imprime **une empreinte globale de 32 caractères** en plus
du détail par table. La même graine sur n'importe quelle base fraîche donne la même empreinte :
c'est le chiffre qu'un dossier de porte peut citer et qu'un tiers peut rejouer.

```bash
pnpm seed:empreinte                                  # tableau + empreinte globale
pnpm seed:empreinte -- --json                        # sortie machine (CI)
pnpm seed:empreinte -- --attendue <hex>              # sort en code 1 si le jeu a dérivé
```

**Périmètre — 7 + 1, et les deux ensembles sont nommés.** L'empreinte globale couvre les **7
référentiels** du 11 §5 : `blocks`, `sectors`, `services`, `interlocutor_profiles`, `size_tiers`,
`naf_sector_map`, `estimation_params`. La table `users` est **applicative**, pas un référentiel : le
compte fondateur est mesuré à part, par sa FORME (rôle, profil d'usage, actif, habilitation posée)
et jamais par son identité — son e-mail dépend de l'environnement, son `password_hash` porte un sel
aléatoire, et une empreinte finit copiée dans un dossier de porte versionné.

**Format des migrations** : un fichier `NNNN_sujet.sql`, deux sentinelles `-- @UP` et `-- @DOWN`.
Les deux sont obligatoires — l'exécuteur refuse un fichier sans descente. Les FK circulaires de
`interviews` (`linked_review_answer_id`, `document_request_id`) sont posées par `ALTER TABLE` dans
`0008`, comme le fichier 04 l'impose : une transcription table par table ne compile pas sans cela.

**Depuis la machine hôte**, le `DATABASE_URL` du `.env` vise l'hôte Docker `postgres`, qui ne résout
que depuis un conteneur. Préfixe alors la commande :

```bash
DATABASE_URL=postgresql://axion:<mdp>@localhost:5432/axion_audit pnpm db:migrate
```

## Développement

```bash
pnpm --filter @axion/api dev     # exige packages/shared construit : pnpm build
```

Variables : voir `.env.example`. Le processus **refuse de démarrer** si une variable manque ou si un
secret vaut encore `__CHANGEME__` — un `undefined` silencieux sur un secret est une faille.

## À venir

L2 authentification JWT et RBAC · L3 missions, arbre, questionnaire, machine à états ·
L6 moteur de synchronisation. Les tables `surveys`, `survey_responses` et `solutions_catalog`
arriveront avec **leurs** lots (§28.2-4, §28.2-7) : voir `DECISIONS.md` 2026-08-27, « Les tables de
Phase 2/3 ne sont PAS créées au lot L1 ».
