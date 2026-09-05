// =============================================================================
// TESTS DU PORT D'ÉCRITURE LOCAL — lot L5, incrément L5a. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 depuis `docs/conception/LOT_L5.md` §2 et §4 SEULS (09 §5.6).
// `ecriture.ts` n'existe pas à l'heure de leur livraison : ROUGES, et attendus tels.
//
// ── CE QUE LA NOTE ENGAGE (§2, verbatim) ─────────────────────────────────────
// `ecrireLocal<E extends EntiteSync>({entite, id, missionId, action, index, charge})
//   : Promise<void>` — **UNE** transaction Dexie sur `[table, 'outbox']`
// `appliquerDescente(lot: LotDescendant): Promise<void>` — **n'écrit JAMAIS dans
//   `outbox`**.
// Et 05 §9.2 : « Toute action utilisateur écrit d'abord dans IndexedDB
// (transaction Dexie) […] Chaque écriture pousse une opération dans `outbox`. »
//
// ── LE TEST QUI COMPTE, ET POURQUOI IL EST SEUL À COMPTER ────────────────────
// Une implémentation à DEUX écritures séquentielles —
//     await base.answers.put(ligne); await base.outbox.add(op);
// — passe TOUT : l'aller-retour, le comptage, la forme de l'op. Elle ne tombe
// que si l'on fait échouer la seconde écriture et qu'on constate que la première
// a survécu. C'est l'invariant 1 (offline-first, « zéro donnée perdue ») dans sa
// forme la plus concrète : une ligne sans son op ne sera JAMAIS synchronisée, et
// personne ne le saura ; une op sans sa ligne enverra du vide au siège.
// L'injection se fait aux DEUX ordres (§A), parce qu'une implémentation qui
// écrit l'op d'abord puis la ligne passerait une injection sur `outbox` seule.
//
// ── HYPOTHÈSES D'INTERFACE (nommées pour être confrontées à celles d'A24) ────
//   · `new BaseLocale(nom?: string)` — le nom permet d'isoler chaque test ;
//   · ALIGNÉ LE 2026-09-02 (arbitrage A01) : le port est constitué des deux
//     fonctions publiées `ecrireLocal` / `appliquerDescente`, et son contexte
//     `{ base, coffre }` s'installe par `installerContexteLocal` / `retirerContexteLocal` ;
//   · les drapeaux d'index sont stockés `0|1` (IndexedDB n'indexe pas les booléens) ;
//   · entité → table : answer→answers, interview→interviews,
//     attachment_meta→attachments (05 §9.1, noms de la note §2) ;
//   · l'op stockée dans `outbox` a la forme du contrat 11 §4 — `op_id`,
//     `entity`, `entity_id`, `action`, `payload`, `client_updated_at` ; les tests
//     tolèrent la graphie camelCase (`opId`, `entityId`, …) pour ne pas trancher à
//     la place de la note §5-3, qui renvoie la décision à A01 ;
//   · `LotDescendant = { missionId, serverTime, prochainSince, enregistrements:
//     [{ table, index, charge }] }` — forme PUBLIÉE (alignée le 2026-09-02), lignes
//     en clair déjà scindées index / charge ;
//   · l'injection de panne passe par un middleware DBCore de Dexie (`base.use`),
//     appliqué base FERMÉE puis rouverte — aucune hypothèse sur l'implémentation.
//
// Traçabilité : E6 (hors ligne total — toute action écrit d'abord en local) ·
// E7 (remontée continue — l'outbox est la seule file, vraie par construction).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BaseLocale } from './base.js';
import {
  creerDekEnveloppee,
  deriverKek,
  ouvrirCoffre,
  type Coffre,
  type Enveloppe,
} from './coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './contexte.js';
import { appliquerDescente, ecrireLocal } from './ecriture.js';

// -----------------------------------------------------------------------------
// Outils
// -----------------------------------------------------------------------------
type Ligne = Record<string, unknown>;

/** L'unique ligne d'une table — échoue clairement s'il n'y en a pas exactement une. */
async function uniqueLigne(base: Dexie, nomTable: string): Promise<Ligne> {
  const lignes = (await base.table(nomTable).toArray()) as Ligne[];
  const [seule] = lignes;
  if (lignes.length !== 1 || seule === undefined) {
    throw new Error(`« ${nomTable} » : 1 ligne attendue, ${String(lignes.length)} trouvée(s)`);
  }
  return seule;
}

/** Lit un champ d'op sous ses graphies possibles (11 §4 snake, camelCase, ou française). */
function champ(op: Ligne, ...graphies: string[]): unknown {
  for (const g of graphies) if (op[g] !== undefined) return op[g];
  return undefined;
}

/**
 * Fait échouer TOUTE mutation (add/put/delete/deleteRange) sur une table, par
 * middleware DBCore. La base est fermée puis rouverte pour que Dexie applique
 * la pile ; les données déjà écrites survivent à la réouverture.
 */
async function injecterPanne(base: Dexie, tableCible: string): Promise<() => Promise<void>> {
  const nom = `panne-injectee-${tableCible}`;
  base.close();
  base.use({
    stack: 'dbcore',
    name: nom,
    create: (aval) => ({
      ...aval,
      table: (nomTable) => {
        const table = aval.table(nomTable);
        if (nomTable !== tableCible) return table;
        return {
          ...table,
          mutate: () => Promise.reject(new Error(`panne injectée sur « ${nomTable} »`)),
        };
      },
    }),
  });
  await base.open();
  // Retire la panne : la base rouvre SANS le middleware, les données restent.
  return async () => {
    base.close();
    base.unuse({ stack: 'dbcore', name: nom });
    await base.open();
  };
}

const HORODATAGE = '2026-09-02T08:15:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const INTERVIEW_ID = '0191e2a0-0000-7000-8000-00000000a001';
const QUESTION_ID = '0191e2a0-0000-7000-8000-00000000b001';

let kek: CryptoKey;
let dekEnveloppee: Enveloppe;
let coffre: Coffre;
const basesOuvertes: BaseLocale[] = [];
let compteur = 0;

/**
 * Une base ET un coffre neufs par test, contexte installé. Constaté à la
 * première exécution : `retirerContexteLocal()` VERROUILLE le coffre qu'il
 * tenait (sémantique du port, pas un défaut) — un coffre partagé entre tests
 * serait donc mort après le premier `afterEach`. On rouvre la même DEK.
 */
async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-ecriture-${String(compteur)}`);
  await base.open();
  basesOuvertes.push(base);
  coffre = await ouvrirCoffre(kek, dekEnveloppee);
  installerContexteLocal({ base, coffre });
  return base;
}

function paramsReponse(id: string, valeur: number) {
  return {
    entite: 'answer' as const,
    id,
    missionId: MISSION_ID,
    action: 'upsert' as const,
    index: {
      interviewId: INTERVIEW_ID,
      missionQuestionId: QUESTION_ID,
      flagReview: 0 as const,
      notApplicable: 0 as const,
      withheld: 0 as const,
      horsParcours: 0 as const,
    },
    charge: {
      value: { type: 'number' as const, v: valeur },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien' as const,
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: HORODATAGE,
    },
  };
}

const CHARGE_INTERVIEW_DESCENDU = {
  conductedBy: '0191e2a0-0000-7000-8000-00000000e001',
  mode: 'sur_site' as const,
  personName: 'Personne descendue',
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
  valideeLe: null,
  clientCreatedAt: HORODATAGE,
};

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(7));
  dekEnveloppee = await creerDekEnveloppee(kek);
}, 20_000);

afterEach(async () => {
  retirerContexteLocal();
  for (const base of basesOuvertes.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

// =============================================================================
// A. ATOMICITÉ — le cœur de ce fichier
// =============================================================================
describe('ecrireLocal — ligne + op dans UNE transaction (note L5 §2, 05 §9.2)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `await table.put(ligne)` PUIS
  // `await outbox.add(op)` — deux transactions implicites. Ici l'op échoue : la
  // ligne existe, l'outbox est vide, la réponse ne partira jamais au siège et
  // le compteur `outbox_remaining` du garde-fou §9.7 dira « 0 » en mentant.
  it('@critique panne injectée sur `outbox` ⇒ NI la ligne NI l’op ne sont écrites', async () => {
    const base = await nouvelleBase();
    await injecterPanne(base, 'outbox');

    await expect(ecrireLocal(paramsReponse(uuidv7(), 3))).rejects.toThrow();

    expect(await base.table('answers').count()).toBe(0);
    expect(await base.table('outbox').count()).toBe(0);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : l'ordre inverse — l'op d'abord, la ligne
  // ensuite, en deux transactions. L'injection précédente ne la verrait pas
  // (l'op échoue avant que la ligne soit tentée). Ici c'est la LIGNE qui échoue :
  // une op orpheline pousserait au siège une réponse que l'appareil n'a pas.
  it('@critique panne injectée sur la table de l’entité ⇒ NI la ligne NI l’op ne sont écrites', async () => {
    const base = await nouvelleBase();
    await injecterPanne(base, 'answers');

    await expect(ecrireLocal(paramsReponse(uuidv7(), 3))).rejects.toThrow();

    expect(await base.table('answers').count()).toBe(0);
    expect(await base.table('outbox').count()).toBe(0);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un `try/catch` qui avale l'échec et rend
  // une promesse résolue — l'écran afficherait « Enregistré » sur du vide. Le
  // rejet doit REMONTER, pour que l'indicateur d'enregistrement (§33) dise vrai.
  it('@critique l’échec d’écriture REMONTE à l’appelant, il n’est jamais résolu en silence', async () => {
    const base = await nouvelleBase();
    await injecterPanne(base, 'outbox');

    let resolu = false;
    try {
      await ecrireLocal(paramsReponse(uuidv7(), 3));
      resolu = true;
    } catch {
      resolu = false;
    }
    expect(resolu).toBe(false);
  });

  it('une écriture qui a échoué n’empêche pas la suivante d’aboutir (pas d’état zombie)', async () => {
    const base = await nouvelleBase();
    const retirerPanne = await injecterPanne(base, 'outbox');
    const id = uuidv7();

    await expect(ecrireLocal(paramsReponse(id, 1))).rejects.toThrow();
    expect(await base.table('answers').count()).toBe(0);
    expect(await base.table('outbox').count()).toBe(0);

    await retirerPanne();
    await ecrireLocal(paramsReponse(id, 1));
    expect(await base.table('answers').count()).toBe(1);
    expect(await base.table('outbox').count()).toBe(1);
  });
});

// =============================================================================
// B. Chemin nominal — la ligne ET l'op, et la forme de l'op (11 §4)
// =============================================================================
describe('ecrireLocal — chemin nominal', () => {
  it('@critique une écriture produit exactement une ligne ET une op qui la désigne', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();

    await ecrireLocal(paramsReponse(id, 3));

    const ligne = await uniqueLigne(base, 'answers');
    const op = await uniqueLigne(base, 'outbox');
    expect(ligne.id).toBe(id);
    expect(ligne.missionId).toBe(MISSION_ID);
    expect(champ(op, 'entity_id', 'entityId', 'entiteId')).toBe(id);
    expect(champ(op, 'entity', 'entite')).toBe('answer');
    expect(op.action).toBe('upsert');
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `crypto.randomUUID()` (v4, non ordonnable)
  // pour `op_id`. L'ordre de la file (« ordre de file préservé », 11 §4) repose
  // sur la monotonie du v7 ; un v4 mélangerait les ops au rejeu après migration.
  it('@critique `op_id` est un UUID v7 généré sur l’appareil (invariant 1, P1-4)', async () => {
    const base = await nouvelleBase();
    await ecrireLocal(paramsReponse(uuidv7(), 3));

    const op = await uniqueLigne(base, 'outbox');
    const opId = champ(op, 'op_id', 'opId');
    expect(typeof opId).toBe('string');
    expect(opId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('deux écritures sur le MÊME id ⇒ une seule ligne (upsert) mais DEUX ops (re-réponse = upsert ordinaire, 05 §9.3)', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();

    await ecrireLocal(paramsReponse(id, 2));
    await ecrireLocal(paramsReponse(id, 4));

    expect(await base.table('answers').count()).toBe(1);
    expect(await base.table('outbox').count()).toBe(2);
  });

  it('les ops sortent de la file dans l’ordre d’écriture (`op_id` v7 croissants)', async () => {
    const base = await nouvelleBase();
    const ids = [uuidv7(), uuidv7(), uuidv7()];
    for (const id of ids) await ecrireLocal(paramsReponse(id, 1));

    const ops = (await base.table('outbox').toArray()) as Ligne[];
    const opIds = ops.map((op) => String(champ(op, 'op_id', 'opId')));
    expect([...opIds].sort()).toEqual(opIds);
    expect(ops.map((op) => champ(op, 'entity_id', 'entityId', 'entiteId'))).toEqual(ids);
  });

  it('`client_updated_at` de l’op est un ISO 8601 UTC (suffixe Z, jamais un fuseau local)', async () => {
    const base = await nouvelleBase();
    await ecrireLocal(paramsReponse(uuidv7(), 1));

    const op = await uniqueLigne(base, 'outbox');
    const horodatage = champ(op, 'client_updated_at', 'clientUpdatedAt');
    expect(horodatage).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/);
  });

  it('une action `delete_soft` est une op comme une autre : la ligne reste (invariant 7), l’op est en file', async () => {
    const base = await nouvelleBase();
    const id = uuidv7();
    await ecrireLocal(paramsReponse(id, 1));
    await ecrireLocal({ ...paramsReponse(id, 1), action: 'delete_soft' });

    expect(await base.table('answers').count()).toBe(1);
    const ops = (await base.table('outbox').toArray()) as Ligne[];
    expect(ops.map((op) => op.action)).toEqual(['upsert', 'delete_soft']);
  });
});

// =============================================================================
// C. appliquerDescente — n'écrit JAMAIS dans `outbox`
// =============================================================================
describe('appliquerDescente — le pull ne fabrique aucune op (note L5 §2)', () => {
  function lotDescendant(prochainSince = '2026-09-02T09:00:00.000Z') {
    return {
      missionId: MISSION_ID,
      serverTime: '2026-09-02T09:00:00.000Z',
      prochainSince,
      enregistrements: [
        {
          table: 'interviews' as const,
          index: {
            id: INTERVIEW_ID,
            missionId: MISSION_ID,
            orgUnitId: '0191e2a0-0000-7000-8000-00000000c001',
            kind: 'entretien' as const,
            status: 'en_cours' as const,
            scheduleStatus: 'realise' as const,
            scheduledAt: null,
            clientUpdatedAt: HORODATAGE,
            supprimeLe: null,
          },
          charge: CHARGE_INTERVIEW_DESCENDU,
        },
        {
          table: 'answers' as const,
          index: {
            id: '0191e2a0-0000-7000-8000-00000000d001',
            missionId: MISSION_ID,
            interviewId: INTERVIEW_ID,
            missionQuestionId: QUESTION_ID,
            flagReview: 0 as const,
            notApplicable: 0 as const,
            withheld: 0 as const,
            horsParcours: 0 as const,
            clientUpdatedAt: HORODATAGE,
            supprimeLe: null,
          },
          charge: paramsReponse('0191e2a0-0000-7000-8000-00000000d001', 3).charge,
        },
        {
          table: 'answers' as const,
          index: {
            id: '0191e2a0-0000-7000-8000-00000000d002',
            missionId: MISSION_ID,
            interviewId: INTERVIEW_ID,
            missionQuestionId: '0191e2a0-0000-7000-8000-00000000b002',
            flagReview: 1 as const,
            notApplicable: 0 as const,
            withheld: 0 as const,
            horsParcours: 0 as const,
            clientUpdatedAt: HORODATAGE,
            supprimeLe: null,
          },
          charge: {
            ...paramsReponse('0191e2a0-0000-7000-8000-00000000d002', 7).charge,
            note: 'note descendue',
          },
        },
      ],
    };
  }

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `appliquerDescente` réutilisant
  // `ecrireLocal` « pour ne pas dupliquer le code » — chaque ligne reçue du
  // siège repartirait vers lui comme une modification terrain. Boucle de
  // sync, et surtout : des ops signées par l'appareil sur des entités dont il
  // n'est pas propriétaire (`forbidden`, 05 §9.9), affichées comme rejetées.
  it('@critique un lot descendu écrit ses lignes et laisse `outbox` STRICTEMENT inchangée', async () => {
    const base = await nouvelleBase();

    // Une op locale préexistante : elle doit être là, identique, après le pull.
    await ecrireLocal(paramsReponse(uuidv7(), 5));
    const outboxAvant = await base.table('outbox').toArray();
    expect(outboxAvant).toHaveLength(1);

    await appliquerDescente(lotDescendant());

    expect(await base.table('interviews').count()).toBe(1);
    expect(await base.table('answers').count()).toBe(1 + 2);
    expect(await base.table('outbox').toArray()).toEqual(outboxAvant);
  });

  it('@critique un lot descendu sur une base VIDE laisse `outbox` vide', async () => {
    const base = await nouvelleBase();

    await appliquerDescente(lotDescendant());

    expect(await base.table('outbox').count()).toBe(0);
    expect(await base.table('answers').count()).toBe(2);
  });

  it('appliquer deux fois le même lot est idempotent (upsert par UUID, jamais de doublon)', async () => {
    const base = await nouvelleBase();

    await appliquerDescente(lotDescendant());
    await appliquerDescente(lotDescendant());

    expect(await base.table('answers').count()).toBe(2);
    expect(await base.table('interviews').count()).toBe(1);
    expect(await base.table('outbox').count()).toBe(0);
  });

  it('le curseur `nextSince` est persisté dans `meta` (11 §4 : « le client persiste next_since PAR mission »)', async () => {
    const base = await nouvelleBase();
    const curseur = '2026-09-02T09:42:17.000Z';

    await appliquerDescente(lotDescendant(curseur));

    const meta = await base.table('meta').toArray();
    expect(JSON.stringify(meta)).toContain(curseur);
    expect(JSON.stringify(meta)).toContain(MISSION_ID);
  });

  // Un premier pull interrompu ne doit pas laisser croire qu'il a abouti : si le
  // curseur avançait malgré l'échec, le delta suivant sauterait les lignes
  // manquantes — définitivement, puisque le serveur ne les renverrait plus.
  it('si l’application du lot échoue, le curseur `nextSince` n’avance PAS', async () => {
    const base = await nouvelleBase();
    await injecterPanne(base, 'interviews');
    const curseur = '2026-09-02T09:42:17.000Z';

    await expect(appliquerDescente(lotDescendant(curseur))).rejects.toThrow();

    const meta = await base.table('meta').toArray();
    expect(JSON.stringify(meta)).not.toContain(curseur);
    expect(await base.table('outbox').count()).toBe(0);
  });
});
