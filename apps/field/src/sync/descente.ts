// =============================================================================
// LA DESCENTE — le pull delta, page après page, par mission (L6b)
//
// 11 §4 : `GET /v1/sync/pull?mission_id=&since=` → `{serverTime, changes,
// nextSince}` ; le client persiste `nextSince` PAR MISSION ; premier pull =
// mission complète. 05 §9.2 : `serverTime` règle le décalage d'horloge. 05 §9.5.
//
// Ce que ce fichier tient, et rien d'autre :
//   · la BOUCLE : on tire tant que `nextSince` avance ; un `nextSince` nul (fin
//     du delta) n'efface JAMAIS un curseur connu, et un curseur qui n'avance pas
//     arrête la boucle (jamais de boucle infinie) ;
//   · la TRADUCTION : ligne serveur (camelCase, colonnes du 04) → forme locale
//     (index en clair + charge), drapeaux 0|1, `missionId` posé par le pull,
//     colonnes serveur (`syncedAt`, `createdAt`, `updatedAt`) écartées. Une ligne
//     que la forme locale ne sait pas porter est COMPTÉE (`illisibles`), jamais
//     inventée ;
//   · l'ÉCRITURE passe par `appliquerDescente` (`local/ecriture.ts`, non modifié) :
//     une ligne qui porte une op non appliquée n'est jamais écrasée, LWW par ligne,
//     aucune op fabriquée ;
//   · le REMAPPAGE d'une réponse absorbée par le siège (`remappage.ts`).
//
// Une erreur de transport ne perd rien : le curseur et la file restent tels
// quels, les pages déjà reçues restent appliquées. Un transport qui LÈVE vaut
// `hors_ligne`. Rien n'est journalisé (11 §2).
//
// Traçabilité : E7, E9 ; invariants 1, 7, 8.
// =============================================================================
import { CRITICITES, TYPES_DE_REPONSE } from '@axion/shared';
import { z } from 'zod';
import { cleCurseurPull, lireMeta, type BaseLocale } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import type { ReponsePull } from '../local/contrat-sync.js';
import { appliquerDescente, type EnregistrementDescendant } from '../local/ecriture.js';
import {
  STATUTS_PLANIFICATION,
  STATUTS_SESSION_PERSISTES,
  STATUTS_UNITE,
  TYPES_DE_PIECE,
  TYPES_DE_SESSION,
  TYPES_UNITE,
  chargeAnswerSchema,
  chargeAttachmentSchema,
  chargeInterviewSchema,
  chargeMissionQuestionSchema,
  chargeMissionSchema,
  chargeOrgUnitSchema,
  chargeWorkAssignmentSchema,
  drapeau,
  jetonsDeRecherche,
} from '../local/formes.js';
import { remapperAbsorptions } from './remappage.js';
import type { ResultatTransport, TransportSync } from './transport.js';

export interface DependancesDescente {
  readonly base: BaseLocale;
  readonly coffre: Coffre;
  readonly transport: Pick<TransportSync, 'tirer'>;
}

export interface BilanPull {
  readonly statut: 'succes' | 'hors_ligne' | 'reconnexion_requise' | 'refus';
  /** Réponses `ok` reçues pendant ce passage. */
  readonly pages: number;
  readonly enregistrementsRecus: number;
  /** Lignes serveur que la forme locale ne sait pas porter : comptées, jamais inventées. */
  readonly enregistrementsIllisibles: number;
  /** Ops et lignes réalignées sur un UUID absorbé par le siège. */
  readonly referencesRemappees: number;
  /** Message du transport quand le passage n'a pas abouti ; `null` sinon. */
  readonly message: string | null;
}

export interface Descente {
  tirer(missionId: string): Promise<BilanPull>;
}

/**
 * L'horodatage d'une ligne de RÉFÉRENTIEL sans `updated_at` au 04 (questionnaire
 * figé, affectations). Le plus ancien possible : une telle ligne ne gagne jamais
 * le dernier-écrit-gagne contre une ligne locale, elle ne fait que la créer.
 */
const INSTANT_REFERENTIEL = '1970-01-01T00:00:00.000Z';

// ─────────────────────────────────────────────────────────────────────────────
// TRADUCTION — ligne serveur → forme locale (fonctions PURES)
// ─────────────────────────────────────────────────────────────────────────────
const texte = z.string();
const texteOuNul = z.string().nullish();
const nombreOuNul = z.union([z.number(), z.string()]).nullish();
const booleenOuNul = z.boolean().nullish();

/** Les colonnes de cycle de vie, communes : jamais recopiées telles quelles. */
const cycleDeVie = {
  clientCreatedAt: texteOuNul,
  clientUpdatedAt: texteOuNul,
  createdAt: texteOuNul,
  updatedAt: texteOuNul,
  deletedAt: texteOuNul,
};

/** `numeric` arrive en chaîne depuis PostgreSQL : il redevient un nombre. */
function nombre(valeur: number | string | null | undefined): number | null {
  if (valeur === null || valeur === undefined) return null;
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : null;
}

function horodatage(l: {
  readonly clientUpdatedAt?: string | null | undefined;
  readonly updatedAt?: string | null | undefined;
}): string {
  return l.clientUpdatedAt ?? l.updatedAt ?? INSTANT_REFERENTIEL;
}

function creation(l: {
  readonly clientCreatedAt?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
}): string | null {
  return l.clientCreatedAt ?? l.createdAt ?? null;
}

const ligneReponse = z.looseObject({
  id: texte,
  interviewId: texte,
  missionQuestionId: texte,
  value: z.unknown(),
  source: z.unknown(),
  withheld: booleenOuNul,
  withheldReason: z.unknown(),
  horsParcours: booleenOuNul,
  note: texteOuNul,
  flagReview: booleenOuNul,
  reviewReason: texteOuNul,
  notApplicable: booleenOuNul,
  naReason: texteOuNul,
  questionTextSnapshot: texteOuNul,
  revision: z.unknown(),
  ...cycleDeVie,
});

function traduireReponse(missionId: string, brute: unknown): EnregistrementDescendant | null {
  const l = ligneReponse.safeParse(brute);
  if (!l.success) return null;
  const r = l.data;
  const charge = chargeAnswerSchema.safeParse({
    value: r.value ?? null,
    note: r.note ?? null,
    reviewReason: r.reviewReason ?? null,
    naReason: r.naReason ?? null,
    withheldReason: r.withheldReason ?? null,
    source: r.source,
    questionTextSnapshot: r.questionTextSnapshot ?? '',
    revision: r.revision,
    clientCreatedAt: creation(r),
  });
  if (!charge.success) return null;
  return {
    table: 'answers',
    index: {
      id: r.id,
      missionId,
      interviewId: r.interviewId,
      missionQuestionId: r.missionQuestionId,
      flagReview: drapeau(r.flagReview ?? false),
      notApplicable: drapeau(r.notApplicable ?? false),
      withheld: drapeau(r.withheld ?? false),
      horsParcours: drapeau(r.horsParcours ?? false),
      clientUpdatedAt: horodatage(r),
      supprimeLe: r.deletedAt ?? null,
    },
    charge: charge.data,
  };
}

const ligneSession = z.looseObject({
  id: texte,
  orgUnitId: texte,
  kind: z.enum(TYPES_DE_SESSION),
  status: z.enum(STATUTS_SESSION_PERSISTES),
  scheduleStatus: z.enum(STATUTS_PLANIFICATION),
  scheduledAt: texteOuNul,
  conductedBy: z.unknown(),
  mode: z.unknown(),
  personName: texteOuNul,
  personRole: texteOuNul,
  personServiceId: texteOuNul,
  personEmail: texteOuNul,
  participants: z.unknown(),
  generalNotes: texteOuNul,
  linkedReviewAnswerId: texteOuNul,
  documentRequestId: texteOuNul,
  consentGiven: booleenOuNul,
  consentAudio: booleenOuNul,
  consentedAt: texteOuNul,
  informationNoticeVersion: texteOuNul,
  noticeShownAt: texteOuNul,
  scheduledDurationMin: z.number().nullish(),
  startedAt: texteOuNul,
  endedAt: texteOuNul,
  ...cycleDeVie,
});

function traduireSession(missionId: string, brute: unknown): EnregistrementDescendant | null {
  const l = ligneSession.safeParse(brute);
  if (!l.success) return null;
  const s = l.data;
  const charge = chargeInterviewSchema.safeParse({
    conductedBy: s.conductedBy,
    mode: s.mode ?? null,
    personName: s.personName ?? null,
    personRole: s.personRole ?? null,
    personServiceId: s.personServiceId ?? null,
    personEmail: s.personEmail ?? null,
    participants: s.participants ?? null,
    generalNotes: s.generalNotes ?? null,
    linkedReviewAnswerId: s.linkedReviewAnswerId ?? null,
    documentRequestId: s.documentRequestId ?? null,
    consentGiven: s.consentGiven ?? false,
    consentAudio: s.consentAudio ?? false,
    consentedAt: s.consentedAt ?? null,
    informationNoticeVersion: s.informationNoticeVersion ?? null,
    noticeShownAt: s.noticeShownAt ?? null,
    scheduledDurationMin: s.scheduledDurationMin ?? null,
    startedAt: s.startedAt ?? null,
    endedAt: s.endedAt ?? null,
    // Sans colonne au 04 : la valeur LOCALE est reprise par `completerDepuisLocal`.
    valideeLe: null,
    clientCreatedAt: creation(s),
  });
  if (!charge.success) return null;
  return {
    table: 'interviews',
    index: {
      id: s.id,
      missionId,
      orgUnitId: s.orgUnitId,
      kind: s.kind,
      status: s.status,
      scheduleStatus: s.scheduleStatus,
      scheduledAt: s.scheduledAt ?? null,
      clientUpdatedAt: horodatage(s),
      supprimeLe: s.deletedAt ?? null,
    },
    charge: charge.data,
  };
}

const lignePiece = z.looseObject({
  id: texte,
  interviewId: texteOuNul,
  answerId: texteOuNul,
  kind: z.enum(TYPES_DE_PIECE),
  content: texteOuNul,
  filename: texteOuNul,
  mime: texteOuNul,
  sizeBytes: nombreOuNul,
  storageKey: texteOuNul,
  purgeAfter: texteOuNul,
  createdBy: z.unknown(),
  ...cycleDeVie,
});

function traduirePiece(missionId: string, brute: unknown): EnregistrementDescendant | null {
  const l = lignePiece.safeParse(brute);
  if (!l.success) return null;
  const p = l.data;
  const charge = chargeAttachmentSchema.safeParse({
    content: p.content ?? null,
    filename: p.filename ?? null,
    mime: p.mime ?? null,
    sizeBytes: nombre(p.sizeBytes),
    storageKey: p.storageKey ?? null,
    purgeAfter: p.purgeAfter ?? null,
    createdBy: p.createdBy,
    clientCreatedAt: creation(p),
  });
  if (!charge.success) return null;
  return {
    table: 'attachments',
    index: {
      id: p.id,
      missionId,
      interviewId: p.interviewId ?? null,
      answerId: p.answerId ?? null,
      kind: p.kind,
      clientUpdatedAt: horodatage(p),
      supprimeLe: p.deletedAt ?? null,
    },
    charge: charge.data,
  };
}

const ligneUnite = z.looseObject({
  id: texte,
  parentId: texteOuNul,
  kind: z.enum(TYPES_UNITE),
  status: z.enum(STATUTS_UNITE),
  position: z.number().nullish(),
  name: z.unknown(),
  countryCode: texteOuNul,
  timezone: texteOuNul,
  headcount: z.number().nullish(),
  serviceRefId: texteOuNul,
  sectorId: texteOuNul,
  inScope: booleenOuNul,
  proposedBy: texteOuNul,
  mergedIntoId: texteOuNul,
  ...cycleDeVie,
});

function traduireUnite(missionId: string, brute: unknown): EnregistrementDescendant | null {
  const l = ligneUnite.safeParse(brute);
  if (!l.success) return null;
  const u = l.data;
  const charge = chargeOrgUnitSchema.safeParse({
    name: u.name,
    countryCode: u.countryCode ?? null,
    timezone: u.timezone ?? null,
    headcount: u.headcount ?? null,
    serviceRefId: u.serviceRefId ?? null,
    sectorId: u.sectorId ?? null,
    inScope: u.inScope ?? true,
    proposedBy: u.proposedBy ?? null,
    mergedIntoId: u.mergedIntoId ?? null,
    clientCreatedAt: creation(u),
  });
  if (!charge.success) return null;
  return {
    table: 'orgUnits',
    index: {
      id: u.id,
      missionId,
      parentId: u.parentId ?? null,
      kind: u.kind,
      status: u.status,
      position: u.position ?? 0,
      clientUpdatedAt: horodatage(u),
      supprimeLe: u.deletedAt ?? null,
    },
    charge: charge.data,
  };
}

const ligneMission = z.looseObject({
  id: texte,
  status: texte,
  title: z.unknown(),
  companyId: z.unknown(),
  timezone: z.unknown(),
  auditLevel: z.unknown(),
  geoScope: z.unknown(),
  countryCode: texteOuNul,
  startPlanned: texteOuNul,
  endPlanned: texteOuNul,
  roleSurMission: texteOuNul,
  roleOnMission: texteOuNul,
  ...cycleDeVie,
});

function traduireMission(missionId: string, brute: unknown): EnregistrementDescendant | null {
  const l = ligneMission.safeParse(brute);
  if (!l.success || l.data.id !== missionId) return null;
  const m = l.data;
  const charge = chargeMissionSchema.safeParse({
    titre: m.title,
    companyId: m.companyId,
    timezone: m.timezone,
    auditLevel: m.auditLevel,
    geoScope: m.geoScope,
    countryCode: m.countryCode ?? null,
    startPlanned: m.startPlanned ?? null,
    endPlanned: m.endPlanned ?? null,
    // Le rôle vit dans `mission_users`, pas dans la ligne : « inconnu » (chaîne
    // vide) plutôt qu'inventé ; une valeur locale connue est reprise.
    roleSurMission: m.roleSurMission ?? m.roleOnMission ?? '',
  });
  if (!charge.success) return null;
  return {
    table: 'missions',
    index: {
      id: m.id,
      status: m.status,
      clientUpdatedAt: horodatage(m),
      supprimeLe: m.deletedAt ?? null,
    },
    charge: charge.data,
  };
}

const ligneQuestion = z.looseObject({
  id: texte,
  questionId: z.unknown(),
  questionVersion: z.unknown(),
  textSnapshot: texte,
  optionsSnapshot: z.unknown(),
  weightSnapshot: nombreOuNul,
  scoringSnapshot: z.unknown(),
  guidanceSnapshot: texteOuNul,
  answerTypeSnapshot: z.enum(TYPES_DE_REPONSE),
  criticalitySnapshot: z.enum(CRITICITES),
  allowRangeSnapshot: booleenOuNul,
  position: z.number().nullish(),
  addedAdHoc: booleenOuNul,
  blockCode: texteOuNul,
  ...cycleDeVie,
});

function traduireQuestion(missionId: string, brute: unknown): EnregistrementDescendant | null {
  const l = ligneQuestion.safeParse(brute);
  if (!l.success) return null;
  const q = l.data;
  const charge = chargeMissionQuestionSchema.safeParse({
    questionId: q.questionId,
    questionVersion: q.questionVersion,
    guidanceSnapshot: q.guidanceSnapshot ?? null,
    optionsSnapshot: q.optionsSnapshot ?? null,
    scoringSnapshot: q.scoringSnapshot ?? null,
    weightSnapshot: nombre(q.weightSnapshot),
    allowRangeSnapshot: q.allowRangeSnapshot ?? false,
    addedAdHoc: q.addedAdHoc ?? false,
    blockCode: q.blockCode ?? null,
  });
  if (!charge.success) return null;
  return {
    table: 'missionQuestions',
    index: {
      id: q.id,
      missionId,
      position: q.position ?? 0,
      texteSnapshot: q.textSnapshot,
      motsCles: jetonsDeRecherche(q.textSnapshot),
      answerType: q.answerTypeSnapshot,
      criticality: q.criticalitySnapshot,
      clientUpdatedAt: horodatage(q),
      supprimeLe: q.deletedAt ?? null,
    },
    charge: charge.data,
  };
}

const ligneAffectation = z.looseObject({
  id: texte,
  orgUnitId: texte,
  userId: z.unknown(),
  plannedInterviews: z.number().nullish(),
  plannedDays: nombreOuNul,
  dateFrom: texteOuNul,
  dateTo: texteOuNul,
  ...cycleDeVie,
});

function traduireAffectation(missionId: string, brute: unknown): EnregistrementDescendant | null {
  const l = ligneAffectation.safeParse(brute);
  if (!l.success) return null;
  const a = l.data;
  const charge = chargeWorkAssignmentSchema.safeParse({
    userId: a.userId,
    plannedInterviews: a.plannedInterviews ?? null,
    plannedDays: nombre(a.plannedDays),
    dateFrom: a.dateFrom ?? null,
    dateTo: a.dateTo ?? null,
  });
  if (!charge.success) return null;
  return {
    table: 'workAssignments',
    index: {
      id: a.id,
      missionId,
      orgUnitId: a.orgUnitId,
      clientUpdatedAt: horodatage(a),
      supprimeLe: a.deletedAt ?? null,
    },
    charge: charge.data,
  };
}

type Traducteur = (missionId: string, brute: unknown) => EnregistrementDescendant | null;

/**
 * L'ordre d'application : les parents avant les enfants (mission, unités,
 * questionnaire, sessions, réponses, pièces), pour qu'aucun écran ne lise un
 * enfant orphelin entre deux pages.
 */
const TRADUCTEURS: readonly (readonly [keyof ReponsePull['changes'], Traducteur])[] = [
  ['mission', traduireMission],
  ['org_unit', traduireUnite],
  ['mission_question', traduireQuestion],
  ['work_assignment', traduireAffectation],
  ['interview', traduireSession],
  ['answer', traduireReponse],
  ['attachment_meta', traduirePiece],
];

interface Traduction {
  readonly enregistrements: EnregistrementDescendant[];
  readonly illisibles: number;
}

function traduire(missionId: string, changes: ReponsePull['changes']): Traduction {
  const enregistrements: EnregistrementDescendant[] = [];
  let illisibles = 0;
  for (const [entite, traducteur] of TRADUCTEURS) {
    for (const brute of changes[entite] ?? []) {
      const enr = traducteur(missionId, brute);
      if (enr === null) illisibles += 1;
      else enregistrements.push(enr);
    }
  }
  return { enregistrements, illisibles };
}

/** Lignes serveur (camelCase, colonnes du 04) → formes locales. Fonction PURE. */
export function traduireChangements(
  missionId: string,
  changes: ReponsePull['changes'],
): EnregistrementDescendant[] {
  return traduire(missionId, changes).enregistrements;
}

// ─────────────────────────────────────────────────────────────────────────────
// CE QUE LE 04 NE PORTE PAS — repris de la ligne locale, jamais effacé
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Deux champs locaux n'ont pas de colonne serveur : `valideeLe` d'une session
 * (03 §19.1) et `roleSurMission` d'une mission. Une descente ne doit pas les
 * remettre à zéro en silence (invariant 7) : la valeur locale connue est reprise.
 */
async function completerDepuisLocal(
  base: BaseLocale,
  coffre: Coffre,
  enregistrements: readonly EnregistrementDescendant[],
): Promise<EnregistrementDescendant[]> {
  const complets: EnregistrementDescendant[] = [];
  for (const enr of enregistrements) {
    if (enr.table === 'interviews') {
      const locale = await base.interviews.get(enr.index.id);
      if (locale !== undefined) {
        const charge = await coffre.dechiffrer(locale.charge, chargeInterviewSchema);
        complets.push({ ...enr, charge: { ...enr.charge, valideeLe: charge.valideeLe } });
        continue;
      }
    } else if (enr.table === 'missions' && enr.charge.roleSurMission === '') {
      const locale = await base.missions.get(enr.index.id);
      if (locale !== undefined) {
        const charge = await coffre.dechiffrer(locale.charge, chargeMissionSchema);
        complets.push({ ...enr, charge: { ...enr.charge, roleSurMission: charge.roleSurMission } });
        continue;
      }
    }
    complets.push(enr);
  }
  return complets;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA BOUCLE
// ─────────────────────────────────────────────────────────────────────────────
/** Les descentes en cours, par base et par mission : jamais deux à la fois. */
const descentesEnCours = new WeakMap<BaseLocale, Map<string, Promise<BilanPull>>>();

async function tirerUnePage(
  transport: Pick<TransportSync, 'tirer'>,
  missionId: string,
  since: string | null,
): Promise<ResultatTransport<ReponsePull>> {
  try {
    return await transport.tirer(missionId, since);
  } catch {
    // Un transport qui lève ne fuit pas : c'est une coupure.
    return { type: 'hors_ligne' };
  }
}

async function passage(deps: DependancesDescente, missionId: string): Promise<BilanPull> {
  const connu = await lireMeta(deps.base, cleCurseurPull(missionId));
  let since: string | null = typeof connu === 'string' ? connu : null;
  let pages = 0;
  let recus = 0;
  let illisibles = 0;
  let remappees = 0;

  for (;;) {
    const resultat = await tirerUnePage(deps.transport, missionId, since);
    if (resultat.type !== 'ok') {
      return {
        statut: resultat.type,
        pages,
        enregistrementsRecus: recus,
        enregistrementsIllisibles: illisibles,
        referencesRemappees: remappees,
        message: resultat.type === 'hors_ligne' ? null : resultat.message,
      };
    }
    pages += 1;
    const { serverTime, changes, nextSince } = resultat.donnees;
    const traduction = traduire(missionId, changes);
    recus += traduction.enregistrements.length;
    illisibles += traduction.illisibles;

    // Un `nextSince` nul n'efface jamais un curseur connu.
    const curseur = nextSince ?? since;
    await appliquerDescente({
      missionId,
      serverTime,
      prochainSince: curseur,
      enregistrements: await completerDepuisLocal(
        deps.base,
        deps.coffre,
        traduction.enregistrements,
      ),
    });
    remappees += await remapperAbsorptions(deps, missionId, traduction.enregistrements);

    // Fin du delta, ou curseur qui n'avance pas : la boucle s'arrête.
    if (nextSince === null || nextSince === since) break;
    since = nextSince;
  }

  return {
    statut: 'succes',
    pages,
    enregistrementsRecus: recus,
    enregistrementsIllisibles: illisibles,
    referencesRemappees: remappees,
    message: null,
  };
}

export function creerDescente(deps: DependancesDescente): Descente {
  return {
    tirer(missionId: string): Promise<BilanPull> {
      let parMission = descentesEnCours.get(deps.base);
      if (parMission === undefined) {
        parMission = new Map();
        descentesEnCours.set(deps.base, parMission);
      }
      const table = parMission;
      const suivant = (table.get(missionId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => passage(deps, missionId));
      table.set(missionId, suivant);
      const liberer = (): void => {
        if (table.get(missionId) === suivant) table.delete(missionId);
      };
      suivant.then(liberer, liberer);
      return suivant;
    },
  };
}
