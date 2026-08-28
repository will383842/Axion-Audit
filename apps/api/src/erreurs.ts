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
import {
  AppError,
  ERROR_CODES,
  HTTP_STATUS_BY_ERROR_CODE,
  appliquerLocaleFrancaiseZod,
  messageValidationFrancais,
  type ApiError,
} from '@axion/shared';

function enveloppe(code: keyof typeof ERROR_CODES, message: string): ApiError {
  return { error: { code: ERROR_CODES[code], message } };
}

// -----------------------------------------------------------------------------
// TABLE DES ERREURS CLIENT (4xx) PORTÉES PAR UN `statusCode`
// -----------------------------------------------------------------------------
// CE QUE CETTE TABLE CORRIGE — un défaut latent, mesuré, pas une refonte de confort.
//
// Jusqu'ici, une SEULE branche traitait tout le 4xx non reconnu et le rendait
// systématiquement `400 INVALID_PAYLOAD`. Trois conséquences :
//
//   1. Les erreurs d'authentification (statut 401) et d'autorisation (403) — celles
//      que lèvent `@fastify/jwt` et le crochet d'autorisation du lot L2 — sortaient
//      en **400**. Le front ne pouvait plus distinguer « reconnecte-toi » de
//      « requête malformée » : la PWA terrain aurait affiché « données invalides »
//      à un auditeur dont le jeton avait simplement expiré, et le critère
//      d'acceptation « → forbidden » devenait INFALSIFIABLE (tout sortait en 400,
//      y compris ce qui aurait dû être un refus de droits).
//   2. `UNSUPPORTED_MEDIA_TYPE` (415) était déclaré dans `ERROR_CODES` et
//      strictement INATTEIGNABLE : Fastify lève bien un 415 sur un `Content-Type`
//      inconnu, mais la branche fourre-tout le réécrivait en 400.
//   3. Le piège restait armé pour le prochain greffon : tout plugin qui lève un
//      statut client se serait fait aplatir de la même façon.
//
// D'où une TABLE plutôt que trois `if` de plus : le statut ne se perd plus en
// chemin, et ajouter un cas est une ligne de données, pas une branche de code.
//
// CE QUI N'Y FIGURE PAS, ET POURQUOI :
//   · 404 et 409 — le 404 est servi par `setNotFoundHandler` (ci-dessous) et les
//     conflits métier sont levés en `AppError` par le code applicatif, qui porte
//     déjà son code. Les faire entrer ici les rendrait atteignables par un plugin
//     tiers sans qu'aucune route ne les ait voulus.
//   · tout autre 4xx — il retombe sur `INVALID_PAYLOAD`, exactement comme avant :
//     ce défaut se corrige, il ne s'élargit pas.
// -----------------------------------------------------------------------------
interface ReponseClient {
  readonly code: keyof typeof ERROR_CODES;
  /** Message FRANÇAIS affichable tel quel (invariant 5). */
  readonly message: string;
}

const REPONSE_PAR_STATUT_CLIENT: ReadonlyMap<number, ReponseClient> = new Map<
  number,
  ReponseClient
>([
  [400, { code: 'INVALID_PAYLOAD', message: 'La requête est mal formée.' }],
  [
    401,
    {
      code: 'UNAUTHENTICATED',
      // 06 §10.2 : on ne dit JAMAIS ce qui a échoué (jeton absent, expiré, signature
      // invalide, compte inconnu). Le code distingue déjà `TOKEN_EXPIRED` quand le
      // crochet d'identification a pu le déterminer ; ici, c'est le filet.
      message: 'Authentification requise.',
    },
  ],
  [
    403,
    {
      code: 'FORBIDDEN',
      message: "Vous n'avez pas les droits nécessaires pour cette action.",
    },
  ],
  [413, { code: 'PAYLOAD_TOO_LARGE', message: 'Le contenu envoyé est trop volumineux.' }],
  [
    415,
    {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: "Le format de contenu envoyé n'est pas pris en charge.",
    },
  ],
  [429, { code: 'RATE_LIMITED', message: 'Trop de requêtes. Réessayez dans un instant.' }],
]);

const REPONSE_CLIENT_PAR_DEFAUT: ReponseClient = {
  code: 'INVALID_PAYLOAD',
  message: 'La requête est mal formée.',
};

export function enregistrerGestionErreurs(app: FastifyInstance): void {
  // Invariant 5 — « Interface 100 % en français ». `details[].message` est recopié de
  // Zod et affiché TEL QUEL par la PWA terrain : sans cet appel, l'auditeur lisait
  // « Too small: expected number to be >=1 ». La locale `fr` est fournie par Zod 4
  // lui-même (aucune dépendance ajoutée). Elle est déjà posée par l'import de
  // `@axion/shared` ; on l'appelle ICI parce que c'est ce fichier qui produit les
  // messages, et qu'un effet de bord d'import survit mal à une réorganisation.
  appliquerLocaleFrancaiseZod();

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
          // Le CODE ne se traduit jamais : c'est lui que le front teste (11 §3).
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Les données envoyées sont invalides.',
          details: erreur.issues.map((i) => ({
            path: i.path.join('.'),
            // Le MESSAGE, lui, est de l'interface (invariant 5) : locale `fr` de Zod,
            // plus le filet `messageValidationFrancais` pour un littéral resté anglais.
            message: messageValidationFrancais(i.message),
          })),
        },
      } satisfies ApiError);
    }

    // 3. Erreur CLIENT portant un statut (4xx) : quota, corps trop gros, JSON
    //    malformé, `Content-Type` inconnu — et, depuis le lot L2, tout refus
    //    d'authentification (401) ou de droits (403) levé par un plugin.
    //    Le statut d'origine est CONSERVÉ : voir la table ci-dessus.
    if (
      typeof erreur.statusCode === 'number' &&
      erreur.statusCode >= 400 &&
      erreur.statusCode < 500
    ) {
      const { code, message } =
        REPONSE_PAR_STATUT_CLIENT.get(erreur.statusCode) ?? REPONSE_CLIENT_PAR_DEFAUT;

      if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') {
        // On journalise le REFUS (signal de sécurité utile) mais PAS `err` : le
        // message d'une bibliothèque de jetons peut recopier l'en-tête reçu, donc
        // le jeton porteur lui-même (11 §2 — rien de personnel dans les journaux).
        requete.log.warn({ code, statut: erreur.statusCode, url: requete.url }, 'Accès refusé');
      } else if (code === 'INVALID_PAYLOAD') {
        // Ici le détail EST le diagnostic (JSON malformé) et ne porte pas d'identité.
        requete.log.warn({ err: erreur, url: requete.url }, 'Requête refusée');
      }
      // 413 et 429 restent muets : le quota est déjà tracé par `onExceeded` (app.ts),
      // et un corps trop volumineux n'apprend rien de plus que son statut.

      return reponse.code(HTTP_STATUS_BY_ERROR_CODE[code]).send(enveloppe(code, message));
    }

    // 4. Tout le reste est un défaut du serveur. Le détail va au journal, JAMAIS au
    //    client : un message d'erreur bavard est une aide à l'attaquant (06 §10.2).
    requete.log.error({ err: erreur, url: requete.url }, 'Erreur interne non gérée');
    return reponse
      .code(HTTP_STATUS_BY_ERROR_CODE.INTERNAL_ERROR)
      .send(enveloppe('INTERNAL_ERROR', 'Une erreur interne est survenue.'));
  });
}
