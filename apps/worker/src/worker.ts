// =============================================================================
// WORKER BULLMQ — lot L0 (squelette).
//
// Rôle (02 §4.1) : génération DOCX, appels LLM par bloc, exports, purges RGPD,
// webhooks console. Principe intangible (02 §11.1) : « la génération LLM/DOCX →
// asynchrone par le worker, JAMAIS dans le cycle requête ».
//
// PÉRIMÈTRE L0 : le processus démarre, se connecte à Redis, expose sa vivacité et
// s'arrête proprement. AUCUNE file n'est encore traitée — les jobs arrivent avec
// leurs lots (L10 DOCX, L11 LLM, L13 webhooks, purges RGPD). Les noms de files sont
// déclarés ici pour que l'ajout d'un job soit une ligne, pas une refonte.
// Voir DECISIONS.md 2026-08-27 « Squelette applicatif minimal ».
// Traçabilité : E17 (stack imposée), E35 (exploitation).
// =============================================================================
import { Queue, Worker, type Processor } from 'bullmq';
import { pino } from 'pino';
import { chargerEnv, envServeurSchema } from '@axion/shared';

const config = chargerEnv(envServeurSchema, process.env);

const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'worker', env: config.APP_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Même exigence que l'API (11 §2) : aucune donnée personnelle dans les journaux.
  // Le worker manipule des réponses d'entretien pour la génération : c'est le
  // processus où une fuite de journal serait la plus fournie.
  redact: {
    paths: [
      'person_name',
      '*.person_name',
      'email',
      '*.email',
      'answer',
      '*.answer',
      'answers',
      '*.answers',
      'note',
      '*.note',
      'verbatim',
      '*.verbatim',
      'payload',
      '*.payload',
      'prompt',
      '*.prompt',
    ],
    censor: '[masqué:rgpd]',
  },
});

/**
 * Files déclarées. Une file par NATURE de travail, jamais une file fourre-tout :
 * une purge RGPD qui attend derrière une génération DOCX de dix minutes est un
 * défaut de conformité, pas un défaut de performance.
 */
export const NOMS_DE_FILES = {
  /** L10 — génération DOCX (jobs idempotents et rejouables). */
  rapports: 'axion:rapports',
  /** L11 — appels LLM par bloc, avec journal des coûts. */
  llm: 'axion:llm',
  /** L7 — exports de mission (format §36.3). */
  exports: 'axion:exports',
  /** 06 §10.4 — purges de rétention, planifiées et journalisées. */
  purges: 'axion:purges',
  /** L13 — webhooks console axion-ia.com (HMAC + anti-rejeu). */
  webhooks: 'axion:webhooks',
  /** 02 §11.4 — sauvegardes MinIO pilotées depuis l'application. */
  sauvegardes: 'axion:sauvegardes',
} as const;

const connexionRedis = { url: config.REDIS_URL };

/** Files instanciées à la demande par les lots concernés. */
export const files = Object.fromEntries(
  Object.entries(NOMS_DE_FILES).map(([cle, nom]) => [
    cle,
    new Queue(nom, { connection: connexionRedis }),
  ]),
) as Record<keyof typeof NOMS_DE_FILES, Queue>;

/**
 * Processeur d'attente. Il n'existe AUCUN job à traiter au lot L0 : recevoir un job
 * ici est donc un symptôme (file mal nommée, reliquat d'un environnement partagé),
 * pas un cas nominal — d'où l'échec explicite plutôt qu'un silence poli.
 */
const processeurNonImplemente: Processor = (job) => {
  logger.error(
    { file: job.queueName, jobId: job.id, nom: job.name },
    "Job reçu alors qu'aucun traitement n'est implémenté (lot L0)",
  );
  return Promise.reject(
    new Error(
      `Aucun traitement pour « ${job.name} » sur la file « ${job.queueName} » : ` +
        'les jobs arrivent avec leurs lots (L10 DOCX, L11 LLM, L13 webhooks).',
    ),
  );
};

const travailleurs = Object.values(NOMS_DE_FILES).map(
  (nom) =>
    new Worker(nom, processeurNonImplemente, {
      connection: connexionRedis,
      // Le VPS V1 a 4 vCPU (02 §11.1) et partage la machine avec Postgres et l'API :
      // une concurrence modeste par file vaut mieux qu'un worker qui affame la base.
      concurrency: 2,
    }),
);

for (const travailleur of travailleurs) {
  travailleur.on('failed', (job, err) => {
    logger.error({ file: travailleur.name, jobId: job?.id, err }, 'Job en échec');
  });
  travailleur.on('error', (err) => {
    logger.error({ file: travailleur.name, err }, 'Erreur du travailleur');
  });
}

async function arreterProprement(signal: string): Promise<void> {
  logger.info({ signal }, 'Arrêt demandé — fermeture propre du worker');
  try {
    // Ordre important : on ferme d'abord les travailleurs (ils finissent le job en
    // cours) et seulement ensuite les files. L'inverse couperait un job en vol —
    // exactement le scénario « crash du worker en pleine génération » que A45 doit
    // pouvoir tester comme une PANNE, pas comme un comportement normal.
    await Promise.all(travailleurs.map((t) => t.close()));
    await Promise.all(Object.values(files).map((f) => f.close()));
    logger.info('Worker arrêté proprement');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Échec de l'arrêt propre");
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void arreterProprement(signal);
  });
}

logger.info(
  { files: Object.values(NOMS_DE_FILES), env: config.APP_ENV },
  'Worker Axion Audit démarré (aucun traitement implémenté au lot L0)',
);
