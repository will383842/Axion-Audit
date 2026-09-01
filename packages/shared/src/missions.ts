// =============================================================================
// MACHINE À ÉTATS DE MISSION — lot L3, incrément L3b. **CONTRAT SEUL.**
//
// `docs/conception/LOT_L3.md` §3b : « La machine à états est une DONNÉE. »
// `TRANSITIONS_MISSION` est un tableau figé transcrit LIGNE À LIGNE du 03 §32.2 ;
// aucun `if` de transition ne vit ailleurs. Le présent fichier porte le contrat
// (types, noms, signatures) ; le corps est écrit par un AUTRE agent que celui qui
// écrit les tests (09 §5.6), et les tests sont écrits AVANT (09 §3-2).
//
// ── POURQUOI CE FICHIER EST DANS `packages/shared` ───────────────────────────
// La console (`apps/hq`) doit savoir, SANS appeler l'API, quelles transitions
// proposer à l'écran et lesquelles griser — sinon elle réimplémenterait la table
// et les deux dériveraient. Le contrat 11 §3 l'impose déjà pour les schémas ; la
// table des transitions est de la même nature : une DONNÉE de contrat, pas une
// règle serveur cachée. **Ce que ce fichier ne fait PAS** : lire la base. Les
// conditions arrivent déjà ÉVALUÉES (voir `EtatConditionsMission`) ; c'est le
// service `apps/api` qui les mesure sur `step_validations`, `mission_questions`
// et le plan. Un `CHECK` SQL ou un trigger ne le pourrait pas, et ferait vivre la
// règle métier hors de la couche typée.
// Traçabilité : E43 (conventions d'API), critère n° 3 du lot L3 (fichier 07 :
// « toute transition de statut interdite est rejetée avec motif »).
// =============================================================================
import type { ROLES_JOURNALISABLES } from './journal.js';

/** Les cinq valeurs de `missions.status` (04, CHECK fermé). Ordre = 03 §32.2. */
export const STATUTS_MISSION = [
  'preparation',
  'en_cours',
  'en_analyse',
  'livree',
  'cloturee',
] as const;

export type StatutMission = (typeof STATUTS_MISSION)[number];

/** Le rôle GLOBAL de l'utilisateur (`users.role`) — jamais `role_on_mission`. */
export type RoleMission = (typeof ROLES_JOURNALISABLES)[number];

/**
 * Les conditions nommées par le 03 §32.2, une par code.
 *
 * Chaque code est une PHRASE DU PACK, pas une invention : `etape_*_validee`
 * renvoie à `step_validations.step_code` (énumération fermée du 04) ;
 * `questionnaire_fige` à l'existence de lignes `mission_questions` ;
 * `plan_entretiens_etabli`, `export_realise` et `retrospective_faite` à des
 * fonctionnalités dont le support n'est pas livré en Phase 1 — voir
 * `EtatConditionsMission` pour ce que cela entraîne, qui est le point délicat.
 */
export const CODES_CONDITION_MISSION = [
  'etape_cadrage_validee',
  'etape_preparation_validee',
  'questionnaire_fige',
  'plan_entretiens_etabli',
  'etape_collecte_validee',
  'export_realise',
  'etape_livraison_validee',
  'retrospective_faite',
] as const;

export type CodeConditionMission = (typeof CODES_CONDITION_MISSION)[number];

/** Une ligne de la table des transitions — la forme fixée par LOT_L3.md §3b. */
export interface TransitionMission {
  readonly depuis: StatutMission;
  readonly vers: StatutMission;
  /** `avant` = progression du 03 §32.2 ; `retour` = retour arrière admin. */
  readonly sens: 'avant' | 'retour';
  /** Les rôles GLOBAUX autorisés à demander cette transition. */
  readonly roles: readonly RoleMission[];
  readonly conditions: readonly CodeConditionMission[];
  /** Un motif est-il OBLIGATOIRE dans la demande ? (tous les retours arrière). */
  readonly motifRequis: boolean;
  /**
   * L'admin peut-il FORCER cette transition malgré des conditions non remplies,
   * en fournissant un motif ? 03 §32.2 le nomme pour `en_cours → en_analyse` ;
   * 03 §17.3 l'étend à « passer en analyse OU livrée ». Les deux sections ne se
   * contredisent pas (l'une est muette là où l'autre parle) : la règle de
   * précédence est donc sans objet et les deux s'appliquent.
   */
  readonly surchargeAdminMotivee: boolean;
}

/**
 * L'état MESURÉ des conditions, au moment de la demande.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNE CONDITION ABSENTE N'EST PAS UNE CONDITION FAUSSE — ET C'EST TOUT LE SUJET
 * ═══════════════════════════════════════════════════════════════════════════════
 * 03 §17.2 (V2.9), verbatim : « une condition dont la fonctionnalité porteuse
 * n'est pas livrée est RÉPUTÉE SATISFAITE, jamais un verrou sur une feature
 * absente ». Une clé ABSENTE de `evaluees` signifie donc « non évaluable
 * aujourd'hui » et vaut SATISFAITE ; seul un `false` EXPLICITE bloque.
 *
 * C'est délibérément l'inverse du réflexe défensif. Le motif est écrit plutôt que
 * supposé : `plan_entretiens_etabli` n'a AUCUNE table où se poser (DECISIONS.md du
 * 2026-08-29, « les quatre routes hors §8/§24.2 » — `/apply` est reportée faute de
 * support au fichier 04), et `export_realise` appartient à L7-min. Les traiter
 * comme fausses rendrait `preparation → en_cours` et `en_analyse → livree`
 * DÉFINITIVEMENT infranchissables, c'est-à-dire que le produit se verrouillerait
 * sur l'absence d'une fonctionnalité au lieu de s'en passer.
 */
export interface EtatConditionsMission {
  readonly evaluees: Readonly<Partial<Record<CodeConditionMission, boolean>>>;
}

/** Pourquoi une demande de transition est refusée. Un seul motif à la fois. */
export type MotifRefusTransition =
  /** Le couple (depuis, vers) n'est pas dans `TRANSITIONS_MISSION`. */
  | 'transition_inexistante'
  /** Le rôle global du demandeur n'est pas dans `roles`. */
  | 'role_insuffisant'
  /** `motifRequis` (ou une surcharge) exige un motif, il manque ou il est vide. */
  | 'motif_manquant'
  /** Au moins une condition est explicitement `false` et rien ne la couvre. */
  | 'conditions_non_remplies';

export interface DemandeTransitionMission {
  readonly depuis: StatutMission;
  readonly vers: StatutMission;
  readonly role: RoleMission;
  /** Le motif fourni par le demandeur. `undefined` = aucun motif. */
  readonly motif?: string;
  /** L'admin demande-t-il explicitement de FORCER (03 §17.3) ? */
  readonly surcharge?: boolean;
  readonly conditions: EtatConditionsMission;
}

export type ResultatTransitionMission =
  | {
      readonly ok: true;
      readonly transition: TransitionMission;
      readonly surchargeUtilisee: boolean;
    }
  | {
      readonly ok: false;
      readonly motifRefus: MotifRefusTransition;
      /** Les conditions explicitement fausses. Vide pour les autres motifs. */
      readonly conditionsNonRemplies: readonly CodeConditionMission[];
    };

/**
 * LA TABLE. Sept lignes : quatre transitions « avant » (03 §32.2), trois retours
 * arrière admin motivés, et `cloturee` qui n'apparaît JAMAIS en `depuis` — c'est
 * ainsi, et seulement ainsi, que « `cloturee` est TERMINAL » est exprimé.
 */
export const TRANSITIONS_MISSION: readonly TransitionMission[] = [
  // ── LES QUATRE PROGRESSIONS (03 §32.2, dans l'ordre du cycle de vie) ────────
  {
    depuis: 'preparation',
    vers: 'en_cours',
    sens: 'avant',
    // Les rôles ne sont PAS une lecture directe du §32.2, qui ne les nomme que
    // pour les retours. DECISIONS.md 2026-08-31, « Qui a le droit de faire
    // AVANCER une mission ? », option 2 : la TABLE porte la règle métier durable
    // (retours = admin seul, avances ouvertes à l'équipe de mission), la ROUTE
    // porte la restriction V1 « console = admin seul » (§34.1) dans son
    // `config.acces`. Même partage qu'`auth/politique.ts` : la politique de route
    // dit QUI ENTRE, pas CE QUE LE SQL RAMÈNE. `analyste` et `lecteur` ne
    // figurent nulle part : §34.1 ne leur accorde que de la lecture.
    roles: ['admin', 'consultant'],
    conditions: [
      'etape_cadrage_validee',
      'etape_preparation_validee',
      'questionnaire_fige',
      'plan_entretiens_etabli',
    ],
    motifRequis: false,
    // FAUX, et c'est la ligne où l'écrire compte le plus. DECISIONS.md
    // 2026-08-31, « Le pouvoir de FORCER une transition » : rendre ce passage
    // forçable laisserait un admin lancer une collecte SANS questionnaire figé —
    // le terrain partirait avec zéro question, et tout le dispositif de figeage
    // (LOT_L3.md §3a) deviendrait décoratif. Le §17.3 ne nomme que « en analyse »
    // et « livrée » ; ce silence-ci est un refus, pas un oubli.
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_cours',
    vers: 'en_analyse',
    sens: 'avant',
    roles: ['admin', 'consultant'],
    conditions: ['etape_collecte_validee'],
    motifRequis: false,
    // La seule surcharge que le §32.2 nomme lui-même : « étape collecte validée,
    // OU override admin motivé ».
    surchargeAdminMotivee: true,
  },
  {
    depuis: 'en_analyse',
    vers: 'livree',
    sens: 'avant',
    roles: ['admin', 'consultant'],
    // DEUX conditions, pas une : « export réalisé + validation humaine de
    // livraison » (§32.2) est une conjonction, et les deux moitiés se mesurent
    // sur des objets différents — l'export sur son artefact, la validation sur
    // `step_validations('livraison')`. Les fondre en un seul code ferait
    // disparaître la validation HUMAINE, qui est précisément ce que le pack
    // refuse de laisser dériver vers un contrôle automatique.
    conditions: ['export_realise', 'etape_livraison_validee'],
    motifRequis: false,
    // VRAI par le §17.3 (« passer en analyse OU LIVRÉE […] l'admin peut forcer,
    // avec motif journalisé »), là où le §32.2 est muet. Muet n'est pas
    // contraire : la règle de précédence §32-36 > §16-22 ne s'arme que sur une
    // divergence, et il n'y en a pas — DECISIONS.md 2026-08-31, « Le pouvoir de
    // FORCER une transition », option 3.
    surchargeAdminMotivee: true,
  },
  {
    depuis: 'livree',
    vers: 'cloturee',
    sens: 'avant',
    roles: ['admin', 'consultant'],
    conditions: ['retrospective_faite'],
    motifRequis: false,
    // Non forçable : `cloturee` est l'état dont on ne revient JAMAIS. Passer
    // outre sa seule condition rendrait l'erreur définitive, et le §17.3 ne
    // nomme pas ce passage.
    surchargeAdminMotivee: false,
  },

  // ── LES TROIS RETOURS ARRIÈRE (03 §32.2 : « admin uniquement, motif ─────────
  // ── obligatoire, tracés `activity_log` ») ───────────────────────────────────
  // `roles: ['admin']` est ici une lecture LITTÉRALE du pack, contrairement aux
  // quatre lignes ci-dessus. `motifRequis: true` porte l'invariant 7 (« toute
  // correction de donnée = révision tracée ») : sans motif, la ligne
  // `activity_log` dirait QU'ON est revenu en arrière, jamais POURQUOI.
  // Aucune condition : défaire ne se mérite pas, il se justifie.
  // Non surchargeables — il n'y a rien à outrepasser quand `conditions` est vide,
  // et un drapeau vrai sur une ligne sans garde ne serait qu'un mensonge de plus
  // dans le journal.
  {
    depuis: 'en_cours',
    vers: 'preparation',
    sens: 'retour',
    roles: ['admin'],
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'en_analyse',
    vers: 'en_cours',
    sens: 'retour',
    roles: ['admin'],
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
  {
    depuis: 'livree',
    vers: 'en_analyse',
    sens: 'retour',
    roles: ['admin'],
    conditions: [],
    motifRequis: true,
    surchargeAdminMotivee: false,
  },
  // Et rien de plus. `cloturee` n'apparaît en `depuis` sur AUCUNE ligne : c'est
  // l'absence, et elle seule, qui exprime « TERMINAL » (§32.2 : « jamais rouvert ;
  // suite = ré-audit, nouvelle mission §6.4 »). Un drapeau `terminal: true` serait
  // une seconde source de vérité, qu'un jour on oublierait de tenir à jour.
];

/**
 * La liste vide rendue par TOUS les refus qui ne portent pas sur les conditions.
 *
 * Le contrat l'exige (« Vide pour les autres motifs ») et ce n'est pas une
 * coquetterie : un refus `role_insuffisant` qui transporterait les manques
 * apprendrait à un lecteur l'état d'avancement d'une mission qu'il n'a pas le
 * droit de faire avancer — une fuite d'information autant qu'un message inutile.
 */
const AUCUNE_CONDITION: readonly CodeConditionMission[] = [];

/**
 * Un motif est-il RÉELLEMENT fourni ?
 *
 * `.trim()` et non une simple présence : un motif obligatoire qui accepte `'   '`
 * n'est pas obligatoire, c'est un champ qu'on valide à la barre d'espace. La trace
 * `activity_log` exigée par le §32.2 ne porterait alors plus rien.
 */
function motifFourni(motif: string | undefined): boolean {
  return motif !== undefined && motif.trim().length > 0;
}

/**
 * Rend la ligne du couple, ou `undefined` s'il n'existe pas.
 * Fonction de LECTURE : elle ne juge ni le rôle, ni les conditions.
 */
export function transitionMission(
  depuis: StatutMission,
  vers: StatutMission,
): TransitionMission | undefined {
  // Une RECHERCHE dans la table, jamais un `switch` sur les statuts : aucune des
  // deux fonctions de ce fichier ne connaît un statut par son nom (LOT_L3.md §3b,
  // « aucun `if` de transition ailleurs »). C'est ce qui garantit que la console
  // et l'API lisent la même règle — celle de la donnée, pas celle du code.
  // A4 impose l'unicité du couple : `find` peut donc rendre la première ligne
  // sans que l'ordre du tableau porte la moindre sémantique.
  return TRANSITIONS_MISSION.find((ligne) => ligne.depuis === depuis && ligne.vers === vers);
}

/**
 * Juge une demande de transition. **Fonction PURE** : aucune base, aucune horloge.
 *
 * L'ordre des refus est significatif et doit être stable — il décide de ce que
 * l'utilisateur lit en premier : existence du couple, puis rôle, puis motif, puis
 * conditions. Refuser sur les conditions une transition qui n'existe pas
 * apprendrait au demandeur des conditions qui ne le concernent pas.
 */
export function evaluerTransitionMission(
  demande: DemandeTransitionMission,
): ResultatTransitionMission {
  // 1. EXISTENCE. Les identités (`preparation → preparation`, …) tombent ici avec
  //    tout le reste : le §32.2 ne les nomme pas, et sa phrase de fermeture
  //    (« toute autre = rejetée avec motif ») couvre littéralement ce qui n'est
  //    pas listé. Un changement de statut qui ne change rien n'est pas une
  //    transition, c'est un clic — l'autoriser écrirait une ligne `activity_log`
  //    pour un non-événement.
  const transition = transitionMission(demande.depuis, demande.vers);
  if (transition === undefined) {
    return {
      ok: false,
      motifRefus: 'transition_inexistante',
      conditionsNonRemplies: AUCUNE_CONDITION,
    };
  }

  // 2. RÔLE. Avant le motif : suggérer à un consultant de motiver un retour
  //    arrière qui lui sera de toute façon refusé serait lui faire perdre un
  //    aller-retour pour rien.
  if (!transition.roles.includes(demande.role)) {
    return { ok: false, motifRefus: 'role_insuffisant', conditionsNonRemplies: AUCUNE_CONDITION };
  }

  // La surcharge est MOBILISÉE — pas encore utilisée — quand les trois conditions
  // de forme sont réunies : la ligne l'autorise (§17.3, deux passages nommés), le
  // demandeur est administrateur, et il la réclame explicitement. Rien n'est
  // implicite : une transition ne se force jamais « parce qu'on est admin ».
  // Pour un NON-admin, la demande de surcharge est simplement SANS EFFET, et
  // c'est délibéré : un consultant qui la réclame sur une condition fausse doit
  // lire ce qui MANQUE (`conditions_non_remplies`), pas ce qu'il N'EST PAS
  // (`role_insuffisant`) — il a bien le droit de demander le passage, ce qu'il
  // n'a pas est celui de passer outre les manques.
  const surchargeMobilisee =
    transition.surchargeAdminMotivee && demande.role === 'admin' && demande.surcharge === true;

  // 3. MOTIF. Exigé par la ligne (tous les retours arrière) OU par la surcharge :
  //    « l'admin peut forcer, AVEC motif journalisé » (§17.3) — forcer sans dire
  //    pourquoi est exactement ce que cette phrase interdit. Ce refus précède
  //    celui des conditions parce qu'un admin qui force SAIT que les conditions
  //    manquent : lui répondre « conditions non remplies » lui cacherait qu'il
  //    lui suffit de motiver, et rendrait la dérogation du §17.3 inatteignable.
  if ((transition.motifRequis || surchargeMobilisee) && !motifFourni(demande.motif)) {
    return { ok: false, motifRefus: 'motif_manquant', conditionsNonRemplies: AUCUNE_CONDITION };
  }

  // 4. CONDITIONS. On ne lit QUE les conditions de cette ligne : parcourir tout
  //    `evaluees` rendrait chaque transition dépendante de l'état de toutes les
  //    autres. Et on ne retient que le `false` EXPLICITE — une clé absente vaut
  //    SATISFAITE (03 §17.2 V2.9, voir `EtatConditionsMission`). C'est l'inverse
  //    du réflexe défensif, et l'écrire ainsi est le seul moyen que
  //    `preparation → en_cours` reste franchissable en Phase 1, où
  //    `plan_entretiens_etabli` n'a aucune table où se poser.
  //    TOUTES les fausses sont énumérées, jamais la première seule (LOT_L3.md
  //    §3b) : s'arrêter au premier manque imposerait à l'utilisateur autant
  //    d'allers-retours qu'il y a de manques.
  const conditionsNonRemplies = transition.conditions.filter(
    (code) => demande.conditions.evaluees[code] === false,
  );

  if (conditionsNonRemplies.length > 0) {
    if (!surchargeMobilisee) {
      return { ok: false, motifRefus: 'conditions_non_remplies', conditionsNonRemplies };
    }
    // La surcharge a effectivement PORTÉ la décision : sans elle, ce refus-ci
    // sortait. C'est le seul cas où le drapeau se lève.
    return { ok: true, transition, surchargeUtilisee: true };
  }

  // `surchargeUtilisee: false` MÊME quand `surcharge: true` était demandé : les
  // conditions passaient de toute façon, aucune règle n'a été pliée. Lecture
  // retenue par A16 et conservée ici — le pack nomme le pouvoir de forcer (§17.3)
  // et jamais la sémantique du drapeau ; c'est nous qui l'écrivons. C'est la seule
  // qui le rende informatif : un drapeau qui suivrait la DEMANDE au lieu de
  // l'EFFET ferait compter aux revues d'audit des dérogations qui n'ont pas eu
  // lieu, et le journal mentirait dans le sens le plus coûteux — celui qui
  // banalise la dérogation.
  return { ok: true, transition, surchargeUtilisee: false };
}
