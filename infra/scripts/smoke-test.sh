#!/usr/bin/env bash
# =============================================================================
# infra/scripts/smoke-test.sh — vérification post-déploiement (lot L0)
# Applique : 02 §30.6 (« smoke tests : santé API, login, une écriture/lecture »),
# 07 ligne L0 (« déploiement staging par la CI OK »), 11 §2 (domaine unique).
# Appelé par deploy.sh ; un code de sortie non nul déclenche le ROLLBACK.
# =============================================================================
#
# PÉRIMÈTRE À CE LOT — décision « [L0] Squelette applicatif minimal des 5 espaces
# de travail dès L0 » (DECISIONS.md, 2026-08-27) : l'authentification est le lot
# L2, il n'existe donc encore AUCUNE route métier en écriture. L'étape
# « écriture/lecture » du §30.6 est ici jouée au niveau INFRASTRUCTURE
# (Postgres, MinIO, Redis), ce qui prouve la même chose : la pile déployée est
# réellement inscriptible. Elle sera doublée d'un aller-retour par l'API dès L3.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

axion_load_env "${1:-$AXION_ROOT/.env}"
axion_require_cmd docker curl
axion_require_env PUBLIC_BASE_URL POSTGRES_DB POSTGRES_USER MINIO_BUCKET_TEMPLATES

TS="$(date -u +'%Y%m%dT%H%M%SZ')"
FAILURES=0
WITNESS="smoke-$TS-$$"

check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    axion_log "OK   — $label"
  else
    axion_error "ÉCHEC — $label"
    FAILURES=$((FAILURES + 1))
  fi
}

axion_log "=== Smoke tests (${APP_ENV:-?}) — $PUBLIC_BASE_URL ==="

# -----------------------------------------------------------------------------
# 1. SANTÉ DE L'API — route /v1/health derrière le préfixe /api de Caddy (11 §2)
# -----------------------------------------------------------------------------
health_body="$(curl -fsS --max-time 15 "$PUBLIC_BASE_URL/api/v1/health" || true)"
if [[ -n "$health_body" ]]; then
  axion_log "OK   — santé API : $health_body"
else
  axion_error "ÉCHEC — santé API : $PUBLIC_BASE_URL/api/v1/health ne répond pas"
  FAILURES=$((FAILURES + 1))
fi

# -----------------------------------------------------------------------------
# 2. LES DEUX FRONTS SONT SERVIS SOUS LE MÊME DOMAINE (11 §2, pas de CORS)
# -----------------------------------------------------------------------------
check "PWA terrain servie à la racine" \
  curl -fsS --max-time 15 -o /dev/null "$PUBLIC_BASE_URL/"
check "console siège servie sous /hq/" \
  curl -fsS --max-time 15 -o /dev/null "$PUBLIC_BASE_URL/hq/"

# -----------------------------------------------------------------------------
# 3. EN-TÊTES DE SÉCURITÉ PRÉSENTS (06 §10.2) — une régression de Caddyfile
#    passerait sinon inaperçue jusqu'à l'audit.
# -----------------------------------------------------------------------------
headers="$(curl -fsSI --max-time 15 "$PUBLIC_BASE_URL/" || true)"
for h in "content-security-policy" "x-content-type-options" "referrer-policy"; do
  if grep -qi "^$h:" <<<"$headers"; then
    axion_log "OK   — en-tête $h présent"
  else
    axion_error "ÉCHEC — en-tête de sécurité manquant : $h"
    FAILURES=$((FAILURES + 1))
  fi
done

# -----------------------------------------------------------------------------
# 3bis. STAGING UNIQUEMENT — X-Robots-Tag (arbitrage A01, DECISIONS.md 2026-08-27
#       « Cohabitation staging/prod : qui écoute sur 443 ? »). Le staging vit
#       désormais sur un SOUS-DOMAINE avec un VRAI certificat : il est donc
#       indexable, et l’outil est confidentiel.
# -----------------------------------------------------------------------------
if [[ "${APP_ENV:-}" == "staging" ]]; then
  if grep -qi "^x-robots-tag:.*noindex" <<<"$headers"; then
    axion_log "OK   — en-tête x-robots-tag: noindex présent (staging non indexable)"
  else
    axion_error "ÉCHEC — staging indexable : en-tête x-robots-tag noindex absent"
    FAILURES=$((FAILURES + 1))
  fi
fi

# -----------------------------------------------------------------------------
# 4. ÉCRITURE / LECTURE POSTGRES — table témoin créée, relue, puis SUPPRIMÉE.
#    Non destructif : rien d'existant n'est touché (invariant 7).
# -----------------------------------------------------------------------------
pg_roundtrip() {
  axion_compose exec -T --user postgres postgres psql -X -q -v ON_ERROR_STOP=1 \
    -d "$POSTGRES_DB" -c "CREATE TABLE IF NOT EXISTS public.\"_smoke_$WITNESS\" (id int primary key, note text);" \
    -c "INSERT INTO public.\"_smoke_$WITNESS\" (id, note) VALUES (1, '$WITNESS');" \
    -c "SELECT note FROM public.\"_smoke_$WITNESS\" WHERE id = 1;" \
    -c "DROP TABLE public.\"_smoke_$WITNESS\";"
}
check "écriture/lecture PostgreSQL (table témoin créée, relue, supprimée)" pg_roundtrip

# -----------------------------------------------------------------------------
# 5. ÉCRITURE / LECTURE MINIO — objet témoin déposé, relu, supprimé.
#    Utilise les clés APPLICATIVES restreintes (02 §30.4-7), pas les clés root :
#    le test valide donc aussi la politique de moindre accès.
# -----------------------------------------------------------------------------
minio_roundtrip() {
  local network
  network="$(axion_project_name)"
  MC_HOST_axion="$(axion_mc_host_url)"
  export MC_HOST_axion
  printf 'axion-smoke-%s' "$WITNESS" >"/tmp/$WITNESS.txt"
  docker run --rm --network "$network" --env MC_HOST_axion \
    -v "/tmp/$WITNESS.txt:/tmp/$WITNESS.txt:ro" \
    "${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}" \
    cp "/tmp/$WITNESS.txt" "axion/$MINIO_BUCKET_TEMPLATES/_smoke/$WITNESS.txt"
  local readback
  readback="$(docker run --rm --network "$network" --env MC_HOST_axion \
    "${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}" \
    cat "axion/$MINIO_BUCKET_TEMPLATES/_smoke/$WITNESS.txt")"
  docker run --rm --network "$network" --env MC_HOST_axion \
    "${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}" \
    rm "axion/$MINIO_BUCKET_TEMPLATES/_smoke/$WITNESS.txt"
  rm -f "/tmp/$WITNESS.txt"
  [[ "$readback" == "axion-smoke-$WITNESS" ]]
}
check "écriture/lecture MinIO (objet témoin déposé, relu, supprimé)" minio_roundtrip

# -----------------------------------------------------------------------------
# 6. ÉCRITURE / LECTURE REDIS — les files BullMQ doivent être opérationnelles.
# -----------------------------------------------------------------------------
redis_roundtrip() {
  axion_compose exec -T redis sh -c \
    "redis-cli --no-auth-warning -a \"\$REDIS_PASSWORD\" set axion:smoke:$WITNESS ok EX 60 >/dev/null && \
     [ \"\$(redis-cli --no-auth-warning -a \"\$REDIS_PASSWORD\" get axion:smoke:$WITNESS)\" = ok ] && \
     redis-cli --no-auth-warning -a \"\$REDIS_PASSWORD\" del axion:smoke:$WITNESS >/dev/null"
}
check "écriture/lecture Redis (clé témoin posée, relue, supprimée)" redis_roundtrip

# -----------------------------------------------------------------------------
# TODO(L2) — étape « login » du flux de smoke test (02 §30.6) : à activer au lot
# L2 (auth/RBAC), quand /v1/auth/login existera. Couvert par la décision
# DECISIONS.md du 2026-08-27 « [L0] Squelette applicatif minimal des 5 espaces de
# travail dès L0 » (« le smoke test login du §30.6 est hors de portée de L0 :
# le script porte cette étape en commentaire explicite, à activer au lot L2 »).
# Forme attendue :
#   check "login du compte de service" curl -fsS -X POST \
#     "$PUBLIC_BASE_URL/api/v1/auth/login" -H 'content-type: application/json' \
#     -d "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}"
# -----------------------------------------------------------------------------

if [[ "$FAILURES" -gt 0 ]]; then
  axion_error "=== Smoke tests : ÉCHEC ($FAILURES contrôle(s)) ==="
  exit 1
fi
axion_log "=== Smoke tests : SUCCÈS ==="
exit 0
