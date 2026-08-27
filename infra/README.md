# `infra/` — RUNBOOK D'EXPLOITATION AXION AUDIT

> Ce fichier est le mode d'emploi du lot **L0-b** (décision `DECISIONS.md` du 2026-08-27,
> « Périmètre exact de L0 »). Il applique **02 §11.2, §11.3, §11.4 et §30 intégral**,
> **06 §10.2/§10.3**, **11 §1/§2/§7**. Des commandes et des sorties attendues, rien d'autre.
>
> **Règle absolue : aucune valeur de secret n'entre jamais dans un fichier versionné**
> (02 §30.4-1/5, gitleaks est bloquant en CI). Tout passe par `/opt/axion-audit/.env`,
> `root:root`, `chmod 600`, **posé à la main par SSH** (02 §30.4-2).

---

## 0. Arborescence

```
infra/
├── docker-compose.yml            pile de DÉV local (build local, hot reload)
├── docker-compose.staging.yml    surcharge staging (images GHCR, limites CPU/RAM, SANS frontal)
├── docker-compose.prod.yml       surcharge prod    (images GHCR, 80/443, frontal des 2 piles)
├── caddy/Caddyfile               2 blocs de site (prod + staging), sécurité, CSP
├── caddy/fronts.dev.caddy        fronts en DEV    : reverse_proxy vers Vite
├── caddy/fronts.static.caddy     fronts en PROD   : root + file_server + repli SPA
├── postgres/Dockerfile           PostgreSQL 16 + pgBackRest
├── postgres/postgresql.custom.conf  archive_mode, wal_level, UTC
├── pgbackrest/pgbackrest.conf    dépôt chiffré, rétention
├── README.md                     ← ce runbook
└── scripts/
    ├── lib/common.sh             fonctions partagées (log, alerte, chiffrement)
    ├── provision-vps.sh          durcissement Ubuntu (06 §10.3), idempotent
    ├── deploy.sh                 pull → migration garde-fou → up -d → smoke → rollback
    ├── smoke-test.sh             santé API + écriture/lecture PG, MinIO, Redis
    ├── backup-postgres.sh        pg_dump 6 h + pgBackRest + Storage Box + hors Hetzner
    ├── backup-minio.sh           mc mirror + archive chiffrée + Storage Box
    ├── backup-caddy.sh           magasin TLS (certificats des 2 domaines) + Storage Box
    ├── restore-test.sh           TEST DE RESTAURATION NOCTURNE (critère L0)
    └── install-cron.sh           planification des quatre tâches ci-dessus
```

---

## 1. Prérequis

| Poste          | Outils                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Machine de dev | Docker Engine + **Docker Compose ≥ 2.24** (balises `!reset`/`!override`), Node 22, pnpm 9, git                                           |
| VPS            | Ubuntu LTS fraîchement loué (Hetzner Falkenstein/Nuremberg — 02 §4.2), une clé SSH publique déjà déposée pour le compte d'administration |
| Hors serveur   | Storage Box Hetzner (02 §11.4) + un second remote `rclone` **hors Hetzner** (règle 3-2-1)                                                |

Vérification :

```bash
docker compose version     # attendu : Docker Compose version v2.24.x ou supérieur
```

---

## 2. Développement local

```bash
# 1. Fichier d'environnement local (JAMAIS commité — .env est gitignoré)
cp .env.example .env
# 2. Remplacer les __CHANGEME__ par des valeurs LOCALES :
#    openssl rand -base64 32   (mots de passe)     openssl rand -hex 64 (JWT)
#    openssl rand -hex 32      (APP_ENCRYPTION_KEY)
#    En local : PUBLIC_BASE_URL=http://localhost:8080, CADDY_SITE_ADDRESS=:8080
#    et CADDY_STAGING_SITE_ADDRESS=:8081 (second bloc de site, inerte en local —
#    voir la note ci-dessous ; la variable est OBLIGATOIRE, une adresse de site
#    vide empêcherait Caddy de démarrer).
# 3. Démarrage de la pile complète (depuis la RACINE du dépôt)
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

### Sortie attendue, service par service

```bash
docker compose --env-file .env -f infra/docker-compose.yml ps
```

| Service         | État attendu   | Contrôle                                                   |
| --------------- | -------------- | ---------------------------------------------------------- |
| `postgres`      | `Up (healthy)` | `pg_isready` répond sur la base `axion_audit`              |
| `redis`         | `Up (healthy)` | `redis-cli ping` → `PONG` (authentifié)                    |
| `minio`         | `Up (healthy)` | `mc ready local` → OK                                      |
| `createbuckets` | `Exited (0)`   | log : `buckets et utilisateur applicatif restreint prets.` |
| `api`           | `Up (healthy)` | `GET /v1/health` → 200                                     |
| `worker`        | `Up (healthy)` | processus `node` vivant                                    |
| `field`         | `Up (healthy)` | Vite sert `/`                                              |
| `hq`            | `Up (healthy)` | Vite sert `/hq/`                                           |
| `caddy`         | `Up (healthy)` | API d'admin locale répond                                  |

Contrôles fonctionnels :

```bash
curl -i http://localhost:8080/api/v1/health   # 200 + JSON de santé
curl -i http://localhost:8080/                # 200, PWA terrain
curl -i http://localhost:8080/hq/             # 200, console siège
curl -sI http://localhost:8080/ | grep -i content-security-policy   # CSP présente
```

> **Le second bloc de site (staging) est INERTE en local.** Le `Caddyfile` porte deux blocs
> depuis l'arbitrage du 2026-08-27 (`DECISIONS.md`, « Cohabitation staging/prod : qui écoute
> sur 443 ? ») : `:8080` pour la pile courante, `:8081` pour la pile de staging. En local, le
> port `8081` **n'est pas publié** et les upstreams `staging-api` / `staging-field` /
> `staging-hq` n'existent pas — le bloc se charge, ne sert rien, et ne gêne rien. Il n'a de
> conteneurs en face que sur le VPS. Rien à faire en développement.

**PREMIER DÉMARRAGE — ÉTAPE N°1, avant tout le reste.** Initialisation **unique** du dépôt de
sauvegarde. `archive_mode` est à `on` dès le premier démarrage (`postgres/postgresql.custom.conf`) :
tant que la stanza n'existe pas, `archive_command` échoue à chaque WAL, les journaux s'accumulent
dans `pg_wal` et **il n'existe aucune sauvegarde restaurable**. C'est le **point de contrôle n°1
de la porte P-A côté sauvegardes** (`DECISIONS.md`, « Points d'infrastructure actés sans
réserve », point 12) :

```bash
docker compose --env-file .env -f infra/docker-compose.yml \
  exec --user postgres postgres pgbackrest --stanza=axion stanza-create
docker compose --env-file .env -f infra/docker-compose.yml \
  exec --user postgres postgres pgbackrest --stanza=axion check
# attendu : "check command end: completed successfully"
```

Arrêt / remise à zéro totale :

```bash
docker compose --env-file .env -f infra/docker-compose.yml down          # arrêt
docker compose --env-file .env -f infra/docker-compose.yml down -v       # + DONNÉES EFFACÉES
```

---

## 2 bis. Comment les fronts sont servis — deux modes, jamais mélangés

Arbitrage A01 du 2026-08-27 (`DECISIONS.md`, « Comment les fronts sont servis en production »),
après la revue croisée **B-7**.

|                            | **Développement local**   | **Staging et production**                                     |
| -------------------------- | ------------------------- | ------------------------------------------------------------- |
| Cible d'image `field`/`hq` | `dev`                     | `runtime`                                                     |
| Ce que fait le conteneur   | serveur Vite qui tourne   | **job one-shot** : copie `dist` dans `/sortie`, puis **sort** |
| `restart`                  | `unless-stopped`          | **`no`**                                                      |
| Sonde                      | HTTP sur 5173 / 5174      | **aucune**                                                    |
| Dépendance de Caddy        | `service_healthy`         | **`service_completed_successfully`**                          |
| Ce que fait Caddy          | `reverse_proxy` vers Vite | `root` + `file_server` + repli SPA                            |
| Fichier de config chargé   | `caddy/fronts.dev.caddy`  | `caddy/fronts.static.caddy`                                   |

**Pourquoi Caddy sert lui-même les fichiers en production.** Ce n'est pas l'économie d'un
composant, c'est la PWA : Caddy doit **maîtriser lui-même le `Cache-Control` du service worker**
(`no-cache, no-store, must-revalidate`) et le **repli SPA** (`try_files … /index.html`). La mise à
jour applicative (§31) et le démarrage hors ligne (invariant 1) dépendent exactement de ces
en-têtes ; les déléguer à un serveur intermédiaire, c'est perdre le seul mécanisme qui décide de
la version que voit un iPad en clientèle.

**Pourquoi le mode dev reste un `reverse_proxy`.** Le rechargement à chaud est tout l'intérêt du
mode développement : le servir depuis un volume de fichiers construits le supprimerait.

**Pourquoi aucune sonde sur les jobs.** Un conteneur sorti n'a pas de vivacité à mesurer. Une
sonde qui ne peut pas réussir est **pire qu'une sonde absente** : elle bloque indéfiniment tout ce
qui en dépend. Ce qui prouve le succès d'un job, c'est son **code de sortie** — ce que
`service_completed_successfully` vérifie, et qui garantit au passage que le volume contient bien
un build avant que Caddy ne commence à servir.

**La bascule.** Le `Caddyfile` fait `import {$CADDY_FRONT_CONFIG}`. Les deux fichiers définissent
les **mêmes** noms de snippets (`fronts_principal`, `fronts_staging`), donc les blocs de site ne
changent jamais. Les deux variantes sont montées dans tous les environnements ; seule la variable
choisit. **Sur le VPS, elle est imposée par la surcharge Compose et non lue dans le `.env`** : le
mode de service découle de la forme du déploiement, pas d'un réglage d'exploitant — un `.env` de
prod portant la valeur `dev` mettrait le site entier en 502.

> **La posture de sécurité ne change pas d'un mode à l'autre.** Le snippet `(securite)` du
> `Caddyfile` (HSTS, CSP, `nosniff`, `Permissions-Policy`, règles de cache) est appliqué **avant**
> l'import, à l'identique en dev, en staging et en prod. Un dev plus permissif ne validerait rien.

**Ports internes — un port par application, identique dedans et dehors** (`DECISIONS.md`, « Points
d'infrastructure actés sans réserve », point 9) :

| Application | Port interne         | Publié en dev sur | Publié en staging/prod |
| ----------- | -------------------- | ----------------- | ---------------------- |
| `api`       | `${API_PORT}` (3000) | — (via Caddy)     | —                      |
| `field`     | 5173                 | `127.0.0.1:5173`  | aucun (job one-shot)   |
| `hq`        | **5174**             | `127.0.0.1:5174`  | aucun (job one-shot)   |

**Fichiers obsolètes dans les volumes de build.** Le job fait `cp -a`, pas une synchronisation
destructive : les assets d'une version précédente restent en place. C'est **voulu** — un client
qui a chargé l'ancienne page peut encore récupérer ses fragments pendant la bascule. Le ménage se
fait en supprimant le volume et en redéployant, jamais pendant une journée de collecte.

---

## 3. Provisionnement du VPS, pas à pas (L0-b)

> **Ne fermez jamais votre session SSH courante** tant que le nouvel accès n'est pas testé.

```bash
# 3.1 — Depuis votre poste : déposer votre clé publique AVANT tout durcissement
ssh-copy-id root@<IP>

# 3.2 — Sur le VPS : cloner le dépôt à l'emplacement d'exploitation
ssh root@<IP>
mkdir -p /opt/axion-audit
git clone git@github.com:<compte>/axion-audit.git /opt/axion-audit/repo

# 3.3 — Durcissement complet (06 §10.3) — IDEMPOTENT, rejouable
/opt/axion-audit/repo/infra/scripts/provision-vps.sh --ssh-port 2222 --admin-user root
```

Ce que le script fait, dans l'ordre : paquets · **refus de continuer si aucune clé SSH n'est
installée** · SSH clés uniquement sur le port choisi · fail2ban · UFW (SSH + 80 + 443, tout le
reste refusé) · Docker CE + Compose · `userns-remap` · `unattended-upgrades` (sans redémarrage
automatique) · `/opt/axion-audit` + `/var/log/axion` + `/var/backups/axion` · `.env` créé depuis
`.env.example` en `root:600`.

Il **s'arrête ensuite volontairement** : il ne pose **aucun secret** (02 §30.4-2).

```bash
# 3.4 — DEPUIS UN AUTRE TERMINAL, vérifier le nouvel accès avant de fermer l'ancien
ssh -p 2222 root@<IP> 'ufw status verbose && docker compose version'
```

Sortie attendue : `Status: active`, `22/tcp` **absent**, `2222/tcp ALLOW`, `80/tcp ALLOW`,
`443/tcp ALLOW`, `443/udp ALLOW`, aucun port 5432/6379/9000.

### 3.5 — Deux prérequis à poser AVANT le premier `up`

**a. Enregistrements DNS — à créer AVANT le premier démarrage.** Le 02 §11.2 place le staging
sur un **sous-domaine** du même VPS ; depuis l'arbitrage du 2026-08-27 (`DECISIONS.md`,
« Cohabitation staging/prod : qui écoute sur 443 ? »), l'unique Caddy demande donc **deux**
certificats ACME.

| Nom                       | Type | Valeur     |
| ------------------------- | ---- | ---------- |
| `audit.<domaine>`         | A    | `<IP VPS>` |
| `staging.audit.<domaine>` | A    | `<IP VPS>` |

Si un enregistrement manque, la validation HTTP-01 échoue, **Caddy retente en boucle** (backoff
croissant, le conteneur reste « up » mais le site est inaccessible) et Let's Encrypt plafonne
les échecs répétés — on se retrouve bloqué pour des heures. Vérifier AVANT de démarrer :

```bash
dig +short audit.<domaine> staging.audit.<domaine>   # DEUX fois l'IP du VPS
```

**b. Réseau de liaison ET volumes partagés des fronts.** `provision-vps.sh` les crée
(étape 7bis) : un réseau (l’API de staging, joignable par le Caddy de prod) et deux volumes
(les fichiers construits des fronts de staging, que ce même Caddy sert — voir §2 bis).
Tous trois sont déclarés
`external` dans les deux surcharges Compose : l’absence de l’un d’eux fait échouer `up`
immédiatement, plutôt que de démarrer une prod à moitié câblée.

```bash
docker network inspect axion-edge-staging >/dev/null && echo 'réseau de liaison présent'
docker volume  inspect axion-staging-field-dist >/dev/null && echo 'volume field staging présent'
docker volume  inspect axion-staging-hq-dist    >/dev/null && echo 'volume hq staging présent'
# à défaut : docker volume create axion-staging-field-dist axion-staging-hq-dist
# à défaut : docker network create --driver bridge axion-edge-staging
```

Sur le réseau de liaison : le `caddy` de la pile de prod et **la seule `api`** de staging —
jamais Postgres, Redis, MinIO ni le worker. Les fronts de staging n’y sont pas non plus :
ce sont des jobs one-shot, Caddy ne les JOINT pas, il LIT leurs fichiers dans les volumes
(§2 bis). La séparation du 02 §30.4-4 tient : aucun conteneur de staging n’a de route vers
la base, les buckets ou Redis de la prod, et les volumes partagés ne contiennent que du
HTML/JS/CSS publiquement servi — aucune donnée, aucun secret.

---

## 4. Pose des secrets (à la main, 02 §30.4-2)

```bash
ssh -p 2222 root@<IP>
nano /opt/axion-audit/.env          # déjà en root:600
```

| Secret (02 §30.3)                                                                    | Génération                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_*_PASSWORD`, `MINIO_SECRET_KEY`        | `openssl rand -base64 32`                   |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (**deux valeurs distinctes**)              | `openssl rand -hex 64`                      |
| `APP_ENCRYPTION_KEY`                                                                 | `openssl rand -hex 32`                      |
| `BACKUP_ENCRYPTION_PASSPHRASE`, `PGBACKREST_CIPHER_PASS`                             | `openssl rand -base64 48`                   |
| `ANTHROPIC_API_KEY`, `DOCXTEMPLATER_LICENSE`, `TELEGRAM_*`, `CONSOLE_WEBHOOK_SECRET` | fournis par le service concerné             |
| `GHCR_OWNER`, `IMAGE_TAG`                                                            | non secrets : compte GitHub et tag d'images |

Puis, en cohérence avec `DATABASE_URL` et `REDIS_URL`, **répercuter les mots de passe dans les
deux URL** (elles sont construites à partir des variables du dessus).

> ### Convention de chemin du `.env` — une seule, sans exception
>
> ```
> /opt/axion-audit/<env>/.env        avec <env> ∈ { staging, prod }
> ```
>
> **Il n'existe PAS de `/opt/axion-audit/.env`.** Le 02 §30.4-4 impose des valeurs distinctes par
> environnement : un fichier unique ne peut pas porter deux bases, deux jeux de clés JWT et deux
> jeux de buckets. `provision-vps.sh` crée donc les **deux** fichiers (`root:600`, répertoires en
> `700`) et n'en crée aucun à la racine — car son existence ferait **silencieusement réussir** un
> script appelé sans argument, sur un modèle plein de `__CHANGEME__` : la panne la plus coûteuse à
> diagnostiquer. Tout script appelé sans argument échoue désormais avec un message qui nomme la
> convention.
>
> **Tout appelant passe le chemin explicitement** — `deploy.sh --env-file …`, les scripts de
> sauvegarde en premier argument, `install-cron.sh` qui l'inscrit dans `/etc/cron.d/axion-audit`,
> et les workflows GitHub. (Revue croisée M-11.)

**Séparation stricte staging/prod (02 §30.4-4)** : deux fichiers, deux jeux de valeurs.

```
/opt/axion-audit/prod/.env       APP_ENV=prod
                                 CADDY_SITE_ADDRESS=audit.<domaine>
                                 CADDY_STAGING_SITE_ADDRESS=staging.audit.<domaine>
                                 API_PORT=3000
/opt/axion-audit/staging/.env    APP_ENV=staging
                                 API_PORT=3000     ← MÊME VALEUR, obligatoire
                                 (aucune variable CADDY_* n'est utilisée : depuis
                                  l'arbitrage du 2026-08-27, la pile de staging
                                  n'a plus de frontal — c'est le Caddy de la prod)
```

> **Les deux adresses de site vivent dans le `.env` de PROD**, puisque c'est la pile de prod qui
> porte l'unique Caddy (`.env.example` §14).
>
> **`API_PORT` est une CONVENTION COMMUNE aux deux environnements** (arbitrage A01 du
> 2026-08-27) : les deux blocs du `Caddyfile` l'utilisent. Ce port n'est jamais publié
> (06 §10.3, 11 §2), il n'a donc aucune raison de différer — et une variable séparée qu'il
> faudrait tenir en double à la main serait une panne en attente : le jour où les deux valeurs
> divergent, c'est la **production** qui rend des 502 à cause d'une valeur de staging.
> **Ne pas changer `API_PORT` sans le changer dans LES DEUX `.env`.**
>
> Tout le reste (base, buckets, clés JWT, clés API, passphrases) reste rigoureusement disjoint
> entre les deux fichiers.

Clé SSH de la Storage Box et test d'accès :

```bash
ssh-keygen -t ed25519 -f /root/.ssh/storagebox_ed25519 -C 'axion-audit-backups'
# déposer la clé publique dans la Storage Box, puis :
ssh -p 23 -i /root/.ssh/storagebox_ed25519 <user>@<host> ls
```

**Sauvegarde chiffrée du `.env` lui-même** (02 §30.4-2 — sans elle, un PRA restaure une infra
sans ses clés) :

```bash
gpg --symmetric --cipher-algo AES256 -o /root/env-prod-$(date -u +%F).gpg /opt/axion-audit/prod/.env
scp -P 23 -i /root/.ssh/storagebox_ed25519 /root/env-prod-*.gpg <user>@<host>:/home/axion-audit/secrets/
shred -u /root/env-prod-*.gpg
```

> La passphrase de ce `gpg` est le **dernier maillon** : elle se conserve hors ligne
> (gestionnaire de mots de passe personnel), jamais sur le VPS.

---

## 5. Premier déploiement

> **CHECKLIST DU PREMIER DÉMARRAGE — dans cet ordre, rien d'optionnel.**
>
> 1. **`pgbackrest stanza-create`** (étape 5.3 ci-dessous) — **POINT DE CONTRÔLE N°1 DE LA PORTE
>    P-A côté sauvegardes** (`DECISIONS.md`, « Points d'infrastructure actés sans réserve »,
>    point 12). `archive_mode` est à `on` dès le premier démarrage : tant que la stanza n'existe
>    pas, `archive_command` échoue à chaque WAL, les journaux s'entassent dans `pg_wal` et
>    **il n'existe aucune sauvegarde restaurable**. Une pile qui tourne sans stanza est une pile
>    sans PRA — et elle en donne pourtant toutes les apparences.
> 2. Les **enregistrements DNS** du domaine de prod ET du sous-domaine de staging existent et
>    pointent sur le VPS (§3.5-a) — sinon l'émission ACME échoue et Caddy retente en boucle.
> 3. Le **réseau de liaison** `axion-edge-staging` **et les deux volumes partagés**
>    `axion-staging-field-dist` / `axion-staging-hq-dist` existent (§3.5-b) : ils sont
>    déclarés `external`, donc leur absence fait échouer `up` immédiatement.
> 4. **La prod se déploie AVANT le staging** : c'est elle qui porte l'unique Caddy, donc le
>    frontal des deux environnements.

```bash
# 5.1 — Authentification au registre d'images privé (02 §30.5)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <compte> --password-stdin

# 5.2 — Déploiement de la PROD (elle porte le frontal des deux environnements)
/opt/axion-audit/repo/infra/scripts/deploy.sh --env prod --tag v0.0 \
  --env-file /opt/axion-audit/prod/.env

# 5.3 — ⚠️ POINT DE CONTRÔLE N°1 DE LA PORTE P-A : initialisation du dépôt
#       pgBackRest (UNE SEULE FOIS PAR ENVIRONNEMENT, prod ET staging).
cd /opt/axion-audit/repo
docker compose --env-file /opt/axion-audit/prod/.env \
  -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  exec --user postgres postgres pgbackrest --stanza=axion stanza-create
docker compose --env-file /opt/axion-audit/prod/.env \
  -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  exec --user postgres postgres pgbackrest --stanza=axion check
# attendu : "check command end: completed successfully"
# Contrôle complémentaire — l'archivage FONCTIONNE réellement :
docker compose ... exec --user postgres postgres \
  psql -d "$POSTGRES_DB" -c 'SELECT archived_count, failed_count FROM pg_stat_archiver;'
# attendu : failed_count = 0 (s'il monte, la stanza ou le dépôt est en cause)

# 5.4 — Déploiement du STAGING (après la prod), puis SA PROPRE stanza
/opt/axion-audit/repo/infra/scripts/deploy.sh --env staging --tag sha-1a2b3c4 \
  --env-file /opt/axion-audit/staging/.env
docker compose --env-file /opt/axion-audit/staging/.env \
  -f infra/docker-compose.yml -f infra/docker-compose.staging.yml \
  exec --user postgres postgres pgbackrest --stanza=axion stanza-create

# 5.5 — Première sauvegarde complète, puis planification
infra/scripts/backup-postgres.sh /opt/axion-audit/prod/.env
infra/scripts/backup-minio.sh    /opt/axion-audit/prod/.env
infra/scripts/backup-caddy.sh    /opt/axion-audit/prod/.env
infra/scripts/install-cron.sh    /opt/axion-audit/prod/.env

# 5.6 — Premier test de restauration, à la main, sans attendre la nuit
infra/scripts/restore-test.sh /opt/axion-audit/prod/.env
echo "code de sortie : $?"     # attendu : 0
```

Sortie attendue de `deploy.sh` : `pull` OK · `migration — ÉTAPE 1/2 : simulation` OK ·
`ÉTAPE 2/2 : application` OK · `up -d` · `smoke tests : SUCCÈS` · notification Telegram
`Déploiement prod OK — tag v0.0`.

Tâches installées (`cat /etc/cron.d/axion-audit`) :

| Quand (UTC)                                 | Tâche                                              |
| ------------------------------------------- | -------------------------------------------------- |
| `0 */6 * * *`                               | `backup-postgres.sh` — RPO ≤ 6 h (02 §11.4)        |
| `30 1 * * *`                                | `backup-minio.sh` — `mc mirror` + archive chiffrée |
| `45 1 * * *`                                | `backup-caddy.sh` — magasin TLS (2 domaines)       |
| `${RESTORE_TEST_CRON}` (défaut `0 3 * * *`) | `restore-test.sh` — **critère d'acceptation L0**   |

---

## 5 bis. Accéder au staging — il n'y a plus de tunnel SSH

Arbitrage A01 du 2026-08-27 (`DECISIONS.md`, « Cohabitation staging/prod : qui écoute sur
443 ? », option 2), en application littérale du 02 §11.2 (« `staging` (même VPS, **sous-domaine**,
DB séparée) ») : **un seul Caddy**, celui de la pile de prod, lie 80/443 et sert les deux
environnements par deux blocs de site. Motif opérationnel : **les portes P-A à P-E se démontrent
sur staging** (09 §4), et une démo qui exige d'ouvrir un tunnel est une démo qu'on finit par ne
pas faire.

| Environnement | Adresse publique                  | Frontal                              | Ports publiés    |
| ------------- | --------------------------------- | ------------------------------------ | ---------------- |
| prod          | `https://audit.<domaine>`         | `caddy` du projet `axion-audit-prod` | 80, 443, 443/udp |
| staging       | `https://staging.audit.<domaine>` | **le MÊME conteneur `caddy`**        | aucun            |

Ce qui reste STRICTEMENT séparé (02 §30.4-4) : base PostgreSQL, buckets MinIO, Redis, volumes
de DONNÉES,
réseau interne, `.env` et donc tous les secrets. Le réseau de liaison ne porte que du HTTP
depuis Caddy vers les trois services web de staging ; aucun conteneur de staging n'a de route
vers les données de la prod.

Contrôles après déploiement :

```bash
curl -i  https://staging.audit.<domaine>/api/v1/health          # 200 + JSON de santé
curl -i  https://staging.audit.<domaine>/                       # 200, PWA terrain (staging)
curl -i  https://staging.audit.<domaine>/hq/                    # 200, console siège (staging)
curl -sI https://staging.audit.<domaine>/ | grep -i x-robots-tag
# attendu : x-robots-tag: noindex, nofollow  ← un sous-domaine avec un vrai certificat est
#           indexable, et l'outil est confidentiel.
curl -sI https://staging.audit.<domaine>/ | grep -i content-security-policy
curl -sI https://audit.<domaine>/          | grep -i content-security-policy
# attendu : les DEUX lignes sont IDENTIQUES. Les en-têtes de sécurité viennent du même
#           snippet Caddy `(securite)` : un staging plus permissif ne validerait rien.
```

**Vérification qu'aucun croisement n'a lieu** (le seul défaut vraiment dangereux de ce montage —
un `reverse_proxy` de staging qui atteindrait la base de prod) :

```bash
# Les upstreams vus par Caddy doivent être des alias LONGS, jamais `api`/`field`/`hq`.
grep -n 'reverse_proxy' infra/caddy/Caddyfile
# attendu : axion-api ET staging-api, et RIEN d’autre — les fronts ne passent plus par
# un upstream en staging/prod mais par des racines de fichiers distinctes :
grep -n 'root \*' infra/caddy/fronts.static.caddy
# attendu : /srv/principal/{field,hq} ET /srv/staging/{field,hq} — jamais croisés.
docker network inspect axion-edge-staging --format '{{range .Containers}}{{.Name}} {{end}}'
# attendu : le caddy de prod + la seule `api` de staging — RIEN d’autre.
# (les fronts de staging ne sont pas sur le réseau : ce sont des jobs one-shot,
#  Caddy lit leurs FICHIERS dans les volumes partagés — voir §2 bis)
```

⚠️ **Gel des déploiements staging les jours de collecte (02 §11.2) — règle renforcée.** Les deux
piles partageaient déjà le CPU et la RAM du VPS ; elles partagent désormais aussi le frontal
HTTP. Un `up -d` de staging un jour de collecte ne met plus seulement la prod sous tension : il
peut provoquer des 502 sur la **production**.

---

## 6. PRA — restauration complète, RTO cible **4 h** (02 §11.4)

Scénario : **le VPS est perdu**. RPO ≤ 6 h côté siège ; côté terrain, les données non
synchronisées vivent encore sur les appareils (invariant 8).

| #   | Étape                                                                             | Durée cible  |
| --- | --------------------------------------------------------------------------------- | ------------ |
| 1   | Louer un VPS Ubuntu LTS identique, y déposer sa clé SSH                           | 15 min       |
| 2   | `git clone` du dépôt + `provision-vps.sh`                                         | 20 min       |
| 3   | Restaurer le `.env` chiffré depuis la Storage Box                                 | 10 min       |
| 4   | Restaurer PostgreSQL (ci-dessous)                                                 | 60 min       |
| 5   | Restaurer MinIO (ci-dessous)                                                      | 60 min       |
| 5b  | Restaurer le magasin TLS de Caddy (ci-dessous)                                    | 5 min        |
| 6   | `deploy.sh` + `smoke-test.sh`                                                     | 20 min       |
| 7   | Repointer les DEUX enregistrements DNS (prod + staging), vérifier les certificats | 30 min       |
|     | **Total**                                                                         | **≈ 3 h 40** |

**3.1 — Récupérer le `.env`**

```bash
scp -P 23 -i /root/.ssh/storagebox_ed25519 <user>@<host>:/home/axion-audit/secrets/env-prod-<date>.gpg .
gpg --decrypt env-prod-<date>.gpg > /opt/axion-audit/prod/.env
chown root:root /opt/axion-audit/prod/.env && chmod 600 /opt/axion-audit/prod/.env
```

**4 — PostgreSQL**

```bash
cd /opt/axion-audit/repo
set -a; . /opt/axion-audit/prod/.env; set +a

# a. Rapatrier le dépôt pgBackRest depuis la Storage Box
mkdir -p /var/backups/axion/pgbackrest-export
rsync -a -e "ssh -p $STORAGE_BOX_PORT -i $STORAGE_BOX_SSH_KEY_PATH" \
  "$STORAGE_BOX_USER@$STORAGE_BOX_HOST:$STORAGE_BOX_PATH/postgres/pgbackrest/" \
  /var/backups/axion/pgbackrest-export/

# b. Le réinjecter dans le volume attendu par la pile
docker volume create axion-audit-prod_pgbackrest_repo
docker run --rm -v axion-audit-prod_pgbackrest_repo:/repo \
  -v /var/backups/axion/pgbackrest-export:/import:ro alpine:3.21 sh -c 'cp -a /import/. /repo/'

# c. Démarrer Postgres à VIDE puis restaurer (rejeu WAL complet)
docker compose --env-file /opt/axion-audit/prod/.env \
  -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d postgres
docker compose ... exec --user postgres postgres \
  pgbackrest --stanza=$PGBACKREST_STANZA --type=default --delta restore
docker compose ... restart postgres

# d. Contrôle
docker compose ... exec --user postgres postgres \
  psql -d "$POSTGRES_DB" -c 'SELECT pg_is_in_recovery();'   # attendu : f
docker compose ... exec --user postgres postgres \
  psql -d "$POSTGRES_DB" -c '\dt'                            # tables du fichier 04
```

> Repli si le dépôt physique est inexploitable : le dernier `pg_dump` chiffré
> (`/var/backups/axion/postgres/pgdump-*.dump.gpg`, également sur la Storage Box) se restaure par
> `gpg --decrypt … | pg_restore -d "$POSTGRES_DB"`. On perd le rejeu WAL (RPO = 6 h au lieu de 0).

**5 — MinIO**

```bash
rsync -a -e "ssh -p $STORAGE_BOX_PORT -i $STORAGE_BOX_SSH_KEY_PATH" \
  "$STORAGE_BOX_USER@$STORAGE_BOX_HOST:$STORAGE_BOX_PATH/minio/archives/" \
  /var/backups/axion/minio/archives/

for b in "$MINIO_BUCKET_ATTACHMENTS" "$MINIO_BUCKET_REPORTS" "$MINIO_BUCKET_TEMPLATES"; do
  archive=$(ls -t /var/backups/axion/minio/archives/minio-$b-*.tar.gpg | head -1)
  gpg --decrypt "$archive" | tar -C /var/backups/axion/minio/mirror -xf -
  ( cd /var/backups/axion/minio/mirror/$b && sha256sum --quiet -c MANIFEST.sha256 ) \
    && echo "$b : intégrité vérifiée"
done
# puis rechargement par mc mirror dans le MinIO de la pile (voir restore-test.sh, section (b))
```

**5 bis — Magasin TLS de Caddy (certificats des DEUX domaines)**

Cette étape existe pour une raison précise : **le PRA ne doit pas dépendre de Let's Encrypt.**
Une réémission ACME est plafonnée (5 certificats par domaine et par semaine) ; si elle échoue le
jour du sinistre, **les deux environnements sont injoignables en HTTPS** — y compris celui qui
devrait servir à vérifier que la restauration a réussi. Restaurer le magasin coûte 2 minutes et
supprime cette dépendance (arbitrage A01 du 2026-08-27).

```bash
rsync -a -e "ssh -p $STORAGE_BOX_PORT -i $STORAGE_BOX_SSH_KEY_PATH" \
  "$STORAGE_BOX_USER@$STORAGE_BOX_HOST:$STORAGE_BOX_PATH/caddy/archives/" \
  /var/backups/axion/caddy/archives/

archive=$(ls -t /var/backups/axion/caddy/archives/caddy-data-*.tar.gpg | head -1)
docker volume create axion-audit-prod_caddy_data
gpg --decrypt "$archive" \
  | docker run --rm -i -v axion-audit-prod_caddy_data:/data alpine:3.21 tar -C /data -xf -

# Contrôle : les certificats sortis du volume sont lisibles et NON EXPIRÉS
docker run --rm -v axion-audit-prod_caddy_data:/data:ro alpine:3.21 \
  find /data -type f -name '*.crt' \
  | while read -r c; do
      docker run --rm -v axion-audit-prod_caddy_data:/data:ro alpine:3.21 cat "$c" \
        | openssl x509 -noout -subject -enddate -checkend 0 \
        && echo "  ^ valide"
    done
```

> **À restaurer AVANT le premier démarrage de Caddy.** Si la pile démarre avec un volume vide,
> Caddy demande immédiatement de nouveaux certificats et consomme le quota que cette étape
> cherchait justement à préserver.
>
> Si le magasin est irrécupérable, le repli reste ACME : démarrer la pile, laisser Caddy émettre,
> et **vérifier le quota** — c'est un repli, pas le chemin nominal.

**Après restauration, rejouer immédiatement** `infra/scripts/restore-test.sh` : le PRA n'est
terminé que lorsque le test de restauration repasse au vert.

---

## 7. Rotation des secrets (02 §30.4-6)

Règle commune : éditer `/opt/axion-audit/<env>/.env`, redéployer, **re-sauvegarder le `.env`
chiffré**, puis vérifier par `smoke-test.sh`.

| Secret                                                    | Effet                                                                 | Procédure                                                                                                                                             | Fenêtre                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                | **invalide toutes les sessions**                                      | changer les 2 valeurs, `deploy.sh`                                                                                                                    | **heures creuses, JAMAIS un jour de collecte terrain** |
| `POSTGRES_PASSWORD`                                       | coupure courte                                                        | `ALTER ROLE axion WITH PASSWORD '…';` puis mettre à jour `POSTGRES_PASSWORD` **et** `DATABASE_URL`, `deploy.sh`                                       | heures creuses                                         |
| `REDIS_PASSWORD`                                          | jobs BullMQ interrompus                                               | mettre à jour `REDIS_PASSWORD` **et** `REDIS_URL`, redémarrer `redis`, `worker`, `api`                                                                | file vide de préférence                                |
| `MINIO_SECRET_KEY` (clés applicatives)                    | aucune coupure si fait dans l'ordre                                   | `mc admin user add` d'une nouvelle clé → `.env` → `deploy.sh` → `mc admin user remove` de l'ancienne                                                  | quelconque                                             |
| `MINIO_ROOT_PASSWORD`                                     | redémarrage MinIO                                                     | changer, `up -d minio`                                                                                                                                | heures creuses                                         |
| `APP_ENCRYPTION_KEY`                                      | **les valeurs chiffrées d'`app_settings` deviennent illisibles**      | ne jamais tourner sans procédure de re-chiffrement — escalade `DECISIONS.md`                                                                          | jamais en urgence                                      |
| `CONSOLE_WEBHOOK_SECRET`                                  | aucune                                                                | **double clé** : poser l'ancienne dans `CONSOLE_WEBHOOK_SECRET_PREVIOUS`, la nouvelle dans `CONSOLE_WEBHOOK_SECRET`, **vider `_PREVIOUS` après 24 h** | quelconque                                             |
| `ANTHROPIC_API_KEY`                                       | worker seul                                                           | nouvelle clé côté console Anthropic, `.env`, `up -d worker`                                                                                           | quelconque                                             |
| `TELEGRAM_BOT_TOKEN`                                      | alertes                                                               | régénérer via BotFather, `.env`, `up -d worker`                                                                                                       | quelconque                                             |
| `BACKUP_ENCRYPTION_PASSPHRASE` / `PGBACKREST_CIPHER_PASS` | **les anciennes sauvegardes restent lisibles avec l'ANCIENNE valeur** | conserver l'ancienne passphrase jusqu'à expiration de la rétention (30 j), puis la détruire                                                           | quelconque                                             |
| `DEPLOY_SSH_KEY`, `GHCR_TOKEN`                            | CI                                                                    | régénérer dans **GitHub Environments**, jamais en secret de dépôt (02 §30.4-3)                                                                        | quelconque                                             |

**Suspicion de fuite : rotation immédiate, sans fenêtre, et entrée dans `DECISIONS.md`.**

---

## 8. Rollback (02 §30.6)

`deploy.sh` bascule **automatiquement** sur le tag précédent si les smoke tests sont rouges.
À la main :

```bash
infra/scripts/deploy.sh --env prod --rollback --env-file /opt/axion-audit/prod/.env
cat /opt/axion-audit/prod.deployed-tags     # historique des tags déployés
```

Le rollback **ne défait pas les migrations** : elles sont rétrocompatibles N-1 (02 §11.2), donc
le tag précédent fonctionne sur le schéma courant. Un incident qui exigerait un `down` de
migration n'est **pas** une opération de routine : arrêt, escalade humaine, entrée
`DECISIONS.md`.

**Conséquence du frontal partagé** (arbitrage du 2026-08-27) : un rollback de prod recrée le
conteneur `caddy`, et ce conteneur sert **aussi** le sous-domaine de staging.

- Le rollback provoque donc une **brève coupure HTTP du staging** (quelques secondes, le temps
  que Caddy reparte). Les données, la base et les buckets de staging ne sont, eux, **jamais**
  touchés : ils vivent dans un autre projet Compose.
- **Ne jamais lancer un rollback de prod pendant une démo de porte sur staging** : prévenir, ou
  attendre la fin de la démo.
- Les certificats des **deux** domaines vivent dans le volume `caddy_data` de la pile de prod ;
  un rollback les conserve. En revanche un `down -v` sur la prod détruit ce volume, donc **aussi
  le certificat du staging** — Let's Encrypt plafonne les réémissions (5 par domaine et par
  semaine). Ne jamais faire de `down -v` en production pour « repartir propre ».
- À l'inverse, un rollback ou un redéploiement de **staging** ne touche pas au frontal : le
  service `caddy` n'existe pas dans cette pile (profil désactivé).

**Le magasin TLS est sauvegardé — donc `down -v` n'est plus fatal, mais reste interdit.**
Depuis l'arbitrage du 2026-08-27, `caddy_data` est sauvegardé chaque nuit par
`infra/scripts/backup-caddy.sh` (archive GPG AES-256, Storage Box, copie hebdomadaire hors
Hetzner, rétention 30 j comme le reste), et sa restauration est **vérifiée toutes les nuits** par
`restore-test.sh`, étape (c) : l'archive est restaurée dans un volume jetable et chaque
certificat qui en sort doit être lisible, accompagné de sa clé privée, et non expiré. Motif :
un PRA qui dépend d'une réémission ACME sous quota Let's Encrypt n'est pas un PRA.

```bash
# Sauvegarde manuelle du magasin TLS (avant une manœuvre risquée sur le frontal)
infra/scripts/backup-caddy.sh /opt/axion-audit/prod/.env
ls -t /var/backups/axion/caddy/archives/caddy-data-*.tar.gpg | head -1
```

Cela réduit la gravité d'un `down -v` accidentel, **cela ne l'autorise pas** : la restauration
coûte une coupure, et tout ce qui a été émis depuis la dernière archive est perdu. Procédure de
restauration : §6, étape « 5 bis ».

---

## 9. Le test de restauration nocturne a échoué — que faire

Vous recevez sur Telegram : `ÉCHEC du test de restauration nocturne (N contrôle(s))`.

```bash
ssh -p 2222 root@<IP>
ls -t /var/log/axion/restore-test-*.log | head -1
less "$(ls -t /var/log/axion/restore-test-*.log | head -1)"
```

| Message dans le rapport         | Cause probable                                          | Action                                                                                  |
| ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `dépôt pgBackRest introuvable`  | stanza jamais créée, ou volume perdu                    | `pgbackrest --stanza=… stanza-create` puis `backup-postgres.sh`                         |
| `pgbackrest restore a échoué`   | dépôt corrompu ou passphrase changée                    | `pgbackrest --stanza=… check` puis `info` ; vérifier `PGBACKREST_CIPHER_PASS`           |
| `resté en recovery`             | WAL manquants (archivage cassé)                         | `SELECT * FROM pg_stat_archiver;` — si `failed_count` monte, l'`archive_command` échoue |
| `Jeu de tables divergent`       | sauvegarde antérieure à une migration                   | normal **le jour d'un déploiement de schéma** ; doit redevenir vert au passage suivant  |
| `COUNT incohérent`              | la restauration contient **plus** de lignes que la prod | anomalie sérieuse (mauvaise base ciblée) — **escalade immédiate**                       |
| `sommes de contrôle INVALIDES`  | archive MinIO corrompue                                 | reprendre l'archive de la veille sur la Storage Box ; relancer `backup-minio.sh`        |
| `Aucune archive MinIO trouvée`  | `backup-minio.sh` n'a jamais tourné                     | vérifier `/etc/cron.d/axion-audit`, lancer à la main                                    |
| `Bucket … : VIDE (0 objet)`     | aucune mission n’a encore produit de fichier            | **ÉTAT NORMAL au lot L0** — verdict OK, ce n’est PAS une alerte (M-9)                   |
| `manifeste sha256 ABSENT`       | sauvegarde incomplète                                   | relancer `backup-minio.sh`, vérifier l’espace disque                                    |
| `manifeste TRONQUÉ`             | archive écrite pendant une écriture concurrente         | relancer `backup-minio.sh` ; si ça persiste, examiner `mc mirror`                       |
| `Aucune archive du magasin TLS` | `backup-caddy.sh` n’a jamais tourné                     | vérifier `/etc/cron.d/axion-audit`, lancer à la main                                    |
| `Aucun certificat VALIDE`       | tous les certificats sauvegardés sont expirés           | la sauvegarde date d’avant le dernier renouvellement — relancer `backup-caddy.sh`       |
| `Clé privée absente`            | magasin TLS tronqué à la sauvegarde                     | relancer `backup-caddy.sh` ; si ça persiste, le volume `caddy_data` est abîmé           |

**Deux nuits rouges consécutives = les sauvegardes ne sont plus une garantie.** Arrêt des
déploiements, sauvegarde manuelle immédiate hors serveur, escalade Williams.

Le script est **non destructif** et **idempotent** : il se rejoue à la main sans risque.

```bash
infra/scripts/restore-test.sh /opt/axion-audit/prod/.env ; echo "code : $?"
```

---

## 10. Points à confirmer (remontés à A01)

Les points **arbitrés** sont conservés ici, marqués comme tels, pour que la porte P-A puisse les
relire un par un. Les autres sont **volontairement non devinés** et attendent `DECISIONS.md`.

1. **ARBITRÉ le 2026-08-27** — ~~Cohabitation staging/prod et port 443~~. `DECISIONS.md`,
   « Cohabitation staging/prod : qui écoute sur 443 ? », **option 2** : **UN SEUL Caddy**, dans
   la pile de prod, sert les deux environnements par deux blocs de site — application littérale
   du 02 §11.2 (« `staging` (même VPS, **sous-domaine**, DB séparée) »). Le Caddy de staging en
   loopback et le tunnel SSH `127.0.0.1:8081` sont **supprimés** ; voir §5 bis.
2. **ARBITRÉ le 2026-08-27 (revue croisée B-6)** — ~~Ports internes de `field` et `hq`~~ :
   **un port par application, identique dedans et dehors** — `field` 5173, `hq` **5174**.
   L’infra disait 5173 pour `hq` là où les trois sources applicatives disent 5174 ; la sonde
   ne passait donc jamais, Caddy (qui en dépend) ne démarrait pas, et
   « `docker compose up` = stack complète » était faux **en local**. Corrigé : commentaire de
   contrat, mappage d’hôte, sonde et fichiers de fronts. Voir §2 bis.
3. **Commandes de migration** : `deploy.sh` appelle `pnpm db:migrate:check` (dry-run) puis
   `pnpm db:migrate`. Ces deux scripts doivent exister dans l'image `api`.
4. **ARBITRÉ le 2026-08-27** — ~~`GHCR_OWNER` et `IMAGE_TAG` absents de `.env.example`~~ :
   ajoutés par A01 en **section 18** du `.env.example` (`DECISIONS.md`, « Points
   d'infrastructure actés sans réserve », point 2).
5. **Tags MinIO / `mc` / Caddy** figés dans les fichiers : à confirmer comme « dernière release
   stable au démarrage » (11 §1) au moment du provisionnement réel, puis à geler.
6. **ARBITRÉ le 2026-08-27** — `CADDY_STAGING_SITE_ADDRESS` ajoutée par A01 au `.env.example`
   §14, documentée comme vivant dans le `.env` de **prod**. La variable
   ~~`CADDY_STAGING_API_PORT`~~ a été **refusée et supprimée** : le port de l'API n'est jamais
   publié, il n'a aucune raison de différer entre les deux environnements, et deux copies à
   tenir à la main dans deux `.env` auraient été une panne en attente. `API_PORT` est désormais
   une **convention commune** (voir §4).
7. **ARBITRÉ le 2026-08-27 (revue croisée B-7)** — **service des fronts** : volume partagé
   - `root`/`file_server` dans Caddy en staging/prod, `reverse_proxy` vers Vite en dev.
     Bascule par `CADDY_FRONT_CONFIG` (**variable à ajouter au `.env.example`, valeur locale
     `/etc/caddy/fronts.dev.caddy`**). Voir §2 bis.
8. **ARBITRÉ le 2026-08-27 (revue croisée M-11)** — **chemin du `.env`** :
   `/opt/axion-audit/<env>/.env`, et RIEN à la racine. Voir l’encadré du §4.
