# CONTRÔLE D'ACCEPTATION A02 — PORTE **P-C** REJOUÉE EN ENTIER — 2026-09-07

> **Étape 6/7 du pipeline (09 §3), rejeu intégral au titre du 09 §4bis** : « la porte se rejoue EN
> ENTIER (jamais “les 3 points qui manquaient”) ». P-C a été refusée deux fois — mon VETO du
> 2026-09-06 et le NO-GO d'A54 du même jour. Ce dossier ne prolonge pas le précédent : il le refait.
> **Gardien A02, en lecture seule sur le code.** Je n'ai modifié aucun fichier du dépôt, je ne
> commite pas (règle du 2026-09-05 : « un réviseur qui commite est un écrivain »).
> **Ordre de lecture appliqué** (CLAUDE.md §0, ligne L5, et rien d'autre — 09 §5.8) :
> `11_CONTRAT_TECHNIQUE` intégral → `07` ligne L5 → `09` §3/§4 (ligne P-C)/§4bis/§5.4/§5.9 →
> `08`/`TRACABILITE_E1-E47` → `CONTROLE_A02_L5_2026-09-06` (mes propres réserves) → `DECISIONS.md`
> (entrées 2026-09-06 et 2026-09-07) → `AMELIORATIONS.md` (compteur) → `docs/ETAT.md` (derniers blocs).

---

## 0. L'ÉTAT RÉEL, VÉRIFIÉ AVANT TOUT JUGEMENT

**Deux corrections au brief, faites avant mes chiffres parce que la suite en dépend.**

| Affirmation du brief | Ce que j'ai mesuré | Commande |
| --- | --- | --- |
| Commit contrôlé `8e70f39`, **HEAD détaché** | **HEAD = `535fbca`**, sur la branche locale `gouvernance/etat-09`, **1 commit d'avance non poussé** sur `origin/main`. Le delta est **documentaire seul** (`docs/ETAT.md` +26, `docs/REPRISE_AUTOPILOTE.md` ±13) : **l'arbre de code que je contrôle est bien celui de `8e70f39`** | `git rev-parse HEAD` · `git diff --stat 8e70f39..535fbca` · `git rev-list --left-right --count origin/main...HEAD` → `0 1` |
| Arbre propre | **VRAI** — `git status` vide à l'ouverture comme à la clôture | `git status -sb` |

*Conséquence de gouvernance, mineure mais je la dis* : `535fbca` **n'est pas sur `origin`**.
CLAUDE.md §8 : « un commit non poussé n'existe pas ». C'est au pilote, pas à moi.

**Ce que je n'ai pas rejoué, et pourquoi** : la suite complète (`pnpm test`, `pnpm verify`) — un
balayage d'horloge occupe le CPU, et des rouges de contention ne sont pas des régressions. **Je ne
m'appuie donc pas sur le vert du pilote seul** : je m'appuie sur la **CI du commit contrôlé**, que
j'ai lue directement.

> **Run `34128601356`, `head_sha 8e70f39`, `conclusion: success` — 21 jobs sur 21, dont
> `3 · unit`, `4 · integration (postgres, redis, minio)`, `5 · e2e (chromium)`,
> `couverture ≥ 90 % (modules critiques)`, `6 · schema-diff (vs fichier 04)`, `gitleaks`,
> `aucun test désactivé ni orphelin`, `8 · deploy-staging → Coolify → déploiement vérifié`
> et `ZAP baseline (staging)`.**
> `curl -s .../actions/runs/34128601356/jobs` — **la liste complète est verte, aucun `skipped`.**

C'est la première fois depuis L5a que **l'ensemble** de la chaîne est vert sur le commit contrôlé,
staging et ZAP compris. Ma passe du 2026-09-06 travaillait sur une CI rouge et une branche non
fusionnée ; celle-ci travaille sur `main` déployé.

---

## 1. VERDICT

> # 🟠 **CONFORME SOUS RÉSERVE — VETO DU 2026-09-06 LEVÉ, PORTE P-C NON FRANCHISSABLE EN L'ÉTAT**
>
> **Je lève mon veto V1.** Le correctif de sécurité F-22 (CRITIQUE), F-23 et F-25 est **présent et
> renforcé** dans `main` : les **sept symboles** sont revenus, et le compte de cas de test sur les
> quatre fichiers passe de **82 (`main` au 06) à 121**. Mesure au §2.
>
> **Écarts NON documentés à la spécification : AUCUN.** Le droit de veto ne s'exerce sur rien
> aujourd'hui. Tout ce qui reste est soit un critère non tenu (documenté comme tel), soit une réserve
> nommée, soit un geste dû à un humain ou à du matériel.
>
> **Mais P-C ne se franchit pas** : **trois réserves bloquantes** subsistent, dont une qui est un
> critère explicite du fichier 07 **et** du 09 §4 — la **recette novice n'a pas été rejouée**, et le
> seul verdict A54 au dossier reste un **NO-GO**. 09 §4bis interdit de la considérer levée par la
> correction de ses six bloquants : « la porte se rejoue EN ENTIER ».

**Comptes** : critères 07 ligne L5 : **1 coché ferme, 5 avancés sous réserve matérielle, 2 non
tenus** (contre 1/8 le 06) · DoD transverse : **7 lignes sur 10** (contre 5) · invariants :
**8 tenus sur 8** (contre 6) · code orphelin non documenté : **aucun** · gloses de traçabilité
fausses : **aucune** · réserves : **3 bloquantes, 6 ouvertes non bloquantes, 9 fermées par la
mesure**.

---

## 2. LE VETO V1 EST LEVÉ — LA MESURE, PAS LA PAROLE

`main` porte la fusion de PR #52 (`1964482`, 2026-09-06 11h44). La question qui commandait tout mon
dossier précédent était : **la fusion a-t-elle emporté le correctif ?** Réponse mesurée : **non.**

**① Les sept symboles** (`git grep -l <symbole> HEAD -- apps/field packages/shared`) :

| Symbole | `lot/l5c` au 06 | **`8e70f39`** |
| --- | --- | --- |
| `CoffreIllisibleError` (F-22) | 0 | **6 fichiers** |
| `ParametresKdfHorsBornesError` (F-25) | 0 | **5** |
| `DonneesSansCoffreError` (2ᵉ ceinture F-22) | 0 | **5** |
| `verifierPolitiqueMotDePasse` (F-23) | 0 | **3** |
| `verifierParametresKdf` (F-25) | 0 | **4** |
| `MotDePasseTropCourtError` (F-23) | 0 | **4** |
| `AnomalieCoffreError` | 0 | **8** |

**② Les cas de test** (`grep -cE "^\s*it\("`) : `coffre-appareil.test.ts` **39** (31 sur `main` au
06) · `coffre.test.ts` **46** (29) · `EcranDeverrouillage.test.tsx` **17** (10) ·
`contexte.test.tsx` **19** (12). **Total 121 contre 82** — non seulement les 27 cas perdus sont
revenus, mais **39 de plus** ont été écrits. `coffre-appareil.ts` : **371 lignes** (183 sur la
branche vetoée, 286 sur `main`).

**③ Le commit de fusion lui-même porte le correctif** : `git grep -c CoffreIllisibleError 1964482`
rend cinq fichiers. La régression n'est jamais entrée dans `main`.

**Ce que je relève quand même, et c'est une remarque de gouvernance, pas un veto** : **aucune entrée
`DECISIONS.md`, aucun fichier de porte ne trace comment V1 a été traité** — ni le désarmement de
l'auto-merge que je réclamais, ni la refusion, ni la re-mesure. Le veto s'est levé par la correction
du code, ce qui est le régime prévu (« le veto se lève uniquement par la correction du code, ou par
une décision écrite »). Mais **la plus grosse alerte de sécurité du lot n'a pas laissé une ligne
d'histoire**, et c'est précisément ce que l'invariant 7 demande à un dépôt d'audit. → **NB-12**.

---

## 3. LES CRITÈRES DU FICHIER 07, LIGNE L5 — COPIÉS MOT POUR MOT, COCHÉS UN PAR UN

> « Démo : écran « Aujourd'hui » §34.2 (agenda agrégé, à-revoir, sync par mission) ; mode avion
> complet sur iPad ET PC ; 1 session de chaque type créée hors ligne ; coupure de courant en pleine
> saisie = zéro perte ; **export de secours créé puis restauré sur un 2e appareil** ; test novice
> < 30 min (A54, guidé strict + grille §33) ; mode écran partagé démontré ; police rendue en mode
> avion »

| # | Critère 07 | Coché | Preuve — ou ce qui manque |
| --- | --- | --- | --- |
| **1** | Écran « Aujourd'hui » §34.2 (agenda agrégé, à-revoir, **sync par mission**) | ❌ | L'écran et l'agenda agrégé sont là et testés (`EcranAujourdhui.tsx` **93,51 %** l., mesuré par moi). **L'aggravation que je signalais le 06 est FERMÉE** : la contradiction des deux pastilles est corrigée par une source unique (`app/etat-sync-affiche.ts`, arbitrage A20 du 2026-09-06, tracé). **Mais « sync par mission » reste incochable avant L6b** : `PortSync` est inerte et rend `indisponible`. **Ce critère du 07 exige de L5 une chose que le 11 §6 attribue à L6** — je le porte en doute de spec **D-6**, plutôt que de le refuser une troisième fois sans le dire |
| **2** | **Mode avion complet sur iPad ET PC** | ⚠️ **moitié automatisable COCHÉE** | Ma mesure du 06 était « `grep setOffline e2e/` → aucune occurrence ». **Elle est caduque** : `e2e/hors-ligne-l5.e2e.ts` existe (PR #75) et joue `@critique mode avion — l'application démarre et reste utilisable réseau coupé` **sur les deux appareils de sa table** : `{ nom: 'PC', viewport 1440×900 }` et `{ nom: 'iPad émulé (paysage)', devices['iPad (gen 7) landscape'] }`. Vert en CI (job `5 · e2e`). **Reste dû** : l'iPad **physique**, limite assumée au 11 §7 (Playwright ne couvre pas le SW sous iOS) |
| **3** | **1 session de chaque type créée hors ligne** | ✅ | `e2e/hors-ligne-l5.e2e.ts:268` — `@critique hors ligne — une session de CHACUN des six types se crée sans réseau`, dans un navigateur réel, `context.setOffline(true)`, vert en CI sur `8e70f39`. **Je coche.** La démo devant Williams reste un geste de porte, pas une preuve manquante |
| **4** | **Coupure de courant en pleine saisie = zéro perte** | ⚠️ **moitié automatisable cochée, ARBITRÉE** | `hors-ligne-l5.e2e.ts:349` — `@critique coupure brutale en pleine saisie — la réponse en cours survit à la mort de l'onglet`, sur un **profil sur disque** rouvert à l'identique (le test refuse un contexte éphémère, qui « prouverait la perte par la mécanique du test »). Le partage entre ce qui s'automatise et ce qui ne s'automatise pas est **tranché** : `DECISIONS.md` 2026-09-06, « Coupure de courant en pleine saisie : quelle moitié s'automatise ? ». **Reste dû** : arracher l'alimentation d'un appareil réel |
| **5** | **Export de secours créé puis restauré sur un 2e appareil** | ⚠️ **07 §13 SATISFAIT** | `hors-ligne-l5.e2e.ts:450` — `@critique export de secours produit hors ligne, puis restauré sur un SECOND profil navigateur` : c'est **littéralement** ce que 07 §13 demandait et que je notais manquant. **`EcranRestauration.tsx` passe de 11,11 % à 100 / 100 / 100 / 100** (mesuré, §5). Domaine : `sauvegarde.ts` 95,21 l. / 94,82 br., `format.ts` et `depot.ts` **100 %**. Conformité 11 §4 **re-vérifiée par moi** : clé dérivée du **mot de passe**, `genererSel()` **neuf à chaque export**, jamais le sel du coffre (`sauvegarde.ts:307-326`). **Reste dû** : le 2ᵉ **appareil physique**, clavier virtuel compris |
| **6** | **Test novice < 30 min (A54, guidé strict + grille §33)** | ❌ **BLOQUANT** | **Les six bloquants d'A54 sont corrigés et testés `@critique`** (§4). **Mais la recette n'a pas été rejouée** : `docs/portes/` ne contient qu'un seul document A54, celui du **2026-09-06**, verdict **NO-GO**, et `git log --since=2026-09-06 -- docs/portes/` ne montre aucun rejeu. 09 §4bis : la porte se rejoue **en entier**. **Le seul verdict A54 au dossier de P-C est un NO-GO** |
| **7** | **Mode écran partagé démontré** | ⚠️ | Inchangé et bien tenu : `EcranEntretien.test.tsx` — `@critique en écran PARTAGÉ, aucune sentinelle interne n'est dans le DOM` et bascule par « E » testée dans les deux sens ; les éléments sont **retirés du rendu**, pas masqués en CSS. **« Démontré » veut dire montré** : geste de porte |
| **8** | **Police rendue en mode avion** | ⚠️ | `e2e/polices.e2e.ts` (émission, service depuis l'origine, précache, peinture d'`Inter Variable`). **Mon KO mineur du 06 est FERMÉ** : `packages/ui/src/tokens.css:165` pose `font-family: var(--typo-police-corps)` à la racine, et `police-racine.test.tsx` le tient par **six cas dont une contre-épreuve** (« la règle retirée, la racine RETOMBE sur la police du navigateur ») et un garde « pose un JETON, jamais un nom de police en dur ». **Reste dû** : le **cold start hors réseau, PWA installée, sur iPadOS** |

### **BILAN : 1 coché ferme (n° 3) · 5 avancés, dus à du matériel ou à une démo · 2 non tenus (n° 1 et n° 6, dont un BLOQUANT).**
Contre **0 coché / 4 non tenus** le 2026-09-06. Le mouvement est réel et il est mesuré.

### Les exigences propres à la porte P-C (09 §4, journée terrain §33.7)

| Critère P-C | État | Preuve |
| --- | --- | --- |
| Session complète en mode avion, **iPad ET desktop** | ⚠️ | Critère 07 n° 2 — émulé vert, physique dû |
| **Coupure de courant = zéro perte** | ⚠️ | Critère 07 n° 4 |
| **Export de secours créé + restauré** | ⚠️ | Critère 07 n° 5 — second profil navigateur vert |
| **Grille §33 : 4 états écran par écran** | ✅ | §4. Le quatrième état est branché sur **12 vues sur 12**, tenu par un `satisfies Record<CodeVue, …>` : une vue nouvelle **ne compile pas** sans son état hors ligne |
| Raccourcis complets · ancres visibles · écran partagé · police hors ligne | ✅ / ⚠️ | Raccourcis et ancres testés `@critique` (inchangé) ; police §33.1 fermée à la racine ; écran partagé à démontrer |
| Session planifiée démarrée **en 1 tap** | ⚠️ non joué | Chemin inchangé et pré-rempli. **Le motif du bouton grisé est corrigé** (PR #70, « les boutons grisés qui parlent »), et **le refus de participation est tracé** (`DECISIONS.md` 2026-09-06 [L5b] + PR #70) — mon doute **D-1 est CLOS** |
| **Aucun verrou en session active de 45 min** | ⚠️ non joué | Tenu par construction (60 min > 45), `verrou.ts` 100 % sur quatre métriques, garde `@critique` sur **six** écrans désormais. **Réserve D-3 toujours ouverte** : une session ouverte mais pas encore `en_cours` reste à 15 min |
| « **Fin de journée** » en un geste | ✅ | **NB-1 FERMÉE par le test** : `finDeJournee.acceptation-b4.test.tsx:226` — `@critique aucun fichier déposé, et CLE_DERNIER_RITUEL n'est PAS écrite`, doublé du versant nominal (`recette-b4:260`). Le rappel de l'invariant 8 ne peut plus s'éteindre à vide |
| **Terminer → note → Valider groupé** | ✅ | Chaîne inchangée (`validation.ts` 100 % l.) ; **son écran sort de 7,69 %** (§5) ; **le bouton « Terminer » existe** (PR #70) — le constat d'A54 « le seul geste est *Quitter l'entretien* » est corrigé |

---

## 4. LES SIX BLOQUANTS D'A54 : CORRIGÉS ET TESTÉS — MAIS NON REJOUÉS

Je les reprends un par un parce que c'est le cœur du second refus de P-C.

| Bloquant A54 | État | Preuve exécutable |
| --- | --- | --- |
| **B1** — « Mot de passe incorrect » au premier usage | **CORRIGÉ** | `app/deverrouillage.acceptation-b1.test.tsx` — `@critique la phrase exacte du rapport A54, sous « Protection non créée », coffre NON appelé` ; `@critique <chemin> : le mot « incorrect » ne se prononce pas, et le coffre reste intact` ; et le cas inverse conservé : `@critique le SEUL chemin où le mot est vrai` |
| **B2** — cul-de-sac « Auditeur inconnu », aucune sortie | **CORRIGÉ** | `App.acceptation-b2.test.tsx` — `@critique l'écran EXACT du blocage — « Nouvel entretien » — n'offre plus « Verrouiller » pour seule issue`, et la contre-épreuve `@critique sur une racine, aucune sortie n'est proposée` (on n'a pas fabriqué un « Retour » qui ment) |
| **B3** — « et des photos » promis, non tenu | **CORRIGÉ** | La promesse est **retirée** (`EcranAccueil.tsx:110` ne porte plus que le commentaire du retrait) et **deux tests interdisent son retour** (`photo.acceptation-b3.test.ts`, `photo.recette-b3.test.ts`). **Le risque RGPD que je signalais — l'auditeur qui photographie avec son téléphone personnel — est éteint à la source** |
| **B4** — `CLE_DERNIER_RITUEL` écrite sans sauvegarde | **CORRIGÉ** | ci-dessus |
| **B5** — l'échec de lecture déguisé en état vide | **CORRIGÉ** | `finDeSession.acceptation-b5.test.tsx` + `recette-b5` — `lecture RÉUSSIE sans session : l'état vide reste l'état vide, avec sa sortie`. Les deux états sont désormais distincts |
| **B6** — deux pastilles de sync contradictoires | **CORRIGÉ** | `app/etat-sync-affiche.ts` (source unique), `pastilleSync.acceptation-b6` (8 cas) + `recette-b6`. Arbitrage tracé (A20, 2026-09-06) ; **le libellé reste à Williams** |

**Le croisement 09 §5.6 est respecté, et il est déclaré dans les fichiers eux-mêmes** :
`recette-b5` porte « Tests de CONCEPTION écrits par A20 avec le correctif ; l'acceptation revient à
A27 » et `acceptation-b5` porte « Écrit par A27, qui n'a produit aucune ligne de ». C'est exactement
la discipline que je demandais.

**Et pourtant le critère reste NON TENU.** Six correctifs testés ne sont pas une recette. Le
critère 07 dit « **test novice < 30 min** » : c'est un parcours humain chronométré, pas une suite de
gardes. **Réserve bloquante B3-bis.**

---

## 5. LA RÉSERVE B4 (couverture des deux écrans) — FERMÉE À MOITIÉ, MESURÉE PAR MOI

Exécution ciblée (la suite complète étant interdite par la contention CPU) :
`npx vitest run --project interface --coverage apps/field/src/ecrans/journee/` →
**15 fichiers, 156/156 verts.**

| Fichier | 2026-09-06 | **2026-09-07** | Verdict |
| --- | --- | --- | --- |
| `ecrans/journee/EcranRestauration.tsx` | 11,11 % l. / 33,33 f. | **100 / 100 / 100 / 100** | **fermé** |
| `ecrans/journee/EcranFinDeSession.tsx` | 7,69 % l. / 0,00 f. | **66,05 l. / 30,00 f. / 66,66 br.** | **ouvert — sous 90** |
| `EcranFinDeJournee.tsx` | 98,18 | 98,25 / 100 / 89,18 | ok |
| `EcranAujourdhui.tsx` | 93,14 | 93,51 / 68,75 / 88,00 | ok |
| `EcranAgenda.tsx` · `EcranPilote.tsx` · `coquille-l5c` · `vue-initiale` · `BandeauMiseAJour` | — | 96,37 · 97,72 · 100 · 100 · 100 | ok |

**L'angle mort structurel est fermé** : `multi-appareils.test.tsx` — le fichier qui porte les quatre
gardes `@critique` de §33 — travaille désormais sur **six** écrans, `EcranRestauration` (ligne 351)
et `EcranFinDeSession` (ligne 362) **inclus**. Les deux écrans que la grille ne mesurait pas sont
mesurés.

**Ce qui reste** : `EcranFinDeSession.tsx` est à **66 % de lignes et 30 % de fonctions**, et
`apps/field/src/ecrans/**` **n'est toujours pas** dans `.github/coverage-critical-paths.json`
(vérifié : 18 globs critiques, aucun sur `ecrans/**`). **Ce chiffre reste donc invisible au job
`couverture ≥ 90 %`, qui est vert.** Mon doute **D-4** (2026-09-03, transmis à A01) est **toujours
sans arbitrage** — et il est maintenant chiffré deux fois plutôt qu'une.

---

## 6. TRAÇABILITÉ E1-E47 — LES DEUX SENS

### 6.1 Sens 2 — **code → exigences** (contrôle anti-orphelin)

`pnpm check:tracabilite` → **RC=0, 1253 citations, 551 fichiers, aucune incohérence** (contre 1008 /
460 le 06). **Aucune glose fausse** : les citations résistent à l'ouverture de la section citée sur
l'échantillon que j'ai rouvert (`agenda/**`, `sauvegarde/**`, `ecrans/journee/**`,
`app/capacites-hors-ligne.ts`, `app/etat-sync-affiche.ts`, `siege/**`, `hq/ecrans/design/**`).

**Code livré depuis mon contrôle, rattaché un par un** :

| Artefact neuf | Rattachement | Juste ? |
| --- | --- | --- |
| `app/capacites-hors-ligne.ts`, `app/etat-sync-affiche.ts` | E6 · E44 · E23 | oui — §33.2, quatrième état |
| `siege/{connexion,EcranConnexion,coquille-siege}` | E13 · E23 · E33 | oui — chemin de production de l'identité d'auditeur (PR #80) |
| `hq/ecrans/design/**` + `packages/ui/src/inventaire.ts` | **E27 · E44 · E22** | oui — §33.5 ; décision A01 du 2026-09-07 sur l'app hôte |
| `e2e/{hors-ligne-l5,accessibilite-toutes-vues-l5,budget-chiffrement-l5}.e2e.ts` | E6 · E44 · E33 | oui — ils **portent** les critères 07 n° 2/3/4/5 |
| `api/src/scoring/**`, `api/src/domaines/export/**`, `hq/api/requetes-export.ts` | E27/E28 · E31 | **hors périmètre P-C** (L7c/L8) — contrôlés à leur porte |

**Orphelins fonctionnels** (`check:graphe-modules`, RC=0, 237 modules, 0 import pendu) :
25 modules dont le seul consommateur est un test. Deux méritent d'être nommés au dossier de porte :

- **`apps/field/src/sauvegarde/photos.ts`** — `compresserPhoto` n'a **toujours aucun consommateur de
  production** (`grep -rn "compresserPhoto" apps/ e2e/ packages/` → sa définition et ses tests).
  **Documenté** : `DECISIONS.md` 2026-09-05, lot **L5d** après P-C, avec obligation littérale de
  déclarer le manque au contrôle A02 de P-C — **c'est fait, ici, pour la seconde fois**. Le
  **contenu** du lot L5 (« compression photos R2 », fichier 07) reste donc **incomplet**, la
  **promesse** en revanche n'est plus faite à l'auditeur (B3 fermé).
- `apps/api/src/scoring/moteur.ts` — L8 en cours, état normal sous TDD (09 §3-2). Hors P-C.

**Code orphelin non documenté : AUCUN.** Le contrôle anti-orphelin passe.

### 6.2 Sens 1 — **exigences → code**

| Exigence | 2026-09-06 | **2026-09-07** | Ce qui manque encore |
| --- | --- | --- | --- |
| **E6** — hors ligne total, PC **et** tablette | partiellement amorcée, « ne passe pas à couverte : aucun E2E hors ligne » | **le motif du refus est levé** : 4 scénarios `@critique` hors ligne en navigateur réel, sur deux gabarits d'appareil | iPad physique (11 §7) |
| **E12** — entretiens, à-revoir, notes, ad hoc | partiellement amorcée | idem + « Terminer » et refus tracé (PR #70) | démo sur données réelles |
| **E13** — écran 3 zones, enregistrement continu | partiellement amorcée | idem ; la **mise en colonnes peinte** reste non mesurée (`jsdom` n'évalue pas les media queries) | recette d'appareils `LOT_L5.md` §4 |
| **E23** — novice autonome < 30 min | **EN RECUL DÉCLARÉ (NO-GO)** | **les 6 causes du NO-GO sont corrigées et testées** ; **l'exigence reste NON MESURÉE** faute de rejeu | B3-bis |
| **E24** — validation obligatoire | partiellement amorcée, écran à 7,69 % | écran à **66 %**, geste « Terminer » livré | couverture de l'écran |
| **E33** — sécurité / chiffrement local | **EN RECUL MESURÉ (V1)** | **rétabli et renforcé** : 121 cas sur les 4 fichiers, budget A28 mesuré | F-28 (§8) |
| **E38** — sauvegarde terrain | export livré, rituel qui s'éteint à vide | **export restauré sur un second profil, rituel réparé et testé** | sync (L6) · 2ᵉ appareil physique |
| **E44** — grille §33 | 4 états : 4/11 · `/design` inexistante | **4ᵉ état 12/12 tenu par le type · `/design` livrée avec garde d'exhaustivité · axe 12/12** | — |
| **E45** — cockpit « Aujourd'hui » | partiellement amorcée | idem, pastille unique et honnête | sync par mission → L6b |
| **E36 / E43** — traçabilité et exécutabilité autopilote | — | **EN RECUL** — voir 6.3 | NB-9, NB-13 |

**Aucune exigence ne passe à `couverte`**, et le motif n'a pas changé : L6, ou une machine réelle.

### 6.3 L'état des fichiers de traçabilité et de décision — **deux défauts mesurés**

1. **`docs/TRACABILITE_E1-E47.md` (3 320 lignes) : NB-9 est ENTIÈREMENT OUVERTE, et aggravée.**
   Les sections **L (L5b) et M (L5a) sont présentes deux fois** — `## M.7/M.8/M.9` aux lignes
   2661/2674/2698 **et** 3122/3135/3159 ; `## L.1…L.6` à 2744-2856 après une première occurrence.
   ≈ **460 lignes dupliquées** dans un fichier déclaré « append-and-amend, jamais réécrit ».
   **Je contredis la mesure du brief sur un point** : « aucune section L5c » n'est **pas** fermé.
   Les 21 occurrences de « L5c » sont des **renvois écrits avant L5c** (« l'export est L5c », « les
   écrans sont L5c »), et **la moitié d'entre elles vit dans la copie dupliquée**. Le dernier titre
   du fichier est `## N.5 — Synthèse chiffrée au 2026-09-03, après L7a` : **la matrice s'arrête au
   2026-09-03 et ignore L5c, L5 complet, L7b, L7c et L8.** C'est mon instrument de travail, il porte
   **E36** et **E43**, et il a cinq incréments de retard.
2. **`DECISIONS.md` : 21 entrées DUPLIQUÉES — défaut NEUF, non signalé jusqu'ici.**
   `grep -c "^## "` → **325** ; `grep "^## " | sort -u | wc -l` → **304**. Un bloc du 2026-09-02/03
   est **ré-inséré entre les lignes 8613 et 9170**, après des entrées du 2026-09-05.
   Vérifié verbatim : `diff <(sed -n '8097,8130p') <(sed -n '8980,9013p')` → **identiques**.
   `pnpm check:decisions` le pressent (« ⚠ la date de l'entrée … recule ») **mais ne bloque pas et
   ne voit pas la duplication**. 11 §9bis dit *append-only* : une insertion au milieu est une
   réécriture d'historique. **Même famille de défaut que ①, probablement la même fusion.** → **NB-13**.

---

## 7. LA DoD TRANSVERSE (CLAUDE.md §5), COCHÉE PAR EXÉCUTION

| # | Ligne de la DoD | État | Preuve |
| --- | --- | --- | --- |
| 1 | lint + typecheck stricts = **0 erreur** | ✅ | CI `8e70f39` : jobs `1 · lint` et `2 · typecheck` verts · `pnpm verify:rapide` RC=0 (pilote, 14 gardes + lint + format:check + typecheck) |
| 2 | tous les tests verts, **aucun test skippé** | ✅ | CI : `3 · unit`, `4 · integration`, `5 · e2e` verts, **21 jobs sur 21**, aucun `skipped`. `pnpm check:no-skipped-tests` **RC=0 — 181 fichiers de test** (132 le 06). Ma passe ciblée : 156/156 |
| 3 | **couverture ≥ 90 % sur les modules critiques — mesurée** | ✅ **avec une réserve nommée** | Job `couverture ≥ 90 % (modules critiques — 09 §3)` **vert** sur le commit contrôlé. **Réserve inchangée** : `ecrans/**` hors des 18 globs, donc `EcranFinDeSession` à 66 % **n'est pas vu** par le seuil (§5, D-4) |
| 4 | migrations **up/down exécutées sur staging** | ❌ | **Staging existe et est déployé** (`8 · deploy-staging → Coolify → déploiement vérifié`, vert). **Mais le déploiement n'applique aucune migration** : `db:migrate`/`db:migrate:check` ne vivent que dans `infra/scripts/deploy.sh` (chemin de **production**), et `deploy-staging.yml` ne les appelle pas (`grep -n "migrate" .github/workflows/deploy-staging.yml` → **rien**). **Ni up ni down n'ont été joués sur staging.** Delta de schéma du lot L5 : **vide** — le risque est nul, la ligne n'est pas cochée |
| 5 | tout écran livré avec ses **4 états** (§33.2) | ✅ | **De 4/11 à 12/12.** `app/capacites-hors-ligne.ts` + `app/hors-ligne.test.tsx` : `satisfies Record<CodeVue, …>` — **une vue nouvelle ne compile pas sans son état hors ligne**, et le fichier le prouve par l'expérience (« le douzième est arrivé le jour même, PR #80 : il n'a PAS compilé »). États vide/chargement/erreur : `ZoneEtat` unique sur l'accueil (les deux états vides concurrents sont fusionnés), `finDeSession` sépare erreur et vide (B5) |
| 6 | **axe-core vert** | ✅ | `e2e/accessibilite-toutes-vues-l5.e2e.ts` (PR #82) balaye **12 vues sur 12**, table engendrée depuis le registre, **anti-vacuité en trois temps** (dont « `color-contrast` a réellement tourné »), et les 4 vues qui changent hors ligne sont balayées **réseau coupé**. Plus `accessibilite-design.e2e.ts` et `accessibilite-l7b.e2e.ts`. Job `5 · e2e` vert. **Ma réserve NB-6 est fermée** |
| 7 | **`@filrouge` vert sur FIL-TPE ET FIL-GC** | ⚠️ | Vert en CI sur les deux missions (`l1-filrouge`, `l3-filrouge`, job `4 · integration`). **Mais TOUJOURS NON ALLONGÉ** : `grep -rln "@filrouge"` → `apps/api/tests/{l1,l3}-filrouge`, `apps/api/tests/aide/fil-rouge.ts`, et dans `e2e/socle.e2e.ts` **une seule ligne, en commentaire**. 09 §4bis veut « session hors ligne, cotation, à-revoir, photo (L5) » **dans le scénario cumulatif**. Ces gestes existent maintenant en E2E — mais **hors du fil rouge**, donc hors du parcours de bout en bout rejoué à chaque merge. **Ma réserve R6 de L5b, ouverte depuis quatre incréments** |
| 8 | **README de l'app à jour** | ❌ | `apps/field/README.md:12` : « **## État au lot L5b** » ; `:31` : « **PAS encore livré — c'est L5c (A23)** : l'agenda et le cockpit “Aujourd'hui” (§34.2), les cinq types de session autres qu'`entretien`, **terminer ≠ valider** côté écran, les photos, et l'**export de secours** ». **Tout cela est dans `main` depuis le 2026-09-06** (`git log --diff-filter=A -- apps/field/src/agenda/jour.ts` → `1964482`). **Réserve R2 de L5b, fermée le 03, rouverte le 06, TOUJOURS ouverte le 07** — troisième passage. Le README lui-même contient la phrase « un README qui présente comme à venir ce que le commit contient n'est pas incomplet, il est FAUX » : **il se décrit** |
| 9 | aucun TODO/FIXME sans entrée | ✅ | `grep -rn "TODO\|FIXME" apps/*/src packages/*/src` → **vide** |
| 10 | **diff schéma-vs-04 = zéro écart** | ✅ | Job `6 · schema-diff (vs fichier 04)` **vert** sur `8e70f39` |

### **DoD : 7 lignes sur 10** (contre 5 le 06) · **2 non tenues** (4, 8) · **1 partielle** (7).

**Gardes du dépôt exécutés par moi, tous RC=0** : `check:tracabilite` (1253 citations, 551 fichiers)
· `check:no-skipped-tests` (181 fichiers) · `check:invariants` · `check:decisions` (325 entrées,
**1 avertissement**, §6.3) · `check:porte-journal` (478 fichiers, porte d'écriture unique) ·
`check:graphe-modules` (237 modules, 0 import pendu) · `check:isolation-reseau` (13 attachements,
seul Caddy sort). Le pilote a exécuté les 14 gardes de `verify:rapide`, RC=0.

---

## 8. LES 8 INVARIANTS, UN PAR UN

| # | Invariant | État | Preuve |
| --- | --- | --- | --- |
| **1** | Offline-first, **UUID v7 client**, push idempotent | ✅ | `grep -rn "uuidv7" apps/api/drizzle/*.sql` → **trois commentaires qui rappellent l'interdiction**, aucune fonction SQL. Créations locales par `uuidv7()`. L'offline-first est désormais **prouvé en navigateur**, pas seulement déclaré (`hors-ligne-l5.e2e.ts`). *Push idempotent = L6* |
| **2** | Aucune référence client dans le code | ✅ | `check:invariants` RC=0 ; le nom du fichier `.axionbackup` est testé pour ne porter ni nom de client ni donnée personnelle |
| **3** | RBAC serveur, financier admin, écritures de sync réservées au propriétaire | ✅ **sans objet sur L5** | L5 ne touche pas `apps/api`. Acquis à P-B. *Point de vigilance porté par A51 le 2026-09-07 : un futur compte de scan ZAP devra être du rôle le plus faible, jamais `admin`* |
| **4** | **Aucune couleur/taille en dur** | ✅ **mesuré** | `grep -rnE "#[0-9a-fA-F]{3,8}\|rgb\(\|hsl\("` sur `apps/field/src` **et** `apps/hq/src` (hors tests) → **vide**. Gardes `@critique` sur `journee.css` et sur les `var(--jeton)`. La page `/design` ajoute un garde de non-régression sur le DOM produit |
| **5** | Interface 100 % française, horodatages **UTC** | ✅ | Horloge unique `local/horloge.ts` imposée par ESLint ; aucun libellé anglais visible |
| **6** | Le terrain collecte, le siège produit | ✅ | Renforcé par une décision : `/design` va dans `apps/hq` **parce que** le paquet terrain est précaché et sous quota (`DECISIONS.md` 2026-09-07, motif (a) — invariant 6 cité nommément) |
| **7** | Toute correction = révision tracée ; **rien n'est jamais silencieusement écrasé** | ✅ **rétabli** | **La rupture ① (V1) est réparée** : les 404 lignes et les 27 cas sont revenus, avec 39 de plus. **② `validation.ts:151` (`valideeLe` remis à `null`) subsiste — mais il n'est PAS silencieux** : le fichier le documente sous le titre « ce qu'un déverrouillage DÉTRUIT, dit avant de le faire — majeur M8 (A29) », et `DECISIONS.md` 2026-09-05 porte « Le motif d'un déverrouillage d'entretien n'a nulle part où se poser ». **Écart connu, tracé, non refermé** → NB-11 |
| **8** | Sauvegarde terrain : sync ≥ 1×/j + **export testé** ; alerte au-delà de 24 h | ✅ **la moitié « export » est tenue** | Export conforme au 11 §4 (sel neuf, clé du mot de passe), **restauré sur un second profil navigateur en E2E**, écran de restauration à 100 %. **Le rituel de fin de journée ne s'éteint plus à vide** (B4, testé `@critique` dans les deux sens). Côté serveur, `Test de restauration nocturne` vert le 2026-09-07. *La sync elle-même reste L6* |

**8 invariants tenus sur 8** (contre 6 le 06).

**Interdictions 11 §2** : fonction SQL v7 ✅ · Next.js ✅ (absent des `package.json`) · Prisma ✅ ·
CORS ✅ · MinIO non exposé ✅ (`check:isolation-reseau`) · données personnelles dans pino ✅
(`check:porte-journal`) · secret versionné ✅ (`gitleaks` vert en CI) · **aucun test skippé ✅ — et
cette fois aucun test supprimé non plus, mesuré** (§2). **Aucune infraction.**

---

## 9. RÉSERVES — STATUT DE CHACUNE

### 9.1 Fermées par la mesure (9)

| Réserve | Fermée par |
| --- | --- |
| **V1** — F-22/F-23/F-25 annulés par la fusion | 7 symboles revenus, 82 → **121** cas de test, fusion `1964482` porteuse (§2) |
| **B4** *(moitié)* — `EcranRestauration` à 11,11 % | **100 / 100 / 100 / 100** mesuré ; entré dans `multi-appareils.test.tsx` |
| **NB-1** — `CLE_DERNIER_RITUEL` écrite sans sauvegarde | `@critique` dans les deux sens (`finDeJournee.acceptation-b4:226`) |
| **NB-2** — 4 états sur 4 écrans / 11 | **12/12**, tenu par le type (`capacites-hors-ligne.ts`) |
| **NB-6** — axe sur 3 vues / 11 | **12/12**, table engendrée depuis le registre, anti-vacuité |
| **NB-7** — `/design` inexistante (§33.5) | `apps/hq/src/ecrans/design/**` + `packages/ui/src/inventaire.ts` : `satisfies Record<NomComposantUI, FicheComposant>` — **un composant exporté et absent NE COMPILE PAS**. Décision A01 du 2026-09-07 sur l'app hôte |
| **NB-10** — budget A28 « chiffrement < 50 ms/écriture » jamais mesuré | `e2e/budget-chiffrement-l5.e2e.ts` + `DECISIONS.md` 2026-09-07 (les deux enveloppes, pas l'écriture Dexie) + revue croisée `REVUE_A29_L5_BUDGET_CHIFFREMENT_2026-09-07.md` |
| **D-1** — le refus de participation n'a aucun chemin | Décision `DECISIONS.md` 2026-09-06 [L5b] + PR #70 (« le refus tracé ») |
| **§33.1** — `Times New Roman` à la racine | `tokens.css:165` + `police-racine.test.tsx` (6 cas, contre-épreuve incluse) |

### 9.2 BLOQUANTES pour P-C (3)

| # | Réserve | Section engagée | Ce qui la lève |
| --- | --- | --- | --- |
| **B3-bis** | **La recette novice n'a pas été rejouée.** Les six bloquants sont corrigés et testés, mais le seul verdict A54 au dossier est le **NO-GO du 2026-09-06** | **07 ligne L5, critère n° 6** · **09 §4** (P-C) · **09 §4bis** (« la porte se rejoue EN ENTIER ») · E23 | un rapport A54 daté, **parcours complet**, verdict GO |
| **NB-3-bis** | **ZAP : une condition sur deux.** ① couverture étendue : **FAITE et éprouvée en réel** — run `34125104959`, `CODES: terrain=2 console=2 api=2`, trois cibles atteintes (`/`, `/hq/`, `/api/v1/health`), trois gardes neufs. ② **`ZAP_BLOQUANT` reste à `'false'`** (`zap-baseline.yml:196`) | arbitrage `DECISIONS.md` du **2026-09-05** : « le dossier de porte P-C coche donc **deux** choses : la couverture étendue **puis** `ZAP_BLOQUANT='true'` » | **Williams** : ① lire le décompte par sévérité sur la page du run (**il expire le 2026-10-07** et le conteneur du pilote ne peut pas l'atteindre), ② trancher l'entrée « Authentification comprise » du 2026-09-07 — **les deux options exigent un compte de test sur staging, qui n'existe pas** |
| **NB-9-bis** | **La matrice de traçabilité est inutilisable en l'état** : ≈460 lignes dupliquées, dernier titre daté du **2026-09-03**, aucune section L5c / L5 / L7b / L7c / L8 | **E36**, **E43** · 09 §3 étape 6 · DoD propre A02 (« matrice E1-E47 à jour dans les deux sens ») | dédoublonner, puis ajouter la section L5/P-C. **Je ne peux pas signer « traçabilité à jour » sur un fichier qui a cinq incréments de retard**, même si j'ai fait le travail des deux sens dans le présent dossier |

### 9.3 Ouvertes, non bloquantes pour P-C (6)

| # | Réserve | Portée |
| --- | --- | --- |
| **B4-reste** | `EcranFinDeSession.tsx` : **66,05 l. / 30,00 f.**, et `ecrans/**` reste hors du seuil → chiffre **invisible** au job vert. Doute **D-4** sans arbitrage depuis le 2026-09-03 | A01 |
| **NB-4** | **La chaîne photo n'existe pas** ; `compresserPhoto` sans consommateur ; 03 §17.4 non tenu. **Documenté (L5d, après P-C)** ; la promesse trompeuse est retirée, donc le risque RGPD est éteint | L5d |
| **NB-5** | **`@filrouge` non allongé du segment L5** (09 §4bis) — quatre incréments | L6 |
| **NB-8** | Compteur du plafond étage 1 : **L5c a sa ligne** (`AMELIORATIONS.md:33`, ~0,05 j) — **L5a n'en a toujours aucune**. Le plafond 0,5 j/lot reste **invérifiable sur L5a**. Ma réserve NB5 de L5a, jamais fermée | gouvernance |
| **NB-11** | Réserves A29 restées ouvertes : **M3** (aucun filtre `conductedBy` dans l'agenda), **M6** (photos sans appelant), **M8** (`valideeLe` effacé — **documenté**, invariant 7), **m2** (clé React) | L5d / L6 |
| **NB-12** *(neuve)* | **Le traitement de V1 n'a laissé aucune trace** : ni entrée `DECISIONS.md`, ni fiche de porte, ni ligne de journal sur le désarmement de l'auto-merge, la refusion et la re-mesure. La plus grosse alerte de sécurité du lot s'est réglée en silence | gouvernance |
| **NB-13** *(neuve)* | **`DECISIONS.md` porte 21 entrées dupliquées** (325 titres / 304 uniques), un bloc du 02-03/09 ré-inséré après des entrées du 05/09. `check:decisions` avertit sur la date mais **ne voit pas la duplication**. 11 §9bis : *append-only* | gouvernance |
| **NB-14** *(neuve)* | **`docs/journal/` s'arrête au 2026-09-03.** 09 §5.4 demande à chaque fin de journée d'autopilote « résumé de 10 lignes dans le journal **+ une ligne de burn-down** (consommé/restant par lot vs 26 j-h) ». **Quatre journées manquent**, et P-DESCOPE est au **15/09** : le 09 §4 veut cette porte « FACTUELLE, pas une impression ». `ETAT.md` est tenu, lui, et remarquablement | P-DESCOPE |

---

## 10. CE QUI RESTE DÛ À UNE MACHINE RÉELLE — LA LISTE DES 17, REMISE À JOUR

**Six points sur dix-sept sont devenus jouables depuis le 2026-09-06**, et je le dis aussi
précisément que j'avais dit le contraire. **Je contredis le brief sur deux points**, signalés ⚠.

### A. Ce qui est devenu JOUABLE — et déjà joué (6)

| Ancien n° | Point | Comment il est tombé |
| --- | --- | --- |
| **4** | 1 session de chacun des 6 `kind`, hors ligne | `hors-ligne-l5.e2e.ts:268`, `@critique`, vert en CI. **Le mur « aucune identité d'auditeur sans serveur » est levé** par `e2e/fixtures/appareil-terrain.ts` — appareil équipé **hors ligne**, coffre créé, auditeur rattaché, mission semée, arbitré par deux entrées `DECISIONS.md` du 2026-09-06 |
| **8** *(moitié)* | Mode avion sur PC **et iPad émulé** | `hors-ligne-l5.e2e.ts:79-194`, deux gabarits d'appareil |
| **10** *(moitié)* | Coupure en pleine saisie | `hors-ligne-l5.e2e.ts:349`, profil sur disque rouvert ; partage automatisable/manuel **arbitré** le 2026-09-06 |
| **11** *(moitié)* | Export restauré sur un **second profil navigateur** — c'est le libellé exact de 07 §13 | `hors-ligne-l5.e2e.ts:450` |
| **14** | Cibles tactiles ≥ 44 px **sur les deux écrans qu'aucun garde ne mesurait** | `multi-appareils.test.tsx` : `finDeSession` et `restauration` sont entrés dans la table des gardes `@critique` |
| **—** | Accessibilité de tous les écrans | `accessibilite-toutes-vues-l5.e2e.ts` : 12/12, dont 4 réseau coupé |

### B. Dû à un SERVEUR ou à un HUMAIN (4)

| N° | Point | Motif exact du blocage |
| --- | --- | --- |
| **1-3** | Embarquement réel FIL-TPE/FIL-GC · cockpit sur vraies données · entretien complet de bout en bout | ⚠️ **Je nuance le brief.** Ce n'est plus « impossible sans compte » : la fixture E2E équipe un appareil sans serveur. Ce qui reste **strictement** dû à un compte d'auditeur sur staging, c'est **le segment amont** : `POST /v1/auth/login` réel → `connexionSiege` → **premier pull** de mission. Le reste du parcours est jouable dès aujourd'hui |
| **5** | Les 5 formes de saisie (`money`, `date`, `single_choice`, `multi_choice` ≥ 2 options, `table`) **rendues, puis relues après réouverture** | inchangé — recette d'appareils `LOT_L5.md` §4. Ne dépend **pas** d'un serveur : jouable dès qu'une session existe, donc **jouable maintenant** avec la fixture ⚠️ |
| **6** | **Migrations up/down sur STAGING** | **Confirmé, et j'ajoute le pourquoi** : `deploy-staging.yml` passe par Coolify et **n'appelle jamais** `db:migrate` — seul `infra/scripts/deploy.sh` (chemin de production) le fait. Un `--down-to 0` sur staging est **destructif** : geste humain, **Williams** |
| **7** | ZAP **authentifié** sur `/hq` et `/api`, puis `ZAP_BLOQUANT='true'` | **La moitié non authentifiée est faite et éprouvée en réel.** Le reste attend **un compte de test sur staging (inexistant)** et l'arbitrage de l'entrée du 2026-09-07 — **Williams**, avec les trois conditions qu'A51 s'impose (rôle le plus faible, pas de compte non humain sans écrit, artefact de CI 30 j) |

### C. Dû à un APPAREIL PHYSIQUE — aucune émulation ne les donne (5)

| N° | Point | Pourquoi l'émulation ne suffit pas |
| --- | --- | --- |
| **8-bis** | Mode avion **RÉEL** sur **iPad physique** | 11 §7, limite assumée : Playwright ne couvre pas les service workers sous iOS |
| **9** | Police **peinte** après **cold start hors réseau**, PWA **installée** | le précache est prouvé, la peinture par iPadOS ne l'est pas |
| **10-bis** | **Coupure de COURANT** (arracher l'alimentation, pas tuer l'onglet) | seule une coupure réelle exerce le vidage de cache du système de fichiers |
| **11-bis** | Export restauré sur un **DEUXIÈME APPAREIL**, mot de passe au clavier virtuel | c'est le geste qui protège l'invariant 8 |
| **12 · 13** | Session de 45 min **sans toucher l'écran** (Wake Lock Safari) · **les 3 lignes de `LOT_L5.md` §4** : iPad paysage ≥ 1024 px **trois zones côte à côte**, PC ≥ 1280 px, iPad portrait **repli en deux panneaux** | **`jsdom` n'évalue pas les media queries** : la mise en colonnes **peinte** — le livrable-titre de L5b (03 M3.1) — n'est mesurée par **aucun** test. La note dit : **si l'une des trois échoue, P-C n'est pas franchie** |

### D. Dû à une DÉMO ou à une RECETTE humaine (2)

| N° | Point | État |
| --- | --- | --- |
| **15 · 16** | Écran partagé **démontré** devant témoin · ancres de cotation visibles à l'œil sur des questions réelles | prouvés en test, à montrer |
| **17** | **Recette novice n° 1 REJOUÉE EN ENTIER** | **le bloquant B3-bis**. ⚠️ **Partiellement jouable dès maintenant** : la fixture d'appareil équipé lève l'obstacle qui avait arrêté A54 à t+1 min. Ce qui manque pour un parcours *intégral* reste le segment amont (compte + premier pull) |

---

## 11. CE QUE JE N'AI PAS PU VÉRIFIER, ET QUI DOIT ÊTRE DIT

1. **Je n'ai pas rejoué la suite complète** (contention CPU, consigne du pilote). Je m'appuie sur la
   **CI du commit contrôlé**, que j'ai lue moi-même job par job — pas sur une déclaration.
   Mes exécutions propres : les 7 gardes du §7 et 156 tests d'interface ciblés.
2. **Je n'ai pas ouvert de navigateur.** Tout ce que je dis des écrans vient d'un test, du code, ou
   d'un rapport que j'ai recoupé.
3. **Je n'ai pas lu le rapport ZAP** : le décompte par sévérité vit dans l'artefact et le résumé du
   job `34125104959`, que le conteneur ne peut pas atteindre. Je constate la **configuration** et le
   **verdict d'agrégation**, pas le contenu des alertes. **C'est le chiffre dont Williams a besoin.**
4. **Aucun verdict A51 ne porte sur `.axionbackup`.** `docs/securite/` ne contient que
   `VERDICT_A51_L5A.md`, écrit quand le fichier « n'existait que dans des commentaires », et qui
   laisse **F-28 « partiellement tenu »** (une seule KEK, quatre usages, `info` non séparé).
   J'ai vérifié le point le plus important — **sel neuf à chaque export** (`sauvegarde.ts:307`), ce
   qui rend les clés distinctes de fait — mais **la relecture sécurité du livrable crypto le plus
   sensible de L5c n'a jamais eu lieu sur le code livré**. → à ordonner avant P-E.
5. **Je n'ai pas vérifié la revue croisée sur chaque PR fusionnée depuis le 06.** Mon bloquant **B2**
   du 2026-09-06 (« étape 4 non close ») : les commits que je nommais ont été **squashés** et
   n'existent plus ; `ETAT.md` montre des revues A29 rendues sur #81, #89 et le budget A28, et A17
   sur #88/#91/#93 avec fiches déposées. **Je considère B2 close pour les PR tracées** et je ne
   peux ni confirmer ni infirmer pour celles qui ne le sont pas.

---

## 12. DOUTES DE SPÉCIFICATION À PORTER EN `DECISIONS.md`

- **D-2** *(2026-09-06, toujours sans entrée)* — **Aucun garde ne compare le nombre de cas de test
  avant et après une fusion.** V1 est passé exactement par là. Ce n'est écrit nulle part dans le
  pack : je ne l'exige pas, je le propose. **A01.**
- **D-3** *(toujours sans entrée)* — **Le verrou à 15 min sur une session ouverte mais pas encore
  `en_cours`** (l'auditeur qui attend son interlocuteur). 05 §9.7 nomme 15/60 ; 03 §33.7 parle de
  « session active de 45 min ». **A01.**
- **D-4** *(entrée du 2026-09-03, sans arbitrage)* — **`apps/field/src/ecrans/**` doit-il entrer au
  seuil ?** Chiffré deux fois maintenant : un écran à 66 %, invisible au garde vert. **A01.**
- **D-5** *(toujours sans entrée)* — `LOT_L5.md` §5-3, « qui écrit `packages/shared/src/sync.ts` ? » :
  `local/contrat-sync.ts:4` **cite un arbitrage absent du registre**. « Une décision non tracée dans
  ce format n'existe pas » (11 §9bis). **A01.**
- **D-6** *(neuf)* — **Le critère 07 n° 1 exige de L5 la « sync par mission »**, alors que le 11 §6
  attribue toute la synchronisation à L6 et que `LOT_L5.md` §3.6 impose un port **inerte**. Ce
  critère est **structurellement incochable à P-C**. Faut-il l'y laisser (et P-C reste ouverte
  jusqu'à L6b), ou constater qu'il appartient à P-D ? **Je refuse de trancher seul un critère de
  porte. Williams**, ou A01 par la précédence.
- **D-7** *(neuf)* — **Faut-il un garde d'unicité sur `DECISIONS.md` et
  `docs/TRACABILITE_E1-E47.md` ?** Deux fichiers déclarés append-only portent chacun un bloc
  dupliqué par une fusion, et aucun garde ne mord (§6.3). **A01.**

---

## 13. CE QUE CE REJEU A DE MEILLEUR

- **La méthode « le garde est dans le type » s'est généralisée, et elle marche.**
  `capacites-hors-ligne.ts`, `catalogue.ts` de `/design`, la table des parcours axe, la table des
  écrans de `multi-appareils` : quatre fichiers différents, la même idée — **une liste écrite à la
  main se désynchronise, un `satisfies Record<Clé, …>` ne le peut pas**. Le fichier des capacités le
  prouve par l'expérience : la douzième vue est arrivée le jour même et **n'a pas compilé** avant
  d'être déclarée. **C'est la réponse structurelle à la famille de défauts que je documentais
  depuis L5a**, et elle n'a été demandée par personne.
- **Les correctifs A54 sont doublés, conception et acceptation, par deux agents distincts, et ils
  le déclarent en tête de fichier.** Le croisement 09 §5.6 n'est plus une règle qu'on rappelle : il
  est écrit dans le code qu'il gouverne.
- **Le scan ZAP à trois cibles a réellement tourné**, et le bloc `ETAT.md` qui le rapporte dit
  d'abord ce qu'il n'a **pas** mesuré. C'est la bonne façon de rendre un chiffre.

---

## 14. VERDICT ET SUITE DE LA CHAÎNE

> # 🟠 CONFORME SOUS RÉSERVE — **VETO LEVÉ**, **P-C NON FRANCHISSABLE**
>
> **Critères 07 ligne L5** : **1 coché ferme, 5 avancés sous réserve matérielle, 2 non tenus**
> (n° 1 → L6b ; **n° 6 → BLOQUANT**). **DoD transverse** : **7/10**. **Invariants** : **8/8**.
> **Traçabilité sens 1** : aucune exigence à `couverte`, six déplacées. **Sens 2** : aucune glose
> fausse, **aucun code orphelin non documenté**.
> **Écarts NON documentés : AUCUN — le droit de veto ne s'exerce sur rien.**
> **Réserves : 3 bloquantes (B3-bis, NB-3-bis, NB-9-bis) · 8 ouvertes non bloquantes · 9 fermées.**

**Ordre des actions :**

1. **A54 — rejouer la recette novice EN ENTIER** (09 §4bis, jamais « les six points corrigés »).
   La fixture `e2e/fixtures/appareil-terrain.ts` lève le mur qui l'avait arrêtée ; le segment amont
   (compte + premier pull) sera déclaré non joué s'il l'est.
2. **A20/A23 — le README de `apps/field`** : troisième passage de la même réserve. C'est une heure
   de travail et c'est le premier fichier que lit un arrivant.
3. **A26/A27 — `EcranFinDeSession` de 66 % à > 90 %** (jamais A23 — 09 §5.6).
4. **A01 — dédoublonner `docs/TRACABILITE_E1-E47.md` et `DECISIONS.md`**, puis **ajouter la section
   L5/P-C à la matrice**. Poser les entrées **D-2, D-3, D-5, D-7** et **arbitrer D-4**.
5. **A01 — tracer rétrospectivement le traitement de V1** (NB-12) et **rouvrir le journal**
   (NB-14) : P-DESCOPE est au 15/09 et veut du factuel.
6. **A51 — un verdict sécurité sur `.axionbackup` livré** (F-28), avant P-E.
7. **A20 — allonger le fil rouge du segment L5** (09 §4bis) : les gestes existent en E2E, ils ne
   sont pas dans le parcours cumulatif.
8. **WILLIAMS — quatre gestes qui n'appartiennent qu'à lui** : ① le **décompte ZAP par sévérité**
   (page du run `34125104959`, **expire le 2026-10-07**) puis la bascule `ZAP_BLOQUANT` ; ② le
   **compte de test sur staging** (rôle `lecteur`) — sans lui, ni ZAP authentifié ni parcours amont ;
   ③ les **migrations up/down sur staging** ; ④ la **recette matérielle** : iPad physique, coupure de
   courant, second appareil, trois lignes de `LOT_L5.md` §4, démo écran partagé.
   **Plus deux arbitrages** : le **libellé** de la pastille de sync (réservé le 2026-09-06) et
   **D-6** (un critère de P-C qui dépend de L6).

**Signature conformité + traçabilité** : **A02 — 2026-09-07**, avec les trois réserves bloquantes
ci-dessus. Je signe la **conformité** ; je **ne signe pas** « traçabilité à jour » tant que NB-9-bis
n'est pas fermée.

---

*Passe effectuée le 2026-09-07 par **A02**, gardien de la spécification, sur l'arbre de code de
`8e70f39` (`HEAD` = `535fbca`, delta documentaire seul), en **lecture seule sur le code**. Aucun
fichier du dépôt n'a été modifié ; ce document est déposé **non commité**. Toutes les commandes
citées ont été exécutées ; ce qui est déduit est écrit « déduit ». La suite complète n'a pas été
rejouée — la CI du commit contrôlé l'a été, et je l'ai lue.*
