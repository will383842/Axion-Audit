// =============================================================================
// JOURNALISATION — pino 9 (11 §1) avec REDACTION OBLIGATOIRE.
//
// Contrat 11 §2 : « Aucune donnée personnelle dans les logs : person_name, emails et
// contenus de réponse INTERDITS dans pino (redaction configurée) — cohérent §10. »
// RGPD 06 §10.4 : les identités ne circulent pas hors de leur finalité.
//
// La redaction est posée ICI, une fois, sur l'instance racine : aucun appelant ne
// peut l'oublier. C'est le seul moyen fiable — compter sur la discipline de chaque
// agent à chaque `log.info()` ne marcherait pas.
// Traçabilité : E33, E42 (RGPD renforcé).
// =============================================================================
import { pino, type Logger } from 'pino';
import type { FastifyBaseLogger } from 'fastify';
import { OPTIONS_REDACTION_JOURNAL } from '@axion/shared';
import { config, estDev } from './config.js';

export const logger: Logger = pino({
  level: config.LOG_LEVEL,
  // Politique de redaction PARTAGÉE avec le worker (packages/shared/src/redaction.ts).
  // Elle est posée ici, sur l'instance RACINE : aucun appelant ne peut l'oublier.
  // Compter sur la discipline de chaque `log.info()` ne tiendrait pas.
  //
  // La politique n'est PAS une liste de chemins `*.champ` : son `censor` est une
  // fonction, appelée par pino une fois par clé racine ET sur `msg`, qui parcourt le
  // sous-arbre. Deux conséquences à connaître avant d'y toucher :
  //   · la couverture ne dépend plus de la profondeur déclarée — `{a:{b:{c:{email}}}}`
  //     est masqué comme `{email}` ;
  //   · toute chaîne journalisée est nettoyée de ses e-mails, jetons porteurs, numéros
  //     de téléphone et paramètres de requête sensibles, `req.url` et `err.message`
  //     compris — sans être masquée, pour rester diagnosticable (06 §10.2).
  // Les détails et l'arbitrage sont en tête de packages/shared/src/redaction.ts.
  redact: { ...OPTIONS_REDACTION_JOURNAL, paths: [...OPTIONS_REDACTION_JOURNAL.paths] },
  base: {
    service: 'api',
    env: config.APP_ENV,
  },
  // Invariant 5 : horodatage UTC en ISO 8601, jamais l'heure locale du serveur.
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  // En développement, une sortie lisible aide ; en staging/prod, du JSON structuré
  // pour l'agrégation (02 §11.3). `pino-pretty` n'est PAS une dépendance de
  // production : s'il est absent, on retombe sur le JSON sans planter.
  ...(estDev && process.env.PINO_PRETTY === '1'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
    : {}),
});

/**
 * La MÊME instance, vue comme le type que Fastify attend.
 * Fastify infère le générique de son instance depuis la valeur passée à
 * `loggerInstance` : lui donner directement le `Logger` de pino narrowerait toute
 * l'application sur ce type et rendrait incompatibles les plugins écrits contre
 * `FastifyBaseLogger`. On élargit donc UNE FOIS, ici, par annotation — pas par
 * assertion : aucun mensonge de type, juste un élargissement légitime.
 */
export const loggerFastify: FastifyBaseLogger = logger;
