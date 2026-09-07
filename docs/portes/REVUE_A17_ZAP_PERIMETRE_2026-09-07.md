# REVUE CROISÉE A17 — outillage CI ZAP — PR #93 (périmètre `/hq` et `/api`)

> Revue croisée du pipeline (09 §3, étape 4), faite **AVANT la fusion**. Le réviseur n'a produit
> aucun fichier (`git status --porcelain` vide, avant et après ses mesures) ; ce rapport est déposé
> ici **par le pilote**, verbatim, suivi de la suite donnée.
>
> A17 a été choisi bien que le diff soit de l'outillage CI : le dépôt n'a pas de réviseur dédié à la
> CI, A17 n'avait rien produit ici, et il lit le shell de manière adversariale — sa revue de
> `sauvegarde.sh` du même jour avait trouvé trois commentaires promettant ce que le code ne tenait
> pas, dont un écrit par le pilote.
>
> **VERDICT : ACCEPTÉ SOUS RÉSERVE** — aucune réserve bloquante ; les huit sont traitées dans le
> commit qui porte ce fichier. Périmètre relu : 6 fichiers, 558+/107−, 100 %.

---

## Ce que le pilote prétendait avoir établi — rejoué, banc hors dépôt

Banc dans le scratchpad, **script ET table copiés dans un même répertoire** (piège `${ici}` évité —
aucune sortie 127, les 4 combinaisons ont réellement exécuté le script) :

| | script actuel | script inversé (`nb_bloq -eq nb`) |
| --- | --- | --- |
| table ancienne (13 cas, `0d89af0`) | **13/13** (rétrocompat confirmée) | **13/13 — verte, donc aveugle** |
| table neuve (27 cas) | **27/27** | **7/27 échouent**, sortie 1 |

Les 7 qui tombent sont bien ceux que le pilote nomme, dont `terrain=0 console=0 api=3`. **Son
tableau est exact, chiffre pour chiffre.** Les 14 cas neufs sont porteurs, pas décoratifs. Aucun des
13 anciens cas n'a été retiré.

## Réponses aux huit questions

**Q1 — la règle d'agrégation tient.** ~40 entrées hostiles, **zéro fuite dans le sens permissif**.
Bloquent correctement : codes en désordre, doublons d'étiquette dont un bloquant, code négatif,
multi-chiffres (`10`, `030`), `00`, `0x0`, `2.0`, `+0`, étiquette vide, code absent, liste vide.
Laissent passer correctement : un seul élément, séparateurs multiples, tabulations, 300 éléments.
**`set -f` fait son travail** : dans un répertoire contenant les fichiers `0`, `3`, `terrain=0`,
`api=3`, les codes `*` et `api=*` bloquent au lieu de se transformer en liste de fichiers. Injection
`$(touch …)` et backticks : bloquées, **aucun fichier créé**.

**Q2 — la boucle ne perd pas de code.** Rejouée avec un faux `docker` : `terrain=0 console=3 api=2`
→ aucun code perdu, `code=$?` relevé sans commande intercalée. Et la version ZAP de la faute
`sauvegarde.sh` **n'est pas là** — `done <<< "${ZAP_CHEMINS}"` est un *herestring*, donc `nb` et
`cibles` vivent dans le shell courant ; un `|` aurait tué la passe, il n'y en a pas.

**Q3 — une panne à mi-parcours ne laisse pas le job vert.** La boucle va au bout, `api` est scanné
après l'échec de `console`. Le contrôle « rapport présent » itère sur **chaque** cible : mesuré,
`console` sans JSON → `manquants= console` → exit 1.

**Q4 — les cibles sont justes, vérifié aux deux bouts.** `/hq` → 308 vers `/hq/`
(`infra/caddy/fronts.static.caddy:49` et `:138`). `/api/v1/health` : `handle_path /api/*` retire le
préfixe → `app.ts:184` enregistre `routesSante` sous `/v1` → `routes/sante.ts:83` sert `/health`
avec `CONFIG_SONDE = { rateLimit: false, acces: { type: 'public' } }` et rend `{ status: 'ok' }`.
**Route publique, 200 JSON réel, exemptée du plafond** — et figée par un test d'instantané.

**Q5 — le décompte est lu du vrai JSON, par cible.** Correspondance code↔étiquette exacte, rien
n'est reconstruit. JSON tronqué ou alerte sans `riskdesc` → jq sort 5 → l'étape rougit (fail-closed).

**Q6 — vérifié moi-même.** `ZAP_BLOQUANT: 'false'`. Aucun `-I` dans le `docker run` (seul `-a`) ;
les deux occurrences dans le fichier sont dans le bandeau historique. Aucun `-c`, aucun `IGNORE`,
aucun `alert-filter`, aucun seuil touché.

**Q7 — 30 min suffit, et un timeout rougit.** L'extrapolation est plus solide qu'elle n'en a l'air :
les ~4 min mesurés portaient sur la coquille `field` (6 URL) ; `/hq/` est une coquille SPA
équivalente et `/api/v1/health` une seule réponse JSON — les deux cibles neuves sont des surfaces
**strictement plus petites** que celle qui a servi de mesure. Un job tué par `timeout-minutes` est
**failed**, donc bloquant ; le verdict ne s'exécute simplement jamais.

**Q8 — aucun code orphelin.** L'appelant `deploy-staging.yml:559-561` ne passe que `cible` :
interface `workflow_call` inchangée.

## Réserves

**R1 — `zap-baseline.yml:457-458` — un commentaire qui énonce une règle bash fausse, dans le fichier
qui condamne les commentaires faux · à corriger.** Il affirmait qu'un `[ … ] && code=…` serait un
piège sous `set -e`. Mesuré : sortie 0, « APRES » affiché. Le membre gauche d'une liste `&&`
court-circuitée est **exempté d'`errexit`**. Et **le même fichier pratique ce motif ligne 299**
(`[ -z "${ligne}" ] && continue`), sous le même `set -euo pipefail`. Le fichier condamne en 457 ce
qu'il fait en 299 — c'est la moitié invisible de F-31 (« le commentaire aggravait le piège en
énonçant une table de codes fausse ») rejouée dans le commit qui la met en accusation.

**R2 — une étiquette en double écrase un rapport, en silence, et fausse le décompte dans le sens
flatteur · à corriger.** L'étape valide les **caractères** de l'étiquette mais **jamais son
unicité**, alors que son propre commentaire dit « elle devient un nom de dossier ». Mesuré avec deux
cibles `terrain` : deux scans, **un seul rapport survit**, et le résumé imprime deux lignes lisant
toutes deux le rapport du second. Le verdict reste juste — ce qui rend le défaut d'autant plus
discret. Pas de défaut vivant aujourd'hui ; c'est le piège tendu à qui ajoutera la quatrième cible.

**R3 — l'URL de base est la seule entrée non validée de l'étape qui se dit validante · remarque.**
Elle refuse une étiquette hors `[a-z0-9-]`, un chemin sans `/`, une liste vide ; elle accepte
`https://s /x` (l'espace scinde l'élément en deux) et `example.com` (sans schéma). Fail-closed en
aval dans les deux cas, donc pas de vert imprudent — mais l'asymétrie est nette.

**R4 — un `{}` de 3 octets passe « rapport présent » et rend 0|0|0|0 · remarque.** `[ ! -s ]` ne
teste que la non-vacuité. Le seul endroit du fichier où le contrôle d'existence et le décompte
peuvent, **ensemble**, rassurer sur rien.

**R5 — `zap-verdict.test.sh:36-39` — assertion réfutable en une commande · pré-existante · remarque.**
« Le bit exécutable ne survit pas au dépôt (git a enregistré 100644 depuis Windows) » : `git ls-tree`
sur le commit de création rend **100755**, et `check:executabilite` rend un 100644 structurellement
impossible. Le choix `bash "${verdict}"` est bon et doit rester ; sa justification est fausse depuis
le jour où elle a été écrite — et elle s'appuie sur une mesure datée, **le format qui donne à une
assertion fausse sa force de persuasion**.

**R6 — `DECISIONS.md` : la forme de la réponse `login` donnée incomplète comme une égalité ·
remarque.** Le schéma réel porte **six** champs, pas trois — dont `accessExpiresAt`, précisément
celui qui porte le piège des 15 min que l'entrée décrit trois paragraphes plus bas. La conclusion,
elle, est vérifiée et juste : `grep -rn "setCookie\|clearCookie\|@fastify/cookie"` → **sortie vide**.

**R7 — inventaire des secrets incomplet, dans `DECISIONS.md` ET `REPRISE_AUTOPILOTE.md` · remarque.**
Il en manque un : `secrets.GITHUB_TOKEN`. La conclusion opérante — « rien d'applicatif », donc aucun
compte de test — **est exacte** ; c'est l'énumération, présentée comme un inventaire, qui en oublie un.

**R8 — `.github/workflows/README.md:362` envoie encore le lecteur au lot L2 · remarque.**
L'arbitrage du 2026-09-05 déplace l'échéance à **P-C** et la conditionne. Obsolescence
pré-existante, mais cette PR est le moment exact où la case devient trompeuse.

## Les 8 invariants, et le reste

Les huit : **OK**. L'invariant 3 est même **appliqué activement** — la condition (a) de l'entrée
`DECISIONS.md` refuse d'avance un compte `admin` au scanner, en citant `scoping_financials` : c'est
l'invariant qui bloque une facilité, pas qui la commente. L'invariant 7 est tenu par la forme de la
rectification de `REPRISE_AUTOPILOTE.md`, qui cite l'original mot pour mot au lieu de l'écraser.
**Interdictions 11 §2 : OK.** **Code orphelin : aucun** — rattachement E36/E43 vérifié, et les
citations `09 §1`, `07 §13`, `02 §30.6` vérifiées **section incluse, pas seulement contenu** — le pas
que le pilote avait sauté le matin même. **Micro-améliorations étage 1 : 0.**

**Mesures de non-régression faites par le réviseur** : les 15 gardes vertes, `lint`, `format:check`,
`typecheck` verts, table 27/27. `shellcheck` absent de la machine — **aucune conclusion tirée** sur
ce plan ; noté en revanche, contre sa propre première hypothèse, que le job CI le couvre bien (le
pathspec est `git ls-files 'infra/scripts/*.sh' '.github/scripts/*.sh'`, seul le **nom** du job est
resté « (infra/scripts/\*.sh) »).

## Un point de lecture pour la porte P-C, qui n'est pas une réserve

L'araignée de ZAP requiert `/robots.txt` et `/sitemap.xml` à la **racine du site** quel que soit le
point d'entrée. Le rapport `api/` contiendra donc quelques URL servies par **Caddy**, pas par l'API.
« Un rapport par cible » n'est pas « un rapport de cette cible seulement » — à savoir en lisant les
trois rapports, sans quoi une alerte d'en-tête Caddy sera attribuée à l'API.

**Désaccords à arbitrer par A01 : aucun. Doutes de spec : aucun de mon fait** — celui qui existe est
déjà porté, avec sa question, par l'entrée du 2026-09-07, et il est adressé à Williams.

```
Rappel : je n'ai rien produit — git status --porcelain vide, avant et après mes mesures.
Signature revue croisée : A17 — 2026-09-07
```

---

## SUITE DONNÉE PAR LE PILOTE — 2026-09-07

Les huit réserves sont traitées. Chacune a été **rejouée par le pilote** avant correction.

| | Vérifiée | Correction |
| --- | --- | --- |
| **R1** | `set -euo pipefail; … [ … ] && c=…` → **sortie 0, « APRES » affiché**. Et `:299` pratique bien ce motif. | Commentaire réécrit : la forme `if … fi` est retenue pour la lisibilité, **pas** parce que `&&` serait dangereux ; l'aveu de la contradiction 457/299 est écrit |
| **R2** | Structurel, mesuré par A17 | Contrôle d'unicité des étiquettes ajouté. **Éprouvé** : `terrain=/ terrain=/hq/` → code 1, « Étiquette de cible en double » |
| **R3** | Mesuré par A17 | Contrôle de schéma et d'espace sur l'URL de base. **Éprouvé** : `example.com` → code 1 ; `https://s /x` → code 1 ; nominal → code 0 |
| **R4** | `[ ! -s ]` ne teste que la non-vacuité | Le rapport doit être un JSON portant un tableau `site`. **Éprouvé** : `{}` → code 1 ; non-JSON → code 1 ; trois vrais rapports → code 0 |
| **R5** | `git ls-tree` au commit de création → **100755** | Justification corrigée ; `bash "${verdict}"` conservé pour la vraie raison (archive, copie, montage `noexec`) |
| **R6** | `authSessionSchema` porte bien six champs | Entrée `DECISIONS.md` complétée **avant** son entrée dans `main` — dont `accessExpiresAt`, qui porte le piège des 15 min |
| **R7** | `grep -rhoE "secrets\.[A-Z_]+" .github/` → 13 noms, `GITHUB_TOKEN` compris | Inventaire complété **aux deux endroits**. C'était une erreur du pilote : `GITHUB_TOKEN` figurait dans sa propre sortie de `grep` et il l'a omis en recopiant |
| **R8** | Arbitrage du 2026-09-05 lu | Case du README réécrite : **P-C**, avec sa condition, et la mention explicite qu'elle disait « lot L2 » — un jalon franchi — ce qui aurait fait cocher la bascule sans rien armer |

**R1 est la réserve qui compte**, et le pilote la reprend à son compte : ce commentaire faux a été
écrit dans le commit dont la thèse est que ce fichier a déjà payé deux fois le prix d'un commentaire
qui ment. Le trouver demandait de tester une règle de bash que tout le monde croit connaître.
