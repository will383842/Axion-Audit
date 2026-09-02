// =============================================================================
// PLAN D'ENTRETIENS — GÉNÉRATEUR §32.4. Lot L3, incrément L3d, tâche T4.
//
// Le 03 §32.4 tient en une phrase, et cette phrase est la SEULE source de ce
// fichier : « unité ≤ 10 pers. → 1-2 entretiens · 11-50 → 3 entretiens · 51-200
// → 4-6 entretiens + 1 observation · > 200 → 6-10 entretiens + observation +
// démonstration + relevé de données. Le consultant peut dévier (le plan est un
// guide) ; l'écart est visible dans la couverture. »
// Elle est transcrite ci-dessous en DONNÉE (`REGLES_ECHANTILLONNAGE`), pas en
// `if` : une règle d'échantillonnage qui vit dans un branchement se relit mal, se
// teste mal, et ne s'affiche pas. Aucune tranche, aucun `n`, aucun type de
// session complémentaire n'a été ajouté à ce que le §32.4 écrit.
//
// ── CE QUE CETTE FONCTION EST : PURE, ET REPRODUCTIBLE À L'OCTET ─────────────
// Aucune E/S, aucune lecture d'horloge, aucun aléa. Deux appels sur les mêmes
// données rendent le MÊME plan, comparable par `toEqual` strict. Trois
// mécanismes, tous vérifiables :
//   1. l'ordre de parcours est TOTAL et stable — `org_units.position` croissante,
//      les `position` nulles en dernier, puis `id` (UUID v7, donc ordre de
//      création) ; jamais l'ordre d'arrivée du dépôt, qu'aucun `ORDER BY` ne
//      garantit ;
//   2. les fourchettes du §32.4 sont rendues COMME DES FOURCHETTES
//      (`{ min, max }`) et jamais tirées au sort dans l'intervalle : un
//      intervalle est une donnée, pas un tirage. Il n'y a donc AUCUNE sélection
//      aléatoire à neutraliser — `Math.random` n'aurait ici pas même de sens ;
//   3. l'horodatage de génération n'est pas lu, il est REÇU (`genereLe`) et
//      recopié tel quel. Une fonction qui lit l'heure n'est pas reproductible,
//      et c'est toujours par là que la reproductibilité s'en va.
//
// ── CE QU'ELLE N'EST PAS ────────────────────────────────────────────────────
//   · Elle n'écrit RIEN. Le plan est une CIBLE, pas des lignes `interviews` :
//     `interviews.conducted_by` est NOT NULL au 04 alors qu'un plan ne nomme
//     aucun auditeur (escalade ouverte, `DECISIONS.md` 2026-08-31 [L3d]) — le
//     statu quo arbitré est « fonction pure non persistée », et il est tenu ici
//     par construction : ce module n'importe ni la base, ni un dépôt.
//   · Elle ne chiffre RIEN PAR PROFIL. `interviews.interlocutor_profile_id`
//     n'existe pas au 04 (arbitrage `DECISIONS.md` 2026-09-01 [L3d]) : le plan
//     est listé PAR UNITÉ, et les profils sont LISTÉS (`profilsACouvrir`), sans
//     le moindre nombre. Chiffrer par profil inventerait du périmètre — et une
//     donnée qu'aucune table ne pourrait recevoir.
//   · Elle ne journalise rien et n'est pas journalisable : elle recopie des noms
//     d'unités et des effectifs du client (11 §2).
//   · Elle ne lit PAS `missions.audit_level` pour dimensionner : le §32.4 ne
//     chiffre que par EFFECTIF. Le niveau est reçu et recopié au plan pour dire
//     sous quel niveau il a été calculé — jamais pour le modifier.
//
// ── UNE LISTE VIDE EST UN RÉSULTAT ──────────────────────────────────────────
// Toutes les unités hors périmètre, une mission sans unité, une unité unique :
// le plan sort vide ou minuscule, avec un avertissement NOMMÉ, et jamais une
// exception. Une mission sans unité in_scope est un état légitime de la
// préparation ; la traiter en erreur obligerait l'appelant à distinguer un vide
// d'une panne.
//
// Traçabilité : E25 (zéro oubli : plan, couverture, contrôles) · E40 (ROI normé,
// échantillonnage, ancres — les règles d'échantillonnage du §32.4) · E4 (arbre
// organisationnel de profondeur libre : le plan se dimensionne unité par unité,
// sans jamais parcourir l'arbre en profondeur). Critère n° 4 du lot L3
// (fichier 07) : « plan d'entretiens généré conforme aux n minimaux §32.4 ».
// =============================================================================
import type {
  GroupeInterlocuteur,
  ModeEntretien,
  NiveauAudit,
  TypeSession,
  TypeUnite,
  interlocutorProfiles,
  missions,
  orgUnits,
} from '../../db/schema.js';

// -----------------------------------------------------------------------------
// LES ENTRÉES — DES LIGNES DE BASE, PAS DES DTO
// -----------------------------------------------------------------------------
// Les types d'entrée sont dérivés des lignes Drizzle (`$inferSelect`) par `Pick` :
// l'appelant passe ses lignes telles qu'il les a lues, sans les remodeler, et le
// jour où le 04 renomme une colonne, c'est ICI que la compilation casse.

/** L'unité telle que le générateur la lit. Aucune autre colonne n'est utilisée. */
export type UnitePourPlan = Pick<
  typeof orgUnits.$inferSelect,
  | 'id'
  | 'missionId'
  | 'parentId'
  | 'kind'
  | 'name'
  | 'headcount'
  | 'inScope'
  | 'status'
  | 'position'
>;

/** La mission : son identité (cadrage, invariant 3) et son niveau d'audit. */
export type MissionPourPlan = Pick<typeof missions.$inferSelect, 'id' | 'auditLevel'>;

/** Un profil d'interlocuteur du référentiel seedé (11 §5) — LISTÉ, jamais chiffré. */
export type ProfilPourPlan = Pick<
  typeof interlocutorProfiles.$inferSelect,
  'code' | 'labelFr' | 'groupCode'
>;

export interface EntreePlanEntretiens {
  readonly mission: MissionPourPlan;
  /** L'arbre de la mission, à plat. Les unités d'une autre mission sont écartées. */
  readonly unites: readonly UnitePourPlan[];
  /** Les profils à proposer. Le générateur ne les FILTRE pas : il les ordonne. */
  readonly profils: readonly ProfilPourPlan[];
  /**
   * Horodatage de génération, ISO 8601 UTC, **fourni par l'appelant**. Absent =
   * `null` au plan. Jamais lu d'une horloge : voir l'en-tête, point 3.
   */
  readonly genereLe?: string | null;
}

// -----------------------------------------------------------------------------
// LES QUATRE RÈGLES DU §32.4 — TRANSCRITES, PAS INTERPRÉTÉES
// -----------------------------------------------------------------------------

export const CODES_REGLE_ECHANTILLONNAGE = [
  'unite_10_ou_moins',
  'unite_11_a_50',
  'unite_51_a_200',
  'unite_plus_de_200',
] as const;

export type CodeRegleEchantillonnage = (typeof CODES_REGLE_ECHANTILLONNAGE)[number];

/** Un type de session complémentaire et son compte, tels que le §32.4 les énonce. */
export interface SessionComplementaire {
  readonly kind: TypeSession;
  readonly nombre: number;
}

export interface RegleEchantillonnage {
  readonly code: CodeRegleEchantillonnage;
  /** Borne basse INCLUSE de l'effectif. */
  readonly effectifMin: number;
  /** Borne haute INCLUSE ; `null` = tranche ouverte (« > 200 »). */
  readonly effectifMax: number | null;
  /** La fourchette du §32.4. `min` est le **n minimal** que le critère n° 4 vérifie. */
  readonly entretiens: { readonly min: number; readonly max: number };
  readonly sessionsComplementaires: readonly SessionComplementaire[];
  /** Libellé affichable, en français (invariant 5). */
  readonly libelle: string;
}

/**
 * Les quatre tranches du 03 §32.4, dans l'ordre du texte.
 *
 * Deux endroits où le texte est plus court que le code, et où l'on a choisi la
 * lecture la plus littérale :
 *   · « 51-200 → 4-6 entretiens **+ 1 observation** » chiffre son observation ;
 *     « > 200 → … + observation + démonstration + relevé de données » ne chiffre
 *     rien. Une session complémentaire non chiffrée est comptée **1**, jamais
 *     une fourchette inventée ;
 *   · les tranches sont contiguës et fermées à gauche à 0 : un effectif de 0
 *     tombe dans « ≤ 10 ». Un effectif absent ou négatif n'est pas un effectif —
 *     il est traité comme INCONNU (voir `effectifEstConnu`).
 */
export const REGLES_ECHANTILLONNAGE: readonly RegleEchantillonnage[] = [
  {
    code: 'unite_10_ou_moins',
    effectifMin: 0,
    effectifMax: 10,
    entretiens: { min: 1, max: 2 },
    sessionsComplementaires: [],
    libelle: 'Unité de 10 personnes ou moins : 1 à 2 entretiens.',
  },
  {
    code: 'unite_11_a_50',
    effectifMin: 11,
    effectifMax: 50,
    entretiens: { min: 3, max: 3 },
    sessionsComplementaires: [],
    libelle: 'Unité de 11 à 50 personnes : 3 entretiens.',
  },
  {
    code: 'unite_51_a_200',
    effectifMin: 51,
    effectifMax: 200,
    entretiens: { min: 4, max: 6 },
    sessionsComplementaires: [{ kind: 'observation', nombre: 1 }],
    libelle: 'Unité de 51 à 200 personnes : 4 à 6 entretiens et 1 observation.',
  },
  {
    code: 'unite_plus_de_200',
    effectifMin: 201,
    effectifMax: null,
    entretiens: { min: 6, max: 10 },
    sessionsComplementaires: [
      { kind: 'observation', nombre: 1 },
      { kind: 'demonstration', nombre: 1 },
      { kind: 'releve_donnees', nombre: 1 },
    ],
    libelle:
      'Unité de plus de 200 personnes : 6 à 10 entretiens, 1 observation, 1 démonstration et 1 relevé de données.',
  },
];

/**
 * La tranche appliquée à un effectif INCONNU : la plus basse (« ≤ 10 »).
 *
 * Ne rien proposer serait un silence — exactement ce que le §17.3 interdit
 * (« la collecte démarre avec une cible chiffrée par unité ») ; proposer la
 * tranche haute gonflerait le chiffrage sur une donnée absente. La tranche
 * minimale, plus un drapeau `effectifInconnu` visible et un avertissement nommé :
 * le plan dit ce qu'il ne sait pas.
 */
const REGLE_EFFECTIF_INCONNU: CodeRegleEchantillonnage = 'unite_10_ou_moins';

/** Libellés français des types de session (invariant 5), pour les justifications. */
const LIBELLES_TYPE_SESSION: Readonly<Record<TypeSession, string>> = {
  entretien: 'entretien',
  observation: 'observation',
  demonstration: 'démonstration',
  analyse_documentaire: 'analyse documentaire',
  releve_donnees: 'relevé de données',
  atelier: 'atelier',
};

/** Ordre d'affichage des profils : la hiérarchie de `group_code` (04, §32.1). */
const ORDRE_GROUPES: readonly GroupeInterlocuteur[] = ['direction', 'encadrement', 'terrain'];

/** Les seuls `kind` qu'un plan §32.4 peut produire, dans l'ordre du texte. */
const KINDS_DU_PLAN: readonly TypeSession[] = [
  'entretien',
  'observation',
  'demonstration',
  'releve_donnees',
];

// -----------------------------------------------------------------------------
// LA SORTIE
// -----------------------------------------------------------------------------

export interface ProfilACouvrir {
  readonly code: string;
  readonly libelle: string;
  readonly groupe: GroupeInterlocuteur;
}

/** Une session proposée — une ligne du plan, jamais une ligne `interviews`. */
export interface SessionProposee {
  /** Rang 1..n dans le plan entier, ordre stable. */
  readonly rang: number;
  /** Rang 1..n parmi les sessions du MÊME `kind` dans la MÊME unité. */
  readonly rangDansUnite: number;
  readonly orgUnitId: string;
  readonly orgUnitNom: string;
  readonly kind: TypeSession;
  /**
   * `sur_site` si `kind === 'entretien'`, `null` sinon — le défaut APPLICATIF du
   * 04 (V2.8 : « un DEFAULT SQL conditionnel n'existe pas »). Le plan propose ce
   * défaut ; le mode réel se décide à la planification (§25.2).
   */
  readonly mode: ModeEntretien | null;
  /** La règle §32.4 qui a produit cette ligne — la traçabilité de chaque session. */
  readonly regle: CodeRegleEchantillonnage;
  /** La même chose en français, affichable telle quelle au plan (§17.3). */
  readonly justification: string;
}

/** La cible dimensionnée d'une unité : ce que le §17.3 appelle « cible chiffrée ». */
export interface CibleUnite {
  readonly orgUnitId: string;
  readonly parentId: string | null;
  readonly nom: string;
  readonly kind: TypeUnite;
  readonly effectif: number | null;
  /** `true` si l'effectif est absent ou inexploitable : jamais un silence. */
  readonly effectifInconnu: boolean;
  readonly regle: CodeRegleEchantillonnage;
  /** La FOURCHETTE du §32.4, rendue telle quelle. */
  readonly entretiens: { readonly min: number; readonly max: number };
  readonly sessionsComplementaires: readonly SessionComplementaire[];
  /** Lignes réellement proposées pour cette unité (n minimal + complémentaires). */
  readonly sessionsProposees: number;
  /** LISTE, sans aucun chiffre (arbitrage `DECISIONS.md` 2026-09-01 [L3d]). */
  readonly profilsACouvrir: readonly ProfilACouvrir[];
}

/** Le bilan d'une règle : ce qu'elle EXIGE et ce qu'elle a produit. Règle par règle. */
export interface ApplicationRegle {
  readonly regle: CodeRegleEchantillonnage;
  readonly libelle: string;
  readonly effectifMin: number;
  readonly effectifMax: number | null;
  readonly nMinimalEntretiens: number;
  readonly nMaximalEntretiens: number;
  readonly sessionsComplementaires: readonly SessionComplementaire[];
  readonly unitesConcernees: number;
  readonly entretiensProposes: number;
  readonly sessionsComplementairesProposees: number;
}

export const CODES_AVERTISSEMENT_PLAN = [
  'aucune_unite_dans_le_perimetre',
  'effectif_inconnu',
  'unites_hors_perimetre_ignorees',
  'unites_non_actives_ignorees',
  'unites_hors_mission_ignorees',
] as const;

export type CodeAvertissementPlan = (typeof CODES_AVERTISSEMENT_PLAN)[number];

/**
 * Un avertissement : jamais une erreur, jamais un blocage.
 *
 * Les messages ne portent QUE des comptes — aucun nom d'unité, aucun effectif.
 * Un avertissement voyage plus loin qu'une réponse (bandeau, export, journal d'un
 * appelant distrait) ; les identifiants restent structurés dans `orgUnitIds`.
 */
export interface AvertissementPlan {
  readonly code: CodeAvertissementPlan;
  readonly message: string;
  readonly orgUnitIds: readonly string[];
}

export interface PlanEntretiens {
  readonly missionId: string;
  /** Recopié, jamais lu comme paramètre de dimensionnement (voir l'en-tête). */
  readonly niveauAudit: NiveauAudit;
  readonly genereLe: string | null;
  readonly sessions: readonly SessionProposee[];
  readonly parUnite: readonly CibleUnite[];
  /** Les quatre règles, TOUJOURS présentes, même à zéro unité concernée. */
  readonly reglesAppliquees: readonly ApplicationRegle[];
  readonly totaux: {
    readonly unitesRetenues: number;
    readonly unitesEcartees: number;
    readonly entretiens: { readonly min: number; readonly max: number };
    readonly sessionsProposees: number;
    readonly parKind: readonly SessionComplementaire[];
  };
  readonly avertissements: readonly AvertissementPlan[];
}

// -----------------------------------------------------------------------------
// LES OUTILS DE DÉTERMINISME
// -----------------------------------------------------------------------------

/**
 * Un effectif exploitable : entier, positif ou nul.
 *
 * `headcount` est INT NULL au 04 ; un import CSV (§35.2) ou une proposition
 * terrain (§25.3) peut laisser la colonne vide. Un nombre négatif ou fractionnaire
 * n'est pas un effectif : le traiter comme inconnu le rend VISIBLE, alors que le
 * ranger dans « ≤ 10 » l'aurait fait disparaître dans la tranche la plus banale.
 */
function effectifEstConnu(effectif: number | null): effectif is number {
  return effectif !== null && Number.isInteger(effectif) && effectif >= 0;
}

function regleParCode(code: CodeRegleEchantillonnage): RegleEchantillonnage {
  const trouvee = REGLES_ECHANTILLONNAGE.find((regle) => regle.code === code);
  if (trouvee === undefined) {
    throw new Error(`Règle d'échantillonnage §32.4 inconnue : ${code}`);
  }
  return trouvee;
}

/** La règle du §32.4 qui couvre cet effectif. Les quatre tranches sont exhaustives. */
function regleDeLEffectif(effectif: number): RegleEchantillonnage {
  const trouvee = REGLES_ECHANTILLONNAGE.find(
    (regle) =>
      effectif >= regle.effectifMin &&
      (regle.effectifMax === null || effectif <= regle.effectifMax),
  );
  // Les quatre tranches couvrent [0, +∞[ sans trou : ce repli n'est atteignable
  // que si quelqu'un modifie le tableau ci-dessus en y laissant un intervalle
  // vide. Il rend alors la tranche minimale plutôt que de faire tomber une
  // préparation de mission — et les tests aux bornes (10/11, 50/51, 200/201) le voient.
  return trouvee ?? regleParCode(REGLE_EFFECTIF_INCONNU);
}

/**
 * L'ordre TOTAL et stable du plan : `position` croissante, nulles en dernier,
 * puis `id`.
 *
 * La comparaison d'`id` est faite au caractère (`<` / `>`) et non par
 * `localeCompare` : une comparaison localisée dépend de l'ICU de la machine, donc
 * du serveur — un plan qui change d'ordre en changeant de machine ne serait pas
 * reproductible, et le défaut serait invisible en développement.
 */
function comparerUnites(a: UnitePourPlan, b: UnitePourPlan): number {
  const positionA = a.position;
  const positionB = b.position;
  if (positionA !== positionB) {
    if (positionA === null) return 1;
    if (positionB === null) return -1;
    return positionA - positionB;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Les profils, ordonnés par groupe (direction → encadrement → terrain) puis par code. */
function ordonnerProfils(profils: readonly ProfilPourPlan[]): readonly ProfilACouvrir[] {
  return [...profils]
    .sort((a, b) => {
      const rangA = ORDRE_GROUPES.indexOf(a.groupCode);
      const rangB = ORDRE_GROUPES.indexOf(b.groupCode);
      if (rangA !== rangB) return rangA - rangB;
      if (a.code === b.code) return 0;
      return a.code < b.code ? -1 : 1;
    })
    .map((profil) => ({ code: profil.code, libelle: profil.labelFr, groupe: profil.groupCode }));
}

/** Somme des sessions complémentaires exigées par une règle, pour UNE unité. */
function compterComplementaires(regle: RegleEchantillonnage): number {
  return regle.sessionsComplementaires.reduce((total, session) => total + session.nombre, 0);
}

// -----------------------------------------------------------------------------
// LE GÉNÉRATEUR
// -----------------------------------------------------------------------------

/**
 * Génère le plan d'entretiens d'une mission depuis son arbre in_scope.
 *
 * **Combien de lignes le plan propose-t-il ?** Le **n MINIMAL** de la règle, plus
 * les sessions complémentaires qu'elle exige. La fourchette haute n'est pas
 * matérialisée en lignes : elle est portée en donnée (`entretiens.max`), à
 * l'écran comme au chiffrage (§18.1.2). Matérialiser le maximum proposerait au
 * consultant des entretiens à supprimer — et le §32.4 dit « le plan est un
 * guide », pas « le plan est un maximum ». Le critère n° 4 du lot porte, lui, sur
 * les n MINIMAUX : ce sont eux qui sont tenus, règle par règle
 * (`reglesAppliquees`).
 *
 * Pure : mêmes entrées ⇒ même sortie, comparable par `toEqual` strict.
 */
export function genererPlan(entree: EntreePlanEntretiens): PlanEntretiens {
  const { mission, unites, profils } = entree;

  // ── Cadrage par la mission (invariant 3) ────────────────────────────────
  // Une unité d'une autre mission n'entre pas dans un plan, même passée par
  // erreur : elle est écartée ET nommée. Filtrer en silence laisserait un défaut
  // d'appelant se déguiser en plan complet.
  const horsMission = unites.filter((unite) => unite.missionId !== mission.id);
  const deLaMission = unites.filter((unite) => unite.missionId === mission.id);

  // Le §32.4 s'applique « par unité in_scope » ; le §25.3 réserve la couverture
  // aux unités `active` (une unité `proposee` doit d'abord être validée, une
  // `fusionnee` a été absorbée par une autre).
  const horsPerimetre = deLaMission.filter((unite) => !unite.inScope);
  const nonActives = deLaMission.filter((unite) => unite.inScope && unite.status !== 'active');
  const retenues = deLaMission
    .filter((unite) => unite.inScope && unite.status === 'active')
    .sort(comparerUnites);

  const profilsACouvrir = ordonnerProfils(profils);

  const sessions: SessionProposee[] = [];
  const parUnite: CibleUnite[] = [];
  const unitesSansEffectif: string[] = [];
  const unitesParRegle = new Map<CodeRegleEchantillonnage, number>();

  for (const unite of retenues) {
    // L'effectif est capté dans une variable locale AVANT le prédicat : c'est ce
    // qui permet à TypeScript de restreindre `number | null` à `number` sur la
    // branche « connu » (un accès de propriété ne se restreint pas par alias).
    const effectif = unite.headcount;
    const effectifConnu = effectifEstConnu(effectif);
    const regle = effectifConnu ? regleDeLEffectif(effectif) : regleParCode(REGLE_EFFECTIF_INCONNU);
    if (!effectifConnu) unitesSansEffectif.push(unite.id);
    unitesParRegle.set(regle.code, (unitesParRegle.get(regle.code) ?? 0) + 1);

    const mentionEffectif = effectifConnu
      ? ''
      : " Effectif de l'unité non renseigné : tranche minimale appliquée.";

    // Les entretiens : le n minimal de la règle, un par ligne.
    for (let rangDansUnite = 1; rangDansUnite <= regle.entretiens.min; rangDansUnite += 1) {
      sessions.push({
        rang: sessions.length + 1,
        rangDansUnite,
        orgUnitId: unite.id,
        orgUnitNom: unite.name,
        kind: 'entretien',
        mode: 'sur_site',
        regle: regle.code,
        justification:
          `§32.4 — ${regle.libelle} Entretien ${String(rangDansUnite)} sur ` +
          `${String(regle.entretiens.min)} au titre du minimum de la règle ` +
          `(fourchette : ${String(regle.entretiens.min)} à ${String(regle.entretiens.max)}).` +
          mentionEffectif,
      });
    }

    // Les sessions complémentaires, dans l'ordre où le §32.4 les énonce.
    for (const complementaire of regle.sessionsComplementaires) {
      for (let rangDansUnite = 1; rangDansUnite <= complementaire.nombre; rangDansUnite += 1) {
        sessions.push({
          rang: sessions.length + 1,
          rangDansUnite,
          orgUnitId: unite.id,
          orgUnitNom: unite.name,
          kind: complementaire.kind,
          // 04 : `mode` n'a de sens que pour un entretien (§32.6).
          mode: null,
          regle: regle.code,
          justification:
            `§32.4 — ${regle.libelle} Session « ${LIBELLES_TYPE_SESSION[complementaire.kind]} » ` +
            `${String(rangDansUnite)} sur ${String(complementaire.nombre)} exigée par la règle.` +
            mentionEffectif,
        });
      }
    }

    parUnite.push({
      orgUnitId: unite.id,
      parentId: unite.parentId,
      nom: unite.name,
      kind: unite.kind,
      effectif: effectifConnu ? effectif : null,
      effectifInconnu: !effectifConnu,
      regle: regle.code,
      entretiens: regle.entretiens,
      sessionsComplementaires: regle.sessionsComplementaires,
      sessionsProposees: regle.entretiens.min + compterComplementaires(regle),
      profilsACouvrir,
    });
  }

  // ── Le bilan règle par règle — les quatre règles, toujours ──────────────
  const reglesAppliquees: readonly ApplicationRegle[] = REGLES_ECHANTILLONNAGE.map((regle) => {
    const unitesConcernees = unitesParRegle.get(regle.code) ?? 0;
    return {
      regle: regle.code,
      libelle: regle.libelle,
      effectifMin: regle.effectifMin,
      effectifMax: regle.effectifMax,
      nMinimalEntretiens: regle.entretiens.min,
      nMaximalEntretiens: regle.entretiens.max,
      sessionsComplementaires: regle.sessionsComplementaires,
      unitesConcernees,
      entretiensProposes: unitesConcernees * regle.entretiens.min,
      sessionsComplementairesProposees: unitesConcernees * compterComplementaires(regle),
    };
  });

  const totalEntretiensMin = parUnite.reduce((total, cible) => total + cible.entretiens.min, 0);
  const totalEntretiensMax = parUnite.reduce((total, cible) => total + cible.entretiens.max, 0);
  const parKind: readonly SessionComplementaire[] = KINDS_DU_PLAN.map((kind) => ({
    kind,
    nombre: sessions.filter((session) => session.kind === kind).length,
  }));

  // ── Les avertissements — ordre fixe, comptes seuls ──────────────────────
  const avertissements: AvertissementPlan[] = [];
  if (retenues.length === 0) {
    avertissements.push({
      code: 'aucune_unite_dans_le_perimetre',
      message:
        "Aucune unité de cette mission n'est à la fois dans le périmètre et active : le plan d'entretiens est vide.",
      orgUnitIds: [],
    });
  }
  if (unitesSansEffectif.length > 0) {
    avertissements.push({
      code: 'effectif_inconnu',
      message:
        `${String(unitesSansEffectif.length)} unité(s) sans effectif exploitable : ` +
        'la tranche minimale du §32.4 leur est appliquée (1 entretien).',
      orgUnitIds: unitesSansEffectif,
    });
  }
  if (horsPerimetre.length > 0) {
    avertissements.push({
      code: 'unites_hors_perimetre_ignorees',
      message:
        `${String(horsPerimetre.length)} unité(s) hors périmètre ne sont pas dimensionnées : ` +
        'leurs données restent conservées (§25.1).',
      orgUnitIds: horsPerimetre.map((unite) => unite.id),
    });
  }
  if (nonActives.length > 0) {
    avertissements.push({
      code: 'unites_non_actives_ignorees',
      message:
        `${String(nonActives.length)} unité(s) proposée(s) ou fusionnée(s) ne sont pas ` +
        "dimensionnées : une unité proposée depuis le terrain doit d'abord être validée (§25.3).",
      orgUnitIds: nonActives.map((unite) => unite.id),
    });
  }
  if (horsMission.length > 0) {
    avertissements.push({
      code: 'unites_hors_mission_ignorees',
      message:
        `${String(horsMission.length)} unité(s) n'appartiennent pas à cette mission ` +
        'et ont été écartées.',
      orgUnitIds: horsMission.map((unite) => unite.id),
    });
  }

  return {
    missionId: mission.id,
    niveauAudit: mission.auditLevel,
    genereLe: entree.genereLe ?? null,
    sessions,
    parUnite,
    reglesAppliquees,
    totaux: {
      unitesRetenues: retenues.length,
      unitesEcartees: horsPerimetre.length + nonActives.length + horsMission.length,
      entretiens: { min: totalEntretiensMin, max: totalEntretiensMax },
      sessionsProposees: sessions.length,
      parKind,
    },
    avertissements,
  };
}
