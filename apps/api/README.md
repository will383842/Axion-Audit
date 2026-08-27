# @axion/api — API REST `/v1`

Fastify 5 sur Node 22, PostgreSQL 16 via Drizzle. **Seul point d'entrée aux données** (02 §4.3-2) :
la PWA terrain et la console consomment la même API.

## État au lot L0

Squelette d'infrastructure HTTP uniquement — **aucune route métier, aucune table**. Ce périmètre est
délibéré : il rend les critères L0 testables (image qui démarre, healthcheck Compose, smoke test de
déploiement) sans empiéter sur L1 (schéma) ni L2 (authentification).
Voir `DECISIONS.md` 2026-08-27 « Squelette applicatif minimal des 5 espaces de travail dès L0 ».

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

## Développement

```bash
pnpm --filter @axion/api dev     # exige packages/shared construit : pnpm build
```

Variables : voir `.env.example`. Le processus **refuse de démarrer** si une variable manque ou si un
secret vaut encore `__CHANGEME__` — un `undefined` silencieux sur un secret est une faille.

## À venir

L1 migrations SQL (transcription littérale du fichier 04) + seed · L2 authentification JWT et RBAC ·
L3 missions, arbre, questionnaire, machine à états · L6 moteur de synchronisation.
