# =============================================================================
# infra/caddy/Dockerfile — CADDY AVEC SA CONFIGURATION EMBARQUÉE.
# Construit UNIQUEMENT par infra/docker-compose.coolify.yml (contexte
# `infra/caddy/`). Les piles lancées à la main (docker-compose.yml, .staging.yml,
# .prod.yml) continuent d'utiliser `caddy:2-alpine` tel quel et de MONTER leur
# configuration depuis le dépôt : ce fichier ne les concerne pas.
#
# Applique : 11 §2 (domaine unique, pas de CORS), 06 §10.2 (en-têtes de
# sécurité), 11 §1 (version épinglée `caddy:2-alpine`).
# =============================================================================
#
# ┌───────────────────────────────────────────────────────────────────────────┐
# │ POURQUOI EMBARQUER PLUTÔT QUE MONTER.                                     │
# │ Coolify réécrit tout montage de fichier relatif vers son propre dossier   │
# │ persistant `/data/coolify/applications/<uuid>/`, où il ne dépose que      │
# │ `docker-compose.yaml` et `.env` — JAMAIS les fichiers du dépôt cloné.     │
# │ La source n'existant pas, Docker crée un RÉPERTOIRE VIDE à sa place, et   │
# │ Caddy recevrait un dossier là où il attend son Caddyfile.                 │
# │ Constaté sur `postgresql.custom.conf` (déploiement wrunr6mwq2oxqq392i4myzjn,│
# │ 2026-08-28) : « input in flex scanner failed … line 1 ».                  │
# │ Voir l'encadré « CONFIGURATION EMBARQUÉE » de docker-compose.coolify.yml. │
# │                                                                           │
# │ ⚠️ CE QUE ÇA COÛTE : la configuration de Caddy N'EST PLUS MODIFIABLE SANS │
# │ RECONSTRUIRE L'IMAGE. Éditer le Caddyfile et redémarrer le conteneur      │
# │ n'a plus aucun effet sur cette pile.                                      │
# └───────────────────────────────────────────────────────────────────────────┘

FROM caddy:2-alpine

# Le routeur : /api → API, /hq → console, / → PWA terrain, sous le MÊME domaine.
COPY Caddyfile /etc/caddy/Caddyfile

# Le SEUL mode de service valable ici : `root` + `file_server` + repli SPA sur
# les volumes où les jobs one-shot `field`/`hq` ont déposé leur build.
# `CADDY_FRONT_CONFIG` est figée à ce chemin dans le compose (jamais lue depuis
# l'environnement), donc l'`import` du Caddyfile ne peut désigner que ce fichier.
COPY fronts.static.caddy /etc/caddy/fronts.static.caddy

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ `fronts.dev.caddy` N'EST DÉLIBÉRÉMENT PAS COPIÉ.                          │
# │ Il fait du `reverse_proxy` vers des serveurs Vite qui n'existent pas ici : │
# │ aucun conteneur `field`/`hq` ne tourne en staging, ce sont des jobs qui    │
# │ déposent un build et sortent. L'embarquer n'offrirait aucun repli utile —  │
# │ seulement la possibilité de mettre tout le site en 502 en croyant          │
# │ « basculer en mode debug ». Ne pas l'ajouter.                              │
# └───────────────────────────────────────────────────────────────────────────┘

# VALIDATION AU BUILD — échouer ici plutôt qu'au démarrage sur le serveur.
# Les variables ci-dessous ne sont PAS la configuration d'exécution : ce sont les
# valeurs que le compose imposera de toute façon, posées le temps de l'analyse
# pour que `{$…}` ne rende pas une adresse de site vide (Caddy refuserait alors
# de démarrer). Elles ne subsistent pas dans l'image : `RUN VAR=… cmd` ne pose
# rien de durable, contrairement à `ENV`.
#
# CE QUE CETTE GARDE ATTRAPE, ET CE QU'ELLE N'ATTRAPE PAS — vérifié par
# injection (2026-08-28), pas supposé :
#   · directive inconnue, bloc mal fermé, `import` introuvable → BUILD ROUGE ;
#   · upstream absurde mais syntaxiquement valide (`reverse_proxy {{ CASSE`)
#     → build VERT. `caddy validate` analyse la CONFIGURATION, il ne joint
#     aucun upstream et ne vérifie aucune racine de fichiers.
# Autrement dit : une image qui se construit a une config ANALYSABLE, ce qui
# n'est pas la même chose qu'une config JUSTE. Ne pas lire ce `RUN` comme une
# garantie de bon fonctionnement.
RUN CADDY_SITE_ADDRESS=':8080' \
    CADDY_STAGING_SITE_ADDRESS=':8081' \
    API_PORT='3000' \
    CADDY_FRONT_CONFIG='/etc/caddy/fronts.static.caddy' \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# L'ENTRYPOINT et la CMD de l'image officielle sont conservés : ils lancent
# `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`.
