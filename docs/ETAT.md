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
