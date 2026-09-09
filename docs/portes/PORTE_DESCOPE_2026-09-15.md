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

### D-1 bis — AMENDEMENT DU 2026-09-09 (A01) : les 4,3 j-h de D-1 sont périmés, le reste réel est ≈ 5,5 j

> **Ce bloc ne remplace pas D-1, il le corrige sur les chiffres.** Le tableau ci-dessus reste lisible
> comme la photo du 2026-09-05 ; ses coûts, eux, ne le sont plus. **Aucune option n'est retenue ici :
> le descope appartient à Williams** (CLAUDE.md §3). A01 formule, chiffre et recommande — il ne tranche pas.

**Ce que j'ai vérifié moi-même sur `ac365f3` (= `origin/main`), le 2026-09-09 :**

| Fait | Preuve exécutée |
| --- | --- |
| **La remesure de L6 a désormais une source écrite au dépôt** — `SEANCE_MATERIELLE_P-C.md` la disait « sans source, à confirmer avant de s'en servir » | **PR #114**, branche `docs/decoupage-l6`, `docs/conception/LOT_L6.md` §D : **L6a 2,0 + L6b 1,2 + L6c 1,8 = 5,0 j-h**, les 0,2 j du commit `L6a-0` compris. PR **ouverte, non fusionnée** |
| **L5d (invariant 5) et L5e sont fusionnés dans `main`** — `SEANCE_MATERIELLE_P-C.md` les donne « en PR, non fusionnées » : périmé | `git merge-base --is-ancestor` sur `4f56e1f` (#108) et `59a3da2` (#109) → **les deux sont ancêtres de `ac365f3`** |
| **La chaîne photo — désormais `L5f` (voir `DECISIONS.md`, 2026-09-09) — n'est pas ouverte** | `compresserPhoto` (`apps/field/src/sauvegarde/photos.ts:141`) n'a **aucun appelant de production** : seuls des tests le citent. Quatrième passe consécutive à le déclarer orphelin |
| **L'outbox existe déjà en base locale v1** — L6a la draine, il ne la crée pas | `apps/field/src/local/base.ts:220` : la table `outbox` est une étape de `SCHEMA_LOCAL` |

**Le chiffre à porter à la porte : ≈ 5,0 j (L6) + ≈ 0,5 j (L5f) = ≈ 5,5 j à placer dans 4,3 j
annoncés — écart ≈ +1,2 j.** Le budget du fichier 07 pour L6 est de 4,5 j ; l'écart y est de +0,5 j.
_Le restant global « ≈ 7,4 j sur 26 » date du 2026-09-08 et couvre d'autres lignes que je n'ai pas
remesurées : il n'est pas cité ici comme une marge disponible._

**Les options réelles, avec ce que chacune coûte** (les deux premières se cumulent, la troisième non) :

| Option | Gain | Ce qu'elle casse |
| --- | --- | --- |
| **α. Absorber les ≈ 1,2 j** — P-D glisse d'environ une journée et demie | 0 j gagné | rien de fonctionnel ; la référence de 26 j-h est dépassée et cesse d'être la référence |
| **β. Retirer la campagne de charge k6 de L6c** (C4, p95 < 500 ms) | ≈ 0,3 à 0,5 j | un **budget de performance**, pas une garantie de non-perte ; se rejoue après P-D sans rien invalider. Le moins cher des trois crans |
| **γ. Reporter `L5f` (chaîne photo) en Phase 2** | ≈ 0,5 j | **descope de porte, pas aménagement** : les scénarios §9.8 **6 et 7** tombent, or **le 7 (reprise d'upload à 80 %) est un critère d'acceptation nommé du 07**. 03 §17.4 reste non tenu et §27.1 perd une source d'audit. Ne peut pas se décider par A01 |

**Ce qui ne peut pas tomber**, et que je refuse de porter comme option : les huit scénarios
`@critique` du §9.8, le contrat d'ops §9.3 complet, la propriété §9.9, `processed_ops`. Rogner l'un
d'eux, c'est rogner « zéro donnée perdue » — l'objet même du lot.

**Recommandation d'A01 : β puis α — retirer k6 de L6c, et absorber le reste (≈ 0,7 à 0,9 j).**
Motif : c'est le seul cran qui ne retire **aucune garantie de non-perte** et qui se rattrape après
P-D. γ est écartée de ma recommandation parce qu'elle fait tomber un critère d'acceptation nommé du
fichier 07 : si Williams la retient, elle se retient **en connaissance de ce coût-là**, et P-D se
tient alors sur un périmètre amendé, pas sur le périmètre du 07.

**Un point qui n'est PAS de Williams et que je ne tranche pas encore** — D10 de la note L6 : A20
demande de rouvrir la séquence du 2026-09-05 (`L5f` entre **L6b et L6c** au lieu d'avant L6a), ce qui
permettrait d'ouvrir L6a le jour même de P-C. **C'est un arbitrage technique, donc le mien.** Sa
prémisse est vérifiée — l'`outbox` est déjà en v1, L6a/L6b n'ont pas à toucher `SCHEMA_LOCAL`. Ce
que je n'ai **pas** vérifié, et qui décide : une migration de schéma **local** qui atterrit sur des
appareils portant déjà de la donnée réelle, **au milieu d'un moteur de sync à moitié construit**.
C'était le motif du refus de 2026-09-05, et l'`outbox` n'y répond pas. **Décision d'A01 à la fusion
de #114, avant l'ouverture de L6a — pas ici.** Elle ne change aucun des chiffres ci-dessus.

_Amendement établi le 2026-09-09 par **A01**, en lecture seule sur le code, chaque fait ci-dessus
exécuté et non repris d'un rapport. Il ne coche rien, ne signe rien et ne retient aucune option._

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

### D-6 — L8 : **ÉCRIT ET NON BRANCHÉ** (A30, 2026-09-09) — la ligne « écrit 0 » du §2 est périmée

> **Ce bloc n'efface rien.** Il ajoute un fait que le §2 ne pouvait pas connaître le 2026-09-03, et
> qui change la forme de l'arbitrage sans en changer le décideur. A30 mesure, il ne tranche pas.

**Le §2 range L8 en « écrit 0 · entamé NON ». C'est faux depuis PR 61, PR 65 et PR 66.** Et le §3
ligne 1 en tire « L8 glisse, il est à zéro » : la conclusion tient, la prémisse non.

**Mesuré sur `dc0fe3d` (= `origin/main`) le 2026-09-09, chaque ligne exécutée :**

| Fait | Preuve |
| --- | --- |
| **Le moteur est écrit** : 1 881 lignes (`bareme.ts`, `moteur.ts`, `agregation.ts`, `entree.ts`) + 3 194 de tests, 211 tests verts | `wc -l apps/api/src/scoring/*.ts` · `vitest run apps/api/src/scoring` |
| **Couverture 99,88 st · 96,95 br · 100 fn** — le chiffre est vrai | `--coverage.include='apps/api/src/scoring/**'`, remesuré ce jour |
| **Rien ne l'appelle.** Seul importateur de `src/scoring/entree.js` hors du dossier : `apps/api/tests/aide/scoring-jeux-de-reference.ts` — un **aide de test**. Aucun `domaines/scoring`, aucune route de scoring parmi les **onze** de `src/routes/` | `grep -rn "scoring/"` sur `apps`, `packages`, `e2e`, `scripts` |
| **La route existe en spec et pas en code** : `POST /v1/missions/:id/compute-scores` | `docs/05_API_ET_SYNC.md` §8.5 l. 47 · absente de `src/routes/` |
| **`block_scores` et `unit_scores` sont créées depuis L1 et écrites par personne** ; `scores.csv` absent du ZIP ; `score_unitaire` absent des en-têtes de `reponses.csv` | `drizzle/0005_inventaires_analyse.sql` l. 71-98 · `domaines/export/fichiers.ts` l. 319-320 |
| **Le radar SVG, nommé dans la même ligne du 07, n'est pas écrit non plus** | `apps/hq/src` (46 fichiers) : « radar » n'y apparaît qu'en en-tête de traçabilité |
| **Le code de production le dit déjà lui-même**, dans `mission.json` livré au client | `domaines/export/service.ts` l. 104 : « livré depuis le lot L8, mais il n'est encore relié à aucune route ni à aucun dépôt » |

**Ce que ce vert prouve, et ce qu'il ne prouve pas.** Il établit que les formules du §32.1 sont
cohérentes **entre elles** — le moteur est pur, déterministe, et sa structure anti-masquage tient.
Il n'établit pas qu'elles recevront un jour une ligne réelle : `entree.ts` est mesuré à **0 %** parce
qu'il ne contient que des interfaces, et c'est exactement la frontière que rien ne traverse.

**Une lecture du §32.6-4 est aujourd'hui inatteignable faute de colonne** — et ce n'est pas un test
qui mentirait sur une forme impossible. `groupeInterlocuteur` est déclaré **facultatif**
(`scoring/entree.ts` l. 82-84) : sans lui la divergence numérique (écart-type et contradiction
oui/non) se calcule quand même, seule la lecture direction/terrain manque. C'est une **dégradation
documentée**. L'amendement du 04 approuvé par Williams le 2026-09-09
(`interviews.interlocutor_profile_id`) **est** ce chemin de données manquant : il ne branche pas un
confort, il rend vivante une lecture aujourd'hui structurellement morte.

**Le chiffrage du branchement — 1,0 j (A30), et ce qu'il couvre.**

| Dans les 1,0 j | Hors des 1,0 j |
| --- | --- |
| dépôt de lecture du snapshot §32.1 · service · route `compute-scores` (**déjà spécifiée** au 05 §8.5 — aucune route à inventer, donc aucune escalade 11 §8-6) · **RBAC par rôle testé** · persistance `block_scores`/`unit_scores` · `scores.csv` + bascule du champ `scores` de `mission.json` · colonne `score_unitaire` · rejeu des jeux de référence figés **sur la vraie base** | le **radar SVG** (~0,3 à 0,5 j : axes, tokens invariant 4, 4 états, axe-core) et l'écran console qui affiche les scores |

Les quatre frottements « où un moteur pur rencontre la vraie base » sont **dedans** : RBAC,
`NUMERIC` en chaîne de bout en bout, `headcount` NULL réel, unités hors périmètre. Aucun n'a jamais
été exécuté, et le plus exposé est le **sens écriture** du `NUMERIC` : le moteur rend un `number`
JavaScript, `block_scores.score` est un `NUMERIC`. **Reste réel sur L8 : ≈ 1,3 à 1,5 j.**

**Budget séparé, calendrier partagé — les deux phrases vont ensemble.** L8 est **hors** de la
référence de 26 j-h : le 07 pose « Total noyau strict : 26 j-h » à la l. 29, **avant** que L8
n'apparaisse, puis ouvre l. 31 une table distincte « Lot différable » dont L8 est l'unique ligne
(l. 33). **Le branchement ne s'ajoute donc pas au dépassement du noyau, qui reste ≈ 5,5 face à 4,3,
soit +1,2 j (D-1 bis).** Mais la même l. 33 pose le **butoir dur** — « en production le dernier jour
de collecte (§35.3) » : les ≈ 1,3 à 1,5 j tirent sur le **même calendrier** que les +1,2 j.
Les additionner serait faux ; les présenter sans dire qu'ils partagent le calendrier le serait aussi.

**Ce que ça change le 15** : l'arbitrage n'est plus « faire les 2 j de L8 ou les reporter ». C'est
« brancher ≈ 1,0 j de plomberie sur un moteur déjà payé, ou laisser 5 075 lignes vertes que rien
n'appelle jusqu'à la fin de la collecte ». Aujourd'hui, « L8 dans `main` » se lit comme du livré.

_Établi le 2026-09-09 par **A30**, en lecture seule sur le code. Aucune option retenue, aucun
chiffre du §2 réécrit : le §2 se remesure le 15/09, comme son propre en-tête l'exige._

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
