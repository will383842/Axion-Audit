// =============================================================================
// LOT S1, RÉSERVE R1 (relecture A17) — UNE MISSION SANS QUESTION NI BLOC ACTIF.
//
// Un calcul qui ne trouve rien à coter n'écrit aucune ligne de `block_scores` /
// `unit_scores`. Il a pourtant EU LIEU : l'export ne doit pas dire le contraire, et le
// 2e calcul doit nommer celui qu'il remplace. Exigences écrites sur le FAIT, pas sur le
// texte du motif :
//   · compute-scores répond 200 ;
//   · l'export reflète qu'un calcul a été fait : soit `scores.csv` présent
//     (`presents=true`), soit absent avec un motif qui ne prétend PAS « aucun calcul
//     lancé » ;
//   · le 2e calcul laisse `calcul_precedent_le` NON NUL dans `activity_log`.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireArchiveExport, texteDuFichier } from './aide/archive-export.js';
import {
  calculer,
  creerCompte,
  demarrerContexte,
  ipUnique,
  lireBlockScores,
  rattacher,
  semerMission,
  type Contexte,
} from './aide/semis-scoring.js';

let ctx: Contexte | undefined;
function c(): Contexte {
  if (ctx === undefined) throw new Error('contexte non démarré');
  return ctx;
}

beforeAll(async () => {
  ctx = await demarrerContexte('l8s1_vide');
}, 300_000);

afterAll(async () => {
  if (ctx !== undefined) await ctx.fermer();
});

interface MetaScores {
  scores: { presents: boolean; motif: string | null };
}

describe('@critique une mission sans question ni bloc actif : le calcul a eu lieu, et on le dit', () => {
  it('@critique 200, export cohérent avec le fait « un calcul a eu lieu », 2e calcul chaîné', async () => {
    const lead = await creerCompte(c(), 'consultant', 'vide-lead');
    const mission = await semerMission(c(), []);
    await rattacher(c(), mission.id, lead.id, 'lead');

    const premier = await calculer(c(), mission.id, lead.jeton);
    expect(premier.statut, premier.texte).toBe(200);
    expect(await lireBlockScores(c(), mission.id)).toHaveLength(0); // vacuité : rien à coter

    const reponse = await c().api.inject({
      method: 'GET',
      url: `/v1/missions/${mission.id}/export`,
      headers: { 'x-forwarded-for': ipUnique(), authorization: `Bearer ${lead.jeton}` },
    });
    expect(reponse.statusCode, reponse.body).toBe(200);
    const archive = lireArchiveExport(reponse.rawPayload);
    const meta = JSON.parse(texteDuFichier(archive, 'mission.json')) as MetaScores;

    if (meta.scores.presents) {
      expect(archive.has('scores.csv')).toBe(true);
      expect(meta.scores.motif).toBeNull();
    } else {
      expect(archive.has('scores.csv')).toBe(false);
      const motif = meta.scores.motif ?? '';
      expect(motif.length).toBeGreaterThan(20);
      // Le fait : un calcul a eu lieu. Le motif ne peut pas prétendre le contraire.
      expect(motif).not.toMatch(/aucun calcul/i);
      expect(motif).not.toMatch(/encore été lancé/i);
    }

    const second = await calculer(c(), mission.id, lead.jeton);
    expect(second.statut, second.texte).toBe(200);
    const trace = await c().bd.query<{ meta: Record<string, unknown> | null }>(
      `SELECT meta FROM activity_log
        WHERE action = 'mission.compute_scores' AND entity_id = $1 ORDER BY created_at, id`,
      [mission.id],
    );
    expect(trace.rows).toHaveLength(2);
    expect(trace.rows[0]?.meta?.calcul_precedent_le).toBeNull();
    expect(trace.rows[1]?.meta?.calcul_precedent_le).not.toBeNull();
    expect(trace.rows[1]?.meta?.calcul_precedent_le).toBeDefined();
  });
});
