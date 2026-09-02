# Modules en attente de consommateur — la soupape de `check:graphe-modules`

Ce fichier est **la donnée** du garde-fou `scripts/check-graphe-modules.mjs`. Il n'a pas d'autre
lecteur, et c'est voulu : ce n'est pas un registre de gouvernance de plus, c'est l'unique dérogation
tracée à la règle `CLAUDE.md` §4 étape 6 — « **le code orphelin est REFUSÉ** ».

## Pourquoi une soupape

Un module écrit à un incrément et consommé au suivant est **légitime** : c'est le cas normal du TDD
que le pipeline impose (09 §3-2, « tests écrits AVANT »). Un refus brutal bloquerait le travail réel,
et **un garde qui bloque à tort finit désactivé** — ce qui est pire que pas de garde.

## Pourquoi ici, et pas dans `DECISIONS.md` ni dans `AMELIORATIONS.md`

- `DECISIONS.md` est **append-only** (`CLAUDE.md` §7). Or cette liste doit **RÉTRÉCIR** : une entrée
  disparaît le jour où le module est consommé. Une soupape qu'on ne peut pas retirer n'est pas une
  soupape — c'est une dispense permanente.
- `AMELIORATIONS.md` est un registre de **fiches arbitrées** (étage 1 / étage 2, plafond en j-h,
  arbitre Williams). Un module en attente de branchement n'est ni une amélioration, ni une demande
  d'arbitrage : c'est un état transitoire du code.
- Le fichier suit en revanche l'idiome de `CLAUDE.md` §6 — **« un registre, un plafond et un
  arbitre »** : plafond **5 entrées**, péremption **14 jours**, relecture par le réviseur croisé
  comme le reste du diff.

## Format — quatre colonnes, une ligne par module

| module                                   | incrément consommateur | déclaré le | justification                                                                                                                                                       |
| ---------------------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/field/src/local/depots/sessions.ts  | L5b                    | 2026-09-02 | Interface publiée le premier jour par L5a (LOT_L5.md §2) pour que L5b n attende pas : l écran 3 zones lit les sessions du jour et la session en cours par ce dépôt. |
| apps/field/src/local/depots/reponses.ts  | L5b                    | 2026-09-02 | Interface publiée le premier jour par L5a (LOT_L5.md §2) : l écran 3 zones lit et compte les réponses d une session par ce dépôt (avancement, à-revoir).            |
| apps/field/src/local/depots/questions.ts | L5b                    | 2026-09-02 | Interface publiée le premier jour par L5a (LOT_L5.md §2) : le questionnaire figé et la recherche hors-parcours (03 §25.4) passent par ce dépôt.                     |
| apps/field/src/local/depots/outbox.ts    | L5b                    | 2026-09-02 | Interface publiée le premier jour par L5a (LOT_L5.md §2) : le compteur d opérations en attente alimente l indicateur d enregistrement de L5b, puis le push de L6a.  |
| apps/field/src/session/machine.ts        | L5b                    | 2026-09-02 | Interface publiée le premier jour par L5a (LOT_L5.md §2) : terminer et valider un entretien (03 §19.1 V2.10) sont des gestes de l écran L5b, pas du socle.          |

_(**Cinq entrées, toutes L5a → L5b, déclarées le 2026-09-02.** Elles sont le cas normal que cette
soupape décrit : `LOT_L5.md` §2 fait publier par L5a, le premier jour, les interfaces que L5b et L5c
consommeront — sans quoi les deux incréments suivants attendraient. Les DEUX modules L5a qui
n'étaient PAS dans ce cas (`local/jetons.ts`, `local/embarquement.ts`) ont été CÂBLÉS dans la coquille
le même jour plutôt qu'inscrits ici : ce sont des livrables du socle, pas des interfaces en avance.
Le plafond de 5 est donc atteint exactement, et il le restera : toute nouvelle entrée exige d'abord
qu'une de celles-ci sorte. Historique : `apps/api/src/http/pagination.ts` en est sortie le **2026-08-31**, et les deux
branches qui fusionnent ici en donnaient chacune une raison différente — la fusion tranche plutôt que
de garder les deux. **`GET /v1/users` (L2/T3) est le premier consommateur réel**, désigné comme tel
par la note de conception L2 §4.5 et livré sur `main` avant L3a ; `GET /v1/companies` (L3a, via
`apps/api/src/domaines/companies/depot.ts`) est le **second**, et c'est lui que la note de conception
L3 avait anticipé. La règle 2 a fait exactement ce pour quoi elle existe dans les deux cas : c'est le
garde qui a réclamé le retrait de la ligne, pas la mémoire de l'auteur.)_

## Les cinq règles que la machine applique

1. Une entrée dont le module **n'existe pas / n'est pas suivi par git** → REFUS (entrée périmée).
2. Une entrée dont le module **est désormais atteint** → REFUS : la soupape a fait son office,
   **retire la ligne**. C'est le seul mécanisme qui empêche une entrée de dormir.
3. Une entrée **plus vieille que 14 jours** → REFUS. Le budget de Phase 1 est de 26 j-h : deux
   semaines couvrent plusieurs incréments.
4. **Plus de 5 entrées** → REFUS. Une soupape sans plafond est une décharge.
5. Colonnes manquantes, date hors format `AAAA-MM-JJ`, justification de moins de 15 caractères
   → REFUS. Une soupape qu'une machine ne sait pas lire n'est pas tracée : elle est décorative.

Portée exacte du contrôle, angles morts compris :
`node scripts/check-graphe-modules.mjs --angles-morts`.
