# @axion/field — PWA terrain

React 18 + Vite. **Offline-first radical** (invariant 1) : le réseau est un bonus, jamais un
prérequis. L'auditeur travaille en entrepôt, en sous-sol, en avion.

## Pourquoi Vite et pas Next.js

Décision ferme du contrat 11 §2. Le SSR est inutile (outil interne authentifié, aucun SEO) et
**nuisible** ici : l'app doit démarrer depuis le cache du service worker **sans serveur**. Ne jamais
scaffolder Next dans ce dépôt, même « par habitude ».

## État au lot L0

Coquille buildable. Le service worker Workbox, Dexie, la DEK/KEK, le verrouillage et
`storage.persist()` arrivent au **lot L5a** — les ajouter ici anticiperait un lot, ce que le pipeline
interdit (09 §5.3).

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
