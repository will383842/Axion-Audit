// =============================================================================
// LOT L6 / INCRÉMENT L6b « LA DESCENTE » — `GET /v1/sync/pull`, ÉPROUVÉ SUR UN
// POSTGRESQL RÉEL : delta par mission (05 §9.5, 11 §4), pagination keyset (11 §3),
// RBAC et étanchéité financière (invariant 3), ligne `sync_log` `pull` (A-3),
// remappage du second UUID absorbé par L6a (DECISIONS [L6a], re-revue A17).
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE FICHIER A ÉTÉ ÉCRIT AVANT LE CODE QU'IL ÉPROUVE (09 §3-2, 09 §5.6).
// ═══════════════════════════════════════════════════════════════════════════════
// Au moment de la rédaction, la route `GET /v1/sync/pull` n'existe pas : chaque
// test est ROUGE parce que la route rend 404. Les attentes viennent de :
//   · 11 §4 — `GET /v1/sync/pull?mission_id=&since=&limit=` → `{server_time,
//     changes: {entity: [...]}, next_since}` ; curseur PAR mission ; premier pull =
//     mission complète ;
//   · 05 §9.5 — curseur = `updated_at` serveur max reçu ; le questionnaire ne bouge
//     sous les doigts du terrain QUE par resynchronisation volontaire (M2.4) ;
//   · 05 §9.9 — les autres membres de la mission consultent en LECTURE (pull) ;
//   · 04 — `scoping_financials` : routes admin EXCLUSIVEMENT ; `sync_log` ;
//   · 11 §3 — erreurs `{error:{code,message}}`, keyset jamais d'offset ;
//   · `packages/shared/src/sync.ts` — `reponsePullSchema`, `ENTITES_DESCENDANTES`
//     (contrat GELÉ, importé tel quel ; L6b ne touche pas `packages/shared`).
//
// ── HYPOTHÈSES D'INTERFACE (le pack est muet — TRACÉES, à confirmer) ─────────
//   P1. Paramètres de requête en camelCase, transcription du 11 §4 comme le fait
//       tout `packages/shared` : `?missionId=<uuid>&since=<ISO UTC>&limit=<n>`.
//       `since` absent = premier pull = mission complète. Aucun autre paramètre
//       n'est envoyé par ce fichier.
//   P2. `since` est EXCLUSIF (`updated_at > since`) et `nextSince` est un
//       horodatage ISO UTC (le schéma partagé l'impose) : il ne peut donc PAS porter
//       de départage par id. Le seul keyset sans perte ni doublon est alors : tri
//       par `updated_at`, et une page ne COUPE JAMAIS un groupe d'horodatage égal
//       (elle peut dépasser `limit` pour le finir). Le test exige le résultat
//       (rien de manqué, rien de doublé), pas le mécanisme.
//   P3. `nextSince` = le curseur à persister : NON NUL dès qu'une page porte au
//       moins un changement (l'`updated_at` max de la page, précision
//       microseconde du serveur) ; `null` = « rien au-delà de `since` », fin du
//       delta. Le terrain persiste le dernier `nextSince` non nul. Sans cela, un
//       delta tenant en une page ne laisserait aucun curseur et le pull suivant
//       redescendrait toute la mission (critère C.2 « curseur stable » violé).
//   P4. RBAC : entrent les rôles globaux `admin` et `consultant` (les seuls
//       auditeurs, symétrie avec la route de push) MEMBRES de la mission, quel que
//       soit leur rôle sur la mission (05 §9.9 : les autres membres lisent par le
//       pull). Non-membre (admin compris) → 403 ou 404 (le 404 de L6a, « on ne
//       révèle pas l'existence d'une mission », est toléré). `lecteur` et
//       `analyste` globaux → 403 (ils ne collectent pas, 03 §34.1).
//   P5. Ligne `sync_log` : une par appel ABOUTI (200), `direction = 'pull'`,
//       `items_count` = nombre d'éléments rendus, `outbox_remaining` NULL — un pull
//       ne connaît pas l'outbox, et un 0 posé là éteindrait À TORT le garde-fou de
//       réinitialisation 05 §9.7 (qui lit la dernière ligne NON NULLE). Aucune
//       ligne pour un appel refusé.
//   P6. `mission_questions` et `work_assignments` n'ont pas d'`updated_at` au 04 :
//       ils descendent au PREMIER pull (sans `since`), et pas dans un delta —
//       05 §9.5 réserve leur rafraîchissement à la resynchronisation volontaire.
//
// Invariant 2 : aucune référence client — libellés neutres, missions fictives.
// Secrets factices (11 §2).
// Traçabilité : E7, E9 · invariants 1, 3 et 7 · 05 §9.5, §9.9 · 11 §3, §4.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ENTITES_DESCENDANTES,
  ERROR_CODES,
  reponsePullSchema,
  type EntiteDescendante,
  type ReponsePull,
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
const SECRET_ACCES = '7d'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '4e'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l6b@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

const ROUTE_PULL = '/v1/sync/pull';
const ROUTE_PUSH = '/v1/sync/push';

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
let blocId = '';

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
  return `10.67.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

function lireErreur(corps: string): { code: string | null; message: string | null } {
  if (corps === '') return { code: null, message: null };
  try {
    const analyse = erreurSchema.safeParse(JSON.parse(corps));
    if (analyse.success) {
      return { code: analyse.data.error.code, message: analyse.data.error.message };
    }
  } catch {
    // corps non JSON : laissé tel quel dans `corps`, le verdict le dira.
  }
  return { code: null, message: null };
}

interface ParametresPull {
  readonly missionId?: string;
  readonly since?: string;
  readonly limit?: string;
}

async function tirerBrut(
  parametres: ParametresPull,
  options: { readonly jeton?: string; readonly autorisation?: string } = {},
): Promise<ReponseHttp> {
  const autorisation =
    options.autorisation ?? (options.jeton === undefined ? undefined : `Bearer ${options.jeton}`);
  const requete = new URLSearchParams();
  if (parametres.missionId !== undefined) requete.set('missionId', parametres.missionId);
  if (parametres.since !== undefined) requete.set('since', parametres.since);
  if (parametres.limit !== undefined) requete.set('limit', parametres.limit);
  const chaine = requete.toString();
  const reponse = await api().inject({
    method: 'GET',
    url: chaine === '' ? ROUTE_PULL : `${ROUTE_PULL}?${chaine}`,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(autorisation === undefined ? {} : { authorization: autorisation }),
    },
  });
  return { statut: reponse.statusCode, corps: reponse.body, ...lireErreur(reponse.body) };
}

/** Une page de pull ABOUTIE, validée par LE schéma partagé. */
async function tirer(
  jeton: string,
  missionId: string,
  options: { readonly since?: string; readonly limit?: number } = {},
): Promise<ReponsePull> {
  const r = await tirerBrut(
    {
      missionId,
      ...(options.since === undefined ? {} : { since: options.since }),
      ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
    },
    { jeton },
  );
  expect(r.statut, `pull attendu 200, reçu ${String(r.statut)} :\n${r.corps.slice(0, 600)}`).toBe(
    200,
  );
  const analyse = reponsePullSchema.safeParse(JSON.parse(r.corps));
  expect(
    analyse.success,
    `réponse hors contrat reponsePullSchema : ${analyse.success ? '' : analyse.error.message}`,
  ).toBe(true);
  if (!analyse.success) throw new Error('réponse hors contrat');
  return analyse.data;
}

// -----------------------------------------------------------------------------
// LECTURE DES CHANGEMENTS
// -----------------------------------------------------------------------------
const elementSchema = z.looseObject({ id: z.uuid() });

/** Les ids d'une entité dans une page ; chaque élément DOIT porter un `id` UUID. */
function idsDe(page: ReponsePull, entite: EntiteDescendante): string[] {
  const elements = page.changes[entite] ?? [];
  return elements.map((e) => {
    const analyse = elementSchema.safeParse(e);
    expect(analyse.success, `élément « ${entite} » sans id UUID : ${JSON.stringify(e)}`).toBe(true);
    return analyse.success ? analyse.data.id : '';
  });
}

function elementsDe(page: ReponsePull, entite: EntiteDescendante): Record<string, unknown>[] {
  return (page.changes[entite] ?? []).map((e) => elementSchema.parse(e));
}

function tailleDePage(page: ReponsePull): number {
  return ENTITES_DESCENDANTES.reduce((n, e) => n + (page.changes[e]?.length ?? 0), 0);
}

/**
 * Microsecondes depuis l'époque, EXACTES : `Date.parse` tronque à la milliseconde,
 * or un `updated_at` posé par `now()` porte des microsecondes.
 */
function microsecondes(iso: string): bigint {
  const m = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(iso);
  if (m === null) throw new Error(`horodatage non ISO UTC : « ${iso} »`);
  const secondes = BigInt(Date.parse(`${m[1] ?? ''}Z`)) * 1000n;
  const fraction = (m[2] ?? '').padEnd(6, '0').slice(0, 6);
  const reste = (m[2] ?? '').slice(6);
  if (/[1-9]/.test(reste)) throw new Error(`précision sub-microseconde inattendue : « ${iso} »`);
  return secondes + BigInt(fraction);
}

interface Descente {
  /** Toutes les pages, dans l'ordre. */
  readonly pages: readonly ReponsePull[];
  /** Ids reçus par entité, DOUBLONS COMPRIS — c'est ce qui permet de les compter. */
  readonly recus: ReadonlyMap<EntiteDescendante, readonly string[]>;
  /** Le curseur que le terrain persisterait (P3) : dernier `nextSince` non nul. */
  readonly curseur: string | undefined;
}

/**
 * Le terrain qui descend une mission jusqu'au bout : il suit `nextSince` tant
 * qu'il n'est pas nul. Bornée à 200 pages : une route qui ne termine pas est un
 * verdict, pas une boucle infinie.
 */
async function descendre(
  jeton: string,
  missionId: string,
  options: { readonly since?: string; readonly limit?: number } = {},
  entrePages?: (indice: number) => Promise<void>,
): Promise<Descente> {
  const pages: ReponsePull[] = [];
  const recus = new Map<EntiteDescendante, string[]>();
  let curseur = options.since;
  for (let indice = 0; indice < 200; indice += 1) {
    const page = await tirer(jeton, missionId, {
      ...(curseur === undefined ? {} : { since: curseur }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    });
    pages.push(page);
    for (const entite of ENTITES_DESCENDANTES) {
      const liste = recus.get(entite) ?? [];
      liste.push(...idsDe(page, entite));
      recus.set(entite, liste);
    }
    // P3 : une page non vide porte un curseur ; une page vide termine.
    if (tailleDePage(page) > 0) {
      expect(page.nextSince, 'page non vide sans curseur `nextSince` (P3)').not.toBeNull();
    } else {
      expect(page.nextSince, 'page vide : `nextSince` doit être null (fin du delta)').toBeNull();
    }
    if (page.nextSince === null) return { pages, recus, curseur };
    if (curseur !== undefined) {
      expect(
        microsecondes(page.nextSince) > microsecondes(curseur),
        `le curseur doit AVANCER : ${curseur} → ${page.nextSince}`,
      ).toBe(true);
    }
    curseur = page.nextSince;
    if (entrePages !== undefined) await entrePages(indice);
  }
  throw new Error('la descente ne termine pas en 200 pages');
}

function tousLesIds(d: Descente): string[] {
  return ENTITES_DESCENDANTES.flatMap((e) => [...(d.recus.get(e) ?? [])]);
}

function doublons(ids: readonly string[]): string[] {
  const vus = new Set<string>();
  const doubles: string[] = [];
  for (const id of ids) {
    if (vus.has(id)) doubles.push(id);
    vus.add(id);
  }
  return doubles;
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
      `Compte L6b ${String(compteurCompte)}`,
      `compte.l6b.${String(compteurCompte)}@exemple.test`,
      role,
    ],
  );
  return { id, jeton: api().jwt.sign({ sub: id }) };
}

let compteurMission = 0;
async function semerMission(): Promise<{
  readonly missionId: string;
  readonly entreprise: string;
}> {
  compteurMission += 1;
  const entreprise = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    entreprise,
    `Entreprise fictive L6b ${String(compteurMission)}`,
  ]);
  const missionId = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', now(), now())`,
    [missionId, entreprise, `Mission fictive L6b ${String(compteurMission)}`],
  );
  return { missionId, entreprise };
}

async function rattacher(missionId: string, userId: string, role: RoleSurMission): Promise<void> {
  await bd().query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, role],
  );
}

async function semerUnite(missionId: string, parentId: string | null = null): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, in_scope, status,
                            created_at, updated_at)
     VALUES ($1, $2, $3, 'service', $4, true, 'active', now(), now())`,
    [id, missionId, parentId, `Unite fictive ${id.slice(-6)}`],
  );
  return id;
}

async function semerQuestionDeMission(missionId: string): Promise<string> {
  const questionId = uuidv7();
  await bd().query(
    `INSERT INTO questions (id, block_id, version, status, text_fr, answer_type, origin,
                            created_at, updated_at)
     VALUES ($1, $2, 1, 'active', $3, 'yes_no', 'banque', now(), now())`,
    [questionId, blocId, `Question fictive ${questionId.slice(-6)}`],
  );
  const missionQuestionId = uuidv7();
  await bd().query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                    answer_type_snapshot, position, added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, 'yes_no', 1, false)`,
    [missionQuestionId, missionId, questionId, `Question fictive ${questionId.slice(-6)}`],
  );
  return missionQuestionId;
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

async function semerNote(
  missionId: string,
  creePar: string,
  interviewId: string | null,
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO attachments (id, interview_id, answer_id, mission_id, kind, content, created_by,
                              client_created_at, client_updated_at, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, 'note', 'note semée', $4, $5, $5, now(), now())`,
    [id, interviewId, missionId, creePar, T_SEMIS],
  );
  return id;
}

async function semerAffectation(
  missionId: string,
  userId: string,
  orgUnitId: string,
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO work_assignments (id, mission_id, user_id, org_unit_id, planned_interviews, planned_days)
     VALUES ($1, $2, $3, $4, 2, 1.5)`,
    [id, missionId, userId, orgUnitId],
  );
  return id;
}

/** Valeurs SENTINELLES improbables : leur présence dans un corps est une fuite. */
const SENTINELLES_FINANCIERES = ['918273.645', '7364519.28', 'SENTINELLE-FIN-L6B'] as const;

async function semerChiffrage(missionId: string, entreprise: string, admin: string): Promise<void> {
  const estimation = uuidv7();
  await bd().query(
    `INSERT INTO scoping_estimates (id, company_id, mission_id, status, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'signe', $4, now(), now())`,
    [estimation, entreprise, missionId, admin],
  );
  await bd().query(
    `INSERT INTO scoping_financials (scoping_estimate_id, daily_rates, travel_costs, total_amount,
                                     currency, updated_by, updated_at)
     VALUES ($1, $2::jsonb, 918273.645, 7364519.28, 'EUR', $3, now())`,
    [estimation, JSON.stringify({ libelle: 'SENTINELLE-FIN-L6B', taux: 918273.645 }), admin],
  );
}

/**
 * LE MONDE D'UNE ÉPREUVE — frais à chaque test.
 *   A  : consultant, membre `consultant`, propriétaire de `entretienA` ;
 *   B  : consultant, membre `consultant`, propriétaire de `entretienB` ;
 *   LD : consultant, membre `lead` ;
 *   LM : consultant, membre `lecteur` sur la mission (lit par le pull, 05 §9.9) ;
 *   ADM: admin, membre `lead` ;
 *   AD : admin NON membre ;
 *   X  : consultant NON membre ;
 *   L  : rôle global `lecteur`, membre `lecteur` ;
 *   AN : rôle global `analyste`, membre `analyste`.
 */
interface Monde {
  readonly missionId: string;
  readonly entreprise: string;
  readonly A: Compte;
  readonly B: Compte;
  readonly LD: Compte;
  readonly LM: Compte;
  readonly ADM: Compte;
  readonly AD: Compte;
  readonly X: Compte;
  readonly L: Compte;
  readonly AN: Compte;
  readonly racine: string;
  readonly unite: string;
  readonly mq1: string;
  readonly mq2: string;
  readonly entretienA: string;
  readonly entretienB: string;
  readonly reponseA: string;
  readonly reponseB: string;
  readonly noteA: string;
  readonly noteVolanteA: string;
  readonly affectationA: string;
}

async function semerMonde(): Promise<Monde> {
  const { missionId, entreprise } = await semerMission();
  const A = await creerCompte('consultant');
  const B = await creerCompte('consultant');
  const LD = await creerCompte('consultant');
  const LM = await creerCompte('consultant');
  const ADM = await creerCompte('admin');
  const AD = await creerCompte('admin');
  const X = await creerCompte('consultant');
  const L = await creerCompte('lecteur');
  const AN = await creerCompte('analyste');
  await rattacher(missionId, A.id, 'consultant');
  await rattacher(missionId, B.id, 'consultant');
  await rattacher(missionId, LD.id, 'lead');
  await rattacher(missionId, LM.id, 'lecteur');
  await rattacher(missionId, ADM.id, 'lead');
  await rattacher(missionId, L.id, 'lecteur');
  await rattacher(missionId, AN.id, 'analyste');
  const racine = await semerUnite(missionId);
  const unite = await semerUnite(missionId, racine);
  const mq1 = await semerQuestionDeMission(missionId);
  const mq2 = await semerQuestionDeMission(missionId);
  const entretienA = await semerEntretien(missionId, unite, A.id);
  const entretienB = await semerEntretien(missionId, unite, B.id);
  const reponseA = await semerReponse(entretienA, mq1);
  const reponseB = await semerReponse(entretienB, mq1);
  const noteA = await semerNote(missionId, A.id, entretienA);
  const noteVolanteA = await semerNote(missionId, A.id, null);
  const affectationA = await semerAffectation(missionId, A.id, unite);
  await semerChiffrage(missionId, entreprise, ADM.id);
  return {
    missionId,
    entreprise,
    A,
    B,
    LD,
    LM,
    ADM,
    AD,
    X,
    L,
    AN,
    racine,
    unite,
    mq1,
    mq2,
    entretienA,
    entretienB,
    reponseA,
    reponseB,
    noteA,
    noteVolanteA,
    affectationA,
  };
}

type Ligne = Record<string, unknown>;

async function lignes(sql: string, parametres: readonly unknown[]): Promise<Ligne[]> {
  const resultat = await bd().query<Ligne>(sql, [...parametres]);
  return resultat.rows;
}

async function journalPull(userId: string): Promise<Ligne[]> {
  return lignes(
    `SELECT * FROM sync_log WHERE user_id = $1 AND direction = 'pull'
      ORDER BY started_at, ended_at, id`,
    [userId],
  );
}

/** L'horloge de la BASE, au microseconde — la seule qui pose les `updated_at`. */
async function horlogeBase(): Promise<string> {
  const [ligne] = await lignes(
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t`,
    [],
  );
  return String(ligne?.t);
}

/** Pose un `updated_at` précis (fabrication d'ÉTAT : simule une écriture siège). */
async function horodater(table: string, ids: readonly string[], instant: string): Promise<void> {
  await bd().query(`UPDATE ${table} SET updated_at = $2::timestamptz WHERE id = ANY($1::uuid[])`, [
    [...ids],
    instant,
  ]);
}

function decaler(instant: string, microsecondesEnPlus: number): string {
  const total = microsecondes(instant) + BigInt(microsecondesEnPlus);
  const ms = Number(total / 1000n);
  const us = Number(total % 1000n);
  return new Date(ms).toISOString().replace('Z', `${String(us).padStart(3, '0')}Z`);
}

/**
 * GARDE ANTI-FAUX-VERT. Un refus toléré en 403/404 (P4) serait VERT contre une
 * route ABSENTE (404). Chaque test de refus prouve d'abord que la route vit.
 */
async function exigerRouteVivante(m: Monde): Promise<void> {
  const r = await tirerBrut({ missionId: m.missionId }, { jeton: m.A.jeton });
  expect(
    r.statut,
    `la route de pull ne vit pas (reçu ${String(r.statut)}) : un refus ne prouverait rien`,
  ).toBe(200);
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);
  const base = await creerBaseEphemere('l6b_pull');
  nomBase = base.nom;
  await appliquerMontee(base.url);
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);
  client = await connecter(base.url);

  const [bloc] = (await bd().query<{ id: string }>('SELECT id FROM blocks ORDER BY id LIMIT 1'))
    .rows;
  if (bloc === undefined) throw new Error('le seed L1 ne porte aucun bloc (`blocks`)');
  blocId = bloc.id;

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
// 1. AUTHENTIFICATION ET RBAC — matrice exhaustive de la route
// =============================================================================
describe('L6b · GET /v1/sync/pull — authentification et RBAC (invariant 3) @critique', () => {
  it('sans jeton → 401 UNAUTHENTICATED au format 11 §3 @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m);
    const r = await tirerBrut({ missionId: m.missionId });
    expect(r.statut).toBe(401);
    expect(r.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(r.message).toBeTruthy();
  });

  it('jeton illisible → 401 UNAUTHENTICATED @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m);
    const r = await tirerBrut(
      { missionId: m.missionId },
      { autorisation: 'Bearer jeton.factice.illisible' },
    );
    expect(r.statut).toBe(401);
    expect(r.code).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  const AUTORISES: readonly ('A' | 'B' | 'LD' | 'LM' | 'ADM')[] = ['A', 'B', 'LD', 'LM', 'ADM'];
  for (const qui of AUTORISES) {
    it(`membre autorisé « ${qui} » → 200, réponse conforme à reponsePullSchema, une ligne sync_log pull @critique`, async () => {
      const m = await semerMonde();
      const compte = m[qui];
      const avant = await journalPull(compte.id);
      const page = await tirer(compte.jeton, m.missionId);
      expect(tailleDePage(page)).toBeGreaterThan(0);
      expect(await journalPull(compte.id)).toHaveLength(avant.length + 1);
    });
  }

  const REFUSES: readonly {
    readonly qui: 'AD' | 'X' | 'L' | 'AN';
    readonly codes: readonly number[];
  }[] = [
    { qui: 'AD', codes: [403, 404] },
    { qui: 'X', codes: [403, 404] },
    { qui: 'L', codes: [403] },
    { qui: 'AN', codes: [403] },
  ];
  for (const { qui, codes } of REFUSES) {
    it(`« ${qui} » (non habilité au pull de cette mission) → ${codes.join('/')}, aucune donnée, aucune ligne sync_log @critique`, async () => {
      const m = await semerMonde();
      await exigerRouteVivante(m);
      const compte = m[qui];
      const r = await tirerBrut({ missionId: m.missionId }, { jeton: compte.jeton });
      expect(codes).toContain(r.statut);
      expect(r.code).toBe(r.statut === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.FORBIDDEN);
      expect(r.message).toBeTruthy();
      for (const id of [m.entretienA, m.reponseA, m.noteA, m.racine, m.mq1]) {
        expect(r.corps).not.toContain(id);
      }
      expect(await journalPull(compte.id)).toHaveLength(0);
    });
  }

  it('mission inconnue → 403 ou 404 au format 11 §3, aucune ligne sync_log @critique', async () => {
    const m = await semerMonde();
    await exigerRouteVivante(m);
    const avant = await journalPull(m.A.id);
    const r = await tirerBrut({ missionId: uuidv7() }, { jeton: m.A.jeton });
    expect([403, 404]).toContain(r.statut);
    expect([ERROR_CODES.FORBIDDEN, ERROR_CODES.NOT_FOUND]).toContain(r.code);
    expect(await journalPull(m.A.id)).toHaveLength(avant.length);
  });
});

// =============================================================================
// 2. VALIDATION DES PARAMÈTRES — 400 au format 11 §3
// =============================================================================
describe('L6b · GET /v1/sync/pull — paramètres invalides (11 §3)', () => {
  const CAS: readonly {
    readonly nom: string;
    readonly parametres: (m: Monde) => ParametresPull;
    readonly codes: readonly string[];
  }[] = [
    { nom: 'missionId absent', parametres: () => ({}), codes: [ERROR_CODES.VALIDATION_FAILED] },
    {
      nom: 'missionId non UUID',
      parametres: () => ({ missionId: 'pas-un-uuid' }),
      codes: [ERROR_CODES.VALIDATION_FAILED],
    },
    {
      nom: 'since illisible',
      parametres: (m) => ({ missionId: m.missionId, since: 'hier soir' }),
      codes: [ERROR_CODES.VALIDATION_FAILED, ERROR_CODES.INVALID_CURSOR],
    },
    {
      nom: 'since avec décalage horaire (UTC exigé)',
      parametres: (m) => ({ missionId: m.missionId, since: '2026-10-01T10:00:00+02:00' }),
      codes: [ERROR_CODES.VALIDATION_FAILED, ERROR_CODES.INVALID_CURSOR],
    },
    {
      nom: 'limit nul',
      parametres: (m) => ({ missionId: m.missionId, limit: '0' }),
      codes: [ERROR_CODES.VALIDATION_FAILED],
    },
    {
      nom: 'limit négatif',
      parametres: (m) => ({ missionId: m.missionId, limit: '-5' }),
      codes: [ERROR_CODES.VALIDATION_FAILED],
    },
    {
      nom: 'limit non numérique',
      parametres: (m) => ({ missionId: m.missionId, limit: 'beaucoup' }),
      codes: [ERROR_CODES.VALIDATION_FAILED],
    },
  ];
  for (const cas of CAS) {
    it(`${cas.nom} → 400 ${cas.codes.join(' ou ')}, aucune ligne sync_log`, async () => {
      const m = await semerMonde();
      await exigerRouteVivante(m);
      const avant = await journalPull(m.A.id);
      const r = await tirerBrut(cas.parametres(m), { jeton: m.A.jeton });
      expect(r.statut, r.corps.slice(0, 400)).toBe(400);
      expect(cas.codes).toContain(r.code);
      expect(r.message).toBeTruthy();
      expect(await journalPull(m.A.id)).toHaveLength(avant.length);
    });
  }
});

// =============================================================================
// 3. PREMIER PULL = MISSION COMPLÈTE, ET RIEN QU'ELLE
// =============================================================================
describe('L6b · GET /v1/sync/pull — premier pull (11 §4)', () => {
  it('sans `since` : la mission complète descend, sans doublon (P6) @critique', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    const attendu: Readonly<Record<EntiteDescendante, readonly string[]>> = {
      mission: [m.missionId],
      mission_question: [m.mq1, m.mq2],
      org_unit: [m.racine, m.unite],
      work_assignment: [m.affectationA],
      // 05 §9.9 : les autres membres LISENT — la session de B descend chez A.
      interview: [m.entretienA, m.entretienB],
      answer: [m.reponseA, m.reponseB],
      attachment_meta: [m.noteA, m.noteVolanteA],
    };
    for (const entite of ENTITES_DESCENDANTES) {
      expect([...(d.recus.get(entite) ?? [])].sort(), `entité ${entite}`).toEqual(
        [...attendu[entite]].sort(),
      );
    }
    expect(doublons(tousLesIds(d))).toEqual([]);
  });

  it('serverTime = heure serveur UTC ISO (source de l’offset d’horloge, scénario 4)', async () => {
    const m = await semerMonde();
    const avant = Date.now();
    const page = await tirer(m.A.jeton, m.missionId);
    const apres = Date.now();
    expect(page.serverTime.endsWith('Z')).toBe(true);
    const t = Date.parse(page.serverTime);
    expect(Number.isNaN(t)).toBe(false);
    // Tolérance d'une minute : base et API sur la même machine de test.
    expect(t).toBeGreaterThanOrEqual(avant - 60_000);
    expect(t).toBeLessThanOrEqual(apres + 60_000);
  });

  it('aucune donnée d’une AUTRE mission ne descend, même si l’émetteur en est membre @critique', async () => {
    const m = await semerMonde();
    const autre = await semerMission();
    await rattacher(autre.missionId, m.A.id, 'consultant');
    const racineAutre = await semerUnite(autre.missionId);
    const mqAutre = await semerQuestionDeMission(autre.missionId);
    const entretienAutre = await semerEntretien(autre.missionId, racineAutre, m.A.id);
    const reponseAutre = await semerReponse(entretienAutre, mqAutre);
    const noteAutre = await semerNote(autre.missionId, m.A.id, entretienAutre);
    const affectationAutre = await semerAffectation(autre.missionId, m.A.id, racineAutre);
    const etrangers = [
      autre.missionId,
      racineAutre,
      mqAutre,
      entretienAutre,
      reponseAutre,
      noteAutre,
      affectationAutre,
    ];
    for (const since of [undefined, '2000-01-01T00:00:00.000Z']) {
      const d = await descendre(m.A.jeton, m.missionId, since === undefined ? {} : { since });
      const recus = tousLesIds(d);
      for (const id of etrangers) expect(recus).not.toContain(id);
      for (const page of d.pages) {
        for (const id of etrangers) expect(JSON.stringify(page)).not.toContain(id);
      }
    }
  });
});

// =============================================================================
// 4. ÉTANCHÉITÉ FINANCIÈRE — `scoping_financials` ne descend JAMAIS
// =============================================================================
describe('L6b · GET /v1/sync/pull — étanchéité financière (04, E21) @critique', () => {
  for (const qui of ['A', 'LD', 'ADM'] as const) {
    it(`aucune valeur de scoping_financials dans le pull de « ${qui} », admin membre compris @critique`, async () => {
      const m = await semerMonde();
      const premier = await tirerBrut({ missionId: m.missionId }, { jeton: m[qui].jeton });
      expect(premier.statut, premier.corps.slice(0, 300)).toBe(200);
      const d = await descendre(m[qui].jeton, m.missionId);
      const corps = [premier.corps, ...d.pages.map((p) => JSON.stringify(p))];
      for (const texte of corps) {
        for (const sentinelle of SENTINELLES_FINANCIERES) expect(texte).not.toContain(sentinelle);
        expect(texte).not.toMatch(
          /daily_rates|dailyRates|total_amount|totalAmount|travel_costs|travelCosts/,
        );
      }
      // Les seules clés admises sont celles du contrat (le schéma l'impose aussi).
      for (const page of d.pages) {
        for (const cle of Object.keys(page.changes)) expect(ENTITES_DESCENDANTES).toContain(cle);
      }
    });
  }
});

// =============================================================================
// 5. DELTA, CURSEUR, PAGINATION KEYSET
// =============================================================================
describe('L6b · GET /v1/sync/pull — delta et curseur (05 §9.5, 11 §3) @critique', () => {
  it('deux pulls consécutifs sans changement serveur → zéro changement, curseur stable (critère C.2) @critique', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    expect(d.curseur, 'le premier pull doit laisser un curseur à persister (P3)').toBeDefined();
    const curseur = d.curseur ?? '';
    for (let fois = 0; fois < 2; fois += 1) {
      const page = await tirer(m.A.jeton, m.missionId, { since: curseur });
      expect(tailleDePage(page), JSON.stringify(page.changes).slice(0, 400)).toBe(0);
      expect(page.nextSince).toBeNull();
    }
  });

  it('une écriture siège postérieure au curseur descend SEULE au pull suivant @critique', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    const curseur = d.curseur ?? '';
    await bd().query(
      `UPDATE answers SET value = $2::jsonb, updated_at = clock_timestamp() WHERE id = $1`,
      [m.reponseB, JSON.stringify({ type: 'yes_no', v: true })],
    );
    const delta = await descendre(m.A.jeton, m.missionId, { since: curseur });
    expect(tousLesIds(delta)).toEqual([m.reponseB]);
    const [element] = delta.pages.flatMap((p) => elementsDe(p, 'answer'));
    expect(element?.value).toEqual({ type: 'yes_no', v: true });
    // Et le curseur avancé est stable à son tour.
    const apres = await tirer(m.A.jeton, m.missionId, { since: delta.curseur ?? '' });
    expect(tailleDePage(apres)).toBe(0);
    expect(apres.nextSince).toBeNull();
  });

  it('pagination keyset : horodatages distincts, pages ≤ limit, rien de manqué ni de doublé, même avec une écriture entre deux pages @critique', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    const curseur = d.curseur ?? '';
    const t0 = await horlogeBase();
    const notes: string[] = [];
    for (let i = 0; i < 10; i += 1) notes.push(await semerNote(m.missionId, m.A.id, null));
    const unites: string[] = [];
    for (let i = 0; i < 3; i += 1) unites.push(await semerUnite(m.missionId, m.racine));
    // Horodatages DISTINCTS et entrelacés entre entités.
    const tous = [...notes, ...unites];
    for (let i = 0; i < tous.length; i += 1) {
      const id = tous[i] ?? '';
      await horodater(
        i < notes.length ? 'attachments' : 'org_units',
        [id],
        decaler(t0, 1000 * (i + 1)),
      );
    }
    let tardive = '';
    const delta = await descendre(
      m.A.jeton,
      m.missionId,
      { since: curseur, limit: 3 },
      async (indice) => {
        if (indice === 0) {
          tardive = await semerNote(m.missionId, m.A.id, null);
          await horodater('attachments', [tardive], decaler(t0, 1000 * 100));
        }
      },
    );
    for (const page of delta.pages) expect(tailleDePage(page)).toBeLessThanOrEqual(3);
    expect(delta.pages.length).toBeGreaterThanOrEqual(5);
    const recus = tousLesIds(delta);
    expect(doublons(recus)).toEqual([]);
    expect([...recus].sort()).toEqual([...tous, tardive].sort());
  });

  it('pagination keyset : un groupe d’horodatage ÉGAL, plus large que limit et réparti sur plusieurs entités, descend sans perte ni doublon (P2) @critique', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    const curseur = d.curseur ?? '';
    const t = decaler(await horlogeBase(), 1000);
    const notes: string[] = [];
    for (let i = 0; i < 4; i += 1) notes.push(await semerNote(m.missionId, m.A.id, null));
    const unites: string[] = [];
    for (let i = 0; i < 4; i += 1) unites.push(await semerUnite(m.missionId, m.racine));
    await horodater('attachments', notes, t);
    await horodater('org_units', unites, t);
    await horodater('answers', [m.reponseA, m.reponseB], t);
    // Et deux lignes APRÈS le groupe : elles ne doivent pas être sautées non plus.
    const apres = [
      await semerNote(m.missionId, m.A.id, null),
      await semerNote(m.missionId, m.A.id, null),
    ];
    await horodater('attachments', [apres[0] ?? ''], decaler(t, 1));
    await horodater('attachments', [apres[1] ?? ''], decaler(t, 2));
    const delta = await descendre(m.A.jeton, m.missionId, { since: curseur, limit: 3 });
    const recus = tousLesIds(delta);
    expect(doublons(recus)).toEqual([]);
    expect([...recus].sort()).toEqual(
      [...notes, ...unites, m.reponseA, m.reponseB, ...apres].sort(),
    );
    // Puis plus rien.
    const fin = await tirer(m.A.jeton, m.missionId, { since: delta.curseur ?? '' });
    expect(tailleDePage(fin)).toBe(0);
  });

  it('le questionnaire figé ne redescend pas dans un delta (05 §9.5, P6)', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    const delta = await descendre(m.A.jeton, m.missionId, { since: d.curseur ?? '' });
    expect(delta.recus.get('mission_question') ?? []).toEqual([]);
    expect(delta.recus.get('work_assignment') ?? []).toEqual([]);
  });
});

// =============================================================================
// 6. LE SECOND UUID ABSORBÉ PAR L6a REDESCEND SOUS L'UUID SERVEUR
// =============================================================================
describe('L6b · GET /v1/sync/pull — remappage du second UUID (DECISIONS [L6a], re-revue A17) @critique', () => {
  it('une réponse poussée sous un second UUID, absorbée par la ligne existante, redescend sous l’UUID serveur et jamais sous le sien @critique', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    const curseur = d.curseur ?? '';
    const secondUuid = uuidv7();
    const push = await api().inject({
      method: 'POST',
      url: ROUTE_PUSH,
      headers: {
        'x-forwarded-for': ipUnique(),
        'content-type': 'application/json',
        authorization: `Bearer ${m.A.jeton}`,
      },
      payload: JSON.stringify({
        missionId: m.missionId,
        deviceId: 'appareil-fictif-l6b',
        outboxRemaining: 0,
        operations: [
          {
            opId: uuidv7(),
            entity: 'answer',
            entityId: secondUuid,
            action: 'upsert',
            clientUpdatedAt: '2026-10-05T09:00:00.000Z',
            payload: {
              interviewId: m.entretienA,
              missionQuestionId: m.mq1,
              value: { type: 'yes_no', v: true },
              source: 'entretien',
              withheld: false,
              horsParcours: false,
              flagReview: false,
              notApplicable: false,
              note: null,
              clientCreatedAt: '2026-10-05T09:00:00.000Z',
            },
          },
        ],
      }),
    });
    expect(push.statusCode, push.body.slice(0, 400)).toBe(200);
    // Précondition L6a : absorbé, aucune seconde ligne.
    expect(
      await lignes('SELECT id FROM answers WHERE interview_id = $1 AND mission_question_id = $2', [
        m.entretienA,
        m.mq1,
      ]),
    ).toEqual([{ id: m.reponseA }]);

    const delta = await descendre(m.A.jeton, m.missionId, { since: curseur });
    expect(delta.recus.get('answer') ?? []).toContain(m.reponseA);
    const element = delta.pages
      .flatMap((p) => elementsDe(p, 'answer'))
      .find((e) => e.id === m.reponseA);
    expect(element?.value).toEqual({ type: 'yes_no', v: true });
    for (const page of delta.pages) expect(JSON.stringify(page)).not.toContain(secondUuid);
    const complet = await descendre(m.A.jeton, m.missionId);
    for (const page of complet.pages) expect(JSON.stringify(page)).not.toContain(secondUuid);

    // Curseur stable APRÈS une écriture applicative (précision microseconde de `now()`).
    const stable = await tirer(m.A.jeton, m.missionId, { since: delta.curseur ?? '' });
    expect(tailleDePage(stable)).toBe(0);
    expect(stable.nextSince).toBeNull();
  });
});

// =============================================================================
// 7. sync_log — une ligne `pull` écrite par le CHEMIN APPLICATIF (A-3, C.2)
// =============================================================================
describe('L6b · GET /v1/sync/pull — sync_log direction pull (A-3) @critique', () => {
  it('chaque pull abouti écrit UNE ligne pull : items_count exact, outbox_remaining NULL (garde-fou 05 §9.7 intact) @critique', async () => {
    const m = await semerMonde();
    const avant = await journalPull(m.A.id);
    const page = await tirer(m.A.jeton, m.missionId);
    const apres = await journalPull(m.A.id);
    expect(apres).toHaveLength(avant.length + 1);
    const ligne = apres[apres.length - 1];
    expect(ligne?.direction).toBe('pull');
    expect(ligne?.user_id).toBe(m.A.id);
    expect(ligne?.items_count).toBe(tailleDePage(page));
    expect(ligne?.outbox_remaining).toBeNull();
    expect(ligne?.started_at).toBeInstanceOf(Date);
    expect(ligne?.ended_at).toBeInstanceOf(Date);
    const debut = ligne?.started_at;
    const fin = ligne?.ended_at;
    if (debut instanceof Date && fin instanceof Date) {
      expect(fin.getTime()).toBeGreaterThanOrEqual(debut.getTime());
    }
    // Aucune ligne `push` n'a été inventée par le pull.
    expect(
      await lignes(`SELECT 1 FROM sync_log WHERE user_id = $1 AND direction = 'push'`, [m.A.id]),
    ).toHaveLength(0);
  });

  it('un pull vide écrit aussi sa ligne, avec items_count = 0', async () => {
    const m = await semerMonde();
    const d = await descendre(m.A.jeton, m.missionId);
    const avant = await journalPull(m.A.id);
    await tirer(m.A.jeton, m.missionId, { since: d.curseur ?? '' });
    const apres = await journalPull(m.A.id);
    expect(apres).toHaveLength(avant.length + 1);
    expect(apres[apres.length - 1]?.items_count).toBe(0);
  });
});
