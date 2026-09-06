// =============================================================================
// TESTS DE CONCEPTION A23 — le rattachement de l'appareil à son auditeur.
//
// ── STATUT DE CE FICHIER, ÉCRIT EN EN-TÊTE POUR QU'IL NE SE DÉGUISE PAS ─────
// Tests de CONCEPTION, écrits par A23 AVANT le module qu'ils décrivent, et non
// tests d'acceptation : ceux-là reviennent à un agent qui n'a pas écrit ce code
// (09 §5.6). Aucun n'est marqué `@critique` — un correctif ne se décerne pas à
// lui-même le sceau qui rend un test non skippable.
//
// ── CE QU'ILS TIENNENT ──────────────────────────────────────────────────────
// ① `connecterAuSiege` parle à `/api/v1/auth/login` (05 §8.1) et à rien d'autre,
//    avec le schéma d'entrée de `packages/shared` (11 §3) ;
// ② une réponse 2xx hors contrat est une ERREUR DE CONTRAT, jamais une donnée ;
// ③ un refus du siège est rendu en français, depuis l'enveloppe unique 11 §3 ;
// ④ **invariant 7** : un SECOND auditeur sur un appareil déjà rattaché est
//    REFUSÉ. Rien n'est écrasé en silence — surtout pas le propriétaire des
//    sessions déjà écrites, dont l'auteur est immuable (03 §34.4-4) ;
// ⑤ le profil vaut `guide_strict` : `login` ne rend pas `usage_profile`, et la
//    valeur par défaut du 03 §19.1 est la plus stricte. Aucune invention ;
// ⑥ l'identité est écrite AVANT le jeton : si le jeton échoue, la collecte
//    fonctionne et seule la synchronisation attend (05 §31-3).
//
// Traçabilité : E33 (sécurité / RGPD), E6 (hors ligne total), E23 (novice).
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@axion/shared';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { lireJetonRafraichissement } from '../local/jetons.js';
import { lireIdentiteAuditeur, memoriserIdentiteAuditeur } from '../session/auditeur.js';
import {
  AutreAuditeurSurCetAppareilError,
  CHEMIN_CONNEXION,
  IdentifiantsRefusesError,
  ReponseSiegeInattendueError,
  SiegeInjoignableError,
  connecterAuSiege,
  identiteConnue,
  rattacherAppareil,
} from './connexion.js';

const AUDITEUR_ID = '01922f4e-0000-7000-8000-00000000a23a';
const AUTRE_AUDITEUR_ID = '01922f4e-0000-7000-8000-00000000b54b';

let kek: CryptoKey;
let coffre: Coffre;
const bases: BaseLocale[] = [];
let compteur = 0;

async function nouvelleBase(): Promise<BaseLocale> {
  compteur += 1;
  const base = new BaseLocale(`axion-test-siege-${String(compteur)}`);
  await base.open();
  bases.push(base);
  return base;
}

/** Une réponse de `login` conforme au contrat `packages/shared`. */
function sessionServeur(userId = AUDITEUR_ID): AuthSession {
  return {
    accessToken: 'acces-factice',
    refreshToken: 'rafraichissement-factice',
    tokenType: 'Bearer',
    accessExpiresAt: '2026-09-06T09:15:00.000Z',
    refreshExpiresAt: '2026-10-06T09:00:00.000Z',
    userId,
  };
}

function reponse(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
}

beforeAll(async () => {
  kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(7));
  coffre = await ouvrirCoffre(kek, await creerDekEnveloppee(kek));
}, 20_000);

afterEach(async () => {
  for (const base of bases.splice(0)) {
    base.close();
    await Dexie.delete(base.name);
  }
});

describe('connecterAuSiege — 05 §8.1, conventions 11 §3', () => {
  it('appelle POST /api/v1/auth/login sur la même origine, corps validé par le contrat partagé', async () => {
    const faux = vi.fn(() => Promise.resolve(reponse(sessionServeur())));
    const session = await connecterAuSiege({
      fetch: faux,
      courriel: '  Auditeur@Exemple.fr ',
      motDePasse: 'un-mot-de-passe-assez-long',
    });

    expect(session.userId).toBe(AUDITEUR_ID);
    const [url, init] = faux.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CHEMIN_CONNEXION);
    expect(url.startsWith('/api/v1/')).toBe(true);
    expect(init.method).toBe('POST');
    // Normalisation du contrat partagé : on rogne les espaces, jamais la casse.
    const corpsEnvoye = typeof init.body === 'string' ? init.body : '';
    expect(JSON.parse(corpsEnvoye)).toEqual({
      email: 'Auditeur@Exemple.fr',
      password: 'un-mot-de-passe-assez-long',
    });
  });

  it('un réseau absent lève SiegeInjoignableError, sans rien écrire', async () => {
    const faux = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(
      connecterAuSiege({
        fetch: faux,
        courriel: 'auditeur@exemple.fr',
        motDePasse: 'un-mot-de-passe-assez-long',
      }),
    ).rejects.toBeInstanceOf(SiegeInjoignableError);
  });

  it('un refus du siège est rendu avec le message français de l’enveloppe 11 §3', async () => {
    const faux = vi.fn(() =>
      Promise.resolve(
        reponse(
          { error: { code: 'INVALID_CREDENTIALS', message: 'Adresse ou mot de passe incorrect.' } },
          401,
        ),
      ),
    );
    const demande = {
      fetch: faux,
      courriel: 'auditeur@exemple.fr',
      motDePasse: 'un-mot-de-passe-assez-long',
    };
    await expect(connecterAuSiege(demande)).rejects.toThrow(/Adresse ou mot de passe incorrect/);
    await expect(connecterAuSiege(demande)).rejects.toBeInstanceOf(IdentifiantsRefusesError);
  });

  it('une réponse 2xx hors contrat est une erreur de contrat, jamais une identité', async () => {
    const faux = vi.fn(() => Promise.resolve(reponse({ userId: 'pas-un-uuid' })));
    await expect(
      connecterAuSiege({
        fetch: faux,
        courriel: 'auditeur@exemple.fr',
        motDePasse: 'un-mot-de-passe-assez-long',
      }),
    ).rejects.toBeInstanceOf(ReponseSiegeInattendueError);
  });
});

describe('rattacherAppareil — l’identité que la collecte attendait', () => {
  it('range l’identité et le jeton, chiffrés, et le profil est le plus strict (03 §19.1)', async () => {
    const base = await nouvelleBase();
    expect(await identiteConnue(base, coffre)).toBe(false);

    const identite = await rattacherAppareil(base, coffre, sessionServeur());

    expect(identite).toEqual({ id: AUDITEUR_ID, profil: 'guide_strict' });
    expect(await lireIdentiteAuditeur(base, coffre)).toEqual(identite);
    expect(await identiteConnue(base, coffre)).toBe(true);

    const jeton = await lireJetonRafraichissement(base, coffre);
    expect(jeton?.valeur).toBe('rafraichissement-factice');
    expect(jeton?.expireLe).toBe('2026-10-06T09:00:00.000Z');
  });

  it('INVARIANT 7 — un autre auditeur sur un appareil déjà rattaché est REFUSÉ', async () => {
    const base = await nouvelleBase();
    await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'expert' });

    await expect(
      rattacherAppareil(base, coffre, sessionServeur(AUTRE_AUDITEUR_ID)),
    ).rejects.toBeInstanceOf(AutreAuditeurSurCetAppareilError);

    // Rien n'a bougé : ni l'identité, ni le profil déjà connu.
    expect(await lireIdentiteAuditeur(base, coffre)).toEqual({
      id: AUDITEUR_ID,
      profil: 'expert',
    });
    expect(await lireJetonRafraichissement(base, coffre)).toBeNull();
  });

  it('le MÊME auditeur qui se reconnecte est idempotent, et son profil connu est conservé', async () => {
    const base = await nouvelleBase();
    await memoriserIdentiteAuditeur(base, coffre, { id: AUDITEUR_ID, profil: 'expert' });

    const identite = await rattacherAppareil(base, coffre, sessionServeur());

    expect(identite).toEqual({ id: AUDITEUR_ID, profil: 'expert' });
    expect((await lireJetonRafraichissement(base, coffre))?.valeur).toBe(
      'rafraichissement-factice',
    );
  });
});
