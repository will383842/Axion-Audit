#!/usr/bin/env bash
# =============================================================================
# infra/scripts/backup-caddy.sh — sauvegarde du magasin TLS de Caddy (lot L0)
# Applique : 02 §11.4 (copie CHIFFRÉE quotidienne vers la Storage Box + copie
# hebdomadaire hors Hetzner, rétention 30 j), 02 §30.4-1/5 (aucun secret sur
# disque en clair, aucun secret en argument de commande).
# =============================================================================
#
# POURQUOI CE SCRIPT EXISTE — arbitrage A01 du 2026-08-27.
# Le volume `caddy_data` contient les certificats ACME et LEURS CLÉS PRIVÉES,
# pour les DEUX domaines (prod et sous-domaine de staging) depuis que les deux
# environnements partagent un frontal unique (DECISIONS.md, « Cohabitation
# staging/prod : qui écoute sur 443 ? »).
# On aurait pu se dire « ACME régénérera » — ce raisonnement ne tient pas dans
# le seul moment où il compte, un PRA : le RTO cible est de 4 h (02 §11.4) et la
# procédure en consomme déjà ~3 h 35. Une réémission sous plafond Let's Encrypt
# (5 certificats par domaine et par semaine) PEUT échouer, et si elle échoue les
# DEUX environnements sont injoignables en HTTPS — y compris celui qui devrait
# servir à vérifier que la restauration a réussi. Un PRA qui dépend d'un service
# tiers à quota n'est pas un PRA.
#
# ⚠️ L'ARCHIVE CONTIENT DES CLÉS PRIVÉES TLS. Elle n'est JAMAIS écrite en clair :
#    chiffrement GPG AES-256 en flux (`axion_encrypt_stream`), fichier en 600.
#
# USAGE : ./backup-caddy.sh [/opt/axion-audit/<env>/.env]
# Planifié par install-cron.sh. Sans effet en staging : cette pile n'a pas de
# frontal, donc pas de volume `caddy_data`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

# Image utilitaire FIGÉE (11 §1) — identique à celle de backup-postgres.sh.
ALPINE_IMAGE="${ALPINE_IMAGE:-$AXION_ALPINE_IMAGE}"
ARCHIVE_DIR="${CADDY_ARCHIVE_DIR:-/var/backups/axion/caddy/archives}"
TS="$(date -u +'%Y%m%dT%H%M%SZ')"

axion_load_env "${1:-$AXION_ROOT/.env}"
axion_require_cmd docker rsync gpg tar sha256sum ssh
axion_require_env APP_ENV BACKUP_RETENTION_DAYS BACKUP_ENCRYPTION_PASSPHRASE

mkdir -p "$AXION_LOG_DIR" "$ARCHIVE_DIR"
chmod 700 "$ARCHIVE_DIR"
AXION_LOG_FILE="$AXION_LOG_DIR/backup-caddy-$TS.log"
export AXION_LOG_FILE

trap 'rc=$?; axion_error "Sauvegarde Caddy ÉCHOUÉE (code $rc) — journal : $AXION_LOG_FILE"; axion_notify "ÉCHEC sauvegarde Caddy/TLS (code $rc). Journal : $AXION_LOG_FILE"; exit $rc' ERR

PROJECT="$(axion_project_name)"
VOLUME="${PROJECT}_caddy_data"

axion_log "=== Sauvegarde du magasin TLS de Caddy — début ($TS, $APP_ENV) ==="

# -----------------------------------------------------------------------------
# 0. STAGING : rien à faire. Depuis l'arbitrage du 2026-08-27, la pile de staging
#    n'a plus de service `caddy` — son frontal est celui de la prod, dont les
#    certificats (les DEUX domaines) sont sauvegardés par le passage `prod`.
# -----------------------------------------------------------------------------
if [[ "$APP_ENV" == "staging" ]]; then
  axion_log "Environnement staging : aucun frontal dans cette pile, rien à sauvegarder."
  axion_log "Les certificats des DEUX domaines sont dans caddy_data de la pile de PROD."
  trap - ERR
  exit 0
fi

# En prod (ou en dev), l'absence du volume est une ANOMALIE, pas un cas normal :
# elle signifie qu'aucun certificat n'a jamais été émis, ou que le volume a été
# détruit (`down -v`). On échoue bruyamment plutôt que de sortir « OK » à vide.
docker volume inspect "$VOLUME" >/dev/null 2>&1 \
  || axion_die "Volume « $VOLUME » introuvable : aucun magasin TLS à sauvegarder (frontal jamais démarré, ou volume détruit)."

# -----------------------------------------------------------------------------
# 1. Archive CHIFFRÉE du volume, lu par un conteneur jetable en LECTURE SEULE.
#    Le flux ne touche jamais le disque en clair.
# -----------------------------------------------------------------------------
ARCHIVE="$ARCHIVE_DIR/caddy-data-${TS}.tar.gpg"
axion_log "1/4 archive chiffrée du volume $VOLUME → $(basename "$ARCHIVE")"
umask 077
docker run --rm -v "$VOLUME:/data:ro" "$ALPINE_IMAGE" tar -C /data -cf - . \
  | axion_encrypt_stream >"$ARCHIVE"
[[ -s "$ARCHIVE" ]] || axion_die "Archive Caddy vide : $ARCHIVE"
chmod 600 "$ARCHIVE"
sha256sum "$ARCHIVE" >"$ARCHIVE.sha256"

# -----------------------------------------------------------------------------
# 2. CONTRÔLE DE CONTENU — une archive lisible mais SANS certificat serait une
#    catastrophe silencieuse : on la relit et on compte les certificats.
#    (Le contrôle de restauration complet, lui, est fait par restore-test.sh.)
# -----------------------------------------------------------------------------
axion_log "2/4 relecture de l'archive et comptage des certificats"
CERT_COUNT="$(axion_decrypt_stream <"$ARCHIVE" | tar -tf - 2>/dev/null | grep -c '/certificates/.*\.crt$' || true)"
if [[ "$CERT_COUNT" -eq 0 ]]; then
  axion_warn "Aucun certificat dans l'archive : normal UNIQUEMENT si le site écoute sur une adresse sans ACME (:8080). En prod, c'est une anomalie à traiter."
else
  axion_log "Archive vérifiée : $CERT_COUNT certificat(s) présent(s)."
fi

# -----------------------------------------------------------------------------
# 3. Envoi hors serveur (Storage Box) + copie hebdo hors Hetzner (règle 3-2-1)
# -----------------------------------------------------------------------------
axion_log "3/4 envoi vers la Storage Box"
SSH_OPTS="$(axion_storagebox_ssh_opts)"
SB_TARGET="$(axion_storagebox_target)"
rsync -a --partial -e "ssh $SSH_OPTS" "$ARCHIVE_DIR/" "$SB_TARGET/caddy/archives/"

if [[ "$(date -u +'%u')" == "7" && -n "${OFFSITE_RCLONE_REMOTE:-}" ]]; then
  axion_require_cmd rclone
  axion_require_env OFFSITE_RCLONE_PATH
  axion_log "3/4 copie hebdomadaire hors Hetzner"
  rclone sync "$ARCHIVE_DIR" "${OFFSITE_RCLONE_REMOTE}:${OFFSITE_RCLONE_PATH}/caddy/archives" --transfers=4
else
  axion_log "3/4 copie hors Hetzner : non due aujourd'hui ou OFFSITE_RCLONE_REMOTE vide"
fi

# -----------------------------------------------------------------------------
# 4. Rétention — MÊME durée que les autres sauvegardes (02 §11.4 : 30 j)
# -----------------------------------------------------------------------------
axion_log "4/4 purge des archives de plus de ${BACKUP_RETENTION_DAYS} jours"
find "$ARCHIVE_DIR" -type f -name 'caddy-data-*' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
# shellcheck disable=SC2086
ssh $SSH_OPTS "${STORAGE_BOX_USER}@${STORAGE_BOX_HOST}" \
  "find ${STORAGE_BOX_PATH}/caddy/archives -type f -name 'caddy-data-*' -mtime +${BACKUP_RETENTION_DAYS} -delete" \
  || axion_warn "Purge distante impossible (Storage Box) : à refaire au prochain passage"

axion_log "=== Sauvegarde du magasin TLS de Caddy — OK ==="
trap - ERR
exit 0
