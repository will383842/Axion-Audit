// =============================================================================
// TESTS DU TRANSPORT — LE PULL (`tirer`) — lot L6, incrément L6b. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis 11 §4 (« `GET /v1/sync/pull?mission_id=&since=
// <timestamptz>&limit=` → `{server_time, changes, next_since}` ; premier pull =
// mission complète »), 11 §3 (Bearer, refresh rotatif), `DECISIONS.md` [L6a]
// (401, 429, 502-504 et coupure = indisponibilité, jamais un refus d'op) et le
// transport L6a déjà livré (`pousser`), dont `tirer` partage l'authentification.
//
// ── API ATTENDUE DE `apps/field/src/sync/transport.ts` (pour A25) ────────────
//   export const CHEMIN_PULL = '/api/v1/sync/pull';
//   interface TransportSync {
//     …
//     tirer(missionId: string, since: string | null): Promise<ResultatTransport<ReponsePull>>;
//   }
//   · paramètres de requête en snake_case (11 §4) : `mission_id`, `since` —
//     `since` ABSENT quand il est nul (premier pull) ;
//   · réponse validée par `reponsePullSchema` ; une réponse illisible → `refus`
//     avec un message français, jamais une exception.
//
// Rouge attendu tant que `tirer` / `CHEMIN_PULL` n'existent pas.
// Traçabilité : E7 ; 11 §3, §4.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { CHEMIN_PULL, creerTransport } from './transport.js';

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const SINCE = '2026-10-09T08:15:00.000Z';
const SERVEUR = '2026-10-09T09:00:00.000Z';
const ACCES = 'acces-factice';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(37));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  nomBase = `axion-test-transport-pull-${uuidv7()}`;
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

const PULL_VALIDE = { serverTime: SERVEUR, changes: { answer: [] }, nextSince: null };

function transportAvec(
  repondre: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const appels: { url: string; init?: RequestInit }[] = [];
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

describe('transport — tirer (GET /v1/sync/pull)', () => {
  it('le chemin passe par Caddy (/api), même domaine', () => {
    expect(CHEMIN_PULL).toBe('/api/v1/sync/pull');
  });

  it('@critique GET authentifié, `mission_id` et `since` en paramètres, réponse validée', async () => {
    const { transport, appels } = transportAvec(() => json(PULL_VALIDE));
    const resultat = await transport.tirer(MISSION, SINCE);

    expect(resultat).toEqual({ type: 'ok', donnees: PULL_VALIDE });
    expect(appels).toHaveLength(1);
    const [appel] = appels;
    const url = new URL(appel?.url ?? '', 'https://terrain.invalid');
    expect(url.pathname).toBe(CHEMIN_PULL);
    expect(url.searchParams.get('mission_id')).toBe(MISSION);
    expect(url.searchParams.get('since')).toBe(SINCE);
    expect((appel?.init?.method ?? 'GET').toUpperCase()).toBe('GET');
    const entetes = new Headers(appel?.init?.headers);
    expect(entetes.get('authorization')).toBe(`Bearer ${ACCES}`);
  });

  it('premier pull : `since` est ABSENT de la requête (mission complète)', async () => {
    const { transport, appels } = transportAvec(() => json(PULL_VALIDE));
    await transport.tirer(MISSION, null);
    const url = new URL(appels[0]?.url ?? '', 'https://terrain.invalid');
    expect(url.searchParams.has('since')).toBe(false);
    expect(url.searchParams.get('mission_id')).toBe(MISSION);
  });

  it('coupure réseau → hors_ligne, sans lever', async () => {
    const { transport } = transportAvec(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(transport.tirer(MISSION, SINCE)).resolves.toEqual({ type: 'hors_ligne' });
  });

  for (const statut of [429, 502, 503, 504]) {
    it(`siège saturé (${String(statut)}) → hors_ligne`, async () => {
      const { transport } = transportAvec(() => json({}, statut));
      await expect(transport.tirer(MISSION, SINCE)).resolves.toEqual({ type: 'hors_ligne' });
    });
  }

  it('401 sans refresh stocké → reconnexion requise (message français)', async () => {
    const { transport } = transportAvec(() =>
      json({ error: { code: 'NON_AUTHENTIFIE', message: 'Session expirée.' } }, 401),
    );
    const resultat = await transport.tirer(MISSION, SINCE);
    expect(resultat.type).toBe('reconnexion_requise');
  });

  it('403 → refus avec le message du siège (enveloppe 11 §3)', async () => {
    const { transport } = transportAvec(() =>
      json({ error: { code: 'ACCES_REFUSE', message: 'Mission hors de vos affectations.' } }, 403),
    );
    await expect(transport.tirer(MISSION, SINCE)).resolves.toEqual({
      type: 'refus',
      statut: 403,
      message: 'Mission hors de vos affectations.',
    });
  });

  it('réponse 200 illisible → refus en français, jamais une exception', async () => {
    const { transport } = transportAvec(() => json({ serverTime: 'pas une date', changes: {} }));
    const resultat = await transport.tirer(MISSION, SINCE);
    expect(resultat.type).toBe('refus');
    if (resultat.type === 'refus') expect(resultat.message).toMatch(/[a-zéèàç]{4}/);
  });
});
