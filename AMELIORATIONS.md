# AMELIORATIONS.md — Registre du canal d'amélioration (09 §5.9)

> **Fichier APPEND-ONLY**, même format que `DECISIONS.md`.
> Autorisation explicite de Williams : _si l'implémentation révèle un manque pour que l'outil soit
> extrêmement professionnel, l'autopilote PEUT l'ajouter — dans CE cadre, jamais en dehors._
>
> **Étage 1 — micro-améliorations, autorisées D'OFFICE.** Confort et robustesse évidents (libellé
> plus clair, état vide manquant, tri par défaut, message d'erreur, raccourci, focus) qui ne touchent
> **NI le schéma 04, NI l'API, NI la crypto, NI le périmètre fonctionnel**.
> **Plafond : 0,5 j cumulé par lot.** Une ligne par ajout, relue par le réviseur croisé.
>
> **Étage 2 — fonctionnalités manquantes : PROPOSÉES, JAMAIS implémentées avant arbitrage** (11 §8.7 —
> « la proposer est un devoir, l'anticiper est une faute »). Fiche complète, arbitrée par Williams
> **à la porte suivante** : **ABSORBÉE** (budget sur la marge, 2 j max en Phase 1) · **PHASE 2** (le
> défaut) · **REFUSÉE**. Le fichier 04 reste inviolable hors de la révision de spec de P-D.
>
> Le gardien A02 vérifie à chaque étape 6 que **tout code non tracé E1-E47 a sa ligne ici** — le code
> orphelin est refusé.

---

## Compteur du plafond étage 1

| Lot | Consommé | Plafond | Reste  |
| --- | -------- | ------- | ------ |
| L0  | ~0,1 j   | 0,5 j   | ~0,4 j |

---

## ÉTAGE 1 — micro-améliorations appliquées

_(voir « Journal du lot L0 » plus bas)_

---

## ÉTAGE 2 — fiches en attente d'arbitrage

_(voir « Journal du lot L0 » plus bas)_

---

## ÉTAGE 2 — fiches arbitrées

_(aucune à ce jour)_

---

# JOURNAL DU LOT L0

## ÉTAGE 1 — micro-améliorations appliquées

### 2026-08-27 — [L0] Sceau d'intégrité du pack (`pnpm check:pack`)

**Constat terrain :** un `pnpm format` a reformaté les 12 fichiers du pack sans que personne ne le
demande (724 insertions, 468 suppressions). Rien dans le dépôt ne l'a signalé — c'est A55 qui l'a
remarqué en passant, dans une note d'observation de fin de rapport.

**Ajout :** `scripts/check-pack-integrity.mjs` + `docs/.pack-integrity.json` (empreintes SHA-256 des
12 fichiers), câblé en `pnpm check:pack`. Toute dérive du pack rend le contrôle rouge et affiche la
marche à suivre ; le resceller exige `--sceller`, geste explicite réservé à un amendement décidé.

**Pourquoi c'est de l'étage 1 :** robustesse évidente, ne touche NI le schéma 04, NI l'API, NI la
crypto, NI le périmètre fonctionnel. Coût réel : ~0,1 j (script + sceau + épreuve du contrôle).

**Éprouvé :** un octet ajouté à `00_INDEX.md` → sortie 1 avec message ; `git checkout` → vert.
Un contrôle non éprouvé n'est pas un contrôle.

**Relu par :** revue croisée du lot L0 (étape 4) · **Trace :** DECISIONS.md 2026-08-27
« Prettier ne touche pas au pack — et le pack est désormais scellé »

---

## ÉTAGE 2 — fiches en attente d'arbitrage

### FICHE A-001 — Hooks `PreToolUse` pour rendre mécaniques les périmètres d'écriture des agents

**Constat terrain (A55, lot L0) :** le frontmatter d'un sous-agent permet de retirer entièrement
`Edit`, `Write` ou `Bash`, mais **pas de restreindre l'écriture à un sous-arbre**. Les bornes écrites
dans les 40 gabarits — « A02 n'écrit que dans la matrice de traçabilité », « A16 n'écrit que dans les
tests », « A01 n'écrit que dans DECISIONS/ETAT/portes » — sont donc contractuelles et vérifiables
seulement **a posteriori**.

**Valeur pour l'auditeur :** indirecte mais réelle. Le dispositif du 09 repose sur la séparation
producteur/vérificateur (§5.6) et sur le droit de veto d'A02. Un vérificateur qui corrigerait
discrètement ce qu'il vérifie viderait la porte de son sens — et ce serait invisible dans un diff
volumineux. C'est le genre de garantie qu'un client grand compte demande à voir quand il audite notre
propre chaîne de production (§10.5, réversibilité et journal d'audit).

**Ce qui existe déjà et limite l'urgence :** les trois réviseurs croisés (A17, A29, A37) n'ont
**ni `Edit` ni `Write` du tout** — le risque le plus grave est donc déjà fermé mécaniquement. A55 n'a
pas `Bash`. L'étape 4 relit l'intégralité du diff.

**Coût estimé :** 0,5 à 1 j — un hook `PreToolUse` par famille de rôles dans `.claude/settings.json`,
une table périmètre → chemins autorisés, et des tests de non-régression sur le hook lui-même (un hook
qui bloque à tort est pire qu'aucun hook : il pousse à le désactiver).

**Impact schéma / API / crypto :** **aucun.** Outillage d'autopilote exclusivement.

**Recommandation d'A01 :** **PHASE 2** (le défaut). En Phase 1, cette dépense se prendrait sur le
noyau strict de 26 j-h alors que le risque résiduel est couvert par la revue croisée et par
l'absence totale d'écriture chez les réviseurs. À reconsidérer si un incident réel survient — auquel
cas cette fiche porte déjà l'analyse.

**Arbitrage Williams :** ☐ ABSORBÉE ☐ PHASE 2 ☐ REFUSÉE — _à la porte P-A_
