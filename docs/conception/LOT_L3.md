# LOT L3 — NOTE DE CONCEPTION (pipeline 09 §3, étape 1bis)

> **Périmètre (07, table des lots — seule source du brief)** : API missions/companies (dédup SIREN R3,
> NAF→secteur R4) · arbre `org_units` (import CSV §35.2, `kind` jusqu'à `poste`, statuts *proposée*/
> *fusionnée*) · moteur M2 (palier × secteur × unités `in_scope` × niveau × interlocuteur, snapshot
> texte+options+barème) · plan d'entretiens §32.4 · machine à états §32.2 · prévisualisation §33.4 ·
> `reassign` §34.4. **3 j.** Lecture faite : 11 → 01 → 03 (M1-M2, §16, §17.2-17.3, §18.1, §19.1,
> §25, §32.2, §32.4, §33.4, §34.3-34.4, §35.2) → 04 → 05.
> **Hors périmètre L3, assumé** : `resync-questionnaire` (§8.3, non listé au 07 → part avec L9),
> `dashboard`, `decline-by-country` (L14). **Rédigée avant toute ligne de code.**

## 1. Découpage — 4 incréments commitables, fichiers disjoints après L3a

| Inc.    | Contenu                                                                                        | Fichiers (nouveaux sauf mention)                                                     |
| ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **L3a** | Socle API : compilateurs Zod Fastify (in **et** out par route), `paginerParCurseur`, règle ESLint anti-`.offset()`, codes d'erreur du lot | `apps/api/src/http/*`, `packages/shared/src/api/*`, +2 lignes dans `app.ts`, `eslint.config.js` |
| **L3b** | `companies` (dédup SIREN, NAF→secteur) · `missions` CRUD + racine par défaut · **machine à états** | `packages/shared/src/missions.ts`, `apps/api/src/{services,routes}/missions*`, `…/companies*` |
| **L3c** | `org_units` CRUD · import CSV §35.2 · valider/fusionner §25.3                                    | `packages/shared/src/org-units.ts`, `apps/api/src/{services,routes}/org-units*`        |
| **L3d** | Assembleur M2 + prévisualisation §33.4 + figeage · plan d'entretiens §32.4 · `assignments` · `reassign` | `apps/api/src/services/{questionnaire,plan-entretiens}/*`, routes associées            |

**Séquentiel obligatoire** : L3a d'abord (tout en dépend). L3b livre `TRANSITIONS_MISSION` avant que
L3d ne branche ses conditions. **Parallélisable ensuite** : L3c ‖ L3d (aucun fichier commun).

## 2. Interfaces exposées

`GET|POST /v1/companies` · `GET|PATCH /v1/companies/:id` · `GET|POST /v1/missions` ·
`GET|PATCH /v1/missions/:id` · `POST /v1/missions/:id/status` ·
`POST /v1/missions/:id/questionnaire/preview` (§33.4) · `POST /v1/missions/:id/generate-questionnaire` ·
`GET|POST /v1/missions/:id/org-units` · `PATCH /v1/org-units/:id` ·
`POST /v1/missions/:id/org-units/import` (`?verification=true` = à blanc) ·
`POST /v1/org-units/:id/{validate,merge}` · `GET /v1/missions/:id/interview-plan` (+ `/apply`) ·
`GET|POST /v1/missions/:id/assignments` · `PATCH /v1/interviews/:id/reassign` (§34.4).
Les 4 routes absentes des §8/§24.2 (`preview`, `interview-plan`, `/apply`, `org-units/:id/*`) sont
documentées par entrée `DECISIONS.md` (11 §8-6). **Chaque route déclare ses schémas Zod in/out issus
de `packages/shared`** ; keyset partout, curseur documenté par route (`missions`: `created_at,id` ·
`companies`: `name,id` · `org_units`: `position,id`).

## 3. Points durs — arbitrages

**a. Le figeage est une CAPTURE, pas une référence.** La capture vit dans les 8 colonnes `*_snapshot`
de `mission_questions` (04, verbatim — **en ajouter une serait modifier le 04**). Elle contient ce
qu'on a *demandé* : texte, consigne+ancres, type, options, poids, barème, criticité, fourchette. Ce
qui n'y est pas (`profiles`, bloc, `target_services`) est du **routage**, lu à la volée sur la ligne
`questions` référencée — licite parce qu'une nouvelle version est une **nouvelle ligne** (04) : une
référence vers une ligne immuable *est* une capture. **Preuve de non-dérive, en trois temps** :
(1) `mission_questions.question_version` est re-vérifié à chaque lecture contre la ligne pointée —
divergence = `CONFLICT`, détecteur de corruption, jamais une lecture silencieuse ; (2) aucun chemin
de code L3 n'émet d'`UPDATE` sur les colonnes `*_snapshot` (le seul écrivain, `resync`, est hors
lot) ; (3) test : figer, muter la banque (nouvelle version + archivage), relire — snapshots
**identiques au bit près**. L3 pose sur L4/L9 l'exigence corollaire : le contenu d'une ligne
`questions` référencée par un `mission_questions` ne se modifie jamais en place.
Le figeage est **idempotent et unique** : transaction + `SELECT … FOR UPDATE` sur la mission, refus
si des snapshots existent déjà (`QUESTIONNAIRE_ALREADY_FROZEN`). Il n'y a **pas de colonne « figé »** :
l'existence des lignes EST la preuve, et `step_validations('preparation')` porte l'acte humain.

**b. La machine à états est une DONNÉE.** `TRANSITIONS_MISSION` (`packages/shared/src/missions.ts`) :
tableau figé de `{depuis, vers, sens: 'avant'|'retour', roles, conditions: CodeCondition[],
motifRequis}` transcrit ligne à ligne du §32.2 — 4 transitions avant, 3 retours admin motivés,
`cloturee` terminal. Aucun `if` de transition ailleurs. **Appliquée dans le SERVICE**
(`transitionnerMission`), pas dans la route (qui ne fait que valider l'I/O et traduire l'`AppError`),
pas en base : les conditions lisent `step_validations`, `mission_questions` et le plan — un `CHECK`
ne le peut pas, et un trigger ferait vivre la règle métier hors de la couche typée **et** modifierait
le 04. La base garde le dernier cran (`CHECK` sur `status`) ; la concurrence est tenue par
`FOR UPDATE`. Rejet = `409 ILLEGAL_STATE_TRANSITION` + message français nommant `depuis→vers` et,
dans `details[]`, **chaque** condition non remplie. Règle §17.2-V2.9 respectée : une condition dont
la fonctionnalité porteuse n'est pas livrée est *réputée satisfaite* — jamais un verrou sur une
absence. La couverture se prouve par **énumération des 20 couples** (5×5 hors identités), pas par une
liste de cas.

**c. Import CSV : atomique ET exhaustif — deux passes, pas une.** Passe 1, **entièrement en mémoire,
zéro écriture** : en-têtes, encodage, séparateur (`;` ou `,` détecté), unicité des `ref`, résolution
des `parent_ref`, absence de cycle, cohérence `kind`/parent, existence de `service_code`/`sector_code`
dans les référentiels — **toutes** les lignes sont évaluées, jamais d'arrêt à la première erreur.
S'il reste une erreur : `422 CSV_IMPORT_REJECTED`, rapport `{ligne, colonne, code, message}` pour
chacune (au-delà de 500, le rapport est tronqué et porte son total), **et rien n'a été écrit** — la
contradiction apparente tombe parce que la validation n'écrit pas. Passe 2, uniquement si zéro
erreur : une seule transaction, insertion parents-avant-enfants. `?verification=true` s'arrête après
la passe 1 : l'utilisateur itère sans jamais toucher la base. **Re-import refusé** (`TREE_NOT_EMPTY`)
sauf si l'arbre ne contient que la racine créée par défaut, alors absorbée.

**d. SIREN et NAF : distinguer l'inconnu du malformé.** SIREN normalisé (espaces/points retirés,
9 chiffres, clé de Luhn) — un SIREN malformé est un `400`. Présent et déjà pris : `409
COMPANY_DUPLICATE` portant l'id existant, **jamais de fusion silencieuse** ; la course est arbitrée
par l'index unique partiel (23505 → même 409), pas par un `SELECT` préalable. **Absent** : aucune
unicité n'est possible en base — donc **avertissement, pas blocage** : nom normalisé (minuscules,
sans accents, formes juridiques retirées) comparé aux existants ; collision → 409 levable par
`{confirmerDoublon: true}`, création tracée à l'`activity_log`. Deux entités homonymes dans deux pays
sont légitimes : l'outil signale, l'humain trie. **NAF** : format invalide → `400` ; format valide
absent des 88 lignes de `naf_sector_map` → **succès**, `sectorId` NULL, `secteurAQualifier: true`
dans la réponse. Un référentiel incomplet n'est pas une erreur de l'utilisateur, et on n'invente
jamais un secteur par défaut.

**e. Fusionner une unité proposée ne perd aucune réponse — par construction.** Une `answer` ne
référence *jamais* une unité : elle pend à un `interview`, qui seul porte `org_unit_id`. La fusion
(§25.3) écrit, en une transaction : `status='fusionnee'` + `merged_into_id` sur la source (**la ligne
survit pour toujours** — jamais de suppression), re-rattachement des `interviews` et re-parentage des
enfants vers la cible, entrée `activity_log` portant `{interviewIds, avant, apres, motif}` (des ids,
aucune donnée personnelle). L'ancien rattachement reste donc lisible par **deux** chemins
indépendants — invariant 7 tenu sans une colonne de plus. Garde-fous : seule une unité `proposee`
se fusionne, la cible doit être `active` (pas de chaîne), `conducted_by` n'est pas touché, les
`unit_scores` ne sont pas migrés mais recalculés (L8).

## 4. Plan de tests

**TDD imposé** (tests écrits **avant**, par A16 — jamais par l'auteur du code, 09 §5.6) sur : machine
à états, assembleur/figeage, import CSV, fusion d'unité. **Purs (sans base)** : assembleur M2 sur les
**4 archétypes §21.1** (TPE racine unique → grand groupe hyper-décentralisé) ; bornes
d'échantillonnage §32.4 (≤10 → 1-2 · 11-50 → 3 · 51-200 → 4-6 · >200 → 6-10) aux valeurs limites ;
parseur CSV ; normalisations SIREN/NAF ; **les 20 couples de transitions**. **Intégration
(testcontainers)** : deux `POST /companies` concurrents sur le même SIREN → une création, un 409 ;
erreur en ligne 900/1000 → `COUNT(org_units)` inchangé et 1 000 lignes rapportées ; fusion → nombre
de réponses **strictement identique** avant/après et zéro `interview` orphelin ; non-dérive du
figeage (test c) ; consultant hors mission → jamais un octet ; curseur stable sous insertion
concurrente. **Fil rouge** : FIL-TPE (racine unique, ~30 q.) et FIL-GC (import de 150 unités sur
4 niveaux, figeage, plan 60 entretiens) — `@filrouge` **vert sur les deux**, c'est la bascule
Playwright annoncée « au L3 ». **Couverture ≥ 90 % mesurée** sur `services/questionnaire`,
`services/org-units` et la machine à états. **Invariant 2** : toutes les fixtures portent des
libellés neutres — l'exemple CSV du §35.2 est recopié *sans* ses noms.

## 5. Ce qui doit être tranché avant L3d

1. **`interviews.interlocutor_profile_id` (FK `interlocutor_profiles`, NULL)** — 5ᵉ colonne manquante,
   à grouper avec les quatre de l'audit d'alignement. Sans elle : « profils rencontrés » (§16.6) et la
   divergence direction/terrain (§32.1, qui compare explicitement par `group_code`) sont
   **inexécutables**, et le plan d'entretiens — spécifié « par unité et par profil » (§18.1.2, §17.3)
   — ne peut pas être persisté. **Repli si refusée** : L3 livre le générateur de plan (fonction pure,
   testée : le critère du 07 reste tenu) et ne persiste rien ; le plan n'entre ni dans l'agenda ni
   dans la couverture.
2. **4 codes d'erreur** (`COMPANY_DUPLICATE`, `CSV_IMPORT_REJECTED`, `TREE_NOT_EMPTY`,
   `QUESTIONNAIRE_ALREADY_FROZEN`) et les **4 routes** hors §8/§24.2 → entrées `DECISIONS.md`.
3. **Contrat L2** (détaillé au rapport) : `request.utilisateur`, garde de rôle, **prédicat SQL** de
   filtrage par missions assignées (L3 ne réimplémente pas le filtre), garde `habilitated_at` §34.4
   appelée par la route `assignments` de L3, notion de *lead* §34.3, signature de `journaliser()`.
4. **Ordre d'atterrissage de `apps/api/src/app.ts`** entre L2 et L3 (2 lignes chacun) — seul point de
   collision de fichier entre les deux lots.

*Rédigée par le chef d'équipe du lot L3 — à valider par A01 et le gardien A02 avant la première ligne
de code. Réserve de gouvernance : le 09 §1 rattache L3 à l'**équipe 1** (chef A10) ; le mandat reçu
signe A30. À trancher par A01 — la chaîne de signature ne se devine pas.*
