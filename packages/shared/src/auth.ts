// =============================================================================
// CONTRATS D'INTERFACE DES ROUTES D'AUTHENTIFICATION — lot L2, tâche T2.
//
// 05 §8.1 :
//   POST /v1/auth/login    {email, password} → {access(15min), refresh(30j, rotatif)}
//   POST /v1/auth/refresh  rotation du refresh token (détection de réutilisation
//                          → révocation famille)
//   POST /v1/auth/logout   révoque le refresh
//
// POURQUOI CES SCHÉMAS VIVENT ICI ET PAS DANS L'API (contrat 11 §3)
// « Chaque route déclare son schéma Zod in/out DEPUIS `packages/shared` ; les types
// TS sont dérivés (`z.infer`), le front importe LES MÊMES schémas. » Les deux sondes
// de santé du lot L0 en sont dispensées — dispense héritée, EXPLICITEMENT NON
// EXTENSIBLE (voir l'en-tête de `apps/api/src/routes/sante.ts`) : aucune route L2
// n'est acceptée sans ses deux schémas, et ce fichier est la contrepartie de cette
// promesse pour les trois routes d'auth.
//
// AUCUNE LOGIQUE ICI — ni vérification de mot de passe, ni frappe de jeton : ce
// paquet est importé par la PWA terrain et par la console. Ce qui y entre part dans
// un navigateur.
// Traçabilité : E33 (sécurité : authentification), E43 (conventions API épinglées).
// =============================================================================
import { z } from 'zod';
import { isoUtcSchema } from './temps.js';

// -----------------------------------------------------------------------------
// Bornes d'entrée
// -----------------------------------------------------------------------------

/**
 * Longueur maximale d'une adresse (RFC 5321 : 254 caractères de chemin, 320 avec
 * les parties locales les plus longues). Une borne n'est pas de la coquetterie :
 * sans elle, une adresse d'un mégaoctet ferait travailler la recherche en base
 * avant tout contrôle — la borne est refusée par Zod, donc AVANT la base.
 */
export const EMAIL_LONGUEUR_MAX = 320;

/**
 * Longueur maximale d'un mot de passe PRÉSENTÉ à la connexion.
 *
 * Argon2id coûte ~19 Mio et trois passes PAR VÉRIFICATION : accepter une entrée
 * non bornée offrirait à l'attaquant un amplificateur de charge à moindre frais.
 * 256 caractères laissent toute la place à une phrase de passe longue.
 *
 * CE QUI N'EST **PAS** CONTRÔLÉ ICI, ET C'EST DÉLIBÉRÉ : le minimum de 12
 * caractères de la politique (06 §10.1). Il s'applique à la CRÉATION et au
 * CHANGEMENT de mot de passe (lot L2/T3), jamais à la connexion — un compte plus
 * ancien que la politique doit pouvoir se connecter pour aller la corriger, et un
 * refus de longueur à la connexion rendrait un `VALIDATION_FAILED` (400) là où le
 * contrat exige un `INVALID_CREDENTIALS` (401) indifférencié.
 */
export const MOT_DE_PASSE_PRESENTE_LONGUEUR_MAX = 256;

/**
 * L'adresse est NETTOYÉE de ses espaces de bord avant validation — un copier-coller
 * depuis un client de messagerie en traîne presque toujours — puis validée comme
 * adresse. Aucune mise en minuscules : `users.email` est un `TEXT UNIQUE` dans le
 * fichier 04 (pas un `CITEXT`, pas d'index fonctionnel sur `lower(email)`), donc la
 * comparaison est SENSIBLE À LA CASSE en base. Normaliser ici sans normaliser là-bas
 * fabriquerait un compte inaccessible plutôt qu'un compte plus facile à joindre.
 * (Fiche AMELIORATIONS proposée avec ce lot — la correction touche le fichier 04,
 * donc une escalade, CLAUDE.md §3-2.)
 *
 * ⚠ EXPORTÉ DEPUIS T3, ET C'EST LE POINT IMPORTANT : `users.ts` en a besoin pour la
 * création et la modification d'un compte. Le recopier là-bas aurait dupliqué une
 * décision de NORMALISATION — « on rogne les espaces, on ne met JAMAIS en
 * minuscules » — dont les deux moitiés doivent rester d'accord : une adresse
 * normalisée à l'écriture et pas à la lecture (ou l'inverse) fabrique un compte
 * inaccessible. Un seul schéma, donc une seule décision.
 */
export const emailUtilisateurSchema = z.string().trim().pipe(z.email().max(EMAIL_LONGUEUR_MAX));

// -----------------------------------------------------------------------------
// ENTRÉES
// -----------------------------------------------------------------------------

/** `POST /v1/auth/login` — entrée. */
export const loginRequestSchema = z.object({
  email: emailUtilisateurSchema,
  password: z.string().min(1).max(MOT_DE_PASSE_PRESENTE_LONGUEUR_MAX),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Le jeton de rafraîchissement tel qu'il circule : une chaîne OPAQUE.
 *
 * 256 bits d'aléa en base64url = 43 caractères. On ne valide ni la longueur exacte
 * ni l'alphabet : ce serait un oracle de format qui aiderait à distinguer « ce
 * n'est pas un jeton de chez nous » de « ce jeton n'existe plus », alors que les
 * deux doivent rendre exactement la même chose (06 §10.2). La borne haute, elle,
 * protège la base d'une entrée démesurée.
 */
const jetonRafraichissementSchema = z.string().min(1).max(512);

/** `POST /v1/auth/refresh` — entrée. */
export const refreshRequestSchema = z.object({
  refreshToken: jetonRafraichissementSchema,
});

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** `POST /v1/auth/logout` — entrée. */
export const logoutRequestSchema = z.object({
  refreshToken: jetonRafraichissementSchema,
});

export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

// -----------------------------------------------------------------------------
// SORTIES
// -----------------------------------------------------------------------------

/**
 * Le couple de jetons rendu par `login` ET par `refresh` — 05 §8.1.
 *
 * `userId` ET RIEN D'AUTRE DE L'UTILISATEUR. Deux raisons, dans cet ordre :
 *
 *   1. Le client NE PEUT PAS lire le jeton d'accès. C'est une décision du socle
 *      (`apps/api/src/auth/jetons.ts`) : la charge utile du JWT n'est pas publiée
 *      dans `packages/shared`, précisément pour que le front n'aille pas y puiser.
 *      Sans `userId` ici, la PWA terrain n'aurait AUCUN moyen de savoir à quel
 *      compte appartiennent ses données locales — or 05 §9.7 exige qu'un export de
 *      secours ne soit réimportable que « sur un autre appareil du MÊME compte ».
 *   2. Ni `role`, ni `name`, ni `email`. Le rôle n'y est pas parce qu'un droit lu
 *      côté client n'est pas un droit (invariant 3 : le RBAC est SERVEUR, et le
 *      crochet d'autorisation relit `users` à chaque requête) ; le nom et l'adresse
 *      n'y sont pas par minimisation (06 §10.4).
 *
 * Les deux horodatages sont en ISO 8601 UTC (11 §3). Ils évitent au client de
 * décoder quoi que ce soit pour savoir quand rafraîchir.
 */
export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  /** Fin de validité du jeton d'accès — 15 min (11 §3). */
  accessExpiresAt: isoUtcSchema,
  /** Fin de validité du jeton de rafraîchissement — 30 j (11 §3). */
  refreshExpiresAt: isoUtcSchema,
  userId: z.uuid(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

/**
 * `POST /v1/auth/login` — sortie. Alias NOMMÉ de `authSessionSchema` : le contrat
 * 11 §3 veut qu'une route déclare SON schéma de sortie. Le jour où `login` et
 * `refresh` divergeront, seul l'alias concerné bouge.
 */
export const loginResponseSchema = authSessionSchema;
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** `POST /v1/auth/refresh` — sortie (le couple ROTATIF : les deux jetons changent). */
export const refreshResponseSchema = authSessionSchema;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

/**
 * `POST /v1/auth/logout` — sortie.
 *
 * `z.literal(true)` et non un booléen : la réponse est CONSTANTE. Rendre
 * « révoqué : oui/non » dirait à l'appelant si le jeton présenté existait et lui
 * appartenait — c'est-à-dire exactement l'oracle que 06 §10.2 interdit. Une
 * déconnexion est idempotente : elle réussit toujours, y compris la deuxième fois.
 */
export const logoutResponseSchema = z.object({
  loggedOut: z.literal(true),
});

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
