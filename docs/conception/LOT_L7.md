# LOT L7-min — NOTE DE CONCEPTION (chantier C3, pipeline 09 §3)

> **Auteur** : A30 (chef d'équipe console) · **Branche** : `lot/l7a` (worktree `_axl7`, née de `main`
> @ `f7a11b6`). · **Périmètre et critères : 07, ligne L7-min — et rien d'autre** (2 j) : portefeuille,
> avancement mission, **couverture par unité ET par type de source §27.1**, agrégation par question
> (provenance + non-communiqué visibles), export CSV/JSON complet de mission ; critère : **le rapport
> §20.3 se rédige EN ENTIER depuis le ZIP §36.3** ; la couverture reflète le plan d'entretiens.
> **Lu dans l'ordre imposé** : 11 → 07 (L7-min, P-E) → 03 (§18, §22.3, M5, §27.1, §32.1, §33, §34.1,
> §36.3) → 01 §20.4 → 04 (`unit_scores`, `findings`) → `CLAUDE.md` §9 → `LOT_L3.md`/`LOT_L5.md` (forme).
> **L7 est un lot simple : pas d'étape 1bis (09 §3).** Cette note est le DÉCOUPAGE et le brief de L7a,
> pas une conception à valider avant le code — L7a est posé dans le même mandat.
> **Différable, hors de cette note** : L8 (scoring, radar), heatmap, centre d'alertes, avance/retard,
> espaces 3-7, simulateur de chiffrage — jalon P-DESCOPE du 15/09.

## 1. Découpage — trois incréments, fichiers disjoints

| Inc.    | Livre                                                                                                                                                                                                                                                       | Fichiers                                                                                                                    | Code    | Tests   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| **L7a** | La COQUILLE : AppShell §33.4 (7 espaces, fil d'Ariane, évitement) · routeur History API · client HTTP typé (Zod in/out, cookies same-origin, en-tête custom) · TanStack Query · **tour de contrôle** (chiffres clés + cartes) · **portefeuille** keyset · **avancement** (fiche, client, jalons §32.2) · connexion (côté client, A-006 côté API) · 4 états partout | `apps/hq/src/{App,main}.tsx`, `src/api/**`, `src/app/**`, `src/ecrans/{EcranAccueil,EcranPortefeuille,EcranAvancementMission,EcranConnexion}.tsx`, `src/format/**` | **A30** | **A36** |
| **L7b** | La COUVERTURE et l'AVANCEMENT réel : API `GET /v1/missions/:id/dashboard` (05 §8.3) + `GET /v1/missions/:id/coverage` (§16.6, §27.1 — unité × type de source, prévu/réalisé depuis le plan d'entretiens) avec **schémas dans `packages/shared`** · écran couverture (tableau dense, 150 unités FIL-GC, p95 < 100 ms) · bloc avancement sur l'écran mission | `packages/shared/src/pilotage.ts` (PR à part), `apps/api/src/{domaines,routes}/pilotage*`, `apps/hq/src/ecrans/couverture/**`, `src/api/requetes-pilotage.ts` | **A32** | **A36** |
| **L7c** | L'AGRÉGATION et l'EXPORT : API `GET /v1/missions/:id/aggregation?block=&service=` (05 §8.5 — par question, toutes réponses, provenance `answers.source`, non-communiqué + motif visibles) · export ZIP §36.3 **exact** (`mission.json`, `arbre.csv`, `sessions.csv`, **`reponses.csv`**, `constats.csv`, `cas_usage.csv`, `inventaire_outils.csv`, `registre_ia.csv`, `unites_hors_perimetre.csv`, `scores.csv` absent et signalé, `pieces_jointes/manifest.csv`) · espace 6 « Analyse & rapports » : agrégation + bouton d'export | `packages/shared/src/{agregation,export}.ts` (PR à part), `apps/api/src/{domaines,routes}/{agregation,export}*`, `apps/hq/src/ecrans/analyse/**` | **A31** (API export + écran) · **A35** (tableau d'agrégation) | **A36** |

**Séquence** : L7a d'abord (rien ne se rend sans elle). Puis **L7b ‖ L7c** — fichiers disjoints par
construction ; **le seul fichier commun est `apps/hq/src/app/espaces.ts`** (registre des 7 espaces,
append-only : on n'y change qu'une valeur de `livraison`). Un second candidat commun remonte à A30
avant d'être touché. Revue croisée intégrale : **A37**, qui ne produit rien.

**Ce que le 03 §36.3 impose et qu'aucun incrément n'improvise** : UTF-8 **avec BOM**, séparateur `;`,
`reponses.csv` trié bloc → unité → question, colonne `unite_in_scope` (jamais deux fichiers de
réponses), valeur APLATIE LISIBLE (choix = libellés, fourchette « 20 – 30 », tableau = JSON),
`scores.csv` **absent et signalé** tant que L8 n'est pas livré. Rejoué sur FIL-TPE **et** FIL-GC.

## 2. Interfaces exposées par L7a (et qui engagent L7b/L7c)

| Fichier                        | Ce qui ENGAGE                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/contrats.ts`          | **La seule couture avec `packages/shared`.** Aucun écran n'importe `@axion/shared`. Section A = ré-exports ; section B = extrait transitoire de L3 (voir §3.a) ; L7b/L7c y AJOUTENT leurs ré-exports.      |
| `src/api/client.ts`            | `ClientApi.lire(chemin, schema, {query, signal})` · `ecrire(chemin, entree, corps, sortie)` · `ErreurApi` (code, statut, message français) · `ErreurContrat` · `ErreurReseau`. `fetch` injecté, résolu à l'appel. |
| `src/api/auth.ts`              | `X-Axion-Client: console` sur TOUTE requête (custom = anti-CSRF ; identifie la console pour A-006) · `X-Axion-Csrf` en double-soumission si le cookie `axion_csrf` existe. **Aucun jeton stocké.**            |
| `src/api/requetes.ts`          | `useClientApi()` · `CLES` (`['missions', …]`, `['entreprises', id]`) · `usePortefeuille()` (`useInfiniteQuery`, curseur opaque) · `useMission(id)` · `useEntreprise(id)`.                                  |
| `src/app/etats.ts`             | `etatDeRequete({enAttente, erreur, vide}, {vide, actions, actionsIntrouvable, chargement}) → EtatZone` — **une seule traduction** erreur → cause + action ; tout écran passe par elle.                        |
| `src/app/routeur.ts`           | `Route` (`accueil` · `portefeuille` · `mission` · `inconnue`) · `hrefDeRoute` · `naviguer` · `auClicLienInterne` (fonction pure) · `useRoute`. L7b/L7c AJOUTENT une variante à l'union et un `case`.          |
| `src/app/espaces.ts`           | `ESPACES` (7, ordre §22.3), `livraison` ∈ {`L7a`, `L7b`, `L7c`, `differable`, `phase_2`}, `espaceOuvert()`. Append-only.                                                                              |
| `src/format/dates.ts`          | `formaterInstant(iso, fuseau)` (fuseau de MISSION) · `formaterDateCivile('AAAA-MM-JJ')` (jamais convertie) · `formaterPourcentage`.                                                                          |
| `src/tests-aide/**` (**A36**)  | `installerServeurFactice({role, missions, entreprises, taillePage, latence, panne})` — `fetch` remplacé, corps repassés par les schémas partagés, trace réseau intégrale.                                     |

## 3. Points durs

**a. La console lit une API qui n'est pas sur `main` — comment L7a est testable AVANT.** Les schémas
`missions`/`companies` vivent sur `lot/l3-suite` ; `lot/l7a` est née de `main`. Réponse en trois temps :
(1) **le contrat est la vérité, pas le serveur** — `src/api/contrats.ts` porte, section B, un **extrait
à l'identique** (provenance : `lot/l3-suite:packages/shared/src/missions.ts` @ `3742eef`, lignes citées)
des seules formes consommées ; ce n'est pas un mock, c'est une citation vérifiable par `git show` ;
(2) **un serveur factice qui ne sait produire que ce que le contrat accepte** : chaque réponse repasse
par `pageSchema(missionResponseSchema)`, `missionResponseSchema`, `companyResponseSchema`,
`apiErrorSchema` — une fixture qui invente une clé fait échouer le module à l'import ; il applique le
RBAC réel (admin seul, 403 sinon, 401 sans session), la pagination keyset avec curseur opaque, et sait
suspendre, rendre 500, couper le câble (les quatre états) ; (3) **dette datée** : à la fusion de L3, la
section B devient un ré-export (`export {…} from '@axion/shared'`) et le premier point de la revue A37
est de la supprimer. `packages/shared` n'est pas modifié par L7a. **Ce qu'on refuse** : appeler une
route dont `packages/shared` ne porte pas le schéma (11 §3) — d'où l'absence de `dashboard` en L7a.

**b. « Pixel par pixel » (09 §1) sous jsdom = DOM ET trace réseau.** Un montant masqué en CSS est dans
le DOM ; une route financière appelée « au cas où » est dans la trace. A36 balaie les deux : sentinelles
de la ceinture L2 (`apps/api/tests/aide/sentinelle-financiere.ts`, jamais recopiées), noms de champs,
vocabulaire de chiffrage, URLs. Corollaire assumé : **aucun mot financier sur un écran de L7a, même dans
une entrée grisée** — l'espace 4 s'affiche « Cadrage & chiffrage » (nom de M9, §18.1) tant qu'il est fermé.

**c. Pas de tempête de requêtes, pas de rejeu d'un refus.** `retry: false` : un 403 rejoué trois fois
est un contournement, pas de la résilience ; une panne se relance d'un bouton « Réessayer » visible.
A36 mesure `appels.length ≤ 3` après 1,3 s en session consultant.

**d. Fuseaux (invariant 5).** Un `TIMESTAMPTZ` s'affiche au fuseau de la mission (`Intl`, `timeZone`) ;
une `DATE` civile se rend telle quelle (jamais `new Date('2026-08-03')`). Fixture piège d'A36 :
`America/Los_Angeles`, livrée le 2026-09-02T03:30Z = **1er septembre 20 h 30** ; NDA signé le 3 août reste
le 3 août. Le fuseau est lisible sur l'écran.

**e. L'authentification, côté client seul.** 11 §3 impose cookies httpOnly + en-tête custom ; A-006
constate que le serveur ne dépose aucun cookie. L7a livre le formulaire (`loginRequestSchema` →
`POST /v1/auth/login`), l'en-tête custom, `credentials: same-origin`, **zéro jeton stocké**, et un
message honnête si un 401 suit une connexion acceptée (« session non ouverte côté serveur »). Le
branchement API est C1, après la PR L3.

## 4. Plan de tests — A36, TDD, par rôle

**Écrits AVANT le code** (09 §3-2), six suites, 80 cas, sur un `fetch` remplacé — jamais un mock de
module : navigation (3 vues, clavier §33.6, invariant 4 par balayage du DOM rendu et des `var(--…)`
contre `tokens.css`) · **quatre états** sur chaque écran (squelettes `role=status`, vide qui dit quoi
faire, erreur `role=alert` français + `<details>` replié, hors ligne) · **keyset `@critique`** (limit,
`after` = curseur rendu, jamais offset/page/skip, suite ajoutée, bouton disparaît à `null`) ·
**étanchéité `@critique`** admin/consultant/anonyme (DOM + trace) · avancement (client nommé, libellés
français, fuseaux) · auth (`X-…` sur tout non-GET, cookies, aucun Bearer, aucun stockage). **État au
mandat** : 80/80 verts contre la coquille, sous trois cales locales (§5-1). À ajouter en L7b/L7c :
couverture FIL-GC (150 unités, p95 < 100 ms), export §36.3 rejoué sur FIL-TPE et FIL-GC, ZIP relu
colonne par colonne, `@filrouge` allongé jusqu'à l'export.

## 5. À trancher (DECISIONS.md) — rien n'est deviné

1. **Trois cales locales pour que la suite A36 tourne sur `lot/l7a`, toutes hors dépôt** : (a) les
   tests importent `missionResponseSchema`… depuis `@axion/shared`, absent de `main` → soit A36 importe
   depuis `src/api/contrats.ts`, soit la branche se rebase sur L3 fusionné ; (b) `apps/api/tests/aide/
   sentinelle-financiere.ts` n'exporte `NOMS_FINANCIERS_INTERDITS` que sur `lot/l3-suite` ; (c) le
   serveur factice construit `new Request(cible, init)` : undici **refuse l'`AbortSignal` de jsdom** —
   retirer `signal` de l'init dans le harnais (le client, lui, garde le sien). **Recommandation** :
   fusionner L3 puis rebaser `lot/l7a` ; sinon (a)+(b) par A36.
2. **Contrat `GET /v1/missions/:id/dashboard`** (05 §8.3 : « complétude, à-revoir, dernière sync ») —
   proposition pour `packages/shared` (L7b) : `{ missionId, completude: { repondues, posees },
   aRevoir, derniereSync: [{ utilisateurId, nomAffiche, derniereSyncA: iso|null, outboxRestante }] }`.
3. **Route de couverture** `GET /v1/missions/:id/coverage` (§16.6, §27.1) — **absente des §8/§24.2** →
   à documenter (11 §8-6) : par unité `in_scope` × type de source, prévu (plan d'entretiens) / réalisé.
4. **Route d'export** `GET /v1/missions/:id/export` (§36.3) — **absente des §8/§24.2** ; option
   « fichiers des pièces jointes inclus » ; ZIP produit côté API (invariant 6), streamé, jamais MinIO direct.
5. **Le client sur les cartes = N+1 borné** (`GET /v1/companies/:id` par carte, dédupliqué) : accepter
   en V1, ou joindre `companyName` dans la liste (modifie `missionResponseSchema`, 11 §8-2), ou route
   de portefeuille dédiée en L7b.
6. **Nom de l'en-tête anti-CSRF** : fixé nulle part dans le pack. Proposé `X-Axion-Client: console`
   (+ `X-Axion-Csrf` en double-soumission) — à ratifier avec A-006.
7. **Étage 1, `packages/ui` figé** : `EtatHorsLigne` porte un texte terrain (« tout est enregistré sur
   cet appareil ») que la console ne peut pas paramétrer ; `ChampTexte` n'a pas de nature `secret`
   (mot de passe composé à la main, comme le terrain). Deux fiches AMELIORATIONS, PR à part.
8. **Écart de découpage** : A36 attend (H1) `/hq/missions` = « Portefeuille » distinct de l'accueil ;
   L7a livre donc **trois** routes. L'espace 2 s'intitule « Pilotage mission — portefeuille ».

_Rédigée par A30, chef d'équipe console. Signature de fin d'incrément L7a : après revue A37 et suite
A36 verte SANS cale (point 5-1). Chaîne : A30 → A02 (traçabilité) → A01 (passage en porte) → Williams (P-E)._

---

## 6. BRIEF L7b — la couverture, et pourquoi elle a DEUX axes qu'on ne peut pas confondre

> **Écrit par A30 le 2026-09-02, pendant l'attente de la fusion L3.** Le brief vient de la table du
> fichier 07, ligne **L7-min** : « couverture par unité **ET** par type de source §27.1 » ; critère :
> « la couverture reflète le plan d'entretiens ». **Code : A32. Tests : A36.** Jamais le même agent
> pour les deux (09 §5.6). A30 ne code pas ici.

### 6.1 Le piège nommé — deux axes, deux vocabulaires, et ils N'ONT PAS LA MÊME LONGUEUR

Le §27.1 se lit vite comme un seul écran. Il en porte deux, et la mesure le prouve : le dépôt
contient **deux énumérations distinctes**, pas une.

| Axe | Question posée | Source de vérité | Valeurs |
| --- | --- | --- | --- |
| **A — par UNITÉ** (§16.6) | « ce service a-t-il été audité ? » | `interviews` par `org_unit_id` | une ligne par unité `in_scope` |
| **B — par TYPE DE SOURCE** (§27.1) | « l'a-t-on audité AUTREMENT qu'en parlant ? » | `interviews.kind` — `TYPES_SESSION` | **6** : entretien, observation, demonstration, analyse_documentaire, releve_donnees, **atelier** |
| _(L7c, à ne pas confondre)_ | « d'où vient CETTE réponse ? » | `answers.source` — `SOURCES_DONNEE` | **5** : entretien, observation, demonstration, **document**, **releve** |

**6 n'est pas 5, et la correspondance n'est pas bijective** : `analyse_documentaire` va vers
`document`, `releve_donnees` vers `releve`, et **`atelier` n'a aucune provenance de réponse**. Coter
la couverture sur `answers.source` ferait donc disparaître les ateliers de l'écran, silencieusement.
Le §36.3 tranche d'ailleurs sans le dire : `reponses.csv` porte « session + type + **provenance
(`source`)** » — **trois** colonnes, donc deux vocabulaires assumés. **Arbitrage A30 : l'axe B de la
COUVERTURE est `interviews.kind` (6 valeurs) ; `answers.source` (5) est l'axe de PROVENANCE de
l'agrégation L7c.** À porter en DECISIONS.md après le rebase (voir §6.6).

### 6.2 « Prévu » est ambigu, et il vaut mieux trois colonnes qu'une moyenne

Trois notions coexistent dans le dépôt, et les fondre en un seul « prévu » perdrait de l'information :

1. **PRÉVU (cible)** — le plan §32.4, `GET …/interview-plan`. C'est une **cible calculée qui n'écrit
   rien** (`sessionProposeeSchema` ; `POST …/apply` REPORTÉE) : elle est publiée par unité **et par
   `kind`**, donc elle EST directement l'axe B du prévu. C'est elle que vise le critère du 07
   « la couverture reflète le plan d'entretiens ».
2. **PLANIFIÉ (agenda)** — lignes `interviews` à `schedule_status` planifié. **Peut être vide alors
   que le plan existe**, puisque `apply` est reportée : afficher 0/0 serait faux.
3. **RÉALISÉ** — lignes `interviews` à `status` terminé.

**Arbitrage A30 : trois colonnes distinctes (prévu / planifié / réalisé)**, jamais un ratio unique.
L'écart prévu vers planifié est un défaut d'agenda ; l'écart planifié vers réalisé est un défaut de
terrain : ce ne sont pas les mêmes alertes, et elles ne s'adressent pas aux mêmes personnes.

**Consigne de la session pilote (2026-09-02), et elle est structurante** : « la couverture se confronte
au plan d'entretiens de L3, **elle ne se recalcule pas dans son coin** ». Concrètement, pour A32 : la
colonne « prévu » **appelle le service de plan de L3** (`apps/api/src/domaines/plan-entretiens/`) et
n'en réimplémente **aucune** règle §32.4. Une seconde implémentation des tranches d'effectif
divergerait de la première au premier amendement, et la couverture affirmerait alors un prévu que le
plan ne reconnaît pas. Si le service de L3 n'expose pas la forme utile, on l'**étend** — on ne le
recopie pas.

### 6.3 Contrat de la route — `GET /v1/missions/:id/coverage`

Schémas **dans `packages/shared/src/pilotage.ts`**, ré-exportés par `src/api/contrats.ts` : A37 a
retiré 127 lignes de copie, **aucune redéfinition locale ne revient** (11 §3).

- **Pagination keyset** sur les unités (`?limit=50&after=<curseur>`), **jamais d'offset** ; curseur
  opaque, ordre stable = ordre de l'arbre, documenté par route (11 §3).
- **Les marges ne se paginent pas.** Les totaux par `kind` de la mission sont calculés **côté serveur
  sur la mission entière**, jamais sur la page courante : une marge calculée sur une page est un
  chiffre faux qui a l'air juste. Elles voyagent hors du tableau paginé.
- **Agrégation en SQL, pas dans le navigateur** (invariant 6, le siège produit) : 150 unités × 6 types
  font 900 cellules ; les recompter à chaque rendu tuerait le p95.
- **RBAC serveur** (invariant 3) : membre de la mission ou admin ; **aucun champ financier ne s'approche
  de cette réponse** — la couverture porte des effectifs et des noms d'unités, jamais un montant.
- **Route absente des §8/§24.2, donc à documenter** (11 §8-6), comme déjà noté au §5-3.

Forme proposée, à figer par A32 dans `packages/shared` en `strictObject` : par unité
`{ orgUnitId, ref, nom, inScope, effectif, parSource: [{ kind, prevu, planifie, realise }],
profilsRencontres: string[], blocsNonCouverts: string[], aucuneSession: boolean }` ; marges de mission
`{ parSource: [{ kind, prevu, planifie, realise }], unitesInScope, unitesSansAucuneSession }`.
**Les six entrées de `parSource` sont TOUJOURS présentes, même à zéro** : un type absent laisserait
croire qu'il n'est pas exigé — même raison que les quatre règles toujours publiées du plan
(`applicationRegleSchema`).

### 6.4 Écran — `apps/hq/src/ecrans/couverture/**` (A32)

Tableau dense §33.4 (lignes 40 px), desktop à partir de 1280 px. Une ligne par unité `in_scope`, six
colonnes de type, une colonne d'alerte. **Les quatre états (§33.2)** : vide (« aucune unité dans le
périmètre — définissez l'arbre »), chargement (squelettes aux dimensions finales, `role=status`),
erreur (`role=alert`, français, code technique replié), hors ligne (pastille discrète — **et pas le
texte terrain de `EtatHorsLigne`, fiche A-010**). **Alerte visuelle sur toute unité `in_scope` sans
aucune session** (§16.6) : rouge d'alerte **par token** — l'invariant 4 rappelle que « l'alerte est un
rouge distinct », donc ni le terracotta d'action, ni un hex. **Aucune couleur ni taille en dur**,
100 % français, horodatages au **fuseau de mission** à l'affichage (invariant 5).

### 6.5 Plan de tests A36 — deux fixtures symétriques qui rendent la confusion IMPOSSIBLE

C'est le cœur de ce brief. Un écran qui ne livre que l'axe A passe tous les tests « couverture »
naïfs. Ces deux-là le rattrapent :

1. **FIXTURE « tout en entretiens »** — chaque unité `in_scope` a au moins une session, **toutes de
   `kind` entretien**. Attendu : **axe A entièrement couvert, axe B en défaut sur les cinq autres
   types**. Un build qui n'a implémenté que l'axe A affiche « couverture complète » — et **échoue ici**.
2. **FIXTURE « tout sur une unité »** — les six types présents dans la mission, tous concentrés sur
   une unité sur dix. Attendu : **axe B complet en marge, axe A en défaut sur neuf unités**, alerte
   §16.6 comprise. Un build qui n'a implémenté que l'axe B **échoue ici**.

Plus : une session `atelier` reste visible sur l'axe B (le test qui protège du glissement vers
`answers.source`) · **keyset `@critique`** (curseur rendu, jamais offset/page/skip) · **les marges
sont identiques page 1 et page 3** (le test qui attrape une marge calculée sur la page) ·
**étanchéité `@critique`** admin / consultant / anonyme, sentinelle financière sur le JSON sérialisé
ET sur le DOM rendu · quatre états par écran · axe-core vert · **FIL-GC, 150 unités : p95 sous
100 ms**, mesuré et non supposé.

### 6.6 Ce que L7b NE fait PAS — le périmètre L7-min est tenu

Hors périmètre, et proposés en fiche AMELIORATIONS étage 2 si le besoin se confirme — jamais
implémentés avant arbitrage de Williams (CLAUDE.md §3.7) : **heatmap unités × blocs** (§22.3, espace 2),
**courbe prévu/réel** et **avance/retard** (§18.3), **flux d'activité en direct**, **centre d'alertes
agrégées** (§20.4), **réaffectation d'unités**. Aucun n'est exigé par la ligne L7-min du fichier 07 ni
par la porte P-E. Jalon **P-DESCOPE du 15/09** : tout différable non entamé glisse en Phase 2.

**À porter en DECISIONS.md après le rebase** — ces fichiers append-only sont remués par le rebase, on
ne les écrit donc pas avant (ordre de fusion figé) : l'arbitrage §6.1 (axe B = `interviews.kind`, six
valeurs) et l'arbitrage §6.2 (trois colonnes prévu / planifié / réalisé).

## 7. BRIEF L7c — l'agrégation et l'export, tenus par UN critère qui est un test

> **Code : A31** (API export + écran) et **A35** (tableau d'agrégation). **Tests : A36.** Jamais le
> même agent (09 §5.6). Recopié du fichier 07, ligne L7-min, et c'est la barre exacte : « Export
> conforme au format §36.3 : **le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP, sans
> retourner dans l'outil** ; la couverture reflète le plan d'entretiens. »

### 7.1 Le critère n'est pas une intention, c'est une recette exécutable

« Sans retourner dans l'outil » se vérifie, et A36 le vérifie ainsi : on prend la trame §20.3, on
ouvre **le ZIP seul**, et on coche chapitre par chapitre ce qu'on peut écrire. Toute case qui exige de
rouvrir la console est un **défaut d'export**, pas une limite du rapport. Deux conséquences exigées
par la session pilote (2026-09-02), et elles ne sont pas négociables :

1. **La provenance est VISIBLE dans l'agrégation par question** — `answers.source` (les **cinq**
   valeurs, §6.1), affichée à l'écran ET portée en colonne dans `reponses.csv`. Le §27.2 en dépend :
   « tout finding s'appuie sur au moins une source tracée, idéalement deux de types différents » ; un
   rapport qui ne sait pas d'où vient une réponse ne peut pas écrire cette phrase.
2. **Le « non communiqué » est VISIBLE** (§27.4) — `withheld` **et** `withheld_reason`, distincts de
   « N/A » (`not_applicable` + `na_reason`) et de « à revoir » (`flag_review`). **Trois états qu'on ne
   fond pas** : un refus n'est pas un « sans objet », et aucun des deux n'est une question à creuser.
   Le §27.4 en tire l'indice de complétude et la rubrique « Limites et réserves » du rapport.

### 7.2 Ce que le §36.3 impose et qu'on n'improvise pas

`export_mission_<ref>_<AAAAMMJJ>.zip`, **UTF-8 avec BOM** (Excel FR), séparateur **`;`**. Onze
entrées : `mission.json`, `arbre.csv`, `sessions.csv`, **`reponses.csv`**, `constats.csv`,
`cas_usage.csv`, `inventaire_outils.csv`, `registre_ia.csv`, `unites_hors_perimetre.csv`,
`scores.csv`, `pieces_jointes/manifest.csv`. Points où une implémentation dérive silencieusement :

- **`reponses.csv` est trié bloc → unité → question**, et porte **`unite_in_scope`** : les réponses des
  unités sorties du périmètre §25.1 **SONT dans le fichier**, marquées `false`. **Jamais deux fichiers
  de réponses** — `unites_hors_perimetre.csv` ne liste que les unités et leurs motifs.
- **Valeur APLATIE LISIBLE** : choix = libellés (pas d'identifiants), fourchette = « 20 – 30 »,
  tableau = JSON. Un UUID dans une cellule est un défaut : personne ne rédige un rapport avec ça.
- **Trois colonnes distinctes** : session, **type de session** (`interviews.kind`, 6) et **provenance**
  (`answers.source`, 5). Voir §6.1 — c'est la même confusion, à l'autre bout de la chaîne.
- **`scores.csv` est ABSENT ET SIGNALÉ** tant que L8 n'est pas livré (`mission.json` porte la présence
  ou non des scores). Absent et signalé, jamais absent en silence, jamais présent et vide.
- **Pièces jointes** : `manifest.csv` toujours ; les **fichiers** sont une **option cochée**.
- **Le ZIP se produit côté API et se streame** (invariant 6 : le siège produit) ; **jamais d'accès
  direct à MinIO** (11 §2). RBAC serveur : membre de la mission ou admin.
- **Étanchéité (invariant 3)** : `scoping_financials` **n'entre dans aucune entrée du ZIP** — le §36.3
  ne le liste pas, et un export est exactement l'endroit où une donnée admin fuit vers un consultant.
  A36 passe la sentinelle financière sur **le contenu décompressé de chaque fichier**, export demandé
  **par un consultant**, pas seulement sur la réponse HTTP.

### 7.3 Tests A36 — rejoués sur FIL-TPE ET FIL-GC

ZIP relu **colonne par colonne** contre le §36.3 (noms, ordre, BOM, séparateur) · une réponse
`withheld` et une `not_applicable` et une `flag_review` **dans le même jeu**, distinctes à l'écran et
dans le CSV · une unité hors périmètre présente dans `reponses.csv` à `unite_in_scope=false` · une
fourchette rendue « 20 – 30 » · `scores.csv` absent **et** signalé dans `mission.json` · export
consultant vs admin, sentinelle financière sur le décompressé · `@filrouge` **allongé jusqu'à
l'export**, vert sur **FIL-TPE et FIL-GC**. Aucun de ces tests n'est écrit par A31 ni par A35.

### 7.4 Conformité à la décision D1 (2026-09-02)

**`X-Axion-Client` est RATIFIÉ** par la session pilote, nom retenu tel quel : L7 s'y conforme et le
cite. **L'entrée `DECISIONS.md` est tracée par A10 sur `lot/l3-suite`** (sujet backend, fiche A-006) —
**elle n'est pas dupliquée ici**. Le point §5-6 de cette note est donc CLOS : l'en-tête que
`src/api/auth.ts` envoie déjà sur toute requête est le bon.

### 7.5 Le descope ne passe pas par L7-min

Rappel de la session pilote : **L7-min se livre EN ENTIER** ; le levier de descope du chantier est
**L8**, que le fichier 07 marque déjà DIFFÉRABLE avec **butoir dur au dernier jour de collecte**
(§35.3). Tout ce qui déborde de la ligne L7-min part donc en **fiche AMELIORATIONS d'étage 2 —
proposée, jamais implémentée avant arbitrage** (CLAUDE.md §3.7 et §6), et non en rognage de L7-min.

## 8. LES TROIS VOCABULAIRES DE SESSION — correction et durcissement du §6.1

> Ajouté par A30 le 2026-09-02 après un contrôle de lecture de la session pilote. Le §6.1 en nommait
> **deux** ; il y en a **trois**, et le troisième est celui contre lequel le pack met explicitement en
> garde. **Tout est vérifié dans le dépôt, référence par référence — rien n'est repris de confiance.**

### 8.1 Les trois, mesurés

| # | Ce que ça nomme | Où c'est défini (vérifié) | Valeurs |
| --- | --- | --- | --- |
| 1 | **TYPE de session** | `packages/shared/src/plan-entretiens.ts` l. 52-59 | **6** : entretien, observation, demonstration, analyse_documentaire, releve_donnees, **atelier** |
| 2 | **PROVENANCE d'une donnée** | `apps/api/src/db/schema.ts` l. 124-130 (`SOURCES_DONNEE`) | **5** : entretien, observation, demonstration, **document**, **releve** |
| 3 | **MODE d'entretien** | `plan-entretiens.ts` l. 64 (`MODES_ENTRETIEN`) | **3** : sur_site, distanciel, **complementaire** — et **seulement si `kind='entretien'`** |

### 8.2 Le mode n'est PAS un type — la faute que le pack anticipe nommément

Le 03 l. 673 l'écrit en toutes lettres : « **Complémentaire est un mode, pas un type** » ; le §32.6
distingue `interviews.kind` de `interviews.mode`. Conséquence directe pour A32, et c'est une consigne,
pas un commentaire : **l'écran de couverture n'a PAS de septième colonne « complémentaire »**. Un
entretien complémentaire est un entretien ; il compte dans la colonne `entretien`, et son mode se lit
ailleurs. Le §36.3 le confirme à l'export : `sessions.csv` porte « id, **type**, **mode**, unité » —
**deux colonnes distinctes, jamais fusionnées**. Test A36 correspondant : une session
`kind=entretien, mode=complementaire` **n'ouvre aucune colonne** sur la couverture, et ressort en
**deux** cellules dans `sessions.csv`.

### 8.3 Sur quel vocabulaire se compte l'axe B — l'arbitrage §6.1 est MAINTENU, et voici pourquoi

Un contrôle de lecture propose de compter l'axe B sur `answers.source` (n° 2). **A30 maintient
`interviews.kind` (n° 1)**, sur trois éléments vérifiables :

1. **On ne planifie pas une provenance.** La couverture est un écart **prévu / planifié / réalisé**
   (§6.2), et le critère du 07 exige que « la couverture reflète **le plan d'entretiens** ». Or le plan
   publie `sessionProposeeSchema{ orgUnitId, kind }` : il propose des **sessions**. Compté sur
   `answers.source`, l'axe B n'aurait **aucune colonne « prévu »** — le critère du 07 deviendrait
   inexprimable.
2. **Le §16.6 compte des sessions** : « nombre d'entretiens **menés / prévus** », « unité `in_scope`
   sans aucun **entretien** ». Une unité sans aucune session est l'alerte ; une réponse sans
   provenance n'est pas un défaut de couverture.
3. **Les « CINQ types » du §27.1 SONT des types de session.** La table du §27.1 liste
   entretien / observation / demonstration / analyse_documentaire / releve_donnees — le vocabulaire
   n° 1 **moins `atelier`** (ajouté ensuite par le §28.1), et **non** le vocabulaire n° 2, qui dit
   `document` et `releve`. La phrase « le plan de mission planifie les CINQ types par unité » ne peut
   désigner que des sessions : c'est ce que le plan produit.

**Traitement d'`atelier`** : les **six** colonnes sont affichées (§6.3, « toujours les six, même à
zéro »). Le plan §32.4 n'en propose jamais, donc `prevu = 0` ; mais un atelier **réellement tenu**
doit se voir. L'afficher coûte une colonne à zéro ; l'omettre rend un travail fait invisible.

**Divergence tracée, à arbitrer** : ce point est **remonté au pilote** et entrera en `DECISIONS.md`
après le rebase. Si l'arbitrage retient `answers.source`, alors le §6.2 tombe avec lui : il faudra
dire ce que devient la colonne « prévu ». **A30 ne devine pas** — la recommandation est ci-dessus,
la décision appartient à A01 / Williams.

### 8.4 Le piège d'implémentation de L7c — et les deux mauvaises sorties, écartées

`answers.source` reste nécessaire à **L7c** (agrégation : provenance visible ; `reponses.csv`). Or
`SOURCES_DONNEE` vit dans `apps/api/src/db/schema.ts`, **que la console n'importe pas** (ses
dépendances sont `@axion/shared` et `@axion/ui`). Deux sorties tentantes, toutes deux refusées :

- **Réutiliser `SOURCES_ATTENDUES`** (`packages/shared/src/banque-questions.ts` l. 70-76) parce qu'il
  porte les mêmes cinq valeurs — **NON, c'est un mensonge de nommage.** Vérifié : ce constant sert
  `questions.expected_source`, la source **ATTENDUE** (04 l. 88 : `expected_source CHECK IN (…) NULL
  -- §27.6`), tandis que la couverture et l'agrégation parlent de `answers.source`, la provenance
  **CONSTATÉE** (§27.1). Et **tout l'intérêt du §27.6 est de COMPARER les deux** : les fondre dans un
  seul symbole rendrait cette comparaison inexprimable au moment même où on en aurait besoin.
- **Recopier les cinq valeurs dans `apps/hq`** — **NON** : ce sont les 127 lignes de copie qu'A37
  vient de retirer (réserve B2). On ne les rouvre pas trois commits plus tard.

**La bonne sortie** : un export de **provenance** distinct dans `packages/shared` — nom sans
ambiguïté (`SOURCES_CONSTATEES` / `PROVENANCES_REPONSE`), **une seule définition, deux consommateurs**
(la console **et** l'API, qui cesse d'être la source d'un contrat que le front doit connaître). C'est
le **prolongement direct de la correction B2**, pas une convention nouvelle : `packages/shared` est
déjà, par le 11 §3, l'endroit où vivent les contrats que le front importe. Aucune valeur n'est
inventée : ce sont les cinq du CHECK du fichier 04. **À exécuter par A32 dans L7b/L7c ; tests A36.**
