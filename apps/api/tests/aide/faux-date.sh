#!/bin/bash
# =============================================================================
# `date` SUBSTITUÉ — LE JOUR DE LA SEMAINE DEVIENT UNE ENTRÉE DU TEST
#
# POURQUOI CE FICHIER EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR.
# Le 2026-09-07 — un lundi — la CI de `main` est passée au ROUGE sur un cas
# `@critique` de la rétention à trois étages, VERT la veille et vert le
# lendemain. Le défaut était réel (il est décrit dans `sauvegarde.sh`, en tête
# de `faire_tourner_par_rang`), mais il ne se VOYAIT que six jours sur sept :
# le dimanche, la fenêtre quotidienne de 7 jours tient dans UNE seule semaine
# ISO et masquait le chevauchement. Un cas dont le verdict dépend du jour où on
# le lance ne mesure pas ce qu'il croit mesurer — c'est le SECOND du dépôt après
# `EcranAgenda`, qui échouait tous les soirs passé 20 h.
#
# Ce substitut supprime la dépendance : le calendrier du conteneur devient un
# PARAMÈTRE du cas, et la rétention s'éprouve sur les SEPT jours de la semaine à
# chaque exécution, avec des dates ABSOLUES et fixes.
#
# -----------------------------------------------------------------------------
# LA RÈGLE EXACTE — TROIS CLASSES, ET LA TROISIÈME S'ARRÊTE
# -----------------------------------------------------------------------------
# `AXION_TEST_AUJOURDHUI=AAAA-MM-JJ` fixe la date du jour. L'en-tête de ce
# fichier a annoncé « absolu / relatif » jusqu'au 2026-09-07 au soir, et ce
# n'était pas la règle du code : le code reconnaissait QUATRE MOTS et laissait
# tout le reste passer. `-d "-7 days"`, `-d "7 days ago"`, `-d "last monday"`,
# `-d "+1 month"` et `--date yesterday` (avec une ESPACE, non reconnue comme
# `--date=`) traversaient et se résolvaient sur l'HORLOGE RÉELLE, en silence.
# Aucune n'est employée dans le dépôt aujourd'hui — c'était donc un piège posé
# pour le suivant, pas un défaut de mesure actif. Relevé par A17 en revue croisée.
#
#   1. RELATIF À MAINTENANT, ET RÉÉCRIT :
#        · aucune option `-d`      → `AAAA-MM-JJ <heure réelle>`  (`date -u +%s`…)
#        · `now` | `today`         → `AAAA-MM-JJ …`
#        · `yesterday`             → jour précédent, puis `…`
#        · `tomorrow`              → jour suivant, puis `…`
#   2. ABSOLU, ET LAISSÉ INTACT — le premier mot est `AAAAMMJJ` ou `AAAA-MM-JJ`.
#      C'est vital : `cle_periode` date les archives par leur NOM, et un
#      substitut qui décalerait aussi ces dates-là ferait mentir la mesure au
#      lieu de la fixer. Ce que le premier mot ancre, la SUITE peut décaler
#      (`"2026-09-07 -3 days"`) : le décalage porte alors sur une base absolue,
#      et il est donc reproductible.
#   3. TOUT LE RESTE → ARRÊT, code 64, message en français sur la sortie
#      d'erreur. Un substitut qui ne sait pas honorer le calendrier qu'on lui
#      demande doit le DIRE : rendre une date de l'horloge réelle sous un
#      `AXION_TEST_AUJOURDHUI` posé, c'est produire un vert qui ne mesure rien.
#      La liste de la classe 2 est délibérément COURTE — exactement les deux
#      formes employées par `sauvegarde.sh`, `sauvegarde-healthcheck.sh` et le
#      banc. En ajouter une est une ligne, et cette ligne doit venir avec la
#      raison qui la justifie.
#
# La date de base est calculée AVANT d'être passée à `date`, jamais concaténée
# comme un terme relatif. Mesuré : `date -d "2026-09-07 02:30 +1 day"` rend
# 2026-09-08T01:30 — GNU date lit `+1` comme un DÉCALAGE DE FUSEAU dès qu'un
# terme numérique suit une heure. `date -d "2026-09-08 02:30"` ne peut pas se
# tromper.
#
# Sans `AXION_TEST_AUJOURDHUI`, ce fichier `exec` le vrai `date` sans rien
# changer, AVANT toute analyse : les autres cas du banc ne sont pas touchés, et
# la classe 3 ne peut pas les arrêter par ricochet.
#
# ⚠️ Le conteneur de banc tourne en UTC, comme le service. `%H:%M:%S` est donc
# relevé en UTC, cohérent avec le `-u` que `sauvegarde.sh` met partout.
# =============================================================================
set -u

REEL=/usr/bin/date
base="${AXION_TEST_AUJOURDHUI:-}"
[ -n "$base" ] || exec "$REEL" "$@"

# Séparation des options et de l'expression `-d`, sous toutes ses écritures.
# `--date` SÉPARÉ DE SA VALEUR est traité comme `-d` : il tombait auparavant
# dans `reste`, et son expression avec lui — la substitution était alors
# silencieusement sautée.
reste=()
expression=''
vu_d=0
while [ $# -gt 0 ]; do
  case "$1" in
    -d | --date)
      expression="${2:-}"
      vu_d=1
      shift 2
      ;;
    --date=*)
      expression="${1#--date=}"
      vu_d=1
      shift
      ;;
    -d?*)
      expression="${1#-d}"
      vu_d=1
      shift
      ;;
    *)
      reste+=("$1")
      shift
      ;;
  esac
done
[ "$vu_d" -eq 1 ] || expression='now'

# Le premier mot décide : lui seul peut être relatif à maintenant.
premier="${expression%% *}"
if [ "$premier" = "$expression" ]; then
  suite=''
else
  suite="${expression#* }"
fi

jour=''
case "$premier" in
  now | today) jour="$base" ;;
  yesterday) jour="$("$REEL" -u -d "$base -1 day" +%Y-%m-%d)" ;;
  tomorrow) jour="$("$REEL" -u -d "$base +1 day" +%Y-%m-%d)" ;;
  # Classe 2 — ABSOLU, laissé intact. `[0-9]` huit fois plutôt qu'une
  # expression régulière : `case` d'un shell POSIX ne connaît que le globbing,
  # et `[0-9][0-9]…` y est exact là où `[0-9]{8}` ne le serait pas.
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) : ;;
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) : ;;
  # Classe 3 — TOUT LE RESTE S'ARRÊTE ICI.
  *)
    printf 'faux-date: expression `-d %s` NON PRISE EN CHARGE alors que\n' "$expression" >&2
    printf 'AXION_TEST_AUJOURDHUI=%s est posée.\n\n' "$base" >&2
    printf 'Ce substitut ne sait réécrire que `now`, `today`, `yesterday` et\n' >&2
    printf '`tomorrow`, et ne laisse traverser que les dates ABSOLUES `AAAAMMJJ`\n' >&2
    printf 'et `AAAA-MM-JJ`. La laisser passer la ferait résoudre sur l horloge\n' >&2
    printf 'REELLE du conteneur : le cas deviendrait vert un jour, rouge un autre,\n' >&2
    printf 'et ne mesurerait plus ce qu il croit mesurer — exactement le defaut\n' >&2
    printf 'que ce fichier existe pour supprimer.\n\n' >&2
    printf 'A faire : ecrire la date en absolu, ou ajouter cette forme a la\n' >&2
    printf 'classe 2 de `apps/api/tests/aide/faux-date.sh` AVEC sa raison.\n' >&2
    exit 64
    ;;
esac

if [ -n "$jour" ]; then
  # Expression sans reste : on garde l'heure RÉELLE du conteneur. Le nom des
  # archives porte `%H%M%S`, et figer l'heure ferait collisionner deux passes
  # d'un même cas — ce n'est pas la date qu'on veut fixer, c'est le JOUR.
  if [ -z "$suite" ]; then
    suite="$("$REEL" -u +%H:%M:%S)"
  fi
  expression="$jour $suite"
fi

if [ "${#reste[@]}" -eq 0 ]; then
  exec "$REEL" -d "$expression"
fi
exec "$REEL" -d "$expression" "${reste[@]}"
