# CLAUDE.md — Règles permanentes du dépôt Axion Audit

> Ce fichier est chargé dans CHAQUE session de codage. Il ne remplace pas le pack : il en extrait
> ce qui ne doit jamais être oublié. **Le pack (`/docs`, 12 fichiers) est LA source d'exécution.**
> Précédence en cas de divergence : **§32-36 > §24-31 > §16-22 > §1-15**, puis le fichier 11 pour
> ce qui n'y est pas tranché. **Le DDL vit EXCLUSIVEMENT dans `/docs/04_MODELE_DE_DONNEES.md`** ;
> tout SQL apparaissant ailleurs dans le pack est historique.

---

## 0. ORDRE DE LECTURE AVANT CHAQUE LOT (jamais le pack entier)

**TOUS les lots : `/docs/11_CONTRAT_TECHNIQUE.md` EN PREMIER**, puis l'ordre du `00_INDEX` :

| Lot                             | Ordre de lecture                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| L0 infra                        | 02 → 06 (§10.3) → 07                                                                          |
| L1 schéma                       | **04 EN ENTIER** → 03 (§32.1-32.2) → 01 (§2)                                                  |
| L2 auth/RBAC                    | 06 → 04 → 05 (§8.1, §9.7, §9.9) → 03 (§34.1, §34.4)                                           |
| L3 missions/arbre/questionnaire | 01 → 03 (M1-M2, §16, §18.1, §32.2, §32.4, §35.2) → 04 → 05                                    |
| L4 import banque                | 03 (M1.1, §32.1, §32.4, §36.4) → 04 (§7.3)                                                    |
| L5 PWA terrain                  | 03 (M3, §17, §19, §22.1, §25, §27, §32.5, §33, §34.2) → 01 (§20.4) → 05 (§9 + §31) → 06 (§10) |
| L6 sync                         | 05 (§9 INTÉGRAL + 8 scénarios §9.8 + §9.9) → 04                                               |
| L7-L8 console/scoring           | 03 (§18, §22.3, M5, §27.1, §32.1, §33.4, §36.3) → 04                                          |
| L10-L11 rapports/LLM            | 03 (M6, §26.2, §36.6) → 01 (§20.3) → 04 → 06 (pseudonymisation 2 passes)                      |

**Le brief d'un lot vient EXCLUSIVEMENT de la table du fichier 07** (contenu + critères d'acceptation).
Interdiction de charger le pack entier dans un sous-agent (09 §5.8).

---

## 1. LES 8 INVARIANTS NON NÉGOCIABLES (00_INDEX)

1. **Offline-first** : l'app terrain fonctionne à 100 % sans réseau ; **UUID v7 côté client** pour
   toute entité créable hors ligne ; push idempotent.
2. **Aucune référence client dans le code** : tout ce qui varie est une donnée de mission.
   (Pas de nom de client dans un identifiant, un libellé, une constante ou un test hors fixture.)
3. **RBAC serveur systématique** ; données financières (`scoping_financials`) : **routes admin
   exclusivement** ; écritures de sync réservées au **propriétaire de la session** (05 §9.9).
4. **Aucune couleur/taille en dur** : tokens du design system uniquement.
   Charte : terracotta `#c24a1b` (action) · ivoire `#faf8f3` (fond) · bleu `#1a4dd9` (info) ·
   mocha `#2a2520` (texte) ; **l'alerte est un rouge distinct**.
5. **Interface 100 % en français** ; horodatages **UTC** en base/API, fuseau de mission à l'affichage.
6. **Le terrain collecte, le siège produit** : jamais de génération lourde sur la machine terrain.
7. **Toute correction de donnée = révision tracée** ; rien n'est jamais silencieusement écrasé
   ou supprimé.
8. **Sauvegarde terrain** : sync ≥ 1×/jour + export de secours chiffré disponible et testé ;
   aucune donnée ne vit sur un seul appareil > 24 h ouvrées ; alerte automatique au-delà.

---

## 2. INTERDICTIONS EXPLICITES (contrat 11 §2) — pièges connus

- **UUID v7 généré CÔTÉ APPLICATIF** (lib `uuidv7`), client ET serveur. PostgreSQL 16 n'a PAS de
  `uuidv7()` native (PG18 seulement) → **interdiction d'une fonction SQL de génération v7**.
  `DEFAULT gen_random_uuid()` (v4) toléré UNIQUEMENT pour les tables purement serveur (logs, events).
- **Pas de Next.js.** Les deux fronts sont des SPA/PWA **Vite + React**. Ne jamais scaffolder Next,
  même « par habitude ».
- **Pas de Prisma**, pas de SQL concaténé à la main, pas d'ORM qui « génère » le schéma.
  Le fichier 04 se **transcrit littéralement** en migrations SQL ; Drizzle ne sert qu'aux requêtes typées.
- **Pas de CORS** : `apps/field`, `apps/hq` et l'API sont servis sous le **MÊME domaine** par Caddy
  (`/` → field, `/hq` → hq, `/api` → API).
- **MinIO jamais exposé publiquement** : réseau Docker interne ; download via l'API (streaming + RBAC),
  upload via le protocole de chunks §9.6.
- **Aucune donnée personnelle dans les logs** : `person_name`, emails, contenus de réponse interdits
  dans pino (redaction configurée).
- **Aucune valeur de secret dans un fichier versionné** (30.4-5) ; les tests utilisent des secrets factices.
- **Tests désactivés/skippés = build rouge** ; `@critique` et `@filrouge` ne sont JAMAIS skippables.

## 2bis. VERSIONS ÉPINGLÉES (11 §1 — `save-exact`, aucune montée majeure sans décision humaine)

Node 22 LTS · pnpm 9 · TypeScript 5 (`strict`) · Fastify 5 · PostgreSQL 16 · Redis 7 · MinIO ·
**Drizzle ORM** + migrations **SQL brut versionné** · Zod 4 (`packages/shared`) · React 18 + Vite +
Tailwind + shadcn/ui · Dexie 4 · Workbox 7 · TanStack Query 5 (console uniquement) · BullMQ 5 ·
pino 9 · Vitest 3 + Testcontainers · Playwright · k6 · `uuidv7` · `hash-wasm` (Argon2id navigateur) ·
date-fns · `@fontsource-variable/inter` (**police AUTO-HÉBERGÉE — jamais de CDN**) · cmdk (Phase 2).
**Renovate/Dependabot DÉSACTIVÉS pendant toute la Phase 1.**

---

## 3. CE QUE L'AUTOPILOTE NE DÉCIDE JAMAIS SEUL (11 §8 — escalade `DECISIONS.md`)

1. Ajouter une dépendance hors de la liste §1.
2. Modifier le fichier 04 (schéma), le contrat d'ops §4 ou une convention §3.
3. Monter une version majeure.
4. Toucher à la sécurité/crypto autrement que spécifié.
5. Désactiver ou skipper un test.
6. Créer une route non listée aux §8/§24.2 sans la documenter.
7. **Implémenter une fiche AMELIORATIONS d'étage 2 avant son arbitrage humain** (09 §5.9) —
   la proposer est un devoir, l'anticiper est une faute.

**Un doute de spec ne se devine pas : il s'écrit dans `DECISIONS.md`.**

---

## 4. LE PIPELINE — 7 ÉTAPES PAR LOT, AUCUN RACCOURCI (09 §3)

1. **Brief** — ordre de lecture du lot + contenu/critères du fichier 07 ; le gardien confirme le périmètre.
   1bis. **Conception** — **lots à risque UNIQUEMENT (L2, L3, L5, L6)** : note `docs/conception/LOT_<X>.md`
   ≤ 1 page (découpage, interfaces, points durs, plan de tests), validée par A01 + gardien **AVANT
   la première ligne de code**. L0, L1, L4, L7 sautent cette étape.
2. **Implémentation** — TDD sur les parties critiques (sync, RBAC, scoring, machine à états :
   **tests écrits AVANT**).
3. **Auto-revue** — l'agent qui a codé relit son diff contre les invariants.
4. **Revue croisée** — le réviseur de l'équipe (qui n'a rien produit) relit TOUT ;
   désaccord → arbitrage A01, tracé dans `DECISIONS.md`.
5. **Tests automatisés** — unitaires + intégration + E2E du lot + **non-régression de tous les lots
   précédents** (la suite complète tourne à chaque fois).
6. **Contrôle d'acceptation** — le gardien A02 coche les critères du lot ET la matrice de traçabilité
   E1-E47 **dans les DEUX sens** : exigences → code (rien d'oublié) ET **code → exigences
   (tout code livré se rattache à E1-E47 ou à une fiche AMELIORATIONS — le code orphelin est REFUSÉ)** ;
   la **DoD transverse** (§5) est cochée intégralement.
7. **Porte humaine** — démo à Williams (staging), checklist signée, merge, tag, changelog.

**Règle de croisement (09 §5.6) : le code de test n'est JAMAIS écrit par l'agent qui a écrit le code testé.**
**Budget d'itération (09 §5.5) : un bug qui résiste à 3 tentatives = arrêt et escalade humaine.**
**Jamais deux lots en parallèle sur les mêmes fichiers ; L6 (sync) se développe SEUL.**
**Comment paralléliser sans collision : `docs/ORGANISATION_AGENTS.md`** — un worktree par chantier,
deux chantiers actifs au maximum, les interdits git. **À lire AVANT d'ouvrir une seconde session.**

---

## 5. DEFINITION OF DONE TRANSVERSE (cochée par le gardien à l'étape 6)

- [ ] lint + typecheck stricts = **0 erreur**
- [ ] tous les tests verts, **AUCUN test skippé**
- [ ] **couverture ≥ 90 %** sur les modules critiques (sync, crypto locale, scoring, RBAC/propriété) — **mesurée**
- [ ] migrations up/down exécutées sur staging
- [ ] tout écran livré avec ses **4 états** (§33.2)
- [ ] axe-core vert
- [ ] scénario fil rouge **`@filrouge` vert sur FIL-TPE ET FIL-GC**
- [ ] README de l'app à jour
- [ ] aucun TODO/FIXME sans entrée `DECISIONS.md` ou `AMELIORATIONS.md`
- [ ] **diff schéma-vs-04 = zéro écart**

---

## 6. CANAL D'AMÉLIORATION (09 §5.9) — a un registre, un plafond et un arbitre

- **Étage 1 — micro-améliorations, autorisées D'OFFICE** : confort et robustesse évidents (libellé
  plus clair, état vide manquant, tri par défaut, message d'erreur, raccourci, focus) qui ne touchent
  **NI le schéma 04, NI l'API, NI la crypto, NI le périmètre fonctionnel**.
  **Plafond : 0,5 j cumulé par lot** ; chaque ajout = une ligne dans `AMELIORATIONS.md` ;
  relu par le réviseur croisé comme le reste du code.
- **Étage 2 — fonctionnalités manquantes : PROPOSÉES, jamais implémentées avant arbitrage.**
  Fiche `AMELIORATIONS.md` (constat terrain, valeur pour l'auditeur, coût estimé, impact schéma/API).
  Arbitrage par Williams **à la porte suivante** : ABSORBÉE (2 j max en Phase 1) / PHASE 2 (le défaut) / REFUSÉE.

---

## 7. GIT & GOUVERNANCE (11 §9bis)

- **Branches** : `lot/<code>` (ex. `lot/l5a`), une branche par incrément → PR vers `main` →
  **squash merge** → suppression de branche. **Jamais de commit direct sur `main`.**
  Tag `v0.<lot>` à chaque porte franchie.
- **Commits conventionnels** : `feat(l5a): …`, `fix(l6b): …`, `chore(l0): …`.
  Les commits intermédiaires non verts sont autorisés **sur la branche du lot** avec le préfixe
  `wip:` (jamais sur `main` ; le squash les efface).
- **`DECISIONS.md`** (append-only) — format d'entrée obligatoire :
  ```
  ## AAAA-MM-JJ — [lot] Question
  Options :
  Arbitrage : (avec la règle de précédence citée)
  Décideur : A01 | Williams
  Impact spec : aucun | amendement horodaté
  ```
  **Une décision non tracée dans ce format n'existe pas.**
- **Portes** : chaque porte produit `docs/portes/PORTE_<X>_<date>.md` — critères du fichier 07 copiés,
  cochés un à un **avec la preuve** (lien CI, capture, commande), verdict, signature humaine.
  **Le merge de la porte est conditionné à ce fichier commité.**
- **Porte échouée** (09 §4bis) : verdict ÉCHEC tracé → SEULS les correctifs de ces critères sont
  autorisés (aucun lot suivant ne s'ouvre) → la porte se rejoue **EN ENTIER** → deux échecs
  consécutifs = arbitrage Williams type P-DESCOPE.

---

## 8. SAUVEGARDE CONTINUE ET REPRISE (11 §9ter) — une coupure ne coûte jamais plus de 2 h

- **`docs/ETAT.md`** (append-only par blocs, **le dernier bloc fait foi**) mis à jour à **CHAQUE
  changement d'étape** du pipeline et au minimum toutes les ~2 h. Format normé :
  ```
  ## AAAA-MM-JJ HHhMM — [lot Lx / incrément Lxy] — étape pipeline N/7
  Dernier commit vert : <sha> (<message>)   ·   Branche : lot/<code>   ·   Poussé : oui/non
  Tâche en cours : <une phrase>
  Prochaine action : <une phrase impérative — celle qu'une session neuve exécuterait>
  Tests rouges connus : <liste ou « aucun »>
  ```
- **Commit + push toutes les ~2 h ou à chaque sous-tâche terminée.**
  **La durabilité vit sur `origin`, pas sur la machine : un commit non poussé n'existe pas.**
- **Fin de session PROPRE** (préférée à la limite de contexte) : ETAT.md à jour + commit + push +
  une ligne de journal. **C'est un geste NORMAL, pas un échec.**
- **Protocole de REPRISE** (toute session) : ETAT.md (dernier bloc) → `git log -5` + `git status` →
  `DECISIONS.md` (10 dernières) + `AMELIORATIONS.md` + journal du lot →
  **rejouer la suite de tests complète : LA VÉRITÉ TERRAIN, ce sont les tests, jamais un souvenir
  ni même ETAT.md** → si divergence : entrée `DECISIONS.md` + reconstruction depuis git et tests →
  reprendre à la « Prochaine action ».

**Fin de journée d'autopilote (09 §5.4)** : commit + push + ETAT.md + état des tests + résumé de
10 lignes au journal + **une ligne de burn-down (consommé / restant par lot vs la référence 26 j-h)**.

---

## 9. CONVENTIONS D'API (11 §3 — s'appliquent à toutes les routes)

- **Erreurs** : `{ "error": { "code": "SNAKE_CASE", "message": "message en français", "details"?: [...] } }`
  - statut HTTP cohérent. Les codes vivent dans `packages/shared` (`ERROR_CODES`) — **jamais de littéral libre**.
- **Pagination : keyset** partout (`?limit=50&after=<curseur>`), **jamais d'offset**.
- **Dates** : ISO 8601 UTC en API, `TIMESTAMPTZ` en base ; fuseau de mission à l'affichage uniquement.
- **Validation** : chaque route déclare son schéma Zod in/out depuis `packages/shared` ;
  types dérivés (`z.infer`) ; le front importe LES MÊMES schémas. **Aucun `any`.**
- **Nommage** : `snake_case` en base ↔ `camelCase` en TS (mapping Drizzle) — jamais de mélange.
- **Auth** : console (`apps/hq`) = cookies httpOnly SameSite=Lax + en-tête anti-CSRF custom ·
  terrain (`apps/field`) = Bearer + refresh token **chiffré dans Dexie**.
  Access **15 min** / refresh **30 j rotatif** avec détection de réutilisation.
- **Rate limiting** : `/v1/auth/*` 10 req/min/IP · global 300 req/min/token · helmet.

---

## 10. CHAÎNE DE SIGNATURE (09 §1 — une seule ligne, aucune diagonale)

agent de lot → chef d'équipe (A10/A20/A30/A40/A50) → **A01** directeur technique → **Williams**.

| Étape                        | Signataire         |
| ---------------------------- | ------------------ |
| Auto-revue (3)               | l'agent qui a codé |
| Revue croisée (4)            | le réviseur croisé |
| Fin d'incrément (11 §6)      | le chef d'équipe   |
| Conformité + traçabilité (6) | le gardien **A02** |
| Passage en porte             | **A01**            |
| **La porte**                 | **Williams**       |

Toute signature est une ligne dans le fichier de porte ou dans `DECISIONS.md`.
