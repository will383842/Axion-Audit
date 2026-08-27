#!/usr/bin/env bash
# =============================================================================
# infra/scripts/backup-postgres.sh — sauvegarde PostgreSQL (lot L0)
# Applique : 02 §11.4 (`pg_dump` toutes les 6 h + WAL archiving pgBackRest,
# full hebdo / incrémental quotidien, rétention 30 j, copie CHIFFRÉE vers la
# Storage Box + 2e copie hebdo hors Hetzner = règle 3-2-1, RPO <= 6 h),
# 02 §30.4-1 (aucun secret en dur), 02 §11.3 (alerte Telegram si échec).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

# Répertoire local des archives (2e support de la règle 3-2-1 : disque du VPS).
BACKUP_DIR="${BACKUP_DIR:-/var/backups/axion/postgres}"
# Export à plat du dépôt pgBackRest (volume Docker) avant envoi hors serveur.
PGBR_EXPORT_DIR="${PGBR_EXPORT_DIR:-/var/backups/axion/pgbackrest-export}"
TS="$(date -u +'%Y%m%dT%H%M%SZ')"

axion_load_env "${1:-$AXION_ROOT/.env}"
axion_require_cmd docker rsync gpg curl
axion_require_env POSTGRES_USER POSTGRES_DB PGBACKREST_STANZA BACKUP_RETENTION_DAYS \
                  BACKUP_ENCRYPTION_PASSPHRASE

mkdir -p "$AXION_LOG_DIR" "$BACKUP_DIR" "$PGBR_EXPORT_DIR"
AXION_LOG_FILE="$AXION_LOG_DIR/backup-postgres-$TS.log"
export AXION_LOG_FILE

# Toute erreur non rattrapée alerte et sort en code non nul (02 §11.3).
trap 'rc=$?; axion_error "Sauvegarde Postgres ÉCHOUÉE (code $rc) — journal : $AXION_LOG_FILE"; axion_notify "ÉCHEC sauvegarde Postgres (code $rc). Journal : $AXION_LOG_FILE"; exit $rc' ERR

axion_log "=== Sauvegarde PostgreSQL — début ($TS) ==="

# -----------------------------------------------------------------------------
# 1. Sauvegarde LOGIQUE — `pg_dump` toutes les 6 h (02 §11.4)
#    Format custom (-Fc) : restauration sélective table par table possible.
#    Exécuté SOUS L'UTILISATEUR postgres DANS le conteneur : authentification par
#    socket local, aucun mot de passe ne transite par la ligne de commande.
# -----------------------------------------------------------------------------
DUMP_FILE="$BACKUP_DIR/pgdump-${POSTGRES_DB}-${TS}.dump.gpg"
axion_log "1/5 pg_dump logique → $DUMP_FILE"
axion_compose exec -T --user postgres postgres \
  pg_dump --format=custom --compress=6 --no-password \
          --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  | axion_encrypt_stream >"$DUMP_FILE"

[[ -s "$DUMP_FILE" ]] || axion_die "Le dump chiffré est vide : $DUMP_FILE"
sha256sum "$DUMP_FILE" >"$DUMP_FILE.sha256"
axion_log "1/5 dump chiffré : $(du -h "$DUMP_FILE" | cut -f1)"

# -----------------------------------------------------------------------------
# 2. Sauvegarde PHYSIQUE — pgBackRest (02 §11.4)
#    Complète le dimanche (ou si aucune complète n'existe), incrémentale sinon.
# -----------------------------------------------------------------------------
BACKUP_TYPE="incr"
if [[ "$(date -u +'%u')" == "7" ]]; then
  BACKUP_TYPE="full"
fi
if ! axion_compose exec -T --user postgres postgres \
      pgbackrest --stanza="$PGBACKREST_STANZA" info --output=json 2>/dev/null \
      | grep -q '"type":"full"'; then
  axion_log "2/5 aucune sauvegarde complète existante → bascule en type=full"
  BACKUP_TYPE="full"
fi

axion_log "2/5 pgbackrest backup --type=$BACKUP_TYPE"
axion_compose exec -T --user postgres postgres \
  pgbackrest --stanza="$PGBACKREST_STANZA" --type="$BACKUP_TYPE" backup

axion_log "2/5 vérification de la cohérence du dépôt (pgbackrest check)"
axion_compose exec -T --user postgres postgres \
  pgbackrest --stanza="$PGBACKREST_STANZA" check

# -----------------------------------------------------------------------------
# 3. Copie vers la Storage Box Hetzner — SITE DISTINCT (02 §11.4)
#    Le dépôt pgBackRest est déjà chiffré (repo1-cipher-type) ; les dumps le sont
#    par GPG. Rien ne part en clair.
# -----------------------------------------------------------------------------
axion_log "3/5 copie vers la Storage Box"
SSH_OPTS="$(axion_storagebox_ssh_opts)"
SB_TARGET="$(axion_storagebox_target)"

rsync -a --delete-after --partial \
      -e "ssh $SSH_OPTS" \
      "$BACKUP_DIR/" "$SB_TARGET/postgres/dumps/"

# Le dépôt pgBackRest vit dans un volume Docker : on le lit via un conteneur
# jetable monté en LECTURE SEULE (aucun risque pour la production).
PROJECT="$(axion_project_name)"
docker run --rm \
  -v "${PROJECT}_pgbackrest_repo:/repo:ro" \
  -v "$PGBR_EXPORT_DIR:/export" \
  $AXION_ALPINE_IMAGE sh -c 'cp -a /repo/. /export/'

rsync -a --delete-after --partial \
      -e "ssh $SSH_OPTS" \
      "$PGBR_EXPORT_DIR/" "$SB_TARGET/postgres/pgbackrest/"

# -----------------------------------------------------------------------------
# 4. 2e copie HEBDOMADAIRE hors Hetzner — règle 3-2-1 (02 §11.4)
# -----------------------------------------------------------------------------
if [[ "$(date -u +'%u')" == "7" && -n "${OFFSITE_RCLONE_REMOTE:-}" ]]; then
  axion_require_cmd rclone
  axion_require_env OFFSITE_RCLONE_PATH
  axion_log "4/5 copie hebdomadaire hors Hetzner → ${OFFSITE_RCLONE_REMOTE}:${OFFSITE_RCLONE_PATH}"
  rclone sync "$BACKUP_DIR" "${OFFSITE_RCLONE_REMOTE}:${OFFSITE_RCLONE_PATH}/postgres/dumps" --transfers=4
  rclone sync "$PGBR_EXPORT_DIR" "${OFFSITE_RCLONE_REMOTE}:${OFFSITE_RCLONE_PATH}/postgres/pgbackrest" --transfers=4
else
  axion_log "4/5 copie hors Hetzner : non due aujourd'hui (hebdomadaire) ou OFFSITE_RCLONE_REMOTE vide"
fi

# -----------------------------------------------------------------------------
# 5. Rétention — ${BACKUP_RETENTION_DAYS} jours (02 §11.4)
#    pgBackRest purge son propre dépôt via repo1-retention-full ; ici on ne purge
#    que les dumps logiques, localement ET sur la Storage Box.
# -----------------------------------------------------------------------------
axion_log "5/5 purge des dumps de plus de ${BACKUP_RETENTION_DAYS} jours"
find "$BACKUP_DIR" -type f -name 'pgdump-*' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
# shellcheck disable=SC2086
ssh $SSH_OPTS "${STORAGE_BOX_USER}@${STORAGE_BOX_HOST}" \
  "find ${STORAGE_BOX_PATH}/postgres/dumps -type f -name 'pgdump-*' -mtime +${BACKUP_RETENTION_DAYS} -delete" \
  || axion_warn "Purge distante impossible (la Storage Box peut refuser find : purge à faire au prochain passage)"

axion_log "=== Sauvegarde PostgreSQL — OK (type=$BACKUP_TYPE) ==="
trap - ERR
exit 0
