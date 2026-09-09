# @axion/field — PWA terrain

React 18 + Vite. **Offline-first radical** (invariant 1) : le réseau est un bonus, jamais un
prérequis. L'auditeur travaille en entrepôt, en sous-sol, en avion.

## Pourquoi Vite et pas Next.js

Décision ferme du contrat 11 §2. Le SSR est inutile (outil interne authentifié, aucun SEO) et
**nuisible** ici : l'app doit démarrer depuis le cache du service worker **sans serveur**. Ne jamais
scaffolder Next dans ce dépôt, même « par habitude ».

## État au 2026-09-09 — mesuré sur `main` (`5ac6f95`), pas sur une branche

> **Règle de ce paragraphe** : il ne dit « livré » que de ce qui est **fusionné dans `main`**. Ce
> qui vit sur une branche est « en branche », ce qui n'a pas de branche est « non ouvert ». C'est la
> cinquième réécriture de cette section (réserve DoD ligne 8, contrôles A02 des 03, 06, 07, 08 et
> 09/09) : les quatre précédentes annonçaient comme à venir ce que `main` contenait déjà, ou l'inverse.
>
> **Comment « livré » a été vérifié cette fois** : en lisant **l'arbre de `5ac6f95`**, fichier par
> fichier — chaque affirmation ci-dessous porte son chemin et sa ligne. **Pas par `git log`** : la
> session qui a écrit cette passe n'avait pas de shell. Les dates et les numéros de PR viennent donc
> de `docs/ETAT.md` et des fiches de revue, pas de l'historique.

### Livré dans `main`

**L5a — le socle** (PR #30, 2026-09-05) : shell PWA + service worker Workbox, base locale Dexie
**versionnée**, coffre **DEK/KEK** (Argon2id → KEK, DEK AES-256 non extractable), port d'écriture,
horloge à décalage serveur, verrou 15/60 min + Wake Lock, `storage.persist()`. **Les six réserves
de sécurité d'A51 (F-22 critique, F-23, F-25) sont dans `main`** — le veto V1 d'A02 est levé le
2026-09-07 (7 symboles revenus, 82 → 121 cas de test).

**L5b — la collecte** (PR #31, entrée dans `main` entre le 05 et le 06/09) : l'écran d'entretien
**3 zones** (03 M3.1) — blocs · question · notes — « Nouvel entretien » en trois champs, les
**onze** `TYPES_DE_REPONSE`, le mode **fourchette** et « non communiqué » (§27.4), à-revoir / sans
objet, les **trois** natures de note (note de question, bloc-notes de session, **note volante**),
la question **ad hoc**, le **hors-parcours** (§25.4), les raccourcis §33.3, le **mode écran
partagé**, l'indicateur « Enregistré ». Puis, par les correctifs de la recette novice :
« Terminer l'entretien » (#70), les boutons grisés qui disent pourquoi, le **refus de
participation** tracé (note horodatée, session `non_demarre`), l'**identité de l'auditeur**
(`src/siege/connexion.ts`, écran « Rattacher cet appareil », #80), et les **ancres de cotation
lisibles avant le premier tap** — crans 2 et 4 dérivés de la doctrine §32.4 (#97, réserve R1 d'A54).

**L5c — la journée** (PR #52, 2026-09-06) : cockpit **« Aujourd'hui »** (§34.2), **agenda** (§25.2)
et démarrage pré-rempli en un tap, les **six** `kind` de session dont l'atelier, proposition
d'unité (§25.3), entretien complémentaire (§25.6), **terminer ≠ valider** (§19.1 : « Terminer »,
« Rouvrir », « Valider », déverrouillage expert, validation groupée), « Où en est la mission »,
**fin de journée en un geste**, l'**export de secours `.axionbackup`** (11 §4, par mission, mot de
passe vérifié contre le coffre), l'**écran de restauration** (#69 : 11 % → 100 % de couverture,
identité de la sauvegarde restaurée affichée), le bandeau de mise à jour (§31-1). **Douze vues**
au registre `src/app/vues.ts`, chacune avec son état hors ligne (`RappelHorsLigne`, #81) et son
balayage axe-core (#82).

**N1 — co-visibilité des ancres** (PR #101, 2026-09-08) : sur iPad paysage, l'ancre lue et les
pastilles de cotation restent dans le même champ de vision — **barre d'actions scindée** en deux
groupes, toujours aux mêmes places : les **outils** (À revoir · N/A · Note · Photo · Recherche) dans
le flux de la carte, sous la saisie qu'ils qualifient ; la **navigation** (Précédent · Suivant), seule
bande collante, une rangée. Colonnes `1fr 2fr 1fr`. Instrument `e2e/fixtures/champ-de-vision.ts`,
garde `hors-ligne-l5.e2e.ts:827` sur **quatre** combinaisons orientation × mode.

**L5d — l'invariant 5 à l'écran** (fusionné depuis `lot/l5d-invariant5`, 2026-09-09) : `formaterHeure` et
`formaterDateHeure` prennent désormais `fuseau: string | null` **REQUIS**. Le chemin
« `undefined` → fuseau de l'appareil » **n'existe plus, ni dans le type ni dans le code** (arbitrage
A01 du 2026-09-08) : un écran connaît le fuseau de la mission, ou il ne le connaît pas ; il ne
l'emprunte jamais à la machine. Repli unique quand il ne le connaît pas — le même instant **en UTC,
NOMMÉ** : « (heure UTC) », jamais une heure nue. Une graphie que le moteur ignore (`Europe/Pariss`,
`UTC+2`, chaîne vide) est traitée comme inconnue plutôt que de faire exploser le rendu — c'est
l'écran de **restauration**, le chemin de secours, qui en dépendait le plus. Deux gardes tiennent la
règle : `session/fuseau.test.ts` (le repli lui-même, écrit par un autre agent que celui du correctif)
et `session/invariant5-appelants.test.ts` (aucun écran ne formate dans son coin). ⚠️ **« L5d »
désigne deux choses dans ce dépôt** — voir la chaîne photo ci-dessous.

**L5e — la troisième donnée du cockpit** (fusionné depuis `lot/l5e-cockpit`, 2026-09-09) :
`sync:dernier-succes:<missionId>`, une clé `meta` par mission, **distincte du curseur de pull**
`sync:since:` — un pull prouve la descente, pas la sortie, et c'est la sortie que l'invariant 8
protège. **Personne ne l'écrit en L5** : la valeur affichée est « jamais synchronisée depuis cet
appareil », et c'est L6a qui l'écrira **à chaque push réussi** (« push seul », arbitrage A01 du
2026-09-09 : compter un pull éteindrait l'alerte dans le cas exact qu'elle existe pour attraper).
Une seule lecture (`agenda/jour.ts`) nourrit **à la fois** la carte de mission du cockpit et l'alerte
de l'invariant 8 — une source pour un fait, la leçon de B6. Même incrément : le **rappel de fin de
journée** compte les jours civils au fuseau de **chaque** mission (`every`, pas `some`) et ne se
réarme plus à minuit UTC.

**Sécurité — les en-têtes SERVIS** (PR #111 et #112, fusionnées le 2026-09-09) : la posture de `infra/caddy/`
cesse d'être crue sur parole. CSP **`style-src 'self'`** — la concession `'unsafe-inline'` du
2026-08-27 est **fermée**, elle n'avait aucun consommateur (0 `style=`, 0 `<style>`, 0 injection de
feuille, Radix/shadcn absents). Isolation d'origine : COOP et CORP `same-origin`, COEP
**`require-corp`** — donc **`crossOriginIsolated === true`** ; `require-corp` plutôt que
`credentialless`, que WebKit ne comprend pas et qui ne vaudrait **aucune** isolation sur l'iPad.
Toute réponse servie porte une politique de cache **explicite** : quatre familles, dont les icônes de
PWA en `no-cache` — jamais `immutable`, elles sont provisoires et changent sous le même nom. Enfin
`z.config({ jitless: true })`, appelé au **premier import** de `main.tsx` : sans lui, la sonde
`new Function` de Zod émet une violation CSP à **chaque** chargement, et un signal qui se déclenche
toujours finit par faire ajouter `'unsafe-eval'`. La preuve est en navigateur, sur la chaîne exacte
servie (`e2e/en-tetes-servis.e2e.ts`) — **y compris hors ligne**, ce qu'aucun test ne montrait :
`e2e/hors-ligne-l5.e2e.ts` tourne contre `vite preview`, qui ne sert **aucun** de ces en-têtes.

### Ce qui n'est PAS dans `main` — et où c'est

- **La chaîne photo** — `sauvegarde/photos.ts` (`compresserPhoto`) est du **code sans appelant** :
  zéro `type="file"`, zéro `capture=`, zéro `kind:'photo'` (NB-4). Le septième bouton de §17.4 existe,
  **désactivé**, et dit pourquoi à l'œil autant qu'au lecteur d'écran : « **Photo (bientôt)** »
  (`ecrans/entretien/ZoneQuestion.tsx:312`). **Non ouvert, et sans branche** — incrément propriétaire
  arbitré le 2026-09-05, « après P-C ». ⚠️ **Le nom « L5d » que lui donnent `DECISIONS.md`
  (2026-09-05) et `ZoneQuestion.tsx:33` est déjà pris** par l'incrément d'invariant 5 ci-dessus :
  « L5d est livré » ne veut donc rien dire tant qu'A01 n'a pas renommé l'un des deux.
- **Toute synchronisation** — `portSyncInerte` rend `{ statut: 'indisponible' }` et
  `derniereSyncReussieLe: null` ; le premier pull est descopé vers L6a. **Non ouvert** : L6 se
  développe **seul**, après P-C (`docs/conception/LOT_L6.md`).
- **Une seule source pour l'alerte de l'invariant 8** — `agenda/jour.ts` la dérive de `meta` (la clé
  ci-dessus), `app/EcranAccueil.tsx` la dérive encore du port de sync. Invisible aujourd'hui (les deux
  disent « jamais »), **contradictoire dès le premier push réussi** : c'est B6 réarmé, latent. Réserve
  R2 d'A29, **datée et assignée à L6a** (`docs/conception/LOT_L6.md` §3bis).
- **`@filrouge` allongé du segment L5** — le scénario reste celui de L3, une ligne de commentaire dans
  `e2e/socle.e2e.ts:13`. **Non ouvert** : DoD ligne 7, sixième incrément (A20/A26).
- **La posture de sécurité sur les pages d'erreur** — `handle_errors` est une chaîne distincte, que le
  bloc d'en-têtes ne traverse pas : un 404 rend `Server: Caddy` et **aucun** en-tête de sécurité
  (mesuré le 2026-09-09). Écrit tel quel dans le Caddyfile, **lot à dater** (R10). Même famille : quand
  un asset empreinté manque, le repli SPA rend `index.html` en 200 `immutable` un an (R11).
- **`no-store` sur le JSON de l'API** — daté et assigné à **L6c** avec le download en streaming §9.6.
  La garde `e2e/en-tetes-servis.e2e.ts` porte les deux chemins d'API en « fait à corriger » et
  **rougira** le jour du correctif : le signal de l'inverser dans le même commit.

### La porte P-C — refusée, en cours de rejeu

P-C a été **refusée deux fois** le 2026-09-06 (veto A02 + NO-GO A54), puis **rejouée EN ENTIER** le
2026-09-07 (09 §4bis) : A02 « conforme sous réserve, non franchissable », A54 « GO sous réserve ».
Recoche du 2026-09-08 (`docs/portes/RECOCHE_A02_CRITERE6_2026-09-08.md`, portée par la PR #104) :
critères du 07 —
**1 ferme (une session de chaque type hors ligne) · 6 sous réserve matérielle · 1 non tenu**
(le « dernier succès ») · DoD **7/10**. **Le critère non tenu a reçu son code depuis** : L5e est
fusionné. Le **recocher appartient à A02**, pas à ce README — ce qui est vrai ici, c'est que
l'obstacle nommé est dans `main`, pas que la case est cochée. **Réserves bloquantes au dossier** :
NB-3-bis (ZAP — `ZAP_BLOQUANT` reste `'false'` ; la bascule attend un run **en TLS sur staging** et
le `no-store` de L6c) et NB-9-bis (matrice de traçabilité), fermée le 2026-09-08 puis rouverte le 09
sous **NB-9-ter** — il y manquait L5d, L5e et le volet sécurité, ajoutés au **§P** de
`docs/TRACABILITE_E1-E47.md`. **Ce qui ne se coche que sur une machine réelle est dû à Williams** :
iPad physique en mode avion, coupure de courant, second appareil, session de 45 min, démo écran
partagé, novice humain au chronomètre — et, depuis le volet sécurité, **`require-corp` sur l'iPad**,
jamais joué sur l'appareil de référence.

**Aucun tag `v0.l5` n'existe** : il vient avec la porte, pas avant.

### Carte des modules — ce que chaque incrément porte

| Module                           | Ce qu'il porte                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/local/base.ts`              | `BaseLocale` (Dexie 4), `SCHEMA_LOCAL` versionné, `VERSION_SCHEMA_LOCAL`, clés de `meta`            |
| `src/local/formes.ts`            | l'en-tête d'index EN CLAIR (liste **fermée**) et les charges chiffrées, par table                   |
| `src/local/coffre.ts`            | Argon2id (`hash-wasm`) → KEK, DEK AES-256 non extractable, `verrouiller()`, ré-enveloppement        |
| `src/local/coffre-appareil.ts`   | sel + paramètres + DEK enveloppée dans `meta` ; planchers KDF, `CoffreInexploitableError`           |
| `src/local/ecriture.ts`          | `ecrireLocal` (ligne + op d'outbox en UNE transaction) et `appliquerDescente` (jamais d'outbox)     |
| `src/local/horloge.ts`           | **le seul `new Date()` de l'application** — décalage serveur 05 §9.2                                |
| `src/local/stockage.ts`          | `storage.persist()`, quota, seuils d'alerte                                                         |
| `src/local/depots/*.ts`          | lectures indexées : sessions du jour, réponses, recherche hors-parcours, outbox                     |
| `src/local/port-sync.ts`         | `PortSync` **déclaré** ; implémentation **inerte** — L6a la REMPLACE, sous `src/sync/`              |
| `src/app/**`                     | coquille, verrou, navigation sans routeur, registre `vues.ts` **append-only**, capacités hors ligne |
| `src/session/machine.ts`         | les 4 états × 2 profils, **terminer ≠ valider** (03 §19.1 V2.10)                                    |
| `src/session/valeurs.ts`         | les **douze** formes de valeur (11 types + `range`) et la GARDE À L'ÉCRITURE                        |
| `src/session/ecriture-*.ts`      | création/démarrage d'entretien, écriture de réponse — refus si validé (§19.1 V2.10)                 |
| `src/session/notes-volantes.ts`  | capture immédiate, rattachement différé, suppression **logique** (invariant 7)                      |
| `src/session/questions-adhoc.ts` | question ad hoc hors ligne, codes d'options garantis DISTINCTS                                      |
| `src/session/enregistrement.ts`  | l'enregistrement continu : file sérialisée, débounce, purge sur `pagehide`                          |
| `src/session/raccourcis.ts`      | la grille §33.3, INACTIVE dans un champ de saisie (règle V2.8)                                      |
| `src/session/fuseau.ts`          | affichage au fuseau de **mission** (03 §22.2) ; fuseau REQUIS, repli « (heure UTC) »                |
| `src/ecrans/entretien/**`        | l'écran 3 zones et ses dialogues (`entretien.css` : seuil des colonnes **64rem**)                   |
| `src/agenda/**`                  | le jour de mission, le pilote « Où en est la mission », la validation groupée, les unités           |
| `src/ecrans/journee/**`          | cockpit, agenda, fin de session, fin de journée, restauration, bandeau de mise à jour               |
| `src/sauvegarde/**`              | format `.axionbackup` (11 §4), dépôt, `compresserPhoto` (**sans appelant**, voir ci-dessus)         |
| `src/siege/connexion.ts`         | `POST /v1/auth/login` (05 §8.1), rattachement d'un SEUL auditeur par appareil (invariant 7)         |
| `sw/service-worker.ts`           | précache du shell, des polices et des icônes ; **aucun cache d'exécution de `/api`**                |
| `scripts/build-icones.mjs`       | icônes PWA **provisoires**, générées depuis les jetons de la charte (voir ci-dessous)               |

### Ce que les tests couvrent, et ce qu'ils ne couvrent PAS

Couverture **mesurée** par la porte de CI (`pnpm test:coverage` puis
`node .github/scripts/check-coverage.mjs`) sur les globs de `.github/coverage-critical-paths.json` :
`src/local/**`, `src/session/**`, `src/app/verrou.ts`, `src/sauvegarde/sauvegarde.ts` et
`src/sauvegarde/format.ts` (les deux fichiers qui SONT l'export — `photos.ts` n'y est pas, et c'est
dit dans le fichier de globs) — tous ≥ 90 % sur les quatre métriques au 2026-09-08 (`coffre.ts`
100 % ; `EcranRestauration.tsx` 100 % hors seuil, mesuré par #69).

**`src/ecrans/**` n'est PAS dans ce périmètre, et c'est un doute de spec ouvert** (D-4, transmis à
A01 le 2026-09-03, sans arbitrage) : `EcranFinDeSession.tsx` est à **66,05 % de lignes / 30 % de
fonctions**. Ce n'est pas une infraction à la DoD — elle énumère sync, crypto, scoring, RBAC — mais
la recette P-C doit le savoir avant de cocher « terminer → note → valider groupé ».

**Ce que l'E2E prouve hors ligne** (`e2e/hors-ligne-l5.e2e.ts`, Chromium, `context.setOffline`) :
mode avion sur deux appareils émulés (`:215`), une session de **chacun des six types** (`:289`),
coupure brutale en pleine saisie (`:370`), export produit puis restauré sur un **second profil**
(`:471`), ancres lisibles avant le premier tap (`:620`), co-visibilité N1 sur quatre combinaisons
(`:827`), les sept boutons de §17.4 (`:1155`). Budgets 11 §4 : `e2e/budget-chiffrement-l5.e2e.ts`
(chiffrement p95 0,6-1,8 ms, écriture complète 6-12 ms, budget 50 ms — mesuré sur poste, pas sur
iPad). Accessibilité : `e2e/accessibilite-toutes-vues-l5.e2e.ts`, 12 vues sur 12.

**Ce que l'E2E prouve des en-têtes réellement servis** (`e2e/en-tetes-servis.e2e.ts`) : le harnais
lance **le Caddy du dépôt** sur les builds réels (`e2e/fixtures/caddy-servi.ts`) — le reste de l'E2E
tourne contre `vite preview`, **qui ne sert aucun en-tête**. Les deux jeux de tests répondent donc à
deux questions différentes, et l'écrire ici évite de croire que le premier couvre le second : la CSP,
l'isolation d'origine et les politiques de cache **ne sont vérifiées que là**. La PWA y est démarrée
**en ligne puis hors ligne** sous ces mêmes en-têtes (`crossOriginIsolated === true` dans les deux
phases, Argon2id sans réseau).

### Trois règles de socle que tout écran doit respecter

1. **Aucune écriture Dexie hors de `src/local/ecriture.ts`** (hors `meta`). C'est ce qui rend vraie,
   par construction, la règle « chaque écriture pousse une op dans l'outbox » (05 §9.2-2). Une règle
   ESLint dédiée la garde, sur les neuf tables nommées.
2. **Aucun `new Date()` ni `Date.now()` hors de `src/local/horloge.ts`** — sinon l'appareil déréglé
   de +3 h du scénario 05 §9.8 gagne tous les arbitrages de conflit.
3. **L'état hors ligne se rend avec `RappelHorsLigne`**, alimenté par
   `src/app/capacites-hors-ligne.ts` (§33.2, seconde moitié). Les listes y sont regroupées, **une par
   vue du registre**, et le type l'exige : un écran ajouté à `vues.ts` sans ses capacités ne compile
   pas. Chaque ligne doit être une capacité que le produit tient **aujourd'hui** — trois promesses
   fausses ont été écrites puis retirées le 2026-09-06 (revue A29), dans le fichier même qui pose
   cette règle. **La pastille, elle, est celle de l'en-tête de la coquille** (décision A01 du
   2026-09-05) : les écrans passent `avecPastille={PASTILLE_PORTEE_PAR_LA_COQUILLE}`. Le compte des
   douze vues est tenu par `src/app/hors-ligne.test.tsx`, pas par la vigilance de chacun.

   **Combien de pastilles au total, écran par écran** — mesuré sur le DOM, pas affirmé (le tableau
   vit dans `hors-ligne.test.tsx`, bloc D). Onze vues sur douze : **une seule**, celle de l'en-tête.
   `aujourdhui` en rend **une de plus par carte de mission**, contextualisée par la mission qu'elle
   décrit et traduite par le même `etat-sync-affiche.ts` — donc jamais en contradiction de mots.
   Toute autre pastille est un retour de **B6** : le 2026-09-06, l'écran d'entretien en rendait une
   pilotée par `navigator.onLine`, et l'auditeur lisait **deux états opposés avec deux comptes
   différents** ; elle a été retirée.

### Ce que le socle refuse EXPLICITEMENT, et pourquoi

- `embarquerMission()` prépare le stockage puis **refuse** le premier pull
  (`premier_pull_indisponible`) : le premier pull est **descopé vers L6a** (`DECISIONS.md`
  2026-09-02, R-L5a-10). L3d est livré ; ce qui manque est l'endpoint serveur, que L6a livre et
  consomme. Un embarquement qui « réussirait » sans données produirait une mission vide, découverte
  chez le client. En attendant, une mission entre sur l'appareil par **restauration d'un
  `.axionbackup`** ou par la fixture E2E.
- `portSyncInerte` rend `{ statut: 'indisponible' }`. **Jamais une pastille verte** : une pastille
  qui verdit sans serveur annonce plus qu'elle ne fait, et le prix se paie en journée d'entretiens.
- Un appareil ne se rattache qu'à **un seul auditeur** : rattacher un second est refusé
  (invariant 7). Un appareil qui n'a **jamais** vu le réseau ne peut pas être rattaché : fiche
  d'étage 2 dans `AMELIORATIONS.md` (2026-09-06), non arbitrée.

### Les icônes sont PROVISOIRES, et générées

`scripts/build-icones.mjs` fabrique `public/icones/*.png` (192, 512, maskable,
`apple-touch-icon`) à partir de `COULEURS_CHARTE` — aucune couleur en dur, aucune dépendance
nouvelle (encodeur PNG sur `node:zlib`). Elles sont **ignorées par git** : ce sont des artefacts
de construction, régénérés par `pnpm --filter @axion/field build`.

**Pourquoi elles existent quand même** : sans icône, le manifeste n'est pas installable ; sans
installation « Sur l'écran d'accueil », pas de persistance durable d'IndexedDB sur iPad (03 §22.1) ;
sans persistance, aucune mission n'est embarquable (05 §31-2). C'était le bloquant B2 de la revue
croisée A29.

**Le dessin reste celui de Williams** (`DECISIONS.md` 2026-09-02, fiche A-009) : le manifeste porte
`"_provisoire": true`, et le remplacement sera une substitution de fichiers, sans une ligne de code
à toucher.

### Construction

`pnpm --filter @axion/field build` enchaîne `tsc` (app + service worker), `build-icones`, `vite build`, puis
`scripts/build-sw.mjs` — Workbox 7 en `injectManifest`, **sans `vite-plugin-pwa`** (hors liste 11 §1,
arbitrage A01). Le manifeste de précache ne peut être calculé qu'APRÈS que `dist/` existe : l'ordre
n'est pas négociable.

## Contraintes qui pèsent sur chaque écran

- **Aucune couleur ni taille en dur** : tokens de `@axion/ui` uniquement. `pnpm check:invariants`
  refuse jusqu'à la couleur de thème du `index.html`, injectée à la construction depuis les tokens.
- **Cible tactile ≥ 44 px** (A27) : l'app se pilote au doigt, debout.
- **Règle des 4 états** (§33.2) : tout écran livré avec vide, chargement, erreur et nominal.
- **Police auto-hébergée** (`@fontsource-variable/inter`) : un CDN de police casserait le mode avion.
  C'est un critère de la porte P-C, pas une préférence.
- **Interface 100 % en français** ; horodatages au fuseau de **mission**, jamais celui de l'appareil.
  Le fuseau est un paramètre **requis** (`string | null`) : le formater soi-même, ou passer
  `undefined`, ne compile plus et une garde le refuse en plus du compilateur.
- **Zéro bouton « enregistrer »** (E23) : l'enregistrement est continu, l'indicateur « Enregistré »
  en atteste.

## Limite de test assumée

`context.setOffline(true)` de Playwright couvre les scénarios réseau, mais **les service workers sous
iOS ne sont pas couverts** et `toBeVisible()` **ne regarde pas le viewport** (angle mort mesuré le
2026-09-07, fermé pour les ancres par `e2e/fixtures/champ-de-vision.ts`). Le mode avion RÉEL sur iPad se
rejoue **à la main** aux portes P-C et P-E (11 §7, checklist 07 §15). Documenté, pas contourné.

### Deux tests `@critique` ROUGES sur un poste Windows, VERTS en CI — à lire avant de les « réparer »

Dans `e2e/hors-ligne-l5.e2e.ts` :

- `@critique coupure brutale en pleine saisie — la réponse en cours survit à la mort de l'onglet`
  (`:370`) ;
- `@critique export de secours produit hors ligne, puis restauré sur un SECOND profil navigateur`
  (`:471`).

Ce sont les **deux seuls** qui ouvrent un **profil sur disque** (`ouvrirProfilSurDisque`,
`e2e/fixtures/appareil-terrain.ts:447`) : sans profil persistant, un test « prouverait » la survie des
données par la mécanique du test, ce qui ne prouve rien. Sur le poste **Windows** du pilote (mesure du
2026-09-09), le service worker lancé dans ce contexte persistant **n'atteint jamais l'état
`activated`** : l'attente de `hors-ligne-l5.e2e.ts:172` expire, et le mode avion échoue pour une
raison qui n'a rien à voir avec l'application. Un premier cas de la même famille avait été mesuré le
2026-09-06 et **fermé** (le dossier de profil est forcé en ASCII, parce qu'un chemin accentué laissait
le worker « installing » indéfiniment — le motif est écrit dans la fixture) ; **celui-ci ne l'est
pas**.

**Les deux tests sont verts en CI** (Ubuntu, job `5 · e2e`), et c'est la CI qui fait foi. Une session
neuve qui découvre ces deux rouges en local ne doit **ni les corriger ni les skipper** — `@critique`
n'est jamais skippable (CLAUDE.md §2) : elle lit ce paragraphe, et elle regarde le run du commit.

## Développement

```bash
pnpm --filter @axion/field dev          # http://localhost:5173 (génère d'abord les icônes)
pnpm --filter @axion/field typecheck    # app + service worker
pnpm test:interface                     # les tests d'écran (.test.tsx), projet vitest `interface`
pnpm test:unit                          # les modules (.test.ts), projet `unit`
pnpm test:coverage && node .github/scripts/check-coverage.mjs   # la mesure que lit la porte de CI
pnpm test:e2e                           # build + Playwright (hors ligne, axe, budgets)
```

**Aucune variable d'environnement** : l'app ne lit aucun `import.meta.env.*`. En production, Caddy
sert cette app à la racine du domaine (`/`), la console sous `/hq` et l'API sous `/api` : même
origine, donc **aucun CORS**, et l'API se joint en chemin relatif.

**Attention aux tests datés** : deux tests sensibles à l'heure ont été trouvés en douze heures
(créneau `maintenant() + 4 h` franchissant minuit, semaine ISO du dernier jour du mois). Tout test qui
touche à l'agenda s'éprouve sur les 24 heures et les 7 jours, jamais sur l'instant où on le lance.
