# @axion/hq — Console siège

React 18 + Vite, **desktop-first** (§33.4). C'est l'outil de pilotage : portefeuille de missions,
avancement, couverture, agrégation, exports.

## État au lot L7b (coquille + les deux vues de pilotage)

AppShell §33.4 (barre latérale aux 7 espaces §22.3, fil d'Ariane constant, lien d'évitement),
cinq écrans avec leurs **quatre états** §33.2, un client HTTP typé Zod in/out, TanStack Query 5.

| Route (`/hq` + …)          | Écran                                    | Espace §22.3 | Source                                          |
| -------------------------- | ---------------------------------------- | ------------ | ----------------------------------------------- |
| `/`                        | Tour de contrôle — chiffres clés, cartes | 1            | `GET /v1/missions` + `GET /v1/companies/:id`    |
| `/missions`                | Portefeuille — liste dense keyset        | 2 (entrée)   | `GET /v1/missions?limit=&after=`                |
| `/missions/:id`            | Avancement — fiche, client, jalons §32.2 | 2            | `GET /v1/missions/:id`, `GET /v1/companies/:id` |
| `/missions/:id/couverture` | Couverture — unité × source (§27.1)      | 2            | `GET /v1/missions/:id/coverage?limit=&after=`   |
| `/missions/:id/agregation` | Agrégation par question (M5.1, §27.4)    | 2 → 6        | `GET /v1/missions/:id/aggregation`              |

Les deux écrans de L7b sont des **drill-down d'une mission**, pas des espaces de la barre : ils n'ont
de sens qu'une mission choisie. Les brancher sur un espace exigerait un sélecteur de mission, qui
appartient à l'espace 6 « Analyse & rapports » et arrivera avec lui (L7c). On y accède depuis la
fiche de mission, par deux liens à URL réelle — collables, ouvrables dans un onglet, et le bouton
« précédent » du navigateur y remonte d'un cran.

Les espaces 3 à 7 sont **visibles et fermés** dans la barre (mention « Phase 2 » / « différé » /
« bientôt ») : la carte de l'outil est entière, aucun lien ne mène à une page vide.

### Les deux lectures de la couverture — le cœur de L7b

Le fichier 07, ligne **L7-min**, exige « couverture par unité **ET** par type de source §27.1 ».
Ce sont deux lectures d'un même tableau, et un écran qui n'en porterait qu'une **mentirait** :

- **axe A, en lignes** — une unité par ligne, l'arbre indenté (FIL-GC : 150 unités sur 4 niveaux).
  « Ce service a-t-il été audité ? » L'alerte §16.6 marque toute unité `in_scope` sans aucune
  session ;
- **axe B, en colonnes** — les **cinq sources de collecte** du §27.1, toujours les cinq, même à zéro.
  « L'a-t-on audité autrement qu'en parlant ? » Un build qui n'aurait que l'axe A afficherait
  « couverture complète » d'une mission faite à 100 % d'entretiens.

Chaque cellule dit **réalisé / prévu**, le planifié en second : trois nombres, jamais un ratio —
l'écart prévu → planifié est un défaut d'**agenda**, planifié → réalisé un défaut de **terrain**.
Le **prévu vient du plan §32.4 de L3** et n'est jamais recalculé ici. `atelier` (6ᵉ
`interviews.kind`) est rendu **hors grille**, réalisé seul, et la marge de mission le porte **même à
zéro**. Les **marges** portent sur la mission entière et voyagent hors de l'enveloppe paginée.

### Ce que l'agrégation rend visible, et qu'on ne fond jamais

Quatre situations distinctes (§27.4), et la quatrième est celle qu'on oublie :
**renseignée** · **non communiquée** (avec son motif) · **sans objet** · **jamais posée** (aucune
ligne — elle a sa propre phrase, pas une liste vide). La **provenance** (`answers.source`, cinq
valeurs) s'affiche à côté du **type de session** (`interviews.kind`, six valeurs) et jamais à sa
place : c'est leur comparaison qui fait le §27.6. Aucun **nom de personne** n'est publié — la
fonction et le service le sont ; la question du nom est ouverte dans `DECISIONS.md` (2026-09-05).

### Arborescence

- `src/api/contrats.ts` — **la seule couture** avec `packages/shared`. Aucun écran n'importe
  `@axion/shared` directement : tout passe ici, pour qu'un contrat qui bouge n'ait qu'**un** endroit
  à relire. **Rien n'y est redéfini** — chaque schéma, constante et type est un ré-export pur ; le
  fichier n'ajoute que les libellés français que le siège est le premier à afficher
  (`LIBELLES_NIVEAU_AUDIT`, `LIBELLES_PERIMETRE_GEO`).
  _(Amendement du 2026-09-03, réserve **R-L7a-1** d'A02 : ce paragraphe décrivait une « Section B —
  extrait transitoire des schémas de `lot/l3-suite` ». Cette copie de 127 lignes a été retirée par la
  revue croisée A37, et L3 est dans `main` depuis le tag `v0.l3`. Le README décrivait donc un fichier
  qui n'existait plus — et un README faux coûte plus cher qu'un README absent : il fait perdre du
  temps à qui le croit.)_
- `src/api/client.ts` — `fetch` injecté, URL `/api/v1/…` même origine, cookies `same-origin`,
  en-tête custom `X-Axion-Client: console` (anti-CSRF, 11 §3), réponse validée par le schéma de la
  route ; erreurs dans l'enveloppe 11 §3 → `ErreurApi` (message français), forme inconnue →
  `ErreurContrat`, réseau → `ErreurReseau`.
- `src/api/auth.ts` — le point d'entrée cookie + anti-CSRF, **côté client seul** (A-006 côté API).
  Aucun jeton n'est jamais stocké.
- `src/api/requetes.ts` — hooks TanStack (`usePortefeuille` en `useInfiniteQuery` keyset, `useMission`,
  `useEntreprise`) et clés de cache.
- `src/api/requetes-pilotage.ts` (**L7b**) — `useCouverture`, `useAgregation`. Séparé de
  `requetes.ts` pour une raison de collision, pas de style : L7a, L7b et L7c travaillent en
  parallèle, et le seul fichier qu'ils partagent est `app/espaces.ts` (`LOT_L7.md` §1).
- `src/app/` — `routeur.ts` (History API, sans dépendance), `espaces.ts` (registre des 7 espaces,
  append-only), `etats.ts` (une erreur → cause + action en français), `base.ts` (`/hq`, partagé
  avec `vite.config.ts`), `coquille.css` (structure seule, jetons uniquement).
- `src/app/CadreTableau.tsx` (**L7b**) — le cadre d'un tableau dense, **atteignable au clavier**
  (`tabindex=0` + `role="region"` + `aria-label` obligatoire). Il existe parce que
  `.axn-tableau-cadre` porte `overflow-x: auto` : la souris faisait défiler ce que le clavier ne
  pouvait pas atteindre (**WCAG 2.1.1, niveau A** ; 03 §22.1, « navigation clavier intégrale »), et
  la classe était recopiée à la main par trois écrans. Un composant rend l'oubli impossible sur le
  quatrième. **Tout tableau dense de la console passe par lui.**
- `src/ecrans/` — `EcranAccueil`, `EcranPortefeuille`, `EcranAvancementMission`, `EcranConnexion`,
  puis `couverture/EcranCouverture` et `agregation/EcranAgregation` (**L7b**).
- `src/format/dates.ts` — instants au **fuseau de la mission**, dates civiles jamais converties.
- `src/tests-aide/` et `src/*.test.tsx` — écrits par **A36** (09 §5.6), serveur factice qui répond à
  travers les schémas partagés, jamais un mock qui invente.

### Ce que L7b ne fait PAS (et pourquoi)

- Pas d'appel à `GET /v1/missions/:id/dashboard` (complétude, à-revoir, dernière sync, 05 §8.3) :
  **aucun schéma partagé ne le décrit**, et un contrat que `packages/shared` ne porte pas n'existe
  pas pour le front (11 §3).
- Pas d'**export ZIP** §36.3 : c'est **L7c**, avec l'espace 6 et son sélecteur de mission.
- Pas de **scoring**, de **radar**, de **heatmap**, ni d'**avance/retard** : c'est **L8**, différable
  (05 §24.5, butoir du §35.3). Aucune échelle de couleur n'est posée d'avance dans `coquille.css` —
  deux échelles concurrentes seraient pires qu'aucune.
- Pas de colonne « **profils rencontrés** » (§16.6) : le fichier 04 ne porte pas le lien session ↔
  profil d'interlocuteur, la donnée n'existe donc pas. Escalade tracée dans `DECISIONS.md`
  (2026-09-05) plutôt qu'une colonne approchée qu'on croirait lire.
- Aucune donnée financière ne transite : les contrats de couverture et d'agrégation ne portent ni
  montant, ni taux, ni durée valorisée (invariant 3) — et A36 le prouve DOM + trace réseau, rôle par
  rôle.

## Ce qui distingue la console de la PWA terrain

|                  | Terrain                             | Console                              |
| ---------------- | ----------------------------------- | ------------------------------------ |
| Réseau           | fonctionne 100 % hors ligne         | toujours en ligne                    |
| Cible            | tactile, iPad, debout               | souris/clavier, grand écran          |
| Authentification | Bearer + refresh chiffré dans Dexie | cookies httpOnly + en-tête anti-CSRF |
| Rôle             | **collecte**                        | **production** (invariant 6)         |
| TanStack Query   | non                                 | oui (11 §1 : « console uniquement ») |

## Étanchéité financière — la contrainte la plus stricte de cette app

`scoping_financials` est accessible aux **routes admin exclusivement** (invariant 3). Un token
consultant ne doit JAMAIS lire une donnée financière, et un auditeur n'accède jamais aux devis ni aux
montants (E21). Cela se vérifie **côté serveur** ; masquer un montant dans l'interface n'est pas une
protection. La porte P-B éprouve ce point par des tentatives d'intrusion croisées.

## Développement

```bash
pnpm --filter @axion/hq dev    # http://localhost:5174 — derrière Caddy : http://localhost/hq/
```

La console appelle `/api/v1/…` en relatif : en dev comme en prod, c'est Caddy qui route (11 §2, pas
de CORS, pas de proxy Vite). Tests d'interface : `pnpm vitest run --project interface`.

L'app est construite en base `/hq/` : servie ailleurs, elle demanderait ses assets à la racine — et
c'est la PWA terrain qui répondrait.
