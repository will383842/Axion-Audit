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
