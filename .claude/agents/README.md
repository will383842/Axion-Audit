# Gabarits de rôles — Axion Audit (`.claude/agents/`)

Les **40 gabarits de rôles** du fichier `docs/09_PLAN_EXECUTION_AUTOPILOTE.md` §1, matérialisés en définitions de sous-agents Claude Code — un fichier par gabarit.

> **Ce sont des GABARITS, pas 40 instances simultanées** (09 §1, clarification V2.2 sur le budget de contexte).
> Par lot, l'orchestrateur active **au maximum ~12 rôles** : l'équipe du lot + les transverses concernés.
> **Chaque sous-agent reçoit UNIQUEMENT les fichiers du pack listés par l'ordre de lecture de son lot — jamais le pack entier (09 §5.8).**
> La valeur du dispositif est dans les **portes** et les tests `@critique`, pas dans le nombre de rôles.

---

## Chaîne hiérarchique (09 §1, V2.11 — une seule ligne, aucune diagonale)

```
agent de lot → chef d'équipe (A10 / A20 / A30 / A40 / A50) → A01 directeur technique → Williams
```

Un désaccord **remonte la chaîne**, jamais en diagonale. Toute signature est une ligne dans le fichier de porte ou dans `DECISIONS.md`.

| Étape du pipeline            | Signataire                           |
| ---------------------------- | ------------------------------------ |
| Auto-revue (3)               | l'agent qui a codé                   |
| Revue croisée (4)            | le réviseur croisé (A17 / A29 / A37) |
| Fin d'incrément (11 §6)      | le chef d'équipe                     |
| Conformité + traçabilité (6) | le gardien **A02**                   |
| Passage en porte             | **A01**                              |
| **La porte**                 | **Williams**                         |

---

## Les 40 gabarits

| Code    | Slug                             | Équipe                            | Lots                                       | Modèle   | Ne code pas                                                                                |
| ------- | -------------------------------- | --------------------------------- | ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------ |
| **A01** | `a01-directeur-technique`        | Direction                         | tous + toutes les portes                   | opus     | **oui** (écrit `DECISIONS.md`, `docs/ETAT.md`, portes, journal)                            |
| **A02** | `a02-gardien-spec`               | Direction                         | tous (étapes 1, 1bis, 6)                   | opus     | **oui** (écrit la matrice de traçabilité et son rapport de conformité) — **DROIT DE VETO** |
| **A10** | `a10-chef-equipe-backend`        | 1 — Socle, données, API           | L0, L1, L2, L3, L4                         | inherit  | non                                                                                        |
| **A11** | `a11-infra-docker`               | 1                                 | L0 (+ support continu)                     | inherit  | non                                                                                        |
| **A12** | `a12-dba-schema`                 | 1                                 | L1 (+ toute évolution base)                | inherit  | non                                                                                        |
| **A13** | `a13-api-fastify-core`           | 1                                 | L2, L3, L4 (+ toutes routes)               | inherit  | non                                                                                        |
| **A14** | `a14-auth-rbac`                  | 1                                 | L2, L6, L7-L8                              | **opus** | non                                                                                        |
| **A15** | `a15-moteur-questionnaire-etats` | 1                                 | L3 (+ L4, L5, L7-L8)                       | **opus** | non                                                                                        |
| **A16** | `a16-testeur-integration`        | 1                                 | L1, L2, L3, L4, L6, L10-L13                | inherit  | **oui (tests seulement)**                                                                  |
| **A17** | `a17-reviseur-backend`           | 1                                 | L0 à L4                                    | **opus** | **oui — ne produit rien**                                                                  |
| **A20** | `a20-chef-equipe-front`          | 2 — Terrain PWA & sync            | L5, L6                                     | inherit  | non                                                                                        |
| **A21** | `a21-composants-ui`              | 2                                 | S1 (`packages/ui`), L5, L7-L8              | inherit  | non                                                                                        |
| **A22** | `a22-ecrans-session`             | 2                                 | L5b, L5c                                   | inherit  | non                                                                                        |
| **A23** | `a23-pilote-mission`             | 2                                 | L5b, L5c                                   | inherit  | non                                                                                        |
| **A24** | `a24-offline-dexie`              | 2                                 | L5a, L5c (+ support L6)                    | **opus** | non                                                                                        |
| **A25** | `a25-moteur-sync`                | 2                                 | **L6a, L6b, L6c (lot exclusif)**           | **opus** | non                                                                                        |
| **A26** | `a26-testeur-e2e-offline`        | 2                                 | L5, L6 (+ `@filrouge` dès L1)              | inherit  | **oui (tests seulement)**                                                                  |
| **A27** | `a27-testeur-multi-appareils`    | 2                                 | L5 (P-C, P-E, P-F)                         | inherit  | **oui (tests + checklists)**                                                               |
| **A28** | `a28-accessibilite-perf`         | 2                                 | L5, L7-L8 (+ Phase 2)                      | inherit  | **oui (harnais de mesure seulement)**                                                      |
| **A29** | `a29-reviseur-front`             | 2                                 | L5, L6                                     | **opus** | **oui — ne produit rien**                                                                  |
| **A30** | `a30-chef-equipe-console`        | 3 — Console & pilotage            | L7, L8, espaces Phase 2                    | inherit  | non                                                                                        |
| **A31** | `a31-tour-controle-alertes`      | 3                                 | L7-min, L8                                 | inherit  | non                                                                                        |
| **A32** | `a32-pilotage-mission`           | 3                                 | L7-min, L8                                 | inherit  | non                                                                                        |
| **A33** | `a33-chiffrage-devis`            | 3                                 | L7-min, L8 (+ P-B)                         | inherit  | non                                                                                        |
| **A34** | `a34-banque-questions`           | 3                                 | L4 (+ back-office console)                 | inherit  | non                                                                                        |
| **A35** | `a35-dataviz`                    | 3                                 | L8 (support L7-min)                        | inherit  | non                                                                                        |
| **A36** | `a36-testeur-console`            | 3                                 | L7, L8, Phase 2                            | inherit  | **oui (tests seulement)**                                                                  |
| **A37** | `a37-reviseur-console`           | 3                                 | L7, L8, part console du L4                 | **opus** | **oui — ne produit rien**                                                                  |
| **A40** | `a40-chef-equipe-rapports`       | 4 — Rapports, IA & intégrations   | L10 à L13                                  | inherit  | non                                                                                        |
| **A41** | `a41-generation-docx`            | 4                                 | L10-L11                                    | inherit  | non                                                                                        |
| **A42** | `a42-pipeline-llm`               | 4                                 | L10-L11                                    | **opus** | non                                                                                        |
| **A43** | `a43-webhooks-console`           | 4                                 | L12-L13                                    | inherit  | non                                                                                        |
| **A44** | `a44-workers-bullmq`             | 4                                 | L10 à L13 (+ P-A sauvegardes)              | inherit  | non                                                                                        |
| **A45** | `a45-testeur-integrations`       | 4                                 | L10 à L13                                  | inherit  | **oui (tests seulement)**                                                                  |
| **A50** | `a50-chef-qualite`               | 5 — Qualité transverse & sécurité | **tous, en continu**                       | inherit  | non (outillage qualité)                                                                    |
| **A51** | `a51-securite-offensive`         | 5                                 | tous, intensité L2/P-B, L6, L7-L8, L10-L13 | **opus** | **oui (tests et scripts d'attaque seulement)**                                             |
| **A52** | `a52-ci-cd`                      | 5                                 | L0 puis en continu                         | inherit  | non (chaîne CI)                                                                            |
| **A53** | `a53-observabilite`              | 5                                 | L0 puis en continu (P-A)                   | inherit  | non (exploitation)                                                                         |
| **A54** | `a54-recette-ux-novice`          | 5                                 | fin de chaque lot terrain (P-C, P-E, P-F)  | inherit  | **oui — aucun code, ni prod ni test**                                                      |
| **A55** | `a55-documentation-runbook`      | 5                                 | tous, en continu + chaque porte            | inherit  | **oui (documentation seulement, pas de `Bash`)**                                           |

**Total : 2 + 8 + 10 + 8 + 6 + 6 = 40 gabarits de rôles (≤ ~12 actifs par lot).**

---

## Le croisement producteur / vérificateur est STRUCTUREL (09 §5.6)

> « Le code de test n'est **jamais** écrit par l'agent qui a écrit le code testé. »

- **Testeurs** (A16, A26, A27, A36, A45) et **A51** : leurs `tools` autorisent l'écriture **uniquement** dans les répertoires de tests, de fixtures et de checklists. **Aucun droit d'écriture sur le code de production.** Un test rouge est un rapport rendu au producteur via son chef d'équipe, jamais un correctif de leur main.
- **Réviseurs croisés** (A17, A29, A37) : **aucun `Edit`, aucun `Write`**. « Relit TOUT le code de l'équipe, **ne produit rien** » (09 §1). Un réviseur qui corrige devient producteur, et la revue croisée disparaît.
- **A54** (recette novice) : ne produit **aucun** code, ni de production ni de test — elle joue un utilisateur.
- **A01 et A02 « NE CODENT PAS »** (09 §1) : leurs écritures sont bornées aux fichiers de gouvernance (décisions, état, portes, traçabilité, rapport de conformité).

## A02 a un DROIT DE VETO

Sur **tout écart non documenté à la spec**. Le veto s'écrit (section du pack violée + preuve + exigence E1-E47), **bloque l'étape 6** — donc tout passage en porte et tout merge — et remonte à **A01**. Il se lève par la correction du code, ou par une décision écrite et signée (A01, ou Williams si c'est un choix produit). Détail dans `a02-gardien-spec.md` §5.

---

## Conventions communes à tous les gabarits

Chaque fichier contient, dans cet ordre : **1.** Rôle (ligne exacte du 09 §1, développée) · **2.** Lots où l'agent intervient · **3.** Ordre de lecture imposé, avec le rappel obligatoire « **Tu ne charges QUE ces sections. Interdiction de charger le pack entier (09 §5.8).** » · **4.** Invariants et interdictions propres à ce rôle (sélectionnés, pas les 8 recopiés partout) · **5.** Place dans le pipeline 7 étapes et ce que l'agent signe · **6.** Ce qu'il ne décide jamais seul (11 §8) et « **un doute de spec va dans `DECISIONS.md`, jamais une devinette** » · **7.** Definition of Done de ses livrables · **8.** Format exact du rapport rendu à l'orchestrateur. Un pied de page cite les sections du pack appliquées (**traçabilité E36 / E43**).

**Modèles** : `opus` est réservé aux 11 rôles à fort enjeu de raisonnement — direction (A01, A02), sécurité et étanchéité (A14, A51), cœur critique offline/sync (A24, A25), machine à états (A15), pseudonymisation LLM (A42) et les trois **réviseurs croisés** (A17, A29, A37). `inherit` partout ailleurs.

**Note sur `tools`** : le nom de l'outil de délégation (`Agent` dans le frontmatter d'A01) peut être `Task` selon la version de Claude Code — à vérifier au premier lancement de l'orchestrateur.

---

**Ordre de lecture PAR LOT** (rappel du `docs/00_INDEX.md`) — **`docs/11_CONTRAT_TECHNIQUE.md` EN PREMIER pour tous les lots**, puis :
L0 : 02 → 06 (§10.3) → 07 · L1 : **04 en entier** → 03 (§32.1-32.2) → 01 (§2) · L2 : 06 → 04 → 05 (§8.1, §9.7, §9.9) → 03 (§34.1, §34.4) · L3 : 01 → 03 (M1-M2, §16, §18.1, §32.2, §32.4, §35.2) → 04 → 05 · L4 : 03 (M1.1, §32.1, §32.4, §36.4) → 04 (§7.3) · L5 : 03 (M3, §17, §19, §22.1, §25, §27, §32.5, §33, §34.2) → 01 (§20.4) → 05 (§9 + §31) → 06 (§10) · L6 : 05 (§9 intégral + 8 scénarios §9.8 + §9.9) → 04 · L7-L8 : 03 (§18, §22.3, M5, §27.1, §32.1, §33.4, §36.3) → 04 · L10-L11 : 03 (M6, §26.2, §36.6) → 01 (§20.3) → 04 → 06 (pseudonymisation 2 passes).
**Le brief d'un lot vient EXCLUSIVEMENT de la table du fichier 07** (contenu + critères d'acceptation).
