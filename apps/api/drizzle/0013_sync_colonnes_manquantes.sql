-- =============================================================================
-- 0013 — QUATRE MANQUES QUI RENDENT INEXÉCUTABLES QUATRE PROMESSES DU FICHIER 05
--
-- Amendement du fichier 04 tracé dans DECISIONS.md le 2026-08-31, ordonné par
-- Williams. Sceau du pack régénéré APRÈS la trace, jamais avant.
--
-- POURQUOI MAINTENANT, ET PAS AU LOT DE SYNCHRONISATION. Le motif est de coût, pas
-- de principe : ajoutées ici, ces colonnes coûtent une migration sur une base
-- VIDE ; découvertes au L6, elles coûteraient une migration sur des données de
-- collecte réelles. Et L6 se développe SEUL (09 §5.3) — il n'aurait personne pour
-- arbitrer ce que le pack ne dit pas.
--
-- CE QUI SE DÉDUIT DU PACK ET CE QUI SE DÉCIDE — la distinction est écrite table
-- par table ci-dessous, parce que les fondre ferait passer une décision pour une
-- lecture.
-- =============================================================================

-- @UP

-- ─────────────────────────────────────────────────────────────────────────────
-- S-1 (SE DÉDUIT) — `attachments.updated_at` : le curseur de pull s'appuie dessus
-- ─────────────────────────────────────────────────────────────────────────────
-- 05 §9.5, mot pour mot : « Curseur par mission (`updated_at` SERVEUR max reçu) ».
-- La table s'arrêtait à `created_at`. LE FICHIER 04 SE CONTREDISAIT DEUX FOIS :
-- son en-tête pose « created_at/updated_at TIMESTAMPTZ PARTOUT », et sa propre
-- ligne déclare la pièce jointe modifiable (« le rattachement d'une note volante
-- est complétable après coup = ligne modifiable → LWW §9.4 »).
-- CONSÉQUENCE, qui n'est pas cosmétique : UNE PIÈCE JOINTE MODIFIÉE N'AURAIT
-- JAMAIS ÉTÉ REDESCENDUE AU TERRAIN. Le rattachement d'une note volante, fait au
-- siège, ne serait jamais parvenu à l'appareil qui l'a créée.
ALTER TABLE attachments
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- S-3 (SE DÉCIDE) — `attachments.created_by` : le propriétaire d'une note volante
-- ─────────────────────────────────────────────────────────────────────────────
-- 05 §9.9 fonde la propriété sur UNE seule colonne : `interviews.conducted_by`.
-- Pour une pièce jointe RATTACHÉE, une jointure y mène. Pour une NOTE VOLANTE —
-- `interview_id` ET `answer_id` à NULL, cas que le pack crée et rend durable
-- (§24.1 P1-5) — la chaîne est ROMPUE, et cette table ne portait AUCUNE colonne
-- d'auteur. `mission_id` ne pouvait pas en tenir lieu : §9.9 dit que les autres
-- membres de la mission « consultent en LECTURE ».
--
-- ⚠️ LE PACK NE DIT NULLE PART DE QUI EST UNE NOTE VOLANTE. La règle ci-dessous
-- est une DÉCISION (A01, DECISIONS.md 2026-08-31), pas une lecture :
--     propriétaire = le rattachement quand il existe, SINON `created_by`.
--
-- NOT NULL ASSUMÉ : une pièce jointe sans auteur serait exactement le trou qu'on
-- vient de fermer. Sur une base portant déjà des lignes, cette migration
-- ÉCHOUERA — et c'est le bon comportement : mieux vaut un refus bruyant qu'un
-- lot de pièces jointes sans propriétaire résoluble.
ALTER TABLE attachments
  ADD COLUMN created_by UUID;

UPDATE attachments SET created_by = (
  SELECT i.conducted_by FROM interviews i WHERE i.id = attachments.interview_id
) WHERE interview_id IS NOT NULL;

UPDATE attachments SET created_by = (
  SELECT i.conducted_by FROM answers a JOIN interviews i ON i.id = a.interview_id
  WHERE a.id = attachments.answer_id
) WHERE created_by IS NULL AND answer_id IS NOT NULL;

ALTER TABLE attachments
  ALTER COLUMN created_by SET NOT NULL,
  ADD CONSTRAINT attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id);

CREATE INDEX idx_attachments_created_by ON attachments (created_by);
CREATE INDEX idx_attachments_updated_at ON attachments (updated_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- S-4 (SE DÉDUIT) — l'archive couvre les TROIS entités, pas une seule
-- ─────────────────────────────────────────────────────────────────────────────
-- 05 §9.4 étend le dernier-écrit-gagne aux TROIS entités synchronisées (answers,
-- interviews, attachments) et ne nommait QU'UNE archive, dont la clé étrangère
-- vers `answers` était OBLIGATOIRE. Sur le scénario « même entretien sur deux
-- appareils » — UN CRITÈRE D'ACCEPTATION @critique — la valeur perdante d'un
-- entretien ou d'une pièce jointe disparaissait SANS TRACE.
-- C'est l'invariant 7 : rien n'est jamais silencieusement écrasé.
--
-- LA TABLE N'EST PAS RENOMMÉE, et le motif n'est pas le confort : LE PACK LA
-- NOMME TROIS FOIS (§9.3, §9.4, §9.9). La renommer mettrait le code en
-- contradiction avec trois sections que Williams n'a pas amendées — un amendement
-- plus large que celui demandé. Le nom reste donc plus étroit que le contenu, et
-- ce commentaire est ce qui empêche un lecteur de s'y tromper.
ALTER TABLE answer_revisions
  ALTER COLUMN answer_id DROP NOT NULL;

-- Le DEFAULT n'est ici que le VÉHICULE d'un ADD COLUMN NOT NULL sur une table
-- éventuellement peuplée. Il est RETIRÉ juste après : convention T12, arbitrée
-- après la migration 0011 — « un défaut qui exprime un ÉTAT MÉTIER vient du 04,
-- ou n'existe pas ». Le garde schema-diff l'a refusé, et il avait raison : avec
-- `DEFAULT 'answer'`, une révision d'ENTRETIEN dont l'écriture aurait omis le
-- type serait devenue SILENCIEUSEMENT une révision de réponse — précisément le
-- genre d'héritage implicite que 0011 a supprimé partout ailleurs.
ALTER TABLE answer_revisions
  ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'answer',
  ADD COLUMN entity_id UUID;
ALTER TABLE answer_revisions
  ALTER COLUMN entity_type DROP DEFAULT;

-- Les lignes existantes sont toutes des révisions de réponses, par construction :
-- c'est la seule chose que la table pouvait accueillir jusqu'ici.
UPDATE answer_revisions SET entity_id = answer_id WHERE entity_id IS NULL;

ALTER TABLE answer_revisions
  ALTER COLUMN entity_id SET NOT NULL,
  ADD CONSTRAINT answer_revisions_entity_type_check
    CHECK (entity_type IN ('answer', 'interview', 'attachment')),
  -- COHÉRENCE : `answer_id` est renseigné SI ET SEULEMENT SI entity_type='answer'.
  -- Sans ce lien, une révision de réponse pourrait perdre sa clé étrangère et
  -- devenir introuvable par le chemin que le pack décrit — l'archive existerait
  -- sans être atteignable, ce qui ne vaut pas mieux que pas d'archive.
  ADD CONSTRAINT answer_revisions_answer_id_coherence_check
    CHECK ((entity_type = 'answer') = (answer_id IS NOT NULL));

CREATE INDEX idx_answer_revisions_entity ON answer_revisions (entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- S-6 (SE DÉCIDE) — l'état d'un envoi par morceaux
-- ─────────────────────────────────────────────────────────────────────────────
-- 05 §9.6 exige trois choses qu'aucune table ne portait : `GET …/status` rendant
-- « la liste des chunks reçus », une reprise qui « n'envoie QUE les manquants »,
-- et un 409 accompagné de « la liste des chunks à réémettre ». Le scénario §9.8
-- « reprise d'un envoi interrompu à 80 % » impose que cet état SURVIVE à une
-- interruption — donc qu'il soit persistant et non en mémoire.
--
-- ⚠️ LE PACK NE NOMME AUCUNE TABLE ET AUCUN CHAMP POUR CELA. La forme ci-dessous
-- est une DÉCISION (A01, DECISIONS.md 2026-08-31).
CREATE TABLE attachment_uploads (
  -- UN ENVOI PAR PIÈCE JOINTE : la clé primaire EST l'attachement. Deux envois
  -- concurrents du même id depuis deux appareils deviennent impossibles PAR
  -- CONSTRUCTION plutôt que par convention — le pack ne tranche pas ce cas, et
  -- une contrainte vaut mieux qu'un silence.
  attachment_id UUID PRIMARY KEY,
  mission_id UUID NOT NULL,
  -- §9.9 appliquée aux routes de chunks. Le pack ne dit PAS si la règle de
  -- propriété couvre les chunks binaires (NON SPÉCIFIÉ) ; en son absence, on
  -- retient la lecture qui protège — un envoi appartient à qui l'a commencé.
  created_by UUID NOT NULL,
  chunk_size_bytes INTEGER NOT NULL,
  -- NULL tant que le client n'a pas annoncé le total : le pack ne prévoit aucun
  -- moment où il le ferait avant le premier chunk.
  chunks_attendus INTEGER,
  -- UN TABLEAU D'INDEX, PAS UN COMPTEUR. « n morceaux reçus » ne permettrait PAS
  -- de répondre « lesquels manquent », qui est exactement ce que §9.6 demande.
  -- Un compteur aurait eu l'air de suffire, et aurait rendu la reprise impossible.
  chunks_recus JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- NULL pendant tout l'envoi : le pack ne le fait arriver qu'au `complete`. Le
  -- serveur ne peut donc RIEN vérifier avant la fin — propriété du protocole, pas
  -- manque de cette table.
  sha256_attendu TEXT,
  -- SANS DEFAUT, délibérément (convention T12) : le statut est un ÉTAT MÉTIER.
  -- Le code qui ouvre un envoi dit dans quel état il l'ouvre, ou l'écriture
  -- échoue. Un envoi qui hériterait de « en_cours » sans que personne ne l'ait
  -- voulu serait un envoi dont l'état ne veut rien dire.
  statut TEXT NOT NULL,
  -- Un envoi abandonné ne doit pas retenir d'octets indéfiniment. Le TTL lui-même
  -- est NON SPÉCIFIÉ par le pack : la colonne existe, la politique reste à écrire.
  expire_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attachment_uploads_attachment_id_fkey
    FOREIGN KEY (attachment_id) REFERENCES attachments (id),
  CONSTRAINT attachment_uploads_mission_id_fkey
    FOREIGN KEY (mission_id) REFERENCES missions (id),
  CONSTRAINT attachment_uploads_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT attachment_uploads_statut_check
    CHECK (statut IN ('en_cours', 'assemble', 'echec')),
  -- `chunks_recus` doit rester un TABLEAU : un objet ou un scalaire y passerait
  -- silencieusement et casserait la reprise au moment où on en a besoin.
  CONSTRAINT attachment_uploads_chunks_recus_check
    CHECK (jsonb_typeof(chunks_recus) = 'array')
);

CREATE INDEX idx_attachment_uploads_mission_id ON attachment_uploads (mission_id);
CREATE INDEX idx_attachment_uploads_created_by ON attachment_uploads (created_by);
CREATE INDEX idx_attachment_uploads_expire_le ON attachment_uploads (expire_le);

-- @DOWN

DROP TABLE IF EXISTS attachment_uploads;

DROP INDEX IF EXISTS idx_answer_revisions_entity;
ALTER TABLE answer_revisions
  DROP CONSTRAINT IF EXISTS answer_revisions_answer_id_coherence_check,
  DROP CONSTRAINT IF EXISTS answer_revisions_entity_type_check;
-- La descente REFUSE de perdre des révisions non-réponses en silence : si la
-- table en contient, remettre `answer_id` en NOT NULL échouera, et c'est
-- exactement ce qu'on veut. Une descente qui détruit des archives serait une
-- violation de l'invariant 7 commise par le mécanisme censé le servir.
ALTER TABLE answer_revisions
  DROP COLUMN IF EXISTS entity_id,
  DROP COLUMN IF EXISTS entity_type;
ALTER TABLE answer_revisions
  ALTER COLUMN answer_id SET NOT NULL;

DROP INDEX IF EXISTS idx_attachments_updated_at;
DROP INDEX IF EXISTS idx_attachments_created_by;
ALTER TABLE attachments
  DROP CONSTRAINT IF EXISTS attachments_created_by_fkey;
ALTER TABLE attachments
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_at;
