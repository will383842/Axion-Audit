# SÉANCE MATÉRIELLE — PORTE P-C — fiche à dérouler

> **Ce document ne juge rien et ne signe rien.** Il rassemble, dans l'ordre où on les exécute, les
> vérifications de P-C qu'aucune machine ne peut jouer à la place de Williams. Elles étaient
> éparpillées entre la table **§5-B** de `RECOCHE_A02_CRITERE6_2026-09-08.md`, le dossier
> `CONTROLE_A02_PC_2026-09-07.md` (§10-C, §10-D, §14-8), les deux recettes A54 du 2026-09-07,
> `REVUE_A29_N1_2026-09-08.md` (R-9, R-13), `REVUE_A29_SECURITE_2026-09-09.md` (`require-corp`),
> `docs/conception/LOT_L5.md` §4 et plusieurs blocs de `docs/ETAT.md`. **Personne ne peut exécuter
> une séance qu'il doit d'abord reconstituer : c'est la raison pour laquelle elle n'a pas eu lieu.**
>
> **Rédigée par A55 (documentation), en lecture seule sur le code.** Aucun critère n'est inventé :
> chaque ligne cite sa source. Là où le pack ne dit rien, la fiche pose une **question ouverte** au
> lieu d'improviser un protocole (CLAUDE.md §3).
>
> **Sources lues** : 07 ligne L5 (les 8 critères) · 09 §4 ligne P-C et §4bis · 03 §33 intégral et
> §33.7 · `RECOCHE_A02_CRITERE6_2026-09-08.md` (**§5-B, la colonne vertébrale**, §1, §3.1, §4) ·
> `CONTROLE_A02_PC_2026-09-07.md` · `RECETTE_NOVICE_L5_2026-09-07.md` §6 à §10 ·
> `RECETTE_NOVICE_L5_2026-09-07_REJEU.md` §2 à §10 · `REVUE_A29_N1_2026-09-08.md` §10 et §11 ·
> `REVUE_A29_SECURITE_2026-09-09.md` §2-D, §5, §9 · `docs/conception/LOT_L5.md` §3.6 et §4 ·
> `infra/caddy/Caddyfile:238-240` · `AMELIORATIONS.md` (fiche M10 du 2026-09-08) ·
> `docs/journal/2026-09-08.md` (burn-down) · `docs/ETAT.md` (blocs des 2026-09-07, 08 et 09).

---

> ## L'ARGUMENT DE LA DEMI-JOURNÉE
>
> **État du dossier P-C à la date de la séance** — verdict du rejeu intégral A02 du **2026-09-09**
> (`CONTROLE_A02_PC_2026-09-09.md`, sur `main` = `5ac6f95`) : **1 ferme · 7 sous réserve matérielle ou
> de démo · 0 NON TENU.**
>
> ## IL NE RESTE QUE DU MATÉRIEL.
>
> Plus aucun critère du fichier 07 n'est « non tenu ». Le dernier — le n° 1, l'état de sync par mission
> — a été fermé **par du code** (L5e, #109 : les trois données de §34.2 sont lues, rendues au fuseau de
> la mission, et la même vérité nourrit l'alerte de l'invariant 8). Les invariants sont à **8/8**,
> l'invariant 5 vérifié **au code** par A02, pas sur une fiche.
>
> **Cette demi-journée débloque 7 des 8 critères à elle seule** (`RECOCHE_A02_CRITERE6_2026-09-08.md`
> §5-B, point 1). C'est l'unique chose qui sépare encore P-C de sa signature, avec deux réserves de
> gouvernance qui ne se jouent pas sur du verre (§4).
>
> **Deux nuances qu'A02 pose, et qui se règlent autour de la séance** : le critère n° 1 n'est pas coché
> **ferme** parce que §34.2 exige un compteur d'à-revoir **cliquable** par mission (NB-15, ~0,05 j de
> code, hors séance) et parce que « Démo » veut dire **montré** — donc V-2 le montre. Et le novice doit
> jouer **sur l'arbre présenté à la porte** : les deux GO SOUS RÉSERVE existants portent sur un arbre
> **antérieur à trois incréments** qui ont touché des écrans terrain.
>
> **Dernier état publié, au 2026-09-08** (RECOCHE A02 §3.1) : **1 ferme (n° 3) · 6 sous réserve
> matérielle (n° 2, 4, 5, 6, 7, 8) · 1 non tenu (n° 1)** — et le n° 1 **n'est pas matériel** : D-6 est
> tranché (#102), c'est un trou de code que L5e ferme (`port-sync.ts:164` rendait `null` en dur).
> **Réserves bloquantes : 2**, contre 3 la veille — le bloquant humain **B3-bis est levé**.

---

## 0. Ce que cette fiche est — et ce qu'elle n'est pas

- Elle **prépare** le fichier de porte ; elle ne le remplace pas. Le verdict se pose ailleurs (§5).
- Elle couvre **le seul travail matériel et humain**. Elle ne ferme ni la sécurité serveur, ni les
  migrations, ni la sync, ni la charge du reste du chantier (§4 — à lire avant de croire qu'une
  demi-journée d'iPad signe P-C).
- **Aucun secret n'est écrit ici** (CLAUDE.md §2) : les mots de passe se transmettent hors dépôt,
  de vive voix ou sur papier, et ne sont recopiés dans aucun fichier versionné.
- **Aucune référence client** (invariant 2) : la séance se joue sur la mission fictive **FIL-TPE**.

### Ce qui a déjà été joué — et qu'on **ne rejoue pas** ici

Mesuré, transcrit, et vert en CI. **Ne le refaites pas** ; ce qui suit en est exactement le
complément — ce qu'un navigateur émulé, `jsdom` et Playwright ne peuvent pas voir.

| Déjà acquis | Où |
| --- | --- |
| Session planifiée en **1 tap** · **Terminer → note → Valider groupé** · raccourcis complets et inactifs dans un champ · indicateur « Enregistré » au fuseau de mission · synthèse de fin d'entretien | `RECETTE_NOVICE_L5_2026-09-07_REJEU.md` §3 à §5, joué dans un Chromium réel |
| Quatre états sur **12 vues sur 12** · axe-core vert sur 12/12 | idem §4, exécuté par A54 |
| **R1** (ancres lisibles avant le tap) et **N1** (ancres co-visibles, quatre combinaisons) **fermés** | RECOCHE A02 §2 ; garde `hors-ligne-l5.e2e.ts:827` ; `REVUE_A29_N1` |
| Mode avion **émulé** (deux gabarits) · six types de session hors ligne · coupure brutale de **l'onglet** · export restauré sur un **second profil de navigateur** | `hors-ligne-l5.e2e.ts:215 / :289 / :370 / :471`, job e2e vert |
| **La PWA démarre hors ligne sous la CSP et le COEP réellement servis**, `crossOriginIsolated: true` dans les deux phases, Argon2id sans réseau | `REVUE_A29_SECURITE_2026-09-09.md` §9, réserve R9 fermée par mesure |
| Police servie depuis l'origine, précachée, peinte hors réseau **sur Chromium** | A54 §4 · `polices.e2e.ts` |

---

## 1. À RÉUNIR AVANT DE COMMENCER

### 1.1 Matériel

| Élément | Précision | Pourquoi |
| --- | --- | --- |
| **iPad physique** | modèle et **version d'iPadOS notés** au début de la séance | Safari < 16.4 n'a pas l'API Wake Lock (A54 §7-2) ; et COEP `require-corp` n'est compris qu'à partir de **Safari 15.2** (A29 sécurité §2-D). La version conditionne la lecture de V-1 et de V-8 |
| **2ᵉ appareil** | PC ≥ 1280 px **ou** second iPad, application installée | critère 07 n° 5 (« restauré sur un 2ᵉ appareil ») **et** ligne 2 de `LOT_L5.md` §4 |
| **Clé USB** (ou AirDrop) | transfert du `.axionbackup` **hors réseau** | l'export de secours doit voyager sans serveur (invariant 8) |
| **Chronomètre** | un vrai, pas une estimation | critère 07 n° 6 : « test novice **< 30 min** » |
| **Chargeur + prise accessible** | poste de bureau alimenté secteur si possible | V-9 : arracher l'alimentation, pas tuer un onglet |
| **De quoi photographier** | téléphone de service, **jamais** un appareil personnel avec des données de mission | une capture par ligne cochée (§5) |
| _(facultatif)_ **un Mac avec Web Inspector** | permet de lire `crossOriginIsolated` sur l'iPad | V-1 : sans lui, on observe les symptômes, pas l'en-tête |

### 1.2 Humain

| Rôle | Qui | Ce qu'il fait |
| --- | --- | --- |
| **Williams** | — | déroule la fiche, coche, signe. Aucune de ces lignes ne se délègue |
| **Un novice recruté** | quelqu'un qui **n'a jamais vu l'outil** et ne sait pas lire ce code | V-10 uniquement. A54 l'écrit lui-même : « je suis un novice simulé qui sait lire ce code : mon chronomètre ne vaut rien » |
| **Un tiers témoin** | n'importe qui, 10 minutes | V-6 : c'est **lui** qui atteste qu'il ne voit rien d'interne, pas l'opérateur |

### 1.3 Le compte auditeur de test sur staging — **sans lui, la séance n'a pas lieu**

**À dire en toutes lettres.** Le compte auditeur de test sur staging **et son secret** n'existent pas
au 2026-09-09 : A02 en fait le **point 3 de sa table §5-B** (« rien de tout cela n'est faisable par un
agent »), et `ETAT.md` le range depuis cinq jours dans « ce qui reste à la main de Williams ».

**Conséquence mécanique** : la fixture `e2e/fixtures/appareil-terrain.ts` équipe un appareil **sans
serveur**, mais c'est un outil de Playwright — **elle n'existe pas sur un iPad physique**. Sur du
vrai matériel, il n'y a qu'un chemin pour qu'une mission arrive sur l'appareil : `POST /v1/auth/login`
réel → rattachement de l'auditeur → **premier pull**. Donc :

- **V-1 est la seule vérification jouable sans ce compte** (elle n'a besoin que de l'app installée) ;
- **V-2 à V-10 sont bloquées** : pas de mission sur l'appareil, donc pas de session, donc ni ancres,
  ni colonnes, ni export qui contienne quelque chose, ni coupure « en pleine saisie », ni novice.

**À obtenir avant de fixer la date** : identifiant du compte, secret (hors dépôt), rôle. A51 pose
trois conditions au compte de test : **rôle le plus faible**, aucun compte non humain sans écrit,
artefact de CI conservé 30 jours. Le même compte débloque le **ZAP authentifié** — sans lui,
`httpOnly` / `Secure` / `SameSite` sont comptés PASS **faute d'avoir vu un cookie** (A02 §5-B, 3).

### 1.4 Accès et repères

| Élément | À noter avant de commencer |
| --- | --- |
| **URL de staging** | la racine `/` sert l'app terrain, `/hq` la console, `/api` l'API — même domaine (11 §2, pas de CORS) |
| **Le commit joué** | le SHA **déployé sur staging** le jour de la séance, relevé au début et recopié dans le fichier de porte. Une séance jouée sur un autre binaire que celui de la porte ne prouve rien |
| **L5d et L5e sont fusionnés** | **corrigé le 2026-09-09 par A01** : cette fiche disait « en PR, non fusionnés », sur la foi d'un bloc `ETAT.md` périmé. `git merge-base --is-ancestor` établit que `4f56e1f` (#108) et `59a3da2` (#109) sont **ancêtres de `ac365f3`**. Donc l'écart d'invariant 5 de V-7.6 **doit avoir disparu**, et le critère n° 1 **doit afficher une date**. Si l'un des deux ne tient pas, c'est une **régression**, pas un incrément en attente |
| **Mot de passe d'appareil** | choisi sur place, noté sur papier, **jamais** dans un fichier |
| **Mot de passe d'export** | idem — c'est lui qui déchiffre le `.axionbackup` sur le 2ᵉ appareil (11 §4) |

---

## 2. DURÉES

| Bloc | Vérification | Durée |
| --- | --- | --- |
| A | **V-0** — installation, connexion, premier pull (prérequis) | 30 min |
| A | **V-1** — `require-corp` et les en-têtes servis, sur WebKit | 10 min |
| B | **V-2** — mode avion **réel**, PWA installée | 25 min |
| B | **V-3** — police peinte au démarrage à froid hors réseau | 10 min |
| C | **V-4** — les trois lignes de mise en colonnes + le doigt sur le verre | 25 min |
| C | **V-5** — ancres de cotation co-visibles, sur des questions réelles | 20 min |
| C | **V-6** — écran partagé démontré devant un tiers | 10 min |
| D | **V-7** — export créé, restauré sur le 2ᵉ appareil | 30 min |
| D | **V-8** — session active de 45 min sans ressaisie | 45 min d'horloge, **recouverts par V-7** → +15 min nets |
| D | **V-9** — coupure de **courant** en pleine saisie | 15 min |
| E | **V-10** — recette novice rejouée en entier, au chronomètre | 60 min |

**Total : ≈ 4 h 10 de gestes**, à prévoir **4 h 30** avec les aléas. **Une demi-journée d'affilée, non
fractionnable** : V-8 exige 45 minutes continues sans toucher l'appareil, et V-9 doit suivre une
saisie réelle. Le bloc A est le seul qui se joue **réseau actif** ; V-10 rouvre le réseau le temps du
rattachement du novice.

**Ordre non permutable, et pourquoi** : on installe avant de couper le réseau (A) ; on observe la
mise en page et les ancres tant que la session est fraîche (C) ; on produit l'export **avant**
d'immobiliser l'iPad 45 minutes (D) ; on coupe le courant **après** avoir posé toutes les preuves
qu'un redémarrage pourrait coûter (V-9) ; on réinitialise l'appareil **en dernier** pour le novice
(V-10), parce que cette réinitialisation détruit tout ce qui précède.

---

## 3. LES VÉRIFICATIONS

Légende des colonnes : **Le geste** est à l'impératif, une phrase, exécutable sans réfléchir.
**Ce qu'on observe** est un fait constatable à l'œil — jamais « vérifier que ça marche ».
**Preuve à poser** : capture ou vidéo horodatée, déposée sous `docs/portes/preuves/P-C/`
(*dossier à créer par le pilote ; nom de fichier proposé `V-<n>-<numéro de ligne>.jpg`, à valider —
11 §9bis exige « la preuve », pas une convention particulière*).

### V-0 — Préparation de l'appareil et segment amont (prérequis, réseau ACTIF)

*Ferme le seul point qu'A02 déclare « strictement dû à un compte sur staging » (`CONTROLE_A02_PC_2026-09-07.md` §10-B, points 1-3 ; table §5-B, point 3). Ne coche aucun critère du 07 à lui seul.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Relever le SHA déployé sur staging, l'écrire en tête du fichier de porte, puis **vérifier que `4f56e1f` et `59a3da2` y sont contenus** | le commit joué est celui de la porte, pas un autre — et il porte L5d et L5e, tous deux fusionnés dans `main` | — (traçabilité 11 §9bis) | le SHA + la confirmation que les deux correctifs sont dans le binaire joué | ☐ |
| 0.2 | Ouvrir l'URL de staging dans Safari sur l'iPad | l'écran « Préparer cet appareil » s'affiche, deux champs, la politique de mot de passe annoncée **avant** d'être opposée | — (contexte A54 §3.1) | capture | ☐ |
| 0.3 | Ajouter l'app à l'écran d'accueil, la fermer, la rouvrir **depuis l'icône** | elle s'ouvre en plein écran, **sans barre d'URL Safari** — c'est une PWA installée, pas un onglet | prérequis des critères 07 n° 2 et n° 8 | capture de l'icône + de l'app plein écran | ☐ |
| 0.4 | Taper le bouton de préparation **à vide** | « Protection non créée — Saisissez un mot de passe pour protéger cet appareil. » ; le mot « incorrect » ne se prononce pas | bloquant A54 **B1**, sur matériel réel | capture | ☐ |
| 0.5 | Créer la protection avec le mot de passe d'appareil (noté sur papier) | l'appareil s'ouvre ; « Cet appareil n'est rattaché à aucun auditeur », **avec son geste** de sortie | bloquant A54 **B2** | capture | ☐ |
| 0.6 | Rattacher l'auditeur avec le **compte de test staging** | la connexion aboutit contre l'API réelle ; l'auditeur est nommé à l'écran | segment amont (A02 §10-B) | capture | ☐ |
| 0.7 | Tirer la mission **FIL-TPE** (premier pull) | la mission apparaît ; l'agenda du jour porte au moins une session planifiée | segment amont | capture de l'écran « Aujourd'hui » | ☐ |

### V-1 — `require-corp` sur WebKit : les en-têtes servis ne cassent rien sur l'iPad

*Hors des 8 critères du 07 — c'est le point **3 de « ce qui reste dû à Williams »** de la revue de sécurité : « `require-corp` sur l'iPad, **ou acceptation écrite du risque documentaire** » (`REVUE_A29_SECURITE_2026-09-09.md` §9). COOP, CORP et COEP sont **posés** dans `main` (`infra/caddy/Caddyfile:238-240`, `Cross-Origin-Embedder-Policy "require-corp"`) ; le choix de `require-corp` repose sur un motif **WebKit** — `credentialless` n'y est pas pris en charge et retombe sur `unsafe-none`. A29 le vérifie documentairement, le mesure en navigateur… et l'écrit noir sur blanc au §5 : **« `require-corp` n'a jamais tourné sur l'iPad »**. Dix minutes le jour où l'appareil est allumé.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Noter la version d'iPadOS et de Safari | **≥ 15.2**, sinon COEP n'est pas compris et l'observation ne vaut rien (A29 §2-D) | — | la version, écrite | ☐ |
| 1.2 | Déverrouiller l'appareil (dérivation Argon2id, WASM `hash-wasm`) | le déverrouillage **aboutit** — c'est la ressource que `require-corp` pourrait casser sur WebKit | — (sécurité, 06 §10.2) | capture | ☐ |
| 1.3 | Parcourir trois écrans et regarder les icônes et le manifeste | les icônes (`data:` et `/icones/*`) sont **peintes**, aucun carré vide ; l'icône d'accueil est celle de l'app | — | capture | ☐ |
| 1.4 | Si un Mac avec Web Inspector est disponible, lire `crossOriginIsolated` sur l'iPad | **`true`** — c'est la valeur mesurée en Chromium, en ligne **et** hors ligne (A29 §9, R9) | — | capture de la console | ☐ |
| 1.5 | Sans Mac : s'en tenir aux symptômes, et **l'écrire** | « en-tête non lu, aucune casse observée » n'est pas « en-tête mesuré ». A29 offre l'autre voie : **acceptation écrite du risque documentaire** | — | la mention, ou l'acceptation signée | ☐ |
| 1.6 | Photos (`blob:`) | **non observable à P-C** : la chaîne photo n'existe pas encore (A02, réserve NB-4, lot L5d/photos). L'écrire, ne pas cocher | — | la mention écrite | ☐ |

### V-2 — Mode avion RÉEL, sur iPad physique, PWA installée

*A02 §10-C point 8-bis · critère 07 n° 2 · ligne P-C du 09 §4. `playwright.config.ts` l'écrit lui-même : « les service workers sous iOS ne sont PAS couverts par Playwright ». Tout ce qui suit se joue réseau coupé.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Activer le **mode avion** dans les réglages iPadOS, et vérifier qu'aucun Wi-Fi ne subsiste | l'icône avion est dans la barre d'état ; le Wi-Fi est éteint, pas seulement déconnecté | 07 n° 2 (moitié iPad physique) | capture de la barre d'état | ☐ |
| 2.2 | Fermer complètement l'app (balayage depuis le sélecteur), puis la rouvrir depuis l'icône | elle **démarre** : aucune page d'erreur Safari, aucun « impossible d'ouvrir la page » | 07 n° 2 · P-C « session complète en mode avion sur iPad » | vidéo courte de l'ouverture | ☐ |
| 2.3 | Regarder la pastille d'état | **une seule** pastille « Hors ligne », jamais deux, jamais verte | bloquant A54 **B6** sur matériel | capture | ☐ |
| 2.4 | Ouvrir « Aujourd'hui » et lire les trois données du cockpit §34.2 | l'agenda du jour et les à-revoir sont là ; l'outbox est vraie. **Le « dernier succès de sync »** : s'il affiche une date, L5e est passé et le critère n° 1 est cochable ; s'il est muet, **ce n'est pas un point de séance** — c'est le trou de code que L5e ferme | 07 n° 1 — **à lire, pas à jouer** (D-6 tranché #102 : afficher l'état, pas synchroniser) | capture | ☐ |
| 2.5 | Regarder le **libellé** de la pastille de synchronisation | **arbitrage produit réservé à Williams** depuis le 2026-09-06 (A02 §5-B, point 6) : le mot est-il juste pour un auditeur, avant que L6 existe ? | — (arbitrage) | le libellé retenu, écrit | ☐ |
| 2.6 | Chercher, depuis le menu, les écrans nommés « Aujourd'hui » | **M8** : il y en a **deux**, et l'un s'atteint par un bouton qui promet « Missions et stockage de l'appareil ». **Deuxième arbitrage produit réservé à Williams** (A02 §5-B, point 6 ; A54 R3) | — (arbitrage) | capture des deux écrans | ☐ |
| 2.7 | Créer une session hors ligne de deux types différents | les deux se créent sans réseau ; aucun message d'erreur | 07 n° 3 (déjà ferme en E2E — ici, confirmation matérielle) | capture | ☐ |

### V-3 — La police, peinte après un démarrage à froid hors réseau

*A02 §10-C point 9 · critère 07 n° 8 · 03 §33.1 (« Inter variable auto-hébergée — JAMAIS de CDN : la PWA doit rendre parfaitement en mode avion »). Le précache et la peinture sont prouvés **sur Chromium** ; **iPadOS décide seul**.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Mode avion toujours actif : **éteindre complètement l'iPad**, attendre 30 s, le rallumer | l'appareil redémarre sans réseau | prérequis | — | ☐ |
| 3.2 | Rouvrir la PWA depuis l'icône et comparer avec la capture prise en ligne en 0.3 | **le même dessin de lettres** : mêmes largeurs de mots, mêmes retours à la ligne. Une bascule sur la police système se voit à l'œil nu sur les titres | **07 n° 8 — police rendue en mode avion** (moitié iPadOS) | les deux captures, côte à côte | ☐ |
| 3.3 | Regarder un écran portant des chiffres alignés (compteurs de synthèse) | les chiffres sont **tabulaires**, les colonnes s'alignent (§33.1) | 03 §33.1 | capture | ☐ |

### V-4 — Les trois lignes de mise en colonnes, et le doigt sur le verre

*`docs/conception/LOT_L5.md` §4, recette d'appareils : « `jsdom` n'évalue pas les media queries […] jamais la mise en colonnes PEINTE. C'est le livrable-titre de L5b (03 M3.1), et 03 §33.7 en fait un critère de porte ». **La note ajoute : si l'une des trois échoue, P-C n'est pas franchie.***

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 4.1 | iPad en **paysage** : ouvrir la session planifiée d'**un seul tap** depuis le cockpit, donner l'accord de participation | l'entretien s'ouvre **pré-rempli** ; il n'a fallu qu'un tap plus l'accord | §33.7 « session planifiée démarrée en 1 tap » (déjà joué en émulé — confirmation) | capture | ☐ |
| 4.2 | Regarder l'écran d'entretien **en paysage** (≥ 1024 px) | **les trois zones côte à côte** : blocs · question · notes. Ni empilées, ni derrière un bouton | `LOT_L5.md` §4 ligne 1 · 03 M3.1 · §33.7 | photo de l'écran entier | ☐ |
| 4.3 | Saisir la note de la question, toujours en paysage | elle se saisit **sans ouvrir de panneau** | `LOT_L5.md` §4 ligne 1 | photo | ☐ |
| 4.4 | Tourner l'iPad en **portrait** (< 1024 px) | **repli en deux panneaux** : « Blocs et progression » et « Notes » deviennent deux boutons ; la question occupe seule la largeur | `LOT_L5.md` §4 ligne 3 | photo | ☐ |
| 4.5 | Ouvrir le même entretien sur le **PC ≥ 1280 px** | trois zones côte à côte, **et** les rappels de raccourcis visibles (§33.3, pointeur fin) | `LOT_L5.md` §4 ligne 2 | capture | ☐ |
| 4.6 | Sur les trois configurations : faire glisser le doigt latéralement | **aucun défilement horizontal** | `LOT_L5.md` §4 ligne 4 | vidéo courte | ☐ |
| 4.7 | Taper au **pouce**, dix fois d'affilée, le bouton « Suivant » en paysage | **R-13 (A29, 2026-09-08)** : « Suivant » fait **92 px**, contre un plancher de **112 px** avant le chantier N1 — le geste le plus fréquent a perdu 20 à 45 px. Observer si le pouce le manque. Reste ≥ 44 px, donc conforme §19.2 | 03 §22.1 (cibles ≥ 44 px) — **et non un refus de porte** | vidéo des dix taps + nombre d'échecs | ☐ |
| 4.8 | Si 4.7 est gênant au pouce | **ne rien décider sur place** : une ligne étage 1 avec un jeton, arbitrage A20/A01. A29 refuse un plancher en dur (invariant 4 : ce serait une taille sans jeton) | canal d'amélioration (09 §5.9) | la constatation, écrite | ☐ |

### V-5 — Les ancres de cotation, co-visibles, à l'œil, sur des questions réelles

*A02 §10-D point 16 · 03 §33.3 (« les ancres s'affichent SOUS le curseur »). Le mot « visible » a été arbitré par A01 le 2026-09-08 : **co-visible avec la zone de cotation** — « ce que §33.3 interdit n'est pas le défilement, c'est de perdre les pastilles de vue en lisant l'ancre ». **R1 et N1 sont fermés** (RECOCHE A02 §2) ; ce qui reste ici est le **résidu R-9/R-13, explicitement renvoyé à l'iPad réel**.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 5.1 | En **paysage, mode privé** (pas partagé), afficher une question à échelle 1-5 de la banque, **sans toucher l'écran** | les **cinq crans portent un texte** ; la ligne d'ancre n'est jamais vide ; le dépliant est **ouvert** | P-C « ancres visibles » · §33.3 | photo | ☐ |
| 5.2 | Sans défiler, regarder l'écran comme un auditeur qui cote | les **pastilles 1-5** et **l'ancre du cran visé** sont dans le champ de vision **en même temps** | critère de co-visibilité (arbitrage A01, 2026-09-08) | photo de l'écran entier | ☐ |
| 5.3 | Compter ce que mangent la barre d'état, le clavier logiciel s'il s'ouvre, et l'encoche | **R-9 (A29)** : la marge est d'**une rangée** (56 px) sur une émulation optimiste ; une rangée collante de plus laisserait la garde **verte** sur un écran illisible. C'est ici que l'œil doit se poser | §33.3 | photo, clavier ouvert et fermé | ☐ |
| 5.4 | Tourner en **portrait**, question à échelle, au repos | les ancres 4 et 5 sont **recouvertes par la navigation** — conforme, puisqu'une position existe où tout est co-visible (A29 §10, R-9) : un défilement court doit suffire | §33.3 | photo avant / après défilement | ☐ |
| 5.5 | Afficher une question à échelle **sans ancre de banque** | le repli se lit « Aucune ancre de cotation n'est fournie pour cette question. » — jamais une ligne vide, jamais une invitation à « voir son ancre » | A54, défauts R1 fermés | photo | ☐ |
| 5.6 | Lire à voix haute la mention « Ancre dérivée » sur les crans 2 et 4 | la citation fait 139 caractères et porte « (doctrine §32.4) ». A54 la juge « exacte et coûteuse ». **Question pour Williams, pas pour la séance** : la garde-t-on telle quelle sur du verre ? | — (arbitrage A01 du 2026-09-07, non rouvert par cette fiche) | l'avis, écrit | ☐ |

### V-6 — Le mode écran partagé, démontré devant un tiers

*A02 §10-D point 15 · critère 07 n° 7 (« mode écran partagé démontré » — **démontré veut dire montré**) · 03 §33.3. A54 l'a joué dans un Chromium réel, sur deux orientations : ce qui reste dû est **le témoin**.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 6.1 | Saisir d'abord une note interne, poser un à-revoir, et laisser le nom de l'interviewé à l'écran | l'écran privé porte bien des éléments internes à masquer | prérequis | photo de l'écran privé | ☐ |
| 6.2 | Tourner l'iPad vers le tiers et basculer en écran partagé (bouton ; touche `E` sur le PC) | la bascule est **instantanée** ; un bandeau fin « écran partagé » reste visible en permanence | **07 n° 7** | photo | ☐ |
| 6.3 | Demander **au tiers** — pas à l'opérateur — de dire tout ce qu'il voit | il ne nomme **ni** le nom de l'interviewé, **ni** les notes, **ni** les notes volantes, **ni** les à-revoir, **ni** les motifs de non-communiqué, **ni** la recherche, **ni** les rappels de touches | **07 n° 7** · §33.3 | sa réponse, transcrite et signée d'une initiale | ☐ |
| 6.4 | Rebasculer en privé | tout revient ; **aucune saisie perdue** (invariant 7) | invariant 7 | photo | ☐ |

### V-7 — L'export de secours, créé sur l'iPad, restauré sur le 2ᵉ appareil

*A02 §10-C point 11-bis · critère 07 n° 5 · invariant 8. L'E2E l'a fait sur un **second profil de navigateur** ; ce qui reste dû, c'est **le second appareil, et le mot de passe au clavier virtuel**.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 7.1 | Toujours hors réseau, ouvrir « Fin de journée » et compter les gestes réellement demandés | l'écran annonce « un seul geste » et enchaîne sync → sauvegarde → validation, **mais demande le mot de passe d'export avant** : cela fait deux. **Troisième arbitrage produit réservé à Williams** (A02 §5-B, point 6) — il se rend ici, à l'œil | §33.7 « Fin de journée en un geste » — **à arbitrer, pas à cocher** | photo + l'arbitrage rendu | ☐ |
| 7.2 | Créer l'export de secours, mot de passe saisi **au clavier virtuel** | le fichier `.axionbackup` est produit hors réseau ; son nom ne porte **ni nom de client, ni donnée personnelle** (invariant 2) | 07 n° 5 (création) | photo du nom de fichier | ☐ |
| 7.3 | Transférer le fichier vers le 2ᵉ appareil **par clé USB ou AirDrop** — jamais par staging | le transfert se fait sans réseau : c'est ce qui protège l'invariant 8 | invariant 8 | photo | ☐ |
| 7.4 | Sur le 2ᵉ appareil, écran « Restaurer » : choisir le fichier et saisir un **mot de passe faux** | le refus est **clair** et **ne détruit rien** — les données locales du 2ᵉ appareil restent intactes | invariant 7 | photo | ☐ |
| 7.5 | Recommencer avec le bon mot de passe, **au clavier virtuel** | la restauration aboutit ; **les réponses cotées sur l'iPad sont là**, à l'identique | **07 n° 5 — restauré sur un 2ᵉ appareil** | photo côte à côte des deux appareils | ☐ |
| 7.6 | Lire l'écran de restauration et le rappel de fin de journée en entier | **constat A54 R2** : UUID de mission brut et date au fuseau de l'**appareil** (invariant 5). **Le correctif L5d est fusionné** (`4f56e1f`) : l'écart doit avoir **disparu** — l'observer, ne pas le supposer. **S'il est encore là, c'est une régression**, à écrire comme telle | invariant 5 | photo | ☐ |

### V-8 — La session active de 45 minutes, sans ressaisie de mot de passe

*A02 §10-C point 12 · 03 §33.7 (« AUCUNE ressaisie de mot de passe pendant une session active de 45 min »). **À lancer AVANT l'étape 7.3** : les 45 minutes se recouvrent avec la restauration sur le 2ᵉ appareil.*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 8.1 | Juste après 7.2 : rouvrir une session, saisir une réponse pour la mettre **en cours**, noter l'heure au chronomètre | la session est bien `en_cours`, pas seulement ouverte | prérequis | photo horodatée | ☐ |
| 8.2 | Poser l'iPad, écran allumé, **ne rien toucher pendant 45 minutes** — jouer 7.3 à 7.6 sur le 2ᵉ appareil pendant ce temps | rien n'est touché : ni tap, ni bouton, ni notification traitée | §33.7 | l'heure de départ | ☐ |
| 8.3 | À t+45 min, regarder l'iPad **avant** de le toucher | l'écran **ne s'est pas éteint** (Wake Lock ; croiser avec la version relevée en 1.1 — l'API manque avant Safari 16.4) | §33.7 | photo horodatée | ☐ |
| 8.4 | Toucher l'écran et reprendre la saisie | **aucune ressaisie de mot de passe** n'est demandée (verrou §9.7 : session active = 60 min > 45), et la réponse en cours est intacte | **§33.7 — aucun verrou en session active de 45 min** | vidéo de la reprise | ☐ |
| 8.5 | Si l'occasion se présente : ouvrir une session planifiée **sans la démarrer** et attendre 15 minutes | **M10** : une session ouverte mais pas encore `en_cours` reste au verrou de 15 min — l'auditeur qui attend son interlocuteur est verrouillé. **La fiche existe désormais** (`AMELIORATIONS.md`, 2026-09-08, étage 2 PROPOSÉE, posée par A55) : **arbitrage dû à la porte** — ABSORBÉE / PHASE 2 / REFUSÉE | — (arbitrage 09 §5.9 ; doute D-3 chez A01) | photo si joué, mention sinon | ☐ |

### V-9 — La coupure de COURANT en pleine saisie

*A02 §10-C point 10-bis · critère 07 n° 4 (« coupure de courant en pleine saisie = zéro perte »). L'E2E tue **l'onglet** sur un profil disque ; A02 écrit : « seule une coupure réelle exerce le vidage de cache du système de fichiers ».*

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 9.1 | Sur l'iPad, en paysage, coter une question à échelle (taper le cran 4) **et** écrire deux mots de note, sans quitter la question | la pastille « Enregistré à hh:mm » apparaît, **au fuseau de la mission** | §33.3 (indicateur Enregistré) | vidéo | ☐ |
| 9.2 | **Immédiatement** : couper l'alimentation. Sur un poste de bureau alimenté secteur, **débrancher la prise**. Sur l'iPad, à défaut : redémarrage forcé matériel (maintien des boutons) | l'appareil s'éteint **sans arrêt logiciel** | 07 n° 4 | vidéo | ☐ |
| 9.3 | Rallumer, rouvrir l'app depuis l'icône, toujours en mode avion | **la réponse cotée est là, la note est là, et l'écran reprend sur la même question** | **07 n° 4 — coupure de courant = zéro perte** | photo de la question rouverte | ☐ |
| 9.4 | Parcourir les deux questions précédentes | rien n'est revenu à un état antérieur, rien n'a été silencieusement écrasé (invariant 7) | invariant 7 | photo | ☐ |
| 9.5 | Écrire dans le fichier de porte **quelle** coupure a été jouée | un redémarrage forcé d'iPad n'est **pas** une coupure d'alimentation. **Question ouverte** — le pack ne dit pas si l'un vaut l'autre : si les deux sont jouables, jouer les deux et le dire ; sinon, le déclarer comme une approximation | — | la mention écrite | ☐ |

### V-10 — La recette novice n° 1, rejouée EN ENTIER, avec un vrai novice

*A02 §10-D point 17 · critère 07 n° 6 · **table §5-B, point 2**. **Le bloquant B3-bis est LEVÉ** : deux rejeux intégraux existent au dossier (`RECETTE_NOVICE_L5_2026-09-07.md` et son `_REJEU`), tous deux **GO SOUS RÉSERVE**, et 09 §4bis est « satisfait deux fois » (RECOCHE A02 §1). **Ce qui reste dû est un seul geste** : « le novice humain au chronomètre » — le seul des quatre points matériels d'A54 qui conditionne le critère 6, les trois autres se comptant ailleurs (RECOCHE §1.3). A54 : « mon chronomètre ne vaut rien sur ce critère-là, et je refuse de le maquiller ». **À jouer en dernier : la réinitialisation détruit tout ce qui précède.***

| # | Le geste exact | Ce qu'on observe | Critère 07 / §33.7 fermé | Preuve à poser | ☐ |
| --- | --- | --- | --- | --- | --- |
| 10.1 | Vérifier que **toutes** les preuves de V-0 à V-9 sont posées, puis réinitialiser l'appareil terrain (effacer les données du site, réinstaller la PWA) | l'appareil est **vierge** : le novice voit ce que verrait un consultant recruté demain | prérequis | capture de l'écran vierge | ☐ |
| 10.2 | Faire jouer le novice **sur l'iPad physique** | recommandation d'A02 (§1.3, non exigée) : « N1 est né d'une mesure au pixel sur une émulation » — le doigt sur le verre change ce qu'un novice réussit | 07 n° 6 | la mention de l'appareil utilisé | ☐ |
| 10.3 | Réactiver le réseau, remettre au novice **sur papier** l'URL et l'identifiant du compte de test, et rien d'autre | il n'a **aucune** explication, aucune démonstration préalable (07 : « test novice », A54 : « sans aide ») | prérequis | la feuille remise | ☐ |
| 10.4 | Vérifier que son profil est bien **guidé strict**, et le **faire écrire** dans le rapport | réserve de forme d'A02 (§1.3) : le mot « guidé strict » n'apparaît dans **aucun** des deux rapports A54 ; c'est vrai par construction (`auditeur.ts:38`), donc **déduit, pas déclaré**. Le prochain rapport doit le dire | **07 n° 6** (« A54, guidé strict ») | la ligne du rapport | ☐ |
| 10.5 | Lancer le chronomètre et **se taire** | on n'aide pas, on n'oriente pas, on n'approuve pas | 07 n° 6 | heure de départ | ☐ |
| 10.6 | Observer sans intervenir : préparer l'appareil → rattacher l'auditeur → trouver sa session du jour → mener l'entretien → coter → terminer → ajouter une note → valider en groupe → fin de journée | le parcours **ne s'interrompt jamais** : aucun cul-de-sac, aucune promesse non tenue, aucune devinette | 07 n° 6 · §33.7 (les quatre critères, joués par un humain qui ne connaît pas l'outil) | vidéo continue, ou notes horodatées | ☐ |
| 10.7 | Couper le réseau dès que sa première session est ouverte, sans le prévenir | il continue ; l'app reste utilisable ; la pastille « Hors ligne » l'informe sans l'inquiéter | invariant 1 · §33.2 (4ᵉ état) | photo | ☐ |
| 10.8 | Noter **chaque hésitation de plus de 30 secondes** et **chaque question posée à voix haute** | ce sont les seuls défauts d'ergonomie qui comptent : ceux d'un utilisateur qui ne sait pas | 07 n° 6 | la liste, écrite pendant, pas après | ☐ |
| 10.9 | Arrêter le chronomètre à la validation groupée | **le temps total, écrit en clair. Le critère est « < 30 min »** | **07 n° 6 — test novice < 30 min**, de GO SOUS RÉSERVE à **GO** | le chiffre | ☐ |
| 10.10 | Demander au novice, avant tout débriefing : « qu'est-ce que vous n'avez pas compris ? » | sa réponse, telle quelle, sans reformulation | 07 n° 6 | citation verbatim | ☐ |

---

## 4. CE QUE CETTE SÉANCE NE FERME PAS

**Une demi-journée d'iPad ne signe pas P-C.** Elle débloque **7 des 8 critères** (A02 §5-B, point 1)
et fait passer le n° 6 de GO SOUS RÉSERVE à GO. Restent, dus par d'autres :

| Ce qui reste ouvert | Pourquoi ce n'est pas ici | À qui |
| --- | --- | --- |
| **RBAC, `scoping_financials`, propriété des écritures de sync** | ce sont les **intrusions croisées de P-B** (09 §4) ; A02 les déclare « sans objet sur L5 » — L5 ne touche pas `apps/api`. Et A29 l'écrit deux fois dans la revue de sécurité : « le scan passif ne couvre ni RBAC ni la propriété des écritures ; **la bascule ne coche pas le point 7 de P-C** » | acquis à P-B |
| **Run ZAP en TLS sur staging et bascule `ZAP_BLOQUANT`** | réserve **NB-3-bis**, toujours bloquante : le décompte est lu (`FAIL-NEW 0 · WARN-NEW 7`, zéro haute), mais basculer aujourd'hui **rendrait `main` rouge**. Le 0/0/0 d'A29 est **local et en HTTP** : « la bascule serait aujourd'hui un pari ». Bascule **et épinglage du digest dans le même commit** (§5-B, 5) | Williams |
| **D-8 — l'échéance ou la séquence ?** | deux écrits se contredisent : l'arbitrage du 05 veut la bascule **à P-C** ; le dossier A51 du 08 démontre qu'elle suppose d'abord la pile (a), un fichier de règles et un run à 0/0/0. **A02 ne tranche pas un critère de porte** | A01 ou Williams |
| **Migrations up/down sur staging** | ligne 4 de la DoD, **non tenue** : `deploy-staging.yml` n'appelle jamais `db:migrate` ; un `--down-to 0` est destructif (§5-B, 4) | Williams |
| **A28 : p95 < 100 ms sur `jitless`, derrière Caddy** | exigé **avant signature** par A29 (revue sécurité, « ce qui reste dû à Williams », 1) — et à mesurer derrière Caddy, jamais sur `vite preview` | A28 |
| **Critère 07 n° 1 (« sync par mission »)** | **plus un doute** : D-6 est tranché (#102) — afficher l'état, pas synchroniser. C'est un **trou de code**, fermé par **L5e** (`port-sync.ts:164`), **fusionné** (`59a3da2`) — donc la date doit s'afficher | A20/A23, L5e |
| **Invariant 5 (dates ISO brutes, UUID, fuseau d'appareil)** | correctif **L5d**, en PR, non fusionné au 2026-09-09 04h51 | A22/A24/A26 |
| **README de `apps/field`** | ligne 8 de la DoD, non tenue au **4ᵉ passage** | A20 — **et A55** |
| **`@filrouge` allongé du segment L5** | **5ᵉ incrément** : les gestes existent en E2E, hors du parcours cumulatif | A20/A26 |
| **`TRACABILITE_E1-E47.md` et `DECISIONS.md`** | **NB-9-bis, toujours bloquante et aggravée** : 16 titres dupliqués, dernier titre du 2026-09-03, **six incréments de retard** ; 21 doublons dans `DECISIONS.md`. A02 ne signe pas « traçabilité à jour » | A01/A02 |
| **R8, R10, R11 (revue sécurité)** | trois lots à dater, dont **R11** — un asset empreinté absent rend `index.html` en 200 `immutable` un an, « le plus opérationnellement gênant » | A11, à dater |

### Et la charge — pour que P-DESCOPE ne soit pas une surprise le 15/09

- **L6 n'est pas entamé**, et c'est le **seul lot noyau** dans ce cas. Burn-down du 2026-09-08 :
  **≈ 7,4 j restants sur les 26**, dont **L6 ≈ 4,3 j**. « Deux jours à plat : le chantier ne produit
  plus de périmètre, il produit des preuves pour une porte qu'aucun agent ne peut signer. »
- **A20 remesure L6 à ≈ 5,0 j le 2026-09-09** (rapporté par le pilote ; **aucune fiche au dépôt à
  cette heure** — à confirmer avant de s'en servir). **5,0 demandés pour 4,3 disponibles.**
- **L5d et L5e ne sont pas livrés** : deux PR ouvertes, non fusionnées.
- **Conséquence à tenir en main pendant la séance** : elle débloque **P-C**, elle ne règle **pas**
  la charge. D-1 de `PORTE_DESCOPE_2026-09-15.md` — « que fait-on des 4,3 j-h de sync ? » — reste
  entier, et P-DESCOPE est **dans six jours**.

---

## 5. OÙ SE POSE LE VERDICT

Le résultat de cette séance **ne reste pas dans cette fiche**. Il se recopie dans :

**`docs/portes/PORTE_C_<date>.md`**, construit selon 11 §9bis :

1. **les 8 critères du fichier 07 ligne L5, copiés mot pour mot** (pas résumés, pas reformulés) ;
2. **cochés un à un, chacun avec sa preuve** — lien CI, capture, commande, ou ligne de cette fiche ;
3. **le verdict** : GO, ou ÉCHEC avec la liste des critères non tenus ;
4. **la signature humaine** de Williams, datée ;
5. **les réserves** rapportées telles quelles, y compris celles que la séance n'a pas pu lever (§4).

> **Le merge de la porte est conditionné à ce fichier commité** (11 §9bis, CLAUDE.md §7).
> Et si le verdict est ÉCHEC : 09 §4bis — seuls les correctifs des critères non tenus sont autorisés,
> aucun lot suivant ne s'ouvre, **la porte se rejoue EN ENTIER**, jamais « les trois points qui
> manquaient ». Deux échecs consécutifs = arbitrage Williams de type P-DESCOPE.
> **P-C a déjà été refusée deux fois** (veto A02 du 2026-09-06, NO-GO A54 du même jour).

**Trois arbitrages produit se rendent pendant la séance** et se recopient dans le fichier de porte :
le **libellé de la pastille de sync** (V-2.5), **M8** (V-2.6), **« Fin de journée en un geste » face
au mot de passe d'export** (V-7.1) — table §5-B, point 6. **Plus la fiche M10** (V-8.5), qui attend
son ABSORBÉE / PHASE 2 / REFUSÉE (09 §5.9).

**Chaîne de signature après la séance** (09 §1) : la fiche remplie va à **A54** (qui la verse à sa
recette) puis à **A02** (conformité et traçabilité), **A01** (passage en porte), et enfin **Williams**
(la porte). A55 ne signe que le rapport de documentation.

---

## 6. QUESTIONS OUVERTES — à trancher AVANT la séance, jamais pendant

Ces points n'ont pas de geste évident dans le pack. Les improviser le jour même produirait de la
spec par la bande (CLAUDE.md §3). Ils se tranchent avant, ou se déclarent non joués.

1. **Un export de secours produit sur le PC peut-il équiper l'iPad ?** La fixture E2E équipe un
   appareil sans serveur, mais seulement sous Playwright. Si un `.axionbackup` produit sur le PC
   pouvait être restauré sur l'iPad, V-2 à V-9 deviendraient jouables **sans compte de staging**.
   **Personne ne l'a écrit.** À trancher par A20/A01 avant la séance — pas à essayer le jour même.
2. **Un redémarrage forcé d'iPad vaut-il une coupure de courant ?** (V-9.5) Le pack écrit « coupure
   de courant » sans nommer l'appareil ; A02 insiste sur le vidage de cache du système de fichiers.
3. **Que fait-on de « Suivant » à 92 px ?** (V-4.8) A29 refuse un plancher en dur ; A20/A01 décident
   si un jeton nouveau est dû. **Pas une décision de séance.**
4. **`require-corp` : mesure ou acceptation écrite ?** (V-1.5) A29 offre explicitement les deux
   voies. Si aucun Mac n'est disponible, choisir **avant**, et l'écrire.

---

## 7. RECOUPEMENT AVEC LA TABLE §5-B D'A02 — fait le 2026-09-09

`RECOCHE_A02_CRITERE6_2026-09-08.md` §5-B liste **six gestes** qui n'appartiennent qu'à Williams (le
journal du 08 en reprend sept, en ajoutant P-DESCOPE le 15/09). Voici où chacun se joue :

| §5-B | Geste | Où, dans cette fiche |
| --- | --- | --- |
| **1** | La séance matérielle **en une fois** : iPad physique + mode avion réel · coupure de courant · 2ᵉ appareil · session de 45 min · démo écran partagé · les 3 lignes de `LOT_L5.md` §4 · **R-9/R-13 sous les yeux** → **7 des 8 critères** | **V-2 à V-9** — les huit points sont couverts, aucun n'est ajouté |
| **2** | Le **novice humain au chronomètre** → le critère 6 | **V-10** |
| **3** | Le **compte auditeur de test sur staging + son secret** | **§1.3** (prérequis) et **V-0** ; sa moitié ZAP reste hors séance (§4) |
| **4** | **Migrations up/down sur staging** | **hors séance** → §4 |
| **5** | **`ZAP_BLOQUANT='true'` + épinglage du digest** | **hors séance** → §4 |
| **6** | **Trois arbitrages produit** (pastille de sync · M8 · « Fin de journée en un geste »), plus **M10** et **D-8** | **V-2.5, V-2.6, V-7.1, V-8.5** — mis sous ses yeux au bon moment ; **D-8** reste hors séance (§4) |

**Écart de découpage, assumé et dit** : A02 compte les points **par ce qu'ils débloquent** ; cette
fiche les compte **par ce qu'on exécute**. Le point 1 groupe huit gestes qui ne s'exécutent ni au même
moment ni avec les mêmes yeux — d'où **dix vérifications (V-1 à V-10)** et un bloc de prérequis (V-0),
soit **67 lignes cochables**. **Aucun critère n'est ajouté, aucun n'est retiré.**

**Ce qui reste sans source écrite après recoupement** : la remesure de **L6 à ≈ 5,0 j** (A20,
2026-09-09), rapportée par le pilote et sans fiche au dépôt à l'heure où cette fiche est écrite —
**à confirmer avant de la citer dans le dossier de porte**. Tout le reste de ce document est adossé à
un fichier du dépôt, nommé à la ligne où il sert.

---

_Fiche établie le 2026-09-09 par **A55** (documentation, runbook, changelog), en lecture seule sur le
code, et recoupée le même jour contre la table §5-B d'A02 et la revue de sécurité A29. Elle ne coche
rien, ne signe rien et n'ajoute aucun critère : elle met dans l'ordre ce que d'autres ont écrit.
**Toute ligne de cette fiche qui ne se rattache pas à une source citée est un défaut de la fiche, pas
un critère de porte.**_
