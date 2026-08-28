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
# │ CE FICHIER SERT DEUX CONVENTIONS DE CONSTRUCTION. NE PAS LES FUSIONNER.   │
# │                                                                           │
# │  1. PILES LANCÉES À LA MAIN — docker-compose.yml, .staging.yml, .prod.yml │
# │     contexte `infra/postgres/` · AUCUN `target:` → étape PAR DÉFAUT       │
# │     (la dernière, `config-montee`). Ces piles MONTENT leurs fichiers de   │
# │     configuration depuis le dépôt ; l'image n'en embarque aucun.          │
# │                                                                           │
# │  2. PILE COOLIFY — docker-compose.coolify.yml                             │
# │     contexte `infra/` · `target: config-embarquee`                        │
# │     Coolify NE PEUT PAS monter de fichier depuis le dépôt (voir l'encadré │
# │     « CONFIGURATION EMBARQUÉE » de ce compose) : la configuration doit    │
# │     donc voyager DANS l'image.                                            │
# │                                                                           │
# │ POURQUOI DEUX CONTEXTES. `postgresql.custom.conf` est ici, mais           │
# │ `pgbackrest.conf` vit dans `infra/pgbackrest/` — HORS du contexte         │
# │ `infra/postgres/`. Embarquer les deux impose donc de remonter le contexte │
# │ à `infra/`. Les trois autres piles ne peuvent pas suivre : leur `context:` │
# │ est écrit dans des fichiers que ce lot n'a pas le droit de modifier.      │
# │                                                                           │
# │ ⚠️ CE QUE CE DÉCOUPAGE SUPPOSE — MESURÉ, PAS SUPPOSÉ (2026-08-28).        │
# │ L'étape `config-embarquee` copie des chemins qui N'EXISTENT PAS dans le   │
# │ contexte `infra/postgres/`. Les piles à la main ne cassent donc que parce  │
# │ que BUILDKIT N'ÉVALUE QUE LES ÉTAPES DONT LA CIBLE DÉPEND. Vérifié dans   │
# │ les deux sens sur ce poste (Docker 29.7.2, buildx 0.36.1) :               │
# │     BuildKit (défaut de Compose v2)  → étape non ciblée ÉLAGUÉE, build OK │
# │     DOCKER_BUILDKIT=0 (builder legacy) → « COPY failed: … does not exist » │
# │ Autrement dit : construire ce fichier avec le builder legacy ÉCHOUE. Ce   │
# │ builder est déprécié et Compose v2 ne l'utilise pas ; si un jour il       │
# │ fallait le supporter, il faudrait deux Dockerfiles, pas deux étapes.      │
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
# DEUX SCRIPTS D'EXPLOITATION — ils voyagent DANS L'IMAGE pour la même raison que
# les deux fichiers de configuration ci-dessus : Coolify ne monte RIEN depuis le
# dépôt (encadré « CONFIGURATION EMBARQUÉE » du compose). Un `command:` inline
# dans le compose aurait fait l'affaire pour le premier — c'est la forme retenue
# par `createbuckets` — mais pas pour le second : un `healthcheck.test` inline
# tenant une requête SQL de vingt lignes serait illisible, et la façon dont
# Compose échappe `$` y transformerait la moindre correction en piège.
#
#   stanza-create.sh  exécuté UNE FOIS par le job `pgbackrest-stanza` du compose,
#                     avant que l'API et le worker n'aient le droit de démarrer.
#   healthcheck.sh    sonde de santé du conteneur PostgreSQL — elle REMPLACE
#                     `pg_isready`, qui déclarait `healthy` un cluster en train de
#                     se réinitialiser 275 fois en 46 minutes (2026-08-28).
#   sauvegarde.sh     service PLANIFIÉ du compose : `pgbackrest backup` + archive
#                     chiffrée du volume MinIO. Sans lui, la pile n'avait qu'une
#                     stanza et des WAL — c'est-à-dire rien de restaurable
#                     (mesuré le 2026-08-28 : `status: error (no valid backups)`).
#
# ILS NE SONT PAS DANS L'ÉTAPE `socle` — ET CE N'EST PAS UN CHOIX DE CONFORT.
# `socle` est construite avec DEUX contextes différents selon la pile (`infra/`
# ici, `infra/postgres/` pour les piles lancées à la main, voir l'encadré du
# haut). Aucun chemin de `COPY` n'est valide dans les deux à la fois. Conséquence
# à connaître : les piles `docker-compose.yml`, `.staging.yml` et `.prod.yml`
# N'ONT PAS ces scripts et gardent donc leur `stanza-create` manuel et leur
# `pg_isready` menteur. Leurs composes ne relèvent pas de ce correctif ; le jour
# où ils devront en bénéficier, la voie est de leur donner le même contexte
# `infra/`, PAS de dupliquer les scripts.
COPY postgres/stanza-create.sh /usr/local/bin/axion-stanza-create
COPY postgres/healthcheck.sh /usr/local/bin/axion-healthcheck
COPY postgres/sauvegarde.sh /usr/local/bin/axion-sauvegarde

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

# Contrôles à la CONSTRUCTION : le binaire s'exécute, et le magasin existe.
RUN set -eux; \
    chmod 0755 /usr/local/bin/mc; \
    mc --version; \
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

# Exécutables par tous, modifiables par personne : le job tourne sous `postgres`
# et la sonde sous l'utilisateur du conteneur. `chmod` explicite — le bit +x d'un
# fichier versionné sous Windows ne survit pas au clone (core.filemode=false).
#
# `sh -n` : contrôle de SYNTAXE à la construction. Il ne prouve pas que les
# scripts font ce qu'ils annoncent — seule l'exécution le prouve, et elle est
# faite sur base jetable — mais il empêche une faute de frappe de n'apparaître
# qu'au démarrage du conteneur, là où elle ressemble à une panne de la base.
#
# `axion-sauvegarde` est contrôlé par `bash -n` et NON `sh -n` : c'est un script
# bash assumé. `set -o pipefail` n'existe pas en POSIX, et sans lui un `tar` qui
# échoue en tête de `tar | zstd | gpg` laisse `gpg` produire une archive
# parfaitement valide d'un contenu TRONQUÉ, en sortant 0. Le raisonnement complet
# est en tête de sauvegarde.sh.
RUN set -eux; \
    chmod 0755 /usr/local/bin/axion-stanza-create /usr/local/bin/axion-healthcheck \
               /usr/local/bin/axion-sauvegarde; \
    sh -n /usr/local/bin/axion-stanza-create; \
    sh -n /usr/local/bin/axion-healthcheck; \
    bash -n /usr/local/bin/axion-sauvegarde

# -----------------------------------------------------------------------------
# Cible PAR DÉFAUT (la dernière) — image NUE, sans configuration embarquée.
# C'est elle que construisent docker-compose.yml, .staging.yml et .prod.yml,
# avec le contexte `infra/postgres/` et sans `target:`. Ces piles montent
# `postgresql.custom.conf` et `pgbackrest.conf` depuis le dépôt : embarquer une
# copie ici créerait une SECONDE source de vérité, masquée par le montage et
# donc invisible — exactement le défaut que pgbackrest.conf interdit chez lui.
#
# Elle doit rester la DERNIÈRE étape du fichier : c'est ce qui fait d'elle la
# cible par défaut, et donc ce qui permet à BuildKit d'élaguer `config-embarquee`
# et ses `COPY` hors contexte.
# -----------------------------------------------------------------------------
FROM socle AS config-montee

# La commande par défaut reste celle de l'image officielle (entrypoint inchangé) ;
# le fichier de configuration est imposé par le compose de chaque pile.
