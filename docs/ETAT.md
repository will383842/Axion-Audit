# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — PAUSE (Williams) : L6c-3 et scoring S1 codés et relus, PR en cours d'ouverture

main  (L6c-2 fusionné #146) · PR ouverte : #147 (ZAP + fil rouge) · branches en ligne : , , , ,  (plan) · worktrees : _axfixs4, _axl6c3a, _axl6c3b, _axl8s1
Fait : preuve E2E des 8 scénarios §9.8 ; reconnexion corrigée ; L6c-3 siège (horloge PG, purge, borne de durée totale) et terrain (resynchronisation, absorption) ; S1 scoring (compute-scores + scores.csv). Relectures A17/A29 faites ; la re-relecture A17 du siège après correctif du bloquant reste à faire.
Prochaine action : (1) ouvrir les PR terrain, S1 et siège (siège en brouillon tant que A17 n'a pas re-relu), suivre la CI jusqu'au vert, fusion squash ; (2) test d'horloge scénario 4 : correctif dans #147 ; (3) puis S2 profil, S3 écran scores, S4 DOCX v1, S6 audit fictif (plan DECISIONS ).
Machine : lancer UN SEUL test lourd à la fois (verrou C:/Users/Will/AppData/Local/Temp/verrou-e2e-l6c2) ; pre-push expire sous charge (vitest RPC timeout) : pousser quand rien d'autre ne tourne.
Tests rouges connus : aucun connu sur les branches ; main : ZAP corrigé par #147 (règle 10094 re-datée).
Attend Williams : liste oui/non DECISIONS  (docxtemplater, DOCX en Phase 1, écrêtage de l'horloge, purge par l'API) ; séance iPad P-C.
