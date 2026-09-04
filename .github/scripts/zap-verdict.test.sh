#!/usr/bin/env bash
# =============================================================================
# ÉPREUVE DE LA GARDE ZAP — table de vérité, jouée à CHAQUE run du scan
# =============================================================================
# « Une garde dont on n'a pas vérifié qu'elle mord n'est pas une garde. »
# Ce fichier exécute `zap-verdict.sh` sur les 10 combinaisons qui existent et
# vérifie le code de sortie de chacune. Il tourne AVANT le scan, dans le même
# job : si la garde cesse de mordre, on l'apprend en une seconde, pas au
# prochain incident.
#
# Il ne remplace PAS la preuve de bout en bout (le scanner rend-il bien 2 sur
# une alerte réelle ?) : celle-là se mesure contre la cible, et elle est
# consignée dans DECISIONS.md avec sa date et son digest d'image.
# =============================================================================
set -uo pipefail

ici="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
verdict="${ici}/zap-verdict.sh"

echecs=0
total=0

# attendu · code ZAP · ZAP_BLOQUANT · intention
eprouver() {
  local attendu="$1" code="$2" bloquant="$3" intention="$4"
  local obtenu
  total=$((total + 1))
  set +e
  # `bash <script>` et non `<script>` : le bit exécutable ne survit pas au dépôt
  # (git a enregistré 100644 depuis Windows), et un 126 « permission denied »
  # ferait dire au test que la garde ne mord plus alors qu'elle n'a pas tourné.
  # Mesuré : run 33925076306, 13/13 cas faux pour cette seule raison.
  bash "${verdict}" "${code}" "${bloquant}" "epreuve" >/dev/null 2>&1
  obtenu=$?
  set -e
  if [ "${obtenu}" -eq "${attendu}" ]; then
    printf '  OK    code=%-7s bloquant=%-7s → sortie %s   (%s)\n' "${code}" "${bloquant}" "${obtenu}" "${intention}"
  else
    printf '  ÉCHEC code=%-7s bloquant=%-7s → sortie %s, attendu %s   (%s)\n' \
      "${code}" "${bloquant}" "${obtenu}" "${attendu}" "${intention}"
    echecs=$((echecs + 1))
  fi
}

echo "Épreuve de ${verdict}"
echo "── LA GARDE MORD ────────────────────────────────────────────────────────"
eprouver 1 2  true  "avertissements + mode bloquant : rouge"
eprouver 1 1  false "règle FAIL : rouge MÊME hors mode bloquant"
eprouver 1 1  true  "règle FAIL : rouge en mode bloquant"
eprouver 1 3  false "scanner en panne : rouge MÊME hors mode bloquant — c'est F-31"
eprouver 1 3  true  "scanner en panne : rouge en mode bloquant"
eprouver 1 7  true  "code inconnu : on ferme"
eprouver 1 ""  true "code vide : on ferme"
echo "── LA GARDE LAISSE PASSER, ET SEULEMENT LÀ ──────────────────────────────"
eprouver 0 0  true  "aucune alerte + mode bloquant : vert"
eprouver 0 0  false "aucune alerte hors mode bloquant : vert"
eprouver 0 2  false "avertissements hors mode bloquant : vert AVEC ::warning"
echo "── UNE FAUTE DE FRAPPE NE DÉSARME PAS LA GARDE ──────────────────────────"
eprouver 1 0  True  "'True' n'est pas 'true' : erreur dure, pas 'donc non bloquant'"
eprouver 1 2  oui   "'oui' : erreur dure"
eprouver 1 2  ""    "mode vide : erreur dure"

echo
if [ "${echecs}" -ne 0 ]; then
  echo "::error title=La garde ZAP ne mord plus::${echecs}/${total} cas de la table de vérité sont faux. Le verdict du scan n'est plus fiable — corriger zap-verdict.sh AVANT de se fier au moindre résultat de scan."
  exit 1
fi
echo "Table de vérité : ${total}/${total} cas conformes. La garde mord dans les deux sens."
