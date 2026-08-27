# `@axion/shared` — contrat commun API ↔ fronts

Ce paquet existe pour une seule raison : **il ne doit y avoir qu'une définition de chaque chose**.
Un schéma de validation recopié dans l'API et dans le front finit par diverger, et la divergence ne
se voit qu'en production. Tout ce qui est écrit ici est importé **par les deux côtés**, jamais
redéclaré (contrat 11 §3).

## Ce qu'il contient

| Module          | Rôle                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `errors.ts`     | `ERROR_CODES` et la forme d'erreur d'API. **Aucun littéral libre ailleurs dans le dépôt.**       |
| `env.ts`        | Lecture et validation Zod des variables d'environnement — échec au démarrage, jamais à l'usage.  |
| `pagination.ts` | Pagination **keyset** (`?limit=&after=`). L'offset est interdit par le contrat, à toute échelle. |
| `redaction.ts`  | Politique unique de masquage des journaux (RGPD). Voir l'avertissement ci-dessous.               |
| `temps.ts`      | Dates ISO 8601 **UTC**. Le fuseau de mission ne s'applique qu'à l'affichage.                     |

## Deux règles qui ont déjà coûté un défaut

**`redaction.ts` est unique, et doit le rester.** L'API et le worker en ont un jour porté deux
copies ; celle du worker avait dix champs de moins — `password`, `token` et `phone` en faisaient
partie. Une politique de masquage dupliquée est une politique de masquage fausse. Si un service a
besoin d'un champ supplémentaire, il s'ajoute **ici**.

**Ce paquet est compilé, pas consommé en source.** Node ne charge pas de `.ts` à l'exécution : les
consommateurs importent `dist/`. `pnpm lint` et `pnpm typecheck` construisent donc les paquets
d'abord — un `pnpm lint` sur un dépôt fraîchement cloné échouerait sinon, sans rapport avec la
qualité du code.

## Commandes

```bash
pnpm --filter @axion/shared build       # émet dist/ (obligatoire avant toute consommation)
pnpm --filter @axion/shared typecheck
```
