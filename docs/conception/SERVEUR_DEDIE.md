# Note d'architecture — vers un serveur dédié

> **Auteur :** A72, mesuré sur `axionia-web` en lecture seule le 2026-08-28 entre 11h30 et 12h00 UTC.
> **Statut :** note d'aide à la décision. **Rien n'est implémenté** — 11 §8-7 : _proposer est un
> devoir, anticiper est une faute._ Six questions attendent Williams (§6).
>
> Production du tiers sondée avant et après : `axion-ia.com` **301 en 0,269 s** puis **301 en
> 0,134 s**. Aucune dégradation, aucune écriture, aucun identifiant manipulé.

---

## En une phrase

**Le chemin de migration des données est déjà éprouvé** — la restauration PostgreSQL et MinIO a été
jouée, empreinte métier identique — **et le certificat n'a même pas besoin de migrer**, le défi
Let's Encrypt étant en HTTP-01. Ce qui reste n'est pas de la technique : ce sont **quatre objets qui
ne sont dans aucune sauvegarde** (les secrets, la définition d'orchestration, Redis, le DNS), **une
décision non prise** (Coolify ou le chemin du pack), et **un piège de destruction de données** — le
miroir distant avec suppression, sur un préfixe partagé entre deux serveurs vivants — qui ne
pardonnera pas d'être découvert le jour J.

---

## 0. Le constat qui domine tous les autres : le pack a déjà tranché contre Coolify

> **02 §30.1 — « Docker Compose + GitHub Actions, PAS de Coolify en V1 »**, pour quatre raisons dont
> _« un composant de moins à sécuriser, mettre à jour et sauvegarder »_. _« Coolify reste une option
> de confort en V2. »_

Coolify sur `axionia-web` **n'a jamais été un choix d'architecture** : c'est l'orchestrateur
préexistant de la machine du voisin. **Migrer sur un serveur dédié, c'est donc par défaut revenir au
chemin du pack, pas prolonger l'existant.**

---

## 1. Migration = restauration ? Non, mais l'écart est petit et entièrement nommable

**Ce qui EST éprouvé** (2026-08-28) : restauration pgBackRest en **2,03 s**, démarrage + rejeu WAL +
promotion en **1,59 s** ; 44 tables, 12 migrations ; **empreinte métier
`65929446c5c682592befc43c033229b6` identique des deux côtés**, et les **sept empreintes par table
identiques une à une**. MinIO : **3/3 objets au même SHA-256**, buckets, politiques et **versioning
restitués**.

_C'est infiniment plus fort qu'un comptage de lignes : l'empreinte compare le contenu métier
canonisé._

**Les CINQ endroits où migration n'est PAS restauration :**

1. **Redis n'est dans aucune sauvegarde.** Il est classé « dégradant » — ce qui veut dire **perte
   acceptée**, pas **pas de perte**. Les travaux en file au moment de la bascule sont perdus. _À
   instruire au brief L6 : quelles files ne le tolèrent pas._
2. **Les secrets ne sont sauvegardés par rien de chez nous.** Les 89 variables vivent dans la base de
   l'orchestrateur et dans un fichier. Le voisin a une sauvegarde de secrets quotidienne ; **nous
   non.** **Une restauration sans les secrets ne redémarre aucun conteneur.**
3. **La définition de l'application n'est pas dans git** — domaine, port exposé, variables : tout vit
   dans la base de Coolify. C'est exactement le motif pour lequel ses tâches planifiées ont été
   écartées : _« invisible à une revue, absente d'une reconstruction »_. **La même critique
   s'applique à la définition de l'application elle-même.**
4. **Le magasin TLS** appartient au voisin (voir §3 — c'est une bonne nouvelle).
5. **La restauration éprouvée part du dépôt LOCAL, pas du stockage distant.** Les deux tests
   d'intégration **neutralisent le distant** (variables factices, faux binaire), avec l'avertissement
   en tête. Le seul aller-retour depuis le distant est **manuel, joué une fois**. **C'est l'écart qui
   compte, parce qu'il porte sur le scénario réel du jour J** : si l'ancien serveur est debout, on
   est dans le cas éprouvé ; sinon, la source est le distant, et ce chemin n'est couvert par aucun
   test.

---

## 2. Ce qui est adhérent à la COHABITATION, et ce qui ne l'est pas

**C** = contrainte de cohabitation · **BP** = bonne pratique qu'on garderait partout.

| Point                              | Verdict                                              | L'essentiel                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Notre frontal sur le réseau partagé | **adhérent à COOLIFY, pas à la cohabitation**        | L'étiquette qui dit au proxy par quel réseau joindre le backend est **posée par Coolify**. Retirer notre attachement sans qu'elle change **casserait le routage**. La phrase « la retirer ne casserait rien » **n'est pas établie.** |
| Plafonds mémoire                   | **C+BP**                                             | **361 Mio consommés pour 3 968 réservés — 9,1 %.** Le calibrage est adhérent ; le principe (swap neutralisé) reste bon partout.                                                                                                   |
| Aucun port publié                  | **à couper en deux**                                 | Le frontal sans port : **C** (sur un serveur dédié il DOIT publier 80/443). Base, Redis et MinIO sans port : **invariant** — lever cela serait une **régression franche**.                                                        |
| Plafond d'archives                 | **C+BP**                                             | Le chiffre est adhérent, le mécanisme (refus bruyant plutôt que disque plein silencieux) ne l'est pas. **Et le vrai problème ne migre pas** : 30 copies _complètes_ de MinIO restent 30 fois MinIO.                               |
| Élagage restreint à nos images     | **C**                                                | Le seul point qui se relâche franchement : **22,97 Go de cache de construction** sur la machine, inélaguables par nous faute de filtre de propriété.                                                                              |
| Chaîne TLS                         | **C**                                                | **Un seul magasin ACME, un seul compte, CINQ certificats** dont les quatre du voisin. Nos échecs consomment son quota.                                                                                                            |

**Fait qui n'apparaît nulle part dans le dépôt et qui retourne la lecture : le voisin ne se plafonne
pas.** Sur ses 15 conteneurs, **11 n'ont aucune limite** — dont sa base, son Redis et le proxy. **Nos
plafonds protègent le voisin ; la réciproque n'existe pas.** L'argument « le noyau choisit sa victime
par score mémoire » joue donc **contre nous** : nous sommes le seul candidat borné.

**Corollaire dur :** deux environnements aux plafonds actuels = **7 936 Mio de RAM engagée**. **Sur
une machine de 8 Go, il ne reste rien pour l'OS et Docker.** C'est le seul argument de dimensionnement
réellement mesuré de cette note.

---

## 3. Le certificat n'a pas à migrer — la meilleure nouvelle

Le résolveur est en **HTTP-01**, pas DNS-01. Le défi se valide **contre l'IP vers laquelle le DNS
pointe**. Dès que l'enregistrement A désigne la nouvelle machine et qu'elle sert le port 80, notre
frontal obtient **son propre** certificat, dans **son propre** magasin, en quelques secondes.
**Aucune clé privée ne traverse le réseau.**

Deux précautions : **la nouvelle machine doit servir le port 80 AVANT** que le DNS bascule (sinon
report exponentiel) ; et **les répétitions se font sur un nom jetable**, jamais sur le nom réel — le
quota de certificats dupliqués est partagé avec la production du voisin.

---

## 4. Les secrets : ce qui se recopie, ce qui se régénère

**Principe, qui découle du constat que l'orchestrateur injecte l'environnement entier dans les onze
conteneurs :** _tout secret qui a vécu là a été lisible par toute la pile. On ne recopie que ce qu'on
ne peut pas régénérer._

| Famille                                          | Verdict                                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL, Redis, MinIO                         | **RÉGÉNÉRER** — recopier, c'est importer sur la machine propre la surface d'exposition de l'ancienne                                                                                                  |
| Secrets de jetons d'accès et de rafraîchissement | **RÉGÉNÉRER, et c'est gratuit aujourd'hui** — le staging ne porte que des fixtures. **Le faire maintenant coûte zéro ; après les premières missions, cela coûte une reconnexion de tout le terrain.** |
| Clé de chiffrement applicative                   | ⚠️ **NE PAS RÉGÉNÉRER SANS ANALYSE** — si des données chiffrées applicativement existent, la restauration « réussirait » sur des données **inexploitables**. À instruire au brief L2.                 |
| Passphrases de sauvegarde                        | ⚠️ **RECOPIER pendant, régénérer APRÈS** — elles déchiffrent ce qu'on migre. Les régénérer avant, c'est perdre l'accès à ce qu'on restaure.                                                          |
| Jeton de stockage distant                        | **RÉGÉNÉRER, un jeton distinct par serveur** — pour révoquer l'ancien sans souci                                                                                                                      |
| Fournis par des tiers                            | **RECOPIER**                                                                                                                                                                                         |
| Les ~17 variables injectées par l'orchestrateur  | **NE PAS RECOPIER** — c'est du bruit qui ressemble à de la configuration                                                                                                                              |

---

## 5. LES DOUZE PIÈGES — chacun a été payé UNE fois aujourd'hui

1. **Un volume au mauvais nom RÉUSSIT.** Docker crée un volume **vide**, le monte, rend 0, le
   conteneur démarre sain. Démontré involontairement. **Transposé : une restauration qui « réussit »
   sur des données absentes, un jour de panne, sous pression.** → _Déduire tout nom de volume, jamais
   l'écrire ; vérifier une ligne de données avant de déclarer la restauration réussie._
2. **🔴 Le miroir distant est un MIROIR, pas une archive.** Le garde-fou protège un serveur
   **entièrement vide** ; il **ne protège pas** un serveur **partiellement restauré**. Et **deux
   serveurs qui écrivent le même préfixe se mirroitent l'un l'autre — l'option de suppression
   transforme la collision en PERTE.** Or une migration, c'est **par définition deux serveurs vivants
   en même temps.** → _Préfixe distinct AVANT tout, et désactiver l'expédition sur l'ancien serveur
   avant de l'activer sur le nouveau._ **C'est le piège de destruction de données de cette
   migration.**
3. **Une pile saine ne prouve rien sur ses garde-fous.** La stanza avait été créée à la main, aucun
   job n'avait jamais tourné, la sonde était encore la menteuse — **et tout affichait vert.** Les
   deux seules preuves : le job sorti en 0, et la sonde lue dans l'inspection du conteneur.
4. **Une image de base peut être incomplète, ou avoir disparu.** L'image PostgreSQL n'a **aucun
   magasin de certificats**. Et le journal du voisin porte déjà la suppression du tag de l'image de
   base dont notre frontal a besoin pour se reconstruire. → _Le jour d'une migration peut être le
   jour où le réseau sortant est justement le problème._
5. **La validation de configuration rend 0 dans les quatre conventions.** Elle valide la syntaxe,
   jamais l'existence des chemins. → _Une validation qui ne peut pas échouer n'est pas une
   validation._
6. **Un déploiement peut mourir en 14 s pendant que l'ancien répond 200.** → _Vérifier le commit
   déployé et l'horodatage du conteneur, jamais le code HTTP._
7. **Le proxy choisit mal quand le port cible manque.** Notre frontal écoute sur 8080, **figé à la
   construction**, donc invisible dans le fichier de composition.
8. **Le rôle PostgreSQL est `axion`, pas `postgres`.** Le runbook a porté la commande fausse pendant
   des semaines.
9. **La connexion SSH par adresse IP échoue** ; seul l'alias porte la clé. A01 a briefé un agent sur
   une voie fausse à cause de cela.
10. **`python` n'existe pas dans ce shell** — une commande qui le pipe rend une **sortie vide sans
    erreur**. Sur le serveur, `node` non plus.
11. **Personne ne sera prévenu.** → _Le jour J, personne ne regarde l'état des conteneurs de l'ancien
    serveur._
12. **Le nettoyage automatique du voisin tourne toutes les 6 h, et il n'est pas à nous.** Nos images
    ne portent pas le label qui les protège : elles ne survivent que parce qu'un conteneur les tient.
    _Ce qui tourne n'est alors plus ce qu'aucun tag ne désigne._

---

## 6. LES SIX QUESTIONS QUI APPARTIENNENT À WILLIAMS

**Q1 — Garde-t-on Coolify ?** _(la question mère : tout le reste en dépend)_ Sans lui, les sept
conventions disparaissent, le cloisonnement des secrets **redevient réel**, le retour arrière par
image redevient possible, et le test de restauration nocturne redevient jouable. Avec lui, on garde
le confort d'interface — et une base de plus à sauvegarder, qui porte la définition de l'application
**hors git**. _Le pack dit sans._

**Q2 — Un serveur ou deux ?** Le vrai argument n'est pas budgétaire (35 € contre 71 €) : le pack
impose déjà un **gel des déploiements de staging pendant les jours de collecte**. Un déploiement
construit ses images **sans plafond** ; sur 4 cœurs partagés avec la production, ce n'est plus un
inconfort, c'est un risque pour une collecte. → _Accepte-t-on de geler le staging chaque jour de
collecte pour 35 € de moins par mois ?_

**Q3 — Dimensionnement.** Trois sous-questions : recalibre-t-on les plafonds sur la mesure (facteur
11 de marge aujourd'hui) ? construit-on sur le serveur ou revient-on au registre d'images ? Et
surtout : **avant de commander, jouer une construction complète en mesurant sa pointe** — c'est dix
minutes, et c'est la seule inconnue de dimensionnement qui reste.

**Q4 — Préfixe de sauvegarde et troisième copie.** La troisième copie exigée par le pack n'existe
toujours pas. _La migration est-elle le moment de fermer cet écart, ou le confirme-t-on différé une
fois de plus ?_

**Q5 — Le calendrier, et c'est la question la plus contraignante.** Le staging ne porte **aucune
donnée réelle**, _« c'est ce qui rend cette cohabitation acceptable sans analyse d'impact RGPD »_.
**Migrer avec des fixtures est une répétition sans enjeu. Migrer avec des données de mission, c'est
une opération sous AIPD, avec un RTO qui engage et une clé de chiffrement qu'on ne peut plus
régénérer librement.** → _La migration doit-elle être faite AVANT la première mission réelle ?_

**Q6 — L'alerte sortante, indépendante de tout.** Deux variables vides. Ce n'est pas une adhérence à
la cohabitation, et elle bloque la lecture honnête de l'invariant 8 **aujourd'hui**.

---

## 7. Ce qui n'a PAS pu être mesuré

La **pointe mémoire et processeur d'une construction** (elle exigerait de déclencher un déploiement
sur une machine de production tierce) · le **contenu réel du stockage distant** (aucun identifiant
manipulé) · la **restauration depuis le distant comme source** · le **comportement réel du retrait de
l'attachement réseau** · les tarifs et la disponibilité du jour · la **visibilité actuelle des images
publiées** · **le script de provisionnement, qui n'a JAMAIS tourné nulle part** — comme tout le §7 du
runbook, PRA et RTO de 4 h compris · les **12 familles de secrets nominativement**, qui appartiennent
à Williams · le **TTL DNS**, la zone étant partagée avec la production.
