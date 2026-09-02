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
ENV_FILE="${1:-$(axion_env_file_default)}"

[[ "$(id -u)" -eq 0 ]] || axion_die "Ce script doit être exécuté en root (écriture dans /etc/cron.d)."

axion_load_env "$ENV_FILE"
axion_require_env RESTORE_TEST_CRON

# --- Validation du format cron (5 champs) ------------------------------------
field_count="$(printf '%s\n' "$RESTORE_TEST_CRON" | awk '{print NF}')"
[[ "$field_count" -eq 5 ]] || axion_die "RESTORE_TEST_CRON invalide (5 champs attendus) : « $RESTORE_TEST_CRON »"

# --- Minute de passe de la sonde d'alertes ------------------------------------
# LA MÊME VARIABLE que celle du service `sonde` de la pile Coolify : les deux
# chemins exécutent le même script et doivent sonner à la même minute, sinon
# comparer leurs journaux devient un exercice de traduction. Écrite une fois au
# `.env.example`, lue ici ET par le compose — jamais recopiée en dur des deux
# côtés, où elle dériverait.
SONDE_MINUTE="${AXION_SONDE_MINUTE:-17}"
case "$SONDE_MINUTE" in
  '' | *[!0-9]*) axion_die "AXION_SONDE_MINUTE invalide (« $SONDE_MINUTE ») : un entier de 0 à 59 est attendu." ;;
esac
[[ "$SONDE_MINUTE" -le 59 ]] || axion_die "AXION_SONDE_MINUTE hors bornes (« $SONDE_MINUTE »)."

# --- Prérequis d'exécution ----------------------------------------------------
for s in backup-postgres.sh backup-minio.sh backup-caddy.sh restore-test.sh sonde-alertes.sh; do
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

# Magasin TLS de Caddy — certificats des DEUX domaines (02 §11.4 + arbitrage A01
# du 2026-08-27 : une réémission ACME sous quota peut échouer PENDANT un PRA).
# Programmé APRÈS le miroir MinIO et AVANT le test de restauration, pour que le
# test de la nuit porte sur une archive du jour.
45 1 * * * root $SCRIPT_DIR/backup-caddy.sh $ENV_FILE >/dev/null 2>&1

# TEST DE RESTAURATION NOCTURNE (critère d’acceptation L0) — RESTORE_TEST_CRON
$RESTORE_TEST_CRON root $SCRIPT_DIR/restore-test.sh $ENV_FILE >/dev/null 2>&1

# SONDE D'ALERTES — les quatre seuils \${ALERT_*} du 02 §11.3 et de l'invariant 8
# (fiche AMELIORATIONS.md « O-2 », ABSORBÉE le 2026-08-31 par Williams).
# CADENCE HORAIRE, ET NON QUOTIDIENNE : le plus court des quatre seuils se compte
# en minutes (job LLM > 5 min) et le plus long en heures (sync muette > 24 h). Une
# passe par jour ferait découvrir un disque plein jusqu'à 24 h trop tard.
# À LA MINUTE \${AXION_SONDE_MINUTE} (17 par défaut), délibérément : les quatre
# autres tâches partent à 0, 30 et 45 — une sonde qui tourne PENDANT une
# sauvegarde mesurerait le pic qu'elle provoque. C'est la MÊME minute que la
# boucle du service \`sonde\` de la pile Coolify, qui exécute le MÊME script.
# Le code de sortie est ignoré ici (comme pour les autres tâches) : la sonde
# n'informe PAS par le cron, elle informe par le canal Telegram et par son journal.
$SONDE_MINUTE * * * * root $SCRIPT_DIR/sonde-alertes.sh $ENV_FILE >/dev/null 2>&1
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
