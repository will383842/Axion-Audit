// =============================================================================
// LOT L7 / INCRÉMENT L7c — L'EXPORT §36.3 SUR UN POSTGRESQL RÉEL.
//
//   GET /v1/missions/:id/export?repondants=
//
// ⚠ TESTS DE CONCEPTION D'A30, écrits à la demande du constat **M-2** d'A37.
// AUCUN ne porte `@critique` : la RECETTE du §36.3 — la somme des douze rubriques
// du §20.3, l'axe-core, le p95, le rejeu FIL-TPE/FIL-GC — revient à **A36**
// (09 §5.6, arbitrage du 2026-09-05 sur les deux couches). Ce fichier ferme le
// trou que M-2 nomme : sans lui, les propriétés qui décident du lot n'étaient
// éprouvées PAR RIEN.
//
// ── CE QUE LES TESTS UNITAIRES NE POUVAIENT PAS PROUVER ─────────────────────
// Les 73 tests purs de L7c reçoivent DÉJÀ `null` là où la porte doit fermer :
// ils prouvent que l'écrivain écrit ce qu'on lui donne, jamais que le SQL lui
// donne la bonne chose. Quatre propriétés ne s'éprouvent qu'ici :
//
//   1. LA PORTE DU CONSENTEMENT, EN SQL (`case when consent_given is true`) —
//      trois sessions (consentement VRAI, FAUX, INCONNU) × deux appels (avec et
//      sans `?repondants=true`). Le nom, la FONCTION et le SERVICE ne sortent que
//      dans UNE des six cases. C'est le correctif du bloquant B-1 : jusqu'au
//      2026-09-06, deux des trois champs sortaient dans les six.
//   2. LE 404 DU NON-MEMBRE, jamais 403 — et le 401 sans jeton.
//   3. L'ÉTANCHÉITÉ FINANCIÈRE **SUR L'ARCHIVE DÉCOMPRESSÉE**. Le corps de cette
//      route est un ZIP : un balayage qui chercherait une sentinelle dans le
//      texte de la réponse serait VERT sans avoir rien lu. On décompresse, et on
//      cherche dans les dix fichiers.
//   4. UN FUSEAU PAR SITE AUDITÉ (correctif M-1) : deux unités, deux décalages
//      dans le MÊME `reponses.csv`, et l'héritage d'un enfant qui n'en porte pas.
//
// ── CONTRÔLE DE VACUITÉ, PARTOUT ────────────────────────────────────────────
// Chaque assertion NÉGATIVE est doublée d'une assertion POSITIVE sur la même
// archive : une archive vide ne contient ni montant ni nom, et un test qui ne
// vérifierait que l'absence serait vert sur une route en panne.
//
// ── LE LECTEUR DE ZIP EST INDÉPENDANT DE L'ÉCRIVAIN ─────────────────────────
// `aide/archive-export.ts` décode le format depuis sa spécification et n'importe
// aucune ligne de `domaines/export/zip.ts` : une archive « valide selon son
// propre écrivain » ne prouverait rien.
//
// Invariant 2 : missions FICTIVES, identifiants synthétiques, libellés neutres.
// Traçabilité : E14 (consolidation) · E21 (auditeurs jamais d'accès aux montants)
// · E22 (console de pilotage) · E32 (fuseaux) · E33 (sécurité / RGPD) · E36.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
} from './aide/base-l1.js';
import {
  cellulesDeLigne,
  lignesDuCsv,
  lireArchiveExport,
  texteDuFichier,
  type ArchiveLue,
} from './aide/archive-export.js';
import {
  detecterSentinelles,
  NOMS_FINANCIERS_INTERDITS,
  semerVoletFinancierSentinelle,
  VALEURS_SENTINELLES,
} from './aide/sentinelle-financiere.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '7c'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '3d'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l7c@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

/** Les dix fichiers que le §36.3 impose à cette version (`scores.csv` exclu, L8). */
const FICHIERS_ATTENDUS = [
  'mission.json',
  'arbre.csv',
  'sessions.csv',
  'reponses.csv',
  'constats.csv',
  'cas_usage.csv',
  'inventaire_outils.csv',
  'registre_ia.csv',
  'unites_hors_perimetre.csv',
  'pieces_jointes/manifest.csv',
] as const;

/** Des leurres reconnaissables : ils ne doivent sortir QUE sous consentement. */
const NOM_LEURRE = 'Répondant Leurre Zxqv';
const FONCTION_LEURRE = 'Directeur Leurre Zxqv';
const COURRIEL_LEURRE = 'repondant.leurre.zxqv@exemple.test';

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.72.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

interface ReponseExport {
  readonly statut: number;
  readonly typeContenu: string;
  readonly disposition: string;
  readonly octets: Buffer;
  readonly texte: string;
}

async function telecharger(
  missionId: string,
  options: { readonly jeton?: string | undefined; readonly repondants?: boolean } = {},
): Promise<ReponseExport> {
  const requete = options.repondants === true ? '?repondants=true' : '';
  const reponse = await api().inject({
    method: 'GET',
    url: `/v1/missions/${missionId}/export${requete}`,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
  });
  return {
    statut: reponse.statusCode,
    typeContenu: reponse.headers['content-type']?.toString() ?? '',
    disposition: reponse.headers['content-disposition']?.toString() ?? '',
    octets: reponse.rawPayload,
    texte: reponse.body,
  };
}

/** Télécharge ET décompresse — le seul chemin par lequel on juge le contenu. */
async function archiveDe(
  missionId: string,
  options: { readonly jeton?: string; readonly repondants?: boolean } = {},
): Promise<ArchiveLue> {
  const reponse = await telecharger(missionId, options);
  expect(reponse.statut, `l'export a répondu ${String(reponse.statut)} : ${reponse.texte}`).toBe(
    200,
  );
  return lireArchiveExport(reponse.octets);
}

/** La valeur d'une colonne nommée, sur la ligne de `reponses.csv` d'une réponse donnée. */
function colonneDeLaReponse(
  archive: ArchiveLue,
  answerId: string,
  colonne: string,
): string | undefined {
  const lignes = lignesDuCsv(archive, 'reponses.csv');
  const entete = cellulesDeLigne(lignes[0] ?? '');
  const index = entete.indexOf(colonne);
  if (index < 0) throw new Error(`colonne absente de reponses.csv : ${colonne}`);
  const ligne = lignes.slice(1).find((l) => cellulesDeLigne(l)[0] === answerId);
  if (ligne === undefined) return undefined;
  return cellulesDeLigne(ligne)[index];
}

// -----------------------------------------------------------------------------
// SEMIS
// -----------------------------------------------------------------------------
interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;

async function creerCompte(role: string, marqueur: string): Promise<Compte> {
  compteurCompte += 1;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [
      id,
      `Compte ${marqueur} ${String(compteurCompte)}`,
      `compte.${marqueur}.${String(compteurCompte)}@exemple.test`,
      role,
    ],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

let compteurMission = 0;

interface MissionSemee {
  readonly id: string;
  readonly companyId: string;
}

async function semerMission(
  options: { readonly timezone?: string; readonly blocsActifs?: readonly string[] } = {},
): Promise<MissionSemee> {
  compteurMission += 1;
  const companyId = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    companyId,
    `Entreprise fictive L7c ${String(compteurMission)}`,
  ]);
  const id = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, timezone,
                           active_blocks, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', $4, $5::jsonb, now(), now())`,
    [
      id,
      companyId,
      `Mission fictive L7c ${String(compteurMission)}`,
      options.timezone ?? 'Europe/Paris',
      JSON.stringify(options.blocsActifs ?? []),
    ],
  );
  return { id, companyId };
}

async function rattacher(missionId: string, userId: string, role = 'consultant'): Promise<void> {
  await bd().query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, role],
  );
}

let compteurUnite = 0;

async function semerUnite(semis: {
  readonly missionId: string;
  readonly nom?: string;
  readonly parentId?: string | null;
  readonly timezone?: string | null;
  readonly dansLePerimetre?: boolean;
}): Promise<string> {
  compteurUnite += 1;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, in_scope,
                            timezone, status, position, created_at, updated_at)
     VALUES ($1, $2, $3, 'service', $4, 10, $5, $6, 'active', $7, now(), now())`,
    [
      id,
      semis.missionId,
      semis.parentId ?? null,
      semis.nom ?? `Unité fictive ${String(compteurUnite)}`,
      semis.dansLePerimetre ?? true,
      semis.timezone ?? null,
      compteurUnite,
    ],
  );
  return id;
}

async function semerSession(semis: {
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly conduitPar: string;
  readonly consentement: boolean | null;
  readonly nomPersonne?: string;
  readonly fonction?: string;
  readonly courriel?: string;
  readonly serviceCode?: string;
}): Promise<string> {
  const id = uuidv7();
  let serviceId: string | null = null;
  if (semis.serviceCode !== undefined) {
    const service = await bd().query<{ id: string }>('SELECT id FROM services WHERE code = $1', [
      semis.serviceCode,
    ]);
    serviceId = service.rows[0]?.id ?? null;
    if (serviceId === null) throw new Error(`service ${semis.serviceCode} absent du seed`);
  }
  await bd().query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                             person_name, person_email, person_role, person_service_id,
                             consent_given, scheduled_at, started_at, ended_at,
                             schedule_status, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, $5, $6, $7, $8, $9,
             '2026-10-14T07:30:00Z', '2026-10-14T07:30:00Z', '2026-10-14T09:00:00Z',
             'realise', 'termine', now(), now())`,
    [
      id,
      semis.missionId,
      semis.conduitPar,
      semis.orgUnitId,
      semis.nomPersonne ?? null,
      semis.courriel ?? null,
      semis.fonction ?? null,
      serviceId,
      semis.consentement,
    ],
  );
  return id;
}

async function semerQuestionFigee(semis: {
  readonly missionId: string;
  readonly blocCode: string;
  readonly texte: string;
  readonly position: number;
  readonly typeReponse?: string;
}): Promise<string> {
  const bloc = await bd().query<{ id: string }>('SELECT id FROM blocks WHERE code = $1', [
    semis.blocCode,
  ]);
  const blocId = bloc.rows[0]?.id;
  if (blocId === undefined) throw new Error(`bloc ${semis.blocCode} absent du seed`);
  const questionId = uuidv7();
  const type = semis.typeReponse ?? 'yes_no';
  await bd().query(
    `INSERT INTO questions (id, code, block_id, version, status, text_fr, answer_type,
                            weight, criticality, origin, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'active', $4, $5, 1, 'important', 'banque', now(), now())`,
    [questionId, `l7c_${questionId}`, blocId, semis.texte, type],
  );
  const missionQuestionId = uuidv7();
  await bd().query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                    answer_type_snapshot, criticality_snapshot, position,
                                    added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, $5, 'important', $6, false)`,
    [missionQuestionId, semis.missionId, questionId, semis.texte, type, semis.position],
  );
  return missionQuestionId;
}

async function semerReponse(semis: {
  readonly interviewId: string;
  readonly missionQuestionId: string;
  readonly valeur?: unknown;
}): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO answers (id, interview_id, mission_question_id, value, source, withheld,
                          hors_parcours, flag_review, not_applicable, revision,
                          created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, 'entretien', false, false, false, false, 1,
             '2026-10-14T07:40:00Z', '2026-10-14T07:40:00Z')`,
    [
      id,
      semis.interviewId,
      semis.missionQuestionId,
      semis.valeur === undefined ? null : JSON.stringify(semis.valeur),
    ],
  );
  return id;
}

/** Un cadrage SENTINELLE — l'unique porte de test vers les montants (invariant 3). */
async function semerCadrageSentinelle(mission: MissionSemee, adminId: string): Promise<void> {
  const cadrage = uuidv7();
  await bd().query(
    `INSERT INTO scoping_estimates (id, company_id, mission_id, workload_days, team_size,
                                    calendar_days, status, created_by)
     VALUES ($1, $2, $3, 18, 3, 30, 'brouillon', $4)`,
    [cadrage, mission.companyId, mission.id, adminId],
  );
  await semerVoletFinancierSentinelle(bd(), cadrage, adminId);
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l7c_export');
  nomBase = base.nom;
  await appliquerMontee(base.url);

  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  client = await connecter(base.url);

  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;
}, 300_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// 1. LE CHEMIN NOMINAL — une archive qui s'ouvre, avec les dix fichiers du §36.3
// =============================================================================
describe('le chemin nominal — un ZIP, ses dix fichiers, et sa forme', () => {
  it('rend 200, `application/zip`, et un nom de fichier `export_mission_<id>_<AAAAMMJJ>.zip`', async () => {
    const membre = await creerCompte('consultant', 'nominal');
    const mission = await semerMission();
    await rattacher(mission.id, membre.id);
    await semerUnite({ missionId: mission.id });

    const reponse = await telecharger(mission.id, { jeton: membre.jeton });

    expect(reponse.statut).toBe(200);
    expect(reponse.typeContenu).toContain('application/zip');
    expect(reponse.disposition).toMatch(
      new RegExp(`attachment; filename="export_mission_${mission.id}_\\d{8}\\.zip"`),
    );
    // Un ZIP commence par PK\\3\\4 : la preuve la plus courte que le corps n'est
    // pas une enveloppe JSON d'erreur rendue avec un 200.
    expect(reponse.octets.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('contient exactement les dix fichiers du §36.3, et PAS `scores.csv`', async () => {
    const membre = await creerCompte('consultant', 'dix-fichiers');
    const mission = await semerMission();
    await rattacher(mission.id, membre.id);

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });

    expect([...archive.keys()].sort()).toEqual([...FICHIERS_ATTENDUS].sort());
    expect(archive.has('scores.csv'), 'L8 n’écrit encore aucun score : le §36.3 dit ABSENT').toBe(
      false,
    );
  });

  it('pose le BOM sur les CSV (Excel FR) et JAMAIS sur `mission.json`', async () => {
    const membre = await creerCompte('consultant', 'bom');
    const mission = await semerMission();
    await rattacher(mission.id, membre.id);

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);

    expect(archive.get('reponses.csv')?.subarray(0, 3)).toEqual(bom);
    expect(archive.get('arbre.csv')?.subarray(0, 3)).toEqual(bom);
    // Un BOM devant un JSON fait échouer `JSON.parse` en mode strict : la preuve
    // est le parse lui-même, pas la comparaison d'octets.
    expect(archive.get('mission.json')?.subarray(0, 3)).not.toEqual(bom);
    expect(() => {
      JSON.parse(texteDuFichier(archive, 'mission.json'));
    }).not.toThrow();
  });

  it('signale dans `mission.json` l’absence des scores et des fichiers joints', async () => {
    const membre = await creerCompte('consultant', 'signalements');
    const mission = await semerMission();
    await rattacher(mission.id, membre.id);

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });
    const meta = JSON.parse(texteDuFichier(archive, 'mission.json')) as {
      scores: { presents: boolean; motif: string | null };
      piecesJointes: { fichiersInclus: boolean; motif: string | null };
      repondants: { nomsInclus: boolean };
    };

    expect(meta.scores.presents).toBe(false);
    expect(meta.scores.motif).toBeTruthy();
    expect(meta.piecesJointes.fichiersInclus).toBe(false);
    expect(meta.piecesJointes.motif).toBeTruthy();
    expect(meta.repondants.nomsInclus).toBe(false);
  });

  it('garde les réponses d’une unité HORS PÉRIMÈTRE dans le même fichier, marquées', async () => {
    const membre = await creerCompte('consultant', 'hors-perimetre');
    const mission = await semerMission({ blocsActifs: ['bloc_1'] });
    await rattacher(mission.id, membre.id);
    const unite = await semerUnite({ missionId: mission.id, dansLePerimetre: false });
    const session = await semerSession({
      missionId: mission.id,
      orgUnitId: unite,
      conduitPar: membre.id,
      consentement: true,
    });
    const question = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question fictive hors périmètre',
      position: 1,
    });
    const reponse = await semerReponse({
      interviewId: session,
      missionQuestionId: question,
      valeur: { type: 'yes_no', v: 'oui' },
    });

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });

    // POSITIF : la réponse est là (§36.3 V2.8 — « jamais deux fichiers »).
    expect(colonneDeLaReponse(archive, reponse, 'valeur')).toBe('Oui');
    // ET marquée.
    expect(colonneDeLaReponse(archive, reponse, 'unite_in_scope')).toBe('non');
    // L'annexe §25.1 la liste aussi, en tant qu'UNITÉ.
    expect(lignesDuCsv(archive, 'unites_hors_perimetre.csv')).toHaveLength(2);
  });
});

// =============================================================================
// 2. L'ACCÈS — 404 pour le non-membre, jamais 403
// =============================================================================
describe('l’accès à l’export — la convention de L7b, tenue', () => {
  it('rend 404 à un consultant NON membre : un 403 dirait que la mission existe', async () => {
    const membre = await creerCompte('consultant', 'acces-membre');
    const etranger = await creerCompte('consultant', 'acces-etranger');
    const mission = await semerMission();
    await rattacher(mission.id, membre.id);
    await semerUnite({ missionId: mission.id });

    const refus = await telecharger(mission.id, { jeton: etranger.jeton });
    expect(refus.statut).toBe(404);
    expect(refus.texte).toContain('NOT_FOUND');
    expect(refus.texte).not.toContain('FORBIDDEN');

    // CONTRÔLE DE VACUITÉ : la même mission SERT le membre. Sans lui, un 404 dû à
    // une route absente rendrait ce test vert.
    const servie = await telecharger(mission.id, { jeton: membre.jeton });
    expect(servie.statut).toBe(200);
  });

  it('rend 401 sans jeton', async () => {
    const membre = await creerCompte('consultant', 'acces-anonyme');
    const mission = await semerMission();
    await rattacher(mission.id, membre.id);

    const refus = await telecharger(mission.id);
    expect(refus.statut).toBe(401);
  });

  it('sert un ADMINISTRATEUR non membre — la console est la sienne (§34.1)', async () => {
    const admin = await creerCompte('admin', 'acces-admin');
    const mission = await semerMission();
    await semerUnite({ missionId: mission.id });

    const reponse = await telecharger(mission.id, { jeton: admin.jeton });
    expect(reponse.statut).toBe(200);
  });

  it('rend 404 sur une mission qui n’existe pas — le même message, le même code', async () => {
    const admin = await creerCompte('admin', 'acces-inexistante');
    const refus = await telecharger(uuidv7(), { jeton: admin.jeton });
    expect(refus.statut).toBe(404);
  });
});

// =============================================================================
// 3. LA PORTE DU CONSENTEMENT — six cases, une seule ouverte (B-1)
// =============================================================================
describe('la porte du consentement, en SQL — les TROIS champs ensemble (B-1)', () => {
  interface Semis {
    readonly mission: MissionSemee;
    readonly jeton: string;
    readonly reponses: { readonly consenti: string; readonly refuse: string; readonly nul: string };
  }

  async function semerTroisConsentements(): Promise<Semis> {
    const membre = await creerCompte('consultant', 'consentement');
    const mission = await semerMission({ blocsActifs: ['bloc_1'] });
    await rattacher(mission.id, membre.id);
    const unite = await semerUnite({ missionId: mission.id, nom: 'Unité du consentement' });
    const question = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question fictive du consentement',
      position: 1,
    });

    const reponses: Record<string, string> = {};
    for (const [cle, consentement] of [
      ['consenti', true],
      ['refuse', false],
      ['nul', null],
    ] as const) {
      const session = await semerSession({
        missionId: mission.id,
        orgUnitId: unite,
        conduitPar: membre.id,
        consentement,
        nomPersonne: `${NOM_LEURRE} ${cle}`,
        fonction: `${FONCTION_LEURRE} ${cle}`,
        courriel: COURRIEL_LEURRE,
        serviceCode: 'rh',
      });
      reponses[cle] = await semerReponse({
        interviewId: session,
        missionQuestionId: question,
        valeur: { type: 'yes_no', v: 'oui' },
      });
    }

    return {
      mission,
      jeton: membre.jeton,
      reponses: {
        consenti: reponses.consenti ?? '',
        refuse: reponses.refuse ?? '',
        nul: reponses.nul ?? '',
      },
    };
  }

  it('SANS le paramètre : aucun des trois champs ne sort, même pour un consentement acquis', async () => {
    const semis = await semerTroisConsentements();
    const archive = await archiveDe(semis.mission.id, { jeton: semis.jeton });

    for (const answerId of Object.values(semis.reponses)) {
      expect(colonneDeLaReponse(archive, answerId, 'nom_repondant')).toBe('');
      expect(colonneDeLaReponse(archive, answerId, 'fonction_repondant')).toBe('');
      expect(colonneDeLaReponse(archive, answerId, 'service_repondant')).toBe('');
    }
    // CONTRÔLE DE VACUITÉ : l'unité, elle, est bien là — l'archive n'est pas vide.
    expect(colonneDeLaReponse(archive, semis.reponses.consenti, 'unite_nom')).toBe(
      'Unité du consentement',
    );
  });

  it('AVEC le paramètre : les trois champs sortent pour le consentement ACQUIS, et pour lui seul', async () => {
    const semis = await semerTroisConsentements();
    const archive = await archiveDe(semis.mission.id, {
      jeton: semis.jeton,
      repondants: true,
    });

    // ① Consentement VRAI → les trois champs.
    expect(colonneDeLaReponse(archive, semis.reponses.consenti, 'nom_repondant')).toBe(
      `${NOM_LEURRE} consenti`,
    );
    expect(colonneDeLaReponse(archive, semis.reponses.consenti, 'fonction_repondant')).toBe(
      `${FONCTION_LEURRE} consenti`,
    );
    expect(colonneDeLaReponse(archive, semis.reponses.consenti, 'service_repondant')).toBeTruthy();

    // ② Consentement REFUSÉ et ③ INCONNU → rien, et les TROIS champs, pas le nom seul.
    for (const cle of ['refuse', 'nul'] as const) {
      expect(colonneDeLaReponse(archive, semis.reponses[cle], 'nom_repondant')).toBe('');
      expect(
        colonneDeLaReponse(archive, semis.reponses[cle], 'fonction_repondant'),
        'B-1 : la fonction identifie autant que le nom dans une petite structure',
      ).toBe('');
      expect(colonneDeLaReponse(archive, semis.reponses[cle], 'service_repondant')).toBe('');
    }
  });

  it('ne fait JAMAIS sortir `person_email`, sous aucune condition', async () => {
    const semis = await semerTroisConsentements();
    for (const repondants of [false, true]) {
      const archive = await archiveDe(semis.mission.id, { jeton: semis.jeton, repondants });
      for (const [nom, octets] of archive) {
        expect(octets.toString('utf8'), `${nom} porte un courriel de répondant`).not.toContain(
          COURRIEL_LEURRE,
        );
      }
    }
  });

  it('`sessions.csv` ferme la même porte que `reponses.csv`', async () => {
    const semis = await semerTroisConsentements();

    const fermee = await archiveDe(semis.mission.id, { jeton: semis.jeton });
    expect(texteDuFichier(fermee, 'sessions.csv')).not.toContain(NOM_LEURRE);
    expect(texteDuFichier(fermee, 'sessions.csv')).not.toContain(FONCTION_LEURRE);

    const ouverte = await archiveDe(semis.mission.id, { jeton: semis.jeton, repondants: true });
    expect(texteDuFichier(ouverte, 'sessions.csv')).toContain(`${NOM_LEURRE} consenti`);
    expect(texteDuFichier(ouverte, 'sessions.csv')).not.toContain(`${NOM_LEURRE} refuse`);
    expect(texteDuFichier(ouverte, 'sessions.csv')).not.toContain(`${FONCTION_LEURRE} nul`);
  });

  it('refuse une graphie approximative du paramètre — une porte de donnée personnelle ne se devine pas', async () => {
    const semis = await semerTroisConsentements();
    const reponse = await api().inject({
      method: 'GET',
      url: `/v1/missions/${semis.mission.id}/export?repondants=1`,
      headers: { 'x-forwarded-for': ipUnique(), authorization: `Bearer ${semis.jeton}` },
    });
    expect(reponse.statusCode).toBe(400);
    expect(reponse.body).toContain('VALIDATION_FAILED');
  });
});

// =============================================================================
// 4. L'ÉTANCHÉITÉ FINANCIÈRE — SUR L'ARCHIVE DÉCOMPRESSÉE
// =============================================================================
describe('étanchéité financière — cherchée dans les dix fichiers, pas dans un corps compressé', () => {
  it('aucun montant ni nom de champ financier, pour aucun rôle — et la réponse d’audit `money` reste', async () => {
    const admin = await creerCompte('admin', 'etanche-admin');
    const consultant = await creerCompte('consultant', 'etanche-consultant');
    const analyste = await creerCompte('analyste', 'etanche-analyste');
    const lecteur = await creerCompte('lecteur', 'etanche-lecteur');
    const mission = await semerMission({ blocsActifs: ['bloc_1'] });
    for (const compte of [consultant, analyste, lecteur]) {
      await rattacher(mission.id, compte.id);
    }
    await semerCadrageSentinelle(mission, admin.id);

    const unite = await semerUnite({ missionId: mission.id, nom: 'Unité chiffrée' });
    const session = await semerSession({
      missionId: mission.id,
      orgUnitId: unite,
      conduitPar: consultant.id,
      consentement: true,
    });
    const question = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Quel est le budget annuel de l’outil ?',
      position: 1,
      typeReponse: 'money',
    });
    // Une réponse d'AUDIT de type `money` : un chiffre donné par le client au
    // consultant. Elle DOIT sortir — ce n'est pas la donnée commerciale d'Axion.
    const reponse = await semerReponse({
      interviewId: session,
      missionQuestionId: question,
      valeur: { type: 'money', v: 41337, currency: 'EUR' },
    });

    for (const compte of [admin, consultant, analyste, lecteur]) {
      const archive = await archiveDe(mission.id, { jeton: compte.jeton });

      for (const [nomFichier, octets] of archive) {
        const texte = octets.toString('utf8');
        expect(
          detecterSentinelles(texte, VALEURS_SENTINELLES),
          `${nomFichier} porte un montant de scoping_financials`,
        ).toEqual([]);
        for (const interdit of NOMS_FINANCIERS_INTERDITS) {
          expect(texte, `${nomFichier} NOMME un champ financier : ${interdit}`).not.toContain(
            interdit,
          );
        }
      }

      // CONTRÔLE DE VACUITÉ, et la distinction qui fait tout : la réponse d'audit
      // `money` EST dans l'archive. Sans elle, l'absence prouverait un export vide.
      expect(colonneDeLaReponse(archive, reponse, 'valeur')).toContain('41337');
    }
  });
});

// =============================================================================
// 5. UN FUSEAU PAR SITE AUDITÉ (M-1)
// =============================================================================
describe('les horodatages — l’heure du SITE, héritée de l’arbre (§22.2)', () => {
  it('écrit DEUX décalages dans le même `reponses.csv`, et l’enfant hérite du sien', async () => {
    const membre = await creerCompte('consultant', 'fuseaux');
    const mission = await semerMission({ timezone: 'Europe/Paris', blocsActifs: ['bloc_1'] });
    await rattacher(mission.id, membre.id);

    // Le siège n'a pas de fuseau propre : il hérite de la mission (Paris, +02:00
    // le 14 octobre). L'usine porte le sien, et son atelier n'en porte pas — il
    // doit hériter de l'USINE, pas de la mission : c'est tout l'« héritage arbre ».
    const siege = await semerUnite({ missionId: mission.id, nom: 'Siège', timezone: null });
    const usine = await semerUnite({
      missionId: mission.id,
      nom: 'Usine lointaine',
      timezone: 'Asia/Singapore',
    });
    const atelier = await semerUnite({
      missionId: mission.id,
      nom: 'Atelier de l’usine',
      parentId: usine,
      timezone: null,
    });

    const question = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question fictive des fuseaux',
      position: 1,
    });

    const reponses: Record<string, string> = {};
    for (const [cle, unite] of [
      ['siege', siege],
      ['usine', usine],
      ['atelier', atelier],
    ] as const) {
      const session = await semerSession({
        missionId: mission.id,
        orgUnitId: unite,
        conduitPar: membre.id,
        consentement: true,
      });
      reponses[cle] = await semerReponse({
        interviewId: session,
        missionQuestionId: question,
        valeur: { type: 'yes_no', v: 'oui' },
      });
    }

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });

    // La réponse est horodatée `2026-10-14T07:40:00Z` en base.
    expect(colonneDeLaReponse(archive, reponses.siege ?? '', 'horodatage')).toBe(
      '2026-10-14T09:40:00+02:00',
    );
    expect(colonneDeLaReponse(archive, reponses.usine ?? '', 'horodatage')).toBe(
      '2026-10-14T15:40:00+08:00',
    );
    expect(
      colonneDeLaReponse(archive, reponses.atelier ?? '', 'horodatage'),
      'l’atelier n’a pas de fuseau : il hérite de son USINE, pas de la mission',
    ).toBe('2026-10-14T15:40:00+08:00');
  });

  it('publie le fuseau EFFECTIF de chaque unité dans `arbre.csv`', async () => {
    const membre = await creerCompte('consultant', 'fuseau-arbre');
    const mission = await semerMission({ timezone: 'Europe/Paris' });
    await rattacher(mission.id, membre.id);
    await semerUnite({ missionId: mission.id, nom: 'Site distant', timezone: 'Asia/Tokyo' });

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });
    const lignes = lignesDuCsv(archive, 'arbre.csv');
    const entete = cellulesDeLigne(lignes[0] ?? '');
    const colonne = entete.indexOf('fuseau');

    expect(colonne).toBeGreaterThanOrEqual(0);
    expect(cellulesDeLigne(lignes[1] ?? '')[colonne]).toBe('Asia/Tokyo');
  });

  it('écrit la règle du fuseau DANS l’archive, avant les données', async () => {
    const membre = await creerCompte('consultant', 'fuseau-regle');
    const mission = await semerMission();
    await rattacher(mission.id, membre.id);

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });
    const meta = JSON.parse(texteDuFichier(archive, 'mission.json')) as {
      formatHorodatage: string;
      fuseau: string;
    };

    expect(meta.formatHorodatage).toMatch(/site audité/i);
    expect(meta.fuseau).toBe('Europe/Paris');
  });
});

// =============================================================================
// 6. LA JOINTURE QUI REND LE §36.6-2 VÉRIFIABLE
// =============================================================================
describe('constats.csv → reponses.csv — une citation qui se relit', () => {
  it('porte `answer_id` et `session_id` en tête de `reponses.csv`', async () => {
    const membre = await creerCompte('consultant', 'jointure');
    const mission = await semerMission({ blocsActifs: ['bloc_1'] });
    await rattacher(mission.id, membre.id);
    const unite = await semerUnite({ missionId: mission.id });
    const session = await semerSession({
      missionId: mission.id,
      orgUnitId: unite,
      conduitPar: membre.id,
      consentement: true,
    });
    const question = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question fictive de la jointure',
      position: 1,
    });
    const reponse = await semerReponse({
      interviewId: session,
      missionQuestionId: question,
      valeur: { type: 'yes_no', v: 'oui' },
    });

    const archive = await archiveDe(mission.id, { jeton: membre.jeton });
    const entete = cellulesDeLigne(lignesDuCsv(archive, 'reponses.csv')[0] ?? '');

    expect(entete[0]).toBe('answer_id');
    expect(entete[1]).toBe('session_id');
    expect(colonneDeLaReponse(archive, reponse, 'session_id')).toBe(session);
  });
});
