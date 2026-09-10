# REPRISE DE L'AUTOPILOTE — protocole autoportant

> **À qui ce fichier s'adresse.** À une session qui démarre **sans aucun contexte** : reprise après
> coupure, routine planifiée, session neuve. Il ne remplace pas `CLAUDE.md` — il dit dans quel ordre
> lire, ce qui est mesuré à ce jour, et ce qui reste. **`CLAUDE.md` prime sur ce fichier, et la
> mesure prime sur les deux.**
>
> Écrit le 2026-09-05 par la session pilote, à la demande de Williams, pour qu'une reprise à heure
> fixe ne coûte pas une heure de reconstitution.

---

## 1. L'ORDRE DE LECTURE, ET IL N'EST PAS NÉGOCIABLE

1. **`CLAUDE.md` EN ENTIER.** C'est le contrat du dépôt : huit invariants, interdictions explicites,
   pipeline en 7 étapes, chaîne de signature. Il prime sur toute habitude que tu croirais avoir.
2. **Le DERNIER bloc de `docs/ETAT.md`** — **le dernier bloc fait foi**, c'est la règle du fichier —
   puis les trois précédents pour le contexte.
3. `git log --oneline -15` et `git status`.
4. Les **15 dernières entrées de `DECISIONS.md`**, puis `AMELIORATIONS.md`, puis
   `docs/journal/2026-09-03.md` — sa section **« CARTE DES ARTEFACTS »** dit où lire ce qui n'est pas
   sur `main`, branche par branche.
5. **REJOUE LA SUITE COMPLÈTE** : `pnpm install && pnpm build && pnpm verify:rapide`.
   **La vérité terrain, ce sont les tests — jamais un souvenir, ni même ce fichier.**
6. Divergence entre ce qui est écrit et ce qui est mesuré ⇒ **entrée `DECISIONS.md`**, et **c'est la
   mesure qui gagne**.

---

## 2. LES PIÈGES DE CETTE MACHINE — chacun a déjà coûté du temps

- **`pnpm build` AVANT toute mesure.** `packages/shared` s'exporte par `./dist` : sans build
  préalable, tu verras des dizaines d'échecs « X is not a function » qui **ne sont pas** des
  régressions. Cette erreur a été commise et refaite.
- **Un worktree neuf n'a pas de `.env`** : les tests d'intégration réclament
  `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Exporte des **secrets factices dans le shell du run**,
  jamais dans un fichier versionné.
- **Node local hors contrat.** La machine de développement tourne sur Node 24 ; le contrat épingle
  `>=22.11.0 <23`. **Un vert local n'est pas une preuve — la CI l'est**, elle mesure sur le Node du
  contrat. Vitest y lève parfois un `Timeout calling "onTaskUpdate"` **avec tous les tests verts** :
  c'est un artefact de son rapporteur, pas une régression.
- **`.git/config` du répertoire principal porte `core.bare = true`, et c'est une RÈGLE, pas une
  panne** (`docs/ORGANISATION_AGENTS.md`, PR #74) : la racine est le **hub à worktrees**, on n'y
  travaille pas, on y ouvre des chantiers. **Ne la « répare » pas.**
  Ce qu'il faut en savoir, dans l'ordre où ça mord :
  1. `git status` et `git log` y échouent. Lecture sans rien modifier :
     `git --work-tree=. -c core.bare=false <commande>`.
  2. **Aucun commit n'y est possible**, même avec ce contournement : le hook `pre-commit` appelle
     `lint-staged`, qui sort en `✖ Current directory is not a git directory!` — **après** avoir
     passé `check:pack`, `check:jonction`, `check:test-projects` et `check:decisions`. L'échec
     arrive donc tard, tous les gardes métier déjà verts, et **il ne nomme pas sa cause**.
     Mesuré le 2026-09-08 en voulant commiter sept entrées `DECISIONS.md`.
  3. **La parade est de ne pas commiter là** : `git worktree add -b <branche> ../_ax<nom> origin/main`,
     puis travailler dedans. Si le travail est déjà dans la copie de la racine :
     `git --work-tree=. -c core.bare=false diff --cached > <patch>` puis **`git apply --3way <patch>`**
     dans le worktree neuf. **`--3way`, jamais un `apply` simple** : la racine peut être en retard de
     plusieurs commits sur `main`, et l'`apply` simple échoue alors par `patch does not apply`, ce qui
     ressemble à un conflit de contenu sans en être un.
  4. Puis remets la racine propre (`checkout -- <fichiers>`, `checkout main`, supprime la branche
     créée) : une copie de travail modifiée sur un hub qu'aucun garde ne surveille est un piège pour
     la session suivante.
- **Le dépôt fusionne en SQUASH.** Quand une branche entre dans `main`, son historique disparaît :
  une branche sœur partie d'elle **avant** le squash n'a plus de base commune, et git présente tout
  en `add/add`. Choisir un côté **perd un incrément entier**. La parade est écrite dans
  `docs/ORGANISATION_AGENTS.md` §4 : fusion à trois branches **par fichier**, en nommant la branche
  d'origine comme base.

---

## 3. APRÈS CHAQUE FUSION : TROIS GARDES, ET AUCUN NE REMPLACE LES AUTRES

`DECISIONS.md` et `AMELIORATIONS.md` fusionnent par `merge=union` (`.gitattributes`).
**`docs/ETAT.md` en est exclu délibérément** : « le dernier bloc fait foi » ne se délègue pas à un
automatisme qui décide seul de l'ordre.

Avant **chaque** commit de fusion :

```bash
node scripts/check-decisions.mjs   # format des entrées
node scripts/check-prose.mjs       # ETAT ≤ 25 l., décision ≤ 40 l.
npx prettier --check DECISIONS.md docs/ETAT.md AMELIORATIONS.md
```

**Pourquoi les trois.** `union` ne reconnaît pas plus une entrée qu'un humain pressé : quand un
conflit tombe **au milieu** d'une entrée, il produit une entrée chimérique — deux entrées ont ainsi
perdu leurs champs `Décideur` et `Impact spec`, **et le comptage de lignes répondait « zéro perdue »
dans les deux sens**. Seul `check:decisions` l'a vu. Et `union` recolle deux entrées **sans la ligne
vide qui les sépare** : les deux premiers gardes étaient verts, **seul Prettier l'a vu**.

**Et vérifie les BORDS de chaque zone de conflit** : une coupure qui ne tombe pas entre deux entrées
demande une résolution manuelle. Un déplacement de blocs se lit comme une extension — un côté a
paru apporter 291 lignes dont **zéro n'était absente** de l'autre.

---

## 4. ÉTAT MESURÉ AU 2026-09-07 04h05 UTC — À VÉRIFIER, PAS À CROIRE

**`main` porte huit lots sur neuf** : L0, L1, L2, L3, L4, L5 (a+b+c), L7-min (a+b+c) et L8.
**21,5 jours-homme livrés sur les 26 du plan** (table du fichier 07). **Ce chiffre compte L5 et
L7-min à leur BUDGET PLEIN** : il mesure l'ÉCRITURE, pas l'ACCEPTATION, et il **ne s'additionne pas**
avec les restants du §7.2. Le journal du 2026-09-07 l'écrit lui-même (l. 52). Voir l'encadré du §7.2.
**`main` est VERT, `8 · deploy-staging` inclus** — c'est neuf, voir le §5.

> **CE PARAGRAPHE EST CLOS — ne le rejoue pas (mesuré le 2026-09-07 à 16h20).** Il ordonnait de
> refaire deux travaux laissés en plan à la clôture : la **revue croisée de #86** (rétention des
> sauvegardes, A17) et la page **`/design`** (§33.5, A21). **Les deux sont dans `main`** — #88 et
> #89, fusionnés APRÈS la rédaction de ce fichier : `docs/portes/REVUE_A17_L0_RETENTION_2026-09-07.md`
> et `apps/hq/src/ecrans/design/EcranDesign.tsx`. Aucune branche `design`/`revue` ne subsiste, et
> **c'est normal** : le dépôt fusionne en squash, donc l'absence de branche ne prouvait RIEN dans un
> sens ni dans l'autre. Le test qu'il fallait faire était de chercher le TRAVAIL, pas la branche —
> `git log --oneline -15` l'a dit en une commande.

**Le neuvième — L6, la synchronisation — n'a AUCUNE ligne de moteur, et c'est délibéré** :
`CLAUDE.md` §4 impose qu'il se développe seul, après la porte P-C. Sa note de conception est validée,
son contrat d'opérations et la propriété serveur sont tranchés et tracés.

> **Ne recopie pas ces chiffres dans un rapport sans les remesurer** — ils datent de la ligne
> ci-dessus. `git log --oneline -1 origin/main`, `gh pr list` et la suite de tests disent la vérité ;
> ce fichier dit seulement où regarder.

| Ce qui reste | Où | État |
| --- | --- | --- |
| **Porte P-C** | `docs/portes/` | **Refusée deux fois**, se rejoue EN ENTIER (09 §4bis). **Seul goulot du chantier — c'est par là qu'on reprend** |
| **17 vérifications matérielles** | fiche dédiée | 10 exigent un appareil physique, dues à Williams. **Les 7 « serveur » ne sont PAS jouables pour autant** — voir la rectification du 2026-09-07 sous ce tableau |
| **L5d — chaîne photo** | non ouvert | Après P-C, avant L6c. `compresserPhoto` est du code sans appelant, assumé et tracé |
| **L6a/b/c — sync** | non ouvert | 4,5 j, SEUL, après P-C. Dernier gros morceau |

### RECTIFICATION DU 2026-09-07 — « les 7 serveur sont jouables » était FAUX, et le vérifier a pris dix minutes

La ligne d'origine disait : « Les 7 “serveur” sont désormais JOUABLES (staging réparé) ». Staging
**est** réparé, et c'est vrai ; la conclusion qu'on en tirait ne l'est pas. Mesuré point par point :

- **Points 1 à 5** (embarquement FIL-TPE/FIL-GC, cockpit sur vraies données, entretien complet,
  6 `kind` de session, 5 formes de saisie) exigent tous **une identité d'auditeur sur staging**.
  Or **aucun compte de test n'existe** : inventaire des `secrets.*` de `.github/workflows/*.yml`
  → `DEPLOY_*`, `COOLIFY_*`, `TELEGRAM_*`, `RESTORE_SSH_KEY`, `AXION_CLIENTS_SURVEILLES`, plus
  `GITHUB_TOKEN` que GitHub fournit lui-même. **Rien d'applicatif.** Sans compte, pas d'appareil rattaché, donc pas de mission embarquée, donc aucun
  des cinq. **Dus à Williams** — c'est lui qui crée le compte et pose le secret.
- **Point 6** (migrations up/down sur staging) : le dépôt le dit déjà lui-même, et l'a écrit avant
  moi. `.github/workflows/ci.yml` : « Ce job prouve up ET down sur le Postgres JETABLE de la CI ; il
  ne prouve rien sur staging. L'exécution sur staging reste un geste **HUMAIN**, à tracer par
  Williams dans le fichier de porte (A02, 2026-09-02). » **Dû à Williams.**
- **Point 7** (ZAP sur `/hq` et `/api`) : **la seule moitié jouable en dépôt**, et elle n'est qu'une
  moitié — l'arbitrage A01 du 2026-09-05 dit « authentification comprise », ce qui bute sur le même
  compte manquant que les points 1 à 5. La couverture non authentifiée est en cours ; la bascule
  `ZAP_BLOQUANT='true'` vient **après**, au dossier de porte, jamais avant.

**Donc : P-C est bloquée sur Williams dans sa quasi-totalité, pas seulement sur ses 10 points
matériels.** Le dire tôt vaut mieux que le découvrir à la porte. Et la leçon est celle du §5 : une
affirmation vraie (« staging est réparé ») en a fait passer une fausse (« donc les 7 sont jouables »)
parce que personne n'a vérifié le pas entre les deux.

**Ce qui a été fermé le 2026-09-06**, et qui vaut d'être su parce que la même famille reviendra :
`pnpm test:interface` n'était lancé par **aucun job de CI** (61 fichiers ne tournaient qu'en effet de
bord de la couverture) · deux corps littéraux d'E2E ne suivaient plus le contrat partagé, et la CI
accusait **l'accessibilité** à vingt minutes de la cause · trois `.catch` manquants sur
`storage.persist()`, dont celui de l'écran dont l'unique raison d'être est de réparer le stockage ·
un badge sous AA cru latent parce qu'un `grep` ne le trouvait pas — il est peint sur le statut le
plus fréquent du portefeuille, et c'est le **compilateur** qui l'a dit.

**Un comptage dit qu'un symbole est absent ; il ne dit pas qu'un comportement l'est.**

**Deux tests DATÉS trouvés en douze heures**, et c'est un motif, pas une coïncidence : l'un échouait
tous les soirs passé 20 h (créneau `maintenant() + 4 h` franchissant minuit), l'autre certains jours
seulement (semaine ISO du dernier jour du mois). **Éprouve tout test sensible au temps sur les 24
heures et les 7 jours, jamais sur l'instant où tu le lances.**

**Séquence imposée ensuite** : `L5c → porte P-C → L5d (chaîne photo) → L6a → L6b → L6c → porte P-D`.
L5d passe **avant** L6 : il touche le schéma local, et deux chantiers dessus en même temps sont la
collision que `CLAUDE.md` §4 interdit.

---

## 5. CE QUI EST DÉCLARÉ NON TENU, ET QUI DOIT ALLER AU DOSSIER DE PORTE

- **03 §17.4 — aucune photo n'entre dans l'application.** Mesuré par deux agents indépendamment :
  zéro `type="file"`, zéro `capture=`, zéro `kind:'photo'`. `compresserPhoto` est **du code sans
  appelant**. Lot **L5d** créé pour la chaîne complète. **À déclarer au contrôle A02 de P-C**, pas à
  découvrir à P-E.
- **F-24 — AES-GCM sans AAD** : ré-arbitrage à **P-C**, sur une prémisse corrigée (celle du
  2026-09-02 supposait un attaquant ayant franchi le verrou ; écrire dans IndexedDB n'exige ni l'un
  ni l'autre). Argument le plus fort trouvé depuis : **une enveloppe de DEK corrompue rend
  « mot de passe invalide »**, donc l'auditeur ne voit jamais l'avertissement sur une corruption réelle.
- **ZAP** : bascule bloquante à **P-C**, et **le scan doit d'abord couvrir `/hq` et `/api`** — il ne
  voit aujourd'hui que six URL de coquille statique.
- **`staging` A ÉTÉ RÉPARÉ le 2026-09-07 à 04h00 — n'ouvre pas ce chantier.** Le serveur annonce
  `EMPREINTE_SCRIPT=74926ac9…` et `8 · deploy-staging` rend `success`. La réserve n° 1 du dossier
  P-DESCOPE, ouverte depuis le 02/09, est close **de bout en bout**.

  **Ce qui bloquait, et pourquoi cinq jours** : le clone `/opt/axion-audit/repo` était figé sur
  `e234756`. Les deux `install` de la procédure §6.3 copiaient donc **l'ancien fichier sur
  lui-même** — ils réussissaient sans rien changer, et personne ne pouvait le voir. Il fallait
  `git fetch origin main && git checkout --detach <sha>` **avant**. La procédure le dit ; elle ne le
  rend pas évident. Si le cas revient, c'est la première chose à vérifier.

  **DEUX LEÇONS DE MÉTHODE, ET LA SECONDE EST LA PLUS UTILE DU FICHIER.**

  Ce point affirmait « aucun chemin API n'existe » **et** « clé de déploiement restreinte au script
  périmé lui-même ». La session pilote a cru la première moitié fausse, l'a déclarée telle **et l'a
  écrit ici**, puis a construit `.github/workflows/ops-poser-enveloppeurs.yml` pour le prouver.
  **Le workflow a prouvé le contraire** : `command=` d'`authorized_keys` n'autorise que
  l'enveloppeur — « ni shell, ni lecture de fichier, ni redirection de port », comme l'en-tête de
  `infra/scripts/deploy-staging.sh` le disait déjà. **La seconde moitié était vraie.**

  Donc : *une affirmation jamais remesurée gouverne les décisions qui la citent — **mais une
  réfutation trop rapide en gouverne d'autres.*** La bonne question n'était pas « depuis quand
  personne n'a essayé », c'était « que peut faire cette clé, exactement ». **Mesure avant
  d'affirmer, y compris quand tu affirmes que quelqu'un d'autre s'est trompé.**

  **Le workflow reste, et il sert** : il est le harnais qui vérifie l'empreinte du serveur en une
  minute, sans rien déployer. Relance-le au moindre doute sur l'état des enveloppeurs.

---

## 6. COMMENT TRAVAILLER — ce qui est délégué, et ce qui ne l'est pas

**Délégué à la session pilote** (`DECISIONS.md`, 2026-09-04) : l'exécution complète, les merges
d'incréments, **et les portes P-C / P-D / P-E**, sous quatre bornes qui portent sur *qui signe* et
jamais sur *ce qui est dû* — dossier de porte intégral avec preuve par critère, DoD non amendée, une
porte échouée reste échouée, tout est re-signable.

**Jamais délégué** : **le geste root sur staging**, et **l'amendement du fichier 04**, réservé à la
revue de spec de **P-D** (09 §5.9).

> *Le 2026-09-07, la session pilote a cru pouvoir retirer le geste root de cette liste, au motif que
> le secret `DEPLOY_SSH_KEY` donnait déjà l'accès. Elle a construit le workflow qui devait le
> prouver — et **il a prouvé le contraire** : la clé est verrouillée par `command=` et n'exécute que
> l'enveloppeur. La ligne est donc rétablie, non plus par principe mais **par mesure**. Voir le
> point « staging » du §5 : c'est le seul endroit du fichier où une affirmation a été réfutée, puis
> la réfutation elle-même réfutée, et les deux erreurs y sont écrites.*

**Le pipeline en 7 étapes n'a pas de raccourci.** En particulier : le code de test n'est jamais écrit
par l'agent qui a écrit le code testé, et **un réviseur ne commite jamais** — il dépose son verdict,
le pilote le commite. Les deux règles ont été payées par des incidents datés.

**Trois leçons de méthode, chacune payée** :

1. **Un correctif juste peut n'être exécuté par aucun test.** Trouvé par le `lcov` de la CI, pas par
   relecture : on pouvait supprimer le correctif sans un seul rouge.
2. **Une garde d'anti-vacuité ne doit jamais s'appuyer sur l'état du code de production.** Un test
   exigeait « au moins une violation » avant sa bascule : il est devenu impossible à satisfaire le
   jour où le défaut a été corrigé. **Une bascule fabrique sa propre condition.**
3. **L'échappement Unicode d'un octet nul, écrit par les outils d'édition, devient un octet réel
   à l'écriture.** C'est ainsi que trois octets
   nuls ont rendu un fichier invisible à `ripgrep`. La parade est un appel de fonction —
   `String.fromCharCode(0)` dans une constante nommée — **jamais l'échappement**.
   **Cette ligne en est la preuve** : sa première rédaction citait la séquence en clair pour
   l'expliquer, et a produit un octet nul réel **dans ce fichier même**. Le garde
   `check:octets-controle` l'a attrapé au premier passage. **Ne cite jamais cette séquence
   littéralement, pas même pour en parler.**

---

## 7. ÉTAT MESURÉ AU 2026-09-09 — LA JOURNÉE DE FERMETURE DE P-C

> Le §4 ci-dessus date du 2026-09-07 et **reste vrai sur ce qu'il décrit** ; cette section ne le
> remplace pas, elle le prolonge. **La mesure prime sur les deux.**

### 7.1 La référence de charge, telle que le pack la pose

`00_INDEX`, « référence de charge unique » — **c'est elle qui fait foi**, tout autre chiffre du pack
ou du CDC est historique :

| | |
| --- | --- |
| **Noyau strict** | **26 j-h** — L0 à L7-min + marge de recette |
| **Différable 2-4 semaines** | **~11 j-h** — L8 scoring/radar, heatmap, centre d'alertes, avance/retard, espaces console 3-7, simulateur |
| **Phase 1 complète** | **~37 j-h** |

**L8 est HORS des 26**, et c'est la structure du 07 qui le dit : l. 27 la ligne Marge, l. 29
« Total noyau strict : 26 j-h » **seul sur sa ligne**, l. 31 une table séparée « Lot différable »,
l. 33 son unique entrée. **Le total est posé avant que L8 n'apparaisse.**
**Mais budget séparé n'est pas calendrier séparé** : la même l. 33 lui pose un **butoir dur — en
production le dernier jour de collecte (§35.3)**.

### 7.2 Où en est chaque lot du noyau

| Lot | Budget | État mesuré |
| --- | --- | --- |
| L0 · L1 · L2 · L3 · L4 | 9,5 j | **signés** (portes A, B, L3) |
| **L5 PWA terrain** | 8 j | L5a→L5e fusionnés · **L5f chaîne photo JAMAIS OUVERT** (~0,5 j) · **P-C non signée** |
| **L6 sync** | 4,5 j | **zéro ligne** — aucun `apps/api/src/domaines/sync`. Chiffré **5,0 j** par A20 (`LOT_L6.md` §D) |
| **L7-min console** | 2 j | écrans L7a-c **livrés et fusionnés** · **DoD d'acceptation NON CLOSE** : **≈ 2,0 j** (A30, 2026-09-09 — L7d/e/f) · **le critère décisif est NON TENU** — la recette L7e (PR 130) mesure **1 rubrique sur 12** rédigeable depuis le ZIP · **atterrissage ≈ 4 j pour 2 budgétés** |
| Marge recette | 2 j | exige L6 |

**Pourcentages** : noyau **≈ 69 % écrit / 37 % accepté en porte** · Phase 1 complète **≈ 54 % / 26 %**
· Phase 2 (L10-L13) **0 %, non ouverte**. L'écart entre « écrit » et « accepté » est L5 et L7.

> **CES 2,0 j NE SONT PAS DU BUDGET RESTANT** — et c'est la ligne de ce tableau qu'on lit de travers.
> Le §4 compte L7-min **à son budget plein** dans ses « 21,5 j sur 26 » (`docs/journal/2026-09-07.md`
> l. 52), et le burn-down du même journal donne **zéro restant sur L7**. Poser les deux lectures côte
> à côte donne **4,0 j sur un budget de 2,0** : le lot compté consommé en entier ET 2,0 j encore dus.
> **Aucune des deux n'est fausse — elles ne mesurent pas la même chose.** Ce qui reste n'est pas du
> périmètre à écrire : c'est de la **DoD inachevée sur un lot déclaré livré** (recette d'acceptation,
> axe-core, p95 de bout en bout).
>
> **Les 26 j budgètent l'ÉCRITURE, pas l'ACCEPTATION.** Trois lots ont vu leur DoD restante énumérée
> et donnent le même écart, de même nature : L7-min **+2,0 j sur 2** (A30) · L5 **+2,8 j sur 8** (A20)
> · L6 **+1,2 j** sur le restant annoncé. Le biais apparaît **exactement là où la porte n'a pas eu
> lieu** : L0 à L4 sont signés, leur DoD est close, et ils ne le montrent pas.
> Développement : dossier de P-DESCOPE du 15/09 et `docs/conception/LOT_L5.md` §D (PR 131).
>
> **Pratique : ne dérive aucun « reste à faire » du seul §4, et aucun descope du seul budget.**

### 7.3 Ce qui bloque quoi — la seule chose qui compte pour planifier

**Une demi-journée de Williams débloque ≈ 13 j de travail agent.** Le 09 §4bis interdit d'ouvrir L6
tant que P-C n'est pas signée ; L6 se développe seul ; la marge de recette dépend de L6. Aucun
nombre d'agents ne remplace ce geste.

**Ce qui avance SANS lui** : L7d/e/f (2,0 j, chantier distinct autorisé par `ORGANISATION_AGENTS.md`
§9), le branchement de L8 (≈ 1,3 à 1,5 j), les réserves. **Après ça, le parallélisme est épuisé.**

**Prérequis de la séance** : **le compte de test staging**. Sans lui, **une seule** des dix
vérifications est jouable (A55, mesuré — un chiffre plus optimiste du pilote a été refusé).

### 7.4 Ce que la journée a fermé

**NB-15** (le compteur « à revoir » mène à une liste consolidée, §34.2 + M3 + §17.2) · **N3** (dire
*quel* mot de passe : un novice en créait un et **terminait sa journée sans sauvegarde**) · **R5**
(un seul mot pour revenir) · **R7** (aide clavier, et la table des raccourcis devient source unique)
· **la p95 mesurée derrière le vrai Caddy** · **la matrice E1-E47** reçoit L5d/L5e/sécurité ·
**six `@critique` qui expiraient**, corrigés à la cause · **l'amendement du 04** approuvé et
transcrit.

### 7.5 Ce qui reste ouvert, et à qui

| Objet | À qui |
| --- | --- |
| **La demi-journée matérielle** — 4 h 30, iPad, mode avion réel, novice au chronomètre | **Williams** |
| **Le libellé de la pastille de sync** — décision produit dans la séance | **Williams** |
| **D-2 à D-5 de P-DESCOPE** — seul D-1 a été arbitré | **Williams** |
| **La fiche M10** (verrou de session) — proposée, **jamais soumise** | **Williams** |
| **R3 / le cul-de-sac** — A20 a fermé un chemin, la ligne `EcranEntretien.tsx:547` reste due | **A22**, branche à part |
| **L'assertion d'A27** (`vue-initiale-app.test.tsx`) — sa propriété tient, son assertion est plus large qu'elle | **A01** puis **A26** |
| **`test:filrouge` joue 18 tests sur 21** et tait la moitié terrain | **A52** |
| **`multi-appareils.test.tsx`** — liste écrite à la main ; trois écrans neufs y ont échappé. La fermer par `satisfies` forcerait chaque producteur dans un fichier de test | **A01** — les deux ne peuvent pas gagner |
| **D-1 de `useLiveQuery`** — voir 7.6 | **A20 → A01**, **bloquant pour ouvrir L6b** |

### 7.6 Deux faits techniques qu'une session neuve doit connaître AVANT de coder

**(a) Dexie perd le suivi après tout `await` non-Dexie.** Règle mesurée par deux réductions
indépendantes : **seule la table lue AVANT le premier `await` non-Dexie reste suivie ; tout ce qui
est lu après est perdu.** Dans `construireJournee`, le déchiffrement WebCrypto précède la lecture
d'`answers`, de l'outbox et du dernier succès de sync : **les trois données du cockpit §34.2 ne se
rafraîchissent pas**, alors que `EcranAujourdhui.tsx:171-172` affirme le contraire. Pré-existant à
L5c, invisible aujourd'hui, **visible dès le pull delta de L6b**.

**(b) L8 est ÉCRIT et NON BRANCHÉ.** Le moteur de scoring est pur, déterministe, couvert à
**99,88 %** — et **son unique consommateur est l'échafaudage qui le teste**. Aucun `domaines/scoring`,
aucune route. Le code de production le dit lui-même dans le fichier livré au client
(`export/service.ts:104`). **99,88 % établit que les formules sont cohérentes entre elles, pas
qu'elles recevront un jour une ligne réelle.** Reste ≈ **1,3 à 1,5 j** (branchement + radar SVG).

### 7.7 Trois pièges neufs, mesurés le 2026-09-09

- **La garde INV-4b lit `#112` comme une couleur hexadécimale** à trois chiffres. Une citation de PR
  s'écrit **`PR 112`, sans dièse** — la forme qu'`e2e/en-tetes-servis.e2e.ts` emploie déjà. La garde
  a raison ; **ne l'assouplissez pas** : `#abc` serait une couleur valide écrite en croyant citer.
- **Les `@critique` au plafond de 5 000 ms** : la cause n'était ni la lenteur ni la contention, mais
  **le chargement à froid du graphe de modules, facturé au premier test qui le déclenche**. Importer
  l'app API coûte **5 228 ms par worker** contre ~3 s le 2026-09-01 — **+74 % en huit jours**. Tout
  test unitaire touchant l'app n'est viable que grâce à un `beforeAll` de préchauffage, **et rien de
  mécanique ne l'impose**.
- **Le rebase soude les entrées de `DECISIONS.md`.** La garde le refuse, avec son motif : *un fichier
  append-only se lit dans l'ordre ; une insertion au milieu est une réécriture de l'historique, même
  sans suppression.* Rétablir la ligne vide, ne jamais forcer.

### 7.8 La méthode qui a produit tout ce qui précède

**Cinq refus de push par le hook `pre-push` en une journée, cinq fois à raison.** Aucun faux positif.

**Et le pilote a été corrigé cinq fois par ses propres agents** : des dépendances annoncées installées
qui ne l'étaient pas (deux fois), une assignation tirée d'un rapport oral au lieu du registre, un
défaut diagnostiqué « contention » que le dépôt avait déjà instruit et écrit dans son propre hook, et
une contradiction laissée dans une fiche de porte après n'en avoir corrigé que quatre lignes.

**La leçon opérationnelle, pour la prochaine session** : vérifier l'état d'un worktree avant de
l'affirmer dans un brief · lire **le registre**, jamais le compte rendu · et **ne jamais propager la
mesure d'un autre sans l'avoir rejouée**. Les meilleurs résultats de la journée viennent tous d'un
agent qui a refusé de croire son brief.
