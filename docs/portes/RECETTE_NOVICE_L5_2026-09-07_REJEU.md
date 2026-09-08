# RECETTE UX NOVICE — porte P-C — lot L5 — **REJEU INTÉGRAL après correctif R1**

**Agent** : A54 (recette UX novice) · **Date** : 2026-09-07 (seconde passe du jour)
**Base** : branche **`lot/l5b-ancres`**, HEAD **`ef2dea0`** (« docs(l5b): la 4e decision de R1, et la
rectification d'une fiche que j'avais durcie »). **Le correctif n'est pas dans `main`.**
Arbre propre à l'ouverture comme à la clôture. **Aucun commit de ma part.**
**Passe précédente** : `docs/portes/RECETTE_NOVICE_L5_2026-09-07.md` (GO SOUS RÉSERVE, R1 bloquant).

> **Rejeu EN ENTIER, pas la case R1** (09 §4bis). J'ai repassé le parcours novice complet, les six
> sections de la grille §33, les quatre critères §33.7, les invariants 4 et 5, et les six bloquants
> B1..B6 — y compris tout ce qui était vert il y a trois heures. Ce qui suit ne suppose rien de ma
> passe précédente.

---

## VERDICT

> ## GO SOUS RÉSERVE
>
> **R1 est FERMÉ, et je l'ai mesuré moi-même à l'écran** — pas lu, pas déduit d'un test vert. Sur
> l'écran d'entretien terrain, réseau coupé, iPad émulé, **avant tout geste** : les cinq crans
> portent un texte, les trois ancres de banque sont lues, les crans 2 et 4 portent la doctrine, la
> ligne d'ancre ne rend jamais `''`, et le dépliant est ouvert. Les quatre défauts nommés par
> l'arbitrage A01 sont tous fermés. **La fixture E2E a été corrigée** : elle porte désormais une
> question à échelle que la banque accepterait, ce qui rendait mon constat précédent — « le chemin
> des ancres n'est éprouvé nulle part » — caduc.
>
> **Et j'ai exécuté la garde que personne n'avait pu exécuter.** Le brief le disait : le
> `toBeVisible()` de l'E2E iPad est la seule assertion qui morde, et le conteneur porte un
> chromium-1194. **Je l'ai fait tourner : `@critique cotation — les ancres se LISENT avant le
> premier tap (iPad émulé, hors ligne)` est VERT chez moi**, avec 45 autres tests d'écran.
>
> **La réserve, et elle est neuve — c'est mon regard qui la trouve, pas la suite :**
> **N1 — sur iPad PAYSAGE, quatre ancres sur cinq sont sous la ligne de flottaison.** Mesuré au
> pixel dans l'écran d'entretien : le cran 1 est lisible, les crans **2, 3, 4 et 5 exigent de faire
> défiler**, et en défilant l'auditeur perd de vue les pastilles de cotation. **La garde E2E est
> verte quand même** : `toBeVisible()` de Playwright ne vérifie **pas** qu'un élément est dans le
> champ de vision — un nœud à 285 px sous le bord lui est « visible ». C'est **le même angle mort
> qu'`jsdom`, remonté d'un cran** : on est passé de « le DOM ne dit pas si c'est peint » à « le
> navigateur ne dit pas si c'est regardable ».
>
> **Ce n'est pas un retour de R1** — rien n'est caché, rien ne ment, l'auditeur n'est pas bloqué —
> **et ce n'est pas un détail** : c'est le critère nommé de P-C, dans l'orientation que le dépôt
> lui-même a choisie comme référence pour ses tests `@critique`.
>
> **Les quatre points matériels restent non jouables et je les nomme au lieu de les cocher** : iPad
> **physique**, **mode avion réel**, **session de 45 min**, **novice humain au chronomètre**.

---

## 1. CE QUE J'AI EXÉCUTÉ, ET LE PIÈGE QUE J'AI FAILLI RAPPORTER COMME UNE RÉGRESSION

| # | Commande | Résultat |
|---|---|---|
| 1 | `git rev-parse HEAD` · `git status --porcelain` | `ef2dea0` · arbre propre |
| 2 | `pnpm build` (les deux fronts) | **exit 0** — `dist` reconstruit **sur la branche**, 573 Ko, 10 fichiers précachés |
| 3 | Chromium réel (`/opt/pw-browsers/chromium-1194`), parcours à la main, réseau coupé | transcription §3 |
| 4 | Playwright ciblé : `accessibilite-toutes-vues-l5` · `accessibilite-l5a` · `accessibilite-design` · `polices` · `hors-ligne-l5` | **46 tests, 46 verts** |
| 5 | Mesures d'écran au pixel sur `/hq/design` **et** dans l'écran d'entretien terrain, iPad portrait **et** paysage | §4 |

> ### Le piège, écrit parce qu'il aurait fait un faux rapport
> Mes trois premières courses ont rendu **20 échecs**, puis **2**, puis **10**, tous en
> `net::ERR_CONNECTION_REFUSED` sur `127.0.0.1:4173`. **Ce n'était pas le correctif.** Dans ce
> conteneur, Playwright lance `pnpm --filter … preview`, tue le `pnpm` parent en fin de course et
> **laisse l'enfant `vite.js` orphelin** ; la course suivante trouve le port pris, ou voit son
> serveur mourir en plein test. Signature : **les échecs se déplaçaient selon la composition du
> lot** — jamais deux fois les mêmes tests. C'est le symptôme que `playwright.config.ts` décrit
> lui-même en commentaire (« un `vite preview` résiduel, vivant à la sonde et mort pendant la
> course »).
> **Correction déclarée** : j'ai servi moi-même les deux fronts (`setsid`, détachés) et posé
> `reuseExistingServer: true` **dans ma configuration hors dépôt uniquement**. C'est un écart au
> fichier versionné, qui interdit la réutilisation exprès — et la raison de cet interdit est
> qu'un `dist` périmé rendrait la suite verte pour rien. **Je sers le `dist` que je viens de
> construire à l'étape 2, sur cette branche.** Le fichier du dépôt n'a pas été touché.
> **Un rapport qui aurait conclu « le correctif casse 20 tests » aurait été faux, et il aurait
> coûté un tour d'arbitrage.**

**Instruments, déclarés** : une configuration Playwright hors dépôt (binaire chromium-1194,
`reuseExistingServer`) et un transcripteur **sans aucune assertion**, déposé le temps de la passe
pour emprunter la fixture FIL-TPE puis **supprimé** — `git status --porcelain` est **vide** à la
clôture. **Je ne produis aucun code (09 §5.6)** : ces outils mesurent et recopient, ils n'affirment
rien.

**Non exécuté, et je le nomme** : `e2e/pwa-servie.e2e.ts` (exige Docker, absent du conteneur) et la
suite complète (mesure du pilote : `verify:rapide` exit 0, interface 1160/1160, `EchelleAncree`
52/52 — **c'est sa mesure, pas la mienne**).

---

## 2. LES ANCRES DE COTATION — CE QUE J'AI VU, AU PIXEL

### 2.1 — Les quatre défauts de R1 : fermés, un par un

Mesuré dans **l'écran d'entretien terrain**, mission FIL-TPE, **réseau coupé**, iPad émulé,
**avant tout geste sur l'échelle** (aucun `input:checked`, aucun survol, aucun focus) :

```
ligne d’ancre     : « Sélectionnez une note pour voir son ancre. »   (jamais "")
dépliant          : ouvert = true
liste des 5 crans : checkVisibility() = true, hauteur 163 px (portrait)
  cran 1  —  « aucun outil, tout vit sur des carnets et dans les mémoires »
  cran 2  —  [Ancre dérivée] « La note 2 exige au moins un élément établi de l’ancre 3 —
              une note intermédiaire est une ancre entamée, pas une moyenne (doctrine §32.4). »
  cran 3  —  « un outil existe et sert la facturation, mais l’atelier le contourne »
  cran 4  —  [Ancre dérivée] « La note 4 exige au moins un élément établi de l’ancre 5 — … »
  cran 5  —  « l’outil porte le flux de bout en bout, et ses écarts sont revus chaque semaine »
```

| Défaut du 2026-09-07 | État | Preuve |
|---|---|---|
| Rien de visible avant d'avoir coté (survol/focus seuls, inexistants au doigt) | **FERMÉ** | Les cinq crans sont rendus et `checkVisibility() = true` **sans aucun geste**. Vérifié aussi **au doigt** sur `/hq/design` : `isVisible()` de la liste = `true` avant tout tap |
| Les cinq ancres derrière un dépliant **fermé** | **FERMÉ** | `open = true` par défaut (§33.5, « ancres DÉPLIÉES ») ; le `<details>` est conservé pour que l'auditeur récupère la place — il replie, il ne déplie pas |
| Crans 2 et 4 : **ligne vide** | **FERMÉ** | Tap au doigt sur le cran 2 → la doctrine s'affiche, `not.toHaveText('')`. Vérifié par moi dans les deux sens : ligne d'ancre **et** dépliant |
| Sans aucune ancre, l'écran invitait à « voir son ancre » (défaut trouvé au passage) | **FERMÉ** | Repli distinct : « Aucune ancre de cotation n'est fournie pour cette question. » |
| **La fixture E2E portait une `scale_1_5` sans ancres** — état que l'import interdit | **FERMÉ** | Nouveau test `@critique fixture — la question à échelle porte des ancres que la banque ACCEPTERAIT`, qui **lit `ANCRES_REQUISES` dans le pack** au lieu de recopier un seuil. **Exécuté par moi : vert** |

**Les trois copies de repli sont bien distinctes et chacune est juste dans son contexte** — j'ai
vérifié les trois formulations : la ligne de cotation dit « comparez avec les ancres voisines »
(utile là), le dépliant dit « La banque ne fournit pas d'ancre pour ce niveau » (« ci-dessous »
aurait menti à un lecteur déjà dans la liste), et l'absence totale se nomme comme un manque **de la
banque**, pas comme une panne de l'écran. C'est la bonne distinction : un auditeur qui croit son
outil cassé ne remonte pas une question incomplète.

### 2.2 — N1 : sur iPad PAYSAGE, quatre ancres sur cinq sont hors du champ de vision

Le fait, mesuré dans l'écran d'entretien terrain, position verticale de chaque ancre contre la
hauteur de la fenêtre :

| Orientation | Fenêtre | Bas des pastilles 1-5 | cran 1 | cran 2 | cran 3 | cran 4 | cran 5 | Lisible sans défiler |
|---|---|---|---|---|---|---|---|---|
| **iPad portrait** | 1113 px | 745 | 905-926 | 930-972 | 976-997 | 1001-1043 | 1047-1068 | **5 / 5** |
| **iPad paysage** | **810 px** | 562 | 722-764 | **768-894** | **898-961** | **965-1091** | **1095-1158** | **1 / 5** |

En paysage, l'ancre du cran 5 commence **285 px sous le bord de l'écran**. Et la séparation compte
autant que le débordement : les **pastilles de cotation** s'arrêtent à 562, les ancres commencent à
722 — pour lire l'ancre 4 avant de coter 4, l'auditeur défile, et **les pastilles sortent de sa
vue**. §33.3 demande les ancres « **sous le curseur** » précisément pour que ce va-et-vient
n'existe pas.

**Pourquoi le paysage et pas le portrait** : les deux libellés dérivés font **126 px de haut**
chacun (contre 21 px pour une ancre de banque) parce que la citation verbatim de la doctrine fait
139 caractères et passe à cinq lignes dans la colonne étroite du mode privé. La liste passe de
**163 px** (portrait) à **436 px** (paysage). **C'est la citation qui pousse les ancres hors de
l'écran** — les deux sujets que l'arbitrage a traités séparément sont physiquement liés.

**Pourquoi aucune garde ne l'attrape** : `toBeVisible()` de Playwright vérifie qu'un nœud n'est ni
`display:none`, ni `visibility:hidden`, ni de taille nulle. **Il ne regarde pas le viewport.** La
garde `@critique` est donc verte, sincèrement, sur un écran où l'auditeur ne voit qu'une ancre sur
cinq. A29 avait raison sur `jsdom` ; le même angle mort existe un cran plus haut, et **personne ne
l'a encore nommé**.

**Nuance que je dois à l'honnêteté** : en **écran partagé**, le bloc redescend à 438 px et **tout
tient** (bas à 664 sur 810) — les panneaux latéraux disparus rendent la colonne large. Le défaut
est donc dans le mode **privé**, celui où l'auditeur cote. C'est le contraire de ce qu'on aurait
supposé, et c'est pour cela que je l'ai mesuré au lieu de le deviner.

### 2.3 — Les trois questions que le brief me pose nommément

**« La marque *Ancre dérivée* se distingue-t-elle du texte sans la couleur, et sans être collée
au libellé ? » — OUI, vérifié.** Mesuré : `color: rgb(92, 83, 75)` — **exactement la même teinte
que le texte qu'elle qualifie**. La distinction ne doit donc **rien** à la couleur : elle tient à
une **bordure 1 px solide**, une **graisse 600** et une taille de 12 px contre 14. §33.6 est
respecté au sens fort — enlever toute la couleur ne retire aucune information. Et elle n'est pas
collée : le texte relu est « Ancre dérivée La note 2 exige… », avec une vraie espace dans le nom
accessible, pas une marge CSS. Le choix d'un **groupe nominal** (« Ancre dérivée » plutôt que
« dérivé ») est le bon : un lecteur d'écran qui parcourt la liste l'annonce hors contexte.

**« Le dépliant ouvert gêne-t-il la saisie sur une dalle étroite ? » — OUI, en paysage privé
uniquement.** C'est N1, chiffré ci-dessus. En portrait, non : tout tient. En partagé, non.

**« La phrase doctrinale citée est-elle lisible pour un auditeur, ou seulement exacte ? » — mon
avis d'usage, qui est ce qu'on me demande.** Elle est **exacte et coûteuse**. « La note 2 exige au
moins un élément établi de l'ancre 3 — une note intermédiaire est une ancre entamée, pas une
moyenne (doctrine §32.4). » : 139 caractères, une incise, et une **référence de section** dans une
phrase lue debout, chez un client. Trois remarques, dans l'ordre où elles comptent :
① le fragment « **une ancre entamée, pas une moyenne** » est la moitié utile — c'est lui qui corrige
le geste, et A01 a eu raison de refuser la paraphrase qui l'avait perdu ;
② « (doctrine §32.4) » ne dit rien à un auditeur qui n'a pas le pack sous les yeux — c'est une
référence d'éditeur dans un texte d'écran, et elle occupe une ligne entière en colonne étroite ;
③ la répéter **à l'identique** sur les crans 2 et 4 double le coût vertical pour une règle unique.
**Je ne propose pas de rédaction** — l'arbitrage A01 a tranché en faveur de la lettre du pack et ce
n'est pas à moi de le rouvrir. Je constate que **la lettre du pack, rendue deux fois en colonne
étroite, est ce qui produit N1**, et que les deux décisions gagneraient à être relues ensemble.

---

## 3. LE PARCOURS NOVICE, REJOUÉ EN ENTIER

### 3.1 — Appareil vierge, hors réseau (chargement au siège, puis mode avion, puis démarrage à froid)

Identique à ma passe du matin, **sur le nouveau build** : aucune régression.

| Temps | Écran | Observation |
|---|---|---|
| t+0 | `Préparer cet appareil` | deux champs, politique annoncée avant d'être opposée, capacités hors ligne rappelées |
| t+0 | bouton tapé **à vide** | « **Protection non créée — Saisissez un mot de passe pour protéger cet appareil.** » (**B1**) |
| t+0 | court · sans confirmation · confirmation différente | trois refus distincts, saisie conservée (**M5**) |
| t+0,3 | vue d'ouverture | **une seule** pastille « Hors ligne » (**B6**) ; « Cet appareil n'est rattaché à aucun auditeur », **avec son geste** |
| t+0,4 | `Nouvel entretien` | « Auditeur inconnu » **+ bouton Retour** (**B2**) |
| t+0,4 | `Rattacher`, `Restaurer` | atteints et quittés sans impasse |

**Mesures** : `Inter Variable loaded` **hors réseau** ; `html`, `body`, `h1` tous en Inter Variable
(**M7**) ; **aucune requête vers un domaine externe** (sonde sur toutes les requêtes) ; **aucune
cible tactile sous 44×44 px**.

### 3.2 — Journée terrain FIL-TPE (invariant 2 : entreprise fictive), réseau coupé

Rejouée intégralement : agenda → planification → **1 tap** → accord → entretien → cotation →
écran partagé → **Terminer** → note → **validation groupée** → fin de journée. Aucun retour en
arrière imposé, aucune devinette, **aucun contournement cherché**.

---

## 4. GRILLE §33 — REJOUÉE POINT PAR POINT

### §33.1 — Fondations

| Point | Verdict | Preuve |
|---|---|---|
| Inter auto-hébergée, jamais de CDN | **OK** | `.woff2` précachés ; zéro requête externe sur toute ma passe |
| **Police rendue hors ligne** | **OK, mesuré** | Rechargement complet réseau coupé → `Inter Variable loaded` |
| Jeton de police à la racine | **OK** | `getComputedStyle(html).fontFamily` = Inter Variable |
| Aucune couleur en dur (invariant 4) | **OK** | Toutes les valeurs hex vivent dans `tokens.css` / `tokens.ts` |
| **Alerte dans un rouge distinct de l'action** | **OK** | Vérifié à l'écran ; `contraste-usages.test.ts` tient le seuil AA |
| `prefers-reduced-motion` | **OK** | `composants.css` |

### §33.2 — Les quatre états, 12 vues

**12 sur 12.** `axe-core` **exécuté par moi sur les 12 vues** — déverrouillage, stockage, accueil,
nouvel entretien, entretien (×4 dont hors ligne), aujourd'hui (×2), agenda, pilote, fin de journée,
restauration (×2), fin de session, rattachement (×2) : **aucune violation A/AA (2.0 et 2.1)**.
Le compte reste tenu par le **type** (`satisfies Record<CodeVue, …>`) et non par la relecture.

### §33.3 — Terrain

| Point | Verdict | Détail |
|---|---|---|
| Raccourcis complets 1-5 · O/N · A · R · ↵ · ↑↓ · / · E | **OK, joués** | Peints à l'écran ; la touche `3` cote, la touche `E` bascule |
| Touche unique inactive dans un champ de saisie | **OK** | Saisie libre : aucune action déclenchée |
| **Découvrabilité** des raccourcis | **partiel** | Toujours **aucune aide clavier globale** (`?`). Étage 1, proposé deux fois, non traité |
| Swipe horizontal iPad | **non joué** | Il faut un doigt sur du verre |
| **Ancres de cotation visibles** | **OK en portrait · RÉSERVE N1 en paysage** | §2 ci-dessus |
| Micro-indicateur « Enregistré » | **OK, joué** | « Enregistré à 18:21 », **au fuseau de la mission** |
| **Mode écran partagé** | **OK, joué** | Bascule touche `E` + bouton ; nom, notes, à-revoir, recherche, panneaux **et rappels de touches** retirés du rendu. Vérifié sur les deux orientations |
| Fin d'entretien : synthèse en une carte | **OK, joué** | Six compteurs + « Avant de terminer, à savoir » |

### §33.5 — Inventaire et `/design`

**OK.** Douze fiches, garde par le type, `accessibilite-design.e2e.ts` **exécuté : vert**. Les
quatre composants console/scoring restent **déclarés absents avec leur motif**.

### §33.6 — Accessibilité

**axe-core vert sur 12/12** (exécuté) · cibles ≥ 44 px · aucune information portée par la seule
couleur — **y compris la marque « Ancre dérivée »**, dont j'ai mesuré que la teinte est identique
au texte. **Réserve déjà fichée par le dépôt** (étage 1 en attente) : le **nom accessible** n'est
gardé par rien en navigateur réel ; `jsdom` ne le calcule pas et « axe-core vert » ne le dit pas.
Je la confirme et ne la double pas.

---

## 5. JOURNÉE TERRAIN §33.7

| Critère | Verdict | Ce que j'ai fait |
|---|---|---|
| Session planifiée démarrée **en 1 tap** | **OK — JOUÉ** | Un tap sur la ligne du cockpit ouvre l'entretien pré-rempli ; ne reste que l'accord. Le refus a son propre geste |
| **Aucun verrou en session active de 45 min** | **NON JOUÉ** | `sessionActive = 60 min > 45` dans le code. **Je n'ai pas attendu 45 minutes et je ne prétends pas l'avoir fait.** Réserve **M10 toujours ouverte** : une session planifiée **non démarrée** reste à **15 min**, et **aucune fiche `AMELIORATIONS.md` n'a été ouverte** malgré deux propositions |
| « **Fin de journée** » en un geste | **OK sur l'enchaînement — réserve inchangée** | L'écran annonce « Un seul geste » et enchaîne sync → sauvegarde → validation. Il demande **le mot de passe d'export** avant : cela fait **deux**. Doute de spec **toujours non arbitré** |
| **Terminer → note → Valider groupé** | **OK — JOUÉ** | « Terminée, pas encore validée : une note ajoutée maintenant n'est pas une révision » · validation groupée pré-cochée, décochable, avec récapitulatif |

---

## 6. FRANÇAIS, DATES, COULEURS

**Chaînes anglaises : 0.** Quatorze écrans transcrits en texte brut, états d'erreur et gloses
compris.

**Dates en heure serveur ou en forme technique : 2 — les mêmes qu'au matin, inchangées.**

| # | Écran | Ce que l'auditeur lit |
|---|---|---|
| **R2-a** | `finDeJournee:333` | « **Dernier rituel : 2026-09-07T…Z** » — valeur brute de `maintenant()`, **ISO 8601 UTC**, non formatée. Invariant 5 : fuseau de mission à l'affichage |
| **R2-b** | `restauration:360,364` | « Mission : **01920000-0000-7000-8000-000000000001** » (UUID brut) et une date formatée avec `undefined` en fuseau, donc **au fuseau de l'appareil** |

Tout le reste des horodatages est correct, **vérifié avec un décalage réel de 2 h** entre le
serveur (UTC) et le navigateur (`Europe/Paris`).

**Couleurs** : alerte distincte de l'action **OK** · aucune couleur en dur · aucune information
portée par la seule teinte.

**Vocabulaire — inchangé depuis ce matin** : « Retour » (coquille) et « Revenir » (écran) coexistent
sur `finDeSession`, `finDeJournee`, `restauration` · « Terminer l'entretien » / « Fin de session » /
« Terminer la session » pour un acte · « Fin de journée » / « Terminer la journée » · « Avant de
terminer, à savoir » affiché **après** la terminaison · **deux vues nommées « Aujourd'hui »** (M8),
dont l'une s'atteint par un bouton qui promet « Missions et stockage de l'appareil ».

---

## 7. CE QUI RESTE DÛ À UNE MACHINE RÉELLE — nommé, pas coché

1. **iPad PHYSIQUE, mode avion RÉEL, PWA INSTALLÉE.** Non joué. `playwright.config.ts` l'écrit
   lui-même : « les service workers sous iOS ne sont **PAS** couverts par Playwright ». **N1 rend ce
   point plus urgent, pas moins** : mes hauteurs viennent d'une émulation, et une barre Safari, une
   barre d'onglets ou un clavier logiciel **retirent encore de la hauteur** à la dalle.
2. **Session de 45 minutes sans toucher l'écran**, Wake Lock compris (l'API manque avant Safari 16.4).
3. **Le doigt sur le verre** : mes 44 px sont mesurés en viewport.
4. **Le novice humain au chronomètre.** Le critère « < 30 min sans aide » reste **NON CERTIFIÉ** :
   le parcours ne s'interrompt plus, mais je sais lire ce code et mon chronomètre ne vaut rien ici.
5. **L'écran partagé montré à un tiers**, qui confirme qu'il ne voit rien d'interne.
6. **`pwa-servie.e2e.ts`** — Docker absent du conteneur. À rejouer en CI.

---

## 8. CONSTATS — rendus à A20, NON corrigés par moi

| # | Écran | Constat | Sévérité |
|---|---|---|---|
| **N1** | `entretien`, échelle 1-5, **iPad paysage, mode privé** | **4 ancres sur 5 sous la ligne de flottaison** (cran 5 à +285 px), pastilles de cotation hors de vue dès qu'on défile. Cause physique : les deux libellés dérivés font 126 px chacun en colonne étroite. **Aucune garde ne l'attrape** — `toBeVisible()` ne regarde pas le viewport | **réserve neuve, à arbitrer** |
| **N2** | garde `@critique` des ancres | La seule assertion qui morde ne distingue pas « rendu » de « regardable ». Le trou est **connu et documenté pour `jsdom`** ; il ne l'est pas pour Playwright | **méthode** |
| **R2** | `finDeJournee`, `restauration` | Date **ISO UTC brute** et **UUID de mission** à l'écran (invariant 5) | majeur, inchangé |
| **R3** | `vues.ts` | **M8** : deux vues « Aujourd'hui », titre qui bégaie avec le `h1`, bouton dont le libellé ne correspond pas au titre de la vue | majeur, inchangé |
| **R4** | `contexte.tsx` | **M10** : verrou 15 min sur session planifiée non démarrée — **toujours sans fiche**, malgré deux propositions | majeur, inchangé |
| **R5** | `finDeSession`, `finDeJournee`, `restauration` | « Retour » et « Revenir » côte à côte ; trois mots pour l'acte de terminer | mineur |
| **R6** | `finDeSession` | « Avant de terminer, à savoir » affiché **après** la terminaison | mineur |
| **R7** | transverse | Aucune aide clavier globale (`?`) | mineur |
| **R8** | pastille | **M4** : pas de « dernier succès » de sync (§34.2). **Non actionnable avant L6a** | reporté |

---

## 9. PROPOSITIONS D'AMÉLIORATION

**Étage 1** (confort évident, plafonné, hors schéma / API / crypto) :
- Formater « Dernier rituel » au fuseau de mission ; afficher le **titre** de la mission restaurée
  au lieu de son UUID (**R2**).
- Harmoniser « Retour »/« Revenir » et « Fin de journée »/« Terminer la journée » (**R5**).
- « Ce qui reste ouvert » après terminaison (**R6**).
- Aide clavier globale sur `?` (**R7**).

**Étage 2 — fiches `AMELIORATIONS.md`, NON implémentées, arbitrage Williams** :
- **N1** : rendre les cinq ancres lisibles sans défiler en paysage. **Je ne conçois pas la
  solution** — elle touche la mise en page de la zone de cotation et croise l'arbitrage de la
  citation verbatim ; deux décisions rendues séparément doivent être relues ensemble.
- **N2** : une garde qui distingue « rendu » de « dans le champ de vision ». Le dépôt sait déjà
  écrire ce genre de garde (il l'a fait pour `jsdom`) ; la question est de décider qu'elle est due.
- **M10** : suspendre le verrou 15 min dès l'ouverture d'une session planifiée du jour —
  **troisième proposition, toujours pas de fiche**.

---

## 10. DOUTES DE SPEC — pour `DECISIONS.md`, jamais devinés

1. **NOUVEAU — que veut dire « visible » pour une ancre ?** §33.3 dit « sous le curseur ». Le pack
   ne dit pas si une ancre qu'il faut atteindre **en défilant** satisfait le critère. Tant que ce
   n'est pas tranché, N1 est un constat d'usage et **pas** un défaut opposable — et je me refuse à
   décider seul qu'il est acceptable (09 §6).
2. **Deux vues nommées « Aujourd'hui »** (M8) — non arbitré.
3. **Phrase-script de la mention d'information** : lue **à voix haute à un interlocuteur réel**,
   toujours **sans validation juridique**. Elle est en production dans l'écran que j'ai joué.
4. **« Fin de journée en un geste » face au mot de passe d'export** — non arbitré.
5. **Énoncé de la pastille de synchronisation avant L6a** — le mot reste à Williams.

---

## 11. CONFORMITÉ DE MA PROPRE PASSE

- **Zéro fichier de code modifié.** `git status --porcelain` **vide** à la clôture, hors ce rapport.
- **Aucun commit.** Le dépôt de ce fichier est mon seul geste d'écriture ; **le pilote commite.**
- **Rejeu INTÉGRAL** : parcours complet, six sections de la grille, quatre critères §33.7,
  invariants 4 et 5, six bloquants B1..B6, dix majeurs — pas la seule case R1 (09 §4bis).
- **Écarts d'environnement déclarés** : chromium-1194 au lieu de 1234 ; `reuseExistingServer: true`
  dans ma configuration hors dépôt, sur un `dist` reconstruit à l'instant sur cette branche.
- **Aucun contournement « arrangé »** : les 20 échecs de mes premières courses ont été **instruits
  jusqu'à leur cause** au lieu d'être rapportés comme une régression, ou tus comme un aléa.
- **Aucun résultat inventé** : ce qui est « joué » l'a été dans un Chromium réel ; ce qui est
  « mesuré » porte ses chiffres ; ce qui n'est pas jouable est **nommé** au §7.

---

**Signature verdict UX novice : A54 — 2026-09-07 (rejeu) — GO SOUS RÉSERVE.**
**R1 est fermé et mesuré. La réserve N1 (paysage) et le trou de garde N2 sont neufs et rendus à
A20 ; le doute n°1 est rendu à Williams. Les quatre points matériels du §7 restent non signés.**
Remis à **A50**, puis **A02**. Fin d'incrément → **A20** · conformité + traçabilité → **A02** ·
passage en porte → **A01** · porte → **Williams**.
