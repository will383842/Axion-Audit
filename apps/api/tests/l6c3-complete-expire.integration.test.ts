// =============================================================================
// LOT L6 / L6c-3 — `complete` remet `expire_le` à NULL quand l'envoi est assemblé
// (décision L6c-3 : un envoi assemblé n'a plus d'échéance de purge).
// Test demandé par la coordination à l'auteur du correctif (fichier neuf, aucun
// test du testeur modifié).
// =============================================================================
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  creerCompte,
  monterSocle,
  rattacher,
  semerMission,
  semerPhotoVolante,
  type Socle,
} from './aide/socle-l6c3.js';

let socle: Socle | undefined;
function s(): Socle {
  if (socle === undefined) throw new Error('socle absent');
  return socle;
}

beforeAll(async () => {
  socle = await monterSocle({ suffixe: 'l6c3_complete', avecMinio: true });
}, 300_000);
afterAll(async () => {
  if (socle !== undefined) await socle.fermer();
});

describe('L6c-3 · complete et échéance de purge @critique', () => {
  it('après complete réussi, expire_le est NULL et le statut est assemble @critique', async () => {
    const compte = await creerCompte(s().client, 'consultant');
    const missionId = await semerMission(s().client);
    await rattacher(s().client, missionId, compte.id, 'consultant');
    const pieceId = await semerPhotoVolante(s().client, missionId, compte.id);
    const jeton = s().app.jwt.sign({ sub: compte.id });
    const octets = randomBytes(16);
    const morceau = await s().app.inject({
      method: 'POST',
      url: `/v1/sync/attachments/${pieceId}/chunks/0`,
      headers: {
        authorization: `Bearer ${jeton}`,
        'content-type': 'application/octet-stream',
        'x-forwarded-for': '10.73.0.1',
      },
      payload: octets,
    });
    expect(morceau.statusCode, morceau.body).toBe(200);
    const fin = await s().app.inject({
      method: 'POST',
      url: `/v1/sync/attachments/${pieceId}/complete`,
      headers: {
        authorization: `Bearer ${jeton}`,
        'content-type': 'application/json',
        'x-forwarded-for': '10.73.0.2',
      },
      payload: JSON.stringify({
        sha256: createHash('sha256').update(octets).digest('hex'),
        chunks: 1,
      }),
    });
    expect(fin.statusCode, fin.body).toBe(200);
    const ligne = await s().client.query<{ statut: string; expire_le: Date | null }>(
      'SELECT statut, expire_le FROM attachment_uploads WHERE attachment_id = $1',
      [pieceId],
    );
    expect(ligne.rows[0]).toEqual({ statut: 'assemble', expire_le: null });
  });
});
