// =============================================================================
// E2E — AXE-CORE SUR LA PAGE `/design` (03 §33.5, réserve NB-2)
//
// ── POURQUOI CETTE PAGE MÉRITE SON PROPRE BALAYAGE ─────────────────────────
// C'est la page la plus DENSE du dépôt : elle rend les 34 composants exportés
// par `@axion/ui`, chacun dans deux à cinq états, sur une seule page. Un défaut
// d'accessibilité d'un composant du design system se propage à tous les écrans
// qui l'utilisent — ici il est mesuré UNE fois, sur tout l'inventaire, au lieu
// d'être découvert écran par écran.
//
// Elle balaie aussi ce qu'aucun test jsdom ne peut mesurer : le CONTRASTE. Sans
// mise en page, axe désactive silencieusement `color-contrast`, et c'est
// précisément la règle qui compte pour une page de charte. L'anti-vacuité
// ci-dessous vérifie donc que la règle a réellement TOURNÉ — pas seulement
// qu'elle n'a rien trouvé.
//
// ── AUCUNE RÈGLE DÉSACTIVÉE, AUCUN PÉRIMÈTRE RÉTRÉCI ───────────────────────
// Pas de `disableRules`, pas d'`.include('main')`. La coquille est à l'écran,
// donc elle se mesure. Si cette page rend une violation réelle, elle reste
// ROUGE et le défaut part au producteur — la règle qu'on retire est toujours
// celle qui aurait mesuré.
//
// ── AUCUN SERVEUR, AUCUNE INTERCEPTION ─────────────────────────────────────
// La page n'appelle rien : elle est entièrement statique et servie même sans
// session (voir `App.tsx`). C'est le seul écran de la console qu'on atteint
// sans `page.route()`, et c'est une propriété voulue, pas un raccourci de test.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale), E22 (console de pilotage 7 espaces).
// =============================================================================
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGE_DESIGN = 'http://127.0.0.1:4174/hq/design';

/** Les mêmes familles de règles que les balayages L5a et L7b — A et AA, 2.0 et 2.1. */
const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

function resumer(
  violations: readonly { readonly id: string; readonly nodes: readonly unknown[] }[],
): string {
  return violations.map((v) => `${v.id} × ${String(v.nodes.length)}`).join('\n') || '(aucune)';
}

/**
 * L'anti-vacuité : on ne balaie pas une page blanche. Trois temps, comme dans
 * `accessibilite-toutes-vues-l5.e2e.ts` — un écran qui ne rend rien passe un
 * balayage axe sans rien mesurer, et c'est un vert qui se coche.
 */
async function arriver(page: Page): Promise<void> {
  await page.goto(PAGE_DESIGN);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Design system');
  // Une assertion PROPRE à cette page, pas seulement son titre : la galerie a
  // réellement rendu ses fiches, et pas seulement son chapeau.
  const fiches = page.locator('.axn-design__fiche');
  expect(await fiches.count()).toBeGreaterThanOrEqual(30);
  await expect(page.locator('main')).toBeVisible();
}

test.describe('@critique page /design — accessibilité de tout l’inventaire du design system', () => {
  test('axe-core ne relève aucune violation A/AA sur la page entière', async ({ page }) => {
    await arriver(page);
    const resultat = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
    expect(resultat.violations, `axe-core — /design :\n${resumer(resultat.violations)}`).toEqual(
      [],
    );
  });

  test('la règle `color-contrast` a réellement TOURNÉ — sinon le vert ne vaut rien', async ({
    page,
  }) => {
    await arriver(page);
    const resultat = await new AxeBuilder({ page }).withTags([...NORMES]).analyze();
    const aTourne = [...resultat.passes, ...resultat.violations, ...resultat.incomplete].some(
      (regle) => regle.id === 'color-contrast',
    );
    expect(
      aTourne,
      'axe n’a pas exécuté `color-contrast` : rien n’est mis en page, la mesure est creuse.',
    ).toBe(true);
    // Et elle a inspecté un VOLUME de nœuds cohérent avec une page qui rend
    // trente-quatre composants : un balayage sur trois nœuds serait vert et vide.
    const noeudsInspectes = resultat.passes.reduce((total, regle) => total + regle.nodes.length, 0);
    expect(noeudsInspectes).toBeGreaterThan(100);
  });

  test('la page est atteinte SANS session — c’est une référence de recette, pas une donnée', async ({
    page,
  }) => {
    const requetesApi: string[] = [];
    page.on('request', (requete) => {
      if (requete.url().includes('/api/')) requetesApi.push(requete.url());
    });
    await arriver(page);
    // Aucun appel d'API, donc aucun 401, donc aucun écran de connexion à la place.
    expect(requetesApi).toEqual([]);
    await expect(page.getByRole('button', { name: /se connecter/i })).toHaveCount(0);
  });

  test('la police est celle du dépôt, pas une police système de repli', async ({ page }) => {
    await arriver(page);
    // Le rendu hors ligne se prouve dans `polices.e2e.ts` ; ici on vérifie
    // seulement que la page de charte n'est pas rendue en police de repli — une
    // planche typographique en Times ne montrerait pas ce qu'elle prétend montrer.
    const famille = await page.evaluate(
      () => getComputedStyle(document.documentElement).fontFamily,
    );
    expect(famille).toContain('Inter');
  });

  test('aucune requête réseau vers un CDN de police (11 §1)', async ({ page }) => {
    const externes: string[] = [];
    page.on('request', (requete) => {
      const url = requete.url();
      if (!url.startsWith('http://127.0.0.1:4174') && !url.startsWith('data:')) externes.push(url);
    });
    await arriver(page);
    expect(externes, `requêtes hors du domaine servi :\n${externes.join('\n')}`).toEqual([]);
  });
});
