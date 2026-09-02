# ORGANISATION DU TRAVAIL EN PARALLÈLE — plusieurs sessions, plusieurs agents

> **À lire avant d'ouvrir une seconde session sur ce dépôt.**
> Ce fichier ne contient aucune règle inventée : chaque interdit ci-dessous a été payé, et l'incident
> qui l'a produit est daté. Les dates renvoient à `docs/ETAT.md` et à `DECISIONS.md`.
> Précédence : ce fichier ne prime sur rien ; il **outille** `CLAUDE.md` §4 (« jamais deux lots en
> parallèle sur les mêmes fichiers ») et §7 (« une branche par lot »). En cas de divergence,
> `CLAUDE.md` gagne.

---

## 1. LA RÈGLE D'OR — un seul écrivain par dossier

**Le danger ne vient pas du nombre d'agents. Il vient du nombre d'écrivains dans un même dossier.**

Deux sessions dans le même répertoire partagent le même arbre de travail **et le même index git**.
Rien ne les isole : une commande de l'une s'applique au travail de l'autre.

| Organisation                             | Index partagé ? | Verdict                                          |
| ---------------------------------------- | --------------- | ------------------------------------------------ |
| Sous-agents d'une même session           | **oui**         | lecture en parallèle : sans risque. Écriture : collision |
| Plusieurs sessions, même dossier         | **oui**         | le pire cas — et sans chef pour arbitrer         |
| **Worktrees séparés**                    | **non**         | **la seule parallélisation sûre**                |

**L'unité d'isolation n'est pas la session. C'est le worktree.**

---

## 2. OUVRIR UN CHANTIER

Un dossier, une branche, un index par chantier :

```bash
git worktree add ../axion-l3  -b lot/l3  main
git worktree add ../axion-l5a -b lot/l5a main
```

Puis on ouvre une session **dans chaque dossier**. Elles ne peuvent alors plus s'écraser, même par
erreur. Pour fermer un chantier terminé : `git worktree remove ../axion-l3`.

**Découper par fichiers, pas par envie.** Deux chantiers ne se croisent que s'ils ne partagent aucun
fichier. `apps/api` (L3) et `apps/field` (L5a) sont disjoints : c'est un bon découpage.
`CLAUDE.md` §4 impose deux exceptions : **jamais deux lots sur les mêmes fichiers**, et
**L6 (sync) se développe SEUL**.

### TROIS CONTRAINTES, TROIS RÈGLES — et pourquoi les confondre a coûté une soirée

> **Amendement du 2026-08-31, arbitré par Williams.** Ce paragraphe disait « **deux chantiers actifs
> au maximum** », en un seul plafond. Le mot « chantier » y avait été écrit en pensant *lot sur
> fichiers disjoints*, alors que le motif invoqué était la **mémoire** — laquelle ne dépend pas du
> découpage. **Deux lectures défendables, parce que le texte ne tranchait pas.**
>
> Le défaut s'est manifesté le soir même : six worktrees ouverts, une session d'audit signalant une
> violation, et **aucun moyen de savoir laquelle des deux lectures faisait foi**. Ce n'était pas un
> défaut de pratique, c'était un défaut du document.

**1. COLLISION — jamais deux LOTS sur les mêmes fichiers.**
Objet : **les fichiers**. Ce n'est pas un plafond, c'est un **interdit** : il ne se compte pas et ne
se négocie pas. Il existe déjà en `CLAUDE.md` §4.

**2. MÉMOIRE — au plus DEUX EXÉCUTIONS LOURDES simultanées.**
Objet : **les processus qui tournent**, jamais les répertoires qui existent. Contrainte mesurée :
16 Go, et les tests d'intégration montent des conteneurs. Au-delà, la machine pagine.
**Corollaire assumé : le nombre de worktrees n'a PAS de plafond en soi.** Un worktree inerte coûte du
disque, pas de la mémoire — confondre les deux fait refuser un travail qui ne coûte rien.

**3. ATTENTION — au plus DEUX CHANTIERS SUIVIS à la fois, TROIS si chacun a un chef d'équipe.**
Objet : **ce qu'un pilote arrive à tenir en tête**. Cette règle ne dérive d'aucune des deux autres, et
c'est pourtant elle qui a mordu le 2026-08-31 : *« six répertoires signifiaient six chantiers que je
n'arrivais plus à suivre — et c'est une raison suffisante »*. Elle n'était écrite nulle part.
Une troisième session n'ajoute d'ailleurs pas de fiabilité (2026-08-30 : une troisième session a
produit un rapport de trois blocages dont **deux étaient faux**, faute de mesurer avant d'affirmer).

> **AMENDEMENT DU 2026-08-31 — Williams, confirmé directement après transmission par un pair.**
> **Le plafond passe à TROIS chantiers, à UNE condition qui est le cœur de l'amendement et non son
> ornement : chacun est tenu par un CHEF D'ÉQUIPE qui rend compte à A01.** Sans chef nommé, **le
> plafond reste à deux** — la borne est dans l'amendement lui-même.
>
> **Pourquoi ça tient, alors que le motif du plafond n'a pas changé.** Le plafond mesure ce qu'un
> pilote tient en tête, et jusqu'ici A01 pilotait les agents **directement** : trois chantiers, c'était
> vingt agents à suivre. Avec un chef par chantier, **A01 suit trois chefs, pas vingt agents** —
> c'est exactement la chaîne `agent → chef d'équipe → A01 → Williams` du 09 §1, qui existait et
> n'était pas utilisée. **Ce n'est pas le plafond qu'on relâche, c'est l'intermédiaire qu'on branche.**
>
> **Ce qui NE bouge PAS** : la règle 2 (mémoire) — **deux exécutions lourdes au maximum**, tous
> chantiers confondus. Et **pas de nouvelle session** : trois chantiers ≠ trois sessions. Le pilote
> reste unique ; un chantier = un worktree + un chef lancé depuis la session du pilote. Le partage se
> fait **en agents, pas en pilotes** — trois sessions ont produit deux rapports faux le 2026-08-30.

> **Ce que cet amendement enseigne au-delà de son objet** : un plafond dont le motif ne correspond pas
> à ce qu'il compte finit par être appliqué au jugé, puis contesté, puis ignoré. **Trois règles nettes
> valent mieux qu'un chiffre qui a l'air simple.**

**Le nombre d'AGENTS par chantier, lui, n'a pas ce plafond.** Élargir en amont, sérialiser à
l'exécution : dix agents peuvent écrire dix fichiers de tests en parallèle, ils ne peuvent pas les
*lancer* en parallèle. Lecture, rédaction, revue et traçabilité coûtent de l'API, presque pas de RAM ;
`vitest` + Testcontainers, `tsc`, Playwright et les builds Docker en coûtent beaucoup — **une seule
exécution lourde à la fois par chantier**.

> ⚠️ **Et ne sérialise pas sur la foi d'un chiffre de RAM sans vérifier la cause.** Le 2026-08-29,
> « manque de mémoire » a été diagnostiqué **trois fois** et huit conteneurs arrêtés **pour rien** :
> la vraie cause était un `.md` qui échouait à `prettier --check`, et `lint-staged` qui **tue les
> tâches concurrentes dès qu'une seule échoue**. Le `[SIGKILL]` était la conséquence, pas la cause —
> *le mot « tué » ne nomme pas son tueur.* Devant un `SIGKILL` sous `lint-staged` : lancer
> `npx prettier --check` sur les fichiers non-TypeScript **avant** de chercher ailleurs.

---

## 3. QUI ÉCRIT, QUI VÉRIFIE

**Une session construit. Une autre vérifie. Celle qui vérifie ne produit rien** — ni code, ni test,
ni correctif. C'est déjà `CLAUDE.md` §4 étape 4 et §5.6 ; ce fichier ne fait que dire comment
l'outiller.

Ça n'est pas une politesse : le 2026-08-29/30, la session qui relisait a trouvé, dans le travail de
celle qui produisait, des défauts invisibles depuis l'intérieur — un job de CI qui n'avait **jamais
mesuré** ce qu'il prétendait mesurer, un garde de restauration qui n'avait **jamais exécuté** une
ligne utile, une clé SSH « restreinte » qui ne l'aurait pas été.

**Le vérificateur mesure, il ne relit pas.** Un résumé n'est pas une preuve : on exécute la commande
et on lit sa sortie.

---

## 4. LES INTERDITS GIT

**a. `git commit` sans chemins emporte l'index ENTIER**, donc le travail qu'un voisin vient
d'indexer. *Arrivé quatre fois le 2026-08-29, dont une où 2 700 lignes du travail de trois agents
sont parties sous un message annonçant « docs ».*
`git commit -- <chemins>` **n'est pas la parade** : il fabrique un index temporaire qui rend les
fichiers d'autrui invisibles aux hooks.
**La seule discipline qui tienne :** lire `git diff --cached --name-only` **dans une commande
séparée**, en lire la sortie, **puis** commiter. Dans la même commande, la sortie n'existe pas encore.

**b. `git checkout` change la branche du RÉPERTOIRE, pas de la session.**
*2026-08-30 : une session a créé une branche dans le dossier partagé ; la session qui y travaillait
s'est retrouvée sur une autre branche en plein travail.* Rétabli sans perte, mais c'est exactement
l'accident que ce fichier existe pour empêcher. **Besoin d'écrire ailleurs → un worktree, jamais un
checkout.**

**c. Ne jamais supprimer un `.git/index.lock` qui bloque.** *Un verrou vérifié le 2026-08-29
paraissait périmé : il avait trois minutes et appartenait à un processus vivant. L'effacer aurait
corrompu l'écriture d'un voisin.* On attend, ou on demande.

**d. « Le commit contient-il ce que j'annonce ? » et « tient-il debout seul ? » sont DEUX questions.**
*2026-08-29 : un contrôle post-commit vérifiait la première et pas la seconde. Le commit emportait un
`import` vers un fichier que git ne suivait pas ; `origin` devenait incompilable, un clone frais
échouait, le staging n'était plus déployable.* Le hook de pré-commit ne pouvait pas le voir : son
`typecheck` examine l'**arbre de travail**, qui possède le fichier — **l'index, non**.
Le contrôle qui manque, et que le §4-a ne remplace pas : après avoir lu
`git diff --cached --name-only`, vérifier qu'aucun fichier indexé n'appelle un fichier **non suivi**.
*L'orphelin (personne ne l'importe) et le pendu (il importe ce qui n'existe pas dans git) sont le même
graphe lu dans les deux sens.*

**e. `git stash` A UNE PILE UNIQUE, PARTAGÉE PAR TOUS LES WORKTREES DU DÉPÔT.**
_2026-08-31 : un agent travaillant dans son worktree isolé a fait `git stash pop` et **a reçu le
travail en cours du chantier L3**, empilé depuis un autre worktree. Rien n'a été perdu — le chantier
L3 a conservé l'intégralité de son travail, vérifié fichier par fichier — mais l'isolation par
worktree, qui est TOUTE la protection de ce document, **ne protège pas du stash**._
C'est le piège le plus traître des cinq, parce qu'il **survit à la bonne pratique** : l'agent avait
fait exactement ce qu'on lui demandait — worktree dédié, aucun `checkout`, aucune écriture chez le
voisin — et il a quand même reçu le travail d'un autre. **Un mécanisme global dans un dispositif qui
se croit local est invisible jusqu'au jour où il mord.**
**La règle : ne pas utiliser `git stash` quand plusieurs worktrees sont actifs.** Pour mettre du
travail de côté : un commit `wip:` sur sa propre branche, qui est local, daté, nommé, et que le
squash effacera. `git stash pop` est un `git commit` sans chemins qui aurait la pile en plus.

**f. UN NOMBRE DANS UN TITRE DÉRIVE — celui-ci l'a fait.**
Cette section s'est appelée « LES TROIS INTERDITS GIT » **alors qu'elle en portait quatre**, entre le
2026-08-29 et le 2026-08-31. Le titre est désormais sans chiffre, pour la même raison que le renvoi
de `CLAUDE.md` §4 : _un plafond recopié à deux endroits dérive_, et un titre qui compte son propre
contenu est un compteur que personne ne remet à jour.

> ⚠️ **SUR L'INTERDIT (c), UNE PRÉCISION DUE PAR LE PILOTE, ET ELLE LE MET EN CAUSE.**
> Le 2026-08-31, A01 **a supprimé un `.git/index.lock`** — ce que (c) interdit sans réserve. Il avait
> mesuré avant : le verrou venait d'un `git commit` que le harnais avait tué, et `tasklist` ne
> montrait **aucun processus git vivant**. Le motif écrit de (c) — _« il appartenait à un processus
> vivant »_ — était donc vérifié comme absent.
> **Mais le texte de (c) est absolu et le geste ne l'était pas.** Deux lectures possibles : soit (c)
> devient _« ne jamais supprimer un `index.lock` SANS avoir mesuré qu'aucun processus git ne tourne,
> et l'écrire »_, soit il reste absolu et le geste du 31 était une faute. **Cette réécriture n'est
> pas celle du pilote** — c'est le même cas que la condition 4 de la borne nocturne, où un texte
> disait plus que son motif : constat écrit, arbitrage à Williams.

---

## 5. LA RÈGLE QUI A TOUT CHANGÉ — aucune affirmation sans mesure

Presque tous les défauts de ces deux jours ont la **même forme** : une observation **vraie**, qui
répond à **une autre question que celle posée**. C'est la faute la plus coûteuse du dépôt, et elle ne
ressemble pas à une erreur.

Cinq occurrences, toutes datées :

- une sonde `pg_isready` répondant « accepting connections » au-dessus d'un cluster qui bouclait ;
- un `[SIGKILL]` sur eslint diagnostiqué « manque de mémoire » alors que `lint-staged` **tue les
  tâches concurrentes dès qu'une échoue** — la vraie cause était un `.md` qui échouait à `prettier` ;
- un job « couverture ≥ 90 % » **rouge avant d'atteindre la couverture** : son code de sortie disait
  « seuil non tenu », il signifiait « les tests n'ont pas démarré » ;
- un déploiement en `running:healthy` — état d'**application**, pas de **déploiement** : l'application
  était saine **et servait du code vieux de 31 heures** ;
- une mesure « le staging ne répond pas » **juste**, mais prise sur une **adresse qui n'était plus
  servie**.

**Conséquences pratiques :**

1. **Ne jamais conclure depuis un seul maillon d'une chaîne.** Mesurer le maillon suivant.
2. **Un contrôle qui ne trouve rien ne doit jamais sortir vert** (`CLAUDE.md` §5.7). Un garde muet
   est pire qu'un garde absent : il rassure.
3. **Un vert d'emblée ne prouve rien.** On le prouve **par bascule** : on casse ce qu'il teste et on
   vérifie qu'il rougit. *Un test de redaction a ainsi été démontré par 11 rouges sur la version
   pré-correctif ; un autre, vert dans les deux mondes, a été rendu discriminant plutôt que supprimé.*
4. **Quand un agent dit « c'est fait », la réponse est « montre la commande et sa sortie ».**

---

## 6. L'ÉTAT PARTAGÉ

`docs/ETAT.md` est le seul point de reprise (`CLAUDE.md` §8). **Il a égaré son lecteur quatre fois en
deux jours** — c'est le défaut de coordination le plus fréquent du dépôt, devant les collisions git.

- On l'écrit **avant** de s'arrêter, jamais après avoir repris.
- Un bloc dit **l'état de `main`**, pas celui d'une branche : « CI verte » sur une branche et sur
  `main` ne sont pas la même affirmation.
- **Aucune trace git n'attribue un commit à un agent** : tous portent le même auteur (configuration
  git de la machine). La seule chaîne d'attribution qui tienne est `DECISIONS.md` et les fichiers de
  porte. **Ne jamais utiliser `git log --author` comme preuve.**

---

## 7. QUAND DEUX SESSIONS SE RENCONTRENT

Avant d'écrire quoi que ce soit dans un dépôt où une autre session travaille, on demande — et on
attend la réponse :

1. Sur quelle tâche es-tu ? 2. Quels fichiers ouverts en écriture ? 3. Quelle branche ?
4. Quelque chose de non commité ? 5. Es-tu l'auteur de tel commit ?

Le contrôle qui tranche, chez soi comme chez l'autre : `git status --porcelain` et
`git diff --cached --name-only`, **en commandes séparées**.

**Un seul pilote.** Deux sessions qui pilotent la même branche, c'est la situation qui a produit les
quatre balayages d'index. Les autres vérifient, mesurent, alertent — et n'écrivent pas.

**Une permission refusée à une session ne se demande pas à une autre.** C'est du contournement, et ça
annule la décision humaine qui l'a posée.

---

## 8. LA DURABILITÉ

`CLAUDE.md` §8 : commit + push toutes les ~2 h. **Un commit non poussé n'existe pas.**

L'invariant 8 interdit qu'une donnée vive sur un seul appareil plus de 24 h ouvrées. **Il vaut aussi
pour le code.** *2026-08-30 : sur une autre machine, 2 291 fichiers indexés et non commités,
sauvegardés nulle part — quatre tentatives de commit échouées sur `lint-staged`.* Avant toute
commande de réparation dans ce cas : **copier le dossier ailleurs d'abord**, puis diagnostiquer
(`npx prettier --check` sur les fichiers non-TypeScript en premier), et **jamais** `reset`,
`checkout` ni `stash`.

---

## 9. TROIS CHANTIERS NOMMÉS, ET CE QUI LES REND POSSIBLES (Williams, 2026-09-02)

Mesuré le 2026-09-02 : le chantier avance à 1 à 1,5 j-h de noyau par jour calendaire, soit un
développeur et demi. Le plafond de trois chantiers existe depuis le 2026-08-31 et n'était utilisé
qu'à moitié : L3 et L5 ont partagé un worktree pendant six heures. Williams tranche : **trois
chantiers vraiment disjoints, chacun dans son worktree, avec son chef, en parallèle.**

| Chantier | Chef | Worktree | Fichiers | Ne touche jamais |
| --- | --- | --- | --- | --- |
| **C1 — L3 backend** (fin de lot, porte) | A10 | `_axl3` · `lot/l3-suite` | `apps/api/**`, `packages/shared/src/{companies,missions,org-units,questionnaire,plan-entretiens}.ts` | `apps/field`, `apps/hq` |
| **C2 — L5 terrain** (L5a → L5c) | A20 | `_axl5a` · `lot/l5a` puis `lot/l5b`, `lot/l5c` | `apps/field/**`, `packages/shared/src/sync.ts` | `apps/api`, `apps/hq` |
| **C3 — L7-min console** | A30 | `_axl7` · `lot/l7a` | `apps/hq/**` | `apps/api`, `apps/field` |

**Ce qui est commun et qui se sérialise** : `packages/shared/src/index.ts`, `DECISIONS.md`,
`docs/ETAT.md`, `AMELIORATIONS.md`, le lockfile. Règle : **on y écrit en append, on fusionne `main`
avant de pousser, jamais deux PR ouvertes sur le même de ces fichiers sans rebase.**
`packages/ui` est **figé** pendant les trois chantiers ; un composant manquant = une fiche étage 1,
livrée par A21 dans une PR à part.

**Ce qui ne change pas** : L6 (sync) se développe **seul** quand C2 a livré L5a. Deux exécutions
lourdes au maximum sur la machine, une seule par chantier. La quatrième session est **interdite** :
les trois chantiers sont trois chefs lancés depuis la session pilote ; la session de vérification
mesure et ne produit rien.

**Le chef rend compte** : à chaque incrément commité, une ligne dans ETAT.md (≤ 25 lignes par bloc,
`check:prose`), et un message à A01 avec trois chiffres — tests écrits, tests verts, CI.

---

*Traçabilité : ce fichier outille `CLAUDE.md` §4, §5.6, §7 et §8. Il ne crée aucune convention
nouvelle et n'amende aucune spécification. Arbitrage : `DECISIONS.md`, 2026-08-30 ; §9 :
`DECISIONS.md`, 2026-09-02 (Williams).*
