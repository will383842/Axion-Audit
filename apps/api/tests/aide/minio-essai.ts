// =============================================================================
// MINIO DES TESTS D'INTÉGRATION — un VRAI serveur d'objets, jamais un double.
//
// Deux sources, dans cet ordre :
//   1. la CI (11 §7) démarre déjà un MinIO et publie ses coordonnées dans
//      l'environnement (`MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`,
//      `MINIO_SECRET_KEY`) : on s'y branche ;
//   2. sinon (poste de développement), on démarre un conteneur éphémère de
//      l'image ÉPINGLÉE du dépôt (DECISIONS [L0], même image que le compose et
//      que `l0-restauration`), port publié au hasard sur 127.0.0.1, retiré en fin
//      de suite.
//
// POURQUOI LA CLI DOCKER ET NON `GenericContainer` : le paquet `testcontainers`
// n'est pas une dépendance directe d'`apps/api` (seul `@testcontainers/postgresql`
// l'est) ; l'ajouter est une décision 11 §8.1. La CLI Docker est déjà la voie de
// `l0-restauration.integration.test.ts` : même discipline, aucune dépendance neuve.
//
// Un BUCKET NEUF par fichier de test, créé ici comme l'est un état d'infrastructure
// (c'est le job `createbuckets` du compose qui le fait en production) ; son nom est
// posé dans `MINIO_BUCKET_ATTACHMENTS` AVANT que l'application soit importée.
//
// Secrets FACTICES uniquement (11 §2).
// =============================================================================
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { Client as ClientMinio } from 'minio';

const executer = promisify(execFile);

/** Image épinglée du dépôt (ci.yml `MINIO_IMAGE`, DECISIONS [L0]). */
export const IMAGE_MINIO = 'pgsty/minio:RELEASE.2026-08-04T00-00-00Z';

const UTILISATEUR_FACTICE = 'essai-l6c-factice';
const MOT_DE_PASSE_FACTICE = 'motdepasse-minio-l6c-factice';

export interface MinioEssai {
  readonly client: ClientMinio;
  readonly endPoint: string;
  readonly port: number;
  readonly bucket: string;
  /** Pose les variables lues par l'application. À appeler AVANT `construireApp`. */
  exporterEnvironnement(): void;
  /** Lit un objet en entier. */
  lireObjet(cle: string): Promise<Buffer>;
  /** Clés de tous les objets du bucket. */
  objets(): Promise<string[]>;
  arreter(): Promise<void>;
}

async function attendreVivant(endPoint: string, port: number): Promise<void> {
  const adresse = `http://${endPoint}:${String(port)}/minio/health/live`;
  for (let i = 0; i < 120; i += 1) {
    try {
      const r = await fetch(adresse);
      if (r.ok) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((resoudre) => setTimeout(resoudre, 500));
  }
  throw new Error(`MinIO n'a jamais répondu sur ${adresse} (60 s).`);
}

async function demarrerConteneur(): Promise<{ id: string; port: number }> {
  const { stdout } = await executer(
    'docker',
    [
      'run',
      '-d',
      '-p',
      '127.0.0.1::9000',
      '-e',
      `MINIO_ROOT_USER=${UTILISATEUR_FACTICE}`,
      '-e',
      `MINIO_ROOT_PASSWORD=${MOT_DE_PASSE_FACTICE}`,
      IMAGE_MINIO,
      'server',
      '/data',
    ],
    { timeout: 180_000 },
  );
  const id = stdout.trim();
  const { stdout: sortiePort } = await executer('docker', ['port', id, '9000/tcp']);
  const correspondance = /:(\d+)\s*$/m.exec(sortiePort.trim().split(/\r?\n/)[0] ?? '');
  if (correspondance?.[1] === undefined) {
    throw new Error(`port MinIO illisible : « ${sortiePort} »`);
  }
  return { id, port: Number(correspondance[1]) };
}

export async function demarrerMinio(): Promise<MinioEssai> {
  const env = process.env;
  const fourniParLaCi =
    env.MINIO_ENDPOINT !== undefined &&
    env.MINIO_ENDPOINT !== '' &&
    env.MINIO_ACCESS_KEY !== undefined &&
    env.MINIO_ACCESS_KEY !== '' &&
    env.MINIO_SECRET_KEY !== undefined &&
    env.MINIO_SECRET_KEY !== '';

  let endPoint: string;
  let port: number;
  let accessKey: string;
  let secretKey: string;
  let conteneur: string | undefined;

  if (fourniParLaCi) {
    endPoint = env.MINIO_ENDPOINT ?? '';
    port = Number(env.MINIO_PORT ?? '9000');
    accessKey = env.MINIO_ACCESS_KEY ?? '';
    secretKey = env.MINIO_SECRET_KEY ?? '';
  } else {
    const demarre = await demarrerConteneur();
    conteneur = demarre.id;
    endPoint = '127.0.0.1';
    port = demarre.port;
    accessKey = UTILISATEUR_FACTICE;
    secretKey = MOT_DE_PASSE_FACTICE;
  }
  await attendreVivant(endPoint, port);

  const client = new ClientMinio({ endPoint, port, useSSL: false, accessKey, secretKey });
  const bucket = `axion-l6c-${randomBytes(4).toString('hex')}`;
  await client.makeBucket(bucket);

  return {
    client,
    endPoint,
    port,
    bucket,
    exporterEnvironnement(): void {
      env.MINIO_ENDPOINT = endPoint;
      env.MINIO_PORT = String(port);
      env.MINIO_USE_SSL = 'false';
      env.MINIO_ACCESS_KEY = accessKey;
      env.MINIO_SECRET_KEY = secretKey;
      env.MINIO_BUCKET_ATTACHMENTS = bucket;
    },
    async lireObjet(cle: string): Promise<Buffer> {
      const flux = await client.getObject(bucket, cle);
      const morceaux: Buffer[] = [];
      for await (const morceau of flux) {
        morceaux.push(Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau as Uint8Array));
      }
      return Buffer.concat(morceaux);
    },
    async objets(): Promise<string[]> {
      const cles: string[] = [];
      const flux = client.listObjects(bucket, '', true);
      for await (const element of flux) {
        const nom = (element as { name?: string }).name;
        if (nom !== undefined) cles.push(nom);
      }
      return cles.sort();
    },
    async arreter(): Promise<void> {
      if (conteneur !== undefined) {
        await executer('docker', ['rm', '-f', '-v', conteneur]).catch(() => undefined);
      }
    },
  };
}
