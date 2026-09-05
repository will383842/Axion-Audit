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

## 4. ÉTAT MESURÉ AU 2026-09-05 06h50 UTC — À VÉRIFIER, PAS À CROIRE

**`main` porte L0, L1, L2, L3, L5a, L5b, L7a, L7b et E18.** Tags `v0.l0`, `v0.l2`, `v0.l3`.

> **Une limite d'API a coupé six agents à 06h40 UTC** (réinitialisation 10h20 Paris). **Rien n'a été
> perdu** : tout a été poussé sur `origin`, vérifié deux fois, worktree par worktree. Chaque branche
> ci-dessous porte donc du travail réel, à des degrés d'avancement différents. **Relis ce qui est là
> avant d'écrire quoi que ce soit** — un brief précédent affirmait « rien n'a été commité » alors que
> six correctifs l'étaient, sans être poussés.

| Chantier | Branche | État à la coupure |
| --- | --- | --- |
| **L5c** | PR **#52** | Complet, en attente de fusion. **Dernier incrément avant P-C** |
| **L7c** | `lot/l7c` | Export §36.3 — l'agent en était au bloc `ETAT` et au balayage final |
| **L5a réserves** | `lot/l5a-reserves` | Six réserves fermées ; tests croisés A26 **en cours** |
| **Couverture `companies`** | `lot/l3-couverture-companies` | Build vert, mesure sur base post-#34 en cours |
| **L8 scoring** | `lot/l8-scoring` | **`wip:`** — contrat partagé et jeux de référence écrits, **moteur non écrit**, rien de vert |
| **Garde octets** | `chore/garde-octets-controle` | Script écrit ; l'étape de CI restait à brancher |
| **Note L6 amendée** | PR **#53** | 8/8 scénarios ont un porteur |

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
- **`staging` est rouge** et le restera : le correctif demande un `install -m 755` **en root sur le
  serveur**. Aucun chemin API n'existe (jetons Coolify en secrets GitHub non lisibles ; clé de
  déploiement restreinte au script périmé lui-même). **C'est le seul geste qui revient à Williams.**

---

## 6. COMMENT TRAVAILLER — ce qui est délégué, et ce qui ne l'est pas

**Délégué à la session pilote** (`DECISIONS.md`, 2026-09-04) : l'exécution complète, les merges
d'incréments, **et les portes P-C / P-D / P-E**, sous quatre bornes qui portent sur *qui signe* et
jamais sur *ce qui est dû* — dossier de porte intégral avec preuve par critère, DoD non amendée, une
porte échouée reste échouée, tout est re-signable.

**Jamais délégué** : le geste root sur staging (une permission système ne se délègue pas), et
**l'amendement du fichier 04**, réservé à la revue de spec de **P-D** (09 §5.9).

**Le pipeline en 7 étapes n'a pas de raccourci.** En particulier : le code de test n'est jamais écrit
par l'agent qui a écrit le code testé, et **un réviseur ne commite jamais** — il dépose son verdict,
le pilote le commite. Les deux règles ont été payées par des incidents datés.

**Trois leçons de méthode, chacune payée** :

1. **Un correctif juste peut n'être exécuté par aucun test.** Trouvé par le `lcov` de la CI, pas par
   relecture : on pouvait supprimer le correctif sans un seul rouge.
2. **Une garde d'anti-vacuité ne doit jamais s'appuyer sur l'état du code de production.** Un test
   exigeait « au moins une violation » avant sa bascule : il est devenu impossible à satisfaire le
   jour où le défaut a été corrigé. **Une bascule fabrique sa propre condition.**
3. **` ` écrit par les outils d'édition devient un octet réel.** C'est ainsi que trois octets
   nuls ont rendu un fichier invisible à `ripgrep`. La parade est un appel de fonction, jamais
   l'échappement.
