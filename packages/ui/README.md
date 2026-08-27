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
- `tokens.test.ts` — les contrôles d'écart de teinte et de contraste.

## Commandes

```bash
pnpm --filter @axion/ui build
pnpm --filter @axion/ui test
```
