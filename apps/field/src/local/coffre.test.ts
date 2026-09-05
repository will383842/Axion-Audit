// =============================================================================
// TESTS DU COFFRE LOCAL (DEK/KEK) — lot L5, incrément L5a. ÉCRITS AVANT LE CODE.
//
// Écrits par A26 (testeur offline) depuis `docs/conception/LOT_L5.md` §2 et §4
// SEULS, sans lire une ligne de `coffre.ts` (09 §5.6 : le code de test n'est
// jamais écrit par l'agent qui écrit le code testé). À l'heure de leur livraison,
// `coffre.ts` n'existe pas : ces tests sont ROUGES, et c'est l'état attendu.
//
// ── CE QUE LE PACK EXIGE (05 §9.7, 11 §4) ────────────────────────────────────
// « une DEK AES-256 aléatoire par appareil chiffre les données ; la DEK est
// enveloppée par une KEK dérivée du mot de passe (Argon2id + sel local par
// appareil) et stockée enveloppée. Changement de mot de passe = simple
// ré-enveloppement de la DEK (les données ne sont JAMAIS re-chiffrées). La KEK
// n'est tenue qu'en mémoire de session. » Crypto : WebCrypto AES-GCM + hash-wasm.
//
// ── HYPOTHÈSES D'INTERFACE (posées ici, A24 posera les siennes sans me lire) ──
// Le §2 de la note engage : `deriverKek(mdp, sel): Promise<CryptoKey>`,
// `ouvrirCoffre(kek, dekEnveloppee): Promise<Coffre>`,
// `Coffre.dechiffrer<T>(e: Enveloppe, s: ZodType<T>): Promise<T>`,
// `reenvelopperDek`, `verrouiller(): void`. Il ne dit pas comment NAÎT un coffre
// ni comment on CHIFFRE. J'ajoute, et je les nomme pour qu'on les confronte :
//   · ALIGNÉ LE 2026-09-02 (arbitrage A01 : la note §2 gagne) sur les signatures
//     publiées : `creerDekEnveloppee(kek): Promise<Enveloppe>` puis
//     `ouvrirCoffre(kek, dekEnveloppee)` — le `creerCoffre` local ci-dessous
//     n'est que leur composition ;
//   · `Coffre.chiffrer(valeur): Promise<Enveloppe>` ;
//   · `reenvelopperDek(dekEnveloppee, kekActuelle, kekNouvelle): Promise<Enveloppe>` ;
//   · l'enveloppe de DEK est une `Enveloppe` ordinaire, clonable par structure
//     (stockables tels quels dans IndexedDB) — leurs octets sont des `Uint8Array`,
//     des `ArrayBuffer` ou des chaînes base64 : les tests sérialisent les trois.
//   · `sel` est un `Uint8Array` fourni par l'appelant (l'app le tire une fois
//     par appareil) — le coffre n'en tire JAMAIS un lui-même.
//
// Traçabilité : E33 (sécurité / RGPD — IndexedDB chiffré, 06 §10.5) ·
// E6 (hors ligne total — le déverrouillage ne dépend jamais du serveur, 05 §31-3).
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BORNES_KDF,
  PARAMETRES_KDF_DEFAUT,
  ParametresKdfHorsBornesError,
  creerDekEnveloppee,
  deriverKek,
  ouvrirCoffre,
  reenvelopperDek,
  travailKdf,
  verifierParametresKdf,
  type Coffre,
  type Enveloppe,
  type ParametresKdf,
} from './coffre.js';

/**
 * Un coffre NEUF : DEK fraîche enveloppée sous `kek`, coffre ouvert dessus.
 * Composé des deux fonctions publiées (`creerDekEnveloppee` + `ouvrirCoffre`) —
 * aucune fabrique inventée, conformément à l'arbitrage A01 du 2026-09-02.
 */
async function creerCoffre(kek: CryptoKey): Promise<{ coffre: Coffre; dekEnveloppee: Enveloppe }> {
  const dekEnveloppee = await creerDekEnveloppee(kek);
  const coffre = await ouvrirCoffre(kek, dekEnveloppee);
  return { coffre, dekEnveloppee };
}

// -----------------------------------------------------------------------------
// Outils — sérialisation profonde pour chercher un clair là où il ne doit pas être
// -----------------------------------------------------------------------------

/** Octets → hexadécimal : un texte en clair ne peut pas y survivre par accident. */
function octetsEnHex(octets: Uint8Array): string {
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

/**
 * Sérialise n'importe quelle structure (objets, tableaux, `Uint8Array`,
 * `ArrayBuffer`) en une chaîne dans laquelle chercher une sentinelle. Chaque
 * tampon d'octets est rendu DEUX fois : en hex (forme neutre, comparable) et
 * décodé en UTF-8 — c'est cette seconde forme qui démasque un « chiffrement »
 * qui aurait stocké le texte tel quel dans un `Uint8Array`.
 */
function serialiserProfond(valeur: unknown): string {
  const decodeur = new TextDecoder();
  return JSON.stringify(valeur, (_cle, v: unknown) => {
    if (v instanceof ArrayBuffer) {
      const vue = new Uint8Array(v);
      return { hex: octetsEnHex(vue), utf8: decodeur.decode(vue) };
    }
    if (ArrayBuffer.isView(v)) {
      const vue = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      return { hex: octetsEnHex(vue), utf8: decodeur.decode(vue) };
    }
    return v;
  });
}

/** Un sel de 16 octets, DÉTERMINISTE dans le test (jamais tiré au hasard ici). */
function selFixe(graine: number): Uint8Array {
  const sel = new Uint8Array(16);
  for (let i = 0; i < sel.length; i += 1) sel[i] = (graine * 31 + i * 7) % 256;
  return sel;
}

/** Sentinelles : fictives, uniques, impossibles à produire par hasard (invariant 2). */
const SENTINELLE_NOM = 'SENTINELLE_NOM_Q7V2ZP';
const SENTINELLE_NOTE = 'SENTINELLE_NOTE_M4K9XW';

const MDP = 'correct-cheval-pile-agrafe-2026';
const MDP_AUTRE = 'autre-cheval-pile-agrafe-2026';

const schemaReponse = z.object({
  personName: z.string(),
  note: z.string(),
  valeur: z.number(),
});
type Reponse = z.infer<typeof schemaReponse>;

const CLAIR: Reponse = { personName: SENTINELLE_NOM, note: SENTINELLE_NOTE, valeur: 3 };

// La dérivation Argon2id coûte (budget A28 : < 1 s sur tablette). On dérive une
// fois par (mdp, sel) et on partage : le test reste unitaire en temps.
let kekA: CryptoKey; // MDP + sel 1
let kekAbis: CryptoKey; // MDP + sel 1, dérivée une SECONDE fois, indépendamment
let kekSelAutre: CryptoKey; // MDP + sel 2
let kekMdpAutre: CryptoKey; // MDP_AUTRE + sel 1

beforeAll(async () => {
  [kekA, kekAbis, kekSelAutre, kekMdpAutre] = await Promise.all([
    deriverKek(MDP, selFixe(1)),
    deriverKek(MDP, selFixe(1)),
    deriverKek(MDP, selFixe(2)),
    deriverKek(MDP_AUTRE, selFixe(1)),
  ]);
}, 20_000);

// =============================================================================
// A. Dérivation Argon2id — déterministe, et sensible au sel ET au mot de passe
// =============================================================================
describe('coffre — dérivation de la KEK (05 §9.7)', () => {
  // Une `CryptoKey` ne se compare pas : la KEK doit rester non exportable pour
  // qu'un script injecté ne puisse pas la lire. Le déterminisme se prouve donc
  // FONCTIONNELLEMENT : ce que la première clé enveloppe, la seconde l'ouvre.
  //
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un `deriverKek` qui ignore `sel` et tire son
  // propre sel (`crypto.getRandomValues`) à chaque appel — le coffre s'ouvre
  // à la création, JAMAIS au redémarrage suivant. Toutes les données de mission
  // seraient perdues au premier verrouillage. C'est le bug le plus plausible et
  // le plus coûteux de ce fichier.
  it('@critique même mot de passe + même sel ⇒ la seconde dérivation ouvre ce que la première a enveloppé', async () => {
    const { coffre, dekEnveloppee } = await creerCoffre(kekA);
    const enveloppe = await coffre.chiffrer(CLAIR);

    const coffreRouvert = await ouvrirCoffre(kekAbis, dekEnveloppee);
    await expect(coffreRouvert.dechiffrer(enveloppe, schemaReponse)).resolves.toEqual(CLAIR);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une dérivation qui n'utilise que le mot de
  // passe (SHA-256(mdp), ou Argon2id avec un sel constant) — deux appareils du
  // même compte partageraient alors la même KEK, et un `.axionbackup` volé sur
  // l'un ouvrirait l'autre.
  it('@critique même mot de passe, sel DIFFÉRENT ⇒ la KEK ne peut pas ouvrir le coffre', async () => {
    const { dekEnveloppee } = await creerCoffre(kekA);
    await expect(ouvrirCoffre(kekSelAutre, dekEnveloppee)).rejects.toThrow();
  });

  it('@critique mot de passe DIFFÉRENT, même sel ⇒ la KEK ne peut pas ouvrir le coffre', async () => {
    const { dekEnveloppee } = await creerCoffre(kekA);
    await expect(ouvrirCoffre(kekMdpAutre, dekEnveloppee)).rejects.toThrow();
  });

  it('un sel vide est refusé — jamais une dérivation « sans sel » par défaut', async () => {
    await expect(deriverKek(MDP, new Uint8Array(0))).rejects.toThrow();
  });
});

// =============================================================================
// B. Aller-retour chiffrer / déchiffrer
// =============================================================================
describe('coffre — chiffrement des enregistrements (AES-GCM)', () => {
  let coffre: Coffre;

  beforeAll(async () => {
    ({ coffre } = await creerCoffre(kekA));
  });

  it('@critique un clair chiffré puis déchiffré revient identique, typé par son schéma', async () => {
    const enveloppe = await coffre.chiffrer(CLAIR);
    const relu = await coffre.dechiffrer(enveloppe, schemaReponse);
    expect(relu).toEqual(CLAIR);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : une « enveloppe » qui transporte le clair
  // (encodage base64 ou JSON pris pour un chiffrement, ou champ de débogage
  // `clair:` laissé dans l'objet). Le balayage cherche la sentinelle dans TOUTE
  // la structure, octets décodés compris.
  it('@critique l’enveloppe ne contient le clair sous aucune forme', async () => {
    const enveloppe = await coffre.chiffrer(CLAIR);
    const texte = serialiserProfond(enveloppe);
    expect(texte).not.toContain(SENTINELLE_NOM);
    expect(texte).not.toContain(SENTINELLE_NOTE);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un IV fixe (ou dérivé de la clé). Avec
  // AES-GCM, réutiliser un nonce sous la même clé révèle le XOR des clairs et
  // permet de forger des étiquettes : c'est la faute cryptographique qui
  // transforme « chiffré » en « pas chiffré » sans qu'aucun test d'aller-retour
  // ne le voie. Deux chiffrements du même clair DOIVENT différer.
  it('@critique deux chiffrements du même clair produisent deux enveloppes différentes (IV unique)', async () => {
    const e1 = await coffre.chiffrer(CLAIR);
    const e2 = await coffre.chiffrer(CLAIR);
    expect(serialiserProfond(e1)).not.toEqual(serialiserProfond(e2));
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un mode non authentifié (AES-CBC, AES-CTR)
  // ou une vérification d'étiquette omise. Une enveloppe altérée d'un octet
  // doit être REJETÉE, pas déchiffrée en une valeur corrompue puis validée
  // « par chance » par Zod.
  it('@critique une enveloppe altérée d’un octet est rejetée (authentification GCM)', async () => {
    const enveloppe = await coffre.chiffrer(CLAIR);
    const alteree = altererUnOctet(enveloppe);
    await expect(coffre.dechiffrer(alteree, schemaReponse)).rejects.toThrow();
  });

  it('une enveloppe chiffrée par un AUTRE coffre (autre DEK) est rejetée', async () => {
    const { coffre: autreCoffre } = await creerCoffre(kekA);
    const enveloppe = await autreCoffre.chiffrer(CLAIR);
    await expect(coffre.dechiffrer(enveloppe, schemaReponse)).rejects.toThrow();
  });

  it('le chiffrement accepte les structures imbriquées et les tableaux (charge d’un entretien)', async () => {
    const schema = z.object({
      participants: z.array(z.object({ nom: z.string(), role: z.string().nullable() })),
      generalNotes: z.string().nullable(),
    });
    const clair = {
      participants: [
        { nom: 'Participant A', role: null },
        { nom: 'Participant B', role: 'DSI' },
      ],
      generalNotes: null,
    };
    const enveloppe = await coffre.chiffrer(clair);
    await expect(coffre.dechiffrer(enveloppe, schema)).resolves.toEqual(clair);
  });
});

// =============================================================================
// C. `dechiffrer` VALIDE — un clair hors schéma ne sort jamais du coffre
// =============================================================================
describe('coffre — `dechiffrer` rejette un schéma Zod non conforme', () => {
  let coffre: Coffre;

  beforeAll(async () => {
    ({ coffre } = await creerCoffre(kekA));
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE : `JSON.parse(clair) as T` — le paramètre
  // `schema` accepté pour la forme et jamais appelé. Un enregistrement écrit par
  // une version antérieure de l'app, ou corrompu, remonterait alors typé
  // « Reponse » sans l'être, et casserait l'écran bien plus loin.
  it('@critique un clair valide pour un AUTRE schéma est rejeté par le schéma demandé', async () => {
    const enveloppe = await coffre.chiffrer({ nom: 'x', valeur: 'pas un nombre' });
    await expect(coffre.dechiffrer(enveloppe, schemaReponse)).rejects.toThrow();
  });

  it('le rejet Zod est distinct d’un échec cryptographique : l’enveloppe reste lisible avec le bon schéma', async () => {
    const schemaLarge = z.object({ nom: z.string(), valeur: z.string() });
    const clair = { nom: 'x', valeur: 'pas un nombre' };
    const enveloppe = await coffre.chiffrer(clair);
    await expect(coffre.dechiffrer(enveloppe, schemaReponse)).rejects.toThrow();
    await expect(coffre.dechiffrer(enveloppe, schemaLarge)).resolves.toEqual(clair);
  });

  it('le résultat est la valeur PARSÉE par Zod (transformations et valeurs par défaut appliquées)', async () => {
    const schemaAvecDefaut = z.object({ nom: z.string(), flagReview: z.boolean().default(false) });
    const enveloppe = await coffre.chiffrer({ nom: 'y' });
    await expect(coffre.dechiffrer(enveloppe, schemaAvecDefaut)).resolves.toEqual({
      nom: 'y',
      flagReview: false,
    });
  });
});

// =============================================================================
// D. `verrouiller()` efface la DEK — et n'efface RIEN d'autre
// =============================================================================
describe('coffre — verrouillage (05 §9.7 : la clé n’est tenue qu’en mémoire de session)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE (1) : `verrouiller` qui ne fait que masquer
  // l'écran (état d'UI) et laisse le coffre opérant — une tablette posée
  // « verrouillée » déchiffre encore pour quiconque ouvre la console.
  it('@critique après `verrouiller()`, déchiffrer échoue', async () => {
    const { coffre } = await creerCoffre(kekA);
    const enveloppe = await coffre.chiffrer(CLAIR);
    coffre.verrouiller();
    await expect(coffre.dechiffrer(enveloppe, schemaReponse)).rejects.toThrow();
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE (2) : un verrou qui bloque la lecture mais
  // laisse passer l'écriture — l'app continuerait à chiffrer avec une clé
  // censée avoir disparu, ou pire, écrirait EN CLAIR faute de clé.
  it('@critique après `verrouiller()`, chiffrer échoue aussi', async () => {
    const { coffre } = await creerCoffre(kekA);
    coffre.verrouiller();
    await expect(coffre.chiffrer(CLAIR)).rejects.toThrow();
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE (3) : un `verrouiller` qui « efface » en
  // détruisant l'ENVELOPPE de la DEK au lieu de la clé en mémoire. Le verrou
  // deviendrait une perte de données : plus rien ne rouvrirait le coffre. Le
  // verrou n'efface que la mémoire ; l'enveloppe, elle, rouvre tout.
  it('@critique la DEK enveloppée survit au verrou : rouvrir avec la KEK rend les données', async () => {
    const { coffre, dekEnveloppee } = await creerCoffre(kekA);
    const enveloppe = await coffre.chiffrer(CLAIR);
    const copieEnveloppeDek = serialiserProfond(dekEnveloppee);
    coffre.verrouiller();

    expect(serialiserProfond(dekEnveloppee)).toEqual(copieEnveloppeDek);
    const rouvert = await ouvrirCoffre(kekA, dekEnveloppee);
    await expect(rouvert.dechiffrer(enveloppe, schemaReponse)).resolves.toEqual(CLAIR);
  });

  // IMPLÉMENTATION FAUSSE ATTRAPÉE (4) : un drapeau `verrouille = true` posé
  // devant une DEK toujours présente. Le comportement observable est le même que
  // pour un effacement, sauf que la clé reste en mémoire — lisible dans un vidage
  // de tas, ou par un `verrouille = false` d'une extension malveillante. Ce test
  // inspecte les propriétés ÉNUMÉRABLES de l'objet : aucune `CryptoKey`, aucun
  // tampon de 32 octets ne doit y rester. Il ne voit pas un champ privé `#dek`
  // — limite assumée, dite ici plutôt que tue.
  it('@critique aucune clé ne reste dans les propriétés énumérables du coffre après `verrouiller()`', async () => {
    const { coffre } = await creerCoffre(kekA);
    coffre.verrouiller();
    const restes = collecterClesResiduelles(coffre);
    expect(restes).toEqual([]);
  });

  it('verrouiller deux fois est idempotent (pas d’exception au second appel)', async () => {
    const { coffre } = await creerCoffre(kekA);
    coffre.verrouiller();
    expect(() => {
      coffre.verrouiller();
    }).not.toThrow();
  });
});

// =============================================================================
// E. Ré-enveloppement (changement de mot de passe) — les données ne bougent pas
// =============================================================================
describe('coffre — `reenvelopperDek` conserve les données (05 §9.7)', () => {
  // IMPLÉMENTATION FAUSSE ATTRAPÉE : un « changement de mot de passe » qui
  // recrée un coffre neuf (nouvelle DEK) — toutes les enveloppes écrites avant
  // deviennent illisibles ; ou qui ré-enveloppe une DEK mal déchiffrée (mauvaise
  // KEK d'origine) sans le détecter.
  it('@critique les enveloppes écrites AVANT le ré-enveloppement se déchiffrent avec la nouvelle KEK', async () => {
    const { coffre, dekEnveloppee } = await creerCoffre(kekA);
    const e1 = await coffre.chiffrer(CLAIR);
    const e2 = await coffre.chiffrer({ ...CLAIR, valeur: 4 });

    const dekReEnveloppee = await reenvelopperDek(dekEnveloppee, kekA, kekMdpAutre);
    const coffreNouveauMdp = await ouvrirCoffre(kekMdpAutre, dekReEnveloppee);

    await expect(coffreNouveauMdp.dechiffrer(e1, schemaReponse)).resolves.toEqual(CLAIR);
    await expect(coffreNouveauMdp.dechiffrer(e2, schemaReponse)).resolves.toEqual({
      ...CLAIR,
      valeur: 4,
    });
  });

  it('@critique l’ANCIENNE KEK n’ouvre plus la nouvelle enveloppe', async () => {
    const { dekEnveloppee } = await creerCoffre(kekA);
    const dekReEnveloppee = await reenvelopperDek(dekEnveloppee, kekA, kekMdpAutre);
    await expect(ouvrirCoffre(kekA, dekReEnveloppee)).rejects.toThrow();
  });

  it('ré-envelopper avec une KEK d’origine fausse est refusé (jamais une DEK corrompue ré-enveloppée)', async () => {
    const { dekEnveloppee } = await creerCoffre(kekA);
    await expect(reenvelopperDek(dekEnveloppee, kekSelAutre, kekMdpAutre)).rejects.toThrow();
  });

  it('le ré-enveloppement ne modifie pas l’enveloppe d’origine (entrée immuable)', async () => {
    const { dekEnveloppee } = await creerCoffre(kekA);
    const avant = serialiserProfond(dekEnveloppee);
    await reenvelopperDek(dekEnveloppee, kekA, kekMdpAutre);
    expect(serialiserProfond(dekEnveloppee)).toEqual(avant);
  });

  it('une enveloppe de DEK est structurellement clonable (stockable dans IndexedDB / `meta`)', async () => {
    const { dekEnveloppee } = await creerCoffre(kekA);
    expect(() => structuredClone(dekEnveloppee)).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// Outils bas niveau — altération et inspection
// -----------------------------------------------------------------------------

/**
 * Renvoie une copie de l'enveloppe dont UN octet du premier tampon (ou de la
 * première chaîne base64) trouvé a été modifié. On ne connaît pas la forme
 * interne de `Enveloppe` : la fonction parcourt l'objet et altère le premier
 * champ « d'octets » rencontré — quel que soit son nom.
 */
function altererUnOctet(enveloppe: Enveloppe): Enveloppe {
  const copie = structuredClone(enveloppe) as unknown as Record<string, unknown>;

  /** Altère le premier champ d'octets rencontré ; rend `true` s'il l'a fait. */
  const visiter = (objet: Record<string, unknown>): boolean => {
    for (const cle of Object.keys(objet)) {
      const v = objet[cle];
      if (v instanceof ArrayBuffer) {
        const vue = new Uint8Array(v);
        const dernier = vue.length - 1;
        vue[dernier] = (vue[dernier] ?? 0) ^ 0x01;
        return true;
      }
      if (ArrayBuffer.isView(v)) {
        const vue = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        const dernier = vue.length - 1;
        vue[dernier] = (vue[dernier] ?? 0) ^ 0x01;
        return true;
      }
      if (typeof v === 'string' && v.length >= 24 && /^[A-Za-z0-9+/_-]+=*$/.test(v)) {
        // Chaîne base64/base64url : on altère un caractère du CORPS (jamais le
        // remplissage final) pour que le décodage reste valide mais différent.
        const position = Math.floor(v.length / 2);
        const car = v[position] === 'A' ? 'B' : 'A';
        objet[cle] = v.slice(0, position) + car + v.slice(position + 1);
        return true;
      }
      if (v !== null && typeof v === 'object' && visiter(v as Record<string, unknown>)) {
        return true;
      }
    }
    return false;
  };

  if (!visiter(copie)) {
    throw new Error(
      'Enveloppe sans tampon ni chaîne base64 : impossible d’altérer un octet — la forme d’`Enveloppe` doit être revue avec A24.',
    );
  }
  return copie as unknown as Enveloppe;
}

/**
 * Parcourt les propriétés énumérables (profondeur 3) d'un objet et rend la
 * liste des chemins qui contiennent encore une `CryptoKey` ou un tampon de
 * 32 octets — la taille exacte d'une DEK AES-256 brute.
 */
function collecterClesResiduelles(objet: unknown, chemin = 'coffre', profondeur = 0): string[] {
  if (profondeur > 3 || objet === null || typeof objet !== 'object') return [];
  const restes: string[] = [];
  for (const [cle, v] of Object.entries(objet as Record<string, unknown>)) {
    const ici = `${chemin}.${cle}`;
    if (v instanceof CryptoKey) restes.push(ici);
    else if (ArrayBuffer.isView(v) && v.byteLength === 32) restes.push(ici);
    else if (v instanceof ArrayBuffer && v.byteLength === 32) restes.push(ici);
    else restes.push(...collecterClesResiduelles(v, ici, profondeur + 1));
  }
  return restes;
}

// =============================================================================
// F. F-25 — LES BORNES HAUTES DES PARAMÈTRES DE DÉRIVATION
//
// Ajouté le 2026-09-05 par A26, depuis le verdict A51 du 2026-09-04 (F-25,
// MAJEUR). Les paramètres Argon2id voyagent AVEC le coffre — et c'est la bonne
// décision, un coffre créé hier doit s'ouvrir demain. Mais une valeur qui vient
// du stockage est une ENTRÉE NON FIABLE, et celle-ci commande une allocation
// mémoire : A51 a mesuré `{memoireKio: 4 000 000, iterations: 1 000 000}` accepté
// par le schéma, c'est-à-dire 4 Gio et un million de passes à CHAQUE tentative de
// déverrouillage. Les données sont intactes et l'auditeur n'y accède plus.
//
// Ce que ces tests fixent, et qui compte autant que le refus lui-même : le
// PLAFOND reste AMARRÉ au profil confirmé. Un plafond qui dérive de son profil
// devient un chiffre orphelin, et un chiffre orphelin finit par être relevé
// « parce qu'il gênait ».
//
// Traçabilité : E33 (sécurité / RGPD) ; 11 §4 (budget A28 : dérivation < 1 s sur
// iPad) ; 11 §7.
// =============================================================================
describe('coffre — bornes hautes des paramètres de dérivation (verdict A51, F-25)', () => {
  /** Le profil confirmé, modifié sur un SEUL axe — le reste est celui qui passe. */
  function profil(surcharges: Partial<ParametresKdf>): ParametresKdf {
    return { ...PARAMETRES_KDF_DEFAUT, ...surcharges };
  }

  it('@critique le profil confirmé (`PARAMETRES_KDF_DEFAUT`) passe les bornes', () => {
    // Anti-vacuité de tout ce qui suit : si le profil du produit ne passait pas,
    // les refus ci-dessous ne prouveraient rien d'autre qu'une garde trop serrée.
    expect(() => {
      verifierParametresKdf(PARAMETRES_KDF_DEFAUT);
    }).not.toThrow();
  });

  it('@critique le plafond de TRAVAIL reste amarré au profil : `travailKdf(défaut) × 4 === BORNES_KDF.travailMax`', () => {
    // C'est ce test, et lui seul, qui empêche `travailMax` de devenir un nombre
    // écrit à la main que plus personne ne rattache à rien. Le facteur 4 est celui
    // que le code motive (assez haut pour un durcissement humain raisonnable,
    // assez bas pour qu'aucune écriture d'un tiers ne coûte plus de quelques
    // centaines de millisecondes).
    expect(travailKdf(PARAMETRES_KDF_DEFAUT) * 4).toBe(BORNES_KDF.travailMax);
    expect(BORNES_KDF.memoireKioMax).toBe(PARAMETRES_KDF_DEFAUT.memoireKio * 4);
  });

  // Un axe à la fois : les compagnons restent à une valeur qui PASSE, pour que le
  // refus ne puisse venir que de l'axe visé.
  const HORS_BORNES: readonly {
    readonly axe: string;
    readonly parametres: ParametresKdf;
    readonly valeur: number;
    readonly plafond: number;
  }[] = [
    {
      axe: 'memoireKio',
      parametres: profil({ memoireKio: BORNES_KDF.memoireKioMax + 1, iterations: 1 }),
      valeur: BORNES_KDF.memoireKioMax + 1,
      plafond: BORNES_KDF.memoireKioMax,
    },
    {
      axe: 'iterations',
      parametres: profil({ memoireKio: 1, iterations: BORNES_KDF.iterationsMax + 1 }),
      valeur: BORNES_KDF.iterationsMax + 1,
      plafond: BORNES_KDF.iterationsMax,
    },
    {
      axe: 'parallelisme',
      parametres: profil({ memoireKio: 1, parallelisme: BORNES_KDF.parallelismeMax + 1 }),
      valeur: BORNES_KDF.parallelismeMax + 1,
      plafond: BORNES_KDF.parallelismeMax,
    },
    {
      axe: 'longueurOctets',
      parametres: profil({ memoireKio: 1, longueurOctets: BORNES_KDF.longueurOctetsMax + 1 }),
      valeur: BORNES_KDF.longueurOctetsMax + 1,
      plafond: BORNES_KDF.longueurOctetsMax,
    },
    {
      axe: 'travail total (m × t)',
      // Chaque valeur prise SÉPARÉMENT passe : m = le profil, t = 5 ≤ 8. C'est
      // leur produit qui déborde — la borne composée n'est pas redondante.
      parametres: profil({ iterations: 5 }),
      valeur: PARAMETRES_KDF_DEFAUT.memoireKio * 5,
      plafond: BORNES_KDF.travailMax,
    },
  ];

  for (const { axe, parametres, valeur, plafond } of HORS_BORNES) {
    it(`@critique « ${axe} » au-dessus de sa borne : ParametresKdfHorsBornesError citant la valeur et le plafond`, () => {
      let erreur: unknown = null;
      try {
        verifierParametresKdf(parametres);
      } catch (attrapee) {
        erreur = attrapee;
      }
      expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
      const message = erreur instanceof Error ? erreur.message : '';
      expect(message).toContain(String(valeur));
      expect(message).toContain(String(plafond));
      expect(message).toMatch(/[a-zéèêàç]/);
    });
  }

  it('@critique un durcissement HUMAIN raisonnable reste accepté : m = 47 104, t = 4 (sous le plafond, t > 1)', () => {
    // La borne existe contre une écriture hostile, pas contre 11 §8-4. Le profil
    // ci-dessous est exactement quatre fois le travail du profil confirmé : la
    // borne est INCLUSIVE, et un durcissement décidé par un humain n'oblige pas à
    // revenir modifier `BORNES_KDF`.
    const durci = profil({ iterations: 4 });
    expect(travailKdf(durci)).toBe(BORNES_KDF.travailMax);
    expect(() => {
      verifierParametresKdf(durci);
    }).not.toThrow();
  });

  it('@critique `deriverKek` refuse elle-même des paramètres hors bornes, indépendamment du stockage', async () => {
    // La seconde ceinture : quel que soit l'appelant — coffre au repos, changement
    // de mot de passe, futur `.axionbackup` —, aucun paramètre hors bornes
    // n'atteint Argon2id. Anti-vacuité par construction : si la garde ne mordait
    // pas, cet appel demanderait 4 Gio à `hash-wasm` et le worker mourrait ; ce
    // test ne peut pas passer au vert par inattention.
    await expect(
      deriverKek(MDP, selFixe(1), profil({ memoireKio: 4_000_000, iterations: 1_000_000 })),
    ).rejects.toThrow(ParametresKdfHorsBornesError);
  });

  it('`deriverKek` accepte toujours le profil confirmé — non-régression du chemin nominal', async () => {
    await expect(deriverKek(MDP, selFixe(3), PARAMETRES_KDF_DEFAUT)).resolves.toBeDefined();
  }, 20_000);
});
