# Faire cohabiter Axion Audit (staging) avec axion-ia.com sur le même serveur

> **Ce document répond à une question de Williams**, posée trois fois et légitime : peut-on héberger
> le staging d'Axion Audit sur `axionia-web` — le serveur du site essentiel — sans les mélanger, et
> en pouvant migrer plus tard sans douleur ?
>
> **Réponse : oui**, à quatre conditions écrites ci-dessous. Ce document existe pour qu'aucune ne
> soit oubliée le jour de l'installation.

---

## 1. Ce qui change sur axion-ia.com : presque rien, et c'est le point

| Élément                              | Effet                                        |
| ------------------------------------ | -------------------------------------------- |
| Code d'axion-ia.com                  | **aucune modification**                      |
| Ses conteneurs, sa base, ses données | **aucune modification**                      |
| Ses volumes, ses réseaux Docker      | **aucune modification** — mais voir §5bis    |
| Sa configuration de reverse proxy    | **un bloc AJOUTÉ** pour `audit.axion-ia.com` |
| DNS                                  | **un enregistrement AJOUTÉ**                 |

Deux ajouts, zéro modification. C'est ce qui rend la migration ultérieure simple : retirer un bloc de
proxy et un enregistrement DNS, et le serveur retrouve exactement son état d'avant.

> **Nuance ajoutée le 2026-08-28, après vérification sur la machine.** « Aucune modification » reste
> vrai : nous ne changeons la configuration d'aucun objet du voisin. Mais nous ne sommes pas non plus
> entièrement à part — notre Caddy **rejoint** le réseau Docker `coolify`, où vivent aussi les
> conteneurs d'axion-ia.com et de Docuseal, et Coolify attache son proxy à tous nos services. Rejoindre
> n'est pas modifier, et rien de ce qui est promis dans ce tableau n'est démenti ; mais l'étanchéité
> qu'on pouvait lire entre les lignes n'existe pas. Le détail, chiffré et vérifiable, est en **§5bis**.

---

## 2. Ce qu'il ne faut SURTOUT PAS faire

**Ne pas exécuter `infra/scripts/provision-vps.sh` sur cette machine.**

Le script est écrit pour un serveur **neuf et vide**, et il y est juste. Sur `axionia-web` il ferait
trois choses dangereuses :

1. il **change le port SSH** et coupe l'authentification par mot de passe ;
2. il **referme le pare-feu UFW** sur 80/443 + le nouveau port SSH uniquement ;
3. il installe fail2ban et les mises à jour automatiques.

Sur un serveur déjà configuré et en production, les deux premières peuvent **vous couper l'accès à
votre propre machine** et casser des flux réseau que le script ne connaît pas. Le durcissement SSH et
le pare-feu sont des décisions qui appartiennent à celui qui connaît la machine.

**Ce qu'on en reprend, à la main et sans risque :** vérifier que Docker et le plugin Compose sont
présents, créer l'arborescence `/opt/axion-audit/staging`, créer l'utilisateur de déploiement.

---

## 3. Pourquoi plafonner nos conteneurs — et ce que ça coûte de ne pas le faire

Par défaut **un conteneur Docker n'a aucune limite** : il peut prendre toute la mémoire et tout le
CPU. C'est invisible tant que tout va bien, et brutal le jour où ça ne va plus.

| Ce qui arrive                                | Conséquence pour axion-ia.com                      |
| -------------------------------------------- | -------------------------------------------------- |
| PostgreSQL d'audit reçoit une grosse requête | il prend plusieurs Go de cache, le site ralentit   |
| Le worker enchaîne des appels LLM            | il monopolise les vCPU, le site répond en secondes |
| Une fuite mémoire dans notre code            | **le noyau Linux tue un processus pour survivre**  |

Le troisième point est le vrai motif. Le noyau choisit sa victime **par score de mémoire, pas par
importance** : sans plafonds, rien ne lui dit qu'axion-ia.com est le service essentiel et l'audit le
service secondaire. **Il peut tuer le site plutôt que nous.** Les plafonds le lui disent.

Le coût existe dans l'autre sens : un plafond **trop bas** étrangle notre propre outil. C'est un
réglage, pas une protection magique — d'où les trois commandes ci-dessous.

---

## 3bis. Le disque : ce que coûte « construire sur le serveur », mesuré

> L'arbitrage tracé dans `DECISIONS.md` (« le staging construit ses images sur le serveur ») a
> chiffré le risque **mémoire et CPU pendant la construction**. Il n'a pas chiffré l'**empreinte
> disque**, qui est permanente et croissante. Cette section comble ce trou. Toutes les valeurs
> ci-dessous sont **mesurées sur `axionia-web` le 2026-08-28**, pas estimées.

### 3bis.1 Ce que notre pile occupe réellement

| Poste                                       | Mesure       | Croissance par déploiement         |
| ------------------------------------------- | ------------ | ---------------------------------- |
| Images (6, taguées `axion-audit-*`)         | **1,09 Go**  | **≈ 0** — le tag fixe est réécrit  |
| Images orphelines retenues par un conteneur | 0,71 Go      | voir 3bis.4                        |
| Volumes (8)                                 | 89 Mo        | croît avec les données de test     |
| Couches inscriptibles des conteneurs        | 0,8 Mo       | ≈ 0                                |
| Journaux de conteneurs                      | 2,5 Mo       | borné : 9 × 5 × 10 Mo = **450 Mo** |
| **Cache de build**                          | **4,61 Go**  | **≈ 760 Mo par construction**      |
| **Total**                                   | **≈ 6,5 Go** |                                    |

**Le cache de build est 71 % de notre empreinte, et la seule ligne qui croît vraiment.** Nos images,
elles, ne s'accumulent pas : le compose fixe `image: axion-audit-api:coolify`, un tag constant que
chaque construction réécrit. C'est ce qui borne notre empreinte d'images — et c'est exactement ce
qui rend le retour arrière par image impossible (voir `.github/workflows/deploy-staging.yml`). Le
même choix paie ici et coûte là-bas ; il faut le savoir dans les deux sens.

Le total de 6,46 Go de cache de build affiché par `docker system df` **n'est pas à nous en entier** :
4,61 Go nous sont attribuables (141 enregistrements sur 528), le reste appartient au voisin. La
méthode d'attribution est dans `infra/scripts/empreinte-docker.sh`.

### 3bis.2 Ce que nous ne sommes PAS

La photographie « 105 Go libres → 83 Go, 22 Go en une matinée » est exacte, mais elle ne nous impute
pas ces 22 Go. Le même matin, le voisin a produit **deux images de 13,6 Go et 1,92 Go**, taguées par
commit et donc conservées, pour 20 déploiements ; nous en avons fait 11, pour ≈ 5,7 Go tout compris.
**Notre part est d'environ un quart.** L'écrire n'est pas se dédouaner : c'est éviter de dimensionner
un correctif sur le mauvais poste.

### 3bis.3 Trois élagueurs tournent déjà, dont aucun n'est le nôtre

| Qui               | Quand                | Quoi                                                                       |
| ----------------- | -------------------- | -------------------------------------------------------------------------- |
| crontab du voisin | toutes les 6 h       | `docker image prune -af` · `docker builder prune -af --keep-storage 2GB`   |
| Coolify (forcé)   | tous les jours 00:00 | `docker image prune -f` · `docker builder prune -af` · `docker rmi` ciblés |
| Coolify (alerte)  | toutes les 23 h      | notification au-delà de 80 % d'occupation                                  |

**Conséquence pratique n° 1 : le disque n'accumule pas, il oscille.** Les exécutions enregistrées par
Coolify (`docker_cleanup_executions`) montrent un dent-de-scie quotidien entre 26–36 % après
nettoyage et 40–82 % avant.

**Conséquence pratique n° 2 : le seuil de 80 % n'est pas une échéance future — il a déjà été franchi.**
Le 2026-08-22, l'occupation a atteint **82 %** avant le nettoyage de minuit, **six jours avant notre
premier déploiement**. Nous n'en sommes pas la cause ; nous en réduisons la marge d'environ 5 points
par jour au rythme actuel.

**Échéance si tous les élagages s'arrêtaient** (le seul scénario que nous ayons à borner) : à partir
du plancher post-nettoyage, il reste ≈ 76 Go avant 80 %. À 5 déploiements/jour × 760 Mo, **≈ 20
jours** pour notre seule croissance ; à 11 déploiements/jour comme le 28 août, **≈ 9 jours**. Avec le
voisin, l'accumulation combinée observée (15 à 56 Go/jour) ramène cela à **1,5 à 5 jours**.
`infra/scripts/empreinte-docker.sh mesurer` recalcule cette échéance sur les valeurs du jour.

### 3bis.4 Nos images ne sont protégées par rien — et une image a déjà disparu

Le nettoyage de Coolify n'épargne une image que si elle correspond à l'un de ces trois cas :
son dépôt porte l'uuid d'une application Coolify, c'est une image d'infrastructure Coolify, ou elle
porte le label **`coolify.managed=true`**. Nos six images s'appellent `axion-audit-*` et **ne portent
pas ce label** (vérifié : `coolify.managed` y est vide). Aux yeux des deux élagueurs, elles sont des
images étrangères : elles ne survivent que parce qu'un conteneur les utilise, ce qui fait échouer
silencieusement le `docker rmi`.

Ce n'est pas une hypothèse. Le journal `/var/log/docker-image-prune.log` du voisin contient déjà :

```
untagged: axion-audit-postgres:16
untagged: caddy:2-alpine
```

— une de nos images d'un ancien nommage, et une **image de base** dont notre `caddy` a besoin pour
se reconstruire.

Et l'état constaté le 2026-08-28 est pire : les conteneurs `postgres` et `caddy` du staging tournent
sur des images **absentes de l'index Docker** (`docker image inspect` répond « No such image »). Un
déploiement en échec à 06:09 a reconstruit ces deux images et déplacé les tags ; les conteneurs, eux,
n'ont pas été recréés et sont restés sur l'image précédente, désormais innommable.

**Ce que cela veut dire, concrètement :** un `docker compose up -d`, un redémarrage avec recréation,
ou un `docker compose down` suivi d'un `up` **ne peut plus recréer ces deux conteneurs à l'identique**.
Ce qui tourne n'est plus ce qu'aucun tag désigne. La seule sortie est une reconstruction complète
(≈ 70 s par déploiement Coolify), qui exigera de retirer à nouveau les images de base éventuellement
élaguées entre-temps — donc du réseau.

### 3bis.5 Ce que nous faisons, et ce que nous ne ferons jamais

`infra/scripts/empreinte-docker.sh` est l'outil de ce poste. Il a deux modes : `mesurer` (défaut,
n'écrit rien) et `elaguer` (à blanc sans `--confirmer`).

**Interdictions absolues, inscrites dans le script et vérifiables en le lisant :** aucune commande
globale — ni `docker system prune`, ni `docker volume prune`, ni `docker image prune -a`, ni
`docker builder prune`. Sur une machine partagée, ces commandes ne sont pas « risquées », elles sont
hors sujet : elles ne savent pas distinguer nos objets de ceux du voisin.

**Ce que le script ne touchera JAMAIS, en aucun mode :** les volumes (les nôtres comme ceux du
voisin), les réseaux, les conteneurs, le cache de build, toute image hors du préfixe `axion-audit-`,
et **toute image utilisée par un conteneur, même arrêté, même au voisin**.

**Ce qu'il élague :** les seules images `axion-audit-*` **déclassées** — au-delà des 2 plus récentes
de leur dépôt et référencées par aucun conteneur. La plus récente d'un dépôt n'est jamais supprimable.

**Ce mode est un no-op aujourd'hui, et c'est voulu.** Avec des tags fixes, il n'y a qu'une image par
dépôt : elle est toujours au rang 0, donc toujours gardée. La règle existe pour le jour où les images
seront taguées par commit — le changement qui rendrait le retour arrière possible. La première
version de ce script, elle, proposait de supprimer `axion-audit-postgres:16-coolify` et
`axion-audit-caddy:coolify`, c'est-à-dire les deux seules copies restantes de ces images ; le passage
à blanc l'a montré avant qu'elle ne soit exécutée. C'est la raison d'être du mode à blanc.

**Le cache de build, notre plus gros poste, n'est volontairement pas élagué par nous.** BuildKit
n'offre aucun filtre de propriété : `docker builder prune` n'accepte que `--filter until=` et
`--keep-storage`, qui frapperaient le voisin dans la même commande. Et cet objet est déjà élagué deux
fois par jour par deux autres acteurs. Un troisième élagueur ne libérerait rien de plus ; il
augmenterait seulement la probabilité qu'une construction en cours perde son cache au milieu.

**Ce qui reste à arbitrer** (hors du périmètre de cette note, à porter en `DECISIONS.md`) : faut-il
poser `coolify.managed=true` sur nos images pour les soustraire aux deux élagueurs, ou accepter la
reconstruction ? La première option ment à Coolify sur la propriété de l'objet ; la seconde accepte
qu'une panne du réseau sortant nous empêche de redéployer. Aucune n'est gratuite.

---

## 3ter. Une garantie de sécurité qui repose sur un Traefik qui ne nous appartient pas

Le plafond de `10 req/min/IP` sur `/v1/auth/*` (contrat 11 §3) ne vaut que si l'API sait quelle est
l'adresse du client. Sur cette machine, elle ne l'apprend qu'au bout d'une chaîne de trois maillons,
et **le premier n'est pas sous notre contrôle** :

```
client ──► Traefik de Coolify ──► notre Caddy ──► notre API
           (10.0.1.6)             (10.0.4.8)      (request.ip)
           PAS À NOUS             à nous          à nous
```

**Mesuré le 2026-08-29** (A57), maillon par maillon, sur la chaîne réelle :

| Maillon          | Comportement constaté                                                                                            | Comment c'est mesuré                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| client → Traefik | Traefik **écrase** `X-Forwarded-For` et `X-Real-IP` par l'adresse réelle, même si le client en envoie plusieurs  | journal d'accès de notre Caddy, en situ                                                  |
| Traefik → Caddy  | Caddy **n'ajoute** à `X-Forwarded-For` que si le pair est déclaré dans `trusted_proxies` ; sinon il **remplace** | banc local, `caddy:2-alpine` v2.11.4, Caddyfile du dépôt monté tel quel, pair `10.0.1.6` |
| Caddy → API      | `request.ip` = première adresse **publique** en remontant, grâce au `trustProxy` restreint                       | vraie `@fastify/proxy-addr` 5.1.0, pair TCP `10.0.4.8`                                   |

### Ce que cette garantie suppose, et qui peut changer sans nous

1. **Que Traefik continue d'écraser `X-Forwarded-For`.** S'il se mettait à le _compléter_ au lieu de
   l'écraser, un client pourrait glisser une adresse à gauche de la sienne. Le `trustProxy` restreint
   de `apps/api/src/app.ts` (`['loopback','linklocal','uniquelocal']`) neutralise ce cas — la remontée
   s'arrête à la première adresse publique — **mais uniquement parce qu'il est restreint** : avec
   `trustProxy: true`, la valeur forgée serait retenue. C'est mesuré, pas supposé.
2. **Que le réseau Docker `coolify` garde le sous-réseau `10.0.1.0/24`.** C'est la plage déclarée dans
   `trusted_proxies` (`infra/caddy/Caddyfile`, les deux blocs). Vérifié le 2026-08-29 :
   `docker network inspect coolify` → `subnet=10.0.1.0/24`, `gateway=10.0.1.1`, `coolify-proxy=10.0.1.6`.
   Ce réseau est créé et détruit par **Coolify**, pas par nous.
3. **Que Traefik joigne Caddy en IPv4.** Le réseau `coolify` porte aussi un préfixe IPv6
   (`fd7b:96c6:c023::/64`) que `10.0.1.0/24` ne couvre pas.

### Ce qui se passe si l'une de ces suppositions tombe

**L'échec est FERMÉ, jamais ouvert** — et c'est la propriété qui rend la situation tenable :
si la plage ne correspond plus, Caddy revient à _remplacer_ l'en-tête, l'API revoit `10.0.1.6` pour
tout le monde, et le plafond redevient un **seau unique et global**. Jamais une adresse forgée.

Mais l'échec est aussi **SILENCIEUX** : rien ne se casse, rien n'alerte, et le plafond par client
cesse simplement d'exister. C'est pourquoi cette dépendance est écrite ici plutôt que tenue pour
acquise, et pourquoi une fiche `AMELIORATIONS.md` demande une sonde qui la vérifie en continu.

> **Vérification manuelle, en lecture seule, à rejouer après toute mise à jour de Coolify :**
>
> ```bash
> ssh axionia-web 'docker network inspect coolify \
>   --format "{{range .IPAM.Config}}{{.Subnet}} {{end}}"'   # doit contenir 10.0.1.0/24
> ssh axionia-web 'docker inspect coolify-proxy \
>   --format "{{(index .NetworkSettings.Networks \"coolify\").IPAddress}}"'  # doit être dans cette plage
> ```
>
> Si la plage a changé : mettre à jour `trusted_proxies` dans **les deux blocs** de
> `infra/caddy/Caddyfile`, et redéployer. Tant que ce n'est pas fait, le plafond de `/v1/auth/*`
> ne protège personne individuellement.

---

## 4. Les trois commandes à me fournir (lecture seule, elles ne modifient rien)

```bash
free -h                    # mémoire totale et réellement disponible
df -h /                    # espace disque restant
docker stats --no-stream   # ce que consomment RÉELLEMENT les conteneurs existants
```

La troisième est la plus importante : les specs annoncées (16 Go) ne disent pas ce qu'axion-ia.com
**utilise**. On plafonne sur ce qui reste, pas sur ce qui existe.

**Règle de dimensionnement appliquée ensuite :** on réserve à axion-ia.com **sa consommation observée
majorée de 60 %**, on garde **2 Go pour le système**, et le staging d'audit reçoit le reste — réparti
en priorité sur PostgreSQL, qui est le seul service dont la lenteur se voit immédiatement.

---

## 5. Les quatre conditions de la cohabitation

1. **Réseaux Docker séparés — CONDITION AMENDÉE, elle n'est pas tenue telle qu'elle était écrite.**
   Voir §5bis : Coolify impose un second réseau, partagé avec son proxy. MinIO reste interne
   (11 §2 : jamais exposé publiquement) ; l'accès aux fichiers passe par l'API, en flux, avec RBAC.
2. **Ports non publiés.** Aucun `ports:` vers l'hôte sauf le port du Caddy d'audit, écouté sur
   `127.0.0.1` uniquement. Le proxy d'axion-ia.com est le seul point d'entrée public.
   **Vérifiée et tenue** : aucun de nos huit conteneurs ne publie de port sur l'hôte.
3. **Volumes préfixés et arborescence dédiée** (`/opt/axion-audit/staging`). Aucune donnée d'audit
   hors de cet arbre : c'est ce qui permet de tout déplacer plus tard en une commande.
   **Tenue quant au fond, mais PAS avec les noms que le compose annonce** — voir §5ter.
4. **Plafonds mémoire et CPU sur TOUS nos conteneurs**, y compris ceux qu'on croit petits. Un worker
   qui ne fait rien 99 % du temps est précisément celui qui surprend.
   **Vérifiée et tenue** : `mem_limit`, `memswap_limit` et `deploy.resources` sont présents sur les
   huit services dans le compose que Coolify déploie réellement.

---

## 5bis. Condition n° 1 : ce que Coolify impose, et ce qui reste vrai malgré tout

**Ce que ce document promettait :** « Nos services ne rejoignent aucun réseau existant. »
**Ce que la machine fait :** nos huit conteneurs sont sur **trois** réseaux, pas un.

| Réseau                        | Qui l'a voulu         | Qui d'autre est dessus                                                 |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `axion-audit-coolify-interne` | nous (le compose)     | **personne d'autre** — la promesse tient ici                           |
| `wrunr6mwq2oxqq392i4myzjn`    | **Coolify, d'office** | `coolify-proxy` (Traefik) — et personne d'autre                        |
| `coolify`                     | **nous** (`edge:`)    | `coolify-proxy`, **axion-ia, Docuseal, `coolify-db`, `coolify-redis`** |

**Le prix de l'insertion derrière Traefik.** Coolify crée un réseau par application, l'ajoute à
**chaque** service de la pile — postgres, redis et minio compris — et y attache son proxy. Ce n'est
pas configurable : c'est ainsi que Coolify sait router vers une application. Traefik est donc
**adjacent au niveau réseau** à notre base, à notre cache et à notre stockage d'objets. C'est réel,
ce n'est pas gratuit, et cela doit pouvoir être arbitré plutôt que découvert.

**Ce qui reste vrai malgré tout, et qui a été vérifié une par une :**

- **aucun de ces services ne publie de port sur l'hôte** — ils sont injoignables depuis Internet
  autrement qu'en traversant Traefik ;
- **Traefik ne publie aucune route vers eux** : seul `caddy` porte un domaine
  (`docker_compose_domains`), et `postgres`, `redis`, `minio`, `api` et `worker` ne portent
  **zéro label `traefik.*`** ;
- **ce réseau n'est partagé avec personne d'autre** : le voisin n'y est pas, seul le proxy y est.

Autrement dit : **l'isolement qui s'applique est celui de la configuration de Traefik, pas celui de
la topologie du réseau.** C'est un cran plus faible que ce qui était écrit, et c'est la formulation
honnête. Un routeur Traefik mal déclaré — par nous ou par une future version de Coolify — exposerait
un service qu'aucune barrière réseau ne protège plus.

**Le point le plus discutable n'est pas de Coolify, il est de nous.** La troisième ligne du tableau
— `caddy` sur le réseau `coolify` — vient de notre propre déclaration `edge: external`. Elle place
notre Caddy sur le même segment que les conteneurs d'axion-ia.com, de Docuseal et **de la base de
données de Coolify**. Or Coolify attache déjà son proxy au réseau de l'application : cette seconde
attache est **redondante pour le routage**. La retirer sortirait `caddy` du segment partagé sans rien
casser.

> **À arbitrer (`DECISIONS.md`)** : retirer `edge:`/`COOLIFY_PROXY_NETWORK` du service `caddy` dans
> `infra/docker-compose.coolify.yml`. Bénéfice : plus aucun de nos conteneurs sur un réseau partagé
> avec le voisin. Risque : à confirmer sur un déploiement de contrôle que Traefik route bien par le
> réseau d'application seul. Non fait ici — ce fichier est en cours de modification par d'autres
> travaux et la modification sort du périmètre de cette note.

---

## 5ter. Condition n° 3 : les noms de volumes du compose sont lettres mortes

**Ce que le compose déclare :** `name: axion-coolify-postgres-data`, et sept autres du même genre.
**Ce que la machine porte :** `wrunr6mwq2oxqq392i4myzjn_postgres-data`.
**Combien de volumes `axion-coolify-*` existent :** **zéro.**

**Pourquoi.** Coolify ne déploie pas notre fichier : il le réécrit, et c'est sa version qui fait foi
(`applications.docker_compose` en base). Dans cette version, les montages au niveau des services ont
été récrits en `<uuid>_<clé>`, les entrées de haut niveau correspondantes ont été ajoutées, et **nos
huit déclarations d'origine ont été laissées dans le fichier, orphelines** — plus aucun service ne
les monte. Docker ne crée pas un volume que personne ne monte. Nos noms n'ont donc jamais désigné
quoi que ce soit.

**Les noms réels, à utiliser dans toute procédure d'exploitation :**

| Clé du compose    | Volume réel                                |
| ----------------- | ------------------------------------------ |
| `postgres_data`   | `wrunr6mwq2oxqq392i4myzjn_postgres-data`   |
| `pgbackrest_repo` | `wrunr6mwq2oxqq392i4myzjn_pgbackrest-repo` |
| `redis_data`      | `wrunr6mwq2oxqq392i4myzjn_redis-data`      |
| `minio_data`      | `wrunr6mwq2oxqq392i4myzjn_minio-data`      |
| `caddy_data`      | `wrunr6mwq2oxqq392i4myzjn_caddy-data`      |
| `caddy_config`    | `wrunr6mwq2oxqq392i4myzjn_caddy-config`    |
| `field_dist`      | `wrunr6mwq2oxqq392i4myzjn_field-dist`      |
| `hq_dist`         | `wrunr6mwq2oxqq392i4myzjn_hq-dist`         |

**Ne recopiez pas cette colonne dans un script.** `wrunr6mwq2oxqq392i4myzjn` est l'uuid de
l'application **Coolify**, pas le nôtre : supprimer puis recréer l'application dans Coolify le change,
et tous les noms avec. Une procédure d'exploitation doit **déduire** le nom, jamais l'écrire :

```bash
# Le nom réel du volume monté par un service, demandé au conteneur lui-même.
docker inspect postgres-wrunr6mwq2oxqq392i4myzjn-051636151140 \
  --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}'

# Tous nos volumes, quel que soit l'uuid en vigueur.
docker volume ls --format '{{.Name}}' | grep -E '_(postgres|pgbackrest|redis|minio|caddy|field|hq)-'
```

**Pourquoi cela comptait.** Une procédure de sauvegarde ou de reprise qui cite
`axion-coolify-postgres-data` ne restaure pas la mauvaise donnée : elle échoue sur un volume
inexistant, ou — pire — en crée un vide et le monte à la place du bon. Au moment où on la joue, on ne
cherche pas ce genre d'erreur.

> **Le `name:` du compose est conservé pour la production**, qui n'est pas déployée par Coolify et où
> il désigne bien le volume créé. C'est la voie Coolify, et elle seule, qui l'ignore.

---

## 5quater. Un risque HÉRITÉ de la cohabitation, et qui n'appartient pas à ce projet

> **Constaté et mesuré le 2026-08-28.** Écrit ici parce qu'un risque qu'on ne trace pas est un risque
> qu'on oublie — pas parce qu'Axion Audit aurait à le corriger. **Il ne l'a pas.**

**La console d'administration de Coolify est joignable depuis Internet en HTTP non chiffré**, sur le
port 8000 de la machine. Mesure : la page d'accueil du tableau de bord s'ouvre depuis un navigateur
ordinaire, sans VPN ni tunnel, en `http://` — donc **le mot de passe d'administration circule en
clair** à chaque connexion.

**Pourquoi cela nous concerne sans nous appartenir.** Coolify n'est pas une pièce d'Axion Audit :
c'est le **plan de contrôle de la machine entière**, celle qui sert `axion-ia.com` en production.
Qui l'obtient obtient les deux projets — nos variables d'environnement comprises, dont les secrets
que le §5bis décrit déjà comme lisibles par l'orchestrateur. Notre étanchéité s'arrête donc au
niveau au-dessus de nous, et ce niveau est celui du voisin.

**Ce que ce document interdit d'en faire, et qui vaut toujours.** Le §2 pose que « _le durcissement
SSH et le pare-feu sont des décisions qui appartiennent à celui qui connaît la machine_ ». La
correction — enregistrement DNS dans la zone `axion-ia.com`, domaine d'instance Coolify, fermeture du
port 8000 — tombe entière de ce côté-là de la frontière. **Un agent du lot Audit ne doit pas la
faire**, et celui qui écrit ces lignes s'est arrêté au moment de créer l'enregistrement, sur rappel
de Williams.

**Marche à suivre, pour le jour où elle sera décidée — l'ORDRE est la seule chose dangereuse :**

1. créer l'enregistrement `A` du sous-domaine choisi vers l'IP, **nuage GRIS (DNS only)**. En orange,
   le proxy Cloudflare intercepte le défi ACME et le certificat n'est jamais émis — leçon déjà payée,
   tracée dans `docs/portes/PORTE_A_2026-08-27.md` ;
2. **vérifier que le nom résout** avant de toucher à Coolify ;
3. seulement ensuite, poser le domaine d'instance dans Coolify, qui demandera un certificat
   Let's Encrypt. **Les enregistrements CAA de la zone autorisent déjà `letsencrypt.org`** — vérifié
   le 2026-08-28, aux côtés de `sectigo.com`, `ssl.com` et `pki.goog` ;
4. **NE PAS croire qu'`ufw` ferme le port — voir l'encadré ci-dessous.** Restreindre l'exposition
   se fait ailleurs, et l'encadré dit où.

> ### ⚠️ `ufw` NE FERMERAIT RIEN — mesuré le 2026-08-28
>
> **C'est la correction que tout le monde tente en premier, et elle produirait un garde-fou menteur :
> une règle affichée verte, un port resté grand ouvert.**
>
> Mesures sur la machine : `ufw status` → **inactive**, rien n'est filtré. Et surtout
> `iptables -S DOCKER-USER` → **la chaîne est VIDE**, tandis que `iptables -t nat -S` montre
> `-A DOCKER … --dport 8000 -j DNAT --to-destination 10.0.1.11:8080`. Le trafic conteneur est
> **DNATé puis FORWARDé** : il ne traverse jamais la chaîne `INPUT` que `ufw` filtre. Un
> `ufw deny 8000` serait donc sans effet, tout en donnant l'apparence de la protection.
>
> **Et la voie `iptables` est interdite à un agent du lot Audit** : `DOCKER-USER` filtre **tout** le
> trafic conteneur, `coolify-proxy` sur 80/443 compris — donc **`axion-ia.com` en production**. Une
> règle mal cadrée coupe le site du voisin.
>
> **Ce n'est pas non plus le seul port ouvert** : outre 8000, sont joignables en clair depuis
> Internet **6001 et 6002** (`coolify-realtime`) et **32769** (Plausible, HTTP 200).
>
> ### ❌ CE QUI A ÉTÉ TENTÉ ET QUI NE MARCHE PAS — `APP_PORT=127.0.0.1:8000`
>
> **Cette voie a été écrite ici, exécutée par Williams, et elle a ÉCHOUÉ. Elle est conservée en
> négatif pour que personne ne la retente.** Deux défauts, dont le second condamne l'approche entière.
>
> **a) Erreur de syntaxe.** `/data/coolify/source/docker-compose.prod.yml` interpole
> `${APP_PORT:-8000}` à **deux** endroits : `ports: - "${APP_PORT:-8000}:8080"` **et**
> `expose: - "${APP_PORT:-8000}"`. `expose` n'accepte qu'un numéro nu → `invalid start port
'127.0.0.1:8000': invalid syntax`. La faute d'origine est une lecture de `grep` sans vérification
> du contexte de la seconde occurrence.
>
> **b) Et même corrigée, elle ne tiendrait pas 24 h.** `ls /data/coolify/source/upgrade-*.log` montre
> des journaux **du 26, du 27 et du 28 août à 00:00:0X** : **Coolify se met à jour seul chaque nuit et
> réécrit `docker-compose.prod.yml`.** Toute édition de ce fichier serait annulée en silence la nuit
> suivante, et le port se rouvrirait sans que personne ne le voie. **C'est le même motif que `ufw`
> ci-dessus** : un correctif qui s'affiche appliqué et se défait tout seul.
>
> **Dégâts et remise en état** (tracés parce qu'un incident tu est un incident qui se répète) : le
> remplacement a échoué **avant** d'arrêter l'ancien conteneur `coolify`, qui n'a jamais cessé de
> tourner ; `coolify-redis` et `coolify-realtime` sont restés en état `Created`, donc arrêtés.
> Restauration par `cp .env.avant-8000 .env` + `up -d` : 5 conteneurs `healthy`, `.env` sans
> `APP_PORT`, `axion-ia.com` 301, `audit-staging` 200, console 302. **`axion-ia.com` n'a jamais été
> interrompu**, vérifié pendant la panne.
>
> ### ✅ LA VOIE QUI TIENT — le pare-feu Cloud de Hetzner · **POSÉ ET VÉRIFIÉ LE 2026-08-28**
>
> **⚠️ SI LA CONSOLE COOLIFY NE RÉPOND PLUS, LE SERVEUR N'EST PAS TOMBÉ — C'EST CECI.** Lisez cette
> section avant de diagnostiquer quoi que ce soit ; elle a été écrite pour vous épargner vingt
> minutes de panique.
>
> **Mesure de contrôle, 2026-08-28 après application :**
>
> | Cible                                                   | Résultat                               |
> | ------------------------------------------------------- | -------------------------------------- |
> | `https://axion-ia.com`                                  | **301 en 0,66 s** — production intacte |
> | staging, port 80                                        | **404 en 0,28 s** — Caddy répond       |
> | console `:8000` · realtime `:6001` · Plausible `:32769` | **timeout à 12 s**                     |
>
> **Le mot qui fait le diagnostic est « timeout », pas « connexion refusée ».** Un service arrêté
> répond `ECONNREFUSED` instantanément ; un paquet jeté en silence ne revient jamais. Trois ports
> muets pendant que 22, 80 et 443 vivent : c'est un filtrage réseau, et c'est celui qu'on voulait.
>
> **Comment revenir sur le tableau de bord :**
>
> ```
> ssh -L 8000:localhost:8000 -L 6001:localhost:6001 -L 6002:localhost:6002 axionia-web
> ```
>
> puis `http://localhost:8000`. **Les redirections 6001 et 6002 ne sont pas facultatives** : elles
> portent le temps réel. Sans elles la console s'affiche mais ses états ne se rafraîchissent plus —
> et on croit à un bug de Coolify.
>
> **Depuis un SECOND poste** : le pare-feu bloque tout le monde, et le tunnel exige la clé privée qui
> vit sur le poste de développement. Deux voies : générer une **seconde** clé propre à ce poste et
> ajouter sa partie publique aux `authorized_keys` du serveur, ou ouvrir `8000/tcp` à l'IP de ce
> poste seul (`x.x.x.x/32`) dans la règle Hetzner. **Ne recopiez pas la clé privée d'une machine à
> l'autre** : une clé qui se déplace est une clé qui se perd, et on ne peut plus en révoquer une sans
> révoquer l'autre.
>
> Il s'applique **au réseau, en amont de la machine**. Il ignore donc complètement le problème
> DNAT/`DOCKER-USER` décrit plus haut, **ne peut pas être défait par une mise à jour de Coolify**, et
> ne peut pas casser le réseau Docker puisqu'il n'y touche pas.
>
> **Règle réellement en place — `axionia-web-entrant`, CINQ règles entrantes :**
>
> | Protocole | Port    | Pourquoi elle est là                                                                            |
> | --------- | ------- | ----------------------------------------------------------------------------------------------- |
> | TCP       | 22      | SSH — sans elle, plus d'accès du tout                                                           |
> | TCP       | 80      | ACME et redirection vers HTTPS                                                                  |
> | TCP       | 443     | le site                                                                                         |
> | **UDP**   | **443** | **HTTP/3.** `coolify-proxy` le publie ; l'omettre **dégraderait le site sans le casser**        |
> | **ICMP**  | —       | **PMTUD.** Voir l'encadré ci-dessous : l'omettre casse des connexions **sans laisser de trace** |
>
> Tout le reste est refusé : **8000, 6001, 6002 et 32769 tombent ensemble**.
>
> **Vérifié de l'extérieur APRÈS application** : 8000/6001/6002/32769 fermés · `axion-ia.com` **301**
> · `audit-staging` **200** · SSH OK · ICMP **3/3**. Et le mot de passe d'administration Coolify a été
> changé **après** la fermeture, pas avant — dans l'autre ordre, il aurait circulé en clair une
> dernière fois.
>
> > ### ⚠️ NE SUPPRIMEZ PAS LA RÈGLE ICMP — l'erreur a été commise et rattrapée le 2026-08-28
> >
> > Une consigne disant « exactement ces quatre règles » a fait **supprimer la règle ICMP** que Hetzner
> > proposait par défaut. Conséquence : **la découverte de MTU de chemin (PMTUD) casse** — et
> > **structurellement en IPv6**, où les routeurs ne fragmentent pas et signalent par « Packet Too
> > Big », un message ICMP. Une connexion se serait figée **à mi-chargement**, sans erreur, **sans
> > trace dans aucun journal**. Remise le soir même.
> >
> > **C'est le même motif que l'UDP 443, et c'est pour cela que les deux sont dans le même tableau :
> > une dégradation qui ne ressemble pas à une panne.** Personne n'ouvre un ticket pour « le site est
> > parfois lent chez certains » ; on l'attribue au réseau du visiteur, et on cherche des mois.
>
> Accès au tableau de bord ensuite par tunnel SSH sur 8000, 6001 et 6002 (les deux derniers portent
> le temps réel). Plausible reste joignable par son domaine, à travers le proxy.
>
> **Ce geste reste hors du périmètre du lot Audit** : il s'applique à la machine du voisin, et le §2
> réserve ces décisions à qui la connaît.
>
> **Bonne nouvelle du même relevé** : `axion-ia.com` répond bien en **HTTPS** (301 http → https), et
> **notre Caddy n'est pas exposé** — le `8080` public appartient à `coolify-proxy`, le nôtre n'a
> aucune liaison d'hôte. Les noms `coolify.axion-ia.com` et `admin.axion-ia.com` sont libres.
>
> Mesures relevées par la session `axion-audit-v2-12-complet-2a` ; **non revérifiées ici** — l'accès
> SSH et le terminal Coolify sont refusés à la session qui écrit ces lignes. À confirmer avant tout
> geste, par celui qui l'exécutera.

**Inverser 1 et 3 vous enferme dehors de votre propre tableau de bord.** C'est la seule manœuvre de
cette liste qui peut coûter l'accès au serveur.

**Ce que le retrait de l'IP de la documentation NE corrige PAS.** Le même jour, l'adresse a été
remplacée par `<IP_AXIONIA_WEB>` dans les fichiers versionnés (dépôt public). C'est de l'hygiène, pas
une mesure de sécurité : trois enregistrements DNS-only de la zone — `docuseal`, `plausible`,
`audit-staging` — pointent déjà cette IP en clair, et Cloudflare l'affiche lui-même en
recommandation (« _Votre adresse IP d'origine est partiellement exposée_ »). L'adresse est publique
avec ou sans le dépôt ; ce qui ne l'est pas, c'est le chiffrement de la session d'administration.

---

## 6. Ce que le staging ne recevra JAMAIS

**Aucune donnée réelle.** Le staging tourne sur les deux missions canoniques de test — FIL-TPE et
FIL-GC — qui sont des fixtures fictives. C'est ce qui rend cette cohabitation acceptable **sans
analyse d'impact RGPD** : il n'y a ni donnée personnelle, ni donnée client.

**La production, elle, est une autre décision**, à prendre à l'AIPD (06 §10.4) : données d'audit
réelles, personnes interrogées nommées, hébergement en Allemagne, et la question de savoir si elles
doivent partager une machine avec le site vitrine. Ce document ne la tranche pas et ne cherche pas à
la trancher.

---

## 7. Migrer plus tard, quand l'outil aura son propre serveur

Parce que les quatre conditions ci-dessus sont respectées dès le premier jour, la migration se réduit
à : sauvegarder (`backup-postgres.sh`, `backup-minio.sh`), restaurer sur le nouveau serveur, basculer
l'enregistrement DNS, retirer le bloc de proxy et l'arborescence `/opt/axion-audit`.

**Éprouvé, pas supposé** : la restauration a déjà été rejouée de bout en bout au lot L0 — PostgreSQL
restauré dans un conteneur jetable avec rejeu des WAL puis interrogé, et un objet témoin MinIO
restauré avec un SHA-256 identique. C'est la même procédure qui servira à la migration.
