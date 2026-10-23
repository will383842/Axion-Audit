// =============================================================================
// PLAYWRIGHT — suite E2E du projet (11 §1 : Playwright est une version épinglée du
// contrat ; 11 §7 : « CI, jobs dans cet ordre : … → e2e (chromium) → … »).
//
// LIMITE ASSUMÉE, écrite ici pour que personne ne la découvre trop tard (11 §7) :
// `context.setOffline(true)` couvre les scénarios réseau, mais **les service workers
// sous iOS ne sont PAS couverts par Playwright**. Le mode avion RÉEL sur iPad se
// rejoue À LA MAIN aux portes P-C et P-E (checklist 07 §15). Documenté, pas contourné.
//
// PÉRIMÈTRE AU LOT L0 : la suite ne contient que le contrôle de démarrage des deux
// fronts. Elle grandit lot par lot et ne se réécrit jamais :
//   L1  → naissance du fil rouge `@filrouge` sur FIL-TPE et FIL-GC (09 §4bis)
//   L5  → session hors ligne, cotation, à-revoir, photo
//   L6  → **les 8 scénarios du 05 §9.8**, marqués `@critique`, jamais skippables
// =============================================================================
import { defineConfig, devices } from '@playwright/test';

/** La CI durcit ce qu'elle seule peut durcir : reprises, `forbidOnly`, parallélisme, rapporteur. */
const enCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',

  // BANC AVEC VRAIE API (L6c-2) : bases, migrations, semis, MinIO, Redis puis l'API
  // CONSTRUITE, lancés ICI et non par un `webServer` — Playwright démarre les
  // `webServer` AVANT le `globalSetup`, donc avant que la base existe. Le banc ne
  // démarre pas pour une exécution limitée au projet `hors-ligne` (voir global-setup).
  globalSetup: './e2e/banc/global-setup.ts',

  // Un test E2E qui échoue par intermittence est un test qui ment. En CI on
  // autorise UNE reprise (aléas d'infrastructure) et zéro en local, pour que
  // l'instabilité se voie pendant qu'on la crée plutôt que six semaines plus tard.
  retries: enCI ? 1 : 0,
  // `forbidOnly` : un `.only` oublié rendrait la CI verte en n'exécutant qu'un test.
  // Doublé par `pnpm check:no-skipped-tests` (09 §5.7) — deux ceintures, exprès.
  forbidOnly: enCI,
  fullyParallel: true,
  // `exactOptionalPropertyTypes` refuse `workers: undefined` : on OMET la clé
  // plutôt que de l'affecter à undefined. Hors CI, Playwright choisit lui-même.
  ...(enCI ? { workers: 2 } : {}),

  reporter: enCI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    // Invariant 5 : l'interface est en français, et le navigateur de test doit
    // l'être aussi — sinon les formats de date et de nombre testés ne sont pas
    // ceux que verra l'auditeur.
    locale: 'fr-FR',
    // Le fuseau du NAVIGATEUR est délibérément décalé de celui du serveur (UTC) :
    // c'est ainsi qu'on attrape un affichage qui aurait oublié le fuseau de
    // mission (§22.2). Un test qui tourne en UTC ne verrait jamais le bug.
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
  },

  projects: [
    // Le parcours hors ligne EXISTANT (L0 → L6b), inchangé : renommé de `chromium`
    // en `hors-ligne` pour le distinguer des deux projets qui parlent à la vraie API.
    {
      name: 'hors-ligne',
      testIgnore: ['**/sync/**', '**/charge/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    // Les 8 scénarios du 05 §9.8 et tout ce qui traverse la VRAIE API (`@critique`).
    // `retries: 0` MÊME en CI : un test qui ne passe qu'à la deuxième tentative est un
    // test de sync qui ment. `failOnFlakyTests` n'existe qu'au niveau de la
    // configuration (il s'appliquerait aussi à `hors-ligne`) ; zéro reprise produit le
    // même effet pour ce projet seul. 2 workers : `pnpm test:e2e:sync`.
    {
      name: 'sync-critique',
      testDir: './e2e/sync',
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
    // Charge / volumétrie : UN worker (`pnpm test:e2e:charge`), les mesures ne
    // doivent pas se disputer la machine.
    {
      name: 'charge',
      testDir: './e2e/charge',
      retries: 0,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
    // L'iPad arrive au lot L5 (A27 — testeur multi-appareils). L'ajouter avant
    // qu'il existe un écran à tester ne prouverait rien.
  ],

  // Les serveurs sont démarrés par Playwright lui-même : la suite ne dépend donc
  // ni de Docker ni d'un `pnpm dev` lancé à la main. C'est ce qui la rend
  // exécutable en CI sur une machine nue.
  //
  // `vite preview` sert le BUILD, pas les sources : `dist/` doit exister. Le script
  // `pnpm test:e2e` construit donc AVANT d'appeler Playwright, ce qui rend la
  // commande autoporteuse — ni la CI ni un développeur n'ont à s'en souvenir. On
  // teste ainsi l'artefact réellement déployé, et non un rendu de développement :
  // c'est la seule façon d'attraper un `%COULEUR_THEME%` non substitué ou un asset
  // absent du bundle.
  //
  // `reuseExistingServer: false` PARTOUT, et pas seulement en CI. Une version
  // antérieure écrivait `!enCI` : en local, Playwright sondait d'abord l'URL et
  // réutilisait tout serveur qui répondait. Le raisonnement était le confort du
  // développeur qui a déjà un `pnpm dev` ouvert — mais il faisait dépendre le
  // verdict de `pnpm verify` de l'ÉTAT DE LA MACHINE plutôt que du code.
  //
  // Constaté le 2026-08-28 : la suite est sortie à 4 échecs sur 8 (front terrain,
  // `ERR_CONNECTION_REFUSED` sur 4173), puis verte DEUX fois de suite, sans qu'une
  // ligne ait changé. Signature : les tests démarrent sans attendre — donc la
  // sonde a répondu — puis ne trouvent plus personne. Un `vite preview` résiduel,
  // vivant à la sonde et mort pendant la course, suffit.
  //
  // Le sens de l'échec est ce qui compte, et c'est l'argument de la fiche A-003 sur
  // le schéma doré : réutiliser un serveur ambiant, c'est accepter un FAUX NÉGATIF
  // SILENCIEUX — un `verify` peut aussi passer au VERT servi par un `dist/` périmé,
  // et personne ne le saura. Démarrer toujours son propre serveur avec
  // `--strictPort` échoue BRUYAMMENT si le port est pris. Le développeur qui a un
  // `pnpm dev` ouvert perd trois secondes ; la suite, elle, ne ment plus.
  webServer: [
    {
      command: 'pnpm --filter @axion/field preview --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/',
      // JAMAIS de réutilisation, même en local — voir le bloc ci-dessus.
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @axion/hq preview --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174/hq/',
      // JAMAIS de réutilisation, même en local — voir le bloc ci-dessus.
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
