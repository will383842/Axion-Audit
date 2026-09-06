# PORTE P-DESCOPE — 15/09/2026 — DOSSIER PRÉPARÉ, **NON ARBITRÉ**

> **État de ce fichier : PRÉPARÉ le 2026-09-03, douze jours avant la porte. Aucun verdict n'y est
> posé et aucune option n'y est retenue.** Il existe pour une seule raison, écrite au 09 §5.4 : le
> burn-down « **rend la porte P-DESCOPE FACTUELLE au 15/09, pas une impression** ». Un dossier
> improvisé le jour même arbitre sur des souvenirs ; celui-ci fige les mesures pendant qu'elles sont
> vérifiables, et laisse la décision entière à son décideur.
>
> **Décideur : Williams, et lui seul.** `CLAUDE.md` §3 — un agent propose, il n'anticipe pas.
> Le 2026-09-15, ce fichier se **remesure** (les chiffres du §2 sont datés du 2026-09-03), puis se
> coche, puis se signe.

---

## 1. Le critère de la porte, copié mot pour mot

**`docs/09_PLAN_EXECUTION_AUTOPILOTE.md`, table des portes, ligne P-DESCOPE :**

> **P-DESCOPE** · **15/09 (jalon fixe)** · Revue de charge : tout lot différable non entamé glisse en
> Phase 2 ; toute feature noyau en retard est arbitrée (la collecte fiable prime) ; état du chantier
> CONTENU : **100 questions relues avec ancres et testées en cotation croisée, sinon réduction
> assumée de la profondeur des paquets** (fichier 07 §14)

**`docs/07_PLAN_TESTS_RISQUES.md` §14, les deux lignes de risque qui fondent cette porte :**

> Échéance 1 mois trop courte → Périmètre noyau verrouillé (26 j-h, rapport à la main assumé) ;
> **jalon de DESCOPE le 15/09** : revue de tous les lots — tout lot différable non entamé glisse en
> Phase 2, toute feature noyau en retard est arbitrée (la collecte fiable prime) ; tout ajout = Phase 2

> **Contenu de la banque (le vrai chemin critique)** → jalon 15/09 : 100 questions relues et testées
> en bac à sable (cotation croisée sur 2 cas fictifs) ; à défaut → **réduction assumée de la
> profondeur des paquets service, jamais du socle**

**Trois mots de ce critère commandent tout le reste, et il faut les lire avant les tableaux :**
« **non entamé** » (l'état, pas l'intention) · « **en retard** » (mesuré contre le budget du 07, pas
ressenti) · « **la collecte fiable prime** » (l'ordre de priorité est écrit d'avance, il ne se
redécouvre pas le 15).

---

## 2. L'état mesuré — au 2026-09-03, **à remesurer le 15/09**

Méthode : part du lot effectivement livrée, pondérée par son budget du fichier 07. Source : `git`,
les PR, les runs de CI, les dossiers de porte. Jamais `docs/ETAT.md` seul.

| Lot                   | Budget    | Écrit             | Reste                        | Entamé ?                                       | Sur `main`                                |
| --------------------- | --------- | ----------------- | ---------------------------- | ---------------------------------------------- | ----------------------------------------- |
| L0 infra              | 2 j       | ~1,90             | ~0,10                        | oui                                            | oui                                       |
| L1 schéma             | 2 j       | 2,00              | 0                            | oui                                            | oui                                       |
| L2 auth/RBAC          | 2 j       | ~1,85             | ~0,15                        | oui                                            | oui                                       |
| L3 missions           | 3 j       | ~2,90             | ~0,10                        | oui                                            | **non** — PR #26, porte signée le 03/09   |
| L4 import banque      | 0,5 j     | ~0,45             | ~0,05                        | oui                                            | oui                                       |
| **L5** PWA terrain    | 8 j       | ~4,60             | **~3,40** (L5c entier)       | oui (2 incréments sur 3)                       | design system seul                        |
| **L6** sync           | 4,5 j     | ~0,20             | **~4,30**                    | **NON** — note, contrat et tables seulement    | note seule                                |
| **L7-min** console    | 2 j       | ~0,70             | **~1,30** (L7b + L7c)        | oui (L7a)                                      | **non**                                   |
| Marge recette         | 2 j       | 0                 | 2,00                         | non                                            | —                                         |
| **Total**             | **26 j**  | **≈ 14,6 (56 %)** | **≈ 11,4**                   |                                                | **≈ 26 %**                                |

**Le lot différable, séparément** — il n'est pas dans les 26 j :

| Lot                    | Budget | Écrit | Entamé ? | Règle propre                                                                                       |
| ---------------------- | ------ | ----- | -------- | -------------------------------------------------------------------------------------------------- |
| **L8** scoring + radar | 2 j    | **0** | **NON**  | Différable, **mais** butoir dur §35.3 : en production **au plus tard le dernier jour de collecte** |

---

## 3. Ce que le critère tranche TOUT SEUL, sans arbitrage

Ces lignes ne sont pas des options : le pack les a déjà décidées. Elles sont ici pour qu'on ne les
rouvre pas le 15 en croyant délibérer.

| #   | Le critère dit                                          | Conséquence mécanique au 2026-09-03                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | « tout lot **différable non entamé** glisse en Phase 2 » | **L8 glisse.** Il est différable et il est à zéro.                                                                                                                                                                                                                                                               |
| 2   | mais §35.3 lui donne un **butoir dur**                  | Le glissement de L8 **ne le libère pas** : il reste dû en production le dernier jour de collecte. Le cas dégradé assumé est le calcul manuel sur l'export au tableur, selon les formules §32.1. **La seule chose que P-DESCOPE peut faire de L8, c'est le sortir de septembre — pas de la mission.** |
| 3   | « tout ajout = Phase 2 »                                | Les fiches `AMELIORATIONS.md` d'étage 2 ouvertes à date restent **proposées** ; aucune n'est absorbée par cette porte.                                                                                                                                                                                            |
| 4   | « la collecte fiable prime »                            | Tout ce qui touche l'**invariant 8** (aucune donnée sur un seul appareil > 24 h ouvrées, export de secours **testé**) et l'**invariant 1** (offline-first intégral) est **hors périmètre de descope**, quel que soit le retard.                                                                                    |
| 5   | §14, ligne contenu                                      | Si les 100 questions ne sont pas relues et cotées : réduction de la **profondeur des paquets service**, **jamais du socle**.                                                                                                                                                                                      |

---

## 4. Ce qui reste à arbitrer — options PROPOSÉES, aucune retenue

> Chaque option porte son coût, ce qu'elle sauve et ce qu'elle casse. Aucune n'est recommandée ici :
> le §3 ci-dessus a déjà retiré du champ tout ce qui se décidait sans Williams.

### D-1 — L6 n'a pas démarré au 15/09 : que fait-on des 4,3 j-h de sync ?

C'est **la** question de cette porte. L6 est le seul lot **noyau non entamé**, et le critère ne
prévoit pas son glissement : « tout lot **différable** non entamé glisse » — L6 n'est pas différable.

| Option                                        | Ce qu'elle coûte                                   | Ce qu'elle sauve                                       | Ce qu'elle casse                                                                                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **a. L6 intégral, P-D tenue**                 | 4,3 j-h, développés **seuls** (règle §5.3)         | la sync, les 8 scénarios §9.8, la charge               | rien — c'est le plan                                                                                                                                                                                                                    |
| **b. L6a + L6b, L6c reporté**                 | ~3,0 j-h                                           | push idempotent, pull delta, statuts, backoff          | **les pièces jointes chunkées** (§9.6) et **les 8 scénarios §9.8 scriptés** : P-D perd son critère d'acceptation. Sans les 8 scénarios, la porte D **ne peut pas se tenir** — elle se réduirait à une revue de spec                       |
| **c. L6a seul + export de secours en filet**  | ~1,5 j-h                                           | la remontée des données, à sens unique                 | le pull delta : un second appareil ne voit jamais le travail du premier. **Multi-consultants impossible** (E9)                                                                                                                          |

**Le fait à poser avant de choisir :** l'invariant 8 (« aucune donnée ne vit sur un seul appareil
> 24 h ouvrées ») **n'est tenu par aucune de ces options sans L6a**, et l'export de secours de L5c
> en est le **filet**, pas le substitut — il se déclenche à la main, quand l'invariant exige une
> sync ≥ 1×/jour.

### D-2 — L5c : 3,4 j-h, et tout n'y a pas le même poids

L5c est **entièrement à faire** et conditionne **P-C**. Ses dix livrables n'ont pas la même valeur
pour une collecte fiable. Proposition de partition, **à arbitrer** :

| Rang             | Livrable L5c                                                          | Pourquoi ce rang                                                                                                                    |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Intouchable**  | **export de secours `.axionbackup`** (11 §4)                          | invariant 8, et critère explicite de P-C : « créé puis restauré sur un 2ᵉ appareil »                                                 |
| **Intouchable**  | **terminer ≠ valider** (§19.1, guidé strict/expert, validation groupée) | c'est la machine à états de la session ; sans elle, rien ne distingue une saisie en cours d'une donnée validée                      |
| **Intouchable**  | fin de visite / fin de journée                                        | le geste qui déclenche la sauvegarde quotidienne (invariant 8)                                                                      |
| Fort             | cockpit « Aujourd'hui » (§34.2)                                       | critère de démo de L5 au fichier 07 ; c'est l'écran d'entrée de l'auditeur                                                          |
| Fort             | les 6 `kind` dont atelier                                             | sans eux, une seule forme de collecte sur les cinq du §27.1                                                                         |
| **Arbitrable**   | agenda (§25.2) + démarrage pré-rempli en un tap                       | confort de journée ; le démarrage manuel existe déjà en L5b                                                                         |
| **Arbitrable**   | proposition d'unité (§25.3)                                           | peut se noter en note volante et se saisir au siège                                                                                 |
| **Arbitrable**   | entretien complémentaire (§25.6)                                      | un second entretien ordinaire le remplace, au prix d'un lien perdu                                                                  |
| **Arbitrable**   | compression photos R2                                                 | dégrade la taille des pièces jointes, pas la donnée. **Lié à D-1b** : sans L6c, les pièces jointes ne montent pas de toute façon    |
| **Arbitrable**   | bandeau de mise à jour (§31-1)                                        | la mise à jour reste possible, elle cesse d'être annoncée                                                                           |

**Économie maximale de la colonne « arbitrable » : ~1,0 j-h.** C'est peu, et c'est le point à
retenir : **L5c ne se descope pas beaucoup** — l'essentiel de ses 3,4 j-h est intouchable ou fort.

### D-3 — L7-min : 1,3 j-h, et un critère qui ne se négocie pas

| Option                                | Coût      | Effet                                                                                                                                                                                                                                          |
| ------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **a. L7b + L7c**                      | 1,3 j-h   | le plan                                                                                                                                                                                                                                        |
| **b. L7c seul, couverture reportée**  | ~0,7 j-h  | l'export ZIP §36.3 **reste** — c'est le seul chemin vers le livrable, le rapport V1 étant rédigé à la main depuis le ZIP. La couverture par unité et par source (§27.1) tombe : le pilotage de la collecte se fait à l'œil                        |
| **c. L7b seul**                       | ~0,6 j-h  | **écartée sans être plaidée** : sans l'export, il n'y a pas de rapport. Le critère du lot dit « le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP, sans retourner dans l'outil »                                                          |

### D-4 — La marge de recette (2 j)

**Proposition : ne pas y toucher.** C'est l'audit à blanc de Williams et le GO/NO-GO de P-E. Un
descope qui finance du code en mangeant la recette livre du code que personne n'a essayé — et le
risque du 07 §14 que cette porte existe pour mitiger est précisément « livraison ratée ».

### D-5 — Le chantier contenu

| Situation au 15/09                                              | Ce que le critère impose                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 100 questions relues, ancrées, **cotation croisée humaine faite** | rien à arbitrer — jalon tenu                                                             |
| cotation humaine non tenue                                       | **réduction assumée de la profondeur des paquets service, jamais du socle** (07 §14)      |

**État au 2026-09-03** : 100 questions rédigées sur les 9 blocs, cotation croisée **à blanc** jouée
par deux coteurs isolés (22 écarts, 5 défauts de doctrine, 11 ancres réécrites), 5 doctrines
arbitrées, kit coteur prêt. **Reste la passe humaine du 15/09 — deux coteurs indépendants.** C'est
la seule pièce manquante, et elle est au calendrier de Williams, pas à celui de l'autopilote.

---

## 5. Les trois verrous qui ne dépendent d'aucun agent — état au 2026-09-03

Ils sont ici parce qu'aucun arbitrage de charge n'a de sens tant qu'ils tiennent : ils immobilisent
**≈ 30 points de pourcentage** entre le travail écrit (56 %) et ce qui est sur `main` (26 %).

| #   | Verrou                                                                                                                                                                                                                                                                          | État                              | Geste attendu                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | **staging rouge** — le serveur exécute les enveloppeurs de `e234756` (empreinte serveur `68fbc455…`, dépôt `74926ac…`) ; `infra/README.md` §6.3 avait prédit la panne et écrit « copier **PUIS** fusionner », #25 a été fusionnée dans l'ordre inverse de sa propre consigne     | ouvert depuis le 02/09 14h40 UTC  | **humain root** : `install -m 755` des deux enveloppeurs, procédure §6.3. SSH sortant refusé à l'agent |
| 2   | **merge PR #26 + tag `v0.l3`**                                                                                                                                                                                                                                                  | porte **signée** le 2026-09-03    | **Williams** (`CLAUDE.md` §7). Débloque `lot/l5a` → `lot/l5b` → rebase `lot/l7a`                   |
| 3   | **cette porte**                                                                                                                                                                                                                                                                 | dossier préparé                   | **Williams**, le 15/09                                                                            |

---

## 6. Verdict

| Étape                          | Signataire            | État                                                                                            |
| ------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| Remesure des chiffres du §2    | session de pilotage   | ⬜ **à faire le 2026-09-15** — les chiffres ci-dessus datent du 2026-09-03                       |
| Passage en porte               | **A01**               | ⬜                                                                                              |
| **LA PORTE**                   | **Williams**          | ⬜ **verdict et options retenues, à poser le 2026-09-15**                                        |

**Aucune option de ce dossier ne s'implémente avant cette signature** — `CLAUDE.md` §3-7 :
la proposer est un devoir, l'anticiper est une faute.
