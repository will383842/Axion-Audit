# Chaîne d'intégration et de déploiement — mode d'emploi

> **Bandeau de traçabilité.** Ce répertoire applique : **11 §7** (environnement de dev & CI),
> **11 §1** (versions épinglées), **11 §2** et **09 §5.7** (tests jamais désactivés),
> **09 §3** (pipeline 7 étapes + Definition of Done transverse), **02 §30.4** (gestion des
> secrets), **02 §30.5** (configuration GitHub), **02 §30.6** (flux de déploiement),
> **02 §11.4** (sauvegardes et test de restauration), **07 §12** (critères du lot **L0**),
> **07 §13** (stratégie de tests).
> Livrable du **lot L0**, agent **A52 (CI/CD)** — traçabilité E36/E43, anti-code-orphelin 09 §3.6.

---

## 0. Le principe qui gouverne tout ce répertoire

> **Un workflow ne doit jamais pouvoir passer au vert en masquant un échec** (09 §5.7).

Concrètement, dans ces fichiers : **aucun `|| true`**, **aucun `continue-on-error`**. Là où un
contrôle ne peut pas encore s'exercer (le manifeste de schéma est un livrable du L1, ZAP n'a rien
à scanner au L0), le workflow le dit **bruyamment** (`::warning::` avec le lot de levée) et **se
durcit tout seul** dès que la condition d'exercice apparaît. Un job qui « passe » à tort serait un
mensonge de CI ; une CI qui ment est pire que pas de CI.

---

## 1. Quel workflow fait quoi

| Fichier                        | Déclencheur                                                                  | Rôle                                                                                                                                                                             | Secrets consommés                                                          |
| ------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **`ci.yml`**                   | PR vers `main` · push sur `main` et `lot/**`                                 | **LE workflow bloquant.** lint → typecheck → unit → integration → e2e → schema-diff → build → deploy-staging, plus les garde-fous gitleaks / shellcheck / anti-skip / couverture | `GITHUB_TOKEN` (implicite) ; hérite des Environments pour les jobs appelés |
| **`build-images.yml`**         | `workflow_call` uniquement                                                   | Construit et pousse les **4 images** (`api`, `worker`, `field`, `hq`) sur GHCR, taguées **par SHA et par version** (02 §30.5)                                                    | `GITHUB_TOKEN` (`packages: write`)                                         |
| **`deploy-staging.yml`**       | `workflow_call` (depuis `ci.yml`, au merge sur `main`) · `workflow_dispatch` | SSH → `infra/scripts/deploy.sh` → contrôle de santé public → Telegram → ZAP baseline                                                                                             | Environment **`staging`**                                                  |
| **`deploy-prod.yml`**          | push d'un tag `v*` · `workflow_dispatch`                                     | Build des 4 images taguées par la version, puis déploiement **après approbation manuelle**                                                                                       | Environment **`prod`**                                                     |
| **`nightly-restore-test.yml`** | cron `0 3 * * *` (UTC) · `workflow_dispatch`                                 | SSH → `infra/scripts/restore-test.sh` (Postgres + MinIO), journal conservé 90 j, **alerte Telegram si échec**                                                                    | Environment **`ops`**                                                      |
| **`zap-baseline.yml`**         | `workflow_call` (fin de `deploy-staging`) · `workflow_dispatch`              | ZAP baseline contre staging. **Non bloquant au L0/L1, BLOQUANT au L2**                                                                                                           | Environment hérité de l'appelant                                           |

**Fichiers de configuration associés :**

| Fichier                                               | Rôle                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.github/actions/setup-node-pnpm/action.yml`          | Socle Node 22 + pnpm 9 (11 §1) partagé par tous les jobs ; **échoue** si une autre version majeure apparaît                        |
| `.github/coverage-critical-paths.json`                | Liste versionnée des modules critiques soumis au seuil de **90 %** (09 §3). **Vide au L0**, avec le lot qui alimente chaque entrée |
| `.github/scripts/check-coverage.mjs`                  | Relit `coverage/coverage-summary.json` et tranche lui-même — la couverture est **mesurée**, pas déclarée                           |
| `.github/dependabot.yml`                              | Configuré (npm + actions + docker) mais **désactivé pendant toute la Phase 1** (02 §30.5 + 11 §1)                                  |
| `.github/CODEOWNERS`                                  | Propriétaire unique. **À compléter à la main** : le compte GitHub de Williams n'est pas dans le pack                               |
| `.github/pull_request_template.md`                    | DoD transverse + pipeline 7 étapes en cases à cocher                                                                               |
| `.gitleaks.toml` _(racine)_                           | Règles par défaut + **une seule** exception : le marqueur `__CHANGEME__` de `.env.example`                                         |
| `.lintstagedrc.json` + `.husky/pre-commit` _(racine)_ | Pre-commit 11 §7 : lint des fichiers indexés + typecheck rapide                                                                    |

### Ordre des jobs de `ci.yml` (imposé par 11 §7)

```
CHAÎNE IMPOSÉE (11 §7) :
  lint → typecheck → unit → integration → e2e → schema-diff → build → deploy-staging
                                                                          (main seulement)

GARDE-FOUS EN PARALLÈLE (tous exigés par `build`) :
  gitleaks      02 §30.4-5   historique complet en PR
  shellcheck    11 §7        infra/scripts/*.sh + syntaxe docker compose
  anti-skip     11 §2/09 §5.7  pnpm check:no-skipped-tests, exceptions vides
  invariants    09 §3 ét. 3  pnpm check:invariants
  coverage      09 §3        ≥ 90 % sur les modules critiques (après `unit`)
```

`build` a pour `needs` : `schema-diff`, `coverage`, `gitleaks`, `shellcheck`, `invariants`,
`anti-skip`. Rien ne se construit sur une base non vérifiée, et aucun contrôle n'est contournable
par un chemin latéral.

---

## 2. Les scripts pnpm attendus (point de jonction avec A01)

Les workflows appellent ces scripts. **Tous existent déjà dans le `package.json` racine** livré par
A01 — ce tableau est le point de jonction : renommer l'un d'eux casse la CI, et c'est le
comportement voulu (un script manquant est un trou de vérification, pas une étape optionnelle).

| Script                        | Appelé par                                                 | Attendu                                                                                     |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm lint`                   | `ci.yml` job `lint`, `.husky/pre-commit` (via lint-staged) | ESLint sur tout le workspace, **0 avertissement toléré**                                    |
| `pnpm format:check`           | `ci.yml` job `lint`                                        | Prettier en **vérification seule** — la CI ne réécrit jamais le dépôt                       |
| `pnpm typecheck`              | `ci.yml` job `typecheck`, `.husky/pre-commit`              | `tsc --noEmit` strict sur tout le workspace                                                 |
| `pnpm test:unit`              | `ci.yml` job `unit`                                        | Vitest 3, projet `unit`                                                                     |
| `pnpm test:integration`       | `ci.yml` job `integration`                                 | Vitest 3, projet `integration` (services de CI + Testcontainers)                            |
| `pnpm test:e2e`               | `ci.yml` job `e2e`                                         | Playwright, **chromium**                                                                    |
| `pnpm test:coverage`          | `ci.yml` job `coverage`                                    | Vitest `--coverage`, reporter **`json-summary`** → `coverage/coverage-summary.json`         |
| `pnpm check:no-skipped-tests` | `ci.yml` job `anti-skip`                                   | Garde-fou anti-skip, **liste d'exceptions vide** (`scripts/check-no-skipped-tests.mjs`)     |
| `pnpm check:invariants`       | `ci.yml` job `invariants`                                  | Checklist automatisée des invariants (09 §3 étape 3)                                        |
| `pnpm infra:config`           | `ci.yml` job `shellcheck`                                  | `docker compose config -q` sur `infra/docker-compose.yml` (avec un `.env` éphémère)         |
| `pnpm db:migrate`             | `ci.yml` job `schema-diff`                                 | Applique les migrations sur `DATABASE_URL` — exécuté **si `apps/api/drizzle/` existe** (L1) |
| `pnpm schema:diff`            | `ci.yml` job `schema-diff`                                 | Compare le schéma réel au manifeste ; **code ≠ 0 au premier écart**                         |

Ne devinez rien sur les noms : ce tableau **est** le contrat.

---

## 3. Secrets GitHub à créer — par Environment

**Règle 02 §30.4-3 : ces secrets vivent dans les _Environments_, JAMAIS en secrets de dépôt
globaux.** Règle 02 §30.4-4 : **séparation stricte** — les valeurs de `staging` et de `prod` sont
DIFFÉRENTES (clés SSH, hôtes, chemins). Un secret de staging ne peut rien sur la prod.

### Environment `staging`

| Secret                   | Contenu                                                                 | Source                        |
| ------------------------ | ----------------------------------------------------------------------- | ----------------------------- |
| `DEPLOY_SSH_KEY`         | Clé privée SSH **dédiée et restreinte** (Actions → serveur staging)     | `.env.example` §17 · 02 §30.3 |
| `DEPLOY_SSH_KNOWN_HOSTS` | Ligne `known_hosts` de l'hôte staging (`ssh-keyscan -t ed25519 <hôte>`) | Ajout A52 — voir §6           |
| `DEPLOY_HOST`            | Hôte SSH de staging                                                     | `.env.example` §17            |
| `DEPLOY_USER`            | Utilisateur de déploiement **non-root**                                 | `.env.example` §17            |
| `DEPLOY_PATH`            | `/opt/axion-audit` (ou le chemin staging retenu)                        | `.env.example` §17            |
| `TELEGRAM_BOT_TOKEN`     | Jeton du bot d'alerte                                                   | 02 §11.3 · `.env.example` §10 |
| `TELEGRAM_CHAT_ID`       | Salon d'alerte                                                          | 02 §11.3 · `.env.example` §10 |

**Variable** (pas un secret) : `STAGING_BASE_URL` = URL publique de staging (contrôle de santé + cible ZAP).

### Environment `prod`

Mêmes noms, **valeurs distinctes** :
`DEPLOY_SSH_KEY` · `DEPLOY_SSH_KNOWN_HOSTS` · `DEPLOY_HOST` · `DEPLOY_USER` · `DEPLOY_PATH` ·
`TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID`.
**Variable** : `PROD_BASE_URL`.
**Réglage obligatoire : approbation manuelle** (voir §4).

### Environment `ops` (test de restauration nocturne)

`DEPLOY_SSH_KEY` (clé **restreinte au seul `restore-test.sh`**) · `DEPLOY_SSH_KNOWN_HOSTS` ·
`DEPLOY_HOST` · `DEPLOY_USER` · `DEPLOY_PATH` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID`.

> **Pourquoi un troisième environment.** L'approbation manuelle de `prod` (02 §30.4-3) protège les
> **déploiements**. L'appliquer au job nocturne le mettrait en attente d'un humain endormi —
> c'est-à-dire supprimerait de fait le test de restauration exigé par 02 §11.4 et par le critère L0.
> `ops` porte donc une clé au périmètre réduit, **sans** approbation. **Choix non tranché par le
> pack** → à arbitrer dans `DECISIONS.md`.

### Ce qui n'est **pas** un secret GitHub

`GHCR_TOKEN` : inutile. Le `GITHUB_TOKEN` du run, à durée de vie limitée et avec `packages: write`
accordé au seul job de build, suffit (02 §30.3 : « GHCR_TOKEN **ou GITHUB_TOKEN** ») — c'est le
moindre accès (§30.4-7).

Tous les secrets **applicatifs** (`DATABASE_URL`, `JWT_*`, `MINIO_*`, `APP_ENCRYPTION_KEY`,
`ANTHROPIC_API_KEY`, `STORAGE_BOX_*`…) vivent **exclusivement** dans `/opt/axion-audit/.env` sur le
serveur, `chmod 600`, **provisionné à la main par SSH** (02 §30.4-2). **La CI n'y touche jamais.**

---

## 4. Réglages GitHub à poser À LA MAIN (non versionnables)

Aucun de ces réglages ne peut vivre dans un fichier du dépôt. Sans eux, la chaîne est **incomplète**
et certains garde-fous du pack ne s'appliquent tout simplement pas.

### 4.1 Dépôt

- [ ] Dépôt **PRIVÉ** nommé `axion-audit` (02 §30.5).
- [ ] **Secret scanning** activé + **push protection** (02 §30.4-5 : gitleaks _et_ secret scanning).
- [ ] Actions autorisées à créer des packages ; **GHCR** lié au dépôt.
- [ ] Rétention des images GHCR : **90 jours minimum** — c'est la fenêtre de rollback (02 §30.6).

### 4.2 Protection de la branche `main` (02 §30.5)

- [ ] **Merge uniquement par pull request** — jamais de commit direct (11 §9bis).
- [ ] **Checks obligatoires** (à cocher une fois qu'ils sont apparus au moins une fois) :
      `1 · lint`, `2 · typecheck`, `3 · unit`, `4 · integration (postgres, redis, minio)`,
      `5 · e2e (chromium)`, `6 · schema-diff (vs fichier 04)`,
      `gitleaks (bloquant — 02 §30.4-5)`, `shellcheck (infra/scripts/*.sh)`,
      `aucun test désactivé (11 §2 / 09 §5.7)`, `couverture ≥ 90 % (modules critiques — 09 §3)`,
      `7 · build (4 images GHCR)`.
- [ ] **Require branches to be up to date before merging**.
- [ ] **Pas de force-push**, **pas de suppression** de `main`.
- [ ] **Historique linéaire obligatoire** (cohérent avec le **squash merge**, 11 §9bis).
- [ ] Squash merge = seule méthode autorisée ; suppression automatique de la branche après merge.
- [ ] _(après avoir corrigé `CODEOWNERS`)_ Require review from Code Owners.
- [ ] **Ne pas** cocher « Allow administrators to bypass » : la CI verte est une condition du pack
      (02 §30.5), pas une préférence.

### 4.3 Environments (Settings → Environments)

- [ ] Créer **`staging`** — secrets et variable du §3. Branche déployable : `main` uniquement.
- [ ] Créer **`prod`** — secrets et variable du §3, **+ « Required reviewers » = Williams**
      (02 §30.4-3 : « l'environnement prod exige une approbation manuelle avant tout
      déploiement »). **C'est le réglage le plus important de cette page** : sans lui,
      `deploy-prod.yml` déploierait sans garde-fou. Restreindre le déploiement aux **tags `v*`**.
- [ ] Créer **`ops`** — secrets du §3, **sans** approbation (sinon le test nocturne ne s'exécute
      jamais, cf. §3).

### 4.4 Après le lot L0

- [ ] Vérifier que le job `schema-diff` **cesse** d'afficher son avertissement dès que L1 commite
      ses migrations + son `schema-manifest.json`. S'il l'affiche encore, le contrôle du critère L1
      « diff schéma-vs-04 = zéro écart » n'a pas lieu.
- [ ] Au **lot L2** : passer `ZAP_BLOQUANT` à `'true'` dans `zap-baseline.yml`.
- [ ] En **Phase 2** : réactiver Dependabot (décommenter les `schedule:` de
      `.github/dependabot.yml`, remonter `open-pull-requests-limit` à 5, **merge manuel**).

---

## 5. Limites assumées (documentées, pas contournées)

**Playwright et le mode avion iOS — contrat 11 §7 :**

> « `context.setOffline(true)` couvre les scénarios réseau ; **les service workers sous iOS ne sont
> PAS couverts par Playwright** — le mode avion RÉEL sur iPad se rejoue **à la main** aux portes
> **P-C** et **P-E** (checklist 07 §15). Documenté, pas contourné. »

Conséquence opératoire : **un job `e2e` vert ne vaut pas preuve du mode avion iPad.** Cette preuve
est humaine et se trace dans le fichier de porte (11 §9bis : critère coché **avec la preuve**).

**ZAP au lot L0** : non bloquant faute de surface applicative réelle. Devient bloquant au **L2**
(arrivée de l'authentification). L'échéance est écrite dans le fichier, pas laissée à la mémoire.

**`schema-diff` au lot L0** : ne peut rien comparer tant que le manifeste du L1 n'existe pas. Il se
marque `skipped` **avec avertissement** dans ce seul cas, et **échoue** dès que des migrations SQL
apparaissent sans manifeste.

---

## 6. Écarts et compléments par rapport au pack (à arbitrer)

Ces points ne sont pas tranchés par le pack et ont été implémentés de façon **explicite et
réversible**. Ils doivent recevoir une entrée `DECISIONS.md` (09 §5.1 : un doute ne se devine pas).

1. **`DEPLOY_SSH_KNOWN_HOSTS`** — secret ajouté, absent de `.env.example` §17. Sans lui, il faudrait
   `StrictHostKeyChecking=no`, c'est-à-dire accepter un homme du milieu sur le canal qui porte nos
   déploiements. Ajout jugé nécessaire, pas confortable.
2. **Environment `ops`** — troisième environment pour le test de restauration nocturne (cf. §3).
   Le pack n'en prévoit que deux (`staging`, `prod`) ; un job planifié ne peut pas vivre derrière
   une approbation manuelle.
3. **`infra/scripts/deploy.sh` n'existe pas encore** — `deploy-staging.yml` et `deploy-prod.yml`
   l'appellent, conformément à 02 §30.6. A11 a livré `backup-postgres.sh`, `backup-minio.sh`,
   `restore-test.sh`, `install-cron.sh` et `lib/common.sh`, mais pas `deploy.sh`. **Le déploiement
   est donc inopérant tant que ce script n'est pas livré** — la CI échouera bruyamment, ce qui est
   le comportement voulu.
   Contrat d'appel attendu : `APP_ENV=<staging|prod> GHCR_OWNER=<compte> IMAGE_TAG=<tag>
./infra/scripts/deploy.sh`, exécuté depuis `$DEPLOY_PATH`, code de retour ≠ 0 en cas d'échec, et
   enchaînant `docker compose pull && up -d` → migration dry-run puis apply → smoke tests.
4. **`husky`, `lint-staged`, `eslint`, `prettier`, `gitleaks`, ZAP** — outils exigés
   fonctionnellement par 11 §7 et 02 §30.4-5 mais absents de la liste de versions épinglées 11 §1.
   Les quatre premiers sont déjà dans les `devDependencies` racine (A01) ; `gitleaks` (v8.18.4) et
   l'image ZAP sont épinglés dans les workflows.
5. **Compte GitHub de Williams** — absent du pack ; `CODEOWNERS` porte un placeholder explicite,
   **à remplacer avant d'activer la revue par Code Owners**.

**Points levés par les livraisons parallèles d'A01 et A11** (plus aucun doute) :

- **Dockerfiles** : `apps/<api|worker|field|hq>/Dockerfile`, contexte = racine du dépôt — lu dans
  `infra/docker-compose.yml`. `apps/worker` est bien un espace de travail du monorepo.
- **Image MinIO** : `minio/minio:RELEASE.2025-04-22T22-12-26Z`, alignée sur le compose.
- **Nommage GHCR** : `ghcr.io/${GHCR_OWNER}/axion-audit-<app>:${IMAGE_TAG}` — les deux variables
  sont passées au serveur par les workflows de déploiement.
- **Manifeste de schéma** : `apps/api/schema-manifest.json`, marqueur de livraison du L1 =
  `apps/api/drizzle/` (logique portée par `scripts/schema-diff.mjs`).
