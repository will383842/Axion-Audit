// =============================================================================
// TESTS DU TRANSPORT — LES TROIS ROUTES DE CHUNKS — lot L6c-1. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis 05 §9.6 et la note d'entrée du lot :
//   POST /v1/sync/attachments/:id/chunks/:index   (octets bruts)
//   GET  /v1/sync/attachments/:id/status          → { statut, chunksRecus: number[] }
//   POST /v1/sync/attachments/:id/complete {sha256, chunks}
//        → 200 { statut: 'assemble' } | 409 { error: { code, message, details: number[] } }
//
// ── API ATTENDUE : `TransportSync` (transport.ts) gagne les trois méthodes de
// `TransportPieces` (chunks.ts) — `statutPiece`, `envoyerMorceau`,
// `terminerPiece` — sur la MÊME authentification que `pousser`/`tirer` (Bearer,
// refresh rotatif, 401/429/502-504/coupure = indisponibilité).
//   · `envoyerMorceau` : corps = les octets du morceau, `content-type:
//     application/octet-stream` (JAMAIS du JSON ni du base64) ;
//   · `terminerPiece` : un 409 `UPLOAD_CHUNKS_MISSING` ou `UPLOAD_CHECKSUM_MISMATCH` dont
//     `details` est une liste d'entiers devient `{ type: 'a_reemettre', code, index }`
//
// Le `fetch` est factice : aucun réseau réel. Rouge attendu tant que les trois
// méthodes n'existent pas — pour cette seule raison.
// Traçabilité : E7 ; 05 §9.6 ; 11 §3.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '@axion/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { creerTransport } from './transport.js';
import { octetsVaries } from './fixtures/pieces.js';

const ACCES = 'acces-factice';
const PIECE = '0191e2a0-0000-7000-8000-00000000aa01';
const SHA = 'a'.repeat(64);

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(71));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  nomBase = `axion-test-transport-pieces-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  base.close();
  await Dexie.delete(nomBase);
});

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function transportAvec(
  repondre: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const appels: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFactice = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    appels.push({ url, init });
    return repondre(url, init);
  });
  const transport = creerTransport({ fetch: fetchFactice, base, coffre });
  transport.definirJetonAcces(ACCES);
  return { transport, appels };
}

function entete(init: RequestInit | undefined, nom: string): string | null {
  return new Headers(init?.headers).get(nom);
}

async function octetsDuCorps(init: RequestInit | undefined): Promise<Uint8Array> {
  return new Uint8Array(await new Response(init?.body ?? null).arrayBuffer());
}

describe('transport — GET …/attachments/:id/status', () => {
  it('@critique GET authentifié sur le chemin /api, réponse { statut, chunksRecus }', async () => {
    const { transport, appels } = transportAvec(() =>
      json({ statut: 'en_cours', chunksRecus: [0, 2] }),
    );
    const resultat = await transport.statutPiece(PIECE);
    expect(resultat).toEqual({ type: 'ok', donnees: { statut: 'en_cours', chunksRecus: [0, 2] } });
    expect(appels[0]?.url).toBe(`/api/v1/sync/attachments/${PIECE}/status`);
    expect(appels[0]?.init?.method ?? 'GET').toBe('GET');
    expect(entete(appels[0]?.init, 'authorization')).toBe(`Bearer ${ACCES}`);
  });

  it('une réponse illisible (chunksRecus absent) → refus en français, jamais une exception', async () => {
    const { transport } = transportAvec(() => json({ statut: 'en_cours' }));
    const resultat = await transport.statutPiece(PIECE);
    expect(resultat.type).toBe('refus');
  });

  it('coupure réseau → hors_ligne', async () => {
    const { transport } = transportAvec(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await transport.statutPiece(PIECE)).toEqual({ type: 'hors_ligne' });
  });
});

describe('transport — POST …/attachments/:id/chunks/:index', () => {
  it('@critique les octets BRUTS du morceau, en application/octet-stream, au bon index', async () => {
    const { transport, appels } = transportAvec(() => json({ recu: 3 }));
    const morceau = octetsVaries(4096);
    const resultat = await transport.envoyerMorceau(PIECE, 3, morceau);
    expect(resultat.type).toBe('ok');
    const [appel] = appels;
    expect(appel?.url).toBe(`/api/v1/sync/attachments/${PIECE}/chunks/3`);
    expect(appel?.init?.method).toBe('POST');
    expect(entete(appel?.init, 'content-type')).toBe('application/octet-stream');
    expect(entete(appel?.init, 'authorization')).toBe(`Bearer ${ACCES}`);
    expect(typeof appel?.init?.body).not.toBe('string');
    expect(Array.from(await octetsDuCorps(appel?.init))).toEqual(Array.from(morceau));
  });

  it('503 → hors_ligne (indisponibilité, jamais un échec de la pièce)', async () => {
    const { transport } = transportAvec(() => new Response(null, { status: 503 }));
    expect(await transport.envoyerMorceau(PIECE, 0, octetsVaries(8))).toEqual({
      type: 'hors_ligne',
    });
  });
});

describe('transport — POST …/attachments/:id/complete', () => {
  it('@critique JSON { sha256, chunks } ; 200 → ok { statut: assemble }', async () => {
    const { transport, appels } = transportAvec(() => json({ statut: 'assemble' }));
    const resultat = await transport.terminerPiece(PIECE, { sha256: SHA, chunks: 4 });
    expect(resultat).toEqual({ type: 'ok', donnees: { statut: 'assemble' } });
    const [appel] = appels;
    expect(appel?.url).toBe(`/api/v1/sync/attachments/${PIECE}/complete`);
    expect(appel?.init?.method).toBe('POST');
    expect(entete(appel?.init, 'content-type')).toBe('application/json');
    expect(JSON.parse(await new Response(appel?.init?.body ?? null).text())).toEqual({
      sha256: SHA,
      chunks: 4,
    });
  });

  // `DECISIONS.md` [L6c] (2026-10-09) : deux codes seulement, `details` = index triés.
  it('@critique 409 UPLOAD_CHUNKS_MISSING [1, 4] → { a_reemettre, code, index: [1, 4] }', async () => {
    const { transport } = transportAvec(() =>
      json(
        {
          error: {
            code: 'UPLOAD_CHUNKS_MISSING',
            message: 'Des morceaux manquent.',
            details: [1, 4],
          },
        },
        409,
      ),
    );
    expect(await transport.terminerPiece(PIECE, { sha256: SHA, chunks: 5 })).toEqual({
      type: 'a_reemettre',
      code: 'UPLOAD_CHUNKS_MISSING',
      index: [1, 4],
    });
  });

  it('@critique 409 UPLOAD_CHECKSUM_MISMATCH : tous les index à réémettre', async () => {
    const { transport } = transportAvec(() =>
      json(
        {
          error: {
            code: 'UPLOAD_CHECKSUM_MISMATCH',
            message: 'L’empreinte ne correspond pas.',
            details: [0, 1, 2],
          },
        },
        409,
      ),
    );
    expect(await transport.terminerPiece(PIECE, { sha256: SHA, chunks: 3 })).toEqual({
      type: 'a_reemettre',
      code: 'UPLOAD_CHECKSUM_MISMATCH',
      index: [0, 1, 2],
    });
  });

  it('un 409 d’un AUTRE code, même avec une liste, reste un refus (pas de réémission inventée)', async () => {
    const { transport } = transportAvec(() =>
      json({ error: { code: 'CONFLICT', message: 'Conflit.', details: [1] } }, 409),
    );
    const resultat = await transport.terminerPiece(PIECE, { sha256: SHA, chunks: 5 });
    expect(resultat.type).toBe('refus');
  });

  it('un 409 SANS liste d’entiers exploitable reste un refus (pas de réémission inventée)', async () => {
    const { transport } = transportAvec(() =>
      json({ error: { code: 'UPLOAD_CHUNKS_MISSING', message: 'Des morceaux manquent.' } }, 409),
    );
    const resultat = await transport.terminerPiece(PIECE, { sha256: SHA, chunks: 5 });
    expect(resultat.type).toBe('refus');
  });

  it('un 404 (pièce inconnue ou non-propriétaire) reste un refus, message français', async () => {
    const { transport } = transportAvec(() =>
      json({ error: { code: 'NOT_FOUND', message: 'Pièce introuvable.' } }, 404),
    );
    const resultat = await transport.terminerPiece(PIECE, { sha256: SHA, chunks: 1 });
    expect(resultat).toEqual({ type: 'refus', statut: 404, message: 'Pièce introuvable.' });
  });
});

// =============================================================================
// Compléments revue A17 / A29 (`DECISIONS.md` [L6c], 2026-10-09).
// =============================================================================
describe('transport — 409 UPLOAD_ALREADY_ASSEMBLED est terminal', () => {
  it('@critique même avec une liste d’index, ce n’est JAMAIS une réémission', async () => {
    const { transport } = transportAvec(() =>
      json(
        {
          error: {
            code: 'UPLOAD_ALREADY_ASSEMBLED',
            message: 'Cette pièce est déjà assemblée au siège avec un autre contenu.',
            details: [0, 1],
          },
        },
        409,
      ),
    );
    const resultat = await transport.terminerPiece(PIECE, { sha256: SHA, chunks: 2 });
    expect(resultat.type).not.toBe('a_reemettre');
    expect(resultat.type).toBe('refus');
  });
});

describe('transport — les codes UPLOAD_* viennent de `ERROR_CODES` (packages/shared)', () => {
  const codes = ERROR_CODES as Readonly<Record<string, string>>;

  it('@critique les trois codes existent dans `ERROR_CODES`, valeur = nom', () => {
    for (const nom of [
      'UPLOAD_CHUNKS_MISSING',
      'UPLOAD_CHECKSUM_MISMATCH',
      'UPLOAD_ALREADY_ASSEMBLED',
    ]) {
      expect(codes[nom]).toBe(nom);
    }
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `z.enum(['UPLOAD_CHUNKS_MISSING', …])` recopié
  // à la main — le jour où le siège renomme un code, le terrain transforme une
  // réémission en refus et la photo reste sur l'appareil.
  it('@critique `transport.ts` n’écrit aucun code UPLOAD_* en littéral et importe ERROR_CODES', () => {
    const source = readFileSync(fileURLToPath(new URL('./transport.ts', import.meta.url)), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split(/\r?\n/)
      .map((ligne) => ligne.replace(/(^|\s)\/\/.*$/, '$1'))
      .join('\n');
    expect(code).not.toMatch(/['"`]UPLOAD_[A-Z_]+['"`]/);
    expect(code).toMatch(/ERROR_CODES/);
  });
});
