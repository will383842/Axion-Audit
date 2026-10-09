# ETAT — un seul bloc, réécrit à chaque changement (git garde l'historique)

Historique précédent : `docs/archive/ETAT_2026-08-27_au_2026-09-10.md`.

## 2026-10-09 — L6a « la montée » : revues A17 et A29 ACCEPTÉES, PR ouverte

Branche : `lot/l6a` (worktree `_axl6-montee`) · main au départ : `d51709d`
Fait : push idempotent + propriété §9.9 (serveur, 136 tests) ; moteur terrain branché partout, déclencheurs manuel et retour réseau (apps/field 1471 tests).
Prochaine action : fusion au vert, puis L6b (descente, minuterie + backoff, remappage de l'UUID absorbé, geste « remettre en file » des ops à examiner).
Rappels : séance P-C sur iPad due par Williams ; cotation croisée humaine de la banque non faite.
Tests rouges connus : e2e `hors-ligne-l5.e2e.ts:370` intermittent sous 4 workers.
