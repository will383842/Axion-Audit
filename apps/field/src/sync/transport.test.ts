// =============================================================================
// TESTS DU TRANSPORT DE SYNC — lot L6, incrément L6a « la montée ». ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6) depuis `LOT_L6.md` §3bis (« Transport »), 11 §3 (Bearer,
// access 15 min en mémoire, refresh 30 j rotatif CHIFFRÉ dans Dexie), 05 §31-3
// (refresh expiré hors ligne : la collecte continue, message clair), 05 §9.8
// scénario 8, et les fonctions déjà livrées : `local/jetons.ts`,
// `packages/shared` (`authSessionSchema`, `reponsePushSchema`, `lotPushSchema`).
//
// ── API ATTENDUE DE `apps/field/src/sync/transport.ts` (pour A25) ────────────
//   export const CHEMIN_PUSH = '/api/v1/sync/push';       // Caddy retire `/api`
//   export const CHEMIN_REFRESH = '/api/v1/auth/refresh';
//   export const MESSAGE_RECONNEXION_REQUISE: string;      // texte du 05 §31-3
//   export type ResultatTransport<T> =
//     | { readonly type: 'ok'; readonly donnees: T }
//     | { readonly type: 'hors_ligne' }                              // réseau absent : PAS un refus
//     | { readonly type: 'reconnexion_requise'; readonly message: string } // refresh refusé
//     | { readonly type: 'refus'; readonly statut: number; readonly message: string };
//   export interface DependancesTransport {
//     readonly fetch: typeof fetch;   // injecté, résolu à l'appel (comme siege/connexion.ts)
//     readonly base: BaseLocale;      // lit/écrit le refresh via local/jetons.ts
//     readonly coffre: Coffre;
//   }
//   export interface TransportSync {
//     definirJetonAcces(jeton: string | null): void; // jeton d'accès : MÉMOIRE seulement
//     pousser(lot: LotPush): Promise<ResultatTransport<ReponsePush>>;
//   }
//   export function creerTransport(deps: DependancesTransport): TransportSync;
//
// Règles figées : 401 → UN refresh → UNE reprise ; second 401 = arrêt (pas de boucle) ;
// refresh refusé (401/403) → refresh EFFACÉ + `reconnexion_requise` ; erreur réseau
// (TypeError) → `hors_ligne`, refresh CONSERVÉ (le piège du §31-3) ; le jeton n'apparaît
// jamais dans un résultat ni dans la console (11 §2). Les jetons ci-dessous sont factices.
//
// Rouge attendu tant que `transport.ts` n'existe pas — pour cette seule raison.
// Traçabilité : E7, E38 ; 11 §3 ; 05 §31-3.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LotPush } from '../local/contrat-sync.js';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { enregistrerJetonRafraichissement, lireJetonRafraichissement } from '../local/jetons.js';
import {
  CHEMIN_PUSH,
  CHEMIN_REFRESH,
  MESSAGE_RECONNEXION_REQUISE,
  creerTransport,
} from './transport.js';

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const APPAREIL = '0191e2a0-0000-7000-8000-00000000d001';
const UTILISATEUR = '0191e2a0-0000-7000-8000-00000000e001';
const HORODATAGE = '2026-10-09T08:15:00.000Z';
const ACCES_ANCIEN = 'acces-factice-ancien';
const ACCES_NEUF = 'acces-factice-neuf';
const REFRESH_ANCIEN = 'refresh-factice-ancien';
const REFRESH_NEUF = 'refresh-factice-neuf';

let coffre: Coffre;
let base: BaseLocale;
let nomBase: string;

beforeAll(async () => {
  const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(31));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
});

beforeEach(async () => {
  nomBase = `axion-test-transport-${uuidv7()}`;
  base = new BaseLocale(nomBase);
  await base.open();
  await enregistrerJetonRafraichissement(base, coffre, {
    valeur: REFRESH_ANCIEN,
    expireLe: '2026-11-08T08:15:00.000Z',
    enregistreLe: HORODATAGE,
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  base.close();
  await Dexie.delete(nomBase);
});

// ─────────────────────────────────────────────────────────────────────────────
// Banc : un `fetch` scripté, qui enregistre chaque appel
// ─────────────────────────────────────────────────────────────────────────────
function lot(): LotPush {
  return {
    missionId: MISSION,
    deviceId: APPAREIL,
    operations: [
      {
        opId: uuidv7(),
        entity: 'interview',
        entityId: uuidv7(),
        action: 'upsert',
        payload: { status: 'en_cours' },
        clientUpdatedAt: HORODATAGE,
      },
    ],
    outboxRemaining: 0,
  };
}

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function reponsePush(l: LotPush) {
  return {
    serverTime: HORODATAGE,
    results: l.operations.map((op) => ({ opId: op.opId, result: 'applied' })),
  };
}

const sessionNeuve = {
  accessToken: ACCES_NEUF,
  refreshToken: REFRESH_NEUF,
  tokenType: 'Bearer',
  accessExpiresAt: '2026-10-09T08:30:00.000Z',
  refreshExpiresAt: '2026-11-08T08:15:00.000Z',
  userId: UTILISATEUR,
};

const erreur401 = { error: { code: 'NON_AUTHENTIFIE', message: 'Session expirée.' } };

interface Appel {
  readonly url: string;
  readonly methode: string;
  readonly autorisation: string | null;
  readonly corps: unknown;
}

type Repondeur = (appel: Appel) => Response | Promise<Response>;

function fetchScripte(push: Repondeur[], refresh: Repondeur[] = []) {
  const appels: Appel[] = [];
  const fetchFactice = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    const entetes = new Headers(init?.headers);
    const appel: Appel = {
      url,
      methode: init?.method ?? 'GET',
      autorisation: entetes.get('authorization'),
      corps: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
    };
    appels.push(appel);
    const file = url.endsWith(CHEMIN_PUSH) ? push : url.endsWith(CHEMIN_REFRESH) ? refresh : [];
    const suivant = file.shift();
    if (suivant === undefined) throw new Error(`banc : appel inattendu ${url}`);
    return suivant(appel);
  });
  return {
    fetch: fetchFactice as unknown as typeof fetch,
    appels,
    pushs: () => appels.filter((a) => a.url.endsWith(CHEMIN_PUSH)),
    refreshs: () => appels.filter((a) => a.url.endsWith(CHEMIN_REFRESH)),
  };
}

const horsLigne: Repondeur = () => {
  throw new TypeError('Failed to fetch');
};

// =============================================================================
// A. Bearer et forme de la requête
// =============================================================================
describe('transport — Bearer sur la route de push (11 §3)', () => {
  it('POST sur CHEMIN_PUSH, en-tête « Bearer <accès> », corps = le lot, réponse validée', async () => {
    const l = lot();
    const banc = fetchScripte([() => json(reponsePush(l))]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(l);

    expect(CHEMIN_PUSH).toBe('/api/v1/sync/push');
    expect(banc.pushs()).toHaveLength(1);
    expect(banc.pushs()[0]?.methode).toBe('POST');
    expect(banc.pushs()[0]?.autorisation).toBe(`Bearer ${ACCES_ANCIEN}`);
    expect(banc.pushs()[0]?.corps).toEqual(l);
    expect(banc.refreshs()).toHaveLength(0);
    expect(resultat).toEqual({ type: 'ok', donnees: reponsePush(l) });
  });

  it('sans jeton d’accès en mémoire, un refresh fournit le Bearer avant que le push n’aboutisse', async () => {
    const l = lot();
    const banc = fetchScripte(
      [
        (a) =>
          a.autorisation === `Bearer ${ACCES_NEUF}` ? json(reponsePush(l)) : json(erreur401, 401),
        () => json(reponsePush(l)),
      ],
      [() => json(sessionNeuve)],
    );
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });

    const resultat = await transport.pousser(l);

    expect(resultat.type).toBe('ok');
    expect(banc.refreshs()).toHaveLength(1);
    expect(banc.pushs().at(-1)?.autorisation).toBe(`Bearer ${ACCES_NEUF}`);
  });

  it('une réponse 200 hors contrat n’est jamais lue comme un succès', async () => {
    const banc = fetchScripte([() => json({ inattendu: true })]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat.type).not.toBe('ok');
  });

  it('une erreur 500 n’est pas un succès, ne déclenche aucun refresh et ne touche pas au jeton', async () => {
    const banc = fetchScripte([
      () => json({ error: { code: 'ERREUR_INTERNE', message: 'Erreur du siège.' } }, 500),
    ]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat.type).toBe('refus');
    expect(banc.refreshs()).toHaveLength(0);
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_ANCIEN);
  });
});

// =============================================================================
// B. Refresh rotatif sur 401, puis rejeu UNE fois
// =============================================================================
describe('transport — 401 : un refresh rotatif, puis une seule reprise', () => {
  it('401 → POST refresh avec le jeton stocké → nouveau couple rangé CHIFFRÉ → reprise avec le nouveau Bearer', async () => {
    const l = lot();
    const banc = fetchScripte(
      [() => json(erreur401, 401), () => json(reponsePush(l))],
      [() => json(sessionNeuve)],
    );
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(l);

    expect(resultat).toEqual({ type: 'ok', donnees: reponsePush(l) });
    expect(banc.refreshs()).toHaveLength(1);
    expect(banc.refreshs()[0]?.methode).toBe('POST');
    expect(banc.refreshs()[0]?.corps).toEqual({ refreshToken: REFRESH_ANCIEN });
    expect(banc.pushs().map((a) => a.autorisation)).toEqual([
      `Bearer ${ACCES_ANCIEN}`,
      `Bearer ${ACCES_NEUF}`,
    ]);
    // Rotation : le jeton rangé est le NOUVEAU (l'ancien est révoqué côté serveur).
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_NEUF);
  });

  it('un second 401 arrête la sync : pas de boucle de refresh, pas de jeton effacé', async () => {
    const banc = fetchScripte(
      [() => json(erreur401, 401), () => json(erreur401, 401)],
      [() => json(sessionNeuve)],
    );
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat.type).not.toBe('ok');
    expect(banc.pushs()).toHaveLength(2);
    expect(banc.refreshs()).toHaveLength(1);
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_NEUF);
  });
});

// =============================================================================
// C. Scénario §9.8 n°8 — refresh expiré en mission longue (05 §31-3)
// =============================================================================
describe('transport — scénario §9.8 n°8 : refresh refusé ou réseau absent', () => {
  it('refresh REFUSÉ (401) : jeton effacé, « reconnexion requise », aucune reprise du push', async () => {
    const banc = fetchScripte([() => json(erreur401, 401)], [() => json(erreur401, 401)]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat).toEqual({
      type: 'reconnexion_requise',
      message: MESSAGE_RECONNEXION_REQUISE,
    });
    expect(banc.pushs()).toHaveLength(1);
    expect(await lireJetonRafraichissement(base, coffre)).toBeNull();
  });

  it('refresh REFUSÉ (403) : même traitement que 401', async () => {
    const banc = fetchScripte(
      [() => json(erreur401, 401)],
      [() => json({ error: { code: 'INTERDIT', message: 'Refusé.' } }, 403)],
    );
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat.type).toBe('reconnexion_requise');
    expect(await lireJetonRafraichissement(base, coffre)).toBeNull();
  });

  it('le message est celui du 05 §31-3, en français', () => {
    expect(MESSAGE_RECONNEXION_REQUISE).toMatch(/reconnexion requise pour synchroniser/i);
    expect(MESSAGE_RECONNEXION_REQUISE).toMatch(/vos données sont en sécurité sur l.appareil/i);
  });

  it('RÉSEAU absent pendant le refresh : « hors ligne », le refresh est CONSERVÉ (le piège du §31-3)', async () => {
    const banc = fetchScripte([() => json(erreur401, 401)], [horsLigne]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat).toEqual({ type: 'hors_ligne' });
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_ANCIEN);
  });

  it('RÉSEAU absent pendant le push : « hors ligne », aucun refresh tenté, jeton intact', async () => {
    const banc = fetchScripte([horsLigne]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat).toEqual({ type: 'hors_ligne' });
    expect(banc.refreshs()).toHaveLength(0);
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_ANCIEN);
  });

  it('aucun refresh rangé et aucun accès en mémoire : « reconnexion requise », sans push', async () => {
    await base.meta.clear();
    const banc = fetchScripte([]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });

    const resultat = await transport.pousser(lot());

    expect(resultat.type).toBe('reconnexion_requise');
    expect(banc.pushs()).toHaveLength(0);
  });
});

// =============================================================================
// D. Le jeton n'est jamais journalisé (11 §2)
// =============================================================================
describe('transport — aucun jeton dans un résultat ni dans la console (11 §2)', () => {
  it('ni l’accès, ni le refresh ne sortent du transport', async () => {
    const espions = (['log', 'info', 'warn', 'error', 'debug'] as const).map((n) =>
      vi.spyOn(console, n).mockImplementation(() => undefined),
    );
    const banc = fetchScripte(
      [() => json(erreur401, 401), () => json(erreur401, 401)],
      [() => json(sessionNeuve)],
    );
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    const sortie = JSON.stringify([resultat, ...espions.flatMap((e) => e.mock.calls)]);
    for (const jeton of [ACCES_ANCIEN, ACCES_NEUF, REFRESH_ANCIEN, REFRESH_NEUF]) {
      expect(sortie).not.toContain(jeton);
    }
  });
});

// =============================================================================
// E. Refresh en panne côté siège, corps illisible
// =============================================================================
describe('transport — refresh en panne côté siège, corps illisible', () => {
  it('refresh en 500 : refus, aucune reprise du push, le refresh n’est PAS effacé (ce n’est pas un refus du jeton)', async () => {
    const banc = fetchScripte(
      [() => json(erreur401, 401)],
      [() => json({ error: { code: 'ERREUR_INTERNE', message: 'Erreur du siège.' } }, 500)],
    );
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat.type).toBe('refus');
    expect(banc.pushs()).toHaveLength(1);
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_ANCIEN);
  });

  it('refresh 200 hors contrat : refus, jeton conservé, aucun Bearer inventé', async () => {
    const banc = fetchScripte([() => json(erreur401, 401)], [() => json({ inattendu: true })]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat.type).toBe('refus');
    expect(banc.pushs()).toHaveLength(1);
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_ANCIEN);
  });

  it('erreur 500 au corps non JSON : refus avec un message en français, jamais une trace brute', async () => {
    const banc = fetchScripte([() => new Response('<html>Internal Error</html>', { status: 500 })]);
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const resultat = await transport.pousser(lot());

    expect(resultat.type).toBe('refus');
    if (resultat.type !== 'refus') return;
    expect(resultat.statut).toBe(500);
    expect(resultat.message).toMatch(/siège/i);
    expect(resultat.message).not.toMatch(/html|Internal/i);
  });
});

// =============================================================================
// F. Arbitrage A1 (2026-10-09) : indisponibilité passagère ≠ refus
// =============================================================================
describe('transport — 429 et 502/503/504 = hors ligne ; 400, 403, 500 et autres 5xx = refus', () => {
  for (const statut of [429, 502, 503, 504]) {
    it(`${String(statut)} : « hors_ligne » (aucune tentative ne sera comptée), jeton intact`, async () => {
      const banc = fetchScripte([() => new Response('indisponible', { status: statut })]);
      const transport = creerTransport({ fetch: banc.fetch, base, coffre });
      transport.definirJetonAcces(ACCES_ANCIEN);

      const resultat = await transport.pousser(lot());

      expect(resultat).toEqual({ type: 'hors_ligne' });
      expect(banc.refreshs()).toHaveLength(0);
      expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_ANCIEN);
    });
  }

  for (const statut of [400, 403, 500, 501, 507]) {
    it(`${String(statut)} : « refus » portant le statut`, async () => {
      const banc = fetchScripte([
        () => json({ error: { code: 'REFUS_FICTIF', message: 'Refus fictif.' } }, statut),
      ]);
      const transport = creerTransport({ fetch: banc.fetch, base, coffre });
      transport.definirJetonAcces(ACCES_ANCIEN);

      const resultat = await transport.pousser(lot());

      expect(resultat).toMatchObject({ type: 'refus', statut });
      if (resultat.type === 'refus') expect(resultat.message.length).toBeGreaterThan(0);
    });
  }
});

// =============================================================================
// G. Arbitrage A3 (2026-10-09) : refresh à vol unique PAR BASE
// =============================================================================
describe('transport — refresh à vol unique par base (le jeton tourne : un second refresh serait un rejeu)', () => {
  function bancDeuxMissions() {
    const pousse: Repondeur = (a) =>
      a.autorisation === `Bearer ${ACCES_NEUF}`
        ? json(reponsePush(a.corps as LotPush))
        : json(erreur401, 401);
    return fetchScripte(
      [pousse, pousse, pousse, pousse],
      [
        async () => {
          await new Promise((r) => setTimeout(r, 20));
          return json(sessionNeuve);
        },
      ],
    );
  }

  it('deux 401 simultanés sur le même transport : UN refresh, les deux pushs reprennent et aboutissent', async () => {
    const banc = bancDeuxMissions();
    const transport = creerTransport({ fetch: banc.fetch, base, coffre });
    transport.definirJetonAcces(ACCES_ANCIEN);

    const [a, b] = await Promise.all([transport.pousser(lot()), transport.pousser(lot())]);

    expect(a.type).toBe('ok');
    expect(b.type).toBe('ok');
    expect(banc.refreshs()).toHaveLength(1);
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(REFRESH_NEUF);
  });

  it('deux transports sur la MÊME base (deux missions) : toujours un seul refresh', async () => {
    const banc = bancDeuxMissions();
    const t1 = creerTransport({ fetch: banc.fetch, base, coffre });
    const t2 = creerTransport({ fetch: banc.fetch, base, coffre });
    t1.definirJetonAcces(ACCES_ANCIEN);
    t2.definirJetonAcces(ACCES_ANCIEN);

    const [a, b] = await Promise.all([t1.pousser(lot()), t2.pousser(lot())]);

    expect(a.type).toBe('ok');
    expect(b.type).toBe('ok');
    expect(banc.refreshs()).toHaveLength(1);
  });
});
