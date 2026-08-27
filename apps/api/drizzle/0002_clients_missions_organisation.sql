-- =============================================================================
-- 0002 — CLIENTS & MISSIONS + ORGANISATION
-- Transcription de docs/04_MODELE_DE_DONNEES.md §7, blocs « CLIENTS & MISSIONS »
-- (§32.3, §20.1, §22.2, §27.4) et « ORGANISATION » (§16.2, §25.3, §26.3, R6).
-- Conventions de transcription T1-T11 : voir l'en-tête de 0001_referentiels.sql.
-- =============================================================================

-- @UP

-- ── companies ────────────────────────────────────────────────────────────────
-- `siren` NULL autorisé (filiales étrangères) ; l'unicité est portée par un index
-- UNIQUE PARTIEL `WHERE siren IS NOT NULL` — clé de déduplication R3 (§7.1).
CREATE TABLE companies (
    id           UUID        NOT NULL,
    external_ref TEXT        NULL,
    name         TEXT        NOT NULL,
    siren        TEXT        NULL,
    naf_code     TEXT        NULL,
    sector_id    UUID        NULL,
    headcount    INTEGER     NULL,
    sites_count  INTEGER     NULL,
    countries    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    notes        TEXT        NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ NULL,
    CONSTRAINT companies_pkey PRIMARY KEY (id),
    CONSTRAINT companies_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors (id)
);

COMMENT ON COLUMN companies.external_ref IS
    'Id client de la console axion-ia.com (NULL si entreprise créée localement).';

-- ── missions ─────────────────────────────────────────────────────────────────
-- V2.9 : `geo_scope` est le périmètre COMMERCIAL ; une mission fille de
-- déclinaison conserve 'multi_pays' et porte son `country_code` (jamais 'france'
-- hors France). `parent_mission_id` : consolidation groupe → missions filles (§32.3).
CREATE TABLE missions (
    id                UUID        NOT NULL,
    company_id        UUID        NOT NULL,
    parent_mission_id UUID        NULL,
    title             TEXT        NOT NULL,
    geo_scope         TEXT        NOT NULL,
    country_code      TEXT        NULL,
    size_tier_id      UUID        NULL,
    active_sectors    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    active_blocks     JSONB       NOT NULL DEFAULT '[]'::jsonb,
    audit_level       TEXT        NOT NULL,
    commercial_offer  TEXT        NULL,
    timezone          TEXT        NOT NULL DEFAULT 'Europe/Paris',
    nda_ref           TEXT        NULL,
    nda_signed_at     DATE        NULL,
    status            TEXT        NOT NULL,
    llm_provider      TEXT        NOT NULL DEFAULT 'anthropic',
    start_planned     DATE        NULL,
    end_planned       DATE        NULL,
    delivered_at      TIMESTAMPTZ NULL,
    created_by        UUID        NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ NULL,
    CONSTRAINT missions_pkey PRIMARY KEY (id),
    CONSTRAINT missions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies (id),
    CONSTRAINT missions_parent_mission_id_fkey FOREIGN KEY (parent_mission_id) REFERENCES missions (id),
    CONSTRAINT missions_size_tier_id_fkey FOREIGN KEY (size_tier_id) REFERENCES size_tiers (id),
    CONSTRAINT missions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT missions_geo_scope_check
        CHECK (geo_scope IN ('france', 'multi_pays')),
    CONSTRAINT missions_audit_level_check
        CHECK (audit_level IN ('diagnostic_cadrage', 'operationnel', 'strategique_groupe')),
    CONSTRAINT missions_commercial_offer_check
        CHECK (commercial_offer IN ('audit_flash', 'audit_cible', 'mission_pme', 'mission_eti', 'grand_programme')),
    CONSTRAINT missions_status_check
        CHECK (status IN ('preparation', 'en_cours', 'en_analyse', 'livree', 'cloturee')),
    CONSTRAINT missions_llm_provider_check
        CHECK (llm_provider IN ('anthropic', 'ue_hosted'))
);

-- ── mission_users ────────────────────────────────────────────────────────────
CREATE TABLE mission_users (
    mission_id       UUID NOT NULL,
    user_id          UUID NOT NULL,
    role_on_mission  TEXT NOT NULL,
    CONSTRAINT mission_users_pkey PRIMARY KEY (mission_id, user_id),
    CONSTRAINT mission_users_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT mission_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT mission_users_role_on_mission_check
        CHECK (role_on_mission IN ('lead', 'consultant', 'analyste', 'lecteur'))
);

-- ── org_units ────────────────────────────────────────────────────────────────
-- UUID v7 côté client possible (proposition terrain §25.3).
-- `in_scope` (règle V2.2 §25.1) : sortie de périmètre = données CONSERVÉES, mais
-- exclues du scoring et de la couverture.
CREATE TABLE org_units (
    id             UUID        NOT NULL,
    mission_id     UUID        NOT NULL,
    parent_id      UUID        NULL,
    kind           TEXT        NOT NULL,
    name           TEXT        NOT NULL,
    country_code   TEXT        NULL,
    timezone       TEXT        NULL,
    headcount      INTEGER     NULL,
    service_ref_id UUID        NULL,
    sector_id      UUID        NULL,
    in_scope       BOOLEAN     NOT NULL DEFAULT true,
    status         TEXT        NOT NULL DEFAULT 'active',
    proposed_by    UUID        NULL,
    merged_into_id UUID        NULL,
    position       INTEGER     NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT org_units_pkey PRIMARY KEY (id),
    CONSTRAINT org_units_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions (id),
    CONSTRAINT org_units_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES org_units (id),
    CONSTRAINT org_units_service_ref_id_fkey FOREIGN KEY (service_ref_id) REFERENCES services (id),
    CONSTRAINT org_units_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors (id),
    CONSTRAINT org_units_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES users (id),
    CONSTRAINT org_units_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES org_units (id),
    CONSTRAINT org_units_kind_check
        CHECK (kind IN ('groupe', 'filiale', 'etablissement', 'direction', 'service', 'equipe', 'poste')),
    CONSTRAINT org_units_status_check
        CHECK (status IN ('active', 'proposee', 'fusionnee'))
);

COMMENT ON COLUMN org_units.timezone IS
    '§22.2 — héritage par l''arbre : NULL = fuseau de la mission.';

-- ── Index du §7.1 portés par cette migration ─────────────────────────────────
CREATE UNIQUE INDEX uq_companies_siren ON companies (siren) WHERE siren IS NOT NULL;
CREATE INDEX idx_missions_company_id ON missions (company_id);
CREATE INDEX idx_missions_status ON missions (status);
CREATE INDEX idx_missions_parent_mission_id ON missions (parent_mission_id);
CREATE INDEX idx_org_units_mission_id ON org_units (mission_id);
CREATE INDEX idx_org_units_parent_id ON org_units (parent_id);

-- @DOWN

DROP INDEX IF EXISTS idx_org_units_parent_id;
DROP INDEX IF EXISTS idx_org_units_mission_id;
DROP INDEX IF EXISTS idx_missions_parent_mission_id;
DROP INDEX IF EXISTS idx_missions_status;
DROP INDEX IF EXISTS idx_missions_company_id;
DROP INDEX IF EXISTS uq_companies_siren;
DROP TABLE IF EXISTS org_units;
DROP TABLE IF EXISTS mission_users;
DROP TABLE IF EXISTS missions;
DROP TABLE IF EXISTS companies;
