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
# CE QU'IL DÉCALE, ET SURTOUT CE QU'IL NE DÉCALE PAS
# -----------------------------------------------------------------------------
# `AXION_TEST_AUJOURDHUI=AAAA-MM-JJ` fixe la date du jour. SEULES les
# expressions RELATIVES à maintenant sont réécrites :
#   · aucune option `-d`      → `AAAA-MM-JJ <heure réelle>`  (`date -u +%s`…)
#   · `-d "now|today …"`      → `AAAA-MM-JJ …`
#   · `-d "yesterday …"`      → jour précédent, puis `…`
#   · `-d "tomorrow …"`       → jour suivant, puis `…`
# Une date ABSOLUE (`-d 20260831`, `-d 20250145`) traverse INTACTE. C'est vital :
# `cle_periode` date les archives par leur NOM, et un substitut qui décalerait
# aussi ces dates-là ferait mentir la mesure au lieu de la fixer.
#
# La date de base est calculée AVANT d'être passée à `date`, jamais concaténée
# comme un terme relatif. Mesuré : `date -d "2026-09-07 02:30 +1 day"` rend
# 2026-09-08T01:30 — GNU date lit `+1` comme un DÉCALAGE DE FUSEAU dès qu'un
# terme numérique suit une heure. `date -d "2026-09-08 02:30"` ne peut pas se
# tromper.
#
# Sans `AXION_TEST_AUJOURDHUI`, ce fichier `exec` le vrai `date` sans rien
# changer : les autres cas du banc ne sont pas touchés.
#
# ⚠️ Le conteneur de banc tourne en UTC, comme le service. `%H:%M:%S` est donc
# relevé en UTC, cohérent avec le `-u` que `sauvegarde.sh` met partout.
# =============================================================================
set -u

REEL=/usr/bin/date
base="${AXION_TEST_AUJOURDHUI:-}"
[ -n "$base" ] || exec "$REEL" "$@"

# Séparation des options et de l'expression `-d`, sous toutes ses écritures.
reste=()
expression=''
vu_d=0
while [ $# -gt 0 ]; do
  case "$1" in
    -d)
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
  *) : ;;
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
