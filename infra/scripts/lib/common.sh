#!/usr/bin/env bash
# =============================================================================
# infra/scripts/lib/common.sh — fonctions partagées des scripts d'exploitation
# Applique : 02 §11.3 (alertes Telegram, canal interne Axion-IA), 02 §30.4-1/2
# (le .env vit hors du dépôt, root, chmod 600), 02 §30.6 (déploiement scripté).
# Ce fichier est SOURCÉ, jamais exécuté directement.
# =============================================================================

# Racine d'exploitation sur le serveur (02 §30.4-2). Surchargeable pour les tests.
AXION_ROOT="${AXION_ROOT:-/opt/axion-audit}"
# Répertoire des rapports horodatés (critère L0 : rapport de test de restauration).
AXION_LOG_DIR="${AXION_LOG_DIR:-/var/log/axion}"
# Racine du répertoire infra/ du dépôt, déduite de l'emplacement de ce fichier.
AXION_INFRA_DIR="${AXION_INFRA_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# Image utilitaire (tar, cp) des scripts d’exploitation. UNE SEULE définition :
# elle était auparavant recopiée dans chaque script, et avait déjà divergé de
# celle des Dockerfiles des fronts (3.20 ici, 3.21 là-bas). Alignée sur 3.21,
# et FIGÉE comme le reste (11 §1).
AXION_ALPINE_IMAGE=${AXION_ALPINE_IMAGE:-alpine:3.21}

# -----------------------------------------------------------------------------
# Journalisation — sortie standard + fichier si AXION_LOG_FILE est défini.
# -----------------------------------------------------------------------------
axion_ts() {
  date -u +'%Y-%m-%dT%H:%M:%SZ'
}

axion_log() {
  local line
  line="$(axion_ts) [INFO ] $*"
  echo "$line"
  if [[ -n "${AXION_LOG_FILE:-}" ]]; then
    echo "$line" >>"$AXION_LOG_FILE"
  fi
}

axion_warn() {
  local line
  line="$(axion_ts) [WARN ] $*"
  echo "$line" >&2
  if [[ -n "${AXION_LOG_FILE:-}" ]]; then
    echo "$line" >>"$AXION_LOG_FILE"
  fi
}

axion_error() {
  local line
  line="$(axion_ts) [ERROR] $*"
  echo "$line" >&2
  if [[ -n "${AXION_LOG_FILE:-}" ]]; then
    echo "$line" >>"$AXION_LOG_FILE"
  fi
}

# Arrêt immédiat avec code non nul (les scripts d'exploitation ne « continuent
# pas quand même » : un backup à moitié fait est un backup faux).
axion_die() {
  axion_error "$*"
  exit 1
}

# -----------------------------------------------------------------------------
# Prérequis
# -----------------------------------------------------------------------------
axion_require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || axion_die "Commande absente : $cmd"
  done
}

# Vérifie que des variables sont définies ET non vides (aucune valeur par défaut
# n'est inventée : le .env est le contrat, 02 §30.4-1).
axion_require_env() {
  local var
  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then
      axion_die "Variable d'environnement manquante ou vide : $var (voir .env.example)"
    fi
  done
}

# -----------------------------------------------------------------------------
# Chargement du .env serveur (root, chmod 600 — 02 §30.4-2)
# -----------------------------------------------------------------------------
# Chemin utilisé quand un script est appelé SANS argument. Il ne peut PAS exister
# (les chevrons ne sont pas un nom de répertoire valide) : c’est délibéré. La
# convention est $AXION_ROOT/<env>/.env, et un appel sans argument doit ÉCHOUER en
# affichant cette convention — pas réussir en silence sur un modèle à __CHANGEME__.
axion_env_file_default() {
  echo "$AXION_ROOT/<env>/.env"
}

axion_load_env() {
  local env_file="${1:-$(axion_env_file_default)}"
  # M-11 : la convention est /opt/axion-audit/<env>/.env, JAMAIS un .env unique
  # à la racine — le 02 §30.4-4 impose des valeurs distinctes par environnement.
  # Le message le dit, pour qu’un appel sans argument échoue en expliquant.
  if [[ ! -r "$env_file" ]]; then
    axion_die "Fichier d’environnement illisible : $env_file — convention : $AXION_ROOT/<staging|prod>/.env (passer le chemin en argument)."
  fi

  # Garde-fou de permissions : un .env lisible par tous est une fuite de secrets.
  local perms
  perms="$(stat -c '%a' "$env_file" 2>/dev/null || echo '')"
  if [[ -n "$perms" && "$perms" != "600" && "$perms" != "400" ]]; then
    axion_warn "Permissions inattendues sur $env_file : $perms (attendu 600, 02 §30.4-2)"
  fi

  set -a
  # shellcheck source=/dev/null
  . "$env_file"
  set +a

  AXION_ENV_FILE="$env_file"
  export AXION_ENV_FILE
}

# -----------------------------------------------------------------------------
# Invocation Docker Compose avec la bonne surcharge d'environnement.
# APP_ENV (dev|staging|prod) vient du .env — il n'y a pas de valeur par défaut.
# -----------------------------------------------------------------------------
axion_compose() {
  axion_require_env APP_ENV
  local -a files=(-f "$AXION_INFRA_DIR/docker-compose.yml")
  case "$APP_ENV" in
    dev) ;;
    staging) files+=(-f "$AXION_INFRA_DIR/docker-compose.staging.yml") ;;
    prod)    files+=(-f "$AXION_INFRA_DIR/docker-compose.prod.yml") ;;
    *) axion_die "APP_ENV invalide : $APP_ENV (attendu dev|staging|prod)" ;;
  esac
  docker compose --env-file "${AXION_ENV_FILE:-$(axion_env_file_default)}" "${files[@]}" "$@"
}

# Nom de projet Compose correspondant à APP_ENV (sert aux garde-fous anti-prod).
axion_project_name() {
  axion_require_env APP_ENV
  echo "axion-audit-$APP_ENV"
}

# -----------------------------------------------------------------------------
# Alerte d'exploitation — Telegram (02 §11.3, canal interne Axion-IA existant).
# Ne fait JAMAIS échouer l'appelant : une alerte non partie ne doit pas masquer
# l'erreur d'origine. L'échec d'envoi est journalisé.
# -----------------------------------------------------------------------------
axion_notify() {
  local message="$1"
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    axion_warn "Alerte NON envoyée (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID absents) : $message"
    return 0
  fi
  if ! curl -fsS --max-time 15 \
      -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=[Axion Audit / ${APP_ENV:-?}] ${message}" \
      -o /dev/null; then
    axion_warn "Échec de l'envoi de l'alerte Telegram : $message"
  fi
  return 0
}

# -----------------------------------------------------------------------------
# Chiffrement des archives hors serveur (02 §11.4 « copie chiffrée »).
# GPG symétrique AES-256, passphrase = ${BACKUP_ENCRYPTION_PASSPHRASE}, lue sur
# un descripteur de fichier : elle n'apparaît JAMAIS dans la table des processus.
# Lit stdin, écrit stdout.
# -----------------------------------------------------------------------------
axion_encrypt_stream() {
  axion_require_env BACKUP_ENCRYPTION_PASSPHRASE
  gpg --batch --quiet --yes --symmetric --cipher-algo AES256 \
      --passphrase-fd 3 --output - - 3<<<"$BACKUP_ENCRYPTION_PASSPHRASE"
}

axion_decrypt_stream() {
  axion_require_env BACKUP_ENCRYPTION_PASSPHRASE
  gpg --batch --quiet --yes --decrypt \
      --passphrase-fd 3 --output - - 3<<<"$BACKUP_ENCRYPTION_PASSPHRASE"
}

# -----------------------------------------------------------------------------
# Encodage URL — un secret issu d'`openssl rand -base64` contient `+`, `/` ou `=`
# qui casseraient une URL d'alias MinIO (MC_HOST_*).
# -----------------------------------------------------------------------------
axion_urlencode() {
  local s="$1" i c out=""
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$out"
}

# URL d'alias MinIO applicatif (clés de MOINDRE ACCÈS, 02 §30.4-7), à passer aux
# conteneurs `mc` par `--env MC_HOST_axion` : la valeur ne transite jamais par la
# ligne de commande, donc jamais par la table des processus de l'hôte.
axion_mc_host_url() {
  axion_require_env MINIO_ACCESS_KEY MINIO_SECRET_KEY
  printf 'http://%s:%s@%s:%s' \
    "$(axion_urlencode "$MINIO_ACCESS_KEY")" \
    "$(axion_urlencode "$MINIO_SECRET_KEY")" \
    "${MINIO_ENDPOINT:-minio}" "${MINIO_PORT:-9000}"
}

# -----------------------------------------------------------------------------
# Storage Box Hetzner (02 §11.4, règle 3-2-1). Options SSH communes.
# -----------------------------------------------------------------------------
axion_storagebox_ssh_opts() {
  axion_require_env STORAGE_BOX_PORT STORAGE_BOX_SSH_KEY_PATH
  # `accept-new` = TOFU (confiance au premier contact) : l’empreinte est
  # mémorisée au premier accès puis EXIGÉE à chaque fois — un changement
  # d’empreinte fait échouer la connexion, contrairement à `no`.
  # Écart ASSUMÉ et BORNÉ avec la CI, qui impose `yes` : là-bas l’empreinte est
  # fournie en secret d’Environment (DEPLOY_SSH_KNOWN_HOSTS), ici la Storage Box
  # est louée au provisionnement et son empreinte n’est pas connue d’avance.
  # DURCISSEMENT (à faire une fois la Storage Box en service, porte P-A) :
  #   ssh-keyscan -p $STORAGE_BOX_PORT $STORAGE_BOX_HOST >> /root/.ssh/known_hosts
  # puis remplacer `accept-new` par `yes` sur la ligne ci-dessous.
  echo "-p ${STORAGE_BOX_PORT} -i ${STORAGE_BOX_SSH_KEY_PATH} -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
}

axion_storagebox_target() {
  axion_require_env STORAGE_BOX_USER STORAGE_BOX_HOST STORAGE_BOX_PATH
  echo "${STORAGE_BOX_USER}@${STORAGE_BOX_HOST}:${STORAGE_BOX_PATH}"
}
