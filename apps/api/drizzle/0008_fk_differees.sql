-- =============================================================================
-- 0008 — FK AVANT / CIRCULAIRES, posées EN FIN DE MIGRATION
--
-- Le fichier 04 (§7, en-tête des conventions) le dit lui-même, mot pour mot :
--   « FK avant/circulaires (`interviews.linked_review_answer_id → answers`,
--     `interviews.document_request_id → document_requests`) : créées par
--     ALTER TABLE en FIN de migration — une transcription table par table dans
--     l'ordre du fichier ne compile pas sans cela. »
--
-- POURQUOI ELLES SONT CIRCULAIRES :
--   interviews.linked_review_answer_id → answers.interview_id → interviews
--       (§25.6 : l'entretien complémentaire LÈVE un à-revoir posé sur une réponse,
--        laquelle appartient à une session.)
--   interviews.document_request_id → document_requests.attachment_id
--       → attachments.interview_id → interviews
--       (§27.1 : la session d'analyse documentaire répond à une demande de
--        document, laquelle est satisfaite par une pièce jointe, laquelle est
--        rattachée à une session.)
--
-- Aucune n'est DEFERRABLE : les deux colonnes sont NULLABLES, donc une ligne peut
-- toujours être créée d'abord et liée ensuite. Rendre les contraintes déferrables
-- affaiblirait la vérification sans rien débloquer.
-- =============================================================================

-- @UP

ALTER TABLE interviews
    ADD CONSTRAINT interviews_linked_review_answer_id_fkey
    FOREIGN KEY (linked_review_answer_id) REFERENCES answers (id);

ALTER TABLE interviews
    ADD CONSTRAINT interviews_document_request_id_fkey
    FOREIGN KEY (document_request_id) REFERENCES document_requests (id);

-- @DOWN

ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_document_request_id_fkey;
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_linked_review_answer_id_fkey;
