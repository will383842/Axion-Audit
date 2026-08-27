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
import { config, estDev } from './config.js';

/**
 * Chemins masqués. La liste couvre les trois familles de fuite :
 *   1. identités des interviewés (person_name, email, téléphone) ;
 *   2. contenus de réponse et verbatims (le cœur de la collecte) ;
 *   3. secrets d'authentification (jetons, mots de passe, en-têtes).
 * `*` traverse un niveau, `[*]` un tableau : les chemins profonds sont couverts
 * explicitement parce que pino ne fait PAS de correspondance récursive.
 */
const CHEMINS_MASQUES = [
  // 1 — identités
  'person_name',
  'personName',
  '*.person_name',
  '*.personName',
  'email',
  '*.email',
  '*.*.email',
  'phone',
  '*.phone',
  'interviewee',
  '*.interviewee',

  // 2 — contenus de collecte
  'answer',
  '*.answer',
  'answers',
  '*.answers',
  'value_text',
  '*.value_text',
  'valueText',
  '*.valueText',
  'note',
  '*.note',
  'notes',
  '*.notes',
  'verbatim',
  '*.verbatim',
  'payload',
  '*.payload',

  // 3 — secrets
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'refreshToken',
  '*.refreshToken',
  'accessToken',
  '*.accessToken',
  'secret',
  '*.secret',
];

export const logger: Logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: CHEMINS_MASQUES,
    censor: '[masqué:rgpd]',
    remove: false,
  },
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
