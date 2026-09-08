# RECOCHE A02 — critère n° 6 de P-C (« test novice < 30 min ») — 2026-09-08

> **Objet strictement borné** : recoche d'**un** critère du dossier `CONTROLE_A02_PC_2026-09-07.md`,
> signalé caduc par A01 en tranchant D-6 (#102), plus la remise à jour du compte de P-C. **A02 ne
> rejoue pas la porte** (09 §4bis exige que le rejeu intégral vienne après les correctifs).
> **Gardien A02, lecture seule** — aucun fichier du dépôt écrit ; transcription par le pilote.
> **Arbre mesuré** : `origin/main` = `803f0b4` (#103), CI run `34270768247` **success, 21 jobs / 21**.
> Instruments exécutés par A02 : `check:no-skipped-tests` (181 fichiers, RC=0) · `check:invariants` ·
> `check:graphe-modules` (237 modules) · `check:tracabilite` (**1 256 citations / 552 fichiers, aucune
> incohérence**) · `check:decisions` (avertissement connu) · `check:prose`.

---

## 1. VERDICT SUR LE CRITÈRE N° 6

> ## 🟢 CADUC — le bloquant B3-bis est LEVÉ
>
> Le critère disait : « la recette n'a pas été rejouée » et « **le seul verdict A54 au dossier reste un
> NO-GO** ». **Les deux propositions sont fausses — la seconde l'était déjà quand elle a été écrite.**
>
> Il passe de **❌ NON TENU, BLOQUANT** à **⚠️ avancé, sous réserve matérielle** — même classe que les
> critères 2, 4, 5, 7 et 8. **Il ne passe PAS à ✅ ferme** : le verdict A54 est GO **SOUS RÉSERVE**, et
> A54 écrit lui-même que « < 30 min sans aide » est **NON CERTIFIÉ**.

### 1.1 La mesure

```
git log --diff-filter=A -- docs/portes/RECETTE_NOVICE_L5_2026-09-07_REJEU.md
→ 912a9b4  2026-09-08 10:50  L5b — les ancres de cotation se lisent AVANT la cotation … (#97)
git log --diff-filter=A -- docs/portes/RECETTE_NOVICE_L5_2026-09-07.md
→ e6dc7d1  2026-09-07 19:42  docs(porte): P-C rejouee EN ENTIER … (#96)   ← LE MÊME COMMIT que CONTROLE_A02_PC
```

**Deux rejeux intégraux existent au dossier**, tous deux postérieurs au NO-GO du 06 :

| Rejeu | Base | Verdict | Périmètre déclaré |
| --- | --- | --- | --- |
| `RECETTE_NOVICE_L5_2026-09-07.md` | `main` `8e70f39` | **GO SOUS RÉSERVE** (R1 bloquant) | parcours complet, grille §33, journée §33.7 |
| `RECETTE_NOVICE_L5_2026-09-07_REJEU.md` | `lot/l5b-ancres` `ef2dea0` | **GO SOUS RÉSERVE** (R1 fermé, N1 neuf) | parcours complet, six sections de la grille, quatre critères §33.7, invariants 4-5, B1..B6 — « y compris tout ce qui était vert il y a trois heures » |

09 §4bis (« la porte se rejoue EN ENTIER ») est **satisfait deux fois**.

### 1.2 La cause méthodologique de l'erreur — pour qu'elle ne se répète pas

La preuve d'A02 était `git log --since=2026-09-06 -- docs/portes/`. Exacte contre l'historique **commité
à l'instant du lancement**, fausse **sur le fait** : le rapport A54 était déposé, non commité, dans le
même arbre, et **il est entré dans git par le commit d'A02 lui-même**.

**C'est structurel** : la convention veut que l'agent dépose et que **le pilote commite**. `git log`
est donc **systématiquement en retard** sur la classe même de documents qui sert de preuve. L'instrument
juste est le système de fichiers **plus** la signature du document ; git n'établit que l'antériorité.
**Règle de méthode, pas excuse.**

### 1.3 Ce qui reste dû pour passer de « GO sous réserve » à « GO »

**Un seul geste, nommé par A54** : « le novice humain au chronomètre » — « mon chronomètre ne vaut rien
sur ce critère-là, **et je refuse de le maquiller** ».

| Point matériel A54 | Condition **du critère 6** ? | Rattachement réel |
| --- | --- | --- |
| **Novice humain au chronomètre** | **OUI — son instrument de mesure** | critère 07 n° 6 (« < 30 min ») |
| iPad physique | non | critères 07 n° 2 et 8 ; ligne P-C (« iPad ET desktop ») |
| Mode avion réel | non | critères 07 n° 2 et 8 |
| Session de 45 min | non | ligne P-C, §33.7 |

**Un sur quatre conditionne le critère 6** ; les trois autres conditionnent la porte et se comptent
ailleurs. Recommandation (non exigée) : que le novice joue **sur l'iPad physique** — N1 est né d'une
mesure au pixel sur une émulation.

**Réserve de forme, mineure** : le critère dit « guidé strict ». Le mot n'apparaît dans aucun des deux
rapports A54. Vrai par construction (`auditeur.ts:38` : `PROFIL_PAR_DEFAUT = 'guide_strict'`), mais
**déduit par A02, pas déclaré par A54**. À faire dire au prochain rapport.

---

## 2. LES RÉSERVES A54 ENCORE OUVERTES — avec la preuve du jour

| Réserve | État | Preuve |
| --- | --- | --- |
| **R1** ancres illisibles avant cotation | **FERMÉE** | #97 dans `main` ; fermée à l'écran par A54 ; recoche A02 du 07 (E2E vert, rouge sur mutation) |
| **N1** 4 ancres sur 5 sous la ligne, iPad paysage | **FERMÉE** | #101 dans `main`, CI verte ; instrument `champ-de-vision.ts` ; garde `hors-ligne-l5.e2e.ts:827`, quatre combinaisons ; revue A29 deux passes. **Résidu** : R-9 (marge d'une rangée) et R-13 (Suivant à 92 px) → **à regarder sur iPad réel** |
| **N2** la garde ne distinguait pas « rendu » de « regardable » | **FERMÉE** | même instrument + deux arbitrages A01 dans `main`. **Le doute n° 1 d'A54 est tranché** |
| **R2** invariant 5 (ISO brut, UUID, fuseau appareil) | **OUVERTE sur `main`** | correctif sur `lot/l5d-invariant5` — **5 commits, non poussée au moment de la mesure** _(poussée depuis, `2cb7238`)_ |
| **R3** M8, deux vues « Aujourd'hui » | **OUVERTE** | aucune entrée `DECISIONS.md`. **Doute produit → Williams** |
| **R4** M10, verrou 15 min sur session non démarrée | **OUVERTE, 4ᵉ signalement** | `grep "M10\|verrou\|15 min" AMELIORATIONS.md` → **aucune fiche** |
| **R5 · R6 · R7** vocabulaire, « avant de terminer », aide `?` | **OUVERTES — non-implémentation CONFORME** | étage 1 gelé par 09 §4bis |
| **R8** M4, pas de « dernier succès » de sync | **OUVERTE, REQUALIFIÉE** | A54 la classait « non actionnable avant L6a ». **D-6 la contredit, mesure à l'appui** : `port-sync.ts:164` rend `null` en dur, prop `derniereSync` jamais passée. **Trou L5, corrigeable sans L6 — c'est elle qui tient le critère n° 1** |
| **4 points matériels** | **TOUS DUS** | iPad · mode avion réel · 45 min · novice au chronomètre |

**Bilan** : 12 constats du rejeu — **3 fermés**, **6 ouverts** dont 1 requalifiée, **3 conformes au gel**,
**4 matériels dus**.

---

## 3. LA TABLE P-C REFAITE — 2026-09-08

### 3.1 Les 8 critères du fichier 07, ligne L5

| # | Critère | 07/09 | **08/09** | Preuve / manque |
| --- | --- | --- | --- | --- |
| **1** | Écran « Aujourd'hui » §34.2 (agenda, à-revoir, **sync par mission**) | ❌ + D-6 | ❌ **NON TENU — mais LISIBLE** | **D-6 tranché (#102)** : afficher l'état, pas synchroniser. **2 données sur 3 sont là et 100 % locales** (pastille `EcranAujourdhui:385`, outbox vraie `jour.ts:195`). **La 3ᵉ manque** : dernier succès jamais alimenté. **Le motif a changé de nature — de « incochable avant L6b » à « trou L5 corrigeable maintenant »** |
| 2 | Mode avion complet iPad ET PC | ⚠️ | ⚠️ inchangé | `hors-ligne-l5.e2e.ts:215`, job e2e vert. **Dû** : iPad physique |
| **3** | 1 session de chaque type hors ligne | ✅ | ✅ **ferme, confirmé** | `:289`, six types, vert en CI |
| 4 | Coupure de courant = zéro perte | ⚠️ | ⚠️ inchangé | `:370`. **Dû** : l'alimentation arrachée |
| 5 | Export créé puis restauré sur un 2ᵉ appareil | ⚠️ | ⚠️ inchangé | `:471`. **Dû** : 2ᵉ appareil physique |
| **6** | **Test novice < 30 min** | ❌ **BLOQUANT** | ⚠️ **AVANCÉ — bloquant levé** | **Deux rejeux intégraux, deux GO SOUS RÉSERVE. Dû** : le novice au chronomètre |
| 7 | Écran partagé démontré | ⚠️ | ⚠️ **renforcé** | joué par A54 dans un Chromium réel, deux orientations. **Dû** : la démo devant témoin |
| 8 | Police rendue en mode avion | ⚠️ | ⚠️ **renforcé** | A54 : rechargement réseau coupé → `Inter Variable loaded`, zéro requête externe. **Dû** : cold start iPadOS |

> ### BILAN : **1 ferme (n° 3) · 6 sous réserve matérielle (2, 4, 5, 6, 7, 8) · 1 non tenu (n° 1).**
> Contre 1 / 5 / 2 le 07, et 0 / 4 / 4 le 06. **Le mouvement du jour est entièrement dans le n° 6**, et il
> vient d'une recoche, pas d'un correctif.

### 3.2 Exigences propres à la ligne P-C (09 §4 + §33.7)

Grille §33 : 4 états — ✅ 12/12 (aucune vue neuve) · **« ancres visibles » — désormais COCHÉ par les
deux bouts** (R1 lisibles avant le tap ET N1 co-visibles, quatre combinaisons) · session planifiée
en 1 tap — ✅ joué · **aucun verrou en 45 min — ⚠️ non joué**, D-3/M10 ouverte sans fiche, 4ᵉ
signalement · « Fin de journée » en un geste — ✅ avec réserve inchangée (le mot de passe d'export en
fait deux) · Terminer → note → Valider groupé — ✅ joué.

### 3.3 DoD transverse — **7 / 10, inchangé**

| # | Ligne | État | Preuve |
| --- | --- | --- | --- |
| 1 | lint + typecheck | ✅ | jobs verts sur `803f0b4` |
| 2 | tests verts, aucun skip | ✅ | 21/21 ; `check:no-skipped-tests` RC=0, 181 fichiers |
| 3 | couverture ≥ 90 % critiques | ✅ réserve inchangée | **`ecrans/**` toujours hors `coverage-critical-paths.json`** ; `EcranFinDeSession` à **66,05 l. / 30,00 f.** ; **D-4 sans arbitrage depuis le 03** |
| 4 | migrations up/down **sur staging** | ❌ | `grep migrate deploy-staging.yml` → rien |
| 5 | 4 états par écran | ✅ | 12/12 |
| 6 | axe-core vert | ✅ | job e2e ; A54 a exécuté axe 12/12 |
| 7 | `@filrouge` FIL-TPE et FIL-GC | ⚠️ partielle, 5ᵉ incrément | vert, **non allongé du segment L5** — une ligne de commentaire dans `socle.e2e.ts:13` |
| 8 | README à jour | ❌ **4ᵉ passage** | `apps/field/README.md:12` « État au lot L5b » ; `:31` « PAS encore livré — c'est L5c » — livré depuis le 06 |
| 9 | aucun TODO/FIXME orphelin | ✅ | grep vide |
| 10 | diff schéma-vs-04 | ✅ | job vert |

### 3.4 Invariants — **7 tenus + 1 écart documenté (n° 5)**

Invariant 5 : `EcranFinDeJournee:333`, `EcranRestauration:360,364` — **inchangé sur `main`**, correctif sur
`lot/l5d-invariant5`. Invariant 8 : tenu et testé, **mais `agenda/jour.ts:252-253` compare des jours
civils en UTC** — A01 le classe « à corriger MAINTENANT » (instrument de l'invariant 8) ; **non corrigé**
au moment de la mesure. Interdictions 11 §2 : **aucune infraction**.

### 3.5 Traçabilité — sens 2 : **aucun orphelin** (1 256 citations / 552 fichiers). Sens 1 : E23 passe de
« non mesurée » à « **mesurée deux fois, non certifiée** » ; E44 gagne la co-visibilité ; E45 tenue en
arrière par le dernier succès ; **E36/E43 restent en recul** (§4).

---

## 4. RÉSERVES BLOQUANTES : **3 → 2**

| # | État | Motif |
| --- | --- | --- |
| **B3-bis** recette non rejouée | **FERMÉE** | §1 |
| **NB-3-bis** ZAP | **TOUJOURS BLOQUANTE, nature changée** | ① le décompte est LU (#103) : `FAIL-NEW 0 · WARN-NEW 7`, zéro faille. ② `ZAP_BLOQUANT` reste `'false'`, et **basculer aujourd'hui rendrait `main` rouge — quatre familles inguérissables**. **Tension à trancher** : l'arbitrage du 05 dit « P-C coche deux choses » ; A51 démontre que la seconde n'est pas atteignable à P-C sans la pile (a) et un run à 0/0/0 → **D-8** |
| **NB-9-bis** matrice de traçabilité | **TOUJOURS BLOQUANTE, aggravée** | `TRACABILITE_E1-E47.md` : **16 titres dupliqués**, dernier titre `N.5 — 2026-09-03`. **Six incréments de retard** (L5c, L5b/R1, N1, L7b, L7c, L8, P-C). Elle porte E36 et E43 |

Ouvertes non bloquantes, re-mesurées inchangées : D-4 · NB-4 (`compresserPhoto` sans consommateur) ·
NB-5 · NB-8 (**L5a sans ligne au compteur `AMELIORATIONS`**) · NB-11 · NB-12 · NB-13 (**21 titres
dupliqués dans `DECISIONS.md`**) · NB-14 (**`docs/journal/` s'arrête au 03 — cinq journées manquent**,
P-DESCOPE est au 15).

---

## 5. CE QUI RESTE ENTRE P-C ET SA SIGNATURE

### A. Du CODE — et à qui

| # | Objet | Qui |
| --- | --- | --- |
| 1 | **Alimenter le « dernier succès » de sync** — bornes déjà écrites par A01 dans D-6 | A20/A23, test par un autre (L5e) |
| 2 | **Invariant 5 (R2)** : pousser, revue A29 en fichier, PR, CI | A22/A24/A26 + A29 (L5d) |
| 3 | **Rappel de fin de journée au fuseau de mission** — arbitré « maintenant » | A20 (L5e) |
| 4 | **Rectifier le commentaire d'`app.ts:82-84`** — arbitré « maintenant, le commentaire seul » | A13/A51 |
| 5 | **README `apps/field`** — 4ᵉ passage | A20/A55 |
| 6 | **`@filrouge` allongé du segment L5** — 5ᵉ incrément | A20/A26 |
| 7 | **Dédoublonner et rattraper `TRACABILITE_E1-E47.md`** (16 doublons, 6 incréments) + `DECISIONS.md` (21) + **garde d'unicité (D-7)** | A01/A02 |
| 8 | **Rouvrir `docs/journal/`** (5 journées) + burn-down, avant P-DESCOPE | A01/A55 |
| 9 | **ZAP pile (a)** + `.zap/rules.tsv` (revue croisée) + run `workflow_dispatch` à 0/0/0 | A11 + A51 + A17 |
| 10 | **Arbitrer D-4**, puis remonter `EcranFinDeSession` de 66 % à > 90 % | A01, puis A26/A27 |
| 11 | **Fiche `AMELIORATIONS` M10** (4ᵉ demande) + **ligne L5a du compteur** | A20 |
| 12 | **Fusionner les 7 arbitrages** (#104) | pilote |

### B. À la main de WILLIAMS — rien de tout cela n'est faisable par un agent

| # | Geste | Débloque |
| --- | --- | --- |
| 1 | **La séance matérielle, en une fois** : iPad physique + mode avion réel · coupure de courant · 2ᵉ appareil · session de 45 min · démo écran partagé · les 3 lignes de `LOT_L5.md` §4 · R-9/R-13 sous les yeux | **7 des 8 critères** |
| 2 | **Le novice humain au chronomètre** | le critère 6, de GO SOUS RÉSERVE à GO |
| 3 | **Le compte auditeur de test sur staging** + son secret | ZAP authentifié (sans lui, `httpOnly`/`Secure`/`SameSite` sont comptés PASS **faute d'avoir vu un cookie**) + le segment amont du parcours |
| 4 | **Migrations up/down sur staging** (`--down-to 0` est destructif) | DoD ligne 4 |
| 5 | **Bascule `ZAP_BLOQUANT='true'` + épinglage du digest, même commit** — après la pile (a) et un run à 0/0/0 | NB-3-bis ② |
| 6 | **Trois arbitrages produit** : libellé de la pastille de sync · M8 (deux vues « Aujourd'hui ») · « Fin de journée en un geste » vs mot de passe d'export | trois réserves A54 |

---

## 6. DOUTES DE SPÉCIFICATION — `DECISIONS.md`, pas à deviner

- **D-8 (neuf — deux écrits se contredisent)** : l'arbitrage du **05** exige que P-C coche « la couverture
  étendue **puis** `ZAP_BLOQUANT='true'` » ; le dossier A51 du **08** démontre que cette bascule à P-C
  rendrait `main` rouge et suppose d'abord la pile (a), un fichier de règles et un run à 0/0/0.
  **Lequel cède : l'échéance ou la séquence ?** A02 ne tranche pas un critère de porte. **A01, ou Williams.**
- **D-3** (4ᵉ signalement) — verrou 15 min sur session ouverte non `en_cours`. **A01.**
- **D-4** (sans arbitrage depuis le 03) — `ecrans/**` au seuil ? **A01.**
- **D-2, D-5, D-7** — inchangés. **A01.**
- **Doute de méthode, porté par A02 contre lui-même** : `git log` sur `docs/portes/` est un instrument
  **faux** pour établir l'existence d'un document de porte (§1.2). Faut-il une convention de dépôt qui
  rende la preuve lisible sans dépendre du commit du pilote ? Posé, non exigé.

---

## 7. Ce qu'A02 n'a pas vérifié

Suite complète et navigateur non rejoués (verts = CI de `803f0b4` + sept gardes) · couverture
d'`EcranFinDeSession` établie **par construction** (aucun fichier de `ecrans/journee/` au diff) ·
contenu de `lot/l5d-invariant5` non relu ligne à ligne · aucun scan ZAP rejoué · **ce document ne
rejoue pas la porte**.

---

## 8. VERDICT

> ### Critère n° 6 : **CADUC — B3-bis LEVÉ.** Reclassé « avancé, sous réserve matérielle ». Reste dû : le
> novice humain au chronomètre, et lui seul.
>
> ### P-C au 2026-09-08 : **CONFORME SOUS RÉSERVE — TOUJOURS NON FRANCHISSABLE.**
> **1 ferme · 6 sous réserve matérielle · 1 non tenu (n° 1)** · DoD **7/10** · Invariants **7/8 + 1 écart
> documenté** · Traçabilité sens 2 : **aucun orphelin** · **Réserves bloquantes : 2** (NB-3-bis,
> NB-9-bis) au lieu de 3.
>
> **Écarts NON documentés : AUCUN. Le droit de veto ne s'exerce sur rien aujourd'hui.**

```
Signature conformité : A02 — 2026-09-08.
A02 ne signe toujours pas « traçabilité à jour » : NB-9-bis reste ouverte, six incréments de retard.
```
