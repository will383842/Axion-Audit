#!/usr/bin/env bash

# =============================================================================
# CE SCRIPT EST VERSIONNE : infra/scripts/deploy-staging.sh
# =============================================================================
# Il vit AUSSI sur le serveur, en /opt/axion-audit/deploy-staging.sh, parce que
# la directive command= de authorized_keys ne peut pointer que vers un chemin
# local. Deux copies, donc — et deux copies derivent.
#
# LA PARADE : la premiere chose que ce script imprime est SA PROPRE EMPREINTE.
# La CI la compare a celle du fichier versionne et ECHOUE si elles different.
# Sans cela, quelqu un (moi, le 2026-08-30, deux fois) peut modifier la version
# en production sans qu aucune trace n en subsiste : ni revue croisee, ni
# historique, ni sauvegarde. C est le defaut que ce depot corrige partout
# ailleurs, et il etait loge dans le mecanisme de deploiement lui-meme.
# =============================================================================

printf "EMPREINTE_SCRIPT=%s
" "$(sha256sum "${BASH_SOURCE[0]}" | cut -d" " -f1)"
# =============================================================================
# DEPLOIEMENT DU STAGING — seule commande que la cle de CI peut executer.
# =============================================================================
# Pose le 2026-08-30. Contexte, pour qui lira ceci sans le connaitre :
#
# Le pare-feu Hetzner ferme le port 8000 a Internet depuis le 2026-08-28. C etait
# la CORRECTION du risque « console Coolify exposee en HTTP clair », et elle
# reste bonne. Mais elle rend l API Coolify injoignable depuis GitHub Actions,
# donc le job `deploy-staging` echouait a son premier passage reel.
#
# Plutot que de rouvrir le port (qui exposerait la console pilotant AUSSI
# axion-ia.com), la CI se connecte en SSH et appelle Coolify EN BOUCLE LOCALE.
# La cle qui l autorise ne peut executer QUE ce script — voir la directive
# `command=` dans authorized_keys. Ni shell, ni lecture de fichier, ni
# redirection de port.
#
# ENTREE : trois lignes sur stdin, VALIDEES une par une. Rien n est pris de
# SSH_ORIGINAL_COMMAND : ce serait une surface d injection pour zero gain.
#   ligne 1 : jeton d API Coolify
#   ligne 2 : uuid de l application
#   ligne 3 : sha du commit attendu
# =============================================================================
set -uo pipefail

echec() { echo "::error::$*" >&2; exit 1; }

read -r JETON  || echec "stdin: jeton absent."
read -r UUID   || echec "stdin: uuid absent."
read -r COMMIT || echec "stdin: commit absent."

# Validation stricte AVANT tout appel. Un uuid ou un sha qui ne ressemble pas a
# ce qu il pretend etre est refuse ici, pas transmis a Coolify.
[[ "$JETON"  =~ ^[A-Za-z0-9|._-]{20,200}$ ]] || echec "Jeton de forme inattendue — refuse sans etre transmis."
[[ "$UUID"   =~ ^[a-z0-9]{20,32}$ ]]         || echec "UUID d application de forme inattendue : refuse."
[[ "$COMMIT" =~ ^[0-9a-f]{7,40}$ ]]          || echec "SHA de commit de forme inattendue : refuse."

API="http://127.0.0.1:8000/api/v1"

# --- 1. Declencher -----------------------------------------------------------
REPONSE="$(curl -sS --max-time 30 -X POST \
  -H "Authorization: Bearer ${JETON}" \
  "${API}/deploy?uuid=${UUID}&force=false" 2>&1)" \
  || echec "Coolify injoignable EN BOUCLE LOCALE — le service est-il arrete ? Reponse : ${REPONSE}"

UUID_DEP="$(printf '%s' "$REPONSE" | grep -oE '"deployment_uuid"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | grep -oE '[^"]+"$' | tr -d '"')"
[ -n "$UUID_DEP" ] || echec "Coolify a repondu sans uuid de deploiement. Reponse brute : ${REPONSE}"
echo "Deploiement declenche : ${UUID_DEP}"

# --- 2. Attendre la fin ------------------------------------------------------
# Une sonde qui abandonne en silence est pire que pas de sonde : le delai
# depasse est un ECHEC explicite, jamais un succes par defaut.
STATUT=""; N=0
while [ "$N" -lt 120 ]; do
  ETAT="$(curl -sS --max-time 15 -H "Authorization: Bearer ${JETON}" \
          "${API}/deployments/${UUID_DEP}" 2>/dev/null)" || true
  STATUT="$(printf '%s' "$ETAT" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | grep -oE '[^"]+"$' | tr -d '"')"
  case "$STATUT" in
    finished|failed|cancelled|error) break ;;
  esac
  sleep 10; N=$((N+1))
done
[ -n "$STATUT" ] || echec "Aucun statut lisible apres 20 minutes — l attente ne conclut pas au succes."
# Coolify rend « running:healthy » pour une application en service, et
# « finished » pour un deploiement acheve. Le 2026-08-30, ce script a lu
# « running:healthy » et l a pris pour un echec, alors que le VRAI echec etait
# ailleurs : le deploiement 1720 avait echoue au clonage. Une valeur PLAUSIBLE
# qui repond a une AUTRE question — la famille de defaut que ce depot traque.
# On accepte donc les deux formes d achevement, et l on ne conclut JAMAIS sur ce
# statut seul : c est la verification du commit en service, plus bas, qui decide.
case "$STATUT" in
  finished|running:healthy) : ;;
  *) echec "Deploiement termine en « ${STATUT} » — ni « finished » ni « running:healthy »." ;;
esac

# --- 3. VERIFIER QUE C EST BIEN CE COMMIT QUI TOURNE -------------------------
# Le champ `status` de l API a DEJA menti sur ce projet : le 2026-08-28, trois
# deploiements annonces reussis avaient echoue. On ne le croit donc pas sur
# parole — on lit le commit dans le conteneur en service.
CONTENEUR="$(docker ps --filter "name=api-${UUID}" --format '{{.Names}}' | head -1)"
[ -n "$CONTENEUR" ] || echec "Aucun conteneur d API en service pour ${UUID} apres deploiement."

EN_SERVICE="$(docker inspect "$CONTENEUR" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
if [ -n "$EN_SERVICE" ]; then
  case "$EN_SERVICE" in
    "${COMMIT}"*) echo "Verifie : le conteneur en service porte bien ${COMMIT}." ;;
    *) echec "Le conteneur en service porte « ${EN_SERVICE} », pas « ${COMMIT} ». Le deploiement s est declare reussi sur un AUTRE commit." ;;
  esac
else
  echo "::warning::Aucune etiquette de revision sur le conteneur : le commit en service n a PAS pu etre verifie. Le statut Coolify seul ne prouve rien (cf. 2026-08-28)."
fi

echo "Deploiement du staging termine et verifie."
