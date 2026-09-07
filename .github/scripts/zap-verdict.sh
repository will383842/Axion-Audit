#!/usr/bin/env bash
# =============================================================================
# VERDICT DU SCAN ZAP — la garde, isolée pour être ÉPROUVABLE
# =============================================================================
# Appelé par `.github/workflows/zap-baseline.yml`.
#
#   zap-verdict.sh "<codes>" <bloquant:true|false> [<libellé_artefact>]
#
# `<codes>` est une LISTE séparée par des espaces (ou des retours à la ligne).
# Chaque élément est soit un code nu (`2`), soit `<étiquette>=<code>`
# (`console=2`). L'étiquette nomme la cible, pour qu'un rouge dise LAQUELLE.
# Un code seul reste accepté : c'est le cas particulier « une cible ».
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
# POURQUOI IL PREND DÉSORMAIS PLUSIEURS CODES (2026-09-07, couverture P-C).
# `zap-baseline.py` ne prend QU'UNE cible. Couvrir `/hq` et `/api` en plus de la
# racine (condition d'A01, DECISIONS.md 2026-09-05) impose donc N exécutions,
# donc N codes de retour. La règle d'agrégation est la SEULE qui ne relâche
# rien : **le verdict global est le PLUS SÉVÈRE des verdicts unitaires**. Une
# cible qui bloque bloque tout — un scan « vert en moyenne » serait exactement
# le contrôle-qui-ment que ce dépôt traque.
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
# CE QUI EST BLOQUANT ICI, ET CE QUI NE L'EST PAS — par cible, puis agrégé :
#   · code 3 → TOUJOURS bloquant, même hors mode bloquant. Un scanner qui ne
#     tourne pas n'est pas un « scan non bloquant », c'est une ABSENCE de scan
#     déguisée en scan. C'est très exactement F-31. Et une cible injoignable
#     parmi trois joignables est le MÊME défaut, en plus discret : la couverture
#     annoncée à la porte ne serait pas celle qui a tourné.
#   · code 1 → TOUJOURS bloquant, SUR N'IMPORTE QUELLE CIBLE. Une règle placée
#     au niveau FAIL est une décision déjà prise ; la repasser par
#     `ZAP_BLOQUANT` la déferait.
#   · code 2 → bloquant SI ET SEULEMENT SI ZAP_BLOQUANT vaut 'true'.
#   · toute autre valeur, y compris vide → bloquant. On ferme en cas de doute :
#     un code inconnu n'a jamais voulu dire « tout va bien ».
#   · LISTE VIDE → bloquant. Un verdict rendu sur zéro code n'est pas un verdict,
#     c'est un job vert qui n'a rien mesuré — la forme pure de F-31.
#   · étiquette vide (`=2`) ou code absent (`console=`) → bloquant. Une liste
#     malformée signifie que l'appelant s'est trompé ; on ne devine pas.
#   · ZAP_BLOQUANT mal orthographié ('True', 'oui', '1', vide) → ERREUR DURE,
#     jamais « donc non bloquant ». Une faute de frappe ne désarme pas une garde.
# =============================================================================
set -euo pipefail

codes="${1-}"
bloquant="${2-}"
artefact="${3-rapport-zap}"

if [ "$#" -lt 2 ]; then
  echo "::error title=Verdict ZAP inutilisable::Usage : zap-verdict.sh \"<codes>\" <true|false> [artefact]. Reçu ${#} argument(s)."
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

# -----------------------------------------------------------------------------
# VERDICT D'UNE CIBLE — rend 0 (laisse passer) ou 1 (bloque), et le DIT.
# -----------------------------------------------------------------------------
# Les messages nomment la cible : avec trois scans, « le scan a rendu 2 » sans
# préciser lequel envoie relire trois rapports au lieu d'un.
verdict_unitaire() {
  local ou="$1" code="$2"

  case "${code}" in
    0)
      echo "ZAP [${ou}] : aucune alerte au niveau qui compte (code 0)."
      return 0
      ;;

    1)
      echo "::error title=Alertes ZAP de niveau ÉCHEC (${ou})::La cible « ${ou} » a rendu 1 : au moins une règle de niveau FAIL a tiré. BLOQUANT quel que soit ZAP_BLOQUANT — une règle portée au niveau FAIL est un arbitrage déjà rendu, et il vaut pour CHAQUE cible. Rapport : artefact « ${artefact} », sous-dossier ${ou}/. Traitement par A51 (09 §1) avant merge."
      return 1
      ;;

    2)
      if [ "${bloquant}" = "true" ]; then
        echo "::error title=Avertissements ZAP (${ou})::La cible « ${ou} » a rendu 2 (WARN-NEW) et ZAP_BLOQUANT=true. Rapport : artefact « ${artefact} », sous-dossier ${ou}/. Traitement par A51 (09 §1) avant merge."
        return 1
      fi
      echo "::warning title=Avertissements ZAP sur ${ou} (NON bloquant, statut daté)::La cible « ${ou} » a rendu 2 (WARN-NEW). Non bloquant tant que ZAP_BLOQUANT='false' — statut assumé, daté et borné : voir DECISIONS.md, entrées du 2026-09-05 sur ZAP (bascule à la porte P-C, APRÈS la couverture étendue). Rapport : artefact « ${artefact} », sous-dossier ${ou}/ — à LIRE, pas à ignorer."
      return 0
      ;;

    3)
      echo "::error title=ZAP n'a pas pu s'exécuter (${ou})::Code 3 sur la cible « ${ou} » — injoignable ou erreur interne du scanner. Ce scan-là n'a PAS eu lieu : ce n'est pas un résultat, c'est une panne. BLOQUANT même hors mode bloquant (c'est le défaut F-31 du 2026-09-04 : deux jours sans aucune ligne ZAP, et personne ne l'a vu). Une seule cible en panne suffit : la couverture annoncée ne serait pas celle qui a tourné."
      return 1
      ;;

    *)
      echo "::error title=Code de retour ZAP inconnu (${ou})::La cible « ${ou} » a rendu « ${code} », qui n'est pas dans la table 0/1/2/3. On ferme : un code non prévu n'a jamais signifié « tout va bien »."
      return 1
      ;;
  esac
}

# --- Découpe de la liste -----------------------------------------------------
# `${codes}` est délibérément NON protégé par des guillemets : c'est la découpe
# par IFS qui sépare les éléments (espaces ET retours à la ligne).
# `set -f` désarme le GLOBBING pendant cette seule boucle : sans lui, un code
# contenant `*` (donc un appelant fautif) se transformerait en liste de fichiers
# du répertoire courant, et la garde trancherait sur des noms de fichiers.
etiquettes=()
valeurs=()
set -f
# shellcheck disable=SC2086 # découpe par IFS VOULUE ; globbing neutralisé par `set -f`.
for element in ${codes}; do
  if [ "${element#*=}" != "${element}" ]; then
    etiquettes+=("${element%%=*}")
    valeurs+=("${element#*=}")
  else
    # Forme historique « un seul code, sans étiquette ».
    etiquettes+=("cible")
    valeurs+=("${element}")
  fi
done
set +f

nb="${#valeurs[@]}"

if [ "${nb}" -eq 0 ]; then
  echo "::error title=Verdict ZAP sans aucun code::La liste de codes est vide (reçu « ${codes} »). Un verdict rendu sur zéro code n'est pas un verdict : c'est un job vert qui n'a rien mesuré, c'est-à-dire la forme pure du défaut F-31. BLOQUANT."
  exit 1
fi

# --- Agrégation : le PLUS SÉVÈRE l'emporte, toujours -------------------------
bloquantes=''
for ((i = 0; i < nb; i++)); do
  ou="${etiquettes[${i}]}"
  code="${valeurs[${i}]}"

  if [ -z "${ou}" ]; then
    echo "::error title=Liste de codes ZAP malformée::Un élément porte un code sans étiquette (« =${code} »). L'appelant s'est trompé ; on ne devine pas quelle cible a rendu quoi. BLOQUANT."
    bloquantes="${bloquantes} <sans-étiquette>"
    continue
  fi

  if ! verdict_unitaire "${ou}" "${code}"; then
    bloquantes="${bloquantes} ${ou}"
  fi
done

if [ -n "${bloquantes}" ]; then
  echo "::error title=Verdict ZAP global : BLOQUANT::Cible(s) en cause :${bloquantes} (sur ${nb} scannée(s)). Le verdict global est le PLUS SÉVÈRE des verdicts unitaires — une cible qui bloque bloque tout. Rapport par cible : artefact « ${artefact} »."
  exit 1
fi

echo "Verdict ZAP global : aucune des ${nb} cible(s) ne bloque."
