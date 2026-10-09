// =============================================================================
// FIXTURES DES PIÈCES — lot L6c-1 « les octets ». Écrites par A26 (09 §5.6).
//
// Deux choses, partagées par les tests de `local/octets`, `sync/chunks` et
// `sync/moteur` (pièces) :
//   · `demandePhoto` — la demande d'écriture d'une photo locale (kind 'photo'),
//     au format du port d'écriture `ecrireLocal` (entité `attachment_meta`) ;
//   · `creerSiegePiecesFictif` — un siège FICTIF qui tient les trois routes du
//     05 §9.6 (status / chunks / complete) en mémoire, idempotent par couple
//     id+index comme le vrai, et qui VÉRIFIE le sha256 avec `node:crypto` — une
//     source indépendante de celle du code testé (WebCrypto), pour que le test ne
//     valide pas un calcul par lui-même.
//
// Missions fictives uniquement (invariant 2).
// =============================================================================
import { hash } from 'node:crypto';
import type { ResultatTransport } from '../transport.js';

export const MISSION_PIECES = '0191e2a0-0000-7000-8000-00000000f1de';
export const AUTRE_MISSION_PIECES = '0191e2a0-0000-7000-8000-00000000f2de';
export const AUDITEUR_PIECES = '0191e2a0-0000-7000-8000-00000000e001';
export const HORODATAGE_PIECES = '2026-10-09T08:15:00.000Z';

/** Des octets reconnaissables : un marqueur en clair répété, pour traquer une fuite. */
export const MARQUEUR_EN_CLAIR = 'OCTETS-EN-CLAIR-FIL-TPE';

export function octetsMarques(taille: number): Uint8Array {
  const motif = new TextEncoder().encode(MARQUEUR_EN_CLAIR);
  const octets = new Uint8Array(taille);
  for (let i = 0; i < taille; i += 1) octets[i] = motif[i % motif.length] ?? 0;
  return octets;
}

/** Des octets pseudo-aléatoires déterministes (aucun motif répété). */
export function octetsVaries(taille: number, graine = 7): Uint8Array {
  const octets = new Uint8Array(taille);
  let x = graine;
  for (let i = 0; i < taille; i += 1) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    octets[i] = x & 0xff;
  }
  return octets;
}

export function sha256NodeHex(octets: Uint8Array): string {
  return hash('sha256', octets, 'hex');
}

/** La demande d'écriture d'une photo locale, forme du port `ecrireLocal`. */
export function demandePhoto(
  id: string,
  octets: Uint8Array,
  options: {
    readonly missionId?: string;
    readonly interviewId?: string | null;
    readonly answerId?: string | null;
  } = {},
) {
  return {
    entite: 'attachment_meta' as const,
    id,
    missionId: options.missionId ?? MISSION_PIECES,
    action: 'upsert' as const,
    index: {
      interviewId: options.interviewId ?? null,
      answerId: options.answerId ?? null,
      kind: 'photo' as const,
    },
    charge: {
      content: null,
      filename: `photo-${id}.jpg`,
      mime: 'image/jpeg',
      sizeBytes: octets.byteLength,
      storageKey: null,
      purgeAfter: null,
      createdBy: AUDITEUR_PIECES,
      clientCreatedAt: HORODATAGE_PIECES,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Le siège fictif des trois routes §9.6
// ─────────────────────────────────────────────────────────────────────────────
export type ResultatTerminerFictif =
  | ResultatTransport<{ readonly statut: 'assemble' }>
  | { readonly type: 'a_reemettre'; readonly index: readonly number[] };

export interface AppelPiece {
  readonly route: 'status' | 'chunk' | 'complete';
  readonly id: string;
  readonly index?: number;
}

export interface ReglagesSiegePieces {
  /** Après ce nombre de morceaux REÇUS (tous ids confondus), le réseau tombe. */
  coupureApresMorceaux?: number;
  /** Nombre de fois où `complete` rend 409 avec ces index, même si tout est bon. */
  reemissionsForcees?: { readonly fois: number; readonly index: readonly number[] };
  /** Le serveur « perd » ces index à la réception (ils ne sont jamais retenus). */
  indexPerdusToujours?: readonly number[];
  /** Tout est hors ligne. */
  horsLigne?: boolean;
}

export function creerSiegePiecesFictif(reglages: ReglagesSiegePieces = {}) {
  const recus = new Map<string, Map<number, Uint8Array>>();
  const assembles = new Map<string, Uint8Array>();
  const appels: AppelPiece[] = [];
  let morceauxRecus = 0;
  let reemissionsRestantes = reglages.reemissionsForcees?.fois ?? 0;

  function morceaux(id: string): Map<number, Uint8Array> {
    let m = recus.get(id);
    if (m === undefined) {
      m = new Map();
      recus.set(id, m);
    }
    return m;
  }

  function reseauTombe(): boolean {
    if (reglages.horsLigne === true) return true;
    return (
      reglages.coupureApresMorceaux !== undefined && morceauxRecus >= reglages.coupureApresMorceaux
    );
  }

  const transport = {
    // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
    async statutPiece(
      id: string,
    ): Promise<
      ResultatTransport<{ readonly statut: string; readonly chunksRecus: readonly number[] }>
    > {
      appels.push({ route: 'status', id });
      if (reseauTombe()) return { type: 'hors_ligne' };
      const statut = assembles.has(id) ? 'assemble' : recus.has(id) ? 'en_cours' : 'inconnu';
      return {
        type: 'ok',
        donnees: { statut, chunksRecus: [...morceaux(id).keys()].sort((a, b) => a - b) },
      };
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
    async envoyerMorceau(
      id: string,
      index: number,
      octets: Uint8Array,
    ): Promise<ResultatTransport<unknown>> {
      appels.push({ route: 'chunk', id, index });
      if (reseauTombe()) return { type: 'hors_ligne' };
      morceauxRecus += 1;
      if (!(reglages.indexPerdusToujours ?? []).includes(index)) {
        // idempotent par couple id+index : un renvoi écrase à l'identique.
        morceaux(id).set(index, new Uint8Array(octets));
      }
      return { type: 'ok', donnees: { recu: index } };
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- signature asynchrone du transport.
    async terminerPiece(
      id: string,
      corps: { readonly sha256: string; readonly chunks: number },
    ): Promise<ResultatTerminerFictif> {
      appels.push({ route: 'complete', id });
      if (reseauTombe()) return { type: 'hors_ligne' };
      if (assembles.has(id)) return { type: 'ok', donnees: { statut: 'assemble' } };
      const m = morceaux(id);
      const manquants: number[] = [];
      for (let i = 0; i < corps.chunks; i += 1) if (!m.has(i)) manquants.push(i);
      if (manquants.length > 0) return { type: 'a_reemettre', index: manquants };
      if (reemissionsRestantes > 0 && reglages.reemissionsForcees !== undefined) {
        reemissionsRestantes -= 1;
        for (const i of reglages.reemissionsForcees.index) m.delete(i);
        return { type: 'a_reemettre', index: reglages.reemissionsForcees.index };
      }
      const parties: Uint8Array[] = [];
      for (let i = 0; i < corps.chunks; i += 1) parties.push(m.get(i) ?? new Uint8Array());
      const total = parties.reduce((n, p) => n + p.byteLength, 0);
      const tout = new Uint8Array(total);
      let pos = 0;
      for (const p of parties) {
        tout.set(p, pos);
        pos += p.byteLength;
      }
      if (sha256NodeHex(tout) !== corps.sha256) {
        // Le serveur ne sait pas lequel est faux : il demande tout.
        m.clear();
        return {
          type: 'a_reemettre',
          index: Array.from({ length: corps.chunks }, (_, i) => i),
        };
      }
      assembles.set(id, tout);
      return { type: 'ok', donnees: { statut: 'assemble' } };
    },
  };

  return {
    transport,
    appels,
    assemble: (id: string): Uint8Array | undefined => assembles.get(id),
    indexEmis: (id: string): number[] =>
      appels.filter((a) => a.route === 'chunk' && a.id === id).map((a) => a.index ?? -1),
    retablirReseau(): void {
      reglages.coupureApresMorceaux = undefined;
      reglages.horsLigne = false;
    },
    couperReseau(): void {
      reglages.horsLigne = true;
    },
  };
}
