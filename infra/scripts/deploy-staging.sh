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

# =============================================================================
# LA COPIE DU DEPOT SUR LE SERVEUR SUIT LA LIVRAISON — decide le 2026-09-02.
# =============================================================================
# `/opt/axion-audit/repo` porte `restore-test.sh`, que le test nocturne execute.
# Jusqu au 2026-09-02, RIEN ne mettait ce clone a niveau : c etait un geste
# humain, jamais planifie, et le garde nocturne rougissait apres chaque fusion
# pour une raison qui n etait pas celle qu il surveille (DECISIONS.md,
# 2026-08-31 « Rien ne met a niveau le clone »). Williams a tranche le
# 2026-09-02 : la fraicheur de cette copie est une propriete de la LIVRAISON.
# Ce script, que la cle de deploiement est seule a pouvoir lancer, realigne
# donc le clone sur LE SHA QU IL VIENT DE DEPLOYER — pas sur une branche : le
# clone doit etre exactement ce que la CI a livre.
#
# CE QUE LA CLE N A PAS GAGNE : rien. Elle ne peut toujours executer que ce
# fichier, dont l empreinte est comparee au depot avant toute conclusion. Ce
# qui a gagne du pouvoir, c est CE SCRIPT — et c est pourquoi les garde-fous
# ci-dessous ne sont pas negociables (memes trois que l entree du 31/08) :
#   · l origine du clone est VERIFIEE : on ne tire que du depot public attendu ;
#   · la reference de branche est EN DUR : la cle ne choisit jamais ce qui
#     s execute, seulement le declenchement ;
#   · aucune reecriture d historique n est suivie : le sha vise doit DESCENDRE
#     du commit courant du clone, et etre atteignable depuis `origin/main`.
#   · un clone porteur de modifications locales n est JAMAIS ecrase en silence
#     (invariant 7) : on refuse, on nomme, un humain tranche.
# Un `git checkout` ne lance aucun code ; c est le nocturne, a 03h00, qui
# executera ce que le clone contient — comme avant, mais sans attendre l oubli
# d un humain.
# =============================================================================
CLONE="/opt/axion-audit/repo"
ORIGINE_ATTENDUE="https://github.com/will383842/Axion-Audit.git"
BRANCHE="main"

# Publie la ligne `CLONE_SERVEUR=<sha40>` que la CI compare au sha deploye.
aligner_clone() {
  local clone="$1" sha="$2" origine="$3" tete_avant origine_reelle tete_apres
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || echec "Alignement du clone : il faut un sha COMPLET (40 hexa), recu « ${sha} ». Un sha abrege ne garantit pas l exactitude."
  [ -d "${clone}/.git" ] || echec "Alignement du clone : ${clone} n est pas un depot git. Le cloner a la main (README infra §6.3) avant de redeployer."

  origine_reelle="$(git -C "$clone" remote get-url origin 2>/dev/null)" \
    || echec "Alignement du clone : ${clone} n a pas de remote « origin » lisible (droits ? propriete du .git ?)."
  case "$origine_reelle" in
    "$origine"|"${origine%.git}") : ;;
    *) echec "Alignement du clone REFUSE : origin=« ${origine_reelle} », attendu « ${origine} ». On ne tire jamais d un autre depot que celui qui a ete relu." ;;
  esac

  if [ -n "$(git -C "$clone" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    echec "Alignement du clone REFUSE : ${clone} porte des modifications locales non versionnees. Elles ne seront pas ecrasees en silence (invariant 7) — les examiner sur le serveur (git status), puis les jeter ou les porter dans le depot."
  fi

  tete_avant="$(git -C "$clone" rev-parse HEAD 2>/dev/null)" || echec "Alignement du clone : HEAD illisible dans ${clone}."

  # Reference EN DUR, jamais prise de l entree : la cle ne choisit pas la branche.
  git -C "$clone" fetch --quiet --no-tags origin "+refs/heads/${BRANCHE}:refs/remotes/origin/${BRANCHE}" \
    || echec "Alignement du clone : « git fetch origin ${BRANCHE} » a echoue. Reseau sortant vers github.com ? Le depot est public : aucun identifiant n est requis."

  git -C "$clone" cat-file -e "${sha}^{commit}" 2>/dev/null \
    || echec "Alignement du clone REFUSE : le sha ${sha} est inconnu apres fetch de ${BRANCHE}. Il n est donc pas sur la branche livree."
  git -C "$clone" merge-base --is-ancestor "$sha" "refs/remotes/origin/${BRANCHE}" \
    || echec "Alignement du clone REFUSE : ${sha} n est pas atteignable depuis origin/${BRANCHE}. Ce script ne suit que du code fusionne."
  git -C "$clone" merge-base --is-ancestor "$tete_avant" "$sha" \
    || echec "Alignement du clone REFUSE : ${sha} ne DESCEND PAS du commit courant du clone (${tete_avant}). Cela ressemble a une reecriture d historique de ${BRANCHE} — interdite par la protection de branche. Un humain doit regarder AVANT que la machine ne suive."

  git -C "$clone" checkout --quiet --detach "$sha" \
    || echec "Alignement du clone : « git checkout --detach ${sha} » a echoue dans ${clone}."

  tete_apres="$(git -C "$clone" rev-parse HEAD 2>/dev/null)"
  [ "$tete_apres" = "$sha" ] || echec "Alignement du clone : HEAD vaut ${tete_apres} apres checkout, attendu ${sha}. Le clone n est PAS dans l etat annonce."
  [ -z "$(git -C "$clone" status --porcelain --untracked-files=no 2>/dev/null)" ] \
    || echec "Alignement du clone : l arbre de travail n est pas propre apres checkout de ${sha}."

  if [ "$tete_avant" = "$tete_apres" ]; then
    echo "Clone ${clone} deja au sha livre (${sha}) — rien a faire."
  else
    echo "Clone ${clone} remis a niveau : ${tete_avant} -> ${tete_apres}."
  fi
  echo "CLONE_SERVEUR=${tete_apres}"
}

# MODE LOCAL, pour le test a blanc (`infra/scripts/test-garde-clone.sh`) et
# pour un exploitant sur le serveur. Il ne peut PAS etre atteint par la cle de
# CI : `command=` de authorized_keys fixe la ligne de commande et n y transmet
# AUCUN argument du client. Seule une invocation locale porte des arguments.
if [ "${1:-}" = "--aligner-clone" ]; then
  [ $# -ge 3 ] || echec "Usage : $0 --aligner-clone <chemin du clone> <sha40> [<url origin attendue>]"
  aligner_clone "$2" "$3" "${4:-$ORIGINE_ATTENDUE}"
  exit 0
fi

read -r JETON  || echec "stdin: jeton absent."
read -r UUID   || echec "stdin: uuid absent."
read -r COMMIT || echec "stdin: commit absent."

# Validation stricte AVANT tout appel. Un uuid ou un sha qui ne ressemble pas a
# ce qu il pretend etre est refuse ici, pas transmis a Coolify.
# Le sha est exige COMPLET depuis le 2026-09-02 : il sert a realigner le clone,
# et un prefixe ne designe pas un commit de facon certaine. La CI envoie
# toujours `github.sha` (40 hexa) — rien ne change pour elle.
[[ "$JETON"  =~ ^[A-Za-z0-9|._-]{20,200}$ ]] || echec "Jeton de forme inattendue — refuse sans etre transmis."
[[ "$UUID"   =~ ^[a-z0-9]{20,32}$ ]]         || echec "UUID d application de forme inattendue : refuse."
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]            || echec "SHA de commit de forme inattendue (40 hexa attendus) : refuse."

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
# DEUX LISTES QUI DEVAIENT S ACCORDER ET NE S ACCORDAIENT PAS — corrige le
# 2026-08-30. La boucle sortait sur « finished|failed|cancelled|error », mais le
# controle juste apres acceptait AUSSI « running:healthy ». Quand l API rendait
# cette derniere valeur — ce qu elle fait, puisqu elle decrit l APPLICATION et
# non le DEPLOIEMENT — la boucle n en sortait jamais et tournait ses 120 tours.
#
# MESURE : deux executions consecutives ont dure EXACTEMENT 20 minutes, soit la
# borne complete. Pendant ce temps, les conteneurs etaient recrees et sains
# depuis un quart d heure. Vingt minutes perdues a CHAQUE fusion, et personne ne
# pouvait le voir : le job finissait vert, simplement tres lent. Un defaut qui ne
# casse rien et ne coute que du temps est celui qui survit le plus longtemps.
#
# ON CESSE DE CROIRE LE STATUT ET L ON OBSERVE LA MACHINE. La question posee
# n est pas « que dit l API » mais « mon deploiement a-t-il pris effet ». Le
# conteneur d API porte le repertoire de travail du deploiement qui l a cree :
# des qu il porte le NOTRE, l attente n a plus d objet. On sort donc sur le fait
# lui-meme, et non sur son recit.
STATUT=""; N=0; PRIS_EFFET=0
while [ "$N" -lt 120 ]; do
  ETAT="$(curl -sS --max-time 15 -H "Authorization: Bearer ${JETON}" \
          "${API}/deployments/${UUID_DEP}" 2>/dev/null)" || true
  STATUT="$(printf '%s' "$ETAT" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | grep -oE '[^"]+"$' | tr -d '"')"
  case "$STATUT" in
    finished|failed|cancelled|error) break ;;
  esac

  CANDIDAT="$(docker ps --filter "name=api-${UUID}" --format '{{.Names}}' | head -1)"
  if [ -n "$CANDIDAT" ]; then
    OU="$(docker inspect "$CANDIDAT" \
          --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
    case "$OU" in
      *"${UUID_DEP}"*) PRIS_EFFET=1; break ;;
    esac
  fi

  sleep 10; N=$((N+1))
done

if [ "$PRIS_EFFET" -eq 1 ]; then
  echo "Prise d effet observee sur la machine apres $((N * 10)) s : le conteneur en service provient du deploiement ${UUID_DEP}."
else
  [ -n "$STATUT" ] || echec "Aucun statut lisible apres 20 minutes, et aucune prise d effet observee sur la machine — l attente ne conclut pas au succes."
fi
# Coolify rend « running:healthy » pour une application en service, et
# « finished » pour un deploiement acheve. Le 2026-08-30, ce script a lu
# « running:healthy » et l a pris pour un echec, alors que le VRAI echec etait
# ailleurs : le deploiement 1720 avait echoue au clonage. Une valeur PLAUSIBLE
# qui repond a une AUTRE question — la famille de defaut que ce depot traque.
# On accepte donc les deux formes d achevement, et l on ne conclut JAMAIS sur ce
# statut seul : c est la verification du commit en service, plus bas, qui decide.
# Si la prise d effet a ete OBSERVEE sur la machine, ce statut n a plus voix au
# chapitre : un fait mesure prime sur le recit d une API qui a deja menti trois
# fois sur ce projet (2026-08-28). On ne le controle donc que faute de mieux.
if [ "$PRIS_EFFET" -ne 1 ]; then
  case "$STATUT" in
    finished|running:healthy) : ;;
    *) echec "Deploiement termine en « ${STATUT} » — ni « finished » ni « running:healthy », et aucune prise d effet observee sur la machine." ;;
  esac
fi

# --- 3. VERIFIER QUE C EST BIEN CE COMMIT QUI TOURNE -------------------------
# Le champ `status` de l API a DEJA menti sur ce projet : le 2026-08-28, trois
# deploiements annonces reussis avaient echoue. On ne le croit donc pas sur
# parole — on lit le commit dans le conteneur en service.
CONTENEUR="$(docker ps --filter "name=api-${UUID}" --format '{{.Names}}' | head -1)"
[ -n "$CONTENEUR" ] || echec "Aucun conteneur d API en service pour ${UUID} apres deploiement."

# DEUX VOIES DE PREUVE, ET L ECHEC SI AUCUNE N EST DISPONIBLE.
#
# VOIE 1, la meilleure : l etiquette OCI de revision. MESURE LE 2026-08-30 : elle
# n existe NI sur le conteneur, NI sur l image. L orchestrateur construit
# lui-meme (`axion-audit-api:coolify`) et ne pose aucune etiquette OCI ; le
# Dockerfile n en pose pas non plus. Cette voie ne pouvait donc JAMAIS aboutir —
# le garde ecrit le 2026-08-28 contre les faux succes n a jamais rien verifie.
# On la garde en premier : le jour ou le Dockerfile posera l etiquette, elle
# reprendra la main sans qu on y touche.
#
# VOIE 2, mesuree et disponible AUJOURD HUI : l orchestrateur etiquette le
# conteneur avec son repertoire de travail, nomme d apres l UUID DU DEPLOIEMENT —
#     com.docker.compose.project.working_dir = /artifacts/<uuid-deploiement>
# Or nous connaissons cet uuid : c est celui que nous venons de declencher. Si le
# conteneur en service ne le porte pas, c est qu il vient d un AUTRE deploiement,
# donc que le notre n a pas pris effet. C est exactement la question posee.
#
# CE QUE LA VOIE 2 PROUVE, ET CE QU ELLE NE PROUVE PAS — a lire avant de s en
# contenter. Elle prouve que le conteneur en service a ete cree par CE
# deploiement-ci. Elle NE prouve PAS quel commit l orchestrateur a clone : il
# prend la tete de la branche au moment ou il clone, et une poussee glissee entre
# notre declenchement et son clonage passerait inapercue. C est une preuve de
# PRISE D EFFET, pas de CONTENU. Elle vaut infiniment mieux que le statut de
# l API, qui a deja menti trois fois ; elle ne remplace pas l etiquette OCI, et
# c est pourquoi la dette reste ouverte dans AMELIORATIONS.md.
EN_SERVICE="$(docker inspect "$CONTENEUR" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
REPERTOIRE="$(docker inspect "$CONTENEUR" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"

if [ -n "$EN_SERVICE" ]; then
  case "$EN_SERVICE" in
    "${COMMIT}"*) echo "Verifie (etiquette OCI) : le conteneur en service porte bien ${COMMIT}." ;;
    *) echec "Le conteneur en service porte « ${EN_SERVICE} », pas « ${COMMIT} ». Le deploiement s est declare reussi sur un AUTRE commit." ;;
  esac
elif [ -n "$REPERTOIRE" ]; then
  case "$REPERTOIRE" in
    *"${UUID_DEP}"*)
      echo "Verifie (prise d effet) : le conteneur en service provient du deploiement ${UUID_DEP}."
      echo "::warning::Preuve de PRISE D EFFET seulement — aucune etiquette OCI de revision n existe sur ce conteneur, donc le COMMIT reellement clone n est pas verifie. Voir AMELIORATIONS.md."
      ;;
    *)
      echec "Le conteneur en service provient de « ${REPERTOIRE} », qui ne contient pas l uuid du deploiement declenche (${UUID_DEP}). Notre deploiement n a donc PAS pris effet : c est un ancien conteneur qui tourne, et le statut « reussi » de l API est trompeur — exactement le scenario du 2026-08-28."
      ;;
  esac
else
  echec "AUCUNE des deux voies de verification n est disponible sur ce conteneur : ni etiquette OCI de revision, ni repertoire de travail. On ne peut donc PAS affirmer que le deploiement a pris effet, et un deploiement qu on ne peut pas verifier ne doit pas etre annonce reussi. Si l orchestrateur a change ses etiquettes, ce garde doit etre remis a jour AVANT de redeployer."
fi

# --- 4. REFERMER LES DROITS DU FICHIER DE SECRETS ---------------------------
# MESURE LE 2026-08-30 : ce fichier portait 644. Il contient
# PGBACKREST_CIPHER_PASS — la passphrase qui dechiffre TOUTES les archives de
# sauvegarde. Elle etait donc lisible par n importe quel compte du serveur.
#
# POURQUOI ICI, ET PAS UNE FOIS A LA MAIN : l orchestrateur REECRIT ce fichier a
# chaque deploiement, avec ses droits par defaut. Un chmod pose une fois serait
# defait au deploiement suivant — une correction qui ne tient pas n est pas une
# correction, c est un repit. On le repose donc apres CHAQUE deploiement, la ou
# la reecriture vient d avoir lieu.
#
# CE N EST PAS UNE CORRECTION COMPLETE, ET IL FAUT LE DIRE : entre la reecriture
# par l orchestrateur et cette ligne, le fichier est brievement lisible. Fermer
# cette fenetre demanderait d agir sur l orchestrateur lui-meme, ce qui deborde
# de ce script et de ce projet. Reduire une exposition permanente a une exposition
# de quelques secondes est un gain reel ; le presenter comme une etancheite serait
# exactement le defaut que ce depot traque.
FICHIER_ENV="/data/coolify/applications/${UUID}/.env"
if [ -f "$FICHIER_ENV" ]; then
  DROITS_AVANT="$(stat -c '%a' "$FICHIER_ENV" 2>/dev/null || echo inconnu)"
  if [ "$DROITS_AVANT" != "600" ]; then
    chmod 600 "$FICHIER_ENV" && echo "Droits du fichier de secrets refermes : ${DROITS_AVANT} -> 600."
  else
    echo "Droits du fichier de secrets : deja 600."
  fi
else
  echo "::warning::Fichier de secrets introuvable en ${FICHIER_ENV} : ses droits n ont PAS pu etre verifies. Si l orchestrateur a change d arborescence, ce controle est devenu muet — et un controle muet ne protege rien."
fi

# --- 5. REMETTRE LE CLONE DU SERVEUR AU SHA QUI VIENT D ETRE LIVRE -----------
# EN DERNIER, et c est voulu : la livraison a pris effet (etape 3) avant que la
# copie qui porte `restore-test.sh` ne la suive. Si l alignement echoue, ce
# script rend un code non nul et la CI rougit EN NOMMANT LE CLONE — le staging,
# lui, est deja en service. Un deploiement qui echoue plus haut ne realigne
# rien : le nocturne rougira alors pour la bonne raison, une livraison manquee.
aligner_clone "$CLONE" "$COMMIT" "$ORIGINE_ATTENDUE"

echo "Deploiement du staging termine et verifie."
