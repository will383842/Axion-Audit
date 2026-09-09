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
> | **A-4** | B4             | §2              | séquence stricte **L5c → P-C → L5f → L6a → L6b → L6c** (lot renommé par A-12)           |
> | **A-5** | B5             | §3, §4          | **les routes de sync vivent sous `apps/api/src/sync/`** — décision d'arborescence        |
> | **A-6** | R2, R3, R4, O4 | §1, §3, §4, §5  | `attachment_uploads`, citation de routes corrigée, archive S-4, MinIO                   |
> | **A-7** | R1             | §5 PD6          | PD6 était **périmé** : le suivre serait une régression (R-L5a-3)                        |
> | **A-8** | R5             | §6              | la partie **visible** de L6b reçoit son plan DoD (4 états, axe-core, tokens)             |
> | **A-9** | O1, O2, D4     | §8              | trois doutes de spec ajoutés, plus **D5**, trouvé en relisant la note au code             |
> | **A-10** | R1 (A29)       | §3bis           | **2026-09-09** — la clé de dernière sync est LIVRÉE par L5e : nom et sémantique corrigés |
> | **A-11** | calendrier P-DESCOPE | §3ter | **2026-09-09** — le découpage en incréments COMMITABLES : fichiers, porteurs, critères de fin, estimations |
> | **A-12** | renommage A01 | §2, §3ter, §6bis, §8 | **2026-09-09** — la chaîne photo devient **L5f** ; « L5d » ne désigne plus, dans cette note, que l'incrément **fusionné** (invariant 5) |
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

## 2. Séquencement — L6 SEUL, et après L5f (chaîne photo)

09 §6 : « P-C (fin L5) au plus tard le MARDI de la semaine 3 ; **ensuite** L6 se
développe SEUL (§5.3) ; jamais L5 et L6 menés de front ». La fin de L5 est la porte
P-C, donc **L5a + L5b + L5c**. L6 touche `apps/field/**` ET `apps/api/**` : démarrer
après L5a seul écraserait C2 en cours. Jalon de descope : 15/09.

**AMENDEMENT A-4 (2026-09-05, B4).** Ce paragraphe concluait : « Ordre praticable et conforme :
**L5a → L5b → L5c → (P-C) → L6 seul → (P-D)** ». Cette phrase est **périmée** : la chaîne photo a
reçu son lot propriétaire le 2026-09-05 (`DECISIONS.md`, « La chaîne PHOTO n'a de lot propriétaire
nulle part », PR 50) — un incrément **L5f (chaîne photo)** qui livre **la table binaire locale, la
capture depuis l'appareil et la compression** des images, et qui **monte `VERSION_SCHEMA_LOCAL`**.

> ### AMENDEMENT A-12 DU 2026-09-09 — ce lot s'appelait « L5d », et il a changé de nom
>
> **Texte remplacé** : partout dans cette note, « L5d » désignait la chaîne photo. Deux incréments
> portaient cette lettre : la chaîne photo, **jamais ouverte**, et « L5d — l'invariant 5 à l'écran »
> (`4f56e1f`, PR 108), **fusionné dans `main`**. Lire « L5d livré » était donc vrai, et laissait
> croire que la capture photo l'était.
>
> **Arbitrage A01 du 2026-09-09** (`DECISIONS.md`, « `L5d` nomme deux incréments : lequel change de
> nom ? ») : **la chaîne photo devient `L5f` ; l'incrément fusionné garde `L5d`.** Le critère est
> l'immuabilité de la preuve, pas l'antériorité de l'intention — branche `lot/l5d-invariant5`, sept
> commits, revue A29 et nom du fichier de test sont immuables, et renommer le livré ferait dire aux
> documents un nom que `git log` contredit. Règle qui en sort : **une lettre s'attribue à
> l'OUVERTURE d'un incrément, jamais à sa planification.**
>
> **Convention dans toute la suite de cette note** : **`L5f` = chaîne photo — table binaire locale,
> capture, compression — NON OUVERTE** au 2026-09-09 (`VERSION_SCHEMA_LOCAL` vaut 1, `SCHEMA_LOCAL`
> ne porte aucune table binaire, `compresserPhoto` n'a aucun appelant de production) ·
> **`L5d` = l'invariant 5 à l'écran, FUSIONNÉ**. Les documents antérieurs au 2026-09-09 gardent
> l'ancien sens : ils ne se réécrivent pas, ils se lisent avec cette clé.

**Séquence arbitrée par A01 le 2026-09-05, et elle est stricte :**

**L5c → (P-C) → L5f → L6a → L6b → L6c → (P-D)**

> **Confrontation au réel, 2026-09-09, sur `origin/main` = `58c570f`.** Cette séquence n'est déjà
> plus tout à fait celle qu'on a tenue en amont : **deux incréments qu'elle ne prévoyait pas** ont
> été livrés et fusionnés entre L5c (PR 52) et P-C — **L5d (invariant 5)** `4f56e1f` et **L5e**
> `59a3da2`. Le tenu est donc **L5c → L5d (invariant 5) → L5e → (P-C)**. Et **P-C n'est pas
> signée** : le rejeu A02 du 2026-09-09 la donne à **1 critère ferme, 7 sous réserve matérielle ou
> de démo, 0 non tenu**, en attente de la demi-journée matérielle de Williams
> (`docs/portes/SEANCE_MATERIELLE_P-C.md`). L'aval — `L5f → L6a → L6b → L6c` — reste la séquence
> en vigueur **tant que D10 n'est pas tranché par A01**, et **L5f n'est pas ouvert** : ni branche,
> ni commit, ni ligne de production.

**L5f passe AVANT L6, pas en parallèle.** Le motif n'est pas de confort : L5f touche
`apps/field/src/local/base.ts` et monte `VERSION_SCHEMA_LOCAL`, c'est-à-dire **le schéma local même
sur lequel le moteur de sync s'écrit**. Deux chantiers simultanés sur le schéma local sont
exactement la collision que `CLAUDE.md` §4 interdit (« jamais deux lots en parallèle sur les mêmes
fichiers »). **Le coût est assumé et il se dit : L5f retarde L6 d'environ une demi-journée** —
moins cher qu'une migration locale réécrite au milieu de L6b.

Conséquence sur « L6 seul » (09 §5.3) : la règle n'est **pas** affaiblie, elle est **décalée**. Une
fois L5f fusionné, plus aucun chantier ne tourne sur `apps/field/**` ni `apps/api/**` jusqu'à P-D.
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
`apps/field/src/local/base.ts`. L6a ajoute la clé, en ajout **append-only à `CLES_META`, sans montée
de `VERSION_SCHEMA_LOCAL`** — `meta` est une table clé/valeur, son schéma ne bouge pas. Sans cette
clé, l'alerte de l'invariant 8 se déclencherait pour toujours.

> ### AMENDEMENT A-10 DU 2026-09-09 — la clé n'est plus à créer, elle est LIVRÉE (R1 d'A29)
>
> **Texte remplacé** (rédigé le 2026-09-05, quand la clé n'existait pas) : « L6a ajoute une clé
> `sync:derniere-reussie:<missionId>`, écrite après chaque push **ou pull** abouti. »
>
> **Ce texte est périmé sur les deux points, et le suivre serait une régression.** L5e l'a livrée le
> 2026-09-08 (`b92cd23`) sous un AUTRE nom et une AUTRE sémantique :
> **`sync:dernier-succes:<missionId>`** — `CLES_META.prefixeDerniereSyncReussie`, helper
> `cleDerniereSyncReussie(missionId)` (`apps/field/src/local/base.ts:155`) — lue par
> `agenda/jour.ts:133`, qui en nourrit **à la fois** la carte du cockpit et
> `evaluerAlerteSauvegarde` (une source pour un fait, B6). Personne ne l'écrit en L5 : sa valeur
> vaut « jamais synchronisée », conforme à la borne D-6.
>
> **L6a écrit donc `cleDerniereSyncReussie(missionId)` — ce nom-là — après chaque PUSH abouti, et
> JAMAIS depuis `appliquerDescente`.** Un pull fait descendre ; il ne fait rien sortir, et c'est la
> sortie que l'invariant 8 protège (`DECISIONS.md`, 2026-09-09, « Le dernier succès de sync
> compte-t-il un pull, ou le push seul ? »). Le curseur de pull `sync:since:` reste distinct : il
> s'écrit dès l'embarquement (`local/ecriture.ts:295`) et afficherait un faux succès au jour 0.
>
> **Avec son test, sinon l'amendement ne vaut rien.** Aucun test ne croisait les deux artefacts —
> c'est ce qui a rendu la divergence invisible pendant trois jours, tout en vert. L6a livre la garde
> qui affirme que la clé écrite par le moteur est **celle que `construireJournee` lit**, et qu'un
> pull seul ne l'écrit pas. À A26, pas à l'auteur du moteur (09 §5.6).
>
> **R2 d'A29 — daté et assigné ici, correctif à L6a.** `apps/field/src/app/EcranAccueil.tsx:195-214`
> dérive l'alerte de l'invariant 8 de `portSyncInerte.etat()`, qui passe `null` **en dur** à
> `evaluerAlerteSauvegarde` (`local/port-sync.ts:167`), pendant que le cockpit la dérive de `meta`.
> Invisible aujourd'hui — les deux sources disent « jamais » — **contradictoire dès le premier push
> réussi de L6a** : deux écrans, deux réponses opposées sur le même fait, B6 réarmé. Aucun correctif
> avant L6a (09 §4bis : L5e ne rouvre rien pour ça). **L6a le clôt en remplaçant le port**, comme il
> remplace `portSyncInerte` : l'implémentation réelle lit `meta` et ne code plus `null`. La
> non-régression attendue : les deux écrans rendent le MÊME verdict après un push réussi.

## 3ter. Découpage en incréments commitables — AMENDEMENT A-11 DU 2026-09-09

> **Rien n'est remplacé.** La table du §3 reste le sommaire du lot ; §3ter en est la version
> **exécutable** — celle qu'une session ouvre à la minute où P-C tombe, pour n'avoir plus rien à
> concevoir ce jour-là. Toutes les mesures ci-dessous datent du **2026-09-09 sur `origin/main`
> (`5ac6f95`)**, et non de l'état du 2026-09-05.

### A. Ce qui est DÉJÀ LÀ — L6 le consomme, il ne le réécrit pas

| Acquis (mesuré le 2026-09-09)                                                                                                                                                                                                                              | Ce que L6 en fait                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Le contrat d'ops** — `packages/shared/src/sync.ts` : `operationSchema`, `lotPushSchema`, `reponsePushSchema`, `reponsePullSchema`, `RESULTATS_OP` (5), `ENTITES_SYNC` (5), `ENTITES_DESCENDANTES`, `TAILLE_LOT_PUSH_MAX = 100`, `ECHECS_AVANT_EXAMEN = 10` | **Il l'implémente.** Le modifier est une escalade 11 §8-2 — pas une correction de parcours                                                                            |
| **Le port inerte** — `local/port-sync.ts` : `PortSync` (`synchroniserMaintenant`, `etat`), `EtatSyncMission`, `ResultatSync`, `evaluerAlerteSauvegarde`, `DELAI_ALERTE_SANS_SYNC_MS`                                                                        | **L6a REMPLACE l'implémentation**, ne redéfinit ni l'interface ni la fonction pure d'alerte                                                                           |
| **La lecture de l'outbox** — `local/depots/outbox.ts` : `operationsEnAttente`, `compterParStatut`, `prochainLot`, `aTraiterParUnHumain` ; index `[statut+opId]` posé en `SCHEMA_LOCAL` v1                                                                   | **L6a draine par `prochainLot`.** L'écriture de la file appartient à `ecriture.ts` (L5a) et n'est pas rouverte                                                        |
| **Les trois tables serveur** — `db/schema.ts` : `attachment_uploads` (l. 663), `processed_ops` (l. 1009), `sync_log` (l. 1016) ; migrations `0007_transverse.sql`, `0013_sync_colonnes_manquantes.sql`                                                      | **L6 n'écrit AUCUNE migration.** Il leur donne leur premier écrivain applicatif — toucher au 04 serait une escalade 11 §8-2                                           |
| **La clé de dernier succès** — `CLES_META.prefixeDerniereSyncReussie = 'sync:dernier-succes:'`, `cleDerniereSyncReussie()` (`local/base.ts:155,180`), lue par `agenda/jour.ts:133`, livrée par L5e                                                          | **L6a l'ÉCRIT** (A-10). Elle existe, elle est lue, personne ne l'écrit : c'est un manque d'écrivain, jamais un manque de clé                                          |
| **La descente et l'horloge** — `appliquerDescente` (`local/ecriture.ts`, seul point d'entrée, n'écrit jamais l'outbox), `reglerDecalage` (`local/horloge.ts:45`)                                                                                            | L6b **traduit avant d'appeler** ; il ne fait pas de `ecriture.ts` un client HTTP (PD6 : rien à réparer)                                                               |

**Corollaire de placement, tranché ici.** `DECISIONS.md` du 2026-09-09 (D-4) laisse
`apps/field/src/ecrans/**` **hors** du seuil bloquant de 90 % (module observé, non bloquant), alors
que `apps/field/src/sync/**` y entre. **Toute décision — backoff, comptage, verdict d'alerte,
traduction de résultat — vit donc sous `apps/field/src/sync/**` ; `ecrans/sync/**` ne fait que
rendre.** Un verdict calculé dans un composant sortirait du seuil sans qu'aucune garde ne le dise.

### B. Ce que L6a doit livrer EN PREMIER GESTE — commit « L6a-0 », ~0,2 j

Trois gestes qui ne dépendent d'aucune ligne de moteur, et que d'autres attendent déjà :

1. **L'écrivain de `cleDerniereSyncReussie(missionId)`** (A-10) — après chaque **push abouti**,
   **jamais depuis `appliquerDescente`**. Le cockpit affiche « jamais synchronisée » aujourd'hui, et
   continuera tant que personne n'écrit. Avec, dans le même commit, **la garde d'A26** qui croise les
   deux artefacts : la clé écrite par le moteur est celle que `construireJournee` lit, et un pull
   seul ne l'écrit pas.
2. **R2 d'A29 (`REVUE_A29_L5E_2026-09-09.md`), datée et assignée à L6a.**
   `app/EcranAccueil.tsx:195-214` dérive l'alerte de l'invariant 8 de `portSyncInerte.etat()`, qui
   passe **`null` en dur** à `evaluerAlerteSauvegarde` (`local/port-sync.ts:167`), pendant que le
   cockpit la dérive de `meta`. Invisible aujourd'hui, **contradictoire dès le premier push réussi**.
   L6a le clôt **en remplaçant le port** : l'implémentation réelle lit `meta` et ne code plus `null`.
   Non-régression exigée, écrite par A26 : **les deux écrans rendent le MÊME verdict** après un push.
3. **Les deux globs de `.github/coverage-critical-paths.json`** passent de `cheminsAttendus`
   (« non livre ») à `cheminsCritiques` — **dans le commit qui crée le premier fichier de
   `apps/field/src/sync/` ou `apps/api/src/sync/`**, jamais après. Un seuil armé après le code est un
   seuil qu'on ajuste au code.

Ces trois gestes se signent ensemble. Tant qu'ils ne sont pas verts, **aucune ligne de push n'est
écrite** : ce sont eux qui rendent le reste mesurable.

### C. Les trois incréments

#### C.1 — L6a « la montée » — 2,0 j

**Périmètre, en une phrase** : l'appareil parle au siège pour la première fois du projet, et ce qu'il
envoie est appliqué une fois, une seule, et seulement par son propriétaire.
**Ce qu'il ne fait pas** : aucune descente (L6b), aucun octet de pièce jointe (L6c), aucune surface
d'écran nouvelle — il ne fait que corriger l'existante (R2).

| Côté        | Fichiers TOUCHÉS (**N** nouveau · **M** modifié)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client**  | **N** `field/src/sync/transport.ts` (Bearer, refresh rotatif, 401, §31-3) · **N** `sync/moteur.ts` (déclencheurs, drainage, lots de 100) · **N** `sync/montee.ts` (déchiffrement d'op + mapping PD2) · **N** `sync/port.ts` (l'implémentation de `PortSync`) · **M** `app/EcranAccueil.tsx` (R2 : injection du port réel) · **M** `local/contrat-sync.ts` (import par le baril, étage 1) · **M** `.github/coverage-critical-paths.json` · **M** `AMELIORATIONS.md`               |
| **Serveur** | **N** `api/src/sync/routes.ts` (`POST /v1/sync/push`) · **N** `sync/service.ts` (contrat §9.3) · **N** `sync/depot.ts` (`processed_ops`, `answer_revisions`, `sync_log`) · **N** `sync/proprietaire.ts` (les trois résolveurs PD4) · **M** `api/src/app.ts` (enregistrement sous `/v1`)                                                                                                                                                                                          |

**Fichiers qu'il NE touche PAS — c'est ce qui autorise ou interdit de paralléliser** :
`packages/shared/src/sync.ts` (gelé) · `apps/api/src/db/schema.ts` et `apps/api/drizzle/**` (les
trois tables existent → **zéro migration en L6a**) · `apps/field/src/local/base.ts` (`CLES_META` est
déjà pourvue par L5e → **aucune montée de `VERSION_SCHEMA_LOCAL`**) · `local/ecriture.ts` ·
`local/coffre*.ts` et `local/enveloppe.ts` (crypto locale — 11 §8-4) · `session/**` ·
`ecrans/entretien/**` · `sauvegarde/**` · `apps/hq/**`.

**Porteurs** : **A25** transport + moteur terrain · **A23** réception serveur (`processed_ops`,
§9.9, `sync_log`). **Tests (09 §5.6 — jamais l'auteur)** : **A26** unitaires terrain, garde
cockpit ↔ moteur (A-10), non-régression R2 · **A27** intégration serveur, propriété §9.9 exhaustive
**dont la note volante non rattachée, qui doit finir `applied`** (PD4, 04 S-3).

**Scénarios §9.8 dont il porte le MÉCANISME** : **1** (coupure en pleine saisie — drainage et
backoff), **2** (kill pendant un push — statut d'op persistant, reprise de file), **3** (double envoi
— `processed_ops` + upsert par `entityId`), **5** (deux appareils — `superseded` + archive
`answer_revisions` **sur les trois entités**, S-4), **8** (refresh expiré — §31-3, la collecte
continue). Scriptés Playwright en L6c ; **le mécanisme se prouve ici, en intégration.**

**Critère de fin d'incrément — mesurable** : `pnpm verify` vert · couverture **≥ 90 % sur les QUATRE
métriques** des deux globs (`functions` surveillée nommément) · un test d'intégration qui **rejoue
3× le même lot** et compare l'état ligne à ligne (**C2 du 07**) · un test qui prouve `sync_log`
écrit **par le chemin applicatif** avec `outbox_remaining` — et non par la fixture de L2, verte par
construction (B3) · la garde A26 sur la clé de dernier succès · **les deux écrans, même verdict**
après un push réussi (R2).

#### C.2 — L6b « la descente, et ce qui se voit » — 1,2 j

**Périmètre** : le siège redescend son delta, l'appareil s'y réaligne, et l'auditeur voit sans mentir
où en est sa file.
**Ce qu'il ne fait pas** : aucune pièce jointe, aucune règle de propriété nouvelle (elle est serveur,
elle est à L6a), et **il ne répare rien dans `ecriture.ts`** — PD6 est périmé (A-7).

| Côté        | Fichiers TOUCHÉS                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client**  | **N** `field/src/sync/descente.ts` (serveur → formes locales, puis `appliquerDescente`) · **N** `sync/backoff.ts` (exponentiel **borné à 60 s**, 10e échec → « à examiner ») · **N** `ecrans/sync/**` (file en attente, « à examiner », ops rejetées, « n réponse(s) arbitrée(s) » cliquable) · **M** `sync/moteur.ts`, `sync/port.ts` · **M** `app/EcranAccueil.tsx` et `ecrans/journee/EcranAujourdhui.tsx` (pastille — raccordement, pas de calcul) |
| **Serveur** | **M** `api/src/sync/routes.ts` (`GET /v1/sync/pull`), `sync/service.ts`, `sync/depot.ts` (curseur, `serverTime`, ligne `sync_log` `pull`)                                                                                                                                                                                                                                                                                                            |

**Fichiers qu'il NE touche PAS** : `local/ecriture.ts` (PD6) · `local/base.ts` · `packages/shared/**`
· `db/schema.ts` et `drizzle/**` · `session/**` · `apps/hq/**`.

**Porteurs** : **A25** descente et backoff · **A22** surfaces visibles · **A23** route de pull.
**Tests** : **A26** descente, backoff, horloge · **A27** pull delta en intégration · **A28**
axe-core, 4 états, budget p95.

**Scénario §9.8 dont il porte le MÉCANISME** : **4** (horloge locale +3 h — `serverTime` →
`reglerDecalage`, PD7 ; le `client_updated_at` reste posé au seul port d'écriture).

**Critère de fin d'incrément — mesurable** : deux pulls consécutifs sans changement serveur = **zéro
écriture locale**, curseur stable · backoff **borné à 60 s**, prouvé sur horloge simulée · 10e échec
→ « à examiner » **visible** · **4 états** (03 §33.2) sur chaque surface de statut · axe-core vert,
**au plus UN `role="alert"` par écran**, le reste en `role="status"` et visible · **aucune couleur ni
taille en dur**, l'alerte au rouge distinct du terracotta · **p95 des interactions < 100 ms** (le
statut lit le local, jamais le réseau) · une ligne `sync_log` `direction = 'pull'` écrite par le
chemin applicatif.

#### C.3 — L6c « les octets, et la preuve » — 1,8 j

**Périmètre** : la photo monte en morceaux et reprend là où elle s'est arrêtée ; les huit scénarios
deviennent des tests qui tournent à chaque commit.
**Ce qu'il ne fait pas** : il **ne produit pas les octets** — la chaîne photo locale (table binaire
dans `SCHEMA_LOCAL`, capture depuis l'appareil, compression) est **L5f**, qui **n'est pas ouvert**
(voir D10, qui est aujourd'hui le vrai risque de ce lot).

| Côté        | Fichiers TOUCHÉS                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client**  | **N** `field/src/sync/chunks.ts` (découpe 5 Mo, `status` → n'émettre que les manquants, `complete {sha256}`) · **M** `sync/moteur.ts` (les pièces jointes APRÈS les données, §9.6)                     |
| **Serveur** | **N** `api/src/sync/chunks.ts` (idempotence par couple `id+index`, assemblage, vérification sha256, **409 + liste des chunks à réémettre**) · **M** `api/src/sync/routes.ts` (les trois routes §9.6)  |
| **Tests**   | **N** `e2e/sync-l6.e2e.ts` (les **huit** scénarios, `@critique`) · **M** le fil rouge existant sous `e2e/` (allongé : sync + rejeu idempotent) · **N** le script k6                                    |

**Fichiers qu'il NE touche PAS** : tout `apps/field/src/local/**` · `packages/shared/**` ·
`db/schema.ts` et `drizzle/**` (`attachment_uploads` existe) · et **MinIO n'est jamais exposé**
(PD8) : aucun code d'URL présignée, tout passe par l'API.

**Porteurs** : **A25** chunks client · **A23** chunks serveur. **Tests** : **A26** les huit scénarios
Playwright et la reprise à 80 % · **A28** k6, a11y, budgets.

**Scénarios §9.8** : il porte le MÉCANISME de **6** (5 000 réponses + 200 photos — l'envoi) et **7**
(reprise à 80 %), et il **SCRIPTE LES HUIT** — 1 à 8, sans exception. Aucun orphelin : 1, 2, 3, 5 et
8 viennent de L6a ; 4 de L6b ; 6 et 7 d'ici, sur des octets fournis par **L5f** (chaîne photo).

**Critère de fin d'incrément — mesurable** : **8/8 `@critique` verts**, rejoués à chaque commit ·
reprise prouvée par bascule (on coupe à 80 %, `status` ne rend que les manquants, `complete` valide
le sha256, un sha256 faux rend **409 + la liste**) · **k6 50 clients × 1 000 ops, p95 < 500 ms** ·
**`@filrouge` vert sur FIL-TPE ET FIL-GC** · couverture ≥ 90 % maintenue sur les deux globs · README
de l'app à jour.

### D. La somme ne tient PAS dans le reste — et c'est le fait à porter à P-DESCOPE

**2,0 + 1,2 + 1,8 = 5,0 j-h** (les 0,2 j du commit L6a-0 compris), pour un budget 07 de **4,5 j** et
un **restant annoncé de 4,3 j**. **Je ne fais pas tenir l'estimation** : l'écart est de **+0,5 j sur
le budget du 07** et de **+0,7 j sur le restant**.

Et il y a plus lourd, mesuré ce jour, et qui doit se dire : **L5f (chaîne photo) n'est pas ouvert.**
`VERSION_SCHEMA_LOCAL` vaut **1**, `SCHEMA_LOCAL` ne porte **aucune table binaire**, `compresserPhoto`
n'a **aucun appelant de production** (seul son propre test l'appelle), et le seul
`<input type="file">` du dépôt est celui de la **restauration** (L5c). La séquence arbitrée par A01
(A-4) étant **L5c → P-C → L5f → L6a → L6b → L6c**, il faut encore ajouter **≈ 0,5 j de L5f** avant la
première ligne de L6a. **Total réel à placer : ≈ 5,5 j dans 4,3 j.**

Ce que cela veut dire — sans le décider, le descope appartient à Williams, à P-DESCOPE du 15/09 :

- **Ce qui ne peut pas tomber** : les huit scénarios `@critique` (07, jamais skippables), la reprise
  à 80 % (critère nommé C3), le contrat §9.3 complet, la propriété §9.9, `processed_ops`. Rogner
  l'un d'eux, c'est rogner « zéro donnée perdue » — l'objet même du lot.
- **Ce qui peut se discuter, dans cet ordre** : ① la **charge k6** (C4, p95 < 500 ms) — un budget de
  performance, pas une garantie de non-perte ; il se rejoue après P-D sans rien invalider ;
  ② l'**affinage visuel** des surfaces de statut de L6b, ramené au strict nécessaire des 4 états ;
  ③ **L5f (chaîne photo)** — et alors les scénarios **6** et **7** tombent avec lui, mais **7 est un
  critère d'acceptation nommé du 07** : ce troisième cran est un **descope de porte**, pas un
  aménagement.
- **Ce que je recommande** : ouvrir **L6a le jour même de P-C**, sans attendre L5f, **si et seulement
  si** A01 accepte que L5f s'intercale entre L6b et L6c (option 3 de la décision du 2026-09-05, alors
  écartée). Le motif du refus tenait au schéma local — L5f monte `VERSION_SCHEMA_LOCAL` — mais L6a et
  L6b, **tels que découpés ci-dessus, ne touchent PAS `local/base.ts`** : la collision de fichiers
  redoutée n'existe plus dans ce découpage. C'est une **ré-ouverture de décision, pas une décision** :
  elle appartient à A01, et elle s'écrit en D10.

> **Où ce §D se place par rapport à D-1 bis d'A01 (`PORTE_DESCOPE_2026-09-15.md`, 2026-09-09), et où
> il en diverge.** A01 a repris les chiffres de ce §D **sans les modifier** — 5,0 j (L6) + 0,5 j
> (L5f) = **≈ 5,5 j dans 4,3 j annoncés**, écart **≈ +1,2 j**, et **+0,5 j** sur le budget 07 de
> 4,5 j. Aucun écart de mesure entre les deux documents. **Deux écarts de forme, que je dis au lieu
> de les aligner en silence :**
>
> 1. **Ma liste ci-dessus n'est pas la liste d'options de la porte.** A01 en porte trois — **α**
>    absorber les ≈ 1,2 j, **β** retirer la campagne k6 de L6c, **γ** reporter L5f en Phase 2 — et
>    recommande **β puis α**, en **refusant de recommander γ** parce qu'elle fait tomber un critère
>    d'acceptation nommé du 07 (scénario 7). Mon cran ① **est** son β, mon cran ③ **est** son γ, et
>    nos deux refus coïncident. **Ce que ma liste omettait : l'absorption (α)** — je présentais trois
>    crans à rogner sans jamais dire que ne rien rogner et laisser P-D glisser d'environ une journée
>    et demie est une option, et la moins destructrice après β. C'est corrigé ici.
> 2. **Mon cran ② n'existe pas chez A01, et je le maintiens en le bornant.** « Affinage visuel »
>    ne veut pas dire moins que la DoD : **les 4 états, axe-core vert, les tokens et le p95 < 100 ms
>    ne se négocient pas** (CLAUDE.md §5). Ce que ce cran recouvre est le **soin** au-delà de ce
>    plancher, il vaut au plus ≈ 0,2 j, et il ne se chiffre pas comme une option de porte. **Si
>    Williams lit une liste d'options, c'est celle d'A01 qui fait foi ; la mienne est le détail
>    technique de ce qu'elles coûtent.**
>
> **Ce qui décide reste au-dessus de moi** : le descope appartient à Williams (CLAUDE.md §3), et
> l'ordre des incréments à A01 (D10). Ce §D ne fait tenir aucun chiffre.

### E. Cinq doutes de spec — à ouvrir dans `DECISIONS.md`, jamais devinés

- **D6** _(entrée de L6a)_ : **§9.3 ne dit pas ce que fait le client d'un lot PARTIELLEMENT en
  échec** — une réponse qui mêle `applied` et `error`. Passe-t-il au lot suivant, ou s'arrête-t-il ?
  « Dans l'ordre de la file » est une garantie qu'on brise en sautant une op. Proposition : la file
  avance, les `error` restent et repartent après backoff, **l'ordre relatif des ops portant sur la
  MÊME `entityId` étant préservé** — sans quoi une correction peut doubler sa création.
- **D7** _(entrée de L6b)_ : **le pull delta n'est pas paginé.** §9.5 ne connaît que `?since=`, quand
  11 §3 impose la **pagination keyset PARTOUT** : deux conventions du pack se contredisent sur une
  seule route, et le scénario 6 (5 000 réponses) la traverse — une réponse unique de cette taille est
  un risque mémoire sur iPad. Proposition : keyset **en plus** du curseur (`?since=&limit=&after=`),
  le curseur n'avançant qu'à la **dernière** page — sinon une coupure en milieu de descente ferait
  sauter le reste du delta pour toujours.
- **D8** _(entrée de L6c)_ : **aucune règle de rétention n'est écrite pour `attachment_uploads`.**
  Un upload jamais complété (appareil perdu, mission close) laisse ses chunks dans MinIO
  indéfiniment. Proposition : purge des uploads incomplets au-delà de 7 jours, journalisée.
- **D9** _(entrée de L6b)_ : **la notification « n réponse(s) arbitrée(s) » est dite CLIQUABLE**
  (§9.3) et **aucune vue de destination n'est spécifiée**. Proposition : une liste minimale, en
  lecture seule, des lignes arbitrées de la mission — ou, si c'est un écran, une fiche
  `AMELIORATIONS.md` d'étage 2, jamais une invention en cours de lot.
- **D10** _(gouvernance, ouvert par la mesure du jour)_ : **L5f (chaîne photo) n'est pas ouvert et le
  calendrier ne le porte plus.** La séquence A-4 le place avant L6a ; le découpage ci-dessus montre
  que L6a et L6b ne touchent pas `local/base.ts`. **A01 rouvre-t-il l'arbitrage du 2026-09-05
  (option 3 : L5f entre L6b et L6c) ?** À trancher **avant l'ouverture de L6a**.

> **Avis motivé d'A20 sur D10 — 2026-09-09, à la demande d'A01 (renvoi « à la fusion de la PR 114,
> avant l'ouverture de L6a » ; cette PR est fusionnée). Je ne tranche pas : l'ordre des incréments
> est un arbitrage technique, donc celui d'A01. Je lui donne ce qui manquait à son refus de
> trancher sur un `grep`.**
>
> **Je lui donne d'abord raison sur un point** : l'`outbox` en base locale v1 (`local/base.ts:220`)
> ne répond **pas** au motif de 2026-09-05. Qu'une table existe déjà ne dit rien de ce qu'une montée
> v1 → v2 fait à un appareil qui porte de la donnée. La prémisse que j'avais avancée prouve
> l'absence de **collision de fichiers**, pas l'absence de **risque de migration**. Ce sont deux
> questions, et j'avais répondu à la mauvaise.
>
> **Deux faits qui, eux, portent sur la bonne — et le premier renverse le sens du risque.**
>
> 1. **Avant L6a, aucun appareil n'a de route vers le siège.** Le seul filet d'un appareil qui porte
>    de la donnée réelle est l'**export de secours chiffré manuel** de L5c. Une migration locale qui
>    échoue à ce moment-là se répare à la main, appareil par appareil. **Après L6a + L6b, le même
>    appareil se draine (push) AVANT de migrer**, et la donnée existe au siège. Si le critère est
>    « protéger la donnée réelle sur des appareils réels », alors intercaler L5f **après** L6b est
>    **plus sûr**, pas moins : le motif de 2026-09-05, examiné, pointe dans l'autre sens.
> 2. **La migration de L5f est ADDITIVE par nature** : elle ajoute une table binaire à
>    `SCHEMA_LOCAL` (une liste d'étapes, `base.ts:233`), elle ne transforme aucun magasin existant,
>    ne relit ni ne réécrit une réponse. Ce n'est pas le même objet qu'une migration qui réécrirait
>    `answers`. **Mais ce n'est vrai que si L5f est écrit ainsi** — ce n'est pas une constatation,
>    c'est une contrainte à imposer.
>
> **Le contre-argument que je refuse de cacher, et qui est le plus fort contre D10 :** placer L5f en
> dernier en fait la **variable d'ajustement de fait**. À 5,5 j dans 4,3, c'est le dernier incrément
> avant P-D qui se fait comprimer — et alors **γ arriverait par dérive au lieu d'arriver par
> arbitrage** : les scénarios 6 et 7 tomberaient sans que personne l'ait décidé, sur un critère
> nommé du 07. La séquence du 2026-09-05, elle, rend ce glissement **impossible par construction**.
>
> **Ma recommandation, donc, est conditionnelle, et les conditions sont le prix du oui :**
> ① L5f **strictement additif** — aucune transformation de magasin existant, avec un test qui ouvre
> une base v1 **portant des données**, applique la montée et **relit les mêmes enregistrements** :
> critère de fin d'incrément, pas une intention ; ② les **0,5 j de L5f datés et réservés au
> calendrier au moment même de l'arbitrage**, avant l'ouverture de L6a — sans cela ma réponse est
> **non**, parce que le §D montre qu'il n'y a pas de place pour un incrément « qu'on fera à la fin ».
>
> **Et une remarque d'honnêteté sur ce que D10 achète.** Il ne fait **gagner aucune journée** : 5,5 j
> restent 5,5 j, il ne change que l'ordre. Son seul gain est de permettre d'ouvrir L6a le jour de
> P-C, plus un bénéfice réel mais secondaire — L5f écrit après L6a connaîtrait la forme exacte de
> l'op de pièce jointe qu'il doit mettre en file. Or **P-C n'est pas signée** et attend une
> demi-journée matérielle : l'urgence qui motivait D10 est, aujourd'hui, moindre que le jour où je
> l'ai écrit. **Si le descope retient α ou β, garder la séquence du 2026-09-05 est le choix le plus
> sûr et il ne coûte presque rien. Décision : A01.**

**Contrôle A02 du 2026-09-05 — état des cinq bloquants au 2026-09-09.** **B1** levé par A-1 (PD4,
trois résolveurs, 04 S-3 cité) · **B2** levé par A-2 (le transport entre à L6a, §3bis, porteur A25) ·
**B3** levé par A-3, **et sa preuve est nommée ici** — critère de fin de L6a : `sync_log` écrit par
le chemin applicatif, pas par la fixture · **B4** levé par A-4 **sur le papier**, mais **sa prémisse
a bougé** : L5f n'est toujours pas ouvert (D10) · **B5** levé par A-5 (`apps/api/src/sync/`, un seul
glob pour les deux moitiés). **5/5 levés dans la note ; un seul, B4, appelle une re-décision de
séquencement.**

**Signature A-11 :** A20 — découpage de L6 en incréments commitables, 2026-09-09, **avant P-C et
avant toute ligne de code L6**. À contresigner A01 (D10 et le dépassement du §D) + A02.

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
| **C3** — reprise d'upload interrompu à 80 %    | **L6c** — chunks §9.6 + `attachment_uploads` ; octets fournis par **L5f**    | A26                           |
| **C4** — 50 clients × 1 000 ops, p95 < 500 ms  | **L6c** — k6                                                                 | A28                           |

| #   | Scénario §9.8                                        | Incrément porteur du MÉCANISME                                                                         | Test            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------- |
| 1   | coupure réseau en pleine saisie                      | **L6a** — transport (A-2), drainage, backoff ; l'atomicité d'écriture est déjà livrée (L5a)             | L6c / A26       |
| 2   | kill de l'app pendant un push                        | **L6a** — statut d'op persistant, reprise de file, `processed_ops`                                      | L6c / A26       |
| 3   | double envoi du même lot                             | **L6a** — `processed_ops` + upsert par `entityId`                                                       | L6c / A26       |
| 4   | horloge locale +3 h                                  | **L6b** — `serverTime` → `reglerDecalage` (PD7)                                                         | L6c / A26       |
| 5   | deux appareils sur la même mission                   | **L6a** — `superseded` + archive `answer_revisions` **sur les trois entités** (S-4)                     | L6c / A26 + A27 |
| 6   | 5 000 réponses **+ 200 photos** en file              | **L5f** (chaîne photo locale) → **L6a** (lots de 100) → **L6c** (envoi)                                 | L6c / A26       |
| 7   | reprise d'upload interrompu à 80 %                   | **L5f** (octets) → **L6c** (chunks §9.6 + `attachment_uploads`)                                         | L6c / A26       |
| 8   | expiration du refresh token en mission longue (§31-3) | **L6a** — transport authentifié : refresh rotatif, 401 hors ligne, message §31-3, collecte qui continue | L6c / A26       |

**8/8 portés.** Les scénarios 6 et 7 dépendent de **L5f** — la chaîne photo, **non ouverte** — ce
qui est exactement pourquoi la séquence du §2 la place **avant** L6a, et ce que D10 rouvre.

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

**Signature A-12 :** A20 — 2026-09-09, application du renommage arbitré par A01 (`L5d` chaîne photo
→ **`L5f`** ; l'incrément fusionné garde `L5d`), **plus** trois choses qui ne sont pas du renommage
et qui appellent une contresignature : la **confrontation de la séquence du §2 au réel** (L5d et L5e
fusionnés avant P-C, P-C non signée), le **placement du §D par rapport à D-1 bis d'A01** (mon cran ②
maintenu et borné, l'option α que j'avais omise), et mon **avis motivé sur D10**, qui reste à A01.
