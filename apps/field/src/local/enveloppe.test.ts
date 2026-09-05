// =============================================================================
// TESTS DE LA FORME D'ENVELOPPE, DES FORMES LOCALES ET DU CONTEXTE — lot L5 / L5a.
//
// Écrits par A26 contre les signatures exportées de `enveloppe.ts`
// (`estEnveloppe`, `versBase64`, `depuisBase64`, `enveloppeSchema`,
// `VERSION_ENVELOPPE`, `LONGUEUR_NONCE_OCTETS`), `formes.ts` (`drapeau`,
// `jetonsDeRecherche`, `ligneStockeeSchema`, `SCHEMA_CHARGE`) et `contexte.ts`
// (`installerContexteLocal`, `retirerContexteLocal`, `contexteLocal`,
// `contexteLocalInstalle`, `ContexteLocalIndisponibleError`).
//
// Traçabilité : E33 (sécurité / RGPD — la forme d'enveloppe est ce qui rend
// un chiffrement vérifiable au repos) · E6 (hors ligne total — recherche §25.4
// hors ligne sur les jetons du texte figé).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre } from './coffre.js';
import {
  ContexteLocalIndisponibleError,
  contexteLocal,
  contexteLocalInstalle,
  installerContexteLocal,
  retirerContexteLocal,
} from './contexte.js';
import {
  LONGUEUR_NONCE_OCTETS,
  VERSION_ENVELOPPE,
  depuisBase64,
  enveloppeSchema,
  estEnveloppe,
  versBase64,
} from './enveloppe.js';
import { SCHEMA_CHARGE, drapeau, jetonsDeRecherche, ligneStockeeSchema } from './formes.js';
import { BaseLocale } from './base.js';
import { ecrireLocal } from './ecriture.js';

describe('enveloppe — base64 et forme', () => {
  it('versBase64 / depuisBase64 : aller-retour exact sur des octets arbitraires', () => {
    const octets = new Uint8Array(64);
    for (let i = 0; i < octets.length; i += 1) octets[i] = (i * 37 + 11) % 256;
    const texte = versBase64(octets);
    expect(texte).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Array.from(depuisBase64(texte))).toEqual(Array.from(octets));
  });

  it('un tampon vide s’encode en chaîne vide — et une chaîne vide est REFUSÉE au décodage (un fragment chiffré vide n’existe pas)', () => {
    expect(versBase64(new Uint8Array(0))).toBe('');
    expect(() => depuisBase64('')).toThrow();
  });

  it('une chaîne qui n’est pas du base64 est refusée (jamais décodée en silence)', () => {
    expect(() => depuisBase64('§§ pas du base64 ¤¤')).toThrow();
  });

  it('@critique une enveloppe produite par le coffre satisfait `enveloppeSchema` et `estEnveloppe`', async () => {
    const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(9));
    const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
    const enveloppe = await coffre.chiffrer({ x: 1 });
    expect(estEnveloppe(enveloppe)).toBe(true);
    const lue = enveloppeSchema.parse(enveloppe);
    expect(lue.v).toBe(VERSION_ENVELOPPE);
    expect(depuisBase64(lue.n).length).toBe(LONGUEUR_NONCE_OCTETS);
  }, 20_000);

  it('estEnveloppe refuse null, une chaîne et un objet incomplet ; accepte la forme {v, n, c}', () => {
    expect(estEnveloppe(null)).toBe(false);
    expect(estEnveloppe('AAAA')).toBe(false);
    expect(estEnveloppe({ v: VERSION_ENVELOPPE, n: 'AAAA' })).toBe(false);
    expect(estEnveloppe({ v: VERSION_ENVELOPPE, n: 'AAAA', c: 'AAAA' })).toBe(true);
  });
});

describe('formes — drapeaux et jetons de recherche (03 §25.4)', () => {
  it('drapeau() projette un booléen sur 0|1 — IndexedDB n’indexe pas les booléens', () => {
    expect(drapeau(true)).toBe(1);
    expect(drapeau(false)).toBe(0);
  });

  it('jetonsDeRecherche : minuscules, sans accents, sans doublons, sans vides', () => {
    const jetons = jetonsDeRecherche('  Écran PARTAGÉ — écran, partagé ; Données ');
    expect(jetons).toContain('ecran');
    expect(jetons).toContain('partage');
    expect(jetons).toContain('donnees');
    expect(new Set(jetons).size).toBe(jetons.length);
    expect(jetons.every((j) => j === j.toLowerCase() && j.length > 0)).toBe(true);
    expect(jetons.every((j) => /^[a-z0-9]+$/.test(j))).toBe(true);
  });

  it('jetonsDeRecherche sur une chaîne vide ou sans lettre rend un tableau vide', () => {
    expect(jetonsDeRecherche('')).toEqual([]);
    expect(jetonsDeRecherche(' — ; , ')).toEqual([]);
  });

  it('SCHEMA_CHARGE couvre les sept tables miroirs de données (05 §9.1)', () => {
    expect(Object.keys(SCHEMA_CHARGE).sort()).toEqual(
      [
        'answers',
        'attachments',
        'interviews',
        'missionQuestions',
        'missions',
        'orgUnits',
        'workAssignments',
      ].sort(),
    );
  });

  it('ligneStockeeSchema refuse une ligne sans charge ou à charge en clair, et accepte une ligne écrite par le port', async () => {
    expect(ligneStockeeSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(ligneStockeeSchema.safeParse({ id: 'x', charge: 'clair' }).success).toBe(false);

    const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(9));
    const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
    const base = new BaseLocale('axion-test-formes-ligne');
    await base.open();
    installerContexteLocal({ base, coffre });
    try {
      await ecrireLocal({
        entite: 'attachment_meta',
        id: '0191e2a0-0000-7000-8000-00000000d0ff',
        missionId: '0191e2a0-0000-7000-8000-00000000f1de',
        action: 'upsert',
        index: { interviewId: null, answerId: null, kind: 'note' },
        charge: {
          content: 'note fictive',
          filename: null,
          mime: null,
          sizeBytes: null,
          storageKey: null,
          purgeAfter: null,
          createdBy: '0191e2a0-0000-7000-8000-00000000e001',
          clientCreatedAt: '2026-09-02T08:00:00.000Z',
        },
      });
      const ligne = await base.attachments.get('0191e2a0-0000-7000-8000-00000000d0ff');
      expect(ligneStockeeSchema.safeParse(ligne).success).toBe(true);
    } finally {
      retirerContexteLocal();
      base.close();
      await Dexie.delete('axion-test-formes-ligne');
    }
  }, 20_000);
});

describe('contexte — installer / retirer / lire', () => {
  it('sans contexte installé, `contexteLocal()` lève une erreur nommée en français', () => {
    retirerContexteLocal();
    expect(contexteLocalInstalle()).toBe(false);
    expect(() => contexteLocal()).toThrow(ContexteLocalIndisponibleError);
    let message = '';
    try {
      contexteLocal();
    } catch (erreur) {
      message = erreur instanceof Error ? erreur.message : '';
    }
    expect(message).toMatch(/[a-zéèêàç]/);
  });

  it('installé, il se lit ; retiré, il ne se lit plus', async () => {
    const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(9));
    const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
    const base = new BaseLocale('axion-test-contexte');
    installerContexteLocal({ base, coffre });
    expect(contexteLocalInstalle()).toBe(true);
    expect(contexteLocal().base).toBe(base);
    expect(contexteLocal().coffre).toBe(coffre);
    retirerContexteLocal();
    expect(contexteLocalInstalle()).toBe(false);
    expect(() => contexteLocal()).toThrow(ContexteLocalIndisponibleError);
  }, 20_000);

  // Constaté à la première rencontre tests × code (rapport A26 du 2026-09-02) :
  // retirer le contexte VERROUILLE le coffre qu'il tenait. C'est le corollaire
  // de 05 §9.7 (« la KEK n'est tenue qu'en mémoire de session ») — on le fixe
  // ici pour qu'un refactor ne le perde pas en silence.
  it('@critique retirer le contexte verrouille le coffre : plus aucun chiffrement possible ensuite', async () => {
    const kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(9));
    const coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
    const base = new BaseLocale('axion-test-contexte-2');
    installerContexteLocal({ base, coffre });
    retirerContexteLocal();
    await expect(coffre.chiffrer({ x: 1 })).rejects.toThrow();
  }, 20_000);

  it('retirer sans rien d’installé est sans effet (idempotent)', () => {
    retirerContexteLocal();
    expect(() => {
      retirerContexteLocal();
    }).not.toThrow();
  });
});
