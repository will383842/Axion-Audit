// =============================================================================
// TESTS DU JETON DE RAFRAÎCHISSEMENT LOCAL — lot L5, incrément L5a.
//
// Écrits par A26 depuis 11 §3 (« terrain : Bearer + refresh token CHIFFRÉ dans
// Dexie »), 05 §31-3 (expiration hors ligne : la saisie continue, seule la sync
// attend) et les signatures/JSDoc exportées de `jetons.ts` — dont celle-ci, qui
// est une décision : « une enveloppe illisible LÈVE : la traiter comme “pas de
// jeton” masquerait une corruption ».
//
// Traçabilité : E33 (sécurité / RGPD — jeton jamais en clair au repos) ·
// E6 (hors ligne total).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BaseLocale, CLES_META } from './base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from './coffre.js';
import {
  effacerJetonRafraichissement,
  enregistrerJetonRafraichissement,
  lireJetonRafraichissement,
} from './jetons.js';

const JETON_SENTINELLE = 'SENTINELLE_JETON_RAFRAICHISSEMENT_VB4T9K';

let kek: CryptoKey;
let coffre: Coffre;
const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-jetons-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(5));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
}, 20_000);

afterEach(async () => {
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('jetons — enregistrer / lire / effacer (11 §3, 05 §31-3)', () => {
  const jeton = {
    valeur: JETON_SENTINELLE,
    expireLe: '2026-10-02T08:00:00.000Z',
    enregistreLe: '2026-09-02T08:00:00.000Z',
  };

  it('sans jeton enregistré, lire rend null', async () => {
    const base = await nouvelleBase();
    expect(await lireJetonRafraichissement(base, coffre)).toBeNull();
  });

  it('@critique aller-retour : ce qui est enregistré se relit à l’identique', async () => {
    const base = await nouvelleBase();
    await enregistrerJetonRafraichissement(base, coffre, jeton);
    expect(await lireJetonRafraichissement(base, coffre)).toEqual(jeton);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : le jeton posé tel quel dans `meta` « parce
  // que meta n'est pas une table de données ». Un refresh token de 30 jours en
  // clair sur une tablette volée, c'est un compte ouvert pendant 30 jours.
  it('@critique le jeton n’apparaît JAMAIS en clair dans `meta`', async () => {
    const base = await nouvelleBase();
    await enregistrerJetonRafraichissement(base, coffre, jeton);
    const lignes = await base.meta.toArray();
    expect(lignes.length).toBeGreaterThan(0);
    expect(JSON.stringify(lignes)).not.toContain(JETON_SENTINELLE);
  });

  it('un second enregistrement REMPLACE le premier (rotation 11 §3 : un seul jeton vivant)', async () => {
    const base = await nouvelleBase();
    await enregistrerJetonRafraichissement(base, coffre, jeton);
    const nouveau = {
      ...jeton,
      valeur: `${JETON_SENTINELLE}-2`,
      enregistreLe: '2026-09-02T09:00:00.000Z',
    };
    await enregistrerJetonRafraichissement(base, coffre, nouveau);
    expect(await lireJetonRafraichissement(base, coffre)).toEqual(nouveau);
    expect(await base.meta.where('cle').equals(CLES_META.jetonRafraichissement).count()).toBe(1);
  });

  it('effacer ⇒ lire rend null, et effacer deux fois ne lève pas', async () => {
    const base = await nouvelleBase();
    await enregistrerJetonRafraichissement(base, coffre, jeton);
    await effacerJetonRafraichissement(base);
    expect(await lireJetonRafraichissement(base, coffre)).toBeNull();
    await expect(effacerJetonRafraichissement(base)).resolves.toBeUndefined();
  });

  it('un jeton sans expiration annoncée (`expireLe: null`) est accepté tel quel', async () => {
    const base = await nouvelleBase();
    const sansExpiration = { ...jeton, expireLe: null };
    await enregistrerJetonRafraichissement(base, coffre, sansExpiration);
    expect(await lireJetonRafraichissement(base, coffre)).toEqual(sansExpiration);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `try { … } catch { return null }` — la
  // corruption de la base (ou un coffre ouvert avec la mauvaise DEK) deviendrait
  // un simple écran de reconnexion, indéfiniment.
  it('@critique une enveloppe illisible LÈVE, elle n’est pas rendue comme « pas de jeton »', async () => {
    const base = await nouvelleBase();
    await enregistrerJetonRafraichissement(base, coffre, jeton);
    const autreCoffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
    await expect(lireJetonRafraichissement(base, autreCoffre)).rejects.toThrow();
  });

  it('une valeur de `meta` qui n’est pas une enveloppe lève aussi (jamais null)', async () => {
    const base = await nouvelleBase();
    await base.meta.put({ cle: CLES_META.jetonRafraichissement, valeur: 'pas une enveloppe' });
    await expect(lireJetonRafraichissement(base, coffre)).rejects.toThrow();
  });
});
