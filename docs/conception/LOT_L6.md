# LOT L6 — MOTEUR DE SYNCHRONISATION — note de conception (pipeline 09 §3, étape 1bis)

> Note de conception du lot L6, étape 1bis du pipeline (09 §3) : rédigée **AVANT la première
> ligne de code**, à valider par **A01 + le gardien A02**. Rédacteur : A20, chef de l'équipe 2.
> Sources : 05 §9 intégral · 11 §4 et §6 · 04 · 07 (ligne L6) · 09 §4 (P-D), §5.3, §6.

> ## AMENDEMENT DU 2026-09-05 — levée des cinq bloquants du contrôle A02
>
> Version d'origine : **2026-09-03**, commit `44e348b` (PR #27). Contrôle A02 :
> `docs/portes/CONTROLE_A02_NOTE_L6_2026-09-05.md` — verdict **ACCEPTÉE SOUS RÉSERVE**, cinq
> réserves bloquant l'ouverture (B1-B5), cinq réserves de porte (R1-R5), cinq observations.
> Arbitrages **A01 du 2026-09-05, sur délégation de Williams du 2026-09-04**.
>
> **Rien n'est supprimé en silence** : chaque amendement cite le texte qu'il remplace.
>
> | #       | Réserve        | Section amendée | Ce qui change                                                                          |
> | ------- | -------------- | --------------- | -------------------------------------------------------------------------------------- |
> | **A-1** | B1             | §5 PD4          | le résolveur de propriété distingue les trois entités et adopte **04 S-3**              |
> | **A-2** | B2             | §1, §3          | le **transport authentifié du terrain entre à L6a** (porteur du scénario 8)             |
> | **A-3** | B3             | §1, §3          | **L6a écrit `sync_log`** (push), L6b la ligne `pull`, + la clé locale de dernière sync  |
> | **A-4** | B4             | §2              | séquence stricte **L5c → P-C → L5d → L6a → L6b → L6c**                                  |
> | **A-5** | B5             | §3, §4          | **les routes de sync vivent sous `apps/api/src/sync/`** — décision d'arborescence        |
> | **A-6** | R2, R3, R4, O4 | §1, §3, §4, §5  | `attachment_uploads`, citation de routes corrigée, archive S-4, MinIO                   |
> | **A-7** | R1             | §5 PD6          | PD6 était **périmé** : le suivre serait une régression (R-L5a-3)                        |
> | **A-8** | R5             | §6              | la partie **visible** de L6b reçoit son plan DoD (4 états, axe-core, tokens)             |
> | **A-9** | O1, O2, D4     | §8              | trois doutes de spec ajoutés, plus **D5**, trouvé en relisant la note au code             |
>
> Toutes les affirmations de code ci-dessous ont été **re-mesurées le 2026-09-05 sur `origin/main`
> (`da7e8c9`)**, qui contient L5a (#30), L7a (#32) et L5b (#31) — et non sur l'état du 2026-09-03.

## 1. Périmètre, et ce que L6 ne fait pas

L6 = 4,5 j-h. Il livre **le moteur**, pas de nouvel écran de collecte : outbox, push
idempotent par lots, contrat `applied|duplicate|superseded|forbidden|error` (05 §9.3),
pull delta, backoff, statuts visibles, chunks §9.6, propriété serveur §9.9,
`processed_ops`. Il **remplace** `portSyncInerte` (L5a), il ne l'étend pas.

**AMENDEMENT A-2/A-3/A-6 (2026-09-05).** Le périmètre ci-dessus est celui du 07, mot pour mot, et
il le reste. Trois briques que le lot doit produire n'y étaient **pas nommées** et le sont
désormais — aucune n'ajoute de fonctionnalité, chacune est la condition d'un critère déjà écrit :

- **le transport HTTP authentifié du terrain** (Bearer + refresh rotatif) :
  `grep -rn "fetch(" apps/field/src` rend **0 occurrence** au 2026-09-05. L'app terrain n'a jamais
  fait un appel réseau. Sans lui, ni push ni pull n'existent, et le scénario 8 du §9.8 n'a aucun
  porteur ;
- **l'écriture de `sync_log`** : le lecteur existe (`apps/api/src/domaines/users/depot.ts`), la
  table existe (`drizzle/0007_transverse.sql`), **aucun écrivain applicatif n'existe** ;
- **la table `attachment_uploads`** (04, amendement S-6) : c'est LA table de la reprise d'upload,
  donc du critère « reprise à 80 % ».

**Hors périmètre, explicitement** : aucune règle métier de cotation, aucun scoring
(L8), aucune génération (invariant 6). Le serveur ne recalcule pas une valeur : il
l'accepte, la refuse, ou l'arbitre.

## 2. Séquencement — L6 SEUL, et après L5d

09 §6 : « P-C (fin L5) au plus tard le MARDI de la semaine 3 ; **ensuite** L6 se
développe SEUL (§5.3) ; jamais L5 et L6 menés de front ». La fin de L5 est la porte
P-C, donc **L5a + L5b + L5c**. L6 touche `apps/field/**` ET `apps/api/**` : démarrer
après L5a seul écraserait C2 en cours. Jalon de descope : 15/09.

**AMENDEMENT A-4 (2026-09-05, B4).** Ce paragraphe concluait : « Ordre praticable et conforme :
**L5a → L5b → L5c → (P-C) → L6 seul → (P-D)** ». Cette phrase est **périmée** : la chaîne photo a
reçu son lot propriétaire le 2026-09-05 (`DECISIONS.md`, « La chaîne PHOTO n'a de lot propriétaire
nulle part », PR #50) — un incrément **L5d** qui livre la table binaire locale, la capture, et
**monte `VERSION_SCHEMA_LOCAL`**.

**Séquence arbitrée par A01 le 2026-09-05, et elle est stricte :**

**L5c → (P-C) → L5d → L6a → L6b → L6c → (P-D)**

**L5d passe AVANT L6, pas en parallèle.** Le motif n'est pas de confort : L5d touche
`apps/field/src/local/base.ts` et monte `VERSION_SCHEMA_LOCAL`, c'est-à-dire **le schéma local même
sur lequel le moteur de sync s'écrit**. Deux chantiers simultanés sur le schéma local sont
exactement la collision que `CLAUDE.md` §4 interdit (« jamais deux lots en parallèle sur les mêmes
fichiers »). **Le coût est assumé et il se dit : L5d retarde L6 d'environ une demi-journée** —
moins cher qu'une migration locale réécrite au milieu de L6b.

Conséquence sur « L6 seul » (09 §5.3) : la règle n'est **pas** affaiblie, elle est **décalée**. Une
fois L5d fusionné, plus aucun chantier ne tourne sur `apps/field/**` ni `apps/api/**` jusqu'à P-D.
Les scénarios **6** et **7** du §9.8, qui exigent des photos réelles, deviennent atteignables.

## 3. Découpage en incréments (11 §6 — imposé, ≤ ~1 j chacun, commit + tests verts)

| Inc.    | Contenu                                                                                                                                                                                                                   | Glob de couverture (seuil 90 %)                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **L6a** | **Transport HTTP authentifié (A-2)**, outbox (drainage, ordre, lots de 100), push idempotent, `processed_ops`, contrat d'ops complet §9.3, propriété §9.9, **écriture `sync_log` push + clé locale de dernière sync (A-3)** | `apps/field/src/sync/**` · `apps/api/src/sync/**` |
| **L6b** | Pull delta, curseur `nextSince` par mission, statuts visibles, backoff exponentiel (max 1 min), « à examiner » au 10e échec, **ligne `sync_log` `pull` (A-3)**                                                             | idem                                              |
| **L6c** | Chunks pièces jointes §9.6 **+ table `attachment_uploads` (A-6)**, **les 8 scénarios §9.8 scriptés**, charge k6                                                                                                            | idem                                              |

**AMENDEMENT A-5 (2026-09-05, B5) — décision d'arborescence, prise AVANT la première ligne.**
La note se contentait des deux globs. Mesure du 2026-09-05 : les routes de l'API vivent dans
`apps/api/src/routes/*.ts` (9 fichiers), **hors de `apps/api/src/sync/`** — or c'est la route qui
porte le contrôle §9.9 et le contrat §9.3. Le fichier `.github/coverage-critical-paths.json` a déjà
refusé ce cas deux fois : « un seuil qui mesure le dépôt mais pas la route mesure **la moitié qui ne
décide de rien** » (`scoping`, puis `users`).

**Arbitrage A01 : les routes de sync vivent DANS `apps/api/src/sync/`, avec leur domaine** —
`routes.ts`, `service.ts`, `depot.ts`, `proprietaire.ts`, `chunks.ts` — enregistrées dans `app.ts`
avec le préfixe `/v1`, comme les autres. Le glob `apps/api/src/sync/**` couvre alors **les deux
moitiés**, et aucun troisième glob n'est nécessaire. C'est un écart assumé à la convention
`routes/<x>.ts`, et il a un **précédent dans le dépôt** : `apps/api/src/domaines/auth/routes.ts`
colocalise déjà route et domaine.

Les deux globs sont déjà déclarés `cheminsAttendus` / « non livré » dans
`.github/coverage-critical-paths.json` : **L6a les déplace dans `cheminsCritiques`**.
On remonte la couverture, on ne rétrécit jamais le périmètre (précédent L3, DECISIONS
du 2026-09-02).

### 3bis. Ce que L6a doit livrer côté transport (A-2) et côté journal (A-3)

**Transport** — `apps/field/src/sync/transport.ts`, seul module de l'app terrain autorisé à appeler
le réseau :

- **Bearer** sur toute route `/v1/sync/*`. Le jeton d'accès (15 min, 11 §3) est tenu **en mémoire de
  session** ; seul le **refresh** est au repos, chiffré sous la DEK — `lireJetonRafraichissement`,
  `enregistrerJetonRafraichissement`, `effacerJetonRafraichissement` (`local/jetons.ts`, L5a).
- **Rotation** : `POST /v1/auth/refresh` (livré par L2, `domaines/auth/routes.ts`). Le serveur
  révoque et remplace dans la même transaction ; un jeton rejoué hors fenêtre de grâce **révoque
  toute la famille** — la détection de réutilisation est serveur, L6 ne la réimplémente pas.
- **401 sur une route de sync** : UNE tentative de refresh, puis UNE reprise. Un second 401 arrête
  la sync ; il ne vide jamais l'outbox.
- **Refresh REFUSÉ hors ligne — le cas qui compte, 05 §31-3.** Il faut distinguer deux échecs que
  rien ne distingue naïvement : _pas de réseau_ et _jeton mort_. Une erreur réseau (`TypeError`,
  timeout, `navigator.onLine` faux) n'est **pas** un refus : backoff, aucun jeton effacé, statut
  `echec`. Un refus **explicite** du serveur (401/403 sur `/auth/refresh`) efface le refresh, place
  la mission en `indisponible` et affiche le message du §31-3 — _« reconnexion requise pour
  synchroniser — vos données sont en sécurité sur l'appareil »_. **Dans les deux cas la collecte
  continue** : la KEK dérive du mot de passe et de rien d'autre (05 §9.7), le déverrouillage local
  ne dépend d'aucun jeton. Effacer un refresh parce que le réseau est tombé coûterait 30 jours de
  sync à un auditeur en mission — c'est le piège de ce scénario.
- **Bornes** : `/v1/auth/*` est limité à 10 req/min/IP (11 §3) — le transport ne martèle pas le
  refresh. Le jeton n'est **jamais** journalisé (11 §2).

**Journal de sync** — `sync_log` (04) est écrit **par le serveur, à chaque synchronisation
aboutie** : `user_id`, `device_id` (envoyé par le client, `CLES_META.appareil`), `direction` `push`
(L6a) ou `pull` (L6b), `items_count`, `conflicts_count` (`superseded` + `forbidden` + `error`),
**`outbox_remaining`** (déjà porté par `lotPushSchema`), `started_at`/`ended_at`, `status`, `error`.

Ce n'est **pas** de la journalisation d'agrément : **deux garde-fous en dépendent**. ① 05 §9.7 — le
serveur refuse la réinitialisation admin d'un mot de passe tant que le dernier `outbox_remaining`
connu est > 0 ; sans écrivain, ce garde-fou reste à jamais dans sa branche « aucune sync connue »,
**et son test de L2 reste vert** parce qu'il ensemence la table à la main. ② Invariant 8 — l'alerte
« aucune sync depuis 24 h » n'a aucune matière côté siège.

**Côté local, le symétrique manque aussi, et la note ne le disait pas.**
`EtatSyncMission.derniereSyncReussieLe` est lu par `evaluerAlerteSauvegarde` (L5a), mais
**`CLES_META` ne porte aucune clé pour l'écrire** : vérifié le 2026-09-05 dans
`apps/field/src/local/base.ts`. L6a ajoute une clé `sync:derniere-reussie:<missionId>`, écrite après
chaque push ou pull abouti. Ajout **append-only à `CLES_META`, sans montée de
`VERSION_SCHEMA_LOCAL`** — `meta` est une table clé/valeur, son schéma ne bouge pas. Sans cette
clé, l'alerte de l'invariant 8 se déclencherait pour toujours.

## 4. Interfaces — déjà gelées, L6 ne les redéfinit pas

1. **`packages/shared/src/sync.ts`** (écrit par L5a, arbitrage A01) : `operationSchema`,
   `lotPushSchema` (+ `outboxRemaining`), `reponsePushSchema`, `reponsePullSchema`,
   `RESULTATS_OP`, `TAILLE_LOT_PUSH_MAX = 100`, `ECHECS_AVANT_EXAMEN = 10`.
   **L6 implémente ce contrat ; le modifier est une escalade 11 §8-2.**
2. **`apps/field/src/local/port-sync.ts`** : `PortSync`, `EtatSyncMission`,
   `ResultatSync`, `evaluerAlerteSauvegarde`, `DELAI_ALERTE_SANS_SYNC_MS`.
   L6a fournit l'implémentation réelle sous `apps/field/src/sync/`.
3. **`apps/field/src/local/ecriture.ts`** : `appliquerDescente(LotDescendant)` est le
   SEUL point d'entrée de la descente — il n'écrit jamais l'outbox (garantie
   structurelle : la table est absente de la transaction). L6b traduit
   serveur→formes locales AVANT de l'appeler ; il ne fait pas de ce module un client HTTP.
4. **Routes.** **AMENDEMENT A-6 (2026-09-05, R3).** La note écrivait : « `POST /v1/sync/push`,
   `GET /v1/sync/pull`, et les trois routes de chunks §9.6 — **toutes listées 05 §8.4/§24.2**. »
   **La citation était fausse** : 05 §8.4 ne liste que `GET /v1/sync/pull`, `POST /v1/sync/push` et
   `POST /v1/sync/attachments/:id` ; **§24.2 n'en cite aucune**. Les trois routes de chunks
   (`POST …/chunks/:index`, `GET …/status`, `POST …/complete`) sont spécifiées **au §9.6 seul** —
   elles sont donc bien au pack, 11 §8-6 est satisfait, mais la source est §9.6. Le sort de
   `POST /v1/sync/attachments/:id` (multipart du §8.4) est un **doute de spec, D4**, à trancher en
   entrée de L6c : deux routes pour un même geste, ou une seule.
5. **`apps/field/src/local/contrat-sync.ts`** importe encore `packages/shared/src/sync.js` **par
   chemin profond**, sur une prémisse devenue fausse (« pas encore ré-exporté par le baril ») :
   `packages/shared/src/index.ts:26` contient bien `export * from './sync.js';`. L6a rétablit
   l'import par le baril — micro-amélioration d'**étage 1** (09 §5.9), une ligne dans
   `AMELIORATIONS.md`, aucun impact schéma/API/crypto/périmètre.

## 5. Points durs — nommés maintenant, pas découverts à P-D

- **PD1 — deux `mission_questions` à la même position.** DECISIONS 2026-09-02 [L5b] :
  la question ad hoc s'insère « juste APRÈS la courante », donc en `position n+1`, sans
  renuméroter les questions siège. Le 04 ne pose **aucun UNIQUE(mission_id, position)** :
  rien ne casse en base — c'est le **tri** qui diverge. Le terrain départage par
  `(position, addedAdHoc d'abord, id v7)` (`EcranEntretien.tsx:109`, re-vérifié le 2026-09-05) ; le
  serveur n'a **aucune règle écrite**. Sans décision, l'ordre du parcours terrain ≠ ordre du pull,
  du rapport §36.3 et de la console. **À trancher en entrée de L6a** (doute D1). _Précision du
  2026-09-05 : `ordonnerParcours` est une fonction **privée de module**, non exportée — la règle
  sera donc écrite DEUX fois, en TypeScript et en SQL. Elle se verrouille par une **fixture
  partagée** rejouée des deux côtés, sinon elle divergera au premier correctif._
- **PD2 — la charge d'op est chiffrée.** `ecrireLocal` chiffre l'op avec la **DEK
  appareil** ; le push doit la déchiffrer en mémoire, puis **mapper** la forme locale
  (camelCase, index + charge, drapeaux `0|1`) vers la forme du 11 §4. Cas unique :
  `question_adhoc` doit devenir `{question:{…§36.4}, mission_question:{id, position}}`,
  les deux ids venant du client. C'est le seul endroit où le fil ≠ le local.
- **PD3 — qui matérialise la révision.** 05 §9.3 (V2.9) : le client n'émet **jamais**
  d'op de révision ; le serveur crée `answer_revisions` (origine `terrain`) **quand
  `value` change**. Le compteur local `answers.revision` monte à _chaque_ écriture (une
  note seule l'incrémente : `ecriture-reponses.ts:184`, `revision: existante.revision + 1`, sans
  comparaison de `value`) : **le serveur ne doit pas s'en servir comme déclencheur.**
- **PD4 — propriété §9.9 : TROIS entités, TROIS résolveurs.**
  **AMENDEMENT A-1 (2026-09-05, B1) — correction, pas arbitrage.** Ce point disait : « Une op
  `answer` ne porte pas `conducted_by` : le serveur résout le propriétaire **via `interviews`**. Si
  l'entretien n'est pas encore connu (lot partiel, rejeu), la réponse doit être `error` (rejouable),
  **jamais `forbidden`**. » La règle est juste pour `answer` et **fausse pour `attachment_meta`** :
  une **note volante** porte `interviewId: string | null` par construction
  (`session/notes-volantes.ts`, L5b) — il n'existe **aucune ligne `interviews` à interroger**, et ce
  n'est pas un lot partiel, c'est l'état **normal et durable** d'une note volante (04 §24.1 P1-5).
  Suivie littéralement, la règle répond `error` en boucle jusqu'à « à examiner » au 10e essai : **la
  note de couloir de l'auditeur ne remonte jamais.** C'est l'invariant 7 pris par son côté le plus
  discret. **Le 04 avait déjà tranché** — amendement **S-3 (2026-08-31)** : « _propriétaire = le
  rattachement quand il existe, **SINON `created_by`**_ », et la colonne `attachments.created_by`
  est posée pour cela. La note ignorait une décision existante. Règle adoptée :

  | Op                | Propriétaire                                                                                                    | Entité absente                                               |
  | ----------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
  | `interview`       | `interviews.conducted_by` de la **ligne serveur** ; à la création, l'émetteur                                     | création : rien à résoudre                                   |
  | `answer`          | via `answers.interview_id` → `interviews.conducted_by`                                                            | entretien inconnu → **`error`** (rejouable), pas `forbidden`  |
  | `attachment_meta` | **04 S-3** : `interview_id` (ou `answer_id` → son entretien) quand il existe, **SINON `attachments.created_by`** | note volante non rattachée → **`applied`**, jamais bloquée    |

  **Et une ceinture que la note ne posait pas** : le payload client porte `createdBy`
  (`notes-volantes.ts`) et `conductedBy` (`ecriture-session.ts`) — **le serveur ne les croit pas.**
  §9.9 est une règle **serveur** : à la création, le propriétaire est l'**émetteur authentifié du
  push** ; un payload qui désigne quelqu'un d'autre est `forbidden`, jamais accepté en silence.
  Faire confiance au client ici rendrait §9.9 décoratif.

- **PD5 — `forbidden` ne se rejoue jamais**, `superseded` archive la valeur perdante
  (`sync_arbitrage`) et notifie « n réponse(s) arbitrée(s) », `error` compte jusqu'à 10
  puis passe « à examiner ». Aucune suppression silencieuse : c'est l'invariant 7.
  **Précision A-6 (2026-09-05, R4)** : la note ne disait pas archiver **quoi**. Depuis l'amendement
  **S-4** du 04, `answer_revisions` porte `entity_type CHECK IN ('answer','interview','attachment')`
  + `entity_id`, parce que §9.4 étend le dernier-écrit-gagne aux **trois** entités synchronisées.
  Sur le scénario 5 — un critère `@critique` — la valeur perdante d'un **entretien** ou d'une
  **pièce jointe** disparaissait sans trace. **L6a archive les trois.**
- **PD6 — PÉRIMÉ, NE PAS SUIVRE. AMENDEMENT A-7 (2026-09-05, R1).** Ce point disait :
  « `appliquerDescente` n'écrit sa clé `meta` que si `conservees > 0` et ne la remet jamais à 0 […]
  L6b remet à zéro ou n'affiche pas. » **C'est faux depuis la correction R-L5a-3** : mesuré le
  2026-09-05, `local/ecriture.ts` écrit la clé **inconditionnellement, zéro compris**, et le
  commentaire nomme la raison — « _la valeur décrit CE pull, pas l'histoire de l'appareil_ ».
  **Suivre PD6 serait une régression** : ajouter une remise à zéro redondante, ou pire,
  « corriger » l'écriture inconditionnelle et réintroduire R-L5a-3. **L6b consomme la clé telle
  quelle** ; il n'a rien à réparer.
- **PD7 — horloge.** `serverTime` du pull règle l'offset (`reglerDecalage`, `local/horloge.ts:45`) ;
  c'est lui qui rend le scénario « horloge déréglée +3 h » gagnable. Le `client_updated_at` est
  posé à UN seul endroit (le port d'écriture), jamais par un `new Date()` du moteur.
- **PD8 — MinIO n'est jamais exposé (nouveau, 2026-09-05, O4).** L6c assemble les chunks : la
  tentation de l'URL présignée est là. 11 §2 l'interdit — MinIO reste sur le réseau Docker interne,
  **tout téléchargement passe par l'API** (streaming + RBAC), tout envoi par le protocole §9.6.

## 6. Plan de tests — TDD, A26 écrit AVANT A25

**Les 8 scénarios §9.8 SONT le plan de tests** ; tous Playwright, marqués `@critique`,
rejoués à chaque commit (détail des porteurs : §6bis).

Plus : RBAC/propriété §9.9 exhaustif en intégration — **les trois résolveurs de PD4, y compris le
cas « note volante non rattachée », qui doit finir `applied`** · charge k6 50 clients × 1 000 ops,
p95 < 500 ms · `@filrouge` allongé (sync + rejeu idempotent) vert sur **FIL-TPE ET FIL-GC**.
**Couverture ≥ 90 % MESURÉE** sur les deux globs, quatre métriques (lines, statements,
functions, branches) — la métrique `functions` est celle qui décroche en premier, elle se
surveille explicitement. Chaque test doit être **discriminant** : prouvé par bascule.

**AMENDEMENT A-8 (2026-09-05, R5) — la partie VISIBLE de L6b a maintenant son plan DoD.**
« Statuts visibles » est de l'interface : file en attente, « à examiner » (§9.3), ops « rejetées »
(§9.9), notification « n réponse(s) arbitrée(s) » cliquable. La note ne parlait que de Playwright,
k6 et couverture — la DoD transverse (09 §3) exige davantage sur tout écran livré :

- **les 4 états (03 §33.2)** — vide, chargement, erreur, plein — pour chaque surface de statut ;
- **axe-core vert** (A28), et la convention arbitrée le 2026-09-05 : **au plus UN `role="alert"` par
  écran**, réservé à ce qui bloque le geste en cours ; le reste en `role="status"`, **visible**, la
  dégradation portant sur l'annonce et jamais sur l'affichage ;
- **aucune couleur ni taille en dur** (invariant 4) : l'alerte de sauvegarde est un **rouge
  distinct** du terracotta d'action, pris aux tokens ;
- **p95 des interactions < 100 ms** — l'affichage du statut lit le local, jamais le réseau.

## 6bis. Table critère 07 → incrément porteur — LES 8 SCÉNARIOS, SANS EXCEPTION

**NOUVEAU (2026-09-05).** C'est le contrôle qui a manqué la première fois : trois des huit
scénarios `@critique` n'étaient portés par aucun incrément. Aucune ligne ne reste vide.

| Critère 07 (mot pour mot)                     | Mécanisme porté par                                                          | Test écrit par                |
| --------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| **C2** — rejeu 3× du même lot = état identique | **L6a** — `processed_ops` + upsert par `entityId` (les deux ceintures, 11 §4) | A27 (intégration) + A26 (E2E) |
| **C3** — reprise d'upload interrompu à 80 %    | **L6c** — chunks §9.6 + `attachment_uploads` ; octets fournis par **L5d**    | A26                           |
| **C4** — 50 clients × 1 000 ops, p95 < 500 ms  | **L6c** — k6                                                                 | A28                           |

| #   | Scénario §9.8                                        | Incrément porteur du MÉCANISME                                                                         | Test            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------- |
| 1   | coupure réseau en pleine saisie                      | **L6a** — transport (A-2), drainage, backoff ; l'atomicité d'écriture est déjà livrée (L5a)             | L6c / A26       |
| 2   | kill de l'app pendant un push                        | **L6a** — statut d'op persistant, reprise de file, `processed_ops`                                      | L6c / A26       |
| 3   | double envoi du même lot                             | **L6a** — `processed_ops` + upsert par `entityId`                                                       | L6c / A26       |
| 4   | horloge locale +3 h                                  | **L6b** — `serverTime` → `reglerDecalage` (PD7)                                                         | L6c / A26       |
| 5   | deux appareils sur la même mission                   | **L6a** — `superseded` + archive `answer_revisions` **sur les trois entités** (S-4)                     | L6c / A26 + A27 |
| 6   | 5 000 réponses **+ 200 photos** en file              | **L5d** (chaîne photo locale) → **L6a** (lots de 100) → **L6c** (envoi)                                 | L6c / A26       |
| 7   | reprise d'upload interrompu à 80 %                   | **L5d** (octets) → **L6c** (chunks §9.6 + `attachment_uploads`)                                         | L6c / A26       |
| 8   | expiration du refresh token en mission longue (§31-3) | **L6a** — transport authentifié : refresh rotatif, 401 hors ligne, message §31-3, collecte qui continue | L6c / A26       |

**8/8 portés.** Les scénarios 6 et 7 dépendent de **L5d**, ce qui est exactement pourquoi la
séquence du §2 le place **avant** L6a.

## 7. Affectation croisée (09 §5.6 — le testeur n'est jamais l'auteur)

| Périmètre                                            | Code | Tests |
| ---------------------------------------------------- | ---- | ----- |
| Transport authentifié terrain (A-2)                  | A25  | A26   |
| Moteur terrain (outbox, push, backoff)               | A25  | A26   |
| Réception serveur, `processed_ops`, §9.9, `sync_log` | A23  | A27   |
| Chunks §9.6, `attachment_uploads`                    | A25  | A26   |
| Statuts visibles L6b (4 états, a11y)                 | A22  | A28   |
| 8 scénarios §9.8 (Playwright)                        | —    | A26   |
| Charge k6, a11y, budgets                             | —    | A28   |
| Revue croisée (ne produit rien)                      | —    | A29   |

Le gardien A02 relève (O2) que 09 §1 place « propriété de session §9.9 » et « idempotence » dans les
gabarits **A14/A16** (équipe 1) tout en plaçant **le lot L6 entier dans l'équipe 2** : la
contradiction est **interne au 09**. Doute **D-B**, à trancher d'une ligne par A01. La règle de
croisement, elle, est respectée sur **toutes** les lignes.

## 8. Doutes de spec → DECISIONS.md, jamais devinés

- **D1** : la règle de tri serveur à position égale (PD1) — proposition : la même que le
  terrain, `(position, added_ad_hoc DESC, id)`. **À ouvrir en entrée de L6a.**
- **D2** : `PHRASE_SCRIPT_ACCORD` — 03 M3.2 et 10 (U5) disent « phrase-script **fournie** »
  et ne la fournissent nulle part. **Escalade Williams** (hérité de L5b — **ne bloque pas L6**).
- **D3** : `answers.revision` — le serveur l'ignore-t-il au profit du diff de `value` (PD3) ?
  05 §9.3 V2.9 répond déjà ; l'entrée grave que le **compteur client n'est pas le déclencheur**.
- **D4** _(2026-09-05, R3)_ : que devient **`POST /v1/sync/attachments/:id`** (multipart, 05 §8.4)
  face au protocole de chunks du §9.6 ? Deux routes pour un même geste, ou une seule ? À trancher
  **en entrée de L6c** ; 11 §8-6 impose de le documenter.
- **D5** _(2026-09-05, trouvé en relisant la note contre le code)_ : **§9.9 ne couvre que trois
  entités sur cinq.** `ENTITES_SYNC` en compte cinq (`packages/shared/src/sync.ts`) ; §9.9 ne nomme
  que `interviews`, `answers`, `attachments`. **`org_unit_proposal` et `question_adhoc` n'ont donc
  aucune règle de propriété écrite** — ce sont des créations, sans propriétaire préexistant.
  Proposition : affectation à la mission (RBAC de portée) et `created_by` = émetteur. À trancher en
  entrée de L6a, sans quoi le résolveur devinera.
- **D-A** _(gouvernance, O1)_ : la règle « note ≤ 1 page » (09 §3-1bis) est-elle amendée ou
  rétablie ? Cinq notes, cinq dépassements. Cette note assume l'écart et le déclare.
- **D-B** _(gouvernance, O2)_ : qui code la réception serveur de L6 — l'équipe 2 (09 §1, « L6 ») ou
  les gabarits A14/A16 nommément compétents ?

**Signature :** A20 — conception L6, version d'origine 2026-09-03 ; **amendée le 2026-09-05** pour
lever B1 à B5 du contrôle A02, sur arbitrages A01 du 2026-09-05. À contresigner A01 + A02.
