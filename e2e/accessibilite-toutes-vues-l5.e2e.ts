// =============================================================================
// E2E — AXE-CORE SUR **TOUTES** LES VUES DU TERRAIN (lot L5) — agent A28
//
// ── LE CONSTAT QUI OUVRE CE FICHIER, ET IL EST DE MOI ───────────────────────
// Rapport A28 du 2026-09-06, en toutes lettres : « Périmètre d'axe-core
// inchangé : `e2e/accessibilite-l5a.e2e.ts` balaye 3 vues sur 11. » Quatre
// appels à `balayer()`, sur `deverrouillage` (deux états), `accueil` (état vide)
// et `stockage`. Les huit autres écrans du terrain n'étaient balayés par RIEN.
//
// La ligne « axe-core vert » de la DoD transverse (CLAUDE.md §5) était donc verte
// sur un quart du périmètre. Une case cochée sur un quart de son objet n'est pas
// une case cochée : c'est la famille de faux vert que ce dépôt traque.
//
// ── CE QUE CE FICHIER AJOUTE, ET CE QU'IL NE REMPLACE PAS ───────────────────
// Il balaie TOUTES les vues du registre, sur un appareil ÉQUIPÉ — coffre créé,
// identité d'auditeur rattachée, mission embarquée. `accessibilite-l5a.e2e.ts`
// reste en place et garde ce qu'il est seul à tenir : le premier usage (aucun
// coffre au monde) et le BUDGET de dérivation de clé du 11 §4. Les deux fichiers
// ne se recouvrent que sur trois vues, et jamais dans le même ÉTAT — un `accueil`
// vide n'est pas un `accueil` qui porte une mission.
//
// ── ① LE COMPTE VIENT DU REGISTRE, JAMAIS D'UNE LISTE RECOPIÉE ──────────────
// La méthode est celle d'A21 dans `apps/field/src/app/hors-ligne.test.tsx`, et
// elle est reprise telle quelle parce qu'elle est bonne : `satisfies
// Record<CodeVue, Parcours>` sur la table des parcours. Une vue ajoutée à
// `app/vues.ts` NE COMPILE PAS ici tant qu'elle n'a pas son parcours ; les tests
// sont ensuite engendrés par une boucle sur les clés de cette table, si bien que
// le douzième écran naîtra avec son balayage ou ne naîtra pas.
//
// Une liste écrite à la main dans un fichier de test se désynchronise du
// registre en silence. C'est très exactement ce qui s'est produit ici : les huit
// écrans manquants n'ont pas été « oubliés », personne ne les COMPTAIT.
//
// ── ② ON NE BALAIE PAS UNE PAGE BLANCHE ─────────────────────────────────────
// Un écran qui ne rend rien passe un balayage axe sans rien mesurer. Chaque
// arrivée est donc précédée d'une ANTI-VACUITÉ en trois temps :
//   · une assertion propre à l'écran, sur son contenu (le titre du registre ne
//     suffit pas — `accueil` et `aujourdhui` portent le MÊME titre, constat
//     A28-1 du 2026-09-06) ;
//   · le `<main>` de la coquille est visible et porte du texte ;
//   · axe a réellement inspecté des nœuds, et `color-contrast` a réellement
//     TOURNÉ. Cette dernière est celle qui compte : c'est la règle qui se
//     désactive silencieusement quand rien n'est mis en page, et c'est la seule
//     raison pour laquelle ce balayage vit dans un navigateur plutôt qu'en jsdom
//     (03 §22.1 : « contraste WCAG AA minimum »).
//
// ── LE QUATRIÈME ÉTAT (§33.2), ET LE 4-SUR-12 QUI RESTE ────────────────────
// Le réseau coupé est un ÉTAT d'écran, et il est NOMINAL (invariant 1). Mesuré
// le 2026-09-06 sur `main` (`grep -rn "useEnLigne\|RappelHorsLigne"`) : **quatre
// écrans sur douze** rendent quelque chose de différent quand la connexion tombe
// — `aujourdhui`, `entretien`, `restauration` et `connexionSiege`. Ces quatre-là
// sont balayés réseau coupé, avec l'anti-vacuité qui va avec : le marqueur
// d'état hors ligne est vérifié ABSENT avant la coupure et PRÉSENT après, sans
// quoi on rebalaierait le DOM d'en ligne en croyant mesurer autre chose.
//
// Les huit autres ne le sont pas, et c'est un refus délibéré : leur DOM est
// identique réseau coupé, et huit balayages qui ne mesurent rien remplaceraient
// un trou par des verts vides — ce qui est pire, parce qu'un vert vide se coche.
// La PR #81 branche `RappelHorsLigne` sur les autres vues ; chacune recevra
// alors son `horsLigne`, trois lignes de table, sans changer une ligne de
// mécanique. **Aucune assertion ne fige le chiffre 4** : #81 n'a pas à rougir en
// arrivant, et ce chiffre est un constat daté, pas une cible.
//
// ── ③ AUCUNE RÈGLE DÉSACTIVÉE, AUCUN PÉRIMÈTRE RÉTRÉCI ─────────────────────
// Pas un `disableRules`, pas un `.include('main')`. Une vue qui rend une
// violation réelle reste ROUGE, et le défaut part au producteur (09 §5.6 : A28
// ne corrige pas le code qu'il mesure). La règle qu'on retire est toujours celle
// qui aurait mesuré.
//
// ── LES ÉCRANS SONT ATTEINTS PAR LES GESTES DE PRODUCTION ──────────────────
// Aucune porte dérobée : chaque vue est atteinte par le bouton que l'auditeur
// touche. Un écran atteint par un raccourci de test peut être vert sur un état
// que personne ne rencontre. L'unique artifice est le SEMIS de l'appareil, et il
// vient de la fixture d'A26, qui produit ses octets avec la crypto de PRODUCTION
// (09 §5.7 : aucune crypto n'est réécrite ici).
//
// ── LE GARDE A TIRÉ LE JOUR MÊME, ET CE N'EST PAS UNE FIGURE DE STYLE ──────
// Écrit sur onze vues le 2026-09-06 ; la PR #80 en a ajouté une DOUZIÈME
// (`connexionSiege`) quelques heures plus tard. Le `satisfies` ci-dessous a
// refusé de compiler — `Property 'connexionSiege' is missing` — avant qu'aucun
// test ne tourne. Le douzième écran est donc né avec son balayage, ce que ce
// fichier promettait et qu'une liste recopiée n'aurait pas tenu une journée.
// Le fichier a été renommé pour la même raison : `accessibilite-onze-vues`
// serait devenu, en une journée, la liste périmée qu'il dénonce.
//
// ── LE RELEVÉ DU 2026-09-06 : CE QUE LE PASSAGE DE 3 À 12 VUES A TROUVÉ ────
// Dix-huit états balayés — douze vues (dont l'écran d'entretien dans trois de
// ses moments), plus quatre de ces vues une seconde fois réseau coupé.
// Dix-sept verts, UN rouge : **A28-2**, décrit juste en dessous. Il a été laissé
// rouge à dessein, rendu à A22, et la CI l'a dit — c'est ce qu'on voulait qu'elle
// dise.
//
// SUITE, ET C'EST LE RÉSULTAT DE CE CHANTIER : **A22 a livré le 2026-09-06**
// (`tabIndex={0}`, PR #81, commit `48860e9`, avec le mécanisme documenté sur
// place). Le relevé complet passe à **DIX-HUIT VERTS SUR DIX-HUIT**, mesuré. La
// boucle mesurer → rendre → corriger → remesurer s'est fermée dans la journée,
// sans qu'aucune règle soit désactivée et sans qu'A28 touche au code qu'il
// mesure. Le paragraphe ci-dessous est conservé au passé : c'est la trace du
// défaut, pas un état courant.
//
//   A28-2 — `apps/field/src/ecrans/entretien/EcranEntretien.tsx`, ligne ~830,
//   `<aside class="axn-entretien__zone--laterale" aria-label="Notes">`.
//   Règle axe `scrollable-region-focusable`, gravité **serious**, WCAG **2.1.1
//   et 2.1.3 — niveau A**, pas AA. 03 §22.1 dit « navigation clavier
//   intégrale » ; ici elle ne l'est pas.
//
//   CE QU'UN UTILISATEUR PERD, exactement : au-delà du point de rupture large,
//   `entretien.css` donne à ce panneau `overflow-y: auto` et une hauteur
//   plafonnée — c'est donc une zone qui DÉFILE. Tant que l'entretien n'a pas
//   démarré, `PanneauNotes` reçoit `ecriturePossible={false}` et désactive tous
//   ses contrôles (correctif M1 : un bouton grisé qui dit pourquoi). Une zone
//   défilante dont la totalité du contenu est `disabled` n'a plus AUCUN élément
//   focusable : à la souris on fait défiler les notes, au clavier on ne le peut
//   pas. L'auditeur qui travaille au clavier ne peut pas lire le bas du panneau
//   avant de démarrer.
//
//   CE QUI LE SITUE : le MÊME écran est VERT dans ses deux autres états
//   (collecte en cours, dernière question), où les zones de saisie
//   redeviennent actives et rendent la région atteignable. Le défaut n'est donc
//   pas dans la mise en page du panneau, il est dans l'état « avant la première
//   question » — trois balayages disent ce qu'un seul n'aurait pas dit.
//
//   C'est le frère exact du défaut **D3** relevé par A36 sur la console en L7b
//   (`.axn-tableau-cadre`, même règle, même niveau A). Deux écrans, deux
//   incréments, deux équipes, un seul motif : une zone qu'on fait défiler à la
//   souris et jamais au clavier. Rendu à A22 (producteur de L5b) ; **non
//   corrigé ici** (09 §5.6 : A28 ne touche pas au code qu'il mesure) —
//   **et fermé par A22 le jour même**, voir plus haut.
//
// ── ④ UN SEUL `<h1>` PAR VUE — LA GARDE AJOUTÉE LE 2026-09-10 ─────────────
// Le balayage axe était vert sur un défaut qu'aucune règle WCAG ne décrit : la
// coquille et l'écran affichaient CHACUN un titre de niveau 1, parfois le même
// mot (constat A28-1, majeur M8 de la recette novice A54). Williams a tranché le
// 2026-09-10 : le défaut se ferme AVANT V-10. La garde vit dans son propre test,
// est jouée sur TOUTES les vues du registre, et son commentaire dit règle par
// règle pourquoi axe ne pouvait pas la remplacer (voir `unSeulTitreDePage`).
// Elle a été MESURÉE ROUGE avant tout correctif : c'est ce qui prouve qu'elle
// mord. Le correctif de production appartient à A22 (09 §5.6).
//
// ── CE QUE CE FICHIER NE MESURE PAS, ET NE PRÉTEND PAS MESURER ─────────────
// Ni p95 d'interaction, ni listes longues de FIL-GC, ni chiffrement par
// écriture, ni cibles tactiles sur tablette réelle. Chromium sur un poste n'est
// pas un iPad (11 §7) : ces relevés restent dus à A27 sur appareil, et les
// annoncer ici les rendrait faux.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E36 (CI exécutable),
// E43 (exécutabilité autopilote — dérogation `@axe-core/playwright` du 11 §8-1),
// E44 (UX/UI 2026-2027 : grille §33, les quatre états), E6 (hors ligne total).
// =============================================================================
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { VUES, type CodeVue } from '../apps/field/src/app/vues.js';
import {
  deverrouillerAppareil,
  MISSION_FIL_TPE,
  MOT_DE_PASSE_APPAREIL,
  planterAppareil,
  PREMIERE_QUESTION,
  semerAppareil,
  type GrainesAppareil,
} from './fixtures/appareil-terrain.js';

/**
 * Les familles de règles retenues : A et AA, versions 2.0 et 2.1.
 *
 * Les mêmes que `accessibilite-l5a.e2e.ts` et `accessibilite-l7b.e2e.ts`, au mot
 * près. Trois balayages qui ne mesureraient pas la même norme rendraient trois
 * verts incomparables, et la comparaison d'un lot à l'autre est la moitié de
 * l'intérêt d'un budget.
 */
const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/** Un interlocuteur FICTIF (invariant 2) — celui de l'entretien créé ici. */
const INTERLOCUTEUR = 'Camille Ferrand';
const FONCTION = 'Responsable d’atelier';

// ─────────────────────────────────────────────────────────────────────────────
// LE SEMIS, FABRIQUÉ UNE FOIS PAR PROCESSUS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * `semerAppareil` dérive une KEK Argon2id avec les paramètres de PRODUCTION
 * (11 §4) : c'est ce qui rend la fixture honnête, et c'est aussi ce qui la rend
 * coûteuse. Les graines ne dépendent d'aucun test ; on les calcule donc une fois
 * et on les repose dans chaque contexte navigateur, qui est neuf, lui.
 */
let semis: Promise<GrainesAppareil> | null = null;
function graines(): Promise<GrainesAppareil> {
  semis ??= semerAppareil(MOT_DE_PASSE_APPAREIL);
  return semis;
}

/**
 * Les mêmes graines, PRIVÉES de leurs marques d'embarquement.
 *
 * C'est l'appareil dont le stockage n'a jamais été préparé : la mission est là,
 * ses données aussi, mais `navigator.storage.persist()` n'a pas encore été
 * demandé. C'est l'état — et le seul — depuis lequel le bouton « Préparer cet
 * appareil » existe, donc le seul depuis lequel l'écran de guidage de stockage
 * est atteignable par un geste de production (`EcranAccueil.embarquer`, 05 §31-2).
 *
 * Rien n'est modifié dans la fixture d'A26 : on filtre sa sortie, qui est une
 * donnée. D'autres fichiers de tests en dépendent, et un chantier
 * d'accessibilité n'a pas à leur imposer un régime.
 */
function sansPreparationDeStockage(depart: GrainesAppareil): GrainesAppareil {
  return {
    tables: depart.tables,
    meta: depart.meta.filter(
      (ligne) =>
        !ligne.cle.startsWith('mission:embarquee:') &&
        !ligne.cle.startsWith('mission:persistance:'),
    ),
  };
}

/**
 * Les mêmes graines, PRIVÉES de l'identité d'auditeur.
 *
 * C'est l'appareil qui n'appartient encore à personne — l'état d'une tablette
 * neuve, et le seul depuis lequel `AccesRattachement` propose son geste
 * (`siege/coquille-siege.tsx`, arrivé avec la PR #80). Avec une identité,
 * l'écran de rattachement rend son état « Appareil rattaché » : ni formulaire,
 * ni rappel hors ligne. On balaierait le bon écran dans le mauvais état.
 */
function sansIdentiteAuditeur(depart: GrainesAppareil): GrainesAppareil {
  return {
    tables: depart.tables,
    meta: depart.meta.filter((ligne) => ligne.cle !== 'auth:utilisateur'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LE BALAYAGE, ET SON ANTI-VACUITÉ
// ─────────────────────────────────────────────────────────────────────────────
/** Une violation, réduite à ce qu'un producteur doit lire pour la corriger. */
interface Grief {
  readonly ecran: string;
  readonly regle: string;
  readonly aide: string;
  readonly gravite: string;
  readonly normes: readonly string[];
  readonly cibles: readonly string[];
}

/** Rend le rapport axe LISIBLE en CI : une ligne par violation, avec ses nœuds. */
function resumer(griefs: readonly Grief[]): string {
  return griefs
    .map(
      (grief) =>
        `· ${grief.ecran} — ${grief.regle} (${grief.gravite}, ${grief.normes.join('/')}) : ` +
        `${grief.aide} → ${grief.cibles.join(' , ')}`,
    )
    .join('\n');
}

/**
 * Balaie l'écran affiché, après avoir prouvé qu'il y a un écran à balayer.
 *
 * ── POURQUOI CETTE FONCTION RAPPORTE AU LIEU D'ÉCHOUER ─────────────────────
 * Une vue a plusieurs états, et un état rouge qui interrompt le test masque les
 * suivants — on ne saurait pas si la violation est propre à un moment de l'écran
 * ou si elle vit partout. Les griefs sont donc COLLECTÉS, et l'échec est prononcé
 * une fois, avec la liste complète. C'est aussi ce qui rend le rapport A28
 * recopiable sans relancer la suite état par état.
 *
 * L'anti-vacuité, elle, échoue SUR PLACE : un écran absent n'est pas un défaut
 * d'accessibilité, c'est un test qui ne mesure rien, et les deux ne se
 * confondent pas.
 */
async function balayer(page: Page, ecran: string): Promise<readonly Grief[]> {
  const corps = page.locator('main.axn-coquille__corps');
  await expect(corps, `« ${ecran} » : la coquille ne rend aucun <main>`).toBeVisible();
  const texte = (await corps.innerText()).trim();
  expect(
    texte.length,
    `« ${ecran} » : le <main> est quasi vide (${String(texte.length)} caractères) — ` +
      'axe aurait rendu un vert sans rien mesurer',
  ).toBeGreaterThan(120);

  const resultat = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();

  const regles = new Set(
    [...resultat.passes, ...resultat.violations, ...resultat.incomplete].map((regle) => regle.id),
  );
  const noeuds = resultat.passes.reduce((total, regle) => total + regle.nodes.length, 0);
  expect(noeuds, `« ${ecran} » : axe n’a inspecté aucun nœud`).toBeGreaterThan(10);
  // LA vérification qui justifie le navigateur. En l'absence de mise en page,
  // axe désactive `color-contrast` SANS LE DIRE et rend un vert qui répond à une
  // autre question que celle du 03 §22.1.
  expect(
    regles.has('color-contrast'),
    `« ${ecran} » : la règle color-contrast n’a pas tourné — le contraste AA n’est PAS mesuré ici`,
  ).toBe(true);

  // Le chiffre est LU par A20 et recopié dans le rapport : un budget « vert »
  // sans son chiffre n'est pas une mesure, c'est une opinion. Une annotation
  // plutôt qu'un `console.log` — `no-console` vaut aussi pour les tests, et
  // l'annotation est portée par le rapport HTML et par le rapporteur `github`.
  test.info().annotations.push({
    type: 'mesure A28',
    description:
      `axe — ${ecran} : ${String(regles.size)} règle(s) évaluée(s), ` +
      `${String(noeuds)} nœud(s) conformes, ${String(resultat.violations.length)} violation(s)`,
  });

  return resultat.violations.map((violation) => ({
    ecran,
    regle: violation.id,
    aide: violation.help,
    gravite: violation.impact ?? 'gravité non qualifiée',
    normes: violation.tags.filter((etiquette) => etiquette.startsWith('wcag')),
    cibles: violation.nodes.map((noeud) => JSON.stringify(noeud.target)),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// LES GESTES DE PRODUCTION QUI MÈNENT À CHAQUE ÉCRAN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le titre de la VUE, cherché dans le `<main>` — et LU DANS LE REGISTRE.
 *
 * ── DEUX CORRECTIONS, ET LA SECONDE EST LA VRAIE ───────────────────────────
 * ① 2026-09-10, matin : ce helper cherchait un `<h1>` dans `<main>`, c'est-à-dire
 *    le titre propre de l'ÉCRAN — le SECOND des deux titres de niveau 1 que la
 *    page portait (constat A28-1). Le repère est le même qu'aujourd'hui, mais
 *    l'élément visé est un AUTRE : le titre de l'écran, pas celui de la vue, et
 *    c'est le premier qui a disparu. Le `h1` canonique est celui de la COQUILLE
 *    (règle A01), alimenté par `app/vues.ts` ; les écrans sous `<main>` n'en
 *    portent plus. Le helper vise donc l'élément qui a SURVÉCU au correctif d'A22.
 * ② 2026-09-10, après-coup : il prenait encore une CHAÎNE recopiée à la main. Le
 *    registre a changé le libellé de `stockage` le matin même, et trois tests
 *    sont tombés — sur leur `atteindre`, pas sur une assertion de titre. Le NOM
 *    du test, lui, était engendré depuis `VUES[code].titre` : le nom et
 *    l'assertion ne parlaient donc plus du même écran.
 *    C'est mot pour mot la famille de défaut que le chapeau de ce fichier
 *    dénonce — « une liste écrite à la main se désynchronise du registre en
 *    silence ». Le helper prend désormais un CODE DE VUE : le compilateur refuse
 *    un code inconnu, et le libellé ne peut plus être périmé puisqu'il n'est plus
 *    recopié.
 *
 * ── ③ 2026-09-10, RÉSERVE R1 D'A29 : DU BANNER AU `<main>` ─────────────────
 * Le titre a quitté le `<header>` de la coquille pour devenir le premier enfant
 * du `<main>` (A22, `App.tsx`). Deux raisons, et le helper les suit :
 * · `role="banner"` désigne PAR SPÉCIFICATION du contenu répété de page en page ;
 *   un titre qui change à chaque vue y était un contresens sémantique ;
 * · le `<main>` n'avait AUCUN nom accessible — qui saute au repère principal, le
 *   geste le plus courant au lecteur d'écran, n'entendait jamais le titre de la
 *   vue. Il tombe désormais dessus, puisque le titre l'ouvre.
 * LE PRINCIPE NE BOUGE PAS : la source reste le registre, unique. Seul
 * l'emplacement change — et c'est aussi ce qui met la coquille d'accord avec
 * `EcranDeverrouillage`, qui plaçait déjà son `h1` dans le `<main>`.
 *
 * Ce que l'assertion dit exactement : « la coquille affiche le titre de CETTE
 * vue-là, en `h1` de niveau 1, au premier rang du repère `main`, sous son nom
 * EXACT ». Le LIBELLÉ, lui, est une donnée du registre — il s'y lit, il ne se
 * redouble pas ici.
 */
function titreDeCoquille(page: Page, code: CodeVue): Locator {
  return page
    .getByRole('main')
    .getByRole('heading', { name: VUES[code].titre, level: 1, exact: true });
}

/**
 * EXACTEMENT UN `<h1>` DANS LE DOCUMENT — la garde qui manquait (2026-09-10).
 *
 * ── LA RÈGLE PROTÉGÉE, ET CE N'EST PAS L'ÉTAT DU DOM ───────────────────────
 * Le `<h1>` canonique est celui de la COQUILLE (`apps/field/src/App.tsx`),
 * alimenté par le registre `apps/field/src/app/vues.ts` (arbitrage A01, appliqué
 * sur décision de Williams du 2026-09-10). Un écran rendu dans `<main>` SOUS la
 * coquille ne porte plus de `<h1>` : son titre propre devient `<h2>` s'il apporte
 * une information distincte, ou disparaît s'il duplique le titre de vue. Les
 * écrans rendus HORS coquille — `deverrouillage`, et les retours anticipés
 * d'`App.tsx` — gardent le leur : ils n'en ont aucun autre.
 *
 * ── LE CAS `deverrouillage`, VÉRIFIÉ ET NON SUPPOSÉ (R1, 2026-09-10) ───────
 * Depuis R1 le titre de vue vit dans le `<main>`, là où `EcranDeverrouillage`
 * met déjà le sien : on pouvait craindre que les deux s'y rencontrent. Ils ne
 * s'y rencontrent pas, et la raison est structurelle — coffre fermé, `App.tsx`
 * sort AVANT de peindre la coquille : ni en-tête, ni titre de vue, l'écran est
 * seul dans son `<main>`. MESURÉ le 2026-09-10 : un `h1`, « Déverrouiller la
 * collecte ». C'est le titre de l'ÉCRAN, non celui du registre (« Déverrouiller »),
 * qui n'est jamais peint sur cette vue. La garde compte donc juste, et pour cette
 * vue-là seule elle éprouve « un `h1` », non « le `h1` du registre ».
 *
 * Ce qui est éprouvé ici n'est donc pas « le DOM d'aujourd'hui compte un `h1` »,
 * c'est une PROPRIÉTÉ DU REGISTRE : le titre vient d'un endroit unique, donc une
 * vue nouvelle ne PEUT PAS être livrée sans exactement un `h1`. La garde est
 * engendrée par la boucle sur les codes du registre, comme le balayage axe — la
 * quatorzième vue naîtra avec son contrôle de titre ou ne naîtra pas.
 *
 * ── POURQUOI AXE-CORE NE PEUT PAS LA REMPLACER, RÈGLE PAR RÈGLE ────────────
 * ① AUCUNE règle WCAG n'interdit plusieurs `<h1>` — ni en 2.0 ni en 2.1, ni au
 *    niveau A ni au niveau AA. Deux titres de niveau 1 sont un défaut de lecture
 *    d'écran, pas une non-conformité : axe, qui ne rend que ce que la norme dit,
 *    se tait, et il s'est tu sur les dix-huit états balayés le 2026-09-06.
 * ② `page-has-heading-one` est étiquetée **`best-practice`**. Elle est donc HORS
 *    du jeu `wcag2a / wcag2aa / wcag21a / wcag21aa` sélectionné par `NORMES`
 *    (voir plus haut) et ne tourne pas ici. L'activer ne remplacerait rien : elle
 *    teste une PRÉSENCE (« au moins un »), jamais une unicité — une page à trois
 *    `h1` la passe. Et l'ajouter reviendrait à mélanger un jeu de règles
 *    normatif avec une bonne pratique, ce qui rendrait les balayages du terrain
 *    et de la console incomparables (l'un des deux intérêts d'un budget).
 * ③ `heading-order` ne signale qu'un SAUT de niveau (h2 → h4). `h1` suivi de
 *    `h1` n'est pas un saut : elle est VERTE sur le défaut qu'on traque.
 * Un balayage axe vert ne dit donc rien de cette règle. Il fallait l'écrire.
 *
 * ── ET POURQUOI ELLE VIT DANS SON PROPRE TEST ──────────────────────────────
 * Glissée dans le balayage, elle aurait interrompu `balayer()` avant l'analyse :
 * un `h1` en trop aurait masqué les violations axe de l'écran, et on ne saurait
 * plus lequel des deux défauts on lit. Une assertion à part entière, un verdict
 * à part entière.
 */
async function unSeulTitreDePage(page: Page, ecran: string): Promise<void> {
  const titres = page.locator('h1');
  const textes = (await titres.allInnerTexts()).map((texte) => texte.trim());
  // Le chiffre est LU par A20 et recopié dans le rapport : la garde doit dire ce
  // qu'elle a trouvé, pas seulement qu'elle a échoué.
  test.info().annotations.push({
    type: 'mesure A28',
    description:
      `h1 — ${ecran} : ${String(textes.length)} titre(s) de niveau 1 — ` +
      (textes.length === 0 ? '(aucun)' : textes.join(' | ')),
  });
  await expect(
    titres,
    `« ${ecran} » : ${String(textes.length)} <h1> dans le document [${textes.join(' | ')}]. ` +
      'Le titre canonique est celui de la COQUILLE, alimenté par le registre ' +
      '`app/vues.ts` ; un écran rendu sous `<main>` n’en porte pas, et un écran ' +
      'rendu hors coquille n’en porte qu’un (règle A01 du 2026-09-10). ' +
      'Défaut rendu à son producteur, jamais corrigé ici (09 §5.6).',
  ).toHaveCount(1);
}

/** Repose l'appareil équipé, puis l'ouvre : on atterrit sur le cockpit. */
async function appareilOuvert(page: Page): Promise<void> {
  await planterAppareil(page, await graines());
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);
  await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
}

/** Le cockpit, avec son anti-vacuité : mission lue, journée vide affichée. */
async function allerAujourdhui(page: Page): Promise<void> {
  await appareilOuvert(page);
  await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
  // Le titre de mission vit dans une charge CHIFFRÉE : le lire prouve que le
  // coffre s'est ouvert, ce qu'aucun contrôle de titre d'écran ne prouverait.
  await expect(page.getByRole('heading', { name: MISSION_FIL_TPE.titre })).toBeVisible();
  await expect(page.getByText('Aucune session prévue aujourd’hui')).toBeVisible();
}

/** L'écran d'embarquement du socle, atteint depuis le cockpit (03 §34.2). */
async function allerAccueil(page: Page): Promise<void> {
  await allerAujourdhui(page);
  await page.getByRole('button', { name: 'Missions et stockage de l’appareil' }).click();
  await expect(titreDeCoquille(page, 'accueil')).toBeVisible();
  // L'ancre PROPRE À L'ÉCRAN (constat A28-1 : `accueil` et `aujourdhui` portent
  // le même titre, donc le titre ne suffit pas). Elle tient parce qu'elle dépend
  // de `mission.embarquee`, l'état que ce parcours pose — et de rien d'autre.
  //
  // Ce qui NE peut pas servir d'ancre ici : le titre du rappel hors ligne.
  // `RappelHorsLigne` rend `null` quand `enLigne` vaut vrai (son garde, ligne 93)
  // et ce helper navigue EN LIGNE ; depuis que #81 a rendu la liste de l'accueil
  // conditionnelle, l'exiger revenait à exiger un texte que l'écran a raison de
  // ne pas peindre. C'est ce qui faisait tomber `accueil` et les deux
  // `restauration`, qui passent par ici — trois cas, une seule cause.
  // Le rappel est éprouvé là où il doit l'être : au 4ᵉ état du §33.2, plus bas.
  await expect(page.getByText('Données présentes sur cet appareil')).toBeVisible();
}

/** Le formulaire en trois champs (03 §17.1), atteint depuis le cockpit. */
async function allerNouvelEntretien(page: Page): Promise<void> {
  await allerAujourdhui(page);
  await page.getByRole('button', { name: 'Nouvel entretien' }).click();
  await expect(titreDeCoquille(page, 'nouvelEntretien')).toBeVisible();
  await expect(page.getByText('Trois champs.')).toBeVisible();
  await expect(page.getByLabel('Nom de l’interlocuteur')).toBeVisible();
}

/** Crée l'entretien et s'arrête AVANT la première question (03 M3.2). */
async function allerEntretienAvantDemarrage(page: Page): Promise<void> {
  await allerNouvelEntretien(page);
  await page.getByLabel('Nom de l’interlocuteur').fill(INTERLOCUTEUR);
  await page.getByLabel('Fonction').fill(FONCTION);
  await page.getByLabel('Unité').selectOption({ label: MISSION_FIL_TPE.unite });
  await page.getByRole('button', { name: 'Ouvrir l’entretien' }).click();
  await expect(titreDeCoquille(page, 'entretien')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avant la première question' })).toBeVisible();
  await expect(page.getByLabel('Accord de participation recueilli')).toBeVisible();
}

/** Franchit l'accord de participation : l'écran de collecte à trois zones (§33.3). */
async function allerEntretienEnCours(page: Page): Promise<void> {
  await allerEntretienAvantDemarrage(page);
  await page.getByLabel('Accord de participation recueilli').check();
  await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
  await expect(page.getByRole('heading', { name: PREMIERE_QUESTION })).toBeVisible();
  await expect(page.getByLabel('Votre réponse')).toBeVisible();
}

/** Le compteur « Question r / t » affiché par `ZoneQuestion`. */
function compteurDeQuestion(page: Page): Locator {
  return page.getByText(/^Question \d+ \/ \d+$/);
}

/**
 * Avance jusqu'à la DERNIÈRE question du parcours.
 *
 * Le total est LU À L'ÉCRAN et non recopié depuis la fixture : une constante de
 * test qui double une donnée de fixture survit toujours au jour où la fixture
 * change, et le test avance alors d'un cran de trop — ou de trop peu — sans rien
 * dire. Chaque pas est confirmé par le compteur, ce qui donne un échec situé
 * (« bloqué à la question 2 ») plutôt qu'un délai d'attente muet.
 *
 * C'est aussi le seul état où le geste de fin existe : `ZoneQuestion` ne rend
 * « Terminer l'entretien » qu'à la place de « Suivant », sur la dernière
 * question (M2 de la recette novice A54).
 */
async function allerDerniereQuestion(page: Page): Promise<void> {
  await allerEntretienEnCours(page);
  const compteur = compteurDeQuestion(page);
  const total = Number(/\/\s*(\d+)$/.exec((await compteur.innerText()).trim())?.[1] ?? '0');
  expect(total, 'le parcours de la fixture ne compte aucune question').toBeGreaterThan(1);
  for (let rang = 1; rang < total; rang += 1) {
    await page.getByRole('button', { name: /^Suivant/ }).click();
    await expect(compteur).toHaveText(`Question ${String(rang + 1)} / ${String(total)}`);
  }
  await expect(page.getByRole('button', { name: 'Terminer l’entretien' })).toBeVisible();
}

/**
 * L'écran de rattachement de l'appareil à son auditeur (PR #80).
 *
 * L'appareil est semé SANS identité : c'est la seule condition dans laquelle le
 * rappel de la coquille propose le geste, et c'est aussi le seul état de cet
 * écran qu'un auditeur rencontre avant d'avoir un compte dessus.
 */
async function allerConnexionSiege(page: Page): Promise<void> {
  await planterAppareil(page, sansIdentiteAuditeur(await graines()));
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);
  await expect(page.getByText('Cet appareil n’est rattaché à aucun auditeur')).toBeVisible();
  await page.getByRole('button', { name: 'Rattacher cet appareil' }).click();
  await expect(titreDeCoquille(page, 'connexionSiege')).toBeVisible();
  await expect(page.getByText('Pourquoi cette étape')).toBeVisible();
  await expect(page.getByLabel(/Adresse de votre compte/)).toBeVisible();
  await expect(page.getByLabel(/Mot de passe du compte/)).toBeVisible();
}

/**
 * L'aide clavier de l'entretien, ouverte par « ? » (R7, 03 §17.5 et §33.3).
 *
 * Ouverte AU CLAVIER, comme un auditeur le fait : il n'existe pas de bouton, et
 * c'est délibéré (les sept outils du §17.4 sont une liste fermée). L'anti-vacuité
 * porte sur le contenu de la fenêtre, pas sur sa présence : un panneau vide
 * passerait un balayage axe sans rien mesurer.
 */
async function allerAideClavier(page: Page): Promise<void> {
  await allerEntretienEnCours(page);
  // Ce qui ANNONCE le raccourci doit être là : un accélérateur que rien ne
  // signale n'accélère personne, et c'est tout le constat de R7.
  await expect(page.getByText('Raccourcis clavier : tapez « ? » pour la liste.')).toBeVisible();
  await page.keyboard.press('?');
  const fenetre = page.getByRole('dialog', { name: 'Raccourcis clavier' });
  await expect(fenetre).toBeVisible();
  await expect(fenetre.locator('kbd')).not.toHaveCount(0);
  await expect(fenetre.getByText('Afficher cette aide')).toBeVisible();
}

/**
 * La liste des points à revoir, atteinte PAR LE COMPTEUR du cockpit (03 §34.2).
 *
 * Le parcours pose d'abord un point à revoir, et ce n'est pas un détour : à
 * zéro, le compteur n'est pas un lien mais la phrase « Aucun point à revoir »
 * (voir `EcranAujourdhui`, NB-15). L'écran ne s'atteint donc, par un geste de
 * production, qu'après un drapeau posé — c'est le parcours réel de l'auditeur.
 *
 * La remontée passe par la sortie de la coquille : `Ouvrir l'entretien` REMPLACE
 * la vue (`EcranNouvelEntretien`), la pile est donc [cockpit, entretien] et un
 * seul retour ramène au cockpit, sans replanter l'appareil — replanter effacerait
 * le drapeau qu'on vient de poser.
 *
 * ── RELU ET REPRIS PAR A26 LE 2026-09-09 (09 §5.6) ─────────────────────────
 * A22 a dû écrire ce parcours pour que `pnpm lint` compile (le `satisfies` de la
 * table refuse une vue sans parcours) et l'a signalé de lui-même. Relu comme si
 * je l'écrivais, trois choses manquaient, et deux d'entre elles auraient produit
 * un échec qui n'aurait PAS désigné sa cause :
 *
 *   ① AUCUNE ATTENTE ENTRE « Confirmer » ET « Revenir ». L'écriture du drapeau
 *      est locale et ASYNCHRONE (`enregistrer` → transaction Dexie) ; Playwright
 *      n'attend que l'actionnabilité du bouton suivant, jamais la fin d'une
 *      écriture. Le geste suivant pouvait donc partir avant que la ligne soit
 *      posée. Et si elle ne l'était pas, l'échec tombait DEUX gestes plus loin,
 *      sur « bouton compteur introuvable » — à l'endroit où l'on chercherait un
 *      défaut du cockpit alors que la cause serait dans l'entretien. On attend
 *      donc le BADGE « À revoir », qui n'est rendu que si la ligne relue porte
 *      `flagReview === 1` : c'est l'aller-retour complet écriture → lecture.
 *   ② LA PILE ÉTAIT UNE HYPOTHÈSE, JAMAIS UNE MESURE. « un seul retour ramène au
 *      cockpit » suppose que `Ouvrir l'entretien` REMPLACE. Le cockpit est une
 *      racine (`app/navigation.ts`, `VUES_RACINE`) : sur une racine, la coquille
 *      ne rend PAS de bouton « Revenir ». Son absence est donc la preuve directe
 *      que la pile est bien retombée à un élément — deux lignes, et l'hypothèse
 *      devient un fait.
 *   ③ « BOUTON COMPTEUR UNIQUE » N'ÉTAIT PAS VÉRIFIÉ. `/point\(s\) à revoir/`
 *      ne heurte pas « Voir les points à revoir » (l'alerte) par la seule grâce
 *      des parenthèses de « point(s) ». C'est trop fin pour être laissé
 *      implicite : le motif est ancré sur le nombre, et l'unicité est exigée.
 */
async function allerARevoir(page: Page): Promise<void> {
  await allerEntretienEnCours(page);
  await page.getByRole('button', { name: /^À revoir/ }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();

  // ① l'écriture a abouti ET a été relue : le badge d'état vient de la ligne.
  await expect(
    page.getByLabel('États de la réponse').getByText('À revoir', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Revenir' }).click();
  await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
  // ② on est bien à la RACINE : plus de sortie dans la coquille.
  await expect(page.getByRole('button', { name: 'Revenir' })).toHaveCount(0);

  // ③ un seul compteur, ancré sur son nombre.
  const compteur = page.getByRole('button', { name: /^\d+ point\(s\) à revoir$/ });
  await expect(compteur).toHaveCount(1);
  await compteur.click();

  await expect(titreDeCoquille(page, 'aRevoir')).toBeVisible();
  await expect(page.getByRole('heading', { name: MISSION_FIL_TPE.titre })).toBeVisible();
}

/** L'écran de restauration, atteint depuis l'écran d'embarquement (03 §34.2). */
async function allerRestauration(page: Page): Promise<void> {
  await allerAccueil(page);
  await page.getByRole('button', { name: 'Restaurer une sauvegarde de secours' }).click();
  await expect(titreDeCoquille(page, 'restauration')).toBeVisible();
  await expect(page.getByLabel('Fichier de sauvegarde')).toBeVisible();
  await expect(page.getByLabel(/appareil qui a produit la sauvegarde/)).toBeVisible();
}

/**
 * Coupe le réseau du contexte, sans recharger la page.
 *
 * ── POURQUOI SANS RECHARGEMENT, ET POURQUOI C'EST SUFFISANT ICI ────────────
 * `hors-ligne-l5.e2e.ts` coupe puis REDÉMARRE À FROID : c'est son sujet, le
 * précache du service worker. Le sujet d'ici est le RENDU de l'état hors ligne,
 * et ce qui le pilote est `useEnLigne` (`session/media.ts`), c'est-à-dire
 * l'événement `offline` et le drapeau `navigator.onLine`. On coupe donc, et on
 * vérifie que le drapeau que lit l'interface a bien basculé.
 *
 * Ce même fichier note un artefact mesuré : après un RECHARGEMENT, le drapeau
 * repasse à `true` alors que le réseau reste coupé. Ne pas recharger l'évite —
 * et évite surtout d'attendre le service worker pour une question qui ne le
 * concerne pas.
 */
async function couperLeReseau(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await expect
    .poll(() => page.evaluate(() => navigator.onLine), {
      message: 'le drapeau que lit `useEnLigne` doit dire « hors ligne »',
      timeout: 10_000,
    })
    .toBe(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// LA TABLE DES PARCOURS — le point où l'oubli devient une erreur de COMPILATION
// ─────────────────────────────────────────────────────────────────────────────
interface Etat {
  /** Ce que l'écran montre à ce moment-là — repris dans le message d'échec. */
  readonly libelle: string;
  /** Y mène par les gestes de production, ET prouve qu'on y est. */
  readonly atteindre: (page: Page) => Promise<void>;
}

/**
 * Le QUATRIÈME état du 03 §33.2 — celui que le réseau coupé fait apparaître.
 *
 * ── POURQUOI IL N'EST DÉCLARÉ QUE PAR QUATRE VUES SUR DOUZE ────────────────
 * Mesuré le 2026-09-06 sur `main` : **quatre écrans seulement** rendent quelque
 * chose de différent quand la connexion tombe — `aujourdhui`, `entretien` et
 * `restauration` (par `useEnLigne`), plus `connexionSiege` (par
 * `RappelHorsLigne`, PR #80). Les huit autres rendent, réseau coupé, exactement
 * le même DOM qu'en ligne.
 *
 * Les balayer une seconde fois ne mesurerait donc RIEN, et ce fichier refuse
 * précisément les balayages qui ne mesurent rien : ce serait remplacer un trou
 * par huit verts vides, ce qui est pire, parce qu'un vert vide se coche.
 *
 * Le champ est OPTIONNEL et il attend : la PR #81 branche `RappelHorsLigne` sur
 * les autres vues, et chacune recevra alors son `horsLigne` — trois lignes de
 * table, aucun changement de mécanique. **Ce chiffre-là est un constat daté, pas
 * une cible** : « 4 vues sur 12 rendent l'état hors ligne » est aujourd'hui vrai
 * de l'APPLICATION, comme « 3 vues sur 11 sont balayées » l'était du BALAYAGE.
 * Aucune assertion ne le fige, pour qu'#81 n'ait pas à rougir en arrivant.
 */
interface EtatHorsLigne {
  /** L'état depuis lequel on coupe le réseau — un des `etats` ci-dessus. */
  readonly depuis: (page: Page) => Promise<void>;
  /** Ce que l'écran doit alors afficher : l'anti-vacuité de cet état-là. */
  readonly marqueur: string;
}

interface Parcours {
  /** Un ou plusieurs états du même écran. Jamais zéro. */
  readonly etats: readonly Etat[];
  /** Millisecondes accordées au test — les parcours longs les demandent. */
  readonly delaiMs: number;
  /** L'état hors ligne, quand l'écran en a un de distinct (voir ci-dessus). */
  readonly horsLigne?: EtatHorsLigne;
}

const PARCOURS = {
  deverrouillage: {
    delaiMs: 120_000,
    etats: [
      {
        libelle: 'coffre existant, appareil déjà équipé',
        atteindre: async (page: Page): Promise<void> => {
          await planterAppareil(page, await graines());
          await expect(
            page.getByRole('heading', { name: 'Déverrouiller la collecte' }),
          ).toBeVisible();
          await expect(page.getByLabel(/^Mot de passe/)).toBeVisible();
        },
      },
    ],
  },
  stockage: {
    delaiMs: 120_000,
    etats: [
      {
        libelle: 'guidage après refus de la conservation (05 §31-2)',
        atteindre: async (page: Page): Promise<void> => {
          await planterAppareil(page, sansPreparationDeStockage(await graines()));
          await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);
          // Aucune mission embarquée : la règle d'atterrissage laisse sur
          // `accueil` (arbitrage A01, 2026-09-05), d'où part le geste.
          await expect(titreDeCoquille(page, 'accueil')).toBeVisible();
          await page.getByRole('button', { name: 'Préparer cet appareil' }).click();
          // Chromium n'accorde `persist()` qu'à une application installée : le
          // refus est le comportement NOMINAL d'un navigateur de test, et c'est
          // lui qui conduit à l'écran de guidage (B3, recette novice A54).
          await expect(titreDeCoquille(page, 'stockage')).toBeVisible();
          await expect(
            page.getByText('La conservation des données n’est pas garantie'),
          ).toBeVisible();
        },
      },
    ],
  },
  accueil: {
    delaiMs: 120_000,
    etats: [{ libelle: 'une mission embarquée', atteindre: allerAccueil }],
  },
  nouvelEntretien: {
    delaiMs: 120_000,
    etats: [{ libelle: 'trois champs, état nominal', atteindre: allerNouvelEntretien }],
  },
  entretien: {
    delaiMs: 180_000,
    etats: [
      { libelle: 'avant la première question', atteindre: allerEntretienAvantDemarrage },
      { libelle: 'collecte en cours, trois zones', atteindre: allerEntretienEnCours },
      { libelle: 'dernière question, geste de fin actif', atteindre: allerDerniereQuestion },
      // AJOUTÉ par A26 le 2026-09-09 avec R7. L'aide clavier est une FENÊTRE
      // MODALE, et une fenêtre modale est un état d'écran à part entière : elle
      // change le nom accessible de la page, piège le focus et rend une liste de
      // définitions. Rien de tout cela n'est balayé par les trois états
      // ci-dessus, où elle est fermée. Ses comportements (Échap, piège, focus
      // rendu) sont éprouvés en jsdom ; le CONTRASTE, lui, ne se mesure qu'ici —
      // `color-contrast` ne tourne pas sans mise en page, et `<kbd>` reçoit une
      // police et un fond qui lui sont propres (`entretien.css`).
      { libelle: 'aide clavier ouverte par « ? »', atteindre: allerAideClavier },
    ],
    // On coupe depuis la COLLECTE EN COURS, et non depuis l'état d'avant la
    // première question : celui-ci porte déjà le défaut A28-2, et deux rouges
    // pour un seul défaut ne disent pas plus qu'un.
    horsLigne: {
      depuis: allerEntretienEnCours,
      marqueur: 'Répondre à chaque question, la marquer à revoir, sans objet ou non communiquée',
    },
  },
  aujourdhui: {
    delaiMs: 120_000,
    etats: [{ libelle: 'journée vide', atteindre: allerAujourdhui }],
    horsLigne: {
      depuis: allerAujourdhui,
      marqueur: 'Ouvrir, mener et terminer une session de collecte',
    },
  },
  agenda: {
    delaiMs: 120_000,
    etats: [
      {
        libelle: 'planification, aucune session du jour',
        atteindre: async (page: Page): Promise<void> => {
          await allerAujourdhui(page);
          await page.getByRole('button', { name: /l’agenda/ }).click();
          await expect(titreDeCoquille(page, 'agenda')).toBeVisible();
          await expect(
            page.getByRole('heading', { name: 'Planifier une session de collecte' }),
          ).toBeVisible();
          // L'unité descendue du siège vit dans une charge chiffrée : la lire
          // prouve que la liste n'est pas un squelette de chargement.
          await expect(page.getByLabel('Unité')).toHaveText(new RegExp(MISSION_FIL_TPE.unite));
        },
      },
    ],
  },
  pilote: {
    delaiMs: 120_000,
    etats: [
      {
        libelle: 'parcours guidé de la mission (03 §17.2)',
        atteindre: async (page: Page): Promise<void> => {
          await allerAujourdhui(page);
          await page.getByRole('button', { name: 'Où en est cette mission ?' }).click();
          await expect(titreDeCoquille(page, 'pilote')).toBeVisible();
          await expect(page.getByRole('heading', { name: MISSION_FIL_TPE.titre })).toBeVisible();
          await expect(page.locator('li.axn-journee__etape').first()).toBeVisible();
        },
      },
    ],
  },
  finDeJournee: {
    delaiMs: 120_000,
    etats: [
      {
        libelle: 'rituel du soir (invariant 8)',
        atteindre: async (page: Page): Promise<void> => {
          await allerAujourdhui(page);
          await page.getByRole('button', { name: 'Fin de journée', exact: true }).click();
          await expect(titreDeCoquille(page, 'finDeJournee')).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Sauvegarde de secours' })).toBeVisible();
          await expect(page.getByLabel('Mot de passe de cet appareil')).toBeVisible();
        },
      },
    ],
  },
  restauration: {
    delaiMs: 120_000,
    etats: [
      { libelle: 'appareil de remplacement, avant dépôt du fichier', atteindre: allerRestauration },
    ],
    horsLigne: {
      depuis: allerRestauration,
      marqueur: 'Restaurer une sauvegarde de secours, intégralement sans réseau',
    },
  },
  finDeSession: {
    delaiMs: 180_000,
    etats: [
      {
        libelle: 'récapitulatif après un entretien démarré (03 §17.3)',
        atteindre: async (page: Page): Promise<void> => {
          await allerDerniereQuestion(page);
          await page.getByRole('button', { name: 'Terminer l’entretien' }).click();
          await expect(titreDeCoquille(page, 'finDeSession')).toBeVisible();
          await expect(page.getByText(INTERLOCUTEUR).first()).toBeVisible();
        },
      },
    ],
  },
  // ── La DOUZIÈME vue, arrivée avec la PR #80 le 2026-09-06 ────────────────
  // Elle n'a pas été ajoutée ici « au cas où » : le `satisfies` ci-dessous a
  // REFUSÉ DE COMPILER à la minute où `vues.ts` a reçu sa ligne. C'est
  // exactement ce que ce fichier promettait — le douzième écran naît avec son
  // balayage ou ne naît pas — et c'est arrivé le jour même.
  connexionSiege: {
    delaiMs: 120_000,
    etats: [{ libelle: 'appareil non rattaché, formulaire', atteindre: allerConnexionSiege }],
    // Le seul écran qui EXIGE le réseau : son rappel hors ligne ne dit donc pas
    // « tout marche », il dit ce qui marche encore. Depuis que #81 est entrée,
    // les DOUZE vues rendent `RappelHorsLigne` ; celle-ci n'est plus l'exception.
    //
    // Le marqueur est RECOPIÉ de `apps/field/src/app/capacites-hors-ligne.ts`,
    // jamais reformulé. Il l'avait été ici, et lui seul des quatre : le test
    // attendait « ouvrir ce qui est déjà enregistré ici » là où l'écran peint
    // « … sur cet appareil ». `getByText` cherche une sous-chaîne sensible à la
    // casse — une paraphrase ne peut donc que rendre un faux rouge, et elle
    // accusait l'écran d'un manquement au §33.2 qu'il ne commettait pas.
    horsLigne: {
      depuis: allerConnexionSiege,
      marqueur: 'Ouvrir ce qui est déjà enregistré sur cet appareil',
    },
  },
  // ── La TREIZIÈME vue, arrivée avec NB-15 le 2026-09-09 ──────────────────
  // Même histoire que la douzième : le `satisfies` a refusé de compiler dès que
  // `vues.ts` a reçu sa ligne. Le marqueur hors ligne est RECOPIÉ de
  // `apps/field/src/app/capacites-hors-ligne.ts`, jamais reformulé.
  aRevoir: {
    delaiMs: 180_000,
    etats: [{ libelle: 'un point à revoir, atteint par le compteur', atteindre: allerARevoir }],
    horsLigne: {
      depuis: allerARevoir,
      marqueur: 'Relire les points à revoir de la mission, calculés sur cet appareil',
    },
  },
} as const satisfies Record<CodeVue, Parcours>;

/** Les codes viennent de la TABLE, dont le type vient du REGISTRE. */
const CODES = Object.keys(PARCOURS) as readonly CodeVue[];

/**
 * Le parcours d'une vue, ÉLARGI au type déclaré.
 *
 * `as const satisfies` garde les types littéraux — ce qui est voulu, c'est lui
 * qui refuse une vue sans parcours — mais il rend du même coup `horsLigne`
 * inconnu des entrées qui ne le déclarent pas. On élargit une fois, ici, plutôt
 * que de disperser des conversions dans le fichier.
 */
function parcoursDe(code: CodeVue): Parcours {
  return PARCOURS[code];
}

// ─────────────────────────────────────────────────────────────────────────────
// A. LE COMPTE — il échoue si une vue du registre n'est pas balayée
// ─────────────────────────────────────────────────────────────────────────────
test('contrôle d’anti-vacuité : toutes les vues du registre ont un parcours balayé', () => {
  const registre = Object.keys(VUES);
  expect(CODES.length, 'une vue du registre n’a pas de parcours').toBe(registre.length);
  expect([...CODES].sort()).toEqual([...registre].sort());
  // Le nombre EN CLAIR : le jour où il change, ce test le dit avant la porte.
  // Il est passé de 11 à 12 le 2026-09-06 (PR #80, `connexionSiege`) — et c'est
  // le `satisfies` qui l'a dit le premier, à la compilation.
  //
  // Puis de 12 à 13 le 2026-09-09 (`aRevoir`, NB-15), et CETTE fois le
  // `satisfies` n'a rien dit : il exige un PARCOURS par vue, pas un compte. Le
  // parcours a été ajouté, ce recensement non — la suite E2E est donc restée
  // ROUGE sur cette ligne, invisible parce que le port 4173 était occupé par le
  // banc de mesure d'un autre chantier et que le fichier n'a pas pu tourner.
  // C'est le recensement qui a fait son travail : il dit à la porte ce que la
  // compilation ne pouvait pas dire. Constat rendu à A22 (09 §5.6) ; le chiffre
  // est une DONNÉE de registre, et c'est à ce titre qu'A26 le repose.
  expect(registre.length, 'le registre a changé de taille — le rapport A28 aussi').toBe(13);
  for (const code of CODES) {
    expect(parcoursDe(code).etats.length, `${code} : aucun état à balayer`).toBeGreaterThan(0);
  }

  // Le périmètre RÉEL, compté et annoté — jamais déclaré. C'est ce chiffre que
  // le rapport A28 recopie, et c'est lui qu'on compare d'un lot à l'autre.
  const etats = CODES.reduce((total, code) => total + parcoursDe(code).etats.length, 0);
  const avecHorsLigne = CODES.filter((code) => parcoursDe(code).horsLigne !== undefined);
  test.info().annotations.push({
    type: 'mesure A28',
    description:
      `périmètre balayé : ${String(CODES.length)} vue(s) du registre · ` +
      `${String(etats + avecHorsLigne.length)} état(s) · ` +
      `état hors ligne distinct rendu par ${String(avecHorsLigne.length)} vue(s) : ` +
      avecHorsLigne.join(', '),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LE TITRE DE PAGE — exactement un `<h1>` par vue, sur TOUTES les vues
// ─────────────────────────────────────────────────────────────────────────────
//
// UN TEST PAR VUE, et non par état : le nombre de `h1` est une propriété de la
// COMPOSITION (coquille + écran), pas du moment de l'écran. Le premier état
// déclaré la rend entièrement, et treize contextes de navigateur supplémentaires
// se paient déjà en minutes de CI.
//
// MESURÉ ROUGE AVANT TOUT CORRECTIF, le 2026-09-10 — c'est l'étalon sans lequel
// on ne saurait pas que la garde mord. Le relevé est au rapport A28 du jour.
// ─────────────────────────────────────────────────────────────────────────────
for (const code of CODES) {
  const parcours = parcoursDe(code);
  const [premier] = parcours.etats;
  if (premier === undefined) {
    throw new Error(`${code} : aucun état déclaré — voir le recensement ci-dessus`);
  }

  test(`@critique ${code} — « ${VUES[code].titre} » : exactement un <h1> dans le document`, async ({
    page,
  }) => {
    test.setTimeout(parcours.delaiMs);
    await premier.atteindre(page);
    await unSeulTitreDePage(page, `${code} — ${premier.libelle}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// C. LE BALAYAGE — un test par ÉTAT d'écran, engendré depuis la table
// ─────────────────────────────────────────────────────────────────────────────
//
// UN TEST PAR ÉTAT, et non un test par vue qui les enchaînerait. Deux raisons,
// mesurées l'une et l'autre le 2026-09-06 :
//
// ① Un contexte navigateur par état. Le semis d'appareil part d'un navigateur
//    VIERGE — `planterAppareil` attend l'écran de premier usage. Enchaîner deux
//    états dans la même page faisait retomber le second sur « Déverrouiller la
//    collecte », et l'échec parlait du test, pas de l'écran.
// ② Un état rouge ne masque pas les autres. Trois états de l'écran d'entretien
//    ne se répondent pas : savoir lequel exactement porte la violation est la
//    moitié de ce qu'un producteur doit lire pour la fermer.
// ─────────────────────────────────────────────────────────────────────────────
for (const code of CODES) {
  const parcours = parcoursDe(code);

  for (const etat of parcours.etats) {
    test(`@critique ${code} — « ${VUES[code].titre} » (${etat.libelle}) : aucune violation axe (A/AA, 2.0 et 2.1)`, async ({
      page,
    }) => {
      test.setTimeout(parcours.delaiMs);
      await etat.atteindre(page);
      const griefs = await balayer(page, `${code} — ${etat.libelle}`);
      expect(
        griefs,
        `axe-core — ${String(griefs.length)} violation(s) :\n${resumer(griefs)}\n` +
          'Aucune règle n’a été désactivée et aucun périmètre rétréci (09 §5.7) : ' +
          'le défaut est rendu à son producteur, il n’est pas corrigé ici (09 §5.6).',
      ).toEqual([]);
    });
  }

  // ── Le QUATRIÈME état du §33.2, là où l'écran en a un ────────────────────
  const { horsLigne } = parcours;
  if (horsLigne !== undefined) {
    test(`@critique ${code} — « ${VUES[code].titre} » (réseau coupé, 4ᵉ état du §33.2) : aucune violation axe`, async ({
      page,
    }) => {
      test.setTimeout(parcours.delaiMs);
      await horsLigne.depuis(page);
      // Anti-vacuité de CET état : sans ce contrôle, on rebalaierait le DOM
      // d'en ligne et on croirait avoir mesuré l'état hors ligne.
      await expect(page.getByText(horsLigne.marqueur)).toBeHidden();
      await couperLeReseau(page);
      await expect(
        page.getByText(horsLigne.marqueur),
        `${code} : réseau coupé, l’écran ne rend AUCUN état hors ligne (§33.2)`,
      ).toBeVisible();

      const griefs = await balayer(page, `${code} — réseau coupé`);
      expect(
        griefs,
        `axe-core — ${String(griefs.length)} violation(s) :\n${resumer(griefs)}\n` +
          'Aucune règle n’a été désactivée et aucun périmètre rétréci (09 §5.7) : ' +
          'le défaut est rendu à son producteur, il n’est pas corrigé ici (09 §5.6).',
      ).toEqual([]);
    });
  }
}
