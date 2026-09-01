# VERDICT DE SÉCURITÉ — A51, chantier C3

> **Auditeur** : A51 (sécurité offensive) · **Rend compte à** : A50 → A01 → Williams
> **Date** : 2026-08-31 (UTC) · **Objet audité** : `main` à `62193b8`
> **Périmètre** : L0 (infra, CI, sauvegardes) · L1 (schéma) · L2 (auth JWT, RBAC, étanchéité
> financière, CRUD users, `activity_log`) · L4 (import banque) · `packages/ui`
> **Branche de travail** : `securite/verdict-a51` (worktree dédié, non poussée, non fusionnée)
> **Mode** : lecture seule. Aucun fichier de code, de test ou de configuration n'a été modifié.
> Aucun conteneur n'a été démarré.

---

## 0. VERDICT GLOBAL

**CONFORME SOUS RÉSERVE.** Aucun défaut CRITIQUE, aucun chemin d'exploitation ouvert sur le
périmètre livré. Le socle d'authentification et d'autorisation est, mesure faite, d'une qualité
inhabituelle : la redaction RGPD **fonctionne réellement** (prouvée par sonde, 19 cas), l'étanchéité
financière tient par cinq ceintures dont trois sont mécaniques, et le refus de démarrer sans
politique d'accès n'est pas une promesse mais un `throw`.

Ce que je remonte tient en une phrase : **les défauts ne sont pas dans ce qui a été construit, ils
sont dans trois endroits où un garde-fou annonce une propriété que rien ne vérifie.**

| Sévérité      | Nombre | Objets                                                                       |
| ------------- | ------ | ---------------------------------------------------------------------------- |
| **CRITIQUE**  | 0      | —                                                                            |
| **MAJEUR**    | 3      | F-01 redaction contournée par `toJSON` · F-02 validateur des secrets JWT · F-03 `npm audit` absent de la CI (1 avis HAUT non vu) |
| **MINEUR**    | 7      | F-04 à F-10                                                                  |
| **CONFORME**  | 21     | §1 à §6 ci-dessous                                                           |
| **NON VÉRIFIÉ** | 5    | §9                                                                           |

---

## 1. AUTHENTIFICATION ET JETONS (05 §8.1, 06 §10.1, `CLAUDE.md` §9)

### 1.1 Algorithme de signature et `alg: none` — **CONFORME**

**Mesure** — `apps/api/src/auth/jetons.ts:103-118` :

```
sign:   { algorithm: 'HS256', expiresIn: config.JWT_ACCESS_TTL }
verify: { algorithms: ['HS256'], requiredClaims: ['sub', 'exp'] }
```

La liste blanche `algorithms: ['HS256']` est explicite : le vérificateur n'accepte jamais
l'algorithme **annoncé par le jeton**, ce qui ferme la confusion d'algorithme et `alg: none`.
`requiredClaims` refuse un jeton sans `exp` (éternel) ou sans `sub` (anonyme) **avant** Zod. Une
seconde passe Zod (`chargeUtileJetonAccesSchema`, `sub: z.uuid()`) refuse un `sub` authentique mais
absurde.

Le jeton ne porte **ni rôle ni `is_active`** : les droits sont relus en base à chaque requête
(`politique.ts:162`), ce qui rend la désactivation de compte instantanée (06 §10.1) au lieu de
l'être avec un quart d'heure de retard.

### 1.2 Durées de vie — **CONFORME**

**Mesure** — `.env.example:98-99` → `JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=30d`. Aucun littéral en
dur. `analyserDureeMs` (`jetons-rafraichissement.ts:90-117`) **lève au chargement du module** sur une
durée illisible plutôt que de retomber sur un défaut : une durée de session mal orthographiée
empêche le processus de démarrer.

### 1.3 Rotation, rejeu et révocation de famille — **CONFORME**

**Mesure** — chaîne complète relue dans `domaines/auth/{service.ts,depot.ts,jetons-rafraichissement.ts}`.

- Le jeton de rafraîchissement est **opaque** : `randomBytes(32)` en base64url, jamais un JWT
  (`jetons-rafraichissement.ts:48-50`). Le choix est motivé et il est bon : un JWT autoporteur
  inviterait à sauter la lecture en base, **or cette lecture EST la détection de réutilisation**.
- Stockage par **HMAC-SHA256 poivré** (`JWT_REFRESH_SECRET`), déterministe donc indexable
  (`empreinteJetonRafraichissement`, ligne 61-63). Argon2id écarté avec une raison juste : 256 bits
  d'entropie n'ont pas de dictionnaire à ralentir.
- La rotation lit **`SELECT … FOR UPDATE`** (`depot.ts:151-168`) : deux rotations concurrentes se
  sérialisent. C'est la moitié de la détection.
- Révocation **puis** insertion **dans la même transaction** (`service.ts:313-317`).

**Ce qui se passe exactement quand un refresh est rejoué** (`service.ts:244-354`) :

| Cas                                        | Effet en base                          | Réponse HTTP                       |
| ------------------------------------------ | -------------------------------------- | ---------------------------------- |
| empreinte inconnue                         | rien                                   | `401 UNAUTHENTICATED` (aucun oracle) |
| jeton vivant mais périmé                   | révoqué au passage                     | `401 TOKEN_EXPIRED`                |
| jeton révoqué **il y a ≤ 60 s**            | rien                                   | `401 TOKEN_EXPIRED`                |
| jeton révoqué **il y a > 60 s** (rejeu)    | **famille révoquée**                   | `401 TOKEN_REUSE_DETECTED`         |
| succès, mais compte devenu inactif         | famille révoquée (jeton neuf compris)  | `401 UNAUTHENTICATED`              |

« Révocation de famille » est ici **tous les jetons vivants de l'utilisateur** :
`depot.ts:216-228`, `UPDATE refresh_tokens SET revoked_at WHERE user_id = $1 AND revoked_at IS NULL`.
Le verdict est **rendu hors transaction** (type `ResultatRotation`) pour que la révocation soit
VALIDÉE avant que l'erreur soit levée — une détection dont l'effet serait annulé par son propre
`throw` ne protégerait personne. Le point est explicitement traité en tête de fichier ; il est juste.

La détection est **doublement tracée** : `journal.warn` (pino, sans jeton ni empreinte ni adresse) et
`activity_log` `auth.reuse_detected` avec le décompte.

### 1.4 Fenêtre de grâce de 60 s — **CONFORME (risque accepté, tracé)** · réserve **F-04, MINEUR**

`FENETRE_GRACE_ROTATION_MS = 60_000` (`jetons.ts:94`). C'est un affaiblissement **délibéré** de
06 §10.1 : pendant 60 s, un jeton réellement volé peut être présenté une fois sans être détecté. Il
est arbitré (A01, 2026-08-29), son coût est écrit sans être adouci, et sa disparition est conditionnée
à la colonne `replaced_by` (escalade fichier 04).

**F-04 — MINEUR.** Le réexamen est daté (« porte L6a, au plus tard le 2026-11-29 ») mais **aucun
mécanisme ne le porte** : aucun test ne rougit à cette date, aucune entrée de `DECISIONS.md` n'ouvre
d'échéance. C'est un pansement daté dont la date ne vit que dans un commentaire.
*Mesure* : `grep -rn "2026-11-29" apps packages scripts .github` → une seule occurrence, le
commentaire lui-même.

### 1.5 Refresh chiffré dans Dexie (terrain) — **NON IMPLÉMENTÉ, hors périmètre** · **F-05, MINEUR**

**Mesure** : `wc -l apps/field/src/*.tsx` → `App.tsx` 50 lignes, `main.tsx` 19 lignes.
`grep -rniE "\bDEK\b|\bKEK\b|AES-GCM|dexie" apps/field/src` → **0 occurrence** (seule mention : un
commentaire de `vite.config.ts` qui annonce le périmètre L5).

L'application terrain est une coquille buildable. Ni Dexie, ni DEK/KEK, ni verrouillage, ni export de
secours. C'est cohérent avec le périmètre livré (L5 non ouvert), mais la moitié « terrain » de
`CLAUDE.md` §9 n'existe pas.

### 1.6 Cookies httpOnly + anti-CSRF (console) — **NON IMPLÉMENTÉ, tracé** · **F-06, MINEUR**

**Mesure** :

- `grep -rn "@fastify/cookie" apps packages package.json` → présent **uniquement** dans
  `apps/api/package.json:21` (`"@fastify/cookie": "11.1.2"`, épinglé) et dans `pnpm-lock.yaml`.
- `grep -n "cookie" apps/api/src/app.ts` → **aucune occurrence** : le greffon n'est **jamais
  enregistré**.
- `apps/api/src/domaines/auth/routes.ts:140-149` : `versReponse` rend `accessToken` **et**
  `refreshToken` dans le **corps JSON**, pour les deux fronts indifféremment.

La décision est tracée (`DECISIONS.md`, 2026-08-31, « `@fastify/cookie` entre dans la liste
épinglée » : la bascule est **L2b**, T3 est livré en Bearer). Ce n'est donc pas une violation, c'est
une dette datée. **Ce qu'il faut écrire tel quel : à `62193b8`, la seule authentification qui existe
est Bearer, pour la console comme pour le terrain, et il n'y a aucun en-tête anti-CSRF.** La porte
P-B ne peut pas cocher « console = cookies httpOnly SameSite=Lax + anti-CSRF ».

---

## 2. MOTS DE PASSE (06 §10.1, 05 §9.7)

### 2.1 Paramètres Argon2id réels — **CONFORME**

**Mesure** — `apps/api/src/domaines/auth/mots-de-passe.ts:37-42` :

```
PARAMETRES_ARGON2ID = { parallelism: 1, iterations: 3, memorySize: 19456, hashLength: 32 }
```

soit **m = 19 456 KiB (19 MiB), t = 3, p = 1**, sel de 16 octets tiré par ligne
(`domaines/users/mots-de-passe.ts:32,93`), sortie PHC `outputType: 'encoded'`.

**Confrontation au 06, et non à l'usage courant** : 06 §10.1 dit « Hachage Argon2id » et **ne fixe
aucun paramètre**. Il n'y a donc rien à contredire — la conformité est littérale. Ces valeurs
dépassent par ailleurs le profil OWASP `m=19 MiB, t≥2, p=1` sur le nombre de passes.

Deux propriétés que je relève parce qu'elles sont rares :
- les paramètres sont **importés** par le module qui frappe depuis le module qui vérifie
  (`users/mots-de-passe.ts:24`), jamais recopiés — une empreinte frappée plus faible que le reste du
  produit serait indétectable, le format PHC transportant ses propres paramètres ;
- le PHC rend un durcissement futur non destructif (les empreintes existantes se vérifient avec les
  leurs).

### 2.2 Politique de longueur — **CONFORME**

`packages/shared/src/users.ts:99` → `MOT_DE_PASSE_LONGUEUR_MIN = 12` (06 §10.1 : « 12+ caractères »).
Le mot de passe **engendré** fait 20 signes sur un alphabet de 32 sans caractères ambigus
(`users/mots-de-passe.ts:51,59`) = **100 bits d'entropie**, tiré par `randomInt` (rejet, pas de
modulo).

### 2.3 Le hash sort-il d'une API ? — **NON. CONFORME.**

**Mesure** — `grep -rn "passwordHash|password_hash" apps/api/src packages/shared/src` :

- `apps/api/src/db/schema.ts:313` — la colonne ;
- `apps/api/src/domaines/auth/depot.ts:71` — **seul** SELECT qui la charge, pour la connexion ;
- `apps/api/src/domaines/users/depot.ts:296,422` — écriture seule (création, réinitialisation) ;
- `packages/shared/src/journal.ts:238` et `redaction.ts:201,296` — listes de masquage.

Trois ceintures : le dépôt `users` ne la SELECT jamais ; `versReponse` (`routes/users.ts:87-100`)
projette **explicitement** champ par champ, jamais un `...ligne` ; `userResponseSchema` est un
`strictObject` sans `passwordHash`, et il est appliqué **en sortie** (`response: { 200: … }`).

### 2.4 Garde-fou §9.7 de la réinitialisation — **CONFORME, non contournable**

**Mesure** — `apps/api/src/domaines/users/service.ts:427-495` :

```ts
const etats = await lireDerniersEtatsDeSync(tx, cibleId);
const risque = etats.length === 0 || etats.some((etat) => (etat.outboxRemaining ?? 0) > 0);
if (risque && !force) throw new AppError('UNSYNCED_DATA_AT_RISK', …);   // 409
```

C'est **exactement** la donnée définie par 05 §9.7 V2.9 : « dernier `sync_log.outbox_remaining` > 0
**ou aucune sync connue de l'appareil** ». Les deux branches sont là, y compris la seconde, qui est
celle qu'on oublie.

Le seul contournement est `force: true`, qui **est** la « confirmation explicite “perte locale
possible” » du §9.7. Il vaut `false` par défaut (`passwordResetRequestSchema`, `users.ts:249-253`,
`.default({ force: false })` sur l'objet **et** sur le champ : un corps absent ne force pas). Le
forçage produit deux traces : `contexte.journal.warn` nommé et `activity_log user.password_reset
{ forcage: true }`. La famille de jetons est révoquée dans la même transaction.

**Réserve F-07, MINEUR.** L'« alerte » du §9.7 est une ligne pino `warn`. Le fichier le dit et le
justifie (la table `alerts` a `mission_id NOT NULL`, une réinitialisation n'appartient à aucune
mission — amender le 04 serait une escalade). **Mais** la fiche AMELIORATIONS du 2026-08-29
(« L'OBSERVABILITÉ (02 §11.3) N'EXISTE PAS ») établit qu'aucun outil ne collecte ces journaux :
**cette alerte n'a aujourd'hui aucun destinataire.** Le garde-fou refuse correctement ; son alerte
tombe dans le vide. Les deux constats sont vrais séparément et personne ne les a chaînés.

---

## 3. RBAC ET ÉTANCHÉITÉ FINANCIÈRE (invariant 3, E21)

### 3.1 Le socle refuse-t-il de démarrer sans politique ? — **OUI, trois fois. CONFORME.**

**Mesure** — `apps/api/src/auth/politique.ts` :

| Trou possible                                     | Ce qui le ferme                                             | Ligne     |
| ------------------------------------------------- | ----------------------------------------------------------- | --------- |
| route enregistrée **avant** le socle              | `printRoutes() !== '(empty tree)'` → `throw` au démarrage    | 317-324   |
| route sans `config.acces`                         | `onRoute` → `throw` nommant la route                         | 339-349   |
| route enregistrée **entre** les deux `onRoute`    | `onReady` → `fait(new Error(…))`, démarrage refusé           | 374-387   |
| `acces.type` hors de l'union (venu d'un `.mjs`)   | branche `default` avec `never` **et** `throw FORBIDDEN`      | 206-229   |
| paramètre d'URL nommé mais absent                 | `exigerParametre` → `throw`                                  | 266-278   |

La branche `default` mérite d'être signalée : sans elle, un `type` inconnu ne correspondait à aucun
`case`, la fonction se terminait normalement et **la requête passait**. La garantie de compilation
(`never`) et la garantie d'exécution (`throw`) sont toutes deux présentes — c'est la bonne réponse,
et c'est rare.

### 3.2 `financier: true` peut-il être porté par une route ouverte à un non-admin ? — **OUI. F-08, MINEUR.**

**Mesure** — `politique.ts:63-72` :

```ts
export interface AccesRoles {
  readonly type: 'roles';
  readonly roles: readonly RoleUtilisateur[];
  readonly financier?: true;
}
```

Rien, **ni dans le type ni dans le `onRoute`**, n'interdit
`{ type: 'roles', roles: ['consultant'], financier: true }`. L'API démarre. Le banc d'essai des tests
(`tests/l2-crochets.integration.test.ts`, route `/essai/financier`) **exploite délibérément** cette
liberté, ce qui prouve qu'elle existe.

**Le défaut échoue fermé, et il faut le dire :** `creerContexteAdmin` rend `null` pour tout rôle
non-`admin` (`contexte.ts:51-57`), le dépôt financier exige un `ContexteAdmin` **non nullable** donc
ne compile pas chez un appelant qui n'a que `null`, et le balayage sentinelle signale toute route
`financier: true` atteinte sans refus. Trois filets.

**Pourquoi je le remonte quand même** : la doctrine de ce socle est « ça ne se surveille pas, ça
refuse de démarrer ». Ici, la cohérence `financier ⇒ roles == ['admin']` est la seule propriété du
socle qui repose sur un **test** au lieu d'un refus de boot. Un `onRoute` de trois lignes la
rendrait impossible.

### 3.3 Le chemin de fuite que le balayage sentinelle ne verrait pas — **F-09, MINEUR (aujourd'hui)**

J'ai cherché l'oracle demandé sur les trois surfaces, et **je ne l'ai pas trouvé** — le dépôt est
propre là-dessus, et il faut le dire avant de dire le reste :

| Surface                          | Ce qui distinguerait « existe » de « n'existe pas »              | Constat mesuré |
| -------------------------------- | ---------------------------------------------------------------- | -------------- |
| `POST /v1/auth/login`            | code / message / temps                                            | **une seule** branche pour « mot de passe faux » et « compte désactivé » (`service.ts:163`) ; Argon2id consommé **aussi** pour un compte inconnu (empreinte-leurre) ; leurre **préchauffé au démarrage** — le rapport de temps mesuré 450 ms / 203 ms était l'oracle, il est fermé |
| `POST /v1/auth/refresh`          | « ce jeton a existé un jour »                                     | `inconnu` rend `UNAUTHENTICATED`, jamais `TOKEN_EXPIRED` (`service.ts:321-324`) |
| `GET /v1/scoping/:id/financials` | « ce cadrage existe mais n'a pas de volet financier »             | même `404` pour les deux (`routes/scoping.ts:98-104`) |
| `POST /v1/auth/logout`           | « ce jeton appartient à quelqu'un d'autre »                       | propriété **dans le `WHERE`** (`depot.ts:240`), donc aucun chemin de code ne connaît l'existence d'un jeton d'autrui |
| en-têtes                         | fuite par `x-total`, `location`…                                  | le balayage inspecte `JSON.stringify(reponse.headers)` (`sentinelle-financiere.ts:293`) |
| `activity_log`                   | seconde copie non surveillée d'un montant                         | test dédié qui cherche les sentinelles **dans la table** (`l2-crochets…:1030-1037`) ; le catalogue `financier.consultation` n'a **aucun champ de montant** |

**Ce que le balayage ne voit pas, en revanche, et qui n'est écrit nulle part.** Son en-tête énumère
honnêtement quatre angles morts (valeur tronquée, arrondie, encodée, recalculée). Il en manque deux,
structurels :

1. **Aucune chaîne de requête n'est jamais exercée.** `substituer()`
   (`sentinelle-financiere.ts:213-232`) ne substitue que les segments `:parametre` du **chemin**.
   L'injection part avec l'URL nue. Une fuite conditionnée à un paramètre de requête —
   `?include=financials`, `?sort=total_amount`, `?fields=`, un futur `?expand=` — serait **invisible**,
   et le rapport la classerait `exerce` (2xx, corps lu, aucune sentinelle) : **vert, et vert par
   construction.** Le balayage n'appelle même jamais `GET /v1/users?limit=&after=`, dont la
   pagination keyset est pourtant la seule chaîne de requête du produit.
2. **Un seul appel sans état par (route, méthode, porteur).** Une fuite qui n'apparaît qu'après une
   écriture, ou à la deuxième page, n'est pas atteignable.

**Sévérité aujourd'hui : MINEUR.** Aucune route financière du produit ne lit de chaîne de requête, et
la ceinture 3 (`etancheite-sources`) garantit qu'un seul fichier nomme la table. **Sévérité à L7/L8**
(agrégation, tableau de bord, simulateur — tous paramétrés par requête) : **MAJEUR**, et le balayage
restera vert. La parade est une ligne dans `OptionsBalayage` : une table
`chainesDeRequete: Record<gabarit, string[]>` avec la même règle que `valeursDeParametre` — un
gabarit non cartographié est **remonté comme anomalie**, jamais ignoré.

---

## 4. JOURNALISATION — « une redaction configurée n'est pas une redaction prouvée »

### 4.1 Comment je l'ai vérifiée

Je n'ai pas relu la configuration : je l'ai **exécutée**. Sonde jetable (supprimée après mesure),
`apps/api`, pino 9.14.0, options **réelles** `OPTIONS_REDACTION_JOURNAL` importées de
`@axion/shared`, sortie capturée dans un `Writable`. 19 cas hostiles.

### 4.2 Ce qui tient — **CONFORME, et c'est mesuré**

| Cas injecté                                                     | Ligne produite                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `{ email: 'jean.dupont@client.fr' }`                             | `"email":"[masqué:rgpd]"`                                             |
| `{a:{b:{c:{d:{person_name:'Sophie Bernard'}}}}}` (profondeur 5)   | `"person_name":"[masqué:rgpd]"`                                       |
| `msg` = « echec pour jean.dupont@client.fr »                     | `"msg":"echec pour [masqué]"`                                         |
| `msg` = « jwt malformed: eyJ… » (jeton **nu**)                   | `"msg":"jwt malformed: [masqué]"`                                     |
| `err.detail` = `Key (email)=(jean.dupont@client.fr) already exists.` | `"detail":"Key (email)=([masqué]) already exists."`                |
| `err.detail` = `Failing row contains (4, 12, Sophie Bernard, …)` | `"detail":"Failing row contains ([masqué])."`                         |
| chaîne sensible sous une **clé racine inconnue**                 | `"trucInconnu":"contactez [masqué]"`                                  |
| objet `{person_name}` sous une **clé racine inconnue**           | `"trucInconnu":{"person_name":"[masqué:rgpd]"}`                       |
| `{ req: { body: { email, password } } }`                         | `"req":{"body":"[masqué:rgpd]"}`                                      |
| `req.url = '/v1/users?email=a@b.fr'` + `remoteAddress`           | `"url":"/v1/users?email=[masqué]"`, `"remoteAddress":"[masqué:rgpd]"` |
| **bindings d'un `log.child({person_name, email})`**              | masqués tous les deux                                                 |
| interpolation `log.info('… pour %s', 'jean@…')`                  | masquée après formatage                                               |
| tableau racine, profondeur > 8, `password` engendré              | masqués (`[masqué:profondeur]` au-delà de 8)                          |

C'est le contraire du défaut recherché : la couverture est réelle, y compris sur les deux cas où je
m'attendais à un trou (bindings d'enfant, interpolation `printf`).

### 4.3 **F-01 — MAJEUR — tout objet porteur d'un `toJSON()` échappe INTÉGRALEMENT à la redaction**

**Mesure** (sortie brute de la sonde) :

```
{"cible":"https://axion/v1/users?email=jean.dupont@client.fr&token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig","msg":"URL"}
{"morceau":{"type":"Buffer","data":[112,101,114,115,111,110,95,110,97,109,101,61,83,111,112,104,105,101,32,66,101,114,110,97,114,100]},"msg":"Buffer"}
```

- `new URL('…?email=…&token=eyJ…')` sort **en clair**, adresse **et** jeton compris — alors que
  `nettoyerTexteJournal` nettoie précisément ces deux motifs quand l'URL est une chaîne.
- `Buffer.from('person_name=Sophie Bernard')` sort **octet par octet**, donc en clair.

**La cause** (`packages/shared/src/redaction.ts:692-747`) : `parcourir` itère
`Object.entries(valeur)`. Une `URL` et un `Buffer` ne portent pas leurs données en propriétés propres
énumérables ; aucune clé n'est masquée, `modifie` reste `false`, et la fonction rend **la même
référence**. C'est ensuite `JSON.stringify` de pino qui appelle `toJSON()` — **après** la censure, sur
un objet que la censure a laissé intact. Le résultat n'est jamais repassé par `nettoyerTexteJournal`.

**Pourquoi c'est exactement la famille traquée.** L'en-tête du fichier affirme : *« toute chaîne
journalisée est nettoyée de ses e-mails, jetons porteurs, numéros de téléphone et paramètres de
requête sensibles, `req.url` et `err.message` compris »*. La section « CE QUE CETTE POLITIQUE NE
COUVRE PAS » énumère quatre angles morts — celui-ci n'y est pas. Et le code montre que l'auteur a
**vu la famille sans voir le cas général** : `parcourir` exempte explicitement `Date` et `RegExp`
(ligne 700), qui sont deux membres de cette même famille.

**Ce qui ne l'aurait pas vu :**
- les **29 tests** de `apps/api/src/redaction-journal.test.ts` : aucun ne construit une `URL`, un
  `Buffer`, ni un objet à `toJSON` (`grep -n "toJSON|Buffer|URL(" …` → 0) ;
- le balayage sentinelle : il lit des réponses HTTP, jamais un journal ;
- la CI : aucun job n'inspecte une ligne de journal ;
- `gitleaks`, `helmet`, `axe` : hors sujet.

**Exploitabilité aujourd'hui : nulle.** `grep -rn "new URL(|Buffer.from(" apps/api/src apps/worker/src`
ne trouve aucun appel journalisé. **Exploitabilité à L6c :** le protocole de chunks (§9.6) manipule
des `Buffer` de pièces jointes ; un `log.debug({ morceau })` de diagnostic déverserait le contenu
d'une photo ou d'un verbatim audio dans le journal d'exploitation.

**Correctif proposé (5 lignes, aucun impact schéma/API, étage 1)** — dans `parcourir`, avant le
parcours des entrées :

```ts
if (typeof (valeur as { toJSON?: unknown }).toJSON === 'function') {
  return parcourir((valeur as { toJSON(): unknown }).toJSON(), parentNormalise, profondeur + 1, vus);
}
```
placé **après** l'exemption `Date`/`RegExp`, qui reste nécessaire (leur `toJSON` est légitime).
Preuve exigible : la sonde ci-dessus rejouée en test, **d'abord rouge sur la version actuelle**
(règle §5-3 de `ORGANISATION_AGENTS.md` : on prouve par bascule).

### 4.4 `activity_log` — **CONFORME**

Catalogue `discriminatedUnion` de `strictObject` (`packages/shared/src/journal.ts:263+`) : une clé non
prévue est **refusée**, pas ignorée. Valeurs bornées par `MOTIF_VALEUR_JOURNAL`
(`/^[A-Za-z0-9_.:/-]{1,64}$/`). Aucune variante ne porte de champ d'adresse e-mail — l'interdiction
de journaliser l'adresse tentée sur `auth.login.echec` est **inexprimable**, pas seulement écrite.
Aucune variante ne porte de montant. `ip` est écrite dans la table (06 §10.4 l'y autorise nommément)
et masquée partout ailleurs.

### 4.5 Rétention RGPD — **F-10, MINEUR (hors périmètre, non tracé)**

06 §10.4 : `activity_log` 12 mois, **IP anonymisée à 90 j**, purges = jobs planifiés et journalisés.
**Mesure** : `grep -rn "purge|anonymis" apps/api/src apps/worker/src` → uniquement des **commentaires**
et le nom de file `purges: 'purges'` (`apps/worker/src/files.ts:52`). **Aucun job, aucun planificateur,
aucune requête d'anonymisation.** Le lot est L10 ; la table, elle, **écrit déjà des IP depuis L2**.
Aucune entrée de `DECISIONS.md` ni de `AMELIORATIONS.md` ne porte cet écart.

---

## 5. SECRETS (02 §30.4-5, 11 §2)

### 5.1 Aucune valeur de secret dans un fichier versionné — **CONFORME**

**Mesures** :

```
git ls-files | grep -i "\.env"            → .env.example  (seul)
grep -n "env" .gitignore                  → .env / .env.* / !.env.example
git log --all --diff-filter=A --name-only … | grep -i "\.env"  → .env.example  (seul)
```

`.env.example` relu ligne à ligne : toutes les valeurs sont soit `__CHANGEME__`, soit des non-secrets
(hôtes, ports, noms de bucket, TTL, seuils), soit vides. Aucune valeur réelle.

### 5.2 Ce que gitleaks ne verrait pas — cherché, **rien trouvé**

Je n'ai pas fait confiance au vert de `gitleaks`. Balayage indépendant de **tous les commits de toutes
les branches** :

```
git rev-list --all | while read c; do git grep -I -n -E \
  "sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|\
   xox[baprs]-[A-Za-z0-9-]{10,}|[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}|\
   BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY" $c --; done | sort -u
```
→ **une seule famille de résultats** : la clé OPENSSH factice
`-----BEGIN OPENSSH PRIVATE KEY-----\nleurre-de-test-sans-valeur\n-----END…`, présente dans
`apps/api/tests/l0-sauvegarde.integration.test.ts:427` sur tous les commits — c'est le leurre
explicitement exempté et documenté.

Affectations à valeur longue :
```
git grep -I -n -E "(SECRET|PASSWORD|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z_]*\s*[:=]\s*[\"']?[A-Za-z0-9+/=_.-]{16,}"
```
→ un seul faux positif (`TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED'`).

Workflows GitHub :
```
grep -rn -E "(PASSWORD|SECRET|TOKEN|KEY)[A-Z_]*:\s*[^\$\{#]" .github/workflows/*.yml
```
→ 11 occurrences, **toutes** préfixées `ci_factice_` (`ci_factice_postgres`, `ci_factice_minio_secret`,
`ci_factice_mot_de_passe_admin_12`). C'est littéralement 02 §30.4-5 (« les tests utilisent des secrets
factices »). Tout le reste passe par `${{ secrets.* }}`.

Fichiers de composition, README, fixtures de `apps/api/fixtures/` : aucune valeur de secret.

### 5.3 Configuration gitleaks — **CONFORME, avec une réserve déjà écrite**

Job `gitleaks` : `fetch-depth: 0` (historique **complet**), sur `push` **et** `pull_request`,
`--exit-code 1`, image épinglée `zricethezav/gitleaks:v8.18.4`, refus de démarrer si `.gitleaks.toml`
est absent. `[extend] useDefault = true`, aucune règle retirée. `regexTarget = "match"` (et non
`"line"`) — la correction est documentée **avec son épreuve chiffrée** (1 fuite → 2 fuites).

Réserve, déjà assumée dans le fichier : `[allowlist] paths = ['^docs/\.pack-integrity\.json$']`
exempte ce fichier de **toutes** les règles. Le risque est borné (fichier entièrement généré,
rescellé par `pnpm check:pack`) et l'aveu est écrit. Je le confirme sans le reclasser.

### 5.4 **F-02 — MAJEUR — `secretHexSchema` ne vérifie ni l'hexadécimal, ni l'entropie, ni la distinction, et exige la moitié de ce que prescrit le pack**

**Ce que trois documents affirment** :

| Source | Affirmation |
| --- | --- |
| `02 §30.3` | « `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — 2 secrets **distincts**, **64 octets** aléatoires » |
| `.env.example:93-95` | « DEUX secrets **DISTINCTS** de **64 octets**. Les réutiliser l'un pour l'autre annulerait la détection de réutilisation. `openssl rand -hex 64` » |
| `packages/shared/src/env.ts:47-48` | « DEUX secrets **DISTINCTS** de 64 octets. Les confondre annulerait la détection de réutilisation de refresh token (06 §10.1). » |
| `jetons-rafraichissement.ts:26` | renvoie à `env.ts` pour cette garantie |

**Ce que le code fait** (`env.ts:15-24, 49-50`) :

```ts
const secretHexSchema = (octets: number) =>
  z.string()
   .min(octets * 2, `doit faire au moins ${octets} octets (openssl rand -hex ${octets})`)
   .refine((v) => v !== '__CHANGEME__', …);

JWT_ACCESS_SECRET:  secretHexSchema(32),
JWT_REFRESH_SECRET: secretHexSchema(32),
```

**Mesure** — sonde exécutée contre le schéma réel (`chargerEnv(envApiSchema, …)`, APP_ENV=prod) :

```
ACCEPTE  : deux secrets IDENTIQUES (64 x "a")
ACCEPTE  : secret NON hexadecimal (64 x "z")
ACCEPTE  : 64 caracteres = 32 octets (pack : 64 octets)
REFUSE   : 63 caracteres -> JWT_ACCESS_SECRET : doit faire au moins 32 octets (openssl rand -hex 32)
ACCEPTE  : 128 caracteres hex = 64 octets (conforme pack)
```

Trois écarts, dans l'ordre de gravité :

1. **Aucun contrôle de distinction.** `grep -rn "JWT_ACCESS_SECRET" apps packages scripts` : aucun
   `refine` croisé, nulle part. Un exploitant qui colle deux fois la même valeur démarre une API où le
   **poivre du HMAC des refresh est le secret de signature des JWT d'accès** — la compromission de
   l'un livre l'autre. La propriété que trois fichiers déclarent essentielle n'est vérifiée par
   personne.
2. **La contrainte de longueur vaut la moitié de la prescription.** `secretHexSchema(32)` =
   `z.string().min(64)` = 64 **caractères**. Le pack et `.env.example` demandent
   `openssl rand -hex 64`, soit **128 caractères / 64 octets**. Un secret de 32 octets passe. Pire :
   le message d'erreur **dit lui-même** « au moins 32 octets », si bien que l'exploitant qui le lit
   est confirmé dans la mauvaise valeur.
3. **Le nom ment.** `secretHexSchema` ne teste **aucun** hexadécimal. `'z'.repeat(64)` est accepté ;
   `'a'.repeat(64)` aussi. **L'entropie minimale réellement imposée est nulle** — seule la longueur
   est contrainte.

Ni CRITIQUE ni exploitable à distance : les secrets sont provisionnés à la main (02 §30.4-2), et
`__CHANGEME__` est bien refusé. Mais ce validateur existe **pour** attraper le secret faible ou
recopié, et c'est le seul cas qu'il n'attrape pas.

**Correctif proposé** (aucun impact schéma/API, mais touche la sécurité → escalade `CLAUDE.md` §3-4) :
`.regex(/^[0-9a-f]+$/)`, `min(octets * 2)` appelé avec `64`, et un `.superRefine` sur l'objet
`envApiSchema` refusant `JWT_ACCESS_SECRET === JWT_REFRESH_SECRET`. Préalable : vérifier ce que
portent réellement les `.env` de staging et de prod — **un durcissement qui empêche la prod de
redémarrer est une panne, pas un correctif.**

---

## 6. SURFACE EXPOSÉE

### 6.1 MinIO jamais exposé publiquement — **CONFORME, et vérifié par un contrôle qui mesure la propriété**

**Mesure** — clés `ports:` par fichier :

| Fichier | Postgres | Redis | MinIO |
| --- | --- | --- | --- |
| `docker-compose.yml` (dev) | `127.0.0.1:…:5432` | `127.0.0.1:…:6379` | `127.0.0.1:…:9000` + `127.0.0.1:9001:9001` |
| `docker-compose.staging.yml` | `ports: !reset []` | `!reset []` | **`!reset []`** |
| `docker-compose.prod.yml` | `!reset []` | `!reset []` | **`!reset []`** |
| `docker-compose.coolify.yml` | *aucune clé `ports:`* | *aucune* | *aucune* |

Toutes les publications de dev sont **liées à la boucle locale**, jamais `0.0.0.0`. En staging/prod,
rien n'est publié. Le fichier Coolify va plus loin en n'écrivant **aucune** clé `ports` (l'en-tête
explique pourquoi `!reset []` serait le mauvais geste dans ce contexte).

Le point qui compte davantage que les ports, parce qu'il est moins visible : le staging cohabite avec
`axion-ia.com` sur le réseau Docker `coolify`, dont l'ICC est activé. `scripts/check-isolation-reseau.mjs`
impose que **seul `caddy`** rejoigne ce réseau, et sa révision du 2026-08-28 note qu'il « gardait un
mot, pas une propriété » et le corrige (six contournements identifiés en revue croisée, dont la
séquence YAML `- edge`). Ce contrôle tourne en CI (job `invariants du dépôt`).

### 6.2 En-têtes de sécurité et CSP — **CONFORME**

`infra/caddy/Caddyfile`, snippet `(securite)`, importé **à l'identique** par le bloc prod et le bloc
staging (le fichier explique pourquoi un staging plus permissif ne validerait plus rien) :

```
Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
X-Content-Type-Options    "nosniff"
X-Frame-Options           "DENY"
Referrer-Policy           "strict-origin-when-cross-origin"
Permissions-Policy        "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), …"
-Server
Content-Security-Policy   "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';
                           style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:;
                           font-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none';
                           base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
```

`script-src` est **sans** `'unsafe-inline'` et **sans** `'unsafe-eval'` ; `'wasm-unsafe-eval'` est
strictement ce qu'exige `hash-wasm` (Argon2id navigateur, 11 §1). `font-src 'self'` est cohérent avec
la police auto-hébergée. `handle_errors` rend une page neutre.

`style-src 'unsafe-inline'` est une **concession tracée** (DECISIONS.md 2026-08-27), motivée par les
attributs `style` posés à l'exécution par Radix/shadcn et par l'incompatibilité d'un nonce avec un
démarrage hors ligne depuis le cache du service worker. Réexamen **imposé au lot L5c** avec un
comptage. Rien à redire : c'est un risque nommé, borné et daté.

Côté API, `helmet` durcit les réponses JSON à `default-src 'none'`, `frame-ancestors 'none'`, HSTS
1 an preload, `crossOriginResourcePolicy: same-origin` (`app.ts:77-87`).

### 6.3 Pas de CORS — **CONFORME**

`grep -rn "@fastify/cors|cors(" apps packages` → **0 occurrence**. Aucun greffon CORS n'est installé
ni enregistré ; les trois surfaces sont servies par Caddy sous le même domaine (`/api/*`, `/hq*`,
`/*`).

### 6.4 Rate limiting — **CONFORME sur l'objet, écart littéral déjà écrit**

- **Global** : `max: 300, timeWindow: '1 minute'`, clé =
  `requete.identite?.utilisateurId ?? requete.ip` (`app.ts:113-136`). C'est bien « 300 req/min/**token** »
  du 11 §3 — le repli IP couvre le flot anonyme, sans quoi le non-authentifié serait illimité.
- **`/v1/auth/*`** : `max: 10, timeWindow: '1 minute'`, clé = `requete.ip`, déclaré **par route**
  (`domaines/auth/routes.ts:124-134`), pas par préfixe.
- La clé par IP **ne tient que par un couplage à deux fichiers** : `trusted_proxies 10.0.1.0/24` dans
  le `Caddyfile` **et** `trustProxy: ['loopback','linklocal','uniquelocal']` dans `app.ts`. Chacun
  porte l'avertissement vers l'autre, avec le tableau de mesures qui montre que retirer l'un ramène
  le seau global et que remettre `trustProxy: true` rouvre la forgerie. C'est la meilleure page de
  sécurité du dépôt.

**Écart littéral, déjà documenté dans le code** : `@fastify/rate-limit` donne un compteur **par
route**. Le préfixe `/v1/auth/*` tolère donc 3 × 10 = **30 req/min/IP** réparties sur `login`,
`refresh` et `logout`, là où 11 §3 écrit « `/v1/auth/*` 10 req/min/IP ». Le budget qui compte — les
tentatives de mot de passe — reste bien à 10. Je ne reclasse pas : l'écart est nommé, motivé
(l'alternative exigerait une assertion de type proscrite par la conception) et sans effet sur la
menace visée.

### 6.5 Sondes de santé — **CONFORME (risque nommé)**

`/v1/health` et `/v1/health/ready` sont **publiques** et **exemptées de quota**
(`rateLimit: false`, `routes/sante.ts`). L'exemption est justifiée par trois conditions énumérées et
non généralisables, née d'une mesure (sondes Docker refusées trois fois de suite pendant une rafale).
Le revers — amplification — est traité : `/health/ready` met son verdict en cache quelques secondes,
et les corps sont laconiques (`{status: 'ok'|'ready'|'degraded'|'unavailable'}`), sans version, sans
nom d'hôte, sans message de dépendance.

### 6.6 ZAP baseline — **CONFORME** (correction d'une hypothèse initiale)

`zap-baseline.yml` n'est déclenché que par `workflow_call` / `workflow_dispatch`, ce qui donne à la
lecture l'impression d'un contrôle qui ne tourne jamais. **Mesure contraire** :
`gh run view 33344097876` (dernier run sur `main`, `62193b8`) montre le job
`8 · deploy-staging … / ZAP baseline (staging) / Scan passif (baseline)` **exécuté et vert** en
1 min 25. Le workflow est appelé par `deploy-staging`. Rien à signaler.

---

## 7. DÉPENDANCES

### 7.1 Épinglage et gel — **CONFORME**

`grep -rn "\"[\^~>=<]" --include=package.json apps packages package.json` → **deux** résultats, tous
deux dans `engines` (`node: ">=22.11.0 <23"`, `pnpm: ">=9.0.0 <10"`), ce qui est la forme correcte
pour un moteur. **Zéro plage sur une dépendance**, 61 versions exactes. `.npmrc` : `save-exact=true`.
`dependabot.yml` : `open-pull-requests-limit: 0` sur les **trois** écosystèmes (npm, github-actions,
docker), avec le geste de réactivation Phase 2 écrit noir sur blanc.

### 7.2 **F-03 — MAJEUR — `pnpm audit` remonte une vulnérabilité HAUTE, et aucun contrôle du dépôt ne la voit**

**Mesure** — `pnpm audit --json` (2026-08-31, `securite/verdict-a51`, lockfile de `62193b8`) :

```
"metadata": { "vulnerabilities": { "info":0, "low":0, "moderate":0, "high":1, "critical":0 },
              "dependencies": 595, "totalDependencies": 595 }
```

| Champ | Valeur |
| --- | --- |
| Module | **`drizzle-orm` 0.44.7** (`apps/api/package.json:25`) |
| Chemin | `apps__api > drizzle-orm` — **dépendance de production** (`"dev": false`) |
| Avis | GHSA-gpj5-g38j-94v9 / **CVE-2026-39356** |
| Titre | *Drizzle ORM has SQL injection via improperly escaped SQL identifiers* |
| Sévérité | **high** · CVSS 3.1 **7.5** (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) · CWE-89 |
| Versions vulnérables | `< 0.45.2` — **corrigé en 0.45.2** |
| Publié | **2026-04-08** |

**Nature** : `escapeName()` n'échappait pas le délimiteur à l'intérieur de l'identifiant (`"` non
doublé en `""` côté PostgreSQL). Une entrée non fiable passée à `sql.identifier()` ou `.as()` peut
donc sortir de l'identifiant cité et être interprétée comme du SQL.

**Exploitabilité dans ce dépôt : nulle, et c'est mesuré, pas supposé.**
`grep -rn "sql.identifier|sql\.raw|\.as(" apps/api/src apps/worker/src packages/*/src` →
**un seul** résultat exécutable : `apps/api/src/http/pagination.ts:182`,
`sql\`${valeur}::${sql.raw(cle.colonne.getSQLType())}\``. L'argument de `sql.raw` est
`cle.colonne.getSQLType()`, **lu sur la colonne Drizzle du schéma**, jamais sur le réseau — le
commentaire de la ligne 158 le dit et il a raison. Aucun `sql.identifier`, aucun `.as()` sur entrée
utilisateur, aucun tri ni aucun champ dynamique piloté par la requête.

**Le vrai défaut n'est pas la CVE. C'est que personne ne pouvait la voir.**

- 06 §10.2 exige, verbatim : « dépendances : **npm audit en CI** ».
- `gh run view 33344097876` — **20 jobs** sur `main` : shellcheck, gitleaks, jonction, invariants,
  anti-skip, build-sources, unit, lint, integration, couverture, typecheck, e2e, schema-diff,
  4 × images, deploy-staging, ZAP. **Aucun job d'audit de dépendances.**
- `grep -rn "pnpm audit|npm audit|audit --" .github/ package.json scripts/` → **0 résultat**.
- `grep -n "npm audit|pnpm audit" DECISIONS.md AMELIORATIONS.md` → **0 résultat**. L'écart n'est ni
  décidé, ni différé, ni tracé : il est simplement absent.

L'avis a **cinq mois** (2026-04-08 → 2026-08-31) et personne, dans un dépôt qui a produit quinze
constats de garde-fous menteurs en deux jours, n'a eu le moyen de l'apprendre. C'est la définition
d'une exigence du pack qui n'a **jamais** été implémentée.

**Remédiation** : `drizzle-orm` 0.44.7 → 0.45.2 est une montée de version **mineure**, donc une
escalade `CLAUDE.md` §3-3 (Williams), d'autant qu'elle rompt le gel Phase 1. Compte tenu de
l'exploitabilité nulle mesurée ci-dessus, **la montée n'est pas urgente ; l'ajout du job d'audit
l'est**, parce qu'il est la seule chose qui empêchera la prochaine d'être invisible cinq mois.
Forme suggérée, cohérente avec la culture du dépôt (un contrôle qui ne trouve rien ne sort pas vert
par vacuité) : job `pnpm audit --audit-level=high`, **bloquant**, avec une liste d'exemptions
**datées et justifiées** dans `DECISIONS.md` plutôt qu'un `|| true`.

---

## 8. CE QUE LE PACK EXIGE ET QUI MANQUE

| Exigence | Source | Mesure | Verdict |
| --- | --- | --- | --- |
| **`axe-core` vert** | `CLAUDE.md` §5 (DoD transverse) | `grep -c axe pnpm-lock.yaml` → 3, **toutes** sur `saxes@6.0.0` (analyseur XML). Deux mentions dans des **commentaires** (`Bouton.tsx:35`, `tokens.test.ts:4`). **Le paquet n'est installé nulle part.** | **F-11, MINEUR** — absence **confirmée**, mais **tracée** : `PORTE_A_2026-08-27.md:495` la déclare « sans objet — exigible à L5 ». Réserve : rien ne rendra son absence bloquante le jour venu. |
| Chiffrement local terrain (DEK/KEK, AES-GCM) | 06 §10.5, 05 §9.7 | `grep -rniE "\bDEK\b\|\bKEK\b\|AES-GCM" apps packages` → **0** | **MANQUANT — hors périmètre (L5)** |
| Verrouillage PWA (15/60 min), Wake Lock | 05 §9.7 V2.10 | 0 occurrence | **MANQUANT — hors périmètre (L5)** |
| Export de secours chiffré | 05 §9.7, invariant 8 | 0 occurrence | **MANQUANT — hors périmètre (L5)** |
| Pseudonymisation LLM **en deux passes** (table de correspondance + NER) | 06 §10.4 | `grep -rniE "pseudonymis\|\bNER\b"` → **0** | **MANQUANT — hors périmètre (L11)** |
| Purges de rétention (12 mois, IP à 90 j) | 06 §10.4 | seul le nom de file `purges` existe | **F-10, MINEUR** — hors périmètre (L10) **mais non tracé**, alors que la table écrit des IP depuis L2 |
| MFA TOTP admin | 06 §10.1 | annoncé « V2 » par le pack lui-même | **SANS OBJET** |
| Uploads : MIME réel + taille max | 06 §10.2 | aucun upload livré | **SANS OBJET** |
| ClamAV | 06 §10.2 | différé Phase 2 par décision V2.9 écrite | **SANS OBJET** |
| Secrets `app_settings` chiffrés AES | 06 §10.2, `APP_ENCRYPTION_KEY` | la variable existe dans `.env.example` §7 mais **pas** dans `envApiSchema` : elle n'est pas validée au démarrage | **hors périmètre**, à ne pas oublier au lot qui l'utilisera |

---

## 9. CE QUE JE N'AI PAS PU VÉRIFIER, ET POURQUOI

1. **L'état réel du VPS** — UFW, pare-feu de l'hébergeur, `chmod 600` sur `/opt/axion-audit/.env`,
   sauvegarde chiffrée du `.env`. Aucun accès SSH depuis cette session. Deux de ces points ont déjà
   été mesurés par l'audit d'alignement : A-3 (ratifié — « UFW ne protège pas un hôte Docker, le
   trafic ne traverse jamais la chaîne filtrée ») et « aucun secret n'est porté par un environnement
   GitHub, les trois environnements existent et sont vides ». Je les reprends **sans les rejouer**,
   et je le dis.
2. **L'exécution des tests d'intégration.** Interdiction explicite de démarrer un conteneur (règle 2
   de `ORGANISATION_AGENTS.md`, deux exécutions lourdes déjà en cours). **Je n'ai donc PAS rejoué le
   balayage sentinelle ni la suite L2 : je les ai LUS.** Mon verdict §3 repose sur la lecture du
   socle **et** sur la lecture des assertions des tests, jamais sur leur sortie. Le dernier run vert
   sur `main` (`33344097876`, 11 min 10, 20 jobs) est ma seule preuve d'exécution, et c'est une
   preuve indirecte.
3. **TLS 1.3 et HSTS effectifs** sur le domaine réellement servi : la configuration est lue, la
   négociation ne l'est pas.
4. **La qualité d'entropie des secrets réellement posés** en staging et en prod. §5.4 prouve que le
   validateur ne l'impose pas ; il ne dit rien de ce qui a été posé à la main.
5. **La juridiction UE du stockage distant** (fiche AMELIORATIONS A-002, condition impérative « à
   vérifier à la souscription »). Hors de ma portée, toujours ouverte, **bloquante avant la première
   mission réelle**.

---

## 10. LA CHOSE QU'AUCUN CONTRÔLE EXISTANT N'AURAIT VUE

**F-01 : la redaction RGPD est intégralement contournée par tout objet portant un `toJSON()`.**

Ce n'est pas la plus grave — F-03 a une CVSS 7.5 et cinq mois d'ancienneté. C'est celle qu'**aucun
dispositif du dépôt ne pouvait atteindre**, et pour une raison qui vaut d'être nommée :

- les **29 tests** de `redaction-journal.test.ts` construisent des objets littéraux et des chaînes.
  Ils prouvent, avec une rigueur exemplaire (masquage prouvé par bascule sur 11 rouges pré-correctif),
  que la censure fait ce qu'elle dit **sur les valeurs qu'ils lui donnent**. Ils ne peuvent pas
  découvrir une famille de valeurs qu'ils n'instancient jamais ;
- le **balayage sentinelle** lit des réponses HTTP. Il ne lit aucun journal ;
- la **CI** n'inspecte pas une seule ligne de journal ;
- et la revue croisée avait déjà **vu la famille sans voir le cas général** : `parcourir` exempte
  explicitement `Date` et `RegExp` — deux objets à `toJSON` — sans se demander ce que devient le
  troisième.

Le mécanisme est exactement celui que ce dépôt traque : `parcourir` rend **la même référence** quand
rien n'a changé (optimisation légitime, documentée ligne 688-691), et c'est `JSON.stringify` qui
appelle `toJSON()` **après** la censure. La censure a donc bien tourné, elle a bien rendu un résultat,
et ce résultat est vrai — *pour l'objet qu'elle a examiné*. Ce qui part sur le réseau est une autre
valeur, produite plus tard, que rien n'a examinée. **Une mesure juste, qui répond à une autre
question que celle posée.**

Preuve, en une ligne de sortie brute :

```
{"cible":"https://axion/v1/users?email=jean.dupont@client.fr&token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig"}
```

Une adresse d'interviewé **et** un jeton, en clair, dans un journal d'exploitation dont l'en-tête
promet que « toute chaîne journalisée est nettoyée de ses e-mails, jetons porteurs […], `req.url`
compris ».

---

## 11. RECOMMANDATIONS, PAR ORDRE

| # | Action | Étage | Décideur |
| --- | --- | --- | --- |
| 1 | **Ajouter le job `pnpm audit` bloquant à la CI** (F-03). Sans lui, la prochaine CVE sera invisible aussi longtemps que celle-ci. | 1 | A01 |
| 2 | **Corriger le contournement `toJSON`** (F-01), avec un test **prouvé par bascule** (rouge d'abord). | 1 | A01 |
| 3 | **Durcir `secretHexSchema`** (F-02) : hexadécimal, 64 octets, distinction des deux secrets — **après** avoir vérifié les `.env` de staging et de prod. | escalade §3-4 | **Williams** |
| 4 | Trancher la montée `drizzle-orm` 0.44.7 → 0.45.2 (gel Phase 1 rompu ; exploitabilité mesurée nulle). | escalade §3-3 | **Williams** |
| 5 | Trois lignes dans `onRoute` : `financier: true ⇒ roles == ['admin']`, refus de démarrer (F-08). | 1 | A01 |
| 6 | Cartographier les **chaînes de requête** dans le balayage sentinelle, avec la même règle « non cartographié = anomalie » (F-09) — **avant** L7/L8. | 1 | A01 |
| 7 | Ouvrir une fiche `AMELIORATIONS.md` pour la rétention RGPD non implémentée (F-10) et pour l'échéance non mécanisée de la fenêtre de grâce (F-04). | 2 | Williams |
| 8 | Chaîner F-07 à la fiche « observabilité » : l'alerte du §9.7 n'a pas de destinataire. | 2 | Williams |

---

## 12. SIGNATURE

| Rôle | Nom | Date (UTC) | Verdict |
| --- | --- | --- | --- |
| Auditeur sécurité | **A51** | 2026-08-31 | **CONFORME SOUS RÉSERVE** — 0 CRITIQUE, 3 MAJEURS, 7 MINEURS. Aucun MAJEUR n'est exploitable en l'état ; les trois sont des garde-fous qui annoncent plus qu'ils ne font, et c'est à ce titre qu'ils sont majeurs. |
| Chef de chantier C3 | A50 | — | *à contresigner* |
| Directeur technique | A01 | — | *à contresigner* |
| Porte | Williams | — | *arbitrage des recommandations 3 et 4* |

> **Traçabilité** : E21 (auditeurs jamais d'accès aux montants) · E33 (sécurité) · E42 (RGPD renforcé)
> · E43 (conventions d'API) · E45 (habilitation).
> **Méthode** : `docs/ORGANISATION_AGENTS.md` §5 — aucune affirmation sans mesure ; ce qui n'a pas pu
> être mesuré est au §9, nommé et motivé.
