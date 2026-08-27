# Faire cohabiter Axion Audit (staging) avec axion-ia.com sur le même serveur

> **Ce document répond à une question de Williams**, posée trois fois et légitime : peut-on héberger
> le staging d'Axion Audit sur `axionia-web` — le serveur du site essentiel — sans les mélanger, et
> en pouvant migrer plus tard sans douleur ?
>
> **Réponse : oui**, à quatre conditions écrites ci-dessous. Ce document existe pour qu'aucune ne
> soit oubliée le jour de l'installation.

---

## 1. Ce qui change sur axion-ia.com : presque rien, et c'est le point

| Élément                              | Effet                                             |
| ------------------------------------ | ------------------------------------------------- |
| Code d'axion-ia.com                  | **aucune modification**                           |
| Ses conteneurs, sa base, ses données | **aucune modification**                           |
| Ses volumes, ses réseaux Docker      | **aucune modification** — les nôtres sont séparés |
| Sa configuration de reverse proxy    | **un bloc AJOUTÉ** pour `audit.axion-ia.com`      |
| DNS                                  | **un enregistrement AJOUTÉ**                      |

Deux ajouts, zéro modification. C'est ce qui rend la migration ultérieure simple : retirer un bloc de
proxy et un enregistrement DNS, et le serveur retrouve exactement son état d'avant.

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

1. **Réseaux Docker séparés.** Nos services ne rejoignent aucun réseau existant. MinIO reste interne
   (11 §2 : jamais exposé publiquement) ; l'accès aux fichiers passe par l'API, en flux, avec RBAC.
2. **Ports non publiés.** Aucun `ports:` vers l'hôte sauf le port du Caddy d'audit, écouté sur
   `127.0.0.1` uniquement. Le proxy d'axion-ia.com est le seul point d'entrée public.
3. **Volumes préfixés et arborescence dédiée** (`/opt/axion-audit/staging`). Aucune donnée d'audit
   hors de cet arbre : c'est ce qui permet de tout déplacer plus tard en une commande.
4. **Plafonds mémoire et CPU sur TOUS nos conteneurs**, y compris ceux qu'on croit petits. Un worker
   qui ne fait rien 99 % du temps est précisément celui qui surprend.

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
