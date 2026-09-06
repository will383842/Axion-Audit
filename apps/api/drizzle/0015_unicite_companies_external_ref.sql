-- =============================================================================
-- 0015 — UNICITÉ DE `companies.external_ref`
--
-- Amendement du fichier 04 §7.1 tranché par Williams le 2026-09-03 (DECISIONS.md,
-- « `companies.external_ref` reçoit son unicité : l'escalade du 2026-08-31 est
-- tranchée », option 1). Sceau du pack régénéré APRÈS la trace, jamais avant.
--
-- SOURCE UNIQUE DU DDL : docs/04_MODELE_DE_DONNEES.md §7.1 — « (amendement du
-- 2026-09-03) index UNIQUE partiel `companies(external_ref) WHERE external_ref IS
-- NOT NULL` ». Cette migration en est une TRANSCRIPTION (11 §2). Conventions
-- T1-T15 : voir 0001_referentiels.sql. Aucune convention n'est amendée.
--
-- POURQUOI. `external_ref` n'est pas un champ libre : le 04 la décrit comme
-- « id client console axion-ia.com (NULL si local) » et 03 M8.1 en fait la clé du
-- RÉFÉRENTIEL CLIENT PARTAGÉ avec la console commerciale. Un doublon signifierait
-- qu'une même entreprise de la console correspond à deux fiches d'audit, et que
-- ni la liaison M8.1 ni le webhook `client.updated` du 05 §8.6 n'auraient de
-- cible déterminée — un défaut qui ne se manifesterait qu'au lot L13, loin de sa
-- cause. L'index est le SYMÉTRIQUE EXACT de `uq_companies_siren` posé par 0002 :
-- même forme (UNIQUE PARTIEL), même motif (une clé de liaison doit désigner une
-- ligne et une seule), et même raison de rester PARTIEL — le 04 marque la colonne
-- `NULL`, et plusieurs entreprises créées localement n'ont légitimement AUCUN
-- pendant dans la console. `NULL` répété reste donc accepté ; c'est tout le sens
-- du « partiel », et ce n'est pas un effet de bord.
--
-- INVARIANT 7 : SANS OBJET ICI, et c'est dit pour qu'on ne cherche pas une
-- garantie qui n'existe pas. Un index se pose et se retire SANS PERTE DE DONNÉE,
-- contrairement à une contrainte de colonne (cf. la descente de 0014, qui doit
-- refuser parce qu'elle n'a aucune valeur honnête à écrire). Ici la descente est
-- un simple DROP INDEX : aucune ligne n'est touchée, aucune valeur n'est
-- inventée, rien n'est écrasé.
-- =============================================================================

-- @UP

-- LE GARDE, AVANT L'INDEX. `CREATE UNIQUE INDEX` sur des données déjà en doublon
-- échoue avec un message PostgreSQL brut (« could not create unique index …, Key
-- (external_ref)=(…) is duplicated ») qui dit CE QUI a cassé, jamais POURQUOI ni
-- quoi faire. Une migration de ce dépôt s'explique : on compte d'abord, et si
-- l'on trouve, on s'arrête AVANT de créer l'index, avec un message qui nomme le
-- problème et le nombre de références concernées. La transaction de l'exécuteur
-- (migrations.mjs) est annulée en bloc et le schéma reste à 0014. Dédupliquer
-- deux fiches d'audit qui pointent la même entreprise de la console est un geste
-- MÉTIER, qui précède la montée et ne s'automatise pas ici.
DO $$
DECLARE
    refs_en_double BIGINT;
BEGIN
    SELECT count(*) INTO refs_en_double
    FROM (
        SELECT external_ref
        FROM companies
        WHERE external_ref IS NOT NULL
        GROUP BY external_ref
        HAVING count(*) > 1
    ) AS doublons;

    IF refs_en_double > 0 THEN
        RAISE EXCEPTION
            'montée de 0015 refusée : % référence(s) console (companies.external_ref) portée(s) par plusieurs fiches. '
            'external_ref est la clé de liaison M8.1 avec la console axion-ia.com : une référence en double n''a pas de cible déterminée. '
            'Réconcilier ces fiches (révision tracée, invariant 7) AVANT de poser l''unicité. '
            'Pour les lister : SELECT external_ref, count(*) FROM companies WHERE external_ref IS NOT NULL GROUP BY external_ref HAVING count(*) > 1;',
            refs_en_double
            USING ERRCODE = 'unique_violation';
    END IF;
END
$$;

-- Index du §7.1 porté par cette migration (amendement du 2026-09-03).
CREATE UNIQUE INDEX uq_companies_external_ref
    ON companies (external_ref)
    WHERE external_ref IS NOT NULL;

COMMENT ON COLUMN companies.external_ref IS
    'Id client de la console axion-ia.com (NULL si entreprise créée localement). '
    'UNIQUE quand renseigné (index partiel uq_companies_external_ref, amendement du 04 '
    'du 2026-09-03) : clé de liaison M8.1, elle doit désigner une fiche et une seule.';

-- @DOWN

-- Descente sans condition ni garde : retirer un index ne perd aucune donnée et
-- n'écrase rien (voir l'en-tête). Le commentaire de colonne revient à sa
-- rédaction de 0002, mot pour mot.
DROP INDEX IF EXISTS uq_companies_external_ref;

COMMENT ON COLUMN companies.external_ref IS
    'Id client de la console axion-ia.com (NULL si entreprise créée localement).';
