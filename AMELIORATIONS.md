# AMELIORATIONS.md — Registre du canal d'amélioration (09 §5.9)

> **Fichier APPEND-ONLY**, même format que `DECISIONS.md`.
> Autorisation explicite de Williams : _si l'implémentation révèle un manque pour que l'outil soit
> extrêmement professionnel, l'autopilote PEUT l'ajouter — dans CE cadre, jamais en dehors._
>
> **Étage 1 — micro-améliorations, autorisées D'OFFICE.** Confort et robustesse évidents (libellé
> plus clair, état vide manquant, tri par défaut, message d'erreur, raccourci, focus) qui ne touchent
> **NI le schéma 04, NI l'API, NI la crypto, NI le périmètre fonctionnel**.
> **Plafond : 0,5 j cumulé par lot.** Une ligne par ajout, relue par le réviseur croisé.
>
> **Étage 2 — fonctionnalités manquantes : PROPOSÉES, JAMAIS implémentées avant arbitrage** (11 §8.7 —
> « la proposer est un devoir, l'anticiper est une faute »). Fiche complète, arbitrée par Williams
> **à la porte suivante** : **ABSORBÉE** (budget sur la marge, 2 j max en Phase 1) · **PHASE 2** (le
> défaut) · **REFUSÉE**. Le fichier 04 reste inviolable hors de la révision de spec de P-D.
>
> Le gardien A02 vérifie à chaque étape 6 que **tout code non tracé E1-E47 a sa ligne ici** — le code
> orphelin est refusé.

---

## Compteur du plafond étage 1

| Lot  | Consommé | Plafond | Reste                     |
| ---- | -------- | ------- | ------------------------- |
| L0   | ~0,5 j   | 0,5 j   | 0 j (**plafond atteint**) |
| L1   | ~0,3 j   | 0,5 j   | ~0,2 j                    |
| L0-b | ~0,25 j  | 0,5 j   | ~0,25 j                   |
| L2   | ~0,3 j   | 0,5 j   | ~0,2 j                    |
| L3a  | ~0,1 j   | 0,5 j   | ~0,4 j                    |

---

## ÉTAGE 1 — micro-améliorations appliquées

_(voir « Journal du lot L0 » plus bas)_

---

## ÉTAGE 2 — fiches en attente d'arbitrage

_(voir « Journal du lot L0 » plus bas)_

---

## ÉTAGE 2 — fiches arbitrées

_(aucune à ce jour)_

---

# JOURNAL DU LOT L0

## ÉTAGE 1 — micro-améliorations appliquées

### 2026-08-27 — [L0] Sceau d'intégrité du pack (`pnpm check:pack`)

**Constat terrain :** un `pnpm format` a reformaté les 12 fichiers du pack sans que personne ne le
demande (724 insertions, 468 suppressions). Rien dans le dépôt ne l'a signalé — c'est A55 qui l'a
remarqué en passant, dans une note d'observation de fin de rapport.

**Ajout :** `scripts/check-pack-integrity.mjs` + `docs/.pack-integrity.json` (empreintes SHA-256 des
12 fichiers), câblé en `pnpm check:pack`. Toute dérive du pack rend le contrôle rouge et affiche la
marche à suivre ; le resceller exige `--sceller`, geste explicite réservé à un amendement décidé.

**Pourquoi c'est de l'étage 1 :** robustesse évidente, ne touche NI le schéma 04, NI l'API, NI la
crypto, NI le périmètre fonctionnel. Coût réel : ~0,1 j (script + sceau + épreuve du contrôle).

**Éprouvé :** un octet ajouté à `00_INDEX.md` → sortie 1 avec message ; `git checkout` → vert.
Un contrôle non éprouvé n'est pas un contrôle.

**Relu par :** revue croisée du lot L0 (étape 4) · **Trace :** DECISIONS.md 2026-08-27
« Prettier ne touche pas au pack — et le pack est désormais scellé »

---

## ÉTAGE 2 — fiches en attente d'arbitrage

### FICHE A-001 — Hooks `PreToolUse` pour rendre mécaniques les périmètres d'écriture des agents

**Constat terrain (A55, lot L0) :** le frontmatter d'un sous-agent permet de retirer entièrement
`Edit`, `Write` ou `Bash`, mais **pas de restreindre l'écriture à un sous-arbre**. Les bornes écrites
dans les 40 gabarits — « A02 n'écrit que dans la matrice de traçabilité », « A16 n'écrit que dans les
tests », « A01 n'écrit que dans DECISIONS/ETAT/portes » — sont donc contractuelles et vérifiables
seulement **a posteriori**.

**Valeur pour l'auditeur :** indirecte mais réelle. Le dispositif du 09 repose sur la séparation
producteur/vérificateur (§5.6) et sur le droit de veto d'A02. Un vérificateur qui corrigerait
discrètement ce qu'il vérifie viderait la porte de son sens — et ce serait invisible dans un diff
volumineux. C'est le genre de garantie qu'un client grand compte demande à voir quand il audite notre
propre chaîne de production (§10.5, réversibilité et journal d'audit).

**Ce qui existe déjà et limite l'urgence :** les trois réviseurs croisés (A17, A29, A37) n'ont
**ni `Edit` ni `Write` du tout** — le risque le plus grave est donc déjà fermé mécaniquement. A55 n'a
pas `Bash`. L'étape 4 relit l'intégralité du diff.

**Coût estimé :** 0,5 à 1 j — un hook `PreToolUse` par famille de rôles dans `.claude/settings.json`,
une table périmètre → chemins autorisés, et des tests de non-régression sur le hook lui-même (un hook
qui bloque à tort est pire qu'aucun hook : il pousse à le désactiver).

**Impact schéma / API / crypto :** **aucun.** Outillage d'autopilote exclusivement.

**Recommandation d'A01 :** **PHASE 2** (le défaut). En Phase 1, cette dépense se prendrait sur le
noyau strict de 26 j-h alors que le risque résiduel est couvert par la revue croisée et par
l'absence totale d'écriture chez les réviseurs. À reconsidérer si un incident réel survient — auquel
cas cette fiche porte déjà l'analyse.

**Arbitrage Williams :** ☐ ABSORBÉE ☐ PHASE 2 ☐ REFUSÉE — _à la porte P-A_

### 2026-08-27 — [L0] Contrôle de jonction appelant → appelé (`pnpm check:jonction`)

**Constat terrain :** la revue croisée du lot L0 a rendu NON CONFORME avec **7 défauts bloquants**,
tous de la même cause — trois agents ont livré en parallèle trois moitiés d'interface qui ne se
rejoignaient pas. La CI appelait `deploy.sh` sans ses arguments obligatoires, sondait `/api/health`
là où la route est `/api/v1/health`, entrait dans `/opt/axion-audit` quand le dépôt est cloné dans
`/opt/axion-audit/repo`, et invoquait des scripts `pnpm` inexistants.
**Aucun de ces défauts n'était visible depuis un seul fichier. Tous étaient évidents en en croisant
deux.** C'est précisément ce qu'une machine fait bien et qu'une relecture rate, parce qu'elle lit un
fichier à la fois.

**Ajout :** `scripts/check-jonction.mjs`, câblé en `pnpm check:jonction` et intégré à `pnpm verify`.
Trois jonctions contrôlées : tout `pnpm <script>` appelé par la CI existe · toute variable interpolée
par l'infrastructure est documentée au `.env.example` · tout `infra/scripts/*.sh` invoqué existe.

**Pourquoi c'est de l'étage 1 :** robustesse d'outillage, ne touche NI le schéma 04, NI l'API, NI la
crypto, NI le périmètre fonctionnel. Coût réel : ~0,2 j.

**Éprouvé, dans les deux sens.** Détecte : un script `pnpm` inexistant injecté dans `ci.yml`, une
variable non documentée injectée dans le Compose. Ne crie pas à tort : deux faux positifs mesurés sur
le dépôt réel (`echo "pnpm activé"` lu comme un appel au script « activ », et `pnpm --version | cut`
lu comme un appel à « cut ») ont été corrigés avant livraison — un contrôle qui crie à tort est un
contrôle qu'on finit par désactiver.

**Ce qu'il ne fait pas :** il ne remplace pas la revue croisée. Il lui rend le temps qu'elle passait
à croiser des tableaux, pour qu'elle le passe à juger.

**Relu par :** revue croisée du lot L0 (étape 4, seconde passe) · **Trace :** DECISIONS.md 2026-08-27
« Verdict de la revue croisée : NON CONFORME — et pourquoi c'est le système qui fonctionne »

### 2026-08-27 — [L0] Contrôle mécanique du format de `DECISIONS.md` (`pnpm check:decisions`)

**Constat terrain (gardien A02) :** il a mesuré à la main que **4 entrées sur 23** respectaient le
format 11 §9bis — dont celle au nom de laquelle `infra/scripts/backup-caddy.sh` existe dans le dépôt.
Appliqué à la lettre, le §9bis (« une décision non tracée dans ce format n'existe pas ») effaçait donc
une décision dont du code dépend. Et il a fait l'observation décisive : **la gouvernance de
`DECISIONS.md` était la seule règle du dépôt à reposer sur la seule discipline**, dans un lot dont la
revue croisée avait trouvé « trois garde-fous qui mentaient ou n'étaient branchés nulle part ».

**Ajout :** `scripts/check-decisions.mjs`, câblé en `pnpm check:decisions` et intégré à `pnpm verify`.
Il contrôle l'en-tête, les quatre champs, et la déclaration de précédence. Son exemption pour les
entrées antérieures est **lue dans `DECISIONS.md` lui-même** (section « Entrées régularisées »), pas
codée dans le script : une exemption invisible au lecteur du registre serait précisément le trou que
ce lot a passé sa journée à boucher ailleurs.

**Pourquoi c'est de l'étage 1 :** robustesse d'outillage, ne touche NI le schéma 04, NI l'API, NI la
crypto, NI le périmètre fonctionnel. **Le pack ne l'exige nulle part** — c'est une recommandation
d'A02, reprise parce que l'argument vaut partout ici. Coût : ~0,1 j.

**Relu par :** gardien A02 (recommandation) · **Trace :** DECISIONS.md 2026-08-27 « Régularisation de
format et mécanisation du contrôle »

### 2026-08-27 — [L0] Garde-fou d'exigibilité du fil rouge `@filrouge`

**Constat terrain (gardien A02) :** le lot a inventé l'auto-péremption pour le schéma, les tests
d'intégration et la couverture — chacun devient exigible mécaniquement au lot qui le concerne.
**`@filrouge` était le seul membre de cette famille sans garde-fou**, alors que le 09 §4bis dit
« toute porte l'exige vert » **dès L1**. Le mot n'apparaissait que dans des commentaires.

**Ajout :** troisième contrôle dans `check-test-projects.mjs` — dès que `apps/api/drizzle/` existe,
l'absence d'un test `@filrouge` couvrant **FIL-TPE et FIL-GC** devient bloquante.

**Éprouvé, et il s'est fait prendre à son propre piège** : à la première écriture, il se satisfaisait
de l'en-tête de `e2e/socle.e2e.ts`, qui annonce « L1 → fil rouge @filrouge sur FIL-TPE et FIL-GC »
pour documenter ce qui viendra. Un contrôle satisfait par de la **prose**. Les commentaires sont
désormais retirés avant l'analyse ; vérifié dans les deux sens (commentaire seul → rouge ; vrai test
marqué → vert).

**Pourquoi c'est de l'étage 1 :** robustesse d'outillage, aucun impact schéma/API/crypto/périmètre.
Coût : ~0,1 j.

**Relu par :** gardien A02 (recommandation) · **Trace :** dossier de porte `PORTE_A_2026-08-27.md` §5

---

## ÉTAGE 2 — fiches en attente d'arbitrage (suite)

### FICHE A-002 — Cloudflare R2 pour la copie de sauvegarde hors Hetzner

**Constat terrain (question de Williams, 2026-08-27) :** le 02 §11.4 impose la règle **3-2-1** —
sauvegarde locale, copie sur Storage Box Hetzner, **et « 2ᵉ copie hebdo HORS Hetzner (ex. Scaleway) »**.
Le pack **laisse le fournisseur ouvert** : « ex. » n'est pas une prescription. Le script
`backup-postgres.sh` prévoit déjà `OFFSITE_RCLONE_REMOTE` sans imposer de destination.

**Valeur :** R2 n'a **aucun frais de sortie**. C'est sans importance tant que rien ne va mal, et
décisif le jour d'un PRA — le moment où l'on rapatrie l'intégralité des sauvegardes est précisément
celui où les frais de sortie d'un stockage objet classique se déclenchent, sur un volume maximal, sous
la pression du RTO de 4 h. Un coût imprévisible pendant une reprise est un mauvais coût.

**Ce que ce n'est PAS :** un remplacement de MinIO. Le stockage applicatif est **imposé** par le
02 §4.2 et l'exigence E17 (« stack imposée ») ; le changer serait une modification de spec, pas une
amélioration. R2 ne concerne que la **troisième copie**.

**Condition impérative si retenue :** la juridiction R2 doit être **forcée sur l'UE**. Le 06 §10.4 est
sans ambiguïté — « hébergement : Hetzner Allemagne (UE). **Aucun transfert hors UE** sauf appel LLM
(couvert par DPA) ». Une copie de sauvegarde chez Cloudflare sans restriction de juridiction serait un
transfert hors UE de données d'entretiens de salariés, c'est-à-dire un manquement RGPD dans le
document même (AIPD) que le pack exige avant la première mission grand compte. À vérifier à la
souscription, pas après.

**Coût estimé :** ~0,25 j (un remote rclone supplémentaire, la restriction de juridiction, et
l'extension du test de restauration nocturne à cette troisième copie — une sauvegarde jamais
restaurée n'est pas une sauvegarde).

**Impact schéma / API / crypto :** **aucun.** Les archives partent déjà chiffrées ; R2 n'en voit que
des octets opaques.

**Recommandation d'A01 :** **ABSORBÉE au lot L0-b**, si Williams souscrit R2 en même temps que le VPS.
C'est le seul moment où cela ne coûte presque rien : les scripts sont ouverts, le runbook est en cours
d'écriture, et la troisième copie doit de toute façon exister avant la première collecte réelle.
Sinon **PHASE 2**.

**Arbitrage Williams :** ☐ ABSORBÉE ☐ PHASE 2 ☐ REFUSÉE — _à la porte P-A_

---

### 2026-08-27 — [L1] Garde-fou d'exigibilité du marqueur `@critique` (contrôle 4)

**Constat.** La commande d'urgence du pack, `pnpm test:critique`, sortait en **code 1** : son segment
Playwright échoue quand son filtre ne trouve rien, et aucun test Playwright ne porte `@critique` au
lot L1. Relevé en revue croisée (réserve M-1). Le correctif évident — `--pass-with-no-tests` — a un
prix caché : la commande ne peut plus échouer **par absence**, donc la disparition du test critique
sortirait en 0 sans rien exécuter.

**Ce qui a été ajouté.** Un contrôle 4 dans `scripts/check-test-projects.mjs` : dès que
`apps/api/drizzle/` existe, au moins un test doit porter `@critique`. **Prouvé par injection** —
marqueur retiré → code 1 avec le message qui explique quoi faire ; marqueur remis → vert.

**RÉÉCRIT le même jour, après la 2ᵉ passe de revue (réserve M-4).** La première version de ce
contrôle **annonçait plus qu'elle ne faisait** — exactement le défaut qu'elle prétendait empêcher.
Elle imputait la permissivité au seul `--pass-with-no-tests` de Playwright, et se contentait de
chercher la chaîne `@critique` **quelque part** dans les fichiers de test. Le réviseur l'a mise en
défaut **par exécution** :

```
npx vitest run --project unit -t "@filtre_qui_ne_matche_rien"
Test Files  1 skipped (1) · Tests  95 skipped (95) · EXIT = 0
```

Le segment **Vitest** est donc permissif lui aussi, et depuis toujours. Déplacer le marqueur vers un
test Playwright rendait `pnpm test:critique` vert **sans rien exécuter du tout** — et ce contrôle
vert avec lui. Il exige désormais que le marqueur vive dans un projet que le segment Vitest exécute
(`unit` ou `integration`). **Les deux branches d'échec sont prouvées par injection** : marqueur
absent, et marqueur présent mais hors des projets exécutés — cette seconde branche nomme les
fichiers fautifs, pour que le message dise quoi faire et pas seulement que c'est faux.

**Pourquoi c'est étage 1.** Ne touche ni le schéma 04, ni l'API, ni la crypto, ni le périmètre
fonctionnel. C'est un drapeau permissif payé de son garde-fou, selon le principe déjà appliqué au
lot L0 pour `--passWithNoTests`.

**Coût :** ~0,1 j.

---

### 2026-08-27 — [L1] Trois textes de garde-fou rendus exacts

**Constat.** Trois messages décrivaient un état révolu — le défaut exact que la revue croisée a
débusqué dans le comparateur, appliqué cette fois à la documentation des contrôles :

1. `scripts/check-test-projects.mjs` (contrôle 2) expliquait qu'il protégeait le drapeau
   `--passWithNoTests` de `pnpm test:integration` — **drapeau retiré depuis la livraison du L1**.
2. `scripts/check-invariants.mjs` annonçait l'invariant 7 comme « non mécanisable ». C'est désormais
   **partiellement faux** : la migration `0010` impose `NOT NULL` sur `changed_by`, `validated_by`,
   `validated_at` et `created_by` — une révision sans auteur est refusée par la base — et le diff
   schéma-vs-04 garde ces contraintes. Le texte distingue maintenant ce qui est mécanisé de ce qui
   reste à la revue.
3. `.github/workflows/ci.yml` gardait dans le job `schema-diff` une étape entière dont le commentaire
   ordonnait lui-même « **contournement à faire disparaître au L1** », plus une condition
   `if [ -d apps/api/drizzle ]` devenue toujours vraie. Retirées.

**Pourquoi cela compte.** Un contrôle vert dont l'explication est fausse enseigne au lecteur suivant
une règle qui n'existe plus. C'est le premier pas vers un garde-fou qui ment sur ce qu'il couvre.

**Coût :** ~0,05 j.

---

### 2026-08-27 — [L1] README de `packages/shared` et `packages/ui`

**Constat.** Les six espaces de travail avaient un README, sauf les deux paquets partagés — ceux dont
la mauvaise utilisation coûte le plus cher, précisément parce qu'ils sont partagés.

**Ce qui a été écrit.** `packages/shared/README.md` : la règle « une seule définition de chaque
chose », et l'avertissement que `redaction.ts` doit rester unique — l'API et le worker en ont un jour
porté deux copies, celle du worker ayant **dix champs de moins**, dont `password`, `token` et
`phone`. `packages/ui/README.md` : la charte, et **pourquoi** le rouge d'alerte est un carmin —
écart de teinte **mesuré** de 35,8° contre 19,8° pour le rouge écarté, contraste mutuel 1,94, valeurs
vérifiées par `tokens.test.ts` et non déclarées.

**Coût :** ~0,05 j.

---

### 2026-08-28 — [L1] `pnpm verify` cesse de dépendre de l'état de la machine

**Constat.** La suite E2E est sortie à **4 échecs sur 8** (front terrain,
`ERR_CONNECTION_REFUSED` sur 4173), puis **verte deux fois de suite, sans qu'une ligne ait
changé**. Un test intermittent est un test qui ment, et celui-ci mentait sur la commande qui sert de
vérité terrain à tout le pipeline (11 §9ter).

**Cause.** `playwright.config.ts` portait `reuseExistingServer: !enCI` — donc `true` en local.
Playwright sondait l'URL avant de démarrer son serveur et réutilisait tout ce qui répondait. Le
verdict de `pnpm verify` dépendait ainsi de ce qui traînait sur le port, pas du code. Signature
cohérente avec l'observation : les tests démarrent **sans attendre** — donc la sonde a répondu — puis
ne trouvent plus personne. Un `vite preview` résiduel, vivant à la sonde et mort pendant la course,
suffit.

**Ce qui a été changé.** `reuseExistingServer: false` sur les deux serveurs, en local comme en CI.

**Prouvé par injection, DANS LES DEUX SENS** — un serveur parasite occupant 4173 :

| Réglage           | Comportement observé                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `false` (nouveau) | `Error: http://127.0.0.1:4173/ is already used` · **code retour 1**, avant tout test |
| `!enCI` (ancien)  | parasite **réutilisé en silence** · 3 échecs **et 1 SUCCÈS**                         |

La ligne qui compte est la seconde. Le test « ne contacte AUCUN domaine extérieur » est passé **au
vert contre une page qui n'était pas l'application** — il a affirmé une propriété du produit en
regardant autre chose que le produit. Le faux positif n'est donc pas une crainte théorique : il est
reproduit.

**Pourquoi c'est le même défaut que la fiche A-003.** Réutiliser un serveur ambiant, c'est choisir le
**faux négatif silencieux** : `verify` peut aussi passer au vert servi par un `dist/` périmé, et
personne ne le saura. `--strictPort` sans réutilisation échoue **bruyamment**. Le sens de l'échec
s'inverse, exactement comme le schéma doré l'inverse pour le diff de schéma.

**Le prix, assumé.** Le développeur qui a un `pnpm dev` ouvert sur 4173 verra désormais la suite
refuser de partir. Trois secondes de gêne contre un verdict qui ne ment plus.

**Pourquoi c'est étage 1.** Ne touche ni le schéma 04, ni l'API, ni la crypto, ni le périmètre
fonctionnel : une clé de configuration de test.

**RÉSERVE DE GOUVERNANCE, à porter à la porte P-A.** Ce correctif est postérieur au contrôle
d'acceptation du gardien A02 (étape 6, verdict `ACCEPTÉ SOUS RÉSERVE` du 2026-08-28 00h40).
L'artefact accepté a donc bougé d'une ligne après son acceptation. Le défaut n'affecte que la
vérification LOCALE — la CI posait déjà `reuseExistingServer: false` via `!enCI` — donc le produit
livré est inchangé et aucun critère du fichier 07 n'est concerné. **Mention explicite est faite ici
pour que le gardien recoche s'il l'estime nécessaire ; ce n'est pas à l'agent qui corrige d'en
décider.**

**Coût :** ~0,1 j.

---

### FICHE A-003 — Schéma doré (`pg_dump`) à la place du manifeste comme base de comparaison

**Étage 2 — PROPOSÉE, NON IMPLÉMENTÉE.** Elle remplacerait un mécanisme que le contrat **11 §7 nomme
explicitement** (`schema-manifest.json`). Le 11 §8.2 réserve à Williams toute modification d'une
convention du contrat. **Proposer est un devoir, anticiper serait une faute.**

**Constat terrain — trois passes de revue croisée, trois territoires neufs.**

| Passe | Ce qu'elle a trouvé                                                    | Non détectées |
| ----- | ---------------------------------------------------------------------- | ------------- |
| 1ʳᵉ   | opérateur inversé, parenthèses supprimées, index UNIQUE non gardé      | 8 / 25        |
| 2ᵉ    | casse des littéraux, contrainte cherchée par nom seul, analyse d'index | 6 / 15        |
| 3ᵉ    | règles, triggers, RLS, EXCLUDE, IDENTITY, collation, partitionnement   | 8 / 13        |

**Ce n'est pas une série de négligences.** C'est la propriété d'une **liste blanche** : elle vérifie
ce qu'elle sait nommer, et son mode d'échec par défaut est le **faux négatif silencieux**. Chaque
correctif rétrécit un trou **sans dire s'il en reste**. La question « en reste-t-il ? » n'est
aujourd'hui répondable que par une passe de revue de plus.

**S'y ajoute une fragilité structurelle plus grave : rien ne compare mécaniquement le manifeste au
fichier 04.** Le manifeste est la RÉFÉRENCE — une erreur qui s'y loge est invisible pour toujours.
Ce n'est pas théorique : c'est exactement le bloquant B-4 de la 2ᵉ passe, **11 `NOT NULL` inventés**
que le diff imposait comme s'ils étaient la spécification.

**La proposition.** Committer un **schéma doré** produit par
`pg_dump --schema-only --no-owner --no-privileges`, et faire du contrôle un **diff textuel** entre ce
fichier et le dump de la base migrée, normalisé uniquement sur le volatile.

**Ce que ça change, et c'est le cœur :** le mode d'échec s'**inverse**. Faux positifs **bruyants et
visibles** au lieu de faux négatifs silencieux. Le réviseur a confronté ce mécanisme à ses propres
attaques : il **attrape les 6 mutations de la 2ᵉ passe et les 8 de la 3ᵉ**, règles, triggers,
politiques, EXCLUDE, identity, collation et partitionnement compris — **sans une ligne de logique de
comparaison**, parce qu'un dump montre tout ce que la base contient.

**Le manifeste n'est pas jeté, il est remis à sa place.** Il parle la langue du fichier 04, il porte
les **motifs** (`fkNonIndexees`, `identiteLisibleT13`, `defauts`) et il rend la revue **humaine**
possible. C'est un excellent **document de revue** et un mauvais **périmètre de contrôle**. Manifeste
= ce que Williams relit à la porte contre le 04 ; dump doré = ce que la machine garde. **Les deux, pas
l'un à la place de l'autre.** Le fichier doré étant **généré**, il ne peut pas dériver des migrations,
et ce que la porte relit devient son **diff à chaque changement** — objet de revue bien plus honnête
qu'un manifeste de 2 700 lignes.

**Valeur pour l'auditeur :** aucune, directement. Valeur pour la **fiabilité de ses données** :
décisive. Les six familles de la 3ᵉ passe incluent la disparition silencieuse d'une réponse et la
falsification d'une valeur.

**Coût estimé :** ~0,5 j (génération, normalisation du volatile, câblage CI, épreuve par injection).

**Impact schéma / API :** **aucun**. Impact **contrat** : le 11 §7 désigne `schema-manifest.json`
comme base de comparaison — l'adopter demande un amendement horodaté du contrat.

**Ce qui a été fait en attendant, et qui ne préjuge de rien.** Un **inventaire fermé** en liste noire
(`pnpm check:schema-inventaire`, DECISIONS du même jour) ferme les huit familles connues, dont les six
de la 3ᵉ passe. Il est **prouvé par injection**. Sa limite est écrite dans son en-tête : **sa liste
doit être maintenue** — c'est exactement le défaut que cette fiche propose de supprimer.

**Arbitrage attendu :** ABSORBÉE (0,5 j sur la marge) · **PHASE 2** (le défaut) · REFUSÉE.
**Recommandation d'A01 :** ABSORBÉE si la marge le permet — c'est le seul changement qui rende la
question « en reste-t-il ? » répondable autrement que par une quatrième passe de revue.

---

### 2026-08-28 — [L0-b] Deux garde-fous nés de déploiements ratés

**Constat.** Le premier déploiement réel du staging a échoué plusieurs fois, pour des causes
distinctes. Deux d'entre elles sont des **conventions propres à Coolify**, inconnues des trois autres
piles du dépôt, et qui n'étaient tenues que par des commentaires — A11 l'a signalé de lui-même en
livrant : « ce fichier a maintenant trois conventions qui divergent des autres piles et que rien
n'automatise ».

**`pnpm check:isolation-reseau`** — seul le service `caddy` peut rejoindre le réseau du proxy Traefik.
A54 a **mesuré** que ce réseau a l'ICC activé : tout conteneur qui le rejoint obtient une route
directe vers la base PostgreSQL et le Redis d'`axion-ia.com`. Ce n'est donc pas une élégance
d'architecture mais une **exigence de sécurité** (02 §30.4-4 : un secret de staging ne doit RIEN
pouvoir sur la production).

> **Rectifié le 2026-08-28 (gardien A02).** Cette fiche annonçait « _prouvé par injection dans **les
> deux formes possibles**_ ». **Il y en avait cinq**, et la première version du contrôle **en laissait
> passer trois** : elle cherchait le mot `edge` dans le texte du fichier, donc un réseau externe
> déclaré sous **n'importe quel autre nom** — ou hérité par `network_mode: "service:caddy"` — la
> traversait sans bruit. La propriété réellement gardée aujourd'hui n'est plus « personne n'écrit
> `edge` » mais : **aucun service autre que `caddy` n'obtient de route vers un réseau que cette pile
> ne crée pas elle-même**, sous quelque forme que ce soit. Le mot `edge` n'apparaît plus dans le code
> du contrôle. _Annoncer deux preuves quand on en a une, c'est exactement le garde-fou qui annonce
> plus qu'il ne fait._

**`pnpm check:compose-coolify`** — aucune interpolation dans un volume, et tous les chemins relatifs
résolus **depuis la racine** existent réellement. Chacune de ces deux règles a coûté un déploiement.

**Ce que ce second contrôle apporte et que Docker n'apporte pas**, et c'est ce qui justifie de
l'écrire plutôt que de s'en remettre à l'outil : `docker compose config -q` rend **EXIT=0 dans les
DEUX conventions**. Il valide la syntaxe, jamais l'existence des chemins. A11 l'a établi par la
contre-épreuve — sans le bon drapeau, le rendu donne `infra/infra/caddy/Caddyfile` **silencieusement**.
C'est très exactement ce qui a laissé passer le second échec.

**Pourquoi c'est étage 1.** Ne touche ni le schéma 04, ni l'API, ni la crypto, ni le périmètre
fonctionnel : deux garde-fous d'outillage, dans la lignée directe de `check:jonction` et `check:pack`.

**Coût :** ~0,2 j pour les deux, épreuves par injection comprises.

**Ce qui reste NON gardé, écrit plutôt que tu :** la duplication entre `docker-compose.coolify.yml` et
`docker-compose.yml` se reporte à la main. Un service ajouté à l'un et oublié dans l'autre ne serait
signalé par rien. C'est la troisième convention d'A11, et elle attend toujours son contrôle.

---

## 2026-08-28 — [L0-b] Étage 1 — La licence OFL-1.1 d'Inter doit partir dans `dist`

**Constat, mesuré.** Nous redistribuons deux fichiers `.woff2` d'Inter dans un build servi
publiquement. `grep -ril "SIL Open Font\|OFL"` sur `apps/field/dist` et `apps/hq/dist` ne rend
**rien** : les polices partent sans leur licence. Le texte existe pourtant à côté
(`node_modules/@fontsource-variable/inter/LICENSE`, 4 477 octets, `"license": "OFL-1.1"`).

**Valeur.** L'OFL-1.1 demande que la licence accompagne les fichiers **redistribués**. Raisonner sur
ce qui est vrai dans le dépôt ne répond pas à la question, qui porte sur ce qui **quitte** le dépôt.

Et ce qui pèse ici n'est pas le risque juridique, qui est faible : **c'est la cohérence**. Nous
construisons un outil dont le métier est de vérifier que les obligations d'autrui sont tenues et
documentées. Un manquement de conformité chez nous, si petit soit-il, est le mauvais exemple.

**Coût estimé :** ~0,1 j. Le texte accompagne les fichiers de police dans le build — fichier servi
sous un chemin dédié, ou bandeau de commentaire dans le CSS émis. La forme est libre à condition que
**le texte parte réellement dans `dist`** : une mention qui reste dans le dépôt ne satisfait pas la
clause. Un test de recette naturel : `grep` de « SIL Open Font » dans chaque `dist`.

**Impact schéma / API :** aucun. **Étage 1** — ne touche ni le schéma 04, ni l'API, ni la crypto, ni
le périmètre fonctionnel. Arbitré en `DECISIONS.md` le 2026-08-28 (A01, sur signalement d'A21).

---

## 2026-08-28 — [L1] Étage 1 — `seed.mjs --empreinte` dépend de la collation de la base

**Constat, mesuré.** `seed.mjs --empreinte` calcule ses 8 empreintes avec
`string_agg(t::text, '|' ORDER BY t::text)`. Ce tri suit `datcollate`. Sur **les mêmes six valeurs**,
deux bases au contenu identique rendent deux chiffres différents :

```
postgres:16-alpine, locale C   → SERVICE, Service client, _a, elan, service_client, Élan → 70aa736df252…
image du dépôt,     en_US.utf8 → _a, elan, Élan, SERVICE, service_client, Service client → d9cc81a26715…
```

**Aujourd'hui c'est inoffensif**, et c'est pourquoi ce n'est pas un correctif urgent : les deux
mesures de son test `@critique` ont lieu sur **la même base**, donc la propriété qu'il prouve
(rejouer le seed ne change rien) reste vraie. `apps/api/tests/l1-seed.integration.test.ts` recalcule
l'empreinte avec la même formule et hérite de la même fragilité, tout aussi inoffensive pour la même
raison.

**Valeur.** Le piège est **latent et se déclenche précisément là où l'on cherche à prouver quelque
chose** : le jour où quelqu'un compare l'empreinte d'une base à celle d'une autre — une restauration,
un environnement neuf, une image de base différente — il obtiendra un écart qui ne veut rien dire, et
le lira comme une dérive de données. Un instrument de mesure qui fabrique de faux positifs coûte plus
cher qu'une absence d'instrument.

**Coût estimé :** ~0,2 j. L'outil `apps/api/scripts/empreinte-seed.mjs`, livré le même jour, montre
déjà la voie : tri **octet par octet en JavaScript** (`Buffer.compare`), hors de toute collation.
Reste à porter ce tri dans `seed.mjs` et dans le test — et **le test étant `@critique`, il ne peut
pas être retouché par l'auteur du correctif** (09 §5.6).

**Ce que ça ne corrige pas :** `seed.mjs --empreinte` restera un drapeau d'affichage posé sur le
seed, qui **écrit avant de mesurer**. Les deux outils répondent à deux questions différentes et
doivent coexister — c'est écrit dans `apps/api/README.md`.

**Impact schéma / API :** aucun. **Étage 1** — outillage de test uniquement.

---

## 2026-08-29 — [L0-b] Étage 1 — la rectification du burn-down ne descendait pas jusqu'à la phrase qui le lit

**Constat, mesuré.** `docs/journal/2026-08-28.md` porte une rectification encadrée du gardien A70 :
la ligne « L8 (scoring) » du burn-down était fausse, L8 étant **différable** hors des 26 j-h, et « le
noyau strict compte **huit lots + 2 j de marge de recette**, pas neuf lots ». **Deux lignes plus
bas**, la phrase de lecture disait encore « **Deux lots sur neuf** » — le comptage que la
rectification déclare faux, dans le même fichier, sous la rectification elle-même.

**Ajout :** phrase corrigée en « Deux lots sur huit », avec une seconde note encadrée qui dit ce qui
a été rectifié et quand. **Second défaut, trouvé en corrigeant le premier :** la note du 28 était
insérée **entre deux lignes du tableau**, ce qui en interrompt la syntaxe Markdown — la ligne
« Total | 26 j | ~4 j | ~22 j » ne s'affichait pas comme une ligne de tableau. Note déplacée après le
tableau. **Une seule modification de son texte, et elle est rendue nécessaire par le déplacement :**
« Cette ligne portait L8 » devient « **L'avant-dernière ligne** portait L8 » — la note n'étant plus
accolée à la ligne visée, « cette ligne » ne désignait plus rien. Tout le reste est inchangé au mot
près (le fichier est un journal : on ne réécrit pas son contenu).

**Valeur.** _Une correction qui répare le tableau et laisse debout la phrase qui le résume n'a corrigé
que la moitié de ce qui trompe_ : personne ne relit une colonne, tout le monde retient « deux sur
neuf ». C'est la famille traquée par ce dépôt, appliquée à une rectification.

**Coût :** ~0,05 j, documentaire. Le compteur du plafond étage 1 n'est pas modifié : ce n'est ni du
code ni de l'outillage, et le fichier est append-only.

**Impact schéma / API :** aucun. **Étage 1.**

---

## 2026-08-29 — [L0] Étage 2 — L'OBSERVABILITÉ (02 §11.3) N'EXISTE PAS, et aucun registre ne le disait

> **FICHE ÉTAGE 2 — PROPOSÉE, JAMAIS IMPLÉMENTÉE AVANT ARBITRAGE** (11 §8-7, `CLAUDE.md` §3-7 :
> « la proposer est un devoir, l'anticiper est une faute »). Rien de ce qui suit n'est codé.
> Arbitrage attendu de Williams à la porte suivante : **ABSORBÉE** / **PHASE 2** / **REFUSÉE**.

### Ce que le pack promet — 02 §11.3, cité intégralement

> _« Logs structurés JSON (pino) **centralisés** · **métriques** (latence API, profondeur des files,
> taille outbox moyenne remontée par les clients, échecs de sync, coûts LLM) · **Uptime Kuma** (ou
> équivalent) pour l'alerting (Telegram — canal interne Axion-IA existant) · **page d'état interne**
> · alertes : disque > 80 %, échecs webhooks console, job LLM > 5 min, certificat < 15 j. »_

**C'est le seul chapitre ENTIER du pack dont aucun registre ne disait qu'il n'est pas tenu.** Ni
`DECISIONS.md` (67 entrées), ni ce fichier, ni un dossier de porte n'en portait la trace.

### Constat terrain — cinq mesures, toutes datées du 2026-08-29

| #   | Ce que le §11.3 exige      | Ce qui est mesuré dans le dépôt                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Outil de supervision       | **Aucun**, parmi les **11 services** déclarés par `infra/docker-compose.coolify.yml` — la seule pile déployée (`postgres`, `createstanza`, `redis`, `minio`, `createbuckets`, `sauvegarde`, `api`, `worker`, `field`, `hq`, `caddy`). Zéro occurrence de `uptime-kuma`, `prometheus`, `grafana`, `loki`, `promtail`, `netdata`, `sentry` ou `glitchtip` dans un fichier exécutable du dépôt                         |
| 2   | Les quatre seuils d'alerte | **Zéro occurrence dans une ligne de code.** `ALERT_DISK_USAGE_PERCENT`, `ALERT_LLM_JOB_MAX_MINUTES` et `ALERT_CERT_EXPIRY_DAYS` n'apparaissent dans **aucun** `.ts`, `.tsx` ni `.mjs` — seulement dans `.env.example`, dans deux fichiers de composition, et dans **un commentaire** de `infra/scripts/install-cron.sh`. Le **quatrième** seuil du §11.3, « échecs webhooks console », **n'a même pas de variable** |
| 3   | Point de métriques         | **Aucun.** L'API n'expose que deux routes : `GET /health` et `GET /health/ready` (`apps/api/src/routes/sante.ts`). Pas de `/metrics`, aucun client de métriques dans les dépendances                                                                                                                                                                                                                                |
| 4   | Page d'état interne        | **Aucune.** Rien dans `apps/hq` ni `apps/field`                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | Journaux centralisés       | **Non.** `apps/api/src/logger.ts` produit bien du JSON structuré, et son commentaire dit « pour l'agrégation (02 §11.3) » — **l'agrégateur n'existe pas**. Les journaux vivent dans `docker logs`, sur la machine qu'ils sont censés surveiller. Le canal Telegram existe, mais **uniquement** dans la chaîne de sauvegarde (`infra/postgres/sauvegarde.sh`) : **zéro** occurrence dans `apps/`                     |

**Conséquence opératoire, en une phrase :** aujourd'hui, un incident de production se découvre en
tapant `docker ps` — et l'API elle-même n'a **aucun moyen** de signaler quoi que ce soit.

### Pourquoi personne ne l'avait vu — et c'est la partie qui a de la valeur

**Parce que les variables existent.** Elles sont dans `.env.example`, elles portent leur valeur du
pack (`80`, `5`, `15`), elles sont câblées dans **les deux** fichiers de composition, et elles
portent **le bon numéro de section en commentaire** :

```
# Seuils d'alerte (02 §11.3) : disque, durée d'un job LLM, expiration de certificat.
ALERT_DISK_USAGE_PERCENT=80
ALERT_LLM_JOB_MAX_MINUTES=5
ALERT_CERT_EXPIRY_DAYS=15
```

**Toute revue qui cherche « le §11.3 est-il traité ? » par mot-clé trouve ces quatre lignes conformes
et passe.** Elles sont injectées dans le service `worker` des deux piles — donc présentes dans
l'environnement d'un processus qui ne les lit jamais. C'est le membre le plus discret de la famille
que ce dépôt traque depuis deux jours (« un garde-fou qui annonce plus qu'il ne fait ») : ici, le
garde-fou n'annonce même rien — **c'est la trace de sa configuration qui tient lieu de preuve de son
existence**, et la trace est authentique.

Trois fichiers disent d'ailleurs la vérité, en toutes lettres, depuis le lot L0 :
`infra/postgres/sauvegarde.sh` (« _02 §11.3 cite Uptime Kuma ; IL N'EST PAS DÉPLOYÉ_ »),
`infra/postgres/sauvegarde-healthcheck.sh` et `infra/README.md`. **Aucune de ces trois phrases n'a
jamais atteint un registre**, donc aucune n'a jamais atteint une porte. _Un constat exact qui ne
quitte pas le fichier où il est né ne devient jamais une décision._

### Valeur pour l'auditeur — pourquoi ce n'est pas du confort d'exploitant

1. **L'invariant 8 en dépend directement.** « Aucune donnée ne vit sur un seul appareil > 24 h
   ouvrées ; **alerte automatique au-delà**. » `ALERT_SYNC_SILENT_HOURS=24` est la variable de cette
   alerte : elle n'est lue nulle part. Un iPad qui cesse de synchroniser en pleine mission ne
   déclenche **rien** — et c'est l'appareil qui porte les seules copies des entretiens du jour.
2. **Le terrain ne rappelle pas le siège.** Un auditeur en mission ne diagnostique pas un serveur ; il
   constate que « ça ne marche pas » devant le client. La détection doit précéder l'appel.
3. **Le §11.4 est déjà borgne au même endroit.** La chaîne de sauvegarde alerte sur **échec** ; rien
   n'alerte sur le **silence** (constat déjà écrit dans `infra/docker-compose.prod.yml`, trou « B »).
   Une supervision externe est la seule chose qui voie l'absence d'un signal.
4. **Les métriques du §11.3 ne sont pas décoratives** : profondeur des files, taille d'outbox
   remontée par les clients, échecs de sync et coûts LLM sont **les indicateurs du lot L6 et du lot
   L11**. Les poser après coup, c'est instrumenter un code déjà écrit — plus cher, et sans les
   mesures de la période où l'on en avait le plus besoin.

### Coût estimé

| Incrément                                                                                                                                                                 | Coût     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **O-1** Supervision externe + alerting Telegram : Uptime Kuma (ou équivalent), sondes sur `/health/ready` des deux fronts et de l'API, certificats, disque                | ~0,5 j   |
| **O-2** ✅ **ABSORBÉE le 2026-08-31 — décideur Williams.** Les quatre seuils deviennent du code : une sonde périodique qui LIT `ALERT_*` et notifie sur le canal existant | ~0,5 j   |
| **O-3** Point `/metrics` sur l'API et le worker (latence, files, échecs de sync, coûts LLM)                                                                               | ~0,5 j   |
| **O-4** Page d'état interne dans `apps/hq`                                                                                                                                | ~0,5 j   |
| **O-5** Centralisation des journaux                                                                                                                                       | ~1 j     |
| **Total**                                                                                                                                                                 | **~3 j** |

> ### ⬛ ARBITRAGE DU 2026-08-31 — **O-2 ABSORBÉE, O-1 NON ARBITRÉE**
>
> **Décideur : Williams**, en réponse à une question fermée. **Portée exacte : O-2 SEULE.**
>
> **O-1 (supervision externe type Uptime Kuma) n'est PAS arbitrée et ne suit pas.** Elle reste une
> proposition d'étage 2 en attente. Étendre l'arbitrage d'O-2 à O-1 parce qu'elles sont « le cœur »
> dans la même phrase serait exactement la faute que `CLAUDE.md` §3 point 7 nomme : _anticiper une
> fiche d'étage 2 avant son arbitrage est une faute_. Uptime Kuma est certes **nommé par le pack**
> (02 §11.3) — ce n'est donc pas une décision de dépendance — **mais son coût reste du budget, et le
> budget est arbitré, pas déduit.**
>
> **CE QU'O-2 FERME, ET POURQUOI C'EST LE SEUL 🔴 D'UN DOSSIER DE PORTE.** `ALERT_SYNC_SILENT_HOURS=24`
> **existe dans la configuration et n'est lue par AUCUNE ligne de code.** L'invariant 8 exige « sync
> ≥ 1×/jour **+ alerte automatique au-delà** » : la première moitié est tenue, **la seconde n'existe
> pas**. Un appareil qui cesse de synchroniser en pleine mission ne déclenche **rien** — alors qu'il
> porte, par construction, **les seules copies de la collecte du jour**.
>
> C'est la forme la plus coûteuse du défaut que ce dépôt traque : **un seuil écrit dans un fichier de
> configuration a exactement l'air d'un garde-fou**, il se relit, il se documente, il rassure — et il
> ne s'exécute jamais. Quatre seuils `ALERT_*` étaient dans ce cas.
>
> **Zéro dépendance nouvelle** : la fonction d'envoi vers le canal existe déjà dans
> `infra/scripts/lib/common.sh`, et `curl` suffit.

**O-1 et O-2 sont le cœur** (~1 j) : ils ferment l'invariant 8 et le trou « silence » de la
sauvegarde. O-3 gagne à être posé **avant** le lot L6, dont il mesure précisément les objets. O-4 et
O-5 sont du confort de siège et se différeraient sans dommage.

**Le budget de Phase 1 est de 26 j-h dont ~22 j restants et 2 j de marge de recette** : ~3 j n'y
entrent pas sans arbitrage, et **2 j est le plafond d'une fiche ABSORBÉE**. C'est pourquoi cette
fiche est découpée : elle peut être absorbée **en partie**.

### Impact schéma / API

- **Schéma (fichier 04) : aucun** pour O-1, O-2, O-4 et O-5. **O-3 : aucun non plus** — les métriques
  se calculent, elles ne se stockent pas.
- **API : O-3 ajoute une route** (`GET /metrics`) qui n'est listée ni au §8 ni au §24.2 → **création
  de route non listée**, escalade `CLAUDE.md` §3-6 à documenter si O-3 est retenue. RBAC serveur
  obligatoire, ou exposition sur le réseau Docker interne uniquement.
- **Dépendances : O-1, O-3 et O-5 sortent de la liste épinglée du 11 §1** → escalade `CLAUDE.md`
  §3-1. O-2 n'en demande aucune (le canal Telegram existe déjà, `curl` suffit).
- **Sécurité :** une page d'état et un point de métriques exposent la topologie interne. Aucune donnée
  personnelle ne doit y transiter (11 §2, redaction déjà posée dans `packages/shared/src/redaction.ts`).

**Ce que cette fiche NE propose PAS :** aucun code. `.claude/agents/a53-observabilite.md` existe dans
le dépôt — l'agent est défini, il n'a jamais rien livré. C'est un choix à faire, pas un oubli à
rattraper au jugé.

### ✅ O-2 LIVRÉE le 2026-08-31 — `infra/scripts/sonde-alertes.sh`, planifiée par `install-cron.sh`

Zéro dépendance nouvelle (`axion_notify` + `curl` existants). **Ce qui est réellement fermé, seuil
par seuil, et ce qui ne l'est pas — la distinction est le livrable autant que le script :**

| Seuil                       | Donnée qui le nourrit                | État RÉEL de cette donnée au 2026-08-31                                                                          |
| --------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `ALERT_DISK_USAGE_PERCENT`  | `df` sur l'hôte                      | **DISPONIBLE.** Contrôle pleinement opérant, éprouvé sur un disque réel à 97 %.                                  |
| `ALERT_CERT_EXPIRY_DAYS`    | magasin ACME de Caddy (`caddy_data`) | **DISPONIBLE** dès qu'un certificat existe. Éprouvé sur un volume portant un certificat à 9 j.                   |
| `ALERT_SYNC_SILENT_HOURS`   | `sync_log` (04, migration 0007)      | **TABLE PRÉSENTE, AUCUN ÉCRIVAIN avant L6.** La requête est juste et s'exécute ; elle ne trouvera rien avant L6. |
| `ALERT_LLM_JOB_MAX_MINUTES` | `llm_calls.duration_ms` (idem)       | **TABLE PRÉSENTE, AUCUN ÉCRIVAIN avant L11**, et mesure **POST HOC** (voir le point 1 ci-dessous).               |

**La sonde ne rend jamais un vert sur une donnée absente.** Un contrôle dit trois choses : VERT,
ALERTE, ou **AVEUGLEMENT** — et un aveuglement part sur le canal comme une alerte. `sync_log` vide
alors qu'une mission est ouverte est traité comme une ALERTE ; `sync_log` vide sans aucune mission
ouverte est journalisé « RIEN À SURVEILLER », explicitement pas comme un « tout va bien ».

**Aucune donnée personnelle ne sort.** `sync_log.device_id` est du texte libre remonté par le client
et rien n'interdit « iPad de <prénom> ». Un `device_id` conforme à un motif technique étroit sort tel
quel ; **tout le reste sort en `emp:<12 hex>`** — empreinte SHA-256 tronquée, stable donc corrélable,
non réversible. L'assainissement vit **dans la requête SQL**, au plus près de la source.

#### Deux manques que cette livraison NE ferme PAS — proposés, jamais anticipés (09 §5.9, étage 2)

1. **Un job LLM BLOQUÉ reste invisible.** `duration_ms` n'est écrit qu'à la FIN d'un appel : la sonde
   voit les appels qui ONT été trop longs, jamais celui qui est en train de l'être — c'est-à-dire
   probablement le cas que le 02 §11.3 vise. Voir les jobs EN VOL demande de lire les structures
   internes de BullMQ dans Redis. Coût estimé : ~0,25 j. Impact schéma : aucun. À faire au lot L11,
   avec le code qui produira enfin ces jobs.
2. ~~**La pile Coolify — le chemin ÉPROUVÉ — n'exécute pas cette sonde.**~~ **FERMÉ le 2026-08-31
   même jour** (voir ci-dessous) : une sonde qui ne tourne que sur un chemin JAMAIS JOUÉ tenait
   l'invariant 8 sur le papier — c'est-à-dire qu'elle déplaçait d'un cran le défaut qu'elle ferme.

### ✅ PORTAGE COOLIFY, 2026-08-31 — service `sonde` de `docker-compose.coolify.yml`

Le MÊME script, la MÊME minute, les MÊMES seuils ; seuls les trois accès aux données changent,
parce qu'un side-car n'a pas d'hôte et **ne doit jamais avoir le socket Docker** (refus déjà opposé
au service `sauvegarde` — le portage ne revient pas dessus) :

|               | chemin VPS (`MODE=hote`)               | pile Coolify (`MODE=pile`)                                                                                           |
| ------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| déclenchement | `cron` (`install-cron.sh`)             | boucle interne du service                                                                                            |
| environnement | `.env` en argument                     | processus (Coolify l'injecte)                                                                                        |
| PostgreSQL    | `docker compose exec`                  | **réseau interne**, mot de passe par `PGPASSWORD` (jamais un argument : invisible dans `ps`)                         |
| disque        | `df` sur les montages de l'hôte        | `df /` — l'overlay, porté par le système de fichiers qui porte AUSSI les volumes ; **aucun volume de données monté** |
| certificat    | volume `caddy_data`, conteneur jetable | **sans objet** (voir le point 3)                                                                                     |

**IL N'EXISTE AUCUN ORDONNANCEUR GÉNÉRAL DANS CETTE PILE, et on n'en a pas fabriqué.** La seule
chose planifiée y est le service `sauvegarde`, dont la planification vit DANS son script — forme
arbitrée en tête de `sauvegarde.sh` contre BullMQ et contre les tâches planifiées de Coolify
(« invisibles à git, absentes d'une reconstruction »). On reprend ce motif ; on ne demande pas
d'arbitrer deux fois la même question.

**Zéro dépendance nouvelle, et un mur mesuré en chemin.** L'image de la pile
(`postgres:16-bookworm`) **n'a ni `curl` ni `wget`** : `axion_notify`, qui n'appelait que `curl`,
aurait journalisé « échec de l'envoi » à chaque alerte, indéfiniment — un canal branché, conforme à
la lecture, et muet à l'exécution. `sauvegarde.sh` avait déjà rencontré ce mur et l'avait franchi
seul, avec un client HTTPS écrit sur `openssl s_client`. **Ce transport est remonté dans
`lib/common.sh`** plutôt que recopié une troisième fois : `curl` s'il existe, `openssl` sinon, et un
refus explicite d'envoyer si le magasin de confiance manque — on ne dégrade jamais la vérification
TLS pour faire partir un message portant un jeton de robot.

#### Ce que le portage NE ferme PAS, et qui est nouveau

3. **Sur la pile Coolify, `ALERT_CERT_EXPIRY_DAYS` n'est honoré par PERSONNE.** Mesuré, pas supposé :
   `CADDY_SITE_ADDRESS: ':8080'` fait écouter Caddy en HTTP simple — son propre encadré écrit qu'« il
   ne tente aucun ACME et ne présente aucun certificat » — et TLS est terminé par **Traefik**, dont le
   magasin vit dans les données de Coolify. Cette pile n'y a aucun accès, et **doit** n'en avoir
   aucun : `/data/coolify` porte aussi les secrets d'`axion-ia.com`. Monter `caddy_data` ne dirait
   rien (il est vide de certificats par construction) et produirait un aveuglement permanent —
   c'est-à-dire un cri sans cause, la façon la plus sûre de faire désactiver une sonde. La sonde
   déclare donc ce contrôle **« sans objet »** à chaque passe : ni vert, ni aveuglement, jamais
   silencieux. **Fermer ce trou est une décision d'infrastructure sur la supervision de Traefik —
   elle n'appartient pas à cet agent.** infra/README.md §8, ligne 2j.

**O-1 reste NON ARBITRÉE et rien de ce qui précède ne la prépare** (CLAUDE.md §3-7). La limite
qu'elle seule lève est écrite en tête du script : cette sonde s'exécute sur la machine qu'elle
surveille, et un système ne peut pas signaler sa propre absence.

---

## 2026-08-29 — [L0-b] Étage 1 — un jeton JWT **nu** dans un message d'erreur sortait en clair

**Constat, mesuré — et la première mesure était fausse.** L'échantillon d'origine disait
`refresh token eyJ…` et ressortait nettoyé : on en avait conclu que le jeton était couvert. C'est le
mot **`token`**, adjacent, qui déclenchait l'assainisseur — pas le jeton. La sonde répondait à une
autre question que celle qu'elle croyait poser. Mesure refaite sur des échantillons non contaminés
(`jwt malformed: eyJ…`, `signature invalid for eyJ…`, le jeton seul, et un jeton dans une pile
d'appels) : **5 fuites sur 7 cas avant, 0 après**. Seules `Bearer <jwt>`, le champ `authorization` et
le paramètre `?token=` étaient couverts ; un `err.message` de bibliothèque JWT laissait donc passer
le jeton en clair, dans le message **et** dans la pile.

**Ajout :** `RX_JETON_JWT` dans `packages/shared/src/redaction.ts` — segments base64url séparés par
des points dont le premier commence par `eyJ` (un en-tête JWT encode toujours `{"`). **On masque le
jeton, pas la phrase** : « jwt malformed », « signature invalid » sont le diagnostic et survivent.

**Pourquoi ce motif est légitime là où « détecter un nom » ne le serait pas.** Un JWT a une forme
**rigide et vérifiable** : on ne devine rien, on reconnaît une structure. C'est l'exact inverse d'un
nom de personne, qui n'a aucune forme et dont la « détection » ne serait qu'une promesse — raison
pour laquelle le même fichier refuse explicitement de tenter cette détection-là.

**Ce que ce motif NE voit PAS, dit ici pour qu'on ne le redécouvre pas :** un jeton **opaque** (sans
structure — rafraîchissement, clé d'API maison, identifiant de session), qui reste couvert par le nom
de champ et par lui seul ; un jeton **tronqué** avant son deuxième point ; un secret **sans forme**
(mot de passe, phrase de passe) recopié dans un texte libre. Ce garde-fou est un filet sous la liste
de champs, pas son remplaçant.

**Coût :** ~0,05 j. Une expression régulière, une garde, aucune dépendance.

**Impact schéma / API :** aucun. **Étage 1** — ne touche ni le schéma 04, ni l'API, ni la crypto, ni
le périmètre fonctionnel. Arbitrage A01 : une fuite de **secret** ne se met pas en attente
d'arbitrage d'étage 2.

---

## 2026-08-29 — [L2] Étage 1 — le graphe des modules, lu dans les deux sens (`pnpm check:graphe-modules`)

**Constat, mesuré — deux défauts réels de la même journée, et c'est le MÊME graphe.**

_Sens 1, l'orphelin._ Le commit `591ccbd` annonçait quatre correctifs de sécurité (« le socle
échouait ouvert, et la clé de quota était forgeable par le client ») et ne contenait **qu'un seul
fichier** : `apps/api/src/auth/erreurs-jeton.ts`, un module d'aide **que personne n'importait**. Les
cinq fichiers portant les correctifs étaient restés hors de l'index. **Et la CI était VERTE**, parce
qu'aucun test de ce commit ne couvrait le cas corrigé : un message de commit et une CI se
corroboraient pour une correction qui n'existait pas. `CLAUDE.md` §4 étape 6 énonce pourtant la règle
— « code → exigences : **le code orphelin est REFUSÉ** » — mais **rien ne la contrôlait** : elle
reposait entièrement sur l'œil du gardien, alors que l'autre sens (exigences → code) a trois scripts.

_Sens 2, le pendu._ Le commit `b24b98c` a emporté dans `apps/api/src/app.ts` un
`import … from './domaines/auth/routes.js'` alors que `apps/api/src/domaines/` **n'était pas suivi
par git**. `origin` référençait un fichier absent du dépôt : clone frais en TS2307, staging non
déployable. Découvert par un agent d'infrastructure **en tentant un déploiement** — après être passé
au VERT sous un `typecheck` de pré-commit, parce que **`tsc` lit le disque, l'index non**.

**Ajout :** `scripts/check-graphe-modules.mjs` (+ `pnpm check:graphe-modules`, branché dans `verify` et
dans le job `jonction` de la CI — le job qui pose déjà la question « appelant → appelé »). Un seul
script pour les deux contrôles : même graphe, même résolution de modules ; deux scripts
dupliqueraient cette résolution et finiraient par diverger.

- **Contrôle 1 — le pendu :** un fichier suivi par git qui importe un chemin que **git ne connaît
  pas**. La question posée est « ce chemin est-il dans `git ls-files` ? », **jamais** « ce fichier
  existe-t-il ? » — poser la seconde reproduirait exactement l'angle mort du `typecheck` de
  pré-commit. Le disque n'est consulté que pour rédiger le remède (`git add` suffit, aucun commit
  requis : 09 §5.6). **Aucune soupape** : un orphelin est inoffensif et peut attendre son
  consommateur, un import vers rien casse la branche de tout le monde.
- **Contrôle 2 — l'orphelin :** un module de `apps/*/src` ou `packages/*/src` que rien n'atteint.
  Les points d'entrée ne sont pas devinés par leur nom mais **lus là où ils sont déclarés**
  (`package.json` `exports`/`main`/`bin`/`scripts`, `index.html`, `CMD`/`ENTRYPOINT`/`HEALTHCHECK`
  des Dockerfiles). Un `export * from` dans un baril compte comme un **transit**, pas comme une
  consommation — sans quoi `packages/shared/src/index.ts` rendrait indétectable tout module inutilisé
  du paquet. **Pas de jaune** : ce contrôle refuse, il n'avertit pas (doctrine de
  `check-test-projects.mjs`, 2026-08-28).
- **La soupape, bornée et auto-péremptoire :** `scripts/modules-en-attente.md`, quatre colonnes
  (module, incrément consommateur, date, justification), **plafond 5 entrées, péremption 14 jours**,
  et surtout : **une entrée dont le module est enfin consommé fait ÉCHOUER le contrôle** — la soupape
  se referme au lieu de dormir. Ni `DECISIONS.md` (append-only : ne peut pas héberger une liste qui
  doit rétrécir) ni `AMELIORATIONS.md` (registre de fiches arbitrées) ne pouvaient l'accueillir.

**Recette d'acceptation — le garde attrape les deux défauts qui l'ont fait naître.** Le script lit
n'importe quel commit sans toucher à l'arbre partagé (`--ref`, via `git ls-tree`/`git show`) :

    node scripts/check-graphe-modules.mjs --ref 591ccbd → EXIT 1, nomme apps/api/src/auth/erreurs-jeton.ts
    node scripts/check-graphe-modules.mjs --ref b24b98c → EXIT 1, nomme apps/api/src/app.ts:18 → ./domaines/auth/routes.js

Sur `b0d7cff` (parent) et sur `b24b98c`, `erreurs-jeton.ts` n'apparaît pas : le contrôle isole
exactement le commit fautif.

**Honnêteté de portée.** `node scripts/check-graphe-modules.mjs --angles-morts` imprime les **seize**
angles morts connus (imports dynamiques non littéraux, `import * as` sur un baril, granularité module
et non symbole, cycles, alias `tsconfig`, conditions d'`exports`…). Un garde honnête sur sa portée
vaut mieux qu'un garde qui rassure — c'est la famille de défaut que ce dépôt traque quinze fois en
trois jours, et un garde-fou n'y échappe pas.

**Faux positifs : un seul, mesuré et corrigé.** `import '@axion/ui/tokens.css'` était déclaré pendu
parce que la résolution concaténait naïvement le sous-chemin au répertoire du paquet, alors que
`packages/ui/package.json` publie `"./tokens.css": "./src/tokens.css"`. La carte `exports` (motifs
`./*` compris) fait désormais foi. Après correction : **0 faux positif** sur l'arbre, sur les trois
commits rejoués et sur un dépôt-témoin de 12 modules construit pour l'occasion (imports commentés,
mention en Markdown, dépendance externe, `node:`, sous-chemin d'`exports`, joker d'`exports`,
`import()` littéral, spécificateur variable, baril, `bin`).

**Coût :** ~0,3 j. Aucune dépendance ajoutée (`node:fs`, `node:path`, `node:child_process`).

**Impact schéma / API :** aucun. **Étage 1** — ne touche ni le schéma 04, ni l'API, ni la crypto, ni
le périmètre fonctionnel. **Tests à écrire par un autre agent** (09 §5.6) : le détail des cas est
dans le rapport d'A02 ; ils ont leur place dans `scripts/garde-fous-invariants.test.ts`.

---

## 2026-08-29 — [L0] Étage 2 — Aucun outil ne prouve QUEL COMMIT tourne : `empreinte-docker.sh` mesure le disque, pas le déploiement

**Constat terrain.** Le 2026-08-29, A01 m'oriente vers `infra/scripts/empreinte-docker.sh` pour
« comparer l'empreinte du fichier dans l'image en service à celle du dépôt ». Ce script ne fait pas
cela : ses deux seuls modes sont `mesurer` et `elaguer`, et il mesure l'**empreinte DISQUE** de la
pile sur une machine partagée. La confusion vient du mot « empreinte », qui désigne deux choses sans
rapport. **Aucun outil du dépôt ne répond à la question « quel commit tourne ? ».**

Ce n'est pas une lacune théorique. Le même jour, `docs/ETAT.md` et la mémoire d'A01 plaçaient le
staging sur `b24b98c`, alors qu'il servait `8adaaea` — **huit commits en arrière**, depuis la veille
au soir. Trois affirmations fausses avaient déjà été produites plus tôt en faisant confiance au champ
`status` de l'API Coolify pour des déploiements qui avaient ÉCHOUÉ.

**Valeur pour l'auditeur — indirecte mais réelle.** Une porte se signe sur une démo faite en staging
(§7, `docs/portes/`). Une porte franchie sur un binaire dont personne n'a prouvé la provenance est
une signature sur un objet inconnu.

**Ce qui marche aujourd'hui, à la main, et qu'il faut outiller.** Deux sources indépendantes, dont
aucune ne repose sur un champ `status` :

1. **La file de déploiement, FILTRÉE sur notre application.** Jamais sans clause `WHERE` :
   `application_deployment_queues` contient aussi les déploiements d'`axion-ia.com`. La colonne à
   filtrer est `application_id` (entier), obtenue par `SELECT id FROM applications WHERE uuid =
'wrunr6mwq2oxqq392i4myzjn'` — soit `4`. Filtrer directement sur l'uuid rend `(0 rows)`, ce qui
   ressemble à « aucun déploiement » et n'est qu'une colonne mal choisie.
2. **L'empreinte du code en service**, qui ne dépend d'aucun champ déclaratif :
   `docker exec api-<uuid>-<suffixe> grep -o "trustProxy: [a-zA-Z]*" /app/dist/app.js`.

C'est la source 2 qui a tranché : `trustProxy: true` et zéro occurrence de `domaines` prouvaient
`8adaaea` sans discussion possible.

**Proposition — `infra/scripts/empreinte-deploiement.sh`** (nom distinct : la confusion est la moitié
du défaut). En lecture seule, il rendrait le commit de la dernière entrée `finished` filtrée sur notre
`application_id` ; le condensé d'un fichier témoin de `/app/dist` dans chaque conteneur en service,
comparé à celui obtenu depuis le commit annoncé ; et un verdict binaire **CONFORME / DÉRIVE**, avec
l'écart en commits. Il refuserait de conclure « conforme » sur la seule foi de la file.

**Coût estimé :** ~0,5 j. **Dépendances :** aucune (`ssh`, `docker`, `psql`, `sha256sum`).

**Impact schéma / API :** aucun. Impact ops : un script de plus dans `infra/scripts/`.

**Étage 2 — À ARBITRER, non implémenté.** Ce n'est ni un libellé ni un état vide : c'est un outil
d'exploitation qui devient une dépendance de la procédure de porte. **Tests à écrire par un autre
agent** (09 §5.6). Traçabilité : E36, E43.

---

## 2026-08-29 — [L2] Étage 2 — `request.ip` n'est OBSERVABLE NULLE PART : la redaction RGPD ferme la seule fenêtre

**Constat terrain.** Le contrat 11 §3 impose `10 req/min/IP` sur `/v1/auth/*`, et `QUOTA_AUTH`
(`apps/api/src/domaines/auth/routes.ts`) prend bien `requete.ip` pour clé. Mais **rien, dans le
système déployé, ne permet de vérifier quelle valeur cette clé prend réellement** :

1. **Le journal l'expurge, par conception.** Le sérialiseur par défaut de Fastify écrit
   `req.remoteAddress`, qui **est** `request.ip` ; la politique de redaction
   (`packages/shared/src/redaction.ts`, clés `ip`, `client_ip`, `x_real_ip`) le remplace par
   `[masqué:rgpd]`. Mesuré sur staging le 2026-08-29 :
   `{"req":{"method":"GET","url":"/v1/forge-…","remoteAddress":"[masqué:rgpd]",…}}`.
   **Ce n'est pas un défaut à corriger** : c'est l'invariant 11 §2 et le RGPD 06 §10.4 qui
   fonctionnent. Cette fiche ne demande pas de lever la redaction.
2. **Les 404 ne portent aucun en-tête `x-ratelimit-*`** — dump complet des en-têtes vérifié.
3. **Les sondes sont exemptées** (`/v1/health`, `/v1/health/ready` : `rateLimit: false` **et**
   `logLevel: 'warn'`) — ni quota, ni journal.

Conséquence mesurée : pour établir si `request.ip` valait l'adresse réelle, l'adresse forgée ou celle
du frontal, il a fallu **reconstruire la chaîne maillon par maillon sur un banc local**. La réponse —
une adresse unique pour tous les clients, donc un seau de quota global — est arrivée par composition
de trois mesures indirectes, là où **une** mesure directe aurait suffi.

**Valeur pour l'auditeur.** Le plafond de `/v1/auth/*` protège le compte de l'auditeur contre le
bourrage d'identifiants. Une protection qu'on ne sait pas observer est une protection qu'on ne sait
pas prouver — et, en l'espèce, elle était inopérante depuis l'origine sans que rien ne le signale.

**Proposition — deux fenêtres, aucune ne rouvrant la donnée personnelle.**

- **(a) En-têtes `x-ratelimit-*` sur les routes à quota, y compris sur le 404.**
  `@fastify/rate-limit` sait les poser (`addHeaders`) ; ils exposent le **compteur**, jamais
  l'adresse. Douze requêtes en faisant varier `X-Forwarded-For` suffisent alors à prouver, de
  l'extérieur et sans lire un journal, que la clé est **une par client** et non un seau unique.
- **(b) Un condensé tronqué et salé de `request.ip` dans le journal** (`ipHash`, 8 hexadécimaux, sel
  de session) : deux requêtes du même client se rapprochent, mais l'adresse ne se reconstitue pas.

L'option (a) seule répond au besoin de preuve et **n'a aucun impact RGPD** ; (b) sert le diagnostic
d'incident et doit être arbitrée avec 06 §10.4 (donnée pseudonymisée, pas anonyme). Non exclusives.

**Coût estimé :** (a) ~0,2 j · (b) ~0,4 j.

**Impact schéma :** aucun. **Impact API :** (a) ajoute trois en-têtes de réponse sur les routes à
quota — à documenter aux §8/§24.2. **Impact crypto :** (b) uniquement (sel de session).

**Étage 2 — À ARBITRER, non implémenté** : (a) touche le contrat d'API, (b) touche la politique de
redaction et le RGPD. **Tests à écrire par un autre agent** (09 §5.6). Traçabilité : E33, E42.

---

## 2026-08-29 — [L0] Étage 2 — La plage `trusted_proxies` appartient à Coolify : la garantie s'éteint en silence

**Constat terrain.** `infra/caddy/Caddyfile` déclare désormais `trusted_proxies 10.0.1.0/24` dans ses
deux blocs `reverse_proxy` (arbitrage A01 du 2026-08-29). Cette plage est celle du réseau Docker
`coolify`, **vérifiée le jour même** (`docker network inspect coolify` → `subnet=10.0.1.0/24`,
`gateway=10.0.1.1`, `coolify-proxy=10.0.1.6`). Ce réseau est créé, détruit et renuméroté par
**Coolify**, pas par nous.

Si Coolify le recrée sur une autre plage — ou si Traefik joignait Caddy par l'IPv6 du même réseau,
`fd7b:96c6:c023::/64`, que `10.0.1.0/24` ne couvre pas — la directive cesse de correspondre. Mesuré
sur banc : Caddy revient alors à **remplacer** `X-Forwarded-For`, l'API revoit une adresse unique, et
le plafond par IP redevient un seau global.

**L'échec est FERMÉ (jamais une adresse forgée), mais SILENCIEUX** : aucun test ne rougit, aucune
alerte ne part, la journée continue. Le garde `scripts/garde-fous-proxy-de-confiance.test.ts` vérifie
que la directive est _écrite_ — il ne peut pas vérifier qu'elle _correspond encore_ à la réalité du
réseau, et son en-tête le dit lui-même.

**Proposition.** Une sonde d'exploitation, en lecture seule, jouée par le cron de la machine et à
chaque déploiement : lire le sous-réseau réel de `coolify` et l'adresse réelle de `coolify-proxy`,
les confronter aux plages déclarées dans le `Caddyfile`, et **alerter sur le canal interne**
(02 §11.3) en cas d'écart. La commande de vérification manuelle est déjà écrite dans
`infra/COHABITATION_AXIONIA_WEB.md` §3ter — cette fiche demande à l'automatiser.

**Coût estimé :** ~0,3 j. **Impact schéma / API :** aucun. Impact ops : une entrée de crontab.

**Étage 2 — À ARBITRER, non implémenté** : c'est une sonde d'exploitation avec une alerte, pas un
confort d'écran (09 §5.9). **Tests à écrire par un autre agent** (09 §5.6). Traçabilité : E36, E43.

---

## 2026-08-29 — [L2] Étage 1 — le garde-fou du graphe était aveugle sur son propre cas d'usage

**Correctif d'une amélioration livrée le jour même. Il est écrit ici plutôt que corrigé en silence,
parce que c'est le défaut le plus grave de la journée et qu'il visait le garde qui traque ce défaut.**

**Constat, trouvé et reproduit par l'agent du lot L2 avec ma propre fonction.** `check-graphe-modules`
accusait `apps/api/src/domaines/auth/service.ts` et `packages/shared/src/auth.ts` d'être orphelins.
Ils ne l'étaient pas : `routes.ts:42` importe `./service.js`, `routes.ts:33` importe
`loginRequestSchema`. Sur `routes.ts`, `sansCommentaires` voyait **0 import sur 4**.

**Cause.** `routes.ts:9` contient `` `/v1/auth/*` `` dans un commentaire `//`. La sous-chaîne `/*` y
ouvrait un **faux bloc** pour l'expression `/\/\*[\s\S]*?\*\//g`, refermé sur le `*/` du premier
JSDoc — **trente lignes plus bas, par-dessus tout le bloc d'imports**.

**Pourquoi ce n'est pas un faux positif mais une CÉCITÉ.** Le contrôle 2 accusait à tort : du bruit,
visible. Mais le **contrôle 1 — le pendu** — devenait aveugle sur le même chemin. Mesuré en A/B sur un
dépôt-témoin dont le SEUL défaut est un import vers une cible inconnue de git, placé après un tel
commentaire, à script par ailleurs identique :

| Version de `sansCommentaires` | Sortie                                          | Code  |
| ----------------------------- | ----------------------------------------------- | ----- |
| deux `replace` (avant)        | `✓ … aucun import pendu.`                       | **0** |
| automate à états (après)      | `✗ 1 IMPORT … grave.ts:6 → ./cible-inconnue.js` | **1** |

L'ancienne version **n'omettait pas** le défaut : elle **affirmait son absence**, en vert, dans les
mots mêmes du contrôle. C'est exactement le défaut que ce garde existe pour attraper, et exactement
celui qui a rendu la branche non constructible cette nuit-là. Un garde-fou aveugle sur son propre cas
d'usage est la forme la plus aboutie de la famille traquée par ce dépôt.

**Correctif : un automate à états** (code / commentaire de ligne / commentaire de bloc / chaîne
simple / chaîne double / gabarit avec pile de `${…}` / expression régulière avec classes `[…]`), et
non un réordonnancement des deux `replace` — **vérifié, pas supposé** : traiter la ligne d'abord casse
`/* voir //note */`. Aucun ORDRE ne marche, parce qu'aucun MOTIF ne peut décider si `/*` ouvre un bloc
sans savoir s'il est déjà dans un commentaire de ligne, une chaîne ou une expression régulière.

**Un second défaut, trouvé en corrigeant le premier.** Les chaînes sont conservées (un spécificateur
d'import EST une chaîne), donc une chaîne de documentation — `"corrige ainsi : import { x } from
'./fantome.js'"` — était lue comme un import réel : **deux faux positifs de pendu** sur le
dépôt-témoin, et précisément le genre de phrase que ce garde imprime dans ses propres messages
d'erreur. L'automate expose désormais un drapeau par caractère (`enCode`) et le **mot-clé** doit être
du code ; le spécificateur, lui, reste dans sa chaîne.

**Recette d'acceptation — trois cas gravés, en plus de `591ccbd` et `b24b98c` :**

1. `routes.ts` réel : les 4 imports sont vus (`--details` montre `service.ts` et `mots-de-passe.ts`
   consommés par `routes.ts`, et `routes.ts` dans les consommateurs du baril `@axion/shared`).
2. **Le cas grave** : commentaire `//` contenant `/*`, puis un import vers une cible inconnue de git,
   puis un JSDoc → **refusé, ligne exacte**. Avant : vert et muet.
3. Les voisins, tous traversés : bloc contenant `//note`, chaînes simple et double contenant `//` et
   `/*`, gabarit avec substitutions dont une chaîne imbriquée contenant `//`, expression régulière
   contenant `\/\/` et un `/` en classe `[a-z/]`, et une division `x / 2 / 1` qui ne doit pas être
   prise pour une expression régulière.

**Angles morts : douze → seize.** Les quatre nouveaux disent ce qu'un automate LEXICAL ne peut pas
trancher : expression régulière vs division après `)` `]` `}`, texte JSX hors accolades, fichier
syntaxiquement invalide, et le fait que l'automate ne couvre que les fichiers de code.

**Comment le défaut a été trouvé, et pourquoi cela vaut d'être écrit.** L'agent accusé n'a **pas**
inscrit ses modules dans `modules-en-attente.md` pour faire taire le rouge : il a vérifié si
l'accusation était fondée, l'a trouvée fausse, et l'a remontée. Y déclarer un module effectivement
consommé aurait pourri le registre — c'est le raisonnement que j'avais moi-même tenu en refusant de
déclarer à sa place. **La règle a fonctionné dans les deux sens, et c'est elle qui a produit le
diagnostic.**

**Coût :** ~0,15 j (compris dans les ~0,3 j de la fiche précédente ; le compteur L2 est inchangé).

**Impact schéma / API :** aucun. **Étage 1.**

---

## 2026-08-29 — [L3a] Étage 1 — le décalage de pagination était invisible dans les fichiers `.sql`

**Constat terrain.** Le `CLAUDE.md` §9 impose la pagination keyset **partout**, `?limit=50&after=<curseur>`,
jamais de décalage. Une règle ESLint `no-restricted-syntax` tient cette promesse sur le TypeScript :
neuf formes, mesurées, zéro faux positif sur `outline-offset` ni sur `datetime({ offset: false })`,
tous deux réellement versionnés. **Mais ESLint ne parse pas le SQL** : `npx eslint apps/api/drizzle/`
rend « File ignored because no matching configuration was supplied » sur les douze migrations. Le
décalage écrit dans une migration versionnée passait donc sans être vu — par le chemin le plus naturel
qui soit, écrire du SQL dans un fichier SQL. Arbitré le 2026-08-29 (`DECISIONS.md`, « La règle
anti-décalage ne voit pas les fichiers `.sql` »), option 2.

**Valeur pour l'auditeur.** Sur une liste qui bouge pendant la pagination — une sync terrain qui pousse
des réponses — le décalage saute ou duplique des lignes. Le défaut ne se voit ni à la compilation, ni
aux tests unitaires : il se voit en production, sur FIL-GC (60 sessions, ~8 000 réponses), au moment le
plus coûteux. Une vue ou une requête de rapport livrée dans une migration aurait porté ce défaut sans
qu'aucun contrôle ne le nomme.

**Ce qui a été livré.** Un contrôle `CT-3-KEYSET-SQL` dans `scripts/check-invariants.mjs`, déjà câblé
dans `pnpm check:invariants` et `pnpm verify` — **aucune ligne de `package.json` touchée, aucune
dépendance ajoutée**. Il **refuse** (il n'avertit pas : doctrine du 2026-08-28) le mot-clé de décalage
suivi d'une valeur littérale, d'un paramètre lié (`$1`, `:nom`, `?`) ou d'une sous-requête, dans tout
`.sql` suivi par git. Commentaires masqués, casse indifférente, valeur reportée à la ligne suivante
attrapée, échappatoire `invariant-ok:` tracée.

**Mesures, pas impressions.**

| Mesure                                                    | Résultat                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| SQL fautif refusé (10 formes, dépôts jetables)            | **10/10 rouges, code 1, contrôle nommé**                          |
| Faux positifs cherchés activement (9 formes)              | **9/9 verts**                                                     |
| Occurrences du mot dans les 12 migrations livrées         | **0** — le dépôt reste vert, code 0                               |
| Témoins sains existants (`garde-fous-invariants.test.ts`) | **48/48 verts** (31 avant l'ajout, 17 écrits à l'aveugle par A04) |

**Un piège trouvé en chemin, et mesuré, pas supposé.** Écrire les exemples fautifs _en clair_ dans le
message d'explication du contrôle rendait `npx eslint scripts/check-invariants.mjs` **rouge : 2 erreurs
`no-restricted-syntax`**, sur les deux lignes qui citent la faute. Le garde-fou devenait son propre
contre-exemple et cassait `pnpm lint` pour tout le monde. Correctif : le mot-clé est **assemblé**
(`MOT_DECALAGE`), pas désactivé — le fichier avait déjà tranché ce dilemme une fois, pour les quatre
noms de couleurs les plus courts. La sortie imprimée est identique au caractère près.

**Angles morts, écrits plutôt que masqués** (six, dont un faux positif assumé) : une vue ou une fonction
stockée créée hors migration ; du SQL assemblé puis passé en brut ; une requête tapée dans un outil
d'administration ; un `.sql` non suivi par git (**vérifié : le même SQL fautif, non indexé, sort en
vert**) ; le décalage écrit sans le mot-clé (`row_number() … BETWEEN 101 AND 150`) ou avec une valeur
nue (`OFFSET debut`) ; et un `pnpm check:invariants` non exécuté — la garantie vient de la CI, jamais
du poste. **Faux positif assumé et mesuré** : de la prose _chiffrée_ dans une chaîne SQL
(`COMMENT ON COLUMN … IS '… 100 …'`) est refusée, parce que les chaînes ne sont **pas** masquées — en
SQL une chaîne s'exécute (`EXECUTE`), et les masquer aveuglerait le contrôle au seul cas dynamique
qu'il peut encore voir.

**Coût :** ~0,1 j, conforme à l'estimation de l'arbitrage. **Impact schéma / API / crypto / périmètre
fonctionnel : aucun. Étage 1.**

---

## 2026-08-30 — [étage 2, PROPOSÉE] Le contrôle d'empreinte s'arrête à l'enveloppeur

**Constat terrain.** Les deux clés restreintes exécutent un script enveloppeur qui publie son
empreinte ; la CI la compare au fichier versionné et refuse d'agir en cas d'écart. Le mécanisme
fonctionne : il a été posé après que le script de déploiement eut été modifié **deux fois directement
en production** sans laisser de trace.

**Ce qu'il ne couvre pas.** `restore-test-ci.sh` est vérifié ; `restore-test.sh`, qu'il **appelle**,
ne l'est pas. Ce dernier vit dans le clone `/opt/axion-audit/repo`, dont le commit est **journalisé
mais jamais comparé** à quoi que ce soit. Un clone resté en arrière exécuterait donc du code ancien
sous une empreinte d'enveloppeur parfaitement conforme. **Le garde vérifie la porte et pas la pièce.**

**Valeur pour l'auditeur.** Nulle en direct — c'est une garantie d'exploitation. Mais elle porte le
plan de reprise : un test de restauration qui tourne sur une version périmée du script peut sortir
vert sur des hypothèses qui n'ont plus cours.

**Ce qui rend la fiche non triviale, et pourquoi elle n'est pas implémentée d'office.** La comparaison
évidente — « le commit du clone doit égaler celui de la CI » — est **fausse dès qu'on lance le
workflow depuis une branche** : le clone ne suit que `main`, délibérément, pour que la machine
n'exécute que du code fusionné. Une règle naïve rendrait donc rouge un cas parfaitement sain, et
l'on finirait par la désarmer. La règle juste distingue deux situations : sur `main`, un écart est une
**dérive** et doit échouer ; sur une branche, c'est un **fait à annoncer** — le serveur exécute `main`,
pas ce que vous testez — et cela doit s'écrire dans le journal sans faire rougir.

**Coût estimé.** ~1 h. **Impact schéma/API : aucun.** Touche `restore-test-ci.sh` (publier une seconde
empreinte) et `nightly-restore-test.yml` (comparer selon la référence).

> ### ✅ FERMÉE LE 2026-08-30 — et c'est une remarque de la session voisine qui l'a rendue urgente
>
> Elle proposait de lancer le test nocturne **sur la branche** avant fusion, pour prouver le canal.
> **Cela n'aurait rien prouvé, et aurait prouvé du faux** : le clone du serveur suit `main`, donc le
> `ref` du dispatch ne choisit que le fichier de workflow — le `restore-test.sh` exécuté reste celui
> de `main`. Un dispatch sur une branche aurait fait tourner l'ancien script en donnant l'impression
> d'éprouver la nouvelle.
>
> **La dette théorique est devenue un piège concret**, et le garde est posé : le workflow extrait
> désormais le commit que le serveur a RÉELLEMENT exécuté et le compare au `ref` demandé. **Sur
> `main`, un écart ÉCHOUE** — c'est une dérive du clone, et le garde éprouverait autre chose que ce
> qui est livré. **Sur une branche, il AVERTIT bruyamment** sans rougir : l'écart est voulu, mais un
> vert obtenu là ne dit rien de la branche.
>
> **Ce qui reste ouvert, et il faut le dire** : le contrôle porte sur le **commit**, pas sur
> l'**empreinte du fichier**. Un clone au bon commit mais modifié sur place passerait. C'est moins
> grave — le clone est reconstruit par `reset --hard` à chaque mise à niveau — mais ce n'est pas rien,
> et la fiche est fermée sur ce qu'elle traite, pas sur ce qu'elle laisse.

**Arbitrage attendu de Williams** : ABSORBÉE / PHASE 2 / REFUSÉE.

---

## 2026-08-30 — [étage 2, PROPOSÉE] Ce qui raccourcit vraiment le calendrier, et ce qui ne le raccourcit pas

**Constat.** Williams trouve le rythme trop lent et demande plus d'agents. **Plus d'agents ne
raccourcit pas ce calendrier-ci**, et le dire est plus utile que d'en lancer trente : `CLAUDE.md` §4
impose **L6 SEUL** — sa durée est incompressible quel que soit l'effectif — et L5 dépend en partie de
L3. Un chemin critique ne se parallélise pas ; il se **réordonne**.

**Trois marges réelles, par ordre de gain décroissant.**

1. **Écrire les 8 scénarios de sync (05 §9.8) AVANT l'ouverture de L6, pendant L3/L5.** C'est le seul
   gain qui attaque le chemin critique lui-même : L6 démarre avec ses critères d'acceptation déjà
   encodés en tests rouges, au lieu de les découvrir en chemin. **Et cela ne viole pas « L6 seul » :
   écrire les tests de L6 n'est pas développer L6 — c'est même EXIGÉ par 09 §5.6, qui interdit que
   l'implémenteur écrive ses propres tests.** La règle dit qui, jamais quand.
2. **L4 (0,5 j) ne dépend que du schéma L1**, pas de L3. Il peut occuper le second chantier pendant
   que L2/L3 avancent, au lieu d'attendre son tour dans la file.
3. **La moitié locale de L5 ne dépend pas de l'API de L3** : coquille offline Workbox, migrations
   Dexie versionnées, DEK/KEK et verrouillage, `storage.persist()`, composants de types de réponse.
   Elle dépend du **schéma** et du **format de snapshot du questionnaire** — deux contrats, pas un
   service en marche.

**Ce que ces marges ne font pas, et qu'il faut dire dans le même souffle** : elles ne réduisent
**aucune** durée de lot. Elles suppriment de l'**attente**. Si le calendrier déborde malgré elles, le
levier restant n'est pas l'effectif — c'est le périmètre, et il appartient à Williams (P-DESCOPE).

**LA RÉSERVE, ÉCRITE PLUTÔT QUE TUE — elle porte sur la marge n° 1.** Des tests écrits contre une
spécification, avant que la moindre interface existe, se paient parfois en réécriture quand les
signatures arrivent. **Le risque est faible ici et il faut dire pourquoi** : les 8 scénarios de 05
§9.8 décrivent un **comportement observable** (« un push rejoué rend `duplicate` »), pas une forme
d'appel, et ils viennent d'une spécification **écrite et figée**, pas d'une implémentation à observer.
C'est précisément ce qui rend l'avance possible ici et ne la rendrait pas ailleurs. **Mais il n'est
pas nul**, et Williams doit arbitrer sur un coût honnête plutôt que sur une promesse : compter une
demi-journée de réajustement des tests au moment où les interfaces de L6 se figent.

**Coût estimé.** Aucun code nouveau : c'est une **réorganisation de l'ordre d'exécution**, plus la
demi-journée de réserve ci-dessus. **Impact schéma/API : aucun.**

**Pourquoi ce n'est PAS implémenté d'office.** Cela touche l'ordonnancement des lots du fichier 07,
donc une convention — `CLAUDE.md` §3 point 2. **Arbitrage attendu de Williams** :
ABSORBÉE / PHASE 2 / REFUSÉE.

---

## 2026-08-30 — [étage 2, PROPOSÉE] La CI construit quatre images que personne ne déploie

**Constat terrain, mesuré sur le serveur.** L'image en service est `axion-audit-api:coolify`, sans
aucune étiquette OCI. L'orchestrateur **construit lui-même** depuis le dépôt ; il n'utilise pas les
images que le job `7 · build (4 images GHCR)` pousse à chaque merge. Le tag `sha-<commit>` transmis au
job de déploiement ne sert **qu'au message Telegram**.

**Deux conséquences, et la seconde est la vraie.**
· Du temps de CI dépensé à chaque merge pour des images que rien ne consomme — c'est le coût visible,
et le moindre.
· **La vérification du commit en service ne pouvait JAMAIS aboutir.** Elle lit
`org.opencontainers.image.revision`, que ni l'image ni le conteneur ne portent. Ce garde avait été
écrit le 2026-08-28 précisément parce que trois déploiements annoncés réussis avaient échoué — **et il
n'a jamais rien vérifié depuis.** Il tombait en `::warning`, donc il ne mentait pas ; mais il occupait
la place d'un contrôle et rassurait à sa place.

**Ce qui a été fait tout de suite, faute de mieux.** Une seconde voie, mesurée et disponible
aujourd'hui : le conteneur porte `com.docker.compose.project.working_dir = /artifacts/<uuid du
déploiement>`, et nous connaissons cet uuid. **Elle prouve la PRISE D'EFFET, pas le CONTENU** — le
commit réellement cloné reste invérifié, et une poussée glissée entre le déclenchement et le clonage
passerait inaperçue. Le script échoue désormais si **aucune** des deux voies n'est disponible.

> ### ⚠️ CORRECTION DE CETTE FICHE, LE MÊME JOUR — ET ELLE ME VISE
>
> J'ai présenté ci-dessus comme une **découverte** que l'orchestrateur construit ses propres images
> et ignore GHCR. **C'était déjà écrit dans le dépôt depuis le 2026-08-28**, dans
> `.github/workflows/README.md` §1, avec sa cause — _« les paquets GHCR sont privés et le tirage
> anonyme est refusé »_ — et sa conséquence — _« `tag_image` est journalisé et notifié pour
> traçabilité, il ne pilote pas encore l'image servie »_.
>
> **Je n'avais pas lu le document que je corrigeais.** C'est le sixième « savoir écrit et non
> appliqué » de la semaine, et le premier dont je suis l'auteur plutôt que le lecteur.
>
> **Ce que la correction change au fond, et ce n'est pas cosmétique** : faire déployer les images de
> GHCR n'est PAS une décision ouverte à faible coût. Elle a **déjà été écartée** pour une raison
> technique mesurée. La rouvrir suppose de résoudre **cet** obstacle — rendre les paquets publics,
> ou donner un jeton de tirage au serveur — ce qui est une décision de **sécurité**, pas
> d'ergonomie de CI.
>
> **Ce que la correction NE change PAS** : la vérification du commit en service ne fonctionnait
> toujours pas, et le nom du job induisait toujours en erreur un lecteur de porte.

**Ce que la fiche propose, et il faut choisir.**

1. **Poser l'étiquette OCI au build** : `ARG` dans le `Dockerfile` + `LABEL org.opencontainers.image.revision`, alimenté par la variable de commit de l'orchestrateur. **C'est la seule option qui referme vraiment la question, et elle ne dépend PAS de GHCR** — elle porte sur l'image que l'orchestrateur construit lui-même. Suppose de connaître le nom exact de la variable de commit qu'il passe au build : à **mesurer**, pas à supposer.
2. **Faire déployer les images de GHCR.** Le seul chemin honnête de bout en bout — ce qui est testé serait ce qui est livré. **Mais il est bloqué par un obstacle déjà mesuré** (paquets privés, tirage anonyme refusé) dont la levée est une décision de sécurité.
3. **Cesser de pousser les 4 images sur GHCR** puisque rien ne les déploie. Gain de CI immédiat, **mais** cela supprime le seul artefact permettant un retour arrière rapide, et **referme définitivement l'option 2**.

**Les trois n'ont pas le même arbitre** : la 1 est technique et peut être absorbée ; la 2 est une
décision de sécurité ; la 3 engage le plan de reprise. **Coût estimé** : 1 h pour la 1, inconnu pour
la 2 tant que l'obstacle des paquets privés n'est pas tranché, 15 min pour la 3.
**Impact schéma/API : aucun.**

**Fait d'office en attendant (étage 1)** : le job a été **renommé**
`7 · constructibilité des 4 images (NON déployées — voir AMELIORATIONS)`. Vérifié qu'il n'est pas
dans les 11 contextes exigés par la protection de `main` : le renommage ne débranche aucun garde.

**Arbitrage attendu de Williams** : ABSORBÉE / PHASE 2 / REFUSÉE, séparément pour chacune.

---

## 2026-08-30 — [étage 2, PROPOSÉE] Une case cochée ne porte pas ce qu'elle a prouvé

**Constat terrain, et c'est le plus grave de la journée.** Le critère 4 de la porte P-A a été **clos ce
matin** — _« déploiement staging par la CI, vérifié »_ — sur le run `33292249119`. Ce déploiement était
vert. Mais il tournait **avant** l'ajout du contrôle d'empreinte et de la vérification de prise
d'effet, et la seule vérification alors prévue — l'étiquette OCI de révision — **ne pouvait jamais
aboutir**, puisque l'orchestrateur construit ses images sans la poser.

**Le dossier ne mentait pas. Il promettait plus que le mécanisme ne délivrait**, et **rien, dans sa
lecture, ne permettait de s'en apercevoir.** Williams a engagé sa signature sur le mot « vérifié » en
lui donnant son sens ordinaire.

**Pourquoi c'est pire que les cinq murs du test de restauration.** Ceux-là étaient des gardes qui ne
mesuraient rien : coûteux, mais internes au dépôt. Celui-ci est **une case cochée dans un document
signé par un humain**, qui en tire des décisions.

**Le remède ne peut pas être « mieux cocher ».** Une case ne porte pas ce qu'elle a prouvé. Ce qui
l'aurait empêché : que chaque critère porte, à côté de son ✅, **le numéro de run, la date, et une
phrase disant ce que cette preuve établit — ET CE QU'ELLE N'ÉTABLIT PAS.** Sur le critère 4, la ligne
honnête du matin aurait été :

> ✅ run `33292249119`, 2026-08-30 — _un déploiement a été déclenché par la CI et l'orchestrateur l'a
> accepté. **Ne prouve PAS** que le code en service est celui du commit : la vérification d'étiquette
> n'aboutit jamais (image construite par l'orchestrateur, sans étiquette OCI)._

Écrite ainsi, **elle se serait dénoncée toute seule**. _Une case ne peut pas mentir sur ce qu'elle
prouve si on lui fait dire ce qu'elle ne prouve pas._

**Ce n'est pas une idée neuve : c'est la méthode déjà appliquée au code, remontée d'un étage.** C'est
exactement ce qui est écrit dans `deploy-staging.sh` — « la voie `working_dir` prouve la PRISE
D'EFFET, pas le CONTENU » — et dans `restore-test.sh`. Le script le dit de lui-même ; le dossier de
porte, non.

**Coût estimé** : la forme, 1 h. La **reprise des critères déjà cochés** de P-A, une demi-journée — et
c'est elle qui compte, parce qu'une forme neuve appliquée aux seuls critères futurs laisserait
intactes les cases déjà signées.
**Impact schéma/API : aucun.**

**Pourquoi ce n'est PAS implémenté d'office.** Le format des dossiers de porte est une **convention** :
`CLAUDE.md` §3 point 2. Proposée par la session voisine, qui a **refusé de l'écrire elle-même** pour
cette raison — le bon réflexe. **Arbitrage de Williams** : ABSORBÉE / PHASE 2 / REFUSÉE.

**Appliqué dès aujourd'hui, sans attendre l'arbitrage, et la distinction est volontaire** : les
critères 2 et 4 de P-A reçoivent leur ligne de preuve honnête. **Écrire ce qu'une preuve établit n'est
pas changer le format du dossier** — c'est écrire une meilleure ligne dans le format existant. Rendre
cette ligne **obligatoire pour tous les critères**, c'est la convention, et elle attend Williams.

---

## 2026-08-31 — [L2/T3, étage 2, PROPOSÉES] Sept constats du CRUD users — six remontés, aucun implémenté

T3 (CRUD users) est livré. Ce que son écriture a fait apparaître et qui **n'est pas dans son
périmètre** est listé ici plutôt que corrigé — c'est la règle 09 §5.9 (« proposer est un devoir,
anticiper est une faute ») et `CLAUDE.md` §3.

**1. `users` n'a AUCUN index qui serve `ORDER BY (created_at, id)`.** Le module de pagination
(`apps/api/src/http/pagination.ts`) pose trois exigences à ses appelants ; celle-ci est la seule que
`GET /v1/users` ne tient pas. La pagination reste **correcte** — elle est simplement servie par un
tri en mémoire. Sans effet mesurable au volume de la Phase 1 (une poignée d'auditeurs), coûteux
au-delà de quelques milliers de lignes. **Impact schéma : OUI** — `CREATE INDEX` dans le fichier 04
(§7.1), donc escalade `CLAUDE.md` §3-2. Coût ≈ 0,1 j. **Le `schema:diff` virerait au rouge si on
l'ajoutait sans amender le 04** : c'est exactement pourquoi ce n'est pas fait ici.

**2. Il n'existe pas de RÉACTIVATION de compte.** `PATCH /v1/users/:id/deactivate` a été livrée
parce que le catalogue du journal nomme `user.deactivate` ; **rien ne nomme le retour**. Le §34.4 ne
décrit qu'une sortie. Conséquence concrète : une désactivation par erreur ne se répare que par
`psql`. Deux formes possibles — une action `user.reactivate` au catalogue, ou l'ouverture de
`is_active` dans `user.update` (que le catalogue autorise déjà : `is_active` figure dans
`CHAMPS_UTILISATEUR_JOURNALISABLES`). **Le choix change ce que le journal sait nommer** : c'est une
décision, pas une convention. **Impact API : oui.** Coût ≈ 0,2 j.

**3. Rien ne garantit qu'il reste un administrateur actif.** T3 livre un garde étroit et
déterministe — _on ne se désactive pas soi-même, on ne change pas son propre rôle_ — parce qu'il se
déduit sans inventer. **Il ne couvre PAS deux administrateurs qui se rétrogradent mutuellement.** Une
règle de cardinalité (« au moins un admin actif ») demande de répondre à : que rend-on au dernier
admin, un 409 ? La compte-t-on sous verrou sérialisable ? Ce sont des questions de produit.
**Impact API : un code d'erreur possible.** Coût ≈ 0,3 j.

**4. L'« alerte » exigée par le §9.7 NE PEUT PAS entrer dans la table `alerts`.** Mesuré :
`alerts.mission_id` est `NOT NULL` avec clé étrangère vers `missions` (`0006_rapport_cadrage_
pilotage.sql`), or **une réinitialisation de mot de passe n'appartient à aucune mission**. T3 émet
donc une trace d'exploitation nommée (`reinitialisation_mot_de_passe_forcee`, niveau `warn`) sur
laquelle une supervision peut s'accrocher — le même dispositif que
`journal_activite_ecriture_echouee`. **Ce n'est pas la cloche §20.4.** Rendre `mission_id` nullable
touche le fichier 04 (escalade §3-2) ; le faire porter par la supervision suppose que la supervision
existe — or l'observabilité est elle-même une fiche ouverte (2026-08-29). **À arbitrer ensemble.**

**5. `GET /v1/users` n'a AUCUN filtre.** Ni par rôle, ni par activité, ni par habilitation, ni
recherche par nom. Le pack n'en nomme aucun, donc aucun n'a été inventé. Dès que la console listera
plus de vingt comptes, « qui n'est pas encore habilité ? » deviendra une question quotidienne (c'est
littéralement l'étape 4 du §34.4). **Impact API : extension du schéma de requête uniquement**
(`paginationQuerySchema.extend({ … })`), aucune reprise du dépôt. Coût ≈ 0,2 j.

**6. Le README de `apps/api` ne documente ni les routes d'auth ni la route financière.** Livrées par
T2 et T5, absentes du document — alors que le 11 §8-6 exige que toute route hors §8/§24.2 soit
documentée. T3 a documenté LES SIENNES et **signalé le trou sans le combler** : compléter la
documentation de routes qu'on n'a pas écrites, c'est décrire ce qu'on croit qu'elles font. Coût
≈ 0,2 j, par leurs auteurs.

**7. `packages/shared` porte maintenant TROIS listes de rôles.** `journal.ts`
(`ROLES_JOURNALISABLES`, réutilisée par `users.ts` plutôt que recopiée) et `apps/api/src/db/
schema.ts` (`ROLES_UTILISATEUR`). T3 n'en a **pas** ajouté une troisième — mais le nom
`ROLES_JOURNALISABLES` est désormais faux, puisqu'il sert de contrat d'API. La consolidation était
déjà proposée par `journal.ts` ; **elle gagne un consommateur, donc du poids.** Impact : `db/
schema.ts`, fichier du lot L1. Coût ≈ 0,1 j.

---

## 2026-08-31 — [L17, étage 2, PROPOSÉE] Le ré-audit duplique la mission : questionnaire d'hier ou banque d'aujourd'hui ?

**Constat.** `01 §6.4` pose le ré-audit ainsi : « le ré-audit **duplique la mission** et affiche la
**progression des scores** (avant/après) — la preuve chiffrée de la valeur ». La duplication reprend
donc le questionnaire **figé** de la mission d'origine, c'est-à-dire les colonnes `*_snapshot` de
`mission_questions`.

**Ce que personne n'a tranché.** Entre deux audits séparés de 6 à 12 mois, la banque aura bougé :
questions reformulées, **ancres de cotation affinées**, questions neuves, questions archivées. Deux
exigences se contredisent alors :

- **Comparabilité** — pour que « 2,1/5 → 3,4/5 » veuille dire quelque chose, il faut avoir posé **les
  mêmes questions avec les mêmes ancres**. Une ancre affinée entre-temps déplace le score **sans que
  l'entreprise ait changé** : la « preuve chiffrée » devient un artefact de rédaction.
- **Qualité** — ré-auditer avec des questions qu'on sait moins bonnes, c'est vendre une photographie
  volontairement datée et se priver de ce que la banque a appris.

**Trois formes, sans en trancher aucune :**

1. **Gel strict** — reprise des snapshots à l'identique. Comparabilité parfaite, qualité figée.
2. **Rafraîchissement intégral** — régénération depuis la banque courante. Qualité maximale,
   **progression non comparable** : le score devrait alors être marqué « base modifiée », et le dire
   au client.
3. **Mixte tracé** — les questions inchangées gardent leur snapshot ; celles dont la version a bougé
   sont reprises en neuf **et signalées** ; la progression s'affiche sur le **sous-ensemble commun**.

**Valeur pour l'auditeur.** Le ré-audit est décrit comme « opportunité commerciale récurrente » et
comme la réponse au reproche « des audits qui s'arrêtent au rapport ». Sa valeur tient **entièrement**
à la crédibilité de la progression affichée. Un client qui découvre qu'une part de son amélioration
vient d'une reformulation de question perd confiance dans le chiffre **et dans l'audit d'origine**.

> ### ⚠️ CORRECTION D'A01 AVANT ENREGISTREMENT — la fiche affirmait une urgence qui n'existe pas
>
> **Texte proposé** : _« la forme 3 est la seule qui demande une donnée nouvelle […] si elle est
> retenue, la donnée doit exister dès que le premier questionnaire est figé, c'est-à-dire dès L3 »_,
> et c'était présenté comme **la raison d'ouvrir la fiche maintenant**.
>
> **Mesuré, et c'est faux.** `mission_questions` porte **déjà** `question_id` **et**
> `question_version` (`04` ligne 101 ; `0003_questionnaire.sql:100-101` ; `db/schema.ts:511-512`).
> Deux lignes sont donc comparables **si et seulement si** elles partagent ces deux valeurs — c'est
> calculable sur les données existantes, **sans colonne nouvelle, sans amendement du 04, et sans rien
> exiger de L3**.
>
> **Ce qui reste vrai après la mesure** : `question_version` est **nullable**, et le `NULL` a une
> raison — une question `added_ad_hoc` n'a pas de version de banque. Ces lignes-là ne sont comparables
> à rien, ce qui est correct : une question inventée pour une mission ne devrait pas peser dans une
> progression inter-missions. **C'est une propriété acquise, pas un trou.**
>
> **Pourquoi je corrige plutôt que d'enregistrer tel quel.** La fiche demandait, sur la foi de cette
> phrase, une vigilance en Phase 1 sur un lot déjà chargé. Une anticipation fondée sur une donnée
> absente **qui existe** est exactement ce que `CLAUDE.md` §3 point 7 nomme : _proposer est un devoir,
> anticiper est une faute_. Le rédacteur avait demandé qu'on le contredise s'il surestimait ; il
> surestimait, et il avait raison de le demander.

**Impact schéma / API : AUCUN, pour les trois formes.** La forme 3 elle-même se calcule sur
`(question_id, question_version)`. Ce n'est donc **pas** une escalade `CLAUDE.md` §3-2.

**Coût estimé.** Décision : quelques minutes. Forme 1 : nul (comportement par défaut de la
duplication). Forme 2 : ≈ 0,2 j. Forme 3 : ≈ 0,4 j, **sans amendement du 04**.

**Quand la trancher : avant L17 (Phase 3), et pas avant.** Rien dans les lots de Phase 1 ne dépend de
cette décision — c'est le sens de la correction ci-dessus.

**Origine.** Question de Williams le 2026-08-31 en examinant l'adaptation des questionnaires par
entreprise. Rédigée par la session d'audit en lecture seule ; **corrigée et enregistrée par A01** ;
**non implémentée** (09 §5.9).

## 2026-08-31 — [infra/C3, étage 2, PROPOSÉE] `shellcheck` ne voit pas le script qui porte toute la sauvegarde

**Constat, mesuré.** Le job `shellcheck` de la CI (`.github/workflows/ci.yml`, ligne ~152) analyse
`git ls-files 'infra/scripts/*.sh'`. Or **le script de sauvegarde n'est pas là** : il vit dans
`infra/postgres/sauvegarde.sh` (2 300 lignes), avec `sauvegarde-healthcheck.sh`, `healthcheck.sh` et
`stanza-create.sh`. **Le seul code shell qui décide si les données quittent la machine est le seul
que le garde-fou shell ne regarde pas.** Son nom même — « shellcheck (infra/scripts/\*.sh) » — dit
exactement ce qu'il fait ; il ne ment pas, il est simplement posé au mauvais endroit.

**Preuve.** `shellcheck --severity=warning --shell=bash infra/postgres/sauvegarde.sh` rend
**7 constats** sur la version `main` (6 × SC2010 `ls | grep`, 1 × SC2046 mot non protégé, aux lignes
1279, 1314, 1763, 1837, 1848, 1927, 1988 de `main`). Aucun n'est grave — les noms de fichiers du
répertoire d'archives sont contraints par `MOTIF_MINIO`/`MOTIF_COFFRE`, donc `ls | grep` y est sans
danger — **mais aucun n'a jamais été vu par la CI.**

**Pourquoi ce n'est PAS de l'étage 1 et pourquoi le chantier C3 ne l'a pas fait au passage.** Élargir
le glob à `infra/postgres/*.sh` rend la CI **rouge sur 7 constats préexistants**, dans du code que ce
chantier n'a ni écrit ni mesuré. Les corriger d'office serait toucher, sans mandat, à la rotation des
archives et au garde-fou de santé du dépôt local — exactement le genre de « pendant que j'y suis »
que le pipeline interdit. Le correctif du miroir R2 livré ce jour **n'ajoute aucun de ces 7 constats**
(vérifié : même liste avant et après).

**Valeur.** Le jour où un `$` non protégé se glisse dans le chemin d'une purge distante, c'est la CI
qui doit le dire, pas la nuit du sinistre.

**Coût estimé.** ≈ 0,3 j : élargir le glob à `infra/postgres/*.sh` **et** traiter les 7 constats
(remplacer les `ls | grep` par une boucle `for f in "$ARCHIVES"/*` avec test, protéger le `$(sb_ssh_opts)`).

**Impact schéma / API : aucun.** Impact CI : un job élargi. Impact `infra/postgres/*.sh` : 7 sites.

---

# RÉSERVES DE LA PORTE P-B PORTÉES EN FICHES (2026-09-02, session de vérification)

> Le gardien A02 a posé douze réserves à P-B ; trois exigeaient « une fiche `AMELIORATIONS.md` »
> et n'en avaient pas au moment de la signature. Les voici, sans rien décider : l'arbitrage est à
> Williams, à la porte P-C. Numérotation : **A-004 à A-006** ; la session pilote numérote à partir
> de **A-007** (fiche « garde anti-annulation vitest », annoncée le 2026-09-02).

## ÉTAGE 1 — micro-amélioration due (réserve R-B4)

### FICHE A-004 — `reinitialiserCachePreparation` est orpheline (R-B4)

**Constat (A02, fiche P-B §10.7).** `apps/api/src/dependances.ts:349` exporte
`reinitialiserCachePreparation` ; **aucun appelant** dans le code de production ni dans les tests,
et son commentaire affirme un consommateur qui n'existe pas. `CLAUDE.md` §4 étape 6 : le code
orphelin est refusé.

**Valeur.** Nulle en soi ; le coût est celui d'une fausse promesse dans le code, et d'un garde
(`check:graphe-modules`) qui ne voit pas les exports morts, seulement les imports pendus.

**Coût estimé.** 0,1 j : soit la brancher dans les tests qui sondent la préparation (si elle sert
à isoler des cas), soit la retirer. **Étage 1, avant P-C**, par l'équipe 1.

**Impact schéma / API / crypto : aucun.**

## ÉTAGE 2 — fiches en attente d'arbitrage (réserves R-B6 et cookie)

### FICHE A-005 — `packages/shared/src/redaction.ts` n'est sous aucun seuil de couverture (R-B6)

**Constat (A02, fiche P-B §10.7 ; A51, verdict du 2026-08-31).** Le module qui porte l'invariant
« aucune donnée personnelle dans les logs » est rapporté à **0,00 %** de couverture : `packages/shared/**`
n'est pas dans `.github/coverage-critical-paths.json`, et le défaut d'outillage y est **déclaré**
sans être tracé. A51 a en outre montré que la redaction est **contournable par tout objet portant
un `toJSON()`** (correctif fusionné en `#17`, `redaction-journal-serialisation.test.ts`) : c'est
précisément le genre de trou qu'un seuil mesuré aurait rendu visible plus tôt.

**Valeur pour l'auditeur.** Directe : c'est la garantie RGPD des journaux (06 §10, invariant du
`CLAUDE.md` §2). À L6c, les journaux porteront pour la première fois des données de sync réelles.

**Coût estimé.** 0,3 j : ajouter `packages/shared/src/redaction.ts` aux chemins critiques avec le
seuil de 90 %, écrire les cas manquants (formes sérialisées, tableaux imbriqués, `toJSON`, clés en
français), et faire tourner le projet vitest `interface`/`unit` sur `packages/shared` dans le job
`couverture`.

**Impact schéma / API / crypto : aucun.** Impact CI : un chemin critique de plus.

**Recommandation.** **ABSORBÉE, avant L6c** — c'est une réparation d'un défaut déclaré, sous 0,5 j :
pré-autorisée par le point 4 du régime du 2026-08-31 si Williams ne s'y oppose pas.

**Arbitrage Williams :** ☐ ABSORBÉE ☐ PHASE 2 ☐ REFUSÉE — _à la porte P-C_

### FICHE A-006 — Les cookies httpOnly de la console n'existent pas : `@fastify/cookie` est installé, jamais enregistré

**Constat (A51, verdict du 2026-08-31 ; revérifié le 2026-09-02 sur `main`).** `CLAUDE.md` §9 et
06 §8.1 imposent pour la console (`apps/hq`) une authentification par **cookies httpOnly
SameSite=Lax + en-tête anti-CSRF**. `@fastify/cookie` est épinglé (décision du 2026-08-31) et
installé, mais **`app.ts` ne l'enregistre pas** : `git grep cookie -- apps/api/src/app.ts` ne rend
rien. Le mode Bearer du terrain est le seul chemin d'authentification qui existe. Sans objet pour L2
(aucun écran console), ce qui a permis de signer P-B ; **dû au premier incrément de L7**.

**Valeur pour l'auditeur.** Indirecte mais bloquante : sans cookie, la console n'a pas
d'authentification conforme, et L7-min ne peut pas être démontré à P-E.

**Coût estimé.** 0,5 j : enregistrement du plugin avec les attributs `httpOnly`, `secure`,
`sameSite=lax`, émission à `/v1/auth/login` quand le client est la console, lecture dans le crochet
d'identité (cookie OU Bearer, jamais les deux), en-tête anti-CSRF custom vérifié sur les écritures,
tests d'intégration rôle × chemin (cookie sans en-tête → refus).

**Impact schéma : aucun. Impact API : un chemin d'authentification de plus sur des routes existantes.
Impact crypto : aucun** (le jeton est le même, seul le transport change).

**Recommandation.** **ABSORBÉE dans L7a** — ce n'est pas une fonctionnalité nouvelle, c'est une
clause du contrat 11 §3 non encore tenue. À planifier par A30 au brief de L7.

**Arbitrage Williams :** ☐ ABSORBÉE ☐ PHASE 2 ☐ REFUSÉE — _à la porte P-C_

### FICHE A-008 — Le coffre terrain chiffre sans AAD : une enveloppe n'est pas liée à sa ligne

**Constat terrain (A24, 2026-09-02, relevé par A29) :** AES-256-GCM sans données authentifiées
additionnelles. Une enveloppe déchiffrable l'est **quelle que soit la ligne où on la colle** : un
attaquant qui écrit déjà dans IndexedDB peut déplacer une réponse d'une question à une autre sans que
le déchiffrement le voie. Lier l'enveloppe à sa ligne exigeait un troisième paramètre et cassait la
signature publiée `dechiffrer(e, s)` en pleine rencontre tests × code.

**Valeur pour l'auditeur :** un durcissement, pas une faille du modèle de menace 06 §10 — la menace
suppose un attaquant qui a déjà passé le verrou et le coffre. Mais une réponse déplacée d'une question
à une autre est une donnée fausse qui ne se signale pas.

**Proposition (étage 2) :** AAD = `table:id:colonne`, posée par le port d'écriture, vérifiée par
`dechiffrer`. Migration locale des enveloppes existantes au ré-enveloppement. À arbitrer à **P-C**.
**Coût estimé :** ≈ 0,3 j. **Impact schéma / API : aucun.** Impact `apps/field/src/local/**` : coffre,
port, tests. Trace : `DECISIONS.md` 2026-09-02 « Aucun AAD sur AES-GCM ».

### FICHE A-009 — L'icône de la PWA terrain est PROVISOIRE : le dessin reste à Williams

**Constat (A29, 2026-09-02, B2) :** le manifeste livré par L5a n'avait aucune icône — non installable,
donc `storage.persist()` refusé sur iPad, donc aucune mission embarquable. La décision du 2026-08-28
réserve le dessin de l'icône à Williams et interdit le demi-manifeste. **Défaut appliqué sous la règle
« silence vaut accord »** (`DECISIONS.md` 2026-09-02) : un aplat aux couleurs des tokens (terracotta
sur ivoire), généré par `apps/field/scripts/build-icones.mjs` à partir de `COULEURS_CHARTE`, 192 /
512 / maskable / `apple-touch-icon`, marqué `"_provisoire": true` dans le manifeste.

**Ce qui reste dû, à Williams :** l'icône de charte. Le remplacement est une substitution de
fichiers PNG, sans code. À cocher à la porte **P-C**.
**Coût estimé :** 0 j côté code. **Impact schéma / API : aucun.**
