# =============================================================================
# infra/postgres/Dockerfile — PostgreSQL 16 + pgBackRest (lot L0)
# Applique : 11 §1 (PostgreSQL 16, version épinglée), 02 §11.4 (WAL archiving +
# pgBackRest, test de restauration nocturne), 07 ligne L0 (critère « restauration
# Postgres et MinIO testée depuis zéro »).
# Raison d'être : `archive_command` doit pouvoir exécuter `pgbackrest` DANS le
# conteneur qui fait tourner le serveur — l'image officielle ne l'embarque pas.
# =============================================================================

FROM postgres:16-bookworm

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

# La commande par défaut reste celle de l'image officielle (entrypoint inchangé) ;
# le fichier de configuration est imposé par docker-compose.yml.
