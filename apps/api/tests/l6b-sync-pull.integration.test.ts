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
//   P1. Paramètres de requête NOMMÉS COMME AU 11 §4, en toutes lettres (correction de
//       la coordination) : `?mission_id=<uuid>&since=<ISO UTC>&limit=<n>`.
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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ENTITES_DESCENDANTES,
  ERROR_CODES,
  reponsePullSchema,
  reponsePushSchema,
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
let urlBase = '';
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
  if (parametres.missionId !== undefined) requete.set('mission_id', parametres.missionId);
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

/** Données personnelles FICTIVES, reconnaissables : leur présence dans un corps se mesure. */
function nomInterlocuteur(entretienId: string): string {
  return `Interlocuteur fictif ${entretienId.slice(-8)}`;
}

function courrielInterlocuteur(entretienId: string): string {
  return `interlocuteur.${entretienId.slice(-8)}@exemple.test`;
}

/** Clé MinIO SENTINELLE : MinIO n'est jamais exposé, sa clé ne descend jamais. */
function cleDeStockage(pieceId: string): string {
  return `missions/sentinelle-cle-stockage-${pieceId.slice(-8)}`;
}

async function semerEntretien(
  missionId: string,
  orgUnitId: string,
  conduitPar: string,
): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO interviews (id, mission_id, conducted_by, kind, mode, org_unit_id, schedule_status,
                             status, general_notes, person_name, person_email, client_created_at,
                             client_updated_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'entretien', 'sur_site', $4, 'realise', 'en_cours', 'notes semées',
             $6, $7, $5, $5, now(), now())`,
    [
      id,
      missionId,
      conduitPar,
      orgUnitId,
      T_SEMIS,
      nomInterlocuteur(id),
      courrielInterlocuteur(id),
    ],
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
                              client_created_at, client_updated_at, created_at, updated_at, storage_key)
     VALUES ($1, $2, NULL, $3, 'note', 'note semée', $4, $5, $5, now(), now(), $6)`,
    [id, interviewId, missionId, creePar, T_SEMIS, cleDeStockage(id)],
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
  urlBase = base.url;
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
// DÉLAIS DE SYNC INJECTABLES — revue A17 (corrections décidées le 2026-10-09)
// =============================================================================
// Forme attendue de l'auteur, exportée par `apps/api/src/sync/service.ts`, sans
// toucher au schéma :
//   export const DELAIS_SYNC_DEFAUT = { margePullMs: 60_000, dureeMaxPushMs: 30_000 };
//   export function reglerDelaisSync(delais: Partial<DelaisSync>): void;
//   · `margePullMs`    : la borne haute d'une page de pull est plafonnée à
//                        `now() - margePullMs`, lue EN BASE dans la transaction du pull ;
//   · `dureeMaxPushMs` : un lot de push dont la transaction dépasse cette durée est
//                        annulé en entier (503 SERVICE_UNAVAILABLE), rien n'est écrit.
// La marge DOIT rester supérieure à la durée maximale d'un lot : c'est ce qui
// garantit qu'aucune transaction ne valide une ligne sous un curseur déjà rendu.
interface DelaisSync {
  readonly margePullMs: number;
  readonly dureeMaxPushMs: number;
}

const DELAIS_DECIDES: DelaisSync = { margePullMs: 60_000, dureeMaxPushMs: 30_000 };

type Regleur = (delais: Partial<DelaisSync>) => void;

async function moduleService(): Promise<Record<string, unknown>> {
  return await import('../src/sync/service.js');
}

async function regleur(): Promise<Regleur | undefined> {
  const f = (await moduleService()).reglerDelaisSync;
  return typeof f === 'function' ? (f as Regleur) : undefined;
}

/**
 * Règle les délais SI le réglage existe. Son absence est dénoncée par un test
 * dédié (section 8) ; ici, elle laisse chaque épreuve échouer sur SON défaut
 * propre (ligne perdue, horloge applicative, lot sans limite) plutôt que sur un
 * « fonction absente » qui masquerait tout.
 */
async function reglerDelais(delais: Partial<DelaisSync>): Promise<void> {
  (await regleur())?.(delais);
}

// Les épreuves 1 à 7 écrivent puis tirent AUSSITÔT : elles portent sur l'accès,
// le contrat, le keyset, le journal — pas sur le plafond, qui a ses propres
// épreuves (section 8). Marge à zéro pour elles ; la durée de lot reste celle
// décidée. Aucune n'en est affaiblie : sans plafond, leurs assertions sont
// exactement celles d'avant la revue.
beforeEach(async () => {
  await reglerDelais({ margePullMs: 0, dureeMaxPushMs: DELAIS_DECIDES.dureeMaxPushMs });
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
    /** Le paramètre que l'erreur doit nommer (message ou détails). */
    readonly champ?: string;
  }[] = [
    {
      nom: 'mission_id absent',
      parametres: () => ({}),
      codes: [ERROR_CODES.VALIDATION_FAILED],
      champ: 'mission_id',
    },
    {
      nom: 'mission_id non UUID',
      parametres: () => ({ missionId: 'pas-un-uuid' }),
      codes: [ERROR_CODES.VALIDATION_FAILED],
      champ: 'mission_id',
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
      if (cas.champ !== undefined) {
        expect(r.corps, 'l’erreur doit nommer le paramètre fautif').toContain(cas.champ);
      }
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

// =============================================================================
// AIDES DES SECTIONS 8 ET 9 (revue A17)
// =============================================================================
function pause(ms: number): Promise<void> {
  return new Promise((resoudre) => {
    setTimeout(resoudre, ms);
  });
}

/**
 * Recule de `secondes` tous les `updated_at` de la mission : simule des données
 * écrites il y a longtemps, sous n'importe quel plafond de pull.
 */
async function vieillir(missionId: string, secondes: number): Promise<void> {
  const decalage = `${String(secondes)} seconds`;
  await bd().query(`UPDATE missions SET updated_at = now() - $2::interval WHERE id = $1`, [
    missionId,
    decalage,
  ]);
  for (const table of ['org_units', 'interviews', 'attachments']) {
    await bd().query(
      `UPDATE ${table} SET updated_at = now() - $2::interval WHERE mission_id = $1`,
      [missionId, decalage],
    );
  }
  await bd().query(
    `UPDATE answers SET updated_at = now() - $2::interval
      WHERE interview_id IN (SELECT id FROM interviews WHERE mission_id = $1)`,
    [missionId, decalage],
  );
}

/** `updated_at` d'une ligne, au microseconde, en ISO UTC. */
async function horodatageDe(table: string, id: string): Promise<string> {
  const [ligne] = await lignes(
    `SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t
       FROM ${table} WHERE id = $1`,
    [id],
  );
  return String(ligne?.t);
}

function sousLePlafond(nextSince: string | null, horlogeBaseIso: string, margeMs: number): void {
  if (nextSince === null) return;
  expect(
    microsecondes(nextSince) <= microsecondes(horlogeBaseIso) - BigInt(margeMs) * 1000n,
    `nextSince ${nextSince} dépasse le plafond now() - ${String(margeMs)} ms (${horlogeBaseIso})`,
  ).toBe(true);
}

interface OpPush {
  readonly opId: string;
  readonly entity: 'answer' | 'attachment_meta';
  readonly entityId: string;
  readonly action: 'upsert';
  readonly payload: Readonly<Record<string, unknown>>;
  readonly clientUpdatedAt: string;
}

function opReponse(m: Monde, valeur: boolean, clientUpdatedAt: string): OpPush {
  return {
    opId: uuidv7(),
    entity: 'answer',
    entityId: m.reponseA,
    action: 'upsert',
    clientUpdatedAt,
    payload: {
      interviewId: m.entretienA,
      missionQuestionId: m.mq1,
      value: { type: 'yes_no', v: valeur },
      source: 'entretien',
      withheld: false,
      horsParcours: false,
      flagReview: false,
      notApplicable: false,
      note: null,
      clientCreatedAt: T_SEMIS,
    },
  };
}

function opNoteVolante(m: Monde, clientUpdatedAt: string): OpPush {
  return {
    opId: uuidv7(),
    entity: 'attachment_meta',
    entityId: uuidv7(),
    action: 'upsert',
    clientUpdatedAt,
    payload: {
      missionId: m.missionId,
      interviewId: null,
      answerId: null,
      kind: 'note',
      content: 'note poussée L6b',
      clientCreatedAt: clientUpdatedAt,
    },
  };
}

async function pousserOps(
  jeton: string,
  missionId: string,
  operations: readonly OpPush[],
): Promise<ReponseHttp> {
  const reponse = await api().inject({
    method: 'POST',
    url: ROUTE_PUSH,
    headers: {
      'x-forwarded-for': ipUnique(),
      'content-type': 'application/json',
      authorization: `Bearer ${jeton}`,
    },
    payload: JSON.stringify({
      missionId,
      deviceId: 'appareil-fictif-l6b',
      outboxRemaining: 0,
      operations,
    }),
  });
  return { statut: reponse.statusCode, corps: reponse.body, ...lireErreur(reponse.body) };
}

function resultatsPush(r: ReponseHttp): string[] {
  expect(r.statut, `push attendu 200, reçu ${String(r.statut)} :\n${r.corps.slice(0, 400)}`).toBe(
    200,
  );
  return reponsePushSchema.parse(JSON.parse(r.corps)).results.map((x) => x.result);
}

// =============================================================================
// 8. LE CURSEUR NE PERD AUCUNE LIGNE — revue A17, défaut BLOQUANT
// =============================================================================
// Le défaut : le push horodatait chaque op à l'heure de l'APPLICATION, mais ne
// validait qu'en fin de lot. Un lot A ouvert, un lot B validé, un pull qui rend B
// et avance le curseur au-delà de A, puis A qui valide SOUS le curseur : A ne
// redescendait jamais. Corrections décidées : (a) borne haute plafonnée à
// `now() - 60 s` lue en base ; (b) `updated_at` du push à l'horloge PostgreSQL ;
// (c) lot de plus de 30 s annulé en entier (503, compte 0 vers « à examiner »).
describe('L6b · le curseur ne perd aucune ligne (revue A17) @critique', () => {
  it('les délais sont injectables et valent par défaut 60 s (marge du pull) et 30 s (durée max d’un lot), la marge au-dessus de la durée @critique', async () => {
    const service = await moduleService();
    expect(
      typeof service.reglerDelaisSync,
      'option injectable absente : `reglerDelaisSync` (apps/api/src/sync/service.ts)',
    ).toBe('function');
    expect(service.DELAIS_SYNC_DEFAUT).toEqual(DELAIS_DECIDES);
    expect(DELAIS_DECIDES.margePullMs).toBeGreaterThan(DELAIS_DECIDES.dureeMaxPushMs);
  });

  it('(a) plafond par défaut : une ligne plus récente que now() - 60 s ne descend pas encore, puis descend une fois le plafond franchi ; nextSince ne dépasse jamais le plafond @critique', async () => {
    await reglerDelais(DELAIS_DECIDES);
    const m = await semerMonde();
    await vieillir(m.missionId, 600);
    const d = await descendre(m.A.jeton, m.missionId);
    expect(d.recus.get('interview') ?? []).toEqual(
      expect.arrayContaining([m.entretienA, m.entretienB]),
    );
    const horloge1 = await horlogeBase();
    for (const page of d.pages) sousLePlafond(page.nextSince, horloge1, DELAIS_DECIDES.margePullMs);
    const curseur = d.curseur ?? '';

    const recente = await semerNote(m.missionId, m.A.id, null);
    const p1 = await tirer(m.A.jeton, m.missionId, { since: curseur });
    sousLePlafond(p1.nextSince, await horlogeBase(), DELAIS_DECIDES.margePullMs);
    expect(idsDe(p1, 'attachment_meta'), 'ligne plus récente que le plafond rendue').not.toContain(
      recente,
    );

    // Le temps passe : la ligne franchit le plafond.
    await bd().query(
      `UPDATE attachments SET updated_at = now() - interval '61 seconds' WHERE id = $1`,
      [recente],
    );
    const d2 = await descendre(m.A.jeton, m.missionId, { since: p1.nextSince ?? curseur });
    expect(tousLesIds(d2)).toContain(recente);
    const horloge2 = await horlogeBase();
    for (const page of d2.pages)
      sousLePlafond(page.nextSince, horloge2, DELAIS_DECIDES.margePullMs);
  });

  it('(a) scénario du lot ouvert : lot A ouvert, lot B validé, pull, lot A validé → la ligne de A redescend au pull suivant @critique', async () => {
    const marge = 3_000;
    await reglerDelais({ margePullMs: marge, dureeMaxPushMs: 1_000 });
    const m = await semerMonde();
    await vieillir(m.missionId, 600);
    const d = await descendre(m.A.jeton, m.missionId);
    const curseur = d.curseur ?? '';

    const lotA = await connecter(urlBase);
    const ligneA = uuidv7();
    let ouvert = false;
    try {
      // Lot A : transaction OUVERTE, horodatée à son début par l'horloge de la base.
      await lotA.query('BEGIN');
      ouvert = true;
      await lotA.query(
        `INSERT INTO attachments (id, interview_id, answer_id, mission_id, kind, content, created_by,
                                  client_created_at, client_updated_at, created_at, updated_at)
         VALUES ($1, NULL, NULL, $2, 'note', 'note du lot A', $3, $4, $4, now(), now())`,
        [ligneA, m.missionId, m.A.id, T_SEMIS],
      );
      // Lot B : validé APRÈS l'ouverture de A, donc horodaté plus tard.
      const ligneB = await semerNote(m.missionId, m.B.id, null);

      const p1 = await tirer(m.A.jeton, m.missionId, { since: curseur });
      const curseur1 = p1.nextSince ?? curseur;

      await lotA.query('COMMIT');
      ouvert = false;
      await pause(marge + 500);

      const d2 = await descendre(m.A.jeton, m.missionId, { since: curseur1 });
      const recus = [...idsDe(p1, 'attachment_meta'), ...(d2.recus.get('attachment_meta') ?? [])];
      expect(recus, 'la ligne du lot A, validée sous le curseur, est perdue').toContain(ligneA);
      expect(recus).toContain(ligneB);
      expect(doublons(recus)).toEqual([]);
    } finally {
      if (ouvert) await lotA.query('ROLLBACK');
      await lotA.end();
    }
  });

  it('(b) le push horodate updated_at à l’horloge de PostgreSQL, pas à celle de l’application @critique', async () => {
    const m = await semerMonde();
    const reponse = opReponse(m, true, '2026-10-05T09:00:00.000Z');
    const note = opNoteVolante(m, '2026-10-05T09:00:00.000Z');
    // L'horloge de l'APPLICATION avance de deux heures ; celle de la base, non.
    const maintenantReel = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    let r: ReponseHttp;
    try {
      vi.setSystemTime(new Date(maintenantReel + 2 * 3_600_000));
      const jeton = api().jwt.sign({ sub: m.A.id });
      r = await pousserOps(jeton, m.missionId, [reponse, note]);
    } finally {
      vi.useRealTimers();
    }
    expect(resultatsPush(r)).toEqual(['applied', 'applied']);
    const horloge = microsecondes(await horlogeBase());
    for (const [table, id] of [
      ['answers', m.reponseA],
      ['attachments', note.entityId],
    ] as const) {
      const ecart = horloge - microsecondes(await horodatageDe(table, id));
      expect(
        ecart >= 0n && ecart < 60_000_000n,
        `${table}.updated_at pris à l'horloge applicative (écart ${String(ecart)} µs)`,
      ).toBe(true);
    }
  });

  it('(c) un lot dont la transaction dépasse la durée max est annulé EN ENTIER : 503 SERVICE_UNAVAILABLE, rien d’écrit ; le rejeu est idempotent @critique', async () => {
    await reglerDelais({ margePullMs: 0, dureeMaxPushMs: 500 });
    const m = await semerMonde();
    const note = opNoteVolante(m, '2026-10-05T10:00:00.000Z');
    const reponse = opReponse(m, true, '2026-10-05T10:00:00.000Z');
    const lot = [note, reponse];

    const verrou = await connecter(urlBase);
    let r: ReponseHttp;
    let duree = 0;
    let lache: ReturnType<typeof setTimeout> | undefined;
    try {
      // Un verrou tenu sur la réponse fait durer la transaction du lot.
      await verrou.query('BEGIN');
      await verrou.query('SELECT 1 FROM answers WHERE id = $1 FOR UPDATE', [m.reponseA]);
      // Garde anti-blocage : SANS durée max, le push attendrait le verrou sans fin.
      lache = setTimeout(() => {
        void verrou.query('ROLLBACK');
      }, 5_000);
      const debut = Date.now();
      r = await pousserOps(m.A.jeton, m.missionId, lot);
      duree = Date.now() - debut;
    } finally {
      if (lache !== undefined) clearTimeout(lache);
      await verrou.query('ROLLBACK');
      await verrou.end();
    }
    expect(
      r.statut,
      `lot trop long attendu 503, reçu ${String(r.statut)} : ${r.corps.slice(0, 300)}`,
    ).toBe(503);
    expect(r.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);
    expect(r.message).toBeTruthy();
    expect(
      duree,
      'le lot doit être coupé à sa durée max, pas au relâchement du verrou',
    ).toBeLessThan(4_000);

    // Rien n'est écrit : ni la note (op qui ne bloquait pas), ni la réponse, ni le journal.
    expect(await lignes('SELECT id FROM attachments WHERE id = $1', [note.entityId])).toHaveLength(
      0,
    );
    expect(await lignes(`SELECT value FROM answers WHERE id = $1`, [m.reponseA])).toEqual([
      { value: { type: 'yes_no', v: false } },
    ]);
    expect(
      await lignes('SELECT op_id FROM processed_ops WHERE op_id = ANY($1::uuid[])', [
        lot.map((o) => o.opId),
      ]),
    ).toHaveLength(0);
    expect(
      await lignes(`SELECT 1 FROM sync_log WHERE user_id = $1 AND direction = 'push'`, [m.A.id]),
    ).toHaveLength(0);
    expect(
      await lignes('SELECT 1 FROM answer_revisions WHERE entity_id = $1', [m.reponseA]),
    ).toHaveLength(0);

    // Le terrain réessaie le MÊME lot : appliqué une fois, puis dédupliqué.
    await reglerDelais({ dureeMaxPushMs: DELAIS_DECIDES.dureeMaxPushMs });
    expect(resultatsPush(await pousserOps(m.A.jeton, m.missionId, lot))).toEqual([
      'applied',
      'applied',
    ]);
    expect(resultatsPush(await pousserOps(m.A.jeton, m.missionId, lot))).toEqual([
      'duplicate',
      'duplicate',
    ]);
    expect(await lignes(`SELECT value FROM answers WHERE id = $1`, [m.reponseA])).toEqual([
      { value: { type: 'yes_no', v: true } },
    ]);
  });
});

// =============================================================================
// 9. COLONNES FERMÉES EN SORTIE — revue A17
// =============================================================================
// Chaque entité descend selon une projection EXPLICITE. Une colonne ajoutée demain
// au 04 fait échouer « aucune colonne hors liste » au lieu de fuiter vers l'iPad.
//   · `storageKey` ne descend JAMAIS (MinIO n'est jamais exposé, 11 §2) ;
//   · `personEmail` d'une session ne descend qu'à son PROPRIÉTAIRE (minimisation, 06) ;
//   · `personName` descend à tous les membres (05 §9.9, lecture par le pull) ;
//   · `missions` : ce que le terrain affiche et range (miroir `apps/field/src/local/
//     formes.ts`), rien du commercial (`commercialOffer`), de la confidentialité
//     (`ndaRef`, `ndaSignedAt`) ni du paramétrage siège (`llmProvider`, `sizeTierId`…).
const COLONNES_ADMISES: Readonly<Record<EntiteDescendante, readonly string[]>> = {
  mission: [
    'id',
    'companyId',
    'roleSurMission',
    'title',
    'timezone',
    'auditLevel',
    'geoScope',
    'countryCode',
    'startPlanned',
    'endPlanned',
    'status',
    'updatedAt',
    'deletedAt',
  ],
  mission_question: [
    'id',
    'missionId',
    'questionId',
    'questionVersion',
    'textSnapshot',
    'optionsSnapshot',
    'weightSnapshot',
    'scoringSnapshot',
    'guidanceSnapshot',
    'answerTypeSnapshot',
    'criticalitySnapshot',
    'allowRangeSnapshot',
    'position',
    'addedAdHoc',
    'blockCode',
  ],
  org_unit: [
    'id',
    'missionId',
    'parentId',
    'kind',
    'name',
    'countryCode',
    'timezone',
    'headcount',
    'serviceRefId',
    'sectorId',
    'inScope',
    'status',
    'proposedBy',
    'mergedIntoId',
    'position',
    'createdAt',
    'updatedAt',
  ],
  work_assignment: [
    'id',
    'missionId',
    'userId',
    'orgUnitId',
    'plannedInterviews',
    'plannedDays',
    'dateFrom',
    'dateTo',
  ],
  interview: [
    'id',
    'missionId',
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
    'orgUnitId',
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
    'clientUpdatedAt',
    'syncedAt',
    'createdAt',
    'updatedAt',
  ],
  answer: [
    'id',
    'missionId',
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
    'questionTextSnapshot',
    'revision',
    'clientCreatedAt',
    'clientUpdatedAt',
    'syncedAt',
    'createdAt',
    'updatedAt',
  ],
  attachment_meta: [
    'id',
    'interviewId',
    'answerId',
    'missionId',
    'kind',
    'content',
    'filename',
    'mime',
    'sizeBytes',
    'transcription',
    'purgeAfter',
    'clientCreatedAt',
    'clientUpdatedAt',
    'createdBy',
    'syncedAt',
    'createdAt',
    'updatedAt',
  ],
};

function elementsDeLaDescente(d: Descente, entite: EntiteDescendante): Record<string, unknown>[] {
  return d.pages.flatMap((p) => elementsDe(p, entite));
}

describe('L6b · GET /v1/sync/pull — colonnes fermées en sortie (revue A17) @critique', () => {
  for (const entite of ENTITES_DESCENDANTES) {
    it(`${entite} : aucune colonne hors de la liste fermée, pour un membre comme pour le propriétaire @critique`, async () => {
      const m = await semerMonde();
      for (const compte of [m.A, m.B, m.ADM]) {
        const elements = elementsDeLaDescente(await descendre(compte.jeton, m.missionId), entite);
        expect(
          elements.length,
          `aucun élément « ${entite} » : l'épreuve serait vide`,
        ).toBeGreaterThan(0);
        for (const element of elements) {
          const horsListe = Object.keys(element).filter(
            (cle) => !COLONNES_ADMISES[entite].includes(cle),
          );
          expect(horsListe, `colonnes hors liste pour « ${entite} »`).toEqual([]);
        }
      }
    });
  }

  it('storageKey ne descend JAMAIS, à personne, propriétaire et admin compris @critique', async () => {
    const m = await semerMonde();
    for (const compte of [m.A, m.B, m.ADM]) {
      const d = await descendre(compte.jeton, m.missionId);
      for (const element of elementsDeLaDescente(d, 'attachment_meta')) {
        expect(Object.keys(element)).not.toContain('storageKey');
      }
      for (const page of d.pages) {
        const texte = JSON.stringify(page);
        expect(texte).not.toContain('sentinelle-cle-stockage');
        expect(texte).not.toMatch(/storage_?key/i);
      }
    }
  });

  it('personEmail d’une session ne descend qu’à son propriétaire ; personName descend à tous les membres @critique', async () => {
    const m = await semerMonde();
    const courrielA = courrielInterlocuteur(m.entretienA);
    const courrielB = courrielInterlocuteur(m.entretienB);

    // B, propriétaire de entretienB : il reçoit SON courriel, jamais celui de A.
    const dB = await descendre(m.B.jeton, m.missionId);
    const sessionsB = elementsDeLaDescente(dB, 'interview');
    expect(sessionsB.find((s) => s.id === m.entretienB)?.personEmail).toBe(courrielB);
    const sessionAVueParB = sessionsB.find((s) => s.id === m.entretienA);
    expect(sessionAVueParB, 'la session de A doit descendre chez B (lecture)').toBeDefined();
    expect(sessionAVueParB?.personEmail ?? null).toBeNull();
    expect(sessionAVueParB?.personName).toBe(nomInterlocuteur(m.entretienA));
    for (const page of dB.pages) expect(JSON.stringify(page)).not.toContain(courrielA);

    // Un membre lead, un admin membre, un lecteur de mission : aucun courriel d'autrui.
    for (const compte of [m.LD, m.ADM, m.LM]) {
      const d = await descendre(compte.jeton, m.missionId);
      const sessions = elementsDeLaDescente(d, 'interview');
      for (const id of [m.entretienA, m.entretienB]) {
        const session = sessions.find((s) => s.id === id);
        expect(session?.personEmail ?? null).toBeNull();
        expect(session?.personName).toBe(nomInterlocuteur(id));
      }
      for (const page of d.pages) {
        expect(JSON.stringify(page)).not.toContain(courrielA);
        expect(JSON.stringify(page)).not.toContain(courrielB);
      }
    }
  });
});

// =============================================================================
// 10. CHAMPS CALCULÉS POUR LA TABLETTE — `roleSurMission` et `blockCode`
// =============================================================================
// Deux champs que le miroir terrain exige (`apps/field/src/local/formes.ts`) et
// qui ne sont PAS des colonnes de la table descendue :
//   · `mission.roleSurMission` = `mission_users.role_on_mission` de l'ÉMETTEUR
//     (`mission_users.mission_id` = la mission, `mission_users.user_id` = l'émetteur) ;
//   · `mission_question.blockCode` = `blocks.code`, par `mission_questions.question_id`
//     → `questions.block_id` (NOT NULL au 04) → `blocks.id`. Toujours non nul.
describe('L6b · GET /v1/sync/pull — champs calculés pour la tablette @critique', () => {
  it('chaque membre reçoit SON rôle sur la mission dans `roleSurMission`, jamais celui d’un autre @critique', async () => {
    const m = await semerMonde();
    const attendus: readonly (readonly [Compte, string])[] = [
      [m.A, 'consultant'],
      [m.LD, 'lead'],
      [m.LM, 'lecteur'],
      [m.ADM, 'lead'],
    ];
    for (const [compte, role] of attendus) {
      const d = await descendre(compte.jeton, m.missionId);
      const missions = elementsDeLaDescente(d, 'mission');
      expect(missions).toHaveLength(1);
      expect(missions[0]?.id).toBe(m.missionId);
      expect(missions[0]?.roleSurMission, `rôle rendu à ${compte.id}`).toBe(role);
      // Aucun autre membre ni aucun autre rôle ne voyage dans la ligne mission.
      const texte = JSON.stringify(missions[0]);
      for (const [autre, autreRole] of attendus) {
        if (autre.id !== compte.id) expect(texte).not.toContain(autre.id);
        if (autreRole !== role) expect(texte).not.toContain(`"${autreRole}"`);
      }
    }
  });

  it('le rôle suit l’émetteur : un même consultant, consultant sur une mission et lecteur sur une autre, reçoit chacun des deux @critique', async () => {
    const m = await semerMonde();
    const autre = await semerMission();
    await rattacher(autre.missionId, m.A.id, 'lecteur');
    const ici = elementsDeLaDescente(await descendre(m.A.jeton, m.missionId), 'mission');
    const la = elementsDeLaDescente(await descendre(m.A.jeton, autre.missionId), 'mission');
    expect(ici[0]?.roleSurMission).toBe('consultant');
    expect(la[0]?.roleSurMission).toBe('lecteur');
  });

  it('chaque ligne mission_question porte `blockCode`, non nul, égal au code du bloc de sa question @critique', async () => {
    const m = await semerMonde();
    // Deux blocs distincts, pour qu'un code constant ne passe pas pour une résolution.
    const [autreBloc] = await lignes('SELECT id FROM blocks WHERE id <> $1 ORDER BY id LIMIT 1', [
      blocId,
    ]);
    expect(autreBloc, 'le seed L1 doit porter au moins deux blocs').toBeDefined();
    await bd().query(
      'UPDATE questions SET block_id = $2 WHERE id = (SELECT question_id FROM mission_questions WHERE id = $1)',
      [m.mq2, autreBloc?.id],
    );
    const attendus = new Map(
      (
        await lignes(
          `SELECT mq.id, b.code FROM mission_questions mq
             JOIN questions q ON q.id = mq.question_id
             JOIN blocks b ON b.id = q.block_id
            WHERE mq.mission_id = $1`,
          [m.missionId],
        )
      ).map((l) => [String(l.id), String(l.code)]),
    );
    expect(new Set(attendus.values()).size).toBe(2);
    for (const compte of [m.A, m.LM]) {
      const questions = elementsDeLaDescente(
        await descendre(compte.jeton, m.missionId),
        'mission_question',
      );
      expect(questions).toHaveLength(attendus.size);
      for (const q of questions) {
        expect(q.blockCode, `blockCode de ${String(q.id)}`).toBe(attendus.get(String(q.id)));
      }
    }
  });
});
