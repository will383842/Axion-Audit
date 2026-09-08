# DOSSIER ZAP — porte P-C, point 7 — analyse A51 — 2026-09-08

> **Livrable de sécurité offensive (A51), en lecture seule sur le code** — `git status --porcelain`
> vide avant et après. Transcription par le pilote, sans amendement.
> **Objet** : instruire les **7 familles WARN** qui bloquent la bascule `ZAP_BLOQUANT`, et dire si
> elle est possible. `docs/ETAT.md` (2026-09-07) : « basculer AUJOURD'HUI rendrait `main` ROUGE sur
> les trois cibles ; la bascule exige d'abord de traiter ou d'ignorer explicitement ces sept familles ».
> **Sources** : journal du job `101756583935` (run `34125104959`) · **artefact
> `rapport-zap-34125104959` récupéré et dépouillé** (`jq` sur les trois `rapport-zap.json` — le
> décompte par sévérité que le bloc ETAT du 13h30 déclarait illisible) · relevé `curl` en direct sur
> `https://audit-staging.axion-ia.com` le 2026-09-08.

---

## VERDICT : 🟠 RÉSERVES

**Zéro faille bloquante.** Une alerte **Medium réelle** (10055), une famille **Low réelle** (90004),
**cinq informationnelles dont quatre structurellement inguérissables**. Et **deux constats hors-ZAP
qui comptent plus que les sept familles** (§4-A, §4-B).

Décompte confirmé, identique sur les trois cibles : `FAIL-NEW 0 · WARN-NEW 7 · PASS 63`,
codes `terrain=2 console=2 api=2`.

---

## 1. Les sept familles, une par une

| # | Nom réel (risque) | Cibles | Verdict | Preuve |
| --- | --- | --- | --- | --- |
| **10055** | `CSP: style-src unsafe-inline` — **Medium (High)** | 3/3 | **VRAI DÉFAUT** — c'est le réexamen déjà dû | `Caddyfile:217` ; `DECISIONS.md:209-234` impose le réexamen **au L5c, à porter au dossier P-C** |
| **90004** | `COOP/COEP/CORP Header Missing or Invalid` — **Low (Medium)**, 3 alertes | 3/3 (9, 9, 12 inst.) | **VRAI DÉFAUT mineur, cause unique** | Le bloc `header` de `Caddyfile:177-218` n'en pose **aucun**. `/api/v1/health` **n'est PAS** dans les instances : helmet les pose côté API (`app.ts:94`) |
| **10015** | `Re-examine Cache-control Directives` — Informational | 3/3 | **Faux positif de sécurité, vrai signal ailleurs** | `Caddyfile:225-230` ne pose de `Cache-Control` que sur `sw.js`/manifeste/assets — **rien sur `index.html`**. Voir §4-B |
| **10049** | `Storable and Cacheable Content` — Informational | 3/3 | **FAUX POSITIF** — la règle décrit la configuration **voulue** | `immutable` sur les assets empreintés (`:229-230`), `no-store` sur le manifeste (`:225-226`), conformément à §31 |
| **10094** | `Base64 Disclosure` — Informational | 3/3 | **FAUX POSITIF, prouvé** | Inst. 1 = nom de police empreinté par Vite ; inst. 2 = **table d'encodage de `hash-wasm`** (Argon2id, 11 §1). Zéro donnée encodée, zéro secret |
| **10109** | `Modern Web Application` — Informational | 3/3 | **FAUX POSITIF STRUCTUREL, ineffaçable** | C'est le constat que **11 §2 impose** (Vite + React, Next interdit) |
| **90005** | `Sec-Fetch-* Header is Missing` — Informational, 4 alertes | 3/3 (12, 16, 8 inst.) | **FAUX POSITIF STRUCTUREL, ineffaçable** | Règle sur la **requête** : `Sec-Fetch-*` est posé par le **navigateur**. L'araignée ZAP ne les émet pas |

### La cause commune, trouvée

Les sept familles sont identiques sur les trois cibles **pour une raison mécanique** : les trois
traversent le **même snippet `(securite)`** (`Caddyfile:164-218`), importé deux fois (`:244`, `:282`).
**Il n'y a pas trois surfaces, il y en a une.** Et l'araignée requiert `/robots.txt` et `/sitemap.xml`
à la racine quel que soit le point d'entrée : **une alerte du rapport `api/` n'est pas une alerte de
l'API** (vérifié : sur les 4 instances de 10055 du rapport `api/`, aucune n'est `/api/v1/health`).

**Donc 90004 se ferme en trois lignes, une seule fois, pour les trois cibles.**

---

## 2. Classement en trois piles

### (a) À CORRIGER — vrai défaut, remède connu — ≈ 0,35 j

| Famille | Remède | Exigence |
| --- | --- | --- |
| **90004** | Ajouter au bloc `header` (`Caddyfile:177-218`) : `Cross-Origin-Opener-Policy "same-origin"`, `Cross-Origin-Resource-Policy "same-origin"`, `Cross-Origin-Embedder-Policy "require-corp"`. Tout est déjà same-origin — **à prouver par e2e, pas à affirmer** | 06 §10.2, E36/E43 |
| **10015** (HTML) | `Cache-Control: no-cache` sur `index.html` (§31, éviter une coquille périmée épinglée) | §31 |

**Vigilance `require-corp`** : seul des trois qui peut casser (il exige un CORP explicite sur toute
ressource cross-origin). Repli : `credentialless`. Décision en pile (c), remède borné.

### (b) À IGNORER EXPLICITEMENT — justification à versionner

**Aucune des quatre ne peut être fermée par du code.** C'est ce qui change la nature du débat (§5).

| Règle | Justification à versionner |
| --- | --- |
| **90005** | Règle portant sur la **requête du scanner**. Aucun code du produit n'y a prise. Ignorée en tant qu'**artefact de méthode**, pas en tant que risque accepté |
| **10109** | Constate que l'application est une SPA — ce que **11 §2 impose**. La règle décrit une contrainte du pack |
| **10094** | Deux instances, **toutes deux tracées** (police Vite, table `hash-wasm`). **À réexaminer si le compte d'instances augmente** — seule des quatre où un vrai secret pourrait un jour se cacher |
| **10049** | Décrit la politique de cache **voulue et écrite** (§31). La règle signale la conformité, pas l'écart |

---

## 3. Le réexamen L5c de la concession CSP — FAIT, et il change la donne

`DECISIONS.md:232-234` imposait : « **Réexamen imposé au lot L5c** […] compter les styles inline
réellement subsistants et, si le compte est faible, basculer sur des hachages statiques. **À porter au
dossier de la porte P-C.** » Le mandat est répété dans `Caddyfile:203-215` (« NE PAS SUPPRIMER CETTE
LIGNE SANS AVOIR FAIT CE COMPTAGE »). **Il n'avait pas été fait.** Le voici.

| Mesure | Résultat |
| --- | --- |
| `style=` dans le HTML servi (`/`, `/hq/`) | **0** |
| `<style>` dans le HTML servi | **0** |
| `style={{ }}` dans les sources TSX | **6** — et React les applique via **CSSOM**, que `style-src` **ne régit pas** |
| `createElement("style")` / `cssText` / `insertRule` / `adoptedStyleSheets` dans les bundles | **0** |
| **Radix / shadcn/ui dans l'arbre de dépendances** | **ABSENTS** des trois `package.json` |

**La concession `style-src 'unsafe-inline'` n'a, à ce jour, AUCUN consommateur.** Le motif écrit le
2026-08-27 — « les attributs `style` que Radix et shadcn/ui posent à l'exécution » — décrit des
dépendances **non installées** et un mécanisme **non soumis à `style-src`**.

**La contrepartie, et elle est technique** : shadcn/ui est **imposé par 11 §1** et arrivera. Une
`Dialog`/`Popover` Radix amène `react-remove-scroll`, qui **injecte un vrai `<style>` à l'exécution**
avec un contenu calculé — **non hachable de façon stable**. Le comptage est vrai **aujourd'hui**, pas
éternellement.

**Recommandation A51 à A01** : retirer `'unsafe-inline'` de `style-src` **et** poser en même temps une
garde e2e qui affirme la chaîne CSP servie. Car — vérifié — **aucun test du dépôt n'assert un seul
en-tête de sécurité** (§4-C). Sans cette garde, l'arrivée de shadcn rouvrirait le trou **en silence**.
Coût ≈ 0,5 j. Bénéfice : **la seule alerte Medium du dossier disparaît**. Si A01 préfère conserver la
concession, elle devient une **ligne de risque accepté** datée, pas un oubli.

### 3bis. Balayage complet du dépôt — confirmation, et une précision pour l'arbitrage

Périmètre : `*.ts`, `*.tsx`, `*.mjs`, `*.caddy`, `Caddyfile`, `*.yml`, hors `node_modules` et
worktrees. **`'unsafe-inline'` n'apparaît QU'À UN SEUL ENDROIT** : `Caddyfile:217` (la directive
agissante) et `:203, 205, 210` (l'encadré qui la justifie).

Trois conséquences :

1. **§4-C est confirmé sur un périmètre plus large** que la première vérification (qui portait sur
   `e2e/`, `apps/api/tests/`, `infra/`) : en incluant tous les `*.yml` et tous les `*.tsx`, **aucun
   test, aucun workflow, aucune garde n'assert la chaîne CSP**. L'argument en faveur de la bascule
   en sort renforcé, indépendamment des sept familles.
2. **Le rayon d'action d'un retrait est d'UNE ligne.** Aucun test à réécrire, aucun instantané à
   régénérer. L'essentiel du coût de 0,5 j est la **garde e2e à créer** et le `verify` complet en
   navigateur, pas la modification.
3. **Précision pour A01, dans le sens de la prudence** : l'encadré `Caddyfile:203-215` dit « NE PAS
   SUPPRIMER CETTE LIGNE SANS AVOIR FAIT CE COMPTAGE ». Le comptage est fait. Mais si A01 tranche
   pour le retrait, **l'encadré ne doit pas disparaître avec la directive** — il doit être réécrit
   pour dire ce qui a été mesuré, quand, et à quelle condition la concession reviendrait (l'arrivée
   de Radix / `react-remove-scroll`). **Effacer la trace d'une concession en même temps que la
   concession, c'est perdre la raison qui la ferait rouvrir en silence** : l'invariant 7 vaut aussi
   pour les commentaires de configuration.

---

## 4. Ce que ZAP ne dit pas, et qu'A51 a trouvé en cherchant la cause commune

### A. La CSP de l'API est écrasée par Caddy — et le commentaire du code affirme le contraire

`apps/api/src/app.ts:82-84` dit : « la CSP applicative est portée par Caddy […] **tout est donc
verrouillé à `'none'`** », et `:86-91` pose bien `defaultSrc: ["'none'"]`. **Mesuré**
(`curl -D - .../api/v1/health`) : la réponse porte `default-src 'self'; script-src 'self'
'wasm-unsafe-eval'; … style-src 'self' 'unsafe-inline'` — celle de **Caddy**. Trois en-têtes le
prouvent indépendamment (`Referrer-Policy`, `X-Frame-Options` = valeurs Caddy ; `COOP`,
`Origin-Agent-Cluster` = valeurs helmet). **La CSP `'none'` de l'API n'atteint jamais le client.**

Impact **aujourd'hui faible** (JSON + `nosniff`), **réel demain** : le protocole de chunks §9.6 (L6c)
prévoit le **download via l'API en streaming**. Un fichier téléversé serait alors servi sous
`script-src 'self'`, non `'none'`. **Piège armé, pas faille active.** Et c'est, au sens strict, **un
commentaire qui ment** dans un dépôt qui a nommé ce défaut (F-31). → **escalade**.

### B. `Cache-Control: no-store` absent des réponses API authentifiées

`grep -rn -i "cache-control" apps/api/src/` → **une seule ligne** (`routes/export.ts:111`). Toutes les
autres routes JSON — `users`, `missions`, `scoping`, `interviews`, `pilotage` — répondent **sans
`Cache-Control`**. Sur une tablette terrain partagée, un JSON portant `person_name` ou du
`scoping_financials` peut rester en cache disque après déconnexion. **ASVS L2 V8.2.1.** **Le scan ne le
verra jamais : il est non authentifié.** Remède : hook `onSend` global. → **escalade**.

### C. Aucun test n'assert un en-tête de sécurité

`grep -rln "Content-Security-Policy\|Strict-Transport-Security"` sur `e2e/`, `apps/api/tests/`,
`infra/` → **vide**. Un `git revert` malheureux sur `Caddyfile:177-218` retirerait HSTS, CSP, `nosniff`
et `X-Frame-Options` **sans faire rougir un seul test**. Aujourd'hui le seul filet est ZAP — **et il
n'est pas armé**. C'est l'argument le plus fort en faveur de la bascule, indépendamment des sept familles.

### D. Moindre portée

- `/robots.txt` et `/sitemap.xml` rendent `index.html` en 200 (repli SPA, `fronts.static.caddy:131`,
  `:169`) : **la même page comptée trois fois** gonfle le nombre d'instances. Sans conséquence.
- **`X-Robots-Tag: noindex, nofollow` n'est PAS servi sur staging** — il n'existe que dans le bloc 2
  (`Caddyfile:287`), et staging est servi par le bloc 1, comme le fichier l'annonce lui-même
  (`:277-280`). L'intention « l'outil est confidentiel » **n'est pas tenue là où elle était écrite**.
  → escalade, gravité basse.

---

## 5. Recommandation de bascule, et la manière

### Quand : **PAS maintenant. PAS « jamais » non plus. Après la pile (a), et jamais sans fichier de règles.**

Basculer aujourd'hui : `terrain=2 console=2 api=2` → `zap-verdict.sh:105-107` rend 1 par cible →
**`main` rouge sur les trois, à chaque déploiement et chaque nuit.**

### Le point dur, regardé en face

Le workflow écarte en toutes lettres « l'option 3 (rendre bloquant en excluant les règles gênantes) »
(`zap-baseline.yml:116-119`), et il a raison sur le fond. **Mais le dépouillement change une prémisse :
quatre des sept familles (90005, 10109, 10094, 10049) ne peuvent être fermées par AUCUNE modification
du produit.** Elles ne sont pas « gênantes », elles sont **structurelles** : deux décrivent la méthode
du scanner, deux décrivent une conformité voulue par le pack. Il n'existe **aucun état du code** où
`zap-baseline.py -a` rend 0 sur ces cibles.

> **Sans fichier de règles, `ZAP_BLOQUANT='true'` n'est pas « exigeant », il est INATTEIGNABLE.
> Et une garde inatteignable finit désarmée — c'est-à-dire F-31, une troisième fois.**

La ligne de partage n'est donc pas « exclure ou ne pas exclure », mais : **exclure une règle pour
verdir un job** (interdit, non recommandé) contre **nommer par écrit, règle par règle, avec sa
justification technique et sa date, ce que ce scanner ne peut pas mesurer** (nécessaire pour que le
reste morde). Le fichier de règles rend la différence **relisible** — ce que sept familles vivant dans
un `::warning` que personne n'est obligé de lire ne fait pas.

### Le cliquet — cinq gestes ordonnés

1. **Corriger la pile (a)** — les trois en-têtes d'isolation et le `Cache-Control` de l'HTML. Si A01
   tranche pour le retrait de `'unsafe-inline'` (§3), **10055 et 90004 disparaissent ensemble** et il
   ne reste que les quatre structurelles.
2. **Créer `.zap/rules.tsv`** (n'existe pas ; aucun `-c` dans le workflow), passé par
   `-c /zap/wrk/rules.tsv`. Une ligne = **une justification technique + une date de réexamen**. Ce
   fichier est du code : **revue croisée**, et un ajout de ligne est visible dans un diff.
3. **Prouver le 0 AVANT de basculer** — `workflow_dispatch` avec le fichier de règles et
   `ZAP_BLOQUANT` **encore à `'false'`**. Si les trois codes rendent 0, la bascule devient une
   **observation**, plus un pari. Sinon, on a appris quelque chose sans rien casser.
4. **Basculer** `ZAP_BLOQUANT: 'true'` **et** épingler `ZAP_IMAGE` sur le digest du run de l'étape 3,
   **dans le même commit**, à la porte, par Williams (`zap-baseline.yml:137-142`).
5. **Retrait ligne par ligne**, chaque ligne portant sa date de réexamen.

**Ce que ce chemin achète** : dès l'étape 4, **toute huitième famille** — régression d'en-tête, CDN
introduit par mégarde, cookie sans `Secure` au scan authentifié — sort en `WARN-NEW`, donc code 2,
donc **`main` rouge**. C'est le filet qui manque (§4-C).

**Tension non tranchée** : épingler le digest **et** ignorer quatre règles gèle le scanner deux fois
(`zap-baseline.yml:200-204` : « un scanner figé cesse silencieusement de détecter les classes de défaut
apparues après son gel »). Piste soumise à A01/Williams : garder le **cron nocturne sur `:stable` en
mode non bloquant** comme sentinelle, la porte de déploiement tournant sur le digest épinglé.

**Risque résiduel assumé** : `-a` (règles passives alpha) est actif ; sur `:stable` mobile, une règle
alpha neuve peut rougir `main` sans qu'une ligne du produit ait bougé. L'épinglage le neutralise — et
c'est un argument de plus pour épingler **au moment même** de la bascule.

---

## 6. Ce qui reste dû à Williams

**Le compte de test de staging.** L'arbitrage A01 du 2026-09-05 dit « authentification comprise » ;
aucun secret applicatif ne vit dans les workflows. **Aucun agent ne peut créer ce compte.** Tant qu'il
manque :

- **`Set-Cookie` n'est jamais observé** — donc `httpOnly` / `Secure` / `SameSite=Lax` (11 §3) ne sont
  **vérifiés par aucun scan**. Les règles 10010, 10011, 10054 sont comptées « PASS » **faute d'avoir
  vu un seul cookie**. Un PASS qui ne prouve rien, et c'est le genre de vert qu'il faut savoir lire.
- Le `no-store` des réponses authentifiées (§4-B) reste hors de portée du scan.
- **Le point 7 de P-C n'est pas coché par cette extension** : le scan passif ne teste ni RBAC, ni
  `scoping_financials`, ni la propriété des écritures de sync. **Ces murs relèvent des intrusions
  croisées de P-B, pas de ZAP** — la bascule ne doit pas être présentée comme les couvrant.

**Décisions attendues de Williams** : ① le compte de test de staging et son secret ; ② l'arbitrage sur
`10055` via A01 ; ③ la bascule, à la porte, selon la séquence §5.

---

## 7. Ce qu'A51 n'a PAS pu vérifier

- **Aucun scan rejoué** : pas de démon Docker sur cette machine. Le `0/0/0` de l'étape 3 est une
  **prédiction argumentée, pas une mesure** — c'est pourquoi elle est **avant** la bascule.
- **L'effet réel de `require-corp`** sur la PWA (photos `blob:`, icônes `data:`, WASM Argon2id) :
  théoriquement sans effet, **non mesuré**.
- **`style-src` sans `'unsafe-inline'` en usage réel** : mesuré sur les sources et les bundles, **pas
  dans un navigateur**.
- **Le build déployé n'est pas le build local** (`index-D1nCp27H.js` vs `index-CtkHRooq.js`) : les
  mesures de bundle portent sur le **bundle déployé, téléchargé** ; le comptage des dépendances porte
  sur l'arbre local à `cde4f10`.
- Aucune règle active, aucune injection, aucun test d'autorisation — hors objet.

---

## 8. Doutes de spec à porter en `DECISIONS.md` (A01)

1. **Le pack ne dit nulle part si un fichier d'exception ZAP par règle est admissible.** Le workflow
   rejette « l'exclusion des règles gênantes » ; il ne dit rien des règles **structurellement
   inguérissables**. Sans réponse, `ZAP_BLOQUANT='true'` est inatteignable.
2. **06 §10.2 énumère « HSTS, CSP stricte, X-Content-Type-Options ». COOP/COEP/CORP n'y figurent pas.**
   Les ajouter est-il un durcissement autorisé ou un amendement de spec ?
3. **`07` §13 exige une « revue OWASP ASVS niveau 2 avant la mission du client pilote ».** Aucun
   document du dépôt ne porte de **matrice ASVS L2 contrôle par contrôle**. Échéance et format non fixés.

---

```
Piles :  (a) 90004 + Cache-Control HTML ≈ 0,35 j  ·  (b) 90005, 10109, 10094, 10049
         (c) 10055 [A01] · require-corp [A01] · bascule + digest + rules.tsv [Williams]
         Hors ZAP à escalader : CSP API écrasée par Caddy · no-store API authentifiée · X-Robots-Tag
Bascule : PAS maintenant · PAS sans fichier de règles · APRÈS la pile (a) et APRÈS un run à 0/0/0
Signature verdict sécurité : A51 — 2026-09-08
git status --porcelain → VIDE avant et après. Aucun fichier du dépôt écrit par A51.
```
