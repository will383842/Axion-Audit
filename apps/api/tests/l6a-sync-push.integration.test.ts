// =============================================================================
// LOT L6 / INCRÉMENT L6a « LA MONTÉE » — `POST /v1/sync/push`, ÉPROUVÉ SUR UN
// POSTGRESQL RÉEL : contrat §9.3, idempotence 11 §4, propriété §9.9, scénario 5,
// `sync_log` (amendement A-3).
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER A ÉTÉ ÉCRIT AVANT LE CODE QU'IL ÉPROUVE, ET SANS L'AVOIR LU.
// ═══════════════════════════════════════════════════════════════════════════════
// 09 §3-2 (TDD sur la sync et la propriété) et 09 §5.6 (le testeur n'est jamais
// l'auteur). Au moment de la rédaction, `apps/api/src/sync/**` n'existe pas. Les
// attentes viennent de la SPÉCIFICATION, et d'elle seule :
//   · 05 §9.3 — les cinq résultats et leur sens ; la révision `terrain` matérialisée
//     par le SERVEUR quand `value` change (V2.9) ;
//   · 05 §9.4 — dernier-écrit-gagne PAR LIGNE sur `client_updated_at`, et « toute
//     valeur écrasée est archivée dans `answer_revisions` » ;
//   · 05 §9.9 — écritures de sync réservées au propriétaire de la session ; admin et
//     lead corrigent par l'API siège, JAMAIS par le push ;
//   · 11 §3 (format d'erreur) et 11 §4 (format d'op, `processed_ops`, upsert par
//     UUID d'entité, op `question_adhoc` atomique) ;
//   · 04 — `processed_ops`, `sync_log`, `answers` (UNIQUE interview × question),
//     `answer_revisions` (S-4 : trois entités), `attachments` (S-3 : `created_by`) ;
//   · `docs/conception/LOT_L6.md` §3bis (A-3), §3ter C.1, §5 PD3/PD4/PD5 ;
//   · DECISIONS (archive 2026-09-05) — « La propriété §9.9 ne couvre que 3 des 5
//     entités » : option 1, propriétaire = l'auteur pour `org_unit_proposal` et
//     `question_adhoc` ; le serveur ne croit JAMAIS `createdBy` ni `conductedBy`.
//   · `packages/shared/src/sync.ts` — contrat GELÉ, importé tel quel : c'est un
//     contrat PARTAGÉ (le terrain l'importe aussi), pas le code du lot.
//
// ── HYPOTHÈSES D'INTERFACE (le pack est muet — elles sont TRACÉES, pas devinées) ─
// Toutes concentrées dans la section « FORMES DES CHARGES » : un seul endroit à
// corriger si l'implémenteur lit autrement, après arbitrage.
//   H1. (ARBITRÉ par la coordination, 2026-10-09) La charge de chaque entité est
//       EXACTEMENT le camelCase des colonnes du 04 écrivables par le terrain
//       (liste fermée : `CLES_ACCEPTEES` ci-dessous). Une clé inconnue → l'op est
//       refusée (`error`, comme toute charge illisible), rien n'est écrit. Les
//       clés d'auteur déclaré (`conductedBy`, `createdBy`, `proposedBy`) sont
//       ADMISES mais jamais crues (§9.9) : autre que l'émetteur → `forbidden`.
//   H2. (ARBITRÉ, 2026-10-09) `question_adhoc` :
//       `{ question: {…, blockCode}, missionQuestion: { id, position } }`. Le
//       terrain ne connaît que le CODE de bloc ; le serveur le résout dans
//       `blocks`. Code inconnu → `error` (une référence inconnue du siège, même
//       traitement que l'unité ou la question de mission inconnues — PD4 ; et
//       `error` reste visible « à examiner » au 10e échec, jamais silencieux).
//   H3. `org_unit_proposal` : propriétaire = `org_units.proposed_by`.
//       `question_adhoc` : propriétaire = `questions.created_by`.
//   H4. Un lot de plus de 100 opérations, ou mal formé, est refusé EN ENTIER au
//       format 11 §3 : 400 `VALIDATION_FAILED` (413 `PAYLOAD_TOO_LARGE` est toléré
//       pour le seul dépassement de taille — le pack ne tranche pas).
//   H5. Un émetteur SANS DROIT DE ROUTE (lecteur, admin, non-membre) peut être
//       refusé soit lot entier (403 `FORBIDDEN`, 404 pour le non-membre), soit op
//       par op (`forbidden`). La SUBSTANCE est exigée — rien n'est écrit —, le
//       choix entre les deux formes est signalé, pas deviné. Un AUDITEUR MEMBRE de
//       la mission, lui, reçoit TOUJOURS une réponse 200 op par op : c'est le
//       contrat §9.3 en propre.
//   H6. Une ligne `sync_log` par lot ABOUTI (réponse 200), aucune pour un lot
//       refusé en entier ; `conflicts_count` = superseded + forbidden + error.
//
// ── CE QUE CE FICHIER NE PROUVE PAS, dit franchement ─────────────────────────
//   · `delete_soft` : ni `interviews` ni `answers` ne portent `deleted_at` au 04
//     ni dans les migrations — l'action n'a pas de cible écrite. Doute rapporté ;
//   · le rôle `analyste` : aucun texte ne dit s'il écrit par le push ;
//   · une session planifiée SANS auditeur (`conducted_by` NULL, migration 0014) :
//     aucun texte ne dit qui peut la « prendre » par le push ;
//   · le comportement CLIENT de chaque résultat (sortie d'outbox, backoff) : il
//     appartient à A26, sous `apps/field/src/sync/`.
//
// Invariant 2 : aucune référence client — libellés neutres, missions fictives.
// Secrets factices (11 §2).
// Traçabilité : E7, E9 (sync sans conflit) · E33 · invariants 1, 3 et 7.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ERROR_CODES,
  ENTITES_SYNC,
  RESULTATS_OP,
  TAILLE_LOT_PUSH_MAX,
  reponsePushSchema,
  type EntiteSync,
  type ReponsePush,
  type ResultatOp,
} from '@axion/shared';
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

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '6b'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '3c'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l6a@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

const ROUTE_PUSH = '/v1/sync/push';

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let urlBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
let blocId = '';
let blocCode = '';

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

// =============================================================================
// APPEL DE LA ROUTE
// =============================================================================
const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

interface ReponseHttp {
  readonly statut: number;
  readonly corps: string;
  readonly code: string | null;
  readonly message: string | null;
}

let compteurIp = 0;
/** Une adresse par appel : le quota global ne doit pas décider d'un verdict. */
function ipUnique(): string {
  compteurIp += 1;
  return `10.66.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

async function posterBrut(
  charge: unknown,
  options: { readonly jeton?: string; readonly autorisation?: string } = {},
): Promise<ReponseHttp> {
  const autorisation =
    options.autorisation ?? (options.jeton === undefined ? undefined : `Bearer ${options.jeton}`);
  const reponse = await api().inject({
    method: 'POST',
    url: ROUTE_PUSH,
    headers: {
      'x-forwarded-for': ipUnique(),
      'content-type': 'application/json',
      ...(autorisation === undefined ? {} : { authorization: autorisation }),
    },
    payload: JSON.stringify(charge),
  });
  let code: string | null = null;
  let message: string | null = null;
  if (reponse.body !== '') {
    try {
      const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
      if (analyse.success) {
        code = analyse.data.error.code;
        message = analyse.data.error.message;
      }
    } catch {
      // corps non JSON : laissé tel quel dans `corps`, le verdict le dira.
    }
  }
  return { statut: reponse.statusCode, corps: reponse.body, code, message };
}

// =============================================================================
// FORMES DES CHARGES — HYPOTHÈSES H1/H2, ICI ET NULLE PART AILLEURS
// =============================================================================
interface Op {
  readonly opId: string;
  readonly entity: EntiteSync;
  readonly entityId: string;
  readonly action: 'upsert' | 'delete_soft';
  readonly payload: Readonly<Record<string, unknown>>;
  readonly clientUpdatedAt: string;
}

/** Horloge de test MONOTONE : chaque appel rend un instant strictement postérieur. */
let instantBase = Date.parse('2026-10-01T08:00:00.000Z');
function instant(): string {
  instantBase += 60_000;
  return new Date(instantBase).toISOString();
}

function op(
  entity: EntiteSync,
  entityId: string,
  payload: Readonly<Record<string, unknown>>,
  clientUpdatedAt: string = instant(),
  opId: string = uuidv7(),
): Op {
  return { opId, entity, entityId, action: 'upsert', payload, clientUpdatedAt };
}

function chargeEntretien(
  missionId: string,
  orgUnitId: string,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    missionId,
    orgUnitId,
    kind: 'entretien',
    mode: 'sur_site',
    status: 'en_cours',
    scheduleStatus: 'realise',
    generalNotes: 'notes de session fictives',
    clientCreatedAt: '2026-10-01T07:00:00.000Z',
    ...extra,
  };
}

function chargeReponse(
  interviewId: string,
  missionQuestionId: string,
  valeur: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    interviewId,
    missionQuestionId,
    value: { type: 'yes_no', v: valeur },
    source: 'entretien',
    withheld: false,
    horsParcours: false,
    flagReview: false,
    notApplicable: false,
    note: null,
    clientCreatedAt: '2026-10-01T07:00:00.000Z',
    ...extra,
  };
}

function chargePiece(
  missionId: string,
  rattachement: { readonly interviewId: string | null; readonly answerId: string | null },
  contenu: string,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    missionId,
    interviewId: rattachement.interviewId,
    answerId: rattachement.answerId,
    kind: 'note',
    content: contenu,
    clientCreatedAt: '2026-10-01T07:00:00.000Z',
    ...extra,
  };
}

function chargeProposition(
  missionId: string,
  parentId: string,
  nom: string,
): Record<string, unknown> {
  return { missionId, parentId, kind: 'service', name: nom, headcount: null };
}

function chargeQuestionAdhoc(
  missionQuestionId: string,
  texte: string,
  position = 99,
): Record<string, unknown> {
  return {
    question: {
      textFr: texte,
      guidanceFr: null,
      answerType: 'free_text',
      criticality: 'informatif',
      blockCode: blocCode,
    },
    missionQuestion: { id: missionQuestionId, position },
  };
}

// =============================================================================
// LECTURE DE LA RÉPONSE
// =============================================================================
async function pousser(
  jeton: string,
  missionId: string,
  operations: readonly Op[],
  options: { readonly deviceId?: string; readonly outboxRemaining?: number } = {},
): Promise<ReponseHttp> {
  return posterBrut(
    {
      missionId,
      deviceId: options.deviceId ?? 'appareil-fictif-1',
      operations,
      outboxRemaining: options.outboxRemaining ?? 0,
    },
    { jeton },
  );
}

/**
 * Valide la réponse par LE schéma partagé et vérifie l'alignement op ↔ résultat :
 * un résultat par op, dans l'ordre de la file (11 §4), même `opId`.
 */
function reponseValide(r: ReponseHttp, operations: readonly Op[]): ReponsePush {
  expect(r.statut, `push attendu 200, reçu ${String(r.statut)} :\n${r.corps.slice(0, 600)}`).toBe(
    200,
  );
  const analyse = reponsePushSchema.safeParse(JSON.parse(r.corps));
  expect(
    analyse.success,
    `réponse non conforme à reponsePushSchema :\n${r.corps.slice(0, 600)}`,
  ).toBe(true);
  if (!analyse.success) throw new Error('réponse non conforme');
  expect(analyse.data.results.map((x) => x.opId)).toEqual(operations.map((o) => o.opId));
  return analyse.data;
}

function resultatsDe(r: ReponseHttp, operations: readonly Op[]): ResultatOp[] {
  return reponseValide(r, operations).results.map((x) => x.result);
}

async function resultatUnique(jeton: string, missionId: string, o: Op): Promise<ResultatOp> {
  const [resultat] = resultatsDe(await pousser(jeton, missionId, [o]), [o]);
  if (resultat === undefined) throw new Error('aucun résultat');
  return resultat;
}

/**
 * H5 — un émetteur SANS DROIT DE ROUTE : refus lot entier OU `forbidden` par op.
 * Jamais `applied`, jamais 5xx.
 */
function refusSansDroit(r: ReponseHttp, o: Op, nonMembre: boolean): void {
  if (r.statut === 200) {
    expect(resultatsDe(r, [o])).toEqual(['forbidden']);
    return;
  }
  const admis = nonMembre ? [403, 404] : [403];
  expect(admis, `statut ${String(r.statut)} inattendu :\n${r.corps.slice(0, 400)}`).toContain(
    r.statut,
  );
  const codesAdmis: string[] = nonMembre
    ? [ERROR_CODES.FORBIDDEN, ERROR_CODES.NOT_FOUND]
    : [ERROR_CODES.FORBIDDEN];
  expect(codesAdmis).toContain(r.code);
}

// =============================================================================
// FIXTURES — SQL DIRECT (fabrication d'ÉTAT, jamais de RÉSULTAT)
// =============================================================================
type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';
type RoleSurMission = 'lead' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;
/** Jeton frappé par `app.jwt.sign({ sub })` : le rôle est relu EN BASE (06 §10.1). */
async function creerCompte(role: RoleUtilisateur): Promise<Compte> {
  compteurCompte += 1;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'empreinte-factice-non-verifiee', $4, 'guide_strict',
             now(), true, now(), now())`,
    [
      id,
      `Compte L6a ${String(compteurCompte)}`,
      `compte.l6a.${String(compteurCompte)}@exemple.test`,
      role,
    ],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

let compteurMission = 0;
async function semerMission(): Promise<string> {
  compteurMission += 1;
  const entreprise = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    entreprise,
    `Entreprise fictive L6a ${String(compteurMission)}`,
  ]);
  const id = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', now(), now())`,
    [id, entreprise, `Mission fictive L6a ${String(compteurMission)}`],
  );
  return id;
}

async function rattacher(missionId: string, userId: string, role: RoleSurMission): Promise<void> {
  await bd().query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, role],
  );
}

async function semerUnite(
  missionId: string,
  options: {
    readonly parentId?: string;
    readonly statut?: string;
    readonly proposePar?: string;
  } = {},
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status, proposed_by,
                            created_at, updated_at)
     VALUES ($1, $2, $3, 'service', $4, true, $5, $6, now(), now())`,
    [
      id,
      missionId,
      options.parentId ?? null,
      `Unite fictive ${id.slice(-6)}`,
      options.statut ?? 'active',
      options.proposePar ?? null,
    ],
  );
  return id;
}

async function semerQuestionDeMission(
  missionId: string,
  options: { readonly adHocPar?: string } = {},
): Promise<{ readonly questionId: string; readonly missionQuestionId: string }> {
  const questionId = uuidv7();
  const adHoc = options.adHocPar !== undefined;
  await bd().query(
    `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin, origin_mission_id,
                            created_by, created_at, updated_at)
     VALUES ($1, $2, 1, 'active', $3, 'yes_no', $4, $5, $6, now(), now())`,
    [
      questionId,
      blocId,
      `Question fictive ${questionId.slice(-6)}`,
      adHoc ? 'ad_hoc' : 'banque',
      adHoc ? missionId : null,
      options.adHocPar ?? null,
    ],
  );
  const missionQuestionId = uuidv7();
  await bd().query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                    answer_type_snapshot, position, added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, 'yes_no', 1, $5)`,
    [missionQuestionId, missionId, questionId, `Question fictive ${questionId.slice(-6)}`, adHoc],
  );
  return { questionId, missionQuestionId };
}

const T_SEMIS = '2026-09-30T08:00:00.000Z';

async function semerEntretien(
  missionId: string,
  orgUnitId: string,
  conduitPar: string,
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id, schedule_status,
                             status, general_notes, client_created_at, client_updated_at,
                             created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, 'realise', 'en_cours', 'notes semées',
             $5, $5, now(), now())`,
    [id, missionId, conduitPar, orgUnitId, T_SEMIS],
  );
  return id;
}

async function semerReponse(interviewId: string, missionQuestionId: string): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO answers (id, interview_id, mission_question_id, value, client_created_at,
                          client_updated_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $5, now(), now())`,
    [id, interviewId, missionQuestionId, JSON.stringify({ type: 'yes_no', v: false }), T_SEMIS],
  );
  return id;
}

async function semerPiece(
  missionId: string,
  creePar: string,
  rattachement: { readonly interviewId: string | null; readonly answerId: string | null },
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO attachments (id, interview_id, answer_id, mission_id, kind, content, created_by,
                              client_created_at, client_updated_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'note', 'note semée', $5, $6, $6, now(), now())`,
    [id, rattachement.interviewId, rattachement.answerId, missionId, creePar, T_SEMIS],
  );
  return id;
}

/**
 * LE MONDE D'UNE ÉPREUVE — frais à chaque test, pour qu'aucun verdict ne dépende
 * de l'ordre des `it`.
 *   A  : consultant, membre `consultant`, PROPRIÉTAIRE de tout ce qui est semé ;
 *   B  : consultant, membre `consultant`, propriétaire de SA session `entretienB` ;
 *   L  : rôle global `lecteur`, membre `lecteur` ;
 *   AD : admin, non membre (§9.9 : l'admin corrige par l'API siège, pas le push) ;
 *   X  : consultant NON membre de la mission.
 */
interface Monde {
  readonly missionId: string;
  readonly racine: string;
  readonly A: Compte;
  readonly B: Compte;
  readonly L: Compte;
  readonly AD: Compte;
  readonly X: Compte;
  readonly mq1: string;
  readonly mq2: string;
  readonly entretienA: string;
  readonly entretienB: string;
  readonly reponseA: string;
  readonly pieceA: string;
  readonly noteVolanteA: string;
  readonly propositionA: string;
  readonly adhocA: { readonly questionId: string; readonly missionQuestionId: string };
}

async function semerMonde(): Promise<Monde> {
  const missionId = await semerMission();
  const [A, B, L, AD, X] = [
    await creerCompte('consultant'),
    await creerCompte('consultant'),
    await creerCompte('lecteur'),
    await creerCompte('admin'),
    await creerCompte('consultant'),
  ];
  await rattacher(missionId, A.id, 'consultant');
  await rattacher(missionId, B.id, 'consultant');
  await rattacher(missionId, L.id, 'lecteur');
  const racine = await semerUnite(missionId);
  const { missionQuestionId: mq1 } = await semerQuestionDeMission(missionId);
  const { missionQuestionId: mq2 } = await semerQuestionDeMission(missionId);
  const entretienA = await semerEntretien(missionId, racine, A.id);
  const entretienB = await semerEntretien(missionId, racine, B.id);
  const reponseA = await semerReponse(entretienA, mq1);
  const pieceA = await semerPiece(missionId, A.id, { interviewId: entretienA, answerId: null });
  const noteVolanteA = await semerPiece(missionId, A.id, { interviewId: null, answerId: null });
  const propositionA = await semerUnite(missionId, {
    parentId: racine,
    statut: 'proposee',
    proposePar: A.id,
  });
  const adhocA = await semerQuestionDeMission(missionId, { adHocPar: A.id });
  return {
    missionId,
    racine,
    A,
    B,
    L,
    AD,
    X,
    mq1,
    mq2,
    entretienA,
    entretienB,
    reponseA,
    pieceA,
    noteVolanteA,
    propositionA,
    adhocA,
  };
}

/**
 * GARDE ANTI-FAUX-VERT. Un refus toléré en 403/404 (H5) serait VERT contre une
 * route ABSENTE (404 « ressource introuvable »). Chaque test qui tolère un refus
 * de route prouve donc d'abord que la route vit : le propriétaire y pousse une
 * note volante neuve, qui doit finir `applied` (PD4). À appeler AVANT de
 * photographier l'état de référence.
 */
async function exigerRouteVivante(m: Monde): Promise<void> {
  const temoin = op(
    'attachment_meta',
    uuidv7(),
    chargePiece(m.missionId, { interviewId: null, answerId: null }, 'témoin de route'),
  );
  const r = await pousser(m.A.jeton, m.missionId, [temoin], { deviceId: 'appareil-temoin' });
  expect(
    resultatsDe(r, [temoin]),
    'la route de push ne vit pas : un refus 403/404 ne prouverait rien',
  ).toEqual(['applied']);
}

// -----------------------------------------------------------------------------
// PHOTOGRAPHIE DE L'ÉTAT — la seule vérité sur ce que la route a écrit
// -----------------------------------------------------------------------------
type Ligne = Record<string, unknown>;

async function lignes(sql: string, parametres: readonly unknown[]): Promise<Ligne[]> {
  const resultat = await bd().query<Ligne>(sql, [...parametres]);
  return resultat.rows;
}

/**
 * L'état MÉTIER d'une mission, ligne à ligne, toutes colonnes : sessions, réponses,
 * pièces, unités, questions ad hoc, lignes de questionnaire, archive des révisions.
 * `processed_ops` et `sync_log` sont lus à part — ils sont le JOURNAL du push.
 */
async function etatMetier(missionId: string): Promise<string> {
  const interviews = await lignes('SELECT * FROM interviews WHERE mission_id = $1 ORDER BY id', [
    missionId,
  ]);
  const answers = await lignes(
    `SELECT a.* FROM answers a JOIN interviews i ON i.id = a.interview_id
      WHERE i.mission_id = $1 ORDER BY a.id`,
    [missionId],
  );
  const attachments = await lignes('SELECT * FROM attachments WHERE mission_id = $1 ORDER BY id', [
    missionId,
  ]);
  const orgUnits = await lignes('SELECT * FROM org_units WHERE mission_id = $1 ORDER BY id', [
    missionId,
  ]);
  const questions = await lignes(
    `SELECT q.* FROM questions q
      WHERE q.origin_mission_id = $1
         OR q.id IN (SELECT question_id FROM mission_questions WHERE mission_id = $1)
      ORDER BY q.id`,
    [missionId],
  );
  const missionQuestions = await lignes(
    'SELECT * FROM mission_questions WHERE mission_id = $1 ORDER BY id',
    [missionId],
  );
  const ids = [
    ...interviews.map((l) => l.id),
    ...answers.map((l) => l.id),
    ...attachments.map((l) => l.id),
  ];
  const revisions = await lignes(
    'SELECT * FROM answer_revisions WHERE entity_id = ANY($1::uuid[]) ORDER BY id',
    [ids],
  );
  return JSON.stringify({
    interviews,
    answers,
    attachments,
    orgUnits,
    questions,
    missionQuestions,
    revisions,
  });
}

async function opsTraitees(opIds: readonly string[]): Promise<Ligne[]> {
  return lignes('SELECT * FROM processed_ops WHERE op_id = ANY($1::uuid[]) ORDER BY op_id', [
    opIds,
  ]);
}

async function journalSync(userId: string): Promise<Ligne[]> {
  return lignes(
    `SELECT * FROM sync_log WHERE user_id = $1 AND direction = 'push'
      ORDER BY started_at, ended_at, id`,
    [userId],
  );
}

async function valeur(sql: string, id: string): Promise<unknown> {
  const [ligne] = await lignes(sql, [id]);
  return ligne === undefined ? undefined : Object.values(ligne)[0];
}

async function revisionsDe(entityId: string): Promise<Ligne[]> {
  return lignes(
    `SELECT entity_type, entity_id, answer_id, previous_value, change_origin, changed_by
       FROM answer_revisions WHERE entity_id = $1 ORDER BY changed_at, id`,
    [entityId],
  );
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);
  const base = await creerBaseEphemere('l6a_push');
  nomBase = base.nom;
  urlBase = base.url;
  await appliquerMontee(base.url);
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);
  client = await connecter(base.url);

  const [bloc] = (
    await bd().query<{ id: string; code: string }>(
      'SELECT id, code FROM blocks ORDER BY id LIMIT 1',
    )
  ).rows;
  if (bloc === undefined) throw new Error('le seed L1 ne porte aucun bloc (`blocks`)');
  blocId = bloc.id;
  blocCode = bloc.code;

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
// 1. AUTHENTIFICATION — avant toute chose
// =============================================================================
describe('L6a · POST /v1/sync/push — authentification (11 §3) @critique', () => {
  it('sans jeton → 401 UNAUTHENTICATED, rien n’est écrit @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'x'),
    );
    const avant = await etatMetier(m.missionId);
    const r = await posterBrut({
      missionId: m.missionId,
      deviceId: 'd',
      operations: [o],
      outboxRemaining: 0,
    });
    expect(r.statut).toBe(401);
    expect(r.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(await etatMetier(m.missionId)).toBe(avant);
    expect(await opsTraitees([o.opId])).toEqual([]);
  });

  it('jeton illisible → 401, rien n’est écrit @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'x'),
    );
    const r = await posterBrut(
      { missionId: m.missionId, deviceId: 'd', operations: [o], outboxRemaining: 0 },
      { autorisation: 'Bearer jeton.factice.illisible' },
    );
    expect(r.statut).toBe(401);
    expect(await opsTraitees([o.opId])).toEqual([]);
  });
});

// =============================================================================
// 2. LE CONTRAT §9.3 — les cinq résultats, la forme, les bornes du lot
// =============================================================================
describe('L6a · contrat de réponse §9.3', () => {
  it('un même lot produit les CINQ résultats, chacun par son cas, dans l’ordre de la file @critique', async () => {
    const m = await semerMonde();
    // préalable : une op déjà vue (→ duplicate) et une réponse portée à T_haut (→ superseded)
    const dejaVue = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'déjà vue'),
    );
    const tHaut = instant();
    const recente = op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true), tHaut);
    expect(
      resultatsDe(await pousser(m.A.jeton, m.missionId, [dejaVue, recente]), [dejaVue, recente]),
    ).toEqual(['applied', 'applied']);

    const tBas = new Date(Date.parse(tHaut) - 30_000).toISOString();
    const lot: Op[] = [
      { ...dejaVue }, // même opId → duplicate
      op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq2, true)), // → applied
      op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, false), tBas), // plus ancienne → superseded
      op(
        'interview',
        m.entretienB,
        chargeEntretien(m.missionId, m.racine, { generalNotes: 'détournée' }),
      ), // session de B → forbidden
      op('answer', uuidv7(), chargeReponse(uuidv7(), m.mq1, true)), // entretien inconnu → error
    ];
    const reponse = reponseValide(await pousser(m.A.jeton, m.missionId, lot), lot);
    expect(reponse.results.map((x) => x.result)).toEqual([
      'duplicate',
      'applied',
      'superseded',
      'forbidden',
      'error',
    ]);
    expect([...RESULTATS_OP].sort()).toEqual(
      [...new Set(reponse.results.map((x) => x.result))].sort(),
    );
    // `serverTime` est un instant UTC du serveur, pas un écho du client.
    expect(Math.abs(Date.parse(reponse.serverTime) - Date.now())).toBeLessThan(5 * 60_000);
    for (const resultat of reponse.results) {
      if (resultat.message !== undefined) expect(resultat.message.trim()).not.toBe('');
    }
  });

  it(`un lot de ${String(TAILLE_LOT_PUSH_MAX)} opérations exactement est accepté`, async () => {
    const m = await semerMonde();
    const lot = Array.from({ length: TAILLE_LOT_PUSH_MAX }, (_, i) =>
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: null, answerId: null }, `note ${String(i)}`),
      ),
    );
    const resultats = resultatsDe(await pousser(m.A.jeton, m.missionId, lot), lot);
    expect(resultats.every((x) => x === 'applied')).toBe(true);
  });

  it(`un lot de ${String(TAILLE_LOT_PUSH_MAX + 1)} opérations est refusé EN ENTIER, au format 11 §3, en français`, async () => {
    const m = await semerMonde();
    const lot = Array.from({ length: TAILLE_LOT_PUSH_MAX + 1 }, (_, i) =>
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: null, answerId: null }, `note ${String(i)}`),
      ),
    );
    const avant = await etatMetier(m.missionId);
    const journalAvant = await journalSync(m.A.id);
    const r = await pousser(m.A.jeton, m.missionId, lot);
    // H4 : 400 VALIDATION_FAILED ; 413 PAYLOAD_TOO_LARGE toléré, le pack ne tranche pas.
    const attendu: Record<number, string> = {
      400: ERROR_CODES.VALIDATION_FAILED,
      413: ERROR_CODES.PAYLOAD_TOO_LARGE,
    };
    expect([400, 413], r.corps.slice(0, 400)).toContain(r.statut);
    expect(r.code).toBe(attendu[r.statut]);
    expect(Object.values(ERROR_CODES)).toContain(r.code);
    expect(r.message ?? '').not.toBe('');
    expect(r.message ?? '').not.toMatch(/\b(Too big|Expected|Invalid input|must)\b/);
    expect(await etatMetier(m.missionId)).toBe(avant);
    expect(await opsTraitees(lot.map((o) => o.opId))).toEqual([]);
    expect(await journalSync(m.A.id)).toEqual(journalAvant);
  });

  it('un lot mal formé (sans missionId) est refusé au format 11 §3', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'x'),
    );
    const r = await posterBrut(
      { deviceId: 'd', operations: [o], outboxRemaining: 0 },
      { jeton: m.A.jeton },
    );
    expect(r.statut).toBe(400);
    expect(r.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(await opsTraitees([o.opId])).toEqual([]);
  });

  it('`error` n’est PAS consigné comme traité : la même op rejouée plus tard s’applique (jamais `duplicate`) @critique', async () => {
    // PD4 : entretien inconnu → `error` (rejouable). Si `processed_ops` retenait
    // l'op, le rejeu rendrait `duplicate`, le client la sortirait de l'outbox, et
    // la réponse serait perdue sans trace — l'invariant 7 par son côté discret.
    const m = await semerMonde();
    const nouvelEntretien = uuidv7();
    const reponse = op('answer', uuidv7(), chargeReponse(nouvelEntretien, m.mq1, true));
    expect(await resultatUnique(m.A.jeton, m.missionId, reponse)).toBe('error');
    expect(
      await valeur('SELECT count(*)::int AS n FROM answers WHERE id = $1', reponse.entityId),
    ).toBe(0);

    const entretien = op('interview', nouvelEntretien, chargeEntretien(m.missionId, m.racine));
    expect(await resultatUnique(m.A.jeton, m.missionId, entretien)).toBe('applied');
    expect(await resultatUnique(m.A.jeton, m.missionId, reponse)).toBe('applied');
    expect(
      await valeur('SELECT count(*)::int AS n FROM answers WHERE id = $1', reponse.entityId),
    ).toBe(1);
  });
});

// =============================================================================
// 3. IDEMPOTENCE — C2 du fichier 07 : rejeu 3× du même lot = état identique
// =============================================================================
describe('L6a · idempotence (11 §4, 07 C2, scénario 3 §9.8) @critique', () => {
  it('rejeu 3× du MÊME lot : état base identique ligne à ligne, 2e et 3e passages = duplicate @critique', async () => {
    const m = await semerMonde();
    const entretien = uuidv7();
    const reponse = uuidv7();
    const mqAdhoc = uuidv7();
    const lot: Op[] = [
      op('interview', entretien, chargeEntretien(m.missionId, m.racine)),
      op('answer', reponse, chargeReponse(entretien, m.mq1, true)),
      op('answer', uuidv7(), chargeReponse(entretien, m.mq2, false)),
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: entretien, answerId: null }, 'pièce rattachée'),
      ),
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: null, answerId: reponse }, 'pièce de réponse'),
      ),
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: null, answerId: null }, 'note volante'),
      ),
      op('org_unit_proposal', uuidv7(), chargeProposition(m.missionId, m.racine, 'Unite proposee')),
      op('question_adhoc', uuidv7(), chargeQuestionAdhoc(mqAdhoc, 'Question ad hoc fictive ?')),
    ];
    const opIds = lot.map((o) => o.opId);

    expect(resultatsDe(await pousser(m.A.jeton, m.missionId, lot), lot)).toEqual(
      lot.map(() => 'applied'),
    );
    const etat1 = await etatMetier(m.missionId);
    const traitees1 = await opsTraitees(opIds);

    expect(resultatsDe(await pousser(m.A.jeton, m.missionId, lot), lot)).toEqual(
      lot.map(() => 'duplicate'),
    );
    const etat2 = await etatMetier(m.missionId);
    const traitees2 = await opsTraitees(opIds);

    expect(resultatsDe(await pousser(m.A.jeton, m.missionId, lot), lot)).toEqual(
      lot.map(() => 'duplicate'),
    );
    const etat3 = await etatMetier(m.missionId);
    const traitees3 = await opsTraitees(opIds);

    expect(etat2).toBe(etat1);
    expect(etat3).toBe(etat1);
    // `processed_ops` : une ligne par op, posée au PREMIER passage, jamais réécrite.
    expect(traitees1).toHaveLength(lot.length);
    expect(JSON.stringify(traitees2)).toBe(JSON.stringify(traitees1));
    expect(JSON.stringify(traitees3)).toBe(JSON.stringify(traitees1));
    for (const ligne of traitees1) {
      expect(ligne.result).toBe('applied');
      expect(ligne.batch_id).not.toBeNull();
    }
    // les ops d'un même lot partagent leur batch_id
    expect(new Set(traitees1.map((l) => l.batch_id)).size).toBe(1);
  });

  it('seconde ceinture : même entité, NOUVEL opId, même contenu → aucune ligne ni révision de plus @critique', async () => {
    const m = await semerMonde();
    const t = instant();
    const premiere = op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq2, true), t);
    expect(await resultatUnique(m.A.jeton, m.missionId, premiere)).toBe('applied');
    const avant = await etatMetier(m.missionId);
    const seconde: Op = { ...premiere, opId: uuidv7() };
    expect(['applied', 'duplicate']).toContain(
      await resultatUnique(m.A.jeton, m.missionId, seconde),
    );
    const apres = JSON.parse(await etatMetier(m.missionId)) as {
      answers: Ligne[];
      revisions: Ligne[];
    };
    const reference = JSON.parse(avant) as { answers: Ligne[]; revisions: Ligne[] };
    expect(apres.answers.length).toBe(reference.answers.length);
    expect(apres.revisions.length).toBe(reference.revisions.length);
    expect(await valeur('SELECT value FROM answers WHERE id = $1', premiere.entityId)).toEqual({
      type: 'yes_no',
      v: true,
    });
  });

  // ARBITRAGE A01 (2026-10-09) — remplace l'option `error` : un second UUID pour le
  // même couple (session, question), même auditeur sur deux appareils (scénario 5),
  // s'arbitre au dernier-écrit-gagne SUR LA LIGNE EXISTANTE ; jamais de seconde
  // ligne ; la perdante est archivée en `sync_arbitrage`. Comparaisons
  // STRUCTURELLES : PostgreSQL réordonne les clés d'un jsonb.
  it('unicité answers : second UUID, même (session, question), PLUS RÉCENT → applied sur la ligne existante, l’ancienne version archivée @critique', async () => {
    const m = await semerMonde();
    const doublon = op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq1, true));
    expect(resultatsDe(await pousser(m.A.jeton, m.missionId, [doublon]), [doublon])).toEqual([
      'applied',
    ]);
    expect(
      await lignes(
        'SELECT id, value FROM answers WHERE interview_id = $1 AND mission_question_id = $2',
        [m.entretienA, m.mq1],
      ),
    ).toEqual([{ id: m.reponseA, value: { type: 'yes_no', v: true } }]);
    expect(
      await valeur('SELECT count(*)::int AS n FROM answers WHERE id = $1', doublon.entityId),
    ).toBe(0);
    const arbitrees = (await revisionsDe(m.reponseA)).filter(
      (a) => a.change_origin === 'sync_arbitrage',
    );
    expect(arbitrees).toHaveLength(1);
    expect(arbitrees[0]?.previous_value).toMatchObject({
      value: { type: 'yes_no', v: false },
      clientUpdatedAt: T_SEMIS,
    });
  });

  it('unicité answers : second UUID, même (session, question), PLUS ANCIEN → superseded, ligne existante intacte, l’entrante archivée @critique', async () => {
    const m = await semerMonde();
    const ancien = '2026-09-29T08:00:00.000Z';
    const doublon = op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq1, true), ancien);
    expect(resultatsDe(await pousser(m.A.jeton, m.missionId, [doublon]), [doublon])).toEqual([
      'superseded',
    ]);
    expect(
      await lignes(
        'SELECT id, value FROM answers WHERE interview_id = $1 AND mission_question_id = $2',
        [m.entretienA, m.mq1],
      ),
    ).toEqual([{ id: m.reponseA, value: { type: 'yes_no', v: false } }]);
    const arbitrees = (await revisionsDe(m.reponseA)).filter(
      (a) => a.change_origin === 'sync_arbitrage',
    );
    expect(arbitrees).toHaveLength(1);
    expect(arbitrees[0]?.previous_value).toMatchObject({
      value: { type: 'yes_no', v: true },
      clientUpdatedAt: ancien,
    });
  });
});

// =============================================================================
// 4. PROPRIÉTÉ §9.9 — EXHAUSTIVE SUR LES CINQ ENTITÉS DE ENTITES_SYNC
// =============================================================================
// Pour chaque entité semée au nom de A : A la modifie → `applied` et la ligne
// change ; tout autre émetteur → refus, et l'état métier est IDENTIQUE au bit près.
interface CasEntite {
  readonly nom: string;
  readonly modification: (m: Monde) => Op;
  readonly lecture: (m: Monde) => Promise<unknown>;
  readonly attendu: unknown;
  /**
   * Arbitrage A01 (2026-10-09) : une question ad hoc déjà créée ne se RETOUCHE pas
   * par le push, même par son auteur — `forbidden`, aucune mutation sans trace.
   */
  readonly retoucheInterdite?: true;
}

const CAS_PROPRIETE: readonly CasEntite[] = [
  {
    nom: 'interview (session de A)',
    modification: (m) =>
      op(
        'interview',
        m.entretienA,
        chargeEntretien(m.missionId, m.racine, { generalNotes: 'notes modifiées' }),
      ),
    lecture: (m) => valeur('SELECT general_notes FROM interviews WHERE id = $1', m.entretienA),
    attendu: 'notes modifiées',
  },
  {
    nom: 'answer (réponse de la session de A)',
    modification: (m) => op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true)),
    lecture: (m) => valeur('SELECT value FROM answers WHERE id = $1', m.reponseA),
    attendu: { type: 'yes_no', v: true },
  },
  {
    nom: 'attachment_meta (pièce rattachée à la session de A)',
    modification: (m) =>
      op(
        'attachment_meta',
        m.pieceA,
        chargePiece(m.missionId, { interviewId: m.entretienA, answerId: null }, 'pièce modifiée'),
      ),
    lecture: (m) => valeur('SELECT content FROM attachments WHERE id = $1', m.pieceA),
    attendu: 'pièce modifiée',
  },
  {
    nom: 'attachment_meta (note volante NON rattachée de A — 04 S-3)',
    modification: (m) =>
      op(
        'attachment_meta',
        m.noteVolanteA,
        chargePiece(m.missionId, { interviewId: null, answerId: null }, 'note modifiée'),
      ),
    lecture: (m) => valeur('SELECT content FROM attachments WHERE id = $1', m.noteVolanteA),
    attendu: 'note modifiée',
  },
  {
    nom: 'org_unit_proposal (proposition de A)',
    modification: (m) =>
      op(
        'org_unit_proposal',
        m.propositionA,
        chargeProposition(m.missionId, m.racine, 'Unite renommee'),
      ),
    lecture: (m) => valeur('SELECT name FROM org_units WHERE id = $1', m.propositionA),
    attendu: 'Unite renommee',
  },
  {
    nom: 'question_adhoc (question ad hoc de A)',
    modification: (m) =>
      op(
        'question_adhoc',
        m.adhocA.questionId,
        chargeQuestionAdhoc(m.adhocA.missionQuestionId, 'Texte ad hoc modifié ?', 1),
      ),
    lecture: (m) => valeur('SELECT text_fr FROM questions WHERE id = $1', m.adhocA.questionId),
    attendu: 'Texte ad hoc modifié ?',
    retoucheInterdite: true,
  },
];

describe('L6a · propriété §9.9 — chaque entité × chaque émetteur @critique', () => {
  for (const cas of CAS_PROPRIETE) {
    describe(cas.nom, () => {
      it(`propriétaire (A) → ${cas.retoucheInterdite === true ? 'forbidden (retouche, A01)' : 'applied, la ligne change'} @critique`, async () => {
        const m = await semerMonde();
        if (cas.retoucheInterdite === true) {
          const avant = await etatMetier(m.missionId);
          expect(await resultatUnique(m.A.jeton, m.missionId, cas.modification(m))).toBe(
            'forbidden',
          );
          expect(await etatMetier(m.missionId)).toBe(avant);
          return;
        }
        expect(await resultatUnique(m.A.jeton, m.missionId, cas.modification(m))).toBe('applied');
        expect(await cas.lecture(m)).toEqual(cas.attendu);
      });

      it(`autre auditeur MEMBRE (B) → 200 + forbidden, rien n’est appliqué @critique`, async () => {
        const m = await semerMonde();
        const avant = await etatMetier(m.missionId);
        expect(await resultatUnique(m.B.jeton, m.missionId, cas.modification(m))).toBe('forbidden');
        expect(await etatMetier(m.missionId)).toBe(avant);
      });

      it(`lecteur membre (L) → refusé, rien n’est appliqué @critique`, async () => {
        const m = await semerMonde();
        await exigerRouteVivante(m);
        const avant = await etatMetier(m.missionId);
        const o = cas.modification(m);
        refusSansDroit(await pousser(m.L.jeton, m.missionId, [o]), o, false);
        expect(await etatMetier(m.missionId)).toBe(avant);
      });

      it(`admin non propriétaire (AD) → refusé : l’admin corrige par l’API siège, jamais par le push @critique`, async () => {
        const m = await semerMonde();
        await exigerRouteVivante(m);
        const avant = await etatMetier(m.missionId);
        const o = cas.modification(m);
        refusSansDroit(await pousser(m.AD.jeton, m.missionId, [o]), o, true);
        expect(await etatMetier(m.missionId)).toBe(avant);
      });

      it(`consultant NON membre (X) → refusé, rien n’est appliqué @critique`, async () => {
        const m = await semerMonde();
        await exigerRouteVivante(m);
        const avant = await etatMetier(m.missionId);
        const o = cas.modification(m);
        refusSansDroit(await pousser(m.X.jeton, m.missionId, [o]), o, true);
        expect(await etatMetier(m.missionId)).toBe(avant);
      });
    });
  }
});

describe('L6a · propriété §9.9 — créations : le propriétaire est l’ÉMETTEUR AUTHENTIFIÉ @critique', () => {
  it('A crée une session → applied, conducted_by = A @critique', async () => {
    const m = await semerMonde();
    const o = op('interview', uuidv7(), chargeEntretien(m.missionId, m.racine));
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    expect(await valeur('SELECT conducted_by FROM interviews WHERE id = $1', o.entityId)).toBe(
      m.A.id,
    );
  });

  it('note volante NON rattachée créée par A → applied, created_by = A (PD4, 04 S-3) @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'note de couloir'),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    const [ligne] = await lignes(
      'SELECT created_by, interview_id, answer_id, content FROM attachments WHERE id = $1',
      [o.entityId],
    );
    expect(ligne).toEqual({
      created_by: m.A.id,
      interview_id: null,
      answer_id: null,
      content: 'note de couloir',
    });
  });

  it('proposition d’unité créée par A → applied, proposee, proposed_by = A @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'org_unit_proposal',
      uuidv7(),
      chargeProposition(m.missionId, m.racine, 'Unite terrain'),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    const [ligne] = await lignes(
      'SELECT status, proposed_by, mission_id, parent_id FROM org_units WHERE id = $1',
      [o.entityId],
    );
    expect(ligne).toEqual({
      status: 'proposee',
      proposed_by: m.A.id,
      mission_id: m.missionId,
      parent_id: m.racine,
    });
  });

  it('question ad hoc créée par A → applied, questions + mission_questions créées ATOMIQUEMENT, ids client (11 §4) @critique', async () => {
    const m = await semerMonde();
    const mq = uuidv7();
    const o = op('question_adhoc', uuidv7(), chargeQuestionAdhoc(mq, 'Question ad hoc ?', 7));
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    const [q] = await lignes(
      'SELECT origin, origin_mission_id, created_by, text_fr FROM questions WHERE id = $1',
      [o.entityId],
    );
    expect(q).toEqual({
      origin: 'ad_hoc',
      origin_mission_id: m.missionId,
      created_by: m.A.id,
      text_fr: 'Question ad hoc ?',
    });
    const [ligneMq] = await lignes(
      'SELECT mission_id, question_id, added_ad_hoc, position FROM mission_questions WHERE id = $1',
      [mq],
    );
    expect(ligneMq).toEqual({
      mission_id: m.missionId,
      question_id: o.entityId,
      added_ad_hoc: true,
      position: 7,
    });
  });

  it('B crée une réponse NEUVE dans la session de A → forbidden, aucune ligne @critique', async () => {
    const m = await semerMonde();
    const o = op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq2, true));
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.B.jeton, m.missionId, o)).toBe('forbidden');
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('B crée une pièce rattachée à la session de A → forbidden @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: m.entretienA, answerId: null }, 'intrusion'),
    );
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.B.jeton, m.missionId, o)).toBe('forbidden');
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('B crée une pièce rattachée à une RÉPONSE de A (answer_id → son entretien) → forbidden @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: m.reponseA }, 'intrusion'),
    );
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.B.jeton, m.missionId, o)).toBe('forbidden');
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('lecteur membre crée une session → refusé, aucune ligne @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m);
    const o = op('interview', uuidv7(), chargeEntretien(m.missionId, m.racine));
    const avant = await etatMetier(m.missionId);
    refusSansDroit(await pousser(m.L.jeton, m.missionId, [o]), o, false);
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('consultant NON membre crée une session sur la mission → refusé, aucune ligne @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m);
    const o = op('interview', uuidv7(), chargeEntretien(m.missionId, m.racine));
    const avant = await etatMetier(m.missionId);
    refusSansDroit(await pousser(m.X.jeton, m.missionId, [o]), o, true);
    expect(await etatMetier(m.missionId)).toBe(avant);
  });
});

describe('L6a · propriété §9.9 — le serveur ne croit pas le client @critique', () => {
  it('session créée avec conductedBy = B forgé dans la charge → forbidden, aucune ligne @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'interview',
      uuidv7(),
      chargeEntretien(m.missionId, m.racine, { conductedBy: m.B.id }),
    );
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('forbidden');
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('note volante créée avec createdBy = B forgé → forbidden, aucune ligne @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'x', { createdBy: m.B.id }),
    );
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('forbidden');
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('B s’approprie la session de A (même id, conductedBy = B) → forbidden, conducted_by reste A @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, { conductedBy: m.B.id }),
    );
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.B.jeton, m.missionId, o)).toBe('forbidden');
    expect(await etatMetier(m.missionId)).toBe(avant);
    expect(await valeur('SELECT conducted_by FROM interviews WHERE id = $1', m.entretienA)).toBe(
      m.A.id,
    );
  });

  it('B, membre d’une AUTRE mission, annonce SA mission dans le lot et vise la réponse de A → refusé, rien n’est appliqué @critique', async () => {
    const m = await semerMonde();
    const autreMission = await semerMission();
    await exigerRouteVivante(m);
    await rattacher(autreMission, m.B.id, 'consultant');
    const o = op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true));
    const avant = await etatMetier(m.missionId);
    const r = await pousser(m.B.jeton, autreMission, [o]);
    if (r.statut === 200) {
      expect(resultatsDe(r, [o])).toEqual(['forbidden']);
    } else {
      expect([400, 403, 404]).toContain(r.statut);
    }
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('A pousse sa propre réponse sous un missionId de lot qui n’est pas le sien → jamais applied @critique', async () => {
    const m = await semerMonde();
    const autreMission = await semerMission();
    await exigerRouteVivante(m);
    const o = op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true));
    const avant = await etatMetier(m.missionId);
    const r = await pousser(m.A.jeton, autreMission, [o]);
    if (r.statut === 200) {
      expect(resultatsDe(r, [o])).not.toEqual(['applied']);
    } else {
      expect([400, 403, 404]).toContain(r.statut);
    }
    expect(await etatMetier(m.missionId)).toBe(avant);
  });
});

// =============================================================================
// 5. SCÉNARIO 5 — DEUX APPAREILS, MÊME UTILISATEUR (§9.4, S-4 : trois entités)
// =============================================================================
interface CasArbitrage {
  readonly nom: string;
  readonly entityType: 'answer' | 'interview' | 'attachment';
  readonly id: (m: Monde) => string;
  /** La valeur GAGNANTE (récente) et la PERDANTE (ancienne), dans le type de la colonne. */
  readonly gagnante: boolean | string;
  readonly perdante: boolean | string;
  readonly ecriture: (m: Monde, marque: boolean | string, t: string) => Op;
  readonly lecture: (m: Monde) => Promise<unknown>;
  readonly attendu: (marque: boolean | string) => unknown;
}

const CAS_ARBITRAGE: readonly CasArbitrage[] = [
  {
    nom: 'answer',
    entityType: 'answer',
    id: (m) => m.reponseA,
    gagnante: true,
    perdante: false,
    ecriture: (m, marque, t) =>
      op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, marque), t),
    lecture: (m) => valeur('SELECT value FROM answers WHERE id = $1', m.reponseA),
    attendu: (marque) => ({ type: 'yes_no', v: marque }),
  },
  {
    nom: 'interview',
    entityType: 'interview',
    id: (m) => m.entretienA,
    gagnante: 'version appareil 1 (récente)',
    perdante: 'version appareil 2 (ancienne)',
    ecriture: (m, marque, t) =>
      op(
        'interview',
        m.entretienA,
        chargeEntretien(m.missionId, m.racine, { generalNotes: marque }),
        t,
      ),
    lecture: (m) => valeur('SELECT general_notes FROM interviews WHERE id = $1', m.entretienA),
    attendu: (marque) => marque,
  },
  {
    nom: 'attachment_meta',
    entityType: 'attachment',
    id: (m) => m.pieceA,
    gagnante: 'version appareil 1 (récente)',
    perdante: 'version appareil 2 (ancienne)',
    ecriture: (m, marque, t) =>
      op(
        'attachment_meta',
        m.pieceA,
        chargePiece(m.missionId, { interviewId: m.entretienA, answerId: null }, String(marque)),
        t,
      ),
    lecture: (m) => valeur('SELECT content FROM attachments WHERE id = $1', m.pieceA),
    attendu: (marque) => marque,
  },
];

describe('L6a · scénario 5 (§9.8) — deux appareils du MÊME auditeur, rien d’écrasé en silence @critique', () => {
  for (const cas of CAS_ARBITRAGE) {
    it(`${cas.nom} : l’écriture plus ANCIENNE → superseded, la ligne garde la plus récente, la perdante est archivée (sync_arbitrage) @critique`, async () => {
      const m = await semerMonde();
      const tRecent = instant();
      const tAncien = new Date(Date.parse(tRecent) - 120_000).toISOString();

      const recente = cas.ecriture(m, cas.gagnante, tRecent);
      const r1 = await pousser(m.A.jeton, m.missionId, [recente], { deviceId: 'appareil-1' });
      expect(resultatsDe(r1, [recente])).toEqual(['applied']);
      expect(await cas.lecture(m)).toEqual(cas.attendu(cas.gagnante));
      const archivesAvant = await revisionsDe(cas.id(m));

      const tardive = cas.ecriture(m, cas.perdante, tAncien);
      const r2 = await pousser(m.A.jeton, m.missionId, [tardive], { deviceId: 'appareil-2' });
      expect(resultatsDe(r2, [tardive])).toEqual(['superseded']);
      expect(await cas.lecture(m)).toEqual(cas.attendu(cas.gagnante));

      const nouvelles = (await revisionsDe(cas.id(m))).slice(archivesAvant.length);
      const arbitrees = nouvelles.filter((a) => a.change_origin === 'sync_arbitrage');
      expect(
        arbitrees.length,
        'la valeur perdante n’est pas archivée en sync_arbitrage (05 §9.3, invariant 7)',
      ).toBe(1);
      const [archive] = arbitrees;
      if (archive === undefined) throw new Error('archive absente');
      expect(archive.entity_type).toBe(cas.entityType);
      expect(archive.entity_id).toBe(cas.id(m));
      expect(archive.answer_id).toBe(cas.entityType === 'answer' ? cas.id(m) : null);
      expect(archive.changed_by).toBe(m.A.id);
      // la valeur PERDANTE — et non la gagnante — est celle qu'on archive
      if (cas.entityType === 'answer') {
        expect(archive.previous_value).toMatchObject({
          value: { type: 'yes_no', v: cas.perdante },
          clientUpdatedAt: tAncien,
        });
      } else {
        expect(JSON.stringify(archive.previous_value)).toContain(String(cas.perdante));
      }
    });
  }

  it('answer : l’écriture plus RÉCENTE gagne et la valeur écrasée est archivée (§9.4, PD3) @critique', async () => {
    const m = await semerMonde();
    const o = op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true));
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    expect(await valeur('SELECT value FROM answers WHERE id = $1', m.reponseA)).toEqual({
      type: 'yes_no',
      v: true,
    });
    const archives = await revisionsDe(m.reponseA);
    expect(archives.map((a) => a.previous_value)).toContainEqual(
      expect.objectContaining({ value: { type: 'yes_no', v: false } }),
    );
    for (const a of archives) {
      expect(['terrain', 'sync_arbitrage']).toContain(a.change_origin);
      expect(a.entity_type).toBe('answer');
    }
  });

  // ARBITRAGE A01 (2026-10-09) — l'invariant 7 prime sur la lecture étroite de PD3 :
  // toute colonne écrasée d'une réponse est archivée, même quand `value` ne bouge
  // pas. (PD3 reste vrai sur un point : le compteur client n'est pas le déclencheur
  // — c'est la comparaison des colonnes qui décide.)
  it('answer : note / withheld / notApplicable écrasés sans changement de value → applied ET version précédente archivée (terrain) @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'answer',
      m.reponseA,
      chargeReponse(m.entretienA, m.mq1, false, {
        note: 'note seule',
        withheld: true,
        withheldReason: 'confidentiel',
        notApplicable: true,
        naReason: 'hors sujet',
      }),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    expect(
      await lignes('SELECT note, withheld, not_applicable FROM answers WHERE id = $1', [
        m.reponseA,
      ]),
    ).toEqual([{ note: 'note seule', withheld: true, not_applicable: true }]);
    const archives = await revisionsDe(m.reponseA);
    expect(archives.map((a) => a.change_origin)).toEqual(['terrain']);
    expect(archives[0]?.previous_value).toMatchObject({
      note: null,
      withheld: false,
      notApplicable: false,
    });
  });

  it('answer : réécriture strictement identique (horodatage plus récent) → applied, aucune archive', async () => {
    const m = await semerMonde();
    const o = op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, false));
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    expect(await revisionsDe(m.reponseA)).toEqual([]);
  });
});

// =============================================================================
// 6. sync_log — une ligne `push` par lot ABOUTI, par le chemin applicatif (A-3)
// =============================================================================
describe('L6a · sync_log (05 §9.7, amendement A-3) @critique', () => {
  it('un lot abouti écrit UNE ligne push fidèle : appareil, compte, outbox_remaining, conflits @critique', async () => {
    const m = await semerMonde();
    const lot: Op[] = [
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: null, answerId: null }, 'a'),
      ),
      op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq2, true)),
      op('interview', m.entretienB, chargeEntretien(m.missionId, m.racine, { generalNotes: 'x' })), // forbidden
      op('answer', uuidv7(), chargeReponse(uuidv7(), m.mq1, true)), // error
    ];
    const debut = Date.now();
    expect(
      resultatsDe(
        await pousser(m.A.jeton, m.missionId, lot, {
          deviceId: 'appareil-journal',
          outboxRemaining: 7,
        }),
        lot,
      ),
    ).toEqual(['applied', 'applied', 'forbidden', 'error']);
    const journal = await journalSync(m.A.id);
    expect(journal).toHaveLength(1);
    const [ligne] = journal;
    if (ligne === undefined) throw new Error('aucune ligne sync_log');
    expect(ligne.device_id).toBe('appareil-journal');
    expect(ligne.direction).toBe('push');
    expect(ligne.items_count).toBe(4);
    expect(ligne.conflicts_count).toBe(2);
    expect(ligne.outbox_remaining).toBe(7);
    expect(ligne.status).not.toBeNull();
    expect(ligne.started_at).toBeInstanceOf(Date);
    expect(ligne.ended_at).toBeInstanceOf(Date);
    const debutLigne = (ligne.started_at as Date).getTime();
    const finLigne = (ligne.ended_at as Date).getTime();
    expect(finLigne).toBeGreaterThanOrEqual(debutLigne);
    expect(debutLigne).toBeGreaterThanOrEqual(debut - 5_000);
  });

  it('outbox_remaining = 0 est consigné tel quel (le garde-fou §9.7 en dépend) @critique', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'a'),
    );
    await pousser(m.A.jeton, m.missionId, [o], { outboxRemaining: 0 });
    const journal = await journalSync(m.A.id);
    expect(journal.map((l) => l.outbox_remaining)).toEqual([0]);
  });

  it('trois rejeux du même lot → trois lignes push (chaque lot abouti est journalisé)', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'a'),
    );
    for (let i = 0; i < 3; i += 1)
      await pousser(m.A.jeton, m.missionId, [o], { outboxRemaining: 2 - i });
    const journal = await journalSync(m.A.id);
    expect(journal.map((l) => l.outbox_remaining)).toEqual([2, 1, 0]);
    expect(journal.map((l) => l.items_count)).toEqual([1, 1, 1]);
  });

  it('un lot refusé en entier (sans jeton) n’écrit aucune ligne', async () => {
    const m = await semerMonde();
    const o = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, { interviewId: null, answerId: null }, 'a'),
    );
    const r = await posterBrut({
      missionId: m.missionId,
      deviceId: 'appareil-refuse-401',
      operations: [o],
      outboxRemaining: 3,
    });
    expect(r.statut).toBe(401);
    const total = await valeur(
      'SELECT count(*)::int AS n FROM sync_log WHERE device_id = $1',
      'appareil-refuse-401',
    );
    expect(total).toBe(0);
  });
});

// =============================================================================
// 7. REFUS ET CAS LIMITES — ajoutés après livraison (couverture des branches)
// =============================================================================
// Chaque attente vient du pack quand il parle (§9.3 : `error` est rejouable,
// `forbidden` ne s'applique jamais ; §9.9 ; invariant 7), et sinon des OPTIONS
// prises par l'auteur là où le pack est muet, que la coordination inscrit en
// DECISIONS (2026-10-09) : analyste → 403 ; conducted_by NULL → forbidden ;
// delete_soft → error ; second id pour même (session, question) → error ; même
// horodatage, contenu différent → superseded + archive de l'entrante ; réponse
// qui change de session/question → forbidden.
//
// INVARIANT COMMUN : une op `error` ou `forbidden` n'écrit RIEN — ni la ligne
// métier, ni `processed_ops` (sinon le rejeu d'un `error` deviendrait
// `duplicate` et l'op serait perdue).

/** Pousse une op seule et exige : ce résultat, état métier inchangé, op non consignée. */
async function exigerRefusSansTrace(
  jeton: string,
  m: Monde,
  o: Op,
  attendu: 'error' | 'forbidden',
): Promise<void> {
  const avant = await etatMetier(m.missionId);
  expect(await resultatUnique(jeton, m.missionId, o)).toBe(attendu);
  expect(await etatMetier(m.missionId)).toBe(avant);
  expect(await opsTraitees([o.opId])).toEqual([]);
}

interface AutreMission {
  readonly missionId: string;
  readonly racine: string;
  readonly mq: string;
  readonly entretien: string;
  readonly piece: string;
  readonly proposition: string;
  readonly adhoc: { readonly questionId: string; readonly missionQuestionId: string };
}

/** Une seconde mission, où A est AUSSI consultant : la mission du lot ≠ celle de la donnée. */
async function semerAutreMissionDeA(m: Monde): Promise<AutreMission> {
  const missionId = await semerMission();
  await rattacher(missionId, m.A.id, 'consultant');
  const racine = await semerUnite(missionId);
  const { missionQuestionId: mq } = await semerQuestionDeMission(missionId);
  const entretien = await semerEntretien(missionId, racine, m.A.id);
  const piece = await semerPiece(missionId, m.A.id, { interviewId: null, answerId: null });
  const proposition = await semerUnite(missionId, {
    parentId: racine,
    statut: 'proposee',
    proposePar: m.A.id,
  });
  const adhoc = await semerQuestionDeMission(missionId, { adHocPar: m.A.id });
  return { missionId, racine, mq, entretien, piece, proposition, adhoc };
}

const NOTE_VOLANTE = { interviewId: null, answerId: null } as const;

describe('L6a · charges illisibles → error, rien d’écrit, rejouable @critique', () => {
  const CHARGES_ILLISIBLES: readonly {
    readonly entite: EntiteSync;
    readonly charge: (m: Monde) => Record<string, unknown>;
  }[] = [
    { entite: 'interview', charge: (m) => ({ missionId: m.missionId, orgUnitId: 'pas-un-uuid' }) },
    { entite: 'answer', charge: (m) => ({ interviewId: m.entretienA }) },
    {
      entite: 'attachment_meta',
      charge: (m) => ({ missionId: m.missionId, kind: 'hologramme', content: 'x' }),
    },
    {
      entite: 'org_unit_proposal',
      charge: (m) => ({ missionId: m.missionId, parentId: m.racine, kind: 'service', name: '   ' }),
    },
    {
      entite: 'question_adhoc',
      charge: () => ({ question: { textFr: 'Sans bloc ?', answerType: 'free_text' } }),
    },
  ];
  for (const cas of CHARGES_ILLISIBLES) {
    it(`${cas.entite} : charge non conforme → error, aucune trace @critique`, async () => {
      const m = await semerMonde();
      await exigerRefusSansTrace(m.A.jeton, m, op(cas.entite, uuidv7(), cas.charge(m)), 'error');
    });
  }

  it('interview : un horodatage de charge non UTC (sans Z) → error', async () => {
    const m = await semerMonde();
    const o = op(
      'interview',
      uuidv7(),
      chargeEntretien(m.missionId, m.racine, { startedAt: '2026-10-01 09:00' }),
    );
    await exigerRefusSansTrace(m.A.jeton, m, o, 'error');
  });
});

describe('L6a · delete_soft → error pour les cinq entités (option tracée : invariant 7) @critique', () => {
  it('aucune suppression, aucune trace, op rejouable @critique', async () => {
    const m = await semerMonde();
    const cibles: readonly [EntiteSync, string, Record<string, unknown>][] = [
      ['interview', m.entretienA, chargeEntretien(m.missionId, m.racine)],
      ['answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, false)],
      ['attachment_meta', m.noteVolanteA, chargePiece(m.missionId, NOTE_VOLANTE, 'x')],
      ['org_unit_proposal', m.propositionA, chargeProposition(m.missionId, m.racine, 'x')],
      [
        'question_adhoc',
        m.adhocA.questionId,
        chargeQuestionAdhoc(m.adhocA.missionQuestionId, 'x', 1),
      ],
    ];
    const lot: Op[] = cibles.map(([entite, id, charge]) => ({
      ...op(entite, id, charge),
      action: 'delete_soft',
    }));
    const avant = await etatMetier(m.missionId);
    expect(resultatsDe(await pousser(m.A.jeton, m.missionId, lot), lot)).toEqual(
      lot.map(() => 'error'),
    );
    expect(await etatMetier(m.missionId)).toBe(avant);
    expect(await opsTraitees(lot.map((o) => o.opId))).toEqual([]);
  });
});

describe('L6a · la mission de la charge et des rattachements est vérifiée côté serveur @critique', () => {
  it('interview / attachment_meta / org_unit_proposal : missionId de charge ≠ celui du lot → forbidden @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    const ops = [
      op('interview', uuidv7(), chargeEntretien(autre.missionId, autre.racine)),
      op('attachment_meta', uuidv7(), chargePiece(autre.missionId, NOTE_VOLANTE, 'x')),
      op('org_unit_proposal', uuidv7(), chargeProposition(autre.missionId, autre.racine, 'x')),
    ];
    const avantAutre = await etatMetier(autre.missionId);
    for (const o of ops) await exigerRefusSansTrace(m.A.jeton, m, o, 'forbidden');
    expect(await etatMetier(autre.missionId)).toBe(avantAutre);
  });

  it('interview : unité inconnue → error ; unité d’une autre mission → forbidden @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('interview', uuidv7(), chargeEntretien(m.missionId, uuidv7())),
      'error',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('interview', uuidv7(), chargeEntretien(m.missionId, autre.racine)),
      'forbidden',
    );
  });

  it('answer : question de mission inconnue → error ; d’une autre mission → forbidden @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('answer', uuidv7(), chargeReponse(m.entretienA, uuidv7(), true)),
      'error',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('answer', uuidv7(), chargeReponse(m.entretienA, autre.mq, true)),
      'forbidden',
    );
  });

  it('answer : la session de A dans une AUTRE mission, poussée sous ce lot → forbidden @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('answer', uuidv7(), chargeReponse(autre.entretien, m.mq1, true)),
      'forbidden',
    );
  });

  it('org_unit_proposal : parent inconnu → error ; parent d’une autre mission → forbidden @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('org_unit_proposal', uuidv7(), chargeProposition(m.missionId, uuidv7(), 'x')),
      'error',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('org_unit_proposal', uuidv7(), chargeProposition(m.missionId, autre.racine, 'x')),
      'forbidden',
    );
  });

  it('attachment_meta : session ou réponse de rattachement inconnue → error (rejouable) @critique', async () => {
    const m = await semerMonde();
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: uuidv7(), answerId: null }, 'x'),
      ),
      'error',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op(
        'attachment_meta',
        uuidv7(),
        chargePiece(m.missionId, { interviewId: null, answerId: uuidv7() }, 'x'),
      ),
      'error',
    );
  });

  it('entités EXISTANTES d’une autre mission de A, visées sous ce lot → forbidden, l’autre mission intacte @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    const ops: Op[] = [
      op('interview', autre.entretien, chargeEntretien(m.missionId, m.racine)),
      op('attachment_meta', autre.piece, chargePiece(m.missionId, NOTE_VOLANTE, 'x')),
      op('org_unit_proposal', autre.proposition, chargeProposition(m.missionId, m.racine, 'x')),
      op('question_adhoc', autre.adhoc.questionId, chargeQuestionAdhoc(uuidv7(), 'Détournée ?', 1)),
    ];
    const avantAutre = await etatMetier(autre.missionId);
    for (const o of ops) await exigerRefusSansTrace(m.A.jeton, m, o, 'forbidden');
    expect(await etatMetier(autre.missionId)).toBe(avantAutre);
  });
});

describe('L6a · droits de route : seuls les collecteurs de la mission poussent (option : analyste → 403) @critique', () => {
  for (const roleSurMission of ['lecteur', 'analyste'] as const) {
    it(`consultant rattaché comme ${roleSurMission} → lot refusé 403, rien d’écrit, aucune ligne sync_log @critique`, async () => {
      const m = await semerMonde();
      await exigerRouteVivante(m);
      const c = await creerCompte('consultant');
      await rattacher(m.missionId, c.id, roleSurMission);
      const o = op('attachment_meta', uuidv7(), chargePiece(m.missionId, NOTE_VOLANTE, 'x'));
      const avant = await etatMetier(m.missionId);
      const r = await pousser(c.jeton, m.missionId, [o]);
      expect(r.statut).toBe(403);
      expect(r.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(await etatMetier(m.missionId)).toBe(avant);
      expect(await journalSync(c.id)).toEqual([]);
    });
  }

  it('rôle global analyste, rattaché analyste → 403 @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m);
    const c = await creerCompte('analyste');
    await rattacher(m.missionId, c.id, 'analyste');
    const o = op('attachment_meta', uuidv7(), chargePiece(m.missionId, NOTE_VOLANTE, 'x'));
    const r = await pousser(c.jeton, m.missionId, [o]);
    expect(r.statut).toBe(403);
    expect(r.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('lead : crée SA session → applied ; modifie la réponse de A → forbidden (§9.9 : le lead corrige par l’API siège) @critique', async () => {
    const m = await semerMonde();
    const lead = await creerCompte('consultant');
    await rattacher(m.missionId, lead.id, 'lead');
    const sienne = op('interview', uuidv7(), chargeEntretien(m.missionId, m.racine));
    expect(await resultatUnique(lead.jeton, m.missionId, sienne)).toBe('applied');
    await exigerRefusSansTrace(
      lead.jeton,
      m,
      op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true)),
      'forbidden',
    );
  });

  it('session planifiée sans auditeur (conducted_by NULL) → forbidden pour qui la vise (option tracée) @critique', async () => {
    const m = await semerMonde();
    const id = uuidv7();
    await bd().query(
      `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id,
                               schedule_status, status, created_at, updated_at)
       VALUES ($1, $2, NULL, 'entretien', 'sur_site', $3, 'planifie', 'non_demarre', now(), now())`,
      [id, m.missionId, m.racine],
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('interview', id, chargeEntretien(m.missionId, m.racine)),
      'forbidden',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('answer', uuidv7(), chargeReponse(id, m.mq1, true)),
      'forbidden',
    );
  });
});

describe('L6a · règles propres à chaque entité @critique', () => {
  it('answer : changer de session ou de question sur une réponse existante → forbidden @critique', async () => {
    const m = await semerMonde();
    const autreSessionDeA = await semerEntretien(m.missionId, m.racine, m.A.id);
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('answer', m.reponseA, chargeReponse(autreSessionDeA, m.mq1, true)),
      'forbidden',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq2, true)),
      'forbidden',
    );
  });

  it('answer : une mise à jour SANS value conserve la valeur ; une création minimale prend les défauts du 04', async () => {
    const m = await semerMonde();
    const sansValeur: Record<string, unknown> = {
      interviewId: m.entretienA,
      missionQuestionId: m.mq1,
      note: 'complément',
    };
    expect(await resultatUnique(m.A.jeton, m.missionId, op('answer', m.reponseA, sansValeur))).toBe(
      'applied',
    );
    expect(await lignes('SELECT value, note FROM answers WHERE id = $1', [m.reponseA])).toEqual([
      { value: { type: 'yes_no', v: false }, note: 'complément' },
    ]);
    const nouvelle = op('answer', uuidv7(), {
      interviewId: m.entretienA,
      missionQuestionId: m.mq2,
      value: null,
    });
    expect(await resultatUnique(m.A.jeton, m.missionId, nouvelle)).toBe('applied');
    expect(
      await lignes(
        `SELECT value, source, withheld, hors_parcours, flag_review, not_applicable, revision
           FROM answers WHERE id = $1`,
        [nouvelle.entityId],
      ),
    ).toEqual([
      {
        value: null,
        source: 'entretien',
        withheld: false,
        hors_parcours: false,
        flag_review: false,
        not_applicable: false,
        revision: 1,
      },
    ]);
  });

  it('attachment_meta : A rattache sa note volante à SA session → applied ; à la session de B → forbidden @critique', async () => {
    const m = await semerMonde();
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op(
        'attachment_meta',
        m.noteVolanteA,
        chargePiece(m.missionId, { interviewId: m.entretienB, answerId: null }, 'note semée'),
      ),
      'forbidden',
    );
    const o = op(
      'attachment_meta',
      m.noteVolanteA,
      chargePiece(m.missionId, { interviewId: m.entretienA, answerId: null }, 'note semée'),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    expect(await valeur('SELECT interview_id FROM attachments WHERE id = $1', m.noteVolanteA)).toBe(
      m.entretienA,
    );
  });

  it('org_unit_proposal : unité déjà qualifiée par le siège (active) → forbidden @critique', async () => {
    const m = await semerMonde();
    await bd().query("UPDATE org_units SET status = 'active' WHERE id = $1", [m.propositionA]);
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('org_unit_proposal', m.propositionA, chargeProposition(m.missionId, m.racine, 'Renommee')),
      'forbidden',
    );
  });

  it('org_unit_proposal : proposedBy forgé → forbidden @critique', async () => {
    const m = await semerMonde();
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('org_unit_proposal', uuidv7(), {
        ...chargeProposition(m.missionId, m.racine, 'x'),
        proposedBy: m.B.id,
      }),
      'forbidden',
    );
  });

  it('org_unit_proposal : rattachée à elle-même ou à sa descendante (cycle) → error, arbre intact @critique', async () => {
    const m = await semerMonde();
    const enfant = op(
      'org_unit_proposal',
      uuidv7(),
      chargeProposition(m.missionId, m.propositionA, 'Enfant'),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, enfant)).toBe('applied');
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op(
        'org_unit_proposal',
        m.propositionA,
        chargeProposition(m.missionId, m.propositionA, 'Soi'),
      ),
      'error',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op(
        'org_unit_proposal',
        m.propositionA,
        chargeProposition(m.missionId, enfant.entityId, 'Boucle'),
      ),
      'error',
    );
  });

  it('org_unit_proposal : proposition à la racine (parentId null) puis réécriture identique → applied, rien ne bouge', async () => {
    const m = await semerMonde();
    const o = op('org_unit_proposal', uuidv7(), {
      missionId: m.missionId,
      parentId: null,
      kind: 'direction',
      name: 'Direction proposee',
    });
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.A.jeton, m.missionId, { ...o, opId: uuidv7() })).toBe('applied');
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('question_adhoc : viser une question de BANQUE → forbidden, la banque intacte @critique', async () => {
    const m = await semerMonde();
    const banque = await semerQuestionDeMission(m.missionId);
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', banque.questionId, chargeQuestionAdhoc(uuidv7(), 'Réécrite ?', 1)),
      'forbidden',
    );
  });

  it('question_adhoc : missionQuestion.id appartenant à une autre question → forbidden @critique', async () => {
    const m = await semerMonde();
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', uuidv7(), chargeQuestionAdhoc(m.mq1, 'Accrochée ailleurs ?', 1)),
      'forbidden',
    );
  });

  it('question_adhoc : question ad hoc de B → forbidden ; createdBy forgé → forbidden @critique', async () => {
    const m = await semerMonde();
    const deB = await semerQuestionDeMission(m.missionId, { adHocPar: m.B.id });
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', deB.questionId, chargeQuestionAdhoc(deB.missionQuestionId, 'x', 1)),
      'forbidden',
    );
    const charge = chargeQuestionAdhoc(uuidv7(), 'Forgée ?');
    const question = charge.question as Record<string, unknown>;
    const forgee = { ...charge, question: { ...question, createdBy: m.B.id } };
    await exigerRefusSansTrace(m.A.jeton, m, op('question_adhoc', uuidv7(), forgee), 'forbidden');
  });

  it('question_adhoc : réécriture identique → applied, aucune ligne ne bouge', async () => {
    const m = await semerMonde();
    const o = op('question_adhoc', uuidv7(), chargeQuestionAdhoc(uuidv7(), 'Stable ?', 3));
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    const avant = await etatMetier(m.missionId);
    expect(await resultatUnique(m.A.jeton, m.missionId, { ...o, opId: uuidv7() })).toBe('applied');
    expect(await etatMetier(m.missionId)).toBe(avant);
  });

  it('interview : champs de date et valeurs par défaut transcrits fidèlement (UTC)', async () => {
    const m = await semerMonde();
    const o = op('interview', uuidv7(), {
      missionId: m.missionId,
      orgUnitId: m.racine,
      kind: 'observation',
      consentGiven: true,
      consentedAt: '2026-10-01T09:01:00.000Z',
      noticeShownAt: '2026-10-01T09:00:00.000Z',
      scheduledAt: '2026-10-01T08:30:00.000Z',
      startedAt: '2026-10-01T09:02:00.000Z',
      endedAt: null,
      scheduledDurationMin: 45,
    });
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    const [ligne] = await lignes(
      `SELECT kind, mode, status, schedule_status, consented_at, notice_shown_at, scheduled_at,
              started_at, ended_at, scheduled_duration_min, client_created_at, client_updated_at
         FROM interviews WHERE id = $1`,
      [o.entityId],
    );
    expect(ligne).toEqual({
      kind: 'observation',
      mode: null,
      status: 'non_demarre',
      schedule_status: 'a_planifier',
      consented_at: new Date('2026-10-01T09:01:00.000Z'),
      notice_shown_at: new Date('2026-10-01T09:00:00.000Z'),
      scheduled_at: new Date('2026-10-01T08:30:00.000Z'),
      started_at: new Date('2026-10-01T09:02:00.000Z'),
      ended_at: null,
      scheduled_duration_min: 45,
      client_created_at: new Date(o.clientUpdatedAt),
      client_updated_at: new Date(o.clientUpdatedAt),
    });
  });
});

describe('L6a · même horodatage, deux contenus (option : superseded + archive de l’entrante) @critique', () => {
  for (const cas of CAS_ARBITRAGE) {
    it(`${cas.nom} : contenu différent au même client_updated_at → superseded, la ligne inchangée, l’entrante archivée @critique`, async () => {
      const m = await semerMonde();
      const t = instant();
      const premiere = cas.ecriture(m, cas.gagnante, t);
      expect(await resultatUnique(m.A.jeton, m.missionId, premiere)).toBe('applied');
      const archivesAvant = await revisionsDe(cas.id(m));
      const rivale = cas.ecriture(m, cas.perdante, t);
      expect(await resultatUnique(m.A.jeton, m.missionId, rivale)).toBe('superseded');
      expect(await cas.lecture(m)).toEqual(cas.attendu(cas.gagnante));
      const nouvelles = (await revisionsDe(cas.id(m))).slice(archivesAvant.length);
      expect(nouvelles.map((a) => a.change_origin)).toEqual(['sync_arbitrage']);
      const [archive] = nouvelles;
      if (cas.entityType === 'answer') {
        expect(archive?.previous_value).toMatchObject({
          value: { type: 'yes_no', v: cas.perdante },
          clientUpdatedAt: t,
        });
      } else {
        expect(JSON.stringify(archive?.previous_value)).toContain(String(cas.perdante));
      }
    });

    it(`${cas.nom} : même contenu au même client_updated_at → applied, aucune archive`, async () => {
      const m = await semerMonde();
      const t = instant();
      const premiere = cas.ecriture(m, cas.gagnante, t);
      expect(await resultatUnique(m.A.jeton, m.missionId, premiere)).toBe('applied');
      const avant = await etatMetier(m.missionId);
      const jumelle = cas.ecriture(m, cas.gagnante, t);
      expect(await resultatUnique(m.A.jeton, m.missionId, jumelle)).toBe('applied');
      expect(await etatMetier(m.missionId)).toBe(avant);
    });
  }

  it('interview et attachment_meta : l’écriture plus récente archive les champs écrasés (origine terrain)', async () => {
    const m = await semerMonde();
    const s = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, { generalNotes: 'notes v2' }),
    );
    const p = op(
      'attachment_meta',
      m.pieceA,
      chargePiece(m.missionId, { interviewId: m.entretienA, answerId: null }, 'pièce v2'),
    );
    expect(resultatsDe(await pousser(m.A.jeton, m.missionId, [s, p]), [s, p])).toEqual([
      'applied',
      'applied',
    ]);
    const [archiveSession] = await revisionsDe(m.entretienA);
    const [archivePiece] = await revisionsDe(m.pieceA);
    expect(archiveSession?.change_origin).toBe('terrain');
    expect(JSON.stringify(archiveSession?.previous_value)).toContain('notes semées');
    expect(archivePiece?.change_origin).toBe('terrain');
    expect(JSON.stringify(archivePiece?.previous_value)).toContain('note semée');
  });
});

describe('L6a · échec SQL d’une op : point de sauvegarde, le reste du lot est conservé @critique', () => {
  it('une op qui viole une contrainte en base → error ; les ops voisines du lot sont appliquées et consignées @critique', async () => {
    const m = await semerMonde();
    const avantOk = op(
      'attachment_meta',
      uuidv7(),
      chargePiece(m.missionId, NOTE_VOLANTE, 'avant'),
    );
    // `person_service_id` est une FK vers `services` : un UUID inconnu fait échouer
    // l'INSERT en base, APRÈS toutes les vérifications applicatives.
    const fautive = op(
      'interview',
      uuidv7(),
      chargeEntretien(m.missionId, m.racine, { personServiceId: uuidv7() }),
    );
    const apresOk = op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq2, true));
    const lot = [avantOk, fautive, apresOk];
    expect(
      resultatsDe(await pousser(m.A.jeton, m.missionId, lot, { outboxRemaining: 1 }), lot),
    ).toEqual(['applied', 'error', 'applied']);
    expect(
      await valeur('SELECT count(*)::int AS n FROM interviews WHERE id = $1', fautive.entityId),
    ).toBe(0);
    expect(
      await valeur('SELECT count(*)::int AS n FROM attachments WHERE id = $1', avantOk.entityId),
    ).toBe(1);
    expect(
      await valeur('SELECT count(*)::int AS n FROM answers WHERE id = $1', apresOk.entityId),
    ).toBe(1);
    expect((await opsTraitees(lot.map((o) => o.opId))).map((l) => l.op_id)).toEqual(
      [avantOk.opId, apresOk.opId].sort(),
    );
    const journal = await journalSync(m.A.id);
    expect(journal.map((l) => [l.items_count, l.conflicts_count])).toEqual([[3, 1]]);
  });
});

// =============================================================================
// 8. LE RACCORD TERRAIN ↔ SERVEUR — clés de charge FERMÉES (H1, H2 arbitrées)
// =============================================================================
// La liste ci-dessous est LE contrat transmis à l'auteur terrain. Elle est écrite
// depuis les colonnes du 04 écrivables par le terrain, jamais depuis le schéma
// Zod du serveur : si les deux divergent, ce bloc rougit.
const CLES_ACCEPTEES = {
  interview: [
    'missionId',
    'orgUnitId',
    'conductedBy',
    'kind',
    'mode',
    'linkedReviewAnswerId',
    'personName',
    'personRole',
    'personServiceId',
    'personEmail',
    'interlocutorProfileId',
    'participants',
    'documentRequestId',
    'consentGiven',
    'consentAudio',
    'consentedAt',
    'informationNoticeVersion',
    'noticeShownAt',
    'scheduledAt',
    'scheduledDurationMin',
    'scheduleStatus',
    'status',
    'startedAt',
    'endedAt',
    'generalNotes',
    'clientCreatedAt',
  ],
  answer: [
    'interviewId',
    'missionQuestionId',
    'value',
    'source',
    'withheld',
    'withheldReason',
    'horsParcours',
    'note',
    'flagReview',
    'reviewReason',
    'notApplicable',
    'naReason',
    'clientCreatedAt',
  ],
  attachment_meta: [
    'missionId',
    'interviewId',
    'answerId',
    'kind',
    'content',
    'filename',
    'mime',
    'sizeBytes',
    'createdBy',
    'clientCreatedAt',
  ],
  org_unit_proposal: [
    'missionId',
    'parentId',
    'kind',
    'name',
    'headcount',
    'countryCode',
    'timezone',
    'proposedBy',
  ],
  question_adhoc: ['question', 'missionQuestion'],
} as const satisfies Record<EntiteSync, readonly string[]>;

const CLES_QUESTION_ADHOC = [
  'textFr',
  'guidanceFr',
  'answerType',
  'criticality',
  'blockCode',
  'options',
  'allowRange',
  'expectedSource',
  'createdBy',
] as const;
const CLES_MISSION_QUESTION_ADHOC = ['id', 'position'] as const;

/** Une charge qui porte CHAQUE clé acceptée, avec une valeur valide et sans FK hasardeuse. */
function chargeComplete(m: Monde, entite: EntiteSync): Record<string, unknown> {
  switch (entite) {
    case 'interview':
      return {
        missionId: m.missionId,
        orgUnitId: m.racine,
        conductedBy: m.A.id,
        kind: 'entretien',
        mode: 'distanciel',
        linkedReviewAnswerId: null,
        personName: 'Interlocuteur fictif',
        personRole: 'Fonction fictive',
        personServiceId: null,
        personEmail: 'interlocuteur.fictif@exemple.test',
        interlocutorProfileId: null,
        participants: [{ nom: 'Participant fictif', fonction: 'Fonction fictive' }],
        documentRequestId: null,
        consentGiven: true,
        consentAudio: false,
        consentedAt: '2026-10-01T09:01:00.000Z',
        informationNoticeVersion: 'v-fictive',
        noticeShownAt: '2026-10-01T09:00:00.000Z',
        scheduledAt: '2026-10-01T08:30:00.000Z',
        scheduledDurationMin: 60,
        scheduleStatus: 'realise',
        status: 'termine',
        startedAt: '2026-10-01T09:02:00.000Z',
        endedAt: '2026-10-01T10:00:00.000Z',
        generalNotes: 'notes fictives',
        clientCreatedAt: '2026-10-01T08:00:00.000Z',
      };
    case 'answer':
      return {
        interviewId: m.entretienA,
        missionQuestionId: m.mq2,
        value: { type: 'yes_no', v: true },
        source: 'observation',
        withheld: true,
        withheldReason: 'confidentiel',
        horsParcours: true,
        note: 'note fictive',
        flagReview: true,
        reviewReason: 'à revoir',
        notApplicable: false,
        naReason: null,
        clientCreatedAt: '2026-10-01T08:00:00.000Z',
      };
    case 'attachment_meta':
      return {
        missionId: m.missionId,
        interviewId: m.entretienA,
        answerId: m.reponseA,
        kind: 'photo',
        content: null,
        filename: 'photo-fictive.jpg',
        mime: 'image/jpeg',
        sizeBytes: 1024,
        createdBy: m.A.id,
        clientCreatedAt: '2026-10-01T08:00:00.000Z',
      };
    case 'org_unit_proposal':
      return {
        missionId: m.missionId,
        parentId: m.racine,
        kind: 'equipe',
        name: 'Equipe proposee',
        headcount: 12,
        countryCode: 'FR',
        timezone: 'Europe/Paris',
        proposedBy: m.A.id,
      };
    case 'question_adhoc':
      return {
        question: {
          textFr: 'Question ad hoc complète ?',
          guidanceFr: 'Consigne fictive',
          answerType: 'free_text',
          criticality: 'informatif',
          blockCode: blocCode,
          options: null,
          allowRange: false,
          expectedSource: 'entretien',
          createdBy: m.A.id,
        },
        missionQuestion: { id: uuidv7(), position: 5 },
      };
  }
}

describe('L6a · clés de charge fermées (H1 arbitrée) — la liste transmise au terrain @critique', () => {
  it('chaque charge complète porte exactement les clés de CLES_ACCEPTEES (garde de la liste elle-même)', async () => {
    const m = await semerMonde();
    for (const entite of ENTITES_SYNC) {
      expect(Object.keys(chargeComplete(m, entite)).sort()).toEqual(
        [...CLES_ACCEPTEES[entite]].sort(),
      );
    }
    const adhoc = chargeComplete(m, 'question_adhoc');
    expect(Object.keys(adhoc.question as Record<string, unknown>).sort()).toEqual(
      [...CLES_QUESTION_ADHOC].sort(),
    );
    expect(Object.keys(adhoc.missionQuestion as Record<string, unknown>).sort()).toEqual(
      [...CLES_MISSION_QUESTION_ADHOC].sort(),
    );
  });

  for (const entite of ENTITES_SYNC) {
    it(`${entite} : une charge portant TOUTES les clés acceptées → applied @critique`, async () => {
      const m = await semerMonde();
      const o = op(entite, uuidv7(), chargeComplete(m, entite));
      expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    });

    it(`${entite} : une clé INCONNUE dans la charge → op refusée (error), rien d’écrit @critique`, async () => {
      const m = await semerMonde();
      const charge = { ...chargeComplete(m, entite), champInconnuDuContrat: 'x' };
      await exigerRefusSansTrace(m.A.jeton, m, op(entite, uuidv7(), charge), 'error');
    });
  }

  it('answer : `revision` (colonne serveur) dans la charge → refusée, comme toute clé hors liste @critique', async () => {
    const m = await semerMonde();
    const charge = { ...chargeComplete(m, 'answer'), revision: 9 };
    await exigerRefusSansTrace(m.A.jeton, m, op('answer', uuidv7(), charge), 'error');
  });

  it('question_adhoc : une clé inconnue DANS question ou DANS missionQuestion → refusée @critique', async () => {
    const m = await semerMonde();
    const base = chargeComplete(m, 'question_adhoc');
    const question = base.question as Record<string, unknown>;
    const mq = base.missionQuestion as Record<string, unknown>;
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', uuidv7(), { ...base, question: { ...question, weight: 3 } }),
      'error',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', uuidv7(), {
        ...base,
        missionQuestion: { ...mq, id: uuidv7(), addedAdHoc: true },
      }),
      'error',
    );
  });
});

describe('L6a · question_adhoc : le bloc arrive par son CODE (H2 arbitrée) @critique', () => {
  it('blockCode connu → applied, block_id résolu dans `blocks` @critique', async () => {
    const m = await semerMonde();
    const o = op('question_adhoc', uuidv7(), chargeQuestionAdhoc(uuidv7(), 'Bloc par code ?'));
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    expect(await valeur('SELECT block_id FROM questions WHERE id = $1', o.entityId)).toBe(blocId);
  });

  it('blockCode inconnu → error, ni question ni ligne de questionnaire @critique', async () => {
    const m = await semerMonde();
    const charge = chargeQuestionAdhoc(uuidv7(), 'Bloc fantôme ?');
    const question = charge.question as Record<string, unknown>;
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', uuidv7(), {
        ...charge,
        question: { ...question, blockCode: 'BLOC_INEXISTANT_FICTIF' },
      }),
      'error',
    );
  });

  it('l’ancienne clé blockId n’est plus acceptée → error @critique', async () => {
    const m = await semerMonde();
    const charge = chargeQuestionAdhoc(uuidv7(), 'Ancienne forme ?');
    const question = { ...(charge.question as Record<string, unknown>) };
    delete question.blockCode;
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', uuidv7(), { ...charge, question: { ...question, blockId: blocId } }),
      'error',
    );
  });
});

// =============================================================================
// 9. RÉSERVES DE LA REVUE CROISÉE A17 ET ARBITRAGES A01 (2026-10-09)
// =============================================================================
// H7 (forme de l'archive d'une RÉPONSE, posée par la réserve 2) : `previous_value`
// est un objet camelCase portant la version perdante ENTIÈRE — `value`, `note`,
// `withheld`, `withheldReason`, `notApplicable`, `naReason`, `flagReview`,
// `reviewReason`, `clientUpdatedAt`. Aucun autre lecteur de `previous_value`
// n'existe dans le dépôt au 2026-10-09 (grep `apps/*/src`, `packages/shared`).

describe('L6a · réserve 1 — références secondaires d’une session (BLOQUANT A17) @critique', () => {
  async function semerDemandeDocument(missionId: string): Promise<string> {
    const id = uuidv7();
    await bd().query(
      `INSERT INTO document_requests (id, mission_id, label, status) VALUES ($1, $2, 'Demande fictive', 'demande')`,
      [id, missionId],
    );
    return id;
  }

  it('linkedReviewAnswerId visant une réponse d’une AUTRE mission → forbidden, rien d’écrit @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    const reponseAutre = await semerReponse(autre.entretien, autre.mq);
    for (const id of [uuidv7(), m.entretienA]) {
      await exigerRefusSansTrace(
        m.A.jeton,
        m,
        op(
          'interview',
          id,
          chargeEntretien(m.missionId, m.racine, { linkedReviewAnswerId: reponseAutre }),
        ),
        'forbidden',
      );
    }
  });

  it('linkedReviewAnswerId inconnu → error, rien d’écrit @critique', async () => {
    const m = await semerMonde();
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op(
        'interview',
        uuidv7(),
        chargeEntretien(m.missionId, m.racine, { linkedReviewAnswerId: uuidv7() }),
      ),
      'error',
    );
  });

  it('documentRequestId d’une AUTRE mission → forbidden ; inconnu → error @critique', async () => {
    const m = await semerMonde();
    const autre = await semerAutreMissionDeA(m);
    const demandeAutre = await semerDemandeDocument(autre.missionId);
    for (const id of [uuidv7(), m.entretienA]) {
      await exigerRefusSansTrace(
        m.A.jeton,
        m,
        op(
          'interview',
          id,
          chargeEntretien(m.missionId, m.racine, { documentRequestId: demandeAutre }),
        ),
        'forbidden',
      );
    }
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op(
        'interview',
        uuidv7(),
        chargeEntretien(m.missionId, m.racine, { documentRequestId: uuidv7() }),
      ),
      'error',
    );
  });

  it('références de la MÊME mission → applied (témoin de non-sur-refus)', async () => {
    const m = await semerMonde();
    const demande = await semerDemandeDocument(m.missionId);
    const o = op(
      'interview',
      uuidv7(),
      chargeEntretien(m.missionId, m.racine, {
        linkedReviewAnswerId: m.reponseA,
        documentRequestId: demande,
      }),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
  });
});

describe('L6a · réserve 2 — superseded d’une réponse : la version perdante ENTIÈRE est archivée @critique', () => {
  it('tous les champs de la perdante (et son clientUpdatedAt) sont dans l’archive sync_arbitrage @critique', async () => {
    const m = await semerMonde();
    const tRecent = instant();
    const tAncien = new Date(Date.parse(tRecent) - 600_000).toISOString();
    const gagnante = op(
      'answer',
      m.reponseA,
      chargeReponse(m.entretienA, m.mq1, true, {
        note: 'note gagnante',
        withheld: false,
        withheldReason: null,
        notApplicable: false,
        naReason: null,
        flagReview: true,
        reviewReason: 'revue gagnante',
      }),
      tRecent,
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, gagnante)).toBe('applied');
    const avant = (await revisionsDe(m.reponseA)).length;
    const perdante = op(
      'answer',
      m.reponseA,
      chargeReponse(m.entretienA, m.mq1, false, {
        note: 'note perdante',
        withheld: true,
        withheldReason: 'confidentiel',
        notApplicable: true,
        naReason: 'hors sujet perdant',
        flagReview: false,
        reviewReason: null,
      }),
      tAncien,
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, perdante)).toBe('superseded');
    const nouvelles = (await revisionsDe(m.reponseA)).slice(avant);
    expect(nouvelles.map((a) => a.change_origin)).toEqual(['sync_arbitrage']);
    expect(nouvelles[0]?.previous_value).toMatchObject({
      value: { type: 'yes_no', v: false },
      note: 'note perdante',
      withheld: true,
      withheldReason: 'confidentiel',
      notApplicable: true,
      naReason: 'hors sujet perdant',
      flagReview: false,
      reviewReason: null,
      clientUpdatedAt: tAncien,
    });
    // et la ligne garde la gagnante, champ par champ
    expect(
      await lignes(
        'SELECT note, withheld, not_applicable, flag_review, review_reason FROM answers WHERE id = $1',
        [m.reponseA],
      ),
    ).toEqual([
      {
        note: 'note gagnante',
        withheld: false,
        not_applicable: false,
        flag_review: true,
        review_reason: 'revue gagnante',
      },
    ]);
  });
});

describe('L6a · arbitrage A01 — le statut d’une session ne recule jamais par le push @critique', () => {
  // Arbitrage de la coordination sur la réserve R1 d'A17 (2026-10-09) :
  //   · charge dont la SEULE différence avec la ligne serveur est un recul de
  //     statut → `forbidden`, rien d'écrit ;
  //   · charge plus récente qui recule le statut ET change autre chose → `applied` :
  //     le statut serveur est CONSERVÉ, le reste est appliqué, la version écrasée
  //     est archivée (`terrain`).
  // La charge « recul seul » recopie la ligne semée (`notes semées`, `sur_site`,
  // `realise`) : sans cela, `chargeEntretien` porterait d'autres notes et le cas
  // ne serait plus « seul ».
  const RECULS: readonly [string, string][] = [
    ['termine', 'non_demarre'],
    ['termine', 'en_cours'],
    ['en_cours', 'non_demarre'],
  ];
  for (const [depuis, vers] of RECULS) {
    it(`${depuis} → ${vers}, rien d’autre ne change : forbidden, rien d’écrit @critique`, async () => {
      const m = await semerMonde();
      await bd().query('UPDATE interviews SET status = $2 WHERE id = $1', [m.entretienA, depuis]);
      await exigerRefusSansTrace(
        m.A.jeton,
        m,
        op(
          'interview',
          m.entretienA,
          chargeEntretien(m.missionId, m.racine, { status: vers, generalNotes: 'notes semées' }),
        ),
        'forbidden',
      );
      expect(await valeur('SELECT status FROM interviews WHERE id = $1', m.entretienA)).toBe(
        depuis,
      );
    });
  }

  it('scénario 5 : appareil 2 plus récent, statut en recul + notes modifiées → applied, statut serveur conservé, notes appliquées, version écrasée archivée @critique', async () => {
    const m = await semerMonde();
    // appareil 1 termine la session
    const fin = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, { status: 'termine', generalNotes: 'notes semées' }),
    );
    expect(
      resultatsDe(await pousser(m.A.jeton, m.missionId, [fin], { deviceId: 'appareil-1' }), [fin]),
    ).toEqual(['applied']);
    const archivesAvant = (await revisionsDe(m.entretienA)).length;
    // appareil 2, resté sur `en_cours`, complète les notes PLUS TARD
    const complement = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, {
        status: 'en_cours',
        generalNotes: 'notes complétées sur appareil 2',
      }),
    );
    expect(
      resultatsDe(await pousser(m.A.jeton, m.missionId, [complement], { deviceId: 'appareil-2' }), [
        complement,
      ]),
    ).toEqual(['applied']);
    expect(
      await lignes('SELECT status, general_notes FROM interviews WHERE id = $1', [m.entretienA]),
    ).toEqual([{ status: 'termine', general_notes: 'notes complétées sur appareil 2' }]);
    const nouvelles = (await revisionsDe(m.entretienA)).slice(archivesAvant);
    expect(nouvelles.length).toBeGreaterThanOrEqual(1);
    expect(nouvelles.map((a) => a.change_origin)).toContain('terrain');
    expect(JSON.stringify(nouvelles.map((a) => a.previous_value))).toContain('notes semées');
  });

  it('statut dans une écriture PLUS ANCIENNE → superseded, ligne intacte, l’entrante archivée (sync_arbitrage) @critique', async () => {
    const m = await semerMonde();
    const tRecent = instant();
    const tAncien = new Date(Date.parse(tRecent) - 300_000).toISOString();
    const recente = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, { status: 'termine', generalNotes: 'notes finales' }),
      tRecent,
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, recente)).toBe('applied');
    const archivesAvant = (await revisionsDe(m.entretienA)).length;
    const ancienne = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, {
        status: 'en_cours',
        generalNotes: 'notes anciennes',
      }),
      tAncien,
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, ancienne)).toBe('superseded');
    expect(
      await lignes('SELECT status, general_notes FROM interviews WHERE id = $1', [m.entretienA]),
    ).toEqual([{ status: 'termine', general_notes: 'notes finales' }]);
    const nouvelles = (await revisionsDe(m.entretienA)).slice(archivesAvant);
    expect(nouvelles.map((a) => a.change_origin)).toEqual(['sync_arbitrage']);
    expect(nouvelles[0]?.previous_value).toMatchObject({
      status: 'en_cours',
      generalNotes: 'notes anciennes',
    });
  });

  it('avancer (en_cours → termine) reste permis ; rester au même statut aussi', async () => {
    const m = await semerMonde();
    const avance = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, { status: 'termine' }),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, avance)).toBe('applied');
    expect(await valeur('SELECT status FROM interviews WHERE id = $1', m.entretienA)).toBe(
      'termine',
    );
    const meme = op(
      'interview',
      m.entretienA,
      chargeEntretien(m.missionId, m.racine, { status: 'termine', generalNotes: 'complément' }),
    );
    expect(await resultatUnique(m.A.jeton, m.missionId, meme)).toBe('applied');
  });
});

describe('L6a · concurrence RÉELLEMENT chevauchante — verrou tenu par le test @critique', () => {
  // Le test tient lui-même un verrou de ligne (`SELECT … FOR UPDATE` dans une
  // transaction ouverte sur une connexion à part), lance les DEUX envois, attend
  // de VOIR dans `pg_stat_activity` que les deux transactions du serveur sont
  // bloquées sur ce verrou, puis le relâche. Les deux lots sont donc en vol en
  // même temps, preuve à l'appui — et non « probablement » comme avec un simple
  // Promise.all. Le pool de l'API compte 10 connexions : deux attentes sont
  // possibles.
  async function attendreBloques(base: Client, nombre: number): Promise<void> {
    const limite = Date.now() + 15_000;
    for (;;) {
      const { rows } = await base.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if ((rows[0]?.n ?? 0) >= nombre) return;
      if (Date.now() > limite) {
        const etat = await base.query(
          `SELECT pid, state, wait_event_type, wait_event, left(query, 120) AS requete
             FROM pg_stat_activity WHERE backend_type = 'client backend'`,
        );
        throw new Error(
          `${JSON.stringify(etat.rows)}\n` +
            `les ${String(nombre)} envois ne se sont jamais bloqués sur le verrou du test : ` +
            'le serveur ne verrouille pas la ligne lue (FOR UPDATE), le chevauchement est invérifiable',
        );
      }
      await new Promise((resoudre) => setTimeout(resoudre, 50));
    }
  }

  it('même réponse, deux appareils, deux lots en vol en même temps → la plus récente gagne, la perdante archivée, une seule ligne @critique', async () => {
    const m = await semerMonde();
    const verrou = await connecter(urlBase);
    try {
      await verrou.query('BEGIN');
      await verrou.query('SELECT id FROM answers WHERE id = $1 FOR UPDATE', [m.reponseA]);

      const tRecent = instant();
      const tAncien = new Date(Date.parse(tRecent) - 60_000).toISOString();
      const recente = op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true), tRecent);
      const ancienne = op(
        'answer',
        m.reponseA,
        chargeReponse(m.entretienA, m.mq1, false, { note: 'appareil lent' }),
        tAncien,
      );
      const envoiAncien = pousser(m.A.jeton, m.missionId, [ancienne], {
        deviceId: 'appareil-lent',
      });
      const envoiRecent = pousser(m.A.jeton, m.missionId, [recente], {
        deviceId: 'appareil-rapide',
      });
      // Sondé depuis une AUTRE connexion que celle du verrou : dans une transaction,
      // PostgreSQL fige pg_stat_activity à son premier accès — la sonde y serait aveugle.
      await attendreBloques(bd(), 2);
      await verrou.query('COMMIT');

      const [r1, r2] = await Promise.all([envoiAncien, envoiRecent]);
      const resultats = [...resultatsDe(r1, [ancienne]), ...resultatsDe(r2, [recente])];
      expect(resultats).not.toContain('error');
      expect(
        await lignes(
          'SELECT id, value, note FROM answers WHERE interview_id = $1 AND mission_question_id = $2',
          [m.entretienA, m.mq1],
        ),
      ).toEqual([{ id: m.reponseA, value: { type: 'yes_no', v: true }, note: null }]);
      const archives = await revisionsDe(m.reponseA);
      expect(archives.map((a) => a.previous_value)).toContainEqual(
        expect.objectContaining({ note: 'appareil lent' }),
      );
      expect(await opsTraitees([ancienne.opId, recente.opId])).toHaveLength(2);
    } finally {
      await verrou.query('ROLLBACK').catch(() => undefined);
      await verrou.end();
    }
  });
});

describe('L6a · arbitrage A01 — une question ad hoc créée ne se retouche pas par le push @critique', () => {
  it('même entityId, contenu différent → forbidden, questions et mission_questions inchangées @critique', async () => {
    const m = await semerMonde();
    const mq = uuidv7();
    const creation = op('question_adhoc', uuidv7(), chargeQuestionAdhoc(mq, 'Version 1 ?', 4));
    expect(await resultatUnique(m.A.jeton, m.missionId, creation)).toBe('applied');
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', creation.entityId, chargeQuestionAdhoc(mq, 'Version 2 ?', 4)),
      'forbidden',
    );
    await exigerRefusSansTrace(
      m.A.jeton,
      m,
      op('question_adhoc', creation.entityId, chargeQuestionAdhoc(mq, 'Version 1 ?', 9)),
      'forbidden',
    );
    expect(await valeur('SELECT text_fr FROM questions WHERE id = $1', creation.entityId)).toBe(
      'Version 1 ?',
    );
  });

  it('recréation identique (nouvel opId) → applied ou duplicate, sans effet', async () => {
    const m = await semerMonde();
    const o = op('question_adhoc', uuidv7(), chargeQuestionAdhoc(uuidv7(), 'Identique ?', 2));
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('applied');
    const avant = await etatMetier(m.missionId);
    expect(['applied', 'duplicate']).toContain(
      await resultatUnique(m.A.jeton, m.missionId, { ...o, opId: uuidv7() }),
    );
    expect(await etatMetier(m.missionId)).toBe(avant);
  });
});

describe('L6a · concurrence — deux lots simultanés @critique', () => {
  it('le MÊME opId dans deux lots simultanés → une seule application ; l’autre error ou duplicate, puis duplicate au rejeu @critique', async () => {
    const m = await semerMonde();
    const o = op('answer', uuidv7(), chargeReponse(m.entretienA, m.mq2, true));
    const [r1, r2] = await Promise.all([
      pousser(m.A.jeton, m.missionId, [o], { deviceId: 'appareil-1' }),
      pousser(m.A.jeton, m.missionId, [o], { deviceId: 'appareil-2' }),
    ]);
    const resultats = [...resultatsDe(r1, [o]), ...resultatsDe(r2, [o])].sort();
    expect(resultats.filter((x) => x === 'applied')).toHaveLength(1);
    expect(['error', 'duplicate']).toContain(resultats.find((x) => x !== 'applied'));
    expect(await valeur('SELECT count(*)::int AS n FROM answers WHERE id = $1', o.entityId)).toBe(
      1,
    );
    expect(await opsTraitees([o.opId])).toHaveLength(1);
    expect(await resultatUnique(m.A.jeton, m.missionId, o)).toBe('duplicate');
  });

  it('la MÊME entité dans deux lots simultanés → la plus récente gagne, la perdante est archivée, aucune seconde ligne @critique', async () => {
    const m = await semerMonde();
    const tRecent = instant();
    const tAncien = new Date(Date.parse(tRecent) - 60_000).toISOString();
    const recente = op('answer', m.reponseA, chargeReponse(m.entretienA, m.mq1, true), tRecent);
    const ancienne = op(
      'answer',
      m.reponseA,
      chargeReponse(m.entretienA, m.mq1, false, { note: 'appareil lent' }),
      tAncien,
    );
    const [r1, r2] = await Promise.all([
      pousser(m.A.jeton, m.missionId, [ancienne], { deviceId: 'appareil-lent' }),
      pousser(m.A.jeton, m.missionId, [recente], { deviceId: 'appareil-rapide' }),
    ]);
    const [resAncienne] = resultatsDe(r1, [ancienne]);
    const [resRecente] = resultatsDe(r2, [recente]);
    // un `error` (conflit de verrou) est admis : l'op est rejouable ; on la rejoue.
    if (resAncienne === 'error') {
      expect(await resultatUnique(m.A.jeton, m.missionId, ancienne)).not.toBe('error');
    }
    if (resRecente === 'error') {
      expect(await resultatUnique(m.A.jeton, m.missionId, recente)).toBe('applied');
    }
    expect(
      await lignes(
        'SELECT value, note FROM answers WHERE interview_id = $1 AND mission_question_id = $2',
        [m.entretienA, m.mq1],
      ),
    ).toEqual([{ value: { type: 'yes_no', v: true }, note: null }]);
    // Quel que soit l'ordre d'arrivée, la version de l'appareil lent existe en archive.
    const archives = await revisionsDe(m.reponseA);
    expect(archives.map((a) => a.previous_value)).toContainEqual(
      expect.objectContaining({ note: 'appareil lent' }),
    );
  });
});
