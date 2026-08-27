# @axion/api — API REST `/v1`

Fastify 5 sur Node 22, PostgreSQL 16 via Drizzle. **Seul point d'entrée aux données** (02 §4.3-2) :
la PWA terrain et la console consomment la même API.

## État au lot L1

Le **schéma** est livré : 43 tables, transcrites LITTÉRALEMENT de `docs/04_MODELE_DE_DONNEES.md` en
SQL brut versionné (`drizzle/0001` → `0009`), plus le seed des référentiels et le compte fondateur.
Toujours **aucune route métier** (L2/L3) : l'API n'expose que ses deux sondes de santé.

## Routes exposées

| Route                  | Rôle                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `GET /v1/health`       | **Vivacité** — ne touche aucune dépendance. Docker redémarre le conteneur si elle échoue. |
| `GET /v1/health/ready` | **Préparation** — vérifie PostgreSQL. `503` si une dépendance manque.                     |

Ces deux routes ne figurent pas aux §8/§24.2 du pack (qui décrivent les routes métier) : elles sont
documentées ici au titre du 11 §8.6. Elles n'exposent ni version, ni nom d'hôte, ni détail d'erreur.

**Pourquoi deux sondes** : les confondre ferait redémarrer en boucle une API dont seule la base est
momentanément indisponible. Le remède deviendrait la panne.

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
| `pnpm schema:diff`                                    | compare la base RÉELLE au manifeste extrait du 04 — **zéro écart exigé**               |

`--empreinte` sur le seed imprime, par table, le nombre de lignes et un md5 du contenu : c'est ce
qui PROUVE la rejouabilité au lieu de l'affirmer.

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
