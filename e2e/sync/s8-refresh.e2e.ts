// =============================================================================
// 05 §9.8 — SCÉNARIO 8 : EXPIRATION DU REFRESH TOKEN EN MISSION LONGUE (§31.3)
// (E2E, VRAIE API)
//
// Trois épreuves, indépendantes (trois appareils, trois comptes) :
//   (a) accès mort + refresh valide : rotation silencieuse, tout remonte ;
//   (b) refresh EXPIRÉ : la collecte continue, rien n'est perdu ni rejeté, le message
//       « Reconnexion requise » est dit, aucune boucle sur /v1/auth ;
//   (c) la reconnexion existe et TOUT remonte ensuite.
//
// L'expiration est posée par SQL sur refresh_tokens.expires_at : aucun réglage de
// production. Le jeton d'accès (mémoire seule) est oublié en rechargeant l'application.
// Déclenchement par l'événement online, jamais par la cadence de 30 s.
//
// Limite assumée (11 §7) : les service workers iOS ne sont PAS couverts par
// Playwright — le mode avion RÉEL sur iPad se rejoue à la main aux portes P-C/P-E.
//
// Invariant 2 : mission, entreprise et questions FICTIVES.
// =============================================================================
import { expect, test, type Page } from '@playwright/test';
import {
  MOT_DE_PASSE_APPAREIL_CONNECTE,
  ouvrirAppareilConnecte,
  lireTableLocale,
} from '../fixtures/appareil-connecte.js';
import { deverrouillerAppareil } from '../fixtures/appareil-terrain.js';
import { avecBase, uuidv7, vieillir } from '../banc/semis-serveur.js';

const PREFIXE = 's8-refresh';

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

/** Ouvre l'entretien sur la première question, depuis l'écran « Appareil rattaché ». */
async function ouvrirEntretien(page: Page, uniteNom: string, interlocuteur: string): Promise<void> {
  await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
  await page.getByRole('button', { name: /l’agenda/ }).click();
  await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
  await page.getByLabel('Nom de l’interlocuteur').fill(interlocuteur);
  await page.getByLabel('Fonction').fill('Responsable production');
  await page.getByLabel('Unité').selectOption({ label: uniteNom });
  const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  await page.getByLabel('Créneau').fill(`${jour}T09:00`);
  await page.getByRole('button', { name: 'Planifier' }).click();
  await expect(page.getByText('Session planifiée.')).toBeVisible();
  await page.getByRole('button', { name: 'Revenir' }).click();
  await page.getByRole('button', { name: new RegExp(interlocuteur) }).click();
  await page.getByLabel('Accord de participation recueilli').check();
  await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();
  await expect(page.getByRole('heading', { name: QUESTIONS[0] })).toBeVisible();
}

/** Saisit la réponse de la question affichée et attend LA LIGNE locale (jamais l'indicateur). */
async function saisir(page: Page, texte: string, lignesAttendues: number): Promise<void> {
  await page.getByLabel('Votre réponse').fill(texte);
  await expect
    .poll(async () => (await lireTableLocale(page, 'answers')).length, {
      message: 'la réponse doit être une ligne locale',
      timeout: 20_000,
    })
    .toBe(lignesAttendues);
}

/** Le jeton d'ACCÈS ne vit qu'en mémoire (11 §3) : recharger l'application l'oublie. */
async function oublierLeJetonDAcces(page: Page): Promise<void> {
  await page.reload();
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL_CONNECTE);
}

async function opIdsEnFile(page: Page): Promise<string[]> {
  return (await lireTableLocale(page, 'outbox')).map((ligne) => String(ligne.opId));
}

async function nombreDeTraitees(opIds: readonly string[]): Promise<number> {
  const r = await avecBase((bd) =>
    bd.query<{ n: string }>(`SELECT count(*)::text AS n FROM processed_ops WHERE op_id = ANY($1)`, [
      opIds,
    ]),
  );
  return Number(r.rows[0]?.n);
}

test('@critique scénario 8 (a) — accès expiré, refresh valide : rotation silencieuse, tout remonte', async () => {
  test.setTimeout(240_000);
  const appareil = await ouvrirAppareilConnecte(`${PREFIXE}-rotation`);
  const { page, contexte, mission, auditeur } = appareil;
  try {
    const siege = await semerSiege(mission.missionId);
    await redescendreLaMission(page, mission.missionId);
    await ouvrirEntretien(page, siege.uniteNom, 'Interlocuteur rotation');
    await saisir(page, 'Par téléphone, notée sur un carnet.', 1);

    // « Mission longue » : le jeton d'accès (15 min) est mort, l'application est rouverte.
    await oublierLeJetonDAcces(page);
    await expect(page.getByRole('heading', { name: QUESTIONS[0] })).toBeVisible();
    await page.getByRole('button', { name: /^Suivant/ }).click();
    await expect(page.getByRole('heading', { name: QUESTIONS[1] })).toBeVisible();
    await saisir(page, 'Le chef d’atelier, avec une liste papier.', 2);

    const avant = await opIdsEnFile(page);
    const refresh = page.waitForResponse(
      (r) => r.url().includes('/api/v1/auth/refresh') && r.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await declencherSync(page);
    expect((await refresh).status(), 'le refresh valide est accepté').toBe(200);

    await expect
      .poll(async () => (await lireTableLocale(page, 'outbox')).length, {
        message: 'la file terrain doit être vidée après la rotation',
        timeout: 30_000,
      })
      .toBe(0);
    expect(await nombreDeTraitees(avant), 'chaque op en file est au siège, une fois').toBe(
      avant.length,
    );

    const jetons = await avecBase((bd) =>
      bd.query<{ revoque: boolean }>(
        `SELECT (revoked_at IS NOT NULL) AS revoque FROM refresh_tokens WHERE user_id = $1`,
        [auditeur.id],
      ),
    );
    expect(
      jetons.rows.filter((j) => j.revoque).length,
      'l’ancien refresh est révoqué (rotation, 11 §3)',
    ).toBeGreaterThanOrEqual(1);
    expect(jetons.rows.filter((j) => !j.revoque).length, 'un seul refresh actif').toBe(1);

    const reponses = await avecBase((bd) =>
      bd.query(
        `SELECT 1 FROM answers a JOIN interviews i ON i.id = a.interview_id WHERE i.mission_id = $1`,
        [mission.missionId],
      ),
    );
    expect(reponses.rows.length, 'les deux réponses sont au siège, sans doublon').toBe(2);
  } finally {
    await contexte.close();
  }
});

/**
 * Mène l'appareil jusqu'à l'état « refresh expiré » : deux réponses saisies, la
 * première éventuellement déjà remontée, le refresh expiré PAR SQL (`expires_at`,
 * aucun réglage en production), l'accès oublié, une troisième réponse en file, puis
 * UNE tentative de sync qui se heurte au 401 du refresh.
 */
async function jusquAuRefreshExpire(
  page: Page,
  auditeurId: string,
  uniteNom: string,
  interlocuteur: string,
): Promise<{ readonly opIdsBloques: string[] }> {
  await ouvrirEntretien(page, uniteNom, interlocuteur);
  await saisir(page, 'Par téléphone, notée sur un carnet.', 1);
  await page.getByRole('button', { name: /^Suivant/ }).click();
  await expect(page.getByRole('heading', { name: QUESTIONS[1] })).toBeVisible();
  await saisir(page, 'Le chef d’atelier, avec une liste papier.', 2);

  // Le temps passe : le refresh de 30 jours expire (posé par SQL, comme le ferait l'horloge).
  const expires = await avecBase((bd) =>
    bd.query(
      `UPDATE refresh_tokens SET expires_at = now() - interval '1 hour'
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [auditeurId],
    ),
  );
  expect(expires.rowCount, 'un refresh actif a bien été expiré').toBeGreaterThanOrEqual(1);

  await oublierLeJetonDAcces(page);
  await expect(page.getByRole('heading', { name: QUESTIONS[1] })).toBeVisible();
  await page.getByRole('button', { name: /^Suivant/ }).click();
  await expect(page.getByRole('heading', { name: QUESTIONS[2] })).toBeVisible();
  await saisir(page, 'Le dossier de lot est classé en armoire, trois ans.', 3);

  // Ce qui restera bloqué : tout ce qui est en file À CET INSTANT et pas encore au siège.
  const enFile = await opIdsEnFile(page);
  const refresh = page.waitForResponse(
    (r) => r.url().includes('/api/v1/auth/refresh') && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await declencherSync(page);
  expect((await refresh).status(), 'le siège refuse le refresh expiré').toBe(401);
  return { opIdsBloques: enFile };
}

test('@critique scénario 8 (b) — refresh expiré en mission longue : la collecte continue, rien n’est perdu, seule la sync attend', async () => {
  test.setTimeout(240_000);
  const appareil = await ouvrirAppareilConnecte(`${PREFIXE}-expire`);
  const { page, contexte, mission, auditeur } = appareil;
  try {
    const siege = await semerSiege(mission.missionId);
    await redescendreLaMission(page, mission.missionId);
    const { opIdsBloques } = await jusquAuRefreshExpire(
      page,
      auditeur.id,
      siege.uniteNom,
      'Interlocuteur expire',
    );

    // Rien n'est parti, rien n'a été retiré ni rejeté.
    const file = await lireTableLocale(page, 'outbox');
    expect(file.length, 'la file garde tout').toBeGreaterThan(0);
    expect(
      file.every((ligne) => ligne.statut === 'en_attente'),
      'un refresh expiré n’est ni un rejet ni un « à examiner » (rien n’est jeté)',
    ).toBe(true);
    expect(
      await nombreDeTraitees(file.map((ligne) => String(ligne.opId))),
      'aucune op restée en file n’a atteint le siège',
    ).toBe(0);
    expect(
      (await lireTableLocale(page, 'meta')).some((ligne) => ligne.cle === 'auth:refresh'),
      'le refresh refusé par le siège est effacé de l’appareil (pas de martèlement de /auth)',
    ).toBe(false);

    // La collecte continue SANS interruption (05 §31-3) : la saisie suivante s'écrit.
    expect(opIdsBloques.length).toBeGreaterThan(0);
    await page
      .getByLabel('Votre réponse')
      .fill('Le dossier de lot est classé en armoire, cinq ans.');
    await expect(page.getByLabel('Votre réponse')).toHaveValue(/cinq ans/);
    await expect(page.getByText(/Enregistré à/)).toBeVisible({ timeout: 15_000 });
    expect(
      (await lireTableLocale(page, 'answers')).length,
      'les trois réponses restent locales',
    ).toBe(3);

    // Un second essai ne martèle pas /v1/auth : plus de refresh à présenter.
    let refreshRetentes = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/auth/refresh')) refreshRetentes += 1;
    });
    await declencherSync(page);
    await expect
      .poll(async () => (await lireTableLocale(page, 'outbox')).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(refreshRetentes, 'aucun nouveau refresh n’est tenté avec un jeton effacé').toBe(0);
  } finally {
    await contexte.close();
  }
});

test('@critique scénario 8 (c) — refresh expiré : le message « reconnexion requise » (05 §31-3) est dit à l’auditeur', async () => {
  test.setTimeout(240_000);
  const appareil = await ouvrirAppareilConnecte(`${PREFIXE}-message`);
  const { page, contexte, mission, auditeur } = appareil;
  try {
    const siege = await semerSiege(mission.missionId);
    await redescendreLaMission(page, mission.missionId);
    await jusquAuRefreshExpire(page, auditeur.id, siege.uniteNom, 'Interlocuteur message');

    // Au déverrouillage suivant (le lendemain, la tablette rouverte), l'auditeur doit
    // lire que seule la synchronisation attend — sans avoir à deviner depuis une pastille.
    await oublierLeJetonDAcces(page);
    await expect(
      page.getByText(/Reconnexion requise/).first(),
      'le message de 05 §31-3 doit être lisible à l’écran après déverrouillage',
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await contexte.close();
  }
});

test('@critique scénario 8 (d) — après expiration du refresh, l’auditeur peut se reconnecter et TOUT remonte', async () => {
  test.setTimeout(240_000);
  const appareil = await ouvrirAppareilConnecte(`${PREFIXE}-reconnexion`);
  const { page, contexte, mission, auditeur } = appareil;
  try {
    const siege = await semerSiege(mission.missionId);
    await redescendreLaMission(page, mission.missionId);
    await jusquAuRefreshExpire(page, auditeur.id, siege.uniteNom, 'Interlocuteur retour');
    const enFile = await opIdsEnFile(page);
    expect(enFile.length).toBeGreaterThan(0);

    // 05 §31-3 : « seule la synchronisation attend une reconnexion ». Il doit donc
    // EXISTER un geste de reconnexion, sur l'appareil déjà rattaché.
    await oublierLeJetonDAcces(page);
    const geste = page.getByRole('button', {
      name: /Se reconnecter|Reconnecter|Rattacher cet appareil/,
    });
    await expect(
      geste.first(),
      'aucun geste de reconnexion n’est offert à un appareil déjà rattaché dont le refresh a expiré',
    ).toBeVisible({ timeout: 10_000 });
    await geste.first().click();
    await page.getByLabel(/^Adresse de votre compte/).fill(auditeur.courriel);
    await page.getByLabel(/^Mot de passe du compte/).fill(auditeur.motDePasse);
    await page
      .getByRole('button', { name: /Se reconnecter|Reconnecter|Rattacher cet appareil/ })
      .click();

    await declencherSync(page);
    await expect
      .poll(async () => (await lireTableLocale(page, 'outbox')).length, {
        message: 'la file doit se vider après la reconnexion',
        timeout: 30_000,
      })
      .toBe(0);
    expect(await nombreDeTraitees(enFile), 'tout ce qui attendait est au siège').toBe(
      enFile.length,
    );
  } finally {
    await contexte.close();
  }
});
