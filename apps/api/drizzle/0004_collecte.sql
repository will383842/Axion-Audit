-- =============================================================================
-- 0004 — COLLECTE : sessions, réponses, révisions, pièces jointes
-- Transcription de docs/04_MODELE_DE_DONNEES.md §7, bloc « COLLECTE — SESSIONS »
-- (§27.1, §25.2, §25.4, §25.6, §27.4, §28.1, §9.3, §9.4, §9.9, §10.4).
-- Conventions de transcription T1-T11 : voir l'en-tête de 0001_referentiels.sql.
--
-- FK CIRCULAIRES — NE SONT PAS ICI. Le fichier 04 est explicite :
--   « FK avant/circulaires (`interviews.linked_review_answer_id → answers`,
--     `interviews.document_request_id → document_requests`) : créées par
--     ALTER TABLE en FIN de migration — une transcription table par table dans
--     l'ordre du fichier ne compile pas sans cela. »
-- Elles sont donc posées par 0008_fk_differees.sql, une fois `answers` (ici) et
-- `document_requests` (0006) créées. Les COLONNES, elles, sont bien déclarées ici.
-- =============================================================================

-- @UP

-- ── interviews ───────────────────────────────────────────────────────────────
-- Décision V2.2 (§32.6) : le TYPE de session (`kind`) est DISTINCT du MODE
-- d'entretien (`mode`) — 'complementaire' est un mode, pas un type.
-- `conducted_by` = PROPRIÉTAIRE : seul habilité à écrire via sync (§9.9) ;
-- réaffectable par admin/lead UNIQUEMENT si status ∉ {en_cours, termine} (§34.4).
CREATE TABLE interviews (
    id                          UUID        NOT NULL,
    mission_id                  UUID        NOT NULL,
    conducted_by                UUID        NOT NULL,
    kind                        TEXT        NOT NULL DEFAULT 'entretien',
    mode                        TEXT        NULL,
    linked_review_answer_id     UUID        NULL,
    person_name                 TEXT        NULL,
    person_role                 TEXT        NULL,
    person_service_id           UUID        NULL,
    person_email                TEXT        NULL,
    participants                JSONB       NULL,
    org_unit_id                 UUID        NOT NULL,
    document_request_id         UUID        NULL,
    consent_given               BOOLEAN     NULL,
    consent_audio               BOOLEAN     NULL,
    consented_at                TIMESTAMPTZ NULL,
    information_notice_version  TEXT        NULL,
    notice_shown_at             TIMESTAMPTZ NULL,
    scheduled_at                TIMESTAMPTZ NULL,
    scheduled_duration_min      INTEGER     NULL,
    schedule_status             TEXT        NOT NULL DEFAULT 'a_planifier',
    status                      TEXT        NOT NULL DEFAULT 'non_demarre',
    started_at                  TIMESTAMPTZ NULL,
    ended_at                    TIMESTAMPTZ NULL,
    general_notes               TEXT        NULL,
    client_created_at           TIMESTAMPTZ NULL,
    client_updated_at           TIMESTAMPTZ NULL,
    synced_at                   TIMESTAMPTZ NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT interviews_pkey PRIMARY KEY (id),
    CONSTRAINT interviews_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT interviews_conducted_by_fkey FOREIGN KEY (conducted_by) REFERENCES users (id),
    CONSTRAINT interviews_person_service_id_fkey FOREIGN KEY (person_service_id) REFERENCES services (id),
    CONSTRAINT interviews_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT interviews_kind_check
        CHECK (kind IN ('entretien', 'observation', 'demonstration', 'analyse_documentaire',
                        'releve_donnees', 'atelier')),
    CONSTRAINT interviews_mode_check
        CHECK (mode IN ('sur_site', 'distanciel', 'complementaire')),
    CONSTRAINT interviews_schedule_status_check
        CHECK (schedule_status IN ('a_planifier', 'planifie', 'confirme', 'realise', 'reporte', 'annule')),
    CONSTRAINT interviews_status_check
        CHECK (status IN ('non_demarre', 'en_cours', 'termine'))
);

COMMENT ON COLUMN interviews.mode IS
    'V2.8 — défaut APPLICATIF : ''sur_site'' si kind=''entretien'', NULL sinon. '
    'Un DEFAULT SQL conditionnel n''existe pas : la colonne reste NULLABLE, la règle '
    'est portée par le code (aucun trigger de compensation — le 04 ne le demande pas).';
COMMENT ON COLUMN interviews.person_service_id IS
    'P2-1 — fonction de la PERSONNE ; l''unité d''audit est TOUJOURS org_unit_id.';
COMMENT ON COLUMN interviews.status IS
    'V2.9 — ''non_demarre'' = session planifiée/créée non commencée (§25.2) ; '
    'rend exécutable la règle de réaffectation §34.4 (status ∉ {en_cours, termine}).';

-- ── answers ──────────────────────────────────────────────────────────────────
-- UUID v7 CÔTÉ CLIENT = clé d'idempotence du push.
-- V2.2 (§32.6) : UNIQUE(interview_id, mission_question_id) — UNE réponse par
-- question et par session ; toute re-réponse est une RÉVISION (answer_revisions).
-- Le hors-parcours est un flag de la même réponse, jamais une seconde ligne.
CREATE TABLE answers (
    id                     UUID        NOT NULL,
    interview_id           UUID        NOT NULL,
    mission_question_id    UUID        NOT NULL,
    value                  JSONB       NULL,
    source                 TEXT        NOT NULL DEFAULT 'entretien',
    withheld               BOOLEAN     NOT NULL DEFAULT false,
    withheld_reason        TEXT        NULL,
    hors_parcours          BOOLEAN     NOT NULL DEFAULT false,
    note                   TEXT        NULL,
    flag_review            BOOLEAN     NOT NULL DEFAULT false,
    review_reason          TEXT        NULL,
    not_applicable         BOOLEAN     NOT NULL DEFAULT false,
    na_reason              TEXT        NULL,
    question_text_snapshot TEXT        NULL,
    revision               INTEGER     NOT NULL DEFAULT 1,
    client_created_at      TIMESTAMPTZ NULL,
    client_updated_at      TIMESTAMPTZ NULL,
    synced_at              TIMESTAMPTZ NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT answers_pkey PRIMARY KEY (id),
    CONSTRAINT answers_interview_id_mission_question_id_key
        UNIQUE (interview_id, mission_question_id),
    CONSTRAINT answers_interview_id_fkey FOREIGN KEY (interview_id) REFERENCES interviews (id),
    CONSTRAINT answers_mission_question_id_fkey FOREIGN KEY (mission_question_id) REFERENCES mission_questions (id),
    CONSTRAINT answers_source_check
        CHECK (source IN ('entretien', 'observation', 'demonstration', 'document', 'releve')),
    CONSTRAINT answers_withheld_reason_check
        CHECK (withheld_reason IN ('confidentiel', 'non_disponible', 'hors_perimetre', 'autre'))
);

COMMENT ON COLUMN answers.value IS
    '{type, v} ; money : {type:''money'', v, currency (déf. ''EUR'')} (§22.2) ; '
    'fourchette : {type:''range'', low, high} (+ currency si money) (§27.4).';
COMMENT ON COLUMN answers.question_text_snapshot IS
    'Redondance volontaire (décision V1) : la réponse reste lisible sans la banque.';

-- ── answer_revisions — traçabilité §9.3/§9.9, invariant 7 ────────────────────
CREATE TABLE answer_revisions (
    id             UUID        NOT NULL,
    answer_id      UUID        NOT NULL,
    previous_value JSONB       NULL,
    changed_by     UUID        NULL,
    changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    change_origin  TEXT        NOT NULL DEFAULT 'terrain',
    CONSTRAINT answer_revisions_pkey PRIMARY KEY (id),
    CONSTRAINT answer_revisions_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES answers (id),
    CONSTRAINT answer_revisions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users (id),
    CONSTRAINT answer_revisions_change_origin_check
        CHECK (change_origin IN ('terrain', 'sync_arbitrage', 'correction_siege'))
);

-- ── attachments ──────────────────────────────────────────────────────────────
-- V2.2 : 'note' intégré au CHECK (P1-5) ; `content` porte le corps de la note
-- volante, dont le RATTACHEMENT est complétable après coup — la ligne est donc
-- modifiable (LWW §9.4, op 'attachment_meta' 11 §4).
CREATE TABLE attachments (
    id                UUID        NOT NULL,
    interview_id      UUID        NULL,
    answer_id         UUID        NULL,
    mission_id        UUID        NOT NULL,
    kind              TEXT        NOT NULL,
    content           TEXT        NULL,
    filename          TEXT        NULL,
    mime              TEXT        NULL,
    size_bytes        BIGINT      NULL,
    storage_key       TEXT        NULL,
    transcription     TEXT        NULL,
    purge_after       DATE        NULL,
    client_created_at TIMESTAMPTZ NULL,
    client_updated_at TIMESTAMPTZ NULL,
    synced_at         TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attachments_pkey PRIMARY KEY (id),
    CONSTRAINT attachments_interview_id_fkey FOREIGN KEY (interview_id) REFERENCES interviews (id),
    CONSTRAINT attachments_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES answers (id),
    CONSTRAINT attachments_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT attachments_kind_check
        CHECK (kind IN ('photo', 'document', 'audio', 'note'))
);

COMMENT ON COLUMN attachments.storage_key IS
    'NULL pour kind = ''note'' (la note volante n''a pas de fichier — P1-5).';

-- ── Index du §7.1 portés par cette migration ─────────────────────────────────
CREATE INDEX idx_answers_interview_id ON answers (interview_id);
CREATE INDEX idx_answers_mission_question_id ON answers (mission_question_id);
CREATE INDEX idx_interviews_mission_id ON interviews (mission_id);
CREATE INDEX idx_interviews_org_unit_id ON interviews (org_unit_id);
CREATE INDEX idx_interviews_conducted_by ON interviews (conducted_by);
CREATE INDEX idx_interviews_schedule_status ON interviews (schedule_status);
CREATE INDEX idx_attachments_mission_id ON attachments (mission_id);

-- @DOWN

DROP INDEX IF EXISTS idx_attachments_mission_id;
DROP INDEX IF EXISTS idx_interviews_schedule_status;
DROP INDEX IF EXISTS idx_interviews_conducted_by;
DROP INDEX IF EXISTS idx_interviews_org_unit_id;
DROP INDEX IF EXISTS idx_interviews_mission_id;
DROP INDEX IF EXISTS idx_answers_mission_question_id;
DROP INDEX IF EXISTS idx_answers_interview_id;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS answer_revisions;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS interviews;
