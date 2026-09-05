# REVUE CROISÉE A29 — correctifs de sécurité de l'incrément L5a (F-22, F-23, F-25)

> **Réviseur** : A29 (revue croisée front, équipe 2) · **Rend compte à** : A20 → A01 → Williams
> **Date** : 2026-09-05 (UTC) · **Objet relu** : `lot/l5a` de **`4e1f35e`** à **`ba38847`** (PR **#30**)
> **Origine du mandat** : étape 4 du pipeline (09 §3) sur les correctifs livrés après le verdict
> `docs/securite/VERDICT_A51_L5A.md` du 2026-09-04 (F-22 CRITIQUE, F-23 et F-25 MAJEURS).
> **Mode** : **LECTURE SEULE.** Je ne produis rien (09 §1, §5.6) — ni code, ni test, ni correctif.
> Ce fichier est le seul écrit de la passe. Preuve : `git status` propre avant, ne portant que ce
> fichier après. Toutes les sondes ci-dessous tournent **hors du dépôt**, dans un répertoire
> temporaire, sur les modules **réels** empaquetés par esbuild.
> **Ordre de lecture appliqué** : `11` (§1, §2, §3, §4, §6, §8) → `docs/securite/VERDICT_A51_L5A.md`
> → `05` §9.7 → `03` §17.6 et §33.2 → `06` §10.1 → `DECISIONS.md` (entrées du 2026-09-04) →
> `.github/coverage-critical-paths.json` → `CLAUDE.md` (8 invariants, §2, §8).
> **Le pack entier n'a pas été chargé** (09 §5.8). Le **diff, lui, l'a été en entier**.

---

## 1. VERDICT

**ACCEPTÉ SOUS RÉSERVE — 0 BLOQUANT · 3 MAJEURS · 5 MINEURS · 3 OBSERVATIONS.**

**Aucune réserve ne bloque la fusion de #30.**

Les trois constats qu'A51 exigeait de fermer avant le merge sont fermés, et je les ai **mesurés** un
par un plutôt que relus (§3) :

| Constat A51 | État mesuré |
| --- | --- |
| **F-22** (CRITIQUE) — un coffre illisible se lit « absent », la DEK est écrasée | **FERMÉ** sur tout le chemin : lecture, initialisation, coquille, écran. Sonde 2 : `lireCoffreAuRepos` **lève**, `initialiserCoffre` **lève**, la ligne `meta.coffre` **ne bouge pas d'un octet** |
| **F-23** (MAJEUR) — aucune politique de mot de passe | **FERMÉ** : refusé à la création et au changement, **jamais** au déverrouillage (sonde 7 : un mot de passe court et faux rend `MotDePasseInvalideError`, pas `MotDePasseTropCourtError`) ; source `MOT_DE_PASSE_LONGUEUR_MIN` de `@axion/shared`, aucun littéral |
| **F-25** (MAJEUR) — paramètres KDF relus du stockage, sans borne | **FERMÉ sur les deux paramètres qu'A51 nomme** (sonde 6 : `m=4 000 000, t=1 000 000` refusé aux trois niveaux). **La classe, elle, reste ouverte** par `longueurOctets` et par le plancher mémoire → **R1**, MAJEUR |

Ce que la revue croisée ajoute, et qui n'était pas visible depuis le poste du producteur :

> **Le correctif ferme les trois chemins nommés. Il en laisse trois ouverts dans la même famille, et
> les trois se déclenchent par UNE écriture dans IndexedDB, sans mot de passe : un `longueurOctets`
> admis par les bornes mais refusé par AES fait mourir le déverrouillage sur un `DataError: Invalid
> key length` — en anglais, sans action, sur un appareil définitivement fermé (R1) ; une ligne
> `meta.coffre` de valeur `null` échappe encore à la garde de présence, que la glose dit pourtant
> porter sur la présence (R4) ; et la règle ESLint réécrite le même jour annonce couvrir `.modify()`,
> qu'elle ne voit pas, et promet d'épargner les collections en mémoire, sur lesquelles elle mord
> (R2). Aucun de ces trois n'est un défaut de relecture : les trois se mesurent en trois minutes, et
> aucun n'a été mesuré.**

**Ce que je signe** : la revue croisée de l'étape 4, et rien d'autre. Je ne peux pas signer
« F-25 fermée » sans qualification ; je signe « F-25 fermée sur `memoireKio` et `iterations`, ouverte
sur `longueurOctets` et sur le plancher mémoire ».

| Gravité | Nombre | Objets |
| --- | --- | --- |
| **BLOQUANT** | **0** | — |
| **MAJEUR** | **3** | **R1** (F-25 à moitié fermée : quatre erreurs techniques anglaises atteignent l'écran) · **R2** (la glose ESLint est fausse dans les DEUX sens, mesuré) · **R3** (l'écran d'anomalie dit « ne créez PAS » sous un bouton actif « Créer ») |
| **MINEUR** | **5** | **R4** (la garde porte sur la VALEUR, la glose dit PRÉSENCE) · **R5** (les deux arbitrages qui fondent le correctif ne sont pas atteignables depuis la branche) · **R6** (la base Dexie n'est jamais fermée sur le nouveau chemin qui lève) · **R7** (aucun bloc `ETAT.md` pour cet incrément) · **R8** (la réécriture de la règle ESLint est hors périmètre et sans trace) |
| **OBSERVATION** | **3** | O1 (CHEMINS vs VALEURS : deux doctrines contraires à soixante lignes) · O2 (couverture mesurée) · O3 (le cas `null` n'est couvert par aucun test) |

---

## 2. PÉRIMÈTRE RELU

`git diff 4e1f35e..ba38847` — **13 fichiers, 1 807 insertions, 46 suppressions, 100 % relus.**

| Fichier | Lignes | Relu |
| --- | --- | --- |
| `apps/field/src/local/coffre.ts` | +201 | intégralement, + le fichier entier en contexte |
| `apps/field/src/local/coffre-appareil.ts` | +117 | intégralement, + le fichier entier |
| `apps/field/src/app/contexte.tsx` | +33 −13 | intégralement, + `amorcer` et `ouvrir` en contexte |
| `apps/field/src/app/EcranDeverrouillage.tsx` | +85 −18 | intégralement, + le fichier entier |
| `eslint.config.js` | +68 −13 | intégralement, + les trois blocs de globs |
| 4 fichiers de test + `scripts/garde-fous-eslint-ecriture-dexie.test.ts` | +904 | relus (hors périmètre de production, cités quand ils manquent) |
| `DECISIONS.md`, `docs/ETAT.md`, `docs/journal/2026-09-03.md` | +445 | intégrité de fusion vérifiée par mesure (§7) |

La fusion de `main` (`69251e6`, parents `5c1da28` et `172b663`) n'apporte **aucune ligne de code** :
les deux commits de `main` (`c3cc3c5`, `172b663`) ne touchent que `DECISIONS.md` et `docs/ETAT.md`
(mesuré : `git show --stat`).

---

## 3. LES SONDES EXÉCUTÉES

Modules **réels** de `apps/field/src/local/**` empaquetés par esbuild, `fake-indexeddb` + WebCrypto de
Node, exécution **hors du dépôt** : aucun fichier du worktree créé, modifié ni supprimé.

| Sonde | Question posée | Réponse mesurée | Constat |
| --- | --- | --- | --- |
| **1** | Chemin nominal : coffre créé sur base vide | coffre créé, relu lisible | *témoin* |
| **2** | Ligne `meta.coffre` PRÉSENTE et de forme invalide | `lireCoffreAuRepos` **LÈVE** `CoffreIllisibleError` ; `initialiserCoffre` **LÈVE** ; ligne inchangée | **F-22 fermée** |
| **3** | Ligne présente, valeur `null`, **données présentes** | lecture rend `null` (« absent ») **mais** `initialiserCoffre` lève `DonneesSansCoffreError` ; **ligne non réécrite** | **R4** (2ᵉ ceinture tient) |
| **4** | Même ligne nulle, tables miroirs **vides**, jeton chiffré dans `meta` | **coffre neuf CRÉÉ**, **sel changé**, enveloppe du jeton rendue indéchiffrable | **R4** |
| **5** | Ligne présente **sans propriété `valeur`**, données présentes | idem sonde 3 : « absent » à la lecture, `DonneesSansCoffreError` à l'initialisation | **R4** |
| **6** | `m = 4 000 000, t = 1 000 000` relus du stockage | **LÈVE** `ParametresKdfHorsBornesError` à la lecture, au déverrouillage **et** dans `deriverKek` | **F-25 fermée** (partie nommée) |
| **6bis** | Bornes effectives | `travailMax = 188 416` = `memoireKioMax` = 4 × profil ; **`t=4` accepté, `t=5` refusé** — conforme mot pour mot à l'arbitrage #41 | *tenu* |
| **7** | `initialiserCoffre(base,'1')` · `changerMotDePasse(→ court)` · `deverrouiller(court)` | **refusé** · **refusé** · `MotDePasseInvalideError` (jamais `MotDePasseTropCourtError`) | **F-23 fermée** |
| **8** | `longueurOctets = 48`, **dans les bornes** | `verifierParametresKdf` **ACCEPTE** ; `deriverKek` et `deverrouiller` meurent sur **`DataError: Invalid key length`** | **R1** |
| **9** | Balayage de l'espace admis par les bornes | **quatre** messages techniques **anglais** atteignables (§4, R1) | **R1** |
| **10** | Règle ESLint, 11 formes, configuration **livrée** chargée (`overrideConfigFile`) | `.modify()` **MUETTE** ×2 · `bulkUpdate` **MUETTE** · `base["answers"].put()` **MUETTE** · `files.get(id).clear()` **MORD** | **R2** |
| **11** | Suite de tests du dépôt (vérité terrain, 11 §9ter) | `test:unit` **965 verts / 40 fichiers** · `test:interface` **516 verts / 31 fichiers** · **0 skippé** · `lint` **0** · `typecheck` **0** | *tenu* |
| **12** | Couverture des modules modifiés | `local/coffre-appareil.ts` **99,23 %** · `local/coffre.ts` **95,10 %** · aucun fichier de `local/**` sous 90 % | *tenu*, **O2** |
| **13** | Intégrité de la fusion des fichiers append-only | union **stricte**, **0 ligne supprimée** des deux côtés | *tenu* |

---

## 4. LES CONSTATS

### R1 — MAJEUR — les bornes KDF admettent quatre jeux de paramètres qui font mourir le déverrouillage sur une erreur technique ANGLAISE, sans action

**Où.** `apps/field/src/local/coffre.ts:127-138` (`BORNES_KDF`), `:149-176`
(`verifierParametresKdf`), `:347` (`deriverKek`), `apps/field/src/app/EcranDeverrouillage.tsx:70-72`
(`traduire`, branche `cause instanceof Error`).

**Ce qui est écrit.**

```ts
// coffre.ts:134-135
/** Longueur de clé dérivée maximale, en octets (AES-256 en demande 32). */
longueurOctetsMax: 64,
```

Le commentaire **dit lui-même** que la seule valeur utile est 32. La borne, elle, en admet 64. Et
`verifierParametresKdf` ne borne **que par le haut** — décision assumée et juste pour le travail
(invariant 7 : ne jamais refermer un coffre légitime), mais elle laisse passer des valeurs que la
cryptographie sous-jacente **refuse d'exécuter**.

**La mesure** (sondes 8 et 9, sur les modules réels ; `verifierParametresKdf` ACCEPTE les quatre) :

```
longueurOctets: 48   → deriverKek : DataError: Invalid key length
longueurOctets: 64   → deriverKek : DataError: Invalid key length      (la borne haute EXACTE)
longueurOctets: 1    → deriverKek : Error: Hash length should be at least 4 bytes.
memoireKio: 7        → deriverKek : Error: Memory size should be at least 8 * parallelism.
```

Vérifié **de bout en bout** sur un coffre trafiqué : `deverrouiller(base, bonMotDePasse)` rend
`DataError: Invalid key length`.

**Ce que cela veut dire.** C'est **exactement le scénario de F-25** — une écriture dans IndexedDB,
sans mot de passe, sans franchir le verrou — avec **exactement la même conséquence** : l'appareil
n'est plus déverrouillable, les données sont intactes et inaccessibles. A51 l'écrivait ainsi : « là
où F-22 détruit la clé, F-25 rend son usage impraticable ». Le correctif a fermé la porte
`memoireKio`/`iterations` et laissé ouverte la porte `longueurOctets`.

**Et l'aggravation est côté écran.** `traduire()` (`EcranDeverrouillage.tsx:70-72`) rend
`cause.message` pour toute `Error` : `DataError: Invalid key length` s'affiche **tel quel**,
**en anglais**, **sans action**. Deux règles tombent d'un coup :

- **invariant 5** — « interface 100 % en français » ;
- **03 §17.6**, cité par le commentaire de `traduire()` **trois lignes plus haut** : « aucune erreur
  technique brute n'atteint l'écran ».

Et surtout : l'auditeur ne reçoit **pas** la phrase « **Ne créez PAS de nouvelle protection sur cet
appareil** », parce que `DataError` n'est pas une `AnomalieCoffreError`. Sur l'unique famille de
pannes où cette phrase existe pour éviter la destruction, elle ne s'affiche pas.

**Pourquoi MAJEUR et non BLOQUANT.** Le défaut n'est pas une **régression** : avant le correctif, le
même appareil était tout aussi fermé (par la mémoire). Le correctif ne l'ouvre pas, il ne le ferme
simplement qu'à moitié. La lettre de l'exigence d'A51 (« plafonner `memoireKio` et `iterations` »)
est tenue ; son intention (« une valeur qui vient du stockage est une entrée non fiable ») ne l'est
pas entièrement.

**Le remède** (à A24/A20, pas à moi — 09 §5.6) : `longueurOctets` n'est pas une grandeur à borner,
c'est un **ensemble fermé** — `{16, 24, 32}`, les seules longueurs qu'AES accepte ; et
`memoireKio ≥ 8 × parallelisme`, qui est la contrainte d'Argon2id elle-même. Quatre lignes dans
`verifierParametresKdf`, et les quatre morts anglaises deviennent une `ParametresKdfHorsBornesError`
qui porte déjà sa cause **et** son action. **Exigences** : E33 ; 11 §4 ; 03 §17.6 ; invariant 5.

---

### R2 — MAJEUR — la glose de la règle ESLint est fausse dans les DEUX sens, et elle a été réécrite le jour même pour cesser de l'être

**Où.** `eslint.config.js:153` (`VERBES_ECRITURE_DEXIE`), `:190-198` (sélecteur ② et son
commentaire), `:331-345` (la glose « CE QUE CES RÈGLES VOIENT, ET CE QU'ELLES NE VOIENT PAS »).

**Ce qui est écrit**, en tête du sélecteur ② :

```js
// ② L’écriture au bout d’une CHAÎNE : `db.table('answers').delete(…)`,
// `base.answers.where('missionId').equals(id).delete()`, `.toCollection().modify(…)`.
// […] Une collection en mémoire ne s’écrit pas ainsi — on n’appelle pas `.clear()`
// sur le RÉSULTAT d’un appel pour vider un `Map`.
```

Et `VERBES_ECRITURE_DEXIE = 'put|add|delete|update|clear|bulkPut|bulkAdd|bulkDelete'` — **`modify`
n'y est pas.**

**La mesure** (sonde 10 : `ESLint.lintText` avec la configuration **livrée**, chemin virtuel
`apps/field/src/app/…`, exactement le harnais d'A26) :

```
MORD    base.answers.put()                            (témoin)
MORD    base.answers.where(…).equals(…).delete()
MUETTE  base.answers.toCollection().modify({…})       ← ANNONCÉE COMME VUE
MUETTE  base.answers.where(…).equals(…).modify({…})   ← ANNONCÉE COMME VUE
MUETTE  base.answers.bulkUpdate([…])
MUETTE  base["answers"].put({})                       ← angle mort NON déclaré
MUETTE  const t = base.answers; t.put({})             ← angle mort déclaré, conforme
MORD    base.miroir("answers").put({})
MORD    files.get(id).clear()                         ← PROMISE ÉPARGNÉE, elle mord
MORD    files.get(id).add(x)                          ← idem
```

`Collection.modify()` (`dexie@4.4.5/dist/dexie.d.ts:443,446`) et `Table.bulkUpdate()` (`:792`) sont
des **écritures Dexie 4 de plein droit**. Une écriture locale qui échappe à la règle est une écriture
qui ne pousse pas d'op dans l'outbox : **05 §9.2-2** — « une donnée que la synchronisation ne
remontera jamais, perdue, et découverte au montage du rapport », dit le message de la règle
elle-même.

Et dans l'autre sens, `files.get(id).clear()` sur un `Map<string, Set<…>>` est **repris à tort** :
c'est très précisément le faux positif (`enAttente.current.clear()`) qui a motivé la réécriture, sous
une forme d'un cran plus imbriquée.

**Pourquoi MAJEUR.** Le commit qui porte cette glose s'appelle « la règle d'écriture Dexie ne mord
plus sur une collection en mémoire », et le fichier écrit noir sur blanc que la version précédente
« décrivait ce qu'on espérait, pas ce qui était en vigueur ». La correction reproduit **la faute
qu'elle corrige**, sur les deux bords. Un garde-fou dont la glose ment est pire qu'un garde-fou
absent : on le lit au lieu de mesurer.

**Ce qui limite la portée, et c'est pourquoi cela ne bloque pas #30** : aucune écriture `modify` ni
`bulkUpdate` n'existe aujourd'hui en production (mesuré : **une** occurrence dans tout `apps/`, à
`apps/field/src/local/descente.test.ts:227`, fichier de test **exclu** de la règle par construction).
Le trou s'ouvrira à **L6a**, où la descente écrira par lots.

**Le remède** : ajouter `modify|bulkUpdate` aux verbes, et corriger la glose sur les deux points —
ou, si le faux positif imbriqué est jugé acceptable, l'**écrire** au lieu d'affirmer le contraire.
Le test d'A26 (`scripts/garde-fous-eslint-ecriture-dexie.test.ts`) éprouve les deux sens et les deux
angles morts déclarés ; il **n'éprouve pas** `modify`, ce qui est exactement pourquoi l'écart survit.
**Exigences** : E6, E33 ; 05 §9.2-2 ; `docs/conception/LOT_L5.md` §4.

---

### R3 — MAJEUR — sur l'écran d'anomalie, « Ne créez PAS de protection » s'affiche au-dessus d'un bouton actif « Créer la protection de cet appareil »

**Où.** `apps/field/src/app/EcranDeverrouillage.tsx:112-124` (titre et message d'info),
`:155-166` (l'alerte), `:168-170` (le bouton) ; `apps/field/src/local/coffre-appareil.ts:141-152`
(`DonneesSansCoffreError`).

**Le chemin**, déduit par lecture et confirmé par les sondes 3 et 5. `DonneesSansCoffreError` n'est
levée que par `initialiserCoffre`, donc seulement lorsque `premierUsage === true`
(`contexte.tsx:236-238`). L'échec est rattrapé **dans l'écran** (`:100-103`), pas dans la coquille :
`premierUsage` reste `true` et rien ne change de phase. L'auditeur voit alors, dans cet ordre :

1. le titre « **Préparer cet appareil** » ;
2. le message d'info « **Première utilisation de cet appareil** […] Choisissez-en un d'au moins 12
   caractères. » — sur un appareil qui vient de déclarer porter des enregistrements ;
3. l'alerte « Cet appareil porte déjà *n* enregistrement(s) locaux […] **Ne créez PAS de protection
   sur cet appareil** » ;
4. le bouton, **actif**, « **Créer la protection de cet appareil** ».

**Ce que cela viole.** 03 §33.2 (l'état d'erreur d'un écran doit être **cohérent**) et la doctrine
posée par la revue A29 du 2026-09-02, bloquant **B4**, tracée dans `DECISIONS.md` : « deux messages
contraires ne peuvent plus s'afficher ensemble ». C'est le même défaut, sur un autre écran, quatre
jours plus tard.

**Ce qui l'aggrave, et c'est le point qui compte.** `DonneesSansCoffreError.action`
(`coffre-appareil.ts:144-146`) est la **seule** action de la famille `AnomalieCoffreError` qui ne
contient **pas** « sans recharger ni réinstaller » — la formule que porte `ACTION_ANOMALIE_COFFRE`
(`coffre.ts:254-256`). Or c'est **la seule des trois** qui atteigne l'écran par le chemin du premier
usage. Un auditeur devant un bouton qui refuse quatre fois de suite fait ce que tout le monde fait :
il réinstalle. Et là, il détruit — ce que ni le code ni le message ne l'empêchent plus de faire.

**Rien n'est détruit par le code**, et je l'ai mesuré : sondes 3 et 5, la ligne `meta.coffre` **n'est
pas réécrite** et le compte d'enregistrements est exact. C'est pourquoi ce n'est pas bloquant.

**Non testé** : `EcranDeverrouillage.test.tsx:197-214` éprouve bien qu'une `AnomalieCoffreError`
affiche cause **et** action, mais avec `premierUsage` à sa valeur par défaut (`false`) — c'est-à-dire
sur le seul chemin où la contradiction **n'apparaît pas**.

**Le remède** : sur une `AnomalieCoffreError`, l'écran ne doit plus proposer de créer — masquer le
bouton et le message d'info, ou router vers `phase: 'erreur'` comme la coquille le fait déjà à
l'amorçage (`contexte.tsx:180-181`) ; et aligner l'action de `DonneesSansCoffreError` sur
`ACTION_ANOMALIE_COFFRE`. **Exigences** : E23, E33 ; 03 §17.6, §33.2 ; invariant 7.

---

### R4 — MINEUR — la garde de `initialiserCoffre` porte sur la VALEUR, là où la glose dit qu'elle porte sur la PRÉSENCE

**Où.** `apps/field/src/local/coffre-appareil.ts:160-161` (la glose), `:170-171` (la garde),
`apps/field/src/local/base.ts:366-369` (`lireMeta`).

**Ce qui est écrit.**

```ts
// coffre-appareil.ts:160-161  (la promesse)
 * La garde porte sur la PRÉSENCE de la ligne `meta.coffre`
 * et non sur sa lisibilité (F-22)

// coffre-appareil.ts:170-171  (ce qui est exécuté)
const ligneExistante = await lireMeta(base, CLES_META.coffre);
if (ligneExistante !== undefined && ligneExistante !== null) { … }

// base.ts:366-369  (ce que rend lireMeta)
const ligne = await base.meta.get(cle);
return ligne?.valeur;          // ← la VALEUR, jamais la ligne
```

Une ligne **physiquement présente** dont la valeur est `null` — ou qui n'a pas de propriété
`valeur` — traverse la garde et se lit « absente ». La glose promet le contraire.

**La mesure.**

- **Sonde 3** (ligne `{cle:'coffre', valeur:null}`, une réponse dans `answers`) :
  `lireCoffreAuRepos` rend **`null`** → « absent » ; `initialiserCoffre` **lève**
  `DonneesSansCoffreError` grâce à la **seconde ceinture**, et **la ligne n'est pas réécrite**.
- **Sonde 5** (ligne `{cle:'coffre'}`, sans `valeur`, une op dans `outbox`) : identique.
- **Sonde 4** (même ligne nulle, **tables miroirs vides**, jeton de rafraîchissement chiffré dans
  `meta`) : **un coffre neuf est créé**, le **sel change**, et l'enveloppe du jeton devient
  définitivement indéchiffrable.

**Ce que cela veut dire, honnêtement.** La seconde ceinture — celle qu'A51 réclamait en la disant
« indépendante et peu coûteuse » — **fait tout le travail** sur ce chemin, et elle le fait bien.
La destruction de **collecte** est impossible : les huit tables comptées couvrent tout ce qui est
chiffré sous la DEK. Ce qui reste perdable est l'enveloppe du **jeton de rafraîchissement**, qui vit
dans `meta` et n'est comptée par personne — et sa perte coûte une reconnexion, pas une journée
d'audit. **Le déclencheur, en revanche, n'est pas naturel** : IndexedDB n'écrit pas une valeur `null`
tout seul (un enregistrement s'écrit entier ou pas du tout, et une valeur non clonable fait échouer
le `put`). Il faut une écriture délibérée — c'est-à-dire le modèle de menace de F-24, celui qu'A51 a
établi comme accessible « en trois clics » sur un portable.

**Ce n'est donc pas F-22 rouverte. C'est une glose qui promet une ceinture qu'elle n'a pas**, dans un
fichier dont l'en-tête énonce trois règles « qui ne se négocient pas », et dont la règle n° 2 est
précisément « `initialiserCoffre` refuse dès qu'une ligne `meta.coffre` EXISTE ». Ce dépôt refuse
ailleurs, explicitement, les garde-fous qui annoncent plus qu'ils ne font (`base.ts:311-327`).

**Le remède** : lire la LIGNE (`base.meta.get`) plutôt que sa valeur pour la garde de présence — ou,
si `lireMeta` doit rester la seule porte, corriger la glose et dire que la présence se juge sur une
valeur non nulle, la seconde ceinture couvrant le reste. **Aucun test ne couvre ce cas** (vérifié :
aucune occurrence d'une valeur nulle sur `CLES_META.coffre` dans les quatre fichiers de test livrés).
**Exigences** : E33, E38 ; invariant 7.

---

### R5 — MINEUR — les deux arbitrages qui fondent F-23 et F-25 ne sont pas atteignables depuis `ba38847`

**Où.** `DECISIONS.md` de la branche (mesuré : **aucune** entrée « [L5a] Le mot de passe du coffre
local… » ni « [L5a] Quel plafond pour les paramètres KDF… ») ; `apps/field/src/local/coffre.ts:200-201`.

**Ce qui est écrit dans le code**, aujourd'hui, sur la branche :

```ts
// coffre.ts:200-201
 * déjà. Le terrain applique le même — voir la réserve de spec au rapport A24 :
 * le pack ne dit nulle part si le mot de passe du coffre EST celui du compte.
```

**La mesure.** Les deux arbitrages **existent** — `ffe7773` (« gouvernance(l5a) : le mot de passe du
coffre est celui du compte, et le plafond KDF est amarré au profil », PR **#41**), et ils sont sur
`origin/main`. Mais `git merge-base --is-ancestor ffe7773 ba38847` → **faux** : la fusion de `main`
dans la branche s'est arrêtée à `172b663`, antérieur. Sur l'arbre relu, la politique de mot de passe
du coffre et le plafond KDF sont **appliqués sans fondement écrit atteignable**, et le code présente
encore comme une « réserve de spec » ouverte une question **tranchée par A01**.

**J'ai relu les deux entrées sur `main` et le code leur est conforme, point par point** : source
`MOT_DE_PASSE_LONGUEUR_MIN` ✔ ; bornes **hors** du `.max()` Zod, écart explicitement assumé par
l'arbitrage ✔ ; plafond `travailKdf(défaut) × 4` **amarré au profil** et non en constante ✔ ; profil
Argon2id **inchangé** ✔ ; et le « `t = 4` accepté, testé » de l'arbitrage est **vrai** (sonde 6bis :
`t=4` accepté, `t=5` refusé).

**Portée.** Se referme mécaniquement quand #30 fusionne dans `main`. Ce qui ne se refermera pas tout
seul, c'est **le commentaire `coffre.ts:200-201`**, devenu faux : il envoie le prochain lecteur
chercher une réserve ouverte là où il y a une décision. **CLAUDE.md §7** : « une décision non tracée
dans ce format n'existe pas » — ici elle est tracée, mais pas là où le code l'invoque.

---

### R6 — MINEUR — sur le nouveau chemin qui lève, la base Dexie n'est jamais fermée

**Où.** `apps/field/src/app/contexte.tsx:151-201` (`amorcer`).

`const ouverte = await ouvrirBaseLocale();` puis, plus bas, `await lireCoffreAuRepos(ouverte)`. Le
`catch` qui suit route désormais `AnomalieCoffreError` vers `phase: 'erreur'` — c'est le correctif de
F-22, et il est juste. Mais il n'appelle pas `ouverte.close()`, et `setBase(ouverte)` n'a pas eu
lieu : **la référence est perdue et la connexion reste ouverte**. Le chemin est **nouveau** — avant
le correctif, `lireCoffreAuRepos` ne levait jamais.

Conséquence : une connexion Dexie vivante bloque un `versionchange` (05 §31-1, compatibilité
ascendante du schéma local) jusqu'au rechargement de la page. Le cas d'abandon, lui, ferme
correctement (`:154-157`) — la dissymétrie se voit à l'œil nu une fois qu'on la cherche.

**Le remède** : fermer dans le `catch`, comme le fait `ouvrirBaseLocale` lui-même sur ses deux
chemins de refus (`base.ts:338`, `:348`).

---

### R7 — MINEUR — aucun bloc `ETAT.md` pour cet incrément ; le dernier bloc « qui fait foi » décrit l'état d'AVANT

**Où.** `docs/ETAT.md`, dernier bloc = `## 2026-09-04 20h40 — [autopilote de bout en bout]`.

**La mesure.** Entre `4e1f35e` et `ba38847`, `docs/ETAT.md` gagne **3 blocs, tous venus de `main`**
(base 71 → branche 77 → `main` 74 → fusion 80). Les commits du correctif (`e4fd949`, `5c1da28`,
`ba38847`) n'en ajoutent **aucun**. Le bloc qui fait foi porte « Prochaine action : **fermer B2**
(A51 sur `lot/l5a`) » — c'est-à-dire la tâche que cet incrément vient d'exécuter.

Une session de reprise qui applique le protocole (**CLAUDE.md §8** : ETAT.md → `git log` → tests) lit
donc un état antérieur au travail livré, sur une branche qu'il ne nomme pas. **11 §9ter** demande une
mise à jour « à CHAQUE changement d'étape du pipeline » ; il y en a eu trois (implémentation,
auto-revue, tests).

---

### R8 — MINEUR — la réécriture de la règle ESLint est hors du périmètre « F-22, F-23, F-25 », et sans trace

**Où.** `5c1da28` (« la règle d'écriture Dexie ne mord plus sur une collection en mémoire »),
`eslint.config.js:175-199`.

Le mandat de l'incrément était de fermer trois constats de sécurité. Ce commit modifie un **interdit
outillé** — un garde-fou de l'invariant 1 et du 05 §9.2-2 — et **restreint son sélecteur**
(l'ancienne forme visait tout objet `MemberExpression` ; la nouvelle, les neuf tables nommées). La
motivation est bonne et écrite ; le travail est **testé** par A26, qui n'en est pas l'auteur (09
§5.6, respecté). Mais il ne porte **ni ligne `AMELIORATIONS.md`** (mesuré : 0 ligne ajoutée côté
branche) **ni entrée `DECISIONS.md`**, alors qu'il change la surface d'un garde-fou.

Ce n'est pas une « simplification temporaire » au sens du **09 §5.7** — rien n'est affaibli en sync
ni en crypto, et la restriction ne perd que des faux positifs (vérifié forme par forme, sonde 10).
C'est un travail hors périmètre non déclaré, ce que le gardien A02 relèvera à l'étape 6.

---

### O1 — OBSERVATION — « les CHEMINS, jamais les VALEURS », et soixante lignes plus loin, les valeurs

`coffre-appareil.ts:102-103` refuse de republier le contenu de `meta` en citant **11 §2**, et ne rend
que les chemins Zod — mesuré, le message dit « sur : sel, parametres, dekEnveloppee », **aucune
valeur**. C'est juste. Mais `coffre.ts:151-152` (`dire`) construit « mémoire de **4000000** pour un
maximum de 188416 », c'est-à-dire **la valeur relue de `meta`**.

Aucune donnée personnelle, aucun secret, aucun chiffré n'y transite : ce sont des paramètres KDF
publics par construction, et ce sont eux qui rendent le message diagnosticable. **Je ne demande pas
de les retirer** — je signale que deux doctrines opposées cohabitent à soixante lignes d'écart sans
qu'une phrase dise pourquoi, et que la prochaine personne appliquera celle qu'elle aura lue en
premier.

### O2 — OBSERVATION — la couverture, mesurée

`vitest run --coverage --project unit --project interface`, sur l'arbre `ba38847` :

```
local/coffre-appareil.ts     lignes 99,23  branches 97,05  fonctions 100
local/coffre.ts              lignes 95,10  branches 94,73  fonctions 100
local/base.ts                lignes 92,52  branches 90,47  fonctions  91,66
app/EcranDeverrouillage.tsx  lignes 94,89  branches 92,85  fonctions 100
app/contexte.tsx             lignes 83,23  branches 69,44  fonctions 100
→ aucun fichier de apps/field/src/local/** sous 90 % de lignes
```

Le seuil de 90 % de la DoD porte sur `apps/field/src/local/**`
(`.github/coverage-critical-paths.json`) : **tenu**. `apps/field/src/app/**` en est délibérément
absent — et c'est là, `contexte.tsx:180-181`, que vit la branche qui **ferme F-22**. A51 l'avait déjà
dit au §8 de son verdict ; le correctif n'a pas changé cette géométrie. Ce n'est pas un défaut du
correctif : c'est une remarque à porter au dossier de P-C.

### O3 — OBSERVATION — ce que les tests livrés ne couvrent pas

Les 900 lignes de tests ajoutées sont sérieuses, écrites par A26 (croisement 09 §5.6 respecté) et
couvrent les trois constats avec anti-vacuité — dont un test qui vaut d'être cité parce qu'il pose la
bonne frontière : « **`meta` n'est PAS de la collecte : une ligne `meta` seule laisse préparer un
appareil neuf** ». Trois trous, tous cités plus haut : le cas `meta.coffre` **de valeur nulle** (R4),
l'anomalie **en premier usage** (R3), et `.modify()` dans le test de la règle ESLint (R2). Aucun
n'est un oubli de rigueur : ce sont les trois endroits où la **glose** disait déjà la bonne réponse,
et où personne n'a eu de raison de la mettre à l'épreuve.

---

## 5. LES 8 INVARIANTS, PASSÉS UN PAR UN SUR LE DIFF

| # | Invariant | Verdict |
| --- | --- | --- |
| **1** | Offline-first, UUID v7 client, push idempotent | **OK** — aucun appel réseau ajouté (0 `fetch`, 0 URL) ; `initialiserCoffre` continue de tirer l'identifiant d'appareil par `uuidv7()` (`coffre-appareil.ts:192`) ; le déverrouillage reste sans serveur (sonde 7) |
| **2** | Aucune référence client dans le code | **OK** — mesuré, aucune occurrence dans le diff |
| **3** | RBAC serveur ; écritures de sync réservées au propriétaire (05 §9.9) | **SANS OBJET** — le diff n'ouvre aucune route et ne pousse aucune op |
| **4** | Aucune couleur/taille en dur | **OK** — mesuré sur les lignes ajoutées : 0 hexadécimal, 0 `rgb()`, 0 `px`, 0 `rem`, 0 `style={{`. L'écran compose les classes `axn-*` et `Bouton taille="large"` |
| **5** | Interface 100 % en français ; UTC en base | **ÉCART → R1** — toutes les chaînes ajoutées sont en français (relues une à une), mais `DataError: Invalid key length` atteint l'écran par `traduire()`. Aucun horodatage ajouté |
| **6** | Le terrain collecte, le siège produit | **OK** — aucune génération lourde ajoutée ; le seul coût nouveau est un `count()` sur huit tables au premier usage, sur une base vide |
| **7** | Rien n'est silencieusement écrasé | **OK sur le chemin nommé** (sondes 2, 3, 5 : la ligne `meta.coffre` ne bouge pas) ; **écart résiduel mineur → R4** (sonde 4) |
| **8** | Sauvegarde terrain, export de secours, alerte > 24 h | **SANS OBJET** — `.axionbackup` n'est pas touché ; la KEK garde ses quatre usages (F-28 d'A51 reste ouverte, comme prévu, pour L5c) |

**Contrat de sync 11 §4** : **SANS OBJET sur ce diff.** Aucun format d'op, aucun lot de 100, aucun
ordre de file, aucun `processed_ops`, aucune question ad hoc, aucun `.axionbackup` — le correctif ne
touche pas une ligne de L6. Vérifié par le périmètre du diff, pas par déduction.

**UX (03 §33.2)** : **1 écran sur 1**, quatre états tenus — chargement (`Bouton chargement={enCours}`
et la coquille), erreur (`Message ton="alerte" role="alert"`, cause **et** action), vide sans objet
et **déclaré** en en-tête (« l'écran EST le contenu »), hors ligne annoncé et désormais **décliné en
deux variantes** selon le premier usage. Couleurs en dur : **0**. Français : **OK**, hors R1.

---

## 6. CE QUI NE DEVAIT PAS BOUGER, ET N'A PAS BOUGÉ

| Point | Vérification | Résultat |
| --- | --- | --- |
| **F-24** — AES-GCM sans AAD, ré-arbitrage à P-C | `git diff` sur `enveloppe.ts`, `ecriture.ts`, `formes.ts` | **sortie vide — intacts.** Aucune occurrence de `additionalData`/`aad` dans tout le diff |
| **Profil Argon2id** confirmé par Williams le 2026-09-02 | `PARAMETRES_KDF_DEFAUT` (`coffre.ts:77-83`) | **inchangé** — hors diff. Seules des bornes de **refus** sont ajoutées, conformément à l'arbitrage #41 |
| **Contrat d'ops 11 §4 / fichier 04** | périmètre du diff | **non touchés** — aucun format d'op, aucun DDL |
| **Tests skippés, `@ts-ignore`, `eslint-disable`** | grep sur les lignes ajoutées | **aucun.** 965 + 516 tests verts, **0 skippé** |
| **Simplifications temporaires (09 §5.7)** | lecture intégrale du diff | **aucune.** Aucune crypto affaiblie, aucun garde-fou de sync relâché |
| **Code orphelin** | chaque export nouveau | **aucun** — `travailKdf`, `BORNES_KDF`, `verifierParametresKdf`, `verifierPolitiqueMotDePasse`, les quatre erreurs et `DonneesSansCoffreError` sont tous consommés, et rattachés à **E33**/**E38** par les en-têtes de fichier |
| **Étage 1 (09 §5.9)** | `AMELIORATIONS.md` | **0 fiche, 0 ligne ajoutée** ; plafond de 0,5 j **sans objet**. Les ajustements d'écran (`new-password`, `minLength`, aide dédiée au premier usage) sont **dans** le périmètre de F-23, qu'A51 demandait de fermer « au coffre **et** à l'écran ». Seul **R8** sort du périmètre |
| **Fiche d'étage 2 implémentée d'avance** | `AMELIORATIONS.md` vs diff | **aucune** — A-008 (AAD) reste non implémentée, conformément à son arbitrage |

---

## 7. LA FUSION DE `main` (`69251e6`) — MESURÉE, PAS RELUE

`node scripts/check-decisions.mjs` → **vert** (199 entrées, toutes au format 11 §9bis). Le seul
avertissement (« la date de l'entrée *Quel rôle accède au référentiel client* recule ») porte sur une
entrée du **2026-08-31** (`DECISIONS.md:5504`) : **antérieure à la fusion**, sans rapport avec elle.

| Fichier append-only | Base `508ae15` | Branche `5c1da28` | `main` `172b663` | Fusion `69251e6` | Verdict |
| --- | --- | --- | --- | --- | --- |
| `DECISIONS.md` (entrées `## `) | 187 | 193 | 193 | **199** | union stricte : 187 + 6 + 6 |
| `docs/ETAT.md` (blocs `## `) | 71 | 77 | 74 | **80** | union stricte : 71 + 6 + 3 |

Comparaison **ensembliste** des en-têtes : **0 entrée perdue, 0 entrée inventée** dans les deux
fichiers. Comparaison **ligne à ligne** contre chacun des deux parents : **0 ligne supprimée**
(`DECISIONS.md` +135/+96 · `docs/ETAT.md` +68/+117 · `AMELIORATIONS.md` +0/+38). Le dernier bloc
d'`ETAT.md` est bien le plus récent des deux côtés (2026-09-04 20h40 > 2026-09-03 14h30) : l'ordre
« le dernier bloc fait foi » est **préservé** — voir cependant **R7** sur ce qu'il dit.

**Aucun bloc perdu, aucune entrée coupée.** La fusion est propre.

---

## 8. CE QUI BLOQUE LA FUSION DE #30

**Rien.**

| Réserve | Bloque #30 ? | Échéance |
| --- | --- | --- |
| **R1** — bornes KDF à moitié fermées, quatre erreurs anglaises | **NON** — pas de régression ; la lettre de l'exigence A51 est tenue | **avant P-C**, et je recommande **dans cet incrément** : quatre lignes, testables sans navigateur |
| **R2** — glose ESLint fausse dans les deux sens | **NON** — aucun `modify` en production aujourd'hui | **avant L6a**, où la descente écrira par lots |
| **R3** — l'écran d'anomalie propose ce qu'il interdit | **NON** — mesuré : rien n'est détruit | **avant P-C** |
| **R4** — garde sur la valeur, glose sur la présence | **NON** — 2ᵉ ceinture opérante sur toute la collecte | **avant P-C** |
| **R5** — arbitrages non atteignables depuis la branche | **NON** — se referme au merge | le **commentaire** `coffre.ts:200-201` reste à corriger |
| **R6** — base Dexie non fermée | **NON** | quand on voudra |
| **R7** — `ETAT.md` sans bloc d'incrément | **NON** pour le code ; **OUI** pour la signature de fin d'incrément par A20 (11 §6) | **avant la signature A20** |
| **R8** — règle ESLint hors périmètre, sans trace | **NON** | **avant le contrôle A02** (étape 6) |

---

## 9. DÉSACCORDS À ARBITRER PAR A01

1. **R1 — « F-25 est-elle fermée ? »** A51 demandait de « plafonner `memoireKio` et `iterations` » :
   c'est fait. A51 motivait par « une valeur qui vient du stockage est une entrée non fiable » : ce
   n'est fait qu'à moitié. **Je ne tranche pas** entre la lettre et l'intention — je mesure les deux
   et je remonte. Si A01 lit F-25 dans son intention, R1 devient un préalable au merge ; s'il la lit
   dans sa lettre, R1 est un point de P-C. Dans les deux cas, **ce sera écrit**.
2. **R5 — le commentaire `coffre.ts:200-201`**, qui présente comme une réserve ouverte une question
   tranchée par A01 le 2026-09-04. Correction de commentaire ou nouvelle entrée : à A01 de dire
   laquelle, puisque c'est sa décision qui est mal citée.

---

## 10. DOUTES DE SPEC POUR `DECISIONS.md`

1. **Une ligne `meta` PRÉSENTE dont la valeur est `null` : « absente », ou « anomalie » ?** Le pack ne
   le dit nulle part. `jetons.ts` et `coffre-appareil.ts` ont chacun écrit leur doctrine (« `null`
   veut dire ABSENT, et rien d'autre ») **sans traiter ce cas-là**, qui tombe entre les deux. La
   réponse commande R4, et elle commandera le même choix pour `auth:refresh`, les curseurs de pull et
   les marques d'embarquement à L6a.
2. **Les paramètres KDF admissibles : un plafond, ou une liste fermée ?** L'arbitrage du 2026-09-04
   a tranché le **plafond de travail** (`× 4`, amarré au profil). Il ne dit rien de `longueurOctets`,
   pour lequel un plafond n'a pas de sens : AES n'accepte que 16, 24 ou 32. C'est le fond de R1.
3. **Un message d'anomalie peut-il citer les VALEURS des paramètres KDF ?** 11 §2 interdit les données
   personnelles ; le code s'est imposé plus large (« les CHEMINS, jamais les VALEURS ») et déroge
   soixante lignes plus loin. La règle utile est probablement « aucune valeur **chiffrée ni
   personnelle** », mais elle n'est écrite nulle part (O1).

---

## 11. SIGNATURE

**VERDICT : ACCEPTÉ SOUS RÉSERVE — 0 BLOQUANT, 3 MAJEURS, 5 MINEURS, 3 OBSERVATIONS.
Aucune réserve ne bloque la fusion de #30.**

Les trois constats de sécurité sont fermés là où A51 les avait ouverts, et ils sont fermés
**structurellement** : `lireCoffreAuRepos` lève au lieu de mentir, `initialiserCoffre` refuse au lieu
de recréer, une seconde ceinture compte les lignes avant de « préparer », la politique de mot de
passe s'applique au choix et jamais à l'ouverture, et les paramètres relus du stockage sont refusés
aux trois niveaux. Je l'ai mesuré, pas relu.

Ce que la revue croisée ajoute tient en une phrase : **partout où une glose a été écrite pour dire ce
que le code fait, elle dit un peu plus que lui** — la garde « de présence » lit une valeur (R4), les
bornes « du budget » admettent quatre jeux inexécutables (R1), et la règle ESLint réécrite le jour
même pour cesser de promettre ce qu'elle ne faisait pas promet encore `.modify()` et jure épargner
des `Map` sur lesquelles elle mord (R2). Ce n'est pas de la négligence : c'est la limite exacte de ce
qu'une auto-revue peut voir sur son propre texte, et c'est la raison d'être de l'étape 4.

**Rappel : je ne produis rien (09 §1, §5.6).** Aucun fichier de production, de test ou de
configuration n'a été modifié. `git status` propre avant cette revue, ne portant que ce fichier
après.

**Signature revue croisée : A29 — 2026-09-05 (UTC), sur `lot/l5a` @ `ba38847`.**
