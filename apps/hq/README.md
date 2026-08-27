# @axion/hq — Console siège

React 18 + Vite, **desktop-first** (§33.4). C'est l'outil de pilotage : portefeuille de missions,
avancement, couverture, agrégation, exports.

## État au lot L0

Coquille buildable. Les 7 espaces (§22.3) arrivent aux lots **L7-L8** puis en Phase 2.

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
pnpm --filter @axion/hq dev    # http://localhost:5174
```

L'app est construite en base `/hq/` : servie ailleurs, elle demanderait ses assets à la racine — et
c'est la PWA terrain qui répondrait.
