# RECETTE UX NOVICE — lot L5 (a/b/c + L5d, L5e, sécurité) — porte **P-C** — rejeu intégral n° 3 — 2026-09-09

> **A54, recette UX novice.** Aucun code produit (09 §5.6) ; instruments hors dépôt.
> `git status --porcelain` **vide**, HEAD = `5ac6f95`. Transcription par le pilote.

## VERDICT : 🟢 **GO SOUS RÉSERVE**

**Conditions de la passe** : guidé strict **oui — et cette fois c'est prouvé, pas affirmé**
(`appareil-terrain.ts:234` scelle `profil: 'guide_strict'` dans l'identité chiffrée ;
`auditeur.ts:38` pose `PROFIL_PAR_DEFAUT`) · mode avion **`setOffline(true)`, pas un iPad en vol** ·
sans aide ni documentation **oui** · iPad **émulé** (portrait 835×1113, paysage 1080×810, tactile) +
desktop · build **`5ac6f95`** · **Chromium 1234, la version épinglée** (et non le 1194 du 07) · Docker
présent, **et utilisé**.

---

## 1. Le chronomètre — redit, et ce qui le remplace

> **Je suis un novice simulé qui sait lire ce code. Mon chronomètre ne vaut rien sur ce critère-là, et
> je refuse de le maquiller.** Le « < 30 min sans aide » de 07:24 reste **NON CERTIFIÉ**.

| Substitut mesurable | Mesure |
| --- | --- |
| **Gestes** de l'appareil verrouillé à la première cotation écrite | **18** |
| **Retours en arrière imposés** | **0** |
| **Devinettes** (écran qui n'énonce pas le geste) | **1 — N3** |
| **Contournements à inventer** | **0** |
| **Points d'arrêt** | **1 — N3** |
| **Impasses** | **0** |

---

## 2. Les quatre points matériels — **nommés, pas cochés**

1. **iPad physique, mode avion réel, PWA installée** — non joué. Les hauteurs mesurées sont
   **optimistes** : ni barre Safari, ni clavier logiciel, ni encoche ne sont modélisés, et **tous
   retirent de la hauteur**, donc de la marge de co-visibilité du §4.
2. **Session de 45 minutes** — non joué. `verrou.ts:38` : `sessionActive = 60 min > 45`.
   **« Je n'ai pas attendu 45 minutes et je ne prétends pas l'avoir fait. »**
3. **Le doigt sur le verre** — swipe, cibles de 44 px en viewport.
4. **Le novice humain au chronomètre.**

---

## 3. Grille §33 — section par section, **sous les en-têtes réellement servis**

Fondations **OK** (zéro requête hors `127.0.0.1` sur tout le parcours) · police hors ligne **OK** ·
**4 états 12/12** (compte tenu **par le type**, pas par une relecture ; axe-core sans violation A/AA) ·
raccourcis **OK, joués** (`3` cote, `e` bascule, touche unique **inerte dans un champ**) ·
**découvrabilité KO — R7** (`?` ne produit **rien**, **0** occurrence du mot « raccourci ») · ancres
visibles **OK, N1 fermée** (§4) · « Enregistré » **OK** au fuseau de mission · écran partagé **OK,
joué** · `/design` **OK** · accessibilité **OK**.

**Les quatre combinaisons ont été jouées** : deux orientations × privé/partagé.

---

## 4. N1 — fermée, mesurée par A54 lui-même : **20 cas sur 20**

| Combinaison | Crans avec position **regardable** | Le pire cran |
| --- | --- | --- |
| portrait, privé | **5 / 5** | cran 5 à 40 px |
| portrait, partagé | **5 / 5** | tout à 0 |
| paysage, privé | **5 / 5** | cran 5 à 496 px |
| paysage, partagé | **5 / 5** | cran 5 à 64 px |

La barre scindée **se voit dans la mesure** : les cinq outils ne recouvrent plus rien.

**Ce qu'il a cherché de neuf, et que personne n'avait mesuré.** Le critère A01 est *un cran à la fois*.
Mais §33.3 demande de **comparer les ancres voisines** avant de coter — donc de voir les pastilles **et
les cinq ancres ensemble**. Balayage de toutes les positions, occlusion comprise :

```
PASTILLES + LES CINQ ANCRES ENSEMBLE — paysage privé   : 22 positions, la 1re à 496 px
PASTILLES + LES CINQ ANCRES ENSEMBLE — paysage partagé : 10 positions, la 1re à  64 px
```

**Ça tient.** Constat négatif rendu tel quel : *« la réserve que j'allais poser n'existe pas »*.

**Sur le « 169 px » du brief** : *« je ne retrouve pas ce chiffre, et je ne le recopie pas »*. Mesure au
cran 5, paysage privé, position regardable : pastilles 247→321, ancre 686→728, fenêtre 810, **rien ne
recouvre**. Le critère est tenu ; l'écart tient à une autre définition de la marge.

**N2 fermée** — l'instrument distingue « rendu » de « regardable », nomme les collants, rend le
débordement en pixels.

---

## 5. Invariant 5 — vérifié avec **trois fuseaux distincts**, pas deux

La passe du 07 tournait mission = appareil = `Europe/Paris` : elle **ne pouvait pas** distinguer les
deux. Appareil mis en **`Pacific/Auckland`** — trois réponses possibles, donc une seule lecture :

| Fait | À l'écran | Verdict |
| --- | --- | --- |
| Dernier succès (`2026-09-08T22:30Z`) | « dernière synchronisation réussie le **09/09/2026 00:30** » | **fuseau de la MISSION** — ni l'appareil (10:30), ni UTC (22:30) |
| Mission jamais synchronisée | « **jamais synchronisée depuis cet appareil** » | conforme §34.2, mot pour mot |
| « Enregistré » | « Enregistré à **06:54** » | **fuseau de la MISSION** (appareil : 16:54) |

**R8 fermée, lue à l'écran, pas déduite d'un test. R2 fermée** : sur quatorze écrans transcrits, **0 date
ISO brute, 0 UUID nu, 0 chaîne anglaise**.

> **Réserve d'honnêteté d'A54** : l'écran de restauration **après restauration réussie** a été vérifié
> **en source**, pas à l'œil — c'est l'un des deux scénarios que sa machine ne peut pas jouer (§9).

**Le seul UUID vu à l'écran** est dans le nom du fichier de sauvegarde — **ce n'est pas un défaut** :
l'exception est arbitrée, nommée, bornée et éprouvée. *« Je l'ai vérifiée plutôt que de la signaler à
tort. »*

---

## 6. Journée terrain §33.7

Session planifiée **en 1 tap : OK, joué** · **verrou 45 min : NON JOUÉ** (`sessionActive = 60 min`,
*« je n'ai pas attendu 45 minutes »*) ; M10 a désormais **sa fiche**, la substance attend Williams ·
**« Fin de journée » : OK sur l'enchaînement, doute inchangé** — l'écran annonce « Un seul geste » mais
exige un mot de passe **avant** : cela fait deux, **et N3 en montre le coût** · Terminer → note →
Valider groupé **OK**.

---

## 7. **N3 — le constat neuf** : « Votre mot de passe » n'est pas celui qu'on croit

Trouvé **en jouant le geste au lieu de le relire**. Sur *Fin de journée*, le champ est libellé :

> **Votre mot de passe** — *Il chiffre le fichier de sauvegarde. C'est lui, et lui seul, qui permettra
> de le rouvrir — y compris sur un autre appareil.*

**Un novice lit une création** : on lui décrit le rôle d'un mot de passe qu'il choisit. A54 a fait
exactement cela. Réponse de l'application, **après la dérivation Argon2id** :

> « **Ce mot de passe n'est pas celui de cet appareil.** Aucune sauvegarde n'a été produite […] »
> « **Aucune sauvegarde produite ce soir** — Vos données de collecte n'ont quitté cet appareil d'aucune
> façon ce soir. »

- **Aucun des deux écrans** qui demandent ce mot de passe n'écrit « **celui de cet appareil** ».
- Le seul endroit où l'auditeur l'apprend est **le message d'échec**.
- **La conséquence est celle que l'invariant 8 protège** : la journée se termine **sans sauvegarde**.

**Non bloquant** — le refus est clair, il explique *pourquoi*, et le rappel reste actif. Défaut de
**libellé**, donc **étage 1**. L'autre branche a été vérifiée : avec le bon mot de passe, le fichier est
produit hors ligne, **zéro violation CSP**.

---

## 8. Sécurité #112 — ce que la CSP resserrée pouvait casser ailleurs

Les gardes d'écran du dépôt tournent sous `vite preview`, **qui ne pose aucun de ces en-têtes**. A54 a
donc monté **le vrai Caddy** (image du `Dockerfile`, `Caddyfile` du dépôt, les `dist/` qu'il venait de
construire) et fait tourner les tests d'écran **contre lui**.

| Éprouvé sous les en-têtes réels | Résultat |
| --- | --- |
| 12 vues × 4 états + axe-core, polices, ancres, hors-ligne | **44 passés**, 2 échecs d'environnement (§9) |
| en-têtes servis, PWA servie, `/design`, budget chiffrement, socle | **159 passés, 0 échec** |
| **Le parcours novice entier**, deux orientations, privé + partagé | **`csp=[] erreurs=[] externes=[]`** |
| **Export de secours chiffré** (`blob:`) — le geste que `default-src 'self'` + COEP pouvaient casser sans bruit | **fichier produit**, `csp=[]` |

**Rien ne casse à l'écran. 203 tests verts sous en-têtes réels.**

**Saisie photo** : le bouton s'annonce « **Photo (bientôt)** » avec un geste de substitution motivé
(« une photo prise hors de l'application sort du coffre chiffré et de la sauvegarde de secours »).
Manque **connu, tracé, attribué**. *« Pour un novice c'est un cul-de-sac honnête, pas un piège. »*

---

## 9. Ce qu'A54 n'a **pas** pu exécuter — instruit jusqu'à la cause

Deux tests `@critique` échouent **sur sa machine**, aux deux orientations de serveur, reproductibles sur
trois courses : la **coupure brutale** et l'**export restauré sur un second profil**. Cause : eux seuls
utilisent `launchPersistentContext` (profil **sur disque**, exigé par le critère) ; sous Windows, le
service worker n'atteint jamais `activated` dans un profil persistant.

**Vérifié plutôt que supposé** : la CI les exécute **verts sur cette base** — 3,2 s et 5,6 s contre un
délai de 60 s. **Écart d'environnement, pas de produit.**

> **Conséquence honnête pour P-C** : le critère « export créé puis restauré sur un 2ᵉ appareil » est
> tenu **par la CI sur Linux**, pas par l'œil d'A54, et **pas encore sur un second iPad physique**.

---

## 10. État des réserves

| # | Objet | État |
| --- | --- | --- |
| **R1** ancres illisibles | **FERMÉE** — re-vérifiée |
| **N1** ancres sous la ligne | **FERMÉE** — 20/20, occlusion comprise |
| **N2** `toBeVisible()` aveugle | **FERMÉE** |
| **R2** ISO, UUID, fuseau | **FERMÉE** — trois fuseaux distincts |
| **R8** dernier succès | **FERMÉE** — au fuseau de la mission, **lue à l'écran** |
| **R3** M8, deux vues « Aujourd'hui » | **OUVERTE** — `accueil` **et** `aujourdhui` portent le même titre ; le bouton « Missions et stockage » mène à un écran titré « Aujourd'hui ». **Doute produit, non arbitré** |
| **R4** M10, verrou 15 min | **fiche POSÉE** ; substance → Williams |
| **R5** vocabulaire | OUVERTE — étage 1, gelée |
| **R6** « Avant de terminer » | **À REQUALIFIER — A54 la retire lui-même** : vu à sa bonne place ; il n'a pas rejoué l'après-terminaison |
| **R7** aide clavier `?` | OUVERTE — étage 1, gelée |
| **N3** libellé du mot de passe | **NEUVE** — étage 1 |

**Aucun constat bloquant.** *« Rien n'arrête l'auditeur, rien ne ment, aucun contournement n'a été
nécessaire. »*

---

## 11. Propositions

**Étage 1** : N3 (dire « le mot de passe **de cet appareil** » sur les deux écrans) · R5 (harmoniser
Retour/Revenir) · R7 (aide clavier sur `?`).
**Étage 2, fiches, non implémentées — arbitrage Williams** : M10 (fiche posée) · **R3** (nommer les deux
vues « Aujourd'hui » — touche la navigation, donc pas étage 1).

## 12. Doutes de spec — jamais devinés

1. **R3** — deux vues portent le même titre : voulu ?
2. **« Fin de journée en un geste » face au mot de passe** — non arbitré, **et N3 en montre le coût réel :
   le geste supplémentaire est aussi celui qui peut échouer.**
3. **L'énoncé de la pastille de sync** avant L6a — le mot reste à Williams.
4. **La phrase-script de la mention d'information**, lue à voix haute à un interlocuteur réel :
   toujours **sans validation juridique**, et en production dans l'écran joué.

---

```
Signature verdict UX novice : A54 — 2026-09-09 — GO SOUS RÉSERVE.
Réserve : R3 non arbitrée · R4 en attente de Williams · N3 neuve · les quatre points matériels
non signés, dont le « < 30 min sans aide » qu'aucune mesure ne remplace.
git status --porcelain vide · HEAD 5ac6f95 · zéro fichier du dépôt modifié · conteneurs retirés.
```
