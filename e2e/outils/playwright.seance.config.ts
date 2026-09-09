// =============================================================================
// CONFIGURATION PLAYWRIGHT DE L'OUTIL DE SÉANCE — hors de la suite, et dit
//
// `playwright.config.ts` (racine) collecte `e2e/**/*.e2e.ts` et démarre ses
// propres serveurs. L'outil de séance, lui, vise un déploiement DISTANT et ne
// doit jamais tourner en intégration continue : une suite qui dépend d'un
// staging rougit pour des raisons qui ne regardent pas le code.
//
// Cette configuration ne collecte donc QUE `*.outil.ts`, n'a pas de `webServer`,
// et vit dans le même répertoire que ce qu'elle lance. Elle ne modifie RIEN de
// la configuration de la suite : aucun test n'est skippé, désactivé ni déplacé.
//
// Le fuseau est celui de la mission de fixture — le cockpit découpe
// « aujourd'hui » dessus (03 §34.2), et un navigateur à un autre fuseau ferait
// basculer l'agenda d'un jour une nuit sur deux.
// =============================================================================
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.outil.ts',
  // Un outil se joue à la main, dans l'ordre, et sa sortie se lit : ni
  // parallélisme, ni nouvelle tentative silencieuse qui masquerait un échec.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: '../../test-results/outil-seance',
});
