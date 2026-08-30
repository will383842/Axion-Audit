#!/usr/bin/env bash
# =============================================================================
# infra/scripts/empreinte-docker.sh — MESURER, puis BORNER, l'empreinte disque
# de la pile d'audit sur une machine PARTAGÉE (`axionia-web`).
#
# Applique : `infra/COHABITATION_AXIONIA_WEB.md` §3bis (le coût disque de
# « construire sur le serveur »), 11 §2 (rien qui puisse atteindre le voisin),
# 02 §11.3 (alerte sur le canal interne).
#
# -----------------------------------------------------------------------------
# CE SCRIPT NE FAIT JAMAIS DE `prune`. C'EST SA RAISON D'ÊTRE.
# -----------------------------------------------------------------------------
# `docker system prune`, `docker volume prune`, `docker image prune -a`,
# `docker builder prune` : AUCUNE de ces commandes ne sait distinguer nos objets
# de ceux d'`axion-ia.com`, de Docuseal, de Plausible et de Coolify, qui vivent
# sur le MÊME démon Docker. Sur cette machine, elles ne sont pas « risquées » :
# elles sont hors sujet. Ce script n'en contient aucune, et son mode d'élagage
# n'appelle jamais qu'une seule commande destructrice — `docker rmi <id>` — sur
# des images qu'il a d'abord nommées une par une et vérifiées non référencées.
#
# La règle est mécanique et vérifiable en lisant le code : la seule fonction qui
# supprime quoi que ce soit est `supprimer_image_isolee`, elle refuse tout ce qui
# ne commence pas par `axion-audit-`, et elle refuse tout ce qu'un conteneur
# utilise — le nôtre comme celui du voisin.
#
# -----------------------------------------------------------------------------
# CE QU'IL NE TOUCHERA JAMAIS, EN AUCUN MODE
# -----------------------------------------------------------------------------
#   · les VOLUMES — les nôtres (données de staging) comme ceux du voisin.
#     Aucun `docker volume rm`, aucun `docker volume prune`. Un volume ne se
#     supprime qu'à la main, par un humain qui sait ce qu'il contient.
#   · les RÉSEAUX — `axion-audit-coolify-interne`, `coolify`, et tous les autres.
#   · les CONTENEURS — aucun `stop`, `rm`, ni `container prune`.
#   · le CACHE DE BUILD — voir §« Pourquoi nous n'élaguons pas le cache ».
#   · toute image dont le dépôt ne commence pas par `axion-audit-`.
#   · toute image référencée par un conteneur, même arrêté, même au voisin.
#
# -----------------------------------------------------------------------------
# POURQUOI NOUS N'ÉLAGUONS PAS LE CACHE DE BUILD, ALORS QU'IL EST LE POSTE N° 1
# -----------------------------------------------------------------------------
# Mesuré le 2026-08-28 : 6,46 Go de cache de build, dont 4,61 Go attribuables à
# nos constructions (141 enregistrements sur 528). C'est notre plus gros poste,
# et de loin — nos images pèsent 1,1 Go, nos volumes 89 Mo.
#
# Et pourtant nous n'y touchons pas, pour deux raisons qui se cumulent :
#
#   1. BuildKit n'offre AUCUN filtre de propriété. `docker builder prune` ne sait
#      pas ce qui est à nous : il n'accepte que `--filter until=<durée>` et
#      `--keep-storage`. Un élagage « de notre cache » élaguerait celui du voisin
#      dans la même commande, et lui coûterait une reconstruction complète.
#   2. Ce cache est DÉJÀ élagué deux fois par jour par deux autres acteurs, sans
#      nous : le crontab de la machine (`docker builder prune -af
#      --keep-storage 2GB`, toutes les 6 h) et le nettoyage forcé de Coolify
#      (`docker builder prune -af`, tous les jours à 00:00). Ajouter un TROISIÈME
#      élagueur sur un objet partagé déjà sur-élagué ne libère rien de plus : il
#      ne fait qu'augmenter la probabilité qu'une construction en cours — la
#      nôtre ou celle du voisin — perde son cache au milieu.
#
# La bonne action sur ce poste n'est donc pas d'élaguer davantage. C'est de
# MESURER (mode `mesurer`) et d'ALERTER avant le seuil, ce que fait ce script.
# =============================================================================
set -euo pipefail

# Préfixe qui définit « à nous ». Tout ce qui ne le porte pas est intouchable.
# Il vient des clés `image:` de `infra/docker-compose.coolify.yml` : les six
# images de la pile sont `axion-audit-{api,worker,field,hq,postgres,caddy}`.
PREFIXE_NOS_IMAGES='axion-audit-'

# Seuil d'occupation du disque au-delà duquel la machine alerte. Il n'est pas
# choisi par nous : c'est celui du voisin (crontab `disk-alert`, toutes les
# 30 min) ET celui de Coolify (`server_disk_usage_notification_threshold`).
# On alerte AVANT lui, pas en même temps que lui.
SEUIL_ALERTE_POURCENT="${SEUIL_ALERTE_POURCENT:-80}"
SEUIL_VIGILANCE_POURCENT="${SEUIL_VIGILANCE_POURCENT:-70}"

# Coût mesuré d'une construction complète de la pile, en Mo de cache de build.
# Établi le 2026-08-28 : 3,81 Go de cache récurrent (hors tirages d'images de
# base, non répétés) pour 5 constructions complètes. Sert uniquement à projeter
# une échéance ; il se réévalue en relisant la sortie du mode `mesurer`.
COUT_CACHE_PAR_BUILD_MO="${COUT_CACHE_PAR_BUILD_MO:-760}"

ACTION='mesurer'
CONFIRMER='non'

usage() {
  cat <<'FIN'
Usage : empreinte-docker.sh [mesurer|elaguer] [--confirmer]

  mesurer     (défaut) N'ÉCRIT RIEN. Mesure l'empreinte de la pile d'audit,
              la compare à celle de la machine, et projette la date à laquelle
              le seuil d'alerte serait atteint si plus rien n'élaguait.

  elaguer     Supprime, une par une, les images `axion-audit-*` DÉCLASSÉES :
              au-delà des N plus récentes de leur dépôt ET utilisées par aucun
              conteneur. La plus récente d'un dépôt n'est jamais supprimable.
              SANS `--confirmer`, il n'affiche que ce qu'il ferait (blanc).
              Il ne touche NI aux volumes, NI aux réseaux, NI aux conteneurs,
              NI au cache de build, NI à quoi que ce soit du voisin.

Variables : SEUIL_ALERTE_POURCENT (80) · SEUIL_VIGILANCE_POURCENT (70)
            COUT_CACHE_PAR_BUILD_MO (760) · DEPLOIEMENTS_PAR_JOUR (5)
            IMAGES_GARDEES_PAR_DEPOT (2)
FIN
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    mesurer | elaguer)
      ACTION="$1"
      shift
      ;;
    --confirmer)
      CONFIRMER='oui'
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Argument inconnu : $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || {
  echo 'docker est introuvable sur cette machine.' >&2
  exit 1
}

titre() { printf '\n=== %s ===\n' "$*"; }

# -----------------------------------------------------------------------------
# `en_mo` — convertit les tailles de Docker (« 1.92GB », « 619MB », « 45.1kB »)
# en mégaoctets. Docker mêle les unités dans une même colonne ; les additionner
# sans convertir est l'erreur qui fait sous-estimer une empreinte d'un facteur
# mille, et c'est précisément l'erreur qui a laissé ce poste non chiffré.
# -----------------------------------------------------------------------------
en_mo() {
  awk '{
    n = $0 + 0
    if ($0 ~ /GB/) { printf "%.1f", n * 1000 }
    else if ($0 ~ /MB/) { printf "%.1f", n }
    else if ($0 ~ /kB/) { printf "%.4f", n / 1000 }
    else if ($0 ~ /B/)  { printf "%.6f", n / 1000000 }
    else { printf "%.1f", n }
  }'
}

# -----------------------------------------------------------------------------
# `nos_images` — les images de la pile, par ID. Le filtre `reference=` est
# appliqué par le démon : rien du voisin ne peut entrer dans cette liste, même
# si le préfixe était mal saisi (il ne correspondrait alors à rien).
# -----------------------------------------------------------------------------
nos_images() {
  docker images --format '{{.ID}}\t{{.Repository}}:{{.Tag}}\t{{.Size}}' \
    --filter "reference=${PREFIXE_NOS_IMAGES}*" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# `images_referencees` — l'ensemble des images utilisées par un conteneur,
# EN COURS OU ARRÊTÉ, à nous comme au voisin. C'est le garde-fou : rien de ce
# qui figure dans cette liste ne sera jamais supprimé.
#
# `docker ps -a` et non `docker ps` : un conteneur arrêté est un conteneur qu'on
# peut redémarrer, et lui retirer son image le condamne silencieusement. C'est
# exactement ce qui est arrivé aux conteneurs `postgres` et `caddy` du staging
# le 2026-08-28 (voir COHABITATION_AXIONIA_WEB.md §3bis).
# -----------------------------------------------------------------------------
images_referencees() {
  docker ps -a --format '{{.ID}}' | while read -r c; do
    [[ -n "$c" ]] || continue
    docker inspect "$c" --format '{{.Image}}' 2>/dev/null || true
  done
}

mesurer() {
  titre 'Disque de la machine'
  df -h / | awk 'NR==1 || NR==2'
  local occupe_pct
  occupe_pct="$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"

  titre "Nos images (${PREFIXE_NOS_IMAGES}*)"
  local total_images_mo=0 nb_images=0 id nom taille mo
  if [[ -n "$(nos_images)" ]]; then
    while IFS=$'\t' read -r id nom taille; do
      [[ -n "${id:-}" ]] || continue
      mo="$(printf '%s' "$taille" | en_mo)"
      printf '  %-42s %10s\n' "$nom" "$taille"
      total_images_mo="$(awk -v a="$total_images_mo" -v b="$mo" 'BEGIN{printf "%.1f", a+b}')"
      nb_images=$((nb_images + 1))
    done < <(nos_images)
  fi
  printf '  --> %d image(s), %s Mo cumulés (les couches de base sont comptées plusieurs fois)\n' \
    "$nb_images" "$total_images_mo"

  # ---------------------------------------------------------------------------
  # Images ORPHELINES DE L'INDEX : un conteneur tourne sur une image que Docker
  # ne connaît plus. Ce n'est pas une curiosité, c'est une panne en attente —
  # cette image ne peut plus être recréée ni redéployée, et le conteneur ne
  # survivra pas à sa prochaine recréation. On la signale AVANT l'incident.
  # ---------------------------------------------------------------------------
  titre 'Conteneurs tournant sur une image absente de l index (anomalie)'
  local trouve='non' n img
  while read -r n; do
    [[ -n "$n" ]] || continue
    img="$(docker inspect "$n" --format '{{.Image}}' 2>/dev/null || true)"
    [[ -n "$img" ]] || continue
    if ! docker image inspect "$img" >/dev/null 2>&1; then
      printf '  ANOMALIE  %-46s -> %s\n' "$n" "${img:0:19}…"
      trouve='oui'
    fi
  done < <(docker ps -a --format '{{.Names}}')
  if [[ "$trouve" == 'non' ]]; then
    echo '  (aucune — situation saine)'
  fi

  titre 'Nos volumes'
  local vol
  for vol in $(docker volume ls --format '{{.Name}}' | grep -E 'wrunr6mwq2oxqq392i4myzjn|axion' || true); do
    printf '  %s\n' "$vol"
  done
  echo '  (taille : voir `docker system df -v` — un volume ne s élague JAMAIS ici)'

  titre 'Cache de build — PARTAGÉ, non attribuable, non élagué par ce script'
  docker system df 2>/dev/null | awk 'NR==1 || /Build Cache/'
  echo '  Déjà élagué par le crontab de la machine (toutes les 6 h) et par'
  echo '  Coolify (tous les jours à 00:00). Nous ne nous ajoutons pas à eux.'

  # ---------------------------------------------------------------------------
  # Projection. Elle répond à UNE question : « si plus rien n'élaguait, dans
  # combien de temps le seuil du voisin serait-il atteint par NOTRE seule
  # croissance ? » Elle ne modélise pas le voisin, dont le rythme ne nous
  # appartient pas — elle borne ce dont nous sommes responsables.
  # ---------------------------------------------------------------------------
  titre 'Projection — notre croissance seule, tout élagage suspendu'
  local deploiements_jour="${DEPLOIEMENTS_PAR_JOUR:-5}"
  local total_ko utilise_ko seuil_ko marge_mo par_jour_mo jours
  read -r total_ko utilise_ko < <(df -k / | awk 'NR==2 {print $2, $3}')
  seuil_ko="$(awk -v t="$total_ko" -v s="$SEUIL_ALERTE_POURCENT" 'BEGIN{printf "%d", t*s/100}')"
  marge_mo="$(awk -v s="$seuil_ko" -v u="$utilise_ko" 'BEGIN{printf "%.0f", (s-u)/1024}')"
  par_jour_mo="$(awk -v c="$COUT_CACHE_PAR_BUILD_MO" -v d="$deploiements_jour" 'BEGIN{printf "%.0f", c*d}')"
  printf '  Occupation actuelle ........ %s %%\n' "$occupe_pct"
  printf '  Seuil d alerte ............. %s %%\n' "$SEUIL_ALERTE_POURCENT"
  printf '  Marge avant le seuil ....... %s Mo\n' "$marge_mo"
  printf '  Hypothèse .................. %s déploiement(s)/jour x %s Mo\n' \
    "$deploiements_jour" "$COUT_CACHE_PAR_BUILD_MO"
  if [[ "$marge_mo" -le 0 ]]; then
    printf '  ÉCHÉANCE ................... SEUIL DÉJÀ FRANCHI\n'
  elif [[ "$par_jour_mo" -le 0 ]]; then
    printf '  ÉCHÉANCE ................... aucune croissance déclarée\n'
  else
    jours="$(awk -v m="$marge_mo" -v p="$par_jour_mo" 'BEGIN{printf "%.1f", m/p}')"
    printf '  ÉCHÉANCE ................... ~%s jour(s)\n' "$jours"
  fi

  titre 'Verdict'
  if [[ "$occupe_pct" -ge "$SEUIL_ALERTE_POURCENT" ]]; then
    echo "  ALERTE : ${occupe_pct} % — le seuil de ${SEUIL_ALERTE_POURCENT} % est franchi."
    echo '  NE PAS lancer `docker system prune` : la machine est partagée.'
    return 1
  elif [[ "$occupe_pct" -ge "$SEUIL_VIGILANCE_POURCENT" ]]; then
    echo "  VIGILANCE : ${occupe_pct} % — au-delà de ${SEUIL_VIGILANCE_POURCENT} %."
    return 0
  fi
  echo "  Normal : ${occupe_pct} % (vigilance à ${SEUIL_VIGILANCE_POURCENT} %, alerte à ${SEUIL_ALERTE_POURCENT} %)."
  return 0
}

# -----------------------------------------------------------------------------
# LA RÈGLE D'ÉLAGAGE — ET POURQUOI « NON RÉFÉRENCÉE » NE SUFFIT PAS
# -----------------------------------------------------------------------------
# La première version de ce script supprimait toute image `axion-audit-*` qu'aucun
# conteneur n'utilisait. Passée à blanc sur le staging le 2026-08-28, elle a
# proposé de supprimer `axion-audit-postgres:16-coolify` et `axion-audit-caddy:
# coolify` — les DEUX SEULES COPIES RESTANTES de ces images. Elles paraissaient
# orphelines pour une raison qui est justement l'incident : les conteneurs qui
# les servent tournent sur une image ANTÉRIEURE, disparue de l'index. « Non
# référencée » y désignait donc non pas une image morte, mais la seule vivante.
#
# La règle retenue est celle de la RÉTENTION PAR DÉPÔT, la même que Coolify
# applique à ses propres applications (`docker_images_to_keep`, défaut 2) :
#
#   pour chaque dépôt `axion-audit-<service>`, on trie les images de la plus
#   récente à la plus ancienne, on GARDE INCONDITIONNELLEMENT les N premières,
#   et parmi les suivantes on ne supprime que celles qu'aucun conteneur n'utilise.
#
# Elle a trois propriétés qui manquaient à la première :
#   · la plus récente d'un dépôt n'est JAMAIS supprimable — quoi qu'il arrive,
#     il reste toujours de quoi recréer le service ;
#   · elle est un NO-OP tant que les tags sont fixes (`:coolify`), ce qui est
#     l'état actuel : un tag fixe = une seule image par dépôt = rang 0 = gardée ;
#   · elle devient utile SANS RÉÉCRITURE le jour où les images seront taguées
#     par commit — le changement recommandé pour rendre le retour arrière
#     possible (voir .github/workflows/deploy-staging.yml). C'est alors, et
#     seulement alors, que les images s'accumuleront et devront être bornées.
# -----------------------------------------------------------------------------
IMAGES_GARDEES_PAR_DEPOT="${IMAGES_GARDEES_PAR_DEPOT:-2}"

# -----------------------------------------------------------------------------
# `supprimer_image_declassee` — LA SEULE FONCTION DESTRUCTRICE DE CE FICHIER.
# Quatre verrous, dans cet ordre, avant tout `docker rmi` :
#   1. le nom doit commencer par `axion-audit-` ;
#   2. l'image doit être DÉCLASSÉE : au-delà des N plus récentes de son dépôt ;
#   3. l'image ne doit être référencée par AUCUN conteneur (`docker ps -a`) ;
#   4. `--confirmer` doit avoir été passé.
# Un seul verrou qui manque, et la fonction rend la main sans rien supprimer.
# -----------------------------------------------------------------------------
supprimer_image_declassee() {
  local id="$1" nom="$2" rang="$3" referencees="$4"

  case "$nom" in
    "${PREFIXE_NOS_IMAGES}"*) ;;
    *)
      printf '  REFUS     %s — hors du préfixe %s\n' "$nom" "$PREFIXE_NOS_IMAGES"
      return 0
      ;;
  esac

  if [[ "$rang" -lt "$IMAGES_GARDEES_PAR_DEPOT" ]]; then
    printf '  GARDÉE    %-42s (rang %s des plus récentes de son dépôt)\n' "$nom" "$rang"
    return 0
  fi

  if printf '%s\n' "$referencees" | grep -q "^${id}"; then
    printf '  CONSERVÉE %-42s (un conteneur l utilise)\n' "$nom"
    return 0
  fi

  if [[ "$CONFIRMER" != 'oui' ]]; then
    printf '  À BLANC   %-42s serait supprimée (--confirmer pour agir)\n' "$nom"
    return 0
  fi

  printf '  SUPPRIME  %-42s ' "$nom"
  if docker rmi "$id" >/dev/null 2>&1; then
    echo 'ok'
  else
    echo 'refusée par Docker (image encore utilisée) — conservée'
  fi
}

elaguer() {
  titre "Élagage — images axion-audit-* déclassées (rétention : ${IMAGES_GARDEES_PAR_DEPOT}/dépôt)"
  if [[ "$CONFIRMER" != 'oui' ]]; then
    echo '  MODE À BLANC : aucune suppression. Ajouter --confirmer pour agir.'
  fi
  echo '  Volumes, réseaux, conteneurs et cache de build : NON CONCERNÉS.'
  echo

  # Résolue UNE fois : la liste ne doit pas changer sous nos pieds pendant la
  # boucle. On y met les ID complets tels que `docker inspect` les rend.
  local referencees
  referencees="$(images_referencees | sed 's/^sha256://')"

  # Rang de chaque image DANS SON DÉPÔT, 0 = la plus récente. `CreatedAt` est
  # rendu par Docker au format `AAAA-MM-JJ HH:MM:SS +0000 UTC`, dont l'ordre
  # lexicographique est l'ordre chronologique : `sort` suffit, sans conversion.
  local classees
  classees="$(
    docker images --format '{{.Repository}}\t{{.CreatedAt}}\t{{.ID}}\t{{.Repository}}:{{.Tag}}' \
      --filter "reference=${PREFIXE_NOS_IMAGES}*" 2>/dev/null \
      | sort -t"$(printf '\t')" -k1,1 -k2,2r \
      | awk -F'\t' '{ if ($1 != depot) { depot = $1; rang = 0 } else { rang++ }
                      printf "%s\t%s\t%s\n", $3, $4, rang }'
  )"

  local id nom rang vu='non'
  while IFS=$'\t' read -r id nom rang; do
    [[ -n "${id:-}" ]] || continue
    vu='oui'
    # `docker images` rend un ID court ; les références sont longues. On compare
    # sur le préfixe court, que Docker garantit non ambigu sur une même machine.
    supprimer_image_declassee "$id" "$nom" "$rang" "$referencees"
  done <<<"$classees"
  if [[ "$vu" == 'non' ]]; then
    echo '  (aucune image axion-audit-* sur cette machine)'
  fi

  echo
  echo '  Rappel : si une image de la pile a disparu, elle se reconstruit par un'
  echo '  déploiement Coolify (~70 s) — voir la procédure de retour arrière dans'
  echo '  .github/workflows/deploy-staging.yml.'
  return 0
}

case "$ACTION" in
  mesurer) mesurer ;;
  elaguer) elaguer ;;
esac
