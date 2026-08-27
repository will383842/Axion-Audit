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

**Date d'établissement : 2026-08-27** · **Lots évalués : L0 (incrément L0-a) puis L1 (schéma)** ·
**Gardien : A02**

| Passe | Lot | Commit | Arbre | Verdict |
| --- | --- | --- | --- | --- |
| **1ʳᵉ** | L0 | `ce5b912` | **en cours de modification** (2 fichiers à l'ouverture, 9 à la clôture) ; pipeline à l'**étape 3/7**, revue croisée non rendue | **VETO** — 4 écarts (V1-V4) |
| **2ᵉ** | L0 | **`fdd5f59`** | **propre** (`git status` vide) ; revue croisée rendue **deux fois** (NON CONFORME → CONFORME AVEC RÉSERVES, réserves fermées) | voir §D |
| **1ʳᵉ** | **L1** | **`bf7f6ca`** | **figé côté code** (`git status` : seul `docs/ETAT.md` modifié) ; revue croisée rendue **trois fois** (CONFORME AVEC RÉSERVES, réserves fermées, le réviseur ne recommande pas de 4ᵉ passe) — **étape 4 close, l'étape 6 se tient enfin dans l'ordre** | **ACCEPTÉ SOUS RÉSERVE** — voir §F |

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
| E15 | Rapport DOCX 12-60 p.                      | partiellement amorcée     | L0 : file `axion:rapports` inerte. L1 : `report_sections`, `report_templates`, `report_files` (`0006_rapport_cadrage_pilotage.sql`) | L10                       |
| E16 | Rédaction assistée IA par bloc             | partiellement amorcée     | L0 : file `axion:llm` inerte. L1 : `llm_calls` (journal des coûts) · `report_sections` (états brut/généré/validé) | L11                       |
| E17 | **Stack imposée (Hetzner, Docker, PG, Fastify, Vite/React)** | **partiellement amorcée** | **Apport L1** : PostgreSQL 16 réellement exploité — 12 migrations **SQL brut versionné**, **aucun ORM générateur de schéma** (11 §2 : `check:invariants` CT-2-PRISMA vert) ; Drizzle cantonné aux requêtes typées (`apps/api/src/db/schema.ts`, 1 023 l.) et **confronté à la base par un test dédié** que j'ai éprouvé par 4 mutations (§F.0). **Rappel L0 ci-dessous.** — Compose dev/staging/prod validés : `docker compose --env-file … config -q` → **RC=0** sur les 3 combinaisons · `apps/api` (Fastify 5) · `apps/field`/`apps/hq` (Vite+React) · `apps/worker` (BullMQ) · `packages/shared` (Zod) · `pnpm typecheck` 6/6 vert · `pnpm build` 4 images | Dexie/Workbox → L5 · docxtemplater → L10 |
| E18 | Liaison console axion-ia.com               | partiellement amorcée     | L0 : file `axion:webhooks` inerte. L1 : `companies.external_ref` (« id client console, NULL si local ») · `integration_events` (anti-rejeu, `attempts`) | L13                           |
| E19 | Avant-vente : cadrage → devis              | partiellement amorcée     | `scoping_estimates` · `estimation_params` **seedées (29 clés normées)** — le contrat 11 §5 en réserve la validation à Williams (porté à la porte P-A, point 4) | Simulateur et devis → L2 (étanchéité) · Phase 2 |
| E20 | Suivi avance/retard temps réel             | partiellement amorcée     | Socle : `mission_rebaselines` (`decision` ∈ `absorbe`/`avenant`/`descope`, §25.1) · `work_assignments.planned_days` | Projection de fin → Phase 2   |
| E21 | Auditeurs jamais d'accès aux montants      | partiellement amorcée     | La table à cloisonner existe et est **isolée par construction** : `scoping_financials` a pour PK `scoping_estimate_id` (aucune donnée financière dans `missions` ni `scoping_estimates`). **Vérifié par moi en base** : `daily_rates`, `travel_costs`, `total_amount`, `currency` ne vivent que là | **L2** — RBAC serveur, routes admin exclusivement, tentatives d'intrusion croisées (porte **P-B**). **L1 ne prouve rien de l'étanchéité** : il n'y a aucune route |
| E22 | Console de pilotage 7 espaces              | non commencée             | Coquille annotée : `apps/hq/src/App.tsx`, `apps/hq/vite.config.ts` (base `/hq/`)                                  | L7-min · Phase 2              |
| E23 | Hyper intuitif, novice < 30 min            | non commencée             | —                                                                                                                 | L5 (porte P-C, A54)           |
| E24 | Validation obligatoire de chaque étape     | partiellement amorcée     | `step_validations` avec **énumération FERMÉE** `step_code` ∈ 8 codes (§32.2, P1-1), `was_override` + `override_reason` (dérogation tracée) · `users.usage_profile` DEFAULT `'guide_strict'` (§19.1) — **valeur par défaut vérifiée en base** | Verrous et transitions gardées → L3/L5 |
| E25 | Zéro oubli (plan, couverture, contrôles)   | partiellement amorcée     | Socle : `document_requests` (`status` ∈ `demande`/`recu`/`partiel`/`non_disponible`) · `step_validations` · `work_assignments` (plan d'entretiens) | Écrans de couverture et contrôles de fin → L3 · L5 · L7-min |
| E26 | Alertes actives sur les manques            | partiellement amorcée     | Socle : `alerts` (`type` NOT NULL — identité T13, P1-2 §20.4) | Centre d'alertes, 8 types, acquittement motivé → Phase 2 |
| E27 | **Design moderne, charte, WCAG AA**        | **partiellement amorcée** | `packages/ui/src/tokens.ts` + `tokens.css` · **91 tests verts** (`pnpm test:unit`) dont contraste AA et parité TS/CSS · garde-fou INV-4 « aucune couleur en dur » vert | Composants shadcn → L5 · dataviz → L8 |
| E28 | Détecter tout le potentiel IA + formation  | partiellement amorcée     | Socle : `tools_inventory` (`category`, `criticality`) · `use_cases` (gain, coût, complexité, `payback_months`, `baseline_*`, §28.1/§28.2-5) | Collecte → L5 · analyse → L7/L8 · restitution → L10 |
| E29 | Rapport = plan d'action 12 mois            | partiellement amorcée     | Socle : `roadmap_items` (`scenario` avec DEFAULT prescrit, §20.3) · `findings.wave` ∈ `quick_win`/`chantier`/`transformation` | L10                           |
| E30 | 3 niveaux d'audit                          | partiellement amorcée     | `missions.audit_level` CHECK `('diagnostic_cadrage','operationnel','strategique_groupe')` (§20.1) · `report_templates.kind` (gabarits par niveau §26.2) | Effets fonctionnels → L3 · gabarits → L10 |
| E31 | **Généricité absolue (aucune réf. client)**| **partiellement amorcée** | Contrôle **manuel** du gardien sur les 43 tables, les 12 migrations, le manifeste, le seed et les 7 suites d'intégration : **aucun nom de client**, les fixtures sont FIL-TPE et FIL-GC (entreprises fictives, 09 §4bis). ⚠️ **Le garde-fou MÉCANIQUE, lui, ne tourne pas en CI — voir la réserve F-1 : c'est un écart, pas une remarque.** | **F-1 à lever** · vérification permanente à chaque lot |
| E32 | Fuseaux, devises, interface française      | partiellement amorcée     | L0 : `packages/shared/src/temps.ts`, `TZ` du Compose. **L1 : la règle est descendue en base** — `missions.timezone` TEXT DEFAULT `'Europe/Paris'` (§22.2), `scoping_financials.currency` DEFAULT `'EUR'`, `missions.country_code`, `question_translations(question_id, lang)`. **Vérifié par moi** : toute colonne `*_at` est `TIMESTAMPTZ` (convention de typage du manifeste, gardée par `pnpm schema:diff`) — un horodatage sans fuseau ne peut plus entrer en silence | Affichage au fuseau de mission → L3/L5 · i18n EN → L20 |
| E33 | **Sécurité / RGPD** (+ apport L1)          | **partiellement amorcée** | **Apport L1** : `users.password_hash` et `refresh_tokens.token_hash`/`expires_at` **NOT NULL** (convention T14 — « une ligne d'authentification sans secret ni expiration ne doit pas pouvoir exister ») · `app_settings` (secrets chiffrés AES via `APP_ENCRYPTION_KEY`) · **aucune donnée personnelle n'entre dans un log de migration ou de seed** (relu par moi). **Rappel L0 ci-dessous.** — gitleaks bloquant (`.gitleaks.toml`, job CI `gitleaks`) · **SEC-30.4a/b verts** (aucun secret en dur) · redaction pino (`apps/api/src/logger.ts`) · helmet + CSP + rate-limit (`apps/api/src/app.ts`) · durcissement §10.3 scripté (`infra/scripts/provision-vps.sh`) · ZAP baseline (`.github/workflows/zap-baseline.yml`) · **12/12 familles de secrets §30.3 documentées dans `.env.example`** | Chiffrement local → L5 · consentements/purges → L1/L11 · **durcissement réellement appliqué → L0-b** |
| E34 | Conformité AI Act                          | partiellement amorcée     | Socle : `ai_systems` (registre, `data_categories`, `obligations`) · `blocks` seedés jusqu'à `bloc_9` — le bloc AI Act **existe en base dès L1** | Registre exploité, chapitre rapport, ISO/IEC 42001 → L12 |
| E35 | **Scalabilité + sauvegardes 3-2-1 testées chaque nuit** | **partiellement amorcée** | Livrés : `infra/pgbackrest/pgbackrest.conf`, `infra/postgres/Dockerfile` (pgBackRest dans le conteneur qui archive), `infra/scripts/backup-postgres.sh` (127 l.), `backup-minio.sh` (105 l.), **`restore-test.sh` (362 l., Postgres ET MinIO)**, `install-cron.sh`, `.github/workflows/nightly-restore-test.yml` | **Le test de restauration n'a JAMAIS été exécuté** — c'est le cœur de E35. → L0-b / porte P-A |
| E36 | **Exécutable par lots avec critères**      | **partiellement amorcée** | L0 : CI, `pull_request_template.md`, garde-fous auto-périmés éprouvés (§D.1). **L1 : les quatre critères du lot sont OUTILLÉS, pas seulement déclarés** — `pnpm schema:diff` (886 l.) et le **second verrou en liste noire** `pnpm check:schema-inventaire` (230 l.), les deux **éprouvés par moi par 34 mutations injectées en base, 34 détectées** (§F.0). **169 tests verts exécutés par moi** : 95 unitaires + 66 d'intégration + 8 Playwright | Voir **F-1** (INV-2 non appliqué en CI) et **F-3** (`test:e2e:filrouge` en échec) |
| E37 | Scoring intégralement spécifié             | partiellement amorcée     | `questions.scoring` JSONB (format normé 04 §7.3) · `questions.weight`, `criticality`, `allow_range` (DEFAULT prescrits) · `block_scores.is_indicative` | Barème, agrégation, drapeaux rouges → L8 · contrôle bloquant à l'import → L4 |
| E38 | Sauvegarde terrain (sync ≥ 1×/j + export)  | partiellement amorcée     | `sync_log.outbox_remaining` — **la** donnée du garde-fou « sync muette » du §9.7, présente en base dès L1 | Export de secours → L5c · sync → L6 · alerte → L6 |
| E39 | Machine à états mission                    | **partiellement amorcée** — **c'est la part que le fichier 07 confie explicitement à L1** | Les **codes** sont posés et fermés : `missions.status` (5 valeurs), `step_validations.step_code` (8 codes, énumération fermée P1-1), `interviews.status`/`schedule_status`, `findings.status`/`remediation_status`, `use_cases.status`, `org_units.status`, `document_requests.status`. **Éprouvé par moi en base** : une valeur hors énumération est refusée (`questions_answer_type_check` sur `'pirate'`). **Et le comparateur garde ces énumérations** : mutation injectée par moi — un littéral dont seule la **casse** change (`'PREPARATION'`) → `pnpm schema:diff` **RC=1** | Transitions contrôlées → L3 (§32.2) |
| E40 | ROI normé, échantillonnage, ancres         | partiellement amorcée     | Socle : `use_cases` (`gain_low`/`gain_high`/`payback_months`/`assumptions`, §28.2-5) · `estimation_params` **29 clés seedées** | Ancres de cotation → L4 · formule ROI → L11 |
| E41 | Consolidation groupe cadrée                | partiellement amorcée     | `missions.parent_mission_id` FK auto-référente (missions filles §32.3) · `missions.geo_scope` + `country_code` | Agrégation, heatmap filles×blocs, gabarit dédié → L14 |
| E42 | RGPD renforcé (pseudonymisation, rétention)| partiellement amorcée     | L0 : redaction pino, file `axion:purges`. **L1 : les supports de purge et de rétention existent** — `activity_log` (§10.4), `attachments.purge_after DATE NULL` (purge audio), `processed_ops.processed_at` (rétention 30 j), `llm_calls`. `app_settings` porte les seuils et durées de purge | **Politique de rétention `activity_log` réellement appliquée → L2** (un job, pas une colonne) · pseudonymisation 2 passes → L11 |
| E43 | **Exécutabilité autopilote**               | **partiellement amorcée** | L0 : versions épinglées, conventions API §3, 40 gabarits, `ETAT.md`. **L1 : les seeds sont codables et rejouables** (`apps/api/scripts/seed.mjs` — **empreinte md5 par table identique aux passages 1, 2 et 3, mesurée par moi**), l'exécuteur de migrations est réversible et transactionnel (`apps/api/scripts/migrations.mjs`, `--check`/`--down`/`--down-to 0`), `processed_ops` (contrat d'ops 11 §4) est en base, et `apps/api/scripts/db-generate.mjs` refuse une migration sans descente | Contrat d'ops exploité → L6 · format export de secours → L5c |
| E44 | UX/UI 2026-2027 (tokens, police locale)    | partiellement amorcée     | `packages/ui/src/tokens.ts` (tokens chiffrés) · garde-fou **CT-1-CDN vert** (police auto-hébergée, aucun CDN)      | Grille §33 (4 états, raccourcis, écran partagé) → L5 · desktop-first → L7 |
| E45 | Pilotage humain (habilitation, cockpit)    | **partiellement amorcée** — **part L1 satisfaite et prouvée** | `users.habilitated_at TIMESTAMPTZ NULL` livré (`0001_referentiels.sql`), et **posé par le seed sur le compte admin fondateur** — l'anti auto-verrouillage du §34.4. **Vérifié par moi après un seed neuf** : `role=admin habilitated_at=2026-08-27 20:47:13+00 is_active=true`. Sans cela, personne n'aurait pu s'affecter la première mission. Aussi : `mission_users.role_on_mission` (`lead`…), `work_assignments` (plan de charge §34) | Refus serveur d'affectation si `habilitated_at` NULL → **L2** · cockpit « Aujourd'hui » → L5 (§34.2) · espace Équipe → Phase 2 |
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

---

## Journal des passes de contrôle

| Date | Passe | Lot | Commit | Verdict du gardien |
| --- | --- | --- | --- | --- |
| 2026-08-27 | 1ʳᵉ | L0 | `ce5b912` | **VETO** — V1 CI rouge · V2 HEAD ne démarre pas · V3 pipeline hors séquence · V4 gouvernance. 1 code orphelin (`axion:sauvegardes`) |
| 2026-08-27 | 2ᵉ | L0 | `fdd5f59` | **ACCEPTÉ SOUS RÉSERVE** — V1/V2/V3 levés et éprouvés · **0 code orphelin** · V4 partiel · 6 manques au dossier de porte |
| 2026-08-27 | 1ʳᵉ | **L1** | **`bf7f6ca`** | **ACCEPTÉ SOUS RÉSERVE** — les **4 critères du fichier 07 cochés avec preuve exécutée** · **43 tables livrées, 43 rattachées, 0 orpheline** · tous les chiffres recomptés, **aucun faux** · 38 mutations injectées, **38 détectées** · **3 écarts** : **F-1** (invariant 2 non contrôlé en CI — le plus grave), **F-2** (garde-fou `@filrouge` partiellement décoratif), **F-3** (`test:e2e:filrouge` en échec) · 1 écart de gouvernance **F-7** (branche) · 1 ligne de DoD **NON SATISFAITE** (migrations sur staging, dépend de L0-b) |

**Signature du gardien de la spécification :** A02 — 2026-08-27, sur `bf7f6ca`.
Étape 6 du pipeline **franchie sous réserve** : les réserves F-1, F-2, F-3, F-7 sont **portées à la
porte P-A** et doivent être levées **avant** la signature de Williams. Aucune ne remet en cause le
schéma lui-même, qui est la substance du lot ; toutes portent sur des **contrôles qui annoncent plus
qu'ils ne font** — c'est-à-dire sur le seul défaut que ce lot poursuit depuis trois passes, et qu'il
n'a pas fini d'extirper.
