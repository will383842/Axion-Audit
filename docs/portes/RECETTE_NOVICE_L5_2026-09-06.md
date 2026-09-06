# RECETTE UX NOVICE n°1 — porte P-C — lot L5 (L5a + L5b + L5c)

**Agent** : A54 (recette UX novice) · **Date** : 2026-09-06
**Base** : `origin/lot/l5c` — `8f93660` (« Merge branch 'main' into lot/l5c »).
**L5c n'est PAS dans `main`** au moment de cette passe (`origin/main` = `4dd1349`) : la PR #52
est encore en file. La recette porte donc sur la branche, et devra être **rejouée telle quelle
après la fusion** si le merge introduit autre chose qu'un fast-forward.
**Worktree** : `C:/Users/Will/Documents/_axnovice` (détaché, aucun commit).

---

## VERDICT

> ## NO-GO
>
> Le critère « novice < 30 min sans aide » n'est **pas mesurable** dans cet environnement, et il
> est **NON TENU sur la partie que j'ai pu jouer** : le novice est arrêté à **t+1 min** par un
> message d'erreur qui lui dit le contraire de la vérité, et **définitivement bloqué à t+3 min**
> sur un écran sans sortie. La grille §33 a **six manquements** dont trois se voient au premier
> écran.
>
> Ce NO-GO ne porte pas sur la qualité du code — elle est haute, et les tests le montrent. Il
> porte sur ce que **voit** quelqu'un qui n'a pas écrit ce code.

---

## 1. CE QUE J'AI RÉELLEMENT EXÉCUTÉ (commandes et sorties)

| # | Commande | Résultat |
|---|---|---|
| 1 | `git worktree add C:/Users/Will/Documents/_axnovice --detach origin/lot/l5c` | OK — `8f93660` |
| 2 | `pnpm install` | OK — `Done in 46s using pnpm v9.15.9` |
| 3 | `pnpm build` | **OK, exit 0** — `apps/field/dist` produit |
| 4 | `npx vitest run --project unit --project interface` | **103 fichiers, 2151 tests, 0 échec.** Exit code 1 dû à **une seule** « Unhandled Error : `[vitest-worker]: Timeout calling "onTaskUpdate"` » — un dépassement du rapporteur IPC sous ma machine lente (durée 249 s), **pas un test rouge**. À rejouer en CI pour lever le doute. |
| 5 | `npx vite preview --port 4319` + navigateur **Chromium réel** (Playwright 1.62.1, installé) | Application **ouverte et pilotée à la main**, en 1440×900 puis 1024×768 tactile |

> Note de méthode : `npx vitest run` lancé depuis `apps/field` **fabrique 161 faux échecs**
> (`ReferenceError: document is not defined`) — la configuration des projets vit à la racine.
> Je l'écris parce que c'est le piège exact où une recette pressée conclurait à une régression.
> La bonne invocation est celle de la ligne 4.

**Ce que j'ai pu jouer** : le premier démarrage d'un appareil neuf, la création de la protection,
l'écran d'accueil, la tentative de « Nouvel entretien », la restitution de la police, les cibles
tactiles, les jetons de couleur, l'inventaire des 4 états, les raccourcis, le mode écran partagé.

**Ce que je n'ai PAS pu jouer, et pourquoi** : sans API, **aucune mission ne peut être embarquée**
et **aucune identité d'auditeur n'existe** sur l'appareil. Le cockpit « Aujourd'hui » (§34.2),
l'entretien, la journée terrain §33.7 et la fin de journée sont **structurellement inatteignables**
dans un poste hors ligne neuf. Je ne les ai donc **pas** notés d'après le code : ils sont en §5,
« ce qui reste dû à une machine réelle ».

---

## 2. LE PARCOURS, CHRONOMÉTRÉ, LIBELLÉ PAR LIBELLÉ

### t+0 min — j'ouvre l'application

Écran : titre d'en-tête **« Préparer cet appareil »**, encart **« Première utilisation de cet
appareil »**, un champ **« Mot de passe* »**, un bouton **« Créer la protection de cet appareil »**.

C'est propre, c'est en français, et le texte est rassurant. Deux choses me font hésiter :

- Rien ne me dit **quel produit** j'ouvre ni **pour quelle mission**. Le titre de la page est
  « Axion Audit — Terrain » (onglet), invisible en PWA plein écran.
- Le champ est **seul**. On me dit « il ne peut pas être récupéré : sans lui, les données de cet
  appareil resteront illisibles » — et on ne me demande **pas de le confirmer**. Je tape un mot de
  passe de 16 caractères sur un clavier virtuel d'iPad. Une faute de frappe et l'appareil est mort.

### t+1 min — CONSTAT BLOQUANT n°1 : on me dit que mon mot de passe est faux avant que j'en aie un

Je tape le bouton sans avoir rempli le champ — le geste le plus banal du monde. Réponse, **observée,
mot pour mot** :

> **Déverrouillage impossible**
> **Mot de passe incorrect. Aucune donnée locale n'a été modifiée.**

Sur un écran qui s'appelle **« Première utilisation de cet appareil »** et dont le bouton dit
**« Créer la protection »**, l'application m'annonce que **je me suis trompé de mot de passe**.

Ce que j'ai cherché : quel mot de passe. Ce que j'ai deviné : que quelqu'un avait déjà préparé
l'iPad et ne m'avait pas donné le code. Un auditeur novice, chez le client, à 8 h 55, appelle le
siège. **C'est le pire message de tout le parcours, et il est sur le tout premier écran.**

**La formulation qui aurait levé le doute** :
> « Saisissez un mot de passe pour protéger cet appareil. »

et, tant qu'à faire, le bouton grisé avec cette phrase en aide sous le champ.

### t+2 min — j'ai mon accueil, et deux pastilles se contredisent

Capture réelle (1024×768). En haut : **« En attente de synchronisation »**. Trois centimètres plus
bas, sur le même écran : **« Hors ligne »**.

Vérification dans le code :
- la pastille de l'en-tête (`PastilleSyncCoquille`) est pilotée par `navigator.onLine` seul ;
- celle de l'accueil (`EcranAccueil`) est pilotée par **le nombre d'opérations en attente** :
  `etat={(resume?.operationsEnAttente ?? 0) > 0 ? 'en-attente' : 'hors-ligne'}`.

Donc : **outbox vide ⇒ l'application affiche « Hors ligne », quel que soit le réseau.** Et
l'en-tête affiche « En attente de synchronisation » alors que le port de sync est **inerte** et
qu'il n'y a **rien** à synchroniser. Les deux sont fausses, et elles sont fausses en sens
contraire. La note de conception interdisait nommément « la pastille qui annonce plus qu'elle ne
fait » ; la pastille de coquille, ajoutée le 2026-09-05, la réintroduit sur **tous** les écrans.

Effet novice : la seule question que l'invariant 8 m'oblige à me poser chaque soir — *« mes données
sont-elles sorties de cet appareil ? »* — reçoit deux réponses opposées, et aucune n'est vraie.

### t+2 min — l'écran me promet une chose que le produit ne fait pas

Toujours sur l'accueil, encart **« Ce que cet appareil sait faire sans réseau »** :

> • Mener un entretien et enregistrer chaque réponse
> • **Prendre des notes, des notes volantes et des photos**
> • Retrouver n'importe quelle question du questionnaire figé

`apps/field/src/app/EcranAccueil.tsx:109`. **La capture photo n'existe pas** — c'est acquis et
tracé. Ce qui ne l'est pas, c'est que la liste du **cockpit** a été corrigée (majeur M6 de la revue
A29 : la mention « Photographier » y a été retirée avec un commentaire explicite) et que **la liste
de l'accueil L5a ne l'a pas été**. Le mensonge a été réparé à un endroit sur deux.

**Effet sur le parcours novice — c'est la question posée, et voici la réponse :**
le manque de photo n'est pas vécu comme « une fonction en moins ». Il est vécu comme **une panne
de l'application, et comme une faute de l'auditeur**. Enchaînement, tel qu'il se produira :

1. Au premier écran, on lui promet qu'il peut photographier hors réseau. Il le croit — c'est
   **écrit par le produit**, et il n'a pas de documentation (guidé strict, sans aide).
2. En entretien, l'interlocuteur lui montre un tableau de suivi papier, un écran d'ERP, une étiquette
   machine. Il cherche le geste. Il trouve, dans la barre d'actions de la question, un bouton
   **« Photo »** — **grisé, sans un mot d'explication visible**. Le motif (« disponible dans une
   prochaine version ») est dans `libelleAccessible`, c'est-à-dire dans l'`aria-label` : **un
   utilisateur voyant ne le lit jamais**, aucune infobulle, aucun message au clic.
3. Il en conclut ce que tout le monde conclut devant un bouton grisé sans raison : *« je n'ai pas
   le droit »*, ou *« l'application est cassée »*. Devant son interlocuteur, il n'insiste pas.
4. Il fait ce que fait n'importe quel auditeur : **il prend la photo avec son téléphone
   personnel**. La pièce d'audit sort du coffre chiffré, sort de la sauvegarde de secours, sort de
   l'invariant 8, et entre dans une pellicule privée — avec, très probablement, un écran de gestion
   nominative dessus.

Le coût réel du manque n'est donc pas ergonomique, il est **RGPD et probatoire**, et il est
**créé par la promesse**, pas par l'absence. Un produit qui ne promet rien ne produit pas ce
contournement.

**Ce qu'il faut, tout de suite, sans attendre la fonction** : retirer « et des photos » de la ligne
109, et rendre le motif du bouton **visible** — libellé `Photo (bientôt)` et une infobulle, ou le
bouton retiré. Un bouton grisé muet est le contraire de la doctrine §19.1 (« jamais un simple
cadenas muet »), appliquée ici à un geste au lieu d'un verrou.

### t+2 min — deux états vides empilés, et un conseil qui se contredit lui-même

Sur le même écran, l'un sous l'autre :

> **Aucune mission sur cet appareil** — « Le téléchargement d'une mission arrive avec la
> synchronisation. »
> *(bouton « Nouvel entretien »)*
> **Aucun entretien en cours sur cet appareil** — « Démarrez-en un avec « Nouvel entretien » :
> trois champs suffisent, le reste est optionnel. »

Le premier me dit que je ne peux rien faire. Le second me dit que je peux commencer tout de suite.
Le bouton est **entre les deux**, rattaché visuellement à aucun. §33.2 demande *un* état vide « qui
dit quoi faire » ; j'en ai deux, qui disent l'inverse l'un de l'autre.

### t+3 min — CONSTAT BLOQUANT n°2 : je suis le conseil, et je tombe dans un cul-de-sac sans sortie

Je fais ce qu'on me dit : je tape **« Nouvel entretien »**. Écran obtenu, **observé** :

> **Nouvel entretien**
> Trois champs. Tout le reste se fait pendant l'entretien, ou après.
> **Auditeur inconnu sur cet appareil**
> Aucune identité d'auditeur n'est enregistrée ici : un entretien doit avoir un propriétaire, et
> l'application ne l'invente pas.
> Connectez-vous une fois au siège depuis cet appareil, puis revenez ouvrir l'entretien.

Deux problèmes, et le second est le blocant.

1. L'écran annonce **« Trois champs »** et n'en affiche **aucun**. Le titre promet, le corps refuse.
2. **Il n'y a aucun bouton pour en sortir.** Boutons présents sur la page, relevés à l'écran :
   `"Verrouiller"`. C'est tout. Le seul geste offert à l'auditeur bloqué est de **verrouiller son
   appareil**.

Vérification : dans `EcranNouvelEntretien.tsx`, l'état `vide / « Aucune mission sur cet appareil »`
porte bien un bouton `Revenir à l'accueil` — mais l'état `erreur / « Auditeur inconnu »` (celui que
j'atteins) et l'état `vide / « Aucune unité dans cette mission »` n'ont **pas** d'`actions`.

Et il n'y a **pas de bouton retour dans la coquille**. `navigation.ts` définit `peutRevenir()` et
documente en toutes lettres « *le bouton « retour » de l'en-tête s'y règle* » — mais l'en-tête de
`App.tsx` ne contient que le titre, les indicateurs et « Verrouiller ». `peutRevenir` n'est
consommé **que** par le geste retour système. En navigateur, la flèche du navigateur me sauve. **En
PWA installée sur iPad en plein écran, cette flèche n'existe pas** : l'auditeur est enfermé.

Même cul-de-sac sur **« Où en est la mission »** (`EcranPilote`) : le seul bouton qu'il offre
enfonce plus loin (`vue: 'agenda'`), aucun ne remonte.

> **C'est ici que ma recette s'arrête.** Sans API, l'identité d'auditeur ne peut pas exister sur
> l'appareil, donc aucune mission, donc aucune session, donc **ni entretien, ni journée terrain
> §33.7**. Je ne les note pas : je les renvoie en §5.

**Durée de la portion jouée : 3 minutes.** Le critère **< 30 min est NON TENU** — non parce que
j'ai dépassé, mais parce que le parcours **s'interrompt** et qu'un novice sans aide ne peut pas le
reprendre.

---

## 3. GRILLE §33, POINT PAR POINT

### §33.1 — Fondations

| Point | Verdict | Preuve |
|---|---|---|
| Inter variable **auto-hébergée**, jamais de CDN | **OK** | `apps/field/dist/assets/inter-latin-wght-normal-*.woff2` + `inter-latin-ext-*.woff2` présents ; `sw.js` les précache. Aucune requête réseau externe. |
| Police **effectivement peinte** (navigateur réel) | **OK, mesuré** | `document.fonts` → `Inter Variable 100 900 loaded` ; `getComputedStyle(h1).fontFamily` = `"Inter Variable", Inter, system-ui…` ; captures visuellement sans empattement. |
| Jeton appliqué à la racine du document | **KO mineur** | `getComputedStyle(document.documentElement).fontFamily` = **`"Times New Roman"`**. `html` et `body` ne portent aucune `font-family` ; seul `.axn-coquille` la pose (`coquille.css:20`). Aucun texte visible n'est en serif aujourd'hui (aucun portail hors coquille — vérifié : zéro `createPortal`), donc **latent**. Le premier dialogue rendu hors de la coquille s'affichera en Times. |
| Aucune couleur en dur (invariant 4) | **OK** | Toutes les valeurs hexadécimales du dépôt vivent dans `packages/ui/src/tokens.css` / `tokens.ts`. Zéro hex ailleurs dans `apps/field/src` et `packages/ui/src`. |
| **Alerte dans un rouge distinct de l'action** | **OK** | `alerte #8c0a33` vs `action/terracotta #c24a1b` ; écart de teinte et de luminosité contrôlé par `tokens.test.ts`. Vu à l'écran : l'encart d'erreur est bien d'un rouge froid, le bouton principal d'un terracotta chaud. Aucune confusion possible. |
| `prefers-reduced-motion` | **OK** | `composants.css:167` et `:484`. |

### §33.2 — Les quatre états, écran par écran

11 vues déclarées dans `vues.ts`.

| Écran | chargement | vide | erreur | hors ligne | Verdict |
|---|---|---|---|---|---|
| `deverrouillage` | — | s.o. | ✔ (`Message ton="alerte"`) | pastille coquille | **partiel** — et son message d'erreur est **faux** (constat n°1) |
| `stockage` | ✔ | s.o. | ✔ (`avertissement`) | pastille coquille | partiel |
| `accueil` | ✔ | ✔ ×2 | ✔ | ✔ (liste de capacités, **mensongère**) | **KO — deux états vides concurrents** |
| `nouvelEntretien` | ✔ | ✔ ×2 | ✔ | pastille seule | **KO — 2 états sur 4 sans issue** |
| `entretien` | ✔ | ✔ ×2 | ✔ | ✔ | **OK** |
| `aujourdhui` | ✔ | ✔ | ✔ | ✔ | **OK** (non atteint, lu) |
| `agenda` | ✔ | ✔ | ✔ | pastille seule | partiel |
| `pilote` | ✔ | ✔ | ✔ | pastille seule | partiel — **sans sortie** |
| `finDeJournee` | ✔ | ✔ | ✔ | pastille seule | partiel |
| `finDeSession` | ✔ | ✔ | **ABSENT** | pastille seule | **KO — voir ci-dessous** |
| `restauration` | ✔ | ✔ | ✔ | ✔ | **OK** |

**`finDeSession` — l'erreur déguisée en vide, et c'est grave.** Dans `EcranFinDeSession.tsx`, la
lecture de la session est enveloppée dans un `catch { return null; }`, et `null` est rendu comme
l'état **vide** :

> **Aucune session ouverte** — « Ouvrez une session depuis votre journée, puis revenez ici pour la
> terminer ou la valider. »

Une **panne de lecture du stockage local** annonce donc à l'auditeur que **son entretien n'existe
pas**. Il vient de passer 45 minutes dessus. §33.2 sépare « vide » et « erreur » précisément pour
que ce message-là ne puisse pas se produire, et l'écran d'à côté (`EcranAujourdhui`) fait
exactement la bonne chose avec le même motif (`undefined` = chargement, `null` = échec, deux états
distincts, commentaire à l'appui). C'est une incohérence entre deux écrans du même incrément.

**Bilan : 4 écrans sur 11 tiennent les 4 états ; 3 sont KO ; 4 sont partiels** (état hors ligne
réduit à la pastille de coquille, sans le « rappel des capacités locales » que §33.2 demande).

### §33.3 — Terrain

| Point | Verdict | Détail |
|---|---|---|
| Raccourcis **complets** 1-5 · O/N · A · R · ↵ · ↑↓ · **/** · E | **OK** | `session/raccourcis.ts` : les huit y sont. |
| Règle V2.8 : touche unique inactive **dans** un champ de saisie ; Échap rend le focus | **OK** | `estChampDeSaisie()` couvre `textarea`, `select`, `contentEditable`, `input` de 12 types, plus le marqueur `data-saisie-libre="vrai"` du design system. Taper « Rien à signaler » ne déclenche rien. |
| **Découvrabilité** des raccourcis | **partiel** | Les libellés portent leur touche (`À revoir (R)`, `N/A (A)`, `Recherche (/)`, `Suivant (↵)`, `touche 3`, `touche E`) — mais **seulement si `pointeurFin`**, et il n'existe **aucune aide clavier globale** (pas de `?`, pas de panneau). Un novice au clavier découvre les raccourcis en survolant, pas en cherchant. Étage 1. |
| Swipe horizontal iPad | **OK** (code) — non joué | `useBalayageHorizontal`, branché sur la zone centre. |
| **Ancres de cotation VISIBLES** sous le curseur | **OK** (code) — non joué | `SaisieReponse` → `lireAncresDeCotation(question.guidanceSnapshot)` → `EchelleAncree ancres={…}` ; `ZoneQuestion` retire délibérément les ancres de la prose pour ne pas les doubler. Le composant a ses tests dédiés « les ancres sont VISIBLES, y compris au clavier ». **À confirmer à l'œil sur données réelles** — §5. |
| Micro-indicateur « **Enregistré** » | **OK** (code) — non joué | `IndicateurEnregistrement` dans l'en-tête d'entretien, allumé **après** l'écriture. |
| **Mode écran partagé** (bascule, touche E, bandeau permanent) | **OK** (code) — non joué | `BandeauPartage` `role="status" aria-live="polite"`, libellés « Écran privé — les éléments internes sont visibles » / « Écran partagé — les éléments internes sont masqués ». En mode partagé : nom de l'interlocuteur, notes, notes volantes, à-revoir, N/A, non-communiqué, recherche, panneaux latéraux et pastille de sync sont **tous** retirés du rendu (`!partage &&`), pas seulement masqués en CSS. C'est la bonne façon. |
| Type `table` rendu en liste sur tactile | non vérifié | Hors de portée sans questionnaire. |
| Fin d'entretien : synthèse en une carte | **OK** (code) | `CarteSyntheseEntretien` : répondu / à revoir / N/A / non communiqué / notes / pièces. |

**Réserve d'ergonomie sur la fin d'entretien, et elle compte pour le novice.**
Dans l'écran d'entretien, il n'existe **aucun bouton « Terminer »**. Sur la dernière question,
« Suivant » est **grisé** et le seul geste restant est **« Quitter l'entretien »** — un libellé qui
dit *abandonner*, pas *finir*. Le geste « Terminer la session » vit sur la **ligne du cockpit**
(décision de découpage L5b/L5c assumée et documentée). Le novice qui vient de poser sa dernière
question doit donc deviner que « quitter » est le bon geste, revenir au cockpit, retrouver sa ligne
et taper un second bouton. C'est exactement le « retour en arrière » que la porte P-C mesure.
**Formulation qui lèverait le doute** : sur la dernière question, remplacer le « Suivant » grisé par
un bouton principal **« Terminer l'entretien »** qui mène à `finDeSession`.

### §33.5 — Inventaire `packages/ui`

Présents et exportés : `ÉchelleAncrée`, `SegmenteONA`, `SaisieFourchette`, `PastilleSync`,
`BandeauPartage`, `AnneauProgression`, `CarteSyntheseEntretien`, `ÉtatVide`, `ÉtatErreur`,
`ÉtatHorsLigne`, `ZoneEtat`, `Squelette`, plus la base shadcn.
`TimelinePilote`, `Radar`, `Heatmap`, `CourbePrévuRéel` **absents** — l'index l'écrit et le motive
(console / scoring, L7-L8 ; les construire ici serait du code orphelin au sens de l'étape 6).
**Je prends l'argument** : ce n'est pas un écart de P-C, c'est un report explicite.
**En revanche, la page `/design` exigée par §33.5 (« Chacun : états complets + exemple sur
/design ») n'existe nulle part** — aucun fichier, aucune route. C'est un manquement réel de §33.5.

### §33.6 — Accessibilité

Focus visible, `prefers-reduced-motion`, `role="toolbar"` sur les actions de question, `aria-pressed`
sur les bascules d'état, `role="alert"` réservé (et une doctrine écrite pour n'en avoir jamais deux
sur un même fait). **Cibles tactiles : mesurées à l'écran, aucune sous 44×44 px** en 1440×900 et en
1024×768 tactile, sur les écrans atteints. `axe-core` : non joué par moi.

**Écart §33.6 relevé** : « libellés explicites sur toute icône seule » — le bouton **Photo** porte
son explication dans `libelleAccessible` uniquement. Un lecteur d'écran l'entend ; un auditeur
voyant, non. L'information n'est pas portée par la couleur, elle est portée par **rien**.

---

## 4. JOURNÉE TERRAIN §33.7 — CE QUE JE PEUX DIRE, ET CE QUE JE NE PEUX PAS

Aucun de ces quatre points n'a pu être **joué** : il faut une mission embarquée et une identité
d'auditeur, donc un serveur. Je donne l'état du code, et je les renvoie **tous les quatre** à la
recette sur machine réelle.

| Critère §33.7 | Lu dans le code | Joué |
|---|---|---|
| Session planifiée démarrée **en 1 tap** | Plausible : taper la ligne du cockpit ouvre l'entretien pré-rempli, puis `DemarrageEntretien` ne demande **que** l'accord de participation. Soit **1 tap + la coche + « Démarrer »**, ce que §34.2 prévoit (« ne reste que l'accord »). **Réserve** : le bouton « Démarrer l'entretien » est `disabled` tant que la case n'est pas cochée, **sans un mot pour dire pourquoi** — le troisième bouton grisé muet de ce parcours. **Et rien n'est prévu si l'interlocuteur refuse** : la case non cochée est un cul-de-sac, alors que le refus est un fait d'audit qui devrait se tracer. → doute de spec. | **NON** |
| **Aucun verrou en session active de 45 min** | Tenu par construction : `DELAI_INACTIVITE_MS.sessionActive = 60 min` (> 45), `sessionActive` câblé sur `depotSessions.sessionEnCours`, inactivité remise à zéro par `pointerdown/pointermove/keydown/wheel/scroll/touchstart`, Screen Wake Lock demandé. **Réserve terrain** : le délai ne passe à 60 min que lorsque la session est **`en_cours`**. Une session ouverte mais pas encore démarrée (l'auditeur attend son interlocuteur en salle) reste à **15 min** — le cas le plus banal d'une matinée d'audit. | **NON** |
| « **Fin de journée** » en un geste | L'écran fait bien les trois choses sous un seul bouton (**« Terminer la journée »** — le titre de l'écran, lui, dit « Fin de journée » : deux mots pour un geste), sync puis export puis validation, sans qu'un échec annule les suivants. **DÉFAUT SÉRIEUX, invariant 8** : si le champ « Votre mot de passe » est vide ou faux, la sauvegarde **n'est pas produite** — et `CLE_DERNIER_RITUEL` est **écrite quand même**. Or `rappelFinDeJournee()` ne regarde que cette date : **le rappel « Le rituel de fin de journée n'a pas encore été fait » disparaît alors que rien n'a été sauvegardé.** L'auditeur se couche rassuré, ses données n'ont pas quitté l'appareil, et le garde-fou s'est éteint tout seul. Le bouton doit être ce qu'annonce §34.2 — « l'invariant 8 cesse d'être une discipline de mémoire » — et il redevient ici une discipline de mémoire, en pire : silencieuse. | **NON** |
| **Terminer → note → Valider groupé** | Chaîne complète et correctement séparée : `terminerSession` / note additionnelle sans révision (le message « Terminée, pas encore validée » le dit bien) / `validerEnGroupe` avec cases pré-cochées et refus nommés un par un. Sous réserve du chemin d'accès au geste « Terminer », décrit au §33.3 ci-dessus. | **NON** |

---

## 5. CE QUI RESTE DÛ À UNE MACHINE RÉELLE — la liste que Williams devra jouer à la main

C'est le livrable le plus utile de cette passe. Rien ci-dessous n'a été simulé, et rien ne doit
l'être.

**A. Ce que je n'ai pas pu jouer faute de serveur** (à rejouer sur staging, API montée) :
1. Embarquement d'une mission **FIL-TPE** puis **FIL-GC**, avec `storage.persist()` **accordé** —
   et le comportement quand il est **refusé** (Safari iPadOS le refuse volontiers).
2. Le cockpit « Aujourd'hui » avec de vraies sessions : agenda agrégé multi-missions, à-revoir,
   alertes locales, « Reprendre là où vous vous êtes arrêté ».
3. **Un entretien complet**, du démarrage à la validation, sur les deux missions fictives.
4. **La journée terrain §33.7 entière** — les quatre critères du tableau §4, aucun n'est acquis.

**B. Ce qu'aucune machine virtuelle ne peut donner** :
5. **Mode avion réel**, sur **iPad physique** et sur **desktop** — pas `navigator.onLine` forcé.
   Ma passe l'a montré nécessaire : les deux pastilles se contredisent précisément parce que
   personne n'a regardé un écran vrai dans un état vrai.
6. **La police peinte hors ligne**, écran éteint puis rallumé, PWA **installée** (pas un onglet) :
   j'ai prouvé que les `.woff2` sont précachés et qu'Inter se charge en local, **pas** qu'iPadOS la
   peint après un cold start hors réseau.
7. **Coupure de courant en pleine saisie** — arracher l'alimentation, pas fermer l'onglet.
   Vérifier : reprise exactement sur la question en cours, aucune réponse perdue.
8. **Export de secours créé puis restauré sur un DEUXIÈME appareil physique**, avec le mot de passe
   saisi à la main sur clavier virtuel. C'est le critère qui protège l'invariant 8 et il ne se
   vérifie pas autrement.
9. **Session active de 45 min sans toucher l'écran** : vérifier qu'aucune ressaisie n'arrive, et que
   le Wake Lock tient sur Safari (l'API manque avant 16.4 — le code le prévoit, l'appareil décidera).
10. **Cibles tactiles au doigt**, pas au pixel : mes 44 px sont mesurés dans un navigateur de bureau
    en viewport iPad, ce n'est **pas** un doigt sur du verre.
11. **Mode écran partagé démontré devant quelqu'un** : basculer, et faire confirmer par un tiers
    qu'il ne voit **rien** d'interne. Le code retire les nœuds, ce qui est la bonne méthode ; reste
    à le voir.
12. **Le test novice lui-même, avec un vrai novice** — je suis un novice simulé, et je sais lire du
    code. Le chronomètre < 30 min n'a de sens que tenu par quelqu'un qui ne peut pas tricher.

**C. À rejouer en CI** :
13. La suite complète, pour lever le doute sur l'unique « Unhandled Error » de rapporteur (§1,
    ligne 4).

---

## 6. CONSTATS — rendus à A20, NON corrigés par moi

### Bloquants pour P-C

| # | Écran | Constat | Formulation / geste qui lèverait le doute |
|---|---|---|---|
| **B1** | `deverrouillage`, première utilisation | Champ vide + bouton ⇒ « **Déverrouillage impossible / Mot de passe incorrect** » sur un écran qui **crée** le mot de passe. Blocage à t+1 min. | « Saisissez un mot de passe pour protéger cet appareil. » |
| **B2** | `nouvelEntretien` (états « Auditeur inconnu » et « Aucune unité »), `pilote` | **Aucune sortie.** Seul bouton disponible : « Verrouiller ». En PWA installée, sans flèche navigateur, l'auditeur est enfermé. `peutRevenir()` existe et n'est câblé sur aucun bouton d'en-tête. | Bouton « Retour » dans l'en-tête de la coquille dès que `peutRevenir()` ; `actions` sur ces trois états. |
| **B3** | `accueil` | « Ce que cet appareil sait faire sans réseau » promet « **et des photos** » (`EcranAccueil.tsx:109`) alors que la capture photo n'existe pas — le cockpit a été corrigé (M6/A29), pas l'accueil. Conduit l'auditeur à photographier avec son téléphone personnel : pièce d'audit hors coffre, hors invariant 8, hors RGPD. | Retirer « et des photos ». |
| **B4** | `finDeJournee` | Mot de passe vide ou faux ⇒ **aucune sauvegarde produite**, mais `CLE_DERNIER_RITUEL` est écrite ⇒ **le rappel de fin de journée s'éteint**. L'invariant 8 se croit tenu alors que rien n'est sorti de l'appareil. | N'écrire la date du rituel que si `fichierProduit === true` pour **toutes** les missions ; sinon, laisser le rappel et le reformuler (« Sauvegarde non produite ce soir »). |
| **B5** | `finDeSession` | Une **panne de lecture** est rendue comme l'état **vide** « Aucune session ouverte » : on annonce à l'auditeur que son entretien n'existe pas. Le même incrément fait la bonne chose dans `EcranAujourdhui`. | Séparer `undefined` / `null` comme dans `EcranAujourdhui`, et rendre un état `erreur` avec cause + action. |
| **B6** | tous les écrans | **Deux pastilles de sync contradictoires** : en-tête « En attente de synchronisation » (`navigator.onLine` seul, alors que le port est inerte) et accueil « Hors ligne » (déduit du **compte d'outbox**, `EcranAccueil.tsx:227`). Outbox vide ⇒ « Hors ligne » quel que soit le réseau. | Une seule source, celle du port de sync ; et tant que L6a n'a pas livré, l'énoncé honnête : « Synchronisation indisponible dans cette version ». |

### Majeurs (non bloquants, mais dus avant la porte)

| # | Constat |
|---|---|
| M1 | Bouton **« Photo » grisé sans explication visible** (motif seulement dans `aria-label`). Idem « Démarrer l'entretien » grisé tant que l'accord n'est pas coché, et « Suivant » grisé sur la dernière question. **Trois boutons grisés muets** dans un parcours qui se veut « guidé strict » — §19.1 interdit le « cadenas muet ». |
| M2 | **Aucun geste « Terminer » dans l'écran d'entretien** : sur la dernière question, il ne reste que « Quitter l'entretien », qui dit *abandonner*. |
| M3 | **Deux états vides empilés** sur l'accueil, aux conseils contradictoires ; le second (« trois champs suffisent ») mène au cul-de-sac B2. |
| M4 | **`derniereSync` n'est jamais passée** à `PastilleSync` alors que le composant la porte et que §34.2 exige « pastille + **dernier succès** + taille d'outbox ». L'auditeur ne peut pas savoir quand ses données ont quitté l'appareil pour la dernière fois. |
| M5 | **Mot de passe d'appareil sans confirmation**, alors que l'écran annonce lui-même qu'il est irrécupérable. Une faute de frappe au clavier virtuel = appareil illisible. |
| M6 | **Page `/design` absente** (§33.5 la demande nommément). |
| M7 | **`html`/`body` sans `font-family`** ⇒ `Times New Roman` à la racine du document. Sans effet visible aujourd'hui (aucun portail hors coquille), défaut latent. |
| M8 | **Deux vues portent le même titre « Aujourd'hui »** (`accueil` et `aujourdhui`), et le titre d'en-tête est répété par le `h1` juste dessous — bégaiement visuel constaté à l'écran. |
| M9 | **Rappel des capacités hors ligne absent** sur 7 écrans sur 11 (§33.2 : « pastille discrète **+ rappel des capacités locales** »). |
| M10 | **Verrou à 15 min sur une session ouverte non démarrée** — le cas de l'auditeur qui attend son interlocuteur. Conforme à la lettre de §9.7, contraire à l'intention de §33.7. |

---

## 7. PROPOSITIONS D'AMÉLIORATION

**Étage 1** (confort évident, plafonné, hors schéma / API / crypto — à traiter par A22/A23 via A20) :
- Aide clavier globale (touche `?`) listant les raccourcis §33.3 — un novice au clavier ne les
  découvre aujourd'hui qu'en survolant.
- Afficher la **date du jour** dans le cockpit (« Aujourd'hui » ne dit pas quel jour).
- Rendre « **Restaurer une sauvegarde de secours** » visible en haut de l'accueil quand l'appareil
  est vierge : c'est le seul geste utile dans cet état, il est aujourd'hui tout en bas.
- Poser `font-family: var(--typo-police-corps)` sur `html`/`body` (M7).
- Harmoniser « Fin de journée » (titre) et « Terminer la journée » (bouton).

**Étage 2 — fiches `AMELIORATIONS.md`, NON implémentées, arbitrage Williams** :
- **Capture photo terrain** (03 §17.4) : le manque est tracé ; sa **fiche** doit exister, avec le
  coût du contournement décrit en §2 (pièce d'audit hors coffre chiffré). Le retrait de la promesse
  (B3) est étage 1 et **ne remplace pas** la fiche.
- **Tracer le refus de participation** : aujourd'hui la case non cochée est un cul-de-sac muet.
- **Suspendre le verrou 15 min dès l'ouverture d'une session planifiée du jour**, pas seulement au
  passage en `en_cours` (M10).

---

## 8. DOUTES DE SPEC — pour `DECISIONS.md`, jamais devinés

1. **`accueil` et `aujourdhui` portent le même titre.** `vues.ts` dit explicitement que le choix de
   la vue initiale « appartient à A20 à l'intégration ». Le pack ne dit pas si l'auditeur doit voir
   **deux** écrans nommés « Aujourd'hui ». Faut-il renommer `accueil` (p. ex. « Cet appareil » /
   « Missions et stockage ») ?
2. **Refus de participation** : §34.2 dit « ne reste que l'accord de participation », le pack ne dit
   pas ce que fait l'application quand l'interlocuteur **refuse**. Session annulée avec motif ?
   Session tenue sans nom ? Rien n'est écrit.
3. **Phrase-script de la mention d'information** (`PHRASE_SCRIPT_ACCORD`, version `v1`) : rédigée
   par A22 faute de texte dans le pack, et signalée comme telle. Elle est lue **à voix haute à un
   interlocuteur réel** ; elle demande une validation humaine explicite avant toute mission.
4. **Bouton « Fin de journée » et mot de passe** : §34.2 dit « **UN geste** ». La saisie du mot de
   passe d'export en fait deux. Est-ce accepté (le mot de passe dérive la clé, il n'est nulle part
   en mémoire — l'argument est bon), ou faut-il le dériver autrement ? À trancher, parce que B4
   découle directement de ce point.
5. **Pastille de synchronisation tant que L6a n'a pas livré** : la décision A01 du 2026-09-05
   (« l'état de sync visible sur TOUS les écrans ») entre en collision avec `LOT_L5.md` §3.6
   (« jamais une pastille qui annonce plus qu'elle ne fait »). Quel énoncé la pastille de coquille
   doit-elle porter avant L6a ?
6. **Page `/design`** (§33.5) : reportée volontairement, ou oubliée ? Elle conditionne la revue
   visuelle des états complets de chaque composant.

---

## 9. CONFORMITÉ DE MA PROPRE PASSE

- Aucun fichier de code, de test ou de configuration modifié — `git status --porcelain` **vide**
  hors ce rapport.
- Aucun commit. Le dépôt de ce fichier est le seul geste d'écriture ; **le pilote commite**.
- Aucun contournement « arrangé » pour finir dans les temps : le parcours s'arrête là où il
  s'arrête, et c'est le constat B2.
- Aucun résultat inventé : tout ce qui est marqué « joué » l'a été dans un Chromium réel, tout ce
  qui est marqué « lu » est marqué « lu », et la §5 dit ce qui manque.

---

**Signature verdict UX novice : A54 — 2026-09-06**
Remis à **A50**, puis **A02**. Fin d'incrément → **A20** · conformité + traçabilité → **A02** ·
passage en porte → **A01** · porte → **Williams**.
