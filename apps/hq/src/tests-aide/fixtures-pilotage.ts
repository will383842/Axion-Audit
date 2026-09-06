// =============================================================================
// FIXTURES DU PILOTAGE — couverture (§27.1, §16.6) et agrégation (M5.1, §27.4).
// Lot L7, incrément L7b. Écrit par A36 (tests), jamais par l'agent qui code les
// écrans (09 §5.6).
//
// CHAQUE FIXTURE PASSE PAR LE SCHÉMA PARTAGÉ AVANT D'EXISTER. `couvertureMissionSchema`
// et `agregationMissionSchema` sont des `strictObject` : une clé de trop — un nom de
// répondant, un montant, un champ inventé — fait échouer le module à l'import, avant
// tout test. Le serveur factice ne peut donc servir que ce que le contrat 11 §3 sait
// décrire, et un écran ne peut pas être testé contre une forme qui n'existe pas.
//
// ── LES DEUX FIXTURES SYMÉTRIQUES DE `LOT_L7.md` §6.5, CÔTÉ ÉCRAN ────────────
//   · « tout en entretiens » — dix unités, toutes auditées (axe A complet), mais
//     seule la source `entretien` est couverte (axe B en défaut sur trois sources
//     exigées). Un écran qui n'a que l'axe A affiche « complet » ici.
//   · « tout sur une unité » — dix unités, une seule porte les six types de
//     session ; neuf sont sans aucune session (alerte §16.6). Un écran qui n'a
//     que l'axe B est complet en marge et ne montre rien de l'oubli.
//
// ── L'AGRÉGATION : QUATRE SITUATIONS, QUATRE LIGNES ─────────────────────────
// Renseignée (deux réponses, dont une « à revoir » venue d'une OBSERVATION dont
// la provenance est `document` — type ≠ provenance) · non communiquée avec son
// motif · sans objet avec son motif · JAMAIS POSÉE (aucune ligne). Chaque rendu
// doit avoir sa phrase, et aucun ne doit se confondre avec un autre.
//
// Invariant 2 : tout est fictif. Déterminisme : rien n'est tiré au hasard.
// Traçabilité : E25, E14, E22, E43.
// =============================================================================
import {
  agregationMissionSchema,
  couvertureMissionSchema,
  SOURCES_COLLECTE,
  type AgregationMission,
  type CelluleCouverture,
  type CouvertureMission,
  type QuestionAgregee,
  type ReponseAgregee,
  type SourceCollecte,
  type UniteCouverte,
} from '@axion/shared';
import { ID } from './fixtures-console.js';

const CALCULE_LE = '2026-09-05T08:00:00.000Z';

/** UUID v7 figés, dérivés d'un rang : lisibles dans une trace, stables. */
export function idUnite(rang: number): string {
  return `018f0000-0000-7000-8000-0000000d${String(rang).padStart(4, '0')}`;
}
export function idQuestion(rang: number): string {
  return `018f0000-0000-7000-8000-0000000e${String(rang).padStart(4, '0')}`;
}
function idReponse(rang: number): string {
  return `018f0000-0000-7000-8000-0000000f${String(rang).padStart(4, '0')}`;
}
function idSession(rang: number): string {
  return `018f0000-0000-7000-8000-0000000a${String(rang).padStart(4, '0')}`;
}

function celluleDe(
  kind: SourceCollecte,
  prevuMin: number,
  prevuMax: number,
  planifie: number,
  realise: number,
): CelluleCouverture {
  return {
    kind,
    prevu: { min: prevuMin, max: prevuMax },
    planifie,
    realise,
    couvert: realise >= prevuMin,
  };
}

/** Le plan §32.4 d'une unité, transcrit : effectif → cible par source. */
function prevuSelonEffectif(effectif: number): Record<SourceCollecte, [number, number]> {
  if (effectif <= 10) {
    return {
      entretien: [1, 2],
      observation: [0, 0],
      demonstration: [0, 0],
      analyse_documentaire: [0, 0],
      releve_donnees: [0, 0],
    };
  }
  if (effectif <= 50) {
    return {
      entretien: [3, 3],
      observation: [0, 0],
      demonstration: [0, 0],
      analyse_documentaire: [0, 0],
      releve_donnees: [0, 0],
    };
  }
  if (effectif <= 200) {
    return {
      entretien: [4, 6],
      observation: [1, 1],
      demonstration: [0, 0],
      analyse_documentaire: [0, 0],
      releve_donnees: [0, 0],
    };
  }
  return {
    entretien: [6, 10],
    observation: [1, 1],
    demonstration: [1, 1],
    analyse_documentaire: [0, 0],
    releve_donnees: [1, 1],
  };
}

export interface SemisUnite {
  readonly rang: number;
  readonly nom: string;
  readonly effectif: number;
  readonly profondeur?: number;
  readonly parentRang?: number;
  readonly inScope?: boolean;
  /** Sessions RÉALISÉES par source (planifié = réalisé, pour la lisibilité). */
  readonly realise?: Partial<Record<SourceCollecte, number>>;
  readonly atelierRealise?: number;
  readonly blocsNonCouverts?: readonly string[];
}

function unite(semis: SemisUnite): UniteCouverte {
  const inScope = semis.inScope ?? true;
  const cibles = prevuSelonEffectif(semis.effectif);
  const parSource = SOURCES_COLLECTE.map((kind) => {
    const [min, max] = inScope ? cibles[kind] : [0, 0];
    const realise = semis.realise?.[kind] ?? 0;
    return celluleDe(kind, min, max, realise, realise);
  });
  const attendues = parSource.filter((c) => c.prevu.min > 0);
  const total = parSource.reduce((somme, c) => somme + c.realise, 0) + (semis.atelierRealise ?? 0);
  return {
    orgUnitId: idUnite(semis.rang),
    nom: semis.nom,
    kind: 'service',
    parentId: semis.parentRang === undefined ? null : idUnite(semis.parentRang),
    profondeur: semis.profondeur ?? 0,
    inScope,
    effectif: semis.effectif,
    parSource,
    atelierRealise: semis.atelierRealise ?? 0,
    sourcesCouvertes: attendues.filter((c) => c.couvert).length,
    sourcesAttendues: attendues.length,
    blocsNonCouverts: [...(semis.blocsNonCouverts ?? [])],
    aucuneSession: inScope && total === 0,
  };
}

/** Les marges, calculées sur TOUTES les unités du périmètre — jamais sur une page. */
function marges(unites: readonly UniteCouverte[]): CouvertureMission['marges'] {
  const duPerimetre = unites.filter((u) => u.inScope);
  return {
    parSource: SOURCES_COLLECTE.map((kind) => {
      let min = 0;
      let max = 0;
      let planifie = 0;
      let realise = 0;
      for (const u of duPerimetre) {
        const c = u.parSource.find((x) => x.kind === kind);
        if (c === undefined) continue;
        min += c.prevu.min;
        max += c.prevu.max;
        planifie += c.planifie;
        realise += c.realise;
      }
      return celluleDe(kind, min, max, planifie, realise);
    }),
    atelierRealise: duPerimetre.reduce((s, u) => s + u.atelierRealise, 0),
    unitesInScope: duPerimetre.length,
    unitesHorsPerimetre: unites.length - duPerimetre.length,
    unitesSansAucuneSession: duPerimetre.filter((u) => u.aucuneSession).length,
  };
}

export function couvertureDe(
  missionId: string,
  semis: readonly SemisUnite[],
  options: { readonly timezone?: string; readonly blocsActifs?: readonly string[] } = {},
): CouvertureMission {
  const unites = semis.map(unite);
  return couvertureMissionSchema.parse({
    missionId,
    timezone: options.timezone ?? 'Europe/Paris',
    calculeLe: CALCULE_LE,
    blocsActifs: [...(options.blocsActifs ?? [])],
    unites,
    nextCursor: null,
    marges: marges(unites),
    avertissements: [],
  });
}

/** FIL-TPE — 1 unité de 8 personnes, 1 entretien tenu : couverte, sans atelier. */
export const COUVERTURE_TPE: CouvertureMission = couvertureDe(ID.missionTpe, [
  { rang: 1, nom: 'Établissement unique', effectif: 8, realise: { entretien: 1 } },
]);

/** « TOUT EN ENTRETIENS » — dix unités de 300 personnes, six entretiens chacune, un atelier sur la première. */
export const COUVERTURE_TOUT_EN_ENTRETIENS: CouvertureMission = couvertureDe(
  ID.missionTpe,
  Array.from({ length: 10 }, (_, i) => ({
    rang: i + 1,
    nom: `Unité ${String(i + 1)}`,
    effectif: 300,
    realise: { entretien: 6 },
    atelierRealise: i === 0 ? 1 : 0,
  })),
  { blocsActifs: ['bloc_1', 'bloc_2'] },
);

/** « TOUT SUR UNE UNITÉ » — dix unités, la première porte les six types, neuf n'ont rien. */
export const COUVERTURE_TOUT_SUR_UNE_UNITE: CouvertureMission = couvertureDe(
  ID.missionTpe,
  Array.from({ length: 10 }, (_, i) => ({
    rang: i + 1,
    nom: `Unité ${String(i + 1)}`,
    effectif: 300,
    realise:
      i === 0
        ? {
            entretien: 6,
            observation: 1,
            demonstration: 1,
            analyse_documentaire: 1,
            releve_donnees: 1,
          }
        : {},
    atelierRealise: i === 0 ? 1 : 0,
    blocsNonCouverts: i === 0 ? [] : ['bloc_1', 'bloc_2'],
  })),
  { blocsActifs: ['bloc_1', 'bloc_2'] },
);

/** Une unité hors périmètre au milieu des autres : rendue, jamais retirée (§25.1). */
export const COUVERTURE_AVEC_HORS_PERIMETRE: CouvertureMission = couvertureDe(ID.missionTpe, [
  { rang: 1, nom: 'Unité auditée', effectif: 30, realise: { entretien: 3 } },
  { rang: 2, nom: 'Unité sortie du périmètre', effectif: 400, inScope: false },
  { rang: 3, nom: 'Unité oubliée', effectif: 30 },
]);

/** Aucune unité : l'état VIDE de l'écran. */
export const COUVERTURE_VIDE: CouvertureMission = couvertureDe(ID.missionTpe, []);

/**
 * FIL-GC — 150 unités sur 4 niveaux (1 groupe, 5 filiales, 24 directions, 120
 * services), 80 personnes chacune, 60 entretiens tenus sur les 60 premiers
 * services : la même forme que `aide/fil-rouge.ts` côté API.
 */
export const COUVERTURE_GC: CouvertureMission = (() => {
  const semis: SemisUnite[] = [];
  let rang = 0;
  const groupes: number[] = [];
  const filiales: number[] = [];
  const directions: number[] = [];
  for (let i = 0; i < 1; i += 1) {
    rang += 1;
    groupes.push(rang);
    semis.push({ rang, nom: `Groupe ${String(i + 1)}`, effectif: 80, profondeur: 0 });
  }
  for (let i = 0; i < 5; i += 1) {
    rang += 1;
    filiales.push(rang);
    semis.push({
      rang,
      nom: `Filiale ${String(i + 1)}`,
      effectif: 80,
      profondeur: 1,
      parentRang: groupes[0] ?? 1,
    });
  }
  for (let i = 0; i < 24; i += 1) {
    rang += 1;
    directions.push(rang);
    semis.push({
      rang,
      nom: `Direction ${String(i + 1)}`,
      effectif: 80,
      profondeur: 2,
      parentRang: filiales[i % 5] ?? 1,
    });
  }
  for (let i = 0; i < 120; i += 1) {
    rang += 1;
    semis.push({
      rang,
      nom: `Service ${String(i + 1)}`,
      effectif: 80,
      profondeur: 3,
      parentRang: directions[i % 24] ?? 1,
      realise: i < 60 ? { entretien: 1 } : {},
    });
  }
  return couvertureDe(ID.missionGc, semis);
})();

// -----------------------------------------------------------------------------
// AGRÉGATION
// -----------------------------------------------------------------------------

const MIS_A_JOUR_LE = '2026-09-02T03:30:00.000Z';

interface SemisReponse {
  readonly rang: number;
  readonly uniteRang: number;
  readonly uniteNom: string;
  readonly sessionKind: string;
  readonly provenance: ReponseAgregee['provenance'];
  readonly fonction?: string | null;
  readonly service?: string | null;
  /** Le NOM n'est semé que si le semis le demande (2026-09-05, porte serveur). */
  readonly nom?: string | null;
  readonly valeur?: string | null;
  readonly nonCommunique?: ReponseAgregee['motifNonCommunique'];
  readonly sansObjet?: string;
  readonly aRevoir?: string;
  readonly horsParcours?: boolean;
  readonly revision?: number;
}

function reponse(semis: SemisReponse): ReponseAgregee {
  return {
    answerId: idReponse(semis.rang),
    interviewId: idSession(semis.rang),
    sessionKind: semis.sessionKind,
    orgUnitId: idUnite(semis.uniteRang),
    orgUnitNom: semis.uniteNom,
    orgUnitInScope: true,
    fonctionRepondant: semis.fonction ?? null,
    serviceRepondant: semis.service ?? null,
    nomRepondant: semis.nom ?? null,
    provenance: semis.provenance,
    valeurLisible: semis.valeur ?? null,
    nonCommunique: semis.nonCommunique !== undefined,
    motifNonCommunique: semis.nonCommunique ?? null,
    sansObjet: semis.sansObjet !== undefined,
    motifSansObjet: semis.sansObjet ?? null,
    aRevoir: semis.aRevoir !== undefined,
    motifARevoir: semis.aRevoir ?? null,
    horsParcours: semis.horsParcours ?? false,
    note: null,
    revision: semis.revision ?? 1,
    misAJourLe: MIS_A_JOUR_LE,
  };
}

function question(
  rang: number,
  texte: string,
  blocCode: string,
  reponses: readonly ReponseAgregee[],
  sourceAttendue: QuestionAgregee['sourceAttendue'] = null,
): QuestionAgregee {
  const nonCommuniquees = reponses.filter((r) => r.nonCommunique).length;
  const sansObjet = reponses.filter((r) => r.sansObjet).length;
  return {
    missionQuestionId: idQuestion(rang),
    blocCode,
    blocLibelle: blocCode === 'bloc_1' ? 'Cadrage stratégique' : 'Cartographie des processus',
    texte,
    criticite: 'important',
    typeReponse: 'yes_no',
    sourceAttendue,
    comptes: {
      posee: reponses.length,
      renseignees: reponses.length - nonCommuniquees - sansObjet,
      nonCommuniquees,
      sansObjet,
      aRevoir: reponses.filter((r) => r.aRevoir).length,
      horsParcours: reponses.filter((r) => r.horsParcours).length,
      unitesTouchees: new Set(reponses.map((r) => r.orgUnitId)).size,
    },
    parProvenance: (
      ['entretien', 'observation', 'demonstration', 'document', 'releve'] as const
    ).map((provenance) => ({
      provenance,
      nombre: reponses.filter((r) => r.provenance === provenance).length,
    })),
    reponses: [...reponses],
  };
}

export function agregationDe(
  missionId: string,
  questions: readonly QuestionAgregee[],
  options: {
    readonly timezone?: string;
    readonly blocs?: readonly { code: string; libelle: string }[];
    /** L7c : le serveur a-t-il SERVI les noms ? Faux par défaut, comme la route. */
    readonly repondantsAffiches?: boolean;
  } = {},
): AgregationMission {
  const reponses = questions.flatMap((q) => q.reponses);
  return agregationMissionSchema.parse({
    missionId,
    timezone: options.timezone ?? 'Europe/Paris',
    calculeLe: CALCULE_LE,
    blocs: [
      ...(options.blocs ?? [
        { code: 'bloc_1', libelle: 'Cadrage stratégique' },
        { code: 'bloc_2', libelle: 'Cartographie des processus' },
      ]),
    ],
    filtre: { block: null, orgUnit: null },
    repondantsAffiches: options.repondantsAffiches ?? false,
    questions: [...questions],
    nextCursor: null,
    totaux: {
      questions: questions.length,
      questionsSansReponse: questions.filter((q) => q.comptes.posee === 0).length,
      reponses: reponses.length,
      nonCommuniquees: reponses.filter((r) => r.nonCommunique).length,
      sansObjet: reponses.filter((r) => r.sansObjet).length,
      aRevoir: reponses.filter((r) => r.aRevoir).length,
      parProvenance: (
        ['entretien', 'observation', 'demonstration', 'document', 'releve'] as const
      ).map((provenance) => ({
        provenance,
        nombre: reponses.filter((r) => r.provenance === provenance).length,
      })),
    },
  });
}

/** Les textes des quatre questions — cités par les tests, jamais devinés. */
export const QUESTIONS_QUATRE_CAS = {
  renseignee: 'Un outil de gestion des stocks est-il en place ?',
  refusee: 'Quel est le chiffre d’affaires de l’unité ?',
  sansObjet: 'La flotte de véhicules est-elle suivie ?',
  jamaisPosee: 'Le plan de continuité est-il testé chaque année ?',
  /** Une réponse d'audit `money` — `answers.value`, PAS `scoping_financials` (revue A37 §4). */
  budget: 'Quel est le budget annuel de maintenance de cet outil ?',
} as const;

/** Les motifs, cités tels quels par les tests. */
export const MOTIFS_QUATRE_CAS = {
  sansObjet: 'Aucune flotte de véhicules dans cette unité',
  aRevoir: 'Contredit la procédure écrite remise le 2 septembre',
} as const;

/** L'AGRÉGATION DES QUATRE CAS — sur FIL-TPE (fuseau Europe/Paris). */
export const AGREGATION_QUATRE_CAS: AgregationMission = agregationDe(ID.missionTpe, [
  question(
    1,
    QUESTIONS_QUATRE_CAS.renseignee,
    'bloc_1',
    [
      reponse({
        rang: 1,
        uniteRang: 1,
        uniteNom: 'Unité Alpha',
        sessionKind: 'entretien',
        provenance: 'entretien',
        fonction: 'Directeur fictif',
        service: 'Direction générale',
        valeur: 'Oui',
      }),
      // Une OBSERVATION dont la réponse a pour provenance un DOCUMENT : type ≠ provenance.
      reponse({
        rang: 2,
        uniteRang: 2,
        uniteNom: 'Unité Bêta',
        sessionKind: 'observation',
        provenance: 'document',
        valeur: 'Non',
        aRevoir: MOTIFS_QUATRE_CAS.aRevoir,
        revision: 2,
      }),
    ],
    'entretien',
  ),
  question(2, QUESTIONS_QUATRE_CAS.refusee, 'bloc_1', [
    reponse({
      rang: 3,
      uniteRang: 1,
      uniteNom: 'Unité Alpha',
      sessionKind: 'entretien',
      provenance: 'entretien',
      fonction: 'Directeur fictif',
      service: 'Direction générale',
      nonCommunique: 'confidentiel',
    }),
  ]),
  question(3, QUESTIONS_QUATRE_CAS.sansObjet, 'bloc_2', [
    reponse({
      rang: 4,
      uniteRang: 1,
      uniteNom: 'Unité Alpha',
      sessionKind: 'entretien',
      provenance: 'entretien',
      fonction: 'Directeur fictif',
      service: 'Direction générale',
      sansObjet: MOTIFS_QUATRE_CAS.sansObjet,
    }),
  ]),
  question(4, QUESTIONS_QUATRE_CAS.jamaisPosee, 'bloc_2', []),
  // La réponse `money` : rendue avec sa devise, et la sentinelle financière ne
  // doit PAS la confondre avec un montant de cadrage (invariant 3, revue A37 §4 et M7).
  question(5, QUESTIONS_QUATRE_CAS.budget, 'bloc_1', [
    reponse({
      rang: 5,
      uniteRang: 1,
      uniteNom: 'Unité Alpha',
      sessionKind: 'entretien',
      provenance: 'entretien',
      fonction: 'Directeur fictif',
      service: 'Direction générale',
      valeur: '4200 EUR',
    }),
  ]),
]);

/** La même agrégation sur la mission de la côte Ouest : le fuseau change, pas les données. */
export const AGREGATION_QUATRE_CAS_OUEST: AgregationMission = agregationMissionSchema.parse({
  ...AGREGATION_QUATRE_CAS,
  missionId: ID.missionOuest,
  timezone: 'America/Los_Angeles',
});

/** Aucune question : l'état VIDE de l'écran (questionnaire non figé). */
export const AGREGATION_VIDE: AgregationMission = agregationDe(ID.missionTpe, []);

/** FIL-GC — trois questions suffisent à l'écran ; la volumétrie est éprouvée côté API. */
export const AGREGATION_GC: AgregationMission = agregationDe(ID.missionGc, [
  question(1, 'Question 1 du fil rouge FIL-GC ?', 'bloc_1', [
    reponse({
      rang: 10,
      uniteRang: 31,
      uniteNom: 'Service 1',
      sessionKind: 'entretien',
      provenance: 'entretien',
      valeur: 'Oui',
    }),
  ]),
  question(2, 'Question 2 du fil rouge FIL-GC ?', 'bloc_1', []),
  question(3, 'Question 3 du fil rouge FIL-GC ?', 'bloc_2', []),
]);
