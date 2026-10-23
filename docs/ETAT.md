# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — CI plus rapide : PR lot/ci-vitesse en cours

Branche : `lot/ci-vitesse` (depuis main `ca46120`) · dernier commit vert : `ca46120`
Fait : CI sans double run (push lot/** retiré), jobs en parallèle, images PR en parallèle ; `verify:rapide` parallèle (scripts/verify-rapide.mjs) ; autorisations du projet ; audit `docs/AUDIT_VITESSE_2026-10-23.md`.
Prochaine action : lire le run CI de la PR et remesurer la durée ; puis briefs par lot (C12), enquête ZAP (A6), partage de l'intégration (A7).
Tests rouges connus : e2e `hors-ligne-l5.e2e.ts:370` intermittent ; ZAP baseline rouge sur main.
