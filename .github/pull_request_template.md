<!--
=============================================================================
GABARIT DE PULL REQUEST — reprend la DoD transverse (09 §3) et le pipeline
7 étapes (09 §3 / CLAUDE.md §4). Applique aussi 11 §9bis (conventions git)
et 02 §30.5 (merge uniquement par PR, CI verte obligatoire).

Une case cochée engage une SIGNATURE (09 §1, chaîne : agent de lot → chef
d'équipe → A01 → Williams). Cocher sans preuve, c'est mentir dans un outil
d'audit — voir 11 §9bis : « la trace d'audit de ton propre outil d'audit ».

Traçabilité E36/E43 — lot L0 (07 §12), agent A52.
=============================================================================
-->

## Lot / incrément

- **Lot :** `L?` — **incrément :** `L??` (11 §6 : une session = un incrément)
- **Branche :** `lot/<code>` → `main`, **squash merge**, suppression de branche (11 §9bis)
- **Références du pack couvertes :** (ex. 07 §12 lot L0, 02 §30.5-30.6, 11 §7)
- **Exigences E1-E47 rattachées :** (fichier 08 — obligatoire, voir « code orphelin » ci-dessous)

## Ce que fait cette PR

<!-- 3 à 10 lignes. Ce qui change, et pourquoi le pack l'impose. -->

---

## Pipeline — 7 étapes, aucun raccourci (09 §3)

- [ ] **1. Brief** — ordre de lecture du lot (00_INDEX) + contenu/critères du fichier 07 ; périmètre confirmé par le gardien A02
- [ ] **1bis. Conception** — note `docs/conception/LOT_<X>.md` validée par A01 + gardien _(lots à risque UNIQUEMENT : L2, L3, L5, L6 — cocher « sans objet » pour L0, L1, L4, L7)_
- [ ] **2. Implémentation** — TDD sur les parties critiques (sync, RBAC, scoring, machine à états : **tests écrits AVANT**)
- [ ] **3. Auto-revue** — l'agent qui a codé a relu son diff contre les 8 invariants
- [ ] **4. Revue croisée** — relue **intégralement** par un réviseur qui n'a rien produit (09 §5.6 : le test n'est jamais écrit par l'auteur du code testé)
- [ ] **5. Tests automatisés** — unitaires + intégration + E2E du lot **+ non-régression de TOUS les lots précédents**
- [ ] **6. Contrôle d'acceptation** — gardien A02 : critères du lot + matrice E1-E47 **dans les deux sens**
- [ ] **7. Porte humaine** — _(uniquement si cette PR franchit une porte)_ fichier `docs/portes/PORTE_<X>_<date>.md` commité (11 §9bis : le merge en dépend)

## Definition of Done transverse (09 §3 — cochée par le gardien A02)

- [ ] **lint + typecheck stricts = 0 erreur**
- [ ] **tous les tests verts, AUCUN test skippé** _(job `anti-skip` vert — 11 §2 / 09 §5.7)_
- [ ] **couverture ≥ 90 % sur les modules critiques** (sync, crypto locale, scoring, RBAC/propriété) — **MESURÉE, pas déclarée** _(job `coverage` ; `.github/coverage-critical-paths.json` à jour du module livré)_
- [ ] **migrations up/down exécutées sur staging**
- [ ] **tout écran livré avec ses 4 états** (03 §33.2)
- [ ] **axe-core vert**
- [ ] **scénario fil rouge `@filrouge` vert sur FIL-TPE ET FIL-GC** _(07 §13 / 09 §4bis — les DEUX échelles, pas une seule)_
- [ ] **README de l'app à jour**
- [ ] **aucun TODO/FIXME sans entrée `DECISIONS.md` ou `AMELIORATIONS.md`**
- [ ] **diff schéma-vs-04 = zéro écart** _(job `schema-diff` — dès le lot L1)_
- [ ] **entrée `docs/ETAT.md` à jour** _(11 §9ter : dernier bloc, étape de pipeline, prochaine action)_

## Invariants et interdictions (CLAUDE.md §1 et §2)

- [ ] Aucune **référence client** (nom d’un client réel) hors fixture — invariant 2
- [ ] Aucune **couleur / taille en dur** : tokens du design system uniquement — invariant 4
- [ ] **UUID v7 côté applicatif** (`uuidv7`), jamais de fonction SQL de génération v7
- [ ] Aucune **donnée personnelle dans les logs** (redaction pino configurée)
- [ ] **Aucune valeur de secret** dans un fichier versionné ; secrets factices dans les tests _(job `gitleaks` vert — 02 §30.4-5)_
- [ ] **Aucune dépendance hors de la liste 11 §1** ; aucune montée de version majeure
- [ ] RBAC serveur systématique ; écritures de sync réservées au **propriétaire de la session** (05 §9.9)
- [ ] Interface **100 % en français** ; horodatages **UTC** en base/API

## Traçabilité — code → exigences (09 §3 étape 6, V2.11)

- [ ] **Toute** route, table, écran ou job livré se rattache à une exigence **E1-E47** OU à une fiche `AMELIORATIONS.md`
- [ ] **Le code orphelin est REFUSÉ** — rien dans ce diff n'est sans rattachement
- [ ] Améliorations d'**étage 1** journalisées dans `AMELIORATIONS.md` (plafond 0,5 j/lot)
- [ ] Aucune fonctionnalité d'**étage 2** implémentée avant arbitrage de Williams (09 §5.9)

## Décisions et doutes

- [ ] Tout doute de spec est tracé dans `DECISIONS.md` au format normé (11 §9bis) — **aucune devinette** (09 §5.1)
- [ ] Aucun écart silencieux à la spec (09 §5.2)

**Entrées `DECISIONS.md` créées par cette PR :**
<!-- lister les dates + intitulés, ou « aucune » -->

---

### Rappel de gouvernance

> Le merge est bloqué tant que la CI n'est pas **entièrement verte** (02 §30.5).
> Un job qui « passe » en masquant un échec est une faute plus grave que le bug
> qu'il masque (09 §5.7).
