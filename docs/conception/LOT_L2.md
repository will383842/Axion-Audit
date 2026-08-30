# LOT L2 — Auth, RBAC, étanchéité financière — note de conception (pipeline 09 §3, étape 1bis)

> **Auteur** : A20 (chef d'équipe du lot) · **À valider par** : A01 + gardien A02, **avant la première
> ligne de code**. · **Branche cible** : `lot/l2`.
> **Lu dans l'ordre imposé** : 11 (§1, §2, §3, §8) → 06 (§10.1, §10.2, §10.4) → 04 (`users`,
> `refresh_tokens`, `activity_log`, `scoping_financials`, §7.1) → 05 (§8.1, §9.7, §9.9, §31.3) →
> 03 (§34.1, §34.3, §34.4, §34.7). Périmètre et critères : **07, ligne L2** (2 j).
> **Cette note ne code rien.** Elle tranche ce qui, non tranché, serait deviné.

---

## 1. Découpage — 6 tâches, fichiers disjoints, une seule séquentielle

| # | Tâche | Fichiers (disjoints) | Agent | Dépend de |
|---|---|---|---|---|
| **T0** | **Câblage — seule tâche non parallélisable, elle passe SEULE et en premier** : ajout de `@fastify/jwt` (déjà nommé 11 §1, pas d'escalade — mais **absent du dépôt**, vérifié) · branches 401/403 dans le gestionnaire d'erreurs · ordre des crochets et bascule de la clé de quota | `apps/api/package.json`, `apps/api/src/erreurs.ts`, `apps/api/src/app.ts` | A13 | — |
| **T1** | **Socle d'autorisation** : union `PolitiqueAcces` typée, crochet `onRoute` de totalité, crochet d'identification, crochet d'autorisation, marque `ContexteAdmin`, frappe/vérification des jetons | `apps/api/src/auth/{politique,identite,jetons,contexte}.ts` | A14 | T0 |
| **T2** | **Routes d'auth** `login` / `refresh` / `logout` + dépôt `refresh_tokens` (rotation transactionnelle) | `apps/api/src/routes/auth.ts`, `apps/api/src/domaines/auth/*`, `packages/shared/src/auth.ts` | A14 | T1 |
| **T3** | **CRUD users** + `habilitated_at` (§34.4) + garde-fou de réinitialisation (§9.7) + **premier usage de la pagination keyset** | `apps/api/src/routes/users.ts`, `apps/api/src/domaines/users/*`, `packages/shared/src/users.ts` | A15 | contrat T1 (publié en stub dès J1) |
| **T4** | **`activity_log`** : une seule porte d'écriture, `meta` fermé par action | `apps/api/src/domaines/journal/*`, `packages/shared/src/journal.ts` | A13 | contrat T1 |
| **T5** | **Étanchéité financière** : dépôt unique + `GET /v1/scoping/:id/financials` (admin) | `apps/api/src/domaines/scoping/financiers.depot.ts`, `apps/api/src/routes/scoping.ts` | A14 | T1 |
| **T6** | **Tous les tests du lot** — écrits par un agent qui n'a produit aucun de ces fichiers (09 §5.6) | `apps/api/tests/l2-*.test.ts` | **A16** | contrats T1-T5 |

Revue croisée intégrale : **A17** (n'a rien produit). T2, T3, T4 et T5 tournent en parallèle après T1.

---

## 2. Les quatre arbitrages

### 2.1 Où vit la décision d'autorisation — **déclarée par route, vérifiée par le cadre, TOTALE au démarrage**

Un décorateur par route est opt-in : il échoue par omission. Une table centrale de chemins duplique
l'arbre de routage et dérive. Une fonction appelée dans chaque gestionnaire est invisible en revue.
**Arbitrage : la politique se déclare à côté de la route, mais sa PRÉSENCE est vérifiée
centralement — au démarrage, pas à la requête.**

```
config: { acces: { type: 'public' | 'authentifie' | 'roles' | 'mission' | 'proprietaire_session',
                   roles?: Role[], parametreMission?: string, financier?: true } }
```

- **`onRoute`** (crochet de Fastify appelé à l'enregistrement de CHAQUE route) : si `config.acces`
  est absent, il **lève**. Le processus ne démarre pas. Une route ajoutée demain sans annotation ne
  « passe » pas : **elle empêche l'API de booter**, et la suite d'intégration, qui construit l'app,
  vire au rouge. C'est la différence entre *improbable* et *impossible*.
- **`onRequest`, dans cet ordre exact** : ① *identification* (vérifie le jeton, ne refuse **jamais**,
  pose `request.utilisateur` ou rien) → ② *quota* (§3.2) → ③ *autorisation* (lit `config.acces`,
  lève un `AppError`). L'identification ne refuse pas, sinon un flot de jetons invalides court-
  circuite le quota et n'est plus borné.
- Type : fusion de déclaration sur `FastifyContextConfig`. **Aucun `any`**, aucune assertion.
- **La politique de route est nécessaire, jamais suffisante** : elle dit qui entre, pas ce que le SQL
  ramène. L'isolation « un consultant ne voit pas les missions d'autrui » est portée par le **dépôt**
  (jointure obligatoire sur `mission_users`), pas par le crochet. Deux garde-fous, deux natures.
- **Révocation instantanée** : 06 §10.1 exige des « comptes désactivables instantanément ». Un jeton
  de 15 min ne le permet pas. Le crochet ③ **relit `users` (PK, une lecture indexée) à chaque
  requête authentifiée** : `is_active`, `role`, `habilitated_at`. Le jeton porte l'identité, jamais
  les droits. Coût assumé, non mesuré (§6.4).

### 2.2 L'étanchéité financière — **une propriété du code, prouvée par balayage, pas une règle de route**

Une règle de route se contourne par une jointure : `scoping_financials.scoping_estimate_id` est PK
**et** FK, donc n'importe quel point d'entrée de cadrage est à une jointure de la fuite. Quatre
ceintures, dont trois ne dépendent d'aucune vigilance :

1. **Route** : `acces: { type: 'roles', roles: ['admin'], financier: true }`. Nécessaire, insuffisante.
2. **Type** : `scopingFinancials` n'est importé **que** par `financiers.depot.ts`. Chaque fonction de
   ce dépôt exige un argument `contexte: ContexteAdmin` — un type marqué (`unique symbol`) que seul
   le crochet d'autorisation sait produire, et seulement pour un rôle admin. **Un appelant consultant
   ne peut pas compiler la jointure.** Un booléen se passe `true` ; une marque, non.
3. **Architecture** : test qui parcourt les sources et exige que `scopingFinancials` /
   `'scoping_financials'` n'apparaissent que dans la liste blanche (schéma Drizzle, migration, ce
   dépôt, ses tests). Il attrape le SQL brut et le `as` que le type ne voit pas.
4. **La preuve, celle que demande le 07** : *balayage sentinelle*. On sème un cadrage dont
   `total_amount = 987654.21` et `daily_rates = {"sentinelle": 1234.56}`, puis on appelle **toutes
   les routes énumérées à l'exécution** (registre `onRoute`) avec un jeton consultant, analyste et
   lecteur, et on exige qu'aucun corps de réponse ne contienne les sentinelles. Ce test ne vérifie
   pas les routes auxquelles on a pensé : il vérifie **celles qui existent**. Une route ajoutée
   demain y entre d'elle-même. Marqué `@critique`.

### 2.3 Rotation et détection de réutilisation — **la « famille », faute de colonne, est l'utilisateur**

`refresh_tokens(id, user_id, token_hash, expires_at, revoked_at, device_label)` ne porte **aucune
lignée**. `device_label` est nullable, fourni par le client et non authentifié : y adosser une portée
de révocation serait pire que pas de portée. Modifier le 04 est une escalade (CLAUDE.md §3-2).

**Arbitrage tranché ici, et il ne vivra plus dans un commentaire de migration (`0009` l. 40) :
« révocation famille » = TOUS les jetons vivants de l'utilisateur.** Ce que ça coûte, dit en clair :
une réutilisation détectée sur un appareil **déconnecte la synchronisation de TOUS les appareils** de
cet auditeur. Le coût est borné et non destructeur (05 §31.3 : la saisie hors ligne continue, le
déverrouillage local dérive du mot de passe) — il faut une reconnexion pour resynchroniser.
→ **Fiche AMELIORATIONS étage 2** proposée avec cette note : `family_id` + `replaced_by_id` sur
`refresh_tokens` (arbitrage Williams à la porte ; jamais implémentée avant, 09 §5.9).

Mécanique retenue :

| Point | Décision | Raison |
|---|---|---|
| Jeton d'accès | JWT HS256, 15 min, `JWT_ACCESS_SECRET` | 11 §3 |
| Jeton de rafraîchissement | **opaque**, 256 bits aléatoires, jamais un JWT | la colonne s'appelle `token_hash` : un secret opaque se recherche par empreinte, un JWT invite à faire confiance à ses claims et donc à sauter la lecture en base — or **cette lecture EST la détection** |
| `token_hash` | HMAC-SHA256(poivre, jeton) — **pas Argon2id** | le jeton a 256 bits d'entropie : Argon2 n'y ajoute rien et rend la recherche impossible à indexer. Argon2id reste pour `password_hash` (entropie faible, sel par ligne) — deux problèmes, deux primitives |
| Rotation | `UPDATE … SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING *` puis INSERT (id `uuidv7`), **une transaction** | l'ancienne ligne SURVIT révoquée : sans elle, « jeton rejoué » et « jeton inconnu » deviennent indiscernables |
| Réutilisation | ligne trouvée avec `revoked_at` non nul → révocation de toute la famille + `activity_log` + `TOKEN_REUSE_DETECTED` (401) | 06 §10.1 |
| Jeton inconnu | `UNAUTHENTICATED` (401), sans dire s'il a existé | 06 §10.2 |
| `logout` | révoque **le seul** jeton présenté | ce n'est pas un incident |
| Compte désactivé | tous les jetons révoqués **et** §2.1 relit `is_active` | sinon la désactivation dure 15 min |
| Purge | lignes `expires_at < now() - 30 j` (job) | purger plus tôt aveugle la détection |

**Le point dur, et il n'est pas tranché par cette note (§6.1)** : deux rafraîchissements concurrents
avec le même jeton (onglet dupliqué, réponse HTTP perdue et rejouée) font passer le second pour une
réutilisation, donc **déconnectent tout, à tort**. Sans colonne de lignée on ne peut pas re-servir le
successeur. Option proposée : *fenêtre de grâce de 60 s* — un jeton révoqué par une rotation
**réussie** de moins de 60 s rend `TOKEN_EXPIRED` sans tuer la famille. C'est un affaiblissement
délibéré de §10.1 → **DECISIONS.md, décideur A01, AVANT la première ligne de T2**.

### 2.4 `activity_log` — deux journaux, deux régimes, et une seule porte d'écriture

| | `pino` (fichiers, exporté) | `activity_log` (Postgres) |
|---|---|---|
| Données personnelles | **interdites** (11 §2) | **autorisées et bornées** : `user_id`, `ip` — 06 §10.4 les nomme, avec rétention 12 mois et IP anonymisée à 90 j |
| `ip` | masquée (déjà dans la liste de redaction, `redaction.ts` l. 143) | **écrite** |

Le piège à nommer : c'est le **même objet**. Passer la ligne écrite en base à `request.log.info()`
« pour déboguer » fait sortir `ip` du régime légal vers les fichiers. **Règle : le dépôt du journal
ne journalise jamais sa propre charge utile** — au plus `{ action, entity_type, entity_id }`.

- **Une seule fonction d'écriture**, `journaliserActivite(action, …)`. `meta` est du JSONB : il
  accepte tout. Il est donc **validé par un schéma Zod fermé PAR ACTION** (`packages/shared`). Un sac
  libre est exactement le chemin par lequel une identité arrive dans une table d'audit huit mois plus
  tard.
- **Journalisé (L2)** : `auth.login.ok` · `auth.login.echec` (jamais l'e-mail tenté : un échec sur une
  adresse inconnue créerait une trace sur une non-personne) · `auth.reuse_detected` · `auth.logout` ·
  `user.create|update|role_change|deactivate` · `user.habilitate` (§34.4) · `user.password_reset`
  (+ `meta.forcage: true` quand le garde-fou §9.7 est outrepassé — journalisation **et** alerte
  exigées) · `rbac.refus` sur les seules routes admin et financières · `financier.consultation`
  (qui a vu l'argent : c'est ce qui justifie la table auprès des achats grands comptes, 06 §10.5).
- **Jamais journalisé** : mots de passe, empreintes, jetons · e-mails, `person_name`, contenus de
  réponse et de note · **les valeurs financières** (`total_amount`, `daily_rates`) — on trace la
  consultation, jamais le montant · les rotations de routine (~96/j/appareil : elles noieraient la
  table sans rien prouver ; seule l'anomalie mérite une ligne).

---

## 3. Les trois contraintes mesurées — ce que L2 en fait

**3.1 Secrets non cloisonnés** (le fichier d'environnement entier est injecté dans tous les
conteneurs). Conséquence de conception, à écrire pour qu'on ne s'illusionne pas : `JWT_ACCESS_SECRET`
est lisible par le worker. **Aucun droit de cette conception ne repose sur « seule l'API connaît le
secret »** : c'est pourquoi §2.1 relit `users` (un jeton forgé pour un compte désactivé échoue quand
même) et pourquoi le worker ne frappe **jamais** de jeton d'utilisateur. Le cloisonnement est une
décision d'infra, donc une escalade — pas un chantier L2.

**3.2 Le quota est indexé sur l'IP ; le contrat dit « par jeton ».** T0 bascule
`keyGenerator: (r) => r.utilisateur?.id ?? r.ip`, ce qui **impose** l'ordre de crochets du §2.1 : la
clé doit venir d'un jeton **vérifié** — un `sub` non vérifié laisserait forger un quota illimité. Le
quota `/v1/auth/*` reste 10 req/min/**IP** (11 §3). Si on l'oublie, une équipe derrière le NAT du
client partage 300 req/min et la sync d'un auditeur étrangle celle de son collègue. **Rien ne le
rappellera — sauf le test qui suit, et c'est son unique raison d'être** : 301 requêtes, deux jetons
distincts, **une seule IP** → aucun refus ; 301 requêtes, un seul jeton, deux IP → refus.

**3.3 Le gestionnaire d'erreurs écrase tout 4xx inconnu en 400** (`erreurs.ts`, branche 5). Les 401 et
`FST_JWT_*` sortiraient donc en `400 INVALID_PAYLOAD` : le front ne peut plus distinguer « reconnecte-
toi » de « requête malformée », et le critère « → `forbidden` » devient infalsifiable. **Deux
correctifs, pas un** : (a) le crochet d'identification convertit lui-même les erreurs de la
bibliothèque en `AppError` (`TOKEN_EXPIRED` / `UNAUTHENTICATED`) ; (b) `erreurs.ts` gagne deux
branches `401 → UNAUTHENTICATED` et `403 → FORBIDDEN` **avant** la branche 5 — sans quoi le piège
reste armé pour le prochain greffon. `erreurs.ts` est un fichier L0 : **T0 le touche seul**, en un
commit relu par A17, et aucune autre tâche n'y revient.

---

## 4. Points durs que le fichier 07 ne nomme pas

1. **« Push sur la session d'autrui → `forbidden` » n'est pas prouvable en L2** : aucune route
   n'écrit sur `interviews`/`answers` avant L6a (`PATCH /v1/answers/:id` et `reassign` sont L3).
   **On ne fabriquera pas une route de test pour cocher un critère** — ce serait du code orphelin,
   refusé à l'étape 6. L2 livre la règle §9.9 comme **fonction pure testée + politique
   `proprietaire_session` déclarée**, prouvée sur des lignes réelles en intégration ; la preuve HTTP
   de bout en bout est **explicitement reportée à L6a et écrite comme telle dans le fichier de
   porte**. À arbitrer par A02/A01 (§6.3).
2. **Le chemin console (cookies httpOnly + en-tête anti-CSRF, 11 §3) exige `@fastify/cookie`, qui
   n'est PAS dans la liste 11 §1** → escalade. Or `apps/hq` est vide (un `vite.config.ts`) : rien ne
   casse à différer. **Proposition : L2 livre le chemin Bearer (terrain) ; le chemin cookie devient
   L2b, conditionné à l'escalade.** À défaut d'être tranché, un agent inventera la dépendance.
3. **Pas d'index sur `refresh_tokens.token_hash`** (le §7.1 n'en prévoit pas) : la recherche par
   empreinte est un balayage. Négligeable au volume Phase 1, à proposer — **pas à ajouter** (le
   `schema:diff` virerait au rouge, et c'est le 04 qui commande).
4. **Les jobs de purge RGPD d'`activity_log`** (12 mois ; IP anonymisée à 90 j, IPv4 /24, IPv6 /48)
   sont exigés par 06 §10.4 et **absents du brief L2**. L2 crée la colonne qui porte l'obligation :
   livrer l'une sans l'autre est une dette de conformité. → fiche, arbitrage à la porte (§6.2).
5. **`packages/shared/src/pagination.ts` n'est importé nulle part** : T3 (`GET /v1/users`) en est le
   **premier consommateur réel**. Curseur documenté par route : `users` → `(created_at, id)`.
6. **Les deux routes existantes n'ont pas de schéma Zod in/out** (11 §3 l'exige). Ce précédent ne se
   reproduit pas : **aucune route L2 n'est acceptée sans ses deux schémas** importés de
   `packages/shared` — c'est un point de revue croisée explicite d'A17.

---

## 5. Plan de tests — quatre méta-tests avant les tests de fonctionnalités

Les quatre premiers testent **le garde-fou**, pas la fonctionnalité. C'est ce qui sépare un garde-fou
d'une annonce.

| Test | Niveau | Ce qu'il rend impossible |
|---|---|---|
| **Totalité** : enregistrer une route sans `config.acces` dans une instance construite par la fabrique de l'app → **doit lever** | unité | Une route sans politique, demain, dans n'importe quel lot |
| **Instantané des routes publiques** : l'ensemble des routes `public` est **exactement** la liste commitée (`/v1/health`, `/v1/health/ready`, `/v1/auth/login`, `/v1/auth/refresh`) | unité | Ouvrir une route au public par inadvertance |
| **Balayage sentinelle financier** (§2.2-4) `@critique` | intégration | Une jointure financière atteignable par un non-admin |
| **Pureté d'`activity_log`** : après un scénario complet, aucune ligne ne contient e-mail, nom, jeton ni montant (lecture de **toute** la table, recherche de sentinelles) | intégration | Une donnée personnelle qui entre par `meta` |
| **Matrice rôle × route** : produit cartésien des routes **énumérées à l'exécution** × {anonyme, consultant, analyste, lecteur, admin, lead}, attendus **commités** | intégration | Une route non couverte : l'ajouter oblige à mettre à jour la matrice |
| Rotation & réutilisation : 8 branches du tableau §2.3 | intégration | — |
| Isolation : un consultant ne lit ni les missions ni les utilisateurs d'autrui | intégration | — |
| ~~Habilitation : affectation `mission_users` refusée si `habilitated_at IS NULL` (§34.4)~~ **DÉPLACÉ EN L3d le 2026-08-31** — la route qui affecte n'existe pas en L2, et la note L3 dit elle-même que la garde est « appelée par la route `assignments` de L3 ». L2 se donnait un critère **qu'il ne pouvait pas exécuter** : la porte P-B aurait coché une case dont la preuve ne peut pas exister. Ce que L2 livre et qui reste testable : **la LECTURE** de `habilitated_at` à chaque requête. Voir `DECISIONS.md`. | — | déplacé |
| Garde-fou §9.7 : réinitialisation refusée si le dernier `sync_log.outbox_remaining > 0` **ou si aucune sync n'est connue** ; forçage explicite → journal + alerte | intégration | — |
| Quota par jeton (§3.2), dans les deux sens | intégration | La régression silencieuse vers l'IP |
| Aucune erreur d'auth ne sort en 400 (assertion portée par la matrice) | intégration | La rechute de la branche 5 |

**TDD obligatoire** (09 §3-2) sur T1, T2 et T5 : tests d'A16 écrits **avant** le code d'A14.
**Couverture ≥ 90 % mesurée** sur `apps/api/src/auth/**` et `apps/api/src/domaines/{auth,users,scoping,journal}/**`.
Harnais existant réutilisé : `apps/api/tests/aide/base-l1.ts` (Testcontainers). Aucun E2E n'est dû par
L2 (aucun front) ; `@filrouge` doit rester vert.

---

## 6. Ce dont je ne suis pas sûr — à trancher AVANT le code

1. **La fenêtre de grâce de 60 s (§2.3)** touche à la sécurité autrement que le pack ne la spécifie
   (CLAUDE.md §3-4). Je la crois nécessaire — sans elle, une réponse HTTP perdue déconnecte un
   auditeur de tous ses appareils, en pleine mission — mais **je ne sais pas** si Williams préfère
   ce faux positif à l'affaiblissement. **DECISIONS.md, décideur A01.**
2. **Les jobs de purge RGPD (§4.4) appartiennent-ils à L2 ?** Le 07 dit non, le 06 §10.4 les exige.
   ~0,2 j. Étage 2 par prudence → arbitrage à la porte.
3. **Le critère « push sur la session d'autrui » peut-il être coché sans route de push (§4.1) ?**
   C'est au gardien A02 de dire si un report tracé vaut acceptation, ou si le critère descend en L6a.
4. **La relecture de `users` à chaque requête (§2.1) n'est pas mesurée.** Je la crois négligeable au
   volume Phase 1 (une lecture par PK), et elle est la seule façon de tenir « désactivable
   instantanément ». Aucune charge k6 n'existe avant L6c : c'est une conviction, pas une mesure. Si
   elle coûte, le remède est un cache Redis court — **pas** un jeton auto-suffisant.
5. **Le poivre de `token_hash`** : réutiliser `JWT_REFRESH_SECRET` pour un usage non-JWT est
   légèrement impur ; une variable dédiée serait plus propre mais touche `.env.example`. Sans
   préférence forte — A01 tranche en une ligne.
6. **Le rôle `lead` n'est pas un rôle de `users`** : c'est `mission_users.role_on_mission`. La
   politique `mission` doit donc croiser deux sources (rôle global **et** rôle sur la mission), et
   §34.3 borne les pouvoirs du lead à SA mission. Je crois la lecture juste ; elle mérite une
   confirmation d'A02 avant que T1 ne fige le type.
7. **Chef d'équipe** : le 09 §1 nomme A20 « chef d'équipe front » et A10 « chef d'équipe backend » ;
   L2 est un lot backend. J'ai réparti les tâches sur l'équipe backend (A13-A17). Si la chaîne de
   signature doit passer par A10, c'est à corriger avant l'étape 4.
