# `@axion/ui` — design system et tokens de la charte

Ce paquet porte **l'invariant 4** : _aucune couleur, aucune taille en dur ailleurs dans le dépôt_.
Toute valeur visuelle vient d'ici, et un garde-fou de CI (`pnpm check:invariants`, contrôle `INV-4`)
refuse le commit qui écrirait un hexadécimal dans un composant.

## La charte

| Rôle        | Token      | Valeur    |
| ----------- | ---------- | --------- |
| Action      | terracotta | `#c24a1b` |
| Fond        | ivoire     | `#faf8f3` |
| Information | bleu       | `#1a4dd9` |
| Texte       | mocha      | `#2a2520` |
| **Alerte**  | carmin     | `#8c0a33` |

**Pourquoi le rouge d'alerte est carmin et non un rouge courant.** Le pack impose « l'alerte est un
rouge **distinct** » — distinct du terracotta d'action, sans quoi un bouton « Enregistrer » et un
message « Données perdues » se ressemblent. La première valeur proposée n'était séparée du
terracotta que de **19,8° de teinte** ; `#8c0a33` en donne **35,8°**, pour un contraste mutuel de
1,94. Ces chiffres sont **mesurés par `tokens.test.ts`**, pas déclarés : modifier un token sans
respecter l'écart fait échouer la suite.

## Contenu

- `tokens.ts` — la source unique, typée.
- `tokens.css` — les mêmes valeurs en variables CSS, pour Tailwind et les feuilles de style.
  Il **importe `polices.css` en tête** : le jeton et la police qu'il nomme sont une seule promesse.
- `polices.css` — les `@font-face` d'Inter variable auto-hébergée.
- `tokens.test.ts` — les contrôles d'écart de teinte et de contraste.

## La police est AUTO-HÉBERGÉE, et c'est vérifiable

Contrat 11 §1 et §33.1 : `@fontsource-variable/inter`, **jamais de CDN** — la PWA doit rendre son
texte en mode avion. Un seul import (`@axion/ui/tokens.css`) suffit à l'obtenir : `polices.css`
n'est **pas** à importer séparément dans les applications, précisément parce qu'un second import à
ne pas oublier dans deux `main.tsx` est ce qui a produit le défaut relevé en recette (le jeton
`--typo-police-corps` déclarait Inter, le build ne sortait aucun `@font-face` ni aucun `.woff2`, et
c'est la police système qui s'affichait — pendant que `font-src 'self'` passait « vert » faute de
police à garder).

**Ce qui est embarqué : 2 fichiers, ~131 Ko** sur les 1,9 Mo du paquet — axe `wght` seul (une seule
police variable couvre les graisses 400/500/600/700), sous-ensembles `latin` (48 Ko, tout le
français) et `latin-ext` (83 Ko, rendu gratuit à l'exécution par `unicode-range`). Écartés :
cyrillique, grec, vietnamien et **tous les italiques** (le navigateur synthétise l'oblique).
Le raisonnement complet, y compris ce qui rouvrirait ces choix, est en tête de `polices.css`.

**Vérifier après un build** (ces commandes sont celles de la recette, avec le résultat attendu) :

```bash
pnpm --filter @axion/field build
grep -o '@font-face' apps/field/dist/assets/index-*.css | wc -l   # → 2  (et non 0)
ls apps/field/dist/assets/*.woff2                                 # → 2 fichiers
grep -o 'url([^)]*woff2)' apps/field/dist/assets/index-*.css      # → /assets/… , jamais https://
```

## Commandes

```bash
pnpm --filter @axion/ui build
pnpm --filter @axion/ui test
```
