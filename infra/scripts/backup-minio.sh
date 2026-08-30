#!/usr/bin/env bash
# =============================================================================
# infra/scripts/backup-minio.sh — sauvegarde MinIO par `mc mirror` (lot L0)
# Applique : 02 §11.4 (copie CHIFFRÉE quotidienne vers la Storage Box + copie
# hebdo hors Hetzner, rétention 30 j), 07 ligne L0 (« `mc mirror` MinIO » et
# « restauration MinIO testée depuis zéro »), 11 §2 (MinIO jamais exposé : le
# miroir passe par le RÉSEAU DOCKER INTERNE), 02 §30.4-7 (clés APPLICATIVES).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

# Image `mc` FIGÉE (11 §1) — identique à celle de docker-compose.yml.
MC_IMAGE="${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}"
# Miroir local (2e support de la règle 3-2-1) et archives chiffrées.
MIRROR_DIR="${MIRROR_DIR:-/var/backups/axion/minio/mirror}"
ARCHIVE_DIR="${ARCHIVE_DIR:-/var/backups/axion/minio/archives}"
TS="$(date -u +'%Y%m%dT%H%M%SZ')"

axion_load_env "${1:-$(axion_env_file_default)}"
axion_require_cmd docker rsync gpg curl tar sha256sum
axion_require_env MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_BUCKET_ATTACHMENTS \
                  MINIO_BUCKET_REPORTS MINIO_BUCKET_TEMPLATES \
                  BACKUP_RETENTION_DAYS BACKUP_ENCRYPTION_PASSPHRASE

mkdir -p "$AXION_LOG_DIR" "$MIRROR_DIR" "$ARCHIVE_DIR"
AXION_LOG_FILE="$AXION_LOG_DIR/backup-minio-$TS.log"
export AXION_LOG_FILE

# shellcheck disable=SC2154
#   Faux positif : `rc` EST affecté — par `rc=$?`, première instruction du piège.
#   Shellcheck ne le voit pas parce que le corps du `trap` est une chaîne entre
#   apostrophes, évaluée au déclenchement et non à l'analyse. Désactivation ciblée
#   sur cette ligne uniquement, jamais sur le fichier.
trap 'rc=$?; axion_error "Sauvegarde MinIO ÉCHOUÉE (code $rc) — journal : $AXION_LOG_FILE"; axion_notify "ÉCHEC sauvegarde MinIO (code $rc). Journal : $AXION_LOG_FILE"; exit $rc' ERR

NETWORK="$(axion_project_name)"
# Transmis par l'ENVIRONNEMENT (`--env` sans valeur) : le secret n'apparaît
# jamais dans la table des processus de l'hôte (cf. lib/common.sh).
MC_HOST_axion="$(axion_mc_host_url)"
export MC_HOST_axion

BUCKETS=("$MINIO_BUCKET_ATTACHMENTS" "$MINIO_BUCKET_REPORTS" "$MINIO_BUCKET_TEMPLATES")

axion_log "=== Sauvegarde MinIO — début ($TS) ==="

for bucket in "${BUCKETS[@]}"; do
  # ---------------------------------------------------------------------------
  # 1. `mc mirror` INCRÉMENTAL du bucket vers le miroir local.
  #    `--remove` : le miroir reflète l'état réel (une purge RGPD 06 §10.4 doit
  #    se propager) ; les versions antérieures restent dans les archives datées.
  # ---------------------------------------------------------------------------
  axion_log "1/4 mc mirror du bucket $bucket"
  docker run --rm \
    --network "$NETWORK" \
    --env MC_HOST_axion \
    -v "$MIRROR_DIR:/backup" \
    "$MC_IMAGE" mirror --overwrite --remove "axion/$bucket" "/backup/$bucket"

  # ---------------------------------------------------------------------------
  # 2. Manifeste de SOMMES DE CONTRÔLE — c'est lui que restore-test.sh vérifie
  #    (critère L0 : « contrôle d'intégrité par somme de contrôle, pas seulement
  #    par présence de fichier »).
  # ---------------------------------------------------------------------------
  axion_log "2/4 manifeste sha256 du bucket $bucket"
  # M-9 — UN MANIFESTE EST ÉCRIT MÊME POUR ZÉRO OBJET.
  # Au lot L0 les trois buckets SONT vides : aucune mission n’a encore produit de
  # fichier. La version précédente sortait en silence (`cd || exit 0`) ou laissait un
  # manifeste VIDE ; côté restauration, `sha256sum -c` sur un fichier vide sort en 1,
  # ce qui était interprété comme UNE CORRUPTION. Le test de restauration nocturne —
  # seule preuve automatisée du PRA — aurait donc crié au loup dès la première nuit.
  # Une alerte qui se déclenche à tort la première nuit est une alerte que plus
  # personne ne lira la dixième.
  # On écrit donc TOUJOURS deux fichiers, et le compte rend l’état VÉRIFIABLE :
  #   MANIFEST.sha256 — une ligne par objet (0 ligne si le bucket est vide)
  #   MANIFEST.count  — le nombre d’objets annoncé, que la restauration recoupe
  # « vide » devient ainsi un ÉTAT LÉGITIME ET PROUVÉ, distinct de « manifeste absent »
  # (sauvegarde incomplète) et de « sommes invalides » (corruption réelle).
  mkdir -p "$MIRROR_DIR/$bucket"
  ( cd "$MIRROR_DIR/$bucket" || axion_die "Miroir inaccessible : $MIRROR_DIR/$bucket"
    find . -type f ! -name 'MANIFEST.sha256' ! -name 'MANIFEST.count' -print0 \
      | sort -z \
      | xargs -0 --no-run-if-empty sha256sum >MANIFEST.sha256
    wc -l <MANIFEST.sha256 | tr -dc '0-9' >MANIFEST.count )
  axion_log "2/4 bucket $bucket : $(cat "$MIRROR_DIR/$bucket/MANIFEST.count") objet(s) au manifeste"

  # ---------------------------------------------------------------------------
  # 3. Archive CHIFFRÉE horodatée (02 §11.4 « copie chiffrée »).
  # ---------------------------------------------------------------------------
  archive="$ARCHIVE_DIR/minio-${bucket}-${TS}.tar.gpg"
  axion_log "3/4 archive chiffrée $archive"
  tar -C "$MIRROR_DIR" -cf - "$bucket" | axion_encrypt_stream >"$archive"
  [[ -s "$archive" ]] || axion_die "Archive MinIO vide : $archive"
  sha256sum "$archive" >"$archive.sha256"
done

# -----------------------------------------------------------------------------
# 4. Envoi hors serveur (Storage Box) + copie hebdo hors Hetzner (règle 3-2-1)
#    + rétention ${BACKUP_RETENTION_DAYS} jours.
# -----------------------------------------------------------------------------
axion_log "4/4 envoi vers la Storage Box"
SSH_OPTS="$(axion_storagebox_ssh_opts)"
SB_TARGET="$(axion_storagebox_target)"
rsync -a --partial -e "ssh $SSH_OPTS" "$ARCHIVE_DIR/" "$SB_TARGET/minio/archives/"

if [[ "$(date -u +'%u')" == "7" && -n "${OFFSITE_RCLONE_REMOTE:-}" ]]; then
  axion_require_cmd rclone
  axion_require_env OFFSITE_RCLONE_PATH
  axion_log "4/4 copie hebdomadaire hors Hetzner"
  rclone sync "$ARCHIVE_DIR" "${OFFSITE_RCLONE_REMOTE}:${OFFSITE_RCLONE_PATH}/minio/archives" --transfers=4
else
  axion_log "4/4 copie hors Hetzner : non due aujourd'hui ou OFFSITE_RCLONE_REMOTE vide"
fi

axion_log "4/4 purge des archives de plus de ${BACKUP_RETENTION_DAYS} jours"
find "$ARCHIVE_DIR" -type f -name 'minio-*' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
# shellcheck disable=SC2086
ssh $SSH_OPTS "${STORAGE_BOX_USER}@${STORAGE_BOX_HOST}" \
  "find ${STORAGE_BOX_PATH}/minio/archives -type f -name 'minio-*' -mtime +${BACKUP_RETENTION_DAYS} -delete" \
  || axion_warn "Purge distante impossible (Storage Box) : à refaire au prochain passage"

axion_log "=== Sauvegarde MinIO — OK (${#BUCKETS[@]} buckets) ==="
trap - ERR
exit 0
