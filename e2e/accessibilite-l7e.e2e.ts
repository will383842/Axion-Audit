// =============================================================================
// E2E — ACCESSIBILITÉ DES QUATRE ÉCRANS DE CONSOLE JAMAIS BALAYÉS (L7e) — A36
//
// ═══════════════════════════════════════════════════════════════════════════════
// LE COMPTE ÉTAIT 2/6
// ═══════════════════════════════════════════════════════════════════════════════
// `accessibilite-l7b.e2e.ts` balaie DEUX écrans : couverture et agrégation. La
// console en a six (`apps/hq/src/app/routeur.ts`). Quatre n'avaient jamais reçu
// un seul balayage dans un navigateur RÉEL :
//
//   · l'accueil (tour de contrôle)      · le portefeuille
//   · l'avancement de mission           · l'export
//
// La DoD transverse (CLAUDE.md §5) coche « axe-core vert » par LOT ; elle a donc
// été cochée en L7a et en L7c sur une mesure qui ne portait pas sur ces écrans.
// C'est la forme la plus discrète du faux vert que ce dépôt traque : une mesure
// vraie sur ce qu'elle observe, qui répond à une autre question que celle posée.
//
// ── POURQUOI DANS LE NAVIGATEUR, ET PAS SOUS jsdom ─────────────────────────
// Même raisonnement, mêmes mots que `accessibilite-l7b.e2e.ts` : sans mise en
// page, aucune couleur n'est calculée, et axe DÉSACTIVE silencieusement
// `color-contrast`. Or c'est exactement ce que le 03 §22.1 exige, et c'est le
// défaut que le balayage L7b a réellement trouvé (D1 : l'espace ACTIF de la
// barre latérale à 4,12:1 — présent sur TOUTES les pages, donc sur ces
// quatre-là aussi, sans que rien ne l'ait jamais mesuré chez elles).
//
// ── AUCUNE RÈGLE DÉSACTIVÉE, AUCUN PÉRIMÈTRE RÉTRÉCI ──────────────────────
// Pas un `disableRules`, pas d'`.include('main')`. Retirer une règle pour
// obtenir du vert serait la « simplification temporaire » que 09 §5.7 interdit,
// et elle serait pire ici qu'ailleurs : c'est la règle retirée qui aurait été la
// mesure. La coquille est à l'écran, l'auditeur la voit, elle se mesure.
//
// ── LES CORPS SERVIS SONT DES LITTÉRAUX, ET CE N'EST PAS COMPLAISANT ──────
// Le client de la console repasse TOUTE réponse 2xx par le schéma Zod de la
// route AVANT qu'un écran la voie. Un corps qui s'écarterait du contrat ne
// rendrait pas un écran vaguement faux : il rendrait l'ÉTAT D'ERREUR, et les
// assertions nominales tomberaient bruyamment. `refuserEtatErreur` le dit avec
// des mots, parce que le symptôme (« élément introuvable ») est à vingt minutes
// de sa cause.
//
// Mission FICTIVE (invariant 2), libellés neutres.
// Traçabilité : E22 (console de pilotage) · E23 (hyper intuitif) · E32
// (interface française) · E36 (CI exécutable) · E44 (design system).
// =============================================================================
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const CONSOLE = 'http://127.0.0.1:4174/hq';

/** Les familles de règles — A et AA, 2.0 et 2.1, comme les balayages L5a et L7b. */
const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

const MISSION_ID = '018f0000-0000-7000-8000-00000000b001';
const MISSION_GC_ID = '018f0000-0000-7000-8000-00000000b002';
const ENTREPRISE_ID = '018f0000-0000-7000-8000-00000000a001';

type Corps = Record<string, unknown>;

function mission(id: string, titre: string, entrepriseId: string): Corps {
  return {
    id,
    companyId: entrepriseId,
    parentMissionId: null,
    title: titre,
    geoScope: 'france',
    countryCode: null,
    sizeTierId: null,
    activeSectors: ['artisanat'],
    activeBlocks: ['b1', 'b2'],
    auditLevel: 'diagnostic_cadrage',
    commercialOffer: 'audit_flash',
    timezone: 'Europe/Paris',
    ndaRef: 'NDA-FICTIF-001',
    ndaSignedAt: '2026-09-01',
    status: 'en_cours',
    llmProvider: 'anthropic',
    startPlanned: '2026-09-07',
    endPlanned: '2026-09-11',
    deliveredAt: null,
    createdBy: '018f0000-0000-7000-8000-000000000a01',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
  };
}

const MISSION_TPE = mission(MISSION_ID, 'Mission fictive de recette — micro', ENTREPRISE_ID);
const MISSION_GC = mission(MISSION_GC_ID, 'Mission fictive de recette — groupe', ENTREPRISE_ID);

const ENTREPRISE: Corps = {
  id: ENTREPRISE_ID,
  externalRef: null,
  name: 'Entreprise fictive de recette',
  siren: null,
  nafCode: null,
  sectorId: null,
  headcount: 8,
  sitesCount: 1,
  countries: ['FR'],
  notes: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

/** Ce que le faux serveur rend. `null` = PANNE 503, le chemin de l'état d'erreur. */
interface Reponses {
  readonly portefeuille: Corps | null;
  readonly mission: Corps | null;
  readonly entreprise: Corps | null;
}

/**
 * Sert l'API à la place du réseau — et fait ÉCHOUER BRUYAMMENT toute route
 * inattendue. Un écran qui appelle ce qu'on n'attendait pas doit se voir : le
 * servir en silence reviendrait à balayer un écran nourri par accident.
 */
async function servirApi(page: Page, reponses: Reponses): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const chemin = new URL(route.request().url()).pathname;
    const json = async (corps: Corps): Promise<void> => route.fulfill({ status: 200, json: corps });
    const panne = async (): Promise<void> =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Le service est momentanément indisponible.',
          },
        },
      });

    if (chemin.endsWith('/v1/missions')) {
      return reponses.portefeuille === null ? panne() : json(reponses.portefeuille);
    }
    if (/\/v1\/missions\/[^/]+$/.test(chemin)) {
      return reponses.mission === null ? panne() : json(reponses.mission);
    }
    if (/\/v1\/companies\/[^/]+$/.test(chemin)) {
      return reponses.entreprise === null ? panne() : json(reponses.entreprise);
    }
    return route.fulfill({
      status: 500,
      json: {
        error: { code: 'INTERNAL_ERROR', message: `Route non prévue par le test : ${chemin}` },
      },
    });
  });
}

const PLEIN: Reponses = {
  portefeuille: { items: [MISSION_TPE, MISSION_GC], nextCursor: null },
  mission: MISSION_TPE,
  entreprise: ENTREPRISE,
};

const VIDE: Reponses = {
  portefeuille: { items: [], nextCursor: null },
  mission: MISSION_TPE,
  entreprise: ENTREPRISE,
};

const EN_PANNE: Reponses = { portefeuille: null, mission: null, entreprise: null };

/** Le balayage, sans règle retirée ni périmètre rétréci. */
async function balayer(page: Page, ecran: string): Promise<void> {
  const resultat = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
  expect(
    resultat.violations,
    `axe-core — écran « ${ecran} » :\n${resumer(resultat.violations)}`,
  ).toEqual([]);
}

interface ViolationLisible {
  readonly id: string;
  readonly impact?: string | null | undefined;
  readonly help: string;
  readonly nodes: readonly { readonly html: string }[];
}

function resumer(violations: readonly ViolationLisible[]): string {
  if (violations.length === 0) return '(aucune)';
  return violations
    .map(
      (violation) =>
        `  · ${violation.id} [${violation.impact ?? 'sans impact déclaré'}] — ${violation.help}\n` +
        violation.nodes
          .slice(0, 3)
          .map((noeud) => `      ${noeud.html.slice(0, 160)}`)
          .join('\n'),
    )
    .join('\n');
}

/** Voir `accessibilite-l7b.e2e.ts` : un état d'erreur inattendu accuse le contrat. */
async function refuserEtatErreur(page: Page, ecran: string): Promise<void> {
  await expect(
    page.getByRole('button', { name: 'Réessayer' }),
    [
      `L’écran « ${ecran} » est en ÉTAT D’ERREUR alors qu’un corps lui a été SERVI.`,
      'Ce n’est presque jamais un défaut de l’écran : c’est le corps servi qui a été',
      'REJETÉ par le contrat partagé — un `z.strictObject`, où un seul champ requis',
      'manquant suffit à faire basculer l’écran entier.',
      'Compare les littéraux de CE fichier à `packages/shared/src/missions.ts`.',
    ].join('\n'),
  ).toBeHidden();
}

const URL_ACCUEIL = `${CONSOLE}/`;
const URL_PORTEFEUILLE = `${CONSOLE}/missions`;
const URL_MISSION = `${CONSOLE}/missions/${MISSION_ID}`;
const URL_EXPORT = `${CONSOLE}/missions/${MISSION_ID}/export`;

// =============================================================================
// 1. ACCUEIL — la tour de contrôle
// =============================================================================
test.describe('L7e — accessibilité de l’accueil (tour de contrôle)', () => {
  test('état NOMINAL : les cartes de mission et les chiffres clés — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, PLEIN);
    await page.goto(URL_ACCUEIL);
    await expect(page.getByRole('heading', { name: /tour de contrôle/i, level: 1 })).toBeVisible();
    await refuserEtatErreur(page, 'accueil (nominal)');
    // ANTI-VACUITÉ : on ne balaie pas une page blanche.
    await expect(page.getByText(MISSION_TPE.title as string)).toBeVisible();
    await balayer(page, 'accueil (nominal)');
  });

  test('état VIDE : le message qui dit quoi faire — aucune violation axe', async ({ page }) => {
    await servirApi(page, VIDE);
    await page.goto(URL_ACCUEIL);
    await expect(page.getByRole('heading', { name: /tour de contrôle/i, level: 1 })).toBeVisible();
    await refuserEtatErreur(page, 'accueil (vide)');
    await balayer(page, 'accueil (vide)');
  });

  test('état ERREUR : le message et « Réessayer » — aucune violation axe', async ({ page }) => {
    await servirApi(page, EN_PANNE);
    await page.goto(URL_ACCUEIL);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await balayer(page, 'accueil (erreur)');
  });
});

// =============================================================================
// 2. PORTEFEUILLE
// =============================================================================
test.describe('L7e — accessibilité du portefeuille', () => {
  test('état NOMINAL : la liste des missions — aucune violation axe', async ({ page }) => {
    await servirApi(page, PLEIN);
    await page.goto(URL_PORTEFEUILLE);
    await expect(page.getByRole('heading', { name: /portefeuille/i, level: 1 })).toBeVisible();
    await refuserEtatErreur(page, 'portefeuille (nominal)');
    await expect(page.getByText(MISSION_GC.title as string)).toBeVisible();
    await balayer(page, 'portefeuille (nominal)');
  });

  test('état VIDE : une liste sans lignes dit quoi faire — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, VIDE);
    await page.goto(URL_PORTEFEUILLE);
    await expect(page.getByRole('heading', { name: /portefeuille/i, level: 1 })).toBeVisible();
    await refuserEtatErreur(page, 'portefeuille (vide)');
    await balayer(page, 'portefeuille (vide)');
  });

  test('état ERREUR : le message et « Réessayer » — aucune violation axe', async ({ page }) => {
    await servirApi(page, EN_PANNE);
    await page.goto(URL_PORTEFEUILLE);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await balayer(page, 'portefeuille (erreur)');
  });
});

// =============================================================================
// 3. AVANCEMENT DE MISSION
// =============================================================================
test.describe('L7e — accessibilité de l’avancement de mission', () => {
  test('état NOMINAL : la fiche et son client — aucune violation axe', async ({ page }) => {
    await servirApi(page, PLEIN);
    await page.goto(URL_MISSION);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await refuserEtatErreur(page, 'mission (nominal)');
    await expect(page.getByText(ENTREPRISE.name as string).first()).toBeVisible();
    await balayer(page, 'mission (nominal)');
  });

  test('état ERREUR : le message et « Réessayer » — aucune violation axe', async ({ page }) => {
    await servirApi(page, EN_PANNE);
    await page.goto(URL_MISSION);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await balayer(page, 'mission (erreur)');
  });
});

// =============================================================================
// 4. EXPORT — l'écran qui produit un FICHIER, et qui n'avait rien
// =============================================================================
test.describe('L7e — accessibilité de l’écran d’export (§36.3)', () => {
  test('état NOMINAL : la liste des dix fichiers et la case des répondants — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, PLEIN);
    await page.goto(URL_EXPORT);
    await expect(page.getByRole('heading', { name: /export de mission/i, level: 1 })).toBeVisible();
    await refuserEtatErreur(page, 'export (nominal)');

    // ANTI-VACUITÉ, ET SUR CE QUI COMPTE : la liste de description (`<dl>`) et la
    // case à cocher sont les deux structures que axe a le plus à dire ici — une
    // `<dl>` mal formée et une case sans étiquette liée sont deux violations
    // classiques, et ce sont exactement les deux formes que cet écran emploie.
    await expect(page.getByText('reponses.csv').first()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /répondants/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /télécharger l’archive/i })).toBeVisible();
    await balayer(page, 'export (nominal)');
  });

  test('état NOMINAL, case COCHÉE : l’état coché est perceptible — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, PLEIN);
    await page.goto(URL_EXPORT);
    await expect(page.getByRole('heading', { name: /export de mission/i, level: 1 })).toBeVisible();
    const case_ = page.getByRole('checkbox', { name: /répondants/i });
    await case_.check();
    await expect(case_).toBeChecked();
    // Le contraste de l'état COCHÉ n'est pas celui de l'état décoché : balayer
    // seulement le second laisserait la moitié de la mesure hors du champ.
    await balayer(page, 'export (case cochée)');
  });

  test('état ERREUR : le message et « Réessayer » — aucune violation axe', async ({ page }) => {
    await servirApi(page, EN_PANNE);
    await page.goto(URL_EXPORT);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await balayer(page, 'export (erreur)');
  });
});

// =============================================================================
// 5. PREUVE QUE CE BALAYAGE N'EST PAS VIDE
// =============================================================================
test.describe('L7e — preuve par bascule : le balayage MORD', () => {
  /**
   * ANTI-VACUITÉ, DANS LE NAVIGATEUR — même dispositif que `accessibilite-l7b`.
   *
   * Onze balayages verts ne prouvent rien tant qu'on n'a pas montré que le
   * même balayage, sur la même page, VOIT une violation qu'on y introduit. On
   * dégrade donc la page DEPUIS LE NAVIGATEUR (jamais dans une source : je
   * n'écris pas le code que je vérifie, 09 §5.6) et on exige que axe la voie.
   */
  test('une image sans alternative textuelle, injectée à l’exécution, est VUE par axe', async ({
    page,
  }) => {
    await servirApi(page, PLEIN);
    await page.goto(URL_EXPORT);
    await expect(page.getByRole('heading', { name: /export de mission/i, level: 1 })).toBeVisible();

    const avant = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
    expect(
      avant.violations,
      'la page de départ n’est pas propre : la bascule ne prouverait rien',
    ).toEqual([]);

    await page.evaluate(() => {
      const image = document.createElement('img');
      // Un GIF transparent d'un pixel, SANS attribut `alt` : la violation
      // `image-alt` la plus élémentaire de WCAG 1.1.1.
      image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      document.querySelector('main')?.append(image);
    });

    const apres = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
    expect(
      apres.violations.map((violation) => violation.id),
      'axe n’a pas vu une image sans alternative : le balayage de ce fichier ne mesure rien',
    ).toContain('image-alt');
  });
});
