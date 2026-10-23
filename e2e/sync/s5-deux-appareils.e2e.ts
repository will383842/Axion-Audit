// =============================================================================
// SCÉNARIO 5 DU 05 §9.8 — DEUX APPAREILS, MÊME MISSION (L6c-2, groupe C)
//
// Le même auditeur, la même mission, la même question : deux tablettes saisissent
// chacune LEUR réponse hors ligne, puis synchronisent. Ce que le test prouve, contre
// la VRAIE API, la VRAIE base et le VRAI front servi :
//   1. la réponse la plus RÉCENTE (`client_updated_at`) gagne — même quand c'est la
//      plus ancienne qui arrive la dernière au siège (05 §9.4, dernier-écrit-gagne) ;
//   2. la perdante n'est PAS écrasée en silence : elle est archivée dans
//      `answer_revisions` (origine `sync_arbitrage`, invariant 7) et l'appareil
//      perdant reçoit le verdict `superseded` (05 §9.3) ;
//   3. il n'existe qu'UNE ligne de réponse côté siège pour (session, question) ;
//   4. les deux appareils CONVERGENT après le pull : le même texte à l'écran, une
//      seule réponse locale (le second UUID est remappé, pas dupliqué).
//
// ── LE DÉCLENCHEUR ──────────────────────────────────────────────────────────
// « Synchroniser maintenant » n'a pas de bouton dédié dans cette version : le geste
// manuel du port (`synchroniserMaintenant` = montée PUIS descente) est atteint par le
// retour du réseau (`online`, 05 §9.3) — le même chemin de production. Le test coupe
// le réseau, saisit, le rétablit et attend les VRAIS appels `POST /sync/push` puis
// `GET /sync/pull`.
//
// ── LA BORNE DU PULL ────────────────────────────────────────────────────────
// Le pull borne son curseur à `now() - 60 s` (05 §9.5). Le semis est donc « vieilli »
// AVANT le premier pull, et chaque écriture du scénario l'est avant le pull de
// convergence (`vieillir`, e2e/banc/semis-serveur.ts) — jamais d'attente réelle d'une
// minute.
//
// Limite assumée (11 §7) : `context.setOffline` couvre le réseau ; les service
// workers iOS ne sont PAS couverts par Playwright (mode avion réel : à la main, P-C/P-E).
// Invariant 2 : mission, entreprise et interlocuteur FICTIFS. Secrets factices.
// =============================================================================
import { expect, test, type BrowserContext, type Page, type Response } from '@playwright/test';
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

const MOT_DE_PASSE_APPAREIL = 'tournee-s5-deux-appareils-2026';
const QUESTION_TEXTE = 'Décrivez le déroulement d’une commande, de sa réception à sa livraison.';
const NOM_INTERLOCUTEUR = 'Interlocuteur fictif scénario cinq';

interface SemisSiege {
  readonly interviewId: string;
  readonly missionQuestionId: string;
}

/** Le siège : une unité, une question libre, une session `en_cours` de l'auditeur. */
async function semerSiege(auditeur: Auditeur, mission: MissionSemee): Promise<SemisSiege> {
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
       VALUES ($1, $2, NULL, 'service', 'Atelier fictif cinq', true, 'active', now(), now())`,
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
  return { interviewId, missionQuestionId };
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
 * API), avec son premier pull réel. Une adresse publique PROPRE à l'appareil : le quota
 * `/v1/auth/*` (10 req/min/IP) ne se partage pas entre les deux tablettes.
 */
async function ouvrirAppareil(
  nom: string,
  auditeur: Auditeur,
  mission: MissionSemee,
): Promise<Appareil> {
  const { contexte, page } = await ouvrirProfilSurDisque(`s5-${nom}`, {
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: { 'x-forwarded-for': ipDuFichier(`s5-${nom}`) },
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

/** Saisit hors ligne et attend la LIGNE locale (jamais le seul indicateur). */
async function saisirHorsLigne(appareil: Appareil, texte: string): Promise<void> {
  await appareil.page.getByLabel('Votre réponse').fill(texte);
  await expect
    .poll(async () => (await lireTableLocale(appareil.page, 'answers')).length, {
      message: `la réponse de l'appareil ${appareil.nom} doit être une ligne locale`,
      timeout: 20_000,
    })
    .toBe(1);
  await expect(appareil.page.getByText(/Enregistré à/)).toBeVisible({ timeout: 15_000 });
}

/**
 * Le retour du réseau : push PUIS pull réels. Les réponses attendues sont armées AVANT
 * le rétablissement ; le corps du push est rendu pour que le verdict par opération
 * (`applied` / `superseded`) soit asserté.
 */
async function synchroniser(appareil: Appareil): Promise<{ push: Response; pull: Response }> {
  const { page, contexte } = appareil;
  const push = page.waitForResponse(
    (r) => r.url().includes('/api/v1/sync/push') && r.request().method() === 'POST',
    { timeout: 60_000 },
  );
  const pull = page.waitForResponse(
    (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
    { timeout: 60_000 },
  );
  await contexte.setOffline(false);
  return { push: await push, pull: await pull };
}

test.describe('Scénario 5 du 05 §9.8 — deux appareils, même mission', () => {
  test('@critique deux appareils saisissent la même réponse hors ligne : la plus récente gagne, la perdante est archivée, les deux convergent', async () => {
    test.setTimeout(300_000);

    const auditeur = await creerAuditeur('s5-deux-appareils');
    const mission = await creerMission('s5-deux-appareils', auditeur);
    const siege = await semerSiege(auditeur, mission);

    const appareilA = await ouvrirAppareil('a', auditeur, mission);
    const appareilB = await ouvrirAppareil('b', auditeur, mission);
    try {
      // ── Les deux tablettes ont reçu la MÊME session et la MÊME question ──────
      await ouvrirLaQuestion(appareilA);
      await ouvrirLaQuestion(appareilB);

      // ── Hors ligne : A saisit D'ABORD, B saisit APRÈS (donc plus récent) ─────
      await appareilA.contexte.setOffline(true);
      await appareilB.contexte.setOffline(true);

      const REPONSE_A = 'Version A, la plus ancienne : la commande arrive par téléphone.';
      const REPONSE_B = 'Version B, la plus récente : la commande arrive par courriel.';
      await saisirHorsLigne(appareilA, REPONSE_A);
      // Plus d'une seconde d'écart : `client_updated_at` est comparé à la milliseconde,
      // un écart nul ferait gagner « au hasard » et le test ne prouverait rien.
      await appareilA.page.waitForTimeout(1_500);
      await saisirHorsLigne(appareilB, REPONSE_B);

      // Chaque appareil a sa propre réponse, avec son propre identifiant v7 — c'est
      // précisément le cas du scénario : deux UUID pour une même (session, question).
      const idLocalA = (await lireTableLocale(appareilA.page, 'answers'))[0]?.id;
      const idLocalB = (await lireTableLocale(appareilB.page, 'answers'))[0]?.id;
      expect(idLocalA).toBeTruthy();
      expect(idLocalB).toBeTruthy();
      expect(idLocalA, 'deux appareils = deux UUID de réponse').not.toBe(idLocalB);

      // ── B (la plus récente) arrive la PREMIÈRE au siège ──────────────────────
      const retourB = await synchroniser(appareilB);
      expect(retourB.push.status(), 'push de B').toBe(200);
      const verdictB = JSON.stringify(await retourB.push.json());
      expect(verdictB).toContain('applied');

      // ── A (la plus ancienne) arrive ENSUITE : le siège la juge périmée ───────
      const retourA = await synchroniser(appareilA);
      expect(retourA.push.status(), 'push de A').toBe(200);
      const verdictA = JSON.stringify(await retourA.push.json());
      expect(verdictA, 'la réponse la plus ancienne reçoit le verdict « superseded »').toContain(
        'superseded',
      );

      // ── CÔTÉ SIÈGE : une seule ligne, la plus récente gagne ──────────────────
      const lignes = await avecBase((bd) =>
        bd.query<{ id: string; valeur: string }>(
          `SELECT id, value->>'v' AS valeur FROM answers
            WHERE interview_id = $1 AND mission_question_id = $2`,
          [siege.interviewId, siege.missionQuestionId],
        ),
      );
      expect(lignes.rows, 'une SEULE ligne de réponse pour (session, question)').toHaveLength(1);
      expect(lignes.rows[0]?.valeur, 'la réponse la plus récente gagne').toBe(REPONSE_B);

      // ── Invariant 7 : la perdante est archivée, jamais écrasée en silence ────
      const revisions = await avecBase((bd) =>
        bd.query<{ origine: string; precedente: string | null; auteur: string | null }>(
          `SELECT r.change_origin AS origine, r.previous_value::text AS precedente,
                  r.changed_by AS auteur
             FROM answer_revisions r
             JOIN answers a ON a.id = r.answer_id
            WHERE a.interview_id = $1`,
          [siege.interviewId],
        ),
      );
      const archivees = revisions.rows.filter((r) => r.origine === 'sync_arbitrage');
      expect(archivees.length, 'au moins une révision `sync_arbitrage`').toBeGreaterThanOrEqual(1);
      expect(
        archivees.some((r) => (r.precedente ?? '').includes(REPONSE_A)),
        `la valeur perdante (A) doit figurer dans une révision archivée : ${JSON.stringify(archivees)}`,
      ).toBe(true);
      expect(
        archivees.every((r) => r.auteur === auditeur.id),
        'la révision est imputée à l’auditeur émetteur',
      ).toBe(true);

      // ── CONVERGENCE : pull sur les deux appareils, bornes vieillies ──────────
      await vieillir(mission.missionId);
      for (const appareil of [appareilA, appareilB]) {
        await appareil.contexte.setOffline(true);
        // Un retour du réseau SANS rien à pousser : seul le pull tire le siège.
        const pull = appareil.page.waitForResponse(
          (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
          { timeout: 60_000 },
        );
        await appareil.contexte.setOffline(false);
        expect((await pull).status(), `pull de convergence (${appareil.nom})`).toBe(200);
      }

      // Une réponse VISIBLE par appareil. L'absorbée (la locale de A) n'est jamais
      // supprimée (invariant 7) : elle garde sa ligne, marquée `supprimeLe`, et sort
      // de la vue (remappage.ts) — le test exige l'un ET l'autre.
      const visibles = async (appareil: Appareil): Promise<Record<string, unknown>[]> =>
        (await lireTableLocale(appareil.page, 'answers')).filter((l) => l.supprimeLe === null);
      for (const appareil of [appareilA, appareilB]) {
        await expect
          .poll(async () => (await visibles(appareil)).length, {
            message: `l'appareil ${appareil.nom} ne doit montrer qu'UNE réponse (la gagnante)`,
            timeout: 30_000,
          })
          .toBe(1);
      }
      const idsVisibles = await Promise.all(
        [appareilA, appareilB].map(async (a) => (await visibles(a))[0]?.id),
      );
      expect(idsVisibles[0], 'les deux appareils désignent la MÊME réponse du siège').toBe(
        idsVisibles[1],
      );
      expect(idsVisibles[0], 'et c’est celle du siège').toBe(lignes.rows[0]?.id);
      const toutesA = await lireTableLocale(appareilA.page, 'answers');
      const absorbee = toutesA.find((l) => l.id === idLocalA);
      expect(absorbee, 'la réponse absorbée de A n’est PAS supprimée (invariant 7)').toBeDefined();
      expect(absorbee?.supprimeLe, 'elle est seulement sortie de la vue').not.toBeNull();

      for (const appareil of [appareilA, appareilB]) {
        // L'ÉCRAN dit la vérité : on rouvre la question pour relire la valeur.
        await appareil.page.reload();
        await deverrouillerAppareil(appareil.page, MOT_DE_PASSE_APPAREIL);
        await expect(appareil.page.getByLabel('Votre réponse')).toHaveValue(REPONSE_B, {
          timeout: 30_000,
        });
      }
    } finally {
      await appareilA.contexte.close();
      await appareilB.contexte.close();
    }
  });
});
