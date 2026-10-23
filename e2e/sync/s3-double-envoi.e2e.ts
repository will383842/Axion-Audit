// =============================================================================
// 05 §9.8 — SCÉNARIO 3 : DOUBLE ENVOI DU MÊME LOT (E2E, VRAIE API)
//
// Ce que ce fichier prouve : un lot envoyé deux fois (réponse perdue, le terrain
// renvoie, puis rejeu 3× du même corps) produit EXACTEMENT le même état que s'il
// n'avait été envoyé qu'une fois : aucun doublon, aucune valeur modifiée, aucune
// révision fantôme, une trace d'idempotence (processed_ops) par op, et la file du
// terrain se vide sur la réponse « duplicate ».
//
// Déterminisme : la saisie se fait réseau coupé (aucune minuterie ne peut pousser un
// lot partiel) ; la perte de réponse est un page.route (fetch réel puis abort) ;
// la sync est déclenchée par l'événement online, jamais par la cadence de 30 s.
//
// Limite assumée (11 §7) : les service workers iOS ne sont PAS couverts par
// Playwright — le mode avion RÉEL sur iPad se rejoue à la main aux portes P-C/P-E.
//
// Invariant 2 : mission, entreprise et questions FICTIVES.
// =============================================================================
import { expect, test, type Page } from '@playwright/test';
import { ouvrirAppareilConnecte, lireTableLocale } from '../fixtures/appareil-connecte.js';
import { avecBase, jetonAcces, urlApi, uuidv7, vieillir } from '../banc/semis-serveur.js';

const PREFIXE = 's3-double-envoi';

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

/** Un lot vu passer sur le fil : ses ops, ce que le siège a répondu. */
interface LotVu {
  readonly corps: string;
  readonly opIds: readonly string[];
  readonly statut: number;
  readonly resultats: readonly string[];
}

/** Photographie de l'état du siège pour la mission : ce que le rejeu ne doit PAS changer. */
async function etatSiege(missionId: string): Promise<string> {
  return avecBase(async (bd) => {
    const interviews = await bd.query(
      `SELECT id, status, general_notes, client_updated_at, updated_at
         FROM interviews WHERE mission_id = $1 ORDER BY id`,
      [missionId],
    );
    const answers = await bd.query(
      `SELECT a.id, a.mission_question_id, a.value, a.client_updated_at, a.updated_at
         FROM answers a JOIN interviews i ON i.id = a.interview_id
        WHERE i.mission_id = $1 ORDER BY a.id`,
      [missionId],
    );
    const revisions = await bd.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM answer_revisions r
         JOIN answers a ON a.id = r.answer_id JOIN interviews i ON i.id = a.interview_id
        WHERE i.mission_id = $1`,
      [missionId],
    );
    return JSON.stringify({
      interviews: interviews.rows,
      answers: answers.rows,
      revisions: revisions.rows[0]?.n,
    });
  });
}

test('@critique scénario 3 — double envoi du même lot : réponse perdue puis renvoi, puis rejeu 3×, état identique', async () => {
  test.setTimeout(240_000);
  const appareil = await ouvrirAppareilConnecte(PREFIXE);
  const { page, contexte, mission, auditeur } = appareil;
  try {
    const siege = await semerSiege(mission.missionId);
    await redescendreLaMission(page, mission.missionId);

    // ── La saisie se fait RÉSEAU COUPÉ : aucune minuterie ne peut pousser un lot partiel ──
    await contexte.setOffline(true);
    await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
    await page.getByRole('button', { name: /l’agenda/ }).click();
    await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
    await page.getByLabel('Nom de l’interlocuteur').fill('Interlocuteur double envoi');
    await page.getByLabel('Fonction').fill('Responsable production');
    await page.getByLabel('Unité').selectOption({ label: siege.uniteNom });
    const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    await page.getByLabel('Créneau').fill(`${jour}T09:00`);
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page.getByText('Session planifiée.')).toBeVisible();
    await page.getByRole('button', { name: 'Revenir' }).click();
    await page.getByRole('button', { name: /Interlocuteur double envoi/ }).click();
    await page.getByLabel('Accord de participation recueilli').check();
    await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();

    await expect(page.getByRole('heading', { name: QUESTIONS[0] })).toBeVisible();
    await page.getByLabel('Votre réponse').fill('Par téléphone, notée sur un carnet.');
    await expect
      .poll(async () => (await lireTableLocale(page, 'answers')).length, { timeout: 20_000 })
      .toBe(1);
    await page.getByRole('button', { name: /^Suivant/ }).click();
    await expect(page.getByRole('heading', { name: QUESTIONS[1] })).toBeVisible();
    await page.getByLabel('Votre réponse').fill('Le chef d’atelier, avec une liste papier.');
    await expect
      .poll(async () => (await lireTableLocale(page, 'answers')).length, { timeout: 20_000 })
      .toBe(2);

    const fileInitiale = await lireTableLocale(page, 'outbox');
    const opIdsFile = fileInitiale.map((ligne) => String(ligne.opId));
    expect(opIdsFile.length, 'session + 2 réponses en file').toBeGreaterThanOrEqual(3);

    // ── PREMIER ENVOI : le siège APPLIQUE, mais la RÉPONSE SE PERD ───────────
    // `route.fetch()` livre réellement le lot à l'API ; `abort()` fait croire au
    // terrain qu'il n'a rien reçu. C'est le cas qui produit un double envoi réel.
    const lots: LotVu[] = [];
    let reponsePerdue = false;
    // Les envois SUIVANTS attendent ici : le navigateur émet lui-même `online` au retour du
    // réseau, et le renvoi ne doit partir qu'une fois le premier état constaté.
    let liberer: () => void = () => undefined;
    const feuVert = new Promise<void>((resoudre) => {
      liberer = resoudre;
    });
    await page.route('**/api/v1/sync/push', async (route) => {
      if (reponsePerdue) await feuVert;
      const corps = route.request().postData() ?? '';
      const lu = JSON.parse(corps) as { operations: { opId: string }[] };
      const reponse = await route.fetch();
      const texte = await reponse.text();
      let resultats: string[] = [];
      try {
        resultats = (JSON.parse(texte) as { results: { result: string }[] }).results.map(
          (x) => x.result,
        );
      } catch {
        // corps non JSON : `resultats` reste vide, l'assertion du test le dira.
      }
      lots.push({
        corps,
        opIds: lu.operations.map((o) => o.opId),
        statut: reponse.status(),
        resultats,
      });
      if (!reponsePerdue && lu.operations.length >= opIdsFile.length) {
        reponsePerdue = true;
        await route.abort('connectionreset');
        return;
      }
      await route.fulfill({ response: reponse, body: texte });
    });
    await contexte.setOffline(false);
    await declencherSync(page);
    await expect.poll(() => reponsePerdue, { timeout: 30_000 }).toBe(true);

    const premier = lots[0];
    if (premier === undefined) throw new Error('aucun lot observé');
    expect(premier.statut).toBe(200);
    expect(
      premier.resultats.every((r) => r === 'applied'),
      'le siège a APPLIQUÉ chaque op du premier envoi',
    ).toBe(true);
    expect(
      (await lireTableLocale(page, 'outbox')).length,
      'le terrain n’a pas vu la réponse : il garde la file entière',
    ).toBe(opIdsFile.length);
    const apresPremier = await etatSiege(mission.missionId);
    expect(
      (JSON.parse(apresPremier) as { answers: unknown[] }).answers,
      'les deux réponses sont déjà au siège',
    ).toHaveLength(2);

    // ── SECOND ENVOI : le terrain renvoie LE MÊME lot ───────────────────────
    const nPremiers = lots.length;
    liberer();
    await declencherSync(page);
    await expect.poll(() => lots.length, { timeout: 30_000 }).toBeGreaterThan(nPremiers);
    const second = lots[nPremiers];
    if (second === undefined) throw new Error('aucun second lot observé');
    expect(second.opIds, 'le renvoi porte EXACTEMENT les mêmes opId (idempotence 11 §4)').toEqual(
      premier.opIds,
    );
    expect(second.statut).toBe(200);
    expect(
      second.resultats.every((r) => r === 'duplicate'),
      'le siège répond « duplicate » à chaque op rejouée',
    ).toBe(true);
    await expect
      .poll(async () => (await lireTableLocale(page, 'outbox')).length, {
        message: 'la réponse « duplicate » vide la file terrain',
        timeout: 30_000,
      })
      .toBe(0);
    expect(await etatSiege(mission.missionId), 'le double envoi ne change RIEN côté siège').toBe(
      apresPremier,
    );

    // ── REJEU 3× du lot capturé, directement sur l'API : état identique ─────
    const jeton = jetonAcces(auditeur.id);
    for (let rejeu = 1; rejeu <= 3; rejeu += 1) {
      const reponse = await fetch(`${urlApi()}/v1/sync/push`, {
        method: 'POST',
        headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
        body: premier.corps,
      });
      expect(reponse.status, `rejeu ${String(rejeu)} : 200`).toBe(200);
      const corps = (await reponse.json()) as { results: { result: string }[] };
      expect(
        corps.results.map((x) => x.result),
        `rejeu ${String(rejeu)} : tout est « duplicate »`,
      ).toEqual(premier.opIds.map(() => 'duplicate'));
    }
    expect(
      await etatSiege(mission.missionId),
      '3 rejeux : état du siège strictement identique',
    ).toBe(apresPremier);

    const traitees = await avecBase((bd) =>
      bd.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM processed_ops WHERE op_id = ANY($1)`,
        [opIdsFile],
      ),
    );
    expect(Number(traitees.rows[0]?.n), 'une trace d’idempotence par op, jamais plus').toBe(
      opIdsFile.length,
    );
    expect((await lireTableLocale(page, 'answers')).length, 'rien n’a quitté l’appareil').toBe(2);
  } finally {
    await contexte.close();
  }
});
