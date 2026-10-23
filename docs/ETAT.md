# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — L6c-1 (octets des pièces) : relectures A17/A29 acceptées, PR en cours

Branche : `lot/l6c-octets` (ex `lot/l6c`, rebasée sur main `66602ff`) · dernier commit vert : `657a22b` + correctif du garde SEC-30.4a
Fait : serveur chunks §9.6 + terrain (octets chiffrés, export v2 par segments) ; tests B4 révisés par le testeur ; revues A17 et A29 = accepte.
Prochaine action : CI verte -> fusion auto ; puis L6c-2 (preuve E2E des 8 scénarios) ; réserves 1 à 5 : voir DECISIONS.md.
Tests rouges connus : e2e `hors-ligne-l5.e2e.ts:370` intermittent ; ZAP baseline rouge sur main.
