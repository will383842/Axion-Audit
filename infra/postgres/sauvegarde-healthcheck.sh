#!/bin/sh
# =============================================================================
# infra/postgres/sauvegarde-healthcheck.sh — sonde de santé du service
# `sauvegarde` (L0). Applique : invariant 8 (« alerte automatique au-delà »),
# 02 §11.3 (supervision), 02 §11.4 (règle 3-2-1), 07 ligne L0.
#
# -----------------------------------------------------------------------------
# POURQUOI ELLE EXISTE — LE SERVICE N'AVAIT AUCUNE SONDE, ET C'EST MESURÉ
# -----------------------------------------------------------------------------
# Relevé le 2026-08-28 sur le staging, `docker ps --format '{{.Names}}\t{{.Status}}' :
#
#     postgres-…      Up 27 minutes (healthy)
#     minio-…         Up 27 minutes (healthy)
#     sauvegarde-…    Up 26 minutes            ← RIEN. Aucune parenthèse.
#
# `Up` ne dit pas « la copie hors serveur est sortie cette nuit ». Il dit « le
# PID 1 de ce conteneur n'est pas mort ». Les deux propositions se ressemblent
# assez pour être confondues par quelqu'un de pressé, et elles n'ont AUCUN
# rapport : ce service passe 23 heures sur 24 dans un `sleep`, où il est
# parfaitement `Up` et parfaitement inutile.
#
# CE QUE `docker ps` VOIT DÉJÀ, ET QU'IL FAUT LUI LAISSER. Une passe qui échoue
# fait SORTIR le service en code non nul (1 ou 2) ; Docker le redémarre et
# l'état `Restarting` — plus `RestartCount` — est un vrai signal. Cette sonde ne
# le remplace pas : Docker n'exécute PAS de sonde sur un conteneur en
# redémarrage, et le service passe alors son temps en `starting`.
#
# CE QUE `docker ps` NE VOIT PAS, ET QUI EST LA RAISON DE CE FICHIER : LA PASSE
# QUI NE SORT JAMAIS. Un `mc` bloqué sur une socket à moitié ouverte, un
# `pgbackrest` en attente d'un verrou, un `sleep` qu'une horloge folle a envoyé
# à trois semaines — dans les trois cas le processus est VIVANT, le code de
# sortie n'arrive JAMAIS, Docker n'a rien à redémarrer, et `docker ps` affiche
# `Up 6 days` avec la même sérénité que la veille. Aucune sauvegarde ne sort et
# rien ne le dit. C'est le mode de panne le plus silencieux du service, et le
# seul que cette sonde attrape.
#
# -----------------------------------------------------------------------------
# CE QU'ELLE PROUVE — UNE SEULE CHOSE, ET ELLE EST FACTUELLE
# -----------------------------------------------------------------------------
# Que le service a écrit, il y a MOINS de ${AXION_SAUVEGARDE_SEUIL_ALERTE_H}
# heures, les deux marqueurs qu'il n'écrit qu'après avoir réussi :
#   · `.derniere-passe`       — la moitié LOCALE : `pgbackrest backup` a rendu 0,
#     l'archive MinIO a été chiffrée PUIS RELUE et son SHA-256 comparé à la
#     source, la rotation est passée ;
#   · `.derniere-expedition`  — la moitié HORS SERVEUR : le miroir `mc` a rendu 0,
#     deux objets ont été RETÉLÉCHARGÉS depuis R2 et leur SHA-256 comparé à la
#     source, et le bucket contient au moins un objet.
# Ces marqueurs ne sont donc pas des « j'ai essayé » : chacun est posé APRÈS la
# vérification de sa moitié (voir `passe()` dans sauvegarde.sh). Leur fraîcheur
# est le seul fait que cette sonde établit.
#
# -----------------------------------------------------------------------------
# CE QU'ELLE NE PROUVE PAS — À LIRE AVANT DE S'Y FIER, ET À FROID
# -----------------------------------------------------------------------------
#  · ELLE NE PROUVE PAS QU'UNE BASE SE RECONSTRUIT. Elle lit deux horodatages.
#    « L'expédition a réussi et se relit » n'est pas « une restauration
#    aboutit » : seul le test de restauration (infra/README.md §5.4-5.5) répond
#    à cette question, et il est joué à la main.
#  · ELLE NE DIT RIEN SI LA MACHINE EST MORTE. C'est la limite qui compte le
#    plus, et c'est exactement le scénario contre lequel la copie hors serveur
#    existe. VPS éteint, disque en panne, hébergeur qui coupe : il n'y a plus de
#    conteneur pour exécuter cette sonde, donc plus de rouge, donc plus de
#    signal. UNE SONDE LOCALE NE PEUT PAS SIGNALER SA PROPRE ABSENCE. Seule une
#    surveillance EXTERNE le peut (02 §11.3 cite Uptime Kuma) ; elle n'est pas
#    déployée, et rien dans ce fichier ne la remplace.
#  · ELLE NE PROUVE PAS QUE LE MARQUEUR DIT VRAI. C'est la déclaration du script
#    sur lui-même, pas un audit indépendant : quiconque peut écrire dans le
#    volume peut la fabriquer. Elle ne vérifie ni l'existence des archives, ni
#    leur taille, ni le contenu du bucket — un contrôle distant à chaque sonde
#    coûterait un appel réseau toutes les cinq minutes pour répondre à une
#    question quotidienne.
#  · ELLE NE DÉTECTE PAS LA CORRUPTION SILENCIEUSE, ni un dépôt lisible dont le
#    contenu serait faux — même limite que `depot_local_sain()`.
#  · ELLE NE DISTINGUE PAS un réseau coupé d'un jeton R2 révoqué. Elle constate
#    l'absence de résultat ; la cause est dans `docker logs`.
#  · ELLE NE VOIT PAS UNE PASSE BLOQUÉE PLUS VITE QUE SON SEUIL. Un blocage à
#    03h00 se lit vers 08h30 le lendemain. On ne peut pas constater l'absence
#    d'un événement quotidien plus vite qu'en un peu plus d'un jour ; prétendre
#    le contraire produirait des rouges à tort, et un rouge à tort finit
#    désactivé.
#  · ELLE NE SURVEILLE NI LE COÛT R2, NI LA RÉTENTION DISTANTE, NI L'ABSENCE DE
#    SECOND SITE (la règle 3-2-1 du 02 §11.4 reste incomplète : un seul distant).
#  · ELLE N'ENVOIE RIEN. Elle noircit une case dans `docker ps`, dans
#    l'interface de Coolify et pour tout outil de supervision qui lit l'état de
#    santé Docker. La notification sortante est le geste de `sauvegarde.sh`, pas
#    le sien : une sonde qui tourne toutes les cinq minutes et qui parle est une
#    sonde qui harcèle.
#
# -----------------------------------------------------------------------------
# LES QUATRE QUESTIONS QU'UNE SONDE DE FRAÎCHEUR DOIT TRANCHER
# -----------------------------------------------------------------------------
# 1. QUEL SEUIL, ET POURQUOI CELUI-LÀ. 30 h par défaut, et c'est une SOMME, pas
#    un chiffre rond :
#        24 h  la période nominale (une passe par jour, créneau `AXION_SAUVEGARDE_HEURE`)
#      +  2 h  la marge que le service s'accorde déjà à lui-même pour le
#              rattrapage (`AXION_SAUVEGARDE_TOLERANCE_H` = 26 h) : en deçà, le
#              script considère la sauvegarde à jour et NE FAIT RIEN. Rougir
#              avant qu'il n'ait décidé d'agir serait rougir sur son dos.
#      +  4 h  la durée maximale admise pour UNE passe (sauvegarde complète
#              hebdomadaire + archive MinIO + miroir R2). Mesuré le 2026-08-28
#              sur ce staging : 1 539 objets miroités en 16 s, passe complète
#              bien en deçà de la minute — mais MinIO y est quasi vide, et
#              c'est le poste qui grandira. Quatre heures est une marge, pas
#              une mesure ; elle se resserre le jour où l'on mesure la vraie
#              durée sur des données réelles.
#      = 30 h
#    Ce seuil est PLUS LARGE que la tolérance de rattrapage, délibérément : la
#    sonde ne rougit qu'une fois que le service a EU L'OCCASION d'agir et n'a
#    pas abouti. Elle constate un échec, elle n'anticipe pas une inquiétude.
#
# 2. PENDANT UNE PASSE EN COURS. Rien de spécial, et c'est voulu : les 4 h de
#    marge ci-dessus SONT la réponse. Une passe qui démarre au plus tard à 26 h
#    d'âge et qui dure jusqu'à 4 h reste sous les 30 h — elle ne fait donc pas
#    rougir la sonde. Un marqueur « passe en cours » a été écrit puis RETIRÉ :
#    il aurait rendu la sonde VERTE pendant une panne R2, puisque la boucle de
#    redémarrage le rafraîchissait à chaque tentative. Un marqueur d'effort
#    n'est pas un marqueur de résultat, et seuls les résultats sont lus ici.
#
# 3. AU PREMIER DÉMARRAGE, SANS AUCUN MARQUEUR. Le service lance une passe
#    IMMÉDIATEMENT dans ce cas (`doit_rattraper` est vrai quand le marqueur est
#    absent) : l'état « pas de marqueur » ne dure donc que le temps d'une passe.
#    La sonde répond KO — parce qu'à cet instant il n'y a réellement AUCUNE
#    copie hors serveur, et qu'annoncer `healthy` serait le mensonge exact que
#    ce lot démonte depuis ce matin — mais avec un message DIFFÉRENT :
#        « AUCUNE expédition n'a JAMAIS réussi »   ≠   « l'expédition a CESSÉ ».
#    Les deux états ne se confondent pas dans `docker logs`, ni dans l'interface
#    de Coolify qui affiche la dernière sortie de la sonde. Le `start_period` du
#    compose (30 min) absorbe le cas légitime : le conteneur reste `starting` et
#    ne devient `unhealthy` que si la première passe n'a toujours pas abouti au
#    bout d'une demi-heure — ce qui, à ce moment-là, est vrai.
#
# 4. SI L'HORLOGE RECULE. Un marqueur daté DANS LE FUTUR donne un âge négatif :
#    une comparaison naïve le lirait comme « très frais » et rendrait VERT une
#    sauvegarde qui n'existe pas. La sonde refuse : au-delà de 300 s d'avance
#    (marge d'un ajustement NTP ordinaire), elle rend KO en nommant l'anomalie.
#    Une sonde qui ne peut plus mesurer ce qu'elle annonce ne doit pas être
#    verte. Un marqueur vide ou non numérique — écriture interrompue, disque
#    plein — est traité de la même façon.
#
# -----------------------------------------------------------------------------
# ELLE NE PARLE À PERSONNE ET NE PEUT PAS PENDRE
# -----------------------------------------------------------------------------
# Aucun réseau, aucune connexion à PostgreSQL, aucun appel à `mc` : deux
# lectures de fichiers de moins de vingt octets. Une sonde qui interroge un
# service distant peut pendre, et une sonde qui pend ment par omission — c'est
# la leçon écrite en tête de `healthcheck.sh`, elle vaut ici aussi.
#
# `sh` suffit : aucun tube, aucun tableau, aucune substitution de processus.
# `sauvegarde.sh` exige `bash` pour `set -o pipefail` ; cette sonde n'a pas de
# tube à protéger, et le contrôle de construction du Dockerfile est donc `sh -n`.
# =============================================================================
set -eu

ARCHIVES="${AXION_ARCHIVES:-/sauvegarde}"

# Seuil de fraîcheur, en heures. Voir la question 1 ci-dessus pour la somme
# 24 + 2 + 4. Réglable par l'exploitation ; le défaut est celui qui est justifié.
SEUIL_H="${AXION_SAUVEGARDE_SEUIL_ALERTE_H:-30}"

# Avance tolérée sur l'horloge, en secondes, avant de crier à l'anomalie.
# 300 s couvre un ajustement NTP ordinaire sans couvrir un recul de fuseau.
MARGE_FUTUR_S=300

case "$SEUIL_H" in
  '' | *[!0-9]*)
    echo "sonde sauvegarde KO — AXION_SAUVEGARDE_SEUIL_ALERTE_H n'est pas un entier d'heures : le seuil de fraicheur est inutilisable"
    exit 1
    ;;
esac
[ "$SEUIL_H" -gt 0 ] || {
  echo "sonde sauvegarde KO — AXION_SAUVEGARDE_SEUIL_ALERTE_H vaut 0 : une sonde sans seuil ne mesure rien"
  exit 1
}

SEUIL_S=$((SEUIL_H * 3600))
MAINTENANT="$(date -u +%s)"

# Le volume lui-même. S'il n'est pas monté, les marqueurs seront « absents » pour
# une raison qui n'a rien à voir avec les sauvegardes — et la panne est plus
# grave, pas moins : le service écrit alors dans la couche éphémère du conteneur.
if [ ! -d "$ARCHIVES" ]; then
  echo "sonde sauvegarde KO — repertoire d'archives $ARCHIVES absent : le volume n'est pas monte, aucun marqueur n'est lisible"
  exit 1
fi

# Âge d'un marqueur, en secondes, sur la sortie standard.
# Rend une chaîne d'ÉTAT et non un nombre quand la mesure est impossible :
# `absent`, `illisible`, `futur`. Un âge et un état ne se confondent jamais.
age_marqueur() {
  fichier="$ARCHIVES/$1"
  if [ ! -r "$fichier" ]; then
    echo absent
    return 0
  fi
  contenu="$(cat "$fichier" 2>/dev/null || true)"
  case "$contenu" in
    '' | *[!0-9]*)
      echo illisible
      return 0
      ;;
  esac
  ecart=$((MAINTENANT - contenu))
  if [ "$ecart" -lt "-$MARGE_FUTUR_S" ]; then
    echo futur
    return 0
  fi
  # Une avance inférieure à la marge est ramenée à zéro : elle est du bruit
  # d'horloge, pas de la fraîcheur négative.
  [ "$ecart" -ge 0 ] || ecart=0
  echo "$ecart"
}

AGE_PASSE="$(age_marqueur .derniere-passe)"
AGE_EXPEDITION="$(age_marqueur .derniere-expedition)"

# Formatage lisible — un exploitant lit « 51 h », pas « 183600 s ».
en_heures() {
  case "$1" in
    '' | *[!0-9]*) echo "$1" ;;
    *) echo "$(($1 / 3600)) h" ;;
  esac
}

# --- Verdict, du plus grave au moins grave -----------------------------------
#
# ORDRE DÉLIBÉRÉ. La moitié LOCALE passe avant la moitié HORS SERVEUR : perdre
# la sauvegarde locale, c'est n'avoir plus rien de neuf à restaurer (code 1 du
# service) ; perdre l'expédition, c'est tenir la perte logique mais pas la perte
# du serveur (code 2). Ce sont les deux gravités que `sauvegarde.sh` distingue
# déjà par ses codes de sortie ; la sonde ne les réinvente pas, elle les relit.

# 1. Anomalies de mesure — la sonde ne sait plus ce qu'elle mesure.
case "$AGE_PASSE:$AGE_EXPEDITION" in
  *futur*)
    echo "sonde sauvegarde KO — marqueur date DANS LE FUTUR (horloge reculee, ou marqueur fabrique) : l'age des sauvegardes n'est plus mesurable, aucune conclusion possible"
    exit 1
    ;;
  *illisible*)
    echo "sonde sauvegarde KO — marqueur vide ou non numerique (ecriture interrompue, disque plein) : l'age des sauvegardes n'est plus mesurable"
    exit 1
    ;;
esac

# 2. JAMAIS ≠ PLUS. Deux messages distincts, exigés par la question 3 ci-dessus.
if [ "$AGE_PASSE" = absent ] && [ "$AGE_EXPEDITION" = absent ]; then
  echo "sonde sauvegarde KO — AUCUNE passe n'a JAMAIS abouti sur ce volume (aucun marqueur) : premier demarrage en cours, ou service qui n'a jamais reussi une seule passe. Ce n'est PAS 'les sauvegardes ont cesse'."
  exit 1
fi
if [ "$AGE_PASSE" = absent ]; then
  echo "sonde sauvegarde KO — AUCUNE sauvegarde locale n'a JAMAIS abouti, alors qu'une expedition a eu lieu il y a $(en_heures "$AGE_EXPEDITION") : etat incoherent, le volume d'archives a probablement ete remplace."
  exit 1
fi
if [ "$AGE_EXPEDITION" = absent ]; then
  echo "sonde sauvegarde KO — sauvegarde locale il y a $(en_heures "$AGE_PASSE"), mais AUCUNE copie hors serveur n'a JAMAIS reussi : la regle 3-2-1 (02 §11.4) n'a jamais ete tenue. Perdre le VPS, c'est tout perdre."
  exit 1
fi

# 3. Péremption — le cas courant, et celui pour lequel cette sonde existe.
if [ "$AGE_PASSE" -ge "$SEUIL_S" ] && [ "$AGE_EXPEDITION" -ge "$SEUIL_S" ]; then
  echo "sonde sauvegarde KO — PLUS AUCUNE SAUVEGARDE : derniere passe locale il y a $(en_heures "$AGE_PASSE"), derniere copie hors serveur il y a $(en_heures "$AGE_EXPEDITION") (seuil ${SEUIL_H} h). Le service est vivant et ne produit plus rien — voir docker logs."
  exit 1
fi
if [ "$AGE_PASSE" -ge "$SEUIL_S" ]; then
  echo "sonde sauvegarde KO — sauvegarde LOCALE perimee : derniere passe il y a $(en_heures "$AGE_PASSE") (seuil ${SEUIL_H} h). Il n'y a rien de neuf a restaurer depuis."
  exit 1
fi
if [ "$AGE_EXPEDITION" -ge "$SEUIL_S" ]; then
  echo "sonde sauvegarde KO — copie HORS SERVEUR perimee : derniere expedition reussie il y a $(en_heures "$AGE_EXPEDITION") (seuil ${SEUIL_H} h), sauvegarde locale il y a $(en_heures "$AGE_PASSE"). La regle 3-2-1 est rompue : la perte du VPS emporterait tout depuis cette date."
  exit 1
fi

echo "sonde sauvegarde OK — sauvegarde locale il y a $(en_heures "$AGE_PASSE"), copie hors serveur verifiee il y a $(en_heures "$AGE_EXPEDITION") (seuil ${SEUIL_H} h)"
exit 0
