# @axion/hq — Console siège

React 18 + Vite, **desktop-first** (§33.4). C'est l'outil de pilotage : portefeuille de missions,
avancement, couverture, agrégation, exports.

## État au lot L7a (coquille de la console)

AppShell §33.4 (barre latérale aux 7 espaces §22.3, fil d'Ariane constant, lien d'évitement),
trois écrans avec leurs **quatre états** §33.2, un client HTTP typé Zod in/out, TanStack Query 5.

| Route (`/hq` + …) | Écran                                    | Espace §22.3 | Source                                          |
| ----------------- | ---------------------------------------- | ------------ | ----------------------------------------------- |
| `/`               | Tour de contrôle — chiffres clés, cartes | 1            | `GET /v1/missions` + `GET /v1/companies/:id`    |
| `/missions`       | Portefeuille — liste dense keyset        | 2 (entrée)   | `GET /v1/missions?limit=&after=`                |
| `/missions/:id`   | Avancement — fiche, client, jalons §32.2 | 2            | `GET /v1/missions/:id`, `GET /v1/companies/:id` |

Les espaces 3 à 7 sont **visibles et fermés** dans la barre (mention « Phase 2 » / « différé » /
« bientôt ») : la carte de l'outil est entière, aucun lien ne mène à une page vide.

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
- `src/app/` — `routeur.ts` (History API, sans dépendance), `espaces.ts` (registre des 7 espaces,
  append-only), `etats.ts` (une erreur → cause + action en français), `base.ts` (`/hq`, partagé
  avec `vite.config.ts`), `coquille.css` (structure seule, jetons uniquement).
- `src/ecrans/` — `EcranAccueil`, `EcranPortefeuille`, `EcranAvancementMission`, `EcranConnexion`.
- `src/format/dates.ts` — instants au **fuseau de la mission**, dates civiles jamais converties.
- `src/tests-aide/` et `src/*.test.tsx` — écrits par **A36** (09 §5.6), serveur factice qui répond à
  travers les schémas partagés, jamais un mock qui invente.

### Ce que L7a ne fait PAS (et pourquoi)

- Pas d'appel à `GET /v1/missions/:id/dashboard` ni à une route de couverture : **aucun schéma partagé
  ne les décrit encore**. Ils arrivent en L7b avec leur contrat dans `packages/shared`.
- Pas de jauge, d'avance/retard, d'alertes, de heatmap : différables (05 §24.5), pas esquissés.
- Aucune donnée financière ne transite : le contrat de mission ne la porte pas (invariant 3), et A36
  le prouve DOM + trace réseau, rôle par rôle.

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
