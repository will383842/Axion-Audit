#!/bin/sh
# =============================================================================
# infra/postgres/stanza-create.sh — création MÉCANISÉE de la stanza pgBackRest
# Applique : invariant 8 (sauvegarde terrain, aucune donnée sur un seul support),
# 02 §11.4 (WAL archiving + dépôt chiffré), 07 ligne L0 (« restauration Postgres
# testée depuis zéro »).
#
# -----------------------------------------------------------------------------
# POURQUOI CE SCRIPT EXISTE — CE N'EST PAS UN OUBLI QU'IL CORRIGE, C'EST UNE
# CONCEPTION
# -----------------------------------------------------------------------------
# `stanza-create` était documenté comme une ÉTAPE MANUELLE (infra/README.md §5.3,
# DECISIONS.md). Elle n'a jamais été exécutée sur le staging, et personne ne
# pouvait le voir : la base affichait `healthy`. Conséquence mesurée le 2026-08-28 :
#   /var/lib/pgbackrest/   vide · 0 WAL archivé · archive-push exit 103
#   275 réinitialisations complètes du cluster en 46 minutes, la première SIX
#   SECONDES après le démarrage du conteneur · 390 « Connection terminated
#   unexpectedly » côté API.
# Une étape manuelle oubliée une fois sur un staging sera oubliée en production.
# La corriger à la main n'aurait corrigé QUE cette fois-ci : c'est la conception
# qui est fautive, pas son exécution. Ce script est donc exécuté par un job
# ONE-SHOT du compose, sur le modèle de `createbuckets` — même forme, même
# garantie : `service_completed_successfully` empêche l'API et le worker de
# démarrer si la stanza n'a pas pu être créée.
#
# -----------------------------------------------------------------------------
# CE QU'IL GARANTIT
# -----------------------------------------------------------------------------
#  · IDEMPOTENT. `stanza-create` de pgBackRest 2.59 répond « stanza 'x' already
#    exists on repo1 and is valid » et sort en 0 (vérifié en exécution sur base
#    jetable, deux passages consécutifs). Un redéploiement ne recrée donc rien et
#    n'échoue pas. Ce script n'ajoute AUCUN test « si absent alors créer » : ce
#    serait une seconde vérité, moins fiable que celle de pgBackRest lui-même.
#  · ÉCHEC VISIBLE. Toute erreur sort en code non nul. Le job est déclaré avec
#    `restart: 'no'` et les services applicatifs en dépendent par
#    `condition: service_completed_successfully` : un échec de création BLOQUE le
#    déploiement au lieu de l'assortir d'un avertissement. Une base qui démarre
#    sans archivage perdra ses données au premier incident (invariant 8) — elle ne
#    doit pas démarrer du tout.
#
# -----------------------------------------------------------------------------
# POURQUOI `--no-online`, ET CE QUE ÇA COÛTE
# -----------------------------------------------------------------------------
# pgBackRest se connecte à PostgreSQL par SOCKET UNIX uniquement (aucune option
# ne lui fait ouvrir une connexion TCP vers un autre hôte : `pg1-host` suppose
# SSH/TLS). Un conteneur séparé ne peut donc pas parler au cluster sans partager
# `/var/run/postgresql` — un volume de plus, et un socket qui survit aux
# redémarrages dans un volume persistant. `--no-online` évite tout cela : la
# stanza est créée à partir de `global/pg_control`, lu dans le volume de données,
# qui porte la version et l'identifiant système du cluster — les deux seules
# valeurs dont `stanza-create` a besoin. Vérifié en exécution : cluster EN COURS
# D'EXÉCUTION, création réussie, archivage fonctionnel derrière.
# CE QUE `--no-online` NE FAIT PAS : il ne vérifie ni `archive_mode`, ni
# `archive_command`, ni que le cluster répond. Ces trois-là sont vérifiés
# autrement — par `postgresql.custom.conf` (versionné) et par la sonde de santé
# du conteneur PostgreSQL (`healthcheck.sh`, propriétés 1 et 3).
#
# MONTÉE DE VERSION MAJEURE DE POSTGRESQL : `stanza-create` répondra « stanza
# already exists but is not valid » et ce script ÉCHOUERA — volontairement. La
# reprise s'appelle `pgbackrest stanza-upgrade` et c'est une décision humaine
# (11 §1 : aucune montée majeure sans décision humaine). Ce script ne l'exécute
# jamais tout seul.
# =============================================================================
set -eu

STANZA="${PGBACKREST_STANZA:-axion}"
DEPOT="${PGBACKREST_REPO1_PATH:-/var/lib/pgbackrest}"
# Doit rester identique à `pg1-path` de infra/pgbackrest/pgbackrest.conf : ce
# fichier ne fait aucune interpolation, la valeur y est écrite en dur.
DONNEES="${PGDATA:-/var/lib/postgresql/data}"

# Le job démarre en même temps que PostgreSQL (`service_started` — il ne peut pas
# attendre `service_healthy`, puisque la sonde de santé exige justement la stanza
# que ce script crée). `initdb` peut donc ne pas avoir fini : on attend le fichier
# que `stanza-create` doit lire, et RIEN D'AUTRE.
ATTENTE_MAX_S=180
attendu=0
while [ ! -f "$DONNEES/global/pg_control" ]; do
  if [ "$attendu" -ge "$ATTENTE_MAX_S" ]; then
    echo "stanza: ECHEC — $DONNEES/global/pg_control toujours absent apres ${ATTENTE_MAX_S}s :"
    echo "stanza: le cluster n'a pas ete initialise, la stanza ne peut pas etre creee."
    exit 1
  fi
  [ "$attendu" -eq 0 ] && echo "stanza: attente de l'initialisation du cluster ($DONNEES/global/pg_control)…"
  sleep 2
  attendu=$((attendu + 2))
done

# =============================================================================
# REPRISE SUR VERROU — LE POINT QUI REND CE JOB IRRÉPARABLE S'IL MANQUE
# -----------------------------------------------------------------------------
# `pgbackrest` sérialise ses opérations par un VERROU DE FICHIER (`lock-path`,
# `/tmp/pgbackrest` par défaut). Quand il ne peut pas le prendre, il sort en 50
# avec « unable to acquire lock ». Or ce job porte `restart: 'no'` — c'est
# obligatoire pour un job one-shot dont les autres services dépendent par
# `service_completed_successfully` — et il ne se relancera donc JAMAIS tout seul.
#
# CE QUE COÛTERAIT UNE SEULE COLLISION, si l'on ne réessayait pas : la stanza
# n'existe pas, `archive_command` échoue à chaque segment WAL, le postmaster
# traite la sortie de son enfant asynchrone comme un crash de backend et
# RÉINITIALISE LE CLUSTER EN BOUCLE — 275 fois en 46 minutes, mesuré le
# 2026-08-28. Le déploiement, lui, échoue franchement (les services dépendants
# ne démarrent pas) et la sonde `healthcheck.sh` voit la boucle : la panne n'est
# plus silencieuse. Mais rien ne la RÉPARE, et une réparation qui exige qu'un
# humain tape une commande est précisément ce que ce fichier a été écrit pour
# supprimer.
#
# CE QUE CETTE BOUCLE COUVRE, ET CE QU'ELLE NE COUVRE PAS — À LIRE À FROID :
#  · Elle couvre le verrou détenu par un AUTRE pgBackRest DU MÊME CONTENEUR :
#    l'archiveur asynchrone (`archive-async=y`) lancé par un `stanza-create`
#    joué à la main dans le conteneur du serveur (la procédure manuelle que
#    infra/README.md documente encore), ou deux exécutions concurrentes.
#  · Elle NE COUVRE PAS, parce qu'il n'existe pas : un verrou partagé ENTRE
#    conteneurs. `lock-path` est `/tmp/pgbackrest`, propre à chaque conteneur, et
#    aucun volume ne le partage. Le job `createstanza` du compose et le serveur
#    ne peuvent donc pas se marcher dessus aujourd'hui. Cette boucle est une
#    assurance sur une propriété que RIEN ne vérifie et qu'un `lock-path`
#    déplacé sur un volume ferait tomber sans bruit.
#  · Elle NE RÉESSAIE QUE LE VERROU. Une stanza « already exists but is not
#    valid » (montée de version majeure) échoue TOUT DE SUITE, comme avant :
#    réessayer une erreur de fond, c'est retarder de trois minutes un échec qui
#    ne se résoudra jamais, et masquer sa vraie cause derrière un délai dépassé.
# =============================================================================
TENTATIVES_MAX="${AXION_STANZA_TENTATIVES:-30}"
DELAI_S="${AXION_STANZA_DELAI_S:-5}"
case "$TENTATIVES_MAX" in
  '' | *[!0-9]*) echo "stanza: ECHEC — AXION_STANZA_TENTATIVES n'est pas un entier."; exit 1 ;;
esac
case "$DELAI_S" in
  '' | *[!0-9]*) echo "stanza: ECHEC — AXION_STANZA_DELAI_S n'est pas un entier de secondes."; exit 1 ;;
esac
[ "$TENTATIVES_MAX" -gt 0 ] || { echo 'stanza: ECHEC — AXION_STANZA_TENTATIVES vaut 0 : aucune tentative ne serait faite.'; exit 1; }

echo "stanza: cluster initialise, creation de la stanza '$STANZA' dans $DEPOT (idempotent)."

tentative=1
while : ; do
  # La sortie est CAPTURÉE puis réémise : sans cela, `set -e` ferait sortir le
  # script au premier échec et il n'y aurait aucune reprise. Le `|| code=$?`
  # neutralise `set -e` pour cette commande, et pour elle seule.
  code=0
  journal_pgbackrest="$(pgbackrest --stanza="$STANZA" --no-online stanza-create 2>&1)" || code=$?
  [ -z "$journal_pgbackrest" ] || echo "$journal_pgbackrest"
  # `if` et non `[ … ] && …` : sous `set -e`, une liste `&&` dont le test est
  # faux rend un code non nul et ferait sortir le script au lieu de boucler.
  # C'est le piège que `sauvegarde.sh` documente déjà deux fois chez lui.
  if [ "$code" -eq 0 ]; then
    break
  fi

  # Reprise UNIQUEMENT sur le verrou. Le code 50 est le verdict de pgBackRest ;
  # le motif de message est la ceinture, au cas où ce code changerait de valeur
  # à une montée de version — on ne veut pas qu'un correctif de robustesse
  # devienne silencieusement inopérant.
  est_verrou=non
  if [ "$code" -eq 50 ]; then
    est_verrou=oui
  fi
  case "$journal_pgbackrest" in
    *'unable to acquire lock'* | *'unable to acquire'*'lock'*) est_verrou=oui ;;
  esac
  if [ "$est_verrou" != oui ]; then
    echo "stanza: ECHEC — pgbackrest stanza-create a rendu $code, et ce n'est PAS un conflit de verrou."
    echo "stanza: aucune reprise : reessayer une erreur de fond retarderait l'echec sans le resoudre."
    exit "$code"
  fi
  if [ "$tentative" -ge "$TENTATIVES_MAX" ]; then
    echo "stanza: ECHEC — verrou pgBackRest toujours detenu apres $tentative tentatives espacees de ${DELAI_S}s."
    echo "stanza: la stanza n'a pas pu etre creee ; sans elle archive_command echoue a chaque segment WAL"
    echo "stanza: et le cluster se reinitialise en boucle (mesure le 2026-08-28)."
    exit "$code"
  fi
  echo "stanza: verrou pgBackRest detenu (code $code) — nouvelle tentative $((tentative + 1))/$TENTATIVES_MAX dans ${DELAI_S}s."
  sleep "$DELAI_S"
  tentative=$((tentative + 1))
done

# Contrôle de sortie : on ne se fie pas au seul code de retour. C'est ce fichier
# que `archive-push` ouvre à chaque segment WAL, et c'est son absence qui a
# provoqué la boucle du 2026-08-28.
if [ ! -f "$DEPOT/archive/$STANZA/archive.info" ]; then
  echo "stanza: ECHEC — $DEPOT/archive/$STANZA/archive.info absent apres un stanza-create rendu en succes."
  exit 1
fi

echo "stanza: '$STANZA' prete dans $DEPOT — archivage WAL operationnel."
