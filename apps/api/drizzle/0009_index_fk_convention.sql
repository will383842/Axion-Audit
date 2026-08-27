-- =============================================================================
-- 0009 — INDEX DE CLÉ ÉTRANGÈRE (conventions du §7, hors liste §7.1)
--
-- POURQUOI CETTE MIGRATION EXISTE
-- Les conventions en tête du §7 du fichier 04 posent « FK indexées ». Le §7.1,
-- lui, s'intitule « Index CRITIQUES » : c'est un sous-ensemble DÉSIGNÉ, pas une
-- liste exhaustive, et le 11 §7 s'en sert seulement pour borner le périmètre du
-- diff schéma-vs-04. Les deux textes ne se contredisent donc pas : le §7.1 dit ce
-- que la CI vérifie, la convention dit ce que le schéma doit faire.
-- Arbitrage A01 (retour d'étape 2, lot L1) : appliquer la convention, et déclarer
-- ces index dans une SECTION DISTINCTE du manifeste (`indexEtablisParConvention`)
-- pour que le relecteur de la porte P-A voie d'où vient chaque ligne.
--
-- CE QUI N'EST PAS INDEXÉ, ET POURQUOI — la réserve compte autant que la liste.
-- Le moteur de sync (L6) est MASSIVEMENT en écriture : chaque index ralentit
-- chaque insertion d'un lot de 100 ops. Le pack demande des FK indexées, pas un
-- index par colonne. Règle appliquée ici, colonne par colonne :
--   INDEXER si (a) la colonne est le POINT D'ENTRÉE d'un chemin de lecture que le
--     pack décrit (un écran, un export, un job), ou (b) la table enfant grossit
--     à l'échelle FIL-GC (~8 000 réponses, 60 sessions, 150 unités) ;
--   NE PAS INDEXER si la lecture est de toute façon déjà réduite par un index
--     existant (typiquement `mission_id`) sur un ensemble qui reste petit, ou si
--     AUCUN chemin de lecture par cette colonne n'apparaît dans le pack.
-- 62 FK étaient nues après 0001-0008 ; 22 sont indexées ici, 40 restent nues
-- délibérément (motifs consignés dans le manifeste, section `fkNonIndexees`).
--
-- COÛT EN ÉCRITURE ASSUMÉ, chiffré sur les tables du chemin de sync :
--   · `answers`          : AUCUN index ajouté (les 3 du §7.1 suffisent) ;
--   · `attachments`      : +2 ;
--   · `answer_revisions` : +1 ;
--   · `interviews`       : +2, mais PARTIELS — `linked_review_answer_id` et
--     `document_request_id` sont NULL sur l'immense majorité des sessions, donc
--     une session ordinaire n'écrit RIEN dans ces deux index. C'est précisément
--     la forme qui donne le chemin de lecture sans payer le coût d'écriture.
-- =============================================================================

-- @UP

-- ── Authentification et affectation ──────────────────────────────────────────
-- §10.1 : à la détection de réutilisation d'un refresh token, on révoque TOUTE la
-- famille de jetons de l'utilisateur — cette lecture par user_id est le geste de
-- sécurité le plus sensible de l'API.
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- « Mes missions » : l'écran d'accueil de chaque consultant. La PK est
-- (mission_id, user_id) — `user_id` seul n'en est PAS un préfixe.
CREATE INDEX idx_mission_users_user_id ON mission_users (user_id);

-- §34 plan de charge : « mes affectations » par auditeur.
CREATE INDEX idx_work_assignments_user_id ON work_assignments (user_id);

-- §10.4 : purge RGPD à 12 mois et export des données d'un utilisateur.
CREATE INDEX idx_activity_log_user_id ON activity_log (user_id);

-- ── Questionnaire ────────────────────────────────────────────────────────────
-- Back-office de la banque (L9) : parcours par bloc. L'index du §7.1 est
-- (status, block_id) — `block_id` seul n'en est pas un préfixe.
CREATE INDEX idx_questions_block_id ON questions (block_id);

-- Le pull terrain lit TOUT le questionnaire figé d'une mission : c'est la
-- requête la plus volumineuse du chargement hors ligne.
CREATE INDEX idx_mission_questions_mission_id ON mission_questions (mission_id);

-- §36.4 ré-import / versionnage : « où cette question de banque est-elle figée ? »
CREATE INDEX idx_mission_questions_question_id ON mission_questions (question_id);

-- ── Collecte ─────────────────────────────────────────────────────────────────
-- Invariant 7 : l'historique de révision est le SEUL chemin d'accès de la table.
CREATE INDEX idx_answer_revisions_answer_id ON answer_revisions (answer_id);

-- Photos et notes d'une session, puis d'une réponse (§27.2 : les `sources` d'un
-- finding citent des attachment_ids). Table volumineuse : les photos dominent.
CREATE INDEX idx_attachments_interview_id ON attachments (interview_id);
CREATE INDEX idx_attachments_answer_id ON attachments (answer_id);

-- §25.6 / §27.1 — index PARTIELS : ces deux colonnes sont NULL sur la quasi-
-- totalité des sessions. Le partiel donne le chemin de lecture (« quel entretien
-- complémentaire lève cet à-revoir ? », « quelle session traite cette demande de
-- document ? ») sans faire payer l'insertion des sessions ordinaires.
CREATE INDEX idx_interviews_linked_review_answer_id ON interviews (linked_review_answer_id)
    WHERE linked_review_answer_id IS NOT NULL;
CREATE INDEX idx_interviews_document_request_id ON interviews (document_request_id)
    WHERE document_request_id IS NOT NULL;

-- ── Organisation et scoring ──────────────────────────────────────────────────
-- §16.3 : le moteur M2 ne génère les paquets « logistique » que si l'arbre
-- contient une unité logistique — donc une lecture des unités PAR fonction.
CREATE INDEX idx_org_units_service_ref_id ON org_units (service_ref_id);

-- §32.1-4 roll-up : agréger les scores des unités ENFANTS vers le parent. La PK
-- est (mission_id, org_unit_id, block_id) ; l'accès par unité seule ne l'utilise
-- qu'à moitié.
CREATE INDEX idx_unit_scores_org_unit_id ON unit_scores (org_unit_id);

-- ── Inventaires, rapport, chiffrage, coûts ───────────────────────────────────
CREATE INDEX idx_tools_inventory_mission_id ON tools_inventory (mission_id);
CREATE INDEX idx_ai_systems_mission_id ON ai_systems (mission_id);
CREATE INDEX idx_report_sections_mission_id ON report_sections (mission_id);
CREATE INDEX idx_report_files_mission_id ON report_files (mission_id);
CREATE INDEX idx_mission_rebaselines_mission_id ON mission_rebaselines (mission_id);
CREATE INDEX idx_llm_calls_mission_id ON llm_calls (mission_id);

-- §26 fiche entreprise 360° : tous les chiffrages d'un client, missions comprises.
CREATE INDEX idx_scoping_estimates_company_id ON scoping_estimates (company_id);
CREATE INDEX idx_scoping_estimates_mission_id ON scoping_estimates (mission_id);

-- @DOWN

DROP INDEX IF EXISTS idx_scoping_estimates_mission_id;
DROP INDEX IF EXISTS idx_scoping_estimates_company_id;
DROP INDEX IF EXISTS idx_llm_calls_mission_id;
DROP INDEX IF EXISTS idx_mission_rebaselines_mission_id;
DROP INDEX IF EXISTS idx_report_files_mission_id;
DROP INDEX IF EXISTS idx_report_sections_mission_id;
DROP INDEX IF EXISTS idx_ai_systems_mission_id;
DROP INDEX IF EXISTS idx_tools_inventory_mission_id;
DROP INDEX IF EXISTS idx_unit_scores_org_unit_id;
DROP INDEX IF EXISTS idx_org_units_service_ref_id;
DROP INDEX IF EXISTS idx_interviews_document_request_id;
DROP INDEX IF EXISTS idx_interviews_linked_review_answer_id;
DROP INDEX IF EXISTS idx_attachments_answer_id;
DROP INDEX IF EXISTS idx_attachments_interview_id;
DROP INDEX IF EXISTS idx_answer_revisions_answer_id;
DROP INDEX IF EXISTS idx_mission_questions_question_id;
DROP INDEX IF EXISTS idx_mission_questions_mission_id;
DROP INDEX IF EXISTS idx_questions_block_id;
DROP INDEX IF EXISTS idx_activity_log_user_id;
DROP INDEX IF EXISTS idx_work_assignments_user_id;
DROP INDEX IF EXISTS idx_mission_users_user_id;
DROP INDEX IF EXISTS idx_refresh_tokens_user_id;
