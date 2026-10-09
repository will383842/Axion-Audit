# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-09 — L6b « la descente » : revues A17 et A29 ACCEPTÉES, PR ouverte

Branche : `lot/l6b` (worktree `_axl6b`) · main au départ : `bfb3047` (L6a fusionnée, #140)
Fait : `GET /v1/sync/pull` (curseur sans perte, projections fermées, sync_log pull) ; descente, remappage, minuterie 30 s + backoff 60 s, remise en file, écran de synchronisation.
Prochaine action : fusion au vert, puis L6c (octets, preuve E2E des 8 scénarios, resynchronisation volontaire, horloge PostgreSQL côté siège).
Rappels : séance P-C sur iPad due par Williams ; cotation croisée humaine de la banque non faite ; arbitrages [L6b] « à confirmer » pour la séance.
Tests rouges connus : e2e `hors-ligne-l5.e2e.ts:370` intermittent sous 4 workers.
