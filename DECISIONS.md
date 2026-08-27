# DECISIONS.md — Journal de décision du projet Axion Audit

> **Fichier APPEND-ONLY.** Format imposé par le contrat technique 11 §9bis.
> Une décision non tracée dans ce format **n'existe pas**.
> Règle de précédence appliquée à tout arbitrage : **§32-36 > §24-31 > §16-22 > §1-15**,
> puis le fichier 11 pour ce qui n'y est pas tranché. **Le DDL vit exclusivement dans le fichier 04.**
>
> Décideur : **A01** (directeur technique, autopilote) pour les choix techniques dans le cadre du
> pipeline 09 · **Williams** pour tout ce que le contrat 11 §8 réserve à l'humain.

---

## 2026-08-27 — [L0] Emplacement du pack d'implémentation dans le dépôt

**Options :**
1. Laisser les 12 fichiers dans `pack_implementation/` (état reçu).
2. Les déplacer dans `/docs` à la racine du dépôt.

**Arbitrage :** option 2. Le fichier 09 §2 (« Le dépôt contient : le pack (dossier `/docs`, les
12 fichiers) »), le 11 §9 (prompt de démarrage : « le pack étant dans `/docs` ») et le 02 §30.5
(« `/docs` = le pack ») convergent : `/docs` est l'emplacement contractuel. Le CDC maître, qualifié
d'**archive de référence** par le 00_INDEX (« il ne prévaut plus »), est déplacé dans
`docs/archive/CDC_OUTIL_AUDIT_IA_AXION.md` pour qu'aucune session ne le confonde avec une source
d'exécution. Sous-dossiers créés au même moment, imposés par le pack : `docs/conception/` (09 §3.1bis),
`docs/portes/` (11 §9bis), `docs/journal/` (09 §5.4), `docs/ETAT.md` (11 §9ter).

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Versions Node/pnpm de la machine de développement vs contrat §1

**Constat :** la machine porte **Node v24.19.0** et **pnpm 10.33.4**. Le contrat 11 §1 épingle
**Node 22 LTS** et **pnpm 9**, `save-exact`, « aucune montée majeure sans décision humaine ».
Le 11 §8.3 (« monter une version majeure ») réserve explicitement ce choix à l'humain.

**Options :**
1. Adopter Node 24 / pnpm 10 (aligner le contrat sur la machine) — **exclu** : 11 §8.3 l'interdit à
   l'autopilote, et Node 24 n'était pas LTS au moment de la rédaction du contrat.
2. Épingler le contrat partout où l'autopilote décide (images Docker, CI, `packageManager`, `.nvmrc`)
   et faire converger la machine de dev.
3. Bloquer L0 en attendant l'installation de Node 22.

**Arbitrage :** option 2. **Le contrat fait foi là où il est exécutoire** : images Docker
`node:22-alpine`, matrice CI `node-version: 22.x`, `"packageManager": "pnpm@9.15.9"` (corepack
télécharge la bonne version automatiquement — vérifié : corepack 0.35.0 présent), `.nvmrc` = `22`,
`engines.node = ">=22.11.0 <23"`. `engine-strict` est laissé à `false` dans `.npmrc` **pour ne pas
bloquer l'amorçage** ; l'écart local reste donc visible (avertissement pnpm) sans être fatal.
**La vérité d'exécution est la CI et les conteneurs, pas la machine de Williams.**
**Action Williams (non bloquante, avant la porte P-A) :** installer Node 22 LTS localement
(nvm-windows ou installeur officiel) pour que `pnpm dev` hors Docker s'exécute sur la version épinglée.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Absence de dépôt distant : l'invariant « un commit non poussé n'existe pas » est inapplicable

**Constat :** le répertoire de travail n'était pas un dépôt git (`git init` effectué au L0) et
**aucun `origin` n'existe**. Or le 11 §9ter est catégorique : « La durabilité vit sur `origin`, pas
sur la machine : un commit non poussé n'existe pas. » La création du dépôt privé GitHub est
elle-même un livrable L0 (02 §30.5), mais elle exige un compte et des droits que l'autopilote n'a pas.

**Options :**
1. Créer le dépôt distant depuis l'autopilote via `gh repo create` — **exclu** : action extérieure
   irréversible sur le compte de Williams, hors du périmètre d'autonomie (11 §8, esprit du §30.4).
2. Travailler en local et pousser dès qu'`origin` existe.
3. Suspendre L0 jusqu'à la création du dépôt — **exclu** : bloquerait tout le lot pour une dépendance
   administrative, contre la règle « faire tout ce qui ne dépend pas de la réponse ».

**Arbitrage :** option 2. Les commits sont faits **localement et en continu** selon la cadence §9ter ;
le champ « Poussé » d'`ETAT.md` porte **`non (origin absent — voir DECISIONS 2026-08-27)`** tant que
le distant n'existe pas. **La protection de sauvegarde du §9ter est donc DÉGRADÉE pendant ce laps de
temps** : c'est un risque assumé, tracé, et à durée volontairement courte.
**Action Williams (bloquante pour la porte P-A) :** créer le dépôt **privé** `axion-audit`, puis
`git remote add origin <url> && git push -u origin main`. Configurer dans la foulée les éléments
02 §30.5 qui n'appartiennent qu'au propriétaire : protection de `main` (PR obligatoire, CI verte,
pas de force-push, historique linéaire), Environments `staging` et `prod` (approbation manuelle sur
`prod`), secret scanning, GHCR. Le dépôt de travail fournit déjà les fichiers correspondants
(workflows, CODEOWNERS, `dependabot.yml`).

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Démon Docker arrêté : le critère « `docker compose up` = stack complète » n'est pas vérifiable en séance

**Constat :** Docker 29.7.2 et Compose v5.4.0 sont installés, mais le démon ne répond pas
(`npipe:////./pipe/dockerDesktopLinuxEngine` introuvable — Docker Desktop n'est pas démarré).
Le critère d'acceptation L0 du fichier 07 exige `docker compose up` = stack complète, et la
restauration Postgres **et** MinIO testée depuis zéro.

**Options :**
1. Déclarer le critère satisfait sur la seule foi de la revue des fichiers — **exclu** : « la vérité
   terrain, ce sont les tests » (11 §9ter) ; un critère non exécuté n'est pas un critère coché.
2. Écrire l'intégralité de l'infrastructure, la valider par ce qui est vérifiable **sans démon**
   (`docker compose config` — parsing, interpolation, résolution des profils), et marquer le critère
   **NON VÉRIFIÉ** jusqu'à exécution réelle.

**Arbitrage :** option 2. L'infrastructure L0 est livrée complète et validée statiquement ; les
critères « `docker compose up` », « restauration Postgres et MinIO depuis zéro » et « déploiement
staging par la CI » restent **explicitement non cochés** et sont portés au fichier de porte
`docs/portes/PORTE_A_*.md` comme travaux de vérification. C'est cohérent avec le calendrier du pack :
**la porte P-A ferme L0 ET L1**, pas L0 seul.
**Action Williams (non bloquante pour la suite du code) :** démarrer Docker Desktop, puis exécuter
`pnpm infra:up` et `pnpm infra:restore-test` — la sortie attendue est documentée dans
`infra/README.md`.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Périmètre exact de L0 : quels critères sont codables et lesquels dépendent d'infrastructure réelle

**Constat :** la ligne L0 du fichier 07 mêle des livrables **codables** (monorepo, Compose, CI,
scripts de sauvegarde et de restauration) et des livrables qui **ne peuvent exister que sur une
machine louée et un compte GitHub** (« staging+prod Hetzner (§30 intégral) », « secrets §30.3
provisionnés », « déploiement staging par la CI OK »). Le 02 §30.4-2 est explicite : le `.env`
serveur est « provisionné à la main par SSH au lot L0 (**pas par la CI**) ».

**Options :**
1. Considérer L0 terminé sans l'infrastructure réelle — **exclu** : trois critères d'acceptation
   resteraient faux.
2. Scinder L0 en **L0-a (dépôt : tout ce qui est versionné)** et **L0-b (opérations : ce qui exige
   le VPS, le compte GitHub et les secrets réels)**, L0-b étant exécuté par Williams avec les scripts
   et le runbook livrés par L0-a. La porte P-A vérifie les deux.

**Arbitrage :** option 2, qui est la lecture littérale du 11 §6 (« une session = un incrément » ;
le découpage en incréments commitables est la règle) sans rien retrancher aux critères du fichier 07.
**L0-a** livre : monorepo pnpm, les 5 espaces de travail, Compose dev/staging/prod, Caddy, pgBackRest,
`mc mirror`, script de test de restauration nocturne, CI complète (lint, typecheck, tests, gitleaks,
build d'images, déploiement), `.env.example` exhaustif (12 secrets du §30.3), runbook de provisionnement.
**L0-b** (Williams, avec `infra/README.md` comme runbook) : location du VPS, durcissement §10.3,
génération et pose des secrets réels en `chmod 600`, création du dépôt et des Environments, premier
déploiement staging. **Aucun critère n'est abandonné : ils sont datés et attribués.**

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Squelette applicatif minimal des 5 espaces de travail dès L0

**Constat :** la ligne L0 dit « init monorepo pnpm » sans préciser le contenu des applications,
mais impose une CI qui **construit 4 images** (`api`, `field`, `hq`, `worker`, 02 §30.5) et un
déploiement staging suivi de **smoke tests** (« santé API, login, une écriture/lecture », §30.6).
Un `docker compose up` qui ne démarre aucune application ne satisfait pas « stack complète ».

**Options :**
1. Ne créer que les fichiers de configuration du monorepo — la CI construirait des images vides.
2. Scaffolder un **squelette minimal et non métier** : API Fastify avec `/v1/health` (+ format
   d'erreur, logger pino redacté, validation d'environnement Zod), worker BullMQ inerte,
   `apps/field` et `apps/hq` en coquilles Vite, `packages/shared` (`ERROR_CODES`, schéma d'env),
   `packages/ui` (tokens de la charte, invariant 4). **Zéro logique métier** : ni table, ni route
   fonctionnelle, ni écran — L1 et L2 restent intacts.

**Arbitrage :** option 2. Le squelette est le strict nécessaire pour que les critères L0 soient
*testables* (images qui démarrent, healthcheck Compose, smoke test de déploiement). La règle
anti-code-orphelin (09 §3.6) est respectée : ce squelette se rattache à **E17** (stack imposée),
**E35** (exploitation/sauvegardes), **E36** (exécutable par lots), **E43** (exécutabilité autopilote),
**E33** (sécurité : redaction, secrets hors code) et **E44** (tokens du design system).
Le smoke test « login » du §30.6 est **hors de portée de L0** (l'authentification est le lot L2) :
le script `infra/scripts/smoke-test.sh` porte cette étape en commentaire explicite, à activer au L2.

**Décideur :** A01
**Impact spec :** aucun
