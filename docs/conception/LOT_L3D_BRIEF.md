# LOT L3 — INCRÉMENT L3d : BRIEF D'IMPLÉMENTATION

> **Ce document ne remplace pas `docs/conception/LOT_L3.md`** (note de conception du lot, étape 1bis,
> déjà rédigée) : il en exécute le §1 (ligne L3d) et termine son §5 (« ce qui doit être tranché avant
> L3d »). Rédigé en LECTURE SEULE, avant toute ligne de code.
> **Lecture faite** : 11 (intégral) · 07 ligne L3 · `LOT_L3.md` intégral · 03 M2, §16.2-16.3,
> §17.2-17.3, §18.1-18.3, §25.3, §32.2, §32.4, §33.4, §34.1, §34.3-34.4, §35.2 · 01 §20.1, §21.1 ·
> 04 (`missions`, `org_units`, `questions`, `mission_questions`, `interviews`, `work_assignments`,
> `step_validations`) · 05 §8, §9.9, §24.2 · `DECISIONS.md` (entrées L3 des 2026-08-29 et 2026-08-31) ·
> le code livré (`http/pagination.ts`, `http/zod.ts`, `auth/politique.ts`, `domaines/companies/*`,
> `packages/shared/src/{missions,companies,banque-questions,errors}.ts`, `apps/api/scripts/seed.mjs`).

## 1. Périmètre de L3d

Recopié du 07 (ligne L3, seule source du brief) — la part qui revient à L3d :
**« moteur questionnaire M2 (palier × secteur × unités in_scope × niveau × interlocuteur, snapshot
texte+options+barème) · plan d'entretiens (règles d'échantillonnage §32.4) · prévisualisation du
questionnaire avant figeage (§33.4) · route `reassign` §34.4 »**, plus `/v1/missions/:id/assignments`
(05 §24.2, rattaché ici parce qu'il partage la garde d'habilitation avec `reassign`).
Critères d'acceptation concernés : n° 2 « questionnaire figé conforme » · n° 4 « plan d'entretiens
généré conforme aux n minimaux §32.4 ».

**EXCLU, explicitement** : `resync-questionnaire` (05 §8.3, non listé au 07 — part avec L9) ·
`dashboard` · `decline-by-country` (L14) · **`POST …/interview-plan/apply`** (reportée en fiche
d'étage 2, `DECISIONS.md` 2026-08-29 : aucune table du 04 ne l'accueille) · toute **persistance** du
plan d'entretiens (le 07 dit « généré », pas « persisté ») · l'écran de prévisualisation lui-même
(`apps/hq` est L7-min) · les questions ad hoc (L5/L6) · le scoring (L8).

**Dépendance dure** : `apps/api/src/domaines/missions/*` **n'existe pas encore** — L3b n'a livré que
`packages/shared/src/missions.ts` (la table `TRANSITIONS_MISSION` et `evaluerTransitionMission`).
Toute route L3d en `/missions/:id` a besoin du dépôt de missions (lecture + cadrage RBAC).
**Les routes de L3d ne démarrent pas avant ce dépôt** ; les deux fonctions pures, si.

## 2. Découpage en tâches, fichiers en propre, parallélisme

| #      | Tâche                                                                                                     | Fichiers **écrits** (en propre)                                                                                                                                                                    | Dépend de              |
| ------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **T1** | Contrats partagés : schémas Zod in/out des 6 routes, types du plan, code `QUESTIONNAIRE_ALREADY_FROZEN`     | `packages/shared/src/questionnaire.ts` (neuf) · `…/plan-entretiens.ts` (neuf) · `…/assignments.ts` (neuf) · **retouche** `errors.ts` + `index.ts`                                                    | —                      |
| **T2** | Assembleur M2, **fonction pure** (sélection, tri, projection par profil)                                    | `apps/api/src/domaines/questionnaire/assembleur.ts`                                                                                                                                                  | T1 (types)             |
| **T3** | Dépôt + service questionnaire : lecture banque, prévisualisation, figeage transactionnel, `compterQuestionsFigees` | `apps/api/src/domaines/questionnaire/{depot,service}.ts`                                                                                                                                             | T2 (signature)         |
| **T4** | Générateur de plan §32.4, **fonction pure** + dépôt de lecture de l'arbre                                   | `apps/api/src/domaines/plan-entretiens/{generateur,depot}.ts`                                                                                                                                         | T1                     |
| **T5** | `work_assignments` + `reassign` : dépôt, service (garde lead + habilitation), routes                        | `apps/api/src/domaines/assignments/{depot,service}.ts` · `apps/api/src/routes/assignments.ts` · `apps/api/src/routes/interviews.ts`                                                                   | T1, dépôt missions L3b |
| **T6** | Routes questionnaire + plan                                                                                 | `apps/api/src/routes/questionnaire.ts`                                                                                                                                                               | T3, T4                 |
| **T7** | **Tests — A16/A17, jamais l'auteur du code (09 §5.6)**                                                       | `packages/shared/src/{questionnaire,plan-entretiens}.test.ts` · `apps/api/src/domaines/questionnaire/assembleur.test.ts` · `apps/api/tests/l3d-questionnaire.integration.test.ts` · `…/l3d-assignments.integration.test.ts` | écrits **avant** T2-T4 |

**Parallélisable** : T2 ‖ T4 ‖ T5 — aucun fichier commun. T7 s'écrit en parallèle de tout, dans ses
propres fichiers (TDD, 09 §3-2).
**Séquentiel** : T1 d'abord — c'est le seul point d'écriture partagé (`errors.ts`, `index.ts`), et deux
agents qui l'éditent ensemble produisent un conflit certain. Puis T3 après T2, T6 après T3 + T4.
**Collision unique et connue : `apps/api/src/app.ts`** (import + `register`, deux lignes par plugin).
**Un seul agent l'édite, en dernier**, quand T5 et T6 sont livrés ; les autres n'y touchent pas.
**Second point de contact** : le service de missions de L3b doit appeler `compterQuestionsFigees` (T3)
pour la condition `questionnaire_fige`. La fonction appartient à L3d ; L3b la consomme. Si L3b
atterrit d'abord avec un comptage local, T3 le remplace — une ligne, à annoncer, pas à découvrir.

## 3. L'assembleur M2 (T2) — l'algorithme

**Entrées, aucune devinée** : `missions.{size_tier_id → size_tiers.headcount_min/max, active_sectors[],
active_blocks[], audit_level, geo_scope}` · les `org_units` de la mission avec `in_scope = true` **et**
`status = 'active'`, jointes à `services.code` par `service_ref_id` · la banque `questions`.
**`active_blocks` et `active_sectors` portent des CODES**, pas des UUID — mesuré dans
`apps/api/scripts/seed.mjs` (`blocs.map(b => b.code)`, `'["services"]'`) — et les colonnes JSONB de
`questions` (`sectors`, `target_services`, `levels`, `profiles`) portent elles aussi des codes
(`COLONNES_IMPORT_BANQUE`, §36.4). La comparaison est donc code ↔ code, sans table de jointure.

**Ordre des filtres** — du plus discriminant au plus coûteux, tous en SQL, une seule requête :

1. `questions.status = 'active'` **et** `origin = 'banque'` : jamais un brouillon, jamais une version
   archivée, jamais une ad hoc (les ad hoc entrent par la sync, L6).
2. **Bloc actif** : `blocks.code ∈ missions.active_blocks`.
3. **Palier** : recouvrement d'intervalles entre `[size_tiers.headcount_min, headcount_max]` et
   `[questions.headcount_min, questions.headcount_max]`, `NULL` = borne ouverte (§8-3).
4. **Secteur** : `sectors = []` (universelle) **OU** intersection non vide avec `active_sectors`.
5. **Niveau d'audit** (01 §20.1) : `levels = []` **OU** `missions.audit_level ∈ levels`.
6. **Géo** : `geo = 'tous'` **OU** `geo = missions.geo_scope`.
7. **Services de l'arbre** (§16.3) : `target_services = []` (transverse) **OU** intersection non vide
   avec l'ensemble des `services.code` portés par les unités in_scope. C'est ici, et nulle part
   ailleurs, que « les paquets logistique ne sont générés que si l'arbre contient une unité logistique ».
8. **Interlocuteur : ce n'est PAS un filtre, c'est une PROJECTION.** M2 §3 : le questionnaire est
   *projeté* en parcours par profil ; l'ensemble figé est l'**union** des parcours. `questions.profiles`
   n'est d'ailleurs pas capturé (c'est du routage, note L3 §3.a) et sert à la lecture terrain. La
   prévisualisation affiche la répartition bloc × interlocuteur calculée depuis `profiles` (`[]` = tous).

**Tri** : `blocks.position`, puis, dans le bloc, `questions.code NULLS LAST, questions.id` — le 04 ne
donne **aucun** ordre intra-bloc (§8-2). `mission_questions.position` = le rang 1..n dans cet ordre,
toujours renseigné.

**Quand un filtre ne rend rien** : un bloc actif sans question, ou un service de l'arbre sans paquet,
**n'est pas une erreur** — c'est un `avertissement` nommé dans la réponse de prévisualisation
(`{code, message}`), et le figeage continue. En revanche **une sélection totalement vide interdit le
figeage** (`409 CONFLICT`, message nommant le premier filtre qui a vidé l'ensemble) : figer zéro ligne
produirait une mission « figée et vide », indistinguable d'une mission non figée — l'existence des
lignes EST la preuve du figeage, il n'y a pas de colonne « figé ».

## 4. Le figeage (T3) — capture, idempotence, non-dérive

**Les 8 colonnes de capture**, recopiées **depuis la ligne de base, jamais depuis un DTO** :
`text_snapshot ← text_fr` · `guidance_snapshot ← guidance_fr` (les ancres §32.4 doivent être lisibles
hors ligne) · `answer_type_snapshot` · `options_snapshot` · `weight_snapshot` · `scoring_snapshot` ·
`criticality_snapshot` · `allow_range_snapshot`. Plus `question_id`, `question_version ← version`,
`position`, `added_ad_hoc = false`, et `id` = **UUID v7 applicatif** (lib `uuidv7`, P1-4 — jamais
`gen_random_uuid()` : la table est créable hors ligne).
**Ce qui reste du routage, lu à la volée** sur la ligne `questions` pointée : `profiles`, `block_id`,
`target_services`, `sectors`, `levels`, `geo`, `headcount_min/max`, `expected_source`, `display_if`,
`code`. Licite parce qu'une nouvelle version est une **nouvelle ligne** (04) : une référence vers une
ligne immuable *est* une capture.

**Idempotence et unicité** : une transaction ; `SELECT … FROM missions WHERE id = $1 FOR UPDATE` en
premier ; puis `SELECT count(*) FROM mission_questions WHERE mission_id = $1`. Si > 0 →
**`409 QUESTIONNAIRE_ALREADY_FROZEN`** portant le compte (et la date : voir §8-5). Le figeage n'est
autorisé que si `missions.status = 'preparation'` (§8-10). Deux appels concurrents : le `FOR UPDATE`
sérialise, le second sort en 409 — jamais deux jeux de lignes.

**La preuve de non-dérive, en trois temps** (note L3 §3.a) : (1) `question_version` est revérifié
contre la ligne pointée à chaque lecture de figeage — divergence = `CONFLICT`, détecteur de
corruption, jamais une lecture silencieuse ; (2) aucun chemin de code L3 n'émet d'`UPDATE` sur une
colonne `*_snapshot` (le seul écrivain légitime, `resync`, est hors lot) ; (3) le test ci-dessous.

**Le test de non-dérive, en toutes lettres** — `apps/api/tests/l3d-questionnaire.integration.test.ts`,
marqué `@critique`, testcontainers, écrit par A16 :

1. Semer un bloc B, une question Q v1 `active` (texte T1, options O1, barème S1, poids 1, guidance G1,
   criticité `important`, `allow_range` false), et une mission M au statut `preparation` avec B dans
   `active_blocks`. **Semer sa propre mission** : la mission de démonstration a déjà ses
   `mission_questions` et partirait en 409.
2. `POST /v1/missions/M/generate-questionnaire` → 201. Lire en SQL la ligne `mission_questions`
   produite et **mémoriser les 8 colonnes telles quelles** — les JSONB comparés en `jsonb`, les
   `numeric` comparés **en chaîne**, jamais convertis en `number`.
3. Muter la banque comme la banque mute réellement : `UPDATE questions SET status='archived' WHERE
   id = Q1`, puis `INSERT` d'une **nouvelle ligne** (même `code`, `version = 2`, texte T2, options O2,
   barème S2, poids 3, criticité `bloquant`, statut `active`).
4. Relire la ligne `mission_questions`. **Assertion 1** — les 8 valeurs sont **identiques au bit près**
   à celles de l'étape 2. **Assertion 2** — `question_version` vaut toujours 1 et `question_id` pointe
   la ligne v1 archivée. **Assertion 3** — `count(mission_questions WHERE mission_id = M)` est
   inchangé : la v2 n'entre pas d'elle-même (c'est `resync`, hors lot).
5. Rappeler `POST …/generate-questionnaire` → **409 `QUESTIONNAIRE_ALREADY_FROZEN`**, puis
   **revérifier les 8 valeurs** : un refus qui écrit serait pire qu'un refus.
6. Troisième temps, la détection de corruption : `UPDATE questions SET version = 9 WHERE id = Q1`
   (mutation illégitime simulée), puis relire le questionnaire figé par le service → **`CONFLICT`**,
   et surtout pas une lecture silencieuse.

Complément statique, bon marché, pour que le temps (2) soit une preuve et non une intention : un test
de garde qui balaie `apps/api/src` et **échoue si un `update(...)` mentionne une colonne
`*Snapshot`** hors du module `resync` (absent en L3).

## 5. Le plan d'entretiens §32.4 (T4)

Règles d'échantillonnage, transcrites littéralement, **par unité `in_scope` et `active`** :

| Effectif de l'unité | Entretiens | Sessions complémentaires (`interviews.kind`)     |
| ------------------- | ---------- | ------------------------------------------------ |
| ≤ 10                | **1** à 2  | —                                                |
| 11 – 50             | **3**      | —                                                |
| 51 – 200            | **4** à 6  | `observation` ×1                                 |
| > 200               | **6** à 10 | `observation`, `demonstration`, `releve_donnees` |

**Les `n` minimaux** (1, 3, 4, 6, en gras) sont ce que le critère n° 4 du 07 vérifie ; les tests les
prennent **aux valeurs limites** (10/11, 50/51, 200/201). `headcount` NULL → tranche minimale **et**
drapeau `effectifInconnu: true` sur l'unité : jamais un silence. Le consultant peut dévier (§32.4 : le
plan est un guide) — l'écart se verra à la couverture, qui est L7/L8.
Le plan est **une CIBLE, pas des lignes `interviews`** : il ne nomme aucun auditeur (§8-8) et n'écrit
rien en base.

**Reproductibilité : oui, à l'octet, et par trois mécanismes vérifiables.** La fonction est **pure**
(entrées = unités + référentiels ; `generatedAt` est *passé en paramètre*, jamais lu de l'horloge) ;
l'ordre de parcours est `org_units.position, id`, total et stable ; et **les fourchettes sont rendues
comme des fourchettes** (`{min: 1, max: 2}`), jamais tirées au sort dans l'intervalle — un intervalle
est une donnée, pas un tirage. Test : générer deux fois sur le même jeu, `toEqual` strict.
« Par unité **et par profil** » (§17.3, §18.1.2) : voir §8-6 — le plan **liste** les profils à couvrir,
sans les chiffrer.

## 6. `reassign` (§34.4)

- **Route** : `PATCH /v1/interviews/:id/reassign {newUserId, motif}` — listée au 05 §24.2 : aucune
  entrée `DECISIONS.md` de création de route n'est requise.
- **Qui a le droit** : admin (`users.role`) **ou lead de la mission** (`mission_users.role_on_mission
  = 'lead'`). « lead » n'est **pas** un rôle global : il ne peut pas s'exprimer dans `config.acces`
  (`DECISIONS.md` 2026-08-29 — `PolitiqueAcces` est une union exclusive, et A01 a refusé de l'élargir).
  Donc : `config.acces = { type: 'roles', roles: ['admin', 'consultant'] }` **et le contrôle « lead sur
  CETTE mission » vit dans le service**. Il n'est **pas** couvert par la vérification de totalité au
  démarrage : c'est une garantie d'un autre régime, elle se teste explicitement (consultant membre non
  lead → 403 ; consultant hors mission → 404).
- **Ce qui est refusé** : `interviews.status ∈ ('en_cours','termine')` → `409 CONFLICT` nommant l'état
  (§34.4 : les sessions réalisées restent à leur auteur, `conducted_by` immuable après coup) ·
  destinataire non membre de la mission → `403` · destinataire dont `habilitated_at` est NULL →
  `403 NOT_HABILITATED` (§34.4 : « un auditeur non habilité ne touche jamais un client » — réaffecter
  vers un non-habilité contournerait la garde par la porte de service) · `motif` vide → `400`.
- **Ce qui est tracé** : une entrée `activity_log` `{entity_type:'interview', entity_id, avant:
  conducted_by, apres: newUserId, motif}` — **des identifiants, aucune donnée personnelle** (11 §2 : ni
  `person_name`, ni email, ni contenu de réponse dans les journaux). `schedule_status` n'est pas touché.

## 7. Les routes de L3d

| Verbe + chemin                                | Rôles / accès                                                                       | Zod in                              | Zod out                                                                                     | Curseur                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `GET /v1/missions/:id/questionnaire-preview`   | `roles:['admin']` (§34.1)                                                            | `params{id:uuid}`                   | `{total, parBloc[], parInterlocuteur[], questions[], avertissements[]}`                        | **aucun — non paginée délibérément** (§33.4)       |
| `POST /v1/missions/:id/generate-questionnaire` | `roles:['admin']`                                                                    | `params` + `body:{}`                | 201 `{total, parBloc[]}` · 409 `QUESTIONNAIRE_ALREADY_FROZEN`                                  | —                                                  |
| `GET /v1/missions/:id/interview-plan`          | `{type:'mission', parametreMission:'id'}` — **surtout pas admin** (§18.3)             | `params`                            | `planEntretiensSchema`                                                                         | aucun (un plan est un tout)                        |
| `GET /v1/missions/:id/assignments`             | `roles:['admin']`                                                                    | `params` + `paginationQuerySchema`  | `pageSchema(assignmentSchema)`                                                                 | **`(id)` asc** — UUID v7 = ordre de création       |
| `POST /v1/missions/:id/assignments`            | `roles:['admin']`                                                                    | `params` + `createAssignmentSchema` | 201 `assignmentSchema`                                                                         | —                                                  |
| `PATCH /v1/interviews/:id/reassign`            | `roles:['admin','consultant']` + garde **lead au service**                            | `params` + `{newUserId, motif}`     | 200 `interviewReassignResponseSchema`                                                          | —                                                  |

Aucune de ces routes ne porte `financier: true` : aucune ne touche `scoping_financials`, et le plan
d'entretiens **ne lit pas `scoping_estimates`** (invariant 3 ; §18.3 : l'auditeur ne voit jamais le TJM).
Chaque route déclare ses schémas **in ET out** en forme déclarative (`schema: { … }`), importés de
`packages/shared` — aucun `.parse()` manuel, gabarit `routes/companies.ts`.

**Les 4 routes de L3 absentes des §8/§24.2**, chacune exigeant son entrée `DECISIONS.md` (11 §8-6) —
toutes **déjà écrites le 2026-08-29**, à citer et non à réécrire : ① `GET …/questionnaire-preview`
(renommée depuis `POST …/questionnaire/preview`) · ② `GET …/interview-plan` · ③ `POST
/v1/org-units/:id/validate` et `/merge` (L3c) · ④ `POST …/interview-plan/apply` — **REPORTÉE**, fiche
d'étage 2, aucune table du 04 ne l'accueille. Conséquence à écrire au dossier de porte : la condition
§32.2 « plan d'entretiens existant » devient non évaluable, donc **réputée satisfaite** (§17.2-V2.9),
jamais un verrou sur une fonctionnalité absente.

## 8. Ce que la spec ne tranche pas — options, recommandation, coût

| #      | Question                                                                                                                    | Options                                                                        | Recommandation A10                                                                                                                                        | Coût                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **1**  | `active_blocks` / `active_sectors` : codes ou UUID ? liste vide = tous ou rien ?                                              | (a) codes (b) UUID                                                             | **(a) codes** — mesuré au seed, cohérent avec §36.4 ; **liste vide = aucune restriction** (une mission créée sans choix reçoit le socle, jamais zéro question) | nul, mais **à aligner avec L3b**         |
| **2**  | Le 04 ne donne **aucun ordre intra-bloc** (`questions` n'a pas de `position`)                                                 | (a) `code` (b) `created_at` (c) `id`                                           | **`blocks.position, code NULLS LAST, id`** — déterministe, stable d'une génération à l'autre                                                                | nul                                      |
| **3**  | « palier dans [min,max] » : comparer quoi ?                                                                                   | (a) recouvrement palier ↔ question (b) `companies.headcount ∈ [min,max]`       | **(a)** — la mission porte `size_tier_id`, pas un effectif ; (b) casse toute mission dont l'effectif client est NULL                                        | nul                                      |
| **4**  | Sélection vide au figeage                                                                                                     | (a) figer 0 ligne (b) refuser                                                  | **(b) 409** — l'existence des lignes EST la preuve du figeage                                                                                              | nul                                      |
| **5**  | Le message du 409 doit porter « le compte **et la date** » (DECISIONS 2026-08-29) — or `mission_questions` **n'a aucune date** | (a) compte seul (b) date lue dans `activity_log` (c) amender le 04              | **(b)** — une lecture de plus, uniquement sur le chemin de refus ; (c) est la signature de Williams                                                        | ~0,1 j                                   |
| **6**  | Plan « par unité **et par profil** » (§17.3, §18.1.2) alors que §32.4 ne chiffre que **par unité**                             | (a) chiffrer par profil (b) lister les profils sans chiffrage (c) déduire des `profiles` figés | **(b), enrichi de (c)** quand le questionnaire est figé — (a) inventerait du périmètre fonctionnel                                                          | nul                                      |
| **7**  | `/v1/missions/:id/assignments` = `work_assignments` ou `mission_users` ?                                                       | (a) `work_assignments` (b) `mission_users` (c) les deux                        | **(a)** (§18.2 nomme la table) — **mais alors aucune route n'écrit `mission_users`**, et le cadrage RBAC par mission n'est testable que par SQL. **À porter à A01/Williams** | 0,25 j si (c)                            |
| **8**  | `interviews.conducted_by NOT NULL` vs un plan qui ne nomme aucun auditeur                                                      | déjà escaladé (DECISIONS 2026-08-31)                                           | **statu quo** : le plan reste une fonction pure, rien n'est persisté                                                                                       | nul                                      |
| **9**  | `interviews.interlocutor_profile_id` absent du 04                                                                             | escalade ouverte (note L3 §5-1)                                                | **hors L3d** — « profils rencontrés » (§16.6) et la divergence direction/terrain restent hors périmètre                                                     | nul                                      |
| **10** | Statut de mission autorisant le figeage                                                                                       | (a) `preparation` seul (b) tout statut                                         | **(a)** — sinon une mission `en_cours` verrait son questionnaire réécrit sous les pieds du terrain                                                          | nul                                      |
| **11** | Garde d'habilitation §34.4 à la réaffectation et à l'affectation                                                               | (a) garde (b) pas de garde                                                     | **(a)** — sinon la règle serveur se contourne par la porte de service                                                                                      | ~0,1 j                                   |

**Ce que je ne tranche pas et qui remonte : 5(c), 7, 8, 9** — schéma 04 ou périmètre fonctionnel.

## 9. Les pièges, listés franchement

1. **Copier un snapshot depuis un objet Zod.** `weight` est un `numeric` : le pilote pg le rend en
   **chaîne** ; passer par `number` arrondit en silence. Et faire transiter `options` / `scoring` par
   `optionsQuestionSchema` / `scoringQuestionSchema` (des `strictObject`) **rejetterait** une ligne de
   banque légitime portant une clé de plus. **On copie la ligne de base, telle quelle.**
2. **`gen_random_uuid()` sur `mission_questions`** : interdit (P1-4, 11 §2) — `uuidv7()` applicatif.
3. **Le balayage sentinelle financier** : les nouveaux gabarits `/v1/missions/:id/*` et
   `/v1/interviews/:id/reassign` doivent entrer dans la cartographie **(gabarit, paramètre)** avec des
   identifiants **réellement semés**, sinon ils seront comptés « non exercés » et le garde restera vert
   sur des routes jamais traversées — exactement le défaut corrigé le 2026-08-31, à ne pas recréer.
4. **La mission de démonstration a déjà ses `mission_questions`** : tout test de figeage qui l'emprunte
   part en 409. Chaque test sème sa mission.
5. **Invariant 2** : aucune fixture ne recopie l'exemple CSV du §35.2 (il porte des noms de client) ;
   libellés neutres partout, y compris dans les messages d'avertissement.
6. **Journaux** : ni la prévisualisation ni le plan ne se journalisent — ils recopient des noms
   d'unités et des effectifs du client (11 §2, et la règle « le rapport d'import ne se journalise
   jamais », DECISIONS 2026-08-29).
7. **`app.ts`** : un seul agent, en dernier. C'est la seule collision certaine du lot.
8. **`compterQuestionsFigees`** : une seule implémentation, chez L3d ; L3b la consomme, ne la duplique pas.
9. **Fragilité connue de la suite** (`auth/quota.test.ts`, `socle`, `crochets` : verts en isolation,
   rouges par contention) : **ce n'est pas une régression de L3d**. Ne pas la chasser dans cet
   incrément — mais ne pas non plus cocher « tous les tests verts » sans la nommer.
10. **L'exigence corollaire posée sur L4/L9** (note L3 §3.a) : une ligne `questions` référencée par un
    `mission_questions` ne se modifie jamais en place. L4 (import banque) ayant déjà des tests au dépôt,
    **le vérifier** avant de fonder la preuve de non-dérive sur cette exigence.

---

_Brief rédigé par A10, chef d'équipe backend — 2026-09-01, en lecture seule. À valider par A01 + A02
avant la première ligne de code de L3d (09 §3, étape 1bis dont ce document est l'exécution)._
