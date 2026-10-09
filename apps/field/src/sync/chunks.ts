// =============================================================================
// L'ENVOI DES PIÈCES PAR MORCEAUX, CÔTÉ TERRAIN — lot L6c-1 « les octets ».
//
// 05 §9.6 : « découpage en chunks de 5 Mo — POST …/chunks/:index (idempotent
// par couple id+index) · GET …/status → liste des chunks reçus (la reprise
// n'envoie QUE les manquants) · POST …/complete {sha256} → le serveur assemble
// et vérifie le checksum (échec → 409 + liste des chunks à réémettre) ».
//
// ── L'ALGORITHME, ET POURQUOI IL EST CELUI-LÀ ────────────────────────────────
//   1. `status` D'ABORD : l'appareil ne sait jamais ce qui est passé avant une
//      coupure ou un kill (scénario 7 du §9.8) ; le siège, lui, le sait. Une
//      pièce déjà assemblée (réponse perdue) ne renvoie aucun octet. Un envoi en
//      `echec` (empreinte refusée) repart de zéro.
//   2. N'émettre QUE les manquants, dans l'ordre des index.
//   3. `complete {sha256, chunks}` : l'empreinte du TOUT, calculée par WebCrypto.
//   4. Un 409 rend une liste : on réémet EXACTEMENT cette liste, puis on rappelle
//      `complete` — au plus `REEMISSIONS_MAX` fois. Au-delà, la pièce passe
//      « en_echec » avec un message français ; elle sera retentée au passage
//      SUIVANT, jamais en boucle dans le même (DECISIONS [L6c]).
//   Toute indisponibilité (hors ligne, reconnexion) arrête l'envoi SANS changer
//   le statut local : rien n'est perdu, la reprise relira `status`.
//
// Une pièce ne quitte jamais l'appareil par effacement : « envoyée » n'est qu'un
// statut, les octets restent jusqu'à « décharger la mission » (invariant 7).
//
// Traçabilité : E7, E38 · invariants 1, 7 et 8 · 05 §9.6, §9.8-6 et -7.
// =============================================================================
import type { ERROR_CODES } from '@axion/shared';
import type { BaseLocale } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import {
  lignesOctetsDeMission,
  lireOctetsPiece,
  marquerStatutEnvoi,
  type StatutEnvoi,
} from '../local/octets.js';
import type { ResultatTransport } from './transport.js';

/** Taille d'un morceau : 5 × 1024 × 1024 octets (05 §9.6). */
export const TAILLE_MORCEAU_OCTETS = 5 * 1024 * 1024;

/** Nombre maximal de réémissions demandées par `complete` dans UN envoi. */
export const REEMISSIONS_MAX = 3;

/** Les deux codes du 409 de `complete` (DECISIONS [L6c], 2026-10-09). */
export type CodeReemission =
  (typeof ERROR_CODES)['UPLOAD_CHUNKS_MISSING'] | (typeof ERROR_CODES)['UPLOAD_CHECKSUM_MISMATCH'];

export interface ReponseStatutPieceLocale {
  readonly statut: string;
  readonly chunksRecus: readonly number[];
}

export type ResultatTerminerPiece =
  | ResultatTransport<{ readonly statut: 'assemble' }>
  | {
      readonly type: 'a_reemettre';
      readonly code: CodeReemission;
      readonly index: readonly number[];
    };

/** Les trois routes du 05 §9.6, telles que le moteur les voit. */
export interface TransportPieces {
  statutPiece(id: string): Promise<ResultatTransport<ReponseStatutPieceLocale>>;
  envoyerMorceau(
    id: string,
    index: number,
    octets: Uint8Array,
  ): Promise<ResultatTransport<unknown>>;
  terminerPiece(
    id: string,
    corps: { readonly sha256: string; readonly chunks: number },
  ): Promise<ResultatTerminerPiece>;
}

export interface BilanEnvoiPiece {
  readonly statut: 'envoyee' | 'hors_ligne' | 'reconnexion_requise' | 'en_echec';
  /** En français quand le statut n'est pas `envoyee`. */
  readonly message: string | null;
}

const MESSAGE_HORS_LIGNE =
  'Le siège est injoignable : la photo reste sur cet appareil et partira à la prochaine synchronisation.';
const MESSAGE_REEMISSIONS =
  'Le siège n’a pas pu reconstituer cette photo malgré plusieurs envois : elle reste sur cet appareil et sera retentée à la prochaine synchronisation.';

/** Découpe en morceaux de `taille` octets, dans l'ordre ; le dernier peut être plus court. */
export function decouper(octets: Uint8Array, taille: number = TAILLE_MORCEAU_OCTETS): Uint8Array[] {
  if (!Number.isInteger(taille) || taille <= 0) {
    throw new Error('La taille d’un morceau doit être un entier positif.');
  }
  const morceaux: Uint8Array[] = [];
  for (let debut = 0; debut < octets.byteLength; debut += taille) {
    morceaux.push(octets.subarray(debut, Math.min(debut + taille, octets.byteLength)));
  }
  return morceaux;
}

/** L'empreinte sha256 du tout, en hexadécimal minuscule (WebCrypto). */
export async function sha256Hex(octets: Uint8Array): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new Uint8Array(octets));
  return Array.from(new Uint8Array(empreinte), (o) => o.toString(16).padStart(2, '0')).join('');
}

function bilanDeTransport(
  resultat: Exclude<ResultatTransport<unknown>, { type: 'ok' }>,
): BilanEnvoiPiece {
  switch (resultat.type) {
    case 'hors_ligne':
      return { statut: 'hors_ligne', message: MESSAGE_HORS_LIGNE };
    case 'reconnexion_requise':
      return { statut: 'reconnexion_requise', message: resultat.message };
    case 'refus':
      return { statut: 'en_echec', message: resultat.message };
  }
}

/** Envoie UNE pièce par le protocole §9.6. N'écrit rien localement. */
export async function envoyerPiece(
  transport: TransportPieces,
  id: string,
  octets: Uint8Array,
  options: { readonly tailleMorceau?: number } = {},
): Promise<BilanEnvoiPiece> {
  const decoupes = decouper(octets, options.tailleMorceau);
  // Une pièce vide est un envoi d'UN morceau vide : le siège exige `chunks ≥ 1`.
  const morceaux = decoupes.length === 0 ? [new Uint8Array(0)] : decoupes;
  const nombre = morceaux.length;

  const statut = await transport.statutPiece(id);
  if (statut.type !== 'ok') return bilanDeTransport(statut);
  // `assemble` : aucun morceau ne repart, mais `complete` est TOUJOURS appelé
  // avec l'empreinte locale (DECISIONS [L6c]) — 200 si les octets du siège sont
  // les nôtres, 409 `UPLOAD_ALREADY_ASSEMBLED` (terminal → « en_echec ») sinon.
  const assemblee = statut.donnees.statut === 'assemble';
  const recus = new Set(statut.donnees.statut === 'echec' ? [] : statut.donnees.chunksRecus);
  let aEmettre = assemblee ? [] : morceaux.map((_, i) => i).filter((i) => !recus.has(i));
  const empreinte = await sha256Hex(octets);

  for (let reemissions = 0; ; reemissions += 1) {
    for (const index of aEmettre) {
      const morceau = morceaux[index];
      if (morceau === undefined) continue;
      const envoi = await transport.envoyerMorceau(id, index, morceau);
      if (envoi.type !== 'ok') return bilanDeTransport(envoi);
    }

    const fin = await transport.terminerPiece(id, { sha256: empreinte, chunks: nombre });
    if (fin.type === 'ok') return { statut: 'envoyee', message: null };
    if (fin.type !== 'a_reemettre') return bilanDeTransport(fin);
    if (reemissions >= REEMISSIONS_MAX) return { statut: 'en_echec', message: MESSAGE_REEMISSIONS };
    // Un index hors de la pièce ne se réémet pas : il ne correspond à aucun octet.
    aEmettre = [...new Set(fin.index)].filter((i) => i >= 0 && i < nombre).sort((a, b) => a - b);
  }
}

export interface DependancesEnvoiPieces {
  readonly base: BaseLocale;
  readonly coffre: Coffre;
  readonly transport: TransportPieces;
  readonly tailleMorceau?: number;
  /**
   * Filtre du moteur : une pièce ne part que si sa ligne `attachments` est
   * acquittée par le siège (aucune op de la pièce encore en file). Absent, toute
   * pièce à envoyer de la mission part.
   */
  readonly admise?: (id: string) => boolean;
}

export interface BilanEnvoiPieces {
  readonly envoyees: number;
  readonly enEchec: number;
  /** Pièces encore « à envoyer » (non tentées, ou interrompues par le réseau). */
  readonly restantes: number;
}

const A_TENTER: ReadonlySet<StatutEnvoi> = new Set(['a_envoyer', 'en_echec']);

/**
 * Envoie les pièces « à envoyer » ou « en échec » d'une mission, UNE tentative
 * chacune par appel, et écrit leur statut local après chaque envoi. Une
 * indisponibilité du réseau arrête le passage : le reste attend le suivant.
 */
export async function envoyerPiecesEnAttente(
  deps: DependancesEnvoiPieces,
  missionId: string,
): Promise<BilanEnvoiPieces> {
  const { base, coffre, transport } = deps;
  const candidates = (await lignesOctetsDeMission(base, missionId)).filter((l) =>
    A_TENTER.has(l.statutEnvoi),
  );

  let envoyees = 0;
  let enEchec = 0;
  let restantes = 0;
  let interrompu = false;

  for (const ligne of candidates) {
    if (interrompu || (deps.admise !== undefined && !deps.admise(ligne.id))) {
      if (ligne.statutEnvoi === 'en_echec') enEchec += 1;
      else restantes += 1;
      continue;
    }

    let bilan: BilanEnvoiPiece;
    try {
      const octets = await lireOctetsPiece(base, coffre, ligne.id);
      if (octets === null) continue;
      bilan = await envoyerPiece(
        transport,
        ligne.id,
        octets,
        deps.tailleMorceau === undefined ? {} : { tailleMorceau: deps.tailleMorceau },
      );
    } catch {
      // Octets illisibles ou panne locale : la pièce est signalée, jamais effacée.
      bilan = { statut: 'en_echec', message: null };
    }

    switch (bilan.statut) {
      case 'envoyee':
        await marquerStatutEnvoi(base, ligne.id, 'envoyee');
        envoyees += 1;
        break;
      case 'en_echec':
        await marquerStatutEnvoi(base, ligne.id, 'en_echec');
        enEchec += 1;
        break;
      case 'hors_ligne':
      case 'reconnexion_requise':
        interrompu = true;
        if (ligne.statutEnvoi === 'en_echec') enEchec += 1;
        else restantes += 1;
        break;
    }
  }

  return { envoyees, enEchec, restantes };
}
