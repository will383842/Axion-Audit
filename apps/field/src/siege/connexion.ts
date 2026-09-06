// =============================================================================
// RATTACHEMENT DE L'APPAREIL À SON AUDITEUR — 05 §8.1, 05 §9.9, 03 §34.4
//
// ── LE TROU QUE CE MODULE FERME, ET COMMENT IL A ÉTÉ MESURÉ ─────────────────
// `session/auditeur.ts` sait RANGER une identité depuis L5a. Personne ne la lui
// donnait : `memoriserIdentiteAuditeur` n'avait, en production, aucun appelant —
// seulement deux tests. Conséquence constatée deux fois, par A26 en écrivant les
// scénarios hors ligne et par A54 en recette novice (arrêt à `t+3 min`) : sur un
// appareil réel, AUCUNE session ne peut naître. « Auditeur inconnu sur cet
// appareil » est l'état d'erreur exact, et il disait la vérité.
//
// ── POURQUOI UNE CONNEXION, ET PAS UN IDENTIFIANT FABRIQUÉ ──────────────────
// 05 §9.9 fonde la propriété d'une session sur `interviews.conducted_by`, et le
// serveur ne croit jamais un propriétaire annoncé par le client. Un identifiant
// inventé localement produirait donc `forbidden` au premier push : une journée
// d'entretiens bloquée dans l'outbox, découverte le soir. `auditeur.ts` l'écrit
// déjà en toutes lettres — ce module ne fait que lui obéir.
//
// L'identité vient donc de la SEULE source qui en a une : `POST /v1/auth/login`
// (05 §8.1, route livrée en L2), dont la réponse porte `userId` et rien d'autre
// de l'utilisateur — décision de `packages/shared/src/auth.ts`, citée telle
// quelle : « sans `userId` ici, la PWA terrain n'aurait AUCUN moyen de savoir à
// quel compte appartiennent ses données locales ».
//
// ── CE QUE CELA NE FAIT PAS À L'INVARIANT 1 ─────────────────────────────────
// La collecte reste 100 % hors ligne. Le rattachement est un PROVISIONNEMENT :
// une fois, au bureau, comme l'embarquement d'une mission. 05 §31-3 décrit
// d'ailleurs l'après — « si le refresh token expire pendant une longue période
// hors ligne, le déverrouillage local continue de fonctionner » — ce qui suppose
// une connexion antérieure. Ce qu'un appareil jamais connecté ne peut pas faire
// est dit à l'écran, pas contourné (`DECISIONS.md`, 2026-09-06).
//
// ── LE PROFIL N'EST PAS DEVINÉ ──────────────────────────────────────────────
// `login` ne rend pas `users.usage_profile` (minimisation, 06 §10.4). Le profil
// vaut donc `PROFIL_PAR_DEFAUT` — `guide_strict`, « le plus STRICT, aucune
// dérogation » (03 §19.1) — jusqu'à ce que le pull de L6a apporte le vrai. Un
// profil trop strict coûte des confirmations ; un profil trop permissif retire
// des garde-fous à un auditeur qui n'y a pas droit.
//
// ── INVARIANT 7 : UN SECOND AUDITEUR EST REFUSÉ, PAS ÉCRASÉ ─────────────────
// Un appareil déjà rattaché porte des sessions dont l'auteur est immuable
// (03 §34.4-4 : « les sessions RÉALISÉES restent à leur auteur »). Écraser
// l'identité ferait signer par un second auditeur des lignes écrites par le
// premier — silencieusement, et sans qu'aucune sync ne puisse le rattraper. Le
// rattachement REFUSE, et dit quoi faire.
//
// Traçabilité : E33 (sécurité / RGPD), E6 (hors ligne total), E23 (novice).
// =============================================================================
import {
  apiErrorSchema,
  loginRequestSchema,
  loginResponseSchema,
  type AuthSession,
} from '@axion/shared';
import type { BaseLocale } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import { maintenant } from '../local/horloge.js';
import { enregistrerJetonRafraichissement } from '../local/jetons.js';
import {
  lireIdentiteAuditeur,
  memoriserIdentiteAuditeur,
  PROFIL_PAR_DEFAUT,
  type IdentiteAuditeur,
} from '../session/auditeur.js';

/**
 * L'unique URL que ce module connaît.
 *
 * Même origine, jamais de CORS (11 §2 : Caddy sert `/` , `/hq` et `/api` sous le
 * même domaine) ; Caddy retire `/api`, l'API voit `/v1/auth/login`.
 */
export const CHEMIN_CONNEXION = '/api/v1/auth/login';

/** Le siège n'a pas répondu du tout : pas de réseau, DNS, serveur absent. */
export class SiegeInjoignableError extends Error {
  readonly action =
    'Rapprochez-vous d’une connexion (Wi-Fi ou partage de connexion) et réessayez. Aucune donnée de cet appareil n’a été modifiée.';

  constructor(cause: unknown) {
    super('Le siège n’a pas répondu depuis cet appareil.', { cause });
    this.name = 'SiegeInjoignableError';
  }
}

/**
 * Le siège a répondu, et il refuse.
 *
 * Le message vient de l'enveloppe unique `{error:{code,message}}` (11 §3), qui
 * est du français prêt à afficher : le front ne réécrit pas un refus
 * d'authentification, sous peine d'inventer une cause que le serveur n'a pas
 * donnée (06 §10.2, « aucun oracle »).
 */
export class IdentifiantsRefusesError extends Error {
  readonly statut: number;
  readonly action = 'Vérifiez l’adresse et le mot de passe de votre compte, puis réessayez.';

  constructor(message: string, statut: number) {
    super(message);
    this.name = 'IdentifiantsRefusesError';
    this.statut = statut;
  }
}

/**
 * 2xx, mais une forme que `packages/shared` ne connaît pas.
 *
 * Ce n'est ni une erreur de l'auditeur ni une panne de réseau : c'est un
 * désaccord entre l'application et l'API. On ne « répare » jamais une réponse —
 * une identité déduite d'un corps hors contrat serait exactement l'identifiant
 * fabriqué que ce module refuse.
 */
export class ReponseSiegeInattendueError extends Error {
  readonly action =
    'Signalez-le au siège : cette version de l’application et celle du serveur ne s’accordent pas. Aucune donnée n’a été modifiée.';

  constructor() {
    super('Le siège a répondu dans un format que cette version ne comprend pas.');
    this.name = 'ReponseSiegeInattendueError';
  }
}

/** Invariant 7 : cet appareil appartient déjà à quelqu'un d'autre. */
export class AutreAuditeurSurCetAppareilError extends Error {
  readonly action =
    'Cet appareil porte déjà les entretiens d’un autre auditeur. Faites-lui exporter une sauvegarde et synchroniser avant de le réutiliser, ou prenez un appareil neuf.';

  constructor() {
    super('Cet appareil est déjà rattaché à un autre auditeur.');
    this.name = 'AutreAuditeurSurCetAppareilError';
  }
}

export interface DemandeConnexion {
  /**
   * `fetch` est INJECTÉ et résolu à l'appel, comme dans la console (`apps/hq`) :
   * c'est ce qui rend ce module éprouvable sans serveur, à travers les VRAIS
   * schémas, plutôt qu'avec une forme inventée par un mock.
   */
  readonly fetch: typeof fetch;
  readonly courriel: string;
  readonly motDePasse: string;
  readonly signal?: AbortSignal;
}

/**
 * Demande une session au siège. **N'écrit rien** : la persistance est le geste
 * suivant, et il est séparé pour qu'un échec réseau ne laisse jamais l'appareil
 * à moitié rattaché.
 */
export async function connecterAuSiege(demande: DemandeConnexion): Promise<AuthSession> {
  // Le corps passe par le schéma d'ENTRÉE partagé (11 §3) : c'est lui qui rogne
  // les espaces sans toucher à la casse — une adresse normalisée d'un côté et
  // pas de l'autre fabrique un compte inaccessible (`packages/shared/auth.ts`).
  const corps = loginRequestSchema.parse({
    email: demande.courriel,
    password: demande.motDePasse,
  });

  let reponse: Response;
  try {
    reponse = await demande.fetch(CHEMIN_CONNEXION, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      ...(demande.signal ? { signal: demande.signal } : {}),
    });
  } catch (cause) {
    throw new SiegeInjoignableError(cause);
  }

  if (!reponse.ok) {
    throw new IdentifiantsRefusesError(await messageDuRefus(reponse), reponse.status);
  }

  let charge: unknown;
  try {
    charge = await reponse.json();
  } catch {
    throw new ReponseSiegeInattendueError();
  }

  const session = loginResponseSchema.safeParse(charge);
  if (!session.success) throw new ReponseSiegeInattendueError();
  return session.data;
}

/**
 * Le message d'un refus, lu dans l'enveloppe 11 §3.
 *
 * Hors enveloppe (proxy, panne), on ne devine aucun code métier : une phrase
 * neutre, en français, et le statut est conservé par l'erreur.
 */
async function messageDuRefus(reponse: Response): Promise<string> {
  let corps: unknown = null;
  try {
    corps = await reponse.json();
  } catch {
    corps = null;
  }
  const enveloppe = apiErrorSchema.safeParse(corps);
  if (enveloppe.success) return enveloppe.data.error.message;
  return 'Le siège a refusé la connexion sans en donner la raison.';
}

/** Cet appareil porte-t-il déjà une identité d'auditeur ? (coffre OUVERT requis) */
export async function identiteConnue(base: BaseLocale, coffre: Coffre): Promise<boolean> {
  return (await lireIdentiteAuditeur(base, coffre)) !== null;
}

/**
 * Range l'identité, puis le jeton. **L'ordre est un choix.**
 *
 * Si le second échoue, l'appareil sait qui il est et peut COLLECTER ; seule la
 * synchronisation attendra une reconnexion, ce que 05 §31-3 décrit mot pour mot.
 * L'ordre inverse produirait un appareil capable de synchroniser des lignes
 * qu'il ne peut pas écrire — c'est-à-dire rien.
 */
export async function rattacherAppareil(
  base: BaseLocale,
  coffre: Coffre,
  session: AuthSession,
): Promise<IdentiteAuditeur> {
  const dejaConnue = await lireIdentiteAuditeur(base, coffre);
  if (dejaConnue !== null && dejaConnue.id !== session.userId) {
    throw new AutreAuditeurSurCetAppareilError();
  }

  // Le profil déjà connu est CONSERVÉ : `login` ne le rend pas, et écraser un
  // `expert` par le défaut à chaque reconnexion serait une régression muette.
  const identite: IdentiteAuditeur = {
    id: session.userId,
    profil: dejaConnue?.profil ?? PROFIL_PAR_DEFAUT,
  };

  await memoriserIdentiteAuditeur(base, coffre, identite);
  await enregistrerJetonRafraichissement(base, coffre, {
    valeur: session.refreshToken,
    expireLe: session.refreshExpiresAt,
    enregistreLe: maintenant(),
  });

  return identite;
}
