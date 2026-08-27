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
--   T7. Montants/scores → NUMERIC quand le 04 les type ainsi. Les colonnes
--       `estimated_gain`, `estimated_cost`, `expected_gain`, `indicative_cost`
--       restent TEXT (règle T2) : le 04 fournit à côté des colonnes NUMERIC
--       explicites (`gain_low`, `gain_high`, `baseline_value`, `target_value`)
--       précisément pour la valeur chiffrée.
--   T8. NULLABILITÉ (hors périmètre du diff 11 §7, qui ne porte que sur
--       PK/FK/UNIQUE/CHECK) : NOT NULL sur les clés primaires, les FK que le 04
--       ne marque pas `NULL`, les colonnes portant un DEFAULT, les codes/libellés
--       de référentiel et les enums structurants. Tout le reste reste nullable.
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
