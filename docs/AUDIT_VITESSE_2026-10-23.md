# Audit de vitesse d'implémentation — 2026-10-23

Mesuré sur le dépôt (runs CI réels, scripts, agents, docs). Rien n'est modifié : ce sont des propositions,
classées par gain / coût. « Forfait » = jetons consommés sur l'abonnement.

## 1. Constats mesurés

| Constat | Chiffre |
| --- | --- |
| Durée d'un run CI complet (PR) | 14 à 18 min |
| Chemin critique (jonction → build → unit → intégration → e2e → schema-diff) | ≈ 14 min, enchaîné en série |
| Job « couverture » | 10,5 min, rejoue TOUTE la suite, intégration comprise (déjà jouée par le job intégration, 8 min) |
| Runs en échec sur les 40 derniers | 23 rouges, 15 verts, 2 annulés (58 % rouge) |
| Déclencheurs CI | `push` sur `lot/**` ET `pull_request` : chaque push lance 2 runs |
| 4 images Docker construites à chaque PR « NON déployées » | ≈ 4 min de runners par run |
| `main` rouge | ZAP baseline échoue après le déploiement staging |
| Intégration | `singleFork` : tous les fichiers en série dans un seul processus (≈ 8 min) |
| `docs/` | 808 Ko ; `TRACABILITE_E1-E47.md` 406 Ko, `03_MODULES` 120 Ko |
| `AMELIORATIONS.md` | 206 Ko (ne jamais le lire en entier) |
| Permissions Claude du projet | une seule règle autorisée : chaque commande courante demande un clic |

Le débit réel est bon (L4, L5, L6a et L6b en une journée, le 09/10). Les pertes viennent de l'attente de la
CI et des cycles rouge → correction → nouveau run, pas de l'écriture du code.

## 2. Propositions classées

### A. CI : gain élevé, aucun coût de forfait (zone « config », hors schéma/API/crypto)

1. **Ne plus rejouer l'intégration dans « couverture »** (gain : 10 min de runner par run, et le job qui
   échoue le plus souvent). Mesurer la couverture dans le job intégration (`--coverage` sur les trois
   projets) ou limiter « couverture » à unit + interface si les modules critiques y sont couverts.
   À vérifier avant : que les modules critiques (sync, RBAC) ne dépendent pas de la couverture issue de
   l'intégration (`.github/coverage-critical-paths.json`).
2. **Casser la chaîne en série** : `e2e` n'a pas besoin d'attendre `intégration`, ni `schema-diff` d'attendre
   `e2e` ; `build-sources` n'a pas besoin d'attendre `jonction` ; `typecheck` peut tourner avec `lint`.
   Chemin critique estimé : ≈ 14 min → ≈ 9 min.
3. **Un seul déclencheur par branche** : retirer `push: lot/**` (garder `pull_request` + `push: main`) ou
   inversement. Divise par deux les runs et les annulations croisées.
4. **Filtres de chemins** : un changement `docs/**` seul ne lance pas intégration, e2e ni images.
5. **Images Docker seulement sur `main`** ou quand `infra/`, un `Dockerfile` ou `package.json` change.
6. **Réparer ou rendre non bloquant ZAP** sur `main` : un `main` rouge en permanence masque les vraies
   régressions (décision de Williams : le laisser rouge ou non bloquant).
7. **Partager l'intégration en 2 ou 3 parties** (une base par partie) : ≈ 8 min → ≈ 3-4 min. Coût moyen,
   à faire en dernier et avec la suite `@critique` inchangée (aucun test désactivé).
8. **Enquêter sur les 58 % de rouges** : un échec a fait tomber 5 petits jobs d'un coup (gitleaks, audit,
   jonction, invariants, shellcheck), ce qui ressemble à un problème d'installation ou de runner et non à
   du code. Lire les journaux d'un de ces runs avant de décider.

### B. Boucle locale (avant de pousser)

9. **Rendre `verify:rapide` parallèle** (13 gardes + lint + typecheck + tests, enchaînés par `&&`).
   Un petit script Node sans nouvelle dépendance lance les gardes ensemble ; seuls lint et typecheck restent
   séquentiels après la construction des paquets. Gain attendu : -30 à -50 % du pre-push.
10. **Tests ciblés pendant le travail** : `vitest related <fichiers>` ou `--changed` ; la suite complète
    seulement au pre-push et en CI.
11. **Liste d'autorisations** du projet (`/fewer-permission-prompts`) : lecture, `pnpm lint/test/typecheck`,
    `git status/diff/log`, `gh pr checks`. Supprime les clics qui cassent le rythme d'une session.

### C. Organisation du travail et forfait

12. **Un brief par lot, extrait des §** : `docs/briefs/L<n>.md` généré une fois (script qui découpe les §
    cités dans l'ordre de lecture du `CLAUDE.md` §0). Une session lit 10 à 20 Ko au lieu de relire des
    fichiers de 40 à 120 Ko : c'est le plus gros levier de forfait, parce que chaque jeton lu est relu à
    chaque tour.
13. **Ne jamais ouvrir** `TRACABILITE_E1-E47.md` et `AMELIORATIONS.md` : le dire dans `CLAUDE.md` (deux
    lignes) ; `check:tracabilite` fait déjà le contrôle en CI.
14. **Répartition des modèles sous `opusplan`** (cohérente avec les agents déjà configurés) :
    - Opus : relecteurs a17, a29, gardien a02, et les zones critiques (a14, a24, a25) ;
    - Sonnet : auteurs d'écrans/API ordinaires et testeurs (`inherit`) ;
    - jamais d'agent relecteur pour le code non critique (déjà dans `CLAUDE.md` §4).
15. **Un lot = une PR = un cycle CI** : regrouper les petits correctifs, faire passer `pre-push` avant, et
    ne pousser qu'une fois par séquence de travail (chaque push relance toute la CI).
16. **Fusion automatique dès le vert** (déjà autorisée pour Axion Audit) et attente de la CI en arrière-plan
    (`gh pr checks --watch`), jamais en sondage.

### D. Pour les projets à venir

17. **Un gabarit de dépôt** (`modele-projet/`) reprenant ce qui a fait ses preuves : `CLAUDE.md` court,
    `docs/ETAT.md`, hook pre-push parallèle, CI à jobs parallèles avec filtres de chemins, `verify:rapide`,
    agents réduits à 4 rôles, liste d'autorisations. Un nouveau projet démarre avec cela dès le premier jour,
    au lieu de le redécouvrir après 100 PR.
18. **Garder les gardes spécifiques à Axion hors du gabarit** (invariants, traçabilité E1-E47) : à copier au
    cas par cas.

## 3. Ordre conseillé

| Étape | Contenu | Effort | Gain |
| --- | --- | --- | --- |
| 1 | A3, A4, A5 (déclencheurs, filtres, images) | 1 petite PR | -50 % de runs |
| 2 | A1, A2 (couverture sans double jeu, jobs parallèles) | 1 PR | CI 14 → 9 min |
| 3 | B9, B11 (pre-push parallèle, autorisations) | 1 PR + réglage | boucle locale plus courte |
| 4 | C12, C13 (briefs, fichiers à ne pas lire) | 1 PR | forfait |
| 5 | A8 (cause des rouges), A6 (ZAP) | enquête | moins de cycles rouges |
| 6 | A7 (partage de l'intégration), D17 (gabarit) | PR moyenne | CI → 5-6 min, projets futurs |

## 4. Risques et limites

- Les étapes A1, A2 et A7 touchent la CI qui garde les zones critiques : à faire par une PR dédiée, avec
  relecture séparée (`CLAUDE.md` §4), sans désactiver ni sauter aucun test.
- Les gains de durée sont des estimations tirées des temps par job de deux runs ; ils sont à remesurer
  après chaque étape.
- Je n'ai pas lu les journaux d'échec des runs rouges : A8 reste une hypothèse.
