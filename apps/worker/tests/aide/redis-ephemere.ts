// =============================================================================
// OUTILLAGE DES TESTS D'INTÉGRATION DU WORKER — Redis éphémère et sonde réelle
//
// Ces tests sont écrits par A16 (testeur d'intégration) et JAMAIS par l'auteur du
// code testé (règle de croisement 09 §5.6). Ils existent parce qu'un défaut a
// vécu treize heures derrière une sonde verte : le worker ne démarrait pas
// (`Queue name cannot contain :`, BullMQ 5), et `pgrep -f node` trouvait le
// compilateur `tsc --watch` à la place du worker.
//
// PRINCIPE DIRECTEUR : ON EXÉCUTE LES ARTEFACTS RÉELS.
// La sonde éprouvée ici est le fichier que Docker lance (`dist/sonde-sante.js`),
// pas une réimplémentation de sa logique dans le test. Le worker démarré est
// `dist/worker.js`. Réécrire leur logique côté test aurait produit deux
// comportements qui se ressemblent — et c'est précisément une ressemblance de ce
// genre qui a laissé passer le défaut d'origine.
//
// Redis vient de Testcontainers (11 §1), en version 7 comme la pile (11 §1) : la
// suite est autoportante, elle ne suppose aucun `docker compose up` préalable et
// n'écrit jamais dans le Redis de développement.
// =============================================================================
import { exec, execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { Queue } from 'bullmq';

/**
 * Sous-ensemble des commandes Redis brutes employé par ces tests.
 *
 * BullMQ expose la connexion de ses files sous une interface volontairement
 * étroite (`IRedisClient`) qui ne déclare ni `keys`, ni `ttl`, ni `flushall` —
 * alors que la connexion réelle est un client ioredis complet. Plutôt que
 * d'ajouter `ioredis` aux dépendances pour ses seuls types (11 §8.1 : toute
 * dépendance hors liste est une décision humaine), on décrit ici les quatre
 * commandes dont on se sert. La forme est vérifiée à L'EXÉCUTION par les tests
 * eux-mêmes : une méthode absente ferait échouer le test, pas passer en silence.
 */
export interface ClientRedisBrut {
  keys(motif: string): Promise<string[]>;
  get(cle: string): Promise<string | null>;
  set(cle: string, valeur: string, mode: 'EX', secondes: number): Promise<unknown>;
  ttl(cle: string): Promise<number>;
  flushall(): Promise<unknown>;
}

/** Emprunte la connexion d'une file plutôt que d'en ouvrir une de plus. */
export async function clientBrut(file: Queue): Promise<ClientRedisBrut> {
  return (await file.client) as unknown as ClientRedisBrut;
}

const executerFichier = promisify(execFile);
// `pnpm` est un script de plateforme (pnpm.cmd sous Windows) : il passe par le shell,
// là où `execFile` exigerait un binaire. C'est la même commande que la CI et les
// Dockerfiles invoquent.
const executerCommande = promisify(exec);

const ICI = dirname(fileURLToPath(import.meta.url));
/** Racine de l'application worker (apps/worker/tests/aide → ../..). */
export const RACINE_WORKER = resolve(ICI, '..', '..');
/** Racine du dépôt. */
export const RACINE_DEPOT = resolve(RACINE_WORKER, '..', '..');

/** Version épinglée au contrat 11 §1, comme dans `infra/docker-compose.yml`. */
const IMAGE_REDIS = 'redis:7-alpine';

// -----------------------------------------------------------------------------
// Environnement
// -----------------------------------------------------------------------------

/** Lit le `.env` racine sans dépendance (dotenv n'est pas au contrat 11 §1). */
function lireEnvRacine(): Record<string, string> {
  const chemin = resolve(RACINE_DEPOT, '.env');
  if (!existsSync(chemin)) return {};
  const valeurs: Record<string, string> = {};
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const nette = ligne.trim();
    if (nette === '' || nette.startsWith('#')) continue;
    const separateur = nette.indexOf('=');
    if (separateur <= 0) continue;
    const cle = nette.slice(0, separateur).trim();
    let valeur = nette.slice(separateur + 1).trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"')) ||
      (valeur.startsWith("'") && valeur.endsWith("'"))
    ) {
      valeur = valeur.slice(1, -1);
    }
    valeurs[cle] = valeur;
  }
  return valeurs;
}

const ENV_RACINE = lireEnvRacine();

/**
 * Environnement des processus fils. `envServeurSchema` (packages/shared) exige
 * `DATABASE_URL`, `REDIS_URL` et les secrets JWT : on part du `.env` racine et on
 * ne réécrit que `REDIS_URL`, vers le conteneur éphémère. Aucun secret n'est
 * écrit dans ce fichier (11 §2, 30.4-5).
 */
export function environnementWorker(urlRedis: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...ENV_RACINE,
    REDIS_URL: urlRedis,
    // APP_ENV n'accepte que dev | staging | prod (packages/shared, appEnvSchema) :
    // « test » y est REFUSÉ et le processus refuse alors de démarrer. La première
    // version de ce fichier posait « test » — les processus fils mouraient sur une
    // erreur de configuration, et la sonde sortait en 1 pour cette raison-là au lieu
    // de la panne qu'on lui fabriquait. Les assertions qui exigent que la sonde NOMME
    // l'anomalie ont attrapé ce faux rouge ; sans elles, quatre tests auraient été
    // « verts » en observant la mauvaise défaillance.
    APP_ENV: 'dev',
    NODE_ENV: 'test',
    // La sonde et le worker journalisent en pino ; au niveau `error`, la sortie
    // reste lisible quand un test échoue et muette quand tout va bien.
    LOG_LEVEL: 'error',
  };
}

// -----------------------------------------------------------------------------
// Conteneur Redis — un par fichier de test, mémoïsé sur la promesse
// -----------------------------------------------------------------------------

let promesseConteneur: Promise<StartedRedisContainer> | undefined;

export async function demarrerRedis(): Promise<StartedRedisContainer> {
  promesseConteneur ??= new RedisContainer(IMAGE_REDIS).start();
  try {
    return await promesseConteneur;
  } catch (erreur) {
    const details = erreur instanceof Error ? erreur.message : String(erreur);
    throw new Error(
      `Testcontainers n'a pas pu démarrer ${IMAGE_REDIS}.\n` +
        `Le contrat 11 §1 épingle « Vitest 3 + Testcontainers » et Redis 7 : ces tests\n` +
        `démarrent leur propre Redis et n'exigent aucune pile préalable.\n\nCause : ${details}`,
    );
  }
}

export async function arreterRedis(): Promise<void> {
  const conteneur = await promesseConteneur;
  promesseConteneur = undefined;
  if (conteneur !== undefined) await conteneur.stop();
}

// -----------------------------------------------------------------------------
// Construction — la sonde éprouvée doit être la sonde COMPILÉE, et à jour
// -----------------------------------------------------------------------------

/**
 * Construit le worker AVEC ses dépendances d'espace de travail, puis vérifie que
 * les deux artefacts attendus existent.
 *
 * POURQUOI CETTE COMMANDE, ET PAS UN `tsc` DIRECT. Le suffixe `...` de
 * `--filter "@axion/worker..."` demande à pnpm de construire d'abord les paquets
 * dont le worker dépend — aujourd'hui `packages/shared` — dans l'ordre déduit du
 * graphe, puis le worker. On ne nomme pas ces paquets ici : pnpm les déduit, et une
 * liste écrite à la main deviendrait fausse au premier ajout de dépendance. C'est la
 * commande qu'emploient déjà les Dockerfiles.
 *
 * La première version de cette aide lançait `tsc --project tsconfig.build.json`
 * sur le seul worker, et ne le lançait QUE si `dist/` semblait périmé face à
 * `src/`. Verte sur un poste de développement — où `dist/` traîne depuis des
 * heures — et ROUGE en CI : chaque job de la chaîne
 * `jonction → build-sources → lint → typecheck → unit → integration` a son propre
 * exécuteur et NE PARTAGE RIEN. Quand ce fichier démarre en CI, ni
 * `apps/worker/dist`, ni `packages/shared/dist`, ni `packages/ui/dist` n'existent :
 * le `tsc` isolé ne trouvait pas les types de ses dépendances d'espace de travail.
 *
 * D'où deux changements : on construit le GRAPHE, et on le construit
 * INCONDITIONNELLEMENT. L'heuristique de fraîcheur comparait `dist/` à `src/` du
 * seul worker — elle était aveugle à une modification de `packages/shared`, et
 * c'est précisément le genre d'angle mort qui produit un vert trompeur. `tsc` est
 * incrémental : reconstruire quand tout est à jour coûte quelques secondes, très
 * en dessous du prix d'un artefact périmé validé par erreur.
 */
export async function assurerConstruction(): Promise<void> {
  try {
    await executerCommande('pnpm --filter "@axion/worker..." build', {
      cwd: RACINE_DEPOT,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (erreur) {
    const details = erreur instanceof Error ? erreur.message : String(erreur);
    throw new Error(
      `La CONSTRUCTION du worker a échoué — les tests de la sonde ne peuvent pas commencer.\n\n` +
        `La sonde éprouvée est l'artefact COMPILÉ (dist/sonde-sante.js), celui que le\n` +
        `HEALTHCHECK Docker exécute. Sans construction réussie, il n'y a rien à éprouver :\n` +
        `mieux vaut échouer ici, en le disant, que trois assertions plus loin sur une\n` +
        `erreur obscure.\n\n` +
        `Commande : pnpm --filter "@axion/worker..." build (worker + dépendances d'espace\n` +
        `de travail, ordre déduit du graphe).\n\nSortie :\n${details}`,
    );
  }

  const attendus = ['sonde-sante.js', 'worker.js'].map((f) => resolve(RACINE_WORKER, 'dist', f));
  const manquants = attendus.filter((chemin) => !existsSync(chemin));
  if (manquants.length > 0) {
    throw new Error(
      `La construction a rendu 0 mais n'a pas produit :\n  ${manquants.join('\n  ')}\n\n` +
        `Un « build » qui réussit sans émettre est le défaut que le dépôt connaît déjà\n` +
        `(cache d'incrémentalité hors de dist/ — voir apps/worker/tsconfig.build.json).\n` +
        `On le refuse ici plutôt que de laisser la sonde échouer sur un fichier absent.`,
    );
  }
}

// -----------------------------------------------------------------------------
// Exécution de la sonde réelle
// -----------------------------------------------------------------------------

export interface ResultatSonde {
  code: number;
  sortie: string;
}

/**
 * Lance `dist/sonde-sante.js` — le fichier même que le HEALTHCHECK Docker exécute —
 * et rend son code de sortie. La sonde ne lève jamais ici : son code EST le
 * résultat observé, 0 comme 1.
 */
export async function executerSonde(urlRedis: string): Promise<ResultatSonde> {
  const script = resolve(RACINE_WORKER, 'dist', 'sonde-sante.js');
  try {
    const { stdout, stderr } = await executerFichier(process.execPath, [script], {
      cwd: RACINE_WORKER,
      env: environnementWorker(urlRedis),
      maxBuffer: 8 * 1024 * 1024,
    });
    return { code: 0, sortie: `${stdout}${stderr}` };
  } catch (erreur) {
    const details = erreur as { code?: unknown; stdout?: unknown; stderr?: unknown };
    const stdout = typeof details.stdout === 'string' ? details.stdout : '';
    const stderr = typeof details.stderr === 'string' ? details.stderr : '';
    return {
      code: typeof details.code === 'number' ? details.code : 1,
      sortie: `${stdout}${stderr}`,
    };
  }
}

/**
 * Attend que la sonde rende le code voulu, dans un budget donné. Sert UNIQUEMENT
 * aux cas positifs, où l'on attend une mise en route (connexions Redis nommées,
 * premier battement) : les cas négatifs sont observés immédiatement, sans attente,
 * pour qu'un « rouge » ne puisse jamais être un « pas encore vert ».
 */
export async function attendreSonde(
  urlRedis: string,
  codeAttendu: number,
  budgetMs = 30_000,
): Promise<ResultatSonde> {
  const echeance = Date.now() + budgetMs;
  let dernier = await executerSonde(urlRedis);
  while (dernier.code !== codeAttendu && Date.now() < echeance) {
    await new Promise((r) => setTimeout(r, 500));
    dernier = await executerSonde(urlRedis);
  }
  return dernier;
}

// -----------------------------------------------------------------------------
// Worker réel, en processus fils
// -----------------------------------------------------------------------------

export interface WorkerLance {
  processus: ChildProcess;
  journal: () => string;
  arreter: () => Promise<void>;
}

/** Démarre `dist/worker.js` contre le Redis éphémère. */
export function demarrerWorker(urlRedis: string): WorkerLance {
  const processus = spawn(process.execPath, [resolve(RACINE_WORKER, 'dist', 'worker.js')], {
    cwd: RACINE_WORKER,
    env: environnementWorker(urlRedis),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let journal = '';
  processus.stdout.on('data', (d: Buffer) => (journal += d.toString()));
  processus.stderr.on('data', (d: Buffer) => (journal += d.toString()));

  return {
    processus,
    journal: () => journal,
    arreter: async () => {
      if (processus.exitCode !== null || processus.signalCode !== null) return;
      await new Promise<void>((resoudre) => {
        processus.once('exit', () => {
          resoudre();
        });
        processus.kill();
      });
    },
  };
}
