# MATRICE DE TRAÇABILITÉ E1-E47 — SUIVI D'EXÉCUTION

> **Livrable du gardien de la spécification (A02)** — étape 6 du pipeline (09 §3), exigence V2.11
> « traçabilité dans les DEUX sens ».
> **Ce fichier n'est PAS le fichier 08.** Le `docs/08_TRACABILITE.md` est la matrice de CONCEPTION
> (exigence → sections du pack), scellée et immuable. Le présent fichier est la matrice
> d'EXÉCUTION (exigence → code livré, et code livré → exigence). Il vit, il est complété à chaque
> lot, il n'est jamais réécrit.
>
> **Règle de précédence :** §32-36 > §24-31 > §16-22 > §1-15, puis le fichier 11.
> **Règle fondatrice de ce fichier (09 §3.6) :** _« toute route, table, écran ou job livré se
> rattache à une exigence E1-E47 OU à une fiche AMELIORATIONS.md — le code orphelin est REFUSÉ. »_

## Mode d'emploi (à lire avant de compléter au lot suivant)

1. Ce fichier est **append-and-amend** : la section A est mise à jour en place (l'état d'une
   exigence évolue), les sections B et C **s'allongent** d'un bloc par lot et ne sont jamais purgées.
2. **Vocabulaire d'état de la section A**, volontairement restreint à trois valeurs :
   - `couverte` — l'exigence est intégralement satisfaite par du code livré ET prouvé par une
     exécution. Une exigence n'est jamais `couverte` sur déclaration.
   - `partiellement amorcée` — du code livré s'y rattache, mais le cœur de l'exigence reste à venir.
     La colonne « reste à faire » dit quoi et à quel lot.
   - `non commencée — lot Lx` — aucun code. C'est l'état NORMAL de la majorité des exigences
     pendant toute la Phase 1.
3. **La colonne « preuve/emplacement » n'accepte pas une intention.** Un chemin de fichier, une
   commande exécutée avec sa sortie, un numéro de test. Un fichier qui existe prouve qu'il existe ;
   il ne prouve pas qu'il fonctionne.
4. **Section B (code → exigences)** : au brief de chaque lot, tout nouvel artefact livré y entre.
   Un artefact sans rattachement est un **refus de lot**, pas une ligne à compléter plus tard.
5. Un désaccord sur un rattachement se tranche dans `DECISIONS.md`, jamais ici.

---

# A. SENS 1 — EXIGENCES → CODE

**Date d'établissement : 2026-08-27** · **Lots évalués : L0 (incrément L0-a), L1 (schéma), puis
L0-b (opérations, 2026-08-28)** · **Gardien : A02**

| Passe | Lot | Commit | Arbre | Verdict |
| --- | --- | --- | --- | --- |
| **1ʳᵉ** | L0 | `ce5b912` | **en cours de modification** (2 fichiers à l'ouverture, 9 à la clôture) ; pipeline à l'**étape 3/7**, revue croisée non rendue | **VETO** — 4 écarts (V1-V4) |
| **2ᵉ** | L0 | **`fdd5f59`** | **propre** (`git status` vide) ; revue croisée rendue **deux fois** (NON CONFORME → CONFORME AVEC RÉSERVES, réserves fermées) | voir §D |
| **1ʳᵉ** | **L1** | **`bf7f6ca`** | **figé côté code** (`git status` : seul `docs/ETAT.md` modifié) ; revue croisée rendue **trois fois** (CONFORME AVEC RÉSERVES, réserves fermées, le réviseur ne recommande pas de 4ᵉ passe) — **étape 4 close, l'étape 6 se tient enfin dans l'ordre** | **ACCEPTÉ SOUS RÉSERVE** — voir §F |
| **1ʳᵉ** | **L0-b** | **`462ba70`** | **propre** (`git status` vide) ; contrôle mené **sur le dépôt ET sur la machine** `axionia-web`, projet `wrunr6mwq2oxqq392i4myzjn`. ⚠️ Deux README ont été réécrits **pendant la passe** par un agent parallèle (§G.6-4) | **REFUSÉ** — voir **§G** |
| **2ᵉ** | **L0 + L1 + L0-b — REJEU INTÉGRAL DE LA PORTE (09 §4bis)** | **`1c56759`** | **propre** (`git status` vide) et **poussé** (`origin/lot/l0-infra` au même SHA) ; **aucun agent en parallèle** ; 37 commits depuis la passe précédente ; contrôle mené sur le dépôt, sur une base PostgreSQL 16 **créée par le gardien**, et sur `axionia-web` **en lecture seule stricte** | **🟡 ACCEPTÉ SOUS RÉSERVE** — voir **§H** et `docs/portes/PORTE_A_2026-08-27.md` **§9-10** |
| **1ʳᵉ** | **L2 · L3a · L4 · L0-c/d/e** | **`6b9cc7c`** (`main`) | **propre à l'ouverture** (`git status` vide sur `main`), **et NON à la clôture** : un autre lot (T3, `lot/l2e-t3-users`) a ouvert une branche et écrit dans le **même répertoire de travail** pendant la passe — §B.11.7 bis-2. Le contrôle porte sur le **commit** `6b9cc7c`, jamais sur l'arbre. 61 commits depuis la passe précédente ; aucune mesure sur `axionia-web` | **🟡 ACCEPTÉ SOUS RÉSERVE** — voir **§A.quinquies**, **§B.11** et **§I** |

> **Ce que la 1ʳᵉ passe a appris, et qui vaut règle.** Un contrôle d'acceptation ne se tient pas sur
> un arbre qui bouge, ni avant la revue croisée. Les deux conditions sont réunies pour la 2ᵉ passe.
> **Et une annotation `// Traçabilité : E__` n'est une preuve que si quelqu'un ouvre la section
> citée** — c'est ce qui a fait tomber `axion:sauvegardes` (§B.3), et c'est la méthode réappliquée
> à chaque artefact nouveau en §B.8.

**L0 est un lot d'infrastructure : il ne porte aucune exigence fonctionnelle.** La quasi-totalité
des 47 exigences est donc légitimement `non commencée`. Ce qui se vérifie ici est l'inverse :
qu'**aucune exigence dont L0 avait la charge n'a été oubliée**.

> **AMENDEMENT DU 2026-08-27 (soir) — lot L1, 3ᵉ passe du gardien.** Le tableau ci-dessous est
> **mis à jour en place** conformément au mode d'emploi (§2) : la colonne d'état porte désormais
> l'état **après L1**. L'état après L0 reste lisible en §A.bis (synthèse chiffrée du 2026-08-27,
> non modifiée) et au journal des passes.
>
> **Une table n'est pas une fonction.** Le lot L1 livre 43 tables : c'est un **socle de données**,
> pas un comportement. Le vocabulaire d'état reste celui du §2, à trois valeurs. Une exigence dont
> L1 n'a livré que la table passe donc à `partiellement amorcée` — parce que du code livré s'y
> rattache réellement — et la colonne « reste à faire » porte tout le poids de l'honnêteté : elle
> dit **le cœur**, qui est ailleurs. Le lecteur qui confondrait « table créée » et « exigence
> couverte » se tromperait de 90 % du travail, et le §A.ter chiffre exactement cette distinction.

> **AMENDEMENT DU 2026-08-31 — lots L2, L3a, L4 et incréments L0-c/L0-d/L0-e.** Le tableau ci-dessous
> porte l'état **après L0-b** (2026-08-28, commit `1c56759`). Il n'est pas réécrit — le mode d'emploi
> §1 l'interdit — mais il est **AMENDÉ par le §A.quinquies**, qui fait foi pour les 17 exigences qu'il
> nomme. Deux lignes seulement changent d'**état** et sont donc reprises **en place** ci-dessous :
> **E21** (→ `couverte`) et **E45** (dont la colonne « reste à faire » promettait L2 et que L2 n'a
> pas tenue). Pour toutes les autres, la ligne du tableau reste vraie et devient **incomplète** : le
> §A.quinquies dit ce que L2/L3a/L4 y ajoutent.
>
> **Pourquoi cette forme plutôt qu'une réécriture.** Une matrice qui se réécrit perd la seule chose
> qu'elle sait faire : montrer qu'une exigence a reculé. C'est le mécanisme déjà employé au §H.0.

| #   | Exigence (abrégé)                          | État après **L1**         | Preuve / emplacement                                                                                            | Reste à faire → lot           |
| --- | ------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| E1  | Méthodologie 8+1 blocs                     | **partiellement amorcée** | **Seed exécuté par moi** (`node apps/api/scripts/seed.mjs`) : `blocks=9` (`bloc_1`…`bloc_9`, le 9ᵉ portant l'AI Act) · `services=11` (les 11 fonctions de la taxonomie). DDL : `apps/api/drizzle/0003_questionnaire.sql` (`blocks`), `0001_referentiels.sql` (`services`). Gardé par `apps/api/tests/l1-seed.integration.test.ts` (13 tests verts) | Ciblage par bloc → L3 (M2) · import banque → L4 · restitution par bloc → L10 |
| E2  | Toutes tailles, 4 paliers                  | **partiellement amorcée** | **Seed exécuté par moi** : `size_tiers=4` avec leurs bornes — `micro[1-10]`, `pme[11-249]`, `eti[250-4999]`, `grand_compte[5000-∞]`. Bornes arbitrées en `DECISIONS.md` (« Bornes des paliers : le contrat technique fait foi »). DDL `0001_referentiels.sql` | Sélection du palier et pondération du questionnaire → L3 |
| E3  | Tous secteurs, paquets sectoriels          | **partiellement amorcée** | **Seed exécuté par moi** : `sectors=8` · `naf_sector_map=88` (pré-remplissage R4). DDL `0001_referentiels.sql` (`sectors`, `naf_sector_map` PK `naf_code`) | Paquets sectoriels progressifs → L3/L4 (§21.2) |
| E4  | Arbre organisationnel profondeur libre     | partiellement amorcée     | Socle de données seul : `apps/api/drizzle/0002_clients_missions_organisation.sql` (`org_units`, `parent_id` auto-référente, `idx_org_units_parent_id`). **Profondeur réellement exercée** : la fixture FIL-GC construit 150 unités sur **4 niveaux vérifiés par requête récursive** (`apps/api/tests/l1-filrouge.integration.test.ts`, test 3, vert) | Moteur d'arbre + **import CSV** → L3 · format CSV → E46 |
| E5  | Scoring par unité, heatmap                 | partiellement amorcée     | Socle de données seul : `0005_inventaires_analyse.sql` (`unit_scores`, `block_scores`) | Calcul → L8 · heatmap → Phase 2 |
| E6  | Hors ligne total, PC ET tablette           | partiellement amorcée     | L0 : `apps/field/vite.config.ts`, `apps/field/Dockerfile`. **L1 : le socle des entités créables hors ligne** — `interviews`, `answers`, `attachments`, `org_units`, `mission_questions` portent un `id` UUID **sans DEFAULT SQL** (P1-4). Contrôlé par moi en base : **aucune fonction SQL dans `public`**, `gen_random_uuid()` cantonné aux **4** tables purement serveur (`sync_log`, `activity_log`, `integration_events`, `llm_calls`) — 11 §2 respecté | **L5** (Workbox, Dexie, écrans) |
| E7  | Remontée continue dès qu'il y a du réseau  | partiellement amorcée     | Socle de données seul : `0007_transverse.sql` (`sync_log` avec `direction`, `conflicts_count`, `outbox_remaining`) · `processed_ops` (déduplication `op_id`, §9.2) · `answer_revisions.change_origin` CHECK `('terrain','sync_arbitrage','correction_siege')` — traçabilité §9.3 écrite dans le schéma | Moteur de sync → L6 |
| E8  | Durée d'audit libre, statuts sans fin      | partiellement amorcée     | `missions.status` CHECK `('preparation','en_cours','en_analyse','livree','cloturee')`, `start_planned`/`end_planned`/`delivered_at` sans butoir. **Vérifié par moi en base** : une valeur hors énumération est rejetée | Transitions gardées → L3 (§32.2) |
| E9  | Multi-consultants, sync sans conflit       | partiellement amorcée     | `mission_users` (PK composite, `role_on_mission`) · `work_assignments` UNIQUE `(mission_id,user_id,org_unit_id)` — **contrainte vérifiée présente en base** · `answer_revisions` (§9.4/§9.9) | RBAC et propriété de session → L2 · arbitrage LWW → L6 |
| E10 | Banque de questions unique versionnée      | partiellement amorcée     | `questions` avec `code`+`version` et **index UNIQUE PARTIEL `uq_questions_code_version` WHERE code IS NOT NULL** — comportement **éprouvé par moi** : doublon `(Q,1)` rejeté, `(Q,2)` accepté, deux `code NULL` acceptés · `question_translations` (PK `question_id,lang`) | Import/ré-import §36.4 → L4 · back-office → L9 |
| E11 | Questionnaire généré et figé par mission   | partiellement amorcée     | `mission_questions` avec `text_snapshot` **NOT NULL** (identité T13) — le figeage est inscrit dans le schéma, pas seulement dans l'intention | Moteur M2 → L3            |
| E12 | Entretiens par interlocuteur, à-revoir     | partiellement amorcée     | `interviews` (`kind`, `status`, `schedule_status`) · `interlocutor_profiles` seedés (**9**, tous avec `group_code` ∈ `direction`/`encadrement`/`terrain` — **vérifié un par un en base**) · `answers.flag_review` (« à revoir ») | Écrans et parcours → L5   |
| E13 | Écran 3 zones, enregistrement continu      | partiellement amorcée     | Socle de données seul : `0004_collecte.sql` (`answers` UNIQUE `(interview_id, mission_question_id)`, `attachments` avec `kind='note'` P1-5) | Écrans → L5               |
| E14 | Consolidation, divergences, radar          | partiellement amorcée     | Socle : `block_scores`, `findings` (`severity`, `sources` JSONB **NOT NULL** — convention T15) · `interlocutor_profiles.group_code`, qui est **la** donnée du calcul de divergence direction/terrain (§32.1) | Agrégation → L7-min · calcul → L8 |
| E15 | Rapport DOCX 12-60 p.                      | partiellement amorcée     | L0 : file **`rapports`** (clés Redis `axion:rapports:…`) inerte — **nom rectifié au L0-b, voir l'encadré du §B.3**. L1 : `report_sections`, `report_templates`, `report_files` (`0006_rapport_cadrage_pilotage.sql`) | L10                       |
| E16 | Rédaction assistée IA par bloc             | partiellement amorcée     | L0 : file **`llm`** (clés Redis `axion:llm:…`) inerte — **nom rectifié au L0-b, §B.3**. L1 : `llm_calls` (journal des coûts) · `report_sections` (états brut/généré/validé) | L11                       |
| E17 | **Stack imposée (Hetzner, Docker, PG, Fastify, Vite/React)** | **partiellement amorcée** | **APPORT L0-b — la stack ne s'exécute plus seulement en local.** Cinquième pile Compose livrée, `infra/docker-compose.coolify.yml` (983 l.), déployée sur `axionia-web` : **PostgreSQL 16, Redis 7, MinIO, Fastify 5, BullMQ, Caddy, les deux fronts Vite** tournent réellement, et le chaînage `/` → field · `/hq/` → hq · `/api` → API **est prouvé à travers Caddy** (vérifié par moi depuis le conteneur frontal : `/api/v1/health` **200**, `/api/v1/health/ready` **200**, `/` **200**, `/hq/` **200** servant `Axion Audit — Console`, `/api/v1/nexistepas` **404**). Domaine unique préservé, **zéro CORS** (11 §2). Deux Dockerfiles portent désormais la configuration DANS l'image (`infra/caddy/Dockerfile` nouveau, `infra/postgres/Dockerfile` refondu) parce que Coolify ne monte jamais depuis le dépôt cloné. ⚠️ ~~**Mais le socle n'est pas sain : le PostgreSQL du staging se réinitialise toutes les ~10 s** — voir E35 et §G.2.~~ **PÉRIMÉ — CORRIGÉ LE 2026-08-28 (§H.1).** Remesuré par A02 sur `1c56759` : `grep -ci reinitializing` sur **l'intégralité** du journal Docker → **0** ; cluster continu depuis **2 h 56** (`pg_postmaster_start_time()`), `RestartCount=0`, `pg_stat_archiver` `archived_count=31` / **`failed_count=0`**. La sonde a changé de sujet (`axion-healthcheck`, âge du checkpointer — `pg_isready` a disparu). **Le socle est sain.** **Apport L1** : PostgreSQL 16 réellement exploité — 12 migrations **SQL brut versionné**, **aucun ORM générateur de schéma** (11 §2 : `check:invariants` CT-2-PRISMA vert) ; Drizzle cantonné aux requêtes typées (`apps/api/src/db/schema.ts`, 1 023 l.) et **confronté à la base par un test dédié** que j'ai éprouvé par 4 mutations (§F.0). **Rappel L0 ci-dessous.** — Compose dev/staging/prod validés : `docker compose --env-file … config -q` → **RC=0** sur les 3 combinaisons · `apps/api` (Fastify 5) · `apps/field`/`apps/hq` (Vite+React) · `apps/worker` (BullMQ) · `packages/shared` (Zod) · `pnpm typecheck` 6/6 vert · `pnpm build` 4 images | Dexie/Workbox → L5 · docxtemplater → L10 |
| E18 | Liaison console axion-ia.com               | partiellement amorcée     | L0 : file **`webhooks`** (clés Redis `axion:webhooks:…`) inerte — **nom rectifié au L0-b, §B.3**. L1 : `companies.external_ref` (« id client console, NULL si local ») · `integration_events` (anti-rejeu, `attempts`) | L13                           |
| E19 | Avant-vente : cadrage → devis              | partiellement amorcée     | `scoping_estimates` · `estimation_params` **seedées (29 clés normées)** — le contrat 11 §5 en réserve la validation à Williams (porté à la porte P-A, point 4) | Simulateur et devis → L2 (étanchéité) · Phase 2 |
| E20 | Suivi avance/retard temps réel             | partiellement amorcée     | Socle : `mission_rebaselines` (`decision` ∈ `absorbe`/`avenant`/`descope`, §25.1) · `work_assignments.planned_days` | Projection de fin → Phase 2   |
| E21 | Auditeurs jamais d'accès aux montants      | ~~partiellement amorcée~~ **`couverte` au 2026-08-31 (§A.quinquies, ligne E21)** | ~~La table à cloisonner existe et est **isolée par construction** : `scoping_financials` a pour PK `scoping_estimate_id` (aucune donnée financière dans `missions` ni `scoping_estimates`). **Vérifié par moi en base** : `daily_rates`, `travel_costs`, `total_amount`, `currency` ne vivent que là~~ — **toujours vrai, mais ce n'est plus le sujet.** Le lot L2 (T5) a livré la route, le dépôt unique et **cinq ceintures** ; la preuve est au §A.quinquies et l'inventaire au §B.11.3 | ~~**L2** — RBAC serveur, routes admin exclusivement, tentatives d'intrusion croisées (porte **P-B**). **L1 ne prouve rien de l'étanchéité** : il n'y a aucune route~~ **FAIT.** Ce qui reste n'est pas du travail, c'est une **vigilance** : la garantie est une propriété du dépôt, pas un livrable clos (§A.quinquies) |
| E22 | Console de pilotage 7 espaces              | non commencée             | Coquille annotée : `apps/hq/src/App.tsx`, `apps/hq/vite.config.ts` (base `/hq/`)                                  | L7-min · Phase 2              |
| E23 | Hyper intuitif, novice < 30 min            | non commencée             | —                                                                                                                 | L5 (porte P-C, A54)           |
| E24 | Validation obligatoire de chaque étape     | partiellement amorcée     | `step_validations` avec **énumération FERMÉE** `step_code` ∈ 8 codes (§32.2, P1-1), `was_override` + `override_reason` (dérogation tracée) · `users.usage_profile` DEFAULT `'guide_strict'` (§19.1) — **valeur par défaut vérifiée en base** | Verrous et transitions gardées → L3/L5 |
| E25 | Zéro oubli (plan, couverture, contrôles)   | partiellement amorcée     | Socle : `document_requests` (`status` ∈ `demande`/`recu`/`partiel`/`non_disponible`) · `step_validations` · `work_assignments` (plan d'entretiens) | Écrans de couverture et contrôles de fin → L3 · L5 · L7-min |
| E26 | Alertes actives sur les manques            | partiellement amorcée     | Socle : `alerts` (`type` NOT NULL — identité T13, P1-2 §20.4) | Centre d'alertes, 8 types, acquittement motivé → Phase 2 |
| E27 | **Design moderne, charte, WCAG AA**        | **partiellement amorcée** | `packages/ui/src/tokens.ts` + `tokens.css` · **91 tests verts** (`pnpm test:unit`) dont contraste AA et parité TS/CSS · garde-fou INV-4 « aucune couleur en dur » vert | Composants shadcn → L5 · dataviz → L8 |
| E28 | Détecter tout le potentiel IA + formation  | partiellement amorcée     | Socle : `tools_inventory` (`category`, `criticality`) · `use_cases` (gain, coût, complexité, `payback_months`, `baseline_*`, §28.1/§28.2-5) | Collecte → L5 · analyse → L7/L8 · restitution → L10 |
| E29 | Rapport = plan d'action 12 mois            | partiellement amorcée     | Socle : `roadmap_items` (`scenario` avec DEFAULT prescrit, §20.3) · `findings.wave` ∈ `quick_win`/`chantier`/`transformation` | L10                           |
| E30 | 3 niveaux d'audit                          | partiellement amorcée     | `missions.audit_level` CHECK `('diagnostic_cadrage','operationnel','strategique_groupe')` (§20.1) · `report_templates.kind` (gabarits par niveau §26.2) | Effets fonctionnels → L3 · gabarits → L10 |
| E31 | **Généricité absolue (aucune réf. client)**| **partiellement amorcée** | Contrôle **manuel** du gardien sur les 43 tables, les 12 migrations, le manifeste, le seed et les 7 suites d'intégration : **aucun nom de client**, les fixtures sont FIL-TPE et FIL-GC (entreprises fictives, 09 §4bis). ⚠️ ~~**Le garde-fou MÉCANIQUE, lui, ne tourne pas en CI — voir la réserve F-1 : c'est un écart, pas une remarque.**~~ **F-1 LEVÉE (§H.6)** : le job `invariants` de `ci.yml` passe désormais `AXION_CLIENTS_SURVEILLES` par un secret de dépôt, et le script **échoue volontairement en CI** si aucune liste n'est fournie — un contrôle qui n'a rien vérifié ne sort plus jamais vert. ⚠️ **Conséquence à porter à Williams, écrite nulle part ailleurs : tant que le secret n'est pas créé, la CI sera ROUGE au merge** — c'est-à-dire au moment exact où le critère L0 n° 4 doit se prouver. | **F-1 levée · créer le secret (Williams)** · vérification permanente à chaque lot |
| E32 | Fuseaux, devises, interface française      | partiellement amorcée     | L0 : `packages/shared/src/temps.ts`, `TZ` du Compose. **L1 : la règle est descendue en base** — `missions.timezone` TEXT DEFAULT `'Europe/Paris'` (§22.2), `scoping_financials.currency` DEFAULT `'EUR'`, `missions.country_code`, `question_translations(question_id, lang)`. **Vérifié par moi** : toute colonne `*_at` est `TIMESTAMPTZ` (convention de typage du manifeste, gardée par `pnpm schema:diff`) — un horodatage sans fuseau ne peut plus entrer en silence | Affichage au fuseau de mission → L3/L5 · i18n EN → L20 |
| E33 | **Sécurité / RGPD** (+ apports L1 et L0-b) | **partiellement amorcée** | **APPORT L0-b, et c'est le plus important du lot : l'étanchéité vis-à-vis du VOISIN DE PRODUCTION.** Le staging cohabite avec `axion-ia.com` sur la même machine ; le réseau du proxy Traefik a l'**ICC activé** (`docker network inspect coolify` → `Options {}`, revérifié par moi). `scripts/check-isolation-reseau.mjs` (145 l., câblé **en CI**, `ci.yml:198`) interdit à tout service autre que `caddy` de le rejoindre. **Et je ne me suis pas contenté du fichier : j'ai mesuré sur la machine.** Les 9 conteneurs du projet sont sur `axion-audit-coolify-interne` ; **seul `caddy` porte en plus le réseau `coolify`**. Épreuve réseau réelle : depuis le conteneur `api`, une connexion TCP vers le PostgreSQL du voisin (`u7zlql3bpb1xy5t4kg6jnvpm:5432`) **n'aboutit pas** ; depuis `caddy`, elle aboutit — le risque résiduel est donc **exactement celui que le script documente**, ni plus ni moins. ⚠️ **Deux réserves.** (a) **La version du lot laissait passer trois façons d'ouvrir cette route** — dont la séquence en bloc `- edge`, la plus courante de toutes ; **elle a été réécrite pendant ma passe et les rattrape désormais** (11 injections, 11 attrapées, §G.3), ~~mais **cette réécriture n'est dans aucun commit** et n'a pas encore de revue croisée~~ — **PÉRIMÉ (§H.6) : la réécriture est commitée (`beb0024`, `15ce18c`) et gardée par une suite d'injection de 53 tests (`scripts/garde-fous-compose.test.ts`) qui exécute le script LIVRÉ ; `check:isolation-reseau` et `check:compose-coolify` sortent en RC=0 sous mon exécution.** (b) ~~Le `.env` du staging est en **644** et non `600` (§G.5).~~ **PÉRIMÉ (§H.5) : ce constat était le mien et il était FAUX.** `/data/coolify` et `/data/coolify/applications` sont en **700** — le chemin n'est pas traversable, la lecture en tant que `nobody` a été refusée par tentative réelle, et la machine n'a aucun utilisateur humain à shell hormis root. **Ce qui reste dû sur E33 est autre chose** : le contrôle nominatif des 12 familles §30.3 (Williams) et la sauvegarde chiffrée du `.env` (coffre D-3, **inactif et non déployé**). **Apport L1** : `users.password_hash` et `refresh_tokens.token_hash`/`expires_at` **NOT NULL** (convention T14 — « une ligne d'authentification sans secret ni expiration ne doit pas pouvoir exister ») · `app_settings` (secrets chiffrés AES via `APP_ENCRYPTION_KEY`) · **aucune donnée personnelle n'entre dans un log de migration ou de seed** (relu par moi). **Rappel L0 ci-dessous.** — gitleaks bloquant (`.gitleaks.toml`, job CI `gitleaks`) · **SEC-30.4a/b verts** (aucun secret en dur) · redaction pino (`apps/api/src/logger.ts`) · helmet + CSP + rate-limit (`apps/api/src/app.ts`) · durcissement §10.3 scripté (`infra/scripts/provision-vps.sh`) · ZAP baseline (`.github/workflows/zap-baseline.yml`) · **12/12 familles de secrets §30.3 documentées dans `.env.example`** | Chiffrement local → L5 · consentements/purges → L1/L11 · **durcissement réellement appliqué → L0-b** |
| E34 | Conformité AI Act                          | partiellement amorcée     | Socle : `ai_systems` (registre, `data_categories`, `obligations`) · `blocks` seedés jusqu'à `bloc_9` — le bloc AI Act **existe en base dès L1** | Registre exploité, chapitre rapport, ISO/IEC 42001 → L12 |
| E35 | **Scalabilité + sauvegardes 3-2-1 testées chaque nuit** | **partiellement amorcée** — ~~ET EN RÉGRESSION SUR STAGING~~ **la régression est LEVÉE (§H.2) ; il reste une limite de PORTÉE (§H.3)** | **APPORT L0-b, positif** : `apps/worker/src/sonde-sante.ts` (157 l.) remplace la sonde `pgrep -f node` du L0, qui observait un VOISIN du sujet et rendait « healthy » un worker mort ; la nouvelle sonde prouve un **battement de cœur propre à l'instance** (clé Redis à expiration 20 s) **et l'attachement d'un `Worker` BullMQ à CHACUNE des 5 files**. **Éprouvée par moi sur le staging, par injection** : conteneur jetable issu de la MÊME image, autre identité → **RC=1** avec les 6 anomalies nommées ; même conteneur avec l'identité réelle du worker → **RC=0**. La sonde discrimine donc réellement, elle ne se contente pas d'exister. ~~**ET UN CONSTAT NÉGATIF QUI DOMINE TOUT LE RESTE** : sur le staging, `pgbackrest stanza-create` n'a **jamais** été exécuté (`/var/lib/pgbackrest/` **vide**), `archive-push` sort en **103**, et le postmaster **réinitialise le cluster entier** — **275 fois en 46 minutes**, soit une fois toutes les ~10 s, depuis la première minute du déploiement. **L'archivage WAL du staging est à ZÉRO.**~~ **⚠️ CE CONSTAT EST PÉRIMÉ DEPUIS LE 2026-08-28 — il est remplacé, pas effacé (§H.2).** Remesuré par A02 : `stanza-create` est **mécanisé** (`infra/postgres/stanza-create.sh`, chemin idempotent emprunté en déploiement réel), `pgbackrest info` → **`status: ok`**, 1 complète `20260828-072358F` + **4 incrémentales**, WAL `…0001` → `…0021` **continus**, `failed_count=0` sur 31 segments, chiffrement `aes-256-cbc`. Et la restauration n'est plus une opération manuelle : **8 tests `@critique`** (`l0-restauration`) + **43** (`l0-sauvegarde`) l'exercent, **exécutés par A02, verts**, avec la contre-épreuve qui refuse une empreinte fausse. **⚠️ CE QUI REMPLACE LE CONSTAT, ET QUI EST NEUF — §H.3 :** cette chaîne n'est définie que dans `infra/docker-compose.coolify.yml` ; **ni le compose de base, ni la surcharge `prod` ne portent le service `sauvegarde`.** E35 est prouvée sur une cible et énoncée comme une propriété du système. Livrés (inchangés) : `infra/pgbackrest/pgbackrest.conf`, `infra/postgres/Dockerfile`, `backup-postgres.sh`, `backup-minio.sh`, **`restore-test.sh`**, `install-cron.sh`, `nightly-restore-test.yml` | **Deux manques distincts, à ne pas confondre.** (a) Le test de restauration a été exécuté **en local** le 2026-08-27 (critère L0 n°2) mais **jamais sur staging** ; (b) sur staging la chaîne d'archivage est **cassée**, pas seulement non prouvée → **§G.2, bloquant de la porte P-A** |
| E36 | **Exécutable par lots avec critères**      | **partiellement amorcée** | **APPORT L0-b** : deux garde-fous nés de déploiements ratés — `check:compose-coolify` (201 l.) et `check:isolation-reseau` (145 l.) — **et ils sont câblés DANS LA CI** (`ci.yml:198` et `:205`), pas seulement dans `pnpm verify`. **C'est la leçon F-1 du lot L1 appliquée** : au L1, un garde-fou existait et ne tournait nulle part. `check:compose-coolify` apporte ce que `docker compose config -q` n'apporte pas — j'ai revérifié la contre-épreuve : `config -q` rend **0** sur un chemin inexistant, le script rend **1**. **Éprouvés par moi par injection — 8 injections sur les versions du lot : 6 attrapées, 2 MANQUÉES ; puis 11 sur les versions réécrites pendant ma passe : 11 attrapées** (§G.3). `deploy-staging.yml` réécrit (+468 l.) et **11 tests `@critique`** interdisent le retour du worker mort. L0 : CI, `pull_request_template.md`, garde-fous auto-périmés éprouvés (§D.1). **L1 : les quatre critères du lot sont OUTILLÉS, pas seulement déclarés** — `pnpm schema:diff` (886 l.) et le **second verrou en liste noire** `pnpm check:schema-inventaire` (230 l.), les deux **éprouvés par moi par 34 mutations injectées en base, 34 détectées** (§F.0). ~~**169 tests verts exécutés par moi** : 95 unitaires + 66 d'intégration + 8 Playwright~~ → **RECOMPTÉ LE 2026-08-28 SUR `1c56759` : 356 tests verts exécutés par moi** — **179** unitaires (3 fichiers) + **141** d'intégration (**12** fichiers) + **36** Playwright, **RC=0 partout, aucun skippé**, 18 fichiers de test tous captés par un projet. | ~~Voir **F-1** (INV-2 non appliqué en CI) et **F-3** (`test:e2e:filrouge` en échec)~~ — **F-1, F-2, F-3 et F-7 sont LEVÉES (§H.6)**. Restent **R-4 et R-5** (§H.7) : la redaction RGPD et cinq garde-fous sur dix n'ont aucun test |
| E37 | Scoring intégralement spécifié             | partiellement amorcée     | `questions.scoring` JSONB (format normé 04 §7.3) · `questions.weight`, `criticality`, `allow_range` (DEFAULT prescrits) · `block_scores.is_indicative` | Barème, agrégation, drapeaux rouges → L8 · contrôle bloquant à l'import → L4 |
| E38 | Sauvegarde terrain (sync ≥ 1×/j + export)  | partiellement amorcée     | `sync_log.outbox_remaining` — **la** donnée du garde-fou « sync muette » du §9.7, présente en base dès L1 | Export de secours → L5c · sync → L6 · alerte → L6 |
| E39 | Machine à états mission                    | **partiellement amorcée** — **c'est la part que le fichier 07 confie explicitement à L1** | Les **codes** sont posés et fermés : `missions.status` (5 valeurs), `step_validations.step_code` (8 codes, énumération fermée P1-1), `interviews.status`/`schedule_status`, `findings.status`/`remediation_status`, `use_cases.status`, `org_units.status`, `document_requests.status`. **Éprouvé par moi en base** : une valeur hors énumération est refusée (`questions_answer_type_check` sur `'pirate'`). **Et le comparateur garde ces énumérations** : mutation injectée par moi — un littéral dont seule la **casse** change (`'PREPARATION'`) → `pnpm schema:diff` **RC=1** | Transitions contrôlées → L3 (§32.2) |
| E40 | ROI normé, échantillonnage, ancres         | partiellement amorcée     | Socle : `use_cases` (`gain_low`/`gain_high`/`payback_months`/`assumptions`, §28.2-5) · `estimation_params` **29 clés seedées** | Ancres de cotation → L4 · formule ROI → L11 |
| E41 | Consolidation groupe cadrée                | partiellement amorcée     | `missions.parent_mission_id` FK auto-référente (missions filles §32.3) · `missions.geo_scope` + `country_code` | Agrégation, heatmap filles×blocs, gabarit dédié → L14 |
| E42 | RGPD renforcé (pseudonymisation, rétention)| partiellement amorcée     | L0 : redaction pino, file **`purges`** (clés Redis `axion:purges:…`) — **nom rectifié au L0-b, §B.3**. **L1 : les supports de purge et de rétention existent** — `activity_log` (§10.4), `attachments.purge_after DATE NULL` (purge audio), `processed_ops.processed_at` (rétention 30 j), `llm_calls`. `app_settings` porte les seuils et durées de purge | **Politique de rétention `activity_log` réellement appliquée → L2** (un job, pas une colonne) · pseudonymisation 2 passes → L11 |
| E43 | **Exécutabilité autopilote**               | **partiellement amorcée** | **APPORT L0-b, et c'est le défaut le plus coûteux du dépôt qui tombe ici.** L'image de l'API **déclarait `db:migrate` sans embarquer ni `scripts/` ni `drizzle/`** ; or `infra/scripts/deploy.sh` appelle exactement cette commande à son étape 2/5 (`deploy.sh:125` en dry-run, `:131` en application) — **l'étape de migration du déploiement n'aurait jamais fonctionné, ni en staging NI EN PRODUCTION**. **Vérifié réparé par moi dans l'image en ligne** : `ls` dans le conteneur `api` du staging montre `scripts/{migrations,seed,db-generate}.mjs` et les **12** fichiers `drizzle/*.sql`. Deuxième apport : `scripts/prepare-husky.mjs` (78 l.) lève l'**hypothèse non écrite** sur l'environnement de construction (Coolify pose `NODE_ENV=production`, pnpm saute alors TOUTES les dépendances de développement — `tsc` compris) ; la CI ne posait pas cette variable, le défaut était donc invisible. Troisième : `check-jonction.mjs` cesse de lire la **prose** comme du code — un garde-fou qui punit ceux qui documentent. L0 : versions épinglées, conventions API §3, 40 gabarits, `ETAT.md`. **L1 : les seeds sont codables et rejouables** (`apps/api/scripts/seed.mjs` — **empreinte md5 par table identique aux passages 1, 2 et 3, mesurée par moi**), l'exécuteur de migrations est réversible et transactionnel (`apps/api/scripts/migrations.mjs`, `--check`/`--down`/`--down-to 0`), `processed_ops` (contrat d'ops 11 §4) est en base, et `apps/api/scripts/db-generate.mjs` refuse une migration sans descente | Contrat d'ops exploité → L6 · format export de secours → L5c |
| E44 | UX/UI 2026-2027 (tokens, police locale)    | partiellement amorcée     | `packages/ui/src/tokens.ts` (tokens chiffrés) · garde-fou **CT-1-CDN vert** (police auto-hébergée, aucun CDN)      | Grille §33 (4 états, raccourcis, écran partagé) → L5 · desktop-first → L7 |
| E45 | Pilotage humain (habilitation, cockpit)    | **partiellement amorcée** — **part L1 satisfaite et prouvée** | `users.habilitated_at TIMESTAMPTZ NULL` livré (`0001_referentiels.sql`), et **posé par le seed sur le compte admin fondateur** — l'anti auto-verrouillage du §34.4. **Vérifié par moi après un seed neuf** : `role=admin habilitated_at=2026-08-27 20:47:13+00 is_active=true`. Sans cela, personne n'aurait pu s'affecter la première mission. Aussi : `mission_users.role_on_mission` (`lead`…), `work_assignments` (plan de charge §34) | ⚠️ **PROMESSE NON TENUE PAR L2, mesurée le 2026-08-31.** ~~Refus serveur d'affectation si `habilitated_at` NULL → **L2**~~ — **L2 a livré la LECTURE, pas le REFUS.** `apps/api/src/auth/depot.ts` projette `habilitatedAt` dans `UtilisateurAuthentifie.habiliteLe`, et **`grep -rn habiliteLe apps/api/src` ne rend que les deux lignes de sa propre déclaration** : aucun chemin de code ne le consulte. La tâche T3 (CRUD users, habilitation §34.4) n'est **pas livrée** et ses trois silences de spécification attendent Williams (`DECISIONS.md` 2026-08-30 « Le CRUD users n'est pas spécifié : onze silences »). **Reporté à L2b** · cockpit « Aujourd'hui » → L5 (§34.2) · espace Équipe → Phase 2 |
| E46 | Bout en bout opérationnel (calendrier, CSV)| partiellement amorcée     | Burn-down tenu (`docs/journal/2026-08-27.md`, **désormais suivi par git** — le défaut relevé en §D.6 est levé) · `org_units` (cible de l'import CSV) | Format CSV d'arbre → L3 · butoir L8 |
| E47 | Profondeur fonctionnelle + conventions     | partiellement amorcée     | L0 : conventions git/DECISIONS matérialisées, sceau du pack. **L1 : la gouvernance `DECISIONS.md` est MÉCANISÉE** — `pnpm check:decisions` (**44 entrées, toutes au format 11 §9bis**, mesuré par moi ; **éprouvé** : entrée hors format injectée → RC=1). C'est exactement ce que le §D.4bis appelait de ses vœux, et ce qui manquait au L0. · `questions.code`/`version` (support de l'import §36.4) | **Écart de gouvernance F-7 : le lot L1 a été développé sur la branche `lot/l0-infra`** · export ZIP §36.3 → L7-min · import banque §36.4 → L4 |

## A.bis — Synthèse chiffrée au 2026-08-27 (fin L0-a)

| État                                   | Nombre | Exigences                                                                 |
| -------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `couverte`                             | **0**  | — (aucune exigence n'est intégralement satisfaite ET prouvée à ce stade)   |
| `partiellement amorcée`                | **12** | E17, E27, E31, E32, E33, E35, E36, E42, E43, E44, E46, E47                |
| `non commencée`                        | **35** | toutes les autres                                                         |

**Aucune exigence dont L0 avait la charge n'est oubliée.** Les 5 exigences que la ligne L0 du
fichier 07 engage directement — E17 (stack), E33 (sécurité/secrets), E35 (sauvegardes testées),
E36 (exécutabilité par lots), E43 (autopilote) — ont toutes du code livré. **Deux d'entre elles ne
sont pas prouvées** : E35 (le test de restauration n'a jamais tourné) et E36 (la CI ne peut pas
passer au vert, §D.1).

## A.ter — Synthèse chiffrée au 2026-08-27 (fin L1) — **et la nuance qui compte**

| État                                   | Nombre | Exigences                                                                 |
| -------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `couverte`                             | **0**  | — (inchangé : aucune exigence n'est intégralement satisfaite ET prouvée)   |
| `partiellement amorcée`                | **45** | toutes sauf E22 et E23                                                    |
| `non commencée`                        | **2**  | E22 (console 7 espaces), E23 (novice < 30 min) — **aucun écran n'existe**  |

**Ce tableau serait trompeur si on s'arrêtait là.** Passer de 12 à 45 exigences « amorcées » en un
lot n'est pas un bond fonctionnel : c'est l'effet mécanique d'un schéma **intégral**. Le fichier 04
décrit tout le produit ; le livrer d'un coup fait toucher presque toutes les exigences **par leur
socle de données**. Le décompte utile est donc celui-ci :

| Nature de l'apport du lot L1                                                   | Nombre | Exigences |
| ------------------------------------------------------------------------------ | ------ | --------- |
| **Part que le fichier 07 confie EXPLICITEMENT à L1, livrée ET prouvée par exécution** | **5** | **E1** (9 blocs, 11 fonctions) · **E2** (4 paliers) · **E3** (secteurs, `naf_sector_map`) · **E39** (codes d'étape fermés) · **E45** (`habilitated_at` posé sur l'admin fondateur) |
| **Outillage du lot lui-même, livré et éprouvé par injection**                     | **4**  | E17 (migrations SQL brut, Drizzle borné) · E36 (`schema:diff` + `check:schema-inventaire`) · E43 (seed rejouable, migrations réversibles) · E47 (`check:decisions` mécanisé) |
| **SOCLE DE DONNÉES SEUL — la table existe, la fonction est ailleurs**             | **28** | E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16, E18, E19, E20, E21, E24, E25, E26, E28, E29, E30, E34, E37, E38, E40, E41 |
| **Inchangées par L1** (état L0 conservé)                                         | **8**  | E27, E31, E32, E33, E35, E42, E44, E46 — apport marginal ou nul |
| **Non commencées**                                                               | **2**  | E22, E23 |

**Aucune exigence dont L1 avait la charge n'est oubliée.** La ligne L1 du fichier 07 engage
nommément : les 9 blocs, les secteurs, les 11 fonctions, les profils **avec `group_code`**, les
paliers, les `estimation_params` normées, `naf_sector_map`, et le **compte admin fondateur avec
`habilitated_at` posé**. Les huit sont livrés et **vérifiés un par un par moi sur une base neuve**
(§B.9.2). Aucune n'est déclarée sur la foi d'un rapport d'agent.

## A.quater — Synthèse chiffrée au 2026-08-28 (fin L0-b, incrément d'opérations)

**Aucune exigence ne change d'ÉTAT au L0-b.** C'est normal et c'est même le bon signe : un incrément
d'opérations ne livre pas de fonction, il fait passer du code déjà écrit de « existe » à « s'exécute
ailleurs que sur la machine de son auteur ». Le décompte du §A.ter est donc inchangé : **0 couverte ·
45 partiellement amorcées · 2 non commencées**.

Ce qui change est ailleurs, et c'est ce que la ligne L0 du fichier 07 engageait :

| Exigence engagée par la ligne L0 | Avant L0-b | Après L0-b, **mesuré par moi** |
| --- | --- | --- |
| **E17** — stack imposée | s'exécute en local, `config -q` vert sur 3 piles | **s'exécute sur un serveur**, 5ᵉ pile, chaînage `/` · `/hq/` · `/api` prouvé à travers Caddy |
| **E33** — sécurité / RGPD | secrets documentés, garde-fous statiques | **étanchéité réseau vis-à-vis d'un voisin de PRODUCTION, mesurée par une connexion TCP réelle** · ⚠️ `.env` en 644 (§G.5) |
| **E35** — sauvegardes testées | restauration prouvée **en local**, jamais sur serveur | ~~**RÉGRESSION** : archivage WAL du staging **inopérant**, cluster réinitialisé **275 fois en 46 min** (§G.2)~~ **PÉRIMÉ — LEVÉ LE 2026-08-28 (§H.2)** : `status: ok`, 1 complète + 4 incrémentales, WAL continus, `failed_count=0`, restauration prouvée par identité d'empreinte **et mécanisée en 8 tests `@critique`**. **Limite de portée neuve : la chaîne n'est câblée que sur la pile Coolify (§H.3).** |
| **E36** — exécutable par lots | garde-fous, dont un non câblé (F-1) | 2 garde-fous de plus, **câblés en CI** · versions du lot : 8 injections, **2 manquées** · versions réécrites pendant ma passe : 11 injections, **11 attrapées**, non commitées (§G.3) |
| **E43** — exécutabilité autopilote | migrations réversibles en local | **l'image d'API contient enfin les migrations qu'elle déclare** — `deploy.sh` étape 2/5 réparé pour staging **et production** |

**Le mouvement net du lot est donc à deux sens, et il faut les nommer tous les deux** : E17, E33, E36
et E43 avancent réellement et par mesure ; **E35 recule**, parce qu'un déploiement réel a montré que
la chaîne de sauvegarde, prouvée en bac à sable, ne s'installe pas d'elle-même sur une machine.

## A.quinquies — ÉTAT APRÈS L2, L3a, L4 ET L0-c/d/e (2026-08-31) — **la table qui fait foi pour les 17 exigences ci-dessous**

**Périmètre : `1c56759..HEAD`, 61 commits, 59 fichiers ajoutés et 65 modifiés.** Méthode inchangée
depuis le lot L0 : **l'annotation `// Traçabilité : E__` ne vaut pas preuve.** Ce qui est neuf à cette
passe, et qui change la nature du contrôle, c'est qu'une partie des rattachements de L2 **a déjà été
arbitrée nominativement** — `DECISIONS.md` du 2026-08-29, « À quelle exigence se rattache le socle
d'autorisation, et que faire des 25 fichiers qui citaient E5 ? ». Je ne réouvre pas cet arbitrage : je
vérifie que le code livré s'y conforme, et je dis là où il le dépasse.

**Conditions de mesure.** Poste de développement, **Node v24.19.0 — toujours hors de l'épingle 11 §1**
(`>=22.11.0 <23`) ; Docker 29.7.2 ; aucune mesure sur `axionia-web` à cette passe (aucun accès pris).
Ce qui n'a pas été mesuré est dit au §B.11.7, pas passé sous silence.

| #   | Exigence (abrégé)                          | État au 2026-08-31 | Ce que L2 / L3a / L4 / L0-c-d-e y ajoutent — et ce qui manque encore |
| --- | ------------------------------------------ | ------------------ | -------------------------------------------------------------------- |
| E6  | Hors ligne total, PC ET tablette           | partiellement amorcée | **Socle de données seul, et il s'élargit.** Migration `0013` livre `attachment_uploads` (05 §9.6, envoi par morceaux) : le pack exigeait « la liste des chunks reçus », une reprise « qui n'envoie QUE les manquants » et un 409 portant les chunks à réémettre — **aucune table ne portait cet état**, et le scénario §9.8 « reprise d'un envoi interrompu à 80 % » impose qu'il **survive** à une coupure, donc qu'il soit persistant. La colonne est **un tableau d'index reçus, pas un compteur** : « n morceaux reçus » ne permettrait pas de dire *lesquels*. Le pack ne nommant ni table ni champ, la forme est une **décision** tracée (`DECISIONS.md` 2026-08-31). **Rien de la PWA n'existe** : ni Workbox, ni Dexie, ni écran → L5 |
| E7  | Remontée continue dès qu'il y a du réseau  | partiellement amorcée | Socle élargi par `0013` : `answer_revisions` est **généralisée en place** (`answer_id` nullable, `entity_type`/`entity_id`) au lieu d'être renommée — l'archive du §9.3 couvre désormais autre chose qu'une réponse. ⚠️ **Défaut évité et instructif** : `entity_type DEFAULT 'answer'` avait été écrit, et la convention T12 l'interdit ; avec ce défaut, une révision d'entretien dont l'écriture aurait omis le type **serait devenue silencieusement une révision de réponse** — l'archive créée pour empêcher les pertes silencieuses les aurait produites. C'est `pnpm schema:diff` qui l'a vu. Moteur de sync → **L6** |
| E9  | Multi-consultants, sync sans conflit       | partiellement amorcée | **Le vocabulaire de la propriété existe ; aucune route ne l'emploie encore.** `apps/api/src/auth/politique.ts` déclare `proprietaire_session {parametreSession}` comme l'un des cinq types de politique, et le crochet `onRoute` **refuse le démarrage** si le paramètre nommé n'est pas dans l'URL. Mais la politique dit *qui entre*, pas *ce que le SQL ramène* : le fichier l'écrit lui-même — « une porte fermée ne trie pas le courrier ». `attachment_uploads.created_by NOT NULL` applique §9.9 aux chunks, **par décision** (le pack ne dit pas si la règle de propriété couvre les morceaux binaires ; la lecture qui protège a été retenue). Arbitrage LWW et isolation par lignes → **L6** |
| E10 | Banque de questions unique versionnée      | partiellement amorcée | **APPORT L4, et le critère du fichier 07 est tenu.** `apps/api/scripts/import-banque-questions.mjs` (764 l.) importe CSV/JSON **en deux passes** : passe 1 valide l'intégralité en mémoire et **n'écrit rien**, passe 2 écrit en **une seule transaction** si et seulement si zéro erreur — l'atomicité §36.4 est une propriété de construction, pas une intention. `--versionner` crée une **nouvelle ligne** `version+1` et archive l'ancienne (jamais de modification en place, ce dont le figeage M2 dépendra). Jeu de recette livré : **9 fixtures** (`recette-complete.csv`/`.json` couvrant les 11 types de réponse, `recette-virgule-bom.csv`, et **6 fixtures de REFUS** — entêtes, structure, atomicité, barème, ancres, numéro de ligne). **21 tests d'intégration, dont 18 `@critique`**, écrits après coup par un autre agent : **ils ont trouvé deux vrais défauts**, dont les ancres §32.4 saisies en CRLF — *la forme qu'Excel produit* — rejetées par un contrôle bloquant. Back-office → L9 · les ~200 questions réelles ne sont **pas** un critère du lot (07 §35.1) |
| E13 | Écran 3 zones, enregistrement continu      | partiellement amorcée | Socle élargi par `0013` : `attachments.updated_at` (déduit du 05) et `attachments.created_by NOT NULL` avec la règle de propriété « le rattachement sinon l'auteur » (**décision**, le pack ne tranchait pas). Écrans → **L5** |
| E17 | Stack imposée (Hetzner, Docker, PG, Fastify, Vite/React) | partiellement amorcée | **APPORT L3a** : Zod est branché sur **les deux** compilateurs de Fastify (`setValidatorCompiler` / `setSerializerCompiler`, `apps/api/src/http/zod.ts`) — les routes déclarent des schémas **nus**, sans JSON Schema ni double déclaration. Fastify 5 ne sert plus deux sondes mais **six routes réelles** (§B.11.1). ⚠️ **Réserve neuve, §I.3** : l'en-tête de `zod.ts` justifie l'absence du crochet d'obligation par une prémisse **devenue fausse** |
| E19 | Avant-vente : cadrage → devis              | partiellement amorcée | Première lecture réelle du volet financier d'un cadrage (`GET /v1/scoping/:id/financials`), et le contrat de forme est partagé (`packages/shared/src/scoping.ts`). Les `NUMERIC` restent des **chaînes** de bout en bout : les convertir en `number` perdrait de la précision **sur un devis signé**, et le ferait silencieusement. Les **29 `estimation_params`** seedées ne sont toujours lues par **aucun** code : simulateur et devis → Phase 2 |
| E21 | Auditeurs jamais d'accès aux montants      | ✅ **couverte** | **SEULE EXIGENCE QUI CHANGE D'ÉTAT À CETTE PASSE.** Le libellé du fichier 08 est « RBAC routes + colonnes, **testé** » — les trois termes sont tenus. **Cinq ceintures**, nommées à l'identique dans les trois fichiers concernés : ① la route porte `roles:['admin'], financier:true` et le socle **refuse de démarrer** si une route n'a pas de politique ; ② `lireFinanciersDuCadrage(_contexte: ContexteAdmin, …)` — l'argument **n'est lu par aucune ligne** de la fonction, sa seule raison d'être est la signature : la jointure ne se refuse pas à l'exécution, **elle ne compile pas** chez un appelant sans la marque, et cette marque est un `unique symbol` **non exporté** (un booléen `estAdmin:true` se passe de bonne foi, une marque se **reçoit**) ; ③ balayage des sources — `scopingFinancials` n'est nommé que par ce dépôt ; ④ **balayage sentinelle à l'exécution** sur le registre `onRoute`, qui interroge **les routes qui existent** et non celles auxquelles on a pensé, avec cartographie obligatoire des paramètres pour ne pas verdir sur une pluie de 404 ; ⑤ `response[200]` en `strictObject`. **Preuve exécutée** : `apps/api/tests/l2-crochets.integration.test.ts`, **38 cas dont 17 `@critique`** — `consultant`, `analyste` et `lecteur` sont refusés en **403 et jamais 401** (un 401 dirait « authentifie-toi », donc « réessaie ») ; ceinture 4 `@critique` : « aucune route ne laisse sortir un montant ». Et le vrai piège est fermé : ce n'est pas la table interdite, c'est **sa voisine** `scoping_estimates`, à **une jointure** des montants, que toute route de cadrage à venir lira légitimement | **Rien n'est dû — mais rien n'est acquis.** E21 n'est pas un livrable clos, c'est une **propriété** que les ceintures ③ et ④ re-prouvent à chaque lot. Elle **retombe** à `partiellement amorcée` le jour où une route de cadrage atteint `scoping_financials` hors du dépôt unique, ou publie un montant. Le seuil de couverture 90 % s'applique aux deux globs (`domaines/scoping/**` **et** `routes/scoping.ts`) |
| E31 | Généricité absolue (aucune réf. client)    | partiellement amorcée | Le garde-fou mécanique a **cessé d'être une déclaration** : `scripts/check-invariants.mjs` est désormais gardé par **49 cas d'injection** (`scripts/garde-fous-invariants.test.ts`, écrits par A75) qui l'exécutent depuis un dépôt git **jetable** — témoin sain vert, chaque mutation rouge. Les 9 fixtures L4 sont génériques (`REC-*`, aucun nom d'entreprise). ⚠️ **R-6 INCHANGÉE et toujours due par Williams** : le job `invariants` lit `AXION_CLIENTS_SURVEILLES` depuis un secret de dépôt et **échoue volontairement** sans liste — **tant que le secret n'existe pas, la CI est rouge au merge** |
| E33 | Sécurité / RGPD                            | partiellement amorcée | **L'APPORT LE PLUS LOURD DE LA PASSE, et il est réel.** Domaine d'authentification complet : Argon2id (`hash-wasm`, m=19456/t=3/p=1) avec **empreinte-leurre consommée dans TOUS les cas**, y compris compte inconnu — l'oracle temporel avait été **mesuré** (450 ms contre 203 ms) avant d'être fermé par un préchauffage à l'enregistrement des routes ; jeton d'accès JWT HS256 portant **l'identité et jamais les droits** ; jeton de rafraîchissement **opaque** (32 octets, empreinte HMAC-SHA256 pour rester cherchable par égalité indexée) ; rotation dans **une seule transaction** avec `SELECT … FOR UPDATE`, et un rejeu hors fenêtre de grâce **révoque toute la famille** (06 §10.1). Le socle relit `users` **en base à chaque requête authentifiée** — un jeton de 15 min ne permet pas la désactivation « instantanée » qu'exige 06 §10.1 ; compte inconnu et compte désactivé rendent le **même** message. Quota `/v1/auth/*` 10 req/min **par IP**, et il n'est réel que parce que `trusted_proxies` est posé **sur les deux blocs** du Caddyfile : sans cela Caddy ≥ 2.7 remplace `X-Forwarded-For`, `request.ip` devient constant et le plafond n'est plus qu'un **seau global** — un déni de service à coût nul. **R-4 EST LEVÉE** : `packages/shared/src/redaction.ts` (796 l.), qui n'avait **aucun test** à la porte P-A, en a **29 dont 19 `@critique`** (`apps/api/src/redaction-journal.test.ts`). ⚠️ **Ce qui reste dû, et qui n'est pas mince** : chiffrement local terrain → L5 · consentements et purges → L11 · **l'authentification de la console (cookies httpOnly + en-tête anti-CSRF, 11 §3) n'est PAS livrée** — seul le Bearer existe, `@fastify/cookie` est hors de la liste §1 et le point est escaladé à Williams sous l'étiquette « L2b » (`DECISIONS.md` 2026-08-30) · contrôle nominatif des 12 familles §30.3 (Williams) |
| E35 | Scalabilité + sauvegardes 3-2-1 testées chaque nuit | partiellement amorcée | **APPORT L0-d, et il ferme un faux vert qui durait depuis le lot L0.** Le workflow `nightly-restore-test.yml` existait ; ses **deux étapes utiles étaient sautées à chaque exécution**, faute des réglages de l'environnement `ops` — « le garde portait le nom d'une garantie et n'avait jamais exécuté une seule ligne utile ». `infra/scripts/restore-test-ci.sh` (76 l.) est l'enveloppeur que la directive `command=` d'`authorized_keys` rend nécessaire ; il **publie sa propre empreinte SHA-256 en première ligne**, que la CI compare au fichier versionné. Run **`33322880502`** sur `main` = `e234756` : **toutes les étapes exécutées, aucune sautée**, clé confirmée restreinte, empreinte identique, Postgres restauré et **comparé table par table**, MinIO redémarré sur les données restaurées. `restore-test.sh` a été réécrit pour éprouver le **dispositif déployé** (conteneur `axion-sauvegarde`) et non plus un dispositif qui ne tourne nulle part. ⚠️ **R-2 EST TOUJOURS OUVERTE, et je l'ai remesurée moi-même : voir §I.1** |
| E36 | Exécutable par lots avec critères          | partiellement amorcée | **312 tests unitaires exécutés par moi, 11 fichiers, RC=0, aucun skippé** (`pnpm test:unit`, 25,4 s) — contre 179 à la porte P-A. Le dépôt compte désormais **14 garde-fous** contre 10. ⚠️ **Et c'est là que la mesure est mauvaise : R-5 a EMPIRÉ, pas progressé — voir §I.4.** Trois écarts de câblage neufs, mesurés : `check:porte-journal` n'est **dans aucun workflow ni aucun hook** ; `check:executabilite`, `schema:diff` et `check:schema-inventaire` sont en CI mais **absents de `pnpm verify`** ; `infra/scripts/empreinte-docker.sh` (392 l.) n'est câblé **nulle part** |
| E37 | Scoring intégralement spécifié             | partiellement amorcée | **APPORT L4, exactement la part que le fichier 07 confie à L4 : le contrôle BLOQUANT à l'import.** `packages/shared/src/banque-questions.ts` (1 275 l.) est le **seul** garde-fou de forme du JSONB `questions.scoring` : 11 types de réponse, barème refusé si le poids n'est pas > 0, **ancres de cotation 1/3/5 exigées sur toute échelle** (§32.4), drapeaux rouges. `analyserLigneBanque` rend **tous** les défauts d'une ligne et jamais le premier seulement — un rapport qui s'arrête à la première erreur fait recommencer l'opérateur autant de fois qu'il y a de fautes. Second défaut réel trouvé par les tests : `empreinteQuestion` **n'ordonnait pas `options`**, ce qui aurait fait **dériver la banque à chaque ré-import** ; corrigé par `ordonnerProfond` sur `options` **et** `scoring`. Barème, agrégation, complétude, divergence → **L8** |
| E42 | RGPD renforcé (pseudonymisation, rétention)| partiellement amorcée | **APPORT L2 (T4) : `activity_log` a une porte d'écriture UNIQUE, et c'est une propriété prouvée.** `domaines/journal/depot.ts` est le seul fichier du dépôt qui écrive dans la table, et il n'expose **qu'un `INSERT`** — ni `update`, ni `delete` : l'invariant 7 est tenu par **absence de surface**, pas par une contrainte SQL (`REVOKE UPDATE, DELETE` est du DDL, donc du fichier 04, et il est **porté à Williams**). `packages/shared/src/journal.ts` (500 l.) ferme le piège que personne ne voit : `meta` est du JSONB, il accepte tout, et **la redaction de pino ne protège rien sur un `INSERT`**. Deux ceintures : une **union discriminée par `action`** en `strictObject` (12 actions, une clé non prévue est *refusée*, pas ignorée) et un contrôle de **forme** indépendant du schéma — 64 caractères maximum (couvre un UUID, exclut un JWT), motif `[A-Za-z0-9_.:/-]`, profondeur 3, 32 éléments. Une `meta` refusée est remplacée par `META_REFUSEE` **mais la ligne est écrite quand même** : perdre l'événement entier est exactement ce qu'un attaquant chercherait à provoquer. **11 tests d'intégration** (`l2-journal`), dont la « pureté d'`activity_log` » que la note L2 §5 promettait et que personne n'avait écrite. ⚠️ **Le garde-fou de cette propriété, `scripts/check-porte-journal.mjs` (268 l.), n'est câblé NI en CI NI dans le hook de pré-commit** : rien ne le déclenche sur une *pull request* (§I.2). Rétention 12 mois et anonymisation à 90 j = **un job, pas une colonne** : non livré · pseudonymisation 2 passes → L11 |
| E43 | Exécutabilité autopilote                   | partiellement amorcée | **Les conventions d'API du 11 §3 cessent d'être un texte.** `errors.ts` porte 17 `ERROR_CODES` et leur table de statuts — aucun littéral libre ; la locale française de Zod est appliquée **idempotemment** ; le gestionnaire d'erreurs rend les **chemins** fautifs et jamais les valeurs. Keyset : le contrat de fil vit dans `packages/shared/src/pagination.ts` (30 l., importable par le navigateur) et sa moitié serveur dans `apps/api/src/http/pagination.ts` (287 l.) — curseur **composite** parce qu'un tri sur `created_at` seul n'a pas d'ordre total et ferait sauter ou répéter des lignes, c'est-à-dire le défaut même qu'on reproche au décalage. **APPORT L0-c** : `scripts/check-executabilite-scripts.mjs` — les **seize** scripts du dépôt étaient enregistrés en mode `100644` (le dépôt se développe sous Windows, où le bit d'exécution n'existe pas) : **aucun clone Linux ne pouvait en exécuter un seul**, et cela touchait `sauvegarde.sh` et `backup-postgres.sh`. ⚠️ Ce garde-fou est **le seul du dépôt sans aucune ligne de traçabilité** (§B.11.6) |
| E45 | Pilotage humain (habilitation, cockpit)    | partiellement amorcée | ⚠️ **RECUL PAR RAPPORT À CE QUI ÉTAIT PROMIS — voir la ligne E45 du tableau §A, reprise en place.** L2 devait livrer le refus serveur d'affectation si `habilitated_at` est NULL ; **il a livré la lecture et pas le refus**. Le socle cite pourtant E45 dans deux en-têtes (`auth/depot.ts`, `auth/politique.ts`) et `check:tracabilite` les accepte — c'est **exactement l'angle mort n° 1 que ce garde-fou déclare lui-même** : il juge la cohérence d'une glose, jamais la réalité d'un comportement (§I.5) |
| E47 | Profondeur fonctionnelle + conventions     | partiellement amorcée | **Le format d'import de la banque (§36.4) est livré et éprouvé** — c'est nommément l'un des objets d'E47 au fichier 08 (« format d'import de la banque, contrôle des ancres »). Gouvernance : `check:decisions` sur **94 entrées**, toutes au format 11 §9bis. Et **le sens 2 de la présente matrice est mécanisé pour la première fois** : `scripts/check-tracabilite-exigences.mjs` (404 l.) refuse un numéro d'exigence inexistant (C1) et une **glose** qui ne partage aucun mot avec le libellé officiel (C2). Il est né d'un défaut réel : **25 fichiers du socle d'authentification citaient `E5 (RBAC serveur systématique)`** — E5 désigne « scoring par unité, heatmap ». La matrice aurait validé un socle d'autorisation contre une carte de chaleur. Export ZIP §36.3 → L7-min |

### A.quinquies bis — Synthèse chiffrée au 2026-08-31

| État                    | Nombre | Écart depuis le 2026-08-28 |
| ----------------------- | ------ | -------------------------- |
| `couverte`              | **1**  | **+1** — E21, et c'est la première du projet |
| `partiellement amorcée` | **44** | −1 (E21 en sort) |
| `non commencée`         | **2**  | inchangé — E22 (console 7 espaces), E23 (novice < 30 min) |

**Une seule exigence passe à `couverte` en trois lots, et ce chiffre est le bon.** Il serait facile
d'en annoncer quatre ou cinq : E10 a son import, E42 sa porte d'écriture, E37 son contrôle bloquant,
E33 son socle d'authentification. Aucune ne tient l'énoncé complet de son libellé — E10 n'a pas de
back-office, E42 n'a **pas** de job de rétention, E37 n'a ni barème ni agrégation, E33 n'a ni
chiffrement local ni purges ni authentification de console. Le vocabulaire de ce fichier n'a que trois
valeurs **précisément pour rendre cette inflation impossible**. E21 passe parce que son libellé — « RBAC
routes + colonnes, testé » — est intégralement satisfait et éprouvé, pas parce qu'elle a beaucoup avancé.

**Ce que la ligne L2 du fichier 07 exigeait et qui n'est PAS livré**, dit ici plutôt que découvert à la
porte : le **CRUD users** (tâche T3) avec le garde-fou de réinitialisation §9.7 et la règle
d'affectation §34.4. Le fichier 07 en fait un critère d'acceptation du lot (« reset refusé si outbox
non vide signalé »). **La porte P-B ne peut pas cocher ce critère.**

---

# B. SENS 2 — CODE → EXIGENCES (le contrôle anti-orphelin)

**Périmètre du contrôle : les 161 fichiers suivis par git au commit `ce5b912`** (`git ls-files`).
Méthode : inventaire par groupe, rattachement de chaque groupe à une exigence E1-E47 ou à une
fiche `AMELIORATIONS.md`. Le dépôt porte des annotations `// Traçabilité : E__` en tête de fichier
— **elles ont été relues, pas prises pour argent comptant** : chacune a été confrontée à la
section du pack qu'elle invoque.

## B.1 — Inventaire du lot L0 (2026-08-27)

| # fichiers | Groupe livré                        | Rattachement                       | Preuve / emplacement                                                                                  |
| ---------- | ----------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 23         | Configuration racine du monorepo    | **E17, E43**                       | `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `eslint.config.js`, `.prettier*`, `.npmrc`, `.nvmrc`, `.editorconfig`, `.gitattributes`, `.dockerignore`, `.lintstagedrc.json`, `vitest.config.ts` — 11 §1 (versions épinglées) |
| —          | `.gitleaks.toml`, `.env.example`    | **E33** (02 §30.4-1/5)             | 12/12 familles de secrets §30.3 vérifiées présentes dans `.env.example`                                |
| —          | `CLAUDE.md`, `README.md`, `.husky/` | **E43, E47**                       | 11 §9bis · 09 §5                                                                                       |
| 15         | `docs/` — le pack + gouvernance     | **source, non code**               | 12 fichiers scellés (`pnpm check:pack` vert) + `ETAT.md`, `journal/`, `portes/`, `conception/`         |
| 41         | `.claude/agents/` (40 gabarits + README) | **E43** (09 §1, chaîne de signature) | Outillage d'autopilote ; périmètres d'écriture contractuels → **fiche A-001** `AMELIORATIONS.md`   |
| 12         | `apps/api` (Fastify)                | **E17, E33, E35, E42, E43**        | voir détail B.2                                                                                        |
| 6          | `apps/worker` (BullMQ)              | **E17, E35**                       | voir détail B.3                                                                                        |
| 8          | `apps/field` (coquille Vite/React)  | **E17** (amorce E6)                | `App.tsx` 50 l., zéro logique métier — écrans réels = L5, explicitement refusés ici                    |
| 8          | `apps/hq` (coquille Vite/React)     | **E17, E22**                       | `App.tsx` 50 l., base publique `/hq/` (11 §2 : pas de CORS)                                            |
| 8          | `packages/shared`                   | **E32, E33, E43**                  | `errors.ts` (ERROR_CODES, 11 §3) · `pagination.ts` (keyset, 11 §3) · `temps.ts` (UTC, E32) · `env.ts` (Zod) |
| 7          | `packages/ui`                       | **E27, E44** + invariant 4         | `tokens.ts`/`tokens.css` · `tokens.test.ts` = **91 tests verts**                                       |
| 16         | `infra/`                            | **E17, E33, E35**                  | voir détail B.4                                                                                        |
| 13         | `.github/`                          | **E33, E36, E43**                  | voir détail B.5                                                                                        |
| 4          | `scripts/`                          | **E31, E36, E43, E47**             | voir détail B.6                                                                                        |

## B.2 — Détail : les 2 routes livrées (contrôle 11 §8.6)

| Route              | Rattachement            | Documentée ? (11 §8.6)                                                                | Verdict      |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- | ------------ |
| `GET /v1/health`   | **E17, E35** · 02 §30.6 (« smoke tests : santé API ») | OUI — `DECISIONS.md` 2026-08-27 « Squelette applicatif minimal » **et** `apps/api/README.md` | **rattachée** |
| `GET /v1/health/ready` | **E17, E35** · sonde de préparation Compose | OUI — `apps/api/README.md` (503 si dépendance manquante). *Non nommée dans l'entrée DECISIONS, qui ne cite que `/v1/health`* | **rattachée** (remarque §D.5) |

Aucune de ces deux routes n'est listée aux §8/§24.2 du pack — **c'est licite** : 11 §8.6 interdit
de créer une route non listée « **sans la documenter** », pas de la créer. Les deux le sont.
Fichiers : `apps/api/src/routes/sante.ts`, `app.ts`, `server.ts`, `config.ts`, `db.ts`, `erreurs.ts`,
`logger.ts`. **`db.ts` a été relu spécifiquement** : il ne déclare aucun schéma (11 §2 — le DDL vit
exclusivement au fichier 04) ; il n'empiète donc pas sur L1.

## B.3 — Détail : les 6 files BullMQ déclarées (`apps/worker/src/worker.ts`)

> ### ⚠️ RECTIFICATION DU 2026-08-28 — LES NOMS DE CE TABLEAU SONT MORTS. NE LES RECOPIEZ PAS.
>
> **Ce tableau est conservé tel qu'il a été écrit au L0** (ce fichier ne se réécrit pas en silence),
> **mais les identifiants qu'il porte ne sont plus valides.** Ils sont remplacés par ceux du tableau
> suivant, et le fichier qui fait foi est `apps/worker/src/files.ts`.
>
> **Pourquoi, et non pas seulement quoi** — sans le motif, un lecteur suppose une préférence de style
> et « corrige » en sens inverse. **BullMQ 5 refuse au constructeur tout nom de file contenant `:`**
> (`classes/queue-base.js` : `if (name.includes(':')) throw new Error('Queue name cannot contain :')`),
> parce qu'il s'en sert **lui-même** comme séparateur de clé Redis. Les noms `axion:rapports`… faisaient
> donc échouer le **premier** `new Queue()` du module : **le worker n'a JAMAIS démarré, ni en
> développement, ni en staging, depuis le lot L0** — et sa sonde `pgrep -f node` le déclarait sain.
>
> **Le cloisonnement, lui, est intact.** Il est porté par l'option `prefix: 'axion'`, et les clés
> Redis produites sont **exactement** celles que l'ancien nommage visait : `axion:rapports:…`.
> *Le cloisonnement était le besoin, le nom n'était que le moyen — on garde le besoin, on change le moyen.*
>
> **Un agent de lot L7, L10, L11 ou L13 qui vient chercher SA file ici doit lire le tableau ci-dessous,
> pas celui du L0.** Reprendre `axion:rapports` referait la panne à l'identique.
>
> | File (**nom réel**, `NOMS_DE_FILES`) | Clés Redis produites | Rattachement | Lot |
> | --- | --- | --- | --- |
> | **`rapports`** | `axion:rapports:…` | **E15** — génération DOCX | L10 |
> | **`llm`** | `axion:llm:…` | **E16** — appels LLM par bloc, journal des coûts | L11 |
> | **`exports`** | `axion:exports:…` | **E47** — export de mission §36.3 | L7-min |
> | **`purges`** | `axion:purges:…` | **E42** — rétentions RGPD, 06 §10.4 | — (planifié) |
> | **`webhooks`** | `axion:webhooks:…` | **E18** — console axion-ia.com, HMAC + anti-rejeu | L13 |
>
> **Les rattachements du tableau d'origine restent valides** : seul l'identifiant change, jamais
> l'exigence. **Les mentions d'`axion:sauvegardes` ci-dessous ne sont PAS concernées** : elles racontent
> le retrait d'un code orphelin, et ce récit doit rester lisible tel quel.
> **Gardé par un test** : `apps/worker/tests/l0-files-bullmq.integration.test.ts`, 4 tests `@critique`,
> dont un **test d'ancrage** qui vérifie que BullMQ **lève toujours** sur un nom fautif — sans lui, les
> trois autres prouveraient que nos noms passent, pas que le garde-fou vit. **Exécutés par moi : verts.**

Aucune n'a de processeur : le worker journalise « Aucun traitement pour… ». **Ce ne sont pas des
jobs livrés, ce sont des noms réservés.** Contrôlées une par une :

| File                 | Rattachement invoqué      | Vérification du gardien                                                                     | Verdict          |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| `axion:rapports`     | L10 — génération DOCX     | 07 §12 Phase 2 confirme L10 · **E15**                                                          | rattachée        |
| `axion:llm`          | L11 — appels LLM par bloc | 07 §12 Phase 2 confirme L11 · **E16**                                                          | rattachée        |
| `axion:exports`      | L7 — export §36.3         | 07 §12 lot L7-min confirme · **E47**                                                           | rattachée        |
| `axion:purges`       | 06 §10.4 — purges         | Vérifié dans `docs/06` : « purges = jobs planifiés + journalisés » · **E42**                   | rattachée        |
| `axion:webhooks`     | L13 — webhooks console    | 07 §12 Phase 2 confirme L13 · **E18**                                                          | rattachée        |
| `axion:sauvegardes`  | « 02 §11.4 — sauvegardes MinIO pilotées depuis l'application » | **La référence ne tient pas.** Le §11.4 lu intégralement décrit pgBackRest, WAL, copie chiffrée et test de restauration nocturne — **du cron et des scripts d'infra, jamais un job applicatif**. La ligne L0 du fichier 07 confie d'ailleurs ces sauvegardes à `mc mirror`, livré en `infra/scripts/backup-minio.sh`. Aucun lot du pack ne prévoit une sauvegarde pilotée par l'application. | **RATTACHEMENT NON ÉTABLI** → §D.2 |

## B.4 — Détail : `infra/` (16 fichiers)

Chaque fichier porte en tête la ou les sections du pack qu'il exécute ; toutes ont été vérifiées
comme existantes et pertinentes.

| Fichier                          | Sections invoquées         | Rattachement    |
| -------------------------------- | -------------------------- | --------------- |
| `docker-compose.yml`             | 02 §4.1, §4.2, §30.2, 06 §10.3 | **E17**     |
| `docker-compose.staging.yml`     | 02 §11.2, §30.4, §30.6     | **E17, E33**    |
| `docker-compose.prod.yml`        | 02 §30.6, §30.4, §11.2     | **E17, E33**    |
| `caddy/Caddyfile`                | 02 §11.2, §11.3, 06 §10.2, 11 §2 (pas de CORS) | **E17, E33** |
| `postgres/Dockerfile`            | 02 §11.4                   | **E35**         |
| `pgbackrest/pgbackrest.conf`     | 02 §11.4, §30.4            | **E35, E33**    |
| `scripts/backup-postgres.sh`     | 02 §11.4, §11.3, §30.4     | **E35**         |
| `scripts/backup-minio.sh`        | 02 §11.4, §30.4            | **E35**         |
| `scripts/restore-test.sh`        | 02 §11.4, §11.3, §30.4     | **E35** — porte le critère L0 « restauration Postgres ET MinIO » |
| `scripts/install-cron.sh`        | 02 §11.4                   | **E35**         |
| `scripts/provision-vps.sh`       | 06 §10.3, 02 §30.4, §11.4  | **E33, E35**    |
| `scripts/deploy.sh`              | 02 §30.6, §11.2, §11.3     | **E17, E36**    |
| `scripts/smoke-test.sh`          | 02 §30.6                   | **E36** — étape « login » du §30.6 explicitement reportée à L2 (TODO tracé, §D.4) |
| `scripts/lib/common.sh`          | 02 §11.3, §30.4, §30.6     | **E35, E43**    |
| `README.md`                      | runbook §30.4-2, PRA §11.4 | **E35, E43**    |

## B.5 — Détail : `.github/` (13 fichiers)

| Fichier                          | Rattachement                          | Vérification                                                     |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `workflows/ci.yml`               | **E36, E43** · 02 §30.5               | 8 jobs, chaîne `lint→typecheck→unit→integration→e2e→schema-diff→build→deploy-staging` |
| `workflows/build-images.yml`     | **E17, E36** · 02 §30.5 (GHCR)        | 4 images                                                           |
| `workflows/deploy-staging.yml`   | **E36** · critère L0 « déploiement staging par la CI OK » | `workflow_call` depuis `ci.yml`, environment `staging` |
| `workflows/deploy-prod.yml`      | **E36** · 02 §30.5 (approbation)      | tag `v*`                                                           |
| `workflows/nightly-restore-test.yml` | **E35** · 02 §11.4 (« test nocturne ») | cron `0 3 * * *`                                              |
| `workflows/zap-baseline.yml`     | **E33** · 07 §13 (« ZAP baseline en CI ») | rattachée                                                      |
| `coverage-critical-paths.json` + `scripts/check-coverage.mjs` | **E36, E43** · DoD 09 §3 | 7 modules critiques déclarés `non livré` avec leur lot — dispositif exemplaire, voir §C |
| `actions/setup-node-pnpm/`, `CODEOWNERS`, `dependabot.yml`, `pull_request_template.md` | **E36, E43** · 02 §30.5 | Dependabot configuré ET désactivé (11 §1) |

## B.6 — Détail : `scripts/` (4 garde-fous)

| Script                       | Rattachement          | Preuve d'exécution (2026-08-27)                                              |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `check-invariants.mjs`       | **E31, E27/E44, E43** | `pnpm check:invariants` → **vert**, 63 fichiers, 8 contrôles (INV-1/2/4, CT-2-NEXT, CT-2-PRISMA, CT-1-CDN, SEC-30.4a/b) — et il déclare lui-même les 5 invariants NON mécanisables |
| `check-no-skipped-tests.mjs` | **E36, E43** · 11 §2  | `pnpm check:no-skipped-tests` → **vert**, 1 fichier de test analysé, liste d'exceptions vide |
| `check-pack-integrity.mjs`   | **E36, E43, E47**     | `pnpm check:pack` → **vert**, 12/12 · rattaché à `AMELIORATIONS.md` étage 1 (~0,1 j) |
| `schema-diff.mjs`            | **E17, E36, E43**     | `pnpm schema:diff` → « NON APPLICABLE — le lot L1 n'est pas livré », auto-désactivation qui **disparaît dès que `apps/api/drizzle/` existe**. Rien n'est déclaré conforme. |

## B.7 — VERDICT ANTI-ORPHELIN DU LOT L0 (1ʳᵉ passe, `ce5b912`)

**Code orphelin : 1 élément.** Le nom de file `axion:sauvegardes` (§B.3) invoque une section du pack
qui ne le porte pas. Tout le reste des 161 fichiers se rattache à une exigence E1-E47 vérifiée, ou
à la fiche A-001 d'`AMELIORATIONS.md`.

**→ RÉSOLU en 2ᵉ passe** : la file a été **supprimée**. Vérifié : `NOMS_DE_FILES` n'en compte plus
que 5 (`rapports`, `llm`, `exports`, `purges`, `webhooks`), toutes rattachées. Le commentaire
expliquant le retrait est resté dans le code — la leçon vaut au-delà de cette ligne.

C'est un résultat solide : le dépôt a été construit avec la traçabilité en tête et non reconstituée
après coup. La discipline à tenir aux lots suivants est de **ne jamais laisser une annotation
`// Traçabilité : E__` tenir lieu de preuve** — l'annotation dit où l'auteur croyait rattacher son
code ; le gardien vérifie que la section citée dit bien ce qu'on lui fait dire.

## B.8 — Inventaire du code NOUVEAU (2ᵉ passe, `ce5b912` → `fdd5f59`)

**175 fichiers suivis** (+14). Méthode inchangée : pour chaque artefact, **la section citée a été
ouverte** et confrontée à ce qu'on lui fait dire.

| Artefact nouveau | Rattachement | Vérification du gardien (section ouverte) | Verdict |
| --- | --- | --- | --- |
| `packages/shared/src/redaction.ts` | **E33, E42** · 06 §10.4 · 11 §2 | **06 §10.4 ouvert** : base légale, minimisation, pseudonymisation 2 passes — soutient la politique. **Et le module est réellement CÂBLÉ** : importé par `apps/api/src/logger.ts` **et** `apps/worker/src/worker.ts`, exporté par `shared/index.ts`. Il supprime une duplication où les deux listes pouvaient diverger | **rattaché** |
| `e2e/socle.e2e.ts` + `playwright.config.ts` | **E36, E43** · DoD « tous les tests verts » · amorce E6/E17 | **8 tests exécutés par moi, verts.** Ils ne sont pas décoratifs : ils vérifient à l'exécution l'**invariant 4** (tokens, aucune couleur en dur), l'**invariant 5** (français), et **11 §1/§2** (« ne contacte AUCUN domaine extérieur ») — ce qu'aucun contrôle statique ne peut prouver. `forbidOnly` en CI empêche qu'un `.only` oublié verdisse la suite | **rattaché** |
| `scripts/check-jonction.mjs` | **E36, E43** · 02 §30.4-1 · fiche `AMELIORATIONS.md` étage 1 | Fiche présente, plafond respecté (**~0,3 j / 0,5 j**). **Éprouvé par moi** : variable fantôme injectée dans un clone → **RC=1** avec le bon message | **rattaché** |
| `scripts/check-test-projects.mjs` | **E36, E43** · 09 §5.7 · 07 §13 | **Éprouvé par moi** : `apps/api/drizzle/` créé dans un clone → **RC=1**, et le message énumère les tests du 07 §13 attendus. La péremption de `--passWithNoTests` est **réelle**, pas déclarée | **rattaché** |
| `apps/api/scripts/{migrations,seed,db-generate}.mjs` | **E17, E36, E43** · 11 §5 · 02 §30.6 | Vérifié qu'il s'agit de **souches auto-périmées**, non d'une implémentation L1 : `exit 0` + « SANS OBJET » tant que L1 n'est pas livré, `exit 1` ensuite. **Aucun empiètement sur le périmètre d'A12** | **rattaché** |
| `infra/scripts/backup-caddy.sh` | **E35** · 02 §11.4 | Attention : c'est la section qui avait fait tomber `axion:sauvegardes`. **Ouverte à nouveau** — elle tient ici, car il s'agit d'un **script d'infrastructure** (comme `backup-minio.sh`), pas d'un job applicatif. Arbitré en propre dans `DECISIONS.md` (« un PRA qui dépend d'un quota Let's Encrypt n'est pas un PRA ») | **rattaché** |
| `infra/caddy/fronts.static.caddy` | **E17, E6** · invariant 1 · 05 §31 | **05 §31 ouvert** : règle 1 (mise à jour applicative, service worker) — la maîtrise du `Cache-Control` de `sw.js` en dépend réellement. Arbitré dans `DECISIONS.md` « Comment les fronts sont servis en production (défaut B-7) », entrée **vérifiée présente** | **rattaché** |
| `infra/caddy/fronts.dev.caddy` | **E17** (sœur du précédent) | Rattachement évident par construction, mais **seul fichier du dépôt sans aucune annotation ni référence de section** (§D.5) | **rattaché** (remarque) |
| Volumes `field_dist`, `hq_dist` (+ `staging_*_dist`) | **E17, E6** | **4 racines distinctes** montées `:ro` dans Caddy ; la bascule `CADDY_FRONT_CONFIG` est **imposée en dur** en prod (l. 147), non lue du `.env` — un staging ne peut pas servir la prod | **rattachés** |

**Code orphelin en 2ᵉ passe : aucun.**

---

# B.9 — INVENTAIRE DU LOT L1 (`8be778b^` → `bf7f6ca`)

**Périmètre du contrôle : les 45 fichiers de `git diff --name-only 8be778b^ HEAD`**, et surtout les
**43 tables** que ces fichiers créent. Méthode inchangée depuis le L0 : **l'annotation ne vaut pas
preuve** ; pour chaque artefact, la section du pack invoquée est ouverte et confrontée à ce qu'on lui
fait dire.

**Rappel de la règle qu'on applique ici (09 §3.6) :** _toute route, table, écran ou job livré se
rattache à une exigence E1-E47 OU à une fiche `AMELIORATIONS.md` — le code orphelin est REFUSÉ._

## B.9.1 — LES 43 TABLES, UNE PAR UNE

Rattachement établi **contre le texte du fichier 04 §7** (commentaires de section et de colonne) et
contre le fichier 08 (définition de l'exigence), jamais contre le commentaire de la migration.

| # | Table | Rattachement | Ce qui l'établit (04 §7 / 08) |
| --- | --- | --- | --- |
| 1 | `users` | **E45**, E33, E24 | `habilitated_at` « V2.5 §34.4 » écrit dans le 04 ; `password_hash` (§10) ; `usage_profile` « §19.1 » |
| 2 | `refresh_tokens` | **E33** | 06 §10.1 — rotation 30 j et détection de réutilisation ; `idx_refresh_tokens_user_id` motivé au manifeste par la révocation de famille |
| 3 | `sectors` | **E3** | 08 : E3 → §2.3, §21.2 |
| 4 | `services` | **E1**, E5 | 04 : « les 11 fonctions métier de la taxonomie » ; 08 : E1 → §2.1 |
| 5 | `interlocutor_profiles` | **E14**, E12 | 04 : « V2.2 §32.1 : **base du calcul de divergence direction/terrain** » — la raison d'être de `group_code` |
| 6 | `size_tiers` | **E2** | 04 : « micro, pme, eti, grand_compte » ; 08 : E2 → §2.3, §21 |
| 7 | `naf_sector_map` | **E3** | 04 : « R4 : pré-remplissage secteur » |
| 8 | `companies` | **E19**, E18 | 04 : `external_ref` = « id client console axion-ia.com » (E18) ; `siren` = « clé de dédup R3 » |
| 9 | `missions` | **E8**, E30, E32, E39, E41 | 04 : `audit_level` « §20.1 » (E30) ; `timezone` « §22.2 » (E32) ; `parent_mission_id` « consolidation groupe → missions filles (§32.3) » (E41) |
| 10 | `mission_users` | **E9**, E45 | 08 : E9 → §18.2 ; `role_on_mission='lead'` → §34.1 |
| 11 | `org_units` | **E4**, E5 | 04 : section « ORGANISATION (§16.2, §25.3, §26.3, R6) » ; 08 : E4 → §16.2 |
| 12 | `blocks` | **E1**, E34 | 04 : « seed : 9 blocs (§2.1) » ; le bloc 9 est celui de l'AI Act (08 : E34 → bloc 9) |
| 13 | `questions` | **E10**, E37, E40 | 04 : « identifiant STABLE de banque (clé de l'import/ré-import §36.4) » ; `scoring` JSONB → 04 §7.3 (E37) |
| 14 | `question_translations` | **E32** | 08 : E32 → interface et langues (§22.2). Table marquée « V2 » au 04 : le DDL est livré, l'usage est L20 |
| 15 | `mission_questions` | **E11** | 08 : E11 → M2 « figé par mission » ; `text_snapshot` NOT NULL matérialise le figeage |
| 16 | `interviews` | **E12**, E13, E6 | 04 : section « COLLECTE — SESSIONS (§27.1, §25.2, §25.6, §28.1) » ; « UUID v7 CÔTÉ CLIENT » |
| 17 | `answers` | **E13**, E6, E7 | 04 : « UUID v7 CÔTÉ CLIENT (**clé d'idempotence**) » |
| 18 | `answer_revisions` | **E7**, E9 | 04, en toutes lettres : « V2.2 : **traçabilité §9.3/§9.9** » — §9.3 = E7, §9.9 = E9. Porte aussi l'**invariant 7** (jamais d'écrasement silencieux), qui n'est pas une exigence E mais un invariant du 00_INDEX |
| 19 | `attachments` | **E13**, E6, E42 | 04 : `kind='note'` « P1-5 » ; `purge_after DATE NULL` « RGPD (audio) » → E42 |
| 20 | `tools_inventory` | **E28** | 04 : section « INVENTAIRES & AI ACT (§27.3, bloc 9) » ; 08 : E28 → §20.5 |
| 21 | `ai_systems` | **E34** | 04 : même section, bloc 9 ; 08 : E34 → registre des usages IA |
| 22 | `block_scores` | **E37**, E14 | 04 : section « ANALYSE, SCORING & CONSTATS (**§32.1**, §16.4, §16.5) » ; 08 : E37 → §32.1 |
| 23 | `unit_scores` | **E5**, E37 | 08 : E5 → §16.3, **§16.4** (« scoring par unité ») |
| 24 | `findings` | **E14** | 04 : `sources` « **V2.2 §27.2** : ≥ 1 source obligatoire » ; 08 : E14 → M5 |
| 25 | `use_cases` | **E28**, E40 | 04 : `baseline_*` « §28.1-1 », `gain_low/gain_high/payback_months` « §28.2-5 » → E40 (ROI normé §32.4) |
| 26 | `roadmap_items` | **E29** | 04 : section « CAS D'USAGE & FEUILLE DE ROUTE (**§20.3**, §28) » ; 08 : E29 → §20.3 |
| 27 | `report_sections` | **E15**, E16 | 08 : E15 → M6 ; états brut/généré/validé → E16 (M6.3) |
| 28 | `report_templates` | **E15**, E30 | `kind` = gabarit par **niveau d'audit** (§26.2) → E30 |
| 29 | `report_files` | **E15** | 08 : E15 → M6, §26.1 (DOCX puis PDF) |
| 30 | `scoping_estimates` | **E19** | 04 : section « CADRAGE, CHIFFRAGE & PILOTAGE (**§18**, §24.1, §25.1) » ; 08 : E19 → §18.1 |
| 31 | `scoping_financials` | **E21** | 08 : E21 → §18.1.4 « jamais accès aux devis/montants ». **Invariant 3** : routes admin exclusivement (L2) |
| 32 | `estimation_params` | **E19**, E43 | 08 : E19 (simulateur) ; 11 §5 réserve la validation des valeurs à Williams → E43 |
| 33 | `work_assignments` | **E9**, E45 | 08 : E9 → §18.2 « répartition par unités » ; §34 plan de charge |
| 34 | `mission_rebaselines` | **E20** | 04 : « **§25.1** (Phase 2 ; processus manuel mission 1 : voir 07 §15) » ; 08 : E20 → §18.3 |
| 35 | `document_requests` | **E25** | 08 : E25 → §17.3, §16.6 « zéro oubli » ; 07 §12 lot **L13bis** confirme la table |
| 36 | `step_validations` | **E24** | 04 : « V2.2 **§32.2** : énumération fermée (P1-1) » ; 08 : E24 → §19.1 |
| 37 | `alerts` | **E26** | 04 : « **P1-2 §20.4** » ; 08 : E26 → §20.4 (centre d'alertes) |
| 38 | `processed_ops` | **E43**, E7 | 04 : « V2.3 : déduplication du push (**§9.2** « op_id déjà vu → ignoré ») » ; 08 : E43 cite explicitement « contrat d'ops + **processed_ops** » |
| 39 | `sync_log` | **E7**, E38 | 04 : `outbox_remaining` « LA donnée du garde-fou reset mot de passe **§9.7** » ; 08 : E38 → §9.7 |
| 40 | `integration_events` | **E18** | 07 §12 lot L13 « webhooks entrant/sortant + anti-rejeu, `integration_events` » ; 08 : E18 → M8 |
| 41 | `activity_log` | **E42** | 08 : E42 → §10.4, qui nomme la **« rétention `activity_log` »** |
| 42 | `llm_calls` | **E16** | 08 : E16 → M6.3 « **coûts tracés** » |
| 43 | `app_settings` | **E33**, E43 | 04 : « seuils, purges, URLs console, **secrets chiffrés (AES via APP_ENCRYPTION_KEY)** » → E33 |

**43 tables livrées · 43 rattachées · 0 orpheline.**

**Ce que j'ai cherché et n'ai PAS trouvé — et c'est la moitié du contrôle.** Le fichier 04 §7 décrit
**46** tables. Trois — `surveys`, `survey_responses`, `solutions_catalog` — ne sont **pas** créées.
Le 04 les range lui-même sous « **PHASE 2/3 (DDL de référence — créées par les migrations de leurs
lots)** », le manifeste les déclare en `perimetre.tablesIgnorees`, et un arbitrage nominatif existe
en `DECISIONS.md` (« Les tables de Phase 2/3 ne sont PAS créées au lot L1 »). **Vérifié en base :
elles sont absentes.** C'est une omission **délibérée, tracée et cohérente** — pas un oubli.
`schema_migrations` (44ᵉ table) est le journal de l'exécuteur, absent du 04, déclaré hors périmètre
au manifeste : rattaché à **E43** (11 §5, migrations versionnées).

## B.9.2 — LE SEED : LES HUIT LIVRABLES QUE LE FICHIER 07 EXIGE NOMMÉMENT

Contrôlés par moi sur une base **créée pour l'occasion** (`a02_crit`), migrée puis seedée — pas sur
la base de développement, et pas sur la foi de la sortie du script.

| Exigé par la ligne L1 du 07 | Constaté en base | Rattachement |
| --- | --- | --- |
| **9 blocs** | `bloc_1 … bloc_9` | E1, E34 |
| **secteurs** | 8 lignes | E3 |
| **11 fonctions** | `services` = 11 | E1 |
| **profils avec `group_code`** | 9 profils, **tous** pourvus : `dirigeant/daf/drh/dsi=direction`, `chef_equipe/resp_metier=encadrement`, `salarie/technicien_operateur/autre=terrain` | E14 |
| **paliers** | 4, bornes comprises : `micro[1-10]`, `pme[11-249]`, `eti[250-4999]`, `grand_compte[5000-∞]` | E2 |
| **`estimation_params` normées** | 29 clés | E19, E40 |
| **`naf_sector_map`** | 88 lignes | E3 |
| **compte admin fondateur avec `habilitated_at` posé** | `role=admin`, `habilitated_at=2026-08-27 20:47:13+00`, `is_active=true`, `usage_profile=guide_strict` | **E45** — anti auto-verrouillage §34.4 |

## B.9.3 — LES AUTRES ARTEFACTS DU LOT

| Artefact | Rattachement | Vérification du gardien |
| --- | --- | --- |
| **12 migrations** `apps/api/drizzle/0001…0012` | **E17, E43** · 11 §2 (« le fichier 04 se transcrit LITTÉRALEMENT en migrations SQL ») | Chaîne **exécutée par moi** sur base neuve : up 12 → 44 tables · `--down-to 0` → 12 annulées, **1 seule table restante** (le journal), **0 séquence, 0 fonction, 0 type** orphelins · up → 44 et `schema:diff` **ZÉRO ÉCART**. La descente est prouvée, pas supposée |
| `apps/api/schema-manifest.json` (2 962 l.) | **E36, E43** · **11 §7** qui le nomme comme base de comparaison | Le 11 §7 **ouvert** : il borne le diff aux tables/colonnes/PK-FK-UNIQUE-CHECK/index §7.1 — le manifeste ne s'arroge rien de plus, et déclare son `horsPerimetreAssume` |
| `scripts/schema-diff.mjs` (886 l.) | **E36** · critère **n°7** du lot | **Éprouvé par moi : 30 mutations injectées en base, 30 détectées** (§F.0) |
| `scripts/check-schema-inventaire.mjs` (230 l.) | **E36** · fiche `AMELIORATIONS.md` étage 1 | **Second verrou, en liste NOIRE.** Éprouvé : il attrape les **4** familles que le diff laisse passer par construction (déclencheur, RLS, vue, IDENTITY). Le couple ne laisse rien passer sur 34 mutations |
| `apps/api/src/db/schema.ts` (1 023 l.) | **E17** · 11 §2 (« Drizzle ne sert QU'AUX requêtes typées ») | Relu : **aucun DDL**, aucune génération de schéma. Et il est enfin **confronté à la base** — voir la ligne suivante |
| `apps/api/tests/l1-schema-drizzle.integration.test.ts` | **E17, E36** | **Éprouvé par moi, 4 mutations, 4 détectées** : colonne fantôme, colonne retirée, `NOT NULL` relâché, table renommée. C'est le « troisième schéma » qui n'était gardé par rien avant la 3ᵉ passe |
| `apps/api/scripts/migrations.mjs` · `seed.mjs` · `db-generate.mjs` | **E43, E17** | Les souches auto-périmées du L0 sont devenues l'implémentation. `db-generate.mjs` refuse d'écrire une migration sans sentinelle `@DOWN` |
| `apps/api/tests/aide/{base-l1,specification-l1,fil-rouge}.ts` | **E36** · 09 §4bis (le générateur FIL-GC est « un outillage de test livré au L1 ») | Rattachement **explicitement prévu par le pack**. `base-l1.ts` fournit Testcontainers avec repli documenté ; `fil-rouge.ts` génère les deux missions canoniques |
| **6 autres suites d'intégration** (`l1-structure`, `l1-migrations`, `l1-seed`, `l1-contraintes`, `l1-schema-diff`, `l1-filrouge`) | **E36** · DoD « tous les tests verts » · 09 §5.6 (test ≠ auteur du code testé) | **66 tests exécutés par moi, verts.** `l1-schema-diff` est un **méta-test** : il vérifie que le comparateur détecte, ce qui est la seule façon de ne pas se fier à un « ZÉRO ÉCART » |
| `scripts/check-test-projects.mjs` (étendu) | **E36, E43** | Contrôles 3 et 4 ajoutés. **Éprouvé** : tag `@filrouge` retiré → RC=1 ; fichier supprimé → RC=1. **Mais la moitié « les DEUX missions » ne fait pas ce qu'elle annonce — voir F-2** |
| `scripts/check-invariants.mjs` (modifié) | **E31, E43** | **Voir F-1 : INV-2 n'est pas appliqué en CI.** C'est un écart, et il porte sur l'un des 8 invariants non négociables |
| `.github/workflows/ci.yml` (jobs `schema-diff`, `coverage`) | **E36** | Le job `coverage` **s'arme tout seul** : simulé par moi (fichier `apps/api/src/rbac/mod.ts` créé et indexé dans un clone) → la ceinture 2 sort en **échec** en nommant le module. La ligne de DoD « couverture » est donc réellement protégée, pas seulement reportée |
| `infra/COHABITATION_AXIONIA_WEB.md` | **E17, E35** | **Documentation, pas du code livré** (ni route, ni table, ni écran, ni job) : hors du champ strict de la règle anti-orphaine. Répond à une question de Williams sur l'hébergement du staging. **Seul fichier du lot sans annotation de traçabilité** — remarque §F.6, sans effet sur le verdict |
| `DECISIONS.md` (+20 entrées), `AMELIORATIONS.md`, `docs/ETAT.md`, `docs/journal/`, READMEs | **E43, E47** | `pnpm check:decisions` → **44 entrées, toutes au format**. `AMELIORATIONS.md` : compteur L1 à **~0,2 j / 0,5 j** — plafond étage 1 respecté |

**Routes livrées au L1 : AUCUNE.** Vérifié : `apps/api/src/routes/` ne contient que `sante.ts`, et
les deux seules routes du dépôt restent `/v1/health` et `/v1/health/ready` (rattachées au L0, §B.2).
**Écrans livrés : AUCUN. Jobs BullMQ livrés : AUCUN** (`apps/worker/src/worker.ts` n'est pas au
diff du lot). Il n'y a donc rien à contrôler au titre du 11 §8.6 pour ce lot.

## B.9.4 — VERDICT ANTI-ORPHELIN DU LOT L1

**Artefacts soumis à la règle : 43 tables + 0 route + 0 écran + 0 job = 43.**
**Rattachés : 43. Orphelins : 0.**

**Artefacts hors du champ strict de la règle mais inventoriés quand même** (12 migrations,
1 manifeste, 1 modèle Drizzle, 3 scripts d'exécution, 10 fichiers de test, 3 garde-fous,
1 document d'infrastructure, la gouvernance) : **tous rattachés**, aucun sans exigence ni fiche.

**Le contrôle a aussi porté dans l'autre sens** : trois tables du fichier 04 ne sont **pas** livrées,
et c'est délibéré, tracé et vérifié (§B.9.1). Un lot qui livre exactement ce qu'il annonce, ni plus
ni moins, est le cas rare — celui-ci en est un.

---

# B.10 — INVENTAIRE DU LOT L0-b (`47851fd..462ba70`)

**Périmètre du contrôle : les 31 fichiers de `git diff --name-status 47851fd..HEAD`** — **10 ajoutés**
(`A`) et **21 modifiés** (`M`). Méthode inchangée depuis le L0 : **l'annotation `// Traçabilité : E__`
ne vaut pas preuve** ; pour chaque artefact, la section invoquée est ouverte et confrontée à ce qu'on
lui fait dire, et l'artefact est confronté à son comportement réel quand il en a un.

> **Première remarque du gardien, et elle porte sur l'inventaire lui-même.** Le lot a été annoncé comme
> « une pile Compose, deux Dockerfiles nouveaux, trois scripts de contrôle, un module de sonde, deux
> fichiers de test, un workflow réécrit et un runbook » — **onze artefacts**. Recompté sur `git diff`,
> **il y en a vingt-quatre** (hors gouvernance et documentation). Quatre écarts précis :
> **(1)** un seul Dockerfile est **nouveau** (`infra/caddy/`) ; `infra/postgres/Dockerfile` est
> profondément **modifié**, ce qui n'est pas la même chose à relire ;
> **(2)** sur les « trois scripts de contrôle », **deux** sont des contrôles ; le troisième,
> `prepare-husky.mjs`, est un **correctif d'environnement de construction** — le ranger avec les
> garde-fous masque qu'il porte à lui seul la première des trois causes dormantes ;
> **(3)** il y a **deux** modules de source nouveaux, pas un : `sonde-sante.ts` **et** `files.ts` —
> et c'est `files.ts` qui porte le nommage des files, donc le défaut d'origine ;
> **(4)** il y a **trois** fichiers de test nouveaux, pas deux : `tests/aide/redis-ephemere.ts` fait
> **300 lignes** et fabrique les Redis jetables sans lesquels les onze tests ne prouveraient rien.
> **Un inventaire qui sous-compte de moitié n'est pas une faute de calcul : c'est la moitié du diff
> qui échappe au contrôle anti-orphelin.** D'où le tableau ci-dessous, établi sur `git`, pas sur le récit.

## B.10.1 — Les 10 artefacts AJOUTÉS

| Artefact nouveau | Rattachement | Vérification du gardien (section ouverte, comportement éprouvé) | Verdict |
| --- | --- | --- | --- |
| `infra/docker-compose.coolify.yml` (983 l.) | **E17** · **E33** (02 §30.4-4) · **E36** | 5ᵉ pile du dépôt. **02 §11 ouvert** : la terminaison TLS passe de notre Caddy au Traefik de l'hôte — c'est un **amendement**, et il est tracé (`DECISIONS.md` 2026-08-28, deux entrées). Ce qui motivait la règle — **domaine unique, aucun CORS** — est préservé, et je l'ai vérifié à l'exécution. Réseau `edge` déclaré `external` **à dessein** : une valeur erronée fait échouer le déploiement au lieu de le dégrader en silence | **rattaché** |
| `infra/caddy/Dockerfile` (71 l.) | **E17, E43** | Conséquence directe de la règle Coolify n°3 : la configuration **voyage dans l'image** parce que Coolify réécrit toute source relative et que **Docker crée alors un répertoire vide** à la place du fichier. J'ai retrouvé les traces de cette panne sur le serveur : `caddy/`, `infra/`, `postgres/`, `pgbackrest/` subsistent, **vides**, dans `/data/coolify/applications/<uuid>/` — vestiges des déploiements ratés, aujourd'hui sans effet | **rattaché** |
| `apps/worker/src/files.ts` (96 l.) | **E15, E16, E18, E42, E47** (les 5 files) · **E43** | Module **purement déclaratif** — et le commentaire explique pourquoi : l'importer depuis `worker.ts` ferait démarrer un worker complet **à chaque sonde**, soit un consommateur de plus toutes les 15 s qui volerait des jobs et mourrait. Le raisonnement tient. Porte la rectification des noms de files (§B.3) | **rattaché** |
| `apps/worker/src/sonde-sante.ts` (157 l.) | **E35** (exploitation) · **E43** | **Éprouvé par injection sur le staging, pas relu** : conteneur jetable issu de la même image, autre identité → **RC=1**, six anomalies nommées ; même conteneur, identité réelle → **RC=0**. Et le fichier **énonce ce qu'il ne prouve pas** (jobs traités, worker qui avance, état de Postgres/MinIO) : *« le dépôt préfère une garantie faible et énoncée à une garantie forte et fausse »* — c'est la phrase que le lot L0 aurait dû écrire | **rattaché** |
| `apps/worker/tests/aide/redis-ephemere.ts` (300 l.) | **E36, E43** | Outillage de test (Redis jetables via `@testcontainers/redis`). Non annoncé à l'inventaire du lot — **rattaché quand même**, et il le fallait : sans lui les 11 tests ne s'exécutent pas | **rattaché** |
| `apps/worker/tests/l0-files-bullmq.integration.test.ts` (168 l.) | **E36** · les 5 files | **4 tests `@critique` exécutés par moi, verts**, dont le **test d'ancrage** sur le refus de BullMQ | **rattaché** |
| `apps/worker/tests/l0-sonde-sante.integration.test.ts` (282 l.) | **E35, E36** | **7 tests `@critique` exécutés par moi, verts** — dont « une SEULE file sur cinq sans travailleur » et « une AUTRE instance en parfaite santé sur le même Redis », qui sont précisément les deux façons dont une sonde naïve rementirait | **rattaché** |
| `scripts/check-compose-coolify.mjs` (201 l.) | **E17, E36, E43** · fiche `AMELIORATIONS.md` étage 1 du 2026-08-28 | Fiche présente, plafond respecté (**~0,2 j / 0,5 j**, cumul L0-b). **5 injections par moi : 4 attrapées, 1 manquée** (§G.3) | **rattaché** |
| `scripts/check-isolation-reseau.mjs` (145 l.) | **E33** (invariant 3, 02 §30.4-4) · **E36** · même fiche | **02 §30.4-4 ouvert** : « un secret de staging ne doit RIEN pouvoir sur la production » — la section porte bien ce que le script lui fait dire. **3 injections par moi : 2 attrapées, 1 manquée** (§G.3) | **rattaché** |
| `scripts/prepare-husky.mjs` (78 l.) | **E43, E47** | Lève la 1ʳᵉ cause dormante : `NODE_ENV=production` posé par Coolify fait sauter à pnpm **toutes** les dépendances de développement — d'abord lu comme « husky manquant », c'était l'outillage de compilation entier. Remplace `"prepare": "husky"` dans `package.json`. **Ce n'est pas un garde-fou**, contrairement à ce que l'inventaire du lot laissait entendre | **rattaché** |

## B.10.2 — Les 14 artefacts MODIFIÉS relevant du contrôle (hors documentation)

| Artefact | Rattachement | Vérification | Verdict |
| --- | --- | --- | --- |
| `apps/api/Dockerfile` (+37) | **E43, E17** | **Le correctif le plus important du lot** : l'image embarque désormais `scripts/` et `drizzle/`. **Vérifié dans l'image en ligne**, pas dans le diff : `ls` dans le conteneur `api` du staging → 3 scripts, **12** migrations | **rattaché** |
| `apps/worker/Dockerfile` (+39) | **E35, E43** | `HEALTHCHECK` passé de `pgrep -f node` à `node dist/sonde-sante.js`. **Vérifié sur la machine** : `Healthcheck.Test = ["CMD","node","dist/sonde-sante.js"]`, `FailingStreak 0`, sorties de sonde lisibles dans `State.Health` | **rattaché** |
| `apps/field/Dockerfile`, `apps/hq/Dockerfile` (+16 ch.) | **E17, E6, E22** | Jobs ponctuels qui **déposent** leur build dans un volume servi par Caddy. Leur `Exited (0)` est donc **normal et voulu** — je l'ai confirmé par leurs journaux (« PWA terrain déposée dans /sortie », « Console siège déposée dans /sortie ») avant d'en conclure quoi que ce soit | **rattachés** |
| `infra/postgres/Dockerfile` (+75) | **E35, E17** | `postgresql.custom.conf` embarqué dans l'image (règle Coolify n°3). ⚠️ **L'image embarque la configuration d'archivage sans que le dépôt d'archives existe** — c'est la mécanique de §G.2 | **rattaché** (voir §G.2) |
| `apps/worker/src/worker.ts` (+90) | **E35, E43** | Battement toutes les 5 s, TTL 20 s, noms de files sans `:`. **Vérifié à l'exécution sur staging** : `Worker Axion Audit démarré`, et la sonde le voit | **rattaché** |
| `scripts/check-jonction.mjs` (+18) | **E36, E43** | Cesse de lire les lignes **entièrement commentées** comme du code. Le raisonnement est explicite et juste : *« un garde-fou qui prend la documentation pour du code punit ceux qui documentent »*. **Réexécuté par moi** : 41 scripts, 77 variables, 10 fichiers de CI, **RC=0** | **rattaché** |
| `.github/workflows/ci.yml` (+14) | **E36, E43** | Les deux nouveaux contrôles sont de **vraies étapes de CI** (`:198`, `:205`). **C'est la réserve F-1 du lot L1 qui ne se reproduit pas** — au L1 un garde-fou existait et ne tournait nulle part | **rattaché** |
| `.github/workflows/deploy-staging.yml` (+468) | **E36** · critère L0 n°4 | Réécrit pour Coolify. **Non exécutable à ce jour, et l'explication est vérifiable** : `git ls-tree origin/main` ne compte que **16 fichiers** (la genèse) et **ne contient pas ce workflow** — GitHub exige qu'un workflow existe sur la branche par défaut pour être déclenché. Le 404 rapporté au dossier de porte **tient** | **rattaché**, non prouvé |
| `infra/docker-compose.yml` (+27) | **E17, E35** | Pile de développement alignée sur la nouvelle sonde | **rattaché** |
| `package.json` (+6) | **E36, E43** | 2 scripts, `verify` étendu aux deux contrôles, `prepare` redirigé | **rattaché** |
| `apps/worker/package.json` (+1) | **E36** | **Dépendance nouvelle : `@testcontainers/redis` 12.1.0.** Contrôle du gardien, parce qu'une dépendance non examinée est exactement ce que le 11 §8.1 réserve à l'escalade : elle est **dans la liste §1** (« Vitest 3 + Testcontainers »), **épinglée exacte** (`save-exact`), et **strictement alignée** sur `@testcontainers/postgresql` **12.1.0** déjà présente au L1 — même famille, même version. **Pas d'escalade requise.** Remarque : elle n'est pas tracée en `DECISIONS.md`, ce qui n'est pas exigé ici mais l'aurait été pour toute autre | **rattachée** |
| `.env.example` (+8) | **E33, E43** | `COOLIFY_PROXY_NETWORK` documentée, avec son périmètre (« seul `docker-compose.coolify.yml` la lit ») et son mode d'échec | **rattachée** |
| `infra/README.md` (+25) | **E43** (runbook), **E35** | Runbook complété. ⚠️ **Il décrit un chemin qui n'existe pas sur la machine** : `/opt/axion-audit` est absent d'`axionia-web` (vérifié), le staging vivant sous `/data/coolify/applications/<uuid>/`. `pnpm infra:restore-test` pointe toujours `/opt/axion-audit/prod/.env` | **rattaché** (remarque §G.5) |
| `.github/workflows/README.md`, `apps/worker/README.md` | **E43** · DoD « README à jour » | Réécrits sur le code au commit `462ba70`, **pendant ma passe et hors de mon périmètre**. Je constate le résultat sur le point qui m'importe : `apps/worker/README.md` porte les **noms réels** et **narre le changement** au lieu de le maquiller. **Je ne les ai pas relus intégralement** (§G.6) | **rattachés** |

## B.10.3 — VERDICT ANTI-ORPHELIN DU LOT L0-b

**Artefacts soumis à la règle (code, infra, tests, CI, garde-fous) : 24.**
**Rattachés : 24. Orphelins : 0.**

**Hors champ strict, inventoriés quand même** : `AMELIORATIONS.md`, `DECISIONS.md` (+2 entrées,
**47 au total**, `check:decisions` vert), `docs/ETAT.md`, `docs/portes/PORTE_A_2026-08-27.md`,
`pnpm-lock.yaml` — gouvernance et documentation, **toutes rattachées**.

**Aucune route, aucune table, aucun écran, aucun job livré** : le lot ne touche ni `apps/api/drizzle/`
ni `apps/api/src/db/` (**0 fichier au diff**, vérifié) — le contrôle 11 §8.6 et la ligne de DoD
« diff schéma-vs-04 » sont donc **sans objet pour ce lot**, et non pas « supposés inchangés ».

**Ce que le contrôle anti-orphelin a coûté, et pourquoi il fallait le payer.** Le seul rattachement
qui a demandé un vrai travail est celui de `prepare-husky.mjs` : rangé parmi « trois scripts de
contrôle », il se serait rattaché à E36 par contagion avec ses deux voisins. Ouvert, il ne contrôle
rien — il **répare une hypothèse non écrite**, et son exigence est E43. Un rattachement par contagion
est un rattachement qui n'a pas eu lieu.

---

# B.11 — INVENTAIRE DES LOTS L2, L3a, L4 ET DES INCRÉMENTS L0-c/d/e (`1c56759..6b9cc7c`)

**Périmètre du contrôle : `git diff --name-status 1c56759..HEAD` → 59 fichiers ajoutés, 65 modifiés,
61 commits.** Méthode inchangée depuis le lot L0.

> **Ce que cette passe fait pour la première fois, et pourquoi elle a coûté cher.** Les passes
> précédentes ont toutes tenu le sens 2 sur le **diff d'un lot**. Celle-ci le tient en plus sur
> **l'état complet du dépôt** : les **130 fichiers de code** de `apps/*/src`, `apps/*/tests`,
> `apps/api/{scripts,drizzle}`, `packages/*/src`, `infra/scripts`, `scripts/` et `e2e/` ont été
> énumérés mécaniquement, et **l'en-tête de traçabilité de chacun a été lu**. Résultat brut, avant
> toute interprétation : **84 fichiers portent une ligne `Traçabilité :`, 46 n'en portent aucune.**
>
> **Ce chiffre n'est pas un verdict** — il ne dit pas qu'il y a 46 orphelins. La plupart de ces 46
> fichiers sont rattachés **ailleurs** : les 13 migrations et les 11 suites L1 le sont au §B.9, les
> 3 fichiers du worker au §B.10, les 12 scripts d'`infra/scripts/` au §B.4 par une ligne
> `Applique : <sections du pack>` qui joue le même rôle sous un autre nom. **Mais il dit une chose
> vraie et gênante** : `pnpm check:tracabilite`, le seul instrument mécanique du sens 2, ne voit
> **aucun** de ces 46 fichiers — il n'a pas de citation à vérifier. C'est l'angle mort n° 6 que le
> script déclare lui-même, et il porte sur **35 % du code du dépôt**.

## B.11.1 — LES SIX ROUTES (contrôle 11 §8.6)

Le dépôt passe de **2 routes à 6**. C'est le premier lot où le 11 §8.6 a réellement quelque chose à
contrôler. Vérifié par balayage exhaustif de `apps/api/src` : aucune autre déclaration de route
n'existe, et le worker n'expose **aucun** serveur HTTP.

| Méthode + chemin | Fichier | Politique d'accès | Rattachement | Au pack ? |
| --- | --- | --- | --- | --- |
| `GET /v1/health` | `routes/sante.ts:83` | `public`, quota **exempté** | **E17, E35** | Non listée §8/§24.2 — **documentée** (11 §8.6) : en-tête du fichier + `apps/api/README.md`. Rattachée au L0 (§B.2) |
| `GET /v1/health/ready` | `routes/sante.ts:102` | `public`, quota exempté | **E17, E35** | idem |
| `POST /v1/auth/login` | `domaines/auth/routes.ts:176` | `public`, 10 req/min/IP | **E33, E43** | **OUI — 05 §8.1** |
| `POST /v1/auth/refresh` | `domaines/auth/routes.ts:198` | `public`, 10 req/min/IP | **E33, E43** | **OUI — 05 §8.1** |
| `POST /v1/auth/logout` | `domaines/auth/routes.ts:220` | **`authentifie`**, 10 req/min/IP | **E33, E43** | **OUI — 05 §8.1.** Le choix « authentifiée » plutôt que « publique » est arbitré (`DECISIONS.md` 2026-08-29) ; **la note de conception `LOT_L2.md` est périmée sur ce point**, et le dit |
| `GET /v1/scoping/:id/financials` | `routes/scoping.ts:71` | `roles:['admin']` + `financier:true` | **E21**, E19, E33, E43 | **OUI — 05 §8** (« `/v1/scoping` (+ `/financials`, admin only) ») |

**Six routes livrées, six rattachées, zéro orpheline.** Deux précisions que le contrôle a produites et
qui ne se devinent pas :

1. **La surface réelle est de 9 entrées, pas 6.** Fastify engendre un `HEAD` pour chaque `GET`, et ces
   `HEAD` **entrent dans le registre `onRoute`** — donc dans le champ du crochet d'autorisation et du
   balayage sentinelle. Un contrôle qui aurait compté 6 aurait laissé 3 entrées hors de sa vue.
   `auth/socle.test.ts` fige la liste des routes **publiques** par un instantané commité
   (`ROUTES_PUBLIQUES_ATTENDUES`, 6 entrées, `HEAD` compris) : en ouvrir une nouvelle oblige à
   modifier une liste versionnée, donc à passer en revue croisée.
2. **Aucune route ne peut naître sans politique.** `enregistrerSocleAutorisation` refuse le démarrage
   si une route n'a pas de `config.acces`, si une route a été déclarée **avant** le socle
   (`app.printRoutes()` comparé à `'(empty tree)'`), ou si une entrée du registre est restée
   `protegee: false`. Ce n'est donc pas une convention : **une route sans politique empêche l'API de
   démarrer.**

## B.11.2 — LE SOCLE D'AUTHENTIFICATION ET D'AUTORISATION (L2, T1-T2)

**Rattachement déjà arbitré** par `DECISIONS.md` du 2026-08-29 (« À quelle exigence se rattache le
socle d'autorisation ? »). Je le rappelle parce qu'il est la clé de lecture de tout ce bloc, et parce
qu'il tranche une question que ce fichier avait laissée ouverte : **aucune des 47 exigences ne
s'intitule « RBAC ».** « RBAC serveur systématique » est un **invariant** (00_INDEX n° 3), pas une
exigence. Le mot n'apparaît qu'**une seule fois** dans les 47 libellés, à **E21**. Un socle
d'autorisation générique n'a donc **pas de domicile propre** : il se rattache honnêtement à
**E21 + E33 + E45**, jamais à une seule. *Ce n'est pas du code orphelin — c'est une maille lâche de la
spécification, et elle est portée à Williams à la porte P-B.*

| Artefact | Rattachement | Vérification du gardien | Verdict |
| --- | --- | --- | --- |
| `auth/politique.ts` (389 l.) | **E21, E33, E45** | Le socle déclaratif. Vocabulaire en **union discriminée** (`public` · `authentifie` · `roles{roles[],financier?}` · `mission{parametreMission}` · `proprietaire_session{parametreSession}`) — et non un sac d'options facultatives qui autoriserait `type:'roles'` **sans** `roles`. Trois alternatives sont écartées par écrit, dont le décorateur par route (« un opt-in échoue par omission »). L'ordre ① identification → ② quota → ③ autorisation est **garanti par la signature** (le quota est passé en argument, pas posé par un appel voisin) : ③ posé en crochet d'instance passerait **avant** le quota et les jetons invalides cesseraient d'être comptés. La branche `default` est un **échec fermé doublé** — `const politiqueInconnue: never` pour la compilation **et** un `throw FORBIDDEN` pour l'exécution : sans elle, un `type` hors union ne matchait aucun `case`, la fonction se terminait normalement et **la requête passait** | **rattaché** |
| `auth/contexte.ts` (58 l.) | **E21, E33** | `unique symbol` **non exporté** — la marque `ContexteAdmin` est infabricable hors du module, même par assertion de type. Son unique producteur rend `null` pour tout rôle ≠ `admin` | **rattaché** |
| `auth/identite.ts` (120 l.) | **E33** | Crochet ① : lit le Bearer, pose `request.identite`, **et ne refuse jamais** — l'échec est *mémorisé* pour que ③ le lève **après** le quota. Sans cela, un flot de jetons invalides ne serait pas compté | **rattaché** |
| `auth/jetons.ts` (151 l.) | **E33, E43** | JWT HS256 en liste blanche, `requiredClaims: ['sub','exp']`, vérification cryptographique **puis** validation Zod de la charge. Le jeton porte l'identité, **jamais les droits**. Porte `FENETRE_GRACE_ROTATION_MS = 60_000` — pansement **daté**, réexamen porte L6a / 2026-11-29, arbitré parce que le code citait auparavant un arbitrage **qui n'existait pas** (`DECISIONS.md` 2026-08-29) | **rattaché** |
| `auth/erreurs-jeton.ts` (70 l.) | **E33, E43** | Reconnaît les erreurs **par code** (`FST_JWT_*`), pas par statut. Module séparé pour rester importable par `erreurs.ts` sans tirer `config.ts` | **rattaché** |
| `auth/depot.ts` (62 l.) | **E33**, ~~E45~~ | Lecture du **chemin chaud** : `id, role, is_active, habilitated_at` par clé primaire à chaque requête. Ne charge ni `email`, ni `name`, ni `password_hash` — « on ne charge pas ce qu'on n'autorise pas ». ⚠️ **La citation E45 est en AVANCE sur le code : `habiliteLe` est projeté et n'est consulté par aucun chemin d'exécution (§I.5).** Le fichier reste rattaché par E33 | **rattaché**, citation E45 **prématurée** |
| `domaines/auth/depot.ts` (259 l.) | **E33** | Dépôt de connexion et de `refresh_tokens`. **Ce n'est pas un doublon du précédent**, et l'en-tête porte une section « Pourquoi ce dépôt n'est pas `auth/depot.ts` » : élargir la lecture du chemin chaud pour y ajouter `password_hash` ferait **circuler un secret dans tous les gestionnaires de routes** au bénéfice d'une route sur cent. `lireJetonPourRotation` porte le `FOR UPDATE` ; `revoquerJetonDeLUtilisateur` porte la propriété **dans le `WHERE`** | **rattaché** |
| `domaines/auth/mots-de-passe.ts` (134 l.) | **E33** | Argon2id `hash-wasm` (11 §1), empreinte-**leurre** consommée y compris sur compte inconnu, préchauffage à l'enregistrement des routes. **L'oracle temporel a été mesuré avant d'être fermé** : 450 ms contre 203 ms. Rend `false` et jamais une exception sur empreinte illisible | **rattaché** |
| `domaines/auth/jetons-rafraichissement.ts` (126 l.) | **E33** | Jeton **opaque** (32 octets), empreinte HMAC-SHA256 déterministe pour rester cherchable par égalité indexée. Poivre = réemploi de `JWT_REFRESH_SECRET`, arbitré comme **dette de Phase 2** assumée (`DECISIONS.md` 2026-08-29) | **rattaché** |
| `domaines/auth/service.ts` (413 l.) | **E33, E43** | Les six issues de la rotation rendues comme un **verdict** (`succes|inconnu|expire|grace|reutilisation`) traduit en `AppError` **hors** transaction — pour que la révocation de famille soit **validée avant** d'être annoncée | **rattaché** |
| `domaines/auth/routes.ts` (247 l.) | **E33, E43** | Voir §B.11.1. Migration déclarative du 2026-08-30 : les `parse()` manuels ont disparu au profit de `schema: {body, response}`. **Elle a resserré une garantie** — le typage a refusé un `boolean` élargi là où le contrat déclare le littéral `true` | **rattaché** |
| `packages/shared/src/auth.ts` (164 l.) | **E33, E43** | Contrat des 3 routes. `authSessionSchema` n'expose **que `userId`** de l'utilisateur | **rattaché** |
| 5 fichiers de test unitaire (`socle`, `crochets`, `jetons`, `quota`, `jetons-rafraichissement`) + `l2-auth-routes` (29 cas) + `l2-crochets` (38 cas) | **E33, E21, E36** | **Exécutés par moi, verts** (§C.quater). Le croisement 09 §5.6 est **déclaré** dans les en-têtes, pas prouvé : les commits portent un auteur git unique (§B.11.7-4) | **rattachés** |

## B.11.3 — L'ÉTANCHÉITÉ FINANCIÈRE (L2, T5) — la seule exigence qui passe à `couverte`

| Artefact | Rattachement | Vérification | Verdict |
| --- | --- | --- | --- |
| `domaines/scoping/financiers.depot.ts` (117 l.) | **E21**, E19, E33 | **Le seul fichier du dépôt qui nomme `scopingFinancials`** — propriété vérifiée, pas convention. `SELECT` **énuméré colonne par colonne** : un `select()` implicite ramènerait toute colonne ajoutée demain au fichier 04. `daily_rates` (JSONB, rendu `unknown` par Drizzle) est **validé** par un schéma au lieu d'un `as`. Ne journalise pas — une lecture qui échoue n'est pas une consultation | **rattaché** |
| `routes/scoping.ts` (125 l.) | **E21**, E19, E33, E43 | Ceinture d'exécution : `contexteAdmin === null` ⇒ échec, **on ne fabrique pas un contexte**. Cadrage inconnu et cadrage sans volet financier rendent le **même** `NOT_FOUND` — la distinction n'aurait aucune valeur pour un administrateur et obligerait à lire la table voisine. Journalise `financier.consultation` **après** succès et **jamais le montant** | **rattaché** |
| `packages/shared/src/scoping.ts` (131 l.) | **E21**, E33, E43 | Les `NUMERIC` restent des **chaînes**. Porte les listes que les garde-fous interrogent (`CHAMPS_FINANCIERS_SURVEILLES`, deux graphies) | **rattaché** |
| `tests/aide/etancheite-sources.ts` (225 l.) · `tests/aide/sentinelle-financiere.ts` (389 l.) | **E21, E36** | **Des moteurs, pas des tests** : aucun `expect`, aucun `it` — ils *rapportent*, les assertions vivent dans le fichier de test écrit par un autre agent (09 §5.6). La sentinelle ferme nommément le défaut du balayage naïf : substituer un UUID quelconque aux paramètres d'URL rend **404 partout**, aucune sentinelle n'apparaît, et le test est **vert parce qu'il n'a rien traversé** | **rattachés** |

## B.11.4 — LE JOURNAL D'ACTIVITÉ (L2, T4)

| Artefact | Rattachement | Vérification | Verdict |
| --- | --- | --- | --- |
| `domaines/journal/depot.ts` (98 l.) | **E42**, E33 | **La seule écriture d'`activity_log` du dépôt, et elle n'expose qu'un `INSERT`** — invariant 7 tenu par absence de surface. `id` en UUID v7 **applicatif** (11 §2) | **rattaché** |
| `domaines/journal/service.ts` (201 l.) | **E42**, E33 | La porte unique. Cinq étapes, dont `normaliserIp` — `request.ip` n'est **pas** validé par Fastify, et la colonne est sous régime RGPD (06 §10.4) depuis une route **publique**. **Ne lève jamais** ; ne journalise dans pino que `{action, entityType, entityId}` | **rattaché** |
| `packages/shared/src/journal.ts` (500 l.) | **E42**, E33 | Le catalogue fermé. **Deux journaux, deux régimes** : `ip` est masquée dans pino et **écrite** en base. L'interdiction de tracer l'adresse tentée sur un échec de connexion — « un échec sur une adresse inconnue créerait une trace sur une **non-personne** » — est rendue **inexprimable** : aucune variante du catalogue n'a de champ d'adresse | **rattaché** |
| `scripts/check-porte-journal.mjs` (269 l.) | **E42**, E33 | Le balayage qui ferme la porte de derrière : le type protège ce qui compile, pas le SQL brut ni l'assertion. `UPDATE`/`DELETE` n'ont **aucun** fichier autorisé. ⚠️ **NON CÂBLÉ EN CI (§I.2)** | **rattaché**, non déclenché |
| `apps/api/tests/l2-journal.integration.test.ts` (11 cas, 7 `@critique`) | **E42, E36** | Livre le contrôle de « pureté d'`activity_log` » que la note L2 §5 promettait et que personne n'avait écrit. Le glob a été déclaré **sous le seuil** (74,67 % lignes) et **CI rouge assumée**, puis tenu par des **tests** — 93,33 % / 95,24 % — jamais par un rétrécissement de périmètre | **rattaché** |
| `apps/api/src/redaction-journal.test.ts` (29 cas, 19 `@critique`) | **E33, E42** | **Ferme la réserve R-4 de la porte P-A** : `redaction.ts` était la politique de journalisation unique de l'API *et* du worker, 796 lignes, **zéro test** | **rattaché** |

## B.11.5 — SOCLE HTTP (L3a), IMPORT DE LA BANQUE (L4), MIGRATION `0013`

| Artefact | Rattachement | Vérification | Verdict |
| --- | --- | --- | --- |
| `apps/api/src/http/zod.ts` (161 l.) | **E43**, E17 | Branché et **réellement consommé** par `app.ts` et les deux greffons de routes. Reconnaît un schéma **par capacité** (`safeParse`) et non par `instanceof`. La validation d'entrée rend `{error}` et ne `throw` jamais — sinon 500. ⚠️ **Sa justification est périmée (§I.3)** | **rattaché** |
| `apps/api/src/http/pagination.ts` (287 l.) | **E43** | Moitié **serveur** du keyset ; **pas** un doublon de `packages/shared/src/pagination.ts` (30 l.), qui est le contrat de fil importable par le navigateur et qu'il **importe**. Curseur composite, sur-lecture `limit+1`, plafond **revérifié** (un service appelé en code contournerait sinon la borne). ⚠️ **AUCUN CONSOMMATEUR À CE JOUR** — couvert par la soupape, voir §B.11.7-1 | **rattaché**, **non consommé** |
| `apps/api/scripts/import-banque-questions.mjs` (765 l.) | **E10, E37, E47** | Rattachement **arbitré** (`DECISIONS.md` 2026-08-29) : ces deux fichiers citaient auparavant `E4` (« arbre organisationnel »). Import **en deux passes** — la passe 1 n'écrit rien, la passe 2 est une transaction unique : l'atomicité §36.4 est une propriété de construction | **rattaché** |
| `packages/shared/src/banque-questions.ts` (1 276 l.) | **E10, E37, E47**, E43 | Seul garde-fou de forme du JSONB `scoring`. **Consommé uniquement par le script d'import** — aucune route ne le lit (M2 est en L3d) : socle anticipé, pas orphelin | **rattaché**, consommateur unique |
| **9 fixtures** `apps/api/fixtures/banque-questions/` | **E10, E37** · critère L4 du 07 (« JEU DE RECETTE ») | 2 fixtures de recette (dont une en `,`+BOM, la forme qu'Excel produit) et **6 de REFUS**. Génériques (`REC-*`) : invariant 2 respecté | **rattachées** |
| `apps/api/tests/l4-import-banque.integration.test.ts` (21 cas, 18 `@critique`) | **E10, E37, E36** | **Le lot L4 avait été livré sans aucun test.** Ceux-ci, écrits après coup par un autre agent, ont trouvé **deux vrais défauts**, prouvés **rouges avant correctif** | **rattaché** |
| `apps/api/drizzle/0013_sync_colonnes_manquantes.sql` (206 l.) | **E6, E7, E9, E13**, E42 | **Amendement du fichier 04**, ordonné par Williams et tracé **avant** régénération du sceau. La migration distingue par écrit ce qui **se déduit** du pack et ce qui **se décide** — « les fondre ferait passer une décision pour une lecture ». Livre la **44ᵉ table**, `attachment_uploads`. Motif de calendrier assumé : ajoutées ici, ces colonnes coûtent une migration sur une base **vide** ; découvertes au L6, elles la coûteraient sur des données de collecte réelles | **rattachée** |

## B.11.6 — L'OUTILLAGE : GARDE-FOUS ET SCRIPTS D'INFRASTRUCTURE (L0-c, L0-d, L0-e)

| Artefact | Rattachement | Vérification | Verdict |
| --- | --- | --- | --- |
| `scripts/check-tracabilite-exigences.mjs` (405 l.) | **E36, E43, E47** | **Mécanise le sens 2 de ce fichier, pour la première fois.** Il est né d'un défaut réel et mesuré. Sa valeur est d'exiger une **glose en français** plutôt qu'un fichier de correspondance : la glose transforme une citation *invérifiable* en citation *falsifiable* sans créer de seconde source de vérité. Échappatoire `citation-exemple` **plafonnée à 12** et **toujours comptée, même en vert**. **Exécuté par moi, RC=0** | **rattaché** |
| `scripts/check-graphe-modules.mjs` (1 003 l.) | **E36, E43, E47** | Le graphe d'imports dans les deux sens : C1 « le pendu » (import vers un chemin que git ignore) et C2 « l'orphelin » (module de `src/` que personne n'importe). C1 ferme un défaut **réel** (`b24b98c`) passé au vert sous un `typecheck` de pré-commit — *`tsc` lit le disque, pas l'index*. **Fiche `AMELIORATIONS.md` du 2026-08-29 (étage 1, ~0,3 j)** | **rattaché** |
| `scripts/modules-en-attente.md` (44 l.) | **la soupape elle-même** | **Donnée**, pas code : unique lecteur `check-graphe-modules.mjs`. Suit l'idiome `CLAUDE.md` §6 — un registre, un plafond (**5 entrées**), un arbitre : péremption **14 jours**, et une entrée dont le module est *désormais atteint* est **refusée** (« retire la ligne »), seul mécanisme qui empêche une entrée de dormir. Motif du refus de `DECISIONS.md` : ce registre doit **rétrécir**, or `DECISIONS.md` est append-only | **rattaché** |
| `scripts/garde-fous-proxy-de-confiance.test.ts` (965 l., 29 cas) | **E33** (invariant 3, plafonds serveur), E17, E43 | Garde **deux fichiers pour une seule garantie** (`Caddyfile` + `app.ts`). Deux verrous anti-faux-vert : les cas « état du dépôt » exigent d'avoir trouvé ≥ 1 `reverse_proxy`, et deux blocs rejouent le défaut sur des fichiers synthétiques **pour prouver que le lecteur mord** | **rattaché** |
| `infra/scripts/restore-test-ci.sh` (77 l.) | **E35** · invariant 8 · critère 2 de P-A | Voir §A.quinquies E35. **Publie sa propre empreinte SHA-256 en première ligne** ; clé SSH sans shell, sans lecture de fichier, sans redirection de port — **trois clés, trois pouvoirs disjoints**. ⚠️ **Aucune ligne `Traçabilité :` ni `Applique :` (§B.11.7-2)** | **rattaché**, non déclaré |
| `infra/scripts/deploy-staging.sh` (215 l.) | **E36** (critère L0 n° 4), E33 | Lit trois lignes sur **stdin, validées une par une**, et **rien** de `SSH_ORIGINAL_COMMAND` (« surface d'injection pour zéro gain »). Empreinte publiée et **comparée par la CI**, qui échoue en cas d'écart — la parade au fait que « quelqu'un peut modifier la version en production sans qu'aucune trace n'en subsiste ». ⚠️ **Aucune ligne `Traçabilité :` ni `Applique :`** | **rattaché**, non déclaré |
| `scripts/check-executabilite-scripts.mjs` (118 l.) | **E43, E36** *(proposé, non déclaré)* | Les **seize** scripts du dépôt étaient en `100644` : aucun clone Linux n'en exécutait un seul, `sauvegarde.sh` et `backup-postgres.sh` compris. En CI (`ci.yml:566`), **absent de `pnpm verify`**. ⚠️ **Seul garde-fou du dépôt sans AUCUNE ligne de traçabilité (§B.11.7-3)** | **NON DÉCLARÉ** |
| `.claude/settings.json` (6 l.) | **E43** · `DECISIONS.md` 2026-08-30 | Autorise `Bash(gh secret set:*)`. **Ce n'est pas la fiche A-001** (hooks `PreToolUse`, étage 2, non arbitrée — la confusion serait grave, 11 §8-7). C'est un élargissement de permission couvert par l'autorisation permanente accordée par Williams le 2026-08-30 (« secrets du staging »). **Rattaché, mais silencieusement** : le fichier ne porte aucune trace de l'arbitrage qui l'autorise | **rattaché**, non déclaré |

## B.11.7 — **CODE ORPHELIN — À RATTACHER OU À RETIRER**

> **La règle (09 §3.6) et sa contrepartie.** *Tout code livré se rattache à une exigence E1-E47 ou à
> une fiche `AMELIORATIONS.md` — le code orphelin est REFUSÉ.* La contrepartie, qui vaut règle pour la
> suite : **un rattachement inventé est pire qu'un orphelin déclaré**, parce qu'il fait disparaître la
> question. Rien de ce qui suit n'est forcé ; ce que je ne sais pas rattacher, je le nomme.

**Un seul véritable orphelin, et six réserves de déclaration.**

| # | Artefact | Constat | Ce que je propose, et ce que je ne décide pas |
| --- | --- | --- | --- |
| **1** | `apps/api/src/http/pagination.ts` (287 l.) | **Livré, correct, et sans aucun appelant** — aucune des 6 routes n'est une route de liste | **PAS ORPHELIN, et c'est mécanisé** : entrée unique de `scripts/modules-en-attente.md`, consommateur nommé (L3b, `GET /v1/companies` puis `GET /v1/missions`), déclarée le **2026-08-29**, donc **périmée le 2026-09-12**. Passée cette date, `check:graphe-modules` refuse — c'est le bon dispositif, et il n'a pas besoin de moi |
| **2** | `infra/scripts/restore-test-ci.sh` · `infra/scripts/deploy-staging.sh` | Deux scripts **neufs** qui, seuls parmi les 12 d'`infra/scripts/`, ne portent **ni** `Traçabilité :` **ni** `Applique : <section>`. Leurs 10 voisins en portent une | Le rattachement est **établi par leur prose** (invariant 8 et critère 2 de P-A pour l'un ; 02 §30.6 et le critère L0 n° 4 via le workflow appelant pour l'autre) — **il n'est simplement pas déclaré**. Je propose **E35** et **E36** ; *la ligne se pose dans le fichier, pas ici* |
| **3** | `scripts/check-executabilite-scripts.mjs` (118 l.) | **Aucune ligne de traçabilité, aucune entrée `DECISIONS.md`, aucune fiche `AMELIORATIONS.md`.** Ses 13 frères en portent tous une. Il est pourtant câblé en CI et ferme un défaut mesuré (16 scripts inexécutables) | Rattachement **évident par famille** — **E43** (exécutabilité) et **E36** (outillage de lot) — mais *évident* n'est pas *déclaré*, et le §B.10.3 a déjà établi qu'**un rattachement par contagion est un rattachement qui n'a pas eu lieu**. **À écrire dans le fichier avant la porte P-B** |
| **4** | `infra/scripts/empreinte-docker.sh` (393 l.) | **LE SEUL VRAI ORPHELIN.** Trois constats cumulés : (a) il n'est câblé **nulle part** — ni script `package.json`, ni étape de CI, ni cron ; il n'est *cité* qu'en commentaire (`deploy-staging.yml:99`) et dans `infra/README.md` ; (b) son ancre principale est **`infra/COHABITATION_AXIONIA_WEB.md §3bis`**, un document **interne au dépôt et non une section du pack** — il est le seul artefact dans ce cas ; (c) aucune fiche `AMELIORATIONS.md` ne le couvre (la fiche du 2026-08-29 qui le mentionne dit qu'il « mesure le disque, pas le déploiement », ce qui le constate sans le rattacher) | **RATTACHEMENT NON ÉTABLI.** Je ne le force pas vers E17 ou E33 : la chaîne qui l'y mènerait passe par un document que le pack ne connaît pas, et c'est précisément le raisonnement qui avait fait tomber `axion:sauvegardes` au lot L0 (§B.3). **Trois issues, et elles appartiennent à A01/Williams** : lui donner une ancre de pack, ouvrir une fiche `AMELIORATIONS.md` d'étage 2, ou **le retirer** |
| **5** | `packages/shared/src/index.ts` · `packages/ui/src/index.ts` | Barrels sans en-tête de traçabilité | **Non orphelins** : un barrel n'a pas d'exigence propre, il hérite de ce qu'il réexporte. Aucune action |
| **6** | `packages/ui/src/tokens.css` · `polices.css` | Aucun en-tête de traçabilité, mais des en-têtes **narratifs** explicites (invariant 4, 11 §1, §33.1) | **Rattachés à E27/E44** par `tokens.ts`, dont ils sont le miroir, et **gardés par un test** (`tokens.test.ts` échoue si les deux fichiers divergent). Aucune action |
| **7** | Les **13 migrations** `apps/api/drizzle/*.sql` | Aucune ne porte de ligne `Traçabilité :` | **Rattachées table par table au §B.9.1** (43 tables) et ici pour `0013` (44ᵉ). Aucune action — mais c'est **le plus gros bloc invisible à `check:tracabilite`** |

### B.11.7 bis — Deux constats de gouvernance que le sens 2 a produits

1. **La règle de croisement (09 §5.6) n'est toujours pas vérifiable par moi.** Comme au §H.8, les
   61 commits portent un auteur git unique. Les fichiers de test **déclarent** leur auteur croisé
   (« écrit par A75, qui n'est l'auteur d'aucun des deux scripts testés ») — une déclaration, pas une
   preuve. Elle vaut mieux que le silence, et elle ne vaut pas davantage.
2. **Deux lots ont travaillé simultanément dans le MÊME répertoire de travail pendant cette passe.**
   Constaté, non déduit : au démarrage `git status` était vide sur `main` ; en fin de passe l'arbre est
   sur une branche `lot/l2e-t3-users` **créée pendant mon contrôle**, avec `packages/shared/src/users.ts`
   et `apps/api/src/domaines/users/` non suivis, et `packages/shared/src/index.ts` modifié. **Effet
   mesuré** : `pnpm check:graphe-modules` sort en **RC=1** sur cet arbre (`index.ts:15 → ./users.js`,
   fichier présent sur le disque et **absent de l'index git**). **Ce rouge n'est PAS celui de `main`** —
   `git show main:packages/shared/src/index.ts` n'exporte pas `./users.js`, et le garde-fou est vert sur
   le commit contrôlé. **Mais c'est exactement le défaut que C1 a été écrit pour attraper**, et le
   `CLAUDE.md` §4 l'interdit en toutes lettres : *« jamais deux lots en parallèle sur les mêmes
   fichiers »*. **À porter à la porte P-B.**

## B.11.8 — VERDICT ANTI-ORPHELIN DES LOTS L2 / L3a / L4 / L0-c-d-e

**Artefacts soumis à la règle (routes, tables, écrans, jobs) : 6 routes + 1 table (`attachment_uploads`)
+ 4 colonnes + 0 écran + 0 job = 11. Rattachés : 11. Orphelins : 0.**

**Artefacts hors du champ strict, inventoriés quand même** — 44 modules de source, 9 fixtures,
13 fichiers de test, 4 garde-fous nouveaux, 2 scripts d'infrastructure, 1 fichier de configuration
d'autopilote : **1 orphelin déclaré** (`infra/scripts/empreinte-docker.sh`, §B.11.7-4) et
**3 réserves de déclaration** (§B.11.7-2 et 3).

**Ce que le contrôle a coûté, et pourquoi il fallait le payer.** Le rattachement le plus difficile n'a
pas été un fichier : c'est la constatation qu'**aucune exigence ne s'appelle « RBAC »** alors que
25 fichiers en citaient une. Le dépôt avait déjà le rattachement juste — `E21` est cité par
`0006_rapport_cadrage_pilotage.sql:96` depuis le lot L1 ; **c'est le lot L2 qui a inventé le sien**, et
il l'a fait dans la direction la plus coûteuse : une citation qui *a l'air* faisant autorité et qui
pointe ailleurs transfère au lecteur une confiance qu'elle n'a pas gagnée. Le garde-fou né de ce
défaut ne le rattraperait pas deux fois de la même façon — mais il déclare lui-même qu'il ne
distingue **jamais** un rattachement juste d'un rattachement faux. **Le sens 2 reste un travail humain ;
la machine n'en a mécanisé que la moitié la plus facile.**

---

# C. DEFINITION OF DONE TRANSVERSE — QUAND CHAQUE LIGNE DEVIENT EXIGIBLE

Une DoD dont on ne sait pas quand elle s'applique ne s'applique jamais. Ce tableau est le
calendrier d'exigibilité, à relire au brief de chaque lot.

Statuts **recochés sur `fdd5f59`**, par exécution du gardien (`pnpm verify` → **RC=0**, 12 contrôles
enchaînés : lint · format:check · typecheck · check:pack · check:invariants · check:jonction ·
check:no-skipped-tests · check:test-projects · build · test:unit · test:integration · test:e2e).

| Ligne de la DoD (09 §3)                        | Statut au L0            | Devient exigible à…                                              |
| ---------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| lint + typecheck stricts = 0 erreur            | **COCHÉ**               | dès L0, à chaque lot                                               |
| tous les tests verts, aucun skippé             | **COCHÉ** (2ᵉ passe)    | dès L0. 91 unitaires + **8 E2E** verts, exécutés par moi ; anti-skip vert (2 fichiers) ; `check:test-projects` vert (aucun test hors projet) |
| couverture ≥ 90 % sur les modules critiques    | **sans objet**          | **L2** (RBAC, auth) — premier module critique livré ; puis L5a/L5c (crypto, export), L6a (sync), L8 (scoring). **Mesurée à nouveau : 15,13 % global** — aucun module critique n'existe, le chiffre global n'a donc aucun sens ici |
| migrations up/down exécutées sur staging       | **sans objet**          | **L1** (premières migrations) — porte P-A                          |
| tout écran livré avec ses 4 états (§33.2)      | **sans objet**          | **L5** (PWA terrain) puis **L7-min** (console) — porte P-C          |
| axe-core vert                                  | **sans objet**          | **L5** — premier écran réel ; A28                                  |
| `@filrouge` vert sur FIL-TPE ET FIL-GC         | **sans objet**          | **L1** — les deux missions canoniques naissent en fixtures au L1 (09 §4bis) ; le scénario s'allonge ensuite à chaque lot |
| README de l'app à jour                         | **COCHÉ**               | dès L0, à chaque lot                                               |
| aucun TODO/FIXME sans entrée DECISIONS/AMELIORATIONS | **COCHÉ**         | dès L0, à chaque lot                                               |
| diff schéma-vs-04 = zéro écart                 | **sans objet**          | **L1** — critère propre du lot L1 ; porte P-A                      |

## C.bis — LA DoD RECOCHÉE AU LOT L1 (`bf7f6ca`), PAR EXÉCUTION DU GARDIEN

Quatre lignes de la colonne « sans objet » ci-dessus **deviennent exigibles à L1** et sont donc
tranchées ici. Le tableau qui fait foi pour la porte est celui du dossier `PORTE_A` §5 ; celui-ci en
est la trace détaillée.

| Ligne de la DoD | Verdict au L1 | Preuve exécutée par moi, ou motif de non-exigibilité |
| --- | --- | --- |
| lint + typecheck stricts = 0 erreur | **COCHÉE** | `pnpm lint` → RC=0 · `pnpm typecheck` → RC=0 (6 espaces) · `pnpm format:check` → « All matched files use Prettier code style! » |
| tous les tests verts, aucun skippé | **COCHÉE** | **169 tests exécutés par moi** : `test:unit` 95 · `test:integration` **66** (7 fichiers) · `test:e2e` **8** (chromium). `check:no-skipped-tests` vert sur 9 fichiers, liste d'exceptions **vide** ; `check:test-projects` vert (unit 1 · integration 7 · playwright 1, **aucun orphelin**) |
| couverture ≥ 90 % sur les modules critiques, **mesurée** | **sans objet — exigible à L2** | Aucun des 4 modules critiques (sync, crypto locale, scoring, RBAC/propriété) n'est livré : L1 ne livre ni route, ni écran, ni job. **Et le report est mécaniquement protégé** — j'ai simulé la ceinture 2 du job `coverage` en créant `apps/api/src/rbac/mod.ts` indexé dans un clone : la CI **échoue** en nommant le module et le lot. Le seuil ne peut pas être contourné en silence |
| migrations up/down exécutées **sur staging** | **NON SATISFAITE — et elle est exigible** | La chaîne up/down/up est **prouvée en local** (§B.9.3) et **en CI** (job `schema-diff`, base reconstruite depuis les seules migrations). Elle ne l'est **pas sur staging**, qui n'existe pas : il dépend du VPS de **L0-b**. Ce n'est pas un défaut du lot L1 — c'est une dépendance croisée entre les deux moitiés de la porte P-A, déjà annoncée au dossier de porte. **Elle reste NON SATISFAITE tant que L0-b n'est pas fait, et la porte ne peut pas la cocher.** |
| tout écran livré avec ses 4 états (§33.2) | **sans objet — exigible à L5** puis L7-min | Vérifié et non supposé : **aucun écran n'est livré au L1**. Les deux `App.tsx` sont les coquilles du L0, inchangées (absentes du diff du lot) |
| axe-core vert | **sans objet — exigible à L5** | Même motif : pas de premier écran réel |
| `@filrouge` vert sur **FIL-TPE ET FIL-GC** | **COCHÉE**, avec une réserve sur son garde-fou | **5 tests `@filrouge` exécutés par moi, verts**, sur les deux échelles : FIL-TPE (8 personnes, 1 unité, 1 entretien, 30 réponses) et FIL-GC (**150 unités sur 4 niveaux vérifiés par requête récursive**, 60 sessions, ~8 000 réponses). Le fil rouge naît en **intégration** et non en Playwright : écart au 09 §4bis **arbitré et tracé** (`DECISIONS.md`, « Le fil rouge naît en tests d'intégration, il passe à Playwright au lot L3 »), avec une date de bascule écrite — sans quoi il y resterait par inertie. **Réserve F-2** : le garde-fou censé rendre la couverture des deux missions obligatoire ne la vérifie pas réellement |
| README de l'app à jour | **COCHÉE** | `apps/api/README.md` porte une section « État au lot L1 » et une section « Schéma et données (lot L1) » ; `packages/shared/README.md`, `packages/ui/README.md` et `.github/workflows/README.md` sont au diff du lot |
| aucun TODO/FIXME sans entrée DECISIONS/AMELIORATIONS | **COCHÉE SOUS RÉSERVE** | Le dépôt en porte **trois**, non plus un (l'affirmation « un seul TODO » du dossier de porte est périmée). `infra/scripts/smoke-test.sh:141` `TODO(L2)` est adossé à sa décision — **conforme**. Les deux autres, `apps/api/scripts/db-generate.mjs:108` et `:112` `TODO(A12)`, vivent **dans la chaîne de caractères que le générateur écrit dans une migration VIDE** : ce sont des marqueurs de gabarit, pas du travail inachevé. La ligne de DoD étant mécanique, **à régulariser** (§F.5) |
| diff schéma-vs-04 = zéro écart | **COCHÉE, et éprouvée** | `pnpm schema:diff` → **ZÉRO ÉCART** — 43 tables · 472 colonnes · 193 contraintes · 31 index §7.1 · 22 de convention. Exécuté par moi **deux fois** : sur la base de développement, et sur une base **reconstruite depuis les seules migrations**. Le chiffre n'est pas cru : il est **recompté à la main contre `information_schema`** (§F.0) et le comparateur est **éprouvé par 34 mutations** |

## C.ter — LA DoD RECOCHÉE AU LOT L0-b (`462ba70`), PAR EXÉCUTION DU GARDIEN

**Trois lignes ont bougé, et une seule dans le sens qu'on attendait.** Le tableau qui fait foi pour la
porte est celui du dossier `PORTE_A` §5 ; celui-ci en est la trace détaillée. Toutes les commandes
ci-dessous ont été **lancées par moi** le 2026-08-28, en local et sur `axionia-web`.

| Ligne de la DoD | Verdict au **L0-b** | Preuve exécutée par moi, ou motif |
| --- | --- | --- |
| lint + typecheck stricts = 0 erreur | **COCHÉE** (inchangée) | `pnpm build:packages` → RC=0. Les 8 contrôles statiques rejoués un par un, **tous RC=0** : `check:pack` (12/12) · `check:decisions` (**47** entrées) · `check:invariants` · `check:jonction` (**41** scripts, **77** variables, 10 fichiers de CI) · `check:no-skipped-tests` · `check:test-projects` · `check:isolation-reseau` · `check:compose-coolify` |
| tous tests verts, **aucun skippé** | ✅ **COCHÉE — et le chiffre a bougé : 169 → 180** | **180 tests lancés par moi** : `test:unit` **95** · `test:integration` **77** (9 fichiers, **+11 et +2 fichiers** par rapport au L1) · `test:e2e` **8** (chromium). **RC=0 partout.** `check:no-skipped-tests` vert sur **11** fichiers, liste d'exceptions **vide** ; `check:test-projects` vert (unit 1 · integration 9 · playwright 1, **aucun orphelin**). Les 11 tests nouveaux sont **tous `@critique`**, donc **jamais skippables** (11 §2) — c'est le bon marquage : ils gardent une panne qui a vécu treize heures sans être vue |
| couverture ≥ 90 % sur les modules critiques | ➖ **sans objet — exigible à L2** (inchangée) | Aucun des 4 modules critiques n'est livré. **Vérifié et non supposé** : le lot ne touche ni `apps/api/src/routes/`, ni aucun module de sync, crypto, scoring ou RBAC |
| migrations up/down **sur staging** | ✅ **SATISFAITE — rejouée par moi, mais lire la réserve** | **Je ne l'ai pas crue, je l'ai refaite.** Sur une base **jetable créée puis supprimée dans le PostgreSQL du staging** (pour ne rien détruire) : montée **0 → 44 tables**, journal à **12** · `--down-to 0` → **« 12 migration(s) annulée(s) »**, **1 table restante**, et je l'ai nommée : `schema_migrations` · remontée → **44**. Sur la base de staging elle-même : **12 migrations au journal, 0 en attente**. **Les trois chiffres d'A01 sont exacts.** ⚠️ **RÉSERVE D'ENVIRONNEMENT** : cette chaîne a été mesurée — par A01 puis par moi — **sur un cluster qui se réinitialise toutes les dix secondes** (§G.2). La chaîne up/down est bonne ; **le socle sur lequel on la mesure ne l'est pas**, et j'ai dû reprendre chacune de mes commandes derrière un crash |
| tout écran livré avec ses 4 états | ➖ **sans objet — exigible à L5** (inchangée) | Vérifié : les deux `App.tsx` sont absentes du diff du lot |
| axe-core vert | ➖ **sans objet — exigible à L5** (inchangée) | Même motif |
| `@filrouge` vert sur FIL-TPE et FIL-GC | ✅ **COCHÉE**, réserve F-2 inchangée | Les 5 tests `@filrouge` sont dans les 77 d'intégration relancés par moi, verts. **F-2 n'est pas levée** |
| README de l'app à jour | 🟡 **COCHÉE, mais je ne l'ai pas vérifiée moi-même** | `apps/worker/README.md` et `.github/workflows/README.md` ont été réécrits au commit `462ba70` **pendant ma passe**, par un agent travaillant en parallèle. J'ai contrôlé **le seul point qui pouvait rendre la panne** : le README du worker porte les **noms réels** de files et **explique** le changement. Le reste : **non relu** (§G.6). `infra/README.md` décrit un chemin absent de la machine (§G.5) |
| aucun TODO/FIXME sans entrée DECISIONS/AMELIORATIONS | 🟡 **COCHÉE SOUS RÉSERVE** (inchangée) | **Recompté : toujours 3, ni plus ni moins.** `infra/scripts/smoke-test.sh:141` `TODO(L2)` adossé à sa décision — conforme ; `apps/api/scripts/db-generate.mjs:108` et `:112` `TODO(A12)` **dans la chaîne écrite par le générateur** — marqueurs de gabarit. **Le lot L0-b n'en ajoute aucun.** Reste à régulariser |
| diff schéma-vs-04 = **zéro écart** | ✅ **COCHÉE — et sans objet pour CE lot** | **Vérifié mécaniquement** : `git diff --name-only 47851fd..HEAD -- apps/api/drizzle apps/api/src/db` → **0 fichier**. Le lot ne peut pas avoir introduit d'écart. Je n'ai **pas relancé** `pnpm schema:diff` (§G.6) : le résultat du L1 vaut, faute de schéma modifié |

**Bilan de la DoD au 2026-08-28 : 6 lignes cochées · 3 cochées sous réserve · 3 sans objet avec leur
lot · 0 NON SATISFAITE.** La ligne qui manquait au L1 est satisfaite ; **deux autres se sont
assorties d'une réserve** (README non relu par le gardien, migrations mesurées sur un socle instable).

> **Et une phrase à ne pas écrire.** La version précédente du dossier de porte conclut : « **plus aucune
> ligne de DoD ne bloque la porte P-A** ». C'est exact **au sens littéral** — aucune ligne n'est NON
> SATISFAITE — et c'est **trompeur au sens utile**, parce que ce qui bloque la porte n'est pas une ligne
> de DoD : c'est l'état de la machine sur laquelle ces lignes ont été mesurées (§G.2). Une DoD toute
> verte au-dessus d'un PostgreSQL qui redémarre toutes les dix secondes est le même genre d'objet que
> « Up 13 hours (healthy) » au-dessus d'un worker mort.

## C.quater — LA DoD RECOCHÉE AU 2026-08-31 (L2 / L3a / L4 / L0-c-d-e), PAR EXÉCUTION

**Ce que j'ai lancé moi-même, et ce que je n'ai pas lancé, est distingué ligne à ligne.** Une DoD
recopiée d'une passe précédente n'est pas une DoD recochée.

| Ligne de la DoD (09 §3) | Verdict au 2026-08-31 | Preuve exécutée par moi, ou motif |
| --- | --- | --- |
| lint + typecheck stricts = 0 erreur | ⬜ **NON RECOCHÉE PAR MOI** | Je ne les ai **pas** lancés, et je préfère le dire : l'arbre de travail portait, en fin de passe, le code non commité d'un **autre lot** (§B.11.7 bis-2). Un `lint` vert ou rouge sur cet arbre n'aurait rien dit du commit contrôlé. **À rejouer sur un arbre propre avant la porte P-B** |
| tous les tests verts, **aucun skippé** | ✅ **COCHÉE — et le chiffre a bougé : 356 → 567** | **567 tests lancés par moi, RC=0** : `pnpm test:unit` → **312** tests / **11** fichiers (25,4 s) · `pnpm test:integration` → **255** tests / **16** fichiers (465,0 s). `check:no-skipped-tests` → **vert, 30 fichiers analysés, liste d'exceptions vide** ; `check:test-projects` → **vert, 30 fichiers, tous captés** (unit 11 · integration 16 · playwright 3), **aucun orphelin**. **Non lancé : `pnpm test:e2e`** (Playwright, 3 fichiers) — il exige une construction complète, et l'arbre n'était pas propre |
| **couverture ≥ 90 % sur les modules critiques — MESURÉE** | 🟡 **EXIGIBLE POUR LA PREMIÈRE FOIS, ET NON MESURÉE PAR MOI** | **C'est la ligne neuve de cette porte** : elle était « sans objet » depuis le lot L0 faute de module critique, et **L2 en livre cinq**. `.github/coverage-critical-paths.json` est **alimenté** — `apps/api/src/auth/**`, `domaines/auth/**`, `domaines/scoping/**`, `routes/scoping.ts`, `domaines/journal/**` — et la **ceinture 2** du job `coverage` a fait son travail : elle a **signalé au lot L2 que du code critique était livré hors liste**. Deux points que le fichier documente lui-même et qu'il faut lire : (a) le glob `journal` a été déclaré **sous le seuil** (74,67 % lignes / 46,15 % branches), **CI rouge assumée**, puis tenu **par des tests** (93,33 % / 95,24 %) et jamais par un rétrécissement ; (b) ⚠️ **TROU DE MESURE CONNU** — `packages/shared` s'exporte par `./dist/index.js`, les tests exécutent donc le **JS compilé** et **tous** les fichiers de `packages/shared/src/**` sont rapportés à **0,00 %**. `journal.ts` (500 l.) et `redaction.ts` (796 l.) **ne peuvent pas** être soumis au seuil aujourd'hui. Leur absence de la liste est un **défaut remonté**, pas une dispense. **Je n'ai pas relancé `pnpm test:coverage`** |
| migrations up/down exécutées **sur staging** | ⬜ **non rejouée par moi** | Aucune mesure sur `axionia-web` à cette passe. La chaîne up/down/up est en revanche **rejouée en local dans les 255 tests d'intégration** (`l1-migrations`, 6 cas, dont le dry-run `db:migrate:check` qui n'applique rien sur une base vierge) |
| tout écran livré avec ses 4 états (§33.2) | ➖ **sans objet — exigible à L5** | **Vérifié, non supposé** : `git diff --name-only 1c56759..HEAD -- apps/field/src apps/hq/src` → **0 fichier**. Les deux `App.tsx` sont les coquilles du lot L0 |
| axe-core vert | ➖ **sans objet — exigible à L5** | Même motif |
| `@filrouge` vert sur **FIL-TPE ET FIL-GC** | ✅ **COCHÉE** | Les tests `@filrouge` sont dans les 255 d'intégration relancés par moi (`l1-filrouge`, vert). **F-2 reste levée** : `check:test-projects` ne cherche plus les deux missions dans la concaténation de tous les tests, mais **uniquement dans les fichiers portant `@filrouge`** |
| README de l'app à jour | ⬜ **non vérifié par moi** | Non mécanisable, et je préfère le dire plutôt que de le laisser croire — c'est la même réserve qu'au §G.6 et au §H.9-3 |
| aucun TODO/FIXME sans entrée DECISIONS/AMELIORATIONS | 🟡 **COCHÉE SOUS RÉSERVE — recomptée : toujours 3** | **Ni plus ni moins qu'aux deux passes précédentes**, et **les lots L2/L3a/L4 n'en ajoutent aucun**. `infra/scripts/smoke-test.sh:141` `TODO(L2)` adossé à sa décision — **et il devient exigible** : le lot L2 est livré, l'étape « login » du §30.6 peut désormais s'écrire. `apps/api/scripts/db-generate.mjs:108` et `:112` `TODO(A12)` restent des **marqueurs de gabarit** dans la chaîne que le générateur écrit. **Reste à régulariser** |
| diff schéma-vs-04 = **zéro écart** | ✅ **COCHÉE, et le schéma a bougé** | Le lot amende le fichier 04 (migration `0013`, 4 colonnes + 1 table), sceau du pack **régénéré après la trace, jamais avant**. `schema:diff` **17/17 zéro écart** et suite L1 **57/57**, cycle descente/montée compris, rapportés à `docs/ETAT.md` ; de mon côté, `l1-schema-diff` (méta-test, 25 mutations) et `l1-schema-drizzle` sont **verts dans les 255**. **Je n'ai pas relancé `pnpm schema:diff` seul** (il exige une base peuplée hors Testcontainers) |

**Bilan au 2026-08-31 : 4 lignes cochées · 2 cochées sous réserve · 2 sans objet avec leur lot ·
3 non recochées par moi et nommées comme telles · 0 NON SATISFAITE.**

> **Et une phrase qu'il faut écrire, comme au §C.ter.** « Zéro ligne NON SATISFAITE » est exact et
> **incomplet**. Ce qui manque à cette porte n'est pas une ligne de DoD : c'est **un critère
> d'acceptation du fichier 07** — le CRUD users (T3) que la ligne L2 exige nommément, avec son
> garde-fou de réinitialisation §9.7. Une DoD verte au-dessus d'un lot dont un cinquième du périmètre
> n'est pas livré est le même genre d'objet que « Up 13 hours (healthy) » au-dessus d'un worker mort.

---

# D. RÉSERVES ET POINTS OUVERTS DU LOT L0

## D.0 — STATUT DES QUATRE ÉCARTS, APRÈS 2ᵉ PASSE (`fdd5f59`)

| Écart | Statut | Preuve — **exécutée** sauf mention contraire |
| --- | --- | --- |
| **V1** — la CI ne peut pas passer au vert | **LEVÉ** | `@playwright/test` **1.62.1** épinglé (`save-exact`, 11 §1), `playwright.config.ts` avec `webServer`, `forbidOnly` en CI. **8 tests E2E exécutés, verts.** `test:integration` porte `--passWithNoTests`, **rendu auto-péremptoire et éprouvé** (§D.1) |
| **V2** — le HEAD commité ne démarre pas | **LEVÉ** | `CADDY_STAGING_SITE_ADDRESS` documentée au `.env.example` et fournie par les Compose. `docker compose config -q` → **RC=0 sur les 3 combinaisons** (dev · +prod · +prod+staging). `check:jonction` : **76 variables, 0 anomalie**, et **éprouvé** (§D.1) |
| **V3** — pipeline hors séquence | **LEVÉ** | Revue croisée rendue **deux fois** avant cette passe ; `git status` **vide** ; faute d'orchestration tracée en `DECISIONS.md` et au dossier de porte. Le contrôle se tient enfin sur un état figé, après l'étape 4 |
| **V4** — gouvernance `DECISIONS.md` | **PARTIELLEMENT LEVÉ** | Les 12 sous-décisions groupées sont réémises une par une avec `Options :` et **le motif de rejet de l'alternative** — remède juste, et le refus de réécrire l'historique append-only est **le bon raisonnement**. **Mais 4 entrées du jour restent sans `Options :` et 19 sans citation de la précédence** (§D.4) |

## D.1 — V1 : levé, et les garde-fous ont été ÉPROUVÉS, pas lus

La leçon de ce lot est qu'un garde-fou non branché — ou qui ment — est pire que pas de garde-fou.
Je ne me suis donc pas contenté de lire les trois nouveaux contrôles : **je les ai fait échouer**,
dans un **clone jetable du dépôt** (scratchpad), sans jamais toucher au dépôt réel.

| Garde-fou | Épreuve menée | Résultat |
| --- | --- | --- |
| `check:test-projects` | création de `apps/api/drizzle/` (marqueur L1) dans le clone | **RC=1** — « le drapeau ferait passer au vert une suite VIDE », et le message énumère les tests du 07 §13 attendus |
| `schema:diff` | même clone, L1 simulé sans manifeste | **RC=1** — « manifeste introuvable alors que L1 est livré » |
| `check:jonction` | injection d'une variable `AXION_VARIABLE_FANTOME` non documentée | **RC=1** — anomalie localisée au fichier et à la ligne, avec le motif 02 §30.4-1 |

Les trois péremptions sont **réelles**. C'est ce qui permet d'accepter `--passWithNoTests` au L0 :
le drapeau est honnête aujourd'hui et **cesse mécaniquement de l'être** au L1.

## D.1bis — Trace de la réserve initiale (1ʳᵉ passe, `ce5b912`)

`pnpm test:integration` → **RC=1** (« No test files found, exiting with code 1 ») ; `pnpm test:e2e`
→ Playwright n'est déclaré dans **aucun** `package.json` et il n'existe aucun `playwright.config.*`.
`passWithNoTests` est absent de tout le dépôt. Or `ci.yml` appelle ces deux commandes en jobs
bloquants (lignes 315 et 347), et la chaîne `needs:` est
`unit → integration → e2e → schema-diff → build → deploy-staging`.

**Conséquence :** `build` et `deploy-staging` ne s'exécutent jamais. Le critère L0 « déploiement
staging par la CI OK » n'est pas seulement non vérifié, il est **inatteignable avec le code
commité** ; et la protection `main` du 02 §30.5 (« CI verte OBLIGATOIRE ») rendrait la branche
`lot/l0-infra` non mergeable.

**Ce n'est couvert par aucune justification existante.** Ni le démon Docker arrêté, ni le découpage
L0-a/L0-b : c'est un défaut **entièrement codable**, réparable sans VPS ni Docker. Le journal du lot
note « aucune suite au L0 » pour ces deux commandes, mais ne relève pas que la CI les traite comme
fatales. `schema-diff.mjs` et `check-coverage.mjs` montrent pourtant le bon motif dans ce même dépôt :
se déclarer explicitement sans objet, et se réarmer tout seuls dès que le code concerné apparaît.

## D.2 — File `axion:sauvegardes` : rattachement non établi

Voir §B.3. À corriger au L1 : soit la référence est rectifiée vers une section qui prévoit
réellement une sauvegarde pilotée par l'application, soit la file est retirée, soit elle fait
l'objet d'une fiche `AMELIORATIONS.md`.

## D.3 — Le HEAD commité ne démarre pas ; le correctif n'est pas commité

Au commit `ce5b912`, `infra/caddy/Caddyfile` (commité) déclare un second bloc de site
`{$CADDY_STAGING_SITE_ADDRESS}` et des upstreams `staging-api` / `staging-hq` / `staging-field`.
Vérification : `git grep CADDY_STAGING_SITE_ADDRESS HEAD` → **2 occurrences, toutes deux dans le
Caddyfile**. Aucun fichier Compose commité ne fournit cette variable, et `.env.example` ne la
documente pas. Le commentaire du dépôt le dit lui-même : « une adresse de site vide empêcherait
Caddy de démarrer ».

Le correctif existe — variable `CADDY_STAGING_SITE_ADDRESS`, attachement de Caddy au réseau
`axion-edge-staging` — mais **uniquement dans le répertoire de travail, non commité**.
`docs/ETAT.md` le confirme : « A11 applique l'arbitrage Caddy », étape **3/7**.

Conséquence pour la porte : **l'état commité de L0 est incohérent** — il livre un frontal qui ne
démarre pas. Ce n'est pas une réserve d'exploitation, c'est un défaut du livrable versionné.

**Évolution constatée en séance (à vérifier après commit).** L'arbre de travail a progressé pendant
le contrôle et va dans le bon sens : `.env.example` documente désormais
`CADDY_STAGING_SITE_ADDRESS` (02 §30.4-1 satisfait), `CADDY_STAGING_API_PORT` a été **supprimée** au
profit d'une convention `API_PORT=3000` (17ᵉ entrée `DECISIONS.md`, raisonnement solide : une
variable dont deux copies doivent coïncider à la main est une panne en attente), et `caddy_data`
entre au périmètre de sauvegarde — arbitrage juste, un PRA qui dépend d'un quota Let's Encrypt n'est
pas un PRA. **Contre-vérification du gardien**, sur l'arbre vivant :
`docker compose --env-file .env.example config -q` → **RC=0** sur les trois combinaisons
(dev · dev+prod · dev+prod+staging). **Rien de tout cela n'est commité.**

## D.4bis — V4 : ce qui est réparé, et le trou qui reste (2ᵉ passe, 23 entrées)

**Contrôle mécanique du gardien sur les 23 entrées : 4 conformes, 19 non conformes.**

Ce que je valide : le refus de réécrire les entrées en place est **le bon raisonnement** —
`DECISIONS.md` est append-only, et le réécrire pour se mettre en conformité serait exactement le
changement silencieux que le format existe pour empêcher. Les 12 sous-décisions réémises portent
désormais chacune son alternative **et le motif de son rejet** : c'est plus informatif que l'original.

**Le trou qui reste — et il porte sur du code vivant :**

| Entrée | Manque | Pourquoi ça compte |
| --- | --- | --- |
| « Nomenclature des lots L9 à L13 » | `Options :` | Corrige une erreur réelle (L12 = AI Act) qui s'était propagée dans 6 gabarits d'agents |
| « Suites de l'arbitrage Caddy » | `Options :` (et groupe **4** décisions) | C'est elle qui justifie **`infra/scripts/backup-caddy.sh`**, fichier bien présent dans le dépôt |
| « Nom de l'outil de délégation » | `Options :` | Portée mineure |
| « Verdict de la revue croisée » | `Options :`, `Arbitrage :` | Cas limite : un verdict n'est pas une décision — mais il porte une « Suite donnée » qui en est une |
| **19 des 23** | citation de la précédence dans l'`Arbitrage :` | La règle de conduite ne vaut que **« dès L1 »** |

Appliqué à la lettre, le §9bis efface encore l'entrée qui justifie `backup-caddy.sh`. **Ce n'est pas
de la pédanterie** : du code est dans le dépôt au nom d'une décision qui, selon la règle du projet,
n'existe pas. La reprise a couvert les 12 points ; elle n'a pas couvert ces quatre entrées-là.

**Réponse à la question posée par A01 — la règle de conduite est-elle suffisante ?** Sur le fond,
oui : « précédence citée ou déclarée sans objet » + « une entrée = une décision » ferment la cause.
**Sur la forme, il manque ce que ce lot a inventé partout ailleurs : le contrôle mécanique.**
`check:pack`, `check:jonction`, `check:test-projects`, `check:invariants`, `check-coverage` — la
gouvernance `DECISIONS.md` est désormais **la seule règle du dépôt qui repose sur la seule
discipline**, dans un lot dont la revue croisée a précisément trouvé « trois garde-fous qui mentaient
ou n'étaient branchés nulle part ». **Le pack n'exige nulle part cette mécanisation : c'est donc une
RECOMMANDATION, pas un écart** — je ne peux pas exiger ce qui n'est écrit nulle part.

## D.4 — Gouvernance : format des entrées `DECISIONS.md` (constat de 1ʳᵉ passe)

16 entrées, toutes au format d'en-tête `## AAAA-MM-JJ — [L0] Question`, toutes pourvues de
`Décideur :` et `Impact spec :`. Écarts au format imposé 11 §9bis :

| Entrée                                              | Manque                                  |
| --------------------------------------------------- | --------------------------------------- |
| « Points d'infrastructure actés sans réserve »      | **ni `Options :` ni `Arbitrage :`** — et elle porte **12 sous-décisions** |
| « Nomenclature des lots L9 à L13 »                  | `Options :`                             |
| « Nom de l'outil de délégation »                    | `Options :`                             |
| **les 16 entrées**                                  | la **règle de précédence citée dans `Arbitrage :`** — elle n'apparaît qu'une fois, en en-tête de fichier (ligne 5), jamais dans un arbitrage |

11 §9bis : « Une décision non tracée dans ce format n'existe pas. » Appliquée à la lettre, la
première ligne du tableau efface 12 arbitrages d'infrastructure.

**TODO/FIXME** : un seul dans tout `apps packages infra scripts .github` —
`infra/scripts/smoke-test.sh:126` `TODO(L2)`, adossé à l'entrée `DECISIONS.md` « Squelette
applicatif minimal » qui reporte explicitement l'étape « login » du §30.6 au lot L2. **Conforme.**

**Branches et commits** : branche `lot/l0-infra` conforme à `lot/<code>` ; 3 commits, tous
conventionnels (`chore(l0):`, `feat(l0):`, `fix(l0):`) ; `main` ne porte qu'un seul commit, la
genèse `1f63eb1`. **Conforme.** Aucun tag : normal, les tags se posent aux portes et P-A ferme
L0+L1. Aucun `origin` : tracé en `DECISIONS.md`, relève de L0-b.

## D.6 — Le pipeline n'est pas à l'étape 6

`docs/ETAT.md` (dernier bloc, qui fait foi) place le lot à l'**étape 3/7** et donne pour prochaine
action « lancer la REVUE CROISÉE (étape 4) **et** le contrôle d'acceptation du gardien (étape 6) ».
Or 09 §3 énonce **7 étapes obligatoires, aucun raccourci**, et l'étape 6 vient après l'étape 4
(revue croisée intégrale par un agent qui n'a rien produit) et l'étape 5 (suite complète de tests).
L'étape 4 n'a pas eu lieu.

Le présent contrôle est donc rendu **hors séquence**. Il reste valide comme constat technique — les
preuves exécutées sont des faits — mais il **ne vaut pas franchissement de l'étape 6** : il devra
être rejoué sur l'état commité, après la revue croisée. Le signaler fait partie du travail du
gardien : accepter de tamponner l'étape 6 alors que l'étape 4 n'a pas eu lieu viderait le pipeline
de sa fonction, exactement comme l'aurait fait un vérificateur qui corrige ce qu'il vérifie
(fiche A-001, `AMELIORATIONS.md`).

Point annexe : **`docs/journal/` n'est pas suivi par git** (`git status` : `?? docs/journal/`). Le
journal de lot et le burn-down du 09 §5.4 n'existent donc pas au sens du 11 §9ter.

## D.5 — Remarques (sans effet sur le verdict)

- `/v1/health/ready` est documentée dans `apps/api/README.md` mais pas nommée dans l'entrée
  `DECISIONS.md` qui ne cite que `/v1/health`. 11 §8.6 est satisfait ; l'entrée gagnerait à la citer.
- `pnpm infra:config` n'est pas autoportant en local (il lui faut un `.env` ; sans lui :
  `invalid spec: pgbackrest_repo::`). La CI fabrique bien un `.env` éphémère, donc **ce n'est pas un
  défaut de CI** ; c'est une aspérité de confort local. `infra/README.md` documente la bonne forme.
- La CI ne valide la syntaxe que de `infra/docker-compose.yml`. Les surcharges staging et prod ne
  sont pas contrôlées en CI (elles sont valides — vérifié à la main ce jour, RC=0). Aucun texte du
  pack ne l'exige : **remarque, pas écart.**
- Node v24.19.0 en local contre Node 22 épinglé : écart connu, tracé, non fatal (`engine-strict`
  à `false`), et sans effet sur la CI ni sur les conteneurs.

---

# D.7 — CE QUI MANQUE AU DOSSIER DE PORTE `docs/portes/PORTE_A_2026-08-27.md`

Le fichier existe, il est honnête, et sa section 7 assume la faute d'orchestration au lieu de la
lisser. Ce qui suit est ce qu'il lui manque **pour être une trace d'audit au moment où Williams
signera** — pas une critique de son état « en préparation », qui est légitime.

| # | Manque | Pourquoi |
| --- | --- | --- |
| 1 | **Une affirmation inexacte à corriger** : §6 dit `DECISIONS.md` « **23 entrées, toutes horodatées et au format** », puis reconnaît dans la phrase suivante que l'écart de forme n'a pas été réparé en place. Mesure du gardien : **4 conformes / 19 non conformes** | C'est le motif exact que le fichier reproche lui-même à l'auto-revue en §7 : « elle a conclu au-delà de ce qu'elle avait mesuré ». Formulation juste : « 23 entrées ; 4 au format complet ; les 19 antérieures relèvent de l'entrée de reprise, la règle s'applique dès L1 » |
| 2 | **Aucune colonne « sortie constatée / date / opérateur »** | 11 §9bis exige la preuve « lien CI, capture, **commande** ». Une commande *à exécuter* n'est pas une preuve : il faut l'endroit où coller sa **sortie**, avec qui l'a lancée et quand. Sans cette colonne, les ⬜ deviendront des ✅ sans trace |
| 3 | **Pas de verdict A51 (sécurité)** | 09 §3 étape 6 : « la sécurité (A51) et l'UX novice (A54) rendent leur verdict **quand le lot les concerne** ». A54 est sans objet (aucun écran). **A51 concerne L0** : durcissement 06 §10.3, 12 familles de secrets, CSP, gitleaks, ZAP rendu non bloquant jusqu'à L2. Une ligne « A51 — sans objet » serait déjà mieux que le silence |
| 4 | **La DoD « migrations up/down » y est notée « sur staging » sans dire que staging dépend de L0-b** | Le critère L1 n°5 dit « migrations up/down propres » ; la DoD exige **sur staging**. Tant que L0-b n'est pas fait, il n'y a pas de staging : la porte ne peut pas cocher cette ligne même avec L1 livré. À rendre explicite pour ne pas le découvrir le jour de la signature |
| 5 | **Aucun garde-fou ne rendra `@filrouge` exigible au L1** | Vérifié : `filrouge` n'apparaît que dans des **commentaires** (`playwright.config.ts`, `e2e/socle.e2e.ts`, `check-no-skipped-tests`). 09 §4bis dit « toute porte l'exige vert » dès L1. Le lot a inventé l'auto-péremption pour l'intégration, le schéma et la couverture — **`@filrouge` est le seul membre de cette famille sans garde-fou.** Recommandation, pas écart |
| 6 | **Le tableau des invariants n'y figure pas** | Les invariants 3, 5, 6, 7 ne sont pas mécanisables et sont contrôlés à la main. La porte est l'endroit où cette vérification humaine se trace. Le présent fichier la porte (§5 du rapport) ; un renvoi suffirait |

---

# F. LOT L1 — CE QUE J'AI RECOMPTÉ, CE QUE J'AI ÉPROUVÉ, ET CE QUI RESTE OUVERT

**Contrôle tenu sur `bf7f6ca`** (`git status` : seul `docs/ETAT.md` modifié — le fichier qui note
l'étape du pipeline ; l'arbre du code, lui, est figé), **après la 3ᵉ passe de revue croisée**
(`CONFORME AVEC RÉSERVES`, réserves fermées). Les conditions du §D.6 sont donc réunies, ce qui
n'était pas le cas au L0.

## F.0 — LES CHIFFRES, RECOMPTÉS SANS PASSER PAR LE MANIFESTE

Un manifeste extrait par l'agent qu'on vérifie ne vérifie rien. Tous les chiffres ci-dessous ont été
recomptés par mes propres requêtes sur `information_schema` / `pg_catalog`, et les comptages de
texte par mon propre script sur le fichier 04.

| Affirmation en circulation | Ma mesure | Verdict |
| --- | --- | --- |
| 43 tables | 43 hors `schema_migrations` (44 avec) | **exact** |
| 472 colonnes | 472 | **exact** |
| 193 contraintes | 193 — détail : **57** CHECK · **85** FK · **43** PK · **8** UNIQUE | **exact** |
| 53 index (31 §7.1 + 22 de convention) | 53 déclarés au manifeste, **les 53 présents en base**, aucun manquant. Base : 103 index au total | **exact** — précision en F.4 |
| 216 colonnes `NOT NULL` | 216 (et 256 nullables) | **exact** |
| 100 colonnes marquées `NULL` au fichier 04 | **100**, par mon propre comptage du bloc SQL **commentaires exclus** (110 en les incluant — d'où l'importance de la méthode) ; **aucun `NOT NULL` n'est écrit dans le 04**, la nullabilité y est donc entièrement portée par les conventions T8/T13/T14/T15 | **exact** |
| 28 `DEFAULT` prescrits | **28** occurrences de `DEFAULT` dans le bloc SQL du 04, commentaires exclus, **toutes dans le périmètre L1** (0 dans la section Phase 2/3). Le manifeste en déclare 28 « prescrits » + 51 « de convention » = **79**, et la base en porte **79** | **exact, et cohérent des deux côtés** |
| 23 identités T13, toutes `NOT NULL` | 23 déclarées ; **les 23 vérifiées `NOT NULL` en base**, une par une | **exact** |
| Aucune fonction SQL `uuidv7()`, `gen_random_uuid()` cantonné à 4 tables serveur | **0 fonction** dans le schéma `public` ; `gen_random_uuid()` sur exactement `sync_log`, `activity_log`, `integration_events`, `llm_calls` | **exact** (11 §2) |
| 169 tests verts | **169** : 95 + 66 + 8, les trois suites lancées par moi | **exact** |

**Aucun chiffre faux.** C'est à souligner, parce que c'est l'inverse du L0, où « 23 entrées toutes au
format » s'était révélé être 4 sur 23.

## F.0bis — LES GARDE-FOUS, ÉPROUVÉS PAR INJECTION (34 mutations en base + 4 dans le modèle)

Consigne du brief : en éprouver au moins deux. J'en ai éprouvé **six**, dont les deux qui portent le
critère n°7. Mutations appliquées dans des **bases jetables** créées par `TEMPLATE` puis détruites,
et dans un **clone jetable** du dépôt — jamais sur le dépôt ni sur la base de développement.

| Famille de mutation | `schema:diff` | `check:schema-inventaire` |
| --- | --- | --- |
| `NOT NULL` relâché (identité T13, traçabilité 0010) | détecté (×2) | — |
| CHECK inversée `= ANY` → `<> ALL`, élargie d'une valeur, rendue `NOT VALID` | détecté (×3) | — |
| Littéral d'énumération dont seule la **casse** change | détecté | — |
| `DEFAULT` modifié, retiré, ajouté (`gen_random_uuid()` hors des 4 tables serveur) | détecté (×3) | — |
| Index : UNIQUE surnuméraire · index §7.1 supprimé · composite réordonné · GIN → BTREE · partiel devenu total · `WHERE` inversé · UNIQUE devenu simple | détecté (×7) | — |
| Colonne : ajoutée, supprimée, renommée, type changé, `TIMESTAMPTZ` → `TIMESTAMP` | détecté (×5) | — |
| Table : surnuméraire, renommée | détecté (×2) | — |
| FK : repointée vers une autre table, passée `ON DELETE CASCADE` | détecté (×2) | — |
| Contrainte renommée à sémantique identique · UNIQUE métier supprimée · `NOT NULL` ajouté là où le 04 dit `NULL` | détecté (×3) | — |
| Colonne GENERATED ALWAYS | détecté | détecté |
| **Déclencheur (trigger)** · **RLS + politique permissive** · **vue** · **colonne IDENTITY** | **PASSE** (×4) | **détecté (×4)** |

**34 mutations, 34 attrapées** — 30 par le comparateur, 4 par le seul inventaire en liste noire.
Le couple tient : les deux échouent pour des raisons opposées, et le second rattrape exactement le
territoire que le 11 §7 laisse hors du premier. **La décision d'ajouter ce second verrou en 3ᵉ passe
était juste**, et je la valide sur preuve et non sur argument.

**Comportement documenté, vérifié conforme :** un index **simple** surnuméraire est *signalé*
(ligne informative, RC=0), un index **UNIQUE** surnuméraire est un *écart* (RC=1). C'est ce que le
manifeste annonce (`horsPerimetreAssume`) et ce que la sémantique commande — un index simple ne
change aucun comportement, un index unique en change un. **Éprouvé dans les deux sens.**

**Le troisième schéma** (`apps/api/src/db/schema.ts`, ce que TypeScript croit) : 4 mutations
injectées dans le modèle Drizzle — colonne fantôme, colonne retirée, `.notNull()` retiré, table
renommée — **4 détectées** par `l1-schema-drizzle.integration.test.ts`. Le trou relevé en 3ᵉ passe
est réellement fermé.

**Garde-fous statiques** : `check:pack` (fichier du pack modifié → RC=1), `check:decisions` (entrée
hors format → RC=1), `check:no-skipped-tests` (`it.skip` → RC=1), `check:test-projects` (test hors
projet → RC=1 ; tag `@filrouge` retiré → RC=1). Tous réagissent.

## F-1 — **ÉCART** : l'invariant 2 n'est PAS contrôlé en CI, et le garde-fou affirme le contraire

C'est ma trouvaille la plus utile, et elle porte sur du code d'A01.

`scripts/check-invariants.mjs` charge sa liste de noms de clients depuis, au choix, la variable
`AXION_CLIENTS_SURVEILLES` ou le fichier `docs/.clients-surveilles.txt` — **gitignoré** (`.gitignore`
l. 74). Quand aucune source n'est disponible, il affiche loyalement :

> `⚠ INV-2 … NON APPLIQUÉ` — « Renseigne `AXION_CLIENTS_SURVEILLES` (**la CI la reçoit par un secret
> de dépôt**) ou `docs/.clients-surveilles.txt` (gitignoré). »

**Les deux moitiés de cette phrase sont fausses en CI, et le contrôle sort quand même en 0.**

1. Le job `invariants` de `.github/workflows/ci.yml` (l. 212-219) exécute `pnpm check:invariants`
   **sans aucun bloc `env:`**. La variable n'apparaît que dans **trois** fichiers de tout le dépôt :
   le script lui-même, `docs/.clients-surveilles.exemple.txt`, et le présent rapport — **jamais dans
   `.github/`**. Mieux : le `env:` de niveau workflow ne porte que des tags d'images
   (`POSTGRES_IMAGE`, `REDIS_IMAGE`, `MINIO_IMAGE`…), et **`ci.yml` n'utilise aucun `secrets.`**,
   nulle part. Le « secret de dépôt » invoqué par le message n'existe pas. La CI ne reçoit rien.
   **Et l'affirmation est DOUBLE** : `docs/.clients-surveilles.exemple.txt` l. 11 écrit lui aussi
   « En CI, la liste arrive par le secret de dépôt `AXION_CLIENTS_SURVEILLES` ». Deux fichiers
   documentent un câblage qui n'a jamais existé — c'est ainsi qu'une croyance devient une preuve
   pour le lecteur pressé. **Les deux sont à corriger, pas seulement le script.**
2. Le fichier de repli est gitignoré : il **n'existe pas** sur un `actions/checkout`.
3. Le script sort en **RC=0** dans cet état. **Preuve exécutée** : sur un clone du dépôt (donc sans
   le fichier local), `node scripts/check-invariants.mjs` affiche `⚠ INV-2 … NON APPLIQUÉ` puis
   `✓ aucune infraction mécanisable détectée` et rend **RC=0**.

**Conséquence.** L'invariant 2 — l'un des **8 non négociables** du 00_INDEX, et le garde-fou dont la
matrice L0 fait la preuve d'**E31** — **n'a jamais été contrôlé par la CI**, y compris dans le run
« 18/18 jobs verts » que le dossier de porte cite au §2. Il ne l'est en local que sur la machine de
Williams, où le fichier existe (12 octets, un seul nom).

**Et le garde-fou censé attraper ce genre de trou ne l'attrape pas.** `check:jonction` déclare
croiser « ce que la CI **appelle** avec ce que les fichiers appelés **déclarent** » ; ici le fichier
appelé déclare avoir besoin d'une variable que l'appelant ne fournit pas, et le contrôle est vert.

**Ce n'est pas une remarque, c'est un écart** : le motif est exactement celui que ce lot poursuit
depuis trois passes — *le contrôle qui annonce plus qu'il ne fait*. Il est mineur à corriger
(quelques lignes) et majeur à laisser passer.

**Correctif attendu (à l'appréciation d'A01, pas du gardien) :** fournir le secret au job CI **et**
faire échouer le script quand INV-2 ne peut pas être appliqué dans un environnement d'intégration —
un invariant non négociable qui se désarme tout seul en silence n'est pas un invariant. À défaut de
correctif : **corriger le message du script**, qui affirme un câblage inexistant.

## F-2 — **ÉCART MINEUR** : la moitié « les DEUX missions » du garde-fou `@filrouge` ne fait pas ce qu'elle annonce

`scripts/check-test-projects.mjs`, contrôle 3, concatène le contenu de **tous** les fichiers de test
(commentaires retirés) puis teste `contenus.includes('FIL-TPE')` et `contenus.includes('FIL-GC')`.
Son message d'erreur dit pourtant : « **Le test `@filrouge` existe mais ne couvre pas :** … » — ce
qu'il n'est pas en mesure de déterminer.

**Preuve par injection, dans un clone :** j'ai effacé `FIL-GC` (puis `FIL-TPE`) de
`apps/api/tests/l1-filrouge.integration.test.ts` — **le garde-fou reste vert** dans les deux cas.
Motif : les deux chaînes figurent aussi à la **ligne 403 de
`apps/api/tests/l1-schema-diff.integration.test.ts`**, à l'intérieur du **texte d'un message
d'assertion** (« … insupportable sur FIL-GC et ses 8 100 réponses… »). Ce n'est pas un commentaire,
donc `sansCommentaires()` ne le retire pas.

Le script a fermé le trou des commentaires — sa propre note d'en-tête le raconte, et c'était juste —
mais il reste satisfait par **de la prose hors commentaire**, dans un **autre fichier**. C'est le
même défaut, d'un cran plus profond. Le retrait du tag `@filrouge` lui-même, en revanche, est bien
détecté (éprouvé), tout comme la suppression du fichier.

**Portée réelle : faible aujourd'hui** — le fil rouge couvre effectivement les deux missions, je l'ai
exécuté. **Portée réelle demain : sérieuse** — 09 §4bis fait de cette couverture une condition de
**toutes** les portes, et le garde-fou n'y veillera pas.

**Correctif suggéré :** chercher les deux missions dans le **seul fichier qui porte `@filrouge`**,
et non dans la concaténation de tous les tests.

## F-3 — **ÉCART MINEUR** : `pnpm test:e2e:filrouge` sort en code 1

`package.json` déclare `test:e2e:filrouge = pnpm build && playwright test --grep @filrouge`. Le fil
rouge vivant en intégration (arbitrage tracé, F-2 ci-dessus), **aucun test Playwright ne porte ce
tag**, et Playwright échoue quand son filtre ne trouve rien.
**Preuve :** `npx playwright test --grep @filrouge --list` → `Error: No tests found`, **RC=1**.

C'est **exactement la réserve M-1** que la revue croisée avait relevée sur `pnpm test:critique`, et
qui a été corrigée **une ligne plus haut dans le même fichier** par `--pass-with-no-tests`. Le même
remède n'a pas été appliqué à sa voisine. Non bloquant (la CI n'appelle pas cette commande), mais
c'est une commande du dépôt qui ne fonctionne pas, et le contrôle 4 de `check-test-projects` — né de
ce défaut précis — ne le couvre pas.

## F-7 — **ÉCART DE GOUVERNANCE** : le lot L1 a été développé sur la branche du lot L0

`CLAUDE.md` §7 et 11 §9bis : « **Branches** : `lot/<code>` (ex. `lot/l5a`), **une branche par
incrément** → PR vers `main` → squash merge ». Constaté : `git branch` → la branche courante et la
seule branche de travail est **`lot/l0-infra`**, et les 11 commits du lot L1 (`be42948` → `bf7f6ca`)
y vivent. Aucune branche `lot/l1`. **Aucune entrée `DECISIONS.md` ne trace ce choix** — j'ai
cherché.

Conséquence pratique : L0 et L1 ne peuvent plus être mergés ni tagués séparément. C'est cohérent
avec le fait que la porte P-A ferme **les deux** lots, et c'est donc défendable — mais 11 §9bis dit
« une décision non tracée dans ce format n'existe pas ». **Il manque l'entrée, pas le raisonnement.**
Mineur, à régulariser avant la porte (une entrée `DECISIONS.md` de dix lignes).

## F.4 — Précision de comptage : un objet compté deux fois

« 193 contraintes · 53 index » est exact, mais **un objet figure dans les deux nombres** :
`answers_interview_id_mission_question_id_key` est une **contrainte UNIQUE** (donc dans les 193) et
figure aussi parmi les 53 index déclarés au manifeste. Décomposition exacte des **103** index de la
base : 43 PK + 7 UNIQUE non déclarés + **53** déclarés au manifeste (dont celui-ci, adossé à une
contrainte). Sans conséquence — le diff compare bien les deux familles — mais la porte gagnerait à
l'écrire, parce qu'un lecteur qui additionnerait 193 + 53 se tromperait de un.

## F.5 — Remarques (sans effet sur le verdict)

- **Trois TODO, plus un.** Voir §C.bis. Les deux `TODO(A12)` de `db-generate.mjs` sont des marqueurs
  de gabarit à l'intérieur d'un modèle de migration vide, pas du travail inachevé — mais la ligne de
  DoD est mécanique et le dossier de porte affirme encore « un seul TODO dans tout le dépôt ». Une
  ligne `AMELIORATIONS.md` ou un renommage du marqueur ferme le point en deux minutes.
- **Les garde-fous statiques sont aveugles à ce qui n'est pas dans l'index git.** Éprouvé : un
  `describe.skip` dans un fichier de test **non indexé** → `check:no-skipped-tests` **vert** ; le
  même fichier après `git add` → **RC=1**. Idem pour `check:test-projects` et pour INV-4 de
  `check:invariants`. En CI la question ne se pose pas — l'arbre y est intégralement suivi — mais
  **en local, avant `git add`, un agent voit vert ce que la CI verra rouge.** C'est le cousin du
  défaut trouvé en 3ᵉ passe (« un test que git ne voyait pas ») : la 3ᵉ passe a traité les *projets
  vitest*, pas la cécité git elle-même. Choix de conception défendable ; à connaître, pas à corriger
  en urgence.
- **`pnpm verify` ne contient ni `schema:diff` ni `check:schema-inventaire`** (ils exigent une base).
  La CI les exécute bien, en jobs dédiés. À savoir : **`pnpm verify` vert ne prouve pas le critère
  n°7** ; il faut les deux commandes en plus, avec `DATABASE_URL` pointant sur `127.0.0.1` et non
  sur l'hôte `postgres` du réseau Docker.
- **`infra/COHABITATION_AXIONIA_WEB.md`** est le seul fichier du lot sans annotation de traçabilité,
  comme l'était `fronts.dev.caddy` au L0. Rattaché sans difficulté (E17, E35) ; l'annotation
  manque quand même.

## F.6 — CE QUE JE N'AI PAS PU VÉRIFIER, ET QUI DOIT ÊTRE DIT

1. **Les migrations sur staging.** Il n'y a pas de staging (L0-b, VPS). La chaîne up/down/up est
   prouvée en local et en CI, **pas** sur l'environnement que la DoD nomme. Ligne **NON SATISFAITE**.
2. **Le run CI « 18/18 jobs verts »** cité au §2 du dossier de porte : je n'ai pas accès à GitHub
   Actions. Tout ce que je certifie est exécuté **sur cette machine**. La conformité de la CI est
   attestée par A01, pas par moi — et F-1 montre qu'un job vert n'est pas la preuve que le contrôle
   a eu lieu.
3. **La restauration de sauvegarde, les secrets provisionnés, le déploiement réel** : critères L0
   restés à Williams (porte P-A, §E).
4. **Les valeurs des 29 `estimation_params`** : le contrat 11 §5 les réserve explicitement à
   Williams. J'ai vérifié qu'elles sont seedées et rejouables, **pas qu'elles sont justes**.
5. **La justesse métier du schéma** (par ex. : les 9 blocs correspondent-ils à la méthodologie
   réelle ?) : hors du pouvoir du gardien. Je vérifie la conformité au fichier 04, qui est la source
   d'exécution ; la conformité du fichier 04 au métier a été scellée en conception.

---

# G. LOT L0-b — CE QUE J'AI RECOMPTÉ, CE QUE J'AI ÉPROUVÉ, ET CE QUI EST FAUX

Le lot précédent a livré une leçon que le lot L0-b confirme trois fois : **un contrôle qui annonce
plus qu'il ne fait est plus dangereux qu'un contrôle absent**, parce qu'il consomme la vigilance qu'il
ne rembourse pas. J'ai donc appliqué au dossier du L0-b la même méfiance qu'il applique au dépôt : je
n'ai retenu **aucun chiffre sans le recompter**, et **aucun garde-fou sans l'éprouver par injection**.

## G.0 — Les chiffres en circulation, repris un par un

| Chiffre annoncé | Ce que j'ai mesuré | Verdict |
| --- | --- | --- |
| **9 services, tous sains** | **6** conteneurs `Up (healthy)` (postgres, redis, minio, api, worker, caddy) + **3** `Exited (0)` (createbuckets, field, hq). Les trois sorties sont **légitimes** — j'ai lu leurs journaux avant de conclure : ce sont des jobs ponctuels qui déposent leur build ou créent les buckets. **Mais « tous sains » est faux deux fois** : trois d'entre eux ne tournent pas, et **postgres n'est pas sain** (§G.2) | **FAUX** |
| **migrations 12 → 44 tables** | **44** tables, **12** migrations au journal, **0 en attente**. Rejoué de bout en bout par moi sur une base jetable du staging | **EXACT** |
| **descente à 1 table** | `--down-to 0` → « **12 migration(s) annulée(s)** », **1** table restante, nommée : `schema_migrations` | **EXACT** |
| **empreinte de seed `e6fe311a275472187e2d5115577543c2`** | **Aucun outil du dépôt ne produit cette valeur.** `seed.mjs --empreinte` imprime **8 tables** avec un md5 **tronqué à 12 caractères** : `blocks 6709e273865a` · `sectors 001444fbe096` · `services 76f769f5ab62` · `interlocutor_profiles 3ac44eb0ff83` · `size_tiers 4cd05abd8d1e` · `naf_sector_map 28d2ca0fdfcb` · `estimation_params bc0d98c35d42` · `users 95d203bc3cc5`. **La propriété annoncée est vraie** — je l'ai vérifiée sur staging, deux passages consécutifs, **8 empreintes identiques** — mais **pas avec cet artefact** | **NON REPRODUCTIBLE** |
| **77 tests d'intégration** | **77**, sur **9** fichiers. Et 95 unitaires, 8 e2e : **180 au total, 0 skippé** | **EXACT** |
| **11 tests interdisent le retour du worker mort** | **11**, tous `@critique` : 7 pour la sonde, 4 pour les noms de files. Exécutés par moi, verts | **EXACT** |
| **9 Go libres sur 15** | Ne correspond à aucune grandeur mesurable sous ce nom. **Disque : 83 Go libres sur 150** (43 % utilisés). **Mémoire : `free` 1,5 Gi, `available` 10 Gi sur 15, `buff/cache` 9 Gi** — le chiffre semble être `buff/cache`, qui n'est **pas** de la mémoire libre. **Et il masque le vrai risque de capacité**, que personne n'a mesuré : `docker system df` annonce **14,19 Go de cache de construction** (8,86 Go récupérables) et **15,76 Go d'images récupérables**, sur une machine qui construit désormais ses images **sur place** | **FAUX / trompeur** |
| **`axion-ia.com` → 301 en 0,27 s** | **301 en 0,077 s**, voisin intact, ses 4 conteneurs `Up 8 weeks (healthy)`. Non un faux — une mesure non reproductible portée comme une preuve | **conclusion exacte** |
| **`DECISIONS.md` 45 entrées** (dossier §6, hérité du L1) | **47**, toutes au format (`check:decisions` RC=0). +2 au L0-b | **périmé** |
| **`check:jonction` 39 scripts / 76 variables** (dossier §4, hérité) | **41** scripts, **77** variables | **périmé** |

## G.1 — ~~**ÉCART BLOQUANT**~~ **LEVÉ LE 2026-08-28 (§H.1)** : le critère n° 1 ne se recoche pas, et pas pour la raison annoncée

> **⚠️ CET ÉCART N'EXISTE PLUS.** Il est conservé intégralement — ce fichier ne se réécrit pas en
> silence — mais **le critère n° 1 est COCHÉ depuis le rejeu du 2026-08-28** (§H.1), sur la condition
> que cette section s'était elle-même fixée. *Un dossier qui crie au loup sur un point réparé
> décrédibilise les points qui, eux, tiennent.*


Le dossier de porte pose la question honnêtement : *« se recoche-t-il maintenant qu'il fonctionne
réellement, ou le lot L0 porte-t-il une réserve datée ? »*. **Ma réponse de gardien : ni l'un ni
l'autre. Il ne se recoche pas, et il ne s'agit pas d'une réserve d'historique — il s'agit du présent.**

**Le worker, lui, est réparé, et je l'ai prouvé** (§B.10.1) : la sonde discrimine, les onze tests la
gardent, la panne de treize heures ne peut plus se rejouer sans faire rougir la CI. Sur ce point précis,
le travail est fait et bien fait.

**Mais le critère n° 1 ne dit pas « le worker vit ». Il dit : « `docker compose up` = stack complète ».**
Et sur la pile qui compte — celle qui tourne sur un serveur — **la stack n'est pas saine** : son
PostgreSQL se réinitialise toutes les dix secondes (§G.2). **Recocher le critère aujourd'hui reviendrait
à refaire, sur la base de données, exactement ce qui a été fait hier sur le worker : cocher une
apparence de santé rapportée par une sonde qui ne regarde pas au bon endroit.**

**Verdict du gardien : critère n° 1 → ⬜ NON COCHÉ**, et la mention « coché à tort le 2026-08-27 » reste
inscrite. Il redeviendra cochable quand la pile complète sera saine **sur staging**, sonde de Postgres
comprise — pas avant. *La signature reste celle de Williams ; l'avis du gardien est celui-ci.*

## G.2 — ~~**ÉCART BLOQUANT**~~ **LEVÉ LE 2026-08-28 (§H.2) — C'EST LE BLOQUANT QUI N'EXISTE PLUS** : le PostgreSQL du staging se réinitialise toutes les dix secondes, et Docker le dit sain

> **⚠️ CE BLOQUANT EST LEVÉ, ET C'EST LA CORRECTION LA PLUS IMPORTANTE DE CE FICHIER.** Le texte
> ci-dessous décrit un état réel du 2026-08-28 au matin ; il est **entièrement périmé**. Remesuré par
> A02 le même jour sur `1c56759`, avec une fenêtre d'observation trois fois plus longue :
> **`reinitializing` = 0** sur l'intégralité du journal, cluster continu depuis **2 h 56**,
> `RestartCount = 0`, `archived_count = 31`, **`failed_count = 0`**, WAL `…0001` → `…0021` continus,
> `pgbackrest info` → **`status: ok`**. La stanza est **mécanisée** et la sonde ne porte plus sur
> `pg_isready` mais sur l'âge du checkpointer. **Voir §H.2 pour la mesure complète.**


**C'est la troisième sonde menteuse du projet, découverte le lendemain du jour où la deuxième a servi
de leçon.** Elle n'a été trouvée par personne parce que personne n'a regardé les journaux de la base :
tout ce qui l'entoure était vert.

**Les faits, tous mesurés par moi le 2026-08-28 sur `axionia-web` :**

1. `/var/lib/pgbackrest/` est **VIDE** (répertoire daté du 19 août). **`pgbackrest stanza-create` n'a
   jamais été exécuté sur le staging.**
2. `archive-push` échoue donc à chaque segment :
   `[103]: unable to find a valid repository … unable to open missing file '/var/lib/pgbackrest/archive/axion/archive.info'`,
   avec l'indice explicite `HINT: has a stanza-create been performed?`
3. Le postmaster traite cet échec comme un crash de backend : `server process … exited with exit code 103`
   → `all server processes terminated; reinitializing` → `database system was not properly shut down;
   automatic recovery in progress`.
4. **Ce cycle s'est produit 275 fois en 46 minutes** — le premier à `05:17:22`, c'est-à-dire **six
   secondes après le démarrage du conteneur**, le dernier pendant que j'écrivais cette ligne. Le WAL
   bloqué est le tout premier : `000000010000000000000001`. **Zéro segment archivé depuis le déploiement.**
5. **Et Docker annonce `Up 46 minutes (healthy)`, `RestartCount = 0`** : la sonde de Postgres réussit
   *entre* deux crashs, exactement comme `pgrep -f node` réussissait à côté du worker mort.
6. **L'application en souffre, et ça se lit** : le journal de l'API porte **390 lignes d'erreur**
   `Connection terminated unexpectedly` / « Erreur du pool PostgreSQL sur une connexion inactive ».
   Mes propres commandes de contrôle ont dû être relancées derrière les crashs.

**Ce que cela invalide, précisément :**

- **E35 n'est pas seulement « non prouvée sur staging » : elle est CASSÉE sur staging.** Il n'y a aucune
  sauvegarde possible, aucun rejeu WAL possible, aucun PRA. L'invariant 8 et le critère L0 n° 2 ne
  tiennent que par le test **local** du 2026-08-27.
- Le dossier de porte §8 point 3 **avait prévu ce point** — « *Point de contrôle n°1 côté sauvegardes :
  `pgbackrest stanza-create` après le premier `up`, sans quoi les WAL s'accumulent sans être archivés* ».
  **L'étape n'a pas été faite, et l'avertissement SOUS-ESTIME sa propre conséquence** : ce n'est pas
  « les WAL s'accumulent », c'est « **le cluster redémarre en boucle** ». Un avertissement qui minimise
  se fait ignorer.
- **Le risque n'est pas cantonné au staging.** La même image `infra/postgres/Dockerfile` et la même
  configuration d'archivage partiront en production, où `stanza-create` est **également** une étape
  manuelle du runbook. Ce qui s'est passé ici se reproduira là-bas, sur des données d'audit réelles.

**Ce que je ne fais pas, et pourquoi.** Je n'exécute pas `stanza-create` : mon périmètre est la lecture
et le verdict, et un gardien qui répare ce qu'il contrôle ne contrôle plus rien. **La correction et,
surtout, la mécanisation de ce point (une sonde qui regarde l'archivage, ou une étape de déploiement qui
crée la stanza) reviennent à A11 et à A01.**

## G.3 — Les garde-fous neufs, éprouvés par injection — **et refaits pendant que je les éprouvais**

> **Lire d'abord ceci, sinon les deux tableaux qui suivent se contredisent.** Les deux garde-fous ont
> été **réécrits pendant ma passe de contrôle**, chacun à la suite d'une revue croisée :
> `check-compose-coolify.mjs` **201 → 706 lignes**, `check-isolation-reseau.mjs` **145 → ~600 lignes**.
> Je rapporte donc **deux mesures**, et non une : celle des versions **commitées au `462ba70`**, qui
> sont celles du lot que je contrôle (§G.3.1), et celle des versions **de l'arbre de travail**, qui ne
> sont dans aucun commit au moment où je signe (§G.3.2). **Je crédite les secondes, je ne les coche pas.**

Chaque injection a été faite **sur une copie de travail hors du dépôt**, sur du YAML dont j'ai vérifié
la validité avec `docker compose config` **avant** de conclure. **Mes trois premières tentatives ont
produit du YAML invalide** ; les compter aurait fabriqué deux faux positifs et un faux négatif.
*Une injection non validée est une opinion, pas une preuve.*

### G.3.1 — Les versions du lot (`462ba70`) : 8 injections, **2 manquées**

| # | Injection | YAML valide ? | Attendu | Obtenu |
| --- | --- | --- | --- | --- |
| 1 | `networks: [axion, edge]` sur `postgres` (séquence en flux) | oui | RC=1 | **RC=1** ✅ |
| 2 | `edge:` ajouté dans le bloc `networks:` de `api` (mapping) | oui | RC=1 | **RC=1** ✅ |
| 3 | `networks:` / `- axion` / `- edge` sur `postgres` (**séquence en bloc**) | oui | RC=1 | **RC=0** ❌ |
| 4 | `${AXION_DATA}/pg:/…` dans le bloc `volumes:` de `postgres` | oui | RC=1 | **RC=1** ✅ |
| 5 | `- ./infra/postgres/postgresql.custom.conf:/etc/…` (le défaut du 6ᵉ déploiement) | oui | RC=1 | **RC=1** ✅ |
| 6 | `context: ../infra` (remontée au-dessus de la racine) | oui | RC=1 | **RC=1** ✅ |
| 7 | `context: ./infra-disparu` (chemin inexistant) | oui | RC=1 | **RC=1** ✅ |
| 8 | `volumes: ["${AXION_DATA}/r:/r", …]` sur `redis` (**séquence en flux**) | oui | RC=1 | **RC=0** ❌ |

**Injection 3** est la plus grave : `networks:` suivi de `- edge` est **la syntaxe la plus courante de
Docker Compose**, et c'est **très exactement le scénario que le script décrivait dans son propre
en-tête** — « *un `edge: {}` ajouté sous `api`, deux mots, dans un fichier de 750 lignes, par quelqu'un
qui veut « juste exposer l'API directement »* ». Écrit de la façon la plus naturelle, ce geste passait
**au vert**, et l'API de staging obtenait une route directe vers la base PostgreSQL d'`axion-ia.com`.
**Le garde-fou de sécurité laissait passer la forme d'écriture la plus probable de la faute qu'il garde.**

**Injection 8** : la détection de `${` était enfermée dans un bloc ouvert par `^\s{4}volumes:\s*$` ; un
`volumes: ["${VAR}/x:/x"]` y échappait. Coolify aurait rejeté le déploiement **avant le clone**, donc
**en silence** — le mode d'échec précis que la règle existe pour empêcher.

**Cause commune, et c'est elle qui compte plus que les deux symptômes** : les deux scripts cherchaient
**des formes d'écriture** au moyen d'expressions régulières ligne à ligne, là où ils devaient garder
**une propriété**. Une expression régulière garde l'écriture qu'on avait en tête en l'écrivant.

### G.3.2 — Les versions de l'arbre de travail : 11 injections, **11 attrapées**

Les deux réécritures lisent désormais la **structure** du document et raisonnent sur une propriété.
**Je ne les ai pas crues : je les ai rejouées**, en ajoutant à mon jeu les deux formes que la revue
croisée avait trouvées et que **je n'avais pas trouvées moi-même** — un second alias du même réseau
sous un autre nom, et un `network_mode` qui emprunte la pile réseau de Caddy sans déclarer aucun réseau.

| Injection | `check:isolation-reseau` | `check:compose-coolify` |
| --- | --- | --- |
| séquence en flux `[axion, edge]` | **RC=1** ✅ | — |
| mapping `edge:` sous `api` | **RC=1** ✅ | — |
| **séquence en bloc `- edge`** (injection 3) | **RC=1** ✅ *(corrigée)* | — |
| **second alias du même réseau** (`passerelle: {name: coolify, external: true}`) — *le mot « edge » n'apparaît jamais* | **RC=1** ✅ | — |
| **`network_mode: 'service:caddy'` sur `worker`** — *aucun réseau attaché, mais la route héritée* | **RC=1** ✅ | — |
| interpolation dans un volume (bloc) | — | **RC=1** ✅ |
| **interpolation dans un volume en flux** (injection 8) | — | **RC=1** ✅ *(corrigée)* |
| montage de fichier depuis le dépôt | — | **RC=1** ✅ |
| `context: ../infra` | — | **RC=1** ✅ |
| `context: ./infra-disparu` | — | **RC=1** ✅ |
| fichier **réindenté à 4 espaces** + interpolation dans un volume | — | **RC=1** ✅, la faute nommée **avec son service** |

**Les deux scripts comptent désormais ce qu'ils inspectent et l'affichent** — « *10 attachement(s)
inspecté(s) sur 9 service(s)* », « *10 montage(s) inspecté(s) sur 9 service(s) ; 12 chemin(s)
relatif(s)* ». **Et ils énoncent leurs propres limites** (montage ajouté depuis l'interface Coolify,
`include:`, `extends:`, `docker network connect` passé à la main, documents YAML multiples, ancres
définies dans un service). C'est la bonne manière : *une garantie faible et énoncée vaut mieux qu'une
garantie forte et fausse.*

### G.3.3 — **LA RÉSERVE QUI SUBSISTE** : le compteur est affiché, il n'est pas *asserté*

C'est le seul défaut que je trouve encore, et il est réparable en une ligne — mais il est de la famille
que ce dépôt poursuit depuis trois lots.

**Mesuré** : fichier réindenté à 4 espaces **avec** la faute d'isolation (`- edge` sous `postgres`) →
`check:isolation-reseau` **sort en 0**, et son compteur passe de **10 attachements à 9**. *Le symptôme
que l'en-tête du script désigne lui-même comme « le symptôme à surveiller » s'est produit — et le script
l'a imprimé sans en tirer la moindre conséquence.* **Un nombre que seul un humain remarquerait, dans un
journal de CI que personne ne lit, n'est pas un garde-fou : c'est une note de bas de page.**

**Ce qui atténue la portée, et je le dis parce qu'un gardien qui ne relativise pas ses trouvailles les
dévalue toutes** : la chaîne rattrape ce cas. `pnpm format:check` (dans `verify` **et** en CI, **avant**
ces deux contrôles) **rejette** un compose réindenté — vérifié par moi. **Le scénario est donc couvert
par la chaîne, pas par le garde-fou** — et le garde-fou ne le dit pas, alors qu'il énonce
scrupuleusement tout le reste de ce qu'il ne garde pas. Dépendre d'un voisin sans le déclarer est
précisément ce qui fait qu'on découvre la dépendance le jour où le voisin change.

**Correctif attendu, minimal** : faire échouer le contrôle quand le nombre d'éléments inspectés est nul
ou inférieur au nombre de services déclarés — ou, à défaut, écrire dans les limites que
l'indentation canonique est garantie par `format:check`.

### G.3.4 — Et un écart de pipeline, qu'il faut nommer

Le contrôle d'acceptation s'est tenu **sur un arbre qui bouge** : un commit (`d8d6515`) et **deux
réécritures non commitées** des scripts mêmes que j'auditais sont arrivés pendant la passe.
**C'est exactement l'écart V3 relevé à la 1ʳᵉ passe du lot L0** — « *un contrôle d'acceptation ne se
tient pas sur un arbre qui bouge* » — et il se reproduit. Il n'invalide pas mes mesures, qui sont
datées et rejouables ; **il m'a obligé à toutes les refaire**, ce qui est le coût exact de l'écart.

**Deux conséquences pratiques :**

1. **Les réécritures ne sont dans aucun commit au moment où je signe.** Elles ne peuvent donc porter
   aucun critère d'acceptation. **Elles devront être revues et testées par quelqu'un qui ne les a pas
   écrites** (09 §5.6) — mon contrôle par injection ne remplace pas une revue croisée.
2. **`AMELIORATIONS.md`, entrée du 2026-08-28, est à corriger** : « *Prouvé par injection dans **les
   deux formes possibles*** ». **Il y en avait cinq**, dont trois passaient. La réécriture le démontre
   mieux que moi. *Hors de mon périmètre d'écriture : je le signale, je ne le touche pas.*


## G.4 — Ce que j'ai éprouvé et qui tient réellement

Pour être juste : la méfiance a aussi confirmé du solide, et par mesure, pas par lecture.

- **Isolation réseau — vraie sur la machine, pas seulement dans le fichier.** Les 9 conteneurs sont sur
  `axion-audit-coolify-interne` ; **seul `caddy`** porte en plus `coolify`. **Épreuve TCP réelle** :
  depuis `api`, une connexion vers `u7zlql3bpb1xy5t4kg6jnvpm:5432` (le PostgreSQL du voisin) **n'aboutit
  pas** ; depuis `caddy`, elle aboutit. **Le risque résiduel documenté est exactement le risque réel** —
  c'est rare, et ça mérite d'être dit.
- **La sonde du worker est honnête** (§B.10.1), éprouvée par injection sur la machine.
- **L'image de l'API contient les migrations qu'elle déclare** — le 3ᵉ défaut dormant est réellement mort.
- **Les deux garde-fous sont câblés en CI**, pas seulement dans `verify` : `ci.yml:198` et `:205`.
  **La réserve F-1 du lot L1 ne se reproduit pas.**
- **`check:compose-coolify` apporte ce que Docker n'apporte pas** : j'ai refait la contre-épreuve,
  `docker compose config -q` rend **0** là où le script rend **1**.
- **`deploy-staging.yml` est bien inexécutable pour la raison annoncée** : `origin/main` ne porte que
  **16 fichiers** et pas ce workflow.

## G.5 — **ÉCART** : critère n° 3 (secrets provisionnés) — ce qui a été fait ne correspond pas à ce que le pack demande

Le critère n° 3 était `⬜ NON VÉRIFIÉ`. Le staging tourne, donc les secrets **existent**. Mais le pack ne
demande pas qu'ils existent, il demande une **pose** précise (02 §30.4-2), et elle n'est pas tenue :

- Le `.env` du staging, `/data/coolify/applications/<uuid>/.env`, est en **`-rw-r--r--` (644) root:root**,
  dans un répertoire **755**. Le pack impose **`chmod 600`**. **Tout compte local de la machine peut lire
  les secrets du staging** — sur une machine qui héberge aussi la production.
- **Aucune sauvegarde chiffrée du `.env` constatée**, alors que le dossier de porte insiste lui-même :
  « *sans elle, un PRA restaure une infrastructure sans ses clés* ».
- `/opt/axion-audit` — le chemin que le runbook et `pnpm infra:restore-test` désignent — **n'existe pas**
  sur la machine. Le runbook décrit une topologie que Coolify a remplacée.

**Le critère n° 3 reste donc ⬜ NON SATISFAIT**, et pour une raison plus précise qu'avant : ce n'est plus
« on n'a pas vérifié », c'est « on a vérifié, et la pose n'est pas celle du §30.4-2 ».

## G.6 — Ce que je n'ai PAS pu vérifier, et qui doit être dit

Un contrôle qui tait ses angles morts en fabrique.

1. **Le contenu des secrets.** La lecture du `.env` du staging m'a été refusée par la politique
   d'exécution, à juste titre. Je n'ai donc **pas** pu contrôler nominativement les **12 familles §30.3**
   sur la machine. Je n'atteste que les **métadonnées** : le fichier existe, il fait 2 464 octets, il est
   en 644 (§G.5). **Ce contrôle nominatif reste à faire par Williams, et il n'appartient pas à un agent.**
2. **La restauration réelle sur staging** (`restore-test.sh`). Je ne l'ai pas lancée : elle écrit, et mon
   mandat sur `axion-ia.com` est la lecture seule. **De toute façon elle ne peut pas réussir** — il n'y a
   aucune sauvegarde à restaurer (§G.2). C'est le cœur d'E35, et il reste non prouvé sur serveur.
3. **`pnpm schema:diff`** n'a pas été relancé. Justification mécanique et non confiance : le lot ne touche
   **aucun** fichier de `apps/api/drizzle/` ni de `apps/api/src/db/` (0 au diff, vérifié).
4. **Les deux README réécrits au commit `462ba70`** (`apps/worker/`, `.github/workflows/`) ont été produits
   **pendant ma passe**, par un agent parallèle. Je n'ai contrôlé que le point qui pouvait refaire la
   panne — les noms de files — et il est correct. **Le reste n'est pas relu par le gardien.**
5. **Le déploiement staging PAR LA CI** (critère n° 4) reste indémontrable avant le merge, pour une raison
   que j'ai vérifiée (§G.4) mais qui reste une **promesse** : le workflow n'a jamais tourné.
6. **La cause interne exacte** qui fait passer un échec d'`archive_command` en réinitialisation du cluster
   (plutôt qu'en simple réessai de l'archiveur) n'a pas été instruite. **Je rapporte le fait mesuré —
   275 cycles corrélés un pour un aux échecs d'`archive-push` — pas le mécanisme.** Le diagnostic revient
   à A11 ; la cause **proximale** (stanza absente) est, elle, certaine.
7. **Le comportement de la pile après correction** : je constate un état, pas une trajectoire. Rien de ce
   que j'écris ne prédit que la pile sera saine une fois la stanza créée — **cela devra être remesuré.**

---

# E. TRAVAUX PORTÉS À LA PORTE P-A

Reportés au fichier `docs/portes/PORTE_A_<date>.md` (11 §9bis), à cocher avec preuve :

1. `pnpm infra:up` → stack complète démarrée (démon Docker requis) — critère L0 n°1.
2. `pnpm infra:restore-test` → restauration **Postgres ET MinIO** depuis zéro — critère L0 n°2 et
   cœur de **E35**. Le point de contrôle n°1 reste le `pgbackrest stanza-create` manuel après le
   premier `up` (`DECISIONS.md`, point 12).
3. Provisionnement réel des 12 familles de secrets §30.3 en `chmod 600` + sauvegarde chiffrée du
   `.env` (sans elle, un PRA restaure une infra sans ses clés) — critère L0 n°3.
4. Création du dépôt distant privé, des Environments `staging`/`prod`/`ops`, protection de `main`,
   puis **premier déploiement staging par la CI** — critère L0 n°4.
5. Première exécution réelle du workflow nocturne de restauration.
6. Reconfirmation des tags d'images MinIO/`mc`/Caddy au provisionnement réel, puis gel définitif
   (`DECISIONS.md`, point 5).
7. Arbitrage Williams de la **fiche A-001** (`AMELIORATIONS.md`) : ABSORBÉE / PHASE 2 / REFUSÉE.
8. **Les réserves §D.1 à §D.4 du présent fichier, levées et prouvées.**
   → **V1, V2, V3 levés en 2ᵉ passe** (§D.0). Reste **V4 partiel** (§D.4bis) et les six manques du
   dossier de porte (§D.7).
9. **Retour d'A51 (sécurité) sur le périmètre L0** — durcissement 06 §10.3, secrets, CSP, ZAP.
10. Corriger l'affirmation « 23 entrées toutes au format » du dossier de porte (§D.7, ligne 1).

## E.bis — AJOUTS DU LOT L1 À LA LISTE DE LA PORTE P-A

À cocher avec preuve, au même titre que les dix précédents.

11. **Lever F-1** — l'invariant 2 n'est pas contrôlé en CI : fournir la liste de noms au job
    `invariants` **et** faire échouer `check:invariants` quand INV-2 ne peut pas être appliqué en
    intégration. À défaut : corriger le message qui affirme un câblage inexistant.
12. **Lever F-2** — restreindre la vérification « les DEUX missions » au seul fichier portant
    `@filrouge`.
13. **Lever F-3** — `pnpm test:e2e:filrouge` doit sortir en 0 tant qu'aucun test Playwright ne porte
    le tag (`--pass-with-no-tests`, comme sa voisine `test:critique`).
14. **Lever F-7** — tracer en `DECISIONS.md` le développement du lot L1 sur la branche `lot/l0-infra`.
15. **Régulariser les deux `TODO(A12)`** du gabarit de `db-generate.mjs` (§C.bis, §F.5).
16. **Corriger le dossier de porte** : §3bis (arithmétique 8+6 = 14, pas 11 ; « deux passes » alors
    qu'il y en a eu trois ; chiffres périmés face aux **43 mutations / 22 non détectées** de
    `docs/ETAT.md`), §4 (`check:decisions` **44** entrées et non 24 ; `check:jonction` **39** scripts
    et non 36), §6 (`DECISIONS.md` **44** entrées). **Hors de mon périmètre d'écriture : ces sections
    portent les preuves d'exécution d'A01, je les signale, je ne les touche pas.**
17. **Arbitrage Williams de la fiche AMELIORATIONS A-003** (schéma doré `pg_dump` en remplacement du
    manifeste) : elle touche un mécanisme que le contrat **11 §7 nomme**, donc elle ne relève pas de
    l'autopilote. **Position du gardien** : les 34 mutations éprouvées ce jour montrent que le
    dispositif actuel **tient**, à condition de garder le second verrou en liste noire. L'arbitrage
    reste utile mais il n'est plus urgent — le risque signalé au §3bis du dossier de porte
    (« chaque correction rétrécit un trou sans démontrer qu'il n'y en a pas d'autres ») est
    **atténué**, pas éliminé, par un contrôle en liste noire indépendant du comparateur.
18. **Migrations up/down sur staging** — ligne de DoD **NON SATISFAITE**, dépendante de L0-b.

## E.ter — AJOUTS DU LOT L0-b À LA LISTE DE LA PORTE P-A

Rangés par ordre de blocage, comme le §8 du dossier de porte. **Les points 19 et 20 sont bloquants :
la porte ne peut pas être signée tant qu'ils tiennent.**

19. 🔴 **BLOQUANT — créer la stanza pgBackRest du staging et remesurer.** `pgbackrest stanza-create`
    n'a jamais tourné sur `axionia-web` : l'archivage WAL est à zéro et **le cluster se réinitialise
    toutes les dix secondes** (§G.2). **Et ne pas s'arrêter au correctif** : l'étape est manuelle dans le
    runbook, donc elle sera oubliée **en production aussi**. Ce qui doit être livré n'est pas une commande
    tapée une fois, c'est **une mécanisation** — une étape de déploiement qui crée la stanza, ou une sonde
    de Postgres qui refuse d'être verte quand l'archivage ne l'est pas. → **A11, A01**
20. 🔴 **BLOQUANT — la sonde de santé de PostgreSQL ment**, exactement comme mentait celle du worker :
    `Up 46 minutes (healthy)`, `RestartCount = 0`, au-dessus de **275 réinitialisations en 46 minutes**.
    La leçon tirée du worker n'a été appliquée **qu'au worker**. **Passer les sondes des cinq services en
    revue avec la même question** : que prouve-t-elle exactement, et que ne prouve-t-elle pas ? → **A11, A53**
21. 🟠 **Commiter, faire relire et faire tester les DEUX réécritures de garde-fous** —
    `check-compose-coolify.mjs` (201 → 706 l.) et `check-isolation-reseau.mjs` (145 → ~600 l.) — qui
    étaient **non commitées** au moment de ma signature (§G.3.4). **Je les ai éprouvées par 11 injections,
    11 attrapées**, y compris les deux formes que je n'avais pas trouvées moi-même ; **mais un contrôle du
    gardien ne remplace pas une revue croisée**, et 09 §5.6 interdit que le test vienne de l'auteur.
    → **A17 ou A11, puis A02**
21bis. 🟠 **Asserter le compteur au lieu de l'afficher** (§G.3.3) : `check:isolation-reseau` sort en **0**
    sur un fichier réindenté portant la faute, en imprimant un compteur qui passe de 10 à 9 — le symptôme
    que son propre en-tête désigne comme celui « à surveiller ». Le faire **échouer** quand le compte
    s'effondre ; à défaut, **écrire dans ses limites qu'il dépend de `format:check`** pour l'indentation
    canonique. Même remarque pour son voisin. → **A11**
22. 🟠 **Corriger l'entrée `AMELIORATIONS.md` du 2026-08-28** : « les deux formes possibles » — il y en a
    **trois** (§G.3). *Hors de mon périmètre d'écriture.*
23. 🟠 **Critère n° 3 — reposer les secrets selon 02 §30.4-2** : `.env` du staging en **600** et non 644,
    **sauvegarde chiffrée du `.env`** effectivement constituée, et **contrôle nominatif des 12 familles
    §30.3 par Williams** — que je n'ai pas pu faire (§G.5, §G.6-1). → **Williams**
24. 🟡 **Remplacer, ou justifier, l'empreinte de seed `e6fe311a…`** : aucun outil du dépôt ne la produit
    (§G.0). L'artefact reproductible est le tableau des **8 empreintes par table** de `seed.mjs --empreinte`.
    *Une preuve qu'on ne peut pas rejouer n'est pas une preuve.* Corriger aussi « les 7 référentiels » du
    dossier §3 : l'outil en imprime **8** (`users` incluse). *Hors de mon périmètre.*
25. 🟡 **Mettre `infra/README.md` en accord avec la machine** : `/opt/axion-audit` n'existe pas, et
    `pnpm infra:restore-test` pointe toujours `/opt/axion-audit/prod/.env` (§G.5).
26. 🟡 **Surveiller la capacité de la machine, maintenant qu'elle construit ses images sur place** :
    **14,19 Go de cache de construction** (8,86 Go récupérables) et 15,76 Go d'images récupérables. Le
    chiffre « 9 Go libres sur 15 » ne mesure rien de cela (§G.0).
27. 🟡 **Corriger les chiffres périmés du dossier de porte** §4 et §6 : `DECISIONS.md` **47** entrées (et
    non 45), `check:jonction` **41** scripts / **77** variables (et non 39/76). *Hors de mon périmètre —
    ces sections portent les preuves d'A01.*

---

## Journal des passes de contrôle

| Date | Passe | Lot | Commit | Verdict du gardien |
| --- | --- | --- | --- | --- |
| 2026-08-27 | 1ʳᵉ | L0 | `ce5b912` | **VETO** — V1 CI rouge · V2 HEAD ne démarre pas · V3 pipeline hors séquence · V4 gouvernance. 1 code orphelin (`axion:sauvegardes`) |
| 2026-08-27 | 2ᵉ | L0 | `fdd5f59` | **ACCEPTÉ SOUS RÉSERVE** — V1/V2/V3 levés et éprouvés · **0 code orphelin** · V4 partiel · 6 manques au dossier de porte |
| 2026-08-27 | 1ʳᵉ | **L1** | **`bf7f6ca`** | **ACCEPTÉ SOUS RÉSERVE** — les **4 critères du fichier 07 cochés avec preuve exécutée** · **43 tables livrées, 43 rattachées, 0 orpheline** · tous les chiffres recomptés, **aucun faux** · 38 mutations injectées, **38 détectées** · **3 écarts** : **F-1** (invariant 2 non contrôlé en CI — le plus grave), **F-2** (garde-fou `@filrouge` partiellement décoratif), **F-3** (`test:e2e:filrouge` en échec) · 1 écart de gouvernance **F-7** (branche) · 1 ligne de DoD **NON SATISFAITE** (migrations sur staging, dépend de L0-b) |
| 2026-08-28 | 1ʳᵉ | **L0-b** | **`462ba70`** | **REFUSÉ** — **24 artefacts livrés, 24 rattachés, 0 orphelin** ; **180 tests verts, 0 skippé** ; migrations up/down **rejouées par moi sur staging** ; isolation réseau et sonde du worker **éprouvées par injection sur la machine** — *le code du lot est bon*. **Mais l'environnement qu'il livre ne l'est pas** : le **PostgreSQL du staging se réinitialise 275 fois en 46 minutes** (stanza pgBackRest jamais créée), **archivage WAL à zéro**, **et Docker le déclare `healthy`** — la troisième sonde menteuse du projet (**§G.2**). Le dossier annonçait « 9 services, tous sains ». **Critère L0 n° 1 NON RECOCHÉ** (§G.1) · **critère n° 3 NON SATISFAIT**, `.env` en 644 (§G.5) · garde-fous neufs : **2 injections sur 8 non détectées** dans les versions du lot, **corrigées par deux réécritures NON COMMITÉES** que j'ai rejouées (11/11) mais qui n'ont pas de revue croisée (§G.3) · 3 chiffres faux ou non reproductibles (§G.0) · **contrôle tenu sur un arbre qui bouge — récidive de l'écart V3** (§G.3.4) |

| 2026-08-28 | 2ᵉ | L0+L1+L0-b — **rejeu intégral P-A** | `1c56759` | **🟡 ACCEPTÉ SOUS RÉSERVE** — voir **§H**. 15 artefacts nouveaux, **15 rattachés, 0 orphelin** · F-1/F-2/F-3/F-7 levées · **R-2** (chaîne de sauvegarde absente du chemin de production) et **R-4/R-5** ouvertes |
| **2026-08-31** | **1ʳᵉ** | **L2 · L3a · L4 · L0-c/d/e** | **`6b9cc7c`** | **🟡 ACCEPTÉ SOUS RÉSERVE — les DEUX sens tenus, et le second sur le DÉPÔT ENTIER pour la première fois.** **6 routes, 6 rattachées** (11 §8.6) · 1 table + 4 colonnes rattachées · **130 fichiers de code énumérés, en-tête lu un par un** · **567 tests exécutés par moi, RC=0, 0 skippé** (312 unitaires + 255 d'intégration) · **E21 passe à `couverte`** — la première du projet. **1 code ORPHELIN déclaré** (`infra/scripts/empreinte-docker.sh`, §B.11.7-4) et **3 réserves de déclaration**. **Réserves** : **(R-9)** E45 — L2 devait livrer le refus d'affectation sur `habilitated_at`, il a livré la **lecture** et le socle cite E45 quand même (§I.5) · **(R-10)** le critère L2 « CRUD users + garde-fou §9.7 » **n'est pas livré** — la porte P-B ne peut pas le cocher · **(R-2 inchangée)** aucun `sauvegarde` ni `createstanza` sur le chemin de production (§I.1) · **(R-5 AGGRAVÉE)** **9 garde-fous sur 14 sans aucun test**, contre 5 sur 10 à P-A (§I.4) · **(R-11)** `check:porte-journal` n'est **dans aucun workflow ni aucun hook** (§I.2) · **(R-12)** deux lots ont travaillé **dans le même répertoire** pendant la passe (§B.11.7 bis-2) |

**Signature du gardien de la spécification :** A02 — **2026-08-28, sur `462ba70` : REFUSÉ.**

**Étape 6 du pipeline NON FRANCHIE pour le lot L0-b.** Le refus ne porte pas sur le travail livré — il
est bon, mesuré, et il répare trois défauts dormants dont un qui aurait cassé la migration en
production. **Il porte sur ce que le dossier affirme de la machine.** Un staging dont la base de
données redémarre toutes les dix secondes, présenté comme « 9 services, tous sains », ne peut pas
franchir un contrôle d'acceptation : ce serait cocher une apparence de santé pour la troisième fois en
deux jours, après le worker mort et sa sonde, et après le critère n° 1 coché sur cette même apparence.

**Ce qui lève le refus est court et vérifiable** : les points **19, 20 et 21** du §E.ter, puis une
**remesure de la pile** — pas une déclaration. Les points 22 à 27 sont des réserves qui accompagnent la
porte sans la bloquer.

*Trace de méthode, pour la passe suivante.* Ce que le lot L1 avait appris — « toutes les réserves
portaient sur des contrôles qui annoncent plus qu'ils ne font » — s'est vérifié une fois de plus, et
d'un cran plus haut : cette fois ce n'est pas un script qui annonce trop, c'est **le démon Docker**.
La règle qui en sort et qui vaut pour tous les lots suivants : **une sonde de santé est un livrable
comme un autre, elle se rattache à une exigence, et elle s'éprouve par injection — jamais par lecture.**
Étape 6 du pipeline **franchie sous réserve** : les réserves F-1, F-2, F-3, F-7 sont **portées à la
porte P-A** et doivent être levées **avant** la signature de Williams. Aucune ne remet en cause le
schéma lui-même, qui est la substance du lot ; toutes portent sur des **contrôles qui annoncent plus
qu'ils ne font** — c'est-à-dire sur le seul défaut que ce lot poursuit depuis trois passes, et qu'il
n'a pas fini d'extirper.

---

# H. SECONDE PASSE DE LA PORTE P-A — REJEU INTÉGRAL, 2026-08-28, SUR `1c56759`

> **Cadre.** La porte P-A a été **REFUSÉE** le 2026-08-28 sur `462ba70`. Le 09 §4bis impose qu'une
> porte échouée **se rejoue EN ENTIER**. Je n'ai donc repris aucune de mes cases, ni celles cochées
> entre-temps par A01 ou A60 : les huit critères, les dix lignes de DoD et les deux sens de la
> traçabilité sont recomptés. **Verdict : 🟡 ACCEPTÉ SOUS RÉSERVE** — motivé dans
> `docs/portes/PORTE_A_2026-08-27.md` **§9-10**, qui est le document que Williams signe.
>
> **Conditions de mesure.** Poste de développement, **Node v24.19.0 — hors de l'épingle 11 §1**
> (`>=22.11.0 <23`) ; base PostgreSQL 16 jetable créée par moi ; serveur `axionia-web` en **lecture
> seule stricte**. Production d'un tiers sondée **avant** (301 en 0,451 s) **et après** (301 en
> 0,249 / 0,219 / 0,133 s) : aucune dégradation.

## H.0 — Ce que ce fichier portait de FAUX, et qui est corrigé ci-dessus

*Un dossier qui crie au loup sur un point réparé décrédibilise les points qui, eux, tiennent.* Sept
affirmations de cette matrice étaient périmées au 2026-08-28. Elles sont **barrées et remplacées en
place** — jamais effacées — et récapitulées ici :

| # | Affirmation périmée | Où | Ce qui est vrai |
| --- | --- | --- | --- |
| 1 | « le PostgreSQL du staging se réinitialise toutes les ~10 s » | **§A E17** | **§H.1** — 0 réinitialisation sur ~3 h |
| 2 | « **RÉGRESSION** : archivage WAL du staging inopérant, cluster réinitialisé 275 fois en 46 min » | **§A E35**, **§A.quater** | **§H.2** — `status: ok`, 31 WAL archivés, 0 échec |
| 3 | **« ÉCART BLOQUANT » (§G.2)** — *le seul bloquant de la porte, et il n'existe plus* | **§G.2**, et **§G.1** qui en découlait | **§H.1 et §H.2** |
| 4 | « la réécriture des garde-fous n'est dans aucun commit et n'a pas de revue croisée » | **§A E33** | **§H.6** — commitée et gardée par 53 tests d'injection |
| 5 | « le `.env` du staging est en 644 et non 600 » présenté comme un défaut | **§A E33** | **§H.5** — le chemin n'est pas traversable ; **c'était mon erreur** |
| 6 | « le garde-fou mécanique de l'invariant 2 ne tourne pas en CI » (F-1) | **§A E31**, **§A E36** | **§H.6** — câblé ; il reste un secret à créer |
| 7 | « 169 tests verts » | **§A E36** | **356 tests verts**, RC=0, 0 skippé |

## H.1 — Le socle du staging est sain, et je l'ai mesuré plus longtemps que quiconque

`grep -ci reinitializing` sur **l'intégralité** du journal Docker de `postgres` → **0**. Idem pour
« database system was not properly shut down » → **0**. Le journal court de **11:28:01** à
**14:08:32 UTC** ; à la cadence constatée la veille (une réinitialisation toutes les ~10 s), cette
fenêtre en aurait porté **≈ 1 050**. Corroborations indépendantes du journal :
`pg_postmaster_start_time()` → cluster **continu depuis 02:56:07** · `docker inspect` →
`RestartCount = 0`, `health = healthy` · sonde configurée `["CMD","axion-healthcheck"]` —
**`pg_isready` a disparu** · les **7 conteneurs** du projet sont `Up 3 hours (healthy)`.

**Portée honnête, et elle n'a pas changé** : le journal Docker ne remonte qu'au dernier déploiement.
~3 h est **décisif contre CETTE boucle** ; ce n'est toujours pas une preuve de stabilité longue, et
le journal PostgreSQL ne persiste toujours pas hors du conteneur.

## H.2 — La chaîne de sauvegarde restaure, et ce n'est plus un exploit manuel

`pgbackrest --stanza=axion info` → **`status: ok`**, `cipher: aes-256-cbc`, WAL
`000000010000000000000001` → `000000010000000000000021` **continus**, une complète
`20260828-072358F` (32,1 Mo → **3,8 Mo**) et **quatre** incrémentales produites par le service seul.
`pg_stat_archiver` : **31 archivés, 0 échec**. La sonde du service, exécutée à la main : « sonde
sauvegarde OK — sauvegarde locale il y a 6 h, copie hors serveur vérifiée il y a 3 h (seuil 30 h) ».

**Et ce qui compte davantage : la restauration est passée de l'exploit à la suite de tests.**
`apps/api/tests/l0-restauration.integration.test.ts` — **8 tests, tous `@critique`, exécutés par moi,
verts** : empreinte du jeu de référence **identique** après restauration, **contre-épreuve** qui
refuse une empreinte fausse, `archive_mode=off` épinglé, passe réussie avec `postgres_data` **en
lecture seule** ; MinIO restitué au **sha256** près, versioning, politiques publique et privée,
comptes de service. S'y ajoutent les **43** tests de `l0-sauvegarde` (rotation, `pipefail`, disque
plein, `gpg` absent, passes simultanées, horloge qui recule, marqueur piégé). **J'ai lu le code de la
sonde de sauvegarde, pas seulement son en-tête** : elle exige `backup.info` non vide, une archive
MinIO réelle au-dessus d'un plancher de taille **mesuré**, un `.sha256` bien formé de 64 caractères,
et elle recalcule l'empreinte sous plafond. *Elle fait ce qu'elle annonce, et elle énumère elle-même
ce qu'elle ne prouve pas.* C'est le contraire de la famille de défauts de ce dépôt.

## H.3 — **ÉCART NEUF** : la chaîne prouvée n'existe que sur UNE cible sur cinq

Le service `sauvegarde` — passe planifiée, archive MinIO chiffrée, **expédition R2**, sonde, coffre —
est défini dans **`infra/docker-compose.coolify.yml` et nulle part ailleurs**. Services de
`infra/docker-compose.prod.yml` : `postgres`, `redis`, `minio`, `api`, `worker`, `field`, `hq`,
`caddy` — **pas de `sauvegarde`** ; et le compose de base ne le porte pas davantage. Une production
déployée selon `infra/README.md` suivrait l'**autre** chemin, celui du lot L0 : `install-cron.sh` →
`backup-postgres.sh` / `backup-minio.sh` / `backup-caddy.sh` — et **aucun de ces trois scripts ne
contient une ligne d'expédition hors serveur, de sonde ou de coffre** (recherche
`R2|rclone|mc mirror|expedi` → aucun résultat). **E35 est prouvée sur le staging et énoncée comme une
propriété du système.**

## H.4 — **ÉCART NEUF ET DOMINANT** : le staging exécute `64b5aa2`, pas `1c56759`

Trois mesures indépendantes et concordantes :

1. le script embarqué dans le conteneur `sauvegarde` a pour md5 **`47b1bd1c25c6a96161215b595f7950a6`**,
   qui est **exactement** la version de `infra/postgres/sauvegarde.sh` au commit **`64b5aa2`** — les
   versions `beb0024` et `fb7eecb` ont d'autres empreintes ;
2. `packages/shared/src/redaction.ts` présent dans l'image de l'API a pour md5
   **`d3345c9b90d0e8359104f42555b48260`** = la version du commit **`12e060c`**, c'est-à-dire **celle
   que `879076a` corrige au motif qu'elle « laissait fuir les mots de passe »** ;
3. les quatre images sont datées **11:26–11:27 UTC** ; `64b5aa2` est horodaté **11:25:45 UTC**.

**Conséquences.** Le correctif RGPD est dans le dépôt et **sur aucune machine** — le staging,
joignable publiquement, journalise avec la version fautive. Le **coffre des secrets n'a jamais tourné
nulle part** : le journal du service `sauvegarde` ne porte **aucune** ligne « COFFRE DES SECRETS »,
alors que le script en émet une **à chaque démarrage, dans les deux branches**. Et
`PORTE_A §2quater` annonce toujours « Commit déployé : `2a9b136` ».

*C'est le quatorzième membre de la famille « un garde-fou qui annonce plus qu'il ne fait », et le
premier qui se situe au niveau du dossier : **le dossier atteste d'une machine sur laquelle le code
attesté ne tourne pas**. Le dépôt a tiré la leçon « une sonde applicative verte ne prouve pas qu'un
déploiement a eu lieu » ; **la leçon symétrique — rien ne vérifie qu'un correctif mergé atteint la
machine — n'a pas été tirée.***

## H.5 — Ce qui a été rectifié DANS MES PROPRES CONSTATS

Deux affirmations de la passe précédente étaient de moi, et elles étaient fausses. Je les reprends à
mon compte plutôt que de les laisser corriger par d'autres :

- **« tout compte local peut lire les secrets du staging »** — faux. `/data/coolify` et
  `/data/coolify/applications` sont en **700** ; le chemin n'est pas traversable, la lecture en tant
  que `nobody` a été **refusée par tentative réelle**, et la machine n'a aucun utilisateur humain à
  shell hormis root. Le `644` du fichier est **inatteignable**. *Une permission lue isolément ne dit
  rien de l'accès — c'est la même erreur que `pg_isready` : vrai sur ce qu'il mesure, sans rapport
  avec la question posée.*
- **« aucun accès SSH »** — faux : l'alias `ssh axionia-web` fonctionne, et toutes les mesures
  serveur de la présente passe passent par lui.

## H.6 — Les réserves F-1 à F-7 du lot L1 : état après rejeu

| Réserve | État | Preuve |
| --- | --- | --- |
| **F-1** — invariant 2 non appliqué en CI | ✅ **LEVÉE**, avec une suite due par Williams | `ci.yml` job `invariants` passe `AXION_CLIENTS_SURVEILLES` par un secret de dépôt ; le script **échoue volontairement en CI** sans liste. ⚠️ **Tant que le secret n'existe pas, la CI est rouge au merge.** Mon vert local vient d'un `docs/.clients-surveilles.txt` non versionné : il ne dit rien de la CI |
| **F-2** — la moitié « les DEUX missions » du garde-fou `@filrouge` | ✅ **LEVÉE** | `check-test-projects.mjs` ne cherche plus `FIL-TPE`/`FIL-GC` dans la concaténation de tous les tests, mais **uniquement dans les fichiers portant `@filrouge`**. `pnpm test:filrouge` → **RC=0, 5 tests verts**, les deux échelles réellement couvertes, test par test |
| **F-3** — `pnpm test:e2e:filrouge` sort en 1 | ✅ **LEVÉE** | Le script n'existe plus ; `package.json` déclare `test:filrouge` (projet intégration), **RC=0** |
| **F-7** — L1 développé sur la branche de L0 | ✅ **LEVÉE** | Entrée `DECISIONS.md` du 2026-08-28 au format 11 §9bis, avec la règle pour la suite. `check:decisions` → **56 entrées, toutes au format** |
| Garde-fous d'isolation réécrits « non commités » | ✅ **LEVÉE** | Commitée (`beb0024`, `15ce18c`) et gardée par **53 tests d'injection** (`scripts/garde-fous-compose.test.ts`) qui exécutent le script **livré** ; `check:isolation-reseau` et `check:compose-coolify` → **RC=0** sous mon exécution |

## H.7 — **RÉSERVES NEUVES** : là où le dépôt répare sans garder

| # | Constat mesuré | Portée |
| --- | --- | --- |
| **R-3** | Le §8 D-3 écrit que le coffre est « écrit, **éprouvé**, et inactif ». **Aucun des 18 fichiers de test ne mentionne le coffre ni `BACKUP_SECRETS_PASSPHRASE`** (0 occurrence), et le commit `fb7eecb` (+528 l. dans `sauvegarde.sh`) **ne touche aucun test** — dans un dépôt où la sauvegarde voisine en compte 43. Ce qui est éprouvé est le **refus**, pas la **production** du coffre | **Le mot « éprouvé » est à retirer** tant qu'un test ne le porte pas |
| **R-4** | `packages/shared/src/redaction.ts` : **617 lignes**, unique politique de journalisation de l'API **et** du worker, interdiction explicite du contrat 11 §2, `censor` **fonctionnel** (parcours de sous-arbres + nettoyage de chaînes). **Zéro test.** Le projet `unit` ne capte que 3 fichiers ; elle n'est pas non plus dans `.github/coverage-critical-paths.json`. **Je l'ai éprouvée moi-même par injection dans pino : 10 valeurs témoins, 10 masquées** (mot de passe, e-mail, `person_name` à 4 niveaux, jeton d'en-tête, jeton dans `msg`, e-mail dans `err.message`, mot de passe dans `req.url`) | **Défaut de garde, pas de comportement** : elle a déjà régressé une fois aujourd'hui, rien n'empêchera la prochaine |
| **R-5** | **Cinq garde-fous sur dix n'ont aucun test** : `check:pack`, `check:decisions`, `check:jonction`, `check:test-projects`, `check:schema-inventaire`. Ont le leur : `check:invariants`, `check:no-skipped-tests`, `check:compose-coolify`, `check:isolation-reseau`, `schema:diff` | `check:test-projects` est **précisément** celui dont j'avais démontré le faux vert (F-2) : **réparé sans test de non-régression** |
| **R-6** | Le job `invariants` de la CI lit `AXION_CLIENTS_SURVEILLES` depuis un **secret de dépôt** et **échoue volontairement** si aucune liste n'est fournie. **Tant que Williams n'a pas créé ce secret, la CI sera rouge au merge** — au moment exact où le critère L0 n° 4 doit se prouver. **Zéro occurrence de ce point dans le dossier de porte avant la présente passe** | **Condition de merge non écrite** — deux minutes pour Williams |
| **R-8** | `schema-diff.mjs` **n'est PAS dans l'image** de l'API (`find / -name schema-diff.mjs` → rien). L'affirmation de la ligne de DoD « `schema-manifest.json`, `cat drizzle/*.sql` et `schema-diff.mjs` ont le même md5 dans l'image et dans le dépôt » est **inexacte sur son troisième terme** | Les deux autres tiennent : manifeste **`5c485c4d529833e79680945c7040b996`** identique, **12** migrations présentes |
| **R-7** | `docs/ETAT.md` et le commit `15ce18c` disent **huit** défauts fabriqués ; l'en-tête de `scripts/garde-fous-invariants.test.ts`, qui les répare, dit **dix** | **À réconcilier avant signature** — ce dossier a déjà perdu la crédibilité de trois chiffres pour ce motif |

## H.8 — Sens 2, code → exigences : le contrôle anti-orphelin, rouvert après 37 commits

`git diff --name-status 462ba70..HEAD` → **17 fichiers ajoutés**, dont **15 artefacts** de code ou
d'infrastructure. **Les quinze sont rattachés ; aucun n'est orphelin.** Le tableau nominatif est au
§9.4 du dossier de porte. Deux constats de gouvernance en sortent :

1. **`docs/conception/SERVEUR_DEDIE.md` (207 l.) n'a aucune fiche `AMELIORATIONS.md`** alors qu'elle
   pose **six questions à Williams** (§6) absentes du dossier de porte. Rien n'y est implémenté —
   11 §8-7 est respecté sur le fond — mais le canal d'amélioration a « un registre, un plafond et un
   arbitre » (09 §5.9) : **une proposition qui contourne le registre contourne aussi l'arbitre.**
2. **La règle de croisement (09 §5.6) n'est pas vérifiable par moi** : les 37 commits portent le même
   auteur git. Les fichiers de test **déclarent** leur auteur croisé (« écrit par A75, qui n'est
   l'auteur d'aucun des deux scripts testés ») — une déclaration, pas une preuve, et elle vaut mieux
   que le silence.

Périmètre inchangé par ailleurs : **2 routes** dans tout le dépôt (`GET /v1/health`,
`GET /v1/health/ready`), **aucune route nouvelle** au sens du 11 §8.6 · **3 TODO**, ni plus ni moins ·
**0 test skippé**, **0 test orphelin** sur 18 fichiers.

## H.9 — Ce que je n'ai PAS pu vérifier, et qui doit être dit

1. **La chaîne up/down SUR le staging.** Elle exige de créer et détruire une base, donc d'écrire ; mon
   mandat est en lecture seule stricte. Je m'appuie sur la mesure d'A60 **en le disant**. Ce que j'ai
   pu faire depuis le conteneur, sans rien écrire : `migrations.mjs --check` → **12 appliquées, 0 en
   attente**, et **44 tables** en base.
2. **Le contenu du `.env` du staging** — refusé par la politique d'exécution, à juste titre. **Le
   contrôle nominatif des 12 familles §30.3 reste dû, et il appartient à Williams.**
3. **Les README, ligne à ligne.** Ce n'est pas mécanisable et je préfère le dire plutôt que de le
   laisser croire. La réserve tient : `infra/README.md` et `pnpm infra:restore-test` désignent
   `/opt/axion-audit`, **qui n'existe pas** sur `axionia-web`.
4. **Le verdict d'A51**, non rendu pour la **quatrième** fois. Je verse deux mesures à son dossier
   sans les confondre avec son verdict : ports **9000/9001/5432/6379 fermés** depuis l'extérieur
   (MinIO n'est exposé nulle part), et redaction **effectivement masquante** sur dix valeurs témoins.
5. **Le renouvellement du certificat** du staging (échéance 26/11) — un renouvellement qu'on n'a pas
   vu passer reste un renouvellement qu'on n'a pas vu passer.

**Signature du gardien de la spécification :** A02 — **2026-08-28, sur `1c56759` : 🟡 ACCEPTÉ SOUS
RÉSERVE.** Étape 6 du pipeline **franchie sous réserve**.

> **MISE À JOUR DU 2026-08-28, APRÈS REDÉPLOIEMENT — R-1 EST LEVÉE, ET UN DE MES CHIFFRES ÉTAIT FAUX.**
> Le staging a été redéployé sur `1eeaff2` pendant ma passe. **Revérifié par moi, par empreinte de
> fichier et non par numéro de commit** — le seul instrument qui ne se laisse pas raconter d'histoire :
> `redaction.ts` **932cf7b40aa0…**, `sauvegarde.sh` **549daad7dce5…**,
> `sauvegarde-healthcheck.sh` **3b581097e965…** — **identiques entre le dépôt et l'image en service**.
> Images reconstruites à **14:52 UTC** (commit à 14:50:48). Le coffre **parle enfin** et refuse
> correctement de retomber sur la passphrase des données. Pile revérifiée : `reinitializing` **0**,
> `archived_count=32 / failed_count=0`, staging **200** ×4, production du tiers **301**.
> **Correction de MON chiffre : j'avais écrit « 9 commits de retard » ; `git rev-list --count` en rend
> **11**. Le fond était exact, le comptage ne l'était pas.**
> **Contrepartie que je m'applique à moi-même** : le redémarrage a **remis ma fenêtre d'observation à
> 30 minutes** (elle était de ~3 h). C'est la réserve même que j'opposais à la mesure de 25 min d'A60.
> **Ce que R-1 laisse derrière elle et que le redéploiement ne répare pas : rien ne vérifie qu'un
> correctif poussé atteint la machine.** Contrôle d'empreinte image-vs-dépôt **toujours dû**.

Reste **R-2 (chaîne de sauvegarde absente du chemin de production, §H.3)**, qui ne se lève **ni par
un redéploiement ni par une réécriture de texte** : il faut soit **porter le service `sauvegarde` sur
le compose de base ou la surcharge `prod`**, soit **écrire noir sur blanc que la production n'aura pas
cette chaîne** — et en tirer la conséquence sur E35 et l'invariant 8. Le détail du
verdict, ce qui est réservé et ce qui ne l'est pas, et les six points qui attendent Williams hors du
dossier, sont dans `docs/portes/PORTE_A_2026-08-27.md` **§9-10**.

---

# I. CE QUE LE SENS 2 A TROUVÉ ET QUE LE SENS 1 NE POUVAIT PAS VOIR (2026-08-31)

> **Pourquoi cette section existe.** Le sens 1 part de l'exigence et cherche le code : il trouve ce
> qui **manque**. Le sens 2 part du code et cherche l'exigence : il trouve ce qui **ment** — un module
> qui cite une exigence qu'il ne sert pas, un garde-fou que rien ne déclenche, une justification dont
> la prémisse a cessé d'être vraie. Les six constats ci-dessous n'auraient été produits par aucun
> autre chemin. **Deux d'entre eux corrigent ce fichier lui-même.**

## I.1 — **R-2 CONFIRMÉE, ET UNE DE MES PROPRES AFFIRMATIONS ÉTAIT FAUSSE** (E35, invariant 8)

**Le constat de fond tient, et je l'ai remesuré.** Le service `sauvegarde` — passe planifiée, archive
chiffrée, expédition R2, **sonde**, **coffre des secrets** — est défini dans
`infra/docker-compose.coolify.yml` et **nulle part ailleurs**. Services de
`infra/docker-compose.prod.yml` : `postgres`, `redis`, `minio`, `api`, `worker`, `field`, `hq`,
`caddy`. **Pas de `sauvegarde`.** E35 reste prouvée **sur une cible sur cinq**.

**Mais le §H.3 énonce ce constat avec un argument qui est FAUX, et je le retire.** Il écrit :
« *aucun de ces trois scripts ne contient une ligne d'expédition hors serveur, de sonde ou de coffre
(recherche `R2|rclone|mc mirror|expedi` → aucun résultat)* ». **Mesuré aujourd'hui, la recherche rend
des résultats** : `infra/scripts/backup-postgres.sh:85-87` copie vers la Storage Box Hetzner (étape
3/5) et `:108-113` exécute un `rclone sync` hebdomadaire hors Hetzner (étape 4/5, sous
`OFFSITE_RCLONE_REMOTE`) ; `backup-minio.sh` s'annonce dès sa troisième ligne comme une sauvegarde
« par `mc mirror` ». **Le chemin de production a bien une expédition hors serveur.** De même, le
`createstanza` que §H.3 laissait croire absent est présent dans le compose **de base**
(`infra/docker-compose.yml:189`), donc hérité par la surcharge `prod`.

**Ce qui reste vrai après correction est plus précis, et pas moins grave.** Le chemin de production
n'a **ni sonde de sauvegarde, ni coffre des secrets** (0 occurrence de `passphrase`/`coffre` dans les
trois scripts) — c'est-à-dire aucun des deux dispositifs qui font qu'une sauvegarde *qui a cessé de
fonctionner* se remarque. Et il y a pire, que le dépôt écrit lui-même : `infra/README.md` classe le
chemin « VPS dédié (prod future) » comme **« intégralement JAMAIS JOUÉ »**, et son tableau §7.4 marque
`backup-postgres.sh`, `backup-minio.sh`, `backup-caddy.sh`, `install-cron.sh` et `restore-test.sh`
**tous « JAMAIS JOUÉS »**, chacun avec la variable d'environnement qui manque.

**Conséquence sur l'invariant 8**, qui exige une sauvegarde **testée, au présent** : elle est tenue
sur le staging Coolify et **elle n'est pas tenue sur le chemin qu'une production suivrait**. R-2 ne se
lève **ni par un redéploiement ni par une réécriture de texte** : il faut **porter le service
`sauvegarde` sur le compose de base ou la surcharge `prod`**, ou **écrire noir sur blanc que la
production n'aura pas cette chaîne** et en tirer la conséquence sur E35.

## I.2 — **LE GARDE-FOU D'E42 N'EST DÉCLENCHÉ PAR RIEN** (R-11)

`scripts/check-porte-journal.mjs` (269 l.) est **l'unique mécanisme** qui prouve la propriété centrale
du lot L2/T4 : `activity_log` n'a qu'une porte d'écriture, et **aucun** fichier n'a le droit d'y faire
un `UPDATE` ou un `DELETE` (invariant 7). C'est aussi le seul contrôle qui regarde les `.sql` et les
`.mjs`, que ESLint n'analyse pas.

**Mesuré** : `grep -rn "porte-journal" .github/ .husky/` → **aucune occurrence**. Il n'existe que dans
l'agrégat local `pnpm verify`. **Rien ne le déclenche sur une *pull request*.**

*C'est la réserve F-1 du lot L1 qui revient sous une autre forme.* F-1 disait : « un garde-fou existait
et ne tournait nulle part ». La leçon avait été tirée au lot L0-b — les deux contrôles neufs y avaient
été câblés **dans la CI**, et le §B.10.2 le célébrait. Trois lots plus tard, le garde-fou de l'invariant
le plus austère du projet est de nouveau hors CI. **Une leçon tirée une fois n'est pas une leçon tenue :
elle doit être réarmée à chaque lot, exactement comme le dit `.github/coverage-critical-paths.json` —
« un garde-fou ne se répare pas une fois : il se réarme ».**

Deux écarts jumeaux, moins graves mais de la même famille : `check:executabilite`, `schema:diff` et
`check:schema-inventaire` sont **en CI et absents de `pnpm verify`** — l'agrégat que le contrat 11 §6
désigne comme la commande de fin d'incrément **ne rejoue donc pas tout ce que la CI rejouera**. Et
`infra/scripts/empreinte-docker.sh` (393 l.) n'est câblé **nulle part** (§B.11.7-4).

## I.3 — **UNE JUSTIFICATION DONT LA PRÉMISSE EST DEVENUE FAUSSE** (E17, E43)

`apps/api/src/http/zod.ts` explique pourquoi il ne pose **pas** le crochet `onRoute` qui rendrait la
déclaration `schema:` in **et** out **obligatoire** sur chaque route (11 §3). Son motif, écrit :

> « *les routes d'authentification du lot L2 valident leurs entrées/sorties DANS le gestionnaire
> (`loginRequestSchema.parse(requete.body)`) et non dans `schema:`. Un tel crochet les refuserait alors
> qu'elles tiennent l'exigence.* »

**Cette prémisse n'est plus vraie.** La migration déclarative du 2026-08-30 a supprimé les `parse()`
manuels : les trois routes de `domaines/auth/routes.ts` déclarent aujourd'hui
`schema: { body: …, response: { 200: … } }`, et les six routes du dépôt sont désormais soit
déclaratives, soit dispensées au titre du lot L0 (les deux sondes). **L'obstacle que le fichier invoque
a disparu ; le fichier l'invoque encore.**

C'est un défaut de traçabilité au sens strict : un lecteur — humain ou agent du lot L3b — ouvre ce
fichier pour savoir si l'obligation est due, y lit une raison de ne pas la poser, et **ne peut pas
deviner qu'elle est périmée**. `DECISIONS.md` du 2026-08-29 [L3a] avait pourtant écrit la condition de
levée en toutes lettres : « *crochet `onRoute` branché seulement au moment de la migration des routes
L2* ». **La migration a eu lieu. Le crochet est dû.** Ni le fichier ni `DECISIONS.md` ne portent la
trace de cette échéance atteinte.

## I.4 — **R-5 N'A PAS PROGRESSÉ, ELLE A EMPIRÉ** (E36)

À la porte P-A, la réserve R-5 constatait : « **cinq garde-fous sur dix n'ont aucun test** ». Recompté
aujourd'hui, garde-fou par garde-fou :

| Ont un test d'injection | N'en ont AUCUN |
| --- | --- |
| `check:invariants` · `check:no-skipped-tests` (`garde-fous-invariants.test.ts`, 49 cas) · `check:compose-coolify` · `check:isolation-reseau` (`garde-fous-compose.test.ts`, 47 cas) · `schema:diff` (`l1-schema-diff`, méta-test, 25 mutations) | `check:pack` · `check:decisions` · `check:jonction` · `check:test-projects` · `check:schema-inventaire` **· `check:graphe-modules` · `check:porte-journal` · `check:tracabilite` · `check:executabilite`** |

**5 sur 10 sont devenus 9 sur 14.** Les **quatre garde-fous nés depuis la porte P-A ont tous été livrés
sans test**, et la liste des non-testés contient désormais :

- **`check:test-projects`**, celui-là même dont F-2 avait démontré le faux vert — *réparé sans test de
  non-régression*, ce que R-5 signalait déjà et que personne n'a fait depuis ;
- **`check:porte-journal`**, qui n'a **ni test ni câblage** (§I.2) : il porte une garantie et n'est
  éprouvé par rien, dans les deux sens du terme ;
- **`check:tracabilite`**, c'est-à-dire **le garde-fou de ce fichier**. L'instrument qui décide si une
  citation d'exigence est recevable n'est éprouvé par aucun cas d'injection. Un contrôle qui ne
  distingue plus rien sortirait **vert**, et c'est exactement le mode de défaillance que ce dépôt
  poursuit depuis cinq jours — celui de `pg_isready`, de `pgrep -f node` et du test de restauration
  nocturne qui sautait ses étapes.

**Le dépôt a donc doublé son outillage de garde et divisé par deux sa couverture de garde.**

## I.5 — **UNE CITATION EN AVANCE SUR SON CODE** (E45, R-9)

`apps/api/src/auth/depot.ts` porte `// Traçabilité : E33 (…), E45 (habilitation).` Le fichier lit bien
`users.habilitated_at` et le projette dans `UtilisateurAuthentifie.habiliteLe`.

**Mesuré** : `grep -rn "habiliteLe" apps/api/src --include=*.ts` rend **deux lignes, et ce sont les deux
lignes de sa propre déclaration** (`depot.ts:37` le déclare, `depot.ts:54` le sélectionne). **Aucun
chemin d'exécution ne le consulte.** Le crochet d'autorisation ne s'en sert pas ; aucune route ne
refuse un compte non habilité.

Or E45 dit, au fichier 08 : « habilitation **obligatoire** (`habilitated_at`) », et la ligne E45 du §A
promettait explicitement « **refus serveur d'affectation si `habilitated_at` NULL → L2** ».
**La colonne est lue, la règle n'est pas appliquée.**

**Ce n'est pas de la mauvaise foi, et c'est ce qui le rend intéressant.** La citation est *anticipée* :
l'auteur a livré la moitié dont il avait besoin (charger la donnée) et cité l'exigence entière. Et
`pnpm check:tracabilite` **l'accepte**, parce que la glose « habilitation » partage un mot avec le
libellé « habilitation obligatoire ». **C'est textuellement l'angle mort n° 1 que ce garde-fou déclare
lui-même** : *« il ne distingue pas un rattachement JUSTE d'un rattachement FAUX […] `E33 (sécurité)`
sur un fichier qui ne fait rien de sécurisé passera. Seule la revue croisée voit cela. »*

**Le garde-fou avait raison sur sa propre limite, et cette passe en fournit le premier exemplaire réel.**
La conséquence de gouvernance est simple et vaut règle : **citer une exigence dont on ne livre qu'une
partie exige de dire laquelle** — la forme `E45 (habilitation : lecture seule, refus dû à L2b)` aurait
été honnête ; `E45 (habilitation)` ne l'est pas.

## I.6 — CE QUE JE N'AI PAS PU VÉRIFIER, ET QUI DOIT ÊTRE DIT

1. **`pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` et `pnpm test:coverage` n'ont pas été lancés.**
   L'arbre de travail portait le code non commité d'un autre lot (§B.11.7 bis-2) ; un vert comme un
   rouge y aurait été ininterprétable. **Ils sont dus sur un arbre propre avant la porte P-B.**
2. **Aucune mesure sur `axionia-web`.** Tout ce que ce document affirme de la machine est **repris** de
   la passe du 2026-08-28 (§H) ou de `docs/ETAT.md`, et jamais présenté comme mesuré par moi. Le
   contrôle d'empreinte image-vs-dépôt, **toujours dû** depuis §H.4, reste dû.
3. **La couverture ≥ 90 % n'est pas mesurée par moi** (§C.quater). Les chiffres cités
   (93,33 % / 95,24 % sur `domaines/journal/**`) viennent de `.github/coverage-critical-paths.json`.
   **C'est la première porte où cette ligne est exigible : elle doit être mesurée, pas reprise.**
4. **Le contenu réel de `apps/api/fixtures/banque-questions/*` n'a pas été confronté aux ~200 questions
   rédigées** — le fichier 07 §35.1 l'exclut explicitement du périmètre de L4, et je le note pour que
   personne ne coche ce qui n'a pas été demandé.
5. **La règle de croisement 09 §5.6 reste invérifiable** (§B.11.7 bis-1).

**Signature du gardien de la spécification :** A02 — **2026-08-31, sur `6b9cc7c` : 🟡 ACCEPTÉ SOUS
RÉSERVE**, avec **un code orphelin déclaré**, **trois réserves de déclaration**, **six réserves
nommées (R-2, R-5 aggravée, R-9 à R-12)** et **un critère du fichier 07 non livré** (CRUD users, T3).
Étape 6 du pipeline **franchie sous réserve**.
