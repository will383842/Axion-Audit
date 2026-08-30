#!/usr/bin/env bash
# =============================================================================
# TEST DE RESTAURATION NOCTURNE — seule commande que la cle `ops` peut executer.
# =============================================================================
# Pose le 2026-08-30. Contexte, pour qui lira ceci sans le connaitre :
#
# Le workflow `nightly-restore-test.yml` existe depuis le lot L0. Ses deux
# etapes utiles — preparer l acces SSH, et restaurer Postgres + MinIO dans un
# conteneur jetable — ETAIENT SAUTEES A CHAQUE EXECUTION, faute des reglages de
# l environnement `ops`. Le garde existait donc, portait le nom d une garantie,
# et n avait JAMAIS execute une seule ligne utile. Cinquieme exemplaire de cette
# famille en deux jours.
#
# CE QUE CELA COUTAIT, DIT SANS ARRONDIR : l invariant 8 exige une restauration
# TESTEE, au present. Une restauration prouvee UNE FOIS a la main le 2026-08-28
# ne dit rien de celle de ce soir. Le critere 2 de la porte P-A tient sur cette
# preuve ponctuelle ; la garantie RECURRENTE, elle, n existait pas.
#
# POURQUOI UN ENVELOPPEUR PLUTOT QUE L APPEL DIRECT : la directive `command=` de
# authorized_keys REMPLACE ce que le client demande. Le workflow envoie une
# commande composee (`cd ...; test -x ...; ./restore-test.sh ...`) qui serait
# donc ignoree. Ce fichier reproduit cette sequence, et rien d autre.
#
# CE QUE LA CLE NE PEUT PAS FAIRE : ni ouvrir un shell, ni lire un fichier, ni
# rediriger un port, ni declencher un DEPLOIEMENT — c est une SECONDE cle,
# distincte de celle du deploiement, qui ne sait executer que ce script-ci.
# Trois cles, trois pouvoirs disjoints.
#
# CE SCRIPT EST VERSIONNE, et il publie SA PROPRE EMPREINTE en premiere ligne.
# Le script de deploiement, lui, n a ete versionne qu APRES avoir ete modifie
# deux fois en production sans laisser de trace. On ne refait pas cette dette.
# =============================================================================
set -uo pipefail

printf 'EMPREINTE_SCRIPT=%s\n' "$(sha256sum "${BASH_SOURCE[0]}" | cut -d' ' -f1)"

RACINE="/opt/axion-audit/repo"
FICHIER_ENV="${1:-/opt/axion-audit/.env}"

echec() {
  echo "::error::$*" >&2
  exit 1
}

[ -d "${RACINE}" ] || echec "La copie du depot est absente de ${RACINE}. Sans elle, il n y a rien a executer — et un test de restauration qui ne trouve pas son script ne doit JAMAIS sortir vert."

cd "${RACINE}" || echec "Impossible d entrer dans ${RACINE}."

[ -x ./infra/scripts/restore-test.sh ] || echec "./infra/scripts/restore-test.sh introuvable ou non executable sous ${RACINE}. Verifier le clone et les droits."

[ -f "${FICHIER_ENV}" ] || echec "Fichier d environnement absent : ${FICHIER_ENV}. La restauration a besoin des secrets pour rouvrir les archives — sans eux elle echouerait plus loin, avec un message moins clair."

echo "Restauration : depot ${RACINE} (commit $(git rev-parse --short HEAD 2>/dev/null || echo inconnu)), environnement ${FICHIER_ENV}."

# Le code de retour du script de restauration EST le verdict. Aucun masquage :
# un retour non nul est un echec de plan de reprise, et il doit rougir.
./infra/scripts/restore-test.sh "${FICHIER_ENV}"
