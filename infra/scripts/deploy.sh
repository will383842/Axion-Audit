#!/usr/bin/env bash
# =============================================================================
# infra/scripts/deploy.sh — déploiement d'un tag d'images GHCR (lot L0)
# Applique : 02 §30.6 (« SSH → docker compose pull && up -d + migration avec
# garde-fou (dry-run puis apply) + smoke tests → notification Telegram ;
# rollback : compose re-pointé sur le tag précédent »), 02 §11.2 (migrations
# rétrocompatibles N-1, déploiement sans coupure), 02 §11.3 (alertes).
# =============================================================================
#
# USAGE (appelé par la CI en SSH, ou à la main) :
#   ./deploy.sh --env staging --tag sha-1a2b3c4 [--env-file /opt/axion-audit/staging/.env]
#   ./deploy.sh --rollback --env prod            (revient au tag précédent enregistré)
#
# CONTRAT ATTENDU DE L'IMAGE `api` (à confirmer par A01 — cf. rapport L0) :
#   pnpm db:migrate:check → simulation SANS écriture (dry-run), code non nul si
#                           la migration ne peut pas s'appliquer proprement
#   pnpm db:migrate       → application réelle des migrations SQL versionnées
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

TARGET_ENV=""
TARGET_TAG=""
ENV_FILE=""
DO_ROLLBACK="no"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) TARGET_ENV="$2"; shift 2 ;;
    --tag) TARGET_TAG="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --rollback) DO_ROLLBACK="yes"; shift ;;
    -h|--help) sed -n '1,25p' "$0"; exit 0 ;;
    *) axion_die "Option inconnue : $1" ;;
  esac
done

[[ -n "$TARGET_ENV" ]] || axion_die "--env <staging|prod> est obligatoire."
case "$TARGET_ENV" in staging|prod) : ;; *) axion_die "--env invalide : $TARGET_ENV" ;; esac

ENV_FILE="${ENV_FILE:-$AXION_ROOT/$TARGET_ENV/.env}"
[[ -r "$ENV_FILE" ]] || ENV_FILE="$AXION_ROOT/.env"
axion_load_env "$ENV_FILE"
axion_require_cmd docker curl
axion_require_env APP_ENV GHCR_OWNER

[[ "$APP_ENV" == "$TARGET_ENV" ]] \
  || axion_die "GARDE-FOU : --env=$TARGET_ENV mais APP_ENV=$APP_ENV dans $ENV_FILE. Refus de déployer sur le mauvais environnement (02 §30.4-4)."

TS="$(date -u +'%Y%m%dT%H%M%SZ')"
mkdir -p "$AXION_LOG_DIR"
AXION_LOG_FILE="$AXION_LOG_DIR/deploy-$TARGET_ENV-$TS.log"
export AXION_LOG_FILE

# Journal des tags déployés : c'est LUI qui rend le rollback possible (§30.6).
TAG_HISTORY="$AXION_ROOT/$TARGET_ENV.deployed-tags"
PREVIOUS_TAG=""
if [[ -f "$TAG_HISTORY" ]]; then
  PREVIOUS_TAG="$(tail -n1 "$TAG_HISTORY" | awk '{print $2}')"
fi

if [[ "$DO_ROLLBACK" == "yes" ]]; then
  [[ -n "$PREVIOUS_TAG" ]] || axion_die "Aucun tag précédent enregistré dans $TAG_HISTORY — rollback impossible."
  TARGET_TAG="$(tail -n2 "$TAG_HISTORY" | head -n1 | awk '{print $2}')"
  [[ -n "$TARGET_TAG" ]] || axion_die "Historique trop court pour un rollback."
  axion_warn "ROLLBACK demandé : retour au tag $TARGET_TAG"
fi
[[ -n "$TARGET_TAG" ]] || axion_die "--tag <IMAGE_TAG> est obligatoire."

export IMAGE_TAG="$TARGET_TAG"
export GHCR_OWNER

axion_log "=== Déploiement $TARGET_ENV — tag $IMAGE_TAG (précédent : ${PREVIOUS_TAG:-aucun}) ==="

# -----------------------------------------------------------------------------
# ROLLBACK DOCUMENTÉ — appelé si le smoke test échoue (02 §30.6).
# Les images sont conservées 90 j sur GHCR : le tag précédent est toujours tirable.
# Les migrations sont rétrocompatibles N-1 (02 §11.2) : on NE défait PAS le
# schéma, on repointe seulement les images. Un rollback qui exigerait un
# `down` de migration est un incident à escalader, pas une opération de routine.
# -----------------------------------------------------------------------------
rollback() {
  if [[ -z "$PREVIOUS_TAG" || "$PREVIOUS_TAG" == "$IMAGE_TAG" ]]; then
    axion_error "ROLLBACK IMPOSSIBLE (aucun tag précédent) — le service reste en l'état, intervention humaine requise."
    axion_notify "ÉCHEC déploiement $TARGET_ENV ($IMAGE_TAG) ET rollback impossible : intervention humaine IMMÉDIATE. Journal : $AXION_LOG_FILE"
    return 1
  fi
  axion_warn "Rollback vers $PREVIOUS_TAG…"
  IMAGE_TAG="$PREVIOUS_TAG"
  export IMAGE_TAG
  axion_compose pull api worker field hq >>"$AXION_LOG_FILE" 2>&1 || true
  axion_compose up -d --remove-orphans >>"$AXION_LOG_FILE" 2>&1 || true
  if "$SCRIPT_DIR/smoke-test.sh" "$ENV_FILE" >>"$AXION_LOG_FILE" 2>&1; then
    axion_warn "Rollback vers $PREVIOUS_TAG : service rétabli."
    axion_notify "ÉCHEC déploiement $TARGET_ENV ($TARGET_TAG) → ROLLBACK réussi vers $PREVIOUS_TAG. Journal : $AXION_LOG_FILE"
  else
    axion_error "Rollback effectué mais smoke test TOUJOURS rouge."
    axion_notify "CRITIQUE : $TARGET_ENV rouge après rollback vers $PREVIOUS_TAG. Journal : $AXION_LOG_FILE"
  fi
  return 1
}

# -----------------------------------------------------------------------------
# 1. Récupération des images (GHCR — 02 §30.5)
# -----------------------------------------------------------------------------
axion_log "1/5 docker compose pull (ghcr.io/$GHCR_OWNER/axion-audit-*:$IMAGE_TAG)"
if ! axion_compose pull api worker field hq; then
  axion_notify "ÉCHEC déploiement $TARGET_ENV : pull GHCR impossible (tag $IMAGE_TAG). Vérifier « docker login ghcr.io »."
  axion_die "Échec du pull : tag inexistant ou authentification GHCR absente (docker login ghcr.io)."
fi

# -----------------------------------------------------------------------------
# 2. Base de données : DÉPENDANCES D'ABORD, puis MIGRATION AVEC GARDE-FOU
#    (dry-run PUIS apply — 02 §30.6). Le dry-run échoue = on ne touche à rien.
# -----------------------------------------------------------------------------
axion_log "2/5 démarrage des dépendances (postgres, redis, minio)"
axion_compose up -d postgres redis minio createbuckets

axion_log "2/5 migration — ÉTAPE 1/2 : simulation (dry-run, aucune écriture)"
if ! axion_compose run --rm --no-deps api pnpm db:migrate:check; then
  axion_notify "ÉCHEC déploiement $TARGET_ENV : la SIMULATION de migration a échoué (tag $IMAGE_TAG). Rien n'a été appliqué."
  axion_die "Dry-run de migration en échec — déploiement interrompu AVANT toute écriture en base."
fi

axion_log "2/5 migration — ÉTAPE 2/2 : application"
if ! axion_compose run --rm --no-deps api pnpm db:migrate; then
  axion_notify "ÉCHEC déploiement $TARGET_ENV : migration en échec APRÈS dry-run vert (tag $IMAGE_TAG). Base à vérifier."
  axion_die "Migration en échec après dry-run vert — état de la base à vérifier À LA MAIN."
fi

# -----------------------------------------------------------------------------
# 3. Bascule applicative (migrations rétrocompatibles N-1 : pas de coupure)
# -----------------------------------------------------------------------------
axion_log "3/5 docker compose up -d"
if ! axion_compose up -d --remove-orphans; then
  rollback || exit 1
  exit 1
fi

# -----------------------------------------------------------------------------
# 4. Smoke tests (02 §30.6)
# -----------------------------------------------------------------------------
axion_log "4/5 smoke tests"
if ! "$SCRIPT_DIR/smoke-test.sh" "$ENV_FILE"; then
  axion_error "Smoke tests ROUGES sur le tag $IMAGE_TAG."
  rollback || exit 1
  exit 1
fi

# -----------------------------------------------------------------------------
# 5. Traçabilité + notification (02 §11.3)
# -----------------------------------------------------------------------------
echo "$TS $IMAGE_TAG" >>"$TAG_HISTORY"
chmod 600 "$TAG_HISTORY"
axion_log "5/5 nettoyage des images orphelines"
docker image prune -f >/dev/null 2>&1 || true

axion_log "=== Déploiement $TARGET_ENV OK — tag $IMAGE_TAG ==="
axion_notify "Déploiement $TARGET_ENV OK — tag $IMAGE_TAG (précédent : ${PREVIOUS_TAG:-aucun})."
exit 0
