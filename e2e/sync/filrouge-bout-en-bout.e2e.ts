// =============================================================================
// FIL ROUGE (09 §4bis) — SEGMENT « BOUT EN BOUT JUSQU'AU SIÈGE » (L6c-2, VRAIE API)
//
// `e2e/filrouge-l5.e2e.ts` garde son rôle : la journée de collecte 100 % hors ligne.
// Ce fichier le PROLONGE (il ne le réécrit pas) : la même journée — une réponse, une
// photo, un à-revoir — mais le réseau REVIENT, la file part vers la vraie API (Postgres,
// Redis, MinIO du banc), puis on prouve côté siège que tout est arrivé, et que l'écran
// de l'appareil le dit (pastille « Synchronisé »).
//
// Déterminisme : la saisie se fait réseau coupé (aucune minuterie ne peut pousser un lot
// partiel) ; la sync est déclenchée par l'événement `online`, jamais par la cadence ;
// `vieillir` précède le premier pull (il borne son curseur à now() - 60 s).
//
// Limite assumée (11 §7) : les service workers iOS ne sont PAS couverts par Playwright —
// le mode avion RÉEL sur iPad se rejoue à la main aux portes P-C/P-E.
// Invariant 2 : mission, unité et questions FICTIVES, jouées sur FIL-TPE (fixture du banc)
// et FIL-GC (les ids de mission du banc sont neufs à chaque passage).
// =============================================================================
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ouvrirAppareilConnecte, lireTableLocale } from '../fixtures/appareil-connecte.js';
import { avecBase, uuidv7, vieillir } from '../banc/semis-serveur.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Deux missions fictives : la même journée doit se jouer sur chacune (FIL-TPE, FIL-GC). */
const PARCOURS = [
  {
    nom: 'FIL-TPE',
    prefixe: 'fil-tpe-bout-en-bout',
    unite: 'Atelier fictif TPE',
    question: 'Comment une commande client est-elle enregistrée ?',
    reponse: 'Par téléphone, notée sur un carnet.',
  },
  {
    nom: 'FIL-GC',
    prefixe: 'fil-gc-bout-en-bout',
    unite: 'Direction des achats fictive',
    question: 'Quel circuit valide un achat supérieur au seuil de délégation ?',
    reponse: 'Validation du directeur financier puis du comité.',
  },
] as const;

const MOTIF = 'à confirmer avec le responsable des accès';

/** Un vrai PNG de 1 pixel : le décodeur de production le lit. */
const PNG_UN_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function semerSiege(missionId: string, unite: string, question: string): Promise<void> {
  await avecBase(async (bd) => {
    const blocId = uuidv7();
    await bd.query(
      `INSERT INTO blocks (id, code, label_fr, position, is_default) VALUES ($1, $2, $3, 1, false)`,
      [blocId, `essai_${blocId.slice(-12)}`, `Bloc d'essai ${blocId.slice(-6)}`],
    );
    await bd.query(
      `INSERT INTO org_units (id, mission_id, kind, name, in_scope, status, created_at, updated_at)
       VALUES ($1, $2, 'service', $3, true, 'active', now(), now())`,
      [uuidv7(), missionId, unite],
    );
    const questionId = uuidv7();
    await bd.query(
      `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                              created_at, updated_at)
       VALUES ($1, $2, 1, 'active', $3, 'free_text', 'banque', now(), now())`,
      [questionId, blocId, question],
    );
    await bd.query(
      `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                      answer_type_snapshot, criticality_snapshot,
                                      allow_range_snapshot, position, added_ad_hoc)
       VALUES ($1, $2, $3, 1, $4, 'free_text', 'important', false, 1, false)`,
      [uuidv7(), missionId, questionId, question],
    );
  });
  await vieillir(missionId);
}

/** Le déclencheur « retour du réseau » (05 §9.3) : pousse, puis tire. Jamais la minuterie. */
async function declencherSync(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
}

/** Le premier pull complet : la descente du questionnaire n'a lieu qu'à celui-là. */
async function descendreLaMission(page: Page, missionId: string): Promise<void> {
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
    .toBe(1);
}

interface ClientMinio {
  getObject(bucket: string, cle: string): Promise<AsyncIterable<Buffer>>;
}

function clientMinio(): ClientMinio {
  const requireApi = createRequire(resolve(RACINE, 'apps', 'api', 'package.json'));
  const { Client } = requireApi('minio') as { Client: new (options: object) => ClientMinio };
  const variable = (nom: string): string => {
    const valeur = process.env[nom];
    if (valeur === undefined || valeur === '') throw new Error(`${nom} absente : banc non démarré`);
    return valeur;
  };
  return new Client({
    endPoint: variable('MINIO_ENDPOINT'),
    port: Number(variable('MINIO_PORT')),
    useSSL: false,
    accessKey: variable('MINIO_ACCESS_KEY'),
    secretKey: variable('MINIO_SECRET_KEY'),
  });
}

async function empreinteObjet(cle: string): Promise<{ sha256: string; taille: number }> {
  const hachage = createHash('sha256');
  let taille = 0;
  for await (const morceau of await clientMinio().getObject(
    process.env.MINIO_BUCKET_ATTACHMENTS ?? '',
    cle,
  )) {
    hachage.update(morceau);
    taille += morceau.byteLength;
  }
  return { sha256: hachage.digest('hex'), taille };
}

for (const parcours of PARCOURS) {
  test(`@filrouge @critique bout en bout (${parcours.nom}) — journée hors ligne, retour du réseau, tout est au siège, la pastille le dit`, async () => {
    test.setTimeout(300_000);
    const appareil = await ouvrirAppareilConnecte(parcours.prefixe);
    const { page, contexte, mission } = appareil;
    try {
      await semerSiege(mission.missionId, parcours.unite, parcours.question);
      await descendreLaMission(page, mission.missionId);

      // ── LA JOURNÉE, RÉSEAU COUPÉ ────────────────────────────────────────────
      await contexte.setOffline(true);
      await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
      await page.getByRole('button', { name: /l’agenda/ }).click();
      await page.getByLabel('Type de session').selectOption({ label: 'Entretien' });
      await page.getByLabel('Nom de l’interlocuteur').fill(`Interlocuteur ${parcours.nom}`);
      await page.getByLabel('Fonction').fill('Responsable');
      await page.getByLabel('Unité').selectOption({ label: parcours.unite });
      const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      await page.getByLabel('Créneau').fill(`${jour}T09:00`);
      await page.getByRole('button', { name: 'Planifier' }).click();
      await expect(page.getByText('Session planifiée.')).toBeVisible();
      await page.getByRole('button', { name: 'Revenir' }).click();
      await page.getByRole('button', { name: new RegExp(`Interlocuteur ${parcours.nom}`) }).click();
      await page.getByLabel('Accord de participation recueilli').check();
      await page.getByRole('button', { name: 'Démarrer l’entretien' }).click();

      await expect(page.getByRole('heading', { name: parcours.question })).toBeVisible();
      await page.getByLabel('Votre réponse').fill(parcours.reponse);
      await expect
        .poll(async () => (await lireTableLocale(page, 'answers')).length, { timeout: 20_000 })
        .toBe(1);

      // La photo : un vrai PNG, recompressé par la pile de production, chiffré en local.
      await page
        .locator('label.axn-photo__declencheur')
        .filter({ hasText: /^Ajouter une photo$/ })
        .first()
        .locator('input[type="file"]')
        .setInputFiles({
          name: 'photo-bout-en-bout.png',
          mimeType: 'image/png',
          buffer: PNG_UN_PIXEL,
        });
      await expect(page.getByText('Photo enregistrée sur cet appareil.')).toBeVisible({
        timeout: 60_000,
      });

      // L'à-revoir : une zone d'ombre posée avant de partir.
      await page.getByRole('button', { name: /^À revoir/ }).click();
      await page.getByLabel(/^Motif/).fill(MOTIF);
      await page.getByRole('button', { name: 'Confirmer' }).click();
      await expect(page.getByLabel('États de la réponse').getByText(/^À revoir — /)).toContainText(
        MOTIF,
      );

      const opIds = (await lireTableLocale(page, 'outbox')).map((l) => String(l.opId));
      expect(opIds.length, 'session + réponse + pièce + à-revoir en file').toBeGreaterThanOrEqual(
        3,
      );
      expect((await lireTableLocale(page, 'attachments')).length, 'la pièce est locale').toBe(1);

      // ── LE RÉSEAU REVIENT : la file part vers la VRAIE API ───────────────────
      const verdicts: string[] = [];
      page.on('response', (reponse) => {
        if (reponse.url().includes('/api/v1/sync/push') && reponse.request().method() === 'POST') {
          void reponse
            .json()
            .then((c: { results?: { result: string }[] }) => {
              verdicts.push(...(c.results ?? []).map((r) => r.result));
            })
            .catch(() => undefined);
        }
      });
      const termine = page.waitForResponse(
        (r) => /\/sync\/attachments\/[0-9a-f-]+\/complete$/.test(r.url()) && r.status() === 200,
        { timeout: 120_000 },
      );
      await contexte.setOffline(false);
      await declencherSync(page);
      await termine;
      await expect
        .poll(async () => (await lireTableLocale(page, 'outbox')).length, {
          message: 'la file du terrain doit se vider',
          timeout: 60_000,
        })
        .toBe(0);

      // ── PREUVE CÔTÉ SIÈGE ───────────────────────────────────────────────────
      const reponses = await avecBase((bd) =>
        bd.query<{ value: unknown; flag_review: boolean; review_reason: string | null }>(
          `SELECT a.value, a.flag_review, a.review_reason
             FROM answers a JOIN interviews i ON i.id = a.interview_id
            WHERE i.mission_id = $1`,
          [mission.missionId],
        ),
      );
      expect(reponses.rows, 'une seule réponse au siège').toHaveLength(1);
      expect(JSON.stringify(reponses.rows[0]?.value)).toContain(parcours.reponse);
      expect(reponses.rows[0]?.flag_review, 'l’à-revoir est arrivé').toBe(true);
      expect(reponses.rows[0]?.review_reason).toBe(MOTIF);

      const traitees = await avecBase((bd) =>
        bd.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM processed_ops WHERE op_id = ANY($1)`,
          [opIds],
        ),
      );
      expect(Number(traitees.rows[0]?.n), 'chaque op de la file est tracée au siège').toBe(
        opIds.length,
      );
      expect(verdicts.length, 'le siège a répondu pour chaque op').toBeGreaterThanOrEqual(
        opIds.length,
      );
      expect(
        verdicts.filter((v) => v !== 'applied' && v !== 'duplicate'),
        'aucune op rejetée (ni autre verdict que applied/duplicate)',
      ).toEqual([]);

      const piece = await avecBase((bd) =>
        bd.query<{ id: string; storage_key: string | null; size_bytes: string | null }>(
          `SELECT id, storage_key, size_bytes::text FROM attachments
            WHERE mission_id = $1 AND kind = 'photo'`,
          [mission.missionId],
        ),
      );
      expect(piece.rows, 'une seule pièce photo au siège').toHaveLength(1);
      const ligne = piece.rows[0];
      expect(ligne?.storage_key, 'clé de stockage définitive après assemblage').toBe(
        `pieces/${mission.missionId}/${ligne?.id ?? ''}`,
      );
      const objet = await empreinteObjet(ligne?.storage_key ?? '');
      expect(objet.taille, 'l’objet assemblé dans MinIO n’est pas vide').toBeGreaterThan(0);
      expect(String(objet.taille), 'taille de l’objet = taille déclarée').toBe(ligne?.size_bytes);
      const envoi = await avecBase((bd) =>
        bd.query<{ statut: string }>(
          'SELECT statut FROM attachment_uploads WHERE attachment_id = $1',
          [ligne?.id],
        ),
      );
      expect(envoi.rows[0]?.statut, 'l’envoi est « assemble »').toBe('assemble');

      // ── PULL : l'écran de l'appareil dit l'état synchronisé ─────────────────
      await vieillir(mission.missionId);
      const pull = page.waitForResponse(
        (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
        { timeout: 30_000 },
      );
      await declencherSync(page);
      expect((await pull).status(), 'pull de clôture').toBe(200);
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: /^Synchronisé$/ })
          .first(),
        'la pastille de la coquille annonce « Synchronisé »',
      ).toBeVisible({ timeout: 30_000 });
      expect((await lireTableLocale(page, 'answers')).length, 'rien n’a quitté l’appareil').toBe(1);
    } finally {
      await contexte.close();
    }
  });
}
