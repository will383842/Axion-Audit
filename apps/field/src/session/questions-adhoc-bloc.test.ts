// =============================================================================
// UNE QUESTION AD HOC NE NAÎT JAMAIS SANS BLOC — revue A29 de L6a, arbitrage B1
// du 2026-10-09. ÉCRIT AVANT LE CODE.
//
// Écrit par A26 (09 §5.6) depuis l'arbitrage B1 (« le dialogue prend le bloc de la
// question courante, sinon celui de la question de banque la plus proche, sinon il
// demande »), 11 §4 (op `question_adhoc` : le serveur crée `questions` — `block_id`
// est une FK du 04, résolue depuis le CODE de bloc) et `session/questions-adhoc.ts`.
//
// ── API ATTENDUE DANS `apps/field/src/session/questions-adhoc.ts` (pour A25) ──
//   type RepereDeBloc = Pick<QuestionLocale, 'position' | 'blockCode' | 'addedAdHoc'>;
//   export function blocPourQuestionAdHoc(
//     courante: Pick<QuestionLocale, 'position' | 'blockCode'> | undefined,
//     parcours: readonly RepereDeBloc[],
//   ): string | null;
//   // et `creerQuestionAdHoc` REFUSE un `blockCode` null ou vide (rien n'est écrit).
//
// Règle de proximité fixée ici (le pack ne la tranche pas — signalé à la
// coordination) : distance en `position` ; à égalité, la question QUI PRÉCÈDE ;
// sans question courante, la question de banque de plus grande position (l'ad hoc
// se pose en fin de parcours). Un bloc vide (« ») vaut absent.
//
// Traçabilité : E7 ; 03 §17.5 (question ad hoc) ; invariant 7.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from '../local/coffre.js';
import { installerContexteLocal, retirerContexteLocal } from '../local/contexte.js';
import { blocPourQuestionAdHoc, creerQuestionAdHoc } from './questions-adhoc.js';

const MISSION = '0191e2a0-0000-7000-8000-00000000f1de';
const NOM_BASE = 'axion-test-adhoc-bloc';

function q(position: number, blockCode: string | null, addedAdHoc = false) {
  return { position, blockCode, addedAdHoc };
}

describe('blocPourQuestionAdHoc — courante, sinon banque la plus proche, sinon rien', () => {
  it('prend le bloc de la question courante', () => {
    expect(blocPourQuestionAdHoc(q(5, 'bloc_a'), [q(1, 'bloc_b'), q(5, 'bloc_a')])).toBe('bloc_a');
  });

  it('courante sans bloc : la question de BANQUE la plus proche en position', () => {
    const parcours = [q(2, 'bloc_a'), q(5, null), q(7, 'bloc_b'), q(9, 'bloc_c')];
    expect(blocPourQuestionAdHoc(q(5, null), parcours)).toBe('bloc_b');
  });

  it('à égalité de distance, la question qui PRÉCÈDE', () => {
    const parcours = [q(3, 'bloc_a'), q(5, null), q(7, 'bloc_b')];
    expect(blocPourQuestionAdHoc(q(5, null), parcours)).toBe('bloc_a');
  });

  it('une question AD HOC voisine ne sert jamais de repère (seule la banque compte)', () => {
    const parcours = [q(1, 'bloc_a'), q(5, null), q(6, 'bloc_x', true)];
    expect(blocPourQuestionAdHoc(q(5, null), parcours)).toBe('bloc_a');
  });

  it('un bloc vide vaut absent', () => {
    const parcours = [q(2, 'bloc_a'), q(5, '')];
    expect(blocPourQuestionAdHoc(q(5, ''), parcours)).toBe('bloc_a');
  });

  it('sans question courante : la question de banque de plus grande position', () => {
    const parcours = [q(1, 'bloc_a'), q(4, 'bloc_b'), q(6, 'bloc_x', true)];
    expect(blocPourQuestionAdHoc(undefined, parcours)).toBe('bloc_b');
  });

  it('aucun repère : null — le dialogue doit DEMANDER', () => {
    expect(blocPourQuestionAdHoc(undefined, [])).toBeNull();
    expect(blocPourQuestionAdHoc(q(1, null), [q(1, null), q(2, 'bloc_x', true)])).toBeNull();
  });
});

describe('creerQuestionAdHoc — refuse de créer sans bloc', () => {
  let base: BaseLocale;

  beforeAll(async () => {
    const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(59));
    const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
    base = new BaseLocale(NOM_BASE);
    await base.open();
    installerContexteLocal({ base, coffre });
  });

  beforeEach(async () => {
    await base.outbox.clear();
    await base.missionQuestions.clear();
  });

  afterAll(async () => {
    retirerContexteLocal();
    base.close();
    await Dexie.delete(NOM_BASE);
  });

  for (const blockCode of [null, '', '   ']) {
    it(`blockCode ${JSON.stringify(blockCode)} : refus en français, rien d’écrit (ni ligne, ni op)`, async () => {
      // Le type pourra se resserrer en `string` : le refus reste exigé à l'exécution.
      const demande: Record<string, unknown> = {
        missionId: MISSION,
        texte: 'Question ad hoc fictive ?',
        answerType: 'free_text',
        guidance: null,
        blockCode,
        position: 3,
      };
      await expect(
        creerQuestionAdHoc(demande as unknown as Parameters<typeof creerQuestionAdHoc>[0]),
      ).rejects.toThrow(/bloc/i);
      expect(await base.outbox.count()).toBe(0);
      expect(await base.missionQuestions.count()).toBe(0);
    });
  }

  it('avec un bloc : la question est créée', async () => {
    const id = await creerQuestionAdHoc({
      missionId: MISSION,
      texte: 'Question ad hoc fictive ?',
      answerType: 'free_text',
      guidance: null,
      blockCode: 'bloc_a',
      position: 3,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await base.outbox.count()).toBe(1);
  });
});
