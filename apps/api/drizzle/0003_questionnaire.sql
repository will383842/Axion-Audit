-- =============================================================================
-- 0003 — QUESTIONNAIRE
-- Transcription de docs/04_MODELE_DE_DONNEES.md §7, bloc « QUESTIONNAIRE »
-- (§2.1, §16.3, §20.1, §27.4, §32.1, §32.4, §33.3, §36.3, §36.4).
-- Conventions de transcription T1-T11 : voir l'en-tête de 0001_referentiels.sql.
-- =============================================================================

-- @UP

-- ── blocks — seed : 9 blocs (§2.1) ───────────────────────────────────────────
CREATE TABLE blocks (
    id          UUID    NOT NULL,
    code        TEXT    NOT NULL,
    label_fr    TEXT    NOT NULL,
    position    INTEGER NULL,
    is_default  BOOLEAN NOT NULL DEFAULT true,
    description TEXT    NULL,
    CONSTRAINT blocks_pkey PRIMARY KEY (id),
    CONSTRAINT blocks_code_key UNIQUE (code)
);

-- ── questions ────────────────────────────────────────────────────────────────
-- V2.9 : `code` est l'identifiant STABLE de banque (clé de l'import/ré-import
-- §36.4) — UNIQUE(code, version) PARTIEL `WHERE code IS NOT NULL` ; NULL pour les
-- ad hoc non versées. Une NOUVELLE VERSION = une NOUVELLE LIGNE (même code,
-- version+1, l'ancienne passe 'archived') : JAMAIS de mutation en place, pour que
-- les `mission_questions` figées pointent une ligne immuable.
CREATE TABLE questions (
    id                UUID        NOT NULL,
    code              TEXT        NULL,
    block_id          UUID        NOT NULL,
    version           INTEGER     NOT NULL DEFAULT 1,
    status            TEXT        NOT NULL,
    text_fr           TEXT        NOT NULL,
    guidance_fr       TEXT        NULL,
    answer_type       TEXT        NOT NULL,
    options           JSONB       NULL,
    allow_range       BOOLEAN     NOT NULL DEFAULT false,
    weight            NUMERIC     NOT NULL DEFAULT 1,
    scoring           JSONB       NULL,
    criticality       TEXT        NOT NULL DEFAULT 'important',
    expected_source   TEXT        NULL,
    sectors           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    target_services   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    levels            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    headcount_min     INTEGER     NULL,
    headcount_max     INTEGER     NULL,
    profiles          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    geo               TEXT        NOT NULL DEFAULT 'tous',
    display_if        JSONB       NULL,
    origin            TEXT        NOT NULL,
    origin_mission_id UUID        NULL,
    created_by        UUID        NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT questions_pkey PRIMARY KEY (id),
    CONSTRAINT questions_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks (id),
    CONSTRAINT questions_origin_mission_id_fkey FOREIGN KEY (origin_mission_id) REFERENCES missions (id),
    CONSTRAINT questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT questions_status_check
        CHECK (status IN ('draft', 'active', 'archived')),
    CONSTRAINT questions_answer_type_check
        CHECK (answer_type IN ('yes_no', 'scale_1_5', 'single_choice', 'multi_choice',
                               'free_text', 'number', 'percent', 'duration', 'money',
                               'date', 'table')),
    CONSTRAINT questions_criticality_check
        CHECK (criticality IN ('bloquant', 'important', 'informatif')),
    CONSTRAINT questions_expected_source_check
        CHECK (expected_source IN ('entretien', 'observation', 'demonstration', 'document', 'releve')),
    CONSTRAINT questions_geo_check
        CHECK (geo IN ('france', 'multi_pays', 'tous')),
    CONSTRAINT questions_origin_check
        CHECK (origin IN ('banque', 'ad_hoc'))
);

COMMENT ON COLUMN questions.options IS
    'Structure NORMÉE V2.2 : [{code TEXT, label TEXT, score NUMERIC NULL}].';
COMMENT ON COLUMN questions.scoring IS
    'V2.2 §32.1 / 04 §7.3 : barème valeur→points + déclencheur de drapeau rouge.';
COMMENT ON COLUMN questions.guidance_fr IS
    'Consigne consultant + ANCRES DE COTATION (§32.4 : « 1 = …, 3 = …, 5 = … » obligatoires sur les échelles).';

-- ── question_translations (V2) ───────────────────────────────────────────────
CREATE TABLE question_translations (
    question_id UUID NOT NULL,
    lang        TEXT NOT NULL,
    text        TEXT NULL,
    guidance    TEXT NULL,
    CONSTRAINT question_translations_pkey PRIMARY KEY (question_id, lang),
    CONSTRAINT question_translations_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions (id)
);

-- ── mission_questions ────────────────────────────────────────────────────────
-- V2.9 : figeage COMPLET — la mission est autonome de la banque (consigne +
-- ANCRES §33.3 rendues hors ligne, type de saisie, criticité/poids à l'export
-- §36.3). Le pull terrain lit CES snapshots, jamais la banque vivante.
CREATE TABLE mission_questions (
    id                     UUID    NOT NULL,
    mission_id             UUID    NOT NULL,
    question_id            UUID    NOT NULL,
    question_version       INTEGER NULL,
    text_snapshot          TEXT    NULL,
    options_snapshot       JSONB   NULL,
    weight_snapshot        NUMERIC NULL,
    scoring_snapshot       JSONB   NULL,
    guidance_snapshot      TEXT    NULL,
    answer_type_snapshot   TEXT    NULL,
    criticality_snapshot   TEXT    NULL,
    allow_range_snapshot   BOOLEAN NULL,
    position               INTEGER NULL,
    added_ad_hoc           BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT mission_questions_pkey PRIMARY KEY (id),
    CONSTRAINT mission_questions_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT mission_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions (id)
);

-- ── Index du §7.1 portés par cette migration ─────────────────────────────────
CREATE INDEX idx_questions_status_block_id ON questions (status, block_id);
CREATE UNIQUE INDEX uq_questions_code_version ON questions (code, version) WHERE code IS NOT NULL;
CREATE INDEX idx_questions_sectors_gin ON questions USING GIN (sectors);
CREATE INDEX idx_questions_profiles_gin ON questions USING GIN (profiles);
CREATE INDEX idx_questions_target_services_gin ON questions USING GIN (target_services);

-- @DOWN

DROP INDEX IF EXISTS idx_questions_target_services_gin;
DROP INDEX IF EXISTS idx_questions_profiles_gin;
DROP INDEX IF EXISTS idx_questions_sectors_gin;
DROP INDEX IF EXISTS uq_questions_code_version;
DROP INDEX IF EXISTS idx_questions_status_block_id;
DROP TABLE IF EXISTS mission_questions;
DROP TABLE IF EXISTS question_translations;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS blocks;
