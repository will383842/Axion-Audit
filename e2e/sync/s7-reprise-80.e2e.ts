// =============================================================================
// SCÉNARIO 7 DU 05 §9.8 — REPRISE D'UN UPLOAD INTERROMPU À 80 % (L6c-2, groupe C)
//
// Une photo de 5 morceaux (5 Mio chacun, 05 §9.6) est capturée HORS LIGNE sur la vraie
// appli, puis envoyée à la VRAIE API (stockage MinIO réel). Le morceau n° ⌈0,8·n⌉ — le
// 4e — est coupé par `page.route` (connexion réinitialisée) : le siège n'a que 0, 1, 2.
// Le réseau revient, la reprise est déclenchée, et le test prouve :
//   1. à l'échec, le siège a reçu EXACTEMENT 0, 1, 2 et l'envoi reste « en_cours » ;
//   2. la reprise ne réémet AUCUN morceau déjà reçu — seuls 3 et 4 repartent
//      (`GET status` d'abord, 05 §9.6 : « la reprise n'envoie QUE les manquants ») ;
//   3. l'objet assemblé dans MinIO a la taille ET le sha256 de la photo d'origine
//      (calculé ici, hors du code de production) ; l'envoi passe « assemble ».
//
// DÉCLENCHEUR : pas de bouton « Synchroniser maintenant » dédié dans cette version ;
// le geste manuel du port est atteint par le retour du réseau (`online`, 05 §9.3).
// BORNE DU PULL : le semis est « vieilli » avant le premier pull (`vieillir`).
//
// Limite assumée (11 §7) : `context.setOffline` couvre le réseau ; les service workers
// iOS ne sont PAS couverts par Playwright (mode avion réel : à la main, P-C/P-E).
// Invariant 2 : mission et interlocuteur FICTIFS. Secrets factices.
// =============================================================================
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
} from '../../apps/field/src/local/coffre.js';
import { versBase64 } from '../../apps/field/src/local/enveloppe.js';
import type { ChargeMission, IndexMission } from '../../apps/field/src/local/formes.js';
import {
  deverrouillerAppareil,
  lireTableLocale,
  ouvrirProfilSurDisque,
  planterAppareil,
  type GrainesAppareil,
} from '../fixtures/appareil-terrain.js';
import {
  avecBase,
  creerAuditeur,
  creerMission,
  ipDuFichier,
  uuidv7,
  vieillir,
  type Auditeur,
  type MissionSemee,
} from '../banc/semis-serveur.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MOT_DE_PASSE_APPAREIL = 'tournee-s7-reprise-2026';
const QUESTION_TEXTE = 'Décrivez le déroulement d’une commande, de sa réception à sa livraison.';
const NOM_INTERLOCUTEUR = 'Interlocuteur fictif scénario sept';

/** Le siège : une unité, une question libre, une session `en_cours` de l'auditeur. */
async function semerSiege(auditeur: Auditeur, mission: MissionSemee): Promise<void> {
  const interviewId = uuidv7();
  const missionQuestionId = uuidv7();
  const questionId = uuidv7();
  const uniteId = uuidv7();
  await avecBase(async (bd) => {
    const bloc = await bd.query<{ id: string }>('SELECT id FROM blocks ORDER BY code LIMIT 1');
    const blocId = bloc.rows[0]?.id;
    if (blocId === undefined) throw new Error('le seed des référentiels ne contient aucun bloc');
    await bd.query(
      `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status,
                              created_at, updated_at)
       VALUES ($1, $2, NULL, 'service', 'Atelier fictif sept', true, 'active', now(), now())`,
      [uniteId, mission.missionId],
    );
    await bd.query(
      `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                              created_at, updated_at)
       VALUES ($1, $2, 1, 'active', $3, 'free_text', 'banque', now(), now())`,
      [questionId, blocId, QUESTION_TEXTE],
    );
    await bd.query(
      `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                      answer_type_snapshot, criticality_snapshot, position, added_ad_hoc)
       VALUES ($1, $2, $3, 1, $4, 'free_text', 'important', 1, false)`,
      [missionQuestionId, mission.missionId, questionId, QUESTION_TEXTE],
    );
    await bd.query(
      `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                               schedule_status, status, person_name, consent_given, consented_at,
                               scheduled_at, started_at, client_created_at, client_updated_at,
                               created_at, updated_at)
       VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, 'realise', 'en_cours', $5, true, now(),
               now() - interval '2 minutes', now() - interval '1 minute', now(), now(), now(), now())`,
      [interviewId, mission.missionId, auditeur.id, uniteId, NOM_INTERLOCUTEUR],
    );
  });
  // Le premier pull borne à now() - 60 s : sans ce recul, il ne verrait RIEN du semis.
  await vieillir(mission.missionId);
}

/** L'état d'un appareil juste avant son rattachement : coffre ouvert, mission, aucune identité. */
async function graines(missionId: string, appareilId: string): Promise<GrainesAppareil> {
  const sel = genererSel();
  const kek = await deriverKek(MOT_DE_PASSE_APPAREIL, sel, PARAMETRES_KDF_DEFAUT);
  const { coffre, dekEnveloppee } = await creerCoffreNeuf(kek);
  const instant = new Date().toISOString();
  const index: IndexMission = {
    id: missionId,
    status: 'en_cours',
    clientUpdatedAt: instant,
    supprimeLe: null,
  };
  const charge: ChargeMission = {
    titre: 'Mission locale avant premier pull',
    companyId: uuidv7(),
    timezone: 'Europe/Paris',
    auditLevel: 'standard',
    geoScope: 'france',
    countryCode: 'FR',
    startPlanned: null,
    endPlanned: null,
    roleSurMission: 'auditeur',
  };
  return {
    tables: { missions: [{ ...index, charge: await coffre.chiffrer(charge) }] },
    meta: [
      {
        cle: 'coffre',
        valeur: { sel: versBase64(sel), parametres: PARAMETRES_KDF_DEFAUT, dekEnveloppee },
      },
      { cle: 'appareil', valeur: appareilId },
      { cle: 'appareil:libelle', valeur: `Appareil ${appareilId.slice(-4)} (banc E2E)` },
      { cle: `mission:embarquee:${missionId}`, valeur: instant },
      { cle: `mission:persistance:${missionId}`, valeur: instant },
    ],
  };
}

interface Appareil {
  readonly nom: string;
  readonly contexte: BrowserContext;
  readonly page: Page;
}

/**
 * Un appareil rattaché par la VRAIE connexion (formulaire de production, Argon2id côté
 * API), avec son premier pull réel. Adresse publique PROPRE au fichier : le quota
 * `/v1/auth/*` (10 req/min/IP) ne se partage pas avec les autres scénarios.
 */
async function ouvrirAppareil(
  nom: string,
  auditeur: Auditeur,
  mission: MissionSemee,
): Promise<Appareil> {
  const { contexte, page } = await ouvrirProfilSurDisque(`s7-${nom}`, {
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: { 'x-forwarded-for': ipDuFichier(`s7-${nom}`) },
  });
  await planterAppareil(page, await graines(mission.missionId, uuidv7()));
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

  await page.getByRole('button', { name: 'Rattacher cet appareil' }).click();
  await page.getByLabel(/^Adresse de votre compte/).fill(auditeur.courriel);
  await page.getByLabel(/^Mot de passe du compte/).fill(auditeur.motDePasse);
  await page.getByRole('button', { name: 'Rattacher cet appareil' }).click();
  await expect(page.getByRole('heading', { name: 'Appareil rattaché' })).toBeVisible({
    timeout: 30_000,
  });

  const premierPull = page.waitForResponse(
    (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
  const reponse = await premierPull;
  expect(reponse.status(), `premier pull de l'appareil ${nom}`).toBe(200);
  return { nom, contexte, page };
}

/** Ouvre la session semée et attend la question. */
async function ouvrirLaQuestion(appareil: Appareil): Promise<void> {
  const { page } = appareil;
  await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
  const reprise = page.getByRole('button', { name: 'Reprendre la session' });
  await expect(reprise).toBeVisible({ timeout: 30_000 });
  await reprise.click();
  await expect(page.getByRole('heading', { name: QUESTION_TEXTE })).toBeVisible({
    timeout: 30_000,
  });
}

interface ClientMinio {
  getObject(bucket: string, cle: string): Promise<AsyncIterable<Buffer>>;
}

/** Le client MinIO du banc, résolu depuis `apps/api` (aucune dépendance neuve à la racine). */
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

async function empreinteObjet(
  client: ClientMinio,
  cle: string,
): Promise<{ sha256: string; taille: number }> {
  const hachage = createHash('sha256');
  let taille = 0;
  for await (const morceau of await client.getObject(
    process.env.MINIO_BUCKET_ATTACHMENTS ?? '',
    cle,
  )) {
    hachage.update(morceau);
    taille += morceau.byteLength;
  }
  return { sha256: hachage.digest('hex'), taille };
}

/** L'identifiant de la pièce photo de la mission, une fois sa méta arrivée au siège. */
async function attendrePieceAuSiege(missionId: string): Promise<string> {
  let trouvee = '';
  await expect
    .poll(
      async () => {
        const r = await avecBase((bd) =>
          bd.query<{ id: string }>(
            `SELECT id FROM attachments WHERE mission_id = $1 AND kind = 'photo'`,
            [missionId],
          ),
        );
        trouvee = r.rows[0]?.id ?? '';
        return trouvee;
      },
      { message: 'la méta de la photo doit arriver au siège avant ses octets', timeout: 60_000 },
    )
    .not.toBe('');
  return trouvee;
}

/** Les morceaux que le siège a REÇUS (colonne `chunks_recus`), triés. */
async function morceauxRecus(pieceId: string): Promise<number[]> {
  const r = await avecBase((bd) =>
    bd.query<{ chunks_recus: number[] }>(
      'SELECT chunks_recus FROM attachment_uploads WHERE attachment_id = $1',
      [pieceId],
    ),
  );
  return [...(r.rows[0]?.chunks_recus ?? [])].sort((a, b) => a - b);
}

async function statutEnvoi(pieceId: string): Promise<string | undefined> {
  const r = await avecBase((bd) =>
    bd.query<{ statut: string }>('SELECT statut FROM attachment_uploads WHERE attachment_id = $1', [
      pieceId,
    ]),
  );
  return r.rows[0]?.statut;
}

/** Un vrai PNG de 1 pixel : le décodeur de production le lit, l'encodeur est remplacé (voir plus bas). */
const PNG_UN_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** L'URL d'un morceau, telle que le navigateur l'émet (proxy du front, sans CORS). */
const RE_MORCEAU = /\/api\/v1\/sync\/attachments\/([0-9a-f-]+)\/chunks\/(\d+)$/;

test.describe('Scénario 7 du 05 §9.8 — reprise d’un upload interrompu à 80 %', () => {
  test('@critique une photo en 5 morceaux, le 4e échoue : seuls les manquants repartent, l’assemblage et le sha256 sont exacts dans MinIO', async () => {
    test.setTimeout(300_000);

    const auditeur = await creerAuditeur('s7-reprise-80');
    const mission = await creerMission('s7-reprise-80', auditeur);
    await semerSiege(auditeur, mission);
    const appareil = await ouvrirAppareil('a', auditeur, mission);

    // ── La photo : 4,4 morceaux de 5 Mio → n = 5 morceaux, le dernier plus court ──
    // La pile de production RECOMPRESSE toute photo (JPEG, 2048 px max, q 0,85 :
    // `sauvegarde/photos.ts`) : aucune image décodable ne ressort à 22 Mio. Le test
    // remplace donc, DANS LE NAVIGATEUR, le seul encodeur du canevas
    // (`OffscreenCanvas.convertToBlob`) par des octets aléatoires de 22 Mio ; le fichier
    // choisi reste un vrai PNG que le décodeur de production lit. Tout ce qui suit — coffre
    // chiffré, outbox, découpage, envoi, assemblage — est le code de production.
    const OCTETS_PAR_MORCEAU = 5 * 1024 * 1024;
    const TAILLE_PHOTO = Math.floor(4.4 * OCTETS_PAR_MORCEAU);
    const n = Math.ceil(TAILLE_PHOTO / OCTETS_PAR_MORCEAU);
    expect(n, 'la photo de test fait 5 morceaux').toBe(5);
    const indexEnEchec = Math.ceil(0.8 * n) - 1; // le morceau n° ⌈0,8·n⌉ = le 4e, index 3
    // ── Le réseau est coupé AU NIVEAU DE LA ROUTE du morceau, pas de la page ──────
    const posts: { index: number; phase: 1 | 2; issue: 'echec' | 'passe' }[] = [];
    let phase: 1 | 2 = 1;
    let coupure = true;
    await appareil.page.route(RE_MORCEAU, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const index = Number(RE_MORCEAU.exec(route.request().url())?.[2]);
      if (coupure && index === indexEnEchec) {
        posts.push({ index, phase, issue: 'echec' });
        await route.abort('connectionreset');
        return;
      }
      posts.push({ index, phase, issue: 'passe' });
      await route.continue();
    });

    try {
      await ouvrirLaQuestion(appareil);
      const empreinteAttendue = await appareil.page.evaluate(async (taille: number) => {
        const octets = new Uint8Array(taille);
        for (let i = 0; i < taille; i += 65_536) {
          crypto.getRandomValues(octets.subarray(i, Math.min(i + 65_536, taille)));
        }
        const blob = new Blob([octets], { type: 'image/jpeg' });
        OffscreenCanvas.prototype.convertToBlob = (): Promise<Blob> => Promise.resolve(blob);
        const condense = new Uint8Array(await crypto.subtle.digest('SHA-256', octets));
        return Array.from(condense, (o) => o.toString(16).padStart(2, '0')).join('');
      }, TAILLE_PHOTO);

      // ── Capture HORS LIGNE : la pièce naît localement, ses octets restent ici ──
      await appareil.contexte.setOffline(true);
      await appareil.page
        .locator('label.axn-photo__declencheur')
        .filter({ hasText: /^Ajouter une photo$/ })
        .first()
        .locator('input[type="file"]')
        .setInputFiles({ name: 'photo-atelier.png', mimeType: 'image/png', buffer: PNG_UN_PIXEL });
      await expect(appareil.page.getByText('Photo enregistrée sur cet appareil.')).toBeVisible({
        timeout: 60_000,
      });
      expect(
        (await lireTableLocale(appareil.page, 'attachments')).length,
        'la pièce est une ligne locale',
      ).toBeGreaterThanOrEqual(1);

      // ── PHASE 1 : retour du réseau, le morceau n°4 échoue ─────────────────────
      await appareil.contexte.setOffline(false);
      await expect
        .poll(() => posts.some((p) => p.issue === 'echec'), {
          message: 'le morceau en échec doit avoir été tenté',
          timeout: 90_000,
        })
        .toBe(true);

      // Ce que le siège a REÇU avant la panne : exactement les morceaux d'avant.
      const pieceId = await attendrePieceAuSiege(mission.missionId);
      await expect
        .poll(async () => (await morceauxRecus(pieceId)).join(','), {
          message: 'le siège a reçu les morceaux 0, 1 et 2 — pas le 3',
          timeout: 30_000,
        })
        .toBe('0,1,2');
      const phase1 = posts.filter((p) => p.phase === 1);
      expect(phase1.map((p) => p.index).slice(0, 4), 'envoi dans l’ordre, jusqu’à l’échec').toEqual(
        [0, 1, 2, 3],
      );
      expect(await statutEnvoi(pieceId), 'rien n’est assemblé à 60 %').toBe('en_cours');
      const recusAvantReprise = await morceauxRecus(pieceId);

      // ── PHASE 2 : le réseau revient, on déclenche la reprise ──────────────────
      phase = 2;
      coupure = false;
      const termine = appareil.page.waitForResponse(
        (r) => /\/sync\/attachments\/[0-9a-f-]+\/complete$/.test(r.url()) && r.status() === 200,
        { timeout: 120_000 },
      );
      await appareil.contexte.setOffline(true);
      await appareil.contexte.setOffline(false);
      await termine;

      // SEULS les manquants repartent : aucun morceau déjà reçu n'est réémis.
      const phase2 = posts.filter((p) => p.phase === 2).map((p) => p.index);
      expect(
        phase2.filter((i) => recusAvantReprise.includes(i)),
        `aucun morceau déjà reçu ne doit repartir (reçus : ${recusAvantReprise.join(',')} ; repartis : ${phase2.join(',')})`,
      ).toEqual([]);
      expect([...new Set(phase2)].sort(), 'exactement les manquants : 3 et 4').toEqual([3, 4]);

      // ── Assemblage et sha256 EXACTS dans MinIO ────────────────────────────────
      const piece = await avecBase((bd) =>
        bd.query<{ storage_key: string | null }>(
          'SELECT storage_key FROM attachments WHERE id = $1',
          [pieceId],
        ),
      );
      const cle = piece.rows[0]?.storage_key;
      expect(cle, 'la pièce a une clé de stockage définitive après l’assemblage').toBeTruthy();
      expect(cle).toBe(`pieces/${mission.missionId}/${pieceId}`);
      const objet = await empreinteObjet(clientMinio(), cle ?? '');
      expect(objet.taille, 'taille de l’objet assemblé = taille de la photo').toBe(TAILLE_PHOTO);
      expect(objet.sha256, 'sha256 de l’objet assemblé = sha256 de la photo d’origine').toBe(
        empreinteAttendue,
      );
      expect(await statutEnvoi(pieceId), 'l’envoi du siège est « assemble »').toBe('assemble');
    } finally {
      await appareil.contexte.close();
    }
  });
});
