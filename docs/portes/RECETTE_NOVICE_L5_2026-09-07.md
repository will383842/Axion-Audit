# RECETTE UX NOVICE n°1 — porte P-C — lot L5 (L5a + L5b + L5c) — REJEU INTÉGRAL

**Agent** : A54 (recette UX novice) · **Date** : 2026-09-07
**Base** : `main` — `8e70f39205c9c1086902bedadc61c2a169ddfc46` (« docs(etat): le premier scan ZAP a trois
cibles a tourne pour de vrai »). Arbre propre à l'ouverture, HEAD détaché, **aucun commit de ma part**.
**Passe précédente** : `docs/portes/RECETTE_NOVICE_L5_2026-09-06.md` (NO-GO, 6 bloquants, 10 majeurs).
**Rejeu EN ENTIER** (09 §4bis) : je ne reprends pas « les points qui manquaient », je rejoue tout le
parcours, toute la grille §33, toute la journée §33.7 — y compris ce qui était vert hier.

---

## VERDICT

> ## GO SOUS RÉSERVE
>
> **Ce qui a changé, et c'est considérable** : le parcours novice ne s'interrompt plus. Là où ma
> passe du 2026-09-06 s'arrêtait à **t+3 min** sur un écran sans sortie, j'ai cette fois joué la
> journée entière, réseau coupé, dans un Chromium réel : préparer l'appareil → cockpit → planifier
> une session → **l'ouvrir en un tap** → mener l'entretien → **Terminer** → **valider en groupe** →
> **fin de journée**. **Les six bloquants B1 à B6 sont fermés, et je les ai vérifiés un par un à
> l'écran** — pas dans les tests qui les accompagnent.
>
> **Ce qui reste, et qui empêche de cocher la porte telle quelle** :
> **R1 — « ancres de cotation VISIBLES » (§33.3) est KO**, et c'est un critère nommé de P-C. Sur une
> échelle 1-5, l'écran n'affiche **aucune ancre** tant que l'auditeur n'a pas coté : au doigt, il n'y
> a pas de survol, et les cinq ancres dorment derrière un dépliant **fermé**. Il **cote d'abord, il
> comprend ensuite** — l'inverse exact de ce que §33.3 demande. Pire : sur les crans **2 et 4**,
> l'ancre affichée est une **ligne vide**, précisément là où le pack écrit que « deux auditeurs n'ont
> aucun repère pour distinguer un 2 d'un 4 ».
> **R2 — deux affichages de date/identifiant échappent à l'invariant 5** : « Dernier rituel »
> est peint en **ISO 8601 UTC brut**, et l'écran de restauration affiche un **UUID de mission** et une
> date au fuseau de l'appareil.
> **R3 — quatre points de P-C ne sont pas jouables ici et ne sont donc PAS cochés** : iPad
> **physique**, **mode avion réel**, **session de 45 min sans verrou**, et **le novice humain** qui
> tient le chronomètre. Je les nomme plutôt que de les cocher.
>
> **Le critère « < 30 min sans aide » n'est plus NON TENU : il est NON CERTIFIÉ.** Le blocage qui le
> rendait impossible a disparu ; il reste à le mesurer avec quelqu'un qui ne sait pas lire ce code.

---

## 1. CE QUE J'AI RÉELLEMENT EXÉCUTÉ

| # | Commande / geste | Résultat |
|---|---|---|
| 1 | `git status --porcelain`, `git rev-parse HEAD` | arbre propre · `8e70f39` |
| 2 | `apps/field/dist` construit par le pilote (16:01), `apps/hq/dist` présent | artefacts servis, jamais les sources |
| 3 | `vite preview` + **Chromium réel** (`/opt/pw-browsers/chromium-1194`), 1024×768 **tactile**, `fr-FR` | application **ouverte et pilotée à la main** |
| 4 | Vitest **ciblé** sur les 16 fichiers `*.recette-bN` / `*.acceptation-bN` | **16 fichiers, 116 tests, 0 échec** |
| 5 | Playwright ciblé — `e2e/hors-ligne-l5.e2e.ts` | **5/5 verts** (PC + **iPad émulé**, coupure brutale, export→restauration sur 2ᵉ profil) |
| 6 | Playwright ciblé — `accessibilite-toutes-vues-l5`, `accessibilite-l5a`, `polices` | **34/34 verts** — axe-core **12 vues sur 12**, états hors ligne compris |
| 7 | Playwright — `pwa-servie.e2e.ts` | **NON JOUÉ** : exige Docker, absent du conteneur. Ni vert ni rouge : **non mesuré**, je le dis |
| 8 | Journée terrain complète, réseau coupé, mission fictive **FIL-TPE** | transcription intégrale en §4 |

> **Ce que je n'ai PAS lancé, sur consigne du pilote** : `pnpm test`, `pnpm verify`, `test:unit` et
> `test:interface` en entier — une campagne de balayage occupe le CPU et j'aurais récolté des rouges
> de contention, c'est-à-dire du bruit. Le vert de la suite complète (76 fichiers / 1126 tests côté
> interface, 14 gardes, lint, typecheck) est **celui du pilote, pas le mien**, et je ne me
> l'approprie pas.

**Deux instruments d'observation, déclarés** (09 §5.7 — on ne cache pas son outillage) :
① une configuration Playwright **hors dépôt** (`/tmp/.../pw-a54.config.ts`) dont le seul écart au
fichier versionné est `executablePath` : le conteneur porte Chromium **1194**, Playwright 1.62.1
attend **1234**. Aucun fichier du dépôt n'a été touché. C'est le même caveat que celui déclaré dans
le commit `a59c46a`. ② un **transcripteur sans aucune assertion** (`zz-a54-observation-TEMP.e2e.ts`),
déposé le temps de la passe pour emprunter la fixture FIL-TPE, **supprimé aussitôt** :
`git status --porcelain` ne rend que le fichier A02 d'un autre agent, jamais un des miens.
**Je ne produis aucun code : cet instrument n'affirme rien, il recopie ce que l'écran montre.**

---

## 2. LES SIX BLOQUANTS, VÉRIFIÉS UN PAR UN SUR L'ARBRE ACTUEL

> Le brief le dit et il a raison : **un test présent ne prouve pas un comportement atteint**. Chaque
> ligne ci-dessous est une observation d'écran, pas une lecture de test.

| # | Ce que je constatais le 2026-09-06 | Ce que j'ai VU le 2026-09-07 | Verdict |
|---|---|---|---|
| **B1** | Bouton tapé champ vide ⇒ « **Déverrouillage impossible / Mot de passe incorrect** » sur l'écran qui CRÉE le mot de passe | « **Protection non créée — Saisissez un mot de passe pour protéger cet appareil.** » Et trois gardes ordonnées derrière : trop court ⇒ la politique est **dite** ; confirmation absente ⇒ « Saisissez-le une seconde fois » ; confirmation différente ⇒ la phrase qui dit ce qu'on risque. Le coffre n'est pas appelé. | **FERMÉ** |
| **B2** | `nouvelEntretien` (erreur), `pilote`, `finDeSession` : **aucune sortie**, seul bouton « Verrouiller ». En PWA installée, l'auditeur est enfermé | Un bouton **« Retour »** dans l'en-tête de la **coquille**, présent sur tous les écrans profonds et **absent sur la racine** (un retour qui ne fait rien serait le même mensonge). Vérifié à l'écran sur `nouvelEntretien`, `connexionSiege`, `restauration`, `agenda`, `entretien`, `finDeSession`, `finDeJournee`. La cause racine est traitée au bon endroit : la coquille ne peut pas oublier un écran | **FERMÉ** |
| **B3** | L'accueil promettait « et des photos » ; le bouton **Photo** était grisé **muet** | La promesse a disparu de **toutes** les sources (un balayage l'interdit désormais dans le code exécutable **et** dans le texte JSX). Le bouton porte **« Photo (bientôt) »**, visible. Et l'accueil pose un encart permanent : « **La capture photo n'est pas disponible** — décrivez l'élément dans une note **plutôt que de le photographier avec un appareil personnel** : une photo prise hors de l'application sort du coffre chiffré et de la sauvegarde de secours. » C'est exactement le contournement que je décrivais, nommé et découragé | **FERMÉ** |
| **B4** | Mot de passe vide/faux ⇒ aucune sauvegarde, **mais la date du rituel était écrite** ⇒ le rappel s'éteignait | La date n'est écrite **que si `fichierProduit` est vrai pour TOUTES les missions**. Et le cockpit rend le rappel : « **Le rituel de fin de journée n'a pas encore été fait** ». Observé sur le cockpit avant le rituel | **FERMÉ** |
| **B5** | Une **panne de lecture** s'affichait comme l'état **vide** « Aucune session ouverte » | Union discriminée : `undefined` = chargement, `{ok:false}` = panne, `{ok:true, vue:null}` = aucune session. Le motif est aligné sur `EcranAujourdhui` | **FERMÉ** |
| **B6** | **Deux pastilles contradictoires** (« En attente de synchronisation » / « Hors ligne ») sur le même écran | **UNE seule pastille**, dans l'en-tête, alimentée par le **port de sync** — ni `navigator.onLine`, ni le compte d'outbox. Mesuré sur le DOM à chaque écran de ma passe : toujours exactement une. Et la ligne de mission dit la vérité entière : « 0 point(s) à revoir · 5 élément(s) à remonter · **la synchronisation n'est pas encore disponible dans cette version** » | **FERMÉ** |

**Les six sont fermés.** Je ne les rouvre pas et je ne les nuance pas : ce sont des corrections
franches, faites à la cause et pas au symptôme.

---

## 3. LES DIX MAJEURS M1..M10 — fermé, ouvert, ou hors de ma portée

| # | Constat du 2026-09-06 | État au 2026-09-07 | Preuve |
|---|---|---|---|
| **M1** | Trois boutons grisés **muets** | **FERMÉ** | Observé : « **« Précédent » est inactif : vous êtes à la première question du parcours.** » · « Le bouton s'active dès que la case ci-dessus est cochée » · « Écrivez la note ci-dessus : le bouton s'active dès que le champ n'est plus vide » · « Photo (bientôt) » |
| **M2** | Aucun geste « Terminer » dans l'entretien | **FERMÉ** | Sur la **dernière** question, « Suivant » cède la place à **« Terminer l'entretien »**, qui mène à `finDeSession`. « Quitter l'entretien » reste, distinct |
| **M3** | Deux états vides empilés, aux conseils contradictoires | **FERMÉ** | Un seul état vide sur l'accueil ; celui de la reprise est devenu conditionnel : sans mission, il dit « **Une mission doit d'abord être présente sur cet appareil** », plus « trois champs suffisent » |
| **M4** | `derniereSync` jamais passée à la pastille (§34.2 : « pastille + **dernier succès** + outbox ») | **OUVERT, mais atténué et non actionnable avant L6a** | `PastilleSyncCoquille` ne passe toujours pas `derniereSync`. Le port étant inerte, il n'existe **aucun** succès à afficher ; l'infobulle et le cockpit portent l'énoncé honnête. À rouvrir **à L6a**, pas avant |
| **M5** | Mot de passe d'appareil sans confirmation | **FERMÉ** | Second champ « Confirmer le mot de passe », au **premier usage seulement** — à la reprise, le coffre est le juge |
| **M6** | Page `/design` absente (§33.5) | **FERMÉ** | `apps/hq/src/ecrans/design/` : 12 fiches métier, `satisfies Record<NomComposantUI, …>` — **une fiche oubliée ne compile pas**. Servie et ouverte par moi sur `/hq/design`. Le choix de l'application est tracé (`DECISIONS.md`, 2026-09-07) |
| **M7** | `html`/`body` sans `font-family` ⇒ Times New Roman latent | **FERMÉ, mesuré** | `getComputedStyle(document.documentElement).fontFamily` = `"Inter Variable", Inter, system-ui…` — **hors réseau**. Un test e2e dédié tient le bord (« un nœud rendu HORS de la coquille ne naît pas en police par défaut ») |
| **M8** | Deux vues portent le titre « Aujourd'hui », et le titre bégaie | **OUVERT** | `vues.ts` : `accueil` et `aujourdhui` portent tous deux `titre: 'Aujourd'hui'`. Observé : en-tête « Aujourd'hui » **puis** `h1` « Aujourd'hui » juste dessous. Le **bouton** a été renommé (« Missions et stockage de l'appareil ») mais **pas le titre de la vue** : le novice tape un bouton qui promet « missions et stockage » et atterrit sur un écran qui s'appelle « Aujourd'hui ». Doute de spec **toujours non arbitré** |
| **M9** | Rappel des capacités hors ligne absent sur 7 écrans sur 11 | **FERMÉ** | Une liste par vue, dans un fichier unique, sous `satisfies Record<CodeVue, ListeNonVide<string>>` : **la douzième vue n'a pas compilé** tant qu'elle n'y était pas. Compté sur le DOM, écran par écran |
| **M10** | Verrou à **15 min** sur une session **ouverte mais non démarrée** (l'auditeur qui attend son interlocuteur) | **OUVERT — et aucune fiche n'a été ouverte** | `depotSessions.sessionEnCours` ne compte que `status === 'en_cours'`. Ma proposition d'étage 2 du 2026-09-06 **n'est pas dans `AMELIORATIONS.md`**. Conforme à la lettre de 05 §9.7, contraire à l'intention de §33.7 |

**Comptes : 7 fermés · 2 ouverts (M8, M10) · 1 reporté à L6a (M4).**

---

## 4. LE PARCOURS, JOUÉ, ÉCRAN PAR ÉCRAN

### 4.1 — L'appareil neuf, hors réseau (desktop 1024×768 tactile)

Séquence exacte : chargement **au siège, réseau présent** (le service worker s'installe — c'est la
vie réelle d'une PWA), puis **réseau coupé**, puis **rechargement complet**. L'application démarre.

| Temps | Écran | Ce que j'ai vu | Hésitation ? |
|---|---|---|---|
| t+0 | `Préparer cet appareil` | Deux champs, la politique **annoncée avant d'être opposée**, et le rappel « Sans réseau, cet appareil reste utilisable : … » | non |
| t+0 | bouton tapé **à vide** | « **Protection non créée — Saisissez un mot de passe pour protéger cet appareil.** » | **non — c'était le blocage n°1, il n'existe plus** |
| t+0 | mot court, puis sans confirmation, puis confirmation différente | trois refus distincts, tous actionnables, **saisie conservée** | non |
| t+0,2 | protection créée (Argon2id réel, ~10 s sur cette machine) | vue d'ouverture | non |
| t+0,3 | vue d'ouverture, appareil **non rattaché** | **Une** pastille « Hors ligne ». Un encart : « **Cet appareil n'est rattaché à aucun auditeur** — aucun entretien ne peut être ouvert tant qu'il n'a pas de propriétaire. Le rattachement se fait une fois, **en ligne** », **avec son bouton** | non — le fait est dit **au bon endroit**, avant l'échec |
| t+0,4 | `Nouvel entretien` | « Auditeur inconnu sur cet appareil » — **et un bouton « Retour »**, et le geste « Rattacher cet appareil » | **non — c'était le cul-de-sac n°2, il n'existe plus** |
| t+0,4 | `Rattacher cet appareil`, hors réseau | « Cet appareil semble hors ligne. Le rattachement demande une connexion, **une seule fois**. » + les capacités locales | non |
| t+0,4 | `Restaurer une sauvegarde` | Le seul geste utile sur un appareil vierge, atteignable depuis l'accueil | non |

**Mesures faites dans ce même navigateur** : `document.fonts` → `Inter Variable loaded` **hors
réseau** · `html`, `body`, `h1` tous en Inter Variable · **aucune requête vers un domaine externe**
(sonde sur toutes les requêtes) · **aucune cible tactile sous 44×44 px** sur les écrans atteints.

### 4.2 — La journée terrain, mission FIL-TPE embarquée (invariant 2 : entreprise fictive)

| Geste | Écran | Observation |
|---|---|---|
| 1 | Cockpit « Aujourd'hui » | « **Aucune session prévue aujourd'hui** — Planifiez une session depuis l'agenda, ou ouvrez un entretien imprévu en trois champs. **Tout fonctionne sans réseau.** » Un état vide qui dit quoi faire, et une seule fois |
| 2 | `Agenda` | Six types de session, chacun avec sa glose (« On interroge une personne », « On regarde le travail réel : un poste, un atelier, un flux »). Le créneau porte : « **Heure de cet appareil. Elle sera affichée au fuseau du site audité.** » — la bonne phrase, au bon endroit |
| 3 | après « Planifier » | « **C'est enregistré** — Session planifiée. Elle apparaîtra dans votre journée, **prête à démarrer en un tap**. » |
| 4 | Cockpit | La ligne « 09:30 · Sofia Marchand · Observation de poste · Chef d'équipe », **cliquable en entier**. Plus le rappel « Rituel du soir » et l'alerte de sauvegarde (invariant 8) |
| **5** | **1 TAP sur la ligne** | L'entretien s'ouvre **pré-rempli** : nom, fonction, unité, statut « non démarré ». **Il ne reste que l'accord.** §33.7-1 **tenu, joué** |
| 6 | accord | La mention d'information est **affichée en toutes lettres, à lire à voix haute**, avec le nom de l'interlocuteur. Bouton « **L'interlocuteur refuse de participer** » offert à côté — mon doute de spec n°2 est arbitré et **implémenté** |
| 7 | entretien, Q1 (texte libre) | Trois zones. « **Enregistré à 18:21** » — **au fuseau de la mission**. Barre d'actions : « À revoir (R) · N/A (A) · Note · Photo (bientôt) · Recherche (/) · Suivant (↵) » |
| 8 | Q2 (oui/non) | « Oui · **touche O** », « Non · **touche N** », « Sans objet · **touche A** » |
| 9 | Q3 (échelle 1-5) | « 1 · touche 1 … 5 · touche 5 » — **et « Sélectionnez une note pour voir son ancre. »** → **voir R1 ci-dessous** |
| 10 | touche `E` | « **Écran partagé — les éléments internes sont masqués** ». Vérifié : le nom de l'interlocuteur disparaît, les notes, les à-revoir, la recherche, les panneaux et les rappels de touches sont **retirés du rendu**. Restent la question et les cinq crans. C'est ce qu'on montre à quelqu'un |
| 11 | dernière question | **« Terminer l'entretien »** remplace « Suivant » |
| 12 | `Fin de session` | Synthèse en **une carte** : répondu / à revoir / sans objet / non communiqué / notes / pièces. « Avant de terminer, à savoir : 1 question(s) sans réponse. » **Terminer reste possible** — le réel commande |
| 13 | après « Terminer la session » | « **Terminée, pas encore validée** — cette session reste modifiable : **une note ajoutée maintenant n'est pas une révision**. La validation, elle, verrouille — elle se pose en fin de journée. » Gestes : Rouvrir · Valider maintenant · Revenir |
| 14 | Cockpit | La ligne porte « **Terminée, à valider** » et le bouton « Rouvrir ou valider » |
| 15 | `Fin de journée` | « **Un seul geste : synchroniser, produire une sauvegarde de secours chiffrée, et valider les entretiens terminés du jour.** » Liste des entretiens **pré-cochés**, décochables un par un, « Récapitulatif : 1 entretien(s) seront validés » |

**Aucun retour en arrière imposé. Aucun contournement cherché. Aucune devinette.**
**~21 gestes** de l'ouverture de l'appareil à la fin de journée, pour une journée à un entretien.

---

## 5. GRILLE §33, POINT PAR POINT

### §33.1 — Fondations

| Point | Verdict | Preuve |
|---|---|---|
| Inter variable **auto-hébergée**, jamais de CDN | **OK** | `dist/assets/inter-latin-*.woff2` précachés par `sw.js` ; sonde réseau sur toute ma passe : **zéro requête externe** |
| **Police rendue hors ligne** | **OK, mesuré** | Réseau coupé, rechargement complet : `Inter Variable loaded`. Les tests `polices.e2e.ts` (10/10) tiennent aussi le bord « un nœud hors coquille » |
| Jeton de police à la **racine** du document | **OK** — M7 fermé | `:where(html, body)` dans `tokens.css` ; mesuré à l'écran |
| Aucune couleur en dur (invariant 4) | **OK** | Toutes les valeurs hexadécimales du dépôt vivent dans `tokens.css` / `tokens.ts` |
| **Alerte dans un rouge distinct de l'action** | **OK** | `alerte` vs `action`/terracotta ; écart contrôlé par `tokens.test.ts`. À l'écran, l'encart « Protection non créée » et le bouton principal ne se confondent pas |
| `prefers-reduced-motion` | **OK** | `composants.css` |

### §33.2 — Les quatre états, écran par écran (12 vues)

| Écran | chargement | vide | erreur | hors ligne (pastille + **capacités**) | Verdict |
|---|---|---|---|---|---|
| `deverrouillage` | coquille | s.o. (l'écran EST le contenu) | ✔ observé ×4 formulations | ✔ (capacités, **sans** pastille — arbitré 2026-09-06) | **OK** |
| `stockage` | ✔ | s.o. | ✔ | ✔ | **OK** |
| `accueil` | ✔ | ✔ **une seule** | ✔ | ✔ | **OK** |
| `nouvelEntretien` | ✔ | ✔ | ✔ **avec sortie** | ✔ | **OK** |
| `entretien` | ✔ | ✔ | ✔ | ✔ | **OK** |
| `aujourdhui` | ✔ | ✔ observé | ✔ | ✔ | **OK** |
| `agenda` | ✔ | ✔ observé | ✔ | ✔ | **OK** |
| `pilote` | ✔ | ✔ | ✔ | ✔ | **OK** |
| `finDeJournee` | ✔ | ✔ observé | ✔ | ✔ | **OK** |
| `finDeSession` | ✔ | ✔ | ✔ **séparé du vide** | ✔ | **OK** |
| `restauration` | ✔ | ✔ | ✔ | ✔ | **OK** |
| `connexionSiege` | ✔ | s.o. | ✔ | ✔ observé | **OK** |

**12 vues sur 12.** Le compte n'est plus tenu par la relecture mais par le **type** : une vue ajoutée
au registre ne compile pas tant qu'elle n'a ni parcours axe, ni capacités hors ligne. C'est la
seule chose qui empêche le treizième écran de retomber. **axe-core : 12 vues sur 12, vertes**,
états hors ligne compris — je l'ai exécuté, ce n'est pas une lecture.

### §33.3 — Terrain

| Point | Verdict | Détail |
|---|---|---|
| Raccourcis **complets** 1-5 · O/N · A · R · ↵ · ↑↓ · **/** · E | **OK, joués** | Vus **peints à l'écran** : « touche 1…5 », « touche O », « touche N », « touche A », « À revoir (R) », « N/A (A) », « Recherche (/) », « Suivant (↵) », « (touche E) ». La touche `3` a coté, la touche `E` a basculé |
| Touche unique inactive **dans** un champ de saisie | **OK** | Ma saisie de texte libre n'a déclenché aucune action |
| **Découvrabilité** des raccourcis | **partiel** | Les touches sont sur les libellés, mais **aucune aide clavier globale** (`?`). Étage 1, proposé le 2026-09-06, **non traité** |
| Swipe horizontal iPad | **non joué** — code présent | Il faut un doigt sur du verre |
| **Ancres de cotation VISIBLES sous le curseur** | **KO — voir R1** | Détaillé ci-dessous |
| Micro-indicateur « **Enregistré** » | **OK, joué** | « Enregistré à 18:21 », **au fuseau de la mission**, après l'écriture |
| **Mode écran partagé** | **OK, joué** | Bascule par la touche `E` **et** par un bouton ; bandeau permanent ; en mode partagé, le nom, les notes, les à-revoir, la recherche, les panneaux **et les rappels de touches** sont retirés du rendu — pas masqués en CSS |
| Fin d'entretien : synthèse en une carte | **OK, joué** | Six compteurs, plus « Avant de terminer, à savoir » |

#### R1 — LES ANCRES DE COTATION, ET POURQUOI C'EST LE POINT DUR DE CETTE PASSE

§33.3 : « sur toute échelle 1-5, les ancres s'affichent **SOUS le curseur** : la cotation homogène
ne dépend pas de la mémoire du consultant. » Mesuré à l'écran, sur `/hq/design` **où les ancres
existent vraiment** (les fiches portent de vraies ancres §32.4) :

```
état « pas encore coté »  →  « Sélectionnez une note pour voir son ancre. »
toutes les ancres         →  <details open=false> « Voir toutes les ancres de cotation »
tap (doigt) sur le cran 4 →  ligne d'ancre VIDE ("")
```

Trois faits, et ils s'aggravent l'un l'autre :

1. **Rien n'est visible avant d'avoir coté.** L'ancre apparaît au **survol** ou au **focus**. Sur
   iPad il n'y a **ni survol ni focus sans tap**. L'auditeur pose donc sa note **puis** découvre ce
   qu'elle voulait dire. C'est l'inverse du geste que §33.3 décrit, et c'est exactement ce que la
   grille P-C fait vérifier : « ancres visibles — **la cotation n'est pas reproductible sans elles** ».
2. **Les cinq ancres dorment derrière un dépliant fermé.** Il existe bien « Voir toutes les ancres
   de cotation » — un geste de plus, à chaque question à échelle, plusieurs centaines de fois par
   mission. C'est un **contournement**, et 09 §5.7 me demande de le compter comme un constat, pas
   comme une solution.
3. **Sur les crans 2 et 4, la ligne d'ancre est VIDE.** `ANCRES_REQUISES = [1, 3, 5]` : la banque ne
   garantit d'ancre que sur trois niveaux. Le commentaire du pack, à trois lignes de là, écrit :
   « deux auditeurs **n'ont aucun repère pour distinguer un 2 d'un 4**, et la divergence §32.1
   mesurerait alors leur désaccord de vocabulaire, pas celui du terrain. » L'écran laisse donc un
   **blanc** précisément là où le pack annonce le risque.

**Ce qui lèverait le doute** (je constate, je ne conçois pas) : que les ancres 1/3/5 soient
**lisibles sans interaction** — le dépliant **ouvert par défaut**, ou les trois libellés posés sous
les crans —, et que les crans 2 et 4 disent au moins « entre *ancre 1* et *ancre 3* » plutôt que rien.

**Ce que je n'ai PAS pu voir, et je le dis** : dans l'application terrain, la fixture E2E porte une
question `scale_1_5` avec `guidanceSnapshot: null`, donc **zéro ancre**. C'est un état que le
contrôle d'import **interdit** (`ANCRES_ABSENTES`, contrôle bloquant du §32.4). **Le chemin des
ancres n'est donc éprouvé de bout en bout nulle part** : ni en E2E terrain (pas d'ancres dans la
fixture), ni à la main (je n'ai pas de mission réelle embarquée). C'est un trou de couverture, et il
porte sur le composant le plus utilisé d'une journée d'audit.

### §33.5 — Inventaire et page `/design`

**FERMÉ.** `/hq/design` existe, je l'ai ouverte et pilotée. Douze fiches, chacune avec ses états ;
`TimelinePilote`, `Radar`, `Heatmap`, `CourbePrévuRéel` **déclarés absents avec leur motif**
(L7-L8) plutôt que silencieusement manquants. Le garde est dans le type : une fiche oubliée ne
compile pas. L'application d'accueil (console plutôt que terrain) est tracée dans `DECISIONS.md`.

### §33.6 — Accessibilité

**axe-core vert sur 12 vues / 12** (exécuté par moi, pas lu) : déverrouillage, stockage, accueil,
nouvel entretien, entretien (×4 dont hors ligne), aujourd'hui (×2), agenda, pilote, fin de journée,
restauration (×2), fin de session, rattachement (×2). **Cibles tactiles** : aucune sous 44×44 px sur
les écrans mesurés. **Icône seule sans libellé** : plus aucune — le bouton Photo porte son mot.

---

## 6. JOURNÉE TERRAIN §33.7 — les quatre critères

| Critère | Verdict | Ce que j'ai fait |
|---|---|---|
| Session planifiée démarrée **en 1 tap** | **OK — JOUÉ** | Un tap sur la ligne du cockpit ouvre l'entretien pré-rempli ; ne reste que l'accord, ce que §34.2 prévoit. Et le refus a **son propre geste**, tracé |
| **Aucun verrou en session active de 45 min** | **NON JOUÉ — tenu par le code, et une réserve** | `sessionActive = 60 min > 45`, inactivité remise à zéro par six familles d'événements, Wake Lock demandé. **Je n'ai pas attendu 45 minutes** et je ne prétends pas l'avoir fait. **Réserve M10, toujours ouverte** : une session **planifiée mais pas encore démarrée** reste à **15 min** — l'auditeur qui attend son interlocuteur en salle est verrouillé |
| « **Fin de journée** » en un geste | **OK sur l'enchaînement — RÉSERVE sur le compte des gestes** | L'écran annonce « **Un seul geste** » et enchaîne sync → sauvegarde → validation sous un seul bouton. Mais il demande **le mot de passe d'export** avant : cela fait **deux**. Mon doute de spec n°4 du 2026-09-06 est **toujours non arbitré** — et B4 en découlait directement |
| **Terminer → note → Valider groupé** | **OK — JOUÉ de bout en bout** | Terminer · « Terminée, pas encore validée : une note ajoutée maintenant n'est pas une révision » · validation **groupée, pré-cochée, décochable**, avec récapitulatif |

---

## 7. FRANÇAIS, DATES, COULEURS

**Chaînes anglaises relevées : 0.** J'ai transcrit **quatorze écrans** en texte brut, y compris les
états d'erreur, les états vides, les gloses et les infobulles : tout est en français, sans jargon
technique, sans identifiant interne — **à une exception près**, ci-dessous.

**Dates / identifiants en heure serveur ou en forme technique : 2, tous deux visibles.**

| # | Écran | Ce que l'auditeur lit | Ce qu'il devrait lire |
|---|---|---|---|
| **R2-a** | `finDeJournee` | « **Dernier rituel : 2026-09-07T16:07:49.123Z** » — la valeur brute de `maintenant()`, en **ISO 8601 UTC**, non formatée. Invariant 5 : UTC en base, **fuseau de mission à l'affichage** | « Dernier rituel : 07/09/2026 18:07 », par `formaterDateHeure(…, fuseauDeLaMission)` |
| **R2-b** | `restauration` | « **Mission : 01920000-0000-7000-8000-000000000001** » (UUID brut) et « Sauvegarde produite le … » formatée avec `undefined` en fuseau, donc **au fuseau de l'appareil** — pas à celui du site audité | Le **titre** de la mission restaurée, et sa date au fuseau de la mission (connu après la restauration) |

**Tout le reste des horodatages est correct et je l'ai vérifié à l'écran** : « Enregistré à 18:21 »
et l'heure d'agenda « 09:30 » sont bien rendus au fuseau de la **mission** (navigateur à
`Europe/Paris`, serveur en UTC, décalage réel de 2 h — c'est ce décalage qui rend la mesure
concluante).

**Couleurs** : alerte distincte de l'action, **OK**, vérifié à l'écran et par le test de jetons.
Aucune couleur en dur. Aucune information portée par la seule couleur (les badges « En cours »,
« Terminée, à valider », « Validée » portent leur texte).

**Incohérences de vocabulaire relevées** (elles ne trompent pas, elles fatiguent) :
- **« Retour » (coquille) et « Revenir » (écran) coexistent sur le même écran** — `finDeSession`,
  `finDeJournee`, `restauration` en portent **deux**, côte à côte, avec deux mots pour un geste.
- **« Terminer l'entretien » → écran « Fin de session » → bouton « Terminer la session »** : trois
  formulations pour un seul acte.
- **« Fin de journée » (titre) / « Terminer la journée » (bouton)** — mon étage 1 du 2026-09-06,
  non traité.
- **« Avant de terminer, à savoir »** reste affiché **après** que la session a été terminée.
- **Deux écrans nommés « Aujourd'hui »** (M8), dont l'un s'atteint par un bouton qui promet
  « Missions et stockage de l'appareil ».

---

## 8. CE QUI RESTE DÛ À UNE MACHINE RÉELLE — la liste que Williams devra jouer

Beaucoup de ma liste du 2026-09-06 a été **scriptée depuis** et je le constate avec précision :
la coupure brutale en pleine saisie, l'export créé puis restauré sur un **second profil sur
disque**, le mode avion sur **iPad émulé**, le refus de `storage.persist()` — tout cela tourne
maintenant, et je l'ai exécuté (5/5 verts). **Ce qui suit ne peut toujours pas être simulé.**

1. **iPad PHYSIQUE, en mode avion RÉEL, PWA INSTALLÉE** (pas un onglet, pas `setOffline`, pas un
   viewport émulé). C'est le libellé exact du critère P-C, et **il n'est pas couvert** : le fichier
   `playwright.config.ts` l'écrit lui-même — « les service workers sous iOS ne sont **PAS** couverts
   par Playwright ».
2. **Le cold start hors réseau sur iPadOS**, écran éteint puis rallumé, avec la police peinte. J'ai
   prouvé le cold start hors réseau **sur Chromium** ; iPadOS décide seul.
3. **Session active de 45 minutes sans toucher l'écran** : vérifier qu'aucune ressaisie n'arrive et
   que le Wake Lock tient sur Safari (l'API manque avant 16.4).
4. **Le doigt sur le verre** : mes 44 px sont mesurés en viewport, ce n'est pas une main.
5. **Le mode écran partagé démontré devant un tiers**, qui confirme qu'il ne voit rien d'interne.
6. **Le test novice avec un VRAI novice**, chronomètre en main. Je suis un novice simulé qui sait
   lire ce code : mon chronomètre ne vaut rien sur ce critère-là, et je refuse de le maquiller.
7. **Les ancres de cotation sur une mission RÉELLE** (R1) : la fixture n'en a pas, et le seul écran
   qui en montre est la page `/design`.
8. **`pwa-servie.e2e.ts`** : non exécuté ici, Docker absent. À rejouer en CI — c'est lui qui garde
   le service worker et le manifeste servis par Caddy.

---

## 9. CONSTATS — rendus à A20, NON corrigés par moi

### Bloquant pour la case « ancres visibles » de P-C

| # | Écran | Constat |
|---|---|---|
| **R1** | `entretien`, toute question `scale_1_5` | **Aucune ancre n'est visible avant d'avoir coté** (survol/focus uniquement, inexistants au doigt) ; les cinq ancres sont derrière un dépliant **fermé** ; **les crans 2 et 4 affichent une ligne vide**. Le chemin n'est éprouvé de bout en bout **nulle part** : la fixture E2E porte une `scale_1_5` **sans ancres**, état que le contrôle d'import interdit |

### Majeurs — dus avant la porte, non bloquants pour le parcours

| # | Constat |
|---|---|
| **R2** | « Dernier rituel » affiché en **ISO 8601 UTC brut** ; écran de restauration affichant un **UUID de mission** et une date au fuseau de l'**appareil** (invariant 5) |
| **R3** | **M8 rouvert tel quel** : deux vues « Aujourd'hui », titre d'en-tête qui bégaie avec le `h1`, et un bouton dont le libellé ne correspond pas au titre de la vue qu'il ouvre |
| **R4** | **M10 rouvert tel quel** : verrou à 15 min sur une session planifiée non démarrée — **et aucune fiche `AMELIORATIONS.md` n'a été ouverte** alors que je l'avais proposée en étage 2 |
| **R5** | **« Retour » et « Revenir »** sur le même écran, plus « Terminer l'entretien / Fin de session / Terminer la session » : trois mots pour un acte |
| **R6** | « **Avant de terminer, à savoir** » affiché **après** la terminaison |
| **R7** | **Aucune aide clavier globale** (`?`) — les raccourcis ne se découvrent qu'en lisant chaque bouton |
| **R8** | **M4** : la pastille ne porte pas le **dernier succès de sync** (§34.2). Non actionnable avant **L6a** ; à rouvrir là |

---

## 10. PROPOSITIONS D'AMÉLIORATION

**Étage 1** (confort évident, plafonné, hors schéma / API / crypto — à traiter par A22/A23 via A20) :
- Formater « Dernier rituel » avec `formaterDateHeure` au fuseau de la mission (**R2-a**).
- Afficher le **titre** de la mission restaurée au lieu de son UUID, et sa date au fuseau de mission
  une fois la mission connue (**R2-b**).
- Harmoniser « Retour » / « Revenir », et « Fin de journée » / « Terminer la journée » (**R5**).
- Basculer « Avant de terminer, à savoir » en « Ce qui reste ouvert » une fois la session terminée
  (**R6**).
- Aide clavier globale sur `?` (**R7**).
- Afficher la **date du jour** dans le cockpit — « Aujourd'hui » ne dit toujours pas quel jour.

**Étage 2 — fiches `AMELIORATIONS.md`, NON implémentées, arbitrage Williams** :
- **Les ancres lisibles sans interaction** (**R1**) : si le geste dépasse le libellé (dépliant ouvert
  par défaut) et touche la façon de coter, c'est une fiche, pas un confort. **Je ne conçois pas la
  solution : je constate que le critère n'est pas tenu.**
- **Suspendre le verrou 15 min dès l'ouverture d'une session planifiée du jour** (**R4**) — proposée
  le 2026-09-06, **jamais fichée**. La reproposer est un devoir ; l'implémenter serait une faute.
- **Une question `scale_1_5` AVEC ancres dans la fixture E2E**, pour que le chemin le plus fréquent
  d'un audit cesse d'être le seul non éprouvé de bout en bout.

---

## 11. DOUTES DE SPEC — pour `DECISIONS.md`, jamais devinés

Deux de mes six doutes du 2026-09-06 ont été arbitrés depuis (**refus de participation**, 2026-09-06 ;
**application d'accueil de `/design`**, 2026-09-07). **Quatre restent ouverts**, et j'en ajoute un.

1. **Deux vues portent le titre « Aujourd'hui »** (M8/R3). Le pack ne dit pas si l'auditeur doit voir
   deux écrans du même nom. Le bouton a été renommé, le titre non : faut-il renommer la vue `accueil` ?
2. **Phrase-script de la mention d'information** (`v1`) : elle est **lue à voix haute à un
   interlocuteur réel**, elle a été rédigée faute de texte dans le pack, et elle attend toujours une
   **validation juridique explicite**. Elle est en production dans l'écran que j'ai joué.
3. **« Fin de journée en un geste » face à la saisie du mot de passe d'export** : §34.2 dit « **UN**
   geste », l'écran en demande deux et écrit lui-même « Un seul geste ». À trancher — B4 en découlait.
4. **Énoncé de la pastille de synchronisation avant L6a** : la traduction est unique et l'état vient
   du port ; **le mot** reste à Williams (arbitrage A20 du 2026-09-06, explicitement réservé).
5. **NOUVEAU — les ancres de cotation sur un écran tactile.** §33.3 dit « visibles **sous le
   curseur** ». Un iPad n'a pas de curseur. Le pack ne dit pas ce que « visible » veut dire au doigt :
   les trois ancres 1/3/5 en permanence sous les crans ? un dépliant ouvert par défaut ? Et il ne dit
   rien de ce qu'affichent les crans **2 et 4**, que §32.4 n'ancre jamais.

---

## 12. CONFORMITÉ DE MA PROPRE PASSE

- **Zéro fichier de code modifié.** `git status --porcelain` ne rend que `docs/portes/CONTROLE_A02_PC_2026-09-07.md`,
  déposé par **un autre agent**, et le présent rapport. Aucun fichier de production, aucun test, aucune
  configuration versionnée.
- **Aucun commit.** Le dépôt de ce fichier est mon seul geste d'écriture ; **le pilote commite** (09 §1,
  « un réviseur ne commite jamais »).
- **Instruments déclarés et détruits** : une configuration Playwright hors dépôt (binaire Chromium du
  conteneur) et un transcripteur **sans assertion** posé le temps de la passe puis supprimé. Ils
  n'affirment rien ; ils recopient. **Je ne produis aucun code (09 §5.6).**
- **Aucun contournement « arrangé » pour finir dans les temps.** Le seul contournement rencontré — le
  dépliant « Voir toutes les ancres » — est **consigné comme constat**, pas utilisé comme réponse.
- **Aucun résultat inventé.** Tout ce qui est marqué « joué » l'a été dans un Chromium réel ; tout ce
  qui est marqué « lu » est marqué « lu » ; §8 dit ce qui manque, nommément.
- **Rejeu intégral**, pas différentiel : les six bloquants, les dix majeurs, les six sections de la
  grille, les quatre critères §33.7 et les deux invariants 4 et 5 ont tous été repassés.
- **Ce que je n'ai pas mesuré et ne prétends pas mesurer** : la suite complète (consigne du pilote,
  contention CPU), `pwa-servie` (Docker absent), et les huit points du §8.

---

**Signature verdict UX novice : A54 — 2026-09-07 — GO SOUS RÉSERVE (R1 bloquant la case « ancres
visibles » ; R2 à R8 dus avant la porte ; §8 dû à Williams sur machine réelle).**
Remis à **A50**, puis **A02**. Fin d'incrément → **A20** · conformité + traçabilité → **A02** ·
passage en porte → **A01** · porte → **Williams**.
