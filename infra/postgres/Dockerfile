# =============================================================================
# infra/postgres/Dockerfile — PostgreSQL 16 + pgBackRest (lot L0)
# Applique : 11 §1 (PostgreSQL 16, version épinglée), 02 §11.4 (WAL archiving +
# pgBackRest, test de restauration nocturne), 07 ligne L0 (critère « restauration
# Postgres et MinIO testée depuis zéro »).
# Raison d'être : `archive_command` doit pouvoir exécuter `pgbackrest` DANS le
# conteneur qui fait tourner le serveur — l'image officielle ne l'embarque pas.
# =============================================================================
#
# ┌───────────────────────────────────────────────────────────────────────────┐
# │ UN SEUL CONTEXTE DE CONSTRUCTION — `infra/` — POUR LES QUATRE PILES.      │
# │                                                                           │
# │ CE N'EST PLUS VRAI DEPUIS LE 2026-08-28 (correctif A73) : « les trois     │
# │ autres piles ne peuvent pas suivre ». Elles suivent. Leur `context:` est  │
# │ passé de `infra/postgres/` à `infra/`, et les deux scripts d'exploitation │
# │ sont remontés dans l'étape `socle`, où les QUATRE piles les reçoivent.    │
# │ C'est la voie que l'ancienne version de cet encadré désignait elle-même : │
# │ « leur donner le même contexte `infra/`, PAS de dupliquer les scripts ».  │
# │                                                                           │
# │ DEUX CIBLES SUBSISTENT, ET ELLES NE PORTENT PLUS QUE LA CONFIGURATION :   │
# │                                                                           │
# │  1. PILES LANCÉES À LA MAIN — docker-compose.yml, .staging.yml, .prod.yml │
# │     contexte `infra/` · AUCUN `target:` → étape PAR DÉFAUT                │
# │     (la dernière, `config-montee`). Ces piles MONTENT leurs fichiers de   │
# │     configuration depuis le dépôt ; l'image n'en embarque aucun.          │
# │     Elles reçoivent en revanche `axion-stanza-create` et                  │
# │     `axion-healthcheck` — sans quoi elles gardent la panne du             │
# │     2026-08-28 (voir plus bas).                                           │
# │                                                                           │
# │  2. PILE COOLIFY — docker-compose.coolify.yml                             │
# │     contexte `infra/` · `target: config-embarquee`                        │
# │     Coolify NE PEUT PAS monter de fichier depuis le dépôt (voir l'encadré │
# │     « CONFIGURATION EMBARQUÉE » de ce compose) : la configuration doit    │
# │     donc voyager DANS l'image. Cette cible ajoute aussi `mc`, le magasin  │
# │     de certificats et les deux scripts de SAUVEGARDE — seule cette pile   │
# │     porte le service `sauvegarde` (voir la note de non-propagation).      │
# │                                                                           │
# │ POURQUOI LE CONTEXTE EST `infra/` ET NON `infra/postgres/`.               │
# │ `postgresql.custom.conf` et les scripts sont dans `infra/postgres/`, mais │
# │ `pgbackrest.conf` vit dans `infra/pgbackrest/` — HORS de ce dossier. Un   │
# │ seul contexte peut couvrir les deux : `infra/`. Tous les `COPY` de ce     │
# │ fichier sont donc préfixés par `postgres/` ou `pgbackrest/`.              │
# │                                                                           │
# │ ⚠️ CE QUE CE DÉCOUPAGE SUPPOSE — MESURÉ, PAS SUPPOSÉ (2026-08-28).        │
# │ L'étape `config-embarquee` reste ÉLAGUÉE quand on construit la cible par  │
# │ défaut. Vérifié dans les deux sens sur ce poste (Docker 29.7.2,           │
# │ buildx 0.36.1) :                                                          │
# │     BuildKit (défaut de Compose v2)  → étape non ciblée ÉLAGUÉE, build OK │
# │     DOCKER_BUILDKIT=0 (builder legacy) → toutes les étapes évaluées       │
# │ Depuis que le contexte est commun, plus aucun `COPY` ne vise un chemin    │
# │ absent : le builder legacy CONSTRUIT désormais ce fichier. Ce n'est pas   │
# │ une garantie qu'on entretient — Compose v2 n'utilise pas ce builder —     │
# │ mais ce n'est plus une panne connue.                                      │
# └───────────────────────────────────────────────────────────────────────────┘

FROM postgres:16-bookworm AS socle

# pgBackRest vient du dépôt PGDG déjà configuré par l'image officielle.
# Aucune montée majeure sans décision humaine (11 §1) : version relevée à la main.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends pgbackrest; \
    rm -rf /var/lib/apt/lists/*

# Arborescence pgBackRest (le dépôt lui-même est un volume nommé, monté au run).
RUN set -eux; \
    mkdir -p /var/lib/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest /etc/pgbackrest; \
    chown -R postgres:postgres /var/lib/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest; \
    chmod 750 /var/lib/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest

# -----------------------------------------------------------------------------
# ⚠️ LES DEUX SCRIPTS DU CYCLE DE VIE DU CLUSTER — DANS `socle`, DONC DANS LES
# QUATRE PILES. C'EST LE CORRECTIF, ET IL SE JOUE ICI.
#
# CE QUI ÉTAIT FAUX AVANT (mesuré le 2026-08-28 sur conteneur jetable, pile de
# DÉVELOPPEMENT, image `axion-audit-postgres:16`, 90 secondes d'exécution) :
#     docker ps  →  Up About a minute (HEALTHY)   ·   RestartCount = 0
#     journal    →  16 × « archive command failed with exit code 103 »
#                   16 × « server process (PID …) exited with exit code 103 »
#                   10 × « all server processes terminated; reinitializing »
# C'est la panne du staging, à l'identique, sur le poste de chaque développeur.
# La cause est présente PARTOUT : `postgresql.custom.conf` (monté par les piles à
# la main, embarqué pour Coolify) active `archive_command = pgbackrest
# archive-push %p` dans les QUATRE piles, alors que seule la pile Coolify portait
# le job `createstanza` qui rend cette commande exécutable. Trois cibles avaient
# donc la CAUSE sans le job qui la répare NI la sonde qui la voit.
#
#   stanza-create.sh  exécuté UNE FOIS par le job `createstanza` du compose,
#                     avant que l'API et le worker n'aient le droit de démarrer.
#   healthcheck.sh    sonde de santé du conteneur PostgreSQL — elle REMPLACE
#                     `pg_isready`, qui déclarait `healthy` un cluster en train de
#                     se réinitialiser 275 fois en 46 minutes (2026-08-28), et qui
#                     vient de le refaire sur la pile de dev (ci-dessus).
#
# POURQUOI ILS PEUVENT VIVRE DANS `socle` DEPUIS CE CORRECTIF : les quatre piles
# construisent maintenant avec le MÊME contexte `infra/`, donc `postgres/*.sh`
# est un chemin valide pour toutes. Ils ne dépendent d'aucun fichier de
# configuration embarqué — ils lisent leur configuration dans l'ENVIRONNEMENT
# (`PGBACKREST_*`) et dans `/etc/pgbackrest/pgbackrest.conf`, que la pile
# concernée MONTE ou EMBARQUE selon sa convention.
#
# `sh -n` : contrôle de SYNTAXE à la construction. Il ne prouve pas que les
# scripts font ce qu'ils annoncent — seule l'exécution le prouve, et elle est
# faite sur base jetable — mais il empêche une faute de frappe de n'apparaître
# qu'au démarrage du conteneur, là où elle ressemble à une panne de la base.
#
# `chmod` explicite — le bit +x d'un fichier versionné sous Windows ne survit pas
# au clone (core.filemode=false).
# -----------------------------------------------------------------------------
COPY postgres/stanza-create.sh /usr/local/bin/axion-stanza-create
COPY postgres/healthcheck.sh /usr/local/bin/axion-healthcheck

RUN set -eux; \
    chmod 0755 /usr/local/bin/axion-stanza-create /usr/local/bin/axion-healthcheck; \
    sh -n /usr/local/bin/axion-stanza-create; \
    sh -n /usr/local/bin/axion-healthcheck

# -----------------------------------------------------------------------------
# Cible `config-embarquee` — POUR LA PILE COOLIFY UNIQUEMENT.
# CONTEXTE DE CONSTRUCTION ATTENDU : `infra/` (et NON `infra/postgres/`).
#
# Les deux fichiers sont copiés depuis le dépôt à la CONSTRUCTION, parce qu'ils
# ne peuvent pas être montés à l'EXÉCUTION. Conséquence d'exploitation à
# connaître avant d'en avoir besoin en urgence : MODIFIER L'UN DE CES DEUX
# FICHIERS N'A AUCUN EFFET TANT QUE L'IMAGE N'EST PAS RECONSTRUITE. Il n'y a
# plus de « corriger le fichier et redémarrer le conteneur ».
# -----------------------------------------------------------------------------
FROM socle AS config-embarquee

# Configuration serveur — désignée par `-c config_file=…` dans le compose.
# Elle REMPLACE le postgresql.conf d'initdb : elle doit rester auto-suffisante.
COPY postgres/postgresql.custom.conf /etc/postgresql/postgresql.custom.conf

# Configuration pgBackRest. Sans elle, `archive_command` échoue et les WAL
# s'accumulent dans pg_wal SANS qu'aucune sauvegarde ne soit restaurable — la
# panne silencieuse décrite dans l'en-tête de pgbackrest.conf lui-même.
COPY pgbackrest/pgbackrest.conf /etc/pgbackrest/pgbackrest.conf

# Lisibles par le serveur, non modifiables par lui.
RUN set -eux; \
    chmod 0644 /etc/postgresql/postgresql.custom.conf /etc/pgbackrest/pgbackrest.conf

# -----------------------------------------------------------------------------
# LES DEUX SCRIPTS DE LA SAUVEGARDE — ILS RESTENT DANS CETTE CIBLE, ET C'EST UNE
# DÉCISION, PAS UN RESTE.
#
# `axion-stanza-create` et `axion-healthcheck` sont remontés dans `socle` : ils
# décrivent le CYCLE DE VIE DU CLUSTER, que les quatre piles partagent. Les deux
# scripts ci-dessous décrivent le SERVICE `sauvegarde`, que SEULE la pile Coolify
# porte, et ils ne fonctionnent pas sans ce que cette cible ajoute plus bas —
# `mc` et le magasin de certificats.
#
#   sauvegarde.sh     service PLANIFIÉ du compose : `pgbackrest backup` + archive
#                     chiffrée du volume MinIO + expédition vers R2. Sans lui, la
#                     pile n'avait qu'une stanza et des WAL — c'est-à-dire rien de
#                     restaurable (mesuré le 2026-08-28 : `status: error (no valid
#                     backups)`).
#   sauvegarde-healthcheck.sh
#                     sonde de santé du SERVICE `sauvegarde` — à ne pas
#                     confondre avec `healthcheck.sh`, qui sonde la BASE. Elle
#                     comble le défaut relevé le 2026-08-28 : `docker ps`
#                     affichait `sauvegarde-… Up 26 minutes`, SANS parenthèse de
#                     santé, c'est-à-dire « le PID 1 n'est pas mort » et rien de
#                     plus — alors que le service passe 23 h sur 24 à dormir.
#
# ⚠️ POURQUOI ILS NE SONT PAS PROPAGÉS AUX TROIS AUTRES PILES, ALORS QUE LE
# CONTEXTE COMMUN LE PERMETTRAIT MAINTENANT TECHNIQUEMENT :
#   · `docker-compose.yml` (DÉVELOPPEMENT) — une sauvegarde quotidienne d'une
#     base de démonstration vers un stockage distant payant n'a aucune valeur, et
#     `sauvegarde.sh` REFUSE de démarrer sans les quatre `BACKUP_R2_*` (c'est
#     voulu : voir ses contrôles d'entrée). Le service tomberait donc en boucle de
#     redémarrage sur le poste de CHAQUE développeur. Embarquer un exécutable qui
#     ne peut pas s'exécuter est exactement le genre de demi-mesure que ce lot
#     démonte.
#   · `.staging.yml` / `.prod.yml` — le chemin « VPS dédié » est marqué JAMAIS
#     JOUÉ dans infra/README.md §7. Livrer un service de sauvegarde non éprouvé
#     dans une pile que personne n'exécute produirait une ligne verte dans une
#     revue et zéro sauvegarde réelle.
#
# ⚠️ CE QUE CET ENCADRÉ LAISSAIT CROIRE, ET QUI ÉTAIT FAUX (corrigé 2026-08-28).
# Il concluait : « la pile de production VPS dédié n'a aujourd'hui AUCUN SERVICE
# DE SAUVEGARDE » — vrai du COMPOSE, et lu par tout le monde comme « cette
# production n'est pas sauvegardée ». Elle l'est : sur un VPS dédié on a l'HÔTE,
# donc `cron`, et `infra/scripts/install-cron.sh` y pose QUATRE tâches —
# `pgbackrest backup` toutes les 6 h AVEC copie vers la Storage Box, archive
# MinIO quotidienne, magasin TLS, et un TEST DE RESTAURATION NOCTURNE que le
# chemin Coolify n'a même pas. Le side-car existe ici PARCE QUE Coolify ne donne
# pas accès à l'hôte, pas parce qu'un service vaudrait mieux qu'un `cron`.
# Ce qui manque VRAIMENT à ce chemin est ailleurs, et c'est écrit là où on le
# cherchera : pas de coffre des secrets, et rien qui détecte le SILENCE de la
# chaîne (infra/README.md §7.4, points A et B ; encadré équivalent de
# `infra/docker-compose.prod.yml`). Deux fiches d'amélioration à arbitrer
# (09 §5.9, étage 2), pas des lignes de code à écrire au jugé.
COPY postgres/sauvegarde.sh /usr/local/bin/axion-sauvegarde
COPY postgres/sauvegarde-healthcheck.sh /usr/local/bin/axion-sauvegarde-healthcheck

# -----------------------------------------------------------------------------
# `mc` — LE CLIENT S3 DE L'EXPÉDITION HORS SERVEUR, ET CE N'EST PAS UNE
# DÉPENDANCE NOUVELLE.
#
# CE QUI A ÉTÉ RELEVÉ DANS CETTE IMAGE AVANT DE CHOISIR (2026-08-28, `docker exec`
# sur le service `sauvegarde` en vie) :
#     base réelle : postgres:16-BOOKWORM — Debian 12, PAS une Alpine
#     présents    : openssl 3.0.20 · gpg · zstd · tar · sha256sum · pgbackrest 2.59.1
#     ABSENTS     : curl · wget · python/python3 · jq · rclone · aws · s3cmd
# L'IMAGE N'A AUCUN CLIENT HTTP. Sans client HTTP, il n'y a pas d'expédition —
# et pgBackRest 2.59.1, lui, expose `repo-get`/`repo-ls` mais NI `repo-put` NI
# `repo-rm` : il sait lire un dépôt distant, pas y écrire un fichier quelconque.
# Le raisonnement complet, y compris pourquoi `repo2` natif et `aws-cli` installé
# au vol ont été écartés, est en tête de `sauvegarde.sh`.
#
# POURQUOI CETTE FORME-LÀ. `minio/mc` AU TAG CI-DESSOUS EST DÉJÀ UNE IMAGE DE LA
# PILE : le service `createbuckets` de `docker-compose.coolify.yml` l'utilise, au
# MÊME tag, écrit dans le même dépôt. On ne fige donc pas une version de plus, on
# réemploie celle qui est déjà figée. `mc` est un binaire Go STATIQUE (30 Mo,
# aucune bibliothèque partagée) : il fonctionne tel quel sur Debian.
#
# CE QU'ON ÉVITE EN LE COPIANT AU BUILD PLUTÔT QU'EN L'INSTALLANT AU RUN : une
# chaîne de sauvegarde qui, à 02h30, aurait besoin qu'un dépôt de paquets réponde
# pour pouvoir sortir la copie de la machine. Une dépendance réseau au moment
# précis où l'on sauvegarde est une dépendance qui tombera pour cette raison-là.
#
# CE QUE ÇA COÛTE : +30 Mo sur cette image, et une reconstruction qui exige que
# `minio/mc` soit tirable au tag épinglé.
#
# ⚠️ SI CE TAG CHANGE DANS LE COMPOSE, IL CHANGE ICI — deux endroits, aucune
# vérification automatique aujourd'hui. C'est la même dette que la duplication
# assumée entre les composes (voir leur en-tête).
COPY --from=minio/mc:RELEASE.2025-04-16T18-13-26Z /usr/bin/mc /usr/local/bin/mc

# -----------------------------------------------------------------------------
# ⚠️ LE MAGASIN DE CERTIFICATS — MESURÉ, ET IL MANQUAIT.
#
# `postgres:16-bookworm` N'EMBARQUE AUCUNE AUTORITÉ DE CERTIFICATION. Relevé le
# 2026-08-28 sur l'image de la pile :
#     /etc/ssl/certs/  →  ssl-cert-snakeoil.pem  ET RIEN D'AUTRE
#     dpkg -l | grep ca-certificates  →  aucune ligne
#     /usr/share/ca-certificates      →  n'existe pas
# Conséquence, si on ne corrige rien : `mc` (Go utilise le magasin du système sur
# Linux) refuserait le certificat de Cloudflare R2, TOUTES les nuits, avec une
# erreur TLS qui ne nomme pas la cause. La chaîne aurait été branchée et
# n'aurait jamais rien expédié. Ce défaut a été attrapé par le `test -s`
# ci-dessous — au BUILD, pas la première nuit. C'est exactement pour cela que la
# vérification est écrite ici.
#
# CE QUE CETTE LIGNE EST, ET CE QU'ELLE N'EST PAS. `ca-certificates` est le
# MAGASIN DE CONFIANCE du système d'exploitation, pas une dépendance du projet :
# elle n'entre pas dans la liste 11 §1, au même titre que les bibliothèques que
# `pgbackrest` tire déjà de PGDG à l'étape `socle`. Aucun outil nouveau, aucune
# version applicative à suivre. Sans elle, AUCUN client TLS ne peut fonctionner
# dans cette image — le choix n'est pas « avec ou sans », c'est « HTTPS ou rien ».
# Elle est posée dans `config-embarquee` et NON dans `socle` : seules les piles
# Coolify expédient hors serveur ; les trois autres restent inchangées.
#
# Le magasin est FIGÉ À LA CONSTRUCTION. Une autorité révoquée après le build
# reste dans l'image jusqu'à la reconstruction suivante — c'est vrai de toutes
# les images, il faut le savoir plutôt que le supposer.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates; \
    rm -rf /var/lib/apt/lists/*

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ `openssh-client` ET `rsync` — LA TROISIÈME COPIE (D-1, 2026-08-28).       │
# │                                                                           │
# │ POURQUOI IL A FALLU AJOUTER DEUX PAQUETS PLUTÔT QUE RÉUTILISER `mc`.      │
# │ Le 02 §11.4 nomme une Hetzner Storage Box comme copie « site distinct ».  │
# │ Une Storage Box parle SFTP, SSH, rsync, BorgBackup et WebDAV — elle NE    │
# │ PARLE PAS S3. `mc`, seul client de transfert de cette image, ne parle QUE │
# │ S3. Les deux ne se comprennent donc pas, et aucune configuration ne les   │
# │ réconcilie : il faut un client SSH.                                       │
# │                                                                           │
# │ MESURÉ AVANT DE DÉCIDER (2026-08-28, `docker exec` sur le service vif) :  │
# │   présents : mc · gpg · zstd · openssl                                    │
# │   ABSENTS  : ssh · scp · sftp · rsync · borg                              │
# │ Ce relevé est la raison de ces deux lignes. Sans lui, une demi-journée    │
# │ aurait été dépensée à écrire une expédition que l'image ne pouvait pas    │
# │ exécuter.                                                                 │
# │                                                                           │
# │ POURQUOI `rsync` ET PAS `scp` SEUL : la copie doit être INCRÉMENTALE et   │
# │ propager les suppressions (`--delete`), sinon la rétention distante       │
# │ diverge de la locale et la Storage Box se remplit sans fin. C'est la même │
# │ propriété que le `--remove` du miroir `mc`.                               │
# │                                                                           │
# │ ARBITRAGE : ajouter un outil est une escalade (11 §8-1). Tracé dans       │
# │ `DECISIONS.md` (2026-08-28, D-1), décidé par Williams. Ce sont des        │
# │ paquets Debian de l'image, pas des dépendances applicatives de la liste   │
# │ épinglée du 11 §1 — la distinction est écrite dans la décision.           │
# └───────────────────────────────────────────────────────────────────────────┘
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends openssh-client rsync; \
    rm -rf /var/lib/apt/lists/*

# Contrôles à la CONSTRUCTION : les binaires s'exécutent, et le magasin existe.
# `ssh -V` écrit sur la SORTIE D'ERREUR, y compris quand tout va bien : sans la
# redirection, cette ligne ferait croire à un échec dans un journal de build lu
# en diagonale.
RUN set -eux; \
    chmod 0755 /usr/local/bin/mc; \
    mc --version; \
    ssh -V 2>&1; \
    rsync --version | head -1; \
    test -s /etc/ssl/certs/ca-certificates.crt

# POINT DE MONTAGE DES ARCHIVES — ET C'EST LE `chown` QUI COMPTE, PAS LE `mkdir`.
# Docker initialise un volume nommé VIDE à partir du répertoire que l'image
# porte au point de montage : propriétaire et permissions COMPRIS. Sans cette
# ligne, `axion-coolify-sauvegarde-archives` naîtrait en `root:root`, et le
# service `sauvegarde` — qui tourne en `postgres`, comme `archive-push` — ne
# pourrait rien y écrire. MESURÉ le 2026-08-28 sur volume jetable :
#   gpg: can't create '/sauvegarde/minio-….tar.zst.gpg.partiel': Permission denied
# C'est exactement le mécanisme qui fait déjà fonctionner /var/lib/pgbackrest
# (étape `socle`). Cette ligne vit ici et non dans `socle` : seule la pile
# Coolify porte le service `sauvegarde`, les trois autres n'ont rien à monter là.
RUN set -eux; \
    mkdir -p /sauvegarde; \
    chown postgres:postgres /sauvegarde; \
    chmod 700 /sauvegarde

# Exécutables par tous, modifiables par personne : le service tourne sous
# `postgres` et la sonde sous l'utilisateur du conteneur. `chmod` explicite — le
# bit +x d'un fichier versionné sous Windows ne survit pas au clone
# (core.filemode=false).
#
# `axion-sauvegarde` est contrôlé par `bash -n` et NON `sh -n` : c'est un script
# bash assumé. `set -o pipefail` n'existe pas en POSIX, et sans lui un `tar` qui
# échoue en tête de `tar | zstd | gpg` laisse `gpg` produire une archive
# parfaitement valide d'un contenu TRONQUÉ, en sortant 0. Le raisonnement complet
# est en tête de sauvegarde.sh.
#
# `axion-sauvegarde-healthcheck` est contrôlé par `sh -n` : elle ne lit que des
# fichiers et ne compare que des entiers et des empreintes — aucun tube à
# protéger, donc aucune raison d'exiger `bash`. Une sonde doit être la chose la
# plus simple du conteneur.
RUN set -eux; \
    chmod 0755 /usr/local/bin/axion-sauvegarde /usr/local/bin/axion-sauvegarde-healthcheck; \
    sh -n /usr/local/bin/axion-sauvegarde-healthcheck; \
    bash -n /usr/local/bin/axion-sauvegarde

# -----------------------------------------------------------------------------
# Cible PAR DÉFAUT (la dernière) — image sans configuration embarquée.
# C'est elle que construisent docker-compose.yml, .staging.yml et .prod.yml,
# avec le contexte `infra/` (commun aux quatre piles depuis le 2026-08-28) et
# sans `target:`. Ces piles montent `postgresql.custom.conf` et `pgbackrest.conf`
# depuis le dépôt : embarquer une copie ici créerait une SECONDE source de
# vérité, masquée par le montage et donc invisible — exactement le défaut que
# pgbackrest.conf interdit chez lui.
#
# ELLE N'EST PLUS « NUE » : elle hérite de `socle` les deux scripts du cycle de
# vie du cluster (`axion-stanza-create`, `axion-healthcheck`). C'est tout l'objet
# du correctif — ces trois piles avaient la CAUSE de la boucle de
# réinitialisation (`archive_command` actif) sans le job qui la répare ni la
# sonde qui la voit.
#
# Elle doit rester la DERNIÈRE étape du fichier : c'est ce qui fait d'elle la
# cible par défaut, et donc ce qui permet à BuildKit d'élaguer `config-embarquee`
# et ses `COPY` hors contexte.
# -----------------------------------------------------------------------------
FROM socle AS config-montee

# La commande par défaut reste celle de l'image officielle (entrypoint inchangé) ;
# le fichier de configuration est imposé par le compose de chaque pile.
