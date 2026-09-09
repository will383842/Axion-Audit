# CONTRÔLE D'ACCEPTATION A02 — porte P-C **REJOUÉE EN ENTIER** — lot L5 — 2026-09-09

> **Étape 6/7 (09 §3), rejeu intégral (09 §4bis : « la porte se rejoue EN ENTIER »).** Gardien A02,
> **lecture seule** — aucun fichier du dépôt écrit ; transcription par le pilote.
> **Arbre contrôlé : `origin/main` = `5ac6f95`.** Le run CI `34310906935` était **encore en cours** à
> l'ouverture : A02 a **attendu sa fin** plutôt que de le déclarer vert.

---

## VERDICT : 🟠 CONFORME SOUS RÉSERVE — **P-C TOUJOURS NON FRANCHISSABLE**

| | 06/09 | 07/09 | 08/09 | **09/09** |
| --- | --- | --- | --- | --- |
| Critères 07 (ferme / sous réserve / non tenu) | 0 / 4 / 4 | 1 / 5 / 2 | 1 / 6 / 1 | **1 / 7 / 0** |
| Invariants | 6/8 | 8/8 puis 7/8 | 7/8 + 1 écart | **8 / 8** |
| DoD | — | 7/10 | 7/10 | **7/10** |
| Réserves bloquantes | 4 | 3 | 2 | **2** |

**Le mouvement du jour est entier dans le critère 1**, et il vient d'un **correctif** (L5e), pas d'une
recoche. **Plus aucun critère n'est « non tenu ».**

**Écart NON documenté : 1** (NB-15). Motif de veto constaté ; **veto non prononcé** — l'étape 6 est déjà
arrêtée par les deux bloquantes.

---

## 1. Le fait neuf de la journée — le run ZAP en TLS sur staging EXISTE

**Correction au brief, faite avant tout chiffre parce que tout en dépend** : « le run TLS sur staging
n'a pas eu lieu » est **FAUX**. Il a lieu **à chaque merge sur `main`**, en job imbriqué du déploiement
(`ci.yml` → `deploy-staging.yml` → `zap-baseline.yml` en `workflow_call`), sur
`https://audit-staging.axion-ia.com`, **trois cibles**, immédiatement après un déploiement vérifié
(deploy 04h38→04h42, scan 04h42→04h45).

**Résultat sur `5ac6f95` : `terrain=2 console=2 api=2`** — `FAIL-NEW 0 · WARN-NEW 1 · IGNORE 4 · PASS 65`.
**Ce n'est pas 0/0/0.** Le 0/0/0 d'A11 était **local et en HTTP**.

**La seule famille restante** : `10015 Re-examine Cache-control Directives`, ×3 / ×4 / ×5. URI exactes,
dépouillées de l'artefact : `/` · `/hq/` · `/robots.txt` · `/sitemap.xml` · `/api` · `/api/v1/health`.

**La cause, mesurée au `curl` sur staging** : l'HTML sort en `Cache-Control: no-cache` — **politique
délibérée** (05 §31, `Caddyfile:383`) — et ZAP veut `no-store, no-cache, must-revalidate` ; `/api/*`
sort **sans aucun `Cache-Control`**, c'est §4-B, daté et assigné à L6c.

**Le progrès est réel et A02 le dit** : sur `deca8bd` (juste avant #112), le même scan rendait
**WARN-NEW 7**. **#112 en a fermé six.** La concession CSP est **fermée sur staging** : `style-src 'self'`,
mesuré.

> **Conséquence décisive** : l'étape (2) du cliquet — « constater sur STAGING EN TLS des codes
> `terrain=0 console=0 api=0` **et aucune autre alerte WARN** » — est **jouée et NON satisfaite**.
> `ZAP_BLOQUANT='true'` aujourd'hui ferait **rougir `main`**. Ce n'est plus une prudence, c'est un chiffre.

---

## 2. Les 8 critères du fichier 07, ligne L5

| # | Critère | 08/09 | **09/09** | Preuve / ce qui reste dû |
| --- | --- | --- | --- | --- |
| **1** | Écran « Aujourd'hui » §34.2 (agenda, à-revoir, **sync par mission**) | ❌ | ⚠️ **AVANCÉ — le motif de refus est éteint** | **Les trois données sont là, lues et non supposées** : pastille (`EcranAujourdhui.tsx:388`), outbox vraie (`jour.ts:216`), **dernier succès** (clé `meta`, `base.ts:155,180`, lue `jour.ts:129-136,227`, **rendue au fuseau de la MISSION** `:408-414`, **et** injectée dans `evaluerAlerteSauvegarde` `:235` — une source, un fait). Cinq cas `@critique`, dont **(d)** succès + port inerte ⇒ **jamais de pastille verte** et **(e)** la même vérité nourrit l'alerte. **Non ferme** : **NB-15** (le compteur d'à-revoir n'est **pas cliquable**, §34.2 l'exige — `:406` texte inerte, alerte sans action `:290-305`) et « Démo » veut dire montré |
| 2 | Mode avion complet iPad **ET** PC | ⚠️ | ⚠️ **inchangé, et le risque a grandi** | `hors-ligne-l5.e2e.ts:215`, deux gabarits, vert. **Dû** : l'iPad physique — **et désormais sous `require-corp`, mesuré actif sur staging, jamais tourné sur WebKit/iPadOS** |
| **3** | 1 session de chaque type hors ligne | ✅ | ✅ **ferme** | `:289`, les six `kind`, `setOffline(true)` |
| 4 | Coupure de courant = zéro perte | ⚠️ | ⚠️ inchangé | `:370`, profil sur disque. **Dû** : l'alimentation arrachée |
| 5 | Export créé puis restauré sur un 2ᵉ appareil | ⚠️ | ⚠️ **renforcé** | `:471`, second profil. `sauvegarde.ts` **99,12 / 98,51** · `format.ts` 100/100. **Dû** : le 2ᵉ appareil physique, clavier virtuel |
| 6 | **Test novice < 30 min** | ⚠️ | ⚠️ **inchangé — et aggravé d'un cran de forme** | **Aucun rapport A54 postérieur au 07**, vérifié **au système de fichiers et sur les 51 worktrees**, pas par `git log`. Et les deux GO SOUS RÉSERVE portent sur `ef2dea0`, **antérieur à L5d, L5e et l'incrément sécurité** — trois incréments qui ont touché des écrans terrain. **Dû** : le novice au chronomètre, **sur l'arbre présenté à la porte** |
| 7 | Écran partagé démontré | ⚠️ | ⚠️ inchangé | `@critique` : aucune sentinelle interne dans le DOM, bascule « E » dans les deux sens, éléments **retirés du rendu**. **Dû** : la démo devant témoin |
| 8 | Police rendue en mode avion | ⚠️ | ⚠️ inchangé | `polices.e2e.ts` + `tokens.css:165` + 6 cas dont une contre-épreuve. **Dû** : cold start hors réseau, PWA installée, **iPadOS** |

### Exigences de la ligne P-C (09 §4 + §33.7)

Grille §33 : **4 états 12/12**, tenus **par le type** (`satisfies Record<CodeVue, …>` — une vue de plus ne
compile pas sans ses capacités) · **ancres visibles cochées par les deux bouts** (R1 lisibles avant le
tap, N1 co-visibles, quatre combinaisons) · les sept boutons aux mêmes places · session en 1 tap ✅ ·
**aucun verrou en 45 min — NON JOUÉ**, et D-3 l'a tranché : *le code est conforme, le critère de porte ne
se ferme pas par du code mais par une session de 45 min réellement rejouée* · « Fin de journée » ✅ avec
la réserve du mot de passe · Terminer → note → Valider ✅ · **rappel au jour civil de la mission ✅ neuf,
fermé** (UTC+14, les deux bords de minuit).

---

## 3. DoD transverse — 7 / 10

✅ lint/typecheck · ✅ tests verts, **aucun skip** (188 fichiers ; 1825 + 1178 + 646 + 212) · ✅ **couverture
mesurée, et D-4 est arbitré** (`ecrans/**` reste hors seuil — « la DoD ne se tait pas sur les écrans, elle
les soumet à autre chose ») · ❌ **migrations up/down sur staging** (`grep migrate deploy-staging.yml` →
rien) · ✅ 4 états · ✅ axe-core (table engendrée depuis `VUES`, 12/12, 4 vues **réseau coupé**,
anti-vacuité) · ⚠️ **`@filrouge` non allongé du segment L5 — 6ᵉ incrément** (une ligne de commentaire
dans `socle.e2e.ts:13-15`) · ❌ **README `apps/field` — 5ᵉ passage** : son tableau « Ce qui n'est PAS dans
`main` » liste **trois éléments qui y sont depuis** · ✅ aucun TODO orphelin · ✅ diff schéma-vs-04.

---

## 4. Les 8 invariants — **8 / 8**

**L'invariant 5 est FERMÉ, vérifié au code et non sur la fiche A29** : `session/fuseau.ts` porte une
signature **`fuseau: string | null` REQUISE** — le chemin `undefined → fuseau de l'appareil` **n'existe
plus ni dans le type ni dans le code** ; repli unique = **UTC nommé** ; `fuseauConnu()` protège d'une
`RangeError` sur l'écran de **restauration** lui-même. Les deux appelants qui portaient l'écart sont
corrigés. Garde **non vacuous** : C1 (aucun `undefined`), C2 (aucun écran ne formate seul), C3 (**liste
close** de modules autorisés), plus un test qui vérifie que le harnais lit bien > 40 sources.

Invariant 1 : `grep uuidv7` sur les migrations → **trois commentaires qui rappellent l'interdiction**,
aucune fonction SQL. Invariant 4 : re-mesuré sur les deux fronts, hors tests et `tokens.css` → **vide**.
Invariant 7 : un écart **connu et écrit** (M8, `valideeLe` remis à `null` au déverrouillage) — rien de
silencieux. **Invariant 8 : le mieux servi du jour** — l'alerte a enfin sa donnée, le rappel compte les
jours au fuseau de la mission.

**Interdictions 11 §2 : aucune infraction.**

---

## 5. Traçabilité — les deux sens

**Sens 2, anti-orphelin : aucun orphelin.** Balayage exhaustif fait par A02 lui-même — *le garde ne voit
pas le code orphelin, il le dit lui-même*. Deux barils de ré-export sans citation (acceptés), une
citation implicite dans `scoring/entree.ts` (porte L8, hors P-C), et **les six entrées de code neuves
depuis le 07 sont toutes rattachées**. **Aucune route, table, écran ou job neuf** entre `8e70f39` et
`5ac6f95`.

**Sens 1** : **E32 fermé** (c'est le gain du jour) · E33 renforcé (CSP fermée sur staging) · E38 : la
moitié « export » et l'alerte complète · **E45 : NB-15** · **E36/E43 de nouveau en recul** (NB-9-ter).

---

## 6. Réserves — le compte exact

### Bloquantes : **2**

**NB-3-bis (ZAP) — objectivée.** Elle n'est plus « le run TLS n'a pas eu lieu » mais **« le run TLS a eu
lieu et rend 2/2/2 »**. Progrès de connaissance, blocage plus dur : la bascule n'est pas *prudemment*
différée, elle est **mesurément impossible** sans toucher à la politique de cache que 05 §31 prescrit.

**NB-9-ter (matrice) — neuve, héritière de NB-9-bis.** NB-9-bis est **bien fermée** (126 titres, 126
uniques, `uniq -d` vide). Mais le dernier titre est **O.14 — 2026-09-08** : **L5d, L5e et l'incrément
sécurité n'y sont pas.** Trois incréments de retard, **dont celui qui ferme un invariant**. A02 :
*« je ne signe pas “matrice à jour” sur un instrument en retard — un instrument en retard ne se contente
pas de ne rien dire, il rassure. »* Fermeture = une passe documentaire, **zéro code**.

### Fermées depuis le 08 : **5** — B3-bis · NB-8 (la ligne L5a existe) · NB-9-bis · NB-14 (le journal va du
04 au 08, chacun avec son burn-down) · NB-12. La fiche M10 existe.

### Ouvertes, non bloquantes : **8**

**NB-15 (neuve, ÉCART NON DOCUMENTÉ)** — §34.2 exige un **compteur d'à-revoir cliquable par mission** ;
il est du texte inerte, et l'alerte ne porte **aucune action**. Ni `DECISIONS.md`, ni `AMELIORATIONS.md`.
**Bloque la coche ferme du critère 1.**

**NB-16 (neuve)** — **R8, R10, R11 « à dater » ne sont dans aucun registre** (`grep` → vide), dont
**R11 : repli SPA sur `/assets/*` = 200 + `immutable` un an sur du HTML**. Or A01 a lui-même posé le
critère : « le reste est **daté et assigné** — pas oublié, pas fait ».

**NB-17 (neuve)** — `.zap/rules.tsv` affirme que `10015` ne voit **pas** le JSON de l'API : **contredit
par le run staging** (il signale nommément `/api` et `/api/v1/health`). La condition (5) n'en est pas
fragilisée — le détecteur nommé voit **plus** que promis — mais **une justification d'exception porte une
affirmation contredite par le premier run réel qui l'exerce**. Et le fichier déplace la bascule « à L6c »
**sans entrée `DECISIONS.md`** : une échéance ne se déplace pas par un commentaire.

**NB-18 (neuve, mineure)** — `AMELIORATIONS.md:2587` est titrée « PROPOSÉE, NON IMPLÉMENTÉE » alors que
L5e l'a livrée : **le registre dit le faux**.

Plus NB-4 (chaîne photo sans appelant), NB-5 (`@filrouge`), NB-11 (réserves A29 dont M3, M8), NB-13
(21 doublons dans `DECISIONS.md`, D-7 non implémenté).

---

## 7. Les cinq questions, tranchées

**1. Le critère 1 est-il ferme ?** **Non — mais il n'est plus « non tenu ».** Et l'absence d'écrivain de
production pour la clé est **conforme** : le port est inerte par décision, la seule phrase honnête est
« jamais synchronisée depuis cet appareil », et le contrat de l'écrivain est **inscrit nommément pour
L6a**. Ce qui empêche le ferme : NB-15 et la démo.

**2. Le critère 6 ?** **Strictement inchangé**, et aggravé d'un cran de forme : les deux GO SOUS RÉSERVE
portent sur un arbre antérieur à trois incréments qui ont touché des écrans.

**3. L'invariant 5 ?** **Fermé, vérifié au code.** 8/8.

**4. NB-3-bis ?** **Bloquante, nature changée** (§1).

**5. D-8 — l'échéance ou la séquence ?** **A01 n'a pas tranché, et il a écrit deux fois qu'il ne le
ferait pas.** Il a même posé la doctrine qui rend la question **non arbitrable par lui** : *« A01 peut
trancher ce qu'un critère veut dire ; il ne peut pas trancher où il se coche. »* **Donc : à Williams**, et
le run de ce matin lui donne la matière. Les trois issues, chiffrées :

- **(a)** reculer l'échéance de la bascule à P-D/L6c — la position déjà écrite dans `.zap/rules.tsv`,
  qu'il faut alors **acter dans `DECISIONS.md`** ;
- **(b)** passer l'HTML à `no-store, no-cache, must-revalidate` pour éteindre `10015` — **contredit
  05 §31** (le `no-cache` + ETag est délibéré, et c'est le service worker qui sert hors ligne) ;
- **(c)** ajouter une ligne `10015` à `rules.tsv` — **interdit par la condition (2)** d'A01, puisqu'un
  changement du produit la fermerait.

*A02 ne recommande pas ; il constate que **(b) et (c) sont fermées par des écrits existants**.*

---

## 8. Ce qui reste entre P-C et sa signature

### A. Code ou documentation

| # | Objet | Qui | Coût |
| --- | --- | --- | --- |
| 1 | **NB-15** : rendre le compteur d'à-revoir cliquable — **ou** l'inscrire au registre. Sans l'un des deux, le critère 1 ne se coche pas ferme | A22/A23 + test par un autre | ~0,05 j |
| 2 | **README `apps/field`** — 5ᵉ passage | A20/A55 | ~0,1 j |
| 3 | **Matrice** : ajouter L5d, L5e, sécurité (NB-9-ter) | A02 | ~0,2 j |
| 4 | **`@filrouge` allongé du segment L5** — 6ᵉ incrément | A20/A26 | — |
| 5 | **NB-16** : dater et assigner R8/R10/R11 | A11 + A01 | ~0,1 j |
| 6 | **NB-17** : rectifier `rules.tsv` sur la foi du run staging | A51/A11 | ~0,05 j |
| 7 | Publication observée non bloquante d'`ecrans/**` (décidée le 09, non livrée) | A52 | ~0,1 j |
| 8 | **NB-18** : requalifier la fiche « jour civil » | A55 | trivial |
| 9 | **Mesure A28 p95 sur `jitless`**, derrière Caddy — **due avant signature** | A28 | ~0,1 j |
| 10 | 21 doublons `DECISIONS.md` + garde D-7 | A52 | — |
| 11 | `docs/ETAT.md` : dernier bloc périmé | pilote | trivial |

### B. À la main de WILLIAMS

1. **La séance matérielle, en une fois** — iPad physique (mode avion réel, cold start police, **sous
   `require-corp`**), coupure de **courant**, 2ᵉ appareil, session de **45 min**, démo **écran partagé**,
   les trois lignes de `LOT_L5.md` §4, **R-9/R-13 sous les yeux** → **7 des 8 critères**.
2. **Le novice humain au chronomètre**, sur l'arbre de la porte → le critère 6.
3. **D-8 : trancher l'échéance de `ZAP_BLOQUANT`**, avec la mesure staging du 09 (2/2/2, `10015` seul)
   → NB-3-bis ②.
4. **Migrations up/down sur staging** → DoD ligne 4.
5. **Compte auditeur de test sur staging** + son secret.
6. **Trois arbitrages produit** (pastille · M8 · mot de passe d'export), plus M10 et la fiche « jour
   civil » à marquer ABSORBÉE.
7. **Acceptation écrite du risque `require-corp` sur iPadOS**, ou son épreuve à la séance.

---

## 9. Ce qu'A02 n'a PAS vérifié

Suite complète non rejouée (Node local v24 hors contrat) — appui sur la CI de `5ac6f95` **lue job par
job** et sur onze gardes exécutées · aucun navigateur ouvert · aucun scan relancé (le run CI **lu** et son
artefact **dépouillé**) · **`require-corp` sur iPad : jamais tourné, par personne** · **mesure A28 : non
faite** · le contenu de #108/#109/#112 relu **aux points cités**, pas ligne à ligne.
**Ce dossier ne remplace ni la démo, ni la recette novice, ni la séance matérielle.**

---

```
Signature CONFORMITÉ : A02 — 2026-09-09.
A02 NE SIGNE PAS « traçabilité à jour » : NB-9-ter, trois incréments de retard,
dont celui qui ferme l'invariant 5.
Verdict : CONFORME SOUS RÉSERVE — P-C NON FRANCHISSABLE.
Bloquantes : 2 · ouvertes : 8 · fermées depuis le 08 : 5.
Écart non documenté : 1 (NB-15) — motif de veto constaté, veto non prononcé.
Artefact ZAP au dossier : run 34310906935, job 102340437347, rapport-zap-34310906935.
```
