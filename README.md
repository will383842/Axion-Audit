# Axion Audit

Outil d'audit IA d'**Axion-IA SAS**. Monorepo pnpm : une API, un worker, une PWA terrain
offline-first et une console siège.

> **Toute session de développement commence par `CLAUDE.md`** (invariants, interdictions, pipeline)
> puis par l'ordre de lecture du lot dans `docs/00_INDEX.md`. Le pack `/docs` (12 fichiers) est
> **LA source d'exécution** ; `docs/archive/` est une archive de référence qui ne prévaut plus.

## Ce que fait le produit

Conduire un audit du potentiel IA d'une entreprise, de la TPE au groupe international : cadrage,
génération du questionnaire, collecte terrain **100 % hors ligne**, synchronisation, consolidation
au siège, rapport et plan d'action.

## Structure

| Chemin            | Rôle                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `apps/api`        | API REST `/v1` (Fastify 5) — **seul point d'entrée aux données**                        |
| `apps/worker`     | Jobs BullMQ (DOCX, LLM, exports, purges RGPD, webhooks)                                 |
| `apps/field`      | PWA terrain offline-first (React 18 + Vite + Dexie)                                     |
| `apps/hq`         | Console siège (React 18 + Vite, desktop-first)                                          |
| `packages/shared` | Schémas Zod, codes d'erreur, types partagés API ↔ fronts                                |
| `packages/ui`     | Design system : tokens de la charte                                                     |
| `infra/`          | Docker Compose, Caddy, sauvegardes, scripts d'exploitation ([runbook](infra/README.md)) |
| `docs/`           | Le pack d'implémentation, l'état, les décisions, les portes                             |

## Démarrer en local

```bash
corepack enable          # impose pnpm 9 (version du contrat)
pnpm install
cp .env.example .env     # puis remplir les __CHANGEME__
pnpm infra:up            # Postgres 16, Redis 7, MinIO, Caddy, apps
```

Tout est servi par Caddy sous **un seul domaine** (`http://localhost:8080`) : `/` → terrain,
`/hq` → console, `/api` → API. C'est ce qui fait qu'il n'y a **aucun CORS** dans ce projet.

## Commandes

| Commande                                                     | Effet                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                   | Toutes les apps en développement                                                            |
| `pnpm build`                                                 | Paquets puis apps                                                                           |
| `pnpm lint` · `pnpm typecheck`                               | 0 erreur exigé (DoD)                                                                        |
| `pnpm test:unit` · `pnpm test:integration` · `pnpm test:e2e` | Suites séparées, comme en CI                                                                |
| `pnpm test:coverage`                                         | ≥ 90 % sur les modules critiques (DoD)                                                      |
| `pnpm check:invariants`                                      | Checklist automatisée des invariants (étape 3 du pipeline)                                  |
| `pnpm check:no-skipped-tests`                                | Aucun test désactivé — liste d'exceptions **vide**                                          |
| `pnpm check:prose`                                           | Dernier bloc ETAT ≤ 25 lignes, dernière décision ≤ 40 lignes                                |
| `pnpm verify:rapide`                                         | Tout ce que la CI vérifie sans conteneur — **joué par le hook `pre-push`**                  |
| `pnpm verify`                                                | La CI complète en local, intégration et e2e compris — **obligatoire avant d'ouvrir une PR** |
| `pnpm infra:restore-test`                                    | Test de restauration Postgres + MinIO depuis zéro                                           |

**Deux hooks git** (`.husky/`, installés par `pnpm install`) : `pre-commit` (gardes du dépôt,
lint-staged, typecheck) et `pre-push` (`verify:rapide`). Un push refusé par le hook est un push
qui aurait rougi en CI ; `--no-verify` ne sert qu'à sauver un `wip:` avant une coupure, et ça
s'écrit dans `docs/ETAT.md`. Un hook `Stop` de Claude Code (`scripts/hook-stop-durabilite.mjs`,
câblé dans `.claude/settings.json`) refuse qu'une session rende la main avec du travail non poussé.

## Règles qui ne se négocient pas

Les 8 invariants et les interdictions vivent dans **`CLAUDE.md`**. Les trois qui surprennent le plus
un nouvel arrivant :

1. **Les UUID v7 sont générés côté applicatif**, jamais en SQL — PostgreSQL 16 n'a pas de `uuidv7()`
   native. Une entité créée hors ligne doit porter son identifiant définitif dès la saisie.
2. **Aucune couleur en dur** hors de `packages/ui` : `pnpm check:invariants` le refuse, y compris
   dans un `index.html` (la couleur de thème y est injectée à la construction).
3. **Aucune donnée personnelle dans les journaux** : la redaction pino est posée sur l'instance
   racine, pas laissée à la vigilance de chaque appel.

## État du projet

`docs/ETAT.md` (dernier bloc = état courant) · `DECISIONS.md` · `AMELIORATIONS.md` ·
`docs/portes/` (checklists de porte signées).
