// =============================================================================
// TESTS DES CHUNKS CÔTÉ TERRAIN — lot L6c-1 « les octets ». ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (09 §5.6 : jamais l'auteur du code testé) depuis 05 §9.6
// (chunks de 5 Mo, idempotents par id+index, `status` → la reprise n'envoie QUE
// les manquants, `complete {sha256}` → 409 + liste à réémettre), 05 §9.8
// scénario 7 (reprise d'un upload interrompu à 80 %) et `LOT_L6.md` §C.3.
//
// ── API ATTENDUE DE `apps/field/src/sync/chunks.ts` ─────────────────────────
//   export const TAILLE_MORCEAU_OCTETS = 5 * 1024 * 1024;
//   export const REEMISSIONS_MAX: number;          // borne des 409 successifs (≥ 1)
//   export function decouper(octets: Uint8Array, taille?: number): Uint8Array[];
//   export function sha256Hex(octets: Uint8Array): Promise<string>;   // WebCrypto
//   export interface TransportPieces {
//     statutPiece(id): Promise<ResultatTransport<{ statut: string; chunksRecus: readonly number[] }>>;
//     envoyerMorceau(id, index, octets: Uint8Array): Promise<ResultatTransport<unknown>>;
//     terminerPiece(id, corps: { sha256: string; chunks: number }):
//       Promise<ResultatTransport<{ statut: 'assemble' }> | { type: 'a_reemettre'; code; index: readonly number[] }>;
//   }
//   export interface BilanEnvoiPiece {
//     statut: 'envoyee' | 'hors_ligne' | 'reconnexion_requise' | 'en_echec';
//     message: string | null;   // en français quand statut ≠ 'envoyee'
//   }
//   export function envoyerPiece(transport, id, octets, options?: { tailleMorceau?: number })
//     : Promise<BilanEnvoiPiece>;
//   export function envoyerPiecesEnAttente(
//     deps: { base; coffre; transport: TransportPieces; tailleMorceau?: number }, missionId)
//     : Promise<{ envoyees: number; enEchec: number; restantes: number }>;
//       // lit les pièces « a_envoyer » de la mission (octets via `local/octets`),
//       // et écrit leur statut local après chaque envoi.
//
// Le transport est SIMULÉ (`fixtures/pieces.ts`) : aucun réseau réel.
// Rouge attendu tant que `chunks.ts` n'existe pas — pour cette seule raison.
// Traçabilité : E7 (remontée continue), E38 (sauvegarde terrain), invariant 1.
// =============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { uuidv7 } from 'uuidv7';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaseLocale } from '../local/base.js';
import { creerDekEnveloppee, deriverKek, ouvrirCoffre, type Coffre } from '../local/coffre.js';
import { installerContexteLocal } from '../local/contexte.js';
import { ecrirePieceAvecOctets, lireOctetsPiece, lireStatutEnvoi } from '../local/octets.js';
import {
  REEMISSIONS_MAX,
  TAILLE_MORCEAU_OCTETS,
  decouper,
  envoyerPiece,
  envoyerPiecesEnAttente,
  sha256Hex,
} from './chunks.js';
import {
  AUTRE_MISSION_PIECES,
  MISSION_PIECES,
  creerSiegePiecesFictif,
  demandePhoto,
  octetsVaries,
  sha256NodeHex,
} from './fixtures/pieces.js';

const MIO = 1024 * 1024;
/** Petite taille de morceau pour les scénarios : 10 morceaux sans allouer 50 Mio. */
const PETIT = 1024;

// =============================================================================
// A. Découpe et empreinte
// =============================================================================
describe('decouper — morceaux de 5 Mio (05 §9.6)', () => {
  it('@critique la taille de morceau est 5 × 1024 × 1024 octets', () => {
    expect(TAILLE_MORCEAU_OCTETS).toBe(5 * MIO);
  });

  it('@critique 12 Mio → trois morceaux de 5, 5 et 2 Mio, dans l’ordre', () => {
    const octets = octetsVaries(12 * MIO);
    const morceaux = decouper(octets);
    expect(morceaux.map((m) => m.byteLength)).toEqual([5 * MIO, 5 * MIO, 2 * MIO]);
    expect(morceaux[1]?.[0]).toBe(octets[5 * MIO]);
    expect(morceaux[2]?.[2 * MIO - 1]).toBe(octets[12 * MIO - 1]);
  });

  it('exactement 5 Mio → un seul morceau ; 5 Mio + 1 → deux', () => {
    expect(decouper(new Uint8Array(5 * MIO))).toHaveLength(1);
    expect(decouper(new Uint8Array(5 * MIO + 1)).map((m) => m.byteLength)).toEqual([5 * MIO, 1]);
  });

  it('une petite photo est un envoi d’un seul morceau (D4)', () => {
    expect(decouper(octetsVaries(300_000))).toHaveLength(1);
  });

  it('la concaténation des morceaux redonne exactement l’original', () => {
    const octets = octetsVaries(10 * PETIT + 17);
    const morceaux = decouper(octets, PETIT);
    expect(morceaux).toHaveLength(11);
    const recolle = new Uint8Array(octets.byteLength);
    let pos = 0;
    for (const m of morceaux) {
      recolle.set(m, pos);
      pos += m.byteLength;
    }
    expect(Array.from(recolle)).toEqual(Array.from(octets));
  });

  it('zéro octet → aucun morceau à émettre, sans boucle', () => {
    expect(decouper(new Uint8Array(0)).length).toBeLessThanOrEqual(1);
  });
});

describe('sha256Hex — empreinte du TOUT (WebCrypto)', () => {
  it('@critique égale à celle de node:crypto, en hexadécimal minuscule de 64 caractères', async () => {
    const octets = octetsVaries(70_000);
    const empreinte = await sha256Hex(octets);
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte).toBe(sha256NodeHex(octets));
  });

  it('vecteur connu : la chaîne vide', async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

// =============================================================================
// B. L'algorithme d'envoi : status → manquants → complete
// =============================================================================
describe('envoyerPiece — n’émet QUE les manquants, puis `complete`', () => {
  it('@critique pièce neuve : status, tous les morceaux dans l’ordre, puis complete', async () => {
    const siege = creerSiegePiecesFictif();
    const id = uuidv7();
    const octets = octetsVaries(5 * PETIT + 3);
    const bilan = await envoyerPiece(siege.transport, id, octets, { tailleMorceau: PETIT });
    expect(bilan.statut).toBe('envoyee');
    expect(siege.appels[0]?.route).toBe('status');
    expect(siege.indexEmis(id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(siege.appels.at(-1)?.route).toBe('complete');
    expect(Array.from(siege.assemble(id) ?? [])).toEqual(Array.from(octets));
  });

  it('@critique le serveur détient déjà 0, 2, 3 : seuls 1 et 4 partent', async () => {
    const siege = creerSiegePiecesFictif();
    const id = uuidv7();
    const octets = octetsVaries(5 * PETIT);
    const morceaux = decouper(octets, PETIT);
    for (const i of [0, 2, 3])
      await siege.transport.envoyerMorceau(id, i, morceaux[i] ?? new Uint8Array());
    siege.appels.length = 0;

    const bilan = await envoyerPiece(siege.transport, id, octets, { tailleMorceau: PETIT });
    expect(bilan.statut).toBe('envoyee');
    expect(siege.indexEmis(id)).toEqual([1, 4]);
  });

  it('`complete` porte le sha256 du TOUT et le nombre de morceaux', async () => {
    const appelsComplete: { sha256: string; chunks: number }[] = [];
    const siege = creerSiegePiecesFictif();
    const transport = {
      ...siege.transport,
      terminerPiece: (id: string, corps: { sha256: string; chunks: number }) => {
        appelsComplete.push(corps);
        return siege.transport.terminerPiece(id, corps);
      },
    };
    const octets = octetsVaries(3 * PETIT);
    await envoyerPiece(transport, uuidv7(), octets, { tailleMorceau: PETIT });
    expect(appelsComplete).toEqual([{ sha256: sha256NodeHex(octets), chunks: 3 }]);
  });

  it('une pièce déjà assemblée au siège (réponse perdue avant un kill) : aucun morceau ne repart', async () => {
    const siege = creerSiegePiecesFictif();
    const id = uuidv7();
    const octets = octetsVaries(4 * PETIT);
    await envoyerPiece(siege.transport, id, octets, { tailleMorceau: PETIT });
    siege.appels.length = 0;
    const bilan = await envoyerPiece(siege.transport, id, octets, { tailleMorceau: PETIT });
    expect(bilan.statut).toBe('envoyee');
    expect(siege.indexEmis(id)).toEqual([]);
  });
});

describe('envoyerPiece — 409 : réémettre EXACTEMENT la liste, borné', () => {
  it('@critique 409 avec [1, 3] : seuls 1 et 3 repartent, puis `complete` est rappelé', async () => {
    const siege = creerSiegePiecesFictif({ reemissionsForcees: { fois: 1, index: [1, 3] } });
    const id = uuidv7();
    const octets = octetsVaries(5 * PETIT);
    const bilan = await envoyerPiece(siege.transport, id, octets, { tailleMorceau: PETIT });
    expect(bilan.statut).toBe('envoyee');
    expect(siege.indexEmis(id)).toEqual([0, 1, 2, 3, 4, 1, 3]);
    expect(siege.appels.filter((a) => a.route === 'complete')).toHaveLength(2);
    expect(Array.from(siege.assemble(id) ?? [])).toEqual(Array.from(octets));
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `while (reponse.type === 'a_reemettre')`
  // sans compteur — un serveur qui perd toujours le même morceau fige la sync.
  it('@critique un serveur qui rend 409 sans fin : arrêt borné, statut « en_echec », message français', async () => {
    const siege = creerSiegePiecesFictif({ indexPerdusToujours: [2] });
    const id = uuidv7();
    const bilan = await envoyerPiece(siege.transport, id, octetsVaries(4 * PETIT), {
      tailleMorceau: PETIT,
    });
    expect(bilan.statut).toBe('en_echec');
    expect(bilan.message).toMatch(/[a-zéèà]/i);
    expect(REEMISSIONS_MAX).toBeGreaterThanOrEqual(1);
    const completes = siege.appels.filter((a) => a.route === 'complete').length;
    expect(completes).toBeLessThanOrEqual(REEMISSIONS_MAX + 1);
    expect(siege.indexEmis(id).filter((i) => i === 2).length).toBeLessThanOrEqual(
      REEMISSIONS_MAX + 1,
    );
  });

  it('un sha256 refusé (409 sur TOUS les index) : tout repart une fois, puis succès', async () => {
    const siege = creerSiegePiecesFictif({
      reemissionsForcees: { fois: 1, index: [0, 1, 2] },
    });
    const id = uuidv7();
    const bilan = await envoyerPiece(siege.transport, id, octetsVaries(3 * PETIT), {
      tailleMorceau: PETIT,
    });
    expect(bilan.statut).toBe('envoyee');
    expect(siege.indexEmis(id)).toEqual([0, 1, 2, 0, 1, 2]);
  });
});

// =============================================================================
// C. Scénario 7 (05 §9.8) : coupure à 80 %, reprise des seuls manquants
// =============================================================================
describe('scénario 7 — reprise d’un upload interrompu à 80 %', () => {
  it('@critique coupure après 8 morceaux sur 10 : la reprise n’émet QUE 8 et 9', async () => {
    const siege = creerSiegePiecesFictif({ coupureApresMorceaux: 8 });
    const id = uuidv7();
    const octets = octetsVaries(10 * PETIT);

    const premier = await envoyerPiece(siege.transport, id, octets, { tailleMorceau: PETIT });
    expect(premier.statut).toBe('hors_ligne');
    expect(siege.assemble(id)).toBeUndefined();

    siege.retablirReseau();
    siege.appels.length = 0;
    const reprise = await envoyerPiece(siege.transport, id, octets, { tailleMorceau: PETIT });
    expect(reprise.statut).toBe('envoyee');
    expect(siege.indexEmis(id)).toEqual([8, 9]);
    expect(Array.from(siege.assemble(id) ?? [])).toEqual(Array.from(octets));
  });

  it('hors ligne dès le `status` : aucun morceau, aucun `complete`', async () => {
    const siege = creerSiegePiecesFictif({ horsLigne: true });
    const id = uuidv7();
    const bilan = await envoyerPiece(siege.transport, id, octetsVaries(3 * PETIT), {
      tailleMorceau: PETIT,
    });
    expect(bilan.statut).toBe('hors_ligne');
    expect(siege.appels.map((a) => a.route)).toEqual(['status']);
  });

  it('réseau intermittent : trois coupures successives, chaque reprise avance, rien n’est réémis deux fois', async () => {
    const siege = creerSiegePiecesFictif();
    const id = uuidv7();
    const octets = octetsVaries(10 * PETIT);
    /** Le réseau laisse passer `budget` morceaux, puis tombe. */
    let budget = 0;
    const intermittent = {
      ...siege.transport,
      envoyerMorceau: (i: string, index: number, o: Uint8Array) => {
        if (budget <= 0) return Promise.resolve({ type: 'hors_ligne' as const });
        budget -= 1;
        return siege.transport.envoyerMorceau(i, index, o);
      },
    };
    for (const passe of [3, 3, 3]) {
      budget = passe;
      const bilan = await envoyerPiece(intermittent, id, octets, { tailleMorceau: PETIT });
      expect(bilan.statut).toBe('hors_ligne');
    }
    budget = 10;
    const fin = await envoyerPiece(intermittent, id, octets, { tailleMorceau: PETIT });
    expect(fin.statut).toBe('envoyee');
    // Les index ACCEPTÉS par le siège : chacun une seule fois, les dix au total.
    const acceptes = siege.indexEmis(id);
    expect(new Set(acceptes).size).toBe(acceptes.length);
    expect([...acceptes].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(siege.assemble(id) ?? [])).toEqual(Array.from(octets));
  });

  it('reconnexion requise pendant l’envoi : rendu tel quel, rien n’est marqué envoyé', async () => {
    const siege = creerSiegePiecesFictif();
    const bilan = await envoyerPiece(
      {
        ...siege.transport,
        envoyerMorceau: () =>
          Promise.resolve({
            type: 'reconnexion_requise' as const,
            message: 'Reconnexion requise pour synchroniser.',
          }),
      },
      uuidv7(),
      octetsVaries(2 * PETIT),
      { tailleMorceau: PETIT },
    );
    expect(bilan.statut).toBe('reconnexion_requise');
  });
});

// =============================================================================
// D. Les pièces en attente d'une mission, et leur statut local persistant
// =============================================================================
describe('envoyerPiecesEnAttente — statut local, persistant au redémarrage', () => {
  let coffre: Coffre;
  let kek: CryptoKey;
  let dek: Awaited<ReturnType<typeof creerDekEnveloppee>>;
  let nomBase: string;
  let base: BaseLocale;

  beforeAll(async () => {
    kek = await deriverKek('correct-cheval-pile-agrafe-2026', new Uint8Array(16).fill(67));
    dek = await creerDekEnveloppee(kek);
  }, 20_000);

  beforeEach(async () => {
    nomBase = `axion-test-chunks-${uuidv7()}`;
    base = new BaseLocale(nomBase);
    await base.open();
    coffre = await ouvrirCoffre(kek, dek);
    installerContexteLocal({ base, coffre });
  });

  afterEach(async () => {
    base.close();
    await Dexie.delete(nomBase);
  });

  async function photo(taille: number, missionId: string = MISSION_PIECES): Promise<string> {
    const id = uuidv7();
    const octets = octetsVaries(taille, taille);
    await ecrirePieceAvecOctets(demandePhoto(id, octets, { missionId }), octets);
    return id;
  }

  it('@critique succès : la pièce passe « envoyee », les octets locaux restent (invariant 7)', async () => {
    const siege = creerSiegePiecesFictif();
    const id = await photo(3 * PETIT);
    const bilan = await envoyerPiecesEnAttente(
      { base, coffre, transport: siege.transport, tailleMorceau: PETIT },
      MISSION_PIECES,
    );
    expect(bilan).toEqual({ envoyees: 1, enEchec: 0, restantes: 0 });
    expect(await lireStatutEnvoi(base, id)).toBe('envoyee');
    expect(await lireOctetsPiece(base, coffre, id)).not.toBeNull();
    expect(Array.from(siege.assemble(id) ?? [])).toEqual(
      Array.from((await lireOctetsPiece(base, coffre, id)) ?? []),
    );
  });

  it('@critique scénario 7 bout à bout : coupure à 80 %, REDÉMARRAGE, reprise des seuls manquants', async () => {
    const siege = creerSiegePiecesFictif({ coupureApresMorceaux: 8 });
    const id = await photo(10 * PETIT);
    const premier = await envoyerPiecesEnAttente(
      { base, coffre, transport: siege.transport, tailleMorceau: PETIT },
      MISSION_PIECES,
    );
    expect(premier.envoyees).toBe(0);
    expect(premier.restantes).toBe(1);
    expect(await lireStatutEnvoi(base, id)).toBe('a_envoyer');

    // Redémarrage : la base est fermée puis rouverte, le coffre rouvert.
    base.close();
    base = new BaseLocale(nomBase);
    await base.open();
    coffre = await ouvrirCoffre(kek, dek);
    installerContexteLocal({ base, coffre });
    expect(await lireStatutEnvoi(base, id)).toBe('a_envoyer');

    siege.retablirReseau();
    siege.appels.length = 0;
    const reprise = await envoyerPiecesEnAttente(
      { base, coffre, transport: siege.transport, tailleMorceau: PETIT },
      MISSION_PIECES,
    );
    expect(reprise.envoyees).toBe(1);
    expect(siege.indexEmis(id)).toEqual([8, 9]);
    expect(await lireStatutEnvoi(base, id)).toBe('envoyee');
  });

  it('@critique 409 sans fin : la pièce passe « en_echec », ses octets restent', async () => {
    const siege = creerSiegePiecesFictif({ indexPerdusToujours: [0] });
    const id = await photo(2 * PETIT);
    const bilan = await envoyerPiecesEnAttente(
      { base, coffre, transport: siege.transport, tailleMorceau: PETIT },
      MISSION_PIECES,
    );
    expect(bilan.enEchec).toBe(1);
    expect(await lireStatutEnvoi(base, id)).toBe('en_echec');
    expect(await lireOctetsPiece(base, coffre, id)).not.toBeNull();
  });

  // `DECISIONS.md` [L6c] (2026-10-09) : une pièce `en_echec` est retentée au
  // passage suivant — une fois par appel, jamais en boucle dans le même.
  it('@critique une pièce « en_echec » est reprise à l’appel suivant, une seule fois par appel', async () => {
    const id = await photo(2 * PETIT);
    const capricieux = creerSiegePiecesFictif({ indexPerdusToujours: [0] });
    const deps = { base, coffre, transport: capricieux.transport, tailleMorceau: PETIT };
    await envoyerPiecesEnAttente(deps, MISSION_PIECES);
    expect(await lireStatutEnvoi(base, id)).toBe('en_echec');

    capricieux.appels.length = 0;
    await envoyerPiecesEnAttente(deps, MISSION_PIECES);
    expect(capricieux.appels.filter((a) => a.route === 'status' && a.id === id)).toHaveLength(1);

    const sain = creerSiegePiecesFictif();
    const bilan = await envoyerPiecesEnAttente(
      { base, coffre, transport: sain.transport, tailleMorceau: PETIT },
      MISSION_PIECES,
    );
    expect(bilan.envoyees).toBe(1);
    expect(await lireStatutEnvoi(base, id)).toBe('envoyee');
  });

  it('une pièce déjà « envoyee » ne repart pas', async () => {
    const siege = creerSiegePiecesFictif();
    const id = await photo(PETIT);
    const deps = { base, coffre, transport: siege.transport, tailleMorceau: PETIT };
    await envoyerPiecesEnAttente(deps, MISSION_PIECES);
    siege.appels.length = 0;
    const bilan = await envoyerPiecesEnAttente(deps, MISSION_PIECES);
    expect(bilan.envoyees).toBe(0);
    expect(siege.appels.filter((a) => a.id === id)).toEqual([]);
  });

  it('les pièces d’une AUTRE mission ne partent pas', async () => {
    const siege = creerSiegePiecesFictif();
    const autre = await photo(PETIT, AUTRE_MISSION_PIECES);
    await envoyerPiecesEnAttente(
      { base, coffre, transport: siege.transport, tailleMorceau: PETIT },
      MISSION_PIECES,
    );
    expect(siege.appels.filter((a) => a.id === autre)).toEqual([]);
    expect(await lireStatutEnvoi(base, autre)).toBe('a_envoyer');
  });

  it('hors ligne : aucune pièce ne change de statut, rien n’est perdu', async () => {
    const siege = creerSiegePiecesFictif({ horsLigne: true });
    const ids = [await photo(PETIT), await photo(2 * PETIT)];
    const bilan = await envoyerPiecesEnAttente(
      { base, coffre, transport: siege.transport, tailleMorceau: PETIT },
      MISSION_PIECES,
    );
    expect(bilan).toEqual({ envoyees: 0, enEchec: 0, restantes: 2 });
    for (const id of ids) {
      expect(await lireStatutEnvoi(base, id)).toBe('a_envoyer');
      expect(await lireOctetsPiece(base, coffre, id)).not.toBeNull();
    }
  });
});
