# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — Audit de vitesse rédigé, aucune modification de CI encore

Branche : `lot/audit-vitesse` (depuis main `ca46120`, L6b #141 fusionnée) · dernier commit vert : `ca46120`
Fait : `docs/AUDIT_VITESSE_2026-10-23.md` (mesures CI, 18 propositions classées par gain).
Prévu ensuite : L6c (octets, preuve E2E des 8 scénarios, resynchronisation volontaire, horloge PostgreSQL) ; séance P-C iPad due par Williams.
Prochaine action : Williams choisit l'étape 1 de l'audit (déclencheurs CI, filtres de chemins, images sur main seulement) ; PR dédiée avec relecture séparée.
Tests rouges connus : e2e `hors-ligne-l5.e2e.ts:370` intermittent sous 4 workers ; ZAP baseline rouge sur main.
