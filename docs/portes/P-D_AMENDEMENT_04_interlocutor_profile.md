# Proposition d'amendement du fichier 04 — `interviews.interlocutor_profile_id`

**Dossier de revue de spec P-D · soumis à Williams · rédigé par A01 le 2026-09-09**
**À trancher AVANT l'ouverture de L6** (motif au §4). Escalade `CLAUDE.md` §3-2 : modifier le
fichier 04 n'appartient pas à l'autopilote. Ce document ne modifie rien ; il propose.
Instruction d'origine : A30, état des lieux L7 du 2026-09-09. Vérifié ligne à ligne par A01.

---

## 1. Le fait, en une phrase

`interviews` ne porte **aucun lien** vers `interlocutor_profiles` : le 04 (l. 114-145) donne
`person_role` en **texte libre** et `person_service_id` → `services`, qui est le référentiel des
**11 fonctions métier**, pas celui des **9 profils**. Sans ce lien, `group_code`
(`direction` / `encadrement` / `terrain`) n'est **jamais atteignable depuis une réponse**.

Confirmé sur pièces : `docs/04_MODELE_DE_DONNEES.md` l. 27-28 et l. 114-145 ·
`apps/api/src/db/schema.ts` l. 544-550 · `apps/api/drizzle/0004_collecte.sql` (table `interviews`).

## 2. Ce que la colonne absente fait tomber — cinq points, pas quatre

| # | Section | Ce qui tombe | État |
|---|---|---|---|
| 1 | 01 §20.3 rubrique 4 | « divergences direction/terrain », rubrique du rapport livrable | à venir (L10) |
| 2 | 03 §32.1-5 (l. 645) | « la lecture direction vs terrain compare les moyennes par `interlocutor_profiles.group_code` » | à venir (L8) |
| 3 | 03 M5.1 (l. 82) | « notamment **direction vs terrain** (l'or du rapport, décision prise) » | à venir (L7/L8) |
| 4 | 03 §36.6-4 (l. 847) | l'un des **six** contrôles ; le §36.6 conclut : « **Un rapport qui ne passe pas les 6 points ne part pas.** » | à venir (L10) |
| 5 | 03 §32.4 / §17.3 / §18.1.2 | le plan d'entretiens, spécifié « par unité **et par profil** », est **déjà livré dégradé** : il LISTE les profils sans les chiffrer | **déjà payé** |

Le point 5 n'était pas dans la remontée d'A30. Il est le plus instructif : la même colonne a **déjà**
coûté une fonctionnalité, en L3d, et le code en porte la cicatrice en clair —
`apps/api/src/domaines/plan-entretiens/depot.ts` l. 126-129 : « `interviews.interlocutor_profile_id`
n'existe pas au 04, et chiffrer par profil inventerait une donnée qu'aucune table ne pourrait
recevoir ». Ce n'est donc pas un risque théorique : c'est un précédent mesuré.

## 3. Pourquoi il n'existe aucun contournement

- **Déduire des 11 fonctions** (`person_service_id`) : deux référentiels distincts, seedés
  séparément (11 §5) — « présenter l'un sous le nom de l'autre serait un mensonge d'étiquette »
  (`DECISIONS.md`, 2026-09-05). Et surtout : le **03 §32.6-4 (l. 676) l'interdit textuellement** —
  la divergence est « portée par `interlocutor_profiles.group_code` (référentiel, seedé) — **pas de
  liste de profils codée en dur** ». Le contournement n'est pas laid, il est **hors spec**.
- **Déduire de `person_role`** : texte libre saisi à la main. Rien à agréger.
- **Le déduire plus tard** : impossible, voir §4.

## 4. Le fait qui commande la date : la colonne est rétro-incompatible avec la donnée collectée

Un entretien conduit **avant** l'existence de la colonne n'est **jamais reclassable** : son profil
n'a été capté nulle part, et `person_role` est du texte libre. Toute session déjà collectée reste
définitivement hors de la divergence — laquelle se calculerait alors sur une population partielle,
ce qui est **pire qu'une divergence absente** : un écart direction/terrain mesuré sur la moitié des
entretiens est un chiffre faux présenté comme vrai, au client, dans le livrable.

L'échéance réelle n'est donc **pas P-D** : c'est le **premier entretien réel** de la mission pilote.
S'y ajoute la fenêtre technique : le §9.3 upsert la **ligne** `interviews` (« upsert par `entity_id`,
UUID client = clé »), donc le champ voyage dans le contrat d'op de L6. Vérifié : **aucun code de sync
n'existe encore** (pas de `apps/api/src/domaines/sync`) ; la note `docs/conception/LOT_L6.md` décrit
le contrat, le code ne l'a pas figé. La fenêtre est ouverte, et elle se referme à l'ouverture de L6.

## 5. La proposition, précise

**Table** : `interviews`.
**Colonne** : `interlocutor_profile_id UUID NULL REFERENCES interlocutor_profiles(id)`.
**Nullable — oui, et c'est un choix, pas une facilité** : trois raisons cumulatives.

1. Les sessions **planifiées** par le §32.4 naissent sans personne identifiée (même motif qui a rendu
   `conducted_by` nullable le 2026-09-02).
2. Les `kind` ≠ `entretien` (observation, analyse documentaire, relevé) n'ont pas d'interlocuteur —
   le 04 note déjà « champs personne optionnels si kind ≠ entretien » (§27.1).
3. L'atelier (§28.1) a des `participants` JSONB, pas un profil unique.

**Règle métier portée par le SERVICE, pas par un CHECK** — exactement la forme retenue pour
`conducted_by` : une session `kind='entretien'` passant en `termine` **doit** porter un profil ;
ailleurs, NULL est légitime. Un `NULL` ne se lit jamais « tous les groupes » côté scoring.
**Index** : aucun. Le 04 §7.1 n'en demande pas ; l'accès se fait par `mission_id` puis jointure.
**`person_service_id` et `person_role` sont CONSERVÉS** : la fonction métier (P2-1) et le libellé
saisi restent utiles ; la colonne proposée ne remplace rien, elle ajoute l'axe manquant.

**Remplie par qui, quand** : par l'**auditeur terrain**, à la création ou à l'édition de la session
(L5), via un sélecteur sur les 9 profils seedés — jamais une liste en dur, jamais une saisie libre.
Aujourd'hui `apps/field/src/agenda/sessions.ts` l. 160 écrit `personServiceId: null` en dur : le
terrain ne capte ni fonction ni profil. C'est donc un ajout d'UI, pas une modification.

**Transportée comment** : un champ **optionnel de plus** dans la charge utile de l'op `interview`
du §9.3 — pas une opération nouvelle, pas un type d'entité nouveau, pas de changement du contrat
`applied/duplicate/superseded/forbidden/error`. La propriété §9.9 est inchangée (elle se résout par
`interviews.conducted_by`, que cet ajout ne touche pas).

**Conséquence d'export, déjà tranchée et rappelée ici pour que l'approbation soit complète** :
`reponses.csv` porte une colonne `groupe_interlocuteur`. Ce n'est **pas** une décision séparée — le
précédent L7c du 2026-09-05 a déjà fixé la forme pour ce fichier : le §36.6-2 veut « tout chiffre du
rapport retrouvable dans `reponses.csv` », donc la clé se porte **dans** le fichier, jamais au bout
d'une jointure que le rédacteur devrait inventer. (`sessions.csv` porte déjà « fonction de la
personne » ; le groupe est un axe distinct.) Si l'amendement est refusé, il n'y a rien à porter.

## 6. Le coût des trois moments

| Moment | Coût | Détail |
|---|---|---|
| **Maintenant** (avant ouverture de L6) | **~0,4 à 0,5 j**, sans reprise | Migration + amendement 04 : ~0,1 j (A12) · sélecteur terrain + bump du schéma Dexie local : ~0,2 j (A22/A24) — le bump est de toute façon prévu pour L6 · champ optionnel dans le schéma Zod de l'op, écrit en même temps que le contrat : **~0,05 j** · colonne `reponses.csv` : ~0,05 j (`fichiers.ts`) |
| **Pendant L6** | **~1 à 1,5 j**, sur le chemin critique | Le contrat d'op est écrit et testé : rouvrir la charge utile rejoue et fait re-réviser les **8 scénarios §9.8** (`@critique`, non skippables), les tests d'idempotence et de rejeu 3×. L6 se développe **SEUL** (09 §5.3) : ce coût **décale L6**, donc P-D. Risque du budget de 3 tentatives (09 §5.5) sur le lot le plus critique du chantier. |
| **Après P-D** | **~1 j technique + une reprise manuelle**, et un trou permanent | Migration sur un staging chargé · migration Dexie locale sur des iPad détenant des données non synchronisées (§31-1 : « une mise à jour n'invalide jamais des données non synchronisées ») · **et les entretiens déjà conduits restent sans profil, définitivement** (§4). |

## 7. Ce qu'on perd si on ne le fait pas du tout

Un audit livré **sans confrontation direction/terrain**. Concrètement :

- le §36.6 perd un de ses six points — or il ne dit pas « idéalement », il dit « **ne part pas** » ;
  soit le rapport ne part pas, soit la checklist devient décorative, et alors elle ne protège plus
  les cinq autres points non plus ;
- le §20.3 perd une rubrique et M5.1 perd ce qu'il appelle lui-même « **l'or du rapport** » ;
- **L8 est le vrai piège** : le moteur est **déjà écrit et déjà vert**.
  `apps/api/src/scoring/moteur.ts` l. 428-440 calcule les moyennes par groupe, et `moteur.test.ts`
  l. 505 l'atteste — « la lecture direction / terrain compare les moyennes par `group_code`, jamais
  par une liste codée ». Mais `entree.ts` l. 94 déclare `groupeInterlocuteur?:
  GroupeInterlocuteurPlan | null` et **aucun constructeur de production de `EntreeScoring`
  n'existe** (vérifié : les seuls remplisseurs sont `apps/api/tests/aide/scoring-jeux-de-reference.ts`).
  Le danger n'est donc pas que L8 échoue : c'est que **L8 reste vert sur des jeux d'essai qui ne
  peuvent pas se produire en production**, et que personne ne s'en aperçoive avant le premier
  rapport réel.

## 8. La décision demandée

**APPROUVÉ** — l'amendement §5 entre au 04 ; A12 le transcrit ; L5 gagne le sélecteur ; L6 l'intègre
à son contrat dès l'ouverture ; `reponses.csv` gagne sa colonne. Coût ~0,5 j réparti.

**REFUSÉ** — le renvoi du 2026-09-05 reste valable, la fenêtre L6 se referme, et le §7 est assumé
par écrit à la porte P-D. Aucune approximation par `services` ne sera livrée en substitution.

**REPORTÉ à P-D** — recevable, à condition d'acter que la mission pilote ne collecte aucun entretien
avant la porte : sinon le §4 s'applique et la donnée est perdue pour les sessions déjà conduites.

Signature Williams : ____________________  Date : __________  Verdict : ____________
