-- =============================================================================
-- 0011 — RETRAIT DES DÉFAUTS QUE LE FICHIER 04 NE PRESCRIT PAS
--
-- Arbitrage A01, lot L1. J'avais posé 11 DEFAULT que le §7 n'écrit nulle part,
-- en les jugeant « évidents ». La ligne tracée par A01 : **un défaut qui exprime
-- un ÉTAT MÉTIER vient du 04, ou n'existe pas ; un défaut purement TECHNIQUE
-- peut venir d'une convention, à condition qu'elle soit ÉCRITE.**
--
-- Le risque n'était pas dans les valeurs, qui étaient raisonnables. Il était dans
-- le MÉCANISME : le 11 §7 dit que le manifeste est « EXTRAIT du fichier 04 ».
-- Une valeur absente du 04 mais inscrite au manifeste devient une valeur que le
-- diff PROTÈGE au lieu de signaler — le manifeste cesse d'être une extraction
-- pour devenir l'endroit où l'on régularise ses propres ajouts. Onze aujourd'hui,
-- et la même porte s'ouvre à chaque lot.
--
-- Et le fichier 04 ne s'est pas tu par distraction : il SAIT écrire
-- `DEFAULT 'a_planifier'`, `DEFAULT 'entretien'`, `DEFAULT 'non_demarre'`.
-- Là où il n'écrit rien, le choix reste à faire — par le lot qui implémentera la
-- machine à états concernée, en connaissance de cause.
--
-- CE QUI EST RETIRÉ (10) :
--   · cinq ÉTATS INITIAUX de machines à états dont les transitions appartiennent
--     aux lots L5→L11 : `alerts.status`, `document_requests.status`,
--     `report_sections.status`, `scoping_estimates.status`,
--     `integration_events.status` ;
--   · `questions.version` — le versionnement de la banque est une règle métier
--     (§32, §36.4) que le lot L4 implémentera ;
--   · `blocks.is_default`, `sectors.is_active`, `users.is_active`,
--     `report_templates.is_active` — « créé actif » est une décision
--     fonctionnelle, pas une évidence technique.
--
-- LES COLONNES RESTENT `NOT NULL`. C'est le but : sans défaut, l'insertion
-- devient EXPLICITE. Une ligne qui omet son état échoue à l'écriture au lieu
-- d'hériter en silence d'un choix que personne n'a fait.
--
-- CE QUI EST CONSERVÉ (1) : `integration_events.attempts = 0`. Un compteur de
-- tentatives qui démarre à zéro n'exprime aucun choix fonctionnel — c'est de
-- l'arithmétique. Il est désormais couvert par la convention T12, écrite en tête
-- de 0001 : une convention écrite est vérifiable et opposable, un cas particulier
-- ne l'est pas.
--
-- COÛT DU RETRAIT MAINTENANT : une ligne de seed (aucune, en fait — toutes les
-- insertions du seed passaient déjà ces colonnes explicitement). Coût au lot L7,
-- quand du code s'y appuierait : bien davantage.
-- =============================================================================

-- @UP

ALTER TABLE alerts              ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE document_requests   ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE report_sections     ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE scoping_estimates   ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE integration_events  ALTER COLUMN status     DROP DEFAULT;

ALTER TABLE questions           ALTER COLUMN version    DROP DEFAULT;

ALTER TABLE blocks              ALTER COLUMN is_default DROP DEFAULT;
ALTER TABLE sectors             ALTER COLUMN is_active  DROP DEFAULT;
ALTER TABLE users               ALTER COLUMN is_active  DROP DEFAULT;
ALTER TABLE report_templates    ALTER COLUMN is_active  DROP DEFAULT;

-- @DOWN

ALTER TABLE report_templates    ALTER COLUMN is_active  SET DEFAULT true;
ALTER TABLE users               ALTER COLUMN is_active  SET DEFAULT true;
ALTER TABLE sectors             ALTER COLUMN is_active  SET DEFAULT true;
ALTER TABLE blocks              ALTER COLUMN is_default SET DEFAULT true;

ALTER TABLE questions           ALTER COLUMN version    SET DEFAULT 1;

ALTER TABLE integration_events  ALTER COLUMN status     SET DEFAULT 'pending';
ALTER TABLE scoping_estimates   ALTER COLUMN status     SET DEFAULT 'brouillon';
ALTER TABLE report_sections     ALTER COLUMN status     SET DEFAULT 'brut';
ALTER TABLE document_requests   ALTER COLUMN status     SET DEFAULT 'demande';
ALTER TABLE alerts              ALTER COLUMN status     SET DEFAULT 'active';
