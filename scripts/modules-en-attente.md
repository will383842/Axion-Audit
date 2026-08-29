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

| module                          | incrément consommateur | déclaré le | justification                                                                                                                                                               |
| ------------------------------- | ---------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/api/src/http/pagination.ts | L3b                    | 2026-08-29 | Moitié serveur du keyset (11 §3) livrée au socle L3a ; premiers consommateurs nommés par `docs/conception/LOT_L3.md` §2 : `GET /v1/companies` puis `GET /v1/missions` (L3b) |

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
