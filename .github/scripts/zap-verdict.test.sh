#!/usr/bin/env bash
# =============================================================================
# ÉPREUVE DE LA GARDE ZAP — table de vérité, jouée à CHAQUE run du scan
# =============================================================================
# « Une garde dont on n'a pas vérifié qu'elle mord n'est pas une garde. »
# Ce fichier exécute `zap-verdict.sh` sur toutes les combinaisons qui existent et
# vérifie le code de sortie de chacune. Il tourne AVANT le scan, dans le même
# job : si la garde cesse de mordre, on l'apprend en une seconde, pas au
# prochain incident.
#
# ÉTENDU LE 2026-09-07 (couverture `/hq` + `/api`, condition d'A01 du
# 2026-09-05). Le scan porte désormais sur PLUSIEURS cibles, donc le verdict
# tranche PLUSIEURS codes. C'est exactement le genre de changement qui fait
# perdre une garde en silence : la règle « 1 et 3 bloquent en toutes
# circonstances » n'a de valeur que si elle vaut aussi quand le 3 est NOYÉ dans
# des 0. Les cas multi-cibles ci-dessous existent pour cette seule raison.
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
  # `bash <script>` et non `<script>` : un 126 « permission denied » ferait dire
  # au test que la garde ne mord plus alors qu'elle n'a pas tourné. Le choix est
  # bon et il reste — c'est sa JUSTIFICATION qui était fausse.
  #
  # Elle affirmait : « le bit exécutable ne survit pas au dépôt (git a enregistré
  # 100644 depuis Windows) ». Réfuté en une commande par la revue croisée A17 du
  # 2026-09-07 : `git ls-tree` sur le commit de création rend **100755**, et
  # `git ls-files -s` le rend encore aujourd'hui. Mieux, `check:executabilite`
  # (`MODE_EXECUTABLE = '100755'`, joué sur tout `*.sh` du dépôt) rend un 100644
  # STRUCTURELLEMENT impossible pour un `.sh` à shebang.
  # L'assertion s'appuyait sur une mesure datée (« run 33925076306 ») — et c'est
  # ce format qui donne à une affirmation fausse sa force de persuasion : le
  # run avait bien 13/13 cas faux, mais pas pour cette raison-là.
  #
  # Ce qui reste vrai, et qui suffit à garder `bash` : l'invocation directe
  # dépendrait d'un bit que rien ne garantit hors de ce dépôt-ci (archive, copie,
  # montage `noexec`, banc de réviseur). Le coût est nul, la dépendance en moins.
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

# -----------------------------------------------------------------------------
# MULTI-CIBLES — LA RÈGLE NE SE RELÂCHE PAS PARCE QU'IL Y A TROIS SCANS
# -----------------------------------------------------------------------------
# Le danger propre au multi-cibles est la MOYENNE : deux cibles vertes et une
# en panne « ça va globalement ». Non — la couverture annoncée à la porte ne
# serait pas celle qui a tourné. Le verdict global est le PLUS SÉVÈRE des
# verdicts unitaires, et ces cas le prouvent dans les deux sens.
echo "── PLUSIEURS CIBLES : LE PLUS SÉVÈRE L'EMPORTE ──────────────────────────"
eprouver 1 "terrain=0 console=0 api=3"  false "un code 3 NOYÉ dans des 0 : rouge — la cible n'a pas été scannée"
eprouver 1 "terrain=0 console=1 api=0"  false "un code 1 ISOLÉ : rouge MÊME hors mode bloquant"
eprouver 1 "terrain=0 console=0 api=7"  false "un code inconnu parmi des 0 : on ferme"
eprouver 0 "terrain=2 console=2 api=2"  false "trois fois 2 hors mode bloquant : vert AVEC trois ::warning"
eprouver 1 "terrain=2 console=2 api=2"  true  "trois fois 2 en mode bloquant : rouge"
eprouver 0 "terrain=0 console=0 api=0"  true  "trois fois 0 en mode bloquant : vert"
eprouver 0 "terrain=0 console=2 api=0"  false "un seul 2 hors mode bloquant : vert"
eprouver 1 "terrain=0 console=2 api=0"  true  "le MÊME cas en mode bloquant : rouge"
eprouver 0 "0 2 0"                      false "codes NUS (forme historique, sans étiquette) : encore lus"
eprouver 1 "0 3"                        false "codes nus dont un 3 : rouge"
eprouver 1 "terrain=0 console=0 api=0"  True  "faute de frappe du mode, même en multi-cibles : erreur dure"
echo "── UNE LISTE MALFORMÉE N'EST PAS UNE LISTE VERTE ────────────────────────"
eprouver 1 "terrain=0 console="          false "étiquette sans code : on ne devine pas"
eprouver 1 "=2 console=0"                false "code sans étiquette : on ne devine pas"
eprouver 1 "   "                         false "liste vide : un verdict sur zéro code n'est pas un verdict"

echo
if [ "${echecs}" -ne 0 ]; then
  echo "::error title=La garde ZAP ne mord plus::${echecs}/${total} cas de la table de vérité sont faux. Le verdict du scan n'est plus fiable — corriger zap-verdict.sh AVANT de se fier au moindre résultat de scan."
  exit 1
fi
echo "Table de vérité : ${total}/${total} cas conformes. La garde mord dans les deux sens."
