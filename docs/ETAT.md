# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — L6c-2 fusionnée (#146) ; L6c-3 en deux PR, lot scoring S1 lancé

main `dd778bb` · PR ouverte : #147 (ZAP + fil rouge) · branches : `lot/l6c-3-siege` (horloge PG, purge), `lot/l6c-3-terrain` (resynchronisation, absorption perdue), `lot/l8-branche` (compute-scores + scores.csv)
Fait : preuve E2E des 8 scénarios §9.8 sur vraie API ; reconnexion corrigée ; plan L6c-3 et plan scores/DOCX/audit fictif (DECISIONS `[Plan]`).
Prochaine action : tests écrits avant le code (testeurs), puis auteurs, relecteurs A17/A29, PR-A puis PR-B ; ensuite S2 profil, S3 console, S4 DOCX, S6 audit fictif.
Tests rouges connus : e2e `s4-horloge` oscille une fois sur main (à stabiliser) ; ZAP : voir #147.
