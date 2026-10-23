// =============================================================================
// FIXTURE E2E — UNE FILE LOCALE MASSIVE, PLANTÉE DANS INDEXEDDB (scénario 6, 05 §9.8)
//
// « 5 000 réponses + 200 photos en file » : une mission de plusieurs semaines hors
// ligne. Les saisir par l'interface prendrait des heures ; on les FABRIQUE, côté Node,
// par le code de production lui-même :
//   · `ecrireLocal` et `ecrirePieceAvecOctets` (apps/field/src/local) — la ligne
//     miroir, l'op d'outbox et les octets s'écrivent dans UNE transaction Dexie,
//     exactement comme sur la tablette. Le contexte local Node est une `BaseLocale`
//     sur `fake-indexeddb` (la même dépendance que les tests unitaires du terrain) ;
//   · le VRAI coffre de l'appareil (celui dont la DEK est enveloppée dans `meta`) :
//     `coffre.chiffrer`, donc le navigateur relira tout avec le seul mot de passe.
// Aucun constructeur d'opération n'est réécrit ici : zéro copie de la forme de l'op.
//
// Les lignes sont ensuite VERSÉES, par lots, dans le vrai IndexedDB du navigateur
// (API IndexedDB brute, comme `planterAppareil`). Rien ne passe par l'API serveur : la
// mise en file est locale, seule la vidange traverse le réseau.
//
// Les photos sont des JPEG SYNTHÉTIQUES (en-tête JFIF + octets pseudo-aléatoires
// déterministes + EOI) : la compression de production (JPEG ≤ 2048 px) n'intervient
// pas, puisqu'on plante après elle — l'octet planté est l'octet qui partira.
//
// Invariant 2 : données fictives. Aucune référence client.
// =============================================================================
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { BaseLocale } from '../../apps/field/src/local/base.js';
import type {
  installerContexteLocal,
  retirerContexteLocal,
} from '../../apps/field/src/local/contexte.js';
import type { ecrireLocal } from '../../apps/field/src/local/ecriture.js';
import type { ecrirePieceAvecOctets } from '../../apps/field/src/local/octets.js';
import type { Coffre } from '../../apps/field/src/local/coffre.js';
import { uuidv7 } from '../banc/semis-serveur.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Un morceau de pièce fait 5 Mio (05 §9.6) : on s'en sert pour fabriquer des photos « à plusieurs morceaux ». */
export const OCTETS_PAR_MORCEAU = 5 * 1024 * 1024;

export interface ReponsePlantee {
  readonly id: string;
  readonly interviewId: string;
  readonly missionQuestionId: string;
  readonly valeur: string;
}

export interface PhotoPlantee {
  readonly id: string;
  readonly interviewId: string;
  readonly answerId: string;
  readonly taille: number;
  readonly sha256: string;
  readonly morceaux: number;
}

export interface ParametresFileMassive {
  readonly coffre: Coffre;
  readonly missionId: string;
  readonly auditeurId: string;
  /** Les sessions du siège sur lesquelles les réponses se répartissent. */
  readonly interviewIds: readonly string[];
  /** Les questions de mission : chaque (session, question) reçoit AU PLUS une réponse. */
  readonly missionQuestionIds: readonly string[];
  readonly nombreReponses: number;
  readonly nombrePhotos: number;
  /** Tailles (octets) imposées aux premières photos : les « plusieurs morceaux ». */
  readonly taillesPhotosLourdes: readonly number[];
}

export interface FilePlantee {
  readonly reponses: readonly ReponsePlantee[];
  readonly photos: readonly PhotoPlantee[];
}

type LignesPlantees = Record<string, Record<string, unknown>[]>;

/** Générateur pseudo-aléatoire déterministe (xorshift32) : mêmes octets à chaque exécution. */
function octetsSynthetiques(taille: number, graine: number): Uint8Array {
  const octets = new Uint8Array(taille);
  let etat = (graine * 2654435761) >>> 0 || 1;
  for (let i = 0; i < taille; i += 1) {
    etat ^= etat << 13;
    etat >>>= 0;
    etat ^= etat >>> 17;
    etat ^= etat << 5;
    etat >>>= 0;
    octets[i] = etat & 0xff;
  }
  // JPEG minimal reconnaissable : SOI + APP0 « JFIF » en tête, EOI en queue.
  octets.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], 0);
  octets.set([0xff, 0xd9], taille - 2);
  return octets;
}

/**
 * Les modules du terrain, chargés APRÈS la pose de fake-indexeddb (dépendance du
 * terrain, jamais de la racine) : Dexie capte `indexedDB` à son chargement, un import
 * statique le verrait absent.
 */
async function chargerPortTerrain(): Promise<{
  readonly BaseLocale: typeof BaseLocale;
  readonly installerContexteLocal: typeof installerContexteLocal;
  readonly retirerContexteLocal: typeof retirerContexteLocal;
  readonly ecrireLocal: typeof ecrireLocal;
  readonly ecrirePieceAvecOctets: typeof ecrirePieceAvecOctets;
}> {
  const requireTerrain = createRequire(resolve(RACINE, 'apps', 'field', 'package.json'));
  const faux = requireTerrain('fake-indexeddb') as { indexedDB: unknown; IDBKeyRange: unknown };
  Object.assign(globalThis, { indexedDB: faux.indexedDB, IDBKeyRange: faux.IDBKeyRange });
  const [{ BaseLocale }, contexte, { ecrireLocal }, { ecrirePieceAvecOctets }] = await Promise.all([
    import('../../apps/field/src/local/base.js'),
    import('../../apps/field/src/local/contexte.js'),
    import('../../apps/field/src/local/ecriture.js'),
    import('../../apps/field/src/local/octets.js'),
  ]);
  return {
    BaseLocale,
    installerContexteLocal: contexte.installerContexteLocal,
    retirerContexteLocal: contexte.retirerContexteLocal,
    ecrireLocal,
    ecrirePieceAvecOctets,
  };
}

/** Verse des lignes dans le vrai IndexedDB du navigateur, dans UNE transaction. */
async function verser(page: Page, lignes: LignesPlantees): Promise<void> {
  await page.evaluate(async (semences: LignesPlantees) => {
    const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
      const demande = indexedDB.open('axion-terrain');
      demande.onsuccess = () => {
        resoudre(demande.result);
      };
      demande.onerror = () => {
        rejeter(demande.error ?? new Error('ouverture d’IndexedDB refusée'));
      };
    });
    const magasins = Object.keys(semences);
    const transaction = base.transaction(magasins, 'readwrite');
    for (const [nom, rangees] of Object.entries(semences)) {
      for (const rangee of rangees) transaction.objectStore(nom).put(rangee);
    }
    await new Promise<void>((resoudre, rejeter) => {
      transaction.oncomplete = () => {
        resoudre();
      };
      transaction.onerror = () => {
        rejeter(transaction.error ?? new Error('transaction de versement refusée'));
      };
    });
    base.close();
  }, lignes);
}

/** Vide les quatre tables écrites par le port, après les avoir lues (mémoire bornée). */
async function extraireEtVider(base: BaseLocale): Promise<LignesPlantees> {
  const lot: LignesPlantees = {
    answers: (await base.answers.toArray()) as unknown as Record<string, unknown>[],
    attachments: (await base.attachments.toArray()) as unknown as Record<string, unknown>[],
    octetsPieces: (await base.octetsPieces.toArray()) as unknown as Record<string, unknown>[],
    outbox: (await base.outbox.toArray()) as unknown as Record<string, unknown>[],
  };
  await Promise.all([
    base.answers.clear(),
    base.attachments.clear(),
    base.octetsPieces.clear(),
    base.outbox.clear(),
  ]);
  return lot;
}

/**
 * Fabrique puis verse la file : `nombreReponses` réponses (une op chacune), puis
 * `nombrePhotos` photos (méta + octets + op). L'ordre des ops est l'ordre de leur
 * `opId` v7 : toutes les réponses d'abord, puis les photos, comme une journée de collecte.
 *
 * À appeler HORS LIGNE (le test coupe le réseau avant) : l'application ne doit pas
 * voir une file à moitié versée.
 */
export async function planterFileMassive(
  page: Page,
  parametres: ParametresFileMassive,
): Promise<FilePlantee> {
  const { coffre, missionId, auditeurId, interviewIds, missionQuestionIds } = parametres;
  const capacite = interviewIds.length * missionQuestionIds.length;
  if (parametres.nombreReponses > capacite) {
    throw new Error(
      `${String(parametres.nombreReponses)} réponses demandées pour ${String(capacite)} couples (session, question) : l'unicité du siège l'interdit.`,
    );
  }

  const port = await chargerPortTerrain();
  const { installerContexteLocal, retirerContexteLocal, ecrireLocal, ecrirePieceAvecOctets } = port;
  const base = new port.BaseLocale(`s6-noeud-${uuidv7()}`);
  await base.open();
  installerContexteLocal({ base, coffre });
  const reponses: ReponsePlantee[] = [];
  const photos: PhotoPlantee[] = [];
  try {
    // ── Les réponses, par lots de 250 ───────────────────────────────────────────
    const instant = new Date().toISOString();
    for (let debut = 0; debut < parametres.nombreReponses; debut += 250) {
      const fin = Math.min(debut + 250, parametres.nombreReponses);
      for (let n = debut; n < fin; n += 1) {
        const interviewId = interviewIds[n % interviewIds.length] ?? '';
        const missionQuestionId = missionQuestionIds[Math.floor(n / interviewIds.length)] ?? '';
        const valeur = `Réponse fictive de volume n° ${String(n + 1)}`;
        const id = uuidv7();
        await ecrireLocal({
          entite: 'answer',
          id,
          missionId,
          action: 'upsert',
          index: {
            interviewId,
            missionQuestionId,
            flagReview: 0,
            notApplicable: 0,
            withheld: 0,
            horsParcours: 0,
          },
          charge: {
            value: { type: 'free_text', v: valeur },
            note: null,
            reviewReason: null,
            naReason: null,
            withheldReason: null,
            source: 'entretien',
            questionTextSnapshot: `Question de volume ${missionQuestionId.slice(-6)}`,
            revision: 1,
            clientCreatedAt: instant,
          },
        });
        reponses.push({ id, interviewId, missionQuestionId, valeur });
      }
      await verser(page, await extraireEtVider(base));
    }

    // ── Les photos, versées dès que ≈ 1,5 Mo d'octets bruts s'accumulent ─────────
    // (une photo lourde part SEULE : un seul message DevTools ne doit pas peser des dizaines de Mo).
    let enAttente = 0;
    {
      for (let n = 0; n < parametres.nombrePhotos; n += 1) {
        const lourde = parametres.taillesPhotosLourdes[n];
        // 150 à 300 Ko, déterministe : le volume d'une photo d'atelier compressée.
        const taille = lourde ?? 150_000 + ((n * 7919) % 150_001);
        const octets = octetsSynthetiques(taille, n + 1);
        const reponse = reponses[n % reponses.length];
        if (reponse === undefined) throw new Error('aucune réponse pour rattacher la photo');
        const id = uuidv7();
        await ecrirePieceAvecOctets(
          {
            entite: 'attachment_meta',
            id,
            missionId,
            action: 'upsert',
            index: { interviewId: reponse.interviewId, answerId: reponse.id, kind: 'photo' },
            charge: {
              content: null,
              filename: `photo-${id}.jpg`,
              mime: 'image/jpeg',
              sizeBytes: taille,
              storageKey: null,
              purgeAfter: null,
              createdBy: auditeurId,
              clientCreatedAt: new Date().toISOString(),
            },
          },
          octets,
        );
        photos.push({
          id,
          interviewId: reponse.interviewId,
          answerId: reponse.id,
          taille,
          sha256: createHash('sha256').update(octets).digest('hex'),
          morceaux: Math.max(1, Math.ceil(taille / OCTETS_PAR_MORCEAU)),
        });
        enAttente += taille;
        if (enAttente >= 1_500_000 || n === parametres.nombrePhotos - 1) {
          await verser(page, await extraireEtVider(base));
          enAttente = 0;
        }
      }
    }
  } finally {
    // Retire le contexte (et verrouille la copie Node du coffre : on n'en a plus besoin).
    retirerContexteLocal();
    base.close();
  }
  return { reponses, photos };
}

/** Compte les rangées d'un magasin (ou d'un index = valeur) du navigateur, sans les lire. */
export async function compterLocal(
  page: Page,
  magasin: string,
  index?: { readonly nom: string; readonly valeur: string },
): Promise<number> {
  return page.evaluate(
    async (demande) => {
      const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
        const ouverture = indexedDB.open('axion-terrain');
        ouverture.onsuccess = () => {
          resoudre(ouverture.result);
        };
        ouverture.onerror = () => {
          rejeter(ouverture.error ?? new Error('ouverture d’IndexedDB refusée'));
        };
      });
      const n = await new Promise<number>((resoudre, rejeter) => {
        const stock = base.transaction(demande.magasin).objectStore(demande.magasin);
        const requete =
          demande.index === undefined
            ? stock.count()
            : stock.index(demande.index.nom).count(IDBKeyRange.only(demande.index.valeur));
        requete.onsuccess = () => {
          resoudre(requete.result);
        };
        requete.onerror = () => {
          rejeter(requete.error ?? new Error('comptage local refusé'));
        };
      });
      base.close();
      return n;
    },
    { magasin, index },
  );
}
