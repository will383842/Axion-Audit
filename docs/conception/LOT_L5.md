# LOT L5 — PWA terrain — note de conception (pipeline 09 §3, étape 1bis)

> **Auteur** : A20 (chef d'équipe front) · **À valider par** : A01 + gardien A02, **avant la première
> ligne de code**. · **Branche de la note** : `lot/l5-conception` (worktree isolé).
> **Périmètre et critères : 07, ligne L5 — et rien d'autre** (8 j). Découpage L5a/L5b/L5c **imposé
> par 11 §6** ; cette note ne le réinvente pas, elle le rend PARALLÉLISABLE.
> **Lu dans l'ordre imposé** : 11 → 03 (M3, §17, §19, §22.1, §25, §27, §32.5, §33, §34.2) → 01 §20.4
> → 05 (§9, §31) → 06 §10 → 07 (ligne L5) → `CLAUDE.md` → `LOT_L2.md` (forme).
> **Cette note ne code rien, et L5 n'ouvre pas** : la porte P-C commande. Elle existe parce que
> `CLAUDE.md` §4-1bis l'exige AVANT le code, pas parce que le code serait autorisé.

---

## 1. Découpage — trois incréments, un seul fichier partagé, nommé

| Inc.    | Livre                                                                                                                                                                                                                                                                                                              | **Ne livre PAS**                                                                                            | Dépend de                       | Agent   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------- |
| **L5a** | Le SOCLE, aucun écran de collecte : `BaseLocale` (Dexie 4, versions locales §31-1) · coffre DEK/KEK (§9.7) · **le port d'écriture** `ecrireLocal`/`appliquerDescente` · `horloge` (décalage serveur §9.2) · verrou 15/60 min + Wake Lock · coquille PWA + service worker Workbox · `storage.persist()` (§31-2) · embarquement d'une mission (**premier pull, complet**) | aucun push, aucun pull delta (L6) · aucun export de secours · aucun écran d'entretien                            | L1 (schéma), L3d (figeage)      | **A24** |
| **L5b** | L'ÉCRAN 3 zones (M3.1) : « Nouvel entretien » 3 champs (§17.4) · les **11** types de `TYPES_DE_REPONSE` · mode fourchette + non communiqué (§27.4) · à-revoir / N-A · notes de question + bloc-notes + **note volante** (`attachments.kind='note'`) · question **ad hoc** · **hors-parcours** (§25.4) · raccourcis §33.3 · mode écran partagé · indicateur « Enregistré » | agenda · types de session autres qu'`entretien` · terminer/valider · photos                                     | L5a (socle gelé)                | **A22** |
| **L5c** | LA JOURNÉE : cockpit « Aujourd'hui » (§34.2) · agenda (§25.2) + démarrage pré-rempli en un tap · les 6 `kind` dont atelier · proposition d'unité (§25.3) · entretien complémentaire (§25.6) · **terminer ≠ valider** (§19.1, guidé strict/expert, validation groupée) · fin de visite / fin de journée · compression photos R2 · **export de secours** `.axionbackup` (11 §4) · bandeau de mise à jour (§31-1) | la synchronisation elle-même (L6a/b)                                                                            | L5a ; **L5b** pour l'écran validé | **A23** |

**Séquence** : L5a **seul** (rien ne compile sans lui). Puis **L5b ‖ L5c** — fichiers disjoints par
construction : `src/ecrans/entretien/**` (A22) contre `src/ecrans/journee/**` (A23), domaines
`src/session/**` (A22) contre `src/agenda/**` + `src/sauvegarde/**` (A23).
**Le seul fichier commun est `apps/field/src/app/vues.ts`** — registre des vues, **strictement
append-only, une ligne par écran**. Créé par L5a avec les vues du socle ; L5b puis L5c y ajoutent
leurs lignes dans cet ordre de fusion. Aucun autre fichier n'est écrit par deux incréments : si un
troisième candidat apparaît, il remonte à A20 avant d'être touché, il ne se partage pas.
Tests : **A26** (E2E offline) et **A27** (multi-appareils) — ni l'un ni l'autre n'écrit de code de
production (09 §5.6). Revue croisée intégrale : **A29**. Accessibilité et budgets : **A28**.

**Pas de routeur.** `react-router` n'est pas dans la liste 11 §1 et une PWA verrouillée n'a ni URL
partageable ni SEO ; la règle « rouvrir l'app = revenir exactement à la question en cours » (§17.4)
est servie par la PERSISTANCE (`meta.vueCourante`), jamais par une URL. L5a livre donc un réducteur
`NavigationTerrain` + React context ; état lu par `useLiveQuery` (dexie-react-hooks, épinglé).
**Coût assumé, à ne pas découvrir en recette** : le geste « retour » système (Android, swipe iPad)
doit être capté explicitement — c'est une tâche de L5a, pas un effet de bord.

---

## 2. Interfaces — publiées par L5a le premier jour, sinon L5b et L5c attendent

| Fichier                                | Signature (extrait qui ENGAGE)                                                                                                                                                                                                   | Consommée par                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `src/local/base.ts`                    | `class BaseLocale extends Dexie` — tables `missions, missionQuestions, orgUnits, interviews, answers, attachments, workAssignments, outbox, meta` (05 §9.1) ; `export const VERSION_SCHEMA_LOCAL = 1`                                 | tout                         |
| `src/local/ecriture.ts`                | `ecrireLocal<E extends EntiteSync>({entite, id, missionId, action, index, charge}): Promise<void>` — **UNE** transaction Dexie sur `[table, 'outbox']` · `appliquerDescente(lot: LotDescendant): Promise<void>` — **n'écrit JAMAIS dans `outbox`** | L5b, L5c, L6b                |
| `src/local/coffre.ts`                  | `deriverKek(mdp, sel): Promise<CryptoKey>` (Argon2id, `hash-wasm`) · `ouvrirCoffre(kek, dekEnveloppee): Promise<Coffre>` · `Coffre.dechiffrer<T>(e: Enveloppe, s: ZodType<T>): Promise<T>` · `reenvelopperDek` · `verrouiller(): void` | L5a, L5c (export)            |
| `src/local/horloge.ts`                 | `maintenant(): string` (ISO 8601 UTC) · `reglerDecalage(serverTime: string): void`                                                                                                                                                   | tout écrivain                |
| `src/local/depots/*.ts`                | `depotSessions.duJour(): Promise<SessionLocale[]>` · `depotReponses.parSession(id)` · `depotQuestions.rechercher(texte)` (§25.4) — **lecture seule, indexée**                                                                          | L5b, L5c                     |
| `src/session/machine.ts`               | `type EtatSession = 'non_demarre'\|'en_cours'\|'termine'\|'valide'` · `TRANSITIONS_SESSION` · `peutTransiter(etat, action, profil: 'guide_strict'\|'expert'): Autorisation`                                                            | L5b (saisie), L5c (validation) |
| `src/app/verrou.ts`                    | `useVerrou()` · `DELAI_INACTIVITE_MS = { horsSession, sessionActive }` (15 / 60 min, §9.7)                                                                                                                                            | coquille                     |
| `src/sync/port.ts`                     | `interface PortSync { synchroniserMaintenant(): Promise<ResultatSync>; etat(missionId): EtatSyncMission }` — **déclaré ici, IMPLÉMENTÉ par L6a**                                                                                       | L5c (fin de journée), L6a    |
| `packages/shared/src/sync.ts`          | `ENTITES_SYNC` · `operationSchema` (11 §4) · `lotPushSchema` · `reponsePushSchema` (`applied\|duplicate\|superseded\|forbidden\|error`) · `reponsePullSchema` (`{serverTime, changes, nextSince}`)                                     | L5a **et le serveur L6**     |
| `packages/ui`                          | **existe déjà** : `EchelleAncree, SegmenteONA, SaisieFourchette, PastilleSync, IndicateurEnregistrement, BandeauPartage, AnneauProgression, CarteSyntheseEntretien, EtatVide/EtatErreur/EtatHorsLigne/Squelette/ZoneEtat` — L5 **compose**, ne recrée rien | L5b, L5c                     |

`ChargeUtile<E>` / `ClesIndex<E>` sont des types **mappés par entité**, pas des `Record<string, unknown>` :
c'est ce qui rend le §3.2 vérifiable par le compilateur plutôt que par la vigilance.

---

## 3. Points durs

**3.1 Le hors-ligne intégral n'est pas un mode : c'est le seul chemin.** L'UI lit **toujours**
IndexedDB (05 §9.2-3). Conséquence gravée dans le service worker : **précache du shell, des polices
auto-hébergées et des icônes — et AUCUNE mise en cache d'exécution de `/api`.** Un
`StaleWhileRevalidate` sur l'API fabriquerait une seconde source de vérité et l'écart ne se verrait
qu'en mission. Tout `id` créé sur l'appareil vient de `uuidv7()` (P1-4) — **jamais** d'une fonction
SQL, jamais du serveur.

**3.2 Le chiffrement local casse les index — et c'est la décision de L5a.** 06 §10.5 exige
« IndexedDB chiffré » ; une ligne entièrement chiffrée n'est plus interrogeable, donc ni le cockpit,
ni la recherche hors-parcours, ni le verrou 60 min ne fonctionnent. **Arbitrage : chiffrement par
ENREGISTREMENT avec un en-tête d'index en clair.** Restent en clair, et la liste est fermée :
`id`, `missionId`, `interviewId`, `missionQuestionId`, `orgUnitId`, `kind`, `status`,
`scheduleStatus`, `scheduledAt`, `flagReview`, `notApplicable`, `withheld`, `horsParcours`,
`clientUpdatedAt`, `position` — **et, depuis le 2026-09-02, `supprimeLe` et `answerId`** : le premier
pour filtrer les lignes supprimées sans déchiffrer (budget A28), le second comme clé structurelle
d'une pièce jointe vers sa réponse ; aucun n'est personnel, et la liste reste fermée
(`DECISIONS.md` du même jour, sur constat du testeur A26) ; **et, le même jour sur revue A29,
`answerType`, `criticality` (métadonnées de question, pour afficher la bonne saisie sans déchiffrer) et
`orgUnits.parentId` (structure de l'arbre)** — aucune personnelle, la liste reste fermée. Tout le reste — `personName`, `personEmail`, `value`, `note`,
`generalNotes`, `content` d'une note volante, `participants` — vit dans `charge: Enveloppe`.
**Règle jumelle de la redaction pino (11 §2) : aucune donnée personnelle ni contenu de réponse dans
un index local.** Le texte figé des questions (`*_snapshot`) n'est pas une donnée personnelle : il
est indexé en clair, c'est ce qui rend la recherche §25.4 possible hors ligne.

**3.3 La KEK dérive du mot de passe et de rien d'autre** (§9.7, « décision gravée » : pas de PIN, pas
de schéma). Ce que L5 doit produire pour que le garde-fou serveur §9.7 ait un sens, en trois points
concrets : ① l'`outbox` est la **seule** file, et **rien n'en sort sans une réponse serveur** —
`forbidden` et `error` vont vers un état VISIBLE, jamais vers une suppression (§9.3) ; ② le compteur
qui alimentera `sync_log.outbox_remaining` est donc **vrai par construction**, pas déclaratif ;
③ un changement de mot de passe **en ligne** est un ré-enveloppement (`reenvelopperDek`), et l'écran
avertit explicitement quand l'outbox n'est pas vide — le garde-fou serveur refuse, l'app terrain ne
doit pas laisser croire le contraire. Budgets A28 (11 §4) : **chiffrement < 50 ms/écriture,
dérivation < 1 s sur tablette** — mesurés, pas supposés (§4).

**3.4 Dexie + Workbox.** Migrations locales versionnées et testées « v_n → v_n+1 avec outbox non
vide » : une mise à jour ne doit **jamais** invalider une donnée non synchronisée (§31-1). Le service
worker **télécharge** en arrière-plan mais `appliquerMiseAJour()` **refuse** tant qu'une session est
`en_cours` sur l'appareil — bandeau discret, geste de l'auditeur, jamais d'activation automatique.
`navigator.storage.persist()` au premier embarquement : **refus = mission NON embarquée** + écran
qui guide (§31-2), pas un avertissement qu'on clique pour passer outre.

**3.5 « Le terrain collecte, le siège produit » — où passe exactement la frontière.** Sur
l'appareil : les écritures locales, les **compteurs de SES propres lignes** (complétude d'une
session, à-revoir ouverts, alertes du cockpit — §34.2 V2.9 les dit calculées localement), la
recherche plein texte dans le questionnaire figé, et **la compression des photos** (R2 — exception
délibérée : elle réduit ce qu'il faudra téléverser). Jamais sur l'appareil : le **scoring** (§32.1,
L8), l'agrégation multi-sessions et la triangulation (§27.2), l'assemblage du questionnaire (L3,
seuls les `*_snapshot` descendent), le DOCX, le LLM et la pseudonymisation. **Règle
opérationnelle** : le terrain ne calcule que ce qui porte sur ses propres lignes locales et sert la
prochaine action ; tout ce qui agrège plusieurs auditeurs ou produit un livrable est siège.
Compression sans dépendance nouvelle : `createImageBitmap` + `OffscreenCanvas.convertToBlob`
(repli `<canvas>` si indisponible) — `browser-image-compression` n'est pas dans 11 §1.

**3.6 L'invariant 8 devient un bouton, et le bouton ne doit pas mentir.** « Fin de journée »
(§34.2) = sync forcée + export de secours + synthèse. **Or L6 n'existe pas quand L5c se code.**
L5a livre `PortSync` et une implémentation **inerte** ; la tentation est de la faire répondre
« tout va bien ». Elle rend `{ statut: 'indisponible' }` et l'écran l'affiche tel quel — jamais une
pastille verte. Une pastille qui verdit sans serveur, c'est exactement le garde-fou qui annonce plus
qu'il ne fait ; L6a **remplace** cette implémentation, il ne l'étend pas. L'export `.axionbackup`
(11 §4), lui, fonctionne **sans réseau** : clé dérivée du **mot de passe** (sel dans l'en-tête, pas
la DEK d'appareil) — c'est ce qui le rend restaurable sur un second appareil ; fusion à l'import par
UUID, **une op locale plus récente n'est jamais écrasée**. L'alerte « aucune sync depuis 24 h » est
calculée localement, à partir du dernier succès du port.

**3.7 Les 4 états et axe-core.** Les quatre états (§33.2) sont livrés par écran via `ZoneEtat` de
`packages/ui` — vide, chargement (squelettes aux dimensions finales), erreur (cause + action), hors
ligne. Un écran sans ses quatre états ne passe pas la revue d'A29. **`axe-core` n'est ni installé ni
en CI** (vérifié) alors que la DoD transverse et 03 §19.3-4 l'exigent → escalade, §5.4. Aucune
couleur ni taille en dur : les jetons de `packages/ui` uniquement (invariant 4), déjà tenu par
`invariant-tokens.test.tsx`.

---

## 4. Plan de tests — ce qui s'écrit AVANT le code, et par qui

**Croisement (09 §5.6)** : A22, A23 et A24 n'écrivent **aucun** test de leur propre code. Les tests
de socle et de crypto sont écrits par **A26**, ceux d'interface par **A27**, la revue est d'**A29**.

| Test                                                                                                                                   | Projet          | Écrit AVANT le code |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------- |
| **Coffre** : dérivation Argon2id déterministe, aller-retour chiffrer/déchiffrer, `dechiffrer` rejette un schéma Zod non conforme, `verrouiller()` efface la DEK, ré-enveloppement conserve les données | `unit`          | **OUI (TDD)**       |
| **Machine à états de session** : les 4 états × toutes les actions × 2 profils ; **terminer ≠ valider** (rouvrable tant que non validé) ; toute transition interdite rejetée avec motif | `unit`          | **OUI (TDD)**       |
| **Port d'écriture** : `ecrireLocal` écrit ligne + op dans **une** transaction (échec injecté ⇒ ni l'une ni l'autre) ; `appliquerDescente` n'écrit **jamais** dans `outbox` | `unit`          | **OUI (TDD)**       |
| **Étanchéité de l'index** : balayage de toutes les tables locales après un scénario complet — aucune sentinelle personnelle (nom, e-mail, contenu de note, valeur de réponse) hors de `charge` | `unit`          | oui                 |
| **Interdits outillés** : `new Date()` hors `horloge.ts` · écriture Dexie hors `ecriture.ts` · `TYPES_DE_REPONSE` non exhaustivement traité (`switch` exhaustif vérifié) | `unit` (ESLint) | oui                 |
| **Migration locale v1→v2 avec outbox non vide** : aucune perte                                                                          | `unit`          | oui                 |
| 4 états × chaque écran + navigation clavier intégrale + raccourcis §33.3 inactifs dans un champ de saisie + mode écran partagé masque tout ce qui est interne | `interface`     | non                 |
| **E2E `@critique`** : mode avion intégral (`context.setOffline(true)`) — session créée, 11 types répondus, note volante, ad hoc, hors-parcours, terminée · **kill de l'onglet en pleine saisie = zéro perte** · horloge locale +3 h · export de secours créé puis **restauré sur un 2ᵉ profil navigateur, données identiques** · refus de `persist()` ⇒ mission non embarquée · SW ne s'active pas pendant une session `en_cours` | `e2e`           | non                 |
| **Budgets A28** : chiffrement < 50 ms/écriture, dérivation < 1 s, p95 interaction < 100 ms                                              | `e2e`           | non                 |

**Couverture ≥ 90 % mesurée** sur `apps/field/src/local/**` et `apps/field/src/session/**` (crypto
locale + machine à états = « modules critiques » de la DoD). `@filrouge` reste vert à chaque fusion.
**Limite assumée, déjà écrite au 11 §7** : Playwright ne couvre pas le service worker sous iOS — le
**mode avion réel sur tablette** se rejoue à la main aux portes P-C et P-E (A27, checklist §15).
Ce n'est pas un trou qu'on découvre, c'est un trou qu'on nomme.

---

## 5. Ce que cette note NE tranche PAS — à arbitrer avant la première ligne de code

1. **`vite-plugin-pwa` n'est pas dans 11 §1**, et Workbox 7 seul n'a pas d'intégration Vite. Ma
   proposition : **aucune dépendance nouvelle** — `workbox-build` en `injectManifest` depuis un
   `scripts/build-sw.mjs`, dans l'esprit « Workbox 7 » déjà épinglé. Si A01 préfère le greffon, c'est
   une escalade §8-1. **Tranché avant L5a, pas pendant.**
2. **`axe-core` est exigé par la DoD et absent du dépôt** (§3.7). `@axe-core/playwright` est hors
   liste §1 → escalade. Sans arbitrage, la case « axe-core vert » de la porte P-C est **incochable**,
   exactement comme l'était le critère d'habilitation de L2. Je refuse de la cocher à la main.
3. **`packages/shared/src/sync.ts` est-il écrit par L5a ou par L6a ?** Le 07 donne le moteur de sync à
   L6. Mais l'`outbox` de L5a doit **déjà** avoir la forme du contrat d'op (11 §4), sinon L6a réécrit
   tous les sites d'écriture. Je propose que **L5a l'écrive et que L6 l'implémente côté serveur**.
   C'est une décision de séquence, pas de goût : A01.
4. **Le port de sync inerte (§3.6) ira-t-il jusqu'à P-C ?** Si oui, la démo de « Fin de journée »
   montre un export réel et une sync indisponible. Je crois que c'est la bonne honnêteté ; **A02 doit
   dire si le critère 07 « écran Aujourd'hui, sync par mission » est cochable dans cet état**, ou
   s'il descend en L6b comme l'habilitation est descendue en L3d.
5. **`interviews.mode` n'a pas de valeur par défaut SQL** (04 : « défaut APPLICATIF `sur_site` si
   `kind='entretien'`, NULL sinon »). Ce défaut applicatif vit-il côté terrain (L5c) ou côté serveur
   (L6a) ? S'il vit des deux côtés, les deux dériveront. Je propose **terrain uniquement** — c'est là
   que la session naît. À confirmer.
6. **Le « parcours express R1 » de la validation d'entretien** (07, ligne L5) n'est décrit nulle part
   dans 03 §19.1, qui ne connaît que guidé strict / expert et la validation groupée V2.10. Je ne sais
   pas ce que R1 désigne. **Devine interdite : Williams.**
7. **Chef d'équipe** : 09 §1 nomme A20 « chef d'équipe front » — L5 est bien le lot d'A20, contrairement
   au doute laissé au §6.7 de la note L2. Aucune correction attendue ici.

---

*Note rédigée le 2026-08-31 (UTC) — aucune ligne de code L5 n'accompagne ce document, et aucune ne
doit être écrite avant la porte P-C.*
