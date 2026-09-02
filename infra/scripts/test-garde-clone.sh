#!/usr/bin/env bash
# =============================================================================
# infra/scripts/test-garde-clone.sh — TEST A BLANC DU GARDE DE DIVERGENCE DU
# CLONE SERVEUR, DANS LES DEUX SENS (decision de Williams, 2026-09-02).
# =============================================================================
# Ce que ce test prouve, sur un depot git JETABLE cree dans un repertoire
# temporaire — jamais sur le serveur, jamais sur ce depot-ci :
#
#   SENS 1 — clone A JOUR   : `restore-test-ci.sh` accepte et EPROUVE (il appelle
#                             le `restore-test.sh` du clone — ici un faux qui
#                             imprime un marqueur).
#   SENS 2 — clone EN RETARD: `restore-test-ci.sh` REFUSE en le disant
#                             (`REFUS_CLONE_HORS_MAIN`, code 3), AVANT toute
#                             restauration — le marqueur n apparait pas.
#   Puis l alignement de `deploy-staging.sh --aligner-clone` remet le clone au
#   sha livre, le sens 1 redevient vrai, et chacun des garde-fous de
#   l alignement refuse ce qu il doit refuser : sha hors de `main`, origine
#   inattendue, modifications locales, historique reecrit.
#
# Il exerce LE VRAI CODE des deux enveloppeurs (aucune logique dupliquee) : les
# deux acceptent un chemin de clone en argument — un argument que la cle de CI
# ne peut PAS fournir, puisque `command=` fixe la ligne de commande.
#
# UTILISATION : bash infra/scripts/test-garde-clone.sh
# Sortie non nulle au premier cas en defaut ; tout est nettoye en `trap EXIT`.
# Prerequis : bash, git >= 2.28, sha256sum. Aucun Docker, aucun reseau.
# =============================================================================
set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVELOPPEUR_RESTAURATION="${ICI}/restore-test-ci.sh"
ENVELOPPEUR_DEPLOIEMENT="${ICI}/deploy-staging.sh"

for f in "$ENVELOPPEUR_RESTAURATION" "$ENVELOPPEUR_DEPLOIEMENT"; do
  [ -f "$f" ] || { echo "ECHEC : ${f} introuvable." >&2; exit 1; }
done
for c in git sha256sum mktemp; do
  command -v "$c" >/dev/null 2>&1 || { echo "ECHEC : commande ${c} absente." >&2; exit 1; }
done

BAC="$(mktemp -d "${TMPDIR:-/tmp}/garde-clone.XXXXXX")"
trap 'rm -rf "${BAC}"' EXIT

# Le test ne doit dependre d aucune configuration git du poste (signature,
# crochets, autocrlf…) : on lui donne la sienne, minimale, dans le bac.
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${BAC}/gitconfig"
git config --file "$GIT_CONFIG_GLOBAL" user.name "test-garde-clone"
git config --file "$GIT_CONFIG_GLOBAL" user.email "test@exemple.invalid"
git config --file "$GIT_CONFIG_GLOBAL" init.defaultBranch main
git config --file "$GIT_CONFIG_GLOBAL" commit.gpgsign false
git config --file "$GIT_CONFIG_GLOBAL" core.autocrlf false
git config --file "$GIT_CONFIG_GLOBAL" advice.detachedHead false

ORIGINE="${BAC}/origine.git"
TRAVAIL="${BAC}/travail"     # la ou « main » avance (le role de GitHub)
SERVEUR="${BAC}/serveur"     # le role de /opt/axion-audit/repo
ENV_FACTICE="${BAC}/env.factice"
: > "$ENV_FACTICE"

git init --quiet --bare "$ORIGINE"
git clone --quiet "$ORIGINE" "$TRAVAIL" 2>/dev/null
mkdir -p "${TRAVAIL}/infra/scripts"
# Le faux `restore-test.sh` du clone : il ne restaure rien, il TEMOIGNE qu il a
# ete appele — c est tout ce que ce test doit distinguer.
# Le $1 ci-dessous est destine au faux script, pas a ce shell (SC2016 voulu).
# shellcheck disable=SC2016
printf '#!/usr/bin/env bash\necho "RESTAURATION_FACTICE env=$1"\nexit 0\n' > "${TRAVAIL}/infra/scripts/restore-test.sh"
chmod +x "${TRAVAIL}/infra/scripts/restore-test.sh"
git -C "$TRAVAIL" add -A
git -C "$TRAVAIL" commit --quiet -m "A — premier commit"
git -C "$TRAVAIL" push --quiet origin main 2>/dev/null
SHA_A="$(git -C "$TRAVAIL" rev-parse HEAD)"

git clone --quiet "$ORIGINE" "$SERVEUR" 2>/dev/null
# Sous Windows, le bit d execution n est pas toujours conserve par le clone.
chmod +x "${SERVEUR}/infra/scripts/restore-test.sh"

CAS=0; DEFAUTS=0
# verifier <libelle> <commande…> : le code de la commande EST le verdict.
verifier() {
  local libelle="$1"; shift
  CAS=$((CAS + 1))
  if "$@"; then echo "  [OK]    cas ${CAS} — ${libelle}"
  else echo "  [ECHEC] cas ${CAS} — ${libelle}"; DEFAUTS=$((DEFAUTS + 1)); fi
}
contient() { printf '%s' "$1" | grep -q -- "$2"; }
absent()   { ! contient "$1" "$2"; }
tete_est() { [ "$(git -C "$SERVEUR" rev-parse HEAD)" = "$1" ]; }

# Lance l enveloppeur de restauration sur le clone jetable avec un sha attendu.
restauration() { # <sha attendu> ; sortie dans SORTIE_R, code dans CODE_R
  set +e
  SORTIE_R="$(printf '%s\n' "$1" | bash "$ENVELOPPEUR_RESTAURATION" "$ENV_FACTICE" "$SERVEUR" 2>&1)"
  CODE_R=$?
  set -e
}
alignement() { # <sha> [<url origin attendue>] ; sortie dans SORTIE_A, code dans CODE_A
  set +e
  SORTIE_A="$(bash "$ENVELOPPEUR_DEPLOIEMENT" --aligner-clone "$SERVEUR" "$1" "${2:-$ORIGINE}" 2>&1)"
  CODE_A=$?
  set -e
}

echo "Bac a sable : ${BAC}"
echo "A = ${SHA_A}"

# --- SENS 1 : clone a jour => le nocturne eprouve --------------------------
restauration "$SHA_A"
verifier "clone a jour : l enveloppeur rend 0" test "$CODE_R" -eq 0
verifier "clone a jour : COMMIT_SERVEUR=A publie" contient "$SORTIE_R" "COMMIT_SERVEUR=${SHA_A}"
verifier "clone a jour : la restauration EST tentee (marqueur present)" contient "$SORTIE_R" "RESTAURATION_FACTICE"

# --- SENS 2 : main avance, le clone reste a A => refus nomme, avant tout -----
printf 'B\n' > "${TRAVAIL}/B.txt"
git -C "$TRAVAIL" add -A && git -C "$TRAVAIL" commit --quiet -m "B — main avance"
git -C "$TRAVAIL" push --quiet origin main 2>/dev/null
SHA_B="$(git -C "$TRAVAIL" rev-parse HEAD)"
echo "B = ${SHA_B}"

restauration "$SHA_B"
verifier "clone en retard : l enveloppeur rend 3" test "$CODE_R" -eq 3
verifier "clone en retard : REFUS_CLONE_HORS_MAIN attendu=B serveur=A" contient "$SORTIE_R" "REFUS_CLONE_HORS_MAIN attendu=${SHA_B} serveur=${SHA_A}"
verifier "clone en retard : la restauration N EST PAS tentee (marqueur absent)" absent "$SORTIE_R" "RESTAURATION_FACTICE"
verifier "clone en retard : le refus dit RESTAURATION NON TENTEE" contient "$SORTIE_R" "RESTAURATION NON TENTEE"

# --- Sans sha attendu : refus aussi, avant tout -----------------------------
restauration ""
verifier "sans sha attendu : code 1" test "$CODE_R" -eq 1
verifier "sans sha attendu : REFUS_SHA_ATTENDU_ABSENT" contient "$SORTIE_R" "REFUS_SHA_ATTENDU_ABSENT"
verifier "sans sha attendu : aucune restauration tentee" absent "$SORTIE_R" "RESTAURATION_FACTICE"

# --- L ALIGNEMENT (etape 5 du deploiement) remet le clone a B ---------------
alignement "$SHA_B"
verifier "alignement sur B : rend 0" test "$CODE_A" -eq 0
verifier "alignement sur B : CLONE_SERVEUR=B publie" contient "$SORTIE_A" "CLONE_SERVEUR=${SHA_B}"
verifier "alignement sur B : HEAD du clone vaut B" tete_est "$SHA_B"
chmod +x "${SERVEUR}/infra/scripts/restore-test.sh"

restauration "$SHA_B"
verifier "apres alignement : le nocturne rend 0" test "$CODE_R" -eq 0
verifier "apres alignement : le nocturne eprouve a nouveau (marqueur)" contient "$SORTIE_R" "RESTAURATION_FACTICE"

alignement "$SHA_B"
verifier "alignement idempotent : rend 0" test "$CODE_A" -eq 0
verifier "alignement idempotent : dit « deja au sha livre »" contient "$SORTIE_A" "deja au sha livre"

# --- Garde-fous de l alignement : chacun refuse ce qu il doit ---------------
alignement "${SHA_B:0:7}"
verifier "garde : sha abrege => code non nul" test "$CODE_A" -ne 0
verifier "garde : sha abrege => exige un sha COMPLET" contient "$SORTIE_A" "sha COMPLET"

# sha hors de main (branche non fusionnee)
git -C "$TRAVAIL" checkout --quiet -b autre
printf 'C\n' > "${TRAVAIL}/C.txt"
git -C "$TRAVAIL" add -A && git -C "$TRAVAIL" commit --quiet -m "C — branche non fusionnee"
git -C "$TRAVAIL" push --quiet origin autre 2>/dev/null
SHA_C="$(git -C "$TRAVAIL" rev-parse HEAD)"
git -C "$TRAVAIL" checkout --quiet main
alignement "$SHA_C"
verifier "garde : sha hors de main => REFUSE" contient "$SORTIE_A" "REFUSE"
verifier "garde : sha hors de main => clone inchange (B)" tete_est "$SHA_B"

# origine inattendue
alignement "$SHA_B" "https://exemple.invalid/autre-depot.git"
verifier "garde : origine inattendue => code non nul" test "$CODE_A" -ne 0
verifier "garde : origine inattendue => refus nomme" contient "$SORTIE_A" "On ne tire jamais d un autre depot"

# modifications locales sur le serveur
printf 'modifie sur le serveur\n' >> "${SERVEUR}/infra/scripts/restore-test.sh"
alignement "$SHA_B"
verifier "garde : modifications locales => code non nul" test "$CODE_A" -ne 0
verifier "garde : modifications locales => refus nomme" contient "$SORTIE_A" "modifications locales"
verifier "garde : modifications locales => rien d ecrase" contient "$(git -C "$SERVEUR" status --porcelain)" "restore-test.sh"
git -C "$SERVEUR" checkout --quiet -- .
chmod +x "${SERVEUR}/infra/scripts/restore-test.sh"

# historique reecrit : main forcee sur un commit qui ne descend pas de B
git -C "$TRAVAIL" reset --quiet --hard "$SHA_A"
printf 'D\n' > "${TRAVAIL}/D.txt"
git -C "$TRAVAIL" add -A && git -C "$TRAVAIL" commit --quiet -m "D — main reecrite"
git -C "$TRAVAIL" push --quiet --force origin main 2>/dev/null
SHA_D="$(git -C "$TRAVAIL" rev-parse HEAD)"
alignement "$SHA_D"
verifier "garde : historique reecrit => code non nul" test "$CODE_A" -ne 0
verifier "garde : historique reecrit => « ne DESCEND PAS »" contient "$SORTIE_A" "ne DESCEND PAS"
verifier "garde : historique reecrit => clone reste a B" tete_est "$SHA_B"

# et le nocturne, lui, dit ce qu il voit : clone a B, main a D => refus
restauration "$SHA_D"
verifier "apres reecriture : le nocturne refuse (3)" test "$CODE_R" -eq 3
verifier "apres reecriture : sans restaurer" absent "$SORTIE_R" "RESTAURATION_FACTICE"

echo
if [ "$DEFAUTS" -eq 0 ]; then
  echo "Garde de divergence du clone : ${CAS} cas, 0 defaut — les deux sens sont prouves."
else
  echo "Garde de divergence du clone : ${DEFAUTS} defaut(s) sur ${CAS} cas." >&2
  exit 1
fi
