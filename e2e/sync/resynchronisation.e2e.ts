// =============================================================================
// RESYNCHRONISATION VOLONTAIRE (05 §9.5) — L6c-3 « le terrain », volet V1.
//
// Le questionnaire d'une mission n'atteint le terrain QU'AU PREMIER PULL : un
// consultant en plein entretien ne voit jamais son questionnaire bouger sous ses
// doigts (05 §9.5). Quand le siège ajoute une question à la mission, seul le geste
// VOLONTAIRE « Resynchroniser » (écran de synchronisation) la fait descendre.
//
// Ce que le test prouve, contre la VRAIE API, la VRAIE base et le VRAI front servi :
//   1. après le premier pull, le siège ajoute une question à la mission ;
//   2. un pull ordinaire (retour du réseau) NE LA VOIT PAS — l'appareil ne montre
//      rien de plus (état « avant » établi, pas supposé) ;
//   3. « Resynchroniser » lance une descente complète (pull SANS `since`) et la
//      question apparaît dans la table locale ; la question d'origine est intacte ;
//   4. l'écran le dit en français (statut visible).
//
// Écrit AVANT le code (09 §5.6) : rouge tant que le bouton n'existe pas.
// Limite assumée (11 §7) : les service workers iOS ne sont PAS couverts par
// Playwright (mode avion réel : à la main, P-C/P-E).
// Invariant 2 : mission, entreprise et questions FICTIVES. Secrets factices.
// =============================================================================
import { expect, test, type Page } from '@playwright/test';
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

const MOT_DE_PASSE_APPAREIL = 'tournee-resynchronisation-2026';
const QUESTION_INITIALE = 'Décrivez le déroulement d’une commande, de sa réception à sa livraison.';
const QUESTION_AJOUTEE = 'Comment les retours clients sont-ils enregistrés et traités ?';

/** Le siège : une unité et une première question libre (position 1). */
async function semerSiege(mission: MissionSemee): Promise<{ blocId: string }> {
  const uniteId = uuidv7();
  let blocId = '';
  await avecBase(async (bd) => {
    const bloc = await bd.query<{ id: string }>('SELECT id FROM blocks ORDER BY code LIMIT 1');
    const premier = bloc.rows[0]?.id;
    if (premier === undefined) throw new Error('le seed des référentiels ne contient aucun bloc');
    blocId = premier;
    await bd.query(
      `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status,
                              created_at, updated_at)
       VALUES ($1, $2, NULL, 'service', 'Atelier fictif resynchronisation', true, 'active', now(), now())`,
      [uniteId, mission.missionId],
    );
  });
  await ajouterQuestion(mission, blocId, QUESTION_INITIALE, 1);
  await vieillir(mission.missionId);
  return { blocId };
}

/** Le siège ajoute une question au questionnaire de la mission. */
async function ajouterQuestion(
  mission: MissionSemee,
  blocId: string,
  texte: string,
  position: number,
): Promise<void> {
  const questionId = uuidv7();
  await avecBase(async (bd) => {
    await bd.query(
      `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                              created_at, updated_at)
       VALUES ($1, $2, 1, 'active', $3, 'free_text', 'banque', now(), now())`,
      [questionId, blocId, texte],
    );
    await bd.query(
      `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                      answer_type_snapshot, criticality_snapshot, position, added_ad_hoc)
       VALUES ($1, $2, $3, 1, $4, 'free_text', 'important', $5, false)`,
      [uuidv7(), mission.missionId, questionId, texte, position],
    );
  });
}

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

const textesDesQuestions = async (page: Page): Promise<string[]> =>
  (await lireTableLocale(page, 'missionQuestions')).map((q) => String(q.texteSnapshot)).sort();

test.describe('Resynchronisation volontaire — 05 §9.5', () => {
  test('@critique le siège ajoute une question après le premier pull : seule « Resynchroniser » la fait descendre', async () => {
    test.setTimeout(300_000);

    const auditeur: Auditeur = await creerAuditeur('resynchronisation');
    const mission = await creerMission('resynchronisation', auditeur);
    const { blocId } = await semerSiege(mission);

    const { contexte, page } = await ouvrirProfilSurDisque('resynchronisation-a', {
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      extraHTTPHeaders: { 'x-forwarded-for': ipDuFichier('resynchronisation-a') },
    });
    try {
      await planterAppareil(page, await graines(mission.missionId, uuidv7()));
      await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL);

      // ── Rattachement par la VRAIE connexion, puis le PREMIER pull réel ───────
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
      expect((await premierPull).status(), 'premier pull').toBe(200);
      await expect
        .poll(async () => textesDesQuestions(page), {
          message: 'le premier pull apporte la question d’origine',
          timeout: 30_000,
        })
        .toEqual([QUESTION_INITIALE]);

      // ── Le siège ajoute une question APRÈS le premier pull ───────────────────
      await ajouterQuestion(mission, blocId, QUESTION_AJOUTEE, 2);
      await vieillir(mission.missionId);

      // ── Un pull ORDINAIRE ne la voit pas (05 §9.5) : l'état « avant » est PROUVÉ ─
      const pullOrdinaire = page.waitForResponse(
        (r) => r.url().includes('/api/v1/sync/pull') && r.request().method() === 'GET',
        { timeout: 30_000 },
      );
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });
      const ordinaire = await pullOrdinaire;
      expect(ordinaire.status(), 'pull ordinaire').toBe(200);
      expect(ordinaire.url(), 'le pull ordinaire est un DELTA (avec since)').toContain('since=');
      expect(
        await textesDesQuestions(page),
        'avant : la nouvelle question n’est PAS descendue',
      ).toEqual([QUESTION_INITIALE]);

      // ── Le geste volontaire : écran de synchronisation → « Resynchroniser » ───
      await page.getByRole('button', { name: 'Revenir à la collecte' }).click();
      await page.getByRole('button', { name: 'Voir la file de synchronisation' }).click();
      const bouton = page.getByRole('button', { name: /resynchroniser/i });
      await expect(bouton).toBeVisible({ timeout: 30_000 });

      const pullComplet = page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/sync/pull') &&
          r.request().method() === 'GET' &&
          !r.url().includes('since='),
        { timeout: 60_000 },
      );
      await bouton.click();
      const complet = await pullComplet;
      expect(complet.status(), 'descente complète').toBe(200);

      // ── Après : la question du siège est descendue, l'ancienne est intacte ────
      await expect
        .poll(async () => textesDesQuestions(page), {
          message: 'la question ajoutée par le siège doit descendre à la resynchronisation',
          timeout: 30_000,
        })
        .toEqual([QUESTION_AJOUTEE, QUESTION_INITIALE].sort());
      const toutes = await lireTableLocale(page, 'missionQuestions');
      expect(
        toutes.every((q) => q.supprimeLe === null),
        'aucune question effacée',
      ).toBe(true);

      // L'écran le DIT : un statut visible, en français, sans alerte.
      await expect(
        page.getByRole('status').filter({ hasText: /resynchronis|à jour/i }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(bouton).toBeEnabled();
    } finally {
      await contexte.close();
    }
  });
});
