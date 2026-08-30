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
# ⚠️ CE QU'ELLE PROUVAIT AVANT LE 2026-08-28 : DEUX ENTIERS. C'ÉTAIT LE DÉFAUT.
# -----------------------------------------------------------------------------
# La version précédente comparait l'ÂGE DE DEUX MARQUEURS à un seuil, et rien
# d'autre. Elle l'avouait elle-même, dans ce même en-tête : « elle ne vérifie ni
# l'existence des archives, ni leur taille ». MAIS UN AVEU DANS UN COMMENTAIRE
# N'EST PAS UN GARDE-FOU. Mesuré : deux `echo $(date +%s)` dans un volume par
# ailleurs VIDE la rendaient VERTE — pas une archive, pas un dépôt, pas un octet
# de sauvegarde nulle part, et `docker ps` affichait `(healthy)`.
# C'est exactement la famille de défauts que ce lot passe sa journée à éliminer :
# `pg_isready` mesurait « une connexion passe » et prétendait « le cluster va
# bien » ; cette sonde mesurait « quelqu'un a écrit deux nombres » et prétendait
# « les sauvegardes sortent ». Un marqueur est une DÉCLARATION ; une archive est
# un FAIT. Elle lit désormais les deux, et elle ne croit la déclaration que si le
# fait la confirme.
#
# -----------------------------------------------------------------------------
# CE QU'ELLE PROUVE — QUATRE FAITS, DU MOINS CHER AU PLUS CHER
# -----------------------------------------------------------------------------
# 1. FRAÎCHEUR DES DEUX MARQUEURS (moins de ${AXION_SAUVEGARDE_SEUIL_ALERTE_H} h).
#    Le service ne les écrit qu'APRÈS avoir vérifié sa moitié :
#      · `.derniere-passe`      — la moitié LOCALE : `pgbackrest backup` a rendu
#        0, l'archive MinIO a été chiffrée PUIS RELUE et son SHA-256 comparé à la
#        source, la rotation est passée ;
#      · `.derniere-expedition` — la moitié HORS SERVEUR : le miroir `mc` a rendu
#        0, deux objets ont été RETÉLÉCHARGÉS depuis R2 et leur SHA-256 comparé à
#        la source, et le bucket contient au moins un objet.
#
# 2. LE DÉPÔT pgBackRest A UN POINT DE DÉPART. `backup/<stanza>/backup.info`
#    existe et n'est pas vide. C'est LE fichier sans lequel aucune restauration
#    ne démarre : le 2026-08-28, la chaîne avait une stanza valide, un dépôt
#    chiffré, un archivage WAL sans un seul échec — et `pgbackrest info`
#    répondait `status: error (no valid backups)`. Des WAL archivés qui ne se
#    rejouent sur rien. Un `test -s` répond à cette question pour rien.
#
# 3. UNE ARCHIVE MinIO EXISTE, ELLE EST RÉCENTE, ELLE A UNE TAILLE PLAUSIBLE, ET
#    SON EMPREINTE EST PUBLIÉE. La plus récente au sens de l'HORODATAGE DE SON
#    NOM — jamais de la date du système de fichiers, qu'une copie, une
#    restauration ou un `touch` déplacent (même raisonnement que la rotation par
#    rang dans `sauvegarde.sh`). Le plancher de taille est MESURÉ, pas choisi :
#        archive d'un répertoire VIDE                     153 octets
#        archive d'un volume MinIO minimal (4 Ko utiles) 4 341 octets
#    ${AXION_SAUVEGARDE_ARCHIVE_MIN_O} octets (1 Ko par défaut) sépare donc
#    proprement « archive de rien / tronquée » de « archive d'un vrai volume ».
#    Le `.sha256` que `sauvegarde.sh` écrit à côté de chaque archive doit être là
#    et bien formé : une archive sans empreinte publiée n'est pas vérifiable.
#
# 4. L'EMPREINTE EST CELLE ANNONCÉE. La sonde recalcule le SHA-256 de l'archive
#    et le compare à son `.sha256`. C'est le seul contrôle qui attrape une
#    archive TRONQUÉE ou ALTÉRÉE après publication — et c'est le seul qui coûte
#    quelque chose, d'où les deux garde-fous du paragraphe suivant.
#
# -----------------------------------------------------------------------------
# LE DANGER INVERSE, ET CE QU'IL COÛTE — UNE SONDE QUI ROUGIT À TORT EST PIRE
# QU'UNE SONDE ABSENTE
# -----------------------------------------------------------------------------
# Une sonde qui recalculerait aveuglément l'empreinte d'une archive de plusieurs
# gigaoctets toutes les cinq minutes dépasserait le `timeout` du compose, serait
# TUÉE en plein calcul, et rendrait le conteneur `unhealthy` AU HASARD. Le
# premier exploitant agacé la désactiverait — et une sonde désactivée vaut
# strictement moins que pas de sonde du tout. C'est la même leçon que le seuil de
# 30 h : « prétendre le contraire produirait des rouges à tort, et un rouge à
# tort finit désactivé ». Deux garde-fous, donc :
#   · UN PLAFOND DE TAILLE (${AXION_SAUVEGARDE_EMPREINTE_MAX_MO} Mo, 256 par
#     défaut) et un `timeout` interne strictement inférieur au `timeout` du
#     compose. Au-delà, l'empreinte N'EST PAS RECALCULÉE — et la sonde LE DIT
#     dans son verdict, au lieu de laisser croire qu'elle l'a fait. Un fait non
#     établi qu'on annonce comme non établi n'est pas un mensonge ;
#   · UNE MÉMOIRE : le verdict d'empreinte est retenu dans
#     `.derniere-verification`, indexé sur le NOM, la TAILLE et la DATE de
#     l'archive. Tant que ces trois-là ne bougent pas, le calcul n'est pas
#     refait. Une troncature ou une réécriture changent la taille ou la date,
#     donc invalident la mémoire, donc font recalculer : la mémoire accélère,
#     elle n'aveugle pas. Le nom commence par `.derniere-` : il est donc déjà
#     exclu du miroir R2 par le `--exclude '.derniere-*'` en place — cet état
#     décrit CETTE machine et n'a rien à faire dans une copie de secours.
#     Si le fichier ne peut pas être écrit, la sonde recalcule à chaque passage :
#     elle est plus lente, jamais moins juste.
#
# -----------------------------------------------------------------------------
# CE QU'ELLE NE PROUVE PAS — À LIRE AVANT DE S'Y FIER, ET À FROID
# -----------------------------------------------------------------------------
#  · ELLE NE PROUVE PAS QU'UNE BASE SE RECONSTRUIT. Elle vérifie des artefacts,
#    elle ne rejoue rien. « L'archive est intègre et l'expédition s'est relue »
#    n'est pas « une restauration aboutit » : seul le test de restauration
#    (infra/README.md §5.4-5.5) répond à cette question, et il est joué à la main.
#  · ELLE NE DIT RIEN SI LA MACHINE EST MORTE. C'est la limite qui compte le
#    plus, et c'est exactement le scénario contre lequel la copie hors serveur
#    existe. VPS éteint, disque en panne, hébergeur qui coupe : il n'y a plus de
#    conteneur pour exécuter cette sonde, donc plus de rouge, donc plus de
#    signal. UNE SONDE LOCALE NE PEUT PAS SIGNALER SA PROPRE ABSENCE. Seule une
#    surveillance EXTERNE le peut (02 §11.3 cite Uptime Kuma) ; elle n'est pas
#    déployée, et rien dans ce fichier ne la remplace.
#  · ELLE NE VÉRIFIE RIEN DE DISTANT. Le contenu du bucket R2 n'est pas consulté :
#    un contrôle réseau toutes les cinq minutes pour répondre à une question
#    quotidienne coûterait cher et pourrait PENDRE, et une sonde qui pend ment
#    par omission. Sur la moitié HORS SERVEUR, elle en reste donc à la
#    déclaration du service — c'est `sauvegarde.sh` qui retélécharge et compare,
#    une fois par passe.
#  · ELLE NE DÉCHIFFRE PAS L'ARCHIVE. L'empreinte comparée est celle du CHIFFRÉ.
#    Elle prouve que l'octet publié est resté l'octet publié ; elle ne prouve pas
#    que ce que `gpg` en sortirait est un `tar` lisible. Ce contrôle-là existe,
#    il est fait UNE FOIS par `archiver_minio` au moment de la publication (flux
#    redéchiffré, redécompressé, empreinte comparée à la source) — le seul moment
#    où l'on peut s'en apercevoir sans dommage.
#  · ELLE NE PROUVE PAS QU'UN ADVERSAIRE N'A RIEN FABRIQUÉ. Qui peut écrire dans
#    le volume peut écrire une archive, son `.sha256` cohérent et les marqueurs.
#    Ce n'est pas le problème qu'elle traite : elle attrape un SYSTÈME CASSÉ, pas
#    un attaquant. Ce qui a changé le 2026-08-28, c'est qu'il faut désormais
#    fabriquer une chaîne COHÉRENTE, là où deux entiers suffisaient.
#  · ELLE NE DÉTECTE PAS LA CORRUPTION SILENCIEUSE DU DÉPÔT pgBackRest : elle
#    vérifie que `backup.info` existe et n'est pas vide, pas que son contenu est
#    juste — même limite que `depot_local_sain()`.
#  · ELLE NE VOIT PAS UNE ARCHIVE TRONQUÉE PLUS GROSSE QUE
#    ${AXION_SAUVEGARDE_EMPREINTE_MAX_MO} Mo. Au-delà du plafond, seules la
#    taille et la présence du `.sha256` sont contrôlées, et le verdict le
#    mentionne. C'est le prix, assumé, de ne pas rougir à tort.
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
# 2bis. QUEL ORDRE ENTRE LES MARQUEURS ET LES ARTEFACTS. Les marqueurs d'abord,
#    les artefacts ensuite, et ce n'est pas un détail de style : « aucune passe
#    n'a JAMAIS abouti » (premier démarrage) et « les marqueurs mentent »
#    (volume vidé, artefacts absents) sont deux pannes différentes qui doivent
#    porter deux messages différents. Lire les artefacts en premier écraserait le
#    cas du premier démarrage — parfaitement légitime — sous un message
#    d'incohérence alarmant. La sonde répond donc dans l'ordre : « puis-je
#    mesurer ? », « quelqu'un a-t-il déjà réussi ? », « est-ce récent ? », et
#    seulement alors « est-ce vrai ? ».
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
# Aucun réseau, aucune connexion à PostgreSQL, aucun appel à `mc` : des lectures
# de fichiers LOCAUX, et un seul calcul d'empreinte, PLAFONNÉ EN TAILLE et
# enveloppé d'un `timeout` interne strictement inférieur à celui du compose. Une
# sonde qui interroge un service distant peut pendre, et une sonde qui pend ment
# par omission — c'est la leçon écrite en tête de `healthcheck.sh`, elle vaut ici
# aussi, et le plafond est ce qui l'applique au seul contrôle coûteux de ce
# fichier.
#
# `sh` suffit : aucun tableau, aucune substitution de processus. Les deux tubes
# présents (`sha256sum | cut`, `ls | grep | sort | head`) n'ont pas de tête
# faillible dont le silence tromperait — un `sha256sum` en échec rend une chaîne
# vide, qui ne peut égaler aucune empreinte, donc jamais un faux vert.
# `sauvegarde.sh` exige `bash` pour `set -o pipefail` ; le contrôle de
# construction du Dockerfile reste donc `sh -n` pour cette sonde.
# =============================================================================
set -eu

ARCHIVES="${AXION_ARCHIVES:-/sauvegarde}"

# Le dépôt pgBackRest et la stanza, tels que les voit le service `sauvegarde` :
# MÊMES valeurs et MÊMES défauts que `sauvegarde.sh`. Une divergence ferait
# regarder la sonde à un endroit où personne ne sauvegarde.
DEPOT="${PGBACKREST_REPO1_PATH:-/var/lib/pgbackrest}"
STANZA="${PGBACKREST_STANZA:-axion}"

# Plancher de taille d'une archive MinIO, en octets. MESURÉ (2026-08-28, image de
# la pile) : 153 octets pour l'archive d'un répertoire VIDE, 4 341 octets pour
# celle d'un volume minimal. 1 Ko sépare les deux sans ambiguïté.
ARCHIVE_MIN_O="${AXION_SAUVEGARDE_ARCHIVE_MIN_O:-1024}"

# Plafond au-delà duquel l'empreinte n'est PAS recalculée par la sonde. Voir
# « LE DANGER INVERSE » : au-dessus, le calcul dépasserait le `timeout` du
# compose et produirait des rouges à tort.
EMPREINTE_MAX_MO="${AXION_SAUVEGARDE_EMPREINTE_MAX_MO:-256}"

# Délai maximal accordé au calcul d'empreinte, en secondes. STRICTEMENT
# inférieur au `timeout` du healthcheck du compose (30 s) : la sonde doit rendre
# un verdict, jamais se faire tuer au milieu d'un calcul.
EMPREINTE_DELAI_S="${AXION_SAUVEGARDE_EMPREINTE_DELAI_S:-10}"

# Mémoire du dernier verdict d'empreinte : « nom taille date empreinte ».
# Préfixe `.derniere-` → déjà exclu du miroir R2 par `sauvegarde.sh`.
MEMOIRE="$ARCHIVES/.derniere-verification"

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

# Les trois nouveaux réglages. Une sonde dont un paramètre est absurde ne mesure
# plus ce qu'elle annonce : elle doit le dire, pas l'ignorer.
for _couple in \
  "AXION_SAUVEGARDE_ARCHIVE_MIN_O=$ARCHIVE_MIN_O" \
  "AXION_SAUVEGARDE_EMPREINTE_MAX_MO=$EMPREINTE_MAX_MO" \
  "AXION_SAUVEGARDE_EMPREINTE_DELAI_S=$EMPREINTE_DELAI_S"; do
  _nom="${_couple%%=*}"
  _valeur="${_couple#*=}"
  case "$_valeur" in
    '' | *[!0-9]*)
      echo "sonde sauvegarde KO — $_nom='$_valeur' n'est pas un entier : la sonde ne peut plus appliquer le controle qu'elle annonce"
      exit 1
      ;;
  esac
done

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

# =============================================================================
# 4. LES ARTEFACTS — LÀ OÙ LA SONDE CESSE DE CROIRE LES MARQUEURS SUR PAROLE
#
# Tout ce qui précède lit ce que le service DIT de lui-même. Ce qui suit lit ce
# qu'il a PRODUIT. Deux `echo $(date +%s)` dans un volume vide passaient les
# trois premières sections ; ils ne passent aucune de celles-ci.
# =============================================================================

# --- 4a. Le dépôt pgBackRest a un point de départ ----------------------------
# Sans `backup.info`, les WAL archivés ne se rejouent SUR RIEN : c'est
# exactement l'état trouvé le 2026-08-28 (`status: error (no valid backups)`),
# avec une stanza valide et un archivage sans le moindre échec.
if [ ! -d "$DEPOT" ]; then
  echo "sonde sauvegarde KO — le depot pgBackRest $DEPOT n'est pas monte dans ce conteneur : le service ne peut ni sauvegarder ni expedier, quoi que disent les marqueurs"
  exit 1
fi
if [ ! -s "$DEPOT/backup/$STANZA/backup.info" ]; then
  echo "sonde sauvegarde KO — le marqueur annonce une sauvegarde locale il y a $(en_heures "$AGE_PASSE"), mais $DEPOT/backup/$STANZA/backup.info est absent ou vide : le depot n'a AUCUN point de depart et les WAL archives ne se rejoueraient sur rien"
  exit 1
fi

# --- 4b. Une archive MinIO existe --------------------------------------------
# `|| true` : `grep` rend 1 quand rien ne correspond, et l'absence d'archive est
# un verdict à rendre, pas une erreur d'exécution.
ARCHIVE="$(ls -1 "$ARCHIVES" 2>/dev/null | grep -E '^minio-[0-9]{8}T[0-9]{6}Z\.tar\.zst\.gpg$' | sort -r | head -1 || true)"
if [ -z "$ARCHIVE" ]; then
  echo "sonde sauvegarde KO — les marqueurs annoncent une sauvegarde locale il y a $(en_heures "$AGE_PASSE") et une copie hors serveur il y a $(en_heures "$AGE_EXPEDITION"), mais $ARCHIVES ne contient AUCUNE archive MinIO. Des marqueurs sans archive ne sont pas une sauvegarde : ce sont deux nombres."
  exit 1
fi

# --- 4c. Sa taille est plausible ---------------------------------------------
TAILLE_O="$(stat -c %s "$ARCHIVES/$ARCHIVE" 2>/dev/null || echo 0)"
case "$TAILLE_O" in
  '' | *[!0-9]*) TAILLE_O=0 ;;
esac
if [ "$TAILLE_O" -lt "$ARCHIVE_MIN_O" ]; then
  echo "sonde sauvegarde KO — l'archive $ARCHIVE pese ${TAILLE_O} octets, sous le plancher de ${ARCHIVE_MIN_O} : archive vide ou TRONQUEE (mesure de reference : 153 octets pour un repertoire vide, 4341 pour un volume minimal)"
  exit 1
fi

# --- 4d. Son empreinte est publiée et bien formée ----------------------------
if [ ! -s "$ARCHIVES/$ARCHIVE.sha256" ]; then
  echo "sonde sauvegarde KO — l'archive $ARCHIVE n'a pas de fichier d'empreinte .sha256 : elle n'est donc VERIFIABLE par personne, ni ici, ni apres une restauration"
  exit 1
fi
EMPREINTE_ATTENDUE="$(cut -d' ' -f1 <"$ARCHIVES/$ARCHIVE.sha256" 2>/dev/null || true)"
case "$EMPREINTE_ATTENDUE" in
  '' | *[!0-9a-f]*)
    echo "sonde sauvegarde KO — le fichier $ARCHIVE.sha256 ne contient pas une empreinte SHA-256 lisible : l'archive est invérifiable"
    exit 1
    ;;
esac
if [ "${#EMPREINTE_ATTENDUE}" -ne 64 ]; then
  echo "sonde sauvegarde KO — le fichier $ARCHIVE.sha256 contient ${#EMPREINTE_ATTENDUE} caracteres au lieu de 64 : ce n'est pas une empreinte SHA-256, l'archive est inverifiable"
  exit 1
fi

# --- 4e. Elle est RÉCENTE, d'après l'horodatage de son NOM -------------------
# Jamais la date du système de fichiers : une copie, une restauration ou un
# `touch` la déplacent. Le nom, lui, est écrit par le service au moment de la
# publication (même raisonnement que la rotation par rang de `sauvegarde.sh`).
_h="${ARCHIVE#minio-}"
_h="${_h%.tar.zst.gpg}"
EPOCH_ARCHIVE="$(date -u -d "$(printf %s "$_h" | cut -c1-4)-$(printf %s "$_h" | cut -c5-6)-$(printf %s "$_h" | cut -c7-8) $(printf %s "$_h" | cut -c10-11):$(printf %s "$_h" | cut -c12-13):$(printf %s "$_h" | cut -c14-15)" +%s 2>/dev/null || true)"
case "$EPOCH_ARCHIVE" in
  '' | *[!0-9]*)
    echo "sonde sauvegarde KO — l'horodatage du nom $ARCHIVE n'est pas une date : la fraicheur des archives n'est plus mesurable"
    exit 1
    ;;
esac
AGE_ARCHIVE=$((MAINTENANT - EPOCH_ARCHIVE))
if [ "$AGE_ARCHIVE" -lt "-$MARGE_FUTUR_S" ]; then
  echo "sonde sauvegarde KO — l'archive la plus recente ($ARCHIVE) est datee DANS LE FUTUR : l'age des sauvegardes n'est plus mesurable, aucune conclusion possible"
  exit 1
fi
[ "$AGE_ARCHIVE" -ge 0 ] || AGE_ARCHIVE=0
if [ "$AGE_ARCHIVE" -ge "$SEUIL_S" ]; then
  echo "sonde sauvegarde KO — les marqueurs sont frais (locale $(en_heures "$AGE_PASSE"), hors serveur $(en_heures "$AGE_EXPEDITION")) mais l'archive MinIO la plus recente date de $(en_heures "$AGE_ARCHIVE") (seuil ${SEUIL_H} h) : les marqueurs ne decrivent plus ce que le volume contient"
  exit 1
fi

# --- 4f. Son empreinte est celle annoncée ------------------------------------
# Le seul contrôle coûteux du fichier. Plafonné en taille, borné par `timeout`,
# et mémoïsé sur (nom, taille, date) — voir « LE DANGER INVERSE » en tête.
MTIME_ARCHIVE="$(stat -c %Y "$ARCHIVES/$ARCHIVE" 2>/dev/null || echo 0)"
TAILLE_MO=$((TAILLE_O / 1048576))
VERDICT_EMPREINTE=''

_m_nom=''
_m_taille=''
_m_date=''
_m_empreinte=''
if [ -r "$MEMOIRE" ]; then
  read -r _m_nom _m_taille _m_date _m_empreinte <"$MEMOIRE" 2>/dev/null || true
fi
if [ "$_m_nom" = "$ARCHIVE" ] && [ "$_m_taille" = "$TAILLE_O" ] &&
  [ "$_m_date" = "$MTIME_ARCHIVE" ] && [ "$_m_empreinte" = "$EMPREINTE_ATTENDUE" ]; then
  VERDICT_EMPREINTE='empreinte conforme (verifiee lors d un passage precedent, archive inchangee)'
elif [ "$TAILLE_MO" -gt "$EMPREINTE_MAX_MO" ]; then
  # DIT, jamais tu : un fait non établi qu'on annonce comme non établi n'est pas
  # un mensonge. Le taire en rendant VERT en serait un.
  VERDICT_EMPREINTE="empreinte NON verifiee a ce passage — archive de ${TAILLE_MO} Mo au-dela du plafond ${EMPREINTE_MAX_MO} Mo (voir AXION_SAUVEGARDE_EMPREINTE_MAX_MO)"
else
  EMPREINTE_OBTENUE="$(timeout "$EMPREINTE_DELAI_S" sha256sum "$ARCHIVES/$ARCHIVE" 2>/dev/null | cut -d' ' -f1 || true)"
  if [ -z "$EMPREINTE_OBTENUE" ]; then
    VERDICT_EMPREINTE="empreinte NON verifiee a ce passage — calcul interrompu au-dela de ${EMPREINTE_DELAI_S} s"
  elif [ "$EMPREINTE_OBTENUE" != "$EMPREINTE_ATTENDUE" ]; then
    echo "sonde sauvegarde KO — l'archive $ARCHIVE NE CORRESPOND PAS a son empreinte publiee (attendue $(printf %s "$EMPREINTE_ATTENDUE" | cut -c1-16)…, obtenue $(printf %s "$EMPREINTE_OBTENUE" | cut -c1-16)…) : archive alteree ou tronquee apres publication, elle ne restaurera rien"
    exit 1
  else
    # Mémoire au mieux : si le volume n'est pas inscriptible, la sonde recalcule
    # au prochain passage. Plus lente, jamais moins juste.
    printf '%s %s %s %s\n' "$ARCHIVE" "$TAILLE_O" "$MTIME_ARCHIVE" "$EMPREINTE_ATTENDUE" >"$MEMOIRE" 2>/dev/null || true
    VERDICT_EMPREINTE='empreinte conforme'
  fi
fi

echo "sonde sauvegarde OK — sauvegarde locale il y a $(en_heures "$AGE_PASSE"), copie hors serveur verifiee il y a $(en_heures "$AGE_EXPEDITION") (seuil ${SEUIL_H} h) ; depot pgBackRest avec point de depart, archive $ARCHIVE de ${TAILLE_O} octets datant de $(en_heures "$AGE_ARCHIVE") — ${VERDICT_EMPREINTE}"
exit 0
