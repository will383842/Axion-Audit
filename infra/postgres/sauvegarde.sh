#!/bin/bash
# =============================================================================
# infra/postgres/sauvegarde.sh — SAUVEGARDE PLANIFIÉE, PostgreSQL ET MinIO
# Applique : invariant 8 (« sauvegarde disponible ET TESTÉE »), 02 §11.4
# (WAL archiving + sauvegarde complète, copie CHIFFRÉE, rétention 30 j),
# 07 ligne L0 (« restauration Postgres ET MinIO testée depuis zéro »).
#
# -----------------------------------------------------------------------------
# POURQUOI CE SCRIPT EXISTE — LA MÊME LEÇON QUE `stanza-create.sh`, AU CRAN
# SUIVANT
# -----------------------------------------------------------------------------
# Le 2026-08-28, le staging avait une stanza pgBackRest valide, un dépôt chiffré
# et un archivage WAL sans un seul échec — et AUCUNE sauvegarde complète.
# `pgbackrest info` répondait `status: error (no valid backups)`.
# Ce n'est pas un détail de configuration : SANS SAUVEGARDE COMPLÈTE, LES WAL
# ARCHIVÉS NE SE REJOUENT SUR RIEN. Un `restore` échoue faute de point de départ.
# La chaîne avait donc toutes les apparences d'une chaîne de sauvegarde, et rien
# de restaurable au bout.
#
# La cause n'est pas un oubli : `pgbackrest backup` n'était appelé par rien. Une
# commande qu'un humain doit taper sera oubliée — c'est exactement ce qui était
# arrivé à `stanza-create`, corrigé par `infra/postgres/stanza-create.sh` et le
# job `createstanza` du compose. Ce script est le même geste : la sauvegarde
# devient un SERVICE de la pile, versionné, planifié, dont l'échec se voit.
#
# -----------------------------------------------------------------------------
# CE QU'IL FAIT, EN UNE PASSE
# -----------------------------------------------------------------------------
#  1. PostgreSQL : `pgbackrest backup` — complète le jour dit, incrémentale les
#     autres jours. Dépôt CHIFFRÉ (aes-256-cbc, déjà en place), rétention portée
#     par l'environnement.
#  2. MinIO : archive `tar + zstd + gpg AES256` du volume de données, monté en
#     LECTURE SEULE, puis rotation par nombre.
#  3. Marqueur de passe réussie (`$ARCHIVES/.derniere-passe`), qui sert au
#     rattrapage au démarrage.
#
# -----------------------------------------------------------------------------
# POURQUOI UN SIDE-CAR, ET PAS AUTRE CHOSE — LE CHOIX EST MESURÉ
# -----------------------------------------------------------------------------
# · BullMQ (déjà dans la pile, 11 §1) a été ÉCARTÉ : le worker est un runtime
#   Node qui n'a ni `pgbackrest`, ni le répertoire de données, ni le socket de
#   PostgreSQL. Les lui donner reviendrait à ouvrir au code applicatif un accès
#   brut aux fichiers de la base — une élévation de privilège pour aucun gain.
# · LES TÂCHES PLANIFIÉES DE COOLIFY ont été ÉCARTÉES : leur définition vit dans
#   la base de Coolify, pas dans ce dépôt. Elle serait invisible à `git`, absente
#   d'une reconstruction, et personne ne verrait qu'elle a disparu. C'est
#   littéralement le défaut que ce lot vient de corriger deux fois.
# · RESTE LE CONTENEUR DE PLANIFICATION, retenu ici. Il est versionné, il part
#   avec la pile, et son échec est visible là où on regarde déjà (`docker ps`).
#
# CE QU'IL NE COUVRE PAS — à lire avant de s'y fier :
#   · pile arrêtée = aucune sauvegarde. Un conteneur ne se réveille pas seul.
#   · aucune alerte sortante (ni Telegram, ni courriel) : l'échec se voit dans
#     `docker ps` et dans les journaux, PAS dans une notification. 02 §11.3
#     prévoit Uptime Kuma ; il n'est pas déployé.
#   · AUCUNE COPIE HORS SERVEUR. Le dépôt pgBackRest et les archives MinIO vivent
#     sur le disque qu'ils protègent. La règle 3-2-1 du 02 §11.4 n'est PAS tenue.
#     La destination est une décision humaine (coût, contrat, identifiants) :
#     voir « POINT D'INSERTION » plus bas et la fiche d'escalade du README.
#   · il ne teste pas la restauration. Le test de restauration est un geste
#     distinct, joué à la main le 2026-08-28 (infra/README.md §5.4) ; l'automatiser
#     suppose de trancher le nom de projet Compose sous Coolify (README §6.2).
#
# -----------------------------------------------------------------------------
# POURQUOI `bash` ET NON `sh` — CE N'EST PAS UN CONFORT
# -----------------------------------------------------------------------------
# `set -o pipefail` n'existe pas en POSIX. Sans lui, dans
# `tar … | zstd | gpg -o archive`, un `tar` qui échoue laisse `gpg` réussir : on
# obtient une archive PARFAITEMENT VALIDE d'un contenu TRONQUÉ, et le script sort
# en 0. C'est la panne la plus coûteuse qu'un script de sauvegarde puisse écrire.
# `stanza-create.sh` peut rester en `sh` (aucun tube) ; celui-ci ne peut pas.
# =============================================================================
set -euo pipefail

# Tout ce que ce script écrit — archives, empreintes, marqueur — n'appartient
# qu'à `postgres`. Les archives sont chiffrées, mais 02 §30.4-2 vaut aussi pour
# ce qui les entoure, et une archive en 644 dans un volume est une invitation
# gratuite. MESURÉ sans cette ligne : `gpg` produisait des fichiers en 0644.
umask 077

# -----------------------------------------------------------------------------
# Paramètres — tous portés par l'environnement, aucun secret ici (02 §30.4-1/5)
# -----------------------------------------------------------------------------
STANZA="${PGBACKREST_STANZA:-axion}"
ARCHIVES="${AXION_ARCHIVES:-/sauvegarde}"
MINIO_DONNEES="${AXION_MINIO_DONNEES:-/minio-donnees}"

# Créneau quotidien, en UTC (invariant 5 : l'heure de la base et des ops est UTC).
HEURE="${AXION_SAUVEGARDE_HEURE:-02:30}"
# Jour de la sauvegarde COMPLÈTE, au format `date +%w` : 0 = dimanche.
# Les autres jours produisent une INCRÉMENTALE (02 §11.4 : « full hebdo /
# incrémental quotidien »).
JOUR_COMPLETE="${AXION_SAUVEGARDE_JOUR_COMPLETE:-0}"

# Rattrapage au démarrage : si la dernière passe réussie est plus vieille que
# cette tolérance — ou si elle n'existe pas — une passe part IMMÉDIATEMENT.
# 26 h = un jour plus deux heures de marge : un redéploiement en milieu de
# journée ne relance donc pas une sauvegarde déjà faite le matin même.
TOLERANCE_H="${AXION_SAUVEGARDE_TOLERANCE_H:-26}"

# RÉTENTION — DÉCIDÉE, PAS SUBIE.
# PostgreSQL : portée par pgBackRest lui-même (PGBACKREST_REPO1_RETENTION_FULL,
# type `time`), valeur ${BACKUP_RETENTION_DAYS} — 30 jours (02 §11.4).
# MinIO : le MÊME horizon, exprimé en NOMBRE d'archives puisqu'il y en a une par
# jour. L'alignement n'est pas cosmétique : une restauration PostgreSQL de J-25
# désignerait des pièces jointes qu'aucune archive MinIO ne contiendrait plus si
# MinIO était gardé moins longtemps. Deux rétentions différentes, c'est une
# restauration à moitié possible.
MINIO_ARCHIVES_GARDEES="${AXION_MINIO_ARCHIVES_GARDEES:-${BACKUP_RETENTION_DAYS:-30}}"

# GARDE-FOU DE DISQUE — la machine est PARTAGÉE (02 §11.3 : alerte disque > 80 %).
# Les archives MinIO sont des copies COMPLÈTES : leur empreinte croît linéairement
# avec la rétention. Plutôt que de remplir un disque qui héberge aussi autre
# chose, ce script REFUSE de continuer et le dit. Un refus bruyant vaut mieux
# qu'un disque plein silencieux.
ARCHIVES_MAX_MO="${AXION_ARCHIVES_MAX_MO:-20480}"   # plafond du répertoire d'archives
ARCHIVES_MARGE_MO="${AXION_ARCHIVES_MARGE_MO:-2048}" # espace libre exigé avant d'écrire

PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"

journal() { printf 'sauvegarde: %s\n' "$*"; }
echouer() { printf 'sauvegarde: ECHEC — %s\n' "$*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# Contrôles d'entrée — un paramètre absurde doit se voir au DÉMARRAGE, pas à
# 02h30 du matin dans un journal que personne ne lit.
# -----------------------------------------------------------------------------
[ -n "$PASSPHRASE" ] || echouer 'BACKUP_ENCRYPTION_PASSPHRASE est vide : les archives MinIO seraient en clair.'
case "$HEURE" in
  [0-2][0-9]:[0-5][0-9]) : ;;
  *) echouer "AXION_SAUVEGARDE_HEURE='$HEURE' — format attendu HH:MM (UTC)." ;;
esac
case "$JOUR_COMPLETE" in
  [0-6]) : ;;
  *) echouer "AXION_SAUVEGARDE_JOUR_COMPLETE='$JOUR_COMPLETE' — attendu 0..6 (0 = dimanche)." ;;
esac
[ -d "$MINIO_DONNEES" ] || echouer "$MINIO_DONNEES absent : le volume de données MinIO n'est pas monté."
mkdir -p "$ARCHIVES"

# -----------------------------------------------------------------------------
# MinIO — archive chiffrée du volume de données
#
# POURQUOI LE VOLUME ET NON `mc mirror`. Les deux voies ont été JOUÉES sur des
# instances jetables le 2026-08-28 (README §5.5) ; les deux restaurent les objets
# à l'octet près. Celle-ci a été retenue pour trois raisons mesurées :
#   · elle restitue AUSSI `.minio.sys` — politiques d'accès, versioning, comptes.
#     La restauration par `mc mirror` a rendu des buckets qu'il fallait recréer
#     et re-verrouiller à la main (`mc anonymous set none`), et elle avait PERDU
#     l'état de versioning. Une sauvegarde qui oblige à se souvenir d'un réglage
#     de sécurité est une sauvegarde qui le perdra ;
#   · elle tient dans UN conteneur : l'image `minio/mc` n'a ni `tar`, ni `gzip`,
#     ni `gpg`, ni `openssl` (mesuré). Passer par elle imposait un répertoire
#     intermédiaire EN CLAIR, sur le même disque, contenant des pièces jointes
#     d'audit. Ici, rien n'est jamais écrit en clair hors du volume MinIO ;
#   · elle ne demande aucun identifiant MinIO : le volume suffit, l'API n'est pas
#     appelée. Un compte de moins à porter, à faire tourner et à fuir.
#
# CE QU'ELLE COÛTE, ET IL FAUT LE SAVOIR : la copie est « cohérente au crash »,
# pas transactionnelle. Un objet en cours d'écriture peut être capturé à moitié ;
# MinIO le traite au démarrage comme après une coupure de courant. `mc mirror`
# n'offrait pas mieux : lui aussi lit une cible qui bouge.
# -----------------------------------------------------------------------------
archiver_minio() {
  local horodatage cible partiel empreinte_source empreinte_relue travail
  horodatage="$(date -u +%Y%m%dT%H%M%SZ)"
  cible="$ARCHIVES/minio-$horodatage.tar.zst.gpg"
  partiel="$cible.partiel"

  # Espace libre AVANT d'écrire : un `gpg` interrompu par un disque plein laisse
  # un fichier partiel, et un disque plein sur une machine partagée est un
  # incident pour le voisin autant que pour nous.
  local libre_mo
  libre_mo="$(df -Pm "$ARCHIVES" | awk 'NR==2 {print $4}')"
  [ "$libre_mo" -ge "$ARCHIVES_MARGE_MO" ] || echouer \
    "espace libre sur $ARCHIVES : ${libre_mo} Mo < marge exigée ${ARCHIVES_MARGE_MO} Mo. Aucune archive écrite."

  travail="$(mktemp -d)"
  # shellcheck disable=SC2064  # $travail doit être développé MAINTENANT, pas au piège
  trap "rm -rf '$travail'" EXIT
  ( umask 077; printf %s "$PASSPHRASE" > "$travail/pp" )

  journal "MinIO : archive chiffrée de $MINIO_DONNEES → $(basename "$cible")"

  # L'empreinte est prise SUR LE FLUX LU, au vol : refaire un `tar` de la source
  # pour comparer ne prouverait rien (les horodatages d'un volume vivant bougent).
  tar -C "$MINIO_DONNEES" -cf - . \
    | tee >(sha256sum | cut -d' ' -f1 > "$travail/source") \
    | zstd -3 -q \
    | gpg --batch --quiet --symmetric --cipher-algo AES256 \
          --passphrase-file "$travail/pp" --pinentry-mode loopback \
          -o "$partiel"

  # VÉRIFICATION DE BOUT EN BOUT — ce qui distingue une archive d'un fichier.
  # On redéchiffre, on redécompresse, et on compare l'empreinte du flux obtenu à
  # celle du flux lu. Une archive qui ne se relit pas n'est pas une sauvegarde ;
  # le seul moment où l'on peut s'en apercevoir sans dommage est maintenant.
  empreinte_source="$(cat "$travail/source")"
  empreinte_relue="$(gpg --batch --quiet --decrypt --passphrase-file "$travail/pp" \
                        --pinentry-mode loopback "$partiel" \
                      | zstd -d -q | sha256sum | cut -d' ' -f1)"
  if [ "$empreinte_source" != "$empreinte_relue" ]; then
    rm -f "$partiel"
    echouer "l'archive MinIO ne se relit pas à l'identique (source $empreinte_source, relue $empreinte_relue)."
  fi

  # Publication ATOMIQUE : tant que la vérification n'a pas réussi, le fichier
  # porte `.partiel` et aucune rotation ne peut le confondre avec une archive.
  mv "$partiel" "$cible"
  # Empreinte du CHIFFRÉ, en chemin RELATIF : un `sha256sum -c` doit pouvoir se
  # rejouer depuis le répertoire d'archives, où qu'il ait été recopié.
  ( cd "$ARCHIVES" && sha256sum "$(basename "$cible")" > "$(basename "$cible").sha256" )
  journal "MinIO : archive vérifiée ($(du -h "$cible" | cut -f1)), empreinte du contenu ${empreinte_source:0:16}…"

  rm -rf "$travail"
  trap - EXIT
}

# -----------------------------------------------------------------------------
# Rotation des archives MinIO — par NOMBRE, jamais par date de fichier.
# Une règle « plus vieux que N jours » se fie à un horodatage de système de
# fichiers, qu'une copie, une restauration ou un `touch` déplacent. Le rang, lui,
# ne ment pas : on garde les N plus récentes, point.
# -----------------------------------------------------------------------------
faire_tourner_minio() {
  local total garde=0
  # Les noms sont produits par ce script seul : `minio-<horodatage>.tar.zst.gpg`.
  # Aucun espace, aucun caractère exotique — le tri de `ls` est donc sûr ici, et
  # l'horodatage est trié lexicographiquement comme chronologiquement.
  local f
  for f in $(ls -1 "$ARCHIVES" 2>/dev/null | grep -E '^minio-[0-9]{8}T[0-9]{6}Z\.tar\.zst\.gpg$' | sort -r); do
    garde=$((garde + 1))
    if [ "$garde" -gt "$MINIO_ARCHIVES_GARDEES" ]; then
      journal "rotation : suppression de $f (au-delà des $MINIO_ARCHIVES_GARDEES gardées)"
      rm -f "$ARCHIVES/$f" "$ARCHIVES/$f.sha256"
    fi
  done
  # Les `.partiel` d'une passe interrompue ne sont pas des archives : ils ne
  # doivent ni compter dans la rétention, ni s'accumuler.
  find "$ARCHIVES" -maxdepth 1 -name '*.partiel' -mmin +120 -delete

  total="$(du -sm "$ARCHIVES" | cut -f1)"
  journal "archives MinIO : $((garde < MINIO_ARCHIVES_GARDEES ? garde : MINIO_ARCHIVES_GARDEES)) fichier(s), ${total} Mo au total"
  [ "$total" -le "$ARCHIVES_MAX_MO" ] || echouer \
    "le répertoire d'archives pèse ${total} Mo, au-delà du plafond ${ARCHIVES_MAX_MO} Mo.
        Ce n'est PAS un incident technique : c'est la rétention qui n'est plus
        soutenable sur ce disque. À trancher (Williams) : baisser
        AXION_MINIO_ARCHIVES_GARDEES, augmenter AXION_ARCHIVES_MAX_MO, ou —
        la seule vraie réponse — sortir les archives du serveur (02 §11.4)."
}

# -----------------------------------------------------------------------------
# PostgreSQL — sauvegarde pgBackRest
#
# Le TYPE vient du calendrier. Il n'y a AUCUN test « existe-t-il déjà une
# complète ? » : pgBackRest promeut lui-même une incrémentale en complète quand
# aucune complète n'existe (« no prior backup exists, incr backup has been
# changed to full »). Écrire ce test ici créerait une seconde vérité, moins
# fiable que celle de pgBackRest — c'est le raisonnement de `stanza-create.sh`.
# -----------------------------------------------------------------------------
sauvegarder_postgres() {
  local type_sauvegarde jour
  jour="$(date -u +%w)"
  if [ "$jour" = "$JOUR_COMPLETE" ]; then type_sauvegarde=full; else type_sauvegarde=incr; fi
  journal "PostgreSQL : pgbackrest --stanza=$STANZA --type=$type_sauvegarde backup"
  pgbackrest --stanza="$STANZA" --type="$type_sauvegarde" --log-level-console=info backup
}

# -----------------------------------------------------------------------------
# Une passe = les deux moitiés du critère L0. Si l'une échoue, la passe échoue :
# une sauvegarde à moitié faite ne doit jamais compter pour une sauvegarde faite.
# -----------------------------------------------------------------------------
passe() {
  journal "=== passe du $(date -u '+%Y-%m-%d %H:%M:%SZ') ==="
  sauvegarder_postgres
  archiver_minio
  faire_tourner_minio
  date -u +%s > "$ARCHIVES/.derniere-passe"
  journal "=== passe terminée avec succès ==="
}

# -----------------------------------------------------------------------------
# Planification — recalculée à CHAQUE tour depuis l'horloge murale, jamais par
# accumulation de `sleep`. Une dérive de quelques secondes par jour finirait par
# déplacer la sauvegarde en pleine journée de collecte.
# -----------------------------------------------------------------------------
secondes_avant_creneau() {
  local maintenant cible
  maintenant="$(date -u +%s)"
  cible="$(date -u -d "today $HEURE" +%s)"
  # `if` et non `[ … ] && …` : sous `set -e`, une liste `&&` dont le test est
  # faux fait sortir la fonction avec un code non nul — le créneau du lendemain
  # serait alors lu comme une panne. Le piège classique, écrit ici pour qu'il ne
  # revienne pas.
  if [ "$cible" -le "$maintenant" ]; then
    cible="$(date -u -d "tomorrow $HEURE" +%s)"
  fi
  echo $((cible - maintenant))
}

doit_rattraper() {
  local derniere age
  [ -r "$ARCHIVES/.derniere-passe" ] || return 0
  derniere="$(cat "$ARCHIVES/.derniere-passe")"
  age=$(( ( $(date -u +%s) - derniere ) / 3600 ))
  [ "$age" -ge "$TOLERANCE_H" ]
}

journal "service de sauvegarde démarré — créneau ${HEURE} UTC, complète le jour ${JOUR_COMPLETE}, rétention MinIO ${MINIO_ARCHIVES_GARDEES} archives."

# RATTRAPAGE. C'est le point qui fait qu'une pile fraîchement déployée n'attend
# pas la nuit pour avoir sa première sauvegarde — le défaut mesuré le 2026-08-28
# était précisément une pile en bonne santé sans le moindre point de départ.
if doit_rattraper; then
  journal "aucune passe récente (ou aucune trace) — sauvegarde immédiate."
  passe
fi

# ÉCHEC = SORTIE NON NULLE, sans filet. Aucun `|| true`, aucune reprise
# silencieuse : `set -e` fait sortir la boucle et Docker redémarre le service
# (`restart: unless-stopped`), avec son propre recul exponentiel. Le compteur de
# redémarrages et l'état `Restarting` de `docker ps` SONT le signal. Un service
# qui resterait `Up` en échouant chaque nuit est exactement le garde-fou menteur
# que ce lot a passé sa journée à démonter.
while true; do
  attente="$(secondes_avant_creneau)"
  journal "prochaine passe dans ${attente} s (créneau ${HEURE} UTC)."
  sleep "$attente"
  passe
done
