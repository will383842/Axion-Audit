# 11 — CONTRAT TECHNIQUE D'IMPLÉMENTATION (exécution Claude Code de bout en bout)
> **Pack d'implémentation Axion Audit — fichier 11/12** · Pack V2.12 (27/08/2026)
> **Objet :** épingler TOUTES les décisions techniques que l'autopilote devrait sinon deviner. Un agent qui devine diverge ; ce fichier réduit les zones de devinette du noyau à ~zéro. **Il est chargé par TOUS les lots, en premier, avant l'ordre de lecture du 00_INDEX.**
> **Règle :** ce contrat complète le pack sans jamais le contredire ; en cas de conflit, la précédence du 00_INDEX s'applique (§32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15) puis le présent fichier pour tout ce qui n'y est pas tranché.

---

## 1. VERSIONS DE RÉFÉRENCE (épinglées — `save-exact`, aucune montée majeure sans décision humaine)
Node 22 LTS · pnpm 9 · TypeScript 5 (`strict: true`) · Fastify 5 (+ @fastify/jwt, @fastify/rate-limit, @fastify/helmet, @fastify/multipart) · PostgreSQL 16 · Redis 7 · MinIO (dernière release stable au démarrage, figée ensuite) · **Drizzle ORM** (décision : l'option « ou Kysely » du fichier 02 est tranchée — Drizzle) + migrations **SQL brut versionné** (drizzle-kit generate → fichiers .sql relus) · Zod 4 (schémas partagés dans `packages/shared`) · React 18 + Vite + Tailwind + shadcn/ui · Dexie 4 + dexie-react-hooks · Workbox 7 · TanStack Query 5 (console uniquement) · BullMQ 5 · pino 9 · Vitest 3 + Testcontainers · Playwright (dernière stable) · k6 · uuidv7 (npm) · hash-wasm (Argon2id navigateur) · date-fns · @fontsource-variable/inter (police AUTO-HÉBERGÉE — jamais de CDN de police : offline oblige, §33.1) · cmdk (Phase 2, palette console).
**Règle Renovate/Dependabot : DÉSACTIVÉS pendant la Phase 1** (zéro dérive de dépendances en plein sprint) ; réactivés en Phase 2 avec merge manuel.

## 2. PIÈGES CONNUS — INTERDICTIONS EXPLICITES
- **UUID v7 : généré CÔTÉ APPLICATIF** (lib `uuidv7`), client ET serveur. PostgreSQL 16 n'a PAS de fonction `uuidv7()` native (n'existe qu'en PG18) — interdiction d'utiliser une fonction SQL de génération v7. `DEFAULT gen_random_uuid()` (v4) toléré UNIQUEMENT pour les tables purement serveur (logs, events).
- **Pas de Next.js** : décision ferme — les deux apps sont des SPA/PWA **Vite + React**. Le SSR de Next est inutile (aucun SEO : outil interne authentifié) et NUISIBLE pour une PWA offline-first (l'app doit démarrer depuis le cache du service worker SANS serveur). L'autopilote ne scaffolde jamais Next, même « par habitude ». (Next resterait le bon choix pour le site PUBLIC axion-ia.com — hors périmètre de cet outil.)
- **Pas de Prisma** (schéma dupliqué vs fichier 04), pas de SQL concaténé à la main, pas d'ORM qui « génère » le schéma : le fichier 04 se transcrit littéralement en migrations SQL, Drizzle ne sert qu'aux requêtes typées.
- **Pas de CORS** : `apps/field`, `apps/hq` et l'API sont servis sous le MÊME domaine par Caddy (`/` → field, `/hq` → hq, `/api` → API). Toute la classe de bugs CORS/cookies disparaît par construction.
- **MinIO jamais exposé publiquement** : réseau Docker interne uniquement ; tout download passe par l'API (streaming + RBAC) ; tout upload par le protocole de chunks §9.6.
- **Aucune donnée personnelle dans les logs** : `person_name`, emails et contenus de réponse interdits dans pino (redaction configurée) — cohérent §10.
- Tests désactivés/skippés = build rouge (déjà invariant 09) ; `@critique` jamais skippable.

## 3. CONVENTIONS D'API (tranchées — s'appliquent à toutes les routes)
- **Erreurs** : format unique `{ "error": { "code": "SNAKE_CASE", "message": "message en français", "details"?: [...] } }` + statut HTTP cohérent. Les codes vivent dans `packages/shared` (`ERROR_CODES` const) — jamais de littéral libre.
- **Pagination : keyset** partout (`?limit=50&after=<curseur>`), jamais d'offset. Curseur = id ou timestamptz selon la ressource, documenté par route.
- **Dates** : ISO 8601 UTC en API (TIMESTAMPTZ en base) ; formatage au fuseau de mission à l'affichage uniquement (§22.2).
- **Validation** : chaque route déclare son schéma Zod in/out depuis `packages/shared` ; les types TS sont dérivés (`z.infer`), le front importe LES MÊMES schémas. Aucun `any`.
- **Nommage** : snake_case en base ↔ camelCase en TS (mapping automatique Drizzle) ; jamais de mélange.
- **Auth** : console (`apps/hq`) = cookies httpOnly SameSite=Lax + en-tête anti-CSRF custom · terrain (`apps/field`) = Bearer + refresh token stocké CHIFFRÉ dans Dexie (nécessaire hors ligne, §31.3). Access 15 min / refresh 30 j rotatif avec détection de réutilisation (§10.1).
- **Rate limiting** : `/v1/auth/*` 10 req/min/IP ; global 300 req/min/token ; en-têtes de sécurité via @fastify/helmet.

## 4. CONTRAT DE SYNC — COMPLÉMENTS D'EXÉCUTION (précise §9, ne le modifie pas)
- **Format d'op** (outbox, §9.2) : `{op_id: uuidv7, entity: 'interview'|'answer'|'attachment_meta'|'org_unit_proposal'|'question_adhoc', entity_id, action: 'upsert'|'delete_soft', payload, client_updated_at}` — lots de 100 max, ordre de file préservé.
- **Déduplication serveur** : table `processed_ops(op_id PK, batch_id, result, processed_at)` (ajoutée au fichier 04, rétention 30 j) — `duplicate` = op_id déjà présent. L'upsert par UUID d'entité reste la seconde ceinture d'idempotence.
- **Question ad hoc (V2.9)** : UNE seule op `question_adhoc` ; `payload = {question: {…champs §36.4…}, mission_question: {id: uuidv7 CLIENT, position}}` — le serveur crée `questions` (origin `ad_hoc`) ET `mission_questions` ATOMIQUEMENT ; les deux ids viennent du client (P1-4), l'upsert des deux lignes est idempotent.
- **Pull delta** : `GET /v1/sync/pull?mission_id=&since=<timestamptz>&limit=` → `{server_time, changes: {entity: [...]}, next_since}` ; le client persiste `next_since` PAR mission ; premier pull = mission complète.
- **Export de secours — format de fichier** (`.axionbackup`) : JSON `{header: {format_version, mission_id, device_label, created_at, kdf: {algo: 'argon2id', salt, params}}, payload}` où `payload` = données de mission locales + outbox, chiffré AES-256-GCM avec une clé dérivée du **MOT DE PASSE utilisateur** (PAS de la DEK appareil — le sel est dans le header) → restaurable sur n'importe quel appareil du compte. Import = validation Zod du fichier + fusion par UUID (une op locale plus récente n'est jamais écrasée par l'import).
- **Crypto navigateur** : WebCrypto (AES-GCM) + `hash-wasm` (Argon2id). Budgets d'acceptation (A28) : chiffrement < 50 ms/écriture, dérivation de clé < 1 s sur iPad.

## 5. SEEDS INITIAUX (référentiels administrables ENSUITE, mais le seed L1 doit être codable MAINTENANT)
- **9 blocs** : la table du §2.1 (codes `bloc_1`…`bloc_9`, libellés exacts de la table).
- **11 fonctions** (`services`) : `rh` · `finance_compta` · `commercial_ventes` · `marketing_contenu` · `service_client` · `logistique_operations` · `production` · `juridique_conformite` · `dsi_data` · `direction_generale` · `support_admin` (libellés : §16.3).
- **Profils d'interlocuteur** (`interlocutor_profiles` + `group_code`) : `dirigeant`(direction) · `dsi`(direction) · `daf`(direction) · `drh`(direction) · `resp_metier`(encadrement) · `chef_equipe`(encadrement) · `salarie`(terrain) · `technicien_operateur`(terrain) · `autre`(terrain).
- **Paliers** (`size_tiers`) : `micro` 1-10 · `pme` 11-249 · `eti` 250-4999 · `grand_compte` 5000+ (bornes §2.3).
- **`estimation_params`** : seedées avec des valeurs par défaut RAISONNABLES marquées `description: 'défaut à valider'` (ex. `duree_entretien_dirigeant`=90 min, `duree_entretien_salarie`=45, `analyse_par_bloc`=0.5 j, `taux_horaire_charge_cadre`=65 €, `taux_horaire_charge_technicien`=38 €, `seuil_completude_bloc`=0.60, `seuil_fiabilite_answers`=3, `seuil_divergence_ecart_type`=1.5) — **Williams valide ou ajuste les valeurs AVANT la porte P-A** ; l'écran d'admin des params est en Phase 2, d'ici là ajustement par seed/SQL assumé.
- **Compte fondateur** : le seed L1 crée l'admin AVEC `habilitated_at` posé (la règle d'habilitation §34.4 ne doit jamais bloquer le premier utilisateur de l'outil).
- **Fixtures de démo** : `pnpm seed:demo` = mission fictive DÉTERMINISTE (2 unités, 12 questions couvrant tous les answer_types, 2 sessions, 1 pièce jointe) — utilisée par les E2E et la recette P-E ; jamais exécutable en prod (garde-fou env).

## 6. BOUCLE D'EXÉCUTION AUTOPILOTE — INCRÉMENTS COMMITABLES
**(V2.12) Une session = un INCRÉMENT** (09 §2 mis à jour — pour les petits lots, l'incrément EST le lot), et **aucun incrément > ~1 jour sans commit + tests verts**. Découpage imposé des deux gros lots :
- **L5a** — shell PWA offline (Workbox) + Dexie (schéma local versionné) + DEK/KEK + verrouillage + pull mission + `storage.persist()`.
- **L5b** — écran 3 zones + TOUS les types de réponse (fourchette, non-communiqué inclus) + à-revoir/NA + notes + notes volantes + ad hoc + hors-parcours.
- **L5c** — agenda + proposition d'unité + 5 types de session + atelier + entretien complémentaire + validation d'entretien (strict/expert, express R1) + compression photos R2 + export de secours + mise à jour SW §31.
- **L6a** — outbox + push par lots + `processed_ops` + contrat d'ops complet (§9.3) + propriété §9.9.
- **L6b** — pull delta + statuts visibles + backoff + « à examiner ».
- **L6c** — chunks pièces jointes (§9.6) + les 8 scénarios §9.8 scriptés + charge k6.
Chaque incrément se termine par : tests verts → commit conventionnel (`feat(l5a): …`) → entrée journal (09 §5.4). Le critère d'acceptation du LOT reste celui du fichier 07.

## 7. ENVIRONNEMENT DE DEV & CI (exécutable dès L0)
- `.env.example` EXHAUSTIF par app (toutes les variables, valeurs factices) ; `docker compose up` suffit pour tout lancer en local ; `pnpm dev` orchestré.
- CI GitHub Actions, jobs dans cet ordre : lint → typecheck → unit → integration (services : postgres, redis, minio) → e2e (chromium) → **diff schéma-vs-04 (V2.9 — base de comparaison DÉFINIE : le diff porte sur tables, colonnes, contraintes PK/FK/UNIQUE/CHECK et index du §7.1, comparés à un manifeste `schema-manifest.json` EXTRAIT du fichier 04, commité au lot L1 et relu ligne à ligne à la porte P-A ; types non précisés par le 04 = TEXT, conventions en tête du 04)** → build images → (tag) déploiement staging. Merge bloqué sans tout vert.
- **Limite Playwright assumée** : `context.setOffline(true)` couvre les scénarios réseau ; les service workers sous iOS ne sont PAS couverts par Playwright — le mode avion RÉEL sur iPad se rejoue à la main aux portes P-C et P-E (checklist §15). Documenté, pas contourné.
- Pre-commit : lint-staged (lint + typecheck rapide) ; gitleaks en CI (bloquant, §30).

## 8. CE QUE L'AUTOPILOTE NE DÉCIDE JAMAIS SEUL (escalade DECISIONS.md obligatoire)
1. Ajouter une dépendance hors de la liste §1. 2. Modifier le fichier 04 (schéma), le contrat d'ops §4 ou une convention §3. 3. Monter une version majeure. 4. Toucher à la sécurité/crypto autrement que spécifié. 5. Désactiver/skipper un test. 6. Créer une route non listée aux §8/§24.2 sans la documenter. 7. **(V2.11) Implémenter une fiche AMELIORATIONS d'étage 2 avant son arbitrage humain (09 §5.9)** — la proposer est un devoir, l'anticiper est une faute. — Tout le reste est autopiloté dans le cadre du pipeline 09 (y compris les micro-améliorations d'étage 1, plafonnées et journalisées).

## 9bis. CONVENTIONS D'EXÉCUTION GIT & GOUVERNANCE AUTOPILOTE (V2.7 — le déroulé Claude Code n'a plus d'implicite)
- **Branches** : `lot/<code>` (ex. `lot/l5a`) — une branche par incrément, PR vers `main`, **squash merge**, suppression de branche. Jamais de commit direct sur `main`. Tag `v0.<lot>` à chaque porte franchie (ex. `v0.l6` après P-D).
- **DECISIONS.md — format d'entrée** (append-only) : `## AAAA-MM-JJ — [lot] Question` puis `Options :` / `Arbitrage :` (avec la règle de précédence citée) / `Décideur :` (A01 ou Williams) / `Impact spec :` (aucun | amendement horodaté). Une décision non tracée dans ce format n'existe pas.
- **Portes — checklist matérialisée** : chaque porte produit un fichier `docs/portes/PORTE_<X>_<date>.md` : critères du fichier 07 copiés, cochés un à un avec la preuve (lien CI, capture, commande), verdict, signature humaine (« validé — Williams, date »). **Le merge de la porte est conditionné à ce fichier commité.** C'est la trace d'audit de ton propre outil d'audit.
- **Reprise de session** : protocole complet au §9ter (V2.12) — la continuité entre les sessions ne repose JAMAIS sur la mémoire d'une session.

## 9ter. SAUVEGARDE CONTINUE ET REPRISE APRÈS COUPURE (V2.12 — une coupure de Claude Code ne coûte jamais plus de 2 h de travail)
**Le fichier d'état — `docs/ETAT.md` (append-only par blocs, le dernier bloc fait foi)** : mis à jour à CHAQUE changement d'étape du pipeline et au minimum toutes les ~2 h de travail. Format normé :
```
## AAAA-MM-JJ HHhMM — [lot Lx / incrément Lxy] — étape pipeline N/7
Dernier commit vert : <sha> (<message>)   ·   Branche : lot/<code>   ·   Poussé : oui/non
Tâche en cours : <une phrase>
Prochaine action : <une phrase impérative — celle qu'une session neuve exécuterait>
Tests rouges connus : <liste ou « aucun »>
```
**Sauvegarde continue** : commit + **push systématique** toutes les ~2 h ou à chaque sous-tâche terminée — les commits intermédiaires non verts sont AUTORISÉS sur la branche du lot avec le préfixe `wip:` (JAMAIS sur `main` ; le squash merge de fin d'incrément les efface). La durabilité vit sur `origin`, pas sur la machine : un commit non poussé n'existe pas.
**Fin de session PROPRE (préférée à la limite de contexte)** : ETAT.md à jour + commit + push + une ligne de journal — puis la session s'arrête. C'est un geste NORMAL, pas un échec.
**Protocole de REPRISE (toute session, à froid comme après coupure)** : 1) lire `docs/ETAT.md` (dernier bloc) → 2) `git log -5` + `git status` sur la branche indiquée → 3) `DECISIONS.md` (10 dernières entrées) + `AMELIORATIONS.md` (fiches en attente) + journal du lot → 4) **rejouer la suite de tests complète : la VÉRITÉ TERRAIN, ce sont les tests, jamais un souvenir ni même ETAT.md** → 5) si tests et ETAT.md divergent (coupure entre deux écritures) : entrée DECISIONS.md, reconstruction de l'état depuis git + tests, correction d'ETAT.md — jamais de confiance aveugle au fichier → 6) reprendre à la « Prochaine action » (corrigée le cas échéant). Le MÊME prompt de démarrage (§9) couvre le démarrage à froid ET la reprise.

## 9. PROMPT DE DÉMARRAGE (mis à jour)
**(V2.12 — LE prompt unique, à coller tel quel dans une session Claude Code ouverte à la racine du dépôt, le pack étant dans `/docs`. Il couvre le démarrage à froid ET toute reprise après coupure.)**

« Tu es **A01, le directeur technique** du projet Axion Audit, en **AUTOPILOTE INTÉGRAL** à la tête des 40 agents du fichier 09.

DÉMARRAGE OBLIGATOIRE, dans cet ordre :
1. Lis `/docs/00_INDEX.md`, `/docs/11_CONTRAT_TECHNIQUE.md`, `/docs/09_PLAN_EXECUTION_AUTOPILOTE.md`.
2. Si `docs/ETAT.md` existe : applique le protocole de REPRISE (11 §9ter) — dernier bloc d'ETAT.md → `git log`/`git status` → DECISIONS.md (10 dernières) → AMELIORATIONS.md → journal → **suite de tests complète pour établir la vérité terrain** → reprends à la « Prochaine action ». Sinon : démarrage à froid au lot L0 (brief dans `/docs/07_PLAN_TESTS_RISQUES.md`).
3. En L0, crée le cadre : `CLAUDE.md` racine (8 invariants du 00_INDEX + interdictions 11 §2/§8 + pipeline 09 §3 + canal d'amélioration 09 §5.9 + sauvegarde 11 §9ter), `.claude/agents/` (les 40 gabarits du 09 §1), `DECISIONS.md`, `AMELIORATIONS.md`, `docs/ETAT.md`, `docs/conception/`, `.env.example`, la CI complète (11 §7).

RÈGLES DE MARCHE :
- **Une session = UN incrément** (11 §6). Avant chaque lot : UNIQUEMENT l'ordre de lecture du 00_INDEX + le brief du fichier 07.
- Pipeline **7 étapes sans raccourci** (09 §3, conception 1bis sur L2/L3/L5/L6) ; délègue aux sous-agents (équipe du lot + réviseur croisé + testeurs + gardien A02) ; **DoD transverse** cochée à chaque lot ; fil rouge `@filrouge` vert à chaque merge.
- **SAUVEGARDE CONTINUE (11 §9ter)** : commit + push toutes les ~2 h ou à chaque sous-tâche (`wip:` autorisé sur la branche du lot) ; `docs/ETAT.md` à chaque changement d'étape ; contexte qui se tend = fin de session PROPRE (ETAT.md + commit + push), jamais de session poussée à la limite.
- **Les portes P-A → P-E arrêtent tout** et attendent Williams (fichier de porte, 11 §9bis) ; porte échouée = procédure 09 §4bis.
- Un doute de spec = **DECISIONS.md, jamais une devinette** (précédence §32-36 > §24-31 > §16-22 > §1-15 ; le DDL vit exclusivement dans le fichier 04).
- Améliorations : **étage 1 d'office** (journalisé, plafonné 0,5 j/lot), **étage 2 = fiche AMELIORATIONS arbitrée par Williams** à la porte suivante — jamais implémentée avant (09 §5.9).

Commence maintenant. »
