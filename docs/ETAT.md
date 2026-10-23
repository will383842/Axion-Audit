# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-23 — PAUSE (Williams) : L6c-3 et scoring S1 codés et relus, PR à ouvrir

main `dd778bb` (L6c-2 fusionné #146) · PR ouverte : #147 (ZAP + fil rouge + correctif du scénario 4) · branches : `fix/zap-reexamen`, `lot/l6c-3-siege`, `lot/l6c-3-terrain`, `lot/l8-branche`, `lot/l6c-3` (plan) · worktrees `_axfixs4`, `_axl6c3a`, `_axl6c3b`, `_axl8s1`.
Fait : preuve E2E des 8 scénarios §9.8 ; reconnexion corrigée ; siège (horloge PG, purge, borne de durée totale `ad6ee7e`) ; terrain (resynchronisation, absorption) ; S1 scoring (compute-scores + scores.csv). Relectures A29 (terrain) et A17 (S1) : accepte.
Prochaine action : (1) ouvrir les PR terrain, S1, puis siège EN BROUILLON : A17 doit re-relire le siège après le correctif du bloquant (borne de durée totale) ; (2) suivre la CI jusqu'au vert, fusion squash ; (3) puis S2 profil, S3 écran scores, S4 DOCX v1, S6 audit fictif (plan : DECISIONS.md `[Plan]`).
Machine : UN SEUL test lourd à la fois (verrou `C:/Users/Will/AppData/Local/Temp/verrou-e2e-l6c2`) ; le pre-push expire sous charge (vitest RPC timeout) : pousser quand rien d'autre ne tourne.
Tests rouges connus : siège `l6c3-borne-totale.integration.test.ts` (jamais exécuté vert) : le journal s'exécute après le commit, donc le test ne dépasse pas la borne ; le testeur doit poser deux attentes de 16 s DANS la transaction (verrou tenu par une autre connexion + déclencheur sur `interviews`). `l6c-sync-chunks` scénario 7 : 60 s dépassées sous charge, à relancer seul.
Attend Williams : liste oui/non DECISIONS.md `[Plan]` (docxtemplater, DOCX en Phase 1, écrêtage de l'horloge, purge par l'API) ; séance iPad P-C.
