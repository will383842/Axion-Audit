#!/bin/sh
# =============================================================================
# infra/postgres/healthcheck.sh — sonde de santé du conteneur PostgreSQL (L0)
# Applique : invariant 8 (« aucune donnée ne vit sur un seul appareil », une base
# sans archivage est une base qui perd ses données au premier incident),
# 02 §11.4 (WAL archiving pgBackRest), 07 ligne L0.
#
# -----------------------------------------------------------------------------
# POURQUOI CETTE SONDE REMPLACE `pg_isready` — MESURÉ, PAS SUPPOSÉ (2026-08-28)
# -----------------------------------------------------------------------------
# Le staging a tourné 46 minutes en affichant `Up 46 minutes (healthy)` et
# `RestartCount = 0` PENDANT QU'IL SE RÉINITIALISAIT 275 FOIS. Reproduit à
# l'identique sur une base jetable : 6 réinitialisations en 60 secondes, sonde
# `pg_isready` VERTE du début à la fin.
#
# Le mécanisme, lu dans le journal de la base jetable :
#   `archive_command` = `pgbackrest archive-push`, en mode ASYNCHRONE, détache un
#   processus de fond qui devient un ENFANT DIRECT du postmaster. Sans stanza il
#   sort en 103, et le postmaster — qui ne connaît pas ce processus — traite cette
#   sortie comme le crash d'un backend :
#       LOG: server process (PID 188) exited with exit code 103
#       LOG: all server processes terminated; reinitializing
#   Le postmaster (PID 1) ne meurt JAMAIS : il tue ses enfants et recommence.
#   Docker ne voit donc aucun redémarrage, et `pg_isready` — qui ne teste que la
#   capacité à accepter une connexion À CET INSTANT — réussit dans la fenêtre de
#   ~9 s qui sépare deux réinitialisations.
#
# `pg_isready` ne mentait pas sur ce qu'il mesure : il mesurait autre chose que
# ce que la sonde prétendait garantir. C'était le TROISIÈME défaut de ce motif
# sur ce projet (`pgrep -f node` voyait le compilateur ; la sonde de l'API testait
# la vivacité et non la préparation). D'où la forme de ce fichier : chaque
# garantie est énoncée AVEC sa limite, plus bas, et rien n'est promis au-delà.
#
# -----------------------------------------------------------------------------
# CE QUE CETTE SONDE VÉRIFIE — TROIS PROPRIÉTÉS, DANS CET ORDRE
# -----------------------------------------------------------------------------
#  1. LA STANZA EXISTE dans le dépôt pgBackRest. Sans elle, `archive-push` échoue
#     à chaque segment WAL et rien n'est restaurable. C'est le seul contrôle qui
#     réponde dès la PREMIÈRE seconde d'un cluster neuf, avant qu'un WAL ait eu
#     l'occasion d'être archivé (`archive_timeout = 300s`).
#
#  2. LE CLUSTER NE S'EST PAS RÉINITIALISÉ RÉCEMMENT. Signe choisi : l'âge du
#     processus `checkpointer`. C'est le signe qu'une base EN BOUCLE NE PEUT PAS
#     PRODUIRE — le checkpointer est un enfant du postmaster, il est tué à chaque
#     réinitialisation et recréé aussitôt ; une base qui boucle toutes les 10 s
#     n'a jamais de checkpointer de plus de 10 s. À l'inverse, un cluster sain ne
#     redémarre JAMAIS son checkpointer : il reste aussi vieux que le postmaster.
#     Mesuré sur le staging soigné : postmaster 05h17, checkpointer 06h11 (l'heure
#     du `stanza-create` manuel qui a arrêté la boucle) — l'écart est l'histoire,
#     l'ÂGE est l'état de santé.
#     `pg_postmaster_start_time()` NE convient PAS : il ne bouge pas d'une
#     réinitialisation à l'autre — c'est exactement pour cela que Docker n'a rien vu.
#
#  3. L'ARCHIVAGE N'EST PAS EN ÉCHEC : `pg_stat_archiver` ne rapporte pas un échec
#     PLUS RÉCENT que le dernier archivage réussi.
#
# -----------------------------------------------------------------------------
# CE QUE CETTE SONDE NE DÉTECTE PAS — LIMITES ASSUMÉES, À LIRE AVANT DE S'Y FIER
# -----------------------------------------------------------------------------
#  · UNE BOUCLE PLUS LENTE QUE `AGE_MINIMAL_S` (60 s). Une base qui se
#    réinitialiserait toutes les 2 minutes présenterait un checkpointer de plus
#    de 60 s à chaque passage de la sonde et serait déclarée saine. La boucle
#    mesurée ici est de ~10 s ; le seuil la couvre avec un facteur 6. Le relever
#    couvrirait des boucles plus lentes, au prix d'un démarrage plus long (voir
#    ci-dessous) : ce fichier ne prétend pas couvrir toutes les périodes.
#  · LES `AGE_MINIMAL_S` PREMIÈRES SECONDES D'UN DÉMARRAGE LÉGITIME. La sonde y
#    répond KO faute de pouvoir distinguer « vient de démarrer » de « vient de
#    boucler » — ces deux états sont physiquement identiques. C'est un choix :
#    `start_period` du compose absorbe ce délai (le conteneur reste « starting »,
#    et il devient `healthy` à la première réponse OK, soit ~60-70 s après le
#    démarrage). Le déploiement paie donc UNE MINUTE d'attente avant que l'API
#    démarre. C'est le prix de la garantie, et il est volontaire.
#  · « ARCHIVAGE À ZÉRO » SANS ÉCHEC NI STANZA MANQUANTE. `archived_count = 0`
#    n'est PAS traité comme une faute : un cluster qui vient de démarrer, ou qui
#    n'écrit rien, n'a légitimement rien archivé (`archive_timeout` ne force une
#    bascule que s'il y a eu de l'activité WAL). Échouer là-dessus rendrait la
#    sonde rouge à chaque démarrage sain — un mensonge de plus, dans l'autre sens.
#    L'état constaté le 2026-08-28 (0 WAL archivé) est bien détecté, mais par les
#    propriétés 1 et 3 : la stanza était absente ET `archive-push` en échec. Un
#    « zéro archivé » avec stanza valide et sans aucun échec reste, lui, invisible
#    pour cette sonde ; c'est la supervision (02 §11.4) qui doit le voir, pas elle.
#  · LA RESTAURABILITÉ DU DÉPÔT. Elle vérifie que la stanza existe et que les
#    poussées ne sont pas en échec — PAS qu'une sauvegarde est restaurable. Seul
#    `infra/scripts/restore-test.sh` (test nocturne) répond à cette question.
#  · LA CORRUPTION, LE DISQUE PLEIN, LA LENTEUR. Une base qui répond, dont le
#    checkpointer est vieux et dont l'archivage passe est déclarée SAINE même si
#    ses données sont fausses. Cette sonde surveille la VIE du cluster et son
#    ARCHIVAGE, rien d'autre.
#  · L'ÉTAT DES AUTRES PROCESSUS ENFANTS (walwriter, autovacuum) : non consultés.
#    Le checkpointer suffit puisqu'une réinitialisation les tue TOUS ensemble.
#
# HYPOTHÈSE DE PRIVILÈGES : `POSTGRES_USER` est le superutilisateur créé par
# `initdb` (image officielle) ; il voit `backend_start` des processus auxiliaires
# dans `pg_stat_activity`. Avec un rôle non privilégié, la propriété 2 rendrait
# « checkpointer introuvable » — un KO, jamais un OK silencieux.
# =============================================================================
set -eu

STANZA="${PGBACKREST_STANZA:-axion}"
DEPOT="${PGBACKREST_REPO1_PATH:-/var/lib/pgbackrest}"
UTILISATEUR="${POSTGRES_USER:-postgres}"
BASE="${POSTGRES_DB:-$UTILISATEUR}"

# Âge minimal du checkpointer, en secondes, pour déclarer le cluster stable.
# Voir « CE QUE CETTE SONDE NE DÉTECTE PAS » : ce seuil est la période de boucle
# maximale détectable, ET le délai de démarrage payé à chaque déploiement.
AGE_MINIMAL_S=60

# La sonde ne doit jamais dépasser le `timeout` du compose : une sonde qui pend
# est une sonde qui ment par omission.
export PGCONNECT_TIMEOUT=3

# --- Propriété 1 : la stanza existe dans le dépôt ----------------------------
# `archive.info` est le fichier que `stanza-create` écrit et dont `archive-push`
# a besoin. Contrôle de PRÉSENCE (lecture de fichier), pas de validité : il est
# volontairement plus faible que `pgbackrest info`, mais il ne coûte rien et
# répond avant qu'un seul WAL ait été produit.
if [ ! -f "$DEPOT/archive/$STANZA/archive.info" ]; then
  echo "sonde KO — stanza '$STANZA' absente du depot ($DEPOT/archive/$STANZA/archive.info introuvable) : archivage WAL impossible, invariant 8 non tenu"
  exit 1
fi

# --- Propriétés 2 et 3 : une seule connexion, un seul verdict ----------------
# `-X` ignore ~/.psqlrc, `-A -t` sortie brute, `ON_ERROR_STOP` fait échouer psql
# sur toute erreur SQL — un `set -eu` sans lui laisserait passer un verdict vide.
verdict=$(
  psql -h 127.0.0.1 -U "$UTILISATEUR" -d "$BASE" \
    -X -q -A -t -v ON_ERROR_STOP=1 -v age_minimal="$AGE_MINIMAL_S" <<'SQL'
WITH etat AS (
  SELECT
    (SELECT extract(epoch FROM (now() - backend_start))::bigint
       FROM pg_stat_activity WHERE backend_type = 'checkpointer')   AS age_checkpointer,
    (SELECT failed_count       FROM pg_stat_archiver)               AS echecs,
    (SELECT last_failed_time   FROM pg_stat_archiver)               AS dernier_echec,
    (SELECT last_archived_time FROM pg_stat_archiver)               AS dernier_archivage
)
SELECT CASE
  WHEN age_checkpointer IS NULL
    THEN 'KO|processus checkpointer introuvable dans pg_stat_activity (privileges insuffisants ou cluster en recuperation)'
  WHEN age_checkpointer < :age_minimal
    THEN 'KO|cluster reinitialise il y a ' || age_checkpointer
         || ' s (checkpointer recree) — boucle de reinitialisation probable'
  WHEN echecs > 0 AND (dernier_archivage IS NULL OR dernier_echec > dernier_archivage)
    THEN 'KO|archivage WAL en echec (' || echecs || ' echecs, dernier a ' || dernier_echec || ')'
  ELSE 'OK|cluster stable depuis ' || age_checkpointer || ' s, archivage sans echec en cours'
END
FROM etat;
SQL
) || {
  echo "sonde KO — connexion ou requete SQL impossible sur 127.0.0.1 (base '$BASE', role '$UTILISATEUR')"
  exit 1
}

echo "sonde ${verdict}"
case "$verdict" in
  OK\|*) exit 0 ;;
  *) exit 1 ;;
esac
