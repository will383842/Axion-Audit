// =============================================================================
// RECONNAISSANCE DES ERREURS DE LA BIBLIOTHÈQUE DE JETONS — lot L2, T1.
//
// POURQUOI CE MODULE EXISTE SÉPARÉMENT DE `jetons.ts` : il est importé par le
// gestionnaire d'erreurs central (`erreurs.ts`), qui doit rester chargeable SANS
// configuration. `jetons.ts` importe `config.ts`, qui refuse de se charger si
// l'environnement est incomplet — une dépendance qui aurait rendu le gestionnaire
// d'erreurs intestable isolément. Ce fichier n'importe QUE `@axion/shared`.
//
// ── LE DÉFAUT QU'IL FERME (revue croisée, corollaire de D4) ────────────────────
// `@fastify/jwt` ne lève pas QUE des 401. Deux de ses erreurs portent
// `statusCode: 400` : `FST_JWT_BAD_REQUEST` et `FST_JWT_BAD_COOKIE_REQUEST`.
// Le jour où une route utilisera la forme décorée (`request.jwtVerify()`) plutôt
// que la vérification explicite du crochet ①, un échec d'AUTHENTIFICATION
// ressortirait en `400 INVALID_PAYLOAD` — exactement le défaut que ce lot vient
// de fermer, rouvert par une autre porte.
//
// D'où une reconnaissance PAR CODE D'ERREUR et non par statut : le statut est ce
// que la bibliothèque a choisi, le code est ce qu'il s'est passé.
// Traçabilité : E5, E43.
// =============================================================================
import { AppError } from '@axion/shared';

/**
 * Préfixes des codes d'erreur des deux couches de jetons :
 *   · `FST_JWT_*`  — erreurs enveloppées par `@fastify/jwt` (forme décorée) ;
 *   · `FAST_JWT_*` — erreurs brutes de `fast-jwt` (vérification explicite).
 * On les traite ENSEMBLE parce qu'elles décrivent le même événement.
 */
const PREFIXES_ERREUR_JETON = ['FST_JWT_', 'FAST_JWT_'] as const;

/** Les deux écritures d'un même fait : le jeton a expiré. */
const CODES_JETON_EXPIRE = new Set(['FAST_JWT_EXPIRED', 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED']);

/** Message unique de refus. 06 §10.2 : la réponse ne dit jamais ce qui a échoué. */
export const MESSAGE_AUTH_REQUISE = 'Authentification requise.';

/** Message du seul détail concédé : le client sait rafraîchir plutôt que reconnecter. */
export const MESSAGE_JETON_EXPIRE = 'Votre session a expiré. Reconnectez-vous.';

/** Lit `code` sur une erreur inconnue sans assertion ni `any`. */
function codeDe(erreur: unknown): string | null {
  if (!(erreur instanceof Error) || !('code' in erreur)) return null;
  const { code } = erreur;
  return typeof code === 'string' ? code : null;
}

/**
 * Rend l'`AppError` correspondante si l'erreur vient d'une couche de jetons,
 * `null` sinon — c'est ce `null` qui permet au gestionnaire central de ne PAS
 * réécrire les erreurs des autres greffons.
 */
export function reconnaitreErreurDeJeton(erreur: unknown): AppError | null {
  const code = codeDe(erreur);
  if (code === null || !PREFIXES_ERREUR_JETON.some((prefixe) => code.startsWith(prefixe))) {
    return null;
  }
  return CODES_JETON_EXPIRE.has(code)
    ? new AppError('TOKEN_EXPIRED', MESSAGE_JETON_EXPIRE)
    : new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
}

/**
 * Traduit TOUTE erreur en `AppError` d'authentification — le repli du crochet ①,
 * qui ne doit jamais laisser fuir une erreur de bibliothèque vers le client.
 */
export function traduireErreurJeton(erreur: unknown): AppError {
  return reconnaitreErreurDeJeton(erreur) ?? new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
}
