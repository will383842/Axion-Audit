#!/usr/bin/env bash
# =============================================================================
# infra/scripts/install-cron.sh — planification des tâches d'exploitation (L0)
# Applique : 02 §11.4 (`pg_dump` toutes les 6 h, miroir MinIO quotidien, TEST DE
# RESTAURATION AUTOMATIQUE NOCTURNE à ${RESTORE_TEST_CRON}), 07 ligne L0.
# IDEMPOTENT : réécrit intégralement /etc/cron.d/axion-audit à chaque exécution.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

CRON_FILE="/etc/cron.d/axion-audit"
ENV_FILE="${1:-$AXION_ROOT/.env}"

[[ "$(id -u)" -eq 0 ]] || axion_die "Ce script doit être exécuté en root (écriture dans /etc/cron.d)."

axion_load_env "$ENV_FILE"
axion_require_env RESTORE_TEST_CRON

# --- Validation du format cron (5 champs) ------------------------------------
field_count="$(printf '%s\n' "$RESTORE_TEST_CRON" | awk '{print NF}')"
[[ "$field_count" -eq 5 ]] || axion_die "RESTORE_TEST_CRON invalide (5 champs attendus) : « $RESTORE_TEST_CRON »"

# --- Prérequis d'exécution ----------------------------------------------------
for s in backup-postgres.sh backup-minio.sh restore-test.sh; do
  [[ -x "$SCRIPT_DIR/$s" ]] || axion_die "Script non exécutable : $SCRIPT_DIR/$s (chmod +x)"
done
mkdir -p "$AXION_LOG_DIR"
chmod 750 "$AXION_LOG_DIR"

# --- Écriture de la table ------------------------------------------------------
# Toutes les heures sont en UTC (invariant 5 : le serveur est en UTC).
cat >"$CRON_FILE" <<EOF
# ---------------------------------------------------------------------------
# Axion Audit — tâches d'exploitation (généré par infra/scripts/install-cron.sh)
# NE PAS ÉDITER À LA MAIN : rejouer le script. Heures en UTC (invariant 5).
# ---------------------------------------------------------------------------
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""

# Sauvegarde PostgreSQL toutes les 6 h (RPO <= 6 h, 02 §11.4)
0 */6 * * * root $SCRIPT_DIR/backup-postgres.sh $ENV_FILE >/dev/null 2>&1

# Miroir MinIO quotidien (mc mirror + archive chiffrée, 02 §11.4)
30 1 * * * root $SCRIPT_DIR/backup-minio.sh $ENV_FILE >/dev/null 2>&1

# TEST DE RESTAURATION NOCTURNE (critère d'acceptation L0) — RESTORE_TEST_CRON
$RESTORE_TEST_CRON root $SCRIPT_DIR/restore-test.sh $ENV_FILE >/dev/null 2>&1
EOF

chown root:root "$CRON_FILE"
chmod 644 "$CRON_FILE"

# --- Rotation des rapports (les journaux ne doivent pas remplir le disque :
#     seuil d'alerte ALERT_DISK_USAGE_PERCENT, 02 §11.3) ------------------------
cat >/etc/logrotate.d/axion-audit <<EOF
$AXION_LOG_DIR/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    su root root
}
EOF
chmod 644 /etc/logrotate.d/axion-audit

axion_log "Tâches installées dans $CRON_FILE :"
grep -vE '^\s*#|^\s*$' "$CRON_FILE" | sed 's/^/    /'
axion_log "Rappel : vérifier le premier passage avec « tail -f $AXION_LOG_DIR/restore-test-*.log »."
