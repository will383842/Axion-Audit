# REVUE CROISÉE A29 — lot L5 — banc du budget de chiffrement (NB6 / NB-10)

> Revue croisée du pipeline (09 §3, étape 4), faite **AVANT la fusion** de la PR #92.
> Le réviseur n'a produit aucun fichier : ses bancs sont restés hors dépôt. Ce rapport est déposé
> ici **par le pilote**, verbatim. Les quatre réserves ont été **rejouées par le pilote** avant
> correction — R1 (section réelle de la ligne citée), R3 (`BUDGET_MS = 3` → vert) et R4 (nom de la
> fonction de production) sont confirmées par mesure, pas reprises sur parole.
>
> **VERDICT : ACCEPTÉ SOUS RÉSERVE** — les quatre réserves sont levées dans le commit qui porte ce
> fichier. Périmètre relu : `git diff 35582fa..ba9df5d`, 3 fichiers, 560 lignes, 100 %.

---

```
[A29] Revue croisée — lot L5 — banc du budget A28 (NB6 / NB-10) — 2026-09-07
Périmètre relu : git diff 35582fa..ba9df5d — 3 fichiers, 560 lignes ajoutées, 0 supprimée, 100 % relues
VERDICT : ACCEPTÉ SOUS RÉSERVE
```

## Ce que j'ai mesuré moi-même (rien n'est repris sur parole)

Banc hors dépôt, `chromium-1194`, machine 4 cœurs.

| Épreuve | Résultat mesuré |
| --- | --- |
| Copie fidèle, seuils réels | VERT — chiffrement p95 **0,70 ms**, écriture p95 **8,60 ms** |
| Suite e2e COMPLÈTE, `--workers=2` (condition CI) | VERT — chiffrement p95 **1,30**, écriture p95 **9,50** |
| Copie fidèle sous 4 boucles CPU (saturation 100 %) | VERT — chiffrement p95 **0,90**, écriture p95 **8,00** |
| `BUDGET_MS` → 0,4 | ROUGE sur l'assertion 1 (p95 0,60) |
| `BUDGET_INTERACTION_MS` → 3 | ROUGE sur l'assertion 2 (p95 8,80) |
| Sonde débranchée (`outbox` → magasin inexistant) | ROUGE sur le poll, « Received: 0 » — pas de vert silencieux |
| **Injection d'un `encrypt` parasite** (le code de production se met à chiffrer une fois de plus) | ROUGE sur `enveloppes` : « Expected 2 / Received 4 » |
| **200 écritures, dérive par tranches de 40** | p95 12,3 / 9,8 / 11,2 / 8,5 / 10,2 — **aucune dérive** malgré `outbox` porté à 202 ; pire écriture isolée sur 200 : **24,8 ms** |
| `pnpm verify:rapide` | exit 0 — 14 gardes, lint, format, typecheck, **1126 tests** verts |

**Contre-sonde indépendante** (instrumentation différente, écrite par moi) sur 200 écritures :
`{"nbEncryptDistincts":[2], "nomsMiroir":["answers"], "memeTransaction":[true], "putsEtrangers":0, "a28SousEstime":0, "p95_apresAdd":"6.20", "p95_ecritureComplete":"10.70"}`

## Réponses aux sept questions posées

**1. La sonde mesure-t-elle ce qu'elle prétend ? Oui — et le point soupçonné tient.**
`memeTransaction: [true]` sur 200 échantillons : le `put` de la table miroir et le `add` d'`outbox`
sont dans **la même** `IDBTransaction`, donc le `complete` écouté couvre la ligne ET l'op. La borne
va jusqu'au commit, pas au retour du `put`. Et le mensonge classique aurait payé :
`p95_apresAdd = 6,20 ms` sur un total de `10,70` — **plus de la moitié de l'écriture se passe après
le retour de `add`**. Un banc qui se serait arrêté là aurait annoncé ~4 ms au lieu de ~10.
Sur `chiffrementMs` : `a28SousEstime = 0` sur 200 — c'est bien une borne **supérieure**,
3,5× conservatrice, comme l'en-tête le revendique. `putsEtrangers = 0`.

**2. Les anti-vacuités tiennent. Je n'ai pas réussi à les casser.** La n° 2 est la meilleure : j'ai
injecté un chiffrement supplémentaire par écriture — une régression de production simulée — et elle
a rougi immédiatement. Un bémol chiffré : la n° 3 a **2 unités de jeu** (`outbox` = 42 pour 40
écritures, à cause des ops du semis) ; corroboration d'ordre de grandeur, pas compte exact.

**3. Le p95 est correct.** Rang le plus proche, `ceil(0,95·n)−1` : sur 40 échantillons il rend la
38ᵉ valeur — exactement 2 valeurs hautes tolérées, la 3ᵉ emporte le verdict, ce que le commentaire
annonce mot pour mot. Bords vérifiés. `p95([]) === 0` serait flatteur, mais l'anti-vacuité
s'exécute **avant** : inatteignable.

**4. Non, je ne pense pas qu'il rougira en CI.** Les 200 écritures ne dérivent pas, la saturation
CPU totale ne coûte rien (l'écriture est dominée par IndexedDB, pas par le processeur), et la suite
complète à 2 workers donne p95 9,50 ms contre 100. Pire écriture isolée sur 200 : 24,8 ms, encore
4× sous le seuil, et le p95 en absorbe deux. Marge réelle ≈ 10× sur l'écriture, ≈ 40× sur les
enveloppes.

**5. L'arbitrage est juste sur le fond, faux sur la citation.** Le raisonnement « deux budgets dans
la même parenthèse » tient. Mais la phrase citée vit à **`docs/09_PLAN_EXECUTION_AUTOPILOTE.md:23`,
sous `## 1. LES RÔLES`**, donc **09 §1**. `09 §3` est « LE PIPELINE — 7 ÉTAPES » (ligne 46) et ne
contient **aucun** budget de performance : je l'ai lu en entier. C'est la réserve R1.

**6. Les 8 invariants passent. 7. Pas de code orphelin** — E33/E6/E36/E43 déclarés,
`check:tracabilite` vert (1253 citations), et le fichier ferme une réserve nommée d'A02.

---

## Réserves numérotées

**R1 — BLOQUE LA FUSION — citation `09 §3` fausse, et propagée dans le relevé de CI.**
Le texte cité est à 09 **§1**. Occurrences : `DECISIONS.md` (3 fois, dont *la* phrase qui porte
l'arbitrage) et le test (`:124`, `:447`, `:464`, `:475`). La ligne 447 est la plus coûteuse : la
fausse référence entre dans la chaîne `releve`, donc dans l'annotation, donc dans tout fichier de
porte qui la recopiera. Le fond n'est pas atteint — la phrase existe, verbatim, ailleurs.

**R2 — BLOQUE LA FUSION — l'en-tête de 108 lignes décrit le fichier d'avant l'arbitrage.**
Le commit d'arbitrage a changé les constantes et les deux assertions et **n'a pas touché une ligne
de l'en-tête**. Conséquences vérifiables : `:23-37` annonce un doute « NON TRANCHÉ ICI » et « les
deux assertées sous 50 ms » — elle ne l'est plus ; `:82` « facteur ~4 » est faux contre le budget
désormais appliqué ; et la contre-épreuve `:89-95` (« seuil abaissé à 5 ms → ROUGE ») **ne se
rejoue plus** : `BUDGET_MS = 3` sur le fichier tel que commité rend **VERT**.

**R3 — BLOQUE LA FUSION — `docs/ETAT.md:4562` consigne une contre-épreuve fausse.**
« à `BUDGET_MS = 3` le test rougit (p95 7,5 ms), vert à 50 ». Mesuré sur `ba9df5d` : **vert**. La
constante qui rougit à 3 est `BUDGET_INTERACTION_MS`. C'est le **dernier bloc**, celui qui fait foi,
et CLAUDE.md §8 ordonne à une reprise de rejouer les tests plutôt que de croire ETAT.md : elle
obtiendrait un vert, croirait le banc cassé, et repartirait sur une fausse piste. Rectification par
un **bloc correctif en ajout**, jamais par réécriture.

**R4 — à corriger, ne bloque pas la porte — chaîne d'appel inexacte.**
Le test annonce « `enregistrer()` → `enregistrerReponse()` → `ecrireLocal()` ». La fonction de
production est **`ecrireReponse()`** (`apps/field/src/session/ecriture-reponses.ts:120`) ;
`enregistrerReponse` n'existe que comme échafaudage local dans deux `*.test.ts`. Dans un fichier
dont toute la valeur est qu'on puisse refaire le chemin à la main, un nom de fonction faux se paie.

## Remarques (ne bloquent rien)

1. NB6 demandait la mesure « **au même endroit que l'autre budget** » (`accessibilite-l5a.e2e.ts`).
   A28 a créé un fichier séparé. Défendable, mais c'est A02 qui coche la réserve : à signaler.
2. La charge mesurée est la plus petite du domaine — un `yes_no`, 40 écritures sur la même ligne.
   Ni texte libre ni pièce jointe. L'en-tête annonce pourtant qu'un dépassement viendrait « de la
   taille des charges » : c'est la seule dimension que le banc n'exerce pas. (Aucune dérive sur 200.)
3. Les deux assertions sont **très** lâches (≈ 40× et ≈ 10× de marge). Ce que ce fichier livre
   vraiment, c'est l'**annotation**, pas l'assertion : elle seule rendra une dérive visible d'un lot
   à l'autre. Il faut donc que les chiffres soient recopiés dans le fichier de porte.
4. `retries: 1` en CI et Playwright sort 0 sur un test « flaky » : un dépassement de budget rattrapé
   à la reprise rendrait le job **vert**. Pré-existant, pas introduit par ce diff, mais c'est propre
   aux tests de budget et ça mérite d'être su.
5. `docs/ETAT.md` annonce « étape pipeline **5/7** ». La revue croisée est l'étape **4**.
6. `?? 0` et `p95([]) === 0` : inoffensifs — l'anti-vacuité s'exécute avant, ordre vérifié.

## Grille réglementaire

**8 invariants** — 1 OK · 2 OK (`Camille Ferrand` fictif et déclaré tel) · 3 sans objet · 4 OK
(grep couleurs/tailles sur le diff : **0**) · 5 OK (100 % français, aucune date manipulée) · 6 OK ·
7 OK (ajout pur, `DECISIONS.md` +46/−0, `ETAT.md` +36/−0) · 8 sans objet.
**« Simplifications temporaires » (09 §5.7) : aucune.** Vérifié mécaniquement :
`git diff --stat 35582fa..ba9df5d` = 3 fichiers, **zéro sous `apps/`**. Aucune porte
d'instrumentation dans le code mesuré. Croisement 09 §5.6 respecté. Aucun test skippé (181 fichiers).
**Code orphelin : aucun. Désaccords à arbitrer par A01 : aucun. Doutes de spec : aucun** — R1 à R4
sont des corrections, pas des choix.

---

Ce banc est le meilleur que j'aie relu dans ce dépôt sur le fond : il mesure le vrai chemin, il va
jusqu'au commit de la transaction, ses trois anti-vacuités mordent, et son p95 est honnête. Les
quatre réserves sont toutes documentaires — mais R2 et R3 laissent le dépôt avec une contre-épreuve
écrite qui ne se reproduit plus, et c'est précisément la classe de défaut que ce fichier prétend
combattre.

```
Rappel : je ne produis rien — aucun fichier du dépôt modifié (git status propre, vérifié).
Signature revue croisée : A29 — 2026-09-07
```

---

## SUITE DONNÉE PAR LE PILOTE — 2026-09-07

| Réserve | Vérifiée par le pilote | Correction |
| --- | --- | --- |
| **R1** | `awk` sur les en-têtes `## ` : la ligne 23 tombe sous `## 1. LES RÔLES` (9–39). **Confirmée.** | 7 occurrences corrigées en `09 §1` (DECISIONS.md ×4, test ×3) |
| **R2** | En-tête relu ligne à ligne contre le code | Doute réécrit comme TRANCHÉ, « facteur ~4 » → « ~8 sur son propre seuil », contre-épreuve remplacée par celle qui se rejoue |
| **R3** | `BUDGET_MS = 3` rejoué sur `ba9df5d` : **1 passed**. **Confirmée.** | Bloc correctif ajouté à `ETAT.md` (append-only), étape 5/7 → 4/7 |
| **R4** | `ecrireReponse` existe à `ecriture-reponses.ts:120` ; `enregistrerReponse` n'apparaît hors tests : **0 occurrence**. **Confirmée.** | Nom corrigé, avec son chemin |

**Et un défaut que la revue n'a pas relevé, trouvé par le pilote sur le run vert de #92 :**
l'en-tête affirmait que l'annotation était « portée par le rapporteur `github`, donc lisible en CI
même quand le test passe ». **C'est faux, et c'est mesuré** : le journal du job `5 · e2e` du run
green ne contient que « 84 passed » — le relevé n'y figure nulle part, il ne vit que dans un
artefact de 5 Mo. La remarque n° 3 d'A29 le rend d'ailleurs critique : ce fichier livre son
annotation plus que son assertion. Le relevé est désormais **aussi** écrit dans
`GITHUB_STEP_SUMMARY`, avec échec silencieux assumé hors CI. Même classe de défaut que R2 : une
promesse que le code ne tenait pas.

> **CE QUE JE N'AI PAS PU VÉRIFIER DE MA PROPRE CORRECTION, ET JE REFUSE DE L'ÉCRIRE COMME ACQUIS.**
> Mesuré ici : avec `GITHUB_STEP_SUMMARY` posé sur un fichier, la ligne y est bien écrite (relevé
> complet, contrôlé). **Non mesuré : que GitHub la RENDE sur la page du run.** Les résumés de job
> ne sont exposés par aucun point d'entrée de l'API REST — `output` du check-run est vide (`len 0`,
> vérifié sur le run vert de `42d412c`) — donc depuis ce conteneur je ne peux pas le prouver. Je
> m'appuie sur le comportement documenté de la variable, pas sur une mesure.
> **Le prochain run le montrera ou non ; c'est à regarder sur la page du job, pas à croire ici.**
> L'écrire comme prouvé serait refaire, sur la correction elle-même, la faute qu'elle corrige.
