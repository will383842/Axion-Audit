// =============================================================================
// HARNAIS DE MESURE A28 — L'APPAREIL DE **FIL-GC**, LE GRAND COMPTE FICTIF.
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
// 09 §4, porte P-E, en toutes lettres : « la recette se joue AUSSI sur FIL-GC
// (grand compte fictif) — naviguer l'arbre de 150 unités, trouver sa session du
// jour, couverture lisible, **p95 interactions < 100 ms (A28) sur les listes
// longues** : l'outil doit rester SIMPLE à grande échelle, pas seulement sur
// 2 entretiens. » La fixture d'A26 (`e2e/fixtures/appareil-terrain.ts`) sème
// FIL-TPE : UNE unité, TROIS questions. Elle est juste pour ce qu'elle porte, et
// elle ne peut structurellement pas répondre à ce critère-là.
//
// ── CE QU'IL RÉUTILISE, ET CE QU'IL NE RÉÉCRIT PAS ─────────────────────────
// La règle d'A26 est reprise mot pour mot, parce qu'elle est bonne : AUCUNE
// crypto n'est réécrite ici. Les octets sont produits par le code de PRODUCTION
// importé tel quel (`deriverKek` Argon2id, `creerCoffreNeuf`, `Coffre.chiffrer`)
// et ce fichier ne fait que les ranger dans IndexedDB. L'application déverrouille
// ensuite ces données par son chemin normal.
//
// Ce fichier ne modifie pas la fixture d'A26 : A28 ne touche pas au code des
// autres agents (09 §5.6), et un semis de volume n'a rien à faire dans une
// fixture dont toute la valeur est d'être petite et lisible.
//
// ── INVARIANT 2 ────────────────────────────────────────────────────────────
// FIL-GC est une entreprise FICTIVE (09 §4bis). Aucun nom, aucun identifiant,
// aucune donnée de ce fichier ne renvoie à un client réel. Les identifiants sont
// des littéraux UUID v7 dérivés d'un rang : déterministes, relisibles dans une
// trace d'échec, et aucun second générateur d'UUID n'est introduit (invariant 1).
//
// Traçabilité : E6 (hors ligne total), E33 (sécurité / RGPD — crypto locale),
// E43 (exécutabilité autopilote — budgets d'acceptation).
// =============================================================================
import { expect, type Page } from '@playwright/test';

import {
  creerCoffreNeuf,
  deriverKek,
  genererSel,
  PARAMETRES_KDF_DEFAUT,
  type Coffre,
  type Enveloppe,
} from '../../../apps/field/src/local/coffre.js';
import { versBase64 } from '../../../apps/field/src/local/enveloppe.js';
import {
  jetonsDeRecherche,
  type ChargeInterview,
  type ChargeMission,
  type ChargeMissionQuestion,
  type ChargeOrgUnit,
  type IndexInterview,
  type IndexMission,
  type IndexMissionQuestion,
  type IndexOrgUnit,
} from '../../../apps/field/src/local/formes.js';

/**
 * L'URL du front terrain — par défaut celle d'A26 (4173), servie ici par Caddy.
 *
 * La variable existe pour UNE raison : le banc `zod-jitless.perf.ts` doit jouer
 * le MÊME build derrière deux serveurs différents (Caddy, qui pose la CSP, et
 * `vite preview`, qui n'en pose aucune) pour isoler ce que la CSP décide. Elle
 * n'est pas un confort de développement : sans elle, la question d'A29 sur le
 * coût du `jitless` n'a pas de réponse mesurable.
 */
export const URL_TERRAIN = process.env.AXION_URL_TERRAIN ?? 'http://127.0.0.1:4173/';

/** Secret FACTICE (CLAUDE.md §2), distinct de celui de la fixture FIL-TPE. */
export const MOT_DE_PASSE_FIL_GC = 'tournee-fil-gc-2026';

/** Les volumes du critère 09 §4 P-E, et rien d'arrondi au petit bonheur. */
export const UNITES_FIL_GC = 150;
export const SESSIONS_FIL_GC = 60;
/** Un questionnaire de grand compte : plus long que les 3 questions de FIL-TPE. */
export const QUESTIONS_FIL_GC = 40;

const MISSION_ID = '01920001-0000-7000-8000-000000000001';
const SOCIETE_ID = '01920001-0000-7000-8000-000000000003';
const AUDITEUR_ID = '01920001-0000-7000-8000-000000000004';
const QUESTION_BANQUE_ID = '01920001-0000-7000-8000-00000000000a';
const APPAREIL_ID = '01920001-0000-7000-8000-0000000000ff';

const FUSEAU_MISSION = 'Europe/Paris';

export const MISSION_FIL_GC = {
  id: MISSION_ID,
  titre: 'FIL-GC — groupe industriel fictif',
  /** L'unité que les écrans doivent savoir montrer au milieu des 149 autres. */
  unitePivot: 'Équipe 075 — maintenance',
} as const;

/** Un identifiant v7 déterministe, dérivé d'une famille et d'un rang. */
function identifiant(famille: number, rang: number): string {
  const queue = rang.toString(16).padStart(8, '0');
  return `01920001-0000-7000-8000-${famille.toString(16).padStart(4, '0')}${queue}`;
}

type LignePlantee = Record<string, unknown> & { readonly id: string; readonly charge: Enveloppe };

export interface GrainesFilGc {
  readonly tables: Readonly<Record<string, readonly LignePlantee[]>>;
  readonly meta: readonly { readonly cle: string; readonly valeur: unknown }[];
}

/** Le nom d'une unité de rang `rang` — hiérarchie à trois étages, 150 feuilles. */
function nomUnite(rang: number): string {
  if (rang === 75) return MISSION_FIL_GC.unitePivot;
  const etage = rang % 10;
  const numero = rang.toString().padStart(3, '0');
  if (etage === 0) return `Établissement ${numero} — site industriel`;
  if (etage === 5) return `Direction ${numero} — pilotage`;
  return `Équipe ${numero} — ${['production', 'logistique', 'qualité', 'maintenance'][rang % 4] ?? 'production'}`;
}

async function chiffrerIdentite(coffre: Coffre, id: string): Promise<Enveloppe> {
  return coffre.chiffrer({ id, profil: 'guide_strict' });
}

/**
 * Fabrique l'appareil de FIL-GC : 150 unités, 60 sessions, 40 questions figées.
 *
 * Le semis est DÉTERMINISTE — aucun tirage — pour qu'un p95 mesuré aujourd'hui
 * se compare à un p95 mesuré au lot suivant sur les mêmes données.
 */
export async function semerFilGc(motDePasse: string): Promise<GrainesFilGc> {
  const sel = genererSel();
  const kek = await deriverKek(motDePasse, sel, PARAMETRES_KDF_DEFAUT);
  const { coffre, dekEnveloppee } = await creerCoffreNeuf(kek);

  const instant = new Date().toISOString();

  const mission: IndexMission = {
    id: MISSION_ID,
    status: 'en_cours',
    clientUpdatedAt: instant,
    supprimeLe: null,
  };
  const chargeMission: ChargeMission = {
    titre: MISSION_FIL_GC.titre,
    companyId: SOCIETE_ID,
    timezone: FUSEAU_MISSION,
    auditLevel: 'approfondi',
    geoScope: 'france',
    countryCode: 'FR',
    startPlanned: null,
    endPlanned: null,
    roleSurMission: 'auditeur',
  };

  const unites: LignePlantee[] = [];
  const identifiantsUnites: string[] = [];
  for (let rang = 1; rang <= UNITES_FIL_GC; rang += 1) {
    const id = identifiant(1, rang);
    identifiantsUnites.push(id);
    const index: IndexOrgUnit = {
      id,
      missionId: MISSION_ID,
      // Un arbre, pas une liste plate : les feuilles pendent au dixième
      // au-dessus d'elles, ce qui donne 15 établissements et 135 descendants.
      parentId: rang % 10 === 0 || rang <= 10 ? null : identifiant(1, rang - (rang % 10)),
      kind: rang % 10 === 0 ? 'etablissement' : rang % 5 === 0 ? 'direction' : 'equipe',
      status: 'active',
      position: rang,
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    const charge: ChargeOrgUnit = {
      name: nomUnite(rang),
      countryCode: 'FR',
      timezone: FUSEAU_MISSION,
      headcount: 8 + (rang % 40),
      serviceRefId: null,
      sectorId: null,
      inScope: true,
      proposedBy: null,
      mergedIntoId: null,
      clientCreatedAt: instant,
    };
    unites.push({ ...index, charge: await coffre.chiffrer(charge) });
  }

  const questions: LignePlantee[] = [];
  for (let rang = 1; rang <= QUESTIONS_FIL_GC; rang += 1) {
    const texte = `Question ${String(rang).padStart(2, '0')} — comment cette activité est-elle outillée ?`;
    const index: IndexMissionQuestion = {
      id: identifiant(2, rang),
      missionId: MISSION_ID,
      position: rang,
      texteSnapshot: texte,
      motsCles: jetonsDeRecherche(texte),
      answerType: rang % 3 === 0 ? 'scale_1_5' : rang % 3 === 1 ? 'free_text' : 'yes_no',
      criticality: 'important',
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    const charge: ChargeMissionQuestion = {
      questionId: QUESTION_BANQUE_ID,
      questionVersion: 1,
      guidanceSnapshot: null,
      optionsSnapshot: null,
      scoringSnapshot: null,
      weightSnapshot: null,
      allowRangeSnapshot: false,
      addedAdHoc: false,
      blockCode: 'B1',
    };
    questions.push({ ...index, charge: await coffre.chiffrer(charge) });
  }

  // Les sessions du JOUR : le cockpit découpe la journée au fuseau de la
  // mission, et le critère P-E est « trouver sa session du jour » parmi elles.
  const aujourdhui = new Date();
  const sessions: LignePlantee[] = [];
  for (let rang = 1; rang <= SESSIONS_FIL_GC; rang += 1) {
    const debut = new Date(aujourdhui);
    debut.setUTCHours(6 + (rang % 10), (rang % 4) * 15, 0, 0);
    const index: IndexInterview = {
      id: identifiant(3, rang),
      missionId: MISSION_ID,
      orgUnitId: identifiantsUnites[rang % UNITES_FIL_GC] ?? identifiant(1, 1),
      kind: rang % 6 === 0 ? 'atelier' : rang % 3 === 0 ? 'observation' : 'entretien',
      status: 'non_demarre',
      scheduleStatus: rang % 4 === 0 ? 'confirme' : 'planifie',
      scheduledAt: debut.toISOString(),
      clientUpdatedAt: instant,
      supprimeLe: null,
    };
    const charge: ChargeInterview = {
      conductedBy: AUDITEUR_ID,
      mode: index.kind === 'entretien' ? 'sur_site' : null,
      personName: `Interlocuteur ${String(rang).padStart(2, '0')}`,
      personRole: 'Responsable',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: false,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: 45,
      startedAt: null,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: instant,
    };
    sessions.push({ ...index, charge: await coffre.chiffrer(charge) });
  }

  return {
    tables: {
      missions: [{ ...mission, charge: await coffre.chiffrer(chargeMission) }],
      orgUnits: unites,
      missionQuestions: questions,
      interviews: sessions,
    },
    meta: [
      {
        cle: 'coffre',
        valeur: { sel: versBase64(sel), parametres: PARAMETRES_KDF_DEFAUT, dekEnveloppee },
      },
      { cle: 'appareil', valeur: APPAREIL_ID },
      { cle: 'appareil:libelle', valeur: 'Tablette de tournée FIL-GC (harnais A28)' },
      { cle: 'auth:utilisateur', valeur: await chiffrerIdentite(coffre, AUDITEUR_ID) },
      { cle: `mission:embarquee:${MISSION_ID}`, valeur: instant },
      { cle: `mission:persistance:${MISSION_ID}`, valeur: instant },
    ],
  };
}

/**
 * Range les graines dans l'IndexedDB de l'onglet courant, puis recharge.
 *
 * Même ordre que la fixture d'A26 : la page est chargée UNE fois pour que Dexie
 * crée ses magasins — aucun schéma local n'est redéclaré ici — puis les lignes
 * sont déposées par l'API IndexedDB brute et la page est relue.
 */
export async function planterFilGc(
  page: Page,
  graines: GrainesFilGc,
  url: string = URL_TERRAIN,
): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Préparer cet appareil' })).toBeVisible();

  await page.evaluate(async (semences: GrainesFilGc) => {
    const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
      const demande = indexedDB.open('axion-terrain');
      demande.onsuccess = (): void => {
        resoudre(demande.result);
      };
      demande.onerror = (): void => {
        rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
      };
    });

    const magasins = [...Object.keys(semences.tables), 'meta'];
    const transaction = base.transaction(magasins, 'readwrite');
    for (const [nom, lignes] of Object.entries(semences.tables)) {
      for (const ligne of lignes) transaction.objectStore(nom).put(ligne);
    }
    for (const ligne of semences.meta) transaction.objectStore('meta').put(ligne);

    await new Promise<void>((resoudre, rejeter) => {
      transaction.oncomplete = (): void => {
        resoudre();
      };
      transaction.onerror = (): void => {
        rejeter(transaction.error ?? new Error('transaction de semis refusée'));
      };
    });
    base.close();
  }, graines);

  await page.reload();
}
