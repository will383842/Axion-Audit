# DÉFAUTS RENDUS PAR A26 — préparation de la séance P-C — 2026-09-10

*A26 a constaté deux défauts le 2026-09-09 en fabriquant et en restaurant le `.axionbackup` de
séance contre le staging réel (outil `e2e/outils/`, PR #132). Il ne les a pas corrigés — c'est la
règle (09 §5.6) — et les a rendus. A01 les a fait qualifier par les deux chefs d'équipe concernés le
2026-09-10, **sans ouvrir aucun lot** (09 §4bis : P-C n'est pas signée). Les deux qualifications
**corrigent le constat d'origine**, et c'est pour cela qu'on qualifie avant de corriger.*

---

## D-A · Deux `<h1>` identiques sur l'écran de restauration — **A20 : ce n'est pas l'écran, c'est la coquille, et c'est 11 vues sur 12**

**Localisation, confirmée.** `apps/field/src/App.tsx:168` rend `<h1>{VUES[vue].titre}</h1>` dans le
`<header>` de la coquille ; `apps/field/src/ecrans/journee/EcranRestauration.tsx:332` rend son
propre `<h1>Restaurer une sauvegarde</h1>` dans `<main>`. `app/vues.ts:59` donne exactement le même
texte. Le `h1` d'écran est **hors de toute branche conditionnelle** : les deux coexistent dans les
quatre états, pas dans deux états successifs.

**Ce que la qualification a corrigé.** Le défaut n'appartient pas à l'écran de restauration. Même
paire à texte identique sur `EcranAccueil:285`, `EcranAujourdhui:297`, `EcranAgenda:306`,
`EcranARevoir:185`, `EcranFinDeJournee:316`, `EcranFinDeSession:233`, `EcranPilote:128`,
`EcranNouvelEntretien:156`, `EcranConnexion:203` ; `EcranStockage:79` en porte deux de textes
**différents**. Seules `entretien` et `deverrouillage` en ont un seul. **Onze vues sur douze.**

**Pourquoi rien ne l'a vu — et aucune de ces raisons n'est un bug de l'outillage.**

1. **axe-core ne peut pas le voir** : le balayage sélectionne `wcag2a/2aa/21a/21aa`
   (`e2e/accessibilite-toutes-vues-l5.e2e.ts:161`). Aucune règle WCAG n'interdit plusieurs `h1` ;
   `page-has-heading-one` est `best-practice`, donc non sélectionnée, et ne teste qu'une présence.
   `heading-order` ne signale qu'un **saut** de niveau — `h1` → `h1` n'en est pas un. **Le vert
   d'A28 est exact, pas complaisant.**
2. **Les localisateurs e2e sont scopés au `<main>`**, délibérément (`accessibilite-l5a:72`,
   `accessibilite-toutes-vues-l5:316`, `filrouge-l5:132`, `budget-chiffrement-l5:348`) : le `h1`
   d'en-tête est hors périmètre, donc le mode strict de Playwright ne se déclenche jamais.
3. **Les tests d'interface rendent l'écran hors de sa coquille** (`render(<EcranRestauration />)`) :
   un seul `h1` dans le DOM testé. Un écran testé hors de sa coquille ne révèle pas un défaut de
   coquille.
4. **Le seul test qui voit les deux a été écrit pour les tolérer** :
   `App.acceptation-b2.test.tsx:219`, `getAllByRole('heading', { level: 1 })[0]`, commentaire à
   l'appui. Le contournement est honnête et tracé — il transforme un rouge potentiel en vert
   permanent.
5. **Aucune des 14 gardes ne regarde la structure de titres.**

**Quatrième constat indépendant, jamais fermé** : A28-1 (`e2e/accessibilite-l5a.e2e.ts:63-69`,
2026-09-03) · fiche `AMELIORATIONS.md` du 2026-09-03, classée **étage 1, 0,05 j** · A54 majeur
**M8**, encore OUVERT dans les recettes des 06, 07 et 09/09 · A26 le 2026-09-09, **le premier en
navigateur réel sur staging**.

**Classement A01 : DÉFAUT.** Reclassement de la fiche étage 1 du 2026-09-03. Trois motifs.
(a) Précédent opposable **B2/R3** : « le registre AMELIORATIONS borne ce qui va AU-DELÀ de la spec ;
il ne sert pas à ranger un trou dedans » — une structure de titres fausse sur 11 vues est un trou
dans 03 §22.1 et §33, pas du confort. (b) **La voie étage 1 a échoué par la mesure** : ouverte à
0,05 j le 03/09, non fermée six jours plus tard, et son périmètre réel est **11 vues, pas 2** — le
chiffrage qui la faisait tenir sous le plafond de 0,5 j était faux. (c) Elle ne consomme donc pas ce
plafond. **À distinguer de R3** (« quel écran s'appelle Aujourd'hui »), qui reste étage 2 → Williams :
la question du *nom* est du périmètre fonctionnel, la *duplication du niveau 1* ne l'est pas.

**Impact P-C : ne bloque AUCUNE vérification.** V-7 (l. 262-273) n'observe pas la structure de
titres ; 7.5 (critère 07 n° 5) se coche indépendamment — la restauration fonctionne, le défaut est
sémantique. **Réserve** : V-10 rejoue la recette novice au chronomètre, rows 10.8 et 10.10 ; c'est
là que M8 est né et là qu'il ressortira une quatrième fois.

**Responsable : A22** (écrans-session) — ni Dexie, ni crypto, ni format `.axionbackup` : rien d'A24.
**Coût : 3 h** — règle du `h1` canonique 0,5 h · `App.tsx` + 10 écrans 1 h · **la collatérale de
test, qui est le vrai coût** (4 helpers scopés `main` + `App.acceptation-b2.test.tsx:219`) 1 h ·
**la garde qui manque** — « exactement un `h1` » sur le balayage des 12 vues, écrite par **A28** et
non par A22 (09 §5.6) 0,5 h. Sans cette dernière ligne, le correctif se défait sans bruit à la
première vue ajoutée.

### ⚠ CE QUI RESTE À TRANCHER — **Williams, avant la séance**

**Corriger D-A avant de jouer V-10, ou après la signature de P-C ?**

- **Après** (défaut, et 09 §4bis) : rien ne s'ouvre avant la signature, la règle est tenue à la
  lettre — et on paie 60 minutes de séance matérielle **avec un vrai novice** pour réapprendre M8
  une quatrième fois.
- **Avant** (3 h d'agent, L5 rouvert le temps du correctif) : V-10 mesure autre chose que ce qu'on
  sait déjà.

**Recommandation A01 : corriger avant V-10.** Le coût de 3 h est connu et borné ; le temps d'un
novice réel ne se rejoue pas, et V-10 est précisément la vérification que ce défaut pollue. Mais
rouvrir L5 avant la signature est **exactement** ce que 09 §4bis réserve à Williams — donc c'est lui
qui tranche, pas moi. **Aucune ligne ne sera écrite avant sa réponse.**

---

## D-B · V-5.5 « une question à échelle sans ancre de banque » — **A30 : le cas est atteignable, mais pas par la banque. La fiche était fausse, pas la banque.**

**Faits.** `ANCRES_ABSENTES` est conditionné au seul type `scale_1_5`
(`packages/shared/src/banque-questions.ts:1163-1179`) et n'est exécuté que par `analyserLigneBanque`
(l. 721), dont l'unique appelant est `apps/api/scripts/import-banque-questions.mjs`. **Aucune route
de l'API ne l'appelle** — il n'existe pas de CRUD question en back-office. Et le §32.4 écrit
littéralement « critère d'**ADMISSION** en banque, M1.1 » : admission, pas édition.

**Le repli n'est pas du code mort.** Un chemin d'écriture d'une `scale_1_5` existe et n'est
délibérément pas gardé — **la question ad hoc du terrain** :
`DialogueQuestionAdHoc.tsx:121` propose les onze types dont `scale_1_5`, le champ se nomme
« Consigne (**facultative**) » (l. 139), le seul verrou de soumission est `disabled={texteManquant}`
(l. 89), et `questions-adhoc.ts:130` écrit `guidanceSnapshot: null`. La chaîne est nominale
jusqu'au bout : `SaisieReponse.tsx:122` → `lireAncresDeCotation(null).ancres === []` →
`EchelleAncree.tsx:108` `REPLI_SANS_AUCUNE_ANCRE`.

**Verdict A01 : (b) REFORMULER.** Ni supprimer (le repli est atteignable et justifié), ni trou de
banque (le §32.4 est tenu là où il s'applique). Le défaut est dans **la fiche**, qui disait
« de banque » sans nommer le chemin. **Ligne 5.5 amendée ce jour** — la fiche n'était pas signée,
donc amendable sans rejeu (§7).

**Et il y a un second défaut, que la qualification a fait sortir : celui de l'outil d'A26.**
`e2e/outils/mission-seance.ts:839` pose `addedAdHoc: false` **en dur pour les douze questions**,
dont la question 12 (`scale_1_5`, `guidance: null`). L'outil **fabrique donc l'état que l'import
refuserait** — exactement le défaut de fixture qu'`e2e/hors-ligne-l5.e2e.ts:586` avait déjà corrigé
ailleurs. Les deux ont buté sur le même angle mort : n'avoir regardé que le chemin banque.
**Rendu à A26 : ~0,25 j** — passer `addedAdHoc` en champ de `QuestionSeance` et le mettre à `true`
sur la seule question 12 (ou retirer cette question si la séance crée l'ad hoc en direct),
**avec la garde qui interdit `scale_1_5` + `guidance: null` + `addedAdHoc: false`**. Sans la garde,
la fixture se refait. **Ce n'est PAS un prérequis de la séance** : V-5.5 se joue par le chemin ad
hoc, sans une ligne de code.

**Escalade ouverte, hors P-C, à NE PAS anticiper (09 §5.9)** : le jour où un back-office d'édition
de questions existera (Phase 2), `ANCRES_ABSENTES` devra être rejoué **à l'écriture**, pas seulement
à l'import. À porter en fiche `AMELIORATIONS.md` étage 2 le moment venu.

---

## Ce que ces deux qualifications ont en commun, et qui vaut plus que les défauts

Les deux constats d'A26 étaient **justes de symptôme et faux de portée** : « l'écran de
restauration » était en fait onze vues, et « impossible en banque » cachait un chemin parfaitement
ouvert ailleurs. Dans les deux cas, la correction immédiate aurait produit un correctif juste au
mauvais endroit — un `h1` retiré sur un écran et dix laissés, une fiche de porte amputée d'une
vérification que le produit sait tenir. **La qualification par le chef d'équipe avant l'écriture
n'est pas une formalité de pipeline : c'est ce qui a changé le périmètre des deux.**
