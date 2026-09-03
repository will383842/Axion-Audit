# LOT L6 — MOTEUR DE SYNCHRONISATION — note de conception (pipeline 09 §3, étape 1bis)

> Note de conception du lot L6, étape 1bis du pipeline (09 §3) : rédigée **AVANT la première
> ligne de code**, à valider par **A01 + le gardien A02**. Rédacteur : A20, chef de l'équipe 2.
> Sources : 05 §9 intégral · 11 §4 et §6 · 04 · 07 (ligne L6) · 09 §4 (P-D), §5.3, §6.

## 1. Périmètre, et ce que L6 ne fait pas

L6 = 4,5 j-h. Il livre **le moteur**, pas de nouvel écran de collecte : outbox, push
idempotent par lots, contrat `applied|duplicate|superseded|forbidden|error` (05 §9.3),
pull delta, backoff, statuts visibles, chunks §9.6, propriété serveur §9.9,
`processed_ops`. Il **remplace** `portSyncInerte` (L5a), il ne l'étend pas.

**Hors périmètre, explicitement** : aucune règle métier de cotation, aucun scoring
(L8), aucune génération (invariant 6). Le serveur ne recalcule pas une valeur : il
l'accepte, la refuse, ou l'arbitre.

## 2. Séquencement — L6 SEUL, et après L5c (pas après L5a)

09 §6 : « P-C (fin L5) au plus tard le MARDI de la semaine 3 ; **ensuite** L6 se
développe SEUL (§5.3) ; jamais L5 et L6 menés de front ». La fin de L5 est la porte
P-C, donc **L5a + L5b + L5c**. L6 touche `apps/field/**` ET `apps/api/**` : démarrer
après L5a seul écraserait C2 en cours. Ordre praticable et conforme :
**L5a → L5b → L5c → (P-C) → L6 seul → (P-D)**. Jalon de descope : 15/09.

## 3. Découpage en incréments (11 §6 — imposé, ≤ ~1 j chacun, commit + tests verts)

| Inc. | Contenu | Glob de couverture (seuil 90 %) |
|---|---|---|
| **L6a** | Outbox (drainage, ordre, lots de 100), push idempotent, `processed_ops`, contrat d'ops complet §9.3, propriété §9.9 | `apps/field/src/sync/**` · `apps/api/src/sync/**` |
| **L6b** | Pull delta, curseur `nextSince` par mission, statuts visibles, backoff exponentiel (max 1 min), « à examiner » au 10e échec | idem |
| **L6c** | Chunks pièces jointes §9.6, **les 8 scénarios §9.8 scriptés**, charge k6 | idem |

Les deux globs sont déjà déclarés `cheminsAttendus` / « non livré » dans
`.github/coverage-critical-paths.json` : **L6a les déplace dans `cheminsCritiques`**.
On remonte la couverture, on ne rétrécit jamais le périmètre (précédent L3, DECISIONS
du 2026-09-02).

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
4. **Routes** : `POST /v1/sync/push`, `GET /v1/sync/pull`, et les trois routes de
   chunks §9.6 — toutes listées 05 §8.4/§24.2. Aucune route hors liste.

## 5. Points durs (7) — nommés maintenant, pas découverts à P-D

- **PD1 — deux `mission_questions` à la même position.** DECISIONS 2026-09-02 [L5b] :
  la question ad hoc s'insère « juste APRÈS la courante », donc en `position n+1`, sans
  renuméroter les questions siège. Le 04 ne pose **aucun UNIQUE(mission_id, position)** :
  rien ne casse en base — c'est le **tri** qui diverge. Le terrain départage par
  `(position, addedAdHoc d'abord, id v7)` (`EcranEntretien.ordonnerParcours`) ; le serveur
  n'a **aucune règle écrite**. Sans décision, l'ordre du parcours terrain ≠ ordre du pull,
  du rapport §36.3 et de la console. **À trancher en entrée de L6a**, et à appliquer au
  même endroit des deux côtés.
- **PD2 — la charge d'op est chiffrée.** `ecrireLocal` chiffre l'op avec la **DEK
  appareil** ; le push doit la déchiffrer en mémoire, puis **mapper** la forme locale
  (camelCase, index + charge, drapeaux `0|1`) vers la forme du 11 §4. Cas unique :
  `question_adhoc` doit devenir `{question:{…§36.4}, mission_question:{id, position}}`,
  les deux ids venant du client. C'est le seul endroit où le fil ≠ le local.
- **PD3 — qui matérialise la révision.** 05 §9.3 (V2.9) : le client n'émet **jamais**
  d'op de révision ; le serveur crée `answer_revisions` (origine `terrain`) **quand
  `value` change**. Le compteur local `answers.revision` monte à *chaque* écriture (une
  note seule l'incrémente) : **le serveur ne doit pas s'en servir comme déclencheur.**
- **PD4 — propriété §9.9 et ordre du lot.** Une op `answer` ne porte pas
  `conducted_by` : le serveur résout le propriétaire via `interviews`. Si l'entretien
  n'est pas encore connu (lot partiel, rejeu), la réponse doit être `error` (rejouable),
  **jamais `forbidden`** (qui sort de l'outbox définitivement). Confondre les deux perd
  des données en silence.
- **PD5 — `forbidden` ne se rejoue jamais**, `superseded` archive la valeur perdante
  (`sync_arbitrage`) et notifie « n réponse(s) arbitrée(s) », `error` compte jusqu'à 10
  puis passe « à examiner ». Aucune suppression silencieuse : c'est l'invariant 7.
- **PD6 — compteur de descente conservée.** `appliquerDescente` n'écrit sa clé `meta`
  que si `conservees > 0` et ne la remet jamais à 0 : un pull propre laisserait un
  « n élément(s) conservé(s) » périmé à l'écran. L6b remet à zéro ou n'affiche pas.
- **PD7 — horloge.** `serverTime` du pull règle l'offset (`reglerDecalage`) ; c'est lui
  qui rend le scénario « horloge déréglée +3 h » gagnable. Le `client_updated_at` est
  posé à UN seul endroit (le port d'écriture), jamais par un `new Date()` du moteur.

## 6. Plan de tests — TDD, A26 écrit AVANT A25

**Les 8 scénarios §9.8 SONT le plan de tests** ; tous Playwright, marqués `@critique`,
rejoués à chaque commit :

1. coupure réseau en pleine saisie · 2. kill de l'app pendant un push ·
3. double envoi du même lot (rejeu 3× = état identique) · 4. horloge locale +3 h ·
5. deux appareils sur la même mission (LWW par ligne + `superseded` archivé) ·
6. 5 000 réponses + 200 photos en file · 7. reprise d'upload interrompu à 80 % ·
8. expiration du refresh token en mission longue (§31.3).

Plus : RBAC/propriété §9.9 exhaustif en intégration · charge k6 50 clients × 1 000 ops,
p95 < 500 ms · `@filrouge` allongé (sync + rejeu idempotent) vert sur **FIL-TPE ET FIL-GC**.
**Couverture ≥ 90 % MESURÉE** sur les deux globs, quatre métriques (lines, statements,
functions, branches) — la métrique `functions` est celle qui décroche en premier, elle se
surveille explicitement. Chaque test doit être **discriminant** : prouvé par bascule.

## 7. Affectation croisée (09 §5.6 — le testeur n'est jamais l'auteur)

| Périmètre | Code | Tests |
|---|---|---|
| Moteur terrain (outbox, push, backoff) | A25 | A26 |
| Réception serveur, `processed_ops`, §9.9 | A23 | A27 |
| Chunks §9.6 | A25 | A26 |
| 8 scénarios §9.8 (Playwright) | — | A26 |
| Charge k6, a11y, budgets | — | A28 |
| Revue croisée (ne produit rien) | — | A29 |

## 8. Doutes de spec → DECISIONS.md, jamais devinés

- **D1** : la règle de tri serveur à position égale (PD1) — proposition : la même que le
  terrain, `(position, added_ad_hoc DESC, id)`.
- **D2** : `PHRASE_SCRIPT_ACCORD` — 03 M3.2 et 10 (U5) disent « phrase-script **fournie** »
  et ne la fournissent nulle part. Le refus sans accord est testé ; le **libellé** ne l'est
  pas et n'est pas devinable. **Escalade Williams** (hérité de L5b).
- **D3** : `answers.revision` — le serveur l'ignore-t-il au profit du diff de `value` (PD3) ?

**Signature :** A20 — conception L6, à valider A01 + A02 avant tout code.
