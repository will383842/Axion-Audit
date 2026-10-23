# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — Audit de vitesse : CI (#142) et Fastify (#143) fusionnées, briefs par lot en PR

Branche : `lot/briefs` (depuis main `8fcb9a9`) · dernier commit vert : `8fcb9a9`
Fait : CI 14-18 min -> 7 min ; protection de main exige aussi `2bis · build (sources)` ; `docs/briefs/*.md` générés par `scripts/generer-briefs.mjs` (garde `check:briefs`).
Prochaine action : fusion de la PR briefs au vert ; puis L6c (octets, preuve E2E des 8 scénarios) ; enquête ZAP (A6) ; partage de l'intégration (A7) seulement si la CI redevient longue.
Tests rouges connus : e2e `hors-ligne-l5.e2e.ts:370` intermittent ; ZAP baseline rouge sur main.
