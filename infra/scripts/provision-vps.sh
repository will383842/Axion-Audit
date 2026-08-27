#!/usr/bin/env bash
# =============================================================================
# infra/scripts/provision-vps.sh — durcissement et préparation du VPS (lot L0-b)
# Applique : 06 §10.3 INTÉGRALEMENT (SSH par clés uniquement + port non standard
# + fail2ban · UFW 80/443 + SSH · Docker user namespaces · unattended-upgrades ·
# réseau Docker interne), 02 §30.4-2 (« /opt/axion-audit/.env, root, chmod 600,
# provisionné À LA MAIN par SSH au lot L0, PAS par la CI »), 02 §11.4 (arborescence
# de sauvegarde). IDEMPOTENT : rejouable sans dégât.
# =============================================================================
#
# CE SCRIPT NE GÉNÈRE ET NE POSE AUCUNE VALEUR DE SECRET (02 §30.4-1/2/5).
# Il crée /opt/axion-audit/.env à partir de .env.example, en root:600, puis
# S'ARRÊTE en demandant à l'opérateur de le remplir à la main.
#
# USAGE (en root, sur un Ubuntu LTS fraîchement loué) :
#   ./provision-vps.sh --ssh-port 2222 --admin-user axionops
# Options :
#   --ssh-port N        port SSH non standard (défaut : 2222)
#   --admin-user NOM    compte d'administration (défaut : l'utilisateur SUDO_USER ou root)
#   --no-userns-remap   n'active pas l'isolation par user namespaces (à n'utiliser
#                       que si un incident de permissions de volume l'impose ;
#                       à tracer dans DECISIONS.md car cela déroge à 06 §10.3)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

SSH_PORT="2222"
ADMIN_USER="${SUDO_USER:-root}"
USERNS_REMAP="yes"
# Réseau Docker de liaison entre la pile de STAGING et le Caddy de la pile de
# PROD (arbitrage A01, DECISIONS.md 2026-08-27). Déclaré `external` dans
# infra/docker-compose.staging.yml ET .prod.yml : il doit donc exister AVANT le
# premier `up`. Le nom est ÉCRIT EN DUR dans les deux fichiers Compose — le
# changer ici sans les corriger casserait les deux piles.
AXION_EDGE_NETWORK="axion-edge-staging"
# Volumes des FICHIERS CONSTRUITS des fronts de STAGING. En staging et en prod,
# `field` et `hq` sont des JOBS ONE-SHOT qui déposent leur build dans /sortie ;
# c’est le Caddy de la pile de PROD qui les SERT, en lecture seule. Comme le
# réseau de liaison, ils sont déclarés `external` des deux côtés : créés ici, ils
# survivent aux `down` et ne dépendent pas de l’ordre de démarrage des piles.
# Ils ne contiennent que du HTML/JS/CSS publiquement servi : aucune donnée,
# aucun secret — la séparation du 02 §30.4-4 reste intacte.
AXION_SHARED_VOLUMES=(axion-staging-field-dist axion-staging-hq-dist)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --no-userns-remap) USERNS_REMAP="no"; shift ;;
    -h|--help) sed -n '1,30p' "$0"; exit 0 ;;
    *) axion_die "Option inconnue : $1" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || axion_die "Ce script doit être exécuté en root."
[[ "$SSH_PORT" =~ ^[0-9]+$ && "$SSH_PORT" -gt 1024 && "$SSH_PORT" -lt 65536 ]] \
  || axion_die "Port SSH invalide : $SSH_PORT (attendu 1025-65535, « port non standard » 06 §10.3)"
grep -qi 'ubuntu' /etc/os-release || axion_warn "Système non Ubuntu : le pack impose Ubuntu LTS (02 §4.2)."

axion_log "=== Provisionnement du VPS — début (SSH port $SSH_PORT, admin $ADMIN_USER) ==="

# -----------------------------------------------------------------------------
# 1. Paquets de base (idempotent : apt réinstalle sans dégât)
# -----------------------------------------------------------------------------
axion_log "1/9 paquets de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  ufw fail2ban unattended-upgrades apt-listchanges \
  rsync gpg cron logrotate jq git

# -----------------------------------------------------------------------------
# 2. GARDE-FOU AVANT DURCISSEMENT SSH : sans clé publique installée, désactiver
#    le mot de passe ferme la porte du serveur. On refuse plutôt que de casser.
# -----------------------------------------------------------------------------
axion_log "2/9 vérification des clés SSH de l'administrateur"
admin_home="$(getent passwd "$ADMIN_USER" | cut -d: -f6 || true)"
[[ -n "$admin_home" ]] || axion_die "Utilisateur inconnu : $ADMIN_USER"
if [[ ! -s "$admin_home/.ssh/authorized_keys" ]]; then
  axion_die "Aucune clé publique dans $admin_home/.ssh/authorized_keys — installez-la AVANT (ssh-copy-id), sinon le durcissement vous verrouille dehors."
fi
chmod 700 "$admin_home/.ssh"
chmod 600 "$admin_home/.ssh/authorized_keys"

# -----------------------------------------------------------------------------
# 3. Durcissement SSH (06 §10.3) — fichier de surcharge, jamais d'édition en place
# -----------------------------------------------------------------------------
axion_log "3/9 durcissement SSH (clés uniquement, port $SSH_PORT)"
mkdir -p /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-axion.conf <<EOF
# Généré par infra/scripts/provision-vps.sh — applique 06 §10.3.
Port $SSH_PORT
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
chmod 644 /etc/ssh/sshd_config.d/99-axion.conf
# Ubuntu 22.10+ : le socket systemd peut imposer le port 22, on le neutralise.
if systemctl list-unit-files | grep -q '^ssh.socket'; then
  mkdir -p /etc/systemd/system/ssh.socket.d
  printf '[Socket]\nListenStream=\nListenStream=%s\n' "$SSH_PORT" >/etc/systemd/system/ssh.socket.d/99-axion.conf
  systemctl daemon-reload
fi
sshd -t || axion_die "Configuration SSH invalide — rien n'a été rechargé."
systemctl restart ssh 2>/dev/null || systemctl restart sshd
axion_log "3/9 SSH rechargé. NE FERMEZ PAS CETTE SESSION avant d'avoir testé : ssh -p $SSH_PORT $ADMIN_USER@<IP>"

# -----------------------------------------------------------------------------
# 4. fail2ban (06 §10.3)
# -----------------------------------------------------------------------------
axion_log "4/9 fail2ban"
cat >/etc/fail2ban/jail.d/axion-sshd.conf <<EOF
# Généré par infra/scripts/provision-vps.sh — applique 06 §10.3.
[sshd]
enabled  = true
port     = $SSH_PORT
backend  = systemd
maxretry = 4
findtime = 10m
bantime  = 1h
EOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

# -----------------------------------------------------------------------------
# 5. UFW : 80/443 + SSH, tout le reste refusé (06 §10.3)
#    Les ports Postgres/Redis/MinIO ne sont JAMAIS ouverts : accès par tunnel SSH.
# -----------------------------------------------------------------------------
axion_log "5/9 pare-feu UFW"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT"/tcp comment 'SSH (port non standard, 06 §10.3)'
ufw allow 80/tcp comment 'HTTP (redirection ACME/TLS, Caddy)'
ufw allow 443/tcp comment 'HTTPS (Caddy, unique point d entree)'
ufw allow 443/udp comment 'HTTP/3 (Caddy)'
ufw --force enable
ufw status verbose | sed 's/^/    /'

# -----------------------------------------------------------------------------
# 6. Docker CE + plugin Compose (02 §30.2)
# -----------------------------------------------------------------------------
axion_log "6/9 Docker + Compose"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
fi
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

compose_version="$(docker compose version --short 2>/dev/null || echo '0')"
axion_log "6/9 Docker Compose $compose_version"
case "$compose_version" in
  2.[0-9].*|2.1[0-9].*|2.2[0-3].*|0)
    axion_warn "Docker Compose $compose_version < 2.24 : les surcharges staging/prod utilisent les balises !reset/!override. Mettez à jour le plugin." ;;
esac

# -----------------------------------------------------------------------------
# 7. Isolation Docker par user namespaces (06 §10.3)
#    Conséquence assumée : les fichiers des volumes appartiennent à un UID
#    remappé ; c'est le comportement attendu, ne pas « corriger » avec chown.
# -----------------------------------------------------------------------------
axion_log "7/9 durcissement du démon Docker (userns-remap=$USERNS_REMAP)"
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  if [[ "$USERNS_REMAP" == "yes" ]]; then
    cat >/etc/docker/daemon.json <<'EOF'
{
  "userns-remap": "default",
  "live-restore": true,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
  else
    cat >/etc/docker/daemon.json <<'EOF'
{
  "live-restore": true,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
  fi
  systemctl restart docker
else
  axion_log "7/9 /etc/docker/daemon.json existe déjà — laissé intact (idempotence)."
fi
systemctl enable --now docker >/dev/null

# -----------------------------------------------------------------------------
# 7bis. RÉSEAU DE LIAISON staging → Caddy de prod (02 §11.2 + arbitrage A01,
#       DECISIONS.md 2026-08-27 « Cohabitation staging/prod : qui écoute sur 443 ? »)
#       UN SEUL Caddy lie 80/443 : celui de la pile de PROD. Il atteint les
#       services web de la pile de STAGING par ce réseau, déclaré `external` dans
#       les deux surcharges Compose. Il est créé ICI, hors Compose, pour qu’il
#       survive aux `down` et ne dépende pas de l’ordre de démarrage des piles.
#       Seuls Caddy et les 3 services web de staging y sont attachés : ni Postgres,
#       ni Redis, ni MinIO, ni le worker (02 §30.4-4 — un secret de staging ne peut
#       RIEN sur la prod).
# -----------------------------------------------------------------------------
axion_log "7bis/9 réseau de liaison Docker « $AXION_EDGE_NETWORK »"
if docker network inspect "$AXION_EDGE_NETWORK" >/dev/null 2>&1; then
  axion_log "7bis/9 réseau $AXION_EDGE_NETWORK déjà présent — laissé intact (idempotence)."
else
  docker network create --driver bridge "$AXION_EDGE_NETWORK" >/dev/null
  axion_log "7bis/9 réseau $AXION_EDGE_NETWORK créé."
fi

for vol in "${AXION_SHARED_VOLUMES[@]}"; do
  if docker volume inspect "$vol" >/dev/null 2>&1; then
    axion_log "7bis/9 volume partagé $vol déjà présent — laissé intact (idempotence)."
  else
    docker volume create "$vol" >/dev/null
    axion_log "7bis/9 volume partagé $vol créé."
  fi
done

# -----------------------------------------------------------------------------
# 8. Mises à jour de sécurité automatiques (06 §10.3)
# -----------------------------------------------------------------------------
axion_log "8/9 unattended-upgrades"
cat >/etc/apt/apt.conf.d/51axion-unattended <<'EOF'
// Généré par infra/scripts/provision-vps.sh — applique 06 §10.3.
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
// Pas de redémarrage automatique : une coupure ne doit jamais tomber pendant
// une journée de collecte client (02 §11.2).
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
EOF
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null

# -----------------------------------------------------------------------------
# 9. Arborescence d'exploitation + .env VIDE DE SECRETS (02 §30.4-2)
# -----------------------------------------------------------------------------
axion_log "9/9 arborescence /opt/axion-audit et un .env PAR ENVIRONNEMENT"
mkdir -p "$AXION_ROOT" "$AXION_LOG_DIR" \
         /var/backups/axion/postgres /var/backups/axion/pgbackrest-export \
         /var/backups/axion/minio/mirror /var/backups/axion/minio/archives \
         /var/backups/axion/caddy/archives
chown -R root:root "$AXION_ROOT" "$AXION_LOG_DIR" /var/backups/axion
chmod 750 "$AXION_ROOT" "$AXION_LOG_DIR"
chmod 700 /var/backups/axion

ENV_EXAMPLE="${ENV_EXAMPLE:-$AXION_INFRA_DIR/../.env.example}"
[[ -r "$ENV_EXAMPLE" ]] || axion_die "Modèle introuvable : $ENV_EXAMPLE (attendu : .env.example à la racine du dépôt)"

# ---------------------------------------------------------------------------
# CONVENTION DE CHEMIN DU .env — UNE SEULE, ARBITRÉE (revue croisée M-11) :
#         /opt/axion-audit/<env>/.env      avec <env> ∈ { staging, prod }
# Le 02 §30.4-4 impose des valeurs DISTINCTES par environnement : un fichier
# unique à la racine ne peut pas porter deux bases, deux jeux de clés JWT et deux
# jeux de buckets. La forme par environnement est donc la SEULE valide ; c’est
# aussi celle qu’utilisent deploy.sh et le runbook.
# On ne crée VOLONTAIREMENT PAS /opt/axion-audit/.env : son existence ferait
# silencieusement réussir un script appelé sans argument, sur un modèle plein de
# __CHANGEME__ — c’est-à-dire la panne la plus coûteuse à diagnostiquer.
# ---------------------------------------------------------------------------
AXION_ENVS=(staging prod)
for env_name in "${AXION_ENVS[@]}"; do
  env_dir="$AXION_ROOT/$env_name"
  mkdir -p "$env_dir"
  chown root:root "$env_dir"
  chmod 700 "$env_dir"
  if [[ ! -f "$env_dir/.env" ]]; then
    cp "$ENV_EXAMPLE" "$env_dir/.env"
    axion_log "Fichier $env_dir/.env créé depuis $ENV_EXAMPLE (root, chmod 600)."
  else
    axion_log "Fichier $env_dir/.env déjà présent — contenu intact."
  fi
  chown root:root "$env_dir/.env"
  chmod 600 "$env_dir/.env"
done

# Reliquat d’une version antérieure du script : on ne le SUPPRIME pas (il peut
# contenir des secrets posés à la main), mais on le signale fort — tant qu’il
# existe, un script appelé sans argument le chargera au lieu d’échouer.
if [[ -e "$AXION_ROOT/.env" ]]; then
  chown root:root "$AXION_ROOT/.env"
  chmod 600 "$AXION_ROOT/.env"
  axion_warn "$AXION_ROOT/.env existe encore : chemin OBSOLÈTE (convention = $AXION_ROOT/<env>/.env)."
  axion_warn "Reportez son contenu dans staging/.env ou prod/.env, puis supprimez-le à la main."
fi

# -----------------------------------------------------------------------------
# ARRÊT VOLONTAIRE : les secrets se posent À LA MAIN (02 §30.4-2), jamais ici.
# -----------------------------------------------------------------------------
remaining="$(grep -c '__CHANGEME__' "$AXION_ROOT/prod/.env" || true)"
cat <<EOF

=============================================================================
PROVISIONNEMENT TECHNIQUE TERMINÉ — LE SERVEUR N'EST PAS ENCORE EXPLOITABLE.
=============================================================================
Ce script ne pose AUCUN secret (02 §30.4-2 : « provisionné à la main par SSH,
pas par la CI »). Il reste ${remaining} valeur(s) « __CHANGEME__ » à remplir.

À FAIRE MAINTENANT, DANS CET ORDRE (détail : infra/README.md) :
  1. Tester le nouvel accès SSH DEPUIS UN AUTRE TERMINAL, sans fermer celui-ci :
         ssh -p $SSH_PORT $ADMIN_USER@<IP>
  2. Éditer les secrets à la main :
         sudo nano $AXION_ROOT/prod/.env       (déjà en root:600)
         sudo nano $AXION_ROOT/staging/.env    (VALEURS DISTINCTES, 02 §30.4-4)
     Génération : openssl rand -hex 64  ·  openssl rand -base64 32
     Rappel 02 §30.4-4 : staging et prod ont des valeurs DISTINCTES.
  3. Poser la clé SSH de la Storage Box (\${STORAGE_BOX_SSH_KEY_PATH}) et tester :
         ssh -p \${STORAGE_BOX_PORT} -i \${STORAGE_BOX_SSH_KEY_PATH} \${STORAGE_BOX_USER}@\${STORAGE_BOX_HOST} ls
  4. Sauvegarder le .env CHIFFRÉ dans la Storage Box (02 §30.4-2 — sans lui, un
     PRA restaure une infra sans ses clés) :
         gpg --symmetric --cipher-algo AES256 -o /tmp/env.gpg $AXION_ROOT/prod/.env
  4bis. CRÉER LES ENREGISTREMENTS DNS AVANT TOUT DÉMARRAGE : le domaine de prod
     ET le sous-domaine de staging (02 §11.2) doivent pointer sur ce VPS. Sans
     eux, l’émission ACME échoue et Caddy retente en boucle.
  5. Déployer, puis créer la stanza pgBackRest, puis installer les tâches :
         infra/scripts/deploy.sh --env <staging|prod> --tag <IMAGE_TAG>
         docker compose ... exec postgres pgbackrest --stanza=\$PGBACKREST_STANZA stanza-create
         # ^ POINT DE CONTRÔLE N°1 DE LA PORTE P-A côté sauvegardes : sans
         #   cette stanza, archive_command échoue et les WAL s’accumulent.
         infra/scripts/install-cron.sh
=============================================================================
EOF

axion_log "=== Provisionnement du VPS — terminé ==="
exit 0
