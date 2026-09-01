#!/usr/bin/env bash
# =============================================================================
# infra/scripts/sonde-alertes.sh — LES QUATRE SEUILS `ALERT_*` DEVIENNENT DU CODE
#
# Applique : invariant 8 (« sync >= 1x/jour + ALERTE AUTOMATIQUE au-delà »),
# 02 §11.3 (« alertes : disque > 80 %, job LLM > 5 min, certificat < 15 j »,
# canal Telegram interne), 07 ligne L0 (exploitation).
# Fiche AMELIORATIONS.md « O-2 », ABSORBÉE le 2026-08-31 — décideur Williams.
# Traçabilité : E38 (sauvegarde terrain : sync au moins une fois par jour),
# E35 (scalabilité et sauvegardes testées), E43 (exécutabilité autopilote).
#
# -----------------------------------------------------------------------------
# LE DÉFAUT QUE CE FICHIER FERME — à lire avant de le modifier
# -----------------------------------------------------------------------------
# `ALERT_DISK_USAGE_PERCENT`, `ALERT_LLM_JOB_MAX_MINUTES`, `ALERT_CERT_EXPIRY_DAYS`
# et `ALERT_SYNC_SILENT_HOURS` existaient depuis le lot L0 : documentés au
# `.env.example` avec le bon numéro de section en commentaire, injectés dans le
# service `worker` des DEUX piles de composition — et LUS PAR AUCUNE LIGNE DE CODE.
#
# C'est la forme la plus coûteuse du défaut que ce dépôt traque : un seuil écrit
# dans un fichier de configuration a exactement l'air d'un garde-fou. Il se relit,
# il se documente, il rassure, et il ne s'exécute jamais. Toute revue qui cherchait
# « le §11.3 est-il traité ? » par mot-clé trouvait quatre lignes conformes.
#
# -----------------------------------------------------------------------------
# LES DEUX RÈGLES QUI GOUVERNENT CE SCRIPT
# -----------------------------------------------------------------------------
#  1. UN CONTRÔLE DIT TROIS CHOSES, JAMAIS DEUX : « c'est bon » (VERT),
#     « c'est mauvais » (ALERTE) et « JE N'AI PAS PU REGARDER » (AVEUGLEMENT).
#     Un contrôle qui ne distingue pas « la réponse est non » de « je n'ai pas pu
#     poser la question » finit par accuser ce qu'il surveille à la place de
#     lui-même. Ici, un aveuglement PART SUR LE CANAL comme une alerte : la sonde
#     dénonce sa propre cécité, elle ne se tait jamais.
#
#  2. AUCUNE DONNÉE PERSONNELLE NE SORT (11 §2). Telegram est un canal EXTERNE.
#     Ne sortent que : des identifiants de mission (UUID), un jeton d'appareil
#     assaini (voir plus bas), des horodatages UTC, des compteurs et des seuils.
#     Ni nom, ni e-mail, ni contenu de réponse, ni identifiant de compte.
#
# -----------------------------------------------------------------------------
# CE QUE CETTE SONDE NE VOIT PAS — dit ici, pas dans un rapport que personne
# ne relira
# -----------------------------------------------------------------------------
#  · ELLE S'EXÉCUTE SUR LA MACHINE QU'ELLE SURVEILLE. VPS éteint, disque mort,
#    noyau bloqué : plus de cron, donc plus de sonde, donc plus d'alerte. UN
#    SYSTÈME NE PEUT PAS SIGNALER SA PROPRE ABSENCE. Seule une supervision
#    EXTERNE qui s'inquiète du SILENCE couvre ce cas — c'est la fiche O-1 de
#    `AMELIORATIONS.md`, NON ARBITRÉE à ce jour, et rien ici ne la prépare.
#  · `sync_log` et `llm_calls` sont des tables SANS ÉCRIVAIN à ce jour (la sync
#    arrive au lot L6, les appels LLM au lot L11). Les requêtes ci-dessous sont
#    justes et s'exécutent ; elles ne trouvent rien parce qu'il n'y a rien. La
#    sonde le DIT à chaque passe au lieu de rendre un vert qui ne prouve rien.
#  · Le job LLM est jugé APRÈS COUP, sur `llm_calls.duration_ms`, qui n'est écrit
#    qu'à la FIN d'un appel : un job LLM BLOQUÉ reste invisible tant qu'il n'est
#    pas terminé. Voir l'encadré du contrôle 4.
#
# -----------------------------------------------------------------------------
# DEUX MODES, PARCE QU'IL Y A DEUX CHEMINS DE DÉPLOIEMENT — ET LE SECOND EST LE
# SEUL QUI TOURNE
# -----------------------------------------------------------------------------
# `AXION_SONDE_MODE=hote` (DÉFAUT) — chemin « VPS dédié ». La sonde s'exécute SUR
#   L'HÔTE, lancée par `cron` (`install-cron.sh`), lit son `.env` passé en
#   argument, parle à PostgreSQL par `docker compose exec` et lit le magasin TLS
#   par un conteneur jetable. C'est le chemin DÉCRIT — et `infra/README.md` §7
#   le marque JAMAIS JOUÉ.
#
# `AXION_SONDE_MODE=pile` — chemin COOLIFY, le chemin ÉPROUVÉ. La sonde est un
#   SERVICE de la pile : pas d'hôte, pas de `cron`, pas de socket Docker. Elle
#   lit donc son environnement dans SON PROPRE PROCESSUS (Coolify l'injecte),
#   parle à PostgreSQL par le RÉSEAU interne, et se planifie elle-même par une
#   boucle. Les trois accès aux données changent d'un coup ; c'est pourquoi la
#   contre-épreuve a été rejouée en entier dans cette configuration.
#
#   ⚠️ AUCUN SOCKET DOCKER DANS CE MODE, JAMAIS. Le donner à un side-car serait
#   une élévation de privilège — le service `sauvegarde` a été tranché sur ce
#   raisonnement, et il vaut ici mot pour mot.
#
#   ⚠️ POURQUOI UNE BOUCLE ET NON « L'ORDONNANCEUR DE LA PILE » : IL N'Y EN A
#   PAS. Cette pile n'a AUCUN ordonnanceur général. La seule chose planifiée y
#   est le service `sauvegarde`, dont la planification vit DANS son script
#   (`while true; sleep $(secondes_avant_creneau)`), forme explicitement arbitrée
#   en tête de `infra/postgres/sauvegarde.sh` CONTRE BullMQ (le worker n'a pas
#   les accès) et CONTRE les tâches planifiées de Coolify (« leur définition vit
#   dans la base de Coolify, pas dans ce dépôt ; elle serait invisible à git,
#   absente d'une reconstruction, et personne ne verrait qu'elle a disparu »).
#   On REPREND ce motif, on n'en invente pas un second.
#
# USAGE : ./sonde-alertes.sh [/opt/axion-audit/<env>/.env]   (mode `hote`)
#         AXION_SONDE_MODE=pile /usr/local/bin/axion-sonde-alertes  (mode `pile`)
# CODES DE SORTIE (mode `hote` ; en mode `pile` la boucle ne rend jamais la main) :
# 0 = tout vert · 1 = au moins une alerte · 2 = au moins un aveuglement et aucune
# alerte. (Le cron ignore le code ; un humain non.)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# LA BIBLIOTHÈQUE COMMUNE, CHERCHÉE À DEUX ENDROITS. Dans le dépôt elle est à
# côté du script ; dans l'image Coolify le script est installé en
# `/usr/local/bin/axion-sonde-alertes` et la bibliothèque en
# `/usr/local/lib/axion/common.sh` — un `dirname` n'y mènerait pas. On échoue
# bruyamment si aucune des deux n'existe : une sonde sans son journal ni son
# émetteur d'alertes ne doit pas démarrer « quand même ».
AXION_COMMON_TROUVE=''
for _candidat in "$SCRIPT_DIR/lib/common.sh" /usr/local/lib/axion/common.sh; do
  if [[ -r "$_candidat" ]]; then
    # shellcheck source=infra/scripts/lib/common.sh
    . "$_candidat"
    AXION_COMMON_TROUVE="$_candidat"
    break
  fi
done
if [[ -z "$AXION_COMMON_TROUVE" ]]; then
  echo "sonde-alertes : bibliothèque common.sh introuvable (cherchée dans $SCRIPT_DIR/lib/ et /usr/local/lib/axion/)." >&2
  exit 1
fi

MODE="${AXION_SONDE_MODE:-hote}"
case "$MODE" in
  hote | pile) : ;;
  *)
    echo "sonde-alertes : AXION_SONDE_MODE invalide (« $MODE ») — attendu hote|pile." >&2
    exit 1
    ;;
esac

if [[ "$MODE" == 'pile' ]]; then
  # Coolify injecte le `.env` de l'application dans l'environnement de CHAQUE
  # conteneur (mesuré, encadré « COFFRE DES SECRETS » du compose) : il n'existe
  # aucun fichier à charger, et en réclamer un ferait échouer le service au
  # démarrage. On EXIGE en revanche explicitement ce dont on a besoin, plutôt
  # que d'inventer des valeurs par défaut sur des variables d'exploitation.
  ENV_FILE='(environnement du processus — pile Coolify)'
  axion_require_env APP_ENV POSTGRES_USER POSTGRES_DB
else
  ENV_FILE="${1:-$(axion_env_file_default)}"
  axion_load_env "$ENV_FILE"
  axion_require_env APP_ENV
fi

mkdir -p "$AXION_LOG_DIR"
# UN SEUL fichier, en ajout, et non un fichier horodaté par passe : la sonde
# tourne toutes les heures. `install-cron.sh` fait déjà tourner `$AXION_LOG_DIR/*.log`.
AXION_LOG_FILE="${AXION_LOG_FILE:-$AXION_LOG_DIR/sonde-alertes.log}"
export AXION_LOG_FILE

# Répertoire d'état — il ne porte QUE des marqueurs anti-harcèlement (des fichiers
# vides, horodatés par leur mtime). Aucune donnée métier n'y est écrite.
ETAT_DIR="${AXION_SONDE_ETAT_DIR:-$AXION_LOG_DIR/sonde-etat}"
mkdir -p "$ETAT_DIR"
chmod 750 "$ETAT_DIR" 2>/dev/null || true

# Délai minimal entre deux messages de MÊME catégorie. 24 h par défaut, comme la
# chaîne de sauvegarde : une panne qui dure mérite un rappel par jour, pas un
# rappel par passe. La PREMIÈRE occurrence part toujours immédiatement.
INTERVALLE_H="${AXION_SONDE_ALERTE_INTERVALLE_H:-24}"

# Conteneur PostgreSQL interrogé (mode `hote` uniquement). Vide (cas nominal) = le
# service `postgres` de la pile Compose de $APP_ENV. Renseigné = `docker exec`
# direct sur ce conteneur : c'est la couture par laquelle la contre-épreuve locale
# et les tests d'intégration interrogent une base jetable sans monter la pile.
PG_CONTENEUR="${AXION_SONDE_PG_CONTENEUR:-}"

# Hôte et port de PostgreSQL en mode `pile` — le nom de service du réseau interne.
PG_HOTE="${AXION_SONDE_PG_HOTE:-postgres}"
PG_PORT="${AXION_SONDE_PG_PORT:-5432}"

# ── POINTS DE MONTAGE SURVEILLÉS ────────────────────────────────────────────
# Ceux qui n'existent pas sont ignorés en silence (une machine de développement
# n'a ni /var/backups ni /opt/axion-audit) ; si AUCUN n'existe, c'est un
# aveuglement, pas un vert.
#
# EN MODE `pile`, LE DÉFAUT EST `/` ET CE CHOIX MÉRITE SA PHRASE. Le side-car ne
# monte AUCUN volume de données : lui donner `postgres_data` en lecture seule
# pour y faire un `df` lui ouvrirait les fichiers bruts de la base pour mesurer
# un pourcentage. Or `/` dans le conteneur est la couche overlay, portée par le
# système de fichiers de `/var/lib/docker` — CELUI QUI PORTE AUSSI LES VOLUMES,
# donc celui qui se remplit. La mesure est juste avec zéro accès aux données.
# ⚠️ SA LIMITE, à connaître : si les volumes étaient déplacés sur un autre disque,
# cette mesure porterait sur le mauvais. L'exploitant doit alors renseigner
# AXION_SONDE_CHEMINS_DISQUE avec un point de montage de ce disque.
if [[ "$MODE" == 'pile' ]]; then
  CHEMINS_DISQUE="${AXION_SONDE_CHEMINS_DISQUE:-/}"
else
  CHEMINS_DISQUE="${AXION_SONDE_CHEMINS_DISQUE:-/ $AXION_ROOT /var/lib/docker /var/backups}"
fi

# Répertoire du magasin TLS lu DIRECTEMENT (montage en lecture seule), sans
# conteneur jetable ni socket Docker. Renseigné ⇒ c'est cette source qui sert,
# dans les deux modes. Voir l'encadré du contrôle 2 pour ce qu'il en est sur la
# pile Coolify — où il n'y a, mesure à l'appui, aucun certificat à lire.
CADDY_CHEMIN="${AXION_SONDE_CADDY_CHEMIN:-}"

# Cadence de la boucle en mode `pile` : la minute de l'heure à laquelle la passe
# se déclenche. MÊME VALEUR que la ligne cron posée par `install-cron.sh` — les
# deux chemins doivent sonner au même moment, sinon comparer leurs journaux
# devient un exercice de traduction.
MINUTE_DE_PASSE="${AXION_SONDE_MINUTE:-17}"

TS="$(axion_ts)"

# --- Accumulateurs (remis à zéro à CHAQUE passe : en mode `pile` le processus
#     vit des semaines, et des accumulateurs qui grossissent feraient enfler le
#     bilan jusqu'à le rendre faux) ---------------------------------------------
declare -a ALERTES=()
declare -a AVEUGLEMENTS=()
declare -a VERTS=()
declare -a SANS_OBJET=()

# =============================================================================
# OUTILLAGE
# =============================================================================

# Joint des éléments par un séparateur. `"${tableau[*]}"` ne sait joindre que par
# le PREMIER caractère d'IFS — un séparateur de deux caractères y perd le second,
# silencieusement. Une fonction explicite coûte six lignes et ne ment pas.
joindre() {
  local sep="$1"
  shift
  local sortie='' element
  for element in "$@"; do
    sortie+="${sortie:+$sep}$element"
  done
  printf '%s' "$sortie"
}

# Un entier strictement positif, et rien d'autre. Un seuil vide, non numérique ou
# nul ne se corrige pas par une valeur par défaut inventée : le `.env` est le
# contrat (02 §30.4-1). Un seuil illisible devient un AVEUGLEMENT — le contrôle
# n'a pas pu être fait, et cela se dit.
seuil_valide() {
  # `${!1}` : expansion INDIRECTE — la fonction reçoit le NOM de la variable, pas
  # sa valeur, ce qui lui permet de nommer la variable fautive dans le message.
  local valeur="${!1:-}"
  case "$valeur" in
    '' | *[!0-9]*) return 1 ;;
    *) [[ "$valeur" -gt 0 ]] || return 1 ;;
  esac
  return 0
}

# Le marqueur anti-harcèlement d'une catégorie est-il encore frais ?
# `find -mmin` plutôt qu'une arithmétique sur des dates : une seule commande, et
# elle ne connaît pas les fuseaux.
alerte_recente() {
  local categorie="$1"
  local marqueur="$ETAT_DIR/$categorie.alerte"
  [[ -f "$marqueur" ]] || return 1
  local frais
  frais="$(find "$ETAT_DIR" -maxdepth 1 -name "$categorie.alerte" -mmin "-$((INTERVALLE_H * 60))" -print -quit 2>/dev/null || true)"
  [[ -n "$frais" ]]
}

# ENREGISTRE une anomalie. `categorie` sert au marqueur ; `message` part sur le
# canal. Le journal, lui, garde TOUT — y compris ce que le canal n'a pas répété.
signaler() {
  local categorie="$1" message="$2"
  ALERTES+=("$message")
  axion_error "$message"
  if alerte_recente "$categorie"; then
    axion_log "Canal : message « $categorie » NON répété (dernier envoi il y a moins de ${INTERVALLE_H} h)."
    return 0
  fi
  axion_notify "$message"
  : >"$ETAT_DIR/$categorie.alerte"
}

# ENREGISTRE un aveuglement. Même chemin que `signaler`, catégorie distincte :
# « le disque est plein » et « je n'ai pas su lire le disque » ne doivent JAMAIS
# se réveiller ni s'éteindre l'un pour l'autre.
aveugler() {
  local categorie="$1" raison="$2"
  local message="SONDE AVEUGLE sur « $categorie » : $raison. Le contrôle N'A PAS eu lieu — ceci n'est pas un « tout va bien »."
  AVEUGLEMENTS+=("$message")
  axion_error "$message"
  if alerte_recente "aveugle-$categorie"; then
    axion_log "Canal : aveuglement « $categorie » NON répété (dernier envoi il y a moins de ${INTERVALLE_H} h)."
    return 0
  fi
  axion_notify "$message"
  : >"$ETAT_DIR/aveugle-$categorie.alerte"
}

# ENREGISTRE un retour à la normale. Une alerte qui ne dit jamais « c'est fini »
# se fait ignorer en trois semaines : on efface le marqueur ET on le dit, une
# seule fois, à la passe qui constate le rétablissement.
retablir() {
  local categorie="$1" message="$2"
  local prefixe
  VERTS+=("$message")
  axion_log "$message"
  for prefixe in "$categorie" "aveugle-$categorie"; do
    if [[ -f "$ETAT_DIR/$prefixe.alerte" ]]; then
      rm -f "$ETAT_DIR/$prefixe.alerte"
      axion_notify "RÉTABLI — $message"
    fi
  done
}

# Exécute une requête SQL et rend ses lignes. Sortie brute de psql : `-A -t -q`
# (non aligné, sans en-tête, sans message), séparateur de colonnes `|`.
# ⚠️ Toute colonne susceptible de contenir du texte libre est ASSAINIE PAR LA
#    REQUÊTE ELLE-MÊME (voir le contrôle 3), jamais ici : l'assainissement doit
#    vivre au plus près de la source, sinon un futur appelant l'oubliera.
#
# TROIS CHEMINS D'ACCÈS, UN SEUL JEU DE REQUÊTES. Le mode `pile` passe par le
# RÉSEAU interne : pas de socket Docker, pas de `docker exec`. Le mot de passe
# voyage par `PGPASSWORD` — une VARIABLE D'ENVIRONNEMENT du seul appel `psql`,
# jamais un argument : la table des processus de l'hôte ne le voit pas.
sonde_sql() {
  local requete="$1"
  case "$MODE" in
    pile)
      PGPASSWORD="${POSTGRES_PASSWORD:-}" \
        psql -X -A -t -q -v ON_ERROR_STOP=1 \
        -h "$PG_HOTE" -p "$PG_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "$requete"
      ;;
    *)
      if [[ -n "$PG_CONTENEUR" ]]; then
        docker exec -i --user postgres "$PG_CONTENEUR" \
          psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$requete"
      else
        axion_compose exec -T --user postgres postgres \
          psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$requete"
      fi
      ;;
  esac
}

# ENREGISTRE un contrôle SANS OBJET — ni vert, ni alerte, ni aveuglement.
# La quatrième catégorie existe parce que les trois autres mentiraient : un
# contrôle qui n'a rien à surveiller SUR CE CHEMIN-LÀ n'est pas « vert » (il n'a
# rien vu) et n'est pas « aveugle » (il n'a rien raté). Elle est journalisée à
# CHAQUE passe, jamais en silence : un contrôle désactivé qu'on oublie
# redevient, au bout de quelques semaines, un seuil qui a l'air d'un garde-fou.
sans_objet() {
  local message="$1"
  SANS_OBJET+=("$message")
  axion_warn "SANS OBJET — $message"
}

# Nom du volume effectivement lu par le contrôle 2 quand il passe par un
# conteneur jetable. Déclaré ici pour que `set -u` ne le découvre pas au vol.
CADDY_VOLUME_LU=''

# =============================================================================
# CONTRÔLE 1 — DISQUE (ALERT_DISK_USAGE_PERCENT, 02 §11.3 « disque > 80 % »)
# DONNÉE : `df` sur l'hôte. Elle existe, elle est immédiate, elle ne dépend
# d'aucun lot applicatif. C'est le seul des quatre contrôles dont la donnée est
# pleinement disponible aujourd'hui.
# =============================================================================
controle_disque() {
  if ! seuil_valide ALERT_DISK_USAGE_PERCENT; then
    aveugler 'disque' "ALERT_DISK_USAGE_PERCENT absent ou non entier (« ${ALERT_DISK_USAGE_PERCENT:-} ») — voir .env.example"
    return 0
  fi
  if ! command -v df >/dev/null 2>&1; then
    aveugler 'disque' 'commande `df` absente'
    return 0
  fi

  local -a vus=() pleins=() chemins=()
  local chemin ligne montage usage
  read -r -a chemins <<<"$CHEMINS_DISQUE"
  for chemin in "${chemins[@]}"; do
    [[ -d "$chemin" ]] || continue
    # LA COLONNE DE POURCENTAGE SE RECONNAÎT À SA FORME, PAS À SON RANG.
    # La première version lisait `$5` et `$6` — les rangs POSIX de « Capacity » et
    # « Mounted on ». La contre-épreuve locale l'a mise en défaut en une passe : le
    # nom de périphérique y contient une espace, tout décale d'un cran, et la sonde
    # a comparé 19 907 992 (l'espace LIBRE) au seuil de 99 %. Elle a donc crié au
    # disque plein sur un disque qui ne l'était pas — un contrôle qui crie à tort
    # finit désactivé, ce qui revient à ne pas l'avoir écrit.
    # On repère donc le champ `<entier>%`, et tout ce qui le SUIT est le point de
    # montage (qui peut lui aussi contenir des espaces).
    ligne="$(df -P "$chemin" 2>/dev/null | awk '
      NR == 2 {
        for (i = NF; i >= 1; i--) if ($i ~ /^[0-9]+%$/) { rang = i; break }
        if (!rang) exit
        capacite = $rang; sub(/%/, "", capacite)
        point = ""
        for (i = rang + 1; i <= NF; i++) point = point (point == "" ? "" : " ") $i
        print capacite " " point
      }' || true)"
    [[ -n "$ligne" ]] || continue
    usage="${ligne%% *}"
    montage="${ligne#* }"
    case "$usage" in '' | *[!0-9]*) continue ;; esac
    [[ -n "$montage" ]] || montage="$chemin"
    # Un même système de fichiers vu par deux chemins ne se compte qu'une fois.
    case " ${vus[*]-} " in *" $montage "*) continue ;; esac
    vus+=("$montage")
    if [[ "$usage" -ge "$ALERT_DISK_USAGE_PERCENT" ]]; then
      pleins+=("$montage à ${usage} %")
    fi
  done

  if [[ "${#vus[@]}" -eq 0 ]]; then
    aveugler 'disque' "aucun des points surveillés n'existe sur cette machine (« $CHEMINS_DISQUE »)"
    return 0
  fi
  if [[ "${#pleins[@]}" -gt 0 ]]; then
    signaler 'disque' "DISQUE — seuil ${ALERT_DISK_USAGE_PERCENT} % atteint sur : $(joindre ' ; ' "${pleins[@]}"). Relevé le ${TS}."
    return 0
  fi
  retablir 'disque' "Disque : ${#vus[@]} système(s) de fichiers sous le seuil de ${ALERT_DISK_USAGE_PERCENT} %."
}

# =============================================================================
# CONTRÔLE 2 — CERTIFICAT TLS (ALERT_CERT_EXPIRY_DAYS, « certificat < 15 j »)
#
# DEUX SOURCES POSSIBLES, ET UNE TROISIÈME SITUATION QUI N'EN A AUCUNE :
#  · `AXION_SONDE_CADDY_CHEMIN` renseigné → le magasin est LU DIRECTEMENT dans un
#    montage en lecture seule. Aucun conteneur jetable, aucun socket Docker.
#    C'est la forme utilisable depuis un side-car, et elle sert dans les deux modes.
#  · sinon, mode `hote` → volume `<projet>_caddy_data` via un conteneur jetable,
#    exactement comme `backup-caddy.sh` lit le même volume depuis le lot L0.
#  · mode `pile` SANS chemin → SANS OBJET, et l'encadré ci-dessous dit pourquoi.
#
# ┌───────────────────────────────────────────────────────────────────────────┐
# │ ⚠️ SUR LA PILE COOLIFY, IL N'Y A AUCUN CERTIFICAT À LIRE — MESURÉ, PAS     │
# │ SUPPOSÉ. `docker-compose.coolify.yml` impose `CADDY_SITE_ADDRESS: ':8080'`,│
# │ et son propre encadré « ADRESSES DE SITE » l'explique : une adresse SANS   │
# │ nom d'hôte fait écouter Caddy en HTTP SIMPLE, « il ne tente aucun ACME et  │
# │ ne présente aucun certificat », parce que TLS est terminé par Traefik en   │
# │ amont (DECISIONS.md 2026-08-28). Le volume `caddy_data` de cette pile est  │
# │ donc VIDE DE CERTIFICATS par construction, et le monter n'apprendrait      │
# │ rien : le contrôle produirait un aveuglement permanent, c'est-à-dire un    │
# │ cri sans cause — la façon la plus sûre de faire désactiver une sonde.      │
# │                                                                           │
# │ LE CERTIFICAT QUI COMPTE VRAIMENT SUR CE CHEMIN EST CELUI DE TRAEFIK, ET   │
# │ IL N'EST PAS À NOUS. Son magasin vit dans les données de Coolify, que      │
# │ cette pile ne monte pas et ne peut pas monter : elle n'a aucun accès à     │
# │ `/data/coolify` ni au réseau `coolify`, et le lui donner serait exactement │
# │ l'élévation de privilège refusée au service `sauvegarde`. **CONSÉQUENCE À  │
# │ PORTER À L'ARBITRAGE : sur le chemin exploité, `ALERT_CERT_EXPIRY_DAYS`    │
# │ n'est honoré par PERSONNE — ni par cette sonde, ni par autre chose.** Ce   │
# │ n'est pas un trou que ce script peut fermer ; c'est un trou qu'il nomme,   │
# │ à chaque passe, dans son journal.                                         │
# └───────────────────────────────────────────────────────────────────────────┘
#
# En staging (chemin VPS) la pile n'a pas de frontal (arbitrage du 2026-08-27) :
# même verdict, autre raison.
# =============================================================================
controle_certificat() {
  if [[ "$APP_ENV" == 'staging' && "$MODE" == 'hote' ]]; then
    sans_objet 'Certificats : pile de staging sans frontal (arbitrage du 2026-08-27) ; les certificats des DEUX domaines vivent dans le caddy_data de la PROD.'
    return 0
  fi
  if ! seuil_valide ALERT_CERT_EXPIRY_DAYS; then
    aveugler 'certificat' "ALERT_CERT_EXPIRY_DAYS absent ou non entier (« ${ALERT_CERT_EXPIRY_DAYS:-} ») — voir .env.example"
    return 0
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    aveugler 'certificat' 'commande `openssl` absente'
    return 0
  fi

  # --- Source 1 : montage direct (side-car, ou hôte qui préfère un chemin) ----
  local -a fichiers=()
  local source
  if [[ -n "$CADDY_CHEMIN" ]]; then
    source="$CADDY_CHEMIN"
    if [[ ! -d "$CADDY_CHEMIN" ]]; then
      aveugler 'certificat' "AXION_SONDE_CADDY_CHEMIN pointe sur « $CADDY_CHEMIN », qui n'est pas un répertoire (montage absent ?)"
      return 0
    fi
    local f
    while IFS= read -r f; do [[ -n "$f" ]] && fichiers+=("$f"); done \
      < <(find "$CADDY_CHEMIN" -type f -name '*.crt' 2>/dev/null || true)
  elif [[ "$MODE" == 'pile' ]]; then
    sans_objet "Certificats : aucun magasin à lire dans cette pile — Caddy y écoute en HTTP simple (:8080) et n'émet aucun certificat ; TLS est terminé par Traefik, dont le magasin ne nous appartient pas et ne doit pas nous être ouvert. ALERT_CERT_EXPIRY_DAYS=${ALERT_CERT_EXPIRY_DAYS} n'est donc honoré par PERSONNE sur ce chemin (à arbitrer). Renseigner AXION_SONDE_CADDY_CHEMIN si un magasin lisible existe un jour."
    return 0
  else
    # --- Source 2 : volume Docker via conteneur jetable (chemin VPS dédié) ----
    if ! command -v docker >/dev/null 2>&1; then
      aveugler 'certificat' 'commande `docker` absente et AXION_SONDE_CADDY_CHEMIN non renseigné'
      return 0
    fi
    local volume="${AXION_SONDE_CADDY_VOLUME:-$(axion_project_name)_caddy_data}"
    source="volume $volume"
    if ! docker volume inspect "$volume" >/dev/null 2>&1; then
      # Volontairement un AVEUGLEMENT et non un vert : « aucun certificat » et
      # « je ne trouve pas le magasin » se ressemblent, et l'un des deux est une
      # panne. `backup-caddy.sh` tranche de la même façon depuis le lot L0.
      aveugler 'certificat' "volume « $volume » introuvable (frontal jamais démarré, volume détruit, ou nom de projet inattendu)"
      return 0
    fi
    local liste
    if ! liste="$(docker run --rm -v "$volume:/data:ro" "$AXION_ALPINE_IMAGE" \
      find /data -type f -name '*.crt' 2>/dev/null)"; then
      aveugler 'certificat' "lecture du volume « $volume » impossible (démon Docker ou image $AXION_ALPINE_IMAGE)"
      return 0
    fi
    local l
    while IFS= read -r l; do [[ -n "$l" ]] && fichiers+=("$l"); done <<<"$liste"
    CADDY_VOLUME_LU="$volume"
  fi

  if [[ "${#fichiers[@]}" -eq 0 ]]; then
    aveugler 'certificat' "aucun fichier .crt dans « $source » — là où un frontal émet des certificats, n'en trouver aucun est une anomalie"
    return 0
  fi

  local -a proches=()
  local fichier pem fin_epoch maintenant_epoch jours nom total=0
  maintenant_epoch="$(date -u +%s)"
  for fichier in "${fichiers[@]}"; do
    if [[ -n "$CADDY_CHEMIN" ]]; then
      pem="$(cat "$fichier" 2>/dev/null || true)"
    else
      pem="$(docker run --rm -v "${CADDY_VOLUME_LU}:/data:ro" "$AXION_ALPINE_IMAGE" cat "$fichier" 2>/dev/null || true)"
    fi
    [[ -n "$pem" ]] || continue
    local fin
    fin="$(printf '%s\n' "$pem" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2- || true)"
    [[ -n "$fin" ]] || continue
    fin_epoch="$(date -u -d "$fin" +%s 2>/dev/null || true)"
    case "$fin_epoch" in '' | *[!0-9]*) continue ;; esac
    total=$((total + 1))
    jours=$(((fin_epoch - maintenant_epoch) / 86400))
    # Le NOM DE FICHIER porte le domaine — c'est une donnée d'exploitation
    # publique (elle figure dans le certificat lui-même), pas une donnée
    # personnelle. On n'émet que le dernier segment.
    nom="$(basename "$fichier")"
    if [[ "$jours" -lt "$ALERT_CERT_EXPIRY_DAYS" ]]; then
      proches+=("$nom expire dans ${jours} j (le ${fin})")
    fi
  done

  if [[ "$total" -eq 0 ]]; then
    aveugler 'certificat' "aucun des fichiers .crt de « $source » n'a pu être lu par openssl"
    return 0
  fi
  if [[ "${#proches[@]}" -gt 0 ]]; then
    signaler 'certificat' "CERTIFICAT TLS — seuil ${ALERT_CERT_EXPIRY_DAYS} j franchi : $(joindre ' ; ' "${proches[@]}"). Relevé le ${TS}."
    return 0
  fi
  retablir 'certificat' "Certificats : ${total} certificat(s) lus, tous au-delà de ${ALERT_CERT_EXPIRY_DAYS} j."
}

# =============================================================================
# CONTRÔLE 3 — SYNC MUETTE (ALERT_SYNC_SILENT_HOURS) — LE SEUL 🔴 DU DOSSIER
#
# DONNÉE : `sync_log`, une ligne par passe de synchronisation, avec `device_id`,
# `started_at` et `ended_at` (04, migration 0007). ⚠️ AUCUN CODE N'ÉCRIT ENCORE
# DANS CETTE TABLE : la synchronisation arrive au lot L6. La requête est juste et
# s'exécute ; elle ne trouvera rien avant L6, et LA SONDE LE DIT plutôt que de
# rendre un vert.
#
# TROIS CHOIX DE LECTURE, alignés sur `apps/api/src/domaines/users/depot.ts`
# (`lireDerniersEtatsDeSync`) — même table, même question, même ordre :
#  1. PAR APPAREIL (`DISTINCT ON (device_id)`) : un auditeur peut avoir une
#     tablette ET un portable ; la dernière sync du portable ne dit RIEN de ce qui
#     dort sur la tablette, et c'est la tablette qui porte les entretiens du jour.
#  2. AUCUN FILTRE SUR `direction` : la question est « cet appareil a-t-il donné
#     signe de vie ? », pas « a-t-il poussé ? ».
#  3. L'ORDRE EST `coalesce(ended_at, started_at) DESC NULLS LAST` : `sync_log`
#     n'a ni `created_at` ni identifiant ordonnable (son défaut est un UUID v4).
#     Une ligne qu'on ne sait pas dater ne peut pas être « la dernière » — elle
#     devient un aveuglement (état INDATABLE), pas un silence.
#
# ── ASSAINISSEMENT DU `device_id`, ET POURQUOI IL EST DANS LA REQUÊTE ────────
# `sync_log.device_id` est du TEXTE LIBRE remonté par le client. Le pack n'en
# fixe aucun format : rien n'empêche un appareil de s'annoncer « iPad de <prénom> ».
# Telegram est un canal EXTERNE : on ne peut pas parier sur la discipline d'un
# client pour tenir l'invariant « aucune donnée personnelle ne sort ».
# La règle est donc : un `device_id` conforme à un motif technique étroit sort
# TEL QUEL ; tout le reste sort comme `emp:<12 hex>` — une empreinte SHA-256
# tronquée, STABLE (le même appareil porte toujours le même jeton, donc l'alerte
# reste corrélable d'un jour à l'autre) et NON RÉVERSIBLE.
# L'assainissement vit dans le SQL, au plus près de la source : ainsi la valeur
# brute ne traverse jamais ce script, et aucun futur appelant ne peut l'oublier.
# Effet de bord VOULU : la valeur émise ne peut contenir ni `|` ni saut de ligne,
# ce qui rend le découpage des lignes de psql sûr par construction.
# =============================================================================
controle_sync() {
  if ! seuil_valide ALERT_SYNC_SILENT_HOURS; then
    aveugler 'sync' "ALERT_SYNC_SILENT_HOURS absent ou non entier (« ${ALERT_SYNC_SILENT_HOURS:-} ») — voir .env.example"
    return 0
  fi
  if [[ -z "${POSTGRES_USER:-}" || -z "${POSTGRES_DB:-}" ]]; then
    aveugler 'sync' "POSTGRES_USER ou POSTGRES_DB absent du fichier d'environnement"
    return 0
  fi

  local requete resultat
  requete=$(
    cat <<SQL
WITH derniere AS (
  SELECT DISTINCT ON (device_id)
         device_id,
         user_id,
         coalesce(ended_at, started_at) AS vue_le
    FROM sync_log
   WHERE device_id IS NOT NULL
   ORDER BY device_id, coalesce(ended_at, started_at) DESC NULLS LAST
),
appareils AS (
  SELECT CASE
           WHEN d.device_id ~ '^[A-Za-z0-9._:-]{1,64}\$' THEN d.device_id
           ELSE 'emp:' || substr(encode(sha256(d.device_id::bytea), 'hex'), 1, 12)
         END                                                        AS jeton,
         d.vue_le,
         coalesce(string_agg(DISTINCT m.id::text, ' '), '')          AS missions
    FROM derniere d
    LEFT JOIN mission_users mu ON mu.user_id = d.user_id
    LEFT JOIN missions m
           ON m.id = mu.mission_id
          AND m.deleted_at IS NULL
          AND m.status IN ('preparation', 'en_cours', 'en_analyse')
   GROUP BY 1, 2
)
SELECT 'APPAREIL', jeton,
       coalesce(to_char(vue_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
       coalesce(floor(extract(epoch FROM (now() - vue_le)) / 3600)::bigint::text, ''),
       CASE WHEN vue_le IS NULL THEN 'INDATABLE' ELSE 'MUET' END,
       missions
  FROM appareils
 WHERE vue_le IS NULL
    OR vue_le < now() - make_interval(hours => ${ALERT_SYNC_SILENT_HOURS})
UNION ALL
SELECT 'TOTAL', count(*)::text, '', '', '', '' FROM sync_log
UNION ALL
SELECT 'MISSIONS_ACTIVES', count(*)::text, '', '', '', ''
  FROM missions
 WHERE deleted_at IS NULL AND status IN ('preparation', 'en_cours', 'en_analyse')
-- Tri par ORDINAL : dans une UNION, seules les colonnes de SORTIE sont
-- ordonnables. Colonne 3 = l'horodatage ISO, dont l'ordre lexicographique EST
-- l'ordre chronologique ; les appareils indatables (chaîne vide) passent devant.
 ORDER BY 1, 3;
SQL
  )

  if ! resultat="$(sonde_sql "$requete" 2>&1)"; then
    # LE CAS QUI COMPTE : base injoignable, conteneur arrêté, mot de passe changé.
    # Un `|| true` ici rendrait un vert, et personne ne saurait jamais qu'aucun
    # appareil n'a été regardé depuis des semaines.
    aveugler 'sync' "interrogation de PostgreSQL impossible ($(printf '%s' "$resultat" | tr '\n' ' ' | cut -c1-200))"
    return 0
  fi

  local -a muets=() indatables=()
  local total_lignes=0 missions_actives=0
  local marque jeton vue_le heures etat missions reste
  while IFS='|' read -r marque jeton vue_le heures etat missions reste; do
    [[ -n "$marque" ]] || continue
    case "$marque" in
      TOTAL) total_lignes="${jeton:-0}" ;;
      MISSIONS_ACTIVES) missions_actives="${jeton:-0}" ;;
      APPAREIL)
        if [[ "$etat" == 'INDATABLE' ]]; then
          indatables+=("$jeton")
        else
          muets+=("appareil ${jeton} — muet depuis ${heures} h (dernière sync ${vue_le})${missions:+ — mission(s) : ${missions}}")
        fi
        ;;
      *) : ;;
    esac
  done <<<"$resultat"
  # `reste` n'existe que pour absorber un éventuel champ surnuméraire : le lire
  # évite qu'un `|` inattendu ne décale silencieusement les colonnes.
  : "${reste:-}"

  case "$total_lignes" in '' | *[!0-9]*) total_lignes=0 ;; esac
  case "$missions_actives" in '' | *[!0-9]*) missions_actives=0 ;; esac

  if [[ "${#indatables[@]}" -gt 0 ]]; then
    aveugler 'sync-indatable' "${#indatables[@]} appareil(s) dont AUCUNE ligne de sync_log ne porte d'horodatage : $(joindre ', ' "${indatables[@]}"). Leur silence est indécidable"
  fi

  if [[ "${#muets[@]}" -gt 0 ]]; then
    local liste
    liste="$(joindre ' ; ' "${muets[@]:0:10}")"
    [[ "${#muets[@]}" -gt 10 ]] && liste="$liste ; … et $((${#muets[@]} - 10)) autre(s)"
    signaler 'sync' "SYNC MUETTE — seuil ${ALERT_SYNC_SILENT_HOURS} h dépassé par ${#muets[@]} appareil(s) : ${liste}. Ces appareils portent peut-être les SEULES copies de la collecte du jour (invariant 8). Relevé le ${TS}."
    return 0
  fi

  if [[ "$total_lignes" -eq 0 ]]; then
    # NI VERT NI SILENCE. Deux mondes très différents produisent une table vide :
    # « rien à surveiller » et « la synchronisation ne fonctionne plus du tout ».
    # Ce que la sonde SAIT trancher, c'est l'existence de missions actives.
    if [[ "$missions_actives" -gt 0 ]]; then
      signaler 'sync' "SYNC MUETTE — AUCUNE synchronisation n'a JAMAIS été enregistrée alors que ${missions_actives} mission(s) sont ouvertes. Soit la remontée terrain n'a jamais fonctionné, soit elle n'est pas encore livrée (lot L6). Relevé le ${TS}."
      return 0
    fi
    axion_log "Sync : la table sync_log est vide et aucune mission n'est ouverte — RIEN À SURVEILLER. Ce n'est PAS un « tout va bien » : cette table n'a aucun écrivain avant le lot L6."
    return 0
  fi

  retablir 'sync' "Sync : aucun appareil muet au-delà de ${ALERT_SYNC_SILENT_HOURS} h (${total_lignes} ligne(s) de sync_log)."
}

# =============================================================================
# CONTRÔLE 4 — JOB LLM TROP LONG (ALERT_LLM_JOB_MAX_MINUTES, « job LLM > 5 min »)
#
# ── OÙ VIT LA DONNÉE, ET CE QU'ELLE NE DIT PAS ──────────────────────────────
# La seule trace persistante d'un appel LLM est `llm_calls.duration_ms` (04,
# migration 0007). ⚠️ AUCUN CODE N'ÉCRIT ENCORE DANS CETTE TABLE : les appels LLM
# arrivent au lot L11, et la file BullMQ `llm` déclarée par `apps/worker` REJETTE
# aujourd'hui tout job (`processeurNonImplemente`).
#
# ⚠️ LIMITE DE FOND, à ne pas découvrir un soir de panne : `duration_ms` est écrit
# à la FIN de l'appel. Cette sonde voit donc les appels qui ont ÉTÉ trop longs,
# jamais celui qui est BLOQUÉ EN CE MOMENT — c'est-à-dire le cas que le §11.3
# vise probablement. Voir l'état des jobs EN VOL demande de lire les structures
# internes de BullMQ dans Redis ; c'est une pièce distincte, elle n'est pas
# arbitrée, et la fabriquer ici pour « faire complet » aurait produit exactement
# ce que cette fiche corrige : du code qui a l'air d'un garde-fou.
# Ce contrôle est donc VRAI mais PARTIEL, et le dit.
# =============================================================================
controle_job_llm() {
  if ! seuil_valide ALERT_LLM_JOB_MAX_MINUTES; then
    aveugler 'job-llm' "ALERT_LLM_JOB_MAX_MINUTES absent ou non entier (« ${ALERT_LLM_JOB_MAX_MINUTES:-} ») — voir .env.example"
    return 0
  fi
  if [[ -z "${POSTGRES_USER:-}" || -z "${POSTGRES_DB:-}" ]]; then
    aveugler 'job-llm' "POSTGRES_USER ou POSTGRES_DB absent du fichier d'environnement"
    return 0
  fi

  local requete resultat
  requete=$(
    cat <<SQL
SELECT count(*)::text,
       coalesce(max(round(duration_ms / 60000.0, 1))::text, ''),
       coalesce(
         (SELECT coalesce(mission_id::text, 'hors mission')
            FROM llm_calls
           WHERE duration_ms > ${ALERT_LLM_JOB_MAX_MINUTES} * 60000
             AND created_at > now() - make_interval(hours => ${INTERVALLE_H})
           ORDER BY duration_ms DESC
           LIMIT 1), ''),
       coalesce(
         (SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            FROM llm_calls
           WHERE duration_ms > ${ALERT_LLM_JOB_MAX_MINUTES} * 60000
             AND created_at > now() - make_interval(hours => ${INTERVALLE_H})
           ORDER BY duration_ms DESC
           LIMIT 1), '')
  FROM llm_calls
 WHERE duration_ms > ${ALERT_LLM_JOB_MAX_MINUTES} * 60000
   AND created_at > now() - make_interval(hours => ${INTERVALLE_H});
SQL
  )

  if ! resultat="$(sonde_sql "$requete" 2>&1)"; then
    aveugler 'job-llm' "interrogation de PostgreSQL impossible ($(printf '%s' "$resultat" | tr '\n' ' ' | cut -c1-200))"
    return 0
  fi

  local nombre minutes mission quand
  IFS='|' read -r nombre minutes mission quand <<<"$(printf '%s\n' "$resultat" | head -n1)"
  case "${nombre:-}" in '' | *[!0-9]*) nombre=0 ;; esac

  if [[ "$nombre" -gt 0 ]]; then
    signaler 'job-llm' "JOB LLM TROP LONG — ${nombre} appel(s) au-delà de ${ALERT_LLM_JOB_MAX_MINUTES} min sur les ${INTERVALLE_H} dernières heures. Le plus long : ${minutes} min, mission ${mission}, le ${quand}. (Un job ENCORE bloqué reste invisible : voir l'encadré du contrôle 4.) Relevé le ${TS}."
    return 0
  fi
  retablir 'job-llm' "Job LLM : aucun appel au-delà de ${ALERT_LLM_JOB_MAX_MINUTES} min sur les ${INTERVALLE_H} dernières heures (relevé POST HOC — un job bloqué n'y figure pas)."
}

# =============================================================================
# UNE PASSE
# =============================================================================
passe() {
  # Remise à zéro OBLIGATOIRE : en mode `pile` ce processus vit des semaines.
  ALERTES=()
  AVEUGLEMENTS=()
  VERTS=()
  SANS_OBJET=()
  TS="$(axion_ts)"

  axion_log "=== Sonde d'alertes — début ($TS · $APP_ENV · mode $MODE · seuils : $ENV_FILE) ==="

  controle_disque
  controle_certificat
  controle_sync
  controle_job_llm

  # LE MARQUEUR DE VIVACITÉ — il est écrit APRÈS les quatre contrôles, donc il
  # atteste d'une passe TERMINÉE, pas d'un processus qui respire. C'est sur lui
  # que s'appuie la sonde de santé du conteneur (compose Coolify) : un service
  # `Up 6 days` dont plus aucune passe ne se termine est exactement la panne
  # silencieuse que `sauvegarde-healthcheck.sh` attrape sur le même chemin.
  : >"$ETAT_DIR/.derniere-passe"

  axion_log "--- Bilan : ${#VERTS[@]} vert(s) · ${#ALERTES[@]} alerte(s) · ${#AVEUGLEMENTS[@]} aveuglement(s) · ${#SANS_OBJET[@]} sans objet ---"

  if [[ "${#ALERTES[@]}" -gt 0 ]]; then
    axion_log "=== Sonde d'alertes — passe TERMINÉE AVEC ALERTES ==="
    return 1
  fi
  if [[ "${#AVEUGLEMENTS[@]}" -gt 0 ]]; then
    axion_log "=== Sonde d'alertes — passe TERMINÉE AVEC AVEUGLEMENTS (des contrôles n'ont PAS eu lieu) ==="
    return 2
  fi
  axion_log "=== Sonde d'alertes — passe TERMINÉE, tous les contrôles exécutés et verts ==="
  return 0
}

# =============================================================================
# DÉCLENCHEMENT
# =============================================================================

# Secondes jusqu'à la prochaine occurrence de `MINUTE_DE_PASSE`. RECALCULÉ à
# chaque tour depuis l'horloge murale, jamais accumulé : `sauvegarde.sh` a payé
# une dérive de `sleep` en 2026-08-28, la leçon est reprise ici.
secondes_avant_passe() {
  local maintenant minute_courante delta
  maintenant="$(date -u +%s)"
  minute_courante=$(((maintenant / 60) % 60))
  delta=$(((MINUTE_DE_PASSE - minute_courante + 60) % 60))
  [[ "$delta" -eq 0 ]] && delta=60
  echo $((delta * 60 - maintenant % 60))
}

if [[ "$MODE" == 'pile' ]]; then
  case "$MINUTE_DE_PASSE" in
    '' | *[!0-9]*) axion_die "AXION_SONDE_MINUTE invalide (« $MINUTE_DE_PASSE ») — un entier de 0 à 59 est attendu." ;;
  esac
  [[ "$MINUTE_DE_PASSE" -le 59 ]] || axion_die "AXION_SONDE_MINUTE hors bornes (« $MINUTE_DE_PASSE »)."

  axion_log "Service de sonde démarré — une passe par heure à la minute ${MINUTE_DE_PASSE} (UTC), transport d'alerte : $(axion_transport_notification)."

  # PREMIÈRE PASSE IMMÉDIATE, et ce n'est pas du confort : une pile fraîchement
  # déployée n'a aucune raison d'attendre jusqu'à une heure avant de découvrir
  # qu'un disque est plein ou qu'aucun appareil ne synchronise. C'est le même
  # geste que le « rattrapage » de `sauvegarde.sh`.
  #
  # `|| true` : UNE PASSE QUI ALERTE N'EST PAS UNE PANNE DU SERVICE. Sans lui,
  # `set -e` ferait sortir le processus, Docker redémarrerait le conteneur, et
  # chaque redémarrage rejouerait une passe — c'est-à-dire une tempête de
  # messages sur le canal exactement le jour où quelque chose ne va pas. Le
  # service ne meurt que sur ce qu'il ne sait pas faire (voir `axion_die`).
  passe || true
  while true; do
    attente="$(secondes_avant_passe)"
    case "$attente" in
      '' | *[!0-9]*) axion_die "délai avant la prochaine passe incalculable (« $attente »)." ;;
    esac
    sleep "$attente"
    passe || true
  done
fi

passe && exit 0
exit $?
