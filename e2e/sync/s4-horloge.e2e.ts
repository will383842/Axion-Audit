// =============================================================================
// SCÉNARIO 4 du 05 §9.8 — « horloge locale déréglée (+3 h) » (L6c-2, VRAIE API)
//
// 05 §9.2 : `client_updated_at` = horloge locale + offset serveur estimé à la dernière
// sync ; 05 §9.4 : le dernier écrit gagne PAR LIGNE sur cet horodatage. Une tablette en
// avance de trois heures gagnerait donc tous les conflits — sauf si l'appareil apprend
// son écart à la descente (`serverTime` du pull → `reglerDecalage`).
//
// Seul le NAVIGATEUR est déréglé (`page.clock`) ; le serveur et PostgreSQL gardent
// leur horloge réelle. Ce que le scénario prouve :
//   1. la déréglage est RÉEL (précondition) : l'horloge de la page avance de ~3 h, et la
//      première session porte un `client_updated_at` ~3 h dans le futur côté serveur ;
//   2. les horodatages ÉCRITS PAR LE SERVEUR (`created_at`, `updated_at`, `synced_at`)
//      ne sont jamais dans le futur de la base (ils viennent de now() du serveur) ;
//   3. à la descente, l'appareil apprend son écart : une session écrite APRÈS ce pull
//      porte un `clientUpdatedAt` proche de l'heure réelle, plus de +3 h ;
//   4. cette session corrigée est elle aussi acceptée par le serveur, sans futur.
//
// Déclencheur : l'application n'a pas de bouton « Synchroniser maintenant » ; le geste
// manuel (`synchroniserMaintenant`) part sur l'événement `online` (05 §9.3).
//
// Limite assumée (11 §7) : service workers iOS NON couverts par Playwright — le mode
// avion réel sur iPad se rejoue à la main aux portes P-C et P-E.
//
// Invariant 2 : mission et entreprise FICTIVES.
// =============================================================================
import { expect, test, type Page } from '@playwright/test';
import {
  MOT_DE_PASSE_APPAREIL_CONNECTE,
  lireTableLocale,
  ouvrirAppareilConnecte,
} from '../fixtures/appareil-connecte.js';
import { deverrouillerAppareil } from '../fixtures/appareil-terrain.js';
import { avecBase, uuidv7, vieillir } from '../banc/semis-serveur.js';

const PREFIXE = 's4-horloge';
const TROIS_HEURES_MS = 3 * 60 * 60 * 1000;

/** Un créneau « aujourd'hui » dans le fuseau de la mission, lu sur l'horloge de la PAGE. */
async function creneauDeLaPage(page: Page, heure: number): Promise<string> {
  const jour = await page.evaluate(() =>
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
  );
  return `${jour}T${String(heure).padStart(2, '0')}:00`;
}

async function planifierEntretien(page: Page, rang: number): Promise<void> {
  await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
  await page.getByLabel('Nom de l’interlocuteur').fill(`Interlocuteur horloge ${String(rang + 1)}`);
  await page.getByLabel('Fonction').fill('Fonction d’essai');
  await page.getByLabel('Créneau').fill(await creneauDeLaPage(page, 12 + rang));
  await page.getByRole('button', { name: 'Planifier' }).click();
  await expect
    .poll(async () => (await lireTableLocale(page, 'interviews')).length, {
      message: `la session ${String(rang + 1)} doit être écrite dans IndexedDB`,
      timeout: 15_000,
    })
    .toBe(rang + 1);
}

/** Le geste de synchronisation : retour du réseau → montée puis descente. */
async function synchroniser(page: Page): Promise<void> {
  const descente = page.waitForResponse(
    (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
  expect((await descente).status(), 'la descente doit réussir').toBe(200);
}

test.describe('05 §9.8 n°4 — horloge locale déréglée de +3 h', () => {
  test('@critique horloge +3 h : horodatages serveur jamais dans le futur, décalage géré à la descente', async () => {
    test.setTimeout(240_000);
    const appareil = await ouvrirAppareilConnecte(PREFIXE);
    const { contexte, page, mission } = appareil;

    try {
      // ── Une unité d'organisation côté siège, descendue AVANT le dérèglement ───
      await avecBase((bd) =>
        bd.query(
          `INSERT INTO org_units (id, mission_id, kind, name, status, in_scope, position, created_at, updated_at)
           VALUES ($1, $2, 'service', 'Unité fictive s4', 'active', true, 1, now(), now())`,
          [uuidv7(), mission.missionId],
        ),
      );
      await vieillir(mission.missionId);
      await synchroniser(page);
      await expect
        .poll(async () => (await lireTableLocale(page, 'orgUnits')).length, { timeout: 20_000 })
        .toBe(1);

      // On quitte l'écran de rattachement AVANT le rechargement : la vue mémorisée est alors
      // « Aujourd'hui », qui porte l'accès à l'agenda.
      await page.getByRole('button', { name: 'Revenir à la collecte' }).click();

      // ── LE DÉRÈGLEMENT : le navigateur avance de +3 h, le serveur non ────────
      const reelAvant = Date.now();
      await page.clock.install({ time: new Date(reelAvant + TROIS_HEURES_MS) });
      await page.reload();
      await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL_CONNECTE);

      const horlogePage = await page.evaluate(() => Date.now());
      expect(
        horlogePage - Date.now(),
        'précondition : l’horloge de la page est bien en avance d’environ 3 h',
      ).toBeGreaterThan(TROIS_HEURES_MS - 5 * 60 * 1000);

      await page.getByRole('button', { name: /l’agenda/ }).click();
      await planifierEntretien(page, 0);

      // Première synchronisation : la session part avec l'heure fausse, la descente
      // rapporte le `serverTime` réel.
      await synchroniser(page);
      await expect
        .poll(
          async () =>
            (await lireTableLocale(page, 'outbox')).filter((op) => op.entite === 'interview')
              .length,
          { message: 'la session doit être acceptée par le serveur', timeout: 30_000 },
        )
        .toBe(0);

      // Précondition côté serveur : la ligne porte bien un `client_updated_at` dans le
      // futur (sinon le scénario ne prouverait rien).
      const premiere = await avecBase((bd) =>
        bd.query<{
          futur_client_ms: string;
          serveur_dans_le_futur: boolean;
        }>(
          `SELECT (EXTRACT(EPOCH FROM (client_updated_at - now())) * 1000)::bigint::text AS futur_client_ms,
                  (created_at > now() OR updated_at > now()
                   OR (synced_at IS NOT NULL AND synced_at > now())) AS serveur_dans_le_futur
             FROM interviews WHERE mission_id = $1`,
          [mission.missionId],
        ),
      );
      expect(premiere.rows.length).toBe(1);
      expect(
        Number(premiere.rows[0]?.futur_client_ms),
        'précondition : le serveur a reçu un client_updated_at ~3 h dans le futur',
      ).toBeGreaterThan(TROIS_HEURES_MS - 10 * 60 * 1000);
      expect(
        premiere.rows[0]?.serveur_dans_le_futur,
        'les horodatages ÉCRITS PAR LE SERVEUR ne sont jamais dans le futur',
      ).toBe(false);

      // ── Le décalage est géré À LA DESCENTE : une écriture suivante est corrigée ───
      const idsAvant = new Set(
        (await lireTableLocale(page, 'interviews')).map((l) => String(l.id)),
      );
      await planifierEntretien(page, 1);
      const reelApres = Date.now();
      const locales = await lireTableLocale(page, 'interviews');
      expect(locales.length).toBe(2);
      // La session écrite APRÈS la descente (la seule absente d'avant).
      const posterieure = locales.find((l) => !idsAvant.has(String(l.id)));
      expect(posterieure, 'la session écrite après la descente existe').toBeDefined();
      const instant = Date.parse(String(posterieure?.clientUpdatedAt));
      // Elle doit coller à l'heure RÉELLE du serveur (marge de 5 min pour la latence et la
      // charge de la machine), pas à l'heure déréglée de +3 h.
      expect(
        Math.abs(instant - reelApres),
        'après la descente, client_updated_at est ramené à l’heure du serveur (écart < 5 min, plus de +3 h)',
      ).toBeLessThan(5 * 60 * 1000);

      // La session corrigée remonte à son tour, sans qu'aucun horodatage serveur ne
      // soit dans le futur.
      await synchroniser(page);
      await expect
        .poll(
          async () =>
            (await lireTableLocale(page, 'outbox')).filter((op) => op.entite === 'interview')
              .length,
          { timeout: 30_000 },
        )
        .toBe(0);
      const apres = await avecBase((bd) =>
        bd.query<{ n: string; futur: string }>(
          `SELECT count(*)::text AS n,
                  count(*) FILTER (WHERE created_at > now() OR updated_at > now()
                                      OR (synced_at IS NOT NULL AND synced_at > now()))::text AS futur
             FROM interviews WHERE mission_id = $1`,
          [mission.missionId],
        ),
      );
      expect(apres.rows[0]?.n, 'les deux sessions sont au siège, une fois chacune').toBe('2');
      expect(apres.rows[0]?.futur, 'aucun horodatage serveur dans le futur').toBe('0');
    } finally {
      await contexte.close().catch(() => undefined);
    }
  });
});
