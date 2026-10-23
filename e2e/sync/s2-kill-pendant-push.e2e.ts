// =============================================================================
// SCÉNARIO 2 du 05 §9.8 — « kill de l'app pendant un push » (L6c-2, VRAIE API)
//
// Le cas le plus sournois de la montée : le serveur A APPLIQUÉ le lot, mais l'appareil
// meurt AVANT d'en lire l'accusé. Au redémarrage, l'appareil croit n'avoir rien
// envoyé : toute sa file est encore là. Elle doit être rejouée, et le serveur doit la
// reconnaître (idempotence par `op_id`) — zéro perte, zéro doublon.
//
// Comment le cas est fabriqué, sans toucher au code de production :
//   · `page.route` laisse partir la requête de push JUSQU'AU SERVEUR (`route.fetch`),
//     puis ne rend JAMAIS la réponse au navigateur : le serveur a écrit, l'appareil n'en
//     sait rien ;
//   · on PROUVE côté base que les lignes sont déjà là (c'est la fenêtre visée), puis
//     on ferme le contexte (`contexte.close()`) : mort de l'application en plein push ;
//   · on rouvre le MÊME profil persistant, on déverrouille, on déclenche la sync ;
//   · on lit la base : exactement N sessions, mêmes identifiants que ceux de l'appareil,
//     et la file locale est vide.
//
// Déclencheur : l'application n'a pas de bouton « Synchroniser maintenant » ; le geste
// manuel (`synchroniserMaintenant`) est déclenché par l'événement `online` (05 §9.3,
// retour du réseau), exactement comme la fixture du banc le fait pour le premier pull.
//
// Limite assumée (11 §7) : service workers iOS NON couverts par Playwright — le mode
// avion réel sur iPad se rejoue à la main aux portes P-C et P-E.
//
// Invariant 2 : mission et entreprise FICTIVES.
// =============================================================================
import { expect, test, type Page, type Route } from '@playwright/test';
import {
  MOT_DE_PASSE_APPAREIL_CONNECTE,
  lireTableLocale,
  ouvrirAppareilConnecte,
} from '../fixtures/appareil-connecte.js';
import { deverrouillerAppareil, ouvrirProfilSurDisque } from '../fixtures/appareil-terrain.js';
import { ipDuFichier, uuidv7, vieillir, avecBase } from '../banc/semis-serveur.js';

const PREFIXE = 's2-kill-pendant-push';
const NOMBRE_SESSIONS = 3;

/** Un créneau d'aujourd'hui (fuseau de la mission), heure fixe. */
function creneau(heure: number): string {
  const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  return `${jour}T${String(heure).padStart(2, '0')}:00`;
}

async function planifierEntretien(page: Page, rang: number): Promise<void> {
  await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
  await page.getByLabel('Nom de l’interlocuteur').fill(`Interlocuteur kill ${String(rang + 1)}`);
  await page.getByLabel('Fonction').fill('Fonction d’essai');
  await page.getByLabel('Créneau').fill(creneau(8 + rang));
  await page.getByRole('button', { name: 'Planifier' }).click();
  await expect
    .poll(async () => (await lireTableLocale(page, 'interviews')).length, {
      message: `la session ${String(rang + 1)} doit être écrite dans IndexedDB`,
      timeout: 15_000,
    })
    .toBe(rang + 1);
}

test.describe('05 §9.8 n°2 — kill de l’application pendant un push', () => {
  test('@critique kill pendant un push : file rejouée au redémarrage, zéro perte, zéro doublon', async () => {
    test.setTimeout(240_000);
    const appareil = await ouvrirAppareilConnecte(PREFIXE);
    let { contexte, page } = appareil;
    const { auditeur, mission } = appareil;

    try {
      // ── Une unité d'organisation côté siège, descendue par un 2ᵉ pull ──────
      // (le 1ᵉʳ pull du banc a lieu dans la minute : il n'a rien vu — borne now()-60 s).
      await avecBase((bd) =>
        bd.query(
          `INSERT INTO org_units (id, mission_id, kind, name, status, in_scope, position, created_at, updated_at)
           VALUES ($1, $2, 'service', 'Unité fictive s2', 'active', true, 1, now(), now())`,
          [uuidv7(), mission.missionId],
        ),
      );
      await vieillir(mission.missionId);

      const pullUnite = page.waitForResponse(
        (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
        { timeout: 30_000 },
      );
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect((await pullUnite).status()).toBe(200);
      await expect
        .poll(async () => (await lireTableLocale(page, 'orgUnits')).length, { timeout: 20_000 })
        .toBe(1);

      // ── Le push est RETENU : le serveur le reçoit et l'applique, jamais l'accusé ──
      const recus: number[] = [];
      await page.route('**/api/v1/sync/push', async (route: Route) => {
        // Le serveur traite VRAIMENT le lot ; la réponse, elle, n'arrive jamais.
        const reponse = await route.fetch();
        recus.push(reponse.status());
        // volontairement ni `fulfill` ni `abort` : l'appareil meurt avant l'accusé.
      });

      await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
      await page.getByRole('button', { name: /l’agenda/ }).click();
      for (let rang = 0; rang < NOMBRE_SESSIONS; rang += 1) {
        await planifierEntretien(page, rang);
      }
      const identifiantsLocaux = (await lireTableLocale(page, 'interviews')).map((l) =>
        String(l.id),
      );
      expect(new Set(identifiantsLocaux).size).toBe(NOMBRE_SESSIONS);
      const fileAvant = (await lireTableLocale(page, 'outbox')).filter(
        (op) => op.entite === 'interview',
      );
      expect(fileAvant.length, 'une op en file par session').toBe(NOMBRE_SESSIONS);

      // Le geste manuel : le push part, il est retenu.
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });

      // Preuve que la fenêtre visée est BIEN celle-là : le serveur a écrit les N sessions
      // pendant que l'appareil n'a toujours rien reçu.
      await expect
        .poll(
          async () =>
            (
              await avecBase((bd) =>
                bd.query<{ n: string }>(
                  `SELECT count(*)::text AS n FROM interviews WHERE mission_id = $1`,
                  [mission.missionId],
                ),
              )
            ).rows[0]?.n,
          { message: 'le serveur doit avoir appliqué le lot retenu', timeout: 30_000 },
        )
        .toBe(String(NOMBRE_SESSIONS));
      expect(recus, 'le serveur a répondu 200 à un push que l’appareil n’a jamais lu').toContain(
        200,
      );
      const fileMorte = (await lireTableLocale(page, 'outbox')).filter(
        (op) => op.entite === 'interview',
      );
      expect(fileMorte.length, 'sans accusé, la file locale est INTACTE').toBe(NOMBRE_SESSIONS);

      // ── KILL : le contexte est fermé en plein push ──────────────────────────
      await contexte.close().catch(() => undefined);

      // ── Redémarrage sur le MÊME profil persistant ───────────────────────────
      ({ contexte, page } = await ouvrirProfilSurDisque(
        `connecte-${PREFIXE}`,
        {
          locale: 'fr-FR',
          timezoneId: 'Europe/Paris',
          extraHTTPHeaders: { 'x-forwarded-for': ipDuFichier(PREFIXE) },
        },
        'tel_quel',
      ));
      await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL_CONNECTE);

      const apresRedemarrage = (await lireTableLocale(page, 'outbox')).filter(
        (op) => op.entite === 'interview',
      );
      expect(apresRedemarrage.length, 'la file survit au kill, rien n’est perdu').toBe(
        NOMBRE_SESSIONS,
      );

      // ── Le geste manuel, cette fois sans retenue : la file est rejouée ──────
      const rejeu = page.waitForResponse(
        (r) => r.url().includes('/api/v1/sync/push') && r.request().method() === 'POST',
        { timeout: 60_000 },
      );
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect((await rejeu).status(), 'le rejeu est accepté par le serveur').toBe(200);

      await expect
        .poll(
          async () =>
            (await lireTableLocale(page, 'outbox')).filter((op) => op.entite === 'interview')
              .length,
          { message: 'la file doit se vider après l’accusé du rejeu', timeout: 30_000 },
        )
        .toBe(0);

      // ── Zéro perte, zéro doublon, côté SERVEUR ──────────────────────────────
      const serveur = await avecBase((bd) =>
        bd.query<{ id: string; conducted_by: string | null }>(
          `SELECT id, conducted_by FROM interviews WHERE mission_id = $1 ORDER BY id`,
          [mission.missionId],
        ),
      );
      expect(serveur.rows.length, 'exactement N sessions : aucun doublon, aucune perte').toBe(
        NOMBRE_SESSIONS,
      );
      expect(serveur.rows.map((l) => l.id).sort()).toEqual([...identifiantsLocaux].sort());
      expect(serveur.rows.every((l) => l.conducted_by === auditeur.id)).toBe(true);

      // Aucune op ne reste « à examiner » ou « rejetée » : le rejeu n'a rien bloqué.
      const bloquees = (await lireTableLocale(page, 'outbox')).filter(
        (op) => op.statut !== 'en_attente',
      );
      expect(bloquees).toEqual([]);
    } finally {
      await contexte.close().catch(() => undefined);
    }
  });
});
