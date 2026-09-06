# [A02] Contrôle de conformité — NOTE DE CONCEPTION DU LOT L6 — 2026-09-05

> Étape **1bis** du pipeline (09 §3) : validation de `docs/conception/LOT_L6.md` par **A01 + le
> gardien A02**, AVANT la première ligne de code (`CLAUDE.md` §4-1bis). Note livrée le 2026-09-03
> (commit `44e348b`, PR #27), jamais validée depuis.
>
> **Objet du contrôle : la NOTE.** Ce n'est pas le contrôle d'acceptation du lot (étape 6) : ni DoD
> transverse mesurée, ni couverture, ni suite de tests rejouée — L6 n'a pas une ligne de code.
> Ce qui est contrôlé ici : complétude vis-à-vis du 07 ligne L6, atteignabilité des critères par le
> découpage, exactitude des interfaces citées, invariants, séquencement, globs de couverture,
> véracité des sept points durs.
>
> Ordre de lecture appliqué (`CLAUDE.md` §0, ligne L6) : 11 (§1-§4, §6, §7, §8) → **05 §9 intégral**
> (+ §8.4, §24.2, §31) → 04 (`processed_ops`, `sync_log`, `attachment_uploads`, `answer_revisions`,
> `answers`, `attachments`) → 07 ligne L6 → 09 (§1, §3, §4, §5.3, §5.6, §5.9, §6) → 08 intégral →
> 00_INDEX. Puis la note, puis le code.
>
> **État du dépôt au moment du contrôle.** Worktree `_axl6n`, HEAD détaché sur `d666d1b`.
> `origin/main` distant est à **`da7e8c9`** — « L5b — l'écran de session à 3 zones… (#31) », **mergé
> le 2026-09-05 à 05h28**, soit un commit devant ce worktree. Toutes les mesures portant sur L5b
> sont donc prises sur `origin/lot/l5b` (le contenu squashé dans `da7e8c9`) et signalées comme
> telles. Les mesures sur L5a/L7a sont prises sur `d666d1b`.

---

## VERDICT

# ACCEPTÉE SOUS RÉSERVE

**Motivé.** La note est juste sur l'essentiel et vérifiable : le découpage L6a/L6b/L6c est la
transcription littérale du 11 §6 ; les **sept identifiants d'interface qu'elle déclare gelés existent
tous, aux mêmes noms, dans le code d'aujourd'hui** ; le séquencement qu'elle défend est exactement
celui qu'A01 a arbitré le 2026-09-03 ; les quatre critères du 07 ligne L6 sont chacun portés par un
incrément ; **six de ses sept points durs sont exacts au code**, et deux d'entre eux (PD2, PD4) sont
des trouvailles qu'aucune lecture du pack seul n'aurait produites.

Ce qui l'empêche d'être ACCEPTÉE telle quelle n'est pas une faute de raisonnement : ce sont **cinq
omissions et une péremption**, toutes réparables par un amendement daté de la note, aucune ne
demandant de rouvrir le découpage. Une note qui envoie l'implémenteur construire le mauvais
résolveur de propriété (B1) ou qui ne nomme pas le transport que tout le lot suppose (B2) coûte
exactement ce que l'étape 1bis existe pour épargner.

- **5 réserves BLOQUANT L'OUVERTURE DE L6** (B1-B5) — levées par un amendement de la note signé A01.
- **5 réserves bloquant la porte P-D** (R1-R5), pas l'ouverture.
- **5 observations** (O1-O5), dont l'écart de format, **accepté** et motivé.
- **6 doutes de spec** à porter en `DECISIONS.md`, dont 3 nouveaux.
- **Aucun motif de VETO** : aucun écart non documenté à une section du pack, aucun interdit 11 §2
  enfreint par la note, aucun code orphelin (la note n'ajoute rien au périmètre du 07).

---

## 1. COMPLÉTUDE VIS-À-VIS DU 07, LIGNE L6 — 10/10 items présents, 0 ajouté

07 ligne L6, contenu, mot pour mot : « outbox, push idempotent par lots, **contrat
`applied/duplicate/superseded/forbidden/error` §9.3**, pull delta, backoff, statuts visibles,
**pièces jointes chunkées selon le protocole §9.6**, **propriété serveur §9.9**, table
`processed_ops` — **exécution en 3 incréments L6a/L6b/L6c (fichier 11 §6)** ».

| Item du 07 | Où dans la note | Verdict |
|---|---|---|
| outbox | §1, §3 (L6a « drainage, ordre, lots de 100 ») | présent |
| push idempotent par lots | §1, §3 (L6a), §4-1 (`TAILLE_LOT_PUSH_MAX`) | présent |
| contrat §9.3 (5 résultats) | §1, §3 (L6a « contrat d'ops complet »), §5 PD5 | présent |
| pull delta | §1, §3 (L6b « curseur `nextSince` par mission ») | présent |
| backoff | §3 (L6b « exponentiel, max 1 min ») | présent |
| statuts visibles | §3 (L6b), §5 PD5 (« à examiner ») | présent |
| chunks §9.6 | §1, §3 (L6c), §4-4 | présent |
| propriété serveur §9.9 | §1, §3 (L6a), §5 PD4 | présent — **mais incomplet, voir B1** |
| table `processed_ops` | §1, §3 (L6a), §4 (via 11 §4) | présent |
| 3 incréments L6a/L6b/L6c | §3 | présent, **identique au 11 §6** (comparé ligne à ligne) |

**Rien d'ajouté.** Le périmètre de la note est strictement celui du 07 : elle exclut nommément le
scoring (L8) et toute génération (invariant 6), et ne crée aucune route hors des §8.4/§9.6. Aucun
« code orphelin » au sens de 09 §3-6 n'est pré-annoncé.

**Trois écritures que le lot doit produire et que la note ne nomme pas** — ce sont B3, R2 et R4.

## 2. LES CRITÈRES DU 07 SONT-ILS ATTEIGNABLES ? — table critère → incrément porteur

07 ligne L6, critères, mot pour mot : « **Les 8 scénarios §9.8 passent** (Playwright, `@critique`) ;
rejeu 3× du même lot = état identique ; reprise d'upload interrompu à 80 % ; charge 50 clients ×
1 000 ops : p95 < 500 ms ».

| Critère 07 | Incrément qui le PORTE (note §3/§6) | Le mécanisme est-il porté ? |
|---|---|---|
| **C1 — les 8 scénarios §9.8, Playwright `@critique`** | scriptés en **L6c** (§3, §6) | voir le détail scénario par scénario ci-dessous |
| **C2 — rejeu 3× du même lot = état identique** | **L6a** (`processed_ops` + upsert par `entityId`) | OUI — les deux ceintures du 11 §4 sont nommées §4-1 |
| **C3 — reprise d'upload interrompu à 80 %** | **L6c** (chunks §9.6) | OUI côté protocole — **table `attachment_uploads` non nommée (R2)** ; **binaire non produit (B4/L5d)** |
| **C4 — charge k6, 50 clients × 1 000 ops, p95 < 500 ms** | **L6c** (§6, A28) | OUI |

Détail de C1, le seul critère qui se décompose :

| Scénario §9.8 | Incrément porteur du MÉCANISME | Statut |
|---|---|---|
| 1. coupure réseau en pleine saisie | L6a (drainage/backoff) — l'atomicité d'écriture est déjà livrée (L5a, `ecriture.ts`) | porté |
| 2. kill de l'app pendant un push | L6a (statut d'op, reprise de file) | porté |
| 3. double envoi du même lot | L6a (`processed_ops`) | porté |
| 4. horloge locale +3 h | L6b (`serverTime` → `reglerDecalage`) — PD7, **vérifié au code** | porté |
| 5. deux appareils sur la même mission | L6a (`superseded`) + archive serveur | porté — **archive incomplète, R4** |
| 6. 5 000 réponses **+ 200 photos** en file | L6a (lots) + **la photo n'existe pas** | **NON PORTÉ — B4** |
| 7. reprise d'upload interrompu à 80 % | L6c (chunks) + **la photo n'existe pas** | **NON PORTÉ — B4** |
| 8. expiration du refresh token en mission longue (§31.3) | **AUCUN** | **NON PORTÉ — B2** |

**C'est le résultat central de ce contrôle** : trois des huit scénarios `@critique` — donc le
critère d'acceptation n°1 du lot — ne sont portés par aucun incrément de la note en l'état.

## 3. LES INTERFACES GELÉES LE SONT-ELLES VRAIMENT ? — 10/10 vérifiées, aux mêmes noms

Contrôle **mesuré**, identifiant par identifiant, sur `packages/shared/src/sync.ts` et
`apps/field/src/local/port-sync.ts` de `d666d1b`, puis re-contrôlé sur `origin/lot/l5b` (le contenu
de `da7e8c9`).

| Identifiant cité par la note §4 | Présent ? | Preuve |
|---|---|---|
| `operationSchema` | OUI | `packages/shared/src/sync.ts` — `{opId, entity, entityId, action, payload, clientUpdatedAt}` |
| `lotPushSchema` (+ `outboxRemaining`) | OUI | même fichier — `{missionId, deviceId, operations, outboxRemaining}` |
| `reponsePushSchema` | OUI | même fichier — `{serverTime, results}` |
| `reponsePullSchema` | OUI | même fichier — `{serverTime, changes, nextSince}` |
| `RESULTATS_OP` | OUI | même fichier — les 5 valeurs du 05 §9.3, dans l'ordre |
| `TAILLE_LOT_PUSH_MAX = 100` | OUI | même fichier — valeur `100`, conforme 11 §4 |
| `ECHECS_AVANT_EXAMEN = 10` | OUI | même fichier — valeur `10`, conforme 05 §9.3 |
| `PortSync`, `EtatSyncMission`, `ResultatSync` | OUI | `apps/field/src/local/port-sync.ts` |
| `evaluerAlerteSauvegarde`, `DELAI_ALERTE_SANS_SYNC_MS` | OUI | même fichier |
| `appliquerDescente(LotDescendant)` | OUI | `apps/field/src/local/ecriture.ts` |

**Le diff `d666d1b` → `origin/lot/l5b` sur ces trois fichiers est de 6 lignes, toutes en
commentaire** (une glose C7 corrigeant un renvoi de chemin cassé). **Aucune signature n'a bougé
depuis la rédaction de la note.** La qualification « gelées » est exacte, et l'escalade 11 §8-2
qu'elle réclame pour toute modification est la bonne.

Deux vérifications de fond, au-delà des noms :

- **La garantie structurelle de §4-3 est vraie** : `appliquerDescente` ouvre sa transaction sur
  `[...tablesTouchees, base.meta]` — `outbox` en est absente, Dexie lèverait. Une descente ne peut
  pas fabriquer d'op.
- **`packages/shared/src/index.ts:26` exporte bien `export * from './sync.js';`** : l'API pourra
  importer le contrat par le baril, comme l'exige 11 §3 (« le front importe LES MÊMES schémas »).
  Aucun obstacle. Voir toutefois O5.

## 4. LES SEPT POINTS DURS, VÉRIFIÉS UN PAR UN CONTRE LE CODE D'AUJOURD'HUI

| # | Affirmation de la note | Verdict | Preuve (mesurée) |
|---|---|---|---|
| **PD1** | tri terrain `(position, addedAdHoc d'abord, id v7)` dans `EcranEntretien.ordonnerParcours` ; le serveur n'a aucune règle | **EXACT** | `origin/lot/l5b:apps/field/src/ecrans/entretien/EcranEntretien.tsx:109` — `a.position - b.position \|\| Number(b.addedAdHoc) - Number(a.addedAdHoc) \|\| (a.id < b.id ? -1 : …)`. Le 04 ne pose aucun `UNIQUE(mission_id, position)` : contrôlé, absent de la liste d'index du 04 §7.1 |
| **PD2** | la charge d'op est chiffrée sous la DEK ; le push doit déchiffrer puis mapper | **EXACT** | `apps/field/src/local/ecriture.ts` : `const chargeOp = await coffre.chiffrer({ ...enTete, ...demande.charge })` — deux enveloppes distinctes, l'op portant l'entité complète |
| **PD3** | `answers.revision` monte à CHAQUE écriture ; le serveur ne doit pas s'en servir comme déclencheur | **EXACT** | `origin/lot/l5b:apps/field/src/session/ecriture-reponses.ts:184` — `revision: existante === null ? 1 : existante.revision + 1`, sans comparaison de `value` |
| **PD4** | le propriétaire d'une op `answer` se résout via `interviews` ; entretien inconnu ⇒ `error`, jamais `forbidden` | **EXACT MAIS INCOMPLET** | voir **B1** — le cas `attachment_meta` sans entretien n'est pas couvert |
| **PD5** | `forbidden` ne se rejoue jamais ; `superseded` archive ; `error` compte jusqu'à 10 | **EXACT** | transcription fidèle du 05 §9.3 ; cohérent avec `RESULTATS_OP` et `ECHECS_AVANT_EXAMEN` |
| **PD6** | `appliquerDescente` n'écrit sa clé `meta` que si `conservees > 0` et ne la remet jamais à 0 | **PÉRIMÉ — FAUX AUJOURD'HUI** | voir **R1** |
| **PD7** | `serverTime` règle l'offset ; `client_updated_at` posé à UN seul endroit | **EXACT** | `apps/field/src/local/horloge.ts:45` `reglerDecalage()` ; `ecriture.ts` pose `clientUpdatedAt: horodatage` après l'étalement de `index`, donc non surchargeable par l'appelant |

**Six sur sept exacts, un périmé.** Le taux est bon et la méthode annoncée (« sourcés dans le code
plutôt que supposés ») est tenue — PD2 et PD3 en particulier ne se déduisent d'aucune lecture du
pack seul.

---

## 5. RÉSERVES BLOQUANT L'OUVERTURE DE L6 (5)

Elles se lèvent par un **amendement daté de `docs/conception/LOT_L6.md`**, signé A01. Aucune ne
demande de rouvrir le découpage ni de toucher au 04.

### B1 — PD4 ne couvre pas la note volante : le résolveur de propriété décrit est faux pour `attachment_meta`

**Sections** : 05 §9.9 (propriété des écritures) · 04, amendement **S-3** du 2026-08-31 ·
invariant 3 · invariant 7.

**Ce que dit la note** (§5, PD4) : « Une op `answer` ne porte pas `conducted_by` : le serveur résout
le propriétaire via `interviews`. Si l'entretien n'est pas encore connu (lot partiel, rejeu), la
réponse doit être `error` (rejouable), **jamais `forbidden`**. »

**Mesure** : L5b émet des ops `attachment_meta` dont `interviewId` **peut être `null` par
construction** — `origin/lot/l5b:apps/field/src/session/notes-volantes.ts` :
`readonly interviewId: string | null` (`DemandeNoteVolante`), et
`index: { interviewId: demande.interviewId, answerId: null, kind: 'note' }`. Pour ces ops il
n'existe **aucune ligne `interviews`** à interroger : ce n'est pas un « lot partiel », c'est l'état
NORMAL et durable d'une note volante (04 §24.1 P1-5, « rattachement complétable après coup »).

**Conséquence si la note est suivie littéralement** : chaque note volante non rattachée reçoit
`error`, est rejouée, échoue de nouveau, et **atteint « à examiner » au 10e essai**. La note de
couloir de l'auditeur ne remonte jamais. C'est l'invariant 7 pris par son côté le plus discret.

**Le pack a déjà tranché** — le 04 (amendement S-3) écrit noir sur blanc : « **propriétaire = le
rattachement quand il existe, SINON `created_by`** », et pose la colonne `attachments.created_by`
pour cela. **La note ne cite S-3 nulle part.** L'implémenteur de L6a construirait le résolveur sur
la seule phrase qu'il a sous les yeux.

**Levée** : PD4 amendé pour distinguer les trois entités et citer 04 S-3.

### B2 — le transport authentifié du terrain n'est porté par aucun incrément (et il porte le scénario 8)

**Sections** : 11 §3 (« terrain = **Bearer** + refresh token **chiffré dans Dexie** ») · 05 §31-3 ·
05 §9.8 scénario 8 · 07 ligne L6, critère « les 8 scénarios passent ».

**Mesure** : `grep -rn "fetch(" apps/field/src` (hors tests) = **0 occurrence** sur `main`
(`d666d1b`), **0** sur `origin/lot/l5b`, **0** sur `origin/lot/l5c`. **L'application terrain n'a
jamais fait un appel HTTP.** L5a a livré le *rangement* du jeton
(`apps/field/src/local/jetons.ts`, chiffré sous la DEK, conforme 11 §3) — mais **rien ne
l'utilise** : ni client HTTP, ni en-tête `Authorization`, ni traitement du 401, ni rotation du
refresh, ni le message du §31-3 (« reconnexion requise pour synchroniser — vos données sont en
sécurité sur l'appareil »).

**Conséquence** : la note fait reposer L6a et L6b sur un transport qui n'existe pas et qu'elle ne
demande à personne d'écrire. Le scénario 8 — `@critique`, jamais skippable — n'a aucun porteur.

**Levée** : §3 amendé pour inscrire à **L6a** le client HTTP authentifié du terrain (Bearer, lecture
du jeton via `jetons.ts`, rotation, 401 hors ligne, message §31-3), et §6 pour rattacher le
scénario 8 à un incrément.

### B3 — `sync_log` n'est écrit par personne, la note ne le nomme pas, et aucun test ne le révélera

**Sections** : 05 §9.7 (V2.9 : « chaque push remonte `outbox_remaining`, **conservé dans
`sync_log`** ») · 04 (`sync_log(… outbox_remaining INT NULL …)`) · 07 ligne L2, critère « reset
refusé si outbox non vide signalé » · invariant 8 · E38.

**Mesure** : la table existe (`apps/api/drizzle/0007_transverse.sql:45`) ; **le lecteur existe**
(`apps/api/src/domaines/users/depot.ts:470`, `selectDistinctOn([syncLog.deviceId])` sur
`outbox_remaining`) ; **aucun écrivain applicatif n'existe** — la seule écriture du dépôt est un
`INSERT` brut de fixture dans `apps/api/tests/l2-users.integration.test.ts:419`.

**Pourquoi c'est le plus insidieux des trois oublis** : parce que le test de L2 ensemence `sync_log`
à la main, **il restera vert pour toujours** même si personne n'écrit jamais cette table en
production. Le garde-fou de réinitialisation de mot de passe — celui qui empêche de rendre
illisibles les données locales d'un auditeur en mission — resterait alors définitivement dans sa
branche « aucune sync connue ». Aucune porte ne l'attrapera.

**Levée** : §3 amendé pour inscrire à **L6a** l'écriture de `sync_log` (direction `push`,
`items_count`, `conflicts_count`, `outbox_remaining`, `started_at`/`ended_at`, `status`), et à
**L6b** la ligne `pull`.

### B4 — le séquencement §2 est périmé : L5d s'intercale entre P-C et L6c

**Sections** : 09 §5.3 (« L6 se développe SEUL ») · 09 §6 · 07 ligne L6, critère C1 (scénarios 6 et 7).

**Ce que dit la note** (§2) : « **L5a → L5b → L5c → (P-C) → L6 seul → (P-D)** ».

**Mesure** : PR **#50** (`gouvernance/chaine-photo`, ouverte le 2026-09-05 à 05h22, auto-merge armé)
acte, deux mesures indépendantes à l'appui, que « **aucune photo n'entre dans l'application** — ni
`type="file"`, ni `capture=`, ni `kind: 'photo'`, nulle part », que `compresserPhoto` (L5c) n'a aucun
appelant, et **tranche la création d'un incrément `L5d`, propriétaire de la chaîne photo de bout en
bout, « après P-C et avant L6c »**, l'envoi restant à L6c avec les chunks §9.6. La cause racine est
structurelle : « la charge locale est sérialisée en JSON avant chiffrement, et un `Blob` ne traverse
pas JSON » — il faut une table binaire **et** une montée de `VERSION_SCHEMA_LOCAL`.

**Conséquence double** : (a) la fenêtre « L6 seul » du 09 §5.3 n'est plus vraie telle que la note
l'écrit ; (b) les scénarios **6** (200 photos en file) et **7** (reprise d'upload à 80 %) — dont le 7
est un critère d'acceptation nommé du 07 — **ne sont pas atteignables sans L5d**.

**Ce n'est pas une faute de la note** : elle date du 2026-09-03, l'arbitrage du 2026-09-05.

**Levée** : arbitrage **A01** sur la place de L5d (avant l'ouverture de L6a, ou en série entre L6b et
L6c) tracé dans `DECISIONS.md`, et §2/§3 de la note mis à jour. **C'est une décision de séquencement :
elle appartient à A01, pas au gardien.**

### B5 — le glob de couverture ne couvrira pas la route serveur (la doctrine du fichier, appliquée deux fois déjà)

**Sections** : 09 §3 (DoD, couverture ≥ 90 % **mesurée** sur les modules critiques) ·
`.github/coverage-critical-paths.json`, bandeau et jurisprudence interne.

**Ce que dit la note** (§3) : globs `apps/field/src/sync/**` · `apps/api/src/sync/**`, déplacés de
`cheminsAttendus` vers `cheminsCritiques` par L6a.

**Mesure** : les deux globs **existent bien** dans `cheminsAttendus`, lot `L6a`,
`"statut": "non livre"` — **le point 6 du contrôle est CONFORME** —, et les répertoires sont
effectivement absents du dépôt (`ls apps/api/src/sync` → n'existe pas). **Mais l'arborescence réelle
de l'API place les routes dans `apps/api/src/routes/*.ts`** (9 fichiers : `missions.ts`,
`interviews.ts`, `scoping.ts`…), **hors de `apps/api/src/sync/**`**. Or c'est la route qui portera le
contrôle de propriété §9.9 et le contrat de résultats §9.3.

**Le fichier de couverture a déjà tranché ce cas deux fois**, et le dit dans ses propres termes :
« un seuil qui mesure le dépôt mais pas la route mesure **la moitié qui ne décide de rien** »
(entrée `scoping`), puis à nouveau pour `users` (« le dépôt était sous seuil, la route non »).
Répéter la faute une troisième fois sur le lot le plus critique du projet serait difficile à tenir à
P-D.

**Levée** : soit la note inscrit `apps/api/src/routes/sync.ts` comme troisième glob, soit elle décide
que les routes de sync vivent DANS `apps/api/src/sync/**`. **Une ligne, mais elle se prend avant la
première ligne de code** : elle fixe l'arborescence.

---

## 6. RÉSERVES POUR LA PORTE P-D (5) — n'empêchent pas d'ouvrir L6

### R1 — PD6 est périmé : le suivre serait une RÉGRESSION

**Ce que dit la note** : « `appliquerDescente` n'écrit sa clé `meta` que si `conservees > 0` et ne la
remet jamais à 0 […] L6b remet à zéro ou n'affiche pas. »

**Mesure**, `apps/field/src/local/ecriture.ts` (présent sur `d666d1b` **et** sur `origin/lot/l5b`) :
l'écriture est **inconditionnelle**, et le commentaire nomme la correction — « *Écrit à CHAQUE lot,
zéro compris : la valeur décrit CE pull, pas l'histoire de l'appareil. N'écrire que les valeurs non
nulles laissait un compte d'hier survivre à un pull propre — réserve R-L5a-3.* »

**Le défaut décrit a donc déjà été réparé**, entre la rédaction de la note et aujourd'hui. Un
implémenteur qui applique PD6 littéralement ajouterait une remise à zéro redondante — ou, pire,
« corrigerait » l'écriture inconditionnelle en la reconditionnant, réintroduisant R-L5a-3.

**Levée** : PD6 supprimé ou réécrit en « déjà traité par L5a, R-L5a-3 — L6b consomme la clé telle
quelle ».

### R2 — `attachment_uploads` n'est pas nommée

04 pose `attachment_uploads(attachment_id PK, mission_id, created_by, chunk_size_bytes,
chunks_attendus, chunks_recus JSONB, sha256_attendu, statut, expire_le, …)` avec, en commentaire, la
raison exacte : un simple compteur « ne permettrait PAS de répondre *lesquels manquent*, qui est
exactement ce que le §9.6 demande ». C'est **la** table de la reprise d'upload — donc du critère C3.
La note ne nomme que `processed_ops`. À inscrire au périmètre de L6c. Noter aussi que `created_by` y
est posé pour appliquer §9.9 aux routes de chunks, point que la note ne traite pas.

### R3 — citation fautive des routes de chunks (§4-4)

La note écrit : « `POST /v1/sync/push`, `GET /v1/sync/pull`, et les trois routes de chunks §9.6 —
**toutes listées 05 §8.4/§24.2**. Aucune route hors liste. »

**Vérifié** : 05 §8.4 ne liste que `GET /v1/sync/pull`, `POST /v1/sync/push` et **`POST
/v1/sync/attachments/:id` (upload multipart)**. Les trois routes de chunks (`POST …/chunks/:index`,
`GET …/status`, `POST …/complete`) **n'apparaissent qu'au §9.6** ; **§24.2 n'en cite aucune**. Elles
sont donc bien spécifiées — 11 §8-6 est satisfait, ce n'est **pas** un écart — mais la citation est
fausse, et elle masque une vraie question : **que devient `POST /v1/sync/attachments/:id` du §8.4 ?**
(doute D4).

### R4 — l'archive `answer_revisions` couvre TROIS entités depuis l'amendement S-4

PD5 dit « `superseded` archive la valeur perdante (`sync_arbitrage`) » sans dire **de quoi**. Le 04
(amendement S-4 du 2026-08-31) est explicite : §9.4 étend le dernier-écrit-gagne aux **trois** entités
synchronisées (`answers`, `interviews`, `attachments`), la table porte désormais
`entity_type CHECK IN ('answer','interview','attachment')` + `entity_id`, et le commentaire du 04
nomme le risque : « sur le scénario *deux appareils* — **un critère d'acceptation `@critique`** — la
valeur perdante d'un ENTRETIEN ou d'une PIÈCE JOINTE disparaissait SANS TRACE ». C'est le scénario 5.
À inscrire à L6a.

### R5 — la partie VISIBLE de L6b n'a pas de plan DoD

« Statuts visibles » (L6b) est de l'interface : file en attente, « à examiner », ops « rejetées »
(§9.9), notification « n réponse(s) arbitrée(s) » cliquable (§9.3). La DoD transverse (09 §3) exige
**les 4 états (03 §33.2) sur tout écran livré** et **axe-core vert**. Le §6 de la note ne mentionne ni
l'un ni l'autre : il ne parle que de Playwright, k6 et couverture. À compléter avant P-D.

---

## 7. LES 8 INVARIANTS (00_INDEX) — appliqués à la note

| # | Invariant | Verdict sur la note |
|---|---|---|
| 1 | Offline-first, **UUID v7 client**, push idempotent | **OK** — §4-1 fonde l'idempotence sur `opId` v7 client + upsert par `entityId` (les deux ceintures du 11 §4) ; PD2 rappelle que les deux ids d'une question ad hoc viennent du client (P1-4) |
| 2 | Aucune référence client dans le code | **OK** — la note ne nomme aucun client |
| 3 | RBAC serveur, financier admin, **écritures de sync réservées au propriétaire §9.9** | **ÉCART — B1**. Le principe est posé (§1, §3, PD4) mais le résolveur décrit est faux pour `attachment_meta` sans entretien |
| 4 | Aucune couleur/taille en dur | sans objet à ce stade — **redevient exigible sur les statuts visibles de L6b (R5)** |
| 5 | Interface 100 % français, horodatages UTC | **OK** — messages en français dans les interfaces gelées ; `isoUtcSchema` sur `clientUpdatedAt`, `serverTime`, `nextSince` |
| 6 | Le terrain collecte, **le siège produit** | **OK, et explicitement** : §1 « le serveur ne recalcule pas une valeur : il l'accepte, la refuse, ou l'arbitre ». Contrôlé contre le découpage : **rien ne le contredit**. PD3 (le serveur matérialise `answer_revisions` sur diff de `value`) est de l'**arbitrage** prescrit par 05 §9.3, pas du calcul métier ; le scoring est exclu nommément |
| 7 | Toute correction = révision tracée, rien d'écrasé en silence | **OK sur le principe** (PD5 : « aucune suppression silencieuse »), **incomplet en portée — R4** ; et **mis en défaut par B1** (une note volante bloquée en « à examiner » est une donnée qui ne remonte jamais) |
| 8 | Sauvegarde terrain, sync ≥ 1×/jour, export testé | **OK partiellement** — §4-2 gèle `evaluerAlerteSauvegarde` et `DELAI_ALERTE_SANS_SYNC_MS`, mais **rien ne dit qui alimentera `derniereSyncReussieLe`** côté local ni `sync_log` côté serveur (**B3**) |

## 8. INTERDICTIONS 11 §2 — aucune enfreinte par la note

UUID v7 applicatif, jamais SQL : **respecté** (§4-1, PD2) · pas de Next : sans objet · pas de Prisma
ni de SQL concaténé : rien de contraire · pas de CORS : la note ne pose que des routes `/v1/sync/*`
du même domaine · **MinIO jamais exposé** : la note ne nomme pas MinIO (O4) mais ne propose aucun
accès direct · aucune donnée personnelle dans les logs : non traité, non enfreint · aucun secret
versionné : sans objet · **aucun test skippé** : la note marque les 8 scénarios `@critique` et
« rejoués à chaque commit » — conforme.

Aucune dépendance hors 11 §1 n'est proposée (Playwright, k6, Dexie, Zod : tous épinglés).

## 9. OBSERVATIONS (5)

**O1 — l'écart de format : 126 lignes contre « ≤ 1 page » (09 §3-1bis). ACCEPTÉ.**
Et c'est un choix, pas une complaisance. Mesure des cinq notes du dépôt : **LOT_L7 476 · LOT_L2 247 ·
LOT_L5 191 · LOT_L3 139 · LOT_L6 126**. La note L6 est **la plus courte de la série**, sur le lot le
plus critique. Refuser celle-là au nom d'une norme que les quatre autres — toutes utilisées, aucune
recalée — enfreignent davantage serait un veto de forme ; et un veto de forme sur le chemin critique
est exactement ce que le droit de veto ne doit pas être. La densité est réelle : PD1 à PD7 tiennent
en 33 lignes et contiennent trois constats vérifiés au code.
**Mais la dérive doit se dire** : « ≤ 1 page » est du texte de spec que plus aucune note ne tient.
Une ligne `DECISIONS.md` (D-A) doit soit amender la règle, soit la rétablir — faute de quoi la
sixième note fera 500 lignes et personne ne pourra plus dire pourquoi c'est trop.

**O2 — l'affectation croisée §7 s'écarte des gabarits du 09 §1, sans que ce soit un écart net.**
La note confie la **réception serveur, `processed_ops` et §9.9** à **A23** et ses tests d'intégration
à **A27**. Or 09 §1 décrit A23 comme « pilote de mission + validations d'étapes » et A27 comme
« testeur multi-appareils (iPad Safari + desktop) » ; il place explicitement « propriété de session
§9.9 » dans le gabarit **A14** et « idempotence » dans celui d'**A16** (équipe 1). Le même 09 §1
place cependant **le lot L6 tout entier dans l'équipe 2**. La contradiction est **interne au 09**, pas
imputable à la note. La règle de croisement 09 §5.6 (le testeur n'est jamais l'auteur) est, elle,
**respectée sur les quatre lignes**. À trancher d'une ligne par A01 (D-B).

**O3 — aucune note de conception du dépôt ne porte de renvoi E1-E47.** Vérifié sur les cinq
(`grep -o "E[0-9]\{1,2\}"` = 0 sur toutes). 09 §3-1bis n'exige de la note que « découpage, interfaces
exposées, points durs, plan de tests » : **ce n'est donc pas une réserve** — le gardien n'exige pas ce
qui n'est écrit nulle part. C'est une proposition uniforme pour les notes à venir ; les fichiers de
code, eux, portent déjà leur ligne « Traçabilité : E7, E9, E38 ».

**O4 — MinIO n'est nommé nulle part** alors que L6c assemble les chunks. 11 §2 impose « MinIO jamais
exposé publiquement ; tout download passe par l'API (streaming + RBAC) ». À rappeler d'une ligne au
périmètre L6c pour que l'implémenteur ne parte pas sur une URL présignée.

**O5 — `apps/field/src/local/contrat-sync.ts` porte une prémisse périmée** : il affirme que
`packages/shared/src/sync.ts` « n'est PAS encore ré-exporté par le baril » et importe par chemin
profond (`../../../../packages/shared/src/sync.js`). Or `packages/shared/src/index.ts:26` contient
bien `export * from './sync.js';`. Sans conséquence pour L6 (le détour est concentré dans un seul
fichier, comme promis), mais l'implémenteur de L6a lira ce fichier. **Hors périmètre de ce
contrôle** — signalé à l'équipe 2.

## 10. DOUTES DE SPEC À PORTER EN `DECISIONS.md`

Les trois de la note, re-qualifiés, plus trois nouveaux :

- **D1 (note) — règle de tri serveur à position égale.** *Légitime, à ouvrir en entrée de L6a.* La
  proposition de la note (`position, added_ad_hoc DESC, id`) est **vérifiée identique** au tri terrain
  livré (`ordonnerParcours`). Enjeu réel : sans elle, l'ordre du parcours terrain diverge de l'ordre
  du pull, du rapport §36.3 et de la console.
- **D2 (note) — `PHRASE_SCRIPT_ACCORD`.** *Toujours non arbitré au 2026-09-05* : aucune entrée
  `DECISIONS.md`, et 03 M3.2 comme 10 (U5) disent « phrase-script **fournie** » sans la fournir.
  Escalade Williams confirmée — **mais c'est un reste de L5b : il ne bloque pas L6.**
- **D3 (note) — `answers.revision` ignoré au profit du diff de `value`.** *Légitime.* Le constat de
  PD3 est **mesuré exact** ; la réponse est déjà écrite au 05 §9.3 V2.9 (« le serveur matérialise
  `answer_revisions` **quand `value` change** ») — l'entrée servira surtout à graver que le compteur
  client n'est PAS le déclencheur.
- **D4 (nouveau) — que devient `POST /v1/sync/attachments/:id` (05 §8.4, multipart) ?** Le §9.6 décrit
  un protocole de chunks qui semble s'y substituer. Deux routes pour un même geste, ou une seule ?
  11 §8-6 impose de documenter. (Lié à R3.)
- **D-A (nouveau, gouvernance) — la règle « note ≤ 1 page » (09 §3-1bis) est-elle amendée ou
  rétablie ?** Cinq notes, cinq dépassements (476/247/191/139/126). Une règle que personne ne tient et
  que personne n'amende s'éteint en silence. (Lié à O1.)
- **D-B (nouveau, gouvernance) — qui code la réception serveur de L6 ?** L'équipe 2 (09 §1 : « L6 »)
  ou les gabarits nommément compétents A14/A16 (09 §1 : « propriété de session §9.9 »,
  « idempotence ») ? (Lié à O2.)

---

## 11. CE QUI EST CONFORME, ET QU'IL FAUT DIRE AUSSI

- **Découpage §3 = 11 §6, mot pour mot.** Comparé ligne à ligne : L6a (outbox + push par lots +
  `processed_ops` + contrat §9.3 + propriété §9.9), L6b (pull delta + statuts visibles + backoff +
  « à examiner »), L6c (chunks §9.6 + les 8 scénarios + charge k6). Les précisions ajoutées par la
  note (lots de 100, curseur `nextSince` par mission, backoff max 1 min, 10e échec) sont toutes des
  **valeurs du pack**, pas des inventions.
- **Séquencement §2 : conforme à l'arbitrage A01 du 2026-09-03**, entrée `DECISIONS.md` « La phrase
  *L6 après L5a* du §9 : citation fautive, PAS arbitrage » — qui conclut, sur les mêmes citations
  (09 §6, 07 ligne L5 = trois incréments), que la fin de L5 est P-C. La note ne devine pas : elle
  applique.
- **Le séquencement reste tenable au vu du dépôt réel.** L5a (#30), L7a (#32) et **L5b (#31, mergé le
  2026-09-05 à 05h28, `da7e8c9`)** sont dans `main` ; L5c a déjà refusionné `main` et n'attendait que
  #31 — **la dépendance est levée depuis ce matin**. Rien n'empêche P-C, hors B4 (place de L5d) et le
  point ZAP hérité (`ZAP_BLOQUANT` resté à `false`), qui est hors périmètre L6 mais conditionne la
  DoD sécurité des portes à venir.
- **Globs de couverture (point 6 du contrôle) : CONFORME.** `apps/field/src/sync/**` et
  `apps/api/src/sync/**` figurent bien en `cheminsAttendus`, lot `L6a`, `"statut": "non livre"`, avec
  leurs références (`07 §12 lot L6 · 05 §9 · 09 §3` et `07 §12 lot L6 · 11 §4 · 05 §9.3 et §9.9`). Les
  deux répertoires sont effectivement absents du dépôt. La phrase « L6a les déplace dans
  `cheminsCritiques` » est le geste exact prescrit par le mode d'emploi du fichier. B5 porte sur la
  **complétude** du périmètre, pas sur l'exactitude du constat.
- **Les quatre métriques.** La note exige la couverture « sur quatre métriques (lines, statements,
  functions, branches) » : c'est **exactement** `metriquesControlees` du fichier de couverture. Le
  détail « la métrique `functions` décroche en premier » est une observation utile, pas une règle
  inventée.
- **`@filrouge` sur FIL-TPE ET FIL-GC** (§6) : conforme 09 §4bis et à la DoD transverse.
- **Aucune fiche AMELIORATIONS d'étage 2 anticipée** ; aucun budget d'étage 1 engagé par la note.

---

## 12. SIGNATURE

**Critères du lot (07 ligne L6)** : 4/4 portés par un incrément — **C1 partiellement** (3 des 8
scénarios sans porteur : 6 et 7 → B4 ; 8 → B2).
**Complétude 07 → note** : 10/10 items présents, **0 ajouté** (aucun code orphelin pré-annoncé).
**Interfaces gelées** : **10/10 identifiants vérifiés présents, aux mêmes noms** ; diff de 6 lignes de
commentaire depuis la rédaction.
**Points durs** : **6 exacts / 1 périmé** (PD6 → R1).
**Invariants** : 1 OK · 2 OK · **3 ÉCART (B1)** · 4 différé (R5) · 5 OK · 6 OK · 7 incomplet (R4, B1) ·
8 incomplet (B3).
**Interdictions 11 §2** : aucune enfreinte.
**Globs de couverture** : conformes (réserve de complétude B5).
**Format** : écart assumé — **accepté**, motivé (O1).
**Motifs de VETO** : **aucun.**

> **VERDICT : ACCEPTÉE SOUS RÉSERVE.**
> **L6 ne s'ouvre pas tant que B1 à B5 ne sont pas levées** — par un amendement daté de
> `docs/conception/LOT_L6.md` (B1, B2, B3, B5) et un arbitrage A01 tracé dans `DECISIONS.md` (B4).
> R1 à R5 se lèvent avant **P-D**. Aucune ne demande de rouvrir le découpage, ni de toucher au 04.
>
> Signature conformité + traçabilité : **A02 — 2026-09-05**.
> Reste à obtenir pour que l'étape 1bis soit complète (09 §3-1bis) : **la validation d'A01**.

*Fichier déposé, NON COMMITÉ — règle du 2026-09-05 : « un réviseur qui commite est un écrivain ».
C'est au pilote de le commiter.*
