# MATRICE DE TRAÇABILITÉ E1-E47 — SUIVI D'EXÉCUTION

> **Livrable du gardien de la spécification (A02)** — étape 6 du pipeline (09 §3), exigence V2.11
> « traçabilité dans les DEUX sens ».
> **Ce fichier n'est PAS le fichier 08.** Le `docs/08_TRACABILITE.md` est la matrice de CONCEPTION
> (exigence → sections du pack), scellée et immuable. Le présent fichier est la matrice
> d'EXÉCUTION (exigence → code livré, et code livré → exigence). Il vit, il est complété à chaque
> lot, il n'est jamais réécrit.
>
> **Règle de précédence :** §32-36 > §24-31 > §16-22 > §1-15, puis le fichier 11.
> **Règle fondatrice de ce fichier (09 §3.6) :** _« toute route, table, écran ou job livré se
> rattache à une exigence E1-E47 OU à une fiche AMELIORATIONS.md — le code orphelin est REFUSÉ. »_

## Mode d'emploi (à lire avant de compléter au lot suivant)

1. Ce fichier est **append-and-amend** : la section A est mise à jour en place (l'état d'une
   exigence évolue), les sections B et C **s'allongent** d'un bloc par lot et ne sont jamais purgées.
2. **Vocabulaire d'état de la section A**, volontairement restreint à trois valeurs :
   - `couverte` — l'exigence est intégralement satisfaite par du code livré ET prouvé par une
     exécution. Une exigence n'est jamais `couverte` sur déclaration.
   - `partiellement amorcée` — du code livré s'y rattache, mais le cœur de l'exigence reste à venir.
     La colonne « reste à faire » dit quoi et à quel lot.
   - `non commencée — lot Lx` — aucun code. C'est l'état NORMAL de la majorité des exigences
     pendant toute la Phase 1.
3. **La colonne « preuve/emplacement » n'accepte pas une intention.** Un chemin de fichier, une
   commande exécutée avec sa sortie, un numéro de test. Un fichier qui existe prouve qu'il existe ;
   il ne prouve pas qu'il fonctionne.
4. **Section B (code → exigences)** : au brief de chaque lot, tout nouvel artefact livré y entre.
   Un artefact sans rattachement est un **refus de lot**, pas une ligne à compléter plus tard.
5. Un désaccord sur un rattachement se tranche dans `DECISIONS.md`, jamais ici.

---

# A. SENS 1 — EXIGENCES → CODE

**Date d'établissement : 2026-08-27** · **Lot évalué : L0 (incrément L0-a, dépôt)** ·
**Gardien : A02**

| Passe | Commit | Arbre | Verdict |
| --- | --- | --- | --- |
| **1ʳᵉ** | `ce5b912` | **en cours de modification** (2 fichiers à l'ouverture, 9 à la clôture) ; pipeline à l'**étape 3/7**, revue croisée non rendue | **VETO** — 4 écarts (V1-V4) |
| **2ᵉ** | **`fdd5f59`** | **propre** (`git status` vide) ; revue croisée rendue **deux fois** (NON CONFORME → CONFORME AVEC RÉSERVES, réserves fermées) | voir §D |

> **Ce que la 1ʳᵉ passe a appris, et qui vaut règle.** Un contrôle d'acceptation ne se tient pas sur
> un arbre qui bouge, ni avant la revue croisée. Les deux conditions sont réunies pour la 2ᵉ passe.
> **Et une annotation `// Traçabilité : E__` n'est une preuve que si quelqu'un ouvre la section
> citée** — c'est ce qui a fait tomber `axion:sauvegardes` (§B.3), et c'est la méthode réappliquée
> à chaque artefact nouveau en §B.8.

**L0 est un lot d'infrastructure : il ne porte aucune exigence fonctionnelle.** La quasi-totalité
des 47 exigences est donc légitimement `non commencée`. Ce qui se vérifie ici est l'inverse :
qu'**aucune exigence dont L0 avait la charge n'a été oubliée**.

| #   | Exigence (abrégé)                          | État après L0             | Preuve / emplacement                                                                                            | Reste à faire → lot           |
| --- | ------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| E1  | Méthodologie 8+1 blocs                     | non commencée             | —                                                                                                                 | L1 (seed blocs) · L4          |
| E2  | Toutes tailles, 4 paliers                  | non commencée             | —                                                                                                                 | L1 (seed paliers) · L3        |
| E3  | Tous secteurs, paquets sectoriels          | non commencée             | —                                                                                                                 | L1 (seed secteurs) · L3       |
| E4  | Arbre organisationnel profondeur libre     | non commencée             | —                                                                                                                 | L3 (`org_units`, import CSV)  |
| E5  | Scoring par unité, heatmap                 | non commencée             | —                                                                                                                 | L8 · Phase 2 (heatmap)        |
| E6  | Hors ligne total, PC ET tablette           | non commencée             | Amorce sans valeur fonctionnelle : `apps/field/vite.config.ts`, `apps/field/Dockerfile` (annotés E6)               | **L5** (Workbox, Dexie)       |
| E7  | Remontée continue dès qu'il y a du réseau  | non commencée             | —                                                                                                                 | L6                            |
| E8  | Durée d'audit libre, statuts sans fin      | non commencée             | —                                                                                                                 | L3 (machine à états §32.2)    |
| E9  | Multi-consultants, sync sans conflit       | non commencée             | —                                                                                                                 | L2 (propriété §9.9) · L6      |
| E10 | Banque de questions unique versionnée      | non commencée             | —                                                                                                                 | L4 (import) · L9 (back-office)|
| E11 | Questionnaire généré et figé par mission   | non commencée             | —                                                                                                                 | L3 (moteur M2)                |
| E12 | Entretiens par interlocuteur, à-revoir     | non commencée             | —                                                                                                                 | L5                            |
| E13 | Écran 3 zones, enregistrement continu      | non commencée             | —                                                                                                                 | L5                            |
| E14 | Consolidation, divergences, radar          | non commencée             | —                                                                                                                 | L7-min (agrégation) · L8      |
| E15 | Rapport DOCX 12-60 p.                      | non commencée             | File `axion:rapports` déclarée inerte (`apps/worker/src/worker.ts`)                                               | L10                           |
| E16 | Rédaction assistée IA par bloc             | non commencée             | File `axion:llm` déclarée inerte                                                                                  | L11                           |
| E17 | **Stack imposée (Hetzner, Docker, PG, Fastify, Vite/React)** | **partiellement amorcée** | Compose dev/staging/prod validés : `docker compose --env-file … config -q` → **RC=0** sur les 3 combinaisons · `apps/api` (Fastify 5) · `apps/field`/`apps/hq` (Vite+React) · `apps/worker` (BullMQ) · `packages/shared` (Zod) · `pnpm typecheck` 6/6 vert · `pnpm build` 4 images | Dexie/Workbox → L5 · docxtemplater → L10 |
| E18 | Liaison console axion-ia.com               | non commencée             | File `axion:webhooks` déclarée inerte                                                                             | L13                           |
| E19 | Avant-vente : cadrage → devis              | non commencée             | —                                                                                                                 | L2 (étanchéité) · Phase 2     |
| E20 | Suivi avance/retard temps réel             | non commencée             | —                                                                                                                 | Phase 2                       |
| E21 | Auditeurs jamais d'accès aux montants      | non commencée             | —                                                                                                                 | **L2** (porte P-B)            |
| E22 | Console de pilotage 7 espaces              | non commencée             | Coquille annotée : `apps/hq/src/App.tsx`, `apps/hq/vite.config.ts` (base `/hq/`)                                  | L7-min · Phase 2              |
| E23 | Hyper intuitif, novice < 30 min            | non commencée             | —                                                                                                                 | L5 (porte P-C, A54)           |
| E24 | Validation obligatoire de chaque étape     | non commencée             | —                                                                                                                 | L5 (guidé strict/expert)      |
| E25 | Zéro oubli (plan, couverture, contrôles)   | non commencée             | —                                                                                                                 | L3 · L5 · L7-min              |
| E26 | Alertes actives sur les manques            | non commencée             | —                                                                                                                 | Phase 2                       |
| E27 | **Design moderne, charte, WCAG AA**        | **partiellement amorcée** | `packages/ui/src/tokens.ts` + `tokens.css` · **91 tests verts** (`pnpm test:unit`) dont contraste AA et parité TS/CSS · garde-fou INV-4 « aucune couleur en dur » vert | Composants shadcn → L5 · dataviz → L8 |
| E28 | Détecter tout le potentiel IA + formation  | non commencée             | —                                                                                                                 | L7 · L8 · L10                 |
| E29 | Rapport = plan d'action 12 mois            | non commencée             | —                                                                                                                 | L10                           |
| E30 | 3 niveaux d'audit                          | non commencée             | —                                                                                                                 | L3 · L10 (gabarits §26.2)     |
| E31 | **Généricité absolue (aucune réf. client)**| **partiellement amorcée** | Garde-fou mécanique **INV-2 vert** sur 63 fichiers (`pnpm check:invariants`) — la règle est outillée avant le premier code métier | Vérification permanente à chaque lot |
| E32 | Fuseaux, devises, interface française      | partiellement amorcée     | `packages/shared/src/temps.ts` (ISO 8601 UTC, annoté E32) · `TZ` porté par le Compose                              | Fuseau de mission → L3/L5     |
| E33 | **Sécurité / RGPD**                        | **partiellement amorcée** | gitleaks bloquant (`.gitleaks.toml`, job CI `gitleaks`) · **SEC-30.4a/b verts** (aucun secret en dur) · redaction pino (`apps/api/src/logger.ts`) · helmet + CSP + rate-limit (`apps/api/src/app.ts`) · durcissement §10.3 scripté (`infra/scripts/provision-vps.sh`) · ZAP baseline (`.github/workflows/zap-baseline.yml`) · **12/12 familles de secrets §30.3 documentées dans `.env.example`** | Chiffrement local → L5 · consentements/purges → L1/L11 · **durcissement réellement appliqué → L0-b** |
| E34 | Conformité AI Act                          | non commencée             | —                                                                                                                 | L12                           |
| E35 | **Scalabilité + sauvegardes 3-2-1 testées chaque nuit** | **partiellement amorcée** | Livrés : `infra/pgbackrest/pgbackrest.conf`, `infra/postgres/Dockerfile` (pgBackRest dans le conteneur qui archive), `infra/scripts/backup-postgres.sh` (127 l.), `backup-minio.sh` (105 l.), **`restore-test.sh` (362 l., Postgres ET MinIO)**, `install-cron.sh`, `.github/workflows/nightly-restore-test.yml` | **Le test de restauration n'a JAMAIS été exécuté** — c'est le cœur de E35. → L0-b / porte P-A |
| E36 | **Exécutable par lots avec critères**      | **partiellement amorcée** | Pipeline outillé : CI 8 jobs (`.github/workflows/ci.yml`), `pull_request_template.md` avec la case « code → exigences ». **2ᵉ passe : `pnpm verify` → RC=0, 12 contrôles enchaînés, exécutés par le gardien** ; 3 garde-fous auto-périmés **éprouvés par échec provoqué** (§D.1) | Exécution réelle de la CI → **L0-b** (dépôt distant absent) |
| E37 | Scoring intégralement spécifié             | non commencée             | —                                                                                                                 | L8 (+ contrôle bloquant L4)   |
| E38 | Sauvegarde terrain (sync ≥ 1×/j + export)  | non commencée             | —                                                                                                                 | L5c (export) · L6 (sync)      |
| E39 | Machine à états mission                    | non commencée             | —                                                                                                                 | L1 (codes) · L3 (transitions) |
| E40 | ROI normé, échantillonnage, ancres         | non commencée             | —                                                                                                                 | L3 · L4 (ancres) · L11 (ROI)  |
| E41 | Consolidation groupe cadrée                | non commencée             | —                                                                                                                 | L14                           |
| E42 | RGPD renforcé (pseudonymisation, rétention)| partiellement amorcée     | Redaction pino des 8 champs personnels (`apps/api/src/logger.ts`, censeur `[masqué:rgpd]`) · file `axion:purges` déclarée | Rétention `activity_log` → L1/L2 · pseudonymisation 2 passes → L11 |
| E43 | **Exécutabilité autopilote**               | **partiellement amorcée** | Versions épinglées (`.nvmrc`=22, `packageManager`=pnpm@9.15.9, `engines`, images `node:22-alpine`) · conventions API §3 amorcées (`packages/shared` : `errors.ts` ERROR_CODES, `pagination.ts` keyset, `env.ts` Zod) · 40 gabarits d'agents (`.claude/agents/`) · `docs/ETAT.md` (11 §9ter) | Contrat d'ops + `processed_ops` → L6 · format export de secours → L5c |
| E44 | UX/UI 2026-2027 (tokens, police locale)    | partiellement amorcée     | `packages/ui/src/tokens.ts` (tokens chiffrés) · garde-fou **CT-1-CDN vert** (police auto-hébergée, aucun CDN)      | Grille §33 (4 états, raccourcis, écran partagé) → L5 · desktop-first → L7 |
| E45 | Pilotage humain (habilitation, cockpit)    | non commencée             | —                                                                                                                 | L1 (`habilitated_at`) · L2 (§34.4) · L5 (§34.2) · Phase 2 |
| E46 | Bout en bout opérationnel (calendrier, CSV)| partiellement amorcée     | Burn-down tenu (`docs/journal/2026-08-27.md`) — le calendrier daté est vivant                                     | Format CSV d'arbre → L3 · butoir L8 |
| E47 | Profondeur fonctionnelle + conventions     | partiellement amorcée     | Conventions git/DECISIONS matérialisées (`CLAUDE.md` §7, `DECISIONS.md`, `docs/portes/`, `docs/conception/`, `docs/journal/`) · sceau d'intégrité du pack | **Réserves de gouvernance — voir §D.4** · export ZIP §36.3 → L7-min · import banque §36.4 → L4 |

## A.bis — Synthèse chiffrée au 2026-08-27 (fin L0-a)

| État                                   | Nombre | Exigences                                                                 |
| -------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `couverte`                             | **0**  | — (aucune exigence n'est intégralement satisfaite ET prouvée à ce stade)   |
| `partiellement amorcée`                | **12** | E17, E27, E31, E32, E33, E35, E36, E42, E43, E44, E46, E47                |
| `non commencée`                        | **35** | toutes les autres                                                         |

**Aucune exigence dont L0 avait la charge n'est oubliée.** Les 5 exigences que la ligne L0 du
fichier 07 engage directement — E17 (stack), E33 (sécurité/secrets), E35 (sauvegardes testées),
E36 (exécutabilité par lots), E43 (autopilote) — ont toutes du code livré. **Deux d'entre elles ne
sont pas prouvées** : E35 (le test de restauration n'a jamais tourné) et E36 (la CI ne peut pas
passer au vert, §D.1).

---

# B. SENS 2 — CODE → EXIGENCES (le contrôle anti-orphelin)

**Périmètre du contrôle : les 161 fichiers suivis par git au commit `ce5b912`** (`git ls-files`).
Méthode : inventaire par groupe, rattachement de chaque groupe à une exigence E1-E47 ou à une
fiche `AMELIORATIONS.md`. Le dépôt porte des annotations `// Traçabilité : E__` en tête de fichier
— **elles ont été relues, pas prises pour argent comptant** : chacune a été confrontée à la
section du pack qu'elle invoque.

## B.1 — Inventaire du lot L0 (2026-08-27)

| # fichiers | Groupe livré                        | Rattachement                       | Preuve / emplacement                                                                                  |
| ---------- | ----------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 23         | Configuration racine du monorepo    | **E17, E43**                       | `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `eslint.config.js`, `.prettier*`, `.npmrc`, `.nvmrc`, `.editorconfig`, `.gitattributes`, `.dockerignore`, `.lintstagedrc.json`, `vitest.config.ts` — 11 §1 (versions épinglées) |
| —          | `.gitleaks.toml`, `.env.example`    | **E33** (02 §30.4-1/5)             | 12/12 familles de secrets §30.3 vérifiées présentes dans `.env.example`                                |
| —          | `CLAUDE.md`, `README.md`, `.husky/` | **E43, E47**                       | 11 §9bis · 09 §5                                                                                       |
| 15         | `docs/` — le pack + gouvernance     | **source, non code**               | 12 fichiers scellés (`pnpm check:pack` vert) + `ETAT.md`, `journal/`, `portes/`, `conception/`         |
| 41         | `.claude/agents/` (40 gabarits + README) | **E43** (09 §1, chaîne de signature) | Outillage d'autopilote ; périmètres d'écriture contractuels → **fiche A-001** `AMELIORATIONS.md`   |
| 12         | `apps/api` (Fastify)                | **E17, E33, E35, E42, E43**        | voir détail B.2                                                                                        |
| 6          | `apps/worker` (BullMQ)              | **E17, E35**                       | voir détail B.3                                                                                        |
| 8          | `apps/field` (coquille Vite/React)  | **E17** (amorce E6)                | `App.tsx` 50 l., zéro logique métier — écrans réels = L5, explicitement refusés ici                    |
| 8          | `apps/hq` (coquille Vite/React)     | **E17, E22**                       | `App.tsx` 50 l., base publique `/hq/` (11 §2 : pas de CORS)                                            |
| 8          | `packages/shared`                   | **E32, E33, E43**                  | `errors.ts` (ERROR_CODES, 11 §3) · `pagination.ts` (keyset, 11 §3) · `temps.ts` (UTC, E32) · `env.ts` (Zod) |
| 7          | `packages/ui`                       | **E27, E44** + invariant 4         | `tokens.ts`/`tokens.css` · `tokens.test.ts` = **91 tests verts**                                       |
| 16         | `infra/`                            | **E17, E33, E35**                  | voir détail B.4                                                                                        |
| 13         | `.github/`                          | **E33, E36, E43**                  | voir détail B.5                                                                                        |
| 4          | `scripts/`                          | **E31, E36, E43, E47**             | voir détail B.6                                                                                        |

## B.2 — Détail : les 2 routes livrées (contrôle 11 §8.6)

| Route              | Rattachement            | Documentée ? (11 §8.6)                                                                | Verdict      |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- | ------------ |
| `GET /v1/health`   | **E17, E35** · 02 §30.6 (« smoke tests : santé API ») | OUI — `DECISIONS.md` 2026-08-27 « Squelette applicatif minimal » **et** `apps/api/README.md` | **rattachée** |
| `GET /v1/health/ready` | **E17, E35** · sonde de préparation Compose | OUI — `apps/api/README.md` (503 si dépendance manquante). *Non nommée dans l'entrée DECISIONS, qui ne cite que `/v1/health`* | **rattachée** (remarque §D.5) |

Aucune de ces deux routes n'est listée aux §8/§24.2 du pack — **c'est licite** : 11 §8.6 interdit
de créer une route non listée « **sans la documenter** », pas de la créer. Les deux le sont.
Fichiers : `apps/api/src/routes/sante.ts`, `app.ts`, `server.ts`, `config.ts`, `db.ts`, `erreurs.ts`,
`logger.ts`. **`db.ts` a été relu spécifiquement** : il ne déclare aucun schéma (11 §2 — le DDL vit
exclusivement au fichier 04) ; il n'empiète donc pas sur L1.

## B.3 — Détail : les 6 files BullMQ déclarées (`apps/worker/src/worker.ts`)

Aucune n'a de processeur : le worker journalise « Aucun traitement pour… ». **Ce ne sont pas des
jobs livrés, ce sont des noms réservés.** Contrôlées une par une :

| File                 | Rattachement invoqué      | Vérification du gardien                                                                     | Verdict          |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| `axion:rapports`     | L10 — génération DOCX     | 07 §12 Phase 2 confirme L10 · **E15**                                                          | rattachée        |
| `axion:llm`          | L11 — appels LLM par bloc | 07 §12 Phase 2 confirme L11 · **E16**                                                          | rattachée        |
| `axion:exports`      | L7 — export §36.3         | 07 §12 lot L7-min confirme · **E47**                                                           | rattachée        |
| `axion:purges`       | 06 §10.4 — purges         | Vérifié dans `docs/06` : « purges = jobs planifiés + journalisés » · **E42**                   | rattachée        |
| `axion:webhooks`     | L13 — webhooks console    | 07 §12 Phase 2 confirme L13 · **E18**                                                          | rattachée        |
| `axion:sauvegardes`  | « 02 §11.4 — sauvegardes MinIO pilotées depuis l'application » | **La référence ne tient pas.** Le §11.4 lu intégralement décrit pgBackRest, WAL, copie chiffrée et test de restauration nocturne — **du cron et des scripts d'infra, jamais un job applicatif**. La ligne L0 du fichier 07 confie d'ailleurs ces sauvegardes à `mc mirror`, livré en `infra/scripts/backup-minio.sh`. Aucun lot du pack ne prévoit une sauvegarde pilotée par l'application. | **RATTACHEMENT NON ÉTABLI** → §D.2 |

## B.4 — Détail : `infra/` (16 fichiers)

Chaque fichier porte en tête la ou les sections du pack qu'il exécute ; toutes ont été vérifiées
comme existantes et pertinentes.

| Fichier                          | Sections invoquées         | Rattachement    |
| -------------------------------- | -------------------------- | --------------- |
| `docker-compose.yml`             | 02 §4.1, §4.2, §30.2, 06 §10.3 | **E17**     |
| `docker-compose.staging.yml`     | 02 §11.2, §30.4, §30.6     | **E17, E33**    |
| `docker-compose.prod.yml`        | 02 §30.6, §30.4, §11.2     | **E17, E33**    |
| `caddy/Caddyfile`                | 02 §11.2, §11.3, 06 §10.2, 11 §2 (pas de CORS) | **E17, E33** |
| `postgres/Dockerfile`            | 02 §11.4                   | **E35**         |
| `pgbackrest/pgbackrest.conf`     | 02 §11.4, §30.4            | **E35, E33**    |
| `scripts/backup-postgres.sh`     | 02 §11.4, §11.3, §30.4     | **E35**         |
| `scripts/backup-minio.sh`        | 02 §11.4, §30.4            | **E35**         |
| `scripts/restore-test.sh`        | 02 §11.4, §11.3, §30.4     | **E35** — porte le critère L0 « restauration Postgres ET MinIO » |
| `scripts/install-cron.sh`        | 02 §11.4                   | **E35**         |
| `scripts/provision-vps.sh`       | 06 §10.3, 02 §30.4, §11.4  | **E33, E35**    |
| `scripts/deploy.sh`              | 02 §30.6, §11.2, §11.3     | **E17, E36**    |
| `scripts/smoke-test.sh`          | 02 §30.6                   | **E36** — étape « login » du §30.6 explicitement reportée à L2 (TODO tracé, §D.4) |
| `scripts/lib/common.sh`          | 02 §11.3, §30.4, §30.6     | **E35, E43**    |
| `README.md`                      | runbook §30.4-2, PRA §11.4 | **E35, E43**    |

## B.5 — Détail : `.github/` (13 fichiers)

| Fichier                          | Rattachement                          | Vérification                                                     |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `workflows/ci.yml`               | **E36, E43** · 02 §30.5               | 8 jobs, chaîne `lint→typecheck→unit→integration→e2e→schema-diff→build→deploy-staging` |
| `workflows/build-images.yml`     | **E17, E36** · 02 §30.5 (GHCR)        | 4 images                                                           |
| `workflows/deploy-staging.yml`   | **E36** · critère L0 « déploiement staging par la CI OK » | `workflow_call` depuis `ci.yml`, environment `staging` |
| `workflows/deploy-prod.yml`      | **E36** · 02 §30.5 (approbation)      | tag `v*`                                                           |
| `workflows/nightly-restore-test.yml` | **E35** · 02 §11.4 (« test nocturne ») | cron `0 3 * * *`                                              |
| `workflows/zap-baseline.yml`     | **E33** · 07 §13 (« ZAP baseline en CI ») | rattachée                                                      |
| `coverage-critical-paths.json` + `scripts/check-coverage.mjs` | **E36, E43** · DoD 09 §3 | 7 modules critiques déclarés `non livré` avec leur lot — dispositif exemplaire, voir §C |
| `actions/setup-node-pnpm/`, `CODEOWNERS`, `dependabot.yml`, `pull_request_template.md` | **E36, E43** · 02 §30.5 | Dependabot configuré ET désactivé (11 §1) |

## B.6 — Détail : `scripts/` (4 garde-fous)

| Script                       | Rattachement          | Preuve d'exécution (2026-08-27)                                              |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `check-invariants.mjs`       | **E31, E27/E44, E43** | `pnpm check:invariants` → **vert**, 63 fichiers, 8 contrôles (INV-1/2/4, CT-2-NEXT, CT-2-PRISMA, CT-1-CDN, SEC-30.4a/b) — et il déclare lui-même les 5 invariants NON mécanisables |
| `check-no-skipped-tests.mjs` | **E36, E43** · 11 §2  | `pnpm check:no-skipped-tests` → **vert**, 1 fichier de test analysé, liste d'exceptions vide |
| `check-pack-integrity.mjs`   | **E36, E43, E47**     | `pnpm check:pack` → **vert**, 12/12 · rattaché à `AMELIORATIONS.md` étage 1 (~0,1 j) |
| `schema-diff.mjs`            | **E17, E36, E43**     | `pnpm schema:diff` → « NON APPLICABLE — le lot L1 n'est pas livré », auto-désactivation qui **disparaît dès que `apps/api/drizzle/` existe**. Rien n'est déclaré conforme. |

## B.7 — VERDICT ANTI-ORPHELIN DU LOT L0 (1ʳᵉ passe, `ce5b912`)

**Code orphelin : 1 élément.** Le nom de file `axion:sauvegardes` (§B.3) invoque une section du pack
qui ne le porte pas. Tout le reste des 161 fichiers se rattache à une exigence E1-E47 vérifiée, ou
à la fiche A-001 d'`AMELIORATIONS.md`.

**→ RÉSOLU en 2ᵉ passe** : la file a été **supprimée**. Vérifié : `NOMS_DE_FILES` n'en compte plus
que 5 (`rapports`, `llm`, `exports`, `purges`, `webhooks`), toutes rattachées. Le commentaire
expliquant le retrait est resté dans le code — la leçon vaut au-delà de cette ligne.

C'est un résultat solide : le dépôt a été construit avec la traçabilité en tête et non reconstituée
après coup. La discipline à tenir aux lots suivants est de **ne jamais laisser une annotation
`// Traçabilité : E__` tenir lieu de preuve** — l'annotation dit où l'auteur croyait rattacher son
code ; le gardien vérifie que la section citée dit bien ce qu'on lui fait dire.

## B.8 — Inventaire du code NOUVEAU (2ᵉ passe, `ce5b912` → `fdd5f59`)

**175 fichiers suivis** (+14). Méthode inchangée : pour chaque artefact, **la section citée a été
ouverte** et confrontée à ce qu'on lui fait dire.

| Artefact nouveau | Rattachement | Vérification du gardien (section ouverte) | Verdict |
| --- | --- | --- | --- |
| `packages/shared/src/redaction.ts` | **E33, E42** · 06 §10.4 · 11 §2 | **06 §10.4 ouvert** : base légale, minimisation, pseudonymisation 2 passes — soutient la politique. **Et le module est réellement CÂBLÉ** : importé par `apps/api/src/logger.ts` **et** `apps/worker/src/worker.ts`, exporté par `shared/index.ts`. Il supprime une duplication où les deux listes pouvaient diverger | **rattaché** |
| `e2e/socle.e2e.ts` + `playwright.config.ts` | **E36, E43** · DoD « tous les tests verts » · amorce E6/E17 | **8 tests exécutés par moi, verts.** Ils ne sont pas décoratifs : ils vérifient à l'exécution l'**invariant 4** (tokens, aucune couleur en dur), l'**invariant 5** (français), et **11 §1/§2** (« ne contacte AUCUN domaine extérieur ») — ce qu'aucun contrôle statique ne peut prouver. `forbidOnly` en CI empêche qu'un `.only` oublié verdisse la suite | **rattaché** |
| `scripts/check-jonction.mjs` | **E36, E43** · 02 §30.4-1 · fiche `AMELIORATIONS.md` étage 1 | Fiche présente, plafond respecté (**~0,3 j / 0,5 j**). **Éprouvé par moi** : variable fantôme injectée dans un clone → **RC=1** avec le bon message | **rattaché** |
| `scripts/check-test-projects.mjs` | **E36, E43** · 09 §5.7 · 07 §13 | **Éprouvé par moi** : `apps/api/drizzle/` créé dans un clone → **RC=1**, et le message énumère les tests du 07 §13 attendus. La péremption de `--passWithNoTests` est **réelle**, pas déclarée | **rattaché** |
| `apps/api/scripts/{migrations,seed,db-generate}.mjs` | **E17, E36, E43** · 11 §5 · 02 §30.6 | Vérifié qu'il s'agit de **souches auto-périmées**, non d'une implémentation L1 : `exit 0` + « SANS OBJET » tant que L1 n'est pas livré, `exit 1` ensuite. **Aucun empiètement sur le périmètre d'A12** | **rattaché** |
| `infra/scripts/backup-caddy.sh` | **E35** · 02 §11.4 | Attention : c'est la section qui avait fait tomber `axion:sauvegardes`. **Ouverte à nouveau** — elle tient ici, car il s'agit d'un **script d'infrastructure** (comme `backup-minio.sh`), pas d'un job applicatif. Arbitré en propre dans `DECISIONS.md` (« un PRA qui dépend d'un quota Let's Encrypt n'est pas un PRA ») | **rattaché** |
| `infra/caddy/fronts.static.caddy` | **E17, E6** · invariant 1 · 05 §31 | **05 §31 ouvert** : règle 1 (mise à jour applicative, service worker) — la maîtrise du `Cache-Control` de `sw.js` en dépend réellement. Arbitré dans `DECISIONS.md` « Comment les fronts sont servis en production (défaut B-7) », entrée **vérifiée présente** | **rattaché** |
| `infra/caddy/fronts.dev.caddy` | **E17** (sœur du précédent) | Rattachement évident par construction, mais **seul fichier du dépôt sans aucune annotation ni référence de section** (§D.5) | **rattaché** (remarque) |
| Volumes `field_dist`, `hq_dist` (+ `staging_*_dist`) | **E17, E6** | **4 racines distinctes** montées `:ro` dans Caddy ; la bascule `CADDY_FRONT_CONFIG` est **imposée en dur** en prod (l. 147), non lue du `.env` — un staging ne peut pas servir la prod | **rattachés** |

**Code orphelin en 2ᵉ passe : aucun.**

---

# C. DEFINITION OF DONE TRANSVERSE — QUAND CHAQUE LIGNE DEVIENT EXIGIBLE

Une DoD dont on ne sait pas quand elle s'applique ne s'applique jamais. Ce tableau est le
calendrier d'exigibilité, à relire au brief de chaque lot.

Statuts **recochés sur `fdd5f59`**, par exécution du gardien (`pnpm verify` → **RC=0**, 12 contrôles
enchaînés : lint · format:check · typecheck · check:pack · check:invariants · check:jonction ·
check:no-skipped-tests · check:test-projects · build · test:unit · test:integration · test:e2e).

| Ligne de la DoD (09 §3)                        | Statut au L0            | Devient exigible à…                                              |
| ---------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| lint + typecheck stricts = 0 erreur            | **COCHÉ**               | dès L0, à chaque lot                                               |
| tous les tests verts, aucun skippé             | **COCHÉ** (2ᵉ passe)    | dès L0. 91 unitaires + **8 E2E** verts, exécutés par moi ; anti-skip vert (2 fichiers) ; `check:test-projects` vert (aucun test hors projet) |
| couverture ≥ 90 % sur les modules critiques    | **sans objet**          | **L2** (RBAC, auth) — premier module critique livré ; puis L5a/L5c (crypto, export), L6a (sync), L8 (scoring). **Mesurée à nouveau : 15,13 % global** — aucun module critique n'existe, le chiffre global n'a donc aucun sens ici |
| migrations up/down exécutées sur staging       | **sans objet**          | **L1** (premières migrations) — porte P-A                          |
| tout écran livré avec ses 4 états (§33.2)      | **sans objet**          | **L5** (PWA terrain) puis **L7-min** (console) — porte P-C          |
| axe-core vert                                  | **sans objet**          | **L5** — premier écran réel ; A28                                  |
| `@filrouge` vert sur FIL-TPE ET FIL-GC         | **sans objet**          | **L1** — les deux missions canoniques naissent en fixtures au L1 (09 §4bis) ; le scénario s'allonge ensuite à chaque lot |
| README de l'app à jour                         | **COCHÉ**               | dès L0, à chaque lot                                               |
| aucun TODO/FIXME sans entrée DECISIONS/AMELIORATIONS | **COCHÉ**         | dès L0, à chaque lot                                               |
| diff schéma-vs-04 = zéro écart                 | **sans objet**          | **L1** — critère propre du lot L1 ; porte P-A                      |

---

# D. RÉSERVES ET POINTS OUVERTS DU LOT L0

## D.0 — STATUT DES QUATRE ÉCARTS, APRÈS 2ᵉ PASSE (`fdd5f59`)

| Écart | Statut | Preuve — **exécutée** sauf mention contraire |
| --- | --- | --- |
| **V1** — la CI ne peut pas passer au vert | **LEVÉ** | `@playwright/test` **1.62.1** épinglé (`save-exact`, 11 §1), `playwright.config.ts` avec `webServer`, `forbidOnly` en CI. **8 tests E2E exécutés, verts.** `test:integration` porte `--passWithNoTests`, **rendu auto-péremptoire et éprouvé** (§D.1) |
| **V2** — le HEAD commité ne démarre pas | **LEVÉ** | `CADDY_STAGING_SITE_ADDRESS` documentée au `.env.example` et fournie par les Compose. `docker compose config -q` → **RC=0 sur les 3 combinaisons** (dev · +prod · +prod+staging). `check:jonction` : **76 variables, 0 anomalie**, et **éprouvé** (§D.1) |
| **V3** — pipeline hors séquence | **LEVÉ** | Revue croisée rendue **deux fois** avant cette passe ; `git status` **vide** ; faute d'orchestration tracée en `DECISIONS.md` et au dossier de porte. Le contrôle se tient enfin sur un état figé, après l'étape 4 |
| **V4** — gouvernance `DECISIONS.md` | **PARTIELLEMENT LEVÉ** | Les 12 sous-décisions groupées sont réémises une par une avec `Options :` et **le motif de rejet de l'alternative** — remède juste, et le refus de réécrire l'historique append-only est **le bon raisonnement**. **Mais 4 entrées du jour restent sans `Options :` et 19 sans citation de la précédence** (§D.4) |

## D.1 — V1 : levé, et les garde-fous ont été ÉPROUVÉS, pas lus

La leçon de ce lot est qu'un garde-fou non branché — ou qui ment — est pire que pas de garde-fou.
Je ne me suis donc pas contenté de lire les trois nouveaux contrôles : **je les ai fait échouer**,
dans un **clone jetable du dépôt** (scratchpad), sans jamais toucher au dépôt réel.

| Garde-fou | Épreuve menée | Résultat |
| --- | --- | --- |
| `check:test-projects` | création de `apps/api/drizzle/` (marqueur L1) dans le clone | **RC=1** — « le drapeau ferait passer au vert une suite VIDE », et le message énumère les tests du 07 §13 attendus |
| `schema:diff` | même clone, L1 simulé sans manifeste | **RC=1** — « manifeste introuvable alors que L1 est livré » |
| `check:jonction` | injection d'une variable `AXION_VARIABLE_FANTOME` non documentée | **RC=1** — anomalie localisée au fichier et à la ligne, avec le motif 02 §30.4-1 |

Les trois péremptions sont **réelles**. C'est ce qui permet d'accepter `--passWithNoTests` au L0 :
le drapeau est honnête aujourd'hui et **cesse mécaniquement de l'être** au L1.

## D.1bis — Trace de la réserve initiale (1ʳᵉ passe, `ce5b912`)

`pnpm test:integration` → **RC=1** (« No test files found, exiting with code 1 ») ; `pnpm test:e2e`
→ Playwright n'est déclaré dans **aucun** `package.json` et il n'existe aucun `playwright.config.*`.
`passWithNoTests` est absent de tout le dépôt. Or `ci.yml` appelle ces deux commandes en jobs
bloquants (lignes 315 et 347), et la chaîne `needs:` est
`unit → integration → e2e → schema-diff → build → deploy-staging`.

**Conséquence :** `build` et `deploy-staging` ne s'exécutent jamais. Le critère L0 « déploiement
staging par la CI OK » n'est pas seulement non vérifié, il est **inatteignable avec le code
commité** ; et la protection `main` du 02 §30.5 (« CI verte OBLIGATOIRE ») rendrait la branche
`lot/l0-infra` non mergeable.

**Ce n'est couvert par aucune justification existante.** Ni le démon Docker arrêté, ni le découpage
L0-a/L0-b : c'est un défaut **entièrement codable**, réparable sans VPS ni Docker. Le journal du lot
note « aucune suite au L0 » pour ces deux commandes, mais ne relève pas que la CI les traite comme
fatales. `schema-diff.mjs` et `check-coverage.mjs` montrent pourtant le bon motif dans ce même dépôt :
se déclarer explicitement sans objet, et se réarmer tout seuls dès que le code concerné apparaît.

## D.2 — File `axion:sauvegardes` : rattachement non établi

Voir §B.3. À corriger au L1 : soit la référence est rectifiée vers une section qui prévoit
réellement une sauvegarde pilotée par l'application, soit la file est retirée, soit elle fait
l'objet d'une fiche `AMELIORATIONS.md`.

## D.3 — Le HEAD commité ne démarre pas ; le correctif n'est pas commité

Au commit `ce5b912`, `infra/caddy/Caddyfile` (commité) déclare un second bloc de site
`{$CADDY_STAGING_SITE_ADDRESS}` et des upstreams `staging-api` / `staging-hq` / `staging-field`.
Vérification : `git grep CADDY_STAGING_SITE_ADDRESS HEAD` → **2 occurrences, toutes deux dans le
Caddyfile**. Aucun fichier Compose commité ne fournit cette variable, et `.env.example` ne la
documente pas. Le commentaire du dépôt le dit lui-même : « une adresse de site vide empêcherait
Caddy de démarrer ».

Le correctif existe — variable `CADDY_STAGING_SITE_ADDRESS`, attachement de Caddy au réseau
`axion-edge-staging` — mais **uniquement dans le répertoire de travail, non commité**.
`docs/ETAT.md` le confirme : « A11 applique l'arbitrage Caddy », étape **3/7**.

Conséquence pour la porte : **l'état commité de L0 est incohérent** — il livre un frontal qui ne
démarre pas. Ce n'est pas une réserve d'exploitation, c'est un défaut du livrable versionné.

**Évolution constatée en séance (à vérifier après commit).** L'arbre de travail a progressé pendant
le contrôle et va dans le bon sens : `.env.example` documente désormais
`CADDY_STAGING_SITE_ADDRESS` (02 §30.4-1 satisfait), `CADDY_STAGING_API_PORT` a été **supprimée** au
profit d'une convention `API_PORT=3000` (17ᵉ entrée `DECISIONS.md`, raisonnement solide : une
variable dont deux copies doivent coïncider à la main est une panne en attente), et `caddy_data`
entre au périmètre de sauvegarde — arbitrage juste, un PRA qui dépend d'un quota Let's Encrypt n'est
pas un PRA. **Contre-vérification du gardien**, sur l'arbre vivant :
`docker compose --env-file .env.example config -q` → **RC=0** sur les trois combinaisons
(dev · dev+prod · dev+prod+staging). **Rien de tout cela n'est commité.**

## D.4bis — V4 : ce qui est réparé, et le trou qui reste (2ᵉ passe, 23 entrées)

**Contrôle mécanique du gardien sur les 23 entrées : 4 conformes, 19 non conformes.**

Ce que je valide : le refus de réécrire les entrées en place est **le bon raisonnement** —
`DECISIONS.md` est append-only, et le réécrire pour se mettre en conformité serait exactement le
changement silencieux que le format existe pour empêcher. Les 12 sous-décisions réémises portent
désormais chacune son alternative **et le motif de son rejet** : c'est plus informatif que l'original.

**Le trou qui reste — et il porte sur du code vivant :**

| Entrée | Manque | Pourquoi ça compte |
| --- | --- | --- |
| « Nomenclature des lots L9 à L13 » | `Options :` | Corrige une erreur réelle (L12 = AI Act) qui s'était propagée dans 6 gabarits d'agents |
| « Suites de l'arbitrage Caddy » | `Options :` (et groupe **4** décisions) | C'est elle qui justifie **`infra/scripts/backup-caddy.sh`**, fichier bien présent dans le dépôt |
| « Nom de l'outil de délégation » | `Options :` | Portée mineure |
| « Verdict de la revue croisée » | `Options :`, `Arbitrage :` | Cas limite : un verdict n'est pas une décision — mais il porte une « Suite donnée » qui en est une |
| **19 des 23** | citation de la précédence dans l'`Arbitrage :` | La règle de conduite ne vaut que **« dès L1 »** |

Appliqué à la lettre, le §9bis efface encore l'entrée qui justifie `backup-caddy.sh`. **Ce n'est pas
de la pédanterie** : du code est dans le dépôt au nom d'une décision qui, selon la règle du projet,
n'existe pas. La reprise a couvert les 12 points ; elle n'a pas couvert ces quatre entrées-là.

**Réponse à la question posée par A01 — la règle de conduite est-elle suffisante ?** Sur le fond,
oui : « précédence citée ou déclarée sans objet » + « une entrée = une décision » ferment la cause.
**Sur la forme, il manque ce que ce lot a inventé partout ailleurs : le contrôle mécanique.**
`check:pack`, `check:jonction`, `check:test-projects`, `check:invariants`, `check-coverage` — la
gouvernance `DECISIONS.md` est désormais **la seule règle du dépôt qui repose sur la seule
discipline**, dans un lot dont la revue croisée a précisément trouvé « trois garde-fous qui mentaient
ou n'étaient branchés nulle part ». **Le pack n'exige nulle part cette mécanisation : c'est donc une
RECOMMANDATION, pas un écart** — je ne peux pas exiger ce qui n'est écrit nulle part.

## D.4 — Gouvernance : format des entrées `DECISIONS.md` (constat de 1ʳᵉ passe)

16 entrées, toutes au format d'en-tête `## AAAA-MM-JJ — [L0] Question`, toutes pourvues de
`Décideur :` et `Impact spec :`. Écarts au format imposé 11 §9bis :

| Entrée                                              | Manque                                  |
| --------------------------------------------------- | --------------------------------------- |
| « Points d'infrastructure actés sans réserve »      | **ni `Options :` ni `Arbitrage :`** — et elle porte **12 sous-décisions** |
| « Nomenclature des lots L9 à L13 »                  | `Options :`                             |
| « Nom de l'outil de délégation »                    | `Options :`                             |
| **les 16 entrées**                                  | la **règle de précédence citée dans `Arbitrage :`** — elle n'apparaît qu'une fois, en en-tête de fichier (ligne 5), jamais dans un arbitrage |

11 §9bis : « Une décision non tracée dans ce format n'existe pas. » Appliquée à la lettre, la
première ligne du tableau efface 12 arbitrages d'infrastructure.

**TODO/FIXME** : un seul dans tout `apps packages infra scripts .github` —
`infra/scripts/smoke-test.sh:126` `TODO(L2)`, adossé à l'entrée `DECISIONS.md` « Squelette
applicatif minimal » qui reporte explicitement l'étape « login » du §30.6 au lot L2. **Conforme.**

**Branches et commits** : branche `lot/l0-infra` conforme à `lot/<code>` ; 3 commits, tous
conventionnels (`chore(l0):`, `feat(l0):`, `fix(l0):`) ; `main` ne porte qu'un seul commit, la
genèse `1f63eb1`. **Conforme.** Aucun tag : normal, les tags se posent aux portes et P-A ferme
L0+L1. Aucun `origin` : tracé en `DECISIONS.md`, relève de L0-b.

## D.6 — Le pipeline n'est pas à l'étape 6

`docs/ETAT.md` (dernier bloc, qui fait foi) place le lot à l'**étape 3/7** et donne pour prochaine
action « lancer la REVUE CROISÉE (étape 4) **et** le contrôle d'acceptation du gardien (étape 6) ».
Or 09 §3 énonce **7 étapes obligatoires, aucun raccourci**, et l'étape 6 vient après l'étape 4
(revue croisée intégrale par un agent qui n'a rien produit) et l'étape 5 (suite complète de tests).
L'étape 4 n'a pas eu lieu.

Le présent contrôle est donc rendu **hors séquence**. Il reste valide comme constat technique — les
preuves exécutées sont des faits — mais il **ne vaut pas franchissement de l'étape 6** : il devra
être rejoué sur l'état commité, après la revue croisée. Le signaler fait partie du travail du
gardien : accepter de tamponner l'étape 6 alors que l'étape 4 n'a pas eu lieu viderait le pipeline
de sa fonction, exactement comme l'aurait fait un vérificateur qui corrige ce qu'il vérifie
(fiche A-001, `AMELIORATIONS.md`).

Point annexe : **`docs/journal/` n'est pas suivi par git** (`git status` : `?? docs/journal/`). Le
journal de lot et le burn-down du 09 §5.4 n'existent donc pas au sens du 11 §9ter.

## D.5 — Remarques (sans effet sur le verdict)

- `/v1/health/ready` est documentée dans `apps/api/README.md` mais pas nommée dans l'entrée
  `DECISIONS.md` qui ne cite que `/v1/health`. 11 §8.6 est satisfait ; l'entrée gagnerait à la citer.
- `pnpm infra:config` n'est pas autoportant en local (il lui faut un `.env` ; sans lui :
  `invalid spec: pgbackrest_repo::`). La CI fabrique bien un `.env` éphémère, donc **ce n'est pas un
  défaut de CI** ; c'est une aspérité de confort local. `infra/README.md` documente la bonne forme.
- La CI ne valide la syntaxe que de `infra/docker-compose.yml`. Les surcharges staging et prod ne
  sont pas contrôlées en CI (elles sont valides — vérifié à la main ce jour, RC=0). Aucun texte du
  pack ne l'exige : **remarque, pas écart.**
- Node v24.19.0 en local contre Node 22 épinglé : écart connu, tracé, non fatal (`engine-strict`
  à `false`), et sans effet sur la CI ni sur les conteneurs.

---

# D.7 — CE QUI MANQUE AU DOSSIER DE PORTE `docs/portes/PORTE_A_2026-08-27.md`

Le fichier existe, il est honnête, et sa section 7 assume la faute d'orchestration au lieu de la
lisser. Ce qui suit est ce qu'il lui manque **pour être une trace d'audit au moment où Williams
signera** — pas une critique de son état « en préparation », qui est légitime.

| # | Manque | Pourquoi |
| --- | --- | --- |
| 1 | **Une affirmation inexacte à corriger** : §6 dit `DECISIONS.md` « **23 entrées, toutes horodatées et au format** », puis reconnaît dans la phrase suivante que l'écart de forme n'a pas été réparé en place. Mesure du gardien : **4 conformes / 19 non conformes** | C'est le motif exact que le fichier reproche lui-même à l'auto-revue en §7 : « elle a conclu au-delà de ce qu'elle avait mesuré ». Formulation juste : « 23 entrées ; 4 au format complet ; les 19 antérieures relèvent de l'entrée de reprise, la règle s'applique dès L1 » |
| 2 | **Aucune colonne « sortie constatée / date / opérateur »** | 11 §9bis exige la preuve « lien CI, capture, **commande** ». Une commande *à exécuter* n'est pas une preuve : il faut l'endroit où coller sa **sortie**, avec qui l'a lancée et quand. Sans cette colonne, les ⬜ deviendront des ✅ sans trace |
| 3 | **Pas de verdict A51 (sécurité)** | 09 §3 étape 6 : « la sécurité (A51) et l'UX novice (A54) rendent leur verdict **quand le lot les concerne** ». A54 est sans objet (aucun écran). **A51 concerne L0** : durcissement 06 §10.3, 12 familles de secrets, CSP, gitleaks, ZAP rendu non bloquant jusqu'à L2. Une ligne « A51 — sans objet » serait déjà mieux que le silence |
| 4 | **La DoD « migrations up/down » y est notée « sur staging » sans dire que staging dépend de L0-b** | Le critère L1 n°5 dit « migrations up/down propres » ; la DoD exige **sur staging**. Tant que L0-b n'est pas fait, il n'y a pas de staging : la porte ne peut pas cocher cette ligne même avec L1 livré. À rendre explicite pour ne pas le découvrir le jour de la signature |
| 5 | **Aucun garde-fou ne rendra `@filrouge` exigible au L1** | Vérifié : `filrouge` n'apparaît que dans des **commentaires** (`playwright.config.ts`, `e2e/socle.e2e.ts`, `check-no-skipped-tests`). 09 §4bis dit « toute porte l'exige vert » dès L1. Le lot a inventé l'auto-péremption pour l'intégration, le schéma et la couverture — **`@filrouge` est le seul membre de cette famille sans garde-fou.** Recommandation, pas écart |
| 6 | **Le tableau des invariants n'y figure pas** | Les invariants 3, 5, 6, 7 ne sont pas mécanisables et sont contrôlés à la main. La porte est l'endroit où cette vérification humaine se trace. Le présent fichier la porte (§5 du rapport) ; un renvoi suffirait |

---

# E. TRAVAUX PORTÉS À LA PORTE P-A

Reportés au fichier `docs/portes/PORTE_A_<date>.md` (11 §9bis), à cocher avec preuve :

1. `pnpm infra:up` → stack complète démarrée (démon Docker requis) — critère L0 n°1.
2. `pnpm infra:restore-test` → restauration **Postgres ET MinIO** depuis zéro — critère L0 n°2 et
   cœur de **E35**. Le point de contrôle n°1 reste le `pgbackrest stanza-create` manuel après le
   premier `up` (`DECISIONS.md`, point 12).
3. Provisionnement réel des 12 familles de secrets §30.3 en `chmod 600` + sauvegarde chiffrée du
   `.env` (sans elle, un PRA restaure une infra sans ses clés) — critère L0 n°3.
4. Création du dépôt distant privé, des Environments `staging`/`prod`/`ops`, protection de `main`,
   puis **premier déploiement staging par la CI** — critère L0 n°4.
5. Première exécution réelle du workflow nocturne de restauration.
6. Reconfirmation des tags d'images MinIO/`mc`/Caddy au provisionnement réel, puis gel définitif
   (`DECISIONS.md`, point 5).
7. Arbitrage Williams de la **fiche A-001** (`AMELIORATIONS.md`) : ABSORBÉE / PHASE 2 / REFUSÉE.
8. **Les réserves §D.1 à §D.4 du présent fichier, levées et prouvées.**
   → **V1, V2, V3 levés en 2ᵉ passe** (§D.0). Reste **V4 partiel** (§D.4bis) et les six manques du
   dossier de porte (§D.7).
9. **Retour d'A51 (sécurité) sur le périmètre L0** — durcissement 06 §10.3, secrets, CSP, ZAP.
10. Corriger l'affirmation « 23 entrées toutes au format » du dossier de porte (§D.7, ligne 1).

---

## Journal des passes de contrôle

| Date | Passe | Commit | Verdict du gardien |
| --- | --- | --- | --- |
| 2026-08-27 | 1ʳᵉ | `ce5b912` | **VETO** — V1 CI rouge · V2 HEAD ne démarre pas · V3 pipeline hors séquence · V4 gouvernance. 1 code orphelin (`axion:sauvegardes`) |
| 2026-08-27 | 2ᵉ | `fdd5f59` | **ACCEPTÉ SOUS RÉSERVE** — V1/V2/V3 levés et éprouvés · **0 code orphelin** · V4 partiel · 6 manques au dossier de porte |
