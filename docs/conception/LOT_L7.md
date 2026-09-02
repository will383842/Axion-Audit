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
