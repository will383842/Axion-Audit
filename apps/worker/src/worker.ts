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
// déclarés dans `files.ts` pour que l'ajout d'un job soit une ligne, pas une refonte.
// Voir DECISIONS.md 2026-08-27 « Squelette applicatif minimal ».
// Traçabilité : E17 (stack imposée), E35 (scalabilité : exploitation).
// =============================================================================
import { Queue, Worker, type Processor } from 'bullmq';
import { pino } from 'pino';
import { chargerEnv, envServeurSchema, OPTIONS_REDACTION_JOURNAL } from '@axion/shared';
import {
  cleDeBattement,
  IDENTITE_INSTANCE,
  INTERVALLE_BATTEMENT_MS,
  NOMS_DE_FILES,
  PREFIXE_REDIS,
  TTL_BATTEMENT_SECONDES,
} from './files.js';

const config = chargerEnv(envServeurSchema, process.env);

const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'worker', env: config.APP_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Politique de redaction PARTAGÉE avec l'API (packages/shared/src/redaction.ts).
  // Elle a d'abord été dupliquée ici, et la copie du worker était plus COURTE de dix
  // champs — dont `password`, `token` et `phone`. Or c'est le worker qui manipule les
  // réponses d'entretien pour la génération et les appels LLM : la fuite y aurait été
  // la plus fournie. Deux copies d'une même politique RGPD divergent toujours.
  redact: { ...OPTIONS_REDACTION_JOURNAL, paths: [...OPTIONS_REDACTION_JOURNAL.paths] },
});

// Une file `axion:sauvegardes` a existé ici, annotée « 02 §11.4 ». Le gardien A02 est
// allé LIRE le §11.4 : il décrit pgBackRest, l'archivage WAL, la copie chiffrée et le
// test de restauration nocturne — du cron et des scripts d'infrastructure, jamais un
// job applicatif. Aucun lot du pack ne prévoit de sauvegarde pilotée par l'application,
// et la ligne L0 confie explicitement celle de MinIO à `mc mirror`
// (`infra/scripts/backup-minio.sh`). C'était donc du code ORPHELIN, refusé par la règle
// 09 §3.6 : « toute route, table, écran ou job livré se rattache à une exigence E1-E47
// OU à une fiche AMELIORATIONS.md ». Supprimée.
// La leçon vaut au-delà de cette ligne : une annotation de traçabilité qui CITE une
// section n'est une preuve que si quelqu'un ouvre la section.

const connexionRedis = { url: config.REDIS_URL };

/**
 * Options communes aux files ET aux travailleurs. `prefix` est le SEUL endroit où
 * « axion » doit apparaître : le mettre dans le nom faisait planter BullMQ 5 au
 * constructeur (voir l'encadré de `files.ts`).
 */
const optionsCommunes = { connection: connexionRedis, prefix: PREFIXE_REDIS };

/** Files instanciées à la demande par les lots concernés. */
export const files = Object.fromEntries(
  Object.entries(NOMS_DE_FILES).map(([cle, nom]) => [cle, new Queue(nom, optionsCommunes)]),
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
      ...optionsCommunes,
      // BullMQ nomme la connexion Redis bloquante de CHAQUE travailleur
      // `axion:<file en base64>:w:<name>` (`classes/worker.js`, `connectionName`).
      // En y mettant l'identité de l'instance, la sonde peut distinguer NOTRE
      // travailleur de celui d'un autre conteneur branché sur le même Redis.
      name: IDENTITE_INSTANCE,
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

// -----------------------------------------------------------------------------
// BATTEMENT DE CŒUR — le signe sur lequel la sonde de santé s'appuie.
//
// Une sonde qui compte les processus `node` ment : en développement, `tsc --watch`
// tourne à côté du worker et suffit à la satisfaire. C'est ce mensonge qui a laissé
// `docker ps` afficher « Up 13 hours (healthy) » sur un worker mort au démarrage.
// Un battement écrit PAR CE PROCESSUS, avec expiration automatique, ne peut pas être
// produit par un autre : ni par le compilateur, ni par un processus figé, ni par un
// conteneur voisin (la clé porte l'identité de l'instance).
// -----------------------------------------------------------------------------
async function publierBattement(): Promise<void> {
  try {
    // On emprunte la connexion (non bloquante) d'une file déjà ouverte plutôt que d'en
    // ouvrir une sixième : le battement doit coûter moins cher que ce qu'il surveille.
    const client = await files.rapports.client;
    await client.set(cleDeBattement(), new Date().toISOString(), {
      EX: TTL_BATTEMENT_SECONDES,
    });
  } catch (err) {
    // On journalise sans relancer : c'est l'EXPIRATION de la clé qui doit faire virer
    // la sonde au rouge. Tuer le worker parce qu'un battement a raté transformerait une
    // micro-coupure Redis en redémarrage, avec les jobs en vol pour victimes.
    logger.error({ err }, 'Échec de publication du battement de cœur');
  }
}

const minuterieBattement = setInterval(() => {
  void publierBattement();
}, INTERVALLE_BATTEMENT_MS);
void publierBattement();

async function arreterProprement(signal: string): Promise<void> {
  logger.info({ signal }, 'Arrêt demandé — fermeture propre du worker');
  clearInterval(minuterieBattement);
  try {
    // Ordre important : on ferme d'abord les travailleurs (ils finissent le job en
    // cours) et seulement ensuite les files. L'inverse couperait un job en vol —
    // exactement le scénario « crash du worker en pleine génération » que A45 doit
    // pouvoir tester comme une PANNE, pas comme un comportement normal.
    await Promise.all(travailleurs.map((t) => t.close()));
    // Le battement s'efface AVANT la fermeture des files (il lui faut leur connexion) :
    // un worker arrêté volontairement devient rouge tout de suite, sans attendre les
    // vingt secondes du TTL.
    await (await files.rapports.client).del(cleDeBattement());
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
  {
    files: Object.values(NOMS_DE_FILES),
    prefixe: PREFIXE_REDIS,
    instance: IDENTITE_INSTANCE,
    env: config.APP_ENV,
  },
  'Worker Axion Audit démarré (aucun traitement implémenté au lot L0)',
);
