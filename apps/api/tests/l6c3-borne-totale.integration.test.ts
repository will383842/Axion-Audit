// =============================================================================
// LOT L6 / L6c-3 — V2 : LA BORNE TOTALE DES ÉCRITURES DU SIÈGE QUI DESCENDENT.
//
// Revue A17 (bloquant) : `statement_timeout` / `lock_timeout` bornent CHAQUE
// instruction, pas la transaction. Un push est en plus annulé si sa durée TOTALE
// dépasse 30 s (`DelaiDepasse`, `sync/service.ts` : mesuré avant le commit, 503
// SERVICE_UNAVAILABLE, rien d'écrit). Les écritures du siège doivent tenir la même
// règle : plusieurs instructions courtes dont la SOMME dépasse 30 s → annulées.
//
// MÉTHODE SANS DÉPENDRE DE L'HORLOGE DU CODE : des déclencheurs de test (fixtures
// SQL) font dormir `pg_sleep` 16 s avant l'UPDATE de la session et avant l'insertion
// au journal d'activité : deux instructions de 16 s (chacune sous la borne de 30 s),
// 32 s au total. Durée réelle du test rouge/vert : ~35 s. Le temps de sommeil est
// lu dans une table de pilotage, remise à 0 pour le cas « sous la borne ».
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

let socle: Socle | undefined;
function s(): Socle {
  if (socle === undefined) throw new Error('socle absent');
  return socle;
}
function bd(): Client {
  return s().client;
}

beforeAll(async () => {
  socle = await monterSocle({ suffixe: 'l6c3_borne', avecMinio: false });
  await bd().query('CREATE TABLE l6c3_pause (secondes numeric NOT NULL)');
  await bd().query('INSERT INTO l6c3_pause VALUES (0)');
  await bd().query(`
    CREATE FUNCTION l6c3_dormir() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_sleep((SELECT secondes FROM l6c3_pause LIMIT 1));
      RETURN NEW;
    END $$`);
  await bd().query(
    'CREATE TRIGGER l6c3_dort_interviews BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION l6c3_dormir()',
  );
  await bd().query(
    'CREATE TRIGGER l6c3_dort_journal BEFORE INSERT ON activity_log FOR EACH ROW EXECUTE FUNCTION l6c3_dormir()',
  );
}, 300_000);
afterAll(async () => {
  if (socle !== undefined) await socle.fermer();
});

let ipN = 0;
async function reaffecter(): Promise<{
  statut: number;
  corps: string;
  session: string;
  ancien: string;
  nouveau: string;
}> {
  const admin = await creerCompte(bd(), 'admin');
  const ancien = await creerCompte(bd(), 'consultant');
  const nouveau = await creerCompte(bd(), 'consultant');
  const missionId = await semerMission(bd());
  await rattacher(bd(), missionId, admin.id, 'lead');
  await rattacher(bd(), missionId, ancien.id, 'consultant');
  await rattacher(bd(), missionId, nouveau.id, 'consultant');
  const unite = await semerUnite(bd(), missionId);
  const session = await semerEntretien(bd(), missionId, unite, ancien.id);
  ipN += 1;
  const r = await s().app.inject({
    method: 'PATCH',
    url: `/v1/interviews/${session}/reassign`,
    headers: {
      authorization: `Bearer ${s().app.jwt.sign({ sub: admin.id })}`,
      'x-forwarded-for': `10.74.0.${String(ipN % 250)}`,
    },
    payload: { newUserId: nouveau.id, motif: 'indisponibilite_auditeur' },
  });
  return { statut: r.statusCode, corps: r.body, session, ancien: ancien.id, nouveau: nouveau.id };
}

async function etat(
  session: string,
): Promise<{ conducted_by: string; updated_at: Date; journal: number }> {
  const i = await bd().query<{ conducted_by: string; updated_at: Date }>(
    'SELECT conducted_by, updated_at FROM interviews WHERE id = $1',
    [session],
  );
  const j = await bd().query<{ n: string }>(
    'SELECT count(*) AS n FROM activity_log WHERE entity_id = $1',
    [session],
  );
  return {
    conducted_by: i.rows[0]?.conducted_by ?? '',
    updated_at: i.rows[0]?.updated_at ?? new Date(0),
    journal: Number(j.rows[0]?.n),
  };
}

describe('L6c-3 · V2 borne TOTALE des écritures du siège @critique', () => {
  it('sous la borne : la réaffectation passe et écrit @critique', async () => {
    await bd().query('UPDATE l6c3_pause SET secondes = 0');
    const r = await reaffecter();
    expect(r.statut, r.corps).toBe(200);
    const e = await etat(r.session);
    expect(e.conducted_by).toBe(r.nouveau);
    expect(e.journal).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('deux instructions de 16 s (somme 32 s > 30 s) : écriture annulée (503), RIEN n’est écrit @critique', async () => {
    await bd().query('UPDATE l6c3_pause SET secondes = 16');
    try {
      const r = await reaffecter();
      expect(
        r.statut,
        `une écriture du siège de 32 s doit être annulée comme un push (DelaiDepasse) : ${r.corps}`,
      ).toBe(503);
      expect(JSON.parse(r.corps)).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
      const e = await etat(r.session);
      expect(e.conducted_by, 'le propriétaire de la session ne doit pas avoir changé').toBe(
        r.ancien,
      );
      expect(e.journal, 'aucune trace ne doit rester d’une écriture annulée').toBe(0);
    } finally {
      await bd().query('UPDATE l6c3_pause SET secondes = 0');
    }
  }, 120_000);
});
