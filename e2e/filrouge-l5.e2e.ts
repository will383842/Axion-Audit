// =============================================================================
// @filrouge — LE SEGMENT **L5** DU PARCOURS CUMULATIF, DANS UN NAVIGATEUR
// Écrit par A26 le 2026-09-09.
//
// ── CE QUI MANQUAIT, MESURÉ CONTRE LE FICHIER 07 ────────────────────────────
// 07 §13 (fil rouge cumulatif) et 09 §4bis : « Un test **Playwright** unique
// marqué `@filrouge` rejoue à CHAQUE merge le parcours de bout en bout
// DISPONIBLE À DATE : création mission → import arbre → questionnaire figé (L3)
// → import banque (L4) → **session hors ligne, cotation, à-revoir, photo (L5)**
// → sync + rejeu (L6) → export (L7) — chaque lot ne fait qu'ALLONGER le
// scénario, jamais le réécrire. Toute porte exige `@filrouge` vert sur LES DEUX
// missions. »
//
// État mesuré le 2026-09-09, `grep -rn "@filrouge"` :
//   · `apps/api/tests/l1-filrouge.integration.test.ts` — L1, vitest, 2 missions ;
//   · `apps/api/tests/l3-filrouge.integration.test.ts` — L3, vitest, 2 missions ;
//   · **AUCUN segment L5**, et **aucun `@filrouge` Playwright**. `socle.e2e.ts`
//     et `playwright.config.ts` n'en portent qu'un COMMENTAIRE d'intention.
// C'est le point 4 du contrôle A02 du 2026-09-09 (« `@filrouge` allongé du
// segment L5 — 6ᵉ incrément »), et la substance de la réserve **R-L3-10**
// (PORTE_L3, 2026-09-02 : « l'enveloppe Playwright du fil rouge reste due »),
// dont l'arbitrage A01 datait la bascule « au premier lot qui livre une
// interface — L5 pour le terrain ».
//
// ── CE FICHIER ALLONGE, IL NE RÉÉCRIT RIEN ──────────────────────────────────
// Les deux fichiers `@filrouge` d'intégration restent en place, inchangés : ils
// portent les segments L1 et L3, qui n'ont pas d'interface. Celui-ci prend la
// suite là où l'interface commence, et il porte le MÊME tag, sur les MÊMES deux
// missions canoniques. Le lot L6 n'aura qu'à ajouter ses étapes à la fin.
//
// ── CE QUE LE PARCOURS CONTIENT, ET CE QU'IL DIT NE PAS CONTENIR ────────────
// §4bis nomme quatre choses pour L5 : session hors ligne, cotation, à-revoir,
// **photo**. Les trois premières sont jouées de bout en bout. La quatrième NE
// L'EST PAS, et le parcours le CONSTATE au lieu de l'omettre : le bouton
// « Photo » est rendu, désactivé, et il dit pourquoi (03 §17.4 — « le bouton
// garde sa place »). Un fil rouge qui sauterait silencieusement une étape non
// livrée serait vert sur un parcours plus court que celui qu'il annonce ; ici
// l'étape est jouée jusqu'à son état réel, et le jour où la chaîne photo arrive,
// c'est CETTE assertion qui rougira et demandera la suite du scénario.
//
// ── LA COUPURE RÉSEAU, ET LA LIMITE ASSUMÉE (11 §7) ─────────────────────────
// Le réseau est coupé par `context.setOffline(true)` sur une application DÉJÀ
// chargée : le parcours prouve qu'une journée entière se mène sans réseau. Le
// DÉMARRAGE À FROID depuis le cache du service worker est un autre scénario, et
// il vit dans `hors-ligne-l5.e2e.ts` (@critique), parce qu'il est le seul à
// dépendre de l'activation du worker. Sous **iOS**, les service workers ne sont
// **pas** couverts par Playwright : le mode avion RÉEL sur iPad se rejoue à la
// main aux portes P-C et P-E (checklist 07 §15). Documenté, jamais contourné.
//
// Invariant 2 : FIL-TPE et FIL-GC sont des missions FICTIVES.
// Traçabilité : E6 · E12 · E13 · E23 · E38 · E44.
// =============================================================================
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { VUES, type CodeVue } from '../apps/field/src/app/vues.js';
import {
  ANCRES_ECHELLE_FIL_TPE,
  deverrouillerAppareil,
  lireTableLocale,
  MISSION_FIL_TPE,
  MOT_DE_PASSE_APPAREIL,
  planterAppareil,
  PREMIERE_QUESTION,
  QUESTION_ECHELLE,
  semerAppareil,
  type GrainesAppareil,
} from './fixtures/appareil-terrain.js';
import {
  ANCRES_ECHELLE_FIL_GC,
  arbreFilGc,
  DIMENSIONS_FIL_GC,
  MISSION_FIL_GC,
  questionsFilGc,
  semerAppareilFilGc,
} from './fixtures/mission-fil-gc.js';

const OPTIONS_COMMUNES = { locale: 'fr-FR', timezoneId: 'Europe/Paris' } as const;

/** Les deux missions canoniques du 09 §4bis, à leurs deux échelles. */
interface EchelleFilRouge {
  readonly nom: string;
  readonly titre: string;
  readonly unite: string;
  /** Le nombre d'unités embarquées — la liste déroulante doit toutes les porter. */
  readonly unites: number;
  /** Le nombre de questions figées — le compteur de l'écran doit le dire. */
  readonly questions: number;
  readonly premiereQuestion: string;
  readonly questionEchelle: string;
  /** Les ancres §32.4 de cette question, telles qu'elles doivent SE LIRE. */
  readonly ancres: readonly { readonly niveau: number; readonly libelle: string }[];
  readonly semer: () => Promise<GrainesAppareil>;
}

const questionsGc = questionsFilGc();

const ECHELLES: readonly EchelleFilRouge[] = [
  {
    nom: 'FIL-TPE',
    titre: MISSION_FIL_TPE.titre,
    unite: MISSION_FIL_TPE.unite,
    unites: 1,
    questions: 3,
    premiereQuestion: PREMIERE_QUESTION,
    questionEchelle: QUESTION_ECHELLE,
    ancres: ANCRES_ECHELLE_FIL_TPE,
    semer: () => semerAppareil(MOT_DE_PASSE_APPAREIL),
  },
  {
    nom: 'FIL-GC',
    titre: MISSION_FIL_GC.titre,
    unite: MISSION_FIL_GC.unite,
    unites: DIMENSIONS_FIL_GC.unites,
    questions: DIMENSIONS_FIL_GC.questions,
    premiereQuestion: questionsGc[0]?.texte ?? '',
    // La troisième question est la première à échelle (rotation des types) :
    // c'est celle qui porte les ancres du §32.4 et qui reçoit le drapeau.
    questionEchelle: questionsGc[2]?.texte ?? '',
    ancres: ANCRES_ECHELLE_FIL_GC,
    semer: () => semerAppareilFilGc(MOT_DE_PASSE_APPAREIL),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Outillage — aucun raccourci d'application, que des gestes d'auditeur
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

/** Un créneau d'aujourd'hui, au format `datetime-local` du fuseau du navigateur. */
function creneauDuJour(heure: number): string {
  const maintenant = new Date();
  const jour = [
    String(maintenant.getFullYear()),
    String(maintenant.getMonth() + 1).padStart(2, '0'),
    String(maintenant.getDate()).padStart(2, '0'),
  ].join('-');
  return `${jour}T${String(heure).padStart(2, '0')}:00`;
}

/**
 * Coupe le réseau sur une application DÉJÀ chargée, et le PROUVE deux fois.
 *
 * Le drapeau `navigator.onLine` est ce que lit l'interface (`session/media.ts`),
 * et une requête réelle est ce qui dit si la coupure a pris. Les deux, parce
 * qu'un drapeau peut mentir — et parce que si la coupure n'avait pas pris, tout
 * ce qui suit serait vert pour la mauvaise raison.
 */
async function couperLeReseau(contexte: BrowserContext, page: Page): Promise<void> {
  await contexte.setOffline(true);
  expect(
    await page.evaluate(() => navigator.onLine),
    'le drapeau que lit l’interface doit dire « hors ligne »',
  ).toBe(false);
  expect(
    await page.evaluate(async () => {
      try {
        await fetch(`/sonde-filrouge-${String(Date.now())}`, { cache: 'no-store' });
        return 'le réseau répond encore';
      } catch {
        return 'coupé';
      }
    }),
    'une requête réelle doit échouer : le drapeau seul ne prouve rien',
  ).toBe('coupé');
}

// ═════════════════════════════════════════════════════════════════════════════
// LE PARCOURS, SUR LES DEUX ÉCHELLES
// ═════════════════════════════════════════════════════════════════════════════
for (const echelle of ECHELLES) {
  test(`@filrouge L5 — une journée de collecte hors ligne, de bout en bout (${echelle.nom})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const contexte = await browser.newContext({
      ...OPTIONS_COMMUNES,
      viewport: { width: 1440, height: 900 },
    });
    const page = await contexte.newPage();

    // Rien de ce qui suit ne doit sortir du domaine servi : la police est
    // auto-hébergée (11 §1) et le parcours se joue réseau coupé.
    const externes: string[] = [];
    page.on('request', (requete) => {
      const hote = new URL(requete.url()).hostname;
      if (hote !== '127.0.0.1' && hote !== 'localhost') externes.push(requete.url());
    });
    const pannes: string[] = [];
    page.on('pageerror', (erreur) => pannes.push(erreur.message));

    try {
      // ── ÉTAPE 1 — l'appareil équipé, et le coffre ouvert SANS réseau ──────
      await planterAppareil(page, await echelle.semer());
      await couperLeReseau(contexte, page);
      await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

      await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
      // Le titre de mission vit dans une charge CHIFFRÉE : le lire prouve que le
      // coffre s'est ouvert, ce qu'aucun contrôle de titre d'écran ne prouverait.
      await expect(page.getByRole('heading', { name: echelle.titre })).toBeVisible();

      // ── ÉTAPE 2 — l'agenda : une session planifiée, à l'échelle de la mission
      await page.getByRole('button', { name: /l’agenda/ }).click();
      await expect(titreDeCoquille(page, 'agenda')).toBeVisible();

      const unites = page.getByLabel('Unité').locator('option');
      // LA PREUVE D'ÉCHELLE : l'arbre entier est descendu et lisible au doigt.
      // C'est ici, et nulle part ailleurs, que « la même app aux deux échelles »
      // devient une mesure plutôt qu'une affirmation.
      await expect(unites).toHaveCount(echelle.unites);
      await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
      await page.getByLabel('Nom de l’interlocuteur').fill('Interlocuteur fil rouge');
      await page.getByLabel('Fonction').fill('Responsable de production');
      await page.getByLabel('Unité').selectOption({ label: echelle.unite });
      await page.getByLabel('Créneau').fill(creneauDuJour(9));
      await page.getByRole('button', { name: 'Planifier' }).click();
      await expect(page.getByText('Session planifiée.')).toBeVisible();

      // ── ÉTAPE 3 — UN TAP démarre la session pré-remplie (03 §34.2 V2.10) ──
      await page.getByRole('button', { name: 'Revenir' }).click();
      await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
      await page.getByRole('button', { name: /Interlocuteur fil rouge/ }).click();
      await expect(titreDeCoquille(page, 'entretien')).toBeVisible();
      // Zéro champ à ressaisir : seul l'accord de participation reste (03 M3.2).
      await page.getByLabel('Accord de participation recueilli').check();
      await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();

      // ── ÉTAPE 4 — LA COTATION, sur deux types de réponse ──────────────────
      await expect(page.getByRole('heading', { name: echelle.premiereQuestion })).toBeVisible();
      await expect(page.getByText(`Question 1 / ${String(echelle.questions)}`)).toBeVisible();

      const REPONSE_LIBRE =
        'La commande arrive par téléphone, elle est notée sur un carnet, puis ressaisie le soir.';
      await page.getByLabel('Votre réponse').fill(REPONSE_LIBRE);
      // On attend LA LIGNE LOCALE, pas l'indicateur : « Enregistré à HH:mm »
      // reste affiché depuis l'écriture précédente pendant la temporisation.
      await expect
        .poll(async () => (await lireTableLocale(page, 'answers')).length, {
          message: 'la réponse libre doit être une ligne locale',
          timeout: 20_000,
        })
        .toBe(1);
      await expect(page.getByText(/Enregistré à/)).toBeVisible({ timeout: 15_000 });

      // Jusqu'à la question à ÉCHELLE — celle qui porte les ancres du §32.4.
      await page.getByRole('button', { name: /^Suivant/ }).click();
      await page.getByRole('button', { name: /^Suivant/ }).click();
      await expect(page.getByRole('heading', { name: echelle.questionEchelle })).toBeVisible();

      const cotation = page.getByRole('group', { name: 'Votre cotation' });
      await expect(cotation).toBeVisible();
      // Les ancres se LISENT avant le premier geste (03 §33.3) : la cotation
      // homogène ne doit pas dépendre de la mémoire du consultant. `toBeVisible`
      // est la seule assertion qui vaille — dans un `<details>` fermé, ces textes
      // sont DANS le DOM et invisibles, et c'était le défaut R1.
      for (const ancre of echelle.ancres) {
        await expect(
          cotation.getByText(ancre.libelle, { exact: false }),
          `l’ancre ${String(ancre.niveau)} doit être lisible sans aucun geste`,
        ).toBeVisible();
      }
      // Rien n'est coté par la seule LECTURE des ancres.
      await expect(cotation.locator('input[type="radio"]:checked')).toHaveCount(0);

      // Le geste : on tape le LIBELLÉ, pas l'input — le radio est masqué
      // visuellement (recouvrement accessible), et c'est la pastille que le
      // doigt de l'auditeur atteint.
      await cotation
        .locator('.axn-choix__option')
        .filter({ has: page.locator('input[value="3"]') })
        .click();
      await expect(cotation.locator('input[value="3"]')).toBeChecked();
      await expect
        .poll(async () => (await lireTableLocale(page, 'answers')).length, {
          message: 'la cotation doit être une seconde ligne locale',
          timeout: 20_000,
        })
        .toBe(2);

      // ── ÉTAPE 5 — LA PHOTO, ET SON ÉTAT RÉEL À DATE ──────────────────────
      // §4bis nomme la photo dans le segment L5. Elle n'est pas livrée : le
      // bouton garde sa place, désactivé, et il DIT pourquoi (03 §17.4). Le
      // parcours le constate ici. Le jour où la chaîne photo arrive, c'est cette
      // assertion qui rougit et réclame la suite du scénario — c'est exactement
      // ce qu'on veut d'un fil rouge, et l'inverse d'une étape passée sous silence.
      const photo = page.getByRole('button', { name: /^Photo/ });
      await expect(photo).toBeVisible();
      await expect(photo).toBeDisabled();

      // ── ÉTAPE 6 — L'À-REVOIR : une zone d'ombre, posée avant de partir ────
      await page.getByRole('button', { name: /^À revoir/ }).click();
      await page.getByLabel(/^Motif/).fill('à confirmer avec le responsable des accès');
      await page.getByRole('button', { name: 'Confirmer' }).click();
      // L'écriture a abouti ET a été relue : le badge vient de la ligne stockée,
      // et il porte le MOTIF — donc le motif aussi a fait l'aller-retour.
      await expect(page.getByLabel('États de la réponse').getByText(/^À revoir — /)).toContainText(
        'à confirmer avec le responsable des accès',
      );

      // ── ÉTAPE 7 — LE COMPTEUR MÈNE À LA LISTE, ET LA LISTE À LA QUESTION ──
      await page.getByRole('button', { name: 'Revenir' }).click();
      await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
      const compteur = page.getByRole('button', { name: /^\d+ point\(s\) à revoir$/ });
      await expect(compteur).toHaveCount(1);
      await compteur.click();

      await expect(titreDeCoquille(page, 'aRevoir')).toBeVisible();
      const ligne = page.locator('button.axn-journee__session');
      await expect(ligne).toHaveCount(1);
      // La ligne porte de quoi DÉCIDER : la question figée et son motif.
      await expect(ligne).toContainText(echelle.questionEchelle);
      await expect(ligne).toContainText('à confirmer avec le responsable des accès');

      // 03 §17.2 : « cliquer sur un item amène directement à l'écran qui le résout ».
      await ligne.click();
      await expect(titreDeCoquille(page, 'entretien')).toBeVisible();
      await expect(page.getByRole('heading', { name: echelle.questionEchelle })).toBeVisible();

      // ── ÉTAPE 8 — LA ZONE D'OMBRE EST LEVÉE, ET LA LISTE SE VIDE ─────────
      await page.getByRole('button', { name: /^À revoir/ }).click();
      await page.getByRole('button', { name: 'Lever ce marquage' }).click();
      await expect(page.getByLabel('États de la réponse')).toHaveCount(0);

      // ── LE RETOUR SE FAIT SUR LA LISTE, PAS SUR LE COCKPIT ──────────────
      // La pile est [cockpit, points à revoir, entretien] : on revient d'où l'on
      // vient. C'est le comportement juste — et c'est LE chemin par lequel
      // l'état vide de la treizième vue est atteint par un geste de production,
      // le compteur à zéro n'étant pas un lien (NB-15, décision d'A22). Sans ce
      // pas-là, cet état vide ne serait joué par personne.
      await page.getByRole('button', { name: 'Revenir' }).click();
      await expect(titreDeCoquille(page, 'aRevoir')).toBeVisible();
      await expect(page.locator('button.axn-journee__session')).toHaveCount(0);
      await expect(page.getByText('Aucun point à revoir')).toBeVisible();

      await page.getByRole('button', { name: 'Revenir à ma journée' }).click();
      await expect(titreDeCoquille(page, 'aujourdhui')).toBeVisible();
      // Le compteur a disparu et la phrase a pris sa place (NB-15, décision A22).
      await expect(page.getByRole('button', { name: /point\(s\) à revoir$/ })).toHaveCount(0);
      await expect(page.getByText('Aucun point à revoir')).toBeVisible();

      // ── ÉTAPE 9 — LE RITUEL DU SOIR : l'export de secours, sans réseau ────
      // Invariant 8 : « aucune donnée ne vit sur un seul appareil > 24 h ». Le
      // rituel est un BOUTON, pas une discipline de mémoire (03 §34.2 V2.10).
      await page.getByRole('button', { name: 'Fin de journée', exact: true }).click();
      await expect(titreDeCoquille(page, 'finDeJournee')).toBeVisible();
      await page.getByLabel('Mot de passe de cet appareil').fill(MOT_DE_PASSE_APPAREIL);

      const attenteFichier = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Terminer la journée' }).click();
      const fichier = await attenteFichier;
      expect(fichier.suggestedFilename()).toMatch(/\.axionbackup$/);

      // ── CE QUE LE PARCOURS A LAISSÉ EN BASE, LU SANS PASSER PAR L'ÉCRAN ──
      // Un affichage peut mentir ; une ligne écrite, non. Et l'invariant 1 se
      // vérifie ici : tout ce qui a été créé hors ligne porte un UUID v7 CLIENT.
      const reponses = await lireTableLocale(page, 'answers');
      expect(reponses, 'deux réponses, ni doublon ni disparition').toHaveLength(2);
      const sessions = await lireTableLocale(page, 'interviews');
      expect(sessions).toHaveLength(1);
      for (const ligne of [...reponses, ...sessions]) {
        expect(
          String(ligne.id),
          'toute entité créée hors ligne porte un UUID v7 généré sur l’appareil',
        ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
      // La file de montée existe et attend : rien n'est perdu, rien n'est parti.
      expect((await lireTableLocale(page, 'outbox')).length).toBeGreaterThan(0);

      expect(externes, `sorties du domaine servi :\n${externes.join('\n')}`).toEqual([]);
      expect(pannes, `erreurs de page :\n${pannes.join('\n')}`).toEqual([]);
    } finally {
      await contexte.close();
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// LA GARDE DES DIMENSIONS — la fixture terrain ne dérive pas des canoniques
// ═════════════════════════════════════════════════════════════════════════════
test('@filrouge les dimensions terrain de FIL-GC sont celles du 09 §4bis, et l’arbre les tient', () => {
  const { arbre, unites, niveaux, questions } = DIMENSIONS_FIL_GC;
  // 1 groupe + 5 filiales + 24 directions + 120 services = 150 sur 4 niveaux.
  expect(arbre.groupes + arbre.filiales + arbre.directions + arbre.services).toBe(unites);
  expect(unites).toBe(150);
  expect(niveaux).toBe(4);
  expect(questions).toBe(135);
  // …et l'arbre ENGENDRÉ les tient réellement : une constante juste au-dessus
  // d'un générateur faux serait le pire des deux mondes.
  expect(questionsFilGc()).toHaveLength(questions);
  const engendre = arbreFilGc();
  expect(engendre).toHaveLength(unites);
  expect(new Set(engendre.map((u) => u.niveau))).toEqual(new Set([1, 2, 3, 4]));
  // Aucune unité orpheline sous la racine : un arbre à trous se navigue mal, et
  // c'est justement la navigabilité à grande échelle que FIL-GC éprouve.
  const ids = new Set(engendre.map((u) => u.id));
  const orphelines = engendre.filter(
    (u) => u.niveau > 1 && (u.parentId === null || !ids.has(u.parentId)),
  );
  expect(orphelines.map((u) => u.nom)).toEqual([]);
});
