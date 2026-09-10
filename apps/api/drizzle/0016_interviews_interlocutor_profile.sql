-- =============================================================================
-- 0016 — `interviews.interlocutor_profile_id` : LE PROFIL DE L'INTERLOCUTEUR
--
-- Amendement du fichier 04 tranché par Williams le 2026-09-09, sur le dossier de
-- revue de spec `docs/portes/P-D_AMENDEMENT_04_interlocutor_profile.md` (rédigé
-- par A01, instruction d'origine A30). Sceau du pack régénéré APRÈS la trace,
-- jamais avant.
--
-- SOURCE UNIQUE DU DDL : docs/04_MODELE_DE_DONNEES.md, table `interviews` —
-- `interlocutor_profile_id FK interlocutor_profiles NULL`. Cette migration en est
-- une TRANSCRIPTION (11 §2). Conventions T1-T15 : voir 0001_referentiels.sql.
-- Aucune convention n'est amendée ; deux s'appliquent telles quelles :
--   · T4  — `*_id` → UUID ;
--   · T8  — « NOT NULL sur les FK que le 04 ne marque pas NULL » : le 04 la marque
--           NULL, la colonne est donc nullable, et ce n'est pas un silence.
--   · T10 — contrainte NOMMÉE (`interviews_interlocutor_profile_id_fkey`), parce
--           que le manifeste et le diff schéma-vs-04 comparent PAR NOM.
--   · T11 — aucune ON DELETE : la suppression est LOGIQUE (invariant 7).
--
-- POURQUOI. `interviews` ne portait AUCUN lien vers `interlocutor_profiles` :
-- `person_role` est du texte libre et `person_service_id` pointe `services`, le
-- référentiel des 11 FONCTIONS métier — pas celui des 9 PROFILS. `group_code`
-- ('direction'/'encadrement'/'terrain'), que le 03 §32.1 pose comme « base du
-- calcul de divergence direction/terrain », n'était atteignable depuis AUCUNE
-- réponse. Tombaient avec lui : la rubrique « divergences direction/terrain » du
-- 01 §20.3, la lecture par groupe du 03 §32.1-5, « l'or du rapport » de M5.1, et
-- le 4e des SIX contrôles du §36.6 — dont la conclusion est « un rapport qui ne
-- passe pas les 6 points ne part pas ».
--
-- LA DATE N'EST PAS UN CONFORT : la colonne est RÉTRO-INCOMPATIBLE AVEC LA DONNÉE
-- COLLECTÉE. Un entretien conduit avant elle n'est jamais reclassable — son profil
-- n'a été capté nulle part. La divergence se calculerait alors sur une population
-- partielle : un chiffre faux présenté comme vrai, ce qui est pire que son absence.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, DÉLIBÉRÉMENT.
--   · AUCUNE CHECK. La règle métier — une session `kind='entretien'` qui passe à
--     'termine' DOIT porter un profil ; ailleurs NULL est légitime — est confiée
--     au SERVICE et testée là. C'est EXACTEMENT la forme retenue pour
--     `conducted_by` le 2026-09-02 (migration 0014) : le schéma relâche, le
--     service contraint. Poser ici une CHECK `(kind <> 'entretien' OR status <>
--     'termine' OR interlocutor_profile_id IS NOT NULL)` rendrait de surcroît
--     INDESCENDABLE toute session déjà terminée avant cet amendement.
--   · AUCUN INDEX. Le §7.1 n'en demande pas ; l'accès se fait par `mission_id`
--     puis jointure, et `interlocutor_profiles` compte NEUF lignes — un index sur
--     une colonne à neuf valeurs distinctes ne servirait aucun plan, et le moteur
--     de sync (L6) est massivement en écriture, où chaque index se paie. La FK
--     reste NUE, comme `person_service_id` et pour le même motif ; elle est
--     inscrite au manifeste (`fkNonIndexees`), jamais laissée au silence. Si un
--     lot ultérieur ouvre ce chemin de lecture, l'index se posera alors, avec sa
--     ligne dans `indexEtablisParConvention`.
--   · AUCUNE SUPPRESSION, AUCUNE RÉÉCRITURE. `person_service_id` et `person_role`
--     sont CONSERVÉS : la fonction métier (P2-1) et le libellé saisi restent
--     utiles. Cette colonne AJOUTE l'axe manquant, elle n'en remplace aucun.
--   · AUCUN REMPLISSAGE RÉTROACTIF. Les sessions existantes restent à NULL : il
--     n'existe aucune valeur honnête à leur écrire (voir « rétro-incompatible »
--     ci-dessus), et inventer un profil serait la famille de défauts que ce dépôt
--     refuse — la même que le compte sentinelle écarté par 0014.
-- =============================================================================

-- @UP

ALTER TABLE interviews
    ADD COLUMN interlocutor_profile_id UUID NULL;

ALTER TABLE interviews
    ADD CONSTRAINT interviews_interlocutor_profile_id_fkey
    FOREIGN KEY (interlocutor_profile_id) REFERENCES interlocutor_profiles (id);

COMMENT ON COLUMN interviews.interlocutor_profile_id IS
    'PROFIL de l''interlocuteur (9 profils seedés, 11 §5) — l''axe qui porte '
    '`group_code` direction/encadrement/terrain (03 §32.1). DISTINCT de '
    'person_service_id, qui porte la FONCTION (11 fonctions). NULL légitime : '
    'session planifiée sans personne désignée, kind <> ''entretien'', atelier à '
    'participants multiples. La règle « entretien terminé ⇒ profil » est portée '
    'par le service, pas par une CHECK. Un NULL ne se lit JAMAIS « tous les groupes ».';

-- @DOWN

-- CE QUE LA DESCENTE FAIT, EXACTEMENT : elle retire la contrainte puis la colonne,
-- SANS CONDITION et SANS GARDE — et il faut dire pourquoi, pour qu'on ne cherche
-- pas ici une garantie qui n'existe pas.
--
-- La descente de 0014 doit REFUSER quand des lignes sont à NULL, parce qu'elle
-- devrait alors INVENTER une valeur (« qui a conduit ? ») pour remettre un
-- NOT NULL. Celle de 0015 est un simple DROP INDEX, qui ne touche aucune donnée.
-- Celle-ci est du troisième genre : elle SUPPRIME une colonne, donc elle DÉTRUIT
-- la donnée qu'elle contient — et l'invariant 7 (« rien n'est jamais
-- silencieusement écrasé ou supprimé ») mérite qu'on regarde le cas en face plutôt
-- que de l'invoquer.
--
-- Elle ne l'enfreint pas, pour deux raisons, et la seconde compte plus que la première :
--   1. Une descente de migration n'est pas un geste MÉTIER. L'invariant 7 régit la
--      correction d'une donnée par un utilisateur — jamais une révision tracée
--      dans `answer_revisions`, toujours. Redescendre 0016, c'est revenir à un
--      schéma où cette colonne N'EXISTE PAS : il n'y a pas d'état antérieur de la
--      donnée à préserver, il y a un état antérieur du SCHÉMA à restaurer.
--   2. Et surtout : cette descente est SYMÉTRIQUE. Elle rend le schéma exactement
--      à ce qu'il était à 0015 — la seule chose qui disparaisse est ce que la
--      montée a ajouté. Une descente qui laisserait une colonne derrière elle
--      serait le vrai défaut ; c'est pour cela qu'elle ne se contente pas de
--      DROP COLUMN mais retire aussi NOMMÉMENT la contrainte (T10), avant.
--
-- CE QU'ELLE COÛTE, ET QUI EST DIT ICI PLUTÔT QUE DÉCOUVERT : les profils déjà
-- saisis sont PERDUS, et la remontée ne les retrouvera pas — pour la raison même
-- qui a rendu cet amendement urgent. Redescendre 0016 sur une base qui a collecté
-- des entretiens n'est donc PAS une opération neutre : c'est le §4 du dossier
-- P-D appliqué à l'envers. En staging, où cette descente se joue, la question ne
-- se pose pas ; en production, elle exigerait un export préalable, qui est un
-- geste MÉTIER et précède la descente.
--
-- `DROP CONSTRAINT` explicite, sans IF EXISTS : si la contrainte a disparu entre
-- la montée et la descente, quelque chose d'autre a modifié le schéma, et cette
-- migration doit s'arrêter plutôt que de passer outre en silence.
ALTER TABLE interviews
    DROP CONSTRAINT interviews_interlocutor_profile_id_fkey;

ALTER TABLE interviews
    DROP COLUMN interlocutor_profile_id;
