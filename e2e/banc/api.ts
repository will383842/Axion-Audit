// =============================================================================
// BANC E2E AVEC VRAIE API — lancement et arrêt du processus API CONSTRUIT
//
// On lance `apps/api/dist/server.js` (l'artefact réellement déployé, comme
// `vite preview` sert le build du front), dans un PROCESSUS À PART : jamais
// `app.inject()`, qui court-circuiterait la pile réseau que le navigateur de test
// traverse (proxy du front, en-têtes, quotas par IP).
//
// Ce fichier ne contient aucun code de production : il passe l'environnement et
// attend la sonde de vivacité. Les secrets sont FACTICES (11 §2, CLAUDE.md §2).
// =============================================================================
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '..', '..');

/** Port FIXE : le proxy de `vite preview` (apps/field/vite.config.ts) le vise. */
export const PORT_API = 3000;
export const URL_API = `http://127.0.0.1:${String(PORT_API)}`;

/** Secrets de jeton FACTICES, partagés avec le banc pour frapper des jetons d'accès. */
export const SECRET_ACCES_BANC = '5b'.repeat(32);
export const SECRET_RAFRAICHISSEMENT_BANC = '9c'.repeat(32);

export interface ApiLancee {
  readonly pid: number | undefined;
  arreter(): Promise<void>;
}

export interface ParametresApi {
  readonly urlBase: string;
  readonly urlRedis: string;
  /** Variables MinIO déjà posées dans `process.env` par `exporterEnvironnement()`. */
  readonly environnement: NodeJS.ProcessEnv;
}

async function attendreVivante(enfant: ChildProcess, delaiMs: number): Promise<void> {
  const fin = Date.now() + delaiMs;
  const etat: { sortie: number | null } = { sortie: null };
  enfant.once('exit', (code) => {
    etat.sortie = code ?? -1;
  });
  while (Date.now() < fin) {
    if (etat.sortie !== null) {
      throw new Error(
        `L'API s'est arrêtée au démarrage (code ${String(etat.sortie)}) — voir test-results/banc/api.log.`,
      );
    }
    try {
      const reponse = await fetch(`${URL_API}/v1/health`);
      if (reponse.ok) return;
    } catch {
      // pas encore à l'écoute
    }
    await new Promise((resoudre) => setTimeout(resoudre, 250));
  }
  throw new Error(`L'API n'a jamais répondu sur ${URL_API}/v1/health (${String(delaiMs)} ms).`);
}

export async function lancerApi(parametres: ParametresApi): Promise<ApiLancee> {
  const dossierJournal = resolve(RACINE, 'test-results', 'banc');
  mkdirSync(dossierJournal, { recursive: true });
  const journal = createWriteStream(resolve(dossierJournal, 'api.log'));

  const enfant = spawn(process.execPath, [resolve(RACINE, 'apps', 'api', 'dist', 'server.js')], {
    cwd: resolve(RACINE, 'apps', 'api'),
    env: {
      ...process.env,
      ...parametres.environnement,
      DATABASE_URL: parametres.urlBase,
      REDIS_URL: parametres.urlRedis,
      JWT_ACCESS_SECRET: SECRET_ACCES_BANC,
      JWT_REFRESH_SECRET: SECRET_RAFRAICHISSEMENT_BANC,
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
      API_HOST: '127.0.0.1',
      API_PORT: String(PORT_API),
      LOG_LEVEL: 'warn',
      APP_ENV: 'dev',
      TZ: 'UTC',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  enfant.stdout.pipe(journal, { end: false });
  enfant.stderr.pipe(journal, { end: false });

  try {
    await attendreVivante(enfant, 60_000);
  } catch (erreur) {
    enfant.kill();
    throw erreur;
  }

  return {
    pid: enfant.pid,
    async arreter(): Promise<void> {
      if (enfant.exitCode !== null) {
        journal.end();
        return;
      }
      const termine = new Promise<void>((resoudre) => {
        enfant.once('exit', () => {
          resoudre();
        });
      });
      enfant.kill();
      await Promise.race([termine, new Promise((resoudre) => setTimeout(resoudre, 10_000))]);
      journal.end();
    },
  };
}
