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
| Sauvegardes              | **AUCUNE** (§5)                                               | décrites, **JAMAIS JOUÉES**                         |

**Sections à lire selon ce que vous cherchez :**

| Vous cherchez…                                             | Allez au…                                     |
| ---------------------------------------------------------- | --------------------------------------------- |
| La confrontation « ce que disait ce fichier » ↔ la machine | **§1**                                        |
| Le staging réel : chemins, noms, réseaux, conventions      | **§4** (tout est MESURÉ)                      |
| L'état de la sauvegarde et de la restauration              | **§5** — réponse courte : **il n'y en a pas** |
| Ce que valent les scripts `infra/scripts/*.sh`             | **§6**                                        |
| Le développement local                                     | **§3**                                        |
| Le chemin « VPS dédié » (prod future)                      | **§7** — intégralement **JAMAIS JOUÉ**        |
| Les conditions de cohabitation avec `axion-ia.com`         | `infra/COHABITATION_AXIONIA_WEB.md`           |
| Les arbitrages Coolify (Traefik, build serveur)            | `DECISIONS.md`, entrées du **2026-08-28**     |
| Les garde-fous nés des déploiements ratés                  | `AMELIORATIONS.md`, fiche du **2026-08-28**   |

---

## 1. CONFRONTATION À LA MACHINE — affirmation, mesure, verdict

Méthode : `ssh axionia-web '<commande>'` depuis le poste de développement, 2026-08-28 ~06h40 UTC.
**Attention à la forme de la commande SSH** : `ssh root@178.105.55.15` échoue
(`Permission denied (publickey)`) ; c'est l'alias `axionia-web` de `~/.ssh/config` qui porte la clé
`~/.ssh/axion_audit_ed25519`. Équivalent explicite :
`ssh -i ~/.ssh/axion_audit_ed25519 -o IdentitiesOnly=yes root@178.105.55.15`.

| Ce que ce fichier affirmait                                                          | Commande                                                                                 | Ce que dit la machine                                                                                              | Verdict                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `/opt/axion-audit` est la racine d'exploitation                                      | `ls -la /opt`                                                                            | `axion-ia`, `containerd`. **Pas d'`axion-audit`**                                                                  | **FAUX** — corrigé §4.1                                    |
| `/opt/axion-audit/<env>/.env` porte les secrets                                      | `ls /opt/axion-audit`                                                                    | `No such file or directory`                                                                                        | **FAUX** — corrigé §4.1                                    |
| `pnpm infra:restore-test` → `/opt/axion-audit/prod/.env`                             | lecture de `package.json` + `ls`                                                         | chemin inexistant ; script corrigé, voir §6.1                                                                      | **FAUX** — corrigé                                         |
| Le dépôt est cloné dans `/opt/axion-audit/repo`                                      | `ls -d /root/axion* /srv/axion* /home/*/axion*`                                          | **aucune copie du dépôt sur le serveur**                                                                           | **FAUX** — §4.5                                            |
| `/var/backups/axion` reçoit les sauvegardes                                          | `ls -la /var/backups/axion`                                                              | `No such file or directory`                                                                                        | **FAUX** — §5                                              |
| `/var/log/axion` reçoit les rapports horodatés                                       | `ls -la /var/log/axion`                                                                  | `No such file or directory`                                                                                        | **FAUX** — §5                                              |
| `/etc/cron.d/axion-audit` planifie les 4 tâches                                      | `cat /etc/cron.d/axion-audit` · `ls /etc/cron.d`                                         | absent ; `/etc/cron.d` ne contient que `e2scrub_all` et `sysstat`                                                  | **FAUX** — §5                                              |
| Le magasin TLS et les archives sont poussés sur une Storage Box                      | `ls -la /root/.ssh/`                                                                     | seul `authorized_keys` — **aucune clé `storagebox_ed25519`**                                                       | **FAUX** — §5                                              |
| La copie hors Hetzner se fait par `rclone`                                           | `command -v rclone`                                                                      | **ABSENT** (`gpg`, `curl`, `openssl`, `sha256sum`, `rsync` sont présents)                                          | **FAUX** — §5                                              |
| Volumes du staging nommés `axion-coolify-*`                                          | `docker volume ls`                                                                       | **aucun** `axion-coolify-*` ; les vrais sont `wrunr6mwq2oxqq392i4myzjn_*`                                          | **FAUX** — §4.3, convention 5                              |
| Volume `axion-staging-field-dist` / `-hq-dist`, réseau `axion-edge-staging`          | `docker volume ls` · `docker network ls`                                                 | **aucun des trois n'existe** (ce sont les noms du montage « VPS dédié »)                                           | **FAUX pour le staging**                                   |
| `provision-vps.sh` a créé l'arborescence et les deux `.env`                          | `ls /opt` (ci-dessus)                                                                    | rien de tout cela ; le script n'a **jamais** tourné sur cette machine                                              | **VRAI mais trompeur** — il **ne doit pas** y tourner, §7  |
| L'unique Caddy de prod sert les deux environnements sur 80/443                       | `docker ps` (colonne `PORTS`)                                                            | 80/443 appartiennent à `coolify-proxy` (Traefik). Notre Caddy **ne publie aucun port**                             | **FAUX pour le staging**                                   |
| `https://audit-staging.<domaine>/api/v1/health` → 200                                | `getent hosts audit-staging.axion-ia.com`                                                | **non résolu** — l'enregistrement DNS n'existe pas                                                                 | **FAUX** — §4.6                                            |
| Le staging est joignable publiquement                                                | `curl -o /dev/null -w '%{http_code}' http://<uuid>.178.105.55.15.sslip.io/api/v1/health` | **404** à 06h41, **504** à 06h47 (redéploiement en cours par un autre agent)                                       | **FAUX à l'heure du relevé** — §4.6                        |
| §5.3 : `pgbackrest --stanza=axion stanza-create` puis `check` réussissent            | `docker exec --user postgres <pg> pgbackrest --stanza=axion info`                        | la stanza **existe**, mais `status: error (no valid backups)`                                                      | **PARTIELLEMENT VRAI** — §5                                |
| L'archivage WAL fonctionne réellement (`failed_count = 0`)                           | `psql -U axion -d axion_audit -c 'SELECT … FROM pg_stat_archiver;'`                      | `archived_count=3`, `failed_count=0`, `last_archived_wal=000000010000000000000003`                                 | **VRAI — et c'est le seul point de sauvegarde qui tienne** |
| §5.3 : la commande de contrôle s'écrit `psql` sans `-U`                              | même commande                                                                            | `FATAL: role "postgres" does not exist` — le rôle est **`axion`**                                                  | **FAUX** — corrigé §4.4                                    |
| §2 bis : les fronts sont des jobs one-shot qui sortent en 0, Caddy sert les fichiers | `docker ps -a --filter label=coolify.resourceName=axion-audit-staging`                   | `field` et `hq` : `Exited (0)` ; `caddy` : `Up (healthy)` ; montages `…_field-dist:/srv/principal/field`           | **VRAI — le README avait raison**                          |
| §2 bis : `hq` sur le port interne **5174**, `api` sur `${API_PORT}` (3000)           | `docker ps` (colonne `PORTS`) · `.env`                                                   | `api` expose `3000/tcp` ; `API_PORT=3000` présent dans le `.env` du staging                                        | **VRAI**                                                   |
| La posture de sécurité (CSP, HSTS, `nosniff`…) est appliquée identiquement           | `docker exec <caddy> wget -qO- --server-response http://localhost:8080/api/v1/health`    | 200 + CSP complète, HSTS `max-age=31536000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `Via: 1.1 Caddy` | **VRAI — le README avait raison**                          |
| Aucun port de données n'est publié (5432/6379/9000)                                  | `docker ps` (colonne `PORTS`)                                                            | `postgres 5432/tcp`, `redis 6379/tcp`, `minio 9000/tcp` — **exposés, jamais publiés** (pas de `0.0.0.0:`)          | **VRAI**                                                   |
| Le `.env` est en `root:root` `chmod 600`                                             | `stat -c '%n %U:%G %a' …/.env`                                                           | `root:root` **644** — et le répertoire parent est `755`                                                            | **FAUX** — §4.1, écart ouvert                              |

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
    ├── install-cron.sh           planification des quatre tâches ci-dessus
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

## 4. LE STAGING TEL QU'IL EST — tout ce qui suit est MESURÉ

Hôte : `axionia-web` / `178.105.55.15`, Ubuntu, noyau `6.8.0-124-generic`
(`ssh axionia-web 'hostname; uname -a'`).
Cette machine héberge **aussi la production `axion-ia.com`**. Voir
`infra/COHABITATION_AXIONIA_WEB.md` avant toute manœuvre.

Identifiants Coolify (non secrets, déjà tracés dans `DECISIONS.md` 2026-08-28) :
console `http://178.105.55.15:8000` · serveur `l877luxxpv1mx96sss7tc6zj` · projet `axion-audit` ·
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

| Fait                                             | Mesure                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `PUBLIC_BASE_URL` du `.env`                      | `https://audit-staging.axion-ia.com`                             |
| DNS de ce nom                                    | `getent hosts audit-staging.axion-ia.com` → **non résolu**       |
| Domaine réellement posé sur la ressource Coolify | `COOLIFY_FQDN=wrunr6mwq2oxqq392i4myzjn.178.105.55.15.sslip.io`   |
| Réponse publique                                 | **404** à 06h41 UTC (aucun routeur Traefik), **504** à 06h47 UTC |

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

## 5. SAUVEGARDE ET RESTAURATION — L'ÉTAT RÉEL, SANS ENJOLIVEMENT

### 🔴 Y a-t-il une sauvegarde restaurable du staging aujourd'hui ? **NON.**

```bash
ssh axionia-web "docker exec --user postgres $PG pgbackrest --stanza=axion info"
```

```
stanza: axion
    status: error (no valid backups)
    cipher: aes-256-cbc

    db (current)
        wal archive min/max (16): 000000010000000000000001/000000010000000000000003
```

**Décomposition honnête de ce résultat :**

| Élément                            | État                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Stanza pgBackRest `axion`          | ✅ **existe**, chiffrement `aes-256-cbc` actif                            |
| Archivage WAL                      | ✅ **fonctionne** : `archived_count=3`, `failed_count=0`                  |
| **Sauvegarde complète (`backup`)** | 🔴 **AUCUNE** — `no valid backups`. `pgbackrest backup` n'a jamais tourné |
| Sauvegarde MinIO                   | 🔴 aucune (`/var/backups/axion` absent)                                   |
| Sauvegarde du magasin TLS          | 🔴 sans objet **et** absente (le TLS est chez Traefik)                    |
| Copie hors serveur                 | 🔴 aucune (ni clé Storage Box, ni `rclone`)                               |
| Planification                      | 🔴 aucune (`/etc/cron.d/axion-audit` absent)                              |
| Test de restauration               | 🔴 **JAMAIS JOUÉ** (`/var/log/axion` absent)                              |

**Conclusion, en une phrase : sans sauvegarde complète, les WAL archivés ne se rejouent sur rien.**
Un `restore` aujourd'hui échouerait faute de point de départ. **L'invariant 8 n'est pas tenu sur le
staging**, et le critère d'acceptation L0 « restauration Postgres ET MinIO testée depuis zéro » est
**non satisfait**.

> La création de la stanza et la première sauvegarde sont en cours de traitement par un autre agent
> (A11c) à la date de ce relevé. **Ce runbook constate, il n'agit pas** de ce côté. Le jour où une
> sauvegarde valide existera, `pgbackrest info` affichera un bloc `full backup:` au lieu de
> `status: error` : c'est le seul contrôle qui vaille, et il tient en une commande.

### Ce qui manque encore avant qu'une restauration soit jouable sur le staging

1. Une **sauvegarde complète** (`pgbackrest --stanza=axion backup`) — sans elle, rien.
2. Une **planification** : il n'y a ni cron ni timer systemd pour Axion Audit sur la machine.
3. Une **copie hors serveur** : ni clé Storage Box, ni `rclone`.
4. Un **test de restauration exécutable**, ce que `restore-test.sh` n'est pas ici (§6.2).

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

---

## 8. CE QUI RESTE FAUX, INCERTAIN OU OUVERT

Écrit ici plutôt que tu, pour que la porte P-A puisse le relire point par point.

| #   | Point                                                                                 | Statut                                                                                                     |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | `.env` du staging en `644` dans un répertoire `755`                                   | **ÉCART DE SÉCURITÉ OUVERT** — posé par Coolify à chaque déploiement, non corrigeable à la main            |
| 2   | Aucune sauvegarde restaurable du staging                                              | **OUVERT** — A11c en cours ; §5                                                                            |
| 3   | `restore-test.sh` ne sait pas parler à un projet Compose imposé par un orchestrateur  | **ESCALADE À OUVRIR** — §6.2                                                                               |
| 4   | `PUBLIC_BASE_URL` désigne `audit-staging.axion-ia.com`, qui **ne résout pas**         | **OUVERT** — le domaine réel est l'adresse `sslip.io` de Coolify                                           |
| 5   | Routage Traefik → Caddy : port cible non déclaré, 504 au relevé                       | **EN COURS** par un autre agent — ne pas figer                                                             |
| 6   | Duplication `docker-compose.coolify.yml` ↔ `docker-compose.yml` non gardée            | **OUVERT** — `AMELIORATIONS.md` 2026-08-28, « la troisième convention d'A11 »                              |
| 7   | Tags MinIO / `mc` / Caddy figés : « dernière release stable au démarrage » (11 §1)    | à confirmer au provisionnement réel de la production, puis à geler                                         |
| 8   | `deploy.sh` appelle `pnpm db:migrate:check` puis `pnpm db:migrate` dans l'image `api` | les deux scripts existent à la racine (`package.json`) ; **leur présence dans l'image n'est pas vérifiée** |
| 9   | Le PRA (§7.3) et la rotation des secrets                                              | **JAMAIS JOUÉS** — RTO 4 h non chronométré                                                                 |
| 10  | `docker image prune -af` toutes les 6 h par le crontab du voisin                      | **NON VÉRIFIÉ** : effet réel sur nos images entre deux déploiements                                        |
| 11  | Contrôle nominatif des 12 familles de secrets §30.3 dans le `.env` du staging         | **NON VÉRIFIÉ** — appartient à Williams, pas à un agent (porte P-A, §G.6-1)                                |
| 12  | Consommation CPU/RAM réelle du staging en cohabitation                                | **NON VÉRIFIÉ** dans cette passe — seules les marges d'avant déploiement sont tracées (`DECISIONS.md`)     |

### Ce qui a été mesuré, et qu'il ne faut pas re-suspecter

Pour éviter qu'une prochaine revue reparte à zéro : **la pile de staging fonctionne**. Les neuf
services se comportent comme le fichier compose le décrit (six `Up (healthy)`, trois `Exited (0)`
attendus), aucun port de données n'est publié, l'API répond `{"status":"ok"}` derrière notre Caddy
avec l'intégralité des en-têtes de sécurité, l'isolement réseau est celui qui a été arbitré, et
l'archivage WAL de PostgreSQL tourne sans échec. **Ce qui manque est autour : la sauvegarde, le
routage public, et l'outillage d'exploitation.**
