// =============================================================================
// TESTS DE L'EXPORT DE SECOURS PAR SEGMENTS — lot L6c-1, revue A29. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis `DECISIONS.md` [L6c] « Revue A29 » : « l'export
// de secours v2 est écrit par segments (une photo chiffrée à la fois, pic mémoire
// borné à une photo), une enveloppe illisible est signalée sans faire échouer
// l'export ».
//
// ── LE PORT (forme décrite dans `fixtures/ecrivain.ts`) ─────────────────────
//   ecrireSauvegarde(demande, ecrivain: { ecrire(partie: string): Promise<void> })
//     : Promise<{ enTete, piecesIllisibles: readonly string[] }>
// La preuve est STRUCTURELLE : aucune partie remise à l'écrivain n'est plus
// grande qu'une photo chiffrée (double base64 compris) plus un en-tête ; il y a
// au moins une partie par photo ; et la somme des photos dépasse largement la
// borne — une implémentation qui construit le fichier entier puis le découpe
// passerait la borne de taille, pas celle de l'ORDRE d'écriture : d'où le test
// où chaque photo doit être écrite (au moins une partie de plus) avant que la
// suivante ne soit lue dans la table des octets.
//
// Les écrans (`EcranFinDeJournee`, `EcranRestauration`) ne réunissent plus le
// fichier : ils passent par `ecrireSauvegarde`, jamais par
// `JSON.stringify(exporterSauvegarde(…))`.
//
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
import { estEnveloppe, versBase64 } from '../local/enveloppe.js';
import { TABLE_OCTETS, ecrirePieceAvecOctets, lireOctetsPiece } from '../local/octets.js';
import { MISSION_PIECES, demandePhoto, octetsVaries } from '../sync/fixtures/pieces.js';
import { ecrireSauvegarde, importerSauvegarde } from './sauvegarde.js';
import { exporterAvecBilan } from './fixtures/ecrivain.js';

const MOT_DE_PASSE = 'correct-cheval-pile-agrafe-2026';
const KDF_TEST = {
  algo: 'argon2id',
  memoireKio: 1024,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
} as const;
const DEMANDE = { missionId: MISSION_PIECES, motDePasse: MOT_DE_PASSE, parametresKdf: KDF_TEST };

/** Une photo chiffrée en texte : au pire deux base64 successifs (×4/3 ×4/3), plus un en-tête. */
function borneDUnePartie(taillePhoto: number): number {
  return Math.ceil((4 / 3) * (4 / 3) * taillePhoto) + 16 * 1024;
}

const bases: BaseLocale[] = [];

async function appareil(sel: number): Promise<{ base: BaseLocale; coffre: Coffre }> {
  const base = new BaseLocale(`axion-test-segments-${uuidv7()}`);
  await base.open();
  bases.push(base);
  const kek = await deriverKek(MOT_DE_PASSE, new Uint8Array(16).fill(sel), KDF_TEST);
  const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
  installerContexteLocal({ base, coffre });
  return { base, coffre };
}

async function photo(octets: Uint8Array): Promise<string> {
  const id = uuidv7();
  await ecrirePieceAvecOctets(demandePhoto(id, octets), octets);
  return id;
}

afterEach(async () => {
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

const TAILLE = 150_000;
const NOMBRE = 4;

describe('export de secours v2 — écrit par segments, une photo à la fois', () => {
  it('@critique aucune partie ne dépasse une photo chiffrée + en-tête ; au moins une partie par photo', async () => {
    await appareil(41);
    for (let i = 0; i < NOMBRE; i += 1) await photo(octetsVaries(TAILLE, 100 + i));
    const { parties } = await exporterAvecBilan(DEMANDE);

    const borne = borneDUnePartie(TAILLE);
    // Anti-vacuité : toutes les photos réunies dépassent largement UNE partie.
    expect(NOMBRE * TAILLE * (4 / 3)).toBeGreaterThan(2 * borne);
    expect(parties.length).toBeGreaterThanOrEqual(NOMBRE + 1);
    for (const partie of parties) expect(partie.length).toBeLessThanOrEqual(borne);
  }, 60_000);

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : tout construire en mémoire, PUIS découper la
  // chaîne finale en morceaux sages — les tailles passent, le pic mémoire non.
  it('@critique chaque photo est écrite AVANT que la suivante ne soit lue (pic mémoire = une photo)', async () => {
    const { base } = await appareil(43);
    const ids: string[] = [];
    for (let i = 0; i < NOMBRE; i += 1) ids.push(await photo(octetsVaries(TAILLE, 200 + i)));

    // On observe les LECTURES de la table des octets par un middleware DBCore,
    // et, pour chaque photo, le nombre de parties DÉJÀ écrites à sa première lecture.
    let ecrites = 0;
    const ecritesALaLecture = new Map<string, number>();
    const noter = (id: unknown): void => {
      if (typeof id === 'string' && !ecritesALaLecture.has(id)) ecritesALaLecture.set(id, ecrites);
    };
    base.close();
    base.use({
      stack: 'dbcore',
      name: 'espion-lectures-octets',
      create: (aval) => ({
        ...aval,
        table: (nom) => {
          const table = aval.table(nom);
          if (nom !== TABLE_OCTETS) return table;
          return {
            ...table,
            get: async (req) => {
              const r: unknown = await table.get(req);
              noter(req.key);
              return r;
            },
            getMany: async (req) => {
              const r = await table.getMany(req);
              for (const k of req.keys) noter(k);
              return r;
            },
            query: async (req) => {
              const r = await table.query(req);
              // Une requête qui rend les VALEURS lit les photos ; une requête de
              // clés seules (`values: false`) ne lit rien de lourd.
              for (const v of r.result) noter((v as { id?: unknown } | undefined)?.id);
              return r;
            },
          };
        },
      }),
    });
    await base.open();

    await ecrireSauvegarde(DEMANDE, {
      ecrire: () => {
        ecrites += 1;
        return Promise.resolve();
      },
    });
    // Anti-vacuité : toutes les photos ont été lues.
    expect(ids.every((id) => ecritesALaLecture.has(id))).toBe(true);
    // Tout construire puis découper lirait les quatre photos avant la 1re écriture
    // (comptes 0,0,0,0) ; écrire l'en-tête d'abord donnerait 1,1,1,1. Une photo à
    // la fois donne des comptes STRICTEMENT croissants.
    const comptes = [...ecritesALaLecture.values()].sort((a, b) => a - b);
    for (let i = 1; i < comptes.length; i += 1) {
      expect(comptes[i]).toBeGreaterThan(comptes[i - 1] ?? Infinity);
    }
  }, 60_000);

  it('@critique l’aller-retour reste IDENTIQUE (photos, sur un autre appareil)', async () => {
    await appareil(45);
    const originaux = new Map<string, Uint8Array>();
    for (let i = 0; i < 3; i += 1) {
      const octets = octetsVaries(50_000 + i, 300 + i);
      originaux.set(await photo(octets), octets);
    }
    const { texte, bilan } = await exporterAvecBilan(DEMANDE);
    expect(bilan.piecesIllisibles).toEqual([]);
    expect(bilan.enTete.missionId).toBe(MISSION_PIECES);
    retirerContexteLocal();

    const cible = await appareil(99);
    await importerSauvegarde(JSON.parse(texte) as unknown, MOT_DE_PASSE);
    for (const [id, octets] of originaux) {
      expect(Array.from((await lireOctetsPiece(cible.base, cible.coffre, id)) ?? [])).toEqual(
        Array.from(octets),
      );
    }
  }, 60_000);

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : laisser `DonneeLocaleCorrompueError` remonter
  // — UNE photo abîmée prive l'auditeur de TOUTE sa sauvegarde de secours.
  it('@critique une enveloppe illisible est SIGNALÉE dans le bilan, l’export aboutit, le reste revient', async () => {
    const { base } = await appareil(47);
    const saine = octetsVaries(20_000, 7);
    const idSaine = await photo(saine);
    const idAbimee = await photo(octetsVaries(20_000, 8));

    const ligne = (await base.table(TABLE_OCTETS).get(idAbimee)) as Record<string, unknown>;
    const abimee = Object.fromEntries(
      Object.entries(ligne).map(([cle, valeur]) => [
        cle,
        estEnveloppe(valeur) ? { ...valeur, c: versBase64(octetsVaries(64, 9)) } : valeur,
      ]),
    );
    await base.table(TABLE_OCTETS).put(abimee);

    const { texte, bilan } = await exporterAvecBilan(DEMANDE);
    expect(bilan.piecesIllisibles).toEqual([idAbimee]);
    retirerContexteLocal();

    const cible = await appareil(97);
    await importerSauvegarde(JSON.parse(texte) as unknown, MOT_DE_PASSE);
    expect(Array.from((await lireOctetsPiece(cible.base, cible.coffre, idSaine)) ?? [])).toEqual(
      Array.from(saine),
    );
    // La ligne `attachments` de la pièce abîmée voyage quand même (invariant 7).
    expect(await cible.base.attachments.get(idAbimee)).toBeDefined();
  }, 60_000);
});

describe('les écrans écrivent par segments, jamais le fichier entier', () => {
  const RACINE = fileURLToPath(new URL('..', import.meta.url));
  for (const ecran of [
    'ecrans/journee/EcranFinDeJournee.tsx',
    'ecrans/journee/EcranRestauration.tsx',
  ]) {
    it(`${ecran} passe par \`ecrireSauvegarde\` et ne sérialise pas le fichier entier`, () => {
      const source = readFileSync(`${RACINE}${ecran}`, 'utf8');
      expect(source).toContain('ecrireSauvegarde');
      expect(source).not.toMatch(/exporterSauvegarde\(/);
      expect(source).not.toMatch(/JSON\.stringify\(produit\)/);
    });
  }
});
