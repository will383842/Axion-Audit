// =============================================================================
// GESTIONNAIRE D'ERREURS UNIQUE — contrat 11 §3.
// « Erreurs : format unique { error: { code, message, details? } } + statut HTTP
//   cohérent. Les codes vivent dans packages/shared — jamais de littéral libre. »
//
// Toute réponse d'erreur de l'API passe par ici. Une route qui construirait son
// enveloppe à la main serait un écart : la revue croisée (étape 4) le refuse.
// Traçabilité : E43.
// =============================================================================
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES, HTTP_STATUS_BY_ERROR_CODE, type ApiError } from '@axion/shared';

function enveloppe(code: keyof typeof ERROR_CODES, message: string): ApiError {
  return { error: { code: ERROR_CODES[code], message } };
}

export function enregistrerGestionErreurs(app: FastifyInstance): void {
  // --- 404 : ressource inconnue --------------------------------------------
  app.setNotFoundHandler((_requete: FastifyRequest, reponse: FastifyReply) => {
    return reponse
      .code(HTTP_STATUS_BY_ERROR_CODE.NOT_FOUND)
      .send(enveloppe('NOT_FOUND', "La ressource demandée n'existe pas."));
  });

  // --- Toutes les autres erreurs -------------------------------------------
  app.setErrorHandler((erreur: FastifyError, requete: FastifyRequest, reponse: FastifyReply) => {
    // 1. Erreur applicative : elle porte déjà son code et son statut.
    if (erreur instanceof AppError) {
      requete.log.warn({ code: erreur.code, url: requete.url }, 'Erreur applicative');
      return reponse.code(erreur.status).send(erreur.toResponse());
    }

    // 2. Échec de validation Zod : on rend le chemin fautif, pas la VALEUR fautive
    //    (elle peut contenir une donnée personnelle — 11 §2).
    if (erreur instanceof ZodError) {
      requete.log.warn(
        { url: requete.url, champs: erreur.issues.map((i) => i.path.join('.')) },
        'Validation refusée',
      );
      return reponse.code(HTTP_STATUS_BY_ERROR_CODE.VALIDATION_FAILED).send({
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Les données envoyées sont invalides.',
          details: erreur.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
      } satisfies ApiError);
    }

    // 3. Dépassement de quota (@fastify/rate-limit).
    if (erreur.statusCode === 429) {
      return reponse
        .code(HTTP_STATUS_BY_ERROR_CODE.RATE_LIMITED)
        .send(enveloppe('RATE_LIMITED', 'Trop de requêtes. Réessayez dans un instant.'));
    }

    // 4. Corps trop volumineux.
    if (erreur.statusCode === 413) {
      return reponse
        .code(HTTP_STATUS_BY_ERROR_CODE.PAYLOAD_TOO_LARGE)
        .send(enveloppe('PAYLOAD_TOO_LARGE', 'Le contenu envoyé est trop volumineux.'));
    }

    // 5. Erreur de parsing d'entrée (JSON malformé) — c'est la faute du client.
    if (
      typeof erreur.statusCode === 'number' &&
      erreur.statusCode >= 400 &&
      erreur.statusCode < 500
    ) {
      requete.log.warn({ err: erreur, url: requete.url }, 'Requête refusée');
      return reponse
        .code(HTTP_STATUS_BY_ERROR_CODE.INVALID_PAYLOAD)
        .send(enveloppe('INVALID_PAYLOAD', 'La requête est mal formée.'));
    }

    // 6. Tout le reste est un défaut du serveur. Le détail va au journal, JAMAIS au
    //    client : un message d'erreur bavard est une aide à l'attaquant (06 §10.2).
    requete.log.error({ err: erreur, url: requete.url }, 'Erreur interne non gérée');
    return reponse
      .code(HTTP_STATUS_BY_ERROR_CODE.INTERNAL_ERROR)
      .send(enveloppe('INTERNAL_ERROR', 'Une erreur interne est survenue.'));
  });
}
