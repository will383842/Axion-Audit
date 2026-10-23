# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — L6c-1 fusionnée (#145) ; L6c-2 (preuve E2E des 8 scénarios) démarre

Branche : `lot/l6c-2` (depuis main `5ca8dda`) · dernier commit vert : `5ca8dda`
Fait : octets des pièces (chunks serveur, terrain chiffré, export v2) ; avis minio acceptés Phase 1 (à lever avant la production) ; fiches durée-cible et dossier entreprise arbitrées en Phase 2.
Prochaine action : L6c-2, les 8 scénarios §9.8 rejoués en E2E ; puis L6c-3 (resync volontaire, horloge PG, purge).
Tests rouges connus : e2e `hors-ligne-l5.e2e.ts:370` intermittent ; ZAP baseline rouge sur main.
