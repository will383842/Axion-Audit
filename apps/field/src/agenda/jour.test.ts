// =============================================================================
// LA JOURNÉE DU COCKPIT — lot L5, incrément L5c. Écrit par A23.
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. Le cockpit AGRÈGE toutes les missions embarquées (03 §34.2 : « toutes
//      missions embarquées confondues ») et trie APRÈS le mélange — trier
//      mission par mission ferait lire sa matinée deux fois.
//   B. Les TROIS alertes du §34.2 sont calculées LOCALEMENT, et il n'y en a pas
//      une quatrième : à-revoir en attente, sync muette, entretien commencé non
//      terminé.
//   C. « Reprendre là où il s'est arrêté » désigne la session EN COURS la plus
//      récemment commencée, jamais la première venue.
//   D. `aValider` ne contient QUE des sessions terminées non validées — c'est la
//      matière exacte de la validation groupée du §19.1 V2.10.
//   E. AUCUNE PASTILLE NE VERDIT SANS SERVEUR : le port inerte rend
//      `indisponible`, et le compte d'opérations reste VRAI (lu dans l'outbox).
//      C'est le garde-fou nommé par `LOT_L5.md` §3.6.
//   F. Le jour civil se découpe au fuseau DE LA MISSION (§34.2 : « heure locale
//      du site »), pas à celui de l'appareil.
//
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total),
// E38 (sauvegarde terrain : sync ≥ 1×/j + export de secours).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { appliquerDescente, ecrireLocal } from '../local/ecriture.js';
import { creerPortSyncInerte } from '../local/port-sync.js';
import { construireJournee, rappelFinDeJournee } from './jour.js';

const HORODATAGE = '2026-09-04T07:00:00.000Z';
const NOM_BASE = 'axion-test-l5c-journee';

/** Deux missions FICTIVES (invariant 2), sur DEUX fuseaux différents. */
const MISSION_A = '0191e2a0-0000-7000-8000-00000000fa01';
const MISSION_B = '0191e2a0-0000-7000-8000-00000000fb01';
const UNITE_A = '0191e2a0-0000-7000-8000-00000000ca01';
const UNITE_B = '0191e2a0-0000-7000-8000-00000000cb01';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000ea01';

let base: BaseLocale;
let coffre: Coffre;

function idSession(rang: number): string {
  return `0191e2a0-0000-7000-8000-0000000002${rang.toString().padStart(2, '0')}`;
}

async function descendreMission(id: string, unite: string, fuseau: string): Promise<void> {
  await appliquerDescente({
    missionId: id,
    serverTime: HORODATAGE,
    prochainSince: null,
    enregistrements: [
      {
        table: 'missions',
        index: { id, status: 'collecte', clientUpdatedAt: HORODATAGE, supprimeLe: null },
        charge: {
          titre: `Mission fictive ${id.slice(-4)}`,
          companyId: '0191e2a0-0000-7000-8000-00000000aa01',
          timezone: fuseau,
          auditLevel: 'diagnostic_cadrage',
          geoScope: 'france',
          countryCode: 'FR',
          startPlanned: null,
          endPlanned: null,
          roleSurMission: 'lead',
        },
      },
      {
        table: 'orgUnits',
        index: {
          id: unite,
          missionId: id,
          parentId: null,
          kind: 'service',
          status: 'active',
          position: 1,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          name: 'Service fictif',
          countryCode: null,
          timezone: null,
          headcount: 5,
          serviceRefId: null,
          sectorId: null,
          inScope: true,
          proposedBy: null,
          mergedIntoId: null,
          clientCreatedAt: HORODATAGE,
        },
      },
    ],
  });
}

/**
 * Pose une session par le PORT D'ÉCRITURE : elle laisse donc une op dans
 * l'outbox, ce que les assertions sur le compte d'opérations exigent d'être vrai.
 */
async function poserSession(options: {
  readonly id: string;
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly status: 'non_demarre' | 'en_cours' | 'termine';
  readonly scheduledAt: string | null;
  readonly personName: string;
  readonly startedAt?: string | null;
  readonly valideeLe?: string | null;
}): Promise<void> {
  await ecrireLocal({
    entite: 'interview',
    id: options.id,
    missionId: options.missionId,
    action: 'upsert',
    index: {
      orgUnitId: options.orgUnitId,
      kind: 'entretien',
      status: options.status,
      scheduleStatus: options.scheduledAt === null ? 'a_planifier' : 'planifie',
      scheduledAt: options.scheduledAt,
    },
    charge: {
      conductedBy: AUDITEUR,
      mode: 'sur_site',
      personName: options.personName,
      personRole: 'Responsable fictif',
      personServiceId: null,
      personEmail: null,
      participants: null,
      generalNotes: null,
      linkedReviewAnswerId: null,
      documentRequestId: null,
      consentGiven: true,
      consentAudio: false,
      consentedAt: HORODATAGE,
      informationNoticeVersion: 'v1',
      noticeShownAt: HORODATAGE,
      scheduledDurationMin: 45,
      startedAt: options.startedAt ?? HORODATAGE,
      endedAt: options.status === 'termine' ? HORODATAGE : null,
      valideeLe: options.valideeLe ?? null,
      clientCreatedAt: HORODATAGE,
    },
  });
}

/** Une réponse à-revoir, pour le compteur du §34.2. */
async function poserARevoir(missionId: string, interviewId: string, id: string): Promise<void> {
  await ecrireLocal({
    entite: 'answer',
    id,
    missionId,
    action: 'upsert',
    index: {
      interviewId,
      missionQuestionId: '0191e2a0-0000-7000-8000-00000000q001'.replace('q', '0'),
      flagReview: 1,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: null,
      note: null,
      reviewReason: 'À creuser avec la direction',
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: HORODATAGE,
    },
  });
}

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(13), {
    algo: 'argon2id',
    memoireKio: 1024,
    iterations: 1,
    parallelisme: 1,
    longueurOctets: 32,
  });
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  base = new BaseLocale(NOM_BASE);
  await base.open();
  installerContexteLocal({ base, coffre });
}, 20_000);

beforeEach(async () => {
  await base.missions.clear();
  await base.orgUnits.clear();
  await base.interviews.clear();
  await base.answers.clear();
  await base.outbox.clear();
  await descendreMission(MISSION_A, UNITE_A, 'Europe/Paris');
  await descendreMission(MISSION_B, UNITE_B, 'Asia/Ho_Chi_Minh');
});

afterAll(async () => {
  retirerContexteLocal();
  base.close();
  await Dexie.delete(NOM_BASE);
});

// ─────────────────────────────────────────────────────────────────────────────
// A. L'AGRÉGATION TOUTES MISSIONS CONFONDUES
// ─────────────────────────────────────────────────────────────────────────────
describe('le cockpit agrège toutes les missions embarquées (03 §34.2)', () => {
  it('@critique les sessions de DEUX missions apparaissent dans une seule liste', async () => {
    await poserSession({
      id: idSession(1),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Première personne',
    });
    await poserSession({
      id: idSession(2),
      missionId: MISSION_B,
      orgUnitId: UNITE_B,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T08:00:00.000Z',
      personName: 'Seconde personne',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);

    expect(journee.missions).toHaveLength(2);
    expect(journee.sessionsDuJour).toHaveLength(2);
  });

  it('@critique le tri se fait APRÈS le mélange — sinon l’auditeur lit sa matinée deux fois', async () => {
    // Mission A à 14 h, mission B à 8 h. Un tri par mission rendrait A avant B ;
    // le tri global doit rendre B (8 h) avant A (14 h).
    await poserSession({
      id: idSession(3),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T14:00:00.000Z',
      personName: 'Rendez-vous de l’après-midi',
    });
    await poserSession({
      id: idSession(4),
      missionId: MISSION_B,
      orgUnitId: UNITE_B,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T08:00:00.000Z',
      personName: 'Rendez-vous du matin',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.sessionsDuJour.map((s) => s.personName)).toEqual([
      'Rendez-vous du matin',
      'Rendez-vous de l’après-midi',
    ]);
  });

  it('une session sans créneau reste visible, en fin de liste (03 §17.3, zéro oubli)', async () => {
    await poserSession({
      id: idSession(5),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'en_cours',
      scheduledAt: null,
      personName: 'Imprévu du jour',
    });
    await poserSession({
      id: idSession(6),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Rendez-vous prévu',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.sessionsDuJour.at(-1)?.personName).toBe('Imprévu du jour');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LES TROIS ALERTES, ET PAS UNE QUATRIÈME
// ─────────────────────────────────────────────────────────────────────────────
describe('les alertes personnelles sont les TROIS du §34.2, calculées localement', () => {
  it('@critique un entretien COMMENCÉ non terminé lève son alerte, et pointe la session', async () => {
    await poserSession({
      id: idSession(10),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'en_cours',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Entretien inachevé',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    const alerte = journee.alertes.find((a) => a.nature === 'entretien_non_termine');

    expect(alerte).toBeDefined();
    expect(alerte?.cible).toEqual({ type: 'session', id: idSession(10) });
    expect(alerte?.message).toContain('Entretien inachevé');
  });

  it('@critique des à-revoir ouverts lèvent leur alerte, avec leur nombre', async () => {
    await poserSession({
      id: idSession(11),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'termine',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Entretien terminé',
    });
    await poserARevoir(MISSION_A, idSession(11), '0191e2a0-0000-7000-8000-00000000d001');
    await poserARevoir(MISSION_A, idSession(11), '0191e2a0-0000-7000-8000-00000000d002');

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    const alerte = journee.alertes.find((a) => a.nature === 'a_revoir_en_attente');

    expect(alerte).toBeDefined();
    expect(alerte?.message).toContain('2 point(s)');
    expect(alerte?.cible).toEqual({ type: 'mission' });
  });

  it('@critique une file NON VIDE sur un appareil jamais synchronisé lève l’alerte de l’invariant 8', async () => {
    await poserSession({
      id: idSession(12),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Session non remontée',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.alertes.some((a) => a.nature === 'sync_muette')).toBe(true);
  });

  it('aucune alerte n’est inventée : sans matière, la liste est vide', async () => {
    // Aucune session, aucune réponse, aucune op : rien à signaler. Un cockpit qui
    // alerterait sur une journée vide apprendrait à l'auditeur à ignorer ses
    // alertes — c'est ainsi qu'un garde-fou meurt.
    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.alertes).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C et D. REPRENDRE, ET CE QUI EST À VALIDER
// ─────────────────────────────────────────────────────────────────────────────
describe('reprendre là où l’on s’est arrêté, et la matière de la validation groupée', () => {
  it('@critique « reprendre » désigne la session EN COURS la plus récemment commencée', async () => {
    await poserSession({
      id: idSession(20),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'en_cours',
      scheduledAt: '2026-09-04T08:00:00.000Z',
      personName: 'Commencée le matin',
      startedAt: '2026-09-04T08:05:00.000Z',
    });
    await poserSession({
      id: idSession(21),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'en_cours',
      scheduledAt: '2026-09-04T11:00:00.000Z',
      personName: 'Commencée juste avant',
      startedAt: '2026-09-04T11:05:00.000Z',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.aReprendre?.personName).toBe('Commencée juste avant');
  });

  it('sans session en cours, il n’y a rien à reprendre — et c’est `null`, pas la première venue', async () => {
    await poserSession({
      id: idSession(22),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'termine',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Terminée',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.aReprendre).toBeNull();
  });

  it('@critique `aValider` ne contient QUE les terminées NON validées', async () => {
    await poserSession({
      id: idSession(23),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'termine',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'À valider',
    });
    await poserSession({
      id: idSession(24),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'termine',
      scheduledAt: '2026-09-04T10:00:00.000Z',
      personName: 'Déjà validée',
      valideeLe: HORODATAGE,
    });
    await poserSession({
      id: idSession(25),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'en_cours',
      scheduledAt: '2026-09-04T11:00:00.000Z',
      personName: 'Encore en cours',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.aValider.map((s) => s.personName)).toEqual(['À valider']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LE PORT NE MENT PAS, LE COMPTEUR EST VRAI
// ─────────────────────────────────────────────────────────────────────────────
describe('aucune pastille ne verdit sans serveur (LOT_L5.md §3.6)', () => {
  it('@critique le statut reste `indisponible` alors que le compte d’opérations est VRAI', async () => {
    await poserSession({
      id: idSession(30),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Session locale',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    const etatA = journee.missions.find((m) => m.mission.id === MISSION_A);

    expect(etatA?.sync.statut).toBe('indisponible');
    expect(etatA?.sync.derniereSyncReussieLe).toBeNull();
    // Le compte n'est PAS `null` et n'est PAS supposé : il est lu dans l'outbox.
    expect(etatA?.sync.operationsEnAttente).toBe(1);
  });

  it('le compte d’opérations est par MISSION, jamais global', async () => {
    await poserSession({
      id: idSession(31),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Sur A',
    });
    await poserSession({
      id: idSession(32),
      missionId: MISSION_B,
      orgUnitId: UNITE_B,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'Sur B',
    });
    await poserSession({
      id: idSession(33),
      missionId: MISSION_B,
      orgUnitId: UNITE_B,
      status: 'non_demarre',
      scheduledAt: '2026-09-04T10:00:00.000Z',
      personName: 'Encore sur B',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(journee.missions.find((m) => m.mission.id === MISSION_A)?.sync.operationsEnAttente).toBe(
      1,
    );
    expect(journee.missions.find((m) => m.mission.id === MISSION_B)?.sync.operationsEnAttente).toBe(
      2,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. LE RAPPEL DE FIN DE JOURNÉE
// ─────────────────────────────────────────────────────────────────────────────
describe('le rappel du rituel (03 §34.2-2) — discret, et qui s’éteint', () => {
  it('@critique il se déclenche quand il reste quelque chose à protéger', async () => {
    await poserSession({
      id: idSession(40),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'termine',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'À valider',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(rappelFinDeJournee(null, journee, HORODATAGE)).not.toBeNull();
  });

  it('@critique il se TAIT quand le rituel a déjà été fait AUJOURD’HUI', async () => {
    await poserSession({
      id: idSession(41),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'termine',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'À valider',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(rappelFinDeJournee('2026-09-04T12:00:00.000Z', journee, HORODATAGE)).toBeNull();
  });

  it('un rituel fait HIER ne dispense pas de celui d’aujourd’hui', async () => {
    await poserSession({
      id: idSession(42),
      missionId: MISSION_A,
      orgUnitId: UNITE_A,
      status: 'termine',
      scheduledAt: '2026-09-04T09:00:00.000Z',
      personName: 'À valider',
    });

    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(rappelFinDeJournee('2026-09-03T20:00:00.000Z', journee, HORODATAGE)).not.toBeNull();
  });

  it('sans rien à protéger, aucun rappel — un rappel permanent n’est plus un rappel', async () => {
    const journee = await construireJournee(creerPortSyncInerte(), HORODATAGE);
    expect(rappelFinDeJournee(null, journee, HORODATAGE)).toBeNull();
  });
});
