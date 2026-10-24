// =============================================================================
// LOT L6 / L6c-3 « LE SIÈGE » — V2(a) : L'HORLOGE DES ÉCRITURES DU SIÈGE.
//
// Écrit AVANT le code (09 §3-2, §5.6). Source : DECISIONS 2026-10-09 [L6b]
// « Re-revue A17 » — les écritures du siège sur les tables qui descendent (unités,
// réaffectation de session, missions) gardent l'heure de l'application sans borne de
// durée ; passage à l'horloge PostgreSQL et à la même durée max que le push engagé
// en L6c. Raison : le plafond du pull compare `updated_at` à l'heure de la BASE ; une
// horloge applicative en avance fait attendre une ligne hors du delta, en retard la
// fait manquer.
//
// MÉTHODE : on fait dériver l'horloge APPLICATIVE (`Date` simulée à +2 h, seul `Date`
// est simulé : les minuteries restent réelles), on écrit par les VRAIES routes du
// siège, puis on relit `updated_at` : il doit venir de la base (à 30 s près de son
// `now()` réel), jamais des +2 h de l'application.
//
// HELPER EXIGÉ : `apps/api/src/db/horloge.ts` exporte `lireHorlogeDuLot(ex)` (même
// signature qu'aujourd'hui dans `sync/depot.ts`, à DÉPLACER, `depot.ts` peut le
// réexporter) et `bornerLaTransaction(ex, dureeMs)` (SET LOCAL statement_timeout et
// lock_timeout, idem). Les écritures du siège s'en servent avec la durée max du push
// (30 s).
// =============================================================================
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Client } from 'pg';
import {
  creerCompte,
  monterSocle,
  rattacher,
  semerEntretien,
  semerMission,
  semerUnite,
  type Socle,
} from './aide/socle-l6c3.js';

const DERIVE_MS = 2 * 3600 * 1000;
const TOLERANCE_MS = 30_000;

let socle: Socle | undefined;
function s(): Socle {
  if (socle === undefined) throw new Error('socle absent');
  return socle;
}
function bd(): Client {
  return s().client;
}

beforeAll(async () => {
  socle = await monterSocle({ suffixe: 'l6c3_horloge', avecMinio: false });
}, 300_000);
afterAll(async () => {
  vi.useRealTimers();
  if (socle !== undefined) await socle.fermer();
});
afterEach(() => {
  vi.useRealTimers();
});

let ipN = 0;
async function appeler(
  methode: 'PATCH' | 'POST',
  url: string,
  jeton: string,
  charge: Record<string, unknown>,
): Promise<{ statut: number; corps: string }> {
  ipN += 1;
  const r = await s().app.inject({
    method: methode,
    url,
    headers: {
      authorization: `Bearer ${jeton}`,
      'x-forwarded-for': `10.70.${String(Math.floor(ipN / 250))}.${String(ipN % 250)}`,
    },
    payload: charge,
  });
  return { statut: r.statusCode, corps: r.body };
}

async function horlogeBase(): Promise<number> {
  const r = await bd().query<{ t: Date }>('SELECT now() AS t');
  return new Date(r.rows[0]?.t ?? Number.NaN).getTime();
}

async function updatedAt(
  table: 'org_units' | 'missions' | 'interviews',
  id: string,
): Promise<number> {
  const r = await bd().query<{ t: Date }>(`SELECT updated_at AS t FROM ${table} WHERE id = $1`, [
    id,
  ]);
  return new Date(r.rows[0]?.t ?? Number.NaN).getTime();
}

/** Fait dériver l'horloge applicative de +2 h, signe le jeton À CET INSTANT-LÀ. */
function deriver(sujet: string): string {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + DERIVE_MS);
  return s().app.jwt.sign({ sub: sujet });
}

function exigerHeureDeLaBase(valeur: number, reference: number, ce: string): void {
  expect(
    Math.abs(valeur - reference),
    `${ce} : updated_at écart de ${String(Math.round((valeur - reference) / 1000))} s avec l’horloge de la base (dérive applicative de +2 h ?)`,
  ).toBeLessThan(TOLERANCE_MS);
}

describe('L6c-3 · V2(a) les écritures du siège prennent l’heure de la BASE @critique', () => {
  it('PATCH /v1/org-units/:id avec horloge applicative +2 h → updated_at = heure de la base @critique', async () => {
    const admin = await creerCompte(bd(), 'admin');
    const missionId = await semerMission(bd());
    await rattacher(bd(), missionId, admin.id, 'lead');
    const unite = await semerUnite(bd(), missionId);
    const jeton = deriver(admin.id);

    const r = await appeler('PATCH', `/v1/org-units/${unite}`, jeton, { name: 'Unité renommée' });
    vi.useRealTimers();

    expect(r.statut, r.corps).toBe(200);
    exigerHeureDeLaBase(await updatedAt('org_units', unite), await horlogeBase(), 'org_units');
  });

  it('PATCH /v1/missions/:id avec horloge applicative +2 h → updated_at = heure de la base @critique', async () => {
    const admin = await creerCompte(bd(), 'admin');
    const missionId = await semerMission(bd());
    await rattacher(bd(), missionId, admin.id, 'lead');
    const jeton = deriver(admin.id);

    const r = await appeler('PATCH', `/v1/missions/${missionId}`, jeton, {
      title: 'Titre modifié par le siège',
    });
    vi.useRealTimers();

    expect(r.statut, r.corps).toBe(200);
    exigerHeureDeLaBase(await updatedAt('missions', missionId), await horlogeBase(), 'missions');
  });

  it('PATCH /v1/interviews/:id/reassign avec horloge applicative +2 h → updated_at de la session = heure de la base @critique', async () => {
    const admin = await creerCompte(bd(), 'admin');
    const ancien = await creerCompte(bd(), 'consultant');
    const nouveau = await creerCompte(bd(), 'consultant');
    const missionId = await semerMission(bd());
    await rattacher(bd(), missionId, admin.id, 'lead');
    await rattacher(bd(), missionId, ancien.id, 'consultant');
    await rattacher(bd(), missionId, nouveau.id, 'consultant');
    const unite = await semerUnite(bd(), missionId);
    const session = await semerEntretien(bd(), missionId, unite, ancien.id);
    const jeton = deriver(admin.id);

    const r = await appeler('PATCH', `/v1/interviews/${session}/reassign`, jeton, {
      newUserId: nouveau.id,
      motif: 'indisponibilite_auditeur',
    });
    vi.useRealTimers();

    expect(r.statut, r.corps).toBe(200);
    exigerHeureDeLaBase(await updatedAt('interviews', session), await horlogeBase(), 'interviews');
    const proprio = await bd().query<{ conducted_by: string }>(
      'SELECT conducted_by FROM interviews WHERE id = $1',
      [session],
    );
    expect(proprio.rows[0]?.conducted_by).toBe(nouveau.id);
  });
});

describe('L6c-3 · V2(a) le helper d’horloge déplacé vers src/db/horloge.ts', () => {
  it('lireHorlogeDuLot rend l’heure de la base, indépendante de la Date applicative', async () => {
    const chemin = '../src/db/horloge.js';
    const module = (await import(/* @vite-ignore */ chemin)) as {
      lireHorlogeDuLot?: (ex: unknown) => Promise<Date>;
    };
    expect(module.lireHorlogeDuLot, 'src/db/horloge.ts doit exporter lireHorlogeDuLot').toBeTypeOf(
      'function',
    );
    const { db } = await import('../src/db.js');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + DERIVE_MS);
    const lue = await module.lireHorlogeDuLot?.(db);
    vi.useRealTimers();
    exigerHeureDeLaBase(
      (lue ?? new Date(Number.NaN)).getTime(),
      await horlogeBase(),
      'lireHorlogeDuLot',
    );
  });

  it('bornerLaTransaction borne statement_timeout et lock_timeout pour la seule transaction @critique', async () => {
    const chemin = '../src/db/horloge.js';
    const module = (await import(/* @vite-ignore */ chemin)) as {
      bornerLaTransaction?: (ex: unknown, dureeMs: number) => Promise<void>;
    };
    expect(
      module.bornerLaTransaction,
      'src/db/horloge.ts doit exporter bornerLaTransaction',
    ).toBeTypeOf('function');
    const { db } = await import('../src/db.js');
    const lu = await db.transaction(async (tx) => {
      await module.bornerLaTransaction?.(tx, 30_000);
      const r = await tx.execute<{ st: string; lk: string }>(
        sql`SELECT current_setting('statement_timeout') AS st,
                                                 current_setting('lock_timeout') AS lk`,
      );
      return r.rows[0];
    });
    expect(lu).toEqual({ st: '30s', lk: '30s' });
  });
});
