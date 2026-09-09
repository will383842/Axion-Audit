# REVUE CROISÉE A29 — incrément SÉCURITÉ (en-têtes servis) — 2026-09-09

> **Étape 4/7 (09 §3).** Réviseur croisé front A29, **lecture seule** — transcription par le pilote, sans
> amendement. **Le premier incrément du dépôt qui touche la CSP servie.**
> **Périmètre** : `git diff origin/main...HEAD` — première passe sur `898e880` (5 commits, 13 fichiers,
> 1 340 insertions) ; rejeu sur `c02cb51` (10 commits). Quatre mains : A26 (garde), A11 (Caddyfile,
> `rules.tsv`), A52 (workflow), A21 (`jitless`). **Docker tourne** : tout a été mesuré, pas relu.

---

## VERDICT (première passe) : 🟡 APPROUVÉ AVEC RÉSERVES — 3 bloquantes, 8 à corriger, 3 remarques

## 1. Mesuré, pas relu

`pnpm build` rc=0 · **e2e 152/152** · `verify:rapide` rc=0 · **intégration 646/646, 0 skip** · ZAP local
3 cibles **0/0/0, IGNORE 4, PASS 66** · mutation Caddyfile (HSTS retiré + COEP `credentialless` +
`'unsafe-inline'`) → **14 rouges / 61** — la garde mord · sonde `new Function` : 0 / 1 / 2 sans pose,
**0** avec `jitless`.

## 2. Les dix questions du mandat

**A. La garde lit ce que Caddy sert — OUI, vérifié.** `app.inject` rejoué sur la configuration helmet
d'`app.ts` : **12 en-têtes identiques octet pour octet** à `amont-api-factice.caddy`. Le harnais n'est
pas conditionnel : Docker absent = 61 échecs, jamais un skip ; `AXION_CADDYFILE_EPROUVE` refusé dès
que `CI` est posé. La garde tourne en CI (`ci.yml:921-936`, `ubuntu-latest`, Docker natif).

**B. La CSP cible tient — et le trou que le mandat cherchait est fermé par une autre voie.**
`style-src 'self'` servi sur les 4 fronts. Le parcours de la sonde est étroit (`preparerAppareilNeuf`
seul : restauration, export, photo jamais parcourus). **Mais chaque front est bâti en un seul chunk** :
le balayage du **bundle construit** — donc de tous les écrans, visités ou non — rend
`createElement("style")=0 · cssText=0 · insertRule=0 · adoptedStyleSheets=0`. **Condition durable** : le
jour où le découpage de code arrive, ce balayage cesse de couvrir les écrans non visités — c'est ce
jour-là qu'il faut élargir le parcours.

**C. L'encadré réécrit tient sur les trois exigences d'A01 — sauf une phrase fausse (R4).**
« Sans requête, pas de nonce » — non : hors ligne, la Cache Storage rejoue la **Response entière,
en-têtes compris**. Un nonce précaché **existe** et **correspond**. Le vrai motif, plus fort : ce nonce
serait **CONSTANT** — `'unsafe-inline'` avec des étapes en plus. Ça compte parce que cet encadré est la
consigne durable à qui installera shadcn.

**D. COEP `require-corp` — le motif est juste ; la preuve « sur l'iPad » n'existe pas.** Vérifié
documentairement (MDN, spec HTML) : `credentialless` non pris en charge par WebKit → retombe sur
`unsafe-none`. `require-corp` compris des trois moteurs depuis Safari 15.2. **Aucune ressource
cross-origin, précache compris** : manifeste du SW extrait, 10 entrées toutes same-origin. Corroboré par
ZAP : 90004 passe de FAIL à **PASS**. **Jamais tourné sur l'iPad de référence** → checklist manuelle 07 §15.

**E. `Cache-Control: no-cache` sur l'HTML — le matcher est juste ; il découvre un quatrième cas (R6).**
Les deux `index.html` couverts, le SW non cassé. **Mais `/apple-touch-icon.png` et `/icones/*` :
AUCUN en-tête** — l'exclusion du matcher les retire du `no-cache` sans rien leur donner. §31 énonce
trois familles ; il y en a quatre.

**F. `.zap/rules.tsv` — RÉSERVE BLOQUANTE sur une ligne, mesurée (R1).** Conditions (1), (3), (4) tenues.
**Condition (2)** : `10049` absorbe **9 instances** dont **5 ne relèvent d'aucune des trois familles
nommées** — les icônes (sans `Cache-Control`) et **`/api/v1*`, c'est-à-dire §4-B, daté et assigné à
A13/L6/P-D**. « Au L6c, sous `ZAP_BLOQUANT='true'`, `10049` se déclenchera sur les routes
authentifiées et sera avalée en silence. C'est F-31 à retardement. » **Ligne refusée.**

Sur le veto signalé par A52 : la garde de forme est **juste**, sa portée **sous-déclarée** (elle rougit
la CI de `main` après chaque merge, pas seulement la nightly — `ci.yml:1686` → `deploy-staging` →
`workflow_call`), et le premier rouge tombe le **2026-10-09**, pas le 08 (comparaison stricte).

**G. Le workflow — rien ne bascule en douce.** `ZAP_BLOQUANT: 'false'`, `ZAP_IMAGE: :stable` inchangés.
L'étape de forme ne peut pas rougir sur un fichier valide (rejouée : `OK 4 lignes`). Le `jq` du résumé
fonctionne sur un vrai rapport (`.pluginid` est une chaîne).

**H. `jitless` — exact dans le détail.** `schemas.js:970-972` : `allowsEval.value` lu à la
**construction**, A21 a raison. Ordre dans les bundles reproduit au caractère près. API et worker
n'importent pas le sous-chemin. **La mesure A28 est due avant la PORTE, pas avant la PR** : sous la
CSP servie, `allowsEval` valait déjà `false` — la voie compilée était **déjà inatteignable en
production**. `jitless` ne retire rien derrière Caddy. **Protocole imposé à A28** : mesurer **derrière
Caddy**, pas sur `vite preview` (aucun en-tête), sinon une régression que la production n'a jamais eue
escaladerait à tort vers Williams.

**I. Les pages d'erreur — mesuré, un lot (R10).** `GET /icones/inexistante.png` → 404, `Server:
Caddy`, aucun HSTS/CSP/nosniff/COOP/COEP/CORP. La garde d'A26 **ne peut structurellement pas le
voir** (elle exige 200). Poser les en-têtes = comportement = lot ; **borner le commentaire** = maintenant.

**J. §5.6 — respecté sans exception.** Aucun commit ne mêle test et code testé.

## 3. Réserves

### BLOQUANTES
- **R1** `.zap/rules.tsv:51` — ligne `10049` refusée sur la condition (2), mesure à l'appui.
- **R2** `AMELIORATIONS.md` — aucune ligne étage 1 pour `jitless`. Précédent exact : R5 sur L5d.
- **R3** ordre de merge — l'entrée `jitless` n'existe que sur `docs/revue-l8` ; quatre fichiers de
  production la citent.

### À CORRIGER
- **R4** clause du nonce fausse · **R5** jumeau helmet maintenu à la main, sans garde — s'il dérive, le
  test §4-A passe à vide · **R6** icônes sans `Cache-Control` · **R7** `crossOriginIsolated` annoté,
  jamais asserté · **R8** portée de la garde de forme sous-déclarée, date du premier rouge décalée ·
  **R9 — invariant 1, trou de preuve** : `hors-ligne-l5` tourne contre `vite preview` (aucun en-tête),
  la garde tourne derrière Caddy mais **ne passe jamais hors ligne** — **aucun test ne prouve que la
  PWA démarre HORS LIGNE sous la CSP/COEP réellement servies** · **R10** `handle_errors` sans posture ·
  **R11 hors périmètre** : un asset empreinté **absent** rend `index.html` en **200 `text/html`
  `immutable` un an** — la panne §31 que `fronts.static.caddy` protège pour `sw.js` et pas pour `/assets/*`.

### REMARQUES
- **O1** `desactiverJitZod()` sans test unitaire · **O2** `/hq/service-worker.js` ni `@sw` ni exclu ·
  **O3** `_axsec` sans `.env` → `test:integration` 5 rouges / 51 skippés, environnemental (646/646 avec
  l'env) · **O4** `rules.tsv` sans numéro d'exigence.

## 4. Les 8 invariants

1 **OK avec R9** · 2 OK · 3 hors périmètre — **le scan passif ne couvre ni RBAC ni la propriété des
écritures ; la bascule ne coche pas le point 7 de P-C** · 4 OK · 5 OK · **6 OK** — `jitless` retire du
travail, coût de production nul · **7 OK, exemplaire** — la concession fermée **sans effacer sa trace**,
les commentaires de doctrine amendés, pas supprimés · 8 OK — COOP `same-origin` a un rayon de souffle
nul (aucun `window.open`).

**11 §2** : pas de CORS ✔ · aucune dépendance ajoutée (seul un sous-chemin `exports`) ✔ · **aucune
sécurité touchée autrement que spécifié** : chaque geste adossé à un arbitrage A01 nommément cité ✔.

## 5. Non vérifié

WebKit : établi **documentairement**, jamais mesuré — **`require-corp` n'a jamais tourné sur l'iPad** ·
`setAttribute('style')` via variable minifiée · le run TLS sur staging · p95 A28 · couverture des
modules critiques (aucun touché).

## 6. Désaccords à arbitrer par A01
1. **R1** — retrait ou bornage de `10049`. → _Tranché : voir §7._
2. **R10** — pages d'erreur : lot pour les en-têtes, maintenant pour le commentaire. → _Confirmé._

---

## 7. LA BOUCLE 10049 — trois passes, trois erreurs, un acquis

**A01 (a) : retirer.** Sur la mesure d'A29 — cinq instances sans `Cache-Control`. Et il demande qu'on
rejoue le scan après correctif : « le résidu est une question neuve, non couverte par cette entrée ».

**A11 rejoue** après le correctif icônes : **terrain=2 console=2 api=2, `10049 ×8` par cible**. La règle
est un **CLASSIFICATEUR** — Non-Storable / Storable & Cacheable / Storable but Non-Cacheable — chaque
réponse tombe dans l'une des trois, 308 compris. **Les icônes ont changé de colonne, pas quitté la
règle.** `/api/*` fera pareil après §4-B. **Aucun état du produit ne rend zéro.**

**A01 (b') : ré-admettre — et pas sur cette seule mesure.** Deux corroborations indépendantes dans le
dossier A51 du 08 : §4-B rangé sous **10015**, et « hors de portée du scan ». **Le scénario d'A29
n'existait pas** : la ligne ne pouvait rien avaler, ni aujourd'hui (elle classe, elle ne détecte pas
l'absence) ni demain (le scanner ne verra jamais les routes authentifiées). *« Son inquiétude était
juste ; son attribution était fausse. »*

**Et A11 mesure encore** : **10015 ne voit pas non plus le JSON de l'API** — PASS sur les trois cibles
avec `/api/v1*` sans `Cache-Control`. Donc **la garde du dépôt est le seul détecteur de §4-B**.

**Ce qui en sort — condition (5)** : _une ligne n'est admissible que si la classe de défaut qu'elle
pourrait masquer reste détectée ailleurs — autre règle active ou test du dépôt — et ce détecteur est
NOMMÉ dans la justification._ Et une règle de méthode : _une ligne ne s'admet ni ne se refuse sur un
rapport antérieur au correctif qu'elle discute_ — A51, A29 et A01 avaient tous raisonné sur des scans
d'avant.

**Le registre garde la marche** : l'entrée du retrait reste (#111), l'entrée de la ré-admission
s'ajoute. `rules.tsv` porte la marche a→b' dans son en-tête. Rien réécrit.

## 8. Suivi des réserves (tenu par le pilote)

| Réserve | Main | État | Preuve |
| --- | --- | --- | --- |
| **R1** | A01 → A11 | **REQUALIFIÉE puis FERMÉE** | `f457762` : `10049` ré-admise sur sa vraie justification, condition (5), détecteurs nommés (10015 + garde A26). §7 |
| **R2** | — | **FERMÉE** | #110 : ligne `AMELIORATIONS` `séc.` |
| **R3** | — | **FERMÉE** | #110 mergé avant cette PR |
| R4 | A11 | **FERMÉE** | `5a372b5` : « un nonce précaché serait CONSTANT » |
| R5 | A26 | **FERMÉE** | `81357ac` : `apps/api/src/en-tetes-amont-jumeau.test.ts`, deux sens, refus par défaut, `.caddy` seule source ; 4 mutations rouges |
| R6 | A11 + A26 | **FERMÉE** | `@icones no-cache`, jamais `immutable` ; 6 assertions présence + non-immutable |
| R7 | A26 | **FERMÉE** | 4 tests `.toBe(true)` + navigateur, copie sans COEP → 11 rouges |
| R8 | A52 | **OUVERTE — remarque** | non relancé ; portée à écrire, date 2026-10-09 |
| **R9** | A26 | **FERMÉE** | `81357ac` : en ligne puis **hors ligne**, `fromServiceWorker() === true`, CSP/COEP/COOP identiques, Argon2id sans réseau |
| R10 | A11 | **FERMÉE (commentaire)** — lot à dater pour les en-têtes | `5a372b5` |
| R11 | — | **à dater** | correctif en trois lignes par A11 : `handle` sans `try_files` pour `/assets/*` |
| Garde `Cache-Control` | A26 | **LIVRÉE** — `43ea02c` | 117 tests ; assets lus par `readdirSync` ; 4 tests §4-B « FAIT À CORRIGER À L6c » qui **rougissent** si `no-store` arrive (mutation 3) |
| O1 | A21 | ouverte | `desactiverJitZod()` sans test unitaire |

_(§9 : rejeu final A29 — à compléter à réception.)_

## 9. REJEU FINAL A29 — sur `c02cb51`, dix commits

> **Note de gouvernance, portée par A29 et due** : la table §8 ci-dessus a été pré-inscrite « FERMÉE »
> par le pilote **avant** le rejeu, sur la foi des rapports des agents. C'est le suivi du pilote, pas la
> signature d'A29. **La signature d'A29 est celle du présent §9, et elle ne porte que sur ce qu'il a
> mesuré.** Les états du §8 sont désormais **confirmés** par ce rejeu, réserve par réserve.

### VERDICT : 🟢 APPROUVÉ AVEC RÉSERVES — **0 bloquant** · 2 à corriger · 3 remarques → **PRÊT POUR LA PR**

**Les trois bloquantes de la première passe sont fermées sur des mesures refaites par A29.** Les deux
« à corriger » sont neufs, tiennent en une ligne, et **aucun n'est un défaut du produit servi**.

### R1 — levée, et l'inquiétude est TENUE par la garde, éprouvée

« Ce qui emporte ma conviction n'est pas la mesure `10049 ×8` seule — c'est la règle de méthode qui en
sort : _une ligne ne s'admet ni ne se refuse sur un rapport antérieur au correctif qu'elle discute_.
J'avais raisonné sur un scan d'avant. A51 aussi. A01 aussi. **Mon inquiétude était juste ; son
attribution était fausse**, et je le dis sans réserve. »

La troisième mutation d'A26, rejouée : `no-store` ajouté sur `/api/*` → **4 failed** — « porte
désormais "no-store" : c'est la correction attendue à L6c (§4-B). Réécrire ce test en attendu dans le
MÊME commit. » **C'est le signal d'inversion : la dette §4-B ne pourra pas être fermée en silence.** Et
`Origin-Agent-Cluster` est **absent de tout `infra/caddy/`**, posé par helmet seul — la réponse jugée est
bien celle de l'amont relayée. La garde ne se ment pas à elle-même.

### R4 — juste maintenant

« Un nonce précaché survit **et** perd sa propriété d'unicité, donc sa valeur défensive. La dernière
phrase — _qui constate qu'un nonce survit dans le cache ne tient pas un contre-exemple à cet encadré :
il tient ce qui l'exclut_ — répond nommément à ma réserve sans l'effacer. Invariant 7 sur un
commentaire de doctrine : exemplaire. »

### R5 — le jumeau, trois mutations rouges

`Referrer-Policy` changé → 1 rouge (« le `.caddy` suit `app.ts`, jamais l'inverse ») · ligne supprimée →
1 rouge (refus par défaut) · forme illisible → 2 rouges.

### R9 — le hors ligne est RÉEL, rejoué

Annotations extraites : CSP hors ligne **identique à l'octet près**, `COEP: require-corp`, six sondes
`ok`, `crossOriginIsolated: true` **dans les deux phases**. `expect(rechargee?.fromServiceWorker()).toBe(true)`
— assertion **dure**, non vacante. `couperLeReseau()` attend l'**activation** du worker, réapplique la
coupure après rechargement, et exige qu'un `fetch` réel **échoue**. Argon2id/WASM rejoué sans réseau.
« C'est le trou de preuve de l'invariant 1 que ma première passe avait ouvert, et il est refermé par
une mesure, pas par une affirmation. »

### La garde `Cache-Control` — cinq mutations, deux trous non vus

| Mutation (copie) | Mesuré |
| --- | --- |
| `no-store` ajouté sur `/api/*` | **4 failed** — signal d'inversion ✅ |
| `@icones` retiré | **12 failed** ✅ |
| `@icones` → `immutable` | **6 failed** ✅ |
| exclusion nue `/robots.txt` sur `@html` | **2 failed** ✅ |
| exclusion nue `/favicon.ico` (chemin **non nommé**) | ⚠️ **117 passed — trou non vu** |
| `@icones` restreint aux trois icônes testées | ⚠️ **117 passed — trou non vu** |

Vérifié par `curl` que les deux derniers créent un vrai défaut (`/icones/icone-maskable-512.png` →
200 **sans** `Cache-Control`). **Sur le Caddyfile du dépôt, le produit est correct** ; c'est la garde qui
a un angle mort.

### À CORRIGER (non bloquants, une ligne chacun)

1. **`.zap/rules.tsv`, ligne `10049`, col. 4** — décrit le détecteur nommé dans son état d'`e883faf`
   (« icônes seules », « n'a de détecteur que le test qui viendra ») alors que `c02cb51`, **même PR**, le
   porte à 21 chemins × 2 piles + 4 tests §4-B. Conservateur, mais **contradiction interne à la PR** sur
   « le seul détecteur de §4-B » — la dérive de jumeau que l'incrément a passé deux jours à fermer.
   → **FERMÉ** par A11 : la ligne nomme désormais toutes les familles de `CHEMINS_SERVIS` et les deux
   chemins d'API « fait à corriger », vérifiées contre le code de la garde, pas contre son message.
2. **`e2e/en-tetes-servis.e2e.ts:198`** — `ICONES_PWA` est **une liste écrite** qui omet
   `/icones/icone-maskable-512.png` (manifestée, précachée, servie). La doctrine du commit `c02cb51`
   lui-même : « une liste écrite serait verte par omission ». Les assets sont lus par `readdirSync` ; les
   icônes ne le sont pas. → A26, en cours.

### Remarques

- **Portée de la garde** : elle couvre les chemins qu'elle nomme — _elle couvre les familles connues,
  elle ne découvre pas les nouvelles_. À écrire au dossier de porte.
- **R8, maintenue et précisée** : la garde de forme de `rules.tsv` vit dans `zap-baseline.yml` seul —
  déclencheurs `workflow_call`, `workflow_dispatch`, `schedule` ; **ni `push` ni `pull_request`**. Une
  ligne malformée ou échue **merge au vert sur une PR** et ne rougit que la nightly ou un déploiement.
  Premier rouge attendu : **2026-10-09**. Le fichier qui décide de l'admissibilité d'une exception n'est
  contrôlé que par un job nocturne.
- **O1** : `desactiverJitZod()` sans test unitaire, toujours vrai.

### Exécution

`pnpm build` ✅ · `en-tetes-servis` **117/117** · **e2e entier 208/208** · jumeau 2/2 · `verify:rapide` ✅
(unit **1825**, interface **1178**) · `check:no-skipped-tests` **188 fichiers** · intégration **642 + 4
skippés + 1 rouge : ENVIRONNEMENTAL** — `seed.mjs` sans `SEED_ADMIN_*`, le worktree n'a que
`.env.example` ; aucun `.skip` statique, 646/646 avec l'env.

### Les 8 invariants

**1 OK, désormais PROUVÉ** · 2 OK · 3 hors périmètre (**le scan passif ne coche pas le point 7 de P-C**)
· 4 OK · 5 OK · 6 OK · **7 OK, exemplaire** — la marche a→b' écrite, l'entrée du retrait conservée, les
contre-vérités retirées **avec leur mesure** · 8 hors périmètre. **11 §4** : sans objet. **09 §5.7** :
aucune — les deux dettes (§4-A, §4-B) sont datées, assignées, arbitrées et **gardées par un test qui
rougira**, l'inverse d'une simplification.

### §5.6 sur les dix commits — propre

A26 : tests seuls (4) · A11 : infra seule (3) · A52 (1) · A21 : production seule, aucun test (1) ·
pilote : ETAT (1). **Aucun agent n'a écrit le test de son code.**

### Non signé par A29

WebKit / iPad — `require-corp` **jamais tourné sur l'appareil de référence** · le run TLS sur staging —
le 0/0/0 est **local, en HTTP** ; **la bascule serait aujourd'hui un pari** · A28 p95 — **non faite** ·
`pnpm verify` complet en environnement doté du `.env`.

### Ce qui reste dû à Williams

1. **A28 : p95 < 100 ms sur `jitless`**, derrière Caddy, avant signature.
2. **Le run `workflow_dispatch` sur staging en TLS**, `ZAP_BLOQUANT` encore `'false'`.
3. **`require-corp` sur l'iPad**, ou acceptation écrite du risque documentaire.
4. **Trois lots à dater** : R10 (posture sur `handle_errors`) · **R11** (repli SPA sur `/assets/*` :
   **200 + `immutable` un an sur du HTML** — le plus opérationnellement gênant) · R8.
5. **Ce vert ne coche pas le point 7 du dossier P-C.**

```
Désaccords à arbitrer par A01 : aucun. Doutes de spec : aucun — les trois questions ouvertes
(nature de 10049, portée de la condition (2), naissance de la condition (5)) sont tranchées et
tracées, avec un vrai choix de part et d'autre.
Signature revue croisée : A29 — 2026-09-09 (rejeu final). ZÉRO fichier créé ou modifié par A29.
```
