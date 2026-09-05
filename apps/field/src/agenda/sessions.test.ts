// =============================================================================
// AGENDA, SIX TYPES DE SESSION, PROPOSITION D'UNITÉ — L5c. Écrit par A23.
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. LES SIX `kind` (03 §27.1 + §28.1) sont tous créables HORS LIGNE, chacun
//      avec un UUID v7 client et une op d'outbox.
//   B. LA DISTINCTION §32.6-1 : `mode` n'existe QUE pour `kind='entretien'`.
//      C'est la collision interne que la V2.2 a résolue ; la refaire serait la
//      régression la plus facile du lot.
//   C. L'ENTRETIEN COMPLÉMENTAIRE (§25.6 N6) porte `linkedReviewAnswerId` ET le
//      mode `complementaire` — jamais l'un sans l'autre.
//   D. L'ANTI-COLLISION EST UN AVERTISSEMENT (§25.2, §34.6, §19.1) : elle rend
//      une liste, elle ne lève JAMAIS, et la session se crée quand même. C'est
//      un critère de la porte P-C (§33.7 : aucun verrou).
//   E. LA PROPOSITION D'UNITÉ (§25.3) naît `proposee`, porte son auteur, et
//      reste DANS le périmètre — le siège qualifie, le terrain propose.
//
// Traçabilité : E12 (entretiens par interlocuteur), E6 (hors ligne total),
// E23 (novice < 30 min).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { depotSessions, type SessionLocale } from '../local/depots/sessions.js';
import { appliquerDescente } from '../local/ecriture.js';
import { TYPES_DE_SESSION } from '../local/formes.js';
import { chevauchements, modeApplicable, planifierSession } from './sessions.js';
import { proposerUnite } from './unites.js';

const HORODATAGE = '2026-09-04T07:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f4de';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-00000000c301';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e301';
const REPONSE_A_REVOIR = '0191e2a0-0000-7000-8000-00000000d301';
const NOM_BASE = 'axion-test-l5c-agenda';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let base: BaseLocale;
let coffre: Coffre;

async function descendreLeSocle(): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: HORODATAGE,
    prochainSince: null,
    enregistrements: [
      {
        table: 'orgUnits',
        index: {
          id: ORG_UNIT_ID,
          missionId: MISSION_ID,
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
          headcount: 8,
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

async function relire(id: string): Promise<SessionLocale> {
  const session = await depotSessions.parId(id);
  if (session === null) throw new Error(`session ${id} introuvable`);
  return session;
}

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(9), {
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
  await descendreLeSocle();
}, 20_000);

beforeEach(async () => {
  await base.interviews.clear();
  await base.outbox.clear();
});

afterAll(async () => {
  retirerContexteLocal();
  base.close();
  await Dexie.delete(NOM_BASE);
});

// ─────────────────────────────────────────────────────────────────────────────
// A et B. LES SIX TYPES, ET LE MODE QUI N'APPARTIENT QU'À L'ENTRETIEN
// ─────────────────────────────────────────────────────────────────────────────
describe('les six types de session de collecte (03 §27.1, §28.1)', () => {
  it('@critique les six `kind` du 04 sont tous planifiables hors ligne', async () => {
    expect(TYPES_DE_SESSION).toHaveLength(6);

    for (const kind of TYPES_DE_SESSION) {
      const id = await planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind,
        conductedBy: AUDITEUR_ID,
        scheduledAt: HORODATAGE,
        dureeMin: 45,
        personName: kind === 'atelier' ? null : 'Interlocuteur fictif',
        personRole: kind === 'atelier' ? null : 'Responsable fictif',
        participants:
          kind === 'atelier' ? [{ nom: 'Participant fictif', fonction: 'Opérateur' }] : null,
      });

      expect(id).toMatch(UUID_V7);
      const session = await relire(id);
      expect(session.kind).toBe(kind);
      expect(session.status).toBe('non_demarre');
      expect(session.scheduleStatus).toBe('planifie');
    }
  });

  it('@critique `mode` est renseigné pour un entretien et NUL pour les cinq autres (03 §32.6-1)', async () => {
    for (const kind of TYPES_DE_SESSION) {
      const id = await planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind,
        conductedBy: AUDITEUR_ID,
        scheduledAt: HORODATAGE,
        dureeMin: null,
        // Un mode est fourni pour TOUS : le module doit l'ignorer là où il ne
        // s'applique pas, plutôt que de le recopier docilement.
        mode: 'distanciel',
        participants: kind === 'atelier' ? [{ nom: 'P', fonction: 'F' }] : null,
      });

      const session = await relire(id);
      if (kind === 'entretien') {
        expect(session.mode).toBe('distanciel');
        expect(modeApplicable(kind)).toBe(true);
      } else {
        expect(session.mode).toBeNull();
        expect(modeApplicable(kind)).toBe(false);
      }
    }
  });

  it('@critique un atelier porte ses PARTICIPANTS, les autres types n’en portent pas (03 §28.1-3)', async () => {
    const atelier = await relire(
      await planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind: 'atelier',
        conductedBy: AUDITEUR_ID,
        scheduledAt: HORODATAGE,
        dureeMin: 120,
        participants: [
          { nom: 'Première participante', fonction: 'Opératrice' },
          { nom: 'Second participant', fonction: 'Chef d’équipe' },
        ],
      }),
    );
    expect(atelier.participants).toHaveLength(2);

    const observation = await relire(
      await planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind: 'observation',
        conductedBy: AUDITEUR_ID,
        scheduledAt: HORODATAGE,
        dureeMin: 60,
        participants: [{ nom: 'Ignoré', fonction: 'Ignorée' }],
      }),
    );
    expect(observation.participants).toBeNull();
  });

  it('@critique un atelier SANS participant est refusé — un atelier collectif suppose un collectif', async () => {
    await expect(
      planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind: 'atelier',
        conductedBy: AUDITEUR_ID,
        scheduledAt: HORODATAGE,
        dureeMin: 120,
        participants: [],
      }),
    ).rejects.toThrow(/participant/i);
  });

  it('une session sans créneau reste « à planifier » et existe quand même (03 §17.3)', async () => {
    const session = await relire(
      await planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind: 'entretien',
        conductedBy: AUDITEUR_ID,
        scheduledAt: null,
        dureeMin: null,
      }),
    );
    expect(session.scheduleStatus).toBe('a_planifier');
    expect(session.scheduledAt).toBeNull();
  });

  it('@critique chaque planification pousse UNE op `interview` — donc synchronisable plus tard', async () => {
    await planifierSession({
      missionId: MISSION_ID,
      orgUnitId: ORG_UNIT_ID,
      kind: 'releve_donnees',
      conductedBy: AUDITEUR_ID,
      scheduledAt: HORODATAGE,
      dureeMin: 30,
    });
    const ops = await base.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.entite).toBe('interview');
    expect(ops[0]?.statut).toBe('en_attente');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. L'ENTRETIEN COMPLÉMENTAIRE
// ─────────────────────────────────────────────────────────────────────────────
describe('entretien complémentaire — un MODE, jamais un type (03 §25.6 N6, §32.6-1)', () => {
  it('@critique il porte le mode `complementaire` ET la réponse à-revoir qu’il lève', async () => {
    const session = await relire(
      await planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind: 'entretien',
        conductedBy: AUDITEUR_ID,
        scheduledAt: HORODATAGE,
        dureeMin: 30,
        mode: 'complementaire',
        personName: 'Interlocuteur fictif',
        personRole: 'Responsable fictif',
        linkedReviewAnswerId: REPONSE_A_REVOIR,
      }),
    );

    expect(session.kind).toBe('entretien');
    expect(session.mode).toBe('complementaire');
    expect(session.linkedReviewAnswerId).toBe(REPONSE_A_REVOIR);
  });

  it('@critique rattacher un à-revoir SANS le mode complémentaire est refusé', async () => {
    await expect(
      planifierSession({
        missionId: MISSION_ID,
        orgUnitId: ORG_UNIT_ID,
        kind: 'entretien',
        conductedBy: AUDITEUR_ID,
        scheduledAt: HORODATAGE,
        dureeMin: 30,
        mode: 'sur_site',
        linkedReviewAnswerId: REPONSE_A_REVOIR,
      }),
    ).rejects.toThrow(/complémentaire/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. L'ANTI-COLLISION NE BLOQUE JAMAIS
// ─────────────────────────────────────────────────────────────────────────────
describe('anti-collision d’agenda — un avertissement, jamais un verrou (§25.2, §34.6, §19.1)', () => {
  const CRENEAU = '2026-09-04T09:00:00.000Z';

  async function poser(personName: string, quand: string, duree: number): Promise<string> {
    return planifierSession({
      missionId: MISSION_ID,
      orgUnitId: ORG_UNIT_ID,
      kind: 'entretien',
      conductedBy: AUDITEUR_ID,
      scheduledAt: quand,
      dureeMin: duree,
      personName,
      personRole: 'Responsable fictif',
    });
  }

  it('@critique un chevauchement sur la MÊME personne est signalé', async () => {
    await poser('Même personne', CRENEAU, 60);
    const existantes = await depotSessions.duJour({ missionId: MISSION_ID, instantIso: CRENEAU });

    const trouves = chevauchements(
      {
        orgUnitId: '0191e2a0-0000-7000-8000-00000000c999',
        personName: 'Même personne',
        scheduledAt: '2026-09-04T09:30:00.000Z',
        scheduledDurationMin: 60,
      },
      existantes,
    );
    expect(trouves).toHaveLength(1);
    expect(trouves[0]?.message).toMatch(/déjà une session/i);
  });

  it('@critique un chevauchement sur la MÊME unité est signalé (03 §34.6)', async () => {
    await poser('Première personne', CRENEAU, 60);
    const existantes = await depotSessions.duJour({ missionId: MISSION_ID, instantIso: CRENEAU });

    const trouves = chevauchements(
      {
        orgUnitId: ORG_UNIT_ID,
        personName: 'Autre personne',
        scheduledAt: '2026-09-04T09:15:00.000Z',
        scheduledDurationMin: 30,
      },
      existantes,
    );
    expect(trouves).toHaveLength(1);
  });

  it('@critique DEUX créneaux qui ne se touchent pas ne sont pas un chevauchement', async () => {
    await poser('Même personne', CRENEAU, 60);
    const existantes = await depotSessions.duJour({ missionId: MISSION_ID, instantIso: CRENEAU });

    expect(
      chevauchements(
        {
          orgUnitId: ORG_UNIT_ID,
          personName: 'Même personne',
          scheduledAt: '2026-09-04T10:00:00.000Z',
          scheduledDurationMin: 60,
        },
        existantes,
      ),
    ).toHaveLength(0);
  });

  it('@critique MALGRÉ le chevauchement, la session se planifie — aucun verrou', async () => {
    await poser('Même personne', CRENEAU, 60);
    const id = await poser('Même personne', '2026-09-04T09:30:00.000Z', 60);

    expect(id).toMatch(UUID_V7);
    expect((await relire(id)).scheduleStatus).toBe('planifie');
  });

  it('une session ANNULÉE ne provoque plus de chevauchement', async () => {
    const id = await poser('Même personne', CRENEAU, 60);
    const session = await relire(id);

    expect(
      chevauchements(
        {
          orgUnitId: ORG_UNIT_ID,
          personName: 'Même personne',
          scheduledAt: CRENEAU,
          scheduledDurationMin: 60,
        },
        [{ ...session, scheduleStatus: 'annule' }],
      ),
    ).toHaveLength(0);
  });

  it('une session sans créneau ne chevauche rien, et rien ne la chevauche', () => {
    expect(
      chevauchements(
        {
          orgUnitId: ORG_UNIT_ID,
          personName: 'Quelqu’un',
          scheduledAt: null,
          scheduledDurationMin: 60,
        },
        [],
      ),
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LA PROPOSITION D'UNITÉ
// ─────────────────────────────────────────────────────────────────────────────
describe('proposition d’unité depuis le terrain (03 §25.3)', () => {
  it('@critique l’unité naît `proposee`, porte son auteur, et reste DANS le périmètre', async () => {
    const id = await proposerUnite({
      missionId: MISSION_ID,
      nom: 'Atelier de conditionnement',
      kind: 'equipe',
      parentId: ORG_UNIT_ID,
      effectifEstime: 6,
      proposeePar: AUDITEUR_ID,
      position: 900,
    });

    expect(id).toMatch(UUID_V7);
    const ligne = await base.orgUnits.get(id);
    expect(ligne?.status).toBe('proposee');
    expect(ligne?.parentId).toBe(ORG_UNIT_ID);

    const charge = await coffre.dechiffrer(
      ligne?.charge ?? { v: 1, n: '', c: '' },
      (await import('../local/formes.js')).chargeOrgUnitSchema,
    );
    expect(charge.name).toBe('Atelier de conditionnement');
    expect(charge.proposedBy).toBe(AUDITEUR_ID);
    expect(charge.headcount).toBe(6);
    // Une unité proposée entre dans la couverture tant que le siège ne dit pas
    // le contraire : la sortir du périmètre ferait disparaître les entretiens
    // qu'on vient d'y rattacher.
    expect(charge.inScope).toBe(true);
  });

  it('@critique une session se rattache IMMÉDIATEMENT à une unité proposée (§25.3)', async () => {
    const uniteId = await proposerUnite({
      missionId: MISSION_ID,
      nom: 'Unité proposée',
      kind: 'service',
      parentId: null,
      effectifEstime: null,
      proposeePar: AUDITEUR_ID,
      position: 901,
    });

    const sessionId = await planifierSession({
      missionId: MISSION_ID,
      orgUnitId: uniteId,
      kind: 'entretien',
      conductedBy: AUDITEUR_ID,
      scheduledAt: HORODATAGE,
      dureeMin: 45,
      personName: 'Interlocuteur fictif',
      personRole: 'Responsable fictif',
    });

    expect((await relire(sessionId)).orgUnitId).toBe(uniteId);
  });

  it('@critique la proposition pousse une op `org_unit_proposal` — le siège qualifiera', async () => {
    await base.outbox.clear();
    await proposerUnite({
      missionId: MISSION_ID,
      nom: 'Unité à qualifier',
      kind: 'poste',
      parentId: null,
      effectifEstime: 1,
      proposeePar: AUDITEUR_ID,
      position: 902,
    });

    const ops = await base.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.entite).toBe('org_unit_proposal');
  });

  it('une unité sans nom est refusée — le siège n’aurait rien à qualifier', async () => {
    await expect(
      proposerUnite({
        missionId: MISSION_ID,
        nom: '   ',
        kind: 'service',
        parentId: null,
        effectifEstime: null,
        proposeePar: AUDITEUR_ID,
        position: 903,
      }),
    ).rejects.toThrow(/nom/i);
  });

  it('un effectif négatif est refusé', async () => {
    await expect(
      proposerUnite({
        missionId: MISSION_ID,
        nom: 'Unité fictive',
        kind: 'service',
        parentId: null,
        effectifEstime: -3,
        proposeePar: AUDITEUR_ID,
        position: 904,
      }),
    ).rejects.toThrow(/effectif/i);
  });
});
