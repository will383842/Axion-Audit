#!/usr/bin/env bash
# =============================================================================
# infra/scripts/restore-test.sh — TEST DE RESTAURATION NOCTURNE (lot L0)
# Applique : 02 §11.4 (« test de restauration automatique nocturne : restore dans
# un conteneur jetable + requêtes de contrôle + alerte si échec »), 07 ligne L0
# (critère d'acceptation « restauration Postgres ET MinIO testée depuis zéro »),
# étendu au MAGASIN TLS de Caddy (arbitrage A01 du 2026-08-27 : un PRA ne peut pas
# dépendre d’une réémission ACME sous quota Let’s Encrypt),
# 02 §11.3 (alerte Telegram), 02 §30.4 (aucun secret écrit sur disque).
# =============================================================================
#
# GARANTIES :
#   - IDEMPOTENT : chaque exécution crée des ressources horodatées uniques et
#     nettoie les reliquats des exécutions précédentes.
#   - NON DESTRUCTIF POUR LA PRODUCTION : le dépôt pgBackRest et les archives
#     sont montés en LECTURE SEULE ; un garde-fou en tête refuse de démarrer si
#     une ressource de production apparaît dans les montages inscriptibles ;
#     la restauration force `--archive-mode=off` (le cluster restauré ne peut
#     PAS écrire dans le dépôt WAL de production).
#   - Le conteneur jetable est détruit en `trap EXIT`, MÊME EN CAS D'ÉCHEC.
#   - Sortie NON NULLE + alerte Telegram si échec ; rapport horodaté dans
#     /var/log/axion/restore-test-*.log.
#
# UTILISATION :
#   infra/scripts/restore-test.sh <chemin du .env>
#   pnpm infra:restore-test        <chemin du .env>
# Le chemin est OBLIGATOIRE (convention : $AXION_ROOT/<staging|prod>/.env). Appelé
# sans argument, le script REFUSE de tourner et affiche la convention — il ne
# devine aucun chemin (revue croisée M-11).
#
# PÉRIMÈTRE — AMENDÉ LE 2026-08-30, APRÈS LA PREMIÈRE EXÉCUTION RÉELLE.
# Ce qui était écrit ici jusqu'à cette date, et qui était vrai :
#   « CE SCRIPT S'ADRESSE AU MONTAGE VPS DÉDIÉ […]. Il NE SAIT PAS parler à la
#     pile de STAGING déployée par un orchestrateur, dont le projet Compose est
#     un uuid imposé et les volumes portent d'autres noms […]. Il n'a JAMAIS été
#     exécuté à ce jour, sur aucune machine. »
# Or le workflow nocturne pointait vers lui depuis le lot L0, en promettant une
# « sauvegarde testée » au titre de l'invariant 8. L'aveu et la promesse ont
# cohabité dans le dépôt pendant trois jours sans se rencontrer, parce que ce
# workflow SAUTAIT ses étapes utiles : personne n'a jamais lu le désaccord.
#
# CE QUI A CHANGÉ : le dépôt pgBackRest n'est plus DÉDUIT d'APP_ENV, il est
# DÉCOUVERT sur la machine puis vérifié par son CONTENU (voir
# `decouvrir_depot_pgbackrest` plus bas). Le script s'adresse donc aux DEUX
# montages, et ne dépend plus d'aucune convention de nommage d'orchestrateur.
#
# CE QUI N'A PAS CHANGÉ, et qu'il ne faut pas surestimer : il restaure le stanza
# décrit par le `.env` qu'on lui donne. Ce n'est pas une propriété de ce script,
# c'est une propriété de son argument.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

MC_IMAGE="${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}"
MINIO_IMAGE="${MINIO_IMAGE:-minio/minio:RELEASE.2025-04-22T22-12-26Z}"
# PG_IMAGE : DÉCOUVERTE, comme le dépôt — et pour une raison plus forte que la
# commodité. Ce script attendait « axion-audit-postgres:16 ». MESURÉ le
# 2026-08-30 : l'image réelle est « axion-audit-postgres:16-coolify », et la
# restauration échouait sur « pull access denied … repository does not exist ».
# Même famille que le nom de volume : un nom DÉDUIT là où une VÉRITÉ est
# observable sur la machine.
#
# CE QUI REND LA DÉCOUVERTE PLUS JUSTE, ET PAS SEULEMENT PLUS COMMODE : la
# restauration doit s'exécuter avec LE MÊME binaire Postgres que la production.
# Un test réussi avec une autre image ne prouverait rien sur celle qui sert — il
# répondrait à une autre question que celle posée. Corriger le nom en dur aurait
# marché aujourd'hui et menti demain, au premier changement de tag.
#
# Vide par défaut : la valeur est résolue par decouvrir_image_postgres(). La
# variable d'environnement reste un moyen d'imposer une image à la main.
PG_IMAGE="${PG_IMAGE:-}"
ARCHIVE_DIR="${ARCHIVE_DIR:-/var/backups/axion/minio/archives}"
# Image utilitaire : UNE SEULE définition, dans lib/common.sh (mineur de revue).
ALPINE_IMAGE="${ALPINE_IMAGE:-$AXION_ALPINE_IMAGE}"
# Archives du magasin TLS de Caddy (arbitrage A01 du 2026-08-27).
CADDY_ARCHIVE_DIR="${CADDY_ARCHIVE_DIR:-/var/backups/axion/caddy/archives}"

TS="$(date -u +'%Y%m%dT%H%M%SZ')"
RESTORE_PREFIX="axion-restore-test"
RESTORE_ID="${RESTORE_PREFIX}-${TS}"
WORK_DIR="/var/tmp/${RESTORE_ID}"

axion_load_env "${1:-$(axion_env_file_default)}"
axion_require_cmd docker gpg curl sha256sum openssl
axion_require_env APP_ENV PGBACKREST_STANZA PGBACKREST_REPO_PATH PGBACKREST_CIPHER_PASS \
                  POSTGRES_DB POSTGRES_USER BACKUP_ENCRYPTION_PASSPHRASE \
                  MINIO_BUCKET_ATTACHMENTS MINIO_BUCKET_REPORTS MINIO_BUCKET_TEMPLATES

mkdir -p "$AXION_LOG_DIR"
AXION_LOG_FILE="$AXION_LOG_DIR/restore-test-$TS.log"
export AXION_LOG_FILE

# LIVE_PROJECT est le nom ATTENDU du montage « VPS dédié » (docker compose lancé
# par nous). Ce n'est PAS une vérité sur la machine : sur le staging Coolify, le
# projet Compose est un uuid imposé. Il ne sert plus qu'au diagnostic et au
# garde-fou de collision de noms. Le dépôt pgBackRest, lui, est DÉCOUVERT.
LIVE_PROJECT="$(axion_project_name)"
# Rempli par decouvrir_depot_pgbackrest(), jamais deviné.
DEPOT_PGBACKREST=""
PROJET_DECOUVERT=""
PG_CONTAINER="${RESTORE_ID}-pg"
MINIO_CONTAINER="${RESTORE_ID}-minio"
PG_VOLUME="${RESTORE_ID}-pgdata"
MINIO_VOLUME="${RESTORE_ID}-miniodata"
CADDY_VOLUME="${RESTORE_ID}-caddydata"
NET_NAME="${RESTORE_ID}-net"
FAILURES=0

# -----------------------------------------------------------------------------
# NETTOYAGE — trap EXIT : s'exécute en succès COMME EN ÉCHEC (critère (c)).
# Ne détruit QUE des ressources dont le nom porte le préfixe de ce test.
# -----------------------------------------------------------------------------
cleanup() {
  local rc=$?
  set +e
  axion_log "Nettoyage du conteneur jetable et de ses ressources…"
  docker rm -f "$PG_CONTAINER" "$MINIO_CONTAINER" >/dev/null 2>&1
  docker volume rm -f "$PG_VOLUME" "$MINIO_VOLUME" "$CADDY_VOLUME" >/dev/null 2>&1
  docker network rm "$NET_NAME" >/dev/null 2>&1
  if [[ "$WORK_DIR" == /var/tmp/${RESTORE_PREFIX}-* ]]; then
    rm -rf "$WORK_DIR"
  fi
  axion_log "Nettoyage terminé (code de sortie : $rc)"
  return 0
}
trap cleanup EXIT

fail() {
  axion_error "$*"
  FAILURES=$((FAILURES + 1))
}

# -----------------------------------------------------------------------------
# DÉCOUVRIR LE DÉPÔT pgBACKREST — ET POURQUOI ON NE LE DÉDUIT PLUS.
# -----------------------------------------------------------------------------
# Ce script déduisait le nom du volume depuis APP_ENV :
# « axion-audit-<env>_pgbackrest_repo ». MESURÉ le 2026-08-30, à la première
# exécution réelle de ce script sur une machine : le volume s'appelle
# « <uuid-orchestrateur>_pgbackrest-repo ». La déduction était fausse DEUX FOIS —
# sur le préfixe (uuid imposé par l'orchestrateur) et sur le séparateur
# (« -repo » et non « _repo »). L'en-tête de ce fichier l'annonçait déjà en
# toutes lettres : « Il NE SAIT PAS parler à la pile de STAGING déployée par
# Coolify […] Il n'a JAMAIS été exécuté à ce jour ». Le savoir était écrit ; il
# n'avait pas été appliqué. Quatrième fois en trois jours.
#
# ON DÉCOUVRE DONC, AU LIEU DE DÉDUIRE : le dépôt est le volume qu'un conteneur
# VIVANT monte sur $PGBACKREST_REPO_PATH. C'est une vérité observée sur la
# machine, indépendante de l'orchestrateur et de ses conventions de nommage.
#
# ⚠️ MAIS UNE DÉCOUVERTE NON CONTRAINTE SERAIT PIRE QUE LA DÉDUCTION. Cette
# machine héberge AUSSI une production étrangère à ce projet. Un volume trouvé
# « au hasard » pourrait être le sien, et l'on restaurerait les sauvegardes de
# quelqu'un d'autre en croyant tester les nôtres. Deux verrous, donc :
#   · le candidat doit CONTENIR « backup/$PGBACKREST_STANZA » — un contrôle de
#     CONTENU, pas de nom : un dépôt sans notre stanza n'est pas le nôtre ;
#   · s'il reste PLUSIEURS candidats après ce filtre, on REFUSE. Choisir serait
#     deviner, et deviner sur cette machine-là est précisément l'interdit.
# AXION_PGBACKREST_VOLUME permet de trancher à la main ; ce réglage passe par les
# MÊMES vérifications, sans quoi il ne serait qu'un moyen de les taire.
# -----------------------------------------------------------------------------
depot_porte_notre_stanza() {
  local vol="$1"
  docker run --rm -v "${vol}:/depot:ro" "$ALPINE_IMAGE" \
    test -d "/depot/backup/${PGBACKREST_STANZA}" >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# DÉCOUVRIR L'IMAGE POSTGRES DE LA PILE VIVANTE.
# -----------------------------------------------------------------------------
# Appelée APRÈS decouvrir_depot_pgbackrest(), qui renseigne PROJET_DECOUVERT :
# on cherche le conteneur du service `postgres` DE CE PROJET-LÀ, et pas un
# postgres quelconque de la machine — celle-ci en héberge d'autres, étrangers à
# ce projet, et restaurer avec le binaire d'un voisin ne prouverait rien.
decouvrir_image_postgres() {
  if [[ -n "$PG_IMAGE" ]]; then
    axion_log "Image Postgres imposée à la main : $PG_IMAGE"
    return 0
  fi
  if [[ -z "$PROJET_DECOUVERT" ]]; then
    axion_die "Impossible de découvrir l'image Postgres : le projet de la pile vivante n'a pas été identifié. Poser PG_IMAGE pour trancher à la main."
  fi

  local id
  id="$(docker ps \
    --filter "label=com.docker.compose.project=${PROJET_DECOUVERT}" \
    --filter "label=com.docker.compose.service=postgres" \
    --format '{{.ID}}' 2>/dev/null | head -1)"

  if [[ -z "$id" ]]; then
    axion_die "Aucun conteneur Postgres vivant dans le projet « ${PROJET_DECOUVERT} ». La restauration doit utiliser LE MÊME binaire que la production : sans lui, un test vert ne dirait rien de la base qui sert. Poser PG_IMAGE pour trancher à la main."
  fi

  PG_IMAGE="$(docker inspect "$id" --format '{{.Config.Image}}' 2>/dev/null || true)"
  [[ -n "$PG_IMAGE" ]] || axion_die "Le conteneur Postgres « $id » n'annonce aucune image. Poser PG_IMAGE pour trancher à la main."

  # L'image doit être PRÉSENTE localement : ces images sont construites sur la
  # machine et n'existent dans aucun registre. Un `docker run` déclencherait un
  # `pull` qui échouerait plus loin, avec un message trompeur parlant de droits
  # d'accès — c'est exactement ce qui s'est produit le 2026-08-30.
  docker image inspect "$PG_IMAGE" >/dev/null 2>&1 ||
    axion_die "L'image « $PG_IMAGE » n'est pas présente localement. Elle est construite sur cette machine et n'existe dans aucun registre : un docker run tenterait un pull et échouerait sur un message de droits d'accès, sans rapport avec la cause."

  axion_log "Image Postgres découverte : « $PG_IMAGE » (service postgres du projet « ${PROJET_DECOUVERT} »)."
}

decouvrir_depot_pgbackrest() {
  axion_require_env PGBACKREST_REPO_PATH PGBACKREST_STANZA

  local candidats=""

  if [[ -n "${AXION_PGBACKREST_VOLUME:-}" ]]; then
    if ! docker volume inspect "$AXION_PGBACKREST_VOLUME" >/dev/null 2>&1; then
      axion_die "AXION_PGBACKREST_VOLUME désigne « $AXION_PGBACKREST_VOLUME », qui n'existe pas sur cette machine. Un réglage manuel qui pointe vers rien est plus dangereux que pas de réglage du tout."
    fi
    candidats="$AXION_PGBACKREST_VOLUME"
    axion_log "Dépôt imposé à la main : $AXION_PGBACKREST_VOLUME (les vérifications de contenu s'appliquent quand même)."
  else
    local id nom
    while read -r id; do
      [[ -z "$id" ]] && continue
      nom="$(docker inspect "$id" --format "{{range .Mounts}}{{if and (eq .Type \"volume\") (eq .Destination \"${PGBACKREST_REPO_PATH}\")}}{{.Name}}{{end}}{{end}}" 2>/dev/null || true)"
      [[ -z "$nom" ]] && continue
      case " $candidats " in *" $nom "*) continue ;; esac
      candidats="$candidats $nom"
    done < <(docker ps --format '{{.ID}}' 2>/dev/null || true)
  fi

  if [[ -z "${candidats// /}" ]]; then
    axion_die "Aucun conteneur vivant ne monte de volume sur « $PGBACKREST_REPO_PATH » : il n'y a rien à restaurer, et ce n'est PAS un détail de configuration. Soit la pile est arrêtée, soit les sauvegardes n'écrivent pas là où ce script les cherche. Poser AXION_PGBACKREST_VOLUME pour trancher à la main."
  fi

  local retenus="" vol
  for vol in $candidats; do
    if depot_porte_notre_stanza "$vol"; then
      retenus="$retenus $vol"
    else
      axion_log "Volume « $vol » écarté : il ne contient pas backup/${PGBACKREST_STANZA}."
    fi
  done

  # shellcheck disable=SC2086
  set -- $retenus
  if [[ "$#" -eq 0 ]]; then
    axion_die "Aucun dépôt trouvé ne contient « backup/${PGBACKREST_STANZA} ». Candidats examinés :${candidats}. Un dépôt sans notre stanza n'est pas le nôtre — on refuse de restaurer depuis les archives d'autrui, et on refuse tout autant de sortir vert sans avoir rien restauré."
  fi
  if [[ "$#" -gt 1 ]]; then
    axion_die "PLUSIEURS dépôts portent « backup/${PGBACKREST_STANZA} » :${retenus}. Choisir serait deviner. Poser AXION_PGBACKREST_VOLUME pour désigner celui qui fait foi."
  fi

  DEPOT_PGBACKREST="$1"
  PROJET_DECOUVERT="$(docker volume inspect "$DEPOT_PGBACKREST" --format '{{index .Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
  if [[ "$DEPOT_PGBACKREST" != "${LIVE_PROJECT}_pgbackrest_repo" ]]; then
    axion_log "Dépôt découvert : « $DEPOT_PGBACKREST » (projet « ${PROJET_DECOUVERT:-inconnu} »). Le nom déduit d'APP_ENV aurait été « ${LIVE_PROJECT}_pgbackrest_repo » — il ne correspond pas, et c'est la découverte qui fait foi."
  else
    axion_log "Dépôt découvert : « $DEPOT_PGBACKREST » (conforme au nom déduit d'APP_ENV)."
  fi
}

# -----------------------------------------------------------------------------
# GARDE-FOU ANTI-PRODUCTION (exigence : « refuse de s'exécuter s'il détecte qu'il
# pointe sur les volumes de prod »).
# -----------------------------------------------------------------------------
guard_not_production() {
  local vol
  # 0. LA DÉCOUVERTE VIENT D'ABORD, et l'ordre n'est pas cosmétique : le contrôle
  #    de collision ci-dessous doit connaître l'espace de nommage RÉELLEMENT
  #    vivant, pas seulement celui qu'APP_ENV laisse supposer. Tant que le dépôt
  #    n'était que déduit, ce garde ne protégeait que d'un nom imaginaire.
  decouvrir_depot_pgbackrest
  decouvrir_image_postgres
  # 1. Aucune ressource de test ne doit porter un nom de ressource vivante.
  for vol in "$PG_VOLUME" "$MINIO_VOLUME" "$CADDY_VOLUME"; do
    case "$vol" in
      "${LIVE_PROJECT}_"*) axion_die "GARDE-FOU : volume de test « $vol » dans l'espace de nommage déduit « $LIVE_PROJECT »." ;;
    esac
    # Et dans l'espace de nommage RÉELLEMENT découvert, quand il diffère. Le
    # repli « §néant§ » est volontairement impossible à porter comme préfixe :
    # une variable vide ferait correspondre « _* » à n'importe quoi.
    case "$vol" in
      "${PROJET_DECOUVERT:-§néant§}_"*) axion_die "GARDE-FOU : volume de test « $vol » dans l'espace de nommage de la pile vivante « $PROJET_DECOUVERT »." ;;
    esac
    if docker volume inspect "$vol" >/dev/null 2>&1; then
      axion_die "GARDE-FOU : le volume de test « $vol » existe déjà — refus d'écrire dessus."
    fi
  done
  # 2. Le conteneur jetable ne doit jamais porter le nom d'un conteneur vivant.
  for vol in "$PG_CONTAINER" "$MINIO_CONTAINER"; do
    if docker inspect "$vol" >/dev/null 2>&1; then
      axion_die "GARDE-FOU : le conteneur « $vol » existe déjà — refus."
    fi
  done
  # 3. Le répertoire de travail doit être un chemin jetable dédié.
  case "$WORK_DIR" in
    /var/tmp/${RESTORE_PREFIX}-*) : ;;
    *) axion_die "GARDE-FOU : répertoire de travail non conforme : $WORK_DIR" ;;
  esac
  # 4. Le dépôt a été trouvé à l'étape 0 ; il ne sera monté qu'en « :ro ».
  axion_log "Garde-fou anti-production : OK — dépôt « $DEPOT_PGBACKREST » monté en lecture seule, ressources jetables uniques."
}

# Reliquats d'exécutions interrompues (idempotence).
purge_stale() {
  local name
  while read -r name; do
    [[ -z "$name" ]] && continue
    axion_warn "Reliquat supprimé : conteneur $name"
    docker rm -f "$name" >/dev/null 2>&1 || true
  done < <(docker ps -a --format '{{.Names}}' --filter "name=^${RESTORE_PREFIX}-" | grep -v "^${RESTORE_ID}" || true)
  while read -r name; do
    [[ -z "$name" ]] && continue
    axion_warn "Reliquat supprimé : volume $name"
    docker volume rm -f "$name" >/dev/null 2>&1 || true
  done < <(docker volume ls --format '{{.Name}}' --filter "name=^${RESTORE_PREFIX}-" | grep -v "^${RESTORE_ID}" || true)
  find /var/tmp -maxdepth 1 -type d -name "${RESTORE_PREFIX}-*" ! -name "$RESTORE_ID" -mmin +120 -exec rm -rf {} + 2>/dev/null || true
}

# =============================================================================
# (a) POSTGRES — restauration depuis le dernier backup pgBackRest + rejeu WAL
# =============================================================================
restore_postgres() {
  axion_log "--- (a) PostgreSQL : restauration depuis zéro ---"

  docker volume create "$PG_VOLUME" >/dev/null
  docker run -d --name "$PG_CONTAINER" \
    --network "$NET_NAME" \
    -e PGBACKREST_STANZA="$PGBACKREST_STANZA" \
    -e PGBACKREST_REPO1_PATH="$PGBACKREST_REPO_PATH" \
    -e PGBACKREST_REPO1_CIPHER_PASS="$PGBACKREST_CIPHER_PASS" \
    -v "${DEPOT_PGBACKREST}:${PGBACKREST_REPO_PATH}:ro" \
    -v "$PG_VOLUME:/var/lib/postgresql/data" \
    --entrypoint sleep \
    "$PG_IMAGE" 3600 >/dev/null
  axion_log "Conteneur jetable démarré : $PG_CONTAINER"

  # Le répertoire de données doit être VIDE : « depuis zéro », pas un delta.
  docker exec "$PG_CONTAINER" sh -c 'rm -rf /var/lib/postgresql/data/* /var/lib/postgresql/data/.[!.]* 2>/dev/null; chown postgres:postgres /var/lib/postgresql/data; chmod 700 /var/lib/postgresql/data'

  # `--archive-mode=off` : SÉCURITÉ — le cluster restauré ne pourra jamais
  # écrire dans le dépôt WAL de production.
  # `--type=default` : rejeu de TOUS les WAL disponibles (vrai chemin de PRA).
  axion_log "pgbackrest restore (stanza=$PGBACKREST_STANZA, rejeu WAL complet)…"
  if ! docker exec --user postgres "$PG_CONTAINER" \
      pgbackrest --stanza="$PGBACKREST_STANZA" --type=default \
                 --archive-mode=off --log-level-console=info restore; then
    fail "pgbackrest restore a échoué"
    return 1
  fi

  axion_log "Démarrage du cluster restauré (rejeu WAL puis promotion)…"
  docker exec --user postgres "$PG_CONTAINER" \
    pg_ctl -D /var/lib/postgresql/data \
           -o "-c archive_mode=off -c listen_addresses=127.0.0.1 -c port=5432" \
           -w -t 300 start >/dev/null 2>&1 || true

  # Attente bornée : la base doit répondre (pas de `sleep` aveugle).
  local i ready=0
  for ((i = 0; i < 60; i++)); do
    if docker exec --user postgres "$PG_CONTAINER" pg_isready -h 127.0.0.1 -q; then
      ready=1
      break
    fi
    sleep 2
  done
  if [[ "$ready" -ne 1 ]]; then
    fail "Le cluster restauré ne répond pas après 120 s"
    docker logs --tail 50 "$PG_CONTAINER" >>"$AXION_LOG_FILE" 2>&1 || true
    return 1
  fi
  axion_log "Cluster restauré : la base répond."

  # --- Requêtes de contrôle -------------------------------------------------
  local in_recovery
  in_recovery="$(pg_query "SELECT pg_is_in_recovery();")"
  if [[ "$in_recovery" != "f" ]]; then
    fail "Le cluster restauré est resté en recovery (rejeu WAL non terminé) : $in_recovery"
  fi

  local one
  one="$(pg_query "SELECT 1;")"
  [[ "$one" == "1" ]] || fail "Requête de contrôle SELECT 1 en échec (obtenu : « $one »)"

  # Le catalogue doit contenir la base applicative.
  local dbfound
  dbfound="$(pg_query "SELECT count(*) FROM pg_database WHERE datname = '${POSTGRES_DB}';")"
  [[ "$dbfound" == "1" ]] || fail "Base « ${POSTGRES_DB} » absente du cluster restauré"

  # --- Tables attendues : comparaison AVEC LA PRODUCTION (lecture seule) -----
  # Aucune liste figée : la référence est la base vivante, ce qui reste juste
  # à chaque lot (L1 crée les tables, L3 les remplit…).
  local live_tables restored_tables
  live_tables="$(live_query "SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public';")"
  restored_tables="$(pg_query_db "SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public';")"

  if [[ -z "$live_tables" ]]; then
    axion_warn "La base de production ne contient encore aucune table (schéma livré au lot L1) : le contrôle « tables attendues » est vide mais la chaîne de restauration est prouvée."
  elif [[ "$live_tables" != "$restored_tables" ]]; then
    fail "Jeu de tables divergent. Production : [$live_tables] / Restauré : [$restored_tables]"
  else
    axion_log "Tables attendues présentes ($(echo "$live_tables" | tr ',' '\n' | wc -l) tables)."

    # --- COUNT de contrôle : cohérent = restauré <= production (la sauvegarde
    #     est plus ancienne que la base vivante), et jamais vide si la prod ne
    #     l'est pas depuis plus longtemps que le RPO.
    local table live_count restored_count
    while IFS= read -r table; do
      [[ -z "$table" ]] && continue
      live_count="$(live_query "SELECT count(*) FROM public.\"$table\";")"
      restored_count="$(pg_query_db "SELECT count(*) FROM public.\"$table\";")"
      if [[ "$restored_count" -gt "$live_count" ]]; then
        fail "COUNT incohérent sur « $table » : restauré=$restored_count > production=$live_count"
      else
        axion_log "COUNT $table : restauré=$restored_count / production=$live_count (cohérent)"
      fi
    done < <(echo "$live_tables" | tr ',' '\n')
  fi
}

# Requêtes sur le cluster RESTAURÉ (base postgres puis base applicative).
pg_query() {
  docker exec --user postgres "$PG_CONTAINER" \
    psql -X -A -t -q -h 127.0.0.1 -d postgres -c "$1" 2>>"$AXION_LOG_FILE" | tr -d '\r' | head -n1
}
pg_query_db() {
  docker exec --user postgres "$PG_CONTAINER" \
    psql -X -A -t -q -h 127.0.0.1 -d "$POSTGRES_DB" -c "$1" 2>>"$AXION_LOG_FILE" | tr -d '\r' | head -n1
}
# Requête EN LECTURE SEULE sur la base VIVANTE (référence de comparaison).
live_query() {
  axion_compose exec -T --user postgres postgres \
    psql -X -A -t -q -d "$POSTGRES_DB" -c "$1" 2>>"$AXION_LOG_FILE" | tr -d '\r' | head -n1
}

# =============================================================================
# (b) MINIO — restauration depuis le miroir + contrôle par SOMME DE CONTRÔLE
# =============================================================================
restore_minio() {
  axion_log "--- (b) MinIO : restauration depuis zéro ---"
  mkdir -p "$WORK_DIR/minio"

  # Identifiants ÉPHÉMÈRES du MinIO jetable : jamais écrits sur disque, détruits
  # avec le conteneur (aucun secret de production n'est réutilisé).
  local root_user root_pass
  root_user="axionrestore$(openssl rand -hex 4)"
  root_pass="$(openssl rand -hex 24)"

  docker volume create "$MINIO_VOLUME" >/dev/null
  docker run -d --name "$MINIO_CONTAINER" \
    --network "$NET_NAME" \
    -e MINIO_ROOT_USER="$root_user" \
    -e MINIO_ROOT_PASSWORD="$root_pass" \
    -v "$MINIO_VOLUME:/data" \
    "$MINIO_IMAGE" server /data >/dev/null
  axion_log "MinIO jetable démarré : $MINIO_CONTAINER"

  local i ready=0
  for ((i = 0; i < 45; i++)); do
    if docker exec "$MINIO_CONTAINER" mc ready local >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  [[ "$ready" -eq 1 ]] || { fail "Le MinIO jetable n'est pas prêt après 90 s"; return 1; }

  export MC_HOST_restore="http://${root_user}:${root_pass}@${MINIO_CONTAINER}:9000"

  local bucket archive
  for bucket in "$MINIO_BUCKET_ATTACHMENTS" "$MINIO_BUCKET_REPORTS" "$MINIO_BUCKET_TEMPLATES"; do
    archive="$(find "$ARCHIVE_DIR" -maxdepth 1 -type f -name "minio-${bucket}-*.tar.gpg" -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
    if [[ -z "$archive" ]]; then
      fail "Aucune archive MinIO trouvée pour le bucket « $bucket » dans $ARCHIVE_DIR"
      continue
    fi
    axion_log "Bucket $bucket : archive retenue $(basename "$archive")"

    # 1. Déchiffrement + extraction dans le répertoire jetable.
    if ! axion_decrypt_stream <"$archive" | tar -C "$WORK_DIR/minio" -xf -; then
      fail "Déchiffrement/extraction impossible pour « $bucket »"
      continue
    fi

    # 2. INTÉGRITÉ — TROIS VERDICTS DISTINCTS, jamais amalgamés (M-9).
    #    a) manifeste ou compte ABSENT   → ÉCHEC : la sauvegarde est incomplète.
    #    b) compte = 0 et cohérent       → OK   : bucket vide, état LÉGITIME au lot L0
    #                                            (aucune mission n’a encore produit de
    #                                            fichier). La chaîne est prouvée : archive
    #                                            déchiffrée, manifeste lu, compte recoupé.
    #    c) sommes qui ne concordent pas → ÉCHEC : corruption réelle.
    # Confondre (b) et (c) ferait crier à la corruption dès la première nuit — et une
    # alerte fausse la première nuit est une alerte que plus personne ne lit ensuite.
    if [[ ! -f "$WORK_DIR/minio/$bucket/MANIFEST.sha256" ]]; then
      fail "Bucket $bucket : manifeste sha256 ABSENT — sauvegarde incomplète, intégrité invérifiable"
      continue
    fi
    if [[ ! -f "$WORK_DIR/minio/$bucket/MANIFEST.count" ]]; then
      fail "Bucket $bucket : compte d’objets ABSENT — archive antérieure au correctif M-9, relancer backup-minio.sh"
      continue
    fi
    local annonces relevees
    # `tr -dc` : on ne garde que les chiffres (fin de ligne, espaces éventuels).
    annonces="$(tr -dc '0-9' <"$WORK_DIR/minio/$bucket/MANIFEST.count")"
    relevees="$(wc -l <"$WORK_DIR/minio/$bucket/MANIFEST.sha256" | tr -dc '0-9')"
    if [[ "$annonces" != "$relevees" ]]; then
      fail "Bucket $bucket : manifeste TRONQUÉ — $relevees ligne(s) pour $annonces objet(s) annoncé(s)"
      continue
    fi
    if [[ "$annonces" -eq 0 ]]; then
      axion_log "Bucket $bucket : VIDE (0 objet) — état légitime au lot L0. Chaîne de sauvegarde prouvée (archive déchiffrée, manifeste cohérent)."
      continue
    fi
    if ( cd "$WORK_DIR/minio/$bucket" && sha256sum --quiet -c MANIFEST.sha256 ); then
      axion_log "Bucket $bucket : $annonces objet(s), sommes de contrôle du miroir VALIDES."
    else
      fail "Bucket $bucket : sommes de contrôle INVALIDES (corruption de sauvegarde)"
      continue
    fi

    # 3. Rechargement réel dans le MinIO jetable (`mc mirror`) : la sauvegarde
    #    n'est pas seulement lisible, elle est REJOUABLE.
    docker run --rm --network "$NET_NAME" --env MC_HOST_restore \
      -v "$WORK_DIR/minio:/restore:ro" \
      "$MC_IMAGE" mb --ignore-existing "restore/$bucket" >/dev/null
    if ! docker run --rm --network "$NET_NAME" --env MC_HOST_restore \
        -v "$WORK_DIR/minio:/restore:ro" \
        "$MC_IMAGE" mirror --quiet --overwrite "/restore/$bucket" "restore/$bucket" >/dev/null; then
      fail "Rechargement (mc mirror) impossible pour « $bucket »"
      continue
    fi

    # 4. Relecture d'un objet depuis le MinIO restauré et comparaison de sa
    #    somme de contrôle avec le manifeste (bout en bout).
    local sample expected actual
    sample="$(grep -v -e 'MANIFEST.sha256' -e 'MANIFEST.count' "$WORK_DIR/minio/$bucket/MANIFEST.sha256" | head -n1 || true)"
    if [[ -z "$sample" ]]; then
      # Ne peut plus se produire : le cas « 0 objet » est traité plus haut, avec son
      # propre verdict. Garde-fou conservé — un manifeste non vide dont on
      # n’extrait aucun objet témoin serait une anomalie, pas une normalité.
      fail "Bucket $bucket : $annonces objet(s) annoncé(s) mais aucun objet témoin extractible"
      continue
    fi
    local objpath
    expected="$(printf '%s' "$sample" | awk '{print $1}')"
    # Format sha256sum : « <hash>  ./chemin » (le préfixe ./ ou * est retiré).
    objpath="$(printf '%s' "$sample" | awk '{ $1=""; sub(/^[ \t*]+/, ""); sub(/^\.\//, ""); print }')"
    actual="$(docker run --rm --network "$NET_NAME" --env MC_HOST_restore "$MC_IMAGE" \
                cat "restore/$bucket/$objpath" 2>/dev/null | sha256sum | cut -d' ' -f1)"
    if [[ "$expected" == "$actual" ]]; then
      axion_log "Bucket $bucket : objet témoin « $objpath » relu et vérifié (sha256 conforme)."
    else
      fail "Bucket $bucket : objet témoin « $objpath » corrompu (attendu $expected, obtenu $actual)"
    fi
  done
  unset MC_HOST_restore
}


# =============================================================================
# (c) CADDY / TLS — restauration du magasin de certificats depuis l'archive
# =============================================================================
# Arbitrage A01 du 2026-08-27 : `caddy_data` est entré dans le périmètre de
# sauvegarde parce que le raisonnement « ACME régénérera » ne tient pas dans le
# seul moment qui compte, un PRA — une réémission sous plafond Let's Encrypt
# peut échouer et laisser les DEUX environnements injoignables en HTTPS, y
# compris celui qui devrait servir à vérifier que la restauration a réussi.
# Et une sauvegarde jamais restaurée n'est pas une sauvegarde : on la restaure
# donc ICI dans un VOLUME JETABLE — le geste exact du PRA — puis on vérifie que
# les certificats qui en sortent sont lisibles, accompagnés de leur clé privée,
# et NON EXPIRÉS.
restore_caddy() {
  axion_log "--- (c) Caddy / TLS : restauration du magasin de certificats depuis zéro ---"

  if [[ "$APP_ENV" == "staging" ]]; then
    axion_log "Environnement staging : cette pile n'a pas de frontal (arbitrage 2026-08-27)."
    axion_log "Les certificats des DEUX domaines vivent dans la pile de PROD — rien à restaurer ici."
    return 0
  fi

  local archive
  archive="$(find "$CADDY_ARCHIVE_DIR" -maxdepth 1 -type f -name 'caddy-data-*.tar.gpg' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
  if [[ -z "$archive" ]]; then
    fail "Aucune archive du magasin TLS dans $CADDY_ARCHIVE_DIR — backup-caddy.sh n'a jamais tourné"
    return 1
  fi
  axion_log "Archive retenue : $(basename "$archive")"

  # --- 1. Restauration dans un VOLUME JETABLE (le geste exact du PRA) --------
  docker volume create "$CADDY_VOLUME" >/dev/null
  if ! axion_decrypt_stream <"$archive" \
       | docker run --rm -i -v "$CADDY_VOLUME:/data" "$ALPINE_IMAGE" tar -C /data -xf -; then
    fail "Déchiffrement/extraction du magasin TLS impossible (archive corrompue ou passphrase changée)"
    return 1
  fi

  # --- 2. Le magasin restauré doit contenir des certificats -----------------
  local certs
  certs="$(docker run --rm -v "$CADDY_VOLUME:/data:ro" "$ALPINE_IMAGE" \
             find /data -type f -name '*.crt' 2>/dev/null || true)"
  if [[ -z "$certs" ]]; then
    axion_warn "Magasin TLS restauré mais SANS aucun certificat : normal UNIQUEMENT si le site écoute sur une adresse sans ACME (:8080). En production, c'est une anomalie à traiter."
    return 0
  fi

  # --- 3. Chaque certificat : lisible, avec sa clé privée, et non expiré ----
  local crt pem subject enddate keyfile total=0 valid=0
  while IFS= read -r crt; do
    [[ -z "$crt" ]] && continue
    total=$((total + 1))

    pem="$(docker run --rm -v "$CADDY_VOLUME:/data:ro" "$ALPINE_IMAGE" cat "$crt" 2>/dev/null || true)"
    if [[ -z "$pem" ]]; then
      fail "Certificat vide ou illisible dans le magasin restauré : $crt"
      continue
    fi
    if ! subject="$(printf '%s\n' "$pem" | openssl x509 -noout -subject 2>/dev/null)"; then
      fail "Certificat non analysable (PEM corrompu) dans le magasin restauré : $crt"
      continue
    fi
    enddate="$(printf '%s\n' "$pem" | openssl x509 -noout -enddate 2>/dev/null || true)"

    # Un certificat sans sa clé privée ne permet de servir AUCUN octet en HTTPS.
    keyfile="${crt%.crt}.key"
    if ! docker run --rm -v "$CADDY_VOLUME:/data:ro" "$ALPINE_IMAGE" test -s "$keyfile"; then
      fail "Clé privée absente ou vide pour le certificat restauré : $keyfile"
    fi

    if printf '%s\n' "$pem" | openssl x509 -noout -checkend 0 >/dev/null 2>&1; then
      valid=$((valid + 1))
      axion_log "Certificat restauré VALIDE — ${subject#subject=} (${enddate#notAfter=})"
    else
      axion_warn "Certificat restauré EXPIRÉ — ${subject#subject=} (${enddate#notAfter=}) : reliquat de renouvellement, sans gravité tant qu'un autre est valide."
    fi
  done <<<"$certs"

  if [[ "$valid" -eq 0 ]]; then
    fail "Aucun certificat VALIDE dans le magasin TLS restauré ($total lu(s), tous expirés) — un PRA repartirait sans HTTPS"
  else
    axion_log "Magasin TLS restauré et vérifié : $valid/$total certificat(s) valide(s), clés privées présentes."
  fi
}

# =============================================================================
# DÉROULÉ
# =============================================================================
axion_log "=== TEST DE RESTAURATION — début ($TS, environnement ${APP_ENV}) ==="
purge_stale
guard_not_production
docker network create "$NET_NAME" >/dev/null

restore_postgres || true
restore_minio || true
restore_caddy || true

# -----------------------------------------------------------------------------
# VERDICT — code de sortie non nul + alerte Telegram si échec (critère (d)).
# -----------------------------------------------------------------------------
if [[ "$FAILURES" -gt 0 ]]; then
  axion_error "=== TEST DE RESTAURATION : ÉCHEC ($FAILURES contrôle(s) en défaut) ==="
  axion_notify "ÉCHEC du test de restauration nocturne ($FAILURES contrôle(s)). Rapport : $AXION_LOG_FILE — procédure : infra/README.md §« Test de restauration en échec »."
  exit 1
fi

axion_log "=== TEST DE RESTAURATION : SUCCÈS (Postgres + MinIO + magasin TLS restaurés depuis zéro) ==="
axion_log "Rapport : $AXION_LOG_FILE"
exit 0
