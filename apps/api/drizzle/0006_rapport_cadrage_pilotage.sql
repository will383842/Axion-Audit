-- =============================================================================
-- 0006 — RAPPORT · CADRAGE, CHIFFRAGE & PILOTAGE
-- Transcription de docs/04_MODELE_DE_DONNEES.md §7, blocs « RAPPORT » (§25.5,
-- §26.2) et « CADRAGE, CHIFFRAGE & PILOTAGE » (§18, §24.1, §25.1, §32.2, §20.4).
-- Conventions de transcription T1-T11 : voir l'en-tête de 0001_referentiels.sql.
-- =============================================================================

-- @UP

-- ── report_sections ──────────────────────────────────────────────────────────
CREATE TABLE report_sections (
    id             UUID        NOT NULL,
    mission_id     UUID        NOT NULL,
    block_id       UUID        NULL,
    section_code   TEXT        NULL,
    position       INTEGER     NULL,
    raw_data       JSONB       NULL,
    generated_text TEXT        NULL,
    generated_at   TIMESTAMPTZ NULL,
    llm_model      TEXT        NULL,
    llm_tokens     INTEGER     NULL,
    llm_cost_eur   NUMERIC     NULL,
    validated_text TEXT        NULL,
    validated_by   UUID        NULL,
    validated_at   TIMESTAMPTZ NULL,
    status         TEXT        NOT NULL DEFAULT 'brut',
    CONSTRAINT report_sections_pkey PRIMARY KEY (id),
    CONSTRAINT report_sections_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT report_sections_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks (id),
    CONSTRAINT report_sections_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES users (id),
    CONSTRAINT report_sections_status_check
        CHECK (status IN ('brut', 'genere', 'valide'))
);

-- ── report_templates ─────────────────────────────────────────────────────────
-- V2.2 (§32.6) : la clé du gabarit est le NIVEAU D'AUDIT (§26.2 prévaut sur
-- M1.5/size_tier).
CREATE TABLE report_templates (
    id          UUID        NOT NULL,
    name        TEXT        NOT NULL,
    audit_level TEXT        NULL,
    kind        TEXT        NOT NULL DEFAULT 'rapport',
    storage_key TEXT        NULL,
    version     INTEGER     NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT report_templates_pkey PRIMARY KEY (id),
    CONSTRAINT report_templates_audit_level_check
        CHECK (audit_level IN ('diagnostic_cadrage', 'operationnel', 'strategique_groupe')),
    CONSTRAINT report_templates_kind_check
        CHECK (kind IN ('rapport', 'point_etape'))
);

-- ── report_files ─────────────────────────────────────────────────────────────
CREATE TABLE report_files (
    id           UUID        NOT NULL,
    mission_id   UUID        NOT NULL,
    template_id  UUID        NULL,
    kind         TEXT        NOT NULL,
    storage_key  TEXT        NULL,
    generated_by UUID        NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT report_files_pkey PRIMARY KEY (id),
    CONSTRAINT report_files_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT report_files_template_id_fkey FOREIGN KEY (template_id) REFERENCES report_templates (id),
    CONSTRAINT report_files_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES users (id),
    CONSTRAINT report_files_kind_check
        CHECK (kind IN ('docx', 'pdf', 'pptx'))
);

-- ── scoping_estimates ────────────────────────────────────────────────────────
-- P1-3 : AUCUNE colonne financière ici — voir `scoping_financials`.
CREATE TABLE scoping_estimates (
    id                 UUID        NOT NULL,
    company_id         UUID        NOT NULL,
    mission_id         UUID        NULL,
    scope_tree         JSONB       NULL,
    planned_interviews JSONB       NULL,
    workload_days      NUMERIC     NULL,
    team_size          INTEGER     NULL,
    calendar_days      INTEGER     NULL,
    scenario_label     TEXT        NULL,
    status             TEXT        NOT NULL DEFAULT 'brouillon',
    created_by         UUID        NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT scoping_estimates_pkey PRIMARY KEY (id),
    CONSTRAINT scoping_estimates_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies (id),
    CONSTRAINT scoping_estimates_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT scoping_estimates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT scoping_estimates_status_check
        CHECK (status IN ('brouillon', 'envoye_console', 'signe', 'abandonne'))
);

-- ── scoping_financials ───────────────────────────────────────────────────────
-- Table SÉPARÉE de `scoping_estimates` EXPRÈS (P1-3, exigence E21).
-- Accès : routes et requêtes ADMIN EXCLUSIVEMENT ; aucune jointure côté endpoints
-- consultants. La séparation physique est ce qui rend la règle vérifiable.
CREATE TABLE scoping_financials (
    scoping_estimate_id UUID        NOT NULL,
    daily_rates         JSONB       NULL,
    travel_costs        NUMERIC     NULL,
    total_amount        NUMERIC     NULL,
    currency            TEXT        NOT NULL DEFAULT 'EUR',
    updated_by          UUID        NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT scoping_financials_pkey PRIMARY KEY (scoping_estimate_id),
    CONSTRAINT scoping_financials_scoping_estimate_id_fkey
        FOREIGN KEY (scoping_estimate_id) REFERENCES scoping_estimates (id),
    CONSTRAINT scoping_financials_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id)
);

-- ── estimation_params ────────────────────────────────────────────────────────
-- Clés normées (seed L1) : duree_<type_session>_<profil> · preparation_<palier> ·
-- analyse_par_bloc · redaction_<palier> · deplacement_par_site ·
-- taux_horaire_charge_<categorie> (§32.4 ROI) · seuil_completude_bloc (0.60) ·
-- seuil_fiabilite_answers (3) · seuil_divergence_ecart_type (1.5).
CREATE TABLE estimation_params (
    key         TEXT        NOT NULL,
    value       NUMERIC     NULL,
    unit        TEXT        NULL,
    description TEXT        NULL,
    updated_by  UUID        NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT estimation_params_pkey PRIMARY KEY (key),
    CONSTRAINT estimation_params_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id)
);

-- ── work_assignments ─────────────────────────────────────────────────────────
CREATE TABLE work_assignments (
    id                 UUID    NOT NULL,
    mission_id         UUID    NOT NULL,
    user_id            UUID    NOT NULL,
    org_unit_id        UUID    NOT NULL,
    planned_interviews INTEGER NULL,
    planned_days       NUMERIC NULL,
    date_from          DATE    NULL,
    date_to            DATE    NULL,
    CONSTRAINT work_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT work_assignments_mission_id_user_id_org_unit_id_key
        UNIQUE (mission_id, user_id, org_unit_id),
    CONSTRAINT work_assignments_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT work_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT work_assignments_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id)
);

-- ── mission_rebaselines (§25.1) ──────────────────────────────────────────────
-- Phase 2 pour l'outillage ; processus manuel sur la mission 1 (voir 07 §15).
CREATE TABLE mission_rebaselines (
    id                UUID        NOT NULL,
    mission_id        UUID        NOT NULL,
    delta_interviews  INTEGER     NULL,
    delta_days        NUMERIC     NULL,
    decision          TEXT        NULL,
    note              TEXT        NULL,
    decided_by        UUID        NULL,
    decided_at        TIMESTAMPTZ NULL,
    CONSTRAINT mission_rebaselines_pkey PRIMARY KEY (id),
    CONSTRAINT mission_rebaselines_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT mission_rebaselines_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES users (id),
    CONSTRAINT mission_rebaselines_decision_check
        CHECK (decision IN ('absorbe', 'avenant', 'descope'))
);

-- ── document_requests (§27.1) ────────────────────────────────────────────────
CREATE TABLE document_requests (
    id            UUID        NOT NULL,
    mission_id    UUID        NOT NULL,
    org_unit_id   UUID        NULL,
    label         TEXT        NOT NULL,
    description   TEXT        NULL,
    status        TEXT        NOT NULL DEFAULT 'demande',
    attachment_id UUID        NULL,
    requested_at  TIMESTAMPTZ NULL,
    received_at   TIMESTAMPTZ NULL,
    CONSTRAINT document_requests_pkey PRIMARY KEY (id),
    CONSTRAINT document_requests_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT document_requests_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT document_requests_attachment_id_fkey FOREIGN KEY (attachment_id) REFERENCES attachments (id),
    CONSTRAINT document_requests_status_check
        CHECK (status IN ('demande', 'recu', 'partiel', 'non_disponible'))
);

-- ── step_validations (§32.2, P1-1) ───────────────────────────────────────────
-- Énumération FERMÉE des codes d'étape + COHÉRENCE step_code ↔ scope. Le 04
-- l'énonce comme une RÈGLE, pas comme un commentaire : elle est donc une CHECK
-- composite, sinon rien n'empêcherait un `entretien` de scope 'mission'.
CREATE TABLE step_validations (
    id              UUID        NOT NULL,
    mission_id      UUID        NOT NULL,
    step_code       TEXT        NOT NULL,
    scope           TEXT        NOT NULL,
    scope_id        UUID        NULL,
    validated_by    UUID        NULL,
    validated_at    TIMESTAMPTZ NULL,
    was_override    BOOLEAN     NOT NULL DEFAULT false,
    override_reason TEXT        NULL,
    CONSTRAINT step_validations_pkey PRIMARY KEY (id),
    CONSTRAINT step_validations_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT step_validations_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES users (id),
    CONSTRAINT step_validations_step_code_check
        CHECK (step_code IN ('cadrage', 'preparation', 'collecte', 'analyse', 'rapport',
                             'livraison', 'entretien', 'unite')),
    CONSTRAINT step_validations_scope_check
        CHECK (scope IN ('mission', 'interview', 'org_unit')),
    CONSTRAINT step_validations_scope_coherence_check
        CHECK (
            (step_code = 'entretien' AND scope = 'interview')
            OR (step_code = 'unite' AND scope = 'org_unit')
            OR (step_code IN ('cadrage', 'preparation', 'collecte', 'analyse', 'rapport', 'livraison')
                AND scope = 'mission')
        )
);

-- ── alerts (P1-2 §20.4) ──────────────────────────────────────────────────────
-- Générées par les jobs worker + triggers ; JAMAIS supprimées (invariant 7).
CREATE TABLE alerts (
    id          UUID        NOT NULL,
    mission_id  UUID        NOT NULL,
    org_unit_id UUID        NULL,
    user_id     UUID        NULL,
    type        TEXT        NOT NULL,
    severity    TEXT        NULL,
    message     TEXT        NULL,
    entity_type TEXT        NULL,
    entity_id   UUID        NULL,
    status      TEXT        NOT NULL DEFAULT 'active',
    ack_by      UUID        NULL,
    ack_reason  TEXT        NULL,
    ack_at      TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alerts_pkey PRIMARY KEY (id),
    CONSTRAINT alerts_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT alerts_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT alerts_ack_by_fkey FOREIGN KEY (ack_by) REFERENCES users (id),
    CONSTRAINT alerts_status_check
        CHECK (status IN ('active', 'acquittee', 'resolue'))
);

-- ── Index du §7.1 portés par cette migration ─────────────────────────────────
CREATE INDEX idx_step_validations_mission_id_step_code ON step_validations (mission_id, step_code);
CREATE INDEX idx_alerts_mission_id_status ON alerts (mission_id, status);
CREATE INDEX idx_work_assignments_mission_id ON work_assignments (mission_id);
CREATE INDEX idx_document_requests_mission_id ON document_requests (mission_id);

-- @DOWN

DROP INDEX IF EXISTS idx_document_requests_mission_id;
DROP INDEX IF EXISTS idx_work_assignments_mission_id;
DROP INDEX IF EXISTS idx_alerts_mission_id_status;
DROP INDEX IF EXISTS idx_step_validations_mission_id_step_code;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS step_validations;
DROP TABLE IF EXISTS document_requests;
DROP TABLE IF EXISTS mission_rebaselines;
DROP TABLE IF EXISTS work_assignments;
DROP TABLE IF EXISTS estimation_params;
DROP TABLE IF EXISTS scoping_financials;
DROP TABLE IF EXISTS scoping_estimates;
DROP TABLE IF EXISTS report_files;
DROP TABLE IF EXISTS report_templates;
DROP TABLE IF EXISTS report_sections;
