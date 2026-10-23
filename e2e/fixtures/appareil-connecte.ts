// =============================================================================
// FIXTURE E2E — UN APPAREIL TERRAIN CONNECTÉ À UNE VRAIE API (banc L6c-2)
//
// Sœur de `appareil-terrain.ts`, dont elle réutilise les gestes (profil sur disque,
// plantage IndexedDB, déverrouillage). La différence tient en une phrase : ici le
// siège EXISTE. L'auditeur et sa mission sont semés dans la base du banc
// (`e2e/banc/semis-serveur.ts`), l'appareil est rattaché par la VRAIE connexion
// (`POST /v1/auth/login` à travers le proxy du front, Argon2id vérifié par l'API), et
// le premier pull est un VRAI `GET /v1/sync/pull`.
//
// Ce que l'appareil porte AVANT la connexion : un coffre ouvert par mot de passe, la
// mission (une ligne, sans questions ni unités) et AUCUNE identité d'auditeur. C'est la
// connexion qui l'écrit (`rattacherAppareil`) — l'état d'un appareil réel juste avant
// son rattachement. La crypto est celle de PRODUCTION, importée telle quelle : aucune
// enveloppe réécrite ici (09 §5.7).
//
// Le quota `/v1/auth/*` (10 req/min/IP) ne se contourne pas par du code de production :
// le contexte navigateur porte une adresse `X-Forwarded-For` PUBLIQUE propre au fichier
// (`ipDuFichier`), et un fichier ne fait qu'UNE connexion réelle.
//
// Invariant 2 : entreprise et mission FICTIVES. Secrets factices.
// =============================================================================
import { expect, type BrowserContext, type Page } from '@playwright/test';
import {
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
} from '../../apps/field/src/local/coffre.js';
import { versBase64 } from '../../apps/field/src/local/enveloppe.js';
import type { ChargeMission, IndexMission } from '../../apps/field/src/local/formes.js';
import {
  creerAuditeur,
  creerMission,
  ipDuFichier,
  uuidv7,
  type Auditeur,
  type MissionSemee,
} from '../banc/semis-serveur.js';
import {
  deverrouillerAppareil,
  lireTableLocale,
  ouvrirProfilSurDisque,
  planterAppareil,
  type GrainesAppareil,
} from './appareil-terrain.js';

export { lireTableLocale };

/** Mot de passe de l'APPAREIL (coffre local) — distinct de celui du compte du siège. */
export const MOT_DE_PASSE_APPAREIL_CONNECTE = 'tournee-banc-connecte-2026';

const APPAREIL_ID = '01920000-0000-7000-8000-0000000000fe';

export interface AppareilConnecte {
  readonly contexte: BrowserContext;
  readonly page: Page;
  readonly auditeur: Auditeur;
  readonly mission: MissionSemee;
  /** Statut HTTP du premier `GET /v1/sync/pull` réellement émis par l'application. */
  readonly statutPremierPull: number;
  /** Corps JSON de ce premier pull (déjà lu). */
  readonly corpsPremierPull: unknown;
}

/** Les graines d'un appareil équipé de SA mission mais SANS identité d'auditeur. */
async function semerAppareilSansIdentite(missionId: string): Promise<GrainesAppareil> {
  const sel = genererSel();
  const kek = await deriverKek(MOT_DE_PASSE_APPAREIL_CONNECTE, sel, PARAMETRES_KDF_DEFAUT);
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
      { cle: 'appareil', valeur: APPAREIL_ID },
      { cle: 'appareil:libelle', valeur: 'Appareil de tournée (banc E2E)' },
      { cle: `mission:embarquee:${missionId}`, valeur: instant },
      { cle: `mission:persistance:${missionId}`, valeur: instant },
    ],
  };
}

/**
 * Ouvre un appareil, le rattache par la vraie connexion, et attend son premier pull.
 *
 * `prefixe` nomme le fichier de test appelant : il préfixe les données du siège et
 * fixe l'adresse (donc le quota d'authentification) du contexte navigateur.
 */
export async function ouvrirAppareilConnecte(prefixe: string): Promise<AppareilConnecte> {
  const auditeur = await creerAuditeur(prefixe);
  const mission = await creerMission(prefixe, auditeur);

  const { contexte, page } = await ouvrirProfilSurDisque(`connecte-${prefixe}`, {
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: { 'x-forwarded-for': ipDuFichier(prefixe) },
  });

  await planterAppareil(page, await semerAppareilSansIdentite(mission.missionId));
  await deverrouillerAppareil(page, MOT_DE_PASSE_APPAREIL_CONNECTE);

  // La VRAIE connexion : formulaire de production → /api/v1/auth/login → API réelle.
  await page.getByRole('button', { name: 'Rattacher cet appareil' }).click();
  await page.getByLabel(/^Adresse de votre compte/).fill(auditeur.courriel);
  await page.getByLabel(/^Mot de passe du compte/).fill(auditeur.motDePasse);
  await page.getByRole('button', { name: 'Rattacher cet appareil' }).click();
  await expect(page.getByRole('heading', { name: 'Appareil rattaché' })).toBeVisible({
    timeout: 30_000,
  });

  // Le PREMIER PULL réel : le retour du réseau pousse puis tire chaque mission locale
  // (`brancherRetourReseau`). On attend l'appel émis par l'application elle-même.
  const attendu = page.waitForResponse(
    (reponse) =>
      reponse.url().includes('/api/v1/sync/pull') && reponse.request().method() === 'GET',
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
  const reponse = await attendu;
  const corps: unknown = await reponse.json().catch(() => null);

  return {
    contexte,
    page,
    auditeur,
    mission,
    statutPremierPull: reponse.status(),
    corpsPremierPull: corps,
  };
}
