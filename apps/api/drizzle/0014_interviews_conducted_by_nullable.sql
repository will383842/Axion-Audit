-- =============================================================================
-- 0014 — `interviews.conducted_by` DEVIENT NULLABLE
--
-- Amendement du fichier 04 tranché par Williams le 2026-09-02 (DECISIONS.md,
-- « `interviews.conducted_by` devient NULLABLE — amendement du 04 tranché par
-- Williams »). Sceau du pack régénéré APRÈS la trace, jamais avant.
--
-- SOURCE UNIQUE DU DDL : docs/04_MODELE_DE_DONNEES.md, table `interviews` —
-- `conducted_by FK users NULL`. Cette migration en est une TRANSCRIPTION (11 §2).
-- Conventions T1-T15 : voir 0001_referentiels.sql. T8 s'applique telle quelle :
-- « NOT NULL sur les FK que le 04 ne marque pas NULL » — le 04 la marque
-- désormais NULL, la colonne suit. Aucune convention n'est amendée.
--
-- POURQUOI. Le plan d'entretiens §32.4 (fichier 03) produit des sessions
-- PLANIFIÉES pour lesquelles AUCUN auditeur n'est encore affecté : au cadrage,
-- l'équipe n'est pas constituée. `NOT NULL` — posé au lot L1 dans le silence du
-- 04, qui n'écrivait ni NULL ni NOT NULL — interdisait de les persister, et
-- reportait la route `/interview-plan/apply`.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, DÉLIBÉRÉMENT. La règle métier — une session
-- PLANIFIÉE (status 'non_demarre') peut n'avoir aucun auditeur, une session
-- CONDUITE (en_cours/termine) doit en avoir un — est confiée au SERVICE, et
-- testée là. La décision dit « contrainte posée dans le code » : aucune CHECK
-- `(status = 'non_demarre' OR conducted_by IS NOT NULL)` n'est posée ici. Le
-- schéma relâche, le service contraint.
--
-- Le compte sentinelle « à affecter » (option 2 de la décision) est écarté : une
-- donnée fausse en base est la famille de défauts que ce dépôt refuse.
--
-- FK et index INCHANGÉS : `interviews_conducted_by_fkey` accepte NULL par
-- construction (une FK ne contraint que les valeurs non nulles) et
-- `idx_interviews_conducted_by` du §7.1 reste tel quel.
-- =============================================================================

-- @UP

ALTER TABLE interviews ALTER COLUMN conducted_by DROP NOT NULL;

COMMENT ON COLUMN interviews.conducted_by IS
    'PROPRIÉTAIRE de la session (§9.9). NULL = session PLANIFIÉE sans auditeur affecté '
    '(amendement du 04 du 2026-09-02, §32.4) ; une session conduite en a un — règle '
    'portée par le service. Un propriétaire inconnu ne se lit jamais « tout le monde ».';

-- @DOWN

-- CE QUE LA DESCENTE FAIT DES LIGNES À `conducted_by NULL` : RIEN — elle REFUSE.
-- Il n'existe aucune valeur honnête pour « qui » : inventer un auditeur, ou
-- effacer les sessions planifiées, serait l'un ou l'autre des deux défauts que
-- la décision écarte (fausse donnée en base ; suppression silencieuse —
-- invariant 7). S'il reste une seule ligne sans auditeur, la descente s'arrête
-- ici, AVANT le `SET NOT NULL`, avec un message qui dit combien et quoi faire ;
-- la transaction de l'exécuteur (migrations.mjs) est annulée en bloc et le
-- schéma reste à 0014. Réaffecter ces sessions (ou les annuler explicitement
-- par une révision tracée) est un geste MÉTIER qui précède la descente.
DO $$
DECLARE
    sans_auditeur BIGINT;
BEGIN
    SELECT count(*) INTO sans_auditeur FROM interviews WHERE conducted_by IS NULL;
    IF sans_auditeur > 0 THEN
        RAISE EXCEPTION
            'descente de 0014 refusée : % session(s) d''entretien sans auditeur (conducted_by NULL). '
            'Aucune valeur n''est inventée et aucune ligne n''est supprimée (invariant 7) : '
            'affecter un auditeur à ces sessions AVANT de remettre NOT NULL.',
            sans_auditeur
            USING ERRCODE = 'not_null_violation';
    END IF;
END
$$;

ALTER TABLE interviews ALTER COLUMN conducted_by SET NOT NULL;

COMMENT ON COLUMN interviews.conducted_by IS NULL;
