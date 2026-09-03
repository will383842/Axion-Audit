// =============================================================================
// ASSEMBLEUR M2 — LE QUESTIONNAIRE D'UNE MISSION, CALCULÉ ET RIEN D'AUTRE.
// Lot L3, incrément L3d, tâche T2 (`docs/conception/LOT_L3D_BRIEF.md` §3).
//
// ── CE QUE C'EST ────────────────────────────────────────────────────────────
// UNE FONCTION PURE. Elle reçoit la mission, son palier, ses unités, la banque
// de questions vivantes et le référentiel des profils ; elle rend la liste
// ORDONNÉE des questions retenues, avec pour chacune ce qui sera CAPTURÉ dans
// `mission_questions` et ce qui reste du ROUTAGE (03 M2, §16.3).
//
// Aucune E/S, aucune horloge, aucun aléa, aucune écriture :
//   · pas de `db`, pas de `fetch`, pas de `Date.now()`, pas de `Math.random()` ;
//   · **pas de génération d'UUID ici** — l'`id` d'une ligne `mission_questions`
//     est un UUID v7 APPLICATIF (invariant 1, 11 §2) posé par le service au
//     moment d'écrire. Le poser ici rendrait deux appels différents et ferait
//     mentir la propriété ci-dessous ;
//   · deux appels sur les mêmes données rendent la MÊME liste dans le MÊME
//     ordre — c'est ce que le figeage capture, donc ce n'est pas négociable
//     (`DECISIONS.md` 2026-09-01, « L'ordre des questions dans un bloc »).
//
// ── L'ORDRE DES FILTRES (brief §3, dans cet ordre exactement) ───────────────
//   1. `statut_origine`  — `status = 'active'` ET `origin = 'banque'` : jamais un
//      brouillon, jamais une version archivée, jamais une ad hoc (elles entrent
//      par la sync, L6) ;
//   2. `bloc_actif`      — le code du bloc appartient à `missions.active_blocks` ;
//   3. `palier`          — RECOUVREMENT d'intervalles entre [size_tiers.headcount_min,
//      headcount_max] et [questions.headcount_min, headcount_max], NULL = borne
//      ouverte (brief §8-3 : la mission porte un palier, pas un effectif —
//      comparer à l'effectif du client casserait toute mission dont l'effectif
//      est inconnu) ;
//   4. `secteur`         — `sectors = []` (universelle) OU intersection non vide
//      avec `missions.active_sectors` ;
//   5. `niveau_audit`    — `levels = []` OU `missions.audit_level ∈ levels` (01 §20.1) ;
//   6. `geo`             — `geo = 'tous'` OU `geo = missions.geo_scope` ;
//   7. `services_arbre`  — `target_services = []` (transverse) OU intersection non
//      vide avec les codes de service portés par les unités **in_scope et actives**.
//      C'est ICI, et nulle part ailleurs, que « les paquets logistique ne sont
//      générés que si l'arbre contient une unité logistique » (03 §16.3).
// L'énoncé du fichier 07 — « palier × secteur × unités in_scope × niveau ×
// interlocuteur » — nomme les MÊMES critères ; l'ordre ci-dessus est celui du
// brief, du plus discriminant au plus coûteux.
//
// **L'interlocuteur n'est PAS un filtre : c'est une PROJECTION** (03 M2 §3).
// L'ensemble figé est l'UNION des parcours ; `questions.profiles` n'est pas
// capturé (c'est du routage, note L3 §3.a) et sert à la lecture terrain et à la
// répartition affichée par la prévisualisation (§33.4).
//
// ── UN FILTRE QUI NE REND RIEN N'EST PAS UNE ERREUR ────────────────────────
// Cette fonction ne lève JAMAIS. Une sélection vide est une SORTIE VIDE, avec
// `premierFiltreVidant` renseigné : c'est l'APPELANT qui décide (le service
// refuse le figeage d'une sélection vide par 409, brief §3 — figer zéro ligne
// produirait une mission « figée et vide », indistinguable d'une mission non
// figée, puisqu'il n'existe aucune colonne « figé »).
//
// ── CE QUI N'EST PAS CAPTURÉ, ET POURQUOI C'EST LICITE ─────────────────────
// `profiles`, le bloc, `target_services`, `sectors`, `levels`, `geo`, les bornes
// d'effectif, `expected_source`, `display_if` et le `code` sont RELUS À LA VOLÉE
// sur la ligne `questions` pointée. Licite parce qu'une nouvelle version est une
// NOUVELLE LIGNE (04) : une référence vers une ligne immuable *est* une capture.
// Ajouter une colonne de capture serait modifier le fichier 04 (11 §8-2).
//
// ── INVARIANT 2 ─────────────────────────────────────────────────────────────
// Rien ici ne connaît un client : ni nom d'unité, ni effectif, ni libellé de
// mission n'apparaît dans un message. Les avertissements ne nomment que des
// CODES DE RÉFÉRENTIEL (bloc, service, profil) et des identifiants de question.
//
// Traçabilité : E11 (questionnaire généré et figé par mission — la sélection et
// l'ordre que le figeage capture) · E10 (banque de questions unique versionnée —
// seules les questions actives de la banque sont assemblées) · E2 (toutes
// tailles, 4 paliers — filtre de palier) · E3 (tous secteurs, paquets sectoriels
// — filtre de secteur) · E4 (arbre organisationnel — les unités du périmètre
// commandent les paquets par service) · E30 (3 niveaux d'audit — filtre de
// niveau) · E12 (entretiens par interlocuteur — projection par profil).
// =============================================================================
import type {
  blocks,
  interlocutorProfiles,
  missions,
  orgUnits,
  questions,
  sizeTiers,
} from '../../db/schema.js';

// -----------------------------------------------------------------------------
// 1. LES ENTRÉES — des LIGNES, jamais des DTO
//
// Chaque type d'entrée est un `Pick<…$inferSelect>` de la ligne Drizzle : ce que
// l'assembleur lit est exactement ce que la base porte, avec ses `null` et ses
// `unknown`. En particulier `weight` est un `numeric` PostgreSQL, donc une
// CHAÎNE côté pilote : la faire transiter par `number` arrondirait en silence
// (brief §9-1). Elle n'est jamais convertie ici.
//
// Les colonnes JSONB (`sectors`, `target_services`, `levels`, `profiles`,
// `active_blocks`, `active_sectors`) sont typées `unknown` : PostgreSQL n'y
// vérifie RIEN. Elles sont lues par `lireCodes`, qui n'invente jamais une
// restriction à partir d'une donnée illisible mais la SIGNALE.
// -----------------------------------------------------------------------------

/** Ce que l'assembleur lit de `missions` — et rien de plus. */
export type LigneMissionAssemblage = Pick<
  typeof missions.$inferSelect,
  'activeBlocks' | 'activeSectors' | 'auditLevel' | 'geoScope'
>;

/** Le palier de la mission (`size_tiers`), résolu par le dépôt. `null` = aucun. */
export type LignePalierAssemblage = Pick<
  typeof sizeTiers.$inferSelect,
  'code' | 'headcountMin' | 'headcountMax'
>;

/**
 * Une unité de l'arbre, jointe à `services.code` par `service_ref_id`.
 *
 * `inScope` et `status` sont RE-VÉRIFIÉS ici bien que le dépôt filtre déjà en
 * SQL : une fonction pure qui redit sa propre précondition ne dépend pas de la
 * mémoire de son appelant, et la vérification coûte un booléen.
 */
export type LigneUniteAssemblage = Pick<typeof orgUnits.$inferSelect, 'inScope' | 'status'> & {
  readonly serviceCode: string | null;
};

/** La ligne de banque, telle quelle — source des 8 colonnes de capture. */
export type LigneQuestionBanque = Pick<
  typeof questions.$inferSelect,
  | 'id'
  | 'code'
  | 'blockId'
  | 'version'
  | 'status'
  | 'origin'
  | 'textFr'
  | 'guidanceFr'
  | 'answerType'
  | 'options'
  | 'allowRange'
  | 'weight'
  | 'scoring'
  | 'criticality'
  | 'expectedSource'
  | 'sectors'
  | 'targetServices'
  | 'levels'
  | 'headcountMin'
  | 'headcountMax'
  | 'profiles'
  | 'geo'
  | 'displayIf'
>;

/** Le bloc porteur : sa `position` ouvre l'ordre de tri (03 M2 §2). */
export type LigneBlocBanque = Pick<typeof blocks.$inferSelect, 'id' | 'code' | 'position'>;

/** Une question et son bloc — la jointure est faite par le dépôt, pas ici. */
export interface QuestionDeBanque {
  readonly question: LigneQuestionBanque;
  readonly bloc: LigneBlocBanque;
}

/** Le référentiel des profils d'interlocuteur (seedé, jamais codé en dur). */
export type LigneProfilAssemblage = Pick<
  typeof interlocutorProfiles.$inferSelect,
  'code' | 'groupCode'
>;

/** Tout ce dont l'assemblage a besoin. Aucun champ n'est deviné, aucun n'est lu ailleurs. */
export interface EntreeAssemblage {
  readonly mission: LigneMissionAssemblage;
  readonly palier: LignePalierAssemblage | null;
  readonly unites: readonly LigneUniteAssemblage[];
  readonly questions: readonly QuestionDeBanque[];
  readonly profils: readonly LigneProfilAssemblage[];
}

// -----------------------------------------------------------------------------
// 2. LES SORTIES
// -----------------------------------------------------------------------------

/** Les 7 filtres, dans l'ordre d'application. L'interlocuteur n'y est pas : c'est une projection. */
export const FILTRES_ASSEMBLAGE = [
  'statut_origine',
  'bloc_actif',
  'palier',
  'secteur',
  'niveau_audit',
  'geo',
  'services_arbre',
] as const;

export type FiltreAssemblage = (typeof FILTRES_ASSEMBLAGE)[number];

/**
 * Le nom FRANÇAIS de chaque filtre (invariant 5).
 *
 * Le service en a besoin pour le message du 409 qui refuse de figer une
 * sélection vide : « nommant le premier filtre qui a vidé l'ensemble » (brief §3).
 */
export const LIBELLES_FILTRE_ASSEMBLAGE: Record<FiltreAssemblage, string> = {
  statut_origine: 'statut et origine de la question',
  bloc_actif: 'blocs actifs de la mission',
  palier: "palier d'effectif de la mission",
  secteur: "secteurs d'activité de la mission",
  niveau_audit: "niveau d'audit de la mission",
  geo: 'périmètre géographique de la mission',
  services_arbre: "services présents dans le périmètre de l'arbre",
};

/** Un cran de l'entonnoir : combien de questions entrent dans un filtre, combien en sortent. */
export interface EtapeEntonnoir {
  readonly filtre: FiltreAssemblage;
  readonly avant: number;
  readonly apres: number;
}

/**
 * Codes d'avertissement d'assemblage.
 *
 * Ce ne sont PAS des codes d'erreur d'API : un avertissement n'interrompt rien
 * (brief §3, « un bloc actif sans question n'est pas une erreur »). Ils sont
 * définis localement tant que T1 n'a pas livré `packages/shared/src/questionnaire.ts` ;
 * leur place définitive est là-bas, avec le schéma Zod de la prévisualisation.
 */
export const AVERTISSEMENTS_ASSEMBLAGE = {
  BLOC_ACTIF_INCONNU: 'BLOC_ACTIF_INCONNU',
  BLOC_ACTIF_SANS_QUESTION: 'BLOC_ACTIF_SANS_QUESTION',
  PALIER_ABSENT: 'PALIER_ABSENT',
  PERIMETRE_SANS_UNITE: 'PERIMETRE_SANS_UNITE',
  SERVICE_SANS_PAQUET: 'SERVICE_SANS_PAQUET',
  PROFIL_INCONNU: 'PROFIL_INCONNU',
  ETIQUETTE_ILLISIBLE: 'ETIQUETTE_ILLISIBLE',
} as const;

export type CodeAvertissementAssemblage =
  (typeof AVERTISSEMENTS_ASSEMBLAGE)[keyof typeof AVERTISSEMENTS_ASSEMBLAGE];

/** Un avertissement nommé, en français, sans une once de donnée client. */
export interface AvertissementAssemblage {
  readonly code: CodeAvertissementAssemblage;
  readonly message: string;
}

/**
 * LES 8 COLONNES DE CAPTURE de `mission_questions`, plus l'identité de la ligne
 * pointée. Chaque champ est typé par la colonne SOURCE (`LigneQuestionBanque[…]`) :
 * la capture ne peut donc pas changer de type sans que le schéma change.
 *
 * `id` (UUID v7 applicatif) et `missionId` n'y sont PAS : ils appartiennent à
 * l'écriture, qui n'est pas pure.
 */
export interface CaptureQuestion {
  readonly questionId: LigneQuestionBanque['id'];
  readonly questionVersion: LigneQuestionBanque['version'];
  readonly textSnapshot: LigneQuestionBanque['textFr'];
  /** Consigne + ANCRES DE COTATION §32.4 — doivent être lisibles HORS LIGNE. */
  readonly guidanceSnapshot: LigneQuestionBanque['guidanceFr'];
  readonly answerTypeSnapshot: LigneQuestionBanque['answerType'];
  readonly optionsSnapshot: LigneQuestionBanque['options'];
  /** `numeric` PostgreSQL : une CHAÎNE, recopiée telle quelle (brief §9-1). */
  readonly weightSnapshot: LigneQuestionBanque['weight'];
  readonly scoringSnapshot: LigneQuestionBanque['scoring'];
  readonly criticalitySnapshot: LigneQuestionBanque['criticality'];
  readonly allowRangeSnapshot: LigneQuestionBanque['allowRange'];
  /** Une question assemblée par M2 ne vient jamais du terrain. */
  readonly addedAdHoc: false;
}

/** Le ROUTAGE : lu à la volée sur la ligne pointée, JAMAIS capturé (note L3 §3.a). */
export interface RoutageQuestion {
  readonly questionCode: LigneQuestionBanque['code'];
  readonly blocId: LigneBlocBanque['id'];
  readonly blocCode: LigneBlocBanque['code'];
  readonly blocPosition: LigneBlocBanque['position'];
  readonly profils: readonly string[];
  readonly servicesCibles: readonly string[];
  readonly secteurs: readonly string[];
  readonly niveaux: readonly string[];
  readonly geo: LigneQuestionBanque['geo'];
  readonly effectifMin: LigneQuestionBanque['headcountMin'];
  readonly effectifMax: LigneQuestionBanque['headcountMax'];
  readonly sourceAttendue: LigneQuestionBanque['expectedSource'];
  readonly conditionAffichage: LigneQuestionBanque['displayIf'];
}

/** Une question retenue, à son rang définitif. */
export interface QuestionAssemblee {
  /** Rang 1..n dans l'ordre déterministe — devient `mission_questions.position`. */
  readonly position: number;
  readonly capture: CaptureQuestion;
  readonly routage: RoutageQuestion;
}

/** La répartition par bloc, dans l'ordre des blocs (prévisualisation §33.4). */
export interface RepartitionBloc {
  readonly blocId: string;
  readonly blocCode: string;
  readonly blocPosition: number | null;
  readonly total: number;
}

/**
 * Le PARCOURS d'un profil : la projection de M2 §3.
 *
 * `profiles = []` sur une question = tous les profils. Un profil sans question
 * figure quand même, à zéro : un parcours vide est une information, pas un trou.
 */
export interface ParcoursProfil {
  readonly profilCode: string;
  readonly groupCode: LigneProfilAssemblage['groupCode'];
  readonly total: number;
  readonly questionIds: readonly string[];
}

/** Ce que rend l'assembleur. Aucun champ optionnel : rien n'est « parfois là ». */
export interface SortieAssemblage {
  readonly total: number;
  readonly questions: readonly QuestionAssemblee[];
  readonly parBloc: readonly RepartitionBloc[];
  readonly parProfil: readonly ParcoursProfil[];
  /** Les codes de service portés par les unités retenues, triés, dédoublonnés. */
  readonly servicesDuPerimetre: readonly string[];
  /** Combien de questions chaque filtre a laissé passer — la trace de la sélection. */
  readonly entonnoir: readonly EtapeEntonnoir[];
  /** Le premier filtre qui a vidé un ensemble non vide, s'il existe. */
  readonly premierFiltreVidant: FiltreAssemblage | null;
  readonly avertissements: readonly AvertissementAssemblage[];
}

// -----------------------------------------------------------------------------
// 3. LECTURE DÉFENSIVE DES ÉTIQUETTES JSONB
// -----------------------------------------------------------------------------

/** Garde de type sans `any` : `Array.isArray` seul rendrait `any[]` (11 §3). */
function estTableau(valeur: unknown): valeur is readonly unknown[] {
  return Array.isArray(valeur);
}

interface LectureCodes {
  readonly codes: readonly string[];
  /** Vrai si la colonne portait autre chose qu'une liste de codes non vides. */
  readonly illisible: boolean;
}

/**
 * Lit une colonne JSONB d'étiquettes comme une liste de CODES.
 *
 * `null`, absente ou vide → liste vide, sans avertissement : c'est la convention
 * du pack (`[]` = universelle / transverse) et l'arbitrage du 2026-09-01
 * (`active_blocks` / `active_sectors` vides = AUCUNE restriction).
 * Tout le reste → liste vide **et** `illisible`, parce qu'une étiquette qu'on ne
 * sait pas lire ne doit ni restreindre en silence, ni passer en silence.
 */
function lireCodes(valeur: unknown): LectureCodes {
  if (valeur === null || valeur === undefined) return { codes: [], illisible: false };
  if (!estTableau(valeur)) return { codes: [], illisible: true };

  const codes: string[] = [];
  let illisible = false;
  for (const element of valeur) {
    if (typeof element !== 'string') {
      illisible = true;
      continue;
    }
    const code = element.trim();
    if (code.length === 0) illisible = true;
    else codes.push(code);
  }
  return { codes, illisible };
}

/** Intersection non vide entre une étiquette et un ensemble de codes. */
function seCroisent(etiquette: readonly string[], ensemble: ReadonlySet<string>): boolean {
  return etiquette.some((code) => ensemble.has(code));
}

/**
 * RECOUVREMENT de deux intervalles d'effectif, `null` = borne ouverte.
 *
 * C'est la règle de palier arbitrée (brief §8-3) : on compare le palier de la
 * mission à la fourchette de la question, jamais un effectif de client.
 */
function intervallesSeRecouvrent(
  minA: number | null,
  maxA: number | null,
  minB: number | null,
  maxB: number | null,
): boolean {
  const basA = minA ?? Number.NEGATIVE_INFINITY;
  const hautA = maxA ?? Number.POSITIVE_INFINITY;
  const basB = minB ?? Number.NEGATIVE_INFINITY;
  const hautB = maxB ?? Number.POSITIVE_INFINITY;
  return basA <= hautB && basB <= hautA;
}

// -----------------------------------------------------------------------------
// 4. L'ORDRE — total, déterministe, sans collation
//
// `DECISIONS.md` 2026-09-01 : « position du bloc, code (les absents en dernier),
// identifiant ». Les comparaisons de chaînes se font sur les UNITÉS DE CODE
// (`<` / `>`), jamais par `localeCompare` : une collation dépend de l'endroit où
// tourne le processus, et un ordre figé ne peut pas dépendre de cela.
// -----------------------------------------------------------------------------

function comparerChaines(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Un code absent passe TOUJOURS après un code présent. */
function comparerCodesOptionnels(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return comparerChaines(a, b);
}

/** Une position absente passe TOUJOURS après une position renseignée. */
function comparerPositions(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// -----------------------------------------------------------------------------
// 5. L'ASSEMBLAGE
// -----------------------------------------------------------------------------

/** Une question candidate, avec ses étiquettes déjà lues une fois pour toutes. */
interface Candidat {
  readonly source: QuestionDeBanque;
  readonly secteurs: readonly string[];
  readonly niveaux: readonly string[];
  readonly servicesCibles: readonly string[];
  readonly profils: readonly string[];
}

/** Le nom d'une question dans un message : son code de banque, sinon son identifiant. */
function nommerQuestion(question: LigneQuestionBanque): string {
  return question.code ?? question.id;
}

/**
 * Assemble le questionnaire d'une mission (03 M2).
 *
 * PURE : mêmes entrées → même sortie, à l'octet. Ne lève jamais : une sélection
 * vide est une sortie vide, `premierFiltreVidant` renseigné.
 */
export function assembler(entree: EntreeAssemblage): SortieAssemblage {
  const avertissements: AvertissementAssemblage[] = [];
  const signaler = (code: CodeAvertissementAssemblage, message: string): void => {
    avertissements.push({ code, message });
  };

  // --- 5.1 Les étiquettes de la mission ------------------------------------
  const blocsActifs = lireCodes(entree.mission.activeBlocks);
  const secteursActifs = lireCodes(entree.mission.activeSectors);
  if (blocsActifs.illisible) {
    signaler(
      AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE,
      "L'étiquette « active_blocks » de la mission n'est pas une liste de codes exploitable : " +
        'les valeurs illisibles ont été ignorées.',
    );
  }
  if (secteursActifs.illisible) {
    signaler(
      AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE,
      "L'étiquette « active_sectors » de la mission n'est pas une liste de codes exploitable : " +
        'les valeurs illisibles ont été ignorées.',
    );
  }
  const ensembleBlocsActifs = new Set(blocsActifs.codes);
  const ensembleSecteursActifs = new Set(secteursActifs.codes);

  // --- 5.2 Le périmètre de l'arbre -----------------------------------------
  // Une unité hors périmètre ou fusionnée ne commande aucun paquet de service
  // (03 §16.3, §25.1) — ses données restent, elles ne pilotent plus rien.
  const unitesRetenues = entree.unites.filter(
    (unite) => unite.inScope && unite.status === 'active',
  );
  const servicesDuPerimetre = [
    ...new Set(
      unitesRetenues
        .map((unite) => unite.serviceCode?.trim() ?? '')
        .filter((code) => code.length > 0),
    ),
  ].sort(comparerChaines);
  const ensembleServicesDuPerimetre = new Set(servicesDuPerimetre);

  if (unitesRetenues.length === 0) {
    signaler(
      AVERTISSEMENTS_ASSEMBLAGE.PERIMETRE_SANS_UNITE,
      "Aucune unité de l'arbre n'est à la fois dans le périmètre et active : " +
        'toute question ciblant un service a été écartée.',
    );
  }
  if (entree.palier === null) {
    signaler(
      AVERTISSEMENTS_ASSEMBLAGE.PALIER_ABSENT,
      "La mission ne porte aucun palier d'effectif : le filtre de palier n'a pas été appliqué.",
    );
  }

  // --- 5.3 L'entonnoir ------------------------------------------------------
  const entonnoir: EtapeEntonnoir[] = [];

  // Filtre 1 — statut et origine, sur les lignes brutes.
  const avantStatut = entree.questions.length;
  const vivantes = entree.questions.filter(
    (ligne) => ligne.question.status === 'active' && ligne.question.origin === 'banque',
  );
  entonnoir.push({ filtre: 'statut_origine', avant: avantStatut, apres: vivantes.length });

  // Les étiquettes de chaque survivante, lues UNE seule fois.
  const etiquettesIllisibles: string[] = [];
  let candidats: readonly Candidat[] = vivantes.map((ligne) => {
    const secteurs = lireCodes(ligne.question.sectors);
    const niveaux = lireCodes(ligne.question.levels);
    const servicesCibles = lireCodes(ligne.question.targetServices);
    const profils = lireCodes(ligne.question.profiles);
    if (secteurs.illisible || niveaux.illisible || servicesCibles.illisible || profils.illisible) {
      etiquettesIllisibles.push(nommerQuestion(ligne.question));
    }
    return {
      source: ligne,
      secteurs: secteurs.codes,
      niveaux: niveaux.codes,
      servicesCibles: servicesCibles.codes,
      profils: profils.codes,
    };
  });
  for (const nom of [...new Set(etiquettesIllisibles)].sort(comparerChaines)) {
    signaler(
      AVERTISSEMENTS_ASSEMBLAGE.ETIQUETTE_ILLISIBLE,
      `Les étiquettes de la question « ${nom} » ne sont pas toutes des listes de codes ` +
        'exploitables : les valeurs illisibles ont été ignorées (aucune restriction déduite).',
    );
  }

  // Filtres 2 à 7 — l'ordre du brief §3, appliqué tel quel.
  const palier = entree.palier;
  const filtres: readonly {
    readonly code: FiltreAssemblage;
    readonly garde: (candidat: Candidat) => boolean;
  }[] = [
    {
      code: 'bloc_actif',
      garde: (c) => ensembleBlocsActifs.size === 0 || ensembleBlocsActifs.has(c.source.bloc.code),
    },
    {
      code: 'palier',
      garde: (c) =>
        palier === null ||
        intervallesSeRecouvrent(
          palier.headcountMin,
          palier.headcountMax,
          c.source.question.headcountMin,
          c.source.question.headcountMax,
        ),
    },
    {
      code: 'secteur',
      garde: (c) =>
        ensembleSecteursActifs.size === 0 ||
        c.secteurs.length === 0 ||
        seCroisent(c.secteurs, ensembleSecteursActifs),
    },
    {
      code: 'niveau_audit',
      garde: (c) => c.niveaux.length === 0 || c.niveaux.includes(entree.mission.auditLevel),
    },
    {
      code: 'geo',
      garde: (c) =>
        c.source.question.geo === 'tous' || c.source.question.geo === entree.mission.geoScope,
    },
    {
      code: 'services_arbre',
      garde: (c) =>
        c.servicesCibles.length === 0 || seCroisent(c.servicesCibles, ensembleServicesDuPerimetre),
    },
  ];

  for (const filtre of filtres) {
    const avant = candidats.length;
    candidats = candidats.filter((candidat) => filtre.garde(candidat));
    entonnoir.push({ filtre: filtre.code, avant, apres: candidats.length });
  }

  const premierFiltreVidant =
    entonnoir.find((etape) => etape.avant > 0 && etape.apres === 0)?.filtre ?? null;

  // --- 5.4 L'ordre ----------------------------------------------------------
  const ordonnees = [...candidats].sort((a, b) => {
    const parPositionDeBloc = comparerPositions(a.source.bloc.position, b.source.bloc.position);
    if (parPositionDeBloc !== 0) return parPositionDeBloc;
    // Deux blocs de même position (ou sans position) restent départagés :
    // un ordre partiel n'est pas un ordre.
    const parCodeDeBloc = comparerChaines(a.source.bloc.code, b.source.bloc.code);
    if (parCodeDeBloc !== 0) return parCodeDeBloc;
    const parIdDeBloc = comparerChaines(a.source.bloc.id, b.source.bloc.id);
    if (parIdDeBloc !== 0) return parIdDeBloc;
    const parCode = comparerCodesOptionnels(a.source.question.code, b.source.question.code);
    if (parCode !== 0) return parCode;
    return comparerChaines(a.source.question.id, b.source.question.id);
  });

  const questionsAssemblees: QuestionAssemblee[] = ordonnees.map((candidat, index) => {
    const question = candidat.source.question;
    return {
      position: index + 1,
      capture: {
        questionId: question.id,
        questionVersion: question.version,
        textSnapshot: question.textFr,
        guidanceSnapshot: question.guidanceFr,
        answerTypeSnapshot: question.answerType,
        optionsSnapshot: question.options,
        weightSnapshot: question.weight,
        scoringSnapshot: question.scoring,
        criticalitySnapshot: question.criticality,
        allowRangeSnapshot: question.allowRange,
        addedAdHoc: false,
      },
      routage: {
        questionCode: question.code,
        blocId: candidat.source.bloc.id,
        blocCode: candidat.source.bloc.code,
        blocPosition: candidat.source.bloc.position,
        profils: candidat.profils,
        servicesCibles: candidat.servicesCibles,
        secteurs: candidat.secteurs,
        niveaux: candidat.niveaux,
        geo: question.geo,
        effectifMin: question.headcountMin,
        effectifMax: question.headcountMax,
        sourceAttendue: question.expectedSource,
        conditionAffichage: question.displayIf,
      },
    };
  });

  // --- 5.5 Les répartitions -------------------------------------------------
  const parBloc: RepartitionBloc[] = [];
  const rangDuBloc = new Map<string, number>();
  for (const assemblee of questionsAssemblees) {
    const rang = rangDuBloc.get(assemblee.routage.blocId);
    if (rang === undefined) {
      rangDuBloc.set(assemblee.routage.blocId, parBloc.length);
      parBloc.push({
        blocId: assemblee.routage.blocId,
        blocCode: assemblee.routage.blocCode,
        blocPosition: assemblee.routage.blocPosition,
        total: 1,
      });
      continue;
    }
    const existant = parBloc[rang];
    if (existant !== undefined) parBloc[rang] = { ...existant, total: existant.total + 1 };
  }

  // La PROJECTION par profil (M2 §3) : `profiles = []` = tous les profils.
  const profilsConnus = [...entree.profils].sort((a, b) => comparerChaines(a.code, b.code));
  const codesProfilsConnus = new Set(profilsConnus.map((profil) => profil.code));
  const parProfil: ParcoursProfil[] = profilsConnus.map((profil) => {
    const questionIds = questionsAssemblees
      .filter(
        (assemblee) =>
          assemblee.routage.profils.length === 0 || assemblee.routage.profils.includes(profil.code),
      )
      .map((assemblee) => assemblee.capture.questionId);
    return {
      profilCode: profil.code,
      groupCode: profil.groupCode,
      total: questionIds.length,
      questionIds,
    };
  });

  // --- 5.6 Les avertissements de couverture --------------------------------
  const blocsServis = new Set(questionsAssemblees.map((assemblee) => assemblee.routage.blocCode));
  const blocsDeLaBanque = new Set(entree.questions.map((ligne) => ligne.bloc.code));
  for (const code of [...ensembleBlocsActifs].sort(comparerChaines)) {
    if (!blocsDeLaBanque.has(code)) {
      signaler(
        AVERTISSEMENTS_ASSEMBLAGE.BLOC_ACTIF_INCONNU,
        `Le bloc « ${code} » est actif sur la mission mais aucune question de la banque ne s'y ` +
          'rattache.',
      );
      continue;
    }
    if (!blocsServis.has(code)) {
      signaler(
        AVERTISSEMENTS_ASSEMBLAGE.BLOC_ACTIF_SANS_QUESTION,
        `Le bloc « ${code} » est actif sur la mission mais aucune de ses questions n'a passé ` +
          'les filtres : il ne sera pas couvert.',
      );
    }
  }

  const servicesServis = new Set(
    questionsAssemblees.flatMap((assemblee) => [...assemblee.routage.servicesCibles]),
  );
  for (const code of servicesDuPerimetre) {
    if (!servicesServis.has(code)) {
      signaler(
        AVERTISSEMENTS_ASSEMBLAGE.SERVICE_SANS_PAQUET,
        `Le service « ${code} » est présent dans le périmètre mais aucune question retenue ne le ` +
          'cible : ce service ne sera sondé que par les questions transverses.',
      );
    }
  }

  const profilsInconnus = new Map<string, number>();
  for (const assemblee of questionsAssemblees) {
    for (const code of assemblee.routage.profils) {
      if (codesProfilsConnus.has(code)) continue;
      profilsInconnus.set(code, (profilsInconnus.get(code) ?? 0) + 1);
    }
  }
  for (const code of [...profilsInconnus.keys()].sort(comparerChaines)) {
    const nombre = profilsInconnus.get(code) ?? 0;
    signaler(
      AVERTISSEMENTS_ASSEMBLAGE.PROFIL_INCONNU,
      `Le profil d'interlocuteur « ${code} », cité par ${String(nombre)} question(s) retenue(s), ` +
        "est absent du référentiel : ces questions n'apparaîtront dans aucun parcours.",
    );
  }

  // L'ordre des avertissements est lui aussi déterministe : deux appels
  // identiques rendent la même liste, dans le même ordre.
  avertissements.sort(
    (a, b) => comparerChaines(a.code, b.code) || comparerChaines(a.message, b.message),
  );

  return {
    total: questionsAssemblees.length,
    questions: questionsAssemblees,
    parBloc,
    parProfil,
    servicesDuPerimetre,
    entonnoir,
    premierFiltreVidant,
    avertissements,
  };
}
