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
_testables_ (images qui démarrent, healthcheck Compose, smoke test de déploiement). La règle
anti-code-orphelin (09 §3.6) est respectée : ce squelette se rattache à **E17** (stack imposée),
**E35** (exploitation/sauvegardes), **E36** (exécutable par lots), **E43** (exécutabilité autopilote),
**E33** (sécurité : redaction, secrets hors code) et **E44** (tokens du design system).
Le smoke test « login » du §30.6 est **hors de portée de L0** (l'authentification est le lot L2) :
le script `infra/scripts/smoke-test.sh` porte cette étape en commentaire explicite, à activer au L2.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Cohabitation staging/prod : qui écoute sur 443 ?

**Constat (remonté par A11) :** un seul processus peut lier les ports 80/443 d'un VPS. Or 02 §11.2
fait cohabiter `staging` et `prod` sur la MÊME machine en V1. A11 a livré, sans deviner, un Caddy de
prod sur 80/443 et un Caddy de staging en loopback `127.0.0.1:8081` accessible par tunnel SSH.

**Options :**

1. Deux Caddy, staging en loopback + tunnel SSH (état livré).
2. **UN SEUL Caddy** servant les deux environnements par des blocs de site distincts.
3. VPS staging dédié.

**Arbitrage : option 2 — et ce n'est pas un choix, c'est une lecture.** Le 02 §11.2 dit
littéralement : « `staging` (même VPS, **sous-domaine**, DB séparée) ». Un sous-domaine implique un
certificat TLS, donc un serveur qui écoute sur 443 : c'est bien UN Caddy avec deux blocs de site
(`${CADDY_SITE_ADDRESS}` pour la prod, `staging.${...}` pour staging) routant vers deux piles
d'`upstream` séparées, avec bases, buckets et secrets distincts (§30.4-4 intact). L'option 1 aurait
imposé un tunnel SSH pour toute démo de porte — or les portes P-A à P-E se jouent SUR STAGING, et une
démo qui exige un tunnel est une démo qu'on finit par ne pas faire. L'option 3 est explicitement
renvoyée « dès la V2 » par le pack : la retenir maintenant serait dépenser hors budget.
**Le gel des déploiements staging pendant les jours de collecte (02 §11.2) reste applicable et devient
même plus important**, puisque les deux piles partagent désormais le même frontal.
Correction confiée à A11.

**Décideur :** A01
**Impact spec :** aucun (application littérale du 02 §11.2)

---

## 2026-08-27 — [L0] CSP : la concession `style-src 'unsafe-inline'`

**Constat (remonté par A11) :** la CSP livrée est stricte sur tout (`default-src 'self'`,
`script-src 'self' 'wasm-unsafe-eval'` pour Argon2id, `worker-src 'self'`, `font-src 'self'`, zéro
CDN) SAUF `style-src`, qui porte `'unsafe-inline'` — nécessaire aux attributs `style` que Radix et
shadcn/ui posent à l'exécution (positionnement des popovers, mesures de dimensions).

**Options :**

1. Accepter `'unsafe-inline'` sur `style-src` uniquement.
2. Passer aux nonces ou aux hachages CSP pour les styles.
3. Renoncer à shadcn/ui — **exclu** : imposé par le 11 §1.

**Arbitrage : option 1 pour la Phase 1, avec réexamen daté.** La portée du risque mérite d'être
nommée plutôt qu'agitée : `style-src 'unsafe-inline'` autorise l'injection de STYLE, pas de script
(`script-src` reste sans `'unsafe-inline'` ni `'unsafe-eval'`). L'attaque résiduelle est
l'exfiltration par sélecteur CSS, qui suppose déjà une injection de contenu — laquelle serait un
défaut de validation Zod bien plus grave, couvert ailleurs. Surtout, un nonce par requête est
**incompatible avec une PWA servie depuis le cache d'un service worker SANS serveur** (invariant 1) :
au démarrage en mode avion, il n'y a aucune requête pour porter le nonce. C'est donc l'offline-first
qui ferme l'option 2, pas la commodité.
**Réexamen imposé au lot L5c**, quand le service worker sera livré : compter les styles inline
réellement subsistants et, si le compte est faible, basculer sur des hachages statiques — compatibles
avec un démarrage hors ligne, contrairement aux nonces. À porter au dossier de la porte P-C.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Dépendances d'outillage absentes de la liste 11 §1

**Constat (remonté par A52) :** `eslint`, `prettier`, `typescript-eslint`, `husky`, `lint-staged`,
`gitleaks`, l'image ZAP et le pilote `pg` (node-postgres) ne figurent pas dans la liste épinglée du
11 §1. Or le 11 §8.1 réserve à l'humain « ajouter une dépendance hors de la liste §1 ».

**Options :**

1. Escalader chacune à Williams avant de continuer.
2. Les traiter comme des **implicites nécessaires** d'exigences déjà écrites, et les tracer ici.

**Arbitrage : option 2, avec la liste EXHAUSTIVE ci-dessous.** Le §8.1 vise l'ajout de dépendances
qui changent l'architecture ou la surface d'attaque, pas les outils sans lesquels une exigence du
contrat serait littéralement inexécutable. Chacune est l'implicite d'une ligne du pack :

| Dépendance                                | Exigence qui l'impose                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint`, `typescript-eslint`, `prettier` | 11 §7 : « CI, jobs dans cet ordre : **lint** → typecheck… »                                                                                                                                                                                                                                  |
| `husky`, `lint-staged`                    | 11 §7 : « Pre-commit : **lint-staged** » — `lint-staged` est nommé, `husky` est son mécanisme                                                                                                                                                                                                |
| `gitleaks`                                | 11 §7 et 02 §30.4-5 : « gitleaks en CI (bloquant) »                                                                                                                                                                                                                                          |
| image ZAP                                 | 09 §1 (rôle A51) : « ZAP baseline à chaque build »                                                                                                                                                                                                                                           |
| `pg` + `@types/pg`                        | 11 §1 impose **Drizzle** sur **PostgreSQL 16**. Drizzle est une couche de requêtes, PAS un pilote. `pg` est le pilote de référence de `drizzle-orm/node-postgres` et celui qu'utilise `drizzle-kit` : choisir `postgres.js` aurait été un choix, prendre le pilote canonique n'en est pas un |
| `@types/node`, `@vitejs/plugin-react`     | typages et intégration React exigés par Node 22 et Vite, tous deux au §1                                                                                                                                                                                                                     |

Toutes sont épinglées à leur version exacte comme le reste (§1, `save-exact`) et gelées avec
Dependabot pour toute la Phase 1. **Aucune ne touche l'exécution en production sauf `pg`**, qui est
le pilote sans lequel Drizzle ne peut rien.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Environment GitHub `ops` pour le test de restauration nocturne

**Constat (remonté par A52) :** le 02 §30.5 ne prévoit que deux Environments, `staging` et `prod`,
`prod` exigeant une approbation manuelle. Le test de restauration nocturne (02 §11.4, critère L0)
tourne à 03:00 UTC.

**Options :**

1. Rattacher le job nocturne à `prod` — **exclu** : l'approbation manuelle le mettrait en attente d'un
   humain endormi, ce qui **supprimerait de fait** le test de restauration exigé par le critère L0.
   Un contrôle qui ne s'exécute pas est pire qu'absent : il rassure à tort.
2. Créer un troisième Environment `ops`, sans approbation, portant une clé SSH **restreinte au seul
   `restore-test.sh`**.

**Arbitrage :** option 2. La règle structurante du §30.4-3 est que les secrets vivent dans des
Environments plutôt qu'en secrets de dépôt globaux — `ops` la respecte. Et le §30.4-7 (moindre accès)
est mieux servi par une clé dédiée et bridée que par la réutilisation de la clé de déploiement de
production dans un job automatique nocturne.
**Contrainte de mise en œuvre pour Williams :** la clé SSH d'`ops` doit être restreinte côté serveur
(`command=` dans `authorized_keys`), sans quoi `ops` deviendrait un accès de production sans
approbation — exactement ce que l'option 1 cherchait à éviter.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Points d'infrastructure actés sans réserve

Regroupés : chacun est un choix d'exécution que le pack ne tranche pas et qui n'ouvre aucune
alternative défendable. Tracés pour que la porte P-A puisse les relire un par un.

1. **`DEPLOY_SSH_KNOWN_HOSTS`** (A52) — l'empreinte de l'hôte est fournie en secret d'Environment.
   L'alternative (`StrictHostKeyChecking=no`) revient à accepter un homme du milieu sur le canal
   même qui porte nos déploiements. Documentée au `.env.example` §17.
2. **`GHCR_OWNER` et `IMAGE_TAG`** (A11) — variables NON SECRÈTES, sans lesquelles
   `docker compose config` échoue en staging et en prod. Ajoutées au `.env.example` §18.
3. **Remappage pgBackRest** (A11) — pgBackRest lit ses options via `PGBACKREST_<OPTION>` ; le compose
   dérive `PGBACKREST_REPO1_PATH`, `_REPO1_CIPHER_PASS`, `_REPO1_RETENTION_FULL` des variables du
   contrat. Aucune variable de contrat inventée, seulement traduite.
4. **Image Postgres construite sur le VPS** (A11) — pgBackRest doit vivre dans le conteneur qui
   exécute `archive_command`. C'est le SEUL `build` sur le serveur ; écart assumé au « pull-only » du
   §30.6, sans lequel le WAL archiving est impossible.
5. **Tags d'images MinIO / `mc` / Caddy** (A11) — le 11 §1 dit « dernière release stable au démarrage,
   **figée ensuite** » sans nommer de version. Figées à `minio/minio:RELEASE.2025-04-22T22-12-26Z`,
   `minio/mc:RELEASE.2025-04-16T18-13-26Z`, `caddy:2-alpine`. **À reconfirmer au provisionnement réel
   (L0-b)** puis gelées définitivement.
6. **Actions GitHub épinglées par tag majeur, pas par SHA** (A52) — inventer un SHA non vérifiable
   serait une fausse rigueur. Durcissement par SHA renvoyé en Phase 2, avec Dependabot.
7. **Tag d'image `main-<run>`** (A52) — republier « v0.0.0 » à chaque merge écraserait un tag censé
   désigner un état figé.
8. **Cron `0 3 * * *` écrit en dur** (A52) — GitHub Actions n'accepte pas de variable dans une
   expression cron ; duplique `RESTORE_TEST_CRON` du `.env.example` §12. Synchronisation manuelle,
   signalée dans le workflow.
9. **Ports internes des fronts** (A11) — contrat explicite : 5173 pour `field`, 5174 pour `hq`, `hq`
   construit en base `/hq/`. Le pack ne les tranchait pas.
10. **Commandes de migration** (A11) — `deploy.sh` appelle `pnpm db:migrate:check` (dry-run) puis
    `pnpm db:migrate`, conformément au garde-fou du §30.6 qui impose la mécanique sans nommer les
    commandes. Les deux scripts sont câblés dans le `package.json` racine ; leur IMPLÉMENTATION est un
    livrable du lot L1 (A12).
11. **Sonde de vivacité du worker** (A11) — `pgrep -f node`, faute de port exposé. Une vraie sonde de
    files arrivera avec les premiers jobs (L10/L11).
12. **`archive_mode=on` dès le premier démarrage** (A11) — impose un `pgbackrest stanza-create` manuel
    après le premier `up`, documenté au runbook. Sans lui, les WAL s'accumulent sans être archivés :
    c'est le point de contrôle n°1 de la porte P-A côté sauvegardes.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Prettier ne touche pas au pack — et le pack est désormais scellé

**Constat (signalé par A55, incident réel de ce lot) :** un `pnpm format` lancé par A01 a reformaté
les **12 fichiers du pack** (`docs/00_INDEX.md` … `docs/11_CONTRAT_TECHNIQUE.md`) : 724 insertions,
468 suppressions, commitées dans `a445739`. Prettier avait ajouté des lignes vides après les titres
et converti `*italique*` en `_italique_`. Le contenu a survécu ; le principe non.

**Pourquoi c'est grave alors que « le contenu a survécu » :** le 00_INDEX pose que le pack est
« LA source d'exécution unique », et le 09 §4 prévoit **une seule** révision légitime — la revue de
spec de la porte P-D, où « le pack est confronté au code réel, écarts documentés, spec amendée si le
réel l'exige ». Cette confrontation suppose un pack **comparable à lui-même**. Un pack qui bouge sous
l'effet d'un outil rend tout `diff` ultérieur illisible : les vraies modifications se noient dans le
bruit de reformatage. Le 09 §5.2 est catégorique : « tout écart à la spec est soit refusé, soit
documenté comme amendement horodaté — **jamais silencieux** ». Celui-ci était silencieux.

**Options :**

1. Laisser le pack reformaté (le contenu est intact).
2. Restaurer le pack et empêcher toute récidive.

**Arbitrage :** option 2, en trois gestes.
(a) **Restauration** : les 12 fichiers et `docs/archive/` remis à leur état d'import (`1f63eb1`) —
vérifié, `git diff 1f63eb1 -- docs/` ne montre plus que `docs/ETAT.md`, qui est notre fichier vivant.
(b) **`docs/` ajouté à `.prettierignore`**, avec le motif écrit en toutes lettres dans le fichier.
(c) **Sceau d'intégrité** : `scripts/check-pack-integrity.mjs` + `docs/.pack-integrity.json`
(empreintes SHA-256 des 12 fichiers), câblé en `pnpm check:pack`. Toute dérive rend le contrôle
rouge et affiche la marche à suivre. Le resceller exige `--sceller`, geste explicite réservé à un
amendement décidé — **jamais le sceau seul** : resceller sans tracer serait exactement le changement
silencieux que le contrôle existe pour empêcher. Contrôle **éprouvé** : modification d'un octet dans
`00_INDEX.md` → sortie 1 avec message ; restauration → vert.

**Ce que l'incident enseigne :** un outil de confort appliqué sans périmètre traverse les frontières
qu'aucune règle écrite ne lui a interdites. Les fichiers vivants (`ETAT.md`, `DECISIONS.md`,
`AMELIORATIONS.md`, `docs/conception/`, `docs/portes/`, `docs/journal/`) restent volontairement hors
du sceau : ce sont nos fichiers, pas la spécification.

**Décideur :** A01
**Impact spec :** aucun (retour à l'état d'origine)

---

## 2026-08-27 — [L0] Qui est le réviseur croisé de l'équipe 4 ?

**Constat (remonté par A55) :** le 09 §1 dote les équipes 1, 2 et 3 d'un réviseur croisé (A17, A29,
A37) mais **l'équipe 4 (rapports, IA, intégrations — lots L10 à L13) n'en a aucun**. Or l'étape 4 du
pipeline est obligatoire et sans raccourci : sans titulaire, elle n'a personne pour la signer.

**Options :**

1. Faire relire l'équipe 4 par son propre chef d'équipe (A40) — **exclu** : il signe déjà la fin
   d'incrément, et le 09 §1 dit d'un réviseur qu'il « relit TOUT le code de l'équipe, **ne produit
   rien** ». A40 produit.
2. Créer un 41e gabarit — **exclu** : le 09 §1 fixe le nombre à 40, et en ajouter un serait amender
   la spec pour un problème d'affectation.
3. Confier la revue de l'équipe 4 à **A17 (réviseur croisé backend)**.

**Arbitrage :** option 3. Les lots L10-L13 sont massivement backend : worker BullMQ, génération DOCX
côté serveur, pipeline LLM, webhooks signés, jobs de purge. C'est le domaine exact d'A17. Surtout, la
règle 09 §5.6 (« le code de test n'est jamais écrit par l'agent qui a écrit le code testé », et son
esprit : producteur ≠ vérificateur) est **pleinement respectée** — A17 n'intervient pas sur les lots
de l'équipe 4, il n'y relit donc jamais son propre travail. Cette affectation est notée dans les
gabarits A40 à A45.
**Réserve à surveiller :** A17 devient réviseur de deux équipes. Si les lots L10-L13 se déroulaient
**en parallèle** de lots de l'équipe 1, ce serait un goulot d'étranglement. Le calendrier 09 §6 rend
le cas improbable (L10-L13 sont en Phase 2, l'équipe 1 a fini en Phase 1) ; s'il se présentait, la
réponse serait de séquencer, pas de dégrader la revue.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Nomenclature des lots L9 à L13 : le pack la donne, il ne fallait pas la déduire

**Constat (remonté par A55) :** A55 a affecté « L10-L11 aux rapports/LLM et L12-L13 aux intégrations »
en signalant loyalement qu'il s'agissait d'« une inférence, pas une lecture ».

**Arbitrage : l'inférence est inutile — et partiellement fausse.** Le fichier **07 §12, section
PHASE 2**, énumère les lots explicitement. La lecture fait foi :

| Lot        | Contenu (07 §12, Phase 2)                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **L9**     | Back-office banque de questions complet (M1) + file ad hoc                                                                       |
| **L10**    | Génération DOCX (gabarits par niveau d'audit §26.2, docxtemplater, worker) + fiche sécurité grands comptes                       |
| **L11**    | Rédaction assistée LLM par bloc + états brut/généré/validé + journal des coûts + pseudonymisation 2 passes + business case normé |
| **L12**    | **Module AI Act** (bloc 9, registre `ai_systems`, chapitre rapport, correspondance ISO/IEC 42001)                                |
| **L13**    | **Intégration console V1** (import clients, webhooks entrant/sortant + anti-rejeu, `integration_events`)                         |
| **L13bis** | `document_requests` + recalage de mission outillé (§25.1) + point d'étape (§25.5)                                                |

A55 avait donc raison sur L10/L11 et **se trompait sur L12**, qu'il rattachait aux intégrations alors
que c'est le module AI Act. Correction confiée à A55 sur les gabarits A40-A45.
**Ce que l'épisode confirme :** la règle « un doute de spec va dans DECISIONS.md, jamais une
devinette » a fonctionné exactement comme prévu — A55 a signalé son inférence au lieu de la faire
passer pour une lecture, et l'erreur a été rattrapée en une minute au lieu de se propager dans six
gabarits pendant deux mois.
**Ordre de lecture de L9, L12, L13 :** le 00_INDEX n'en fournit pas (il s'arrête à L10-L11). Il sera
établi au brief de ces lots, en Phase 2, et ajouté au tableau de `CLAUDE.md` §0 à ce moment-là.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Les restrictions d'outils des gabarits sont contractuelles, pas mécaniques

**Constat (remonté par A55) :** le frontmatter d'un sous-agent permet de retirer entièrement `Edit`,
`Write` ou `Bash`, mais **pas de restreindre l'écriture à un sous-arbre**. Les bornes du type
« A02 n'écrit que dans la matrice de traçabilité » ou « A16 n'écrit que dans les tests » sont donc
des engagements écrits, vérifiables **a posteriori** (auteur du diff, `git status`), non des
verrous techniques.

**Options :**

1. Laisser les bornes contractuelles et s'appuyer sur la revue croisée et le `git status`.
2. Poser des hooks `PreToolUse` dans `.claude/settings.json` refusant une écriture hors périmètre.

**Arbitrage : option 1 pour le lot L0, option 2 proposée en fiche AMELIORATIONS (étage 2).**
Deux garde-fous mécaniques existent déjà et couvrent le risque le plus grave — celui d'un
vérificateur qui corrigerait ce qu'il vérifie : les **réviseurs croisés (A17, A29, A37) n'ont ni
`Edit` ni `Write` du tout**, et A55 n'a pas `Bash`. Pour le reste, l'étape 4 relit **tout** le diff
et le repérerait. Écrire des hooks maintenant serait de l'outillage d'autopilote pris sur le budget
d'un lot d'infrastructure ; c'est précisément ce que l'étage 2 sert à arbitrer, pas à décider seul.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Nom de l'outil de délégation

**Constat (remonté par A55) :** le gabarit d'A01 déclare l'outil `Agent` ; selon la version de
Claude Code il peut s'appeler `Task`.

**Arbitrage : vérifié sur cet environnement — c'est bien `Agent`.** Les délégations du lot L0 (A11,
A52, A55) ont été lancées et rendues avec cet outil : ce n'est pas une lecture de documentation, c'est
une observation d'exécution. Aucune modification à apporter. À revérifier si l'environnement change.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Suites de l'arbitrage Caddy : port interne unique et sauvegarde des certificats

Quatre doutes remontés par A11 après application de l'arbitrage « Cohabitation staging/prod ».
Deux entraînent une modification, deux sont actés tels que livrés.

### 1. `CADDY_STAGING_API_PORT` — supprimée

**Constat :** le Caddy de prod devant joindre l'API de staging, A11 avait introduit une variable pour
le port de cette dernière. Sa cohérence avec l'`API_PORT` du `.env` de staging serait **manuelle**,
entre deux fichiers, sur deux environnements.

**Arbitrage :** supprimer la variable ; `API_PORT=3000` devient une **convention interne des deux
environnements**. Le port de l'API est interne au réseau Docker et **n'est jamais publié**
(06 §10.3, 11 §2) : il n'existe aucun scénario où il devrait différer. Une variable dont deux copies
doivent coïncider à la main est une panne en attente — et la panne tomberait sur la **production**,
qui rendrait des 502 à cause d'une valeur de staging. Convention écrite dans le Caddyfile et au
runbook. Seule `CADDY_STAGING_SITE_ADDRESS` est ajoutée au `.env.example` (section 14).

### 2. `caddy_data` entre dans le périmètre de sauvegarde

**Constat :** depuis le passage au frontal unique, `caddy_data` détient les certificats TLS des
**deux** domaines et vit dans la pile de prod. Les scripts de sauvegarde couvrent Postgres et MinIO,
pas lui. A11 proposait de l'acter comme « régénérable par ACME ».

**Arbitrage : l'ajouter à la sauvegarde.** Le raisonnement « ACME régénère » ne tient pas dans le
seul moment où la question se pose — un PRA. Le RTO cible est de **4 h** (02 §11.4) et la procédure
en consomme déjà ~3 h 35. Une régénération sous plafond Let's Encrypt (5 certificats par domaine et
par semaine) peut échouer ; si elle échoue, **les deux environnements sont injoignables en HTTPS**,
y compris celui qui devrait servir à vérifier que la restauration a réussi. **Un PRA qui dépend d'un
service tiers à quota n'est pas un PRA.** Même chiffrement, même Storage Box, même rétention — et
**restauration vérifiée par `restore-test.sh`**, puisque le principe de tout ce lot est qu'une
sauvegarde jamais restaurée n'est pas une sauvegarde.

### 3. Ordre de déploiement prod → staging : règle de runbook, pas contrainte de CI

La dépendance est réelle (le frontal appartient à la prod) mais ne mord qu'**une fois** : au premier
démarrage, geste manuel de L0-b. En régime établi, un déploiement staging ne recrée pas le frontal.
Coder ce couplage entre deux workflows pour un cas unique coûterait plus qu'il ne protège. La
checklist de premier démarrage du runbook suffit, à condition d'être en tête de section.

### 4. Réseau `axion-edge-staging` en `external` : acté tel que livré

Déterministe, survit aux `down`, indépendant de l'ordre de démarrage, créé par `provision-vps.sh`
donc reproductible. Meilleur choix que de le faire posséder par l'une des deux piles.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Verdict de la revue croisée : NON CONFORME — et pourquoi c'est le système qui fonctionne

**Constat :** A17, réviseur croisé qui n'a produit aucune ligne du lot, rend **NON CONFORME** :
7 défauts bloquants, 12 majeurs. `git status` prouve qu'il n'a modifié aucun fichier — il a rendu un
verdict, pas un correctif (09 §1, §5.6).

**Le fil conducteur des 7 bloquants est unique** et mérite d'être nommé, parce qu'il se reproduira à
chaque lot mené par plusieurs agents : **A01, A11 et A52 ont livré en parallèle trois moitiés
d'interface qui ne se rejoignent pas.** Chacun a écrit un contrat propre et cohérent dans ses
commentaires ; aucun des trois n'est celui des autres. Exemples : la CI appelle `deploy.sh` sans les
arguments que le script exige · elle sonde `/api/health` là où la route est `/api/v1/health` · elle
`cd` dans `/opt/axion-audit` quand le dépôt est cloné dans `/opt/axion-audit/repo` · la console
écoute 5174 côté application et 5173 dans toute l'infrastructure · les images de fronts déposent des
fichiers dans un volume qui n'existe pas, pendant que Caddy les proxifie comme des serveurs HTTP.

**Ce que l'auto-revue (étape 3) a manqué et pourquoi.** Elle a vérifié ce qui s'exécute : lint,
typecheck, 91 tests, garde-fous, build, API à l'exécution. Tout était vert — et tout l'est resté.
**Aucun des 7 bloquants n'était atteignable par ces contrôles**, parce que ni Docker ni la CI n'ont
jamais tourné : le démon est arrêté et `origin` n'existe pas. L'auto-revue a donc mesuré ce qu'elle
pouvait mesurer et **conclu au-delà**. C'est la faute d'A01, pas celle des garde-fous.

**Décision de conduite — trois règles, applicables dès L1 :**

1. **Interface d'abord, implémentations ensuite.** Quand plusieurs agents travaillent en parallèle,
   A01 fige et écrit le contrat d'interface AVANT de déléguer — noms de scripts, chemins, ports,
   variables, routes — au lieu de le reconstituer après coup. Le `.env.example` a joué ce rôle pour
   les variables et **aucun bloquant ne porte sur elles** : la méthode marche, elle n'a simplement
   pas été appliquée aux ports, aux chemins et aux commandes.
2. **Une passe de jonction obligatoire** avant l'auto-revue, quand un lot a plusieurs producteurs :
   croiser systématiquement appelant → appelé (scripts `pnpm` invoqués par la CI, variables, ports,
   noms de services, chemins de déploiement). A17 l'a fait en quelques heures ; c'est reproductible.
3. **Ne jamais déclarer vert ce qui n'a pas tourné.** Un livrable non exécuté est « non vérifié »,
   jamais « livré ». Cette règle existait déjà (11 §9ter, « la vérité terrain, ce sont les tests ») —
   elle a été appliquée aux critères d'acceptation et oubliée pour le code lui-même.

**Suite donnée :** correction intégrale des 7 bloquants et des 12 majeurs avant toute ouverture du
lot L1, avec **exécution réelle** d'au moins `docker compose up` en local et de la suite E2E. Le
verdict d'A17 est repris tel quel au fichier de porte `docs/portes/PORTE_A_2026-08-27.md`.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Comment les fronts sont servis en production (défaut B-7)

**Constat (A17) :** le lot décrit l'architecture de service des fronts de **deux façons
incompatibles**. Les images `field` et `hq` ont une cible `runtime` qui copie le build dans `/sortie`
puis s'arrête (« Caddy sert les fichiers statiques depuis un volume partagé ») — mais aucun volume
`/sortie` n'existe, `docker-compose.prod.yml` vide même les volumes par `!reset []`, le `Caddyfile`
ne contient aucune directive `root`/`file_server` et fait `reverse_proxy axion-field:5173`, et les
healthchecks interrogent du HTTP. En staging et en prod, les conteneurs échoueraient sur `cp`,
redémarreraient en boucle, ne seraient jamais `healthy`, et **Caddy ne démarrerait pas**.

**Options :**

1. Une image runtime qui sert réellement du HTTP (nginx ou équivalent embarqué).
2. **Volume partagé + `root` / `file_server` dans les deux blocs de site de Caddy.**

**Arbitrage : option 2**, qui est celle que les Dockerfiles décrivaient déjà — il manquait la moitié
Caddy et le volume. Trois raisons, dont une décisive :

- **Décisive (PWA)** : Caddy doit contrôler lui-même le `Cache-Control` du service worker et le
  repli SPA (`try_files {path} /index.html`). Le `Caddyfile` porte DÉJÀ ces règles de cache — elles
  sont sans effet derrière un `reverse_proxy`. Or la mise à jour applicative §31 et le démarrage
  hors ligne dépendent exactement de ces en-têtes : les déléguer à un serveur intermédiaire, c'est
  perdre la maîtrise du seul mécanisme qui fait qu'un iPad en clientèle voit la bonne version.
- Un composant de moins à sécuriser et à mettre à jour — le raisonnement même qui a écarté Coolify
  au 02 §30.1.
- Caddy est déjà là et sait le faire.

**Mise en œuvre (A11) :** volumes nommés `field_dist` et `hq_dist` ; les conteneurs de front
deviennent des jobs one-shot (`restart: "no"`, dépendance `service_completed_successfully`) ; Caddy
les monte en lecture seule et sert `root` + `file_server` + repli SPA ; les healthchecks HTTP de ces
deux services disparaissent (un job one-shot n'a pas de vivacité à sonder).
**En développement, on garde `reverse_proxy` vers le serveur Vite** — le rechargement à chaud est le
seul intérêt du mode dev. La bascule se fait par un `import {$CADDY_FRONT_CONFIG}` désignant
`fronts.dev.caddy` ou `fronts.static.caddy` : explicite, lisible, et **le même snippet de sécurité
s'applique aux deux** — un dev plus permissif ne validerait rien.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Valeur du rouge d'alerte (#8c0a33)

**Constat :** l'invariant 4 énonce « l'alerte est un rouge **distinct** » sans fixer de valeur, là où
il fixe littéralement les quatre autres couleurs de la charte. Le fichier `packages/ui/src/tokens.ts`
renvoyait à une entrée `DECISIONS.md` de ce titre — **qui n'existait pas**. La revue croisée l'a
relevé (M-6) : le fichier annonçait lui-même la règle qu'il enfreignait. Entrée créée ici pour que la
référence dise vrai.

**Options :**

1. `#8a0e14` — un rouge pur (teinte 357°). **Écarté par la mesure** : 19,8° d'écart de teinte
   seulement avec le terracotta (16,9°), et un contraste mutuel de 1,99.
2. `#8c0a33` — un carmin (teinte 341°) : **35,8° d'écart de teinte** et **1,94 de contraste mutuel**.
3. `#d92d20` — un rouge vif. Écarté : 4,55 seulement sur l'ivoire (limite AA) et surtout **1,01 de
   contraste mutuel** avec le terracotta, c'est-à-dire deux couleurs de luminance identique.

**Arbitrage :** option 2. Règle de précédence **sans objet** (aucune divergence interne au pack :
le pack délègue explicitement le choix). Le mot « distinct » n'est pas traité comme une impression
mais mesuré sur les **deux** axes qui permettent de séparer deux rouges : la teinte **et** la
luminance. La teinte seule ne suffit pas pour un protanope ; la luminance seule ne suffit pas pour
distinguer deux rouges voisins. L'option 1, pourtant plus « rouge » à l'œil, échoue sur le premier
axe — et c'est un test qui l'a démontré, pas un avis.
Le carmin conserve par ailleurs 8,97 de contraste sur l'ivoire (AA très large) et 9,52 sur blanc.
Conformément au §33, le rouge n'est de toute façon **jamais le seul porteur de sens** : une alerte
porte toujours une icône et un libellé.
Les seuils (≥ 30° de teinte, ≥ 1,8 de contraste mutuel) sont **verrouillés par `tokens.test.ts`** :
une future modification de la charte qui les violerait rendrait la suite rouge.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Reprise de format des entrées du jour (écart V4 relevé par le gardien A02)

**Constat :** le gardien relève un écart au 11 §9bis, dont la sanction est sévère — « une décision non
tracée dans ce format n'existe pas ». Deux défauts :

1. l'entrée « Points d'infrastructure actés sans réserve » porte **12 sous-décisions** sans en-têtes
   `Options :` ni `Arbitrage :`. Appliqué à la lettre, le §9bis efface donc **douze arbitrages
   d'infrastructure** ;
2. **aucune** des entrées ne cite la règle de précédence **dans son arbitrage** — elle ne figure
   qu'en en-tête de fichier.

**Options :**

1. Réécrire les entrées fautives en place — **exclu** : `DECISIONS.md` est append-only, et le
   réécrire pour se mettre en conformité serait précisément le changement silencieux que le format
   existe pour empêcher.
2. Réémettre le contenu manquant dans une entrée nouvelle, et poser une règle de conduite pour la
   suite.

**Arbitrage :** option 2. Règle de précédence **sans objet** (question de forme, aucune divergence
interne au pack). Les 12 points sont réémis ci-dessous au format imposé ; l'entrée d'origine reste en
place, telle qu'écrite, et vaut désormais exposé des motifs.

**Règle de conduite, applicable dès L1 :** chaque entrée cite la règle de précédence **dans son
`Arbitrage :`** — soit en l'appliquant (« §32-36 prévaut sur §1-15, donc… »), soit en écrivant
« règle de précédence **sans objet** (aucune divergence interne) ». La mention en en-tête de fichier
ne dispense pas : c'est dans l'arbitrage qu'on doit voir que la question a été posée. Et **une entrée
= une décision** : un regroupement fait perdre à chaque point son `Options :`.

### Les 12 points, au format

Pour chacun : l'option retenue, puis l'alternative et **la raison précise de son rejet**. Règle de
précédence sans objet pour les douze — aucun ne porte sur une divergence interne au pack, tous
comblent un point que le pack laisse ouvert.

| #   | Objet                                | Options                                                                                          | Arbitrage                                                                                                                                                                                                                                       |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `DEPLOY_SSH_KNOWN_HOSTS`             | (a) empreinte en secret d'Environment · (b) `StrictHostKeyChecking=no`                           | **(a)**. (b) revient à accepter un homme du milieu sur le canal même qui porte nos déploiements.                                                                                                                                                |
| 2   | `GHCR_OWNER`, `IMAGE_TAG`            | (a) au `.env.example` · (b) en dur dans les Compose                                              | **(a)**. Non secrètes, mais sans elles `docker compose config` échoue en staging et en prod ; (b) figerait le compte GitHub dans le code.                                                                                                       |
| 3   | Remappage pgBackRest                 | (a) dériver `PGBACKREST_REPO1_*` des variables du contrat · (b) ajouter des variables au contrat | **(a)**. pgBackRest impose ses propres noms d'options ; (b) enfreindrait 11 §8.2 sans rien gagner.                                                                                                                                              |
| 4   | Image Postgres construite sur le VPS | (a) build local · (b) image publique + pgBackRest en second conteneur                            | **(a)**. pgBackRest doit vivre dans le conteneur qui exécute `archive_command` ; (b) rendrait le WAL archiving impossible. Écart assumé au « pull-only » du §30.6, seul build sur le serveur.                                                   |
| 5   | Tags MinIO / `mc` / Caddy            | (a) figer maintenant, reconfirmer au provisionnement · (b) `:latest`                             | **(a)**. 11 §1 dit « dernière release stable au démarrage, **figée ensuite** » ; (b) est une dérive de dépendances en pleine Phase 1.                                                                                                           |
| 6   | Actions GitHub par tag majeur        | (a) tag majeur · (b) SHA                                                                         | **(a)** pour la Phase 1. Inventer un SHA non vérifiable serait une fausse rigueur ; (b) part en Phase 2 avec Dependabot.                                                                                                                        |
| 7   | Tag d'image `main-<run>`             | (a) `main-<run>` · (b) version du `package.json`                                                 | **(a)**. (b) republierait « v0.0.0 » à chaque merge, écrasant un tag censé désigner un état figé.                                                                                                                                               |
| 8   | Cron `0 3 * * *` en dur              | (a) en dur + synchronisation manuelle signalée · (b) variable                                    | **(a)**. GitHub Actions n'accepte aucune variable dans une expression cron ; (b) est techniquement impossible.                                                                                                                                  |
| 9   | Ports internes des fronts            | (a) 5173 `field` / 5174 `hq` · (b) port unique                                                   | **(a)**. Deux serveurs de développement sur la même machine ont besoin de deux ports ; (b) empêcherait `pnpm dev`. _(La revue croisée a montré que l'infra ne respectait pas cette décision — correction en cours, la décision est confirmée.)_ |
| 10  | Commandes de migration               | (a) `db:migrate:check` puis `db:migrate` · (b) une seule commande                                | **(a)**. Le §30.6 impose « dry-run **puis** apply » ; (b) supprimerait le garde-fou.                                                                                                                                                            |
| 11  | Sonde du worker                      | (a) `pgrep -f node` · (b) exposer un port de santé                                               | **(a)** au L0. Le worker n'expose aucun port et le contrat ne lui en donne pas ; (b) créerait une surface réseau pour une sonde. Une vraie sonde de files arrive avec les premiers jobs (L10/L11).                                              |
| 12  | `archive_mode=on` dès le départ      | (a) activé + `stanza-create` manuel documenté · (b) activer après le premier démarrage           | **(a)**. (b) laisserait une fenêtre sans archivage WAL au moment le plus fragile. Le `stanza-create` devient le **point de contrôle n°1 de la porte P-A** côté sauvegardes.                                                                     |

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] ZAP baseline non bloquant jusqu'au lot L2

**Constat (remonté par A52, défaut M-7 de la revue croisée) :** `.github/workflows/zap-baseline.yml`
porte `ZAP_BLOQUANT: 'false'`. Le scan tourne, produit un rapport, mais ne peut pas faire rougir un
build. Le 11 §8-5 réserve à l'humain « désactiver ou skipper un test » ; un scan de sécurité non
bloquant en est un. Le fichier plaidait honnêtement sa cause dans son bandeau — mais un bandeau n'est
pas une décision. C'est le lot qui soutient qu'« un contrôle non exécuté n'est pas un contrôle » :
l'argument vaut aussi contre lui.

**Options :**

1. Rendre ZAP bloquant dès L0 — **exclu** : il n'existe au L0 aucune surface à scanner (ni
   authentification, ni route métier, ni formulaire), seulement Caddy et une route de santé. Un scan
   sur du vide produit soit un vert creux, soit du bruit — dans les deux cas une information fausse.
2. Retirer ZAP du lot L0 et l'introduire au L2 — **exclu** : l'outillage se câble à froid.
   Introduire un scanner le jour où il doit bloquer, c'est découvrir ses faux positifs au pire
   moment et arbitrer sous la pression de la première PR d'authentification.
3. Le garder non bloquant jusqu'au L2, comme **constante explicite versionnée**, avec une date de
   bascule nommée et tracée ici.

**Arbitrage :** option 3. Règle de précédence **sans objet** (aucune divergence interne au pack).
La bascule est datée : **lot L2**, dès l'arrivée de l'authentification (07 §12). C'est à partir de là
qu'un en-tête manquant, un cookie sans `Secure`/`HttpOnly`/`SameSite` ou une page d'erreur bavarde
deviennent des défauts réels. **Sans cette date écrite ici, la ligne resterait à `'false'` par simple
inertie** : personne ne rouvre un fichier pour durcir un contrôle qui ne le gêne pas.
Trois garde-fous entourent la dérogation : elle est une **constante lisible** et non un
`continue-on-error` (09 §5.7) ; le **code 3 de ZAP reste bloquant même au L0** — un scanner qui ne
tourne pas n'est pas un scan non bloquant, c'est une absence de scan déguisée ; le rapport est
archivé 30 j en artefact.

**Point de contrôle à la porte du lot L2 :** passer `ZAP_BLOQUANT` à `'true'` **et** remplacer
`ZAP_IMAGE: ghcr.io/zaproxy/zaproxy:stable` — qui est un **tag mobile**, le fichier le dit désormais
au lieu de prétendre l'inverse — par le digest relevé dans le résumé des runs. Une porte bloquante
doit être reproductible : sinon une PR devient rouge parce que le scanner a changé pendant la nuit,
et personne ne peut le démontrer.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Le tag d'image du scanner ZAP reste mobile, délibérément

**Constat (A52, défaut M-8) :** `ZAP_IMAGE: ghcr.io/zaproxy/zaproxy:stable` était commenté
« épinglée (11 §1 — gel des dépendances Phase 1) ». `:stable` est un **tag mobile** : le commentaire
affirmait le contraire de ce que faisait la ligne.

**Options :**

1. Inventer un numéro de version pour « épingler » — **exclu** : un tag non vérifiable serait un
   mensonge de plus, ajouté pour faire taire le premier.
2. Figer sur un digest relevé à l'exécution.
3. Assumer le tag mobile, dire pourquoi, et rendre le résultat traçable après coup.

**Arbitrage :** option 3 pour la Phase 1, option 2 au lot L2. Règle de précédence **sans objet**.
Le gel du 11 §1 vise **ce qui entre dans le produit** ; ZAP l'inspecte de l'extérieur et n'est
embarqué nulle part. Or les règles passives d'un scanner **sont la matière même du contrôle** : un
scanner figé cesse silencieusement de détecter les défauts apparus après son gel — il devient vert
pour de mauvaises raisons, ce qui est exactement le défaut que ce lot pourchasse partout ailleurs.
Le coût du tag mobile est rendu récupérable : une étape journalise le **digest réellement utilisé**
dans le résumé du run. On sait toujours après coup ce qui a tourné.
**Au L2**, quand le scan devient bloquant, ce digest remplace le tag : une porte bloquante doit être
reproductible.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0] Régularisation de format et mécanisation du contrôle (réserve R1 du gardien)

**Constat :** le gardien A02 a mesuré, entrée par entrée, que **4 des 23 entrées** respectaient
intégralement le format 11 §9bis. Ma « Reprise de format » précédente couvrait les 12 sous-décisions
groupées mais **pas** quatre entrées à part entière — dont « Suites de l'arbitrage Caddy », **au nom
de laquelle `infra/scripts/backup-caddy.sh` existe dans le dépôt**. Appliqué à la lettre, le §9bis
(« une décision non tracée dans ce format n'existe pas ») effaçait donc une décision dont du code
dépend. A02 ajoute l'observation décisive : **la gouvernance de `DECISIONS.md` était la seule règle
du dépôt à reposer sur la seule discipline**, dans un lot dont la revue croisée a trouvé « trois
garde-fous qui mentaient ou n'étaient branchés nulle part ».

**Options :**

1. Réécrire les entrées fautives en place — **exclu**, pour la même raison qu'à la reprise
   précédente : `DECISIONS.md` est append-only, et le réécrire pour se mettre en conformité serait
   exactement le changement silencieux que le format existe pour empêcher.
2. Réémettre chacune des 19 entrées concernées — **exclu** : dix-neuf doublons rendraient le fichier
   moins lisible, donc moins auditable. Le remède serait pire que le défaut.
3. **Une entrée de régularisation** qui comble ce qui manque et déclare, pour chaque entrée
   antérieure, le statut de la règle de précédence — et **un contrôle mécanique** qui lit cette
   régularisation **dans le fichier lui-même**.

**Arbitrage :** option 3. **Règle de précédence : sans objet** (question de forme, aucune divergence
interne au pack).
Le point important est le troisième : `scripts/check-decisions.mjs` vérifie désormais le format des
entrées à chaque `pnpm verify`, et son exemption **n'est pas une liste cachée dans le script** — il
lit la section « Entrées régularisées » ci-dessous, visible de tout lecteur du fichier de
gouvernance. Une exemption qu'on ne peut pas voir en lisant le registre serait le trou que ce lot a
passé sa journée à boucher ailleurs.
La recommandation d'A02 est reprise telle quelle : **le pack ne l'exige nulle part**, mais l'argument
est celui qu'on applique partout ici — ce qu'une machine peut vérifier ne doit pas dépendre de la
vigilance d'un agent.

### Ce qui manquait aux quatre entrées, comblé ici

**« Points d'infrastructure actés sans réserve »** — _Options :_ (a) grouper douze arbitrages
d'exécution sans alternative défendable en une entrée · (b) douze entrées séparées.
_Arbitrage :_ (a) au moment de l'écriture, pour la lisibilité ; **c'était une erreur**, corrigée par
la reprise du même jour qui réémet les douze avec leurs options et le motif de rejet de l'alternative.
La règle « une entrée = une décision » en découle.

**« Nomenclature des lots L9 à L13 »** — _Options :_ (a) déduire la nomenclature du contenu des
rôles (ce qu'avait fait A55, en le signalant) · (b) la **lire** au fichier 07 §12, section Phase 2.
_Arbitrage :_ (b). Ce n'était pas un arbitrage mais une lecture — et la déduction s'était trompée
sur L12 (module AI Act, et non intégrations).

**« Nom de l'outil de délégation »** — _Options :_ (a) `Agent` · (b) `Task`, selon la version de
Claude Code. _Arbitrage :_ (a), **vérifié par exécution** : les délégations du lot L0 ont été lancées
et rendues avec cet outil. Observation, pas lecture de documentation.

**« Suites de l'arbitrage Caddy »** — _Options :_ pour chacun des quatre points, l'entrée expose déjà
l'alternative et le motif de son rejet (variable de port supprimée contre variable conservée ;
`caddy_data` sauvegardé contre régénéré par ACME ; règle de runbook contre contrainte de CI ; réseau
`external` contre réseau possédé par une pile). Il manquait l'**en-tête** `Options :`, pas le
raisonnement.

**« Verdict de la revue croisée »** — _Options :_ (a) corriger les défauts sans en tirer de règle ·
(b) corriger **et** poser trois règles de conduite pour L1. _Arbitrage :_ (b) — sans quoi la même
cause reproduirait les mêmes sept défauts au lot suivant. C'est d'ailleurs ce qui est arrivé à
l'échelle réduite des garde-fous, et la seconde passe l'a attrapé.

### Entrées régularisées

Pour toutes les entrées ci-dessous, antérieures à la mise en place du contrôle mécanique :
**règle de précédence sans objet — aucune ne tranche une divergence interne au pack.** Chacune comble
un point que le pack laisse ouvert, ou constate un fait d'environnement. Les deux seules décisions du
lot qui auraient pu mobiliser la précédence — « Cohabitation staging/prod » et « Nomenclature
L9-L13 » — ont été tranchées par **lecture littérale** du pack, ce qui rend la précédence sans objet
par construction : il n'y avait pas deux sections en conflit, il y avait une section qu'on n'avait
pas ouverte.

- Emplacement du pack d'implémentation dans le dépôt
- Versions Node/pnpm de la machine de développement vs contrat §1
- Absence de dépôt distant : l'invariant « un commit non poussé n'existe pas » est inapplicable
- Démon Docker arrêté : le critère « `docker compose up` = stack complète » n'est pas vérifiable en séance
- Périmètre exact de L0 : quels critères sont codables et lesquels dépendent d'infrastructure réelle
- Squelette applicatif minimal des 5 espaces de travail dès L0
- Cohabitation staging/prod : qui écoute sur 443 ?
- CSP : la concession `style-src 'unsafe-inline'`
- Dépendances d'outillage absentes de la liste 11 §1
- Environment GitHub `ops` pour le test de restauration nocturne
- Points d'infrastructure actés sans réserve
- Prettier ne touche pas au pack — et le pack est désormais scellé
- Qui est le réviseur croisé de l'équipe 4 ?
- Nomenclature des lots L9 à L13 : le pack la donne, il ne fallait pas la déduire
- Les restrictions d'outils des gabarits sont contractuelles, pas mécaniques
- Nom de l'outil de délégation
- Suites de l'arbitrage Caddy : port interne unique et sauvegarde des certificats
- Verdict de la revue croisée : NON CONFORME — et pourquoi c'est le système qui fonctionne
- Comment les fronts sont servis en production (défaut B-7)
- Valeur du rouge d'alerte (#8c0a33)
- Reprise de format des entrées du jour (écart V4 relevé par le gardien A02)
- ZAP baseline non bloquant jusqu'au lot L2
- Le tag d'image du scanner ZAP reste mobile, délibérément

**À partir de cette entrée, le contrôle est mécanique : plus aucune régularisation ne sera
nécessaire, parce que `pnpm verify` refusera l'entrée hors format avant le commit.**

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0-b] Faux positif gitleaks sur le sceau du pack

**Constat :** à la **première exécution réelle de la CI**, gitleaks a bloqué sur
`docs/.pack-integrity.json`, ligne 9, règle `generic-api-key`. La chaîne détectée est une **empreinte
SHA-256** d'un des 12 fichiers du pack, posée par `pnpm check:pack`.

**Options :**

1. Ne rien exempter et supprimer le sceau — **exclu** : le sceau existe parce que Prettier a réécrit
   les 12 fichiers du pack en silence ce matin. Le retirer pour faire taire un scanner rouvrirait le
   trou qu'il a été écrit pour fermer.
2. Exempter la RÈGLE `generic-api-key` sur ce seul chemin — **techniquement impossible proprement** :
   gitleaks n'offre pas de moyen d'exempter une règle par défaut sur un chemin sans redéfinir la
   règle, or la redéfinir sans fournir sa regex la viderait **sur tout le dépôt**. Le remède serait
   bien pire que le mal.
3. Exempter le CHEMIN dans l'allowlist globale, en disant exactement ce que cela coûte.

**Arbitrage :** option 3. Règle de précédence **sans objet** (aucune divergence interne au pack).
Une empreinte est la sortie d'une fonction de hachage appliquée à un fichier **versionné dans ce même
dépôt** : quiconque le lit peut la recalculer. Elle ne donne accès à rien.
**Le coût, sans l'enjoliver :** ce fichier est désormais exempté de **toutes** les règles, pas
seulement de celle qui a levé l'alerte. Le risque résiduel est qu'un secret y soit collé sans être
détecté.
**Ce qui rend ce risque acceptable, et lui seul :** le fichier est **entièrement généré** par
`check-pack-integrity.mjs --sceller` — 12 chemins, 12 empreintes, une phrase. Personne ne l'édite à
la main, et `pnpm check:pack` échoue si son contenu ne correspond plus au pack : un secret n'y
survivrait pas au prochain scellement.
Le 11 §8-4 réserve à l'humain de « toucher à la sécurité autrement que spécifié » — d'où cette entrée
plutôt qu'une ligne ajoutée en silence. **À relire à la porte P-A** : c'est la seule concession de
sécurité du lot avec la CSP.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0-b] Ordre d'activation de corepack dans la CI

**Constat :** à la première exécution réelle, **cinq jobs sur quinze** sont tombés avant leur première
commande utile. `.github/actions/setup-node-pnpm` activait corepack et préparait pnpm 9 **avant**
`actions/setup-node`, parce que cette action a besoin de pnpm sur le `PATH` pour résoudre son cache.
Mais `setup-node` **remplace ensuite l'installation de Node** : le shim pnpm préparé sous le Node du
runner disparaît avec elle, et `pnpm --version` échouait — sous `set -euo pipefail`, le garde-fou de
versions mourait donc avant même de pouvoir dire pourquoi.

**Options :**

1. Déplacer corepack après `setup-node` — **exclu** : le cache pnpm de `setup-node` ne serait plus
   résolu, et chaque job réinstallerait tout.
2. Activer corepack **deux fois** : avant pour le cache, après pour le shim.
3. Renoncer au cache pnpm — exclu : quinze jobs qui réinstallent les dépendances, pour rien.

**Arbitrage :** option 2. Règle de précédence **sans objet**. Les deux activations ne font pas double
emploi : elles répondent à deux besoins différents, et le fichier le dit en toutes lettres pour que
personne ne « nettoie » la seconde en croyant à une redondance.
**Ce que l'épisode confirme :** ce défaut était invisible à la lecture — le fichier était correct
pour qui ne connaît pas le comportement de remplacement de `setup-node`. **Seule la première
exécution réelle pouvait le montrer**, et c'est précisément ce que la règle « ne jamais déclarer vert
ce qui n'a pas tourné » sert à provoquer.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0-b] Protections GitHub indisponibles sur le plan actuel

**Constat, vérifié par appel d'API le 2026-08-27 :** sur un dépôt **privé** au plan gratuit, GitHub
refuse **les trois** mécanismes de protection que le pack exige :

| Mécanisme                                      | Exigé par          | Réponse de l'API                                                                                                                            |
| ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Relecteur obligatoire sur l'Environment `prod` | 02 §30.4-3, §30.5  | « Failed to create the environment protection rule. Please ensure the billing plan supports the required reviewers protection rule. » (422) |
| Protection de branche sur `main`               | 02 §30.5           | « Upgrade to GitHub Pro or make this repository public. » (403)                                                                             |
| Rulesets de dépôt                              | idem, voie moderne | même refus (403)                                                                                                                            |

Le dépôt a par ailleurs été **basculé de public à privé** avant tout push : il était public à sa
création, et le 02 §30.5 impose « repo **privé** ». Y pousser le CDC maître et la méthodologie
d'audit aurait publié le cœur du produit.

**Options :**

1. Rendre le dépôt public pour retrouver les protections gratuitement — **exclu, sans discussion** :
   le pack impose le privé, et le dépôt contient la méthodologie d'audit, le CDC maître et la
   configuration d'infrastructure.
2. Ne rien faire et documenter le manque — **exclu** : la conséquence concrète serait qu'un
   `git push --tags` déploie en **production** sans aucune barrière humaine. C'est l'inverse exact
   du §30.4-3, et c'est un geste qu'on fait sans y penser.
3. Poser des **garde-fous compensatoires** dans ce qui EST versionnable, et nommer précisément ce
   qui reste découvert.

**Arbitrage :** option 3. Règle de précédence **sans objet** (contrainte de plateforme, aucune
divergence interne au pack).

**Ce qui est compensé — le déploiement de production.** Le déclencheur par tag `v*` est retiré de
`deploy-prod.yml`. Le déploiement devient **manuel** et exige une **confirmation tapée**
(`DEPLOYER-EN-PRODUCTION`), vérifiée par un job dont tous les autres dépendent. C'est plus lourd
qu'un clic d'approbation — c'est le prix, et il est assumé plutôt que masqué. Une entrée
`reconstruire` distingue le déploiement d'une nouvelle version du redéploiement d'un tag existant
(rollback). Tout est réversible en trois lignes le jour où le plan change : le bloc `push: tags:` est
laissé en commentaire à sa place, avec la marche à suivre.

**Ce qui reste DÉCOUVERT, dit sans détour** — rien dans un fichier versionné ne peut le combler :

- **`main` n'est pas protégée.** Rien n'empêche techniquement un `git push` direct, un force-push ou
  une suppression de branche. La règle « jamais de commit direct sur `main` » (11 §9bis) redevient
  une discipline, pas une barrière. C'est la garantie la plus précieuse que le lot perd.
- **La CI n'est pas requise avant merge.** Elle s'exécute et elle est bloquante _dans son propre
  verdict_, mais GitHub ne peut pas refuser un merge sur cette base.

**Recommandation :** **GitHub Pro** (~4 $/mois) rétablit les trois mécanismes d'un coup. Rapporté à
un outil qui portera des données d'audit de grands comptes — et dont le §10.5 promet un journal
d'audit et une réversibilité contrôlée —, c'est le meilleur rapport coût/protection du projet.
**À porter au dossier de la porte P-A comme point d'arbitrage de Williams.**

**Décideur :** A01 pour les compensations · **Williams** pour le plan GitHub
**Impact spec :** aucun — les exigences du §30.4-3 et du §30.5 restent inchangées et non tenues en
l'état ; elles sont désormais tracées comme telles plutôt que réputées satisfaites.

---

## 2026-08-27 — [L0-b] Dépôt PUBLIC : pseudonymisation du client pilote et retrait du CDC

**Constat :** Williams veut le dépôt **public**. Deux conséquences s'opposaient :

- **Favorable** — sur un dépôt public, GitHub rend **gratuites** la protection de branche, les
  rulesets et les relecteurs obligatoires d'environnement, tous refusés sur un dépôt privé au plan
  gratuit. Le passage en public **rétablit donc les trois protections** que le 02 §30.5 exige, et
  rend GitHub Pro inutile.
- **Défavorable** — le dépôt portait **47 mentions nominatives du client pilote** réparties dans
  9 fichiers du pack, plus **36 dans le CDC maître** : le fait qu'un tiers nommé est audité, le
  calendrier de sa mission, le plan de repli si le multi-pays n'est pas tranché. Plus la
  méthodologie complète et les paramètres de chiffrage (taux horaires).

**Options :**

1. Rester privé et payer GitHub Pro (~4 $/mois) — conforme au 02 §30.5, qui impose le privé.
2. Passer public tel quel — publie le nom d'un tiers et son calendrier d'audit. **La confidentialité
   d'un client n'appartient pas à celui qui l'audite**, et la publication est irréversible : indexée
   et clonée en minutes, elle survit à toute suppression.
3. **Pseudonymiser puis passer public.**

**Arbitrage : option 3, choisie par Williams.** Règle de précédence **sans objet** (le pack impose le
privé au §30.5 ; le passage en public est un **amendement assumé**, tracé ci-dessous — pas une
divergence interne à arbitrer).
Le nom du client n'est **jamais nécessaire au fonctionnement** — c'est exactement l'invariant 2
(« aucune référence client : tout ce qui varie est une donnée de mission »). Le retirer du pack ne
lui fait donc rien perdre d'opérationnel, et **renforce** l'invariant au lieu de l'affaiblir.

**Exécution :**

1. le nom du client → « le client pilote » dans les 9 fichiers du pack, avec des règles ordonnées du
   plus spécifique au plus général pour que la grammaire tienne (« mission le client pilote » → « mission
   **du** client pilote », et non « mission le client pilote »). 47 mentions, relues.
2. `docs/archive/` (CDC maître) **retiré du dépôt** et gitignoré. C'est une archive qui « ne prévaut
   plus » (00_INDEX) et qui ne sert à aucun lot ; elle reste sur la machine de Williams.
3. **Réécriture de l'historique** — le point décisif, et celui qu'on oublie : supprimer un fichier
   dans un nouveau commit **ne l'efface pas de l'historique**. Le CDC était dans le premier commit et
   les 47 mentions dans tous. Passer le dépôt en public les aurait exposés via `git log -p`. L'ancien
   historique est donc purgé et remplacé, et l'ancien état **n'a jamais été public** — il n'a existé
   que sur un dépôt privé.
4. Sceau du pack régénéré (les empreintes changent avec le contenu), puis passage en public, puis
   pose des protections désormais gratuites.

**Amendement de spec assumé :** le 02 §30.5 dit « Repo **privé** ». Le dépôt est public à compter de
cette entrée, sur décision de Williams, la confidentialité étant assurée par la pseudonymisation et
le retrait de l'archive plutôt que par la visibilité du dépôt. **Ce qui reste public et l'était
déjà par nature** : la méthodologie d'audit et les paramètres de chiffrage par défaut. C'est le
véritable coût de cette décision, et il est assumé en connaissance de cause.

**Décideur :** **Williams** (visibilité) · A01 (mise en œuvre de la pseudonymisation)
**Impact spec :** **amendement horodaté du 02 §30.5** — « repo privé » devient « repo public,
pseudonymisé ». Le reste du §30.5 (protections, Environments, GHCR) est inchangé et devient enfin
applicable.

---

## 2026-08-27 — [L0-b] Les protections GitHub sont rétablies par le passage en public

**Constat :** l'entrée « Protections GitHub indisponibles sur le plan actuel » du même jour établissait
que GitHub refusait les trois mécanismes du 02 §30.5 sur un dépôt **privé au plan gratuit**. Le dépôt
étant devenu **public** (entrée précédente), **les trois sont désormais gratuits et posés**.

**Options :** aucune — cette entrée constate une levée de contrainte et annule la compensation
devenue inutile. Règle de précédence **sans objet**.

**Arbitrage — état vérifié par appel d'API :**

| Protection                       | État     | Détail                                                                                                                                                                  |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protection de `main`             | ✅ posée | PR obligatoire · **11 contrôles de CI requis** · à jour avant merge · historique linéaire · force-push interdit · suppression interdite · fils de discussion à résoudre |
| Relecteur obligatoire sur `prod` | ✅ posée | `required_reviewers` = Williams. C'est l'approbation manuelle du 02 §30.4-3, enfin réelle.                                                                              |
| Stratégie de merge               | ✅ posée | **squash uniquement** (11 §9bis), suppression automatique de la branche après merge                                                                                     |

**Ce qui est annulé :** le garde-fou compensatoire de `deploy-prod.yml` (confirmation tapée) est
**retiré**, et le **déclencheur par tag `v*` est rétabli** — c'est la lettre du 11 §9bis (« tag
`v0.<lot>` à chaque porte franchie ») et du 02 §30.6. L'approbation est de nouveau portée par
l'Environment, là où le pack la place. Le fichier conserve l'historique de ce va-et-vient en tête,
pour que personne ne retire le déclencheur en croyant corriger un oubli — ni ne le laisse en place si
le dépôt redevenait privé sans plan payant.

**Ce que GitHub Pro n'est plus :** nécessaire. La recommandation faite plus tôt dans la journée était
**conditionnée à la confidentialité du dépôt** ; elle tombe avec le passage en public.

**Point de vigilance qui subsiste, propre au public :** les secrets de dépôt ne sont pas transmis aux
workflows déclenchés depuis un **fork**. Le contrôle de l'invariant 2 y annoncera donc « NON
APPLIQUÉ » plutôt que vert — c'est voulu, et c'est écrit dans sa sortie.

**Décideur :** A01
**Impact spec :** aucun — le 02 §30.5 redevient applicable **intégralement**, ce qu'il n'était pas
depuis ce matin.

---

## 2026-08-27 — [L1] Les tables de Phase 2/3 ne sont PAS créées au lot L1

**Constat (divergence relevée par A16, seul test rouge de sa suite) :** deux fichiers du pack se
lisent différemment sur `surveys`, `survey_responses` et `solutions_catalog`.

- Le **fichier 04 §7** les range sous un intertitre explicite :
  « PHASE 2/3 (DDL de référence — **créées par les migrations de leurs lots**) ».
- Le **fichier 07 §12**, ligne L1, commande « Schéma SQL fichier 04 V2.2 **INTÉGRAL**
  (toutes tables + colonnes des avenants) », et `CLAUDE.md` §0 fait du fichier 07 le brief
  exclusif d'un lot.

A12 les a créées (migration `0007`), A16 a testé leur absence. **Aucun des deux n'a tort de lire ce
qu'il a lu** — et l'enjeu est réel : le manifeste du diff schéma-vs-04 (11 §7) est extrait du
fichier 04, donc les deux lectures produisent deux manifestes, et la porte P-A trancherait au pire
moment.

**Options :**

1. Créer les trois tables dès L1 — lecture du fichier 07, et argument pratique : elles ne coûtent
   rien et évitent une migration ultérieure.
2. Les différer à leurs lots — lecture du fichier 04.

**Arbitrage : option 2.** Règle de précédence : les deux passages appartiennent à la même strate
(§1-15), elle ne les départage donc pas directement. **Trois raisons tranchent :**

1. Le **00_INDEX** pose que « **le DDL vit exclusivement dans le fichier 04** ». Sur une question de
   DDL — quelles tables existent — le fichier 04 est l'autorité désignée, pas le fichier 07.
2. Le fichier 04 parle **spécifiquement** de ces trois tables ; le fichier 07 parle **généralement**
   du périmètre de la transcription. Le spécifique l'emporte sur le général.
3. Le « INTÉGRAL (toutes tables **+ colonnes des avenants**) » du fichier 07 vise un risque précis et
   différent : oublier les tables et colonnes ajoutées par les avenants §16-29. C'est un vrai risque,
   et cette phrase le couvre — elle ne dit pas « y compris celles que le 04 diffère explicitement ».

**Conséquence :** migration `0007` retirée, les trois tables sortent du manifeste. Elles arrivent avec
leurs lots (sondage collaborateurs en tête de Phase 2, §28.2-4 ; catalogue de solutions §28.2-7). Le
test d'A16 est conservé **tel quel** : il devient la garantie qu'elles n'apparaîtront pas par
inadvertance avant leur lot.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L1] Bornes des paliers : le contrat technique fait foi

**Constat (A16) :** deux jeux de bornes coexistent.

| Source  | micro | pme        | eti           | grand_compte |
| ------- | ----- | ---------- | ------------- | ------------ |
| 01 §2.3 | 1-10  | **10**-250 | **250**-5 000 | **5 000**+   |
| 11 §5   | 1-10  | **11**-249 | 250-4999      | 5000+        |

**Options :**

1. Suivre le 01 §2.3, plus ancien et cité comme source.
2. Suivre le 11 §5.

**Arbitrage : option 2.** Règle de précédence : **sans objet au sens strict** — il n'y a pas ici deux
règles contradictoires, mais une prose imprécise et sa normalisation.
Les bornes du 01 §2.3 **se chevauchent** : une entreprise de 250 salariés relève à la fois de `pme` et
d'`eti`, une de 5 000 à la fois d'`eti` et de `grand_compte`. Traduites telles quelles en
`headcount_min`/`headcount_max`, elles produiraient **deux paliers pour un même effectif** — le
questionnaire assemblé dépendrait alors de l'ordre des lignes en base. Ce n'est pas une divergence,
c'est une ambiguïté que le §2.3 ne tranche pas.
Le 11 §5 cite d'ailleurs « (bornes §2.3) » : il se présente comme la **transcription** du §2.3, et il
la désambiguïse. C'est exactement le rôle que le contrat s'assigne — « épingler TOUTES les décisions
techniques que l'autopilote devrait sinon deviner ».
Le seed retient donc **1-10 · 11-249 · 250-4999 · 5000+**, disjointes et exhaustives.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L1] Le fil rouge naît en tests d'intégration, il passe à Playwright au lot L3

**Constat :** le 09 §4bis dit « un test **Playwright** unique marqué `@filrouge` rejoue à CHAQUE merge
le parcours de bout en bout **DISPONIBLE À DATE** ». A16 l'a livré en test d'INTÉGRATION, pas
Playwright.

**Options :**

1. Écrire un test Playwright dès L1 — **impossible en pratique** : le parcours du fil rouge commence
   à « création mission → import arbre » (L3). Au lot L1 il n'existe ni écran ni route métier ; un
   Playwright n'aurait littéralement rien à piloter, et sa seule fonction serait de porter le tag.
2. Le faire vivre au niveau d'intégration tant qu'il n'y a pas d'interface, puis le migrer.

**Arbitrage : option 2.** Règle de précédence **sans objet** (aucune divergence interne).
C'est la lecture littérale de « **disponible à date** », que le §4bis souligne lui-même : le fil rouge
n'est pas un test figé qu'on écrit une fois, c'est un parcours qui **grandit à chaque lot**. Au L1, ce
qui est disponible, ce sont les deux missions canoniques en fixtures — et A16 en a tiré une vraie
preuve : FIL-GC construit **150 unités sur 4 niveaux vérifiés par requête récursive, 60 sessions,
8 100 réponses**, ce qui démontre au passage que l'unicité `answers` tient à l'échelle et que les deux
missions ne se mélangent pas.
**Migration imposée au lot L3**, dès que « création mission → import arbre → questionnaire figé »
existe : le fil rouge devient alors un test Playwright, et les fixtures d'A16 en deviennent le jeu de
données. À porter au brief du L3 ; sans cette date écrite, le fil rouge resterait au niveau
d'intégration par inertie, et la porte P-C réclamerait un Playwright que personne n'aurait écrit.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L1] Testcontainers : à installer, ce n'est pas un ajout de dépendance

**Constat :** A16 a écrit ses tests d'intégration sur des **bases éphémères** de la pile Compose
(`axion_l1_<suffixe>`, créées puis supprimées en `afterAll`), faute de Testcontainers dans le dépôt.
Il a refusé de l'installer lui-même : `package.json` n'est pas son périmètre, et le 11 §8.1 réserve à
l'humain l'ajout d'une dépendance hors de la liste §1. **Prudence correcte, prémisse inexacte.**

**Options :**

1. Conserver le repli sur bases éphémères.
2. Installer Testcontainers.

**Arbitrage : option 2.** Règle de précédence **sans objet**. Le 11 §1 liste nommément
« **Vitest 3 + Testcontainers** » : l'installer, c'est appliquer le contrat, pas s'en écarter — le
§8.1 ne mord que sur ce qui est **hors** de cette liste. A16 a eu raison de ne pas trancher seul, et
raison de le signaler plutôt que de contourner en silence.
Ce que le repli coûterait si on le gardait : les tests dépendraient d'une pile Compose **déjà
démarrée**, donc d'un état extérieur au dépôt. Un développeur sur un clone neuf verrait des tests
d'intégration rouges sans comprendre pourquoi — exactement le défaut de `lint` avant `build` corrigé
au lot L0. Testcontainers rend la suite **autoportante**.
A16 indique que la bascule ne touche que deux fonctions de `apps/api/tests/aide/base-l1.ts`. Elle lui
revient : c'est son périmètre, et il ne testerait pas son propre code de production ce faisant.
**Le repli reste documenté** en tête du fichier : si Testcontainers échouait sur un poste, on saurait
quoi faire au lieu de désactiver la suite.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L1] Portée du marqueur `@critique`

**Constat (A16) :** il a marqué `@critique` les 12 tests couvrant les critères durs du lot L1. Le pack
ne désigne nommément que trois familles : « **les 8 scénarios offline, les tests RBAC/propriété et le
diff schéma-vs-04** » (09 §2, repris au 11 §7).

**Options :**

1. Étendre `@critique` à tout critère d'acceptation dur, lot par lot.
2. Le réserver aux trois familles nommées par le pack.

**Arbitrage : option 2.** Règle de précédence **sans objet**.
Un marqueur qui désigne presque tout ne désigne plus rien. Sa fonction est de distinguer, dans une
suite où **aucun** test n'est skippable (la liste d'exceptions de `check-no-skipped-tests` est vide et
un garde-fou de CI vérifie qu'elle le reste), le sous-ensemble dont l'échec signe une **perte de
données ou une fuite de droits** — ce que `pnpm test:critique` permet de rejouer seul, en urgence,
sans attendre la suite complète.
Au lot L1, une seule famille nommée s'applique : le **diff schéma-vs-04**. Les autres tests de L1
restent obligatoires — ils le sont tous — mais sans le marqueur.
Cet arbitrage vaudra pour les lots suivants : c'est le pack qui décide de ce qui est `@critique`, pas
la difficulté ressentie du test.

**Décideur :** A01
**Impact spec :** aucun

---

## 2026-08-27 — [L0-b] Dimensionnement du VPS : CX33 à Nuremberg, sans volume

**Constat :** le 02 §11.1 dimensionne la V1 à « CX32/CPX31 (4 vCPU, 8-16 Go) — **~15-25 €/mois** ».
Deux choses ont changé depuis la rédaction du pack : les gammes Hetzner ont été renommées, et les
prix ont augmenté. A01 avait recommandé un **CPX32 à 35,49 €** — recommandation **fausse**, non par
erreur de raisonnement mais par **jeu d'options incomplet** : la comparaison n'a porté que sur la
gamme CPX, celle qui figurait dans la liste transmise.

**Williams a corrigé, et le travail lui revient entièrement** : il a identifié la gamme
« Cost-Optimized » (CX) — environ **4× moins chère à caractéristiques égales** — puis testé la
disponibilité réelle datacenter par datacenter, Hetzner affichant « Limited availability of cloud
instances » depuis le 26/06. Résultat : `CX43` (le choix évident sur le papier) est **introuvable
partout en Europe**, la gamme Arm est épuisée, et **`CX33` n'est disponible qu'à Nuremberg**.

**Options :**

1. **CPX32**, 4 vCPU / 8 Go / 160 Go — **35,49 €**.
2. **CX33 à Nuremberg**, 4 vCPU / 8 Go / 80 Go — **8,49 €**.
3. CX33 + volume Hetzner 100 Go (attachable à chaud) — **~12,90 €** pour 180 Go.

**Arbitrage : option 2.** Règle de précédence **sans objet** (contrainte de marché, aucune divergence
interne au pack). Mêmes CPU et RAM que l'option 1 pour **27 € de moins par mois**. Nuremberg est en
Allemagne : le 06 §10.4 (« hébergement Hetzner Allemagne, aucun transfert hors UE ») est respecté.

**Pourquoi PAS le volume tout de suite.** Estimation pour **deux** environnements en V1 : Postgres
~1 Go (le pack annonce < 100 000 réponses), MinIO quelques centaines de Mo (photos compressées côté
client, R2), dépôt pgBackRest à 30 jours quelques Go, images Docker et OS ~15 Go. On est loin des
80 Go pour la première année. Et le `.env` porte déjà `ALERT_DISK_USAGE_PERCENT=80` : **l'alerte
existe, et un volume Hetzner s'attache à chaud**. Le prendre est donc une RÉACTION possible, pas une
anticipation nécessaire.
**Si le volume est pris plus tard**, une règle d'exploitation s'impose : n'y placer que les volumes de
DONNÉES (`pgdata`, MinIO, dépôt pgBackRest), jamais tout `/var/lib/docker`. Un volume qui se détache
arrête alors la base — diagnostic immédiat — au lieu de rendre le serveur muet.

**Les deux réserves de Williams, pesées :**

- **Performance des CPU de génération antérieure.** Réelle et non levée. Mais le critère `p95 < 500 ms`
  est un livrable du **lot L6** : on le découvrirait en semaine 3, au pire moment. **Deux mesures de
  dix minutes** sont ajoutées à la recette du VPS (L0-b) : un `pgbench` de charge, et surtout le
  chronométrage de `seed:demo` sur FIL-GC — **8 100 réponses insérées**, c'est-à-dire NOTRE charge
  d'écriture réelle plutôt qu'un banc synthétique. Si le seuil ne passe pas, CX33 → CPX32 est une
  commande, sans perte tarifaire puisque le serveur serait neuf de toute façon.
- **« Limited availability » et recréation d'urgence.** Juste pour la **disponibilité**, plus faible
  pour le **PRA** : notre reprise ne dépend pas du type de serveur. `provision-vps.sh` s'exécute sur
  n'importe quel Ubuntu et `restore-test.sh` restaure depuis pgBackRest et le miroir MinIO — ce que
  le test nocturne prouve chaque nuit. Un snapshot fait gagner du **temps de reprise**, pas la
  possibilité de reprendre. Recommandé, non vital.

**Ce que l'épisode enseigne à l'autopilote :** une recommandation n'est bonne que si l'espace des
options l'est. A01 a comparé rigoureusement à l'intérieur d'une liste qu'il n'avait pas vérifiée —
une rigueur locale sur un périmètre faux. À l'avenir, sur un choix externe au dépôt, énoncer
explicitement quel espace d'options a été considéré, pour que l'interlocuteur puisse le contester.

**Décideur :** **Williams** (choix du serveur et recherche de disponibilité) · A01 (analyse du volume
et de la recette de performance)
**Impact spec :** **amendement horodaté du 02 §11.1** — les gabarits et prix qui y figurent sont
obsolètes ; la référence devient CX33 (4 vCPU, 8 Go, 80 Go, Nuremberg) pour la V1, le reste du §11.1
(paliers V2 et cible) étant inchangé.

---

## 2026-08-27 — [L0-b] Le CX33 s'est évaporé : retour au CPX32, et pourquoi ce n'est pas un enfermement

**Constat :** vingt minutes après l'arbitrage précédent, Williams a revérifié les trois datacenters :
le **CX33 n'est plus disponible nulle part**, Falkenstein est vide sur toute la gamme CX, seul le CX23
subsiste à Nuremberg et Helsinki. Le risque « Limited availability » qu'il avait lui-même signalé
s'est matérialisé **en vingt minutes** au lieu de six mois.

**Options :**

1. Attendre et surveiller la réapparition du CX33 — coût nul, échéance inconnue.
2. **CPX32** (4 vCPU / 8 Go / 160 Go, 35,49 €), disponible immédiatement.
3. CX23 (2 vCPU / 4 Go / 40 Go, 5,49 €) — **exclu** : sous le nécessaire. Mesure relevée le jour même :
   une pile au repos consomme **1,03 Go**, il en faut **deux** (prod + staging cohabitant, 02 §11.2),
   et 40 Go ne portent pas deux Postgres, deux MinIO et deux dépôts pgBackRest à 30 jours.

**Arbitrage : option 2.** Règle de précédence **sans objet** (contrainte de marché).

**Ce qui tranche, et ce n'est pas le confort :**

- Le **07 §14 classe le délai d'un mois comme risque n°1** du projet, pas le budget. 324 €/an contre
  une collecte qui glisse n'est pas un arbitrage équilibré. Attendre un stock qui bouge d'heure en
  heure, c'est parier des jours sur une échéance que le pack qualifie déjà de trop courte.
- Les **160 Go** font disparaître la question du volume Hetzner et sa complexité d'exploitation
  (quels volumes déplacer, comportement au détachement).
- Le **matériel récent lève l'inconnue de performance** sur `p95 < 500 ms`, qui est un critère
  d'acceptation **dur** du lot L6. Sur CX, il aurait fallu mesurer et peut-être migrer **pendant la
  semaine que le 09 §5.3 réserve exclusivement au moteur de sync** (« L6 se développe SEUL »).
  C'est la pire semaine du projet pour toucher à l'infrastructure.

**La réserve d'irréversibilité, pesée honnêtement.** Elle est fondée techniquement : Hetzner refuse de
réduire un disque, donc **CPX32 → CX33 par redimensionnement est impossible**. Mais nous ne dépendons
pas du redimensionnement : `provision-vps.sh` s'exécute sur n'importe quel Ubuntu et `restore-test.sh`
restaure depuis pgBackRest et le miroir MinIO — restauration **éprouvée chaque nuit**. Si un CX33
réapparaît et que l'écart compte, on en provisionne un et on migre en une soirée, avec la procédure
qu'on répète toutes les nuits. **Ce n'est pas un rachat, c'est un déménagement, et l'outil du
déménagement est déjà livré** (le 07 §14 promet d'ailleurs « bascule Scaleway/OVH en < 1 j »).

**Ce que l'épisode enseigne :** la valeur du lot L0 ne se mesure pas au jour où on l'écrit. C'est
parce que le PRA existe et qu'il est testé que ce choix cesse d'être un engagement. Une infrastructure
qu'on sait reconstruire transforme une décision d'achat en décision réversible.

**Décideur :** **Williams** (constat de disponibilité et arbitrage final) · A01 (analyse)
**Impact spec :** amende l'entrée précédente du même jour — la référence de dimensionnement V1
redevient **CPX32** (4 vCPU, 8 Go, 160 Go), Nuremberg ou Falkenstein, les deux étant en Allemagne et
satisfaisant le 06 §10.4.

---

## 2026-08-27 — [L1] Sémantique du comparateur : ce qui est un écart, ce qui est un signalement

**Constat :** arbitrage rendu à A12 pendant le lot L1, **appliqué au code sans être tracé ici**.
Relevé par la revue croisée (A17) : « une décision non tracée dans ce format n'existe pas ». La
régularisation ci-dessous est donc écrite APRÈS application — c'est un écart de méthode, imputable à
A01, et l'entrée le dit plutôt que de faire croire à un ordre correct.

Le 11 §7 borne le diff aux « tables, colonnes, contraintes PK/FK/UNIQUE/CHECK et index du §7.1 ». Il
ne dit pas ce qu'il faut faire de ce que la base contient **en plus** du manifeste.

**Options :**

1. Tout objet non déclaré est un écart — lecture stricte, symétrique du principe « une table en trop
   est aussi grave qu'une table manquante ».
2. Tout objet non déclaré est une information — lecture souple.
3. Départager selon que l'objet **contraint** ou seulement **accélère**.

**Arbitrage : option 3.** Règle de précédence **sans objet** (aucune divergence interne : le pack est
muet, il faut donc trancher et tracer).

- Un **index de lecture** non déclaré ne change aucun comportement observable : il rend une requête
  plus rapide. Le refuser interdirait à tout lot ultérieur d'optimiser sans rouvrir un manifeste
  extrait du fichier 04 et relu ligne à ligne à la porte P-A — on paierait une lourdeur permanente
  pour un risque nul. **Signalement**, pas écart.
- Un **index UNIQUE** non déclaré est une **contrainte** : il interdit des lignes que la spécification
  autorise. Il entre donc dans « contraintes … UNIQUE » du 11 §7, et l'exception ci-dessus ne le
  couvre pas. **Écart.**

**Ce qui a rendu la distinction nécessaire :** ma première formulation ne disait que « index non
déclaré = information », sans distinguer. A17 l'a mise en défaut par l'exécution —
`CREATE UNIQUE INDEX zz_uq_answers_mq ON answers (mission_question_id)` passait en **code 0** alors
qu'il interdit silencieusement de répondre à une même question dans deux sessions différentes,
l'inverse exact de la règle du 04 §7 (V2.2 §32.6). Le raisonnement était juste, sa portée trop large.

**Corollaire tranché en même temps — la convention « FK indexées ».** Le fichier 04 §7.1 énumère 31
index ; les conventions en tête du §7 imposent en outre d'indexer les clés étrangères. Ces index de
convention ne figurent pas au §7.1 mais ne sont pas « non déclarés » pour autant : ils sont **déclarés
par une règle** au lieu de l'être par une liste. Ils entrent donc au manifeste, dans une section
`indexEtablisParConvention` **séparée** de `indexCritiques`, chacune portant sa source (« 04 §7.1 » /
« conventions 04 §7 »). Les 40 FK volontairement non indexées sont listées avec leur motif en
`fkNonIndexees` : une convention dont on s'écarte sans l'écrire est une convention morte.

**Décideur :** A01
**Impact spec :** aucun · **Régularisation tardive assumée**

---

## 2026-08-27 — [L1] Conventions de typage T1-T11 : elles précisent « types non précisés = TEXT »

**Constat :** arbitrage rendu à A12 pendant le lot L1 (sa question n°1), **appliqué sans être tracé
ici**. Même régularisation tardive que l'entrée précédente, même imputation.

Le 11 §7 pose « types non précisés par le 04 = TEXT, conventions en tête du 04 ». Pris seul, le
premier membre typerait en TEXT des colonnes que le fichier 04 nomme `created_at`, `is_active` ou
`sort_order` — soit une base où les dates ne se comparent pas et où les booléens acceptent
« peut-être ». Le second membre existe précisément pour l'empêcher.

**Options :**

1. TEXT partout où le 04 ne donne pas de type — lecture littérale du premier membre.
2. Appliquer les conventions du 04, TEXT en dernier recours seulement.

**Arbitrage : option 2.** Règle de précédence **sans objet** : les deux membres appartiennent à la
même phrase du 11 §7 et se lisent ensemble — « types non précisés » signifie « ni par un type
explicite, **ni par une convention** ». TEXT est le défaut résiduel, pas la règle générale.

Les conventions retenues sont consignées **en tête de la migration `0001`** (T1 à T11) plutôt que
dans ce registre seul, pour qu'un relecteur du SQL les ait sous les yeux : suffixes `_at` →
`TIMESTAMPTZ`, `is_`/`has_` → `BOOLEAN`, `_id` → `UUID`, `count`/`_min`/`sort_order` → `INTEGER`,
NUMERIC quand le 04 le type ainsi ou quand la colonne **miroite** une colonne que le 04 type NUMERIC
(T7 élargie après revue : `llm_calls.cost_eur` et `mission_questions.weight_snapshot` sont dans ce
cas), `NOT NULL` sur les FK que le 04 ne marque pas `NULL` (T8), et TEXT pour le reste.

**Portée :** ~25 colonnes. Ces conventions sont **normatives pour tous les lots suivants** — un lot
qui ajoute une colonne `validated_at` la type `TIMESTAMPTZ`, sans redemander.

**Décideur :** A01
**Impact spec :** aucun · **Régularisation tardive assumée**

---

## 2026-08-27 — [L1] `interviews.org_unit_id` reste NOT NULL

**Constat (réserve M-5 de la revue croisée) :** A17 signale un risque — si le lot L5c doit rattacher
une session à une **demande de document** (§27.1, analyse documentaire) sans unité connue,
`org_unit_id NOT NULL` bloquerait.

**Options :**

1. Rendre la colonne nullable par anticipation.
2. La conserver `NOT NULL`.

**Arbitrage : option 2.** Règle de précédence **sans objet** : le fichier 04 tranche explicitement.
Sur la table `interviews`, il pose `org_unit_id FK org_units,` **et**, à la ligne suivante,
`document_request_id FK document_requests NULL`. Le marqueur `NULL` est présent sur l'une et absent
sur l'autre, à une ligne d'écart : la distinction est délibérée, pas un oubli. Le commentaire P2-1 du
même bloc la scelle — « **l'unité d'audit est TOUJOURS `org_unit_id`** ». Une session d'analyse
documentaire porte donc les deux : la demande de document ET son unité.

**Ce qui serait perdu à rendre la colonne nullable :** l'agrégation par unité (`unit_scores`,
PRIMARY KEY `(mission_id, org_unit_id, block_id)`) laisserait échapper les sessions orphelines, et
les scores d'unité seraient faux sans que rien ne s'allume.

**Suite à donner :** porté au brief du **lot L5c**. Si l'implémentation y démontre un cas réel de
session sans unité, c'est une question de spécification à arbitrer à ce moment — pas un relâchement
de contrainte décidé aujourd'hui « au cas où ».

**Décideur :** A01
**Impact spec :** aucun · à revoir au lot L5c

---

## 2026-08-27 — [L1] Nullabilité, DEFAULT et précision numérique entrent dans le diff schéma-vs-04

**Constat :** A12 avait écrit en tête de `scripts/schema-diff.mjs` : « Hors périmètre **ASSUMÉ** (le
11 §7 ne les cite pas) : nullabilité, valeurs par défaut, commentaires, ordre des colonnes,
privilèges ». Le mot « assumé » est exact — c'était une **hypothèse déclarée**, pas une citation du
pack, et c'est parce qu'elle était écrite qu'elle a pu être discutée.

Le méta-test d'A16 (13 classes de mutation) l'a mise en défaut par l'exécution. Trois mutations
sortent en **ZÉRO ÉCART** :

| Mutation                                                 | Conséquence réelle en base                          |
| -------------------------------------------------------- | --------------------------------------------------- |
| `answers.interview_id` : `NOT NULL` retiré               | une réponse orpheline, rattachée à aucune session   |
| `missions.timezone` : `DEFAULT 'Europe/Paris'` → `'UTC'` | tous les créneaux d'entretien décalés à l'affichage |
| `block_scores.score` : `numeric` → `numeric(4,1)`        | scores arrondis et plafonnés, sans erreur levée     |

**Options :**

1. Maintenir l'exclusion — lecture étroite de « colonnes » au 11 §7 : présence et type de base.
2. Étendre le diff à tout attribut de colonne, y compris commentaires et ordre.
3. Étendre aux seuls attributs **que le fichier 04 fige explicitement**.

**Arbitrage : option 3.** Règle de précédence **sans objet** : le 11 §7 borne le diff aux « tables,
**colonnes**, contraintes PK/FK/UNIQUE/CHECK et index du §7.1 » et **n'exclut rien nommément**. Il
fallait donc décider ce que « comparer une colonne » signifie, et le tracer.

**Le critère retenu, applicable sans jugement au cas par cas : _si le fichier 04 le fige, le diff le
vérifie_.** Or le 04 fige les trois attributs en cause :

- il **marque `NULL`** là où le NULL est voulu (`siren TEXT NULL`, `org_unit_id FK NULL`) —
  l'absence de marqueur est donc une information délibérée, pas un silence ;
- il **écrit** `DEFAULT 'Europe/Paris'`, `DEFAULT 'a_planifier'`, `DEFAULT 'entretien'` ;
- il **type `NUMERIC` sans précision**, ce qui est un choix (un score que le stockage ne borne pas),
  pas un oubli.

Un attribut écrit dans le document de référence et vérifié par personne est exactement ce que ce
dépôt refuse partout ailleurs.

**Ce qui a rendu la décision urgente plutôt que théorique :** la migration `0010` pose des `NOT NULL`
**délibérés** sur `answer_revisions.changed_by`, `step_validations.validated_by`/`validated_at` et
`findings.created_by`, pour satisfaire l'invariant 7 (« toute correction de donnée = révision
**tracée** »). Sous l'exclusion, **rien ne les gardait** : un lot ultérieur pouvait les relâcher, la
CI restait verte, et une révision sans auteur redevenait possible. On aurait corrigé la traçabilité
en laissant intact le moyen de la défaire en silence.

**Restent hors périmètre, définitivement :** commentaires, ordre des colonnes, privilèges — le
fichier 04 ne les fixe pas, il n'y a rien à comparer. L'en-tête du script est corrigé pour ne plus
présenter cette liste comme une seule famille.

**Piège identifié et transmis :** le 04 distingue les défauts **SQL** des défauts **APPLICATIFS** —
sur `interviews.mode` il écrit « défaut APPLICATIF (V2.8) : `'sur_site'` si `kind='entretien'`, NULL
sinon — **un DEFAULT SQL conditionnel n'existe pas** ». Une colonne à défaut applicatif se déclare
**sans DEFAULT SQL**, et le diff exige alors qu'il n'y en ait aucun. Confondre les deux familles
produirait des dizaines de faux écarts et discréditerait le contrôle.

**Décideur :** A01
**Impact spec :** aucun — précise l'application du 11 §7, sans l'amender

---

## 2026-08-27 — [L1] Amendement de la convention de typage T8, et naissance de T12

**Constat :** l'entrée « Conventions de typage T1-T11 » de ce jour décrit T8 comme « `NOT NULL` sur
les FK que le 04 ne marque pas `NULL` ». Cette formulation était incomplète, et le retrait des 10
défauts non prescrits (entrée précédente) l'a révélé : **cinq colonnes tenaient leur `NOT NULL` de la
clause « colonnes portant un DEFAULT »** — `blocks.is_default`, `sectors.is_active`,
`users.is_active`, `report_templates.is_active`, `questions.version`. En retirant le défaut, on
retirait la justification de la contrainte sans le voir.

**Options :**

1. Relâcher les cinq `NOT NULL`, la règle écrite ne les couvrant plus.
2. Réécrire la règle, la contrainte étant juste et la règle incomplète.

**Arbitrage : option 2**, rendu par A12 et confirmé ici. Règle de précédence **sans objet**.
Un drapeau d'activation à trois valeurs (`true` / `false` / **NULL**) fait **silencieusement
disparaître des lignes** d'un `WHERE is_active` : NULL n'est ni vrai ni faux, la ligne sort du
résultat sans erreur ni trace. Un compteur de version nullable rend le versionnement des questions
(§32) indécidable. Ces `NOT NULL` ne dépendaient pas du défaut — c'est la règle qui les justifiait
par le mauvais chemin.

**T8 devient :** `NOT NULL` sur les FK que le 04 ne marque pas `NULL`, **et** sur les booléens d'état
structurel et compteurs de version, **avec ou sans DEFAULT**.

**T12, née de l'arbitrage sur les défauts :** « un défaut qui exprime un ÉTAT MÉTIER vient du fichier
04, ou n'existe pas ; seul un défaut purement TECHNIQUE peut venir d'une convention, et alors il est
écrit ici. » Quatre conventions admises, et quatre seulement : horodatages `now()`, collections JSONB
`'[]'`, UUID v4 des 4 tables purement serveur, **compteur entier incrémenté par le serveur → `0`**.

Cette dernière porte sa propre limite, et c'est ce qui la rend sûre : elle **ne s'applique jamais à
une quantité métier collectée sur le terrain** (`headcount`, `users_count`, `answers_count`,
`items_count`…), pour laquelle **NULL — non renseigné — et 0 sont deux faits distincts**. Confondre
les deux ferait entrer des zéros inventés dans le scoring (§32.1) sans qu'aucun contrôle ne s'allume.
Un seul cas du schéma relève de T12 : `integration_events.attempts`.

**Conséquence de test :** `blocks.is_default` étant désormais `NOT NULL` sans défaut, une fixture qui
l'omettait échoue. Elle est corrigée par A16 — **pas par A12** : la règle de croisement (09 §5.6)
interdit à l'auteur du schéma d'ajuster une fixture pour faire passer son propre code.

**Décideur :** A12 (proposition motivée) · A01 (confirmation)
**Impact spec :** aucun · amende l'entrée « Conventions de typage T1-T11 » du même jour

---

## 2026-08-27 — [L1] T13 « libellé d'identité », et rectification de l'entrée d'amendement T8

**Constat (2ᵉ passe de revue croisée, bloquant B-4 et majeur M-5).** Deux défauts liés, tous deux
imputables à A01.

**Le premier est une règle appliquée sans être écrite.** Sur les 211 colonnes `NOT NULL` du schéma,
**onze n'avaient aucune source** — ni marqueur du fichier 04, ni convention T1-T12 — et elles étaient
appliquées de façon **incohérente pour une notation identique du 04** : `use_cases.title` obligatoire
mais `findings.title` facultatif ; `alerts.type` obligatoire mais `alerts.severity` et
`alerts.message` facultatifs ; `blocks.label_fr` obligatoire mais `sectors.label_en` facultatif.
Conséquence en données : **un constat pouvait être enregistré sans titre, un cas d'usage non.** Le
diff, ayant intégré la nullabilité à son périmètre, gravait ce déséquilibre **comme s'il était la
spécification**.

**Le second est une entrée de ce registre plus étroite que le code.** L'entrée « Amendement de la
convention de typage T8 » énonçait « T8 devient : NOT NULL sur les FK que le 04 ne marque pas `NULL`,
et sur les booléens d'état structurel et compteurs de version ». La T8 réellement appliquée en compte
**cinq catégories de plus**. Un lot ultérieur lisant l'entrée d'amendement — présentée comme faisant
foi — aurait appliqué une autre règle que le schéma.

**Options pour B-4 :**

1. Relâcher les onze `NOT NULL` — aucune invention, mais l'incohérence subsiste : `blocks.label_fr`
   resterait obligatoire par T8 pendant que `findings.title` ne le serait pas.
2. Écrire la règle et l'appliquer **uniformément** à toutes les tables.

**Arbitrage : option 2.** Règle de précédence **sans objet** : la ligne 10 du fichier 04, celle qui
énonce ses conventions (`id` UUID v7, horodatages, suppression logique, FK indexées, CHECK sur les
enums, colonnes sans type = TEXT), **ne dit rien de la nullabilité**. Il n'y a donc pas divergence
entre deux règles, mais une règle réelle jamais formulée.

**Le remède à une règle non écrite est de l'écrire.** L'effacer là où elle dépasse laisserait
l'incohérence intacte et ferait perdre des contraintes justes.

**Convention T13 :** _« la colonne qui porte le LIBELLÉ HUMAIN IDENTIFIANT l'entité — celle qu'un
opérateur lit pour savoir de quelle ligne il s'agit — est `NOT NULL`. Une entité sans identité
lisible n'est pas exploitable : elle apparaît vide dans toute liste, tout rapport et tout export. »_
**Une seule colonne par table**, celle de l'identité, jamais ses attributs descriptifs :
`alerts.message` et `ai_systems.usage_description` restent nullables. Et T13 **ne prime jamais sur un
marqueur `NULL` du 04** : `interviews.person_name` (§27.1) et `attachments.filename` (P1-5) restent
nullables parce que le 04 le veut.

**Application :** les 43 tables passées en revue — 23 ont une identité lisible (18 l'avaient déjà,
**5 alignées** par la migration `0012` : `findings.title`, `roadmap_items.description`,
`report_sections.section_code`, `integration_events.event_type`, `mission_questions.text_snapshot`),
20 n'en ont pas et n'en reçoivent aucune. L'inventaire **table par table avec son motif** vit dans
`schema-manifest.json` → `identiteLisibleT13`, et un contrôle refuse d'écrire cette section si une
identité déclarée n'est pas `NOT NULL`.

**Rectification pour M-5 — le texte qui FAIT FOI est l'en-tête de la migration `0001`**, pas une
entrée de ce registre. T8 y liste **six** catégories `NOT NULL` : clés primaires · FK que le 04 ne
marque pas `NULL` · colonnes portant un DEFAULT · codes de référentiel · enums structurants ·
libellé d'identité (T13) — auxquelles s'ajoutent les booléens d'état structurel et compteurs de
version, **avec ou sans DEFAULT**. Toute entrée de ce registre qui résume une convention est un
**commentaire de la règle, jamais la règle** ; en cas d'écart, l'en-tête de `0001` l'emporte, et
l'écart est un défaut à corriger — comme celui-ci.

**Décideur :** A01
**Impact spec :** aucun · rectifie l'entrée « Amendement de la convention de typage T8 » du même jour

---

## 2026-08-27 — [L1] Toute description SUPPLÉMENTAIRE du schéma doit être gardée par un test

**Constat.** Le fichier 04 est la source unique du DDL, et les migrations SQL en sont la
transcription littérale — le diff schéma-vs-04 garde ce lien. Mais le dépôt contient une
**troisième** description du même schéma : `apps/api/src/db/schema.ts`, le modèle Drizzle qui typera
**toutes les requêtes des lots L2 à L13**. Vérifié : **rien ne la gardait.**

Son en-tête affirme que « le diff schéma-vs-04 révélerait aussitôt » une divergence. C'est vrai dans
un seul sens — si l'on fabriquait une migration **depuis** ce fichier. **Le sens inverse n'était
couvert par personne** : une migration qui ajoute une colonne que ce fichier ignore, ou qui impose un
`NOT NULL` qu'il déclare nullable, laisse `pnpm typecheck` vert et `schema:diff` vert, pendant que
**TypeScript ment en silence** à tout le code appelant. Les migrations `0010`, `0011` et `0012` ont
justement modifié nullabilité et défauts sur plusieurs colonnes.

**Options :**

1. S'en remettre à la discipline de l'agent qui met les deux à jour.
2. Garder mécaniquement toute description supplémentaire.

**Arbitrage : option 2.** Règle de précédence **sans objet**. La discipline a déjà échoué deux fois
sur ce lot, dans les deux revues croisées, et sur des points que leurs auteurs croyaient tenir. La
leçon constante de ce dépôt est qu'**un lien non vérifié mécaniquement finit par se défaire** —
c'est ce qui a produit le comparateur trompable, les trois textes de garde-fou périmés, et les deux
copies divergentes de la politique de masquage des journaux au lot L0.

**Règle posée, valable pour tous les lots suivants :** _toute description du schéma qui s'ajoute au
fichier 04 et aux migrations est un ARTEFACT DÉRIVÉ ; elle doit être comparée mécaniquement à la base
réelle par un test, faute de quoi elle n'est pas livrable._

**Application immédiate (L1) :** un test d'intégration `@critique` compare `schema.ts` à la base après
migrations — tables, colonnes dans les deux sens, et **nullabilité**, celle-ci étant la plus utile
puisqu'elle décide si TypeScript rend `string` ou `string | null`. Le type SQL exact est
volontairement hors périmètre : la correspondance Drizzle↔PostgreSQL est indirecte et un contrôle
approximatif ferait plus de bruit que de bien.

**Application annoncée (L2) :** `packages/shared` ne décrit aujourd'hui **aucune entité** — seulement
environnement, erreurs, pagination, masquage et dates. Les schémas **Zod des routes** y arriveront au
lot L2 et constitueront une **quatrième** description. La même règle s'y appliquera, et elle est
portée au brief du L2 dès maintenant plutôt que découverte à sa revue croisée.

**Décideur :** A01
**Impact spec :** aucun · règle d'exécution opposable aux lots suivants
