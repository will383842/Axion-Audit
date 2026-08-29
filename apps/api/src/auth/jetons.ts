// =============================================================================
// FRAPPE ET VÉRIFICATION DES JETONS D'ACCÈS — lot L2, tâche T1.
//
// Contrat 11 §3 : « terrain (`apps/field`) = Bearer + refresh token stocké CHIFFRÉ
// dans Dexie. Access 15 min / refresh 30 j rotatif avec détection de réutilisation. »
// 05 §8.1 : `POST /v1/auth/login` rend `{access(15min), refresh(30j, rotatif)}`.
//
// PÉRIMÈTRE DE CE FICHIER : le jeton d'ACCÈS (JWT HS256) uniquement.
// Le jeton de RAFRAÎCHISSEMENT est opaque (256 bits aléatoires, jamais un JWT) et
// vit avec son dépôt au lot L2/T2 : la colonne s'appelle `token_hash` parce qu'un
// secret opaque se recherche par empreinte, là où un JWT invite à faire confiance à
// ses claims — donc à sauter la lecture en base, qui EST la détection de réutilisation
// (note de conception L2 §2.3).
// Traçabilité : E5 (RBAC serveur), E43.
// =============================================================================
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@axion/shared';
import { config } from '../config.js';
import { MESSAGE_AUTH_REQUISE, traduireErreurJeton } from './erreurs-jeton.js';

// La reconnaissance des erreurs de jeton VIT dans `erreurs-jeton.ts` : le
// gestionnaire d'erreurs central en a besoin et ne doit PAS pour autant dépendre de
// `config.ts` (voir l'en-tête de ce module). Elle reste exportée ICI parce que c'est
// l'adresse naturelle de tout ce qui concerne les jetons — un seul point d'entrée
// pour les appelants, une seule définition.
export { traduireErreurJeton, reconnaitreErreurDeJeton } from './erreurs-jeton.js';

/**
 * CE QUE LE JETON PORTE — et rien d'autre.
 *
 * Note de conception L2 §2.1 : « Le jeton porte l'identité, JAMAIS les droits. »
 * Ni `role`, ni `is_active`, ni `habilitated_at` : 06 §10.1 exige des comptes
 * « désactivables instantanément », ce qu'un jeton auto-suffisant de 15 minutes ne
 * peut pas offrir. Les droits sont relus dans `users` à chaque requête authentifiée
 * (voir `politique.ts`, crochet ③). Un jeton grossi de droits serait une révocation
 * qui arrive avec un quart d'heure de retard.
 */
export const chargeUtileJetonAccesSchema = z.object({
  /** Identifiant de l'utilisateur (UUID v7 de `users.id`). */
  sub: z.uuid(),
  /** Émission et expiration posées par la bibliothèque, en secondes UNIX. */
  iat: z.number().int(),
  exp: z.number().int(),
});

export type ChargeUtileJetonAcces = z.infer<typeof chargeUtileJetonAccesSchema>;

// Ce schéma n'est PAS un schéma d'entrée/sortie de route : il décrit une structure
// interne au serveur, jamais échangée telle quelle avec un front. Il n'a donc pas sa
// place dans `packages/shared` (11 §3 vise « chaque route déclare son schéma Zod
// in/out ») — et l'y mettre ferait croire au front qu'il peut lire le jeton.

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /** Ce qu'on SIGNE : l'identité seule. `iat`/`exp` sont ajoutés par la lib. */
    payload: { sub: string };
    /** Ce qu'on RELIT : la charge utile complète, validée par Zod avant usage. */
    user: ChargeUtileJetonAcces;
  }
}

/**
 * FENÊTRE DE GRÂCE SUR LA ROTATION DES JETONS DE RAFRAÎCHISSEMENT — PROVISOIRE.
 *
 * ── Le problème (note de conception L2 §2.3 et §6.1) ────────────────────────────
 * `refresh_tokens` ne porte AUCUNE colonne de lignée. Deux rafraîchissements
 * concurrents avec le même jeton — onglet dupliqué, ou réponse HTTP perdue puis
 * rejouée par un réseau de chantier — font passer le second pour une RÉUTILISATION.
 * Sans fenêtre de grâce, l'auditeur est déconnecté de TOUS ses appareils, en pleine
 * mission, pour une perte de paquet.
 *
 * ── L'arbitrage (A01, 2026-08-29) : ACCORDÉE, 60 s, À TITRE INTERMÉDIAIRE ───────
 * Un jeton révoqué par une rotation RÉUSSIE de moins de 60 secondes rend
 * `TOKEN_EXPIRED` sans révoquer la famille.
 *
 * ── CE QUE ÇA COÛTE, ÉCRIT ICI POUR QU'ON NE L'OUBLIE PAS ──────────────────────
 * Pendant ces 60 secondes, un jeton RÉELLEMENT VOLÉ peut être utilisé UNE FOIS sans
 * être détecté. La détection n'intervient qu'à la rotation suivante. C'est un
 * affaiblissement délibéré de 06 §10.1, consenti contre un faux positif qui, lui,
 * est certain et fréquent.
 *
 * ── LA VRAIE CORRECTION, ET POURQUOI ELLE N'EST PAS ICI ────────────────────────
 * Une colonne de lignée (`replaced_by`) permettrait de RE-SERVIR le successeur au
 * lieu de deviner. C'est une modification du fichier 04 : escalade réservée à
 * Williams (CLAUDE.md §3-2), groupée par A01 avec les quatre colonnes qu'attend déjà
 * le lot de synchronisation.
 *
 * ── RÉEXAMEN ───────────────────────────────────────────────────────────────────
 * À la porte du lot L6a, et au plus tard le 2026-11-29. Cette constante disparaît le
 * jour où `replaced_by` existe : elle n'est pas un réglage, c'est un pansement daté.
 */
export const FENETRE_GRACE_ROTATION_MS = 60_000;

/**
 * Enregistre `@fastify/jwt` et pose les paramètres de signature/vérification.
 *
 * `algorithms: ['HS256']` n'est pas décoratif : sans liste blanche explicite, un
 * vérificateur accepte l'algorithme ANNONCÉ PAR LE JETON, ce qui est le mécanisme
 * même de la confusion d'algorithme. Le jeton ne choisit pas comment on le vérifie.
 */
export async function enregistrerJetons(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: {
      algorithm: 'HS256',
      // 11 §3 : 15 minutes. La valeur vient de l'environnement, jamais d'un littéral.
      expiresIn: config.JWT_ACCESS_TTL,
    },
    verify: {
      algorithms: ['HS256'],
      // Un jeton sans `exp` serait éternel ; un jeton sans `sub` n'identifierait
      // personne. On refuse les deux au niveau de la bibliothèque, avant Zod.
      requiredClaims: ['sub', 'exp'],
    },
  });
}

/** Frappe un jeton d'accès pour un utilisateur. Utilisé par les routes d'auth (T2). */
export function signerJetonAcces(app: FastifyInstance, utilisateurId: string): string {
  return app.jwt.sign({ sub: utilisateurId });
}

/**
 * Vérifie signature et expiration, puis VALIDE LA FORME par Zod.
 *
 * La vérification cryptographique dit « ce jeton vient bien de nous » ; elle ne dit
 * rien de ce qu'il contient. Un `sub` absent ou non-UUID passerait la signature et
 * irait chercher un utilisateur avec une clé absurde. D'où la seconde passe.
 *
 * Lève une `AppError` — jamais une erreur de bibliothèque : le gestionnaire d'erreurs
 * ne doit pas avoir à connaître `fast-jwt`.
 */
export function verifierJetonAcces(app: FastifyInstance, jeton: string): ChargeUtileJetonAcces {
  let brut: object;
  try {
    brut = app.jwt.verify<object>(jeton);
  } catch (erreur: unknown) {
    throw traduireErreurJeton(erreur);
  }

  const analyse = chargeUtileJetonAccesSchema.safeParse(brut);
  if (!analyse.success) {
    // Le jeton est authentique mais mal formé : c'est nous qui l'avons mal frappé,
    // ou le format a changé. Côté client, la seule action utile reste la reconnexion.
    throw new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
  }
  return analyse.data;
}
