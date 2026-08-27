-- =============================================================================
-- 0005 — INVENTAIRES & AI ACT · ANALYSE, SCORING & CONSTATS · CAS D'USAGE
-- Transcription de docs/04_MODELE_DE_DONNEES.md §7, blocs « INVENTAIRES & AI ACT »
-- (§27.3, bloc 9, §16.2), « ANALYSE, SCORING & CONSTATS » (§32.1, §16.4, §16.5,
-- §25.5, §27.2, §27.4) et « CAS D'USAGE & FEUILLE DE ROUTE » (§20.3, §28).
-- Conventions de transcription T1-T11 : voir l'en-tête de 0001_referentiels.sql.
-- =============================================================================

-- @UP

-- ── tools_inventory (§27.3) ──────────────────────────────────────────────────
CREATE TABLE tools_inventory (
    id                UUID        NOT NULL,
    mission_id        UUID        NOT NULL,
    org_unit_id       UUID        NULL,
    name              TEXT        NOT NULL,
    category          TEXT        NOT NULL,
    vendor            TEXT        NULL,
    usage_description TEXT        NULL,
    users_count       INTEGER     NULL,
    criticality       TEXT        NULL,
    data_quality_note TEXT        NULL,
    source_session_id UUID        NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tools_inventory_pkey PRIMARY KEY (id),
    CONSTRAINT tools_inventory_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT tools_inventory_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT tools_inventory_source_session_id_fkey FOREIGN KEY (source_session_id) REFERENCES interviews (id),
    CONSTRAINT tools_inventory_category_check
        CHECK (category IN ('erp', 'crm', 'bureautique', 'metier', 'ia', 'fichier_excel', 'papier', 'autre')),
    CONSTRAINT tools_inventory_criticality_check
        CHECK (criticality IN ('critique', 'importante', 'faible'))
);

-- ── ai_systems (§16.2, bloc 9 — AI Act) ──────────────────────────────────────
CREATE TABLE ai_systems (
    id                UUID        NOT NULL,
    mission_id        UUID        NOT NULL,
    org_unit_id       UUID        NULL,
    name              TEXT        NOT NULL,
    vendor            TEXT        NULL,
    usage_description TEXT        NULL,
    data_categories   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    service_id        UUID        NULL,
    business_owner    TEXT        NULL,
    actor_role        TEXT        NULL,
    risk_level        TEXT        NULL,
    obligations       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    compliance_status TEXT        NULL,
    source            TEXT        NULL,
    notes             TEXT        NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ai_systems_pkey PRIMARY KEY (id),
    CONSTRAINT ai_systems_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT ai_systems_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT ai_systems_service_id_fkey FOREIGN KEY (service_id) REFERENCES services (id),
    CONSTRAINT ai_systems_actor_role_check
        CHECK (actor_role IN ('deployeur', 'fournisseur', 'les_deux')),
    CONSTRAINT ai_systems_risk_level_check
        CHECK (risk_level IN ('inacceptable', 'haut_risque', 'risque_limite_art50', 'minimal')),
    CONSTRAINT ai_systems_compliance_status_check
        CHECK (compliance_status IN ('conforme', 'partiel', 'non_conforme', 'a_qualifier')),
    CONSTRAINT ai_systems_source_check
        CHECK (source IN ('declare', 'detecte_entretien'))
);

-- ── block_scores (§32.1) ─────────────────────────────────────────────────────
-- `is_indicative` : sous le seuil de complétude (défaut 60 %, `estimation_params`
-- clé `seuil_completude_bloc` — V2.9 aligné sur §32.1 et le seed 11 §5).
CREATE TABLE block_scores (
    mission_id   UUID        NOT NULL,
    block_id     UUID        NOT NULL,
    score        NUMERIC     NULL,
    computed_at  TIMESTAMPTZ NULL,
    details      JSONB       NULL,
    completeness NUMERIC     NULL,
    is_indicative BOOLEAN    NOT NULL DEFAULT false,
    CONSTRAINT block_scores_pkey PRIMARY KEY (mission_id, block_id),
    CONSTRAINT block_scores_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT block_scores_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks (id)
);

-- ── unit_scores (§16.4) ──────────────────────────────────────────────────────
-- `answers_count` : seuil de fiabilité d'affichage, défaut 3
-- (`estimation_params`, clé `seuil_fiabilite_answers`).
CREATE TABLE unit_scores (
    mission_id    UUID        NOT NULL,
    org_unit_id   UUID        NOT NULL,
    block_id      UUID        NOT NULL,
    score         NUMERIC     NULL,
    answers_count INTEGER     NULL,
    completeness  NUMERIC     NULL,
    computed_at   TIMESTAMPTZ NULL,
    CONSTRAINT unit_scores_pkey PRIMARY KEY (mission_id, org_unit_id, block_id),
    CONSTRAINT unit_scores_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT unit_scores_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT unit_scores_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks (id)
);

-- ── findings (§16.5) ─────────────────────────────────────────────────────────
-- `sources` (V2.2 §27.2) : {answer_ids[], session_ids[], attachment_ids[]} —
-- ≥ 1 source obligatoire (règle applicative, §16.5).
CREATE TABLE findings (
    id                 UUID        NOT NULL,
    mission_id         UUID        NOT NULL,
    org_unit_id        UUID        NULL,
    block_id           UUID        NULL,
    severity           TEXT        NOT NULL,
    title              TEXT        NULL,
    statement          TEXT        NULL,
    sources            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    recommendation     TEXT        NULL,
    owner_suggested    TEXT        NULL,
    remediation_status TEXT        NOT NULL DEFAULT 'a_traiter',
    wave               TEXT        NULL,
    status             TEXT        NOT NULL DEFAULT 'brouillon',
    created_by         UUID        NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT findings_pkey PRIMARY KEY (id),
    CONSTRAINT findings_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT findings_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT findings_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks (id),
    CONSTRAINT findings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT findings_severity_check
        CHECK (severity IN ('drapeau_rouge', 'majeur', 'mineur', 'point_fort')),
    CONSTRAINT findings_remediation_status_check
        CHECK (remediation_status IN ('a_traiter', 'planifie', 'en_cours', 'clos', 'abandonne')),
    CONSTRAINT findings_wave_check
        CHECK (wave IN ('quick_win', 'chantier', 'transformation')),
    CONSTRAINT findings_status_check
        CHECK (status IN ('brouillon', 'valide'))
);

COMMENT ON COLUMN findings.status IS
    '§25.5 — le point d''étape n''utilise que des brouillons CHOISIS.';

-- ── use_cases (§20.3, §28) ───────────────────────────────────────────────────
-- `assumptions`, `gain_low`, `gain_high`, `payback_months` : §28.2-5, colonnes
-- CRÉÉES DÈS L1, exploitées en Phase 2.
CREATE TABLE use_cases (
    id                         UUID        NOT NULL,
    mission_id                 UUID        NOT NULL,
    org_unit_id                UUID        NULL,
    title                      TEXT        NOT NULL,
    description                TEXT        NULL,
    service_id                 UUID        NULL,
    status                     TEXT        NOT NULL DEFAULT 'candidate',
    conditions                 TEXT        NULL,
    estimated_gain             TEXT        NULL,
    estimated_cost             TEXT        NULL,
    complexity                 TEXT        NULL,
    delay_months               INTEGER     NULL,
    risk_level                 TEXT        NULL,
    wave                       TEXT        NULL,
    baseline_value             NUMERIC     NULL,
    baseline_unit              TEXT        NULL,
    baseline_source_session_id UUID        NULL,
    target_value               NUMERIC     NULL,
    data_required              TEXT        NULL,
    data_available             TEXT        NULL,
    approach                   TEXT        NULL,
    success_metric             TEXT        NULL,
    assumptions                TEXT        NULL,
    gain_low                   NUMERIC     NULL,
    gain_high                  NUMERIC     NULL,
    payback_months             INTEGER     NULL,
    taxonomy_ref               TEXT        NULL,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT use_cases_pkey PRIMARY KEY (id),
    CONSTRAINT use_cases_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT use_cases_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES org_units (id),
    CONSTRAINT use_cases_service_id_fkey FOREIGN KEY (service_id) REFERENCES services (id),
    CONSTRAINT use_cases_baseline_source_session_id_fkey FOREIGN KEY (baseline_source_session_id) REFERENCES interviews (id),
    CONSTRAINT use_cases_status_check
        CHECK (status IN ('candidate', 'short_list', 'ecarte', 'retenu')),
    CONSTRAINT use_cases_complexity_check
        CHECK (complexity IN ('faible', 'moyenne', 'elevee')),
    CONSTRAINT use_cases_risk_level_check
        CHECK (risk_level IN ('faible', 'moyen', 'eleve')),
    CONSTRAINT use_cases_wave_check
        CHECK (wave IN ('quick_win', 'chantier', 'transformation')),
    CONSTRAINT use_cases_data_available_check
        CHECK (data_available IN ('oui', 'partiel', 'non', 'a_verifier')),
    CONSTRAINT use_cases_approach_check
        CHECK (approach IN ('acheter', 'integrer', 'developper'))
);

COMMENT ON COLUMN use_cases.taxonomy_ref IS
    'Réf. taxonomie des 50 cas d''usage Axion-IA (§2.5).';

-- ── roadmap_items (§20.3, §28.1-1, §28.2-6, §28.2-8) ─────────────────────────
CREATE TABLE roadmap_items (
    id                 UUID        NOT NULL,
    mission_id         UUID        NOT NULL,
    use_case_id        UUID        NULL,
    palier             INTEGER     NULL,
    month_start        INTEGER     NULL,
    month_end          INTEGER     NULL,
    description        TEXT        NULL,
    expected_gain      TEXT        NULL,
    kpi                TEXT        NULL,
    assimilation_weeks INTEGER     NULL,
    baseline_value     NUMERIC     NULL,
    baseline_unit      TEXT        NULL,
    target_value       NUMERIC     NULL,
    depends_on         JSONB       NULL,
    scenario           TEXT        NOT NULL DEFAULT 'standard',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roadmap_items_pkey PRIMARY KEY (id),
    CONSTRAINT roadmap_items_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT roadmap_items_use_case_id_fkey FOREIGN KEY (use_case_id) REFERENCES use_cases (id),
    CONSTRAINT roadmap_items_scenario_check
        CHECK (scenario IN ('standard', 'prudent', 'ambitieux'))
);

COMMENT ON COLUMN roadmap_items.depends_on IS
    '§28.2-6 — ids d''actions ; le contrôle de cohérence est un livrable Phase 2.';

-- ── Index du §7.1 portés par cette migration ─────────────────────────────────
CREATE INDEX idx_findings_mission_id ON findings (mission_id);
CREATE INDEX idx_use_cases_mission_id ON use_cases (mission_id);
CREATE INDEX idx_roadmap_items_mission_id ON roadmap_items (mission_id);

-- @DOWN

DROP INDEX IF EXISTS idx_roadmap_items_mission_id;
DROP INDEX IF EXISTS idx_use_cases_mission_id;
DROP INDEX IF EXISTS idx_findings_mission_id;
DROP TABLE IF EXISTS roadmap_items;
DROP TABLE IF EXISTS use_cases;
DROP TABLE IF EXISTS findings;
DROP TABLE IF EXISTS unit_scores;
DROP TABLE IF EXISTS block_scores;
DROP TABLE IF EXISTS ai_systems;
DROP TABLE IF EXISTS tools_inventory;
