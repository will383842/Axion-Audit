# @axion/field — PWA terrain

React 18 + Vite. **Offline-first radical** (invariant 1) : le réseau est un bonus, jamais un
prérequis. L'auditeur travaille en entrepôt, en sous-sol, en avion.

## Pourquoi Vite et pas Next.js

Décision ferme du contrat 11 §2. Le SSR est inutile (outil interne authentifié, aucun SEO) et
**nuisible** ici : l'app doit démarrer depuis le cache du service worker **sans serveur**. Ne jamais
scaffolder Next dans ce dépôt, même « par habitude ».

## État au lot L5a — le SOCLE

Livré : shell PWA + service worker Workbox, base locale Dexie **versionnée**, coffre **DEK/KEK**,
port d'écriture, horloge à décalage serveur, verrou 15/60 min + Wake Lock, `storage.persist()`.
**Aucun écran de collecte** : l'écran d'entretien est L5b (A22), la journée et l'export de secours
sont L5c (A23).

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
| `scripts/build-icones.mjs`     | icônes PWA **provisoires**, générées depuis les jetons de la charte (voir ci-dessous)           |

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

### Les icônes sont PROVISOIRES, et générées

`scripts/build-icones.mjs` fabrique `public/icones/*.png` (192, 512, maskable,
`apple-touch-icon`) à partir de `COULEURS_CHARTE` — aucune couleur en dur, aucune dépendance
nouvelle (encodeur PNG sur `node:zlib`). Elles sont **ignorées par git** : ce sont des artefacts
de construction, régénérés par `pnpm --filter @axion/field build`.

**Pourquoi elles existent quand même** : sans icône, le manifeste n'est pas installable ; sans
installation « Sur l'écran d'accueil », pas de persistance durable d'IndexedDB sur iPad (03 §22.1) ;
sans persistance, aucune mission n'est embarquable (05 §31-2). C'était le bloquant B2 de la revue
croisée A29.

**Le dessin reste celui de Williams** (`DECISIONS.md` 2026-09-02) : le manifeste porte
`"_provisoire": true`, et le remplacement sera une substitution de fichiers, sans une ligne de code
à toucher.

### Construction

`pnpm --filter @axion/field build` enchaîne `tsc` (app + service worker), `build-icones`, `vite build`, puis
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
