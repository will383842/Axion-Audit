// =============================================================================
// CROCHET ① — IDENTIFICATION. Lot L2, tâche T1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LE POINT À NE JAMAIS INVERSER : CE CROCHET NE REFUSE JAMAIS.
// ═══════════════════════════════════════════════════════════════════════════════
// Il vérifie le jeton et pose l'identité — ou rien. Il ne rend AUCUN 401.
//
// Pourquoi (note de conception L2 §2.1) : l'ordre des crochets est
// ① identification → ② quota → ③ autorisation. Si ① refusait, un flot de jetons
// invalides serait rejeté AVANT le compteur de quota : le quota ne le verrait plus,
// et une attaque par jetons bidons deviendrait NON BORNÉE — gratuite, illimitée, et
// invisible dans les compteurs. Le refus appartient à ③, qui s'exécute après ②.
//
// L'échec d'identification n'est pas perdu pour autant : il est MÉMORISÉ sur la
// requête (`echecIdentification`) et relevé par ③ si la route exige une identité.
// C'est ce qui permet de rendre `TOKEN_EXPIRED` plutôt qu'un `UNAUTHENTICATED`
// générique — donc au terrain de rafraîchir au lieu de faire ressaisir un mot de
// passe en clientèle.
//
// Sur une route PUBLIQUE (login, refresh, sondes), un jeton périmé traîné par le
// client est simplement IGNORÉ : refuser un login parce que l'ancien jeton a expiré
// serait un verrou qui s'auto-alimente.
// Traçabilité : E33 (sécurité : authentification, 06 §10.1-10.2).
// =============================================================================
import type { FastifyInstance, FastifyRequest, onRequestHookHandler } from 'fastify';
import { AppError } from '@axion/shared';
import { verifierJetonAcces } from './jetons.js';
import { MESSAGE_AUTH_REQUISE, traduireErreurJeton } from './erreurs-jeton.js';
import type { UtilisateurAuthentifie } from './depot.js';
import type { ContexteAdmin } from './contexte.js';

/** Identité VÉRIFIÉE portée par le jeton. Ne contient aucun droit (voir jetons.ts). */
export interface IdentiteJeton {
  readonly utilisateurId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Sujet du jeton, VÉRIFIÉ cryptographiquement, posé par ①.
     * C'est la clé du quota (§3.2) : un `sub` non vérifié laisserait forger un
     * quota illimité en changeant de jeton bidon à chaque requête.
     */
    identite: IdentiteJeton | null;
    /**
     * Droits relus EN BASE par ③. Distinct de `identite` À DESSEIN : un objet
     * utilisateur partiellement rempli est exactement la forme que prennent les
     * bugs de privilège. Tant que ③ n'a pas lu la base, il n'y a pas d'utilisateur.
     */
    utilisateur: UtilisateurAuthentifie | null;
    /** Erreur de jeton mémorisée par ① et LEVÉE par ③ — jamais par ①. */
    echecIdentification: AppError | null;
    /** Marque d'admin (étanchéité financière) posée par ③ — voir contexte.ts. */
    contexteAdmin: ContexteAdmin | null;
  }
}

const PREFIXE_BEARER = 'Bearer ';

/**
 * Pose les décorations de requête. À appeler AVANT tout crochet qui les lit.
 *
 * `null` et non un objet : Fastify 5 refuse les décorations de type référence
 * partagées entre requêtes (elles seraient le même objet pour tout le monde).
 */
export function decorerRequete(app: FastifyInstance): void {
  app.decorateRequest('identite', null);
  app.decorateRequest('utilisateur', null);
  app.decorateRequest('echecIdentification', null);
  app.decorateRequest('contexteAdmin', null);
}

/**
 * Le crochet ①. Forme à callback (`suite`) et non `async` : il n'attend rien —
 * la vérification HS256 est synchrone — et une fonction `async` sans `await` est
 * refusée par le lint (`require-await`) à juste titre.
 */
export const identification: onRequestHookHandler = function identification(
  requete: FastifyRequest,
  _reponse,
  suite,
): void {
  const entete = requete.headers.authorization;

  // Aucun en-tête : ce n'est pas une erreur. Une route publique s'en contente, une
  // route protégée sera refusée par ③ avec `UNAUTHENTICATED`.
  if (entete === undefined || entete === '') {
    suite();
    return;
  }

  if (!entete.startsWith(PREFIXE_BEARER)) {
    // 11 §3 : le terrain, c'est du Bearer. Tout autre schéma est un jeton invalide,
    // pas une négociation. On ne dit pas lequel on attendait (06 §10.2).
    requete.echecIdentification = new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
    suite();
    return;
  }

  const jeton = entete.slice(PREFIXE_BEARER.length).trim();
  if (jeton === '') {
    requete.echecIdentification = new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
    suite();
    return;
  }

  try {
    const charge = verifierJetonAcces(requete.server, jeton);
    requete.identite = { utilisateurId: charge.sub };
  } catch (erreur: unknown) {
    // `verifierJetonAcces` ne lève que des `AppError` ; `traduireErreurJeton` est le
    // filet si une bibliothèque venait à lever autre chose. Dans TOUS les cas on
    // MÉMORISE — on ne lève pas : voir l'en-tête de fichier.
    requete.echecIdentification = erreur instanceof AppError ? erreur : traduireErreurJeton(erreur);
  }

  suite();
};
