// =============================================================================
// PLAYWRIGHT — LA SUITE DE MESURE A28 (perf), SÉPARÉE DE LA SUITE E2E.
//
// ── POURQUOI UNE CONFIGURATION À PART ──────────────────────────────────────
// ① Elle ne démarre AUCUN serveur. La suite E2E lance `vite preview`, qui ne
//    pose aucun en-tête ; la mesure du budget d'interactions doit se faire
//    derrière le VRAI Caddy, avec la CSP, COOP, COEP réellement servis (le
//    montage est décrit dans l'en-tête de `tests/perf/interactions-l5.perf.ts`
//    et dans `docs/portes/MESURE_P95_A28_2026-09-09.md`).
// ② Elle interdit le parallélisme : deux fichiers de mesure qui se partagent
//    huit cœurs ne mesurent plus le produit, ils mesurent la contention.
// ③ Elle interdit les reprises. `retries: 1` de la suite E2E rendrait VERT un
//    dépassement de budget rattrapé au second essai — c'est le défaut nommé par
//    A29 (remarque n° 4 de `REVUE_A29_L5_BUDGET_CHIFFREMENT_2026-09-07.md`), et
//    il est intolérable dans une suite dont le seul objet est un seuil.
//
// Le `testMatch` porte sur `*.perf.ts` : ces fichiers ne sont donc JAMAIS
// ramassés par `playwright.config.ts` (`**/*.e2e.ts`), et la CI ne s'allonge pas
// d'un montage Docker + Caddy qu'elle n'a pas demandé.
//
// LA COMMANDE, pour qu'elle se rejoue sans rien deviner :
//   1. pnpm build
//   2. démarrer Caddy sur 127.0.0.1:4173 (voir le rapport A28, § « instrument »)
//   3. pnpm exec playwright test --config=playwright.perf.config.ts
// =============================================================================
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // Les bancs de mesure d'A28, ET le banc de chiffrement du 11 §4 qui existait
  // déjà. Ce dernier est REJOUÉ TEL QUEL derrière Caddy — pas réécrit : il porte
  // quatre contre-épreuves et trois anti-vacuités qu'une copie perdrait. Il vit
  // dans `e2e/` parce qu'il tourne AUSSI en CI sous `vite preview` ; l'ajouter
  // ici lui donne la seconde condition, celle des en-têtes réels.
  testMatch: ['tests/perf/**/*.perf.ts', 'e2e/budget-chiffrement-l5.e2e.ts'],

  // Un budget mesuré deux fois et rendu vert la seconde n'est pas mesuré.
  retries: 0,
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-perf' }]],

  use: {
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
