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
  DonneeLocaleCorrompueError,
  MotDePasseInvalideError,
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
import {
  ErreurEnveloppe,
  LONGUEUR_NONCE_OCTETS,
  VERSION_ENVELOPPE,
  depuisBase64,
  versBase64,
} from './enveloppe.js';

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
  //
  // LE COMPAGNON MÉMOIRE A CHANGÉ LE 2026-09-05, ET C'EST UNE CORRECTION DE CE
  // FICHIER, PAS DU CODE. Il valait `memoireKio: 1` — choisi pour garder le
  // travail sous son plafond et n'accuser que l'axe visé. Depuis que les bornes
  // portent un PLANCHER de mémoire (revue A29, R1), `1` déclenche un second écart
  // et la phrase ci-dessus était devenue fausse : les cas passaient encore, mais
  // ils n'isolaient plus rien. `memoireKioMinParVoie` est le plus petit
  // compagnon qui PASSE, et il suit la borne si elle bouge — un compagnon écrit
  // en dur redeviendrait faux au prochain changement. C'est exactement le défaut
  // qu'A29 a relevé trois fois dans le code : une glose qui dit un peu plus que
  // ce qu'elle décrit.
  const COMPAGNON_MEMOIRE = BORNES_KDF.memoireKioMinParVoie;

  const HORS_BORNES: readonly {
    readonly axe: string;
    readonly parametres: ParametresKdf;
    readonly valeur: number;
    readonly plafond: number;
    /** Combien d'écarts ce jeu doit produire — l'isolation, VÉRIFIÉE et non promise. */
    readonly ecarts: number;
  }[] = [
    {
      axe: 'memoireKio',
      parametres: profil({ memoireKio: BORNES_KDF.memoireKioMax + 1, iterations: 1 }),
      valeur: BORNES_KDF.memoireKioMax + 1,
      plafond: BORNES_KDF.memoireKioMax,
      // DEUX, et c'est structurel, pas un défaut de jeu d'essai : `memoireKioMax`
      // et `travailMax` valent le même nombre quand `t = 1` (les deux sont
      // « quatre fois le profil », dont les passes valent 1). Dépasser la mémoire
      // d'une unité dépasse donc le travail de la même unité, et `t` ne peut pas
      // descendre plus bas — `iterationsMin` vaut 1. Le dire ici plutôt que de
      // forcer l'isolation à coups de valeurs bricolées.
      ecarts: 2,
    },
    {
      axe: 'iterations',
      parametres: profil({
        memoireKio: COMPAGNON_MEMOIRE,
        iterations: BORNES_KDF.iterationsMax + 1,
      }),
      valeur: BORNES_KDF.iterationsMax + 1,
      plafond: BORNES_KDF.iterationsMax,
      ecarts: 1,
    },
    {
      axe: 'parallelisme',
      // Le plancher de mémoire SUIT le parallélisme (`m ≥ 8 × p`) : le compagnon
      // doit donc suivre lui aussi, sans quoi ce cas accuserait deux axes.
      parametres: profil({
        memoireKio: COMPAGNON_MEMOIRE * (BORNES_KDF.parallelismeMax + 1),
        parallelisme: BORNES_KDF.parallelismeMax + 1,
      }),
      valeur: BORNES_KDF.parallelismeMax + 1,
      plafond: BORNES_KDF.parallelismeMax,
      ecarts: 1,
    },
    {
      axe: 'longueurOctets',
      parametres: profil({
        memoireKio: COMPAGNON_MEMOIRE,
        longueurOctets: BORNES_KDF.longueurOctetsMax + 1,
      }),
      valeur: BORNES_KDF.longueurOctetsMax + 1,
      plafond: BORNES_KDF.longueurOctetsMax,
      ecarts: 1,
    },
    {
      axe: 'travail total (m × t)',
      // Chaque valeur prise SÉPARÉMENT passe : m = le profil, t = 5 ≤ 8. C'est
      // leur produit qui déborde — la borne composée n'est pas redondante.
      parametres: profil({ iterations: 5 }),
      valeur: PARAMETRES_KDF_DEFAUT.memoireKio * 5,
      plafond: BORNES_KDF.travailMax,
      ecarts: 1,
    },
  ];

  for (const { axe, parametres, valeur, plafond, ecarts } of HORS_BORNES) {
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
      // L'ISOLATION EST VÉRIFIÉE, PAS PROMISE (ajout A26 du 2026-09-05). Un jeu
      // d'essai censé n'accuser qu'un axe et qui en accuse deux passerait tous
      // les contrôles ci-dessus sans rien prouver de l'axe visé — c'est ce qui
      // était arrivé au compagnon `memoireKio: 1` quand le plancher est apparu.
      expect(message.split(' ; ')).toHaveLength(ecarts);
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

// =============================================================================
// G. R1 — LA CLASSE ENTIÈRE DE F-25 : CE QUE LES BORNES DOIVENT ENCORE REFUSER
//
// Ajouté le 2026-09-05 par A26, depuis la revue croisée A29 du même jour (R1,
// MAJEUR) et le correctif d'A24 qui la ferme. Je n'ai écrit aucune ligne du code
// éprouvé ici (09 §5.6).
//
// ── CE QU'A29 A MESURÉ, ET POURQUOI C'EST LA MÊME PANNE QUE F-25 ─────────────
// La première version des bornes ne bornait que par le HAUT, et seulement le
// budget. QUATRE jeux de paramètres passaient la vérification et tuaient le
// déverrouillage un cran plus bas, sur un message technique ANGLAIS, sans action
// et sur un appareil définitivement fermé :
//   longueurOctets 48 · longueurOctets 64 (la borne haute EXACTE de l'époque) ·
//   longueurOctets 1 · memoireKio 7.
// Une écriture dans IndexedDB, sans mot de passe, sans franchir le verrou : c'est
// le modèle de menace de F-25 mot pour mot. Ces quatre-là sont ici EN
// NON-RÉGRESSION — ils ne doivent plus jamais repasser.
//
// ── ET CE QUE LA MESURE SEULE NE DONNAIT PAS ────────────────────────────────
// A29 a mesuré ce qu'elle a essayé. `longueurOctets` 16 et 24 sont acceptés par
// AES (ce sont AES-128 et AES-192) et n'auraient donc produit AUCUNE erreur
// technique : ils auraient dégradé EN SILENCE le chiffrement local d'un appareil,
// sur la foi d'une ligne écrite dans `meta`. Ils sont éprouvés ici parce qu'une
// borne qui refuse ce qui plante et laisse passer ce qui affaiblit protège
// l'écran, pas les données.
//
// Traçabilité : E33 (sécurité / RGPD) ; 11 §4 ; 03 §17.6 ; invariants 5 et 7.
// =============================================================================

/** Le profil confirmé, modifié sur les seuls axes cités. */
function profilKdf(surcharges: Partial<ParametresKdf>): ParametresKdf {
  return { ...PARAMETRES_KDF_DEFAUT, ...surcharges };
}

/**
 * Les fragments ANGLAIS qu'A29 a vus atteindre l'écran. Aucun message de refus ne
 * doit les contenir : le refus doit arriver AVANT eux, et en français.
 */
const FRAGMENTS_TECHNIQUES_ANGLAIS = [
  'DataError',
  'Invalid key length',
  'Hash length',
  'Memory size',
  'should be',
  'at least',
];

/** Ce que `verifierParametresKdf` a refusé — ou `null` si elle a laissé passer. */
function refusDe(parametres: ParametresKdf): Error | null {
  try {
    verifierParametresKdf(parametres);
    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur : new Error(String(erreur));
  }
}

describe('coffre — R1 : les quatre jeux mesurés par A29 sont refusés EN FRANÇAIS (non-régression)', () => {
  const JEUX_A29: readonly { readonly nom: string; readonly parametres: ParametresKdf }[] = [
    {
      nom: 'longueurOctets = 48 — « DataError: Invalid key length »',
      parametres: profilKdf({ longueurOctets: 48 }),
    },
    {
      nom: 'longueurOctets = 64 — l’ancienne borne haute EXACTE',
      parametres: profilKdf({ longueurOctets: 64 }),
    },
    {
      nom: 'longueurOctets = 1 — « Hash length should be at least 4 bytes »',
      parametres: profilKdf({ longueurOctets: 1 }),
    },
    {
      nom: 'memoireKio = 7 — « Memory size should be at least 8 * parallelism »',
      parametres: profilKdf({ memoireKio: 7 }),
    },
  ];

  for (const { nom, parametres } of JEUX_A29) {
    it(`@critique ${nom} : refusé par les bornes, en français, sans aucune chaîne technique anglaise`, () => {
      const erreur = refusDe(parametres);
      expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
      const message = erreur?.message ?? '';
      expect(message).toMatch(/[éèêàçù]/);
      for (const fragment of FRAGMENTS_TECHNIQUES_ANGLAIS) {
        expect(message).not.toContain(fragment);
      }
    });
  }

  it('@critique les quatre jeux sont refusés par `deriverKek` AUSSI — la seconde ceinture ne dépend pas du stockage', async () => {
    // Anti-vacuité : le profil confirmé, lui, dérive bel et bien. Sans ce
    // contrôle, une `deriverKek` cassée rendrait les quatre refus ci-dessous
    // triviaux — elle refuserait tout, y compris ce qui doit passer.
    await expect(deriverKek(MDP, selFixe(1), PARAMETRES_KDF_DEFAUT)).resolves.toBeDefined();
    for (const { parametres } of JEUX_A29) {
      await expect(deriverKek(MDP, selFixe(1), parametres)).rejects.toThrow(
        ParametresKdfHorsBornesError,
      );
    }
  }, 20_000);
});

describe('coffre — R1 : `longueurOctets` est un point, pas une plage (la DEK est AES-256)', () => {
  // 16 et 24 sont des longueurs de clé AES PARFAITEMENT VALIDES : rien ne
  // planterait, et c'est exactement le danger. Une ligne écrite dans `meta`
  // ferait dériver une KEK AES-128 pour envelopper une DEK AES-256, en silence,
  // et aucune sonde qui cherche un message d'erreur ne l'aurait vu.
  for (const longueur of [16, 24]) {
    it(`@critique longueurOctets = ${String(longueur)}, accepté par AES, est refusé quand même`, () => {
      const erreur = refusDe(profilKdf({ longueurOctets: longueur }));
      expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
      expect(erreur?.message).toContain(String(longueur));
      expect(erreur?.message).toContain(String(BORNES_KDF.longueurOctetsMin));
    });
  }

  it('@critique 32 — et 32 seulement — est accepté : plancher et plafond sont ÉGAUX', () => {
    // Anti-vacuité de la paire ci-dessus, et fixation de la doctrine : si un jour
    // quelqu'un rouvre la plage « pour être tolérant », ce test rougit.
    expect(BORNES_KDF.longueurOctetsMin).toBe(32);
    expect(BORNES_KDF.longueurOctetsMax).toBe(32);
    expect(refusDe(profilKdf({ longueurOctets: 32 }))).toBeNull();
    expect(refusDe(profilKdf({ longueurOctets: 33 }))).toBeInstanceOf(ParametresKdfHorsBornesError);
    expect(refusDe(profilKdf({ longueurOctets: 31 }))).toBeInstanceOf(ParametresKdfHorsBornesError);
  });
});

describe('coffre — R1 : le plancher de mémoire est un COEFFICIENT (`m ≥ 8 × p`), pas un nombre', () => {
  // La contrainte est celle d'Argon2id lui-même. Écrite en dur à 8, elle serait
  // fausse dès `p = 2` — et l'erreur anglaise « Memory size should be at least
  // 8 * parallelism » repasserait, sur le seul axe qu'A29 avait mesuré.
  const CAS: readonly { readonly m: number; readonly p: number; readonly accepte: boolean }[] = [
    { m: 7, p: 1, accepte: false },
    { m: 8, p: 1, accepte: true },
    { m: 15, p: 2, accepte: false },
    { m: 16, p: 2, accepte: true },
    { m: 31, p: 4, accepte: false },
    { m: 32, p: 4, accepte: true },
  ];

  for (const { m, p, accepte } of CAS) {
    it(`@critique m = ${String(m)}, p = ${String(p)} ⇒ ${accepte ? 'accepté' : 'refusé'}`, () => {
      const erreur = refusDe(profilKdf({ memoireKio: m, parallelisme: p }));
      if (accepte) {
        expect(erreur).toBeNull();
        return;
      }
      expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
      // Le minimum ANNONCÉ doit être celui qui a été CALCULÉ, pas la constante :
      // un message qui dirait « minimum de 8 » devant `p = 2` enverrait celui qui
      // le lit corriger la mauvaise valeur.
      expect(erreur?.message).toContain(`pour un minimum de ${String(8 * p)}`);
    });
  }

  it('@critique le plancher est publié comme un coefficient PAR VOIE, jamais comme une mémoire', () => {
    expect(BORNES_KDF.memoireKioMinParVoie).toBe(8);
    expect(BORNES_KDF).not.toHaveProperty('memoireKioMin');
  });
});

describe('coffre — R1 : les planchers de passes et de voies sont ceux de la bibliothèque', () => {
  // `hash-wasm` refuse « Iterations should be a positive number » et « Parallelism
  // should be a positive number ». Les transcrire ici n'ajoute aucune sévérité —
  // un plancher qui ne refuse que ce que la bibliothèque refuse déjà ne peut
  // fermer aucun coffre qui s'ouvrait la veille (invariant 7) — mais il fait dire
  // le refus EN FRANÇAIS, avant qu'il ne soit subi en anglais.
  const PLANCHERS: readonly {
    readonly nom: string;
    readonly parametres: ParametresKdf;
    readonly minimum: number;
    readonly etiquette: string;
  }[] = [
    {
      nom: 'zéro passe',
      parametres: profilKdf({ iterations: 0 }),
      minimum: BORNES_KDF.iterationsMin,
      etiquette: 'passes :',
    },
    {
      nom: 'un nombre de passes NÉGATIF',
      parametres: profilKdf({ iterations: -3 }),
      minimum: BORNES_KDF.iterationsMin,
      etiquette: 'passes :',
    },
    {
      nom: 'zéro voie parallèle',
      parametres: profilKdf({ parallelisme: 0 }),
      minimum: BORNES_KDF.parallelismeMin,
      etiquette: 'voies parallèles :',
    },
    {
      nom: 'un nombre de voies NÉGATIF',
      parametres: profilKdf({ parallelisme: -1 }),
      minimum: BORNES_KDF.parallelismeMin,
      etiquette: 'voies parallèles :',
    },
  ];

  for (const { nom, parametres, minimum, etiquette } of PLANCHERS) {
    it(`@critique ${nom} : refusé, avec l’axe et le minimum cités`, () => {
      const erreur = refusDe(parametres);
      expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
      expect(erreur?.message).toContain(etiquette);
      expect(erreur?.message).toContain(`pour un minimum de ${String(minimum)}`);
      for (const fragment of FRAGMENTS_TECHNIQUES_ANGLAIS) {
        expect(erreur?.message).not.toContain(fragment);
      }
    });
  }

  it('@critique anti-vacuité : `t = 1` et `p = 1` — les valeurs du profil confirmé — passent', () => {
    expect(BORNES_KDF.iterationsMin).toBe(1);
    expect(BORNES_KDF.parallelismeMin).toBe(1);
    expect(refusDe(profilKdf({ iterations: 1, parallelisme: 1 }))).toBeNull();
  });
});

describe('coffre — R1 : un paramètre non entier est refusé sur les QUATRE axes, `NaN` compris', () => {
  const AXES = ['memoireKio', 'iterations', 'parallelisme', 'longueurOctets'] as const;
  const VALEURS = [
    { nom: 'fractionnaire (1,5)', valeur: 1.5 },
    { nom: 'NaN', valeur: Number.NaN },
  ] as const;

  for (const axe of AXES) {
    for (const { nom, valeur } of VALEURS) {
      it(`@critique ${axe} = ${nom} : refusé, et le message dit que ce n’est pas un entier`, () => {
        const erreur = refusDe(profilKdf({ [axe]: valeur }));
        expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
        expect(erreur?.message).toContain('n’est pas un nombre entier');
        for (const fragment of FRAGMENTS_TECHNIQUES_ANGLAIS) {
          expect(erreur?.message).not.toContain(fragment);
        }
      });
    }
  }

  it('@critique `NaN` ne peut être retenu par AUCUNE comparaison de borne — c’est le filet d’entiers qui l’attrape', () => {
    // Le point qui rend ce test non redondant : `NaN > max` et `NaN < min` sont
    // FAUX tous les deux. Sans la garde d'intégrité, un `NaN` relu du stockage
    // traverserait les huit comparaisons sans en déclencher une seule, et
    // Argon2id mourrait un cran plus bas, en anglais.
    //
    // Le `NaN` est produit ici comme il le serait sur le terrain — par une
    // valeur de `meta` qui n'est pas un nombre —, et non écrit littéralement :
    // c'est la même valeur, et cela évite d'apprendre au dépôt qu'on compare
    // avec `NaN` (`use-isnan`).
    const valeurRelue = Number.parseFloat('quarante-huit');
    expect(Number.isNaN(valeurRelue)).toBe(true);
    expect(valeurRelue > BORNES_KDF.memoireKioMax).toBe(false);
    expect(valeurRelue < BORNES_KDF.memoireKioMinParVoie).toBe(false);
    expect(refusDe(profilKdf({ memoireKio: valeurRelue }))).toBeInstanceOf(
      ParametresKdfHorsBornesError,
    );
  });
});

describe('coffre — R1 : TOUS les écarts sont dits en UNE fois', () => {
  it('@critique un jeu fautif sur cinq points rend UN message qui les cite tous les cinq', () => {
    // Celui qui lira ce message le lira une fois, sur le terrain, sur un appareil
    // qui ne s'ouvre plus. Le renvoyer cinq fois de suite au même écran pour
    // découvrir un écart de plus à chaque tour n'est pas un diagnostic.
    const erreur = refusDe(
      profilKdf({
        memoireKio: 4_000_000,
        iterations: 1_000_000,
        parallelisme: 9,
        longueurOctets: 48,
      }),
    );
    expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
    const message = erreur?.message ?? '';
    for (const axe of [
      'mémoire de',
      'passes :',
      'voies parallèles :',
      'longueur de clé :',
      'travail total de',
    ]) {
      expect(message).toContain(axe);
    }
    // Anti-vacuité : cinq écarts, donc cinq fragments séparés — un message qui se
    // contenterait du premier venu n'en aurait qu'un.
    expect(message.split(' ; ')).toHaveLength(5);
  });
});

describe('coffre — R1 : le plafond de passes reste AMARRÉ au profil, pas à `iterationsMax`', () => {
  it('@critique `t = 4` accepté et `t = 5` refusé — et c’est le TRAVAIL qui refuse, pas le compteur de passes', () => {
    // Le point mesuré par A29 (sonde 6bis) et qu'il faut fixer : `iterationsMax`
    // vaut 8. Si c'était lui qui refusait `t = 5`, un durcissement humain du
    // profil (11 §8-4) ne déplacerait pas la limite — et le plafond deviendrait
    // un chiffre orphelin, exactement ce que l'arbitrage du 2026-09-04 a écarté.
    expect(BORNES_KDF.iterationsMax).toBeGreaterThan(5);
    expect(refusDe(profilKdf({ iterations: 4 }))).toBeNull();
    const erreur = refusDe(profilKdf({ iterations: 5 }));
    expect(erreur).toBeInstanceOf(ParametresKdfHorsBornesError);
    expect(erreur?.message).toContain('travail total de');
    expect(erreur?.message).not.toContain('passes :');
    expect(erreur?.message).toContain(String(BORNES_KDF.travailMax));
  });
});

// =============================================================================
// H. LES REFUS DU COFFRE QUI N'AVAIENT ENCORE AUCUN TEST
//
// Trois chemins de `coffre.ts` restaient à zéro : le mot de passe VIDE,
// l'enveloppe d'une AUTRE version (aux deux endroits où elle est vérifiée), et un
// clair déchiffré qui n'est pas du JSON. Aucun n'est un correctif d'A24 — ils
// sont antérieurs (`0d4daf43`) —, et c'est précisément pourquoi personne ne les
// avait regardés. Ils décident tous les trois de ce qu'un auditeur voit quand une
// donnée locale est abîmée : ce n'est pas de la couverture de confort.
// =============================================================================
describe('coffre — refus élémentaires (mot de passe vide, versions d’enveloppe, clair non JSON)', () => {
  it('un mot de passe VIDE est refusé par `deriverKek`, avant Argon2id', async () => {
    await expect(deriverKek('', selFixe(1))).rejects.toThrow(MotDePasseInvalideError);
  });

  it('une enveloppe de DEK d’une AUTRE version n’est pas « déballée au mieux » : elle lève', async () => {
    const dekEnveloppee = await creerDekEnveloppee(kekA);
    await expect(
      ouvrirCoffre(kekA, { ...dekEnveloppee, v: VERSION_ENVELOPPE + 1 }),
    ).rejects.toThrow(ErreurEnveloppe);
    // Anti-vacuité : la MÊME enveloppe, à sa version, s'ouvre.
    await expect(ouvrirCoffre(kekA, dekEnveloppee)).resolves.toBeDefined();
  });

  it('une enveloppe de DONNÉE d’une autre version lève aussi, et distinctement d’un mauvais chiffré', async () => {
    const { coffre } = await creerCoffre(kekA);
    const enveloppe = await coffre.chiffrer(CLAIR);
    await expect(
      coffre.dechiffrer({ ...enveloppe, v: VERSION_ENVELOPPE + 1 }, schemaReponse),
    ).rejects.toThrow(ErreurEnveloppe);
    await expect(coffre.dechiffrer(enveloppe, schemaReponse)).resolves.toEqual(CLAIR);
  });

  it('un clair authentifié mais NON JSON est signalé corrompu — jamais avalé en silence', async () => {
    // Le seul cas de ce fichier qui exige de manipuler la DEK à la main : le
    // coffre ne publie aucun moyen d'écrire autre chose que du JSON, ce qui est
    // une bonne propriété. On reconstitue donc la même DEK avec WebCrypto brut,
    // sans rien demander de plus au module que ce qu'il expose déjà.
    const dekEnveloppee = await creerDekEnveloppee(kekA);
    const coffre = await ouvrirCoffre(kekA, dekEnveloppee);
    const dek = await crypto.subtle.unwrapKey(
      'raw',
      depuisBase64(dekEnveloppee.c),
      kekA,
      { name: 'AES-GCM', iv: depuisBase64(dekEnveloppee.n) },
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const envelopperOctets = async (octets: Uint8Array<ArrayBuffer>): Promise<Enveloppe> => {
      const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE_OCTETS));
      const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, dek, octets);
      return {
        v: VERSION_ENVELOPPE,
        n: versBase64(nonce),
        c: versBase64(new Uint8Array(chiffre)),
      };
    };

    // Anti-vacuité : la même fabrication, avec du JSON valide, se relit. Sans
    // elle, un `unwrapKey` mal câblé rendrait ce test vert pour la mauvaise
    // raison — l'échec viendrait de la clé, pas du contenu.
    const bonne = await envelopperOctets(new TextEncoder().encode(JSON.stringify(CLAIR)));
    await expect(coffre.dechiffrer(bonne, schemaReponse)).resolves.toEqual(CLAIR);

    const mauvaise = await envelopperOctets(new TextEncoder().encode('{ ceci n’est pas du JSON'));
    await expect(coffre.dechiffrer(mauvaise, schemaReponse)).rejects.toThrow(
      DonneeLocaleCorrompueError,
    );
  });

  it('`chiffrer(undefined)` range un `null` explicite — jamais un trou dans le chiffré', async () => {
    const { coffre } = await creerCoffre(kekA);
    const enveloppe = await coffre.chiffrer(undefined);
    await expect(coffre.dechiffrer(enveloppe, z.null())).resolves.toBeNull();
  });
});
