// =============================================================================
// LOT L7 / INCRÉMENT L7b — LES DEUX ROUTES DE PILOTAGE, ÉPROUVÉES PAR RÔLE SUR
// UN POSTGRESQL RÉEL. Tests d'ACCEPTATION, écrits par A36 (09 §5.6 : jamais par
// l'agent qui a écrit le code — A32 a écrit les routes et ses tests de
// conception ; ce fichier est la recette).
//
//   GET /v1/missions/:id/coverage      (03 §16.6 + §27.1 — unité × source)
//   GET /v1/missions/:id/aggregation   (05 §8.5 / M5.1 + §27.4 — par question)
//
// ── CE QUE CE FICHIER PROUVE, ET QUE LES TESTS DE CONCEPTION NE PROUVENT PAS ─
// Les 61 tests unitaires d'A32 éprouvent deux fonctions PURES sur des entrées
// fabriquées. Ils ne disent rien de ce qu'un JETON reçoit : ni le 404 du
// non-membre, ni l'absence d'un montant, ni la stabilité d'un curseur sur 150
// unités réellement en base. C'est ici que ces propriétés se mesurent.
//
//   1. PAR RÔLE — membre (`mission_users`) → 200 ; non-membre → **404, jamais
//      403** (un 403 dirait au non-membre que la mission EXISTE — c'est l'oracle
//      que `DECISIONS.md` 2026-09-02 ferme) ; sans jeton → 401 ; jeton expiré →
//      401 ; administrateur non membre → 200 (03 §34.1 : la console est la sienne).
//   2. ÉTANCHÉITÉ FINANCIÈRE — un cadrage SENTINELLE est semé sur la mission ;
//      aucune réponse de ces routes, pour aucun rôle, ne porte une valeur ni un
//      NOM de `scoping_financials`. Et la DISTINCTION qu'A32 remonte est éprouvée :
//      une réponse d'audit de type `money` (`answers.value`, saisie par le
//      consultant lui-même) est rendue, et la sentinelle ne la confond pas.
//   3. AUCUN NOM DE RÉPONDANT — `person_name` et `person_email` ne traversent
//      jamais l'agrégation (décision conservatoire du 2026-09-05), pour AUCUN
//      rôle, administrateur compris.
//   4. KEYSET DE BOUT EN BOUT — FIL-GC, 150 unités, page de 50 → TROIS pages
//      exactement, aucune ligne dupliquée ni sautée, marges identiques d'une page
//      à l'autre ; curseur invalide → 400 `INVALID_CURSOR` ; curseur d'une AUTRE
//      ressource → 400 (le curseur est opaque ET signé de sa ressource).
//   5. LA COUVERTURE REFLÈTE LE PLAN — critère du 07, ligne L7-min : le `prevu`
//      de chaque unité est CELUI de `etablirLePlanDEntretiens`, appelé directement,
//      sur FIL-TPE et FIL-GC ; et il SUIT le plan quand l'effectif change.
//   6. LES DEUX FIXTURES SYMÉTRIQUES de `LOT_L7.md` §6.5, rejouées PAR LA ROUTE :
//      « tout en entretiens » (axe A complet, axe B en défaut) et « tout sur une
//      unité » (axe B présent en marge, axe A en défaut sur neuf unités, alerte
//      §16.6 comprise). Un build qui n'aurait qu'un axe échoue à l'une des deux.
//
// ── CONTRÔLE DE VACUITÉ, PARTOUT ─────────────────────────────────────────────
// Chaque assertion NÉGATIVE (« aucun montant », « aucun nom ») est doublée d'une
// assertion POSITIVE sur la même réponse (« la réponse d'audit y est », « la
// fonction du répondant y est ») : un 404 ne porte ni montant ni nom, et un test
// qui ne vérifierait que l'absence serait vert sur une route absente.
//
// ── LE CONTRAT DE SORTIE EST TRANSCRIT, PAS IMPORTÉ ─────────────────────────
// Comme en L3d : importer `couvertureMissionSchema` du lot reviendrait à demander
// au sujet de valider sa propre réponse. Les formes ci-dessous sont transcrites de
// `docs/conception/LOT_L7.md` §6.3 et des entrées `DECISIONS.md` du 2026-09-05,
// en `z.object` NON strict : la forme au champ près est jugée par l'étanchéité,
// pas ici.
//
// Invariant 2 : missions FICTIVES seulement (FIL-TPE, FIL-GC, libellés neutres).
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E14
// (consolidation, divergences) · E21 (auditeurs jamais d'accès aux montants) ·
// E33 (sécurité / RGPD) · E45 (matrice console rôle × espace, testée par rôle) · E43
// (conventions d'API) · invariants 2, 3, 5, 7.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ERROR_CODES } from '@axion/shared';
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
  FIL_GC,
  FIL_TPE,
  genererFilGc,
  genererFilTpe,
  type MissionCanonique,
} from './aide/fil-rouge.js';
// Importé pour sa DÉCLARATION D'AUGMENTATION (`app.registreAcces`).
import type { EntreeRegistreAcces } from '../src/auth/politique.js';
import {
  balayerSentinellesFinancieres,
  decrireRapport,
  detecterSentinelles,
  NOMS_FINANCIERS_INTERDITS,
  parametresDuGabarit,
  semerVoletFinancierSentinelle,
  VALEURS_SENTINELLES,
  type CartographieDeParametres,
} from './aide/sentinelle-financiere.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '7b'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '2c'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l7b@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

/** Les cinq sources de collecte du 03 §27.1, DANS L'ORDRE DU TEXTE — transcrites, pas importées. */
const SOURCES_27_1 = [
  'entretien',
  'observation',
  'demonstration',
  'analyse_documentaire',
  'releve_donnees',
] as const;
type Source27_1 = (typeof SOURCES_27_1)[number];

/** Les cinq provenances de `answers.source` (04 l. 151). */
const PROVENANCES = ['entretien', 'observation', 'demonstration', 'document', 'releve'] as const;

/** Le sixième `kind`, hors grille (§28.1). */
const KIND_ATELIER = 'atelier';

/**
 * Un NOM et un COURRIEL de répondant reconnaissables — des leurres de test qui ne
 * doivent JAMAIS sortir de l'agrégation, quel que soit le rôle.
 */
const NOM_REPONDANT_SENTINELLE = 'Répondant Sentinelle Zxqv';
const COURRIEL_REPONDANT_SENTINELLE = 'repondant.sentinelle.zxqv@exemple.test';

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

// -----------------------------------------------------------------------------
// APPELS HTTP
// -----------------------------------------------------------------------------
interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly message: string | null;
  readonly corps: string;
}

const erreurSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.71.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

async function appeler(
  url: string,
  options: { readonly jeton?: string | undefined } = {},
): Promise<Reponse> {
  const reponse = await api().inject({
    method: 'GET',
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
  });
  let code: string | null = null;
  let message: string | null = null;
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
    if (analyse.success) {
      code = analyse.data.error.code;
      message = analyse.data.error.message;
    }
  }
  return { statut: reponse.statusCode, code, message, corps: reponse.body };
}

async function lireCouverture(
  missionId: string,
  jeton: string | undefined,
  query = '',
): Promise<Reponse> {
  return appeler(`/v1/missions/${missionId}/coverage${query}`, { jeton });
}

async function lireAgregation(
  missionId: string,
  jeton: string | undefined,
  query = '',
): Promise<Reponse> {
  return appeler(`/v1/missions/${missionId}/aggregation${query}`, { jeton });
}

// =============================================================================
// LE CONTRAT DE SORTIE — transcrit de `LOT_L7.md` §6.3 et de DECISIONS 2026-09-05
// =============================================================================
const fourchetteSchema = z.object({ min: z.number().int().min(0), max: z.number().int().min(0) });

const celluleSchema = z.object({
  kind: z.enum(SOURCES_27_1),
  prevu: fourchetteSchema,
  planifie: z.number().int().min(0),
  realise: z.number().int().min(0),
  couvert: z.boolean(),
});
type Cellule = z.infer<typeof celluleSchema>;

const uniteCouverteSchema = z.object({
  orgUnitId: z.uuid(),
  nom: z.string(),
  inScope: z.boolean(),
  effectif: z.number().int().nullable(),
  parSource: z.array(celluleSchema),
  atelierRealise: z.number().int().min(0),
  sourcesCouvertes: z.number().int().min(0),
  sourcesAttendues: z.number().int().min(0),
  blocsNonCouverts: z.array(z.string()),
  aucuneSession: z.boolean(),
});
type UniteCouverte = z.infer<typeof uniteCouverteSchema>;

const margesSchema = z.object({
  parSource: z.array(celluleSchema),
  atelierRealise: z.number().int().min(0),
  unitesInScope: z.number().int().min(0),
  unitesHorsPerimetre: z.number().int().min(0),
  unitesSansAucuneSession: z.number().int().min(0),
});

const couvertureSchema = z.object({
  missionId: z.uuid(),
  timezone: z.string(),
  calculeLe: z.string(),
  blocsActifs: z.array(z.string()),
  unites: z.array(uniteCouverteSchema),
  nextCursor: z.string().nullable(),
  marges: margesSchema,
  avertissements: z.array(z.object({ code: z.string(), message: z.string() })),
});
type Couverture = z.infer<typeof couvertureSchema>;

const reponseAgregeeSchema = z.object({
  answerId: z.uuid(),
  interviewId: z.uuid(),
  sessionKind: z.string(),
  orgUnitId: z.uuid(),
  orgUnitNom: z.string(),
  fonctionRepondant: z.string().nullable(),
  serviceRepondant: z.string().nullable(),
  provenance: z.enum(PROVENANCES),
  valeurLisible: z.string().nullable(),
  nonCommunique: z.boolean(),
  motifNonCommunique: z.string().nullable(),
  sansObjet: z.boolean(),
  motifSansObjet: z.string().nullable(),
  aRevoir: z.boolean(),
  motifARevoir: z.string().nullable(),
  horsParcours: z.boolean(),
  revision: z.number().int().min(1),
  misAJourLe: z.string(),
});

const questionAgregeeSchema = z.object({
  missionQuestionId: z.uuid(),
  blocCode: z.string(),
  texte: z.string(),
  comptes: z.object({
    posee: z.number().int().min(0),
    renseignees: z.number().int().min(0),
    nonCommuniquees: z.number().int().min(0),
    sansObjet: z.number().int().min(0),
    aRevoir: z.number().int().min(0),
    horsParcours: z.number().int().min(0),
    unitesTouchees: z.number().int().min(0),
  }),
  parProvenance: z.array(z.object({ provenance: z.enum(PROVENANCES), nombre: z.number().int() })),
  reponses: z.array(reponseAgregeeSchema),
});

const agregationSchema = z.object({
  missionId: z.uuid(),
  timezone: z.string(),
  calculeLe: z.string(),
  blocs: z.array(z.object({ code: z.string(), libelle: z.string() })),
  filtre: z.object({ block: z.string().nullable(), orgUnit: z.string().nullable() }),
  questions: z.array(questionAgregeeSchema),
  nextCursor: z.string().nullable(),
  totaux: z.object({
    questions: z.number().int().min(0),
    questionsSansReponse: z.number().int().min(0),
    reponses: z.number().int().min(0),
    nonCommuniquees: z.number().int().min(0),
    sansObjet: z.number().int().min(0),
    aRevoir: z.number().int().min(0),
    parProvenance: z.array(z.object({ provenance: z.enum(PROVENANCES), nombre: z.number().int() })),
  }),
});
type Agregation = z.infer<typeof agregationSchema>;

function couverture(reponse: Reponse): Couverture {
  expect(reponse.statut, `couverture refusée : ${reponse.corps.slice(0, 600)}`).toBe(200);
  const analyse = couvertureSchema.safeParse(JSON.parse(reponse.corps));
  expect(
    analyse.success,
    `La couverture ne porte pas la forme de LOT_L7.md §6.3 :\n${reponse.corps.slice(0, 900)}`,
  ).toBe(true);
  return couvertureSchema.parse(JSON.parse(reponse.corps));
}

function agregation(reponse: Reponse): Agregation {
  expect(reponse.statut, `agrégation refusée : ${reponse.corps.slice(0, 600)}`).toBe(200);
  const analyse = agregationSchema.safeParse(JSON.parse(reponse.corps));
  expect(
    analyse.success,
    `L’agrégation ne porte pas la forme attendue (M5.1, §27.4) :\n${reponse.corps.slice(0, 900)}`,
  ).toBe(true);
  return agregationSchema.parse(JSON.parse(reponse.corps));
}

function cellule(unite: { parSource: readonly Cellule[] }, kind: Source27_1): Cellule {
  const trouvee = unite.parSource.find((c) => c.kind === kind);
  if (trouvee === undefined) throw new Error(`source ${kind} absente de la grille`);
  return trouvee;
}

/** Le corps d'une réponse, ramené aux CLÉS JSON qu'il porte (récursif). */
function clesDuJson(valeur: unknown, accumulees = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(valeur)) {
    for (const element of valeur) clesDuJson(element, accumulees);
  } else if (typeof valeur === 'object' && valeur !== null) {
    for (const [cle, contenu] of Object.entries(valeur)) {
      accumulees.add(cle);
      clesDuJson(contenu, accumulees);
    }
  }
  return accumulees;
}

// =============================================================================
// FIXTURES — semées par SQL direct (ce sont des ÉTATS de L2/L3/L5, pas le sujet)
// =============================================================================
type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';

interface Compte {
  readonly id: string;
  readonly jeton: string;
}

let compteurCompte = 0;

async function creerCompte(role: RoleUtilisateur, marqueur: string): Promise<Compte> {
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
  options: { readonly blocsActifs?: readonly string[]; readonly timezone?: string } = {},
): Promise<MissionSemee> {
  compteurMission += 1;
  const companyId = uuidv7();
  await bd().query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
    companyId,
    `Entreprise fictive L7b ${String(compteurMission)}`,
  ]);
  const id = uuidv7();
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, timezone,
                           active_blocks, created_at, updated_at)
     VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', $4, $5::jsonb, now(), now())`,
    [
      id,
      companyId,
      `Mission fictive L7b ${String(compteurMission)}`,
      options.timezone ?? 'Europe/Paris',
      JSON.stringify(options.blocsActifs ?? []),
    ],
  );
  return { id, companyId };
}

async function rattacher(
  missionId: string,
  userId: string,
  role: 'lead' | 'consultant' | 'analyste' | 'lecteur',
): Promise<void> {
  await bd().query(
    'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
    [missionId, userId, role],
  );
}

let compteurUnite = 0;

async function semerUnite(semis: {
  readonly missionId: string;
  readonly effectif: number | null;
  readonly nom?: string;
  readonly dansLePerimetre?: boolean;
  readonly position?: number;
}): Promise<string> {
  compteurUnite += 1;
  const id = uuidv7();
  await bd().query(
    `INSERT INTO org_units (id, mission_id, parent_id, kind, name, headcount, in_scope,
                            status, position, created_at, updated_at)
     VALUES ($1, $2, NULL, 'service', $3, $4, $5, 'active', $6, now(), now())`,
    [
      id,
      semis.missionId,
      semis.nom ?? `Unité fictive ${String(compteurUnite)}`,
      semis.effectif,
      semis.dansLePerimetre ?? true,
      semis.position ?? compteurUnite,
    ],
  );
  return id;
}

type KindSession = Source27_1 | typeof KIND_ATELIER;

async function semerSession(semis: {
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly kind: KindSession;
  readonly conduitPar: string;
  readonly statut?: 'non_demarre' | 'en_cours' | 'termine';
  readonly agenda?: 'a_planifier' | 'planifie' | 'confirme' | 'realise' | 'reporte' | 'annule';
  readonly nomPersonne?: string;
  readonly courrielPersonne?: string;
  readonly fonction?: string;
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
                             schedule_status, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
    [
      id,
      semis.missionId,
      semis.conduitPar,
      semis.kind,
      semis.kind === 'entretien' ? 'sur_site' : null,
      semis.orgUnitId,
      semis.nomPersonne ?? null,
      semis.courrielPersonne ?? null,
      semis.fonction ?? null,
      serviceId,
      semis.agenda ?? 'realise',
      semis.statut ?? 'termine',
    ],
  );
  return id;
}

/** Une question de banque + sa ligne figée, dans un bloc du seed (`bloc_1`…`bloc_9`). */
async function semerQuestionFigee(semis: {
  readonly missionId: string;
  readonly blocCode: string;
  readonly texte: string;
  readonly position: number;
  readonly typeReponse?: string;
  readonly options?: readonly { code: string; label: string }[];
}): Promise<string> {
  const bloc = await bd().query<{ id: string }>('SELECT id FROM blocks WHERE code = $1', [
    semis.blocCode,
  ]);
  const blocId = bloc.rows[0]?.id;
  if (blocId === undefined) throw new Error(`bloc ${semis.blocCode} absent du seed`);
  const questionId = uuidv7();
  const type = semis.typeReponse ?? 'yes_no';
  await bd().query(
    `INSERT INTO questions (id, code, block_id, version, status, text_fr, answer_type, options,
                            weight, criticality, origin, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'active', $4, $5, $6::jsonb, 1, 'important', 'banque', now(), now())`,
    [
      questionId,
      `l7b_${questionId}`,
      blocId,
      semis.texte,
      type,
      semis.options === undefined ? null : JSON.stringify(semis.options),
    ],
  );
  const missionQuestionId = uuidv7();
  await bd().query(
    `INSERT INTO mission_questions (id, mission_id, question_id, question_version, text_snapshot,
                                    options_snapshot, answer_type_snapshot, criticality_snapshot,
                                    position, added_ad_hoc)
     VALUES ($1, $2, $3, 1, $4, $5::jsonb, $6, 'important', $7, false)`,
    [
      missionQuestionId,
      semis.missionId,
      questionId,
      semis.texte,
      semis.options === undefined ? null : JSON.stringify(semis.options),
      type,
      semis.position,
    ],
  );
  return missionQuestionId;
}

async function semerReponse(semis: {
  readonly interviewId: string;
  readonly missionQuestionId: string;
  readonly valeur?: unknown;
  readonly source?: (typeof PROVENANCES)[number];
  readonly nonCommunique?: 'confidentiel' | 'non_disponible' | 'hors_perimetre' | 'autre';
  readonly sansObjet?: string;
  readonly aRevoir?: string;
  readonly horsParcours?: boolean;
  readonly revision?: number;
}): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO answers (id, interview_id, mission_question_id, value, source, withheld,
                          withheld_reason, hors_parcours, flag_review, review_reason,
                          not_applicable, na_reason, revision, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())`,
    [
      id,
      semis.interviewId,
      semis.missionQuestionId,
      semis.valeur === undefined ? null : JSON.stringify(semis.valeur),
      semis.source ?? 'entretien',
      semis.nonCommunique !== undefined,
      semis.nonCommunique ?? null,
      semis.horsParcours ?? false,
      semis.aRevoir !== undefined,
      semis.aRevoir ?? null,
      semis.sansObjet !== undefined,
      semis.sansObjet ?? null,
      semis.revision ?? 1,
    ],
  );
  return id;
}

/** Un cadrage SENTINELLE sur la mission — l'unique porte de test vers les montants. */
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

/**
 * FIL-GC et FIL-TPE, générés UNE fois par suite (8 100 réponses pour FIL-GC) et
 * partagés entre les cas : aucun cas n'y écrit, tous y lisent.
 */
let filGcPartage: Promise<MissionCanonique> | undefined;
function filGc(): Promise<MissionCanonique> {
  filGcPartage ??= genererFilGc(bd());
  return filGcPartage;
}
let filTpePartage: Promise<MissionCanonique> | undefined;
function filTpe(): Promise<MissionCanonique> {
  filTpePartage ??= genererFilTpe(bd());
  return filTpePartage;
}

/** Les identifiants d'unités d'une mission, dans l'ordre du curseur `(position, id)`. */
async function unitesEnBaseDansLOrdre(missionId: string): Promise<readonly string[]> {
  const lignes = await bd().query<{ id: string }>(
    `SELECT id FROM org_units WHERE mission_id = $1 AND status <> 'fusionnee'
      ORDER BY coalesce(position, 2147483647) ASC, id ASC`,
    [missionId],
  );
  return lignes.rows.map((l) => l.id);
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l7b_pilotage');
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
// 1. PAR RÔLE — 200 / 404 / 401, sur les DEUX routes
// =============================================================================
describe('@critique accès par rôle — membre 200, non-membre 404 (jamais 403), anonyme et expiré 401', () => {
  const ROUTES = [
    ['coverage', lireCouverture],
    ['aggregation', lireAgregation],
  ] as const;

  it.each(ROUTES)(
    '@critique %s — un CONSULTANT membre lit (200), un consultant NON MEMBRE reçoit 404 avec le message d’une mission inexistante',
    async (_nom, lire) => {
      // QUELLE IMPLÉMENTATION PLAUSIBLE MAIS FAUSSE CE CAS ATTRAPE-T-IL ? Une
      // route qui lit la mission PUIS vérifie l'appartenance et rend 403 : elle
      // dit au non-membre « cette mission existe, mais pas pour vous ». Le 404
      // ferme l'oracle — à condition que le MESSAGE soit le même que pour une
      // mission qui n'existe pas. On le compare, on ne le suppose pas.
      const admin = await creerCompte('admin', 'role-admin');
      const membre = await creerCompte('consultant', 'role-membre');
      const etranger = await creerCompte('consultant', 'role-etranger');
      const mission = await semerMission();
      await rattacher(mission.id, membre.id, 'consultant');
      await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité du membre' });

      const duMembre = await lire(mission.id, membre.jeton);
      expect(duMembre.statut, duMembre.corps.slice(0, 400)).toBe(200);
      // CONTRÔLE DE VACUITÉ : la réponse porte bien la mission (pas un 200 vide).
      expect(duMembre.corps).toContain(mission.id);

      const deLEtranger = await lire(mission.id, etranger.jeton);
      expect(deLEtranger.statut, `attendu 404, reçu : ${deLEtranger.corps.slice(0, 400)}`).toBe(
        404,
      );
      expect(deLEtranger.code).toBe(ERROR_CODES.NOT_FOUND);
      expect(deLEtranger.corps).not.toContain('Unité du membre');

      const inexistante = await lire(uuidv7(), admin.jeton);
      expect(inexistante.statut).toBe(404);
      expect(
        deLEtranger.message,
        'Le non-membre et la mission inexistante doivent recevoir LE MÊME message :\n' +
          'un message différent rétablirait l’oracle que le 404 ferme.',
      ).toBe(inexistante.message);
      expect(deLEtranger.code).toBe(inexistante.code);
    },
  );

  it.each(ROUTES)(
    '@critique %s — un ADMINISTRATEUR non membre lit (03 §34.1) ; un lead, un analyste, un lecteur membres lisent',
    async (_nom, lire) => {
      const admin = await creerCompte('admin', 'roles-admin');
      const lead = await creerCompte('consultant', 'roles-lead');
      const analyste = await creerCompte('analyste', 'roles-analyste');
      const lecteur = await creerCompte('lecteur', 'roles-lecteur');
      const mission = await semerMission();
      await rattacher(mission.id, lead.id, 'lead');
      await rattacher(mission.id, analyste.id, 'analyste');
      await rattacher(mission.id, lecteur.id, 'lecteur');
      await semerUnite({ missionId: mission.id, effectif: 30 });

      for (const [libelle, compte] of [
        ['admin non membre', admin],
        ['lead', lead],
        ['analyste', analyste],
        ['lecteur', lecteur],
      ] as const) {
        const reponse = await lire(mission.id, compte.jeton);
        expect(reponse.statut, `${libelle} : ${reponse.corps.slice(0, 300)}`).toBe(200);
        expect(reponse.corps).toContain(mission.id);
      }
    },
  );

  it.each(ROUTES)(
    '@critique %s — sans jeton 401 UNAUTHENTICATED ; jeton EXPIRÉ 401 TOKEN_EXPIRED — et aucune donnée dans le corps',
    async (_nom, lire) => {
      const membre = await creerCompte('consultant', 'jeton-membre');
      const mission = await semerMission();
      await rattacher(mission.id, membre.id, 'consultant');
      await semerUnite({
        missionId: mission.id,
        effectif: 30,
        nom: 'Unité jamais servie sans jeton',
      });

      const anonyme = await lire(mission.id, undefined);
      expect(anonyme.statut).toBe(401);
      expect(anonyme.code).toBe(ERROR_CODES.UNAUTHENTICATED);
      expect(anonyme.corps).not.toContain('Unité jamais servie');

      const expire = api().jwt.sign({ sub: membre.id }, { expiresIn: -60 });
      const perime = await lire(mission.id, expire);
      expect(perime.statut).toBe(401);
      expect(perime.code).toBe(ERROR_CODES.TOKEN_EXPIRED);
      expect(perime.corps).not.toContain('Unité jamais servie');
      expect(perime.corps).not.toContain(mission.id);

      // Et le membre, lui, lit toujours : le refus ci-dessus tient au JETON, pas à
      // la mission (contrôle de vacuité).
      expect((await lire(mission.id, membre.jeton)).statut).toBe(200);
    },
  );

  it('@critique toute erreur porte le format unique 11 §3 — code d’ERROR_CODES, message français', async () => {
    const admin = await creerCompte('admin', 'format-admin');
    const mission = await semerMission();
    const reponses = [
      await lireCouverture(mission.id, undefined),
      await lireCouverture(uuidv7(), admin.jeton),
      await lireCouverture(mission.id, admin.jeton, '?limit=0'),
      await lireAgregation(mission.id, admin.jeton, '?after=pas-un-curseur'),
      await lireAgregation(mission.id, admin.jeton, '?orgUnit=pas-un-uuid'),
    ];
    expect(reponses.map((r) => r.statut)).toEqual([401, 404, 400, 400, 400]);
    const connus = new Set<string>(Object.values(ERROR_CODES));
    for (const reponse of reponses) {
      expect(reponse.code, reponse.corps.slice(0, 200)).not.toBeNull();
      expect(connus.has(reponse.code ?? '')).toBe(true);
      expect(reponse.message ?? '').not.toBe('');
      // Français : un accent ou une apostrophe typographique dans chaque message
      // serait trop exigeant ; on refuse au moins un message en anglais de socle.
      expect(reponse.message ?? '').not.toMatch(
        /\b(not found|unauthorized|invalid|bad request)\b/i,
      );
    }
  });
});

// =============================================================================
// 2. ÉTANCHÉITÉ FINANCIÈRE — un cadrage sentinelle sur la mission, tous les rôles
// =============================================================================
describe('@critique étanchéité financière — aucune valeur ni aucun NOM de `scoping_financials` ne sort du pilotage', () => {
  it('@critique consultant, analyste, lecteur membres et administrateur : les deux routes SERVENT (200) et ne portent ni sentinelle ni nom financier', async () => {
    const admin = await creerCompte('admin', 'etanche-admin');
    const consultant = await creerCompte('consultant', 'etanche-consultant');
    const analyste = await creerCompte('analyste', 'etanche-analyste');
    const lecteur = await creerCompte('lecteur', 'etanche-lecteur');
    const mission = await semerMission({ blocsActifs: ['bloc_1'] });
    for (const compte of [consultant, analyste, lecteur]) {
      await rattacher(mission.id, compte.id, 'consultant');
    }
    await semerCadrageSentinelle(mission, admin.id);
    const unite = await semerUnite({ missionId: mission.id, effectif: 120, nom: 'Unité chiffrée' });
    const session = await semerSession({
      missionId: mission.id,
      orgUnitId: unite,
      kind: 'entretien',
      conduitPar: consultant.id,
      fonction: 'Responsable fictif',
    });
    const question = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Quel est le budget annuel de maintenance de cet outil ?',
      position: 1,
      typeReponse: 'money',
    });
    // LA DISTINCTION QU'A32 REMONTE : une réponse d'audit `money` — collectée par
    // le consultant lui-même sur le terrain (`answers.value`, 04 l. 149) — n'est
    // PAS `scoping_financials`. Elle doit SORTIR, avec sa devise.
    await semerReponse({
      interviewId: session,
      missionQuestionId: question,
      valeur: { type: 'money', v: 4200, currency: 'EUR' },
    });

    const porteurs = [
      ['consultant', consultant],
      ['analyste', analyste],
      ['lecteur', lecteur],
      ['admin', admin],
    ] as const;

    for (const [libelle, compte] of porteurs) {
      const cov = await lireCouverture(mission.id, compte.jeton);
      const agg = await lireAgregation(mission.id, compte.jeton);
      // CONTRÔLE DE VACUITÉ : les deux routes ont VRAIMENT rendu la mission.
      expect(cov.statut, `${libelle} couverture : ${cov.corps.slice(0, 300)}`).toBe(200);
      expect(agg.statut, `${libelle} agrégation : ${agg.corps.slice(0, 300)}`).toBe(200);
      expect(cov.corps).toContain('Unité chiffrée');
      expect(agg.corps).toContain('4200 EUR');
      expect(agg.corps).toContain('Responsable fictif');

      for (const [route, corps] of [
        ['coverage', cov.corps],
        ['aggregation', agg.corps],
      ] as const) {
        expect(
          detecterSentinelles(corps),
          `${libelle} / ${route} : une SENTINELLE financière est sortie.`,
        ).toEqual([]);
        const cles = clesDuJson(JSON.parse(corps));
        const nomsPresents = NOMS_FINANCIERS_INTERDITS.filter(
          (nom) => cles.has(nom) || corps.includes(nom),
        );
        expect(
          nomsPresents,
          `${libelle} / ${route} : un NOM de champ financier apparaît (même à null, un\n` +
            'champ qui existe finit par être rempli).',
        ).toEqual([]);
      }
    }
  });

  it('@critique CONTRE-ÉPREUVE — la sentinelle MORD sur un montant glissé dans une valeur lisible, et ne mord PAS sur une réponse d’audit `money` ordinaire', () => {
    // Un balayage dont on n'a jamais vu la morsure ne prouve rien. On fabrique
    // une agrégation qui aurait laissé passer le total sentinelle dans
    // `valeurLisible`, et on exige que le détecteur le voie — avec et sans devise.
    const [total] = VALEURS_SENTINELLES;
    expect(total).toBeDefined();
    const fuite = JSON.stringify({ valeurLisible: `${total ?? ''} EUR` });
    expect(detecterSentinelles(fuite)).toEqual([total]);
    const fuiteFrancaise = JSON.stringify({ valeurLisible: (total ?? '').replace('.', ',') });
    expect(detecterSentinelles(fuiteFrancaise)).toEqual([total]);

    // Et la réponse d'audit ordinaire — un `money` avec sa devise — reste muette :
    // c'est la distinction `answers.value` ≠ `scoping_financials`, mesurée.
    const ordinaire = JSON.stringify({ valeurLisible: '4200 EUR', typeReponse: 'money' });
    expect(detecterSentinelles(ordinaire)).toEqual([]);
    expect(NOMS_FINANCIERS_INTERDITS.filter((nom) => ordinaire.includes(nom))).toEqual([]);
    // La liste des noms interdits porte la TABLE et ses colonnes de montants ; elle
    // ne porte pas le mot `money` ni `currency`, et c'est délibéré (scoping.ts) :
    // un garde-fou qui crierait sur la devise d'une réponse d'audit finirait désarmé.
    expect(NOMS_FINANCIERS_INTERDITS).not.toContain('money');
    expect(NOMS_FINANCIERS_INTERDITS).not.toContain('currency');
  });

  it('@critique balayage sentinelle du dépôt sur les DEUX gabarits du pilotage, avec des porteurs non administrateurs et une mission réellement semée', async () => {
    const admin = await creerCompte('admin', 'balayage-admin');
    const consultant = await creerCompte('consultant', 'balayage-consultant');
    const analyste = await creerCompte('analyste', 'balayage-analyste');
    const lecteur = await creerCompte('lecteur', 'balayage-lecteur');
    const mission = await semerMission();
    for (const compte of [consultant, analyste, lecteur]) {
      await rattacher(mission.id, compte.id, 'consultant');
    }
    await semerCadrageSentinelle(mission, admin.id);
    await semerUnite({ missionId: mission.id, effectif: 60 });

    const registre: readonly EntreeRegistreAcces[] = api().registreAcces;
    // Dédoublonné : le registre porte une entrée par MÉTHODE (GET et HEAD), le
    // gabarit, lui, est le même.
    const gabarits = [
      ...new Set(
        registre
          .map((entree) => entree.url)
          .filter((url) => url.endsWith('/coverage') || url.endsWith('/aggregation')),
      ),
    ];
    expect(
      gabarits.map((g) => g.replace(/:[A-Za-z0-9_]+/g, ':param')).sort(),
      'Les deux gabarits du pilotage doivent être MONTÉS et enregistrés avec leur politique.',
    ).toEqual(['/v1/missions/:param/aggregation', '/v1/missions/:param/coverage']);

    const cartographie: Record<string, Record<string, string>> = {};
    for (const gabarit of gabarits) {
      const parametres: Record<string, string> = {};
      for (const nom of parametresDuGabarit(gabarit)) parametres[nom] = mission.id;
      cartographie[gabarit] = parametres;
    }

    const rapport = await balayerSentinellesFinancieres({
      app: api(),
      porteurs: {
        consultant: consultant.jeton,
        analyste: analyste.jeton,
        lecteur: lecteur.jeton,
        anonyme: null,
      },
      cartographieDeParametres: cartographie satisfies CartographieDeParametres,
    });

    expect(
      rapport.fuites,
      `Une route a laissé sortir un montant :\n${decrireRapport(rapport)}`,
    ).toEqual([]);
    const appelsDuLot = rapport.appels.filter((a) => gabarits.includes(a.gabarit));
    // Trois porteurs membres → EXERCÉ (2xx et corps lu) ; l'anonyme → REFUSÉ.
    // Un `non_exerce` ici (404 pour tous) rendrait le vert sans valeur.
    for (const appel of appelsDuLot) {
      expect(
        appel.issue,
        `${appel.porteur} ${appel.methode} ${appel.gabarit} → ${String(appel.statut)} (${appel.issue})`,
      ).toBe(appel.porteur === 'anonyme' ? 'refus' : 'exerce');
    }
    expect(appelsDuLot.filter((a) => a.issue === 'exerce').length).toBeGreaterThanOrEqual(6);
  });
});

// =============================================================================
// 3. LE NOM DU RÉPONDANT NE SORT JAMAIS — décision conservatoire du 2026-09-05
// =============================================================================
describe('@critique le nom du répondant n’apparaît nulle part dans l’agrégation', () => {
  it('@critique `person_name` et `person_email` sont absents — en VALEUR et en CLÉ — pour le consultant ET pour l’administrateur ; la fonction et le service, eux, sont rendus', async () => {
    const admin = await creerCompte('admin', 'nom-admin');
    const consultant = await creerCompte('consultant', 'nom-consultant');
    const mission = await semerMission({ blocsActifs: ['bloc_1'] });
    await rattacher(mission.id, consultant.id, 'consultant');
    const unite = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité nommée' });
    const session = await semerSession({
      missionId: mission.id,
      orgUnitId: unite,
      kind: 'entretien',
      conduitPar: consultant.id,
      nomPersonne: NOM_REPONDANT_SENTINELLE,
      courrielPersonne: COURRIEL_REPONDANT_SENTINELLE,
      fonction: 'Responsable logistique fictif',
      serviceCode: 'logistique_operations',
    });
    const question = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question nominative ?',
      position: 1,
    });
    const answerId = await semerReponse({
      interviewId: session,
      missionQuestionId: question,
      valeur: { type: 'yes_no', v: 'oui' },
    });

    for (const [libelle, compte] of [
      ['consultant', consultant],
      ['admin', admin],
    ] as const) {
      const reponse = await lireAgregation(mission.id, compte.jeton);
      const agg = agregation(reponse);
      // CONTRÔLE DE VACUITÉ : LA réponse de cette session est bien dans la page.
      const ligne = agg.questions[0]?.reponses.find((r) => r.answerId === answerId);
      expect(ligne, `${libelle} : la réponse semée n’est pas rendue`).toBeDefined();
      expect(ligne?.interviewId).toBe(session);
      expect(ligne?.fonctionRepondant).toBe('Responsable logistique fictif');
      expect(ligne?.serviceRepondant).toBe('Logistique / opérations');
      expect(ligne?.orgUnitNom).toBe('Unité nommée');

      // L'ASSERTION NÉGATIVE — valeurs ET clés, dans tout le corps sérialisé.
      expect(reponse.corps, `${libelle} : le NOM du répondant a fui`).not.toContain(
        NOM_REPONDANT_SENTINELLE,
      );
      expect(reponse.corps).not.toContain('Zxqv');
      expect(reponse.corps, `${libelle} : le COURRIEL du répondant a fui`).not.toContain(
        COURRIEL_REPONDANT_SENTINELLE,
      );
      const cles = clesDuJson(JSON.parse(reponse.corps));
      for (const cle of [
        'person_name',
        'personName',
        'person_email',
        'personEmail',
        'nomRepondant',
      ]) {
        expect(cles.has(cle), `${libelle} : la clé « ${cle} » existe dans la réponse`).toBe(false);
      }
    }
  });

  it('@critique la couverture non plus ne nomme personne — elle compte des sessions', async () => {
    const consultant = await creerCompte('consultant', 'nom-couv');
    const mission = await semerMission();
    await rattacher(mission.id, consultant.id, 'consultant');
    const unite = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité comptée' });
    await semerSession({
      missionId: mission.id,
      orgUnitId: unite,
      kind: 'entretien',
      conduitPar: consultant.id,
      nomPersonne: NOM_REPONDANT_SENTINELLE,
      courrielPersonne: COURRIEL_REPONDANT_SENTINELLE,
    });
    const reponse = await lireCouverture(mission.id, consultant.jeton);
    const cov = couverture(reponse);
    expect(cellule(cov.unites[0] ?? { parSource: [] }, 'entretien').realise).toBe(1);
    expect(reponse.corps).not.toContain('Zxqv');
    expect(reponse.corps).not.toContain(COURRIEL_REPONDANT_SENTINELLE);
  });
});

// =============================================================================
// 4. KEYSET DE BOUT EN BOUT — FIL-GC, 150 unités, 135 questions
// =============================================================================
describe('@critique keyset — FIL-GC : trois pages de 50 exactement, ni doublon ni saut, marges et totaux identiques', () => {
  it('@critique coverage — 150 unités en 3 pages, ordre de l’arbre `(position, id)`, marges identiques page 1 et page 3', async () => {
    const admin = await creerCompte('admin', 'keyset-admin');
    const gc = await filGc();
    expect(gc.unites).toBe(FIL_GC.unites);

    const pages: Couverture[] = [];
    let curseur: string | null = null;
    const debut = performance.now();
    do {
      const query =
        curseur === null ? '?limit=50' : `?limit=50&after=${encodeURIComponent(curseur)}`;
      const page = couverture(await lireCouverture(gc.missionId, admin.jeton, query));
      pages.push(page);
      curseur = page.nextCursor;
      if (pages.length > 10) throw new Error('la pagination ne termine pas');
    } while (curseur !== null);
    const duree = performance.now() - debut;

    expect(
      pages.map((p) => p.unites.length),
      'exactement 50 + 50 + 50',
    ).toEqual([50, 50, 50]);
    expect(pages.map((p) => p.nextCursor === null)).toEqual([false, false, true]);
    const ids = pages.flatMap((p) => p.unites.map((u) => u.orgUnitId));
    expect(new Set(ids).size, 'aucune unité dupliquée d’une page à l’autre').toBe(150);
    expect(ids, 'l’ordre est celui de l’arbre, et rien n’est sauté').toEqual(
      await unitesEnBaseDansLOrdre(gc.missionId),
    );

    // LES MARGES NE SE CALCULENT PAS SUR LA PAGE — identiques de bout en bout.
    const [premiere, , troisieme] = pages;
    expect(premiere?.marges).toBeDefined();
    expect(troisieme?.marges).toStrictEqual(premiere?.marges);
    expect(premiere?.blocsActifs).toStrictEqual(troisieme?.blocsActifs);
    expect(premiere?.marges.unitesInScope).toBe(150);
    // 60 sessions sur 60 services : 90 unités du périmètre n'ont AUCUNE session.
    expect(premiere?.marges.unitesSansAucuneSession).toBe(150 - FIL_GC.entretiens);
    expect(premiere?.marges.atelierRealise, 'l’atelier ne se tait pas, même à zéro').toBe(0);
    expect(pages.flatMap((p) => p.unites).filter((u) => u.aucuneSession)).toHaveLength(
      150 - FIL_GC.entretiens,
    );

    // Le curseur est OPAQUE : il ne ressemble ni à un nombre ni à `page=`.
    const curseurPage1 = premiere?.nextCursor ?? '';
    expect(curseurPage1).not.toMatch(/^\d+$/);
    expect(curseurPage1).not.toMatch(/offset|page=|skip/i);

    // Ordre de grandeur RAPPORTÉ, pas asserté : ce poste tourne sous Node 24, hors
    // contrat (11 §1) ; le p95 < 100 ms se mesure en CI avec A28.
    expect(duree).toBeGreaterThan(0);
  });

  it('@critique aggregation — 135 questions figées de FIL-GC en 3 pages (50, 50, 35), 60 réponses par question, totaux identiques d’une page à l’autre', async () => {
    const admin = await creerCompte('admin', 'keyset-agg-admin');
    const gc = await filGc();

    const pages: Agregation[] = [];
    let curseur: string | null = null;
    do {
      const query =
        curseur === null ? '?limit=50' : `?limit=50&after=${encodeURIComponent(curseur)}`;
      const page = agregation(await lireAgregation(gc.missionId, admin.jeton, query));
      pages.push(page);
      curseur = page.nextCursor;
      if (pages.length > 10) throw new Error('la pagination ne termine pas');
    } while (curseur !== null);

    expect(pages.map((p) => p.questions.length)).toEqual([50, 50, 35]);
    const ids = pages.flatMap((p) => p.questions.map((q) => q.missionQuestionId));
    expect(new Set(ids).size).toBe(FIL_GC.questions);
    // Les réponses d'une question voyagent AVEC elle : 60 sessions → 60 réponses chacune.
    for (const question of pages.flatMap((p) => p.questions)) {
      expect(question.comptes.posee).toBe(FIL_GC.entretiens);
      expect(question.reponses).toHaveLength(FIL_GC.entretiens);
    }
    const [premiere, , troisieme] = pages;
    expect(troisieme?.totaux).toStrictEqual(premiere?.totaux);
    expect(premiere?.totaux.questions).toBe(FIL_GC.questions);
    expect(premiere?.totaux.reponses).toBe(FIL_GC.reponses);
    expect(premiere?.totaux.questionsSansReponse).toBe(0);
  });

  it('@critique un curseur invalide rend 400 INVALID_CURSOR ; le curseur d’UNE AUTRE ressource aussi (le curseur est signé de sa ressource)', async () => {
    const admin = await creerCompte('admin', 'curseur-admin');
    const mission = await semerMission();
    for (let i = 0; i < 3; i += 1) await semerUnite({ missionId: mission.id, effectif: 20 });
    for (let i = 0; i < 3; i += 1) {
      await semerQuestionFigee({
        missionId: mission.id,
        blocCode: 'bloc_1',
        texte: `Question ${String(i + 1)} ?`,
        position: i + 1,
      });
    }

    for (const lire of [lireCouverture, lireAgregation]) {
      const invalide = await lire(mission.id, admin.jeton, '?after=n-importe-quoi');
      expect(invalide.statut).toBe(400);
      expect(invalide.code).toBe(ERROR_CODES.INVALID_CURSOR);
      const chiffre = await lire(mission.id, admin.jeton, '?after=2');
      expect(chiffre.statut, 'un décalage numérique n’est pas un curseur').toBe(400);
    }

    // Le curseur de la couverture (unités) ne vaut rien pour l'agrégation (questions).
    const page1 = couverture(await lireCouverture(mission.id, admin.jeton, '?limit=2'));
    expect(page1.nextCursor).not.toBeNull();
    const croise = await lireAgregation(
      mission.id,
      admin.jeton,
      `?limit=2&after=${encodeURIComponent(page1.nextCursor ?? '')}`,
    );
    expect(croise.statut).toBe(400);
    expect(croise.code).toBe(ERROR_CODES.INVALID_CURSOR);

    // Et le curseur LÉGITIME reprend exactement où la page précédente s'arrête.
    const page2 = couverture(
      await lireCouverture(
        mission.id,
        admin.jeton,
        `?limit=2&after=${encodeURIComponent(page1.nextCursor ?? '')}`,
      ),
    );
    expect(page2.unites).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect([...page1.unites, ...page2.unites].map((u) => u.orgUnitId)).toEqual(
      await unitesEnBaseDansLOrdre(mission.id),
    );
  });
});

// =============================================================================
// 5. LA COUVERTURE REFLÈTE LE PLAN — critère du 07, ligne L7-min
// =============================================================================
describe('@critique « la couverture reflète le plan d’entretiens » — le prévu est CELUI de `etablirLePlanDEntretiens`', () => {
  /** Le plan de L3, appelé DIRECTEMENT — la référence contre laquelle la route est jugée. */
  async function planDeReference(missionId: string, adminId: string) {
    const { etablirLePlanDEntretiens } = await import('../src/domaines/plan-entretiens/service.js');
    return etablirLePlanDEntretiens(missionId, { utilisateurId: adminId, estAdmin: true });
  }

  async function verifierContreLePlan(missionId: string, admin: Compte): Promise<number> {
    const plan = await planDeReference(missionId, admin.id);
    const cibles = new Map(plan.parUnite.map((cible) => [cible.orgUnitId, cible]));

    const unites: UniteCouverte[] = [];
    let curseur: string | null = null;
    do {
      const query =
        curseur === null ? '?limit=50' : `?limit=50&after=${encodeURIComponent(curseur)}`;
      const page = couverture(await lireCouverture(missionId, admin.jeton, query));
      unites.push(...page.unites);
      curseur = page.nextCursor;
    } while (curseur !== null);

    let comparees = 0;
    for (const unite of unites) {
      const cible = cibles.get(unite.orgUnitId);
      if (cible === undefined) {
        expect(unite.inScope, 'une unité absente du plan est hors périmètre').toBe(false);
        continue;
      }
      comparees += 1;
      expect(cellule(unite, 'entretien').prevu, `${unite.nom} : prévu entretien ≠ plan`).toEqual({
        min: cible.entretiens.min,
        max: cible.entretiens.max,
      });
      for (const kind of SOURCES_27_1.filter((k) => k !== 'entretien')) {
        const complementaire = cible.sessionsComplementaires.find((s) => s.kind === kind);
        const attendu = complementaire === undefined ? 0 : complementaire.nombre;
        expect(cellule(unite, kind).prevu, `${unite.nom} : prévu ${kind} ≠ plan`).toEqual({
          min: attendu,
          max: attendu,
        });
      }
      expect(unite.sourcesAttendues).toBe(
        (cible.entretiens.min > 0 ? 1 : 0) +
          cible.sessionsComplementaires.filter((s) => s.nombre > 0).length,
      );
    }
    return comparees;
  }

  it('@critique FIL-TPE — 1 unité, 8 personnes : prévu {1, 2} entretiens, rien d’autre ; 1 entretien tenu → couvert', async () => {
    const admin = await creerCompte('admin', 'plan-tpe');
    const tpe = await filTpe();
    expect(await verifierContreLePlan(tpe.missionId, admin)).toBe(1);

    const cov = couverture(await lireCouverture(tpe.missionId, admin.jeton));
    const unite = cov.unites[0];
    expect(unite).toBeDefined();
    expect(unite?.effectif).toBe(FIL_TPE.effectif);
    const entretien = cellule(unite ?? { parSource: [] }, 'entretien');
    expect(entretien).toEqual({
      kind: 'entretien',
      prevu: { min: 1, max: 2 },
      planifie: 1,
      realise: 1,
      couvert: true,
    });
    expect(unite?.sourcesCouvertes).toBe(1);
    expect(unite?.sourcesAttendues).toBe(1);
    expect(unite?.aucuneSession).toBe(false);
    expect(cov.marges.unitesSansAucuneSession).toBe(0);
    // LES CINQ, TOUJOURS — même quand le plan n'en exige qu'une.
    expect(unite?.parSource.map((c) => c.kind)).toEqual([...SOURCES_27_1]);
    expect(cov.marges.parSource.map((c) => c.kind)).toEqual([...SOURCES_27_1]);
  });

  it('@critique FIL-GC — 150 unités de 80 personnes : prévu {4, 6} entretiens + 1 observation, sur CHAQUE unité ; 60 entretiens tenus, aucune observation → rien n’est couvert', async () => {
    const admin = await creerCompte('admin', 'plan-gc');
    const gc = await filGc();
    expect(await verifierContreLePlan(gc.missionId, admin)).toBe(FIL_GC.unites);

    const cov = couverture(await lireCouverture(gc.missionId, admin.jeton, '?limit=50'));
    // La MARGE dit la mission entière : 150 × 4 = 600 entretiens minimum, 150 observations.
    expect(cellule(cov.marges, 'entretien').prevu).toEqual({ min: 600, max: 900 });
    expect(cellule(cov.marges, 'entretien').realise).toBe(FIL_GC.entretiens);
    expect(cellule(cov.marges, 'entretien').couvert).toBe(false);
    expect(cellule(cov.marges, 'observation')).toEqual({
      kind: 'observation',
      prevu: { min: 150, max: 150 },
      planifie: 0,
      realise: 0,
      couvert: false,
    });
  });

  it('@critique le prévu SUIT le plan : un effectif qui passe de 80 à 300 personnes fait passer le prévu à {6, 10} + observation + démonstration + relevé — le même que le plan relu', async () => {
    const admin = await creerCompte('admin', 'plan-suit');
    const mission = await semerMission();
    const unite = await semerUnite({
      missionId: mission.id,
      effectif: 80,
      nom: 'Unité qui grandit',
    });

    const avant = couverture(await lireCouverture(mission.id, admin.jeton)).unites[0];
    expect(avant?.parSource.map((c) => [c.kind, c.prevu.min, c.prevu.max])).toEqual([
      ['entretien', 4, 6],
      ['observation', 1, 1],
      ['demonstration', 0, 0],
      ['analyse_documentaire', 0, 0],
      ['releve_donnees', 0, 0],
    ]);

    await bd().query('UPDATE org_units SET headcount = 300 WHERE id = $1', [unite]);
    const apres = couverture(await lireCouverture(mission.id, admin.jeton)).unites[0];
    expect(apres?.parSource.map((c) => [c.kind, c.prevu.min, c.prevu.max])).toEqual([
      ['entretien', 6, 10],
      ['observation', 1, 1],
      ['demonstration', 1, 1],
      ['analyse_documentaire', 0, 0],
      ['releve_donnees', 1, 1],
    ]);
    const plan = await planDeReference(mission.id, admin.id);
    expect(plan.parUnite[0]?.entretiens).toEqual({ min: 6, max: 10 });
    expect(apres?.sourcesAttendues).toBe(4);
  });
});

// =============================================================================
// 6. LES DEUX FIXTURES SYMÉTRIQUES DE `LOT_L7.md` §6.5 — PAR LA ROUTE
// =============================================================================
describe('@critique les deux fixtures symétriques — un build qui n’a qu’un axe échoue à l’une des deux', () => {
  /** Dix unités de 300 personnes : le plan exige 6-10 entretiens + observation + démonstration + relevé. */
  async function dixUnites(missionId: string): Promise<readonly string[]> {
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      ids.push(
        await semerUnite({
          missionId,
          effectif: 300,
          nom: `Unité ${String(i + 1)}`,
          position: i + 1,
        }),
      );
    }
    return ids;
  }

  it('@critique « TOUT EN ENTRETIENS » — axe A entièrement couvert (aucune alerte), axe B en défaut sur observation, démonstration et relevé — et un atelier ne comble rien', async () => {
    const admin = await creerCompte('admin', 'sym-a');
    const consultant = await creerCompte('consultant', 'sym-a-c');
    const mission = await semerMission();
    const unites = await dixUnites(mission.id);
    for (const unite of unites) {
      for (let n = 0; n < 6; n += 1) {
        await semerSession({
          missionId: mission.id,
          orgUnitId: unite,
          kind: 'entretien',
          conduitPar: consultant.id,
        });
      }
    }
    // Un atelier tenu sur la première unité : visible hors grille, il ne comble
    // aucune source (§9.3 de la note : un atelier ne remplace pas une observation).
    await semerSession({
      missionId: mission.id,
      orgUnitId: unites[0] ?? '',
      kind: KIND_ATELIER,
      conduitPar: consultant.id,
    });

    const cov = couverture(await lireCouverture(mission.id, admin.jeton));
    expect(cov.unites).toHaveLength(10);

    // AXE A — chaque unité a été auditée : aucune alerte §16.6.
    expect(cov.unites.every((u) => !u.aucuneSession)).toBe(true);
    expect(cov.marges.unitesSansAucuneSession).toBe(0);

    // AXE B — l'entretien est couvert partout, les trois autres sources exigées ne
    // le sont NULLE PART. Un build qui n'a que l'axe A dirait « complet » ici.
    for (const unite of cov.unites) {
      expect(cellule(unite, 'entretien')).toMatchObject({
        prevu: { min: 6, max: 10 },
        realise: 6,
        couvert: true,
      });
      for (const kind of ['observation', 'demonstration', 'releve_donnees'] as const) {
        expect(cellule(unite, kind), `${unite.nom} ${kind}`).toMatchObject({
          prevu: { min: 1 },
          realise: 0,
          couvert: false,
        });
      }
      expect(cellule(unite, 'analyse_documentaire')).toMatchObject({
        prevu: { min: 0, max: 0 },
        realise: 0,
        couvert: true,
      });
      expect(unite.sourcesAttendues).toBe(4);
      expect(unite.sourcesCouvertes, `${unite.nom} : l’atelier ne doit combler aucune source`).toBe(
        1,
      );
    }
    expect(cov.unites[0]?.atelierRealise).toBe(1);
    expect(cov.unites[1]?.atelierRealise).toBe(0);
    expect(cov.marges.atelierRealise).toBe(1);
    expect(cellule(cov.marges, 'entretien')).toMatchObject({
      prevu: { min: 60, max: 100 },
      realise: 60,
      couvert: true,
    });
    expect(cellule(cov.marges, 'observation')).toMatchObject({
      prevu: { min: 10, max: 10 },
      realise: 0,
      couvert: false,
    });
  });

  it('@critique « TOUT SUR UNE UNITÉ » — les six types présents dans la marge, axe A en défaut sur neuf unités avec l’alerte §16.6', async () => {
    const admin = await creerCompte('admin', 'sym-b');
    const consultant = await creerCompte('consultant', 'sym-b-c');
    const mission = await semerMission();
    const unites = await dixUnites(mission.id);
    const elue = unites[0] ?? '';
    for (let n = 0; n < 6; n += 1) {
      await semerSession({
        missionId: mission.id,
        orgUnitId: elue,
        kind: 'entretien',
        conduitPar: consultant.id,
      });
    }
    for (const kind of [
      'observation',
      'demonstration',
      'analyse_documentaire',
      'releve_donnees',
      KIND_ATELIER,
    ] as const) {
      await semerSession({
        missionId: mission.id,
        orgUnitId: elue,
        kind,
        conduitPar: consultant.id,
      });
    }

    const cov = couverture(await lireCouverture(mission.id, admin.jeton));
    expect(cov.unites).toHaveLength(10);

    // AXE B, en MARGE — les cinq sources ont au moins un réalisé, l'atelier aussi.
    for (const kind of SOURCES_27_1) {
      expect(cellule(cov.marges, kind).realise, `marge ${kind}`).toBeGreaterThanOrEqual(1);
    }
    expect(cov.marges.atelierRealise).toBe(1);
    // …mais la mission entière n'est PAS couverte : 6 entretiens sur 60 exigés.
    expect(cellule(cov.marges, 'entretien')).toMatchObject({
      prevu: { min: 60 },
      realise: 6,
      couvert: false,
    });

    // AXE A — neuf unités sans aucune session, alerte comprise ; l'élue est complète.
    const [premiere, ...autres] = cov.unites;
    expect(premiere?.orgUnitId).toBe(elue);
    expect(premiere?.aucuneSession).toBe(false);
    expect(premiere?.sourcesCouvertes).toBe(4);
    expect(premiere?.sourcesAttendues).toBe(4);
    expect(premiere?.atelierRealise).toBe(1);
    expect(autres).toHaveLength(9);
    for (const unite of autres) {
      expect(unite.aucuneSession, `${unite.nom} doit porter l’alerte §16.6`).toBe(true);
      expect(unite.sourcesCouvertes).toBe(0);
      expect(unite.parSource.every((c) => c.realise === 0 && c.planifie === 0)).toBe(true);
    }
    expect(cov.marges.unitesSansAucuneSession).toBe(9);
  });

  it('@critique « planifié » compte planifie ∪ confirme ∪ realise, « réalisé » ne compte que `status = termine`, et l’alerte ignore annulé/reporté (DECISIONS 2026-09-05)', async () => {
    const admin = await creerCompte('admin', 'agenda');
    const consultant = await creerCompte('consultant', 'agenda-c');
    const mission = await semerMission();
    const u = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité agenda' });
    const v = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité annulée' });
    const w = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité à planifier' });
    const base = {
      missionId: mission.id,
      orgUnitId: u,
      kind: 'entretien',
      conduitPar: consultant.id,
    } as const;
    await semerSession({ ...base, agenda: 'planifie', statut: 'non_demarre' });
    await semerSession({ ...base, agenda: 'confirme', statut: 'non_demarre' });
    await semerSession({ ...base, agenda: 'realise', statut: 'en_cours' });
    await semerSession({ ...base, agenda: 'realise', statut: 'termine' });
    await semerSession({ ...base, agenda: 'annule', statut: 'non_demarre' });
    await semerSession({ ...base, agenda: 'reporte', statut: 'non_demarre' });
    await semerSession({ ...base, orgUnitId: v, agenda: 'annule', statut: 'non_demarre' });
    await semerSession({ ...base, orgUnitId: w, agenda: 'a_planifier', statut: 'non_demarre' });

    const cov = couverture(await lireCouverture(mission.id, admin.jeton));
    const [agenda, annulee, aPlanifier] = cov.unites;
    expect(cellule(agenda ?? { parSource: [] }, 'entretien')).toMatchObject({
      planifie: 4,
      realise: 1,
      couvert: false,
    });
    expect(agenda?.aucuneSession).toBe(false);
    expect(annulee?.aucuneSession, 'une session annulée ne retire pas l’alerte').toBe(true);
    expect(aPlanifier?.aucuneSession, 'une session à planifier n’est pas un oubli').toBe(false);
    expect(cellule(aPlanifier ?? { parSource: [] }, 'entretien')).toMatchObject({
      planifie: 0,
      realise: 0,
    });
  });

  it('@critique blocs non couverts : une réponse « non communiquée » COMPTE comme bloc abordé (DECISIONS 2026-09-05) ; une unité hors périmètre est rendue, sans prévu ni alerte', async () => {
    const admin = await creerCompte('admin', 'blocs');
    const consultant = await creerCompte('consultant', 'blocs-c');
    const mission = await semerMission({ blocsActifs: ['bloc_1', 'bloc_2', 'bloc_3'] });
    const u = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité abordée' });
    const hors = await semerUnite({
      missionId: mission.id,
      effectif: 400,
      nom: 'Unité sortie',
      dansLePerimetre: false,
    });
    const session = await semerSession({
      missionId: mission.id,
      orgUnitId: u,
      kind: 'entretien',
      conduitPar: consultant.id,
    });
    const q1 = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Q bloc 1 ?',
      position: 1,
    });
    const q2 = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_2',
      texte: 'Q bloc 2 ?',
      position: 2,
    });
    await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_3',
      texte: 'Q bloc 3 ?',
      position: 3,
    });
    await semerReponse({
      interviewId: session,
      missionQuestionId: q1,
      valeur: { type: 'yes_no', v: 'oui' },
    });
    await semerReponse({
      interviewId: session,
      missionQuestionId: q2,
      nonCommunique: 'confidentiel',
    });

    const cov = couverture(await lireCouverture(mission.id, admin.jeton));
    expect(cov.blocsActifs).toEqual(['bloc_1', 'bloc_2', 'bloc_3']);
    const abordee = cov.unites.find((x) => x.orgUnitId === u);
    expect(abordee?.blocsNonCouverts, 'bloc_2 a été ABORDÉ (refus), seul bloc_3 manque').toEqual([
      'bloc_3',
    ]);
    const sortie = cov.unites.find((x) => x.orgUnitId === hors);
    expect(sortie?.inScope).toBe(false);
    expect(sortie?.aucuneSession, 'hors périmètre : jamais d’alerte').toBe(false);
    expect(sortie?.parSource.every((c) => c.prevu.min === 0 && c.prevu.max === 0)).toBe(true);
    expect(cov.marges.unitesHorsPerimetre).toBe(1);
    expect(cov.marges.unitesInScope).toBe(1);
  });
});

// =============================================================================
// 7. L'AGRÉGATION — quatre situations, provenance ≠ type de session, filtres
// =============================================================================
describe('@critique agrégation par question — les quatre situations du §27.4 séparées jusqu’au bout, provenance visible', () => {
  interface Scene {
    readonly mission: MissionSemee;
    readonly admin: Compte;
    readonly u1: string;
    readonly u2: string;
    readonly qRenseignee: string;
    readonly qRefusee: string;
    readonly qSansObjet: string;
    readonly qJamaisPosee: string;
    readonly qChoix: string;
  }

  async function scene(): Promise<Scene> {
    const admin = await creerCompte('admin', 'agg-admin');
    const consultant = await creerCompte('consultant', 'agg-c');
    const mission = await semerMission({
      blocsActifs: ['bloc_1', 'bloc_2'],
      timezone: 'America/Los_Angeles',
    });
    await rattacher(mission.id, consultant.id, 'consultant');
    const u1 = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité Alpha' });
    const u2 = await semerUnite({ missionId: mission.id, effectif: 30, nom: 'Unité Bêta' });
    const entretien = await semerSession({
      missionId: mission.id,
      orgUnitId: u1,
      kind: 'entretien',
      conduitPar: consultant.id,
      fonction: 'Directeur fictif',
      serviceCode: 'direction_generale',
    });
    // Une session d'OBSERVATION dont la réponse porte la provenance `document` :
    // type de session ≠ provenance, et les deux doivent se lire séparément.
    const observation = await semerSession({
      missionId: mission.id,
      orgUnitId: u2,
      kind: 'observation',
      conduitPar: consultant.id,
    });
    const qRenseignee = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question renseignée ?',
      position: 1,
    });
    const qRefusee = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question refusée ?',
      position: 2,
    });
    const qSansObjet = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_1',
      texte: 'Question sans objet ?',
      position: 3,
    });
    const qJamaisPosee = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_2',
      texte: 'Question jamais posée ?',
      position: 4,
    });
    const qChoix = await semerQuestionFigee({
      missionId: mission.id,
      blocCode: 'bloc_2',
      texte: 'Quel outil ?',
      position: 5,
      typeReponse: 'single_choice',
      options: [
        { code: 'erp', label: 'Progiciel de gestion' },
        { code: 'tableur', label: 'Tableur' },
      ],
    });

    await semerReponse({
      interviewId: entretien,
      missionQuestionId: qRenseignee,
      valeur: { type: 'yes_no', v: 'oui' },
    });
    await semerReponse({
      interviewId: observation,
      missionQuestionId: qRenseignee,
      valeur: { type: 'yes_no', v: 'non' },
      source: 'document',
      aRevoir: 'Contredit la procédure écrite',
      revision: 2,
    });
    await semerReponse({
      interviewId: entretien,
      missionQuestionId: qRefusee,
      nonCommunique: 'confidentiel',
    });
    await semerReponse({
      interviewId: entretien,
      missionQuestionId: qSansObjet,
      sansObjet: 'Aucune flotte de véhicules',
    });
    await semerReponse({
      interviewId: entretien,
      missionQuestionId: qChoix,
      valeur: { type: 'single_choice', v: 'erp' },
      horsParcours: true,
    });

    return { mission, admin, u1, u2, qRenseignee, qRefusee, qSansObjet, qJamaisPosee, qChoix };
  }

  it('@critique renseignée / non communiquée + motif / sans objet + motif / JAMAIS POSÉE : quatre comptes différents, et les totaux les disent', async () => {
    const s = await scene();
    const agg = agregation(await lireAgregation(s.mission.id, s.admin.jeton));
    expect(agg.questions.map((q) => q.missionQuestionId)).toEqual([
      s.qRenseignee,
      s.qRefusee,
      s.qSansObjet,
      s.qJamaisPosee,
      s.qChoix,
    ]);
    const [renseignee, refusee, sansObjet, jamaisPosee, choix] = agg.questions;

    expect(renseignee?.comptes).toMatchObject({
      posee: 2,
      renseignees: 2,
      nonCommuniquees: 0,
      sansObjet: 0,
      aRevoir: 1,
      unitesTouchees: 2,
    });
    expect(refusee?.comptes).toMatchObject({
      posee: 1,
      renseignees: 0,
      nonCommuniquees: 1,
      sansObjet: 0,
    });
    expect(refusee?.reponses[0]).toMatchObject({
      nonCommunique: true,
      motifNonCommunique: 'confidentiel',
      sansObjet: false,
      valeurLisible: null,
    });
    expect(sansObjet?.comptes).toMatchObject({
      posee: 1,
      renseignees: 0,
      nonCommuniquees: 0,
      sansObjet: 1,
    });
    expect(sansObjet?.reponses[0]).toMatchObject({
      sansObjet: true,
      motifSansObjet: 'Aucune flotte de véhicules',
      nonCommunique: false,
      valeurLisible: null,
    });
    // LE QUATRIÈME CAS — aucune ligne : ni refus, ni sans objet, ni renseignée.
    expect(jamaisPosee?.comptes).toMatchObject({
      posee: 0,
      renseignees: 0,
      nonCommuniquees: 0,
      sansObjet: 0,
    });
    expect(jamaisPosee?.reponses).toEqual([]);
    // Le choix est rendu par son LIBELLÉ, jamais par son code ; hors parcours badgé.
    expect(choix?.reponses[0]).toMatchObject({
      valeurLisible: 'Progiciel de gestion',
      horsParcours: true,
    });

    expect(agg.totaux).toMatchObject({
      questions: 5,
      questionsSansReponse: 1,
      reponses: 5,
      nonCommuniquees: 1,
      sansObjet: 1,
      aRevoir: 1,
    });
    expect(agg.totaux.parProvenance).toEqual([
      { provenance: 'entretien', nombre: 4 },
      { provenance: 'observation', nombre: 0 },
      { provenance: 'demonstration', nombre: 0 },
      { provenance: 'document', nombre: 1 },
      { provenance: 'releve', nombre: 0 },
    ]);
    // Les blocs proposés au filtre sont les blocs ACTIFS de la mission, libellés en français.
    expect(agg.blocs.map((b) => b.code)).toEqual(['bloc_1', 'bloc_2']);
    expect(agg.blocs.every((b) => b.libelle.length > 0 && b.libelle !== b.code)).toBe(true);
  });

  it('@critique la PROVENANCE (`answers.source`) et le TYPE de session (`interviews.kind`) voyagent séparément — une observation peut rendre une réponse « document »', async () => {
    const s = await scene();
    const agg = agregation(await lireAgregation(s.mission.id, s.admin.jeton));
    const lignes = agg.questions[0]?.reponses ?? [];
    const duDocument = lignes.find((r) => r.orgUnitId === s.u2);
    expect(duDocument).toMatchObject({
      sessionKind: 'observation',
      provenance: 'document',
      aRevoir: true,
      motifARevoir: 'Contredit la procédure écrite',
      revision: 2,
    });
    const deLEntretien = lignes.find((r) => r.orgUnitId === s.u1);
    expect(deLEntretien).toMatchObject({
      sessionKind: 'entretien',
      provenance: 'entretien',
      fonctionRepondant: 'Directeur fictif',
      serviceRepondant: 'Direction générale',
    });
    expect(agg.questions[0]?.parProvenance).toEqual([
      { provenance: 'entretien', nombre: 1 },
      { provenance: 'observation', nombre: 0 },
      { provenance: 'demonstration', nombre: 0 },
      { provenance: 'document', nombre: 1 },
      { provenance: 'releve', nombre: 0 },
    ]);
  });

  it('@critique filtres — `?block=` restreint les questions ; `?orgUnit=` restreint les RÉPONSES et laisse les questions visibles et vides ; le filtre appliqué est renvoyé', async () => {
    const s = await scene();
    const parBloc = agregation(await lireAgregation(s.mission.id, s.admin.jeton, '?block=bloc_2'));
    expect(parBloc.filtre).toEqual({ block: 'bloc_2', orgUnit: null });
    expect(parBloc.questions.map((q) => q.missionQuestionId)).toEqual([s.qJamaisPosee, s.qChoix]);
    expect(parBloc.totaux.questions).toBe(2);

    const parUnite = agregation(
      await lireAgregation(s.mission.id, s.admin.jeton, `?orgUnit=${s.u2}`),
    );
    expect(parUnite.filtre).toEqual({ block: null, orgUnit: s.u2 });
    expect(parUnite.questions).toHaveLength(5);
    expect(parUnite.questions[0]?.reponses.map((r) => r.orgUnitId)).toEqual([s.u2]);
    expect(parUnite.questions.slice(1).every((q) => q.comptes.posee === 0)).toBe(true);
    expect(parUnite.totaux).toMatchObject({ questions: 5, questionsSansReponse: 4, reponses: 1 });

    const inconnu = agregation(
      await lireAgregation(s.mission.id, s.admin.jeton, '?block=bloc_inconnu'),
    );
    expect(inconnu.questions).toEqual([]);
    expect(inconnu.totaux.questions).toBe(0);
  });

  it('@critique horodatages en UTC (`Z`), jamais un décalage local — le fuseau de mission (`America/Los_Angeles`) voyage à part', async () => {
    const s = await scene();
    const cov = await lireCouverture(s.mission.id, s.admin.jeton);
    const agg = await lireAgregation(s.mission.id, s.admin.jeton);
    expect([cov.statut, agg.statut]).toEqual([200, 200]);
    const corpus = `${cov.corps}\n${agg.corps}`;
    expect(corpus.match(/\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}/g) ?? []).toEqual([]);
    expect(couverture(cov).timezone).toBe('America/Los_Angeles');
    expect(agregation(agg).timezone).toBe('America/Los_Angeles');
    expect(agregation(agg).questions[0]?.reponses[0]?.misAJourLe).toMatch(/Z$/);
  });
});
