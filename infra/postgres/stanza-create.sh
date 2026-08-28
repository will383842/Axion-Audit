#!/bin/sh
# =============================================================================
# infra/postgres/stanza-create.sh — création MÉCANISÉE de la stanza pgBackRest
# Applique : invariant 8 (sauvegarde terrain, aucune donnée sur un seul support),
# 02 §11.4 (WAL archiving + dépôt chiffré), 07 ligne L0 (« restauration Postgres
# testée depuis zéro »).
#
# -----------------------------------------------------------------------------
# POURQUOI CE SCRIPT EXISTE — CE N'EST PAS UN OUBLI QU'IL CORRIGE, C'EST UNE
# CONCEPTION
# -----------------------------------------------------------------------------
# `stanza-create` était documenté comme une ÉTAPE MANUELLE (infra/README.md §5.3,
# DECISIONS.md). Elle n'a jamais été exécutée sur le staging, et personne ne
# pouvait le voir : la base affichait `healthy`. Conséquence mesurée le 2026-08-28 :
#   /var/lib/pgbackrest/   vide · 0 WAL archivé · archive-push exit 103
#   275 réinitialisations complètes du cluster en 46 minutes, la première SIX
#   SECONDES après le démarrage du conteneur · 390 « Connection terminated
#   unexpectedly » côté API.
# Une étape manuelle oubliée une fois sur un staging sera oubliée en production.
# La corriger à la main n'aurait corrigé QUE cette fois-ci : c'est la conception
# qui est fautive, pas son exécution. Ce script est donc exécuté par un job
# ONE-SHOT du compose, sur le modèle de `createbuckets` — même forme, même
# garantie : `service_completed_successfully` empêche l'API et le worker de
# démarrer si la stanza n'a pas pu être créée.
#
# -----------------------------------------------------------------------------
# CE QU'IL GARANTIT
# -----------------------------------------------------------------------------
#  · IDEMPOTENT. `stanza-create` de pgBackRest 2.59 répond « stanza 'x' already
#    exists on repo1 and is valid » et sort en 0 (vérifié en exécution sur base
#    jetable, deux passages consécutifs). Un redéploiement ne recrée donc rien et
#    n'échoue pas. Ce script n'ajoute AUCUN test « si absent alors créer » : ce
#    serait une seconde vérité, moins fiable que celle de pgBackRest lui-même.
#  · ÉCHEC VISIBLE. Toute erreur sort en code non nul. Le job est déclaré avec
#    `restart: 'no'` et les services applicatifs en dépendent par
#    `condition: service_completed_successfully` : un échec de création BLOQUE le
#    déploiement au lieu de l'assortir d'un avertissement. Une base qui démarre
#    sans archivage perdra ses données au premier incident (invariant 8) — elle ne
#    doit pas démarrer du tout.
#
# -----------------------------------------------------------------------------
# POURQUOI `--no-online`, ET CE QUE ÇA COÛTE
# -----------------------------------------------------------------------------
# pgBackRest se connecte à PostgreSQL par SOCKET UNIX uniquement (aucune option
# ne lui fait ouvrir une connexion TCP vers un autre hôte : `pg1-host` suppose
# SSH/TLS). Un conteneur séparé ne peut donc pas parler au cluster sans partager
# `/var/run/postgresql` — un volume de plus, et un socket qui survit aux
# redémarrages dans un volume persistant. `--no-online` évite tout cela : la
# stanza est créée à partir de `global/pg_control`, lu dans le volume de données,
# qui porte la version et l'identifiant système du cluster — les deux seules
# valeurs dont `stanza-create` a besoin. Vérifié en exécution : cluster EN COURS
# D'EXÉCUTION, création réussie, archivage fonctionnel derrière.
# CE QUE `--no-online` NE FAIT PAS : il ne vérifie ni `archive_mode`, ni
# `archive_command`, ni que le cluster répond. Ces trois-là sont vérifiés
# autrement — par `postgresql.custom.conf` (versionné) et par la sonde de santé
# du conteneur PostgreSQL (`healthcheck.sh`, propriétés 1 et 3).
#
# MONTÉE DE VERSION MAJEURE DE POSTGRESQL : `stanza-create` répondra « stanza
# already exists but is not valid » et ce script ÉCHOUERA — volontairement. La
# reprise s'appelle `pgbackrest stanza-upgrade` et c'est une décision humaine
# (11 §1 : aucune montée majeure sans décision humaine). Ce script ne l'exécute
# jamais tout seul.
# =============================================================================
set -eu

STANZA="${PGBACKREST_STANZA:-axion}"
DEPOT="${PGBACKREST_REPO1_PATH:-/var/lib/pgbackrest}"
# Doit rester identique à `pg1-path` de infra/pgbackrest/pgbackrest.conf : ce
# fichier ne fait aucune interpolation, la valeur y est écrite en dur.
DONNEES="${PGDATA:-/var/lib/postgresql/data}"

# Le job démarre en même temps que PostgreSQL (`service_started` — il ne peut pas
# attendre `service_healthy`, puisque la sonde de santé exige justement la stanza
# que ce script crée). `initdb` peut donc ne pas avoir fini : on attend le fichier
# que `stanza-create` doit lire, et RIEN D'AUTRE.
ATTENTE_MAX_S=180
attendu=0
while [ ! -f "$DONNEES/global/pg_control" ]; do
  if [ "$attendu" -ge "$ATTENTE_MAX_S" ]; then
    echo "stanza: ECHEC — $DONNEES/global/pg_control toujours absent apres ${ATTENTE_MAX_S}s :"
    echo "stanza: le cluster n'a pas ete initialise, la stanza ne peut pas etre creee."
    exit 1
  fi
  [ "$attendu" -eq 0 ] && echo "stanza: attente de l'initialisation du cluster ($DONNEES/global/pg_control)…"
  sleep 2
  attendu=$((attendu + 2))
done

echo "stanza: cluster initialise, creation de la stanza '$STANZA' dans $DEPOT (idempotent)."
pgbackrest --stanza="$STANZA" --no-online stanza-create

# Contrôle de sortie : on ne se fie pas au seul code de retour. C'est ce fichier
# que `archive-push` ouvre à chaque segment WAL, et c'est son absence qui a
# provoqué la boucle du 2026-08-28.
if [ ! -f "$DEPOT/archive/$STANZA/archive.info" ]; then
  echo "stanza: ECHEC — $DEPOT/archive/$STANZA/archive.info absent apres un stanza-create rendu en succes."
  exit 1
fi

echo "stanza: '$STANZA' prete dans $DEPOT — archivage WAL operationnel."
