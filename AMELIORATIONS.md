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
| L0-b | ~0,2 j   | 0,5 j   | ~0,3 j                    |

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
