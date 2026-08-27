# ARCHITECTURE ET INFRA

> **Pack d'implémentation Axion Audit — fichier 02/12** · Pack V2.12 (27/08/2026) — consolidé du CDC maître + revue adversariale indépendante
> **Contenu :** Architecture générale, stack arrêtée, infrastructure Hetzner, exploitation, sauvegardes, scalabilité
> **Règle de précédence (V2.2) :** le présent pack est LA source d'exécution. En cas de divergence interne : §32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15. Le DDL vit exclusivement dans le fichier 04. Le CDC maître est une archive de référence ; les rapports d'audit cités (30 agents, recette, certification) ne sont pas joints : leurs conclusions sont intégralement reprises aux §24, §25 et §29.

---

# 4. ARCHITECTURE GÉNÉRALE

## 4.1 Les 4 briques + les intégrations

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VPS HETZNER (Docker Compose)                    │
│                                                                        │
│  ┌──────────┐   ┌───────────────────┐   ┌───────────────────────────┐  │
│  │  Caddy   │──▶│  API (Fastify/TS) │──▶│  PostgreSQL 16            │  │
│  │ (TLS auto│   │  REST + Auth JWT  │   │  source unique de vérité  │  │
│  │  reverse │   │  + RBAC + sync    │   └───────────────────────────┘  │
│  │  proxy)  │   └──────┬────────────┘   ┌───────────────────────────┐  │
│  └────┬─────┘          │                │ Worker (BullMQ + Redis)   │  │
│       │                │                │ - génération DOCX          │  │
│       │                │                │ - appels LLM par bloc      │  │
│       │                │                │ - exports, purges RGPD     │  │
│       │                │                │ - webhooks console         │  │
│       │                │                └───────────────────────────┘  │
│       │         ┌──────┴───────────┐    ┌───────────────────────────┐  │
│       │         │ Front SIÈGE      │    │ MinIO / stockage fichiers │  │
│       │         │ (admin+dashboard │    │ (pièces jointes, DOCX,    │  │
│       │         │  +rapports)      │    │  photos, audios)          │  │
│       │         └──────────────────┘    └───────────────────────────┘  │
└───────┼────────────────────────────────────────────────────────────────┘
        │ HTTPS
┌───────┴────────────────────┐        ┌──────────────────────────────────┐
│ PWA TERRAIN (offline-first)│        │ ÉCOSYSTÈME AXION-IA.COM          │
│ React+Vite+Dexie/IndexedDB │        │ - Console d'admin (clients,      │
│ file d'attente de sync     │◀──────▶│   devis, formations Qualiopi)    │
│ chiffrement local          │  SSO   │ - Axion CRM Pro (prospection,    │
└────────────────────────────┘ webhooks│  scoring Audit Flash/Ciblé…)    │
                                       └──────────────────────────────────┘
```

## 4.2 Stack technique arrêtée

| Couche           | Choix                                                                                        | Justification                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Serveur          | VPS Hetzner (Falkenstein/Nuremberg, DE)                                                      | RGPD, prix/puissance, décision prise                                                                    |
| OS / conteneurs  | Ubuntu LTS + Docker + Docker Compose                                                         | Reproductibilité, habitude Williams                                                                     |
| Reverse proxy    | Caddy                                                                                        | TLS automatique, config minimale                                                                        |
| Base             | PostgreSQL 16                                                                                | Décision prise ; JSONB pour options/valeurs                                                             |
| Cache / files    | Redis + BullMQ                                                                               | Jobs asynchrones (rapports, LLM, webhooks) — même pattern que le site axion-ia.com (~45 workers BullMQ) |
| API              | Node.js 22 + **Fastify** + TypeScript + Zod (validation)                                     | Léger, rapide, typé de bout en bout                                                                     |
| ORM / migrations | Drizzle ORM (ou Kysely) + migrations SQL versionnées                                         | Contrôle du SQL, pas de magie                                                                           |
| Front            | React 18 + Vite + TypeScript + Tailwind                                                      | Décision prise                                                                                          |
| Offline          | PWA (service worker Workbox) + **Dexie (IndexedDB)**                                         | Décision prise                                                                                          |
| Fichiers         | MinIO (S3-compatible, auto-hébergé)                                                          | Photos, audios, DOCX, gabarits                                                                          |
| DOCX             | **docxtemplater** + gabarit Word charte Axion-IA                                             | Décision prise                                                                                          |
| PDF              | Export depuis Word (manuel V1) ; LibreOffice headless en V2 pour PDF auto                    | Simplicité V1                                                                                           |
| LLM              | API Anthropic (un appel par bloc) ; option modèle hébergé UE si exigence client              | Décision prise                                                                                          |
| Auth             | JWT (access court + refresh token rotatif) maison en V1 ; Authentik en V3 si ~50 consultants | Décision prise (léger d'abord)                                                                          |
| CI/CD            | GitHub Actions → build images → déploiement SSH sur VPS                                      | Cohérent avec l'existant Axion-IA                                                                       |

## 4.3 Principes d'architecture

1. **Offline-first radical** : la PWA terrain fonctionne à 100 % sans réseau (consultation du questionnaire, saisie, notes, pièces jointes). Le réseau est un bonus, jamais un prérequis.
2. **API = seul point d'entrée** aux données. Le front siège et la PWA terrain consomment la même API.
3. **Idempotence** : toute écriture de sync est rejouable sans effet de bord (clé = UUID client).
4. **Immutabilité de la collecte** : une réponse saisie n'est jamais silencieusement modifiée par le système ; toute correction crée une révision horodatée.
5. **Séparation collecte / production** : la machine terrain ne génère jamais le rapport ; le siège ne saisit jamais à la place du terrain (sauf correction tracée).
6. **Tout est étiquetable, rien n'est codé en dur** : blocs, questions, secteurs, paliers, gabarits de rapport vivent en base, modifiables sans redéploiement.

---

# 11. INFRASTRUCTURE, EXPLOITATION ET SCALABILITÉ

## 11.1 Dimensionnement

| Étape                  | Charge                                 | Machine Hetzner                                                                   | Coût/mois  |
| ---------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| V1 (1-3 consultants)   | ~10 missions/an, < 100 k réponses      | CX32/CPX31 (4 vCPU, 8-16 Go)                                                      | ~15-25 €   |
| V2 (5-15 consultants)  | ~50 missions/an                        | CPX41 + volumes                                                                   | ~40-60 €   |
| Cible (50 consultants) | ~200 missions/an, quelques M de lignes | CCX33 dédié vCPU + Postgres sur volume dédié ; option : séparer DB sur 2e serveur | ~100-200 € |

Postgres tient ce volume sans discussion (des millions de lignes = trivial). Le point de vigilance scalabilité n'est pas la base : ce sont les **pics de sync** (50 consultants qui rentrent de mission le vendredi soir) → lots de 100 ops + files BullMQ absorbent ; et la **génération LLM/DOCX** → asynchrone par le worker, jamais dans le cycle requête.

## 11.2 Environnements & CI/CD

`dev` (local Docker Compose) → `staging` (même VPS, sous-domaine, DB séparée — cohabitation ASSUMÉE en V1 (décision V2.2) : limites de ressources Docker (CPU/RAM) sur les conteneurs staging + gel des déploiements staging pendant les jours de collecte client ; VPS staging dédié dès la V2) → `prod`. GitHub Actions : lint + tests + build images + migration DB (avec garde-fou) + déploiement SSH. Migrations toujours rétrocompatibles N-1 (déploiement sans coupure). Versionnage sémantique, changelog.

## 11.3 Observabilité

Logs structurés JSON (pino) centralisés · métriques (latence API, profondeur des files, taille outbox moyenne remontée par les clients, échecs de sync, coûts LLM) · Uptime Kuma (ou équivalent) pour l'alerting (Telegram — canal interne Axion-IA existant) · page d'état interne · alertes : disque > 80 %, échecs webhooks console, job LLM > 5 min, certificat < 15 j.

## 11.4 Sauvegardes & reprise (PRA)

- `pg_dump` toutes les 6 h + WAL archiving (pgBackRest) → rétention 30 j.
- Copie chiffrée quotidienne vers Hetzner Storage Box (site distinct) + 2e copie hebdo hors Hetzner (ex. Scaleway) — règle 3-2-1.
- **Test de restauration automatique nocturne** (même standard que le site axion-ia.com : sauvegardes avec test de restauration) : restore dans un conteneur jetable + requêtes de contrôle + alerte si échec.
- RPO ≤ 6 h (siège). **Côté terrain (correction V2.2)** : le RPO n'est ≈ 0 que contre une panne SERVEUR (les données vivent aussi sur les appareils tant que la mission n'est pas déchargée). Contre le vol, la casse ou la perte d'un APPAREIL hors ligne, le RPO = temps écoulé depuis la dernière sync ou le dernier export de secours — d'où la règle d'exploitation gravée en invariant 8 : sync ≥ 1×/jour + export de secours chiffré (§9.7). RTO cible : 4 h (runbook de reconstruction du VPS documenté, infra scriptée).

---

# 30. ANNEXE OPÉRATIONNELLE — SECRETS, GITHUB, DÉPLOIEMENT (DÉCISIONS TRANCHÉES POUR LE LOT L0)

_(27/08/2026. Complète §11. Ces décisions sont exécutables telles quelles par l'autopilote.)_

## 30.1 Décision d'outillage de déploiement : Docker Compose + GitHub Actions, PAS de Coolify en V1

**Évalué** : Coolify (PaaS auto-hébergé, interface de déploiement), Kamal, Dokploy, vs Compose+Actions.
**Tranché : Docker Compose + GitHub Actions + Caddy**, pour 4 raisons : (1) toute la spec (fichiers 02, 09) est écrite autour de ce socle — zéro réécriture ; (2) un composant de moins à sécuriser, mettre à jour et sauvegarder (Coolify est lui-même une application avec sa base et ses accès admin) ; (3) le flux est trivial pour un projet mono-serveur : build → registre → `docker compose pull && up -d` ; (4) la portabilité reste totale (bascule Scaleway/OVH inchangée). **Coolify reste une option de confort en V2** si la gestion multi-environnements devient pénible — il se pose PAR-DESSUS la même stack sans rien casser. Décision réversible, documentée.

## 30.2 Rappel de la stack complète (fixée, aucune question ouverte)

Hetzner VPS (Ubuntu LTS) · Docker + Compose · Caddy (TLS auto) · PostgreSQL 16 · Redis + BullMQ · MinIO · API Node 22 + Fastify + TypeScript + Zod + Drizzle · Front React 18 + Vite + Tailwind + shadcn/ui (PWA Workbox, Dexie) · Monorepo pnpm (`apps/api`, `apps/field`, `apps/hq`, `packages/shared`, `packages/ui`) · docxtemplater (+ module image licencié) + sharp · API Anthropic · GitHub (repo privé) + Actions + GHCR (registre d'images) · pgBackRest + Storage Box.

## 30.3 Inventaire des secrets (exhaustif — à créer au lot L0)

| Secret                                                 | Usage                                                                     | Où il vit                |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------ |
| `DATABASE_URL` (mdp Postgres)                          | API/worker → base                                                         | `.env` serveur           |
| `REDIS_PASSWORD`                                       | files BullMQ                                                              | `.env` serveur           |
| `MINIO_ROOT_USER/PASSWORD` + clés d'accès applicatives | stockage fichiers                                                         | `.env` serveur           |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`             | signatures de tokens (2 secrets distincts, 64 octets aléatoires)          | `.env` serveur           |
| `APP_ENCRYPTION_KEY`                                   | chiffrement des valeurs sensibles d'`app_settings`                        | `.env` serveur           |
| `ANTHROPIC_API_KEY`                                    | génération LLM (worker uniquement)                                        | `.env` serveur           |
| `CONSOLE_WEBHOOK_SECRET` (HMAC)                        | signatures webhooks console ↔ outil (secret partagé, généré côté console) | `.env` serveur + console |
| `SMTP_*` ou `TELEGRAM_BOT_TOKEN`                       | alertes exploitation                                                      | `.env` serveur           |
| `STORAGE_BOX_*` (SSH/rclone)                           | sauvegardes hors serveur                                                  | `.env` serveur (root)    |
| `DOCXTEMPLATER_LICENSE`                                | module image                                                              | `.env` serveur           |
| `DEPLOY_SSH_KEY` (clé dédiée, restreinte)              | Actions → serveur                                                         | **GitHub Environments**  |
| `GHCR_TOKEN` (ou GITHUB_TOKEN)                         | push/pull d'images                                                        | GitHub                   |

## 30.4 Règles de gestion des secrets (non négociables)

1. **Jamais dans Git** : `.env` gitignoré ; un `.env.example` documente CHAQUE variable (nom, usage, comment la générer) sans aucune valeur réelle.
2. **Sur le serveur** : `/opt/axion-audit/.env`, propriétaire root, `chmod 600` ; provisionné à la main par SSH au lot L0 (pas par la CI) ; sauvegardé CHIFFRÉ (age/gpg) dans la Storage Box (sinon un PRA restaure une infra sans ses clés).
3. **Dans GitHub** : secrets portés par les **Environments** `staging` et `prod` (jamais en secrets de repo globaux) ; l'environnement `prod` exige une approbation manuelle (toi) avant tout déploiement.
4. **Séparation stricte staging/prod** : bases, buckets, clés JWT et clés API distinctes — un secret de staging ne peut RIEN sur la prod.
5. **Détection de fuite en CI** : gitleaks à chaque push (bloquant) + secret scanning GitHub activé + garde-fou dans CLAUDE.md : l'autopilote a interdiction d'écrire une valeur de secret dans un fichier versionné, les tests utilisent des secrets factices.
6. **Rotation** : procédure documentée par secret dans le runbook (JWT : rotation = invalidation des sessions, à faire en heures creuses) ; rotation immédiate si suspicion ; `CONSOLE_WEBHOOK_SECRET` rotatif à double clé (ancienne+nouvelle acceptées 24 h).
7. **Moindre accès** : l'API n'a pas les secrets du worker LLM si séparables ; la clé Anthropic n'existe que dans le conteneur worker.

## 30.5 Configuration GitHub (à créer au lot L0, scriptée)

- Repo **privé** `axion-audit` (ton compte/orga), monorepo pnpm ; `/docs` = le pack (les 10 fichiers).
- **Protection de `main`** : merge uniquement par PR, CI verte OBLIGATOIRE (lint, types, tests dont `@critique`, gitleaks), pas de force-push, historique linéaire.
- Branches de travail par lot (`lot/L0-infra`, `lot/L5-terrain`…) — une PR par lot, revue = pipeline §09.
- **Environments** : `staging` (déploiement auto au merge sur main) · `prod` (déploiement sur tag `v*` + approbation manuelle).
- Dependabot (npm + actions + docker) : CONFIGURÉ au lot L0 mais DÉSACTIVÉ pendant toute la Phase 1 (gel des dépendances, contrat 11 §1 — V2.9 : contradiction levée) ; activation hebdomadaire en Phase 2 avec merge manuel ; CODEOWNERS minimal ; tags semver + changelog automatique.
- **GHCR** comme registre d'images (`ghcr.io/<compte>/axion-audit-{api,field,hq,worker}`), images taguées par SHA + version.

## 30.6 Flux de déploiement (résumé exécutable)

PR mergée → Actions : tests → build des 4 images → push GHCR → job `deploy-staging` : SSH (clé dédiée) → `docker compose pull && docker compose up -d` + migration avec garde-fou (dry-run puis apply) + smoke tests (santé API, login, une écriture/lecture) → notification Telegram. Prod : idem sur tag `v*` après ton approbation dans GitHub. Rollback : `docker compose` re-pointé sur le tag précédent (images conservées 90 j) + migrations rétrocompatibles N-1 (règle déjà posée §11.2).

**Statut : plus aucune décision d'infrastructure ouverte. Le lot L0 est exécutable de bout en bout sans question.**
