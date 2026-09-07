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
- **`.git/config` du répertoire principal porte `core.bare = true`** alors qu'il a un index et sa
  copie de travail. `git status` y échoue. Contournement sans rien modifier :
  `git --work-tree=. -c core.bare=false <commande>`.
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

## 4. ÉTAT MESURÉ AU 2026-09-07 02h30 UTC — À VÉRIFIER, PAS À CROIRE

**`main` porte huit lots sur neuf** : L0, L1, L2, L3, L4, L5 (a+b+c), L7-min (a+b+c) et L8.
**21,5 jours-homme livrés sur les 26 du plan** (table du fichier 07).

**Le neuvième — L6, la synchronisation — n'a AUCUNE ligne de moteur, et c'est délibéré** :
`CLAUDE.md` §4 impose qu'il se développe seul, après la porte P-C. Sa note de conception est validée,
son contrat d'opérations et la propriété serveur sont tranchés et tracés.

> **Ne recopie pas ces chiffres dans un rapport sans les remesurer** — ils datent de la ligne
> ci-dessus. `git log --oneline -1 origin/main`, `gh pr list` et la suite de tests disent la vérité ;
> ce fichier dit seulement où regarder.

| Ce qui reste | Où | État |
| --- | --- | --- |
| **Porte P-C** | `docs/portes/` | **Refusée deux fois**, se rejoue EN ENTIER (09 §4bis). Seul goulot du chantier |
| **17 vérifications matérielles** | fiche dédiée | 7 exigent un serveur, 10 un appareil physique. Dues à Williams |
| **L5d — chaîne photo** | non ouvert | Après P-C, avant L6c. `compresserPhoto` est du code sans appelant, assumé et tracé |
| **L6a/b/c — sync** | non ouvert | 4,5 j, SEUL, après P-C. Dernier gros morceau |

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
- **`staging` est rouge depuis le 2026-09-02, et le geste revient bien à Williams — MAIS c'est
  désormais MESURÉ, plus supposé.** Cette distinction est le seul contenu utile de ce point.

  Ce fichier affirmait « aucun chemin API n'existe » **et** « clé de déploiement restreinte au
  script périmé lui-même ». La session pilote a cru la première moitié fausse, l'a déclarée telle,
  **et l'a écrit ici** — puis a construit `.github/workflows/ops-poser-enveloppeurs.yml` pour le
  prouver. **Le workflow a échoué, et il a eu raison contre elle** (run du 2026-09-07 03h06) :

  ```
  EMPREINTE_SCRIPT=68fbc455ea60df8019b41566e48d737e0ec6cb1915742e55d0cb619a3d0ed0fd
  ##[error]stdin: jeton absent.
  ```

  La connexion s'ouvre — l'hôte répond — mais la clé est verrouillée par une directive `command=`
  d'`authorized_keys` : elle exécute l'enveloppeur, **et rien d'autre**. Aucune commande arbitraire,
  donc aucun `install`. L'en-tête de `infra/scripts/deploy-staging.sh` le disait déjà en toutes
  lettres : « ni shell, ni lecture de fichier, ni redirection de port ». **La seconde moitié de
  l'affirmation était donc VRAIE**, et seule la première (« aucun chemin API ») était trop large.

  Ce que le run apporte quand même, et ce n'est pas rien : l'empreinte du serveur (`68fbc455…`)
  **confirme par la mesure** qu'il exécute l'ancien enveloppeur là où le dépôt attend `74926ac9…`.

  **Le workflow n'est pas perdu : il devient le harnais de VÉRIFICATION du geste humain.** Williams
  pose les deux fichiers, on le relance, et il dit par les empreintes si c'est bon — au lieu de
  laisser croire.

  **Et la leçon tient dans les deux sens, ce qui la rend meilleure que celle qu'on avait écrite** :
  une affirmation jamais remesurée gouverne les décisions qui la citent — **mais une réfutation trop
  rapide en gouverne d'autres.** Ici, la bonne question n'était pas « depuis quand personne n'a
  essayé », c'était « qu'est-ce que la clé peut faire, exactement ». **Mesure avant d'affirmer, y
  compris quand tu affirmes que quelqu'un d'autre s'est trompé.**

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
