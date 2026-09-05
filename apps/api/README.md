# @axion/api — API REST `/v1`

Fastify 5 sur Node 22, PostgreSQL 16 via Drizzle. **Seul point d'entrée aux données** (02 §4.3-2) :
la PWA terrain et la console consomment la même API.

## État au lot L3

Le **schéma** est livré : 43 tables, transcrites LITTÉRALEMENT de `docs/04_MODELE_DE_DONNEES.md` en
SQL brut versionné (`drizzle/*.sql`, numérotées séquentiellement), plus le seed des référentiels et le compte fondateur.
Le lot **L2** ajoute les premières routes métier : authentification, cadrage financier, comptes.
Le lot **L3** ajoute **21 routes** — référentiel client, missions et leur machine à états (§32.2),
arbre organisationnel et import CSV (§35.2), questionnaire figé (M2), plan d'entretiens (§32.4),
affectations et réaffectation (§34.4) — et **une migration**, `0014` (`interviews.conducted_by`
nullable, amendement du 04 tranché par Williams). Voir la section « Lot L3 » ci-dessous.

## Routes exposées

| Route                  | Rôle                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`       | **Vivacité** — ne touche aucune dépendance. Docker redémarre le conteneur si elle échoue.                                                |
| `GET /v1/health/ready` | **Préparation** — PostgreSQL (**critique**, `503` si absent), Redis et MinIO (**dégradants**, `200 degraded`). Exemptée du quota global. |

Ces deux routes ne figurent pas aux §8/§24.2 du pack (qui décrivent les routes métier) : elles sont
documentées ici au titre du 11 §8.6. Elles n'exposent ni version, ni nom d'hôte, ni détail d'erreur.

**Pourquoi deux sondes** : les confondre ferait redémarrer en boucle une API dont seule la base est
momentanément indisponible. Le remède deviendrait la panne.

### Comptes — `/v1/users` (lot L2/T3, **`admin` exclusivement**)

Le pack écrit « CRUD users » sur une ligne et ne nomme qu'**une** de ces routes : `GET /v1/users`.
Les six autres sont documentées ici au titre du 11 §8.6, et leur forme est tranchée par deux entrées
`DECISIONS.md` — 2026-08-30 « Le CRUD users n'est pas spécifié : onze silences » et 2026-08-31
« Comment un mot de passe se réinitialise ».

| Route                                | Rôle                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/users`                      | Liste **paginée en keyset**, curseur `(created_at, id)` ascendant. Aucun filtre (le pack n'en nomme aucun).                 |
| `POST /v1/users`                     | Création (`201`). Le compte naît **actif** et **non habilité** (§34.4) ; `usageProfile` vaut `guide_strict` par défaut.     |
| `PATCH /v1/users/:id`                | Modification ordinaire : `name`, `email`, `usageProfile`. Rien d'autre.                                                     |
| `PATCH /v1/users/:id/role`           | Change `users.role`. Refusée **sur son propre compte**.                                                                     |
| `PATCH /v1/users/:id/deactivate`     | §34.4 — désactive le compte **et révoque ses jetons de rafraîchissement**, même transaction. Refusée sur son propre compte. |
| `PATCH /v1/users/:id/habilitate`     | §34.4 — pose `habilitated_at`. Ne réécrit **jamais** une habilitation déjà prononcée (invariant 7).                         |
| `PATCH /v1/users/:id/password-reset` | Mot de passe **engendré par le serveur et rendu une seule fois**. Garde-fou 05 §9.7 — voir ci-dessous.                      |

**Il n'y a pas de `DELETE`**, et c'est délibéré : le « D » de CRUD n'est jamais instancié par le pack,
`users` n'a pas de `deleted_at` (04), et le cycle de sortie §34.4 dit « révocation + retrait des
`mission_users` ». Il n'y a pas non plus de **réactivation** : le catalogue du journal ne connaît que
`user.deactivate` — la question est remontée, pas devinée.

**Quatre actes, quatre routes.** `role`, `deactivate`, `habilitate` et `password-reset` ne sont pas
des champs d'un `PATCH` générique parce que `activity_log` distingue déjà `user.role_change`,
`user.deactivate`, `user.habilitate` et `user.password_reset`. Les fondre rendrait le journal
incapable de **nommer** ce qui s'est passé, contre l'invariant 7.

**Le garde-fou 05 §9.7, sur `password-reset`.** La clé locale de l'appareil terrain (KEK) dérive du
mot de passe : le réinitialiser rend **définitivement illisible** tout ce que l'outbox n'a pas encore
poussé. Le serveur **refuse** donc tant que le dernier `sync_log.outbox_remaining` d'un appareil du
compte est `> 0`, **ou qu'aucune sync n'est connue** — code d'erreur dédié
**`UNSYNCED_DATA_AT_RISK` (409)**, et non `CONFLICT`, pour que la console sache qu'un forçage est
possible et le propose. `PATCH … {"force": true}` passe outre ; l'acte est alors journalisé
`user.password_reset` avec `forcage: true`, et une trace d'exploitation
`reinitialisation_mot_de_passe_forcee` est émise en `warn`.
⚠ Un compte **neuf** n'a aucune ligne de `sync_log` : sa première réinitialisation exige donc
toujours un forçage. C'est ce que le §9.7 écrit (« ou aucune sync connue »).

**Ce que ce README ne couvre pas encore.** Les routes d'authentification
(`POST /v1/auth/login`, `/refresh`, `/logout`, lot L2/T2) et `GET /v1/scoping/:id/financials`
(lot L2/T5) sont livrées et **absentes de ce document**. L'omission est antérieure à T3 et n'est pas
corrigée ici — elle est remontée au rapport du lot plutôt que comblée par un agent qui n'a écrit
aucune de ces routes.

## Lot L3 — référentiel client, missions, arbre, questionnaire, plan d'entretiens

Le brief du lot est la ligne L3 du fichier 07 : « API missions/companies (dédup SIREN R3, NAF→secteur
R4) · machine à états mission §32.2 · arbre `org_units` — import CSV, `kind` jusqu'à `poste`, statuts
proposée/fusionnée · moteur questionnaire M2 · plan d'entretiens §32.4 · prévisualisation §33.4 ».
Quatre incréments (L3a à L3d), **21 routes**, **aucun écran**, **une migration** (`0014`).

### Politique d'accès — ce qui vaut pour tout le lot

- **`admin` seul sur 19 routes sur 21**, lecture comprise. Ce n'est pas une lecture directe du pack
  (§34.3 donne au lead le pouvoir de qualifier les unités et d'ajuster les affectations) mais
  l'application de 03 §34.1 « la console est ADMIN SEUL en V1, le lead y entre en Phase 2 » —
  `DECISIONS.md` 2026-08-31 (référentiel client), 2026-09-01 (arbre) et 2026-09-02 (affectations).
  Le consultant membre lit l'arbre et le questionnaire de sa mission **par le pull de sync** (05 §9.5,
  lot L6), pas par ces routes. Les deux exceptions sont `GET …/interview-plan` (cadrée par mission,
  §18.3) et `PATCH /v1/interviews/:id/reassign` (`admin` ou `consultant`, « lead de cette mission »
  vérifié dans le service).
- **Deux refus, deux codes** (`DECISIONS.md` 2026-09-02) : refusé sur le **rôle** par le crochet
  d'autorisation, avant toute lecture → **403** (le serveur ne sait pas encore si la mission existe,
  il ne divulgue rien) ; refusé sur l'**appartenance** par le dépôt, après lecture → **404** (l'existence
  de la mission n'est pas divulguée). Un consultant non membre reçoit donc 403 sur `assignments` et
  404 sur `interview-plan` et `reassign`.
- **Aucune route ne touche `scoping_financials` ni `scoping_estimates`** (invariant 3). Le plan
  d'entretiens dit combien d'entretiens, jamais combien ils coûtent.
- **Aucun `DELETE`**, sur aucune ressource : le « D » de CRUD n'est instancié nulle part par le pack.
  `companies` et `missions` ont un `deleted_at` au 04 mais aucune section ne dit ce qu'une
  suppression ferait des missions, arbres et questionnaires qui en dépendent ; `org_units` n'en a même
  pas. Le geste prévu à la place est la **sortie de périmètre** (`inScope: false`, §25.1), par le
  `PATCH`. Créer ces routes est une décision de produit, remontée, pas une convention.
- **`HEAD` compagnes** : Fastify enregistre d'office un `HEAD` pour chaque `GET` (7 ici). Elles
  héritent de `config.acces` et sont protégées ; elles ne sont écrites dans aucun fichier.

### Les 21 routes

Les schémas nommés vivent dans `@axion/shared` ; les listes rendent `{ items, nextCursor }` sur
`?limit=&after=` (curseur opaque, non signé, **ascendant**). Les refus communs — `400
VALIDATION_FAILED` (Zod), `401`, `403`, `404 NOT_FOUND` — ne sont pas répétés ligne à ligne.

| Route                                          | Accès             | Entrée → Sortie                                                                               | Curseur · refus propres                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/companies`                            | admin             | — → `companyResponseSchema[]`                                                                 | `(name, id)` — l'ordre alphabétique, celui dans lequel on cherche une fiche                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `POST /v1/companies`                           | admin             | `createCompanyRequestSchema` → **201** `companyWriteResponseSchema`                           | **409 `COMPANY_DUPLICATE`** sur un SIREN déjà pris · **409 `COMPANY_EXTERNAL_REF_DUPLICATE`** sur une `externalRef` déjà prise (`uq_companies_external_ref`, migration `0015`) — les deux décidés par un index unique partiel, jamais par une lecture préalable ; **les deux** nomment la fiche ARCHIVÉE en conflit (elle conserve son SIREN comme sa référence console, invariant 7) et orientent vers sa restauration ; `details[0].code ∈ { fiche_active, fiche_archivee }` sur les deux — statut et `error.code` garantis, `details` au mieux (absent si la fiche a disparu entre la violation et la relecture) |
| `GET /v1/companies/:id`                        | admin             | — → `companyResponseSchema`                                                                   | 404 si supprimée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `PATCH /v1/companies/:id`                      | admin             | `updateCompanyRequestSchema` → `companyWriteResponseSchema`                                   | les MÊMES deux 409 que le `POST` (`COMPANY_DUPLICATE`, `COMPANY_EXTERNAL_REF_DUPLICATE`) — même traduction de contrainte, dans le dépôt ; rejoue R3/R4                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GET /v1/missions`                             | admin             | — → `missionResponseSchema[]`                                                                 | `(created_at, id)`, même forme et même sens que `GET /v1/users`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `POST /v1/missions`                            | admin             | `createMissionRequestSchema` → **201** `missionCreationResponseSchema`                        | crée la mission **et sa racine** en une transaction ; `status` refusé dans le corps (400)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GET /v1/missions/:id`                         | admin             | — → `missionResponseSchema`                                                                   | 404 si supprimée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `PATCH /v1/missions/:id`                       | admin             | `updateMissionRequestSchema` → `missionResponseSchema`                                        | `status` et `companyId` refusés dans le corps (400) — la machine à états n'a qu'une porte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /v1/missions/:id/status`                 | admin             | `missionStatusRequestSchema` `{vers, motif?, surcharge?}` → `missionStatusResponseSchema`     | **409 `ILLEGAL_STATE_TRANSITION`** (couple inexistant, motif absent, conditions manquantes — `details[]` les nomme toutes) · 400 sur un motif hors vocabulaire · 403 rôle insuffisant                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GET /v1/missions/:id/org-units`               | admin             | — → `orgUnitResponseSchema[]`                                                                 | `(position, id)` — l'ordre du fichier importé ; rend `active` et `proposee`, **pas** `fusionnee`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /v1/missions/:id/org-units`              | admin             | `createOrgUnitRequestSchema` → **201** `orgUnitResponseSchema`                                | `id` UUID v7 client accepté (04, P1-4) ; **409** s'il est déjà pris, jamais un écrasement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /v1/missions/:id/org-units/import`       | admin             | `?verification=` + `importArbreRequestSchema` `{csv}` → **200** `rapportImportArbreSchema`    | **422 `IMPORT_REJECTED`** (fichier fautif, rapport dans `details[]`, rien d'écrit) · **409 `CONFLICT`** (arbre non vide) — à blanc, **200 dans tous les cas**                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `PATCH /v1/org-units/:id`                      | admin             | `updateOrgUnitRequestSchema` → `orgUnitResponseSchema`                                        | `status` refusé (400) ; **409** sur une unité `fusionnee` ; 400 sur un cycle ou un parent d'une autre mission                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `POST /v1/org-units/:id/validate`              | admin             | corps vide (`validateOrgUnitRequestSchema`) → `orgUnitResponseSchema`                         | **409** si l'unité n'est pas `proposee`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /v1/org-units/:id/merge`                 | admin             | `mergeOrgUnitRequestSchema` `{mergedIntoId, motif?}` → `orgUnitMergeResponseSchema`           | **409** si la source n'est pas `proposee` ou la cible pas `active` ; 400 si la cible est d'une autre mission                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GET /v1/missions/:id/questionnaire-preview`   | admin             | — → `questionnairePreviewResponseSchema`                                                      | **non paginée** (un questionnaire est un tout) ; n'écrit rien, ne journalise rien                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /v1/missions/:id/generate-questionnaire` | admin             | corps vide (`questionnaireFreezeRequestSchema`) → **201** `questionnaireFreezeResponseSchema` | **409 `QUESTIONNAIRE_ALREADY_FROZEN`** (avec le compte et la date) · **409 `ILLEGAL_STATE_TRANSITION`** (mission hors `preparation`) · **409 `CONFLICT`** (sélection vide, le filtre fautif nommé)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET /v1/missions/:id/interview-plan`          | mission           | — → `planEntretiensSchema`                                                                    | **non paginé, non persisté, non journalisé** ; 404 pour un non-membre ; l'admin voit toute mission                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET /v1/missions/:id/assignments`             | admin             | — → `assignmentSchema[]`                                                                      | `(id)` seul — un UUID v7 s'ordonne comme sa date de création                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /v1/missions/:id/assignments`            | admin             | `createAssignmentRequestSchema` → **201** `assignmentSchema`                                  | 400 unité hors mission ou compte inconnu · **403 `NOT_HABILITATED`** ou compte désactivé (§34.4) · **409** triplet déjà affecté                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `PATCH /v1/interviews/:id/reassign`            | admin, consultant | `interviewReassignRequestSchema` `{newUserId, motif}` → `interviewReassignResponseSchema`     | 404 session inconnue **ou** demandeur hors mission · 403 membre non lead, destinataire hors mission, désactivé ou **`NOT_HABILITATED`** · **409** session `en_cours`/`termine` ou destinataire déjà propriétaire                                                                                                                                                                                                                                                                                                                                                                                                    |

**Quatre routes ne figurent pas aux §8/§24.2 du pack** — `questionnaire-preview`, `interview-plan`,
`org-units/:id/validate` et `org-units/:id/merge` (plus le `PATCH /v1/org-units/:id`). Elles sont
documentées ici au titre du 11 §8.6 et tranchées par `DECISIONS.md` 2026-08-29 « Les quatre routes
hors §8/§24.2 » : la prévisualisation a été **renommée** de `POST …/questionnaire/preview` en
`GET …/questionnaire-preview` (une lecture sans effet de bord se déclare GET + nom), et `validate` /
`merge` sont **les seules sorties** d'un état (`proposee`) que le terrain sait créer — sans elles, une
unité proposée n'entrerait jamais ni dans la couverture ni dans le scoring.

### Référentiel client — R3 et R4 ne refusent presque jamais

`POST` et `PATCH /v1/companies` rendent `{ company, secteurAQualifier, doublonsNomPossibles }`, et
`GET` rend la fiche à plat : les deux champs supplémentaires sont des **constats sur l'acte
d'écriture**, pas des propriétés de l'entreprise (`DECISIONS.md` 2026-08-31).

- **R3, dédup SIREN** : un SIREN déjà pris est le **seul refus** (409). Un **nom** homonyme n'est
  qu'un avertissement (`doublonsNomPossibles`) — deux entités homonymes dans deux pays sont légitimes,
  et l'unicité en base ne porte que sur `siren`.
- **R4, NAF → secteur** : le secteur est **pré-rempli** depuis `naf_sector_map`, jamais imposé. Si la
  division du code APE n'est pas au référentiel, l'écriture passe avec `secteurAQualifier: true`. Sur
  un `PATCH` de code APE vers une division inconnue, **le secteur choisi à la main est conservé**
  (invariant 7, `DECISIONS.md` 2026-08-31) ; l'effacer se fait par `sectorId: null` explicite.

### Cycle de vie d'une mission — la machine à états §32.2

`missions.status` ne change **que** par `POST /v1/missions/:id/status`. `depuis` n'est pas demandé :
il est lu sous verrou sur la ligne. La table des transitions, `TRANSITIONS_MISSION`
(`packages/shared/src/missions.ts`), est une **donnée partagée** transcrite ligne à ligne du §32.2,
importée par l'API comme par la console : aucun `if` de transition ne vit ailleurs.

| Depuis → vers            | Sens   | Conditions mesurées                                                                                  | Forçable (§17.3) | Motif           |
| ------------------------ | ------ | ---------------------------------------------------------------------------------------------------- | ---------------- | --------------- |
| `preparation → en_cours` | avant  | `etape_cadrage_validee`, `etape_preparation_validee`, `questionnaire_fige`, `plan_entretiens_etabli` | **non**          | —               |
| `en_cours → en_analyse`  | avant  | `etape_collecte_validee`                                                                             | oui              | si forcé        |
| `en_analyse → livree`    | avant  | `export_realise`, `etape_livraison_validee`                                                          | oui              | si forcé        |
| `livree → cloturee`      | avant  | `retrospective_faite`                                                                                | **non**          | —               |
| `en_cours → preparation` | retour | aucune                                                                                               | —                | **obligatoire** |
| `en_analyse → en_cours`  | retour | aucune                                                                                               | —                | **obligatoire** |
| `livree → en_analyse`    | retour | aucune                                                                                               | —                | **obligatoire** |

- **`cloturee` est terminal** : il n'apparaît en `depuis` sur aucune ligne, et c'est ainsi que
  « jamais rouvert » est exprimé. Toute autre demande (identités comprises) sort en 409.
- **Une condition non évaluable est réputée satisfaite** (03 §17.2 V2.9) : `plan_entretiens_etabli`
  n'a aucune table où se poser tant que `/apply` n'existe pas, et `export_realise` appartient à L7.
  Seul un `false` explicite bloque — sinon `preparation → en_cours` serait infranchissable en Phase 1.
- **Les trois retours arrière sont `admin` seul, motivés, tracés `activity_log`**, sans condition :
  défaire ne se mérite pas, il se justifie. **La table autorise `consultant` sur les avances** (règle
  métier durable) tandis que **la route reste `admin`** (restriction V1 §34.1) — décision en deux
  couches, `DECISIONS.md` 2026-08-31.
- **La surcharge** (`surcharge: true`, admin, motif fourni) ne porte que sur les deux passages que
  le §17.3 nomme. `surchargeUtilisee` dans la réponse ne vaut `true` que si elle a **réellement**
  porté la décision — pas si elle a été demandée pour rien.
- **`deliveredAt`** est posée à la **première** entrée en `livree` et **jamais effacée** par un retour
  arrière (invariant 7, `DECISIONS.md` 2026-09-01).

**Le motif est un CODE, pas un texte** — arbitrage Williams du 2026-09-02, « motif codé ». Le journal
n'admet qu'un vocabulaire technique (64 caractères, ni espace ni arobase) : une phrase française y
serait refusée en bloc. Le vocabulaire fermé `MOTIFS_RETOUR_ARRIERE` (`packages/shared/src/motifs.ts`)
sert les trois retours **et** le forçage §17.3, sur le même champ (`DECISIONS.md` 2026-09-02) :
`perimetre_a_reprendre` · `questionnaire_a_reprendre` · `collecte_a_completer` · `donnees_a_corriger`
· `rapport_a_corriger` · `manques_assumes` · `demande_du_client` · `erreur_de_manipulation` ·
`incident_technique`. Les libellés français vivent dans `LIBELLES_MOTIF_RETOUR_ARRIERE`, exhaustifs
par le type. **Deux refus, deux statuts** : motif **absent** sur une transition qui l'exige → 409
(c'est l'état qui l'exige) ; motif **hors vocabulaire** → 400 (faute de forme, prononcée par Zod).

**`details[].code`** (convention transverse, `DECISIONS.md` 2026-09-01) : `message` est de
l'interface et l'invariant 5 s'y applique ; `code` est de la machine et n'est jamais rendu à un
humain. Un refus pour conditions manquantes porte **toutes** les conditions fausses, une entrée
chacune, `code` = code de condition, `message` = libellé français.

### Import CSV de l'arbre — §35.2

`POST /v1/missions/:id/org-units/import`, corps `application/json` `{ "csv": "<contenu>" }`
(`multipart` aurait exigé une dépendance hors liste épinglée ; un corps brut n'aurait pas de schéma
Zod — `DECISIONS.md` 2026-09-01).

- **Format** : neuf colonnes, en-têtes **obligatoires et exhaustifs**, ordre libre —
  `ref;name*;kind*;parent_ref;country_code;headcount;service_code;sector_code;timezone`.
  Séparateur `;` ou `,` **détecté** sur l'en-tête ; BOM UTF-8 retiré ; guillemets doubles gérés ;
  lignes vides **sautées et comptées** (`lignesVidesIgnorees`). Une colonne inconnue fait refuser le
  fichier, en la nommant. `kind` sur les 7 types jusqu'à `poste`, sans ordre imposé entre eux.
  Bornes : 5 000 lignes, 1 Mo, profondeur 64 (garde-fou de parcours, pas règle métier).
- **Atomicité** : passe 1 = validation complète en lecture seule ; passe 2 = **une transaction**,
  uniquement si zéro erreur. Une erreur = rien d'écrit. Les ré-imports concurrents sont sérialisés
  par un verrou sur la mission.
- **Mode à blanc** `?verification=true` : mêmes contrôles, même rapport, **rien d'écrit, 200 même si
  le fichier est fautif** — « une validation à blanc qui trouve des erreurs a réussi son travail »
  (`DECISIONS.md` 2026-08-29). `importReelRefuse` y dit en plus si l'import réel serait refusé
  (`ARBRE_NON_VIDE`) : le rapport ne promet jamais des unités qu'il ne pourrait pas créer.
- **Rapport** `{ligne, colonne, code, message}` — numérotation **tableur** (l'en-tête est la ligne 1),
  `colonne` nulle quand le défaut n'en vise aucune, `code` parmi `CODES_DEFAUT_IMPORT_ARBRE`
  (`ENTETE_MANQUANT`, `VALEUR_OBLIGATOIRE`, `VALEUR_HORS_ENUM`, `REF_DUPLIQUEE`, `PARENT_INTROUVABLE`,
  `CYCLE`, `REFERENTIEL_INCONNU`…), `message` en français. Écrêté à 500 entrées, `totalErreurs` jamais
  écrêté. **Jamais journalisé** : il recopie des cellules du fichier client.
- **Ré-import** : refusé (409) dès que l'arbre porte autre chose que sa racine d'office, **arbre
  inchangé au bit près**. L'absorption de cette racine par la racine du fichier n'est **pas**
  implémentée — voir « Ce qui n'est pas dans le lot ».

### Le figeage — une capture, jamais une référence

`POST …/generate-questionnaire` écrit dans `mission_questions` une **copie** de chaque question
retenue : `text`, `guidance`, `answer_type`, `options`, `weight`, `scoring`, `criticality`,
`allow_range` — huit colonnes `*_snapshot`, plus `question_version`. La prévisualisation rend
exactement ces captures (`capture`) avec le routage qui les a sélectionnées (`routage`).

**Pourquoi ça compte** : la banque de questions continue de vivre après le figeage (corrections,
nouvelles versions, lot L9). Si la mission ne portait qu'une **référence** vers `questions`, le
terrain verrait changer le texte d'une question au milieu d'une collecte, et le scoring d'un rapport
livré changerait avec le barème. La capture rend le questionnaire d'une mission **immuable** : aucun
`UPDATE` d'une colonne `*_snapshot` n'existe dans le dépôt, et un second figeage est refusé
(`QUESTIONNAIRE_ALREADY_FROZEN`, avec le compte et la date lue dans `activity_log`). La
re-vérification de `question_version` à la lecture est **due au premier lecteur** (L5a/L6a, L9),
pas à ce lot (`DECISIONS.md` 2026-09-02).

L'assemblage (fonction pure, `domaines/questionnaire/assembleur.ts`) croise palier × secteur ×
unités `in_scope` × niveau d'audit × profils d'interlocuteur. Une liste vide (`activeBlocks`,
`activeSectors`) ou un palier absent (`sizeTierId: null`) **n'est pas une restriction** : le filtre
est levé et un avertissement le dit. Une sélection vide **refuse** de figer (409) en nommant le
filtre qui a vidé l'ensemble.

### Le plan d'entretiens — généré, pas persisté

`GET …/interview-plan` est une **fonction pure** sur l'arbre (`domaines/plan-entretiens/generateur.ts`)
qui applique les quatre tranches du §32.4 à chaque unité `in_scope` et `active` — sur son propre
`headcount`, parents compris, sans agrégation (`DECISIONS.md` 2026-09-02) — et rend des fourchettes
`{min, max}`, des sessions complémentaires (observation, démonstration, relevé de données) et la
liste des règles appliquées. Les unités `proposee` sont exclues du dimensionnement ; un effectif
inconnu tombe dans la tranche minimale avec `effectifInconnu: true` et un avertissement.

**Pourquoi il n'est pas persisté** : il n'existe aucune table où poser une cible « par unité et par
profil » — `work_assignments` exige un `user_id` et n'a pas de dimension profil, et écrire dans
`scoping_estimates.planned_interviews` **détruirait la référence du recalage** §25.1 (le plan vendu).
Le critère du 07 dit « généré », pas « persisté » : le lot livre le générateur, et la route
`POST …/interview-plan/apply` est **reportée** (`DECISIONS.md` 2026-08-29). Le plan **n'est pas
journalisé** : il recopie des noms d'unités et des effectifs du client.

### `conducted_by` nullable — migration `0014`

Le plan §32.4 produit des sessions **planifiées** pour lesquelles aucun auditeur n'est encore
affecté ; `interviews.conducted_by NOT NULL` interdisait de les persister. Williams a tranché le
2026-09-02 (« conducted_by nullable ») : amendement horodaté du 04, migration
`drizzle/0014_interviews_conducted_by_nullable.sql`, manifeste et diff schéma-vs-04 mis à jour dans le
même incrément, et **la règle métier dans le service** : une session `non_demarre` peut n'avoir aucun
auditeur, une session `en_cours` ou `termine` doit en avoir un (`exigerAuditeurSiSessionConduite`,
409). Aucune `CHECK` SQL : le schéma relâche, le service contraint.

**Ce que fait le `@DOWN`** : il **refuse de descendre** s'il reste une seule ligne à
`conducted_by NULL`, avant le `SET NOT NULL`, avec le décompte dans le message
(`not_null_violation`). Aucune valeur n'est inventée, aucune ligne supprimée (invariant 7) : affecter
ou annuler ces sessions est un geste métier qui précède la descente. C'est la seule descente du dépôt
qui porte de la logique.

Conséquences déjà tirées : `PATCH …/reassign` sur une session sans auditeur est une **première
affectation**, permise (`conductedByAvant: null`), et `conducted_by IS NULL` ne se lit **jamais**
« inscriptible par tout le monde » — obligation transmise à L6a (05 §9.9).

`PATCH /v1/interviews/:id/reassign` exige un motif codé de `MOTIFS_REAFFECTATION` (même arbitrage
« motif codé ») : `depart_auditeur` · `indisponibilite_auditeur` · `incident_appareil` ·
`repartition_revue` · `equilibrage_de_charge` · `conflit_agenda` · `erreur_de_planification`.
Aucun code ne désigne une personne ; la réponse ne rend ni nom, ni adresse, ni note.

### Ce qui n'est pas dans le lot — et où c'est tranché

| Absent                                                      | Pourquoi                                                                                                                                                                                     | Où                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `POST …/interview-plan/apply`                               | aucune table pour une cible par unité **et par profil** ; `interlocutor_profile_id` absent de `interviews` ; `0014` lève la première moitié du blocage, pas la seconde. Fiche d'étage 2.     | `DECISIONS.md` 2026-08-29 ; 2026-09-02 (`conducted_by`) |
| Absorption de la racine d'office au premier import          | le §35.2 ne la décrit pas ; inventer une règle de rattachement produirait des arbres faux sans le dire. Seule la moitié dure est retenue : ré-import refusé, arbre inchangé. À spécifier.    | `DECISIONS.md` 2026-09-01                               |
| Motif codé sur `org_unit.merge` (reste `avecMotif` booléen) | l'arbitrage « motif codé » nomme §32.2 et §34.4, pas §25.3 ; une fusion est déjà tracée par ce qu'elle a déplacé. Étendre une décision humaine par analogie n'est pas du ressort d'un agent. | `DECISIONS.md` 2026-09-02 — **en attente de Williams**  |
| Écriture de `mission_users`                                 | hors de la ligne L3 du 07 ; le cadrage par mission n'est alimenté par aucune route. Fiche d'étage 2.                                                                                         | `DECISIONS.md` 2026-09-01 ; `AMELIORATIONS.md`          |
| `DELETE` sur `companies`, `missions`, `org_units`           | voir « Politique d'accès » — décision de produit                                                                                                                                             | `DECISIONS.md` 2026-08-31 (c.)                          |
| Le lead dans la console (§34.3)                             | Phase 2 (§34.1) ; s'ajoutera par une ligne de `config.acces` et un cadrage `mission_users` dans le dépôt                                                                                     | `DECISIONS.md` 2026-09-01, 2026-09-02                   |

Le lot n'introduit **aucune variable d'environnement** : aucun module de `domaines/{companies,
missions,org-units,questionnaire,plan-entretiens,assignments}` ne lit `process.env` ni la
configuration ; `.env.example` reste la référence.

## Conventions (contrat 11 §3, appliquées à toutes les routes)

- **Erreurs** : `{ "error": { "code": "SNAKE_CASE", "message": "…en français", "details"?: [] } }`.
  Les codes vivent dans `@axion/shared` (`ERROR_CODES`) — jamais de littéral libre. Aucune route ne
  construit son enveloppe : le gestionnaire unique de `src/erreurs.ts` s'en charge.
- **Pagination keyset** partout (`?limit=50&after=<curseur>`), jamais d'offset.
- **Dates** ISO 8601 UTC ; `TIMESTAMPTZ` en base ; fuseau de mission à l'affichage seulement.
- **Validation Zod** sur 100 % des entrées, schémas importés de `@axion/shared`. Aucun `any`.
- **Quotas** : global 300 req/min ; `/v1/auth/*` 10 req/min/IP posé au lot L2.

## Journalisation

pino 9 avec **redaction obligatoire** posée sur l'instance racine (`src/logger.ts`) : `person_name`,
emails, contenus de réponse, notes, verbatims et jetons sont masqués. C'est un choix structurel —
compter sur la discipline de chaque appel à `log.info()` ne tiendrait pas (11 §2, 06 §10.4).

## Schéma et données (lot L1)

**Le DDL vit EXCLUSIVEMENT dans `docs/04_MODELE_DE_DONNEES.md`** (11 §2). Les fichiers de
`drizzle/` en sont une transcription ; `src/db/schema.ts` en est un REFLET pour le typage des
requêtes. Ni l'un ni l'autre n'est une source de vérité, et rien n'est jamais « généré » par un ORM.

| Commande                                              | Effet                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm db:migrate:check`                               | dry-run : liste les migrations en attente, vérifie leur réversibilité, n'applique rien |
| `pnpm db:migrate`                                     | applique les migrations en attente, **une transaction par migration**                  |
| `node apps/api/scripts/migrations.mjs --status`       | état du journal `schema_migrations`                                                    |
| `node apps/api/scripts/migrations.mjs --down`         | redescend la dernière migration appliquée                                              |
| `node apps/api/scripts/migrations.mjs --down-to 0000` | redescend TOUT (bac à sable local uniquement)                                          |
| `pnpm db:generate <sujet>`                            | crée le squelette numéroté d'une nouvelle migration (@UP / @DOWN à remplir)            |
| `pnpm seed`                                           | référentiels + compte fondateur — **rejouable à l'identique**                          |
| `pnpm seed:demo`                                      | fixtures de démo déterministes — **refusé si `APP_ENV=prod`**                          |
| `pnpm seed:empreinte`                                 | **lecture seule** : empreinte reproductible du jeu de référence                        |
| `pnpm schema:diff`                                    | compare la base RÉELLE au manifeste extrait du 04 — **zéro écart exigé**               |

### Prouver le jeu de référence — deux instruments, deux questions

`seed.mjs --empreinte` répond à « **rejouer le seed sur CETTE base change-t-il quelque chose ?** »
(critère L1 du fichier 07). Il seede, puis imprime par table le nombre de lignes et un md5 de la
ligne entière — `id` et `updated_at` compris. C'est ce qu'il faut pour l'idempotence, et c'est
précisément ce qui l'empêche de répondre à l'autre question : sur deux bases fraîches, la même
graine donne huit empreintes différentes.

`pnpm seed:empreinte` répond à « **le jeu de référence est-il bien celui qu'on croit ?** ». Il
n'écrit rien (transaction `READ ONLY`), ne mesure que le contenu métier — FK résolues en codes, ni
identifiants alloués ni horodatages — et imprime **une empreinte globale de 32 caractères** en plus
du détail par table. La même graine sur n'importe quelle base fraîche donne la même empreinte :
c'est le chiffre qu'un dossier de porte peut citer et qu'un tiers peut rejouer.

```bash
pnpm seed:empreinte                                  # tableau + empreinte globale
pnpm seed:empreinte -- --json                        # sortie machine (CI)
pnpm seed:empreinte -- --attendue <hex>              # sort en code 1 si le jeu a dérivé
```

**Périmètre — 7 + 1, et les deux ensembles sont nommés.** L'empreinte globale couvre les **7
référentiels** du 11 §5 : `blocks`, `sectors`, `services`, `interlocutor_profiles`, `size_tiers`,
`naf_sector_map`, `estimation_params`. La table `users` est **applicative**, pas un référentiel : le
compte fondateur est mesuré à part, par sa FORME (rôle, profil d'usage, actif, habilitation posée)
et jamais par son identité — son e-mail dépend de l'environnement, son `password_hash` porte un sel
aléatoire, et une empreinte finit copiée dans un dossier de porte versionné.

**Format des migrations** : un fichier `NNNN_sujet.sql`, deux sentinelles `-- @UP` et `-- @DOWN`.
Les deux sont obligatoires — l'exécuteur refuse un fichier sans descente. Les FK circulaires de
`interviews` (`linked_review_answer_id`, `document_request_id`) sont posées par `ALTER TABLE` dans
`0008`, comme le fichier 04 l'impose : une transcription table par table ne compile pas sans cela.

**Depuis la machine hôte**, le `DATABASE_URL` du `.env` vise l'hôte Docker `postgres`, qui ne résout
que depuis un conteneur. Préfixe alors la commande :

```bash
DATABASE_URL=postgresql://axion:<mdp>@localhost:5432/axion_audit pnpm db:migrate
```

## Développement

```bash
pnpm --filter @axion/api dev     # exige packages/shared construit : pnpm build
```

Variables : voir `.env.example`. Le processus **refuse de démarrer** si une variable manque ou si un
secret vaut encore `__CHANGEME__` — un `undefined` silencieux sur un secret est une faille.

## Lots suivants

L6 moteur de synchronisation (premier lecteur du questionnaire figé et de l'arbre côté terrain ;
reçoit les deux obligations transmises par L3 sur `conducted_by`) · `POST …/interview-plan/apply`
et l'écriture de `mission_users`, fiches d'étage 2 à arbitrer par Williams. Les tables `surveys`,
`survey_responses` et `solutions_catalog` arriveront avec **leurs** lots (§28.2-4, §28.2-7) : voir
`DECISIONS.md` 2026-08-27, « Les tables de Phase 2/3 ne sont PAS créées au lot L1 ».
