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
