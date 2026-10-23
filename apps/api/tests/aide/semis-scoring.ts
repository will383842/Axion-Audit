// =============================================================================
// LOT S1 (L8 branché) — SEMIS ET OUTILS COMMUNS DES TROIS FICHIERS D'INTÉGRATION.
//
// Aucun `expect`, aucun `it` : ce module démarre un PostgreSQL réel + l'application,
// sème des missions FICTIVES (invariant 2) et rend des identifiants. Les assertions
// appartiennent aux fichiers `l8s1-*.integration.test.ts`.
//
// Il N'IMPORTE AUCUNE LIGNE du code de production du scoring branché (qui n'existe
// pas encore) : il ne parle à l'API que par HTTP (`inject`) et à la base que par SQL.
//
// ── LE JEU DE RÉFÉRENCE « PRINCIPAL » — CALCULÉ À LA MAIN, ÉCRIT AVANT LE CODE ─
// Arbre : P (racine, aucune réponse propre) ── A (effectif 20) ── B (effectif 30).
// Blocs actifs : bloc_1, bloc_2 (ordre `blocks.position`).
//
//   Q1 yes_no    bloc_1 poids 1 important  map oui=5 non=0
//   Q2 scale_1_5 bloc_1 poids 3 important  identity
//   Q3 yes_no    bloc_1 poids 1 BLOQUANT   map oui=5 non=0, red_flag values [non]
//   Q4 scale_1_5 bloc_2 poids 2 important  identity
//   Q5 number    bloc_2 poids 1 important  bandes ≤20→1, ≤50→3, au-delà→5
//
//   Session A1 (profil direction)  : Q1=oui · Q2=4 · Q3=non · Q4=2 · Q5=fourchette 20–30
//   Session A2 (profil terrain)    : Q2=1
//   Session B1 (profil terrain)    : Q1=non · Q2=2 · Q3=oui · Q4=NON COMMUNIQUÉ · (Q5 jamais posée)
//
//   A / bloc_1 : Q2 = moyenne(4 ; 1) = 2,5 → (1×5 + 3×2,5 + 1×0) / 5 = 12,5 / 5 = 2,5
//   A / bloc_2 : Q5 sur la borne BASSE 20 → 1 ; (2×2 + 1×1) / 3 = 1,6667 → 1,67
//   B / bloc_1 : (1×0 + 3×2 + 1×5) / 5 = 11 / 5 = 2,2
//   B / bloc_2 : AUCUNE question cotée → score NULL (jamais 0), complétude 0 sur 2
//   P / bloc_1 : (20×2,5 + 30×2,2) / 50 = 116 / 50 = 2,32   complétude 6/6 = 1
//   P / bloc_2 : B n'a pas de score → seul A compte → 1,67 ; complétude 2/4 = 0,5 < 0,6
//                → INDICATIF
//   Mission (racine unique P) : bloc_1 = 2,32 · bloc_2 = 1,67
//   Drapeau rouge : Q3 « non » en A1 (bloquant) — présent MALGRÉ la moyenne 2,32.
//   Divergence : Q2 en A, scores [4 ; 1] → écart-type 1,5 ≥ 1,5 ; direction 4 / terrain 1.
// =============================================================================
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

// Secrets FACTICES (11 §2).
const SECRET_ACCES = '8a'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '5b'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.s1@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

export interface Contexte {
  readonly nomBase: string;
  readonly bd: Client;
  readonly api: FastifyInstance;
  readonly fermer: () => Promise<void>;
}

/** Démarre base réelle + migrations + seed + application. */
export async function demarrerContexte(suffixe: string): Promise<Contexte> {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere(suffixe);
  await appliquerMontee(base.url);
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  const bd = await connecter(base.url);

  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../../src/app.js');
  const api = await construireApp();
  await api.ready();

  return {
    nomBase: base.nom,
    bd,
    api,
    fermer: async () => {
      await api.close();
      const { fermerBase } = await import('../../src/db.js');
      await fermerBase();
      await bd.end();
      await supprimerBaseEphemere(base.nom);
    },
  };
}

let compteurIp = 0;
export function ipUnique(): string {
  compteurIp += 1;
  return `10.81.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

// -----------------------------------------------------------------------------
// COMPTES, MISSIONS, ARBRE
// -----------------------------------------------------------------------------
export interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;
export async function creerCompte(ctx: Contexte, role: string, marqueur: string): Promise<Compte> {
  compteurCompte += 1;
  const id = uuidv7();
  await ctx.bd.query(
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
  return { id, jeton: ctx.api.jwt.sign({ sub: id }) };
}

export interface MissionSemee {
  readonly id: string;
  readonly companyId: string;
}

let compteurMission = 0;
export async function semerMission(
  ctx: Contexte,
  blocsActifs: readonly string[] = ['bloc_1', 'bloc_2'],
): Promise<MissionSemee> {
  compteurMission += 1;
  const companyId = uuidv7();
  await ctx.bd.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    companyId,
    `Entreprise fictive S1 ${String(compteurMission)}`,
  ]);
  const id = uuidv7();
  await ctx.bd.query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, timezone,
                           active_blocks, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', 'Europe/Paris', $4::jsonb,
             now(), now())`,
    [id, companyId, `Mission fictive S1 ${String(compteurMission)}`, JSON.stringify(blocsActifs)],
  );
  return { id, companyId };
}

export async function rattacher(
  ctx: Contexte,
  missionId: string,
  userId: string,
  roleSurMission: 'lead' | 'consultant' | 'analyste' | 'lecteur',
): Promise<void> {
  await ctx.bd.query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, roleSurMission],
  );
}

let compteurUnite = 0;
export async function semerUnite(
  ctx: Contexte,
  semis: {
    readonly missionId: string;
    readonly nom: string;
    readonly parentId?: string | null;
    readonly effectif?: number | null;
  },
): Promise<string> {
  compteurUnite += 1;
  const id = uuidv7();
  await ctx.bd.query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, in_scope,
                            status, position, created_at, updated_at)
     VALUES ($1, $2, $3, 'service', $4, $5, true, 'active', $6, now(), now())`,
    [id, semis.missionId, semis.parentId ?? null, semis.nom, semis.effectif ?? null, compteurUnite],
  );
  return id;
}

export type Groupe = 'direction' | 'encadrement' | 'terrain';

export async function semerSession(
  ctx: Contexte,
  semis: {
    readonly missionId: string;
    readonly orgUnitId: string;
    readonly conduitPar: string;
    readonly groupe?: Groupe;
  },
): Promise<string> {
  const id = uuidv7();
  let profilId: string | null = null;
  if (semis.groupe !== undefined) {
    const profil = await ctx.bd.query<{ id: string }>(
      'SELECT id FROM interlocutor_profiles WHERE group_code = $1 ORDER BY code LIMIT 1',
      [semis.groupe],
    );
    profilId = profil.rows[0]?.id ?? null;
    if (profilId === null) throw new Error(`aucun profil du groupe ${semis.groupe} dans le seed`);
  }
  await ctx.bd.query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                             interlocutor_profile_id, consent_given,
                             scheduled_at, started_at, ended_at,
                             schedule_status, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, $5, true,
             '2026-10-14T07:30:00Z', '2026-10-14T07:30:00Z', '2026-10-14T09:00:00Z',
             'realise', 'termine', now(), now())`,
    [id, semis.missionId, semis.conduitPar, semis.orgUnitId, profilId],
  );
  return id;
}

// -----------------------------------------------------------------------------
// QUESTIONS FIGÉES ET RÉPONSES
// -----------------------------------------------------------------------------
export interface QuestionSemis {
  readonly missionId: string;
  readonly blocCode: string;
  readonly texte: string;
  readonly position: number;
  readonly typeReponse: 'yes_no' | 'scale_1_5' | 'number';
  readonly poids: number;
  readonly criticite: 'bloquant' | 'important' | 'secondaire';
  readonly scoring: unknown;
}

/** Une question de la banque + sa ligne FIGÉE `mission_questions` (snapshots). */
export async function semerQuestionFigee(ctx: Contexte, q: QuestionSemis): Promise<string> {
  const bloc = await ctx.bd.query<{ id: string }>('SELECT id FROM blocks WHERE code = $1', [
    q.blocCode,
  ]);
  const blocId = bloc.rows[0]?.id;
  if (blocId === undefined) throw new Error(`bloc ${q.blocCode} absent du seed`);
  const questionId = uuidv7();
  await ctx.bd.query(
    `INSERT INTO questions (id, code, block_id, version, status, text_fr, answer_type,
                            weight, criticality, origin, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'active', $4, $5, $6, $7, 'banque', now(), now())`,
    [questionId, `s1_${questionId}`, blocId, q.texte, q.typeReponse, q.poids, q.criticite],
  );
  const missionQuestionId = uuidv7();
  await ctx.bd.query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                    weight_snapshot, scoring_snapshot,
                                    answer_type_snapshot, criticality_snapshot, position,
                                    added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, $5, $6::jsonb, $7, $8, $9, false)`,
    [
      missionQuestionId,
      q.missionId,
      questionId,
      q.texte,
      q.poids,
      JSON.stringify(q.scoring),
      q.typeReponse,
      q.criticite,
      q.position,
    ],
  );
  return missionQuestionId;
}

export async function semerReponse(
  ctx: Contexte,
  semis: {
    readonly interviewId: string;
    readonly missionQuestionId: string;
    readonly valeur?: unknown;
    readonly nonCommunique?: boolean;
    readonly sansObjet?: boolean;
  },
): Promise<string> {
  const id = uuidv7();
  await ctx.bd.query(
    `INSERT INTO answers (id, interview_id, mission_question_id, value, source, withheld,
                          withheld_reason, hors_parcours, flag_review, not_applicable, na_reason,
                          revision, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, 'entretien', $5, $6, false, false, $7, $8, 1,
             '2026-10-14T07:40:00Z', '2026-10-14T07:40:00Z')`,
    [
      id,
      semis.interviewId,
      semis.missionQuestionId,
      semis.valeur === undefined ? null : JSON.stringify(semis.valeur),
      semis.nonCommunique === true,
      semis.nonCommunique === true ? 'confidentiel' : null,
      semis.sansObjet === true,
      semis.sansObjet === true ? 'autre' : null,
    ],
  );
  return id;
}

/** Corrige une réponse EN PLACE comme le fait la sync : valeur neuve, révision + 1. */
export async function corrigerReponse(
  ctx: Contexte,
  answerId: string,
  valeur: unknown,
): Promise<void> {
  await ctx.bd.query(
    `UPDATE answers SET value = $2::jsonb, revision = revision + 1, updated_at = now()
      WHERE id = $1`,
    [answerId, JSON.stringify(valeur)],
  );
}

// -----------------------------------------------------------------------------
// LE JEU PRINCIPAL
// -----------------------------------------------------------------------------
export interface JeuPrincipal {
  readonly mission: MissionSemee;
  readonly lead: Compte;
  readonly admin: Compte;
  readonly unites: { readonly p: string; readonly a: string; readonly b: string };
  readonly questions: {
    readonly q1: string;
    readonly q2: string;
    readonly q3: string;
    readonly q4: string;
    readonly q5: string;
  };
  readonly reponses: {
    readonly a1q1: string;
    readonly a1q2: string;
    readonly a1q3: string;
    readonly a1q4: string;
    readonly a1q5: string;
    readonly a2q2: string;
    readonly b1q1: string;
    readonly b1q2: string;
    readonly b1q3: string;
    readonly b1q4: string;
  };
  readonly sessions: { readonly a1: string; readonly a2: string; readonly b1: string };
}

export const BAREME_OUI_NON = { map: { oui: 5, non: 0 } } as const;
export const BAREME_OUI_NON_DRAPEAU = {
  map: { oui: 5, non: 0 },
  red_flag: { values: ['non'] },
} as const;
export const BAREME_IDENTITE = { map: 'identity' } as const;
export const BAREME_BANDES = {
  bands: [{ max: 20, score: 1 }, { max: 50, score: 3 }, { score: 5 }],
} as const;

export async function semerJeuPrincipal(ctx: Contexte): Promise<JeuPrincipal> {
  const admin = await creerCompte(ctx, 'admin', 'jeu-principal-admin');
  const lead = await creerCompte(ctx, 'consultant', 'jeu-principal-lead');
  const mission = await semerMission(ctx);
  await rattacher(ctx, mission.id, lead.id, 'lead');

  const p = await semerUnite(ctx, { missionId: mission.id, nom: 'Unité racine P', effectif: null });
  const a = await semerUnite(ctx, {
    missionId: mission.id,
    nom: 'Unité A',
    parentId: p,
    effectif: 20,
  });
  const b = await semerUnite(ctx, {
    missionId: mission.id,
    nom: 'Unité B',
    parentId: p,
    effectif: 30,
  });

  const base = { missionId: mission.id } as const;
  const q1 = await semerQuestionFigee(ctx, {
    ...base,
    blocCode: 'bloc_1',
    texte: 'Question fictive 1',
    position: 1,
    typeReponse: 'yes_no',
    poids: 1,
    criticite: 'important',
    scoring: BAREME_OUI_NON,
  });
  const q2 = await semerQuestionFigee(ctx, {
    ...base,
    blocCode: 'bloc_1',
    texte: 'Question fictive 2',
    position: 2,
    typeReponse: 'scale_1_5',
    poids: 3,
    criticite: 'important',
    scoring: BAREME_IDENTITE,
  });
  const q3 = await semerQuestionFigee(ctx, {
    ...base,
    blocCode: 'bloc_1',
    texte: 'Question fictive 3',
    position: 3,
    typeReponse: 'yes_no',
    poids: 1,
    criticite: 'bloquant',
    scoring: BAREME_OUI_NON_DRAPEAU,
  });
  const q4 = await semerQuestionFigee(ctx, {
    ...base,
    blocCode: 'bloc_2',
    texte: 'Question fictive 4',
    position: 4,
    typeReponse: 'scale_1_5',
    poids: 2,
    criticite: 'important',
    scoring: BAREME_IDENTITE,
  });
  const q5 = await semerQuestionFigee(ctx, {
    ...base,
    blocCode: 'bloc_2',
    texte: 'Question fictive 5',
    position: 5,
    typeReponse: 'number',
    poids: 1,
    criticite: 'important',
    scoring: BAREME_BANDES,
  });

  const a1 = await semerSession(ctx, {
    missionId: mission.id,
    orgUnitId: a,
    conduitPar: lead.id,
    groupe: 'direction',
  });
  const a2 = await semerSession(ctx, {
    missionId: mission.id,
    orgUnitId: a,
    conduitPar: lead.id,
    groupe: 'terrain',
  });
  const b1 = await semerSession(ctx, {
    missionId: mission.id,
    orgUnitId: b,
    conduitPar: lead.id,
    groupe: 'terrain',
  });

  const a1q1 = await semerReponse(ctx, {
    interviewId: a1,
    missionQuestionId: q1,
    valeur: { type: 'yes_no', v: 'oui' },
  });
  const a1q2 = await semerReponse(ctx, {
    interviewId: a1,
    missionQuestionId: q2,
    valeur: { type: 'scale_1_5', v: 4 },
  });
  const a1q3 = await semerReponse(ctx, {
    interviewId: a1,
    missionQuestionId: q3,
    valeur: { type: 'yes_no', v: 'non' },
  });
  const a1q4 = await semerReponse(ctx, {
    interviewId: a1,
    missionQuestionId: q4,
    valeur: { type: 'scale_1_5', v: 2 },
  });
  const a1q5 = await semerReponse(ctx, {
    interviewId: a1,
    missionQuestionId: q5,
    valeur: { type: 'range', low: 20, high: 30 },
  });
  const a2q2 = await semerReponse(ctx, {
    interviewId: a2,
    missionQuestionId: q2,
    valeur: { type: 'scale_1_5', v: 1 },
  });
  const b1q1 = await semerReponse(ctx, {
    interviewId: b1,
    missionQuestionId: q1,
    valeur: { type: 'yes_no', v: 'non' },
  });
  const b1q2 = await semerReponse(ctx, {
    interviewId: b1,
    missionQuestionId: q2,
    valeur: { type: 'scale_1_5', v: 2 },
  });
  const b1q3 = await semerReponse(ctx, {
    interviewId: b1,
    missionQuestionId: q3,
    valeur: { type: 'yes_no', v: 'oui' },
  });
  const b1q4 = await semerReponse(ctx, {
    interviewId: b1,
    missionQuestionId: q4,
    nonCommunique: true,
  });

  return {
    mission,
    lead,
    admin,
    unites: { p, a, b },
    questions: { q1, q2, q3, q4, q5 },
    reponses: { a1q1, a1q2, a1q3, a1q4, a1q5, a2q2, b1q1, b1q2, b1q3, b1q4 },
    sessions: { a1, a2, b1 },
  };
}

// -----------------------------------------------------------------------------
// APPELS ET LECTURES
// -----------------------------------------------------------------------------
export interface ReponseCalcul {
  readonly statut: number;
  readonly texte: string;
  readonly json: Record<string, unknown> | null;
}

/** `POST /v1/missions/:id/compute-scores` — corps vide, comme au 05 §8.5. */
export async function calculer(
  ctx: Contexte,
  missionId: string,
  jeton?: string,
): Promise<ReponseCalcul> {
  const reponse = await ctx.api.inject({
    method: 'POST',
    url: `/v1/missions/${missionId}/compute-scores`,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(jeton === undefined ? {} : { authorization: `Bearer ${jeton}` }),
    },
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(reponse.body) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { statut: reponse.statusCode, texte: reponse.body, json };
}

export interface LigneBloc {
  readonly code: string;
  readonly score: string | null;
  readonly completeness: string | null;
  readonly is_indicative: boolean;
  readonly computed_at: Date | null;
  readonly details: Record<string, unknown> | null;
}

export async function lireBlockScores(ctx: Contexte, missionId: string): Promise<LigneBloc[]> {
  const r = await ctx.bd.query<LigneBloc>(
    `SELECT b.code, s.score, s.completeness, s.is_indicative, s.computed_at, s.details
       FROM block_scores s JOIN blocks b ON b.id = s.block_id
      WHERE s.mission_id = $1 ORDER BY b.position, b.code`,
    [missionId],
  );
  return r.rows;
}

export interface LigneUnite {
  readonly org_unit_id: string;
  readonly code: string;
  readonly score: string | null;
  readonly answers_count: number | null;
  readonly completeness: string | null;
  readonly computed_at: Date | null;
}

export async function lireUnitScores(ctx: Contexte, missionId: string): Promise<LigneUnite[]> {
  const r = await ctx.bd.query<LigneUnite>(
    `SELECT s.org_unit_id, b.code, s.score, s.answers_count, s.completeness, s.computed_at
       FROM unit_scores s JOIN blocks b ON b.id = s.block_id
      WHERE s.mission_id = $1 ORDER BY s.org_unit_id, b.position, b.code`,
    [missionId],
  );
  return r.rows;
}

/** Le score d'une cellule unité × bloc, en nombre (ou `null`). */
export function nombreOuNull(valeur: string | null | undefined): number | null {
  return valeur === null || valeur === undefined ? null : Number(valeur);
}
