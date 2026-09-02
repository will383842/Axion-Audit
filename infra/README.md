# `infra/` — RUNBOOK D'EXPLOITATION AXION AUDIT

> **Ce fichier a été confronté à la machine le 2026-08-28** (mesures entre 06h35 et 06h50 UTC,
> depuis le poste de développement, en lecture seule, par A57).
> Tout ce qui suit porte l'une de ces trois marques, et jamais rien d'autre :
>
> | Marque           | Signification                                                                           |
> | ---------------- | --------------------------------------------------------------------------------------- |
> | **MESURÉ**       | commande passée sur `axionia-web`, sortie relevée, reproduite ici                       |
> | **JAMAIS JOUÉE** | la procédure existe dans le dépôt, elle n'a **jamais** été exécutée : rien n'est acquis |
> | **NON VÉRIFIÉ**  | ni mesuré, ni joué — écrit tel quel pour que personne ne s'y fie                        |
>
> **Un runbook qui annonce plus qu'il ne fait est un défaut grave.** La version précédente de ce
> fichier décrivait `/opt/axion-audit` comme la racine de déploiement du staging : **ce répertoire
> n'existe pas sur la machine**. Le point 25 du gardien A02 portait sur cela ; ce fichier est la
> réponse.

---

## ⛔ LIRE CECI AVANT TOUT — IL Y A DEUX MONDES, ET UN SEUL EXISTE

| &nbsp;                   | **Le staging D'AUJOURD'HUI**                                  | **Le chemin « VPS dédié » du pack**                 |
| ------------------------ | ------------------------------------------------------------- | --------------------------------------------------- |
| Existe ?                 | **OUI — MESURÉ, il tourne**                                   | **NON — rien n'a jamais été déployé ainsi**         |
| Qui déploie              | **Coolify v4** (API + clone git + build sur le serveur)       | `infra/scripts/deploy.sh` par SSH                   |
| Où vivent les fichiers   | `/data/coolify/applications/<uuid>/` — **choisi par Coolify** | `/opt/axion-audit/` — **ABSENT de `axionia-web`**   |
| Frontal / TLS            | Traefik (`coolify-proxy`), qui possède 80/443                 | notre Caddy                                         |
| Fichier compose          | `infra/docker-compose.coolify.yml` (autoportant)              | `docker-compose.yml` + `.staging.yml` / `.prod.yml` |
| Scripts `infra/scripts/` | **AUCUN ne s'applique** (§6)                                  | ce sont les leurs                                   |
| Sauvegardes              | **complète + restauration JOUÉES le 2026-08-28** (§5)         | 4 tâches `cron` **décrites, JAMAIS JOUÉES** (§7.4)  |
| Où vit la sauvegarde     | service `sauvegarde` DANS le compose (pas d'accès hôte)       | `install-cron.sh` sur l'HÔTE, hors compose (§7.4)   |

**Sections à lire selon ce que vous cherchez :**

| Vous cherchez…                                             | Allez au…                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| La confrontation « ce que disait ce fichier » ↔ la machine | **§1**                                                                   |
| Le staging réel : chemins, noms, réseaux, conventions      | **§4** (tout est MESURÉ)                                                 |
| L'état de la sauvegarde et de la restauration              | **§5** — sauvegarde ✅, restauration **jouée** ✅, copie hors serveur 🔴 |
| Ce que valent les scripts `infra/scripts/*.sh`             | **§6**                                                                   |
| Le développement local                                     | **§3**                                                                   |
| Le chemin « VPS dédié » (prod future)                      | **§7** — intégralement **JAMAIS JOUÉ**                                   |
| Les conditions de cohabitation avec `axion-ia.com`         | `infra/COHABITATION_AXIONIA_WEB.md`                                      |
| Les arbitrages Coolify (Traefik, build serveur)            | `DECISIONS.md`, entrées du **2026-08-28**                                |
| Les garde-fous nés des déploiements ratés                  | `AMELIORATIONS.md`, fiche du **2026-08-28**                              |

---

## 1. CONFRONTATION À LA MACHINE — affirmation, mesure, verdict

Méthode : `ssh axionia-web '<commande>'` depuis le poste de développement, 2026-08-28 ~06h40 UTC.
**Attention à la forme de la commande SSH** : `ssh root@<IP_AXIONIA_WEB>` échoue
(`Permission denied (publickey)`) ; c'est l'alias `axionia-web` de `~/.ssh/config` qui porte la clé
`~/.ssh/axion_audit_ed25519`. Équivalent explicite :
`ssh -i ~/.ssh/axion_audit_ed25519 -o IdentitiesOnly=yes root@<IP_AXIONIA_WEB>`.

| Ce que ce fichier affirmait                                                          | Commande                                                                                    | Ce que dit la machine                                                                                              | Verdict                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `/opt/axion-audit` est la racine d'exploitation                                      | `ls -la /opt`                                                                               | `axion-ia`, `containerd`. **Pas d'`axion-audit`**                                                                  | **FAUX** — corrigé §4.1                                    |
| `/opt/axion-audit/<env>/.env` porte les secrets                                      | `ls /opt/axion-audit`                                                                       | `No such file or directory`                                                                                        | **FAUX** — corrigé §4.1                                    |
| `pnpm infra:restore-test` → `/opt/axion-audit/prod/.env`                             | lecture de `package.json` + `ls`                                                            | chemin inexistant ; script corrigé, voir §6.1                                                                      | **FAUX** — corrigé                                         |
| Le dépôt est cloné dans `/opt/axion-audit/repo`                                      | `ls -d /root/axion* /srv/axion* /home/*/axion*`                                             | **aucune copie du dépôt sur le serveur**                                                                           | **FAUX** — §4.5                                            |
| `/var/backups/axion` reçoit les sauvegardes                                          | `ls -la /var/backups/axion`                                                                 | `No such file or directory`                                                                                        | **FAUX** — §5                                              |
| `/var/log/axion` reçoit les rapports horodatés                                       | `ls -la /var/log/axion`                                                                     | `No such file or directory`                                                                                        | **FAUX** — §5                                              |
| `/etc/cron.d/axion-audit` planifie les 4 tâches                                      | `cat /etc/cron.d/axion-audit` · `ls /etc/cron.d`                                            | absent ; `/etc/cron.d` ne contient que `e2scrub_all` et `sysstat`                                                  | **FAUX** — §5                                              |
| Le magasin TLS et les archives sont poussés sur une Storage Box                      | `ls -la /root/.ssh/`                                                                        | seul `authorized_keys` — **aucune clé `storagebox_ed25519`**                                                       | **FAUX** — §5                                              |
| La copie hors Hetzner se fait par `rclone`                                           | `command -v rclone`                                                                         | **ABSENT** (`gpg`, `curl`, `openssl`, `sha256sum`, `rsync` sont présents)                                          | **FAUX** — §5                                              |
| Volumes du staging nommés `axion-coolify-*`                                          | `docker volume ls`                                                                          | **aucun** `axion-coolify-*` ; les vrais sont `wrunr6mwq2oxqq392i4myzjn_*`                                          | **FAUX** — §4.3, convention 5                              |
| Volume `axion-staging-field-dist` / `-hq-dist`, réseau `axion-edge-staging`          | `docker volume ls` · `docker network ls`                                                    | **aucun des trois n'existe** (ce sont les noms du montage « VPS dédié »)                                           | **FAUX pour le staging**                                   |
| `provision-vps.sh` a créé l'arborescence et les deux `.env`                          | `ls /opt` (ci-dessus)                                                                       | rien de tout cela ; le script n'a **jamais** tourné sur cette machine                                              | **VRAI mais trompeur** — il **ne doit pas** y tourner, §7  |
| L'unique Caddy de prod sert les deux environnements sur 80/443                       | `docker ps` (colonne `PORTS`)                                                               | 80/443 appartiennent à `coolify-proxy` (Traefik). Notre Caddy **ne publie aucun port**                             | **FAUX pour le staging**                                   |
| `https://audit-staging.<domaine>/api/v1/health` → 200                                | `getent hosts audit-staging.axion-ia.com`                                                   | **non résolu** — l'enregistrement DNS n'existe pas                                                                 | **FAUX** — §4.6                                            |
| Le staging est joignable publiquement                                                | `curl -o /dev/null -w '%{http_code}' http://<uuid>.<IP_AXIONIA_WEB>.sslip.io/api/v1/health` | **404** à 06h41, **504** à 06h47 (redéploiement en cours par un autre agent)                                       | **FAUX à l'heure du relevé** — §4.6                        |
| §5.3 : `pgbackrest --stanza=axion stanza-create` puis `check` réussissent            | `docker exec --user postgres <pg> pgbackrest --stanza=axion info`                           | la stanza **existe**, mais `status: error (no valid backups)` **à 06h40** — `status: ok` depuis 07h24 (§5.1)       | **PARTIELLEMENT VRAI au relevé, CORRIGÉ depuis** — §5.1    |
| L'archivage WAL fonctionne réellement (`failed_count = 0`)                           | `psql -U axion -d axion_audit -c 'SELECT … FROM pg_stat_archiver;'`                         | `archived_count=3`, `failed_count=0`, `last_archived_wal=000000010000000000000003`                                 | **VRAI — et c'est le seul point de sauvegarde qui tienne** |
| §5.3 : la commande de contrôle s'écrit `psql` sans `-U`                              | même commande                                                                               | `FATAL: role "postgres" does not exist` — le rôle est **`axion`**                                                  | **FAUX** — corrigé §4.4                                    |
| §2 bis : les fronts sont des jobs one-shot qui sortent en 0, Caddy sert les fichiers | `docker ps -a --filter label=coolify.resourceName=axion-audit-staging`                      | `field` et `hq` : `Exited (0)` ; `caddy` : `Up (healthy)` ; montages `…_field-dist:/srv/principal/field`           | **VRAI — le README avait raison**                          |
| §2 bis : `hq` sur le port interne **5174**, `api` sur `${API_PORT}` (3000)           | `docker ps` (colonne `PORTS`) · `.env`                                                      | `api` expose `3000/tcp` ; `API_PORT=3000` présent dans le `.env` du staging                                        | **VRAI**                                                   |
| La posture de sécurité (CSP, HSTS, `nosniff`…) est appliquée identiquement           | `docker exec <caddy> wget -qO- --server-response http://localhost:8080/api/v1/health`       | 200 + CSP complète, HSTS `max-age=31536000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `Via: 1.1 Caddy` | **VRAI — le README avait raison**                          |
| Aucun port de données n'est publié (5432/6379/9000)                                  | `docker ps` (colonne `PORTS`)                                                               | `postgres 5432/tcp`, `redis 6379/tcp`, `minio 9000/tcp` — **exposés, jamais publiés** (pas de `0.0.0.0:`)          | **VRAI**                                                   |
| Le `.env` est en `root:root` `chmod 600`                                             | `stat -c '%n %U:%G %a' …/.env`                                                              | `root:root` **644** — et le répertoire parent est `755`                                                            | **FAUX** — §4.1, écart ouvert                              |

**Deux points où le gardien avait tort, et il faut le dire aussi :**

1. **La stanza pgBackRest existe.** Le point de contrôle n°1 de la porte P-A n'est pas « jamais
   fait » : `pgbackrest --stanza=axion info` répond, le chiffrement `aes-256-cbc` est en place et
   **l'archivage WAL fonctionne sans un seul échec**. Ce qui manque est le `backup` lui-même (§5).
2. **Le §2 bis du README était exact** sur le service des fronts (jobs one-shot + `root`/`file_server`)
   et sur la posture de sécurité HTTP. Ces deux passages ont été mesurés et conservés tels quels.

---

## 2. Arborescence de `infra/` — VÉRIFIÉE `find infra -type f`

```
infra/
├── docker-compose.yml            pile de DÉV local (build local, hot reload)
├── docker-compose.staging.yml    surcharge staging du montage « VPS dédié » — NON UTILISÉE (§7)
├── docker-compose.prod.yml       surcharge prod du montage « VPS dédié »    — NON UTILISÉE (§7)
├── docker-compose.coolify.yml    ← LA PILE RÉELLEMENT DÉPLOYÉE EN STAGING. AUTOPORTANTE.
│                                   Ne pas modifier sans lire ses quatre encadrés d'en-tête.
├── COHABITATION_AXIONIA_WEB.md   les 4 conditions de la cohabitation avec axion-ia.com
├── caddy/Caddyfile               2 blocs de site (principal + staging), sécurité, CSP
├── caddy/Dockerfile              image Caddy du projet (config EMBARQUÉE — §4.3, convention 4)
├── caddy/fronts.dev.caddy        fronts en DEV  : reverse_proxy vers Vite
├── caddy/fronts.static.caddy     fronts en PROD : root + file_server + repli SPA
├── postgres/Dockerfile           PostgreSQL 16 + pgBackRest (+ cible `config-embarquee`)
├── postgres/postgresql.custom.conf  archive_mode, wal_level, UTC
├── postgres/healthcheck.sh       sonde du conteneur postgres
├── postgres/stanza-create.sh     création de la stanza pgBackRest
├── postgres/sauvegarde.sh        service PLANIFIÉ : pgbackrest backup + archive MinIO chiffrée (§5.3)
├── pgbackrest/pgbackrest.conf    dépôt chiffré, rétention
├── README.md                     ← ce runbook
└── scripts/                      ← TOUS écrits pour le montage « VPS dédié ». Voir §6.
    ├── lib/common.sh             fonctions partagées (log, alerte, chargement du .env)
    ├── provision-vps.sh          durcissement Ubuntu — NE JAMAIS EXÉCUTER SUR axionia-web
    ├── deploy.sh                 pull → migration garde-fou → up -d → smoke → rollback
    ├── smoke-test.sh             santé API + écriture/lecture PG, MinIO, Redis
    ├── backup-postgres.sh        pg_dump 6 h + pgBackRest + Storage Box + hors Hetzner
    ├── backup-minio.sh           mc mirror + archive chiffrée + Storage Box
    ├── backup-caddy.sh           magasin TLS + Storage Box
    ├── restore-test.sh           test de restauration (critère L0)
    ├── sonde-alertes.sh          les 4 seuils ALERT_* (02 §11.3 + invariant 8), fiche O-2
    ├── install-cron.sh           planification des cinq tâches ci-dessus
    └── empreinte-docker.sh       empreinte des images
```

> `postgres/healthcheck.sh`, `postgres/stanza-create.sh` et `scripts/empreinte-docker.sh`
> manquaient à l'arborescence précédente. Ajoutés ici après `find`.

---

## 3. Développement local — la seule chose que `pnpm infra:*` sache faire

**État : PARTIELLEMENT JOUÉ.** Le démarrage a été joué et documenté (`DECISIONS.md`,
`docs/journal/`). **Le test de restauration local n'a jamais été joué** — voir §6.1.

```bash
cp .env.example .env          # JAMAIS commité — .env est gitignoré
# Remplacer les __CHANGEME__ par des valeurs LOCALES :
#   openssl rand -base64 32  (mots de passe)   ·  openssl rand -hex 64 (JWT)
#   openssl rand -hex 32     (APP_ENCRYPTION_KEY)
#   PUBLIC_BASE_URL=http://localhost:8080 · CADDY_SITE_ADDRESS=:8080
#   CADDY_STAGING_SITE_ADDRESS=:8081  (bloc inerte en local, mais OBLIGATOIRE :
#   une adresse de site vide empêcherait Caddy de démarrer)
#   CADDY_FRONT_CONFIG=/etc/caddy/fronts.dev.caddy
pnpm infra:up                 # = docker compose --env-file .env -f infra/docker-compose.yml up -d --wait
```

| Script                    | Ce qu'il fait vraiment                                          | Cible                          |
| ------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `pnpm infra:up`           | `up -d --wait` sur la pile de dév                               | **poste local uniquement**     |
| `pnpm infra:down`         | `down`                                                          | **poste local uniquement**     |
| `pnpm infra:logs`         | `logs -f`                                                       | **poste local uniquement**     |
| `pnpm infra:reset`        | `down -v` — **DONNÉES EFFACÉES**                                | **poste local uniquement**     |
| `pnpm infra:config`       | `config -q` (syntaxe seule, jamais l'existence des chemins)     | **poste local uniquement**     |
| `pnpm infra:restore-test` | voir **§6.1** — exige désormais un chemin de `.env` en argument | serveur, montage « VPS dédié » |

> **`pnpm infra:config` ne valide PAS `docker-compose.coolify.yml`**, et le valider avec la
> commande habituelle donnerait un faux résultat (répertoire de projet différent). La bonne
> commande est dans l'en-tête du fichier :
> `docker compose --project-directory . -f infra/docker-compose.coolify.yml config -q`.
> Ce que `config -q` ne dit jamais, c'est si les chemins **existent** : c'est le rôle de
> `pnpm check:compose-coolify` (`AMELIORATIONS.md`, 2026-08-28).

### Sortie attendue, service par service (pile de DÉV)

| Service         | État attendu   | Contrôle                                                       |
| --------------- | -------------- | -------------------------------------------------------------- |
| `postgres`      | `Up (healthy)` | `pg_isready` sur `axion_audit`                                 |
| `redis`         | `Up (healthy)` | `redis-cli ping` → `PONG` (authentifié)                        |
| `minio`         | `Up (healthy)` | `mc ready local` → OK                                          |
| `createbuckets` | `Exited (0)`   | log : `buckets et utilisateur applicatif restreint prets.`     |
| `api`           | `Up (healthy)` | `GET /v1/health` → 200                                         |
| `worker`        | `Up (healthy)` | battement Redis frais **+** un travailleur attaché aux 5 files |
| `field`         | `Up (healthy)` | Vite sert `/`                                                  |
| `hq`            | `Up (healthy)` | Vite sert `/hq/`                                               |
| `caddy`         | `Up (healthy)` | API d'admin locale répond                                      |

```bash
curl -i http://localhost:8080/api/v1/health   # 200 + JSON de santé
curl -i http://localhost:8080/                # 200, PWA terrain
curl -i http://localhost:8080/hq/             # 200, console siège
curl -sI http://localhost:8080/ | grep -i content-security-policy
```

> **`Up (healthy)` sur le `worker` n'a pas toujours voulu dire quelque chose.** Jusqu'au
> 2026-08-28, sa sonde était `pgrep -f node` : elle voyait le `tsc --watch` du lanceur de
> développement et restait verte pendant que le worker était **mort au démarrage**. La sonde
> actuelle (`apps/worker/src/sonde-sante.ts`) vérifie un battement écrit par le processus lui-même
> dans Redis **et** l'attachement d'un travailleur de CE conteneur à chacune des cinq files. Ce
> qu'elle ne prouve pas est écrit dans `apps/worker/README.md`. En cas de rouge :
> `docker inspect --format '{{json .State.Health}}' <conteneur worker>`.

### Deux modes de service des fronts, jamais mélangés

Arbitrage A01 du 2026-08-27 (`DECISIONS.md`), revue croisée B-7. **Le mode « staging/prod » de ce
tableau a été MESURÉ sur `axionia-web` (§1) : il est exact.**

|                            | **Développement local**   | **Staging et production**                                     |
| -------------------------- | ------------------------- | ------------------------------------------------------------- |
| Cible d'image `field`/`hq` | `dev`                     | `runtime`                                                     |
| Ce que fait le conteneur   | serveur Vite qui tourne   | **job one-shot** : copie `dist` dans `/sortie`, puis **sort** |
| `restart`                  | `unless-stopped`          | **`no`**                                                      |
| Sonde                      | HTTP sur 5173 / 5174      | **aucune**                                                    |
| Dépendance de Caddy        | `service_healthy`         | **`service_completed_successfully`**                          |
| Ce que fait Caddy          | `reverse_proxy` vers Vite | `root` + `file_server` + repli SPA                            |
| Fichier de config chargé   | `caddy/fronts.dev.caddy`  | `caddy/fronts.static.caddy`                                   |

**Pourquoi Caddy sert lui-même les fichiers.** Ce n'est pas l'économie d'un composant, c'est la
PWA : Caddy doit maîtriser lui-même le `Cache-Control` du service worker
(`no-cache, no-store, must-revalidate`) et le repli SPA (`try_files … /index.html`). La mise à jour
applicative et le démarrage hors ligne (invariant 1) dépendent exactement de ces en-têtes.

**Pourquoi aucune sonde sur les jobs.** Un conteneur sorti n'a pas de vivacité à mesurer. Une sonde
qui ne peut pas réussir est pire qu'une sonde absente : elle bloque indéfiniment tout ce qui en
dépend. Ce qui prouve le succès d'un job, c'est son **code de sortie** — ce que
`service_completed_successfully` vérifie.

**Fichiers obsolètes dans les volumes de build.** Le job fait `cp -a`, pas une synchronisation
destructive : les assets d'une version précédente restent en place. C'est **voulu** — un client qui
a chargé l'ancienne page peut encore récupérer ses fragments pendant la bascule. Le ménage se fait
en supprimant le volume et en redéployant, jamais pendant une journée de collecte.

---

## 3bis. Valider le `Caddyfile` avec le VRAI binaire — la recette verte, et les deux façons de la rater

**Personne n'avait jamais fait tourner `caddy validate` sur `infra/caddy/Caddyfile` avant le
2026-08-29.** Le garde `scripts/garde-fous-proxy-de-confiance.test.ts` est **lexical** : il lit le
fichier comme du texte. Il ne peut donc pas voir qu'un fichier syntaxiquement faux a été écrit — et
c'est exactement par ce trou qu'est passée la forme `trusted_proxies static 10.0.1.0/24` **dans un
bloc `reverse_proxy`**, que Caddy REFUSE (`invalid IP address: 'static'` — `static` est le mot-clé
de l'option _globale_ `servers`, pas du sous-directive). Un `Caddyfile` faux ne se découvre alors
qu'au déploiement, quand le conteneur ne démarre pas.

### La recette (mesurée verte le 2026-08-29, `caddy:2-alpine` v2.11.4)

```bash
docker run --rm -v "$PWD/infra/caddy:/etc/caddy:ro" \
  -e CADDY_FRONT_CONFIG=/etc/caddy/fronts.static.caddy \
  -e CADDY_SITE_ADDRESS=:8080 \
  -e CADDY_STAGING_SITE_ADDRESS=:8081 \
  -e API_PORT=3000 \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
# → "Valid configuration", exit 0
```

Le **mode dev** se valide avec le même jeu, en changeant la seule variable qui le désigne :
`-e CADDY_FRONT_CONFIG=/etc/caddy/fronts.dev.caddy` → également vert. Les deux modes méritent d'être
validés : `fronts.dev.caddy` n'est pas embarqué dans l'image, mais il est utilisé en local.

### Les deux façons de rater cette commande, et ce qu'elles signifient

| Symptôme                                                                                                                      | Cause                                                                  | Ce n'est PAS                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `Error: … 'import', at /etc/caddy/Caddyfile:153`                                                                              | seul le `Caddyfile` est monté ; il fait `import {$CADDY_FRONT_CONFIG}` | un défaut du fichier                  |
| `Error: adapting config using caddyfile: server block without any key is global configuration, and if used, it must be first` | **une variable d'adresse de site est vide**                            | **un défaut d'ordre dans le fichier** |

La seconde mérite une explication, parce que son message désigne un tout autre problème que le sien.
Le fichier ouvre ses blocs par `{$CADDY_SITE_ADDRESS} {` et `{$CADDY_STAGING_SITE_ADDRESS} {`. Si la
variable est vide, la ligne se réduit à `{` — que Caddy lit comme un **bloc d'options globales**, or
il y en a déjà un en tête de fichier, et il doit être premier. **Le message parle d'ordre ; la cause
est une variable manquante.** Isolé pas à pas :

| Variables fournies             | `validate`                                                |
| ------------------------------ | --------------------------------------------------------- |
| `CADDY_FRONT_CONFIG` seul      | exit 1 — « server block without any key »                 |
| `+ CADDY_SITE_ADDRESS`         | exit 1 — **même erreur** (le second bloc est encore vide) |
| `+ CADDY_STAGING_SITE_ADDRESS` | **exit 0**                                                |

Le `Caddyfile` le dit d'ailleurs déjà, à propos du bloc de staging : « La variable est néanmoins
OBLIGATOIRE : une adresse de site vide empêcherait Caddy de démarrer. » C'était écrit ; ça n'avait
jamais été éprouvé.

### Le piège qui reste, et que `validate` NE VOIT PAS

`API_PORT` **n'est pas nécessaire** pour obtenir un vert : absent, Caddy adapte silencieusement
l'upstream en `axion-api:80` au lieu de `axion-api:3000`, et valide. Un `.env` de production qui
oublierait `API_PORT` produirait donc un Caddy parfaitement « valide » qui rend des 502.
Mesuré :

```bash
# sans API_PORT
caddy adapt … | grep -o '"dial":"[^"]*"'   # → "dial":"axion-api:80"   (et validate = exit 0)
# avec API_PORT=3000
caddy adapt … | grep -o '"dial":"[^"]*"'   # → "dial":"axion-api:3000"
```

**Conséquence pour la CI : valider ne suffit pas, il faut AFFIRMER SUR LA CONFIG ADAPTÉE.**
`caddy adapt` rend le JSON réellement chargé ; c'est lui qui porte les propriétés qu'on veut garder :

```bash
caddy adapt --config /etc/caddy/Caddyfile 2>/dev/null | grep -o '"trusted_proxies":\[[^]]*\]'
# → "trusted_proxies":["10.0.1.0/24"]   DEUX fois (un bloc de prod, un bloc de staging)
```

> ⚠️ La clé JSON est un **tableau simple** (`"trusted_proxies":["10.0.1.0/24"]`), et non
> `{"source":"static","ranges":[…]}` — cette seconde forme est celle de l'option _globale_. Chercher
> `"ranges"` dans la config adaptée ne rend rien et ferait conclure à tort que la directive est
> absente.

### Où cette vérification doit vivre — pas dans la suite unitaire

`vitest.config.ts` grave qu'un test unitaire tourne **sans service**, et un `@critique` ne se skippe
jamais (CLAUDE.md §5) : une assertion qui exige Docker ne peut donc pas y entrer sans créer soit un
skip conditionnel interdit, soit un rouge sur toute machine sans Docker.

Sa place est le job **`shellcheck`** de `.github/workflows/ci.yml` — celui qui porte déjà
« Valider la syntaxe des fichiers docker compose », sous le commentaire _« Le fichier compose EST de
l'infrastructure exécutable : une faute de syntaxe s'y découvre en CI, pas au moment du
déploiement. »_ Le `Caddyfile` est exactement le même genre d'objet, et le job dispose déjà de Docker.

**Échec fermé, obligatoire.** Une étape qui passerait parce que Caddy est absent serait un garde qui
ment. Le job a déjà le motif à recopier (`if ! command -v shellcheck …; then exit 1; fi`) :

```bash
set -euo pipefail
docker pull "$IMAGE_CADDY" || { echo "::error::Image Caddy indisponible — vérification impossible."; exit 1; }
docker run --rm -v "$PWD/infra/caddy:/etc/caddy:ro" … "$IMAGE_CADDY" caddy validate …; RC=$?
[ "$RC" -eq 0 ] || { echo "::error::Caddyfile invalide."; exit 1; }
```

Le code de retour est **capturé dans une variable**, jamais lu en bout de tube : `caddy validate | grep`
rendrait le code de `grep`.

**Épingler l'image.** `caddy:2-alpine` est un tag mouvant ; 11 §1 gèle les versions. Au 2026-08-29 il
pointe la MÊME version que le conteneur en service — `v2.11.4`, vérifié des deux côtés —
digest `caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`. Une CI qui
valide contre une autre version que celle déployée ne valide pas ce qui tourne.

---

## 4. LE STAGING TEL QU'IL EST — tout ce qui suit est MESURÉ

> **`<IP_AXIONIA_WEB>` — placeholder, pas une valeur perdue.** Le dépôt est **public** (décision du
> 2026-08-27, qui débloque la protection de branche gratuitement). L'adresse IPv4 d'`axionia-web` a
> donc été retirée de la documentation versionnée le 2026-08-28 et remplacée partout par ce marqueur.
> **Où lire la valeur réelle** : secret GitHub `COOLIFY_URL`, variable GitHub `STAGING_BASE_URL`, ou
> `ssh axionia-web 'hostname -I'`.
> **Ce que ce retrait ne fait PAS** : l'URL de staging est en `sslip.io`, forme qui **encode l'IP par
> construction** — l'adresse reste déductible de toute machine qui atteint le staging. C'est de
> l'hygiène de dépôt, pas une mesure de sécurité. La mesure qui compte est de mettre la console
> Coolify du port 8000 derrière TLS et une restriction d'accès ; elle est **ouverte sur Internet en
> HTTP non chiffré** à la date de ce commit.

Hôte : `axionia-web` / `<IP_AXIONIA_WEB>`, Ubuntu, noyau `6.8.0-124-generic`
(`ssh axionia-web 'hostname; uname -a'`).
Cette machine héberge **aussi la production `axion-ia.com`**. Voir
`infra/COHABITATION_AXIONIA_WEB.md` avant toute manœuvre.

Identifiants Coolify (non secrets, déjà tracés dans `DECISIONS.md` 2026-08-28) :
console `http://<IP_AXIONIA_WEB>:8000` · serveur `l877luxxpv1mx96sss7tc6zj` · projet `axion-audit` ·
ressource `axion-audit-staging` · **uuid d'application `wrunr6mwq2oxqq392i4myzjn`**.

**Cet uuid est le préfixe de tout.** Il apparaît ci-dessous dans les noms de conteneurs, de volumes
et d'un réseau. Il est noté `<uuid>` quand la forme compte plus que la valeur.

### 4.1 Où Coolify range réellement les fichiers

```bash
ssh axionia-web 'ls -la /data/coolify/applications/wrunr6mwq2oxqq392i4myzjn'
```

```
drwxr-xr-x 5 root root  4096  caddy/          ← RÉPERTOIRES VIDES créés par Docker (voir convention 4)
-rw-r--r-- 1 root root 30883  docker-compose.yaml   ← LE COMPOSE RÉELLEMENT APPLIQUÉ (rendu par Coolify)
-rw-r--r-- 1 root root  2464  .env                  ← LES SECRETS DU STAGING
drwxr-xr-x 5 root root  4096  infra/          ← idem, vides
drwxr-xr-x 3 root root  4096  pgbackrest/     ← idem, vides
drwxr-xr-x 3 root root  4096  postgres/       ← idem, vides
-rw-r--r-- 1 root root    79  README.md       ← posé par Coolify : nom de ressource + date du dernier déploiement
```

| Ce que le pack demande          | Ce qu'il y a réellement                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `/opt/axion-audit/staging/.env` | `/data/coolify/applications/wrunr6mwq2oxqq392i4myzjn/.env`         |
| une copie du dépôt              | **aucune** — Coolify clone dans un conteneur d'assistance éphémère |
| `.env` en `root:root` `600`     | `root:root` **644**, répertoire parent `755`                       |

> **⚠️ ÉCART DE SÉCURITÉ OUVERT — le `.env` du staging est lisible par tout compte local de la
> machine.** Mesuré : `stat -c '%n %U:%G %a' …/.env` → `644`. Le 02 §30.4-2 impose `600`. Cette
> machine héberge aussi la production d'un tiers. **Ce n'est pas corrigé ici** : le fichier est
> posé par Coolify à chaque déploiement, un `chmod` manuel serait effacé au suivant, et le corriger
> durablement demande un arbitrage (réglage Coolify, ou renoncement tracé). Le gardien A02 a inscrit
> le point à la porte P-A (`docs/portes/PORTE_A_2026-08-27.md`, critère 3).

**Le compose rendu n'est pas notre fichier.** Coolify lit
`infra/docker-compose.coolify.yml` depuis le dépôt cloné, le **réécrit**, et dépose le résultat
dans `docker-compose.yaml` (fichier de 30 883 octets ci-dessus). **C'est ce fichier-là qui décrit
la réalité**, pas le nôtre. Les réécritures sont énumérées au §4.3.

Le chemin visible dans les étiquettes des conteneurs
(`com.docker.compose.project.working_dir = /artifacts/zswdybh053dzer678q4th1v9`) **n'existe pas sur
l'hôte** (`ls /artifacts` → `No such file or directory`) : c'est le répertoire du conteneur
d'assistance de build, détruit après le déploiement. Ne le cherchez pas.

### 4.2 Les noms réels

```bash
ssh axionia-web 'docker ps -a --filter label=coolify.resourceName=axion-audit-staging \
  --format "{{.Names}}\t{{.Status}}"'
```

Relevé du 2026-08-28 06h44 UTC :

| Service         | Nom du conteneur                    | État           |
| --------------- | ----------------------------------- | -------------- |
| `postgres`      | `postgres-<uuid>-064303737694`      | `Up (healthy)` |
| `redis`         | `redis-<uuid>-064303768575`         | `Up (healthy)` |
| `minio`         | `minio-<uuid>-064303784563`         | `Up (healthy)` |
| `createbuckets` | `createbuckets-<uuid>-064303802769` | `Exited (0)` ✔ |
| `api`           | `api-<uuid>-064303822542`           | `Up (healthy)` |
| `worker`        | `worker-<uuid>-064303889626`        | `Up (healthy)` |
| `field`         | `field-<uuid>-064303929685`         | `Exited (0)` ✔ |
| `hq`            | `hq-<uuid>-064303938589`            | `Exited (0)` ✔ |
| `caddy`         | `caddy-<uuid>-064303947501`         | `Up (healthy)` |

> **⚠️ N'ÉCRIVEZ JAMAIS UN NOM DE CONTENEUR EN DUR DANS UN SCRIPT OU UNE PROCÉDURE.** Le suffixe
> change **à chaque déploiement** : entre deux relevés espacés de six minutes, il est passé de
> `051636151140` à `064303737694`. Résolvez toujours le nom :
>
> ```bash
> PG=$(ssh axionia-web 'docker ps --format "{{.Names}}" | grep "^postgres-wrunr" | head -1')
> ```

**Volumes réels** (`docker volume ls`) — **huit**, tous préfixés par l'uuid, avec des **tirets** là
où le fichier écrit des **soulignés** :

```
wrunr6mwq2oxqq392i4myzjn_postgres-data
wrunr6mwq2oxqq392i4myzjn_pgbackrest-repo
wrunr6mwq2oxqq392i4myzjn_redis-data
wrunr6mwq2oxqq392i4myzjn_minio-data
wrunr6mwq2oxqq392i4myzjn_field-dist
wrunr6mwq2oxqq392i4myzjn_hq-dist
wrunr6mwq2oxqq392i4myzjn_caddy-data
wrunr6mwq2oxqq392i4myzjn_caddy-config
```

**Réseaux réellement attachés** (`docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'`) :

| Service                                       | Réseaux                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `postgres`, `redis`, `minio`, `api`, `worker` | `axion-audit-coolify-interne` · `wrunr6mwq2oxqq392i4myzjn`                 |
| `caddy`                                       | `axion-audit-coolify-interne` · `wrunr6mwq2oxqq392i4myzjn` · **`coolify`** |

Seul `caddy` touche `coolify`, le réseau du proxy Traefik. C'est une **exigence de sécurité**, pas
une élégance : A54 a mesuré que ce réseau a l'ICC activé, donc tout conteneur qui le rejoint obtient
une route directe vers la base PostgreSQL et le Redis d'`axion-ia.com` (02 §30.4-4). La propriété est
gardée par `pnpm check:isolation-reseau` (`AMELIORATIONS.md`, 2026-08-28).

### 4.3 Les cinq conventions propres à Coolify

Elles sont **documentées ailleurs, et elles font foi ailleurs** : les quatre premières dans les
encadrés d'en-tête de `infra/docker-compose.coolify.yml` et dans `DECISIONS.md` / `AMELIORATIONS.md`
du 2026-08-28. Ce tableau ne les remplace pas, il les rassemble pour l'exploitant et renvoie.

| #   | Convention                                                                                                                                                                   | Conséquence à l'exploitation                                                                                                                                                                                                                                                                                                                                      | Où c'est tranché                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | **Un seul `-f`, aucune surcharge** → `docker-compose.coolify.yml` est autoportant, donc **dupliqué**                                                                         | toute modification de `docker-compose.yml` doit être reportée à la main. **Rien ne le vérifie.**                                                                                                                                                                                                                                                                  | en-tête du fichier · `AMELIORATIONS.md` (« la troisième convention d'A11 ») |
| 2   | **Le répertoire de projet est la RACINE du dépôt**, pas `infra/` — l'inverse des trois autres fichiers                                                                       | valider avec `docker compose --project-directory . -f infra/docker-compose.coolify.yml config -q`                                                                                                                                                                                                                                                                 | en-tête du fichier · `pnpm check:compose-coolify`                           |
| 3   | **Aucune interpolation dans un chemin de volume**                                                                                                                            | a coûté un déploiement                                                                                                                                                                                                                                                                                                                                            | `AMELIORATIONS.md` 2026-08-28 · `pnpm check:compose-coolify`                |
| 4   | **Aucun fichier du dépôt n'est monté** : Coolify réécrit tout montage relatif vers `/data/coolify/applications/<uuid>/`, où il ne dépose que `docker-compose.yaml` et `.env` | la configuration (Caddyfile, `postgresql.custom.conf`, `pgbackrest.conf`) est **embarquée dans les images**. **Plus de « je corrige et je redémarre » : tout changement exige un redéploiement complet.** Les répertoires `caddy/`, `infra/`, `postgres/`, `pgbackrest/` vus au §4.1 sont les **coquilles vides** que Docker crée à la place des sources absentes | en-tête du fichier · `DECISIONS.md` 2026-08-28                              |
| 5   | **Coolify réécrit les noms de volumes et injecte un troisième réseau**                                                                                                       | voir l'encadré ci-dessous — **c'est celle qui casse les scripts** (§6)                                                                                                                                                                                                                                                                                            | mesuré ici, 2026-08-28                                                      |

> **Convention 5, en détail, parce que c'est celle qui trompe.**
> `infra/docker-compose.coolify.yml` déclare huit volumes avec un `name:` **explicite**
> (`axion-coolify-postgres-data`, etc.) et deux réseaux (`axion-audit-coolify-interne`, `coolify`).
>
> Dans le compose **rendu**, Coolify :
>
> - **conserve** les huit déclarations `axion-coolify-*` — mais **plus aucun service n'y fait
>   référence** : elles sont orphelines, et `docker volume ls` confirme qu'**aucune n'est créée** ;
> - **ajoute** huit volumes `wrunr6mwq2oxqq392i4myzjn_<nom-a-tirets>` et **réécrit chaque montage de
>   service** vers eux :
>   `- 'wrunr6mwq2oxqq392i4myzjn_postgres-data:/var/lib/postgresql/data'` ;
> - **ajoute** un troisième réseau `wrunr6mwq2oxqq392i4myzjn`, déclaré `external: true`, attaché à
>   **tous** les services. Le réseau `axion-audit-coolify-interne` que nous nommons, lui, **survit**.
>
> Vérification :
>
> ```bash
> ssh axionia-web 'docker volume ls --format "{{.Name}}" | grep -c axion-coolify'   # → 0
> ssh axionia-web 'grep -n "postgres-data:/var/lib/postgresql/data" \
>   /data/coolify/applications/wrunr6mwq2oxqq392i4myzjn/docker-compose.yaml'
> ```
>
> **Le `name:` que nous écrivons ne fait donc PAS autorité sur le staging.** Ne construisez aucune
> procédure de sauvegarde ou de restauration sur les noms `axion-coolify-*` : ils n'existent pas.
>
> **⚠️ CE N'EST PAS UNE ERREUR QUI ÉCHOUE — C'EST UNE ERREUR QUI RÉUSSIT, ET C'EST PIRE.**
> Démonstration faite involontairement le 2026-08-28 par l'agent A62, qui a monté un volume au nom
> du compose au lieu du nom réel : Docker **n'a pas refusé**. Il a **créé un volume vide** de ce nom
> et l'a monté. La commande a rendu 0, le conteneur a démarré, et la sonde a lu un répertoire
> d'archives parfaitement vide. Le volume parasite a été supprimé après coup (créé à 11h19m31 UTC,
> vide, sans conteneur).
>
> **Transposé à une restauration en situation réelle, cela donne : une restauration qui « réussit »
> sur des données absentes, un jour de panne, sous pression.** C'est la raison pour laquelle ce
> paragraphe existe, et pourquoi il vaut mieux le lire deux fois qu'une.
>
> **Toujours résoudre le nom, jamais le supposer :**
>
> ```bash
> ssh axionia-web 'docker volume ls --format "{{.Name}}" | grep wrunr6mwq2oxqq392i4myzjn'
> ```
>
> _(L'uuid change si l'application Coolify est recréée — c'est pourquoi on le résout au lieu de
> l'écrire en dur, ici comme ailleurs.)_

### 4.4 Regarder le staging — commandes vérifiées

```bash
# Résoudre les noms (ils changent à chaque déploiement)
PG=$(ssh axionia-web 'docker ps --format "{{.Names}}" | grep "^postgres-wrunr" | head -1')
CADDY=$(ssh axionia-web 'docker ps --format "{{.Names}}" | grep "^caddy-wrunr"   | head -1')

# Santé de l'API, vue à travers NOTRE Caddy, sans passer par Traefik
ssh axionia-web "docker exec $CADDY wget -qO- http://localhost:8080/api/v1/health"
# MESURÉ 2026-08-28 : {"status":"ok"}  + CSP complète, HSTS, X-Frame-Options: DENY, Via: 1.1 Caddy

# État de pgBackRest  (⚠️ le rôle PostgreSQL est `axion`, PAS `postgres`)
ssh axionia-web "docker exec --user postgres $PG pgbackrest --stanza=axion info"
ssh axionia-web "docker exec --user postgres $PG \
  psql -U axion -d axion_audit -c 'SELECT archived_count, failed_count, last_archived_wal FROM pg_stat_archiver;'"

# Journaux d'un service
ssh axionia-web "docker logs --tail 100 $PG"
```

> **Le rôle PostgreSQL est `axion`.** `psql` sans `-U` échoue avec
> `FATAL: role "postgres" does not exist`. L'ancienne version de ce runbook (§5.3) donnait la
> commande sans `-U` : elle ne pouvait pas fonctionner.

### 4.5 Ce qui n'est PAS sur la machine, et qu'il ne faut pas chercher

| Absent (MESURÉ)                           | Conséquence                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `/opt/axion-audit` (toute l'arborescence) | aucune racine d'exploitation, aucun `.env` par environnement              |
| **une copie du dépôt**                    | **aucun script de `infra/scripts/` n'est exécutable sur ce serveur** (§6) |
| `/var/backups/axion`, `/var/log/axion`    | aucune sauvegarde locale, aucun rapport horodaté                          |
| `/etc/cron.d/axion-audit`                 | aucune tâche planifiée pour Axion Audit                                   |
| `/root/.ssh/storagebox_ed25519`           | aucun accès Storage Box → **aucune copie hors serveur**                   |
| `rclone`                                  | la règle 3-2-1 n'est pas outillée                                         |
| l'image `axion-audit-postgres:16`         | l'image du staging est **`axion-audit-postgres:16-coolify`**              |

**Ce qui est présent sur l'hôte** (`command -v`) : `docker`, `bash`, `gpg`, `curl`, `openssl`,
`sha256sum`, `rsync`.

> **Un voisin fait le ménage.** Le crontab de `root` appartient à `axion-ia` et contient
> `0 */6 * * * /usr/bin/docker image prune -af`. **Toute image Docker non utilisée est supprimée
> toutes les six heures**, y compris les nôtres. C'est un fait de l'environnement, pas un réglage à
> nous : n'écrivez aucune procédure qui suppose qu'une image inutilisée survivra à la nuit.

### 4.6 Accès public — état au 2026-08-28

| Fait                                             | Mesure                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `PUBLIC_BASE_URL` du `.env`                      | `https://audit-staging.axion-ia.com`                              |
| DNS de ce nom                                    | `getent hosts audit-staging.axion-ia.com` → **non résolu**        |
| Domaine réellement posé sur la ressource Coolify | `COOLIFY_FQDN=wrunr6mwq2oxqq392i4myzjn.<IP_AXIONIA_WEB>.sslip.io` |
| Réponse publique                                 | **404** à 06h41 UTC (aucun routeur Traefik), **504** à 06h47 UTC  |

**Le staging n'était joignable de l'extérieur à aucun des deux relevés.** À 06h41 le conteneur
`caddy` ne portait **aucune étiquette Traefik** ; à 06h47 (après un redéploiement lancé par un autre
agent) les étiquettes existaient —
`traefik.http.routers.http-0-<uuid>-caddy.rule=Host(`…sslip.io`) && PathPrefix(`/`)` — mais **aucune
étiquette `loadbalancer.server.port`** : Traefik choisit alors le premier port exposé (80), là où
notre Caddy écoute sur **8080**, d'où le 504.

> **NE FIGEZ PAS CE POINT** : un autre agent travaillait sur le port cible de Traefik à l'heure du
> relevé. **Ce qui est acquis**, en revanche : la pile répond correctement en interne
> (`{"status":"ok"}` par `docker exec`), donc la panne est **de routage, pas d'application**.
> `PUBLIC_BASE_URL` désigne un nom qui ne résout pas : c'est un second point à traiter, distinct.

---

## 5. SAUVEGARDE ET RESTAURATION — MESURÉ ET JOUÉ LE 2026-08-28

> Cette section a été **entièrement rejouée** entre 07h20 et 08h00 UTC (A59). Tout chiffre qui y
> figure a été relevé sur `axionia-web` ; rien n'y est extrapolé sans le dire.

### 5.0 ⚠️ « LE STAGING EST SAIN » NE DIT RIEN DE LA MÉCANISATION — la matinée du 2026-08-28

Entre 07h20 et 07h35, le staging **en service** datait du déploiement de **06h51**, donc
**antérieur à la mécanisation de la stanza**. Mesuré alors :

| Contrôle                                                | Résultat à 07h31                                     |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Le compose **rendu** sur disque contient `createstanza` | **oui** (rendu à 07h26)                              |
| Un conteneur `createstanza` avait-il jamais tourné ?    | **AUCUN** — seul `createbuckets` existait            |
| L'image portait-elle `axion-stanza-create` ?            | **non** : `stat …: no such file or directory`        |
| La sonde de `postgres` était-elle `axion-healthcheck` ? | **non** : encore `pg_isready`, la sonde « menteuse » |

**La stanza du staging avait donc été créée À LA MAIN, pas par le mécanisme** — et rien ne le
montrait, puisque la pile affichait `healthy`.

**Le déploiement de 07h39 a levé ce point**, et c'est un fait, pas une intention :

```
createstanza-<uuid>-073945266402   Exited (0)     ← PREMIÈRE exécution réelle du job
docker inspect …Healthcheck.Test → ["CMD","axion-healthcheck"]
docker exec <pg> ls /usr/local/bin/axion-*  → axion-healthcheck, axion-stanza-create
```

**Ce que cette séquence enseigne, et qu'il faut garder :** un compose rendu sur le disque du serveur
**n'est pas** ce qui tourne, et une pile `healthy` **ne prouve pas** que ses garde-fous ont été
exécutés une seule fois. Les deux seules preuves qui valent sont le conteneur `Exited (0)` du job et
la sonde lue dans `docker inspect`.

> **Le service `sauvegarde` de §5.2 n'est PAS encore dans cette image** : il a été écrit et joué
> après ce déploiement, et il n'est pas poussé. `docker run --entrypoint
/usr/local/bin/axion-sauvegarde axion-audit-postgres:16-coolify` échouera tant que l'image n'aura
> pas été reconstruite. Ce n'est pas un défaut du script, c'est l'image qui est en retard.

### 5.1 Sauvegarde complète — AVANT et APRÈS

**AVANT** (07h22 UTC) :

```
stanza: axion
    status: error (no valid backups)          ← rien de restaurable
    cipher: aes-256-cbc
    db (current)
        wal archive min/max (16): 000000010000000000000001/000000010000000000000006
```

`pg_stat_archiver` : `archived_count=5`, `failed_count=0`. Taille de `axion_audit` : **10 Mo**.

**Commande jouée** (07h23:58 UTC) :

```bash
PG=$(ssh axionia-web 'docker ps --format "{{.Names}}" | grep "^postgres-wrunr" | head -1')
ssh axionia-web "docker exec --user postgres $PG \
  pgbackrest --stanza=axion --type=full --log-level-console=info backup"
```

**APRÈS** (07h24 UTC) :

```
stanza: axion
    status: ok                                ← LE MOT QUI CHANGE TOUT
    cipher: aes-256-cbc
    db (current)
        wal archive min/max (16): 000000010000000000000001/000000010000000000000008
        full backup: 20260828-072358F
            timestamp start/stop: 2026-08-28 07:23:58+00 / 2026-08-28 07:24:00+00
            wal start/stop: 000000010000000000000008 / 000000010000000000000008
            database size: 32.1MB, database backup size: 32.1MB
            repo1: backup set size: 3.8MB, backup size: 3.8MB
```

| Mesure                                 | Valeur                                         |
| -------------------------------------- | ---------------------------------------------- |
| Durée de la sauvegarde complète        | **2,58 s** (1502 fichiers, 32,1 Mo)            |
| Empreinte dans le dépôt                | **3,8 Mo** — compression zstd-3, ratio **8,4** |
| Volume `…_pgbackrest-repo` avant/après | 4,3 Mo → **15 Mo**                             |
| Disque de l'hôte                       | 44 Go / 150 Go — **31 %**                      |

> **Le disque n'est PAS au-delà de 80 %.** Il est à 31 %, avec 101 Go libres (`df -h /`). Le seuil
> du 02 §11.3 n'est pas franchi. Ce point avait été rapporté à l'envers ; il est corrigé ici.

### 5.2 La mécanisation — service `sauvegarde` du compose

Une commande tapée une fois ne vaut rien : elle sera oubliée en production comme
`stanza-create` l'a été ici. La sauvegarde est donc devenue un **service versionné de la pile** —
`infra/postgres/sauvegarde.sh` + le service `sauvegarde` de `docker-compose.coolify.yml` :

- **une passe = les deux moitiés du critère L0** : `pgbackrest backup` **et** archive chiffrée du
  volume MinIO ; si l'une échoue, la passe échoue ;
- **complète le dimanche, incrémentale les autres jours**, à `02:30` UTC (02 §11.4) ;
- **rattrapage au démarrage** : si aucune passe réussie n'a moins de 26 h, une sauvegarde part
  immédiatement — une pile fraîchement déployée n'attend pas la nuit pour avoir un point de départ ;
- **échec = sortie non nulle**, aucun `|| true`. Docker redémarre le service ; `Restarting` dans
  `docker ps` **est** le signal.

**Le choix du conteneur de planification est argumenté, pas subi.** BullMQ a été écarté (le worker
n'a ni `pgbackrest`, ni le répertoire de données, ni le socket : les lui donner serait une élévation
de privilège pour aucun gain). Les tâches planifiées de Coolify ont été écartées (leur définition
vit dans la base de Coolify, pas dans `git` — invisible à une revue, absente d'une reconstruction).

**CE QU'ELLE NE COUVRE PAS**, et il faut le lire :

| Non couvert                             | Conséquence                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| **Pile arrêtée**                        | aucune sauvegarde ; un conteneur ne se réveille pas seul                             |
| **Copie hors serveur**                  | **la règle 3-2-1 n'est PAS tenue** — §5.6                                            |
| **Alerte sortante**                     | ni Telegram ni courriel : l'échec se lit dans `docker ps`, pas dans une notification |
| **Test de restauration automatique**    | geste distinct, joué **à la main** (§5.4) ; l'automatiser suppose l'arbitrage §6.2   |
| **Les trois autres piles du dépôt**     | `docker-compose.yml`, `.staging.yml`, `.prod.yml` n'ont pas ce service               |
| **Le staging en service à cette heure** | le service n'y tourne pas : il exige un redéploiement (§5.0)                         |

> **ÉTAT : ÉCRIT ET JOUÉ SUR BASE JETABLE, PAS ENCORE DÉPLOYÉ.** Le déploiement se fait par Coolify
> depuis `git` ; cet incrément n'est pas poussé. Le service n'existera sur le staging qu'au prochain
> déploiement, et c'est là seulement que `docker ps` montrera `sauvegarde-<uuid>`.

Ce qui a été **joué** sur des conteneurs jetables, avec le script tel qu'il est versionné :

| Épreuve                                                       | Résultat                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Passe complète (rattrapage au démarrage)                      | ✅ `pgbackrest` + archive MinIO vérifiée + marqueur écrit                     |
| Sauvegarde depuis un conteneur **séparé**, via socket partagé | ✅ **3,7 s** — c'est le point dur du design, il tient                         |
| `stanza-create` depuis un conteneur séparé, **deux fois**     | ✅ idempotent (`already exists on repo1 and is valid`)                        |
| Rotation à 2 archives sur 3 passes                            | ✅ la plus ancienne supprimée, avec son `.sha256`                             |
| Passphrase vide / heure `25:99` / jour `9`                    | ✅ refus au démarrage, code 1, message en français                            |
| Marge disque non tenue                                        | ✅ code 1, **aucune archive écrite**                                          |
| Plafond d'archives dépassé                                    | ✅ code 1, message qui **nomme la décision** à prendre                        |
| Volume d'archives en `root:root`                              | ✅ **a échoué bruyamment** (`Permission denied`) → corrigé dans le Dockerfile |

**Volume de socket partagé — le point dur, mesuré et non supposé.** `pgbackrest backup` doit
appeler `pg_backup_start()`, et pgBackRest ne joint PostgreSQL que par **socket UNIX**. Un
conteneur séparé exige donc de partager `/var/run/postgresql` par un volume nommé — donc
persistant, donc susceptible de garder un socket et un verrou périmés nommant le PID 1. Les trois
cas ont été joués sur base jetable :

| Cas                                | Contenu du volume après         | Redémarrage |
| ---------------------------------- | ------------------------------- | ----------- |
| Arrêt propre (`docker stop`)       | **vide** (PostgreSQL nettoie)   | ✅ OK       |
| Arrêt brutal (`docker kill -KILL`) | socket **et** verrou survivants | ✅ OK       |
| Troisième démarrage d'affilée      | —                               | ✅ OK       |

### 5.3 Rétention — décidée, chiffrée, et son coût disque

| Quoi                 | Règle                                          | D'où elle vient                         |
| -------------------- | ---------------------------------------------- | --------------------------------------- |
| Complètes PostgreSQL | `repo1-retention-full-type=time`, **30 jours** | 02 §11.4, `${BACKUP_RETENTION_DAYS}`    |
| Incrémentales        | suivent la complète dont elles dépendent       | `pgbackrest`                            |
| WAL archivés         | `repo1-retention-archive-type=full`            | conservés pour toute complète retenue   |
| **Archives MinIO**   | **30 archives** (une par jour)                 | **alignées sur les 30 j de PostgreSQL** |

**Pourquoi l'alignement n'est pas cosmétique.** Une restauration PostgreSQL de J-25 désigne des
pièces jointes ; si MinIO n'était gardé que 14 jours, ces pièces n'existeraient dans aucune archive.
Deux rétentions différentes, c'est une restauration à moitié possible.

**Ce que ça coûte, à partir des mesures du jour :**

| Poste                     | Mesuré                         | Règle d'extrapolation                                            |
| ------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Une complète PostgreSQL   | 3,8 Mo pour 32,1 Mo de cluster | **≈ taille du cluster ÷ 8,4** (zstd-3)                           |
| Une incrémentale (à vide) | 8,3 Ko                         | proportionnelle aux blocs modifiés du jour                       |
| Dépôt pgBackRest complet  | **15 Mo** après une complète   | ≈ 5 complètes (30 j ÷ 7) + 30 incr. + WAL                        |
| Une archive MinIO         | 1,3 Mo pour 1,26 Mo d'objets   | **≈ taille de MinIO** (les pièces jointes sont déjà compressées) |
| **Archives MinIO à 30 j** | —                              | **30 × la taille de MinIO** — le poste qui pèse                  |

> **C'est le poste MinIO qui décide.** Les archives sont des copies **complètes** : à 1 Go de pièces
> jointes, la rétention à 30 jours réclame **≈ 30 Go**. Sur un disque de 150 Go partagé avec la
> production d'un tiers, ce n'est pas soutenable longtemps. Le script **refuse d'écrire** au-delà de
> `AXION_ARCHIVES_MAX_MO` (20 Go par défaut) et nomme la décision à prendre plutôt que de remplir le
> disque du voisin. **Une sauvegarde MinIO incrémentale, ou une destination externe, devra être
> tranchée avant que les premières missions produisent des pièces jointes.**

### 5.3bis ⛔ LE COFFRE DES SECRETS — À OUVRIR **AVANT** §5.4 ET §5.5

> **Si vous restaurez dans l'urgence, cette section passe en premier et les deux suivantes ne
> marchent pas sans elle.** §5.4 exige `PGBACKREST_CIPHER_PASS`, §5.5 exige
> `BACKUP_ENCRYPTION_PASSPHRASE`. Ces deux valeurs vivent **dans le coffre**. Restaurer la base et
> les pièces jointes sans avoir ouvert le coffre rend des octets chiffrés et **aucun conteneur qui
> redémarre** (02 §30.4-2).

**Ce qu'est le coffre.** Une archive `tar + zstd + gpg AES256` produite **à chaque passe** de
`infra/postgres/sauvegarde.sh` (fonction « coffre des secrets »), déposée dans `/sauvegarde` à côté
des archives MinIO, expédiée vers R2 sous `staging/minio/`, et soumise à la **même rétention** que
les archives qu'elle permet de rouvrir. Nom : `secrets-<horodatage>.coffre.gpg`, avec son
`.sha256` à côté.

**La clé.** `BACKUP_SECRETS_PASSPHRASE` — décision **D-3, option A** : une valeur **distincte** de
`BACKUP_ENCRYPTION_PASSPHRASE`, qui ne vit **pas** sur la machine. Elle est dans le gestionnaire de
mots de passe de Williams. **Si vous ne l'avez pas, aucune commande de cette section ne peut
aboutir — il n'existe aucun contournement, et c'est voulu.**

#### La procédure, depuis le seul stockage distant

```bash
# Pré-requis : `mc` configuré sur le bucket R2, la passphrase du coffre dans un
# FICHIER (jamais sur une ligne de commande — /proc/<pid>/cmdline est lisible).
umask 077
D=$(mktemp -d); chmod 700 "$D"

# 1. Choisir le coffre le plus récent et le retélécharger.
mc ls axionr2/<bucket>/staging/minio/ | grep '\.coffre\.gpg$'
mc cp axionr2/<bucket>/staging/minio/secrets-<horodatage>.coffre.gpg "$D/coffre.gpg"

# 2. Vérifier qu'il est arrivé entier (le .sha256 voyage à côté).
mc cat axionr2/<bucket>/staging/minio/secrets-<horodatage>.coffre.gpg.sha256
sha256sum "$D/coffre.gpg"      # les deux empreintes doivent être IDENTIQUES

# 3. L'ouvrir — commande exacte du `LISEZ-MOI.txt` qu'il contient.
printf %s "$PASSPHRASE_DU_COFFRE" > "$D/pp"     # variable d'env, jamais un littéral
mkdir "$D/ouvert" && cd "$D/ouvert"
gpg --decrypt --batch --pinentry-mode loopback --passphrase-file "$D/pp" \
    "$D/coffre.gpg" | zstd -d | tar -xv

# 4. Effacer le clair dès que les valeurs sont reposées dans Coolify.
cd / && rm -rf "$D"
```

**Ce que vous obtenez** (5 fichiers) : `application.env` (les `CLÉ=valeur`, triées) ·
`environnement-conteneur.brut` (l'environnement complet, pour trancher si le filtre s'est trompé) ·
`manifeste.txt` (nom, longueur et empreinte de chaque valeur — sert à vérifier un `.env` reposé à la
main **sans afficher un seul secret**) · `contexte-coolify.txt` (uuid, branche, commit, domaines) ·
`LISEZ-MOI.txt`.

**Puis, dans l'ordre** : recréer l'application Coolify (dépôt git + branche), coller
`application.env` dans ses variables, **reposer à la main les trois choses que le coffre ne contient
pas** — le **port cible Traefik** (notre Caddy écoute sur 8080 ; sans ce réglage Traefik prend le
premier port exposé et rend un 504), la **liaison au dépôt git**, et le **domaine** — déployer une
fois à vide, **puis seulement** §5.4 (PostgreSQL) et §5.5 (MinIO).

#### Preuve d'aller-retour — jouée le 2026-08-29 sur le coffre de PRODUCTION du staging

Pas sur un coffre de test : sur `secrets-20260829T023005Z.coffre.gpg`, **retéléchargé depuis R2**,
et par la commande du `LISEZ-MOI` ci-dessus.

| Étape                                                        | Mesure                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| SHA-256 local et sidecar `.sha256`                           | `f994768b44693c44…` — identiques                                         |
| SHA-256 **relu depuis R2** (`mc cat`, flux, rien sur disque) | `f994768b44693c44…` — **identique à la source**                          |
| Déchiffrement + extraction de l'objet **venu de R2**         | rc 0 — 5 fichiers, 103 variables applicatives                            |
| SHA-256 de l'arbre recomposé                                 | `bcdef88b7f455edf…` — **égal à l'empreinte journalisée à l'écriture**    |
| Ouverture avec `BACKUP_ENCRYPTION_PASSPHRASE`                | **rc 2 — refusée.** Les deux gardes sont bien cloisonnées (D-3 option A) |

> **Ce que cette preuve ne couvre pas, et qu'il faut savoir avant d'en avoir besoin :** elle prouve
> que le coffre **s'ouvre** et que son contenu est **intègre**. Elle ne prouve pas qu'une pile
> reconstruite **depuis** ces variables redémarre — cela suppose de recréer une application Coolify,
> ce qui n'a jamais été joué (§7.3). Et elle ne vaut que tant que **quelqu'un détient la
> passphrase** : voir §5.7, point 6.

### 5.4 LA RESTAURATION POSTGRESQL — JOUÉE, PAS DÉCRITE

**Base jetable, jamais le staging.** Le dépôt pgBackRest est monté **en lecture seule** : le test ne
peut pas abîmer ce qu'il vérifie.

```bash
# 0. Empreinte de la base d'ORIGINE (lecture seule, transaction READ ONLY)
docker run --rm --network axion-audit-coolify-interne \
  -v /chemin/empreinte-seed.mjs:/app/scripts/empreinte-seed.mjs:ro \
  -e DATABASE_URL="postgresql://axion:<mdp>@postgres:5432/axion_audit" \
  axion-audit-api:coolify node /app/scripts/empreinte-seed.mjs --json

# 1. Volume jetable
docker volume create axion-restore-test-data

# 2. Restauration — AUCUN RÉSEAU, dépôt en LECTURE SEULE
docker run --rm --network none --user postgres \
  -v wrunr6mwq2oxqq392i4myzjn_pgbackrest-repo:/var/lib/pgbackrest:ro \
  -v axion-restore-test-data:/var/lib/postgresql/data \
  -e PGBACKREST_REPO1_CIPHER_PASS="<passphrase>" \
  --entrypoint pgbackrest axion-audit-postgres:16-coolify \
  --stanza=axion --archive-mode=off --log-level-console=info restore

# 3. Démarrage du cluster restauré (toujours --network none)
docker run -d --network none --user postgres --name axion-restore-test-pg \
  -v wrunr6mwq2oxqq392i4myzjn_pgbackrest-repo:/var/lib/pgbackrest:ro \
  -v axion-restore-test-data:/var/lib/postgresql/data \
  -e PGBACKREST_REPO1_CIPHER_PASS="<passphrase>" \
  --entrypoint /usr/lib/postgresql/16/bin/postgres \
  axion-audit-postgres:16-coolify -D /var/lib/postgresql/data
```

> **`--archive-mode=off` N'EST PAS UN DÉTAIL.** Sans lui, le cluster restauré hériterait
> d'`archive_mode = on` et pousserait ses propres WAL **dans le dépôt de production**. Le montage
> `:ro` ferait échouer la poussée — mais la bonne réponse est de ne pas essayer. Vérifié après
> restauration : `SHOW archive_mode` → `off`.

**Chronométrage réel (2026-08-28, cluster de 32,1 Mo) :**

| Étape                                            | Durée mesurée |
| ------------------------------------------------ | ------------- |
| `pgbackrest restore` (1502 fichiers, 32,1 Mo)    | **2,03 s**    |
| Démarrage + reprise WAL + promotion (timeline 2) | **1,59 s**    |
| **Total, dépôt → base ouverte en écriture**      | **≈ 3,6 s**   |

**Ce que la base restaurée contient — et c'est là que ça se joue :**

| Contrôle                                      | Origine                            | Restaurée                              |
| --------------------------------------------- | ---------------------------------- | -------------------------------------- |
| Tables du schéma `public`                     | 44                                 | **44**                                 |
| `schema_migrations`                           | 12                                 | **12**                                 |
| blocks / sectors / services                   | 9 / 8 / 11                         | **9 / 8 / 11**                         |
| interlocutor_profiles / size_tiers            | 9 / 4                              | **9 / 4**                              |
| naf_sector_map / estimation_params            | 88 / 29                            | **88 / 29**                            |
| **EMPREINTE GLOBALE (`pnpm seed:empreinte`)** | `65929446c5c682592befc43c033229b6` | **`65929446c5c682592befc43c033229b6`** |
| Forme du compte fondateur                     | `f9e811b5b172`                     | **`f9e811b5b172`**                     |

```
✓ empreinte conforme à l'attendue (65929446c5c682592befc43c033229b6).   (code de sortie 0)
```

**Les sept empreintes par table sont identiques une à une**, pas seulement la globale. C'est
infiniment plus fort qu'un `count(*)` : l'outil compare le CONTENU MÉTIER canonisé — codes,
libellés, valeurs numériques canoniques, FK résolues en codes — hors identifiants et hors
horodatages. La même empreinte des deux côtés signifie que le jeu de référence a traversé la
sauvegarde **à la valeur près**.

> **Une précision sur le mode opératoire.** Les étapes 2 et 3 tournent bien en `--network none`.
> L'étape de MESURE, elle, exige que l'outil d'empreinte joigne la base : le conteneur a donc été
> arrêté puis relancé sur un réseau **jetable et `--internal`** (aucune route sortante) portant
> **exactement deux conteneurs**, le temps de la mesure, puis supprimé. Docker refuse
> `network connect` sur un conteneur en mode `none` — c'est le seul écart au mode opératoire, et il
> est nommé plutôt que caché.

**Ce que ce chronomètre dit du RTO de 4 h.** Il dit **une chose, et une seule** : l'étape « dépôt →
base ouverte » n'est pas le facteur limitant. À 20 Mo/s mesurés (compression comprise), un cluster
de 10 Go se restaure en **≈ 8 à 9 minutes**. Le RTO de 4 h est donc dominé par tout le reste —
reconstruction du serveur, redéploiement, DNS, TLS — **et ce reste n'a toujours jamais été joué**
(§7.3). Le chiffre de 4 h n'engage toujours personne ; il est simplement **moins suspect du côté de
la base**.

### 5.5 LA RESTAURATION MINIO — JOUÉE AUSSI, ET ENTIÈREMENT

**Le MinIO du staging est VIDE** (`mc du` : 3 buckets, **0 objet**, 0 B). Y jouer une restauration
n'aurait rien prouvé. Le test a donc été mené sur des instances **jetables** portant un jeu
d'objets connu — 1 Mo binaire, un texte, 256 Ko binaire, répartis sur les trois buckets, plus le
versioning activé sur `axion-attachments` pour voir si un réglage de sécurité survit.

**Les DEUX voies ont été jouées, et la comparaison a décidé du design :**

| &nbsp;                       | **`tar` du volume** (retenue) | `mc mirror` par l'API S3                |
| ---------------------------- | ----------------------------- | --------------------------------------- |
| Objets restaurés (sha256)    | **3 / 3 identiques**          | **3 / 3 identiques**                    |
| Buckets                      | **restitués**                 | à **recréer à la main**                 |
| Politique `anonymous = none` | **restituée**                 | à **réappliquer à la main**             |
| Versioning                   | **restitué**                  | **PERDU**                               |
| Comptes / politiques MinIO   | **restitués** (`.minio.sys`)  | perdus                                  |
| Nombre de conteneurs         | **1**                         | 2 (l'image `mc` n'a ni `tar`, ni `gpg`) |
| Copie en clair sur le disque | **aucune**                    | **oui**, un répertoire intermédiaire    |
| Durée archive / restauration | **1,73 s** / **6,42 s**       | 0,52 + 1,86 s / 0,69 + 6,75 s           |

**La voie retenue est le `tar` chiffré du volume**, parce qu'une sauvegarde qui oblige à se souvenir
d'un réglage de sécurité est une sauvegarde qui le perdra. Ce qu'elle coûte, dit franchement : la
copie est **cohérente au crash**, pas transactionnelle — un objet en cours d'écriture peut être
capturé à moitié, et MinIO le traite au redémarrage comme après une coupure de courant. `mc mirror`
ne faisait pas mieux : il lit lui aussi une cible qui bouge.

**Chaîne complète, jouée de bout en bout :**

```
tar -C /minio-donnees -cf - .  |  zstd -3  |  gpg --symmetric --cipher-algo AES256   →  archive
gpg --decrypt  |  zstd -d  |  tar -x       →  volume neuf  →  MinIO neuf par-dessus  →  3/3 sha256 identiques
```

Le script **vérifie chaque archive avant de la publier** : l'empreinte SHA-256 du flux lu est
capturée au vol, l'archive est aussitôt redéchiffrée et redécompressée, et les deux empreintes sont
comparées. Tant que la comparaison n'a pas réussi, le fichier porte l'extension `.partiel` et
**aucune rotation ne peut le prendre pour une sauvegarde**.

> **Une archive MinIO n'est PAS reproductible à l'octet** — deux passes successives sur le même
> contenu donnent deux empreintes différentes (`4474c45a…`, puis `c8093501…`). C'est normal :
> `.minio.sys` porte des compteurs d'usage et des horodatages qui bougent. Ce qui est garanti, c'est
> la **restitution du contenu**, pas l'égalité des archives.

### 5.6 COPIE HORS SERVEUR — CE QUI EST PRÊT, ET CE QUI RESTE À DÉCIDER

**Une sauvegarde qui vit sur la machine qu'elle protège ne protège de rien.** Aujourd'hui, le dépôt
pgBackRest et les archives MinIO sont sur `/var/lib/docker/volumes` de `axionia-web` : ils défendent
contre la perte **logique** (suppression, corruption applicative, mauvaise migration), **pas** contre
la perte du serveur. **La règle 3-2-1 du 02 §11.4 n'est pas tenue.**

**Ce qui est prêt, et qui ne demande aucune décision :**

| Brique                                      | État                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chiffrement du dépôt PostgreSQL             | ✅ `aes-256-cbc`, passphrase déjà provisionnée (`PGBACKREST_CIPHER_PASS`)                                                                                                            |
| Chiffrement des archives MinIO              | ✅ gpg AES256, `BACKUP_ENCRYPTION_PASSPHRASE` **déjà présente** dans le `.env` du staging                                                                                            |
| Vérification de l'archive avant publication | ✅ round-trip déchiffrement + comparaison d'empreinte                                                                                                                                |
| Empreinte SHA-256 à côté de chaque archive  | ✅ `<archive>.sha256`, chemin relatif, rejouable après copie                                                                                                                         |
| Outils présents dans l'image du projet      | ✅ `tar`, `zstd`, `gpg`, `openssl`, `sha256sum`, `rsync` (hôte)                                                                                                                      |
| **Point d'insertion dans le script**        | ✅ une passe réussie laisse `\$ARCHIVES/.derniere-passe` et des fichiers immuables : l'expédition est une étape à ajouter **après** `faire_tourner_minio`, sans rien changer d'autre |

**Ce qui manque est une décision, pas du code :**

> **ESCALADE — à instruire par Williams, formulée pour être tranchable :**
>
> _« [L0-b] Où part la copie hors serveur des sauvegardes Axion Audit, et à quel coût ?_
> _Options : (a) **Hetzner Storage Box** — même fournisseur, site distinct ; ~4 €/mo pour 1 To ;_
> _accès par `rsync`/SSH, déjà installé sur l'hôte ; ne satisfait PAS le « hors Hetzner » du 02 §11.4._
> _(b) **Storage Box + second dépôt hebdomadaire hors Hetzner** (Scaleway/OVH) — satisfait 3-2-1 en_
> _entier, deux fournisseurs à contractualiser, deux jeux d'identifiants à faire tourner._
> _(c) **`repo2` pgBackRest natif** (S3 ou SFTP) pour PostgreSQL + `rsync` pour MinIO — pgBackRest_
> _gère alors lui-même la rétention distante et le chiffrement ; c'est la voie la plus propre pour_
> _la base, elle ne dit rien pour MinIO._
> _(d) **Renoncer explicitement pendant la Phase 1** et l'écrire dans la porte, la donnée de_
> _staging étant reconstructible par `pnpm db:migrate && pnpm seed`._
>
> _Ce que la décision doit fournir, et qu'aucun agent ne peut produire : la destination, le budget,_
> _les identifiants, et la durée de rétention réglementaire des pièces jointes d'audit._
> _Ce qu'elle débloque immédiatement : l'étape d'expédition du script, ~0,5 j. »_

**Aucun identifiant n'a été demandé, créé ni manipulé pour préparer ce point.**

### 5.7 Ce qui reste ouvert côté sauvegarde

> **⚠️ Points 1 à 3 PÉRIMÉS — corrigés le 2026-08-29 par mesure sur la machine.** Ils décrivaient
> l'état d'avant le déploiement du service. Ils sont réécrits ci-dessous plutôt qu'effacés : un
> document d'exploitation qui se réécrit sans le dire ne vaut pas mieux qu'une sonde qui ment.

1. ~~Le service `sauvegarde` n'est pas déployé~~ → **il tourne** (`Up … (healthy)`), créneau
   02:30 UTC, passe locale vérifiée.
2. ~~Aucune copie hors serveur~~ → **R2 est en service** (bucket `…/staging`, 1 613 objets attendus).
   Reste ouvert : la **deuxième** destination (D-1, Hetzner Storage Box) est **décidée mais pas
   posée** — `BACKUP_STORAGEBOX_*` absentes, le journal l'annonce à chaque démarrage. Le 02 §11.4
   demande deux destinations ; il y en a **une**.
3. ~~Aucune alerte~~ → **Telegram est actif** (« notification sortante ACTIVE » au journal).
   Reste ouvert, et c'est le trou principal : **aucune sonde EXTERNE**. La sonde et l'alerte
   s'exécutent sur la machine qu'elles surveillent — VPS éteint, plus d'alerte. Uptime Kuma
   (02 §11.3) n'est pas déployé.
4. ~~**Le test de restauration reste MANUEL.**~~ → **automatisé depuis le 2026-08-30** (workflow
   nocturne → clé restreinte → `/opt/axion-audit/repo`), et **depuis le 2026-09-02 le clone qu'il
   exécute suit la livraison** au lieu d'attendre un humain — §6.3. La procédure de §5.4 reste
   reproductible telle quelle.
5. **La rétention MinIO à 30 archives complètes ne passera pas l'échelle** dès que les missions
   produiront des pièces jointes (§5.3).
6. 🔴 **LA PASSPHRASE DU COFFRE N'A QU'UN SEUL DÉTENTEUR** (D-3, question annexe non tranchée). Le
   coffre ferme le trou « on restaure les données sans les clés » et **en ouvre un autre, de la même
   famille** : si Williams devient indisponible et que son gestionnaire de mots de passe est perdu,
   `secrets-*.coffre.gpg` devient un fichier définitivement illisible — et les archives MinIO et le
   dépôt pgBackRest avec lui, puisque leurs passphrases sont **dedans**. **Aucune quantité de
   sauvegardes ne compense cela.** Décision humaine, §5.7bis.
7. ~~🔴 `mc mirror --remove` a supprimé de R2 un objet qu'il venait d'y écrire~~ → **CORRIGÉ le
   2026-08-31**, cause reproduite en bac à sable et garde-fou refait. Le miroir ne porte plus
   `--remove` ; la rétention distante est une passe séparée pilotée par inventaire, et la relecture
   par échantillon de trois objets est remplacée par une **comparaison d'inventaires complets**.
   §5.7ter réécrit ci-dessous. **Reste non vérifié** : rien de tout cela n'a tourné sur `axionia-web`
   ni contre le vrai bucket R2 — voir la fin du §5.7ter.

### 5.7bis ESCALADE — LE DÉPÔT DE LA PASSPHRASE DU COFFRE (pour Williams)

> **À trancher à la porte P-A.** Elle n'appartient à aucun agent (CLAUDE.md §3-4).
>
> _« [L0-b] La passphrase `BACKUP_SECRETS_PASSPHRASE` doit-elle être déposée ailleurs que chez un
> unique détenteur ?_
> _(a) **Statu quo** — un seul gestionnaire, un seul détenteur. Zéro coût, point de défaillance
> unique assumé et écrit._
> _(b) **Enveloppe scellée hors ligne** — la valeur imprimée, scellée, datée, rangée dans un lieu
> physique distinct (coffre bancaire, notaire). Coût : ~0 €, une heure. Ne dépend d'aucun
> fournisseur, ne fuit pas par le réseau. Contrainte : toute rotation de la passphrase oblige à
> refaire l'enveloppe, et une enveloppe périmée est pire qu'aucune._
> _(c) **Second détenteur** — un tiers de confiance reçoit la valeur par un canal hors bande. Coût
> nul, mais double la surface de fuite et suppose quelqu'un à désigner._
> _(d) **Partage à seuil (Shamir 2-sur-3)** — trois parts, deux suffisent. Ferme à la fois la perte
> et la fuite unique. Coût : un outil de plus à manipuler correctement le jour du sinistre, sous
> pression, par quelqu'un qui ne s'en sert jamais — c'est son vrai risque._
>
> _Ce que la décision doit fournir : le mode retenu, le ou les dépositaires, et **la date du
> prochain contrôle que la copie déposée est toujours lisible** — une copie de secours jamais
> relue n'est pas une copie de secours, c'est la leçon que ce lot a apprise trois fois. »_

**Procédure exacte si l'option (b) ou (c) est retenue** — elle ne demande aucun agent :

1. dans Coolify, ouvrir l'application Axion Audit → **Environment Variables** → révéler
   `BACKUP_SECRETS_PASSPHRASE` ;
2. la reporter sur le support choisi **sans passer par un ordinateur en réseau** (écrite à la main,
   ou imprimée depuis le gestionnaire de mots de passe) ; y joindre **une seule phrase** : « ouvre
   les fichiers `secrets-*.coffre.gpg` d'Axion Audit ; procédure dans `infra/README.md` §5.3bis » ;
3. sceller, dater, déposer ; noter **le lieu** (pas la valeur) dans le gestionnaire de mots de passe ;
4. **contrôler une fois** que la copie déposée est correcte — relire la valeur déposée et rouvrir un
   coffre avec elle, par §5.3bis. Sans ce contrôle, on a déposé une croyance ;
5. tracer dans `DECISIONS.md` : le mode, la date, le dépositaire, la date du prochain contrôle.
   **Jamais la valeur** — ni ici, ni dans un ticket, ni dans une conversation avec un agent.

### 5.7ter LE DÉFAUT DU MIROIR R2 — CE QU'IL FAUT SAVOIR AVANT DE S'Y FIER

**Le fait, mesuré, pas supposé.** Le 2026-08-29 à 04h30 UTC, comparaison exhaustive du contenu local
et du bucket : **1 613 objets attendus, 1 611 présents**. Les deux écarts :

| Objet manquant                        | Verdict                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| un segment WAL `…00000002D.zst`       | **normal** — archivé _après_ le passage du miroir, il partira à la passe suivante |
| `pgbackrest/backup/axion/backup.info` | 🔴 **anormal** — écrit par le miroir puis retiré dans la même passe               |

**Pourquoi c'est grave au-delà d'un fichier.** La relecture de contrôle du script ne vérifie que
**trois** objets (`backup.info`, la dernière archive MinIO, le dernier coffre). Elle a attrapé ce
cas-ci **parce que la victime était l'un des trois**. Rien ne garantit que ce soit toujours le cas :
une passe peut se déclarer **réussie** en laissant un trou ailleurs dans les 1 600 objets. **C'est
exactement le garde-fou menteur que le reste de ce lot a passé son temps à démonter.**

**Ce qui a été fait le 2026-08-29** : `backup.info` a été re-déposé par `mc cp` et **relu depuis R2 à
l'empreinte identique** (`e94aa1d76384b8f8…`). Le trou était fermé **pour cette passe**, et rien
n'avait été changé dans le script : cette section a longtemps porté la phrase « le défaut se
reproduira ». **Elle n'est plus vraie depuis le 2026-08-31, et voici ce qui la remplace.**

#### La cause, REPRODUITE — pas déduite (2026-08-31)

Bac à sable local : MinIO jetable + **le `mc` exact du Dockerfile** (`RELEASE.2025-04-16T18-13-26Z`),
dépôt pgBackRest reconstitué à **1 572 objets**, passe de ~30 s. Trois hypothèses ont été éprouvées
et **écartées par la mesure** : désynchronisation d'ordre entre le listeur système de fichiers et le
listeur S3 (les deux ordres sont identiques), réécriture atomique concurrente de `backup.info`
(sans effet), passe idempotente sur cible peuplée (aucune suppression). **Ce qui reproduit le défaut,
lui, est simple :**

- `mc mirror --remove` décide ses suppressions sur un **listage VIVANT de la source** et retire à
  destination tout objet absent de ce listage — **puis sort en 0** ;
- un objet retiré de la source à t+5 s d'une passe de 36 s est **encore transféré** par cette passe ;
- la passe **suivante** émet, verbatim, la ligne du journal du 2026-08-29 :
  `{"status":"success","source":"","target":"…/backup.info", …}` — « suppression à source vide » est
  la forme normale d'un enregistrement de suppression de `mc`, et le champ `source` vide en est la
  signature.

Et **deux passes par nuit sont ordinaires ici** : `doit_rattraper_expedition` rejoue `expedier_r2` à
chaque redémarrage du conteneur, c'est-à-dire à chaque hoquet de R2. Les deux lignes atterrissent donc
dans le même journal. **Condition nécessaire et suffisante de la perte : qu'un objet soit présent à
destination et absent de la source à l'instant où `mc` la liste.** Or `$DEPOT` est un dépôt pgBackRest
**vivant**, parcouru pendant des dizaines de secondes ; n'importe quel état transitoire de ce
répertoire devenait une suppression distante définitive.

**Contre-épreuve directe** : le code de `main`, avec `backup.info` absent du local pendant le miroir,
**supprime l'objet de R2**. Le code corrigé, dans la même situation, journalise « rien à purger » et
laisse l'objet **intact**.

#### ① Le miroir ne porte plus `--remove`

Retirer `--remove` et s'arrêter là aurait fait croître le bucket sans fin : la rétention distante
n'est portée par personne d'autre (aucune règle de cycle de vie Cloudflare — elle vivrait hors de
`git`). La purge est donc devenue une **passe séparée, pilotée par inventaire** :

1. inventaire local **avant** le miroir ; 2. miroir **en copie seule** ; 3. inventaires local **après**
   et distant ; 4. on ne purge que `distant − (avant ∪ après)` — **un objet que la passe vient d'écrire
   est intouchable** ; 5. les objets vitaux sont exclus **par leur nom** en plus ; 6. un **plafond**
   (`AXION_R2_PURGE_MAX_PCT`, 50 % par défaut, plancher `AXION_R2_PURGE_PLANCHER` = 20 objets) : au-delà,
   **aucune suppression**, le journal le dit et l'alerte part.

#### ② Le garde ne relit plus 3 objets sur 1 600, il compare des inventaires

C'est la moitié qui comptait le plus : l'échantillon de trois avait attrapé le cas du 2026-08-29
**par chance**, la victime étant l'un des trois. Le contrôle compare désormais les **inventaires
complets** (`mc find` local↔distant, le listage que le comptage payait déjà) et vérifie en plus, **par
leur nom et un par un**, `backup.info`, `backup.info.copy`, `archive.info`, `archive.info.copy`. La
relecture d'empreintes est conservée : l'inventaire prouve la **présence**, la relecture prouve le
**contenu**. **La comparaison d'inventaires n'est pas désactivable** — `AXION_R2_VERIFIER_RELECTURE`
ne commande que les empreintes.

#### La contre-épreuve du garde — rouge AVANT vert

| Essai                                                      | Attendu | Mesuré                                                                              |
| ---------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Ancien garde, **1 objet WAL** retiré à destination         | rouge   | 🔴 **VERT** — « expédition terminée — 1573 objet(s) », 3 relectures conformes       |
| Nouveau garde, **le même** objet                           | rouge   | ✅ code 2, objet **nommé** au journal, « 1 objet sur 1574 attendus manque »         |
| Nouveau garde, `backup.info` retiré **après** l'inventaire | rouge   | ✅ code 2, « l'objet VITAL … est ABSENT »                                           |
| Nouveau garde, trous rebouchés                             | vert    | ✅ code 0, « inventaire conforme — 1574 objet(s) », « objets vitaux présents »      |
| Purge légitime (50 WAL expirés localement)                 | purge   | ✅ « purge de 50 objet(s) », distant ramené à 1524                                  |
| Purge de masse (900 objets)                                | refus   | ✅ « purge REFUSÉE — 900 … dépassent le plafond de 762 », alerte, **0 suppression** |

**Deux pièges de `mc` découverts par cette contre-épreuve, et corrigés avant livraison** — ils
méritent d'être écrits parce qu'ils font des garde-fous verts sur du vide :

- **`mc ls <objet-absent>` sort en 0** avec une sortie vide ;
- **`mc stat <objet>` traite son argument comme un PRÉFIXE.** Mesuré : `backup.info` supprimé,
  `backup.info.copy` présent → `mc stat …/backup.info` **sort en 0 et affiche `backup.info.copy`**.
  La première version de la vérification nommée était bâtie dessus : elle a été **prise en défaut par
  sa propre contre-épreuve**. Seul `mc cat` exige l'objet exact, et c'est lui qui est utilisé ;
- accessoirement, **`mc rm` sur un objet inexistant écrit une erreur et sort en 0** : son code de
  sortie ne prouve pas la suppression.

#### Ce qui n'a PAS été vérifié

Rien de ceci n'a tourné sur `axionia-web` ni contre le vrai bucket R2 — **aucun accès n'a été demandé
ni utilisé**. Le bac à sable est **MinIO, pas R2** : la pagination de listage, les quotas de requêtes
et les codes d'erreur de Cloudflare ne sont pas éprouvés ici. `depot_local_sain` n'a pas été exercé
pour de vrai (pas de `pgbackrest` dans le bac : la fonction a été simulée à « sain »). Et le
§6 reste entier : **ce script n'a jamais tourné sur le serveur**. La première passe réelle après
déploiement reste le seul contrôle qui vaille — elle dira « inventaire conforme — N objet(s) », et
c'est ce N qu'il faudra comparer à la main, une fois.

---

## 6. LES SCRIPTS `infra/scripts/*.sh` — ce qu'ils valent réellement

### 🔴 Fait central : aucun d'eux ne peut tourner sur `axionia-web` aujourd'hui.

Deux raisons cumulées, chacune suffisante :

1. **Le dépôt n'est pas sur le serveur** (`ls -d /root/axion* /srv/axion* /home/*/axion*` →
   rien). Coolify clone dans un conteneur d'assistance détruit après le déploiement. Il n'y a donc
   littéralement **aucun fichier `.sh` de ce dossier sur la machine**.
2. **Ils s'adressent tous à un projet Compose qui n'existe pas.** `lib/common.sh` construit les
   commandes par `axion_compose` (`docker compose -f infra/docker-compose.yml -f …staging.yml`) et
   nomme les ressources par `axion_project_name` → **`axion-audit-staging`**. Le projet Compose réel
   est **`wrunr6mwq2oxqq392i4myzjn`**, et ses volumes portent des **tirets** là où les scripts
   attendent des **soulignés** (convention 5, §4.3).

| Script               | Utilisable sur le staging Coolify ?                                                        | État        |
| -------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| `provision-vps.sh`   | **NON — ET NE DOIT JAMAIS Y ÊTRE LANCÉ** (§7)                                              | interdit    |
| `deploy.sh`          | **NON** — c'est Coolify qui déploie ; le script exige `GHCR_OWNER` (absent du `.env` réel) | JAMAIS JOUÉ |
| `smoke-test.sh`      | **NON** — `axion_compose` + `axion_project_name`                                           | JAMAIS JOUÉ |
| `backup-postgres.sh` | **NON** — `axion_compose`, plus `STORAGE_BOX_*` absents du `.env` réel                     | JAMAIS JOUÉ |
| `backup-minio.sh`    | **NON** — idem (réseau nommé par `axion_project_name`)                                     | JAMAIS JOUÉ |
| `backup-caddy.sh`    | **NON** — idem, et le TLS du staging n'est plus chez nous                                  | JAMAIS JOUÉ |
| `install-cron.sh`    | **NON** — exige `RESTORE_TEST_CRON`, absent du `.env` réel                                 | JAMAIS JOUÉ |
| `restore-test.sh`    | **NON** — voir §6.2, trois causes distinctes                                               | JAMAIS JOUÉ |

### 6.1 `pnpm infra:restore-test` — ce qui a changé, et pourquoi

**Avant** (faux) : `bash infra/scripts/restore-test.sh /opt/axion-audit/prod/.env`
Ce chemin n'existe **sur aucune des deux machines** : ni sur le poste de développement, ni sur
`axionia-web`. Le script échouait donc toujours, et pour une raison qui n'était pas la vraie.

**Maintenant** : `bash infra/scripts/restore-test.sh` — **le chemin du `.env` se passe en argument**.

```bash
pnpm infra:restore-test /chemin/vers/.env     # pnpm transmet l'argument au script
```

Sans argument, le script **refuse de tourner** et **nomme la convention** (MESURÉ le 2026-08-28,
`pnpm -s infra:restore-test`, code de sortie 1) :

```
[ERROR] Fichier d’environnement illisible : /opt/axion-audit/<env>/.env
        — convention : /opt/axion-audit/<staging|prod>/.env (passer le chemin en argument).
```

> **Sur un poste Windows, ne passez pas le chemin depuis Git Bash.** MESURÉ :
> `pnpm infra:restore-test /chemin/bidon/.env` arrive au script sous la forme
> `C:/Program Files/Git/chemin/bidon/.env` — la conversion de chemin MSYS s'applique à tout
> argument commençant par `/`. C'est un artefact du poste, **pas** un défaut du script : sur le
> serveur Linux, où ce script est censé tourner, l'argument passe tel quel. Sur Windows, préférez
> `MSYS_NO_PATHCONV=1 pnpm infra:restore-test …` si vous devez vraiment l'invoquer localement.

**Pourquoi ce choix plutôt qu'un chemin « corrigé ».** Il n'existe aujourd'hui **aucun** chemin de
`.env` qui rendrait ce script fonctionnel (§6.2) : y écrire
`/data/coolify/applications/<uuid>/.env` produirait un script qui démarre, franchit le chargement de
l'environnement, puis meurt trois étapes plus loin sur un garde-fou — c'est-à-dire **un script qui
ment plus longtemps**. Le message ci-dessus refuse tout de suite, en français, en nommant la règle.
Le comportement était déjà prévu par `lib/common.sh` (`axion_env_file_default`, commentaire M-11) :
le `package.json` était le seul endroit qui le contournait.

**Les cinq autres scripts `infra:*` sont inchangés** : `infra:up`, `infra:down`, `infra:logs`,
`infra:reset`, `infra:config` visent la pile de **développement local** et ne mentionnent aucun
chemin serveur. Ils ne mentaient pas.

### 6.2 Ce qu'il faudrait décider avant que `restore-test.sh` puisse viser le staging

**Ce point n'est PAS corrigé, et il ne doit pas l'être par bricolage.** Trois désaccords entre le
script et la machine, dont un au moins relève d'une décision de spécification :

| #   | Le script attend                                | La machine a                                      | Nature                                       |
| --- | ----------------------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| 1   | le volume `axion-audit-staging_pgbackrest_repo` | `wrunr6mwq2oxqq392i4myzjn_pgbackrest-repo`        | **décision** : d'où vient le nom de projet ? |
| 2   | l'image `axion-audit-postgres:16` (`PG_IMAGE`)  | `axion-audit-postgres:16-coolify`                 | surchargeable par variable d'environnement   |
| 3   | `/var/backups/axion/{minio,caddy}/archives`     | absents — aucune sauvegarde MinIO ni TLS n'existe | dépend du §5                                 |

Le point 1 est le vrai : `axion_project_name()` **dérive** le nom de projet de `APP_ENV`, ce qui est
juste dans le montage « VPS dédié » et faux sous Coolify, où le nom est un uuid opaque imposé par
l'orchestrateur. Le rendre paramétrable est une modification du contrat d'exploitation
(`CLAUDE.md` §3-2), pas un ajustement d'agent.

> **ESCALADE À OUVRIR** — proposition d'entrée `DECISIONS.md`, à instruire par A01 :
> _« [L0-b] Les scripts d'exploitation dérivent le nom de projet Compose d'`APP_ENV` ; sous Coolify
> ce nom est un uuid imposé. Options : (a) `AXION_COMPOSE_PROJECT` surchargeable dans le `.env`,
> (b) un `restore-test-coolify.sh` distinct qui parle à `docker` sans passer par Compose,
> (c) renoncer au test de restauration sur le staging Coolify et ne le tenir que sur la prod. »_
> A57 n'a pas écrit cette entrée lui-même : `DECISIONS.md` est en cours d'édition par un autre agent.

### 6.3 Le clone `/opt/axion-audit/repo` SUIT LA LIVRAISON — amendement du 2026-09-02

> **Ce paragraphe date le « fait central » du §6.** Depuis le 2026-08-30, une copie du dépôt existe
> sur `axionia-web`, en `/opt/axion-audit/repo` : c'est elle que le test de restauration nocturne
> exécute (`restore-test-ci.sh` → `./infra/scripts/restore-test.sh`). Jusqu'au 2026-09-02, **rien ne
> la mettait à niveau** : le garde nocturne comparait son commit à celui de `main` et rougissait après
> chaque fusion (trois nuits de suite), pour une raison qui n'était pas celle qu'il surveille
> (`DECISIONS.md`, 2026-08-31 « Rien ne met à niveau le clone »). **Williams a tranché le 2026-09-02**
> (« fais tout selon tes recommandations ») ; voici ce qui tourne désormais, et ce qu'il faut savoir.

**Le mécanisme, en trois lignes.**

1. **La livraison remet le clone à niveau.** À chaque fusion sur `main`, le job `8 · deploy-staging`
   déclenche `/opt/axion-audit/deploy-staging.sh` par sa clé restreinte ; ce script, **en dernière
   étape** (après que le déploiement a pris effet), fait `git fetch origin main` puis
   `git checkout --detach <sha livré>` dans `/opt/axion-audit/repo` — **le sha, jamais une branche** :
   le clone est exactement ce que la CI a livré. Il publie `CLONE_SERVEUR=<sha40>` ; le workflow
   vérifie que c'est bien `github.sha`, sinon rouge **en nommant le clone** (le staging, lui, est déjà
   en service).
2. **Le nocturne vérifie AVANT d'éprouver.** Le workflow lit le sha de `main` (`git ls-remote`) et
   l'envoie sur l'entrée standard de `restore-test-ci.sh`. Si le clone n'y est pas, le script **refuse
   avant toute restauration** (`REFUS_CLONE_HORS_MAIN attendu=… serveur=…`, code 3) et le journal dit
   « RESTAURATION NON TENTÉE » — il n'y a pas de verdict de restauration cette nuit-là, et c'est écrit.
3. **Le test à blanc** : `bash infra/scripts/test-garde-clone.sh` joue les deux sens (clone à jour ⇒
   éprouve ; clone en retard ⇒ refus nommé, avant tout) et chaque garde-fou de l'alignement, sur un
   dépôt git jetable — 31 cas, jamais sur le serveur, jamais sur ce dépôt.

**Ce que la clé restreinte n'a PAS gagné : rien.** `authorized_keys` porte toujours
`command="/opt/axion-audit/deploy-staging.sh",restrict` ; la clé ne peut toujours exécuter que ce
fichier, dont l'empreinte est comparée au dépôt avant toute conclusion. C'est **le script** qui a gagné
un pouvoir (écrire dans le clone), d'où ses garde-fous, tous refusants et tous joués par le test :
origine `origin` vérifiée (le dépôt public `will383842/Axion-Audit`, rien d'autre) · branche **en dur**
(`main`) · le sha doit être **atteignable depuis `origin/main`** et **descendre du commit courant** du
clone (aucune réécriture d'historique suivie) · **modifications locales ⇒ refus**, rien n'est écrasé en
silence (invariant 7) · sha **complet** (40 hexa) exigé — `deploy-staging.sh` refuse désormais un sha
abrégé, ce qui ne change rien pour la CI, qui a toujours envoyé `github.sha`.

**Ce que cela ne couvre pas, dit au même endroit.** Une nuit où `main` a avancé sans que le job de
déploiement ait tourné vert (CI rouge sur `main`, Coolify en panne) est une **livraison manquée** : le
nocturne rougit, et c'est la bonne raison. Une fusion malveillante dans `main` passe — la parade est
la protection de branche et la revue croisée, pas ce script (entrée du 31/08, inchangée).

**À FAIRE À LA MAIN SUR LE SERVEUR, UNE FOIS, AVANT LA PREMIÈRE EXÉCUTION.** Les deux enveloppeurs
vivent en copie hors du clone et sont contrôlés par empreinte : tant que les copies serveur sont les
anciennes, **le job de déploiement rougira sur l'empreinte et n'alignera rien**, et le nocturne
rougira de même. Ordre : **copier, PUIS fusionner** (entre les deux, aucun déploiement ne doit tourner).

```bash
# 1. Pré-contrôles du clone (état mesuré le 2026-09-02 : HEAD = e234756, ancêtre de main — la
#    première mise à niveau se fera donc SEULE au premier déploiement vert, si ces trois lignes passent)
git -C /opt/axion-audit/repo remote get-url origin   # doit être https://github.com/will383842/Axion-Audit.git
git -C /opt/axion-audit/repo status --porcelain --untracked-files=no   # doit être VIDE
git -C /opt/axion-audit/repo fetch --dry-run origin main               # réseau sortant vers github.com

# 2. Poser les deux enveloppeurs versionnés (depuis la branche fusionnée, ou main après fusion)
install -m 755 infra/scripts/deploy-staging.sh  /opt/axion-audit/deploy-staging.sh
install -m 755 infra/scripts/restore-test-ci.sh /opt/axion-audit/restore-test-ci.sh
sha256sum infra/scripts/deploy-staging.sh /opt/axion-audit/deploy-staging.sh      # identiques
sha256sum infra/scripts/restore-test-ci.sh /opt/axion-audit/restore-test-ci.sh    # identiques
```

Si `remote get-url` rend une URL SSH (`git@github.com:…`), le garde refusera : le corriger par
`git -C /opt/axion-audit/repo remote set-url origin https://github.com/will383842/Axion-Audit.git`
(dépôt public, aucun identifiant requis). Le clone reste ensuite en **HEAD détachée** au sha livré —
c'est voulu ; pour le remettre à niveau à la main : `git -C /opt/axion-audit/repo fetch origin main &&
git -C /opt/axion-audit/repo checkout --detach <sha>`. **Non joué sur le serveur** à la date de cet
amendement : seul le test à blanc a tourné.

---

## 7. LE CHEMIN « VPS DÉDIÉ » — décrit, JAMAIS JOUÉ

**Tout ce chapitre décrit l'installation d'une pile Axion Audit sur un VPS NEUF ET VIDE. C'est le
chemin visé pour la PRODUCTION. Il n'a jamais été exécuté, nulle part.** Aucune de ses commandes ne
doit être lancée sur `axionia-web`.

### 7.1 ⛔ `provision-vps.sh` sur une machine habitée

> **Ce script est écrit pour un serveur neuf.** Sur `axionia-web`, qui sert `axion-ia.com`, il fait
> au moins trois choses dangereuses, vérifiées ligne à ligne par A54 :
>
> 1. il fait **passer SSH du port 22 au port 2222** et redémarre le démon — toute nouvelle connexion
>    sur 22 échoue ;
> 2. il **active UFW**, aujourd'hui inactif, ce qui coupe l'accès humain à SSH sur 22 ;
> 3. il **installe Docker CE** par-dessus l'installation existante — le remplacement redémarre le
>    démon, donc **arrête tous les conteneurs, y compris le site de production**.
>
> Un quatrième effet ne se produit ici que par chance de conception : `userns-remap` n'est écrit que
> si `/etc/docker/daemon.json` est absent.
>
> **Sur `axionia-web`, on n'exécute PAS ce script.** Procédure de cohabitation :
> `infra/COHABITATION_AXIONIA_WEB.md`.

### 7.2 Convention de chemin du `.env` — pour le montage VPS dédié

```
/opt/axion-audit/<env>/.env        avec <env> ∈ { staging, prod }
```

**Il n'existe PAS de `/opt/axion-audit/.env`.** Le 02 §30.4-4 impose des valeurs distinctes par
environnement : un fichier unique ne peut pas porter deux bases, deux jeux de clés JWT et deux jeux
de buckets. Un fichier à la racine ferait **silencieusement réussir** un script appelé sans argument
sur un modèle plein de `__CHANGEME__` — la panne la plus coûteuse à diagnostiquer. **Tout appelant
passe le chemin explicitement** (revue croisée M-11 ; voir §6.1).

**Ce chemin n'existe sur aucune machine à ce jour.** Il décrit une convention, pas un fait.

| Secret (02 §30.3)                                                                    | Génération                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_*_PASSWORD`, `MINIO_SECRET_KEY`        | `openssl rand -base64 32`                   |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (**deux valeurs distinctes**)              | `openssl rand -hex 64`                      |
| `APP_ENCRYPTION_KEY`                                                                 | `openssl rand -hex 32`                      |
| `BACKUP_ENCRYPTION_PASSPHRASE`, `PGBACKREST_CIPHER_PASS`                             | `openssl rand -base64 48`                   |
| `ANTHROPIC_API_KEY`, `DOCXTEMPLATER_LICENSE`, `TELEGRAM_*`, `CONSOLE_WEBHOOK_SECRET` | fournis par le service concerné             |
| `GHCR_OWNER`, `IMAGE_TAG`                                                            | non secrets : compte GitHub et tag d'images |

`API_PORT` est une **convention commune aux deux environnements** (arbitrage A01 du 2026-08-27) : le
port n'est jamais publié, il n'a aucune raison de différer, et deux copies à tenir à la main seraient
une panne en attente. **Ne pas le changer sans le changer dans LES DEUX `.env`.**

> **Le `.env` du staging Coolify ne suit PAS cette convention** — il est posé par Coolify (§4.1). Il
> porte 72 variables, dont `APP_ENV`, `API_PORT=3000`, `PGBACKREST_STANZA`, `PGBACKREST_REPO_PATH`,
> les secrets et les URL. **Il ne contient ni `STORAGE_BOX_*`, ni `RESTORE_TEST_CRON`, ni
> `GHCR_OWNER`, ni `DEPLOY_PATH`, ni aucune variable `CADDY_*`** — les scripts qui les exigent
> échoueraient donc même en pointant ce fichier (§6).

### 7.3 Premier déploiement, PRA, rotation, rollback — **PROCÉDURES NON JOUÉES**

Les sections qui suivaient dans la version précédente de ce fichier (premier déploiement par
`deploy.sh`, PRA en 7 étapes avec RTO 4 h, tableau de rotation des secrets, rollback par
`deploy.sh --rollback`, diagnostic du test de restauration nocturne) **décrivent un système qui n'a
jamais tourné**. Elles ne sont pas fausses en soi ; elles ne sont **rien de plus qu'une intention
écrite**.

**Ce qui est certain à leur sujet, et qui doit être dit avant qu'on s'y fie :**

- **Aucune de ces commandes n'a jamais été exécutée**, ni sur `axionia-web` (rien n'y est installé),
  ni ailleurs (aucun autre VPS n'existe).
- Le **RTO de 4 h** est une **cible calculée**, jamais chronométrée. Tant que le PRA n'a pas été
  joué une fois de bout en bout, ce chiffre n'engage personne.
- La table de diagnostic du test de restauration nocturne décrit les messages d'un script **qui n'a
  jamais produit un seul rapport** : `/var/log/axion` n'existe pas.
- Le tableau de rotation des secrets décrit des effets **jamais observés**.
- Le rollback repose sur `/opt/axion-audit/<env>.deployed-tags`, un fichier **qui n'existe pas**.

Elles seront réintroduites ici **au fur et à mesure qu'elles seront jouées**, chacune avec la date
et la preuve de son exécution. En attendant, la source d'exécution reste le pack (02 §11.4, §30.4,
§30.6) et les scripts eux-mêmes, qui sont lisibles.

> **La seule chose de ce chapitre qui soit acquise** est l'ordre du premier démarrage, parce qu'il
> a été appliqué au staging : `pgbackrest stanza-create` **avant** tout le reste. `archive_mode` est
> à `on` dès le premier démarrage (`postgres/postgresql.custom.conf`) ; tant que la stanza n'existe
> pas, `archive_command` échoue à chaque WAL et les journaux s'entassent dans `pg_wal`. Sur le
> staging, la stanza existe et `failed_count = 0` (§5) : **cette partie-là a marché.**

### 7.4 LA SAUVEGARDE SUR CE CHEMIN — ce qui existe, ce qui manque, et pourquoi on n'y greffe pas le service `sauvegarde`

**Ce qui suit corrige une phrase fausse que trois fichiers de ce dépôt portaient jusqu'au
2026-08-28**, chacun sous une forme différente : « la pile de production n'a AUCUN service de
sauvegarde » — donc, sous-entendu, aucune sauvegarde. **Vrai du fichier compose ; faux de la cible.**
C'est le défaut que ce lot traque depuis deux jours, appliqué à lui-même : une propriété vérifiée sur
un artefact, énoncée comme une propriété du système.

**CE QUI EXISTE SUR CE CHEMIN, ET QUI NE VIT PAS DANS LE COMPOSE.** `install-cron.sh` pose
`/etc/cron.d/axion-audit` et cinq tâches, lues ligne à ligne :

| Tâche                | Fréquence            | Ce qu'elle fait réellement                                                                                                                                                                                    |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backup-postgres.sh` | toutes les 6 h       | `pg_dump -Fc` chiffré GPG · `pgbackrest backup` (full le dimanche, bascule d'office en full si aucune n'existe) · `pgbackrest check` · **rsync Storage Box**                                                  |
| `backup-minio.sh`    | 01h30                | `mc mirror` des 3 buckets · manifeste SHA-256 · archive chiffrée · **rsync Storage Box** · `rclone` hebdo hors Hetzner                                                                                        |
| `backup-caddy.sh`    | 01h45                | magasin TLS (clés privées des DEUX domaines) chiffré · relecture + comptage des certificats · Storage Box                                                                                                     |
| `restore-test.sh`    | `$RESTORE_TEST_CRON` | **le test de restauration NOCTURNE** — que le chemin Coolify n'a justement pas (il y est manuel, §5.4-5.5)                                                                                                    |
| `sonde-alertes.sh`   | horaire (minute 17)  | **les quatre seuils `ALERT_*` du 02 §11.3 et de l'invariant 8** : disque, expiration TLS, sync muette, job LLM trop long. Alerte Telegram, ET alerte sur sa PROPRE cécité (fiche O-2, ABSORBÉE le 2026-08-31) |

> **⚠️ CETTE CINQUIÈME TÂCHE N'EST QUE LA MOITIÉ « VPS DÉDIÉ » DE LA SONDE — c'est-à-dire la moitié
> qui n'a jamais tourné.** L'autre moitié est le service `sonde` de `docker-compose.coolify.yml`,
> **porté le 2026-08-31**, sur lequel repose réellement l'invariant 8 aujourd'hui. Les deux exécutent
> LE MÊME script, à la MÊME minute (`AXION_SONDE_MINUTE`), avec les MÊMES seuils. Ce qui change est
> la façon d'atteindre les données, et c'est tout l'objet du portage :
>
> |                | chemin VPS (`AXION_SONDE_MODE=hote`)      | pile Coolify (`AXION_SONDE_MODE=pile`)                                                                       |
> | -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
> | déclenchement  | ligne `cron` ci-dessus                    | boucle interne du service (motif du side-car `sauvegarde`)                                                   |
> | environnement  | `.env` passé en argument                  | processus (Coolify l'injecte)                                                                                |
> | PostgreSQL     | `docker compose exec`                     | **connexion réseau**, mot de passe par `PGPASSWORD`                                                          |
> | disque         | `df` sur les points de montage de l'hôte  | `df /` — l'overlay, porté par le système de fichiers de `/var/lib/docker`, **aucun volume de données monté** |
> | certificat TLS | volume `caddy_data` via conteneur jetable | **SANS OBJET** — voir ci-dessous                                                                             |
> | socket Docker  | oui (on est sur l'hôte)                   | **JAMAIS**                                                                                                   |
>
> **CE QUE LE PORTAGE A DÉCOUVERT, ET QUI RESTE OUVERT : sur la pile Coolify il n'y a AUCUN
> certificat à surveiller.** `CADDY_SITE_ADDRESS: ':8080'` fait écouter Caddy en HTTP simple — son
> propre encadré « ADRESSES DE SITE » l'écrit : « il ne tente aucun ACME et ne présente aucun
> certificat », TLS étant terminé par Traefik. Le volume `caddy_data` y est donc vide de certificats
> par construction, et le monter ne dirait rien. Le certificat qui compte est celui de **Traefik**,
> qui vit dans les données de Coolify — hors de portée de cette pile, et il doit le rester (y accéder
> serait l'élévation de privilège refusée au service `sauvegarde`). **CONSÉQUENCE :
> `ALERT_CERT_EXPIRY_DAYS` n'est honoré par PERSONNE sur le chemin exploité.** La sonde le
> journalise à chaque passe en catégorie « sans objet » — ni vert, ni aveuglement — au lieu de le
> compter comme un contrôle réussi. **C'est un arbitrage à porter, pas un trou que ce script peut
> fermer** : tableau §8, ligne 2i.

**La copie hors serveur EXISTE donc sur ce chemin** (Storage Box + copie hebdomadaire hors Hetzner,
règle 3-2-1), et la restauration y est **automatisée**, ce qui n'est pas le cas sous Coolify. Ce que
ce chemin n'a pas, c'est un service de sauvegarde **dans le compose** — parce que sur un VPS dédié on
a l'hôte, donc `cron`, ce qui est exactement ce que le side-car de la pile Coolify remplace faute de
pouvoir y accéder (voir l'encadré « pourquoi un side-car » de `infra/postgres/sauvegarde.sh`).

**POURQUOI ON N'AJOUTE PAS LE SERVICE `sauvegarde` À `.prod.yml` NI À `.staging.yml`** — décision de
l'agent d'infrastructure, tracée dans l'encadré « LA SAUVEGARDE DE CETTE PILE » de
`infra/docker-compose.prod.yml`, quatre raisons vérifiées :

1. **Deux écrivains sur la même stanza pgBackRest** (cron toutes les 6 h + conteneur chaque nuit) :
   verrou de stanza, le perdant sort en erreur → boucle de redémarrage d'un côté, piège `ERR` et
   alerte Telegram de l'autre. Deux fausses alertes par nuit, et une rétention pilotée de deux
   endroits.
2. **Deux copies complètes du volume MinIO par nuit**, sur le même disque, avec deux rotations
   différentes (`-mtime` côté script d'hôte, par rang côté conteneur).
3. **Deux destinations hors serveur, alors que laquelle n'est pas tranchée.** L'escalade §5.6 (« où
   part la copie hors serveur, et à quel coût ? », quatre options) est **OUVERTE et appartient à
   Williams**. Écrire R2 dans `.prod.yml` la trancherait par la main d'un agent — interdit (11 §8,
   `CLAUDE.md` §3).
4. **Ça casserait le premier `up` d'un serveur neuf.** Les quatre `BACKUP_R2_*` sont en `${…:?}` ;
   Compose interpole avant tout le reste ; le `.env` d'un VPS fraîchement provisionné est une copie
   de `.env.example`, où `BACKUP_R2_ENDPOINT=__CHANGEME__`. Non vide → `:?` satisfait → la pile
   démarre, puis le contrôle de forme du script refuse le `_`, sort en 1, et le service part en
   boucle de redémarrage **le jour de la mise en production**. Un service qui empêche une pile de
   démarrer parce que la sauvegarde n'est pas configurée est un remède pire que le mal.

S'y ajoute un coût de plomberie qui suffirait à lui seul : `sauvegarde` a besoin du socket de
PostgreSQL (`postgres_socket`), **qui n'existe dans aucune des trois piles de `docker-compose.yml`**
— `stanza-create.sh` utilise `--no-online` précisément pour ne jamais avoir à l'ajouter. Le poser
obligerait à modifier la pile de **dév** pour servir une pile que personne n'exécute.

> **⚠️ CE PARAGRAPHE NE REND RIEN « COUVERT ». `JAMAIS JOUÉ` RESTE VRAI, INTÉGRALEMENT.** Aucune des
> quatre tâches ci-dessus n'a jamais tourné nulle part (§6 : les scripts ne peuvent pas s'exécuter
> sur `axionia-web`, et aucun autre VPS n'existe). `/var/log/axion` n'existe pas ; aucun rapport de
> `restore-test.sh` n'a jamais été produit. **Un service déclaré n'est pas un service qui tourne, et
> une tâche cron décrite n'est pas une tâche cron installée.** Ce que cette section change est le
> DIAGNOSTIC, pas l'état : on cesse de croire qu'il manque une chaîne, on voit qu'il manque deux
> pièces à une chaîne écrite et jamais éprouvée.

**LES DEUX TROUS RÉELS DE CE CHEMIN — et ce ne sont pas ceux qu'on croyait :**

**A. Le coffre des secrets n'existe pas.** Aucun des quatre scripts ne sauvegarde
`/opt/axion-audit/<env>/.env`. Ce que le dépôt prévoit est **une commande affichée une fois** dans le
message de fin de `provision-vps.sh` (étape 4 : `gpg --symmetric … -o /tmp/env.gpg`), à taper à la
main, jamais rejouée à une rotation de secret, et dont le résultat reste dans `/tmp`. C'est la leçon
d'ouverture de `sauvegarde.sh` — « une commande qu'un humain doit taper sera oubliée » — non
appliquée à l'objet le plus cher : sans ces clés, une restauration rend des octets chiffrés et pas
une pile (02 §30.4-2). **Aggravant :** `infra/pgbackrest/pgbackrest.conf` affirme en toutes lettres
que la passphrase du dépôt « est elle-même sauvegardée chiffrée dans la Storage Box avec le .env ».
**Rien ne le fait.** Un garde-fou menteur de plus, dans un fichier versionné.

**B. Rien ne détecte le SILENCE de la chaîne.** Les quatre tâches de SAUVEGARDE alertent sur **échec**
(`axion_notify` depuis un piège `ERR`) ; **aucune n'alerte sur l'absence**. Or `install-cron.sh` est
une étape **manuelle** — `provision-vps.sh` l'affiche en étape 5, il ne l'exécute pas. Une production
peut donc vivre sans une seule sauvegarde **et sans une seule alerte**. C'est exactement le mode de
panne que `sauvegarde-healthcheck.sh` attrape sur le chemin Coolify (fraîcheur de deux marqueurs +
existence et empreinte des artefacts) ; **il n'a aucun équivalent ici.**

Ces deux points sont des **fiches d'amélioration à arbitrer** (09 §5.9, étage 2), pas du code à
écrire au jugé dans une pile jamais jouée. Ils sont reportés au tableau §8 (lignes 2f et 2g).

---

## 8. CE QUI RESTE FAUX, INCERTAIN OU OUVERT

Écrit ici plutôt que tu, pour que la porte P-A puisse le relire point par point.

| #   | Point                                                                                                                                                                                                          | Statut                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.env` du staging en `644` dans un répertoire `755`                                                                                                                                                            | **ÉCART DE SÉCURITÉ OUVERT** — posé par Coolify à chaque déploiement, non corrigeable à la main                                                                                                            |
| 2   | Sauvegarde restaurable du staging                                                                                                                                                                              | **FERMÉ le 2026-08-28** — complète `status: ok`, restauration Postgres ET MinIO jouées, empreinte identique ; §5.1, §5.4, §5.5                                                                             |
| 2b  | `createstanza` et la sonde honnête n'avaient JAMAIS tourné (stanza créée à la main)                                                                                                                            | **FERMÉ au déploiement de 07h39** — `createstanza … Exited (0)`, sonde `axion-healthcheck` ; §5.0                                                                                                          |
| 2c  | Le service `sauvegarde` est écrit et joué, **pas déployé**                                                                                                                                                     | **OUVERT** — exige un déploiement ; §5.2                                                                                                                                                                   |
| 2d  | Aucune copie hors serveur : la règle 3-2-1 du 02 §11.4 n'est pas tenue                                                                                                                                         | **ESCALADE OUVERTE — décision Williams** ; §5.6                                                                                                                                                            |
| 2e  | Rétention MinIO = 30 archives COMPLÈTES : ne passera pas l'échelle des pièces jointes                                                                                                                          | **OUVERT** — garde-fou de plafond en place, décision à prendre avant les premières missions ; §5.3                                                                                                         |
| 2f  | Chemin VPS dédié : le `.env` n'est sauvegardé par AUCUN script (coffre des secrets absent)                                                                                                                     | **OUVERT — fiche d'amélioration** ; §7.4-A. Aggravant : `pgbackrest.conf` affirme le contraire                                                                                                             |
| 2g  | Chemin VPS dédié : rien ne détecte le SILENCE de la chaîne cron (alerte sur échec seulement)                                                                                                                   | **OUVERT — fiche d'amélioration** ; §7.4-B. `install-cron.sh` est une étape MANUELLE                                                                                                                       |
| 2h  | « La pile de prod n'a AUCUNE sauvegarde » (3 fichiers l'écrivaient)                                                                                                                                            | **CORRIGÉ le 2026-08-28** — vrai du compose, FAUX de la cible : `install-cron.sh` pose 4 tâches ; §7.4                                                                                                     |
| 2i  | `sonde-alertes.sh` (fiche O-2) n'était planifiée que par `cron` : la pile Coolify — le chemin ÉPROUVÉ — ne l'exécutait pas                                                                                     | **CORRIGÉ le 2026-08-31** — service `sonde` de `docker-compose.coolify.yml` (réseau au lieu du socket Docker, boucle interne au lieu de `cron`). Contre-épreuve rejouée EN ENTIER dans cette configuration |
| 2j  | Sur la pile Coolify, `ALERT_CERT_EXPIRY_DAYS` n'est honoré par PERSONNE : Caddy y écoute en HTTP simple et n'émet aucun certificat ; celui qui compte est à Traefik, hors de notre portée et il doit le rester | **OUVERT — arbitrage à demander** ; encadré du §7.4. Découvert par le portage du 2026-08-31. La sonde le déclare « sans objet » à chaque passe plutôt que de le compter vert                               |
| 3   | `restore-test.sh` ne sait pas parler à un projet Compose imposé par un orchestrateur                                                                                                                           | **ESCALADE À OUVRIR** — §6.2                                                                                                                                                                               |
| 4   | `PUBLIC_BASE_URL` désigne `audit-staging.axion-ia.com`, qui **ne résout pas**                                                                                                                                  | **OUVERT** — le domaine réel est l'adresse `sslip.io` de Coolify                                                                                                                                           |
| 5   | Routage Traefik → Caddy : port cible non déclaré, 504 au relevé                                                                                                                                                | **EN COURS** par un autre agent — ne pas figer                                                                                                                                                             |
| 6   | Duplication `docker-compose.coolify.yml` ↔ `docker-compose.yml` non gardée                                                                                                                                     | **OUVERT** — `AMELIORATIONS.md` 2026-08-28, « la troisième convention d'A11 »                                                                                                                              |
| 7   | Tags MinIO / `mc` / Caddy figés : « dernière release stable au démarrage » (11 §1)                                                                                                                             | à confirmer au provisionnement réel de la production, puis à geler                                                                                                                                         |
| 8   | `deploy.sh` appelle `pnpm db:migrate:check` puis `pnpm db:migrate` dans l'image `api`                                                                                                                          | les deux scripts existent à la racine (`package.json`) ; **leur présence dans l'image n'est pas vérifiée**                                                                                                 |
| 9   | Le PRA (§7.3) et la rotation des secrets                                                                                                                                                                       | **JAMAIS JOUÉS** — RTO 4 h non chronométré                                                                                                                                                                 |
| 10  | `docker image prune -af` toutes les 6 h par le crontab du voisin                                                                                                                                               | **NON VÉRIFIÉ** : effet réel sur nos images entre deux déploiements                                                                                                                                        |
| 11  | Contrôle nominatif des 12 familles de secrets §30.3 dans le `.env` du staging                                                                                                                                  | **NON VÉRIFIÉ** — appartient à Williams, pas à un agent (porte P-A, §G.6-1)                                                                                                                                |
| 12  | Consommation CPU/RAM réelle du staging en cohabitation                                                                                                                                                         | **NON VÉRIFIÉ** dans cette passe — seules les marges d'avant déploiement sont tracées (`DECISIONS.md`)                                                                                                     |

### Ce qui a été mesuré, et qu'il ne faut pas re-suspecter

Pour éviter qu'une prochaine revue reparte à zéro : **la pile de staging fonctionne**. Les neuf
services se comportent comme le fichier compose le décrit (six `Up (healthy)`, trois `Exited (0)`
attendus), aucun port de données n'est publié, l'API répond `{"status":"ok"}` derrière notre Caddy
avec l'intégralité des en-têtes de sécurité, l'isolement réseau est celui qui a été arbitré, et
l'archivage WAL de PostgreSQL tourne sans échec. Depuis le 2026-08-28 07h24, **une sauvegarde
complète valide existe** et **la restauration a été jouée**, Postgres comme MinIO, empreinte du jeu
de référence identique des deux côtés (§5.1, §5.4, §5.5). **Ce qui manque est autour : la copie hors
serveur, le routage public, et l'outillage d'exploitation.**
