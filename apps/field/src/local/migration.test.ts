// =============================================================================
// TESTS DE MIGRATION LOCALE v1 → v2 AVEC OUTBOX NON VIDE — lot L5, incrément L5a.
// ÉCRITS AVANT LE CODE, par A26, depuis `docs/conception/LOT_L5.md` §2, §3.4, §4
// et 05 §31-1 (09 §5.6). `base.ts` n'existe pas encore : ROUGES, et attendus tels.
//
// ── CE QUE LE PACK EXIGE ─────────────────────────────────────────────────────
// 05 §31-1 : « compatibilité ascendante du schéma local Dexie (migrations locales
// versionnées, testées) pour qu'une mise à jour n'invalide JAMAIS des données non
// synchronisées. » Note L5 §3.4 : « testées “v_n → v_n+1 avec outbox non vide” ».
//
// ── COMMENT ON TESTE UNE MIGRATION QUI N'EXISTE PAS ENCORE ───────────────────
// L5a livre `VERSION_SCHEMA_LOCAL = 1`. La v2 n'a pas de contenu connu ; ce que ce
// fichier garde, c'est la PROPRIÉTÉ que toute v2 devra respecter : on déclare
// ici une v2 minimale (une table de plus, une montée qui y écrit) PAR-DESSUS
// la base livrée, et on vérifie que 120 ops en file — plus qu'un lot de 100 —
// traversent la montée sans perte ni réordonnancement. Le jour où A24 écrira la
// vraie v2, il remplacera `BaseLocaleV2` par la classe livrée : le test ne change
// pas, seul le sujet change.
//
// ── HYPOTHÈSES D'INTERFACE ───────────────────────────────────────────────────
//   · `new BaseLocale(nom?: string)` déclare `VERSION_SCHEMA_LOCAL` via
//     `this.version(n).stores(...)` dans son constructeur, sans ouvrir la base
//     dans le constructeur (autoOpen Dexie par défaut) ;
//   · la file `outbox` a une clé primaire dont l'ordre EST l'ordre de file
//     (`op_id` v7 — 11 §4 « ordre de file préservé ») : `toArray()` rend la file
//     dans l'ordre d'envoi ;
//   · contexte `installerContexteLocal({ base, coffre })` — comme `ecriture.test.ts`.
//
// Traçabilité : E6 (hors ligne total — une mise à jour ne coûte jamais une
// saisie) · E38 (sauvegarde terrain — rien ne vit sur un seul appareil sans être
// protégé, migration comprise).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie, { type Transaction } from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BaseLocale, VERSION_SCHEMA_LOCAL } from './base.js';
import {
  creerDekEnveloppee,
  deriverKek,
  ouvrirCoffre,
  type Coffre,
  type Enveloppe,
} from './coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './contexte.js';
import { ecrireLocal } from './ecriture.js';

type Ligne = Record<string, unknown>;

const TABLES_ATTENDUES = [
  'missions',
  'missionQuestions',
  'orgUnits',
  'interviews',
  'answers',
  'attachments',
  'workAssignments',
  'outbox',
  'meta',
] as const;

const NOMBRE_OPS = 120; // > 100 : plus d'un lot de push (11 §4) reste en file
const HORODATAGE = '2026-09-02T08:15:00.000Z';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const INTERVIEW_ID = '0191e2a0-0000-7000-8000-00000000a001';

/**
 * La « version suivante » : une table de plus, et une montée qui écrit dans
 * cette table neuve — sans toucher aux tables existantes, dont on ne connaît
 * pas les clés. C'est la forme la plus courante d'une vraie migration, et la
 * seule que l'on puisse écrire sans connaître v2.
 */
class BaseLocaleV2 extends BaseLocale {
  constructor(nom: string, montee?: (tx: Transaction) => Promise<void>) {
    super(nom);
    this.version(VERSION_SCHEMA_LOCAL + 1)
      .stores({ journalMigrations: 'id' })
      .upgrade(async (tx) => {
        await tx.table('journalMigrations').put({ id: 'migration-v2', etat: 'appliquee' });
        if (montee) await montee(tx);
      });
  }
}

let kek: CryptoKey;
let dekEnveloppee: Enveloppe;
const nomsOuverts: string[] = [];

/** Un coffre frais (même DEK) : `retirerContexteLocal()` verrouille celui qu'il tenait. */
async function coffreFrais(): Promise<Coffre> {
  return ouvrirCoffre(kek, dekEnveloppee);
}
let compteur = 0;

function nomUnique(): string {
  compteur += 1;
  const nom = `axion-test-migration-${String(compteur)}`;
  nomsOuverts.push(nom);
  return nom;
}

/** Une charge de réponse complète (schéma `chargeAnswerSchema` publié dans `formes.ts`). */
function chargeReponse(value: { type: 'number' | 'free_text'; v: unknown }, note: string | null) {
  return {
    value,
    note,
    reviewReason: null,
    naReason: null,
    withheldReason: null,
    source: 'entretien' as const,
    questionTextSnapshot: 'Question fictive',
    revision: 1,
    clientCreatedAt: HORODATAGE,
  };
}

/** Remplit une base v1 : 120 réponses (120 ops) + 1 entretien, puis la ferme. */
async function preparerBaseV1(nom: string): Promise<{
  outbox: Ligne[];
  answers: Ligne[];
  interviews: Ligne[];
  meta: Ligne[];
}> {
  const base = new BaseLocale(nom);
  await base.open();
  installerContexteLocal({ base, coffre: await coffreFrais() });

  await ecrireLocal({
    entite: 'interview',
    id: INTERVIEW_ID,
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      orgUnitId: '0191e2a0-0000-7000-8000-00000000c001',
      kind: 'entretien',
      status: 'en_cours',
      scheduleStatus: 'realise',
      scheduledAt: null,
    },
    charge: {
      conductedBy: '0191e2a0-0000-7000-8000-00000000e001',
      mode: 'sur_site',
      personName: 'Personne fictive',
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
    },
  });

  for (let i = 0; i < NOMBRE_OPS; i += 1) {
    const id = uuidv7();
    await ecrireLocal({
      entite: 'answer',
      id,
      missionId: MISSION_ID,
      action: 'upsert',
      index: {
        interviewId: INTERVIEW_ID,
        missionQuestionId: `0191e2a0-0000-7000-8000-${(4096 + i).toString(16).padStart(12, '0')}`,
        flagReview: i % 7 === 0 ? 1 : 0,
        notApplicable: 0,
        withheld: 0,
        horsParcours: 0,
      },
      charge: chargeReponse({ type: 'number', v: i }, i % 5 === 0 ? `note ${String(i)}` : null),
    });
  }

  const instantane = {
    outbox: (await base.table('outbox').toArray()) as Ligne[],
    answers: (await base.table('answers').toArray()) as Ligne[],
    interviews: (await base.table('interviews').toArray()) as Ligne[],
    meta: (await base.table('meta').toArray()) as Ligne[],
  };
  retirerContexteLocal();
  base.close();
  return instantane;
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(3));
  dekEnveloppee = await creerDekEnveloppee(kek);
}, 20_000);

afterEach(async () => {
  retirerContexteLocal();
  for (const nom of nomsOuverts.splice(0)) await Dexie.delete(nom);
});

// =============================================================================
// A. Le schéma livré — ce qu'il déclare, et la constante qui le nomme
// =============================================================================
describe('BaseLocale — schéma local livré (05 §9.1, note L5 §2)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `VERSION_SCHEMA_LOCAL` incrémentée sans
  // que `this.version(n)` le soit (ou l'inverse). La constante nourrit le
  // bandeau de mise à jour (§31-1) et l'en-tête de l'export de secours : si elle
  // ment sur la version réelle de la base, une restauration croise deux schémas.
  it('@critique `VERSION_SCHEMA_LOCAL` est la version RÉELLEMENT ouverte par Dexie', async () => {
    const base = new BaseLocale(nomUnique());
    await base.open();
    expect(base.verno).toBe(VERSION_SCHEMA_LOCAL);
    base.close();
  });

  it('les neuf tables du 05 §9.1 existent, sous les noms de la note §2', async () => {
    const base = new BaseLocale(nomUnique());
    await base.open();
    const noms = base.tables.map((t) => t.name);
    for (const attendu of TABLES_ATTENDUES) expect(noms).toContain(attendu);
    base.close();
  });

  it('`outbox` rend la file dans l’ordre d’écriture (clé primaire = ordre de file)', async () => {
    const nom = nomUnique();
    const { outbox } = await preparerBaseV1(nom);
    expect(outbox).toHaveLength(NOMBRE_OPS + 1);
    const cles = outbox.map((op) => String(op.op_id ?? op.opId));
    expect([...cles].sort()).toEqual(cles);
  });
});

// =============================================================================
// B. v1 → v2 avec outbox non vide — aucune perte, aucune op réordonnée
// =============================================================================
describe('migration locale v1 → v2 avec outbox non vide (05 §31-1, note L5 §3.4)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une déclaration de schéma qui REDÉCLARE
  // toutes les tables à chaque version avec `stores({ outbox: null, … })` ou
  // recrée la base sous un autre nom (« axion-v2 ») — la v1 est abandonnée avec
  // ses 120 ops non poussées. Ou : une montée qui lit `outbox`, la vide, et la
  // réécrit « propre » — en changeant l'ordre.
  it('@critique les ops en file traversent la montée : même nombre, même contenu, même ordre', async () => {
    const nom = nomUnique();
    const avant = await preparerBaseV1(nom);
    expect(avant.outbox).toHaveLength(NOMBRE_OPS + 1);

    const baseV2 = new BaseLocaleV2(nom);
    await baseV2.open();
    expect(baseV2.verno).toBe(VERSION_SCHEMA_LOCAL + 1);

    const apres = (await baseV2.table('outbox').toArray()) as Ligne[];
    expect(apres).toEqual(avant.outbox);
    baseV2.close();
  });

  it('@critique les lignes d’entités (chiffrées) traversent la montée intactes', async () => {
    const nom = nomUnique();
    const avant = await preparerBaseV1(nom);

    const baseV2 = new BaseLocaleV2(nom);
    await baseV2.open();
    expect(await baseV2.table('answers').toArray()).toEqual(avant.answers);
    expect(await baseV2.table('interviews').toArray()).toEqual(avant.interviews);
    baseV2.close();
  });

  it('la montée a bien eu lieu (sa trace) — le test ne passe pas par vacuité', async () => {
    const nom = nomUnique();
    const avant = await preparerBaseV1(nom);

    const baseV2 = new BaseLocaleV2(nom);
    await baseV2.open();
    expect(baseV2.tables.map((t) => t.name)).toContain('journalMigrations');
    expect(await baseV2.table('journalMigrations').get('migration-v2')).toEqual({
      id: 'migration-v2',
      etat: 'appliquee',
    });
    // Et `meta` (curseurs, device_id) n'a pas bougé non plus.
    expect(await baseV2.table('meta').toArray()).toEqual(avant.meta);
    baseV2.close();
  });

  it('après la montée, le port continue d’écrire À LA SUITE de la file (jamais devant)', async () => {
    const nom = nomUnique();
    const avant = await preparerBaseV1(nom);

    const baseV2 = new BaseLocaleV2(nom);
    await baseV2.open();
    installerContexteLocal({ base: baseV2, coffre: await coffreFrais() });
    const idApres = uuidv7();
    await ecrireLocal({
      entite: 'answer',
      id: idApres,
      missionId: MISSION_ID,
      action: 'upsert',
      index: {
        interviewId: INTERVIEW_ID,
        missionQuestionId: '0191e2a0-0000-7000-8000-00000000b999',
        flagReview: 0,
        notApplicable: 0,
        withheld: 0,
        horsParcours: 0,
      },
      charge: chargeReponse({ type: 'free_text', v: 'après migration' }, null),
    });

    const apres = (await baseV2.table('outbox').toArray()) as Ligne[];
    expect(apres).toHaveLength(avant.outbox.length + 1);
    expect(apres.slice(0, avant.outbox.length)).toEqual(avant.outbox);
    baseV2.close();
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une migration « manuelle » hors de la
  // transaction `versionchange` de Dexie — export des tables, suppression,
  // réimport. Si elle échoue au milieu, la moitié des ops a disparu. Dexie
  // garantit l'atomicité de la montée SI ET SEULEMENT SI on reste dans
  // `.upgrade()` ; ce test le vérifie sur la base livrée.
  it('@critique une montée qui ÉCHOUE ne perd rien : la v1 rouvre avec ses 121 ops', async () => {
    const nom = nomUnique();
    const avant = await preparerBaseV1(nom);

    const baseV2 = new BaseLocaleV2(nom, () =>
      Promise.reject(new Error('panne injectée pendant la montée')),
    );
    await expect(baseV2.open()).rejects.toThrow();
    baseV2.close();

    const baseV1 = new BaseLocale(nom);
    await baseV1.open();
    expect(baseV1.verno).toBe(VERSION_SCHEMA_LOCAL);
    expect(await baseV1.table('outbox').toArray()).toEqual(avant.outbox);
    expect(await baseV1.table('answers').toArray()).toEqual(avant.answers);
    expect(await baseV1.table('meta').toArray()).toEqual(avant.meta);
    expect(baseV1.tables.map((t) => t.name)).not.toContain('journalMigrations');
    baseV1.close();
  });
});
