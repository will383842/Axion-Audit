// =============================================================================
// E2E — CONTRÔLE DE SOCLE (lot L0)
//
// Ce que ces tests prouvent : les deux fronts CONSTRUITS démarrent réellement,
// servent du français, appliquent les tokens de la charte et n'appellent aucun
// domaine extérieur. Autrement dit, ils vérifient à l'exécution ce que le lint et
// les tests unitaires ne vérifient que dans les sources.
//
// Ce qu'ils ne prouvent PAS, et qu'il ne faut pas leur faire dire : rien du métier.
// Il n'y a ni écran, ni donnée, ni synchronisation au lot L0.
//
// La suite GRANDIT et ne se réécrit jamais (09 §4bis) :
//   L1  → fil rouge `@filrouge` sur FIL-TPE et FIL-GC
//   L5  → session hors ligne, cotation, à-revoir, photo, mode avion
//   L6  → les 8 scénarios du 05 §9.8, marqués `@critique`
// Traçabilité : E17 (stack imposée), E6 (hors ligne — amorce), E36 (CI exécutable).
// =============================================================================
import { test, expect } from '@playwright/test';
import { COULEURS_CHARTE, TOKENS_COULEUR } from '@axion/ui';

/**
 * Convertit une couleur hexadécimale en la notation décimale que rend
 * `getComputedStyle`. La VALEUR vient toujours de @axion/ui : cette fonction ne
 * fait que changer de notation, elle ne connaît aucune couleur.
 */
function enRgb(hex: string): string {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  // invariant-ok: chaîne CONSTRUITE à partir du token, aucune couleur littérale ici.
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

const FRONTS = [
  { nom: 'terrain', url: 'http://127.0.0.1:4173/', titre: 'Axion Audit — Terrain' },
  { nom: 'console', url: 'http://127.0.0.1:4174/hq/', titre: 'Axion Audit — Console' },
] as const;

for (const front of FRONTS) {
  test.describe(`front ${front.nom}`, () => {
    test('démarre, s’annonce en français et porte son titre', async ({ page }) => {
      const reponse = await page.goto(front.url);
      expect(reponse?.status(), 'le serveur doit répondre 200').toBe(200);

      // Invariant 5 : interface 100 % en français. `lang` pilote la césure, la
      // synthèse vocale et les lecteurs d'écran — ce n'est pas décoratif.
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page).toHaveTitle(front.titre);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('applique les tokens de la charte, jamais une couleur en dur', async ({ page }) => {
      await page.goto(front.url);

      // Invariant 4 : la page doit peindre avec les VARIABLES du design system.
      // On vérifie que la variable existe ET qu'elle est réellement appliquée —
      // déclarer un token sans l'utiliser ne prouverait rien.
      // Les valeurs attendues viennent des TOKENS, jamais d'une constante recopiée
      // ici : ce test vérifie que le token est APPLIQUÉ, pas qu'il vaut telle ou
      // telle couleur — c'est `tokens.test.ts` qui verrouille la charte elle-même.
      // Deux endroits où écrire la même couleur finiraient par en écrire deux
      // différentes — c'est tout l'objet de l'invariant 4.
      const tokenFond = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--couleur-surface-fond')
          .trim(),
      );
      expect(tokenFond, 'le token --couleur-surface-fond doit être défini').toBe(
        TOKENS_COULEUR['surface-fond'],
      );

      const fondApplique = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? getComputedStyle(main).backgroundColor : null;
      });
      // Le navigateur normalise toujours en notation rgb : on convertit le token plutôt
      // que d'écrire la forme normalisée à la main.
      expect(fondApplique).toBe(enRgb(TOKENS_COULEUR['surface-fond']));
    });

    test('porte une couleur de thème injectée depuis les tokens', async ({ page }) => {
      await page.goto(front.url);
      // Le HTML statique ne peut pas lire une variable CSS ; la couleur est donc
      // injectée à la construction par un plugin Vite. Ce test vérifie que
      // l'injection a bien eu lieu : sans lui, un `%COULEUR_THEME%` non remplacé
      // passerait inaperçu jusqu'à ce qu'un utilisateur voie la barre de son
      // navigateur rester grise.
      const theme = page.locator('meta[name="theme-color"]');
      await expect(theme).toHaveAttribute('content', COULEURS_CHARTE.terracotta);
    });

    test('ne contacte AUCUN domaine extérieur', async ({ page }) => {
      // Contrat 11 §1 et §2 : police auto-hébergée, aucun CDN, aucun CORS.
      // C'est la condition du mode avion (porte P-C) : une seule requête sortante
      // et la PWA ne démarre plus dans un sous-sol.
      const externes: string[] = [];
      page.on('request', (requete) => {
        const url = new URL(requete.url());
        if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
          externes.push(requete.url());
        }
      });

      await page.goto(front.url, { waitUntil: 'networkidle' });
      expect(externes, `requêtes sortantes détectées : ${externes.join(', ')}`).toEqual([]);
    });
  });
}
