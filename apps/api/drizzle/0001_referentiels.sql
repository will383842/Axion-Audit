-- =============================================================================
-- 0001 — RÉFÉRENTIELS (docs/04_MODELE_DE_DONNEES.md §7, bloc « RÉFÉRENTIELS »)
--
-- SOURCE UNIQUE DU DDL : docs/04_MODELE_DE_DONNEES.md. Ce fichier en est une
-- TRANSCRIPTION, pas une interprétation (11 §2 : « le fichier 04 se transcrit
-- littéralement en migrations SQL ; Drizzle ne sert qu'aux requêtes typées »).
--
-- CONVENTIONS DE TRANSCRIPTION (appliquées à TOUTES les migrations 0001→0008,
-- issues de l'en-tête du §7 du fichier 04 et du 11 §3/§7) :
--   T1. Type explicite dans le 04 → repris VERBATIM.
--   T2. Colonne sans type explicite → TEXT (règle V2.9 en tête du §7), SAUF les
--       exceptions T3-T7 ci-dessous, qui découlent du fichier 04 lui-même.
--   T3. `created_at` / `updated_at` → TIMESTAMPTZ (« TIMESTAMPTZ partout », §7).
--       Généralisé à TOUTE colonne à sémantique d'horodatage (`*_at`, `*_time`) :
--       invariant 5 (« horodatages UTC en base ») + 11 §3 (« TIMESTAMPTZ en
--       base »). `client_updated_at` en TEXT rendrait le LWW §9.4 incorrect.
--       Les colonnes que le 04 type explicitement DATE restent DATE.
--   T4. `id` et `*_id` → UUID (toutes les entités sont identifiées par UUID),
--       sauf `naf_sector_map.naf_code`, `estimation_params.key`,
--       `app_settings.key` qui sont des clés naturelles TEXT.
--   T5. Quantités dénombrables (`*_count`, `headcount*`, `position`, `version`,
--       `tokens_*`, `duration_ms`, `*_months`, `*_weeks`, `attempts`,
--       `revision`, `palier`, `month_*`) → INTEGER ; `size_bytes` → BIGINT.
--   T6. `is_*` → BOOLEAN.
--   T7. Montants/scores → NUMERIC quand le 04 les type ainsi, ET quand la colonne
--       MIROITE une colonne que le 04 type NUMERIC ailleurs (précision ajoutée
--       après la revue croisée A17, qui a relevé que la règle écrite ne couvrait
--       pas deux cas pourtant traités) : `llm_calls.cost_eur` miroite
--       `report_sections.llm_cost_eur`, et `mission_questions.weight_snapshot`
--       miroite `questions.weight` — un snapshot doit pouvoir contenir exactement
--       ce qu'il fige, sans conversion.
--       En revanche `estimated_gain`, `estimated_cost`, `expected_gain` et
--       `indicative_cost` restent TEXT (règle T2) : le 04 fournit à côté des
--       colonnes NUMERIC explicites (`gain_low`, `gain_high`, `baseline_value`,
--       `target_value`) précisément pour la valeur chiffrée — l'asymétrie est
--       délibérée, ces colonnes-là sont des descriptions libres.
--   T8. NULLABILITÉ — DANS le périmètre du diff, et vérifiée colonne par colonne.
--       (Le 11 §7 borne le diff aux « tables, COLONNES, contraintes… » sans rien
--       exclure nommément ; une lecture antérieure l'en excluait, les méta-tests
--       d'A16 ont montré ce que cette hypothèse coûtait — un `NOT NULL` retiré de
--       `answers.interview_id` désarme l'UNIQUE du lot sans qu'aucune contrainte
--       ne disparaisse. Arbitrage A01 : elle est comparée.)
--       NOT NULL sur : les clés primaires · les FK que le 04 ne marque pas `NULL`
--       · les colonnes portant un DEFAULT · les codes de référentiel · les enums
--       structurants · le LIBELLÉ D'IDENTITÉ (T13 ci-dessous). Tout le reste est
--       nullable, et le 04 marque explicitement `NULL` ce qu'il veut nullable —
--       son absence de marqueur est donc une information, pas un silence.
--       S'y ajoutent, depuis le retrait des défauts non prescrits (0011) :
--         · BOOLÉEN D'ÉTAT STRUCTUREL (`is_active`, `is_default`, `in_scope`) et
--           COMPTEUR DE VERSION (`questions.version`) → NOT NULL, avec ou SANS
--           DEFAULT. Ces colonnes tenaient leur NOT NULL du défaut que 0011 a
--           retiré ; la justification aurait disparu avec lui si elle n'était pas
--           réécrite ici. Et un drapeau d'activation à TROIS valeurs
--           (true / false / NULL) est un piège : `WHERE is_active` fait
--           silencieusement disparaître les lignes à NULL. Sans défaut, l'insertion
--           devient explicite — c'est plus sûr, pas moins.
--       La revue croisée a trouvé quatre colonnes de TRAÇABILITÉ où la règle
--       n'était pas appliquée (corrigées en 0010), puis onze libellés traités de
--       façon incohérente (corrigés en 0012 via T13).
--   T9. UUID v7 : AUCUN DEFAULT SQL (PostgreSQL 16 n'a pas `uuidv7()` — PG18
--       seulement ; 11 §2). Les identifiants viennent du code (lib `uuidv7`),
--       client ET serveur. `DEFAULT gen_random_uuid()` (v4) n'apparaît QUE sur
--       quatre tables purement serveur : `sync_log`, `activity_log`,
--       `integration_events`, `llm_calls` (migration 0007).
--       `processed_ops.op_id` fait exception parmi les tables serveur : cet id
--       EST l'`op_id` de l'outbox, fourni par le client (11 §4) — lui donner un
--       défaut casserait la déduplication du push qu'il sert à assurer.
--   T10. Contraintes toutes NOMMÉES explicitement (`<table>_<col>_fkey`,
--        `_key`, `_check`, `_pkey`) : le manifeste et le diff schéma-vs-04 les
--        comparent par nom.
--   T11. FK sans ON DELETE : la suppression est LOGIQUE (`deleted_at`,
--        invariant 7 « rien n'est jamais silencieusement supprimé »). NO ACTION
--        est donc le comportement voulu ; le 04 ne spécifie aucun CASCADE.
--   T12. VALEURS PAR DÉFAUT — un défaut qui exprime un ÉTAT MÉTIER vient du
--        fichier 04, ou n'existe pas ; seul un défaut purement TECHNIQUE peut
--        venir d'une convention, et alors il est écrit ici (arbitrage A01, lot
--        L1 ; migration 0011 qui retire les 10 défauts non prescrits que j'avais
--        posés). Le fichier 04 SAIT écrire `DEFAULT 'a_planifier'` : là où il
--        n'écrit rien, le choix appartient au lot qui implémentera la règle, pas
--        à la transcription. Les seuls défauts conventionnels admis sont :
--          · TOUT HORODATAGE D'ÉCRITURE → `now()` (§7 : « TIMESTAMPTZ partout »).
--            La règle vaut pour tout horodatage posé à l'écriture, PAS pour les
--            seuls noms `created_at`/`updated_at` : `answer_revisions.changed_at`
--            sans défaut enregistrerait l'heure de SYNCHRONISATION au lieu de
--            l'heure de la correction, dans la table même que 0010 durcit au
--            titre de l'invariant 7. 37 colonnes ; la liste vit au manifeste.
--          · JSONB de collection → `'[]'` / `'{}'` — le 04 écrit « [] = universelle »,
--            « [] = transverse » : le tableau vide EST une valeur signifiante.
--            NE S'APPLIQUE PAS à `findings.sources`, où le 04 écrit l'INVERSE
--            (« ≥ 1 source obligatoire ») : défaut retiré par 0012.
--          · `id` des tables PUREMENT SERVEUR → `gen_random_uuid()` (11 §2, T9) ;
--          · COMPTEUR entier incrémenté par le serveur → `0`. Un compteur qui
--            démarre à zéro n'exprime aucun choix fonctionnel, c'est de
--            l'arithmétique. Un seul dans le schéma : `integration_events.attempts`.
--            Ne s'applique JAMAIS à une quantité métier collectée sur le terrain
--            (`headcount`, `users_count`, `answers_count`, `items_count`…), pour
--            laquelle NULL — « non renseigné » — et 0 sont deux faits distincts.
--        Le manifeste liste NOMMÉMENT les colonnes de chaque provenance, et le
--        diff refuse tout DEFAULT qu'aucune ne couvre : la liste ne peut plus
--        prétendre être exhaustive sans l'être.
--   T13. IDENTITÉ LISIBLE — la colonne qui porte le LIBELLÉ HUMAIN IDENTIFIANT
--        l'entité, celle qu'un opérateur lit pour savoir de quelle ligne il
--        s'agit, est `NOT NULL`. Une entité sans identité lisible n'est pas
--        exploitable : elle apparaît VIDE dans toute liste, tout rapport et tout
--        export. UNE SEULE colonne par table — l'identité, jamais ses attributs
--        descriptifs : `alerts.type` est l'identité d'une alerte, `alerts.message`
--        et `alerts.severity` la décrivent et restent nullables ; de même
--        `ai_systems.name` contre `ai_systems.usage_description`.
--        Quatorze tables n'ont PAS d'identité lisible et n'en reçoivent aucune
--        (junctions, tables de score à clé composite, journaux techniques, et les
--        cas où le 04 rend le libellé nullable À DESSEIN : `interviews.person_name`
--        §27.1, `attachments.filename` pour kind='note'). L'inventaire complet,
--        avec le motif de chaque table, vit au manifeste (`identiteLisibleT13`).
--        Arbitrage A01 après la 2e revue croisée ; appliquée par la migration 0012.
--   T14. SECRET D'AUTHENTIFICATION ET DURÉE DE VIE → `NOT NULL`. Ni un libellé
--        d'identité (T13), ni une FK, ni un enum : ces colonnes méritaient leur
--        propre ligne, et ne l'avaient pas (défaut D-1, 3e revue croisée).
--          · `users.password_hash`, `refresh_tokens.token_hash` — une ligne
--            d'authentification SANS SECRET est un compte ou un jeton dont on ne
--            peut RIEN vérifier ; selon le code appelant, cela va du compte
--            inutilisable à la comparaison qui réussit contre NULL. C'est la
--            colonne dont l'absence est une faille, pas une gêne.
--          · `refresh_tokens.expires_at` — un jeton sans expiration est un jeton
--            ÉTERNEL. Le 06 §10.1 impose 30 j rotatifs avec détection de
--            réutilisation : une durée de vie nulle vide la règle de son sens.
--   T15. OBLIGATION ÉCRITE EN TOUTES LETTRES PAR LE FICHIER 04 → `NOT NULL`,
--        même sans DEFAULT, même sans être FK ni identité. Un seul cas :
--          · `findings.sources` — le 04 §7 écrit sur cette colonne même
--            « ≥ 1 source obligatoire ». NULL y serait « zéro source » tout autant
--            que le `'{}'` que la migration 0012 a retiré : la colonne reste
--            NOT NULL, sans défaut, et l'insertion doit fournir ses sources.
--        Cette convention n'autorise RIEN à deviner : elle ne s'applique que là où
--        le 04 emploie les mots « obligatoire » ou « ≥ 1 ».
--
--   ⚠ RÈGLE DE RELECTURE (T8/T12) — LE RETRAIT D'UN `DEFAULT` OBLIGE À REVÉRIFIER
--     LA JUSTIFICATION `NOT NULL` DE LA COLONNE. T8 justifie `NOT NULL` par « les
--     colonnes portant un DEFAULT » : retirer le défaut retire la justification,
--     sans toucher à la contrainte. L'enchaînement s'est produit TROIS fois —
--     0011 (cinq colonnes, T8 amendée), 0012 (`findings.sources`, T8 NON amendée,
--     défaut D-1). Trois occurrences du même motif ne sont pas trois accidents.
--     Toute migration qui contient un `DROP DEFAULT` doit donc rouvrir ce bloc.
-- =============================================================================

-- @UP

-- ── users ────────────────────────────────────────────────────────────────────
-- V2.5 §34.4 : `habilitated_at` est posé par l'admin après bac à sable + cotation
-- croisée ; l'affectation `mission_users` est REFUSÉE côté serveur si NULL.
-- V2.8 : le SEED L1 pose `habilitated_at` sur le compte admin fondateur (sinon
-- auto-verrouillage : impossible de s'affecter sa propre première mission).
CREATE TABLE users (
    id             UUID        NOT NULL,
    name           TEXT        NOT NULL,
    email          TEXT        NOT NULL,
    password_hash  TEXT        NOT NULL,
    role           TEXT        NOT NULL,
    usage_profile  TEXT        NOT NULL DEFAULT 'guide_strict',
    habilitated_at TIMESTAMPTZ NULL,
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    last_login_at  TIMESTAMPTZ NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'consultant', 'analyste', 'lecteur')),
    CONSTRAINT users_usage_profile_check
        CHECK (usage_profile IN ('guide_strict', 'expert'))
);

COMMENT ON COLUMN users.habilitated_at IS
    'V2.5 §34.4 — habilitation posée par l''admin ; mission_users refusée si NULL.';

-- ── refresh_tokens ───────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id           UUID        NOT NULL,
    user_id      UUID        NOT NULL,
    token_hash   TEXT        NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ NULL,
    device_label TEXT        NULL,
    CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id)
);

-- ── sectors ──────────────────────────────────────────────────────────────────
CREATE TABLE sectors (
    id        UUID    NOT NULL,
    code      TEXT    NOT NULL,
    label_fr  TEXT    NOT NULL,
    label_en  TEXT    NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT sectors_pkey PRIMARY KEY (id),
    CONSTRAINT sectors_code_key UNIQUE (code)
);

-- ── services — les 11 fonctions métier de la taxonomie (§16.3) ────────────────
CREATE TABLE services (
    id       UUID NOT NULL,
    code     TEXT NOT NULL,
    label_fr TEXT NOT NULL,
    CONSTRAINT services_pkey PRIMARY KEY (id),
    CONSTRAINT services_code_key UNIQUE (code)
);

-- ── interlocutor_profiles ────────────────────────────────────────────────────
-- V2.2 §32.1 : `group_code` est la base du calcul de divergence direction/terrain.
CREATE TABLE interlocutor_profiles (
    id         UUID NOT NULL,
    code       TEXT NOT NULL,
    label_fr   TEXT NOT NULL,
    group_code TEXT NOT NULL,
    CONSTRAINT interlocutor_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT interlocutor_profiles_code_key UNIQUE (code),
    CONSTRAINT interlocutor_profiles_group_code_check
        CHECK (group_code IN ('direction', 'encadrement', 'terrain'))
);

-- ── size_tiers — micro, pme, eti, grand_compte (bornes §2.3 / seed 11 §5) ─────
CREATE TABLE size_tiers (
    id            UUID    NOT NULL,
    code          TEXT    NOT NULL,
    label         TEXT    NOT NULL,
    headcount_min INTEGER NULL,
    headcount_max INTEGER NULL,
    CONSTRAINT size_tiers_pkey PRIMARY KEY (id),
    CONSTRAINT size_tiers_code_key UNIQUE (code)
);

-- ── naf_sector_map — R4 : pré-remplissage secteur (administrée, console) ──────
CREATE TABLE naf_sector_map (
    naf_code  TEXT NOT NULL,
    sector_id UUID NOT NULL,
    CONSTRAINT naf_sector_map_pkey PRIMARY KEY (naf_code),
    CONSTRAINT naf_sector_map_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors (id)
);

-- @DOWN

DROP TABLE IF EXISTS naf_sector_map;
DROP TABLE IF EXISTS size_tiers;
DROP TABLE IF EXISTS interlocutor_profiles;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS sectors;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
