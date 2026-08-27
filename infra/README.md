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
├── docker-compose.staging.yml    surcharge staging (images GHCR, limites CPU/RAM)
├── docker-compose.prod.yml       surcharge prod    (images GHCR, 80/443)
├── caddy/Caddyfile               domaine unique, en-têtes de sécurité, CSP
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
    ├── restore-test.sh           TEST DE RESTAURATION NOCTURNE (critère L0)
    └── install-cron.sh           planification des trois tâches ci-dessus
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
#    En local, PUBLIC_BASE_URL=http://localhost:8080 et CADDY_SITE_ADDRESS=:8080
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

Initialisation **unique** du dépôt de sauvegarde (sans elle, `archive_command`
échoue et les WAL s'accumulent dans `pg_wal`) :

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

**Séparation stricte staging/prod (02 §30.4-4)** : deux fichiers, deux jeux de valeurs.

```
/opt/axion-audit/prod/.env       APP_ENV=prod     CADDY_SITE_ADDRESS=audit.<domaine>
/opt/axion-audit/staging/.env    APP_ENV=staging  CADDY_SITE_ADDRESS=:8080
```

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

```bash
# 5.1 — Authentification au registre d'images privé (02 §30.5)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <compte> --password-stdin

# 5.2 — Déploiement
/opt/axion-audit/repo/infra/scripts/deploy.sh --env prod --tag v0.0 \
  --env-file /opt/axion-audit/prod/.env

# 5.3 — Initialisation du dépôt pgBackRest (UNE SEULE FOIS par environnement)
cd /opt/axion-audit/repo
docker compose --env-file /opt/axion-audit/prod/.env \
  -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  exec --user postgres postgres pgbackrest --stanza=axion stanza-create

# 5.4 — Première sauvegarde complète, puis planification
infra/scripts/backup-postgres.sh /opt/axion-audit/prod/.env
infra/scripts/backup-minio.sh    /opt/axion-audit/prod/.env
infra/scripts/install-cron.sh    /opt/axion-audit/prod/.env

# 5.5 — Premier test de restauration, à la main, sans attendre la nuit
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
| `${RESTORE_TEST_CRON}` (défaut `0 3 * * *`) | `restore-test.sh` — **critère d'acceptation L0**   |

---

## 6. PRA — restauration complète, RTO cible **4 h** (02 §11.4)

Scénario : **le VPS est perdu**. RPO ≤ 6 h côté siège ; côté terrain, les données non
synchronisées vivent encore sur les appareils (invariant 8).

| #   | Étape                                                              | Durée cible  |
| --- | ------------------------------------------------------------------ | ------------ |
| 1   | Louer un VPS Ubuntu LTS identique, y déposer sa clé SSH            | 15 min       |
| 2   | `git clone` du dépôt + `provision-vps.sh`                          | 20 min       |
| 3   | Restaurer le `.env` chiffré depuis la Storage Box                  | 10 min       |
| 4   | Restaurer PostgreSQL (ci-dessous)                                  | 60 min       |
| 5   | Restaurer MinIO (ci-dessous)                                       | 60 min       |
| 6   | `deploy.sh` + `smoke-test.sh`                                      | 20 min       |
| 7   | Repointer le DNS, vérifier le certificat, prévenir les consultants | 30 min       |
|     | **Total**                                                          | **≈ 3 h 35** |

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
  -v /var/backups/axion/pgbackrest-export:/import:ro alpine:3.20 sh -c 'cp -a /import/. /repo/'

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

---

## 9. Le test de restauration nocturne a échoué — que faire

Vous recevez sur Telegram : `ÉCHEC du test de restauration nocturne (N contrôle(s))`.

```bash
ssh -p 2222 root@<IP>
ls -t /var/log/axion/restore-test-*.log | head -1
less "$(ls -t /var/log/axion/restore-test-*.log | head -1)"
```

| Message dans le rapport        | Cause probable                                          | Action                                                                                  |
| ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `dépôt pgBackRest introuvable` | stanza jamais créée, ou volume perdu                    | `pgbackrest --stanza=… stanza-create` puis `backup-postgres.sh`                         |
| `pgbackrest restore a échoué`  | dépôt corrompu ou passphrase changée                    | `pgbackrest --stanza=… check` puis `info` ; vérifier `PGBACKREST_CIPHER_PASS`           |
| `resté en recovery`            | WAL manquants (archivage cassé)                         | `SELECT * FROM pg_stat_archiver;` — si `failed_count` monte, l'`archive_command` échoue |
| `Jeu de tables divergent`      | sauvegarde antérieure à une migration                   | normal **le jour d'un déploiement de schéma** ; doit redevenir vert au passage suivant  |
| `COUNT incohérent`             | la restauration contient **plus** de lignes que la prod | anomalie sérieuse (mauvaise base ciblée) — **escalade immédiate**                       |
| `sommes de contrôle INVALIDES` | archive MinIO corrompue                                 | reprendre l'archive de la veille sur la Storage Box ; relancer `backup-minio.sh`        |
| `Aucune archive MinIO trouvée` | `backup-minio.sh` n'a jamais tourné                     | vérifier `/etc/cron.d/axion-audit`, lancer à la main                                    |

**Deux nuits rouges consécutives = les sauvegardes ne sont plus une garantie.** Arrêt des
déploiements, sauvegarde manuelle immédiate hors serveur, escalade Williams.

Le script est **non destructif** et **idempotent** : il se rejoue à la main sans risque.

```bash
infra/scripts/restore-test.sh /opt/axion-audit/prod/.env ; echo "code : $?"
```

---

## 10. Points à confirmer (remontés à A01)

Ces points sont **volontairement non devinés** ; ils sont détaillés dans le rapport de lot et
attendent un arbitrage `DECISIONS.md`.

1. **Cohabitation staging/prod et port 443** : un seul processus peut lier 80/443 sur un VPS.
   En l'état, **seule la prod publie 80/443** ; le staging écoute en loopback `127.0.0.1:8081`
   et se consulte par tunnel SSH (`ssh -L 8081:127.0.0.1:8081 …`).
2. **Ports internes de `field` et `hq`** : le Caddyfile route vers `5173` pour les cibles `dev`
   **et** `runtime`. Si les images de production servent sur un autre port, corriger le
   `Caddyfile` (une ligne par service).
3. **Commandes de migration** : `deploy.sh` appelle `pnpm db:migrate:check` (dry-run) puis
   `pnpm db:migrate`. Ces deux scripts doivent exister dans l'image `api`.
4. **`GHCR_OWNER` et `IMAGE_TAG`** ne figurent pas dans `.env.example` : à y ajouter (ce ne sont
   pas des secrets).
5. **Tags MinIO / `mc`** figés dans les fichiers : à confirmer comme « dernière release stable au
   démarrage » (11 §1) au moment du provisionnement réel.
