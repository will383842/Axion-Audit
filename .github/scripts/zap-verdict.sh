#!/usr/bin/env bash
# =============================================================================
# VERDICT DU SCAN ZAP — la garde, isolée pour être ÉPROUVABLE
# =============================================================================
# Appelé par `.github/workflows/zap-baseline.yml`.
#
#   zap-verdict.sh <code_de_retour_zap> <bloquant:true|false> [<libellé_artefact>]
#
# POURQUOI CE FICHIER EXISTE (constat F-31 du 2026-09-04, et sa cause réelle).
# La logique de verdict vivait en ligne dans le workflow. Personne ne pouvait
# l'exécuter ailleurs que dans un déploiement — donc personne ne l'a jamais vue
# mordre. Elle contenait deux défauts qui se sont tenus la main pendant deux
# jours : un commentaire faux sur les codes de retour de `zap-baseline.py`, et un
# drapeau `-I` qui rendait le code 2 INATTEIGNABLE. Résultat : la bascule
# `ZAP_BLOQUANT: 'true'` prévue à la porte L2 aurait été un GESTE VIDE — le
# fichier promettait une garde qu'aucune valeur de sa propre variable ne pouvait
# armer. Un script séparé se teste (`zap-verdict.test.sh`, joué à chaque run) ;
# une garde qu'on n'a pas vue mordre n'est pas une garde.
#
# CODES DE RETOUR DE `zap-baseline.py` — table VÉRIFIÉE PAR EXÉCUTION le
# 2026-09-05 contre https://audit-staging.axion-ia.com, image
# ghcr.io/zaproxy/zaproxy@sha256:781a2bda… :
#   0 = aucune alerte AU NIVEAU QUI COMPTE (et c'est aussi ce que rend `-I`
#       en présence d'avertissements — d'où le piège)
#   1 = au moins une règle de niveau FAIL a tiré
#   2 = au moins un AVERTISSEMENT (WARN-NEW), et `-I` N'EST PAS passé
#   3 = le scanner n'a pas pu s'exécuter (cible injoignable, erreur interne)
# `-I` signifie « do not return failure on warning » : il TRANSFORME un 2 en 0.
# Mesure A/B du 2026-09-05, même cible, même digest, même heure :
#   `-a`      → code 2 (7 WARN-NEW)
#   `-a -I`   → code 0 (les MÊMES 7 WARN-NEW)
#
# CE QUI EST BLOQUANT ICI, ET CE QUI NE L'EST PAS :
#   · code 3 → TOUJOURS bloquant, même hors mode bloquant. Un scanner qui ne
#     tourne pas n'est pas un « scan non bloquant », c'est une ABSENCE de scan
#     déguisée en scan. C'est très exactement F-31.
#   · code 1 → TOUJOURS bloquant. Une règle placée au niveau FAIL est une
#     décision déjà prise ; la repasser par `ZAP_BLOQUANT` la déferait.
#   · code 2 → bloquant SI ET SEULEMENT SI ZAP_BLOQUANT vaut 'true'.
#   · toute autre valeur, y compris vide → bloquant. On ferme en cas de doute :
#     un code inconnu n'a jamais voulu dire « tout va bien ».
#   · ZAP_BLOQUANT mal orthographié ('True', 'oui', '1', vide) → ERREUR DURE,
#     jamais « donc non bloquant ». Une faute de frappe ne désarme pas une garde.
# =============================================================================
set -euo pipefail

code="${1-}"
bloquant="${2-}"
artefact="${3-rapport-zap}"

if [ "$#" -lt 2 ]; then
  echo "::error title=Verdict ZAP inutilisable::Usage : zap-verdict.sh <code> <true|false> [artefact]. Reçu ${#} argument(s)."
  exit 1
fi

# --- Le mode doit être lisible sans interprétation ---------------------------
case "${bloquant}" in
  true | false) ;;
  *)
    echo "::error title=ZAP_BLOQUANT invalide::Valeur reçue « ${bloquant} ». Seuls 'true' et 'false' sont acceptés. Une valeur non reconnue ne vaut PAS 'false' : elle rend le mode de la garde indéterminé, et une garde indéterminée est une garde absente."
    exit 1
    ;;
esac

case "${code}" in
  0)
    echo "ZAP : aucune alerte au niveau qui compte (code 0)."
    exit 0
    ;;

  1)
    echo "::error title=Alertes ZAP de niveau ÉCHEC::Le scan a rendu 1 : au moins une règle de niveau FAIL a tiré. BLOQUANT quel que soit ZAP_BLOQUANT — une règle portée au niveau FAIL est un arbitrage déjà rendu. Rapport : artefact « ${artefact} ». Traitement par A51 (09 §1) avant merge."
    exit 1
    ;;

  2)
    if [ "${bloquant}" = "true" ]; then
      echo "::error title=Avertissements ZAP::Le scan a rendu 2 (WARN-NEW) et ZAP_BLOQUANT=true. Rapport : artefact « ${artefact} ». Traitement par A51 (09 §1) avant merge."
      exit 1
    fi
    echo "::warning title=Avertissements ZAP (NON bloquant, statut daté)::Le scan a rendu 2 (WARN-NEW). Non bloquant tant que ZAP_BLOQUANT='false' — statut assumé, daté et borné : voir DECISIONS.md, entrée « [securite] ZAP en service et non bloquant ». Rapport : artefact « ${artefact} » — à LIRE, pas à ignorer."
    exit 0
    ;;

  3)
    echo "::error title=ZAP n'a pas pu s'exécuter::Code 3 — cible injoignable ou erreur interne du scanner. Le scan n'a PAS eu lieu : ce n'est pas un résultat, c'est une panne. BLOQUANT même hors mode bloquant (c'est le défaut F-31 du 2026-09-04 : deux jours sans aucune ligne ZAP, et personne ne l'a vu)."
    exit 1
    ;;

  *)
    echo "::error title=Code de retour ZAP inconnu::Le scanner a rendu « ${code} », qui n'est pas dans la table 0/1/2/3. On ferme : un code non prévu n'a jamais signifié « tout va bien »."
    exit 1
    ;;
esac
