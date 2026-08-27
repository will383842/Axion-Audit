-- =============================================================================
-- 0012 — CONVENTION T13 (identité lisible) + retrait du défaut de `findings.sources`
--
-- ─────────────────────────────────────────────────────────────────────────────
-- T13 — POURQUOI CETTE MIGRATION EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
-- Deuxième passe de revue croisée, défaut B-4. La règle T8 posait `NOT NULL` sur
-- des libellés SANS QUE RIEN NE L'ÉCRIVE, et donc de façon INCOHÉRENTE pour une
-- notation identique au fichier 04 : `use_cases.title` obligatoire mais
-- `findings.title` facultatif ; `alerts.type` obligatoire mais rien pour
-- `report_sections`. Un constat pouvait naître SANS TITRE, un cas d'usage non.
-- Le fichier 04 (ligne 10, ses conventions) ne dit rien de la nullabilité : la
-- règle était réelle mais non écrite, et le diff gravait le déséquilibre comme
-- s'il était la spécification.
--
-- Arbitrage A01 : on l'ÉCRIT et on l'applique UNIFORMÉMENT — l'effacer là où elle
-- se voit laisserait l'incohérence intacte, puisque `blocks.label_fr` resterait
-- obligatoire par T8.
--
-- T13 (écrite en tête de 0001) : « la colonne qui porte le LIBELLÉ HUMAIN
-- IDENTIFIANT l'entité — celle qu'un opérateur lit pour savoir de quelle ligne il
-- s'agit — est NOT NULL. Une entité sans identité lisible n'est pas exploitable :
-- elle apparaît vide dans toute liste, tout rapport et tout export. »
-- UNE SEULE colonne par table : l'identité, jamais ses attributs descriptifs.
--
-- Les 43 tables ont été passées en revue une par une :
--   · 18 portaient DÉJÀ leur identité en NOT NULL (users.name, companies.name,
--     missions.title, org_units.name, blocks.label_fr, questions.text_fr,
--     use_cases.title, alerts.type, activity_log.action, document_requests.label,
--     tools_inventory.name, ai_systems.name, report_templates.name,
--     step_validations.step_code, et les label_fr/label des référentiels) ;
--   ·  5 y entrent par cette migration (ci-dessous) ;
--   · 20 n'ont PAS d'identité lisible et n'en reçoivent donc aucune.
--   → 18 + 5 = 23 tables avec identité, + 20 sans = 43. La liste nominative et
--     le motif de CHAQUE table vivent dans `schema-manifest.json`, section
--     `identiteLisibleT13`, qui refuse d'être écrite si une identité déclarée
--     n'est pas NOT NULL.
-- (Ces comptes annonçaient « 24 » et « quatorze » à la rédaction : faux, relevé
--  par la 3e revue croisée — défaut D-2. C'est ce texte qui INSTITUE la
--  convention et que Williams relit à la porte ; il devait être juste.)
--
-- CE QUI RESTE NULLABLE, ET C'EST VOULU : `alerts.severity` et `alerts.message`,
-- `ai_systems.usage_description`, `blocks.description`, `use_cases.description`,
-- `estimation_params.description` — ce sont des DESCRIPTIONS, pas des identités.
-- `interviews.person_name` reste nullable parce que le §27.1 le prescrit
-- explicitement (champs personne optionnels si kind ≠ entretien) ;
-- `attachments.filename` parce que le 04 le marque NULL pour kind='note'.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `findings.sources` — retrait du DEFAULT (défaut M-3)
-- ─────────────────────────────────────────────────────────────────────────────
-- Le 04 §7 écrit, sur cette colonne même : « ≥ 1 source obligatoire ». Le défaut
-- `'{}'::jsonb` que j'avais posé faisait naître TOUT constat avec ZÉRO source —
-- l'inverse exact de la règle. Je l'avais justifié par T2 (« le tableau vide EST
-- une valeur signifiante »), vrai pour `questions.sectors` où le 04 écrit
-- « [] = universelle », FAUX ici où il écrit le contraire. C'est le raisonnement
-- qui a produit la migration 0011, appliqué à un cas qu'elle avait manqué.
-- La colonne reste NOT NULL : sans défaut, l'insertion devient explicite. NULL
-- serait d'ailleurs « zéro source » tout autant que '{}'.
-- =============================================================================

-- @UP

-- ── T13 : les cinq identités manquantes ──────────────────────────────────────

-- Le titre d'un constat : ce que lit le consultant dans la liste des findings et
-- ce qui est repris tel quel au chapitre 5 du rapport (§16.5).
ALTER TABLE findings ALTER COLUMN title SET NOT NULL;

-- Le libellé d'une action de la feuille de route (§20.3) : sans lui, une ligne de
-- planning n'a que des mois et un palier.
ALTER TABLE roadmap_items ALTER COLUMN description SET NOT NULL;

-- Le code de section identifie le chapitre du rapport que la ligne porte.
ALTER TABLE report_sections ALTER COLUMN section_code SET NOT NULL;

-- Le type d'événement est ce qu'on lit dans le journal d'intégration pour savoir
-- de quel échange il s'agit (§8.6).
ALTER TABLE integration_events ALTER COLUMN event_type SET NOT NULL;

-- V2.9, figeage COMPLET : le pull terrain lit CE snapshot, jamais la banque
-- vivante. C'est le texte affiché à l'auditeur hors ligne — l'identité de la
-- question figée dans la mission.
--
-- ⚠ SIGNALÉ AU LOT L3 (défaut D-3, 3e revue croisée) : le fichier 04 ne DEMANDE
--   pas ce NOT NULL. Il se déduit de T13 et du figeage V2.9, et il est défendable
--   — une question figée sans texte est vide sur l'iPad, hors ligne, sans recours.
--   Mais il CONTRAINT LE CHEMIN D'ÉCRITURE DU LOT L3 : si le figeage du
--   questionnaire s'y fait en DEUX TEMPS (créer les lignes, puis remplir les
--   snapshots), cette contrainte le refusera. Le figeage devra être atomique.
--   A01 le porte au brief du L3, avec `interviews.org_unit_id`.
ALTER TABLE mission_questions ALTER COLUMN text_snapshot SET NOT NULL;

COMMENT ON COLUMN findings.title IS
    'T13 — identité lisible du constat : NOT NULL (§16.5).';
COMMENT ON COLUMN mission_questions.text_snapshot IS
    'T13 — texte figé rendu hors ligne : identité de la question dans la mission (V2.9).';

-- ── M-3 : un constat ne naît plus avec zéro source ───────────────────────────
ALTER TABLE findings ALTER COLUMN sources DROP DEFAULT;

COMMENT ON COLUMN findings.sources IS
    '04 §7 / §27.2 : {answer_ids[], session_ids[], attachment_ids[]} — ≥ 1 source OBLIGATOIRE. '
    'Aucun DEFAULT : le constat sans source ne doit pas pouvoir naître par omission.';

-- @DOWN

ALTER TABLE findings ALTER COLUMN sources SET DEFAULT '{}'::jsonb;

ALTER TABLE mission_questions ALTER COLUMN text_snapshot DROP NOT NULL;
ALTER TABLE integration_events ALTER COLUMN event_type DROP NOT NULL;
ALTER TABLE report_sections ALTER COLUMN section_code DROP NOT NULL;
ALTER TABLE roadmap_items ALTER COLUMN description DROP NOT NULL;
ALTER TABLE findings ALTER COLUMN title DROP NOT NULL;

COMMENT ON COLUMN findings.title IS NULL;
COMMENT ON COLUMN mission_questions.text_snapshot IS NULL;
COMMENT ON COLUMN findings.sources IS NULL;
