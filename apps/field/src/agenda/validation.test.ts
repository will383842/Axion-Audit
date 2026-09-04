// =============================================================================
// VALIDATION D'ENTRETIEN — lot L5, incrément L5c. **ÉCRIT AVANT LE CODE** (TDD,
// `CLAUDE.md` §4 : « machine à états : tests écrits AVANT »).
//
// ── AUTEUR, ET LA LIMITE QU'IL FAUT CONNAÎTRE ────────────────────────────────
// Écrit par A23, c'est-à-dire par l'agent qui écrit AUSSI le code testé. 09 §5.6
// veut le contraire, et a raison. Deux choses le rendent acceptable ICI, et
// aucune ne le rendrait acceptable ailleurs : `CLAUDE.md` §4 exige le TDD sur la
// machine à états, donc quelqu'un doit écrire ces tests AVANT que le code
// existe ; et A26/A27 passeront derrière, sans lire ce fichier. Il est signalé
// comme tel dans le rapport d'auto-revue — un test écrit par l'auteur du code
// prouve moins qu'un test croisé, et le dire fait partie du test.
//
// ── CE QUE CE FICHIER PROUVE ─────────────────────────────────────────────────
//   A. TERMINER ≠ VALIDER (03 §19.1, V2.10). Une session TERMINÉE se rouvre
//      LIBREMENT, sans motif et sans révision — c'est la « note de couloir dix
//      minutes après ». Une session VALIDÉE est verrouillée.
//   B. Les DEUX PROFILS (03 §19.1). `guide_strict` n'a « aucune dérogation » ;
//      `expert` contourne AVEC MOTIF OBLIGATOIRE. Le refus dit ce qui manque,
//      jamais un booléen muet.
//   C. La VALIDATION GROUPÉE (03 §19.1 V2.10, §34.2) : les entretiens terminés
//      du jour, cochés, UNE confirmation, UN récapitulatif cumulé — et une
//      session non validable n'empêche JAMAIS les autres de passer.
//   D. L'INVARIANT 7 : aucun geste de ce module ne détruit une saisie. Rouvrir
//      ne supprime aucune réponse ; déverrouiller non plus.
//   E. L'INVARIANT 1 : chaque geste est une écriture LOCALE + une op d'outbox,
//      dans une transaction — donc utilisable en mode avion, et remontable plus
//      tard. Aucun aller-retour serveur nulle part.
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E12 (entretiens
// par interlocuteur), E6 (hors ligne total).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { depotSessions, type SessionLocale } from '../local/depots/sessions.js';
import { appliquerDescente } from '../local/ecriture.js';
import { etatSession } from '../session/machine.js';
import {
  deverrouillerSession,
  rouvrirSession,
  sessionsValidablesEnGroupe,
  syntheseDeValidation,
  terminerSession,
  validerEnGroupe,
  validerSession,
} from './validation.js';

const HORODATAGE = '2026-09-04T07:00:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f2de';
const ORG_UNIT_ID = '0191e2a0-0000-7000-8000-00000000c101';
const AUDITEUR_ID = '0191e2a0-0000-7000-8000-00000000e101';
const NOM_BASE = 'axion-test-l5c-validation';

let base: BaseLocale;
let coffre: Coffre;

/** Descend une mission FICTIVE (invariant 2) — aucune référence client. */
async function descendreLeSocle(): Promise<void> {
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: HORODATAGE,
    prochainSince: null,
    enregistrements: [
      {
        table: 'missions',
        index: {
          id: MISSION_ID,
          status: 'collecte',
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          titre: 'Mission fictive de recette',
          companyId: '0191e2a0-0000-7000-8000-00000000a101',
          timezone: 'Europe/Paris',
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

/**
 * Pose une session directement à l'état voulu, SANS passer par les fonctions
 * testées : un test qui construit son point de départ avec le code qu'il éprouve
 * ne prouve plus rien quand ce code se trompe.
 */
async function poserSession(
  id: string,
  etat: 'en_cours' | 'termine' | 'valide',
  personName = 'Interlocuteur fictif',
): Promise<SessionLocale> {
  await appliquerDescente({
    missionId: MISSION_ID,
    serverTime: HORODATAGE,
    prochainSince: null,
    enregistrements: [
      {
        table: 'interviews',
        index: {
          id,
          missionId: MISSION_ID,
          orgUnitId: ORG_UNIT_ID,
          kind: 'entretien',
          status: etat === 'valide' ? 'termine' : etat,
          scheduleStatus: 'planifie',
          scheduledAt: HORODATAGE,
          clientUpdatedAt: HORODATAGE,
          supprimeLe: null,
        },
        charge: {
          conductedBy: AUDITEUR_ID,
          mode: 'sur_site',
          personName,
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
          startedAt: HORODATAGE,
          endedAt: etat === 'en_cours' ? null : HORODATAGE,
          valideeLe: etat === 'valide' ? HORODATAGE : null,
          clientCreatedAt: HORODATAGE,
        },
      },
    ],
  });
  const session = await depotSessions.parId(id);
  if (session === null) throw new Error(`fixture : session ${id} absente`);
  return session;
}

/** Relit une session depuis la base — jamais depuis la valeur rendue. */
async function relire(id: string): Promise<SessionLocale> {
  const session = await depotSessions.parId(id);
  if (session === null) throw new Error(`session ${id} introuvable après écriture`);
  return session;
}

function idSession(rang: number): string {
  return `0191e2a0-0000-7000-8000-0000000001${rang.toString().padStart(2, '0')}`;
}

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(7), {
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
// A. TERMINER ≠ VALIDER
// ─────────────────────────────────────────────────────────────────────────────
describe('terminer ≠ valider (03 §19.1, règle V2.10)', () => {
  it('@critique « Terminer » laisse la session ROUVRABLE : elle n’est pas validée', async () => {
    const id = idSession(1);
    await terminerSession(await poserSession(id, 'en_cours'), 'guide_strict');

    const apres = await relire(id);
    expect(apres.status).toBe('termine');
    expect(apres.valideeLe).toBeNull();
    expect(etatSession(apres)).toBe('termine');
    expect(apres.endedAt).not.toBeNull();
  });

  it('@critique une session TERMINÉE se rouvre SANS motif et SANS révision — la note de couloir', async () => {
    const id = idSession(2);
    await rouvrirSession(await poserSession(id, 'termine'), 'guide_strict');

    const apres = await relire(id);
    expect(etatSession(apres)).toBe('en_cours');
    expect(apres.valideeLe).toBeNull();
  });

  it('@critique « Valider » VERROUILLE : la session passe à `valide` et porte son horodatage', async () => {
    const id = idSession(3);
    await validerSession(await poserSession(id, 'termine'), 'guide_strict');

    const apres = await relire(id);
    // Le 04 n'a pas de colonne `valide` : l'état est `termine` + `valideeLe`.
    expect(apres.status).toBe('termine');
    expect(apres.valideeLe).not.toBeNull();
    expect(etatSession(apres)).toBe('valide');
  });

  it('rouvrir efface l’horodatage de fin — une session rouverte n’est plus terminée', async () => {
    const id = idSession(4);
    await rouvrirSession(await poserSession(id, 'termine'), 'expert');
    expect((await relire(id)).endedAt).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LES TRANSITIONS INTERDITES, ET LES DEUX PROFILS
// ─────────────────────────────────────────────────────────────────────────────
describe('transitions refusées — un motif, jamais un cadenas muet (03 §19.1)', () => {
  it('@critique valider une session EN COURS est refusé : on termine d’abord', async () => {
    const session = await poserSession(idSession(10), 'en_cours');
    await expect(validerSession(session, 'expert')).rejects.toThrow(/termin/i);
  });

  it('@critique terminer une session déjà TERMINÉE est refusé', async () => {
    const session = await poserSession(idSession(11), 'termine');
    await expect(terminerSession(session, 'expert')).rejects.toThrow(/en cours/i);
  });

  it('@critique rouvrir une session VALIDÉE n’est PAS « rouvrir » : c’est un déverrouillage', async () => {
    const session = await poserSession(idSession(12), 'valide');
    await expect(rouvrirSession(session, 'expert')).rejects.toThrow(/terminée/i);
  });

  it('@critique en GUIDÉ STRICT, déverrouiller une session validée est refusé — aucune dérogation', async () => {
    const session = await poserSession(idSession(13), 'valide');
    await expect(deverrouillerSession(session, 'guide_strict', 'erreur de saisie')).rejects.toThrow(
      /guidé strict/i,
    );
    expect(etatSession(await relire(idSession(13)))).toBe('valide');
  });

  it('@critique en EXPERT, déverrouiller EXIGE un motif — un motif vide est refusé', async () => {
    const session = await poserSession(idSession(14), 'valide');
    await expect(deverrouillerSession(session, 'expert', '   ')).rejects.toThrow(/motif/i);
    expect(etatSession(await relire(idSession(14)))).toBe('valide');
  });

  it('@critique en EXPERT AVEC motif, le déverrouillage passe et la session redevient modifiable', async () => {
    const id = idSession(15);
    await deverrouillerSession(await poserSession(id, 'valide'), 'expert', 'correction convenue');

    const apres = await relire(id);
    expect(etatSession(apres)).toBe('en_cours');
    expect(apres.valideeLe).toBeNull();
  });

  it('un refus ne nomme JAMAIS un profil qui n’est pas celui de l’auditeur', async () => {
    const session = await poserSession(idSession(16), 'valide');
    await expect(deverrouillerSession(session, 'guide_strict', 'motif présent')).rejects.toThrow(
      /guidé strict/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. LA VALIDATION GROUPÉE
// ─────────────────────────────────────────────────────────────────────────────
describe('validation groupée — un geste, un récapitulatif cumulé (03 §19.1 V2.10, §34.2)', () => {
  it('@critique valide TOUTES les sessions terminées cochées, en une seule opération', async () => {
    const sessions = [
      await poserSession(idSession(20), 'termine', 'Premier interlocuteur'),
      await poserSession(idSession(21), 'termine', 'Deuxième interlocuteur'),
      await poserSession(idSession(22), 'termine', 'Troisième interlocuteur'),
    ];

    const resultat = await validerEnGroupe(sessions, 'guide_strict');

    expect(resultat.validees).toHaveLength(3);
    expect(resultat.refusees).toHaveLength(0);
    for (const session of sessions) {
      expect(etatSession(await relire(session.id))).toBe('valide');
    }
  });

  it('@critique une session non validable n’empêche PAS les autres de passer', async () => {
    const terminee = await poserSession(idSession(23), 'termine');
    const enCours = await poserSession(idSession(24), 'en_cours');

    const resultat = await validerEnGroupe([terminee, enCours], 'guide_strict');

    expect(resultat.validees).toEqual([terminee.id]);
    expect(resultat.refusees).toHaveLength(1);
    expect(resultat.refusees[0]?.id).toBe(enCours.id);
    expect(resultat.refusees[0]?.motif).toMatch(/[a-zéèêàç]/);

    expect(etatSession(await relire(terminee.id))).toBe('valide');
    expect(etatSession(await relire(enCours.id))).toBe('en_cours');
  });

  it('`sessionsValidablesEnGroupe` ne propose QUE les terminées non validées', async () => {
    const lot = [
      await poserSession(idSession(25), 'en_cours'),
      await poserSession(idSession(26), 'termine'),
      await poserSession(idSession(27), 'valide'),
    ];
    expect(sessionsValidablesEnGroupe(lot, 'guide_strict').map((s) => s.id)).toEqual([
      idSession(26),
    ]);
  });

  it('le récapitulatif cumulé compte les sessions et les personnes, sans rien inventer', async () => {
    const lot = [
      await poserSession(idSession(28), 'termine', 'Première personne'),
      await poserSession(idSession(29), 'termine', 'Deuxième personne'),
    ];
    const synthese = syntheseDeValidation(lot);

    expect(synthese.nombre).toBe(2);
    expect(synthese.personnes).toEqual(['Première personne', 'Deuxième personne']);
  });

  it('un lot VIDE ne valide rien et ne lève pas — le bouton se désarme, il ne casse pas', async () => {
    const resultat = await validerEnGroupe([], 'guide_strict');
    expect(resultat.validees).toHaveLength(0);
    expect(resultat.refusees).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. INVARIANT 7 — rien n'est jamais détruit
// ─────────────────────────────────────────────────────────────────────────────
describe('invariant 7 — aucun geste de validation ne détruit une saisie', () => {
  it('@critique rouvrir puis re-terminer conserve les notes générales et l’accord', async () => {
    const id = idSession(30);
    const session = await poserSession(id, 'termine');
    await rouvrirSession(session, 'guide_strict');
    await terminerSession(await relire(id), 'guide_strict');

    const apres = await relire(id);
    expect(apres.consentGiven).toBe(true);
    expect(apres.consentedAt).toBe(HORODATAGE);
    expect(apres.startedAt).toBe(HORODATAGE);
    expect(apres.personName).toBe('Interlocuteur fictif');
  });

  it('@critique déverrouiller une session validée conserve TOUT sauf le verrou', async () => {
    const id = idSession(31);
    await deverrouillerSession(await poserSession(id, 'valide'), 'expert', 'motif tracé');

    const apres = await relire(id);
    expect(apres.valideeLe).toBeNull();
    expect(apres.startedAt).toBe(HORODATAGE);
    expect(apres.scheduledDurationMin).toBe(45);
    expect(apres.informationNoticeVersion).toBe('v1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. INVARIANT 1 — chaque geste est une op locale, jamais un appel serveur
// ─────────────────────────────────────────────────────────────────────────────
describe('invariant 1 — la validation s’enregistre localement et se synchronise plus tard', () => {
  it('@critique chaque geste pousse UNE op `interview` dans l’outbox', async () => {
    const id = idSession(40);
    const session = await poserSession(id, 'en_cours');
    expect(await base.outbox.count()).toBe(0);

    await terminerSession(session, 'guide_strict');
    await validerSession(await relire(id), 'guide_strict');

    const ops = await base.outbox.toArray();
    expect(ops).toHaveLength(2);
    for (const op of ops) {
      expect(op.entite).toBe('interview');
      expect(op.entiteId).toBe(id);
      expect(op.action).toBe('upsert');
      expect(op.statut).toBe('en_attente');
    }
  });

  it('@critique une validation groupée de 3 sessions pousse 3 ops — aucune n’est perdue', async () => {
    const lot = [
      await poserSession(idSession(41), 'termine'),
      await poserSession(idSession(42), 'termine'),
      await poserSession(idSession(43), 'termine'),
    ];
    await base.outbox.clear();

    await validerEnGroupe(lot, 'guide_strict');
    expect(await base.outbox.count()).toBe(3);
  });

  it('une transition REFUSÉE n’écrit rien du tout — ni ligne, ni op', async () => {
    const session = await poserSession(idSession(44), 'en_cours');
    await base.outbox.clear();

    await expect(validerSession(session, 'guide_strict')).rejects.toThrow();
    expect(await base.outbox.count()).toBe(0);
  });
});
