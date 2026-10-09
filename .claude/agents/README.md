# Agents — Axion Audit (régime rapide, 2026-10-09)

13 gabarits gardés sur 40. Les 27 autres (chefs d'équipe, A01, documentation, doublons de
réviseurs et testeurs, lots non commencés) sont dans l'historique git (commit de cette PR).

Quatre rôles par lot (CLAUDE.md §4) :

| Rôle                                                                           | Gabarits                                                                                                                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Auteur                                                                         | a12 schéma · a13 API · a14 RBAC · a15 questionnaire/états · a22 écrans de session · a24 offline/chiffrement · a25 sync · a41 rapport DOCX |
| Testeur distinct (n'écrit jamais le code testé)                                | a16 intégration backend · a26 E2E hors ligne                                                                                              |
| Relecteur des zones critiques (sync, RBAC, chiffrement, étanchéité financière) | a17 backend · a29 front/sync                                                                                                              |
| Gardien des critères (à la porte seulement)                                    | a02                                                                                                                                       |

Chaque agent ne lit que les fichiers du pack de son lot (§0 de CLAUDE.md), jamais le pack entier.
