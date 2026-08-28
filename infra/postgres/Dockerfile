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
