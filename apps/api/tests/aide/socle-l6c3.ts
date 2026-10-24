// =============================================================================
// SOCLE DES ÉPREUVES L6c-3 « LE SIÈGE » — PostgreSQL réel, MinIO réel (optionnel),
// application construite. Fabrique d'ÉTAT en SQL direct, jamais de RÉSULTAT.
// Secrets FACTICES (11 §2). Invariant 2 : aucune référence client.
// =============================================================================
import { vi } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './base-l1.js';
import { demarrerMinio, type MinioEssai } from './minio-essai.js';

export { uuidv7 };

export interface Socle {
  readonly app: FastifyInstance;
  readonly client: Client;
  readonly urlBase: string;
  readonly minio: MinioEssai | undefined;
  fermer(): Promise<void>;
}

export async function monterSocle(options: {
  readonly suffixe: string;
  readonly avecMinio: boolean;
  readonly niveauJournal?: string;
}): Promise<Socle> {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);
  const minio = options.avecMinio ? await demarrerMinio() : undefined;
  const base = await creerBaseEphemere(options.suffixe);
  await appliquerMontee(base.url);
  process.env.SEED_ADMIN_EMAIL ??= 'fondateur.l6c3@exemple.test';
  process.env.SEED_ADMIN_PASSWORD ??= 'mot-de-passe-factice-de-seed';
  await executerSeed(base.url, base.nom);
  const client = await connecter(base.url);

  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = '6c'.repeat(32);
  process.env.JWT_REFRESH_SECRET = '3d'.repeat(32);
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.LOG_LEVEL = options.niveauJournal ?? 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;
  minio?.exporterEnvironnement();

  vi.resetModules();
  const { construireApp } = await import('../../src/app.js');
  const app = await construireApp();
  await app.ready();
  return {
    app,
    client,
    urlBase: base.url,
    minio,
    async fermer(): Promise<void> {
      await app.close();
      const { fermerBase } = await import('../../src/db.js');
      await fermerBase();
      await client.end();
      await supprimerBaseEphemere(base.nom);
      if (minio !== undefined) await minio.arreter();
    },
  };
}

export type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';
export type RoleSurMission = 'lead' | 'consultant' | 'analyste' | 'lecteur';

let compteur = 0;
export async function creerCompte(
  client: Client,
  role: RoleUtilisateur,
): Promise<{ readonly id: string; readonly nom: string; readonly courriel: string }> {
  compteur += 1;
  const id = uuidv7();
  const nom = `Compte L6c3 ${String(compteur)}`;
  const courriel = `compte.l6c3.${String(compteur)}@exemple.test`;
  await client.query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [id, nom, courriel, role],
  );
  return { id, nom, courriel };
}

export async function semerMission(client: Client): Promise<string> {
  compteur += 1;
  const entreprise = uuidv7();
  await client.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    entreprise,
    `Entreprise fictive L6c3 ${String(compteur)}`,
  ]);
  const id = uuidv7();
  await client.query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', now(), now())`,
    [id, entreprise, `Mission fictive L6c3 ${String(compteur)}`],
  );
  return id;
}

export async function rattacher(
  client: Client,
  missionId: string,
  userId: string,
  role: RoleSurMission,
): Promise<void> {
  await client.query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, role],
  );
}

export async function semerUnite(client: Client, missionId: string): Promise<string> {
  const id = uuidv7();
  await client.query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status,
                            created_at, updated_at)
     VALUES ($1, $2, NULL, 'service', $3, true, 'active', now(), now())`,
    [id, missionId, `Unite fictive ${id.slice(-6)}`],
  );
  return id;
}

export async function semerEntretien(
  client: Client,
  missionId: string,
  orgUnitId: string,
  conduitPar: string,
  t = '2026-09-30T08:00:00.000Z',
): Promise<string> {
  const id = uuidv7();
  await client.query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id, schedule_status,
                             status, general_notes, client_created_at, client_updated_at,
                             created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, 'planifie', 'non_demarre', 'notes semées',
             $5, $5, now(), now())`,
    [id, missionId, conduitPar, orgUnitId, t],
  );
  return id;
}

/** Une PHOTO volante (aucun rattachement), métadonnées montées, octets absents. */
export async function semerPhotoVolante(
  client: Client,
  missionId: string,
  creePar: string,
): Promise<string> {
  const id = uuidv7();
  await client.query(
    `INSERT INTO attachments (id, interview_id, answer_id, mission_id, kind, filename, mime,
                              size_bytes, storage_key, created_by, client_created_at,
                              client_updated_at, created_at, updated_at)
     VALUES ($1, NULL, NULL, $2, 'photo', 'photo-fictive.jpg', 'image/jpeg', NULL, NULL, $3,
             '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z', now(), now())`,
    [id, missionId, creePar],
  );
  return id;
}
