# @axion/field — PWA terrain

React 18 + Vite. **Offline-first radical** (invariant 1) : le réseau est un bonus, jamais un
prérequis. L'auditeur travaille en entrepôt, en sous-sol, en avion.

## Pourquoi Vite et pas Next.js

Décision ferme du contrat 11 §2. Le SSR est inutile (outil interne authentifié, aucun SEO) et
**nuisible** ici : l'app doit démarrer depuis le cache du service worker **sans serveur**. Ne jamais
scaffolder Next dans ce dépôt, même « par habitude ».

## État au lot L5b — le SOCLE **et** l'écran d'entretien

**Mis à jour le 2026-09-03 (réserve R2 du contrôle A02).** Ce paragraphe annonçait encore
« aucun écran de collecte : l'écran d'entretien est L5b (A22) » alors que L5b est livré. Un README
qui présente comme à venir ce que le commit contient n'est pas incomplet, il est FAUX — et c'est le
premier fichier que lit quelqu'un qui arrive.

**Livré par L5a (socle)** : shell PWA + service worker Workbox, base locale Dexie **versionnée**,
coffre **DEK/KEK**, port d'écriture, horloge à décalage serveur, verrou 15/60 min + Wake Lock,
`storage.persist()`.

**Livré par L5b (collecte)** : l'écran d'entretien **3 zones** (03 M3.1) — blocs · question · notes —
« Nouvel entretien » en trois champs, les **onze** `TYPES_DE_REPONSE`, le mode **fourchette** et
« non communiqué » (§27.4), à-revoir / sans objet, les **trois** natures de note (note de question,
bloc-notes de session, **note volante** à rattachement différé), la question **ad hoc**, le
**hors-parcours** (§25.4), les raccourcis §33.3, le **mode écran partagé**, et l'indicateur
« Enregistré » adossé à un enregistrement continu débouncé. **11 composants** sous
`src/ecrans/entretien/`, **13 modules** sous `src/session/`.

**PAS encore livré — c'est L5c (A23)** : l'agenda et le cockpit « Aujourd'hui » (§34.2), les cinq
types de session autres qu'`entretien`, **terminer ≠ valider** côté écran (la machine à états, elle,
est livrée et testée), les photos, et l'**export de secours** `.axionbackup`.
**PAS encore livré — c'est L6** : toute synchronisation. `portSyncInerte` rend
`{ statut: 'indisponible' }`.

### Ce que L5b ajoute à la carte des modules

| Module                              | Ce qu'il porte                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/ecrans/entretien/**`           | les 11 composants de l'écran 3 zones, `entretien.css` (le seuil des colonnes : **64rem**) |
| `src/session/valeurs.ts`            | les **douze** formes de valeur (11 types + `range`) et la GARDE À L'ÉCRITURE              |
| `src/session/ecriture-*.ts`         | création/démarrage d'entretien, écriture de réponse — refus si validé (§19.1 V2.10)       |
| `src/session/notes-volantes.ts`     | capture immédiate, rattachement différé, suppression **logique** (invariant 7)            |
| `src/session/questions-adhoc.ts`    | question ad hoc hors ligne, codes d'options garantis DISTINCTS                            |
| `src/session/enregistrement.ts`     | l'enregistrement continu : file sérialisée, débounce, purge sur `pagehide`                |
| `src/session/raccourcis.ts`         | la grille §33.3, INACTIVE dans un champ de saisie (règle V2.8)                            |
| `src/session/media.ts`, `gestes.ts` | seuil des trois colonnes, pointeur fin, balayage horizontal iPad                          |
| `src/session/fuseau.ts`             | affichage au fuseau de **mission** (03 §22.2) — jamais celui de l'appareil                |

### Ce que les tests couvrent, et ce qu'ils ne couvrent PAS

Couverture **mesurée** sur les modules critiques de la DoD : `src/local/**` et `src/session/**`
≥ 90 % sur les quatre métriques (`pnpm test:coverage` puis
`node .github/scripts/check-coverage.mjs`).

**Les COMPOSANTS d'écran ne sont pas dans ce périmètre, et le trou est nommé** : cinq des douze
formes de saisie ne sont rendues par aucun test (`SaisieDevise`, `SaisieDate`, `ChoixUnique`,
`SaisieTableau`), et `AccesEntretien.tsx` est à 0 % de lignes alors qu'il est la porte d'entrée de
l'écran. Ce n'est pas une infraction à la DoD — elle énumère sync, crypto, scoring, RBAC — mais
c'est ce que la recette P-C doit savoir avant de cocher « une session de chaque type ».
Voir `docs/conception/LOT_L5.md` §4.

### Carte du socle

| Module                         | Ce qu'il porte                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/local/base.ts`            | `BaseLocale` (Dexie 4), `SCHEMA_LOCAL` versionné, `VERSION_SCHEMA_LOCAL`, clés de `meta`        |
| `src/local/formes.ts`          | l'en-tête d'index EN CLAIR (liste **fermée**) et les charges chiffrées, par table               |
| `src/local/coffre.ts`          | Argon2id (`hash-wasm`) → KEK, DEK AES-256 non extractable, `verrouiller()`, ré-enveloppement    |
| `src/local/coffre-appareil.ts` | sel + paramètres + DEK enveloppée dans `meta` ; changement de mot de passe et son avertissement |
| `src/local/ecriture.ts`        | `ecrireLocal` (ligne + op d'outbox en UNE transaction) et `appliquerDescente` (jamais d'outbox) |
| `src/local/horloge.ts`         | **le seul `new Date()` de l'application** — décalage serveur 05 §9.2                            |
| `src/local/stockage.ts`        | `storage.persist()`, quota, seuils d'alerte                                                     |
| `src/local/depots/*.ts`        | lectures indexées : sessions du jour, réponses, recherche hors-parcours, outbox                 |
| `src/session/machine.ts`       | les 4 états × 2 profils, **terminer ≠ valider** (03 §19.1 V2.10)                                |
| `src/local/port-sync.ts`       | `PortSync` **déclaré** ; implémentation **inerte** — L6a la REMPLACE, sous `src/sync/`          |
| `src/app/**`                   | coquille, verrou, navigation sans routeur, registre `vues.ts` **append-only**                   |
| `sw/service-worker.ts`         | précache du shell, des polices et des icônes ; **aucun cache d'exécution de `/api`**            |

### Deux règles de socle que tout écran doit respecter

1. **Aucune écriture Dexie hors de `src/local/ecriture.ts`** (hors `meta`). C'est ce qui rend vraie,
   par construction, la règle « chaque écriture pousse une op dans l'outbox » (05 §9.2-2).
2. **Aucun `new Date()` ni `Date.now()` hors de `src/local/horloge.ts`** — sinon l'appareil déréglé
   de +3 h du scénario 05 §9.8 gagne tous les arbitrages de conflit.

### Ce que le socle refuse EXPLICITEMENT, et pourquoi

- `embarquerMission()` prépare le stockage puis **refuse** le premier pull : il dépend de L3d
  (figeage du questionnaire), non livré. Un embarquement qui « réussirait » sans données produirait
  une mission vide, découverte chez le client.
- `portSyncInerte` rend `{ statut: 'indisponible' }`. **Jamais une pastille verte** : une pastille
  qui verdit sans serveur annonce plus qu'elle ne fait, et le prix se paie en journée d'entretiens.

### Construction

`pnpm --filter @axion/field build` enchaîne `tsc` (app + service worker), `vite build`, puis
`scripts/build-sw.mjs` — Workbox 7 en `injectManifest`, **sans `vite-plugin-pwa`** (hors liste 11 §1,
arbitrage A01). Le manifeste de précache ne peut être calculé qu'APRÈS que `dist/` existe : l'ordre
n'est pas négociable.

## Contraintes qui pèsent sur chaque écran

- **Aucune couleur ni taille en dur** : tokens de `@axion/ui` uniquement. `pnpm check:invariants`
  refuse jusqu'à la couleur de thème du `index.html`, injectée à la construction depuis les tokens.
- **Cible tactile ≥ 44 px** (A27) : l'app se pilote au doigt, debout.
- **Règle des 4 états** (§33.2) : tout écran livré avec vide, chargement, erreur et nominal.
- **Police auto-hébergée** (`@fontsource-variable/inter`) : un CDN de police casserait le mode avion.
  C'est un critère de la porte P-C, pas une préférence.
- **Interface 100 % en français** ; horodatages au fuseau de **mission**, jamais celui de l'appareil.
- **Zéro bouton « enregistrer »** (E23) : l'enregistrement est continu, l'indicateur « Enregistré »
  en atteste.

## Limite de test assumée

`context.setOffline(true)` de Playwright couvre les scénarios réseau, mais **les service workers sous
iOS ne sont pas couverts**. Le mode avion RÉEL sur iPad se rejoue **à la main** aux portes P-C et
P-E (11 §7, checklist 07 §15). Documenté, pas contourné.

## Développement

```bash
pnpm --filter @axion/field dev    # http://localhost:5173
```

En production, Caddy sert cette app à la racine du domaine (`/`), la console sous `/hq` et l'API
sous `/api` : même origine, donc **aucun CORS**.
