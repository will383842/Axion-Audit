// =============================================================================
// E2E — ACCESSIBILITÉ DES DEUX ÉCRANS DE PILOTAGE (lot L7b) — agent A36
//
// Ce fichier coche la case « axe-core vert » de la DoD transverse (CLAUDE.md §5)
// pour l'incrément L7b. Elle était INCOCHABLE jusqu'ici : `@axe-core/playwright`
// n'existait pas dans ce worktree, et le rapport A36 du 2026-09-05 l'écrit noir
// sur blanc — « axe-core : ABSENT de ce worktree (arrive avec #30) — non mesuré,
// non inventé ». La PR #30 étant fusionnée, la mesure est due.
//
// ── POURQUOI DANS LE NAVIGATEUR, ET PAS DANS LES TESTS jsdom DE L'ÉCRAN ─────
// `EcranCouverture.test.tsx` et `EcranAgregation.test.tsx` rendent déjà ces deux
// écrans sous jsdom. Y balayer axe rendrait un vert qui répond à une AUTRE
// question : sans mise en page, aucune couleur n'est calculée, et axe DÉSACTIVE
// silencieusement `color-contrast`. Or c'est précisément ce que le 03 §22.1 exige
// (« contraste WCAG AA minimum ») et ce que ces deux écrans mettent le plus en
// jeu : une grille dense (§33.4) où une source manquante est signalée par un FOND
// AMBRÉ, une ligne d'alerte §16.6 par une couleur d'alerte, et le « planifié » par
// un gris atténué. Le seul balayage qui mesure cela tourne dans un moteur de rendu
// réel. Même raisonnement, mêmes mots que `accessibilite-l5a.e2e.ts` : ce fichier
// en est le pendant côté console.
//
// ── POURQUOI L'API EST INTERCEPTÉE, ET CE QUE ÇA NE COÛTE PAS EN VÉRITÉ ─────
// `playwright.config.ts` ne démarre que les deux fronts : faire vivre ces écrans
// « pour de vrai » demanderait Postgres, Redis et MinIO pour un test d'INTERFACE.
// `page.route()` est l'équivalent navigateur du serveur factice de
// `apps/hq/src/tests-aide/serveur-factice.ts` — même intention, autre couche.
//
// Et le corps servi n'est PAS un mock complaisant : le client de la console
// (`api/client.ts`) repasse TOUTE réponse 2xx par le schéma Zod de la route AVANT
// qu'un écran la voie. Un corps qui s'écarterait du contrat ne rendrait donc pas
// un tableau vaguement faux — il rendrait l'ÉTAT D'ERREUR, et les assertions
// nominales ci-dessous tomberaient bruyamment. C'est ce qui rend un littéral
// acceptable ici là où il serait douteux ailleurs : c'est le contrat qui le garde.
//
// Les fixtures de `apps/hq/src/tests-aide/` ne sont volontairement PAS importées :
// elles dépendent de `@axion/shared`, qui n'est pas résolvable depuis la racine
// (seul `@axion/ui` l'est). L'y ajouter serait une modification de dépendances
// pour la commodité d'un test — CLAUDE.md §3-1. Le littéral local coûte moins.
//
// ── AUCUNE RÈGLE DÉSACTIVÉE, ET AUCUN PÉRIMÈTRE RÉTRÉCI ────────────────────
// Pas un `disableRules`, et pas d'`.include('main')`. Retirer une règle pour
// obtenir du vert serait la « simplification temporaire » que le 09 §5.7
// interdit, et elle serait pire ici qu'ailleurs : c'est la règle retirée qui
// aurait été la mesure. Restreindre le balayage au `<main>` aurait le même
// effet en plus discret — la coquille est à l'écran, l'auditeur la voit, elle
// se mesure.
//
// ── CES SIX TESTS SONT ROUGES AUJOURD'HUI, ET C'EST UN CONSTAT ─────────────
// Trois défauts RÉELS, mesurés, rendus à leurs producteurs et NON corrigés ici
// (09 §5.6 : A36 ne touche pas au code qu'il vérifie). Ils rougiront jusqu'à
// leur correction, exactement comme le bloquant B1 de la revue A37.
//
//   D1 — coquille de L7a, `app/coquille.css`. L'espace ACTIF de la barre
//        latérale (`a[aria-current="page"]`) : le TERRACOTTA D'ACTION sur le fond
//        teinté de l'espace actif donne **4,12:1**, sous le 4,5:1 exigé.
//        WCAG 1.4.3 (AA), 03 §22.1. Il est sur TOUTES les pages de la console :
//        c'est donc aussi une non-régression sur les trois écrans de L7a.
//   D2 — L7b, le jeton de TEXTE TERTIAIRE porté par le « planifié » et par la
//        note « hors grille » : **4,49:1** sur le fond des marges. Il échoue de
//        0,01, et SEULEMENT dans le `<tfoot>`, dont le fond est plus soutenu que
//        celui des lignes — le même jeton passe dans le corps du tableau et tombe
//        dans le pied. WCAG 1.4.3 (AA).
//
//        (Aucune de ces couleurs n'est CITÉE ici : le garde de l'invariant 4 ne
//        distingue pas l'exemple de l'infraction, et c'est voulu — le constat
//        d'A36 du 2026-09-02 sur `lot/l7a` disait déjà exactement cela. Les
//        valeurs exactes sont dans le rapport axe que la CI imprime.)
//   D3 — L7b, `.axn-tableau-cadre` : la zone de défilement du tableau dense n'est
//        atteignable NI au clavier NI par un contenu focusable. Sur une grille
//        que le §33.4 veut large, un utilisateur au clavier ne peut pas faire
//        défiler ce que la souris fait défiler. WCAG 2.1.1 — niveau **A**, pas
//        AA — et 03 §22.1 « navigation clavier intégrale » mot pour mot. C'est
//        le plus grave des trois.
//
// Traçabilité : E22 (console de pilotage 7 espaces) · E25 (zéro oubli : plan,
// couverture, contrôles) · E23 (hyper intuitif) · E36 (CI exécutable).
// =============================================================================
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const CONSOLE = 'http://127.0.0.1:4174/hq';

/** Les familles de règles — A et AA, 2.0 et 2.1, comme le balayage L5a. */
const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/** Mission FICTIVE (invariant 2) : FIL-TPE, l'un des deux jeux canoniques. */
const MISSION_ID = '018f0000-0000-7000-8000-00000000b001';
const UNITE_ID = '018f0000-0000-7000-8000-0000000000c1';
const SESSION_ID = '018f0000-0000-7000-8000-0000000000f1';

const SOURCES = [
  'entretien',
  'observation',
  'demonstration',
  'analyse_documentaire',
  'releve_donnees',
] as const;

const PROVENANCES = ['entretien', 'observation', 'demonstration', 'document', 'releve'] as const;

interface Cellule {
  readonly kind: string;
  readonly prevu: { readonly min: number; readonly max: number };
  readonly planifie: number;
  readonly realise: number;
  readonly couvert: boolean;
}

/**
 * Les cinq cellules d'une unité. La première porte le réalisé ; la DEUXIÈME est
 * attendue et NON couverte — c'est la cellule au fond ambré, celle dont le
 * contraste est le plus exposé. La laisser hors du balayage reviendrait à ne pas
 * mesurer le cas qui motive la mesure.
 */
function cellules(realiseEntretien: number, minEntretien: number): readonly Cellule[] {
  return SOURCES.map((kind, rang) => {
    if (rang === 0) {
      return {
        kind,
        prevu: { min: minEntretien, max: minEntretien + 1 },
        planifie: realiseEntretien,
        realise: realiseEntretien,
        couvert: realiseEntretien >= minEntretien,
      };
    }
    const attendue = rang === 1;
    return {
      kind,
      prevu: { min: attendue ? 1 : 0, max: attendue ? 1 : 0 },
      planifie: 0,
      realise: 0,
      couvert: !attendue,
    };
  });
}

const MISSION = {
  id: MISSION_ID,
  companyId: '018f0000-0000-7000-8000-00000000a001',
  parentMissionId: null,
  title: 'FIL-TPE — diagnostic de cadrage',
  geoScope: 'france',
  countryCode: null,
  sizeTierId: null,
  activeSectors: ['artisanat'],
  activeBlocks: ['b1', 'b2'],
  auditLevel: 'diagnostic_cadrage',
  commercialOffer: 'audit_flash',
  timezone: 'Europe/Paris',
  ndaRef: null,
  ndaSignedAt: null,
  status: 'en_cours',
  llmProvider: 'anthropic',
  startPlanned: '2026-09-07',
  endPlanned: '2026-09-11',
  deliveredAt: null,
  createdBy: '018f0000-0000-7000-8000-000000000a01',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

/**
 * Couverture à DEUX unités : la première couverte, la seconde SOUS ALERTE §16.6.
 * `atelierRealise` non nul, donc la colonne hors grille est rendue — elle aussi
 * doit passer sous axe.
 */
const COUVERTURE = {
  missionId: MISSION_ID,
  timezone: 'Europe/Paris',
  calculeLe: '2026-09-05T08:00:00.000Z',
  blocsActifs: ['b1', 'b2'],
  unites: [
    {
      orgUnitId: UNITE_ID,
      nom: 'Établissement unique',
      kind: 'etablissement',
      parentId: null,
      profondeur: 0,
      inScope: true,
      effectif: 8,
      parSource: cellules(1, 1),
      atelierRealise: 2,
      sourcesCouvertes: 1,
      sourcesAttendues: 2,
      blocsNonCouverts: ['b2'],
      aucuneSession: false,
    },
    {
      orgUnitId: '018f0000-0000-7000-8000-0000000000c2',
      nom: 'Atelier de production',
      kind: 'service',
      parentId: UNITE_ID,
      profondeur: 1,
      inScope: true,
      effectif: 3,
      parSource: cellules(0, 1),
      atelierRealise: 0,
      sourcesCouvertes: 0,
      sourcesAttendues: 2,
      blocsNonCouverts: ['b1', 'b2'],
      // L'ALERTE §16.6 : une unité au périmètre qui n'a reçu aucune session.
      // C'est la ligne colorée de l'écran, donc celle qui met le contraste en jeu.
      aucuneSession: true,
    },
  ],
  nextCursor: null,
  marges: {
    parSource: cellules(1, 1),
    atelierRealise: 2,
    unitesInScope: 2,
    unitesHorsPerimetre: 0,
    unitesSansAucuneSession: 1,
  },
  avertissements: [
    { code: 'effectif_absent', message: 'Une unité du périmètre n’a pas d’effectif renseigné.' },
  ],
};

const COUVERTURE_VIDE = {
  ...COUVERTURE,
  unites: [],
  marges: { ...COUVERTURE.marges, unitesInScope: 0, unitesSansAucuneSession: 0 },
  avertissements: [],
};

/** Les cinq provenances, toujours les cinq, même à zéro. */
function parProvenance(nombre: number): readonly { provenance: string; nombre: number }[] {
  return PROVENANCES.map((provenance, rang) => ({ provenance, nombre: rang === 0 ? nombre : 0 }));
}

/**
 * Une question portant les QUATRE situations du §27.4 — renseignée, non
 * communiquée, sans objet, à revoir — et une seconde question « jamais posée »,
 * qui est le quatrième RENDU distinct de l'écran. Les cinq passent sous axe.
 */
const AGREGATION = {
  missionId: MISSION_ID,
  timezone: 'Europe/Paris',
  calculeLe: '2026-09-05T08:00:00.000Z',
  blocs: [
    { code: 'b1', libelle: 'Pilotage et gouvernance' },
    { code: 'b2', libelle: 'Production' },
  ],
  filtre: { block: null, orgUnit: null },
  questions: [
    {
      missionQuestionId: '018f0000-0000-7000-8000-0000000000d1',
      blocCode: 'b1',
      blocLibelle: 'Pilotage et gouvernance',
      texte: 'Quels indicateurs suivez-vous chaque mois ?',
      criticite: 'haute',
      typeReponse: 'text',
      sourceAttendue: 'entretien',
      comptes: {
        posee: 4,
        renseignees: 1,
        nonCommuniquees: 1,
        sansObjet: 1,
        aRevoir: 1,
        horsParcours: 1,
        unitesTouchees: 1,
      },
      parProvenance: parProvenance(4),
      reponses: [
        {
          answerId: '018f0000-0000-7000-8000-0000000000e1',
          interviewId: SESSION_ID,
          sessionKind: 'entretien',
          orgUnitId: UNITE_ID,
          orgUnitNom: 'Établissement unique',
          orgUnitInScope: true,
          fonctionRepondant: 'Responsable de production',
          serviceRepondant: 'Production',
          provenance: 'entretien',
          valeurLisible: 'Un tableau de bord mensuel, tenu à la main.',
          nonCommunique: false,
          motifNonCommunique: null,
          sansObjet: false,
          motifSansObjet: null,
          aRevoir: false,
          motifARevoir: null,
          horsParcours: false,
          note: null,
          revision: 1,
          misAJourLe: '2026-09-04T14:30:00.000Z',
        },
        {
          answerId: '018f0000-0000-7000-8000-0000000000e2',
          interviewId: SESSION_ID,
          sessionKind: 'entretien',
          orgUnitId: UNITE_ID,
          orgUnitNom: 'Établissement unique',
          orgUnitInScope: true,
          fonctionRepondant: 'Dirigeant',
          serviceRepondant: null,
          provenance: 'entretien',
          valeurLisible: null,
          nonCommunique: true,
          motifNonCommunique: 'confidentiel',
          sansObjet: false,
          motifSansObjet: null,
          aRevoir: false,
          motifARevoir: null,
          horsParcours: false,
          note: null,
          revision: 1,
          misAJourLe: '2026-09-04T15:00:00.000Z',
        },
        {
          answerId: '018f0000-0000-7000-8000-0000000000e3',
          interviewId: SESSION_ID,
          sessionKind: 'observation',
          orgUnitId: UNITE_ID,
          orgUnitNom: 'Établissement unique',
          orgUnitInScope: true,
          fonctionRepondant: 'Opérateur',
          serviceRepondant: 'Production',
          provenance: 'observation',
          valeurLisible: null,
          nonCommunique: false,
          motifNonCommunique: null,
          sansObjet: true,
          motifSansObjet: 'Aucun atelier sur ce site.',
          aRevoir: false,
          motifARevoir: null,
          horsParcours: false,
          note: null,
          revision: 1,
          misAJourLe: '2026-09-04T15:30:00.000Z',
        },
        {
          answerId: '018f0000-0000-7000-8000-0000000000e4',
          interviewId: SESSION_ID,
          sessionKind: 'entretien',
          orgUnitId: UNITE_ID,
          orgUnitNom: 'Établissement unique',
          orgUnitInScope: true,
          fonctionRepondant: 'Comptable',
          serviceRepondant: 'Administration',
          provenance: 'document',
          valeurLisible: 'Chiffre à confirmer.',
          nonCommunique: false,
          motifNonCommunique: null,
          sansObjet: false,
          motifSansObjet: null,
          aRevoir: true,
          motifARevoir: 'À recouper avec le registre.',
          horsParcours: true,
          note: 'Relance prévue.',
          revision: 2,
          misAJourLe: '2026-09-04T16:00:00.000Z',
        },
      ],
    },
    {
      missionQuestionId: '018f0000-0000-7000-8000-0000000000d2',
      blocCode: 'b2',
      blocLibelle: 'Production',
      texte: 'Quel est le taux de rebut constaté ?',
      criticite: null,
      typeReponse: null,
      sourceAttendue: 'releve',
      comptes: {
        posee: 0,
        renseignees: 0,
        nonCommuniquees: 0,
        sansObjet: 0,
        aRevoir: 0,
        horsParcours: 0,
        unitesTouchees: 0,
      },
      parProvenance: parProvenance(0),
      reponses: [],
    },
  ],
  nextCursor: null,
  totaux: {
    questions: 2,
    questionsSansReponse: 1,
    reponses: 4,
    nonCommuniquees: 1,
    sansObjet: 1,
    aRevoir: 1,
    parProvenance: parProvenance(3),
  },
};

const AGREGATION_VIDE = {
  ...AGREGATION,
  blocs: [],
  questions: [],
  totaux: { ...AGREGATION.totaux, questions: 0, questionsSansReponse: 0, reponses: 0 },
};

/**
 * Rend le rapport axe LISIBLE en CI, et surtout ACTIONNABLE : une ligne par
 * violation, puis une ligne par élément fautif avec son sélecteur et le motif
 * exact. Le balayage L5a se contentait du compte — suffisant quand tout est
 * vert, inutilisable le jour où ça rougit, parce qu'il faut alors rejouer le
 * test à la main pour savoir QUEL élément et POURQUOI. Un rapport qui oblige à
 * refaire la mesure n'est pas un rapport.
 */
function resumer(
  violations: readonly {
    readonly id: string;
    readonly help: string;
    readonly nodes: readonly {
      readonly target: readonly unknown[];
      readonly failureSummary?: string | undefined;
    }[];
  }[],
): string {
  return violations
    .map((v) => {
      const details = v.nodes
        .map((n) => {
          const cible = n.target.map((t) => String(t)).join(' ');
          const motif = (n.failureSummary ?? '').replace(/\s+/g, ' ').trim();
          return `      · ${cible}${motif === '' ? '' : ` — ${motif}`}`;
        })
        .join('\n');
      return `${v.id} — ${v.help} (${String(v.nodes.length)} élément(s))\n${details}`;
    })
    .join('\n');
}

async function balayer(page: Page, ecran: string): Promise<void> {
  const resultat = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
  expect(
    resultat.violations,
    `axe-core — écran « ${ecran} » :\n${resumer(resultat.violations)}`,
  ).toEqual([]);
}

type Corps = Record<string, unknown>;

/**
 * Sert l'API à la place du réseau. Un `null` force une PANNE (503) : c'est ainsi
 * qu'on atteint l'ÉTAT D'ERREUR par le chemin de production, sans fabriquer un
 * écran de test qui n'existe pas.
 */
async function servirApi(
  page: Page,
  reponses: { readonly couverture: Corps | null; readonly agregation: Corps | null },
): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const chemin = new URL(route.request().url()).pathname;
    const json = async (corps: Corps): Promise<void> => route.fulfill({ status: 200, json: corps });
    const panne = async (): Promise<void> =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Le service de pilotage est momentanément indisponible.',
          },
        },
      });

    if (chemin.endsWith('/coverage')) {
      return reponses.couverture === null ? panne() : json(reponses.couverture);
    }
    if (chemin.endsWith('/aggregation')) {
      return reponses.agregation === null ? panne() : json(reponses.agregation);
    }
    if (chemin.endsWith(`/missions/${MISSION_ID}`)) return json(MISSION);
    // Toute autre route est une SURPRISE. La faire échouer bruyamment vaut mieux
    // que la servir en silence : un écran qui appelle ce qu'on n'attendait pas
    // doit se voir.
    return route.fulfill({
      status: 500,
      json: {
        error: { code: 'INTERNAL_ERROR', message: `Route non prévue par le test : ${chemin}` },
      },
    });
  });
}

const URL_COUVERTURE = `${CONSOLE}/missions/${MISSION_ID}/couverture`;
const URL_AGREGATION = `${CONSOLE}/missions/${MISSION_ID}/agregation`;

test.describe('L7b — accessibilité de l’écran Couverture (03 §27.1)', () => {
  test('état NOMINAL : grille dense, alerte §16.6 et colonne atelier — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, { couverture: COUVERTURE, agregation: null });
    await page.goto(URL_COUVERTURE);
    // ANTI-VACUITÉ : on ne balaie pas une page blanche. Le tableau doit être là,
    // avec ses cinq colonnes, sa ligne sous alerte et sa cellule manquante —
    // sinon la mesure ne porte sur rien, et c'est le faux vert qu'on traque.
    await expect(
      page.getByRole('heading', { name: 'Couverture de la mission', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Analyse documentaire' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Atelier de production' })).toBeVisible();
    await expect(page.locator('tr[data-alerte="true"]')).toHaveCount(1);
    await expect(page.locator('td[data-manquante="true"]').first()).toBeVisible();
    await balayer(page, 'couverture (nominal)');
  });

  test('état VIDE : l’écran dit quoi faire — aucune violation axe', async ({ page }) => {
    await servirApi(page, { couverture: COUVERTURE_VIDE, agregation: null });
    await page.goto(URL_COUVERTURE);
    await expect(page.getByText('Aucune unité dans l’arbre de cette mission')).toBeVisible();
    await balayer(page, 'couverture (vide)');
  });

  test('état ERREUR : le message et le bouton Réessayer — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, { couverture: null, agregation: null });
    await page.goto(URL_COUVERTURE);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await balayer(page, 'couverture (erreur)');
  });
});

test.describe('L7b — accessibilité de l’écran Agrégation (M5.1, §27.4)', () => {
  test('état NOMINAL : les quatre situations du §27.4 et la question jamais posée — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, { couverture: null, agregation: AGREGATION });
    await page.goto(URL_AGREGATION);
    await expect(
      page.getByRole('heading', { name: 'Agrégation par question', level: 1 }),
    ).toBeVisible();
    // Les quatre rendus distincts doivent être à l'écran AU MOMENT du balayage.
    await expect(page.getByRole('columnheader', { name: 'Provenance' })).toBeVisible();
    await expect(page.getByText('Un tableau de bord mensuel, tenu à la main.')).toBeVisible();
    await expect(page.getByText(/cette question n’a été posée dans aucune session/)).toBeVisible();
    await balayer(page, 'agrégation (nominal)');
  });

  test('état VIDE : aucune donnée collectée — aucune violation axe', async ({ page }) => {
    await servirApi(page, { couverture: null, agregation: AGREGATION_VIDE });
    await page.goto(URL_AGREGATION);
    await expect(page.getByText('Aucune donnée collectée à ce jour')).toBeVisible();
    await balayer(page, 'agrégation (vide)');
  });

  test('état ERREUR : le message et le bouton Réessayer — aucune violation axe', async ({
    page,
  }) => {
    await servirApi(page, { couverture: null, agregation: null });
    await page.goto(URL_AGREGATION);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await balayer(page, 'agrégation (erreur)');
  });
});

test.describe('L7b — preuve que le balayage n’est pas vide', () => {
  /**
   * ANTI-VACUITÉ, ET PREUVE PAR BASCULE — mais DANS LE NAVIGATEUR, jamais dans
   * un fichier.
   *
   * Six tests rouges ne prouvent pas encore qu'ils mesurent la bonne chose : ils
   * prouveraient aussi bien un balayage cassé qui rougit sur tout. La bascule
   * habituelle — modifier la production, mesurer, restaurer — est ici INTERDITE
   * par le mandat A36 (09 §5.6 : je n'écris pas le code que je vérifie), et la
   * restauration « à l'identique » d'un fichier de style est de toute façon une
   * promesse qu'on tient mal.
   *
   * Alors la bascule se fait sur la PAGE VIVANTE : on pousse les trois correctifs
   * exacts que D1, D2 et D3 appellent — deux couleurs assombries, une zone de
   * défilement rendue focusable — et on remesure. Si les violations tombent à
   * zéro, alors le balayage mesurait BIEN ces trois propriétés-là, et rien
   * d'autre ne le tenait en échec. Aucun fichier n'est touché : la retombée est
   * la fermeture de l'onglet.
   *
   * Ce test est VERT aujourd'hui et doit le rester. Le jour où A31/A32 corrigent
   * les trois défauts, les six tests ci-dessus verdissent et celui-ci ne change
   * pas : il devient une redite, jamais un faux.
   */
  test('les trois défauts corrigés À CHAUD, le balayage rend zéro violation', async ({ page }) => {
    await servirApi(page, { couverture: COUVERTURE, agregation: null });
    await page.goto(URL_COUVERTURE);
    await expect(page.locator('td[data-manquante="true"]').first()).toBeVisible();

    // La mesure AVANT : elle doit être non vide, sinon la bascule ne prouve rien.
    const avant = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
    expect(
      avant.violations.length,
      'le balayage ne relève rien AVANT la bascule : il n’y aurait alors rien à prouver',
    ).toBeGreaterThan(0);

    // D1 et D2 : les deux textes reçoivent LE JETON DE TEXTE PRINCIPAL à la place
    // de celui qu'ils portent. Pas une valeur écrite ici : aucune notation de
    // couleur n'a le droit d'exister dans ce dépôt hors des jetons (invariant 4),
    // et le garde ne distingue pas l'exemple de l'infraction — c'est voulu, et
    // c'est déjà ce qu'A36 avait constaté sur `lot/l7a` le 2026-09-02.
    //
    // Et c'est le correctif JUSTE, pas un contournement : la correction que
    // A31/A32 appliqueront sera elle aussi un changement de jeton, jamais un
    // hexadécimal. La bascule éprouve donc le geste réel.
    await page.addStyleTag({
      content: `
        .axn-console__espace[aria-current='page'],
        .axn-couverture__note,
        .axn-couverture__planifie { color: var(--couleur-texte-principal); }
      `,
    });
    // D3 : la zone de défilement devient atteignable au clavier.
    await page.evaluate(() => {
      // `Array.from` et non un `for…of` direct : la `lib` du tsconfig racine ne
      // donne pas d'itérateur à `NodeListOf`, et un `for…of` y dégénère en `any`.
      for (const cadre of Array.from(document.querySelectorAll('.axn-tableau-cadre'))) {
        cadre.setAttribute('tabindex', '0');
        cadre.setAttribute('role', 'region');
        cadre.setAttribute('aria-label', 'Tableau défilant');
      }
    });

    const apres = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
    expect(apres.violations, `après bascule, il reste :\n${resumer(apres.violations)}`).toEqual([]);
  });
});
