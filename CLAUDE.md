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

Node 22 LTS · pnpm 9 · TypeScript 5 (`strict`) · `minio` 8.0.7 (client d'objet de l'API, ajouté le 2026-10-09 sur décision de Williams) · Fastify 5 (+ `@fastify/cookie`, ajouté le
2026-08-31 sur décision de Williams — voir `DECISIONS.md`) · PostgreSQL 16 · Redis 7 · MinIO ·
**Drizzle ORM** + migrations **SQL brut versionné** · Zod 4 (`packages/shared`) · React 18 + Vite +
Tailwind + shadcn/ui · Dexie 4 · Workbox 7 · TanStack Query 5 (console uniquement) · BullMQ 5 ·
pino 9 · Vitest 3 + Testcontainers + `jsdom` + `@testing-library/react` + `@vitejs/plugin-react`
(ajoutés le 2026-08-31 sur décision de Williams — voir `DECISIONS.md`) · Playwright · k6 · `uuidv7` · `hash-wasm` (Argon2id navigateur) ·
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

## 4. RÉGIME RAPIDE — 3 ÉTAPES PAR LOT (Williams, 2026-10-09 — prime sur 09 §3)

**But unique de la Phase 1 :** un consultant mène un audit sur tablette → les données remontent au
siège → un rapport en sort. Tout ce qui ne sert pas ce parcours attend.

**Ordre de travail :** (1) séance P-C sur iPad (corriger d'abord le double `<h1>`) →
(2) ancres de cotation de la banque (`ANCRES_ABSENTES`) → (3) **L6 sync COMPLÈTE**, seule →
(4) scoring branché (route + `scores.csv`) → (5) profil d'interlocuteur saisi en entretien →
(6) rapport DOCX v1 → (7) audit fictif de bout en bout ; ce qui bloque devient la liste suivante.
Après : radar, finitions, charge 50 clients, perf détaillée, multi-auditeurs avancé.

1. **Brief** — critères du lot dans le fichier 07 + ordre de lecture §0. Pas de note de conception,
   SAUF L6 (une page).
2. **Code + tests** — **tests écrits AVANT** sur sync, RBAC/propriété, chiffrement local, scoring,
   machine à états. Sur ces zones, **le test n'est jamais écrit par l'agent qui a écrit le code**.
3. **Revue + CI verte → PR** — une revue séparée (sous-agent qui n'a rien produit) **seulement**
   pour sync, RBAC, chiffrement local, étanchéité financière ; ailleurs, l'auto-revue suffit.
   La suite complète tourne en CI.

**Quatre rôles suffisent :** auteur · testeur distinct · relecteur des zones critiques · gardien
des critères (A02, à la porte seulement). Les autres gabarits de `.claude/agents/` ne s'invoquent
que pour leur spécialité, jamais par principe.
**Budget d'itération : un bug qui résiste à 3 tentatives = arrêt et question à Williams.**
**L6 se développe SEULE. Une branche à la fois par fichier.** Paralléliser : `docs/ORGANISATION_AGENTS.md`.

---

## 5. DEFINITION OF DONE (à la porte)

- [ ] lint + typecheck = **0 erreur** ; tous les tests verts, **AUCUN test skippé**
- [ ] couverture ≥ 90 % **mesurée** sur sync, crypto locale, scoring, RBAC/propriété
- [ ] `@filrouge` vert ; écrans livrés avec leurs **4 états** ; axe-core vert
- [ ] migrations up/down sur staging ; **diff schéma-vs-04 = zéro écart**

Plus de matrice de traçabilité à cocher dans les deux sens : `check:tracabilite` reste en CI.

---

## 6. AMÉLIORATIONS

Étage 1 (confort évident, sans toucher schéma/API/crypto/périmètre) : autorisé, une ligne dans
`AMELIORATIONS.md`. Étage 2 (fonction manquante) : une fiche, **jamais codée avant le oui de Williams**.

---

## 7. GIT

- `main` protégé : une branche par incrément → PR → **squash merge**. Jamais de commit direct.
- Commits conventionnels **d'une ligne** (`feat(l6a): …`) ; `wip:` autorisé sur la branche.
- **`DECISIONS.md` : une ligne par vrai arbitrage** (`date · [lot] · décision · décideur`).
  Les constats et récits vont dans le commit, pas dans un registre.
- **Pas de PR de documentation seule** : la doc voyage dans la PR de code du lot.
- **Porte** = une fiche `docs/portes/PORTE_<X>_<date>.md` : critères du 07, preuve (lien CI ou
  capture), signature de Williams. Rien d'autre (pas de pré-revue, pas de contre-revue).

---

## 8. REPRISE ET DURABILITÉ

- **`docs/ETAT.md` = UN seul bloc de ≤ 8 lignes, réécrit** (git garde l'historique) : date, branche,
  dernier commit vert, tâche en cours, prochaine action, tests rouges connus.
- **Commit + push à chaque sous-tâche terminée.** Un commit non poussé n'existe pas.
- `pre-push` rejoue `pnpm verify:rapide` ; `pnpm verify` complet avant d'ouvrir une PR.
- **Reprise** : ETAT.md → `git log -5` + `git status` → rejouer les tests (la vérité, ce sont
  les tests) → « Prochaine action ».
- **Williams : une séance de 30 min par semaine**, sur une liste préparée d'avance (oui / non).
  Aucun dossier à lire.

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

## 10. SIGNATURE

Auteur → relecteur (zones critiques) → gardien A02 (à la porte) → **Williams** (la porte, le merge).
