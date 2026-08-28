#!/bin/bash
# =============================================================================
# infra/postgres/sauvegarde.sh — SAUVEGARDE PLANIFIÉE, PostgreSQL ET MinIO
# Applique : invariant 8 (« sauvegarde disponible ET TESTÉE »), 02 §11.4
# (WAL archiving + sauvegarde complète, copie CHIFFRÉE, rétention 30 j),
# 07 ligne L0 (« restauration Postgres ET MinIO testée depuis zéro »).
#
# -----------------------------------------------------------------------------
# POURQUOI CE SCRIPT EXISTE — LA MÊME LEÇON QUE `stanza-create.sh`, AU CRAN
# SUIVANT
# -----------------------------------------------------------------------------
# Le 2026-08-28, le staging avait une stanza pgBackRest valide, un dépôt chiffré
# et un archivage WAL sans un seul échec — et AUCUNE sauvegarde complète.
# `pgbackrest info` répondait `status: error (no valid backups)`.
# Ce n'est pas un détail de configuration : SANS SAUVEGARDE COMPLÈTE, LES WAL
# ARCHIVÉS NE SE REJOUENT SUR RIEN. Un `restore` échoue faute de point de départ.
# La chaîne avait donc toutes les apparences d'une chaîne de sauvegarde, et rien
# de restaurable au bout.
#
# La cause n'est pas un oubli : `pgbackrest backup` n'était appelé par rien. Une
# commande qu'un humain doit taper sera oubliée — c'est exactement ce qui était
# arrivé à `stanza-create`, corrigé par `infra/postgres/stanza-create.sh` et le
# job `createstanza` du compose. Ce script est le même geste : la sauvegarde
# devient un SERVICE de la pile, versionné, planifié, dont l'échec se voit.
#
# -----------------------------------------------------------------------------
# CE QU'IL FAIT, EN UNE PASSE
# -----------------------------------------------------------------------------
#  1. PostgreSQL : `pgbackrest backup` — complète le jour dit, incrémentale les
#     autres jours. Dépôt CHIFFRÉ (aes-256-cbc, déjà en place), rétention portée
#     par l'environnement.
#  2. MinIO : archive `tar + zstd + gpg AES256` du volume de données, monté en
#     LECTURE SEULE, puis rotation par nombre.
#  3. EXPÉDITION HORS SERVEUR vers Cloudflare R2 (`mc mirror`) : le dépôt
#     pgBackRest ET les archives MinIO, tels quels — ils sont DÉJÀ chiffrés au
#     repos, rien n'est rechiffré et rien de clair ne part.
#  4. Deux marqueurs distincts (`$ARCHIVES/.derniere-passe` pour la moitié
#     LOCALE, `$ARCHIVES/.derniere-expedition` pour la moitié HORS SERVEUR), qui
#     servent au rattrapage au démarrage. Deux marqueurs et non un : une
#     sauvegarde locale réussie dont l'envoi a échoué n'est PAS une sauvegarde
#     ratée, et le rattrapage ne doit pas refaire tourner `pgbackrest backup`
#     pour rejouer un simple envoi.
#
# -----------------------------------------------------------------------------
# POURQUOI UN SIDE-CAR, ET PAS AUTRE CHOSE — LE CHOIX EST MESURÉ
# -----------------------------------------------------------------------------
# · BullMQ (déjà dans la pile, 11 §1) a été ÉCARTÉ : le worker est un runtime
#   Node qui n'a ni `pgbackrest`, ni le répertoire de données, ni le socket de
#   PostgreSQL. Les lui donner reviendrait à ouvrir au code applicatif un accès
#   brut aux fichiers de la base — une élévation de privilège pour aucun gain.
# · LES TÂCHES PLANIFIÉES DE COOLIFY ont été ÉCARTÉES : leur définition vit dans
#   la base de Coolify, pas dans ce dépôt. Elle serait invisible à `git`, absente
#   d'une reconstruction, et personne ne verrait qu'elle a disparu. C'est
#   littéralement le défaut que ce lot vient de corriger deux fois.
# · RESTE LE CONTENEUR DE PLANIFICATION, retenu ici. Il est versionné, il part
#   avec la pile, et son échec est visible là où on regarde déjà (`docker ps`).
#
# -----------------------------------------------------------------------------
# CE QU'IL NE COUVRE PAS — À LIRE AVANT DE S'Y FIER, ET À FROID
# -----------------------------------------------------------------------------
#   · PILE ARRÊTÉE = AUCUNE SAUVEGARDE. Un conteneur ne se réveille pas seul.
#
#   · LA SURVEILLANCE EXTERNE MANQUE, ET C'EST DÉSORMAIS LE TROU PRINCIPAL.
#     Depuis ce lot, la panne est VISIBLE (sonde de santé
#     `sauvegarde-healthcheck.sh` → `docker ps`, Coolify, toute supervision qui
#     lit l'état Docker) et AUDIBLE (alerte Telegram, plus bas, dès que le canal
#     existe). Ces deux pièces ont la MÊME limite, et elle est totale : ELLES
#     S'EXÉCUTENT SUR LA MACHINE QU'ELLES SURVEILLENT. VPS éteint, disque mort,
#     noyau bloqué, hébergeur qui coupe : plus de conteneur, donc plus de sonde,
#     donc plus de rouge — et plus d'alerte, puisque c'est ce script qui l'émet.
#     UN SYSTÈME NE PEUT PAS SIGNALER SA PROPRE ABSENCE. Or c'est EXACTEMENT le
#     scénario contre lequel la copie hors serveur existe : le jour où l'on en
#     aura besoin est le jour où rien de tout cela ne parlera.
#     Seule une sonde EXTERNE, hébergée ailleurs, qui s'inquiète du SILENCE (un
#     « heartbeat » que ce service cesserait d'émettre) ferme ce trou. 02 §11.3
#     cite Uptime Kuma ; IL N'EST PAS DÉPLOYÉ, et rien dans ce fichier ne le
#     remplace. C'est le premier point à ouvrir après ce lot.
#
#   · L'ALERTE SORTANTE DÉPEND D'UN CANAL QUI PEUT NE PAS EXISTER. Sans
#     `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, le service démarre, sauvegarde et
#     expédie normalement — et écrit au journal, en toutes lettres, que la
#     notification est INACTIVE. Il ne fait pas semblant d'alerter, mais dans cet
#     état la découverte d'une panne dépend à nouveau d'un humain qui regarde
#     `docker ps`. L'invariant 8 (« alerte automatique ») n'est alors tenu qu'à
#     moitié — la moitié visible.
#     Elle ne couvre pas non plus ce que Telegram ne délivre pas : un salon muet,
#     un bot supprimé, un destinataire qui a coupé les notifications. AUCUN
#     ACCUSÉ DE LECTURE N'EXISTE ICI — seul le `"ok":true` de l'API est vérifié,
#     et il prouve la remise à Telegram, pas la lecture par un humain.
#
#   · LA SONDE DE SANTÉ NE PROUVE PAS UNE RESTAURATION. Elle lit deux
#     horodatages écrits après vérification ; elle ne rejoue rien. Ses limites
#     complètes sont en tête de `sauvegarde-healthcheck.sh` — à lire avant de
#     s'y fier.
#
#   · R2 INJOIGNABLE TROIS NUITS DE SUITE. Ce qui se passe, précisément : chaque
#     passe se termine en code 2, Docker redémarre le service, et au démarrage
#     seule l'EXPÉDITION est rejouée tant que la sauvegarde locale a moins de
#     ${AXION_SAUVEGARDE_TOLERANCE_H} h (pas de `pgbackrest backup` inutile).
#     Le conteneur entre donc dans une boucle de redémarrage PEU COÛTEUSE, et
#     c'est cette boucle — visible dans `docker ps` — qui est le signal. Quand la
#     sauvegarde locale devient trop vieille, une passe complète repart : LES
#     SAUVEGARDES LOCALES CONTINUENT pendant la panne R2, à raison d'une par
#     tolérance. Ce qui manque pendant ces trois nuits n'est pas la sauvegarde,
#     c'est la COPIE HORS SERVEUR : perdre le VPS à ce moment-là, c'est tout
#     perdre depuis la dernière expédition réussie.
#
#   · JETON R2 RÉVOQUÉ (ou permissions réduites, ou bucket supprimé). Aucune
#     différence de comportement avec « R2 injoignable » : `mc` sort non nul, la
#     passe sort en 2, le service redémarre en boucle. LE SCRIPT NE SAIT PAS
#     DISTINGUER un réseau coupé d'un jeton mort — le message de `mc` est écrit
#     dans le journal et c'est tout ce dont dispose l'humain qui diagnostique.
#
#   · BUCKET QUI SE REMPLIT. R2 n'a pas de quota dur par défaut : le bucket ne se
#     « remplit » pas, IL SE FACTURE. Il n'y a AUCUN garde-fou de coût ici —
#     l'homologue local (`ARCHIVES_MAX_MO`) n'a pas d'équivalent distant, parce
#     qu'un plafond côté client se contourne en changeant une variable et ne
#     protège personne. La seule vraie protection est la RÉTENTION (ci-dessous)
#     et une alerte de facturation Cloudflare, qui n'est pas dans ce dépôt.
#
#   · RÉTENTION DISTANTE — ELLE N'EST PAS PORTÉE PAR R2, ELLE EST PORTÉE PAR CE
#     SCRIPT. Il n'y a AUCUNE règle de cycle de vie sur le bucket : les objets
#     anciens disparaissent parce que `mc mirror --remove` REPRODUIT à distance
#     les suppressions faites localement (expiration pgBackRest à 30 j,
#     rotation MinIO à 30 archives). Deux conséquences qu'il faut connaître :
#       (a) si ce script cesse de tourner, PLUS RIEN NE SUPPRIME côté R2 et le
#           stockage croît indéfiniment. Ordre de grandeur au 2026-08-28 : dépôt
#           pgBackRest 20 Mo + 30 archives MinIO. R2 facture ~0,015 $/Go/mois :
#           tant que MinIO est quasi vide c'est du bruit (< 0,01 $/mois), mais
#           30 copies COMPLÈTES d'un MinIO de 10 Go font 300 Go, soit ~4,5 $/mois
#           qui ne redescendront jamais seuls ;
#       (b) `--remove` est une lame à double tranchant : une perte du dépôt LOCAL
#           se propagerait au distant. C'est pourquoi l'expédition est GARDÉE par
#           `depot_local_sain()` — voir cette fonction, et ce qu'elle ne garde pas.
#     Une règle de cycle de vie Cloudflare aurait le défaut exact des tâches
#     planifiées de Coolify : elle vivrait hors de `git`, invisible à une
#     reconstruction, et personne ne verrait qu'elle a disparu.
#
#   · UN SEUL SITE DISTANT. La règle 3-2-1 du 02 §11.4 demande aussi une seconde
#     copie chez un autre fournisseur. Il n'y en a pas. R2 tombe ou ferme le
#     compte = il ne reste que le VPS.
#
#   · IL NE TESTE PAS LA RESTAURATION. Le test de restauration est un geste
#     distinct, joué à la main (infra/README.md §5.4-5.5) ; l'automatiser suppose
#     de trancher le nom de projet Compose sous Coolify (README §6.2). Ce script
#     vérifie que ce qu'il a envoyé SE RELIT à l'identique depuis R2 — ce n'est
#     pas la même chose que de prouver qu'une base s'en reconstruit.
#
# -----------------------------------------------------------------------------
# POURQUOI `bash` ET NON `sh` — CE N'EST PAS UN CONFORT
# -----------------------------------------------------------------------------
# `set -o pipefail` n'existe pas en POSIX. Sans lui, dans
# `tar … | zstd | gpg -o archive`, un `tar` qui échoue laisse `gpg` réussir : on
# obtient une archive PARFAITEMENT VALIDE d'un contenu TRONQUÉ, et le script sort
# en 0. C'est la panne la plus coûteuse qu'un script de sauvegarde puisse écrire.
# `stanza-create.sh` peut rester en `sh` (aucun tube) ; celui-ci ne peut pas.
# =============================================================================
set -euo pipefail

# Tout ce que ce script écrit — archives, empreintes, marqueur — n'appartient
# qu'à `postgres`. Les archives sont chiffrées, mais 02 §30.4-2 vaut aussi pour
# ce qui les entoure, et une archive en 644 dans un volume est une invitation
# gratuite. MESURÉ sans cette ligne : `gpg` produisait des fichiers en 0644.
umask 077

# -----------------------------------------------------------------------------
# Paramètres — tous portés par l'environnement, aucun secret ici (02 §30.4-1/5)
# -----------------------------------------------------------------------------
STANZA="${PGBACKREST_STANZA:-axion}"
ARCHIVES="${AXION_ARCHIVES:-/sauvegarde}"
MINIO_DONNEES="${AXION_MINIO_DONNEES:-/minio-donnees}"
# Le dépôt pgBackRest, tel que le voit CE conteneur. Même valeur que celle donnée
# à pgBackRest lui-même : c'est le répertoire que l'expédition recopie vers R2.
DEPOT="${PGBACKREST_REPO1_PATH:-/var/lib/pgbackrest}"

# Créneau quotidien, en UTC (invariant 5 : l'heure de la base et des ops est UTC).
HEURE="${AXION_SAUVEGARDE_HEURE:-02:30}"
# Jour de la sauvegarde COMPLÈTE, au format `date +%w` : 0 = dimanche.
# Les autres jours produisent une INCRÉMENTALE (02 §11.4 : « full hebdo /
# incrémental quotidien »).
JOUR_COMPLETE="${AXION_SAUVEGARDE_JOUR_COMPLETE:-0}"

# Rattrapage au démarrage : si la dernière passe réussie est plus vieille que
# cette tolérance — ou si elle n'existe pas — une passe part IMMÉDIATEMENT.
# 26 h = un jour plus deux heures de marge : un redéploiement en milieu de
# journée ne relance donc pas une sauvegarde déjà faite le matin même.
TOLERANCE_H="${AXION_SAUVEGARDE_TOLERANCE_H:-26}"

# RÉTENTION — DÉCIDÉE, PAS SUBIE.
# PostgreSQL : portée par pgBackRest lui-même (PGBACKREST_REPO1_RETENTION_FULL,
# type `time`), valeur ${BACKUP_RETENTION_DAYS} — 30 jours (02 §11.4).
# MinIO : le MÊME horizon, exprimé en NOMBRE d'archives puisqu'il y en a une par
# jour. L'alignement n'est pas cosmétique : une restauration PostgreSQL de J-25
# désignerait des pièces jointes qu'aucune archive MinIO ne contiendrait plus si
# MinIO était gardé moins longtemps. Deux rétentions différentes, c'est une
# restauration à moitié possible.
MINIO_ARCHIVES_GARDEES="${AXION_MINIO_ARCHIVES_GARDEES:-${BACKUP_RETENTION_DAYS:-30}}"

# GARDE-FOU DE DISQUE — la machine est PARTAGÉE (02 §11.3 : alerte disque > 80 %).
# Les archives MinIO sont des copies COMPLÈTES : leur empreinte croît linéairement
# avec la rétention. Plutôt que de remplir un disque qui héberge aussi autre
# chose, ce script REFUSE de continuer et le dit. Un refus bruyant vaut mieux
# qu'un disque plein silencieux.
ARCHIVES_MAX_MO="${AXION_ARCHIVES_MAX_MO:-20480}"   # plafond du répertoire d'archives
ARCHIVES_MARGE_MO="${AXION_ARCHIVES_MARGE_MO:-2048}" # espace libre exigé avant d'écrire

PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"

# -----------------------------------------------------------------------------
# EXPÉDITION HORS SERVEUR — Cloudflare R2, bucket dédié, jeton limité à ce bucket
#
# POURQUOI CES QUATRE NOMS. Ils sont posés dans Coolify et transmis au service par
# `infra/docker-compose.coolify.yml`. AUCUNE valeur n'apparaît ici, ni ailleurs
# dans le dépôt (02 §30.4-1/5) : le script ne les VÉRIFIE QUE PAR LEUR PRÉSENCE,
# et ne les journalise jamais — pas même tronquées, pas même dans un message
# d'erreur. Un secret à moitié écrit dans un journal est un secret écrit.
# -----------------------------------------------------------------------------
R2_BUCKET="${BACKUP_R2_BUCKET:-}"
R2_ENDPOINT="${BACKUP_R2_ENDPOINT:-}"
R2_ACCES="${BACKUP_R2_ACCESS_KEY:-}"
R2_SECRET="${BACKUP_R2_SECRET_KEY:-}"

# Préfixe d'objets DANS le bucket. Il sépare les environnements qui partageraient
# le même bucket : sans lui, un staging et une production expédiant côte à côte
# se mirroiteraient l'un l'autre — et `--remove` transformerait la collision en
# suppression. Une variable, pas une constante : le nom d'environnement n'est pas
# une propriété du code.
R2_PREFIXE="${AXION_R2_PREFIXE:-staging}"

# RELECTURE DE CONTRÔLE. « L'envoi a réussi » ne prouve rien : `mc` rend 0 dès
# que la requête a abouti, pas quand l'objet est relisible à l'identique. Chaque
# passe RETÉLÉCHARGE donc deux objets depuis R2 et compare leur SHA-256 à celui
# de la source — la dernière archive MinIO (le fichier qui porte les pièces
# jointes) et `backup.info` (le fichier sans lequel AUCUNE restauration ne
# démarre). Coût : l'egress R2 est facturé zéro, seul le temps se paie.
# `non` désactive la relecture ; c'est un réglage d'exploitation, pas un défaut.
R2_RELECTURE="${AXION_R2_VERIFIER_RELECTURE:-oui}"

# Nom de l'alias `mc`. Il n'est jamais lu depuis l'environnement : il ne désigne
# rien de configurable, seulement la clé de la variable `MC_HOST_<alias>` par
# laquelle les identifiants entrent dans `mc` SANS PASSER PAR LA LIGNE DE
# COMMANDE (voir `preparer_mc`).
R2_ALIAS='axionr2'

journal() { printf 'sauvegarde: %s\n' "$*"; }

# =============================================================================
# NOTIFICATION SORTANTE — LA MOITIÉ QUE `docker ps` NE PEUT PAS FAIRE
#
# -----------------------------------------------------------------------------
# POURQUOI ELLE EXISTE, ET POURQUOI ELLE EST ARRIVÉE EN DERNIER
# -----------------------------------------------------------------------------
# Ce fichier a longtemps porté, quelques dizaines de lignes plus haut, l'aveu
# suivant : « AUCUNE ALERTE SORTANTE. […] PERSONNE N'EST PRÉVENU. » La chaîne
# était complète — sauvegarde locale vérifiée, expédition vers R2, relecture
# comparée, restauration jouée — et il lui manquait la seule pièce qui décide de
# toutes les autres : quelqu'un qui apprend la panne sans avoir eu l'idée de
# regarder. L'invariant 8 demande littéralement une « alerte automatique » ; il
# était à moitié tenu pour cette seule raison.
#
# DEUX PIÈCES, PAS UNE. La sonde `sauvegarde-healthcheck.sh` rend la panne
# VISIBLE (docker ps, Coolify, toute supervision qui lit l'état Docker) sans
# dépendre de personne ni d'aucun secret. Ce bloc-ci la rend AUDIBLE, et il
# dépend, lui, d'un canal que Williams doit créer. Les deux sont indépendants :
# sans jeton Telegram, la sonde fonctionne quand même.
#
# -----------------------------------------------------------------------------
# POURQUOI `openssl s_client`, ALORS QUE CE MÊME FICHIER L'A ÉCARTÉ PLUS BAS
# -----------------------------------------------------------------------------
# L'encadré « POURQUOI `mc` » écarte explicitement `openssl s_client` comme
# client HTTP. LA CONTRADICTION EST APPARENTE, ET ELLE MÉRITE D'ÊTRE LEVÉE ICI
# PLUTÔT QUE DEVINÉE : ce qui était écarté, c'était `openssl s_client` PLUS UNE
# SIGNATURE SigV4 ÉCRITE À LA MAIN, pour téléverser des GIGAOCTETS vers S3, avec
# reprise, découpage en plusieurs parties au-delà de 5 Go et gestion d'erreurs
# HTTP. C'est un client S3 complet réécrit en shell — et une chaîne de
# sauvegarde ne se fonde pas là-dessus.
#
# Ici, le problème n'a rien à voir : UNE requête, ~300 octets, aucun protocole
# d'authentification à implémenter (le jeton est dans le chemin), aucun
# découpage, aucune reprise — et surtout, un échec de cet envoi N'EST PAS UN
# ÉCHEC DE SAUVEGARDE. Le pire cas de ce code est « le message n'est pas parti,
# et le journal le dit ». Le pire cas du client S3 écrit à la main aurait été
# « la copie hors serveur est corrompue et personne ne le sait ». Deux problèmes
# de tailles incomparables, deux réponses différentes.
#
# CE QUI A ÉTÉ RELEVÉ DANS L'IMAGE AVANT DE CHOISIR (2026-08-28, `docker exec`
# sur le service en vie, base postgres:16-bookworm) :
#     PRÉSENTS : openssl 3.0.20 · mc · gpg · zstd · tar · perl 5.36 · timeout
#     ABSENTS  : curl · wget · python3 · nc · socat · busybox
#     ca-certificates : présent depuis ce lot (3 697 lignes), sans quoi AUCUN
#                       client TLS ne fonctionnerait dans cette image.
# Les voies écartées, mesurées et non supposées :
#   · `curl`/`wget` : ABSENTS, et les ajouter est une escalade 11 §8-1 ;
#   · `perl` : présent, mais `perl-base` seul — `IO::Socket::SSL` est absent
#     (`Can't locate IO/Socket/SSL.pm in @INC`, relevé). Pas de TLS ;
#   · `/dev/tcp` de bash : pas de TLS. L'API Telegram est en HTTPS uniquement ;
#   · `mc` : c'est un client S3, pas un client HTTP générique. Il ne sait pas
#     POSTer un formulaire vers un hôte quelconque ;
#   · faire porter l'envoi par le service `worker` (qui a déjà TELEGRAM_* et un
#     runtime Node) : il faudrait joindre le worker — donc un client HTTP, donc
#     le problème initial — ou inventer une file de messages sur un volume
#     partagé. On échangerait une notification contre un couplage nouveau entre
#     la sauvegarde et le code applicatif, exactement ce que l'encadré « pourquoi
#     un side-car » refuse.
# `openssl s_client` reste, ET IL A ÉTÉ ÉPROUVÉ AVANT D'ÊTRE ÉCRIT :
#   · POST vers api.telegram.org avec un jeton FACTICE → `HTTP/1.1 401
#     Unauthorized`, `{"ok":false,…}`. Le transport fonctionne de bout en bout ;
#   · certificat expiré / auto-signé / mauvais nom d'hôte → poignée de main
#     INTERROMPUE, code 1, aucune réponse. Le corps de la requête — donc le
#     jeton — n'est JAMAIS écrit sur une socket dont le pair n'est pas vérifié.
#     C'est `-verify_return_error` + `-verify_hostname` qui l'obtiennent ; sans
#     eux, `s_client` se serait contenté de se plaindre dans son journal.
#
# -----------------------------------------------------------------------------
# CE QUE LE MESSAGE CONTIENT, ET CE QU'IL NE CONTIENDRA JAMAIS (11 §2, 02 §30.4-5)
# -----------------------------------------------------------------------------
# Il dit QUOI et DEPUIS QUAND : « la copie hors serveur n'est plus sortie depuis
# 51 h ». Il ne dit ni avec quelles clés, ni vers quel endpoint, ni dans quel
# bucket. Aucun secret, aucune donnée personnelle, aucun nom de client — il n'y
# en a pas ici, mais la règle vaut d'avance. Le seul élément d'identification
# est le PRÉFIXE D'ENVIRONNEMENT (`staging`, `prod`), qui est déjà le nom d'un
# répertoire d'objets et n'apprend rien à personne.
#
# LE JETON N'APPARAÎT SUR AUCUNE LIGNE DE COMMANDE. `/proc/<pid>/cmdline` est
# lisible par tous les utilisateurs de l'hôte — c'est déjà pourquoi le masquage
# de l'endpoint se fait en bash pur et non avec `sed`, plus bas. La requête est
# construite en mémoire par `printf` et poussée sur l'ENTRÉE STANDARD de
# `openssl` ; les arguments de `openssl` ne portent que `api.telegram.org`.
# La contrepartie honnête : le jeton reste dans l'ENVIRONNEMENT du processus,
# comme `BACKUP_ENCRYPTION_PASSPHRASE` et les identifiants R2. C'est lisible par
# root et par le même utilisateur, pas par les autres. On n'aggrave rien.
#
# LE TEXTE EST APLATI SUR UN ALPHABET SÛR avant d'entrer dans le corps de la
# requête. Ce n'est pas de la cosmétique : un retour chariot dans un message
# permettrait d'injecter des en-têtes HTTP, et un `&` ou un `=` de fabriquer un
# second paramètre. Tout ce qui sort de `[A-Za-z0-9 .,:;()_-]` devient un
# espace. Conséquence assumée : LES MESSAGES SONT SANS ACCENTS. Le journal
# `docker logs`, lui, les garde — c'est le même choix que les verdicts SQL de
# `healthcheck.sh`.
#
# -----------------------------------------------------------------------------
# DÉGRADATION — SANS SECRET, LE SERVICE DÉMARRE, FONCTIONNE, ET LE DIT
# -----------------------------------------------------------------------------
# `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` N'EXISTENT PAS ENCORE : le bot
# reste à créer (02 §11.3). Le service NE DOIT PAS échouer pour autant — une
# sauvegarde qui s'arrête faute de canal d'alerte est un remède pire que le mal.
# Il démarre donc, sauvegarde, expédie, et ÉCRIT AU JOURNAL, en toutes lettres,
# que la notification est inactive et pourquoi. Ce qu'il ne fait surtout pas :
# faire semblant d'alerter. Les deux variables sont déclarées `${VAR:-}` dans le
# compose (et non `${VAR:?}` comme les quatre variables R2) précisément pour ça.
#
# UNE CONFIGURATION À MOITIÉ POSÉE EST TRAITÉE COMME UNE ABSENCE, PAS COMME UNE
# PRÉSENCE : un jeton sans salon, ou un jeton dont la forme est absurde, rend la
# notification inactive avec un message qui NOMME LA VARIABLE fautive et
# n'affiche JAMAIS sa valeur. Un canal à moitié configuré qui échouerait
# silencieusement chaque nuit serait le garde-fou menteur que ce lot démonte
# depuis ce matin.
#
# -----------------------------------------------------------------------------
# ANTI-HARCÈLEMENT — LA RÈGLE, EN UNE PHRASE
# -----------------------------------------------------------------------------
# AU PLUS UN MESSAGE PAR CATÉGORIE ET PAR ${AXION_ALERTE_INTERVALLE_H} HEURES
# (24 par défaut), PLUS UN MESSAGE IMMÉDIAT SI LA GRAVITÉ CHANGE, PLUS UN
# MESSAGE UNIQUE DE RÉTABLISSEMENT.
# Concrètement, sur le scénario « R2 injoignable trois nuits » : le conteneur
# redémarre en boucle et retente l'expédition des dizaines de fois, mais il
# envoie TROIS messages — un par 24 h — puis un quatrième quand la copie repart.
# Sans cette règle, la même panne produirait un message par redémarrage, soit
# plusieurs centaines : un canal qui hurle est un canal qu'on coupe, et un canal
# coupé n'alerte plus personne. Le changement de catégorie (`expedition` →
# `sauvegarde`) passe outre le délai : une aggravation mérite d'être dite tout
# de suite.
#
# L'ÉTAT ANTI-HARCÈLEMENT VIT DANS `$ARCHIVES/.derniere-alerte`, donc sur le
# volume, donc il SURVIT AUX REDÉMARRAGES — c'est toute la question. Il est
# exclu du miroir R2 par le `--exclude '.derniere-*'` déjà en place : il décrit
# l'état de CETTE machine, il n'a rien à faire dans une copie de secours.
# S'IL NE PEUT PAS ÊTRE ÉCRIT (volume non monté, disque plein), LA NOTIFICATION
# EST DÉSACTIVÉE et le journal le dit. Choix assumé, et il faut en connaître le
# revers : cette panne-là ne produira aucun message. La raison est qu'une alerte
# sans mémoire est une alerte qui inonde, qu'un canal inondé est mis en sourdine
# par son destinataire, et qu'un canal en sourdine vaut strictement moins que
# pas de canal du tout. Cette panne-là reste visible par la sortie non nulle du
# service et par la boucle de redémarrage.
# =============================================================================
TELEGRAM_JETON="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_SALON="${TELEGRAM_CHAT_ID:-}"
# Constantes, jamais lues depuis l'environnement : ce ne sont pas des réglages.
TELEGRAM_HOTE='api.telegram.org'
MAGASIN_CA='/etc/ssl/certs/ca-certificates.crt'
# Délai minimal entre deux messages de MÊME catégorie. 24 h : la sauvegarde est
# un événement quotidien, une panne qui dure mérite un rappel par jour, pas un
# rappel par tentative.
ALERTE_INTERVALLE_H="${AXION_ALERTE_INTERVALLE_H:-24}"
ALERTE_MARQUEUR="$ARCHIVES/.derniere-alerte"
NOTIFICATION_ACTIVE='non'

# Le répertoire d'archives est créé ICI et non plus bas : le marqueur
# anti-harcèlement doit exister avant le PREMIER `echouer` possible, sinon une
# panne de démarrage enverrait un message à chaque redémarrage.
mkdir -p "$ARCHIVES" 2>/dev/null || true

evaluer_notification() {
  if [ -z "$TELEGRAM_JETON" ] && [ -z "$TELEGRAM_SALON" ]; then
    journal "NOTIFICATION SORTANTE INACTIVE — TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID ne sont pas posés. Le service sauvegarde et expédie normalement ; PERSONNE NE SERA PRÉVENU en cas d'échec. La panne reste visible par la sonde de santé (docker ps) et par la boucle de redémarrage. Invariant 8 (« alerte automatique ») à moitié tenu tant que ce canal n'existe pas."
    return 0
  fi
  if [ -z "$TELEGRAM_JETON" ] || [ -z "$TELEGRAM_SALON" ]; then
    journal 'NOTIFICATION SORTANTE INACTIVE — une seule des deux variables TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID est posée. Une configuration à moitié faite est traitée comme une absence : mieux vaut un canal déclaré mort qu un canal qui échoue en silence.'
    return 0
  fi
  # FORME DU JETON. Le jeton entre dans le CHEMIN de la requête HTTP : une
  # valeur contenant un retour chariot ou un espace permettrait d'y injecter une
  # requête. On la refuse sans jamais l'afficher — un message d'erreur qui cite
  # un secret est une fuite, même quand il veut aider.
  case "$TELEGRAM_JETON" in
    *[!A-Za-z0-9:_-]* | *:*:* | :* | *:)
      journal 'NOTIFICATION SORTANTE INACTIVE — TELEGRAM_BOT_TOKEN n a pas la forme d un jeton Telegram (<identifiant>:<secret>, caractères non réservés). Valeur volontairement non affichée.'
      return 0
      ;;
  esac
  case "$TELEGRAM_JETON" in
    *:*) : ;;
    *)
      journal 'NOTIFICATION SORTANTE INACTIVE — TELEGRAM_BOT_TOKEN ne contient pas le séparateur `:` attendu. Valeur volontairement non affichée.'
      return 0
      ;;
  esac
  # FORME DU SALON. Numérique (éventuellement négatif pour un groupe) ou
  # `@nom_de_canal`. Il entre dans le CORPS de la requête, mêmes conséquences.
  case "$TELEGRAM_SALON" in
    '-'[0-9]* | [0-9]*)
      case "${TELEGRAM_SALON#-}" in
        *[!0-9]*)
          journal 'NOTIFICATION SORTANTE INACTIVE — TELEGRAM_CHAT_ID n est ni un identifiant numérique ni un @canal. Valeur volontairement non affichée.'
          return 0
          ;;
      esac
      ;;
    '@'*)
      case "${TELEGRAM_SALON#@}" in
        '' | *[!A-Za-z0-9_]*)
          journal 'NOTIFICATION SORTANTE INACTIVE — TELEGRAM_CHAT_ID ressemble à un @canal mais contient un caractère inattendu. Valeur volontairement non affichée.'
          return 0
          ;;
      esac
      ;;
    *)
      journal 'NOTIFICATION SORTANTE INACTIVE — TELEGRAM_CHAT_ID n est ni un identifiant numérique ni un @canal. Valeur volontairement non affichée.'
      return 0
      ;;
  esac
  case "$ALERTE_INTERVALLE_H" in
    '' | *[!0-9]*)
      journal "NOTIFICATION SORTANTE INACTIVE — AXION_ALERTE_INTERVALLE_H='$ALERTE_INTERVALLE_H' n est pas un entier d heures : la règle anti-harcèlement serait inapplicable."
      return 0
      ;;
  esac
  # Le transport. Sans magasin de certificats, un client TLS ne peut pas vérifier
  # son pair — et on n'envoie pas un jeton à un pair non vérifié.
  command -v openssl >/dev/null 2>&1 || {
    journal 'NOTIFICATION SORTANTE INACTIVE — `openssl` est absent de cette image : aucun client TLS disponible.'
    return 0
  }
  [ -s "$MAGASIN_CA" ] || {
    journal "NOTIFICATION SORTANTE INACTIVE — magasin de certificats $MAGASIN_CA absent ou vide : le pair TLS ne pourrait pas être vérifié, le jeton ne sera pas envoyé."
    return 0
  }
  # La mémoire anti-harcèlement. Voir l'encadré : pas de mémoire, pas d'alerte.
  if [ ! -d "$ARCHIVES" ] || [ ! -w "$ARCHIVES" ]; then
    journal "NOTIFICATION SORTANTE INACTIVE — $ARCHIVES non inscriptible : l état anti-harcèlement ne peut pas survivre à un redémarrage, et un canal sans mémoire inonderait. Cette panne reste visible par la sortie non nulle du service."
    return 0
  fi
  NOTIFICATION_ACTIVE='oui'
  journal "notification sortante ACTIVE (Telegram, un message au plus par catégorie et par ${ALERTE_INTERVALLE_H} h, plus un message de rétablissement)."
}

# Aplatissement sur un alphabet sûr, EN BASH PUR — aucune valeur ne transite par
# une ligne de commande (`sed`, `tr`) que `/proc/<pid>/cmdline` exposerait.
# Tout ce qui n'est pas `[A-Za-z0-9 .,:;()_-]` devient un espace : plus de
# retour chariot (injection d'en-tête HTTP), plus de `&` ni de `=` (injection de
# paramètre), plus d'octet multi-octets à percent-encoder. Les espaces
# deviennent `+`, la forme attendue d'un `application/x-www-form-urlencoded`.
texte_sur() {
  local t="${1//[^A-Za-z0-9 .,:;()_-]/ }"
  printf '%s' "${t// /+}"
}

# Envoi. Rend 0 si et seulement si Telegram a répondu `"ok":true`.
# Ne journalise JAMAIS la réponse brute : elle contient l'écho de la requête sur
# certaines erreurs.
envoyer_telegram() {
  local texte="$1" corps reponse
  corps="chat_id=$(texte_sur "$TELEGRAM_SALON")&text=$(texte_sur "$texte")"
  # Le jeton n'est écrit QUE dans cette chaîne, en mémoire, poussée sur l'entrée
  # standard de `openssl`. Les arguments d'`openssl` ne portent que l'hôte.
  reponse="$(
    printf 'POST /bot%s/sendMessage HTTP/1.1\r\nHost: %s\r\nUser-Agent: axion-sauvegarde\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' \
      "$TELEGRAM_JETON" "$TELEGRAM_HOTE" "${#corps}" "$corps" \
      | timeout 20 openssl s_client -connect "${TELEGRAM_HOTE}:443" \
          -servername "$TELEGRAM_HOTE" -CAfile "$MAGASIN_CA" \
          -verify_return_error -verify 5 -verify_hostname "$TELEGRAM_HOTE" \
          -quiet -ign_eof 2>/dev/null
  )" || return 1
  case "$reponse" in
    *'"ok":true'*) return 0 ;;
    *) return 1 ;;
  esac
}

# Âge d'un marqueur en heures, ou `inconnu`. Sert à dire DEPUIS QUAND.
age_marqueur_h() {
  local fichier="$ARCHIVES/$1" valeur ecart
  [ -r "$fichier" ] || {
    printf 'inconnu'
    return 0
  }
  valeur="$(cat "$fichier" 2>/dev/null || true)"
  case "$valeur" in
    '' | *[!0-9]*)
      printf 'inconnu'
      return 0
      ;;
  esac
  ecart=$(($(date -u +%s) - valeur))
  [ "$ecart" -ge 0 ] || {
    printf 'inconnu (horloge reculee)'
    return 0
  }
  printf '%s h' $((ecart / 3600))
}

# Faut-il taire ce message ? Rend 0 pour « oui, on se tait ».
alerte_etouffee() {
  local categorie="$1" precedente ts age
  [ -r "$ALERTE_MARQUEUR" ] || return 1
  precedente=''
  ts=''
  read -r precedente ts <"$ALERTE_MARQUEUR" 2>/dev/null || true
  # Catégorie différente = aggravation ou changement de nature : on parle.
  [ "$precedente" = "$categorie" ] || return 1
  case "$ts" in
    '' | *[!0-9]*) return 1 ;;
  esac
  age=$(($(date -u +%s) - ts))
  # Un marqueur daté dans le futur (horloge reculée) ne doit pas étouffer
  # indéfiniment : on parle plutôt que de se taire pour une mauvaise raison.
  [ "$age" -ge 0 ] || return 1
  [ "$age" -lt $((ALERTE_INTERVALLE_H * 3600)) ]
}

# NOTIFIER NE FAIT JAMAIS ÉCHOUER SON APPELANT. Il est appelé depuis les deux
# fonctions de sortie en erreur : une alerte qui n'est pas partie ne doit ni
# masquer, ni aggraver, ni retarder l'échec d'origine.
notifier() {
  local categorie="$1" texte="$2"
  if [ "$NOTIFICATION_ACTIVE" != 'oui' ]; then
    journal "alerte NON transmise (notification inactive) — $texte"
    return 0
  fi
  if alerte_etouffee "$categorie"; then
    journal "alerte '$categorie' déjà transmise il y a moins de ${ALERTE_INTERVALLE_H} h — message étouffé (anti-harcèlement), l'échec reste dans ce journal."
    return 0
  fi
  if envoyer_telegram "$texte"; then
    printf '%s %s\n' "$categorie" "$(date -u +%s)" >"$ALERTE_MARQUEUR" 2>/dev/null || true
    journal "alerte '$categorie' transmise."
  else
    # Pas de marqueur écrit : un envoi raté n'a pas droit au silence des 24 h
    # suivantes. La prochaine passe réessaiera.
    journal "ÉCHEC DE L'ENVOI DE L'ALERTE '$categorie' (réseau, jeton, ou Telegram indisponible). Le message n'est PAS parti ; l'échec d'origine reste dans ce journal."
  fi
  return 0
}

# Rétablissement : UN message, et seulement si une alerte était en cours.
notifier_retablissement() {
  local precedente='' ts=''
  [ "$NOTIFICATION_ACTIVE" = 'oui' ] || return 0
  [ -r "$ALERTE_MARQUEUR" ] || return 0
  read -r precedente ts <"$ALERTE_MARQUEUR" 2>/dev/null || true
  if envoyer_telegram "Axion Audit ($R2_PREFIXE) RETABLI : la sauvegarde locale et la copie hors serveur sont a nouveau completes et verifiees. Alerte precedente : $precedente."; then
    journal 'rétablissement transmis.'
  else
    journal "ÉCHEC DE L'ENVOI DU MESSAGE DE RÉTABLISSEMENT — la sauvegarde, elle, est bien repartie."
  fi
  # Le marqueur est retiré DANS TOUS LES CAS : la panne est finie, et garder
  # l'état étoufferait la prochaine alerte de même catégorie.
  rm -f "$ALERTE_MARQUEUR"
}

# DEUX MODES D'ÉCHEC, DEUX CODES DE SORTIE — LA DISTINCTION EST LE POINT.
#   1 = LA SAUVEGARDE N'A PAS ÉTÉ FAITE. Il n'y a rien de neuf à restaurer.
#   2 = LA SAUVEGARDE EST FAITE ET VÉRIFIÉE EN LOCAL, MAIS ELLE N'EST PAS SORTIE
#       DE LA MACHINE. On est protégé de la perte logique, pas de la perte du
#       serveur. C'est moins grave que 1 et ce n'est PAS un succès : confondre
#       les deux, c'est reconstruire le garde-fou menteur que ce service a été
#       écrit pour démonter.
# Les deux font sortir le service en code non nul, donc redémarrer Docker.
#
# CHACUNE ALERTE AVANT DE SORTIR, dans SA catégorie — c'est la même distinction
# de gravité, portée jusqu'au destinataire. Le message dit QUOI et DEPUIS QUAND ;
# le détail technique (message de `mc`, de `pgbackrest`, de `gpg`) reste dans le
# journal, où il ne risque pas de publier un endpoint dans un salon.
echouer() {
  printf 'sauvegarde: ECHEC SAUVEGARDE — %s\n' "$*" >&2
  notifier sauvegarde "Axion Audit ($R2_PREFIXE) ECHEC SAUVEGARDE : la passe locale n a pas abouti. Derniere sauvegarde locale reussie : $(age_marqueur_h .derniere-passe). Il n y a rien de neuf a restaurer depuis. Detail dans docker logs." || true
  exit 1
}
echouer_expedition() {
  printf 'sauvegarde: ECHEC EXPEDITION — %s\n' "$*" >&2
  printf "sauvegarde: la sauvegarde LOCALE de cette passe est faite et vérifiée ; elle N'A PAS QUITTÉ LA MACHINE.\n" >&2
  printf "sauvegarde: tant que ce message revient, la règle 3-2-1 (02 §11.4) est rompue : la perte du VPS emporterait tout.\n" >&2
  # LES IDENTIFIANTS R2 SORTENT DE L'ENVIRONNEMENT AVANT D'APPELER `openssl`.
  # `nettoyer_mc` dit d'elle-même que « les fonctions appelées ensuite n'ont
  # aucune raison de porter les identifiants R2 » ; l'envoi de l'alerte est
  # justement une fonction appelée ensuite, et elle lance un processus tiers qui
  # hériterait de l'environnement. Aucune fuite connue par ce chemin —
  # `/proc/<pid>/environ` n'est lisible que par le même utilisateur et par root,
  # comme pour le processus parent — mais on ne relâche pas une propriété qu'on
  # s'est donné la peine d'écrire. Appel idempotent : le `trap` EXIT le refera.
  nettoyer_mc
  notifier expedition "Axion Audit ($R2_PREFIXE) ECHEC COPIE HORS SERVEUR : la sauvegarde locale est faite et verifiee, elle n est PAS sortie de la machine. Derniere copie hors serveur reussie : $(age_marqueur_h .derniere-expedition). Regle 3-2-1 rompue : perdre le serveur maintenant, c est tout perdre depuis cette date. Detail dans docker logs." || true
  exit 2
}

# ÉTAT DU CANAL D'ALERTE — décidé ICI, avant le premier `echouer` possible, pour
# qu'une panne de démarrage puisse elle aussi être annoncée. Cette fonction
# n'échoue jamais : elle rend le canal actif, ou elle explique au journal
# pourquoi il ne l'est pas.
evaluer_notification

# -----------------------------------------------------------------------------
# Contrôles d'entrée — un paramètre absurde doit se voir au DÉMARRAGE, pas à
# 02h30 du matin dans un journal que personne ne lit.
# -----------------------------------------------------------------------------
[ -n "$PASSPHRASE" ] || echouer 'BACKUP_ENCRYPTION_PASSPHRASE est vide : les archives MinIO seraient en clair.'
# ⚠️ `[0-2][0-9]` ACCEPTAIT 20:00 À 29:59, ET LA CONSÉQUENCE ÉTAIT UNE MACHINE
# QUI BRÛLE. Mesuré le 2026-08-28 avec `AXION_SAUVEGARDE_HEURE=25:00` :
#     sauvegarde: === passe terminée avec succès (locale ET hors serveur) ===
#     date: invalid date 'today 25:00'
#     axion-sauvegarde: line …: [: : integer expression expected
#     sauvegarde: prochaine passe dans -1787918488 s (créneau 25:00 UTC).
#     sleep: invalid option  →  code 1  →  set -e  →  le service meurt
# Docker redémarre alors le service, qui REJOUE UNE PASSE COMPLÈTE (tar + zstd +
# gpg de tout le volume MinIO) À CHAQUE REDÉMARRAGE, indéfiniment, sur une
# machine PARTAGÉE avec la production d'un tiers. Un contrôle d'entrée dont le
# motif est trop large ne protège de rien : il déplace la panne à 02h30 et la
# déguise en message anglais qui ne nomme même pas la variable fautive.
# Les deux motifs ci-dessous couvrent EXACTEMENT 00:00–23:59, et rien d'autre.
case "$HEURE" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) : ;;
  *) echouer "AXION_SAUVEGARDE_HEURE='$HEURE' — format attendu HH:MM en UTC, heure de 00 à 23 et minutes de 00 à 59." ;;
esac
# Les autres entiers d'exploitation. `AXION_ALERTE_INTERVALLE_H` est déjà
# contrôlé par `evaluer_notification` ; ceux-ci ne l'étaient PAS, et une valeur
# absurde s'y serait vue là où on ne regarde pas — au milieu d'une passe.
for _couple in \
  "AXION_SAUVEGARDE_TOLERANCE_H=$TOLERANCE_H" \
  "AXION_MINIO_ARCHIVES_GARDEES=$MINIO_ARCHIVES_GARDEES" \
  "AXION_ARCHIVES_MAX_MO=$ARCHIVES_MAX_MO" \
  "AXION_ARCHIVES_MARGE_MO=$ARCHIVES_MARGE_MO"; do
  _nom="${_couple%%=*}"
  _valeur="${_couple#*=}"
  case "$_valeur" in
    '' | *[!0-9]*) echouer "$_nom='$_valeur' — attendu un entier positif ou nul." ;;
  esac
done
[ "$MINIO_ARCHIVES_GARDEES" -ge 1 ] || echouer \
  "AXION_MINIO_ARCHIVES_GARDEES='$MINIO_ARCHIVES_GARDEES' — au moins une archive doit être gardée, sinon la rotation efface ce que la passe vient d'écrire."
case "$JOUR_COMPLETE" in
  [0-6]) : ;;
  *) echouer "AXION_SAUVEGARDE_JOUR_COMPLETE='$JOUR_COMPLETE' — attendu 0..6 (0 = dimanche)." ;;
esac
[ -d "$MINIO_DONNEES" ] || echouer "$MINIO_DONNEES absent : le volume de données MinIO n'est pas monté."
[ -d "$DEPOT" ] || echouer "$DEPOT absent : le dépôt pgBackRest n'est pas monté."
mkdir -p "$ARCHIVES"

# -----------------------------------------------------------------------------
# Contrôles de l'expédition — au DÉMARRAGE, jamais à 02h30.
# Les quatre variables sont contrôlées PAR LEUR PRÉSENCE et par la FORME de ce
# qu'elles contiennent. Aucune valeur n'est affichée : un message d'erreur qui
# cite un identifiant est une fuite, même quand il veut aider.
# -----------------------------------------------------------------------------
[ -n "$R2_BUCKET" ] || echouer 'BACKUP_R2_BUCKET est vide : aucune copie hors serveur ne peut partir.'
[ -n "$R2_ENDPOINT" ] || echouer 'BACKUP_R2_ENDPOINT est vide : aucune copie hors serveur ne peut partir.'
[ -n "$R2_ACCES" ] || echouer 'BACKUP_R2_ACCESS_KEY est vide : aucune copie hors serveur ne peut partir.'
[ -n "$R2_SECRET" ] || echouer 'BACKUP_R2_SECRET_KEY est vide : aucune copie hors serveur ne peut partir.'

# L'endpoint est fourni indifféremment avec ou sans schéma (`https://compte.
# r2.cloudflarestorage.com` ou `compte.r2.cloudflarestorage.com`) : on n'impose
# pas une forme à celui qui pose la variable, on la normalise ici. Le schéma est
# ensuite TOUJOURS `https` — jamais d'identifiants sur un transport en clair.
R2_HOTE="${R2_ENDPOINT#https://}"
R2_HOTE="${R2_HOTE#http://}"
R2_HOTE="${R2_HOTE%/}"
case "$R2_HOTE" in
  *[!A-Za-z0-9.:-]* | '' | *' '*)
    echouer "BACKUP_R2_ENDPOINT ne ressemble pas à un hôte (attendu: compte.r2.cloudflarestorage.com, schéma facultatif)." ;;
esac
case "$R2_BUCKET" in
  *[!a-z0-9.-]* | '') echouer 'BACKUP_R2_BUCKET ne ressemble pas à un nom de bucket S3 (minuscules, chiffres, `.` et `-`).' ;;
esac
case "$R2_PREFIXE" in
  *[!A-Za-z0-9._-]* | '') echouer "AXION_R2_PREFIXE='$R2_PREFIXE' — attendu un segment simple (lettres, chiffres, . _ -), sans /." ;;
esac
# LES IDENTIFIANTS ENTRENT DANS `mc` PAR UNE URL (`MC_HOST_<alias>`). Un
# caractère réservé d'URL (`@`, `:`, `/`, `%`…) y serait mal découpé et
# produirait une authentification qui échoue POUR UNE RAISON QUI N'A RIEN À VOIR,
# à 02h30, sans indice. Un jeton R2 est hexadécimal ; on refuse tout ce qui
# sortirait du jeu « non réservé » de la RFC 3986, en le disant SANS citer la
# valeur.
case "$R2_ACCES" in
  *[!A-Za-z0-9._~-]*) echouer 'BACKUP_R2_ACCESS_KEY contient un caractère réservé d URL ; jeton R2 attendu (hexadécimal). Valeur volontairement non affichée.' ;;
esac
case "$R2_SECRET" in
  *[!A-Za-z0-9._~-]*) echouer 'BACKUP_R2_SECRET_KEY contient un caractère réservé d URL ; jeton R2 attendu (hexadécimal). Valeur volontairement non affichée.' ;;
esac
case "$R2_RELECTURE" in
  oui | non) : ;;
  *) echouer "AXION_R2_VERIFIER_RELECTURE='$R2_RELECTURE' — attendu 'oui' ou 'non'." ;;
esac
# `mc` est copié dans l'image depuis `minio/mc`, au tag DÉJÀ épinglé par le
# compose (infra/postgres/Dockerfile). S'il manque, l'image a été reconstruite
# depuis une étape qui ne le porte pas : il faut le savoir au démarrage.
command -v mc >/dev/null 2>&1 || echouer 'le client mc est absent de cette image : aucune expédition hors serveur possible.'

# -----------------------------------------------------------------------------
# MinIO — archive chiffrée du volume de données
#
# POURQUOI LE VOLUME ET NON `mc mirror`. Les deux voies ont été JOUÉES sur des
# instances jetables le 2026-08-28 (README §5.5) ; les deux restaurent les objets
# à l'octet près. Celle-ci a été retenue pour trois raisons mesurées :
#   · elle restitue AUSSI `.minio.sys` — politiques d'accès, versioning, comptes.
#     La restauration par `mc mirror` a rendu des buckets qu'il fallait recréer
#     et re-verrouiller à la main (`mc anonymous set none`), et elle avait PERDU
#     l'état de versioning. Une sauvegarde qui oblige à se souvenir d'un réglage
#     de sécurité est une sauvegarde qui le perdra ;
#   · elle tient dans UN conteneur : l'image `minio/mc` n'a ni `tar`, ni `gzip`,
#     ni `gpg`, ni `openssl` (mesuré). Passer par elle imposait un répertoire
#     intermédiaire EN CLAIR, sur le même disque, contenant des pièces jointes
#     d'audit. Ici, rien n'est jamais écrit en clair hors du volume MinIO ;
#   · elle ne demande aucun identifiant MinIO : le volume suffit, l'API n'est pas
#     appelée. Un compte de moins à porter, à faire tourner et à fuir.
#
# CE QU'ELLE COÛTE, ET IL FAUT LE SAVOIR : la copie est « cohérente au crash »,
# pas transactionnelle. Un objet en cours d'écriture peut être capturé à moitié ;
# MinIO le traite au démarrage comme après une coupure de courant. `mc mirror`
# n'offrait pas mieux : lui aussi lit une cible qui bouge.
# -----------------------------------------------------------------------------
archiver_minio() {
  local horodatage cible partiel empreinte_source empreinte_relue travail
  horodatage="$(date -u +%Y%m%dT%H%M%SZ)"
  cible="$ARCHIVES/minio-$horodatage.tar.zst.gpg"
  partiel="$cible.partiel"

  # ⚠️ LE PLAFOND SE CONTRÔLE AVANT D'ÉCRIRE, PAS APRÈS — CORRIGÉ LE 2026-08-28.
  # Il était vérifié en fin de `faire_tourner_minio`, donc APRÈS que l'archive et
  # son `.sha256` aient été écrits. Mesuré avec `AXION_ARCHIVES_MAX_MO=0` : code
  # de sortie 1, ET L'ARCHIVE EST LÀ. Le garde-fou ne protégeait donc jamais le
  # disque : il consommait, puis refusait. Pire, comme aucun marqueur n'est écrit
  # sur ce chemin, Docker redémarrait le service, qui RÉÉCRIVAIT une archive
  # complète avant de rééchouer — le contraire exact de l'intention affichée
  # (« un refus bruyant vaut mieux qu'un disque plein silencieux »).
  # La marge disque, elle, était déjà contrôlée AU BON ENDROIT : c'est son modèle
  # qui est recopié ici, deux lignes plus haut qu'elle.
  local occupe_mo
  occupe_mo="$(du -sm "$ARCHIVES" | cut -f1)"
  [ "$occupe_mo" -lt "$ARCHIVES_MAX_MO" ] || echouer \
    "le répertoire d'archives pèse déjà ${occupe_mo} Mo, au-delà du plafond ${ARCHIVES_MAX_MO} Mo. Aucune archive écrite.
        Ce n'est PAS un incident technique : c'est la rétention qui n'est plus
        soutenable sur ce disque. À trancher (Williams) : baisser
        AXION_MINIO_ARCHIVES_GARDEES, augmenter AXION_ARCHIVES_MAX_MO, ou —
        la seule vraie réponse — sortir les archives du serveur (02 §11.4)."

  # Espace libre AVANT d'écrire : un `gpg` interrompu par un disque plein laisse
  # un fichier partiel, et un disque plein sur une machine partagée est un
  # incident pour le voisin autant que pour nous.
  local libre_mo
  libre_mo="$(df -Pm "$ARCHIVES" | awk 'NR==2 {print $4}')"
  [ "$libre_mo" -ge "$ARCHIVES_MARGE_MO" ] || echouer \
    "espace libre sur $ARCHIVES : ${libre_mo} Mo < marge exigée ${ARCHIVES_MARGE_MO} Mo. Aucune archive écrite."

  travail="$(mktemp -d)"
  # shellcheck disable=SC2064  # $travail doit être développé MAINTENANT, pas au piège
  trap "rm -rf '$travail'" EXIT
  ( umask 077; printf %s "$PASSPHRASE" > "$travail/pp" )

  journal "MinIO : archive chiffrée de $MINIO_DONNEES → $(basename "$cible")"

  # L'empreinte est prise SUR LE FLUX LU, au vol : refaire un `tar` de la source
  # pour comparer ne prouverait rien (les horodatages d'un volume vivant bougent).
  tar -C "$MINIO_DONNEES" -cf - . \
    | tee >(sha256sum | cut -d' ' -f1 > "$travail/source") \
    | zstd -3 -q \
    | gpg --batch --quiet --symmetric --cipher-algo AES256 \
          --passphrase-file "$travail/pp" --pinentry-mode loopback \
          -o "$partiel"

  # VÉRIFICATION DE BOUT EN BOUT — ce qui distingue une archive d'un fichier.
  # On redéchiffre, on redécompresse, et on compare l'empreinte du flux obtenu à
  # celle du flux lu. Une archive qui ne se relit pas n'est pas une sauvegarde ;
  # le seul moment où l'on peut s'en apercevoir sans dommage est maintenant.
  empreinte_source="$(cat "$travail/source")"
  empreinte_relue="$(gpg --batch --quiet --decrypt --passphrase-file "$travail/pp" \
                        --pinentry-mode loopback "$partiel" \
                      | zstd -d -q | sha256sum | cut -d' ' -f1)"
  if [ "$empreinte_source" != "$empreinte_relue" ]; then
    rm -f "$partiel"
    echouer "l'archive MinIO ne se relit pas à l'identique (source $empreinte_source, relue $empreinte_relue)."
  fi

  # Publication ATOMIQUE : tant que la vérification n'a pas réussi, le fichier
  # porte `.partiel` et aucune rotation ne peut le confondre avec une archive.
  mv "$partiel" "$cible"
  # Empreinte du CHIFFRÉ, en chemin RELATIF : un `sha256sum -c` doit pouvoir se
  # rejouer depuis le répertoire d'archives, où qu'il ait été recopié.
  ( cd "$ARCHIVES" && sha256sum "$(basename "$cible")" > "$(basename "$cible").sha256" )
  journal "MinIO : archive vérifiée ($(du -h "$cible" | cut -f1)), empreinte du contenu ${empreinte_source:0:16}…"

  rm -rf "$travail"
  trap - EXIT
}

# -----------------------------------------------------------------------------
# Rotation des archives MinIO — par NOMBRE, jamais par date de fichier.
# Une règle « plus vieux que N jours » se fie à un horodatage de système de
# fichiers, qu'une copie, une restauration ou un `touch` déplacent. Le rang, lui,
# ne ment pas : on garde les N plus récentes, point.
# -----------------------------------------------------------------------------
faire_tourner_minio() {
  local total garde=0
  # Les noms sont produits par ce script seul : `minio-<horodatage>.tar.zst.gpg`.
  # Aucun espace, aucun caractère exotique — le tri de `ls` est donc sûr ici, et
  # l'horodatage est trié lexicographiquement comme chronologiquement.
  local f
  for f in $(ls -1 "$ARCHIVES" 2>/dev/null | grep -E '^minio-[0-9]{8}T[0-9]{6}Z\.tar\.zst\.gpg$' | sort -r); do
    garde=$((garde + 1))
    if [ "$garde" -gt "$MINIO_ARCHIVES_GARDEES" ]; then
      journal "rotation : suppression de $f (au-delà des $MINIO_ARCHIVES_GARDEES gardées)"
      rm -f "$ARCHIVES/$f" "$ARCHIVES/$f.sha256"
    fi
  done
  # Les `.partiel` d'une passe interrompue ne sont pas des archives : ils ne
  # doivent ni compter dans la rétention, ni s'accumuler.
  find "$ARCHIVES" -maxdepth 1 -name '*.partiel' -mmin +120 -delete

  total="$(du -sm "$ARCHIVES" | cut -f1)"
  journal "archives MinIO : $((garde < MINIO_ARCHIVES_GARDEES ? garde : MINIO_ARCHIVES_GARDEES)) fichier(s), ${total} Mo au total"
  # ICI, LE PLAFOND N'EST PLUS UN ÉCHEC : IL EST UN AVERTISSEMENT, ET C'EST LE
  # CŒUR DU CORRECTIF. La passe qui vient d'avoir lieu est faite et vérifiée ;
  # la faire échouer à ce stade ferait perdre un marqueur de sauvegarde
  # PARFAITEMENT VALIDE et déclencherait un redémarrage qui réécrirait une
  # archive complète. Le refus, lui, est en tête d'`archiver_minio` : la
  # PROCHAINE passe ne consommera rien tant que le plafond est dépassé. On ne
  # peut pas connaître la taille d'une archive avant de l'écrire ; on peut, en
  # revanche, refuser d'en écrire une de plus quand la place manque déjà.
  if [ "$total" -ge "$ARCHIVES_MAX_MO" ]; then
    journal "ATTENTION — le répertoire d'archives pèse ${total} Mo, au niveau ou au-delà du plafond ${ARCHIVES_MAX_MO} Mo.
        Cette passe est terminée et vérifiée ; la PROCHAINE sera REFUSÉE avant
        d'écrire quoi que ce soit. Ce n'est PAS un incident technique : c'est la
        rétention qui n'est plus soutenable sur ce disque. À trancher (Williams) :
        baisser AXION_MINIO_ARCHIVES_GARDEES, augmenter AXION_ARCHIVES_MAX_MO,
        ou — la seule vraie réponse — sortir les archives du serveur (02 §11.4)."
  fi
}

# =============================================================================
# EXPÉDITION HORS SERVEUR — LE POINT D'INSERTION ANNONCÉ (README §5.6)
#
# -----------------------------------------------------------------------------
# POURQUOI `mc`, ET PAS AUTRE CHOSE — LE CHOIX EST MESURÉ, PAS SUBI
# -----------------------------------------------------------------------------
# Contrainte de départ : 11 §1 fige les dépendances. Ajouter un outil est une
# ESCALADE `DECISIONS.md`, pas une décision d'agent. Ce qui a été RELEVÉ dans
# l'image avant de choisir (2026-08-28, `docker exec` sur le service en vie) :
#
#   base réelle : postgres:16-BOOKWORM — Debian 12, PAS une Alpine
#   présents    : openssl 3.0.20 · gpg · zstd · tar · sha256sum · awk · pgbackrest 2.59.1
#   ABSENTS     : curl · wget · python/python3 · jq · rclone · aws · s3cmd · mc
#
# L'IMAGE N'A AUCUN CLIENT HTTP. C'est le fait qui décide, et il élimine trois
# voies d'un coup :
#   · `openssl s_client` en guise de client HTTP, avec une signature SigV4 écrite
#     à la main en shell : faisable, et c'est exactement le genre de code qui
#     marche à la démo et casse à 3 h du matin — pas de reprise, pas de
#     téléversement en plusieurs parties au-delà de 5 Go, une gestion d'erreur
#     HTTP à réécrire. Une chaîne de sauvegarde ne se fonde pas là-dessus ;
#   · `pgbackrest` comme téléverseur générique : ÉCARTÉ SUR MESURE. La 2.59.1
#     expose `repo-get` et `repo-ls` — mais NI `repo-put` NI `repo-rm`
#     (`pgbackrest help`, relevé sur le serveur). Il sait LIRE un dépôt distant,
#     pas y écrire un fichier quelconque ;
#   · `repo2` pgBackRest natif vers S3, la voie (c) de l'escalade du README :
#     ÉCARTÉE AUSSI, et c'est la seule des trois qui méritait un examen. Un
#     `backup --repo=2` exige que les WAL de la sauvegarde soient archivés DANS
#     CE dépôt-là ; or `archive_command` (côté serveur) ne pousse que vers repo1.
#     Pour que repo2 fonctionne, il faudrait donner R2 à `archive_command` du
#     SERVEUR — et alors une panne R2 ferait échouer l'archivage WAL, donc
#     gonfler `pg_wal`, donc remplir le disque D'UNE MACHINE PARTAGÉE avec la
#     production d'un tiers. On aurait échangé « pas de copie distante » contre
#     « le voisin tombe quand Cloudflare tousse ». Non.
#   · `aws-cli` installé au vol dans un conteneur jetable, comme le fait le
#     voisin : ÉCARTÉ. Cela suppose (a) un accès Docker depuis ce service, donc
#     le socket Docker, donc une élévation de privilège franche ; (b) une
#     installation par le réseau AU MOMENT DE LA SAUVEGARDE — une chaîne de
#     sauvegarde qui dépend de la disponibilité d'un dépôt de paquets à 02h30 est
#     une chaîne de sauvegarde qui tombera un jour pour cette raison-là ; (c) une
#     version non épinglée, donc une dépendance qui change sans qu'on le sache.
#
# CE QUI EST RETENU : `mc`, le client MinIO, COPIÉ À LA CONSTRUCTION depuis
# l'image `minio/mc:RELEASE.2025-04-16T18-13-26Z` — celle que le service
# `createbuckets` de CE MÊME compose utilise déjà. Donc :
#   · AUCUNE dépendance nouvelle : ni un outil de plus dans 11 §1, ni un tag de
#     plus à suivre. C'est le binaire que la pile embarque déjà, au même tag ;
#   · aucune installation à l'exécution : un binaire Go statique de 30 Mo, copié
#     au build, qui ne demande rien au réseau pour exister ;
#   · il parle S3 (R2 est compatible S3), il fait le téléversement en plusieurs
#     parties, il reprend, il compare, il sait lister et supprimer — tout ce que
#     la rétention distante réclame ;
#   · ses identifiants entrent par `MC_HOST_<alias>`, donc JAMAIS par la ligne de
#     commande. `mc alias set` aurait écrit la clé dans `/proc/<pid>/cmdline`,
#     lisible par tout le monde sur l'hôte. Une variable d'environnement de
#     processus n'est lisible que par le même utilisateur et par root — c'est
#     déjà l'exposition de `BACKUP_ENCRYPTION_PASSPHRASE`, on ne l'aggrave pas.
#
# CE QUE ÇA COÛTE, ET IL FAUT LE SAVOIR : l'image PostgreSQL de la pile Coolify
# grossit de ~30 Mo, et une reconstruction dépend désormais de la disponibilité
# de `minio/mc` au tag épinglé. C'est le prix d'un binaire qu'on ne télécharge
# pas à 02h30.
#
# -----------------------------------------------------------------------------
# CE QUI PART, ET POURQUOI RIEN DE CLAIR NE PART
# -----------------------------------------------------------------------------
# Deux répertoires, TELS QUELS, sans transformation :
#   · le DÉPÔT pgBackRest ($DEPOT) — chaque fichier y est chiffré par pgBackRest
#     lui-même (`repo1-cipher-type=aes-256-cbc`). VÉRIFIÉ, pas supposé : les 1535
#     fichiers du dépôt commencent tous par le magique `Salted__` d'OpenSSL, y
#     compris `backup.info`, `archive.info` et les manifestes ; un `grep -r`
#     binaire sur `axion_audit`, `postgres` et `BEGIN` à travers tout le dépôt ne
#     rend AUCUN fichier ;
#   · les ARCHIVES MinIO ($ARCHIVES) — `*.tar.zst.gpg`, chiffrées GPG AES256 par
#     `archiver_minio` ci-dessus, accompagnées de leur `.sha256` (l'empreinte du
#     CHIFFRÉ : un condensat, pas une donnée).
#
# ON NE RECHIFFRE RIEN. Rechiffrer ce qui l'est aurait trois défauts : du CPU
# pour rien, une seconde passphrase à faire tourner et à perdre, et surtout la
# fin de la propriété qui rend la preuve possible — L'OBJET DANS R2 EST L'OCTET
# POUR OCTET DE L'ARTEFACT LOCAL, donc son SHA-256 est comparable directement.
# Ce qui reste en clair et part quand même, dit franchement : les NOMS d'objets
# (`.../pgbackrest/backup/axion/20260828-072358F/…`) révèlent la date et le type
# des sauvegardes, et leur TAILLE. Aucun nom de client (invariant 2), aucune
# donnée personnelle (11 §2) — mais un observateur du bucket saurait quand nous
# sauvegardons et combien nous pesons.
# =============================================================================

# `mc` a besoin d'un répertoire de configuration. On lui en donne un JETABLE
# plutôt que `~/.mc` : le HOME de `postgres` est voisin d'un volume monté en
# lecture seule, et un état persistant de `mc` serait une seconde source de
# vérité pour les identifiants — celle qui survit à un changement de jeton.
MC_TRAVAIL=''

preparer_mc() {
  MC_TRAVAIL="$(mktemp -d)"
  chmod 700 "$MC_TRAVAIL"
  # Les identifiants entrent ICI, et uniquement ici. Le nom de la variable est
  # construit depuis l'alias ; sa VALEUR n'est jamais journalisée ni renvoyée.
  export "MC_HOST_${R2_ALIAS}=https://${R2_ACCES}:${R2_SECRET}@${R2_HOTE}"
}

nettoyer_mc() {
  # L'environnement du processus est nettoyé aussi : les fonctions appelées
  # ensuite (rien aujourd'hui, mais c'est une propriété qu'on veut garder) n'ont
  # aucune raison de porter les identifiants R2.
  unset "MC_HOST_${R2_ALIAS}" || true
  # `if` et non `[ … ] && …` : sous `set -e`, une liste `&&` dont le test est
  # faux fait sortir la fonction en code non nul — et ce nettoyage est appelé sur
  # le chemin NORMAL autant que depuis un `trap`. Le même piège qu'en bas de
  # `secondes_avant_creneau`, écrit deux fois pour qu'il ne revienne pas.
  if [ -n "${MC_TRAVAIL:-}" ]; then
    rm -rf "$MC_TRAVAIL"
  fi
  MC_TRAVAIL=''
}

# Enveloppe unique : tout appel à `mc` passe par ici, avec les mêmes drapeaux.
# `--config-dir` isole l'état, `--no-color` garde les journaux lisibles dans
# `docker logs`, `--quiet` évite les barres de progression qui remplissent un
# journal tourné par taille (10 Mo × 5 dans ce compose).
#
# LE FILTRE SUR `stderr` N'EST PAS DE LA COSMÉTIQUE — MESURÉ LE 2026-08-28.
# `mc` écrit l'URL complète dans ses messages d'erreur. Sur une panne DNS il
# journalise :
#     mc: <ERROR> Unable to list folder. Get "https://<endpoint>/<bucket>/…"
# c'est-à-dire l'identifiant de compte Cloudflare, dans `docker logs`, qui est lu,
# copié et collé. C'est exactement ce que 02 §30.4-5 interdit. On garde le message
# de `mc` — il est le SEUL indice de diagnostic dont l'humain dispose — mais on en
# retire l'endpoint.
#
# LE MASQUAGE SE FAIT EN BASH PUR, PAS AVEC `sed`. Un `sed "s#$R2_HOTE#…#"` aurait
# écrit la valeur à protéger dans `/proc/<pid>/cmdline` du processus `sed`, qui est
# lisible par TOUS les utilisateurs de l'hôte : on aurait fermé une fuite en en
# ouvrant une pire. La substitution `${l//motif/remplacement}` reste dans la
# mémoire de bash.
mcx() {
  mc --config-dir "$MC_TRAVAIL" --no-color --quiet "$@" 2> >(
    while IFS= read -r ligne; do
      printf '%s\n' "${ligne//$R2_HOTE/<endpoint masqué>}" >&2
    done
  )
}

# -----------------------------------------------------------------------------
# GARDE-FOU DU `--remove` — CE QUI EMPÊCHE UNE PANNE LOCALE DE DEVENIR UNE
# SUPPRESSION DISTANTE.
#
# `mc mirror --remove` reproduit à distance les suppressions faites localement.
# C'est ce qui aligne la rétention des deux côtés sans règle de cycle de vie chez
# Cloudflare (invisible à `git`) — et c'est aussi ce qui, si le dépôt local
# disparaissait, effacerait la copie distante juste après. On ne propage donc les
# suppressions QUE si le local a l'air sain :
#   · pgBackRest se déclare `status: ok` sur la stanza ;
#   · il reste au moins une archive MinIO en local.
#
# CE QUE CE GARDE-FOU NE GARDE PAS, et il faut le dire : il ne détecte pas une
# corruption SILENCIEUSE (un dépôt lisible dont le contenu serait faux), ni une
# suppression PARTIELLE cohérente. Il attrape la panne franche — volume vide,
# volume non monté, dépôt illisible — pas la panne subtile. La vraie réponse à
# celle-là serait le versionnage d'objets côté R2, qui ne se décide pas ici.
# -----------------------------------------------------------------------------
depot_local_sain() {
  pgbackrest --stanza="$STANZA" info 2>/dev/null | grep -q 'status: ok' || return 1
  ls -1 "$ARCHIVES" 2>/dev/null | grep -qE '^minio-[0-9]{8}T[0-9]{6}Z\.tar\.zst\.gpg$' || return 1
  return 0
}

# Relecture d'UN objet depuis R2, comparée à l'empreinte de la source locale.
# `mc cat` sort le flux distant ; on ne le range nulle part sur le disque — il
# n'y a donc aucun fichier temporaire à oublier, et aucune chance de comparer par
# mégarde la copie locale avec elle-même (le flux vient d'une socket, pas du
# volume). C'est ce détail qui rend la vérification honnête.
relire_depuis_r2() {
  local objet="$1" attendue="$2" obtenue
  obtenue="$(mcx cat "${R2_ALIAS}/${R2_BUCKET}/${objet}" | sha256sum | cut -d' ' -f1)" \
    || echouer_expedition "relecture impossible de ${objet} depuis R2."
  [ "$obtenue" = "$attendue" ] || echouer_expedition \
    "l'objet ${objet} relu depuis R2 ne correspond pas à la source (attendue ${attendue}, relue ${obtenue})."
  journal "R2 : relecture conforme — ${objet} (${attendue:0:16}…)"
}

expedier_r2() {
  local base="${R2_PREFIXE}" retirer='' derniere empreinte_locale objets_distants
  local debut fin
  debut="$(date -u +%s)"

  preparer_mc
  # `trap` sur EXIT : même un `echouer_expedition` au milieu laisse le répertoire
  # de configuration et les identifiants derrière lui. Ce n'est pas de la
  # coquetterie — c'est la seule façon de garantir la propriété « rien ne
  # subsiste » sur TOUS les chemins de sortie, y compris les mauvais.
  trap nettoyer_mc EXIT

  # LE JOURNAL NE CITE NI L'ENDPOINT NI LE JETON. L'endpoint R2 contient
  # l'identifiant du compte Cloudflare : c'est une des quatre valeurs à ne jamais
  # écrire (02 §30.4-5), et un journal Docker est lu, copié et collé. On journalise
  # le bucket et le préfixe — de quoi diagnostiquer — et rien de plus.
  # MESURÉ : une première version écrivait `(endpoint …)` ici et l'a publié dans
  # `docker logs`. Corrigé avant livraison.
  journal "R2 : expédition vers ${R2_BUCKET}/${base}"

  # 1. PRÉCONDITION D'ACCÈS. Un listage du bucket échoue tout de suite si le
  #    jeton est mort, si le bucket a disparu ou si le réseau est coupé — plutôt
  #    que de découvrir la panne au milieu d'un téléversement de plusieurs Go.
  #    On liste le BUCKET et non la racine : un jeton R2 limité aux objets d'un
  #    bucket n'a pas le droit d'énumérer les buckets du compte.
  mcx ls "${R2_ALIAS}/${R2_BUCKET}/" >/dev/null \
    || echouer_expedition "bucket ${R2_BUCKET} injoignable ou refusé (réseau, jeton révoqué, bucket supprimé — mc ne les distingue pas)."

  # 2. PROPAGATION DES SUPPRESSIONS : seulement si le local est sain.
  if depot_local_sain; then
    retirer='--remove'
  else
    journal "R2 : ATTENTION — dépôt local jugé NON SAIN : les suppressions ne seront PAS propagées (rétention distante figée cette nuit)."
  fi

  # 3. LE DÉPÔT pgBackRest. `mc mirror` est incrémental : il ne renvoie que ce
  #    qui a changé de taille ou de date. Les fichiers d'un dépôt pgBackRest sont
  #    IMMUABLES une fois écrits, donc une nuit ordinaire n'envoie que la
  #    sauvegarde du jour et ses WAL.
  # shellcheck disable=SC2086  # $retirer est un drapeau ou rien — jamais un chemin
  mcx mirror --overwrite $retirer "$DEPOT" "${R2_ALIAS}/${R2_BUCKET}/${base}/pgbackrest" \
    || echouer_expedition "le miroir du dépôt pgBackRest a échoué."

  # 4. LES ARCHIVES MinIO. On exclut les `.partiel` (une passe interrompue n'est
  #    pas une archive) et les marqueurs de service, qui ne décrivent que l'état
  #    de CETTE machine et n'ont rien à faire dans une copie de secours.
  # shellcheck disable=SC2086
  mcx mirror --overwrite $retirer --exclude '*.partiel' --exclude '.derniere-*' \
    "$ARCHIVES" "${R2_ALIAS}/${R2_BUCKET}/${base}/minio" \
    || echouer_expedition "le miroir des archives MinIO a échoué."

  # 5. RELECTURE — la seule étape qui prouve quelque chose.
  if [ "$R2_RELECTURE" = 'oui' ]; then
    relire_depuis_r2 "${base}/pgbackrest/backup/${STANZA}/backup.info" \
      "$(sha256sum "$DEPOT/backup/$STANZA/backup.info" | cut -d' ' -f1)"

    derniere="$(ls -1 "$ARCHIVES" 2>/dev/null \
      | grep -E '^minio-[0-9]{8}T[0-9]{6}Z\.tar\.zst\.gpg$' | sort -r | head -1 || true)"
    if [ -n "$derniere" ]; then
      empreinte_locale="$(sha256sum "$ARCHIVES/$derniere" | cut -d' ' -f1)"
      relire_depuis_r2 "${base}/minio/${derniere}" "$empreinte_locale"
    fi
  else
    journal 'R2 : relecture de contrôle DÉSACTIVÉE (AXION_R2_VERIFIER_RELECTURE=non) — le succès de mc est la seule garantie.'
  fi

  # 6. COMPTAGE — un miroir muet qui n'aurait rien envoyé rendrait 0 comme un
  #    miroir complet. Le nombre d'objets distants est le contre-indice le moins
  #    cher qui existe.
  objets_distants="$(mcx ls --recursive "${R2_ALIAS}/${R2_BUCKET}/${base}/" | wc -l)" \
    || echouer_expedition 'comptage des objets distants impossible.'
  [ "$objets_distants" -gt 0 ] || echouer_expedition \
    "le miroir s'est déclaré réussi mais ${R2_BUCKET}/${base} ne contient AUCUN objet."

  nettoyer_mc
  trap - EXIT
  fin="$(date -u +%s)"
  journal "R2 : expédition terminée — ${objets_distants} objet(s) sous ${base}/, en $((fin - debut)) s."
}

# -----------------------------------------------------------------------------
# PostgreSQL — sauvegarde pgBackRest
#
# Le TYPE vient du calendrier. Il n'y a AUCUN test « existe-t-il déjà une
# complète ? » : pgBackRest promeut lui-même une incrémentale en complète quand
# aucune complète n'existe (« no prior backup exists, incr backup has been
# changed to full »). Écrire ce test ici créerait une seconde vérité, moins
# fiable que celle de pgBackRest — c'est le raisonnement de `stanza-create.sh`.
# -----------------------------------------------------------------------------
sauvegarder_postgres() {
  local type_sauvegarde jour
  jour="$(date -u +%w)"
  if [ "$jour" = "$JOUR_COMPLETE" ]; then type_sauvegarde=full; else type_sauvegarde=incr; fi
  journal "PostgreSQL : pgbackrest --stanza=$STANZA --type=$type_sauvegarde backup"
  pgbackrest --stanza="$STANZA" --type="$type_sauvegarde" --log-level-console=info backup
}

# -----------------------------------------------------------------------------
# Une passe = les DEUX moitiés du critère L0, PUIS la sortie de la machine.
#
# L'ORDRE DES DEUX MARQUEURS EST LE CŒUR DE LA GRANULARITÉ D'ÉCHEC.
# `.derniere-passe` est écrit dès que la moitié LOCALE est acquise et vérifiée —
# donc AVANT l'expédition. Ce n'est pas une négligence, c'est la distinction
# demandée : si R2 tombe, la sauvegarde locale de cette nuit EXISTE, elle est
# restaurable, et le rattrapage au redémarrage ne doit pas refaire tourner
# `pgbackrest backup` pour rejouer un simple téléversement.
# `.derniere-expedition` n'est écrit que quand la copie est sortie ET relue.
# Aucune des deux moitiés ne peut donc se faire passer pour l'autre.
# -----------------------------------------------------------------------------
passe() {
  journal "=== passe du $(date -u '+%Y-%m-%d %H:%M:%SZ') ==="
  sauvegarder_postgres
  archiver_minio
  faire_tourner_minio
  date -u +%s > "$ARCHIVES/.derniere-passe"
  journal '=== moitié LOCALE terminée avec succès — reste à sortir de la machine ==='
  expedier_r2
  date -u +%s > "$ARCHIVES/.derniere-expedition"
  journal '=== passe terminée avec succès (locale ET hors serveur) ==='
  # Le rétablissement se dit UNE FOIS, et seulement si une alerte était ouverte.
  # Sans cette ligne, la panne aurait un début annoncé et pas de fin : le
  # destinataire resterait inquiet, ou — pire — prendrait l'habitude de ne plus
  # y croire.
  notifier_retablissement
}

# -----------------------------------------------------------------------------
# Planification — recalculée à CHAQUE tour depuis l'horloge murale, jamais par
# accumulation de `sleep`. Une dérive de quelques secondes par jour finirait par
# déplacer la sauvegarde en pleine journée de collecte.
# -----------------------------------------------------------------------------
secondes_avant_creneau() {
  local maintenant cible
  maintenant="$(date -u +%s)"
  cible="$(date -u -d "today $HEURE" +%s)"
  # `if` et non `[ … ] && …` : sous `set -e`, une liste `&&` dont le test est
  # faux fait sortir la fonction avec un code non nul — le créneau du lendemain
  # serait alors lu comme une panne. Le piège classique, écrit ici pour qu'il ne
  # revienne pas.
  if [ "$cible" -le "$maintenant" ]; then
    cible="$(date -u -d "tomorrow $HEURE" +%s)"
  fi
  echo $((cible - maintenant))
}

# =============================================================================
# Un marqueur est « trop vieux » (ou absent, ou illisible) au-delà de la
# tolérance. La même règle sert aux deux moitiés — c'est la seule façon de
# garantir qu'elles ne dérivent pas l'une par rapport à l'autre.
#
# -----------------------------------------------------------------------------
# TROIS DÉFAUTS CORRIGÉS ICI LE 2026-08-28, ET ILS AVAIENT LA MÊME CAUSE : CE
# FICHIER FAISAIT CONFIANCE AU CONTENU DU MARQUEUR
# -----------------------------------------------------------------------------
# 1. DEUX VÉRITÉS SUR LE MÊME FICHIER. `sauvegarde-healthcheck.sh` valide déjà
#    le contenu du marqueur (`absent`, `illisible`, `futur`) et refuse de
#    conclure quand il ne peut plus mesurer. Ce fichier-ci, son voisin immédiat,
#    lisant LES MÊMES DEUX FICHIERS, n'en validait rien. Deux lectures
#    contradictoires du même octet dans deux fichiers côte à côte : c'est la
#    définition d'un garde-fou qu'on ne peut plus croire.
#
# 2. L'HORLOGE QUI RECULE FAISAIT DORMIR LE SERVICE POUR TOUJOURS. Un marqueur
#    daté DANS LE FUTUR (NTP qui corrige une dérive, machine virtuelle restaurée
#    depuis un instantané, marqueur fabriqué) donne un âge NÉGATIF, toujours
#    inférieur à la tolérance : `doit_rattraper` répondait « non » et ne
#    répondait plus jamais « oui ». Mesuré à J+10 : AUCUNE sauvegarde n'est
#    publiée, le service dort tranquillement, et le conteneur passe `unhealthy`
#    — la sonde voyait ce que le service refusait de voir.
#    LA RÉPONSE RETENUE N'EST PAS « rattraper » MAIS « ÉCHOUER BRUYAMMENT », et
#    c'est un choix : quand l'horloge ment, le script ne peut plus dater ce qu'il
#    fait. Jouer une passe reviendrait à écrire un marqueur qu'on sait faux.
#    Sortir en erreur redémarre le service, alerte, et laisse la sonde rouge —
#    trois signaux cohérents entre eux, et surtout la MÊME conclusion que la
#    sonde voisine, qui refuse elle aussi de conclure. La tolérance de 300 s
#    (MARGE_FUTUR_S de la sonde) couvre un ajustement NTP ordinaire sans couvrir
#    un recul de fuseau.
#
# 3. INJECTION ARITHMÉTIQUE, JUSQU'ICI NEUTRALISÉE PAR ACCIDENT. Le contenu du
#    marqueur entrait tel quel dans `$(( … ))`, et l'arithmétique de bash évalue
#    les INDICES DE TABLEAU — un indice peut contenir une substitution de
#    commande. Mesuré : dans un shell SANS `set -u`, un marqueur valant
#    `x[$(touch …)]` fait exécuter le `touch`. Ce qui protégeait le script livré
#    n'était AUCUNE validation — il n'y en avait pas — mais le `-u` de son
#    `set -euo pipefail`. Une protection qui tient par effet de bord tient mal :
#    elle disparaît le jour où quelqu'un sort une ligne de son contexte. Le
#    contenu est désormais validé AVANT toute arithmétique, comme dans la sonde.
#    Le marqueur vit dans un volume que seul ce service écrit : ce n'est pas une
#    élévation de privilège, c'est de la défense en profondeur — mais « faible »
#    n'est pas « mesuré ».
# =============================================================================
marqueur_perime() {
  local fichier="$ARCHIVES/$1" derniere ecart age
  [ -r "$fichier" ] || return 0
  derniere="$(cat "$fichier" 2>/dev/null || true)"
  # VALIDATION AVANT ARITHMÉTIQUE. Un marqueur vide ou non numérique — écriture
  # interrompue, disque plein, contenu piégé — ne prouve aucune sauvegarde : il
  # vaut « absent », donc « périmé », donc on rattrape.
  case "$derniere" in
    '' | *[!0-9]*)
      journal "marqueur $1 vide ou non numérique (écriture interrompue, ou contenu inattendu) : traité comme ABSENT, une passe est nécessaire."
      return 0
      ;;
  esac
  ecart=$(( $(date -u +%s) - derniere ))
  if [ "$ecart" -lt -300 ]; then
    echouer "le marqueur $1 est daté DANS LE FUTUR de $(( -ecart )) s (horloge reculée, instantané restauré, ou marqueur fabriqué).
        Le service ne peut plus dater ce qu'il fait : jouer une passe écrirait un
        marqueur qu'on sait faux, et se taire l'aurait fait dormir pour toujours.
        La sonde de santé refuse elle aussi de conclure dans cet état."
  fi
  # Une avance inférieure à la marge est du bruit d'horloge, pas de la fraîcheur
  # négative : on la ramène à zéro, comme le fait la sonde.
  [ "$ecart" -ge 0 ] || ecart=0
  age=$(( ecart / 3600 ))
  [ "$age" -ge "$TOLERANCE_H" ]
}

doit_rattraper() { marqueur_perime '.derniere-passe'; }
doit_rattraper_expedition() { marqueur_perime '.derniere-expedition'; }

journal "service de sauvegarde démarré — créneau ${HEURE} UTC, complète le jour ${JOUR_COMPLETE}, rétention MinIO ${MINIO_ARCHIVES_GARDEES} archives, copie hors serveur vers ${R2_BUCKET}/${R2_PREFIXE}."

# RATTRAPAGE. C'est le point qui fait qu'une pile fraîchement déployée n'attend
# pas la nuit pour avoir sa première sauvegarde — le défaut mesuré le 2026-08-28
# était précisément une pile en bonne santé sans le moindre point de départ.
#
# DEUX RATTRAPAGES, ET L'ORDRE COMPTE. Si la sauvegarde locale est récente mais
# que l'expédition manque, on NE REFAIT PAS la sauvegarde : on rejoue le seul
# téléversement, avec les artefacts déjà sur le disque. C'est ce qui rend la
# boucle de redémarrage PEU COÛTEUSE quand R2 est indisponible — elle ne
# sollicite ni PostgreSQL, ni le volume MinIO — tout en gardant `Restarting` bien
# visible dans `docker ps`, seul signal dont ce service dispose.
if doit_rattraper; then
  journal 'aucune passe récente (ou aucune trace) — sauvegarde immédiate.'
  passe
elif doit_rattraper_expedition; then
  journal 'sauvegarde locale récente mais copie hors serveur manquante ou périmée — expédition immédiate, sans refaire la sauvegarde.'
  expedier_r2
  date -u +%s > "$ARCHIVES/.derniere-expedition"
  journal 'expédition de rattrapage terminée avec succès.'
  # Même geste qu'en fin de `passe` : c'est précisément par ce chemin que sort
  # une panne R2 qui se résorbe — la boucle de redémarrage finit par réussir son
  # expédition, sans refaire de sauvegarde.
  notifier_retablissement
fi

# ÉCHEC = SORTIE NON NULLE, sans filet. Aucun `|| true`, aucune reprise
# silencieuse : `set -e` fait sortir la boucle et Docker redémarre le service
# (`restart: unless-stopped`), avec son propre recul exponentiel. Le compteur de
# redémarrages et l'état `Restarting` de `docker ps` SONT le signal. Un service
# qui resterait `Up` en échouant chaque nuit est exactement le garde-fou menteur
# que ce lot a passé sa journée à démonter.
#
# DEUX CODES, DEUX GRAVITÉS — `docker inspect --format '{{.State.ExitCode}}'` :
#   1 → la sauvegarde n'a pas eu lieu. Il n'y a rien de neuf à restaurer.
#   2 → la sauvegarde locale est faite et vérifiée, la copie hors serveur non.
#       On tient la perte logique, pas la perte du serveur.
# Les deux redémarrent le conteneur ; seule leur LECTURE diffère, et c'est cette
# lecture qui dit à l'humain s'il doit rouvrir la base ou appeler Cloudflare.
while true; do
  attente="$(secondes_avant_creneau)"
  # CEINTURE. Le motif de `AXION_SAUVEGARDE_HEURE` est maintenant strict, donc
  # `date -u -d "today $HEURE"` ne peut plus échouer — mais c'est exactement ce
  # qu'on croyait avant le 2026-08-28, où `25:00` a produit une attente de
  # -1 787 918 488 s, un `sleep: invalid option`, et un service qui rejouait une
  # passe complète à chaque redémarrage sur une machine partagée. Un contrôle
  # d'entrée est une promesse ; ce test est la vérification de la promesse, à
  # l'endroit où son non-respect coûte cher.
  case "$attente" in
    '' | *[!0-9]*)
      echouer "délai avant le prochain créneau incalculable ('$attente') pour AXION_SAUVEGARDE_HEURE='$HEURE'. Le service refuse d'attendre une durée qu'il ne sait pas mesurer plutôt que de boucler sur des passes complètes."
      ;;
  esac
  journal "prochaine passe dans ${attente} s (créneau ${HEURE} UTC)."
  sleep "$attente"
  passe
done
