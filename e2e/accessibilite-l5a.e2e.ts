// =============================================================================
// E2E — ACCESSIBILITÉ ET BUDGETS DU SOCLE TERRAIN (lot L5a) — agent A28
//
// Ce fichier ferme la réserve **R-L5a-6** de la revue croisée A29
// (DECISIONS.md, 2026-09-02) : « `@axe-core/playwright` est installé et n'est
// utilisé nulle part ; la dérogation 11 §8-1 était justifiée par “la case P-C est
// incochable sans lui”, elle reste incochable ». Une dépendance obtenue par
// dérogation et jamais appelée est un garde-fou qui annonce plus qu'il ne fait —
// exactement la famille de défaut que ce dépôt traque.
//
// ── CE QUI EST MESURÉ, ET SUR QUOI ──────────────────────────────────────────
// Les TROIS écrans livrés par L5a, et eux seuls (`app/vues.ts`) :
//   · `deverrouillage` — atteint au premier chargement, coffre inexistant ;
//   · `accueil`        — atteint après création du coffre (VUE_INITIALE) ;
//   · `stockage`       — atteint par la REPRISE INSTANTANÉE (03 §17.4) : la vue
//     mémorisée dans `meta['nav:vue-courante']` est relue à l'amorçage. C'est un
//     chemin de PRODUCTION, pas une porte dérobée de test ; le seul artifice est
//     d'écrire la vue mémorisée, ce que l'application fait elle-même à chaque
//     navigation. Le chemin nominal (refus de `storage.persist()` au moment
//     d'embarquer une mission — `EcranAccueil.embarquer`) exige une mission
//     descendue, donc le pull de L6a : il sera couvert par l'E2E de L6b.
//
// ── POURQUOI DANS LE NAVIGATEUR, ET PAS EN JSDOM ────────────────────────────
// Un balayage axe en jsdom DÉSACTIVE silencieusement `color-contrast` (aucune
// mise en page, donc aucune couleur calculée). Il rendrait un vert qui répond à
// une autre question que celle posée par 03 §22.1 (« contraste WCAG AA
// minimum »). Le seul balayage qui mesure le contraste est celui qui tourne dans
// un moteur de rendu réel.
//
// ── LE BUDGET, ET CE QUE LA MESURE PROUVE EXACTEMENT ────────────────────────
// 11 §4 : « dérivation de clé < 1 s sur iPad ». La borne relevée ici est une
// BORNE SUPÉRIEURE de bout en bout — clic, Argon2id (m=46 MiB, t=1, p=1),
// génération puis enveloppement de la DEK, écriture Dexie, rendu React. Elle
// majore donc la dérivation seule : si la borne passe, le budget passe a
// fortiori. Ce qu'elle ne prouve PAS : le chiffre de l'iPad. Cette machine n'est
// pas la cible ; le relevé sur tablette réelle reste dû à A27 à la porte P-C
// (11 §7, limite déjà assumée pour le service worker iOS).
//
// Traçabilité : E23 (hyper intuitif), E33 (sécurité / RGPD), E36 (CI exécutable),
// E43 (exécutabilité autopilote : versions épinglées — la dérogation `@axe-core/playwright`
// du 11 §8-1 et les budgets d'acceptation du 11 §4).
// =============================================================================
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TERRAIN = 'http://127.0.0.1:4173/';

/**
 * Les familles de règles retenues. 03 §22.1 exige « contraste WCAG AA minimum »
 * et « navigation clavier intégrale » : on balaie donc A et AA, versions 2.0 et
 * 2.1. Aucun `disableRules` — retirer une règle pour obtenir du vert serait le
 * rétrécissement de périmètre que le bandeau de `coverage-critical-paths.json`
 * interdit sur son propre terrain, et la faute est la même ici.
 */
const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/** Un mot de passe de test — 12 caractères minimum (06, politique de mot de passe). */
const MOT_DE_PASSE = 'AuditTerrain2026!';

/**
 * Le titre de l'ÉCRAN, cherché dans `<main>` et nulle part ailleurs.
 *
 * CE QUE CE SCOPE A RÉVÉLÉ, et qui n'est pas un détail de test : la coquille
 * (`App.tsx`) affiche `VUES[vue].titre` dans un `<h1>` d'en-tête, et chaque écran
 * affiche SON propre `<h1>` dans `<main>`. Sur « Aujourd’hui » les deux textes
 * sont IDENTIQUES : un lecteur d'écran annonce deux titres de niveau 1 portant le
 * même libellé sur une page qui n'a qu'un seul sujet. Le constat est remonté à
 * A29/A01 (constat A28-1) plutôt que corrigé ici — un test d'accessibilité ne
 * modifie pas l'interface qu'il mesure, sinon il mesure la sienne.
 */
function titreDEcran(page: Page, texte: string): ReturnType<Page['getByRole']> {
  return page.getByRole('main').getByRole('heading', { name: texte, level: 1 });
}

/** Rend le rapport axe LISIBLE dans la sortie CI : une ligne par violation. */
function resumer(
  violations: readonly {
    readonly id: string;
    readonly help: string;
    readonly nodes: readonly unknown[];
  }[],
): string {
  return violations
    .map((v) => `${v.id} — ${v.help} (${String(v.nodes.length)} élément(s))`)
    .join('\n');
}

async function balayer(page: Page, ecran: string): Promise<void> {
  const resultat = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
  expect(
    resultat.violations,
    `axe-core — écran « ${ecran} » :\n${resumer(resultat.violations)}`,
  ).toEqual([]);
}

/**
 * Crée le coffre de l'appareil et rend la durée de bout en bout, en
 * millisecondes. Le compteur démarre AVANT le clic et s'arrête quand l'écran
 * suivant est réellement peint : rien n'est retiré de la mesure.
 */
async function creerCoffreEtMesurer(page: Page): Promise<number> {
  await page.getByLabel(/Mot de passe/).fill(MOT_DE_PASSE);
  const depart = Date.now();
  await page.getByRole('button', { name: 'Créer la protection de cet appareil' }).click();
  await expect(titreDEcran(page, 'Aujourd’hui')).toBeVisible({ timeout: 15_000 });
  return Date.now() - depart;
}

/** Rouvre un coffre EXISTANT et rend la durée de bout en bout, en millisecondes. */
async function deverrouillerEtMesurer(page: Page, titreAttendu: string): Promise<number> {
  await page.getByLabel(/Mot de passe/).fill(MOT_DE_PASSE);
  const depart = Date.now();
  await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
  await expect(titreDEcran(page, titreAttendu)).toBeVisible({ timeout: 15_000 });
  return Date.now() - depart;
}

/**
 * Écrit la vue mémorisée directement dans `meta`, sans passer par le code de
 * l'application (qui n'est pas exposé à la page). La table `meta` est en CLAIR
 * par construction — `LigneMeta = {cle, valeur}` — et c'est justement ce que la
 * liste fermée du §3.2 de la note de conception autorise : aucune donnée
 * personnelle n'y transite.
 */
async function memoriserVue(page: Page, vue: string): Promise<void> {
  await page.evaluate(async (codeVue: string) => {
    // Le NOM de la base n'est pas recopié ici : on le DEMANDE au navigateur.
    // Une constante recopiée dans un test finit toujours par survivre au
    // renommage qu'elle était censée suivre, et le test devient vert sur une
    // base qui n'existe plus. `NOM_BASE_LOCALE` vit dans `local/base.ts`, et
    // nulle part ailleurs.
    const bases = await indexedDB.databases();
    const nom = bases[0]?.name;
    if (nom === undefined) throw new Error('aucune base locale ouverte par l’application');

    await new Promise<void>((resoudre, rejeter) => {
      const ouverture = indexedDB.open(nom);
      ouverture.onerror = () => {
        rejeter(new Error('IndexedDB inaccessible'));
      };
      ouverture.onsuccess = () => {
        const bdd = ouverture.result;
        const transaction = bdd.transaction('meta', 'readwrite');
        transaction.objectStore('meta').put({ cle: 'nav:vue-courante', valeur: codeVue });
        transaction.oncomplete = () => {
          bdd.close();
          resoudre();
        };
        transaction.onerror = () => {
          rejeter(new Error('écriture meta refusée'));
        };
      };
    });
  }, vue);
}

test.describe('L5a — accessibilité des trois écrans du socle', () => {
  test('écran de déverrouillage : premier usage, aucune violation axe', async ({ page }) => {
    await page.goto(TERRAIN);
    await expect(titreDEcran(page, 'Préparer cet appareil')).toBeVisible();
    await balayer(page, 'deverrouillage (premier usage)');
  });

  test('écran de déverrouillage : coffre existant, aucune violation axe', async ({ page }) => {
    await page.goto(TERRAIN);
    await creerCoffreEtMesurer(page);
    // Le verrou manuel du 05 §9.7 : c'est l'auditeur qui repose sa tablette.
    await page.getByRole('button', { name: 'Verrouiller' }).click();
    await expect(titreDEcran(page, 'Déverrouiller la collecte')).toBeVisible();
    await balayer(page, 'deverrouillage (coffre existant)');
  });

  test('écran Aujourd’hui : état vide, aucune violation axe', async ({ page }) => {
    await page.goto(TERRAIN);
    await creerCoffreEtMesurer(page);
    // Aucune mission n'est descendue (le premier pull est descopé vers L6a) :
    // l'écran est donc dans son état VIDE, l'un des quatre états du 03 §33.2, et
    // celui que verra tout appareil neuf. C'est l'état à balayer, pas un cas
    // dégradé qu'on aurait fabriqué pour la circonstance.
    await expect(page.getByText('Aucune mission sur cet appareil')).toBeVisible();
    await balayer(page, 'accueil (état vide)');
  });

  test('écran Stockage de l’appareil : aucune violation axe', async ({ page }) => {
    await page.goto(TERRAIN);
    await creerCoffreEtMesurer(page);
    await memoriserVue(page, 'stockage');
    await page.reload();
    // Le titre attendu est celui de l'ÉCRAN (`EcranStockage`), et il diffère de
    // celui du registre `VUES` affiché par l'en-tête (« Stockage de l’appareil »
    // contre « Stockage de cet appareil »). Deux libellés pour un même écran :
    // second volet du constat A28-1, remonté à A29 et non corrigé ici.
    await deverrouillerEtMesurer(page, 'Stockage de cet appareil');
    await balayer(page, 'stockage');
  });
});

test.describe('L5a — budget de dérivation de clé (11 §4 : < 1 s)', () => {
  test('création du coffre puis déverrouillage restent sous la seconde', async ({ page }) => {
    await page.goto(TERRAIN);

    const creation = await creerCoffreEtMesurer(page);
    await page.getByRole('button', { name: 'Verrouiller' }).click();
    await expect(titreDEcran(page, 'Déverrouiller la collecte')).toBeVisible();
    const reouverture = await deverrouillerEtMesurer(page, 'Aujourd’hui');

    // Le chiffre est LU par A20 et recopié dans le rapport de fin d'incrément :
    // un budget « vert » sans son chiffre n'est pas une mesure, c'est une opinion.
    // Une ANNOTATION plutôt qu'un `console.log` — la règle `no-console` de ce
    // dépôt vaut aussi pour les tests, et l'annotation a l'avantage d'être portée
    // par le rapport HTML et par le rapporteur `github`, donc lisible en CI même
    // quand le test passe et que la sortie standard est repliée.
    test.info().annotations.push({
      type: 'mesure A28',
      description:
        `dérivation Argon2id — création : ${String(creation)} ms · ` +
        `réouverture : ${String(reouverture)} ms · budget 11 §4 : 1000 ms`,
    });

    expect(creation, `création du coffre : ${String(creation)} ms`).toBeLessThan(1000);
    expect(reouverture, `réouverture du coffre : ${String(reouverture)} ms`).toBeLessThan(1000);
  });
});
