#!/bin/sh
# =============================================================================
# FAUX `mc` — OUTIL DE BANC DU LOT L0 (sauvegarde). N'EST JAMAIS LIVRÉ.
#
# POURQUOI IL EXISTE, ET POURQUOI IL A DÛ GRANDIR LE 2026-09-01
# -----------------------------------------------------------------------------
# Le banc L0 éprouve la logique LOCALE de `sauvegarde.sh` : archivage, rotation,
# rétention, coffre, permissions. Il n'a jamais éprouvé R2, et ne le prétend pas.
# Jusqu'au 2026-08-31, le faux `mc` tenait en une ligne : il rendait 0 et faisait
# mine de voir un objet pour un `ls`. C'était assez tant que la passe se
# contentait de COMPTER les objets distants.
#
# `fix/miroir-backup-info` a remplacé ce comptage par une COMPARAISON
# D'INVENTAIRES (`mc find` local ↔ distant). Le faux `mc` ne connaissant pas
# `find`, il rendait une liste VIDE : la passe concluait « le miroir s'est
# déclaré réussi mais le seau ne contient AUCUN objet » et s'arrêtait avant
# `passe terminée avec succès`. 19 cas sur 58 sont devenus rouges, plus la suite
# `l0-restauration` par ricochet — sans qu'une seule ligne de la logique locale
# ait changé. Le banc mesurait le mauvais script.
#
# CE QU'IL FAIT MAINTENANT : il tient un VRAI seau, sous forme de répertoire
# local, et implémente les cinq verbes que la passe emploie. Le miroir copie pour
# de bon, `find` liste ce qui a été copié, `cat` échoue sur un objet absent.
# La comparaison d'inventaires devient donc exerçable dans les deux sens — c'est
# ce qui permet au cas « un objet manque à destination » d'exister enfin
# (`sauvegarde.sh — inventaire distant`, ajouté le même jour).
#
# CE QU'IL NE FAIT TOUJOURS PAS, ET QU'IL FAUT DIRE : il ne prouve RIEN sur R2.
# Pas de réseau, pas de TLS, pas de jeton, pas de sémantique S3. Un seau local
# ne dira jamais qu'un jeton est révoqué ni qu'un fournisseur est en panne.
#
# LE SEAU EST DÉRIVÉ DE `AXION_ARCHIVES`, et non fixe : chaque cas du banc
# travaille dans son propre répertoire d'archives, donc dans son propre seau.
# Deux cas ne se polluent pas. Il vit À CÔTÉ des archives et jamais DEDANS —
# `inventaire_local` balaie `AXION_ARCHIVES` récursivement, et un seau rangé là
# se réclamerait lui-même à destination.
# =============================================================================
set -eu

PERTE="${AXION_FAUX_R2_PERDRE:-}"
FAUX_R2="${AXION_FAUX_R2:-/tmp/faux-r2$(printf '%s' "${AXION_ARCHIVES:-/sauvegarde}" | tr '/' '-')}"

# Les options peuvent précéder le verbe (`--config-dir`, `--quiet`, posées par
# le wrapper `mcx`) ou le suivre (`--overwrite`, `--exclude`, posées par l'appel
# au miroir). On les trie donc sans présumer de leur place.
EXCLUSIONS=''
POSITIONNELS=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --config-dir)
      shift 2
      ;;
    --exclude)
      EXCLUSIONS="$EXCLUSIONS $2"
      shift 2
      ;;
    --*)
      shift
      ;;
    *)
      POSITIONNELS="$POSITIONNELS $1"
      shift
      ;;
  esac
done
# shellcheck disable=SC2086 # aucun chemin du banc ne porte d'espace.
set -- $POSITIONNELS
verbe="${1:-}"
[ "$#" -gt 0 ] && shift

# `axionr2/<seau>/<clé>` -> `$FAUX_R2/<seau>/<clé>`. L'alias est retiré : il ne
# désigne pas un répertoire, il désigne un compte.
chemin_local() {
  printf '%s/%s' "$FAUX_R2" "${1#*/}"
}

# Un motif d'exclusion de `mc mirror` porte sur le NOM du fichier, pas sur son
# chemin — même lecture que les `grep -vE` d'`inventaire_local`.
est_exclu() {
  nom="$(basename "$1")"
  for motif in $EXCLUSIONS; do
    # shellcheck disable=SC2254 # le motif DOIT rester un glob, c'est son rôle.
    case "$nom" in
      $motif) return 0 ;;
    esac
  done
  return 1
}

# INJECTION DE PANNE — un miroir qui se déclare RÉUSSI en ayant laissé un objet
# derrière lui. C'est la panne exacte du 2026-08-29 (README d'infra §5.7ter), et
# c'est la SEULE façon d'éprouver la comparaison d'inventaires : sans elle, le
# contrôle serait vert en toutes circonstances, donc invérifiable.
# `mc` rend 0 comme si de rien n'était — le mensonge fait partie du scénario.
est_perdu() {
  [ -n "$PERTE" ] || return 1
  nom="$(basename "$1")"
  # shellcheck disable=SC2254 # le motif DOIT rester un glob, c'est son rôle.
  case "$nom" in
    $PERTE) return 0 ;;
  esac
  return 1
}

case "$verbe" in
  ls)
    # Précondition d'accès de la passe : la seule chose qui compte est le code
    # de sortie. La sortie part dans /dev/null côté appelant.
    exit 0
    ;;

  mirror)
    source="$1"
    destination="$(chemin_local "$2")"
    [ -d "$source" ] || exit 1
    mkdir -p "$destination"
    ( cd "$source" && find . -type f -print ) | while IFS= read -r trouve; do
      relatif="${trouve#./}"
      est_exclu "$relatif" && continue
      est_perdu "$relatif" && continue
      mkdir -p "$destination/$(dirname "$relatif")"
      cp "$source/$relatif" "$destination/$relatif"
    done
    exit 0
    ;;

  find)
    racine="$1"
    local_racine="$(chemin_local "$racine")"
    [ -d "$local_racine" ] || exit 0
    # `mc find` rend des CLÉS COMPLÈTES, préfixe compris — c'est ce que
    # `inventaire_distant` retire ensuite par `sed`. Rendre des chemins relatifs
    # ici ferait un inventaire distant vide sans que rien n'échoue.
    ( cd "$local_racine" && find . -type f -print ) | sed 's|^\./||' \
      | while IFS= read -r cle; do printf '%s%s\n' "$racine" "$cle"; done
    exit 0
    ;;

  cat)
    objet="$(chemin_local "$1")"
    # Le code 1 sur l'objet absent est la propriété dont dépend le contrôle des
    # OBJETS VITAUX (étape 8) : un faux `cat` complaisant rendrait ce contrôle
    # vert en toutes circonstances, c'est-à-dire inutile.
    [ -f "$objet" ] || exit 1
    cat "$objet"
    exit 0
    ;;

  rm)
    rm -f "$(chemin_local "$1")"
    exit 0
    ;;

  *)
    exit 0
    ;;
esac
