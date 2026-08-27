-- =============================================================================
-- 0010 — TRAÇABILITÉ : L'AUTEUR D'UNE TRACE N'EST JAMAIS INCONNU
--
-- Défaut M-4 relevé par la revue croisée (A17). Angle mort RÉEL du dispositif :
-- le 11 §7 place la nullabilité HORS du périmètre du diff schéma-vs-04, donc
-- aucun contrôle mécanique ne la vérifie — ni le comparateur, ni les tests.
-- Seule une relecture humaine pouvait l'attraper, et elle l'a attrapée.
--
-- CE QUI ÉTAIT FAUX. L'invariant 7 dit : « Toute correction de donnée = révision
-- TRACÉE ; rien n'est jamais silencieusement écrasé ou supprimé. » Une révision
-- dont l'auteur est NULL n'est pas tracée — c'est une modification anonyme avec
-- un horodatage. Sur un outil d'AUDIT, dont les livrables engagent la
-- responsabilité d'un consultant devant un client, c'est le contraire du but.
--
-- Et le fichier 04 ne marque AUCUNE de ces quatre colonnes `NULL`, alors qu'il
-- marque explicitement `NULL` partout où il l'entend (`org_unit_id FK NULL`,
-- `siren TEXT NULL`, `attachment_id FK NULL`…). Ma propre convention T8 — « NOT
-- NULL sur les FK que le 04 ne marque pas NULL » — aurait donc dû s'y appliquer.
-- Je ne l'avais pas fait : c'est une erreur d'application de ma propre règle, pas
-- une ambiguïté de la spec.
--
--   answer_revisions.changed_by   qui a modifié la réponse (§9.3, invariant 7)
--   step_validations.validated_by qui a validé l'étape (§32.2 — la validation
--                                 d'étape conditionne les transitions de mission)
--   step_validations.validated_at quand (une validation sans date ne peut pas
--                                 être opposée dans une chronologie d'audit)
--   findings.created_by           qui a émis le constat (§16.5 — un finding
--                                 `drapeau_rouge` auto-proposé exige une
--                                 VALIDATION HUMAINE : il faut savoir de qui)
--
-- SÛRETÉ DE LA MONTÉE : les quatre tables sont VIDES au lot L1 (aucun seed n'y
-- écrit, aucune route ne les alimente avant L3/L7). L'ALTER ne peut donc pas
-- échouer sur des lignes existantes. Sur une base déjà peuplée, il faudrait
-- d'abord traiter les lignes orphelines — ce n'est pas le cas ici, et la
-- migration est jouée sur base vierge en CI comme en staging.
--
-- `validated_at` reçoit en plus un DEFAULT now() : le 04 ne le prescrit pas, mais
-- une colonne d'horodatage NOT NULL sans défaut transforme chaque oubli d'INSERT
-- en erreur d'exécution au lieu d'une valeur juste. Les autres colonnes n'en
-- reçoivent PAS : il n'existe aucune valeur par défaut honnête pour « qui ».
-- =============================================================================

-- @UP

ALTER TABLE answer_revisions ALTER COLUMN changed_by SET NOT NULL;

ALTER TABLE step_validations ALTER COLUMN validated_by SET NOT NULL;
ALTER TABLE step_validations ALTER COLUMN validated_at SET DEFAULT now();
ALTER TABLE step_validations ALTER COLUMN validated_at SET NOT NULL;

ALTER TABLE findings ALTER COLUMN created_by SET NOT NULL;

COMMENT ON COLUMN answer_revisions.changed_by IS
    'Invariant 7 — NOT NULL : une révision sans auteur n''est pas une révision tracée.';
COMMENT ON COLUMN step_validations.validated_by IS
    '§32.2 — NOT NULL : la validation d''étape conditionne les transitions de mission.';
COMMENT ON COLUMN findings.created_by IS
    '§16.5 — NOT NULL : un drapeau rouge auto-proposé exige une validation humaine identifiable.';

-- @DOWN

ALTER TABLE findings ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE step_validations ALTER COLUMN validated_at DROP NOT NULL;
ALTER TABLE step_validations ALTER COLUMN validated_at DROP DEFAULT;
ALTER TABLE step_validations ALTER COLUMN validated_by DROP NOT NULL;

ALTER TABLE answer_revisions ALTER COLUMN changed_by DROP NOT NULL;

COMMENT ON COLUMN answer_revisions.changed_by IS NULL;
COMMENT ON COLUMN step_validations.validated_by IS NULL;
COMMENT ON COLUMN findings.created_by IS NULL;
