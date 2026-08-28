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

---

## 2026-08-28 00h55 — [lot L1] — RECTIFICATION du bloc précédent : la CI est VERTE, aucune action de Williams

**Le bloc de 00h40 annonçait « la CI sera ROUGE sur `invariants` jusqu'à la création du secret ».
C'EST FAUX, et la rectification arrive avant que quiconque agisse dessus.**

**Vérifié :** `gh secret list` → **`AXION_CLIENTS_SURVEILLES` existe depuis le 2026-08-27T16:53:55Z**,
créé pendant la mise en public du dépôt. Ce qui manquait n'était pas le secret, **c'était le
câblage** : aucun workflow ne le lisait.

Le diagnostic du gardien A02 reste **entièrement exact** — l'invariant 2 n'a jamais été vérifié par la
CI, et deux fichiers affirmaient le contraire. Seule ma conclusion sur la CAUSE était fausse : j'ai
supposé un secret absent au lieu de le vérifier, alors qu'une commande suffisait.

**Conséquence : le job `invariants` du run `8ca27a4` est VERT, et il l'est pour une bonne raison** —
le contrôle a réellement tourné, avec la vraie liste, pour la première fois. Étape `pnpm
check:invariants` → `success` (vérifié par l'API sur le job lui-même, pas déduit du run).

**Williams n'a RIEN à créer.** Le point 1 de la liste « ce qui attend Williams » du bloc de 00h40 est
**ANNULÉ**. Les points 2 (VPS), 3 (fiches A-001, A-002, A-003) et 4 (`estimation_params`) restent
valides et inchangés.

**Ce que je retiens, et qui vaut au-delà de ce cas :** j'ai affirmé « le secret n'existe pas » alors
que je n'avais vérifié que son ABSENCE DANS `.github/`. C'est exactement le défaut que ce lot
poursuit depuis trois passes — **conclure d'un contrôle sur ce qu'il n'a pas regardé**. La vérification
coûtait une commande.

Tests rouges connus : aucun. CI verte.

---

## 2026-08-28 04h26 — [lot L1] — étape pipeline **7/7, toujours en attente de la porte** — un défaut d'outillage fermé

Dernier commit vert : 3135c56 (docs(l1): rectifier les deux textes de l'invariant 2) · Branche : lot/l0-infra · Poussé : oui
Tâche en cours : **aucune ouverture de lot.** 11 §9bis : les portes arrêtent tout, et la porte P-A appartient à Williams. Session parallèle `axion-audit-v2-12-complet-22` observée idle depuis 23h27 ; travail repris sans écriture concurrente.
Reprise conforme 11 §9ter : dernier bloc relu, `git status` propre, **suite complète rejouée — `pnpm verify` code retour 0** (95 unitaires · 7 fichiers d'intégration · 8 E2E).

**Ce que cette session a trouvé, et que personne d'autre n'avait vu.** La suite E2E est sortie une fois à **4 échecs sur 8** (front terrain, `ERR_CONNECTION_REFUSED` sur 4173) puis **verte deux fois de suite, code inchangé**. Cause : `reuseExistingServer: !enCI` dans `playwright.config.ts` autorisait EN LOCAL la réutilisation d'un serveur ambiant — le verdict de `pnpm verify`, qui est la vérité terrain de tout le pipeline, dépendait de l'état de la machine et non du code.
Corrigé en étage 1 (`reuseExistingServer: false` partout) et **prouvé par injection dans les deux sens** avec un serveur parasite sur 4173 : réglage neuf → `Error: … is already used`, code 1 avant tout test ; ancien réglage → parasite réutilisé en silence, 3 échecs **et 1 SUCCÈS**. Le test « ne contacte AUCUN domaine extérieur » a affirmé une propriété du produit **en regardant une page qui n'était pas le produit**. Le faux positif est reproduit, pas supposé.
Registre : fiche du 2026-08-28 dans `AMELIORATIONS.md`, plafond étage 1 du lot L1 porté à **~0,3 j / 0,5 j**.

**RÉSERVE DE GOUVERNANCE, à porter à la porte.** Ce correctif est POSTÉRIEUR au contrôle d'acceptation du gardien A02 (bloc de 00h40). L'artefact accepté a bougé d'une ligne après son acceptation. Le produit livré est inchangé — la CI posait déjà `reuseExistingServer: false` via `!enCI`, seule la vérification locale était affectée — et aucun critère du fichier 07 n'est touché. La mention est faite pour que **le gardien décide** s'il recoche : ce n'est pas à l'agent qui corrige d'en juger.

Prochaine action : **la porte P-A, par Williams** — rien d'autre ne s'ouvre. En attente de lui, par ordre de blocage : (1) le VPS, seul moyen de cocher la DoD « migrations up/down sur staging » ; (2) l'arbitrage des fiches A-001, A-002 et A-003 ; (3) la validation des 29 `estimation_params`, dont la JUSTESSE lui est réservée (11 §5).
Tests rouges connus : aucun. `pnpm verify` code 0, code retour vérifié sans masquage.
Piège de machine, inchangé : ce poste sature (3,3 Go libres sur 15,8 avec Docker). En cas de `0xC0000142`, relancer avec `npm_config_workspace_concurrency=1`, rien d'autre en parallèle.

---

## 2026-08-28 06h20 — [lot L0-b] — déploiement du staging EN COURS sur `axionia-web`

Dernier commit vert : a29ec03 (fix(l0b): cible de volume figée — Coolify refuse toute interpolation dans un volume) · Branche : lot/l0-infra · Poussé : **oui**

### Le déblocage — ce qui a changé depuis le bloc précédent

Le lot L0-b était bloqué faute d'accès serveur. **Il ne l'est plus.** L'accès a été obtenu, et le chemin trouvé n'était pas celui qu'on cherchait : `axionia-web` fait tourner **Coolify v4**, et c'est par son API que le voisin `axion-ia.com` est déployé — jamais par SSH. Williams disait vrai en affirmant « d'habitude tu te connectes tout seul » : ses autres projets tournent **en local sur son poste**, aucun n'a jamais eu de serveur distant. **Axion Audit est le premier.**

Chaîne effectivement en place : jeton d'API Coolify créé (`read`+`write`+`deploy`, expiration 1 an, `root` et `read:sensitive` écartés) · clé SSH posée dans `authorized_keys` par le terminal web de Coolify · secrets GitHub `COOLIFY_API_TOKEN` et `COOLIFY_URL`.

### Ce qui a été livré, par trois agents en parallèle sur des périmètres disjoints

- **A11** — `infra/docker-compose.coolify.yml` : 9 services, **zéro port publié**, 17 variables obligatoires en `${VAR:?}` qui arrêtent le déploiement **en nommant** ce qui manque, plafonds à 4 096 Mio dont 3,4 Go en régime permanent.
- **A52** — `.github/workflows/deploy-staging.yml` réécrit pour l'API Coolify : il **attend l'issue et échoue si le déploiement échoue**, au lieu de déclencher et rendre la main. Sans `deployment_uuid`, le job échoue au lieu de continuer.
- **A54** — audit de sécurité en **lecture seule**, verdict `RISQUE SOUS CONDITIONS`, avec trois mesures que personne n'avait faites (voir ci-dessous).

### Les trois mesures d'A54, qui ont changé la conception

1. **L'OOM killer désignerait AUJOURD'HUI `axion-ia.com` comme première victime** — `oom_score` 681, le plus élevé de la machine, `dockerd` étant protégé à −500. Le site de production est déjà premier sur la liste, sans nous. C'est l'argument décisif des plafonds.
2. **Le swap DOUBLAIT silencieusement chaque plafond** : Docker applique `--memory-swap = 2 × --memory`, et en cgroup v2 `memory.swap.max` **s'ajoute** à `memory.max`. Nos 4 Go annoncés en valaient 8. Corrigé par `memswap_limit` sur les 9 services — `memory.swap.max = 0`, le plafond annoncé est le plafond appliqué.
3. **La chaîne de sauvegarde du voisin lit ses secrets DEPUIS son conteneur applicatif** — celui qui tomberait. Un incident mémoire ne couperait pas seulement le site, il interromprait aussi ses sauvegardes.

Aucune collision : ni conteneur, ni volume, ni réseau, ni port, ni sous-domaine. Vérifié objet par objet.

### Nouveau garde-fou

`scripts/check-isolation-reseau.mjs` — A54 a mesuré que le réseau du proxy Traefik a **l'ICC activé** : tout conteneur qui le rejoint obtient une route L3 vers la base PostgreSQL et le Redis du voisin. A11 n'y a attaché **que le Caddy**, et a lui-même signalé que cette exigence n'était tenue que par un commentaire. Le contrôle la rend mécanique. **Prouvé par injection dans les deux formes** (`edge: {}` sous `api`, `[axion, edge]` sur `worker`). Câblé dans `verify` et dans la CI.

### Avertissement posé au point d'exécution

`infra/README.md` §3.3 présentait `provision-vps.sh` comme l'étape obligatoire. Un opérateur suivant ce fichier ferait passer SSH du port 22 au 2222 **sur le serveur qui héberge `axion-ia.com`**, activerait un pare-feu inactif et réinstallerait Docker. L'interdiction n'existait que dans un fichier séparé que rien n'obligeait à ouvrir ; elle est désormais **devant la commande**.

### Le premier déploiement a ÉCHOUÉ, et pourquoi

Cause lue dans la base de Coolify, pas devinée : `Invalid volume target: contains forbidden character '${'` (`parsers.php:347`). **Coolify refuse toute interpolation dans une définition de volume** — garde-fou anti-injection, appliqué AVANT le clone, d'où un dossier applicatif vide et un échec muet côté serveur. Une seule ligne en cause, corrigée par `a29ec03`.

Prochaine action : **suivre le 2ᵉ déploiement** (`ylnic2kl7ou5e00cgchrjq4m`), puis exécuter **migrations up/down sur staging** — la dernière ligne de DoD qui manque à la porte P-A — et vérifier par la photographie de référence d'A54 que `axion-ia.com` n'a pas bougé.
Tests rouges connus : aucun en local.
Domaine : le premier déploiement vise l'adresse automatique de Coolify (`*.sslip.io`), **pas** `audit-staging.axion-ia.com` — la zone DNS est chez Cloudflare, partagée avec la production, et A01 n'y a pas accès. Le vrai sous-domaine se posera par un simple enregistrement.

---

## 2026-08-28 07h25 — [lot L0-b] — **STAGING DÉPLOYÉ ET FONCTIONNEL** — la dernière ligne de DoD est prouvée

Dernier commit vert : f42c5b3 (fix(l0b): l'image de l'API déclarait des migrations qu'elle ne contenait pas) · Branche : lot/l0-infra · Poussé : **oui**

### La preuve que la porte P-A attendait

Exécutée sur `axionia-web`, dans le conteneur d'API du staging :

| Critère | Preuve |
| --- | --- |
| Pile complète | 9 services, **tous sains** — postgres, redis, minio, api, worker, caddy + 3 jobs sortis en 0 |
| API **prête** (pas seulement vivante) | `GET /v1/health/ready` → **200 `{"status":"ready"}`** |
| Routage interne | `GET /api/v1/health` **à travers Caddy** → `{"status":"ok"}` |
| **Migrations up/down SUR STAGING** | montée 12 → **44 tables** · `--down-to 0` → 12 annulées, **1 table restante** (le journal) · remontée 12 → **44 tables** |
| Seed rejouable à l'identique | empreinte de contenu **`e6fe311a275472187e2d5115577543c2`** sur deux passages consécutifs |
| Migrations en attente | **0** |
| Voisin intact | `axion-ia.com` → 301 en 0,27 s · `docuseal` → 200 · tous conteneurs sains · **9 Go libres sur 15** |

### Dix déploiements, et ce qu'ils ont révélé

**Six causes distinctes, aucune inventée.** Quatre sont des règles de la plateforme qu'aucune
documentation ne donnait ; **trois sont des défauts DORMANTS de notre dépôt depuis le lot L0**, et ce
sont les plus graves :

1. **Interpolation dans un volume** — Coolify refuse tout `${` (garde-fou anti-injection), et rejette AVANT le clone : l'échec est muet côté serveur. → gardé par `check:compose-coolify`.
2. **Chemins relatifs depuis la racine** — Coolify fixe `--project-directory` sur la racine, l'inverse de nos trois autres piles. → gardé.
3. **`NODE_ENV=production` à la construction** — pnpm saute toutes les `devDependencies`. D'abord vu comme « husky manquant », c'était en réalité **l'outillage de compilation entier** : `tsc` est aussi une devDependency. Corrigé par `--prod=false` : on déclare ce dont l'étage a besoin plutôt que de dépendre d'une variable. **Défaut dormant depuis L0** — la CI ne posait pas cette variable.
4. **Aucun fichier du dépôt n'est monté** — Coolify réécrit toute source relative vers son répertoire persistant, où Docker **crée un répertoire vide**. PostgreSQL recevait un dossier au lieu de sa configuration. → configuration embarquée dans les images, et gardé par `check:compose-coolify`.
5. **LE WORKER N'AVAIT JAMAIS DÉMARRÉ** — `Queue name cannot contain ':'` : BullMQ 5 interdit les deux-points, dont il se sert comme séparateur de clés. Et **sa sonde le disait sain** : `pgrep -f node` voyait le compilateur `tsc --watch` du lanceur de développement. `docker ps` annonçait « Up 13 hours (healthy) » sur un worker mort, **et le critère L0 « docker compose up = stack complète » a été coché là-dessus**. → noms corrigés par `prefix: 'axion'`, sonde honnête (battement Redis + attachement aux 5 files, avec identité de conteneur).
6. **L'image de l'API déclarait des migrations qu'elle ne contenait pas** — son `package.json` annonce `db:migrate` → `node scripts/migrations.mjs`, et l'image ne contenait ni `scripts/` ni `drizzle/`. Or `deploy.sh` appelle exactement cette commande à son étape 2/5 : **l'étape de migration du déploiement n'aurait jamais pu fonctionner, ni en staging ni en production.** → migrations, seed et manifeste embarqués.

**Un onzième obstacle, non logiciel :** le volume PostgreSQL avait été initialisé pendant un déploiement raté, sans les bonnes variables — pas de base `axion_audit`, pas de rôle, `pg_hba.conf` sans règle réseau. Et PostgreSQL **saute l'initialisation quand le répertoire existe** : le volume corrompu empoisonnait tous les démarrages suivants. Supprimé (le seul du staging ; volume du voisin vérifié intact avant et après).

### Ce que cette séquence établit, et qui vaut pour la porte

**Le lot L1 avait 169 tests verts, trois passes de revue croisée et 53 mutations injectées — et n'a rien vu de tout cela.** Ce n'est pas un défaut de sa suite : le worker n'était dans son périmètre à aucun titre, et aucun test d'intégration ne pouvait révéler qu'une image ne contient pas ce que son `package.json` promet. **C'est la démonstration la plus nette de ce que sert un déploiement réel**, et pourquoi la DoD exige « sur staging » et non « en local ».

**RÉSERVE À PORTER À LA PORTE, et elle appartient à Williams :** le critère du lot L0 « `docker compose up` = stack complète » **a été coché à tort** — le worker était mort. Se recoche-t-il maintenant qu'il fonctionne, ou le lot L0 porte-t-il une réserve datée ? A01 ne tranche pas cela seul.

Prochaine action : compléter `docs/portes/PORTE_A_*.md` avec ces preuves, recevoir les tests d'A16 sur le worker et sa sonde, puis rendre le lot.
Tests rouges connus : aucun. CI verte sur les trois derniers commits.
Reste non fait : le sous-domaine `audit-staging.axion-ia.com` (zone Cloudflare, partagée avec la production — A01 n'y a pas accès). Le staging vit sur l'adresse automatique de Coolify, ce qui n'empêche aucune vérification.

**RECTIFICATION (2026-08-28, après revue croisée et recette).** Ce bloc affirmait : « Le staging vit sur l'adresse automatique de Coolify, ce qui n'empêche aucune vérification. » **C'ÉTAIT FAUX.** Mesuré depuis l'extérieur : `/`, `/hq/`, `/api/v1/health` et `/api/v1/health/ready` rendent **quatre 404** — la page par défaut de Traefik. Notre Caddy ne portait **aucun label `traefik.*`** : en pile `dockercompose`, Coolify ne les génère qu'à partir de `docker_compose_domains`, **service par service** ; le domaine posé au niveau de l'APPLICATION ne publie rien. Ce n'était donc pas le nom qui manquait, c'était la publication. Toutes les preuves de ce bloc ont été prises **en `docker exec`, à l'intérieur de la pile** : elles restent vraies sur ce qu'elles mesurent, et ne disaient rien de l'accès externe. Le domaine a été publié sur le service `caddy` ; la vérification depuis l'extérieur reste **à refaire** avant toute signature.
