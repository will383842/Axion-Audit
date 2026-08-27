# ETAT.md — Fichier d'état de l'autopilote (contrat 11 §9ter)

> **APPEND-ONLY par blocs — LE DERNIER BLOC FAIT FOI.**
> Mis à jour à CHAQUE changement d'étape du pipeline et au minimum toutes les ~2 h de travail.
> **Rappel du §9ter : la vérité terrain, ce sont les TESTS, jamais un souvenir ni même ce fichier.**
> En cas de divergence entre ce fichier et les tests : entrée `DECISIONS.md`, reconstruction de
> l'état depuis git + tests, correction d'ETAT.md — jamais de confiance aveugle au fichier.

---

## 2026-08-27 14h30 — [lot L0 / incrément L0-a] — étape pipeline 2/7

Dernier commit vert : (aucun — dépôt initialisé cette session) · Branche : lot/l0-infra · Poussé : non (origin absent — voir DECISIONS 2026-08-27)
Tâche en cours : création du cadre de gouvernance (CLAUDE.md, DECISIONS.md, AMELIORATIONS.md, arborescence docs/) puis squelette du monorepo.
Prochaine action : créer le squelette monorepo pnpm (package.json racine, pnpm-workspace.yaml, tsconfig.base.json, eslint/prettier, .npmrc, .nvmrc, .gitignore) puis les 5 espaces de travail minimaux.
Tests rouges connus : aucun (aucune suite de tests n'existe encore)

---

## 2026-08-27 16h15 — [lot L0 / incrément L0-a] — étape pipeline 3/7 (auto-revue terminée)

Dernier commit vert : a445739 (feat(l0): infrastructure, CI complète et squelette applicatif du monorepo) · Branche : lot/l0-infra · Poussé : non (origin absent — voir DECISIONS 2026-08-27)
Tâche en cours : équipe du lot livrée (A11 infra, A52 CI/CD, A55 les 40 gabarits, A01 monorepo). Auto-revue faite : lint 0 erreur, typecheck 6/6, 91 tests verts, garde-fous d'invariants et anti-skip verts, format vert, build des 4 apps OK, API éprouvée à l'exécution. Deux défauts trouvés et corrigés par l'auto-revue : Prettier avait reformaté les 12 fichiers du pack (restaurés + `docs/` verrouillé + sceau d'intégrité `pnpm check:pack`), et le garde-fou d'invariants produisait deux faux positifs. A11 applique l'arbitrage Caddy (un seul frontal, staging en sous-domaine — 02 §11.2).
Prochaine action : lancer la REVUE CROISÉE (étape 4) et le contrôle d'acceptation du gardien A02 (étape 6, matrice E1-E47 dans les DEUX sens + DoD transverse), puis rédiger docs/portes/PORTE_A_*.md et la ligne de journal avec burn-down.
Tests rouges connus : aucun

---

## 2026-08-27 17h05 — [lot L0 / incrément L0-a] — étape pipeline 4/7 (revue croisée rendue, corrections en cours)

Dernier commit vert : e8d4e47 (fix(l0): corrections de la revue croisée et du veto du gardien) · Branche : lot/l0-infra · Poussé : non (origin absent — voir DECISIONS 2026-08-27)
Tâche en cours : correction des défauts de l'étape 4. La revue croisée (A17) a rendu NON CONFORME — 7 bloquants, 12 majeurs — et le gardien A02 un VETO sur 4 écarts. Cause racine tracée : trois agents ont livré en parallèle trois moitiés d'interface qui ne se rejoignaient pas ; aucun bloquant n'était atteignable par l'auto-revue, faute d'avoir jamais exécuté Docker ni la CI. TRAITÉ à ce jour : B-4, B-5 (Playwright ajouté, 8 tests E2E réellement verts), M-3, M-4, M-6, M-12, code orphelin, gouvernance V4 ; A52 a corrigé B-1, B-2, B-3, M-1, M-5, M-7, M-8, M-10, M-11. RESTE : B-6 (port de la console) et B-7 (service des fronts) chez A11, en cours.
Prochaine action : à la livraison d'A11, exécuter `pnpm verify` puis `docker compose config` sur les 3 combinaisons, commiter, PUIS rejouer la revue croisée ET le contrôle d'acceptation DANS L'ORDRE (l'étape 6 avait été lancée en parallèle de l'étape 4 — c'est l'écart V3, et c'est une faute d'orchestration d'A01, pas du gardien).
Tests rouges connus : aucun — `pnpm verify` sort en 0 (lint, format, typecheck 6/6, 4 garde-fous, build des 4 apps, 95 tests unitaires, 8 E2E).

---

## 2026-08-27 18h40 — [lot L0 / incrément L0-a] — étape pipeline 4/7 (seconde passe rendue, réserves en traitement)

Dernier commit vert : 46066cc (docs(l0): dossier de la porte P-A en préparation) · Branche : lot/l0-infra · Poussé : non (origin absent — voir DECISIONS 2026-08-27)
Tâche en cours : traitement des réserves de la SECONDE passe de revue croisée. Verdict : CONFORME AVEC RÉSERVES — les 7 bloquants sont fermés et vérifiés dans le code, 9 majeurs sur 12 fermés. La passe de correction avait introduit trois défauts de la famille exacte qu'elle corrigeait : des garde-fous qui mentent ou qui ne sont branchés nulle part. TRAITÉ par A01 : N-1 (le détecteur d'orphelins capturait `coverage.include` et ignorait les `exclude` — il lit désormais include ET exclude PAR PROJET, éprouvé sur les formes qu'il ratait), N-3 (`.env.example` était hors périmètre du garde-fou alors que son commentaire le désignait comme le fichier le plus exposé — désormais couvert, éprouvé par injection d'un faux secret), N-4 (échappement `\s` cassé dans le marqueur), N-7 (le contrôle de jonction était aveugle à `pnpm --filter X Y`, la forme EXACTE du défaut B-4 — tokenisé et résolu PAR PAQUET, il attrape maintenant B-1 et N-8 tout seul), N-8 (`db:generate`, `seed`, `seed:demo` déléguaient dans le vide — stubs auto-durcissants). DÉLÉGUÉ : N-2 (brancher les deux garde-fous sur la CI) à A52, N-5 (le runbook prescrit l'erreur que M-11 supprime) à A11. Les deux travaillent.
Prochaine action : à la livraison d'A52 et d'A11, exécuter `pnpm format` (bloqué en attendant : `infra/README.md` est en cours d'édition par A11), puis `pnpm verify`, commiter, et rejouer le CONTRÔLE D'ACCEPTATION du gardien A02 — l'étape 6, cette fois APRÈS l'étape 4.
Tests rouges connus : aucun. `pnpm format:check` échoue sur le seul `infra/README.md`, en cours d'édition par A11 — ce n'est pas un défaut, c'est une écriture concurrente.

---

## 2026-08-27 19h50 — [lot L0 / incrément L0-a] — étape pipeline 6/7 (acceptation rendue, réserves fermées)

Dernier commit vert : fdd5f59 (fix(l0): réserves de la seconde revue croisée) · Branche : lot/l0-infra · Poussé : non (origin absent — voir DECISIONS 2026-08-27)
Tâche en cours : clôture de l'incrément L0-a. Le gardien A02 a LEVÉ son veto : ACCEPTÉ SOUS RÉSERVE sur L0-a, avec ZÉRO code orphelin et V1/V2/V3 fermés par exécution. Ses trois réserves sont traitées : R1 (4 entrées DECISIONS sans `Options:`, 19 sans déclaration de précédence) → régularisation append-only + `pnpm check:decisions` qui MÉCANISE la règle, son exemption étant lue dans le registre et non cachée dans le script ; R2 (le dossier de porte affirmait « 23 entrées, toutes au format » — c'était faux, et c'était le reproche que ce même fichier adresse à l'auto-revue) → corrigé et documenté ; R3 (six manques au dossier de porte) → colonne « sortie constatée · date · opérateur », verdicts A51/A54, dépendance des migrations à L0-b, garde-fou @filrouge, tableau des invariants non mécanisables. Deux garde-fous ajoutés sur recommandation d'A02, tous deux éprouvés — dont celui du fil rouge, qui s'était d'abord fait prendre à son propre piège en se satisfaisant d'un COMMENTAIRE.
Prochaine action : commiter, puis OUVRIR LE LOT L1 dans une session neuve — ordre de lecture : 11 (contrat) EN PREMIER, puis 04 EN ENTIER (source unique du DDL), 03 (§32.1-32.2), 01 (§2). Livrables L1 : schéma intégral, migrations up/down, seed rejouable 2× identique, `schema-manifest.json` extrait du fichier 04, générateur FIL-GC, et les deux missions canoniques en fixtures. Trois garde-fous se DURCISSENT automatiquement à l'apparition de `apps/api/drizzle/` : schema:diff, tests d'intégration, @filrouge.
Tests rouges connus : aucun. `pnpm verify` sort en 0 sur 13 contrôles.

---

## 2026-08-27 18h35 — [lot L0 / incrément L0-b] — étape pipeline 7/7 (porte P-A, moitié L0 franchie)

Dernier commit vert : db4ada4 (fix(l0-b): images api et worker) · Branche : lot/l0-infra · **Poussé : OUI — origin existe enfin**
Tâche en cours : L0-b exécuté sur autorisation explicite de Williams. Dépôt privé créé (il était PUBLIC — basculé en privé AVANT tout push, le pack impose le privé et le dépôt contient le CDC maître). 15 commits poussés. Docker Desktop démarré : pile complète à 8 services healthy, tous les contrôles fonctionnels du runbook §2 verts. Sauvegarde + restauration Postgres ET MinIO PROUVÉES par exécution réelle. CI ENTIÈREMENT VERTE : 18/18 jobs, 4 images publiées sur GHCR. Critères L0 n°1 et n°2 COCHÉS avec preuve ; n°3 et la moitié du n°4 attendent le VPS.
Prochaine action : Williams tranche le plan GitHub (Pro rétablit protection de branche + relecteur d'environnement, refusés sur plan gratuit en dépôt privé — `main` n'est PAS protégée en l'état), puis déroule `infra/README.md` §3 à §5 pour le VPS. Ensuite seulement : ouvrir le lot L1 en session neuve (lecture : 11 puis 04 EN ENTIER).
Tests rouges connus : aucun. `pnpm verify` code 0 depuis un clone neuf ; CI 18/18.

---

## 2026-08-27 20h10 — [lot L1 / incrément L1] — étape pipeline 2/7

Dernier commit vert : 9ddca7e (docs(l0-b): fiche AMELIORATIONS A-002) · Branche : lot/l0-infra · Poussé : oui
Tâche en cours : **LOT L1 OUVERT** après reprise conforme au 11 §9ter — ETAT.md relu, git vérifié, 10 dernières décisions et fiches d'amélioration relues, **suite complète rejouée : `pnpm verify` code 0, 31 contrôles verts**, pile Docker saine depuis 2 h. Fichier 04 lu EN ENTIER par A01. L1 n'est pas un lot à risque (09 §3.1bis) : pas de note de conception. Deux agents en parallèle, chacun lisant la spec de son côté — A12 (DBA) transcrit le fichier 04 en migrations SQL brut + manifeste + seed ; A16 (testeur d'intégration) écrit ses tests DEPUIS LA SPEC, sans lire le code d'A12. Si leurs deux lectures du fichier 04 divergent, les tests échoueront : c'est le dispositif, pas un accident.
État de l'infrastructure : dépôt PUBLIC, `main` protégée (11 contrôles de CI requis), relecteur obligatoire sur `prod`, squash merge seul. Mesure réelle relevée pour dimensionner le VPS : une pile au repos consomme **1,03 Go** ; il en faut deux (prod + staging cohabitant, 02 §11.2) → **cpx32 recommandé** (4 vCPU, 8 Go, 160 Go).
Prochaine action : à la livraison d'A12 et A16, confronter les deux lectures, puis livrer les fixtures **FIL-TPE et FIL-GC** + le générateur FIL-GC (09 §4bis, outillage de test du L1) et le premier test `@filrouge` — trois garde-fous se durcissent dès l'apparition de `apps/api/drizzle/` et l'exigeront.
Tests rouges connus : aucun à l'ouverture du lot. Attendus rouges pendant L1 : `schema:diff` (manifeste à produire), `test:integration` (suite à écrire), `check:test-projects` (fil rouge à écrire) — c'est l'auto-durcissement prévu au L0, pas une régression.

---

## 2026-08-27 20h50 — [lot L1 / schéma & migrations] — étape pipeline 4/7 (revue croisée rendue, corrections en cours)

Dernier commit vert : 99ed12b (fix(l1): le job d'intégration de la CI ne fournissait pas les variables du seed) · Branche : lot/l0-infra · Poussé : oui
Tâche en cours : traitement des réserves de la revue croisée L1 (A17 — verdict **CONFORME AVEC RÉSERVES**, 4 bloquants, 6 majeurs).
Le SCHÉMA est jugé bon : A17 a comparé la base au fichier 04 sans passer par le manifeste d'A12 (juge et partie), a relu les 57 CHECK valeur par valeur, et n'a trouvé aucune table, colonne ni valeur d'énumération manquante. **Ce sont les GARDE-FOUS qui étaient faux** : 25 mutations injectées dans le schéma, **8 non détectées** par `schema:diff` — dont l'inversion de `users_role_check` (`= ANY` → `<> ALL`) qui fait ACCEPTER `role='pirate'` et REFUSER `role='admin'` avec ZÉRO ÉCART annoncé.
Répartition en cours : A12 (comparateur B-1/B-2/B-3, colonnes de traçabilité NOT NULL, migration 0010) · A16 (méta-test des mutations `@critique`, empreinte de contenu du seed) · A01 (entrées DECISIONS manquantes, scripts).
Fait par A01 depuis le dernier commit : 3 entrées `DECISIONS.md` (sémantique du comparateur + index de FK ; conventions de typage T1-T11 ; `interviews.org_unit_id` reste NOT NULL) — les deux premières sont des **régularisations tardives assumées**, l'arbitrage avait été appliqué au code sans être tracé, et l'entrée le dit ; `test:critique` corrigé (sortait en code 1, réserve M-1) ; **contrôle 4** ajouté à `check-test-projects.mjs` (au moins un test `@critique` une fois `apps/api/drizzle/` présent), prouvé par injection.
Prochaine action : recevoir les rapports d'A12 et d'A16, exécuter `pnpm verify` complet, commiter, PUIS rejouer le contrôle d'acceptation du gardien A02 (étape 6) — **dans l'ordre**, l'écart V3 du lot L0 étant précisément d'avoir mené l'étape 6 en parallèle de l'étape 4.
Tests rouges connus : aucun à cet instant, mais la suite n'a pas été rejouée depuis les corrections d'A12 — le vert n'est donc PAS acquis.
Réserve non refermée, hors périmètre logiciel : la DoD « migrations up/down exécutées sur staging » reste incochable tant que le VPS n'existe pas. Porte P-A en attente de Williams.

---

## 2026-08-27 21h35 — [lot L1 / schéma & migrations] — étape pipeline 4/7 (corrections livrées, 2ᵉ passe de revue en cours)

Dernier commit vert : a1b82fa (fix(l1): réserves de la revue croisée — le comparateur schéma-vs-04 était trompable) · Branche : lot/l0-infra · Poussé : **oui**
Tâche en cours : attente du verdict de la **deuxième passe de revue croisée**. Le réviseur de la première passe n'existait plus (session éteinte) — un réviseur NEUF a été lancé, ce qui renforce l'indépendance.
État vérifié PAR EXÉCUTION, pas par rapport d'agent : `pnpm verify` **code 0** — 95 tests unitaires · 54 d'intégration · 8 Playwright · les 6 garde-fous verts · `schema:diff` **zéro écart**.
Recoupements indépendants faits par A01 sur la base et sur le texte du 04, sans passer par le manifeste d'A12 : 11 migrations · 43 tables · 472 colonnes · 193 contraintes · **100 colonnes marquées `NULL`** au 04 (comptage séparé, identique) · **28 `DEFAULT` prescrits** (comptage séparé, identique) · aucune fonction SQL `uuidv7()` · `gen_random_uuid()` cantonné aux 4 tables purement serveur.
Toutes les réserves de la 1ʳᵉ passe sont traitées : 4 bloquants (comparateur trompable sur la logique des CHECK, parenthèses supprimées, index UNIQUE non gardé, arbitrages non tracés) et 6 majeurs. Un bloquant NOUVEAU a été trouvé en cours de route par le méta-test — le comparateur ignorait nullabilité, DEFAULT et précision — arbitré, corrigé, et gardé par 12 classes de mutation testées.
Prochaine action : recevoir le verdict de la 2ᵉ passe ; si CONFORME, clore l'étape 4, puis lancer le **gardien A02 pour l'étape 6** (matrice E1-E47 dans les DEUX sens + DoD transverse), rédiger le journal du lot et compléter `docs/portes/PORTE_A_*.md` (critères L1 n° 5 à 8, aujourd'hui non cochés).
Tests rouges connus : aucun en local. **La CI distante n'a pas encore été observée sur ce commit.**
Réserve hors périmètre logiciel, inchangée : la DoD « migrations up/down exécutées sur staging » reste incochable tant que le VPS n'existe pas. Porte P-A en attente de Williams.

---

## 2026-08-27 22h40 — [lot L1 / schéma & migrations] — étape pipeline 4/7 (2ᵉ série de corrections livrée, 3ᵉ passe lancée)

Dernier commit vert : d832e30 (fix(l1): 2ᵉ passe de revue — 6 mutations de plus passaient, et l'une bloquait toute collecte) · Branche : lot/l0-infra · Poussé : **oui**
Tâche en cours : attente du verdict de la **3ᵉ passe de vérification**. Le réviseur est le même qu'à la 2ᵉ passe (contexte conservé), et sa consigne n'est PAS de rejouer ses 15 mutations — elles sont désormais dans le méta-test — mais de **chercher ce qui reste** et de juger si l'approche du comparateur est saine.
Ce que la 2ᵉ passe avait trouvé : verdict **NON CONFORME**, 4 bloquants + 6 majeurs, sur 15 mutations neuves dont **6 non détectées**. La plus grave : `.toLowerCase()` sur la définition entière, littéraux compris, alors que PostgreSQL compare les chaînes en respectant la casse — `'NON_DEMARRE'` au lieu de `'non_demarre'` donnait ZÉRO ÉCART pendant qu'**aucune session de collecte ne pouvait plus être créée**.
État vérifié PAR EXÉCUTION : `pnpm verify` **code 0** — 95 unitaires · **58** d'intégration (méta-test porté de 12 à 16 classes) · 8 Playwright · `schema:diff` zéro écart · chaîne up 12 → down 12 → up 12 · seed ×2 identiques.
Recoupements indépendants d'A01 : les **23 colonnes d'identité déclarées par T13 sont toutes NOT NULL en base** (requête directe, aucune ligne nullable) · 23 + 20 = 43 tables, l'inventaire couvre le schéma entier · les deux branches d'échec du contrôle 4 réécrit sont **prouvées par injection**.
**RISQUE À REMONTER À LA PORTE :** le comparateur a nécessité **deux** séries de corrections, chacune trouvant de nouvelles façons de le tromper. Si la 3ᵉ passe trouve encore des bloquants de la même famille, la limite de 3 tentatives (09 §5.5) est atteinte et la question devient une question de **conception** — comparer des définitions SQL sous forme de texte normalisé est fragile par nature — à arbitrer par Williams, pas par A01.
Prochaine action : verdict de la 3ᵉ passe. Si conforme → clore l'étape 4, lancer le **gardien A02 (étape 6)**, compléter `docs/portes/PORTE_A_*.md`. Sinon → escalade Williams.
Tests rouges connus : aucun en local. CI du commit `d832e30` non encore observée.
Réserve hors périmètre logiciel, inchangée : DoD « migrations up/down sur staging » incochable sans VPS. Le runbook de cohabitation avec axion-ia.com est écrit (`infra/COHABITATION_AXIONIA_WEB.md`) et attend trois commandes en lecture seule de Williams.

---

## 2026-08-27 23h50 — [lot L1 / schéma & migrations] — étape pipeline **6/7** (étape 4 CLOSE, gardien A02 lancé)

Dernier commit vert : bf7f6ca (fix(l1): 3ᵉ passe — et un second verrou, parce qu'une liste blanche ne peut pas être exhaustive) · Branche : lot/l0-infra · Poussé : **oui**
**ÉTAPE 4 CLOSE.** Trois passes de revue croisée, par deux réviseurs différents dont aucun n'avait produit de code. Verdict final : **`CONFORME AVEC RÉSERVES`**, et le réviseur écrit qu'il **ne recommande pas une quatrième passe de correctifs**. Ses deux dernières réserves (R-1 colonnes des tables partitionnées jamais comparées, R-2 contraintes EXCLUDE hors introspection) sont corrigées avec preuve.
**Bilan des trois passes : 43 mutations injectées dans le schéma, 22 non détectées au moment de leur découverte, toutes gardées aujourd'hui par un test.** Le motif constant n'était pas l'erreur de code mais **le contrôle qui annonce plus qu'il ne fait**.
**Décision de conception prise ce soir (tracée) :** un **second verrou en liste NOIRE**, `pnpm check:schema-inventaire`, indépendant du comparateur. Le diff dit « tout ce que le 04 décrit est là » ; l'inventaire dit « et rien d'autre ne s'y est glissé ». Les deux échouent pour des raisons opposées. Prouvé par injection des 8 familles : 10 objets détectés, aucun manqué. Motif : la 3ᵉ passe a montré que le territoire restant n'était plus un oubli d'implémentation mais **une limite du périmètre du 11 §7 lui-même** — une `RULE … DO INSTEAD NOTHING` fait RÉUSSIR l'insertion d'une réponse sans rien écrire, et la synchronisation terrain rapporte un succès.
**ESCALADE OUVERTE — fiche AMELIORATIONS A-003, PROPOSÉE et NON IMPLÉMENTÉE :** remplacer le manifeste par un **schéma doré** (`pg_dump`) comparé textuellement. Elle remplacerait un mécanisme que le contrat 11 §7 nomme → **arbitrage de Williams à la porte P-A**. Recommandation d'A01 : ABSORBÉE (~0,5 j).
État vérifié PAR EXÉCUTION : `pnpm verify` **code 0** — 95 unitaires · **66** d'intégration · 8 Playwright = **169 tests** · `schema:diff` ZÉRO ÉCART · `check:schema-inventaire` vert · chaîne up 12 → down 12 → up 12 · seed et seed:demo ×2 identiques.
Tâche en cours : **gardien A02, étape 6** — critères du fichier 07, matrice E1-E47 **dans les deux sens** (le code orphelin est refusé), DoD transverse. Consigne donnée : appliquer à la production d'A01 la même méfiance qu'aux autres, recompter tous les chiffres, et **éprouver au moins deux garde-fous par injection**.
Prochaine action : recevoir le verdict du gardien. Si ACCEPTÉ → compléter le dossier de porte et rendre le lot à Williams. Sinon → traiter ses refus avant toute porte.
Tests rouges connus : aucun.
**Piège de machine, à savoir pour toute reprise :** `pnpm verify` a échoué DEUX FOIS en `0xC0000142` (épuisement de ressources Windows — 3,3 Go libres sur 15,8 avec Docker Desktop), sur quatre compilations parallèles. Reprendre avec `npm_config_workspace_concurrency=1` et **rien d'autre en parallèle**. Ce n'est pas un défaut du dépôt : la CI passe.
Réserve hors périmètre logiciel, inchangée : DoD « migrations up/down sur staging » incochable sans VPS. `infra/COHABITATION_AXIONIA_WEB.md` écrit, en attente de trois commandes en lecture seule de Williams.

---

## 2026-08-28 00h40 — [lot L1] — étape pipeline **6/7 TERMINÉE** — le lot attend la porte de Williams

Dernier commit vert : 0ff6997 (fix(l1): étape 6 — l'invariant 2 n'avait JAMAIS été vérifié par la CI) · Branche : lot/l0-infra · Poussé : **oui**
**Contrôle d'acceptation du gardien A02 : `ACCEPTÉ SOUS RÉSERVE`.** Les 4 critères du fichier 07 cochés avec SA preuve exécutée. **Verdict anti-orphelin : 43 tables livrées, 43 rattachées, 0 orpheline** — rattachement établi contre le TEXTE du 04, jamais contre le commentaire de la migration. Contrôle fait aussi dans l'autre sens : le 04 décrit 46 tables, 3 ne sont pas créées, omission délibérée, tracée et vérifiée absente en base.
Tous les chiffres recomptés par le gardien : **exacts** (43 tables · 472 colonnes · 193 contraintes · 53 index · 216 NOT NULL · 100 marqueurs NULL · 28 DEFAULT · 23 identités T13 · 169 tests).
Ses 4 réserves sont traitées et commitées : **F-1** (l'invariant 2 jamais vérifié par la CI, affirmation fausse dans DEUX fichiers — corrigé, secret câblé, contrôle rendu bloquant en CI) · **F-2** (garde-fou du fil rouge à moitié décoratif — corrigé, prouvé par l'injection exacte du gardien) · **F-3** (`test:e2e:filrouge` en code 1) · **F-7** (branche non tracée — entrée DECISIONS écrite).
**Erreur d'A01 corrigée AVEC sa mention** : le §3bis du dossier de porte annonçait « 40 mutations, onze non détectées ». Le vrai total est **53 injectées, 22 non détectées** (25+15+13 et 8+6+8). Le chiffre faux avait été transmis à Williams.

### CE QUI ATTEND WILLIAMS — par ordre de blocage

1. **Créer le secret `AXION_CLIENTS_SURVEILLES`** (Settings → Secrets and variables → Actions), noms séparés par des virgules. **Tant qu'il n'existe pas, le job `invariants` de la CI est ROUGE — délibérément.** Une CI rouge et honnête vaut mieux qu'une CI verte qui prétend vérifier un invariant non négociable sans le faire.
2. **Le VPS.** La DoD « migrations up/down exécutées sur staging » reste incochable. `infra/COHABITATION_AXIONIA_WEB.md` est écrit et attend trois commandes en LECTURE SEULE (`free -h`, `df -h /`, `docker stats --no-stream`) pour calibrer les plafonds de conteneurs.
3. **Arbitrer la fiche A-003** (schéma doré `pg_dump` à la place du manifeste comme base de comparaison). Recommandation d'A01 : ABSORBÉE (~0,5 j). Également en attente : **A-001** (hooks PreToolUse) et **A-002** (Cloudflare R2, juridiction UE impérative).
4. **Valider ou ajuster les 29 `estimation_params`** avant la porte (11 §5) — le gardien rappelle que leur JUSTESSE lui est réservée.

Prochaine action : **la porte P-A elle-même** — démonstration à Williams, checklist signée, merge, tag `v0.1`. Aucun lot suivant ne s'ouvre avant (11 §9bis : les portes arrêtent tout).
Tests rouges connus : aucun en local. **La CI sera rouge sur `invariants` jusqu'à la création du secret — c'est le comportement voulu, pas une régression.**
Piège de machine, pour toute reprise : `pnpm verify` sature ce poste (3,3 Go libres sur 15,8 avec Docker). Lancer avec `npm_config_workspace_concurrency=1`, rien d'autre en parallèle.
