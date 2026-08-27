-- =============================================================================
-- 0007 — TRANSVERSE
-- Transcription de docs/04_MODELE_DE_DONNEES.md §7, bloc « TRANSVERSE »
-- (§9.2, §9.7, §8.6, §10.4).
-- Conventions de transcription T1-T11 : voir l'en-tête de 0001_referentiels.sql.
--
-- CE QUI N'EST PAS ICI : `surveys`, `survey_responses` et `solutions_catalog`.
-- Le fichier 04 les range sous « PHASE 2/3 (DDL de référence — CRÉÉES PAR LES
-- MIGRATIONS DE LEURS LOTS) », quand le fichier 07 §12 commande au L1 un schéma
-- « INTÉGRAL ». Divergence relevée par A16, ARBITRÉE PAR A01 le 2026-08-27
-- (DECISIONS.md, « Les tables de Phase 2/3 ne sont PAS créées au lot L1 ») : sur
-- une question de DDL, le fichier 04 est l'autorité désignée par le 00_INDEX, et
-- son propos SPÉCIFIQUE sur ces trois tables l'emporte sur le propos GÉNÉRAL du
-- fichier 07. Elles arriveront avec leurs lots (§28.2-4, §28.2-7) ; elles sont
-- retirées du manifeste, et le test d'A16 garde qu'elles n'apparaissent pas par
-- inadvertance avant.
--
-- DEFAULT gen_random_uuid() (UUID v4) : toléré 11 §2 UNIQUEMENT sur les tables
-- PUREMENT SERVEUR — ici `sync_log`, `activity_log`, `integration_events` et
-- `llm_calls`, et aucune autre. Les entités créables hors ligne portent un UUID
-- v7 fourni par le code (lib `uuidv7`) : PostgreSQL 16 n'a pas de `uuidv7()`
-- (PG18 seulement).
-- `processed_ops.op_id` n'a DÉLIBÉRÉMENT aucun défaut, bien que la table soit
-- serveur : cet id EST l'`op_id` de l'outbox du client (11 §4). Un défaut y
-- fabriquerait un id neuf à chaque insertion sans op_id, c'est-à-dire
-- exactement l'inverse de la déduplication que la table assure.
-- =============================================================================

-- @UP

-- ── processed_ops (V2.3, §9.2) ───────────────────────────────────────────────
-- Déduplication du push : « op_id déjà vu → ignoré ». Rétention 30 j (job de
-- purge) ; la 2e ceinture d'idempotence reste l'upsert par UUID d'entité.
CREATE TABLE processed_ops (
    op_id        UUID        NOT NULL,
    batch_id     UUID        NULL,
    result       TEXT        NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT processed_ops_pkey PRIMARY KEY (op_id)
);

-- ── sync_log ─────────────────────────────────────────────────────────────────
-- `outbox_remaining` (V2.9) : taille d'outbox restante remontée par le client à
-- chaque push — LA donnée du garde-fou de reset de mot de passe (§9.7).
CREATE TABLE sync_log (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id          UUID        NULL,
    device_id        TEXT        NULL,
    direction        TEXT        NOT NULL,
    items_count      INTEGER     NULL,
    conflicts_count  INTEGER     NULL,
    outbox_remaining INTEGER     NULL,
    started_at       TIMESTAMPTZ NULL,
    ended_at         TIMESTAMPTZ NULL,
    status           TEXT        NULL,
    error            TEXT        NULL,
    CONSTRAINT sync_log_pkey PRIMARY KEY (id),
    CONSTRAINT sync_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT sync_log_direction_check CHECK (direction IN ('push', 'pull'))
);

-- ── integration_events (V2.2 anti-rejeu §8.6) ────────────────────────────────
CREATE TABLE integration_events (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    direction       TEXT        NOT NULL,
    system          TEXT        NOT NULL,
    event_type      TEXT        NULL,
    payload         JSONB       NULL,
    nonce           TEXT        NULL,
    event_timestamp TIMESTAMPTZ NULL,
    status          TEXT        NOT NULL DEFAULT 'pending',
    attempts        INTEGER     NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT integration_events_pkey PRIMARY KEY (id),
    CONSTRAINT integration_events_direction_check CHECK (direction IN ('in', 'out')),
    CONSTRAINT integration_events_system_check CHECK (system IN ('console', 'crm_pro')),
    CONSTRAINT integration_events_status_check CHECK (status IN ('pending', 'ok', 'failed'))
);

-- ── activity_log ─────────────────────────────────────────────────────────────
-- V2.2 RGPD : rétention 12 mois puis purge ; IP anonymisée à 90 j (jobs §10.4).
CREATE TABLE activity_log (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id     UUID        NULL,
    action      TEXT        NOT NULL,
    entity_type TEXT        NULL,
    entity_id   UUID        NULL,
    meta        JSONB       NULL,
    ip          TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT activity_log_pkey PRIMARY KEY (id),
    CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id)
);

-- ── llm_calls ────────────────────────────────────────────────────────────────
CREATE TABLE llm_calls (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    mission_id     UUID        NULL,
    section_id     UUID        NULL,
    provider       TEXT        NULL,
    model          TEXT        NULL,
    prompt_version TEXT        NULL,
    tokens_in      INTEGER     NULL,
    tokens_out     INTEGER     NULL,
    cost_eur       NUMERIC     NULL,
    duration_ms    INTEGER     NULL,
    status         TEXT        NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT llm_calls_pkey PRIMARY KEY (id),
    CONSTRAINT llm_calls_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT llm_calls_section_id_fkey FOREIGN KEY (section_id) REFERENCES report_sections (id)
);

-- ── app_settings ─────────────────────────────────────────────────────────────
-- Seuils, purges, URLs console, secrets chiffrés (AES via APP_ENCRYPTION_KEY).
CREATE TABLE app_settings (
    key   TEXT  NOT NULL,
    value JSONB NULL,
    CONSTRAINT app_settings_pkey PRIMARY KEY (key)
);

-- ── Index du §7.1 portés par cette migration ─────────────────────────────────
CREATE INDEX idx_integration_events_status ON integration_events (status);
CREATE INDEX idx_integration_events_nonce ON integration_events (nonce);
CREATE INDEX idx_processed_ops_processed_at ON processed_ops (processed_at);
CREATE INDEX idx_activity_log_entity_type_entity_id ON activity_log (entity_type, entity_id);
CREATE INDEX idx_sync_log_user_id_started_at ON sync_log (user_id, started_at);

-- @DOWN

DROP INDEX IF EXISTS idx_sync_log_user_id_started_at;
DROP INDEX IF EXISTS idx_activity_log_entity_type_entity_id;
DROP INDEX IF EXISTS idx_processed_ops_processed_at;
DROP INDEX IF EXISTS idx_integration_events_nonce;
DROP INDEX IF EXISTS idx_integration_events_status;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS llm_calls;
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS integration_events;
DROP TABLE IF EXISTS sync_log;
DROP TABLE IF EXISTS processed_ops;
