# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-09 — PAUSE (Williams) dans L6c-1 « les octets » : revues A17/A29 refusées, corrections presque faites

Branche : `lot/l6c` (worktree `C:\Users\Will\Documents\_axl6c`), poussée en wip, AUCUNE PR · main au départ `ca46120` · dernier commit vert serveur `5e66869`.
Découpage, arbitrages, D4/D8 : lignes `[L6c]` de `DECISIONS.md` (L6c-1 octets → L6c-2 8 scénarios E2E → L6c-3 resync volontaire, horloge PG, purge ; k6 retiré). Client `minio` 8.0.7 ajouté (Williams).
Fait : serveur chunks §9.6 vert (31/31) ; terrain (table chiffrée `octetsPieces`, capture, chunks, moteur, export de secours v2 par segments) — 2692/2696.
Tests rouges connus (4) : `sync/moteur-pieces.test.ts` « tous les push de la mission précèdent le premier appel de pièce » (cassé par l'auteur, ordre dans `moteur.ts`) ; `ecrans/journee/finDeJournee.acceptation-b4.test.tsx` ×3 (simulent `exporterSauvegarde` → à RÉVISER PAR LE TESTEUR, pas l'auteur) ; vérifier aussi `86ce6f9` (complete systématique, `chunks.test.ts`).
Prochaine action : testeur révise B4 → auteur répare moteur-pieces et passe 86ce6f9 → re-revues A17 (serveur) et A29 (terrain) → `pnpm verify` → PR L6c-1 → fusion auto au vert.
Pièges : format v2 = tableau `pieces` à côté de `charge` (une photo chiffrée par entrée) ; `node -e` en Bash exécute les backticks → scripts dans le scratchpad ; pack scellé (ne pas toucher `docs/11_*`).
