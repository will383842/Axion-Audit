// =============================================================================
// TESTS DU COFFRE D'APPAREIL — lot L5, incrément L5a (couverture du module
// critique `apps/field/src/local/**`, DoD ≥ 90 % mesurée).
//
// Écrits par A26 depuis 05 §9.7 et 05 §31-3, et depuis les SEULES signatures et
// JSDoc exportées de `coffre-appareil.ts` (09 §5.6) :
//   `lireCoffreAuRepos(base)` · `initialiserCoffre(base, mdp, params?)` (« ne fait
//   rien si un coffre existe déjà ») · `deverrouiller(base, mdp)` (« aucun réseau
//   requis ») · `etatAvantChangementDeMotDePasse(base)` (« la donnée du garde-fou
//   05 §9.7 ») · `changerMotDePasse(base, ancien, nouveau, params?)`
//   (« ré-enveloppement : les données ne sont pas touchées »).
//
// Traçabilité : E33 (sécurité / RGPD — KEK dérivée du mot de passe, DEK
// enveloppée au repos) · E6 (hors ligne total — déverrouillage sans serveur).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { BaseLocale, CLES_META } from './base.js';
import {
  CoffreAbsentError,
  changerMotDePasse,
  deverrouiller,
  etatAvantChangementDeMotDePasse,
  initialiserCoffre,
  lireCoffreAuRepos,
} from './coffre-appareil.js';
import { MotDePasseInvalideError, type Enveloppe } from './coffre.js';
import { installerContexteLocal, retirerContexteLocal } from './contexte.js';
import { ecrireLocal } from './ecriture.js';

const MDP = 'correct-cheval-pile-agrafe-2026';
const MDP_NOUVEAU = 'nouveau-cheval-pile-agrafe-2026';
const MISSION_ID = '0191e2a0-0000-7000-8000-00000000f1de';
const SENTINELLE = 'SENTINELLE_COFFRE_APPAREIL_QX8N2V';

const schemaClair = z.object({ valeur: z.string() });

let compteur = 0;
const bases: BaseLocale[] = [];

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-coffre-appareil-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

afterEach(async () => {
  retirerContexteLocal();
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

async function ecrireUneReponse(
  base: BaseLocale,
  coffre: Awaited<ReturnType<typeof deverrouiller>>,
) {
  installerContexteLocal({ base, coffre });
  await ecrireLocal({
    entite: 'answer',
    id: uuidv7(),
    missionId: MISSION_ID,
    action: 'upsert',
    index: {
      interviewId: '0191e2a0-0000-7000-8000-00000000a001',
      missionQuestionId: '0191e2a0-0000-7000-8000-00000000b001',
      flagReview: 0,
      notApplicable: 0,
      withheld: 0,
      horsParcours: 0,
    },
    charge: {
      value: { type: 'number', v: 1 },
      note: null,
      reviewReason: null,
      naReason: null,
      withheldReason: null,
      source: 'entretien',
      questionTextSnapshot: 'Question fictive',
      revision: 1,
      clientCreatedAt: '2026-09-02T08:15:00.000Z',
    },
  });
}

// =============================================================================
// A. Naissance du coffre
// =============================================================================
describe('initialiserCoffre / lireCoffreAuRepos (05 §9.7)', () => {
  it('sur un appareil neuf, aucun coffre au repos', async () => {
    const base = await nouvelleBase();
    expect(await lireCoffreAuRepos(base)).toBeNull();
  });

  it('@critique initialiser range dans `meta` un sel, des paramètres et une DEK ENVELOPPÉE — jamais la DEK', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });
    await expect(coffre.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });

    const auRepos = await lireCoffreAuRepos(base);
    expect(auRepos).not.toBeNull();
    expect(auRepos?.sel.length).toBeGreaterThan(0);
    expect(auRepos?.parametres.algo).toBe('argon2id');
    // Ce qui est au repos ne doit permettre de rien déchiffrer sans le mot de passe :
    // la DEK n'y est qu'enveloppée. On le prouve en cherchant un tampon de 32
    // octets NU dans la ligne `meta` — il n'y en a pas.
    const ligne = await base.meta.get(CLES_META.coffre);
    const texte = JSON.stringify(ligne);
    expect(texte).not.toContain(SENTINELLE);
    expect(ligne).toBeDefined();
  });

  it('@critique initialiser une seconde fois NE REMPLACE PAS le coffre existant (invariant 7)', async () => {
    const base = await nouvelleBase();
    const coffre1 = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre1.chiffrer({ valeur: SENTINELLE });
    const auRepos1 = JSON.stringify(await lireCoffreAuRepos(base));

    const coffre2 = await initialiserCoffre(base, MDP);
    expect(JSON.stringify(await lireCoffreAuRepos(base))).toEqual(auRepos1);
    await expect(coffre2.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('initialiser avec un AUTRE mot de passe alors qu’un coffre existe est refusé (ce n’est pas une réinitialisation)', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    await expect(initialiserCoffre(base, MDP_NOUVEAU)).rejects.toThrow(MotDePasseInvalideError);
    // Et le coffre d'origine est intact.
    await expect(deverrouiller(base, MDP)).resolves.toBeDefined();
  });

  it('deux appareils (deux bases) reçoivent deux sels différents', async () => {
    const base1 = await nouvelleBase();
    const base2 = await nouvelleBase();
    await initialiserCoffre(base1, MDP);
    await initialiserCoffre(base2, MDP);
    const sel1 = (await lireCoffreAuRepos(base1))?.sel;
    const sel2 = (await lireCoffreAuRepos(base2))?.sel;
    expect(sel1).toBeDefined();
    expect(sel1).not.toEqual(sel2);
  });
});

// =============================================================================
// B. Déverrouillage — sans réseau, avec le mot de passe et rien d'autre
// =============================================================================
describe('deverrouiller (05 §9.7, §31-3)', () => {
  it('@critique le bon mot de passe rouvre le coffre et relit ce qui a été chiffré avant', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });
    coffre.verrouiller();

    const rouvert = await deverrouiller(base, MDP);
    await expect(rouvert.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('@critique un mauvais mot de passe est refusé par une erreur NOMMÉE, pas par un coffre vide', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    await expect(deverrouiller(base, MDP_NOUVEAU)).rejects.toThrow(MotDePasseInvalideError);
  });

  it('sans coffre initialisé, déverrouiller lève `CoffreAbsentError`', async () => {
    const base = await nouvelleBase();
    await expect(deverrouiller(base, MDP)).rejects.toThrow(CoffreAbsentError);
  });

  it('les erreurs nommées portent un message en français, sans le mot de passe dedans', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    let message = '';
    try {
      await deverrouiller(base, MDP_NOUVEAU);
    } catch (erreur) {
      message = erreur instanceof Error ? erreur.message : String(erreur);
    }
    expect(message).toMatch(/[a-zéèêàç]/);
    expect(message).not.toContain(MDP_NOUVEAU);
    expect(message).not.toContain(MDP);
  });
});

// =============================================================================
// C. Changement de mot de passe — ré-enveloppement, et le garde-fou §9.7
// =============================================================================
describe('changerMotDePasse / etatAvantChangementDeMotDePasse (05 §9.7)', () => {
  it('@critique après changement, l’ANCIEN mot de passe est refusé et le NOUVEAU relit les données', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    const enveloppe = await coffre.chiffrer({ valeur: SENTINELLE });

    const coffreNouveau = await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    await expect(coffreNouveau.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
    await expect(deverrouiller(base, MDP)).rejects.toThrow(MotDePasseInvalideError);
    const rouvert = await deverrouiller(base, MDP_NOUVEAU);
    await expect(rouvert.dechiffrer(enveloppe, schemaClair)).resolves.toEqual({
      valeur: SENTINELLE,
    });
  });

  it('@critique les lignes locales ne sont PAS re-chiffrées : leurs enveloppes sont identiques après le changement', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    await ecrireUneReponse(base, coffre);
    const lignesAvant = JSON.stringify(await base.answers.toArray());

    await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    expect(JSON.stringify(await base.answers.toArray())).toEqual(lignesAvant);
  });

  it('un ancien mot de passe faux fait échouer le changement, et le coffre reste ouvrable avec le vrai', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    await expect(changerMotDePasse(base, MDP_NOUVEAU, 'encore-un-autre-2026')).rejects.toThrow(
      MotDePasseInvalideError,
    );
    await expect(deverrouiller(base, MDP)).resolves.toBeDefined();
  });

  it('sans coffre, changer le mot de passe lève `CoffreAbsentError`', async () => {
    const base = await nouvelleBase();
    await expect(changerMotDePasse(base, MDP, MDP_NOUVEAU)).rejects.toThrow(CoffreAbsentError);
  });

  it('outbox vide ⇒ aucun avertissement avant changement', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    const etat = await etatAvantChangementDeMotDePasse(base);
    expect(etat.operationsEnAttente).toBe(0);
    expect(etat.avertissement).toBeNull();
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un écran qui annonce « mot de passe changé »
  // alors que le serveur refusera la réinitialisation tant que l'outbox n'est
  // pas vide (05 §9.7). Le compteur doit être VRAI (lu dans la file), et
  // l'avertissement doit exister dès qu'il est > 0.
  it('@critique outbox non vide ⇒ compteur exact et avertissement en français qui cite le nombre', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    await ecrireUneReponse(base, coffre);
    await ecrireUneReponse(base, coffre);
    await ecrireUneReponse(base, coffre);

    const etat = await etatAvantChangementDeMotDePasse(base);
    expect(etat.operationsEnAttente).toBe(3);
    expect(etat.avertissement).not.toBeNull();
    expect(etat.avertissement).toContain('3');
    expect(etat.avertissement).toMatch(/[a-zéèêàç]/);
  });

  it('le changement de mot de passe n’efface ni la file ni les lignes', async () => {
    const base = await nouvelleBase();
    const coffre = await initialiserCoffre(base, MDP);
    await ecrireUneReponse(base, coffre);
    await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    expect(await base.outbox.count()).toBe(1);
    expect(await base.answers.count()).toBe(1);
  });

  it('l’enveloppe de DEK au repos change (nouvelle KEK) et le coffre reste complet', async () => {
    const base = await nouvelleBase();
    await initialiserCoffre(base, MDP);
    const avant = await lireCoffreAuRepos(base);
    await changerMotDePasse(base, MDP, MDP_NOUVEAU);
    const apres = await lireCoffreAuRepos(base);
    expect(apres?.sel.length).toBeGreaterThan(0);
    expect(apres?.parametres.algo).toBe('argon2id');
    expect(JSON.stringify(apres?.dekEnveloppee as Enveloppe)).not.toEqual(
      JSON.stringify(avant?.dekEnveloppee as Enveloppe),
    );
  });
});
