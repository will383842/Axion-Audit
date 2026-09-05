// =============================================================================
// LE COFFRE — DEK / KEK, 05 §9.7 (« Sécurité locale »), 06 §10.5, 11 §4
//
// ── L'ARCHITECTURE, TRANSCRITE DU 05 §9.7 ET DE RIEN D'AUTRE ─────────────────
// « Une **DEK** AES-256 aléatoire par appareil chiffre les données ; la DEK est
// enveloppée par une **KEK** dérivée du mot de passe (Argon2id + sel local par
// appareil) et stockée enveloppée. Changement de mot de passe EN LIGNE = simple
// ré-enveloppement de la DEK (les données ne sont jamais re-chiffrées). […] La
// KEK n'est tenue qu'en mémoire de session. »
//
// Trois conséquences que ce fichier rend structurelles plutôt que déclarées :
//   1. la DEK obtenue par `unwrapKey` est **non extractable** — elle ne peut plus
//      sortir de WebCrypto, même pour du code qui le voudrait ;
//   2. `verrouiller()` lâche la référence à la DEK et FERME le coffre : toute
//      opération ultérieure lève, elle ne rend pas une valeur vide ;
//   3. `reenvelopperDek` ne touche à AUCUNE donnée — c'est ce qui rend le
//      changement de mot de passe instantané sur une mission de 5 000 réponses.
//
// ── LA DÉCISION GRAVÉE QU'IL NE FAUT PAS RECONTOURNER ────────────────────────
// 05 §9.7 : « AUCUN mécanisme de déverrouillage affaibli en V1 (pas de PIN court,
// pas de schéma — la KEK dérive du mot de passe et de rien d'autre) ». Aucune
// fonction de ce module n'accepte autre chose qu'un mot de passe.
//
// ── CE QUI EST UNE DÉCISION ET DOIT ÊTRE RATIFIÉE (DECISIONS.md) ─────────────
// Le pack impose l'ALGORITHME (Argon2id, 11 §4) mais AUCUN paramètre. Les valeurs
// de `PARAMETRES_KDF_DEFAUT` sont donc un choix, pas une lecture : elles suivent
// la recommandation OWASP (Password Storage Cheat Sheet) pour Argon2id, et elles
// sont ÉCRITES DANS LE COFFRE ET DANS L'EN-TÊTE DE SAUVEGARDE (11 §4 :
// `kdf: {algo, salt, params}`) — c'est ce qui permet de les changer un jour sans
// rendre illisible ce qui a été chiffré avant. 11 §8-4 réserve la décision à
// l'humain : elle est remontée, pas devinée.
//
// Traçabilité : E33 (sécurité / RGPD), E38 (sauvegarde terrain : sync + export).
// =============================================================================
import { argon2id } from 'hash-wasm';
import type { ZodType } from 'zod';
import {
  depuisBase64,
  ErreurEnveloppe,
  LONGUEUR_NONCE_OCTETS,
  versBase64,
  VERSION_ENVELOPPE,
  type Enveloppe,
} from './enveloppe.js';

// Ré-exporté ici parce que c'est le type que le coffre PRODUIT et CONSOMME :
// un appelant qui manipule un coffre n'a aucune raison d'aller chercher la forme
// de l'enveloppe dans un troisième module.
export type { Enveloppe } from './enveloppe.js';

// ─────────────────────────────────────────────────────────────────────────────
// PARAMÈTRES
// ─────────────────────────────────────────────────────────────────────────────
export interface ParametresKdf {
  readonly algo: 'argon2id';
  /** Mémoire en kibioctets (`m`). */
  readonly memoireKio: number;
  /** Nombre de passes (`t`). */
  readonly iterations: number;
  /** Voies parallèles (`p`). `hash-wasm` est mono-thread : rester à 1. */
  readonly parallelisme: number;
  /** Longueur de la clé dérivée, en octets. 32 = AES-256. */
  readonly longueurOctets: number;
}

/**
 * Profil OWASP « m=46 MiB, t=1, p=1 » pour Argon2id.
 *
 * Le choix n'est pas de confort : 11 §4 impose « dérivation de clé < 1 s sur
 * iPad », et c'est un budget d'ACCEPTATION mesuré par A28. Un profil plus lourd
 * (64 MiB, t=3) tiendrait peut-être sur un portable et échouerait sur la cible la
 * plus dure, que 03 §22.1 désigne explicitement comme l'iPad. Le déverrouillage
 * a lieu à chaque reprise après 15 minutes d'inactivité : une seconde de plus
 * est payée dix fois par jour, en entretien.
 */
export const PARAMETRES_KDF_DEFAUT: ParametresKdf = {
  algo: 'argon2id',
  memoireKio: 47_104,
  iterations: 1,
  parallelisme: 1,
  longueurOctets: 32,
};

/** Longueur du sel de dérivation, en octets (recommandation Argon2 : 16). */
export const LONGUEUR_SEL_OCTETS = 16;

/** Longueur de la DEK, en bits. 05 §9.7 : « une DEK AES-256 ». */
const LONGUEUR_DEK_BITS = 256;

// ─────────────────────────────────────────────────────────────────────────────
// ERREURS — chacune dit une CAUSE et une ACTION (03 §17.6, §33.2)
// ─────────────────────────────────────────────────────────────────────────────
/** Le coffre est fermé : la DEK n'est plus en mémoire (verrou 05 §9.7). */
export class CoffreVerrouilleError extends Error {
  override readonly name = 'CoffreVerrouilleError';
  constructor() {
    super(
      'Le coffre est verrouillé. Saisissez votre mot de passe pour reprendre la collecte — vos données sont en sécurité sur l’appareil.',
    );
  }
}

/** Mot de passe faux, ou enveloppe de DEK altérée. Les deux se ressemblent, et c'est voulu. */
export class MotDePasseInvalideError extends Error {
  override readonly name = 'MotDePasseInvalideError';
  constructor() {
    super('Mot de passe incorrect. Aucune donnée locale n’a été modifiée.');
  }
}

/** Une ligne déchiffrée ne respecte pas son schéma : donnée corrompue, jamais ignorée. */
export class DonneeLocaleCorrompueError extends Error {
  override readonly name = 'DonneeLocaleCorrompueError';
  constructor(detail: string) {
    super(
      `Une donnée locale est illisible et n’a PAS été supprimée : ${detail}. Exportez une sauvegarde de secours et signalez-le avant de continuer.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DÉRIVATION ET ENVELOPPEMENT
// ─────────────────────────────────────────────────────────────────────────────
/** Un sel neuf, tiré du CSPRNG du navigateur. Un sel par APPAREIL (05 §9.7). */
export function genererSel(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(LONGUEUR_SEL_OCTETS));
}

/**
 * Dérive la KEK à partir du mot de passe et du sel de l'appareil (Argon2id).
 *
 * La clé rendue porte les usages `wrapKey`/`unwrapKey` ET `encrypt`/`decrypt` :
 * les deux premiers servent la DEK, les deux suivants servent le fichier de
 * secours `.axionbackup` (11 §4), dont la clé dérive DU MOT DE PASSE et non de la
 * DEK d'appareil — c'est ce qui le rend restaurable sur un second appareil.
 *
 * Elle est **non extractable** : rien, pas même ce module, ne peut la relire.
 */
export async function deriverKek(
  motDePasse: string,
  sel: Uint8Array,
  parametres: ParametresKdf = PARAMETRES_KDF_DEFAUT,
): Promise<CryptoKey> {
  if (motDePasse === '') {
    throw new MotDePasseInvalideError();
  }
  const brut = await argon2id({
    password: motDePasse,
    salt: sel,
    memorySize: parametres.memoireKio,
    iterations: parametres.iterations,
    parallelism: parametres.parallelisme,
    hashLength: parametres.longueurOctets,
    outputType: 'binary',
  });
  // `Uint8Array.from` et non `brut` directement : `hash-wasm` rend un
  // `Uint8Array<ArrayBufferLike>`, que la signature de WebCrypto refuse (un tampon
  // partagé n'est pas une source de clé valide). La copie est de 32 octets.
  return crypto.subtle.importKey('raw', Uint8Array.from(brut), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
    'wrapKey',
    'unwrapKey',
  ]);
}

/**
 * Crée une DEK neuve ET son enveloppe sous la KEK — le premier embarquement d'un
 * appareil. La DEK rendue est déjà **non extractable** : la version extractable
 * qui a servi à l'enveloppement n'est jamais publiée hors de cette fonction.
 */
export async function creerDekEnveloppee(kek: CryptoKey): Promise<Enveloppe> {
  const dekExtractible = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: LONGUEUR_DEK_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
  return envelopper(dekExtractible, kek);
}

/**
 * Ré-enveloppe la DEK sous une nouvelle KEK — c'est TOUT ce que fait un changement
 * de mot de passe en ligne (05 §9.7 : « les données ne sont jamais re-chiffrées »).
 *
 * `LOT_L5.md` §3.3-③ rappelle la contrepartie, qui n'est pas dans ce fichier mais
 * doit être dite au même endroit : l'écran avertit quand l'outbox n'est pas vide,
 * parce que le garde-fou SERVEUR refusera la réinitialisation (05 §9.7, V2.9).
 * L'application terrain ne doit pas laisser croire le contraire.
 */
export async function reenvelopperDek(
  dekEnveloppee: Enveloppe,
  kekActuelle: CryptoKey,
  kekNouvelle: CryptoKey,
): Promise<Enveloppe> {
  const dek = await deballer(dekEnveloppee, kekActuelle, true);
  return envelopper(dek, kekNouvelle);
}

async function envelopper(dek: CryptoKey, kek: CryptoKey): Promise<Enveloppe> {
  const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE_OCTETS));
  const enveloppee = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv: nonce,
  });
  return { v: VERSION_ENVELOPPE, n: versBase64(nonce), c: versBase64(new Uint8Array(enveloppee)) };
}

async function deballer(
  dekEnveloppee: Enveloppe,
  kek: CryptoKey,
  extractible: boolean,
): Promise<CryptoKey> {
  if (dekEnveloppee.v !== VERSION_ENVELOPPE) {
    throw new ErreurEnveloppe(
      `Enveloppe de clé en version ${String(dekEnveloppee.v)}, attendue ${String(VERSION_ENVELOPPE)}.`,
    );
  }
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      depuisBase64(dekEnveloppee.c),
      kek,
      { name: 'AES-GCM', iv: depuisBase64(dekEnveloppee.n) },
      { name: 'AES-GCM', length: LONGUEUR_DEK_BITS },
      extractible,
      ['encrypt', 'decrypt'],
    );
  } catch {
    // AES-GCM ne distingue pas « mauvaise clé » de « chiffré altéré » : les deux
    // sont un échec d'authentification. Ne pas prétendre le contraire à l'écran.
    throw new MotDePasseInvalideError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LE COFFRE OUVERT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Un coffre ouvert : la DEK, et les deux seules opérations qu'on en fait.
 *
 * Il n'expose PAS la clé. C'est délibéré : un `Coffre` peut circuler dans le
 * contexte React (`app/contexte.tsx`) sans qu'aucun écran ne puisse en extraire
 * de quoi déchiffrer ailleurs, ni l'écrire par mégarde dans un journal.
 */
export interface Coffre {
  /** `false` dès que `verrouiller()` a été appelé. */
  readonly ouvert: boolean;
  /** Chiffre une valeur JSON-sérialisable. Rendu : une `Enveloppe`. */
  chiffrer(valeur: unknown): Promise<Enveloppe>;
  /**
   * Déchiffre PUIS valide contre un schéma Zod. Les deux, toujours : une donnée
   * déchiffrée qui ne respecte plus sa forme est corrompue, et la traiter comme
   * valide propagerait la corruption dans la sync (invariant 7).
   */
  dechiffrer<T>(enveloppe: Enveloppe, schema: ZodType<T>): Promise<T>;
  /**
   * Ferme le coffre : la référence à la DEK est lâchée et le coffre devient
   * inutilisable. **Aucun code JavaScript ne peut effacer la mémoire d'une
   * `CryptoKey`** — c'est le moteur qui la détient, hors du tas JS. Ce que cette
   * méthode garantit, et c'est ce qui compte pour 05 §9.7, c'est qu'après elle
   * plus AUCUN chemin de code de l'application n'atteint la clé.
   */
  verrouiller(): void;
}

/**
 * Ouvre le coffre : déballe la DEK sous la KEK. La DEK obtenue est **non
 * extractable** — elle ne peut plus jamais être relue, seulement utilisée.
 */
export async function ouvrirCoffre(kek: CryptoKey, dekEnveloppee: Enveloppe): Promise<Coffre> {
  const dekInitiale = await deballer(dekEnveloppee, kek, false);
  let dek: CryptoKey | null = dekInitiale;

  const clef = (): CryptoKey => {
    if (dek === null) throw new CoffreVerrouilleError();
    return dek;
  };

  return {
    get ouvert() {
      return dek !== null;
    },

    async chiffrer(valeur: unknown): Promise<Enveloppe> {
      const cle = clef();
      const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE_OCTETS));
      const clair = new TextEncoder().encode(JSON.stringify(valeur ?? null));
      const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cle, clair);
      return {
        v: VERSION_ENVELOPPE,
        n: versBase64(nonce),
        c: versBase64(new Uint8Array(chiffre)),
      };
    },

    async dechiffrer<T>(enveloppe: Enveloppe, schema: ZodType<T>): Promise<T> {
      const cle = clef();
      if (enveloppe.v !== VERSION_ENVELOPPE) {
        throw new ErreurEnveloppe(
          `Enveloppe en version ${String(enveloppe.v)}, attendue ${String(VERSION_ENVELOPPE)}.`,
        );
      }
      let clair: ArrayBuffer;
      try {
        clair = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: depuisBase64(enveloppe.n) },
          cle,
          depuisBase64(enveloppe.c),
        );
      } catch {
        throw new DonneeLocaleCorrompueError('le chiffré ne s’authentifie pas');
      }
      let brut: unknown;
      try {
        brut = JSON.parse(new TextDecoder().decode(clair));
      } catch {
        throw new DonneeLocaleCorrompueError('le contenu déchiffré n’est pas du JSON');
      }
      const verdict = schema.safeParse(brut);
      if (!verdict.success) {
        // Le message d'erreur Zod cite les CHEMINS, jamais les VALEURS : 11 §2
        // interdit toute donnée personnelle dans un journal, et une exception
        // finit toujours par être journalisée quelque part.
        const chemins = verdict.error.issues.map((i) => i.path.join('.')).join(', ');
        throw new DonneeLocaleCorrompueError(`forme inattendue sur : ${chemins || '(racine)'}`);
      }
      return verdict.data;
    },

    verrouiller(): void {
      dek = null;
    },
  };
}

/**
 * Crée un coffre NEUF sous une KEK donnée : une DEK fraîche, son enveloppe, et le
 * coffre déjà ouvert dessus.
 *
 * ── POURQUOI CETTE FABRIQUE EXISTE, EN PLUS D'`ouvrirCoffre` ────────────────
 * `ouvrirCoffre` OUVRE un coffre existant : elle exige une enveloppe de DEK, donc
 * un appareil déjà préparé. Créer un coffre neuf demandait jusqu'ici d'enchaîner
 * `creerDekEnveloppee` puis `ouvrirCoffre` — deux appels et un invariant implicite
 * (la même KEK des deux côtés) que chaque appelant devait retenir. Ici, il est
 * porté par la fonction.
 *
 * `coffre-appareil.ts` s'en sert pour le premier déverrouillage ; elle est aussi
 * ce qui permet d'exercer le coffre SANS `meta` ni IndexedDB, ce qu'un test de
 * crypto doit pouvoir faire (`LOT_L5.md` §4 : les tests de coffre sont écrits
 * AVANT le code, et ils ne testent pas Dexie).
 *
 * La signature d'`ouvrirCoffre` n'est pas touchée : c'est elle qui est publiée
 * (`LOT_L5.md` §2), celle-ci s'ajoute à côté.
 */
export async function creerCoffreNeuf(
  kek: CryptoKey,
): Promise<{ coffre: Coffre; dekEnveloppee: Enveloppe }> {
  const dekEnveloppee = await creerDekEnveloppee(kek);
  return { coffre: await ouvrirCoffre(kek, dekEnveloppee), dekEnveloppee };
}
