// =============================================================================
// L'ENVELOPPE — la forme d'une donnée chiffrée au repos (06 §10.5, 05 §9.7)
//
// 06 §10.5 exige « IndexedDB chiffré ». `LOT_L5.md` §3.2 en tire la conséquence
// que personne n'aime écrire : une ligne ENTIÈREMENT chiffrée n'est plus
// interrogeable, donc ni le cockpit, ni la recherche hors-parcours, ni la règle
// du verrou à 60 minutes ne fonctionnent. L'arbitrage de la note est donc :
// **chiffrement par ENREGISTREMENT, avec un en-tête d'index en clair** dont la
// liste est FERMÉE (voir `base.ts`). Tout le reste vit ici, dans une `Enveloppe`.
//
// Ce module ne connaît ni clé ni mot de passe : il ne porte que la FORME et son
// encodage. La clé est dans `coffre.ts`, et elle n'en sort jamais.
//
// Traçabilité : E33 (sécurité / RGPD) · 11 §4 (« Crypto navigateur : WebCrypto
// (AES-GCM) »), 05 §9.7, 06 §10.5.
// =============================================================================
import { z } from 'zod';

/**
 * Version de FORME de l'enveloppe — pas la version du schéma local.
 *
 * Elle existe pour la même raison que `format_version` dans l'en-tête du fichier
 * `.axionbackup` (11 §4) : le jour où la forme change, une enveloppe écrite hier
 * doit rester DÉCHIFFRABLE, pas « probablement compatible ». Une donnée d'audit
 * qu'on ne sait plus relire est une donnée perdue (invariant 7).
 */
export const VERSION_ENVELOPPE = 1;

/** Longueur du nonce AES-GCM, en octets. 96 bits = la valeur recommandée pour GCM. */
export const LONGUEUR_NONCE_OCTETS = 12;

/**
 * Un fragment chiffré : `v` la version de forme, `n` le nonce, `c` le chiffré.
 *
 * Les noms sont courts DÉLIBÉRÉMENT : cette structure est répétée sur chaque
 * ligne d'IndexedDB et dans chaque op de l'outbox — sur une mission à 5 000
 * réponses (05 §9.8), la différence entre `n` et `nonceBase64` se compte en
 * centaines de kilo-octets d'un quota mobile déjà contraint (03 §22.1).
 *
 * L'encodage est base64 et non `Uint8Array` : le `payload` du fichier de secours
 * `.axionbackup` (11 §4) est du JSON, et une enveloppe doit pouvoir y entrer
 * telle quelle, sans conversion — donc sans occasion de se tromper.
 */
export interface Enveloppe {
  readonly v: number;
  readonly n: string;
  readonly c: string;
}

/**
 * Le schéma de validation d'une enveloppe VENUE DE L'EXTÉRIEUR — c'est-à-dire
 * d'un fichier `.axionbackup` importé (11 §4 : « Import = validation Zod du
 * fichier + fusion par UUID »). Les enveloppes que NOUS écrivons n'ont pas
 * besoin d'être validées : elles n'ont pas traversé de frontière.
 */
export const enveloppeSchema = z.object({
  v: z.number().int().min(1),
  n: z.string().min(1),
  c: z.string().min(1),
});

const ALPHABET_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Une valeur quelconque est-elle une enveloppe exploitable ? (garde de lecture) */
export function estEnveloppe(valeur: unknown): valeur is Enveloppe {
  return enveloppeSchema.safeParse(valeur).success;
}

/**
 * Encodage base64 sans dépendance : `btoa` est disponible dans la fenêtre ET dans
 * le service worker. Le découpage par blocs évite le dépassement de pile de
 * `String.fromCharCode(...tableau)` sur une photo compressée de plusieurs Mo.
 */
export function versBase64(octets: Uint8Array): string {
  const TAILLE_BLOC = 0x8000;
  let binaire = '';
  for (let i = 0; i < octets.length; i += TAILLE_BLOC) {
    binaire += String.fromCharCode(...octets.subarray(i, i + TAILLE_BLOC));
  }
  return btoa(binaire);
}

/** Décodage base64. Rejette explicitement une chaîne qui n'en est pas une. */
export function depuisBase64(texte: string): Uint8Array<ArrayBuffer> {
  if (texte === '' || !ALPHABET_BASE64.test(texte)) {
    throw new ErreurEnveloppe('Le fragment chiffré n’est pas encodé en base64.');
  }
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

/**
 * Une enveloppe illisible n'est JAMAIS traitée comme une donnée vide : ce serait
 * la forme la plus discrète de la perte silencieuse que l'invariant 7 interdit.
 * Elle lève, et l'appelant décide quoi montrer à l'auditeur.
 */
export class ErreurEnveloppe extends Error {
  override readonly name = 'ErreurEnveloppe';
}
