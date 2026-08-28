// =============================================================================
// SONDE DE SANTÉ DU WORKER — processus court, exécuté par le HEALTHCHECK Docker.
// Code de sortie 0 = sain, 1 = malade. Rien d'autre.
//
// POURQUOI ELLE EXISTE. La sonde précédente était `pgrep -f node`. Elle vérifiait
// qu'UN processus node existait — pas que le worker vivait. En développement, le
// lanceur `scripts/dev-node.mjs` fait tourner `tsc --watch` À CÔTÉ du worker, et `tsc`
// est un processus node : la sonde restait verte pendant que le worker était mort au
// démarrage. `docker ps` a donc affiché « Up 13 hours (healthy) » sur un conteneur dont
// la première ligne de journal est une pile d'exception, et le critère d'acceptation L0
// « `docker compose up` = stack complète » a été coché sur cette apparence.
// Une sonde ne doit jamais observer un VOISIN du sujet.
//
// -----------------------------------------------------------------------------
// CE QUE CETTE SONDE PROUVE — exactement, et pas un mot de plus.
//
//   1. BATTEMENT. `worker.ts` écrit toutes les 5 s une clé `axion:sonde:battement:<hôte>`
//      avec une expiration de 20 s. La trouver prouve que, dans les vingt dernières
//      secondes, LA BOUCLE D'ÉVÉNEMENTS DE CE PROCESSUS a tourné et qu'il a pu ÉCRIRE
//      dans Redis. Un processus mort, tué ou figé ne peut pas produire ce signe : la clé
//      expire toute seule. Aucun autre processus du conteneur ne l'écrit.
//
//   2. ATTACHEMENT AUX FILES. Pour chacune des files déclarées, on demande à BullMQ
//      `getWorkers()` : la liste des connexions Redis que BullMQ a lui-même nommées
//      `axion:<file en base64>:w:<hôte>` (`CLIENT SETNAME`, posé par `classes/worker.js`).
//      On ne retient que celles portant l'identité de CE conteneur. En trouver au moins
//      une par file prouve qu'un `Worker` BullMQ de cette instance est réellement branché
//      sur CETTE file — et non sur quatre des cinq, ce qu'un simple test de vivacité du
//      processus ne verrait jamais.
//
// CE QU'ELLE NE PROUVE PAS — à lire avant de s'en servir comme d'une garantie.
//
//   · Que les jobs sont TRAITÉS correctement. Au lot L0 aucun traitement n'existe (le
//     processeur rejette par construction). Un worker attaché dont chaque job échouerait
//     resterait vert. Cette couverture-là exige de vrais jobs : elle viendra avec L10/L11,
//     par une sonde qui regarde l'âge du plus vieux job en attente.
//   · Que le worker AVANCE. Une boucle qui bat et reste attachée mais ne dépile plus
//     (verrou perdu, connexion bloquante muette) passerait. Le battement borne le blocage
//     du processus, pas celui de la consommation.
//   · L'état de Postgres ou de MinIO : la sonde ne parle qu'à Redis.
//
// Le dépôt préfère une garantie faible et énoncée à une garantie forte et fausse.
// Traçabilité : E35 (exploitation), E43 (exécutabilité).
// =============================================================================
import { Queue } from 'bullmq';
import { pino } from 'pino';
import { chargerEnv, envServeurSchema, OPTIONS_REDACTION_JOURNAL } from '@axion/shared';
import {
  BUDGET_SONDE_MS,
  cleDeBattement,
  CLES_DE_FILES,
  IDENTITE_INSTANCE,
  NOMS_DE_FILES,
  PREFIXE_REDIS,
  TTL_BATTEMENT_SECONDES,
  type CleDeFile,
} from './files.js';

const config = chargerEnv(envServeurSchema, process.env);

// La sortie d'un HEALTHCHECK n'atterrit pas dans `docker logs` mais dans
// `docker inspect --format '{{json .State.Health}}'` : la journaliser est gratuit pour
// l'exploitant et précieux le jour où le conteneur vire au rouge sans explication.
const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'worker-sonde', env: config.APP_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { ...OPTIONS_REDACTION_JOURNAL, paths: [...OPTIONS_REDACTION_JOURNAL.paths] },
});

const files = Object.fromEntries(
  Object.entries(NOMS_DE_FILES).map(([cle, nom]) => [
    cle,
    new Queue(nom, { connection: { url: config.REDIS_URL }, prefix: PREFIXE_REDIS }),
  ]),
) as Record<CleDeFile, Queue>;

/** Vérification 1 — le battement de cœur de CETTE instance est-il encore là ? */
async function verifierBattement(): Promise<string | null> {
  const battement = await files.rapports.client.then((client) => client.get(cleDeBattement()));
  if (battement === null) {
    return (
      `aucun battement pour l'instance « ${IDENTITE_INSTANCE} » : la clé ` +
      `${cleDeBattement()} est absente ou expirée (durée de vie ${String(TTL_BATTEMENT_SECONDES)} s) ` +
      '— le processus worker est mort, tué ou figé'
    );
  }
  return null;
}

/** Vérification 2 — un travailleur de cette instance est-il branché sur chaque file ? */
async function verifierAttachements(): Promise<string[]> {
  const suffixeAttendu = `:w:${IDENTITE_INSTANCE}`;
  const resultats = await Promise.all(
    CLES_DE_FILES.map(async (cle): Promise<string | null> => {
      const connexions = await files[cle].getWorkers();
      // `rawname` est le nom réel de la connexion Redis ; BullMQ écrase `name` avec le
      // nom de la file. On filtre donc sur `rawname`, jamais sur `name`.
      const miennes = connexions.filter((c) => c.rawname?.endsWith(suffixeAttendu) === true);
      if (miennes.length === 0) {
        return (
          `file « ${NOMS_DE_FILES[cle]} » : aucun travailleur de l'instance ` +
          `« ${IDENTITE_INSTANCE} » n'y est attaché (${String(connexions.length)} connexion(s) ` +
          "d'autres instances)"
        );
      }
      return null;
    }),
  );
  return resultats.filter((r): r is string => r !== null);
}

async function sonder(): Promise<void> {
  const anomalies: string[] = [];

  const anomalieBattement = await verifierBattement();
  if (anomalieBattement !== null) anomalies.push(anomalieBattement);
  anomalies.push(...(await verifierAttachements()));

  if (anomalies.length > 0) {
    process.exitCode = 1;
    logger.error({ anomalies, instance: IDENTITE_INSTANCE }, 'Sonde du worker : MALADE');
    return;
  }
  process.exitCode = 0;
  logger.info(
    { files: Object.values(NOMS_DE_FILES), instance: IDENTITE_INSTANCE },
    'Sonde du worker : SAIN (battement frais, un travailleur attaché à chaque file)',
  );
}

// Garde-fou de durée. Sans lui, une connexion Redis qui ne répond pas laisserait le
// démon Docker trancher au bout de son propre `timeout`, sans un mot dans le journal de
// santé — et un diagnostic muet vaut à peine mieux qu'une sonde qui ment.
const budget = setTimeout(() => {
  logger.error(
    { budgetMs: BUDGET_SONDE_MS, instance: IDENTITE_INSTANCE },
    'Sonde du worker : MALADE (budget dépassé — Redis ne répond pas)',
  );
  process.exit(1);
}, BUDGET_SONDE_MS);

try {
  await sonder();
} catch (err) {
  process.exitCode = 1;
  logger.error(
    { err, instance: IDENTITE_INSTANCE },
    'Sonde du worker : MALADE (erreur inattendue)',
  );
} finally {
  clearTimeout(budget);
  // On ferme les connexions et on laisse le processus s'éteindre par lui-même plutôt que
  // d'appeler `process.exit` : la sortie du journal part en entier, et un descripteur
  // laissé ouvert se verrait ici sous forme de sonde qui traîne.
  await Promise.all(Object.values(files).map((f) => f.close()));
}
