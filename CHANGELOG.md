# Changelog — Axion Audit

> Une entrée par porte franchie (`CLAUDE.md` §4 étape 7 : « merge, tag, changelog »). Le tag est
> posé sur le commit de `main` qui résulte du squash merge de la fiche de porte. Les faits, pas le
> récit : le récit est dans `docs/portes/` et `docs/journal/`. Ce fichier est créé le 2026-09-02 ;
> les deux premières portes y sont reportées après coup, depuis leurs fiches.

## v0.l2 — 2026-09-02 — Porte P-B (fin L2) · 🟡 acceptée sous réserve

Signée par Williams sur `800ce2f`, tag posé sur `fa30be1`. Fiche : `docs/portes/PORTE_B_2026-08-31.md`.

- **Authentification** : login, refresh rotatif avec détection de réutilisation, logout ; Bearer côté
  terrain, cookie côté console prévu (`@fastify/cookie` épinglé, **non encore enregistré** — dû à L7).
- **RBAC serveur** par registre de routes : une route sans politique empêche le démarrage ; propriété
  de session déclarée (05 §9.9), exercée à L6.
- **Étanchéité financière** : `scoping_financials` en routes admin seules, couverture 100 % sur les
  quatre métriques, balayage sentinelle qui assère sa propre validité.
- **CRUD utilisateurs** avec garde-fou de réinitialisation (05 §9.7 : refus si un appareil garde une
  outbox non vide), habilitation `habilitated_at`, mode expert réservé aux habilités.
- **Journal d'activité** à porte d'écriture unique, gardée en CI (invariant 7).
- **Design system** `packages/ui` : 26 composants, tokens de la charte, 447 tests.
- Livrés par-dessus L2, jugés à leurs portes : import de la banque (L4, 21 tests), quatre colonnes
  ajoutées au 04 (amendements S-1, S-3, S-4, S-6).
- Réserves ouvertes : R-B1 (assertion de refus sur toute la matrice, avant P-C), R-B2 (rejeu du
  garde-fou sur une `sync_log` réelle, P-D), R-B5 à R-B9, R-B11, R-B12 — échéances dans la fiche.

## v0.l0 — 2026-08-30 — Porte P-A (fin L0-L1) · ✅ acceptée

Signée par Williams le 2026-08-29 sous réserve, réserve levée le 2026-08-30. Fiche :
`docs/portes/PORTE_A_2026-08-27.md`.

- **Infrastructure** : monorepo pnpm, Docker Compose (PostgreSQL 16, Redis 7, MinIO, Caddy), staging
  Coolify sur Hetzner, déploiement par la CI via SSH, sauvegardes pgBackRest + miroir Cloudflare R2,
  test de restauration nocturne par son propre canal, sonde d'alertes Telegram.
- **CI** : lint, typecheck, unitaires, intégration (Testcontainers), e2e, diff schéma-vs-04,
  gitleaks, shellcheck, couverture ≥ 90 % mesurée sur les chemins critiques, gardes du dépôt
  (invariants, jonction, graphe des modules, anti-skip, traçabilité, intégrité du pack).
- **Schéma** : 44 tables, transcription littérale du fichier 04, migrations up/down, seeds
  rejouables, fil rouge FIL-TPE et FIL-GC en fixtures.
- Dette datée acceptée : contrôle nominatif des 12 familles de secrets et sauvegarde chiffrée du
  `.env` (à Williams).

## Non versionné

- 2026-09-02 : cinq mesures de vitesse (garde de prose, hook `pre-push`, trois chantiers, auto-merge
  des PR de documentation, hook `Stop`) — `DECISIONS.md` du 2026-09-02.
