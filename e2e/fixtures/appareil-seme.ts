// =============================================================================
// FIXTURE E2E — UN APPAREIL RATTACHÉ À UNE MISSION DÉJÀ SEMÉE, COFFRE EN MAIN
//
// Ce que `appareil-connecte.ts` fait pour une mission qu'IL sème, ce fichier le fait
// pour une mission que le TEST a déjà semée côté siège (sessions, questions…), et il
// rend en plus le `coffre` de l'appareil : la DEK qui a servi à fabriquer l'enveloppe
// du coffre au repos. Un test de volume en a besoin pour chiffrer, côté Node, des
// milliers de lignes que le navigateur déchiffrera avec le seul mot de passe.
//
// Rien n'est réécrit : mêmes gestes que la connexion réelle (formulaire de production,
// Argon2id vérifié par l'API) et même premier pull réel. Le quota `/v1/auth/*`
// (10 req/min/IP) reste respecté : adresse publique propre au préfixe, UNE connexion.
//
// Invariant 2 : mission fictive. Secrets factices.
// =============================================================================
import { expect, type BrowserContext, type Page } from '@playwright/test';
import {
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
  type Coffre,
} from '../../apps/field/src/local/coffre.js';
import { versBase64 } from '../../apps/field/src/local/enveloppe.js';
import type { ChargeMission, IndexMission } from '../../apps/field/src/local/formes.js';
import { ipDuFichier, uuidv7, type Auditeur, type MissionSemee } from '../banc/semis-serveur.js';
import {
  deverrouillerAppareil,
  ouvrirProfilSurDisque,
  planterAppareil,
  type GrainesAppareil,
} from './appareil-terrain.js';

export const MOT_DE_PASSE_APPAREIL_SEME = 'tournee-banc-seme-2026';

export interface AppareilSeme {
  readonly contexte: BrowserContext;
  readonly page: Page;
  /** Le coffre de l'appareil (DEK en mémoire du processus de test). */
  readonly coffre: Coffre;
  /** L'identifiant d'appareil écrit dans `meta` (celui des lots de push). */
  readonly appareilId: string;
}

async function graines(
  missionId: string,
  appareilId: string,
): Promise<{ graines: GrainesAppareil; coffre: Coffre }> {
  const sel = genererSel();
  const kek = await deriverKek(MOT_DE_PASSE_APPAREIL_SEME, sel, PARAMETRES_KDF_DEFAUT);
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
    coffre,
    graines: {
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
    },
  };
}

/**
 * Ouvre l'appareil, le rattache par la vraie connexion, attend son premier pull réel
 * (statut 200). `prefixe` nomme le profil sur disque et fixe l'adresse du quota.
 */
export async function ouvrirAppareilSeme(
  prefixe: string,
  auditeur: Auditeur,
  mission: MissionSemee,
): Promise<AppareilSeme> {
  const appareilId = uuidv7();
  const { contexte, page } = await ouvrirProfilSurDisque(`seme-${prefixe}`, {
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: { 'x-forwarded-for': ipDuFichier(prefixe) },
  });
  const { graines: semences, coffre } = await graines(mission.missionId, appareilId);
  await planterAppareil(page, semences);
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL_SEME);

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
  expect(reponse.status(), `premier pull de l'appareil ${prefixe}`).toBe(200);
  return { contexte, page, coffre, appareilId };
}
