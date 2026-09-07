# `@axion/ui` — design system et tokens de la charte

Ce paquet porte **l'invariant 4** : _aucune couleur, aucune taille en dur ailleurs dans le dépôt_.
Toute valeur visuelle vient d'ici, et un garde-fou de CI (`pnpm check:invariants`, contrôle `INV-4`)
refuse le commit qui écrirait un hexadécimal dans un composant.

## La charte

| Rôle        | Token      | Valeur    |
| ----------- | ---------- | --------- |
| Action      | terracotta | `#c24a1b` |
| Fond        | ivoire     | `#faf8f3` |
| Information | bleu       | `#1a4dd9` |
| Texte       | mocha      | `#2a2520` |
| **Alerte**  | carmin     | `#8c0a33` |

**Pourquoi le rouge d'alerte est carmin et non un rouge courant.** Le pack impose « l'alerte est un
rouge **distinct** » — distinct du terracotta d'action, sans quoi un bouton « Enregistrer » et un
message « Données perdues » se ressemblent. La première valeur proposée n'était séparée du
terracotta que de **19,8° de teinte** ; `#8c0a33` en donne **35,8°**, pour un contraste mutuel de
1,94. Ces chiffres sont **mesurés par `tokens.test.ts`**, pas déclarés : modifier un token sans
respecter l'écart fait échouer la suite.

## Contenu

- `tokens.ts` — la source unique, typée.
- `tokens.css` — les mêmes valeurs en variables CSS, pour Tailwind et les feuilles de style.
  Il **importe `polices.css` en tête** : le jeton et la police qu'il nomme sont une seule promesse.
- `polices.css` — les `@font-face` d'Inter variable auto-hébergée.
- `tokens.test.ts` — les contrôles d'écart de teinte et de contraste **de la palette**.
- `contraste-usages.test.ts` — le contraste AA des **combinaisons réellement déclarées** par
  `composants.css` (A28). Là où `tokens.test.ts` éprouve une liste écrite à la main, celui-ci lit la
  feuille : une paire introduite demain entre dans la mesure sans que personne y pense.
- `police-racine.test.tsx` — la police est posée sur `html`, pas seulement sur la coquille terrain.
- `composants/` — les composants React de la grille §33 (voir ci-dessous).
- `composants.css` — leurs styles, **qui ne font que consommer les jetons** : ce fichier ne
  contient ni une couleur littérale, ni une longueur en unité absolue, et il n'est pas exclu du
  garde-fou `INV-4` (seuls `tokens.*` et `charte.*` le sont).

## Les composants

```ts
import '@axion/ui/tokens.css'; // jetons + police Inter auto-hébergée
import '@axion/ui/composants.css'; // styles des composants — après tokens.css
import { Bouton, EchelleAncree, ZoneEtat } from '@axion/ui';
```

**Périmètre : les écrans du lot L5 (PWA terrain), et eux seuls.** Retenus : `Bouton` ·
`ChampTexte` · `ZoneNotes` · `Selection` · `CaseACocher` · `Bascule` · `Badge` · `Message` ·
`Dialogue` · `Panneau` · `Squelette` · `EtatVide` · `EtatErreur` · `EtatHorsLigne` ·
`RappelHorsLigne` · `ZoneEtat` · `EchelleAncree` · `SegmenteONA` · `SaisieFourchette` · `PastilleSync` ·
`IndicateurEnregistrement` · `BandeauPartage` · `AnneauProgression` · `CarteSyntheseEntretien`.
Écartés parce qu'ils appartiennent à la **console** (§33.4, desktop-first, hors V1 mobile) ou à la
**dataviz de scoring** (L7-L8) : `TimelinePilote`, `Radar`, `Heatmap`, `CourbePrevuReel`, `Table`,
`Tabs`, `Tooltip`, `Toast`.

**Ces deux listes ne vivent plus en prose.** `src/inventaire.ts` porte l'énumération de §33.5 telle
qu'elle est écrite dans le pack, chaque nom confronté à ce que le paquet en a fait :
`{ etat: 'livre', composant }` — où `composant` est vérifié par le type comme un export RÉEL — ou
`{ etat: 'absent', motif, ou }`, et **une absence sans motif ne compile pas**. Le même fichier dérive
`NomComposantUI` des exports de `composants/index.ts` (les exportations de valeur à majuscule
initiale, c'est-à-dire la convention que React impose déjà) : c'est ce type qui empêche la page
`/design` d'oublier un composant. De la prose ne rougit pas ; un `satisfies`, si.

## La page `/design` — la recette visuelle, enfin honorée

§33.5 exige « états complets (§19.2) **+ exemple sur /design** ». La page vit dans la **console**
(`apps/hq/src/ecrans/design/`, arbitrage `DECISIONS.md` du 2026-09-07) : le paquet terrain est
précaché sous contrainte de quota (05 §31), et une planche de charte se relit sur grand écran.
Elle rend les **34 composants** — les 24 ci-dessus et les 10 icônes — chacun dans au moins **deux
états distincts**, les jetons de §33.1, et les huit absences déclarées avec leur motif.
Un composant ajouté à ce paquet **fait échouer `pnpm typecheck`** tant qu'il n'a pas sa fiche.

```bash
pnpm --filter @axion/hq dev    # puis http://localhost:5174/hq/design
```

**Quatre règles que les types imposent plutôt que de les recommander.**

1. `ZoneEtat` prend une **union discriminée** des cinq natures de §33.2 (nominal, chargement, vide,
   erreur, hors ligne). Un écran ne peut pas la rendre sans avoir décidé de ses quatre états, ni
   déclarer une erreur sans en fournir la **cause ET l'action**. La règle §33.2 devient un
   compilateur au lieu d'une consigne qu'on découvre à la porte P-C.
2. Un `Bouton` sans libellé visible **exige** `libelleAccessible` (§33.6, « libellés explicites sur
   toute icône seule »).
3. Un `Badge` **exige** son `children` : aucune information ne se porte par la couleur seule.
4. `RappelHorsLigne` **exige une liste de capacités NON VIDE** (`[string, ...string[]]`) et porte
   lui-même la condition `enLigne` : il ne rend rien quand le réseau est là. Les deux moitiés de
   §33.2 (« pastille discrète **+ rappel des capacités locales** ») deviennent indissociables, et la
   condition `{!enLigne && …}` cesse d'être une ligne qu'un écran sur deux oublie d'écrire.

**`EtatHorsLigne` ou `RappelHorsLigne` ?** Le premier est l'état **PLEIN**, rendu **à la place** du
contenu (via `ZoneEtat`). Le second **s'ajoute** à un écran qui reste entièrement utilisable — c'est
le cas normal de cette application, où hors ligne est le mode nominal (invariant 1). Avant lui, trois
écrans écrivaient ce rappel de trois façons différentes, dont deux en passant un enfant factice à une
`ZoneEtat` qui l'ignore. Depuis le 2026-09-06 il est branché sur les **onze** vues terrain, et les
listes de capacités vivent au même endroit — `apps/field/src/app/capacites-hors-ligne.ts`, où le type
exige une entrée **non vide par vue du registre**.

**`avecPastille` (défaut `true`) — pour l'application qui porte déjà la sienne.** §33.2 exige ses deux
moitiés **sur l'écran**, pas dans un même composant. La PWA terrain pose une `PastilleSync` unique
dans l'en-tête de sa coquille, pour tous ses écrans, alimentée par le **port de sync** ; en rendre une
seconde ici, alimentée par `navigator.onLine`, ferait **deux pastilles nourries par deux sources** sur
un même écran — le défaut que la recette du 2026-09-06 a relevé et qu'un module de traduction unique
a fermé. Le défaut de la propriété reste `true` : c'est le **silence** qui doit être sûr ; la baisser
est une déclaration (« ma pastille est ailleurs »), pas une commodité.

**Les composants ne font rien d'autre qu'afficher.** Aucun n'appelle le réseau, ne lit Dexie, ne
connaît une mission, ne formate une date (les horodatages arrivent **déjà formatés** au fuseau de la
mission, §22.2). Deux conséquences voulues : ils se testent sans monter d'application, et aucun ne
peut violer l'invariant 2.

**Ce que le lot L5 doit brancher lui-même**, et pourquoi ce n'est pas ici :

- **les raccourcis clavier** (§33.3 : `1-5`, `O/N/A/R`, `E`, `/`) — seul l'écran sait quelle
  question a le focus. Les champs de saisie posent en revanche `data-saisie-libre="vrai"`, le
  marqueur que le gestionnaire de raccourcis interroge pour appliquer la règle V2.8 (« taper
  “Rien à signaler” dans une note ne déclenche jamais rien ») ;
- **le masquage du mode écran partagé** — `BandeauPartage` affiche l'état et offre le geste, il ne
  masque rien. Masquer en CSS laisserait le contenu interne dans le DOM, donc dans une capture
  d'écran et dans un lecteur d'écran : une fuite déguisée en fonctionnalité, sur le seul composant
  dont la raison d'être est d'empêcher une fuite. **Le masquage se fait à la source.**

## Ni Tailwind ni shadcn/ui, et c'est un écart tracé

Le contrat 11 §1 les épingle tous les deux, mais **aucun n'est installé dans le dépôt** : ni
`tailwindcss`, ni `postcss`, ni une primitive Radix, ni `cva`, `clsx`, `tailwind-merge` ou
`lucide-react`. Les installer est une escalade **`CLAUDE.md` §3-1** qui appartient à Williams. Les
styles vivent donc dans `composants.css`, consommé comme `tokens.css` l'est déjà ; les trois
utilitaires que `shadcn init` aurait apportés tiennent en quinze lignes relisibles
(`composants/utilitaires.ts`) ; les neuf icônes nécessaires sont des SVG écrits ici
(`composants/icones.tsx`). **Les composants ne connaissent que des noms de classe** : le jour où
Tailwind est arbitré, seule la feuille change.

## La police est AUTO-HÉBERGÉE, et c'est vérifiable

Contrat 11 §1 et §33.1 : `@fontsource-variable/inter`, **jamais de CDN** — la PWA doit rendre son
texte en mode avion. Un seul import (`@axion/ui/tokens.css`) suffit à l'obtenir : `polices.css`
n'est **pas** à importer séparément dans les applications, précisément parce qu'un second import à
ne pas oublier dans deux `main.tsx` est ce qui a produit le défaut relevé en recette (le jeton
`--typo-police-corps` déclarait Inter, le build ne sortait aucun `@font-face` ni aucun `.woff2`, et
c'est la police système qui s'affichait — pendant que `font-src 'self'` passait « vert » faute de
police à garder).

**Et elle est posée À LA RACINE du document, pas seulement sur la coquille terrain.** Jusqu'au
2026-09-06, `getComputedStyle(document.documentElement).fontFamily` valait **`"Times New Roman"`** :
seule `.axn-coquille` posait `--typo-police-corps`. Le défaut était **latent** — aucun composant
n'utilise `createPortal` aujourd'hui — et serait devenu visible au premier dialogue rendu hors de
l'arbre de l'application, en serif, sur l'écran d'un auditeur. La règle vit maintenant dans
`tokens.css` (`:where(html, body)`, **spécificité nulle** : elle ne peut rien écraser), et elle a
**deux contre-champs** parce qu'aucun des deux ne suffit :

- `police-racine.test.tsx` (jsdom) rejoue la **cascade** — racine et nœud greffé sur `document.body`
  — et contient la contre-épreuve : règle retirée, la mesure retombe sur la police du navigateur ;
- `e2e/polices.e2e.ts` (Chromium) greffe un nœud **hors coquille**, comme le ferait un portail, et
  compare sa **largeur peinte** à celle du même texte forcé en Times New Roman. Vérifié le
  2026-09-06 : la règle retirée du build, les deux fronts rougissent sur `racine en « "Times New
Roman" »`.

**Ce qui est embarqué : 2 fichiers, ~131 Ko** sur les 1,9 Mo du paquet — axe `wght` seul (une seule
police variable couvre les graisses 400/500/600/700), sous-ensembles `latin` (48 Ko, tout le
français) et `latin-ext` (83 Ko, rendu gratuit à l'exécution par `unicode-range`). Écartés :
cyrillique, grec, vietnamien et **tous les italiques** (le navigateur synthétise l'oblique).
Le raisonnement complet, y compris ce qui rouvrirait ces choix, est en tête de `polices.css`.

**Vérifier après un build** (ces commandes sont celles de la recette, avec le résultat attendu) :

```bash
pnpm --filter @axion/field build
grep -o '@font-face' apps/field/dist/assets/index-*.css | wc -l   # → 2  (et non 0)
ls apps/field/dist/assets/*.woff2                                 # → 2 fichiers
grep -o 'url([^)]*woff2)' apps/field/dist/assets/index-*.css      # → /assets/… , jamais https://
```

## Commandes

```bash
pnpm --filter @axion/ui build
pnpm --filter @axion/ui typecheck
```
