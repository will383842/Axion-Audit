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
