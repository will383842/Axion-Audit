// =============================================================================
// TESTS DU FORMAT DE SAUVEGARDE v2 — lot L6c-1. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis `DECISIONS.md` [L6c] (2026-10-09) : « Export
// de secours : `VERSION_FORMAT_SAUVEGARDE` monte à 2 (octets des photos) et les
// fichiers v1 restent restaurables ».
//
// ── LA FIXTURE v1, ET POURQUOI ELLE EST VRAIE ───────────────────────────────
// `fixtures/sauvegarde-v1.axionbackup.json` a été PRODUIT par le code v1 du
// dépôt (`exporterSauvegarde`, `VERSION_FORMAT_SAUVEGARDE = 1`, commit 40b9ac9),
// avant toute modification de l'auteur — pas écrit à la main. Mission FICTIVE
// (invariant 2), mot de passe factice, Argon2id allégé. Contenu : une session
// d'entretien et une note volante rattachée, deux ops en file, aucun octet.
// Un fichier v1 fabriqué en « rabaissant » le numéro d'un fichier v2 aurait
// prouvé la tolérance d'un champ, pas la lecture d'un vrai fichier d'hier.
//
// Rouge attendu tant que le format n'est pas passé à 2.
// Traçabilité : E38 ; invariants 7 et 8.
// =============================================================================
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { depotSessions } from '../local/depots/sessions.js';
import { chargeAttachmentSchema } from '../local/formes.js';
import { TABLE_OCTETS } from '../local/octets.js';
import { importerSauvegarde, VERSION_FORMAT_SAUVEGARDE } from './sauvegarde.js';
import { exporterParSegments } from './fixtures/ecrivain.js';

const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const MISSION_V1 = '0191e2a0-0000-7000-8000-00000000f1de';
const SESSION_V1 = '0191e2a0-0000-7000-8000-0000000b1001';
const NOTE_V1 = '0191e2a0-0000-7000-8000-0000000b1002';

const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;

function fichierV1(): unknown {
  const chemin = fileURLToPath(
    new URL('./fixtures/sauvegarde-v1.axionbackup.json', import.meta.url),
  );
  return JSON.parse(readFileSync(chemin, 'utf8')) as unknown;
}

const bases: BaseLocale[] = [];

async function appareilNeuf(sel: number): Promise<{ base: BaseLocale; coffre: Coffre }> {
  const base = new BaseLocale(`axion-test-format-v2-${uuidv7()}`);
  await base.open();
  bases.push(base);
  const kek = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(sel), KDF_TEST);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return { base, coffre };
}

afterEach(async () => {
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('format de sauvegarde v2 (octets des photos)', () => {
  it('@critique la version de format est 2, et un export neuf la déclare', async () => {
    expect(VERSION_FORMAT_SAUVEGARDE).toBe(2);
    await appareilNeuf(31);
    const fichier = await exporterParSegments({
      missionId: MISSION_V1,
      motDePasse: MOT_DE_PASSE,
      parametresKdf: KDF_TEST,
    });
    expect(fichier.enTete.versionFormat).toBe(2);
  }, 30_000);

  it('anti-vacuité : la fixture est bien un fichier v1', () => {
    expect(fichierV1()).toMatchObject({ enTete: { versionFormat: 1, missionId: MISSION_V1 } });
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `if (versionFormat !== VERSION_FORMAT_SAUVEGARDE)
  // throw` laissé tel quel — la sauvegarde d'hier, la seule copie d'une journée
  // de collecte sur une tablette volée, devient illisible le jour de la mise à jour.
  it('@critique un fichier v1 (sans octets) se restaure SANS PERTE sur un appareil neuf', async () => {
    const { base, coffre } = await appareilNeuf(95);
    const rapport = await importerSauvegarde(fichierV1(), MOT_DE_PASSE);

    expect(rapport.missionId).toBe(MISSION_V1);
    expect(rapport.lignesRestaurees).toBe(2);
    expect(rapport.avertissement === null || typeof rapport.avertissement === 'string').toBe(true);

    const session = await depotSessions.parId(SESSION_V1);
    expect(session?.personName).toBe('Interlocuteur fictif v1');
    expect(session?.generalNotes).toBe('Note fictive v1');

    const note = await base.attachments.get(NOTE_V1);
    expect(note?.kind).toBe('note');
    expect(note?.interviewId).toBe(SESSION_V1);
    if (note === undefined) throw new Error('note absente');
    const charge = await coffre.dechiffrer(note.charge, chargeAttachmentSchema);
    expect(charge.content).toBe('Note volante fictive v1');

    // Les deux ops : réinjectées en file, ou comptées comme non réinjectées —
    // jamais disparues sans trace (invariant 7).
    expect((await base.outbox.count()) + rapport.operationsNonReinjectees).toBe(2);
    // Un fichier v1 n'apporte aucun octet : la table existe, vide.
    expect(await base.table(TABLE_OCTETS).count()).toBe(0);
  }, 30_000);

  it('un fichier v1 avec un mauvais mot de passe est refusé, rien n’est écrit', async () => {
    const { base } = await appareilNeuf(97);
    await expect(importerSauvegarde(fichierV1(), 'mauvais-mot-de-passe')).rejects.toThrow();
    expect(await base.interviews.count()).toBe(0);
    expect(await base.attachments.count()).toBe(0);
  }, 30_000);
});
