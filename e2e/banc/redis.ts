// =============================================================================
// BANC E2E — Redis des tests : celui de la CI (`REDIS_URL`) ou un conteneur
// éphémère de l'image épinglée du dépôt (redis:7), démarré par la CLI Docker comme
// MinIO (apps/api/tests/aide/minio-essai.ts) : aucune dépendance neuve.
// =============================================================================
import { execFile } from 'node:child_process';
import { connect } from 'node:net';
import { promisify } from 'node:util';

const executer = promisify(execFile);
const IMAGE_REDIS = 'redis:7-alpine';

export interface RedisBanc {
  readonly url: string;
  arreter(): Promise<void>;
}

function ecouteSur(port: number): Promise<boolean> {
  return new Promise((resoudre) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resoudre(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resoudre(false);
    });
  });
}

export async function demarrerRedis(): Promise<RedisBanc> {
  const fourni = process.env.REDIS_URL;
  if (fourni !== undefined && fourni !== '') {
    return { url: fourni, arreter: () => Promise.resolve() };
  }

  const { stdout } = await executer('docker', ['run', '-d', '-p', '127.0.0.1::6379', IMAGE_REDIS], {
    timeout: 180_000,
  });
  const id = stdout.trim();
  const { stdout: sortiePort } = await executer('docker', ['port', id, '6379/tcp']);
  const correspondance = /:(\d+)\s*$/m.exec(sortiePort.trim().split(/\r?\n/)[0] ?? '');
  if (correspondance?.[1] === undefined) {
    await executer('docker', ['rm', '-f', '-v', id]).catch(() => undefined);
    throw new Error(`port Redis illisible : « ${sortiePort} »`);
  }
  const port = Number(correspondance[1]);

  for (let i = 0; i < 60; i += 1) {
    if (await ecouteSur(port)) {
      return {
        url: `redis://127.0.0.1:${String(port)}`,
        async arreter(): Promise<void> {
          await executer('docker', ['rm', '-f', '-v', id]).catch(() => undefined);
        },
      };
    }
    await new Promise((resoudre) => setTimeout(resoudre, 500));
  }
  await executer('docker', ['rm', '-f', '-v', id]).catch(() => undefined);
  throw new Error('Redis n’a jamais écouté (30 s).');
}
