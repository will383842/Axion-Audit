// =============================================================================
// 05 §9.8 — SCÉNARIO 1 : COUPURE RÉSEAU EN PLEINE SAISIE (E2E, VRAIE API)
//
// Ce que ce fichier prouve, et seulement cela : quand le réseau tombe PENDANT la
// saisie, puis pendant un push en vol, AUCUNE réponse n'est perdue ; au retour du
// réseau, TOUT remonte une fois ; le terrain vide sa file ; le serveur n'a ni trou
// ni doublon.
//
// Déterminisme : aucune minuterie. Les coupures sont `context.setOffline` (saisie)
// et `page.route(...).abort()` (push en vol). La sync est déclenchée par l'événement
// `online` — le déclencheur « retour du réseau » du 05 §9.3, celui que la fixture du
// banc emploie aussi — jamais par la cadence de 30 s.
//
// Limite assumée (11 §7) : `context.setOffline` couvre le réseau ; les service workers
// iOS ne sont PAS couverts par Playwright — le mode avion RÉEL sur iPad se rejoue à la
// main aux portes P-C et P-E.
//
// Invariant 2 : mission, entreprise et questions FICTIVES.
// =============================================================================
import { expect, test, type Page, type Request } from '@playwright/test';
import { ouvrirAppareilConnecte, lireTableLocale } from '../fixtures/appareil-connecte.js';
import { avecBase, uuidv7, vieillir } from '../banc/semis-serveur.js';

const PREFIXE = 's1-coupure';

const QUESTIONS = [
  'Comment une commande client est-elle enregistrée ?',
  'Qui contrôle la qualité avant expédition ?',
  'Quels documents sont archivés en fin de fabrication ?',
] as const;

/** Les ids semés côté siège, que le pull descend sur l'appareil. */
interface SiegeSeme {
  readonly uniteNom: string;
}

async function semerSiege(missionId: string): Promise<SiegeSeme> {
  const uniteNom = `Unité fictive ${uuidv7().slice(-8)}`;
  await avecBase(async (bd) => {
    const blocId = uuidv7();
    await bd.query(
      `INSERT INTO blocks (id, code, label_fr, position, is_default) VALUES ($1, $2, $3, 1, false)`,
      [blocId, `essai_${blocId.slice(-12)}`, `Bloc d'essai ${blocId.slice(-6)}`],
    );
    await bd.query(
      `INSERT INTO org_units (id, mission_id, kind, name, in_scope, status, created_at, updated_at)
       VALUES ($1, $2, 'service', $3, true, 'active', now(), now())`,
      [uuidv7(), missionId, uniteNom],
    );
    for (const [rang, texte] of QUESTIONS.entries()) {
      const questionId = uuidv7();
      await bd.query(
        `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                                created_at, updated_at)
         VALUES ($1, $2, 1, 'active', $3, 'free_text', 'banque', now(), now())`,
        [questionId, blocId, texte],
      );
      await bd.query(
        `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                        answer_type_snapshot, criticality_snapshot,
                                        allow_range_snapshot, position, added_ad_hoc)
         VALUES ($1, $2, $3, 1, $4, 'free_text', 'important', false, $5, false)`,
        [uuidv7(), missionId, questionId, texte, rang + 1],
      );
    }
  });
  // Le pull borne son curseur à now() - 60 s : on vieillit les lignes de la mission.
  await vieillir(missionId);
  return { uniteNom };
}

/** Rejoue un PREMIER pull complet : la descente du questionnaire n'a lieu qu'à celui-là. */
async function redescendreLaMission(page: Page, missionId: string): Promise<void> {
  await page.evaluate(async (cle: string) => {
    const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
      const demande = indexedDB.open('axion-terrain');
      demande.onsuccess = () => {
        resoudre(demande.result);
      };
      demande.onerror = () => {
        rejeter(demande.error ?? new Error('ouverture refusée'));
      };
    });
    const tx = base.transaction('meta', 'readwrite');
    tx.objectStore('meta').delete(cle);
    await new Promise<void>((resoudre, rejeter) => {
      tx.oncomplete = () => {
        resoudre();
      };
      tx.onerror = () => {
        rejeter(tx.error ?? new Error('transaction refusée'));
      };
    });
    base.close();
  }, `sync:since:${missionId}`);
  const attendu = page.waitForResponse(
    (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
    { timeout: 30_000 },
  );
  await declencherSync(page);
  expect((await attendu).status(), 'le pull complet doit rendre 200').toBe(200);
  await expect
    .poll(async () => (await lireTableLocale(page, 'missionQuestions')).length, {
      message: 'le questionnaire de la mission doit être descendu',
      timeout: 20_000,
    })
    .toBe(QUESTIONS.length);
}

/** Le déclencheur « retour du réseau » (05 §9.3) : pousse, puis tire. Jamais la minuterie. */
async function declencherSync(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
}

test('@critique scénario 1 — coupure réseau en pleine saisie : aucune perte, aucun doublon, file vidée', async () => {
  test.setTimeout(240_000);
  const appareil = await ouvrirAppareilConnecte(PREFIXE);
  const { page, contexte, mission, auditeur } = appareil;
  try {
    const siege = await semerSiege(mission.missionId);
    await redescendreLaMission(page, mission.missionId);

    // ── Une session d'entretien, planifiée puis démarrée (chemin de production) ──
    await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
    await page.getByRole('button', { name: /l’agenda/ }).click();
    await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
    await page.getByLabel('Nom de l’interlocuteur').fill('Interlocuteur coupure');
    await page.getByLabel('Fonction').fill('Responsable production');
    await page.getByLabel('Unité').selectOption({ label: siege.uniteNom });
    const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    await page.getByLabel('Créneau').fill(`${jour}T09:00`);
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page.getByText('Session planifiée.')).toBeVisible();
    await page.getByRole('button', { name: 'Revenir' }).click();
    await page.getByRole('button', { name: /Interlocuteur coupure/ }).click();
    await page.getByLabel('Accord de participation recueilli').check();
    await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();

    // ── Réponse 1, réseau présent ───────────────────────────────────────────
    const REPONSE_1 = 'Par téléphone, notée sur un carnet puis ressaisie le soir.';
    await expect(page.getByRole('heading', { name: QUESTIONS[0] })).toBeVisible();
    await page.getByLabel('Votre réponse').fill(REPONSE_1);
    await expect
      .poll(async () => (await lireTableLocale(page, 'answers')).length, { timeout: 20_000 })
      .toBe(1);

    // ── LA COUPURE, EN PLEINE SAISIE ────────────────────────────────────────
    await contexte.setOffline(true);

    await page.getByRole('button', { name: /^Suivant/ }).click();
    const REPONSE_2 = 'Le chef d’atelier, au poste de contrôle, avec une liste papier.';
    await expect(page.getByRole('heading', { name: QUESTIONS[1] })).toBeVisible();
    await page.getByLabel('Votre réponse').fill(REPONSE_2);
    await expect
      .poll(async () => (await lireTableLocale(page, 'answers')).length, {
        message: 'la saisie faite RÉSEAU COUPÉ doit être une ligne locale',
        timeout: 20_000,
      })
      .toBe(2);

    // Un push tenté réseau coupé échoue franchement et ne retire rien de la file.
    const echoue = page.waitForEvent('requestfailed', {
      predicate: (r: Request) => r.url().includes('/api/v1/sync/push'),
      timeout: 20_000,
    });
    await declencherSync(page);
    await echoue;

    const fileCoupee = await lireTableLocale(page, 'outbox');
    expect(
      fileCoupee.length,
      'la file garde ce que la coupure a empêché d’envoyer',
    ).toBeGreaterThan(0);
    expect(
      fileCoupee.every((ligne) => ligne.statut === 'en_attente'),
      'une coupure réseau n’est ni un rejet ni un « à examiner »',
    ).toBe(true);
    const reponse2Serveur = await avecBase((bd) =>
      bd.query(
        `SELECT 1 FROM answers a JOIN interviews i ON i.id = a.interview_id
          WHERE i.mission_id = $1 AND a.value::text LIKE $2`,
        [mission.missionId, `%Le chef d’atelier%`],
      ),
    );
    expect(reponse2Serveur.rows.length, 'la réponse 2 n’a pas pu atteindre le siège').toBe(0);

    // ── RETOUR DU RÉSEAU, PUIS PUSH COUPÉ EN VOL ────────────────────────────
    // La coupure en vol est posée AVANT le rétablissement : le navigateur émet lui-même
    // `online` au retour du réseau, et ce push-là doit être coupé comme les autres.
    let tentatives = 0;
    await page.route('**/api/v1/sync/push', async (route) => {
      tentatives += 1;
      await route.abort('connectionreset');
    });
    await contexte.setOffline(false);
    await declencherSync(page);
    await expect.poll(() => tentatives, { timeout: 20_000 }).toBeGreaterThan(0);
    const fileEnVol = await lireTableLocale(page, 'outbox');
    expect(fileEnVol.length, 'un push coupé en vol ne vide rien').toBe(fileCoupee.length);

    const opIdsAvant = fileEnVol.map((ligne) => String(ligne.opId));

    // ── RÉSEAU RÉTABLI : tout remonte ───────────────────────────────────────
    await page.unroute('**/api/v1/sync/push');
    const pousse = page.waitForResponse(
      (r) => r.url().includes('/api/v1/sync/push') && r.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await declencherSync(page);
    expect((await pousse).status(), 'le push du retour réseau rend 200').toBe(200);

    await expect
      .poll(async () => (await lireTableLocale(page, 'outbox')).length, {
        message: 'la file terrain doit être VIDÉE une fois le siège passé',
        timeout: 30_000,
      })
      .toBe(0);

    // Invariants CÔTÉ SERVEUR.
    const traitees = await avecBase((bd) =>
      bd.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM processed_ops WHERE op_id = ANY($1)`,
        [opIdsAvant],
      ),
    );
    expect(
      Number(traitees.rows[0]?.n),
      'chaque op de la file terrain est enregistrée UNE fois côté siège (aucune perte)',
    ).toBe(opIdsAvant.length);

    const reponses = await avecBase((bd) =>
      bd.query<{ mission_question_id: string; texte: string }>(
        `SELECT a.mission_question_id, a.value::text AS texte
           FROM answers a JOIN interviews i ON i.id = a.interview_id
          WHERE i.mission_id = $1 AND i.conducted_by = $2`,
        [mission.missionId, auditeur.id],
      ),
    );
    expect(reponses.rows.length, 'deux réponses côté siège, ni plus ni moins').toBe(2);
    expect(
      new Set(reponses.rows.map((r) => r.mission_question_id)).size,
      'aucun doublon : une ligne par question',
    ).toBe(2);
    const texte = reponses.rows.map((r) => r.texte).join('|');
    expect(texte).toContain('carnet');
    expect(texte).toContain('liste papier');

    const sessions = await avecBase((bd) =>
      bd.query(`SELECT 1 FROM interviews WHERE mission_id = $1`, [mission.missionId]),
    );
    expect(sessions.rows.length, 'une seule session côté siège').toBe(1);

    // Et rien n'a quitté l'appareil : la saisie reste lisible localement.
    expect((await lireTableLocale(page, 'answers')).length).toBe(2);
  } finally {
    await contexte.close();
  }
});
