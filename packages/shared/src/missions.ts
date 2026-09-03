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
// Traçabilité : E39 (Machine à états mission) · E43 (Exécutabilité autopilote —
// conventions d'API), critère n° 3 du lot L3 (fichier 07 :
// « toute transition de statut interdite est rejetée avec motif »).
// =============================================================================
import { z } from 'zod';
import { codePaysSchema } from './companies.js';
import { fuseauIanaSchema, isoUtcSchema } from './temps.js';
import type { ROLES_JOURNALISABLES } from './journal.js';
// Le vocabulaire FERMÉ des motifs (arbitrage Williams du 2026-09-02, « motif
// codé »). `motifs.ts` n'importe rien : l'arête ne peut pas se refermer.
import { MOTIFS_RETOUR_ARRIERE } from './motifs.js';

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
  /**
   * Le motif fourni par le demandeur. `undefined` = aucun motif.
   *
   * ⚠ **`string`, ET NON `MotifRetourArriere` — c'est un choix, pas un oubli.**
   * Depuis l'arbitrage du 2026-09-02, la ROUTE n'accepte plus qu'un code du
   * vocabulaire fermé (`missionStatusRequestSchema`). Mais cette fonction-ci ne
   * juge pas le VOCABULAIRE : elle juge la PRÉSENCE, parce que c'est tout ce dont
   * la machine à états a besoin pour décider, et parce que les deux refus n'ont ni
   * le même statut HTTP ni le même responsable — un motif hors liste est une faute
   * de forme (400, prononcé par Zod, à la frontière), un motif absent est un refus
   * d'état (409, prononcé ici). Narrower ce type déplacerait la validation du
   * vocabulaire dans le juge d'état, c'est-à-dire APRÈS la lecture de la mission :
   * on répondrait 409 à ce qui est un 400.
   */
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

// =============================================================================
// CONTRAT D'API DES MISSIONS — `/v1/missions`. Lot L3, incrément L3b.
//
// Tout ce qui précède est la MACHINE À ÉTATS, pure et sans base. Tout ce qui suit
// est le CONTRAT DE FIL des cinq routes que `docs/conception/LOT_L3.md` §2 nomme :
//   GET   /v1/missions          ┐
//   POST  /v1/missions          │ 05 §8.3 (« CRUD /v1/missions »)
//   GET   /v1/missions/:id      │
//   PATCH /v1/missions/:id      ┘
//   POST  /v1/missions/:id/status   05 §8.3 (« transitions contrôlées »)
//
// Les deux moitiés vivent dans le MÊME fichier parce qu'elles se lisent ensemble :
// `missionStatusRequestSchema` n'a de sens qu'en regard de `TRANSITIONS_MISSION`,
// et la console qui grise un bouton lit les deux dans le même import.
//
// ── CE QUE CE CONTRAT REFUSE À L'APPELANT, ET POURQUOI ───────────────────────
//   · **`status` à la création** : une mission naît en `preparation`, jamais
//     ailleurs. La table des transitions est une CHAÎNE qui part de `preparation`
//     (aucune ligne « avant » ne vise `preparation` — seul un retour arrière depuis
//     `en_cours` y ramène) ; laisser choisir l'état initial permettrait de créer une
//     mission directement `cloturee`, c'est-à-dire de contourner la machine à états
//     par sa porte d'entrée. Le §32.2 dit « toute autre = rejetée » : une création
//     qui saute quatre transitions est exactement cela.
//   · **`status` dans le `PATCH`** : même raison. Le statut a SA route
//     (`POST /:id/status`), qui seule mesure les conditions, exige le motif des
//     retours arrière et écrit la trace `activity_log` que le §32.2 impose. Un
//     `PATCH {status}` serait un contournement silencieux de tout cela.
//   · **`id`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`** : appartiennent
//     au serveur. Une mission n'est pas une entité créable hors ligne (l'invariant 1
//     vise la collecte terrain) ; l'UUID v7 est frappé côté serveur (11 §2).
// Traçabilité : E39 (Machine à états mission) · E24 (Validation obligatoire de
// chaque étape — les codes d'étape §32.2) · E43 (Exécutabilité autopilote —
// conventions d'API) · E30 (3 niveaux d'audit) · E32 (Fuseaux, devises,
// interface française).
// =============================================================================

// -----------------------------------------------------------------------------
// LES ÉNUMÉRATIONS DU 04, TRANSCRITES POUR LE FIL
// -----------------------------------------------------------------------------
//
// Elles doublent celles de `apps/api/src/db/schema.ts`, comme `STATUTS_MISSION`
// le fait déjà plus haut, et pour la même raison : `packages/shared` est importé
// par les DEUX fronts, qui n'ont aucun accès au schéma Drizzle du serveur. La
// source des deux transcriptions reste le fichier 04 (CHECK fermés de `missions`),
// et le `schema:diff` de la CI compare le schéma au 04 — jamais l'un à l'autre.

/** `missions.geo_scope` — périmètre COMMERCIAL de la mission (04 · V2.9). */
export const PERIMETRES_GEO_MISSION = ['france', 'multi_pays'] as const;
export type PerimetreGeoMission = (typeof PERIMETRES_GEO_MISSION)[number];

/** `missions.audit_level` — 03 §20.1 ; clé du gabarit de rapport (§32.6-3). */
export const NIVEAUX_AUDIT_MISSION = [
  'diagnostic_cadrage',
  'operationnel',
  'strategique_groupe',
] as const;
export type NiveauAuditMission = (typeof NIVEAUX_AUDIT_MISSION)[number];

/** `missions.commercial_offer` — NULL légitime (une mission peut n'être vendue sous aucune offre). */
export const OFFRES_COMMERCIALES_MISSION = [
  'audit_flash',
  'audit_cible',
  'mission_pme',
  'mission_eti',
  'grand_programme',
] as const;
export type OffreCommercialeMission = (typeof OFFRES_COMMERCIALES_MISSION)[number];

/** `missions.llm_provider` — DEFAULT 'anthropic' EN BASE (04), jamais dans ce code. */
export const FOURNISSEURS_LLM_MISSION = ['anthropic', 'ue_hosted'] as const;
export type FournisseurLlmMission = (typeof FOURNISSEURS_LLM_MISSION)[number];

/** `org_units.kind` — 03 §26.3, jusqu'à `poste` (brief L3 du fichier 07). */
export const TYPES_UNITE_ORG = [
  'groupe',
  'filiale',
  'etablissement',
  'direction',
  'service',
  'equipe',
  'poste',
] as const;
export type TypeUniteOrg = (typeof TYPES_UNITE_ORG)[number];

/**
 * L'ÉTAT INITIAL d'une mission. `preparation`, et il n'y a pas de choix à faire :
 * c'est le seul statut qu'aucune transition « avant » ne vise (voir
 * `TRANSITIONS_MISSION`), donc le seul point d'entrée possible de la chaîne.
 */
export const STATUT_MISSION_INITIAL: StatutMission = 'preparation';

/**
 * Le `kind` de l'unité racine créée d'office avec la mission (03 §16.2 : « une
 * racine est créée par défaut »).
 *
 * ⚠ **LE PACK NE LE DIT PAS.** `etablissement` est retenu pour deux raisons, et
 * elles sont écrites parce qu'elles sont discutables : (1) c'est ce que porte la
 * fixture canonique FIL-TPE livrée au L1 (`apps/api/tests/aide/fil-rouge.ts`,
 * racine « Établissement unique »), et une valeur par défaut qui contredirait la
 * fixture de référence serait un piège ; (2) c'est le `kind` qui décrit le cas
 * MINIMAL du §16.2 (« boulanger 5 personnes → 1 seule unité racine »), là où
 * `groupe` présumerait d'une structure. La racine par défaut est de toute façon
 * ABSORBÉE par l'import CSV (LOT_L3.md §3c) et renommable au L3c.
 * Candidat `DECISIONS.md` — remonté au rapport de l'incrément.
 */
export const TYPE_UNITE_RACINE_DEFAUT: TypeUniteOrg = 'etablissement';

// -----------------------------------------------------------------------------
// BORNES DE SAISIE
// -----------------------------------------------------------------------------
//
// `missions.title` et `nda_ref` sont des `TEXT` sans borne au fichier 04 : les
// bornes sont donc APPLICATIVES, et elles existent pour la même raison que celles
// de `companies` — refuser une entrée démesurée AVANT la base, sans jamais refuser
// une saisie réelle.

export const TITRE_MISSION_LONGUEUR_MAX = 300;

/** Référence du NDA (§20.2/§27.4) : un identifiant de contrat, pas un texte. */
export const REF_NDA_LONGUEUR_MAX = 128;

// ⚠ `MOTIF_TRANSITION_LONGUEUR_MAX` A DISPARU LE 2026-09-02, et son absence est
// une information. Le motif d'un changement de statut n'est plus une PHRASE dont
// il faudrait borner la longueur : c'est un CODE de `MOTIFS_RETOUR_ARRIERE`
// (arbitrage Williams, `DECISIONS.md` du 2026-09-02). Garder une borne de 2 000
// caractères aurait laissé croire qu'un texte libre est encore attendu quelque
// part — un contrat qui décrit une porte murée est pire qu'un contrat muet.

/**
 * Nombre maximal de codes dans `active_sectors` / `active_blocks`. Borne de
 * VRAISEMBLANCE (8 secteurs et 9 blocs sont seedés), pas une règle métier : elle
 * écarte un JSONB qui gonflerait sans fin, sans jamais borner le référentiel.
 */
export const CODES_ACTIFS_MAX = 100;

/**
 * Un code de référentiel (`sectors.code`, `blocks.code`) tel qu'il est stocké dans
 * les JSONB `active_sectors` / `active_blocks` : minuscules, chiffres, tirets bas.
 * Le seed écrit `services`, `industrie`, `bloc_1` — ce motif les couvre tous.
 *
 * ⚠ **CE SCHÉMA NE VÉRIFIE PAS L'EXISTENCE DU CODE.** Aucune contrainte d'intégrité
 * ne le peut : les deux colonnes sont des JSONB, pas des clés étrangères (04). Un
 * code inconnu passe donc, et c'est le moteur M2 (L3d) qui le rendra visible en ne
 * trouvant aucune question. Le refuser ici exigerait de lire les référentiels
 * depuis un paquet partagé qui n'a pas de base — le contrat le dit plutôt que de
 * laisser croire à une garantie qu'il n'offre pas.
 */
export const codeReferentielSchema = z
  .string()
  .trim()
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9_]{1,64}$/,
        'Un code de référentiel ne contient que des minuscules, des chiffres et des tirets bas.',
      ),
  );

/**
 * Une date CIVILE (`DATE` au fichier 04 : `nda_signed_at`, `start_planned`,
 * `end_planned`), au format `AAAA-MM-JJ`.
 *
 * ⚠ CE N'EST PAS UN HORODATAGE, et les confondre serait une faute de fuseau. Une
 * date de signature de NDA ou de début planifié n'a pas d'heure : la porter en
 * ISO 8601 UTC la ferait basculer d'un jour à l'affichage au fuseau de mission
 * (§22.2) pour tout fuseau à l'ouest de Greenwich. Le 04 écrit `DATE`, l'API rend
 * une date, et le pilote PostgreSQL la transporte telle quelle.
 */
export const dateCivileSchema = z.iso.date();

const titreMissionSchema = z
  .string()
  .trim()
  .pipe(z.string().min(1).max(TITRE_MISSION_LONGUEUR_MAX));

const refNdaSchema = z.string().trim().pipe(z.string().min(1).max(REF_NDA_LONGUEUR_MAX));

/**
 * Les codes tels qu'ils sont RELUS depuis les JSONB `active_sectors` /
 * `active_blocks`.
 *
 * Volontairement plus TOLÉRANT que `codeReferentielSchema` : il n'exige qu'un
 * tableau de chaînes. Une ligne écrite avant ce lot (le seed, une fixture, un
 * import) ne doit pas rendre la mission illisible — un contrat de LECTURE strict
 * transformerait une donnée historique en panne 500 sur une route de consultation.
 * L'écriture, elle, reste stricte : c'est là que la forme se décide. Même geste, et
 * mêmes mots, que `codesPaysStockesSchema`.
 */
export const codesReferentielStockesSchema = z.array(z.string());

// -----------------------------------------------------------------------------
// PARAMÈTRE D'URL
// -----------------------------------------------------------------------------

/** `:id` des trois routes qui visent UNE mission. */
export const missionParamsSchema = z.strictObject({
  id: z.uuid(),
});

export type MissionParams = z.infer<typeof missionParamsSchema>;

// -----------------------------------------------------------------------------
// SORTIE — la seule forme sous laquelle une mission sort de l'API
// -----------------------------------------------------------------------------

/**
 * La mission, telle qu'elle est rendue. `strictObject` : une clé non déclarée est
 * REFUSÉE, pas ignorée — le sérialiseur repasse la réponse par ce schéma.
 *
 * **`deletedAt` n'y figure pas** : aucune route de ce lot ne rend une mission
 * supprimée (toutes les lectures filtrent `deleted_at IS NULL`), le champ ne
 * porterait donc jamais que `null`. Même raisonnement, et mêmes mots, que
 * `companyResponseSchema`.
 *
 * **Aucun champ financier** : `scoping_financials` est réservé à ses routes admin
 * dédiées (invariant 3), et rien de cette table ne transite ici.
 */
export const missionResponseSchema = z.strictObject({
  id: z.uuid(),
  companyId: z.uuid(),
  /** §32.3 — consolidation groupe : la mission mère référence ses filles. */
  parentMissionId: z.uuid().nullable(),
  title: z.string().min(1).max(TITRE_MISSION_LONGUEUR_MAX),
  geoScope: z.enum(PERIMETRES_GEO_MISSION),
  /** V2.9 — une fille de déclinaison garde `multi_pays` ET porte son pays. */
  countryCode: z.string().nullable(),
  sizeTierId: z.uuid().nullable(),
  activeSectors: z.array(z.string()),
  activeBlocks: z.array(z.string()),
  auditLevel: z.enum(NIVEAUX_AUDIT_MISSION),
  commercialOffer: z.enum(OFFRES_COMMERCIALES_MISSION).nullable(),
  /** §22.2 — le fuseau de la mission, hérité par les unités qui n'en portent pas. */
  timezone: z.string().min(1),
  ndaRef: z.string().nullable(),
  ndaSignedAt: dateCivileSchema.nullable(),
  /** Le PIVOT du §32.2. Ne se modifie que par `POST /v1/missions/:id/status`. */
  status: z.enum(STATUTS_MISSION),
  llmProvider: z.enum(FOURNISSEURS_LLM_MISSION),
  startPlanned: dateCivileSchema.nullable(),
  endPlanned: dateCivileSchema.nullable(),
  /** Posé à la PREMIÈRE entrée en `livree`, jamais effacé (invariant 7). */
  deliveredAt: isoUtcSchema.nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: isoUtcSchema,
  updatedAt: isoUtcSchema,
});

export type MissionResponse = z.infer<typeof missionResponseSchema>;

/**
 * La réponse de `POST /v1/missions` — la mission ET l'identifiant de l'unité
 * racine créée d'office (03 §16.2 : « une racine est créée par défaut »).
 *
 * ── POURQUOI L'IDENTIFIANT SEUL, ET PAS L'UNITÉ ENTIÈRE ─────────────────────
 * Le contrat de fil des `org_units` appartient à l'incrément L3c, qui n'est pas
 * écrit. Rendre ici une forme d'unité obligerait L3c soit à la reprendre telle
 * quelle — donc à hériter d'un contrat décidé sans lui — soit à en publier une
 * seconde, et l'API aurait alors DEUX formes d'unité. L'identifiant suffit à
 * l'appelant : il lui permet de renommer la racine dès que L3c expose
 * `PATCH /v1/org-units/:id`.
 */
export const missionCreationResponseSchema = z.strictObject({
  mission: missionResponseSchema,
  uniteRacineId: z.uuid(),
});

export type MissionCreationResponse = z.infer<typeof missionCreationResponseSchema>;

/**
 * La réponse de `POST /v1/missions/:id/status` — la mission après coup, ET ce que
 * la transition a été.
 *
 * `depuis` est rendu parce que l'appelant ne l'avait pas forcément : la console a
 * pu afficher un statut périmé, et ne lui renvoyer que le nouvel état la laisserait
 * ignorer d'où l'on venait — donc incapable de dire à l'utilisateur ce qui vient de
 * se passer. `surchargeUtilisee` dit si une dérogation §17.3 a RÉELLEMENT porté la
 * décision (voir `ResultatTransitionMission`, plus haut dans ce fichier).
 */
export const missionStatusResponseSchema = z.strictObject({
  mission: missionResponseSchema,
  depuis: z.enum(STATUTS_MISSION),
  vers: z.enum(STATUTS_MISSION),
  sens: z.enum(['avant', 'retour']),
  surchargeUtilisee: z.boolean(),
});

export type MissionStatusResponse = z.infer<typeof missionStatusResponseSchema>;

// -----------------------------------------------------------------------------
// ENTRÉES
// -----------------------------------------------------------------------------

/**
 * `POST /v1/missions` — création.
 *
 * ── LES DEUX CHAMPS SANS VALEUR PAR DÉFAUT ICI, ET C'EST VOULU ──────────────
 * `timezone` et `llmProvider` sont OPTIONNELS **sans défaut dans ce schéma**. Le
 * fichier 04 leur en donne un EN BASE (`DEFAULT 'Europe/Paris'`,
 * `DEFAULT 'anthropic'`) ; le recopier ici en ferait une seconde source de vérité,
 * qu'un jour on oublierait de tenir à jour — et surtout, `Europe/Paris` dans une
 * constante TypeScript est exactement le genre de valeur « qui varie par mission »
 * que l'invariant 2 refuse de voir en dur. Quand l'appelant se tait, le dépôt
 * N'ÉCRIT PAS la colonne et PostgreSQL applique le défaut du 04.
 */
export const createMissionRequestSchema = z.strictObject({
  companyId: z.uuid(),
  parentMissionId: z.uuid().nullable().default(null),
  title: titreMissionSchema,
  geoScope: z.enum(PERIMETRES_GEO_MISSION),
  countryCode: codePaysSchema.nullable().default(null),
  sizeTierId: z.uuid().nullable().default(null),
  activeSectors: z.array(codeReferentielSchema).max(CODES_ACTIFS_MAX).default([]),
  activeBlocks: z.array(codeReferentielSchema).max(CODES_ACTIFS_MAX).default([]),
  auditLevel: z.enum(NIVEAUX_AUDIT_MISSION),
  commercialOffer: z.enum(OFFRES_COMMERCIALES_MISSION).nullable().default(null),
  timezone: fuseauIanaSchema.optional(),
  ndaRef: refNdaSchema.nullable().default(null),
  ndaSignedAt: dateCivileSchema.nullable().default(null),
  llmProvider: z.enum(FOURNISSEURS_LLM_MISSION).optional(),
  startPlanned: dateCivileSchema.nullable().default(null),
  endPlanned: dateCivileSchema.nullable().default(null),
});

export type CreateMissionRequest = z.infer<typeof createMissionRequestSchema>;

/**
 * `PATCH /v1/missions/:id` — modification.
 *
 * `undefined` = « ne touche pas » · `null` = « efface ». Les confondre rendrait
 * impossible de retirer une référence de NDA saisie par erreur — et l'invariant 7
 * (« toute correction est une révision tracée ») suppose que la correction soit
 * possible par l'API.
 *
 * **`status` est ABSENT de cette liste, et c'est la garantie centrale de ce lot** :
 * `strictObject` REFUSE une clé non déclarée, donc `PATCH {status}` sort en 400
 * sans jamais atteindre le service. La machine à états n'a ainsi qu'une seule
 * porte, `POST /:id/status` — celle qui mesure les conditions, exige le motif des
 * retours arrière et écrit la trace du §32.2.
 *
 * **`companyId` est absent aussi** : rattacher une mission à une AUTRE entreprise
 * après coup invaliderait tout ce qui en dépend (arbre, questionnaire figé,
 * scoring) sans qu'aucune section du pack ne dise ce qu'il faudrait en faire.
 */
export const updateMissionRequestSchema = z
  .strictObject({
    parentMissionId: z.uuid().nullable().optional(),
    title: titreMissionSchema.optional(),
    geoScope: z.enum(PERIMETRES_GEO_MISSION).optional(),
    countryCode: codePaysSchema.nullable().optional(),
    sizeTierId: z.uuid().nullable().optional(),
    activeSectors: z.array(codeReferentielSchema).max(CODES_ACTIFS_MAX).optional(),
    activeBlocks: z.array(codeReferentielSchema).max(CODES_ACTIFS_MAX).optional(),
    auditLevel: z.enum(NIVEAUX_AUDIT_MISSION).optional(),
    commercialOffer: z.enum(OFFRES_COMMERCIALES_MISSION).nullable().optional(),
    timezone: fuseauIanaSchema.optional(),
    ndaRef: refNdaSchema.nullable().optional(),
    ndaSignedAt: dateCivileSchema.nullable().optional(),
    llmProvider: z.enum(FOURNISSEURS_LLM_MISSION).optional(),
    startPlanned: dateCivileSchema.nullable().optional(),
    endPlanned: dateCivileSchema.nullable().optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: 'Indiquez au moins un champ à modifier.',
  });

export type UpdateMissionRequest = z.infer<typeof updateMissionRequestSchema>;

/**
 * `POST /v1/missions/:id/status` — LA porte de la machine à états.
 *
 * Le vocabulaire est celui de `DemandeTransitionMission`, plus haut dans ce même
 * fichier : `vers`, `motif`, `surcharge`. Écrire `newStatus` ici obligerait à
 * traduire d'un bout à l'autre du chemin, et une traduction est un endroit où l'on
 * se trompe. `depuis` n'est PAS demandé : il est LU sous verrou sur la ligne, parce
 * qu'un `depuis` fourni par l'appelant serait une supposition que la base pourrait
 * démentir entre l'affichage de l'écran et le clic.
 *
 * `motif` est déclaré optionnel ICI et exigé PAR LA TABLE : sa nécessité dépend de
 * la transition visée (obligatoire sur les trois retours arrière, obligatoire aussi
 * dès qu'une surcharge §17.3 est mobilisée). Zod ne peut pas trancher cela sans
 * connaître l'état courant de la mission — c'est donc le service qui refuse.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * `motif` EST UN CODE, PLUS UNE PHRASE — arbitrage Williams du 2026-09-02.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `DECISIONS.md`, « Le motif d'un retour arrière et d'une réaffectation est un
 * CODE, pas un texte » : vocabulaire fermé (`MOTIFS_RETOUR_ARRIERE`), pas de texte
 * libre, et la valeur codée part telle quelle dans `activity_log.meta`.
 *
 * **DEUX REFUS QUI NE SE CONFONDENT PAS, ET LA FRONTIÈRE EST ICI :**
 *   · motif **ABSENT** sur une transition qui l'exige → **409
 *     `ILLEGAL_STATE_TRANSITION`** (arbitrage A01 du 2026-09-01) : ce n'est pas la
 *     requête qui est mal écrite, c'est l'ÉTAT de la mission qui exige qu'on dise
 *     pourquoi. Ce refus vient du service, jamais de Zod — d'où le `.optional()` ;
 *   · motif **HORS VOCABULAIRE** → **400 `VALIDATION_FAILED`**, prononcé par cette
 *     ligne : un code inconnu est une faute de FORME, au même titre qu'un `vers`
 *     qui ne serait pas un statut. Le service ne le voit jamais.
 */
export const missionStatusRequestSchema = z.strictObject({
  vers: z.enum(STATUTS_MISSION),
  motif: z.enum(MOTIFS_RETOUR_ARRIERE).optional(),
  /**
   * L'admin demande-t-il explicitement de FORCER (03 §17.3) ? Jamais implicite :
   * une transition ne se force pas « parce qu'on est admin ». Défaut `false`.
   */
  surcharge: z.boolean().default(false),
});

export type MissionStatusRequest = z.infer<typeof missionStatusRequestSchema>;

// =============================================================================
// LIBELLÉS FRANÇAIS DES ÉTATS — DONNÉE PARTAGÉE, PAS CHAÎNE RECOPIÉE
// =============================================================================
// Ce dictionnaire vivait dans `apps/api/src/domaines/missions/service.ts`, où il
// est né avec le message de refus de transition. Il est monté ici le 2026-09-01
// sur constat du testeur A16 (`DECISIONS.md`, « Où vivent les libellés français
// des états de mission ? »).
//
// LE MOTIF, ET IL N'EST PAS COSMÉTIQUE. La console (L7) affichera ces mêmes
// états. Si le libellé reste côté API, elle en écrira une seconde version — et
// le jour où les deux diffèrent, c'est l'auditeur qui lit deux mots pour une
// seule chose, sans que rien ne signale la dérive. C'est le raisonnement déjà
// tenu pour `TRANSITIONS_MISSION` : une donnée partagée, jamais un `if` recopié.
// Le 11 §3 impose que « le front importe LES MÊMES schémas » ; un libellé d'état
// est du même ordre.
//
// C'est un DICTIONNAIRE D'AFFICHAGE : il ne dit rien de ce qui est permis, il
// traduit un identifiant technique en français (invariant 5). Écrire « la
// transition preparation → en_cours est refusée » exposerait le vocabulaire de la
// base ; le §32.2 lui-même parle de « Préparation » et de « Collecte ».
//
// `Record<StatutMission, string>` est EXHAUSTIF PAR LE TYPE : ajouter un sixième
// statut au 04 ne compilera plus tant que son libellé manque. C'est le garde-fou
// qui remplace la vigilance.
// =============================================================================
export const LIBELLES_STATUT_MISSION: Record<StatutMission, string> = {
  preparation: 'préparation',
  en_cours: 'collecte en cours',
  en_analyse: 'analyse',
  livree: 'livrée',
  cloturee: 'clôturée',
};
