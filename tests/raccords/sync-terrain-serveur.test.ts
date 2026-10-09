// =============================================================================
// RACCORDS SYNC TERRAIN ↔ SERVEUR — lot L6, incrément L6b (A26).
//
// Pourquoi ce fichier vit à la RACINE : chaque image Docker ne voit que son
// espace de travail. L'image du terrain lance `tsc --noEmit` sur apps/field ;
// un test de apps/field qui importe apps/api casse sa construction (décision
// A01 du 2026-10-09 : on ne couple pas l'image terrain à l'API). Ici, et ici
// seulement, le terrain est comparé à la SOURCE serveur — jamais à une copie.
//
//   1. chaque charge MONTANTE produite par le port d'écriture terrain passe le
//      schéma de charge que le serveur applique (`SCHEMAS_CHARGE_SYNC`,
//      `apps/api/src/sync/charges.ts`) — déplacé de `montee.test.ts` ;
//   2. `ROLES_SUR_MISSION` du terrain (`sync/descente.ts`) EST l'énumération
//      de `role_on_mission` du schéma serveur — déplacé de `revue-a29-l6b.test.ts`.
//
// Traçabilité : E7 ; 11 §4 ; invariant 1 (ids client).
// =============================================================================
// ── LE HARNAIS, ET POURQUOI IL CHARGE LE TERRAIN DYNAMIQUEMENT ──────────────
// La racine n'a ni `fake-indexeddb`, ni `dexie`, ni `uuidv7` en dépendance (et
// en ajouter relève de 11 §8). L'IndexedDB factice est donc résolu DEPUIS
// l'espace de travail terrain (`createRequire` sur son package.json), AVANT que
// Dexie ne soit chargé : Dexie lit `indexedDB` au chargement de son module, d'où
// les imports dynamiques du terrain dans `beforeAll`. Les identifiants sont des
// UUID v7 fictifs à compteur ; la base est détruite par `base.delete()`.
import { createRequire } from 'node:module';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLES_SUR_MISSION as ROLES_SERVEUR } from '../../apps/api/src/db/schema.js';
import { SCHEMAS_CHARGE_SYNC } from '../../apps/api/src/sync/charges.js';
import type { BaseLocale } from '../../apps/field/src/local/base.js';
import type { Coffre } from '../../apps/field/src/local/coffre.js';

createRequire(new URL('../../apps/field/package.json', import.meta.url))('fake-indexeddb/auto');

import type * as ModuleBaseNs from '../../apps/field/src/local/base.js';
type ModuleBase = typeof ModuleBaseNs;
import type * as ModuleCoffreNs from '../../apps/field/src/local/coffre.js';
type ModuleCoffre = typeof ModuleCoffreNs;
import type * as ModuleContratNs from '../../apps/field/src/local/contrat-sync.js';
type ModuleContrat = typeof ModuleContratNs;
import type * as ModuleContexteNs from '../../apps/field/src/local/contexte.js';
type ModuleContexte = typeof ModuleContexteNs;
import type * as ModuleEcritureNs from '../../apps/field/src/local/ecriture.js';
type ModuleEcriture = typeof ModuleEcritureNs;
import type * as ModuleDescenteNs from '../../apps/field/src/sync/descente.js';
type ModuleDescente = typeof ModuleDescenteNs;
import type * as ModuleMonteeNs from '../../apps/field/src/sync/montee.js';
type ModuleMontee = typeof ModuleMonteeNs;

let terrain: {
  base: ModuleBase;
  coffre: ModuleCoffre;
  contrat: ModuleContrat;
  contexte: ModuleContexte;
  ecriture: ModuleEcriture;
  descente: ModuleDescente;
  montee: ModuleMontee;
};

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const ORG_UNIT = '0191e2a0-0000-7000-8000-00000000c001';
const AUDITEUR = '0191e2a0-0000-7000-8000-00000000e001';
const CREE_LE = '2026-10-09T07:00:00.000Z';

let compteurId = 0;
/** Un UUID v7 FICTIF, unique dans ce fichier (invariant 2 : aucune donnée réelle). */
function uuidv7(): string {
  compteurId += 1;
  return `0191e2a0-0000-7000-8000-${compteurId.toString(16).padStart(12, '0')}`;
}

let coffre: Coffre;
let base: BaseLocale;

beforeAll(async () => {
  terrain = {
    base: await import('../../apps/field/src/local/base.js'),
    coffre: await import('../../apps/field/src/local/coffre.js'),
    contrat: await import('../../apps/field/src/local/contrat-sync.js'),
    contexte: await import('../../apps/field/src/local/contexte.js'),
    ecriture: await import('../../apps/field/src/local/ecriture.js'),
    descente: await import('../../apps/field/src/sync/descente.js'),
    montee: await import('../../apps/field/src/sync/montee.js'),
  };
  const kek = await terrain.coffre.deriverKek(
    'correct-cheval-pile-agrafe-2026',
    new Uint8Array(16).fill(43),
  );
  coffre = await terrain.coffre.ouvrirCoffre(kek, await terrain.coffre.creerDekEnveloppee(kek));
});

beforeEach(async () => {
  base = new terrain.base.BaseLocale(`axion-test-raccord-sync-${uuidv7()}`);
  await base.open();
  terrain.contexte.installerContexteLocal({ base, coffre });
});

afterEach(async () => {
  await base.delete();
});

const RACCORD = SCHEMAS_CHARGE_SYNC;

describe('raccord montée — chaque charge produite est acceptée par la liste du serveur', () => {
  it('la source serveur couvre EXACTEMENT les cinq entités montantes', () => {
    expect(Object.keys(RACCORD).sort()).toEqual([...terrain.contrat.ENTITES_SYNC].sort());
  });

  it('les cinq entités, écrites par le port d’écriture, passent la liste fermée', async () => {
    await terrain.ecriture.ecrireLocal({
      entite: 'interview',
      id: uuidv7(),
      missionId: MISSION,
      action: 'upsert',
      index: {
        orgUnitId: ORG_UNIT,
        kind: 'entretien',
        status: 'en_cours',
        scheduleStatus: 'planifie',
        scheduledAt: null,
      },
      charge: {
        conductedBy: AUDITEUR,
        mode: 'sur_site',
        personName: 'Interlocuteur fictif',
        personRole: null,
        personServiceId: null,
        personEmail: null,
        participants: null,
        generalNotes: null,
        linkedReviewAnswerId: null,
        documentRequestId: null,
        consentGiven: true,
        consentAudio: false,
        consentedAt: null,
        informationNoticeVersion: null,
        noticeShownAt: null,
        scheduledDurationMin: null,
        startedAt: null,
        endedAt: null,
        valideeLe: CREE_LE,
        clientCreatedAt: CREE_LE,
      },
    });
    await terrain.ecriture.ecrireLocal({
      entite: 'answer',
      id: uuidv7(),
      missionId: MISSION,
      action: 'upsert',
      index: {
        interviewId: uuidv7(),
        missionQuestionId: uuidv7(),
        flagReview: 0,
        notApplicable: 1,
        withheld: 0,
        horsParcours: 1,
      },
      charge: {
        value: null,
        note: null,
        reviewReason: null,
        naReason: 'Sans objet (fictif).',
        withheldReason: null,
        source: 'observation',
        questionTextSnapshot: 'Question fictive ?',
        revision: 2,
        clientCreatedAt: CREE_LE,
      },
    });
    await terrain.ecriture.ecrireLocal({
      entite: 'attachment_meta',
      id: uuidv7(),
      missionId: MISSION,
      action: 'upsert',
      index: { interviewId: uuidv7(), answerId: null, kind: 'photo' },
      charge: {
        content: null,
        filename: 'photo-fictive.jpg',
        mime: 'image/jpeg',
        sizeBytes: 1024,
        storageKey: 'local/fictif',
        purgeAfter: null,
        createdBy: AUDITEUR,
        clientCreatedAt: CREE_LE,
      },
    });
    await terrain.ecriture.ecrireLocal({
      entite: 'org_unit_proposal',
      id: uuidv7(),
      missionId: MISSION,
      action: 'upsert',
      index: { parentId: ORG_UNIT, kind: 'equipe', status: 'proposee', position: 2 },
      charge: {
        name: 'Équipe fictive',
        countryCode: null,
        timezone: null,
        headcount: null,
        serviceRefId: null,
        sectorId: null,
        inScope: true,
        proposedBy: AUDITEUR,
        mergedIntoId: null,
        clientCreatedAt: CREE_LE,
      },
    });
    await terrain.ecriture.ecrireLocal({
      entite: 'question_adhoc',
      id: uuidv7(),
      missionId: MISSION,
      action: 'upsert',
      index: {
        position: 5,
        texteSnapshot: 'Question à choix fictive ?',
        motsCles: [],
        answerType: 'single_choice',
        criticality: 'informatif',
      },
      charge: {
        questionId: uuidv7(),
        questionVersion: 1,
        guidanceSnapshot: 'Consigne fictive.',
        optionsSnapshot: [
          { code: 'oui', label: 'Oui', score: null },
          { code: 'non', label: 'Non', score: null },
        ],
        scoringSnapshot: null,
        weightSnapshot: 0,
        allowRangeSnapshot: false,
        addedAdHoc: true,
        blockCode: 'BLOC-FICTIF',
      },
    });

    const lignes = await base.outbox.toArray();
    expect(lignes).toHaveLength(5);
    for (const ligne of lignes) {
      const op = await terrain.montee.operationDeLigne(ligne, coffre);
      const verdict = RACCORD[op.entity].safeParse(op.payload);
      expect(verdict.success, `${op.entity} : ${JSON.stringify(verdict.error?.issues ?? [])}`).toBe(
        true,
      );
    }
  });
});

describe('raccord rôles — l’énumération terrain est celle du schéma serveur', () => {
  it('@critique ROLES_SUR_MISSION (terrain) = l’énumération de role_on_mission du schéma serveur', () => {
    expect(terrain.descente.ROLES_SUR_MISSION).toEqual(ROLES_SERVEUR);
    // Anti-vacuité : la source serveur n'est pas vide.
    expect(ROLES_SERVEUR.length).toBeGreaterThan(1);
  });
});
