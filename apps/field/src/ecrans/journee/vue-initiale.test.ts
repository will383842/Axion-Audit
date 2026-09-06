// =============================================================================
// LA VUE INITIALE EST UNE RÈGLE — les deux cas de l'arbitrage A01 (2026-09-05),
// et le cas que la règle NE DOIT PAS toucher. Écrit par A23.
// Traçabilité : E23 (hyper intuitif, novice < 30 min), E6 (hors ligne total).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VUE_INITIALE } from '../../app/vues.js';
import { BaseLocale, cleEmbarquement, clePersistance, ecrireMeta } from '../../local/base.js';
import { aUneMissionEmbarquee, vueInitiale } from './vue-initiale.js';

const NOM_BASE = 'axion-test-l5c-vue-initiale';
const MISSION = '0191e2a0-0000-7000-8000-00000000f5de';
let base: BaseLocale;

beforeAll(async () => {
  base = new BaseLocale(NOM_BASE);
  await base.open();
});
beforeEach(async () => {
  await base.meta.clear();
});
afterAll(async () => {
  base.close();
  await Dexie.delete(NOM_BASE);
});

describe('vueInitiale — une règle, pas une constante (arbitrage A01, 2026-09-05)', () => {
  it('@critique CAS 1 — une mission embarquée : l’application démarre sur le cockpit', () => {
    expect(
      vueInitiale({ missionEmbarquee: true, vueAtterrissage: VUE_INITIALE, profondeurPile: 1 }),
    ).toBe('aujourdhui');
  });

  it('@critique CAS 2 — aucune mission embarquée : l’application démarre sur l’embarquement', () => {
    expect(
      vueInitiale({ missionEmbarquee: false, vueAtterrissage: VUE_INITIALE, profondeurPile: 1 }),
    ).toBe(VUE_INITIALE);
    expect(VUE_INITIALE).toBe('accueil');
  });

  it('@critique la REPRISE INSTANTANÉE (03 §17.4) n’est jamais détournée vers le cockpit', () => {
    // L'auditeur était en entretien : rouvrir l'application le ramène à
    // l'entretien, mission embarquée ou non. La règle ne joue que sur
    // l'atterrissage PAR DÉFAUT.
    expect(
      vueInitiale({ missionEmbarquee: true, vueAtterrissage: 'entretien', profondeurPile: 1 }),
    ).toBe('entretien');
  });

  it('une pile déjà profonde n’est pas un démarrage : la règle ne s’applique pas', () => {
    expect(
      vueInitiale({ missionEmbarquee: true, vueAtterrissage: VUE_INITIALE, profondeurPile: 2 }),
    ).toBe(VUE_INITIALE);
  });
});

describe('aUneMissionEmbarquee — « données présentes », jamais « persistance accordée »', () => {
  it('@critique une marque d’embarquement suffit', async () => {
    await ecrireMeta(base, cleEmbarquement(MISSION), '2026-09-05T07:00:00.000Z');
    expect(await aUneMissionEmbarquee(base)).toBe(true);
  });

  it('@critique la persistance SEULE ne vaut pas embarquement (DECISIONS.md 2026-09-02)', async () => {
    await ecrireMeta(base, clePersistance(MISSION), true);
    expect(await aUneMissionEmbarquee(base)).toBe(false);
  });

  it('une base vide : aucune mission', async () => {
    expect(await aUneMissionEmbarquee(base)).toBe(false);
  });
});
